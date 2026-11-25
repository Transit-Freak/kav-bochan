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
let IDX = null, DAYS = [], CAT = {}, NAMES = null, period = 'day', dayD = null, dayCache = {}, stopCache = {}, periodCache = {};
let sortA = {k: 'meas', dir: -1}, sortC = {k: 'meas', dir: -1}, sortL = {k: 'meas', dir: -1}, lq = '', agency = '', rank = '', openLine = null, showAllL = false;
// אשכול (ClusterToLine של המשרד) ועיר עם פירוט קווים — משוב 07.09: "אין נתונים לפי עיר או אשכול", "לפי עיר זה כללי מדי"
let cluster = '', sortK = {k: 'meas', dir: -1}, cq = '', showAllC = false, openCity = null, cityCache = {}, cRank = 'meas', cAgency = '', sortCL = {k: 'n', dir: -1}, showAllCL = false;
const MIN_CITY = 20;    // דירוג קווים בתוך עיר: לפחות כך וכך הגעות שנמדדו בעיר
// סוג יום (אלעזר פינדר 23.11: "אולי ההבדל העיקרי בזמני ההגעה הוא בין שישי/מוצ"ש לשאר השבוע — העומס משנה את
// זמן העצירה"): תקופה של כמה ימים מצטמצמת לימים מסוג אחד. ימי חול: ראשון–חמישי. "מוצ״ש": יום השירות של שבת,
// שבפועל מתחיל בצאת השבת. אותה חלוקה כמו day_kind ב-tools/bus_periods.py (שמחבר מראש את ימי החול, N-wk.json)
const DTYPES = [['', 'כל הימים'], ['wk', 'ימי חול'], ['fri', 'שישי'], ['sat', 'מוצ״ש']];
const DTNAME = {wk: 'ימי חול (ראשון–חמישי)', fri: 'ימי שישי', sat: 'מוצאי שבת'};
const dtypeOf = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 5 ? 'fri' : w === 6 ? 'sat' : 'wk'; };
let dtype = '';
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
// קבצים כבדים שהאתר שומר מכווצים (שלמה 03.11: האתר מתקרב למגבלת הגודל): בפרסום, ‎X.json‎ נשמר כ-‎X.json.gz‎.
// מנסים קודם את המכווץ, ובלעדיו (או בדפדפן ישן) — את הרגיל. בודקים את סימן ה-gzip (1f 8b) ולא
// סומכים על כותרות השרת, כי אם השרת כבר פתח את הכיווץ — הגוף הוא JSON רגיל
async function gzJson(url, q) {
  if (window.DecompressionStream) {
    try {
      const r = await fetch(url + '.gz' + q, { cache: 'no-cache' });
      if (r.ok) {
        const b = new Uint8Array(await r.arrayBuffer());
        if (b[0] === 0x1f && b[1] === 0x8b) return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
        return JSON.parse(new TextDecoder().decode(b));
      }
    } catch (e) { /* נופלים לקובץ הרגיל */ }
  }
  const r = await fetch(url + q);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
// היום (שלמה 25.11: "שהיום יהיה אחת האפשרויות בבחירת היום, עם כל המידע כמו בכל יום"): כל 10 דקות
// .github/workflows/bus-today.yml מחשב את היום עד עכשיו — רק נסיעות שהסתיימו לפי הלו"ז — לאותם קובצי יום
// (days/D.json, .stops, .dep, .cover, .cities, .regions, מכווצים) ועוד today.json, בענף bus-today. היום מופיע
// בבחירת היום רק כשהקובץ של היום בישראל ועודכן בשלוש השעות האחרונות; התקופות (7/30 יום) — רק ימים שלמים
const TODAY_BASE = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan/bus-today/';
const TODAY_MAX_AGE = 3 * 3600 * 1000, TODAY_EVERY = 5 * 60 * 1000;
let TODAY = null, TNAMES = {};
const isTodayD = d => !!TODAY && d === TODAY.d;
const ilToday = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
function fetchToday() {
  return fetch(TODAY_BASE + 'today.json?t=' + Math.floor(Date.now() / 60000), {cache: 'no-store'}).then(r => r.ok ? r.json() : null)
    .then(j => j && j.fmt >= 2 && j.day && j.day.meas > 0 && j.d === ilToday() && Date.now() - new Date(j.updated) < TODAY_MAX_AGE && !DAYS.some(d => d.d === j.d) ? j : null)
    .catch(() => null);
}
function load(url) {
  if (TODAY && url.startsWith(DATA + 'days/' + TODAY.d + '.')) return gzJson(TODAY_BASE + url.slice(DATA.length), '?t=' + encodeURIComponent(TODAY.updated));
  if (/(^|\/)days\/[^/]+\.json$/.test(url)) return gzJson(url, '?v=' + Date.now());
  return fetch(url + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
}
const stopName = code => (NAMES && NAMES[code]) || TNAMES[code] || code;
// יום שבו נצפו פחות מ-30% מהנסיעות המתוכננות — שידור חלקי, מוצג בנפרד
const partial = d => d.sched > 0 && d.obs < d.sched * 0.3;

// ---------------------------------------------------------------- צבירה (כמה ימים)
function emptyAgg() { return {sched: 0, obs: 0, meas: 0, c: [0, 0, 0, 0, 0], o: [0, 0, 0, 0, 0], sum: 0, s: null, far: 0, extra: 0, vt: [0, 0, 0], reach: [0, 0, 0, 0], cov: [0, 0]}; }
// עד איפה נראה האוטובוס לאורך המסלול (מהריצה של 17.09; ימים ישנים בלי הנתון): [עד הסוף, חלק מהדרך, רק בהתחלה, שודר ולא זז]
function addReach(x, reach, cov) { if (!reach) return; reach.forEach((v, i) => x.reach[i] += v); (cov || []).forEach((v, i) => x.cov[i] += v); }
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
  for (const x of detail.plan?.dates || []) d.dates.add(x);   // קובץ תקופה (periods/N.json)
  if (detail.fleetDate) d.fleetDates.add(detail.fleetDate);
  for (const x of detail.fleetDates || []) d.fleetDates.add(x);
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
  if (TODAY) byD.set(TODAY.d, TODAY.day);
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
  const canPrev = DAYS[0].d < `${y}-${mm}-01`, canNext = (TODAY ? TODAY.d : DAYS[DAYS.length - 1].d) > `${y}-${mm}-${nDays}`;
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
  const chips = [...(TODAY ? [['today', `היום (עד ${TODAY.until})`]] : []), ['day', 'יום'], ['7', '7 ימים'], ['30', '30 ימים']].filter(([k]) => k === 'today' || k === 'day' || DAYS.length >= 3 && (k === '7' || DAYS.length > 7));
  const curD = dayD || DAYS[DAYS.length - 1].d;
  const pOn = k => k === 'today' ? period === 'day' && isTodayD(curD) : k === 'day' ? period === 'day' && !isTodayD(curD) : period === k;
  if (!calYM) calYM = [Number(curD.slice(0, 4)), Number(curD.slice(5, 7)) - 1];
  el.innerHTML = `<div class="seg">${chips.map(([k, t]) => `<button class="pchip${pOn(k) ? ' on' : ''}" data-p="${k}"${k === 'today' ? ' title="רק נסיעות שהסתיימו לפי הלו״ז — מתעדכן כל כמה דקות"' : ''}>${t}</button>`).join('')}</div>` +
    `<div class="daynav${period === 'day' ? ' on' : ''}"><button id="dprev" title="יום קודם">‹</button><div class="dwrap"><button id="dpick" class="dbtn" title="בחירת יום">${period === 'day' ? heDate(curD) : 'בחירת יום ▾'}</button><div id="cal" class="cal" hidden></div></div><button id="dnext" title="יום הבא">›</button></div>` +
    (period !== 'day' ? `<div class="seg dtseg" role="group" aria-label="סוג יום">${DTYPES.map(([k, t]) => `<button class="pchip${dtype === k ? ' on' : ''}" data-dt="${k}" title="${k ? 'רק ' + DTNAME[k] + ' מתוך התקופה' : 'כל הימים בתקופה'}">${t}</button>`).join('')}</div>` : '');
  el.querySelectorAll('.pchip[data-p]').forEach(b => b.onclick = () => {
    const k = b.dataset.p;
    if (k === 'today') { dayD = TODAY.d; period = 'day'; }
    else { period = k; if (k === 'day' && isTodayD(dayD)) dayD = DAYS[DAYS.length - 1].d; }
    render();
  });
  el.querySelectorAll('.pchip[data-dt]').forEach(b => b.onclick = () => { dtype = b.dataset.dt; render(); });
  const setDay = d => { if (!DAYS.some(x => x.d === d) && !isTodayD(d)) return; dayD = d; period = 'day'; render(); };
  $('#dpick').onclick = e => { e.stopPropagation(); calOpen = !calOpen; if (calOpen) calYM = [Number(curD.slice(0, 4)), Number(curD.slice(5, 7)) - 1]; renderCal(); };
  const cur = () => DAYS.findIndex(x => x.d === curD);
  $('#dprev').onclick = () => { const i = cur(); if (period !== 'day' || isTodayD(curD)) setDay(DAYS[DAYS.length - 1].d); else if (i > 0) setDay(DAYS[i - 1].d); };
  $('#dnext').onclick = () => { const i = cur(); if (period !== 'day') setDay(DAYS[DAYS.length - 1].d); else if (i >= 0 && i < DAYS.length - 1) setDay(DAYS[i + 1].d); else if (i === DAYS.length - 1 && TODAY) setDay(TODAY.d); };
  renderCal();
}
function windowDays() {
  if (period === 'day') return isTodayD(dayD) ? [TODAY.day] : DAYS.filter(d => d.d === dayD);
  return DAYS.slice(-Number(period)).filter(d => !partial(d) && (!dtype || dtypeOf(d.d) === dtype));
}

// ---------------------------------------------------------------- תצוגה
function heroHtml(a, days) {
  const title = (days.length === 1 ? heDate(days[0].d) : days.length ? `${shortDate(days[0].d)} – ${shortDate(days[days.length - 1].d)}.${days[days.length - 1].d.slice(0, 4)} · ${days.length} ימים` : '') + (period !== 'day' && dtype ? ' · רק ' + DTNAME[dtype] : '') + (days.length === 1 && isTodayD(days[0].d) ? ` · חלקי — נסיעות שהסתיימו עד ${TODAY.until}` : '');
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

// ---------------------------------------------------------------- האם הסדרנים מתחשבים בפקקים
// (שלמה 13.10: "תמחק את הקטגוריה מי אשם באיחור, שתעסוק רק אם הם מתחשבים בפקקים").
const pc = v => v == null ? '—' : Math.round(v * 100) + '%';
// האם הסדרנים מתחשבים בפקקים (שלמה 11.10: "בקרית מלאכי בשעות השיא נותנים לקו 2 30–40 דקות... לא
// יותר זמן במסוף, יותר זמן בקו"). שלושה מספרים לנסיעה: לפי הלו"ז הרשמי, כמה זמן החברה נתנה לה
// (עד היציאה הבאה של אותו אוטובוס), וכמה היא לקחה בפועל — בשיא ובשאר היום
const MIN_LAY = 30, LB = 8;
let layQ = '', layAg = '', laySort = 'n', layMore = 60;
function layBlk(v, o) {
  const g = i => v[o + i] || 0, m = (a, b) => g(b) ? g(a) / g(b) / 60 : null;
  return {n: g(0), off: m(2, 0), giv: m(1, 0), act: m(4, 3), made: g(0) ? g(5) / g(0) : null, ok: g(6) ? g(7) / g(6) : null};
}
function layRow(nm, v) {
  const P = layBlk(v, 0), O = layBlk(v, LB), n = P.n + O.n;
  const made = n ? ((v[5] || 0) + (v[LB + 5] || 0)) / n : null;
  return {nm, n, P, O, made};
}
const absCls = v => v == null ? 'na' : v >= .8 ? 'g' : v >= .65 ? 'y' : v >= .5 ? 'o' : 'r';
const dmin = v => v == null ? '—' : fmt1(v);
const LCOL = {off: '#9CA3AF', giv: '#1E5BC6', act: '#F26B1D'};
// שלושה פסים: לפי הלו"ז (אפור), כמה ניתן (כחול), כמה לקח בפועל (כתום)
function triBars(b, scale, lab) {
  if (!b || !b.n) return `<div class="tri"><span class="rl">${lab}</span><span class="dn">אין מספיק נסיעות</span></div>`;
  const one = (k, t) => `<div class="tb"><i style="width:${b[k] == null ? 0 : Math.min(100, 100 * b[k] / scale)}%;background:${LCOL[k]}"></i><b>${dmin(b[k])}</b><small>${t}</small></div>`;
  return `<div class="tri"><span class="rl">${lab}</span><div>${one('off', 'בלו״ז')}${one('giv', 'ניתנו')}${one('act', 'בפועל')}</div></div>`;
}
// למה הנסיעות יצאו באיחור (שלמה 23.11: "מה גרם לאיחורים והאם הסדרנים עשו עבודה טובה, כי רואים איזה
// רכב זה ואיפה הוא"). לכל נסיעה שיצאה יותר מ-3 דק' אחרי הזמן — מה עשה אותו אוטובוס לפני כן
// (tools/bus_reliability.py, cause_day). בכל בלוק (שיא, שאר היום) 12 עמודות.
const KB = 12;
// הצבעים ב-theme.css (--k-a..--k-d), עם גרסה כהה ב-tools/dark-extra/bus.css
const KCOL = {a: 'var(--k-a)', b: 'var(--k-b)', c: 'var(--k-c)', d: 'var(--k-d)'};
const KLAB = {a: 'הגיע באיחור מהנסיעה הקודמת', b: 'חיכה במסוף ויצא באיחור', c: 'אין נסיעה קודמת', d: 'לא ידוע'};
function causeRow(v) {
  const g = i => (v[i] || 0) + (v[KB + i] || 0);
  const late = g(1);
  return {n: g(0), late, lateSh: g(0) ? late / g(0) : null, a: g(3), a1: g(5), b: g(6), c: g(8), d: g(10),
    avg: late ? g(2) / late / 60 : null};
}
const dmyK = d => d ? d.split('-').reverse().join('.') : '';
function causeBar(r) {
  if (!r.late) return '<div class="kbar"></div>';
  const seg = k => r[k] ? `<span style="width:${100 * r[k] / r.late}%;background:${KCOL[k]}" title="${KLAB[k]}: ${num(r[k])} (${pc(r[k] / r.late)})"></span>` : '';
  return `<div class="kbar">${seg('a')}${seg('b')}${seg('c')}${seg('d')}</div>`;
}
// נסיעה מנהלית: בכל בלוק 7 עמודות (DH_COLS ב-bus_reliability.py)
function dhLine(D) {
  const v = D && D.tot || [], g = i => (v[i] || 0) + (v[7 + i] || 0);
  if (!g(0) || !g(1)) return '';
  return `<p class="note">${pc(g(1) / g(0))} מהנסיעות שיצאו באיחור הגיעו בנסיעה מנהלית ממקום אחר.${g(5) ? ` ב-${num(g(5))} מהן לוח הזמנים לא השאיר מספיק זמן לדרך.` : ''}</p>`;
}
function causeHtml(M) {
  const K = M.Bl && M.Bl.K;
  const head = `<div class="ptitle" style="margin-top:18px">למה הנסיעות יצאו באיחור</div>
    <p class="blead">לכל נסיעה שיצאה מהתחנה הראשונה יותר מ-3 דקות אחרי הזמן, בדקנו מה עשה אותו אוטובוס לפני כן.</p>`;
  if (!K || !K.days) return `${head}<div class="empty">החישוב מתחיל מהימים שמעובדים מ-23.11.2026.</div>`;
  const first = (M.days || [])[0];
  const since = K.from && first && K.from > first ? ` לימים שלפני ${dmyK(K.from)} אין את החישוב הזה.` : '';
  const tot = causeRow(K.tot);
  const rows = Object.entries(K.A).map(([nm, v]) => Object.assign(causeRow(v), {nm})).filter(r => r.late >= 20).sort((x, y) => y.late - x.late);
  const sh = (r, k) => r.late ? pc(r[k] / r.late) : '—';
  const tile = k => `<div><span><i style="background:${KCOL[k]}"></i>${KLAB[k]}</span><b>${sh(tot, k)}</b></div>`;
  return `${head}
    <div class="ktiles">${tile('a')}${tile('b')}${tile('c')}</div>
    <p class="note">${num(tot.late)} נסיעות יצאו באיחור — ${pc(tot.lateSh)} מהנסיעות שנמדדו. האיחור הממוצע ביציאה: ${dmin(tot.avg)} דק׳. מהנסיעות שהגיעו באיחור מהנסיעה הקודמת, ${sh({late: tot.a, a1: tot.a1}, 'a1')} כי גם הקודמת יצאה באיחור, והשאר כי איבדו זמן בדרך.${tot.d ? ` ב-${pc(tot.d / tot.late)} לא ידוע, כי סוף הנסיעה הקודמת לא נמדד.` : ''}</p>
    ${dhLine(K.dh)}
    <div class="blegend">${['a', 'b', 'c', 'd'].map(k => `<span><i style="background:${KCOL[k]}"></i>${KLAB[k]}</span>`).join('')}</div>
    <div class="khead"><span>חברה</span><span>יצאו באיחור</span><span>למה</span></div>
    ${rows.map(r => `<div class="krow">
      <div class="bn"><b>${esc(r.nm)}</b><small>${num(r.late)} נסיעות באיחור</small></div>
      <div class="lsc kn">${pc(r.lateSh)}</div>
      <div>${causeBar(r)}<small class="ksub">מהנסיעה הקודמת ${sh(r, 'a')} · במסוף ${sh(r, 'b')} · בלי קודמת ${sh(r, 'c')}</small></div>
    </div>`).join('') || '<div class="empty">אין מספיק נסיעות</div>'}
    <p class="note">לפי ${num(K.days)} ימים.${since}</p>`;
}
function layHtml(M) {
  const Lx = M.Bl && M.Bl.L;
  const head = `<div class="ptitle">האם הסדרנים מתחשבים בפקקים</div>
    <p class="blead">בלוח הזמנים הרשמי לכל נסיעה יש זמן קבוע. בשעות העומס הנסיעה לוקחת יותר, ולכן סדרן שמתחשב בפקקים נותן לאוטובוס יותר זמן עד הנסיעה הבאה שלו.</p>
    <div class="blegend"><span><i style="background:${LCOL.off}"></i>לפי הלו״ז הרשמי</span><span><i style="background:${LCOL.giv}"></i>הזמן שהחברה נתנה עד הנסיעה הבאה</span><span><i style="background:${LCOL.act}"></i>כמה הנסיעה לקחה בפועל</span></div>`;
  if (!Lx || !Lx.days) return `<div class="panel lay">${head}<div class="empty">החישוב מתחיל מהימים שמעובדים מ-07.10.2026.</div></div>`;
  const tot = layRow('כל החברות', Lx.tot);
  const rows = Object.entries(Lx.A).map(([nm, v]) => layRow(nm, v)).filter(r => r.n >= MIN_LAY).sort((a, b) => (b.made ?? -1) - (a.made ?? -1));
  const scale = Math.max(20, ...rows.flatMap(r => [r.P.giv || 0, r.P.act || 0, r.O.giv || 0, r.O.act || 0]));
  return `<div class="panel lay">${head}
    <div class="ltiles">
      <div><span>בשעות השיא, כל החברות</span>${triBars(tot.P, Math.max(tot.P.giv || 0, tot.P.act || 0, 1), '')}</div>
      <div><span>בשאר היום</span>${triBars(tot.O, Math.max(tot.P.giv || 0, tot.P.act || 0, 1), '')}</div>
      <div class="k"><span>האוטובוס הספיק להגיע לפני הנסיעה הבאה</span><b>${pc(tot.made)}</b></div>
    </div>
    <div class="lyhead"><span>חברה</span><span>הספיק</span><span>שעות שיא</span><span>שאר היום</span></div>
    ${rows.map(r => `<div class="lyrow">
      <div class="bn"><button class="linebtn" data-lag="${esc(r.nm)}">${esc(r.nm)}</button><small>${num(r.n)} נסיעות · <button class="lnk" data-lag="${esc(r.nm)}">הקווים של החברה ←</button></small></div>
      <div class="lsc ${absCls(r.made)}" title="האוטובוס הגיע לסוף הנסיעה לפחות דקה לפני הנסיעה הבאה שלו">${pc(r.made)}</div>
      ${triBars(r.P, scale, 'שיא')}${triBars(r.O, scale, 'שאר היום')}
    </div>`).join('') || '<div class="empty">אין מספיק נסיעות</div>'}
    ${causeHtml(M)}
    <div class="ptitle" style="margin-top:16px" id="lay-lt">כל הקווים</div>
    <div class="filters" id="lay-f"></div>
    <div id="lay-lines"></div>
    <details class="bmore"><summary>איך זה נמדד</summary><ul class="lhow">
      <li>עוקבים אחרי כל אוטובוס לפי מספר הרכב, מנסיעה לנסיעה.</li>
      <li><b>בלו״ז</b>: הזמן שלוח הזמנים הרשמי נותן לנסיעה, מהתחנה הראשונה עד האחרונה.</li>
      <li><b>ניתנו</b>: הזמן מהיציאה של הנסיעה עד היציאה הבאה של אותו אוטובוס, לפי לוח הזמנים. זה הזמן שהחברה נתנה בפועל לנסיעה.</li>
      <li><b>בפועל</b>: כמה הנסיעה לקחה, מהיציאה שנמדדה עד ההגעה לסוף.</li>
      <li><b>הספיק</b>: האוטובוס הגיע לסוף לפחות דקה לפני היציאה הבאה שלו.</li>
      <li>שעות שיא: יציאה בין 06:00 ל-09:00 או בין 15:00 ל-19:00. כשהאוטובוס יוצא שוב יותר מ-90 דקות אחרי הסוף (חניון, הפסקה), זה לא נחשב.</li>
      <li><b>למה יצאו באיחור</b>: נסיעה יצאה באיחור אם יצאה יותר מ-3 דקות אחרי הזמן. <b>הגיע באיחור מהנסיעה הקודמת</b>: האוטובוס סיים את הנסיעה הקודמת שלו פחות מדקה לפני הזמן של היציאה. <b>חיכה במסוף</b>: הגיע לפחות דקה לפני ובכל זאת יצא באיחור. <b>אין נסיעה קודמת</b>: הנסיעה הראשונה שלו ביום, או שהגיע מהחניון. <b>לא ידוע</b>: סוף הנסיעה הקודמת לא נמדד.</li>
      <li><b>נסיעה מנהלית</b>: זמן משוער לפי המרחק, כי האוטובוס לא משדר בדרך.</li>
    </ul></details>
  </div>`;
}
// "תחנה-עיר<->תחנה-עיר-10" → "תחנה ← תחנה"
const routeName = l => String(l || '').replace(/-\d+[#א-ת]?$/, '').split('<->').map(x => x.replace(/-[^-]*$/, '').trim()).join(' ← ');
function renderLayLines() {
  const box = $('#lay-lines'); if (!box || !M || !M.Bl || !M.Bl.L) return;
  const all = Object.entries(M.Bl.L.lines).map(([rid, v]) => { const c = CAT[rid] || []; return {rid, short: c[1] || '', long: c[2] || '', ag: c[3] || '', r: layRow('', v)}; }).filter(x => x.r.n >= 5);
  const ags = [...new Set(all.map(x => x.ag))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'));
  $('#lay-lt').textContent = layAg ? `הקווים של ${layAg}` : 'כל הקווים';
  $('#lay-f').innerHTML = `<select id="lay-ag" aria-label="חברה"><option value="">כל החברות</option>${ags.map(a => `<option ${a === layAg ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <input id="lay-q" class="search" type="search" placeholder="מספר קו או עיר, למשל: 2 קרית מלאכי" value="${esc(layQ)}">
    <select id="lay-s" aria-label="מיון">${[['n', 'הכי הרבה נסיעות'], ['made', 'הכי פחות הספיקו'], ['gap', 'בפועל ארוך מהזמן שניתן (שיא)'], ['num', 'לפי מספר קו']].map(([k, t]) => `<option value="${k}" ${laySort === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const q = layQ.trim().split(/\s+/).filter(Boolean);
  let list = all.filter(x => !layAg || x.ag === layAg);
  // מספר = מספר הקו בלבד (בשם המסלול יש ספרות של חלופה וכיוון); מילה = עיר, תחנה או חברה
  if (q.length) list = list.filter(x => q.every(w => /^\d+[א-ת]?$/.test(w) ? x.short === w : x.long.includes(w) || x.ag.includes(w)));
  const gap = x => x.r.P.act != null && x.r.P.giv != null ? x.r.P.act - x.r.P.giv : -99;
  const key = {n: x => -x.r.n, made: x => x.r.made ?? 2, gap: x => -gap(x), num: x => (parseInt(x.short) || 9999) * 10 + (x.short.length)}[laySort] || (x => -x.r.n);
  list.sort((a, b) => key(a) - key(b) || a.short.localeCompare(b.short, 'he'));
  const KL = M.Bl.K && M.Bl.K.days ? M.Bl.K.lines : null;
  const kcell = rid => { const v = KL && KL[rid]; if (!v) return '<td>—</td>'; const r = causeRow(v); return `<td class="kcell" title="${r.late ? ['a', 'b', 'c', 'd'].filter(k => r[k]).map(k => `${KLAB[k]}: ${num(r[k])}`).join(' · ') : ''}"><b>${pc(r.lateSh)}</b>${causeBar(r)}</td>`; };
  const shown = list.slice(0, layMore), t3 = b => b && b.n ? `${dmin(b.off)} · <b style="color:${LCOL.giv}">${dmin(b.giv)}</b> · <b style="color:${LCOL.act}">${dmin(b.act)}</b>` : '—';
  box.innerHTML = list.length ? `<div class="tblbox"><table><thead><tr><th>קו</th><th>מסלול</th>${layAg ? '' : '<th>חברה</th>'}<th>נסיעות</th><th>שעות שיא<br><small>בלו״ז · ניתנו · בפועל (דק׳)</small></th><th>שאר היום<br><small>בלו״ז · ניתנו · בפועל (דק׳)</small></th><th>הספיק</th>${KL ? '<th>יצאו באיחור<br><small>ולמה</small></th>' : ''}</tr></thead><tbody>${shown.map(x => `<tr><td><b>${esc(x.short)}</b></td><td class="nm">${esc(routeName(x.long))}</td>${layAg ? '' : `<td>${esc(x.ag)}</td>`}<td>${num(x.r.n)}</td><td>${t3(x.r.P)}</td><td>${t3(x.r.O)}</td><td><b class="bsct ${absCls(x.r.made)}">${pc(x.r.made)}</b></td>${KL ? kcell(x.rid) : ''}</tr>`).join('')}</tbody></table></div>
    <p class="note">${num(list.length)} כיווני קו עם 5 נסיעות לפחות.${list.length > shown.length ? ` <button class="lnk" id="lay-more">עוד ${num(Math.min(100, list.length - shown.length))} ←</button>` : ''}</p>` : '<div class="empty">לא נמצא קו עם 5 נסיעות לפחות</div>';
  $('#lay-ag').onchange = e => { layAg = e.target.value; layMore = 60; renderLayLines(); };
  $('#lay-s').onchange = e => { laySort = e.target.value; renderLayLines(); };
  const qi = $('#lay-q'); let t = null; qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { layQ = qi.value; layMore = 60; renderLayLines(); const n = $('#lay-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  const mb = $('#lay-more'); if (mb) mb.onclick = () => { layMore += 100; renderLayLines(); };
}
function renderBlame() {
  const box = $('#blame-box'); if (!box || !M) return;
  box.innerHTML = layHtml(M);
  box.querySelectorAll('[data-lag]').forEach(b => b.onclick = () => { layAg = b.dataset.lag; layQ = ''; layMore = 60; renderLayLines(); $('#lay-lt').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  renderLayLines();
}

function mergeDays(days) {
  const tot = emptyAgg(), A = {}, Cc = {}, H = {}, Rr = {}, worst = [], Rg = {};
  const Bn = {tot: [0, 0, 0], A: {}, Cc: {}, Rg: {}, Rr: {}, H: {}, stops: {}, ex: [], days: 0, missing: []};
  const Bl = {tot: [], A: {}, C: {}, days: 0, L: {tot: [], A: {}, C: {}, lines: {}, days: 0}, K: {tot: [], A: {}, C: {}, lines: {}, days: 0, from: '', dh: {tot: [], A: {}, C: {}}}};   // Bl.K = למה יצאו באיחור (מ-23.11.2026)   // Bl.L = האם הסדרנים מתחשבים בפקקים (מ-07.10.2026); שאר Bl (מי אשם באיחור) כבר לא מוצג (13.10)
  const addV = (grp, nm, v) => { const x = grp[nm] || (grp[nm] = []); v.forEach((n, i) => x[i] = (x[i] || 0) + n); };
  const addB = (grp, nm, v) => { const x = grp[nm] || (grp[nm] = [0, 0, 0]); v.forEach((n, i) => x[i] += n); };
  for (const d of days) {
    // לפי אזור (מ-21.09.2026): מרחב לפי המוקד הקרוב לתחנה, ומחוז
    for (const [nm, meas, c, s, district, o, sched, obs, nroutes] of d.regions || []) { const x = Rg[nm] || (Rg[nm] = Object.assign(emptyAgg(), {district, nroutes: 0})); addAgg(x, {meas, c, s}); (o || []).forEach((v, i) => x.o[i] += v); x.sched += sched || 0; x.obs += obs || 0; x.nroutes = Math.max(x.nroutes, nroutes || 0); }
    if (d.blame) {
      Bl.days += d.blame.nd || 1;
      d.blame.tot.forEach((n, i) => Bl.tot[i] = (Bl.tot[i] || 0) + n);
      for (const [nm, v] of Object.entries(d.blame.agencies || {})) addV(Bl.A, nm, v);
      for (const [nm, v] of Object.entries(d.blame.clusters || {})) addV(Bl.C, nm, v);
      const r = d.blame.lay;
      if (r) {
        Bl.L.days += r.nd || 1;
        r.tot.forEach((n, i) => Bl.L.tot[i] = (Bl.L.tot[i] || 0) + n);
        for (const [nm, v] of Object.entries(r.agencies || {})) addV(Bl.L.A, nm, v);
        for (const [nm, v] of Object.entries(r.clusters || {})) addV(Bl.L.C, nm, v);
        for (const [rid, v] of Object.entries(r.lines || {})) addV(Bl.L.lines, rid, v);
      }
      const k = d.blame.cause;
      if (k) {
        Bl.K.days += k.nd || 1;
        const f = k.from || d.d;
        if (f && (!Bl.K.from || f < Bl.K.from)) Bl.K.from = f;
        addV(Bl.K, 'tot', k.tot || []);
        for (const [nm, v] of Object.entries(k.agencies || {})) addV(Bl.K.A, nm, v);
        for (const [nm, v] of Object.entries(k.clusters || {})) addV(Bl.K.C, nm, v);
        for (const [rid, v] of Object.entries(k.lines || {})) addV(Bl.K.lines, rid, v);
        if (k.dh) {   // נסיעות מנהליות (מ-24.11.2026)
          addV(Bl.K.dh, 'tot', k.dh.tot || []);
          for (const [nm, v] of Object.entries(k.dh.agencies || {})) addV(Bl.K.dh.A, nm, v);
          for (const [nm, v] of Object.entries(k.dh.clusters || {})) addV(Bl.K.dh.C, nm, v);
        }
      }
    }
    // התקבצות (מ-21.09.2026)
    if (d.bunch) {
      Bn.days += d.bunch.nd || 1;
      d.bunch.tot.forEach((v, i) => Bn.tot[i] += v);
      for (const [nm, v] of Object.entries(d.bunch.agencies || {})) addB(Bn.A, nm, v);
      for (const [nm, v] of Object.entries(d.bunch.cities || {})) addB(Bn.Cc, nm, v);
      for (const [nm, v] of Object.entries(d.bunch.regions || {})) addB(Bn.Rg, nm, v);
      for (const [nm, v] of Object.entries(d.bunch.routes || {})) addB(Bn.Rr, nm, v);
      for (const [h, n, b] of d.bunch.hours || []) { const x = Bn.H[h] || (Bn.H[h] = [0, 0]); x[0] += n; x[1] += b; }
      for (const [rid, code, name, n, b] of d.bunch.stops || []) { const k = rid + '|' + code; const x = Bn.stops[k] || (Bn.stops[k] = {rid, code, name, n: 0, b: 0}); x.n += n; x.b += b; }
      for (const e of d.bunch.examples || []) Bn.ex.push(d.period ? e : [d.d, ...e]);
    } else if (!d.period) Bn.missing.push(d.d);
    if (d.period) Bn.missing.push(...(d.bunch_missing || []));
    addAgg(tot, d.tot);
    tot.far += d.tot.far || 0; tot.extra += d.tot.extra || 0;
    if (days.length === 1 && !d.period) tot.s = d.tot.s;
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
      addReach(x, reach, cov);
      if (d.period) d.days.forEach((dd, i) => { const v = (r[12] || [])[i]; if (v != null) x.schedByDay[dd] = v; }); else x.schedByDay[d.d] = sched;
      for (const [h, n, on] of hours) { const y = x.hours[h] || (x.hours[h] = [0, 0]); y[0] += n; y[1] += on; }
      addVehicleData(x, vt);
      if (days.length === 1 && !d.period) { x.s = s; x.ws = ws; }
    }
    for (const w of d.worst) worst.push(d.period ? w : [d.d, ...w]);
  }
  finish(tot); Object.values(A).forEach(finish); Object.values(Cc).forEach(finish); Object.values(Rr).forEach(finish); Object.values(Rg).forEach(finish);
  Bn.ex.sort((a, b) => ((a[6] - a[5]) - (a[4] - a[3])) - ((b[6] - b[5]) - (b[4] - b[3])));
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
  return {tot, A, Cc, H, Rr, K, LT, worst, Rg, Bn, Bl, days: days.flatMap(d => d.period ? d.days : [d.d])};
}

function lineLabel(rid) {
  const c = CAT[rid] || [];
  // route_long_name מסתיים בקוד כיוון+חלופה ("…-כרמיאל-10") — לא לתצוגה
  return {short: c[1] || rid, long: (c[2] || '').replace(/-\d[\d#א-ת]?$/, '').replace('<->', ' ← '), agency: c[3] || '', dir: c[4] || '', alt: c[5] || '', aid: c[7] || '', cluster: c[8] || '', ltype: c[9] || '', sub: c[10] || ''};
}
let M = null;
// קטגוריות (שלמה 17.09: "העמוד עמוס, במיוחד בטלפון"): הסיכום הגדול תמיד למעלה, ומתחתיו רק הקטגוריה שנבחרה.
// הקטעים הלא-נבחרים נשארים בדף בגובה אפס (לא display:none) כדי שהגרפים שבהם יצוירו ברוחב נכון.
// "כל כמה זמן הרכב משדר" מוסתר (שלמה 23.11.2026: "זה פשוט שקר מוחלט"): הדאטאבוס שומר תמונה אחת בדקה
// (open-bus-siri-requester — בקשה רק אחרי 60 שניות), כך שרכב שמשדר כל 15 שניות נמדד כאילו הוא משדר כל דקה.
// הקוד והנתונים (data/gps.json) נשארים — להחזיר (true) אם יהיה לנו שרת שקורא את משרד התחבורה כל 15 שניות.
const SHOW_GPS_FREQ = false;
const TABS = [['overview', 'מבט כללי'], ['early', 'יציאה מוקדמת'], ['dep', 'דוח יציאות'], ['ops', 'מפעילים ואשכולות'], ['blame', 'הסדרנים והפקקים'], ['region', 'לפי אזור'], ['city', 'לפי עיר'], ['stop', 'לפי תחנה'], ['line', 'לפי קו'], ['bunch', 'התקבצות'], ['vanish', 'איפה האוטובוס נעלם'], ['vehicle', 'חריגה מסוג הרכב'], ['worst', 'הנסיעות שאיחרו'], ['gps', SHOW_GPS_FREQ ? 'תדירות שידור GPS' : 'אמינות השידורים']];
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
    case 'early': { const oT = t.o.reduce((a, b) => a + b, 0); return oT ? pct(t.o[0], oT) + ' יצאו מוקדם' : ''; }
    case 'region': return range(Object.values(M.Rg).filter(c => c.meas >= 500).map(c => c.on));
    case 'gps': return SHOW_GPS_FREQ && GPS && GPS.v.length ? 'ממוצע ' + gpsAvg() + ' שנ׳' : '';
    case 'bunch': return M.Bn.tot[0] ? pct(M.Bn.tot[1], M.Bn.tot[0]) + ' צמודים' : '';
  }
  return '';
}
// קישורים אמיתיים (שלמה 04.11): לשוניות, קווים, מפעילים, אשכולות, ערים ומרחבים הם <a href> לכתובת
// שפותחת את אותו מסך (#יום/לשונית/line=…), כדי שאפשר לפתוח בלשונית חדשה. לחיצה רגילה — כמו קודם
function nv(e) { if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) { e.stopPropagation(); return false; } e.preventDefault(); return true; }
function tabQ(k) {
  if (k === 'line') return {ag: agency, cl: cluster, line: openLine};
  if (k === 'city') return {city: openCity};
  if (k === 'region') return {rg: openRegion};
  if (k === 'stop') return {st: stopSel};
  if (k === 'dep') return {dag: depAg, dcl: depCl, dl: depLine};
  return {};
}
// הערך מקודד פעמיים: init מפענח את כל הסולמית לפני הפיצול ב-/, ו-URLSearchParams מפענח שוב
function tabHash(k, q) {
  const qs = Object.entries(q).filter(([, v]) => v != null && v !== '').map(([a, v]) => a + '=' + encodeURIComponent(encodeURIComponent(v))).join('&');
  // התקופה בכתובת: יום (2026-11-22), או 30 / 30-wk (30 ימים, רק ימי חול)
  const head = period === 'day' ? dayD || '' : period + (dtype ? '-' + dtype : '');
  return head + (k !== 'overview' || qs ? '/' + k : '') + (qs ? '/' + qs : '');
}
function tabHref(k, q) { const h = tabHash(k, q); return esc(h ? '#' + h : location.pathname + location.search); }
function showTab(k, scroll) {
  if (!TABS.some(([x]) => x === k)) k = 'overview';
  tab = k;
  document.querySelectorAll('.tabsec').forEach(el => el.classList.toggle('off', el.dataset.tab !== k));
  document.querySelectorAll('#tabbar .tab').forEach(b => { const on = b.dataset.t === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  const h = k === 'bunch' && STOPQ ? (period === 'day' && dayD ? dayD : '') + '/' + k + `/stop=${STOPQ.stop}&tile=${STOPQ.tile}${STOPQ.h != null ? '&h=' + STOPQ.h : ''}` : tabHash(k, tabQ(k));
  history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  // שתי הלשוניות האלה טוענות קבצים לכל יום בתקופה — רק כשפותחים אותן
  if (k === 'stop') renderStop();
  if (k === 'dep') renderDep();
  if (scroll) { const bar = $('#tabbar'); if (bar) bar.scrollIntoView({behavior: 'smooth', block: 'start'}); }
}
function render() {
  renderPeriods();
  const days = windowDays();
  const app = $('#app');
  // 7/30 ימים: קובץ אחד שמחובר מראש בכל חישוב (tools/bus_periods.py) במקום 30 קבצי יום (שלמה 13.10:
  // "30 יום לוקח מעל דקה"). אם הימים בקובץ לא תואמים לחלון (קובץ ישן), נטענים קבצי הימים כרגיל.
  const want = days.map(d => d.d).join(',');
  // סוג יום: ימי חול מחוברים מראש (periods/30-wk.json); שישי ומוצ"ש הם מעט ימים — מקבצי הימים עצמם
  const pkey = period + (dtype ? '-' + dtype : '');
  if (period !== 'day' && days.length > 1 && (!dtype || dtype === 'wk') && periodCache[pkey] === undefined) {
    app.innerHTML = '<div class="msg">טוען את נתוני התקופה…</div>';
    fetch(DATA + 'periods/' + pkey + '.json?v=' + encodeURIComponent(IDX.updated || '')).then(r => r.ok ? r.json() : null)
      .then(j => { periodCache[pkey] = j; }, () => { periodCache[pkey] = null; }).then(render);
    return;
  }
  const P = period !== 'day' && periodCache[pkey] && periodCache[pkey].days.join(',') === want ? periodCache[pkey] : null;
  if (P) {
    M = mergeDays([P]);
    return renderMain(days);
  }
  const need = days.filter(d => !dayCache[d.d]);
  if (need.length) {
    app.innerHTML = `<div class="msg">טוען את נתוני הימים…${need.length > 1 ? ` <span id="dprog">0 מתוך ${need.length}</span>` : ''}</div>`;
    let done = 0;
    Promise.all(need.map(d => Promise.all([load(DATA + 'days/' + d.d + '.json'), isTodayD(d.d) ? load(DATA + 'days/' + d.d + '.cat.json').then(todayCat, () => {}) : null]).then(([j]) => { dayCache[d.d] = j; const p = $('#dprog'); if (p) p.textContent = `${++done} מתוך ${need.length}`; }))).then(render).catch(e => { app.innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; });
    return;
  }
  const loaded = days.map(d => dayCache[d.d]);
  if (!loaded.length) { app.innerHTML = '<div class="msg">אין נתונים לתקופה</div>'; return; }
  M = mergeDays(loaded);
  renderMain(days);
}
function renderMain(days) {
  const app = $('#app');
  $('#sub').textContent = `${num(DAYS.length)} ימים · מעודכן ${IDX.updated ? IDX.updated.replace('T', ' ').replace('Z', ' UTC') : ''} · המקור: שידורי המיקום של משרד התחבורה (SIRI) דרך דאטאבוס, לוח הזמנים (GTFS) ורשימת האשכולות (ClusterToLine) של משרד התחבורה`;
  const trend = DAYS.map(d => ({x: shortDate(d.d), y: partial(d) || !d.meas ? null : Math.round(100 * d.c[1] / d.meas), tip: `<b>${heDate(d.d)}</b><br>${d.meas ? pct(d.c[1], d.meas) + ' בזמן' : 'אין מדידות'}${partial(d) ? '<br>שידור חלקי' : ''}<br>${num(d.obs)} נסיעות נצפו מתוך ${num(d.sched)}`}));
  const hours = Array.from({length: 24}, (_, h) => { const v = M.H[h]; const sh = v && v[0] >= 30 ? v[1] / v[0] : null; return {x: String(h).padStart(2, '0'), y: sh == null ? null : Math.round(sh * 100), color: hourColor(sh), tip: `<b>${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59</b><br>${v && v[0] ? pct(v[1], v[0]) + ' בזמן · ' + num(v[0]) + ' הגעות' : 'אין נתונים'}`}; });
  app.innerHTML = `
    ${heroHtml(M.tot, days)}
    <div class="tabbar" id="tabbar" role="tablist">${TABS.map(([k, t]) => { const b = tabBadge(k); return `<a class="tab${tab === k ? ' on' : ''}" role="tab" aria-selected="${tab === k}" data-t="${k}" href="${tabHref(k, {})}">${t}${b ? `<small>${b}</small>` : ''}</a>`; }).join('')}</div>
    <div class="tabsec" data-tab="overview">
    <div class="panel"><div class="ptitle">התפלגות ההגעות לתחנות</div><p class="pdesc">כל הגעה של אוטובוס לתחנה נספרת פעם אחת, לפי הפער בינה לבין השעה שבלוח הזמנים: כמה הגיעו מוקדם, כמה בזמן, וכמה איחרו ובכמה.</p>${distHtml(M.tot)}</div>
    <div class="cols2">
      <div class="panel"><div class="ptitle">אחוז בזמן, יום אחרי יום</div><p class="pdesc">כמה מההגעות לתחנות היו בזמן בכל יום שנמדד. לחיצה על יום בלוח השנה למעלה פותחת אותו.</p><div class="chart" id="c-trend"></div></div>
      <div class="panel"><div class="ptitle">אחוז בזמן לפי השעה ביום</div><p class="pdesc">לפי השעה שבה האוטובוס היה אמור להגיע לתחנה. ירוק: 80% ומעלה בזמן, צהוב: 65%–80%, כתום: 50%–65%, אדום: פחות מ-50%.</p><div class="chart" id="c-hours"></div></div>
    </div>
    </div>
    <div class="tabsec" data-tab="early">
    <div class="panel"><div class="ptitle">אוטובוסים שיצאו מהמוצא לפני הזמן</div><p class="pdesc">נוסע שמגיע לתחנת המוצא בזמן שבלוח הזמנים אמור למצוא שם אוטובוס. כאן סופרים כמה נסיעות עזבו את התחנה הראשונה יותר מ-2 דקות לפני השעה שנקבעה להן. המכשיר באוטובוס מופעל כמה דקות לפני היציאה, ולכן יש דגימות מיקום של הרכב עומד ברציף, ורגע היציאה נקבע כשהרכב מתחיל לזוז לאורך המסלול (פירוט ב"איך זה נמדד").</p><div id="early-sum"></div>
      <div class="cols2"><div><div class="ptitle">יציאות מוקדמות, יום אחרי יום</div><p class="pdesc">מכל הנסיעות שנמדדה בהן היציאה מהמוצא, כמה יצאו מוקדם.</p><div class="chart" id="c-early"></div></div>
      <div><div class="ptitle">התפלגות היציאה מהמוצא</div><p class="pdesc">כל נסיעה שנמדדה בתחנת המוצא, לפי הפער בין היציאה בפועל לשעה שבלו״ז.</p><div id="early-dist"></div></div></div>
      <div class="ptitle" style="margin-top:12px">לפי מפעיל</div><div id="t-early-ag"></div>
      <div class="ptitle" style="margin-top:12px">לפי אשכול</div><div id="t-early-cl"></div>
      <div class="ptitle" style="margin-top:12px">הקווים שיוצאים מוקדם הכי הרבה</div><p class="pdesc">כיוון של קו עם 10 יציאות שנמדדו לפחות. לחיצה על מספר הקו פותחת את הפירוט שלו.</p><div id="t-early-l"></div></div>
    </div>
    <div class="tabsec" data-tab="region">
    <div class="panel"><div class="ptitle">לפי אזור גיאוגרפי</div><p class="pdesc">כל תחנה בארץ משויכת למרחב (לפי המוקד העירוני הקרוב אליה) ולמחוז. כל הגעה של אוטובוס נספרת באזור של התחנה שבה נמדדה, לא לפי "של מי הקו": קו ירושלים–באר שבע נספר בירושלים על התחנות שבירושלים, ובנגב על אלה שבנגב. כך אפשר להשוות אזורים בלי להחליט למי שייך קו בינעירוני. לחיצה על מרחב פותחת את הקווים שנמדדו בו, כולל אילו מהם חוצי-אזור.</p><div id="region-detail"></div><div id="t-region"></div></div>
    </div>
    <div class="tabsec" data-tab="bunch">
    <div class="panel"><div class="ptitle">התקבצות אוטובוסים</div><p class="pdesc">שני אוטובוסים של אותו קו שאמורים להגיע לתחנה בהפרש של כמה דקות, ומגיעים יחד. לכל תחנה ולכל קו נבדקים זוגות של נסיעות עוקבות בלוח הזמנים עם הפרש מתוכנן של עד 20 דקות: "צמודים" כשההפרש בפועל קטן משליש מהמתוכנן (או שהשני עקף את הראשון), "רווח כפול" כשההפרש בפועל לפחות כפול מהמתוכנן, כלומר הנוסע חיכה פי שניים. ההתקבצות נמדדת בכל תחנה לאורך הקו, לא רק במוצא.</p><div id="bunch-sum"></div>
      <div class="cols2"><div><div class="ptitle">התקבצות לפי השעה ביום</div><p class="pdesc">אחוז הזוגות הצמודים, לפי השעה המתוכננת של הנסיעה השנייה בזוג.</p><div class="chart" id="c-bunch"></div></div>
      <div><div class="ptitle">לפי אזור</div><div id="t-bunch-rg"></div></div></div>
      <div class="ptitle" style="margin-top:12px">לפי מפעיל</div><div id="t-bunch-ag"></div>
      <div class="ptitle" style="margin-top:12px">הקווים שמתקבצים הכי הרבה</div><p class="pdesc">כיוון של קו עם 30 זוגות לפחות. לחיצה על מספר הקו פותחת את הפירוט שלו.</p><div class="filters" id="bunch-filters"></div><div id="t-bunch-l"></div>
      <div class="ptitle" style="margin-top:12px">התחנות שבהן זה קורה הכי הרבה</div><div id="t-bunch-st"></div>
      <div class="ptitle" style="margin-top:12px">דוגמאות</div><p class="pdesc">זוגות שהגיעו הכי צמוד יחסית למתוכנן.</p><div id="t-bunch-ex"></div></div>
    </div>
    <div class="tabsec" data-tab="ops">
    <div class="panel"><div class="ptitle">לפי מפעיל</div><p class="pdesc">אותם מדדים לכל חברת אוטובוסים. לחיצה על כותרת עמודה ממיינת, לחיצה על שם המפעיל מציגה את הקווים שלו.</p><div id="t-ag"></div></div>
    </div>
    <div class="tabsec" data-tab="blame" id="blame-box"></div>
    <div class="tabsec" data-tab="vanish">
    <div class="panel" id="p-vanish"><div class="ptitle">איפה האוטובוס נעלם</div><p class="pdesc">משרד התחבורה סופר נסיעה כ"בוצעה" אם האוטובוס דיווח בתחנת המוצא. כאן עוקבים אחרי כל נסיעה תחנה אחרי תחנה: האם נראתה עד סוף המסלול, נעלמה באמצע הדרך, נראתה רק בהתחלה, או שידרה מיקום 5 דקות ומעלה בלי לזוז על המסלול. היעלמות יכולה להיות קליטה גרועה, נסיעה שקוצרה, או נסיעה שדווחה ולא נסעה. כדי להפריד בין קליטה למפעיל: תחנה שבה אוטובוסים של כמה חברות נעלמים היא בעיית קליטה, לא של החברה.</p><div id="t-vanish"></div></div>
    </div>
    <div class="tabsec" data-tab="ops">
    <div class="panel"><div class="ptitle">לפי אשכול</div><p class="pdesc">משרד התחבורה מחלק את קווי האוטובוס לאשכולות (למשל "חשמונאים", "הגליל", "שרון"), וכל אשכול יוצא למכרז ומופעל על ידי חברה אחת. כאן אותם מדדים לכל אשכול, ולמעלה לפי סוג הקו: עירוני, אזורי או בינעירוני. לחיצה על שם האשכול מציגה את הקווים שלו.</p><div id="lt-sum"></div><div id="t-cl"></div></div>
    </div>
    <div class="tabsec" data-tab="city">
    <div class="panel"><div class="ptitle">לפי עיר</div><p class="pdesc">כל ההגעות לתחנות שבתחומי העיר, מכל הקווים שעוברים בה, וגם כמה מהנסיעות של הקווים האלה לא נצפו בכלל (אי ביצוע משוער). לחיצה על שם העיר פותחת פירוט: אילו קווים עוברים בה, איזה מפעילים, כמה נסיעות לא בוצעו, ואיך כל קו מדייק בתוך העיר.</p><div class="filters" id="cfilters"></div><div id="city-detail"></div><div id="t-city"></div></div>
    </div>
    <div class="tabsec" data-tab="stop"><div class="panel" id="stop-box"></div></div>
    <div class="tabsec" data-tab="dep"><div class="panel dep" id="dep-box"></div></div>
    <div class="tabsec" data-tab="line">
    <div class="panel"><div class="ptitle">לפי קו</div><p class="pdesc">כל כיוון של כל קו בנפרד. אפשר לבחור מפעיל או אשכול, לדרג ("הכי לא מדייקים") או לחפש מספר קו. לחיצה על מספר הקו פותחת פירוט: באיזה קטע לאורך הקו נצבר האיחור.</p>
      <div class="filters" id="lfilters"></div>
      <div id="line-detail"></div><div id="t-lines"></div></div>
    </div>
    <div class="tabsec" data-tab="vehicle">
    <div class="panel"><div class="ptitle">סוג הרכב מול מה שנקבע לקו</div><p class="pdesc">לכל קו משרד התחבורה קובע גודל רכב: מיניבוס, מידיבוס, אוטובוס או אוטובוס מפרקי. כאן משווים אותו לרכב שהגיע בפועל בכל נסיעה, לפי מספר הרכב בשידור ומאגר ציי הרכב של המשרד. "רכב קטן יותר" הוא למשל מיניבוס בקו שנקבע לו אוטובוס.</p><div id="vt-sum"></div><div class="filters" id="vt-filters"></div><div id="t-vt"></div></div>
    </div>
    <div class="tabsec" data-tab="gps">
    <div class="panel" id="gq"></div>
    ${SHOW_GPS_FREQ ? `<div class="panel"><div class="ptitle">תדירות שידור מיקום (GPS)</div><p class="pdesc">כל כמה זמן כל אוטובוס משדר את המיקום שלו, בממוצע. מחושב מזמן הדיווח (RecordedAtTime) שבשידורי SIRI: המרווח בין שני דיווחים עוקבים של אותו רכב באותה נסיעה. דיווח שחוזר על עצמו נספר פעם אחת, ופער של יותר מ-10 דקות (רכב מחוץ לשירות או בלי קליטה) לא נספר. שימו לב: השידורים נאספים פעם בדקה, ולכן רכב שמשדר כל 20 או 30 שניות ייראה כאן כ"כל 60 שניות" — המדד תופס בעיקר רכבים שמשדרים לאט מזה או מדלגים על דקות. "מרווחים חסרים": אחוז המרווחים של 90 שניות ומעלה.</p><div id="gps-sum"></div>
      <div class="ptitle" style="margin-top:12px">לפי מפעיל</div><div id="t-gps-ag"></div>
      <div class="ptitle" style="margin-top:12px">לפי רכב</div><p class="pdesc">חיפוש לפי מספר רכב (לוחית רישוי) או שם מפעיל, או לחיצה על מפעיל בטבלה שלמעלה. ברירת המחדל: הרכבים שמשדרים הכי לאט.</p><div class="filters"><span id="gps-agf"></span><input id="gps-q" type="search" placeholder="מספר רכב או מפעיל" value="${esc(gq)}" style="min-width:200px"></div><div id="t-gps-v"></div></div>` : ''}
    </div>
    <div class="tabsec" data-tab="worst">
    <div class="panel"><div class="ptitle">הנסיעות שאיחרו הכי הרבה</div><p class="pdesc">נסיעות בודדות שבאחת התחנות איחרו 20 דקות ומעלה, מהגרועה ביותר. לחיצה על נסיעה מציגה אותה תחנה אחרי תחנה: מתוכנן, בפועל והפער.</p><ul class="worst" id="worst"></ul></div>
    </div>`;
  $('#tabbar').onclick = e => { const b = e.target.closest('.tab'); if (b && nv(e)) showTab(b.dataset.t); };
  showTab(tab);
  lineChart($('#c-trend'), trend, {color: C.line, min: 0, max: 100, unit: '%'});
  barChart($('#c-hours'), hours, {color: C.line, max: 100, unit: '%'});
  renderAgencies(); renderClusters(); renderCities(); renderFilters(); renderLines(); renderWorst(); renderVehicles(); renderVanish();
  renderEarly(); renderRegions(); renderBunch(); renderGps(); renderBlame();
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
  box.innerHTML = `<div class="tblbox"><table id="tvl"><thead><tr>${th('קו', 'short', sortVL)}${th('מסלול', 'long', sortVL)}${th('מפעיל', 'agency', sortVL)}${th('נסיעות ששודרו', 'rT', sortVL)}${th('עד איפה נראו', 'gone', sortVL)}${th('עד הסוף', 'rend', sortVL)}${th('באמצע הדרך', 'rpart', sortVL)}${th('רק בהתחלה', 'rstart', sortVL)}${th('לא זזו', 'rstatic', sortVL)}${th('לא שידרו בכלל', 'miss', sortVL)}${th('קליטה בדרך', 'cov', sortVL)}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.short)}</a></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td>${num(r.rT)} <small style="color:var(--dim)">מתוך ${num(r.sched)}</small></td><td style="min-width:120px">${reachBar(r.s)}</td><td>${Math.round(r.rend * 100)}%</td><td class="${r.rpart >= 0.2 ? 'd4' : r.rpart >= 0.1 ? 'd3' : ''}">${Math.round(r.rpart * 100)}%</td><td class="${r.rstart >= 0.05 ? 'd4' : ''}">${Math.round(r.rstart * 100)}%</td><td class="${r.rstatic >= 0.1 ? 'd4' : r.rstatic >= 0.05 ? 'd3' : ''}">${Math.round(r.rstatic * 100)}%</td><td class="${missCls(r.miss)}">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${r.cov == null ? '—' : Math.round(r.cov * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-vl">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים עם ${MIN_RIDES} נסיעות ששודרו לפחות (כיוון וחלופה נספרים בנפרד)</div>`;
  $('#tvl thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortVL = {k, dir: sortVL.k === k ? -sortVL.dir : (['short', 'long', 'agency'].includes(k) ? 1 : -1)}; renderVanishLines(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; showTab('line'); renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  const mb = $('#more-vl'); if (mb) mb.onclick = () => { showAllVL = true; renderVanishLines(); };
}
function renderVanish() {
  const box = $('#t-vanish'); if (!box) return;
  const t = M.tot, T = reachT(t);
  if (!T) { box.innerHTML = `<div class="empty">הנתון הזה מחושב מהריצה של 17.09.2026 ואילך. ${M.days.length === 1 ? 'ליום הזה' : 'לתקופה הזו'} אין אותו עדיין.</div>`; return; }
  const unseen = Math.max(0, t.sched - T);
  const rows = Object.entries(M.A).map(([nm, s]) => { const rT = reachT(s); return {nm, sched: s.sched, rT, rend: rT ? s.reach[0] / rT : null, rpart: rT ? s.reach[1] / rT : null, rstart: rT ? s.reach[2] / rT : null, rstatic: rT ? s.reach[3] / rT : null, gone: rT ? 1 - s.reach[0] / rT : null, miss: s.sched ? Math.max(0, s.sched - rT) / s.sched : null, cov: s.cov[0] ? s.cov[1] / s.cov[0] : null, s}; }).filter(r => r.rT >= 20);
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
    <div class="tblbox"><table id="tv"><thead><tr>${th('מפעיל', 'nm', sortV)}${th('נסיעות ששודרו', 'rT', sortV)}${th('עד איפה נראו', 'gone', sortV)}${th('עד הסוף', 'rend', sortV)}${th('באמצע הדרך', 'rpart', sortV)}${th('רק בהתחלה', 'rstart', sortV)}${th('לא זזו', 'rstatic', sortV)}${th('לא שידרו בכלל', 'miss', sortV)}${th('קליטה בדרך', 'cov', sortV)}</tr></thead><tbody>` +
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
    rows.map(r => `<tr><td class="nm"><a class="linebtn" data-cl="${esc(r.nm)}" href="${tabHref('line', {cl: r.nm})}" title="הקווים של האשכול">${esc(r.nm)}</a>${r.subs ? `<br><small style="color:var(--dim);font-weight:400">${esc(r.subs)}</small>` : ''}</td><td style="font-size:12px">${esc(r.ag)}</td><td>${num(r.n)}</td><td>${num(r.sched)}</td><td>${num(r.obs)} <small style="color:var(--dim)">(${pct(r.obs, r.sched)})</small></td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.oon == null ? '—' : Math.round(r.oon * 100) + '%'}</td><td>${r.oearly == null ? '—' : Math.round(r.oearly * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>' +
    `<div class="mut" style="margin-top:6px">${num(rows.length)} אשכולות · האשכול של כל קו לפי רשימת ClusterToLine של משרד התחבורה · מתחת לשם האשכול: תת-האזורים שלו, כשיש</div>`;
  $('#tk thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortK = {k, dir: sortK.k === k ? -sortK.dir : (['nm', 'ag'].includes(k) ? 1 : -1)}; renderClusters(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; cluster = b.dataset.cl; agency = ''; rank = rank || 'worst'; showAllL = false; renderFilters(); renderLines(); renderWorst(); showTab('line'); $('#lfilters').scrollIntoView({behavior: 'smooth', block: 'start'}); });
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
    rows.map(r => `<tr><td class="nm"><a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.short)}</a></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td>${esc(vname(r.plan))}</td><td><b>${esc(vname(r.act))}</b></td><td>${num(r.n)}</td><td class="${r.small > .5 ? 'd4' : r.small > .2 ? 'd3' : ''}">${Math.round(r.small * 100)}%</td><td>${Math.round(r.large * 100)}%</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-v">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים${vAgency ? ' של ' + esc(vAgency) : ''} · רק קווים עם 5 נסיעות לפחות שבהן הרכב מזוהה · רכבי קבלן ורכבים שאינם במאגר המשרד לא נספרים</div>` :
    '<div class="empty">אין קווים כאלה</div>';
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  const mb = $('#more-v'); if (mb) mb.onclick = () => { vAll = true; renderVehicles(); };
}
function renderAgencies() {
  const anyReach = reachT(M.tot) > 0;
  const rows = Object.entries(M.A).map(([nm, s]) => { const oT = s.o.reduce((x, y) => x + y, 0), rT = reachT(s); return {nm, sched: s.sched, obs: s.obs, meas: s.meas, on: s.on, oon: oT ? s.o[1] / oT : null, oearly: oT ? s.o[0] / oT : null, avg: s.avg, b4: s.meas ? s.c[4] / s.meas : null, rend: rT ? s.reach[0] / rT : null, rstart: rT ? (s.reach[2] + s.reach[3]) / rT : null, rT}; });
  sortRows(rows, sortA);
  $('#t-ag').innerHTML = `<div class="tblbox"><table id="ta"><thead><tr>${th('מפעיל', 'nm', sortA)}${th('נסיעות בלו״ז', 'sched', sortA)}${th('נצפו', 'obs', sortA)}${th('הגעות נמדדו', 'meas', sortA)}${th('בזמן בתחנות', 'on', sortA)}${th('יציאה בזמן מהמוצא', 'oon', sortA)}${th('יצאו מוקדם', 'oearly', sortA)}${th('איחור ממוצע', 'avg', sortA)}${th('מעל 20 דק׳', 'b4', sortA)}${anyReach ? th('נראו עד הסוף', 'rend', sortA) + th('רק בהתחלה', 'rstart', sortA) : ''}</tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm"><a class="linebtn" data-ag="${esc(r.nm)}" href="${tabHref('line', {ag: r.nm, cl: cluster})}" title="סינון הקווים למפעיל הזה">${esc(r.nm)}</a></td><td>${num(r.sched)}</td><td>${num(r.obs)} <small style="color:var(--dim)">(${pct(r.obs, r.sched)})</small></td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.oon == null ? '—' : Math.round(r.oon * 100) + '%'}</td><td>${r.oearly == null ? '—' : Math.round(r.oearly * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td>${anyReach ? `<td>${r.rend == null ? '—' : Math.round(r.rend * 100) + '%'}</td><td class="${r.rstart == null ? '' : r.rstart >= 0.1 ? 'd4' : r.rstart >= 0.05 ? 'd3' : ''}" title="${r.rT ? num(r.rT) + ' נסיעות ששודרו' : ''}">${r.rstart == null ? '—' : Math.round(r.rstart * 100) + '%'}</td>` : ''}</tr>`).join('') + '</tbody></table></div>' +
    (anyReach ? '<p class="pdesc">"נראו עד הסוף": נסיעות ששודרו ונמדדו עד שתי התחנות האחרונות של המסלול. "רק בהתחלה": נסיעות ששודרו אבל נמדדו רק בשלוש התחנות הראשונות, או שודרו 5 דקות ומעלה בלי להתקדם על המסלול. משרד התחבורה בודק ביצוע נסיעה בתחנת המוצא בלבד; כאן בכל תחנה. הפירוט למטה, ב"איפה האוטובוס נעלם".</p>' : '');
  $('#ta thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortA = {k, dir: sortA.k === k ? -sortA.dir : (k === 'nm' ? 1 : -1)}; renderAgencies(); };
  $('#t-ag').querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; agency = b.dataset.ag; rank = rank || 'worst'; showAllL = false; renderFilters(); renderLines(); renderWorst(); showTab('line'); $('#lfilters').scrollIntoView({behavior: 'smooth', block: 'start'}); });
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
    rows.map(r => `<tr class="${r.nm === openCity ? 'on' : ''}"><td class="nm"><a class="linebtn" data-city="${esc(r.nm)}" href="${tabHref('city', {city: r.nm})}" title="הקווים שעוברים בעיר">${esc(r.nm)}</a></td><td>${num(r.sched)}</td><td class="${missCls(r.miss)}" title="נסיעות בלו״ז של הקווים שעוברים בעיר שלא שידרו מיקום בכלל — לא בוצעו, או בוצעו בלי שידור">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.early == null ? '—' : Math.round(r.early * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-c">הצגת כל ${num(total)} הערים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} ערים ויישובים עם 50 הגעות לפחות · העיר של כל תחנה לפי קובץ התחנות של משרד התחבורה · "נסיעות בלו״ז" ו"לא נצפו": כל הנסיעות של הקווים שעוברים בעיר, לאורך כל המסלול</div>`;
  $('#tc thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortC = {k, dir: sortC.k === k ? -sortC.dir : (k === 'nm' ? 1 : -1)}; renderCities(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openCity = b.dataset.city; cAgency = ''; showAllCL = false; renderCityDetail(); renderCities(); $('#city-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
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
    rows.map(r => `<tr><td class="nm"><a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.short)}</a></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td style="font-size:12px">${esc(r.cluster)}</td><td>${num(r.sched)}</td><td class="${missCls(r.miss)}" title="${num(r.sched - r.obs)} מתוך ${num(r.sched)} נסיעות לא שידרו מיקום בכלל">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${num(r.n)}</td><td>${onCell(r.on)}</td><td class="${dcls(r.avg)}">${delayTxt(r.avg)} דק׳</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-cl">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים ב${esc(openCity)}${cAgency ? ' של ' + esc(cAgency) : ''} (כיוון וחלופה נספרים בנפרד)${cRank === 'miss' ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות בלו״ז` : cRank !== 'meas' ? ` · בדירוג רק קווים עם לפחות ${MIN_CITY} הגעות שנמדדו בעיר` : ''} · "נסיעות בלו״ז" ו"לא נצפו" — של כל המסלול, לא רק הקטע שבעיר</div>`;
  $('#tcl thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortCL = {k, dir: sortCL.k === k ? -sortCL.dir : (['short', 'long', 'agency', 'cluster'].includes(k) ? 1 : -1)}; renderCityLines(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
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
    rows.map(r => `<tr><td class="nm"><a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.short)}</a></td><td style="font-size:12px;color:var(--mut)">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td style="font-size:12px;color:var(--mut)">${esc(r.cluster)}</td><td>${num(r.sched)}</td><td>${num(r.obs)}</td><td class="${missCls(r.miss)}" title="${r.sched > 0 ? num(Math.max(0, r.sched - r.obs)) + ' מתוך ' + num(r.sched) + ' נסיעות מתוכננות לא נצפו' : 'אין נסיעות מתוכננות לחישוב'}">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.oearly == null ? '—' : Math.round(r.oearly * 100) + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td>${reachT(M.tot) ? `<td>${r.rend == null ? '—' : Math.round(r.rend * 100) + '%'}</td><td class="${r.rstart == null ? '' : r.rstart >= 0.1 ? 'd4' : r.rstart >= 0.05 ? 'd3' : ''}">${r.rstart == null ? '—' : Math.round(r.rstart * 100) + '%'}</td>` : ''}</tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-l">הצגת כל ${num(total)} הקווים</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} מסלולים${agency ? ' של ' + esc(agency) : ''}${cluster ? ' באשכול ' + esc(cluster) : ''} (כיוון וחלופה נספרים בנפרד)${rank === 'miss' ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות בלו״ז` : rank === 'vanish' ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות ששודרו` : rank ? ` · בדירוג רק קווים עם לפחות ${MIN_RIDES} נסיעות שנצפו` : ''}</div><p class="pdesc">״לא נצפו״: נסיעות מתוכננות שלא זוהו בנתונים. ייתכן שלא בוצעו או שבוצעו ללא שידור שנקלט. האחוז מחושב מתוך הנסיעות המתוכננות.${reachT(M.tot) ? ' "עד הסוף" ו"רק בהתחלה": עד איפה לאורך המסלול נראה האוטובוס, מתוך הנסיעות ששודרו (הסבר בפירוט "איפה האוטובוס נעלם").' : ''}</p>`;
  $('#tlines thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortL = {k, dir: sortL.k === k ? -sortL.dir : (['short', 'long', 'agency', 'cluster'].includes(k) ? 1 : -1)}; renderLines(); };
  $('#t-lines').querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
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
<p>משרד התחבורה משדר כל דקה איפה נמצא כל אוטובוס בארץ ומה התחנה הבאה שלו. דאטאבוס (הסדנא לידע ציבורי) שומרים את השידורים, ואנחנו משווים כל נסיעה ללוח הזמנים של אותו יום: מתי האוטובוס היה אמור להגיע לכל תחנה, ומתי הגיע.</p>
<ul>
<li><b>הגעה לתחנה:</b> כשהמרחק לתחנה מגיע לאפס או כשהתחנה הבאה מתחלפת. הדיוק כחצי דקה.</li>
<li><b>יציאה מהמוצא:</b> הרגע שהאוטובוס מתחיל לזוז אחרי שעמד ברציף.</li>
<li><b>בזמן:</b> עד 5 דקות איחור. <b>מוקדם:</b> יותר מ-2 דקות לפני הלו״ז. כל הגעה לתחנה נספרת בנפרד.</li>
<li><b>לא נצפו:</b> נסיעות בלו״ז בלי שום שידור. אי אפשר לדעת אם לא יצאו או יצאו בלי שידור, ולכן הן מוצגות בנפרד מהדיוק.</li>
<li><b>עד איפה נראה:</b> התחנה האחרונה שבה נמדדה הנסיעה. "קליטה בדרך": כמה מהתחנות שבאמצע נמדדו.</li>
<li><b>עיר, אזור ואשכול:</b> כל הגעה נספרת בעיר ובאזור של התחנה. קו שעובר בכמה ערים נמדד בכל עיר בנפרד. האשכול לפי רשימת משרד התחבורה.</li>
<li><b>התקבצות:</b> שני אוטובוסים עוקבים של אותו קו שהגיעו צמודים (פחות מ-30% מהמרווח המתוכנן) או ברווח כפול. נבדק רק בקווים שיוצאים לפחות כל 20 דקות.</li>
<li><b>לא נספרים:</b> תקלות שידור, נסיעה רחוקה מאוד מהלו״ז שלה, וימים שבהם נצפו פחות מ-30% מהנסיעות.</li>
</ul>`;

// ---------------------------------------------------------------- יציאה מוקדמת (קול קורא דאטאבוס 21.09)
function earlyRow(nm, o, extra) {
  const T = o.reduce((a, b) => a + b, 0);
  return {nm, n: T, early: T ? o[0] / T : null, on: T ? o[1] / T : null, late: T ? (o[2] + o[3] + o[4]) / T : null, ...extra};
}
const ECAT = ['יצאו מוקדם (יותר מ-2 דק׳ לפני)', 'בזמן (עד 5 דק׳ אחרי)', 'איחור 5–10 דק׳', 'איחור 10–20 דק׳', 'איחור מעל 20 דק׳'];
const eCell = v => v == null ? '—' : `<span class="${v >= .1 ? 'd4' : v >= .05 ? 'd3' : v >= .02 ? 'd2' : ''}">${Math.round(v * 1000) / 10}%</span>`;
function earlyTable(rows, label, btn) {
  if (!rows.length) return '<div class="empty">אין נתונים</div>';
  return `<div class="tblbox"><table><thead><tr><th>${label}</th><th>יציאות שנמדדו</th><th>יצאו מוקדם</th><th>בזמן</th><th>באיחור</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm">${btn ? btn(r) : esc(r.nm)}</td><td>${num(r.n)}</td><td>${eCell(r.early)}</td><td>${onCell(r.on)}</td><td>${r.late == null ? '—' : Math.round(r.late * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>';
}
function renderEarly() {
  const box = $('#early-sum'); if (!box) return;
  const t = M.tot, oT = t.o.reduce((a, b) => a + b, 0);
  if (!oT) { box.innerHTML = '<div class="empty">אין מדידות בתחנת המוצא</div>'; return; }
  box.innerHTML = `<div class="rstats"><div><b>${pct(t.o[0], oT)}</b><span>יצאו מוקדם</span><small>${num(t.o[0])} מתוך ${num(oT)} נסיעות שנמדדה בהן היציאה מהמוצא עזבו יותר מ-2 דקות לפני השעה שבלו״ז.</small></div>
    <div><b>${pct(t.o[1], oT)}</b><span>יצאו בזמן</span><small>עד 5 דקות אחרי השעה שבלו״ז.</small></div>
    <div><b>${pct(t.o[2] + t.o[3] + t.o[4], oT)}</b><span>יצאו באיחור</span><small>${pct(t.o[4], oT)} מהנסיעות יצאו מהמוצא באיחור של יותר מ-20 דקות.</small></div>
    <div><b>${pct(oT, t.obs)}</b><span>מהנסיעות שנצפו נמדדה יציאתן</span><small>בשאר הנסיעות השידור התחיל כשהרכב כבר היה בדרך, או שהעמידה במוצא לא זוהתה בוודאות.</small></div></div>`;
  const trend = DAYS.map(d => { const T = (d.o || []).reduce((a, b) => a + b, 0); return {x: shortDate(d.d), y: partial(d) || !T ? null : Math.round(1000 * d.o[0] / T) / 10, tip: `<b>${heDate(d.d)}</b><br>${T ? pct(d.o[0], T) + ' יצאו מוקדם · ' + num(d.o[0]) + ' מתוך ' + num(T) : 'אין מדידות'}${partial(d) ? '<br>שידור חלקי' : ''}`}; });
  lineChart($('#c-early'), trend, {color: C.early, min: 0, unit: '%'});
  $('#early-dist').innerHTML = `<div class="dist">${t.o.map((v, i) => v ? `<i class="s${i}" style="flex:${v}" title="${ECAT[i]}: ${num(v)}"></i>` : '').join('')}</div>
    <div class="legend">${t.o.map((v, i) => `<span><i style="background:${BCOL[i]}"></i>${ECAT[i]} · ${pct(v, oT)} (${num(v)})</span>`).join('')}</div>`;
  const ag = Object.entries(M.A).map(([nm, s]) => earlyRow(nm, s.o)).filter(r => r.n >= 20).sort((a, b) => b.early - a.early);
  $('#t-early-ag').innerHTML = earlyTable(ag, 'מפעיל');
  const cl = Object.entries(M.K).map(([nm, s]) => earlyRow(nm, s.o, {ag: Object.entries(s.ags).sort((a, b) => b[1] - a[1]).slice(0, 2).map(a => a[0]).join(', ')})).filter(r => r.n >= 20).sort((a, b) => b.early - a.early);
  $('#t-early-cl').innerHTML = earlyTable(cl, 'אשכול', r => `${esc(r.nm)}<br><small style="color:var(--dim);font-weight:400">${esc(r.ag)}</small>`);
  const ln = Object.values(M.Rr).map(s => { const l = lineLabel(s.rid); return earlyRow(l.short, s.o, {rid: s.rid, long: l.long, agency: l.agency}); }).filter(r => r.n >= MIN_RIDES && r.early > 0).sort((a, b) => b.early - a.early || b.n - a.n).slice(0, 40);
  $('#t-early-l').innerHTML = earlyTable(ln, 'קו', r => `<a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.nm)}</a> <small style="color:var(--mut);font-weight:400">${esc(r.long)} · ${esc(r.agency)}</small>`);
  $('#t-early-l').querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; showTab('line'); renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
}

// ---------------------------------------------------------------- לפי אזור (קול קורא דאטאבוס 21.09)
let openRegion = null, regionCache = {}, sortRg = {k: 'meas', dir: -1};
function loadRegions(days) {
  return Promise.all(days.filter(d => !regionCache[d]).map(d => load(DATA + 'days/' + d + '.regions.json').then(j => { regionCache[d] = j; }).catch(() => { regionCache[d] = {}; })));
}
function renderRegions() {
  const box = $('#t-region'); if (!box) return;
  const hubs = Object.entries(M.Rg);
  if (!hubs.length) { box.innerHTML = '<div class="empty">אין נתוני אזור לימים שנבחרו (החישוב לפי אזור קיים מ-21.09.2026; ימים קודמים מתמלאים בהדרגה).</div>'; return; }
  const D = {};
  for (const [nm, s] of hubs) { const d = D[s.district] || (D[s.district] = Object.assign(emptyAgg(), {hubs: []})); addAgg(d, s); d.sched += s.sched; d.obs += s.obs; s.o.forEach((v, i) => d.o[i] += v); d.hubs.push([nm, s]); }
  Object.values(D).forEach(finish);
  const row = (nm, s, isHub) => { const oT = s.o.reduce((a, b) => a + b, 0), b = M.Bn.Rg[nm]; return {nm, isHub, sched: s.sched, miss: s.sched ? Math.max(0, 1 - s.obs / s.sched) : null, meas: s.meas, on: s.on, early: s.meas ? s.c[0] / s.meas : null, avg: s.avg, b4: s.meas ? s.c[4] / s.meas : null, oearly: oT ? s.o[0] / oT : null, bunch: b && b[0] >= 20 ? b[1] / b[0] : null, nroutes: s.nroutes}; };
  const dist = Object.entries(D).map(([nm, d]) => ({d: row(nm, d, false), hubs: sortRows(d.hubs.map(([h, s]) => row(h, s, true)), sortRg)}));
  sortRows(dist.map(x => x.d), sortRg);
  const order = new Map(dist.map(x => x.d).map((r, i) => [r.nm, i]));
  dist.sort((a, b) => order.get(a.d.nm) - order.get(b.d.nm));
  const cell = r => `<td>${num(r.sched)}</td><td class="${missCls(r.miss)}">${r.miss == null ? '—' : Math.round(r.miss * 100) + '%'}</td><td>${num(r.meas)}</td><td>${onCell(r.on)}</td><td>${r.oearly == null ? '—' : Math.round(r.oearly * 1000) / 10 + '%'}</td><td class="${dcls(r.avg)}">${r.avg == null ? '—' : fmt1(r.avg) + ' דק׳'}</td><td>${r.b4 == null ? '—' : Math.round(r.b4 * 100) + '%'}</td><td>${r.bunch == null ? '—' : Math.round(r.bunch * 100) + '%'}</td>`;
  box.innerHTML = `<div class="tblbox"><table id="trg"><thead><tr>${th('מחוז / מרחב', 'nm', sortRg)}${th('נסיעות בלו״ז', 'sched', sortRg)}${th('לא נצפו', 'miss', sortRg)}${th('הגעות נמדדו', 'meas', sortRg)}${th('בזמן', 'on', sortRg)}${th('יצאו מוקדם', 'oearly', sortRg)}${th('איחור ממוצע', 'avg', sortRg)}${th('מעל 20 דק׳', 'b4', sortRg)}${th('התקבצות', 'bunch', sortRg)}</tr></thead><tbody>` +
    dist.map(x => `<tr style="font-weight:700;background:var(--panel2,transparent)"><td class="nm">${esc(x.d.nm)}</td>${cell(x.d)}</tr>` + x.hubs.map(r => `<tr class="${r.nm === openRegion ? 'on' : ''}"><td class="nm" style="padding-right:22px"><a class="linebtn" data-rg="${esc(r.nm)}" href="${tabHref('region', {rg: r.nm})}" title="הקווים שנמדדו במרחב">${esc(r.nm)}</a> <small style="color:var(--dim)">${num(r.nroutes)} מסלולים</small></td>${cell(r)}</tr>`).join('')).join('') + '</tbody></table></div>' +
    `<div class="mut" style="margin-top:6px">שורה מודגשת: המחוז, ומתחתיה המרחבים שבו. כל הגעה נספרת באזור של התחנה שבה נמדדה. "יצאו מוקדם": מהנסיעות שמוצאן באזור. "התקבצות": אחוז הזוגות הצמודים בתחנות שבאזור (כשיש).</div>`;
  $('#trg thead').onclick = e => { const k = e.target.closest('th') && e.target.closest('th').dataset.k; if (!k) return; sortRg = {k, dir: sortRg.k === k ? -sortRg.dir : (k === 'nm' ? 1 : -1)}; renderRegions(); };
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openRegion = b.dataset.rg; renderRegionDetail(); renderRegions(); $('#region-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  renderRegionDetail();
}
function renderRegionDetail() {
  const box = $('#region-detail'); if (!box) return;
  if (!openRegion || !M.Rg[openRegion]) { box.innerHTML = ''; return; }
  const days = M.days;
  box.innerHTML = '<div class="empty">טוען…</div>';
  const want = openRegion;
  loadRegions(days).then(() => {
    if (openRegion !== want) return;
    const acc = {}, all = {};   // acc: הקווים במרחב הזה · all: לכל קו, ההגעות בכל המרחבים (לזיהוי חוצי-אזור)
    for (const d of days) for (const [rg, rows] of Object.entries(regionCache[d] || {})) for (const [rid, n, on, sum] of rows) {
      all[rid] = (all[rid] || 0) + n;
      if (rg === openRegion) { const x = acc[rid] || (acc[rid] = {rid, n: 0, on: 0, sum: 0}); x.n += n; x.on += on; x.sum += sum; }
    }
    const rows = Object.values(acc).filter(x => x.n >= MIN_CITY).map(x => { const l = lineLabel(x.rid), rr = M.Rr[x.rid]; return {rid: x.rid, short: l.short, long: l.long, agency: l.agency, cluster: l.cluster, n: x.n, on: x.on / x.n, avg: x.sum / x.n / 10, share: all[x.rid] ? x.n / all[x.rid] : 1, sched: rr ? rr.sched : 0, obs: rr ? rr.obs : 0}; }).sort((a, b) => b.n - a.n);
    const cross = rows.filter(r => r.share < .8);
    const s = M.Rg[openRegion];
    box.innerHTML = `<div class="lhead"><span class="badge">${esc(openRegion)}</span><span class="ldest">מחוז ${esc(s.district)} · ${num(s.meas)} הגעות · ${num(rows.length)} מסלולים עם ${MIN_CITY} הגעות לפחות · ${num(cross.length)} מהם חוצי-אזור</span><button class="closebtn" id="close-rg">✕ סגירה</button></div>
      <p class="pdesc">"חלק במרחב": איזה חלק מכל ההגעות של הקו (בכל הארץ) נמדד במרחב הזה. קו עם פחות מ-80% הוא חוצה אזורים, כמו ירושלים–באר שבע: הוא נספר כאן רק על התחנות שבמרחב, ובמרחב השני על התחנות שבו. אפשר להשוות אזורים גם בלי הקווים האלה: המדדים שלהם מסומנים בצבע.</p>
      <div class="tblbox"><table><thead><tr><th>קו</th><th>מסלול</th><th>מפעיל</th><th>אשכול</th><th>הגעות במרחב</th><th>חלק במרחב</th><th>בזמן</th><th>איחור ממוצע</th><th>נסיעות בלו״ז</th><th>לא נצפו</th></tr></thead><tbody>` +
      rows.slice(0, 80).map(r => `<tr${r.share < .8 ? ' style="color:var(--mut)"' : ''}><td class="nm"><a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.short)}</a></td><td style="font-size:12px">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td style="font-size:12px">${esc(r.cluster)}</td><td>${num(r.n)}</td><td>${Math.round(r.share * 100)}%${r.share < .8 ? ' <small>חוצה אזורים</small>' : ''}</td><td>${onCell(r.on)}</td><td class="${dcls(r.avg)}">${delayTxt(r.avg)} דק׳</td><td>${num(r.sched)}</td><td>${r.sched ? Math.round(100 * Math.max(0, 1 - r.obs / r.sched)) + '%' : '—'}</td></tr>`).join('') + '</tbody></table></div>' + (rows.length > 80 ? `<div class="mut">מוצגים 80 מתוך ${num(rows.length)}</div>` : '');
    $('#close-rg').onclick = () => { openRegion = null; renderRegionDetail(); renderRegions(); };
    box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; showTab('line'); renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  });
}

// ---------------------------------------------------------------- התקבצות (קול קורא דאטאבוס 21.09)
let bq = '', bAgency = '';
const bCell = v => v == null ? '—' : `<span class="${v >= .2 ? 'd4' : v >= .1 ? 'd3' : v >= .05 ? 'd2' : ''}">${Math.round(v * 100)}%</span>`;
function bunchTable(rows, label, btn) {
  if (!rows.length) return '<div class="empty">אין נתונים</div>';
  return `<div class="tblbox"><table><thead><tr><th>${label}</th><th>זוגות שנבדקו</th><th>צמודים</th><th>רווח כפול</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm">${btn ? btn(r) : esc(r.nm)}</td><td>${num(r.n)}</td><td>${bCell(r.b)}</td><td>${r.g == null ? '—' : Math.round(r.g * 100) + '%'}</td></tr>`).join('') + '</tbody></table></div>';
}
const bRow = (nm, v, extra) => ({nm, n: v[0], b: v[0] ? v[1] / v[0] : null, g: v[0] ? v[2] / v[0] : null, ...extra});
/* כרטיס התחנה (שלמה 30.10): נפתח מ"איפה האוטובוס נתקע" עם התחנה והשעה שנבחרו במפה —
   #<יום>/bunch/stop=<מק"ט>&tile=<אריח>&h=<שעה>. מה הבעיה במשפט, לפי שעה, הקווים, וכל הזוגות הצמודים.
   הסיכום: ../bus-speed/data/b/<אריח>.json (כל ימי החול האחרונים). הזוגות: ענף bunch-pairs (tools/bus_speed.py). */
let STOPQ = null, SC = null, scLine = '', scHour = '', scLim = 60;
const PAIRS_BASE = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan/bunch-pairs/';
async function loadStopCard() {
  if (!STOPQ || (SC && SC.key === STOPQ.stop)) return;
  SC = {key: STOPQ.stop, b: null, p: null};
  const [b, p] = await Promise.all([
    fetch(`../bus-speed/data/b/${STOPQ.tile}.json`, {cache: 'no-cache'}).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(PAIRS_BASE + STOPQ.tile + '.json').then(r => r.ok ? r.json() : null).catch(() => null)]);
  SC.b = (b || []).find(x => String(x[2]) === String(STOPQ.stop)) || false;
  SC.p = p;
  if (STOPQ.h != null) scHour = String(STOPQ.h);
  renderStopCard();
}
function renderStopCard() {
  let box = $('#bunch-stop');
  if (!STOPQ) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'bunch-stop'; box.className = 'panel'; box.style.outline = '2px solid ' + C.line; $('.tabsec[data-tab="bunch"]').prepend(box); }
  if (!SC || SC.key !== STOPQ.stop || SC.b === null) { loadStopCard(); box.innerHTML = '<div class="msg">טוען את התחנה…</div>'; return; }
  const b = SC.b;
  if (!b) { box.innerHTML = '<div class="empty">אין נתוני התקבצות לתחנה הזו.</div>'; return; }
  const n = b[7].split(',').map(x => +x || 0), k = b[8].split(',').map(x => +x || 0);
  while (n.length < 24) n.push(0); while (k.length < 24) k.push(0);
  const H = STOPQ.h, sh = h => n[h] >= 20 ? k[h] / n[h] : null;
  const all = b[5] / b[4], bad = [...Array(24).keys()].filter(h => sh(h) != null && sh(h) >= Math.max(.08, all * 1.5));
  const ranges = []; bad.forEach(h => { const r = ranges[ranges.length - 1]; if (r && r[1] === h - 1) r[1] = h; else ranges.push([h, h]); });
  const hr = h => String(h).padStart(2, '0') + ':00';
  const rng = ranges.sort((a, c) => k.slice(c[0], c[1] + 1).reduce((x, y) => x + y) - k.slice(a[0], a[1] + 1).reduce((x, y) => x + y)).slice(0, 2).map(([a, c]) => `${hr(a)}–${hr(c + 1)}`);
  const lines = (b[9] || []).filter(r => r[3] > 0);
  const big = lines.filter(r => r[3] / r[2] >= .08).map(r => r[0]).slice(0, 2);
  const sent = (H != null && sh(H) != null ? `בשעה <b>${hr(H)}</b> בערך <b>${pct(k[H], n[H])}</b> מהאוטובוסים הגיעו לתחנה צמודים לאוטובוס הקודם של אותו קו — שניים יחד, ואחריהם המתנה ארוכה.`
    : `בימי חול <b>${pct(b[5], b[4])}</b> מהאוטובוסים הגיעו לתחנה צמודים לאוטובוס הקודם של אותו קו.`) +
    (big.length ? ` זה קורה בעיקר ב${big.map(l => 'קו ' + esc(l)).join(' וב')}.` : '') + (rng.length ? ` השעות הקשות: ${rng.join(' ו-')}.` : '');
  const P = SC.p, days = P ? P.days : [], R = P ? P.r : {}, ev = P && P.s[STOPQ.stop] ? P.s[STOPQ.stop] : [];
  const lnOf = rid => (CAT[rid] && CAT[rid][1]) || (R[rid] && R[rid][0]) || rid;
  const opts = [...new Set(ev.map(e => lnOf(e[1])))].sort((a, c) => (parseInt(a) || 0) - (parseInt(c) || 0));
  const f = ev.filter(e => (!scLine || lnOf(e[1]) === scLine) && (scHour === '' || Math.floor(e[2] / 3600) % 24 === +scHour));
  const mins = s => Math.max(0, Math.round(s / 60));
  box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="ptitle">התחנה שבחרת במפה: ${esc(b[3] || 'תחנה')} <small style="color:var(--dim);font-weight:400">${esc(b[2])}</small></div><button class="closebtn" id="sc-x" aria-label="סגירה">✕</button></div>
    <p class="pdesc"><b>מה הבעיה:</b> ${sent}</p>
    <div class="rstats">${H != null && sh(H) != null ? `<div><b>${pct(k[H], n[H])}</b><span>צמודים ב-${hr(H)}</span><small>${num(k[H])} מתוך ${num(n[H])} זוגות בשעה הזו</small></div>` : ''}
      <div><b>${pct(b[5], b[4])}</b><span>צמודים, כל היום</span><small>${num(b[5])} מתוך ${num(b[4])} זוגות</small></div>
      <div><b>${pct(b[6], b[4])}</b><span>רווח כפול</span><small>הנוסע חיכה פי שניים מהמובטח</small></div></div>
    <div class="ptitle" style="margin-top:12px">התקבצות לפי השעה ביום</div><div class="chart" id="c-stop"></div>
    ${lines.length ? `<div class="ptitle" style="margin-top:12px">הקווים שמתקבצים בתחנה</div><div class="tblbox"><table><thead><tr><th>קו</th><th>לכיוון</th><th>זוגות</th><th>צמודים</th></tr></thead><tbody>${lines.map(([l, to, nn, kk]) => `<tr><td><b>${esc(l)}</b></td><td style="font-size:12px;color:var(--mut)">${esc(to)}</td><td>${num(nn)}</td><td>${num(kk)} (${pct(kk, nn)})</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="ptitle" style="margin-top:12px">כל הפעמים שהאוטובוסים הגיעו צמודים</div>
    ${!P ? '<div class="empty">הרשימה המלאה תתווסף בעדכון הלילי הקרוב.</div>' : !ev.length ? '<div class="empty">לא נמצאו זוגות צמודים בתחנה הזו.</div>' : `
    <div class="filters"><select id="sc-l"><option value="">כל הקווים</option>${opts.map(o => `<option${o === scLine ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>
      <select id="sc-h"><option value="">כל השעות</option>${[...Array(24).keys()].map(h => `<option value="${h}"${String(h) === scHour ? ' selected' : ''}>${hr(h)}–${hr(h + 1)}</option>`).join('')}</select>
      <span style="color:var(--mut);font-size:13px">${num(f.length)} פעמים</span></div>
    <div class="tblbox"><table><thead><tr><th>יום</th><th>שעה בלו״ז</th><th>קו</th><th>הגיעו בהפרש</th></tr></thead><tbody>${f.slice(0, scLim).map(([d, rid, s2, a2, hs, ha]) => `<tr><td>${shortDate(days[d])}</td><td title="הגיע בפועל ב-${hhmm(a2)}">${hhmm(s2)}</td><td><a class="linebtn" data-rid="${esc(rid)}" href="${tabHref('line', {line: rid})}">${esc(lnOf(rid))}</a></td><td><b>${ha < 0 ? 'השני עקף' : ha < 60 ? 'פחות מדקה' : mins(ha) + ' דק׳'}</b> <small style="color:var(--dim)">(במקום ${mins(hs)})</small></td></tr>`).join('')}</tbody></table></div>
    ${f.length > scLim ? `<button class="more" id="sc-more">הצגת עוד ${num(Math.min(200, f.length - scLim))} מתוך ${num(f.length - scLim)}</button>` : ''}`}
    <p class="pdesc" style="margin-top:8px"><a href="../bus-speed/#h=${H != null ? H : 8}&@${b[0]},${b[1]},17">← חזרה למפה</a> · למטה: ההתקבצות בכל הארץ</p>`;
  const hours = n.map((nn, h) => { const v = sh(h); return {x: String(h).padStart(2, '0'), y: v == null ? null : Math.round(v * 100), color: v == null ? GRID : h === H ? C.line : v >= .2 ? C.bad : v >= .1 ? C.late : v >= .05 ? C.warn : C.ok, tip: `<b>${hr(h)}</b><br>${nn ? pct(k[h], nn) + ' צמודים · ' + num(nn) + ' זוגות' : 'אין נתונים'}`}; });
  barChart($('#c-stop'), hours, {color: C.line, max: Math.max(20, ...hours.map(x => x.y || 0)), unit: '%'});
  $('#sc-x').onclick = () => { STOPQ = null; SC = null; renderStopCard(); showTab('bunch'); };
  if ($('#sc-l')) $('#sc-l').onchange = e => { scLine = e.target.value; scLim = 60; renderStopCard(); };
  if ($('#sc-h')) $('#sc-h').onchange = e => { scHour = e.target.value; scLim = 60; renderStopCard(); };
  if ($('#sc-more')) $('#sc-more').onclick = () => { scLim += 200; renderStopCard(); };
  box.querySelectorAll('.linebtn').forEach(x => x.onclick = e => { if (!nv(e)) return; openLine = x.dataset.rid; showTab('line'); renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
}
function renderBunch() {
  renderStopCard();
  const box = $('#bunch-sum'); if (!box) return;
  const B = M.Bn;
  if (!B.tot[0]) { box.innerHTML = `<div class="empty">אין נתוני התקבצות לימים שנבחרו (החישוב קיים מ-21.09.2026; ימים קודמים מתמלאים בהדרגה).</div>`; return; }
  box.innerHTML = `<div class="rstats"><div><b>${pct(B.tot[1], B.tot[0])}</b><span>זוגות צמודים</span><small>${num(B.tot[1])} מתוך ${num(B.tot[0])} זוגות של נסיעות עוקבות (עד 20 דקות בלו״ז) הגיעו לתחנה בהפרש של פחות משליש מהמתוכנן, או בסדר הפוך.</small></div>
    <div><b>${pct(B.tot[2], B.tot[0])}</b><span>רווח כפול</span><small>הנסיעה השנייה הגיעה באיחור של לפחות מרווח שלם: הנוסע חיכה פי שניים מהמובטח.</small></div>
    <div><b>${pct(B.tot[0] - B.tot[1] - B.tot[2], B.tot[0])}</b><span>מרווח סביר</span><small>בין שליש לכפול מהמתוכנן.</small></div>
    ${B.missing.length ? `<div><b>${num(B.missing.length)}</b><span>ימים בלי הנתון</span><small>מהימים שנבחרו, ימים שחושבו לפני שנוסף מדד ההתקבצות.</small></div>` : ''}</div>`;
  const hours = Array.from({length: 24}, (_, h) => { const v = B.H[h]; const sh = v && v[0] >= 30 ? v[1] / v[0] : null; return {x: String(h).padStart(2, '0'), y: sh == null ? null : Math.round(sh * 100), color: sh == null ? GRID : sh >= .2 ? C.bad : sh >= .1 ? C.late : sh >= .05 ? C.warn : C.ok, tip: `<b>${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59</b><br>${v && v[0] ? pct(v[1], v[0]) + ' צמודים · ' + num(v[0]) + ' זוגות' : 'אין נתונים'}`}; });
  barChart($('#c-bunch'), hours, {color: C.line, max: Math.max(20, ...hours.map(h => h.y || 0)) , unit: '%'});
  $('#t-bunch-rg').innerHTML = bunchTable(Object.entries(B.Rg).map(([nm, v]) => bRow(nm, v)).filter(r => r.n >= 50).sort((a, b) => b.b - a.b), 'מרחב');
  $('#t-bunch-ag').innerHTML = bunchTable(Object.entries(B.A).map(([nm, v]) => bRow(nm, v)).filter(r => r.n >= 50).sort((a, b) => b.b - a.b), 'מפעיל');
  if (!$('#bq')) {
    const ags = Object.keys(B.A).sort();
    $('#bunch-filters').innerHTML = `<input class="search" id="bq" placeholder="חיפוש מספר קו…" value="${esc(bq)}"><select id="bag"><option value="">כל המפעילים</option>${ags.map(a => `<option value="${esc(a)}"${a === bAgency ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>`;
    $('#bq').oninput = e => { bq = e.target.value; renderBunchLines(); };
    $('#bag').onchange = e => { bAgency = e.target.value; renderBunchLines(); };
  }
  renderBunchLines();
  const st = Object.values(B.stops).sort((a, b) => b.b - a.b).slice(0, 30);
  $('#t-bunch-st').innerHTML = st.length ? `<div class="tblbox"><table><thead><tr><th>תחנה</th><th>קו</th><th>מסלול</th><th>זוגות</th><th>צמודים</th></tr></thead><tbody>` +
    st.map(x => { const l = lineLabel(x.rid); return `<tr><td class="nm">${esc(x.name || stopName(x.code))} <small style="color:var(--dim)">${esc(x.code)}</small></td><td><a class="linebtn" data-rid="${esc(x.rid)}" href="${tabHref('line', {line: x.rid})}">${esc(l.short)}</a></td><td style="font-size:12px;color:var(--mut)">${esc(l.long)} · ${esc(l.agency)}</td><td>${num(x.n)}</td><td>${num(x.b)} (${pct(x.b, x.n)})</td></tr>`; }).join('') + '</tbody></table></div>' : '<div class="empty">אין נתונים</div>';
  const ex = B.ex.slice(0, 30);
  $('#t-bunch-ex').innerHTML = ex.length ? `<div class="tblbox"><table><thead><tr><th>יום</th><th>קו</th><th>תחנה</th><th>מתוכנן</th><th>בפועל</th><th>מרווח מתוכנן</th><th>מרווח בפועל</th></tr></thead><tbody>` +
    ex.map(([d, rid, code, s1, s2, a1, a2]) => { const l = lineLabel(rid); return `<tr><td>${shortDate(d)}</td><td class="nm"><a class="linebtn" data-rid="${esc(rid)}" href="${tabHref('line', {line: rid})}">${esc(l.short)}</a> <small style="color:var(--mut);font-weight:400">${esc(l.long)}</small></td><td>${esc(stopName(code))}</td><td>${hhmm(s1)} ו-${hhmm(s2)}</td><td>${hhmm(a1)} ו-${hhmm(a2)}</td><td>${Math.round((s2 - s1) / 60)} דק׳</td><td class="${a2 - a1 <= 0 ? 'd4' : ''}">${a2 - a1 <= 0 ? 'השני הגיע קודם' : Math.round((a2 - a1) / 6) / 10 + ' דק׳'}</td></tr>`; }).join('') + '</tbody></table></div>' : '<div class="empty">אין דוגמאות</div>';
  document.querySelectorAll('#t-bunch-st .linebtn, #t-bunch-ex .linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; showTab('line'); renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
}
function renderBunchLines() {
  const box = $('#t-bunch-l'); if (!box) return;
  const q = bq.trim();
  let rows = Object.entries(M.Bn.Rr).map(([rid, v]) => { const l = lineLabel(rid); return bRow(l.short, v, {rid, long: l.long, agency: l.agency, cluster: l.cluster}); }).filter(r => r.n >= 30);
  if (q) rows = rows.filter(r => r.nm === q || r.nm.startsWith(q));
  if (bAgency) rows = rows.filter(r => r.agency === bAgency);
  rows.sort((a, b) => b.b - a.b || b.n - a.n);
  const total = rows.length;
  rows = rows.slice(0, 50);
  box.innerHTML = bunchTable(rows, 'קו', r => `<a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.nm)}</a> <small style="color:var(--mut);font-weight:400">${esc(r.long)} · ${esc(r.agency)}${r.cluster ? ' · ' + esc(r.cluster) : ''}</small>`) + `<div class="mut" style="margin-top:6px">${num(total)} מסלולים עם 30 זוגות לפחות${total > rows.length ? ', מוצגים 50 הראשונים' : ''}</div>`;
  box.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (!nv(e)) return; openLine = b.dataset.rid; showTab('line'); renderLineDetail(); $('#line-detail').scrollIntoView({behavior: 'smooth', block: 'start'}); });
}

// תדירות שידור GPS (שלמה 29.09: "כל כמה זמן הרכב משדר בממוצע", לפי רכב ולפי מפעיל) — data/gps.json,
// צבירה של 14 הימים האחרונים, לא תלויה בתקופה שנבחרה למעלה
let GPS = null, gq = '', gLim = 50, gT = 0, gAg = null;
const gpsAvg = () => { let s = 0, n = 0; GPS.v.forEach(r => { s += r[2]; n++; }); return n ? Math.round(s / n) : '—'; };
const secCls = v => v == null ? '' : v >= 120 ? 'd4' : v >= 90 ? 'd3' : v >= 75 ? 'd2' : '';
// אמינות השידורים (שלמה 02.11) — מ-../bus-speed/data/gpsq.json (tools/bus_speed.py), יום-יום, ומחברים כאן את
// התקופה שנבחרה (יום / 7 / 30). ציון לכל מפעיל: חצי זיופי GPS לכל 1,000 שידורים, חצי נסיעות ששודרו בשעה אחרת;
// בכל מרכיב הטוב ביותר 100 והגרוע ביותר 0
let GQ = null, gqLoading = false;
function renderGq() {
  const box = $('#gq'); if (!box) return;
  if (!GQ) {
    box.innerHTML = '<div class="ptitle">אמינות השידורים</div><div class="mut">טוען…</div>';
    if (!gqLoading) { gqLoading = true; fetch('../bus-speed/data/gpsq.json?v=' + encodeURIComponent(IDX.updated || '')).then(r => r.json()).then(j => { GQ = j; renderGq(); }).catch(() => { GQ = { days: [], d: {} }; renderGq(); }); }
    return;
  }
  const days = windowDays().map(d => d.d).filter(d => GQ.d[d]);
  if (!days.length) { box.innerHTML = '<div class="ptitle">אמינות השידורים</div><div class="empty">אין נתונים לימים שנבחרו</div>'; return; }
  const sum = (k, f) => { const o = {}; days.forEach(d => Object.entries(GQ.d[d][k] || {}).forEach(([a, v]) => { o[a] = f(o[a], v); })); return o; };
  const add = (a, v) => (a || 0) + v, addv = (a, v) => (a || [0, 0, 0]).map((x, i) => x + v[i]);
  const nb = sum('nb', add), tr = sum('trips', addv), fk = sum('fk', add), fl = sum('fl', add), fv = sum('fv', add), tl = sum('tl', add);
  const ops = Object.keys(nb).filter(a => nb[a] >= 20000 * days.length && tr[a] && tr[a][0] >= 100 * days.length);
  const fr = {}, lr = {};
  ops.forEach(a => { fr[a] = 1000 * (fk[a] || 0) / nb[a]; lr[a] = 100 * (tr[a][1] + tr[a][2]) / tr[a][0]; });
  const sc = (m, a) => { const v = ops.map(x => m[x]), lo = Math.min(...v), hi = Math.max(...v); return hi === lo ? 100 : Math.round(100 - 100 * (m[a] - lo) / (hi - lo)); };
  const rows = ops.map(a => { const x = sc(fr, a), y = sc(lr, a); return [a, Math.round((x + y) / 2), fk[a] || 0, fr[a], lr[a]]; }).sort((p, q) => q[1] - p[1]);
  const cls = v => v >= 85 ? '' : v >= 65 ? 'd1' : v >= 45 ? 'd2' : v >= 25 ? 'd3' : 'd4';
  const top = (o, n) => Object.entries(o).sort((p, q) => q[1] - p[1]).slice(0, n).map(([k, v]) => [...k.split('|'), v]);
  const t = (h, r) => `<div class="tblbox" style="margin-top:6px;max-height:none"><table><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${r}</tbody></table></div>`;
  const nf = Object.values(fk).reduce((a, b) => a + b, 0), best = rows[0], worst = rows[rows.length - 1];
  box.innerHTML = `<div class="ptitle">אמינות השידורים</div><p class="pdesc">ציון מ-0 עד 100 לכל מפעיל. חצי מהציון — זיופי GPS: שידור שהאוטובוס נמצא במקום שאין בו שום רחוב שאוטובוסים נוסעים בו (ים, שטח פתוח). חצי — נסיעות ששודרו בשעה אחרת: השידור הראשון הגיע יותר משעה אחרי שעת היציאה בלו"ז, או שהרכב המשיך לשדר על הנסיעה 4 שעות ומעלה. בכל מרכיב המפעיל הטוב ביותר מקבל 100 והגרוע ביותר 0. את המקומות המזויפים עצמם רואים במפה של <a href="../bus-speed/">איפה האוטובוס נתקע</a> (שכבה "זיופי GPS").</p>` +
    (rows.length ? `<div class="stat-row"><div><b>${num(nf)}</b><span>זיופי GPS · ${days.length === 1 ? shortDate(days[0]) : days.length + ' ימים'}</span></div><div><b>${esc(best[0])}</b><span>הציון הגבוה ביותר: ${best[1]}</span></div><div><b>${esc(worst[0])}</b><span>הציון הנמוך ביותר: ${worst[1]}</span></div></div>` +
    t(['מפעיל', 'ציון', 'זיופי GPS', 'זיופים ל-1,000 שידורים', 'נסיעות בשעה אחרת'], rows.map(([a, s, f, r, l]) => `<tr><td class="nm">${esc(a)}</td><td class="${cls(s)}"><b>${s}</b></td><td>${num(f)}</td><td>${Math.round(r * 100) / 100}</td><td>${Math.round(l * 10) / 10}%</td></tr>`).join('')) : '') +
    `<div class="ptitle" style="margin-top:14px">הקווים עם הכי הרבה זיופי GPS</div>` + t(['קו', 'מפעיל', 'זיופים'], top(fl, 10).map(([l, a, n]) => `<tr><td class="nm"><b>${esc(l)}</b></td><td>${esc(a)}</td><td>${num(n)}</td></tr>`).join('')) +
    `<div class="ptitle" style="margin-top:14px">הקווים עם הכי הרבה נסיעות בשעה אחרת</div>` + t(['קו', 'מפעיל', 'נסיעות'], top(tl, 10).map(([l, a, n]) => `<tr><td class="nm"><b>${esc(l)}</b></td><td>${esc(a)}</td><td>${num(n)}</td></tr>`).join('')) +
    `<div class="ptitle" style="margin-top:14px">הרכבים עם הכי הרבה זיופי GPS</div><p class="pdesc">רכב שחוזר שוב ושוב — כנראה מכשיר תקול.</p>` + t(['מספר רכב', 'מפעיל', 'זיופים'], top(fv, 8).map(([v, a, n]) => `<tr><td class="nm" style="direction:ltr;text-align:right">${esc(v)}</td><td>${esc(a)}</td><td>${num(n)}</td></tr>`).join(''));
}
function renderGps() {
  renderGq();
  if (!SHOW_GPS_FREQ) return;
  const box = $('#t-gps-v'); if (!box) return;
  if (!GPS) { $('#gps-sum').innerHTML = '<div class="empty">אין עדיין נתוני שידור (מחושב בריצה הלילית הבאה)</div>'; $('#t-gps-ag').innerHTML = ''; box.innerHTML = ''; return; }
  const agName = {}; GPS.agencies.forEach(a => { agName[a[0]] = a[1]; });
  const slowV = GPS.v.filter(r => r[6] >= (GPS.slowShare || 0.5)).length;
  const d0 = GPS.days[0], d1 = GPS.days[GPS.days.length - 1];
  $('#gps-sum').innerHTML = `<div class="stat-row">
      <div><b>${gpsAvg()} שנ׳</b><span>המרווח הממוצע בין דיווחי מיקום, ממוצע על כל הרכבים</span></div>
      <div><b>${pct(slowV, GPS.v.length)}</b><span>מהרכבים מדלגים באופן קבוע (לפחות ${Math.round((GPS.slowShare||0.5)*100)}% מהמרווחים ${GPS.slow} שנ׳ ומעלה)</span></div>
      <div><b>${num(GPS.v.length)}</b><span>רכבים שנמדדו · ${GPS.days.length} ימים (${shortDate(d0)}–${shortDate(d1)})</span></div></div>`;
  $('#t-gps-ag').innerHTML = `<div class="tblbox"><table><thead><tr><th>מפעיל</th><th>רכבים</th><th>מרווח ממוצע</th><th>חציון</th><th>רכבים איטיים (לפחות ${Math.round((GPS.slowShare||0.5)*100)}% מהמרווחים ${GPS.slow} שנ׳ ומעלה)</th><th>מרווחים חסרים</th></tr></thead><tbody>` +
    GPS.agencies.filter(a => a[2] >= 3).map(a => `<tr data-ag="${esc(a[0])}" style="cursor:pointer${gAg === String(a[0]) ? ';background:var(--panel2);box-shadow:inset -3px 0 0 var(--accent)' : ''}" title="לחיצה מציגה למטה רק את הרכבים של ${esc(a[1])}"><td class="nm">${esc(a[1])}${gAg === String(a[0]) ? ' ✓' : ''}</td><td>${num(a[2])}</td><td class="${secCls(a[3])}">${a[3]} שנ׳</td><td>${a[4] == null ? '—' : a[4] + ' שנ׳'}</td><td class="${a[5] > .1 ? 'd4' : a[5] > .03 ? 'd2' : ''}">${Math.round(a[5] * 1000) / 10}%</td><td>${a[6] == null ? '—' : Math.round(a[6] * 1000) / 10 + '%'}</td></tr>`).join('') + '</tbody></table></div>';
  const q = gq.trim().replace(/-/g, '');
  let rows = GPS.v;
  // לחיצה על מפעיל בטבלה שלמעלה מסננת את הרכבים שלו (שלמה 22.10)
  if (gAg) rows = rows.filter(r => String(r[1]) === gAg);
  $('#gps-agf').innerHTML = gAg ? `<button class="fchip on" id="gps-agx">רק ${esc(agName[gAg] || gAg)} ✕</button>` : '';
  if (q) rows = rows.filter(r => r[0].includes(q) || (agName[r[1]] || '').includes(q));
  const total = rows.length;
  // בלי "הצגת הכל": אלפי שורות בבת אחת האטו כל לחיצה בדף (שלמה 30.09) — טוענים עוד 100 בכל פעם
  rows = rows.slice(0, gLim);
  box.innerHTML = rows.length ? `<div class="tblbox" style="margin-top:10px"><table><thead><tr><th>מספר רכב</th><th>מפעיל</th><th>מרווח ממוצע</th><th>חציון</th><th>מרווחים חסרים</th><th>דיווחים</th><th>ימים</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm" style="direction:ltr;text-align:right">${esc(r[0])}</td><td style="font-size:12px">${esc(agName[r[1]] || r[1])}</td><td class="${secCls(r[2])}"><b>${r[2]}</b> שנ׳</td><td>${r[3] == null ? '—' : r[3] + ' שנ׳'}</td><td>${r[6] == null ? '—' : Math.round(r[6] * 100) + '%'}</td><td>${num(r[4])}</td><td>${r[5]}</td></tr>`).join('') + '</tbody></table></div>' +
    (total > rows.length ? `<button class="more" id="more-gps">עוד ${num(Math.min(100, total - rows.length))} רכבים (מוצגים ${num(rows.length)} מתוך ${num(total)})</button>` : '') +
    `<div class="mut" style="margin-top:6px">${num(total)} רכבים · רק רכבים עם 20 מרווחים לפחות · החציון מעוגל לסלים של 5 שניות</div>` : '<div class="empty">לא נמצא רכב כזה</div>';
  const inp = $('#gps-q'); if (inp && !inp.oninput) inp.oninput = e => { gq = e.target.value; gLim = 50; clearTimeout(gT); gT = setTimeout(renderGps, 200); };
  const mb = $('#more-gps'); if (mb) mb.onclick = () => { gLim += 100; renderGps(); };
  const ax = $('#gps-agx'); if (ax) ax.onclick = () => { gAg = null; gLim = 50; renderGps(); };
  $('#t-gps-ag').onclick = e => { const tr = e.target.closest('tr[data-ag]'); if (!tr) return;
    gAg = gAg === tr.dataset.ag ? null : tr.dataset.ag; gLim = 50; renderGps();
    if (gAg) $('#gps-agf').scrollIntoView({behavior: 'smooth', block: 'start'}); };
}
// ---------------------------------------------------------------- כלים משותפים לשתי הלשוניות החדשות
// תיאור התקופה שנבחרה במשפט (לכותרת של דוח מודפס ושל קובץ CSV)
function periodTxt() {
  const d = M.days;
  if (!d.length) return '';
  const base = d.length === 1 ? heDate(d[0]) : `${shortDate(d[0])}–${shortDate(d[d.length - 1])}.${d[d.length - 1].slice(0, 4)} · ${d.length} ימים`;
  return base + (period !== 'day' && dtype ? ' · רק ' + DTNAME[dtype] : '');
}
const dmy = d => d ? `${+d.slice(8, 10)}.${+d.slice(5, 7)}.${d.slice(0, 4)}` : '';
// הורדה כקובץ CSV שנפתח באקסל (BOM כדי שהעברית תוצג נכון)
function csvDownload(name, rows) {
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const setHash = () => { const h = tabHash(tab, tabQ(tab)); history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); };
const goLine = rid => { openLine = rid; showTab('line'); renderLineDetail(); const el = $('#line-detail'); if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'}); };
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------- לפי תחנה (אלעזר פינדר 23.11: "להתמקד בתחנה ולא בעיר")
// כל הקווים שעוברים בתחנה, מהפרופילים היומיים לאורך כל קו (days/D.stops.json — אותם קבצים של "תחנה אחרי
// תחנה" בפירוט הקו). שם, עיר ומיקום התחנה — מקטלוג התחנות של "כמה עולה הנסיעה" (../fares/data/stops.json:
// מק"ט → [שם, עיר, רוחב, אורך]); בלעדיו — data/stops.json (שם בלבד). בפרופיל אין פירוט לפי שעה.
let stopSel = '', stopQ = '', SCAT = null, scatLoading = false, stopMap = null, stopLoadId = 0;
function stopSearch(q, lim = 14) {
  const tok = q.trim().split(/\s+/).filter(Boolean);
  if (!tok.length) return [];
  const codeTok = tok.find(t => /^\d{3,}$/.test(t)), words = tok.filter(t => t !== codeTok);
  const out = [];
  for (const [code, v] of Object.entries(SCAT)) {
    if (codeTok && !code.startsWith(codeTok)) continue;
    const txt = v[0] + ' ' + (v[1] || '');
    if (words.every(w => txt.includes(w))) out.push(code);
    if (out.length > 400) break;
  }
  const exact = c => (codeTok && c === codeTok ? 0 : 2) + (words.length && SCAT[c][0].startsWith(words[0]) ? 0 : 1);
  return out.sort((a, b) => exact(a) - exact(b) || SCAT[a][0].localeCompare(SCAT[b][0], 'he') || (SCAT[a][1] || '').localeCompare(SCAT[b][1] || '', 'he') || a - b).slice(0, lim);
}
function renderStop() {
  const box = $('#stop-box'); if (!box) return;
  const head = `<div class="ptitle">לפי תחנה</div><p class="pdesc">כל הקווים שעוברים בתחנה אחת: כמה הגעות נמדדו, כמה מהן בזמן, האיחור הממוצע וכמה הגיעו מוקדם מדי. מחפשים לפי שם התחנה, העיר או המק״ט (המספר שעל השלט בתחנה). התקופה וסוג היום — לפי הבחירה למעלה.</p>`;
  if (!SCAT) {
    box.innerHTML = head + '<div class="msg">טוען את רשימת התחנות…</div>';
    if (!scatLoading) {
      scatLoading = true;
      Promise.all([fetch('../fares/data/stops.json').then(r => r.ok ? r.json() : null).catch(() => null), loadProfiles([])]).then(([j]) => {
        SCAT = (j && j.stops) || {};
        for (const [c, n] of Object.entries(NAMES || {})) if (!SCAT[c] && n) SCAT[c] = [n, '', null, null];
        renderStop();
      });
    }
    return;
  }
  box.innerHTML = head + `<div class="filters"><input class="search" id="stq" type="search" placeholder="שם תחנה, עיר או מק״ט — למשל: הרצל ראשון לציון" value="${esc(stopQ)}" autocomplete="off"></div><div id="st-sug"></div><div id="st-res"></div>`;
  const qi = $('#stq'); let t = null;
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { stopQ = qi.value; renderStopSug(); }, 180); };
  renderStopSug(); renderStopRes();
}
function renderStopSug() {
  const el = $('#st-sug'); if (!el) return;
  const list = stopSearch(stopQ);
  if (!stopQ.trim()) { el.innerHTML = stopSel ? '' : '<div class="empty">בחרו תחנה כדי לראות את כל הקווים שעוברים בה</div>'; return; }
  const all = list.length === 14 ? stopSearch(stopQ, 400).length : list.length;
  el.innerHTML = list.length ? `<div class="stsug">${list.map(c => `<button class="stopt${c === stopSel ? ' on' : ''}" data-st="${esc(c)}"><b>${esc(SCAT[c][0])}</b><span>${esc(SCAT[c][1] || '')}</span><small>${esc(c)}</small></button>`).join('')}</div>${all > list.length ? `<p class="mut">ועוד ${all > 400 ? 'הרבה' : num(all - list.length)} תחנות — אפשר להוסיף לחיפוש את העיר או את שם הרחוב השני</p>` : ''}` : '<div class="empty">לא נמצאה תחנה כזו</div>';
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => pickStop(b.dataset.st));
}
function pickStop(code) {
  stopSel = code; stopQ = ''; const qi = $('#stq'); if (qi) qi.value = '';
  setHash(); renderStopSug(); renderStopRes();
}
function stopAgg(code, days) {
  const acc = new Map(); let eDays = [];
  for (const d of days) {
    const sc = stopCache[d] || {};
    const first = Object.values(sc)[0];
    const hasE = !!(first && first[0] && first[0].length > 5);
    if (hasE) eDays.push(d);
    for (const rid in sc) {
      const row = sc[rid].find(r => r[0] === code);
      if (!row) continue;
      const x = acc.get(rid) || {rid, n: 0, sum: 0, on: 0, plan: 0, en: 0, e: 0, days: 0};
      x.n += row[1]; x.sum += row[2] / 10 * row[1]; x.on += row[3]; x.plan += row[4] || 0; x.days++;
      if (row.length > 5) { x.en += row[1]; x.e += row[5]; }
      acc.set(rid, x);
    }
  }
  return {rows: [...acc.values()], eDays};
}
function renderStopRes() {
  const el = $('#st-res'); if (!el) return;
  if (!stopSel) { el.innerHTML = ''; return; }
  const info = SCAT[stopSel] || [stopName(stopSel), '', null, null];
  const days = M.days, need = days.filter(d => !stopCache[d]);
  const head = `<div class="ldetail"><div class="lhead"><span class="badge">${esc(stopSel)}</span><span class="ldest"><b style="color:var(--ink)">${esc(info[0])}</b>${info[1] ? ' · ' + esc(info[1]) : ''} · ${esc(periodTxt())}</span><button class="closebtn" id="st-x">✕ סגירה</button></div>`;
  if (need.length) {
    const my = ++stopLoadId;
    el.innerHTML = head + `<div class="msg">טוען את נתוני התחנות… <span id="st-prog">0 מתוך ${need.length} ימים</span></div></div>`;
    $('#st-x').onclick = () => { stopSel = ''; setHash(); renderStopRes(); renderStopSug(); };
    let done = 0;
    Promise.all(need.map(d => load(DATA + 'days/' + d + '.stops.json').then(j => { stopCache[d] = j; }).catch(() => { stopCache[d] = {}; }).then(() => { const p = $('#st-prog'); if (p) p.textContent = `${++done} מתוך ${need.length} ימים`; })))
      .then(() => { if (my === stopLoadId && tab === 'stop') renderStopRes(); });
    return;
  }
  const {rows: raw, eDays} = stopAgg(stopSel, days);
  const rows = raw.map(x => { const l = lineLabel(x.rid); return {rid: x.rid, short: l.short, long: routeName((CAT[x.rid] || [])[2]) || l.long, agency: l.agency, n: x.n, plan: x.plan, cover: x.plan ? x.n / x.plan : null, on: x.n ? x.on / x.n : null, avg: x.n ? x.sum / x.n : null, early: x.en ? x.e / x.en : null}; })
    .sort((a, b) => b.n - a.n);
  const T = raw.reduce((t, x) => { t.n += x.n; t.sum += x.sum; t.on += x.on; t.plan += x.plan; t.en += x.en; t.e += x.e; return t; }, {n: 0, sum: 0, on: 0, plan: 0, en: 0, e: 0});
  const sibs = info[0] ? Object.entries(SCAT).filter(([c, v]) => c !== stopSel && v[0] === info[0] && (v[1] || '') === (info[1] || '')).map(([c]) => c).slice(0, 8) : [];
  const eNote = !eDays.length ? 'אחוז ההגעות המוקדמות לכל תחנה נשמר מהימים שמעובדים מ-24.11.2026.' : eDays.length < days.length ? `אחוז ההגעות המוקדמות: לפי ${num(eDays.length)} מתוך ${num(days.length)} ימים (מ-${dmy(eDays[0])}).` : '';
  const lines = new Set(rows.map(r => r.short + '|' + r.agency)).size;
  el.innerHTML = head +
    (sibs.length ? `<p class="pdesc">רציפים נוספים באותו שם: ${sibs.map(c => `<button class="lnk" data-st="${esc(c)}">${esc(c)}</button>`).join(' · ')}</p>` : '') +
    (!rows.length ? `<div class="empty">לא נמדדו הגעות בתחנה הזו ${days.length === 1 ? 'ביום הזה' : 'בתקופה הזו'}.</div></div>` :
    `<div class="stopgrid"><div class="stat-row">
      <div><b>${T.n ? pct(T.on, T.n) : '—'}</b><span>מההגעות היו בזמן</span></div>
      <div><b>${T.n ? fmt1(T.sum / T.n) : '—'}<i>דק׳</i></b><span>איחור ממוצע</span></div>
      <div><b>${T.en ? pct(T.e, T.en) : '—'}</b><span>הגיעו מוקדם מדי (יותר מ-2 דק׳)</span></div>
      <div><b>${num(T.n)}</b><span>הגעות נמדדו${T.plan ? ` מתוך ${num(T.plan)} בלו״ז (${pct(T.n, T.plan)})` : ''}</span></div>
      <div><b>${num(lines)}</b><span>קווים · ${num(rows.length)} כיווני נסיעה</span></div>
    </div>${info[2] ? '<div class="stmap" id="st-map" aria-label="מפת התחנה"></div>' : ''}</div>
    <div class="tblbox"><table><thead><tr><th>קו</th><th>מסלול</th><th>מפעיל</th><th>הגעות נמדדו</th><th>מהמתוכנן</th><th>בזמן</th><th>איחור ממוצע</th><th>מוקדם</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td class="nm nmc"><a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}">${esc(r.short)}</a></td><td class="rtn">${esc(r.long)}</td><td style="font-size:12px">${esc(r.agency)}</td><td>${num(r.n)}</td><td title="${r.plan ? num(r.n) + ' הגעות נמדדו מתוך ' + num(r.plan) + ' נסיעות בלו״ז שעוברות בתחנה' : ''}">${r.cover == null ? '—' : Math.round(r.cover * 100) + '%'}</td><td>${onCell(r.on)}</td><td class="${dcls(r.avg)}">${delayTxt(r.avg)} דק׳</td><td>${r.early == null ? '—' : `<span class="${r.early >= .1 ? 'd4' : r.early >= .05 ? 'd3' : ''}">${Math.round(r.early * 100)}%</span>`}</td></tr>`).join('') +
    `</tbody></table></div>
    <p class="note">"מהמתוכנן": ההגעות שנמדדו מתוך הנסיעות שעוברות בתחנה לפי לוח הזמנים. אין פירוט לפי שעה: לכל קו ותחנה נשמר סיכום של יום שלם. ${eNote} לחיצה על מספר הקו פותחת את הפירוט שלו, תחנה אחרי תחנה.</p></div>`);
  $('#st-x').onclick = () => { stopSel = ''; setHash(); renderStopRes(); renderStopSug(); };
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => pickStop(b.dataset.st));
  el.querySelectorAll('.linebtn').forEach(b => b.onclick = e => { if (nv(e)) goLine(b.dataset.rid); });
  if (info[2] && rows.length) {
    const code = stopSel;
    loadLeaflet().then(() => {
      const mel = $('#st-map'); if (!mel || stopSel !== code) return;
      if (stopMap) { stopMap.remove(); stopMap = null; }
      stopMap = L.map(mel, {scrollWheelZoom: false, attributionControl: true}).setView([info[2], info[3]], 17);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap'}).addTo(stopMap);
      for (const c of sibs) { const v = SCAT[c]; if (v && v[2]) L.circleMarker([v[2], v[3]], {radius: 6, color: '#fff', weight: 2, fillColor: '#8a94a8', fillOpacity: 1}).addTo(stopMap).bindTooltip(`${esc(v[0])} · ${esc(c)}`).on('click', () => pickStop(c)); }
      L.circleMarker([info[2], info[3]], {radius: 9, color: '#fff', weight: 3, fillColor: '#0369a1', fillOpacity: 1}).addTo(stopMap).bindTooltip(`${esc(info[0])} · ${esc(code)}`, {permanent: true, direction: 'top', offset: [0, -8]});
    }).catch(() => { const mel = $('#st-map'); if (mel) mel.remove(); });
  }
}

// ---------------------------------------------------------------- דוח יציאות (אלעזר פינדר 23.11: "זמני היציאה חשובים —
// זה יכול להחליף את הדוח החצי-שנתי של המשרד"). לקו, למפעיל או לאשכול: כמה נסיעות בלו"ז, כמה נצפו, כמה יצאו
// מהמוצא בזמן / מוקדם / באיחור. הסיכום — מהקבצים היומיים (כל הימים). לפי שעה ולפי נסיעה — מ-days/D.dep.json
// (tools/bus_reliability.py, departures_day), שנשמר מ-24.11.2026.
let depAg = '', depCl = '', depLine = '', depQ = '', depCache = {}, depLoadId = 0;
const DEP_EARLY = -120, DEP_LATE = 300;   // מוקדם: יותר מ-2 דק׳ לפני; באיחור: יותר מ-5 דק׳ אחרי (כמו "יציאה בזמן מהמוצא")
function loadDep(days, prog) {
  const need = days.filter(d => depCache[d] === undefined); let done = 0;
  return Promise.all(need.map(d => load(DATA + 'days/' + d + '.dep.json').then(j => { depCache[d] = j; }).catch(() => { depCache[d] = null; }).then(() => prog && prog(++done, need.length))));
}
const lineKeyOf = rid => { const c = CAT[rid] || []; return c[0] || 'r' + rid; };
function depRow(nm, xs, extra) {
  const r = {nm, sched: 0, obs: 0, o: [0, 0, 0, 0, 0], ...extra};
  for (const x of xs) { r.sched += x.sched; r.obs += x.obs; x.o.forEach((v, i) => r.o[i] += v); }
  r.meas = r.o.reduce((a, b) => a + b, 0); r.miss = Math.max(0, r.sched - r.obs); r.nomeas = Math.max(0, r.obs - r.meas);
  r.early = r.o[0]; r.on = r.o[1]; r.late = r.o[2] + r.o[3] + r.o[4];
  return r;
}
const pc1 = (a, b) => b ? Math.round(1000 * a / b) / 10 + '%' : '—';
const DEPH = ['נסיעות בלו״ז', 'נצפו', 'לא נצפו', 'יציאה נמדדה', 'בזמן', 'מוקדם', 'באיחור'];
const depCells = r => `<td>${num(r.sched)}</td><td>${num(r.obs)}</td><td class="${missCls(r.sched ? r.miss / r.sched : null)}">${num(r.miss)} <small>(${pct(r.miss, r.sched)})</small></td><td>${num(r.meas)}</td><td>${onCell(r.meas ? r.on / r.meas : null)}</td><td>${eCell(r.meas ? r.early / r.meas : null)}</td><td>${r.meas ? pct(r.late, r.meas) : '—'}</td>`;
const depCsv = r => [r.sched, r.obs, r.miss, r.meas, r.on, r.early, r.late];
function depRoutes() {
  return Object.values(M.Rr).filter(s => { const l = lineLabel(s.rid); return (!depAg || l.agency === depAg) && (!depCl || (l.cluster || 'ללא אשכול') === depCl); });
}
function renderDep() {
  const box = $('#dep-box'); if (!box) return;
  const ags = Object.keys(M.A).sort((a, b) => a.localeCompare(b, 'he'));
  const cls = Object.keys(M.K || {}).sort((a, b) => a.localeCompare(b, 'he'));
  box.innerHTML = `<div class="ptitle">דוח יציאות מתחנת המוצא</div>
    <p class="pdesc noprint">לכל קו, מפעיל או אשכול: כמה נסיעות היו בלוח הזמנים, כמה נצפו, וכמה יצאו מהתחנה הראשונה בזמן, מוקדם או באיחור — כמו הדוח של משרד התחבורה על ביצוע נסיעות, לתקופה ולסוג היום שבחרתם למעלה. אפשר להדפיס או להוריד לאקסל.</p>
    <div class="filters noprint"><select id="dep-ag" aria-label="מפעיל"><option value="">כל המפעילים</option>${ags.map(a => `<option ${a === depAg ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
      ${cls.length > 1 ? `<select id="dep-cl" aria-label="אשכול"><option value="">כל האשכולות</option>${cls.map(a => `<option ${a === depCl ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>` : ''}
      <input class="search" id="dep-q" type="search" placeholder="מספר קו, למשל 261" value="${esc(depQ)}" autocomplete="off"></div>
    <div id="dep-sug" class="noprint"></div><div id="dep-body"></div>`;
  $('#dep-ag').onchange = e => { depAg = e.target.value; depLine = ''; setHash(); renderDep(); };
  const cs = $('#dep-cl'); if (cs) cs.onchange = e => { depCl = e.target.value; depLine = ''; setHash(); renderDep(); };
  const qi = $('#dep-q'); let t = null;
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { depQ = qi.value; renderDepSug(); }, 180); };
  renderDepSug(); renderDepBody();
}
function depGroups() {
  const G = new Map();
  for (const s of depRoutes()) { const k = lineKeyOf(s.rid), g = G.get(k) || {key: k, rs: []}; g.rs.push(s); G.set(k, g); }
  return [...G.values()].map(g => { const main = g.rs.slice().sort((a, b) => b.sched - a.sched)[0], l = lineLabel(main.rid); return depRow(l.short, g.rs, {key: g.key, short: l.short, long: l.long, agency: l.agency, cluster: l.cluster, rs: g.rs}); });
}
function renderDepSug() {
  const el = $('#dep-sug'); if (!el) return;
  const q = depQ.trim();
  if (!q) { el.innerHTML = ''; return; }
  const list = depGroups().filter(g => g.short === q || g.short.startsWith(q)).sort((a, b) => (a.short === q ? 0 : 1) - (b.short === q ? 0 : 1) || b.sched - a.sched).slice(0, 12);
  el.innerHTML = list.length ? `<div class="stsug">${list.map(g => `<button class="stopt${g.key === depLine ? ' on' : ''}" data-dl="${esc(g.key)}"><b>קו ${esc(g.short)}</b><span>${esc(g.agency)}</span><small>${esc(routeName(g.long) || g.long)}</small></button>`).join('')}</div>` : '<div class="empty">לא נמצא קו כזה בתקופה שנבחרה</div>';
  el.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => { depLine = b.dataset.dl; depQ = ''; const i = $('#dep-q'); if (i) i.value = ''; setHash(); renderDepSug(); renderDepBody(); });
}
function depButtons() {
  return `<div class="depbtns noprint"><button class="fchip" id="dep-print">🖨 הדפסה</button><button class="fchip" id="dep-csv">⬇ הורדה לאקסל (CSV)</button></div>`;
}
function bindDepButtons(csv) {
  $('#dep-print').onclick = () => { document.body.classList.add('pdep'); const off = () => { document.body.classList.remove('pdep'); window.removeEventListener('afterprint', off); }; window.addEventListener('afterprint', off); window.print(); setTimeout(off, 1500); };
  $('#dep-csv').onclick = csv;
}
const DEP_NOTE = `<details class="bmore"><summary>איך זה נמדד, ומה ההבדל מהדוח של המשרד</summary><ul class="lhow">
  <li><b>נסיעות בלו״ז</b>: כל הנסיעות של הקו בלוח הזמנים (GTFS) של אותו יום.</li>
  <li><b>נצפו</b>: נסיעות ששידרו מיקום (SIRI) ונמדדו לאורך המסלול. <b>לא נצפו</b>: לא נמצא להן שידור. המשרד סופר אותן כ"לא בוצעו"; כאן אי אפשר להבחין בין נסיעה שלא יצאה לנסיעה שיצאה בלי שידור, ולכן השם הוא "לא נצפו".</li>
  <li><b>יציאה נמדדה</b>: הרכב נראה עומד בתחנת המוצא ואז מתחיל לזוז. <b>בזמן</b>: עד 2 דקות לפני השעה שבלו״ז ועד 5 דקות אחריה. <b>מוקדם</b>: יותר מ-2 דקות לפני. <b>באיחור</b>: יותר מ-5 דקות אחרי.</li>
  <li>השידורים נשמרים פעם בדקה, ולכן רגע היציאה מדויק בערך לדקה. נסיעה שהשידור שלה התחיל כשהרכב כבר היה בדרך נספרת כ"נצפתה" בלי מדידת יציאה.</li>
  <li>המספרים דומים לדוח המשרד אבל לא זהים לו: המשרד מקבל מהמפעילים דיווח מלא, וכאן הכל מהשידורים הציבוריים.</li>
  <li>כיוון של קו שלא נצפתה בו אף נסיעה באותו יום לא נכנס לפירוט לפי קו, ולכן הסכום של הקווים קצת נמוך מהשורה של המפעיל.</li></ul></details>`;
function renderDepBody() {
  const el = $('#dep-body'); if (!el) return;
  if (depLine) return renderDepLine(el);
  const scope = depAg || depCl;
  const rows = scope ? depGroups() : Object.entries(M.A).map(([nm, s]) => depRow(nm, [s]));
  rows.sort((a, b) => b.sched - a.sched);
  const T = depRow('סה״כ', rows);
  const title = depAg && depCl ? `${depAg} · אשכול ${depCl}` : depAg || (depCl ? 'אשכול ' + depCl : 'כל המפעילים');
  const show = rows.slice(0, 400);
  el.innerHTML = `<div class="dephead"><h3>${esc(title)}</h3><span>${esc(periodTxt())}</span>${depButtons()}</div>
    ${depTiles(T)}
    <div class="tblbox depfull"><table><thead><tr><th>${scope ? 'קו' : 'מפעיל'}</th>${scope ? '<th>מסלול</th>' + (depAg ? '' : '<th>מפעיל</th>') : ''}${DEPH.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
    show.map(r => `<tr><td class="nm${scope ? ' nmc' : ''}">${scope ? `<button class="linebtn" data-dl="${esc(r.key)}" title="דוח היציאות של הקו">${esc(r.short)}</button>` : `<button class="linebtn" data-dag="${esc(r.nm)}" title="הקווים של המפעיל">${esc(r.nm)}</button>`}</td>${scope ? `<td class="rtn">${esc(routeName(r.long) || r.long)}</td>${depAg ? '' : `<td style="font-size:12px">${esc(r.agency)}</td>`}` : ''}${depCells(r)}</tr>`).join('') +
    `</tbody></table></div>${rows.length > show.length ? `<p class="mut">מוצגים ${num(show.length)} מתוך ${num(rows.length)} — כולם בקובץ להורדה.</p>` : ''}
    <p class="note">${scope ? 'קו = כל הכיוונים והחלופות שלו (לפי המק״ט). לחיצה על מספר הקו פותחת את הדוח שלו: לפי כיוון, לפי שעה ולפי נסיעה.' : 'לחיצה על מפעיל מציגה את הקווים שלו. אפשר גם לבחור אשכול או לחפש מספר קו.'}</p>${DEP_NOTE}`;
  el.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => { depLine = b.dataset.dl; setHash(); renderDepBody(); $('#dep-box').scrollIntoView({behavior: 'smooth', block: 'start'}); });
  el.querySelectorAll('[data-dag]').forEach(b => b.onclick = () => { depAg = b.dataset.dag; setHash(); renderDep(); });
  bindDepButtons(() => csvDownload(`דוח-יציאות-${title}-${M.days[0]}-${M.days[M.days.length - 1]}.csv`.replace(/[\\/:*?"<>|\s]+/g, '-'),
    [[`דוח יציאות מתחנת המוצא — ${title}`], [periodTxt()], [],
      [scope ? 'קו' : 'מפעיל', ...(scope ? ['מק"ט', 'מסלול', 'מפעיל', 'אשכול'] : []), ...DEPH],
      ...rows.map(r => [scope ? r.short : r.nm, ...(scope ? [r.key, routeName(r.long) || r.long, r.agency, r.cluster] : []), ...depCsv(r)]),
      ['סה״כ', ...(scope ? ['', '', '', ''] : []), ...depCsv(T)]]));
}
function depTiles(T) {
  return `<div class="stat-row">
    <div><b>${T.meas ? pct(T.on, T.meas) : '—'}</b><span>יצאו בזמן · ${num(T.on)} מתוך ${num(T.meas)} יציאות שנמדדו</span></div>
    <div><b>${num(T.sched)}</b><span>נסיעות בלו״ז</span></div>
    <div><b>${T.meas ? pc1(T.early, T.meas) : '—'}</b><span>יצאו מוקדם · ${num(T.early)} נסיעות</span></div>
    <div><b>${T.sched ? pct(T.miss, T.sched) : '—'}</b><span>לא נצפו · ${num(T.miss)} נסיעות</span></div>
    <div><b>${T.meas ? pct(T.late, T.meas) : '—'}</b><span>יצאו באיחור · ${num(T.late)} נסיעות</span></div>
  </div>`;
}
function renderDepLine(el) {
  const rs = Object.values(M.Rr).filter(s => lineKeyOf(s.rid) === depLine);
  if (!rs.length) { el.innerHTML = `<div class="empty">הקו לא נמדד בתקופה שנבחרה. <button class="lnk" id="dep-back">חזרה לרשימה</button></div>`; $('#dep-back').onclick = () => { depLine = ''; setHash(); renderDepBody(); }; return; }
  rs.sort((a, b) => b.sched - a.sched);
  const l = lineLabel(rs[0].rid), T = depRow(l.short, rs);
  const dirs = rs.map(s => { const x = lineLabel(s.rid); return depRow(x.long, [s], {rid: s.rid, dir: x.dir, alt: x.alt && x.alt !== '#' && x.alt !== '0' ? x.alt : ''}); });
  const days = M.days, my = ++depLoadId;
  const title = `קו ${l.short} · ${l.agency}`;
  el.innerHTML = `<div class="dephead"><h3>דוח יציאות · ${esc(title)}</h3><span>${l.cluster ? 'אשכול ' + esc(l.cluster) + ' · ' : ''}${/^r/.test(depLine) ? '' : 'מק״ט ' + esc(depLine) + ' · '}${esc(periodTxt())}</span>${depButtons()}<button class="closebtn noprint" id="dep-x">✕ לכל הקווים</button></div>
    ${depTiles(T)}
    <div class="ptitle" style="margin-top:12px">לפי כיוון</div>
    <div class="tblbox depfull"><table><thead><tr><th>כיוון</th><th>מסלול</th>${DEPH.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
    dirs.map(r => `<tr><td><a class="linebtn" data-rid="${esc(r.rid)}" href="${tabHref('line', {line: r.rid})}" title="מדד הדיוק של הכיוון">${esc(r.dir || '—')}${r.alt ? ' · ' + esc(r.alt) : ''}</a></td><td class="rtn">${esc(routeName(r.nm) || r.nm)}</td>${depCells(r)}</tr>`).join('') +
    `</tbody></table></div><div id="dep-detail"><div class="msg">טוען את הנסיעות… <span id="dep-prog"></span></div></div>${DEP_NOTE}`;
  $('#dep-x').onclick = () => { depLine = ''; setHash(); renderDepBody(); };
  el.querySelectorAll('.linebtn[data-rid]').forEach(b => b.onclick = e => { if (nv(e)) goLine(b.dataset.rid); });
  const csvBase = () => [[`דוח יציאות מתחנת המוצא — ${title}`], [periodTxt()], [], ['כיוון', 'מסלול', ...DEPH], ...dirs.map(r => [r.dir, routeName(r.nm) || r.nm, ...depCsv(r)]), ['סה״כ', '', ...depCsv(T)]];
  const fname = `דוח-יציאות-קו-${l.short}-${l.agency}-${days[0]}-${days[days.length - 1]}.csv`.replace(/[\\/:*?"<>|\s]+/g, '-');
  bindDepButtons(() => csvDownload(fname, csvBase()));
  loadDep(days, (a, b) => { const p = $('#dep-prog'); if (p) p.textContent = `${a} מתוך ${b} ימים`; }).then(() => {
    if (my !== depLoadId || tab !== 'dep') return;
    const box = $('#dep-detail'); if (!box) return;
    const have = days.filter(d => depCache[d]);
    if (!have.length) { box.innerHTML = '<div class="ptitle" style="margin-top:14px">לפי שעה ולפי נסיעה</div><div class="empty">הפירוט לפי שעה ולפי נסיעה נשמר מהימים שמעובדים מ-24.11.2026. הסיכום למעלה — מכל הימים בתקופה.</div>'; return; }
    const dirOf = Object.fromEntries(dirs.map(r => [r.rid, r.dir + (r.alt ? ' · ' + r.alt : '')]));
    const trips = [];
    for (const d of have) for (const r of rs) { const a = depCache[d][r.rid]; if (!a) continue; for (let i = 0; i < a.length; i += 2) trips.push({d, rid: r.rid, m: a[i], v: a[i + 1]}); }
    const H = new Map();
    for (const t of trips) {
      const h = Math.floor(t.m / 60), x = H.get(h) || {h, sched: 0, miss: 0, nomeas: 0, meas: 0, early: 0, on: 0, late: 0};
      x.sched++;
      if (t.v === null) x.miss++; else if (typeof t.v !== 'number') x.nomeas++;
      else { x.meas++; if (t.v < DEP_EARLY) x.early++; else if (t.v > DEP_LATE) x.late++; else x.on++; }
      H.set(h, x);
    }
    const hrs = [...H.values()].sort((a, b) => a.h - b.h);
    const hh = h => String(h % 24).padStart(2, '0') + ':00';
    const tm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const meas = trips.filter(t => typeof t.v === 'number');
    const late = meas.filter(t => t.v > DEP_LATE).sort((a, b) => b.v - a.v);
    const early = meas.filter(t => t.v < DEP_EARLY).sort((a, b) => a.v - b.v);
    const miss = trips.filter(t => t.v === null).sort((a, b) => a.d.localeCompare(b.d) || a.m - b.m);
    const dmin = v => (v > 0 ? '+' : '−') + Math.round(Math.abs(v) / 60) + ' דק׳';
    const cover = have.length < days.length ? ` לפי ${num(have.length)} מתוך ${num(days.length)} ימים (הפירוט נשמר מ-${dmy(have[0])}).` : '';
    const tripTbl = (list, n, withDelay) => `<div class="tblbox depfull"><table><thead><tr><th>יום</th><th>שעה בלו״ז</th><th>כיוון</th>${withDelay ? '<th>יצאה</th>' : ''}</tr></thead><tbody>${list.slice(0, n).map(t => `<tr><td>${heDate(t.d)}</td><td>${tm(t.m)}</td><td>${esc(dirOf[t.rid] || '')}</td>${withDelay ? `<td class="${t.v > 0 ? 'd4' : 'd0'}"><b>${dmin(t.v)}</b></td>` : ''}</tr>`).join('')}</tbody></table></div>${list.length > n ? `<p class="mut">מוצגות ${num(n)} מתוך ${num(list.length)} — כולן בקובץ להורדה.</p>` : ''}`;
    box.innerHTML = `<div class="ptitle" style="margin-top:14px">לפי שעת היציאה בלו״ז</div><p class="pdesc">${num(trips.length)} נסיעות בלו״ז.${cover}</p>
      <div class="tblbox depfull"><table><thead><tr><th>שעה</th><th>נסיעות בלו״ז</th><th>לא נצפו</th><th>נצפו, יציאה לא נמדדה</th><th>יציאה נמדדה</th><th>בזמן</th><th>מוקדם</th><th>באיחור</th></tr></thead><tbody>${hrs.map(x => `<tr><td><b>${hh(x.h)}</b></td><td>${num(x.sched)}</td><td class="${missCls(x.sched ? x.miss / x.sched : null)}">${num(x.miss)}</td><td>${num(x.nomeas)}</td><td>${num(x.meas)}</td><td>${onCell(x.meas ? x.on / x.meas : null)}</td><td>${x.early ? `<span class="d0">${num(x.early)}</span>` : '0'}</td><td>${x.late ? `<span class="d4">${num(x.late)}</span>` : '0'}</td></tr>`).join('')}</tbody></table></div>
      <div class="cols2 depcols"><div><div class="ptitle" style="margin-top:14px">יצאו הכי מאוחר</div>${late.length ? tripTbl(late, 25, true) : '<div class="empty">אין נסיעות שיצאו יותר מ-5 דק׳ באיחור</div>'}</div>
      <div><div class="ptitle" style="margin-top:14px">יצאו מוקדם</div>${early.length ? tripTbl(early, 25, true) : '<div class="empty">אין נסיעות שיצאו יותר מ-2 דק׳ לפני הזמן</div>'}</div></div>
      <details class="bmore"${miss.length && miss.length <= 30 ? ' open' : ''}><summary>הנסיעות שלא נצפו (${num(miss.length)})</summary>${miss.length ? tripTbl(miss, 200, false) : '<div class="empty">כל הנסיעות נצפו</div>'}</details>`;
    const stat = t => t.v === null ? 'לא נצפתה' : typeof t.v !== 'number' ? 'נצפתה, היציאה לא נמדדה' : t.v < DEP_EARLY ? 'מוקדם' : t.v > DEP_LATE ? 'באיחור' : 'בזמן';
    bindDepButtons(() => csvDownload(fname, [...csvBase(), [], ['לפי נסיעה' + (cover ? ' —' + cover : '')], ['יום', 'שעה בלו"ז', 'כיוון', 'מסלול', 'מצב', 'פער ביציאה (דקות)'],
      ...trips.slice().sort((a, b) => a.d.localeCompare(b.d) || a.m - b.m).map(t => [t.d, tm(t.m), dirOf[t.rid] || '', routeName(lineLabel(t.rid).long), stat(t), typeof t.v === 'number' ? Math.round(t.v / 6) / 10 : ''])]));
  });
}

function init() {
  $('#method').innerHTML = METHOD;
  const today = fetchToday();
  Promise.all([load(DATA + 'index.json'), load(DATA + 'routes.json').catch(() => ({})), (SHOW_GPS_FREQ ? load(DATA + 'gps.json').catch(() => null) : null)]).then(([idx, cat, gps]) => {
    IDX = idx; CAT = cat || {}; GPS = gps && gps.v ? gps : null;
    // רק ימים אמיתיים (YYYY-MM-DD): קובץ ערים שנכנס בטעות לאינדקס הפיל את העמוד (08.09)
    DAYS = (idx.days || []).map(d => typeof d === 'string' ? {d} : d).filter(d => d.d && /^\d{4}-\d{2}-\d{2}$/.test(d.d));
    if (!DAYS.length) { $('#app').innerHTML = '<div class="msg">עדיין אין ימים מחושבים.</div>'; $('#sub').textContent = ''; return; }
    // היום — לא מחכים לו יותר משתי שניות (ענף bus-today ב-GitHub); אם יגיע אחר כך, הוא נוסף לבחירה ברענון
    return Promise.race([today, new Promise(r => setTimeout(() => r(null), 2000))]).then(j => { TODAY = j && !DAYS.some(d => d.d === j.d) ? j : null; start(); });
  }).catch(e => { $('#app').innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; });
  function start() {
    const [h, t, q] = decodeURIComponent((location.hash || '').slice(1)).split('/');
    if (q) { const u = new URLSearchParams(q); if (u.get('stop') && u.get('tile')) STOPQ = {stop: u.get('stop'), tile: u.get('tile'), h: u.has('h') ? +u.get('h') : null};
      if (u.get('line')) openLine = u.get('line');
      if (u.get('cl')) { cluster = u.get('cl'); rank = rank || 'worst'; }
      if (u.get('ag')) { agency = u.get('ag'); rank = rank || 'worst'; }
      if (u.get('city')) openCity = u.get('city');
      if (u.get('rg')) openRegion = u.get('rg');
      if (u.get('st')) stopSel = u.get('st');
      if (u.get('dag')) depAg = u.get('dag');
      if (u.get('dcl')) depCl = u.get('dcl');
      if (u.get('dl')) depLine = u.get('dl'); }
    dayD = DAYS.some(d => d.d === h) || isTodayD(h) ? h : DAYS[DAYS.length - 1].d;
    if (t) tab = t;
    const pm = /^(7|30)(?:-(wk|fri|sat))?$/.exec(h || '');
    period = pm && DAYS.length >= 3 && (pm[1] === '7' || DAYS.length > 7) ? pm[1] : 'day';
    if (pm && period !== 'day') dtype = pm[2] || '';
    render();
    setInterval(() => { if (document.visibilityState === 'visible') refreshToday(); }, TODAY_EVERY);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - todayAt > TODAY_EVERY) refreshToday(); });
  }
}
// מסלולים ותחנות של היום שעוד אין בקטלוג (קו חדש) — מ-days/D.cat.json
function todayCat(c) { for (const [k, v] of Object.entries((c && c.r) || {})) if (!CAT[k]) CAT[k] = v; TNAMES = (c && c.s) || {}; }
// רענון: עדכון חדש של היום — אם היום מוצג (ולא מקלידים בחיפוש), נטען מחדש; אחרת רק התווית בבחירת היום
let todayAt = Date.now();
function refreshToday() {
  todayAt = Date.now();
  fetchToday().then(j => {
    if ((j && j.updated) === (TODAY && TODAY.updated)) return;
    const showing = period === 'day' && isTodayD(dayD);
    if (showing && document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (TODAY) [dayCache, stopCache, coverCache, cityCache, regionCache, depCache].forEach(c => { delete c[TODAY.d]; });
    TODAY = j;
    if (showing) { if (!TODAY) dayD = DAYS[DAYS.length - 1].d; render(); } else renderPeriods();
  });
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
