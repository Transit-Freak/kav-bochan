// מדד דיוק האוטובוסים — הלוגיקה של העמוד. הנתונים: data/index.json (סיכום ארצי
// לכל יום), data/days/YYYY-MM-DD.json (מסלולים, מפעילים, ערים, שעות, המאחרות),
// data/days/YYYY-MM-DD.stops.json (פרופיל איחור לאורך כל קו — נטען כשפותחים קו),
// data/stops.json (שמות תחנות לפי מק"ט). העיצוב: כמו מדד אמינות הרכבת.
(function(){
'use strict';

const CATS = ['מוקדם (יותר מ-2 דק׳)', 'בזמן (עד 5 דק׳)', 'איחור 5–10 דק׳', 'איחור 10–20 דק׳', 'איחור מעל 20 דק׳'];
const C = {early: '#7C3AED', ok: '#00A65A', warn: '#F4B400', late: '#F26B1D', bad: '#D7263D', grid: '#E5E7EB', axis: '#8A94A3', bg: '#FFFFFF', line: '#1E5BC6', accent: '#101418'};
const BCOL = [C.early, C.ok, C.warn, C.late, C.bad];
const GRID = C.grid, AXIS = C.axis, BG = C.bg;
const DAYNAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DATA = 'data/';
const MIN_RIDES = 10;   // דירוג קווים: לפחות כך וכך נסיעות שנצפו, אחרת קו של נסיעה אחת מוביל
let IDX = null, DAYS = [], CAT = {}, NAMES = null, period = 'day', dayD = null, dayCache = {}, stopCache = {};
let sortA = {k: 'meas', dir: -1}, sortC = {k: 'meas', dir: -1}, sortL = {k: 'meas', dir: -1}, lq = '', agency = '', rank = '', openLine = null, showAllL = false;
// אשכול (ClusterToLine של המשרד) ועיר עם פירוט קווים — משוב 07.09: "אין נתונים לפי עיר או אשכול", "לפי עיר זה כללי מדי"
let cluster = '', sortK = {k: 'meas', dir: -1}, cq = '', showAllC = false, openCity = null, cityCache = {}, cRank = 'meas', cAgency = '', sortCL = {k: 'n', dir: -1}, showAllCL = false;
const MIN_CITY = 20;    // דירוג קווים בתוך עיר: לפחות כך וכך הגעות שנמדדו בעיר
const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
const fmt1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('he-IL', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const num = v => v == null ? '—' : Number(v).toLocaleString('he-IL');
const heDate = d => { const [y, m, dd] = d.split('-'); return `${DAYNAMES[new Date(+y, m - 1, +dd).getDay()]}, ${+dd}.${+m}.${y}`; };
const shortDate = d => { const [, m, dd] = d.split('-'); return `${+dd}.${+m}`; };
const hhmm = s => s == null ? '—' : `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
const dcls = v => v == null ? 'dn' : v < -2 ? 'd0' : v <= 5 ? 'd1' : v <= 10 ? 'd2' : v <= 20 ? 'd3' : 'd4';
const catOf = v => v == null ? -1 : v < -2 ? 0 : v <= 5 ? 1 : v <= 10 ? 2 : v <= 20 ? 3 : 4;
const delayTxt = m => m == null ? '—' : (m > 0 ? '+' : '') + fmt1(m);
function load(url) { return fetch(url + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }
const stopName = code => (NAMES && NAMES[code]) || code;
// יום שבו נצפו פחות מ-30% מהנסיעות המתוכננות — שידור חלקי, מוצג בנפרד
const partial = d => d.sched > 0 && d.obs < d.sched * 0.3;

// ---------------------------------------------------------------- צבירה (כמה ימים)
function emptyAgg() { return {sched: 0, obs: 0, meas: 0, c: [0, 0, 0, 0, 0], o: [0, 0, 0, 0, 0], sum: 0, s: null, far: 0, extra: 0, vt: [0, 0, 0], reach: [0, 0, 0, 0], cov: [0, 0], reachDays: 0}; }
// עד איפה נראה האוטובוס לאורך המסלול (מהריצה של 17.09; ימים ישנים בלי הנתון): [עד הסוף, חלק מהדרך, רק בהתחלה, שודר ולא זז]
function addReach(x, reach, cov) { if (!reach) return; reach.forEach((v, i) => x.reach[i] += v); (cov || []).forEach((v, i) => x.cov[i] += v); x.reachDays++; }
const reachT = x => x.reach.reduce((a, b) => a + b, 0);
// גודל הרכב במילים של האתר: "אוטובוס" אצל המשרד הוא קטגוריית גודל (לא מיניבוס,
// לא מידיבוס, לא מפרקי) — אותו ניסוח כמו ב"הקו בזמן" (שלמה 06.09)
const VNAMES = {'מיניבוס': 'מיניבוס', 'מידיבוס': 'מידיבוס', 'אוטובוס': 'אוטובוס', 'מפרקי': 'אוטובוס מפרקי'};
const vname = v => VNAMES[v] || v || '';
function addVehicleData(x, vt) {
  if (!vt) return;
  x.vplan = vt[0]; x.vt[0] += vt[1]; x.vt[1] += vt[2]; x.vt[2] += vt[3];
  // Old files contain only a daily mode, not counts. Do not turn it into a distribution.
  if (vt[5]) for (const [kind, n] of Object.entries(vt[5])) x.vact[kind] = (x.vact[kind] || 0) + n;
  const detail = vt[6];
  if (!detail) return;
  x.vehicleDetail ||= {actual: {}, observed: 0, plans: new Set(), dates: new Set(), fleetDates: new Set()};
  const d = x.vehicleDetail;
  d.observed += detail.observed || 0;
  for (const [kind, n] of Object.entries(detail.actual || {})) d.actual[kind] = (d.actual[kind] || 0) + n;
  for (const label of detail.plan?.labels || []) d.plans.add(label);
  if (detail.plan?.date) d.dates.add(detail.plan.date);
  if (detail.fleetDate) d.fleetDates.add(detail.fleetDate);
}
function vehicleDetails(s) {
  const d = s.vehicleDetail;
  if (!d) return '<p class="pdesc">בנתונים הישנים נשמר רק גודל הרכב הנפוץ. אין בהם פירוט נסיעות שמאפשר לחשב אחוז אוטובוסים עירוניים ובינעירוניים.</p>';
  const entries = Object.entries(d.actual).sort((a, b) => b[1] - a[1]);
  const known = entries.reduce((n, [, count]) => n + count, 0);
  const plan = d.plans.size ? [...d.plans].map(esc).join(' / ') : 'פרטי רישוי הקו לא זמינים';
  return `<div class="pdesc"><b>הרכב שנקבע ברישוי הקו:</b> ${plan}${d.dates.size ? ` (נתוני ${[...d.dates].sort().map(esc).join(', ')})` : ''}.<br>
    <b>הרכבים בנסיעות שנצפו:</b> סוג הרכב זוהה ב-${num(known)} מתוך ${num(d.observed)} נסיעות שנבדקו.
    ${known ? `<br>מתוך הנסיעות עם סוג רכב מזוהה: ${entries.map(([kind, n]) => `${esc(kind)} — ${num(n)} נסיעות (${pct(n, known)})`).join(' · ')}.` : ''}
    <br>ב-${num(Math.max(0, d.observed - known))} נסיעות סוג הרכב אינו ידוע.
    ${s.obs > d.observed ? `<br>${num(s.obs - d.observed)} נסיעות נוספות בתקופה הן מנתונים ישנים ללא הפירוט הזה.` : ''}
    <br><small>לפי מספר הרכב ששודר ומאגר ציי הרכב של משרד התחבורה${d.fleetDates.size ? `, מתאריך ${[...d.fleetDates].sort().map(esc).join(', ')}` : ''}. הספירה היא לפי נסיעות; רכב שביצע כמה נסיעות נספר בכל אחת מהן.</small></div>`;
}
function addAgg(t, x) {
  const sched = x.sched != null ? x.sched : x[0], obs = x.obs != null ? x.obs : x[1], meas = x.meas != null ? x.meas : x[2], c = x.c || x[3], s = x.s || x[4];
  t.sched += sched || 0; t.obs += obs || 0; t.meas += meas || 0;
  (c || []).forEach((v, i) => t.c[i] += v);
  if (s && s[0] != null) t.sum += s[0] * (meas || 0);
}
function finish(t) { t.avg = t.meas ? t.sum / t.meas : null; t.on = t.meas ? t.c[1] / t.meas : null; return t; }

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
  for (let i = 0; i <= ticks; i++) { const v = mn + (mx - mn) * i / ticks, y = py(v); grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${GRID}"/><text x="${L - 6}" y="${y + 4}" font-size="10" fill="${AXIS}" text-anchor="end">${Math.round(v)}${o.unit || ''}</text>`; }
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
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}">${grid}${xl}<path d="${area}" fill="${o.color}" opacity=".10"/><path d="${path}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round"/><line id="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${C.accent}" stroke-dasharray="3 3" opacity="0" /><rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>${dots}</svg><div class="tip"></div>`;
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
    if (b.y != null) rects += `<rect x="${x}" y="${py(Math.min(b.y, mx))}" width="${bw - gap}" height="${py(0) - py(Math.min(b.y, mx))}" rx="2" fill="${b.color || o.color}"/>`;
    else rects += `<rect x="${x}" y="${py(0) - 2}" width="${bw - gap}" height="2" rx="1" fill="${GRID}"/>`;
    if (n <= 26 || i % Math.ceil(n / 26) === 0) xl += `<text x="${x + (bw - gap) / 2}" y="${H - 8}" font-size="10" fill="${AXIS}" text-anchor="middle">${esc(b.x)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}">${grid}${rects}${xl}</svg><div class="tip"></div>`;
  const tip = $('.tip', el), svg = $('svg', el);
  el.onmousemove = ev => {
    const r = svg.getBoundingClientRect(); const fx = (ev.clientX - r.left) / r.width * W; const i = Math.min(n - 1, Math.max(0, Math.floor((fx - L) / bw)));
    const b = bars[i]; if (!b) return; tip.innerHTML = b.tip; tip.style.display = 'block';
    tip.style.right = `${100 - (L + (i + .5) * bw) / W * 100}%`; tip.style.top = `${Math.max(0, py(Math.min(b.y || 0, mx)) / H * r.height - 60)}px`;
  };
  el.onmouseleave = () => { tip.style.display = 'none'; };
}
const hourColor = share => share == null ? GRID : share >= .8 ? C.ok : share >= .65 ? C.warn : share >= .5 ? C.late : C.bad;

