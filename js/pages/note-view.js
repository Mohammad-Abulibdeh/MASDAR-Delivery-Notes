/** Single note: details, live PDF preview, in-place edit (same id & serial), reprint, delete, audit log. */
(function (root) {
  'use strict';
  const M = root.Masdar;
  const { t } = M.I18n;
  const { icon, esc, toast, statusChip, errorMessage, confirmDialog } = M.UI;
  const F = M.Format;

  const FIELD_LABEL = { driverName: 'f.driver', plateNumber: 'f.plate', trailerNumber: 'f.trailer', tareKg: 'f.tare', grossKg: 'f.gross', netKg: 'f.net' };
  const fmtVal = (field, v) => (/Kg$/.test(field) ? `${F.formatKgAsTons(v)} ${t('f.ton')}` : String(v ?? ''));

  async function render(view, { id }) {
    let note = await M.Storage.getNote(id);
    if (!note) {
      view.innerHTML = `<div class="empty">${icon('alert')}<p>${t('note.notFound')}</p><a class="btn btn--soft" href="#/history">${t('act.back')}</a></div>`;
      return;
    }
    let pdfUrl = null;
    let editing = false;
    let busy = false;

    function auditHtml() {
      return note.audit.slice().reverse().map((a) => `
        <li>
          <span class="timeline__dot is-${a.action}">${icon(a.action === 'edited' ? 'edit' : a.action === 'created' ? 'plus' : a.action === 'downloaded' ? 'download' : 'printer')}</span>
          <strong>${t('audit.' + a.action)}</strong>
          <small class="num">${esc(M.UI.stamp(a.at))}</small>
          ${(a.changes || []).map((c) => `
            <div class="change"><span>${t(FIELD_LABEL[c.field] || c.field)}:</span>
              <del>${esc(fmtVal(c.field, c.old))}</del>${icon('arrow')}<ins>${esc(fmtVal(c.field, c.new))}</ins></div>`).join('')}
        </li>`).join('');
    }

    function detailsHtml() {
      return `
        <div class="kv">
          <div><span>${t('f.driver')}</span><b>${esc(note.driverName)}</b></div>
          <div><span>${t('f.plate')}</span><b class="num">${esc(note.plateNumber)}</b></div>
          <div><span>${t('f.trailer')}</span><b class="num">${esc(note.trailerNumber || '—')}</b></div>
          <div><span>${t('f.tare')}</span><b><span class="num">${esc(F.formatKgAsTons(note.tareKg))}</span> ${t('f.ton')}</b></div>
          <div><span>${t('f.gross')}</span><b><span class="num">${esc(F.formatKgAsTons(note.grossKg))}</span> ${t('f.ton')}</b></div>
          <div class="is-net"><span>${t('f.net')}</span><b><span class="num">${esc(F.formatKgAsTons(note.netKg))}</span> ${t('f.ton')}</b></div>
          <div><span>${t('f.carrier')}</span><b>${esc(note.carrierName)}</b></div>
          <div><span>${t('f.entry')}</span><b class="num">${esc(F.uiDate(note.entryDate))} ${esc(F.uiTime(note.entryTime))}</b></div>
          <div><span>${t('f.exit')}</span><b class="num">${esc(F.uiDate(note.exitDate))} ${esc(F.uiTime(note.exitTime))}</b></div>
          <div><span>${t('note.printedTimes')}</span><b class="num">${note.printCount || 0}</b></div>
          <div><span>${t('f.status')}</span><b>${statusChip(note)}</b></div>
        </div>`;
    }

    view.innerHTML = `
      <div class="page-head">
        <div>
          <a class="eyebrow" href="#/history">${t('hist.title')}</a>
          <div class="note-head"><h1 class="ticket__no">${esc(note.number)}</h1><span id="nv-chip">${statusChip(note)}</span></div>
          <p>${t('note.created')}: <span class="num">${esc(F.uiDate(note.documentDate))} ${esc(F.uiTime(note.exitTime))}</span></p>
        </div>
        <div class="btn-row">
          <button class="btn btn--primary" data-act="print">${icon('printer')} ${t('act.print')}</button>
          <button class="btn btn--soft" data-act="download">${icon('download')} ${t('act.download')}</button>
          <button class="btn btn--ghost" data-act="edit">${icon('edit')} ${t('act.edit')}</button>
          <button class="btn btn--danger-soft btn--icon" data-act="delete" title="${esc(t('act.delete'))}" aria-label="${esc(t('act.delete'))}">${icon('trash')}</button>
        </div>
      </div>
      <div class="note-layout">
        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="card" id="nv-details">${detailsHtml()}</div>
          <div class="card edit-panel" id="nv-edit" hidden></div>
          <div class="card"><div class="card__head"><h2>${t('note.audit')}</h2></div><ul class="timeline" id="nv-audit">${auditHtml()}</ul></div>
        </div>
        <div class="pdf-wrap">
          <div class="card" style="padding:16px">
            <div class="card__head" style="margin-bottom:12px"><h3>${t('note.preview')}</h3><small class="num" style="color:var(--muted)">A4 · PDF</small></div>
            <div id="nv-pdf"><div class="pdf-loading skeleton"></div></div>
            <div id="nv-font"></div>
          </div>
        </div>
      </div>`;

    async function refreshPdf() {
      const host = view.querySelector('#nv-pdf');
      try {
        const blob = await M.UI.pdfBlob(note);
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        pdfUrl = URL.createObjectURL(blob);
        host.innerHTML = `<iframe class="pdf-frame" title="${esc(t('note.preview'))}" src="${pdfUrl}#toolbar=0&navpanes=0&view=FitH"></iframe>`;
      } catch (err) {
        console.error(err);
        host.innerHTML = `<div class="empty">${icon('alert')}<p>${t('err.pdf')}</p></div>`;
      }
      const gen = M.UI.getGenerator();
      const ok = [note.driverName, note.carrierName].every((s) => gen.coveredByOriginalFont(s));
      view.querySelector('#nv-font').innerHTML = `<div class="font-note ${ok ? '' : 'is-fallback'}">${icon(ok ? 'check' : 'alert')}<span>${t(ok ? 'note.fontOriginal' : 'note.fontFallback')}</span></div>`;
    }

    function refreshAll() {
      view.querySelector('#nv-details').innerHTML = detailsHtml();
      view.querySelector('#nv-audit').innerHTML = auditHtml();
      view.querySelector('#nv-chip').innerHTML = statusChip(note);
    }

    function openEdit() {
      if (editing) return;
      editing = true;
      const panel = view.querySelector('#nv-edit');
      const P = M.Pages.new;
      panel.hidden = false;
      panel.innerHTML = `
        <div class="card__head"><div><h2>${t('note.editTitle')}</h2><small style="color:var(--muted)">${t('note.editHint')}</small></div></div>
        <form class="compose__form" id="edit-form" novalidate>
          ${P.fieldsHtml({ driverName: note.driverName, plateNumber: note.plateNumber, trailerNumber: note.trailerNumber || '', tare: F.formatKgAsTons(note.tareKg), gross: F.formatKgAsTons(note.grossKg) })}
          <div class="net full" style="margin:0" id="ed-net-box"><span>${t('f.net')}</span><div class="net__value" id="ed-net"></div></div>
          <div class="compose__actions">
            <button class="btn btn--ghost" type="button" id="ed-cancel">${t('act.cancel')}</button>
            <button class="btn btn--primary" type="submit" id="ed-save">${icon('check')} ${t('act.save')}</button>
          </div>
        </form>`;
      const form = panel.querySelector('#edit-form');
      P.sanitizeWeightInput(form.querySelector('[name=tare]'));
      P.sanitizeWeightInput(form.querySelector('[name=gross]'));
      const upd = () => {
        const res = M.Notes.validate(P.readForm(form));
        P.showErrors(form, res.errors, null);
        const changed = res.values.tareKg !== note.tareKg || res.values.grossKg !== note.grossKg
          || res.values.driverName !== note.driverName || res.values.plateNumber !== note.plateNumber
          || res.values.trailerNumber !== (note.trailerNumber || '');
        M.App.setDirty(changed);
        const netEl = form.querySelector('#ed-net');
        netEl.innerHTML = res.values.netKg == null ? '—' : `${esc(F.formatKgAsTons(res.values.netKg))}<small>${t('f.ton')}</small>`;
        form.querySelector('#ed-net-box').classList.toggle('is-invalid', res.values.netKg != null && res.values.netKg <= 0);
        return res;
      };
      form.addEventListener('input', upd);
      upd();
      form.querySelector('#ed-cancel').addEventListener('click', closeEdit);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;
        const res = upd();
        if (!res.ok) { toast(t('err.form'), 'error'); return; }
        busy = true;
        const btn = form.querySelector('#ed-save');
        btn.disabled = true;
        try {
          const out = await M.Storage.updateNote(note.id, res.values, { expectedRevision: note.revision });
          note = out.note;
          M.App.setDirty(false);
          toast(out.changes.length ? t('note.saved') : t('note.noChanges'), out.changes.length ? 'success' : 'info');
          closeEdit();
          refreshAll();
          if (out.changes.length) refreshPdf();
        } catch (err) {
          toast(errorMessage(err), 'error', 5000);
        } finally { busy = false; btn.disabled = false; }
      });
      form.querySelector('input').focus();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closeEdit() {
      editing = false;
      M.App.setDirty(false);
      const panel = view.querySelector('#nv-edit');
      panel.hidden = true;
      panel.innerHTML = '';
    }

    view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'edit') return openEdit();
      if (act === 'delete') {
        const ok = await confirmDialog({ title: t('del.title'), body: t('del.body', { n: note.number }), confirmText: t('act.delete'), danger: true });
        if (!ok) return;
        await M.Storage.deleteNote(note.id);
        M.App.setDirty(false);
        toast(`${t('del.done')} — ${note.number}`);
        location.hash = '#/history';
        return;
      }
      if (busy) return;
      if (editing && act !== 'edit') {
        // printing while unsaved edits exist would print old data — make that explicit
        const leave = await confirmDialog({ title: t('unsaved.title'), body: t('unsaved.body'), confirmText: t('unsaved.leave'), cancelText: t('unsaved.stay') });
        if (!leave) return;
        closeEdit();
      }
      busy = true; b.disabled = true;
      try {
        note = act === 'print' ? await M.UI.printPdf(note) : await M.UI.downloadPdf(note);
        refreshAll();
      } catch (err) { toast(t('err.pdf'), 'error'); console.error(err); }
      finally { busy = false; b.disabled = false; }
    }));

    refreshPdf();
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); M.App.setDirty(false); };
  }

  M.Pages = M.Pages || {};
  M.Pages.note = { render };
})(self);
