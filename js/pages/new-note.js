/** New delivery note: 4 inputs, live validation + preview, atomic save, print/download. */
(function (root) {
  'use strict';
  const M = root.Masdar;
  const { t } = M.I18n;
  const { icon, esc, toast, errorMessage } = M.UI;
  const F = M.Format;

  /** Shared field markup (also used by the History edit form). */
  function fieldsHtml(values = {}) {
    const v = (k) => esc(values[k] ?? '');
    return `
      <div class="field full" data-field="driverName">
        <label class="field__label" for="f-driver">${icon('user')} ${t('f.driver')}</label>
        <div class="field__control"><input class="input" id="f-driver" name="driverName" autocomplete="off" maxlength="60"
          placeholder="${esc(t('f.driverPh'))}" value="${v('driverName')}" dir="auto"></div>
        <div class="field__error">${icon('alert')}<span></span></div>
      </div>
      <div class="field full" data-field="plateNumber">
        <label class="field__label" for="f-plate">${icon('truck')} ${t('f.plate')}</label>
        <div class="field__control"><input class="input input--num" id="f-plate" name="plateNumber" autocomplete="off" maxlength="20"
          placeholder="${esc(t('f.platePh'))}" value="${v('plateNumber')}" dir="ltr"></div>
        <div class="field__error">${icon('alert')}<span></span></div>
      </div>
      <div class="field full" data-field="trailerNumber">
        <label class="field__label" for="f-trailer">${icon('truck')} ${t('f.trailer')} <small class="field__hint">${t('f.optional')}</small></label>
        <div class="field__control"><input class="input input--num" id="f-trailer" name="trailerNumber" autocomplete="off" maxlength="20"
          placeholder="${esc(t('f.trailerPh'))}" value="${v('trailerNumber')}" dir="ltr"></div>
        <div class="field__error">${icon('alert')}<span></span></div>
      </div>
      <div class="field field--suffix" data-field="tare">
        <label class="field__label" for="f-tare">${icon('scale')} ${t('f.tare')} <small class="field__hint">Tare</small></label>
        <div class="field__control"><input class="input input--num" id="f-tare" name="tare" inputmode="decimal" autocomplete="off"
          placeholder="${t('f.weightPh')}" value="${v('tare')}" dir="ltr"><span class="field__suffix">${t('f.ton')}</span></div>
        <div class="field__error">${icon('alert')}<span></span></div>
      </div>
      <div class="field field--suffix" data-field="gross">
        <label class="field__label" for="f-gross">${icon('scale')} ${t('f.gross')} <small class="field__hint">Gross</small></label>
        <div class="field__control"><input class="input input--num" id="f-gross" name="gross" inputmode="decimal" autocomplete="off"
          placeholder="${t('f.weightPh')}" value="${v('gross')}" dir="ltr"><span class="field__suffix">${t('f.ton')}</span></div>
        <div class="field__error">${icon('alert')}<span></span></div>
      </div>`;
  }

  function readForm(form) {
    const fd = new FormData(form);
    return {
      driverName: fd.get('driverName'), plateNumber: fd.get('plateNumber'), trailerNumber: fd.get('trailerNumber'),
      tare: fd.get('tare'), gross: fd.get('gross'),
    };
  }

  /** Show errors on fields. `touched` limits display to fields the user has interacted with. */
  function showErrors(form, errors, touched) {
    form.querySelectorAll('[data-field]').forEach((fieldEl) => {
      const k = fieldEl.dataset.field;
      const err = errors[k];
      const visible = err && (!touched || touched.has(k));
      fieldEl.classList.toggle('has-error', !!visible);
      fieldEl.querySelector('.field__error span').textContent = visible ? t(err) : '';
      const input = fieldEl.querySelector('input');
      if (input) input.setAttribute('aria-invalid', visible ? 'true' : 'false');
    });
  }

  /** Keep weight inputs to digits + one decimal separator (Arabic digits converted). */
  function sanitizeWeightInput(input) {
    input.addEventListener('input', () => {
      const before = input.value;
      let s = F.normalizeDigits(before).replace(/[^\d.]/g, '');
      const i = s.indexOf('.');
      if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 3);
      if (s !== before) input.value = s;
    });
  }

  async function render(view) {
    const settings = await M.Storage.getSettings();
    let nextNumber = await M.Storage.peekNextNumber();
    let entry = null;           // local stamp captured at first keystroke
    let saving = false;
    let submitted = false;
    const touched = new Set();
    let clock = null;

    view.innerHTML = `
      <div class="page-head">
        <div><span class="eyebrow">${t('nav.new')}</span><h1>${t('new.title')}</h1><p>${t('new.sub')}</p></div>
      </div>
      <div class="compose" id="compose">
        <form class="card compose__form" id="note-form" novalidate>
          ${fieldsHtml()}
          <div class="field full">
            <span class="field__label">${icon('truck')} ${t('f.carrier')}</span>
            <div class="locked">${icon('lock')}<div><strong>${esc(settings.carrierName)}</strong><small>${t('new.carrierLocked')}</small></div></div>
          </div>
          <div class="compose__actions">
            <button class="btn btn--ghost" type="reset">${icon('x')} ${t('new.reset')}</button>
            <button class="btn btn--primary btn--lg" type="submit" id="save-btn">${icon('check')} <span>${t('new.save')}</span></button>
          </div>
        </form>

        <aside class="ticket" aria-label="${esc(t('new.preview'))}">
          <div class="ticket__top">
            <span class="ring-deco"></span>
            <small>${t('f.number')}</small>
            <div class="ticket__no" id="pv-number">${esc(nextNumber || '—')}</div>
            <div class="ticket__hint">${icon('lock')} ${t('new.numberHint')}</div>
          </div>
          <div class="ticket__body">
            <div class="ticket__row"><span>${t('f.date')}</span><b class="num" id="pv-date"></b></div>
            <div class="ticket__row"><span>${t('f.entry')}</span><b id="pv-entry" class="is-empty">${t('new.entryNotStarted')}</b></div>
            <div class="ticket__row"><span>${t('f.exit')}</span><b class="is-empty">${t('new.exitOnSave')}</b></div>
            <div class="ticket__row"><span>${t('f.carrier')}</span><b>${esc(settings.carrierName)}</b></div>
            <div class="ticket__row"><span>${t('f.driver')}</span><b id="pv-driver" class="is-empty">—</b></div>
            <div class="ticket__row"><span>${t('f.plate')}</span><b id="pv-plate" class="is-empty num">—</b></div>
            <div class="ticket__row"><span>${t('f.trailer')}</span><b id="pv-trailer" class="is-empty num">—</b></div>
            <div class="ticket__row"><span>${t('f.tare')}</span><b id="pv-tare" class="is-empty">—</b></div>
            <div class="ticket__row"><span>${t('f.gross')}</span><b id="pv-gross" class="is-empty">—</b></div>
          </div>
          <div class="ticket__cut"></div>
          <div class="net" id="pv-net-box"><span>${t('f.net')}</span><div class="net__value" id="pv-net">—</div></div>
          <details class="fixed-list">
            <summary>${icon('lock')} ${t('new.fixed')}</summary>
            <ul>
              <li><span>المادة المباعة</span><b>CEM I 52.5N</b></li>
              <li><span>نوع التعبئة</span><b>Bulk</b></li>
              <li><span>السادة</span><b>Masdar for Cement Trading and Construction Material</b></li>
              <li><span>ضابط القبان</span><b>BY SYSTEM</b></li>
              <li><span>شركة سمنترا/ الأردن</span><b>016602242</b></li>
            </ul>
          </details>
        </aside>
      </div>`;

    const form = view.querySelector('#note-form');
    const $ = (id) => view.querySelector(id);
    sanitizeWeightInput($('#f-tare'));
    sanitizeWeightInput($('#f-gross'));

    function tickClock() {
      $('#pv-date').textContent = F.uiDate(F.localStamp().date);
    }
    tickClock();
    clock = setInterval(tickClock, 30000);

    function setPv(id, text, extra = '') {
      const el = $(id);
      el.textContent = text || '—';
      el.classList.toggle('is-empty', !text);
      if (extra) el.textContent += extra;
    }

    let lastNet = null;
    function update() {
      const raw = readForm(form);
      const anyValue = Object.values(raw).some((v) => String(v || '').trim());
      M.App.setDirty(anyValue);
      if (anyValue && !entry) {
        entry = F.localStamp();
        const el = $('#pv-entry');
        el.textContent = `${F.uiDate(entry.date)} ${F.uiTime(entry.time)}`;
        el.classList.remove('is-empty');
        el.classList.add('num');
      }
      const res = M.Notes.validate(raw);
      showErrors(form, res.errors, submitted ? null : touched);
      setPv('#pv-driver', res.values.driverName);
      setPv('#pv-plate', res.values.plateNumber);
      setPv('#pv-trailer', res.values.trailerNumber);
      setPv('#pv-tare', res.values.tareKg != null ? `${F.formatKgAsTons(res.values.tareKg)} ${t('f.ton')}` : '');
      setPv('#pv-gross', res.values.grossKg != null ? `${F.formatKgAsTons(res.values.grossKg)} ${t('f.ton')}` : '');
      const netEl = $('#pv-net');
      const box = $('#pv-net-box');
      const net = res.values.netKg;
      if (net == null) { netEl.textContent = '—'; box.classList.remove('is-invalid'); }
      else {
        netEl.innerHTML = `${esc(F.formatKgAsTons(net))}<small>${t('f.ton')}</small>`;
        box.classList.toggle('is-invalid', net <= 0);
        if (net !== lastNet) { netEl.classList.add('bump'); setTimeout(() => netEl.classList.remove('bump'), 180); }
      }
      lastNet = net;
      return res;
    }

    form.addEventListener('input', update);
    form.addEventListener('focusout', (e) => {
      if (e.target.name) { touched.add(e.target.name); update(); }
    });
    // Enter -> next field
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      const inputs = Array.from(form.querySelectorAll('input'));
      const i = inputs.indexOf(e.target);
      if (i < inputs.length - 1) { e.preventDefault(); inputs[i + 1].focus(); }
    });
    form.addEventListener('reset', () => {
      setTimeout(() => {
        entry = null; submitted = false; touched.clear();
        const el = $('#pv-entry'); el.textContent = t('new.entryNotStarted'); el.classList.add('is-empty');
        update();
        M.App.setDirty(false);
        $('#f-driver').focus();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (saving) return;                       // blocks double submit
      submitted = true;
      const res = update();
      if (!res.ok) {
        toast(t('err.form'), 'error');
        const first = form.querySelector('.has-error input');
        if (first) first.focus();
        return;
      }
      saving = true;
      const btn = $('#save-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> <span>${t('new.saving')}</span>`;
      try {
        const note = await M.Storage.createNote(res.values, { entry: entry || F.localStamp() });
        M.App.setDirty(false);
        clearInterval(clock);
        showSuccess(view, note);
      } catch (err) {
        toast(errorMessage(err), 'error', 5000);
        saving = false;
        btn.disabled = false;
        btn.innerHTML = `${icon('check')} <span>${t('new.save')}</span>`;
        nextNumber = await M.Storage.peekNextNumber();
        $('#pv-number').textContent = nextNumber || '—';
      }
    });

    update();
    $('#f-driver').focus();
    return () => { clearInterval(clock); M.App.setDirty(false); };
  }

  function showSuccess(view, note) {
    view.innerHTML = `
      <div class="card success">
        <div class="success__badge">${icon('check')}</div>
        <h2>${t('new.saved')}</h2>
        <div class="ticket__no">${esc(note.number)}</div>
        <p>${esc(note.driverName)} · <span class="num">${esc(note.plateNumber)}</span> · ${t('f.net')}: <b class="num">${esc(F.formatKgAsTons(note.netKg))}</b> ${t('f.ton')}</p>
        <p>${t('new.savedSub')}</p>
        <div class="btn-row">
          <button class="btn btn--primary btn--lg" data-act="print">${icon('printer')} ${t('act.print')}</button>
          <button class="btn btn--soft btn--lg" data-act="download">${icon('download')} ${t('act.download')}</button>
        </div>
        <div class="btn-row">
          <a class="btn btn--ghost" href="#/note/${encodeURIComponent(note.id)}">${icon('eye')} ${t('new.open')}</a>
          <button class="btn btn--ghost" data-act="again">${icon('plus')} ${t('new.another')}</button>
        </div>
      </div>`;
    toast(`${t('new.saved')} — ${note.number}`);
    let busy = false;
    view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'again') { M.App.navigate(); return; }
      if (busy) return;
      busy = true; b.disabled = true;
      try {
        if (act === 'print') await M.UI.printPdf(note);
        else await M.UI.downloadPdf(note);
      } catch (err) {
        toast(t('err.pdf'), 'error'); console.error(err);
      } finally { busy = false; b.disabled = false; }
    }));
  }

  M.Pages = M.Pages || {};
  M.Pages.new = { render, fieldsHtml, readForm, showErrors, sanitizeWeightInput };
})(self);
