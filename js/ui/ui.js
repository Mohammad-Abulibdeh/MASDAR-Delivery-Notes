/** Shared UI helpers: DOM, icons, toasts, dialogs, PDF actions. */
(function (root) {
  'use strict';
  const M = root.Masdar;
  const { t } = M.I18n;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = M.Format.escapeHtml;

  // Stroke icons (24x24, currentColor)
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
    truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    scale: '<path d="M12 3v18M5 21h14"/><path d="M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    file: '<path d="M14 3H6v18h12V7l-4-4z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  function icon(name, cls = '') {
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  }

  // ---------------------------------------------------------------- toasts
  function toast(message, type = 'success', ms = 3200) {
    let host = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'info' ? 'sparkle' : 'check')}<span>${esc(message)}</span>`;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => {
      el.classList.remove('is-in');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 600);
    }, ms);
  }

  // ---------------------------------------------------------------- dialog
  function confirmDialog({ title, body, confirmText = t('act.confirm'), cancelText = t('act.cancel'), danger = false }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = `
        <div class="modal__backdrop" data-close></div>
        <div class="modal__card" role="dialog" aria-modal="true" aria-labelledby="mdl-t">
          <div class="modal__icon ${danger ? 'is-danger' : ''}">${icon(danger ? 'trash' : 'alert')}</div>
          <h3 id="mdl-t">${esc(title)}</h3>
          <p>${esc(body)}</p>
          <div class="modal__actions">
            <button class="btn btn--ghost" data-close>${esc(cancelText)}</button>
            <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok>${esc(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('is-open'));
      const finish = (v) => {
        wrap.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => wrap.remove(), 250);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') finish(false); };
      document.addEventListener('keydown', onKey);
      wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => finish(false)));
      wrap.querySelector('[data-ok]').addEventListener('click', () => finish(true));
      wrap.querySelector('[data-ok]').focus();
    });
  }

  // ---------------------------------------------------------------- PDF service
  let generator = null;
  function getGenerator() {
    if (!generator) {
      generator = M.PdfGenerator.createGenerator({
        PDFLib: root.PDFLib, fontkit: root.fontkit, assets: root.MASDAR_ASSETS,
      });
    }
    return generator;
  }

  async function pdfBlob(note) {
    const bytes = await getGenerator().generate(note);
    return new Blob([bytes], { type: 'application/pdf' });
  }

  async function downloadPdf(note) {
    const blob = await pdfBlob(note);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getGenerator().fileName(note);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return M.Storage.markPrinted(note.id, { kind: 'download' });
  }

  /**
   * Print the real PDF (not the web page).
   *  - http(s): hidden same-origin frame -> the print dialog opens directly.
   *  - file:// (index.html opened from disk): browsers isolate the PDF, so the
   *    document opens in a new tab (opened synchronously, before any await, so it is
   *    never blocked) and is printed from the PDF viewer's print button / Ctrl+P.
   */
  async function printPdf(note) {
    if (root.location.protocol === 'file:') {
      const w = root.open('', '_blank');
      if (!w) return downloadPdf(note); // pop-up blocked -> save the PDF instead of leaving the app
      try {
        w.document.write(`<title>${esc(note.number)}</title><p style="font:16px sans-serif;padding:24px">…</p>`);
        const blob = await pdfBlob(note);
        const url = URL.createObjectURL(blob);
        w.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 120000);
        toast(t('print.newTab'), 'info', 5000);
      } catch (err) { w.close(); throw err; }
      return M.Storage.markPrinted(note.id, { kind: 'print' });
    }
    const blob = await pdfBlob(note);
    const url = URL.createObjectURL(blob);
    const old = $('#print-frame');
    if (old) old.remove();
    const frame = document.createElement('iframe');
    frame.id = 'print-frame';
    frame.className = 'print-frame';
    frame.src = url;
    document.body.appendChild(frame);
    await new Promise((resolve) => {
      frame.onload = () => {
        setTimeout(() => {
          try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {
            root.open(url, '_blank');
          }
          resolve();
        }, 300);
      };
    });
    return M.Storage.markPrinted(note.id, { kind: 'print' });
  }

  function statusChip(note) {
    const s = M.Notes.status(note);
    return `<span class="chip chip--${s}">${esc(t('st.' + s))}</span>`;
  }

  function errorMessage(err) {
    if (err && err.code && M.I18n.t('err.' + err.code) !== 'err.' + err.code) return t('err.' + err.code);
    console.error(err);
    return t('err.generic');
  }

  /** Animate a number counting up (micro-interaction for stats). */
  function countUp(el, to, decimals = 0) {
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(to)) { el.textContent = to.toFixed(decimals); return; }
    const dur = 700;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * e).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** ISO timestamp -> "12/11/2026 21:01" in local time (same format in AR and EN). */
  function stamp(iso) {
    if (!iso) return '';
    const s = M.Format.localStamp(new Date(iso));
    return `${M.Format.uiDate(s.date)} ${M.Format.uiTime(s.time)}`;
  }

  M.UI = { $, $$, esc, icon, stamp, toast, confirmDialog, getGenerator, pdfBlob, downloadPdf, printPdf, statusChip, errorMessage, countUp };
})(self);
