/* Mobile "Today" view — a single, thumb-friendly screen: today's date, the day's
   ordered plan with times, the next upcoming booking, and today's weather.
   Auto-selected when the open trip's date range contains today (see app.js). */
import { esc, splitTime, wmoIcon, pickTodayDay, nextBooking, effectivePlans, gmapsPlaceUrl, planProgress, nextUpcoming, fmtCountdown, replanNudge } from './core.js';
import { tripBookings } from './data.js';
import { dayWeather } from './weather.js';

const TYPE_ICON = { flight: '✈', hotel: '🛏', train: '🚆', bus: '🚌', car: '🚗', activity: '🎟', other: '📌' };

const pad = n => String(n).padStart(2, '0');
function todayIso() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowIso() { const d = new Date(); return `${todayIso()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

const STYLE = `
  .today{max-width:520px;margin:0 auto}
  .t-banner{background:rgba(184,134,11,.14);border:1px solid rgba(184,134,11,.35);border-radius:10px;padding:8px 12px;margin:0 0 12px;font-size:.9rem}
  .t-nudge{display:flex;gap:9px;align-items:flex-start;background:rgba(70,110,150,.12);border:1px solid rgba(70,110,150,.4);border-radius:10px;padding:9px 12px;margin:0 0 12px;font-size:.88rem;line-height:1.4}
  .t-nudge .ti{font-size:1.1rem;line-height:1.2}
  .t-nudge b{font-weight:600}
  .t-head{margin:0 0 14px}
  .t-kick{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:#b8860b;font-weight:600}
  .t-date{font-size:1.5rem;margin:2px 0 0;line-height:1.2}
  .t-wx{color:inherit;opacity:.85;font-size:1rem;margin-left:6px;white-space:nowrap}
  .t-short{margin:2px 0 0;color:#5d564a;font-size:.95rem}
  .t-sec{margin:18px 0 8px;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;color:#5d564a}
  .t-next{display:flex;gap:10px;align-items:flex-start;border:1px solid rgba(128,128,128,.28);border-radius:12px;padding:12px 14px;background:rgba(128,128,128,.05)}
  .t-next .ti{font-size:1.3rem;line-height:1}
  .t-next b{display:block;font-size:1rem}
  .t-next .tw{color:#5d564a;font-size:.85rem;margin-top:2px}
  .t-plan{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .t-plan li{display:flex;gap:12px;align-items:baseline;border:1px solid rgba(128,128,128,.22);border-radius:12px;padding:12px 14px;background:rgba(128,128,128,.04)}
  .t-time{flex:0 0 52px;font-variant-numeric:tabular-nums;font-weight:600;font-size:.92rem;color:#b8860b}
  .t-time.none{color:#a39e92;font-weight:400}
  .t-body{flex:1;min-width:0}
  .t-name{font-size:1.02rem}
  .t-desc{color:#5d564a;font-size:.86rem;margin-top:3px}
  .t-go{flex:0 0 auto;text-decoration:none;font-size:1.1rem;opacity:.7;padding:2px 4px}
  .t-empty{color:#5d564a}
  .t-plan li.t-past{opacity:.5}
  .t-plan li.t-past .t-name{text-decoration:line-through;text-decoration-color:rgba(128,128,128,.5)}
  .t-plan li.t-now{border-color:rgba(184,134,11,.6);background:rgba(184,134,11,.1);box-shadow:0 0 0 1px rgba(184,134,11,.35)}
  .t-plan li.t-next{border-color:rgba(184,134,11,.35)}
  .t-pill{display:inline-block;margin-left:8px;vertical-align:middle;font-size:.62rem;font-weight:700;letter-spacing:.06em;padding:1px 6px;border-radius:999px;line-height:1.5}
  .t-pill-now{background:#b8860b;color:#fff}
  .t-pill-next{background:rgba(184,134,11,.16);color:#b8860b;border:1px solid rgba(184,134,11,.4)}
  .t-up{display:flex;flex-direction:column;gap:8px}
  .t-cd{display:flex;gap:10px;align-items:center;border:1px solid rgba(184,134,11,.35);border-radius:12px;padding:10px 14px;background:rgba(184,134,11,.08)}
  .t-cd .ti{font-size:1.2rem;line-height:1}
  .t-cd .cd-b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .t-cd .cd-b span{color:#5d564a;font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;margin-right:6px}
  .t-cd .cd-t{flex:0 0 auto;font-variant-numeric:tabular-nums;font-weight:700;color:#b8860b}
  @media (max-width:430px){.t-date{font-size:1.3rem}.t-plan li{padding:11px 12px}.t-time{flex-basis:46px}}`;

let cdTimer = null;
function cdHtml(plan, bookings) {
  const { stop, booking } = nextUpcoming(plan, bookings, nowIso());
  const row = (kind, icon, label, name, mins) => `<div class="t-cd">
      <span class="ti">${icon}</span>
      <div class="cd-b"><span>${label}</span>${esc(name)}</div>
      <span class="cd-t">${esc(fmtCountdown(mins))}</span>
    </div>`;
  const rows = [];
  if (stop) rows.push(row('stop', '📍', 'Next stop', stop.name, stop.mins));
  if (booking) rows.push(row('booking', TYPE_ICON[booking.type] || '📌', 'Next booking', booking.name, booking.mins));
  return rows.length ? rows.join('') : `<p class="t-empty">Nothing left scheduled today.</p>`;
}

export function render(root, ctx) {
  const { state } = ctx;
  const iso = todayIso();
  const { day, rel } = pickTodayDay(state.days, iso);
  const ovPlans = (state.overlay.itinerary || {}).dayPlans || null;
  const plan = day ? (effectivePlans(state.days, ovPlans)[day.id] || []) : [];
  const bookings = tripBookings(state, state.trip.id);
  const nb = nextBooking(bookings, nowIso());

  const banner = rel === 'before'
    ? `<div class="t-banner">Trip hasn't started yet — previewing <b>Day ${day._n}</b> (${esc(day._label || day.date || '')}).</div>`
    : rel === 'after'
      ? `<div class="t-banner">Trip's over — showing the last day.</div>`
      : '';
  const kicker = rel === 'today' ? 'Today' : (rel === 'after' ? 'Last day' : `Day ${day ? day._n : ''}`);

  const wx = day && day.ll && day._date
    ? `<span class="t-wx" data-ll="${day.ll[0]},${day.ll[1]}" data-date="${day._date}"></span>` : '';

  // Only mark live progress when the open day is actually today.
  const prog = rel === 'today' ? planProgress(plan, nowIso().slice(11, 16)) : plan.map(() => '');
  const PILL = { now: 'NOW', next: 'NEXT' };
  const planHtml = plan.length
    ? `<ul class="t-plan">${plan.map((p, i) => {
        const [t0] = splitTime(p.time);
        const st = prog[i] || '';
        return `<li class="${st ? 't-' + st : ''}">
          <span class="t-time${t0 ? '' : ' none'}">${esc(t0 || '—')}</span>
          <div class="t-body">
            <div class="t-name"><b>${esc(p.n)}</b>${PILL[st] ? `<span class="t-pill t-pill-${st}">${PILL[st]}</span>` : ''}</div>
            ${p.note || p.d ? `<div class="t-desc">${esc(p.note || p.d)}</div>` : ''}
          </div>
          <a class="t-go" target="_blank" rel="noopener" href="${gmapsPlaceUrl(p.n, p.ll)}" title="Open in Maps">↗</a>
        </li>`;
      }).join('')}</ul>`
    : `<p class="t-empty">No stops planned for this day yet.</p>`;

  // Live "next up" countdowns — only meaningful when the open day is actually today.
  const upHtml = rel === 'today'
    ? `<div class="t-sec">Next up</div><div class="t-up" id="t-up">${cdHtml(plan, bookings)}</div>` : '';

  const nextHtml = nb
    ? `<div class="t-next">
        <span class="ti">${TYPE_ICON[nb.type] || '📌'}</span>
        <div>
          <b>${esc(nb.title)}</b>
          <div class="tw">${esc(String(nb.start).replace('T', ' '))}${nb.confirmation ? ` · ${esc(nb.confirmation)}` : ''}</div>
        </div>
      </div>`
    : `<p class="t-empty">No upcoming bookings.</p>`;

  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="today">
      ${banner}
      <div id="t-nudge"></div>
      <div class="t-head">
        <div class="t-kick">${esc(kicker)}</div>
        <h2 class="t-date">${esc(day ? (day._label || day.date || '') : 'No itinerary')}${wx}</h2>
        ${day && day.short ? `<div class="t-short">${esc(day.short)}</div>` : ''}
      </div>
      ${upHtml}
      <div class="t-sec">Next booking</div>
      ${nextHtml}
      <div class="t-sec">Today's plan</div>
      ${planHtml}
    </div>`;

  // Weather chip (open-meteo; uses last-known cache offline, silent if unavailable).
  root.querySelectorAll('.t-wx[data-ll]').forEach(async el => {
    const ll = el.dataset.ll.split(',').map(Number);
    const w = await dayWeather(ll, el.dataset.date);
    if (w) el.textContent = `${wmoIcon(w.code)} ${Math.round(w.tmax)}°/${Math.round(w.tmin)}°${w.precip ? ' · ' + w.precip + '%' : ''}`;
    // B19: gentle re-plan nudge when a mostly-outdoor day has rain forecast.
    const slot = root.querySelector('#t-nudge');
    const n = replanNudge(plan, w);
    if (slot && n) slot.innerHTML = `<div class="t-nudge">
        <span class="ti">🌧️</span>
        <div>Rain's forecast and most of today is outdoors. Consider indoor swaps nearby — <b>${esc(n.suggest.join(', '))}</b>.</div>
      </div>`;
  });

  // Tick the countdowns each minute; self-stops once this view is gone (re-rendered/navigated away).
  if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  if (rel === 'today') {
    cdTimer = setInterval(() => {
      const el = root.querySelector('#t-up');
      if (!el || !el.isConnected) { clearInterval(cdTimer); cdTimer = null; return; }
      el.innerHTML = cdHtml(plan, bookings);
    }, 60000);
  }
}
