/**
 * Functional tests for numbering, storage, editing, settings, backup and PDF output.
 *   node tests/run-tests.js
 * Uses fake-indexeddb (an in-memory, spec-compliant IndexedDB) so the exact same
 * storage code that runs in the browser is exercised here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { IDBFactory } = require('fake-indexeddb');
require('fake-indexeddb/auto');

const F = require('../js/core/format.js');
const Notes = require('../js/core/delivery-notes.js');
const Storage = require('../js/core/storage.js');
const Shaper = require('../js/core/arabic-shaper.js');
const PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { createGenerator } = require('../js/core/pdf-generator.js');

let passed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push(`  ✔ ${name}`); }
  catch (e) { results.push(`  ✘ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); process.exitCode = 1; }
}
const at = (s) => new Date(s);                       // local time
const fresh = () => Storage.useIndexedDB(new IDBFactory());
const v = (o = {}) => Object.assign({ driverName: 'خالد احمد سعد العيسى', plateNumber: '6088385', tareKg: 22780, grossKg: 77000 }, o);

(async () => {
  // ---------------------------------------------------------------- format / calc
  await test('net weight = gross - tare, exact decimals (77 - 22.78 = 54.22)', () => {
    const r = Notes.validate({ driverName: 'خالد', plateNumber: '6088385', tare: '22.78', gross: '77' });
    assert.ok(r.ok); assert.strictEqual(r.values.netKg, 54220); assert.strictEqual(F.formatKgAsTons(r.values.netKg), '54.22');
    const r2 = Notes.validate({ driverName: 'خالد', plateNumber: '1', tare: '0.1', gross: '0.3' });
    assert.strictEqual(F.formatKgAsTons(r2.values.netKg), '0.2');   // not 0.19999999
    assert.strictEqual(F.formatKgAsTons(Notes.validate({ driverName: 'abc', plateNumber: '1', tare: '10.005', gross: '40.5' }).values.netKg), '30.495');
  });
  await test('validation rejects missing, negative, zero, too heavy, gross <= tare', () => {
    const e = (o) => Notes.validate(Object.assign({ driverName: 'خالد', plateNumber: '123', tare: '20', gross: '60' }, o)).errors;
    assert.strictEqual(e({ driverName: '' }).driverName, 'err.required');
    assert.strictEqual(e({ plateNumber: '' }).plateNumber, 'err.required');
    assert.strictEqual(e({ tare: '-5' }).tare, 'err.negative');
    assert.strictEqual(e({ tare: '0' }).tare, 'err.positive');
    assert.strictEqual(e({ gross: '250' }).gross, 'err.tooHeavy');
    assert.strictEqual(e({ gross: '20' }).gross, 'err.grossNotAboveTare');
    assert.strictEqual(e({ gross: '19.5' }).gross, 'err.grossNotAboveTare');
    assert.strictEqual(e({ tare: 'abc' }).tare, 'err.number');
    assert.strictEqual(e({ tare: '1.2345' }).tare, 'err.number');
    assert.strictEqual(e({ driverName: 'خالد 2' }).driverName, 'err.driverChars');
    assert.ok(Notes.validate({ driverName: 'خالد', plateNumber: '١٢٣', tare: '٢٢٫٧٨', gross: '٧٧' }).ok, 'Arabic digits accepted');
  });
  await test('every date (PDF + UI) uses DD/MON/YY', () => {
    assert.strictEqual(F.headerDate('2026-11-12'), '12/NOV/26');
    assert.strictEqual(F.slotDate('2026-11-12'), '12/NOV/26');
    assert.strictEqual(F.displayDate('2026-10-05'), '05/OCT/26');
    assert.strictEqual(F.displayDate('2027-01-31'), '31/JAN/27');
    assert.strictEqual(F.uiDate('2026-11-12'), '⁦12/NOV/26⁩', 'UI date isolated from RTL text');
    assert.strictEqual(F.dayKey('2026-11-12'), '1211');
    assert.strictEqual(F.serialNumber('1211', 7), '1211007');
  });

  await test('trailer (عرباي) number is optional, validated like the plate, and audited on edit', async () => {
    const base = { driverName: 'خالد', plateNumber: '123', tare: '20', gross: '60' };
    assert.ok(Notes.validate(base).ok, 'empty trailer allowed');
    assert.strictEqual(Notes.validate(Object.assign({}, base, { trailerNumber: '١٢-٣٤' })).values.trailerNumber, '12-34');
    assert.strictEqual(Notes.validate(Object.assign({}, base, { trailerNumber: 'ABC' })).errors.trailerNumber, 'err.plateChars');
    fresh();
    const n = await Storage.createNote(v({ trailerNumber: '5512345' }), { now: at('2026-11-18T08:00:00') });
    assert.strictEqual(n.trailerNumber, '5512345');
    const out = await Storage.updateNote(n.id, { trailerNumber: '5512399' });
    assert.deepStrictEqual(out.changes, [{ field: 'trailerNumber', old: '5512345', new: '5512399' }]);
    const legacy = Object.assign({}, n); delete legacy.trailerNumber;   // note saved before the field existed
    assert.deepStrictEqual(Notes.diff(legacy, { trailerNumber: '' }), []);
  });

  // ---------------------------------------------------------------- numbering
  fresh();
  await test('Scenario 1+2: first note of a day is DDMM000, second DDMM001', async () => {
    const a = await Storage.createNote(v(), { now: at('2026-11-12T08:00:00') });
    const b = await Storage.createNote(v({ driverName: 'محمد علي' }), { now: at('2026-11-12T09:30:00') });
    assert.strictEqual(a.number, '1211000');
    assert.strictEqual(b.number, '1211001');
    assert.notStrictEqual(a.id, b.id);
  });
  await test('Scenario 3: new day restarts at 000', async () => {
    const c = await Storage.createNote(v(), { now: at('2026-11-13T07:10:00') });
    assert.strictEqual(c.number, '1311000');
    const d = await Storage.createNote(v(), { now: at('2026-11-12T23:59:00') }); // back to 12th (clock) -> continues
    assert.strictEqual(d.number, '1211002');
  });
  await test('rapid double-click / parallel saves never duplicate numbers', async () => {
    const many = await Promise.all(Array.from({ length: 8 }, () => Storage.createNote(v(), { now: at('2026-12-01T10:00:00') })));
    const nums = many.map((n) => n.number).sort();
    assert.deepStrictEqual(nums, ['0112000', '0112001', '0112002', '0112003', '0112004', '0112005', '0112006', '0112007']);
  });
  await test('deleted numbers are never reused', async () => {
    const n = await Storage.createNote(v(), { now: at('2026-12-02T10:00:00') });
    await Storage.deleteNote(n.id);
    const m = await Storage.createNote(v(), { now: at('2026-12-02T11:00:00') });
    assert.strictEqual(n.number, '0212000');
    assert.strictEqual(m.number, '0212001');
  });
  await test('same DD/MM next year continues instead of colliding (no duplicate numbers ever)', async () => {
    const n = await Storage.createNote(v(), { now: at('2027-11-12T10:00:00') });
    assert.strictEqual(n.number, '1211003');
  });
  await test('dates/times recorded locally at entry and save, kept forever', async () => {
    const n = await Storage.createNote(v(), { entry: F.localStamp(at('2026-11-20T06:05:09')), now: at('2026-11-20T06:40:00') });
    assert.strictEqual(n.documentDate, '2026-11-20');
    assert.strictEqual(n.entryTime, '06:05:09');
    assert.strictEqual(n.exitTime, '06:40:00');
    const later = await Storage.updateNote(n.id, { plateNumber: '1234' }, { now: at('2026-11-25T12:00:00') });
    assert.strictEqual(later.note.entryTime, '06:05:09');
    assert.strictEqual(later.note.documentDate, '2026-11-20');
  });

  // ---------------------------------------------------------------- editing
  await test('Scenario 4: editing keeps id + serial, recomputes net, writes audit log', async () => {
    const n = await Storage.getNoteByNumber('1211000');
    const out = await Storage.updateNote(n.id, { driverName: 'خالد احمد العيسى', grossKg: 78500 }, { now: at('2026-11-14T10:00:00') });
    assert.strictEqual(out.note.id, n.id);
    assert.strictEqual(out.note.number, '1211000');
    assert.strictEqual(out.note.netKg, 78500 - 22780);
    assert.strictEqual(out.note.revision, 2);
    const last = out.note.audit[out.note.audit.length - 1];
    assert.strictEqual(last.action, 'edited');
    const fields = last.changes.map((c) => c.field).sort();
    assert.deepStrictEqual(fields, ['driverName', 'grossKg', 'netKg']);
    assert.strictEqual(last.changes.find((c) => c.field === 'grossKg').old, 77000);
    const all = await Storage.listNotes();
    assert.strictEqual(all.filter((x) => x.number === '1211000').length, 1, 'no new note created');
  });
  await test('edit rejects gross <= tare and stale revisions', async () => {
    const n = await Storage.getNoteByNumber('1211001');
    await assert.rejects(Storage.updateNote(n.id, { grossKg: 1000 }), (e) => e.code === 'INVALID');
    await assert.rejects(Storage.updateNote(n.id, { plateNumber: '999' }, { expectedRevision: 99 }), (e) => e.code === 'CONFLICT');
  });
  await test('print status: new -> printed -> edited needs reprint -> printed', async () => {
    const n = await Storage.getNoteByNumber('1211001');
    assert.strictEqual(Notes.status(n), 'new');
    let p = await Storage.markPrinted(n.id, { now: at('2026-11-12T10:00:00') });
    assert.strictEqual(Notes.status(p), 'printed');
    p = (await Storage.updateNote(n.id, { plateNumber: '5550001' }, { now: at('2026-11-12T11:00:00') })).note;
    assert.strictEqual(Notes.status(p), 'reprint');
    p = await Storage.markPrinted(n.id, { kind: 'download', now: at('2026-11-12T11:05:00') });
    assert.strictEqual(Notes.status(p), 'printed');
    assert.strictEqual(p.printCount, 2);
  });

  // ---------------------------------------------------------------- settings
  await test('Scenario 5: carrier change applies to new notes only', async () => {
    const before = await Storage.getNoteByNumber('1211000');
    assert.strictEqual(before.carrierName, 'شركة رادك للنقليات');
    await Storage.saveSettings({ carrierName: 'شركة النقل الحديث' });
    const after = await Storage.getNoteByNumber('1211000');
    assert.strictEqual(after.carrierName, 'شركة رادك للنقليات');
    const n = await Storage.createNote(v(), { now: at('2026-11-15T10:00:00') });
    assert.strictEqual(n.carrierName, 'شركة النقل الحديث');
    const s = await Storage.getSettings();
    assert.strictEqual(s.carrierHistory.length, 1);
    await assert.rejects(Storage.saveSettings({ carrierName: '   ' }), (e) => e.code === 'EMPTY_CARRIER');
  });

  // ---------------------------------------------------------------- persistence
  await test('Scenario 7: data survives closing and reopening the database', async () => {
    const count = (await Storage.listNotes()).length;
    await Storage.close();
    const again = await Storage.listNotes();
    assert.strictEqual(again.length, count);
    const n = await Storage.createNote(v(), { now: at('2026-11-12T12:00:00') });
    assert.strictEqual(n.number, '1211004', 'counter persisted too');
  });

  // ---------------------------------------------------------------- backup
  let backup;
  await test('Scenario 8: export -> import into an empty database restores everything', async () => {
    backup = JSON.parse(JSON.stringify(await Storage.exportBackup()));
    const original = await Storage.listNotes();
    fresh();
    const s = await Storage.importBackup(backup);
    assert.strictEqual(s.added, original.length);
    const restored = await Storage.listNotes();
    assert.deepStrictEqual(restored.map((n) => n.number).sort(), original.map((n) => n.number).sort());
    const n = await Storage.createNote(v(), { now: at('2026-11-12T13:00:00') });
    assert.strictEqual(n.number, '1211005', 'counters restored -> no reuse after restore');
  });
  await test('re-importing the same backup changes nothing; foreign duplicates are reported', async () => {
    const s = await Storage.importBackup(backup);
    assert.strictEqual(s.added, 0);
    const clone = JSON.parse(JSON.stringify(backup));
    clone.notes = [Object.assign({}, clone.notes[0], { id: 'other-id' })];
    const s2 = await Storage.importBackup(clone);
    assert.deepStrictEqual(s2.conflicts, [clone.notes[0].number]);
    await assert.rejects(Storage.importBackup({ hello: 1 }), (e) => e.code === 'BAD_BACKUP');
  });

  // ---------------------------------------------------------------- shaping
  await test('Arabic shaper produces correct contextual forms (incl. lam-alef)', () => {
    assert.deepStrictEqual(Shaper.shapeWord('طن'), ['ﻃ', 'ﻦ']);
    assert.deepStrictEqual(Shaper.shapeWord('خالد'), ['ﺧ', 'ﺎ', 'ﻟ', 'ﺪ']);
    assert.deepStrictEqual(Shaper.shapeWord('لا'), ['ﻻ']);
    assert.deepStrictEqual(Shaper.shapeWord('علاء'), ['ﻋ', 'ﻼ', 'ﺀ']);
  });

  // ---------------------------------------------------------------- PDF
  await test('Scenarios 9+10: PDF is A4 like the original, without QMS code or "رقم", named by serial', async () => {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/generated/embedded-assets.js'), 'utf8'), sandbox);
    const gen = createGenerator({ PDFLib, fontkit, assets: sandbox.window.MASDAR_ASSETS });
    const note = await Storage.getNoteByNumber('1211000');
    const bytes = await gen.generate(note);
    const doc = await PDFLib.PDFDocument.load(bytes);
    assert.strictEqual(doc.getPageCount(), 1);
    const { width, height } = doc.getPage(0).getSize();
    assert.ok(Math.abs(width - 595.35) < 0.01 && Math.abs(height - 841.95) < 0.01, `size ${width}x${height}`);
    const raw = Buffer.from(bytes).toString('latin1');
    assert.ok(!raw.includes('QMS'), 'QMS code absent');
    assert.strictEqual(gen.fileName(note), 'DeliveryNote-1211000.pdf');
    assert.ok(gen.coveredByOriginalFont('خالد احمد سعد العيسى'));
    const out = path.join(__dirname, 'output');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'test-1211000.pdf'), bytes);
  });

  console.log(results.join('\n'));
  console.log(`\n${passed}/${results.length} passed`);
})();
