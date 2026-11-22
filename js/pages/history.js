/** History: search (number / driver / plate), date & status filters, open any note. */
(function (root) {
  'use strict';
  const M = root.Masdar;
  const { t } = M.I18n;
  const { icon, esc, statusChip } = M.UI;
  const F = M.Format;

  const PAGE = 50;
  // Filters survive navigating to a note and back
  const state = { q: '', from: '', to: '', status: '', limit: PAGE };

  /** Normalise Arabic for forgiving search (أ/إ/آ -> ا, ة -> ه, ى -> ي, digits). */
  function norm(s) {
    return F.normalizeDigits(String(s || '')).toLowerCase()
      .replace(/[ً-ْـ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ').trim();
  }

  function filter(notes) {
    const q = norm(state.q);
    return notes.filter((n) => {
      if (state.from && n.documentDate < state.from) return false;
      if (state.to && n.documentDate > state.to) return false;
      if (state.status && M.Notes.status(n) !== state.status) return false;
      if (!q) return true;
      return n.number.includes(q.replace(/\s/g, ''))
        || norm(n.driverName).includes(q)
        || norm(n.plateNumber).replace(/[\s-]/g, '').includes(q.replace(/[\s-]/g, ''))
        || norm(n.trailerNumber).replace(/[\s-]/g, '').includes(q.replace(/[\s-]/g, ''));
    });
  }

  /** Date filter that DISPLAYS DD/MON/YY but uses the native calendar picker underneath. */
  function dateField(id, label, value) {
    return `
      <div class="field">
        <span class="field__label">${label}</span>
        <div class="date-field ${value ? 'has-value' : ''}" data-for="${id}">
          ${icon('calendar')}
          <span class="date-field__text num">${value ? esc(F.displayDate(value)) : 'DD/MON/YY'}</span>
          <input class="date-field__native" type="date" id="${id}" value="${esc(value)}" aria-label="${esc(label)}" tabindex="-1">
        </div>
      </div>`;
  }

  function wireDateField(root, id, onChange) {
    const input = root.querySelector('#' + id);
    const box = input.closest('.date-field');
    box.tabIndex = 0;
    box.setAttribute('role', 'button');
    const open = () => { try { input.showPicker(); } catch (_) { input.focus(); input.click(); } };
    box.addEventListener('click', open);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    input.addEventListener('change', () => {
      box.classList.toggle('has-value', !!input.value);
      box.querySelector('.date-field__text').textContent = input.value ? F.displayDate(input.value) : 'DD/MON/YY';
      onChange(input.value);
    });
  }

  async function render(view) {
    const notes = await M.Storage.listNotes();
    view.innerHTML = `
      <div class="page-head">
        <div><span class="eyebrow">${t('nav.history')}</span><h1>${t('hist.title')}</h1><p>${t('hist.sub')}</p></div>
        <a class="btn btn--primary" href="#/new">${icon('plus')} ${t('nav.new')}</a>
      </div>
      <div class="card">
        <div class="filters">
          <div class="field search">
            <span class="sr-only">${t('hist.search')}</span>
            <div class="field__control">${icon('search')}<input class="input" id="h-q" type="search" placeholder="${esc(t('hist.search'))}" value="${esc(state.q)}" autocomplete="off"></div>
          </div>
          ${dateField('h-from', t('hist.from'), state.from)}
          ${dateField('h-to', t('hist.to'), state.to)}
          <label class="field"><span class="field__label">${t('f.status')}</span>
            <select class="input select" id="h-status">
              <option value="">${t('hist.allStatus')}</option>
              ${['new', 'printed', 'reprint'].map((s) => `<option value="${s}" ${state.status === s ? 'selected' : ''}>${t('st.' + s)}</option>`).join('')}
            </select></label>
          <button class="btn btn--ghost" id="h-clear" type="button">${icon('x')} ${t('hist.clear')}</button>
        </div>
        <div class="result-count" id="h-count"></div>
        <div id="h-results"></div>
      </div>`;

    const results = view.querySelector('#h-results');
    const count = view.querySelector('#h-count');

    function draw() {
      const list = filter(notes);
      count.textContent = `${list.length} ${t('hist.count')}`;
      if (!list.length) {
        results.innerHTML = `<div class="empty">${icon('search')}<p>${t(notes.length ? 'hist.none' : 'dash.empty')}</p></div>`;
        return;
      }
      const shown = list.slice(0, state.limit);
      const href = (n) => `#/note/${encodeURIComponent(n.id)}`;
      results.innerHTML = `
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>${t('f.number')}</th><th>${t('f.driver')}</th><th>${t('f.plate')}</th>
            <th>${t('f.date')}</th><th>${t('f.net')}</th><th>${t('f.status')}</th><th></th>
          </tr></thead>
          <tbody>${shown.map((n) => `
            <tr data-href="${href(n)}" tabindex="0">
              <td><span class="serial">${esc(n.number)}</span></td>
              <td>${esc(n.driverName)}</td>
              <td><span class="num">${esc(n.plateNumber)}</span></td>
              <td><span class="num">${esc(F.uiDate(n.documentDate))}</span> <small style="color:var(--muted)" class="num">${esc(F.uiTime(n.exitTime))}</small></td>
              <td><b class="num">${esc(F.formatKgAsTons(n.netKg))}</b> <small>${t('f.ton')}</small></td>
              <td>${statusChip(n)}</td>
              <td><a class="btn btn--soft btn--sm" href="${href(n)}">${icon('eye')} ${t('act.view')}</a></td>
            </tr>`).join('')}</tbody>
        </table></div>
        <div class="cards-list">${shown.map((n) => `
          <a class="note-card" href="${href(n)}">
            <div class="note-card__top"><span class="serial">${esc(n.number)}</span>${statusChip(n)}</div>
            <strong>${esc(n.driverName)}</strong>
            <div class="note-card__meta">
              <span>${icon('truck')} <span class="num">${esc(n.plateNumber)}</span></span>
              <span class="num">${esc(F.uiDate(n.documentDate))}</span>
              <span><b class="num">${esc(F.formatKgAsTons(n.netKg))}</b> ${t('f.ton')}</span>
            </div>
          </a>`).join('')}</div>
        ${list.length > state.limit ? `<div style="text-align:center;margin-top:16px"><button class="btn btn--soft" id="h-more">${t('hist.more')}</button></div>` : ''}`;
      results.querySelectorAll('tr[data-href]').forEach((tr) => {
        tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = tr.dataset.href; });
      });
      const more = results.querySelector('#h-more');
      if (more) more.addEventListener('click', () => { state.limit += PAGE; draw(); });
    }

    let timer = null;
    view.querySelector('#h-q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value; state.limit = PAGE; draw(); }, 120);
    });
    wireDateField(view, 'h-from', (v) => { state.from = v; state.limit = PAGE; draw(); });
    wireDateField(view, 'h-to', (v) => { state.to = v; state.limit = PAGE; draw(); });
    view.querySelector('#h-status').addEventListener('change', (e) => { state.status = e.target.value; state.limit = PAGE; draw(); });
    view.querySelector('#h-clear').addEventListener('click', () => {
      Object.assign(state, { q: '', from: '', to: '', status: '', limit: PAGE });
      render(view);
    });
    draw();
    return () => clearTimeout(timer);
  }

  M.Pages = M.Pages || {};
  M.Pages.history = { render, _filter: filter, _state: state, _norm: norm };
})(self);