// ---------------------------------------------------------------- לוח שנה ותקופות
const HEMONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
let calOpen = false, calYM = null;
function calHtml() {
  const [y, m] = calYM;
  const nDays = new Date(y, m + 1, 0).getDate(), startDow = new Date(y, m, 1).getDay();
  const byD = new Map(DAYS.map(d => [d.d, d]));
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<span></span>');
  for (let day = 1; day <= nDays; day++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = byD.get(iso);
    if (!d) { cells.push(`<span class="cd off">${day}</span>`); continue; }
    const cls = ['cd', partial(d) ? 'part' : '', iso === dayD && period === 'day' ? 'on' : ''].filter(Boolean).join(' ');
    const tip = d.meas ? `${pct(d.c[1], d.meas)} בזמן · ${num(d.obs)} נסיעות נצפו` : 'אין מדידות';
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
  cal.hidden = !calOpen; if (!calOpen) return;
  cal.innerHTML = calHtml();
  cal.querySelectorAll('.cnav').forEach(b => b.onclick = e => { e.stopPropagation(); let [y, m] = calYM; m += Number(b.dataset.nav); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } calYM = [y, m]; renderCal(); });
  cal.querySelectorAll('button.cd').forEach(b => b.onclick = e => { e.stopPropagation(); calOpen = false; dayD = b.dataset.d; period = 'day'; render(); });
}
document.addEventListener('click', e => { if (calOpen && !e.target.closest('.dwrap')) { calOpen = false; renderCal(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && calOpen) { calOpen = false; renderCal(); } });
function renderPeriods() {
  const el = $('#periods');
  const chips = [['day', 'יום'], ['7', '7 ימים'], ['30', '30 ימים']].filter(([k]) => k === 'day' || DAYS.length >= 3 && (k === '7' || DAYS.length > 7));
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
function windowDays() {
  if (period === 'day') return DAYS.filter(d => d.d === dayD);
  return DAYS.slice(-Number(period)).filter(d => !partial(d));
}

// ---------------------------------------------------------------- תצוגה
function heroHtml(a, days) {
  const title = days.length === 1 ? heDate(days[0].d) : days.length ? `${shortDate(days[0].d)} – ${shortDate(days[days.length - 1].d)}.${days[days.length - 1].d.slice(0, 4)} · ${days.length} ימים` : '';
  const on = a.meas ? pct(a.c[1], a.meas) : '—';
  const oT = a.o.reduce((x, y) => x + y, 0);
  // כל נתון מסביר את עצמו במקום, במשפט פשוט (שלמה 06.09: "לא מובן מה כל דבר אומר")
  const items = [
    ['יציאה בזמן מהמוצא', oT ? pct(a.o[1], oT) : '—', '', oT ? `מכל הנסיעות, ${pct(a.o[1], oT)} יצאו מהתחנה הראשונה בזמן. ${pct(a.o[0], oT)} יצאו מוקדם (יותר מ-2 דקות לפני השעה שבלו״ז) ו-${pct(a.o[2] + a.o[3] + a.o[4], oT)} יצאו באיחור (יותר מ-5 דקות אחריה).` : 'אין מדידה בתחנת המוצא'],
    ['איחור ממוצע בתחנה', a.avg == null ? '—' : fmt1(a.avg), 'דק׳', `בממוצע, אוטובוס מגיע לתחנה ${a.avg == null ? '—' : fmt1(a.avg)} דקות אחרי השעה שבלו״ז.${a.s && a.s[1] != null ? ` חצי מההגעות עד ${fmt1(a.s[1])} דקות, ו-90% עד ${fmt1(a.s[2])} דקות.` : ''}`],
    ['מעל 20 דקות', a.meas ? pct(a.c[4], a.meas) : '—', '', `${a.meas ? pct(a.c[4], a.meas) : '—'} מההגעות לתחנות היו באיחור של יותר מ-20 דקות (${a.meas ? pct(a.c[3] + a.c[4], a.meas) : '—'} יותר מ-10 דקות). ${a.meas ? pct(a.c[0], a.meas) : '—'} מההגעות היו מוקדמות מדי.`],
    ['נסיעות שנצפו', num(a.obs), '', `מתוך ${num(a.sched)} נסיעות בלוח הזמנים, ${num(a.obs)} (${pct(a.obs, a.sched)}) שידרו מיקום ונמדדו.${a.extra ? ` עוד ${num(a.extra)} נסיעות שודרו אבל לא מופיעות בלו״ז (תגבורים).` : ''}`],
  ];
  const cap = `${title}. נמדדו ${num(a.meas)} הגעות של אוטובוסים לתחנות ברחבי הארץ. הגעה נחשבת "בזמן" כשהאוטובוס מגיע לא יותר מ-5 דקות אחרי השעה שבלוח הזמנים, ולא יותר מ-2 דקות לפניה.`;
  const r = 54, circ = 2 * Math.PI * r, share = a.meas ? a.c[1] / a.meas : 0;
  const segs = a.meas ? a.c.map(v => v / a.meas) : [0, 0, 0, 0, 0];
  let off = 0, arcs = '';
  segs.forEach((s, i) => { if (s > 0) arcs += `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${BCOL[i]}" stroke-width="14" stroke-dasharray="${(s * circ).toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(-off * circ).toFixed(1)}" transform="rotate(-90 70 70)"/>`; off += s; });
  return `<div class="ringwrap"><div class="ring"><svg viewBox="0 0 140 140"><circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--line)" stroke-width="14"/>${arcs}</svg><div class="rv"><b>${on}</b><span>בזמן</span></div></div>
    <div class="rtext"><h2>${Math.round(share * 100) || 0}% מההגעות לתחנות היו בזמן</h2><p>${esc(cap)}</p><div class="rstats">${items.map(([l, v, u, c]) => `<div><b>${v}${u ? `<i>${u}</i>` : ''}</b><span>${l}</span><small>${c}</small></div>`).join('')}</div></div></div>`;
}
function distHtml(a) {
  if (!a.meas) return '';
  return `<div class="dist">${a.c.map((v, i) => v ? `<i class="s${i}" style="flex:${v}" title="${CATS[i]}: ${num(v)}"></i>` : '').join('')}</div>
    <div class="legend">${a.c.map((v, i) => `<span><i style="background:${BCOL[i]}"></i>${CATS[i]} · ${pct(v, a.meas)} (${num(v)})</span>`).join('')}</div>`;
}
function sortRows(rows, s) { return rows.sort((x, y) => { const a = x[s.k], b = y[s.k]; if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; return (a < b ? -1 : a > b ? 1 : 0) * s.dir; }); }
function th(label, k, s) { return `<th data-k="${k}" class="${s.k === k ? 'on' : ''}">${label}${s.k === k ? (s.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`; }
const onCell = on => `${on == null ? '—' : Math.round(on * 100) + '%'}<span class="bar"><i style="width:${Math.round((on || 0) * 100)}%"></i></span>`;
// צבע לאחוז "לא נצפו" (אי ביצוע משוער): עד 5% רגיל, עד 15% כתום, מעל — אדום
const missCls = m => m == null ? '' : m > .15 ? 'd4' : m > .05 ? 'd2' : '';

function mergeDays(days) {
  const tot = emptyAgg(), A = {}, Cc = {}, H = {}, Rr = {}, worst = [];
  for (const d of days) {
    addAgg(tot, d.tot);
    tot.far += d.tot.far || 0; tot.extra += d.tot.extra || 0;
    if (days.length === 1) tot.s = d.tot.s;
    for (const [nm, sched, obs, meas, c, s, o, va, reach, cov] of d.agencies) { const x = A[nm] || (A[nm] = emptyAgg()); addAgg(x, {sched, obs, meas, c, s}); (o || []).forEach((v, i) => x.o[i] += v); (va || []).forEach((v, i) => x.vt[i] += v); addReach(x, reach, cov); }
    (d.tot.vt || []).forEach((v, i) => tot.vt[i] += v);
    addReach(tot, d.tot.reach, d.tot.cov);
    // לעיר גם נסיעות בלו״ז/נצפו של הקווים שעוברים בה — אי ביצוע (משוב אלעזר פינדר 07.09)
    for (const [nm, meas, c, s, sched, obs] of d.cities) { const x = Cc[nm] || (Cc[nm] = emptyAgg()); addAgg(x, {meas, c, s}); x.sched += sched || 0; x.obs += obs || 0; }
    for (const [h, n, on] of d.hours) { const x = H[h] || (H[h] = [0, 0]); x[0] += n; x[1] += on; }
    for (const r of d.routes) {
      const [rid, sched, obs, meas, c, s, o, hours, ws, vt, reach, cov] = r;
      const x = Rr[rid] || (Rr[rid] = Object.assign(emptyAgg(), {rid, hours: {}, ws: [], vplan: '', vact: {}, schedByDay: {}}));
      addAgg(x, {sched, obs, meas, c, s}); o.forEach((v, i) => { x.o[i] += v; tot.o[i] += v; });
      addReach(x, reach, cov); x.schedByDay[d.d] = sched;
      for (const [h, n, on] of hours) { const y = x.hours[h] || (x.hours[h] = [0, 0]); y[0] += n; y[1] += on; }
      addVehicleData(x, vt);
      if (days.length === 1) { x.s = s; x.ws = ws; }
    }
    for (const w of d.worst) worst.push([d.d, ...w]);
  }
  finish(tot); Object.values(A).forEach(finish); Object.values(Cc).forEach(finish); Object.values(Rr).forEach(finish);
  worst.sort((a, b) => b[3] - a[3]);
  // לפי אשכול ולפי סוג קו — מהמסלולים, לפי הקטלוג (כל קו באשכול אחד; אין צורך בקובץ יומי)
  const K = {}, LT = {};
  for (const x of Object.values(Rr)) {
    const l = lineLabel(x.rid);
    for (const [grp, nm] of [[K, l.cluster || 'ללא אשכול'], [LT, l.ltype || 'לא ידוע']]) {
      const y = grp[nm] || (grp[nm] = Object.assign(emptyAgg(), {ags: {}, subs: {}, n: 0}));
      y.sched += x.sched; y.obs += x.obs; y.meas += x.meas; y.sum += x.sum; y.n++;
      x.c.forEach((v, i) => y.c[i] += v); x.o.forEach((v, i) => y.o[i] += v); x.reach.forEach((v, i) => y.reach[i] += v); x.cov.forEach((v, i) => y.cov[i] += v);
      y.ags[l.agency] = (y.ags[l.agency] || 0) + x.meas;
      if (l.sub) y.subs[l.sub] = 1;
    }
  }
  Object.values(K).forEach(finish); Object.values(LT).forEach(finish);
  return {tot, A, Cc, H, Rr, K, LT, worst, days: days.map(d => d.d)};
}

function lineLabel(rid) {
  const c = CAT[rid] || [];
  // route_long_name מסתיים בקוד כיוון+חלופה ("…-כרמיאל-10") — לא לתצוגה
  return {short: c[1] || rid, long: (c[2] || '').replace(/-\d[\d#א-ת]?$/, '').replace('<->', ' ← '), agency: c[3] || '', dir: c[4] || '', alt: c[5] || '', aid: c[7] || '', cluster: c[8] || '', ltype: c[9] || '', sub: c[10] || ''};
}
let M = null;
// קטגוריות (שלמה 17.09: "העמוד עמוס, במיוחד בטלפון"): הסיכום הגדול תמיד למעלה, ומתחתיו רק הקטגוריה שנבחרה.
// הקטעים הלא-נבחרים נשארים בדף בגובה אפס (לא display:none) כדי שהגרפים שבהם יצוירו ברוחב נכון.
const TABS = [['overview', 'מבט כללי'], ['ops', 'מפעילים ואשכולות'], ['city', 'לפי עיר'], ['line', 'לפי קו'], ['vanish', 'איפה האוטובוס נעלם'], ['vehicle', 'חריגה מסוג הרכב'], ['worst', 'הנסיעות שאיחרו']];
let tab = 'overview';
// המספר של כל קטגוריה, על הכפתור שלה (שלמה 17.09: "שיראה את המדד של אחוזים לפי המדד")
function tabBadge(k) {
  const t = M.tot;
  const range = arr => { const v = arr.filter(x => x != null).map(x => Math.round(x * 100)); return v.length ? `${Math.min(...v)}%–${Math.max(...v)}% בזמן` : ''; };
  switch (k) {
    case 'overview': return t.meas ? pct(t.c[1], t.meas) + ' בזמן' : '';
    case 'ops': return range(Object.values(M.A).filter(a => a.meas >= 1000).map(a => a.on));
    case 'city': return range(Object.values(M.Cc).filter(c => c.meas >= 500).map(c => c.on));
    case 'line': return num(Object.keys(M.Rr).length) + ' מסלולים';
    case 'vanish': return reachT(t) ? pct(t.reach[0], reachT(t)) + ' נראו עד הסוף' : '';
    case 'vehicle': return t.vt && t.vt[0] ? pct(t.vt[1] + t.vt[2], t.vt[0]) + ' רכב שונה מהנקבע' : '';   // קטן וגם גדול מהנקבע (שלמה 17.09)
    case 'worst': return t.meas ? pct(t.c[4], t.meas) + ' מעל 20 דק׳' : '';
  }
  return '';
}
function showTab(k, scroll) {
  if (!TABS.some(([x]) => x === k)) k = 'overview';
  tab = k;
  document.querySelectorAll('.tabsec').forEach(el => el.classList.toggle('off', el.dataset.tab !== k));
  document.querySelectorAll('#tabbar .tab').forEach(b => { const on = b.dataset.t === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  const h = (period === 'day' && dayD ? dayD : '') + (k !== 'overview' ? '/' + k : '');
  history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  if (scroll) { const bar = $('#tabbar'); if (bar) bar.scrollIntoView({behavior: 'smooth', block: 'start'}); }
}
function render() {
  renderPeriods();
  const days = windowDays();
  const app = $('#app');
  const need = days.filter(d => !dayCache[d.d]);
  if (need.length) {
    app.innerHTML = '<div class="msg">טוען את נתוני הימים…</div>';
    Promise.all(need.map(d => load(DATA + 'days/' + d.d + '.json').then(j => { dayCache[d.d] = j; }))).then(render).catch(e => { app.innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; });
    return;
  }
  const loaded = days.map(d => dayCache[d.d]);
  if (!loaded.length) { app.innerHTML = '<div class="msg">אין נתונים לתקופה</div>'; return; }
  M = mergeDays(loaded);
  $('#sub').textContent = `${num(DAYS.length)} ימים · מעודכן ${IDX.updated ? IDX.updated.replace('T', ' ').replace('Z', ' UTC') : ''} · המקור: שידורי המיקום של משרד התחבורה (SIRI) דרך דאטאבוס, לוח הזמנים (GTFS) ורשימת האשכולות (ClusterToLine) של משרד התחבורה`;
  const trend = DAYS.map(d => ({x: shortDate(d.d), y: partial(d) || !d.meas ? null : Math.round(100 * d.c[1] / d.meas), tip: `<b>${heDate(d.d)}</b><br>${d.meas ? pct(d.c[1], d.meas) + ' בזמן' : 'אין מדידות'}${partial(d) ? '<br>שידור חלקי' : ''}<br>${num(d.obs)} נסיעות נצפו מתוך ${num(d.sched)}`}));
  const hours = Array.from({length: 24}, (_, h) => { const v = M.H[h]; const sh = v && v[0] >= 30 ? v[1] / v[0] : null; return {x: String(h).padStart(2, '0'), y: sh == null ? null : Math.round(sh * 100), color: hourColor(sh), tip: `<b>${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59</b><br>${v && v[0] ? pct(v[1], v[0]) + ' בזמן · ' + num(v[0]) + ' הגעות' : 'אין נתונים'}`}; });
  app.innerHTML = `
    ${heroHtml(M.tot, loaded)}
    <div class="tabbar" id="tabbar" role="tablist">${TABS.map(([k, t]) => { const b = tabBadge(k); return `<button class="tab${tab === k ? ' on' : ''}" role="tab" aria-selected="${tab === k}" data-t="${k}">${t}${b ? `<small>${b}</small>` : ''}</button>`; }).join('')}</div>
    <div class="tabsec" data-tab="overview">
    <div class="panel"><div class="ptitle">התפלגות ההגעות לתחנות</div><p class="pdesc">כל הגעה של אוטובוס לתחנה נספרת פעם אחת, לפי הפער בינה לבין השעה שבלוח הזמנים: כמה הגיעו מוקדם, כמה בזמן, וכמה איחרו ובכמה.</p>${distHtml(M.tot)}</div>
    <div class="cols2">
      <div class="panel"><div class="ptitle">אחוז בזמן, יום אחרי יום</div><p class="pdesc">כמה מההגעות לתחנות היו בזמן בכל יום שנמדד. לחיצה על יום בלוח השנה למעלה פותחת אותו.</p><div class="chart" id="c-trend"></div></div>
      <div class="panel"><div class="ptitle">אחוז בזמן לפי השעה ביום</div><p class="pdesc">לפי השעה שבה האוטובוס היה אמור להגיע לתחנה. ירוק: 80% ומעלה בזמן, צהוב: 65%–80%, כתום: 50%–65%, אדום: פחות מ-50%.</p><div class="chart" id="c-hours"></div></div>
    </div>
    </div>
    <div class="tabsec" data-tab="ops">
    <div class="panel"><div class="ptitle">לפי מפעיל</div><p class="pdesc">אותם מדדים לכל חברת אוטובוסים. לחיצה על כותרת עמודה ממיינת, לחיצה על שם המפעיל מציגה את הקווים שלו.</p><div id="t-ag"></div></div>
    </div>
    <div class="tabsec" data-tab="vanish">
    <div class="panel" id="p-vanish"><div class="ptitle">איפה האוטובוס נעלם</div><p class="pdesc">משרד התחבורה סופר נסיעה כ"בוצעה" אם האוטובוס דיווח בתחנת המוצא. כאן עוקבים אחרי כל נסיעה תחנה אחרי תחנה: האם נראתה עד סוף המסלול, נעלמה באמצע הדרך, נראתה רק בהתחלה, או שידרה מיקום 5 דקות ומעלה בלי לזוז על המסלול. היעלמות יכולה להיות קליטה גרועה, נסיעה שקוצרה, או נסיעה שדווחה ולא נסעה. כדי להפריד בין קליטה למפעיל: תחנה שבה אוטובוסים של כמה חברות נעלמים היא בעיית קליטה, לא של החברה.</p><div id="t-vanish"></div></div>
    </div>
    <div class="tabsec" data-tab="ops">
    <div class="panel"><div class="ptitle">לפי אשכול</div><p class="pdesc">משרד התחבורה מחלק את קווי האוטובוס לאשכולות (למשל "חשמונאים", "הגליל", "שרון"), וכל אשכול יוצא למכרז ומופעל על ידי חברה אחת. כאן אותם מדדים לכל אשכול, ולמעלה לפי סוג הקו: עירוני, אזורי או בינעירוני. לחיצה על שם האשכול מציגה את הקווים שלו.</p><div id="lt-sum"></div><div id="t-cl"></div></div>
    </div>
    <div class="tabsec" data-tab="city">
    <div class="panel"><div class="ptitle">לפי עיר</div><p class="pdesc">כל ההגעות לתחנות שבתחומי העיר, מכל הקווים שעוברים בה, וגם כמה מהנסיעות של הקווים האלה לא נצפו בכלל (אי ביצוע משוער). לחיצה על שם העיר פותחת פירוט: אילו קווים עוברים בה, איזה מפעילים, כמה נסיעות לא בוצעו, ואיך כל קו מדייק בתוך העיר.</p><div class="filters" id="cfilters"></div><div id="city-detail"></div><div id="t-city"></div></div>
    </div>
    <div class="tabsec" data-tab="line">
    <div class="panel"><div class="ptitle">לפי קו</div><p class="pdesc">כל כיוון של כל קו בנפרד. אפשר לבחור מפעיל או אשכול, לדרג ("הכי לא מדייקים") או לחפש מספר קו. לחיצה על מספר הקו פותחת פירוט: באיזה קטע לאורך הקו נצבר האיחור.</p>
      <div class="filters" id="lfilters"></div>
      <div id="line-detail"></div><div id="t-lines"></div></div>
    </div>
    <div class="tabsec" data-tab="vehicle">
    <div class="panel"><div class="ptitle">סוג הרכב מול מה שנקבע לקו</div><p class="pdesc">לכל קו משרד התחבורה קובע גודל רכב: מיניבוס, מידיבוס, אוטובוס או אוטובוס מפרקי. כאן משווים אותו לרכב שהגיע בפועל בכל נסיעה, לפי מספר הרכב בשידור ומאגר ציי הרכב של המשרד. "רכב קטן יותר" הוא למשל מיניבוס בקו שנקבע לו אוטובוס.</p><div id="vt-sum"></div><div class="filters" id="vt-filters"></div><div id="t-vt"></div></div>
    </div>
    <div class="tabsec" data-tab="worst">
    <div class="panel"><div class="ptitle">הנסיעות שאיחרו הכי הרבה</div><p class="pdesc">נסיעות בודדות שבאחת התחנות איחרו 20 דקות ומעלה, מהגרועה ביותר. לחיצה על נסיעה מציגה אותה תחנה אחרי תחנה: מתוכנן, בפועל והפער.</p><ul class="worst" id="worst"></ul></div>
    </div>`;
  $('#tabbar').onclick = e => { const b = e.target.closest('button.tab'); if (b) showTab(b.dataset.t); };
  showTab(tab);
  lineChart($('#c-trend'), trend, {color: C.line, min: 0, max: 100, unit: '%'});
  barChart($('#c-hours'), hours, {color: C.line, max: 100, unit: '%'});
  renderAgencies(); renderClusters(); renderCities(); renderFilters(); renderLines(); renderWorst(); renderVehicles(); renderVanish();
}
// איפה האוטובוס נעלם (שלמה 17.09): עד איפה נראו הנסיעות, לפי מפעיל, והתחנות שאחריהן נסיעות נעלמות
let coverCache = {}, sortV = {k: 'rT', dir: -1}, sortVL = {k: 'gone', dir: -1}, vlq = '', showAllVL = false;
function loadCover(days) {
  return Promise.all(days.filter(d => !coverCache[d]).map(d => load(DATA + 'days/' + d + '.cover.json').then(j => { coverCache[d] = j; }).catch(() => { coverCache[d] = {}; })));
}
const RNAMES = ['עד הסוף', 'חלק מהדרך', 'רק בהתחלה', 'שודרו ולא זזו'];
const RCOL = [C.ok, C.warn, C.bad, C.early];
function reachBar(x) {
  const T = reachT(x); if (!T) return '';
  return `<div class="rbar" title="${x.reach.map((v, i) => RNAMES[i] + ' ' + pct(v, T)).join(' · ')}">${x.reach.map((v, i) => v ? `<span style="width:${100 * v / T}%;background:${RCOL[i]}"></span>` : '').join('')}</div>`;
}
function renderVanishLines() {
  const box = $('#t-vlines'); if (!box) return;
  const q = vlq.trim();
  let rows = Object.values(M.Rr).map(s => { const l = lineLabel(s.rid), rT = reachT(s); return {rid: s.rid, short: l.short, long: l.long, agency: l.agency, sched: s.sched, rT, rend: rT ? s.reach[0] / rT : null, rpart: rT ? s.reach[1] / rT : null, rstart: rT ? s.reach[2] / rT : null, rstatic: rT ? s.reach[3] / rT : null, gone: rT ? 1 - s.reach[0] / rT : null, miss: s.sched ? Math.max(0, s.sched - rT) / s.sched : null, cov: s.cov[0] ? s.cov[1] / s.cov[0] : null, s}; }).filter(r => r.rT >= MIN_RIDES);
  if (q) { const tok = q.split(/\s+/); const numTok = tok.find(t => /^\d/.test(t)), txt = tok.filter(t => t !== numTok).join(' '); rows = rows.filter(r => (!numTok || r.short === numTok || (!txt && r.short.startsWith(numTok))) && (!txt || (r.long + ' ' + r.agency).includes(txt))); }
  sortRows(rows, sortVL);
  const total = rows.length;
  if (!showAllVL) rows = rows.slice(0, q ? 60 : 30);
  box.innerHTML = `<div class="tblbox"><table id="tvl"><thead><tr>${th('קו', 'short', sortVL)}${th('מסלול', 'long', sortVL)}${th('מפעיל', 'agency', sortVL)}${th('נסיעות ששודרו', 'rT', sortVL)}<th>עד איפה נראו</th>${th('עד הסוף', 'rend', sortVL)}${th('באמצע הדרך', 'rpart', sortVL)}${th('רק בהתחלה', 'rstart', sortVL)}${th('לא זזו', 'rstatic', sortVL)}${th('לא שידרו בכלל', 'miss', sortVL)}${th('קליטה בדרך', 'cov', sortVL)}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><button class="linebtn" data-rid="${esc(r.rid)}">${esc(r.short)}</button></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td>${num(r.rT)} <small style="color:var(--dim)">מתוך ${num(r.sched)}</small></td><td style="min-width:120px">${reachBar(r.s)}</td><td>${Math.round(r.rend * 100)}%</td><td class="${r.rpart >= 0.2 ? 'd4' : r.rpart >= 0.1 ? 'd3' : ''}">${Math.round(r.rpart * 100)}%</td><td class="${r.rstart >= 0.05 ? 'd4' : ''}">${Math.round(r.rstart * 100)}%</td><td class="${r.rstatic >= 0.1 ? 'd4' : r.rstatic >= 0.05 ? 'd3' : ''}">${Math.round(r.rstatic * 100)}%</td><td class="${missCls(r.miss)}">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${r.cov == null ? '—' : Math.round(r.cov * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-vl">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים עם ${MIN_RIDES} נסיעות ששודרו לפחות (כיוון וחלופה נספרים בנפרד)</div>`;
  $('#tvl thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortVL = {k, dir: sortVL.k === k ? -sortVL.dir : (['short', 'long', 'agency'].includes(k) ? 1 : -1)}; renderVanishLines(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = () => { openLine = b.dataset.rid; showTab('line'); renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  const mb = $('#more-vl'); if (mb) mb.onclick = () => { showAllVL = true; renderVanishLines(); };
}
function renderVanish() {
  const box = $('#t-vanish'); if (!box) return;
  const t = M.tot, T = reachT(t);
  if (!T) { box.innerHTML = `<div class="empty">הנתון הזה מחושב מהריצה של 17.09.2026 ואילך. ${M.days.length === 1 ? 'ליום הזה' : 'לתקופה הזו'} אין אותו עדיין.</div>`; return; }
  const unseen = Math.max(0, t.sched - T);
  const rows = Object.entries(M.A).map(([nm, s]) => { const rT = reachT(s); return {nm, sched: s.sched, rT, rend: rT ? s.reach[0] / rT : null, rpart: rT ? s.reach[1] / rT : null, rstart: rT ? s.reach[2] / rT : null, rstatic: rT ? s.reach[3] / rT : null, miss: s.sched ? Math.max(0, s.sched - rT) / s.sched : null, cov: s.cov[0] ? s.cov[1] / s.cov[0] : null, s}; }).filter(r => r.rT >= 20);
  sortRows(rows, sortV);
  box.innerHTML = `<div class="stat-row">
      <div><b>${pct(t.reach[0], T)}</b><span>נראו עד סוף המסלול</span></div>
      <div><b>${pct(t.reach[1], T)}</b><span>נעלמו באמצע הדרך</span></div>
      <div><b>${pct(t.reach[2], T)}</b><span>נראו רק בהתחלה</span></div>
      <div><b>${pct(t.reach[3], T)}</b><span>שידרו 5 דק׳ ומעלה ולא זזו</span></div>
      <div><b>${num(unseen)}</b><span>נסיעות בלו״ז שלא שידרו בכלל (${pct(unseen, t.sched)})</span></div>
      ${t.cov[0] ? `<div><b>${pct(t.cov[1], t.cov[0])}</b><span>מהתחנות שבדרך נקלטו, כשהאוטובוס משדר</span></div>` : ''}
    </div>
    <div class="ptitle" style="margin-top:12px">לפי מפעיל</div>
    <div class="tblbox"><table id="tv"><thead><tr>${th('מפעיל', 'nm', sortV)}${th('נסיעות ששודרו', 'rT', sortV)}<th>עד איפה נראו</th>${th('עד הסוף', 'rend', sortV)}${th('באמצע הדרך', 'rpart', sortV)}${th('רק בהתחלה', 'rstart', sortV)}${th('לא זזו', 'rstatic', sortV)}${th('לא שידרו בכלל', 'miss', sortV)}${th('קליטה בדרך', 'cov', sortV)}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm">${esc(r.nm)}</td><td>${num(r.rT)} <small style="color:var(--dim)">מתוך ${num(r.sched)}</small></td><td style="min-width:140px">${reachBar(r.s)}</td><td>${Math.round(r.rend * 100)}%</td><td class="${r.rpart >= 0.1 ? 'd3' : ''}">${Math.round(r.rpart * 100)}%</td><td class="${r.rstart >= 0.03 ? 'd4' : ''}">${Math.round(r.rstart * 100)}%</td><td class="${r.rstatic >= 0.05 ? 'd4' : r.rstatic >= 0.03 ? 'd3' : ''}">${Math.round(r.rstatic * 100)}%</td><td class="${missCls(r.miss)}">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${r.cov == null ? '—' : Math.round(r.cov * 100) + '%'}</td></tr>`).join('') +
    `</tbody></table></div><div class="mut" style="margin-top:6px">מפעילים עם 20 נסיעות ששודרו לפחות. "קליטה בדרך": מתוך התחנות שהאוטובוס ודאי עבר (נמדד לפניהן ואחריהן), כמה נקלטו. "לא שידרו בכלל": נסיעות בלו״ז בלי שום שידור, לא בוצעו או בוצעו בלי מכשיר.</div>
    <div class="ptitle" style="margin-top:12px">לפי קו</div><p class="pdesc">אותם ארבעה מדדים לכל כיוון של כל קו, מהקו שהכי הרבה נסיעות שלו לא נראו עד הסוף. לחיצה על מספר הקו פותחת את הפירוט שלו, תחנה אחרי תחנה.</p>
    <div class="filters"><input id="vlq" placeholder="חיפוש קו: מספר, יעד או מפעיל" value="${esc(vlq)}"></div><div id="t-vlines"></div>
    <div class="ptitle" style="margin-top:12px">התחנות שאחריהן נסיעות נעלמות</div><p class="pdesc">התחנה האחרונה שבה נראה האוטובוס בנסיעות שנעלמו באמצע הדרך. כמה חברות שונות נעלמות שם: אחת, כנראה עניין של החברה; כמה, כנראה קליטה או מסוף שבו הנסיעה "מתחלפת".</p><div id="t-holes"><div class="empty">טוען…</div></div>`;
  $('#tv thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortV = {k, dir: sortV.k === k ? -sortV.dir : (k === 'nm' ? 1 : -1)}; renderVanish(); };
  $('#vlq').oninput = e => { vlq = e.target.value; showAllVL = false; renderVanishLines(); };
  renderVanishLines();
  const days = M.days;
  Promise.all([loadCover(days), loadProfiles([])]).then(() => {
    const hb = $('#t-holes'); if (!hb) return;
    const acc = {};
    for (const d of days) for (const [code, v] of Object.entries(coverCache[d] || {})) { const x = acc[code] || (acc[code] = {code, passed: 0, measured: 0, ags: 0, van: 0, city: ''}); x.passed += v[0]; x.measured += v[1]; x.ags = Math.max(x.ags, v[2] || 0); x.van += v[3] || 0; x.city = x.city || v[4] || ''; }
    const van = Object.values(acc).filter(x => x.van >= 5).sort((a, b) => b.van - a.van).slice(0, 30);
    const holes = Object.values(acc).filter(x => x.passed >= 10 && x.measured < 0.7 * x.passed).sort((a, b) => (b.passed - b.measured) - (a.passed - a.measured)).slice(0, 20);
    hb.innerHTML = (van.length ? `<div class="tblbox"><table><thead><tr><th>תחנה</th><th>עיר</th><th>נסיעות שנעלמו אחריה</th><th>חברות</th></tr></thead><tbody>` +
      van.map(x => `<tr><td class="nm">${esc(stopName(x.code))} <small style="color:var(--dim)">${esc(x.code)}</small></td><td style="font-size:12px">${esc(x.city)}</td><td>${num(x.van)}</td><td class="${x.ags >= 2 ? '' : 'd3'}">${x.ags >= 2 ? num(x.ags) + ' · כנראה קליטה' : 'אחת'}</td></tr>`).join('') + '</tbody></table></div>' : '<div class="empty">אין תחנות עם 5 היעלמויות ומעלה</div>') +
      (holes.length ? `<div class="ptitle" style="margin-top:12px">חורי קליטה באמצע הדרך</div><p class="pdesc">תחנות שהאוטובוסים ודאי עברו בהן (נמדדו לפניהן ואחריהן) ובכל זאת פחות מ-70% מהמעברים נקלטו.</p><div class="tblbox"><table><thead><tr><th>תחנה</th><th>עיר</th><th>עברו</th><th>נקלטו</th><th>חברות</th></tr></thead><tbody>` +
      holes.map(x => `<tr><td class="nm">${esc(stopName(x.code))} <small style="color:var(--dim)">${esc(x.code)}</small></td><td style="font-size:12px">${esc(x.city)}</td><td>${num(x.passed)}</td><td class="d4">${pct(x.measured, x.passed)}</td><td>${num(x.ags)}</td></tr>`).join('') + '</tbody></table></div>' : '');
  });
}
const LTNAME = {'עירוני': 'עירוניים', 'אזורי': 'אזוריים', 'בינעירוני': 'בינעירוניים'};
function renderClusters() {
  const box = $('#t-cl'); if (!box) return;
  const T = ['עירוני', 'אזורי', 'בינעירוני'].map(t => [t, M.LT[t]]).filter(([, s]) => s && s.meas);
  if (!T.length) { $('#lt-sum').innerHTML = '<div class="empty">אין עדיין נתוני אשכולות (הקטלוג מתעדכן בריצה הבאה)</div>'; box.innerHTML = ''; return; }
  $('#lt-sum').innerHTML = `<div class="stat-row">${T.map(([t, s]) => `<div><b>${pct(s.c[1], s.meas)}</b><span>בזמן בקווים ${LTNAME[t]} · ${num(s.n)} מסלולים · ${num(s.meas)} הגעות · איחור ממוצע ${fmt1(s.avg)} דק׳</span></div>`).join('')}</div>`;
  const rows = Object.entries(M.K).map(([nm, s]) => {
    const oT = s.o.reduce((x, y) => x + y, 0), ags = Object.entries(s.ags).sort((a, b) => b[1] - a[1]);
    return {nm, ag: ags.slice(0, 2).map(a => a[0]).join(', ') + (ags.length > 2 ? ' ועוד' : ''), subs: Object.keys(s.subs).join(', '), n: s.n, sched: s.sched, obs: s.obs, meas: s.meas, on: s.on, oon: oT ? s.o[1] / oT : null, oearly: oT ? s.o[0] / oT : null, avg: s.avg, b4: s.meas ? s.c[4] / s.meas : null};
  });
  sortRows(rows, sortK);
  box.innerHTML = `<div class="tblbox"><table id="tk"><thead><tr>${th('אשכול', 'nm', sortK)}${th('מפעיל', 'ag', sortK)}${th('מסלולים', 'n', sortK)}${th('נסיעות בלו״ז', 'sched', sortK)}${th('נצפו', 'obs', sortK)}${th('הגעות נמדדו', 'meas', sortK)}${th('בזמן בתחנות', 'on', sortK)}${th('יציאה בזמן מהמוצא', 'oon', sortK)}${th('יצאו מוקדם', 'oearly', sortK)}${th('איחור ממוצע', 'avg', sortK)}${th('מעל 20 דק׳', 'b4', sortK)}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><button class="linebtn" data-cl="${esc(r.nm)}" title="הקווים של האשכול">${esc(r.nm)}</button>${r.subs ? `<br><small style="color:var(--dim);font-weight:400">${esc(r.subs)}</small>` : ''}</td><td style="font-size:12px">${esc(r.ag)}</td><td>${num(r.n)}</td><td>${num(r.sched)}</td><td>${num(r.obs)} <small style="color:var(--dim)">(${pct(r.obs, r.sched)})</small></td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.oon == null ? '—' : Math.round(r.oon * 100) + '%'}</td><td>${r.oearly == null ? '—' : Math.round(r.oearly * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>' +
    `<div class="mut" style="margin-top:6px">${num(rows.length)} אשכולות · האשכול של כל קו לפי רשימת ClusterToLine של משרד התחבורה · מתחת לשם האשכול: תת-האזורים שלו, כשיש</div>`;
  $('#tk thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortK = {k, dir: sortK.k === k ? -sortK.dir : (['nm', 'ag'].includes(k) ? 1 : -1)}; renderClusters(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = () => { cluster = b.dataset.cl; agency = ''; rank = rank || 'worst'; showAllL = false; renderFilters(); renderLines(); renderWorst(); showTab('line'); $('#lfilters').scrollIntoView({behavior: 'smooth', block: 'start'}); });
}
let vsort = 'small', vAll = false, vAgency = '';
function renderVehicles() {
  const box = $('#t-vt'); if (!box) return;
  const T = M.tot.vt;
  if (!T[0]) { $('#vt-sum').innerHTML = '<div class="empty">אין עדיין נתוני רכב לתקופה הזו (מחושב מהריצה הבאה)</div>'; $('#vt-filters').innerHTML = ''; box.innerHTML = ''; return; }
  const ags = Object.entries(M.A).filter(([, s]) => s.vt[0]).sort((a, b) => b[1].vt[0] - a[1].vt[0]);
  $('#vt-sum').innerHTML = `<div class="stat-row">
      <div><b>${pct(T[1], T[0])}</b><span>מהנסיעות הגיע רכב קטן ממה שנקבע לקו</span></div>
      <div><b>${pct(T[2], T[0])}</b><span>רכב גדול ממה שנקבע</span></div>
      <div><b>${num(T[0])}</b><span>נסיעות שבהן גם הרכב וגם סוג הקו ידועים (${pct(T[0], M.tot.obs)} מהנסיעות שנצפו)</span></div></div>
    <div class="tblbox"><table><thead><tr><th>מפעיל</th><th>נסיעות עם רכב מזוהה</th><th>רכב קטן יותר</th><th>רכב גדול יותר</th></tr></thead><tbody>${ags.sort((a, b) => b[1].vt[1] / b[1].vt[0] - a[1].vt[1] / a[1].vt[0]).map(([nm, s]) => `<tr><td class="nm">${esc(nm)}</td><td>${num(s.vt[0])}</td><td class="${s.vt[1] / s.vt[0] > .2 ? 'd4' : s.vt[1] / s.vt[0] > .05 ? 'd2' : ''}">${pct(s.vt[1], s.vt[0])}</td><td>${pct(s.vt[2], s.vt[0])}</td></tr>`).join('')}</tbody></table></div>`;
  $('#vt-filters').innerHTML = `<select id="vt-ag"><option value="">כל המפעילים</option>${ags.map(([a]) => `<option value="${esc(a)}"${a === vAgency ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>` +
    [['small', 'הכי הרבה רכב קטן יותר'], ['large', 'הכי הרבה רכב גדול יותר']].map(([k, t]) => `<button class="fchip${vsort === k ? ' on' : ''}" data-v="${k}">${t}</button>`).join('');
  $('#vt-ag').onchange = e => { vAgency = e.target.value; vAll = false; renderVehicles(); };
  $('#vt-filters').querySelectorAll('.fchip').forEach(b => b.onclick = () => { vsort = b.dataset.v; vAll = false; renderVehicles(); });
  let rows = Object.values(M.Rr).filter(s => s.vt[0] >= 5).map(s => { const l = lineLabel(s.rid); const act = Object.entries(s.vact).sort((a, b) => b[1] - a[1])[0]; return {rid: s.rid, short: l.short, long: l.long, agency: l.agency, plan: s.vplan, act: act ? act[0] : '', n: s.vt[0], small: s.vt[1] / s.vt[0], large: s.vt[2] / s.vt[0]}; });
  if (vAgency) rows = rows.filter(r => r.agency === vAgency);
  const k = vsort === 'small' ? 'small' : 'large';
  rows.sort((a, b) => b[k] - a[k] || b.n - a.n);
  rows = rows.filter(r => r[k] > 0);
  const total = rows.length;
  if (!vAll) rows = rows.slice(0, 40);
  box.innerHTML = rows.length ? `<div class="tblbox" style="margin-top:10px"><table><thead><tr><th>קו</th><th>מסלול</th><th>מפעיל</th><th>נקבע לקו</th><th>הגיע בפועל (הנפוץ)</th><th>נסיעות עם רכב מזוהה</th><th>רכב קטן יותר</th><th>רכב גדול יותר</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><button class="linebtn" data-rid="${esc(r.rid)}">${esc(r.short)}</button></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td>${esc(vname(r.plan))}</td><td><b>${esc(vname(r.act))}</b></td><td>${num(r.n)}</td><td class="${r.small > .5 ? 'd4' : r.small > .2 ? 'd3' : ''}">${Math.round(r.small * 100)}%</td><td>${Math.round(r.large * 100)}%</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-v">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים${vAgency ? ' של ' + esc(vAgency) : ''} · רק קווים עם 5 נסיעות לפחות שבהן הרכב מזוהה · רכבי קבלן ורכבים שאינם במאגר המשרד לא נספרים</div>` :
    '<div class="empty">אין קווים כאלה</div>';
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = () => { openLine = b.dataset.rid; renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  const mb = $('#more-v'); if (mb) mb.onclick = () => { vAll = true; renderVehicles(); };
}
function renderAgencies() {
  const anyReach = reachT(M.tot) > 0;
  const rows = Object.entries(M.A).map(([nm, s]) => { const oT = s.o.reduce((x, y) => x + y, 0), rT = reachT(s); return {nm, sched: s.sched, obs: s.obs, meas: s.meas, on: s.on, oon: oT ? s.o[1] / oT : null, oearly: oT ? s.o[0] / oT : null, avg: s.avg, b4: s.meas ? s.c[4] / s.meas : null, rend: rT ? s.reach[0] / rT : null, rstart: rT ? (s.reach[2] + s.reach[3]) / rT : null, rT}; });
  sortRows(rows, sortA);
  $('#t-ag').innerHTML = `<div class="tblbox"><table id="ta"><thead><tr>${th('מפעיל', 'nm', sortA)}${th('נסיעות בלו״ז', 'sched', sortA)}${th('נצפו', 'obs', sortA)}${th('הגעות נמדדו', 'meas', sortA)}${th('בזמן בתחנות', 'on', sortA)}${th('יציאה בזמן מהמוצא', 'oon', sortA)}${th('יצאו מוקדם', 'oearly', sortA)}${th('איחור ממוצע', 'avg', sortA)}${th('מעל 20 דק׳', 'b4', sortA)}${anyReach ? th('נראו עד הסוף', 'rend', sortA) + th('רק בהתחלה', 'rstart', sortA) : ''}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><button class="linebtn" data-ag="${esc(r.nm)}" title="סינון הקווים למפעיל הזה">${esc(r.nm)}</button></td><td>${num(r.sched)}</td><td>${num(r.obs)} <small style="color:var(--dim)">(${pct(r.obs, r.sched)})</small></td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.oon == null ? '—' : Math.round(r.oon * 100) + '%'}</td><td>${r.oearly == null ? '—' : Math.round(r.oearly * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td>${anyReach ? `<td>${r.rend == null ? '—' : Math.round(r.rend * 100) + '%'}</td><td class="${r.rstart == null ? '' : r.rstart >= 0.1 ? 'd4' : r.rstart >= 0.05 ? 'd3' : ''}" title="${r.rT ? num(r.rT) + ' נסיעות ששודרו' : ''}">${r.rstart == null ? '—' : Math.round(r.rstart * 100) + '%'}</td>` : ''}</tr>`).join('') + '</tbody></table></div>' +
    (anyReach ? '<p class="pdesc">"נראו עד הסוף": נסיעות ששודרו ונמדדו עד שתי התחנות האחרונות של המסלול. "רק בהתחלה": נסיעות ששודרו אבל נמדדו רק בשלוש התחנות הראשונות, או שודרו 5 דקות ומעלה בלי להתקדם על המסלול. משרד התחבורה בודק ביצוע נסיעה בתחנת המוצא בלבד; כאן בכל תחנה. הפירוט למטה, ב"איפה האוטובוס נעלם".</p>' : '');
  $('#ta thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortA = {k, dir: sortA.k === k ? -sortA.dir : (k === 'nm' ? 1 : -1)}; renderAgencies(); };
  $('#t-ag').querySelectorAll('.linebtn').forEach(b => b.onclick = () => { agency = b.dataset.ag; rank = rank || 'worst'; showAllL = false; renderFilters(); renderLines(); renderWorst(); showTab('line'); $('#lfilters').scrollIntoView({behavior: 'smooth', block: 'start'}); });
}
function renderCities() {
  const box = $('#t-city'); if (!box) return;
  // תיבת החיפוש נבנית פעם אחת — בנייה מחדש בכל אות מאבדת את הפוקוס והמקלדת נסגרת (שלמה 07.09)
  if (!$('#cq')) {
    $('#cfilters').innerHTML = `<input class="search" id="cq" placeholder="חיפוש עיר או יישוב…" value="${esc(cq)}">`;
    $('#cq').oninput = e => { cq = e.target.value; showAllC = false; renderCities(); };
  }
  const q = cq.trim();
  let rows = Object.entries(M.Cc).map(([nm, s]) => ({nm, meas: s.meas, on: s.on, early: s.meas ? s.c[0] / s.meas : null, avg: s.avg, b4: s.meas ? s.c[4] / s.meas : null, sched: s.sched || null, miss: s.sched ? 1 - s.obs / s.sched : null}));
  if (q) rows = rows.filter(r => r.nm.includes(q));
  sortRows(rows, sortC);
  const total = rows.length;
  if (!showAllC) rows = rows.slice(0, 40);
  box.innerHTML = `<div class="tblbox"><table id="tc"><thead><tr>${th('עיר', 'nm', sortC)}${th('נסיעות בלו״ז', 'sched', sortC)}${th('לא נצפו', 'miss', sortC)}${th('הגעות נמדדו', 'meas', sortC)}${th('בזמן', 'on', sortC)}${th('מוקדם', 'early', sortC)}${th('איחור ממוצע', 'avg', sortC)}${th('מעל 20 דק׳', 'b4', sortC)}</tr></thead><tbody>` +
    rows.map(r => `<tr class="${r.nm === openCity ? 'on' : ''}"><td class="nm"><button class="linebtn" data-city="${esc(r.nm)}" title="הקווים שעוברים בעיר">${esc(r.nm)}</button></td><td>${num(r.sched)}</td><td class="${missCls(r.miss)}" title="נסיעות בלו״ז של הקווים שעוברים בעיר שלא שידרו מיקום בכלל — לא בוצעו, או בוצעו בלי שידור">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.early == null ? '—' : Math.round(r.early * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-c">הצגת כל ${num(total)} הערים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} ערים ויישובים עם 50 הגעות לפחות · העיר של כל תחנה לפי קובץ התחנות של משרד התחבורה · "נסיעות בלו״ז" ו"לא נצפו": כל הנסיעות של הקווים שעוברים בעיר, לאורך כל המסלול</div>`;
  $('#tc thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortC = {k, dir: sortC.k === k ? -sortC.dir : (k === 'nm' ? 1 : -1)}; renderCities(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = () => { openCity = b.dataset.city; cAgency = ''; showAllCL = false; renderCityDetail(); renderCities(); $('#city-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  const mb = $('#more-c'); if (mb) mb.onclick = () => { showAllC = true; renderCities(); };
  renderCityDetail();
}
// פירוט עיר: הקווים שעוברים בה ואיך כל אחד מדייק בתוכה — מהקבצים היומיים של הערים
function loadCities(days) {
  const need = days.filter(d => !cityCache[d]);
  return Promise.all(need.map(d => load(DATA + 'days/' + d + '.cities.json').then(j => { cityCache[d] = j; }).catch(() => { cityCache[d] = {}; })));
}
function renderCityDetail() {
  const el = $('#city-detail'); if (!el) return;
  const s = openCity && M.Cc[openCity];
  if (!s) { el.innerHTML = ''; return; }
  if (el.dataset.city === openCity && el.dataset.days === M.days.join(',')) return;
  el.dataset.city = openCity; el.dataset.days = M.days.join(',');
  el.innerHTML = `<div class="ldetail">
    <div class="lhead"><span class="badge">${esc(openCity)}</span><span class="ldest">כל ההגעות לתחנות שבתחומי ${esc(openCity)}, וכל הנסיעות של הקווים שעוברים בה</span><button class="closebtn" id="close-c">✕ סגירה</button></div>
    <div class="stat-row">
      <div><b>${s.meas ? pct(s.c[1], s.meas) : '—'}</b><span>בזמן, בתחנות שבעיר</span></div>
      <div><b>${s.meas ? pct(s.c[0], s.meas) : '—'}</b><span>הגיעו מוקדם מדי</span></div>
      <div><b>${s.avg == null ? '—' : fmt1(s.avg)}<i>דק׳</i></b><span>איחור ממוצע</span></div>
      <div><b>${s.meas ? pct(s.c[4], s.meas) : '—'}</b><span>איחור מעל 20 דקות</span></div>
      <div><b>${num(s.meas)}</b><span>הגעות נמדדו</span></div>
      <div><b class="${missCls(s.sched ? 1 - s.obs / s.sched : null)}">${s.sched ? pct(s.sched - s.obs, s.sched) : '—'}</b><span>לא נצפו: אי ביצוע משוער</span></div>
    </div>
    ${s.sched ? `<p class="pdesc">מתוך ${num(s.sched)} נסיעות בלו״ז של הקווים שעוברים ב${esc(openCity)}, ${num(s.sched - s.obs)} (${pct(s.sched - s.obs, s.sched)}) לא שידרו מיקום בכלל: לא בוצעו, או בוצעו בלי שידור. אי אפשר להבחין בין השניים, ולכן זה מוצג לצד הדיוק ולא בתוכו. הנסיעות נספרות לאורך כל המסלול, לא רק בקטע שבעיר.</p>` : ''}
    ${distHtml(s)}
    <div id="c-ags" style="margin-top:10px"></div>
    <div class="ptitle" style="margin-top:12px">הקווים שעוברים ב${esc(openCity)}</div><p class="pdesc">לכל קו: כמה הגעות נמדדו בתחנות שבתוך העיר, איזה חלק מהן בזמן, והאיחור הממוצע שם. קו שעובר בכמה ערים נמדד כאן רק בקטע שבתוך העיר. לחיצה על מספר הקו פותחת את הפירוט המלא של הקו.</p>
    <div class="filters" id="clfilters"></div><div id="c-lines"><div class="empty">טוען…</div></div></div>`;
  $('#close-c').onclick = () => { openCity = null; el.innerHTML = ''; delete el.dataset.city; renderCities(); };
  const city = openCity, days = M.days;
  loadCities(days).then(() => { if (openCity === city && $('#c-lines')) renderCityLines(); });
}
function renderCityLines() {
  const box = $('#c-lines'); if (!box) return;
  const acc = new Map();
  for (const d of M.days) {
    const rows = (cityCache[d] || {})[openCity]; if (!rows) continue;
    rows.forEach(([rid, n, on, sum10]) => { const x = acc.get(rid) || {rid, n: 0, on: 0, sum: 0}; x.n += n; x.on += on; x.sum += sum10 / 10; acc.set(rid, x); });
  }
  if (!acc.size) { box.innerHTML = '<div class="empty">אין עדיין פירוט קווים לעיר הזו ליום הזה (מחושב מהריצה הבאה)</div>'; $('#clfilters').innerHTML = ''; $('#c-ags').innerHTML = ''; return; }
  // לכל קו גם נסיעות בלו״ז/נצפו (של כל המסלול) — אי ביצוע משוער
  const all = [...acc.values()].map(x => { const l = lineLabel(x.rid), rr = M.Rr[x.rid]; const sched = rr ? rr.sched : 0, obs = rr ? rr.obs : 0; return {rid: x.rid, short: l.short, long: l.long, agency: l.agency, cluster: l.cluster, n: x.n, on: x.on / x.n, avg: x.sum / x.n, sched, obs, miss: sched ? 1 - obs / sched : null}; });
  // המפעילים בעיר — מהקווים שלהם, רק הקטע שבתוך העיר
  const ag = {}; all.forEach(r => { const a = ag[r.agency] || (ag[r.agency] = {n: 0, on: 0, sum: 0, lines: 0, sched: 0, obs: 0}); a.n += r.n; a.on += r.on * r.n; a.sum += r.avg * r.n; a.lines++; a.sched += r.sched; a.obs += r.obs; });
  const agRows = Object.entries(ag).sort((a, b) => b[1].n - a[1].n);
  $('#c-ags').innerHTML = `<div class="ptitle">המפעילים ב${esc(openCity)}</div><div class="tblbox"><table><thead><tr><th>מפעיל</th><th>מסלולים בעיר</th><th>נסיעות בלו״ז</th><th>לא נצפו</th><th>הגעות בעיר</th><th>בזמן</th><th>איחור ממוצע</th></tr></thead><tbody>` +
    agRows.map(([nm, a]) => `<tr><td class="nm"><button class="linebtn" data-cag="${esc(nm)}" title="רק הקווים של המפעיל הזה בעיר">${esc(nm)}</button></td><td>${num(a.lines)}</td><td>${num(a.sched)}</td><td class="${missCls(a.sched ? 1 - a.obs / a.sched : null)}">${a.sched ? pct(a.sched - a.obs, a.sched) : '—'}</td><td>${num(a.n)}</td><td>${onCell(a.on / a.n)}</td><td class="${dcls(a.sum / a.n)}">${fmt1(a.sum / a.n)} דק׳</td></tr>`).join('') + '</tbody></table></div>';
  $('#c-ags').querySelectorAll('.linebtn').forEach(b => b.onclick = () => { cAgency = b.dataset.cag; showAllCL = false; renderCityLines(); });
  const chips = [['meas', 'הכי הרבה הגעות'], ['worst', 'הכי לא מדייקים'], ['best', 'הכי מדייקים'], ['miss', 'הכי הרבה אי ביצוע']];
  $('#clfilters').innerHTML = `<select id="cagsel" title="מפעיל"><option value="">כל המפעילים</option>${agRows.map(([a]) => `<option value="${esc(a)}"${a === cAgency ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>` +
    chips.map(([k, t]) => `<button class="fchip${cRank === k ? ' on' : ''}" data-r="${k}">${t}</button>`).join('');
  $('#cagsel').onchange = e => { cAgency = e.target.value; showAllCL = false; renderCityLines(); };
  $('#clfilters').querySelectorAll('.fchip').forEach(b => b.onclick = () => { cRank = b.dataset.r; sortCL = cRank === 'worst' ? {k: 'on', dir: 1} : cRank === 'best' ? {k: 'on', dir: -1} : cRank === 'miss' ? {k: 'miss', dir: -1} : {k: 'n', dir: -1}; showAllCL = false; renderCityLines(); });
  let rows = all;
  if (cAgency) rows = rows.filter(r => r.agency === cAgency);
  if (cRank === 'miss') rows = rows.filter(r => r.sched >= MIN_RIDES);
  else if (cRank !== 'meas') rows = rows.filter(r => r.n >= MIN_CITY);
  sortRows(rows, sortCL);
  const total = rows.length;
  if (!showAllCL) rows = rows.slice(0, 30);
  box.innerHTML = `<div class="tblbox"><table id="tcl"><thead><tr>${th('קו', 'short', sortCL)}${th('מסלול', 'long', sortCL)}${th('מפעיל', 'agency', sortCL)}${th('אשכול', 'cluster', sortCL)}${th('נסיעות בלו״ז', 'sched', sortCL)}${th('לא נצפו', 'miss', sortCL)}${th('הגעות בעיר', 'n', sortCL)}${th('בזמן', 'on', sortCL)}${th('איחור ממוצע', 'avg', sortCL)}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><button class="linebtn" data-rid="${esc(r.rid)}">${esc(r.short)}</button></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td style="font-size:12px">${esc(r.cluster)}</td><td>${num(r.sched)}</td><td class="${missCls(r.miss)}" title="${num(r.sched - r.obs)} מתוך ${num(r.sched)} נסיעות לא שידרו מיקום בכלל">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${num(r.n)}</td><td>${onCell(r.on)}</td><td class="${dcls(r.avg)}">${delayTxt(r.avg)} דק׳</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-cl">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים ב${esc(openCity)}${cAgency ? ' של ' + esc(cAgency) : ''} (כיוון וחלופה נספרים בנפרד)${cRank === 'miss' ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות בלו״ז` : cRank !== 'meas' ? ` · בדירוג רק קווים עם לפחות ${MIN_CITY} הגעות שנמדדו בעיר` : ''} · "נסיעות בלו״ז" ו"לא נצפו" — של כל המסלול, לא רק הקטע שבעיר</div>`;
  $('#tcl thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortCL = {k, dir: sortCL.k === k ? -sortCL.dir : (['short', 'long', 'agency', 'cluster'].includes(k) ? 1 : -1)}; renderCityLines(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = () => { openLine = b.dataset.rid; renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  const mb = $('#more-cl'); if (mb) mb.onclick = () => { showAllCL = true; renderCityLines(); };
}
function renderFilters() {
  const ags = Object.keys(M.A).sort((a, b) => M.A[b].meas - M.A[a].meas);
  const chips = [['worst', 'הכי לא מדייקים'], ['best', 'הכי מדייקים'], ['early', 'הכי הרבה יציאות מוקדמות'], ['miss', 'הכי הרבה לא נצפו']].concat(reachT(M.tot) ? [['vanish', 'הכי הרבה נעלמו בדרך']] : []).concat([['', 'הכי הרבה נסיעות']]);
  const cls = Object.keys(M.K || {}).sort((a, b) => M.K[b].meas - M.K[a].meas);
  $('#lfilters').innerHTML = `<select id="agsel" title="מפעיל"><option value="">כל המפעילים</option>${ags.map(a => `<option value="${esc(a)}"${a === agency ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>` +
    (cls.length > 1 ? `<select id="clsel" title="אשכול"><option value="">כל האשכולות</option>${cls.map(a => `<option value="${esc(a)}"${a === cluster ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>` : '') +
    chips.map(([k, t]) => `<button class="fchip${rank === k ? ' on' : ''}" data-r="${k}">${t}</button>`).join('') +
    `<input class="search" id="lq" placeholder="חיפוש קו: מספר, יעד…" value="${esc(lq)}">`;
  $('#agsel').onchange = e => { agency = e.target.value; showAllL = false; renderLines(); renderWorst(); };
  const cs = $('#clsel'); if (cs) cs.onchange = e => { cluster = e.target.value; showAllL = false; renderLines(); renderWorst(); };
  $('#lfilters').querySelectorAll('.fchip').forEach(b => b.onclick = () => { rank = b.dataset.r; showAllL = false; sortL = rank === 'worst' ? {k: 'on', dir: 1} : rank === 'best' ? {k: 'on', dir: -1} : rank === 'early' ? {k: 'oearly', dir: -1} : rank === 'miss' ? {k: 'miss', dir: -1} : rank === 'vanish' ? {k: 'rvan', dir: -1} : {k: 'meas', dir: -1}; renderFilters(); renderLines(); });
  $('#lq').oninput = e => { lq = e.target.value; showAllL = false; renderLines(); };
}
function renderLines() {
  const q = lq.trim();
  let rows = Object.values(M.Rr).map(s => { const l = lineLabel(s.rid); const oT = s.o.reduce((x, y) => x + y, 0), rT = reachT(s); return Object.assign({short: l.short, long: l.long, agency: l.agency, cluster: l.cluster || 'ללא אשכול', dir: l.dir, on: s.on, miss: s.sched > 0 ? Math.max(0, 1 - s.obs / s.sched) : null, early: s.meas ? s.c[0] / s.meas : null, oearly: oT ? s.o[0] / oT : null, avg: s.avg, b4: s.meas ? s.c[4] / s.meas : null, rend: rT ? s.reach[0] / rT : null, rstart: rT ? (s.reach[2] + s.reach[3]) / rT : null, rvan: rT ? 1 - s.reach[0] / rT : null, rT}, s); });
  if (agency) rows = rows.filter(r => r.agency === agency);
  if (cluster) rows = rows.filter(r => r.cluster === cluster);
  if (rank === 'miss') rows = rows.filter(r => r.sched >= MIN_RIDES);
  else if (rank === 'vanish') rows = rows.filter(r => r.rT >= MIN_RIDES);
  else if (rank) rows = rows.filter(r => r.obs >= MIN_RIDES);
  if (q) {
    const tok = q.split(/\s+/);
    const numTok = tok.find(t => /^\d/.test(t)), txt = tok.filter(t => t !== numTok).join(' ');
    rows = rows.filter(r => (!numTok || r.short === numTok || (!txt && r.short.startsWith(numTok))) && (!txt || (r.long + ' ' + r.agency).includes(txt)));
  }
  sortRows(rows, sortL);
  const total = rows.length;
  if (!showAllL) rows = rows.slice(0, q ? 60 : 40);
  $('#t-lines').innerHTML = `<div class="tblbox"><table id="tlines"><thead><tr>${th('קו', 'short', sortL)}${th('מסלול', 'long', sortL)}${th('מפעיל', 'agency', sortL)}${th('אשכול', 'cluster', sortL)}${th('נסיעות', 'sched', sortL)}${th('נצפו', 'obs', sortL)}${th('לא נצפו', 'miss', sortL)}${th('הגעות', 'meas', sortL)}${th('בזמן', 'on', sortL)}${th('יצאו מוקדם', 'oearly', sortL)}${th('איחור ממוצע', 'avg', sortL)}${th('מעל 20 דק׳', 'b4', sortL)}${reachT(M.tot) ? th('עד הסוף', 'rend', sortL) + th('רק בהתחלה', 'rstart', sortL) : ''}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><button class="linebtn" data-rid="${esc(r.rid)}">${esc(r.short)}</button></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td style="font-size:12px;color:var(--mut)">${esc(r.cluster)}</td><td>${num(r.sched)}</td><td>${num(r.obs)}</td><td class="${missCls(r.miss)}" title="${r.sched > 0 ? num(Math.max(0, r.sched - r.obs)) + ' מתוך ' + num(r.sched) + ' נסיעות מתוכננות לא נצפו' : 'אין נסיעות מתוכננות לחישוב'}">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.oearly == null ? '—' : Math.round(r.oearly * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td>${reachT(M.tot) ? `<td>${r.rend == null ? '—' : Math.round(r.rend * 100) + '%'}</td><td class="${r.rstart == null ? '' : r.rstart >= 0.1 ? 'd4' : r.rstart >= 0.05 ? 'd3' : ''}">${r.rstart == null ? '—' : Math.round(r.rstart * 100) + '%'}</td>` : ''}</tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-l">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים${agency ? ' של ' + esc(agency) : ''}${cluster ? ' באשכול ' + esc(cluster) : ''} (כיוון וחלופה נספרים בנפרד)${rank === 'miss' ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות בלו״ז` : rank === 'vanish' ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות ששודרו` : rank ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות שנצפו` : ''}</div><p class="pdesc">״לא נצפו״: נסיעות מתוכננות שלא זוהו בנתונים. ייתכן שלא בוצעו או שבוצעו ללא שידור שנקלט. האחוז מחושב מתוך הנסיעות המתוכננות.${reachT(M.tot) ? ' "עד הסוף" ו"רק בהתחלה": עד איפה לאורך המסלול נראה האוטובוס, מתוך הנסיעות ששודרו (הסבר בפירוט "איפה האוטובוס נעלם").' : ''}</p>`;
  $('#tlines thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortL = {k, dir: sortL.k === k ? -sortL.dir : (['short', 'long', 'agency', 'cluster'].includes(k) ? 1 : -1)}; renderLines(); };
  $('#t-lines').querySelectorAll('.linebtn').forEach(b => b.onclick = () => { openLine = b.dataset.rid; renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  const mb = $('#more-l'); if (mb) mb.onclick = () => { showAllL = true; renderLines(); };
  renderLineDetail();
}
// פרופיל לאורך הקו: מהקבצים היומיים של התחנות (נטענים בפעם הראשונה), מאוחד על פני התקופה
function loadProfiles(days) {
  const need = days.filter(d => !stopCache[d]);
  const p = [];
  if (!NAMES) p.push(load(DATA + 'stops.json').then(j => { NAMES = j; }).catch(() => { NAMES = {}; }));
  need.forEach(d => p.push(load(DATA + 'days/' + d + '.stops.json').then(j => { stopCache[d] = j; }).catch(() => { stopCache[d] = {}; })));
  return Promise.all(p);
}
function profileOf(rid, days) {
  const acc = new Map();
  for (const d of days) {
    const rows = (stopCache[d] || {})[rid];
    if (!rows) continue;
    const sched = ((M.Rr[rid] || {}).schedByDay || {})[d] || 0;
    rows.forEach(([code, n, avg10, on, plan], i) => { const x = acc.get(code) || {code, n: 0, sum: 0, on: 0, plan: 0, i}; x.n += n; x.sum += avg10 / 10 * n; x.on += on; x.plan += plan == null ? sched : plan; acc.set(code, x); });
  }
  return [...acc.values()].sort((a, b) => a.i - b.i).map(x => ({code: x.code, n: x.n, avg: x.sum / x.n, on: x.on / x.n, plan: x.plan}));
}
function renderLineDetail() {
  const el = $('#line-detail'); if (!el) return;
  const s = openLine && M.Rr[openLine];
  if (!s) { el.innerHTML = ''; return; }
  const l = lineLabel(openLine);
  const hours = Array.from({length: 24}, (_, h) => { const v = s.hours[h]; const sh = v && v[0] >= 5 ? v[1] / v[0] : null; return {x: String(h).padStart(2, '0'), y: sh == null ? null : Math.round(sh * 100), color: hourColor(sh), tip: `<b>${String(h).padStart(2, '0')}:00</b><br>${v && v[0] ? pct(v[1], v[0]) + ' בזמן · ' + num(v[0]) + ' הגעות' : 'אין נתונים'}`}; });
  const oT = s.o.reduce((a, b) => a + b, 0);
  el.innerHTML = `<div class="ldetail">
    <div class="lhead"><span class="badge">${esc(l.short)}</span><span class="ldest">${esc(l.long)} · ${esc(l.agency)}${l.cluster ? ' · אשכול ' + esc(l.cluster) : ''}${l.ltype ? ' · קו ' + esc(l.ltype) : ''}${l.dir ? ' · כיוון ' + esc(l.dir) : ''}${l.alt && l.alt !== '#' && l.alt !== '0' ? ' · חלופה ' + esc(l.alt) : ''}</span><button class="closebtn" id="close-l">✕ סגירה</button></div>
    <div class="stat-row">
      <div><b>${s.meas ? pct(s.c[1], s.meas) : '—'}</b><span>בזמן, בכל התחנות</span></div>
      <div><b>${oT ? pct(s.o[1], oT) : '—'}</b><span>יציאה בזמן מהמוצא</span></div>
      <div><b>${oT ? pct(s.o[0], oT) : '—'}</b><span>יציאה מוקדמת מהמוצא</span></div>
      <div><b>${s.avg == null ? '—' : fmt1(s.avg)}<i>דק׳</i></b><span>איחור ממוצע${s.s && s.s[2] != null ? ` · 90% עד ${fmt1(s.s[2])}` : ''}</span></div>
      <div><b>${num(s.obs)}</b><span>נסיעות נצפו מתוך ${num(s.sched)}</span></div>
      ${reachT(s) ? `<div><b>${pct(s.reach[0], reachT(s))}</b><span>נראו עד סוף המסלול</span></div><div><b>${pct(s.reach[1], reachT(s))}</b><span>נעלמו באמצע הדרך</span></div><div><b>${pct(s.reach[2], reachT(s))}</b><span>נראו רק בהתחלה</span></div><div><b>${pct(s.reach[3], reachT(s))}</b><span>שידרו ולא זזו</span></div>` : ''}
      ${s.cov[0] ? `<div><b>${pct(s.cov[1], s.cov[0])}</b><span>מהתחנות שבדרך נקלטו (השאר: חורי GPS)</span></div>` : ''}
    </div>
    ${vehicleDetails(s)}
    ${distHtml(s)}
    <div class="cols2" style="margin-top:10px"><div><div class="ptitle">אחוז בזמן לפי השעה ביום</div><p class="pdesc">לפי השעה שבה האוטובוס היה אמור להגיע לתחנה.</p><div class="chart" id="c-lh"></div></div>
    <div><div class="ptitle">האיחור הממוצע לאורך הקו</div><p class="pdesc">עמודה לכל תחנה, מהמוצא (ימין) ליעד. איפה שהעמודות קופצות, שם הקו מאבד זמן.</p><div class="chart" id="c-lp"><div class="empty">טוען…</div></div></div></div>
    <div class="ptitle" style="margin-top:12px">תחנה אחרי תחנה</div><p class="pdesc">לכל תחנה בקו: כמה הגעות נמדדו ואיזה חלק הן מהנסיעות המתוכננות שעוברות בתחנה, האיחור הממוצע, ואיזה חלק מההגעות היה בזמן. ירידה חדה ב"מהמתוכנן" באמצע הקו: שם האוטובוסים נעלמים, בגלל קליטה או כי הנסיעה לא הגיעה עד לשם.</p><div id="lprof"><div class="empty">טוען…</div></div>
  </div>`;
  barChart($('#c-lh'), hours, {color: C.line, max: 100, unit: '%', h: 160});
  $('#close-l').onclick = () => { openLine = null; el.innerHTML = ''; };
  const rid = openLine, days = M.days;
  loadProfiles(days).then(() => {
    if (openLine !== rid) return;
    const prof = profileOf(rid, days);
    const box = $('#lprof'), ch = $('#c-lp');
    if (!box) return;
    if (!prof.length) { box.innerHTML = '<div class="empty">אין עדיין פירוט לתחנות ליום הזה (מחושב מהריצה הבאה)</div>'; ch.innerHTML = '<div class="empty">אין נתונים</div>'; return; }
    const mx = Math.max(10, Math.ceil(Math.max(...prof.map(p => p.avg)) / 5) * 5);
    barChart(ch, prof.map((p, i) => ({x: String(i + 1), y: Math.max(0, p.avg), color: BCOL[catOf(p.avg)], tip: `<b>${esc(stopName(p.code))}</b><br>איחור ממוצע ${delayTxt(p.avg)} דק׳ · ${pct(p.on * p.n, p.n)} בזמן · ${num(p.n)} הגעות`})), {color: C.line, max: mx, unit: '׳', h: 160});
    const planCls = p => !p.plan ? '' : p.n / p.plan >= 0.8 ? 'd1' : p.n / p.plan >= 0.6 ? 'd2' : p.n / p.plan >= 0.4 ? 'd3' : 'd4';
    box.innerHTML = `<div class="prof"><div class="ps h"><span></span><span>תחנה</span><span>הגעות</span><span>מהמתוכנן</span><span>איחור ממוצע</span><span>בזמן</span></div>` +
      prof.map((p, i) => `<div class="ps"><span class="dot s${catOf(p.avg)}"></span><span class="rn">${esc(stopName(p.code))} <small>${esc(p.code)}${i === 0 ? ' · מוצא' : i === prof.length - 1 ? ' · יעד' : ''}</small></span><span class="num">${num(p.n)}</span><span class="num ${planCls(p)}" title="${p.plan ? num(p.n) + ' הגעות נמדדו מתוך ' + num(p.plan) + ' נסיעות מתוכננות שעוברות בתחנה' : 'אין מספר מתוכנן לתחנה'}">${p.plan ? Math.round(100 * p.n / p.plan) + '%' : '—'}</span><span class="num ${dcls(p.avg)}">${delayTxt(p.avg)} דק׳</span><span class="num">${Math.round(p.on * 100)}%</span></div>`).join('') + '</div>' +
      '<div class="mut" style="margin-top:6px">בתחנת המוצא: יציאה מול השעה שבלו״ז. בשאר התחנות: הגעה. קפיצה חדה בין שתי תחנות סמוכות היא הקטע שבו הקו מאבד זמן. "מהמתוכנן": ההגעות שנמדדו מתוך כל הנסיעות שהיו אמורות לעבור בתחנה. במוצא המספר נמוך יותר כי היציאה נמדדת רק כשהרכב נראה עומד בתחנה לפני שיצא.</div>';
  });
}
function renderWorst() {
  let rows = M.worst;
  if (agency) rows = rows.filter(w => lineLabel(w[1]).agency === agency);
  if (cluster) rows = rows.filter(w => (lineLabel(w[1]).cluster || 'ללא אשכול') === cluster);
  rows = rows.slice(0, 40);
  $('#worst').innerHTML = rows.length ? rows.map((w, i) => { const [d, rid, , dl, stop, sched, ps] = w; const l = lineLabel(rid); return `<li data-i="${i}" tabindex="0"><span class="badge">${esc(l.short)}</span><span class="dl">+${num(dl)} דק׳</span><span>${esc(l.long)}</span><small style="color:var(--dim)">${esc(l.agency)} · יציאה מתוכננת ${hhmm(sched)}${period !== 'day' ? ' · ' + shortDate(d) : ''} · האיחור הגדול נמדד ב${esc(stop)}${ps && ps.length ? '' : ' · אין פירוט תחנות'}</small></li>`; }).join('') : `<li>אין נסיעות עם איחור מעל 20 דקות${agency ? ' אצל ' + esc(agency) : ''}${cluster ? ' באשכול ' + esc(cluster) : ''}</li>`;
  $('#worst').querySelectorAll('li[data-i]').forEach(li => { const open = () => openRide(rows[+li.dataset.i]); li.onclick = open; li.onkeydown = e => { if (e.key === 'Enter') open(); }; });
}
function openRide(w) {
  const [d, rid, trip, dl, stop, sched, ps] = w;
  const l = lineLabel(rid);
  const ovl = document.createElement('div'); ovl.className = 'ovl';
  const body = () => !ps || !ps.length ? '<div class="empty">אין פירוט תחנות לנסיעה הזו</div>' :
    `<div class="route"><div class="rs h"><span></span><span>תחנה</span><span>מתוכנן</span><span>בפועל</span><span>איחור</span></div>` +
    ps.map((x, i) => { const [code, sc, act] = x; const dm = (act - sc) / 60; const b = catOf(dm); const first = i === 0;
      return `<div class="rs"><span class="dot s${b}"></span><span class="rn">${esc(stopName(code))}${first ? ' <small>מוצא · יציאה</small>' : i === ps.length - 1 ? ' <small>אחרונה שנמדדה</small>' : ''}</span><span class="rt">${hhmm(sc)}</span><span class="ra">${hhmm(act)}</span><span class="rd ${dcls(dm)}">${delayTxt(dm)} דק׳</span></div>`; }).join('') + '</div>';
  // קישור לציר הזמן של דאטאבוס: מפעיל + מספר קו + זמן היציאה (שם בוחרים כיוון ונסיעה).
  // מזהה הנסיעה של משרד התחבורה לא מוכר להם (שלמה 06.09: "Route with id … not found").
  const [dy, dm, dd] = d.split('-').map(Number);
  const ts = new Date(dy, dm - 1, dd, 0, 0, sched || 0).getTime();
  const dbLink = `https://open-bus-map-search.hasadna.org.il/timeline?${l.aid ? `operatorId=${encodeURIComponent(l.aid)}&` : ''}lineNumber=${encodeURIComponent(l.short)}&timestamp=${ts}`;
  ovl.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mhead"><h2>קו ${esc(l.short)}</h2><span class="st s4">+${num(dl)} דק׳ לכל היותר</span><button class="x" aria-label="סגירה">✕</button></div>
    <div class="msub">${esc(l.long)} · ${esc(l.agency)} · ${heDate(d)} · יציאה מתוכננת ${hhmm(sched)} · <a href="${dbLink}" target="_blank" rel="noopener">הקו בדאטאבוס ↗</a> <small style="color:var(--dim)">(שם בוחרים את הכיוון ואת הנסיעה של ${hhmm(sched)})</small></div>
    <div id="ride-body">${NAMES ? body() : '<div class="empty">טוען שמות תחנות…</div>'}</div>
    <div class="note">"בפועל" בתחנת המוצא הוא רגע היציאה, ובשאר התחנות רגע ההגעה (דיוק של כחצי דקה). תחנות שהאוטובוס לא שידר לידן לא מופיעות.</div></div>`;
  document.body.appendChild(ovl);
  const close = () => { ovl.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.x', ovl).onclick = close; ovl.onclick = e => { if (e.target === ovl) close(); };
  if (!NAMES) loadProfiles([]).then(() => { const b = $('#ride-body', ovl); if (b) b.innerHTML = body(); });
}

const METHOD = `<div class="ptitle">איך זה נמדד</div>
<p><b>בקצרה:</b> משרד התחבורה משדר כל דקה את המיקום של כל אוטובוס בארץ, ולצידו את התחנה הבאה שלו ואת המרחק אליה. דאטאבוס (הסדנא לידע ציבורי) שומרים את השידורים האלה, ואנחנו מורידים את השמירה של כל יום, מצמידים כל נסיעה ללוח הזמנים שמשרד התחבורה פרסם לאותו יום, ובודקים בכל תחנה: מתי האוטובוס היה אמור להגיע, ומתי הגיע.</p>
<ul>
<li><b>מתי "הגיע":</b> כשהמרחק לתחנה הבאה יורד לאפס, או כשהתחנה הבאה מתחלפת בזו שאחריה. בין שתי דגימות (דקה) הזמן משוערך לפי המרחק, כך שהדיוק הוא כחצי דקה. התחנה עצמה נקבעת לפי המק״ט ששודר, לא לפי המספר הסידורי.</li>
<li><b>תחנת המוצא:</b> שם נמדדת היציאה, לא ההגעה. משרד התחבורה מציג את הרכב "בתחנה" חמש דקות לפני היציאה גם כשהוא עומד ברציף, ולכן היציאה נקבעת רק אחרי שראינו אותו עומד באמת (שתי דגימות לפחות) ואז זז. אם השידור נקטע בין העמידה לנסיעה, היציאה משוערכת מהמיקום הראשון בדרך לפי מהירות הלו״ז. "יצא מוקדם" הוא אוטובוס שעזב את המוצא יותר מ-2 דקות לפני השעה שבלו״ז.</li>
<li><b>ההצמדה ללו״ז:</b> לפי מספר המסלול ושעת היציאה המתוכננת שהאוטובוס עצמו משדר, מול קובץ ה-GTFS של אותו יום. כשכמה רכבים משדרים את אותה נסיעה (תגבור), נמדד השידור הארוך.</li>
<li><b>קטגוריות:</b> מוקדם = יותר מ-2 דקות לפני הלו״ז (בעיה לנוסע שמגיע בזמן); בזמן = עד 5 דקות איחור; ואז 5–10, 10–20, ומעל 20 דקות. "בזמן" נספר לכל הגעה לתחנה, לא לנסיעה.</li>
<li><b>מה לא נספר:</b> נסיעות שלא שידרו בכלל (מופיעות כ"לא נצפו"); נסיעה ששודרה יותר משעה וחצי רחוק מהלו״ז שלה (כנראה רכב שהוסב לנסיעה אחרת); נסיעה שיצאה 45 דקות ומעלה אחרי הלו״ז כשבדיוק אז יש נסיעה אחרת בלו״ז של אותו קו (זו הנסיעה האחרת, שדווחה עם שעת יציאה ישנה); קפיצה של תחנות או מרחק בין שתי דגימות במהירות שאינה אפשרית (תקלת שידור, התחנות שבקפיצה לא נמדדות); מדידה בודדת שקופצת ב-20 דקות משתי שכנותיה (תקלת שיערוך); רכבת ורכבת קלה; ויום שבו נצפו פחות מ-30% מהנסיעות (שידור חלקי, מוצג בנפרד). נסיעות ששודרו ואין להן נסיעה בלו״ז (תגבורים) נספרות בנפרד.</li>
<li><b>אשכול ועיר:</b> האשכול של כל קו לפי רשימת ClusterToLine שמשרד התחבורה מפרסם לצד לוח הזמנים (73 אשכולות מכרז, וסוג הקו: עירוני, אזורי, בינעירוני). העיר של כל תחנה לפי קובץ התחנות של המשרד, כך ש"לפי עיר" סופר את ההגעות לתחנות שבתחומי העיר בלבד, וקו שעובר בכמה ערים נמדד בכל עיר בנפרד.</li>
<li><b>עד איפה נראה האוטובוס (מ-17.09.2026):</b> לכל נסיעה ששודרה נרשמת התחנה האחרונה שבה נמדדה. "עד הסוף": אחת משתי התחנות האחרונות (ביעד עצמו הרכב לרוב כבר לא משדר). "רק בהתחלה": לא מעבר לשלוש התחנות הראשונות. "שודרו ולא זזו": 5 דגימות ומעלה בלי שהתחנה הבאה התקדמה. משרד התחבורה סופר נסיעה שבוצעה לפי הדיווח בתחנת המוצא בלבד; כאן לפי כל התחנות. "קליטה בדרך": מתוך התחנות שבין הראשונה לאחרונה שנמדדו (הרכב ודאי עבר בהן), כמה נמדדו. תחנה שאחריה נעלמות נסיעות של כמה חברות היא כנראה בעיית קליטה או מסוף, לא של החברה. "מהמתוכנן" בטבלת התחנות: ההגעות שנמדדו בתחנה מתוך כל הנסיעות שהיו אמורות לעבור בה לפי לוח הזמנים.</li>
<li><b>אי ביצוע:</b> נסיעה שבלוח הזמנים ולא שידרה מיקום בכלל נספרת "לא נצפתה". זה אי ביצוע משוער: או שהנסיעה לא יצאה, או שיצאה בלי שידור. אי אפשר להבחין בין השניים מהשידורים, ולכן זה מוצג לצד מדדי הדיוק ולא בתוכם, בסך הארצי, לפי מפעיל, אשכול, קו ועיר. בעיר נספרות כל הנסיעות של הקווים שעוברים בה, לאורך כל המסלול.</li>
<li><b>העומס על דאטאבוס:</b> אפס קריאות ל-API. הקבצים היומיים יורדים מאחסון S3 שנועד לזה, פעם אחת בלילה.</li>
</ul>`;

function init() {
  $('#method').innerHTML = METHOD;
  Promise.all([load(DATA + 'index.json'), load(DATA + 'routes.json').catch(() => ({}))]).then(([idx, cat]) => {
    IDX = idx; CAT = cat || {};
    // רק ימים אמיתיים (YYYY-MM-DD): קובץ ערים שנכנס בטעות לאינדקס הפיל את העמוד (08.09)
    DAYS = (idx.days || []).map(d => typeof d === 'string' ? {d} : d).filter(d => d.d && /^\d{4}-\d{2}-\d{2}$/.test(d.d));
    if (!DAYS.length) { $('#app').innerHTML = '<div class="msg">עדיין אין ימים מחושבים.</div>'; $('#sub').textContent = ''; return; }
    const [h, t] = decodeURIComponent((location.hash || '').slice(1)).split('/');
    dayD = DAYS.some(d => d.d === h) ? h : DAYS[DAYS.length - 1].d;
    if (t) tab = t;
    period = 'day';
    render();
  }).catch(e => { $('#app').innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; });
}
init();

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
