/* האוטובוס הבא — בזמן אמת.
   הכל בדפדפן, בלי שרת ובלי מפתחות:
   - Open Bus Stride (הסדנא לידע ציבורי): השרת החדש d2uqtzxw09mygh.cloudfront.net (איחור ~3 דק'),
     ואם הוא נופל — open-bus-stride-api.hasadna.org.il (איחור ~15 דק'). התשובות שמורות ב-CDN רבע שעה,
     ולכן כל בקשה מקבלת פרמטר חד-פעמי (_).
   - פרטי הרכב: fleet/data/fleet.json ו-fleet-official.json של צי הרכבים, ו-gov-details-N.json למושבים
     של רכבים שאינם במאגר "ציי רכב אוטובוסים" (רכבי קבלן).
   "יספיק?" — הערכה: כמה זמן לוקח בדרך כלל מהנקודה שבה האוטובוס נמצא עד סוף הנסיעה (לפי עד שש נסיעות
   שהסתיימו ביומיים האחרונים באותו קו ובאותו כיוון, הכי קרובות לשעה הנוכחית), מול שעת היציאה של הנסיעה
   הבאה שלו. */
'use strict';

const BASES = [
  { url: 'https://d2uqtzxw09mygh.cloudfront.net', name: 'Open Bus — השרת המהיר', lag: 3 },
  { url: 'https://open-bus-stride-api.hasadna.org.il', name: 'Open Bus — השרת הראשי (איטי יותר)', lag: 15 },
];
let BI = 0, BI_SINCE = 0;
const DEBUG = /debug/.test(location.search);
const MIN = 60000, HOUR = 3600000;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const hm = ms => new Date(ms).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
const ilDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const ilDate = (dd = 0) => ilDay(Date.now() + dd * 864e5);
const median = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const norm = p => String(p || '').replace(/\D/g, '').replace(/^0+/, '');
const T = s => Date.parse(s);
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const km = m => (m / 1000).toLocaleString('he-IL', { maximumFractionDigits: m < 10000 ? 1 : 0 });

class ApiErr extends Error {}

// רק דן בדרום (31) ודן באר שבע (32): רק הן משדרות מראש איזה רכב ייסע בכל נסיעה, וזה מה שהדף מוסיף על
// כל אפליקציה אחרת (שלמה 23.11). קווים, תחנות ורכבים של חברות אחרות — הודעה קצרה במקום תוצאות
const OPS = new Set(['31', '32']);
const ours = op => OPS.has(String(op));
const ONLY = 'כרגע האתר עובד רק בקווים של דן בדרום ודן באר שבע — רק הן מודיעות מראש איזה אוטובוס ייסע.';

async function api(path, params, timeout = 35000) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') qs.set(k, v);
  qs.set('_', Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  // אחרי עשר דקות על השרת הגיבוי — מנסים שוב את המהיר
  if (BI > 0 && Date.now() - BI_SINCE > 10 * MIN) { BI = 0; showSrc(); }
  for (let tries = 0; tries < 2; tries++) {
    const bi = BI, b = BASES[bi];
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), timeout);
    try {
      const t0 = performance.now();
      const r = await fetch(b.url + path + '?' + qs, { signal: ctl.signal });
      clearTimeout(tm);
      if (DEBUG) console.warn('api', path, Math.round(performance.now() - t0) + 'ms', qs.toString().slice(0, 160));
      if (r.ok) return await r.json();
      if (r.status >= 400 && r.status < 500) {
        const j = await r.json().catch(() => null);
        throw new ApiErr((j && j.detail && (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail))) || 'HTTP ' + r.status);
      }
      throw new Error('HTTP ' + r.status);
    } catch (e) {
      clearTimeout(tm);
      if (e instanceof ApiErr) throw e;
      if (bi < BASES.length - 1 && tries === 0) { if (BI === bi) { BI = bi + 1; BI_SINCE = Date.now(); showSrc(); } continue; }
      throw e;
    }
  }
}

/* ---------- גיל הנתונים ---------- */
let SNAP = null; // זמן התמונה האחרונה שנטענה (ms)
async function loadSnap() {
  try {
    const r = await api('/siri_snapshots/list', { limit: 6, order_by: 'id desc' }, 15000);
    const s = (r || []).find(x => x.etl_status === 'loaded') || (r || [])[0];
    if (s) { const [y, mo, d, h, mi] = s.snapshot_id.split('/').map(Number); SNAP = Date.UTC(y, mo - 1, d, h, mi); }
  } catch (e) { /* לא קריטי */ }
  showAge();
}
function showAge() {
  const el = $('#age');
  if (BUSY || !SNAP) { el.innerHTML = `${DOTS}${SNAP ? 'מתעדכן…' : 'טוען…'}`; el.classList.add('busy'); return; }
  el.classList.remove('busy');
  const ago = Math.max(0, Math.round((Date.now() - SNAP) / MIN));
  el.innerHTML = `<span class="live${ago > 12 ? ' old' : ''}"></span>${ago <= 5 ? 'חי' : 'מעודכן'} · ${hm(SNAP)}${ago ? ` · לפני ${ago} דק׳` : ''}${BI > 0 ? ' · שרת גיבוי' : ''}`;
  el.title = 'השעה של תמונת המצב האחרונה מ-Open Bus';
  showSrc();
}
function showSrc() {
  const b = BASES[BI];
  $('#src').textContent = `שרת הנתונים כרגע: ${b.name} · ${b.url.replace('https://', '')}` + (SNAP ? ` · תמונת מצב אחרונה ${hm(SNAP)}` : '');
}
const freshCut = () => (SNAP || Date.now() - 3 * MIN) - 6 * MIN;

/* ---------- האינדקס הקטן ----------
   live-bus/index.json נבנה בכל פריסה (tools/live_bus_index.py) ומחזיק רק מה שהדף צריך מצי הרכבים, מהקו בזמן
   ומהנסועה של משרד התחבורה — כ-260KB מכווץ, במקום כ-1.5MB של fleet.json, fleet-official.json ו-lines.json
   (ועוד gov-details-N.json). כשאין אינדקס, או שחסר בו חלק — אותו חלק נטען מהקבצים הגדולים, כמו קודם. */
let idxP = null;
function loadIndex() {
  if (!idxP) idxP = (async () => {
    const urls = ['index.json'];
    if (!/kavbochan\.app$/.test(location.hostname)) urls.push('https://kavbochan.app/live-bus/index.json');
    for (const u of urls) {
      try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); if (j && j.v === 1) return j; } } catch (e) { /* הבא */ }
    }
    return null;
  })();
  return idxP;
}

/* ---------- צי הרכבים ---------- */
const TNAMES = { 'צבורי עירוני': 'אוטובוס עירוני', 'צבורי בין-עירוני': 'אוטובוס בין-עירוני', 'צבורי להסע מיוחד': 'אוטובוס הסעות',
  'זעצ הסעות מיוחדות': 'מיניבוס הסעות', 'זעיר צבורי': 'מיניבוס', 'זעיר צבורי סיור': 'מיניבוס תיור', 'צבורי עיר מפרק': 'אוטובוס מפרקי',
  'צבורי בע קומתים': 'אוטובוס דו-קומתי', 'עירוני קומותיים': 'אוטובוס דו-קומתי עירוני', 'צבורי לסיור': 'אוטובוס תיור', 'פרטי': 'אוטובוס פרטי' };
