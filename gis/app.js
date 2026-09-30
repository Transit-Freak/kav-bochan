// GIS הקו הבוחן — הלוגיקה של העמוד (שלמה 30.09: "כלי GIS שמאחד את מדדי האמינות, הצי,
// קו פח, קו באג וכל התכניות של משרד התחבורה — שיהיה כמו GIS, לא כמו שאר האתרים שלנו").
// Leaflet עם רינדור קנבס לשכבות הגדולות. כל שכבה נטענת רק כשמסמנים אותה.
// הנתונים: data/own/* (tools/gis_build.py) ו-data/catalog.json + data/mot/* (tools/gis_mot.py).
(function () {
'use strict';

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = v => v == null || v === '' ? '—' : Number(v).toLocaleString('he-IL');
const fmt1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('he-IL');
const LATER = 'השכבה תיטען אחרי הריצה הלילית הבאה';
const load = url => fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Math.floor(Date.now() / 600000)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const msg = t => { $('#s-msg').textContent = t || ''; };
const isMobile = () => matchMedia('(max-width: 760px)').matches;

// ---------------------------------------------------------------- מפה ורקעים
const BASES = {
  osm: {t: 'OpenStreetMap רגילה', u: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', a: '© תורמי OpenStreetMap', o: {maxZoom: 19}},
  light: {t: 'בהירה (CARTO Positron)', u: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', a: '© OpenStreetMap © CARTO', o: {maxZoom: 20, subdomains: 'abcd'}},
  dark: {t: 'כהה (CARTO Dark)', u: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', a: '© OpenStreetMap © CARTO', o: {maxZoom: 20, subdomains: 'abcd'}},
  sat: {t: 'תצלום אוויר (Esri)', u: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', a: 'Esri, Maxar, Earthstar Geographics', o: {maxZoom: 19}},
  none: {t: 'בלי רקע', u: null},
};
const map = L.map('map', {preferCanvas: true, zoomControl: false, attributionControl: true}).setView([31.75, 34.95], 8);
L.control.zoom({position: 'topleft', zoomInTitle: 'הגדלה', zoomOutTitle: 'הקטנה'}).addTo(map);
L.control.scale({metric: true, imperial: false, position: 'bottomleft'}).addTo(map);
map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
const canvas = L.canvas({padding: 0.4, tolerance: 4});
// נקודות בשכבה נפרדת מעל הקווים והפוליגונים — כדי שלחיצה על תחנה תזהה את התחנה ולא את הקו שעובר בה
map.createPane('pts').style.zIndex = 450;
const canvasPts = L.canvas({padding: 0.4, tolerance: 4, pane: 'pts'});
let baseLayer = null, baseKey = 'light';
function setBase(k) {
  if (baseLayer) map.removeLayer(baseLayer);
  baseKey = k; const b = BASES[k];
  baseLayer = b.u ? L.tileLayer(b.u, Object.assign({attribution: b.a}, b.o)).addTo(map) : null;
  if (baseLayer) baseLayer.bringToBack();
  try { localStorage.setItem('gis.base', k); } catch (e) {}
  renderBaseMenu();
}
function renderBaseMenu() {
  $('#basemenu').innerHTML = Object.entries(BASES).map(([k, b]) => `<button data-k="${k}" class="${k === baseKey ? 'on' : ''}">${esc(b.t)}</button>`).join('');
}
try { baseKey = localStorage.getItem('gis.base') || 'light'; } catch (e) {}
setBase(BASES[baseKey] ? baseKey : 'light');
$('#basemenu').onclick = e => { const b = e.target.closest('button'); if (b) { setBase(b.dataset.k); $('#basemenu').hidden = true; $('#b-base').classList.remove('on'); } };
$('#b-base').onclick = () => { const m = $('#basemenu'); m.hidden = !m.hidden; $('#b-base').classList.toggle('on', !m.hidden); };

// שורת מצב: קואורדינטות וזום
map.on('mousemove', e => { $('#s-coord').textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`; });
const zoomTxt = () => { $('#s-zoom').textContent = 'זום ' + map.getZoom(); };
map.on('zoomend', zoomTxt); zoomTxt();

// ---------------------------------------------------------------- סגנונות
const RAMP = [[85, '#16a34a'], [75, '#84cc16'], [65, '#f59e0b'], [50, '#f97316'], [-1, '#dc2626']];
const onColor = v => v == null ? '#94a3b8' : RAMP.find(([t]) => v >= t)[1];
const onLegend = unit => [...RAMP.map(([t, c], i) => ({c, t: i === 0 ? `${t}% ומעלה ${unit}` : t < 0 ? `מתחת ל-${RAMP[i - 1][0]}%` : `${t}%–${RAMP[i - 1][0]}%`})), {c: '#94a3b8', t: 'אין מדידות'}];
const VERDICT = {'אמיתי': '#dc2626', 'ספק': '#f59e0b', 'לא ניתן להשוואה': '#64748b', 'כיסוי לגיטימי': '#16a34a', 'רעש': '#a3a3a3'};
const SCORE = [[70, '#7f1d1d'], [50, '#dc2626'], [35, '#f97316'], [25, '#f59e0b']];
const scoreColor = v => (SCORE.find(([t]) => v >= t) || SCORE[3])[1];
const HOODRAMP = [[80, '#15803d'], [65, '#65a30d'], [50, '#eab308'], [35, '#f97316'], [0, '#b91c1c']];
const hoodColor = v => v == null ? '#cbd5e1' : HOODRAMP.find(([t]) => v >= t)[1];
const PALETTE = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f', '#c026d3', '#0f766e', '#b45309', '#1d4ed8', '#be123c', '#15803d'];
const hashColor = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

// ---------------------------------------------------------------- רישום שכבות
// כל שכבה: id, title, group, topic, kind ('points' טבלאי | 'geojson'), url, style, legend, link, labels
const LAYERS = [];
const byId = {};
function reg(l) { l.opacity = l.opacity == null ? 1 : l.opacity; l.state = 'idle'; LAYERS.push(l); byId[l.id] = l; return l; }

const G_OWN = 'הכלים של הקו הבוחן', G_HOOD = 'מדד לכל שכונה', G_NOW = 'מצב קיים', G_FUT = 'תכניות עתידיות';
const TOPIC_OPEN = ['תחבורה ציבורית', 'רכבת, רק"ל ומטרו'];

reg({id: 'bus', title: 'מדד דיוק האוטובוסים — לפי תחנה', group: G_OWN, kind: 'points', url: 'data/own/bus-stops.json', minZoomHint: 11,
  color: p => onColor(p.on), radius: () => 3.2, link: p => ['../bus/', 'למדד דיוק האוטובוסים'],
  legend: () => ({type: 'pt', items: onLegend('בזמן'), note: 'אחוז ההגעות בזמן לתחנה ב-30 הימים האחרונים (כל הקווים), מדאטאבוס. "נסיעות ביום חול" — מלוח הזמנים (GTFS).'}),
  sw: '#16a34a'});
reg({id: 'rail', title: 'מדד אמינות הרכבת — לפי תחנה', group: G_OWN, kind: 'points', url: 'data/own/rail-stations.json',
  color: p => onColor(p.on), radius: () => 7, link: () => ['../rail/', 'למדד אמינות הרכבת'],
  legend: () => ({type: 'pt', items: onLegend('בזמן'), note: 'רכבות שהגיעו לתחנה עד 5 דקות מהלו"ז, 30 ימים אחרונים.'}), sw: '#0ea5e9'});
reg({id: 'kavpach', title: 'קו פח — קווים בזבזניים', group: G_OWN, kind: 'geojson', url: 'data/own/kavpach.json',
  style: p => ({color: scoreColor(p.score), weight: 2.5, opacity: 0.85}), link: () => ['../', 'לקו פח'],
  labels: {line: 'קו', makat: 'מק"ט', origin: 'מוצא', dest: 'יעד', district: 'מחוז', category: 'קטגוריה', score: 'ציון קו פח', trips: 'נסיעות (בנתוני קו פח)', avgRiders: 'נוסעים בממוצע לנסיעה', wastedKm: 'ק"מ מבוזבזים', avgCost: 'עלות לנוסע (₪)'},
  legend: () => ({type: 'ln', items: SCORE.map(([t, c], i) => ({c, t: i === 0 ? `ציון ${t} ומעלה` : `ציון ${t}–${SCORE[i - 1][0]}`})), note: 'קווים שקיבלו בקו פח ציון 25 ומעלה (ברירת המחדל של האתר). המסלול: החלופה הראשית בכל כיוון, מ-GTFS.'}), sw: '#dc2626'});
reg({id: 'kavbug', title: 'קו באג — קטעי מסלול חשודים', group: G_OWN, kind: 'geojson', url: 'data/own/kavbug.json',
  style: p => ({color: VERDICT[p.verdict] || '#64748b', weight: 4, opacity: 0.9}), pointColor: p => VERDICT[p.verdict] || '#64748b',
  link: () => ['https://transit-freak.github.io/kav-bug/', 'לקו באג'],
  labels: {line: 'קו', operator: 'מפעיל', dir: 'כיוון', type: 'סוג', from: 'מתחנה', to: 'עד תחנה', city: 'יישוב', excessKm: 'ק"מ עודפים', tripsDay: 'נסיעות ביום', wasteDayKm: 'ק"מ מבוזבזים ביום', ratio: 'יחס לדרך הקצרה', verdict: 'הכרעה', reason: 'נימוק'},
  legend: () => ({type: 'ln', items: Object.entries(VERDICT).map(([t, c]) => ({c, t}))}), sw: '#f59e0b'});
reg({id: 'skip', title: 'הקו המדלג — תחנות שמדלגים עליהן', group: G_OWN, kind: 'points', url: 'data/own/skip-stops.json',
  color: () => '#7c3aed', radius: () => 4.5, link: () => ['../skip-stops/', 'להקו המדלג'],
  legend: () => ({type: 'pt', items: [{c: '#7c3aed', t: 'תחנה שהקו עובר לידה ולא עוצר'}]}), sw: '#7c3aed'});
reg({id: 'parks', title: 'נגישות אזורי תעשייה', group: G_OWN, kind: 'geojson', url: 'data/own/parks.json',
  style: p => ({color: '#1e3a8a', weight: 1.5, fillColor: onColor(p.cov == null ? null : p.cov * (p.cov <= 1 ? 100 : 1)), fillOpacity: 0.45}),
  link: () => ['../parks/', 'לנגישות אזורי תעשייה'],
  labels: {name: 'שם', city: 'יישוב', area: 'שטח (קמ"ר)', lines: 'קווים', cov: 'כיסוי', zt: 'סוג', f: null},
  legend: () => ({type: 'fl', items: onLegend('כיסוי'), note: 'הצבע לפי שיעור הכיסוי בתחבורה ציבורית כפי שחושב בכלי אזורי התעשייה.'}), sw: '#1e3a8a'});
reg({id: 'fleet', title: 'צי הרכבים — לפי יישוב', group: G_OWN, kind: 'points', url: 'data/own/fleet-cities.json',
  color: () => '#334155', radius: p => Math.max(4, Math.min(22, Math.sqrt(p.total || 0) / 3.5)), link: () => ['../fleet/', 'לצי הרכבים'],
  legend: () => ({type: 'pt', items: [{c: '#334155', t: 'גודל העיגול — מספר הרכבים השונים ששירתו את היישוב'}], note: 'הנקודה היא מרכז תחום היישוב, לא חניון.'}), sw: '#334155'});
reg({id: 'terminals', title: 'מסופים ותחנות מרכזיות (GTFS)', group: G_OWN, kind: 'points', url: 'data/own/terminals.json',
  color: () => '#0f172a', radius: p => Math.max(5, Math.min(14, Math.sqrt(p.tpd || 0) / 4)), link: () => null,
  legend: () => ({type: 'pt', items: [{c: '#0f172a', t: 'תחנת אב ב-GTFS (מסוף, ת. מרכזית, רכבת)'}], note: 'רק מה שמסומן ב-GTFS כתחנת אב (location_type=1). הגודל — נסיעות ביום חול.'}), sw: '#0f172a'});

// שכונות: גבולות, מדד מורכב, טווח הליכה
reg({id: 'hoods', title: 'גבולות שכונות', group: G_HOOD, kind: 'geojson', url: 'data/own/hoods.json',
  style: () => ({color: '#0f172a', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.06}), labels: {i: null, name: 'שכונה', city: 'יישוב', km2: 'שטח (קמ"ר)'},
  onclick: p => selectHood(p.i), link: () => { const s = byId.hoods.meta && byId.hoods.meta.source; return s && s.url ? [s.url, 'מקור הגבולות'] : null; },
  extra: () => `<p class="mut">${hoodSourceNote()}</p>`,
  legend: () => ({type: 'fl', items: [{c: '#e0f2fe', t: 'שכונה — לחיצה בוחרת אותה'}], note: hoodSourceNote()}), sw: '#38bdf8'});
reg({id: 'hoodscore', title: 'מדד התחבורה הציבורית לשכונה', group: G_HOOD, kind: 'geojson', url: 'data/own/hoods.json', needs: ['bus'],
  style: p => ({color: '#334155', weight: 0.6, fillColor: hoodColor(hoodScore(p.i)), fillOpacity: 0.6}), labels: {i: null, name: 'שכונה', city: 'יישוב', km2: 'שטח (קמ"ר)'},
  extra: p => hoodExtra(p.i), onclick: p => selectHood(p.i),
  legend: () => ({type: 'fl', items: HOODRAMP.map(([t, c], i) => ({c, t: i === 0 ? `${t} ומעלה` : `${t}–${HOODRAMP[i - 1][0]}`})).concat([{c: '#cbd5e1', t: 'אין תחנות בטווח'}]), note: SCORE_TXT()}), sw: '#65a30d'});
reg({id: 'walk', title: 'טווח הליכה מתחנות', group: G_HOOD, kind: 'custom', needs: ['bus'], sw: '#0ea5e9',
  legend: () => ({type: 'fl', items: [{c: '#bae6fd', t: `עיגול ברדיוס ${RADIUS} מ' סביב כל תחנה`}], note: 'מוצג מזום 13 ומעלה, לתחנות שבתחום המפה. את הרדיוס בוחרים בלשונית "שכונה".'})});

// ---------------------------------------------------------------- טעינה ונרמול
// כל שכבה נטענת פעם אחת לרשימת ישויות אחידה: {p: מאפיינים, ll?: [lat,lon], f?: GeoJSON feature}
function normalize(l, d) {
  if (d.type === 'points') {
    l.fields = d.fields; l.labels = Object.assign({}, d.labels, l.labels || {}); l.meta = d;
    l.items = d.rows.map(r => { const p = {}; d.fields.forEach((f, i) => { p[f] = r[i + 2]; }); return {p, ll: [r[1], r[0]]}; });
  } else {
    l.meta = d;
    l.items = (d.features || []).filter(f => f.geometry).map(f => ({p: f.properties || {}, f}));
    if (!l.fields) { const s = new Set(); l.items.slice(0, 300).forEach(it => Object.keys(it.p).forEach(k => s.add(k))); l.fields = [...s]; }
  }
  l.fields = l.fields.filter(f => !(l.labels && l.labels[f] === null));
}
const SHARED = {};
function fetchData(l) {
  if (l.items) return Promise.resolve(l);
  const p = SHARED[l.url] || (SHARED[l.url] = load(l.url));
  return p.then(d => { normalize(l, d); return l; });
}
function ensure(id) { const l = byId[id]; return l.kind === 'custom' ? Promise.resolve(l) : fetchData(l); }

function buildLeaflet(l) {
  if (l.kind === 'custom') return;
  const g = L.featureGroup();
  l.items.forEach((it, idx) => {
    let lay;
    if (it.ll) {
      lay = L.circleMarker(it.ll, {renderer: canvasPts, radius: l.radius ? l.radius(it.p) : 4, color: '#0f172a', weight: 0.6, fillColor: l.color ? l.color(it.p) : l.sw, fillOpacity: 0.9});
    } else {
      const st = l.style ? l.style(it.p) : {color: l.sw, weight: 2, fillColor: l.sw, fillOpacity: 0.25};
      lay = L.geoJSON(it.f, {renderer: canvas, style: () => st,
        pointToLayer: (f, ll) => L.circleMarker(ll, {renderer: canvasPts, radius: 4.5, color: '#0f172a', weight: 0.6, fillColor: l.pointColor ? l.pointColor(it.p) : st.color || l.sw, fillOpacity: 0.9})});
    }
    lay._gis = {l, idx};
    lay.on('click', e => { L.DomEvent.stopPropagation(e); identify(l, idx, e.latlng); });
    it.lay = lay;
    g.addLayer(lay);
  });
  l.lg = g;
  applyOpacity(l);
}
function restyle(l) {
  if (!l.lg) return;
  l.items.forEach(it => {
    if (it.ll) it.lay.setStyle({fillColor: l.color(it.p)});
    else if (l.style) it.lay.setStyle(l.style(it.p));
  });
  applyOpacity(l);
}
function applyOpacity(l) {
  const o = l.opacity;
  if (l.kind === 'custom') { if (l.lg) l.lg.eachLayer(c => c.setStyle({opacity: 0.5 * o, fillOpacity: 0.12 * o})); return; }
  if (!l.lg) return;
  l.items.forEach(it => {
    if (it.ll) it.lay.setStyle({opacity: o, fillOpacity: 0.9 * o});
    else { const st = l.style ? l.style(it.p) : {}; it.lay.setStyle({opacity: (st.opacity || 1) * o, fillOpacity: (st.fillOpacity == null ? 0.25 : st.fillOpacity) * o}); }
  });
}

function setVisible(l, on) {
  l.on = on;
  const row = $(`.lyr[data-id="${l.id}"]`);
  if (row) { row.classList.toggle('on', on); const cb = $('input[type=checkbox]', row); if (cb) cb.checked = on; }
  if (!on) {
    if (l.lg) map.removeLayer(l.lg);
    if (l.id === 'walk') drawWalk();
    renderLegend(); refreshTableLayers(); saveState();
    return Promise.resolve();
  }
  setStatus(l, 'טוען…');
  return Promise.all((l.needs || []).map(ensure)).then(() => ensure(l.id)).then(() => {
    if (!l.on) return;
    if (l.kind === 'custom') { drawWalk(); setStatus(l, ''); renderLegend(); saveState(); return; }
    if (!l.lg) buildLeaflet(l);
    l.lg.addTo(map);
    setStatus(l, '');
    const cnt = row && $('.cnt', row); if (cnt) cnt.textContent = num(l.items.length);
    renderLegend(); refreshTableLayers(); saveState();
  }).catch(err => {
    console.warn('layer', l.id, err && err.message);
    l.on = false;
    if (row) { row.classList.remove('on'); $('input[type=checkbox]', row).checked = false; }
    setStatus(l, LATER, true);
  });
}
function setStatus(l, t, err) {
  const row = $(`.lyr[data-id="${l.id}"]`); if (!row) return;
  const st = $('.st', row); st.textContent = t || ''; st.classList.toggle('err', !!err); st.hidden = !t;
}
function zoomTo(l) {
  (l.kind === 'custom' ? Promise.resolve() : fetchData(l)).then(() => {
    if (!l.on) return setVisible(l, true).then(() => zoomTo(l));
    if (l.lg) { const b = l.lg.getBounds(); if (b.isValid()) map.fitBounds(b, {padding: [20, 20], maxZoom: 16}); }
  }).catch(() => setStatus(l, LATER, true));
}

// ---------------------------------------------------------------- עץ השכבות
let CATALOG = null;
function lyrRow(l) {
  return `<div class="lyr${l.on ? ' on' : ''}" data-id="${esc(l.id)}">
    <div class="lr"><label><input type="checkbox"${l.on ? ' checked' : ''}><span class="sw" style="background:${l.sw || hashColor(l.id)}"></span><span>${esc(l.title)}</span></label>
    <span class="cnt">${l.count != null ? num(l.count) : ''}</span>
    ${l.kind !== 'custom' ? `<button class="ib z" title="התקרבות לשכבה" aria-label="התקרבות לשכבה">⤢</button><button class="ib t" title="טבלת מאפיינים" aria-label="טבלת מאפיינים">▦</button>` : ''}</div>
    <div class="opa">שקיפות <input type="range" min="0.1" max="1" step="0.05" value="${l.opacity}" aria-label="שקיפות"></div>
    <div class="st" hidden></div></div>`;
}
function grpHtml(title, inner, open, count, cls) {
  return `<div class="grp${open ? '' : ' closed'}${cls ? ' ' + cls : ''}"><div class="gh" tabindex="0"><span class="car">▼</span>${esc(title)}<span class="gn">${count != null ? num(count) : ''}</span></div><div class="gb">${inner}</div></div>`;
}
function renderTree() {
  const own = LAYERS.filter(l => l.group === G_OWN), hood = LAYERS.filter(l => l.group === G_HOOD);
  let h = '';
  for (const G of [G_NOW, G_FUT]) {
    const ls = LAYERS.filter(l => l.group === G);
    let inner = '';
    if (!CATALOG) inner = `<div class="note warn">שכבות משרד התחבורה (data.gov.il) עוד לא הורדו. ${LATER}.</div>`;
    else if (!ls.length) inner = `<div class="note">אין שכבות בקבוצה הזו בקטלוג הנוכחי.</div>`;
    else {
      const topics = (CATALOG.topics || []).filter(t => ls.some(l => l.topic === t));
      inner = topics.map(t => { const tl = ls.filter(l => l.topic === t); return grpHtml(t, tl.map(lyrRow).join(''), TOPIC_OPEN.includes(t), tl.length); }).join('');
    }
    h += grpHtml(G + ' — משרד התחבורה', inner, true, ls.length || null);
  }
  h += grpHtml(G_OWN, own.map(lyrRow).join(''), true, own.length);
  h += grpHtml(G_HOOD, hood.map(lyrRow).join(''), true, hood.length);
  if (CATALOG) {
    h += `<div class="note">שכבות משרד התחבורה עודכנו ${esc((CATALOG.updated || '').replace('T', ' ').replace('Z', ''))} · ${num((CATALOG.layers || []).length)} שכבות` +
      ((CATALOG.skipped || []).length ? ` · <button class="linkbtn" id="skipped">${num(CATALOG.skipped.length)} מאגרים בלי גאומטריה</button>` : '') + '</div><div id="skiplist"></div>';
  }
  $('#tree').innerHTML = h;
  const sk = $('#skipped'); if (sk) sk.onclick = () => { $('#skiplist').innerHTML = '<div class="note">' + CATALOG.skipped.map(s => `${esc(s.title || s.dataset)} — ${esc(s.reason)}`).join('<br>') + '</div>'; };
}
$('#tree').addEventListener('click', e => {
  const gh = e.target.closest('.gh'); if (gh) { gh.parentElement.classList.toggle('closed'); return; }
  const row = e.target.closest('.lyr'); if (!row) return; const l = byId[row.dataset.id];
  if (e.target.closest('.z')) zoomTo(l);
  else if (e.target.closest('.t')) openTable(l);
});
$('#tree').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('gh')) e.target.parentElement.classList.toggle('closed'); });
$('#tree').addEventListener('change', e => {
  const row = e.target.closest('.lyr'); if (!row) return; const l = byId[row.dataset.id];
  if (e.target.type === 'checkbox') setVisible(l, e.target.checked);
});
$('#tree').addEventListener('input', e => {
  if (e.target.type !== 'range') return; const l = byId[e.target.closest('.lyr').dataset.id];
  l.opacity = +e.target.value; applyOpacity(l);
});

// ---------------------------------------------------------------- מקרא
function renderLegend() {
  const on = LAYERS.filter(l => l.on);
  if (!on.length) { $('#legend').innerHTML = '<div class="note">אין שכבות פעילות. מסמנים שכבה בלשונית "שכבות".</div>'; return; }
  $('#legend').innerHTML = on.map(l => {
    const lg = l.legend ? l.legend() : {type: l.geom === 'Point' ? 'pt' : l.geom === 'LineString' ? 'ln' : 'fl', items: [{c: l.sw, t: l.title}], note: l.src ? `מקור: <a href="${esc(l.src)}" target="_blank" rel="noopener">data.gov.il</a>${l.modified ? ' · עודכן ' + esc(l.modified.slice(0, 10)) : ''}` : ''};
    const cls = lg.type === 'pt' ? 'pt' : lg.type === 'ln' ? 'ln' : 'fl';
    return `<div class="lg"><h4>${esc(l.title)}</h4>${lg.items.map(i => `<div class="li"><span class="${cls}" style="background:${i.c}"></span>${esc(i.t)}</div>`).join('')}${lg.note ? `<p>${lg.note}</p>` : ''}</div>`;
  }).join('');
}

// ---------------------------------------------------------------- זיהוי (לחיצה על ישות)
let hiLayer = null;
function fmtVal(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? num(v) : fmt1(v);
  if (typeof v === 'object') return esc(JSON.stringify(v));
  const s = String(v);
  return /^https?:\/\//.test(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener">קישור</a>` : esc(s);
}
function popupHtml(l, it) {
  const p = it.p, lab = l.labels || {};
  const title = p.name || p.stop || p.city && l.id === 'fleet' && p.city || (p.line ? 'קו ' + p.line : '') || l.title;
  const rows = (l.fields || Object.keys(p)).filter(f => lab[f] !== null && f in p).map(f => `<tr><td>${esc(lab[f] || f)}</td><td>${fmtVal(p[f])}</td></tr>`).join('');
  const lk = l.link && l.link(p);
  return `<div class="pp"><div class="ly">${esc(l.title)}</div><h5>${esc(title)}</h5><table>${rows}</table>${l.extra ? l.extra(p) : ''}${lk ? `<a class="go" href="${esc(lk[0])}" target="_blank" rel="noopener">${esc(lk[1])} ←</a>` : ''}</div>`;
}
function identify(l, idx, latlng) {
  if (measuring) return;
  const it = l.items[idx];
  if (l.onclick) l.onclick(it.p);
  L.popup({maxWidth: 360, autoPanPaddingTopLeft: [20, 70]}).setLatLng(latlng || (it.ll ? it.ll : it.lay.getBounds().getCenter())).setContent(popupHtml(l, it)).openOn(map);
  markActiveRow(l, idx);
}
function flash(it) {
  if (hiLayer) map.removeLayer(hiLayer);
  hiLayer = it.ll ? L.circleMarker(it.ll, {radius: 14, color: '#06b6d4', weight: 3, fill: false, interactive: false}) :
    L.geoJSON(it.f, {style: {color: '#06b6d4', weight: 5, fill: false}, interactive: false, pointToLayer: (f, ll) => L.circleMarker(ll, {radius: 14, color: '#06b6d4', weight: 3, fill: false})});
  hiLayer.addTo(map);
}
function zoomItem(l, idx) {
  const it = l.items[idx];
  const go = () => {
    if (it.ll) map.setView(it.ll, Math.max(map.getZoom(), 16));
    else { const b = L.geoJSON(it.f).getBounds(); if (b.isValid()) map.fitBounds(b, {padding: [30, 30], maxZoom: 17}); }
    flash(it);
    setTimeout(() => identify(l, idx, it.ll || L.geoJSON(it.f).getBounds().getCenter()), 250);
  };
  if (!l.on) setVisible(l, true).then(go); else go();
}

// ---------------------------------------------------------------- טבלת מאפיינים
let tLayer = null, tSort = {k: null, dir: 1}, tRows = [];
function refreshTableLayers() {
  const sel = $('#t-layer'); const cur = tLayer && tLayer.id;
  const ls = LAYERS.filter(l => l.items && l.kind !== 'custom');
  sel.innerHTML = ls.length ? ls.map(l => `<option value="${esc(l.id)}"${l.id === cur ? ' selected' : ''}>${esc(l.title)}</option>`).join('') : '<option value="">אין שכבות טעונות</option>';
}
function openTable(l) {
  showTable(true);
  (l ? fetchData(l) : Promise.resolve()).then(() => {
    if (l) { tLayer = l; tSort = {k: null, dir: 1}; }
    refreshTableLayers(); renderTable();
    $$('.lyr').forEach(r => r.classList.toggle('active', !!tLayer && r.dataset.id === tLayer.id));
  }).catch(() => { $('#t-grid').innerHTML = `<tr><td>${LATER}</td></tr>`; });
}
function renderTable() {
  const l = tLayer;
  if (!l || !l.items) { $('#t-grid').innerHTML = '<tr><td class="mut">בוחרים שכבה (▦ בעץ השכבות)</td></tr>'; $('#t-count').textContent = ''; return; }
  const q = $('#t-q').value.trim().toLowerCase(), inView = $('#t-view').checked, B = map.getBounds();
  const fields = l.fields || [];
  tRows = [];
  l.items.forEach((it, i) => {
    if (q && !fields.some(f => String(it.p[f] == null ? '' : it.p[f]).toLowerCase().includes(q))) return;
    if (inView) { const ll = it.ll || (it.lay && it.lay.getBounds ? it.lay.getBounds().getCenter() : null); if (ll && !B.contains(ll)) return; }
    tRows.push(i);
  });
  if (tSort.k) {
    const k = tSort.k, d = tSort.dir;
    tRows.sort((a, b) => { const x = l.items[a].p[k], y = l.items[b].p[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he')) * d; });
  }
  const MAX = 400, lab = l.labels || {};
  $('#t-count').textContent = `${num(tRows.length)} מתוך ${num(l.items.length)}` + (tRows.length > MAX ? ` · מוצגות ${MAX} הראשונות` : '');
  $('#t-grid').innerHTML = `<thead><tr>${fields.map(f => `<th data-k="${esc(f)}">${esc(lab[f] || f)}${tSort.k === f ? (tSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>` +
    tRows.slice(0, MAX).map(i => `<tr data-i="${i}">${fields.map(f => { const v = l.items[i].p[f]; return `<td title="${esc(v)}">${typeof v === 'number' ? fmtVal(v) : esc(v)}</td>`; }).join('')}</tr>`).join('') + '</tbody>';
}
function markActiveRow() {}
$('#t-grid').addEventListener('click', e => {
  const th = e.target.closest('th'); if (th) { const k = th.dataset.k; tSort = {k, dir: tSort.k === k ? -tSort.dir : 1}; renderTable(); return; }
  const tr = e.target.closest('tbody tr'); if (tr && tr.dataset.i != null) { zoomItem(tLayer, +tr.dataset.i); if (isMobile()) showTable(false); }
});
$('#t-layer').onchange = e => { const l = byId[e.target.value]; if (l) openTable(l); };
let tqT = null; $('#t-q').oninput = () => { clearTimeout(tqT); tqT = setTimeout(renderTable, 200); };
$('#t-view').onchange = renderTable;
map.on('moveend', () => { if ($('#t-view').checked && !$('#table').hidden) renderTable(); });
$('#t-csv').onclick = () => {
  const l = tLayer; if (!l) return; const fields = l.fields, lab = l.labels || {};
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '﻿' + [fields.map(f => q(lab[f] || f)).concat(l.items[0] && l.items[0].ll ? ['lat', 'lon'] : []).join(',')].concat(
    tRows.map(i => { const it = l.items[i]; return fields.map(f => q(it.p[f])).concat(it.ll ? it.ll : []).join(','); })).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = l.id + '.csv'; a.click();
};
function showTable(on) {
  $('#table').hidden = !on; $('#b-table').classList.toggle('on', on);
  if (on && isMobile()) showSide(false);
  setTimeout(() => map.invalidateSize(), 50);
}
$('#b-table').onclick = () => { if ($('#table').hidden) openTable(tLayer || LAYERS.find(l => l.on && l.items)); else showTable(false); };
$('#t-close').onclick = () => showTable(false);

// ---------------------------------------------------------------- לוח צד ולשוניות
function showSide(on, tab) {
  $('#app').classList.toggle('noside', !on);
  if (on && tab) setTab(tab);
  if (on && isMobile()) showTable(false);
  const cur = on ? ($('.ptabs .on') || {}).dataset.tab : null;
  $('#b-layers').classList.toggle('on', on && cur === 'layers');
  $('#b-legend').classList.toggle('on', on && cur === 'legend');
  $('#b-hood').classList.toggle('on', on && cur === 'hood');
  setTimeout(() => map.invalidateSize(), 60);
}
function setTab(t) {
  $$('.ptabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.pbody [data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
  if (t === 'hood') renderHood();
  if (t === 'legend') renderLegend();
}
$('.ptabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showSide(true, b.dataset.tab); });
$('#side-close').onclick = () => showSide(false);
const sideBtn = tab => () => { const open = !$('#app').classList.contains('noside') && ($('.ptabs .on') || {}).dataset.tab === tab; showSide(!open, tab); };
$('#b-layers').onclick = sideBtn('layers'); $('#b-legend').onclick = sideBtn('legend'); $('#b-hood').onclick = sideBtn('hood');

// ---------------------------------------------------------------- מדידת מרחק
let measuring = false, mPts = [], mLine = null, mMarks = null;
function mUpdate() {
  if (mLine) mLine.setLatLngs(mPts);
  let d = 0; for (let i = 1; i < mPts.length; i++) d += map.distance(mPts[i - 1], mPts[i]);
  $('#mdist').textContent = d >= 1000 ? (d / 1000).toLocaleString('he-IL', {maximumFractionDigits: 2}) + ' ק"מ' : Math.round(d) + ' מ׳';
}
function measure(on) {
  measuring = on; $('#measurebox').hidden = !on; $('#b-measure').classList.toggle('on', on);
  map.getContainer().style.cursor = on ? 'crosshair' : '';
  if (on) { map.doubleClickZoom.disable(); mPts = []; mLine = L.polyline([], {color: '#f59e0b', weight: 3, dashArray: '6 6', interactive: false}).addTo(map); mMarks = L.layerGroup().addTo(map); mUpdate(); map.closePopup(); }
  else { map.doubleClickZoom.enable(); }
}
map.on('click', e => { if (!measuring) return; mPts.push(e.latlng); L.circleMarker(e.latlng, {radius: 4, color: '#f59e0b', fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false}).addTo(mMarks); mUpdate(); });
map.on('dblclick', () => { if (measuring) measure(false); });
$('#b-measure').onclick = () => { if (measuring) measure(false); else { if (mLine) { map.removeLayer(mLine); map.removeLayer(mMarks); mLine = null; } measure(true); } };
$('#mstop').onclick = () => measure(false);
$('#mclear').onclick = () => { mPts = []; if (mMarks) mMarks.clearLayers(); mUpdate(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (measuring) measure(false); $('#qres').hidden = true; $('#basemenu').hidden = true; } });

// ---------------------------------------------------------------- חיפוש
let qT = null, qSel = -1, qItems = [];
function searchAll(q) {
  const out = []; const ql = q.toLowerCase();
  const isNum = /^\d+$/.test(q);
  const bus = byId.bus;
  if (bus.items) {
    let n = 0;
    for (let i = 0; i < bus.items.length && n < 8; i++) { const p = bus.items[i].p; if ((isNum && p.code === q) || (!isNum && String(p.name).includes(q))) { out.push({h: 'תחנות', t: p.name, s: `${p.city || ''} · ${p.code}`, go: () => zoomItem(bus, i)}); n++; } }
    if (isNum || /^\d+[א-ת]?$/.test(q)) {
      const hits = []; bus.items.forEach((it, i) => { if ((' ' + (it.p.lines || '') + ' ').includes(' ' + q + ' ')) hits.push(i); });
      if (hits.length) out.push({h: 'קווים', t: `קו ${q}`, s: `${num(hits.length)} תחנות בכל הארץ — הצגה על המפה`, go: () => showLine(q, hits)});
    }
  }
  const hoods = byId.hoods;
  if (hoods.items) { let n = 0; hoods.items.forEach((it, i) => { if (n < 6 && (String(it.p.name).includes(q) || (String(it.p.city) === q))) { out.push({h: 'שכונות', t: it.p.name, s: it.p.city, go: () => { selectHood(it.p.i, true); } }); n++; } }); }
  const kp = byId.kavpach;
  if (kp.items && isNum) kp.items.forEach((it, i) => { if (String(it.p.line) === q && out.filter(o => o.h === 'קו פח').length < 5) out.push({h: 'קו פח', t: `קו ${q} ${it.p.origin || ''} → ${it.p.dest || ''}`, s: `ציון ${it.p.score}`, go: () => zoomItem(kp, i)}); });
  return out;
}
let lineHi = null;
function showLine(q, hits) {
  if (lineHi) map.removeLayer(lineHi);
  const bus = byId.bus;
  lineHi = L.featureGroup(hits.map(i => L.circleMarker(bus.items[i].ll, {renderer: canvasPts, radius: 5, color: '#fff', weight: 1.5, fillColor: '#db2777', fillOpacity: 1}).on('click', e => { L.DomEvent.stopPropagation(e); identify(bus, i, bus.items[i].ll); }))).addTo(map);
  map.fitBounds(lineHi.getBounds(), {padding: [30, 30]});
  msg(`קו ${q}: ${num(hits.length)} תחנות מסומנות בוורוד (כל הקווים בארץ שזה המספר שלהם) · Esc או חיפוש חדש מנקה`);
}
function renderQ(items, extra) {
  qItems = items; qSel = -1;
  let last = '';
  const box = $('#qres');
  box.innerHTML = items.map((it, i) => { const h = it.h !== last ? `<div class="qh">${esc(it.h)}</div>` : ''; last = it.h; return h + `<div data-i="${i}" role="option">${esc(it.t)}<small>${esc(it.s || '')}</small></div>`; }).join('') + (extra || '');
  box.hidden = !box.innerHTML;
}
function doSearch() {
  const q = $('#q').value.trim();
  if (lineHi && !q) { map.removeLayer(lineHi); lineHi = null; msg(''); }
  if (q.length < 2 && !/^\d+$/.test(q)) { $('#qres').hidden = true; return; }
  Promise.all([ensure('bus').catch(() => null), ensure('hoods').catch(() => null)]).then(() => {
    const items = searchAll(q);
    renderQ(items.concat([{h: 'מקום (OpenStreetMap)', t: `חיפוש "${q}" במפה`, s: 'Nominatim', go: () => geocode(q)}]));
  });
}
function geocode(q) {
  msg('מחפש…');
  fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=il&accept-language=he&q=' + encodeURIComponent(q)).then(r => r.json()).then(rs => {
    msg('');
    if (!rs.length) { renderQ([{h: 'מקום', t: 'לא נמצא', s: '', go: () => {}}]); return; }
    renderQ(rs.map(r => ({h: 'מקום (OpenStreetMap)', t: r.display_name.split(',').slice(0, 2).join(','), s: r.type, go: () => { const b = r.boundingbox; map.fitBounds([[+b[0], +b[2]], [+b[1], +b[3]]], {maxZoom: 16}); }})));
  }).catch(() => msg('החיפוש במפה לא זמין כרגע'));
}
$('#q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(doSearch, 250); });
$('#q').addEventListener('keydown', e => {
  const opts = $$('#qres [data-i]');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); qSel = Math.max(0, Math.min(opts.length - 1, qSel + (e.key === 'ArrowDown' ? 1 : -1))); opts.forEach((o, i) => o.classList.toggle('sel', i === qSel)); }
  if (e.key === 'Enter') { e.preventDefault(); const i = qSel >= 0 ? qSel : 0; if (qItems[i]) { const it = qItems[i]; if (!it.h.startsWith('מקום')) $('#qres').hidden = true; it.go(); } }
});
$('#qres').addEventListener('click', e => { const d = e.target.closest('[data-i]'); if (!d) return; const it = qItems[+d.dataset.i]; if (!it.h.startsWith('מקום') || it.t.startsWith('חיפוש')) { if (!it.t.startsWith('חיפוש')) $('#qres').hidden = true; } else $('#qres').hidden = true; it.go(); });
document.addEventListener('click', e => { if (!e.target.closest('.search')) $('#qres').hidden = true; if (!e.target.closest('#basemenu') && !e.target.closest('#b-base')) { $('#basemenu').hidden = true; $('#b-base').classList.remove('on'); } });

// ---------------------------------------------------------------- מדד לכל שכונה
let RADIUS = 250, HOOD = null, LINK = null, ROUTES = null, TTC = {}, KPSET = null, BUSIDX = null;
const RADII = [150, 250, 400, 500, 800];
try { const r = +localStorage.getItem('gis.radius'); if (RADII.includes(r)) RADIUS = r; } catch (e) {}
const SCORE_TXT = () => `הציון (0–100) = 40% × אחוז ההגעות בזמן בתחנות שבטווח ${RADIUS} מ' + 30% × תדירות (עצירות ביום חול לקמ"ר, יחסית לשכונה ב-90% העליון בארץ, עד 100) + 30% × אחוז שטח השכונה שבטווח ${RADIUS} מ' מתחנה. בלי מדידות דיוק — המשקל מתחלק בין שני הרכיבים האחרים.`;
function hoodSourceNote() { const s = byId.hoods.meta && byId.hoods.meta.source; return s ? `מקור הגבולות: ${esc(s.source || '')}${s.snapshot ? ' · ' + esc(String(s.snapshot).slice(0, 10)) : ''}` : ''; }
function loadLink() { return LINK ? Promise.resolve(LINK) : load('data/own/hoods-link.json').then(d => (LINK = d)); }
function busIndex() { if (!BUSIDX) { BUSIDX = {}; byId.bus.items.forEach((it, i) => { BUSIDX[it.p.code] = i; }); } return BUSIDX; }
let SC = null, SCR = null;
function computeScores() {
  if (SCR === RADIUS && SC) return SC;
  const bi = busIndex(), items = byId.bus.items, hoods = byId.hoods.items || byId.hoodscore.items;
  const ri = RADII.indexOf(RADIUS);
  const dens = [], raw = [];
  hoods.forEach((h, k) => {
    const i = h.p.i; const st = (LINK.stops[i] || []).filter(s => s[1] <= RADIUS);
    let n = 0, on = 0, tpd = 0;
    st.forEach(([c]) => { const j = bi[c]; if (j == null) return; const p = items[j].p; if (p.n && p.on != null) { n += p.n; on += p.on / 100 * p.n; } tpd += p.tpd || 0; });
    const km2 = Math.max(h.p.km2 || 0, 0.05);
    const d = tpd / km2; dens.push(d);
    raw[i] = {stops: st.length, onPct: n ? 100 * on / n : null, n, tpd, dens: d, cov: (LINK.cover[i] || [])[ri]};
  });
  const sorted = dens.slice().sort((a, b) => a - b); const p90 = sorted[Math.floor(sorted.length * 0.9)] || 1;
  raw.forEach(r => {
    if (!r) return;
    r.freq = Math.min(100, 100 * r.dens / p90);
    if (!r.stops) { r.score = null; return; }
    const parts = [[0.4, r.onPct], [0.3, r.freq], [0.3, r.cov]].filter(([, v]) => v != null);
    const w = parts.reduce((a, [x]) => a + x, 0);
    r.score = w ? Math.round(parts.reduce((a, [x, v]) => a + x * v, 0) / w) : null;
  });
  SC = raw; SCR = RADIUS; return SC;
}
function hoodScore(i) { return SC && SC[i] ? SC[i].score : null; }
function hoodExtra(i) { const r = SC && SC[i]; if (!r) return ''; return `<table><tr><td>ציון</td><td><b>${r.score == null ? '—' : r.score}</b></td></tr><tr><td>בזמן</td><td>${r.onPct == null ? '—' : fmt1(r.onPct) + '%'}</td></tr><tr><td>כיסוי ${RADIUS} מ'</td><td>${r.cov == null ? '—' : r.cov + '%'}</td></tr><tr><td>תחנות בטווח</td><td>${num(r.stops)}</td></tr></table><button class="linkbtn" onclick="window.GIS.selectHood(${i},false,true)">פירוט מלא ולוח זמנים ←</button>`; }
const origHoodScoreLoad = () => Promise.all([ensure('bus'), ensure('hoods'), loadLink()]).then(() => { byId.hoodscore.meta = byId.hoods.meta; computeScores(); });
byId.hoodscore.needs = ['bus', 'hoods'];
const _setVis = setVisible;
setVisible = function (l, on) { // eslint-disable-line no-func-assign
  if (on && (l.id === 'hoodscore' || l.id === 'walk')) return origHoodScoreLoad().then(() => _setVis(l, on)).catch(() => setStatus(l, LATER, true));
  return _setVis(l, on);
};
function setRadius(r) {
  RADIUS = r; try { localStorage.setItem('gis.radius', r); } catch (e) {}
  SC = null;
  if (LINK && byId.bus.items && byId.hoods.items) computeScores();
  if (byId.hoodscore.lg) restyle(byId.hoodscore);
  drawWalk(); renderLegend(); renderHood();
}

// שכבת טווח ההליכה — עיגולים סביב תחנות בתחום המפה (מזום 13)
function drawWalk() {
  const l = byId.walk;
  if (l.lg) { map.removeLayer(l.lg); l.lg = null; }
  if (!l.on || !byId.bus.items) return;
  if (map.getZoom() < 13) { setStatus(l, 'מוצג מזום 13 ומעלה'); return; }
  setStatus(l, '');
  const B = map.getBounds().pad(0.2);
  const sel = HOOD != null && LINK ? new Set((LINK.stops[HOOD] || []).filter(s => s[1] <= RADIUS).map(s => s[0])) : null;
  const g = L.featureGroup();
  byId.bus.items.forEach(it => { if (!B.contains(it.ll)) return; const hot = sel && sel.has(it.p.code);
    g.addLayer(L.circle(it.ll, {renderer: canvas, radius: RADIUS, color: hot ? '#0369a1' : '#0ea5e9', weight: hot ? 1.2 : 0.6, opacity: 0.5 * l.opacity, fillColor: hot ? '#0284c7' : '#38bdf8', fillOpacity: (hot ? 0.2 : 0.1) * l.opacity, interactive: false})); });
  l.lg = g.addTo(map);
}
map.on('moveend', () => { if (byId.walk.on) drawWalk(); });

let hoodHi = null;
function selectHood(i, zoom, openPanel) {
  HOOD = i;
  Promise.all([ensure('hoods'), ensure('bus'), loadLink()]).then(() => {
    const h = byId.hoods.items.find(x => x.p.i === i); if (!h) return;
    if (hoodHi) map.removeLayer(hoodHi);
    hoodHi = L.geoJSON(h.f, {style: {color: '#0369a1', weight: 3, fill: false}, interactive: false}).addTo(map);
    if (zoom) map.fitBounds(hoodHi.getBounds(), {padding: [30, 30]});
    if (openPanel || zoom || !isMobile()) showSide(true, 'hood'); else renderHood();
    if (byId.walk.on) drawWalk();
  }).catch(() => msg('גבולות השכונות עוד לא זמינים — ' + LATER));
}
function ttLoad(codes) {
  // לוח הזמנים מחולק למשבצות של 1/20 מעלה — טוענים רק את המשבצות של התחנות בשכונה
  const bi = busIndex(), cells = new Set();
  const cellOf = ll => `${Math.floor(ll[0] * 20)}_${Math.floor(ll[1] * 20)}`;
  codes.forEach(c => { const j = bi[c]; if (j != null) cells.add(cellOf(byId.bus.items[j].ll)); });
  const need = [...cells].filter(k => !(k in TTC));
  return Promise.all([ROUTES ? null : load('data/own/routes.json').then(d => { ROUTES = d; }),
    ...need.map(k => load(`data/own/tt/${k}.json`).then(d => { TTC[k] = d; }).catch(() => { TTC[k] = {}; }))]).then(() => {
    const out = {}; codes.forEach(c => { const j = bi[c]; if (j == null) return; const t = (TTC[cellOf(byId.bus.items[j].ll)] || {})[c]; if (t) out[c] = t; }); return out;
  });
}
function hoodChart(hours) {
  const W = 320, H = 120, L0 = 26, B = 18, mx = Math.max(1, ...hours), bw = (W - L0) / 24;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="נסיעות לפי שעה">`;
  [0, 0.5, 1].forEach(f => { const y = H - B - f * (H - B - 8); s += `<line x1="${L0}" x2="${W}" y1="${y}" y2="${y}" stroke="#e2e8f0"/><text x="${L0 - 4}" y="${y + 3}" font-size="9" fill="#64748b" text-anchor="end">${Math.round(mx * f)}</text>`; });
  hours.forEach((v, h) => { const x = W - (h + 1) * bw, bh = v / mx * (H - B - 8); s += `<rect x="${x + 1}" y="${H - B - bh}" width="${bw - 2}" height="${bh}" fill="#0ea5e9"><title>${h}:00 — ${v} נסיעות</title></rect>`; if (h % 3 === 0) s += `<text x="${x + bw / 2}" y="${H - 5}" font-size="9" fill="#64748b" text-anchor="middle">${h}</text>`; });
  return s + '</svg>';
}
function renderHood() {
  const el = $('#hood'); if (!el || el.hidden) return;
  const ctl = `<div class="ctl"><input id="h-q" list="h-list" placeholder="בחירת שכונה (שם או יישוב)…" aria-label="בחירת שכונה"><datalist id="h-list"></datalist>
    <label>טווח הליכה <select id="h-r" aria-label="רדיוס הליכה">${RADII.map(r => `<option value="${r}"${r === RADIUS ? ' selected' : ''}>${r} מ'</option>`).join('')}</select></label></div>`;
  if (HOOD == null) {
    el.innerHTML = ctl + `<p class="hint">בוחרים שכונה ברשימה, בחיפוש למעלה או בלחיצה על שכונה במפה (שכבת "גבולות שכונות" או "מדד התחבורה הציבורית לשכונה"). לכל שכונה: דיוק האוטובוסים בתחנות שבטווח ההליכה, תדירות לפי שעה, הקווים, לוח הזמנים, קו פח, קו באג ותחנות רכבת קרובות.</p><p class="hint">${SCORE_TXT()}</p>`;
    wireHoodCtl(); return;
  }
  el.innerHTML = ctl + '<div class="note">טוען…</div>'; wireHoodCtl();
  Promise.all([ensure('hoods'), ensure('bus'), loadLink(), ensure('kavpach').catch(() => null), ensure('kavbug').catch(() => null), ensure('rail').catch(() => null)]).then(() => {
    const h = byId.hoods.items.find(x => x.p.i === HOOD); if (!h) return;
    computeScores(); const r = SC[HOOD] || {};
    const st = (LINK.stops[HOOD] || []).filter(s => s[1] <= RADIUS);
    const codes = st.map(s => s[0]);
    return ttLoad(codes).then(tt => {
      if (HOOD !== h.p.i) return;
      const bi = busIndex();
      // קווים: לכל מסלול — בכל שעה, המקסימום על פני התחנות שלו בשכונה (נסיעה שעוברת בכמה תחנות נספרת פעם אחת)
      const per = {};
      codes.forEach(c => (tt[c] || []).forEach(([ri, ...hrs]) => { const a = per[ri] || (per[ri] = new Array(24).fill(0)); hrs.forEach((v, k) => { if (v > a[k]) a[k] = v; }); }));
      if (!KPSET && byId.kavpach.items) { KPSET = new Set(); byId.kavpach.items.forEach(it => String(it.p.makat || '').split(' ').forEach(m => m && KPSET.add(m))); }
      const lines = Object.entries(per).map(([ri, hrs]) => { const R = ROUTES.routes[ri]; return {R, hrs, tot: hrs.reduce((a, b) => a + b, 0), kp: KPSET && KPSET.has(String(R[3]))}; })
        .sort((a, b) => b.tot - a.tot || String(a.R[0]).localeCompare(String(b.R[0]), 'he', {numeric: true}));
      const hours = new Array(24).fill(0); lines.forEach(x => x.hrs.forEach((v, k) => { hours[k] += v; }));
      const trips = hours.reduce((a, b) => a + b, 0);
      const day = hours.slice(7, 19).reduce((a, b) => a + b, 0) / 12;
      // קו באג: נקודת ההתחלה של הקטע בתוך השכונה
      const inPoly = (ll) => { try { return L.geoJSON(h.f).getBounds().contains(ll) && pip(ll, h.f.geometry); } catch (e) { return false; } };
      const bugs = (byId.kavbug.items || []).filter(it => { const c = it.f.geometry.type === 'Point' ? it.f.geometry.coordinates : it.f.geometry.coordinates[0]; return inPoly([c[1], c[0]]); });
      const rails = (LINK.rail[HOOD] || []).map(([c, d]) => { const it = (byId.rail.items || []).find(x => String(x.p.code) === String(c)); return it ? {p: it.p, d} : null; }).filter(Boolean);
      let seen = 0, seenW = 0; st.forEach(([c]) => { const j = bi[c]; if (j != null) { const p = byId.bus.items[j].p; if (p.seen != null && p.n) { seen += p.seen * p.n; seenW += p.n; } } });
      const kpLines = lines.filter(x => x.kp);
      const HRS = Array.from({length: 20}, (_, k) => (k + 5) % 24);
      el.innerHTML = ctl + `<h3>${esc(h.p.name)}</h3><div class="sub">${esc(h.p.city || '')} · ${fmt1(h.p.km2)} קמ"ר · טווח הליכה ${RADIUS} מ' · <button class="linkbtn" id="h-zoom">התקרבות</button></div>
        <div class="kpis">
          <div class="kpi"><b>${r.score == null ? '—' : r.score}</b><span>ציון השכונה (0–100)</span></div>
          <div class="kpi"><b>${r.onPct == null ? '—' : fmt1(r.onPct) + '%'}</b><span>הגעות בזמן (30 יום, ${num(r.n)} מדידות)</span></div>
          <div class="kpi"><b>${seenW ? Math.round(seen / seenW) + '%' : '—'}</b><span>נסיעות שנצפו מתוך המתוכנן (השאר — לא נצפו/לא בוצעו)</span></div>
          <div class="kpi"><b>${r.cov == null ? '—' : r.cov + '%'}</b><span>משטח השכונה בטווח ${RADIUS} מ' מתחנה</span></div>
          <div class="kpi"><b>${num(st.length)}</b><span>תחנות בטווח</span></div>
          <div class="kpi"><b>${num(lines.length)}</b><span>קווים (מסלולים)</span></div>
          <div class="kpi"><b>${num(trips)}</b><span>נסיעות ביום חול</span></div>
          <div class="kpi"><b>${fmt1(day)}</b><span>נסיעות בשעה (07–19 בממוצע)</span></div>
        </div>
        <p class="hint">יום חול לדוגמה: ${esc(ROUTES.day || '')} (GTFS). נסיעה של קו שעוברת בכמה תחנות בשכונה נספרת פעם אחת. איחור/הקדמה בפילוח לפי תחנה אינם זמינים — המדד לתחנה הוא אחוז בזמן והאיחור הממוצע.</p>
        <h4>נסיעות לפי שעה</h4><div class="chart">${hoodChart(hours)}</div>
        <h4>קו פח — קווים בזבזניים שעוברים כאן (${kpLines.length})</h4>
        ${kpLines.length ? kpLines.map(x => `<span class="tag">${esc(x.R[0])}</span> ${esc(x.R[2])} · ${esc(String(x.R[1]).split('<->')[1] || '')}`).join('<br>') : '<p class="hint">אין.</p>'}
        <h4>קו באג — קטעים חשודים בשכונה (${bugs.length})</h4>
        ${bugs.length ? bugs.slice(0, 20).map(b => `קו ${esc(b.p.line)} (${esc(b.p.operator)}) · ${esc(b.p.verdict)} · ${fmt1(b.p.excessKm)} ק"מ עודפים`).join('<br>') : '<p class="hint">אין.</p>'}
        <h4>תחנות רכבת עד 800 מ'</h4>
        ${rails.length ? rails.map(x => `${esc(x.p.name)} — ${num(x.d)} מ' · בזמן ${x.p.on == null ? '—' : fmt1(x.p.on) + '%'}`).join('<br>') : '<p class="hint">אין.</p>'}
        <h4>לוח זמנים לשכונה — נסיעות לפי קו ושעה</h4>
        <div class="ttwrap"><table class="mini tt"><thead><tr><th>קו</th><th>מפעיל</th><th>יעד</th>${HRS.map(k => `<th>${k}</th>`).join('')}<th>סה"כ</th></tr></thead><tbody>
        ${lines.map(x => `<tr><td><b>${esc(x.R[0])}</b>${x.kp ? ' <span class="tag">פח</span>' : ''}</td><td>${esc(x.R[2])}</td><td>${esc((String(x.R[1]).split('<->')[1] || '').replace(/-\d+#?$/, ''))}</td>${HRS.map(k => `<td class="h${x.hrs[k] ? '' : ' h0'}">${x.hrs[k] || '·'}</td>`).join('')}<td><b>${x.tot}</b></td></tr>`).join('')}
        </tbody></table></div>
        <h4>התחנות שבטווח</h4><div class="ttwrap"><table class="mini"><thead><tr><th>תחנה</th><th>מרחק</th><th>בזמן</th><th>איחור</th><th>נסיעות</th></tr></thead><tbody>
        ${st.map(([c, d]) => { const j = bi[c]; const p = j != null ? byId.bus.items[j].p : {name: c}; return `<tr data-c="${esc(c)}" style="cursor:pointer"><td>${esc(p.name)} <small class="mut">${esc(c)}</small></td><td>${d ? d + " מ'" : 'בתוך'}</td><td>${p.on == null ? '—' : fmt1(p.on) + '%'}</td><td>${fmt1(p.avg)}</td><td>${num(p.tpd)}</td></tr>`; }).join('')}
        </tbody></table></div>
        <p class="hint">${SCORE_TXT()}</p><p class="hint">${hoodSourceNote()}</p>`;
      wireHoodCtl();
      $('#h-zoom').onclick = () => { if (hoodHi) map.fitBounds(hoodHi.getBounds(), {padding: [30, 30]}); };
      $$('#hood tr[data-c]').forEach(tr => tr.onclick = () => { const j = busIndex()[tr.dataset.c]; if (j != null) zoomItem(byId.bus, j); });
    });
  }).catch(err => { console.warn(err); el.innerHTML = ctl + `<div class="note warn">נתוני השכונות לא זמינים — ${LATER}.</div>`; wireHoodCtl(); });
}
function pip(ll, geom) {
  const x = ll[1], y = ll[0];
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  const inRing = ring => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  return polys.some(p => inRing(p[0]) && !p.slice(1).some(inRing));
}
function wireHoodCtl() {
  const r = $('#h-r'); if (r) r.onchange = () => setRadius(+r.value);
  const q = $('#h-q'); if (!q) return;
  q.onfocus = () => ensure('hoods').then(() => { const dl = $('#h-list'); if (dl && !dl.children.length) dl.innerHTML = byId.hoods.items.map(it => `<option value="${esc(it.p.name + ' — ' + (it.p.city || ''))}">`).join(''); }).catch(() => {});
  q.onchange = () => { const v = q.value; const it = (byId.hoods.items || []).find(x => x.p.name + ' — ' + (x.p.city || '') === v); if (it) selectHood(it.p.i, true, true); };
}

// ---------------------------------------------------------------- שכבות משרד התחבורה מהקטלוג
function addCatalog(cat) {
  CATALOG = cat;
  (cat.layers || []).forEach(c => {
    const g = c.group === 'תכניות עתידיות' ? G_FUT : G_NOW;
    reg({id: 'mot:' + c.id, title: c.title, group: g, topic: c.topic || 'אחר', kind: 'geojson', url: 'data/' + c.file, count: c.count, geom: c.geom,
      src: c.source, modified: c.modified, sw: hashColor(c.id),
      style: () => ({color: hashColor(c.id), weight: c.geom === 'LineString' ? 2.5 : 1.2, fillColor: hashColor(c.id), fillOpacity: c.geom === 'Polygon' ? 0.25 : 0.9, opacity: 0.9}),
      link: () => [c.source, 'המאגר ב-data.gov.il']});
  });
}

// ---------------------------------------------------------------- מצב נשמר (שכבות פעילות, תצוגה)
function saveState() {
  try { localStorage.setItem('gis.on', JSON.stringify(LAYERS.filter(l => l.on).map(l => l.id))); } catch (e) {}
  const c = map.getCenter();
  history.replaceState(null, '', `#${map.getZoom()}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`);
}
map.on('moveend', saveState);

// ---------------------------------------------------------------- הפעלה
load('data/catalog.json').then(addCatalog).catch(() => { CATALOG = null; }).then(() => {
  renderTree();
  const m = location.hash.match(/^#(\d+)\/([\d.]+)\/([\d.]+)/);
  if (m) map.setView([+m[2], +m[3]], +m[1]);
  let on = null; try { on = JSON.parse(localStorage.getItem('gis.on') || 'null'); } catch (e) {}
  (on && on.length ? on : ['terminals', 'rail']).forEach(id => { if (byId[id]) setVisible(byId[id], true); });
  if (isMobile()) showSide(false);
  renderLegend();
});
window.GIS = {selectHood, byId, map, setVisible, openTable, setRadius};
})();
