/** Settings: default carrier (new notes only), backup export/import, storage, language, intro. */
(function (root) {
  'use strict';
  const M = root.Masdar;
  const { t } = M.I18n;
  const { icon, esc, toast, errorMessage, confirmDialog } = M.UI;

  async function exportBackup() {
    const data = await M.Storage.exportBackup();
    const now = new Date();
    const stamp = `${now.getFullYear()}-${M.Format.pad(now.getMonth() + 1)}-${M.Format.pad(now.getDate())}_${M.Format.pad(now.getHours())}${M.Format.pad(now.getMinutes())}`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masdar-delivery-notes-backup_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    await M.Storage.saveSettings({ lastBackupAt: now.toISOString() });
    toast(`${t('set.exported')} (${data.noteCount})`);
  }

  async function render(view) {
    const settings = await M.Storage.getSettings();
    const notes = await M.Storage.listNotes();
    let persisted = false;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (_) { /* noop */ }
    const gen = M.UI.getGenerator();

    view.innerHTML = `
      <div class="page-head">
        <div><span class="eyebrow">${t('nav.settings')}</span><h1>${t('set.title')}</h1><p>${t('set.sub')}</p></div>
      </div>
      <div class="settings-grid">
        <section class="card">
          <h2>${icon('truck')} ${t('set.carrier')}</h2>
          <p>${t('set.carrierHint')}</p>
          <form class="inline-form" id="carrier-form" novalidate>
            <div class="field" data-field="carrier">
              <label class="sr-only" for="s-carrier">${t('f.carrier')}</label>
              <input class="input" id="s-carrier" maxlength="60" value="${esc(settings.carrierName)}" dir="auto" autocomplete="off">
              <div class="field__error">${icon('alert')}<span>${t('err.required')}</span></div>
            </div>
            <button class="btn btn--primary" type="submit" style="height:52px">${icon('check')} ${t('act.save')}</button>
          </form>
          ${(settings.carrierHistory || []).length ? `
            <ul class="mini-log"><li><b>${t('set.carrierHistory')}</b></li>
            ${settings.carrierHistory.slice().reverse().slice(0, 6).map((h) => `
              <li><span class="num">${esc(M.UI.stamp(h.at))}</span> — <del>${esc(h.old)}</del> ${M.I18n.getLang() === 'ar' ? '←' : '→'} <b>${esc(h.new)}</b></li>`).join('')}
            </ul>` : ''}
        </section>

        <section class="card">
          <h2>${icon('shield')} ${t('set.data')}</h2>
          <p>${t('set.dataHint')}</p>
          <div class="storage-meter">${icon('file')}<div><b class="num">${notes.length}</b> <span>${t('set.notes')}</span></div></div>
          <div class="btn-row">
            <button class="btn btn--primary" id="s-export" type="button">${icon('download')} ${t('set.export')}</button>
            <label class="btn btn--soft" for="s-import-file">${icon('upload')} ${t('set.import')}</label>
            <input type="file" id="s-import-file" accept="application/json,.json" hidden>
          </div>
          <div class="status-line ${persisted ? 'ok' : 'warn'}">${icon(persisted ? 'shield' : 'alert')}
            <span>${t(persisted ? 'set.persistOn' : 'set.persistOff')}</span>
            ${persisted ? '' : `<button class="btn btn--ghost btn--sm" id="s-persist" type="button">${t('set.persistBtn')}</button>`}
          </div>
          <small style="color:var(--muted)">${settings.lastBackupAt ? `${t('dash.backupLast')}: <span class="num">${esc(M.UI.stamp(settings.lastBackupAt))}</span>` : t('dash.backupNever')}</small>
        </section>

        <section class="card">
          <h2>${icon('globe')} ${t('set.lang')}</h2>
          <div class="settings-row">
            <span>${t('set.lang')}</span>
            <div class="seg" role="group">
              <button type="button" data-lang="ar" class="${M.I18n.getLang() === 'ar' ? 'is-on' : ''}">العربية</button>
              <button type="button" data-lang="en" class="${M.I18n.getLang() === 'en' ? 'is-on' : ''}">English</button>
            </div>
          </div>
          <div class="settings-row">
            <label class="switch"><input type="checkbox" id="s-splash" ${settings.showSplash !== false ? 'checked' : ''}><span class="switch__track"></span>${t('set.splash')}</label>
          </div>
        </section>

        <section class="card">
          <h2>${icon('file')} ${t('set.doc')}</h2>
          <p>${t('set.docHint')}</p>
          <div class="status-line ok">${icon('check')}<span>${t('set.fontAlbany', { s: t(gen.usesOriginalArabicFont ? 'set.fontFull' : 'set.fontSubset') })}</span></div>
        </section>
      </div>`;

    // carrier
    const cForm = view.querySelector('#carrier-form');
    cForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = view.querySelector('#s-carrier');
      const value = M.Format.cleanText(input.value);
      const field = cForm.querySelector('[data-field]');
      field.classList.toggle('has-error', !value);
      if (!value) { input.focus(); return; }
      if (value === settings.carrierName) { toast(t('note.noChanges'), 'info'); return; }
      try {
        await M.Storage.saveSettings({ carrierName: value });
        toast(t('set.carrierSaved'));
        render(view);
      } catch (err) { toast(errorMessage(err), 'error'); }
    });

    view.querySelector('#s-export').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await exportBackup(); render(view); } catch (err) { toast(errorMessage(err), 'error'); e.currentTarget.disabled = false; }
    });

    view.querySelector('#s-import-file').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
        M.Storage.validateBackup(data);
      } catch (_) { toast(t('set.badBackup'), 'error', 5000); return; }
      const ok = await confirmDialog({
        title: t('set.import'),
        body: `${file.name} — ${data.notes.length} ${t('hist.count')}. ${M.I18n.getLang() === 'ar' ? 'سيتم دمج السندات مع الموجودة دون حذف أي شيء.' : 'Notes will be merged; nothing will be deleted.'}`,
      });
      if (!ok) return;
      try {
        const s = await M.Storage.importBackup(data);
        toast(t('set.imported', { a: s.added, u: s.updated, s: s.unchanged, c: s.conflicts.length }), s.conflicts.length ? 'info' : 'success', 6000);
        render(view);
      } catch (err) {
        toast(err.code === 'BAD_BACKUP' ? t('set.badBackup') : errorMessage(err), 'error', 5000);
      }
    });

    const persistBtn = view.querySelector('#s-persist');
    if (persistBtn) persistBtn.addEventListener('click', async () => {
      try { await navigator.storage.persist(); } catch (_) { /* noop */ }
      render(view);
    });

    view.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.lang === M.I18n.getLang()) return;
      document.querySelector('#lang-toggle').click();
    }));
    view.querySelector('#s-splash').addEventListener('change', async (e) => {
      await M.Storage.saveSettings({ showSplash: e.target.checked });
      toast(t('set.saved'));
    });
  }

  M.Pages = M.Pages || {};
  M.Pages.settings = { render, exportBackup };
})(self);