const fixT = t => { if (!t) return ''; const c = t.replace(/["״]/g, '').replace(/\s+/g, ' ').trim().replace(/^אוטובוס /, ''); return TNAMES[c] || t.replace('צבורי', 'ציבורי'); };
const kabType = t => !!t && /הסע|מיוחד|סיור|טיולית|פרטי|תיור/.test(t);
// veh/vs/nocov — מהאינדקס; idx/ofc/cov/gov — מהקבצים הגדולים (כשאין אינדקס). ready — אחד מהם נטען
const FLEET = { ready: false, veh: null, vs: null, nocov: null, hasOfc: false, idx: null, ofc: null, ops: {}, cov: {}, gov: {}, updated: null, failed: false };
async function getJSON(rel) {
  const urls = [rel, 'https://kavbochan.app/' + rel.replace(/^(\.\.\/)+/, '')];
  for (const u of urls) {
    try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) { /* הבא */ }
  }
  return null;
}
let fleetP = null;
function loadFleet() {
  if (fleetP) return fleetP;
  fleetP = (async () => {
    const ix = await loadIndex();
    if (ix && ix.veh) {
      Object.assign(FLEET, { veh: ix.veh, vs: ix.vs || [''], ops: ix.ops || {}, nocov: new Set(ix.nocov || []), hasOfc: !!ix.ofc, updated: ix.fleet_updated, ready: true });
      return;
    }
    const [f, o] = await Promise.all([getJSON('../fleet/data/fleet.json'), getJSON('../fleet/data/fleet-official.json')]);
    if (!f) { FLEET.failed = true; return; }
    const off = f.v === 2 ? 1 : 0, idx = {};
    FLEET.updated = f.updated;
    FLEET.ofc = o && o.of ? o.of : null;
    for (const op of f.operators) {
      FLEET.ops[op.ref] = op.name;
      let inOfc = 0;
      for (const v of op.vehicles) {
        const p = norm(v[0]);
        if (FLEET.ofc && FLEET.ofc[p]) inOfc++;
        const rec = { op: op.ref, opName: op.name, last: v[2], year: v[3 + off], model: v[4 + off], type: v[6 + off] };
        if (!idx[p] || idx[p].last < rec.last) idx[p] = rec;
      }
      // חברה שהמאגר לא מכסה בכלל — לא קובעים "קבלן" רק כי הרכב לא במאגר (כמו בצי הרכבים)
      FLEET.cov[op.ref] = !(FLEET.ofc && !inOfc && op.vehicles.length >= 10);
    }
    FLEET.idx = idx;
    FLEET.hasOfc = !!FLEET.ofc;
    FLEET.ready = true;
  })();
  return fleetP;
}
const SHARDS = {};
function shard(d) {
  if (!SHARDS[d]) SHARDS[d] = getJSON(`../fleet/data/gov-details-${d}.json`).then(j => j || {});
  return SHARDS[d];
}
// מושבים לרכבים שאינם במאגר הרשמי (בעיקר קבלן) — מהרישוי, בעצלתיים
async function ensureSeats(plates) {
  await loadFleet();
  if (FLEET.veh || !FLEET.idx) return; // באינדקס המושבים כבר בפנים
  const need = plates.map(norm).filter(p => p && !(FLEET.ofc && FLEET.ofc[p] && FLEET.ofc[p][1]) && !(p in FLEET.gov));
  const ds = [...new Set(need.map(p => p.slice(-1)))].slice(0, 4);
  await Promise.all(ds.map(async d => {
    const s = await shard(d);
    for (const p of need) if (p.slice(-1) === d) { const g = s[p]; FLEET.gov[p] = g ? (+g.mispar_moshavim || +g.mispar_mekomot || null) : null; }
  }));
}
function sizeLbl(o5, type) {
  const t = type || '';
  if (/קומ/.test(t)) return 'דו-קומתי';
  if (o5) {
    if (o5.startsWith('מפרקי')) return 'מפרקי (אקורדיון)';
    if (o5 === 'מיניבוס' || o5 === 'מידיבוס') return o5;
    if (o5 === 'אוטובוס') return 'אוטובוס רגיל';
  }
  if (/זעיר|מיניבוס/.test(t)) return 'מיניבוס';
  if (/מפרק/.test(t)) return 'מפרקי (אקורדיון)';
  return t ? 'אוטובוס רגיל' : '';
}
// רשומת רכב אחידה — מהאינדקס (tools/live_bus_index.py, אותו חישוב) או מהקבצים הגדולים.
// fop: החברה שבצי הרכבים (null — לא בצי), inOfc: במאגר "ציי רכב אוטובוסים", kt: סוג רכב של הסעות/תיור
function vrec(p) {
  if (FLEET.veh) {
    const r = FLEET.veh[p];
    if (!r) return null;
    const s = i => FLEET.vs[i || 0] || '';
    return { fop: r[0] != null ? r[0] : null, inOfc: r[1] === 2, kt: r[1] === 1, seats: r[2] || null, size: s(r[3]), year: r[4], model: s(r[5]), kind: s(r[6]), prop: s(r[7]) };
  }
  const f = FLEET.idx && FLEET.idx[p], o = FLEET.ofc && FLEET.ofc[p];
  if (!f && !o) return null;
  const type = f ? fixT(f.type) : '';
  return { fop: f ? f.op : null, inOfc: !!o, kt: !!f && kabType(type), seats: (o && +o[1]) || FLEET.gov[p] || null, size: sizeLbl(o && o[5], type),
    year: f && f.year, model: f && f.model, kind: o && o[4] && o[4] !== 'לא ידוע' ? o[4] : '', prop: o && o[3] && o[3] !== 'לא ידוע' ? o[3] : '' };
}
// חברה שהמאגר הרשמי לא מכסה בכלל
const noCov = op => FLEET.nocov ? FLEET.nocov.has(String(op)) : FLEET.cov[op] === false;
function vinfo(plate, opRef) {
  const p = norm(plate), r = vrec(p);
  const inFleet = !!(r && r.fop != null);
  const op = opRef != null ? opRef : r && r.fop;
  let kab = null;
  if (FLEET.ready) {
    if (r && r.inOfc) kab = false;
    else if (!FLEET.hasOfc || noCov(op)) kab = inFleet ? r.kt : null;
    else kab = true;
  }
  return {
    plate: p, known: !!r, opName: (op != null && FLEET.ops[op]) || (inFleet && FLEET.ops[r.fop]) || '',
    model: r && r.model, year: r && r.year, kab, seats: r ? r.seats : null,
    size: r ? r.size : '', kind: r ? r.kind : '', prop: r ? r.prop : '',
    other: inFleet && op != null && r.fop !== op ? FLEET.ops[r.fop] || '' : '',
  };
}
// רכב קבלן (true), של החברה (false) או לא ידוע (null) — לצבע של לוחית הרישוי ושל הסמן במפה
const vkab = (plate, op) => { const v = vinfo(plate, op); return v.known && v.kab != null ? v.kab : null; };
const isKab = (plate, op) => vkab(plate, op) === true;
/* ---------- קווים ושמות ---------- */
const ROUTES = {}; // line_ref -> מסלול GTFS (או null)
async function routesFor(refs) {
  const miss = [...new Set(refs)].filter(l => l != null && !(l in ROUTES));
  await Promise.all(chunks(miss, 60).map(async part => {
    try {
      const r = await api('/gtfs_routes/list', { line_refs: part.join(','), date_from: ilDate(-1), date_to: ilDate(0), limit: 400 });
      for (const x of r) if (!ROUTES[x.line_ref] || ROUTES[x.line_ref].date < x.date) ROUTES[x.line_ref] = x;
    } catch (e) { /* בלי שם */ }
    for (const l of part) if (!(l in ROUTES)) ROUTES[l] = null;
  }));
}
function rparts(r) {
  const s = (r && r.route_long_name) || '';
  const [a, b = ''] = s.split('<->');
  const sp = x => { const i = x.lastIndexOf('-'); return i > 0 ? { stop: x.slice(0, i).trim(), city: x.slice(i + 1).trim() } : { stop: x.trim(), city: '' }; };
  return { o: sp(a), d: sp(b.replace(/-[^-]*$/, '')) };
}
/* ---------- שם הקו כמו בהקו בזמן ----------
   הפונקציות הועתקו מ-line-history/src/08-search.jsx: setKnownCities (שורה 165), fullCity (171), hsParts (181),
   routeTitle (196) — שם הן קובעות את כותרת הקו בתוצאות החיפוש (line-history/src/13-app.jsx:310).
   הנתונים: line-history/data/lines.json, לכל קו וכיוון: dest (התיאור הרשמי, "תחנה-עיר<->תחנה-עיר-כיוון"),
   hs (היעד לפרסום — מה שכתוב על השלט, "עיר_תחנה") ו-hso (השלט במוצא: היעד לפרסום של הכיוון ההפוך),
   שנבנים ב-tools/linehistory.py (בסביבת שורה 1033). routeParts היא routeTitle עצמה, רק מחזירה את החלקים
   (מוצא, יעד, עיר) במקום מחרוזת אחת — כדי להציג "ל<יעד>" גדול ו"מ<מוצא>" קטן. */
let KNOWN_CITIES = null;
function setKnownCities(lines) {
  const c = new Set();
  (lines || []).forEach((l) => String(l.dest || "").replace(/-\d+[#א-ת]?$/, "").split("<->").forEach((x) => {
    const p = x.split("-"); if (p.length > 1) { const t = p[p.length - 1].trim(); if (t) c.add(t); } }));
  KNOWN_CITIES = [...c];
}
function fullCity(city, other) {
  if (!city) return city;
  if (other && other !== city && other.startsWith(city)) return other;
  if (!KNOWN_CITIES || KNOWN_CITIES.includes(city)) return city;
  const m = KNOWN_CITIES.filter((k) => k.length > city.length && k.startsWith(city));
  if (!m.length) return city;
  const best = m.reduce((a, b) => (a.length >= b.length ? a : b));
  return m.every((k) => best.startsWith(k)) ? best : city;
}
function hsParts(h) {
  const t = String(h || "").trim();
  if (!t || /^\d+$/.test(t)) return null;
  const i = t.indexOf("_");
  if (i > 0) return { city: t.slice(0, i).trim(), stop: t.slice(i + 1).trim() };
  return KNOWN_CITIES && KNOWN_CITIES.includes(t) ? { city: t, stop: "" } : { city: "", stop: t };
}
function routeParts(dest, m) {
  if (!dest) return null;
  const sides = String(dest).replace(/-\d+[#א-ת]?$/, "").split("<->").map((x) => { const p = x.split("-"); return { stop: (p.length > 1 ? p.slice(0, -1) : p).join("-").trim(), city: p.length > 1 ? p[p.length - 1].trim() : "" }; });
  const a = sides[0], b = sides[sides.length - 1];
  if (!b || a === b) return { single: a.stop || a.city };
  a.city = fullCity(a.city, b.city); b.city = fullCity(b.city, a.city);
  const to = hsParts(m && m.hs), fr = hsParts(m && m.hso);
  const toCity = (to && to.city) || b.city, frCity = (fr && fr.city) || a.city;
  if (frCity && toCity && frCity !== toCity) {
    const side = (city, h) => city + (h && h.stop ? ", " + h.stop : "");
    return { fr: side(frCity, fr && (!fr.city || fr.city === frCity) ? fr : null), to: side(toCity, to && (!to.city || to.city === toCity) ? to : null) };
  }
  const city = toCity || frCity;
  const from = (fr && fr.stop) || a.stop, to2 = (to && to.stop) || b.stop;
  const base = (x) => String(x || "").split("/")[0].trim();
  if (from && (from === to2 || (base(from).length > 3 && base(from) === base(to2))))
    return { city, fr: from === to2 ? from : base(from), circ: true };
  return { city, fr: from, to: to2 };
}
// routeTitle כמו בהקו בזמן — לכותרת המלאה (title של הכרטיס)
function routeTitle(dest, m) {
  const p = routeParts(dest, m);
  if (!p) return "";
  if (p.single != null) return p.single;
  if (p.circ) return (p.city ? p.city + ", " : "") + p.fr + " (מעגלי)";
  return (p.city ? p.city + ": " : "") + p.fr + " – " + p.to;
}
// אינדקס הקווים של הקו בזמן — לפי מק"ט-כיוון-חלופה, ולפי מק"ט-כיוון לחלופה הראשית.
// מהאינדקס הקטן (הקווים הפעילים וערי היעד), ובלעדיו מ-lines.json (‎1.1MB מכווץ)
const LH = {};
let lhP = null;
function addLH(l) {
  const q = String(l.rd).split('-');
  if (q.length < 3 || !/^\d+$/.test(q[0])) return;
  LH[l.rd] = l;
  const k = q[0] + '-' + q[1];
  if (!LH[k] || q[2] === '#' || q[2] === '0') LH[k] = l;
}
function loadLH() {
  if (!lhP) lhP = loadIndex().then(ix => {
    if (ix && ix.lines && ix.cities) {
      KNOWN_CITIES = ix.cities;
      const term = ix.term || {};
      for (const [rd, dest, hs, hso] of ix.lines) addLH({ rd, dest, hs, hso, term: term[rd] });
      return;
    }
    return getJSON('../line-history/data/lines.json').then(j => {
      const L = (j && j.lines) || [];
      setKnownCities(L);
      for (const l of L) if (!(l.historicalOnly || l.observationOnly || l.lk === 'removed')) addLH(l);
    });
  }).catch(() => {});
  return lhP;
}
/* ---------- נוסעים בקו — כמו בקו פח (kavpach/src/05-shared-ui.jsx, RidershipBlock) ----------
   מהמאגר "נסועה בקווי אוטובוס" של משרד התחבורה (kavpach-ridership.json, tools/kavpach_ridership.py):
   נוסעים בשבוע ברבעון האחרון שיש לו נתונים, כל הכיוונים יחד. ממוצע לנסיעה — רק כשבמאגר יש גם מספר נסיעות. */
const QHE = ['', 'א', 'ב', 'ג', 'ד'];
let RIDE = null, rideP = null;
function loadRide() {
  if (!rideP) rideP = loadIndex().then(async ix => {
    if (ix && ix.ride && ix.rq) { RIDE = { q: ix.rq, m: ix.ride }; return; }
    const d = await getJSON('../kavpach-ridership.json');
    if (!d || !d.m || !d.q) return;
    const m = {};
    for (const [mk, e] of Object.entries(d.m)) {
      const w = e.w || [];
      let i = w.length - 1;
      while (i >= 0 && w[i] == null) i--;
      if (i >= 0 && i < d.q.length) m[String(mk).replace(/^0+/, '')] = e.r ? [w[i], i, e.r] : [w[i], i];
    }
    RIDE = { q: d.q, m };
  }).catch(() => {});
  return rideP;
}
function rideHTML(mkt) {
  const e = RIDE && RIDE.m[String(mkt || '').replace(/^0+/, '')];
  if (!e || !(e[0] > 0)) return '';
  const q = RIDE.q[e[1]] || '', lab = q ? `רבעון ${QHE[+q.slice(-1)] || ''}׳ ${q.slice(0, 4)}` : '';
  const per = e[2] > 0 ? Math.round(e[0] / e[2]) : null;
  return `<span class="ride" title='מקור: "נסועה בקווי אוטובוס", משרד התחבורה · כל הכיוונים יחד'>כ-${Math.round(e[0]).toLocaleString('he-IL')} נוסעים בשבוע${per != null ? ` · כ-${per.toLocaleString('he-IL')} בממוצע בנסיעה` : ''}${lab ? ` (${lab})` : ''}</span>`;
}
// מוצא ויעד של מסלול GTFS, לפי הקו בזמן; בלי האינדקס — מהתיאור הרשמי בלבד (אותה פונקציה, בלי שלטים)
function ends(r) {
  if (!r) return { fr: '', to: '' };
  const m = LH[r.route_mkt + '-' + r.route_direction + '-' + r.route_alternative] || LH[r.route_mkt + '-' + r.route_direction] || null;
  const dest = (m && m.dest) || r.route_long_name;
  const p = routeParts(dest, m) || { single: '' };
  if (p.single != null) return { fr: '', to: p.single, title: p.single };
  return { ...p, title: routeTitle(dest, m) };
}
// "לבאר שבע", "מתמר"; לפני מספר, גרש או אות לועזית — עם מקף
const pre = (p, x) => x ? (/^[א-ת][א-ת]*[\s/,-]|^[א-ת]+$/.test(x) ? p + x : p + '-' + x) : '';
function toLabel(r) { const e = ends(r); return e.circ ? 'קו מעגלי' : pre('ל', e.to); }
// היעד (כמו על השלט) גדול, המוצא קטן מתחתיו
const endsHTML = e => e.circ ? `<span class="e1">${esc(e.fr)} (מעגלי)</span>`
  : `<span class="e1">${esc(pre('ל', e.to))}</span>${e.fr ? `<span class="e2">${esc(pre('מ', e.fr))}</span>` : ''}`;
const lineName = ref => { const r = ROUTES[ref]; return r ? r.route_short_name : '?'; };

/* ---------- משך נסיעה ("פרופיל" לכל קו וכיוון) ---------- */
const PROF = {}; // line_ref -> {samples, medDur, L, apiDur}
const PROFP = {};
// לא יותר מארבע בקשות כבדות במקביל — שלא נעמיס על השרת של הסדנא
let RUNNING = 0;
const QUEUE = [];
function limited(fn) {
  return new Promise((res, rej) => {
    const run = () => { RUNNING++; fn().then(res, rej).finally(() => { RUNNING--; const n = QUEUE.shift(); if (n) n(); }); };
    if (RUNNING < 4) run(); else QUEUE.push(run);
  });
}
function buildSample(locs) {
  const pts = locs.filter(x => x.distance_from_journey_start != null).map(x => [x.distance_from_journey_start, T(x.recorded_at_time)]).sort((a, b) => a[1] - b[1]);
  if (pts.length < 6) return null;
  const L = Math.max(...pts.map(p => p[0]));
  if (L < 800) return null;
  const si = pts.findIndex(p => p[0] > 150);
  const ei = pts.findIndex(p => p[0] >= L - Math.max(300, L * 0.02));
  if (si < 0 || ei <= si) return null;
  const tS = pts[si][1] - 30000, tE = pts[ei][1];
  if (tE - tS < 3 * MIN || tE - tS > 5 * HOUR) return null;
  const prof = [[0, tS]];
  let md = 0;
  for (let i = si; i <= ei; i++) if (pts[i][0] > md) { md = pts[i][0]; prof.push([md, pts[i][1]]); }
  return { L, tS, tE, dur: tE - tS, prof };
}
function remainingFrom(s, d) {
  if (d >= s.L) return 0;
  const p = s.prof;
  for (let i = 1; i < p.length; i++) {
    if (p[i][0] >= d) {
      const [d0, t0] = p[i - 1], [d1, t1] = p[i];
      const t = d1 > d0 ? t0 + (t1 - t0) * (d - d0) / (d1 - d0) : t1;
      return s.tE - t;
    }
  }
  return 0;
}
function ensureProfiles(refs) {
  const now = Date.now();
  const miss = [...new Set(refs)].filter(l => l != null && !PROFP[l]);
  if (miss.length) {
    const p = (async () => {
      let rides = [];
      try {
        rides = await api('/siri_rides/list', { siri_route__line_refs: miss.join(','), scheduled_start_time_from: iso(now - 2 * 864e5), scheduled_start_time_to: iso(now - 2 * HOUR), limit: 4000 });
      } catch (e) { rides = []; }
      const tod = ms => (ms + 2 * HOUR) % 864e5; // שעה ביום (בערך, לפי ישראל)
      const tn = tod(now);
      await Promise.all(miss.map(async l => {
        const mine = rides.filter(r => r.siri_route__line_ref === l && r.duration_minutes && r.last_vehicle_location_id);
        const apiDur = median(mine.map(r => r.duration_minutes)) ;
        const pick = mine.map(r => { const d = Math.abs(tod(T(r.scheduled_start_time)) - tn); return [Math.min(d, 864e5 - d), r]; })
          .sort((a, b) => a[0] - b[0]).slice(0, 6).map(x => x[1]);
        const out = { samples: [], medDur: null, L: null, apiDur: apiDur ? apiDur * MIN : null, n: mine.length };
        if (pick.length) {
          try {
            const locs = await limited(() => api('/siri_vehicle_locations/list', { siri_rides__ids: pick.map(r => r.id).join(','), order_by: 'recorded_at_time asc', limit: 2500 }));
            const by = {};
            for (const x of locs) (by[x.siri_ride__id] = by[x.siri_ride__id] || []).push(x);
            for (const id in by) { const s = buildSample(by[id]); if (s) out.samples.push(s); }
          } catch (e) { /* נשארים עם הממוצע מה-API */ }
        }
        if (out.samples.length) { out.medDur = median(out.samples.map(s => s.dur)); out.L = median(out.samples.map(s => s.L)); }
        PROF[l] = out;
      }));
    })();
    for (const l of miss) PROFP[l] = p;
  }
  return Promise.all([...new Set(refs)].filter(l => l != null).map(l => PROFP[l]));
}
// מתי צפוי להסתיים הנסיעה הנוכחית
function estEnd(ride, loc) {
  const P = PROF[ride.siri_route__line_ref];
  const sched = T(ride.scheduled_start_time);
  const d = loc ? loc.distance_from_journey_start || 0 : 0;
  const t = loc ? T(loc.recorded_at_time) : Date.now();
  if (P && P.samples.length) {
    if (d < 150) return { end: Math.max(sched, t) + P.medDur, frac: 0, L: P.L, how: 'p' };
    const rem = median(P.samples.map(s => remainingFrom(s, Math.min(d, s.L))));
    return { end: t + rem, frac: Math.min(1, d / P.L), L: P.L, d, how: 'p' };
  }
  if (P && P.apiDur) return { end: Math.max(sched + P.apiDur, t), frac: null, how: 'a' };
  return null;
}
function fullDur(ref) { const P = PROF[ref]; return P ? P.medDur || P.apiDur : null; }
function verdict(endMs, nextSched) {
  const slack = Math.round((nextSched - endMs) / MIN);
  if (slack >= 5) return { cls: 'v-ok', txt: `יספיק · יגיע כ-${slack} דק׳ לפני` };
  if (slack >= -2) return { cls: 'v-warn', txt: slack >= 0 ? `על הגבול · מרווח של ${slack} דק׳` : `על הגבול · איחור של כ-${-slack} דק׳` };
  return { cls: 'v-bad', txt: `לא יספיק · איחור של כ-${-slack} דק׳` };
}

/* ---------- מה כל רכב עושה עכשיו ---------- */
// לכל רכב: הנסיעות שלו (5 שעות אחורה, 4 קדימה), הנסיעה שבה הוא נמצא עכשיו והמיקום האחרון
async function vehiclesNow(plates) {
  const now = Date.now(), out = {};
  plates = [...new Set(plates.map(norm).filter(Boolean))];
  if (!plates.length) return out;
  const rides = (await Promise.all(chunks(plates, 40).map(part =>
    api('/siri_rides/list', { vehicle_refs: part.join(','), scheduled_start_time_from: iso(now - 5 * HOUR), scheduled_start_time_to: iso(now + 4 * HOUR), limit: 2000 })))).flat();
  for (const p of plates) out[p] = { rides: [], cur: null, loc: null, last: null };
  for (const r of rides) { const p = norm(r.vehicle_ref); if (out[p]) out[p].rides.push(r); }
  for (const p of plates) out[p].rides.sort((a, b) => T(a.scheduled_start_time) - T(b.scheduled_start_time));
  await markUnmatched(rides);
  const cand = rides.filter(r => T(r.scheduled_start_time) <= now + 15 * MIN && T(r.scheduled_start_time) >= now - 4 * HOUR);
  const locs = await latestLocs(cand.map(r => r.id));
  for (const p of plates) {
    const st = out[p];
    let best = null;
    for (const r of st.rides) { const l = locs[r.id]; if (l && (!best || T(l.recorded_at_time) > T(best[1].recorded_at_time))) best = [r, l]; }
    if (best && T(best[1].recorded_at_time) >= freshCut()) { st.cur = best[0]; st.loc = best[1]; }
    else if (best) st.last = best;
  }
  return out;
}
/* ---------- נסיעה שלא בלוח הזמנים הרשמי ----------
   לנסיעה ב-SIRI יש journey_ref — מזהה הנסיעה בלוח הזמנים ("2026-11-24-584762569"). הרבה נסיעות שהחברות משדרות מראש
   מגיעות עם journey_ref שנגמר ב-"-0" (24.11: בדן באר שבע קו 7 משודר כל 9 דק' מול כל 10 דק' בלוח הזמנים; בשתי החברות
   כ-1,000 מתוך כ-1,900 כאלה בשבע שעות לא מתאימות לנסיעה בלוח הזמנים). נסיעה כזאת שאין במסלול שלה באותו יום נסיעה
   בלוח הזמנים (GTFS) באותה שעת יציאה (±דקה) מסומנת unm. לא בוחרים בין שיבוצים (שלמה 24.11: "זה ניחוש"): מציגים כל
   נסיעה שהחברה שידרה, לפי הסדר, ורק מוסיפים תגית אפורה "לא בלוח הזמנים הרשמי". */
const zeroJ = r => /-0$/.test(String(r.journey_ref || ''));
// כשיש ברשימה רכב ש"לא יספיק" (שלמה 24.11, אפשרות ב): שורה אחת ניטרלית בראש הרשימה
const SWAP_NOTE = '<div class="swapn">החברה משבצת רכבים מראש, והשיבוץ משתנה במהלך היום. רכב שמסומן \'לא יספיק\' כנראה יוחלף.</div>';
const OFF_TAG = '<span class="offt">לא בלוח הזמנים הרשמי</span>';
async function markUnmatched(rides) {
  const z = rides.filter(zeroJ);
  if (!z.length) return;
  const ts = z.map(r => T(r.scheduled_start_time)), t0 = Math.min(...ts) - MIN, t1 = Math.max(...ts) + MIN;
  const refs = [...new Set(z.map(r => r.siri_route__line_ref))];
  let planned;
  try {
    planned = (await Promise.all(chunks(refs, 60).map(part => api('/gtfs_rides/list', { gtfs_route__line_refs: part.join(','),
      gtfs_route__date_from: ilDay(t0 - 864e5), gtfs_route__date_to: ilDay(t1), start_time_from: iso(t0), start_time_to: iso(t1), limit: 2000 })))).flat();
  } catch (e) { return; } // בלי לוח הזמנים — לא מסמנים כלום (כמו קודם)
  for (const r of z) {
    const t = T(r.scheduled_start_time);
    r.unm = !planned.some(p => p.gtfs_route__line_ref === r.siri_route__line_ref && Math.abs(T(p.start_time) - t) <= MIN);
  }
}
async function latestLocs(ids) {
  const res = {};
  const parts = await Promise.all(chunks([...new Set(ids)], 120).map(part =>
    api('/siri_vehicle_locations/list', { siri_rides__ids: part.join(','), recorded_at_time_from: iso(Date.now() - 20 * MIN), order_by: 'recorded_at_time desc', limit: 5000 })));
  for (const r of parts) for (const x of r) if (!res[x.siri_ride__id]) res[x.siri_ride__id] = x;
  return res;
}
// האם הנסיעה הנוכחית כבר הסתיימה (הגיע לסוף המסלול)
function finished(ride, loc) {
  const P = PROF[ride.siri_route__line_ref];
  return !!(P && P.L && loc && loc.distance_from_journey_start >= P.L - Math.max(300, P.L * 0.02));
}
/* ---------- נסיעה ריקה בין מסופים ----------
   כשהנסיעה הבאה מתחילה במקום אחר (לא איפה שהקודמת הסתיימה), האוטובוס צריך לנסוע לשם ריק. הזמן — הערכה לפי המרחק,
   כמו במדד האמינות (tools/bus_reliability.py, deadhead_sec): עד DH_NEAR_KM — אותו מסוף, בלי נסיעה ריקה; הדרך בכביש
   ארוכה מהקו האווירי פי DH_ROAD. המהירות: DH_KMH (30 קמ"ש, כמו במדד) ל-DH_CITY_KM הק"מ הראשונים — היציאה מהעיר —
   ומעבר לזה DH_KMH_FAR. 30 קמ"ש לכל הדרך מתאים לקפיצות בתוך העיר, אבל בין ערים הנסיעה הריקה היא בכביש בין-עירוני:
   קרית גת–קרית מלאכי (כ-15 ק"מ באוויר) הייתה יוצאת 40 דק', ובפועל כ-25. החישוב רציף — מרחק גדול יותר לא נותן פחות זמן.
   המיקומים: תחנת המוצא והתחנה האחרונה של כל מסלול (term באינדקס, מהקו בזמן). בלי האינדקס — בלי נסיעה ריקה. */
const DH_NEAR_KM = 1.5, DH_ROAD = 1.3, DH_KMH = 30, DH_CITY_KM = 5, DH_KMH_FAR = 60;
function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180, dLa = (b.lat - a.lat) * rad, dLo = (b.lon - a.lon) * rad;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const dhMin = kmA => kmA <= DH_NEAR_KM ? 0 : DH_ROAD * (Math.min(kmA, DH_CITY_KM) / DH_KMH + Math.max(0, kmA - DH_CITY_KM) / DH_KMH_FAR) * 60;
// מוצא וסוף של המסלול של נסיעה (רוחב/אורך ועיר), או null
function terms(ride) {
  const r = ride && ROUTES[ride.siri_route__line_ref];
  if (!r) return null;
  const m = LH[r.route_mkt + '-' + r.route_direction + '-' + r.route_alternative] || LH[r.route_mkt + '-' + r.route_direction];
  if (!m || !m.term) return null;
  const { o, d } = rparts(r);
  return { o: { lat: m.term[0], lon: m.term[1], city: fullCity(o.city), stop: o.stop }, e: { lat: m.term[2], lon: m.term[3], city: fullCity(d.city), stop: d.stop } };
}
// נסיעה ריקה ממקום (pos) לתחנת המוצא של ride: { km (בכביש, משוער), ms, to } או null (אותו מסוף, או שלא ידוע)
function deadhead(pos, ride) {
  const t = terms(ride);
  if (!pos || !t) return null;
  const k = distKm(pos, t.o), m = dhMin(k);
  if (!m) return null;
  const other = !!(t.o.city && pos.city && t.o.city !== pos.city);
  const to = other || !pos.city ? t.o.city || t.o.stop : t.o.stop || t.o.city;
  return { km: k * DH_ROAD, air: k, ms: m * MIN, to, city: t.o.city, other };
}
// הנסיעה הבאה יוצאת רחוק מסוף הנסיעה הנוכחית והרכב לא יספיק (שלמה 24.11): הערה ניטרלית בכתום, וההערכה כמו שחושבה.
// מתחת — הנסיעה ששודרה אחריה, כמו שהחברה שידרה (בלי לבחור ביניהן)
function oddNote(p, target, st) {
  const dh = p && p.dh;
  if (!dh || p.ready == null || p.ready - T(target.scheduled_start_time) <= 2 * MIN) return '';
  const tt = T(target.scheduled_start_time);
  const after = st && st.rides.find(r => r.id !== target.id && T(r.scheduled_start_time) > tt);
  let h = `<div class="odd">⚠ יוצאת ${esc(pre('מ', dh.other ? dh.city : dh.to))}, כ-${Math.round(dh.km)} ק״מ מסוף הנסיעה הנוכחית</div>`;
  if (after) {
    const o = rparts(ROUTES[after.siri_route__line_ref]).o;
    h += `<div class="aft">אחריה, לפי שידור החברה: <b>${hm(T(after.scheduled_start_time))}</b> · קו ${esc(lineName(after.siri_route__line_ref))} ${esc(toLabel(ROUTES[after.siri_route__line_ref]))}${o.stop ? ` (${esc(pre('מ', o.stop))})` : ''}${after.unm ? ' ' + OFF_TAG : ''}</div>`;
  }
  return h;
}
const dhText = dh => `נסיעה ריקה ${esc(pre('ל', dh.to))} (כ-${Math.max(1, Math.round(dh.km))} ק״מ, כ-${Math.max(1, Math.round(dh.ms / MIN))} דק׳)`;

// מה הרכב עושה + מתי יתפנה ל-target (ride) — עובר על הנסיעות שלפניו, כולל נסיעה ריקה לפני כל אחת
function plan(st, target) {
  const now = Date.now();
  const res = { state: 'unknown', text: '', free: null, chain: [] };
  if (!st) return res;
  const curDone = st.cur && finished(st.cur, st.loc);
  if (st.cur && !curDone && (!target || st.cur.id !== target.id)) {
    const e = estEnd(st.cur, st.loc);
    res.state = 'busy'; res.ride = st.cur; res.loc = st.loc; res.est = e; res.free = e ? e.end : null;
  } else if (st.cur && curDone) {
    res.state = 'done'; res.ride = st.cur; res.free = T(st.loc.recorded_at_time);
  } else if (!st.cur) {
    res.state = st.last ? 'idle-after' : 'idle'; res.free = Math.min(now, (SNAP || now) + MIN);
    if (st.last) res.ride = st.last[0];
  }
  if (target && res.free != null) {
    // איפה הרכב יהיה כשיתפנה: סוף המסלול של הנסיעה הנוכחית, או המיקום האחרון שלו
    const ll = l => l && l.lat != null ? { lat: l.lat, lon: l.lon } : null;
    const endCity = r => { const x = terms(r); return x ? x.e.city : ''; };
    let pos = null;
    if (res.state === 'busy') { const x = terms(st.cur); pos = x && x.e; }
    else if (res.state === 'done') pos = ll(st.loc) && { ...ll(st.loc), city: endCity(st.cur) };
    // רכב שלא משדר עכשיו — לא יודעים איפה הוא (אולי בחניון), אז בלי נסיעה ריקה לפני הנסיעה הראשונה
    // נסיעות נוספות של הרכב לפני הנסיעה המבוקשת
    const from = st.cur ? T(st.cur.scheduled_start_time) : now - 10 * MIN;
    let t = res.free, ok = true;
    res.dhs = [];
    for (const r of st.rides) {
      const s = T(r.scheduled_start_time);
      // נסיעה שזמנה עבר ולא נראתה — כנראה הועברה לרכב אחר; לא סופרים אותה
      if (r.id === target.id || s <= from || s < now - 5 * MIN || (st.cur && r.id === st.cur.id)) continue;
      if (s >= T(target.scheduled_start_time)) break;
      const fd = fullDur(r.siri_route__line_ref);
      res.chain.push(r);
      if (!fd) { ok = false; break; }
      const dh = deadhead(pos, r);
      if (dh) { res.dhs.push(dh); t += dh.ms; }
      t = Math.max(t, s) + fd;
      const x = terms(r);
      pos = x ? x.e : null;
    }
    // והנסיעה הריקה לתחנת המוצא של הנסיעה המבוקשת
    if (ok) { res.dh = deadhead(pos, target); if (res.dh) t += res.dh.ms; }
    res.ready = ok ? t : null;
  }
  return res;
}

/* ---------- מצב ותצוגה ---------- */
let MODE = null, VIEW = null, TOKEN = 0, MAP = null, LAYER = null, DIRF = 'all', MAPDATA = null;
const OPEN = new Set(); // כרטיסים פתוחים — נשארים פתוחים ברענון
const lineLike = q => /^\d{1,3}[א-ת]?$/.test(q);
// שם עיר להשוואה: בלי גרשיים ומקפים, קריית = קרית, "ק. גת" = "קרית גת"
const cityNorm = t => ' ' + String(t || '').replace(/["'׳״`]/g, '').replace(/קריית/g, 'קרית').replace(/(^|\s)ק\.\s*/g, '$1קרית ')
  .replace(/[-_.,/:()]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
// "4 קרית גת" / "קרית גת 4" → { num, city }
function parseLineCity(q) {
  const t = String(q || '').trim().split(/\s+/);
  if (t.length < 2) return null;
  let num, rest;
  if (lineLike(t[0]) && !lineLike(t[t.length - 1])) { num = t[0]; rest = t.slice(1); }
  else if (lineLike(t[t.length - 1]) && !lineLike(t[0])) { num = t[t.length - 1]; rest = t.slice(0, -1); }
  else return null;
  const city = rest.join(' ');
  return /[א-ת]/.test(city) ? { num, city } : null;
}
// כל שמות הערים והתחנות של קבוצת קו — מהתיאור הרשמי ומהיעד לפרסום (הקו בזמן)
function groupHay(g) {
  if (g.hay) return g.hay;
  const parts = [g.agency];
  for (const r of g.routes) {
    const { o, d } = rparts(r);
    parts.push(o.city, d.city, fullCity(o.city), fullCity(d.city));
    const e = ends(r);
    parts.push(e.fr, e.to, e.city);
  }
  return (g.hay = parts.filter(Boolean).map(cityNorm).join('|'));
}
const hayHas = (hay, q) => hay.includes(cityNorm(q).trimEnd());
function setMode(m, keepQ) {
  MODE = m;
  document.querySelectorAll('.big').forEach(b => { const on = b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('#f').hidden = !m;
  $('#q').placeholder = m === 'veh' ? 'מספר רכב, למשל 62261203' : 'מספר קו, קו ועיר (4 קרית גת), תחנה או שם תחנה';
  $('#q').inputMode = m === 'veh' ? 'numeric' : 'text';
  if (!keepQ) $('#q').value = '';
  hideSugg();
}
// מחוון טעינה: שלוש נקודות שמופיעות ונעלמות, ושורה קצרה של מה נטען עכשיו
const DOTS = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
function loading(text) { $('#out').innerHTML = `<div class="loading" role="status" aria-live="polite">${DOTS}<span class="lt">${esc(text)}</span></div>`; dropMap(); }
// מעדכן את השורה רק כשהמחוון עדיין מוצג ושייך לטעינה הנוכחית
function stage(tok, text) { const el = $('#out .loading .lt'); if (el && tok === TOKEN) el.textContent = text; }
let BUSY = 0;
function busy(on) { BUSY = Math.max(0, BUSY + (on ? 1 : -1)); showAge(); }
function msg(html, err) { $('#out').innerHTML = `<div class="msg${err ? ' err' : ''}">${html}</div>`; dropMap(); }
function dropMap() { if (MAP) { MAP.remove(); MAP = null; LAYER = null; } }
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  OPEN.clear();
  if (h.get('v')) { setMode('veh', true); $('#q').value = h.get('v'); VIEW = { t: 'veh', plate: norm(h.get('v')) }; }
  else if (h.get('l')) { setMode('ls', true); $('#q').value = h.get('l') + (h.get('c') ? ' ' + h.get('c') : ''); VIEW = { t: 'line', num: h.get('l').trim(), g: h.get('g') || null, d: h.get('d') || null, city: h.get('c') || null }; }
  else if (h.get('s')) { setMode('ls', true); VIEW = { t: 'stop', code: norm(h.get('s')) }; }
  else { VIEW = null; $('#out').innerHTML = ''; dropMap(); return; }
  load(false);
}
async function load(silent) {
  const tok = ++TOKEN;
  if (!silent) loading('טוען נתונים חיים מ-Open Bus…'); else busy(true);
  try {
    if (VIEW.t === 'line') await loadLine(tok);
    else if (VIEW.t === 'stop') await loadStop(tok);
    else await loadVeh(tok);
  } catch (e) {
    if (tok !== TOKEN) return;
    console.error(e);
    if (!silent) msg(`לא הצלחנו לקבל נתונים מ-Open Bus (${esc(e.message || e)}). נסו שוב בעוד דקה.`, true);
  } finally { if (silent) busy(false); }
}

/* ---------- רכבים משובצים: מה כל אחד עושה, ומתי יתפנה ---------- */
// dl: יציאות {ref, t, ride}. מחזיר vs ומשלים פרופילים — קודם מה שמהיר, ואז render שני עם ההערכות
// קודם מציגים את היציאות עצמן (render(true) — בלי "מה הרכב עושה"), ואז משלימים. wait — עוד הבטחה שצריך
// לחכות לה לפני ההצגה הסופית (פרופיל משך הנסיעה של הקו עצמו)
async function enrich(tok, dl, extraPlates, render, wait) {
  const now = Date.now();
  const assigned = dl.filter(d => d.ride && d.ride.vehicle_ref && !d.active).map(d => d.ride.vehicle_ref);
  render(true);
  // צי הרכבים (לצבע של רכבי הקבלן) — כשמגיע, מציגים שוב בלי לחכות ל-Open Bus
  let vsDone = false;
  loadFleet().then(() => { if (tok === TOKEN && !vsDone) render(true); });
  const vs = await vehiclesNow(assigned);
  vsDone = true;
  if (tok !== TOKEN) return;
  const more = [], names = [];
  for (const d of dl) {
    d.stDone = true;
    const st = d.ride && d.ride.vehicle_ref && !d.active ? vs[norm(d.ride.vehicle_ref)] : null;
    if (!st) continue;
    d.st = st;
    if (st.cur) more.push(st.cur.siri_route__line_ref);
    const from = st.cur ? T(st.cur.scheduled_start_time) : now - 10 * MIN;
    for (const r of st.rides) { const t = T(r.scheduled_start_time); if (t > from && t < d.t) more.push(r.siri_route__line_ref); }
  }
  for (const p in vs) for (const r of vs[p].rides) names.push(r.siri_route__line_ref);
  const profMore = Promise.all([ensureProfiles(more), wait]);
  await Promise.all([routesFor(names), loadFleet().then(() => ensureSeats(assigned.concat(extraPlates)))]);
  if (tok !== TOKEN) return;
  render(true);
  await profMore;
  if (tok !== TOKEN) return;
  render(false);
}
// מצב יציאה אחת שעוד לא יצאה: טקסט קצר, צבע ופירוט
function depState(d, pending) {
  const now = Date.now(), r = d.ride, plate = r && r.vehicle_ref;
  if (d.active) {
    const e = d.est;
    return { cls: 'v-run', short: e && e.L ? `בדרך · ${km(d.loc.distance_from_journey_start || 0)} מתוך ${km(e.L)} ק״מ` : 'בדרך', long: '' };
  }
  if (!plate) {
    return { cls: '', unk: true, short: d.t < now ? 'לא נראה רכב בנסיעה הזאת' : '', long: d.t < now ? 'בנתונים לא נראה רכב שיצא לנסיעה הזאת (הנתונים מגיעים באיחור של כמה דקות).' : 'החברה עוד לא שידרה איזה רכב ייסע בנסיעה הזאת.' };
  }
  // עוד לא ידוע מה הרכב עושה עכשיו (הבקשה ל-Open Bus בדרך)
  if (!d.st && pending && !d.stDone) return { cls: '', short: 'בודק מה האוטובוס עושה עכשיו…', long: 'בודק מה האוטובוס עושה עכשיו…', verdict: { cls: '', txt: 'מחשב הערכה…' } };
  const st = d.st, p = plan(st, r);
  if (st && st.cur && st.cur.id === r.id) return { cls: 'v-ok', short: 'ממתין בתחנת המוצא', long: 'האוטובוס כבר משדר את הנסיעה הזאת ועומד בתחנת המוצא.', verdict: { cls: 'v-ok', txt: 'מוכן ליציאה' } };
  // לפי הנתונים: הרכב ששובץ כבר יצא לנסיעה שמתחילה אחרי הנסיעה הזאת
  if (st && st.cur && T(st.cur.scheduled_start_time) > d.t)
    return { cls: 'p-unk', short: `כבר יצא לקו ${lineName(st.cur.siri_route__line_ref)} של ${hm(T(st.cur.scheduled_start_time))}`, long: curText(p, pending) + '<br>הרכב ששובץ לנסיעה הזאת כבר יצא לנסיעה מאוחרת יותר.', verdict: { cls: 'p-unk', txt: 'בנסיעה אחרת' } };
  let v = null;
  if (p.ready != null) v = verdict(p.ready, d.t);
  if (v && v.cls === 'v-ok' && p.state !== 'busy' && !p.chain.length) v.txt = 'פנוי · יספיק';
  const dhs = (p.dhs || []).reduce((a, x) => a + x.ms, 0);
  const chain = p.chain.length ? `<br>לפני כן ייסע גם ב-${p.chain.length === 1 ? 'נסיעה נוספת' : p.chain.length + ' נסיעות נוספות'}: ${p.chain.map(c => 'קו ' + esc(lineName(c.siri_route__line_ref)) + ' ב-' + hm(T(c.scheduled_start_time))).join(', ')}${dhs ? ` (וביניהן נסיעות ריקות של כ-${Math.round(dhs / MIN)} דק׳)` : ''}.` : '';
  const dhLine = p.dh ? `<br>ואז ${dhText(p.dh)} — לתחנת המוצא של הנסיעה הזאת.` : '';
  let short;
  if (p.state === 'busy') short = `עכשיו בקו ${lineName(p.ride.siri_route__line_ref)}` + (p.free ? ` · מסיים בסביבות ${hm(p.free)}` : '');
  else if (p.state === 'done') short = 'סיים נסיעה · פנוי';
  else short = 'לא בנסיעה כרגע';
  if (p.chain.length) short += ` · עוד ${p.chain.length === 1 ? 'נסיעה' : p.chain.length + ' נסיעות'} לפני`;
  if (p.dh) short += ` · נסיעה ריקה כ-${Math.max(1, Math.round(p.dh.ms / MIN))} דק׳`;
  return { cls: v ? v.cls : '', short, long: curText(p, pending) + chain + dhLine + oddNote(p, r, st), verdict: v || { cls: '', txt: pending ? 'מחשב הערכה…' : 'אין מספיק נתונים להערכה' } };
}
function curText(p, pending) {
  if (p.state === 'busy') {
    const r = p.ride, e = p.est;
    const pos = e && e.frac != null && e.L ? ` · ${km(e.d || 0)} מתוך ${km(e.L)} ק״מ` : '';
    return `עכשיו בנסיעה בקו <b>${esc(lineName(r.siri_route__line_ref))}</b> ${esc(toLabel(ROUTES[r.siri_route__line_ref]))} (יצא ב-${hm(T(r.scheduled_start_time))})${pos}` +
      (e ? ` · צפוי לסיים בסביבות <b>${hm(e.end)}</b>` : pending ? ' · מחשב מתי יסיים…' : ' · אין מספיק נתונים כדי להעריך מתי יסיים');
  }
  if (p.state === 'done') return `סיים נסיעה בקו ${esc(lineName(p.ride.siri_route__line_ref))} ב-${hm(p.free)} — פנוי.`;
  if (p.state === 'idle-after') return `לא בנסיעה כרגע (נסיעה אחרונה שנראתה: קו ${esc(lineName(p.ride.siri_route__line_ref))}, ${hm(T(p.ride.scheduled_start_time))}).`;
  return 'לא בנסיעה כרגע (הרכב לא משדר מיקום עכשיו).';
}
function fleetGrid(plate, opRef) {
  const v = vinfo(plate, opRef);
  if (!FLEET.ready) return FLEET.failed ? '<div class="why">פרטי הרכב לא נטענו.</div>' : `<div class="loading sm">${DOTS}<span class="lt">טוען את נתוני צי הרכבים…</span></div>`;
  if (!v.known) return '<div class="why">הרכב לא נמצא בצי הרכבים של הקו הבוחן.</div>';
  const g = [['חברה', v.opName], ['שייכות', v.kab === true ? 'רכב קבלן' : v.kab === false ? 'רכב של החברה' : ''], ['גודל', [v.size, v.kind].filter(Boolean).join(' · ')],
    ['מושבים', v.seats], ['דגם', v.model], ['שנת ייצור', v.year], ['הנעה', v.prop]]
    .filter(x => x[1]).map(([k, x]) => `<div class="k">${k}</div><div class="v">${esc(x)}</div>`).join('');
  return `<div class="grid">${g}</div>${v.other ? `<div class="why">בצי הרכבים רשום אצל ${esc(v.other)}.</div>` : ''}${v.kab ? '<div class="why">רכב קבלן = לא רשום בצי של החברות במאגר "ציי רכב אוטובוסים" של משרד התחבורה.</div>' : ''}`;
}
// התווית הצבעונית הקטנה בשורה הסגורה
function pillOf(s, pending) {
  if (s.cls === 'v-run') return { cls: 'v-run', txt: 'בדרך' };
  if (s.unk) return null;
  if (!s.verdict) return { cls: 'p-unk', txt: 'לא ידוע' };
  const c = s.verdict.cls;
  if (c === 'v-ok') return { cls: c, txt: s.short === 'ממתין בתחנת המוצא' ? 'מוכן' : 'יספיק' };
  if (c === 'v-warn') return { cls: c, txt: 'על הגבול' };
  if (c === 'v-bad') return { cls: c, txt: 'לא יספיק' };
  if (c === 'p-unk') return { cls: c, txt: s.verdict.txt };
  return { cls: 'p-unk', txt: pending ? 'מחשב…' : 'אין הערכה' };
}
const ICON_STOP = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 22V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="6" y="2" width="12" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 6.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 22h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHEV = '<svg class="arr" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// כרטיס קומפקטי: שורה אחת סגורה, והפרטים בפנים
function card(id, { time, sub, line, plate, kab, off, short, pill, body }) {
  const open = OPEN.has(id) ? ' open' : '';
  return `<details class="card c" data-id="${esc(id)}"${open}><summary>
    <span class="t"><b>${time}</b>${sub ? `<small>${sub}</small>` : ''}</span>
    <span class="mid"><span class="r1">${line ? `<span class="lchip">${esc(line)}</span>` : ''}${plate ? `<span class="plate${kab ? ' kab' : ''}"${kab ? ' title="רכב קבלן"' : ''}>${esc(plate)}</span>${kab ? '<span class="ktag">קבלן</span>' : ''}` : '<span class="plate none">אין מידע</span>'}${pill ? `<span class="pill ${pill.cls}">${pill.txt}</span>` : ''}${off ? OFF_TAG : ''}</span>
      ${short ? `<span class="short">${short}</span>` : ''}</span>${CHEV}</summary><div class="inner">${body}</div></details>`;
}
function depBody(d, s, opRef) {
  const plate = d.ride && d.ride.vehicle_ref;
  let h = '';
  if (s.verdict) h += `<div class="vline ${s.verdict.cls ? 't-' + s.verdict.cls : ''}"><b>${s.verdict.txt}</b>${/^v-/.test(s.verdict.cls || '') ? '<span class="why">· הערכה בלבד</span>' : ''}</div>`;
  if (s.long) h += `<div class="now">${s.long}</div>`;
  if (plate) h += fleetGrid(plate, opRef) + `<button class="more" data-v="${esc(norm(plate))}">כל הנסיעות של הרכב ←</button>`;
  return h;
}

/* ===== חיפוש לפי קו ===== */
const PLANNED = {};
const GROUPS = {}; // מספר קו -> קבוצות (חברה + מק"ט)
async function lineGroups(num) {
  if (GROUPS[num]) return GROUPS[num];
  const r = await api('/gtfs_routes/list', { route_short_name: num, date_from: ilDate(0), date_to: ilDate(0), limit: 300 });
  const g = {};
  for (const x of r) {
    ROUTES[x.line_ref] = x;
    if (x.route_type && x.route_type !== '3') continue; // רק אוטובוסים (בלי רכבת קלה)
    const k = x.operator_ref + '-' + x.route_mkt;
    (g[k] = g[k] || { key: k, op: x.operator_ref, agency: x.agency_name, mkt: x.route_mkt, routes: [] }).routes.push(x);
  }
  const all = Object.values(g), list = all.filter(x => ours(x.op)).sort((a, b) => a.agency.localeCompare(b.agency, 'he') || a.mkt.localeCompare(b.mkt));
  list.others = all.filter(x => !ours(x.op)); // קווים בשם הזה של חברות אחרות
  for (const G of list) {
    G.routes.sort((a, b) => a.route_direction.localeCompare(b.route_direction) || a.route_alternative.localeCompare(b.route_alternative));
    G.dirs = [...new Set(G.routes.map(r => r.route_direction))];
    // לכל כיוון — החלופה הראשית קובעת את המוצא והיעד
    G.dmain = {};
    for (const dr of G.dirs) {
      const rs = G.routes.filter(r => r.route_direction === dr);
      G.dmain[dr] = rs.find(r => r.route_alternative === '#' || r.route_alternative === '0') || rs[0];
    }
  }
  return (GROUPS[num] = list);
}
async function loadLine(tok) {
  const num = VIEW.num;
  if (!/^[0-9א-ת]{1,5}$/.test(num)) { msg('מספר קו לא תקין.', true); return; }
  stage(tok, `מחפש את קו ${num}…`);
  // היעדים (הקו בזמן) והנוסעים נטענים ברקע; מחכים להם רק כשצריך אותם להצגה
  const lhP = loadLH(), rideP = loadRide();
  const waitLH = async () => {
    const lhWait = setTimeout(() => stage(tok, 'טוען את רשימת הקווים והיעדים (פעם אחת)…'), 1500);
    await lhP;
    clearTimeout(lhWait);
  };
  const groups = await lineGroups(num);
  if (tok !== TOKEN) return;
  if (!groups.length && groups.others.length) { msg(`קו ${esc(num)} שפועל היום הוא של חברה אחרת.<div class="why">${ONLY}</div>`); return; }
  if (!groups.length) { msg(`לא נמצא קו ${esc(num)} שפועל היום.${/^\d+$/.test(num) ? ` <a href="#s=${esc(num)}">לחפש תחנה שהקוד שלה ${esc(num)}?</a>` : ''}`, true); return; }
  // קו ועיר ("4 קרית גת") — רק הקווים שעוברים בעיר הזאת
  let gs = groups;
  if (VIEW.city) {
    await waitLH();
    if (tok !== TOKEN) return;
    gs = groups.filter(g => hayHas(groupHay(g), VIEW.city));
    // הקו בעיר הזאת קיים, אבל של חברה אחרת
    if (!gs.length && groups.others.some(g => hayHas(groupHay(g), VIEW.city))) {
      msg(`קו ${esc(num)} ב${esc(VIEW.city)} הוא של חברה אחרת.<div class="why">${ONLY}</div>`);
      return;
    }
    if (!gs.length) {
      const cs = [...new Set(groups.flatMap(g => { const e = ends(g.dmain[g.dirs[0]]); return e.city ? [e.city] : [e.fr, e.to].map(x => String(x || '').split(',')[0].trim()); }).filter(Boolean))];
      msg(`לא נמצא היום קו ${esc(num)} ב${esc(VIEW.city)}.${cs.length ? `<div class="why">קו ${esc(num)} נוסע ב: ${esc(cs.slice(0, 12).join(', '))}${cs.length > 12 ? ' ועוד' : ''}</div>` : ''}<div class="why"><a href="#l=${encodeURIComponent(num)}">לכל הקווים ${esc(num)}</a> · <a href="#" id="asStop">לחפש תחנה בשם הזה</a></div>`, true);
      const a = $('#asStop');
      if (a) a.addEventListener('click', e => { e.preventDefault(); $('#q').value = VIEW.city + ' ' + num; suggest(true); });
      return;
    }
  }
  const G = gs.find(g => g.key === VIEW.g) || (gs.length === 1 ? gs[0] : null);
  if (!G) { await waitLH(); if (tok === TOKEN) renderPicker(gs, num, VIEW.city); return; }
  DIRF = G.dirs.includes(VIEW.d) ? VIEW.d : G.dirs[0];
  const picker = groups.length > 1;

  stage(tok, 'טוען את הנסיעות ומיקומי האוטובוסים…');
  const refs = G.routes.map(r => r.line_ref);
  const now = Date.now();
  // כל הבקשות יוצאות יחד: הנסיעות ב-SIRI, לוח הזמנים ומשך הנסיעה הרגיל (לא מחכים לו להצגה הראשונה)
  const profP = ensureProfiles(refs);
  // לוח הזמנים (GTFS) — נשמר עשר דקות. עם תאריך הקו (gtfs_route__date) השרת עונה בעשירית שנייה במקום כמה שניות
  const pk = G.key;
  if (!PLANNED[pk] || now - PLANNED[pk].at > 10 * MIN) {
    PLANNED[pk] = { at: now, p: api('/gtfs_rides/list', { gtfs_route__line_refs: refs.join(','), gtfs_route__date_from: ilDate(-1), gtfs_route__date_to: ilDay(now + 75 * MIN), start_time_from: iso(now - 25 * MIN), start_time_to: iso(now + 75 * MIN), limit: 500 }).catch(() => { PLANNED[pk].at = 0; return []; }) };
  }
  const plannedP = PLANNED[pk].p;
  const siri = await api('/siri_rides/list', { siri_route__line_refs: refs.join(','), scheduled_start_time_from: iso(now - 4 * HOUR), scheduled_start_time_to: iso(now + 65 * MIN), limit: 3000 });
  if (tok !== TOKEN) return;
  const started = siri.filter(r => T(r.scheduled_start_time) <= now + 10 * MIN);
  const [locs, planned0] = await Promise.all([latestLocs(started.map(r => r.id)), plannedP, waitLH(), rideP]);
  if (tok !== TOKEN) return;
  const planned = planned0.filter(p => T(p.start_time) >= now - 20 * MIN && T(p.start_time) <= now + 60 * MIN);

  // היציאות: לוח הזמנים (GTFS), מותאם לנסיעות שב-SIRI לפי קו ושעה
  const sKey = r => r.siri_route__line_ref + '|' + T(r.scheduled_start_time);
  const sBy = {};
  // אותה נסיעה פעמיים (שובץ רכב אחר) — החדשה (id גבוה יותר) גוברת
  for (const r of siri) { const k = sKey(r); if (!sBy[k] || sBy[k].id < r.id) sBy[k] = r; }
  const deps = [], seen = new Set();
  for (const p of planned) {
    const k = p.gtfs_route__line_ref + '|' + T(p.start_time);
    if (seen.has(k)) continue;
    seen.add(k);
    deps.push({ ref: p.gtfs_route__line_ref, t: T(p.start_time), ride: sBy[k] || null });
  }
  for (const r of siri) {
    const t = T(r.scheduled_start_time);
    // נסיעה ששודרה בלי נסיעה בלוח הזמנים באותה שעה — שורה משלה, עם תגית "לא בלוח הזמנים הרשמי"
    if (zeroJ(r) && planned0.length && !planned0.some(p => p.gtfs_route__line_ref === r.siri_route__line_ref && Math.abs(T(p.start_time) - t) <= MIN)) r.unm = true;
    if (t >= now - 20 * MIN && !seen.has(sKey(r))) { seen.add(sKey(r)); deps.push({ ref: r.siri_route__line_ref, t, ride: r }); }
  }
  deps.sort((a, b) => a.t - b.t);
  // מה בדרך ומה עוד לא יצא — מחושב מחדש בכל הצגה, כי "הסתיים" תלוי במשך הנסיעה (שמגיע אחר כך)
  const split = () => {
    const fc = freshCut();
    const active = started.filter(r => locs[r.id] && T(locs[r.id].recorded_at_time) >= fc && !finished(r, locs[r.id]) && (locs[r.id].distance_from_journey_start || 0) > 150);
    const activeIds = new Set(active.map(r => r.id));
    const upcoming = deps.filter(d => !(d.ride && activeIds.has(d.ride.id)) && !(d.ride && locs[d.ride.id] && finished(d.ride, locs[d.ride.id])));
    const act = active.map(r => ({ ref: r.siri_route__line_ref, t: T(r.scheduled_start_time), ride: r, active: true, loc: locs[r.id], est: estEnd(r, locs[r.id]) }));
    return { upcoming, act, active };
  };
  const first = split();
  await enrich(tok, first.upcoming, first.active.map(r => r.vehicle_ref), pending => { const x = split(); renderLine({ G, picker, act: x.act, upcoming: x.upcoming, num }, pending); }, profP);
}
// בחירת קו: כרטיס לכל חברה וכיוון — מוצא ← יעד, כמו בהקו בזמן. שלוש שורות, והשאר מאחורי "עוד"
function renderPicker(groups, num, city) {
  const cards = [];
  for (const g of groups) for (const dr of g.dirs) cards.push({ g, dr, e: ends(g.dmain[dr]) });
  const per = matchMedia('(min-width:560px)').matches ? 3 : 2, lim = per * 3;
  const hid = cards.length > lim + 1 ? cards.length - lim : 0;
  const cardsHTML = cards.map((c, i) => `<button class="pick${hid && i >= lim ? ' x' : ''}" data-hay="${esc(groupHay(c.g))}" title="${esc(c.e.title || '')}" data-g="${esc(c.g.key)}" data-d="${esc(c.dr)}">
      <span class="pop">${esc(c.g.agency)}${c.e.city ? ` · <b>${esc(c.e.city)}</b>` : ''}</span>${endsHTML(c.e)}</button>`).join('');
  $('#out').innerHTML = `<div class="rhead"><span class="lchip lg">${esc(num)}</span><span><b>${city ? `קו ${esc(num)} ב${esc(city)}` : `${groups.length} קווים בשם הזה`}</b><small>${city ? `${groups.length} קווים · ` : ''}בחרו לאן</small></span></div>
    ${cards.length > lim ? `<input id="pf" class="pf" type="search" placeholder="סינון לפי עיר, תחנה או חברה (למשל קרית גת)" aria-label="סינון הקווים">` : ''}
    <div class="picks">${cardsHTML}</div><div id="pnone" class="msg" hidden>אין קו כזה ברשימה.</div>${hid ? `<button class="pmore" id="pmore">עוד ${hid} ▾</button>` : ''}`;
  dropMap();
  bindOut();
  const m = $('#pmore'), f = $('#pf');
  if (m) m.addEventListener('click', () => { document.querySelectorAll('.pick.x').forEach(b => b.classList.remove('x')); m.remove(); });
  if (f) f.addEventListener('input', () => {
    // אותה השוואה כמו בחיפוש: קריית/קרית, גרשיים, "ק. גת"; מספר הקו עצמו לא מסנן
    const w = cityNorm(f.value).trim().split(' ').filter(x => x && x !== num);
    let n = 0;
    document.querySelectorAll('.pick').forEach(b => {
      const hay = cityNorm(b.textContent) + '|' + b.dataset.hay;
      const ok = w.every(x => hay.includes(x));
      b.hidden = !ok; if (ok) n++;
      if (w.length) b.classList.remove('x');
    });
    if (w.length && m) m.hidden = true; else if (m) { m.hidden = false; document.querySelectorAll('.pick').forEach((b, i) => b.classList.toggle('x', i >= lim)); }
    $('#pnone').hidden = n > 0;
  });
}
function renderLine({ G, picker, act, upcoming, num }, pending) {
  const now = Date.now();
  const dirOf = ref => (ROUTES[ref] || {}).route_direction;
  const dirRoute = dir => G.routes.find(r => r.route_direction === dir);
  const other = G.dirs.find(d => d !== DIRF);
  const e = ends(G.dmain[DIRF] || dirRoute(DIRF));
  const acts0 = (other ? `<button class="act" data-dir="${esc(other)}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>החלף כיוון</button>` : '') +
    (picker ? `<button class="act" data-pick="1">קו ${esc(num)} אחר</button>` : '');
  const fd = x => dirOf(x) === DIRF;
  const up = upcoming.filter(d => fd(d.ref));
  let bad = false;
  const ups = up.map(d => {
    const s = depState(d, pending), plate = d.ride && d.ride.vehicle_ref;
    if (plate && s.verdict && s.verdict.cls === 'v-bad') bad = true;
    const dirT = '';
    return card('d' + d.ref + '-' + d.t, {
      time: hm(d.t), sub: d.t < now ? 'היה אמור לצאת' : 'בעוד ' + Math.max(0, Math.round((d.t - now) / MIN)) + ' דק׳',
      plate: plate ? norm(plate) : '', kab: plate && isKab(plate, G.op), off: d.ride && d.ride.unm, short: esc(s.short), pill: pillOf(s, pending), body: dirT + depBody(d, s, G.op),
    });
  }).join('');
  const a = act.filter(d => fd(d.ref)).sort((x, y) => x.t - y.t);
  const acts = a.map(d => {
    const e = d.est, l = d.loc;
    const body = `<div class="now">${esc(toLabel(ROUTES[d.ref]))} · יצא ב-${hm(d.t)}${e ? ` · צפוי לסיים בסביבות <b>${hm(e.end)}</b>` : ''}</div>
      ${e && e.frac != null ? `<div class="prog"><i style="width:${Math.round(e.frac * 100)}%"></i></div>` : ''}
      <div class="why">מיקום מ-${hm(T(l.recorded_at_time))}${l.velocity != null ? ` · ${l.velocity} קמ״ש` : ''}</div>
      ${fleetGrid(d.ride.vehicle_ref, G.op)}<button class="more" data-v="${esc(norm(d.ride.vehicle_ref))}">כל הנסיעות של הרכב ←</button>`;
    return card('a' + d.ride.id, { time: hm(d.t), sub: 'יצא', plate: norm(d.ride.vehicle_ref), kab: isKab(d.ride.vehicle_ref, G.op), short: esc(depState(d).short.replace(/^בדרך · /, '')), pill: { cls: 'v-run', txt: 'בדרך' }, body });
  }).join('');
  const known = up.filter(d => d.ride && d.ride.vehicle_ref).length;
  $('#out').innerHTML = `<div class="rhead"><span class="lchip lg">${esc(num)}</span><span class="rt" title="${esc(e.title || '')}"><span class="pop">${esc(G.agency)}${e.city ? ` · <b>${esc(e.city)}</b>` : ''}</span><span class="ends">${endsHTML(e)}</span>${rideHTML(G.mkt)}</span></div>
    ${acts0 ? `<div class="acts">${acts0}</div>` : ''}
    <h2 class="sec">היציאות בשעה הקרובה ${up.length ? `<span class="frac" title="לכמה יציאות כבר ידוע איזה רכב ייסע"><i style="width:${Math.round(known / up.length * 100)}%"></i><em>רכב ידוע ל-${known} מתוך ${up.length}</em></span>` : ''}</h2>${bad ? SWAP_NOTE : ''}${pending ? `<div class="loading sm" role="status">${DOTS}<span class="lt">מחשב אם האוטובוסים יספיקו…</span></div>` : ''}
    ${ups || '<div class="msg">אין יציאות בשעה הקרובה.</div>'}
    <details class="fold" data-id="fold-act"${OPEN.has('fold-act') ? ' open' : ''}><summary><span>בדרך עכשיו <span class="cnt">${a.length}</span></span>${CHEV}</summary><div class="fin">
      ${a.length ? '<div id="map"></div>' + acts : '<div class="msg">אין כרגע אוטובוס של הקו בדרך (לפי הנתונים).</div>'}</div></details>`;
  MAPDATA = { points: a.map(d => ({ loc: d.loc, plate: norm(d.ride.vehicle_ref), label: norm(d.ride.vehicle_ref), kab: vkab(d.ride.vehicle_ref, G.op) })) };
  bindOut();
}

/* ===== חיפוש לפי תחנה ===== */
let STOPS = null, stopsP = null;
let STOPSET = null; // התחנות שבמסלולי הקווים של החברות (מהאינדקס); בלעדיו — כל התחנות
function loadStops() {
  if (!stopsP) stopsP = Promise.all([getJSON('../fares/data/stops.json'), loadIndex()]).then(([j, ix]) => {
    STOPS = (j && j.stops) || {};
    if (ix && ix.stops) STOPSET = new Set(ix.stops);
  });
  return stopsP;
}
function findStops(q) {
  const w = q.replace(/["'׳״]/g, '').split(/[\s,/]+/).filter(Boolean);
  const out = [];
  for (const [code, s] of Object.entries(STOPS || {})) {
    if (STOPSET && !STOPSET.has(code)) continue;
    const hay = (s[0] + ' ' + s[1]).replace(/["'׳״]/g, '');
    if (w.every(x => hay.includes(x))) out.push([code, s, hay.startsWith(w[0]) ? 0 : 1]);
    if (out.length > 400) break;
  }
  return out.sort((a, b) => a[2] - b[2] || a[1][0].localeCompare(b[1][0], 'he')).slice(0, 12);
}
function hideSugg() { const s = $('#sugg'); if (s) { s.hidden = true; s.innerHTML = ''; } }
async function suggest(force) {
  const q = $('#q').value.trim();
  if (MODE !== 'ls' || q.length < 2 || /^\d+[א-ת]?$/.test(q) || (!force && parseLineCity(q))) { hideSugg(); return; }
  await loadStops();
  if ($('#q').value.trim() !== q) return;
  const res = findStops(q), el = $('#sugg');
  el.innerHTML = res.length ? res.map(([c, s]) => `<button type="button" data-s="${c}"><b>${esc(s[0])}</b><small>${esc(s[1])} · תחנה ${c}</small></button>`).join('') : '<div class="none">לא נמצאה תחנה בשם הזה</div>';
  el.hidden = false;
  el.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { hideSugg(); go('#s=' + b.dataset.s); }));
}
const STOPID = {};
async function loadStop(tok) {
  const code = VIEW.code, now = Date.now();
  stage(tok, 'טוען את הנסיעות בתחנה…');

  if (!STOPID[code]) {
    const r = await api('/gtfs_stops/list', { code, date_from: ilDate(0), date_to: ilDate(0), limit: 5 });
    if (!r.length) { if (tok === TOKEN) msg(`לא נמצאה תחנה שהקוד שלה ${esc(code)}.`, true); return; }
    STOPID[code] = r[0];
  }
  const S = STOPID[code];
  $('#q').value = S.name;
  // תחנה שלא במסלולים של החברות (לפי האינדקס) — בלי לחפש בה נסיעות
  const ix = await loadIndex();
  if (tok !== TOKEN) return;
  if (ix && ix.stops && !ix.stops.includes(String(code))) { msg(`בתחנה ${esc(S.name)} (${esc(S.city)}) לא עוברים קווים של דן בדרום או דן באר שבע.<div class="why">${ONLY}</div>`); return; }
  const rs = await api('/gtfs_ride_stops/list', { gtfs_stop_ids: S.id, arrival_time_from: iso(now - 15 * MIN), arrival_time_to: iso(now + 60 * MIN), limit: 400 });
  if (tok !== TOKEN) return;
  const deps = [];
  if (rs.length && !rs.some(x => ours(x.gtfs_route__operator_ref))) { msg(`בשעה הקרובה לא עוברים בתחנה ${esc(S.name)} קווים של דן בדרום או דן באר שבע.<div class="why">${ONLY}</div>`); return; }
  for (const x of rs) {
    if (x.gtfs_route__route_type && x.gtfs_route__route_type !== '3') continue; // רק אוטובוסים
    if (!ours(x.gtfs_route__operator_ref)) continue;
    if (!ROUTES[x.gtfs_route__line_ref]) ROUTES[x.gtfs_route__line_ref] = { line_ref: x.gtfs_route__line_ref, route_short_name: x.gtfs_route__route_short_name, route_long_name: x.gtfs_route__route_long_name, route_mkt: x.gtfs_route__route_mkt, route_alternative: x.gtfs_route__route_alternative, route_direction: x.gtfs_route__route_direction, agency_name: x.gtfs_route__agency_name, operator_ref: x.gtfs_route__operator_ref, date: x.gtfs_route__date };
    deps.push({ ref: x.gtfs_route__line_ref, t: T(x.gtfs_ride__start_time), at: T(x.arrival_time), sd: x.shape_dist_traveled, op: x.gtfs_route__operator_ref });
  }
  const refs = [...new Set(deps.map(d => d.ref))];
  let siri = [];
  if (deps.length) {
    const t0 = Math.min(...deps.map(d => d.t)), t1 = Math.max(...deps.map(d => d.t));
    siri = (await Promise.all(chunks(refs, 50).map(part =>
      api('/siri_rides/list', { siri_route__line_refs: part.join(','), scheduled_start_time_from: iso(t0), scheduled_start_time_to: iso(t1 + 1000), limit: 3000 })))).flat();
  }
  if (tok !== TOKEN) return;
  const sBy = {};
  for (const r of siri) { const k = r.siri_route__line_ref + '|' + T(r.scheduled_start_time); if (!sBy[k] || sBy[k].id < r.id) sBy[k] = r; }
  for (const d of deps) d.ride = sBy[d.ref + '|' + d.t] || null;
  // נסיעות ששודרו בלי נסיעה בלוח הזמנים — שורה משלהן. השעה בתחנה: שעת היציאה ששודרה + הזמן מהמוצא עד התחנה
  // בנסיעה של אותו מסלול בלוח הזמנים (מאותה שאילתה)
  const used = new Set(deps.filter(d => d.ride).map(d => d.ride.id)), proto = {};
  for (const d of deps) if (!proto[d.ref]) proto[d.ref] = d;
  for (const r of Object.values(sBy)) {
    const q = proto[r.siri_route__line_ref], t = T(r.scheduled_start_time);
    if (used.has(r.id) || !q || !zeroJ(r) || deps.some(d => d.ref === q.ref && Math.abs(d.t - t) <= MIN)) continue;
    r.unm = true;
    deps.push({ ref: q.ref, t, at: t + (q.at - q.t), sd: q.sd, op: q.op, ride: r });
  }
  const started = deps.filter(d => d.ride && d.t <= now + 10 * MIN).map(d => d.ride);
  // משך הנסיעה הרגיל (לזמן ההגעה של אוטובוס שבדרך) — ברקע; קודם מציגים לפי הלו"ז
  const profP = ensureProfiles(refs.filter(l => deps.some(d => d.ref === l && d.ride && d.t <= now)));
  const [locs] = await Promise.all([latestLocs(started.map(r => r.id)), loadLH()]);
  if (tok !== TOKEN) return;
  const fc = freshCut();
  const list = [];
  for (const d of deps) {
    const l = d.ride && locs[d.ride.id];
    if (l && T(l.recorded_at_time) >= fc && (l.distance_from_journey_start || 0) > 150) {
      if (d.sd != null && l.distance_from_journey_start > d.sd + 100) continue; // כבר עבר בתחנה
      d.active = true; d.loc = l;
    } else if (d.at < now - 3 * MIN) continue; // זמנה עבר ולא נראה בדרך
    list.push(d);
  }
  // זמן ההגעה — לפי הלו"ז, ולאוטובוס שבדרך לפי המיקום שלו (כשמשך הנסיעה כבר ידוע)
  const calc = () => {
    for (const d of list) {
      d.eta = d.at; d.etaHow = 'plan';
      if (!d.active) continue;
      const l = d.loc, dist = l.distance_from_journey_start;
      d.est = estEnd(d.ride, l);
      const P = PROF[d.ref];
      if (P && P.samples.length && d.sd != null) {
        const toStop = median(P.samples.map(s => remainingFrom(s, Math.min(dist, s.L)) - remainingFrom(s, Math.min(d.sd, s.L))));
        if (toStop != null) { d.eta = T(l.recorded_at_time) + Math.max(0, toStop); d.etaHow = 'live'; }
      }
    }
  };
  await enrich(tok, list, list.filter(d => d.active).map(d => d.ride.vehicle_ref), pending => { calc(); renderStop(S, list, pending); }, profP);
}
function renderStop(S, list, pending) {
  const now = Date.now();
  for (const d of list) if (!d.active && d.st) { const p = plan(d.st, d.ride); if (p.ready != null && p.ready > d.t) { d.eta = d.at + (p.ready - d.t); d.etaHow = 'late'; } }
  list.sort((a, b) => a.eta - b.eta);
  let bad = false;
  const rows = list.slice(0, 40).map(d => {
    const s = depState(d, pending), plate = d.ride && d.ride.vehicle_ref;
    if (plate && !d.active && s.verdict && s.verdict.cls === 'v-bad') bad = true;
    const mins = Math.round((d.eta - now) / MIN);
    const sub = d.etaHow === 'live' ? (mins <= 0 ? 'מגיע עכשיו' : `בעוד ${mins} דק׳`) : d.etaHow === 'late' ? 'צפוי באיחור' : 'לפי הלו״ז';
    const why = `<div class="why">${esc(toLabel(ROUTES[d.ref]))} · ${esc((ROUTES[d.ref] || {}).agency_name || '')} · בלו״ז: ${hm(d.at)}, יציאה מתחנת המוצא ${hm(d.t)}${d.etaHow === 'live' ? ' · זמן ההגעה מחושב לפי מיקום האוטובוס' : ''}</div>`;
    return card('st' + d.ref + '-' + d.t, { time: hm(d.eta), sub, line: lineName(d.ref), plate: plate ? norm(plate) : '', kab: plate && isKab(plate, d.op), off: d.ride && d.ride.unm, short: esc(d.active ? (s.short.replace(/^בדרך( · )?/, '') || 'בדרך לתחנה') : s.short), pill: d.active ? { cls: 'v-run', txt: 'בדרך' } : pillOf(s, pending), body: why + depBody(d, s, d.op) });
  }).join('');
  $('#out').innerHTML = `<div class="rhead"><span class="sicon" aria-hidden="true">${ICON_STOP}</span><span><b>${esc(S.name)}</b><small>${esc(S.city)} · תחנה ${esc(S.code)}</small></span></div>
    <h2 class="sec">מגיעים בשעה הקרובה</h2>${bad ? SWAP_NOTE : ''}${pending ? `<div class="loading sm" role="status">${DOTS}<span class="lt">מחשב אם האוטובוסים יספיקו…</span></div>` : ''}${rows || '<div class="msg">אין נסיעות בתחנה בשעה הקרובה.</div>'}`;
  MAPDATA = null;
  bindOut();
}

/* ===== חיפוש לפי רכב ===== */
async function loadVeh(tok) {
  const plate = VIEW.plate;
  if (!plate || plate.length < 4) { msg('מספר רכב לא תקין.', true); return; }
  const fw = setTimeout(() => stage(tok, 'טוען את נתוני צי הרכבים…'), 2000);
  // רכב שבצי של חברה אחרת — עונים מיד, בלי לחכות ל-Open Bus (בלי אינדקס: מהצי המלא)
  const vsP = vehiclesNow([plate]);
  vsP.catch(() => {});
  await loadFleet();
  if (tok !== TOKEN) return;
  const r0 = vrec(plate), mine = !!(r0 && r0.fop != null && ours(r0.fop));
  const notOurs = () => { clearTimeout(fw); msg(`הרכב ${esc(plate)} לא נוסע בקווים של דן בדרום או דן באר שבע.<div class="why">${ONLY}</div>`); };
  if (r0 && r0.fop != null && !mine) { notOurs(); return; }
  const [vs] = await Promise.all([vsP, ensureSeats([plate])]);
  clearTimeout(fw);
  if (tok !== TOKEN) return;
  if (!mine && !vs[plate].rides.some(r => ours(r.siri_route__operator_ref))) { notOurs(); return; }
  stage(tok, 'טוען את מסלול הנסיעה…');
  if (tok !== TOKEN) return;
  const st = vs[plate];
  const refs = st.rides.map(r => r.siri_route__line_ref);
  // משך הנסיעה ומסלול הנסיעה הנוכחית — במקביל; קודם מציגים את הרכב ואת הנסיעות שלו
  const profP = ensureProfiles(st.cur ? [st.cur.siri_route__line_ref] : []);
  const trailP = st.cur ? api('/siri_vehicle_locations/list', { siri_rides__ids: st.cur.id, order_by: 'recorded_at_time asc', limit: 600 }).catch(() => []) : Promise.resolve([]);
  await Promise.all([routesFor(refs), loadLH()]);
  if (tok !== TOKEN) return;
  const curP = st.cur && !(st.cur.siri_route__line_ref in PROF);
  renderVeh(plate, st, [], curP);
  const [, trail] = await Promise.all([profP, trailP]);
  if (tok !== TOKEN) return;
  renderVeh(plate, st, trail, false);
}
function renderVeh(plate, st, trail, pending) {
  const now = Date.now();
  const op = st.cur ? st.cur.siri_route__operator_ref : st.rides.length ? st.rides[st.rides.length - 1].siri_route__operator_ref : null;
  const v = vinfo(plate, op);
  const p = plan(st, null);
  const after = st.cur ? T(st.cur.scheduled_start_time) : now - 5 * MIN;
  // נסיעה שזמנה עבר ולא נראתה — כנראה עברה לרכב אחר
  const nexts = st.rides.filter(r => T(r.scheduled_start_time) > after && T(r.scheduled_start_time) >= now - 5 * MIN && (!st.cur || r.id !== st.cur.id));
  const next = nexts[0];
  const nowLine = p.state === 'busy'
    ? `<span class="lchip" title="קו">${esc(lineName(p.ride.siri_route__line_ref))}</span> ${esc(toLabel(ROUTES[p.ride.siri_route__line_ref]))}${p.free ? ` · מסיים בסביבות ${hm(p.free)}` : ''}`
    : p.state === 'done' ? `סיים נסיעה בקו ${esc(lineName(p.ride.siri_route__line_ref))} · פנוי` : st.rides.length ? 'לא בנסיעה כרגע' : 'לא נמצאו נסיעות ב-5 השעות האחרונות';
  let vd = null, pn = null;
  if (next) {
    pn = plan(st, next);
    vd = pn.ready != null ? verdict(pn.ready, T(next.scheduled_start_time)) : { cls: '', txt: pending ? 'מחשב הערכה…' : 'אין מספיק נתונים להערכה' };
    if (vd.cls === 'v-ok' && p.state !== 'busy') vd.txt = 'פנוי · יספיק';
  }
  const nextLine = next ? `<b class="ntm">${hm(T(next.scheduled_start_time))}</b> <span class="lchip" title="קו">${esc(lineName(next.siri_route__line_ref))}</span> ${esc(toLabel(ROUTES[next.siri_route__line_ref]))}${next.unm ? ' ' + OFF_TAG : ''}` : 'עוד לא ידוע';
  const rows = st.rides.map(r => {
    const s = T(r.scheduled_start_time), isCur = st.cur && r.id === st.cur.id;
    const cls = isCur ? 'cur' : s < after ? 'past' : '';
    const stt = isCur ? (p.state === 'done' ? 'הסתיימה' : 'עכשיו') : s < after ? '' : s < now - 5 * MIN ? 'לא נראתה' : 'מתוכננת';
    return `<li class="${cls}"><span class="tm">${hm(s)}</span><span><span class="lchip" title="קו">${esc(lineName(r.siri_route__line_ref))}</span> ${esc(toLabel(ROUTES[r.siri_route__line_ref]))}${r.unm ? ' ' + OFF_TAG : ''}</span><span class="st">${stt}</span></li>`;
  }).join('');
  const prog = p.state === 'busy' && p.est && p.est.frac != null ? `<div class="prog"><i style="width:${Math.round(p.est.frac * 100)}%"></i></div>` : '';
  const detail = (id, title, body) => `<details class="fold" data-id="${id}"${OPEN.has(id) ? ' open' : ''}><summary><span>${title}</span>${CHEV}</summary><div class="fin">${body}</div></details>`;
  $('#out').innerHTML = `<div class="card vcard"><div class="vhead"><span class="plate big-plate${v.known && v.kab ? ' kab' : ''}">${esc(plate)}</span><span class="vop">${esc(v.opName || '')}</span>${v.kab ? '<span class="pill kab">קבלן</span>' : ''}</div>
      <div class="kv"><span class="k">עכשיו</span><span>${nowLine}${prog}</span></div>
      <div class="kv"><span class="k">הנסיעה הבאה</span><span>${nextLine}${vd ? `<span class="kvp"><span class="pill ${vd.cls || 'p-unk'}">${vd.txt}</span></span>` : ''}${next ? oddNote(pn, next, st) : ''}</span></div>
    </div>
    ${detail('v-why', 'הסבר ומיקום', `<div class="now">${st.rides.length || st.cur ? curText(p, pending) : 'לא נמצאו נסיעות של הרכב הזה ב-5 השעות האחרונות.'}</div>
      ${st.loc ? `<div class="why">מיקום מ-${hm(T(st.loc.recorded_at_time))}${st.loc.velocity != null ? ` · ${st.loc.velocity} קמ״ש` : ''}</div><div id="map"></div>` : ''}
      ${next ? `<div class="why">${p.state === 'busy' && p.free ? `ההערכה: הנסיעה הנוכחית תסתיים בסביבות ${hm(p.free)}${p.est && p.est.how === 'a' ? ' (לפי משך הנסיעה הממוצע בלבד)' : ''}${pn && pn.dh ? `, ואז ${dhText(pn.dh)}` : ''}, מול יציאה ב-${hm(T(next.scheduled_start_time))}.` : pn && pn.dh ? `לפני הנסיעה הבאה: ${dhText(pn.dh)}.` : ''}</div>`
        : '<div class="why">החברה עוד לא שידרה את הנסיעה הבאה של הרכב.</div>'}`)}
    ${detail('v-fleet', 'פרטי הרכב', fleetGrid(plate, op))}
    ${rows ? detail('v-trips', `הנסיעות שלו היום · ${st.rides.length}`, `<ul class="trips">${rows}</ul>`) : ''}`;
  MAPDATA = st.loc ? { points: [{ loc: st.loc, plate, label: `${plate} · קו ${lineName(st.cur.siri_route__line_ref)}`, kab: v.known ? v.kab : null }], trail } : null;
  bindOut();
}

/* ---------- מפה (נפתחת רק כשפותחים את החלק שלה) ---------- */
// צבע הסמן לפי השייכות של הרכב (vkab): קבלן — כתום, של החברה — כהה, לא ידוע — אפור
const MK = { true: { c: '#EA580C', t: 'רכב קבלן' }, false: { c: '#10172A', t: 'רכב של החברה' }, null: { c: '#8B93A7', t: 'לא ידוע' } };
function drawMap() {
  const el = $('#map');
  dropMap();
  if (!el || !window.L || !MAPDATA || !MAPDATA.points.length || !el.offsetParent) return;
  const { points, trail } = MAPDATA;
  MAP = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAP);
  LAYER = L.layerGroup().addTo(MAP);
  const ll = [];
  if (trail && trail.length > 1) {
    const line = trail.map(x => [x.lat, x.lon]);
    L.polyline(line, { color: '#1E5BC6', weight: 4, opacity: .55 }).addTo(LAYER);
    ll.push(...line);
  }
  const seen = new Set();
  for (const p of points) {
    if (!p.loc) continue;
    const k = MK[String(p.kab == null ? null : p.kab)];
    seen.add(k);
    const m = L.circleMarker([p.loc.lat, p.loc.lon], { radius: 8, color: '#fff', weight: 2, fillColor: k.c, fillOpacity: 1 }).addTo(LAYER);
    m.bindTooltip(esc(p.label) + (p.kab ? ' · קבלן' : ''), { direction: 'top', offset: [0, -8], permanent: points.length <= 6, className: p.kab ? 'tt-kab' : '' });
    m.on('click', () => go('#v=' + p.plate));
    ll.push([p.loc.lat, p.loc.lon]);
  }
  // מקרא: רק הסוגים שמופיעים במפה
  const leg = L.control({ position: 'bottomleft' });
  leg.onAdd = () => {
    const d = L.DomUtil.create('div', 'mleg');
    d.innerHTML = Object.values(MK).filter(k => seen.has(k)).map(k => `<span><i style="background:${k.c}"></i>${k.t}</span>`).join('');
    return d;
  };
  if (seen.size) leg.addTo(MAP);
  if (ll.length === 1) MAP.setView(ll[0], 14);
  else if (ll.length) MAP.fitBounds(ll, { padding: [30, 30], maxZoom: 15 });
}

function bindOut() {
  const out = $('#out');
  out.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); go('#v=' + b.dataset.v); }));
  const lh = (g, d) => '#l=' + encodeURIComponent(VIEW.num) + (g ? '&g=' + encodeURIComponent(g) : '') + (d ? '&d=' + encodeURIComponent(d) : '');
  out.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => go(lh(b.dataset.g, b.dataset.d))));
  out.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => { history.replaceState(null, '', lh(VIEW.g || (GROUPS[VIEW.num] || [])[0]?.key, b.dataset.dir)); VIEW.d = b.dataset.dir; OPEN.clear(); load(true); }));
  out.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => go('#l=' + encodeURIComponent(VIEW.num))));
  out.querySelectorAll('details[data-id]').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) OPEN.add(d.dataset.id); else OPEN.delete(d.dataset.id);
    if (d.querySelector('#map')) drawMap();
  }));
  drawMap();
}

