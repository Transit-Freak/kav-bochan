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
const ilDate = (dd = 0) => new Date(Date.now() + dd * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const median = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const norm = p => String(p || '').replace(/\D/g, '').replace(/^0+/, '');
const T = s => Date.parse(s);
const km = m => (m / 1000).toLocaleString('he-IL', { maximumFractionDigits: m < 10000 ? 1 : 0 });

class ApiErr extends Error {}

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
  if (!SNAP) { el.textContent = 'בודק את גיל הנתונים…'; return; }
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

/* ---------- צי הרכבים ---------- */
const TNAMES = { 'צבורי עירוני': 'אוטובוס עירוני', 'צבורי בין-עירוני': 'אוטובוס בין-עירוני', 'צבורי להסע מיוחד': 'אוטובוס הסעות',
  'זעצ הסעות מיוחדות': 'מיניבוס הסעות', 'זעיר צבורי': 'מיניבוס', 'זעיר צבורי סיור': 'מיניבוס תיור', 'צבורי עיר מפרק': 'אוטובוס מפרקי',
  'צבורי בע קומתים': 'אוטובוס דו-קומתי', 'עירוני קומותיים': 'אוטובוס דו-קומתי עירוני', 'צבורי לסיור': 'אוטובוס תיור', 'פרטי': 'אוטובוס פרטי' };
const fixT = t => { if (!t) return ''; const c = t.replace(/["״]/g, '').replace(/\s+/g, ' ').trim().replace(/^אוטובוס /, ''); return TNAMES[c] || t.replace('צבורי', 'ציבורי'); };
const kabType = t => !!t && /הסע|מיוחד|סיור|טיולית|פרטי|תיור/.test(t);
const FLEET = { idx: null, ofc: null, ops: {}, cov: {}, gov: {}, updated: null, failed: false };
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
function vinfo(plate, opRef) {
  const p = norm(plate), f = FLEET.idx && FLEET.idx[p], o = FLEET.ofc && FLEET.ofc[p];
  const type = f ? fixT(f.type) : '';
  const op = opRef != null ? opRef : f && f.op;
  let kab = null;
  if (FLEET.idx) {
    if (o) kab = false;
    else if (!FLEET.ofc) kab = f ? kabType(type) : null;
    else if (FLEET.cov[op] === false) kab = f ? kabType(type) : null;
    else kab = true;
  }
  const seats = (o && +o[1]) || FLEET.gov[p] || null;
  return {
    plate: p, known: !!(f || o), opName: (op != null && FLEET.ops[op]) || (f && f.opName) || '',
    model: f && f.model, year: f && f.year, type, kab, seats,
    size: sizeLbl(o && o[5], type), kind: o && o[4] && o[4] !== 'לא ידוע' ? o[4] : '', prop: o && o[3] && o[3] !== 'לא ידוע' ? o[3] : '',
    other: f && op != null && f.op !== op ? f.opName : '',
  };
}
/* ---------- קווים ושמות ---------- */
const ROUTES = {}; // line_ref -> מסלול GTFS (או null)
async function routesFor(refs) {
  const miss = [...new Set(refs)].filter(l => l != null && !(l in ROUTES));
  for (let i = 0; i < miss.length; i += 60) {
    const part = miss.slice(i, i + 60);
    try {
      const r = await api('/gtfs_routes/list', { line_refs: part.join(','), date_from: ilDate(-1), date_to: ilDate(0), limit: 400 });
      for (const x of r) if (!ROUTES[x.line_ref] || ROUTES[x.line_ref].date < x.date) ROUTES[x.line_ref] = x;
    } catch (e) { /* בלי שם */ }
    for (const l of part) if (!(l in ROUTES)) ROUTES[l] = null;
  }
}
function rparts(r) {
  const s = (r && r.route_long_name) || '';
  const [a, b = ''] = s.split('<->');
  const sp = x => { const i = x.lastIndexOf('-'); return i > 0 ? { stop: x.slice(0, i).trim(), city: x.slice(i + 1).trim() } : { stop: x.trim(), city: '' }; };
  return { o: sp(a), d: sp(b.replace(/-[^-]*$/, '')) };
}
function dirLabel(r) {
  if (!r) return '';
  const { o, d } = rparts(r);
  if (o.city && d.city && o.city !== d.city) return `${o.city} ← ${d.city}`;
  return `${o.stop || o.city} ← ${d.stop || d.city}`;
}
function toLabel(r) {
  if (!r) return '';
  const { d } = rparts(r);
  return 'לכיוון ' + (d.city && rparts(r).o.city !== d.city ? d.city : d.stop || d.city);
}
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
  let rides = [];
  for (let i = 0; i < plates.length; i += 40) {
    const part = await api('/siri_rides/list', { vehicle_refs: plates.slice(i, i + 40).join(','), scheduled_start_time_from: iso(now - 5 * HOUR), scheduled_start_time_to: iso(now + 4 * HOUR), limit: 2000 });
    rides = rides.concat(part);
  }
  for (const p of plates) out[p] = { rides: [], cur: null, loc: null, last: null };
  for (const r of rides) { const p = norm(r.vehicle_ref); if (out[p]) out[p].rides.push(r); }
  for (const p of plates) out[p].rides.sort((a, b) => T(a.scheduled_start_time) - T(b.scheduled_start_time));
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
async function latestLocs(ids) {
  const res = {};
  ids = [...new Set(ids)];
  for (let i = 0; i < ids.length; i += 120) {
    const part = ids.slice(i, i + 120);
    const r = await api('/siri_vehicle_locations/list', { siri_rides__ids: part.join(','), recorded_at_time_from: iso(Date.now() - 20 * MIN), order_by: 'recorded_at_time desc', limit: 5000 });
    for (const x of r) if (!res[x.siri_ride__id]) res[x.siri_ride__id] = x;
  }
  return res;
}
// האם הנסיעה הנוכחית כבר הסתיימה (הגיע לסוף המסלול)
function finished(ride, loc) {
  const P = PROF[ride.siri_route__line_ref];
  return !!(P && P.L && loc && loc.distance_from_journey_start >= P.L - Math.max(300, P.L * 0.02));
}
// מה הרכב עושה + מתי יתפנה ל-target (ride) — עובר על הנסיעות שלפניו
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
    // נסיעות נוספות של הרכב לפני הנסיעה המבוקשת
    const from = st.cur ? T(st.cur.scheduled_start_time) : now - 10 * MIN;
    let t = res.free, ok = true;
    for (const r of st.rides) {
      const s = T(r.scheduled_start_time);
      // נסיעה שזמנה עבר ולא נראתה — כנראה הועברה לרכב אחר; לא סופרים אותה
      if (r.id === target.id || s <= from || s < now - 5 * MIN || (st.cur && r.id === st.cur.id)) continue;
      if (s >= T(target.scheduled_start_time)) break;
      const fd = fullDur(r.siri_route__line_ref);
      res.chain.push(r);
      if (!fd) { ok = false; break; }
      t = Math.max(t, s) + fd;
    }
    res.ready = ok ? t : null;
  }
  return res;
}

/* ---------- מצב ותצוגה ---------- */
let MODE = null, VIEW = null, TOKEN = 0, MAP = null, LAYER = null, DIRF = 'all', MAPDATA = null;
const OPEN = new Set(); // כרטיסים פתוחים — נשארים פתוחים ברענון
const lineLike = q => /^\d{1,3}[א-ת]?$/.test(q);
function setMode(m, keepQ) {
  MODE = m;
  document.querySelectorAll('.big').forEach(b => { const on = b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('#f').hidden = !m;
  $('#q').placeholder = m === 'veh' ? 'מספר רכב, למשל 62261203' : 'מספר קו, קוד תחנה או שם תחנה';
  $('#q').inputMode = m === 'veh' ? 'numeric' : 'text';
  if (!keepQ) $('#q').value = '';
  hideSugg();
}
function msg(html, err) { $('#out').innerHTML = `<div class="msg${err ? ' err' : ''}">${html}</div>`; dropMap(); }
function dropMap() { if (MAP) { MAP.remove(); MAP = null; LAYER = null; } }
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  OPEN.clear();
  if (h.get('v')) { setMode('veh', true); $('#q').value = h.get('v'); VIEW = { t: 'veh', plate: norm(h.get('v')) }; }
  else if (h.get('l')) { setMode('ls', true); $('#q').value = h.get('l'); VIEW = { t: 'line', num: h.get('l').trim(), g: h.get('g') || null }; }
  else if (h.get('s')) { setMode('ls', true); VIEW = { t: 'stop', code: norm(h.get('s')) }; }
  else { VIEW = null; $('#out').innerHTML = ''; dropMap(); return; }
  load(false);
}
async function load(silent) {
  const tok = ++TOKEN;
  if (!silent) msg('⏳ טוען נתונים חיים…');
  try {
    if (VIEW.t === 'line') await loadLine(tok);
    else if (VIEW.t === 'stop') await loadStop(tok);
    else await loadVeh(tok);
  } catch (e) {
    if (tok !== TOKEN) return;
    console.error(e);
    if (!silent) msg(`לא הצלחנו לקבל נתונים מ-Open Bus (${esc(e.message || e)}). נסו שוב בעוד דקה.`, true);
  }
}

/* ---------- רכבים משובצים: מה כל אחד עושה, ומתי יתפנה ---------- */
// dl: יציאות {ref, t, ride}. מחזיר vs ומשלים פרופילים — קודם מה שמהיר, ואז render שני עם ההערכות
async function enrich(tok, dl, extraPlates, render) {
  const now = Date.now();
  const assigned = dl.filter(d => d.ride && d.ride.vehicle_ref && !d.active).map(d => d.ride.vehicle_ref);
  const vs = await vehiclesNow(assigned);
  if (tok !== TOKEN) return;
  const more = [], names = [];
  for (const d of dl) {
    const st = d.ride && d.ride.vehicle_ref && !d.active ? vs[norm(d.ride.vehicle_ref)] : null;
    if (!st) continue;
    d.st = st;
    if (st.cur) more.push(st.cur.siri_route__line_ref);
    const from = st.cur ? T(st.cur.scheduled_start_time) : now - 10 * MIN;
    for (const r of st.rides) { const t = T(r.scheduled_start_time); if (t > from && t < d.t) more.push(r.siri_route__line_ref); }
  }
  for (const p in vs) for (const r of vs[p].rides) names.push(r.siri_route__line_ref);
  await Promise.all([routesFor(names), loadFleet().then(() => ensureSeats(assigned.concat(extraPlates)))]);
  if (tok !== TOKEN) return;
  const profMore = ensureProfiles(more);
  if ([...new Set(more)].some(l => !(l in PROF))) { render(true); await profMore; if (tok !== TOKEN) return; }
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
    if (d.guess) return { cls: '', short: `מסיים עכשיו בכיוון ההפוך, בסביבות ${hm(d.guess.e.end)}`, long: `ניחוש בלבד: אוטובוס <b>${esc(norm(d.guess.r.vehicle_ref))}</b> מסיים עכשיו את הקו בכיוון ההפוך, וצפוי להגיע בסביבות ${hm(d.guess.e.end)}. החברה עוד לא שידרה איזה רכב ייסע.`, guess: d.guess };
    return { cls: '', unk: true, short: d.t < now ? 'לא ידוע אם יצא' : 'יתברר כשהנסיעה תתחיל', long: d.t < now ? 'לא נראה רכב שיצא לנסיעה הזאת (ייתכן שעוד לא הגיע לנתונים).' : 'רוב החברות משדרות איזה רכב ייסע רק כשהנסיעה מתחילה.' };
  }
  const st = d.st, p = plan(st, r);
  if (st && st.cur && st.cur.id === r.id) return { cls: 'v-ok', short: 'ממתין בתחנת המוצא', long: 'האוטובוס כבר משדר את הנסיעה הזאת ועומד בתחנת המוצא.', verdict: { cls: 'v-ok', txt: 'מוכן ליציאה' } };
  // הרכב כבר בנסיעה שמתחילה אחרי הנסיעה הזאת — כנראה החליפו לה רכב
  if (st && st.cur && T(st.cur.scheduled_start_time) > d.t)
    return { cls: 'v-bad', short: `כבר בקו ${lineName(st.cur.siri_route__line_ref)} · אולי הוחלף`, long: curText(p, pending) + '<br>הרכב כבר יצא לנסיעה מאוחרת יותר, ולכן כנראה הנסיעה הזאת עברה לרכב אחר (או בוטלה).', verdict: { cls: 'v-bad', txt: 'הרכב כבר בנסיעה אחרת' } };
  let v = null;
  if (p.ready != null) v = verdict(p.ready, d.t);
  if (v && v.cls === 'v-ok' && p.state !== 'busy' && !p.chain.length) v.txt = 'פנוי · יספיק';
  const chain = p.chain.length ? `<br>לפני כן ייסע גם ב-${p.chain.length === 1 ? 'נסיעה נוספת' : p.chain.length + ' נסיעות נוספות'}: ${p.chain.map(c => 'קו ' + esc(lineName(c.siri_route__line_ref)) + ' ב-' + hm(T(c.scheduled_start_time))).join(', ')}.` : '';
  let short;
  if (p.state === 'busy') short = `עכשיו בקו ${lineName(p.ride.siri_route__line_ref)}` + (p.free ? ` · מסיים בסביבות ${hm(p.free)}` : '');
  else if (p.state === 'done') short = 'סיים נסיעה · פנוי';
  else short = 'לא בנסיעה כרגע';
  if (p.chain.length) short += ` · עוד ${p.chain.length === 1 ? 'נסיעה' : p.chain.length + ' נסיעות'} לפני`;
  return { cls: v ? v.cls : '', short, long: curText(p, pending) + chain, verdict: v || { cls: '', txt: pending ? 'מחשב הערכה…' : 'אין מספיק נתונים להערכה' } };
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
  return 'לא בנסיעה כרגע (לא משדר — כנראה בחניון, בהפסקה או בדרך לתחנת המוצא).';
}
function fleetGrid(plate, opRef) {
  const v = vinfo(plate, opRef);
  if (!FLEET.idx) return `<div class="why">${FLEET.failed ? 'פרטי הרכב לא נטענו.' : 'טוען פרטי רכב…'}</div>`;
  if (!v.known) return '<div class="why">הרכב לא נמצא בצי הרכבים של הקו הבוחן.</div>';
  const g = [['חברה', v.opName], ['שייכות', v.kab === true ? 'רכב קבלן' : v.kab === false ? 'רכב של החברה' : ''], ['גודל', [v.size, v.kind].filter(Boolean).join(' · ')],
    ['מושבים', v.seats], ['דגם', v.model], ['שנת ייצור', v.year], ['הנעה', v.prop]]
    .filter(x => x[1]).map(([k, x]) => `<div class="k">${k}</div><div class="v">${esc(x)}</div>`).join('');
  return `<div class="grid">${g}</div>${v.other ? `<div class="why">בצי הרכבים רשום אצל ${esc(v.other)}.</div>` : ''}${v.kab ? '<div class="why">רכב קבלן = לא רשום בצי של החברות במאגר "ציי רכב אוטובוסים" של משרד התחבורה.</div>' : ''}`;
}
// התווית הצבעונית הקטנה בשורה הסגורה
function pillOf(s, pending) {
  if (s.cls === 'v-run') return { cls: 'v-run', txt: 'בדרך' };
  if (s.guess) return { cls: 'p-guess', txt: 'ניחוש' };
  if (s.unk) return null;
  if (!s.verdict) return { cls: 'p-unk', txt: 'לא ידוע' };
  const c = s.verdict.cls;
  if (c === 'v-ok') return { cls: c, txt: s.short === 'ממתין בתחנת המוצא' ? 'מוכן' : 'יספיק' };
  if (c === 'v-warn') return { cls: c, txt: 'על הגבול' };
  if (c === 'v-bad') return { cls: c, txt: s.verdict.txt === 'הרכב כבר בנסיעה אחרת' ? 'הוחלף?' : 'לא יספיק' };
  return { cls: 'p-unk', txt: pending ? 'מחשב…' : 'אין הערכה' };
}
const ICON_STOP = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 22V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="6" y="2" width="12" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 6.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 22h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHEV = '<svg class="arr" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// כרטיס קומפקטי: שורה אחת סגורה, והפרטים בפנים
function card(id, { time, sub, line, plate, plateCls, short, pill, body }) {
  const open = OPEN.has(id) ? ' open' : '';
  return `<details class="card c" data-id="${esc(id)}"${open}><summary>
    <span class="t"><b>${time}</b>${sub ? `<small>${sub}</small>` : ''}</span>
    <span class="mid"><span class="r1">${line ? `<span class="lchip">${esc(line)}</span>` : ''}${plate ? `<span class="plate ${plateCls || ''}">${esc(plate)}</span>` : '<span class="plate none">רכב לא ידוע</span>'}${pill ? `<span class="pill ${pill.cls}">${pill.txt}</span>` : ''}</span>
      ${short ? `<span class="short">${short}</span>` : ''}</span>${CHEV}</summary><div class="inner">${body}</div></details>`;
}
function depBody(d, s, opRef) {
  const plate = d.ride && d.ride.vehicle_ref;
  let h = '';
  if (s.verdict) h += `<div class="vline ${s.verdict.cls ? 't-' + s.verdict.cls : ''}"><b>${s.verdict.txt}</b><span class="why">· הערכה בלבד</span></div>`;
  if (s.long) h += `<div class="now">${s.long}</div>`;
  if (plate) h += fleetGrid(plate, opRef) + `<button class="more" data-v="${esc(norm(plate))}">כל הנסיעות של הרכב ←</button>`;
  else if (s.guess) h += fleetGrid(s.guess.r.vehicle_ref, opRef) + `<button class="more" data-v="${esc(norm(s.guess.r.vehicle_ref))}">הרכב המשוער ←</button>`;
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
  const list = Object.values(g).sort((a, b) => a.agency.localeCompare(b.agency, 'he') || a.mkt.localeCompare(b.mkt));
  for (const G of list) {
    G.routes.sort((a, b) => a.route_direction.localeCompare(b.route_direction) || a.route_alternative.localeCompare(b.route_alternative));
    const main = G.routes.find(r => r.route_direction === '1') || G.routes[0];
    const { o, d } = rparts(main);
    G.label = o.city && o.city === d.city ? `${o.city}: ${o.stop} ↔ ${d.stop}` : dirLabel(main).replace(' ← ', ' ↔ ');
    G.dirs = [...new Set(G.routes.map(r => r.route_direction))];
  }
  return (GROUPS[num] = list);
}
async function loadLine(tok) {
  const num = VIEW.num;
  if (!/^[0-9א-ת]{1,5}$/.test(num)) { msg('מספר קו לא תקין.', true); return; }
  const groups = await lineGroups(num);
  if (tok !== TOKEN) return;
  if (!groups.length) { msg(`לא נמצא קו ${esc(num)} שפועל היום.${/^\d+$/.test(num) ? ` <a href="#s=${esc(num)}">לחפש תחנה שהקוד שלה ${esc(num)}?</a>` : ''}`, true); return; }
  const G = groups.find(g => g.key === VIEW.g) || (groups.length === 1 ? groups[0] : null);
  const chipsHTML = groups.map(g => `<button class="chip${G === g ? ' on' : ''}" data-g="${esc(g.key)}">${esc(g.agency)}<small>${esc(g.label)}</small></button>`).join('');
  if (!G) { $('#out').innerHTML = `<h2 class="sec">יש ${groups.length} קווים ${esc(num)} — איזה?</h2><div class="chips">${chipsHTML}</div>`; dropMap(); bindOut(); return; }
  const picker = groups.length > 1 ? `<details class="other"><summary>קו ${esc(num)} אחר (${groups.length - 1})</summary><div class="chips">${chipsHTML}</div></details>` : '';

  const refs = G.routes.map(r => r.line_ref);
  const now = Date.now();
  const profP = ensureProfiles(refs);
  // לוח הזמנים (GTFS) איטי יחסית — נשמר עשר דקות, ורץ במקביל לשאר
  const pk = G.key;
  if (!PLANNED[pk] || now - PLANNED[pk].at > 10 * MIN) {
    PLANNED[pk] = { at: now, p: api('/gtfs_rides/list', { gtfs_route__line_refs: refs.join(','), start_time_from: iso(now - 25 * MIN), start_time_to: iso(now + 75 * MIN), limit: 500 }).catch(() => { PLANNED[pk].at = 0; return []; }) };
  }
  const plannedP = PLANNED[pk].p;
  const siri = await api('/siri_rides/list', { siri_route__line_refs: refs.join(','), scheduled_start_time_from: iso(now - 4 * HOUR), scheduled_start_time_to: iso(now + 65 * MIN), limit: 3000 });
  if (tok !== TOKEN) return;
  const started = siri.filter(r => T(r.scheduled_start_time) <= now + 10 * MIN);
  const locs = await latestLocs(started.map(r => r.id));
  await profP;
  const planned = (await plannedP).filter(p => T(p.start_time) >= now - 20 * MIN && T(p.start_time) <= now + 60 * MIN);
  if (tok !== TOKEN) return;
  const fc = freshCut();
  const active = started.filter(r => locs[r.id] && T(locs[r.id].recorded_at_time) >= fc && !finished(r, locs[r.id]) && (locs[r.id].distance_from_journey_start || 0) > 150);
  const activeIds = new Set(active.map(r => r.id));

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
    if (t >= now - 20 * MIN && !seen.has(sKey(r))) { seen.add(sKey(r)); deps.push({ ref: r.siri_route__line_ref, t, ride: r }); }
  }
  const upcoming = deps.filter(d => !(d.ride && activeIds.has(d.ride.id)) && !(d.ride && locs[d.ride.id] && finished(d.ride, locs[d.ride.id]))).sort((a, b) => a.t - b.t);
  const act = active.map(r => ({ ref: r.siri_route__line_ref, t: T(r.scheduled_start_time), ride: r, active: true, loc: locs[r.id], est: estEnd(r, locs[r.id]) }));

  // ניחוש לנסיעות בלי רכב: אוטובוס שמסיים עכשיו את הקו בכיוון ההפוך
  const dirOf = ref => (ROUTES[ref] || {}).route_direction;
  const cands = act.filter(c => c.est).sort((a, b) => a.est.end - b.est.end);
  const used = new Set();
  for (const d of upcoming) {
    if (d.ride && d.ride.vehicle_ref) continue;
    if (d.t < now - 2 * MIN) continue;
    const c = cands.find(c => !used.has(c.ride.id) && dirOf(c.ref) !== dirOf(d.ref) && c.est.end <= d.t + 3 * MIN && c.est.end >= d.t - 40 * MIN);
    if (c) { used.add(c.ride.id); d.guess = { r: c.ride, e: c.est }; }
  }
  await enrich(tok, upcoming, active.map(r => r.vehicle_ref), pending => renderLine({ G, picker, act, upcoming, num }, pending));
}
function renderLine({ G, picker, act, upcoming, num }, pending) {
  const now = Date.now();
  const dirOf = ref => (ROUTES[ref] || {}).route_direction;
  const dirRoute = dir => G.routes.find(r => r.route_direction === dir);
  const dchips = G.dirs.length > 1 ? `<div class="seg">${['all', ...G.dirs].map(d =>
    `<button class="${DIRF === d ? 'on' : ''}" data-dir="${d}">${d === 'all' ? 'שני הכיוונים' : esc(toLabel(dirRoute(d)))}</button>`).join('')}</div>` : '';
  const fd = x => DIRF === 'all' || dirOf(x) === DIRF;
  const up = upcoming.filter(d => fd(d.ref));
  const ups = up.map(d => {
    const s = depState(d, pending), plate = d.ride && d.ride.vehicle_ref;
    const dirT = G.dirs.length > 1 && DIRF === 'all' ? `<div class="why">${esc(toLabel(ROUTES[d.ref]))}</div>` : '';
    return card('d' + d.ref + '-' + d.t, {
      time: hm(d.t), sub: d.t < now ? 'היה אמור לצאת' : 'בעוד ' + Math.max(0, Math.round((d.t - now) / MIN)) + ' דק׳',
      plate: plate ? norm(plate) : s.guess ? norm(s.guess.r.vehicle_ref) : '', plateCls: plate ? '' : 'guess', short: esc(s.short), pill: pillOf(s, pending), body: dirT + depBody(d, s, G.op),
    });
  }).join('');
  const a = act.filter(d => fd(d.ref)).sort((x, y) => x.t - y.t);
  const acts = a.map(d => {
    const e = d.est, l = d.loc;
    const body = `<div class="now">${esc(toLabel(ROUTES[d.ref]))} · יצא ב-${hm(d.t)}${e ? ` · צפוי לסיים בסביבות <b>${hm(e.end)}</b>` : ''}</div>
      ${e && e.frac != null ? `<div class="prog"><i style="width:${Math.round(e.frac * 100)}%"></i></div>` : ''}
      <div class="why">מיקום מ-${hm(T(l.recorded_at_time))}${l.velocity != null ? ` · ${l.velocity} קמ״ש` : ''}</div>
      ${fleetGrid(d.ride.vehicle_ref, G.op)}<button class="more" data-v="${esc(norm(d.ride.vehicle_ref))}">כל הנסיעות של הרכב ←</button>`;
    return card('a' + d.ride.id, { time: hm(d.t), sub: 'יצא', plate: norm(d.ride.vehicle_ref), short: esc(depState(d).short.replace(/^בדרך · /, '')), pill: { cls: 'v-run', txt: 'בדרך' }, body });
  }).join('');
  const known = up.filter(d => d.ride && d.ride.vehicle_ref).length;
  $('#out').innerHTML = `<div class="rhead"><span class="lchip lg">${esc(num)}</span><span><b>${esc(G.agency)}</b><small>${esc(G.label)}</small></span></div>${picker}${dchips}
    <h2 class="sec">היציאות בשעה הקרובה ${up.length ? `<span class="frac" title="לכמה יציאות כבר ידוע איזה רכב ייסע"><i style="width:${Math.round(known / up.length * 100)}%"></i><em>רכב ידוע ל-${known} מתוך ${up.length}</em></span>` : ''}</h2>
    ${ups || '<div class="msg">אין יציאות בשעה הקרובה.</div>'}
    <details class="fold" data-id="fold-act"${OPEN.has('fold-act') ? ' open' : ''}><summary><span>בדרך עכשיו <span class="cnt">${a.length}</span></span>${CHEV}</summary><div class="fin">
      ${a.length ? '<div id="map"></div>' + acts : '<div class="msg">אין כרגע אוטובוס של הקו בדרך (לפי הנתונים).</div>'}</div></details>`;
  MAPDATA = { points: a.map(d => ({ loc: d.loc, plate: norm(d.ride.vehicle_ref), label: norm(d.ride.vehicle_ref) })) };
  bindOut();
}

/* ===== חיפוש לפי תחנה ===== */
let STOPS = null, stopsP = null;
function loadStops() {
  if (!stopsP) stopsP = getJSON('../fares/data/stops.json').then(j => { STOPS = (j && j.stops) || {}; });
  return stopsP;
}
function findStops(q) {
  const w = q.replace(/["'׳״]/g, '').split(/[\s,/]+/).filter(Boolean);
  const out = [];
  for (const [code, s] of Object.entries(STOPS || {})) {
    const hay = (s[0] + ' ' + s[1]).replace(/["'׳״]/g, '');
    if (w.every(x => hay.includes(x))) out.push([code, s, hay.startsWith(w[0]) ? 0 : 1]);
    if (out.length > 400) break;
  }
  return out.sort((a, b) => a[2] - b[2] || a[1][0].localeCompare(b[1][0], 'he')).slice(0, 12);
}
function hideSugg() { const s = $('#sugg'); if (s) { s.hidden = true; s.innerHTML = ''; } }
async function suggest() {
  const q = $('#q').value.trim();
  if (MODE !== 'ls' || q.length < 2 || /^\d+[א-ת]?$/.test(q)) { hideSugg(); return; }
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
  if (!STOPID[code]) {
    const r = await api('/gtfs_stops/list', { code, date_from: ilDate(0), date_to: ilDate(0), limit: 5 });
    if (!r.length) { if (tok === TOKEN) msg(`לא נמצאה תחנה שהקוד שלה ${esc(code)}.`, true); return; }
    STOPID[code] = r[0];
  }
  const S = STOPID[code];
  $('#q').value = S.name;
  const rs = await api('/gtfs_ride_stops/list', { gtfs_stop_ids: S.id, arrival_time_from: iso(now - 15 * MIN), arrival_time_to: iso(now + 60 * MIN), limit: 400 });
  if (tok !== TOKEN) return;
  const deps = [];
  for (const x of rs) {
    if (x.gtfs_route__route_type && x.gtfs_route__route_type !== '3') continue; // רק אוטובוסים
    if (!ROUTES[x.gtfs_route__line_ref]) ROUTES[x.gtfs_route__line_ref] = { line_ref: x.gtfs_route__line_ref, route_short_name: x.gtfs_route__route_short_name, route_long_name: x.gtfs_route__route_long_name, route_direction: x.gtfs_route__route_direction, agency_name: x.gtfs_route__agency_name, operator_ref: x.gtfs_route__operator_ref, date: x.gtfs_route__date };
    deps.push({ ref: x.gtfs_route__line_ref, t: T(x.gtfs_ride__start_time), at: T(x.arrival_time), sd: x.shape_dist_traveled, op: x.gtfs_route__operator_ref });
  }
  const refs = [...new Set(deps.map(d => d.ref))];
  let siri = [];
  if (deps.length) {
    const t0 = Math.min(...deps.map(d => d.t)), t1 = Math.max(...deps.map(d => d.t));
    for (let i = 0; i < refs.length; i += 50)
      siri = siri.concat(await api('/siri_rides/list', { siri_route__line_refs: refs.slice(i, i + 50).join(','), scheduled_start_time_from: iso(t0), scheduled_start_time_to: iso(t1 + 1000), limit: 3000 }));
  }
  if (tok !== TOKEN) return;
  const sBy = {};
  for (const r of siri) { const k = r.siri_route__line_ref + '|' + T(r.scheduled_start_time); if (!sBy[k] || sBy[k].id < r.id) sBy[k] = r; }
  for (const d of deps) d.ride = sBy[d.ref + '|' + d.t] || null;
  const started = deps.filter(d => d.ride && d.t <= now + 10 * MIN).map(d => d.ride);
  const [locs] = await Promise.all([latestLocs(started.map(r => r.id)), ensureProfiles(refs.filter(l => deps.some(d => d.ref === l && d.ride && d.t <= now)))]);
  if (tok !== TOKEN) return;
  const fc = freshCut();
  const list = [];
  for (const d of deps) {
    const l = d.ride && locs[d.ride.id];
    d.eta = d.at; d.etaHow = 'plan';
    if (l && T(l.recorded_at_time) >= fc && (l.distance_from_journey_start || 0) > 150) {
      const dist = l.distance_from_journey_start;
      if (d.sd != null && dist > d.sd + 100) continue; // כבר עבר בתחנה
      d.active = true; d.loc = l; d.est = estEnd(d.ride, l);
      const P = PROF[d.ref];
      if (P && P.samples.length && d.sd != null) {
        const toStop = median(P.samples.map(s => remainingFrom(s, Math.min(dist, s.L)) - remainingFrom(s, Math.min(d.sd, s.L))));
        if (toStop != null) { d.eta = T(l.recorded_at_time) + Math.max(0, toStop); d.etaHow = 'live'; }
      }
    } else if (d.at < now - 3 * MIN) continue; // זמנה עבר ולא נראה בדרך
    list.push(d);
  }
  await enrich(tok, list, list.filter(d => d.active).map(d => d.ride.vehicle_ref), pending => renderStop(S, list, pending));
}
function renderStop(S, list, pending) {
  const now = Date.now();
  for (const d of list) if (!d.active && d.st) { const p = plan(d.st, d.ride); if (p.ready != null && p.ready > d.t) { d.eta = d.at + (p.ready - d.t); d.etaHow = 'late'; } }
  list.sort((a, b) => a.eta - b.eta);
  const rows = list.slice(0, 40).map(d => {
    const s = depState(d, pending), plate = d.ride && d.ride.vehicle_ref;
    const mins = Math.round((d.eta - now) / MIN);
    const sub = d.etaHow === 'live' ? (mins <= 0 ? 'מגיע עכשיו' : `בעוד ${mins} דק׳`) : d.etaHow === 'late' ? 'צפוי באיחור' : 'לפי הלו״ז';
    const why = `<div class="why">${esc(toLabel(ROUTES[d.ref]))} · ${esc((ROUTES[d.ref] || {}).agency_name || '')} · בלו״ז: ${hm(d.at)}, יציאה מתחנת המוצא ${hm(d.t)}${d.etaHow === 'live' ? ' · זמן ההגעה מחושב לפי מיקום האוטובוס' : ''}</div>`;
    return card('st' + d.ref + '-' + d.t, { time: hm(d.eta), sub, line: lineName(d.ref), plate: plate ? norm(plate) : '', short: esc(d.active ? (s.short.replace(/^בדרך( · )?/, '') || 'בדרך לתחנה') : s.short), pill: d.active ? { cls: 'v-run', txt: 'בדרך' } : pillOf(s, pending), plateCls: plate ? '' : s.guess ? 'guess' : '', body: why + depBody(d, s, d.op) });
  }).join('');
  $('#out').innerHTML = `<div class="rhead"><span class="sicon" aria-hidden="true">${ICON_STOP}</span><span><b>${esc(S.name)}</b><small>${esc(S.city)} · תחנה ${esc(S.code)}</small></span></div>
    <h2 class="sec">מגיעים בשעה הקרובה</h2>${rows || '<div class="msg">אין נסיעות בתחנה בשעה הקרובה.</div>'}`;
  MAPDATA = null;
  bindOut();
}

/* ===== חיפוש לפי רכב ===== */
async function loadVeh(tok) {
  const plate = VIEW.plate;
  if (!plate || plate.length < 4) { msg('מספר רכב לא תקין.', true); return; }
  const [vs] = await Promise.all([vehiclesNow([plate]), loadFleet().then(() => ensureSeats([plate]))]);
  if (tok !== TOKEN) return;
  const st = vs[plate];
  const refs = st.rides.map(r => r.siri_route__line_ref);
  await Promise.all([ensureProfiles(st.cur ? [st.cur.siri_route__line_ref] : []), routesFor(refs)]);
  if (tok !== TOKEN) return;
  let trail = [];
  if (st.cur) {
    try { trail = await api('/siri_vehicle_locations/list', { siri_rides__ids: st.cur.id, order_by: 'recorded_at_time asc', limit: 600 }); } catch (e) { trail = []; }
  }
  if (tok !== TOKEN) return;
  renderVeh(plate, st, trail);
}
function renderVeh(plate, st, trail) {
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
  let vd = null;
  if (next) {
    const pn = plan(st, next);
    vd = pn.ready != null ? verdict(pn.ready, T(next.scheduled_start_time)) : { cls: '', txt: 'אין מספיק נתונים להערכה' };
    if (vd.cls === 'v-ok' && p.state !== 'busy') vd.txt = 'פנוי · יספיק';
  }
  const nextLine = next ? `<b class="ntm">${hm(T(next.scheduled_start_time))}</b> <span class="lchip" title="קו">${esc(lineName(next.siri_route__line_ref))}</span> ${esc(toLabel(ROUTES[next.siri_route__line_ref]))}` : 'עוד לא ידוע';
  const rows = st.rides.map(r => {
    const s = T(r.scheduled_start_time), isCur = st.cur && r.id === st.cur.id;
    const cls = isCur ? 'cur' : s < after ? 'past' : '';
    const stt = isCur ? (p.state === 'done' ? 'הסתיימה' : 'עכשיו') : s < after ? '' : s < now - 5 * MIN ? 'לא נראתה' : 'מתוכננת';
    return `<li class="${cls}"><span class="tm">${hm(s)}</span><span><span class="lchip" title="קו">${esc(lineName(r.siri_route__line_ref))}</span> ${esc(toLabel(ROUTES[r.siri_route__line_ref]))}</span><span class="st">${stt}</span></li>`;
  }).join('');
  const prog = p.state === 'busy' && p.est && p.est.frac != null ? `<div class="prog"><i style="width:${Math.round(p.est.frac * 100)}%"></i></div>` : '';
  const detail = (id, title, body) => `<details class="fold" data-id="${id}"${OPEN.has(id) ? ' open' : ''}><summary><span>${title}</span>${CHEV}</summary><div class="fin">${body}</div></details>`;
  $('#out').innerHTML = `<div class="card vcard"><div class="vhead"><span class="plate big-plate">${esc(plate)}</span><span class="vop">${esc(v.opName || '')}</span>${v.kab ? '<span class="pill kab">קבלן</span>' : ''}</div>
      <div class="kv"><span class="k">עכשיו</span><span>${nowLine}${prog}</span></div>
      <div class="kv"><span class="k">הנסיעה הבאה</span><span>${nextLine}${vd ? `<span class="kvp"><span class="pill ${vd.cls || 'p-unk'}">${vd.txt}</span></span>` : ''}</span></div>
    </div>
    ${detail('v-why', 'הסבר ומיקום', `<div class="now">${st.rides.length || st.cur ? curText(p) : 'לא נמצאו נסיעות של הרכב הזה ב-5 השעות האחרונות.'}</div>
      ${st.loc ? `<div class="why">מיקום מ-${hm(T(st.loc.recorded_at_time))}${st.loc.velocity != null ? ` · ${st.loc.velocity} קמ״ש` : ''}</div><div id="map"></div>` : ''}
      ${next ? `<div class="why">${p.state === 'busy' && p.free ? `ההערכה: הנסיעה הנוכחית תסתיים בסביבות ${hm(p.free)}${p.est && p.est.how === 'a' ? ' (לפי משך הנסיעה הממוצע בלבד)' : ''}, מול יציאה ב-${hm(T(next.scheduled_start_time))}. לא כולל נסיעה ריקה בין סוף הקו לתחנת המוצא הבאה.` : ''}</div>`
        : '<div class="why">רוב החברות משדרות את הנסיעה הבאה רק כשהיא מתחילה (חוץ מדן בדרום ודן באר שבע, שמשדרות שעות מראש).</div>'}`)}
    ${detail('v-fleet', 'פרטי הרכב', fleetGrid(plate, op))}
    ${rows ? detail('v-trips', `הנסיעות שלו היום · ${st.rides.length}`, `<ul class="trips">${rows}</ul>`) : ''}`;
  MAPDATA = st.loc ? { points: [{ loc: st.loc, plate, label: `${plate} · קו ${lineName(st.cur.siri_route__line_ref)}` }], trail } : null;
  bindOut();
}

/* ---------- מפה (נפתחת רק כשפותחים את החלק שלה) ---------- */
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
  for (const p of points) {
    if (!p.loc) continue;
    const m = L.circleMarker([p.loc.lat, p.loc.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#10172A', fillOpacity: 1 }).addTo(LAYER);
    m.bindTooltip(esc(p.label), { direction: 'top', offset: [0, -8], permanent: points.length <= 6 });
    m.on('click', () => go('#v=' + p.plate));
    ll.push([p.loc.lat, p.loc.lon]);
  }
  if (ll.length === 1) MAP.setView(ll[0], 14);
  else if (ll.length) MAP.fitBounds(ll, { padding: [30, 30], maxZoom: 15 });
}

function bindOut() {
  const out = $('#out');
  out.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); go('#v=' + b.dataset.v); }));
  out.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => go('#l=' + encodeURIComponent(VIEW.num) + '&g=' + encodeURIComponent(b.dataset.g))));
  out.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => { DIRF = b.dataset.dir; load(true); }));
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
  DIRF = 'all';
  if (MODE === 'veh') { go('#v=' + norm(q)); return; }
  if (lineLike(q)) go('#l=' + encodeURIComponent(q));
  else if (/^\d{4,6}$/.test(q)) go('#s=' + q);
  else { await suggest(); const first = $('#sugg [data-s]'); if (first && $('#sugg').querySelectorAll('[data-s]').length === 1) go('#s=' + first.dataset.s); }
});
let sT = 0;
$('#q').addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(suggest, 200); });
document.addEventListener('click', e => { if (!e.target.closest('.search')) hideSugg(); });
window.addEventListener('hashchange', route);
loadSnap();
loadFleet();
route();
// רענון פעם בדקה, רק כשהלשונית גלויה
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  loadSnap();
  if (VIEW) load(true);
}, 60000);
setInterval(showAge, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SNAP && Date.now() - SNAP > 5 * MIN) { loadSnap(); if (VIEW) load(true); } });
