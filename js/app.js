/** App shell: splash, navigation, router, unsaved-changes guard. */
(function (root) {
  'use strict';
  const M = root.Masdar;
  const { t } = M.I18n;
  const { $, $$, icon } = M.UI;

  M.Pages = M.Pages || {};
  let dirty = false;
  let currentHash = null;
  let cleanup = null;
  let ignoreNextHash = false;

  const NAV = [
    { route: 'dashboard', hash: '#/', icon: 'home', label: 'nav.dashboard' },
    { route: 'new', hash: '#/new', icon: 'plus', label: 'nav.new' },
    { route: 'history', hash: '#/history', icon: 'history', label: 'nav.history' },
    { route: 'settings', hash: '#/settings', icon: 'settings', label: 'nav.settings' },
  ];

  function parse(hash) {
    const h = (hash || '#/').replace(/^#/, '');
    const parts = h.split('/').filter(Boolean);
    if (!parts.length) return { route: 'dashboard', params: {} };
    if (parts[0] === 'note' && parts[1]) return { route: 'note', params: { id: decodeURIComponent(parts[1]) } };
    if (['new', 'history', 'settings'].includes(parts[0])) return { route: parts[0], params: {} };
    return { route: 'dashboard', params: {} };
  }

  function renderNav() {
    const items = NAV.map((n) => `
      <a class="nav__link" href="${n.hash}" data-route="${n.route}">
        ${icon(n.icon)}<span>${t(n.label)}</span>
      </a>`).join('');
    $('#nav').innerHTML = items;
    $('#bottom-nav').innerHTML = items;
    $('#lang-toggle').textContent = M.I18n.getLang() === 'ar' ? 'English' : 'العربية';
    M.I18n.apply();
  }

  function highlight(route) {
    const active = route === 'note' ? 'history' : route;
    $$('.nav__link').forEach((a) => a.classList.toggle('is-active', a.dataset.route === active));
  }

  async function navigate() {
    if (ignoreNextHash) { ignoreNextHash = false; return; }
    const next = location.hash || '#/';
    if (dirty && currentHash !== null && next !== currentHash) {
      const leave = await M.UI.confirmDialog({
        title: t('unsaved.title'), body: t('unsaved.body'),
        confirmText: t('unsaved.leave'), cancelText: t('unsaved.stay'),
      });
      if (!leave) { ignoreNextHash = true; location.hash = currentHash; return; }
      dirty = false;
    }
    currentHash = next;
    const { route, params } = parse(next);
    if (typeof cleanup === 'function') { try { cleanup(); } catch (_) { /* noop */ } }
    cleanup = null;
    highlight(route);
    const view = $('#view');
    view.classList.remove('is-entering');
    void view.offsetWidth; // restart the enter animation
    view.classList.add('is-entering');
    view.innerHTML = '';
    root.scrollTo({ top: 0 });
    const page = M.Pages[route];
    try {
      cleanup = await page.render(view, params);
    } catch (err) {
      view.innerHTML = `<div class="empty">${icon('alert')}<p>${M.UI.esc(M.UI.errorMessage(err))}</p></div>`;
    }
  }

  function setDirty(v) { dirty = !!v; }

  // ---------------------------------------------------------------- splash
  function runSplash(show) {
    const el = $('#splash');
    let seen = false;
    try { seen = sessionStorage.getItem('masdar.splash') === '1'; } catch (_) { /* noop */ }
    if (!show || seen) { el.remove(); document.body.classList.add('app-ready'); return Promise.resolve(); }
    try { sessionStorage.setItem('masdar.splash', '1'); } catch (_) { /* noop */ }
    el.classList.add('is-playing');
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        el.classList.add('is-leaving');
        document.body.classList.add('app-ready');
        setTimeout(() => { el.remove(); resolve(); }, 650);
      };
      el.addEventListener('click', finish);
      document.addEventListener('keydown', finish, { once: true });
      setTimeout(finish, 3100);
    });
  }

  async function start() {
    M.I18n.setLang(M.I18n.getLang());
    renderNav();
    $('#lang-toggle').addEventListener('click', () => {
      M.I18n.setLang(M.I18n.getLang() === 'ar' ? 'en' : 'ar');
      renderNav();
      const h = currentHash; currentHash = null; dirty = false;
      location.hash = h || '#/';
      navigate();
    });

    root.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    let settings;
    try {
      await M.Storage.open();
      settings = await M.Storage.getSettings();
    } catch (err) {
      $('#splash') && $('#splash').remove();
      $('#view').innerHTML = `<div class="empty">${icon('alert')}<p>${t('err.db')}</p><small>${M.UI.esc(err.message)}</small></div>`;
      document.body.classList.add('app-ready');
      return;
    }

    // Ask the browser to keep our data even under storage pressure (best effort).
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); }).catch(() => {});
    }

    root.addEventListener('hashchange', navigate);
    const splash = runSplash(settings.showSplash !== false);
    await navigate();
    await splash;
    document.body.classList.add('app-ready');
  }

  M.App = { start, setDirty, navigate };
  document.addEventListener('DOMContentLoaded', start);
})(self);
