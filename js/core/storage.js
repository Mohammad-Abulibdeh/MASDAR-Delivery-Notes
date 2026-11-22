/**
 * Persistent storage (IndexedDB) for delivery notes, serial counters and settings.
 *
 * WHERE is the data?  In the browser's IndexedDB database "masdar-delivery-notes"
 *   on this computer, inside the browser profile that opens index.html. It survives
 *   closing the browser / rebooting. It is NOT synced to other devices or browsers.
 *
 * NO DUPLICATE SERIALS - guaranteed by three layers:
 *   1. A counter per DDMM key is read+incremented in the SAME readwrite transaction
 *      that inserts the note -> two saves (even from two tabs) are serialised by IndexedDB.
 *   2. The "number" index on notes is UNIQUE -> the database itself rejects a duplicate.
 *   3. Before using a number we check the index and skip any number that already exists
 *      (e.g. same day of an earlier year, or numbers restored from a backup).
 *   Deleting a note never decrements the counter, so a number is never reused.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./format.js'), require('./delivery-notes.js'));
  } else {
    (root.Masdar = root.Masdar || {}).Storage = factory(root.Masdar.Format, root.Masdar.Notes);
  }
})(typeof self !== 'undefined' ? self : this, function (F, Notes) {
  'use strict';

  const DB_NAME = 'masdar-delivery-notes';
  const DB_VERSION = 1;
  const DEFAULT_SETTINGS = {
    key: 'app',
    carrierName: 'شركة رادك للنقليات',
    language: 'ar',
    showSplash: true,
    carrierHistory: [],
    lastBackupAt: null,
  };
  const BACKUP_FORMAT = 'masdar-delivery-notes-backup';

  let idb = (typeof indexedDB !== 'undefined') ? indexedDB : null;
  let dbPromise = null;

  function useIndexedDB(impl) { idb = impl; dbPromise = null; }

  const req = (r) => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const done = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });

  function open() {
    if (dbPromise) return dbPromise;
    if (!idb) return Promise.reject(new Error('IndexedDB is not available in this browser'));
    dbPromise = new Promise((resolve, reject) => {
      const r = idb.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('notes')) {
          const s = db.createObjectStore('notes', { keyPath: 'id' });
          s.createIndex('number', 'number', { unique: true });
          s.createIndex('createdAt', 'createdAt');
          s.createIndex('documentDate', 'documentDate');
        }
        if (!db.objectStoreNames.contains('counters')) db.createObjectStore('counters', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Database is blocked by another open tab'));
    });
    return dbPromise;
  }

  function close() {
    if (!dbPromise) return Promise.resolve();
    return dbPromise.then((db) => { db.close(); dbPromise = null; });
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function storageError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }

  // ------------------------------------------------------------------ settings
  async function getSettings() {
    const db = await open();
    const s = await req(db.transaction('settings').objectStore('settings').get('app'));
    return Object.assign({}, DEFAULT_SETTINGS, s || {});
  }

  async function saveSettings(patch, { now = new Date() } = {}) {
    const db = await open();
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const current = Object.assign({}, DEFAULT_SETTINGS, (await req(store.get('app'))) || {});
    const next = Object.assign({}, current, patch, { key: 'app' });
    if (patch.carrierName !== undefined) {
      next.carrierName = F.cleanText(patch.carrierName);
      if (!next.carrierName) throw storageError('EMPTY_CARRIER');
      if (next.carrierName !== current.carrierName) {
        next.carrierHistory = (current.carrierHistory || []).concat({
          at: now.toISOString(), old: current.carrierName, new: next.carrierName,
        });
      }
    }
    store.put(next);
    await done(tx);
    return next;
  }

  // ------------------------------------------------------------------ notes
  /**
   * Create a note atomically with the next serial number.
   * @param values  validated values {driverName, plateNumber, trailerNumber?, tareKg, grossKg}
   * @param opts.entry  local stamp captured when the user started the note
   * @param opts.now    Date used as save/exit moment (injectable for tests)
   */
  async function createNote(values, { entry = null, now = new Date() } = {}) {
    const check = Notes.validate({
      driverName: values.driverName, plateNumber: values.plateNumber, trailerNumber: values.trailerNumber,
      tare: F.formatKgAsTons(values.tareKg), gross: F.formatKgAsTons(values.grossKg),
    });
    if (!check.ok) throw storageError('INVALID', JSON.stringify(check.errors));

    const exit = F.localStamp(now);
    const entryStamp = entry || exit;
    const key = F.dayKey(exit.date);

    const db = await open();
    const tx = db.transaction(['notes', 'counters', 'settings'], 'readwrite');
    const completion = done(tx);
    try {
      const notes = tx.objectStore('notes');
      const counters = tx.objectStore('counters');
      const settings = Object.assign({}, DEFAULT_SETTINGS,
        (await req(tx.objectStore('settings').get('app'))) || {});

      const counter = await req(counters.get(key));
      let seq = counter ? counter.last + 1 : 0;
      while (seq <= 999 && (await req(notes.index('number').count(F.serialNumber(key, seq)))) > 0) seq++;
      if (seq > 999) throw storageError('DAILY_LIMIT');

      const number = F.serialNumber(key, seq);
      const note = {
        id: uuid(),
        number,
        dayKey: key,
        seq,
        documentDate: exit.date,           // printed in التاريخ / وقت الدخول / وقت الخروج
        entryDate: entryStamp.date, entryTime: entryStamp.time,
        exitDate: exit.date, exitTime: exit.time,
        createdAt: exit.iso,
        driverName: check.values.driverName,
        plateNumber: check.values.plateNumber,
        trailerNumber: check.values.trailerNumber,
        tareKg: check.values.tareKg,
        grossKg: check.values.grossKg,
        netKg: check.values.netKg,
        carrierName: settings.carrierName,  // snapshot - later settings changes don't touch it
        revision: 1,
        printCount: 0,
        lastPrintedAt: null,
        lastEditedAt: null,
        audit: [{ at: exit.iso, action: 'created', changes: [] }],
      };
      notes.add(note);
      counters.put({ key, last: seq, updatedAt: exit.iso });
      await completion;
      return note;
    } catch (err) {
      try { tx.abort(); } catch (_) { /* already finished */ }
      await completion.catch(() => {});
      if (err && err.name === 'ConstraintError') throw storageError('DUPLICATE_NUMBER');
      throw err;
    }
  }

  async function getNote(id) {
    const db = await open();
    return req(db.transaction('notes').objectStore('notes').get(id));
  }

  async function getNoteByNumber(number) {
    const db = await open();
    return req(db.transaction('notes').objectStore('notes').index('number').get(number));
  }

  /** All notes, newest first. */
  async function listNotes() {
    const db = await open();
    const all = await req(db.transaction('notes').objectStore('notes').getAll());
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  /**
   * Edit an existing note IN PLACE (same id, same serial, same dates/carrier).
   * Every changed field is written to the audit log.
   */
  async function updateNote(id, values, { now = new Date(), expectedRevision = null } = {}) {
    const db = await open();
    const tx = db.transaction('notes', 'readwrite');
    const completion = done(tx);
    const store = tx.objectStore('notes');
    try {
      const note = await req(store.get(id));
      if (!note) throw storageError('NOT_FOUND');
      if (expectedRevision != null && note.revision !== expectedRevision) throw storageError('CONFLICT');

      const merged = {
        driverName: values.driverName ?? note.driverName,
        plateNumber: values.plateNumber ?? note.plateNumber,
        trailerNumber: values.trailerNumber ?? note.trailerNumber ?? '',
        tareKg: values.tareKg ?? note.tareKg,
        grossKg: values.grossKg ?? note.grossKg,
      };
      const check = Notes.validate({
        driverName: merged.driverName, plateNumber: merged.plateNumber, trailerNumber: merged.trailerNumber,
        tare: F.formatKgAsTons(merged.tareKg), gross: F.formatKgAsTons(merged.grossKg),
      });
      if (!check.ok) throw storageError('INVALID', JSON.stringify(check.errors));

      const changes = Notes.diff(note, check.values);
      if (!changes.length) { await completion; return { note, changes }; }
      const netChange = check.values.netKg !== note.netKg
        ? [{ field: 'netKg', old: note.netKg, new: check.values.netKg }] : [];

      const iso = now.toISOString();
      const updated = Object.assign({}, note, {
        driverName: check.values.driverName,
        plateNumber: check.values.plateNumber,
        trailerNumber: check.values.trailerNumber,
        tareKg: check.values.tareKg,
        grossKg: check.values.grossKg,
        netKg: check.values.netKg,
        revision: note.revision + 1,
        lastEditedAt: iso,
        audit: note.audit.concat({ at: iso, action: 'edited', changes: changes.concat(netChange) }),
      });
      store.put(updated);
      await completion;
      return { note: updated, changes };
    } catch (err) {
      try { tx.abort(); } catch (_) { /* noop */ }
      await completion.catch(() => {});
      throw err;
    }
  }

  async function markPrinted(id, { kind = 'print', now = new Date() } = {}) {
    const db = await open();
    const tx = db.transaction('notes', 'readwrite');
    const completion = done(tx);
    const store = tx.objectStore('notes');
    const note = await req(store.get(id));
    if (!note) { tx.abort(); await completion.catch(() => {}); throw storageError('NOT_FOUND'); }
    const iso = now.toISOString();
    const updated = Object.assign({}, note, {
      printCount: (note.printCount || 0) + 1,
      lastPrintedAt: iso,
      audit: note.audit.concat({ at: iso, action: kind === 'download' ? 'downloaded' : 'printed', changes: [] }),
    });
    store.put(updated);
    await completion;
    return updated;
  }

  /** Permanently delete. The serial number stays retired (counter is not decremented). */
  async function deleteNote(id) {
    const db = await open();
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').delete(id);
    await done(tx);
  }

  async function getCounters() {
    const db = await open();
    return req(db.transaction('counters').objectStore('counters').getAll());
  }

  /** Preview of the number the next save would most likely get (not reserved). */
  async function peekNextNumber(now = new Date()) {
    const key = F.dayKey(F.localStamp(now).date);
    const db = await open();
    const tx = db.transaction(['counters', 'notes']);
    const counter = await req(tx.objectStore('counters').get(key));
    let seq = counter ? counter.last + 1 : 0;
    while (seq <= 999 && (await req(tx.objectStore('notes').index('number').count(F.serialNumber(key, seq)))) > 0) seq++;
    return seq > 999 ? null : F.serialNumber(key, seq);
  }

  // ------------------------------------------------------------------ backup
  async function exportBackup({ now = new Date() } = {}) {
    const db = await open();
    const tx = db.transaction(['notes', 'counters', 'settings']);
    const [notes, counters, settings] = await Promise.all([
      req(tx.objectStore('notes').getAll()),
      req(tx.objectStore('counters').getAll()),
      req(tx.objectStore('settings').get('app')),
    ]);
    return {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: now.toISOString(),
      noteCount: notes.length,
      notes, counters,
      settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}),
    };
  }

  function validateBackup(data) {
    if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.notes) || !Array.isArray(data.counters)) {
      throw storageError('BAD_BACKUP');
    }
    for (const n of data.notes) {
      if (!n || typeof n.id !== 'string' || !/^\d{7}$/.test(n.number) || !Number.isInteger(n.netKg)) {
        throw storageError('BAD_BACKUP');
      }
    }
  }

  /**
   * Merge a backup into the current database. Nothing existing is deleted.
   *  - same id: the copy with the higher revision wins
   *  - same serial but different id: skipped and reported as a conflict
   *  - counters: max(existing, backup, highest serial actually present)
   */
  async function importBackup(data, { restoreSettings = false } = {}) {
    validateBackup(data);
    const db = await open();
    const tx = db.transaction(['notes', 'counters', 'settings'], 'readwrite');
    const completion = done(tx);
    const notes = tx.objectStore('notes');
    const counters = tx.objectStore('counters');
    const summary = { added: 0, updated: 0, unchanged: 0, conflicts: [] };
    try {
      const maxSeq = {};
      for (const n of data.notes) {
        const existing = await req(notes.get(n.id));
        if (existing) {
          if ((n.revision || 0) > (existing.revision || 0) && existing.number === n.number) {
            notes.put(n); summary.updated++;
          } else summary.unchanged++;
        } else {
          const clash = await req(notes.index('number').get(n.number));
          if (clash) { summary.conflicts.push(n.number); continue; }
          notes.add(n); summary.added++;
        }
        const k = n.number.slice(0, 4);
        maxSeq[k] = Math.max(maxSeq[k] ?? -1, parseInt(n.number.slice(4), 10));
      }
      for (const c of data.counters) {
        if (c && /^\d{4}$/.test(c.key) && Number.isInteger(c.last)) maxSeq[c.key] = Math.max(maxSeq[c.key] ?? -1, c.last);
      }
      for (const [key, last] of Object.entries(maxSeq)) {
        const cur = await req(counters.get(key));
        if (!cur || cur.last < last) counters.put({ key, last, updatedAt: new Date().toISOString() });
      }
      if (restoreSettings && data.settings) {
        tx.objectStore('settings').put(Object.assign({}, DEFAULT_SETTINGS, data.settings, { key: 'app' }));
      }
      await completion;
      return summary;
    } catch (err) {
      try { tx.abort(); } catch (_) { /* noop */ }
      await completion.catch(() => {});
      throw err;
    }
  }

  return {
    DB_NAME, DEFAULT_SETTINGS, BACKUP_FORMAT,
    useIndexedDB, open, close,
    getSettings, saveSettings,
    createNote, getNote, getNoteByNumber, listNotes, updateNote, markPrinted, deleteNote,
    getCounters, peekNextNumber,
    exportBackup, importBackup, validateBackup,
  };
});
