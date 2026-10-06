// מדד אמינות הרכבת — הלוגיקה של העמוד. העיצוב (צבעים, סוג ה-hero, אריחי מפה)
// מגיע מ-window.RAIL_THEME של העמוד המארח; כך חמשת כיווני העיצוב חולקים קוד אחד.
(function(){
'use strict';

const BUCKETS = ['בזמן (עד 5 דק׳)', 'איחור 5–10 דק׳', 'איחור 10–20 דק׳', 'איחור מעל 20 דק׳'];
const T = Object.assign({data: 'data/', hero: 'board', tiles: 'dark', c: {}}, window.RAIL_THEME || {});
const C = Object.assign({ok: '#3DD68C', warn: '#F6B93B', late: '#FB8A4B', bad: '#F26D6D', grid: '#24324A', axis: '#6B7D96', bg: '#0C131D', line: '#6CA8FF', accent: '#F6B93B', none: '#5B6C85', seg: '#F6B93B', dash: '#8FA1B6'}, T.c);
const BCOL = [C.ok, C.warn, C.late, C.bad];
const GRID = C.grid, AXIS = C.axis, BG = C.bg;
const DAYNAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
let IDX = null, ST = {}, SEG = {}, DAYS = [], period = '30', dayD = null, dayData = null, dayCache = {};
let sortL = {k: 'rides', dir: -1}, sortS = {k: 'rides', dir: -1}, rq = '', rfilter = 'all', showAll = false;
const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
const fmt1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('he-IL', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const num = v => v == null ? '—' : Number(v).toLocaleString('he-IL');
const heDate = d => { const [y, m, dd] = d.split('-'); return `${DAYNAMES[new Date(+y, m - 1, +dd).getDay()]}, ${+dd}.${+m}.${y}`; };
const shortDate = d => { const [, m, dd] = d.split('-'); return `${+dd}.${+m}`; };
const hhmm = m => m == null ? '—' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const bucketOf = v => v == null ? -1 : v <= 5 ? 0 : v <= 10 ? 1 : v <= 20 ? 2 : 3;
const delayTxt = v => v == null ? '—' : v > 0.05 ? `+${fmt1(v)}` : v < -0.05 ? `−${fmt1(-v)}` : '0.0';
const dcls = v => v == null ? 'dn' : 'd' + bucketOf(v);
function decodeShape(str) {
  const pts = []; let i = 0, la = 0, lo = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let b, shift = 0, result = 0;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === 0) la += d; else lo += d;
    }
    pts.push([la / 1e5, lo / 1e5]);
  }
  return pts;
}

