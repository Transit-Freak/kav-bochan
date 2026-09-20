// קליטה ברכבת — מפה של הערכת הקליטה לכל 100 מטר מסילה, לכל מפעיל.
// הנתונים מחושבים ב-GitHub Actions (tools/rail_reception.py) מאנטנות המשרד
// להגנת הסביבה, מנהרות OSM ומהירויות מנסיעות הרכבת ב-30 הימים האחרונים.
(function(){
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const GCOL = ['#D7263D', '#F26B1D', '#F4B400', '#00A65A'];
const GNAME = ['אין קליטה', 'חלשה', 'סבירה', 'טובה'];
const SCOL = v => v == null ? '#8A94A3' : v < 60 ? '#00A65A' : v < 100 ? '#F4B400' : v < 130 ? '#F26B1D' : '#D7263D';
const BRAND = {pel: '#0A5DC2', cel: '#6B2C91', phi: '#FF6A00'};   // צבעי המותג: פלאפון כחול, סלקום סגול, פרטנר כתום
// סוג הרכבת: כמה הקרון עצמו חוסם. חלון עם ציפוי מתכתי (בידוד תרמי) מחליש
// עשרות dB; חריצת לייזר מחזירה כמעט לקליטה חיצונית. המקדם מכווץ את טווחי המרחק
// (1 = כמו בחוץ). כרגע ידוע רק שכ-30 קרונות חורצו (מתוך ~800), בלי רשימה איזה.
const TRAINS = [
  {code: 'etched', name: 'קרון עם חלונות מחורצים', f: 1.0, note: 'כ-30 קרונות עד כה, וכל קרון חדש; התוכנית: כל 800 הקרונות תוך שנתיים וחצי'},
  {code: 'twindexx', name: 'דו-קומתי (בומברדייה טווינדקס)', f: 0.55, note: 'רוב הצי (~580 קרונות, 2001–2013, שופצו); זיגוג כפול עם ציפוי'},
  {code: 'desiro', name: 'חשמלית (סימנס דזירו HC)', f: 0.4, note: 'קווים מחושמלים בלבד; חלונות מצופים — החסימה הגבוהה ביותר'},
  {code: 'viaggio', name: 'חד-קומתי (סימנס ויאג׳ו)', f: 0.7, note: 'צי מצטמצם; זיגוג ישן יותר, חוסם פחות'},
];
let train = 'twindexx';
// סינון לפי דור: 'all' / '4' (דור 4 ומעלה; קוד לא מפוענח נחשב כדור 4, כי כל אתר
// פעיל היום משדר לפחות דור 4) / '5' (רק אתרים שרשום בהם דור 5)
let gen = 'all';
const hasGen = (a, g) => g === 'all' ? true : g === '4' ? (/[45]/.test(a[4]) || !/דור/.test(a[4])) : /5/.test(a[4]);
// אינדקס רשת של האנטנות (לכל מפעיל) — המרחק לאנטנה הקרובה מחושב בדפדפן כדי שהסינון לפי דור יעבוד
const AG = {};
function buildIndex() {
  for (const o of D.ops) AG[o.code] = new Map();
  for (const a of D.antennas) { const k = `${Math.floor(a[0] * 50)}_${Math.floor(a[1] * 50)}`; const m = AG[a[2]]; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
}
const CELL_M = 0.02 * 111320;   // גודל תא באינדקס (~2.2 ק"מ)
function nearest(lat, lon, code) {
  const m = AG[code]; if (!m) return null;
  const ci = Math.floor(lat * 50), cj = Math.floor(lon * 50);
  let best = null;
  const cosl = Math.cos(lat * Math.PI / 180);
  // טבעות מסביב לתא: עוצרים כשהטבעת הבאה כבר רחוקה מהמועמד הטוב ביותר
  for (let r = 0; r <= 4; r++) {
    if (best != null && best < r * CELL_M * 0.9) break;
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r) continue;
      const cell = m.get(`${i}_${j}`); if (!cell) continue;
      for (const a of cell) {
        if (!hasGen(a, gen)) continue;
        const dy = (a[0] - lat) * 111320, dx = (a[1] - lon) * 111320 * cosl;
        const d = dx * dx + dy * dy;
        if (best == null || d < best) best = d;
      }
    }
  }
  if (best == null) return null;
  best = Math.sqrt(best);
  return best <= 8000 ? Math.round(best) : null;
}
// מטמון: לכל (מפעיל, דור) מערך מרחקים לפי אינדקס הנקודה — מחושב פעם אחת, ואז החלפת קטגוריה מיידית
const DCACHE = {};
let NPTS = 0;
function distArr(code) {
  const k = code + '_' + gen;
  if (DCACHE[k]) return DCACHE[k];
  const arr = new Int32Array(NPTS).fill(-1);
  for (const s of Object.values(D.segs)) for (const p of s.pts) { const d = nearest(p[0], p[1], code); if (d != null) arr[p[9]] = d; }
  return (DCACHE[k] = arr);
}

function scoreFor(struct, d, spd, f) {
  if (struct === 'tunnel' || struct === 'covered' || d == null) return 0;
  let s = d < 1500 * f ? 3 : d < 3500 * f ? 2 : d < 6000 * f ? 1 : 0;
  if (struct === 'cutting' && s > 0) s--;
  if (spd && spd > 120 && s > 0 && s < 3) s--;
  return s;
}
const STRUCT = {tunnel: 'מנהרה', cutting: 'חתך (מסילה שקועה)', covered: 'קטע מקורה'};
let RENDERER = null;
let ROUTE = null, routeLayer = null;   // המסלול שנבחר (מוצא→יעד) והדגשתו במפה
let D = null, op = 'pel', map, layer, antLayer, cover = null, bySpeed = false, showAnt = true;

function load(u) { return fetch(u + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }

function init() {
  $('#map').innerHTML = '';
  NPTS = 0; for (const s of Object.values(D.segs)) for (const p of s.pts) p[9] = NPTS++;
  map = L.map('map', {zoomControl: true, preferCanvas: true}); window.__recepMap = map;
  RENDERER = L.canvas({padding: 0.3});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {maxZoom: 18, attribution: '&copy; OpenStreetMap, &copy; CARTO'}).addTo(map);
  const all = []; for (const s of Object.values(D.segs)) for (const p of s.pts) all.push([p[0], p[1]]);
  map.fitBounds(L.latLngBounds(all).pad(0.05));
  antLayer = L.layerGroup().addTo(map);
  layer = L.layerGroup().addTo(map);
  const ops = $('#ops');
  ops.innerHTML = D.ops.map(o => `<button data-op="${o.code}" style="--b:${BRAND[o.code]}" class="${o.code === op ? 'on' : ''}">${esc(o.name)}</button>`).join('') + `<button data-op="all" style="--b:#101418">כל החברות</button>`;
  ops.onclick = e => { const b = e.target.closest('button'); if (!b) return; op = b.dataset.op; ops.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  buildIndex();
  const gsel = $('#gen');
  gsel.onclick = e => { const b = e.target.closest('button'); if (!b) return; gen = b.dataset.gen; gsel.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  const tr = $('#train');
  tr.innerHTML = TRAINS.map(t => `<option value="${t.code}" ${t.code === train ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  tr.onchange = () => { train = tr.value; $('#trainNote').textContent = (TRAINS.find(t => t.code === train) || {}).note || ''; draw(); };
  $('#trainNote').textContent = TRAINS[1].note;
  $('#showAnt').onchange = e => { showAnt = e.target.checked; draw(); };
  $('#showSpd').onchange = e => { bySpeed = e.target.checked; draw(); };
  const upd = (D.updated || '').replace('T', ' ').replace('Z', ' UTC');
  $('#sub').textContent = `הערכה, לא מדידה: לכל ${D.step} מטר מסילה — האנטנה הקרובה של המפעיל, מנהרות וחתכים מ-OSM, ומהירות הנסיעה בפועל ב-${D.days} הימים האחרונים. עודכן ${upd}.`;
  draw();
  method();
  prewarm();
  routeInit();
}

// אחרי הציור הראשון: מחשבים ברקע את המרחקים לכל שילוב (מפעיל, דור), אחד בכל
// פסק זמן פנוי — כך כל לחיצה על קטגוריה מוצאת את המטמון מוכן ומציירת מיד
function prewarm() {
  const todo = [];
  for (const g of ['all', '4', '5']) for (const o of D.ops) todo.push([o.code, g]);
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 60));
  const step = () => {
    const nx = todo.shift(); if (!nx) return;
    const saved = gen; gen = nx[1];
    try { distArr(nx[0]); } finally { gen = saved; }
    idle(step);
  };
  idle(step);
}

function draw() {
  layer.clearLayers();
  const all = op === 'all';
  const f = (TRAINS.find(t => t.code === train) || TRAINS[1]).f;
  let curSpd = null;
  const DA = {}; for (const o of D.ops) if (all || o.code === op) DA[o.code] = distArr(o.code);
  const dOf = (p, code) => { const v = DA[code][p[9]]; return v < 0 ? null : v; };
  const scoreOf = p => { if (!all) return scoreFor(p[2], dOf(p, op), curSpd, f); const v = D.ops.map(o => scoreFor(p[2], dOf(p, o.code), curSpd, f)).sort(); return v[1]; };
  const tot = [0, 0, 0, 0];
  let km = 0;
  for (const [key, s] of Object.entries(D.segs)) {
    const [a, b] = key.split('-');
    const name = `${D.stations[a] || a} ↔ ${D.stations[b] || b}`;
    const pts = s.pts;
    curSpd = s.spd;
    km += s.m / 1000;
    // רצפים של אותו צבע → פוליליין אחד (פחות אובייקטים במפה)
    let run = [], runC = null, runInfo = null;
    const flush = () => {
      if (run.length < 2) return;
      const pl = L.polyline(run, {color: runC, weight: 6, opacity: .9, lineCap: 'round', renderer: RENDERER});
      const inf = runInfo;
      pl.bindPopup(() => `<b>${esc(name)}</b><br>${inf.struct ? '🕳️ ' + STRUCT[inf.struct] + '<br>' : ''}` +
        `${bySpeed ? '' : 'קליטה משוערת: <b>' + GNAME[inf.sc] + '</b><br>'}` +
        (all ? D.ops.map((o, k) => { const v = scoreFor(inf.p[2], dOf(inf.p, o.code), s.spd, f); return `${esc(o.name)}: <b style="color:${GCOL[v]}">${GNAME[v]}</b>`; }).join(' · ') + '<br>' : `אנטנה קרובה של ${esc(opName())}: ${inf.d == null ? 'מעל 8 ק"מ' : inf.d < 1000 ? inf.d + ' מ׳' : (inf.d / 1000).toFixed(1) + ' ק"מ'}<br>`) +
        `מהירות ממוצעת במקטע: ${s.spd == null ? '—' : s.spd + ' קמ"ש'} (${s.n} נסיעות)`);
      layer.addLayer(pl);
    };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], sc = scoreOf(p);
      tot[sc]++;
      const c = bySpeed ? SCOL(s.spd) : GCOL[sc];
      if (c !== runC) { if (run.length) { run.push([p[0], p[1]]); flush(); } run = [[p[0], p[1]]]; runC = c; runInfo = {sc, d: all ? null : dOf(p, op), struct: p[2], p}; }
      else run.push([p[0], p[1]]);
    }
    flush();
  }
  const n = tot.reduce((a, b) => a + b, 0);
  $('#stats').innerHTML = [3, 2, 1, 0].map(i => `<div style="border-color:${GCOL[i]}"><b>${Math.round(100 * tot[i] / n)}%</b><span>${GNAME[i]} · ${(tot[i] * D.step / 1000).toFixed(0)} ק"מ</span></div>`).join('');
  $('#legend').innerHTML = bySpeed
    ? [['#00A65A', 'עד 60 קמ"ש'], ['#F4B400', '60–100'], ['#F26B1D', '100–130'], ['#D7263D', 'מעל 130'], ['#8A94A3', 'אין נתון']].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')
    : [3, 2, 1, 0].map(i => `<span><i style="background:${GCOL[i]}"></i>${GNAME[i]}</span>`).join('') + `<span>· סה"כ ${km.toFixed(0)} ק"מ מסילה בין תחנות</span>` +
      (showAnt ? '<span class="sep"></span>' + (all ? D.ops : D.ops.filter(o => o.code === op)).map(o => `<span><i class="dot" style="background:${BRAND[o.code]}"></i>אנטנות ${esc(o.name)}</span>`).join('') : '') +
      (all ? '<span>· המסילה ב"כל החברות": הציון האמצעי מבין השלוש</span>' : '');
  drawAnt();
  if (ROUTE) routeRender();
}

// ---------------------------------------------------------------- מוצא → יעד
function routeInit() {
  const names = Object.entries(D.stations).sort((a, b) => a[1].localeCompare(b[1], 'he'));
  const opts = names.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('#rFrom').insertAdjacentHTML('beforeend', opts); $('#rTo').insertAdjacentHTML('beforeend', opts);
  const on = () => routeFind();
  $('#rFrom').onchange = on; $('#rTo').onchange = on;
  $('#rClear').onclick = () => { $('#rFrom').value = ''; $('#rTo').value = ''; ROUTE = null; $('#rOut').innerHTML = ''; $('#rClear').hidden = true; if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; } };
}
function segKey(a, b) { return String(a) < String(b) ? `${a}-${b}` : `${b}-${a}`; }
// כל הקווים האמיתיים שעוברים במוצא וביעד (בשני הכיוונים), מקוצרים לקטע שביניהם; מאוחדים לפי רצף התחנות
function routeCandidates(from, to) {
  const by = new Map();
  for (const r of D.routes) {
    const i = r.s.indexOf(+from), j = r.s.indexOf(+to);
    if (i < 0 || j < 0 || i === j) continue;
    const slice = i < j ? r.s.slice(i, j + 1) : r.s.slice(j, i + 1).reverse();
    const key = slice.join('>');
    const e = by.get(key) || {stops: slice, n: 0, names: new Set(), full: null};
    e.n += r.n; e.names.add(r.nm);
    if (!e.full || r.s.length > e.full.length) e.full = r.s;   // הקו הארוך ביותר שעובר ברצף — לשם
    by.set(key, e);
  }
  let out = [...by.values()].filter(e => e.stops.slice(1).every((b, k) => D.segs[segKey(e.stops[k], b)]));
  out.forEach(e => {
    e.km = e.stops.slice(1).reduce((t, b, k) => t + (D.segs[segKey(e.stops[k], b)] || {m: 0}).m, 0) / 1000;
    // תאי רשת (~1 ק"מ) שהמסלול עובר בהם — כדי לזהות קווים שונים על אותה מסילה (מהיר / עוצר בכל תחנה)
    e.cells = new Set();
    for (let k = 1; k < e.stops.length; k++) for (const p of D.segs[segKey(e.stops[k - 1], e.stops[k])].pts) e.cells.add(`${Math.floor(p[0] * 100)}_${Math.floor(p[1] * 100)}`);
    // שם הקו מכיוון המוצא: אם בקו המלא היעד לפני המוצא — הופכים
    if (e.full.indexOf(+from) > e.full.indexOf(+to)) e.full = [...e.full].reverse();
  });
  out.sort((a, b) => b.n - a.n);
  // איחוד: אותה מסילה (חפיפה של 85% בתאים) = מסלול אחד, בשם הקו הנפוץ ביותר (שלמה 20.09: "פשוט תרשום קו אשקלון - באר שבע")
  const merged = [];
  for (const e of out) {
    const same = merged.find(m => { let inter = 0; for (const c of e.cells) if (m.cells.has(c)) inter++; return inter / Math.max(e.cells.size, m.cells.size) >= 0.85; });
    if (same) { same.n += e.n; if (e.stops.length > same.stops.length) same.stops = e.stops; }
    else merged.push(e);
  }
  merged.sort((a, b) => b.n - a.n);
  return merged;
}
function routeFind() {
  const from = $('#rFrom').value, to = $('#rTo').value;
  $('#rClear').hidden = !(from || to);
  if (!from || !to) return;
  if (from === to) { $('#rOut').innerHTML = '<p class="rnote">בחר שתי תחנות שונות</p>'; return; }
  const cands = routeCandidates(from, to);
  if (!cands.length) { ROUTE = null; $('#rOut').innerHTML = '<p class="rnote">לא נמצא קו ישיר בין שתי התחנות ב-7 הימים האחרונים (אולי נדרשת החלפה)</p>'; if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; } return; }
  ROUTE = {cands, sel: 0};
  routeRender();
}
// כמה ק"מ בכל דרגה לכל חברה לאורך המסלול, לפי הדור וסוג הרכבת שנבחרו
function routeScores(stops) {
  const f = (TRAINS.find(t => t.code === train) || TRAINS[1]).f;
  const res = D.ops.map(o => ({code: o.code, name: o.name, km: [0, 0, 0, 0]}));
  const DA = D.ops.map(o => distArr(o.code));
  for (let k = 1; k < stops.length; k++) {
    const s = D.segs[segKey(stops[k - 1], stops[k])]; if (!s) continue;
    for (const p of s.pts) D.ops.forEach((o, oi) => { const d = DA[oi][p[9]]; res[oi].km[scoreFor(p[2], d < 0 ? null : d, s.spd, f)] += D.step / 1000; });
  }
  for (const r of res) { const tot = r.km.reduce((a, b) => a + b, 0) || 1; r.pct = r.km.map(v => v / tot); r.mean = (3 * r.km[3] + 2 * r.km[2] + r.km[1]) / (3 * tot); }
  res.sort((a, b) => b.mean - a.mean);
  return res;
}
function lineName(e) { const a = e.stops[0], b = e.stops[e.stops.length - 1]; return `קו ${D.stations[a] || a} - ${D.stations[b] || b}`; }
function fullName(e) { const a = e.full[0], b = e.full[e.full.length - 1]; return `${D.stations[a] || a} - ${D.stations[b] || b}`; }
function routeRender() {
  if (!ROUTE) return;
  const {cands, sel} = ROUTE, c = cands[sel];
  const via = (e) => { const mids = e.stops.slice(1, -1); return mids.length ? 'דרך ' + esc(D.stations[mids[Math.floor(mids.length / 2)]] || '') : 'ישיר'; };
  const nInter = (e) => { const n = e.stops.length - 2; return n === 0 ? 'בלי עצירות ביניים' : n === 1 ? 'תחנת ביניים אחת' : n + ' תחנות ביניים'; };
  let h = '';
  if (cands.length > 1) h += `<p class="rnote">יש ${cands.length} מסלולים שונים בין התחנות — בחר:</p><div class="rcands">` + cands.map((e, i) => `<button type="button" class="rcand ${i === sel ? 'on' : ''}" data-i="${i}">${esc(lineName(e))}<small>${nInter(e)} · ${e.km.toFixed(0)} ק"מ · ${via(e)}</small></button>`).join('') + '</div>';
  const sc = routeScores(c.stops);
  const best = sc[0], tie = sc.filter(r => Math.abs(r.mean - best.mean) < 0.005);
  h += `<div class="rres"><p class="rnote"><b>${esc(lineName(c))}</b> (חלק מהקו ${esc(fullName(c))}) · ${c.km.toFixed(0)} ק"מ · ${nInter(c)} · ${c.n} נסיעות בשבוע האחרון · לפי ${esc((TRAINS.find(t => t.code === train) || {}).name || '')}${gen === 'all' ? '' : gen === '5' ? ' · דור 5' : ' · דור 4 ומעלה'}</p>
    <table><thead><tr><th>חברה</th><th>טובה</th><th>סבירה</th><th>חלשה</th><th>אין</th><th></th></tr></thead><tbody>` +
    sc.map((r, i) => `<tr class="${i === 0 ? 'best' : ''}"><td style="color:${BRAND[r.code]}">${esc(r.name)}${tie.includes(r) && tie.length < sc.length ? '<span class="crown">הכי טובה</span>' : ''}</td>` +
      [3, 2, 1, 0].map(g => `<td>${Math.round(100 * r.pct[g])}%</td>`).join('') +
      `<td><div class="bar">${[3, 2, 1, 0].map(g => `<i style="width:${100 * r.pct[g]}%;background:${GCOL[g]}"></i>`).join('')}</div></td></tr>`).join('') +
    `</tbody></table>${tie.length === sc.length ? '<p class="rnote">אין הבדל בין החברות בקטע הזה</p>' : ''}</div>`;
  $('#rOut').innerHTML = h;
  $('#rOut').querySelectorAll('.rcand').forEach(b => b.onclick = () => { ROUTE.sel = +b.dataset.i; routeRender(); });
  // הדגשה במפה: הילה כהה מתחת למסלול, ומיקוד עליו
  if (routeLayer) map.removeLayer(routeLayer);
  const lines = [];
  for (let k = 1; k < c.stops.length; k++) { const s = D.segs[segKey(c.stops[k - 1], c.stops[k])]; if (s) lines.push(s.pts.map(p => [p[0], p[1]])); }
  routeLayer = L.polyline(lines, {color: '#101418', weight: 14, opacity: .35, lineCap: 'round', renderer: RENDERER, interactive: false}).addTo(map);
  routeLayer.bringToBack();
  map.fitBounds(routeLayer.getBounds().pad(0.1));
}

function opName() { return op === 'all' ? 'כל החברות' : (D.ops.find(o => o.code === op) || {}).name || op; }

// רדיוס כיסוי משוער לפי סוג האתר (מטרים) — תורן קרקעי מכסה הרבה, אתר זעיר כמעט כלום
const RADIUS = {'תורן קרקעי': 3000, 'תורן על הגג': 2000, 'אנטנת עוקץ': 1500, 'אנטנה משתפלת': 1500, 'אתר זעיר פנימי': 300, 'אתר זעיר חיצוני': 400, 'מתקן גישה אלחוטי': 300};
// שכבת האנטנות על קנבס אחד: נקודה קטנה בצבע החברה לכל אתר (שלמה 19.09:
// אזורי כיסוי משוערים כיסו את כל המפה ולא אמרו כלום).
const CoverLayer = L.Layer.extend({
  onAdd(m) { this._m = m; this._c = L.DomUtil.create('canvas', 'leaflet-zoom-animated'); this._c.style.pointerEvents = 'none'; this._c.style.position = 'absolute';
    const pane = m.getPanes().overlayPane; pane.insertBefore(this._c, pane.firstChild); /* מתחת למסילה */ m.on('moveend zoomend resize viewreset', this._draw, this); m.on('zoomanim', this._anim, this); this._draw(); },
  onRemove(m) { m.off('moveend zoomend resize viewreset', this._draw, this); m.off('zoomanim', this._anim, this); this._c.remove(); },
  // בזמן אנימציית הזום הקנבס נמתח יחד עם המפה (במקום להיעלם ולחזור אחרי שנייה)
  _anim(e) { const m = this._m, scale = m.getZoomScale(e.zoom), off = m._latLngToNewLayerPoint(this._nw, e.zoom, e.center); L.DomUtil.setTransform(this._c, off, scale); },
  _draw() {
    const m = this._m, sz = m.getSize(), c = this._c;
    c.width = sz.x; c.height = sz.y;
    const tl = m.containerPointToLayerPoint([0, 0]); L.DomUtil.setPosition(c, tl); this._nw = m.containerPointToLatLng([0, 0]);
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, sz.x, sz.y);
    const b = m.getBounds().pad(0.1);
    const z = m.getZoom(), r = z >= 13 ? 4 : z >= 10 ? 3 : z >= 8 ? 2 : 1.2;   // מרוחק: נקודות זעירות, שלא יכסו את המסילה
    const codes = op === 'all' ? D.ops.map(o => o.code) : [op];
    for (const code of codes) {
      ctx.fillStyle = BRAND[code]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
      for (const a of D.antennas) {
        if (a[2] !== code || !hasGen(a, gen) || !b.contains([a[0], a[1]])) continue;
        const p = m.latLngToContainerPoint([a[0], a[1]]);
        ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill(); if (r >= 3) ctx.stroke();
    }
  },
});
function drawAnt() {
  if (cover) { map.removeLayer(cover); cover = null; }
  if (!showAnt) return;
  cover = new CoverLayer().addTo(map);
}

function method() {
  $('#method').innerHTML = `<h2>איך זה מחושב</h2>
  <p class="dim">מפה עצמאית מנתונים פתוחים. אינה מטעם פלאפון, סלקום, פרטנר או הוט, והשמות מופיעים רק כדי לציין למי שייכות האנטנות.</p>
  <p>זו <b>הערכה מנתונים פתוחים</b>, לא מדידת קליטה. השידור של הרכבת עצמה (דאטאבוס) עובר ברשת נפרדת ולכן לא משמש כאן כעדות לקליטה, רק כמקור למהירות.</p>
  <ul>
    <li><b>אנטנות</b> — כל נקודה היא אתר שידור פעיל, בצבע החברה; מאגר "אנטנות סלולריות פעילות" של המשרד להגנת הסביבה (data.gov.il), ${D.antennas.length.toLocaleString('he-IL')} אתרים בטווח 8 ק"מ מהמסילה. PHI היא התשתית המשותפת של פרטנר והוט.</li>
    <li><b>מנהרות וחתכים</b> — מסומנים על המסילה ב-OpenStreetMap (${D.tunnels.length} מנהרות בשם: ${esc(D.tunnels.join(', '))}). במנהרה הציון הוא "אין קליטה" גם אם הותקנה בה תשתית פנימית, כי אין על כך מידע פתוח.</li>
    <li><b>מהירות</b> — הזמן בפועל בין תחנות עוקבות (לו"ז + איחור שנמדד) מול אורך המסילה, חציון על ${D.days} הימים האחרונים. מעל 120 קמ"ש הציון יורד דרגה, כי מסירה בין תאים נכשלת יותר במהירות.</li>
    <li><b>הציון</b> — עד 1.5 ק"מ מאנטנה: טובה; עד 3.5: סבירה; עד 6: חלשה; מעבר לזה: אין. חתך מוריד דרגה. אין כאן קו ראייה וטופוגרפיה עדיין.</li>
    <li><b>דור 4 / דור 5</b> — לפי עמודת "טכנולוגיית שידור" במאגר. "דור 5" מציג רק אתרים שרשום בהם דור 5; "דור 4 ומעלה" כולל גם אתרים שהטכנולוגיה שלהם רשומה בקוד מספרי לא מפוענח (כשליש מהמאגר), כי כל אתר פעיל היום משדר לפחות דור 4. הדור משפיע על מהירות הגלישה, לא על עצם הקליטה.</li>
    <li><b>סוג הרכבת</b> — הקרון עצמו חוסם, והמקדם שלו מכווץ את טווחי המרחק שלמעלה (1.0 = כמו בחוץ).
      <b>מה מדוד בספרות</b>: זכוכית רכבת עם ציפוי מתכתי (בידוד תרמי) מחלישה את האות ב-10 עד 40 dB, ובקרון טיפוסי ההפסד הכולל הוא 25–35 dB
      (<a href="https://assets.publishing.service.gov.uk/media/618d299cd3bf7f055b29332f/mobile-connectivity-in-rolling-stock-radio-frequency-attenuation-characteristics.pdf" target="_blank" rel="noopener">משרד התחבורה הבריטי, 2021</a>;
      <a href="https://arxiv.org/pdf/2109.04354" target="_blank" rel="noopener">סקירה, 2021</a>).
      חריצת לייזר של 2.5% מהציפוי מורידה את ההפסד של החלון לפחות מ-3 dB, שיפור של 27 dB
      (<a href="https://actu.epfl.ch/news/train-windows-that-combine-mobile-reception-and-th/" target="_blank" rel="noopener">EPFL, שווייץ, 2016</a>;
      <a href="https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/iet-map.2016.0685" target="_blank" rel="noopener">המאמר המדעי</a>;
      <a href="https://press.siemens.com/global/en/pressrelease/siemens-enhances-cell-phone-reception-trains-thanks-window-pane-solution" target="_blank" rel="noopener">סימנס</a>).
      <b>מה לא מדוד</b>: איזה ציפוי יש בכל דגם של רכבת ישראל, ואיזה קרונות חורצו. לכן המקדמים כאן (מחורצים 1.0, ויאג׳ו 0.7, טווינדקס 0.55, דזירו HC 0.4) הם
      <b>הערכה של מפתח האתר</b> שמתרגמת את הטווחים האלה לדרגות, במכוון מתונה: תרגום פיזיקלי מלא של 25 dB היה מכווץ את הטווח פי 6–7 ומצייר את כל המסילה באדום, וזה לא תואם את הניסיון בפועל.
      אם יש בידך מדידה מקרון ישראלי, המקדמים מתעדכנים בשורה אחת.
      <b>התוכנית בישראל</b>: משרד התחבורה הקצה 68 מיליון ₪ (יולי 2025) לחריצת כל 800 הקרונות תוך שנתיים וחצי; עד כה כ-30 קרונות, ואין רשימה פומבית איזה
      (<a href="https://www.israelhayom.co.il/news/transportation/article/18380246" target="_blank" rel="noopener">ישראל היום</a>;
      <a href="https://www.geektime.co.il/israel-rail-train-is-about-to-get-cellular-reception/" target="_blank" rel="noopener">גיקטיים</a>;
      <a href="https://www.israelhayom.co.il/news/transportation/article/19622955" target="_blank" rel="noopener">למה עדיין אין קליטה</a>).
      רכבת ישראל לא מפרסמת איזה ציוד רץ על איזו רכבת, ולכן הבחירה כאן ידנית.</li>
  </ul>`;
}

load('../data/reception.json').then(d => { D = d; init(); }).catch(e => { $('#map').innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; });
})();
