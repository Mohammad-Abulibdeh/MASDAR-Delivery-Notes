/**
 * Opens tests/file-protocol-check.html from disk (file://) in headless Edge/Chrome
 * and reports whether IndexedDB + PDF generation work without any web server.
 *   node tests/file-protocol-check.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = candidates.find((p) => fs.existsSync(p));
// Optional: node tests/file-protocol-check.js <html file> "<js expression returning 'RESULT…' when done>"
const page = 'file:///' + path.resolve(__dirname, process.argv[2] || 'file-protocol-check.html').replace(/\\/g, '/').replace(/ /g, '%20');
const EXPR = process.argv[3] || "document.getElementById('out').textContent";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'masdar-check-'));
const port = 9300 + Math.floor(Math.random() * 500);

const proc = spawn(browser, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, page], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch (_) { /* not up yet */ }
  }
  if (!target) throw new Error('browser did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const call = (method, params) => new Promise((resolve) => {
    const myId = ++id;
    const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id === myId) { ws.removeEventListener('message', onMsg); resolve(m.result); } };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  let text = '';
  for (let i = 0; i < 60; i++) {
    const r = await call('Runtime.evaluate', { expression: EXPR, awaitPromise: true });
    text = r.result.value || '';
    if (text.startsWith('RESULT')) break;
    await sleep(250);
  }
  console.log(text);
  ws.close();
})().catch((e) => console.error('CHECK FAILED', e.message)).finally(() => {
  proc.kill();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* locked */ } process.exit(0); }, 800);
});