function load(url) { return fetch(url + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }

// ---------------------------------------------------------------- צבירה
function emptyAgg() { return {rides: 0, fix: 0, meas: 0, term: 0, n: 0, sum: 0, b: [0, 0, 0, 0], med: null, p90: null}; }
function addAgg(t, s) {
  t.rides += s.rides || 0; t.fix += s.fix || 0; t.meas += s.meas || 0; t.term += s.term || 0;
  if (s.n) { t.n += s.n; t.sum += (s.avg || 0) * s.n; (s.b || []).forEach((v, i) => t.b[i] += v); }
}
function finish(t) { t.avg = t.n ? t.sum / t.n : null; t.ok = t.b[0]; t.on = t.n ? t.ok / t.n : null; return t; }
// כל ההגעות לתחנות ביום (כולל תחנות ביניים, בלי המוצא): סכום התחנות — [n, b]
function stopsOf(d) {
  const o = {n: 0, b: [0, 0, 0, 0], st: 0};
  for (const s of Object.values(d.stations || {})) { if (s.n) { o.n += s.n; o.st++; (s.b || []).forEach((v, i) => o.b[i] += v); } }
  return o;
}
function aggregate(days) {
  const acc = emptyAgg(); const lines = {}, hours = {}, stations = {};
  acc.sn = 0; acc.sb = [0, 0, 0, 0]; acc.sst = 0;
  for (const d of days) {
    addAgg(acc, d);
    const so = stopsOf(d); acc.sn += so.n; so.b.forEach((v, i) => acc.sb[i] += v); acc.sst = Math.max(acc.sst, so.st);
    for (const [k, s] of Object.entries(d.lines || {})) addAgg(lines[k] || (lines[k] = emptyAgg()), s);
    for (const [k, s] of Object.entries(d.hours || {})) addAgg(hours[k] || (hours[k] = emptyAgg()), s);
    for (const [k, s] of Object.entries(d.stations || {})) addAgg(stations[k] || (stations[k] = emptyAgg()), s);
  }
  if (days.length === 1) { acc.med = days[0].med; acc.p90 = days[0].p90; }
  finish(acc);
  Object.values(lines).forEach(finish); Object.values(hours).forEach(finish); Object.values(stations).forEach(finish);
  if (days.length === 1) {
    for (const [k, s] of Object.entries(days[0].lines || {})) if (lines[k]) { lines[k].med = s.med; lines[k].p90 = s.p90; }
    for (const [k, s] of Object.entries(days[0].stations || {})) if (stations[k]) { stations[k].med = s.med; stations[k].p90 = s.p90; }
  }
  return {acc, lines, hours, stations, days};
}
// יום שבו דאטאבוס קלט שידורים מפחות ממחצית הרכבות (16.08: 17 מתוך 660) —
// המדד שלו אינו מייצג: מוחרג מצבירות התקופה, מסומן בגרף כפער, ומוצג בנפרד
const partial = d => d.rides > 0 && d.fix < d.rides * 0.5;
function windowDays() {
  if (period === 'day') return DAYS.filter(d => d.d === dayD);
  if (period === 'all') return DAYS;
  return DAYS.slice(-Number(period));
}
function selectedDays() { return period === 'day' ? windowDays() : windowDays().filter(d => !partial(d)); }

// ---------------------------------------------------------------- תרשימים
function lineChart(el, pts, o) {
  const W = o.w || 720, H = o.h || 200, L = 36, R = 8, T = 12, B = 26;
  const vals = pts.map(p => p.y).filter(v => v != null);
  if (!vals.length) { el.innerHTML = '<div class="empty">אין נתונים</div>'; return; }
  let mn = o.min != null ? o.min : Math.min(...vals), mx = o.max != null ? o.max : Math.max(...vals);
  if (mx === mn) { mx += 1; mn -= 1; }
  const px = i => L + (W - L - R) * (pts.length > 1 ? i / (pts.length - 1) : 0.5);
  const py = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
  const ticks = 4; let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = mn + (mx - mn) * i / ticks, y = py(v);
    grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRID}"/><text x="${L - 6}" y="${y + 4}" font-size="10" fill="${AXIS}" text-anchor="end">${o.fmtY ? o.fmtY(v) : Math.round(v)}${o.unit || ''}</text>`;
  }
  let path = '', area = '', dots = '', started = false;
  pts.forEach((p, i) => {
    if (p.y == null) { started = false; return; }
    const x = px(i), y = py(p.y);
    path += (started ? 'L' : 'M') + x + ' ' + y;
    if (!started) area += `M${x} ${py(mn)}L${x} ${y}`; else area += `L${x} ${y}`;
    started = true;
    if (pts.length <= 60 || i === pts.length - 1) dots += `<circle cx="${x}" cy="${y}" r="${i === pts.length - 1 ? 4.5 : 2.5}" fill="${i === pts.length - 1 ? C.accent : o.color}" stroke="${BG}" stroke-width="1.5"/>`;
    if ((i + 1 < pts.length && pts[i + 1].y == null) || i === pts.length - 1) area += `L${x} ${py(mn)}Z`;
  });
  const step = Math.max(1, Math.ceil(pts.length / 8)); let xl = '';
  pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) xl += `<text x="${px(i)}" y="${H - 8}" font-size="10" fill="${AXIS}" text-anchor="middle">${esc(p.x)}</text>`; });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}">${grid}${xl}<path d="${area}" fill="${o.color}" opacity=".10"/><path d="${path}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round"/><line id="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${C.accent}" stroke-dasharray="3 3" opacity="0" /><rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" id="hit"/>${dots}</svg><div class="tip"></div>`;
  const svg = $('svg', el), tip = $('.tip', el), cross = $('#cross', el);
  const move = ev => {
    const r = svg.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width * W;
    let best = 0, bd = 1e9; pts.forEach((p, i) => { const d = Math.abs(px(i) - fx); if (d < bd) { bd = d; best = i; } });
    const p = pts[best]; cross.setAttribute('x1', px(best)); cross.setAttribute('x2', px(best)); cross.setAttribute('opacity', '1');
    tip.innerHTML = p.tip; tip.style.display = 'block';
    const leftPct = px(best) / W * 100; tip.style.right = `${100 - leftPct}%`; tip.style.top = `${Math.max(0, py(p.y == null ? mn : p.y) / H * r.height - 60)}px`;
  };
  el.onmousemove = move; el.ontouchstart = ev => move(ev.touches[0]); el.ontouchmove = ev => move(ev.touches[0]);
  el.onmouseleave = () => { tip.style.display = 'none'; cross.setAttribute('opacity', '0'); };
}
function barChart(el, bars, o) {
  const W = o.w || 720, H = o.h || 180, L = 36, R = 8, T = 12, B = 26, mx = o.max || 100;
  const n = bars.length, bw = (W - L - R) / n, gap = Math.min(4, bw * .25);
  const py = v => T + (H - T - B) * (1 - v / mx);
  let grid = ''; for (let i = 0; i <= 4; i++) { const v = mx * i / 4, y = py(v); grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRID}"/><text x="${L - 6}" y="${y + 4}" font-size="10" fill="${AXIS}" text-anchor="end">${Math.round(v)}${o.unit || ''}</text>`; }
  let rects = '', xl = '';
  bars.forEach((b, i) => {
    const x = L + i * bw + gap / 2;
    if (b.y != null) rects += `<rect x="${x}" y="${py(b.y)}" width="${bw - gap}" height="${py(0) - py(b.y)}" rx="2" fill="${b.color || o.color}"/>`;
    else rects += `<rect x="${x}" y="${py(0) - 2}" width="${bw - gap}" height="2" rx="1" fill="${GRID}"/>`;
    if (n <= 26 || i % 2 === 0) xl += `<text x="${x + (bw - gap) / 2}" y="${H - 8}" font-size="10" fill="${AXIS}" text-anchor="middle">${esc(b.x)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}">${grid}${rects}${xl}</svg><div class="tip"></div>`;
  const tip = $('.tip', el), svg = $('svg', el);
  el.onmousemove = ev => {
    const r = svg.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width * W; const i = Math.min(n - 1, Math.max(0, Math.floor((fx - L) / bw)));
    const b = bars[i]; if (!b) return; tip.innerHTML = b.tip; tip.style.display = 'block';
    tip.style.right = `${100 - (L + (i + .5) * bw) / W * 100}%`; tip.style.top = `${Math.max(0, py(b.y || 0) / H * r.height - 60)}px`;
  };
  el.onmouseleave = () => { tip.style.display = 'none'; };
}

// ---------------------------------------------------------------- תצוגה
const HEMONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
let calOpen = false, calYM = null;
// לוח שנה משלנו במקום בורר התאריכים של הדפדפן: רק ימים שיש להם נתונים ניתנים
// לבחירה, השאר אפורים (שלמה 05.09: "לנעול תאריכים שאין לנו")
function calHtml() {
  const [y, m] = calYM;
  const nDays = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const byD = new Map(DAYS.map(d => [d.d, d]));
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<span></span>');
  for (let day = 1; day <= nDays; day++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = byD.get(iso);
    if (!d) { cells.push(`<span class="cd off">${day}</span>`); continue; }
    const cls = ['cd', partial(d) ? 'part' : '', iso === dayD && period === 'day' ? 'on' : ''].filter(Boolean).join(' ');
    const tip = partial(d) ? `שידור חלקי: ${num(d.fix)} מתוך ${num(d.rides)} רכבות` : d.n ? `${pct(d.b[0], d.n)} בזמן · ${num(d.rides)} רכבות` : `${num(d.rides)} רכבות`;
    cells.push(`<button class="${cls}" data-d="${iso}" title="${tip}">${day}</button>`);
  }
  const mm = String(m + 1).padStart(2, '0');
  const canPrev = DAYS[0].d < `${y}-${mm}-01`, canNext = DAYS[DAYS.length - 1].d > `${y}-${mm}-${nDays}`;
  return `<div class="calhead"><button class="cnav" data-nav="-1" title="חודש קודם" ${canPrev ? '' : 'disabled'}>‹</button><b>${HEMONTHS[m]} ${y}</b><button class="cnav" data-nav="1" title="חודש הבא" ${canNext ? '' : 'disabled'}>›</button></div>
    <div class="calgrid">${['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(w => `<i>${w}׳</i>`).join('')}${cells.join('')}</div>
    <div class="calnote">אפור בהיר: אין נתונים · נקודה: שידור חלקי באותו יום</div>`;
}
function renderCal() {
  const cal = $('#cal'); if (!cal) return;
  cal.hidden = !calOpen;
  if (!calOpen) return;
  cal.innerHTML = calHtml();
  cal.querySelectorAll('.cnav').forEach(b => b.onclick = e => { e.stopPropagation(); let [y, m] = calYM; m += Number(b.dataset.nav); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } calYM = [y, m]; renderCal(); });
  cal.querySelectorAll('button.cd').forEach(b => b.onclick = e => { e.stopPropagation(); calOpen = false; dayD = b.dataset.d; period = 'day'; render(); });
}
document.addEventListener('click', e => { if (calOpen && !e.target.closest('.dwrap')) { calOpen = false; renderCal(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && calOpen) { calOpen = false; renderCal(); } });

function renderPeriods() {
  const el = $('#periods');
  const chips = [['7', '7 ימים'], ['30', '30 ימים'], ['90', '90 ימים'], ['all', 'כל התקופה']].filter(([k]) => k === 'all' || DAYS.length > Number(k) || k === '7');
  const curD = dayD || DAYS[DAYS.length - 1].d;
  if (!calYM) calYM = [Number(curD.slice(0, 4)), Number(curD.slice(5, 7)) - 1];
  el.innerHTML = `<div class="seg">${chips.map(([k, t]) => `<button class="pchip${period === k ? ' on' : ''}" data-p="${k}">${t}</button>`).join('')}</div>` +
    `<div class="daynav${period === 'day' ? ' on' : ''}"><button id="dprev" title="יום קודם">‹</button><div class="dwrap"><button id="dpick" class="dbtn" title="בחירת יום">${period === 'day' ? heDate(curD) : 'בחירת יום ▾'}</button><div id="cal" class="cal" hidden></div></div><button id="dnext" title="יום הבא">›</button></div>`;
  el.querySelectorAll('.pchip').forEach(b => b.onclick = () => { period = b.dataset.p; render(); });
  const setDay = d => { if (!DAYS.some(x => x.d === d)) return; dayD = d; period = 'day'; render(); };
  $('#dpick').onclick = e => { e.stopPropagation(); calOpen = !calOpen; if (calOpen) calYM = [Number(curD.slice(0, 4)), Number(curD.slice(5, 7)) - 1]; renderCal(); };
  const cur = () => DAYS.findIndex(x => x.d === curD);
  $('#dprev').onclick = () => { const i = cur(); if (period !== 'day') setDay(DAYS[DAYS.length - 1].d); else if (i > 0) setDay(DAYS[i - 1].d); };
  $('#dnext').onclick = () => { const i = cur(); if (period !== 'day') setDay(DAYS[DAYS.length - 1].d); else if (i < DAYS.length - 1) setDay(DAYS[i + 1].d); };
  renderCal();
}

function heroHtml(a, days) {
  const noFix = a.rides - a.fix;
  const title = days.length === 1 ? heDate(days[0].d) : days.length ? `${shortDate(days[0].d)} – ${shortDate(days[days.length - 1].d)}.${days[days.length - 1].d.slice(0, 4)} · ${days.length} ימים` : '';
  const on = a.n ? pct(a.ok, a.n) : '—', avg = a.avg == null ? '—' : fmt1(a.avg), b3 = a.n ? pct(a.b[3], a.n) : '—';
  const items = [
    ['איחור ממוצע', avg, 'דק׳', a.med != null ? `חציון ${fmt1(a.med)} · 90% עד ${fmt1(a.p90)} דק׳` : `על ${num(a.n)} רכבות שנמדדו`],
    ['מעל 20 דקות', b3, '', `${num(a.b[3])} רכבות · מעל 10 דק׳: ${a.n ? pct(a.b[2] + a.b[3], a.n) : '—'}`],
    ['נסיעות בלו״ז', num(a.rides), '', `נמדדו ${pct(a.n, a.rides)} · עד היעד עצמו ${pct(a.term, a.n)}`],
    ['ללא שידור', pct(noFix, a.rides), '', `${num(noFix)} נסיעות · ביטול או תקלת שידור`],
  ];
  const cap = `${title} · לפי האיחור בתחנה האחרונה שנמדדה בכל נסיעה (היעד, או הקרובה אליו) · ${num(a.n)} רכבות`;
  if (T.hero === 'headline') {
    // עיתון: כותרת-ענק ושורת נתונים
    return `<div class="head"><div class="big">${on}</div><div class="deck"><b>מהרכבות הגיעו בזמן</b><span>${esc(cap)}</span></div></div>
      <ul class="strip">${items.map(([l, v, u, c]) => `<li><b>${v}${u ? `<i>${u}</i>` : ''}</b><span>${l}</span><small>${c}</small></li>`).join('')}</ul>`;
  }
  if (T.hero === 'tickets') {
    return `<div class="tickets"><div class="ticket main"><span class="stub">בזמן</span><div class="tk"><b>${on}</b><span>רכבות שהגיעו בזמן</span><small>${esc(cap)}</small></div></div>
      ${items.map(([l, v, u, c]) => `<div class="ticket"><span class="stub"></span><div class="tk"><b>${v}${u ? `<i>${u}</i>` : ''}</b><span>${l}</span><small>${c}</small></div></div>`).join('')}</div>`;
  }
  if (T.hero === 'ring') {
    const r = 54, circ = 2 * Math.PI * r, share = a.n ? a.ok / a.n : 0;
    const segs = a.n ? a.b.map(v => v / a.n) : [0, 0, 0, 0];
    let off = 0, arcs = '';
    segs.forEach((s, i) => { if (s > 0) arcs += `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${BCOL[i]}" stroke-width="14" stroke-dasharray="${(s * circ).toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(-off * circ).toFixed(1)}" transform="rotate(-90 70 70)"/>`; off += s; });
    // המדד השני (שלמה 06.09): גם תחנות הביניים — כל הגעה לתחנה נספרת, לא רק היעד
    const stopsLine = a.sn ? `<div class="stopsline"><b>${pct(a.sb[0], a.sn)}</b> מההגעות לתחנות היו בזמן, כולל תחנות הביניים <small>· ${num(a.sn)} הגעות שנמדדו ב-${num(a.sst)} תחנות · ${pct(a.sb[3], a.sn)} מעל 20 דק׳</small></div>` : '';
    return `<div class="ringwrap"><div class="ring"><svg viewBox="0 0 140 140"><circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--line)" stroke-width="14"/>${arcs}</svg><div class="rv"><b>${on}</b><span>בזמן ביעד</span></div></div>
      <div class="rtext"><h2>${Math.round(share * 100) || 0}% מהרכבות הגיעו בזמן ליעד</h2><p>${esc(cap)}</p><div class="rstats">${items.map(([l, v, u, c]) => `<div><b>${v}${u ? `<i>${u}</i>` : ''}</b><span>${l}</span><small>${c}</small></div>`).join('')}</div>${stopsLine}</div></div>`;
  }
  if (T.hero === 'signage') {
    return `<div class="sign"><div class="sign-main"><span class="sl">רכבות בזמן</span><b>${on}</b><span class="sc">${esc(cap)}</span></div>
      <div class="sign-row">${items.map(([l, v, u, c]) => `<div class="sg"><span class="sl">${l}</span><b>${v}${u ? `<i>${u}</i>` : ''}</b><span class="sc">${c}</span></div>`).join('')}</div></div>`;
  }
  return `<div class="board">
    <div class="cell hero"><span class="lbl">רכבות שהגיעו בזמן</span><span class="num">${on}</span><span class="cap">${esc(cap)}</span></div>
    ${items.map(([l, v, u, c]) => `<div class="cell"><span class="lbl">${l}</span><span class="num">${v}${u ? `<i>${u}</i>` : ''}</span><span class="cap">${c}</span></div>`).join('')}
  </div>`;
}
function distHtml(a) {
  if (!a.n) return '';
  return `<div class="dist">${a.b.map((v, i) => v ? `<i class="s${i}" style="flex:${v}" title="${BUCKETS[i]}: ${num(v)}"></i>` : '').join('')}</div>
    <div class="legend">${a.b.map((v, i) => `<span><i style="background:${BCOL[i]}"></i>${BUCKETS[i]} · ${pct(v, a.n)} (${num(v)})</span>`).join('')}</div>`;
}
function sortRows(rows, s) {
  return rows.sort((x, y) => { const a = x[s.k], b = y[s.k]; if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; return (a < b ? -1 : a > b ? 1 : 0) * s.dir; });
}
function th(label, k, s) { return `<th data-k="${k}" class="${s.k === k ? 'on' : ''}">${label}${s.k === k ? (s.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`; }
function linesTable(lines) {
  const rows = Object.entries(lines).map(([nm, s]) => ({nm, rides: s.rides, n: s.n, on: s.on, avg: s.avg, b3: s.n ? s.b[3] / s.n : null, med: s.med}));
  sortRows(rows, sortL);
  const single = period === 'day';
  return `<div class="tblbox"><table id="tl"><thead><tr>${th('קו', 'nm', sortL)}${th('נסיעות', 'rides', sortL)}${th('נמדדו', 'n', sortL)}${th('בזמן', 'on', sortL)}${th('איחור ממוצע', 'avg', sortL)}${single ? th('חציון', 'med', sortL) : ''}${th('מעל 20 דק׳', 'b3', sortL)}</tr></thead><tbody>` +
    rows.map(r => `<tr class="v" tabindex="0" data-nm="${esc(r.nm)}" title="לחיצה: באיזו תחנה הקו מתעכב"><td class="nm">${esc(r.nm) || '—'} <small class="go">פירוט לפי תחנה ←</small></td><td>${num(r.rides)}</td><td>${num(r.n)}</td><td>${r.on == null ? '—' : Math.round(r.on * 100) + '%'}<span class="bar"><i style="width:${Math.round((r.on || 0) * 100)}%"></i></span></td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td>${single ? `<td>${r.med == null ? '—' : fmt1(r.med) + ' דק׳'}</td>` : ''}<td>${r.b3 == null ? '—' : Math.round(r.b3 * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>';
}
function stationsTable(stations) {
  const rows = Object.entries(stations).map(([c, s]) => ({c, nm: (ST[c] || [])[0] || c, rides: s.rides, n: s.n, on: s.on, avg: s.avg, b3: s.n ? s.b[3] / s.n : null}));
  sortRows(rows, sortS);
  return `<div class="tblbox"><table id="ts"><thead><tr>${th('תחנה', 'nm', sortS)}${th('נסיעות', 'rides', sortS)}${th('נמדדו', 'n', sortS)}${th('בזמן', 'on', sortS)}${th('איחור ממוצע', 'avg', sortS)}${th('מעל 20 דק׳', 'b3', sortS)}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm">${esc(r.nm)}</td><td>${num(r.rides)}</td><td>${num(r.n)} <small style="color:var(--dim)">(${pct(r.n, r.rides)})</small></td><td>${r.on == null ? '—' : Math.round(r.on * 100) + '%'}<span class="bar"><i style="width:${Math.round((r.on || 0) * 100)}%"></i></span></td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b3 == null ? '—' : Math.round(r.b3 * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>';
}

// קטגוריות (שלמה 17.09: "העמוד עמוס, במיוחד בטלפון"): הסיכום הגדול תמיד למעלה, מתחתיו רק הקטגוריה שנבחרה.
// "לוח הנסיעות" קיים רק ביום בודד. במחשב הקטגוריות בתפריט צד, בטלפון בשורה שנגללת (CSS).
const TABS = [['overview', 'מבט כללי'], ['rides', 'לוח הנסיעות'], ['lines', 'לפי קו'], ['stations', 'לפי תחנה'], ['gain', 'איפה נצבר איחור']];
let tab = 'overview';
function tabBadge(k, A, days) {
  switch (k) {
    case 'overview': return A.acc.n ? pct(A.acc.ok, A.acc.n) + ' בזמן ליעד' : '';
    case 'rides': return days[0] && days[0].rides ? num(days[0].rides) + ' רכבות' : '';
    case 'lines': return num(Object.keys(A.lines).length) + ' קווים';
    case 'stations': return num(Object.keys(A.stations).length) + ' תחנות';
  }
  return '';
}
function showTab(k) {
  const avail = TABS.filter(([x]) => x !== 'rides' || period === 'day').map(([x]) => x);
  if (!avail.includes(k)) k = 'overview';
  tab = k;
  document.querySelectorAll('.tabsec').forEach(el => el.classList.toggle('off', el.dataset.tab !== k));
  document.querySelectorAll('#tabbar .tab').forEach(b => { const on = b.dataset.t === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  const h = (period === 'day' && dayD ? dayD : '') + (k !== 'overview' ? '/' + k : '');
  history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  if (k === 'gain') renderGain();
}
function render() {
  renderPeriods();
  const days = selectedDays();
  const A = aggregate(days);
  const app = $('#app');
  const last = DAYS[DAYS.length - 1];
  $('#sub').innerHTML = `כל רכבת שבלו״ז של רכבת ישראל מול המיקום ששידרה בפועל, מנתוני <b>דאטאבוס</b>. שני מספרים: כמה רכבות הגיעו <b>ליעד</b> בזמן (עד 5 דקות איחור בתחנה האחרונה שנמדדה), וכמה מההגעות <b>לתחנות</b>, כולל תחנות הביניים, היו בזמן. ${DAYS.length > 1 ? `נתונים מ-${heDate(DAYS[0].d)} עד ${heDate(last.d)}` : `נתונים ל${heDate(last.d)}`} · מתעדכן כל לילה.`;
  const skipped = period === 'day' ? [] : windowDays().filter(partial);
  let html = '';
  if (period === 'day' && days[0] && partial(days[0])) html += `<div class="warn">ביום זה דאטאבוס קלט שידורי מיקום רק מ-${num(days[0].fix)} מתוך ${num(days[0].rides)} רכבות שבלו״ז. המספרים של היום הזה אינם מייצגים, והוא אינו נכלל בממוצעי התקופה.</div>`;
  html += heroHtml(A.acc, days);
  if (skipped.length) html += `<div class="warn">לא נכללו ${skipped.length} ימים שבהם דאטאבוס קלט שידורים מפחות ממחצית הרכבות: ${skipped.map(d => `${shortDate(d.d)} (${num(d.fix)} מתוך ${num(d.rides)})`).join(', ')}.</div>`;
  html += `<div class="tabbar" id="tabbar" role="tablist">${TABS.filter(([k]) => k !== 'rides' || period === 'day').map(([k, t]) => { const b = tabBadge(k, A, days); return `<button class="tab${tab === k ? ' on' : ''}" role="tab" aria-selected="${tab === k}" data-t="${k}">${t}${b ? `<small>${b}</small>` : ''}</button>`; }).join('')}</div>`;
  html += `<div class="tabsec" data-tab="overview"><div class="cols2">
    <div class="panel"><p class="ptitle">התפלגות האיחור ביעד <small>${num(A.acc.n)} רכבות</small></p><p class="pdesc">לכל רכבת נספר האיחור בתחנה האחרונה שנמדדה בה. עיכוב באמצע הדרך שנסגר עד היעד לא מופיע כאן.</p>${distHtml(A.acc) || '<div class="empty">אין רכבות שנמדדו</div>'}</div>
    <div class="panel"><p class="ptitle">התפלגות ההגעות לתחנות <small>${num(A.acc.sn)} הגעות, כולל תחנות ביניים</small></p><p class="pdesc">כל הגעה של רכבת לתחנה נספרת פעם אחת, גם בתחנות הביניים. כאן עיכוב באמצע הדרך כן נספר, גם אם הרכבת השלימה אותו עד היעד.</p>${distHtml({n: A.acc.sn, b: A.acc.sb}) || '<div class="empty">אין הגעות שנמדדו</div>'}</div>
  </div>`;
  if (period !== 'day') {
    html += `<div class="cols2">
      <div class="panel"><p class="ptitle">רכבות בזמן ליעד, יום אחרי יום</p><div class="chart" id="c-on"></div></div>
      <div class="panel"><p class="ptitle">הגעות בזמן לתחנות, יום אחרי יום <small>כולל תחנות ביניים</small></p><div class="chart" id="c-son"></div></div>
    </div>
    <div class="panel"><p class="ptitle">איחור ממוצע ביעד, יום אחרי יום <small>דקות</small></p><div class="chart" id="c-avg"></div></div>`;
  }
  html += `<div class="panel"><p class="ptitle">בזמן לפי שעת היציאה <small>אחוז הרכבות שנמדדו באיחור של עד 5 דק׳</small></p><div class="chart" id="c-hours"></div></div></div>`;
  if (period === 'day') html += `<div class="tabsec" data-tab="rides"><div class="panel" id="rides-panel"><p class="ptitle">לוח הנסיעות של היום <small id="rides-n"></small></p><div class="filters"><input id="rq" placeholder="חיפוש: קו, תחנה, מספר רכבת" value="${esc(rq)}">${[['all', 'הכול'], ['late', 'איחור מעל 5 דק׳'], ['bad', 'מעל 20 דק׳'], ['none', 'ללא שידור']].map(([k, t]) => `<button class="fchip${rfilter === k ? ' on' : ''}" data-f="${k}">${t}</button>`).join('')}</div><div id="rides"><div class="empty">טוען…</div></div></div></div>`;
  html += `<div class="tabsec" data-tab="lines"><div class="panel"><p class="ptitle">לפי קו <small>${Object.keys(A.lines).length} קווים</small></p>${linesTable(A.lines)}</div></div>`;
  html += `<div class="tabsec" data-tab="gain"><div id="gainbox"><div class="panel"><div class="empty">טוען…</div></div></div></div>`;
  html += `<div class="tabsec" data-tab="stations"><div class="panel"><p class="ptitle">לפי תחנה <small>איחור ההגעה לתחנה, בנסיעות שנמדדו בה</small></p>${stationsTable(A.stations)}</div></div>`;
  app.innerHTML = html;
  $('#tabbar').onclick = e => { const b = e.target.closest('button.tab'); if (b) showTab(b.dataset.t); };
  showTab(tab);
  if (period !== 'day') {
    const wd = windowDays();
    lineChart($('#c-on'), wd.map(d => ({x: shortDate(d.d), y: partial(d) ? null : d.n ? Math.round(d.b[0] / d.n * 1000) / 10 : null, tip: partial(d) ? `<b>${heDate(d.d)}</b><br>שידור חלקי: ${num(d.fix)} מתוך ${num(d.rides)} רכבות — לא נכלל` : `<b>${heDate(d.d)}</b><br>בזמן: ${d.n ? pct(d.b[0], d.n) : '—'} מתוך ${num(d.n)} רכבות שנמדדו<br>ממוצע ${fmt1(d.avg)} דק׳ · ללא שידור ${pct(d.rides - d.fix, d.rides)}`})), {min: 0, max: 100, unit: '%', color: C.ok});
    lineChart($('#c-son'), wd.map(d => { const so = stopsOf(d); return {x: shortDate(d.d), y: partial(d) || !so.n ? null : Math.round(so.b[0] / so.n * 1000) / 10, tip: partial(d) ? `<b>${heDate(d.d)}</b><br>שידור חלקי — לא נכלל` : `<b>${heDate(d.d)}</b><br>בזמן: ${pct(so.b[0], so.n)} מתוך ${num(so.n)} הגעות לתחנות<br>מעל 20 דק׳: ${pct(so.b[3], so.n)}`}; }), {min: 0, max: 100, unit: '%', color: C.line});
    lineChart($('#c-avg'), wd.map(d => ({x: shortDate(d.d), y: partial(d) ? null : d.n ? d.avg : null, tip: partial(d) ? `<b>${heDate(d.d)}</b><br>שידור חלקי: ${num(d.fix)} מתוך ${num(d.rides)} רכבות — לא נכלל` : `<b>${heDate(d.d)}</b><br>איחור ממוצע ${fmt1(d.avg)} דק׳ · חציון ${fmt1(d.med)}<br>90% מהרכבות עד ${fmt1(d.p90)} דק׳`})), {min: 0, color: C.line, fmtY: v => v.toFixed(1)});
  }
  barChart($('#c-hours'), Array.from({length: 24}, (_, h) => { const s = A.hours[String(h)]; const y = s && s.n ? Math.round(s.ok / s.n * 100) : null; return {x: String(h), y, color: y == null ? GRID : y >= 90 ? C.ok : y >= 75 ? C.warn : C.bad, tip: s ? `<b>יציאה בשעה ${h}:00–${h}:59</b><br>בזמן ${y == null ? '—' : y + '%'} מתוך ${num(s.n)} שנמדדו (${num(s.rides)} בלו״ז)<br>איחור ממוצע ${fmt1(s.avg)} דק׳` : `<b>${h}:00</b><br>אין נסיעות`}; }), {max: 100, unit: '%', color: C.ok});
  app.querySelectorAll('#tl tr.v').forEach(tr => { const go = () => openLine(tr.dataset.nm); tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  app.querySelectorAll('#tl th').forEach(h => h.onclick = () => { const k = h.dataset.k; sortL = {k, dir: sortL.k === k ? -sortL.dir : (k === 'nm' ? 1 : -1)}; render(); });
  app.querySelectorAll('#ts th').forEach(h => h.onclick = () => { const k = h.dataset.k; sortS = {k, dir: sortS.k === k ? -sortS.dir : (k === 'nm' ? 1 : -1)}; render(); });
  if (period === 'day') {
    $('#rq').oninput = e => { rq = e.target.value; showAll = false; renderRides(); };
    app.querySelectorAll('.fchip').forEach(b => b.onclick = () => { rfilter = b.dataset.f; showAll = false; app.querySelectorAll('.fchip').forEach(x => x.classList.toggle('on', x === b)); renderRides(); });
    loadDay(dayD).then(renderRides);
  }
}

function loadDay(d) {
  if (dayCache[d]) { dayData = dayCache[d]; return Promise.resolve(dayData); }
  return load(`${T.data}days/${d}.json`).then(j => { dayCache[d] = j; dayData = j; return j; }).catch(() => { dayData = null; });
}
// שורת תחנה בקובץ היום: [קוד, זמן מתוכנן (דקות מתחילת היום), איחור הגעה, מרחק השידור הקרוב]
// r.fi = התחנה האחרונה שנמדדה; האיחור בה הוא איחור הנסיעה
function rideFinal(r) { return r.fi == null ? null : r.s[r.fi][2]; }
function rideMeasured(r) { return r.s.filter((x, i) => i > 0 && x[2] != null).length; }
function rideReach(r) { return r.fi == null ? '' : r.fi === r.s.length - 1 ? '' : `עד ${(ST[r.s[r.fi][0]] || [])[0] || ''}`; }
function statusOf(r) {
  const fd = rideFinal(r), b = bucketOf(fd);
  if (!r.fx) return '<span class="st sn">ללא שידור</span>';
  if (fd == null) return '<span class="st sn">לא נמדד</span>';
  return `<span class="st s${b}">${['בזמן', 'איחור קל', 'איחור', 'איחור חמור'][b]}</span>`;
}
function renderRides() {
  const box = $('#rides'); if (!box) return;
  if (!dayData || dayData.d !== dayD) { box.innerHTML = '<div class="empty">אין פירוט נסיעות ליום הזה</div>'; return; }
  const q = rq.trim().toLowerCase();
  let rides = dayData.rides.filter(r => {
    const fd = rideFinal(r);
    if (rfilter === 'late' && !(fd != null && fd > 5)) return false;
    if (rfilter === 'bad' && !(fd != null && fd > 20)) return false;
    if (rfilter === 'none' && r.fx) return false;
    if (!q) return true;
    const hay = (r.nm + ' ' + r.tn + ' ' + r.s.map(x => (ST[x[0]] || [])[0] || '').join(' ')).toLowerCase();
    return hay.includes(q);
  });
  $('#rides-n').textContent = `${num(rides.length)} מתוך ${num(dayData.rides.length)}`;
  const shown = showAll ? rides : rides.slice(0, 120);
  box.innerHTML = `<div class="tblbox"><table><thead><tr><th>יציאה</th><th>קו</th><th>רכבת</th><th>תחנות שנמדדו</th><th>איחור</th><th></th></tr></thead><tbody>` +
    shown.map(r => { const fd = rideFinal(r); const idx = dayData.rides.indexOf(r); const reach = rideReach(r);
      return `<tr class="v" data-i="${idx}" tabindex="0"><td class="mono t">${hhmm(r.s[0] ? r.s[0][1] : null)}</td><td class="nm">${esc(r.nm)}</td><td class="mono" style="color:var(--mut)">${esc(r.tn) || '—'}</td><td>${rideMeasured(r)}/${Math.max(0, r.s.length - 1)}</td><td><span class="mono ${dcls(fd)}">${fd == null ? '—' : delayTxt(fd)}</span>${reach ? ` <small style="color:var(--dim)">${esc(reach)}</small>` : ''}</td><td>${statusOf(r)}</td></tr>`; }).join('') +
    '</tbody></table></div>' + (rides.length > shown.length ? `<button class="more" id="more">הצגת כל ${num(rides.length)} הנסיעות</button>` : '');
  box.querySelectorAll('tr.v').forEach(tr => { const open = () => openRide(dayData.rides[+tr.dataset.i]); tr.onclick = open; tr.onkeydown = e => { if (e.key === 'Enter') open(); }; });
  const more = $('#more'); if (more) more.onclick = () => { showAll = true; renderRides(); };
}

// ---------------------------------------------------------------- איפה נצבר איחור
// (שלמה 06.10) מתוך המעקב דקה-אחר-דקה (tools/rail_trace.py): לכל קטע בין שתי תחנות עוקבות — כמה
// דקות איחור הרכבות הוסיפו בו (כולל העמידה בתחנה שבתחילתו). מפה כללית, סינון לפי קו, יציאה
// באיחור מתחנת המוצא, ורכבות שהפסיקו לדווח באמצע המסלול.
let TRIDX = null, GMAP = null, gLine = '', gToken = 0;
const sumCache = {};
const stn = c => (ST[c] || [])[0] || c;
function loadTraceIdx() { return TRIDX ? Promise.resolve(TRIDX) : load(T.data + 'trace/index.json').then(j => (TRIDX = j)).catch(() => (TRIDX = {days: []})); }
function loadSum(d) { return sumCache[d] ? Promise.resolve(sumCache[d]) : load(`${T.data}trace/sum/${d}.json`).then(j => (sumCache[d] = j)).catch(() => null); }
const gainCol = v => v == null ? C.none : v < 0.3 ? C.ok : v < 1 ? C.warn : v < 2 ? C.late : C.bad;
const gainCls = v => v == null ? 'dn' : v < 0.3 ? 'd0' : v < 1 ? 'd1' : v < 2 ? 'd2' : 'd3';
const plus = v => v == null ? '—' : (v > 0.05 ? '+' : v < -0.05 ? '−' : '') + fmt1(Math.abs(v));
async function renderGain() {
  const box = $('#gainbox'); if (!box) return;
  const my = ++gToken;
  const idx = await loadTraceIdx();
  const have = new Set(idx.days || []);
  const ds = selectedDays().map(d => d.d).filter(d => have.has(d));
  if (!ds.length) {
    box.innerHTML = `<div class="panel"><div class="empty">עוד לא חושב ${period === 'day' ? 'ליום הזה' : 'לתקופה הזו'}.${(idx.days || []).length ? ` יש נתונים מ-${heDate(idx.days[0])} עד ${heDate(idx.days[idx.days.length - 1])}.` : ''}</div></div>`;
    return;
  }
  const sums = (await Promise.all(ds.map(loadSum))).filter(Boolean);
  if (my !== gToken || !document.body.contains(box)) return;
  const seg = {}, origin = {}, cut = [], names = new Set();
  let meas = 0, plan = 0, gps = 0;
  for (const s of sums) {
    meas += s.meas || 0; plan += s.plan || 0; gps += s.gps || 0;
    Object.keys(s.lines || {}).forEach(k => names.add(k));
    const src = gLine ? ((s.lines || {})[gLine] || {}) : (s.seg || {});
    for (const [k, v] of Object.entries(src)) {
      const x = seg[k] || (seg[k] = [0, 0, 0, 0, -99, 0]);
      x[0] += v[0]; x[1] += v[1]; x[2] += v[2]; x[3] += v[3]; x[4] = Math.max(x[4], v[4]); x[5] += v[5] || 0;
    }
    if (!gLine) for (const [k, v] of Object.entries(s.origin || {})) { const o = origin[k] || (origin[k] = [0, 0, 0]); o[0] += v[0]; o[1] += v[1]; o[2] += v[2]; }
    for (const c of s.cut || []) if (!gLine || c.nm === gLine) cut.push(Object.assign({d: s.d}, c));
  }
  if (gLine && !names.has(gLine)) gLine = '';
  const multi = ds.length > 1, minN = multi ? 5 : 2;
  const rows = Object.entries(seg).map(([k, v]) => { const [a, b] = k.split('>'); return {a, b, n: v[0], avg: v[1] / v[0], add: v[2], p2: v[3] / v[0], mx: v[4], nogps: v[5] != null && v[5] / v[0] < NOGPS}; })
    .filter(r => r.n >= minN).sort((x, y) => y.add - x.add);
  const lineOpts = [...names].sort((a, b) => a.localeCompare(b, 'he'));
  let h = `<div class="panel"><p class="ptitle">איפה הרכבות צוברות איחור <small>${multi ? `${ds.length} ימים` : heDate(ds[0])} · נמדדו ${pct(meas, plan)} מההגעות לתחנות</small></p>
    <div class="filters"><select id="gline" class="gsel"><option value="">כל הקווים</option>${lineOpts.map(n => `<option${n === gLine ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <p class="pdesc">כל קטע בין שתי תחנות עוקבות צבוע לפי כמה דקות איחור רכבת הוסיפה בו בממוצע: האיחור בהגעה לתחנה שבסוף הקטע, פחות האיחור בתחנה שבתחילתו. העמידה בתחנה שבתחילת הקטע נכללת בו. ערך שלילי = הרכבת צמצמה איחור.</p>
    <div id="gmap"></div>
    ${gainLegend}
  </div>`;
  h += `<div class="panel"><p class="ptitle">הקטעים שבהם נוסף הכי הרבה איחור <small>${num(rows.length)} קטעים · לפי סך הדקות שנוספו</small></p>` + (rows.length ? `<div class="tblbox"><table><thead><tr><th>קטע</th><th>רכבות</th><th>נוסף בממוצע</th><th>סך דקות שנוספו</th><th>2 דק׳ ומעלה</th><th>הכי הרבה</th></tr></thead><tbody>` +
    rows.slice(0, 60).map(r => `<tr><td class="nm">${esc(stn(r.a))} ← ${esc(stn(r.b))}${r.nogps ? ' <small class="nogps" title="ברוב הנסיעות אין GPS בקטע הזה — נמדד לפי שידור התחנה">ללא GPS</small>' : ''}</td><td>${num(r.n)}</td><td class="${gainCls(r.avg)}">${plus(r.avg)} דק׳</td><td>${num(Math.round(r.add))}</td><td>${Math.round(r.p2 * 100)}%</td><td>${plus(r.mx)} דק׳</td></tr>`).join('') + '</tbody></table></div>' : '<div class="empty">אין קטעים שנמדדו</div>') + `</div>`;
  if (!gLine) {
    const orows = Object.entries(origin).filter(([, v]) => v[0] >= minN).map(([c, v]) => ({c, n: v[0], avg: v[1] / v[0], p3: v[2] / v[0]})).sort((x, y) => y.avg - x.avg);
    h += `<div class="panel"><p class="ptitle">יציאה באיחור מתחנת המוצא <small>איחור כבר לפני שהרכבת זזה</small></p>` + (orows.length ? `<div class="tblbox"><table><thead><tr><th>תחנת מוצא</th><th>רכבות שנמדדו</th><th>איחור ממוצע ביציאה</th><th>3 דק׳ ומעלה</th></tr></thead><tbody>` +
      orows.map(r => `<tr><td class="nm">${esc(stn(r.c))}</td><td>${num(r.n)}</td><td class="${dcls(r.avg)}">${delayTxt(r.avg)} דק׳</td><td>${Math.round(r.p3 * 100)}%</td></tr>`).join('') + '</tbody></table></div>' : '<div class="empty">אין מדידות</div>') +
      `<p class="note">היציאה נמדדת רק כשה-GPS מראה את הרכבת זזה ליד התחנה. בתחנות תת-קרקעיות (ירושלים יצחק נבון, מודיעין מרכז) ה-GPS לא מתעדכן עד היציאה מהמנהרה, ולכן הן כמעט לא נמדדות.</p></div>`;
  }
  h += `<div class="panel"><p class="ptitle">בוטלו באמצע המסלול <small>${num(cut.length)} רכבות</small></p>` + (cut.length ? `<div class="tblbox"><table><thead><tr>${multi ? '<th>יום</th>' : ''}<th>רכבת</th><th>קו</th><th>תחנה אחרונה</th><th>שעה</th><th>מה קרה</th><th>תחנות שלא הגיעה אליהן</th><th>הגעה מתוכננת ליעד</th></tr></thead><tbody>` +
    cut.sort((x, y) => (x.d + hhmm(Math.round(x.m))).localeCompare(y.d + hhmm(Math.round(y.m)))).map(c => `<tr>${multi ? `<td>${shortDate(c.d)}</td>` : ''}<td>${esc(c.tn)}</td><td class="nm">${esc(c.nm)}</td><td>${esc(stn(c.at))}</td><td>${hhmm(Math.round(c.m))}</td><td>${c.k === 'stuck' ? 'המשיכה לשדר ולא התקדמה' : 'הפסיקה לשדר'}</td><td>${num(c.left)}</td><td>${hhmm(c.pl_end)}</td></tr>`).join('') + '</tbody></table></div>' : '<div class="empty">לא נמצאו</div>') +
    `<p class="note">רכבת נחשבת שבוטלה כשלא הגיעה לתחנה הבאה 20 דקות אחרי שהייתה אמורה להגיע אליה (ההגעה בפועל לתחנה האחרונה + זמן הנסיעה המתוכנן). או שהמשיכה לשדר ונשארה במקום, או שהפסיקה לשדר בזמן שרכבות אחרות המשיכו. במקרה השני רק כשנותרו לה לפחות 3 תחנות: כמעט כל הרכבות מפסיקות לשדר תחנה-שתיים לפני היעד, וזו תכונה של השידור ולא ביטול. תקלה במשדר של רכבת בודדת עלולה להיראות כמו ביטול. דוגמה: ב-5.10 בבוקר נמצאו 6 רכבות כאלה בין תל אביב ללוד, בזמן שתנועת הרכבות שם הופסקה.</p></div>`;
  h += `<div class="panel"><p class="note" style="margin-top:0"><b>איך נמדד:</b> בכל דקה רכבת ישראל משדרת לכל רכבת את מיקום ה-GPS ואת "התחנה הנוכחית" לפי מערכת המעקב שלה, גם כשאין GPS (בנתב"ג, במנהרות, כשהמשדר תקוע). ההגעה לתחנה היא הדקה הראשונה שבה הרכבת עומדת בה לפי ה-GPS; בלי GPS — הדקה שבה "התחנה הנוכחית" התחלפה אליה. כך נמדדות כ-85% מההגעות, לעומת כ-40% לפי GPS בלבד. בבדיקה מול המדידה לפי GPS ההפרש החציוני הוא 0 דקות, ו-90% מההגעות בטווח של דקה וחצי. ${plan ? `בתקופה שנבחרה: ${num(gps)} הגעות לפי GPS ו-${num(meas - gps)} לפי שידור התחנה.` : ''}</p></div>`;
  box.innerHTML = h;
  $('#gline').onchange = e => { gLine = e.target.value; renderGain(); };
  GMAP = drawGainMap(seg, minN, 'gmap', GMAP);
}
// קטע שברוב המדידות שלו אין GPS (שלמה 06.10: "שאין קליטת GPS תסמן את המקטע בלבן") — נמדד רק לפי
// שידור "התחנה הנוכחית". הנתון v[5] קיים מגרסה 2 של הסיכום.
const NOGPS = .2;
const noGps = u => u.gn > 0 && u.g / u.gn < NOGPS;
function drawGainMap(seg, minN, elId, prev) {
  if (prev) { try { prev.remove(); } catch (e) { /* המיכל כבר הוחלף */ } }
  const el = $('#' + elId); if (!el) return null;
  if (!window.L) { el.remove(); return null; }
  const und = {};
  for (const [k, v] of Object.entries(seg)) {
    const [a, b] = k.split('>'); const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const u = und[key] || (und[key] = {a: a < b ? a : b, b: a < b ? b : a, n: 0, sum: 0, g: 0, gn: 0, dirs: []});
    u.n += v[0]; u.sum += v[1]; u.dirs.push([a, b, v]);
    if (v[5] != null) { u.g += v[5]; u.gn += v[0]; }
  }
  const map = L.map(elId, {scrollWheelZoom: false, attributionControl: true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OpenStreetMap', maxZoom: 19, className: T.tiles === 'dark' ? 'tiles-dark' : ''}).addTo(map);
  const pts = [];
  const list = Object.values(und).filter(u => u.n >= minN).sort((x, y) => x.sum / x.n - y.sum / y.n);
  const maxN = Math.max(1, ...list.map(u => u.n));
  for (const u of list) {
    const A = ST[u.a], B = ST[u.b]; if (!A || !B || A[1] == null || B[1] == null) continue;
    const avg = u.sum / u.n, w = 3 + 6 * Math.sqrt(u.n / maxN), white = noGps(u);
    const shp = SEG[`${u.a}-${u.b}`] || SEG[`${u.b}-${u.a}`];
    const ll = shp ? decodeShape(shp) : [[A[1], A[2]], [B[1], B[2]]];
    const tip = u.dirs.map(([a, b, v]) => `${esc(stn(a))} ← ${esc(stn(b))}: ${plus(v[1] / v[0])} דק׳ בממוצע · ${num(v[0])} רכבות`).join('<br>') +
      (white ? `<br><b>אין קליטת GPS</b> ב-${Math.round(100 - 100 * u.g / u.gn)}% מהנסיעות — נמדד לפי שידור התחנה` : '');
    if (white) L.polyline(ll, {color: '#334155', weight: w + 3, opacity: .85, dashArray: shp ? null : '6 5'}).addTo(map);
    L.polyline(ll, {color: white ? '#FFFFFF' : gainCol(avg), weight: w, opacity: white ? 1 : .9, dashArray: shp ? null : '6 5'}).addTo(map).bindTooltip(tip, {sticky: true});
    pts.push([A[1], A[2]], [B[1], B[2]]);
  }
  if (pts.length) map.fitBounds(pts, {padding: [16, 16]}); else map.setView([31.9, 34.9], 8);
  return map;
}
const gainLegend = `<div class="legend"><span><i style="background:${C.ok}"></i>עד 0.3 דק׳</span><span><i style="background:${C.warn}"></i>0.3–1</span><span><i style="background:${C.late}"></i>1–2</span><span><i style="background:${C.bad}"></i>מעל 2 דק׳</span><span><i style="background:#fff;outline:2px solid #334155"></i>אין קליטת GPS (נמדד לפי שידור התחנה)</span><span>עובי הקו = מספר הרכבות</span></div>`;

// ---------------------------------------------------------------- קו: באיזו תחנה הוא מתעכב
// (שלמה 06.10) לחיצה על קו בלשונית "לפי קו": לכל תחנה לפי הסדר — האיחור בהגעה, כמה איחור נוסף
// בקטע שלפניה, וכמה זמן הרכבת עמדה בה. מהמעקב דקה-אחר-דקה, לאותה תקופה שנבחרה.
let LMAP = null;
async function openLine(nm) {
  const ovl = document.createElement('div'); ovl.className = 'ovl';
  ovl.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true"><div class="mhead"><h2>${esc(nm)}</h2><button class="x" aria-label="סגירה">✕</button></div><div id="lbody"><div class="empty">טוען…</div></div></div>`;
  document.body.appendChild(ovl);
  const close = () => { if (LMAP) { try { LMAP.remove(); } catch (e) { /* */ } LMAP = null; } ovl.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.x', ovl).onclick = close; ovl.onclick = e => { if (e.target === ovl) close(); };
  const idx = await loadTraceIdx(), have = new Set(idx.days || []);
  const ds = selectedDays().map(d => d.d).filter(d => have.has(d));
  const sums = (await Promise.all(ds.map(loadSum))).filter(s => s && s.lst);
  const body = $('#lbody', ovl); if (!body) return;
  const st = {}, seg = {}, org = [0, 0, 0]; let order = [];
  for (const s of sums) {
    for (const [c, v] of Object.entries((s.lst || {})[nm] || {})) { const x = st[c] || (st[c] = [0, 0, 0, 0, 0]); v.forEach((y, i) => x[i] += y); }
    for (const [k, v] of Object.entries((s.lines || {})[nm] || {})) { const x = seg[k] || (seg[k] = [0, 0, 0, 0, -99, 0]); for (let i = 0; i < 4; i++) x[i] += v[i]; x[4] = Math.max(x[4], v[4]); x[5] += v[5] || 0; }
    const o = (s.lorig || {})[nm]; if (o) o.forEach((y, i) => org[i] += y);
    const lo = (s.lord || {})[nm]; if (lo && lo.length > order.length) order = lo;
  }
  if (!order.length) { body.innerHTML = `<div class="empty">אין לקו הזה נתוני מעקב ${period === 'day' ? 'ביום הזה' : 'בתקופה הזו'}.</div>`; return; }
  const rows = order.map((c, i) => {
    const x = st[c], g = i ? seg[`${order[i - 1]}>${c}`] : null;
    return {c, i, n: x ? x[0] : 0, avg: x && x[0] ? x[1] / x[0] : null, on: x && x[0] ? x[2] / x[0] : null, dw: x && x[4] ? x[3] / x[4] : null,
      gain: g && g[0] ? g[1] / g[0] : null, gn: g ? g[0] : 0, nogps: g && g[0] && g[5] / g[0] < NOGPS};
  });
  const worst = rows.filter(r => r.gain != null && r.gn >= (ds.length > 1 ? 5 : 2)).sort((a, b) => b.gain - a.gain)[0];
  const lastAvg = [...rows].reverse().find(r => r.avg != null);
  body.innerHTML = `<div class="msub">${ds.length > 1 ? `${ds.length} ימים` : heDate(ds[0])}${org[0] ? ` · יציאה מהמוצא: ${delayTxt(org[1] / org[0])} דק׳ בממוצע (${num(org[0])} רכבות)` : ''}</div>` +
    (worst && worst.gain > 0.3 ? `<div class="warn" style="margin:8px 0">הקו צובר הכי הרבה איחור בקטע <b>${esc(stn(order[worst.i - 1]))} ← ${esc(stn(worst.c))}</b>: ${plus(worst.gain)} דק׳ בממוצע לרכבת.${lastAvg ? ` בתחנה האחרונה שנמדדה (${esc(stn(lastAvg.c))}) האיחור הממוצע ${delayTxt(lastAvg.avg)} דק׳.` : ''}</div>` : '') +
    `<div id="lmap"></div>${gainLegend}
    <div class="tblbox"><table class="ltbl"><thead><tr><th>תחנה</th><th>איחור בהגעה</th><th>בזמן</th><th>נוסף בקטע שלפניה</th><th>עמידה בתחנה</th><th>נמדדו</th></tr></thead><tbody>` +
    rows.map(r => `<tr${worst && r === worst ? ' class="hot"' : ''}><td class="nm">${esc(stn(r.c))}${r.i === 0 ? ' <small>מוצא</small>' : r.i === rows.length - 1 ? ' <small>יעד</small>' : ''}${r.nogps ? ' <small class="nogps" title="ברוב הנסיעות אין GPS בקטע הזה — נמדד לפי שידור התחנה">ללא GPS</small>' : ''}</td>` +
      `<td class="${r.i === 0 ? 'dn' : dcls(r.avg)}">${r.i === 0 ? (org[0] ? 'יציאה ' + delayTxt(org[1] / org[0]) + ' דק׳' : '—') : r.avg == null ? '—' : delayTxt(r.avg) + ' דק׳'}</td>` +
      `<td>${r.on == null ? '—' : Math.round(r.on * 100) + '%'}</td><td class="${r.gain == null ? 'dn' : gainCls(r.gain)}">${r.gain == null ? '—' : plus(r.gain) + ' דק׳'}</td>` +
      `<td>${r.dw == null ? '—' : fmt1(r.dw) + ' דק׳'}</td><td>${num(r.n || r.gn)}</td></tr>`).join('') + `</tbody></table></div>
    <p class="note">"איחור בהגעה" — כמה דקות אחרי הלו״ז הרכבת הגיעה לתחנה, בממוצע. "נוסף בקטע שלפניה" — כמה מהאיחור הזה נוצר בדרך מהתחנה הקודמת (כולל העמידה בה). "עמידה" — כמה זמן הרכבת עמדה בתחנה בפועל, לפי GPS. ההגעה נמדדת לפי GPS, ובלי GPS לפי שידור "התחנה הנוכחית" של רכבת ישראל.</p>
    <button class="more" id="lgo">לכל הקווים על המפה ←</button>`;
  LMAP = drawGainMap(seg, 1, 'lmap', LMAP);
  $('#lgo', ovl).onclick = () => { close(); gLine = nm; showTab('gain'); window.scrollTo({top: $('#tabbar').offsetTop - 10, behavior: 'smooth'}); };
}

let MAP = null;
function openRide(r) {
  const fd = rideFinal(r), b = bucketOf(fd);
  const ovl = document.createElement('div'); ovl.className = 'ovl';
  const dbLink = `https://open-bus-map-search.hasadna.org.il/train?date=${dayData.d}&route=${encodeURIComponent(r.rn || r.nm)}`;
  const reach = rideReach(r);
  ovl.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mhead"><h2>${esc(r.nm)}</h2>${r.tn ? `<span class="st sn">רכבת ${esc(r.tn)}</span>` : ''}${r.fx ? (fd == null ? '<span class="st sn">לא נמדד</span>' : `<span class="st s${b}">${delayTxt(fd)} דק׳ ${reach ? esc(reach) : 'ביעד'}</span>`) : '<span class="st sn">ללא שידור</span>'}<button class="x" aria-label="סגירה">✕</button></div>
    <div class="msub">${heDate(dayData.d)} · יציאה ${hhmm(r.s[0] ? r.s[0][1] : null)} · ${num(r.fx)} שידורי מיקום · <a href="${dbLink}" target="_blank" rel="noopener">המסלול והשידורים בדאטאבוס ↗</a></div>
    <div id="map"></div>
    <div class="route"><div class="rs h"><span></span><span>תחנה</span><span>מתוכנן</span><span>בפועל</span><span>איחור</span></div>` +
    r.s.map((x, i) => { const first = i === 0; const dl = first ? null : x[2]; const act = dl == null ? null : x[1] + dl; const bb = bucketOf(dl);
      return `<div class="rs"><span class="dot ${first ? 'o' : bb < 0 ? '' : 's' + bb}"></span><span class="rn">${esc((ST[x[0]] || [])[0] || x[0])}${first ? ' <small>מוצא</small>' : i === r.s.length - 1 ? ' <small>יעד</small>' : ''}</span><span class="rt">${hhmm(x[1])}</span><span class="ra${first || act == null ? ' n' : ''}">${first ? '—' : act == null ? 'לא נמדד' : hhmm(Math.round(act))}</span><span class="rd ${dl == null ? 'n' : dcls(dl)}">${dl == null ? '—' : delayTxt(dl) + ' דק׳'}</span></div>`; }).join('') +
    `</div><div class="note">ההגעה "בפועל" היא אומדן מהשידור הראשון בנקודת ההתקרבות הקרובה ביותר לתחנה (דיוק של כדקה). תחנה "לא נמדדה" כשלא היה שידור עד 500 מ׳ ממנה: שידורי הרכבות מקוטעים, ובמיוחד לקראת היעד. בתחנת המוצא נמדדת רק היציאה המתוכננת.</div></div>`;
  document.body.appendChild(ovl);
  const close = () => { if (MAP) { MAP.remove(); MAP = null; } ovl.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.x', ovl).onclick = close; ovl.onclick = e => { if (e.target === ovl) close(); };
  try {
    const pts = r.s.map(x => ST[x[0]]).filter(s => s && s[1] != null);
    if (window.L && pts.length) {
      MAP = L.map('map', {scrollWheelZoom: false, attributionControl: true});
      // רקע המפה מ-OpenStreetMap, כמו בשאר האתר. CARTO דורשים מפתח מסוף אוגוסט 2026 והאריחים
      // שלהם הראו "API KEY REQUIRED" (רם אגמון דרך קו באג, 17.09). במצב כהה האריחים מתהפכים ב-CSS.
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OpenStreetMap', maxZoom: 19, className: T.tiles === 'dark' ? 'tiles-dark' : ''}).addTo(MAP);
      // המסילה בין כל שתי תחנות עוקבות (מרשת המסילות של OSM); בלעדיה קו מקווקו
      for (let i = 1; i < r.s.length; i++) {
        const a = ST[r.s[i - 1][0]], c = ST[r.s[i][0]]; if (!a || !c || a[1] == null || c[1] == null) continue;
        const seg = SEG[`${r.s[i - 1][0]}-${r.s[i][0]}`] || SEG[`${r.s[i][0]}-${r.s[i - 1][0]}`];
        if (seg) L.polyline(decodeShape(seg), {color: C.seg, weight: 3.5, opacity: .9}).addTo(MAP);
        else L.polyline([[a[1], a[2]], [c[1], c[2]]], {color: C.dash, weight: 2.5, dashArray: '6 6', opacity: .8}).addTo(MAP);
      }
      r.s.forEach((x, i) => { const s = ST[x[0]]; if (!s || s[1] == null) return; const dl = i === 0 ? null : x[2]; const bb = bucketOf(dl);
        L.circleMarker([s[1], s[2]], {radius: 6.5, color: BG, weight: 2, fillColor: i === 0 ? C.accent : bb < 0 ? C.none : BCOL[bb], fillOpacity: 1}).addTo(MAP).bindTooltip(`${esc(s[0])}: ${i === 0 ? 'מוצא' : dl == null ? 'לא נמדד' : delayTxt(dl) + ' דק׳'}`, {direction: 'top'}); });
      MAP.fitBounds(pts.map(s => [s[1], s[2]]), {padding: [18, 18]});
    } else $('#map').remove();
  } catch (e) { const m = $('#map'); if (m) m.remove(); }
}

const METHOD = `<p class="ptitle">איך המדד מחושב</p>
    <p>המקור הוא <a href="https://open-bus-map-search.hasadna.org.il/train" target="_blank" rel="noopener">דאטאבוס</a> של הסדנא לידע ציבורי: לוח הזמנים המתוכנן של רכבת ישראל (GTFS) ושידורי המיקום של הרכבות בזמן אמת (SIRI), כפי שמשרד התחבורה מפרסם. כל לילה נשלפות כל נסיעות הרכבת של היום שחלף, ולכל נסיעה מוצמדים השידורים שלה.</p>
    <p>בכל תחנה נאמד זמן ההגעה בפועל: השידור הראשון בנקודה שבה הרכבת הייתה הכי קרובה לתחנה (בחלון של ±45 דקות סביב הזמן המתוכנן, ורק אם השידור היה עד 500 מ׳ מהתחנה). ההפרש בינו לבין הזמן שבלו״ז הוא האיחור. השידורים מגיעים אחת לכדקה, ולכן דיוק המדידה הוא כדקה.</p>
    <p>שידורי הרכבות מקוטעים: המיקום "נתקע" לעיתים בתחנה גם אחרי שהרכבת יצאה ממנה, יש קטעים שלמים בלי שידור, והשידור נפסק ברוב הנסיעות לפני ההגעה ליעד. לכן <b>איחור הנסיעה</b> הוא האיחור בתחנה האחרונה שנמדדה בה, והעמוד מציין עד איזו תחנה הגיעה המדידה וכמה מהנסיעות נמדדו עד היעד עצמו. זמן היציאה מתחנת המוצא אינו נמדד, הוא מוטה מאותם שידורים תקועים.</p>
    <p><b>שני מספרים:</b> "בזמן ביעד" סופר כל רכבת פעם אחת, לפי האיחור בתחנה האחרונה שנמדדה בה. "הגעות בזמן לתחנות" סופר כל הגעה לכל תחנה, כולל תחנות הביניים, ולכן עיכוב באמצע הדרך שהרכבת השלימה עד היעד נספר בו. זה אותו מדד שמשמש במדד דיוק האוטובוסים, כדי שאפשר יהיה להשוות.</p>
    <p><b>רכבת "בזמן"</b> היא רכבת שהגיעה באיחור של עד 5 דקות, ההגדרה המקובלת לדיוק רכבות. ההתפלגות מוצגת גם ב-5–10, 10–20 ומעל 20 דקות.</p>
    <p>רכבת שבלו״ז אך בלי שום שידור אינה נספרת כאיחור ואינה נספרת כביטול: אי אפשר להבחין בין רכבת שבוטלה לתקלת שידור. שיעור הנסיעות ללא שידור מוצג בנפרד.</p>`;
const methodEl = $('#method'); if (methodEl) methodEl.innerHTML = METHOD;
Promise.all([load(T.data + 'index.json'), load(T.data + 'stations.json').catch(() => ({})), load(T.data + 'segments.json').catch(() => ({}))]).then(([idx, st, seg]) => {
  IDX = idx; ST = st || {}; SEG = (seg && seg.segments) || {}; DAYS = (idx.days || []).filter(d => d.rides).sort((a, b) => a.d < b.d ? -1 : 1);
  if (!DAYS.length) { $('#app').innerHTML = '<div class="msg">עדיין אין נתונים — הריצה הראשונה מתבצעת הלילה</div>'; $('#sub').textContent = ''; return; }
  const [h, t0] = location.hash.replace('#', '').split('/');
  if (t0) tab = t0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(h) && DAYS.some(d => d.d === h)) { period = 'day'; dayD = h; }
  else if (DAYS.length <= 30) period = 'all';   // כל עוד אין יותר מחודש, 'כל התקופה' היא ברירת המחדל (הכפתור 30 ימים מוסתר)
  dayD = dayD || DAYS[DAYS.length - 1].d;
  render();
}).catch(e => { $('#app').innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; $('#sub').textContent = ''; });

// מיון בלחיצה על כותרת בכל טבלה שאין לה מיון משלה (שלמה 17.09: "שיהיה אפשר ללחוץ על כל שורה בטבלה… מלמעלה
// למטה או הפוך, בכל הטבלות"): לחיצה ראשונה — מהגדול לקטן (טקסט: א→ת), לחיצה נוספת הופכת. הטבלאות עם id
// ממוינות מהנתונים עצמם (renderX) ולא נוגעים בהן.
const cellNum = s => { const m = String(s).replace(/[,\u2212]/g, c => c === ',' ? '' : '-').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };
document.addEventListener('click', e => {
  const th = e.target.closest('table:not([id]) > thead th'); if (!th) return;
  const table = th.closest('table'), tbody = table.tBodies[0]; if (!tbody) return;
  const idx = [...th.parentNode.children].indexOf(th);
  const rows = [...tbody.rows];
  const vals = rows.map(r => (r.cells[idx] ? r.cells[idx].innerText : '').trim());
  const numeric = vals.filter(v => v && v !== '—').every(v => cellNum(v) != null);
  const was = th.classList.contains('sort-desc') ? 'desc' : th.classList.contains('sort-asc') ? 'asc' : '';
  const dir = was ? (was === 'desc' ? 'asc' : 'desc') : (numeric ? 'desc' : 'asc');
  table.querySelectorAll('thead th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
  th.classList.add('sort-' + dir);
  const key = i => numeric ? cellNum(vals[i]) : vals[i];
  const order = rows.map((_, i) => i).sort((a, b) => {
    const x = key(a), y = key(b);
    if (x == null || x === '') return 1; if (y == null || y === '') return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'asc' ? 1 : -1);
  });
  order.forEach(i => tbody.appendChild(rows[i]));
});
})();
