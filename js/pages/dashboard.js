/** Dashboard: greeting, quick create, counters, 7-day activity, recent notes, backup reminder. */
(function (root) {
  'use strict';
  const M = root.Masdar;
  const { t } = M.I18n;
  const { icon, esc, countUp } = M.UI;
  const F = M.Format;

  function dayList(n) {
    const out = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      out.push(F.localStamp(x).date);
    }
    return out;
  }

  async function render(view) {
    const [notes, settings, nextNumber] = await Promise.all([
      M.Storage.listNotes(), M.Storage.getSettings(), M.Storage.peekNextNumber(),
    ]);
    const today = F.localStamp().date;
    const month = today.slice(0, 7);
    const todays = notes.filter((n) => n.documentDate === today);
    const sumKg = (arr) => arr.reduce((s, n) => s + n.netKg, 0);
    const monthKg = sumKg(notes.filter((n) => n.documentDate.startsWith(month)));
    const hour = new Date().getHours();
    const locale = M.I18n.getLang() === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB';
    const longDate = `${new Date().toLocaleDateString(locale, { weekday: 'long' })} · ${F.uiDate(today)}`;

    const days = dayList(7);
    const perDay = days.map((d) => notes.filter((n) => n.documentDate === d).length);
    const max = Math.max(1, ...perDay);
    const dayName = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short' });

    const lastBackup = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null;
    const stale = !lastBackup || (Date.now() - lastBackup.getTime()) > 7 * 864e5;

    view.innerHTML = `
      <section class="hero">
        <span class="ring-deco r1"></span><span class="ring-deco r2"></span>
        <div>
          <h1>${t(hour < 12 ? 'greet.morning' : 'greet.evening')}</h1>
          <p>${t('dash.welcome')}</p>
          <div class="hero__meta">
            <span class="hero__pill">${icon('calendar')} ${esc(longDate)}</span>
            <span class="hero__pill">${icon('file')} ${t('dash.next')}: <b class="num">${esc(nextNumber || '—')}</b></span>
          </div>
        </div>
        <a class="btn btn--light btn--lg" href="#/new">${icon('plus')} ${t('dash.newCta')}</a>
      </section>

      <section class="stats">
        <div class="stat"><div class="stat__icon">${icon('file')}</div><div class="stat__value" data-count="${notes.length}">0</div><div class="stat__label">${t('dash.total')}</div></div>
        <div class="stat"><div class="stat__icon">${icon('truck')}</div><div class="stat__value" data-count="${todays.length}">0</div><div class="stat__label">${t('dash.today')}</div></div>
        <div class="stat"><div class="stat__icon">${icon('scale')}</div><div class="stat__value" data-count="${sumKg(todays) / 1000}" data-dec="2">0</div><div class="stat__label">${t('dash.todayTons')}</div></div>
        <div class="stat"><div class="stat__icon">${icon('calendar')}</div><div class="stat__value" data-count="${monthKg / 1000}" data-dec="2">0</div><div class="stat__label">${t('dash.monthTons')}</div></div>
      </section>

      <section class="dash-grid">
        <div class="card">
          <div class="card__head"><h2>${t('dash.recent')}</h2><a class="btn btn--soft btn--sm" href="#/history">${t('dash.viewAll')}</a></div>
          ${notes.length ? `<div class="recent">${notes.slice(0, 6).map((n) => `
            <a class="recent__item" href="#/note/${encodeURIComponent(n.id)}">
              <span class="recent__avatar">${esc(n.driverName.trim().charAt(0))}</span>
              <span class="recent__main"><strong>${esc(n.driverName)}</strong>
                <small><span class="serial">${esc(n.number)}</span> · <span class="num">${esc(n.plateNumber)}</span> · ${esc(F.uiDate(n.documentDate))}</small></span>
              <span class="recent__net"><span class="num">${esc(F.formatKgAsTons(n.netKg))}</span><small>${t('f.ton')}</small></span>
            </a>`).join('')}</div>`
            : `<div class="empty">${icon('file')}<p>${t('dash.empty')}</p><a class="btn btn--primary" href="#/new">${icon('plus')} ${t('dash.newCta')}</a></div>`}
        </div>
        <div class="dash-side">
          <div class="card">
            <div class="card__head"><h2>${t('dash.activity')}</h2></div>
            <div class="bars">${days.map((d, i) => `
              <div class="bar ${d === today ? 'is-today' : ''}">
                <div class="bar__fill" style="height:${Math.max(4, (perDay[i] / max) * 100)}%;animation-delay:${i * 60}ms"><span>${perDay[i] || ''}</span></div>
                <span class="bar__label">${esc(dayName(d))}</span>
              </div>`).join('')}</div>
          </div>
          <div class="card backup-card ${stale ? 'is-stale' : ''}">
            <span class="ic-wrap">${icon(stale ? 'alert' : 'shield')}</span>
            <div>
              <h3>${t('dash.backup')}</h3>
              <p>${lastBackup ? `${t('dash.backupLast')}: <span class="num">${esc(M.UI.stamp(settings.lastBackupAt))}</span>` : t('dash.backupNever')}</p>
              <button class="btn btn--soft btn--sm" id="dash-backup" type="button">${icon('download')} ${t('dash.backupNow')}</button>
            </div>
          </div>
        </div>
      </section>`;

    view.querySelectorAll('[data-count]').forEach((el) => countUp(el, parseFloat(el.dataset.count), parseInt(el.dataset.dec || '0', 10)));
    view.querySelector('#dash-backup').addEventListener('click', async () => {
      await M.Pages.settings.exportBackup();
      render(view);
    });
  }

  M.Pages = M.Pages || {};
  M.Pages.dashboard = { render };
})(self);