/* ---------- אתחול ---------- */
document.querySelectorAll('.big').forEach(b => b.addEventListener('click', () => {
  setMode(b.dataset.m);
  if (location.hash) history.pushState(null, '', location.pathname + location.search);
  VIEW = null; $('#out').innerHTML = ''; dropMap();
  $('#q').focus();
}));
$('#f').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  hideSugg();
  if (MODE === 'veh') { go('#v=' + norm(q)); return; }
  const lc = parseLineCity(q);
  if (lc) go('#l=' + encodeURIComponent(lc.num) + '&c=' + encodeURIComponent(lc.city));
  else if (lineLike(q)) go('#l=' + encodeURIComponent(q));
  else if (/^\d{4,6}$/.test(q)) go('#s=' + q);
  else { await suggest(); const first = $('#sugg [data-s]'); if (first && $('#sugg').querySelectorAll('[data-s]').length === 1) go('#s=' + first.dataset.s); }
});
let sT = 0;
$('#q').addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(suggest, 200); });
document.addEventListener('click', e => { if (!e.target.closest('.search')) hideSugg(); });
window.addEventListener('hashchange', route);
loadSnap();
// שורת הפתיחה: הערים של הקווים (מהאינדקס — שם הן נגזרות מהקווים עצמם)
loadIndex().then(ix => {
  const a = ix && ix.area;
  if (a && a.length) $('#intro').innerHTML = `בקווים של <b>דן בדרום</b> ו<b>דן באר שבע</b> (${esc(a.join(', '))}) — החברות שמודיעות מראש איזה אוטובוס ייסע.`;
});
loadFleet();
loadLH();
loadRide();
route();
// רענון פעם בדקה, רק כשהלשונית גלויה
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  loadSnap();
  if (VIEW) load(true);
}, 60000);
setInterval(showAge, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SNAP && Date.now() - SNAP > 5 * MIN) { loadSnap(); if (VIEW) load(true); } });
