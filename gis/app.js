// GIS הקו הבוחן — הלוגיקה של העמוד (שלמה 30.09: "כלי GIS שמאחד את מדדי האמינות, הצי,
// קו פח, קו באג וכל התכניות של משרד התחבורה — שיהיה כמו GIS, לא כמו שאר האתרים שלנו").
// Leaflet עם רינדור קנבס לשכבות הגדולות. כל שכבה נטענת רק כשמסמנים אותה.
// הנתונים: data/own/* (tools/gis_build.py) ו-data/catalog.json + data/mot/* (tools/gis_mot.py).
// הממשק (לפי ההדמיה שאושרה): סרגל כלים אנכי שפותח לוח צד מעוגן, תפריט ⋯ לכל שכבה (סימבולוגיה,
// תוויות, מסנן), זיהוי עם דפדוף בין ישויות, טבלה מעוגנת עם לשוניות ובחירה מסונכרנת, ושורת מצב עם רשת ישראל (ITM).
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
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

// סמלים (SVG שצויר כאן, קו דק)
const ICO = {
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  fold: '<svg class="fold" viewBox="0 0 16 13"><path d="M.5 1.5v11h15V3.5H7.5L6 1.5z"/></svg>',
  zoom: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  opa: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16"/></svg>',
  sym: '<svg viewBox="0 0 24 24"><circle cx="7" cy="7" r="3"/><rect x="14" y="4" width="6" height="6"/><path d="m7 14 4 6H3zM14 17h6"/></svg>',
  lab: '<svg viewBox="0 0 24 24"><path d="M5 6h14M12 6v13M9 19h6"/></svg>',
  filt: '<svg viewBox="0 0 24 24"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/></svg>',
  tbl: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16"/><path d="M3 9.5h18M3 15h18M9.5 4v16"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
};

// ---------------------------------------------------------------- מפה ורקעים
const BASES = {
  light: {t: 'בהירה', s: 'CARTO Positron', u: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', a: '© OpenStreetMap © CARTO', o: {maxZoom: 20, subdomains: 'abcd'}, th: '#eceff1'},
  osm: {t: 'רחובות', s: 'OpenStreetMap', u: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', a: '© תורמי OpenStreetMap', o: {maxZoom: 19}, th: '#f2efe9'},
  dark: {t: 'כהה', s: 'CARTO Dark Matter', u: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', a: '© OpenStreetMap © CARTO', o: {maxZoom: 20, subdomains: 'abcd'}, th: '#262a30'},
  sat: {t: 'תצלום אוויר', s: 'Esri World Imagery', u: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', a: 'Esri, Maxar, Earthstar Geographics', o: {maxZoom: 19}, th: '#4b5a3c'},
  none: {t: 'בלי רקע', s: 'רק השכבות', u: null, a: '', th: '#ffffff'},
};
const HOME = {c: [31.75, 34.95], z: 8};
const map = L.map('map', {preferCanvas: true, zoomControl: false, attributionControl: false}).setView(HOME.c, HOME.z);
L.control.scale({metric: true, imperial: false, position: 'bottomright'}).addTo(map);
const canvas = L.canvas({padding: 0.4, tolerance: 4});
// נקודות בשכבה נפרדת מעל הקווים והפוליגונים; הבחירה (תכלת) מעל הכול
map.createPane('pts').style.zIndex = 450;
map.createPane('sel').style.zIndex = 460;
map.getPane('sel').style.pointerEvents = 'none';
const canvasPts = L.canvas({padding: 0.4, tolerance: 4, pane: 'pts'});
const canvasSel = L.canvas({padding: 0.4, pane: 'sel'});
// סדר הציור: פוליגונים מתחת לקווים, קווים מתחת לנקודות; בתוך אותו סוג — לפי הסדר בעץ השכבות (העליון מעל).
// לכל שכבה משטח ציור (canvas) משלה בחלונית של הסוג שלה, וה-z-index שלו נקבע לפי המקום בעץ (applyOrder).
map.createPane('poly').style.zIndex = 410;
map.createPane('line').style.zIndex = 420;
map.createPane('ptsIco').style.zIndex = 455;
map.getPane('ptsIco').style.pointerEvents = 'none';

// ---------------------------------------------------------------- סמלים: מה שהשכבה מראה (סט משלנו, SVG 40×40; c — צבע ראשי)
const ICONS = {
  stop: c => `<circle cx="20" cy="20" r="17" fill="${c || '#16a34a'}"/><rect x="12" y="11" width="16" height="15" rx="3" fill="#fff"/><rect x="14" y="13" width="12" height="6" fill="${c || '#16a34a'}"/><circle cx="15" cy="28" r="2" fill="#fff"/><circle cx="25" cy="28" r="2" fill="#fff"/>`,
  stopOff: c => `<circle cx="20" cy="20" r="17" fill="${c || '#dc2626'}"/><rect x="12" y="11" width="16" height="15" rx="3" fill="#fff"/><rect x="14" y="13" width="12" height="6" fill="${c || '#dc2626'}"/><path d="M9 31 31 9" stroke="#fff" stroke-width="3"/>`,
  terminal: c => `<rect x="3" y="3" width="34" height="34" rx="6" fill="${c || '#0f172a'}"/><path d="M8 28h24M10 28V15l10-6 10 6v13" stroke="#fff" stroke-width="2.5" fill="none"/><rect x="15" y="18" width="10" height="10" fill="#38bdf8"/>`,
  rail: c => `<circle cx="20" cy="20" r="17" fill="${c || '#1d4ed8'}"/><rect x="13" y="9" width="14" height="17" rx="4" fill="#fff"/><rect x="15" y="12" width="10" height="5" fill="${c || '#1d4ed8'}"/><path d="M14 31l3-5M26 31l-3-5" stroke="#fff" stroke-width="2.5"/>`,
  lrt: c => `<circle cx="20" cy="20" r="17" fill="${c || '#9333ea'}"/><path d="M20 6v5M14 8h12" stroke="#fff" stroke-width="2"/><rect x="12" y="12" width="16" height="15" rx="4" fill="#fff"/><rect x="14" y="15" width="12" height="5" fill="${c || '#9333ea'}"/>`,
  metro: c => `<circle cx="20" cy="20" r="17" fill="${c || '#f97316'}"/><text x="20" y="27" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" font-family="Arial">M</text>`,
  ontime: c => `<circle cx="20" cy="20" r="17" fill="#fff" stroke="${c || '#16a34a'}" stroke-width="3"/><path d="M20 10v10l7 4" stroke="${c || '#16a34a'}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  late: c => `<circle cx="20" cy="20" r="17" fill="#fff" stroke="${c || '#dc2626'}" stroke-width="3"/><path d="M20 10v10l7 4" stroke="${c || '#dc2626'}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M29 6l5 5M34 6l-5 5" stroke="${c || '#dc2626'}" stroke-width="2.5"/>`,
  empty: () => `<rect x="4" y="12" width="32" height="16" rx="4" fill="#fff" stroke="#a16207" stroke-width="2.5"/><rect x="8" y="15" width="6" height="5" fill="#fde68a"/><rect x="17" y="15" width="6" height="5" fill="#fde68a"/><rect x="26" y="15" width="6" height="5" fill="#fde68a"/><circle cx="12" cy="30" r="3" fill="#a16207"/><circle cx="28" cy="30" r="3" fill="#a16207"/><text x="20" y="9" text-anchor="middle" font-size="8" font-weight="900" fill="#a16207" font-family="Arial">0</text>`,
  detour: () => `<circle cx="6" cy="30" r="3.5" fill="#0f172a"/><circle cx="34" cy="30" r="3.5" fill="#0f172a"/><path d="M6 30H34" stroke="#94a3b8" stroke-width="2" stroke-dasharray="3 3"/><path d="M6 30 C8 4 32 4 34 30" stroke="#dc2626" stroke-width="3.5" fill="none"/>`,
  name: () => `<rect x="5" y="6" width="30" height="13" rx="2" fill="#0ea5e9"/><text x="20" y="16" text-anchor="middle" font-size="8" font-weight="900" fill="#fff" font-family="Arial">שם</text><rect x="5" y="23" width="30" height="11" rx="2" fill="#fff" stroke="#0f172a" stroke-width="2"/><text x="20" y="31.5" text-anchor="middle" font-size="7" font-weight="700" fill="#0f172a" font-family="Arial">רחוב</text><path d="M34 17 L38 25" stroke="#dc2626" stroke-width="2.5"/>`,
  fleet: () => `<circle cx="20" cy="22" r="15" fill="#e0f2fe" stroke="#0891b2" stroke-width="2"/><rect x="10" y="16" width="20" height="10" rx="2" fill="#0891b2"/><circle cx="14" cy="28" r="2" fill="#0f172a"/><circle cx="26" cy="28" r="2" fill="#0f172a"/><circle cx="31" cy="8" r="7" fill="#0891b2"/><text x="31" y="11" text-anchor="middle" font-size="9" font-weight="900" fill="#fff" font-family="Arial">#</text>`,
  skip: () => `<path d="M3 20H37" stroke="#0f172a" stroke-width="3"/><circle cx="20" cy="30" r="4" fill="#f59e0b"/><path d="M8 14 C14 8 26 8 32 14" stroke="#0ea5e9" stroke-width="3" fill="none"/><path d="M29 11l3 3-4 1" stroke="#0ea5e9" stroke-width="2.5" fill="none"/>`,
  industry: () => `<rect x="6" y="14" width="12" height="20" fill="#475569"/><rect x="20" y="8" width="14" height="26" fill="#64748b"/><circle cx="9" cy="8" r="4" fill="#16a34a"/><path d="M9 12v4" stroke="#16a34a" stroke-width="2"/>`,
  pnr: c => `<rect x="3" y="3" width="34" height="34" rx="6" fill="${c || '#1d4ed8'}"/><text x="20" y="28" text-anchor="middle" font-size="22" font-weight="900" fill="#fff" font-family="Arial">P</text><path d="M26 10h6v6" stroke="#fff" stroke-width="2" fill="none"/>`,
  nataz: c => `<rect x="3" y="3" width="34" height="34" rx="6" fill="${c || '#e11d48'}"/><path d="M13 34V8M27 34V8" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"/><rect x="14" y="14" width="12" height="11" rx="2" fill="#fff"/><circle cx="17" cy="27" r="1.5" fill="#fff"/><circle cx="23" cy="27" r="1.5" fill="#fff"/>`,
  depot: c => `<path d="M20 3 36 11v18L20 37 4 29V11z" fill="${c || '#64748b'}"/><path d="M12 26V15l8-4 8 4v11" stroke="#fff" stroke-width="2.5" fill="none"/><path d="M16 26v-6h8v6" stroke="#fff" stroke-width="2.5" fill="none"/>`,
  project: c => `<rect x="3" y="3" width="34" height="34" rx="6" fill="#fff" stroke="${c || '#f59e0b'}" stroke-width="3" stroke-dasharray="5 3"/><path d="M12 28l6-12 4 7 3-4 4 9z" fill="${c || '#f59e0b'}"/>`,
  road: () => `<path d="M5 34 20 5l15 29" stroke="#475569" stroke-width="3" fill="none"/><path d="M20 12v4M20 20v4M20 28v4" stroke="#facc15" stroke-width="3"/><rect x="12" y="1" width="16" height="9" rx="2" fill="#16a34a"/><text x="20" y="8.5" text-anchor="middle" font-size="7" font-weight="900" fill="#fff" font-family="Arial">431</text>`,
  hood: () => `<path d="M6 8h28v24H6z" fill="#ede9fe" stroke="#7c3aed" stroke-width="2.5" stroke-dasharray="4 2"/><circle cx="16" cy="18" r="3" fill="#7c3aed"/><circle cx="25" cy="24" r="3" fill="#7c3aed"/>`,
};
const iconSvg = (k, c, px) => `<svg viewBox="0 0 40 40" width="${px || 16}" height="${px || 16}" aria-hidden="true">${ICONS[k](c)}</svg>`;
// סמל לשכבת משרד התחבורה — לפי הכותרת (מה שהשכבה מראה)
function motIcon(t, fut) {
  if (/חנה.?וסע|park/i.test(t)) return 'pnr';
  if (/דיפו|depo/i.test(t)) return 'depot';
  if (/מטרו(?!נית)|metro(?!nit)/i.test(t)) return 'metro';
  if (/רק"ל|רקל|רכבת קלה|lrt/i.test(t)) return 'lrt';
  if (/רכבת|rail|מסיל/i.test(t)) return 'rail';
  if (/נת"צ|נתצ|nataz|העדפ/i.test(t)) return 'nataz';
  if (/מסוף|terminal|מרכזית/i.test(t)) return 'terminal';
  if (/כביש|מספור|road|דרכים/i.test(t)) return 'road';
  if (/תחנ/i.test(t)) return 'stop';
  if (/תעשי|תעסוק/i.test(t)) return 'industry';
  return fut ? 'project' : null;
}
const ICONMAX = 3000;   // שכבת נקודות עם סמל מצוירת בסמלים רק עד כמות כזו; צפופה יותר — עיגולים צבעוניים
let baseLayer = null, baseKey = 'light', ovBase = null;
function tiles(b) { return L.tileLayer(b.u, Object.assign({crossOrigin: true}, b.o)); }
function setBase(k) {
  if (baseLayer) map.removeLayer(baseLayer);
  baseKey = k; const b = BASES[k];
  baseLayer = b.u ? tiles(b).addTo(map) : null;
  if (baseLayer) baseLayer.bringToBack();
  if (ovBase) ov.removeLayer(ovBase);
  ovBase = b.u ? tiles(b).addTo(ov) : null;
  $('#s-attr').textContent = b.a ? 'רקע: ' + b.a : '';
  lsSet('gis.base', k);
  if (PANE === 'base') renderBases();
}

// מפת התמצאות בפינה
const ov = L.map('ov', {zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0});
ov.setView(HOME.c, 5);
const ovRect = L.rectangle(map.getBounds(), {color: '#0ea5e9', weight: 2, fill: false, interactive: false}).addTo(ov);
function syncOv() { ov.setView(map.getCenter(), Math.max(4, map.getZoom() - 5), {animate: false}); ovRect.setBounds(map.getBounds()); }
ov.on('click', e => map.panTo(e.latlng));
map.on('moveend', syncOv);

// פקדי מפה: זום, תצוגה ארצית, מיקום
$('#c-in').onclick = () => map.zoomIn();
$('#c-out').onclick = () => map.zoomOut();
$('#c-home').onclick = () => map.setView(HOME.c, HOME.z);
let locMark = null;
$('#c-loc').onclick = () => {
  if (!navigator.geolocation) return msg('הדפדפן לא תומך באיתור מיקום');
  msg('מאתר מיקום…');
  navigator.geolocation.getCurrentPosition(p => {
    const ll = [p.coords.latitude, p.coords.longitude]; msg('');
    if (locMark) map.removeLayer(locMark);
    locMark = L.layerGroup([L.circle(ll, {radius: p.coords.accuracy, color: '#0284c7', weight: 1, fillOpacity: 0.1, interactive: false}),
      L.circleMarker(ll, {radius: 6, color: '#fff', weight: 2, fillColor: '#0284c7', fillOpacity: 1, interactive: false})]).addTo(map);
    map.setView(ll, Math.max(map.getZoom(), 15));
  }, () => msg('המיקום לא זמין (לא אושרה הרשאה או שאין קליטה)'), {enableHighAccuracy: true, timeout: 15000});
};

// ---------------------------------------------------------------- רשת ישראל החדשה (ITM, EPSG:2039)
// WGS84 → הזזת דאטום (7 פרמטרים של EPSG:2039, ההפך של towgs84 כמו ב-proj4) → GRS80 → מרקטור רוחבי (טור קרוגר).
// נבדק מול proj4/pyproj עם אותה הגדרה: עזריאלי ת"א 32.0744,34.7925 → 180,562.58 / 664,642.23 (זהה עד הסנטימטר).
const toITM = (() => {
  const d2r = Math.PI / 180, sec = d2r / 3600;
  const a = 6378137, e2w = (1 / 298.257223563) * (2 - 1 / 298.257223563);
  const fG = 1 / 298.257222101, e2g = fG * (2 - fG);
  const D = [-24.0024, -17.1032, -17.8444], R = [-0.33077 * sec, -1.85269 * sec, 1.66969 * sec], M = 1 + 5.4248e-6;
  const n = fG / (2 - fG), A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
  const lat0 = (31 + 44 / 60 + 3.817 / 3600) * d2r, lon0 = (35 + 12 / 60 + 16.261 / 3600) * d2r;
  const k0 = 1.0000067, FE = 219529.584, FN = 626907.390, c = 2 * Math.sqrt(n) / (1 + n);
  function tm(phi, lam) {
    const s = Math.sin(phi), t = Math.sinh(Math.atanh(s) - c * Math.atanh(c * s)), dl = lam - lon0;
    const x1 = Math.atan2(t, Math.cos(dl)), y1 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    let x = x1, y = y1;
    for (let j = 1; j <= 3; j++) { x += al[j - 1] * Math.sin(2 * j * x1) * Math.cosh(2 * j * y1); y += al[j - 1] * Math.cos(2 * j * x1) * Math.sinh(2 * j * y1); }
    return [A * y, A * x];
  }
  const N0 = tm(lat0, lon0)[1];
  return (lat, lon) => {
    const phi = lat * d2r, lam = lon * d2r, sp = Math.sin(phi), cp = Math.cos(phi);
    const Nr = a / Math.sqrt(1 - e2w * sp * sp);
    const X = Nr * cp * Math.cos(lam), Y = Nr * cp * Math.sin(lam), Z = Nr * (1 - e2w) * sp;
    const x = (X - D[0]) / M, y = (Y - D[1]) / M, z = (Z - D[2]) / M;
    const X2 = x + R[2] * y - R[1] * z, Y2 = -R[2] * x + y + R[0] * z, Z2 = R[1] * x - R[0] * y + z;
    const p = Math.hypot(X2, Y2); let la = Math.atan2(Z2, p * (1 - e2g));
    for (let i = 0; i < 6; i++) { const s = Math.sin(la), N = a / Math.sqrt(1 - e2g * s * s); la = Math.atan2(Z2 + e2g * N * s, p); }
    const [e, nn] = tm(la, Math.atan2(Y2, X2));
    return [FE + k0 * e, FN + k0 * (nn - N0)];
  };
})();

// ---------------------------------------------------------------- שורת מצב
const fmtInt = v => Math.round(v).toLocaleString('en-US');
function showCoord(ll) {
  $('#s-wgs').textContent = `${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}`;
  const [e, n] = toITM(ll.lat, ll.lng);
  $('#s-itm').textContent = `${fmtInt(e)} / ${fmtInt(n)}`;
}
// קנה מידה מספרי: מטרים לפיקסל (Web Mercator) חלקי גודל פיקסל של 0.2646 מ"מ (96dpi), מעוגל לשתי ספרות משמעותיות
function scaleRatio() {
  const lat = map.getCenter().lat, mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8);
  const s = mpp / 0.00026458, p = Math.pow(10, Math.floor(Math.log10(s)) - 1);
  return Math.round(s / p) * p;
}
function showView() {
  $('#s-scale').textContent = '1:' + fmtInt(scaleRatio());
  $('#s-zoom').textContent = map.getZoom();
}
map.on('mousemove', e => showCoord(e.latlng));
map.on('moveend zoomend', () => { showView(); if (!map._gisHover) showCoord(map.getCenter()); });
map.getContainer().addEventListener('mouseenter', () => { map._gisHover = true; });
map.getContainer().addEventListener('mouseleave', () => { map._gisHover = false; showCoord(map.getCenter()); });

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
// סיווג לפי שדה מספרי: 5 מחלקות לפי חמישונים, סולם מצהוב לאדום כהה
const CLASS_RAMP = ['#fef08a', '#fbbf24', '#f97316', '#dc2626', '#7f1d1d'];
const NOVAL = '#cbd5e1';

// ---------------------------------------------------------------- רישום שכבות
// כל שכבה: id, title, group, topic, kind ('points' טבלאי | 'geojson' | 'custom'), url, style, legend, link, labels
// ומצב תצוגה שהמשתמש קובע: opacity, sym (סימבולוגיה), labf (שדה תוויות), filt (מסנן)
const LAYERS = [];
const byId = {};
function reg(l) { l.opacity = l.opacity == null ? 1 : l.opacity; LAYERS.push(l); byId[l.id] = l; return l; }

const G_OWN = 'הכלים של הקו הבוחן', G_HOOD = 'שכונות וניתוח', G_NOW = 'מצב קיים', G_FUT = 'תכניות עתידיות', G_GEN = 'שכבות כלליות — לפי תאריך';
// שכבות שהישויות בהן הן תחנות (מק"ט) — מהן אפשר לפתוח "ניתוח תחנה"
const STOPLIKE = ['bus', 'allstops', 'nextst', 'terminals'];
const TOPIC_OPEN = ['תחבורה ציבורית', 'רכבת, רק"ל ומטרו'];

reg({id: 'bus', icon: 'ontime', title: 'מדד דיוק האוטובוסים — לפי תחנה', group: G_OWN, kind: 'points', url: 'data/own/bus-stops.json', tool: 'מדד דיוק האוטובוסים',
  color: p => onColor(p.on), radius: () => 3.2, link: () => ['../bus/', 'פתיחה במדד'],
  legend: () => ({type: 'pt', items: onLegend('בזמן'), note: 'אחוז ההגעות בזמן לתחנה ב-30 הימים האחרונים (כל הקווים), מדאטאבוס. "נסיעות ביום חול" — מלוח הזמנים (GTFS).'}),
  sw: '#16a34a'});
reg({id: 'rail', icon: 'rail', marker: true, title: 'מדד אמינות הרכבת — לפי תחנה', group: G_OWN, kind: 'points', url: 'data/own/rail-stations.json', tool: 'מדד אמינות הרכבת',
  color: p => onColor(p.on), radius: () => 7, link: () => ['../rail/', 'פתיחה במדד'],
  legend: () => ({type: 'pt', items: onLegend('בזמן'), note: 'רכבות שהגיעו לתחנה עד 5 דקות מהלו"ז, 30 ימים אחרונים.'}), sw: '#0ea5e9'});
reg({id: 'kavpach', icon: 'empty', title: 'קו פח — קווים בזבזניים', group: G_OWN, kind: 'geojson', url: 'data/own/kavpach.json', tool: 'קו פח',
  style: p => ({color: scoreColor(p.score), weight: 2.5, opacity: 0.85}), link: () => ['../', 'פתיחה בקו פח'],
  labels: {line: 'קו', makat: 'מק"ט', origin: 'מוצא', dest: 'יעד', district: 'מחוז', category: 'קטגוריה', score: 'ציון קו פח', trips: 'נסיעות (בנתוני קו פח)', avgRiders: 'נוסעים בממוצע לנסיעה', wastedKm: 'ק"מ מבוזבזים', avgCost: 'עלות לנוסע (₪)'},
  legend: () => ({type: 'ln', items: SCORE.map(([t, c], i) => ({c, t: i === 0 ? `ציון ${t} ומעלה` : `ציון ${t}–${SCORE[i - 1][0]}`})), note: 'קווים שקיבלו בקו פח ציון 25 ומעלה (ברירת המחדל של האתר). המסלול: החלופה הראשית בכל כיוון, מ-GTFS.'}), sw: '#dc2626'});
reg({id: 'kavbug', icon: 'detour', title: 'קו באג — קטעי מסלול חשודים', group: G_OWN, kind: 'geojson', url: 'data/own/kavbug.json', tool: 'קו באג',
  style: p => ({color: VERDICT[p.verdict] || '#64748b', weight: 4, opacity: 0.9}), pointColor: p => VERDICT[p.verdict] || '#64748b',
  link: () => ['https://transit-freak.github.io/kav-bug/', 'פתיחה בקו באג'],
  fields: ['line', 'operator', 'dir', 'type', 'from', 'to', 'city', 'curKm', 'optKm', 'excessKm', 'ratio', 'ref', 'tripsDay', 'wasteDayKm', 'verdict', 'reason'],
  labels: {line: 'קו', operator: 'מפעיל', dir: 'כיוון', type: 'סוג', from: 'מתחנה', to: 'עד תחנה', city: 'יישוב', curKm: 'אורך המסלול הנוכחי (ק"מ)', optKm: 'אורך המסלול המוצע — הדרך הקצרה ברכב (ק"מ)', ref: 'קו ייחוס', excessKm: 'ק"מ עודפים', tripsDay: 'נסיעות ביום', wasteDayKm: 'ק"מ מבוזבזים ביום', ratio: 'יחס לדרך הקצרה', verdict: 'הכרעה', reason: 'נימוק', opt: null, refg: null},
  // בזיהוי: המקטע הנוכחי (כתום-אדום) מול המסלול המוצע (ירוק) — כמו בקו באג; זום לשניהם ותחנות הקצה
  after: (p, el, it) => { kavbugDraw(p, it); el.innerHTML = `<div class="lgs"><span><i style="background:#ea580c"></i>המסלול הנוכחי בין התחנות</span><span><i style="background:#16a34a"></i>המסלול המוצע / הקצר</span>${p.refg ? `<span><i style="background:#0d9488"></i>מסלול קו הייחוס ${esc(p.ref || '')}</span>` : ''}</div>`; el.classList.remove('note'); return Promise.resolve(); },
  legend: () => ({type: 'ln', items: Object.entries(VERDICT).map(([t, c]) => ({c, t})).concat([{c: '#16a34a', t: 'בזיהוי: המסלול המוצע / הקצר (ירוק מקווקו)'}, {c: '#ea580c', t: 'בזיהוי: המסלול הנוכחי בין התחנות'}]), note: 'צבע הקטע במפה — לפי הכרעת קו באג. בלחיצה על קטע מוצגים המסלול הנוכחי מול המסלול המוצע (הדרך הקצרה ברכב לפי ניווט), ותחנות הקצה.'}), sw: '#f59e0b'});
reg({id: 'skip', icon: 'skip', title: 'הקו המדלג — תחנות שמדלגים עליהן', group: G_OWN, kind: 'points', url: 'data/own/skip-stops.json', tool: 'הקו המדלג',
  color: () => '#7c3aed', radius: () => 4.5, link: () => ['../skip-stops/', 'פתיחה בהקו המדלג'],
  legend: () => ({type: 'pt', items: [{c: '#7c3aed', t: 'תחנה שהקו עובר לידה ולא עוצר'}]}), sw: '#7c3aed'});
reg({id: 'parks', icon: 'industry', title: 'נגישות אזורי תעשייה', group: G_OWN, kind: 'geojson', url: 'data/own/parks.json', tool: 'נגישות אזורי תעשייה',
  style: p => ({color: '#1e3a8a', weight: 1.5, fillColor: onColor(p.cov == null ? null : p.cov * (p.cov <= 1 ? 100 : 1)), fillOpacity: 0.45}),
  link: () => ['../parks/', 'פתיחה בכלי'],
  labels: {name: 'שם', city: 'יישוב', area: 'שטח (קמ"ר)', lines: 'קווים', cov: 'כיסוי', zt: 'סוג', f: null},
  legend: () => ({type: 'fl', items: onLegend('כיסוי'), note: 'הצבע לפי שיעור הכיסוי בתחבורה ציבורית כפי שחושב בכלי אזורי התעשייה.'}), sw: '#1e3a8a'});
reg({id: 'fleet', icon: 'fleet', title: 'צי הרכבים — לפי יישוב', group: G_OWN, kind: 'points', url: 'data/own/fleet-cities.json', tool: 'צי הרכבים',
  color: () => '#334155', radius: p => Math.max(4, Math.min(22, Math.sqrt(p.total || 0) / 3.5)), link: () => ['../fleet/', 'פתיחה בצי הרכבים'],
  legend: () => ({type: 'pt', items: [{c: '#334155', t: 'גודל העיגול — מספר הרכבים השונים ששירתו את היישוב'}], note: 'הנקודה היא מרכז תחום היישוב, לא חניון.'}), sw: '#334155'});
reg({id: 'terminals', icon: 'terminal', marker: true, title: 'מסופים ותחנות מרכזיות (GTFS)', group: G_OWN, kind: 'points', url: 'data/own/terminals.json', tool: 'GTFS של משרד התחבורה',
  color: () => '#0f172a', radius: p => Math.max(5, Math.min(14, Math.sqrt(p.tpd || 0) / 4)), link: () => null,
  legend: () => ({type: 'pt', items: [{c: '#0f172a', t: 'תחנת אב ב-GTFS (מסוף, ת. מרכזית, רכבת)'}], note: 'רק מה שמסומן ב-GTFS כתחנת אב (location_type=1). הגודל — נסיעות ביום חול.'}), sw: '#0f172a'});

// שכונות: גבולות, מדד מורכב, טווח הליכה
reg({id: 'hoods', icon: 'hood', title: 'גבולות שכונות', group: G_HOOD, kind: 'geojson', url: 'data/own/hoods.json',
  style: () => ({color: '#0f172a', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.06}), labels: {i: null, name: 'שכונה', city: 'יישוב', km2: 'שטח (קמ"ר)'},
  onclick: p => selectHood(p.i), link: () => { const s = byId.hoods.meta && byId.hoods.meta.source; return s && s.url ? [s.url, 'מקור הגבולות'] : null; },
  extra: () => `<p class="note">${hoodSourceNote()}</p>`,
  legend: () => ({type: 'fl', items: [{c: '#e0f2fe', t: 'שכונה — לחיצה בוחרת אותה'}], note: hoodSourceNote()}), sw: '#38bdf8'});
reg({id: 'hoodscore', icon: 'hood', title: 'מדד התחבורה הציבורית לשכונה', group: G_HOOD, kind: 'geojson', url: 'data/own/hoods.json', needs: ['bus', 'hoods'],
  style: p => ({color: '#334155', weight: 0.6, fillColor: hoodColor(hoodScore(p.i)), fillOpacity: 0.6}), labels: {i: null, name: 'שכונה', city: 'יישוב', km2: 'שטח (קמ"ר)'},
  extra: p => hoodExtra(p.i), onclick: p => selectHood(p.i),
  legend: () => ({type: 'fl', items: HOODRAMP.map(([t, c], i) => ({c, t: i === 0 ? `${t} ומעלה` : `${t}–${HOODRAMP[i - 1][0]}`})).concat([{c: '#cbd5e1', t: 'אין תחנות בטווח'}]), note: SCORE_TXT()}), sw: '#65a30d'});
reg({id: 'walk', title: 'טווח הליכה מתחנות', group: G_HOOD, kind: 'custom', needs: ['bus'], sw: '#0ea5e9',
  legend: () => ({type: 'fl', items: [{c: '#bae6fd', t: `עיגול ברדיוס ${RADIUS} מ' סביב כל תחנה`}], note: 'מוצג מזום 13 ומעלה, לתחנות שבתחום המפה. את הרדיוס בוחרים בכלי "ניתוח".'})});

// התחנה הבאה — קורא ישירות את הנתונים של הכלי (../next-station/data.json); הקטגוריות והטקסטים כמו ב-next-station/app.jsx
const NS_CATS = {
  mismatch: {label: 'אי-התאמה מלאה', color: '#dc2626', desc: 'הרחוב לא מופיע בשם כלל'},
  reversal: {label: 'היפוך / ציון-דרך', color: '#7c3aed', desc: 'הרחוב האמיתי מופיע שני בשם'},
  spelling: {label: 'טעות כתיב', color: '#d97706', desc: 'אותו רחוב, אות שונה — כנראה שגיאה'},
  streetvar: {label: 'אי-התאמה ברחוב', color: '#0891b2', desc: 'הרחוב נכתב כאן אחרת מרוב התחנות באותו רחוב'},
  uncertain: {label: 'ספק / כתיב חלופי', color: '#64748b', desc: 'כנראה לא טעות — הבדל כתיב, או שם על-שם מוסד/ציון-דרך (בית ספר, מרפאה, ישיבה…)'},
  closer: {label: 'הצעות כלליות', color: '#16a34a', desc: 'הרחוב המצטלב בשם רחוק מהתחנה — יש רחוב אחר קרוב יותר שכדאי שיופיע בשם'},
};
reg({id: 'nextst', icon: 'name', title: 'התחנה הבאה — שם התחנה מול הכתובת', group: G_OWN, kind: 'points', url: '../next-station/data.json', tool: 'התחנה הבאה',
  // כמו בכלי: הצעת "closer" שההליכה האמיתית הפריכה (walkBad) — מוסתרת
  adapt: d => { const st = (d.stops || []).filter(s => NS_CATS[s.k] && !nsWalkBad(s));
    return {type: 'points', updated: d.generated, fields: ['code', 'name', 'street', 'city', 'cat', 'ms', 'md', 'sug'],
      labels: {code: 'מס׳ תחנה', name: 'שם התחנה', street: 'רחוב בכתובת', city: 'עיר', cat: 'סוג', ms: 'רחוב לפי המפה', md: 'מרחק מהרחוב (מ׳)', sug: 'שם מוצע'},
      rows: st.map(s => [s.lo, s.la, s.c, s.n, s.s, s.t, NS_CATS[s.k].label, s.ms, s.md, s.sug || null]), raw: st}; },
  color: p => (Object.values(NS_CATS).find(c => c.label === p.cat) || {}).color || '#64748b', radius: () => 4.5, link: () => null,
  extra: (p, it) => nsDetails(it.raw), after: (p, el) => stopLinesInto(p.code, el),
  legend: () => ({type: 'pt', items: Object.values(NS_CATS).map(c => ({c: c.color, t: c.label})), note: 'תחנות ששמן לא תואם את הרחוב שבכתובת שלהן (GTFS מול OpenStreetMap), מתוך הכלי "התחנה הבאה".'}), sw: '#dc2626'});

// כל התחנות וכל הקווים לפי תאריך — מנתוני כלי ההיסטוריה (tools/gis_history.py בונה רק אינדקס מיקום ומרווחי פעילות;
// הקווים שבתחנה ופרטי הקו נקראים בלחיצה ישירות מ-../line-history/data)
reg({id: 'allstops', icon: 'stop', title: 'כל התחנות — פעילות בתאריך', group: G_GEN, kind: 'points', url: 'data/hist/stops.json', tool: 'היסטוריית הקווים והתחנות',
  adapt: d => ({type: 'points', fields: ['code', 'name', 'city', 'now', 'iv'], rows: d.rows.map(r => [r[2], r[1], r[0], r[3], r[4], r[5], r[6]])}),
  labels: {code: 'מק"ט', name: 'שם התחנה', city: 'יישוב', now: null, iv: null, st: 'בתאריך הנבחר'},
  prep: l => { l.fields = ['code', 'name', 'city', 'st']; restatus(l); },
  color: p => p.st === 'פעילה' ? '#16a34a' : p.st === 'לא פעילה' ? '#dc2626' : '#94a3b8', radius: () => 3.2,
  link: p => [`../line-history/#stop=${encodeURIComponent(p.code)}`, 'כל ההיסטוריה של התחנה'],
  after: (p, el) => stopLinesInto(p.code, el),
  legend: () => ({type: 'pt', items: [{c: '#16a34a', t: 'פעילה — לפחות קו אחד עצר בה בתאריך'}, {c: '#dc2626', t: 'לא פעילה בתאריך'}, {c: '#94a3b8', t: 'אין תיעוד לתאריך הזה'}], note: `תאריך: ${fmtD(DATE)}. ${histRangeTxt()} "היום" — כמו בכלי ההיסטוריה: רק קווים שיש להם לו"ז לשבוע הקרוב. המיקום — האחרון שתועד.`}), sw: '#16a34a'});
const LTYPE = {bus: ['אוטובוס', '#2563eb'], rail: ['רכבת', '#0f172a'], lightrail: ['רכבת קלה', '#9333ea'], taxi: ['מונית שירות', '#d97706'], demand: ['תחבורה לפי דרישה', '#0d9488'], cable: ['רכבל', '#be123c']};
reg({id: 'alllines', title: 'קווים — המסלולים בתאריך', group: G_GEN, kind: 'geojson', url: 'data/hist/lines.json', tool: 'היסטוריית הקווים',
  dyn: l => histLines().then(() => { if (!l.items) { l.items = []; l.have = new Set(); l.fields = ['line', 'op', 'from', 'to', 'type', 'rd']; l.meta = {updated: HMETA && HMETA.gen}; } }),
  labels: {line: 'קו', op: 'מפעיל', from: 'מוצא', to: 'יעד', type: 'סוג', rd: 'מק"ט-כיוון-חלופה'},
  style: p => ({color: (LTYPE[p.tt] || LTYPE.bus)[1], weight: p.tt === 'rail' ? 3 : 2, opacity: 0.7}),
  link: p => [`../line-history/#${encodeURIComponent(p.rd)}@${DATE}`, 'פתיחה בהיסטוריית הקווים'],
  after: (p, el) => lineInfoInto(p.rd, el),
  legend: () => ({type: 'ln', items: Object.values(LTYPE).map(([t, c]) => ({c, t})), note: `המסלולים שהיו בתוקף ב-${fmtD(DATE)}, מזום 11 ומעלה ובתחום המפה. ${histRangeTxt()} המסלולים מפושטים לתצוגה (~10 מ'); בלחיצה — הקו המלא מכלי ההיסטוריה.`}), sw: '#2563eb'});

// ---------------------------------------------------------------- טעינה ונרמול
// כל שכבה נטענת פעם אחת לרשימת ישויות אחידה: {p: מאפיינים, ll?: [lat,lon], f?: GeoJSON feature}
function normalize(l, d) {
  if (l.adapt) d = l.adapt(d);
  if (d.type === 'points') {
    l.fields = d.fields; l.labels = Object.assign({}, d.labels, l.labels || {}); l.meta = d;
    l.items = d.rows.map(r => { const p = {}; d.fields.forEach((f, i) => { p[f] = r[i + 2]; }); return {p, ll: [r[1], r[0]]}; });
  } else {
    l.meta = d;
    l.items = (d.features || []).filter(f => f.geometry).map(f => ({p: f.properties || {}, f}));
    if (!l.fields) { const s = new Set(); l.items.slice(0, 300).forEach(it => Object.keys(it.p).forEach(k => s.add(k))); l.fields = [...s]; }
  }
  l.fields = l.fields.filter(f => !(l.labels && l.labels[f] === null));
  if (d.raw) l.items.forEach((it, i) => { it.raw = d.raw[i]; });
  if (l.prep) l.prep(l);
}
const SHARED = {};
function fetchData(l) {
  if (l.kind === 'custom') return Promise.resolve(l);
  if (l.items) return Promise.resolve(l);
  if (l.dyn) return l.dyn(l).then(() => l);
  const p = SHARED[l.url] || (SHARED[l.url] = load(l.url));
  return p.then(d => { normalize(l, d); return l; });
}
const ensure = id => fetchData(byId[id]);
const fname = (l, f) => (l.labels && l.labels[f]) || f;

// ---------------------------------------------------------------- גאומטריה של ישות
const isPt = it => !!it.ll || /Point/.test(it.f.geometry.type);
function bbOf(it) {
  if (it.bb) return it.bb;
  if (it.ll) return (it.bb = L.latLngBounds([it.ll, it.ll]));
  let a = 90, b = 180, c = -90, d = -180;
  eachCoord(it.f.geometry, (x, y) => { if (y < a) a = y; if (y > c) c = y; if (x < b) b = x; if (x > d) d = x; });
  return (it.bb = L.latLngBounds([a, b], [c, d]));
}
const ctrOf = it => it.ll || bbOf(it).getCenter();
function eachCoord(g, fn) {
  const walk = c => { if (typeof c[0] === 'number') fn(c[0], c[1]); else c.forEach(walk); };
  if (g.type === 'GeometryCollection') g.geometries.forEach(x => eachCoord(x, fn)); else walk(g.coordinates);
}

// ---------------------------------------------------------------- סימבולוגיה, מסנן ותוויות
function isNumField(l, f) {
  let n = 0, t = 0;
  for (const it of l.items.slice(0, 600)) { const v = it.p[f]; if (v == null || v === '') continue; t++; if (typeof v === 'number') n++; }
  return t > 0 && n / t > 0.9;
}
function breaksOf(l, f) {
  const v = l.items.map(it => it.p[f]).filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = k => v[Math.min(v.length - 1, Math.floor(v.length * k))];
  return {min: v[0], max: v[v.length - 1], b: [q(0.2), q(0.4), q(0.6), q(0.8)]};
}
function classOf(l, v) {
  if (typeof v !== 'number' || !l.sym.br) return -1;
  let k = 0; while (k < 4 && v > l.sym.br.b[k]) k++; return k;
}
function classColor(l, v) { const k = classOf(l, v); return k < 0 ? NOVAL : CLASS_RAMP[k]; }
function defRadius(l, it) { return it.ll && l.radius ? l.radius(it.p) : 4.5; }
function ptStyle(l, it) {
  const s = l.sym, o = l.opacity;
  let fill = it.ll ? (l.color ? l.color(it.p) : l.sw) : (l.pointColor ? l.pointColor(it.p) : (l.style ? l.style(it.p).color : null) || l.sw);
  if (s && s.mode === 'single') fill = s.color; else if (s && s.mode === 'class') fill = classColor(l, it.p[s.field]);
  return {radius: s && s.size ? +s.size : defRadius(l, it), color: '#0f172a', weight: 0.6, fillColor: fill, fillOpacity: 0.9 * o, opacity: o};
}
function pathStyle(l, it) {
  const st = Object.assign({color: l.sw, weight: 2, fillColor: l.sw, fillOpacity: 0.25, opacity: 1}, l.style ? l.style(it.p) : {});
  const s = l.sym;
  let c = null;
  if (s && s.mode === 'single') c = s.color; else if (s && s.mode === 'class') c = classColor(l, it.p[s.field]);
  if (c) { st.fillColor = c; if (!/Polygon/.test(it.f.geometry.type)) st.color = c; }
  if (s && s.size) st.weight = +s.size;
  st.opacity = (st.opacity == null ? 1 : st.opacity) * l.opacity; st.fillOpacity = (st.fillOpacity == null ? 0.25 : st.fillOpacity) * l.opacity;
  return st;
}
const OPS = {'=': 'שווה ל', '!=': 'שונה מ', '>': 'גדול מ', '>=': 'גדול או שווה', '<': 'קטן מ', '<=': 'קטן או שווה', '~': 'מכיל'};
function passes(l, it) {
  if (AREA.v && !inArea(l, it)) return false;
  const F = l.filt; if (!F) return true;
  const v = it.p[F.f], w = F.v;
  if (F.op === '~') return String(v == null ? '' : v).includes(w);
  const nv = typeof v === 'number' ? v : parseFloat(v), nw = parseFloat(w);
  const numeric = !isNaN(nv) && !isNaN(nw) && /^-?[\d.]+$/.test(String(w).trim());
  const a = numeric ? nv : String(v == null ? '' : v), b = numeric ? nw : String(w);
  switch (F.op) {
    case '=': return a === b; case '!=': return a !== b;
    case '>': return v != null && a > b; case '>=': return v != null && a >= b;
    case '<': return v != null && a < b; case '<=': return v != null && a <= b;
  }
  return true;
}
const passCount = l => l.items ? l.items.reduce((n, it) => n + (passes(l, it) ? 1 : 0), 0) : 0;
const swatchOf = l => l.sym && l.sym.mode === 'single' ? l.sym.color : l.sw || hashColor(l.id);

// סוג הגאומטריה של השכבה — קובע באיזו חלונית היא מצוירת
function geomKind(l) {
  if (l.kind === 'points') return 'pts';
  const it = (l.items || []).find(x => x.f), g = l.geom || (it ? it.f.geometry.type : '');
  return /Polygon/.test(g) ? 'poly' : /Line/.test(g) ? 'line' : 'pts';
}
const rendOf = l => l.rend || (l.rend = L.canvas({padding: 0.4, tolerance: 4, pane: geomKind(l)}));
const rendPt = l => l.rendP || (l.rendP = geomKind(l) === 'pts' ? rendOf(l) : L.canvas({padding: 0.4, tolerance: 4, pane: 'pts'}));
const useMarker = l => !!(l.marker && l.icon && ICONS[l.icon] && (!l.items || l.items.length <= ICONMAX));
function ptIcon(l, it) {
  const st = ptStyle(l, it), k = l.icon === 'stop' && it.p.st === 'לא פעילה' ? 'stopOff' : l.icon;
  const px = Math.round(Math.max(18, Math.min(30, st.radius * 3.4)));
  return L.divIcon({className: 'lic', html: iconSvg(k, l.sym || l.color || l.pointColor ? st.fillColor : null, px), iconSize: [px, px], iconAnchor: [px / 2, px / 2]});
}
function mkPt(l, it, ll) {
  if (useMarker(l)) { const m = L.marker(ll, {icon: ptIcon(l, it), interactive: false, keyboard: false, pane: 'ptsIco', opacity: l.opacity}); m.isIco = true; return m; }
  return L.circleMarker(ll, Object.assign({renderer: rendPt(l), interactive: false}, ptStyle(l, it)));
}
function mkLay(l, it, idx) {
  it.i = idx;
  it.lay = it.ll ? mkPt(l, it, it.dll || it.ll) :
    L.geoJSON(it.f, {renderer: rendOf(l), interactive: false, style: () => pathStyle(l, it), pointToLayer: (f, ll) => mkPt(l, it, ll)});
}
function buildLeaflet(l) {
  if (l.kind === 'custom') return;
  // שקיפות ברירת מחדל לשכבות פוליגונים (~40%), כדי שהשכבות שמתחתן ייראו
  if (!l.opaInit) { l.opaInit = true; if (geomKind(l) === 'poly' && l.opacity === 1) l.opacity = 0.6; }
  l.items.forEach((it, idx) => mkLay(l, it, idx));
  l.lg = L.featureGroup();
  refill(l);
}
function refill(l) {
  if (!l.lg) return;
  l.lg.clearLayers();
  l.items.forEach(it => { if (passes(l, it)) l.lg.addLayer(it.lay); });
}
const styleLay = (l, it, c) => { if (c.isIco) { c.setIcon(ptIcon(l, it)); c.setOpacity(l.opacity); } else c.setStyle(c instanceof L.CircleMarker ? ptStyle(l, it) : pathStyle(l, it)); };
function restyle(l) {
  if (l.kind === 'custom') { drawWalk(); return; }
  if (!l.lg) return;
  l.items.forEach(it => { if (it.ll) styleLay(l, it, it.lay); else it.lay.eachLayer(c => styleLay(l, it, c)); });
}
// z-index של משטחי הציור לפי הסדר בעץ: שכבה גבוהה יותר בעץ מצוירת מעל (בתוך אותו סוג גאומטריה)
function applyOrder() {
  const n = LAYERS.length;
  LAYERS.forEach((l, i) => {
    [l.rend, l.rendP].forEach(r => { if (r && r._container) r._container.style.zIndex = String(n - i); });
    if (l.lg && useMarker(l)) l.lg.eachLayer(m => { if (m.setZIndexOffset) m.setZIndexOffset((n - i) * 10); else if (m.eachLayer) m.eachLayer(c => c.setZIndexOffset && c.setZIndexOffset((n - i) * 10)); });
  });
}
// הזזת שכבה בעץ: dir = 'front' (לראש הקבוצה), 'back' (לסוף), או לפני שכבה אחרת (before)
function moveLayer(l, dir, before) {
  const grp = LAYERS.filter(x => x.group === l.group && x.topic === l.topic);
  const i = LAYERS.indexOf(l); LAYERS.splice(i, 1);
  let j;
  if (before) j = LAYERS.indexOf(before);
  else if (dir === 'front') j = LAYERS.indexOf(grp.find(x => x !== l) || l);
  else { const last = grp.filter(x => x !== l).pop(); j = last ? LAYERS.indexOf(last) + 1 : i; }
  LAYERS.splice(j < 0 ? i : j, 0, l);
  renderTree(); applyOrder(); if (PANE === 'legend') renderLegend();
  lsSet('gis.order', JSON.stringify(LAYERS.map(x => x.id)));
}
// נקודות באותו מקום בדיוק (משכבות שונות או באותה שכבה): בזום 16 ומעלה נפרשות במעגל קטן, כדי שכולן ייראו וייבחרו
let SPREAD = [];
function spreadPts() {
  SPREAD.forEach(it => { it.dll = null; if (it.lay && it.lay.setLatLng) it.lay.setLatLng(it.ll); });
  SPREAD = [];
  if (map.getZoom() < 16) return;
  const B = map.getBounds(), G = new Map();
  LAYERS.forEach(l => { if (!l.on || !l.lg || l.kind !== 'points' || !l.items || !map.hasLayer(l.lg)) return;
    l.items.forEach(it => { if (!it.ll || !B.contains(it.ll) || !passes(l, it)) return; const k = it.ll[0].toFixed(5) + ',' + it.ll[1].toFixed(5); (G.get(k) || G.set(k, []).get(k)).push(it); }); });
  G.forEach(arr => {
    if (arr.length < 2) return;
    const P = map.latLngToLayerPoint(arr[0].ll), R = 9 + arr.length * 2;
    arr.forEach((it, j) => { const a = 2 * Math.PI * j / arr.length - Math.PI / 2, q = map.layerPointToLatLng(P.add([R * Math.cos(a), R * Math.sin(a)]));
      it.dll = [q.lat, q.lng]; if (it.lay.setLatLng) it.lay.setLatLng(it.dll); SPREAD.push(it); });
  });
}
map.on('zoomend moveend', spreadPts);
const LABMAX = 300;
function drawLabels(l) {
  if (l.labG) { map.removeLayer(l.labG); l.labG = null; }
  if (!l.on || !l.labf || !l.items || FUT.hidden) { if (l.labMsg) { msg(''); l.labMsg = false; } return; }
  const B = map.getBounds(), g = L.layerGroup(); let n = 0;
  for (const it of l.items) {
    if (!passes(l, it)) continue;
    const v = it.p[l.labf]; if (v == null || v === '') continue;
    const c = ctrOf(it); if (!B.contains(c)) continue;
    if (++n > LABMAX) break;
    const t = typeof v === 'number' ? (Number.isInteger(v) ? num(v) : fmt1(v)) : String(v);
    g.addLayer(L.marker(c, {icon: L.divIcon({className: 'lbl', html: `<span style="transform:translate(-50%,${isPt(it) ? '-135%' : '-50%'})">${esc(t.length > 40 ? t.slice(0, 40) + '…' : t)}</span>`, iconSize: [0, 0]}), interactive: false, keyboard: false}));
  }
  l.labG = g.addTo(map);
  if (n > LABMAX) { msg(`תוויות "${l.title}": מוצגות ${LABMAX} הראשונות בתחום — מתקרבים כדי לראות את כולן`); l.labMsg = true; }
  else if (l.labMsg) { msg(''); l.labMsg = false; }
}
map.on('moveend', () => LAYERS.forEach(l => { if (l.labf && l.on) drawLabels(l); }));

// ---------------------------------------------------------------- הצגה והסתרה
function setVisible(l, on) {
  if (on && (l.id === 'hoodscore' || l.id === 'walk')) {
    l.on = true; setStatus(l, 'טוען…');
    return hoodScoreLoad().then(() => showLayer(l, true)).catch(() => { l.on = false; setStatus(l, LATER, true); rerow(l); });
  }
  return showLayer(l, on);
}
function showLayer(l, on) {
  l.on = on;
  rerow(l);
  if (!on) {
    if (l.lg) map.removeLayer(l.lg);
    if (l.labG) { map.removeLayer(l.labG); l.labG = null; }
    if (l.id === 'walk') drawWalk();
    afterLayerChange();
    return Promise.resolve();
  }
  setStatus(l, 'טוען…');
  return Promise.all((l.needs || []).map(ensure)).then(() => fetchData(l)).then(() => {
    if (!l.on) return;
    setStatus(l, '');
    if (l.kind === 'custom') { drawWalk(); afterLayerChange(); return; }
    if (!l.lg) buildLeaflet(l);
    if (!FUT.hidden) l.lg.addTo(map);
    applyOrder(); spreadPts();
    if (l.id === 'alllines') linesRefresh();
    drawLabels(l); rerow(l); afterLayerChange();
  }).catch(err => {
    console.warn('layer', l.id, err && err.message);
    l.on = false; setStatus(l, LATER, true); rerow(l);
  });
}
function afterLayerChange() { if (PANE === 'legend') renderLegend(); if (PANE === 'tables') renderTablesPane(); if (PANE === 'analysis') renderHoodTop(); saveState(); }
function setStatus(l, t, err) {
  l.stTxt = t || ''; l.stErr = !!err;
  const row = rowOf(l); if (!row) return;
  const st = $('.st', row); st.textContent = l.stTxt; st.classList.toggle('err', l.stErr); st.hidden = !l.stTxt;
}
function zoomTo(l) {
  fetchData(l).then(() => {
    if (!l.on) return setVisible(l, true).then(() => zoomTo(l));
    if (l.lg) { const b = l.lg.getBounds(); if (b.isValid()) map.fitBounds(b, {padding: [20, 20], maxZoom: 16}); }
  }).catch(() => setStatus(l, LATER, true));
}

// ---------------------------------------------------------------- עץ השכבות
let CATALOG = null, OWNMETA = null;
const rowOf = l => $(`.lyr[data-id="${CSS.escape(l.id)}"]`);
function lyrRow(l) {
  const n = l.items ? (l.filt || (AREA.v && l.kind !== 'custom') ? `${num(passCount(l))}/${num(l.items.length)}` : num(l.items.length)) : l.count != null ? num(l.count) : '';
  const fx = [l.filt ? 'מסנן' : '', l.labf ? 'תוויות' : '', l.sym ? 'סימבולוגיה' : ''].filter(Boolean).join(' · ');
  const active = tLayer && tLayer.id === l.id && !$('#table').hidden;
  return `<div class="lyr${l.on ? ' on' : ''}${active ? ' active' : ''}" data-id="${esc(l.id)}" draggable="true">
    <div class="lr"><button class="eye" aria-pressed="${!!l.on}" title="${l.on ? 'הסתרה' : 'הצגה'}" aria-label="הצגה או הסתרה של ${esc(l.title)}">${ICO.eye}</button>
    ${l.icon && ICONS[l.icon] && !l.sym ? `<span class="ic" title="${esc(l.title)}">${iconSvg(l.icon)}</span>` : `<span class="sw${l.sym && l.sym.mode === 'class' ? ' class' : ''}" style="background:${swatchOf(l)}"></span>`}
    <span class="nm" title="${esc(l.title)}">${esc(l.title)}${fx ? `<span class="fx">${fx}</span>` : ''}</span>
    <span class="cnt">${n}</span>
    <button class="dots" title="אפשרויות השכבה" aria-label="אפשרויות השכבה ${esc(l.title)}" aria-haspopup="menu">⋯</button></div>
    <div class="st${l.stErr ? ' err' : ''}"${l.stTxt ? '' : ' hidden'}>${esc(l.stTxt || '')}</div>
    ${l.edit ? editorHtml(l) : ''}</div>`;
}
function rerow(l) { const row = rowOf(l); if (row) row.outerHTML = lyrRow(l); }
function grpHtml(title, inner, open, count) {
  return `<div class="grp${open ? '' : ' closed'}"><div class="gh" tabindex="0" role="button" aria-expanded="${open}"><span class="car">▼</span>${ICO.fold}${esc(title)}<span class="gn">${count != null ? num(count) : ''}</span></div><div class="gb">${inner}</div></div>`;
}
function renderTree() {
  const own = LAYERS.filter(l => l.group === G_OWN), hood = LAYERS.filter(l => l.group === G_HOOD);
  const gen = LAYERS.filter(l => l.group === G_GEN);
  let h = grpHtml(G_OWN, own.map(lyrRow).join(''), true, own.length) + grpHtml(G_GEN, gen.map(lyrRow).join(''), true, gen.length);
  for (const G of [G_NOW, G_FUT]) {
    const ls = LAYERS.filter(l => l.group === G);
    let inner = '';
    if (!CATALOG) inner = `<div class="note warn">שכבות משרד התחבורה (data.gov.il) עוד לא הורדו. ${LATER}.</div>`;
    else if (!ls.length) inner = `<div class="note">אין שכבות בקבוצה הזו בקטלוג הנוכחי — ${LATER}.</div>`;
    else {
      const topics = (CATALOG.topics || []).filter(t => ls.some(l => l.topic === t));
      inner = topics.map(t => { const tl = ls.filter(l => l.topic === t); return grpHtml(t, tl.map(lyrRow).join(''), TOPIC_OPEN.includes(t), tl.length); }).join('');
    }
    h += grpHtml(G + ' — משרד התחבורה', inner, true, ls.length || null);
  }
  h += grpHtml(G_HOOD, hood.map(lyrRow).join(''), true, hood.length);
  if (CATALOG) {
    h += `<div class="note">שכבות משרד התחבורה עודכנו ${esc((CATALOG.updated || '').replace('T', ' ').replace('Z', ''))} · ${num((CATALOG.layers || []).length)} שכבות` +
      ((CATALOG.skipped || []).length ? ` · <button class="linkbtn" id="skipped">${num(CATALOG.skipped.length)} מאגרים שלא נכנסו</button>` : '') + '</div><div id="skiplist"></div>';
  }
  $('#tree').innerHTML = h;
}

// גרירת שכבה בעץ משנה את סדר הציור (בתוך אותה קבוצה)
let DRAG = null;
$('#tree').addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('.lyr'); if (!r) return; DRAG = byId[r.dataset.id]; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', r.dataset.id); } catch (x) {} r.classList.add('drag'); });
$('#tree').addEventListener('dragover', e => { const r = e.target.closest('.lyr'); if (!r || !DRAG) return; const t = byId[r.dataset.id]; if (!t || t === DRAG || t.group !== DRAG.group || t.topic !== DRAG.topic) return; e.preventDefault(); $$('.lyr.dover').forEach(x => x.classList.remove('dover')); r.classList.add('dover'); });
$('#tree').addEventListener('drop', e => { const r = e.target.closest('.lyr'); if (!r || !DRAG) return; e.preventDefault(); const t = byId[r.dataset.id]; if (t && t !== DRAG) moveLayer(DRAG, null, t); DRAG = null; });
$('#tree').addEventListener('dragend', () => { DRAG = null; $$('.lyr.drag, .lyr.dover').forEach(x => x.classList.remove('drag', 'dover')); });

// עורכים בתוך שורת השכבה (נפתחים מתפריט ⋯)
function editorHtml(l) {
  const E = l.edit, head = t => `<h6>${t}<button class="x" data-act="eclose" title="סגירה" aria-label="סגירה">${ICO.x}</button></h6>`;
  if (!l.items && l.kind !== 'custom' && E !== 'info') return `<div class="lx">${head('טוען…')}</div>`;
  if (E === 'opa') return `<div class="lx">${head('שקיפות')}<div class="row"><input type="range" min="0.05" max="1" step="0.05" value="${l.opacity}" data-k="opacity" aria-label="אטימות"><b class="pv">${Math.round(l.opacity * 100)}%</b></div></div>`;
  if (E === 'sym') {
    const s = l.sym || {mode: 'def'}, nf = l.fields.filter(f => isNumField(l, f));
    const size = s.size || '', isLine = !l.items.some(isPt);
    let body = `<div class="row"><div class="seg" role="group" aria-label="סוג סימבולוגיה">${[['def', 'מקורית'], ['single', 'צבע אחיד'], ['class', 'לפי שדה']].map(([k, t]) => `<button data-act="symmode" data-v="${k}" class="${s.mode === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
    if (s.mode === 'single') body += `<div class="row"><span>צבע</span><input type="color" value="${s.color}" data-k="symcolor" aria-label="צבע"></div>`;
    if (s.mode === 'class') {
      body += `<div class="row"><span>שדה</span><select data-k="symfield" aria-label="שדה לסיווג">${nf.length ? nf.map(f => `<option value="${esc(f)}"${f === s.field ? ' selected' : ''}>${esc(fname(l, f))}</option>`).join('') : '<option value="">אין שדות מספריים</option>'}</select></div>`;
      if (s.br) body += `<div class="row"><span>5 מחלקות</span><div class="ramp">${CLASS_RAMP.map(c => `<i style="background:${c}"></i>`).join('')}</div></div><div class="row"><span></span><small class="mut">חמישונים: ${classLabels(l).map(esc).join(' | ')}</small></div>`;
    }
    body += `<div class="row"><span>${isLine ? 'עובי קו' : 'גודל'}</span><input type="number" min="1" max="30" step="0.5" value="${size}" placeholder="מקורי" data-k="symsize" aria-label="גודל"></div>`;
    return `<div class="lx">${head('סימבולוגיה')}${body}</div>`;
  }
  if (E === 'lab') return `<div class="lx">${head('תוויות')}<div class="row"><span>שדה</span><select data-k="labf" aria-label="שדה לתוויות"><option value="">בלי תוויות</option>${l.fields.map(f => `<option value="${esc(f)}"${f === l.labf ? ' selected' : ''}>${esc(fname(l, f))}</option>`).join('')}</select></div><p class="mut">עד ${LABMAX} תוויות בתחום המפה.</p></div>`;
  if (E === 'filt') {
    const d = l.fdraft || l.filt || {f: l.fields[0], op: '=', v: ''};
    const vals = [...new Set(l.items.slice(0, 5000).map(it => it.p[d.f]).filter(v => v != null && v !== ''))].slice(0, 60);
    return `<div class="lx">${head('מסנן')}<div class="row"><span>שדה</span><select data-k="ff" aria-label="שדה">${l.fields.map(f => `<option value="${esc(f)}"${f === d.f ? ' selected' : ''}>${esc(fname(l, f))}</option>`).join('')}</select></div>
      <div class="row"><span>תנאי</span><select data-k="fo" aria-label="תנאי">${Object.entries(OPS).map(([k, t]) => `<option value="${esc(k)}"${k === d.op ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="row"><span>ערך</span><input type="text" data-k="fv" list="fvl-${esc(l.id)}" value="${esc(d.v)}" aria-label="ערך"><datalist id="fvl-${esc(l.id)}">${vals.map(v => `<option value="${esc(v)}">`).join('')}</datalist></div>
      <div class="row"><span></span><button class="btn pri" data-act="fapply">החלה</button><button class="btn" data-act="fclear">ניקוי</button></div>
      ${l.filt ? `<p class="mut">${num(passCount(l))} מתוך ${num(l.items.length)} ישויות עומדות בתנאי.</p>` : ''}</div>`;
  }
  if (E === 'info') {
    const m = l.meta || {}, rows = [];
    const lk = l.link && l.link({});
    if (l.src) rows.push(['מקור', `משרד התחבורה — <a href="${esc(l.src)}" target="_blank" rel="noopener">המאגר ב-data.gov.il</a>`]);
    else if (l.id.startsWith('hood') && m.source) rows.push(['מקור', esc(m.source.source || '')]);
    else if (l.tool) rows.push(['מקור', `הקו הבוחן — ${lk ? `<a href="${esc(lk[0])}" target="_blank" rel="noopener">${esc(l.tool)}</a>` : esc(l.tool)}`]);
    if (l.modified) rows.push(['עדכון במקור', esc(String(l.modified).slice(0, 10))]);
    const upd = m.updated || m.generated || (m.source && m.source.snapshot);
    if (upd) rows.push(['עדכון הנתונים', esc(String(upd).slice(0, 10))]);
    if (m.period) rows.push(['תקופת המדידה', esc(m.period.join(' – '))]);
    if (!upd && !l.src && OWNMETA && OWNMETA.built && l.url && l.url.includes('/own/')) rows.push(['נבנה', esc(OWNMETA.built.replace('T', ' ').replace('Z', ''))]);
    const n = l.items ? l.items.length : l.count;
    if (n != null) rows.push(['ישויות', num(n) + (l.filt ? ` (${num(passCount(l))} אחרי המסנן)` : '')]);
    if (l.items) { const pts = l.items.filter(isPt).length; rows.push(['גאומטריה', pts === l.items.length ? 'נקודות' : pts ? 'מעורבת' : l.items.some(it => /Polygon/.test(it.f.geometry.type)) ? 'פוליגונים' : 'קווים']); }
    if (l.fields) rows.push(['שדות', num(l.fields.length)]);
    const lg = l.legend && l.legend();
    if (lg && lg.note) rows.push(['הערה', lg.note]);
    return `<div class="lx">${head('מידע על השכבה')}<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`;
  }
  return '';
}
function classLabels(l) {
  const br = l.sym.br, f = v => Number.isInteger(v) ? num(v) : fmt1(v), e = [br.min, ...br.b, br.max];
  return CLASS_RAMP.map((c, k) => `${f(e[k])}–${f(e[k + 1])}`);
}
function openEditor(l, E) {
  l.edit = E; rerow(l);
  if (!l.items && l.kind !== 'custom') fetchData(l).then(() => rerow(l)).catch(() => { l.edit = null; setStatus(l, LATER, true); rerow(l); });
}
function applySym(l) { restyle(l); drawLabels(l); rerow(l); if (PANE === 'legend') renderLegend(); }

$('#tree').addEventListener('click', e => {
  if (e.target.id === 'skipped') { $('#skiplist').innerHTML = '<div class="note">' + CATALOG.skipped.map(s => `${esc(s.title || s.dataset)} — ${esc(s.reason)}`).join('<br>') + '</div>'; return; }
  const gh = e.target.closest('.gh'); if (gh) { const g = gh.parentElement; g.classList.toggle('closed'); gh.setAttribute('aria-expanded', !g.classList.contains('closed')); return; }
  const row = e.target.closest('.lyr'); if (!row) return; const l = byId[row.dataset.id];
  if (e.target.closest('.eye') || e.target.closest('.nm')) { setVisible(l, !l.on); return; }
  const dots = e.target.closest('.dots'); if (dots) { layerMenu(l, dots); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'eclose') { l.edit = null; l.fdraft = null; rerow(l); }
  else if (act === 'symmode') {
    const v = b.dataset.v;
    if (v === 'def') l.sym = l.sym && l.sym.size ? {mode: 'def', size: l.sym.size} : null;
    else if (v === 'single') l.sym = {mode: 'single', color: (l.sym && l.sym.color) || swatchOf(l), size: l.sym && l.sym.size};
    else { const nf = l.fields.filter(f => isNumField(l, f)); const f = (l.sym && l.sym.field) || nf[0]; l.sym = {mode: 'class', field: f, br: f ? breaksOf(l, f) : null, size: l.sym && l.sym.size}; }
    applySym(l);
  } else if (act === 'fapply') {
    const f = $('[data-k=ff]', row).value, op = $('[data-k=fo]', row).value, v = $('[data-k=fv]', row).value.trim();
    l.filt = v === '' && op !== '~' ? null : {f, op, v}; l.fdraft = null;
    refill(l); drawLabels(l); rerow(l); if (tLayer === l) renderTable();
  } else if (act === 'fclear') { l.filt = null; l.fdraft = null; refill(l); drawLabels(l); rerow(l); if (tLayer === l) renderTable(); }
});
$('#tree').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('gh')) e.target.click(); });
$('#tree').addEventListener('input', e => {
  const row = e.target.closest('.lyr'); if (!row) return; const l = byId[row.dataset.id], k = e.target.dataset.k;
  if (k === 'opacity') { l.opacity = +e.target.value; $('.pv', row).textContent = Math.round(l.opacity * 100) + '%'; restyle(l); }
  else if (k === 'symcolor') { l.sym.color = e.target.value; restyle(l); $('.sw', row).style.background = l.sym.color; }
});
$('#tree').addEventListener('change', e => {
  const row = e.target.closest('.lyr'); if (!row) return; const l = byId[row.dataset.id], k = e.target.dataset.k, v = e.target.value;
  if (k === 'symcolor') applySym(l);
  else if (k === 'symfield') { l.sym.field = v; l.sym.br = breaksOf(l, v); applySym(l); }
  else if (k === 'symsize') { l.sym = Object.assign(l.sym || {mode: 'def'}, {size: v === '' ? null : Math.max(1, Math.min(30, +v))}); if (l.sym.mode === 'def' && !l.sym.size) l.sym = null; applySym(l); }
  else if (k === 'labf') { l.labf = v || null; drawLabels(l); rerow(l); }
  else if (k === 'ff' || k === 'fo') { l.fdraft = {f: $('[data-k=ff]', row).value, op: $('[data-k=fo]', row).value, v: $('[data-k=fv]', row).value}; rerow(l); }
});

// תפריט ⋯ (שכבה, או פעולות על כל העץ)
function openMenu(anchor, items) {
  const m = $('#lmenu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button role="menuitem" data-i="${i}">${it.ico || ''}${esc(it.t)}</button>`).join('');
  m.hidden = false;
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(4, Math.min(innerWidth - w - 4, r.left)) + 'px';
  m.style.top = (r.bottom + h + 4 > innerHeight ? Math.max(4, r.top - h - 2) : r.bottom + 2) + 'px';
  m.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; closeMenu(); items[+b.dataset.i].go(); };
  $$('.dots.on').forEach(d => d.classList.remove('on')); anchor.classList.add('on');
  const f = $('button', m); if (f) f.focus();
}
function closeMenu() { $('#lmenu').hidden = true; $$('.dots.on').forEach(d => d.classList.remove('on')); }
function layerMenu(l, anchor) {
  const data = l.kind !== 'custom';
  openMenu(anchor, [
    data && {t: 'זום לשכבה', ico: ICO.zoom, go: () => zoomTo(l)},
    {t: 'שקיפות', ico: ICO.opa, go: () => openEditor(l, 'opa')},
    data && {t: 'סימבולוגיה', ico: ICO.sym, go: () => openEditor(l, 'sym')},
    data && {t: 'תוויות', ico: ICO.lab, go: () => openEditor(l, 'lab')},
    data && {t: 'מסנן', ico: ICO.filt, go: () => openEditor(l, 'filt')},
    data && '-',
    data && {t: 'פתיחת טבלה', ico: ICO.tbl, go: () => openTable(l)},
    {t: 'הבא לחזית', ico: ICO.up || '', go: () => moveLayer(l, 'front')},
    {t: 'שלח לאחור', ico: ICO.down || '', go: () => moveLayer(l, 'back')},
    {t: 'מידע על השכבה', ico: ICO.info, go: () => openEditor(l, 'info')},
  ].filter(Boolean));
}
document.addEventListener('click', e => {
  if (!e.target.closest('#lmenu') && !e.target.closest('.dots') && !e.target.closest('#pane-act')) closeMenu();
  if (!e.target.closest('.search') && !e.target.closest('#q-btn')) { $('#qres').hidden = true; }
});

// ---------------------------------------------------------------- מקרא
function renderLegend() {
  const on = LAYERS.filter(l => l.on);
  if (!on.length) { $('#legend').innerHTML = '<div class="note">אין שכבות פעילות. מסמנים שכבה בכלי "שכבות".</div>'; return; }
  $('#legend').innerHTML = on.map(l => {
    const gt = l.items ? (l.items.every(isPt) ? 'pt' : l.items.some(it => it.f && /Polygon/.test(it.f.geometry.type)) ? 'fl' : 'ln') : l.geom === 'Point' ? 'pt' : l.geom === 'LineString' ? 'ln' : 'fl';
    let lg = l.legend ? l.legend() : {type: gt, items: [{c: l.sw, t: l.title}], note: l.src ? `מקור: <a href="${esc(l.src)}" target="_blank" rel="noopener">data.gov.il</a>${l.modified ? ' · עודכן ' + esc(l.modified.slice(0, 10)) : ''}` : ''};
    if (l.sym && l.sym.mode === 'single') lg = {type: gt, items: [{c: l.sym.color, t: l.title}], note: 'סימבולוגיה שנקבעה בתצוגה הזו'};
    if (l.sym && l.sym.mode === 'class' && l.sym.br) lg = {type: gt, items: classLabels(l).map((t, k) => ({c: CLASS_RAMP[k], t})).concat([{c: NOVAL, t: 'אין ערך'}]), note: `לפי "${esc(fname(l, l.sym.field))}" — 5 מחלקות (חמישונים)`};
    const cls = lg.type === 'pt' ? 'pt' : lg.type === 'ln' ? 'ln' : 'fl';
    return `<div class="lg"><h4>${l.icon && ICONS[l.icon] ? iconSvg(l.icon, null, 18) + ' ' : ''}${esc(l.title)}${l.filt ? ' <small class="mut">(מסונן)</small>' : ''}</h4>${lg.items.map(i => `<div class="li"><span class="${cls}" style="background:${i.c}"></span>${esc(i.t)}</div>`).join('')}${lg.note ? `<p>${lg.note}</p>` : ''}</div>`;
  }).join('');
}

// ---------------------------------------------------------------- זיהוי (לחיצה על המפה)
// בודקים בעצמנו מה נמצא מתחת ללחיצה בכל השכבות הגלויות — כך אפשר לדפדף בין כמה ישויות באותה נקודה
function hitTest(latlng, tolPx) {
  const tol = tolPx || 6, P = map.latLngToContainerPoint(latlng), out = [];
  const pad = L.latLngBounds(map.containerPointToLatLng(P.subtract([tol + 16, tol + 16])), map.containerPointToLatLng(P.add([tol + 16, tol + 16])));
  const on = LAYERS.filter(l => l.on && l.lg && l.kind !== 'custom').reverse();
  for (const l of on) {
    for (let i = 0; i < l.items.length; i++) {
      const it = l.items[i]; if (!passes(l, it)) continue;
      if (it.ll) {
        const ll = it.dll || it.ll;
        if (!pad.contains(ll)) continue;
        const d = P.distanceTo(map.latLngToContainerPoint(ll)), r = useMarker(l) ? 10 : ptStyle(l, it).radius;
        if (d <= r + tol - 2) out.push({l, i, pri: 0, d});
        continue;
      }
      if (!bbOf(it).intersects(pad)) continue;
      const h = geomHit(it.f.geometry, P, tol, latlng);
      if (h) out.push({l, i, pri: h.pri, d: h.d});
    }
  }
  return out.sort((a, b) => a.pri - b.pri || a.d - b.d).slice(0, 60);
}
function geomHit(g, P, tol, latlng) {
  const pt = c => map.latLngToContainerPoint([c[1], c[0]]);
  const line = cs => { let best = Infinity; for (let k = 1; k < cs.length; k++) best = Math.min(best, L.LineUtil.pointToSegmentDistance(P, pt(cs[k - 1]), pt(cs[k]))); return best; };
  switch (g.type) {
    case 'Point': { const d = P.distanceTo(pt(g.coordinates)); return d <= tol + 3 ? {pri: 0, d} : null; }
    case 'MultiPoint': { const d = Math.min(...g.coordinates.map(c => P.distanceTo(pt(c)))); return d <= tol + 3 ? {pri: 0, d} : null; }
    case 'LineString': { const d = line(g.coordinates); return d <= tol ? {pri: 1, d} : null; }
    case 'MultiLineString': { const d = Math.min(...g.coordinates.map(line)); return d <= tol ? {pri: 1, d} : null; }
    case 'Polygon': case 'MultiPolygon': return pip([latlng.lat, latlng.lng], g) ? {pri: 2, d: 0} : null;
    case 'GeometryCollection': { for (const x of g.geometries) { const h = geomHit(x, P, tol, latlng); if (h) return h; } return null; }
  }
  return null;
}
let hiLayer = null, IDN = null;
function titleOf(l, p) { return p.name || p.stop || (l.id === 'fleet' && p.city) || (p.line ? 'קו ' + p.line : '') || l.title; }
function fmtVal(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? num(v) : fmt1(v);
  if (typeof v === 'object') return esc(JSON.stringify(v));
  const s = String(v);
  return /^https?:\/\//.test(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener">קישור</a>` : esc(s);
}
function renderIdent() {
  const box = $('#ident');
  if (IDN) { IDN.hits = IDN.hits.filter(h => h.l.items && h.l.items[h.i]); if (IDN.k >= IDN.hits.length) IDN.k = Math.max(0, IDN.hits.length - 1); }
  if (!IDN || !IDN.hits.length) { box.hidden = true; return; }
  const {l, i} = IDN.hits[IDN.k], it = l.items[i], p = it.p, lab = l.labels || {}, N = IDN.hits.length;
  const code = p.code && l.kind === 'points' && l.id !== 'skip' ? `${l.id === 'rail' ? 'תחנה' : 'תחנה'} ${p.code} · ` : '';
  const rows = (l.fields || Object.keys(p)).filter(f => lab[f] !== null && f in p && !(l.id === 'kavbug' && p[f] == null)).map(f => typeof p[f] === 'string' && p[f].length > 60 && !/^https?:/.test(p[f]) ? `<tr><td colspan="2" class="long"><span>${esc(lab[f] || f)}</span>${fmtVal(p[f])}</td></tr>` : `<tr><td>${esc(lab[f] || f)}</td><td>${fmtVal(p[f])}</td></tr>`).join('');
  const lk = l.link && l.link(p);
  box.innerHTML = `<div class="t"><b title="${esc(titleOf(l, p))}">${esc(code + titleOf(l, p))}</b><button class="x" data-a="x" title="סגירה" aria-label="סגירה">${ICO.x}</button></div>
    <div class="ly"><span class="sw" style="background:${swatchOf(l)}"></span>${esc(l.title)}</div>
    <div class="bd"><table>${rows}</table>${l.extra ? l.extra(p, it) : ''}${l.after ? '<div class="xl note">טוען…</div>' : ''}</div>
    <div class="f"><span class="pg"><button data-a="prev"${IDN.k === 0 ? ' disabled' : ''} aria-label="הישות הקודמת">‹</button>${num(IDN.k + 1)} מתוך ${num(N)}<button data-a="next"${IDN.k >= N - 1 ? ' disabled' : ''} aria-label="הישות הבאה">›</button></span>
    <span><button class="linkbtn" data-a="zoom">זום</button> · <button class="linkbtn" data-a="sel">בחירה</button>${STOPLIKE.includes(l.id) && p.code ? ' · <button class="linkbtn" data-a="sv">ניתוח תחנה</button>' : ''}${l.id === 'alllines' ? ' · <button class="linkbtn" data-a="lv">ניתוח קו</button>' : ''}${lk ? ` · <a href="${esc(lk[0])}" target="_blank" rel="noopener">${esc(lk[1])} ↗</a>` : ''}</span></div>`;
  box.hidden = false;
  clearXtra();
  flash(it);
  if (l.after) { const xl = $('.xl', box), k = IDN.k; l.after(p, xl, it).catch(e => { console.warn(e); return 'err'; }).then(r => { if (r === 'err' && IDN && IDN.k === k && xl.isConnected) xl.textContent = 'הפרטים לא זמינים כרגע'; }); }
}
$('#ident').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b || !IDN) return;
  const a = b.dataset.a, h = IDN.hits[IDN.k];
  if (a === 'x') closeIdent();
  else if (a === 'prev' && IDN.k > 0) { IDN.k--; renderIdent(); }
  else if (a === 'next' && IDN.k < IDN.hits.length - 1) { IDN.k++; renderIdent(); }
  else if (a === 'zoom') zoomItem(h.l, h.i, true);
  else if (a === 'sel') setSel([h], e.shiftKey || e.ctrlKey ? 'add' : 'new');
  else if (a === 'sv') { const it = h.l.items[h.i]; openStopView(String(h.l.items[h.i].p.code), it.p.name, it.ll); }
  else if (a === 'lv') openLineView(h.l.items[h.i].p.rd);
});
function closeIdent() { IDN = null; $('#ident').hidden = true; clearXtra(); if (hiLayer) { map.removeLayer(hiLayer); hiLayer = null; } }
// שכבת עזר לזיהוי (למשל הרחובות של "התחנה הבאה") — מתנקה בכל מעבר ישות
const xtraG = L.layerGroup().addTo(map);
function kavbugDraw(p, it) {
  const seg = it.f && it.f.geometry.type === 'LineString' ? it.f.geometry.coordinates.map(([x, y]) => [y, x]) : null, B = [];
  const add = (pts, o, tip) => { const pl = L.polyline(pts, Object.assign({interactive: true, lineCap: 'round', lineJoin: 'round'}, o)).bindTooltip(tip, {sticky: true}); xtraG.addLayer(pl); B.push(...pts); };
  if (p.refg) add(p.refg, {color: '#0d9488', weight: 4, opacity: 0.85}, `מסלול קו הייחוס ${p.ref || ''}`);
  if (seg && seg.length > 1) { add(seg, {color: '#fff', weight: 11, opacity: 0.8}, ''); add(seg, {color: '#ea580c', weight: 6, opacity: 1}, `המסלול הנוכחי · ${p.curKm != null ? fmt1(p.curKm) + ' ק"מ' : ''}`); }
  if (p.opt) add(p.opt, {color: '#16a34a', weight: 5, opacity: 0.95, dashArray: '2 9'}, `המסלול המוצע / הקצר · ${p.optKm != null ? fmt1(+p.optKm) + ' ק"מ' : ''}`);
  if (seg && seg.length > 1) [[seg[0], p.from], [seg[seg.length - 1], p.to]].forEach(([pt, nm]) => { if (!nm) return;
    xtraG.addLayer(L.circleMarker(pt, {radius: 5.5, color: '#0f172a', fillColor: '#fff', fillOpacity: 1, weight: 2.5}).bindTooltip(esc(nm), {permanent: true, direction: 'top', className: 'stoptip'})); });
  if (hiLayer) { map.removeLayer(hiLayer); hiLayer = null; }   // בלי הדגשת הבחירה מעל הכתום
  if (B.length) { const I = $('#ident'), mob = isMobile(); map.fitBounds(L.latLngBounds(B), {paddingTopLeft: [50, 50], paddingBottomRight: [50 + (!mob && !I.hidden ? I.offsetWidth + 52 : 0), 50 + (mob && !I.hidden ? I.offsetHeight : 0)], maxZoom: 16}); }
}
function clearXtra() { xtraG.clearLayers(); }
function identify(l, idx) { IDN = {hits: [{l, i: idx}], k: 0}; renderIdent(); }
function flash(it) {
  if (hiLayer) map.removeLayer(hiLayer);
  const st = {color: '#06b6d4', weight: 3, fill: false, interactive: false, renderer: canvasSel};
  hiLayer = it.ll ? L.circleMarker(it.ll, Object.assign({radius: 12}, st)) :
    L.geoJSON(it.f, {style: Object.assign({}, st, {weight: 5}), interactive: false, renderer: canvasSel, pointToLayer: (f, ll) => L.circleMarker(ll, Object.assign({radius: 12}, st))});
  hiLayer.addTo(map);
}
function zoomItem(l, idx, keep) {
  const it = l.items[idx];
  const go = () => {
    if (it.ll) map.setView(it.ll, Math.max(map.getZoom(), 16));
    else { const b = bbOf(it); if (b.isValid()) map.fitBounds(b, {padding: [30, 30], maxZoom: 17}); }
    if (keep) flash(it); else setTimeout(() => identify(l, idx), 250);
  };
  if (!l.on) setVisible(l, true).then(go); else go();
}

// ---------------------------------------------------------------- בחירה (תכלת) — משותפת למפה ולטבלה
const SEL = {};
const selG = L.layerGroup().addTo(map);
const selCount = () => Object.values(SEL).reduce((n, s) => n + s.size, 0);
function setSel(list, mode) {
  if (mode === 'new') Object.keys(SEL).forEach(k => delete SEL[k]);
  list.forEach(({l, i}) => { const s = SEL[l.id] || (SEL[l.id] = new Set()); if (mode === 'toggle' && s.has(i)) s.delete(i); else s.add(i); });
  Object.keys(SEL).forEach(k => { if (!SEL[k].size) delete SEL[k]; });
  drawSel(); selChanged();
}
function drawSel() {
  selG.clearLayers(); let n = 0;
  const st = {color: '#06b6d4', weight: 3, opacity: 1, fillColor: '#22d3ee', fillOpacity: 0.3, interactive: false, renderer: canvasSel};
  for (const id in SEL) {
    const l = byId[id];
    for (const i of SEL[id]) {
      if (++n > 4000) return;
      const it = l.items[i];
      if (it.ll) selG.addLayer(L.circleMarker(it.ll, Object.assign({}, st, {radius: ptStyle(l, it).radius + 3})));
      else selG.addLayer(L.geoJSON(it.f, {style: Object.assign({}, st, {weight: 4}), interactive: false, renderer: canvasSel, pointToLayer: (f, ll) => L.circleMarker(ll, Object.assign({}, st, {radius: 7}))}));
    }
  }
}
function selChanged() {
  $('#s-sel').textContent = num(selCount());
  if (!$('#table').hidden) renderTable();
  if (PANE === 'select') renderSelPane();
}
function selBounds(ids) {
  let b = null;
  (ids || Object.keys(SEL)).forEach(id => (SEL[id] || []).forEach(i => { const bb = bbOf(byId[id].items[i]); b = b ? b.extend(bb) : L.latLngBounds(bb.getSouthWest(), bb.getNorthEast()); }));
  return b;
}
function zoomSel(ids) { const b = selBounds(ids); if (b && b.isValid()) map.fitBounds(b, {padding: [30, 30], maxZoom: 17}); }
function selectInBounds(B) {
  const out = [];
  LAYERS.filter(l => l.on && l.lg && l.kind !== 'custom').forEach(l => l.items.forEach((it, i) => {
    if (!passes(l, it)) return;
    if (it.ll) { if (B.contains(it.ll)) out.push({l, i}); return; }
    if (!bbOf(it).intersects(B)) return;
    let hit = false; eachCoord(it.f.geometry, (x, y) => { if (!hit && B.contains([y, x])) hit = true; });
    if (hit || (/Polygon/.test(it.f.geometry.type) && pip([B.getCenter().lat, B.getCenter().lng], it.f.geometry))) out.push({l, i});
  }));
  return out;
}

// ---------------------------------------------------------------- טבלת מאפיינים מעוגנת (לשונית לכל שכבה)
let TABS = [], tLayer = null, tSort = {k: null, dir: 1}, tRows = [];
function openTable(l) {
  showTable(true);
  fetchData(l).then(() => {
    if (!TABS.includes(l.id)) TABS.push(l.id);
    if (tLayer !== l) { tLayer = l; tSort = {k: null, dir: 1}; $('#t-q').value = ''; }
    renderTabs(); renderTable(); markActive();
  }).catch(() => { $('#t-grid').innerHTML = `<tr><td>${LATER}</td></tr>`; });
}
function markActive() { $$('.lyr').forEach(r => r.classList.toggle('active', !!tLayer && !$('#table').hidden && r.dataset.id === tLayer.id)); }
function renderTabs() {
  $('#t-tabs').innerHTML = TABS.map(id => { const l = byId[id]; return `<div class="tab${l === tLayer ? ' on' : ''}" data-id="${esc(id)}" role="tab" aria-selected="${l === tLayer}"><span>${esc(l.title)}</span><button class="x" data-close="1" title="סגירת הלשונית" aria-label="סגירת הלשונית">${ICO.x}</button></div>`; }).join('');
}
$('#t-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.tab'); if (!tab) return; const l = byId[tab.dataset.id];
  if (e.target.closest('[data-close]')) {
    TABS = TABS.filter(x => x !== l.id);
    if (tLayer === l) tLayer = TABS.length ? byId[TABS[TABS.length - 1]] : null;
    if (!TABS.length) { showTable(false); return; }
    tSort = {k: null, dir: 1}; renderTabs(); renderTable(); markActive(); return;
  }
  if (tLayer !== l) { tLayer = l; tSort = {k: null, dir: 1}; $('#t-q').value = ''; renderTabs(); renderTable(); markActive(); }
});
function renderTable() {
  const l = tLayer;
  renderTact();
  if (!l || !l.items) { $('#t-grid').innerHTML = '<tr><td class="mut">פותחים טבלה מתפריט ⋯ של שכבה או מהכלי "טבלאות"</td></tr>'; $('#t-count').textContent = ''; return; }
  const q = $('#t-q').value.trim().toLowerCase(), inView = $('#t-view').checked, selOnly = $('#t-selonly').checked, B = map.getBounds();
  const fields = l.fields || [], S = SEL[l.id] || new Set();
  tRows = [];
  l.items.forEach((it, i) => {
    if (!passes(l, it)) return;
    if (selOnly && !S.has(i)) return;
    if (q && !fields.some(f => String(it.p[f] == null ? '' : it.p[f]).toLowerCase().includes(q))) return;
    if (inView && !B.contains(ctrOf(it))) return;
    tRows.push(i);
  });
  if (tSort.k) {
    const k = tSort.k, d = tSort.dir;
    tRows.sort((a, b) => { const x = l.items[a].p[k], y = l.items[b].p[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'he')) * d; });
  }
  const MAX = 500, lab = l.labels || {};
  $('#t-count').textContent = `${num(tRows.length)} מתוך ${num(l.items.length)}` + (l.filt ? ' (מסנן שכבה פעיל)' : '') + (tRows.length > MAX ? ` · מוצגות ${MAX} הראשונות` : '');
  $('#t-grid').innerHTML = `<thead><tr>${fields.map(f => `<th data-k="${esc(f)}" aria-sort="${tSort.k === f ? (tSort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(lab[f] || f)}${tSort.k === f ? (tSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>` +
    tRows.slice(0, MAX).map(i => `<tr data-i="${i}"${S.has(i) ? ' class="s"' : ''}>${fields.map(f => { const v = l.items[i].p[f]; return typeof v === 'number' ? `<td class="n">${fmtVal(v)}</td>` : `<td title="${esc(v)}">${esc(v == null ? '' : v)}</td>`; }).join('')}</tr>`).join('') + '</tbody>';
}
function renderTact() {
  const l = tLayer, n = l && SEL[l.id] ? SEL[l.id].size : 0;
  $('#t-act').innerHTML = l ? `<b>${num(n)}</b> נבחרו · <button class="linkbtn" data-a="zsel"${n ? '' : ' disabled'}>זום לבחירה</button> · <button class="linkbtn" data-a="csel"${n ? '' : ' disabled'}>ניקוי בחירה</button> · <button class="linkbtn" data-a="csv">CSV</button>` : '';
}
$('#t-act').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b || !tLayer) return;
  if (b.dataset.a === 'zsel') zoomSel([tLayer.id]);
  else if (b.dataset.a === 'csel') { delete SEL[tLayer.id]; drawSel(); selChanged(); }
  else if (b.dataset.a === 'csv') csvOut(tLayer);
});
$('#t-grid').addEventListener('click', e => {
  const th = e.target.closest('th'); if (th) { const k = th.dataset.k; tSort = {k, dir: tSort.k === k ? -tSort.dir : 1}; renderTable(); return; }
  const tr = e.target.closest('tbody tr'); if (!tr || tr.dataset.i == null) return;
  const i = +tr.dataset.i, it = tLayer.items[i];
  setSel([{l: tLayer, i}], e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'add' : 'new');
  if (!tLayer.on) setVisible(tLayer, true);
  if (!map.getBounds().contains(ctrOf(it))) map.panTo(ctrOf(it));
});
$('#t-grid').addEventListener('dblclick', e => {
  const tr = e.target.closest('tbody tr'); if (!tr || tr.dataset.i == null) return;
  zoomItem(tLayer, +tr.dataset.i); if (isMobile()) showTable(false);
});
let tqT = null; $('#t-q').oninput = () => { clearTimeout(tqT); tqT = setTimeout(renderTable, 200); };
$('#t-view').onchange = renderTable; $('#t-selonly').onchange = renderTable;
map.on('moveend', () => { if ($('#t-view').checked && !$('#table').hidden) renderTable(); });
function csvOut(l) {
  const fields = l.fields, lab = l.labels || {}, S = SEL[l.id];
  const rows = S && S.size ? [...S] : tRows;
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '﻿' + [fields.map(f => q(lab[f] || f)).concat(l.items[0] && l.items[0].ll ? ['lat', 'lon'] : []).join(',')].concat(
    rows.map(i => { const it = l.items[i]; return fields.map(f => q(it.p[f])).concat(it.ll ? it.ll : []).join(','); })).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = l.id.replace(/[^\w-]/g, '_') + (S && S.size ? '-selected' : '') + '.csv'; a.click();
}
function showTable(on) {
  $('#table').hidden = !on; $('#mapwrap').classList.toggle('tbl', on);
  if (on && isMobile()) { closePane(); closeIdent(); }
  markActive();
  setTimeout(() => map.invalidateSize(), 30);
}
$('#t-close').onclick = () => showTable(false);
// שינוי גובה הטבלה בגרירת הקצה העליון, ושינוי רוחב הלוח בגרירת הקצה שלו
function dragger(handle, onMove, onEnd) {
  handle.addEventListener('pointerdown', e => {
    e.preventDefault(); handle.setPointerCapture(e.pointerId); handle.classList.add('drag');
    const s = {x: e.clientX, y: e.clientY};
    const mv = ev => { onMove(ev, s); map.invalidateSize({pan: false}); };
    const up = () => { handle.classList.remove('drag'); handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); onEnd(); map.invalidateSize(); };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up);
  });
}
const root = document.documentElement;
let tblH = +lsGet('gis.tblh', 220) || 220, paneW = +lsGet('gis.panew', 300) || 300;
root.style.setProperty('--tbl-h', tblH + 'px'); root.style.setProperty('--pane-w', paneW + 'px');
dragger($('#t-rz'), (e, s) => {
  if (s.h == null) s.h = tblH;
  tblH = Math.max(90, Math.min($('#mapwrap').clientHeight - 60, s.h + (s.y - e.clientY)));
  root.style.setProperty('--tbl-h', tblH + 'px');
}, () => lsSet('gis.tblh', tblH));
dragger($('#pane-rz'), (e, s) => {
  if (s.w == null) s.w = paneW;
  paneW = Math.max(220, Math.min(innerWidth * 0.6, s.w + (s.x - e.clientX)));
  root.style.setProperty('--pane-w', paneW + 'px');
}, () => lsSet('gis.panew', paneW));

// ---------------------------------------------------------------- סרגל הכלים והלוח המעוגן
const PANES = {layers: 'שכבות', legend: 'מקרא', base: 'מפת רקע', tables: 'טבלאות מאפיינים', measure: 'מדידה', select: 'בחירה', analysis: 'ניתוח', bookmarks: 'סימניות', print: 'הדפסה וייצוא'};
let PANE = null;
function openPane(t) {
  PANE = t;
  $('#main').classList.remove('nopane');
  $$('#pane [data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; });
  $('#pane-title').textContent = PANES[t];
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('#pane-act').innerHTML = t === 'layers' ? '<button class="dots" id="tree-menu" title="פעולות על כל השכבות" aria-label="פעולות על כל השכבות">⋯</button>' : '';
  if (isMobile()) { $('#pane').style.height = t === 'measure' || t === 'select' ? '34vh' : ''; closeIdent(); if (t !== 'tables') showTable(false); }
  setMode(t === 'measure' || t === 'select' ? t : null);
  renderPane(t);
  setTimeout(() => map.invalidateSize(), 30);
}
function closePane() {
  PANE = null; $('#main').classList.add('nopane');
  $$('.tool').forEach(b => b.classList.remove('on'));
  setMode(null);
  setTimeout(() => map.invalidateSize(), 30);
}
function renderPane(t) {
  if (t === 'legend') renderLegend();
  else if (t === 'base') renderBases();
  else if (t === 'tables') renderTablesPane();
  else if (t === 'measure') renderMeasure();
  else if (t === 'select') renderSelPane();
  else if (t === 'analysis') renderAnalysis();
  else if (t === 'bookmarks') renderBookmarks();
  else if (t === 'print') renderPrint();
}
$('#toolbar').addEventListener('click', e => { const b = e.target.closest('.tool'); if (!b) return; if (PANE === b.dataset.tool) closePane(); else openPane(b.dataset.tool); });
$('#pane-close').onclick = closePane;
$('#pane-act').addEventListener('click', e => {
  const b = e.target.closest('#tree-menu'); if (!b) return;
  openMenu(b, [
    {t: 'כיווץ כל הקבוצות', go: () => $$('#tree .grp').forEach(g => g.classList.add('closed'))},
    {t: 'הרחבת כל הקבוצות', go: () => $$('#tree .grp').forEach(g => g.classList.remove('closed'))},
    '-',
    {t: 'הסתרת כל השכבות', go: () => LAYERS.filter(l => l.on).forEach(l => setVisible(l, false))},
  ]);
});

// רקע
function renderBases() {
  $('#bases').innerHTML = Object.entries(BASES).map(([k, b]) => `<div class="opt${k === baseKey ? ' on' : ''}" data-k="${k}" role="radio" aria-checked="${k === baseKey}" tabindex="0"><span class="th" style="background:${b.th}"></span><span class="grow">${esc(b.t)}<br><small>${esc(b.s)}</small></span></div>`).join('') +
    '<div class="note">מפת ההתמצאות בפינה משתמשת באותו רקע. בערכה הכהה האריחים מוחשכים מעט.</div>';
}
$('#bases').addEventListener('click', e => { const o = e.target.closest('.opt'); if (o) setBase(o.dataset.k); });

// טבלאות
function renderTablesPane() {
  const ls = LAYERS.filter(l => l.kind !== 'custom' && (l.on || l.items));
  $('#tables').innerHTML = (ls.length ? ls.map(l => `<div class="opt" data-id="${esc(l.id)}"><span class="lyr" style="display:contents"><span class="sw" style="background:${swatchOf(l)};width:12px;height:12px;border-radius:2px"></span></span><span class="grow">${esc(l.title)}<br><small>${l.items ? num(l.items.length) + ' ישויות' : 'טוען…'}${SEL[l.id] ? ` · ${num(SEL[l.id].size)} נבחרו` : ''}</small></span><button class="btn">פתיחה</button></div>`).join('') :
    '<div class="note">אין שכבות פעילות. מסמנים שכבה בכלי "שכבות" ואז פותחים את הטבלה שלה.</div>') +
    '<div class="note">הטבלה נפתחת בתחתית המפה, לשונית לכל שכבה. לחיצה על שורה בוחרת את הישות (Ctrl — הוספה/הסרה), לחיצה כפולה מתקרבת אליה. גוררים את הקצה העליון כדי לשנות גובה.</div>';
}
$('#tables').addEventListener('click', e => { const o = e.target.closest('.opt'); if (o) openTable(byId[o.dataset.id]); });

// ---------------------------------------------------------------- מצבי עבודה: מדידה ובחירה
let MODE = null, SELMODE = 'click';
function setMode(m) {
  if (MODE === 'measure' && m !== 'measure') measureEnd();
  MODE = m;
  const mc = map.getContainer();
  mc.style.cursor = m ? 'crosshair' : '';
  if (m === 'measure') { map.doubleClickZoom.disable(); closeIdent(); measureStart(); } else map.doubleClickZoom.enable();
  if (m === 'select' && SELMODE === 'rect') map.dragging.disable(); else map.dragging.enable();
  renderModebar();
}
function renderModebar() {
  const mb = $('#modebar');
  if (MODE === 'measure') mb.innerHTML = `<b>${measureText()}</b><span>לחיצה מוסיפה נקודה · לחיצה כפולה מסיימת</span><button data-a="clr">ניקוי</button><button data-a="end">סיום</button>`;
  else if (MODE === 'select') mb.innerHTML = `<span>בחירה ב${SELMODE === 'rect' ? 'מלבן — גוררים על המפה' : 'לחיצה על ישות'} · Shift מוסיף</span><b>${num(selCount())}</b><button data-a="sclr">ניקוי</button><button data-a="end">סיום</button>`;
  mb.hidden = !MODE;
}
$('#modebar').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  if (b.dataset.a === 'end') closePane();
  else if (b.dataset.a === 'clr') measureClear();
  else if (b.dataset.a === 'sclr') setSel([], 'new');
});

// מדידת מרחק ושטח (שטח גאודזי על הכדור, כמו ב-Leaflet.draw)
let MK = 'dist', mPts = [], mLine = null, mMarks = null, mDone = false;
function measureStart() { if (!mMarks) { mMarks = L.layerGroup().addTo(map); } measureDraw(); }
function measureEnd() { mDone = true; }
function measureClear() { mPts = []; mDone = false; if (mMarks) mMarks.clearLayers(); if (mLine) { map.removeLayer(mLine); mLine = null; } measureDraw(); }
function geoArea(pts) {
  const d2r = Math.PI / 180; let a = 0;
  for (let i = 0; i < pts.length; i++) { const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; a += (p2.lng - p1.lng) * d2r * (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r)); }
  return Math.abs(a * 6378137 * 6378137 / 2);
}
function measureText() {
  if (MK === 'area') {
    if (mPts.length < 3) return 'שטח: —';
    const a = geoArea(mPts);
    return a >= 1e6 ? (a / 1e6).toLocaleString('he-IL', {maximumFractionDigits: 3}) + ' קמ"ר' : a >= 1e4 ? (a / 1e4).toLocaleString('he-IL', {maximumFractionDigits: 2}) + ' הקטאר' : Math.round(a).toLocaleString('he-IL') + ' מ"ר';
  }
  let d = 0; for (let i = 1; i < mPts.length; i++) d += map.distance(mPts[i - 1], mPts[i]);
  return d >= 1000 ? (d / 1000).toLocaleString('he-IL', {maximumFractionDigits: 2}) + ' ק"מ' : Math.round(d) + ' מ׳';
}
function measureDraw() {
  if (mLine) map.removeLayer(mLine);
  const st = {color: '#f59e0b', weight: 3, dashArray: '6 6', interactive: false, fillColor: '#f59e0b', fillOpacity: 0.15};
  mLine = (MK === 'area' && mPts.length > 2 ? L.polygon(mPts, st) : L.polyline(mPts, st)).addTo(map);
  if (MODE === 'measure') renderModebar();
  if (PANE === 'measure') renderMeasure();
}
function renderMeasure() {
  $('#measure').innerHTML = `<div class="sec"><div class="seg" role="group" aria-label="סוג מדידה"><button data-mk="dist" class="${MK === 'dist' ? 'on' : ''}">מרחק</button><button data-mk="area" class="${MK === 'area' ? 'on' : ''}">שטח</button></div>
    <div class="big">${measureText()}</div><div class="mut">${num(mPts.length)} נקודות${mDone ? ' · המדידה הסתיימה — לחיצה על המפה מתחילה חדשה' : ''}</div>
    <div class="row" style="margin-top:8px;display:flex;gap:6px"><button class="btn" data-a="clr">ניקוי</button></div></div>
    <div class="note">לחיצה על המפה מוסיפה נקודה, לחיצה כפולה מסיימת. המרחק — על פני כדור הארץ; השטח — שטח גאודזי של המצולע.</div>`;
}
$('#measure').addEventListener('click', e => {
  const k = e.target.closest('[data-mk]'); if (k) { MK = k.dataset.mk; measureDraw(); return; }
  if (e.target.closest('[data-a=clr]')) measureClear();
});
function measureClick(ll) {
  if (mDone) measureClear();
  mPts.push(ll);
  L.circleMarker(ll, {radius: 4, color: '#f59e0b', fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false}).addTo(mMarks);
  measureDraw();
}
map.on('dblclick', () => { if (MODE === 'measure') { mDone = true; measureDraw(); } });

// בחירה
function renderSelPane() {
  const ids = Object.keys(SEL);
  $('#selpane').innerHTML = `<div class="sec"><h5>שיטת בחירה</h5><div class="seg" role="group" aria-label="שיטת בחירה"><button data-sm="click" class="${SELMODE === 'click' ? 'on' : ''}">לחיצה</button><button data-sm="rect" class="${SELMODE === 'rect' ? 'on' : ''}">מלבן</button></div>
    <p class="mut">הבחירה חלה על השכבות הגלויות. Shift (או Ctrl) — הוספה לבחירה הקיימת.</p></div>
    <div class="sec"><h5>נבחרו ${num(selCount())}</h5>${ids.length ? ids.map(id => `<div class="opt" data-id="${esc(id)}"><span class="grow">${esc(byId[id].title)} <small>${num(SEL[id].size)}</small></span><button class="btn" data-a="t">טבלה</button><button class="btn" data-a="z">זום</button></div>`).join('') + '<div style="margin-top:6px;display:flex;gap:6px"><button class="btn" data-a="zall">זום לכל הבחירה</button><button class="btn" data-a="clr">ניקוי</button></div>' : '<p class="mut">אין בחירה.</p>'}</div>`;
}
$('#selpane').addEventListener('click', e => {
  const sm = e.target.closest('[data-sm]'); if (sm) { SELMODE = sm.dataset.sm; setMode('select'); renderSelPane(); return; }
  const b = e.target.closest('[data-a]'); if (!b) return; const o = b.closest('.opt');
  if (b.dataset.a === 't') openTable(byId[o.dataset.id]);
  else if (b.dataset.a === 'z') zoomSel([o.dataset.id]);
  else if (b.dataset.a === 'zall') zoomSel();
  else if (b.dataset.a === 'clr') setSel([], 'new');
});
// בחירה במלבן: גרירה על המפה (עכבר או מגע)
let rsStart = null, rsRect = null, rsJust = false;
const mc = map.getContainer();
mc.addEventListener('pointerdown', e => {
  if (MODE !== 'select' || SELMODE !== 'rect' || e.button !== 0 || e.target.closest('.leaflet-control')) return;
  rsStart = {ll: map.mouseEventToLatLng(e), x: e.clientX, y: e.clientY, add: e.shiftKey || e.ctrlKey};
  rsRect = L.rectangle([rsStart.ll, rsStart.ll], {color: '#06b6d4', weight: 1.5, dashArray: '4 3', fillOpacity: 0.08, interactive: false}).addTo(map);
  mc.setPointerCapture(e.pointerId);
});
mc.addEventListener('pointermove', e => { if (rsStart && rsRect) rsRect.setBounds(L.latLngBounds(rsStart.ll, map.mouseEventToLatLng(e))); });
mc.addEventListener('pointerup', e => {
  if (!rsStart) return;
  const moved = Math.hypot(e.clientX - rsStart.x, e.clientY - rsStart.y) > 5;
  const B = L.latLngBounds(rsStart.ll, map.mouseEventToLatLng(e)), add = rsStart.add;
  map.removeLayer(rsRect); rsRect = null; rsStart = null;
  if (moved) { rsJust = true; setTimeout(() => { rsJust = false; }, 50); setSel(selectInBounds(B), add ? 'add' : 'new'); renderModebar(); }
});

// לחיצה על המפה: לפי המצב — מדידה, בחירה או זיהוי
map.on('click', e => {
  if (rsJust) return;
  if (MODE === 'measure') { measureClick(e.latlng); return; }
  const add = e.originalEvent && (e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey);
  if (MODE === 'select') {
    const h = hitTest(e.latlng)[0];
    if (h) setSel([h], add ? 'toggle' : 'new'); else if (!add) setSel([], 'new');
    renderModebar(); return;
  }
  const hits = hitTest(e.latlng);
  if (!hits.length) { closeIdent(); return; }
  IDN = {hits, k: 0}; renderIdent();
  const h = hits[0]; if (h.l.onclick) h.l.onclick(h.l.items[h.i].p);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#lmenu').hidden) { closeMenu(); return; }
  $('#qres').hidden = true;
  if (MODE) closePane(); else if (IDN) closeIdent();
});

// ---------------------------------------------------------------- חיפוש
let qT = null, qSel = -1, qItems = [];
function searchAll(q) {
  const out = [];
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
  if (hoods.items) { let n = 0; hoods.items.forEach(it => { if (n < 6 && (String(it.p.name).includes(q) || (String(it.p.city) === q))) { out.push({h: 'שכונות', t: it.p.name, s: it.p.city, go: () => { selectHood(it.p.i, true); }}); n++; } }); }
  if (hoods.items && q.length >= 2) {
    const cs = [...new Set(hoods.items.map(it => it.p.city).filter(c => c && c.includes(q)))].slice(0, 5);
    cs.forEach(c => out.push({h: 'ערים', t: c, s: 'התקרבות · סינון לפי העיר בכלי "שכבות"', go: () => { const b = hoods.items.filter(h => h.p.city === c).reduce((m, h) => m ? m.extend(bbOf(h)) : L.latLngBounds(bbOf(h).getSouthWest(), bbOf(h).getNorthEast()), null); if (b) map.fitBounds(b, {padding: [20, 20]}); }}));
  }
  if (HL && /^\d+[א-ת]?$/.test(q)) {
    const D = dayOf(DATE);
    HL.lines.filter(L0 => String(L0[1]) === q && segAt(L0, D)).slice(0, 8).forEach(L0 => { const [a, b] = destParts(L0[3]); out.push({h: 'ניתוח קו', t: `קו ${q} · ${a} ← ${b}`, s: `${L0[2]} · ${fmtD(DATE)}`, go: () => { LV.q = q; openLineView(L0[0]); }}); });
  }
  const kp = byId.kavpach;
  if (kp.items && isNum) kp.items.forEach((it, i) => { if (String(it.p.line) === q && out.filter(o => o.h === 'קו פח').length < 5) out.push({h: 'קו פח', t: `קו ${q} ${it.p.origin || ''} → ${it.p.dest || ''}`, s: `ציון ${it.p.score}`, go: () => zoomItem(kp, i)}); });
  return out;
}
let lineHi = null;
function showLine(q, hits) {
  if (lineHi) map.removeLayer(lineHi);
  const bus = byId.bus;
  lineHi = L.featureGroup(hits.map(i => L.circleMarker(bus.items[i].ll, {renderer: canvasPts, radius: 5, color: '#fff', weight: 1.5, fillColor: '#db2777', fillOpacity: 1}).on('click', e => { L.DomEvent.stopPropagation(e); identify(bus, i); }))).addTo(map);
  map.fitBounds(lineHi.getBounds(), {padding: [30, 30]});
  msg(`קו ${q}: ${num(hits.length)} תחנות מסומנות בוורוד (כל הקווים בארץ שזה המספר שלהם) · חיפוש ריק מנקה`);
}
function renderQ(items) {
  qItems = items; qSel = -1;
  let last = '';
  const box = $('#qres');
  box.innerHTML = items.map((it, i) => { const h = it.h !== last ? `<div class="qh">${esc(it.h)}</div>` : ''; last = it.h; return h + `<div data-i="${i}" role="option">${esc(it.t)}<small>${esc(it.s || '')}</small></div>`; }).join('');
  box.hidden = !box.innerHTML;
}
function doSearch() {
  const q = $('#q').value.trim();
  if (lineHi && !q) { map.removeLayer(lineHi); lineHi = null; msg(''); }
  if (q.length < 2 && !/^\d+$/.test(q)) { $('#qres').hidden = true; return; }
  Promise.all([ensure('bus').catch(() => null), ensure('hoods').catch(() => null), /^\d+[א-ת]?$/.test(q) ? histLines().catch(() => null) : null]).then(() => {
    renderQ(searchAll(q).concat([{h: 'מקום (OpenStreetMap)', t: `חיפוש "${q}" במפה`, s: 'Nominatim', geo: true, go: () => geocode(q)}]));
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
function pickQ(i) { const it = qItems[i]; if (!it) return; if (!it.geo) { $('#qres').hidden = true; $('#bar').classList.remove('sopen'); } it.go(); }
$('#q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(doSearch, 250); });
$('#q').addEventListener('keydown', e => {
  const opts = $$('#qres [data-i]');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); qSel = Math.max(0, Math.min(opts.length - 1, qSel + (e.key === 'ArrowDown' ? 1 : -1))); opts.forEach((o, i) => o.classList.toggle('sel', i === qSel)); }
  if (e.key === 'Enter') { e.preventDefault(); pickQ(qSel >= 0 ? qSel : 0); }
});
$('#qres').addEventListener('click', e => { const d = e.target.closest('[data-i]'); if (d) pickQ(+d.dataset.i); });
$('#q-btn').onclick = () => { const b = $('#bar'); b.classList.toggle('sopen'); if (b.classList.contains('sopen')) $('#q').focus(); };

// ---------------------------------------------------------------- מדד לכל שכונה (בכלי "ניתוח")
let RADIUS = 250, HOOD = null, LINK = null, ROUTES = null, TTC = {}, KPSET = null, BUSIDX = null;
const RADII = [150, 250, 400, 500, 800];
{ const r = +lsGet('gis.radius', 0); if (RADII.includes(r)) RADIUS = r; }
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
  hoods.forEach(h => {
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
const hoodScoreLoad = () => Promise.all([ensure('bus'), ensure('hoods'), loadLink()]).then(() => { byId.hoodscore.meta = byId.hoods.meta; computeScores(); });
function setRadius(r) {
  RADIUS = r; lsSet('gis.radius', r);
  SC = null;
  if (LINK && byId.bus.items && byId.hoods.items) computeScores();
  if (byId.hoodscore.lg) restyle(byId.hoodscore);
  drawWalk(); if (PANE === 'legend') renderLegend(); renderHood();
}
function renderHoodTop() {
  $('#hoodtop').innerHTML = ['hoodscore', 'walk', 'hoods'].map(id => `<label><input type="checkbox" data-id="${id}"${byId[id].on ? ' checked' : ''}> ${esc(byId[id].title)}</label>`).join('');
}
$('#hoodtop').addEventListener('change', e => { const id = e.target.dataset.id; if (id) setVisible(byId[id], e.target.checked); });

// שכבת טווח ההליכה — עיגולים סביב תחנות בתחום המפה (מזום 13)
function drawWalk() {
  const l = byId.walk;
  if (l.lg) { map.removeLayer(l.lg); l.lg = null; }
  if (!l.on || !byId.bus.items || FUT.hidden) return;
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
    if (openPanel || zoom || !isMobile()) { ANA = 'hood'; if (PANE !== 'analysis') openPane('analysis'); else renderAnalysis(); } else renderHood();
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
  [0, 0.5, 1].forEach(f => { const y = H - B - f * (H - B - 8); s += `<line x1="${L0}" x2="${W}" y1="${y}" y2="${y}" stroke="#cbd5e1" stroke-opacity=".6"/><text x="${L0 - 4}" y="${y + 3}" font-size="9" fill="#64748b" text-anchor="end">${Math.round(mx * f)}</text>`; });
  hours.forEach((v, h) => { const x = W - (h + 1) * bw, bh = v / mx * (H - B - 8); s += `<rect x="${x + 1}" y="${H - B - bh}" width="${bw - 2}" height="${bh}" fill="#0ea5e9"><title>${h}:00 — ${v} נסיעות</title></rect>`; if (h % 3 === 0) s += `<text x="${x + bw / 2}" y="${H - 5}" font-size="9" fill="#64748b" text-anchor="middle">${h}</text>`; });
  return s + '</svg>';
}
function renderHood() {
  const el = $('#hood'); if (!el || PANE !== 'analysis' || ANA !== 'hood') return;
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
      if (HOOD !== h.p.i || PANE !== 'analysis' || ANA !== 'hood') return;
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
      const hb = bbOf(h);
      const inPoly = ll => { try { return hb.contains(ll) && pip(ll, h.f.geometry); } catch (e) { return false; } };
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
      $$('#hood tr[data-c]').forEach(tr => { tr.onclick = () => { const j = busIndex()[tr.dataset.c]; if (j != null) zoomItem(byId.bus, j); }; });
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

// ---------------------------------------------------------------- סימניות: ערים ראשיות (התחום מחושב מגבולות השכונות) ותצוגות שמורות
const CITIES = ['ירושלים', 'תל אביב-יפו', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה', 'באר שבע', 'בני ברק', 'חולון', 'רמת גן', 'רחובות', 'אשקלון', 'בת ים', 'בית שמש', 'כפר סבא', 'הרצליה', 'חדרה', 'מודיעין-מכבים-רעות', 'נצרת', 'לוד', 'רמלה', 'רעננה', 'עפולה', 'אילת'];
let CITYB = null;
function cityBounds() {
  if (CITYB) return CITYB;
  CITYB = {};
  byId.hoods.items.forEach(it => { const c = it.p.city; if (!CITIES.includes(c)) return; const b = bbOf(it); CITYB[c] = CITYB[c] ? CITYB[c].extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast()); });
  return CITYB;
}
const savedViews = () => { try { return JSON.parse(lsGet('gis.views', '[]')) || []; } catch (e) { return []; } };
function renderBookmarks() {
  const el = $('#bookmarks');
  const views = savedViews();
  const mine = `<div class="sec"><h5>התצוגות שלי</h5><div style="display:flex;gap:6px"><input class="fld" id="bm-name" placeholder="שם לתצוגה הנוכחית" style="flex:1" aria-label="שם התצוגה"><button class="btn pri" id="bm-add">שמירה</button></div></div>` +
    (views.length ? views.map((v, i) => `<div class="opt" data-v="${i}"><span class="grow">${esc(v.n)} <small>זום ${v.z}</small></span><button class="x" data-del="${i}" title="מחיקה" aria-label="מחיקת התצוגה">${ICO.x}</button></div>`).join('') : '<div class="note">עוד לא נשמרו תצוגות (נשמרות בדפדפן הזה בלבד).</div>');
  el.innerHTML = `<div class="opt" data-home="1"><span class="grow"><b>כל הארץ</b></span></div><div class="note">טוען את תחומי הערים…</div>` + mine;
  ensure('hoods').then(() => {
    const cb = cityBounds();
    const list = CITIES.filter(c => cb[c]).map(c => `<div class="opt" data-city="${esc(c)}"><span class="grow">${esc(c)}</span></div>`).join('');
    el.innerHTML = `<div class="opt" data-home="1"><span class="grow"><b>כל הארץ</b></span></div>${list}<div class="note">תחום כל עיר — לפי גבולות השכונות שלה (המרכז למיפוי ישראל).</div>` + mine;
  }).catch(() => { el.innerHTML = `<div class="opt" data-home="1"><span class="grow"><b>כל הארץ</b></span></div>` + mine; });
}
$('#bookmarks').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { const v = savedViews(); v.splice(+del.dataset.del, 1); lsSet('gis.views', JSON.stringify(v)); renderBookmarks(); return; }
  if (e.target.id === 'bm-add') {
    const c = map.getCenter(), v = savedViews();
    v.push({n: $('#bm-name').value.trim() || `תצוגה ${v.length + 1}`, z: map.getZoom(), c: [+c.lat.toFixed(5), +c.lng.toFixed(5)]});
    lsSet('gis.views', JSON.stringify(v)); renderBookmarks(); return;
  }
  const o = e.target.closest('.opt'); if (!o) return;
  if (o.dataset.home) map.setView(HOME.c, HOME.z);
  else if (o.dataset.city) map.fitBounds(cityBounds()[o.dataset.city], {padding: [20, 20]});
  else if (o.dataset.v != null) { const v = savedViews()[+o.dataset.v]; if (v) map.setView(v.c, v.z); }
  if (isMobile()) closePane();
});

// ---------------------------------------------------------------- הדפסה וייצוא תמונה
function renderPrint() {
  $('#printpane').innerHTML = `<div class="sec"><h5>כותרת</h5><input class="fld" id="pr-title" value="GIS הקו הבוחן" style="width:100%" aria-label="כותרת לתמונה"></div>
    <div class="sec" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn pri" id="pr-png">ייצוא תמונה (PNG)</button><button class="btn" id="pr-print">הדפסה</button></div>
    <div class="note">התמונה כוללת את המפה כפי שהיא מוצגת עכשיו — רקע, שכבות, בחירה ותוויות — עם כותרת, קנה מידה, חץ צפון ומקורות.</div>`;
}
$('#printpane').addEventListener('click', e => {
  if (e.target.id === 'pr-print') { closePane(); setTimeout(() => window.print(), 200); }
  if (e.target.id === 'pr-png') exportPng(($('#pr-title').value || '').trim());
});
function exportPng(title) {
  const el = map.getContainer(), R = el.getBoundingClientRect(), W = Math.round(R.width), H = Math.round(R.height), top = 40, bot = 28;
  const cv = document.createElement('canvas'), k = 2;
  cv.width = W * k; cv.height = (H + top + bot) * k;
  const g = cv.getContext('2d'); g.scale(k, k);
  g.fillStyle = '#eef1e8'; g.fillRect(0, top, W, H);
  const draw = (img, r) => { try { g.drawImage(img, r.left - R.left, r.top - R.top + top, r.width, r.height); } catch (e) {} };
  $$('.leaflet-tile-pane img.leaflet-tile-loaded', el).forEach(img => draw(img, img.getBoundingClientRect()));
  $$('canvas', el).forEach(c => draw(c, c.getBoundingClientRect()));
  g.save(); g.beginPath(); g.rect(0, top, W, H); g.clip();
  g.font = '700 11px Heebo, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#fff'; g.fillStyle = '#0f172a';
  $$('.lbl span', el).forEach(s => { const r = s.getBoundingClientRect(), x = r.left - R.left + r.width / 2, y = r.top - R.top + top + r.height / 2; g.strokeText(s.textContent, x, y); g.fillText(s.textContent, x, y); });
  g.restore();
  g.fillStyle = '#0f172a'; g.fillRect(0, 0, W, top);
  g.fillStyle = '#fff'; g.font = '800 16px Heebo, Arial'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.fillText(title || 'GIS הקו הבוחן', W - 12, top / 2);
  g.font = '400 11px Heebo, Arial'; g.textAlign = 'left'; g.direction = 'ltr'; g.fillStyle = '#94a3b8';
  g.fillText(new Date().toLocaleDateString('he-IL') + ' · kavbochan.app/gis', 12, top / 2);
  // חץ צפון
  g.fillStyle = '#fff'; g.strokeStyle = '#334155'; g.lineWidth = 1; g.fillRect(W - 40, top + 10, 30, 40); g.strokeRect(W - 40, top + 10, 30, 40);
  g.fillStyle = '#0f172a'; g.beginPath(); g.moveTo(W - 25, top + 14); g.lineTo(W - 19, top + 32); g.lineTo(W - 25, top + 28); g.lineTo(W - 31, top + 32); g.closePath(); g.fill();
  g.font = '700 10px Heebo, Arial'; g.textAlign = 'center'; g.fillText('צ', W - 25, top + 42);
  g.fillStyle = '#f1f5f9'; g.fillRect(0, top + H, W, bot);
  g.fillStyle = '#334155'; g.font = '400 11px Heebo, Arial'; g.textAlign = 'right'; g.direction = 'rtl';
  const on = LAYERS.filter(l => l.on).map(l => l.title).join(' · ');
  g.fillText(`קנה מידה 1:${fmtInt(scaleRatio())} · ${on || 'בלי שכבות'}`, W - 10, top + H + bot / 2);
  g.textAlign = 'left'; g.direction = 'ltr';
  g.fillText((BASES[baseKey].a ? BASES[baseKey].a + ' · ' : '') + 'data.gov.il · GTFS', 10, top + H + bot / 2);
  try {
    cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'gis-kavbochan.png'; a.click(); });
    msg('התמונה נשמרה');
  } catch (e) { msg('לא ניתן לייצא את הרקע הזה לתמונה — אפשר לבחור רקע אחר או "בלי רקע"'); }
}

// ---------------------------------------------------------------- תאריך: שכבות "כל התחנות" ו"קווים" (מנתוני כלי ההיסטוריה)
const EPOCH = Date.UTC(2012, 0, 1);
const dayOf = s => Math.round((Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) - EPOCH) / 864e5);
const isoOf = n => new Date(EPOCH + n * 864e5).toISOString().slice(0, 10);
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtD = d => (d || '').split('-').reverse().join('.');
let DATE = todayIso(), HMETA = null, HL = null, HLP = null;
// "היום" = מתאריך הנתונים של כלי ההיסטוריה והלאה: אז קובע הלו"ז לשבוע הקרוב (stopev "a"), כמו בכלי
const isNowD = iso => !HMETA || iso >= HMETA.gen;
// יש תיעוד: יום הצילום של 2012, או מ-11.09.2015 (צילומים תקופתיים; רציף מ-16.03.2017)
const dateOkD = iso => !HMETA || iso === HMETA.d2012 || (iso >= HMETA.from);
const histRangeTxt = () => HMETA ? `טווח הנתונים: ${fmtD(HMETA.d2012)} (צילום בודד), ומ-${fmtD(HMETA.from)} עד היום; תיעוד רציף מ-${fmtD(HMETA.cont)}.` : '';
function histLines() {
  return HL ? Promise.resolve(HL) : (HLP || (HLP = Promise.all([load('data/hist/lines.json'), load('data/hist/shapeidx.json')]).then(([d, sh]) => {
    HL = {lines: d.lines, shapes: sh, byRd: {}};
    d.lines.forEach((x, k) => { HL.byRd[x[0]] = k; });
    return HL;
  })));
}
const segAt = (L0, D) => L0[5].find(s => s[0] <= D && (s[1] == null || D < s[1]));
const rdActive = (rd, D) => { const k = HL && HL.byRd[rd]; return k != null && !!segAt(HL.lines[k], D); };
function stopActive(p) {
  if (!dateOkD(DATE)) return null;
  if (isNowD(DATE)) return !!p.now;
  const D = dayOf(DATE), v = p.iv || [];
  for (let k = 0; k < v.length; k += 2) if (v[k] <= D && (v[k + 1] == null || D < v[k + 1])) return true;
  return false;
}
function restatus(l) { l.items.forEach(it => { const a = stopActive(it.p); it.p.st = a == null ? 'אין תיעוד' : a ? 'פעילה' : 'לא פעילה'; }); }
function setDate(iso) {
  DATE = iso || todayIso();
  const st = byId.allstops;
  if (st.items) { restatus(st); restyle(st); if (st.filt || AREA.v) { refill(st); } rerow(st); drawLabels(st); if (tLayer === st) renderTable(); }
  resetLines();
  renderLyrTop();
  if (PANE === 'legend') renderLegend();
  if (IDN && ['allstops', 'alllines', 'nextst'].includes(IDN.hits[IDN.k].l.id)) renderIdent();
  if (PANE === 'analysis' && ANA === 'line' && LV.rd) renderLineView();
}

// אותו כלל כמו LinesAtStop ב-line-history/app.jsx: לכל וריאנט — האירוע האחרון עד התאריך; out/mvout = לא עוצר.
// "היום" — רק וריאנטים שיש להם לו"ז לשבוע הקרוב (d.a); בתאריך עבר — רק וריאנטים שהקו עצמו היה בתוקף (אינדקס הקווים).
const STOPEV = {};
function stopev(code) {
  const k = code.length >= 2 ? code.slice(0, 2) : '0x';
  return (STOPEV[k] || (STOPEV[k] = load('../line-history/data/stopev/' + k + '.json'))).then(m => m[code] || {ev: []});
}
function linesAtStop(code, iso) {
  if (iso > todayIso()) return linesAtStop(code, todayIso()).then(base => futureAtStop(code, iso, base));
  if (!dateOkD(iso)) return Promise.resolve([]);
  return Promise.all([stopev(code), histLines()]).then(([d]) => {
    const now = isNowD(iso), D = dayOf(iso), last = {};
    (d.ev || []).forEach(e => { if (e[0] <= iso) last[e[2]] = e; });
    const A = Array.isArray(d.a) ? new Set(d.a) : null, out = [];
    Object.values(last).forEach(e => {
      if (e[3] === 'out' || e[3] === 'mvout' || !e[1]) return;
      if (now ? (A && !A.has(e[2])) : !rdActive(e[2], D)) return;
      const k = HL.byRd[e[2]], L0 = k != null ? HL.lines[k] : null;
      out.push({line: e[1], rd: e[2], op: L0 ? L0[2] : '', dest: L0 ? L0[3] : '', tt: L0 ? L0[4] : 'bus'});
    });
    return out.sort((a, b) => (parseInt(a.line) || 9e9) - (parseInt(b.line) || 9e9) || String(a.line).localeCompare(String(b.line)) || a.rd.localeCompare(b.rd));
  });
}
const destParts = dest => { const [a, b] = String(dest || '').split('<->'); return [a || '', (b || '').replace(/-\d+[#א-ת\d]?$/, '')]; };
function stopLinesInto(code, el) {
  const iso = DATE;
  return linesAtStop(String(code), iso).then(ls => {
    if (!el.isConnected) return;
    const uniq = [...new Map(ls.map(x => [x.line, x])).values()];
    el.className = 'xl';
    el.innerHTML = !dateOkD(iso) ? `<div class="note">אין תיעוד לתאריך ${fmtD(iso)}. ${histRangeTxt()}</div>` :
      `<div class="xh">קווים שעצרו כאן ב-${fmtD(iso)}${isNowD(iso) ? ' (היום — יש להם לו"ז לשבוע הקרוב)' : ''}: <b>${num(uniq.length)}</b></div>` +
      (uniq.length ? `<div class="badges">${uniq.map(x => `<a class="lb" href="../line-history/#${encodeURIComponent(x.rd)}@${iso}" target="_blank" rel="noopener" title="${esc(x.op + ' · ' + destParts(x.dest).join(' ← '))}">${esc(x.line)}</a>`).join('')}</div>` : '<div class="mut">אין קווים בתאריך הזה.</div>') +
      `<div class="mut">מקור: היסטוריית הקווים והתחנות (stopev). קישור — הקו בכלי ההיסטוריה.</div>`;
  });
}

// קובץ קו מכלי ההיסטוריה (line-history/data/lines/<rd>.json) — פורמט דחוס pool/spool כמו materializeLf שם
const LF = {};
const fsafe = rd => rd.replace(/#/g, 'H').replace(/\//g, '_');
function lineFile(rd) { return LF[rd] || (LF[rd] = load('../line-history/data/lines/' + encodeURIComponent(fsafe(rd)) + '.json')); }
const lhHidden = v => v && (v.hid || (v.k === 'platform' && !v.pv));
function decodePoly(str) {
  const pts = []; let i = 0, la = 0, lo = 0;
  while (i < str.length) {
    for (const w of [0, 1]) { let b, sh = 0, r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); const d = (r & 1) ? ~(r >> 1) : (r >> 1); if (w === 0) la += d; else lo += d; }
    pts.push([la / 1e5, lo / 1e5]);
  }
  return pts;
}
// מצב הקו בתאריך — כמו מפת החודש בכלי ההיסטוריה: הגרסה האחרונה עד התאריך; removed/planned-dropped = לא בתוקף
function lineAt(lf, iso) {
  const vs = (lf.versions || []).filter(v => v.d && v.d <= iso && !lhHidden(v) && !v.syn);
  const last = vs[vs.length - 1];
  if (!last || last.k === 'removed' || last.k === 'planned-dropped') return null;
  const pool = lf.pool || [], spool = lf.spool || [];
  const withStops = [...vs].reverse().find(v => Array.isArray(v.stops) && v.stops.length);
  const stops = withStops ? withStops.stops.map(x => typeof x === 'number' ? pool[x] : x).filter(Boolean) : [];
  const vsh = [...vs].reverse().find(v => (typeof v.shp === 'number' && v.shp > 0 && spool[v.shp]) || (typeof v.shp === 'string' && v.shp.length > 2));
  const shp = vsh ? (typeof vsh.shp === 'number' ? spool[vsh.shp] : vsh.shp) : '';
  return {v: last, since: last.d, stops, shape: shp ? decodePoly(shp) : []};
}
function lineInfoInto(rd, el) {
  const iso = DATE;
  return lineFile(rd).then(lf => {
    if (!el.isConnected) return;
    const s = lineAt(lf, iso);
    el.className = 'xl';
    if (!s) { el.innerHTML = `<div class="mut">הקו לא היה בתוקף ב-${fmtD(iso)}.</div>`; return; }
    el.innerHTML = `<div class="xh">${num(s.stops.length)} תחנות ב-${fmtD(iso)} · גרסת המסלול מ-${fmtD(s.since)}</div><ol class="stl">${s.stops.slice(0, 80).map(x => `<li>${esc(x[1])} <small class="mut">${esc(x[0])}</small></li>`).join('')}</ol>${s.stops.length > 80 ? `<div class="mut">ועוד ${s.stops.length - 80}</div>` : ''}<div class="mut">מקור: היסטוריית הקווים (lines/${esc(rd)}).</div>`;
  });
}

// שכבת הקווים: רק מזום 11, רק המסלולים שבתחום המפה; משבצות המסלולים נטענות לפי הצורך
const SHT = {};
let linesGen = 0;
function resetLines() {
  const l = byId.alllines; linesGen++;
  if (!l.items) return;
  l.items = []; l.have = new Set();
  if (l.lg) l.lg.clearLayers();
  if (IDN && IDN.hits.some(h => h.l === l)) closeIdent();
  if (SEL.alllines) { delete SEL.alllines; drawSel(); selChanged(); }
  if (tLayer === l) renderTable();
  rerow(l); linesRefresh();
}
function linesRefresh() {
  const l = byId.alllines;
  if (!l.on || !l.items || !HL || !l.lg) return;
  if (!dateOkD(DATE)) return setStatus(l, `אין תיעוד ל-${fmtD(DATE)}`);
  if (map.getZoom() < 11) return setStatus(l, 'מוצג מזום 11 ומעלה — מתקרבים למפה');
  const D = dayOf(DATE), B = map.getBounds(), need = new Set(), cand = [], gen = linesGen;
  HL.lines.forEach((L0, k) => {
    if (l.have.has(k)) return;
    const seg = segAt(L0, D); if (!seg || seg[2] == null) return;
    const sh = HL.shapes[seg[2]];
    if (!B.intersects(L.latLngBounds([sh[1], sh[2]], [sh[3], sh[4]]))) return;
    cand.push([k, seg[2]]); if (!SHT[sh[0]]) need.add(sh[0]);
  });
  if (!cand.length) return setStatus(l, '');
  setStatus(l, 'טוען מסלולים…');
  need.forEach(t => { SHT[t] = load('data/hist/shapes/' + t + '.json').catch(() => ({})); });
  Promise.all([...new Set(cand.map(([, s]) => HL.shapes[s][0]))].map(t => SHT[t].then(v => [t, v]))).then(arr => {
    if (gen !== linesGen || !l.on) return;
    const T = Object.fromEntries(arr);
    cand.forEach(([k, sid]) => {
      if (l.have.has(k)) return;
      const enc = (T[HL.shapes[sid][0]] || {})[sid]; if (!enc) return;
      const L0 = HL.lines[k], [from, to] = destParts(L0[3]);
      const it = {p: {line: L0[1], op: L0[2], from, to, type: (LTYPE[L0[4]] || [L0[4]])[0], tt: L0[4], rd: L0[0]},
        f: {type: 'Feature', geometry: {type: 'LineString', coordinates: decodePoly(enc).map(([a, b]) => [b, a])}}};
      l.have.add(k); l.items.push(it); mkLay(l, it, l.items.length - 1);
      if (passes(l, it)) l.lg.addLayer(it.lay);
    });
    setStatus(l, ''); rerow(l); drawLabels(l);
    if (tLayer === l && !$('#table').hidden) renderTable();
  });
}
map.on('moveend', linesRefresh);

// ---------------------------------------------------------------- התחנה הבאה — פרטי התחנה (כמו StopDetails ב-next-station/app.jsx)
const NS_POI = {school: '🏫', academia: '🎓', health: '🏥', mall: '🛒', train: '🚉', worship: '🕍', police: '🚓', fire: '🚒', library: '📚', community: '🏘️', gov: '🏛️', culture: '🎭', busstation: '🚌', park: '🌳', sport: '⚽', shop: '🏪', fuel: '⛽', bank: '🏦', junction: '🛣️', post: '📮', cemetery: '🪦', hood: '🏙️', care: '🧓', checkpoint: '🛂', village: '🏡'};
const NS_PLACE = ['צומת', 'שכונ', 'מסוף', 'מסעף', 'פארק', 'חוף', 'אזור', 'קרית', 'קריית', 'רמת', 'גבעת', 'הר', 'עלמין', 'העלמין', 'קבר', 'הקברות', 'מחנה', 'מגרש', 'מתחם', 'מיתחם', 'מעבר', 'מחסום'];
function nsWalkBad(s) { const w = s.rw; return !!(w && w.cur && w.sug && w.sug.d > w.cur.d); }
function nsEffWalk(x) { const rt = x.rt; if (rt && rt.d != null && rt.d <= 4 * x.d + 300) return rt.min; return x.d < 80 ? 1 : Math.round(x.d / 80); }
function nsDetails(s) {
  if (!s) return '';
  const C = NS_CATS[s.k], out = [];
  out.push(`<div class="nsc" style="color:${C.color}"><b>${esc(C.label)}</b> — ${esc(C.desc)}</div>`);
  if (s.ms) out.push(`<div>🗺️ ${s.k === 'closer' ? 'הרחוב המצטלב הקרוב לפי המפה' : 'רחוב לפי המפה'}: <b>${esc(s.ms)}</b> <span class="mut">${num(s.md)} מ׳</span></div>`);
  if (s.lm) { const place = s.lmw && NS_PLACE.some(w => s.lmw.startsWith(w)); out.push(`<div>🏛️ התחנה קרויה על-שם ${s.lmw ? (place ? 'ציון-דרך' : 'מוסד') + ` («${esc(s.lmw)}»)` : 'מוסד או מקום'} ולא על-שם רחוב — ככל הנראה שם תקין.</div>`); }
  else if (s.k === 'spelling' || s.k === 'uncertain') out.push(`<div>💬 בשם התחנה: «<b>${esc(String(s.n || '').split(/[\\/]/)[0].trim())}</b>» · בכתובת: «<b>${esc(s.s)}</b>»</div>`);
  if (s.sv) out.push(`<div>🛣️ ברחוב זה <b>${num(s.sv.n)}</b> תחנות כותבות «<b>${esc(s.sv.maj)}</b>» — וכאן כתוב «<b>${esc(s.sv.use)}</b>»</div>`);
  if (s.k === 'closer') {
    out.push(`<div>📍 ${s.nocross ? `הרחוב המצטלב שבשם («<b>${esc(s.cur)}</b>») <b>לא נמצא במפה כלל</b> בסביבת התחנה, למרות שהאזור ממופה היטב — ייתכן ששמו שגוי או שהרחוב אינו קיים.`
      : s.cur ? `הרחוב המצטלב שבשם («<b>${esc(s.cur)}</b>»${s.curd != null ? ' — כ-' + num(s.curd) + ' מ׳ מהתחנה' : ' — אינו ליד התחנה'}) רחוק יותר מהרחוב <b>${esc(s.ms)}</b> (<b>${num(s.md)}</b> מ׳), שעובר ממש לידה.`
      : `הרחוב <b>${esc(s.ms)}</b> עובר ממש ליד התחנה (<b>${num(s.md)}</b> מ׳) ואינו מופיע בשם.`}</div>`);
    if (s.sug && s.sug.includes('/')) out.push(`<div class="mut">ℹ️ לפי מוסכמת השמות, החלק שלפני הלוכסן («${esc(s.sug.split('/')[0])}») הוא הרחוב שבו התחנה נמצאת — הוא נשאר. ההצעה מחליפה רק את הרחוב המצטלב שאחרי הלוכסן.</div>`);
    if (s.sug) out.push(`<div>💡 שם מוצע: <b>${esc(s.sug)}</b></div>`);
    if (s.rw && (s.rw.cur || s.rw.sug)) out.push(`<div>🚶 הליכה אמיתית מהתחנה:${s.rw.cur ? ` ${esc(s.cur)} <b>${num(s.rw.cur.d)} מ׳</b> (${num(s.rw.cur.min)} דק׳)` : ''}${s.rw.cur && s.rw.sug ? ' · ' : ''}${s.rw.sug ? ` ${esc(s.ms)} <b>${num(s.rw.sug.d)} מ׳</b> (${num(s.rw.sug.min)} דק׳)` : ''}${s.rw.cur && s.rw.sug ? `<br>${s.rw.sug.d <= s.rw.cur.d ? '✓ הרחוב המוצע אכן קרוב יותר גם בהליכה' : '↺ דווקא הרחוב שבשם קרוב יותר בהליכה'}` : ''}</div>`);
    if (s.roads && (s.roads.cur || s.roads.sug)) out.push('<div class="mut"><span style="color:#dc2626">━ בשם כיום</span> · <span style="color:#16a34a">━ מוצע</span> — מסומנים על המפה</div>');
  } else if (s.sug) out.push(`<div>💡 שם מוצע (לפי הרחובות במפה): <b>${esc(s.sug)}</b></div>`);
  if (s.psug) out.push(`<div>🏛️ מוקד מרכזי סמוך (עד 100 מ׳): <b>${esc(s.psug)}</b> <span class="mut">${num(s.psugd)} מ׳</span></div>`);
  if (s.act === false) out.push('<div class="mut">⚠️ תחנה לא פעילה (אינה בקו פעיל)</div>');
  const near = (s.p || []).filter(x => nsEffWalk(x) <= 6);
  if (near.length) out.push(`<div class="nsp"><b>📍 ליד התחנה (OSM) — עד ~5 דק׳ הליכה:</b>${near.map(x => { const rt = x.rt && !(x.rt.d != null && x.rt.d > 4 * x.d + 300) ? x.rt : null; return `<div>${NS_POI[x.k] || '•'} ${esc(x.n)} <span class="mut">${rt ? `🚶 ${num(rt.min)} דק׳${rt.d != null ? ' · ' + num(rt.d) + ' מ׳' : ''}` : `${num(x.d)} מ׳ · ${x.d < 80 ? 1 : Math.round(x.d / 80)} דק׳ 🚶`}</span></div>`; }).join('')}</div>`);
  if (s.la != null) out.push(`<a href="https://www.google.com/maps?q=${s.la},${s.lo}" target="_blank" rel="noopener">פתח במפות Google ↗</a>`);
  // הרחובות (בשם כיום / מוצע) על המפה — כמו בכלי
  if (s.roads) setTimeout(() => {
    [['cur', '#dc2626'], ['sug', '#16a34a']].forEach(([k, c]) => { const r = s.roads[k]; if (r && r.g) xtraG.addLayer(L.polyline(r.g, {color: c, weight: 5, opacity: 0.85, interactive: false, renderer: canvasSel})); });
  }, 0);
  return `<div class="ns">${out.join('')}<div class="mut">מקור: הכלי "התחנה הבאה" (GTFS מול OpenStreetMap), ${esc(fmtD((byId.nextst.meta || {}).updated || ''))}.</div></div>`;
}

// ---------------------------------------------------------------- סינון לפי עיר / שכונה (חל על כל שכבות הנקודות והקווים)
const AREA = {v: 0, city: null, hood: null, polys: [], bb: null};
const areaG = L.layerGroup().addTo(map);
function inArea(l, it) {
  if (it._av === AREA.v) return it._ao;
  let ok;
  if (it.ll) ok = (AREA.city && !AREA.hood && it.p.city === AREA.city) || inAreaPt(it.ll);
  else if (it.f) {
    const bb = bbOf(it); ok = false;
    if (bb.intersects(AREA.bb)) { let n = 0; eachCoord(it.f.geometry, (x, y) => { if (!ok && (n++ % 3 === 0) && inAreaPt([y, x])) ok = true; }); if (!ok) ok = inAreaPt([bb.getCenter().lat, bb.getCenter().lng]); }
  } else ok = true;
  it._av = AREA.v; it._ao = ok;
  return ok;
}
function inAreaPt(ll) {
  if (!AREA.bb || !AREA.bb.contains(ll)) return false;
  return AREA.polys.some(h => bbOf(h).contains(ll) && pip(ll, h.f.geometry));
}
function setArea(city, hoodI) {
  ensure('hoods').then(() => {
    const H = byId.hoods.items;
    AREA.city = city || null; AREA.hood = hoodI == null ? null : hoodI;
    AREA.polys = AREA.hood != null ? H.filter(h => h.p.i === AREA.hood) : AREA.city ? H.filter(h => h.p.city === AREA.city) : [];
    AREA.bb = null; AREA.polys.forEach(h => { const b = bbOf(h); AREA.bb = AREA.bb ? AREA.bb.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast()); });
    AREA.v = AREA.city || AREA.hood != null ? AREA.v + 1 || 1 : 0;
    if (AREA.v && !AREA.polys.length && !AREA.city) AREA.v = 0;
    areaG.clearLayers();
    AREA.polys.forEach(h => areaG.addLayer(L.geoJSON(h.f, {style: {color: '#0891b2', weight: 2, dashArray: '6 4', fill: false}, interactive: false})));
    if (AREA.bb) map.fitBounds(AREA.bb, {padding: [20, 20]});
    LAYERS.forEach(l => { if (l.lg && l.kind !== 'custom') { refill(l); drawLabels(l); rerow(l); } });
    if (!$('#table').hidden) renderTable();
    renderLyrTop();
  });
}
function renderLyrTop() {
  const el = $('#lyrtop'); if (!el) return;
  const hoods = byId.hoods.items;
  const hoodName = AREA.hood != null && hoods ? (hoods.find(h => h.p.i === AREA.hood) || {p: {}}).p : null;
  el.innerHTML = `<div class="lt"><div class="row"><span>תאריך</span><input type="date" class="fld" id="g-date" value="${DATE}" min="${HMETA ? HMETA.d2012 : '2012-07-07'}" max="${todayIso()}" aria-label="בחירת תאריך לשכבות הכלליות"><button class="btn" id="g-today">היום</button></div>
    ${!dateOkD(DATE) ? `<div class="note warn">אין תיעוד ל-${fmtD(DATE)}.</div>` : ''}<div class="mut">חל על "כל התחנות" ו"קווים". ${histRangeTxt()}</div>
    <div class="row"><span>עיר</span><input class="fld" id="g-city" list="g-cities" placeholder="כל הארץ" value="${esc(AREA.city || '')}" aria-label="סינון לפי עיר"><datalist id="g-cities"></datalist></div>
    <div class="row"><span>שכונה</span><input class="fld" id="g-hood" list="g-hoods" placeholder="כל השכונות" value="${hoodName ? esc(hoodName.name + ' — ' + (hoodName.city || '')) : ''}" aria-label="סינון לפי שכונה"><datalist id="g-hoods"></datalist>${AREA.v ? '<button class="btn" id="g-aclr">ניקוי</button>' : ''}</div>
    <div class="mut">${AREA.v ? `מוצגות רק ישויות בתוך ${hoodName ? 'השכונה' : 'העיר'} (לפי גבולות השכונות${hoodName ? '' : ' של העיר, או שדה העיר של התחנה'}).` : 'סינון לפי עיר / שכונה — חל על כל שכבות הנקודות והקווים.'}</div></div>`;
}
$('#lyrtop').addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'g-date') { if (t.value) setDate(t.value); }
  else if (t.id === 'g-city') { const v = t.value.trim(); setArea(v || null, null); }
  else if (t.id === 'g-hood') { const it = (byId.hoods.items || []).find(x => x.p.name + ' — ' + (x.p.city || '') === t.value); if (it) setArea(AREA.city, it.p.i); else if (!t.value) setArea(AREA.city, null); }
});
$('#lyrtop').addEventListener('click', e => {
  if (e.target.id === 'g-today') setDate(todayIso());
  if (e.target.id === 'g-aclr') { areaG.clearLayers(); setArea(null, null); }
});
$('#lyrtop').addEventListener('focusin', e => {
  if (e.target.id !== 'g-city' && e.target.id !== 'g-hood') return;
  ensure('hoods').then(() => {
    const H = byId.hoods.items;
    if (e.target.id === 'g-city') { const dl = $('#g-cities'); if (dl && !dl.children.length) dl.innerHTML = [...new Set(H.map(h => h.p.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')).map(c => `<option value="${esc(c)}">`).join(''); }
    else { const dl = $('#g-hoods'); if (dl) dl.innerHTML = H.filter(h => !AREA.city || h.p.city === AREA.city).map(h => `<option value="${esc(h.p.name + ' — ' + (h.p.city || ''))}">`).join(''); }
  }).catch(() => {});
});

// ---------------------------------------------------------------- ניתוח: לשוניות שכונה / קו / תחנה
let ANA = 'hood';
function renderAnalysis() {
  $$('.atabs [data-ana]').forEach(b => { b.classList.toggle('on', b.dataset.ana === ANA); b.setAttribute('aria-selected', b.dataset.ana === ANA); });
  $$('[data-ana-pane]').forEach(p => { p.hidden = p.dataset.anaPane !== ANA; });
  if (ANA !== 'line') lvG.clearLayers();
  if (ANA !== 'stop') svG.clearLayers();
  if (ANA !== 'fut') { futG.clearLayers(); futHide(false); }
  if (ANA === 'hood') { renderHoodTop(); renderHood(); }
  else if (ANA === 'line') renderLineView();
  else if (ANA === 'fut') renderFuture();
  else renderStopView();
}
$('.atabs').addEventListener('click', e => { const b = e.target.closest('[data-ana]'); if (b) { ANA = b.dataset.ana; renderAnalysis(); } });

// ---------------------------------------------------------------- תצוגת קו: מסלול ותחנות בתאריך, סוג רכב, זמן נסיעה ואיחור לפי תחנה
// מקורות: המסלול והתחנות — line-history/data/lines/<rd>.json; סוג הרכב, האיחור והאחוז בזמן — bus/data/days/<תאריך>.json
// ו-.stops.json (מדד הדיוק, 30 הימים האחרונים); זמני הנסיעה — לו"ז GTFS (gis/data/own/rtime, יום החול שנבנה בלילה).
const lvG = L.layerGroup().addTo(map), svG = L.layerGroup().addTo(map);
const LV = {rd: null, q: '', list: true};
let BUSR = null, BUSDAYS = null;
const busRoutes = () => BUSR || (BUSR = load('../bus/data/routes.json').then(R => { const m = {}; Object.entries(R).forEach(([rid, r]) => { if (r[0]) (m[`${r[0]}-${r[4]}-${r[5]}`] = m[`${r[0]}-${r[4]}-${r[5]}`] || []).push(rid); }); return m; }).catch(() => ({})));
const busDays = () => BUSDAYS || (BUSDAYS = load('../bus/data/index.json').then(d => (d.days || []).map(x => x.d)).catch(() => []));
const BUSDAY = {}, BUSST = {}, RTIME = {};
const busDay = d => BUSDAY[d] || (BUSDAY[d] = load(`../bus/data/days/${d}.json`).then(j => { const m = {}; (j.routes || []).forEach(r => { m[r[0]] = r; }); return m; }).catch(() => null));
const busStops = d => BUSST[d] || (BUSST[d] = load(`../bus/data/days/${d}.stops.json`).catch(() => null));
const rtime = rid => { const k = String(rid).slice(-2).padStart(2, '0'); return (RTIME[k] || (RTIME[k] = load(`data/own/rtime/${k}.json`).catch(() => ({})))).then(m => m[rid] || null); };
const DCAT = [['#7C3AED', 'מוקדם (יותר מ-2 דק׳)'], ['#00A65A', 'בזמן (עד 5 דק׳)'], ['#F4B400', 'איחור 5–10 דק׳'], ['#F26B1D', 'איחור 10–20 דק׳'], ['#D7263D', 'איחור מעל 20 דק׳']];
const dcat = v => v == null ? -1 : v < -2 ? 0 : v <= 5 ? 1 : v <= 10 ? 2 : v <= 20 ? 3 : 4;   // כמו catOf במדד הדיוק
const SPD = [[10, '#b91c1c', 'עד 10 קמ"ש'], [15, '#f97316', '10–15'], [20, '#eab308', '15–20'], [30, '#65a30d', '20–30'], [1e9, '#15803d', 'מעל 30 קמ"ש']];
const spdColor = v => SPD.find(([t]) => v < t)[1];
const mmss = s => s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function openLineView(rd) { LV.rd = rd; LV.list = false; if (!LV.q && HL && HL.byRd[rd] != null) LV.q = String(HL.lines[HL.byRd[rd]][1]); ANA = 'line'; if (PANE !== 'analysis') openPane('analysis'); else renderAnalysis(); }
function renderLineView() {
  const el = $('#lineview'); if (PANE !== 'analysis' || ANA !== 'line') return;
  const head = `<div class="sec"><div class="row" style="display:flex;gap:6px;align-items:center"><input class="fld" id="lv-q" placeholder="מספר קו (למשל 480)" value="${esc(LV.q)}" style="flex:1" aria-label="חיפוש קו"><input type="date" class="fld" id="lv-date" value="${DATE}" max="${todayIso()}" aria-label="תאריך"></div><div id="lv-list"></div></div>`;
  if (!LV.rd) { el.innerHTML = head + `<div class="note">מקלידים מספר קו ובוחרים כיוון/חלופה — או לוחצים על קו בשכבת "קווים" ← "ניתוח קו". המפה תציג את המסלול והתחנות בתאריך שנבחר, זמני הנסיעה ואיחור ממוצע לפי תחנה.</div>`; lvList(); return; }
  el.innerHTML = head + '<div class="note">טוען…</div>';
  lvList();
  const rd = LV.rd, iso = DATE;
  Promise.all([lineFile(rd), histLines(), busRoutes(), busDays()]).then(([lf, , RM, days]) => {
    if (LV.rd !== rd || DATE !== iso || ANA !== 'line') return;
    const s = lineAt(lf, iso), k = HL.byRd[rd], L0 = k != null ? HL.lines[k] : [rd, lf.line, lf.op, lf.dest, lf.tt || 'bus'];
    const [from, to] = destParts(L0[3] || lf.dest);
    const rids = RM[rd] || [];
    const hasDay = days.includes(iso), useT = isNowD(iso);
    lvG.clearLayers();
    const title = `<div class="sec"><div class="lvh"><span class="lb big">${esc(L0[1] || lf.line || '')}</span><div><b>${esc(from)} ← ${esc(to)}</b><div class="mut">${esc(L0[2] || lf.op || '')} · ${esc((LTYPE[L0[4]] || [''])[0])} · ${esc(rd)}</div></div></div>
      <div class="mut" style="margin-top:4px"><a href="../line-history/#${encodeURIComponent(rd)}@${iso}" target="_blank" rel="noopener">היסטוריית הקו ↗</a></div></div>`;
    if (!s) { el.innerHTML = head + title + `<div class="note warn">הקו לא היה בתוקף ב-${fmtD(iso)}.</div>`; lvList(); return; }
    return Promise.all([hasDay && rids.length ? busDay(iso) : null, hasDay && rids.length ? busStops(iso) : null, useT && rids.length ? Promise.all(rids.map(rtime)) : null]).then(([BD, BS, RT]) => {
      if (LV.rd !== rd || DATE !== iso || ANA !== 'line') return;
      const rid = rids.find(r => BD && BD[r]) || rids[0];
      const row = BD && rid ? BD[rid] : null;
      const prof = BS && rid ? BS[rid] : null;
      const rt = RT ? RT.find(Boolean) : null;
      // מסלול: מקטעים בין תחנות, צבועים לפי מהירות מתוכננת (מרחק על המסלול / זמן בלו"ז)
      const shape = s.shape.length > 1 ? s.shape : s.stops.map(x => [x[2], x[3]]);
      const stopLL = s.stops.map(x => [x[2], x[3]]);
      const idx = [], cum = [0];
      for (let i = 1; i < shape.length; i++) cum.push(cum[i - 1] + map.distance(shape[i - 1], shape[i]));
      let from0 = 0;
      stopLL.forEach(ll => { let best = from0, bd = Infinity; for (let i = from0; i < shape.length; i++) { const d = map.distance(ll, shape[i]); if (d < bd) { bd = d; best = i; } if (d > bd + 3000) break; } idx.push(best); from0 = best; });
      const tByCode = {};
      if (rt) rt[0].forEach((c, i) => { tByCode[c] = rt[1][i]; });
      lvG.addLayer(L.polyline(shape, {color: '#1e293b', weight: 7, opacity: 0.35, interactive: false}));
      let segOk = 0;
      for (let i = 1; i < s.stops.length; i++) {
        const a = idx[i - 1], b = idx[i], ta = tByCode[s.stops[i - 1][0]], tb = tByCode[s.stops[i][0]];
        if (b <= a) continue;
        const pts = shape.slice(a, b + 1), dist = cum[b] - cum[a];
        let col = '#0ea5e9', tip = '';
        if (ta != null && tb != null && tb > ta) { const kmh = dist / (tb - ta) * 3.6; col = spdColor(kmh); tip = `${esc(s.stops[i - 1][1])} ← ${esc(s.stops[i][1])}: ${mmss(tb - ta)} דק׳ · ${num(Math.round(dist))} מ׳ · ${fmt1(kmh)} קמ"ש`; segOk++; }
        const pl = L.polyline(pts, {color: col, weight: 5, opacity: 0.95});
        if (tip) pl.bindTooltip(tip, {sticky: true, direction: 'top'});
        lvG.addLayer(pl);
      }
      const pmap = {}; (prof || []).forEach(r => { pmap[r[0]] = r; });
      s.stops.forEach((x, i) => {
        const pr = pmap[x[0]], avg = pr && pr[1] ? pr[2] / 10 : null, c = dcat(avg);
        const mk = L.circleMarker([x[2], x[3]], {radius: i === 0 || i === s.stops.length - 1 ? 7 : 5, color: '#fff', weight: 1.5, fillColor: c < 0 ? '#64748b' : DCAT[c][0], fillOpacity: 1});
        mk.bindTooltip(`<b>${i + 1}. ${esc(x[1])}</b> (${esc(x[0])})<br>${pr && pr[1] ? `איחור ממוצע ${avg > 0 ? '+' : ''}${fmt1(avg)} דק׳ · ${num(pr[1])} הגעות · ${Math.round(100 * pr[3] / pr[1])}% בזמן` : 'איחור: אין נתונים'}${tByCode[x[0]] != null ? `<br>זמן מהמוצא בלו"ז: ${mmss(tByCode[x[0]])} דק׳` : ''}`, {direction: 'top'});
        lvG.addLayer(mk);
      });
      const b = L.latLngBounds(shape); if (b.isValid()) map.fitBounds(b, {padding: [30, 30]});
      // לוח
      const veh = row && row[9], det = veh && veh[6];
      const act = det && det.actual ? Object.entries(det.actual).sort((a, b) => b[1] - a[1]) : [];
      const known = act.reduce((n, [, v]) => n + v, 0);
      const vehHtml = !hasDay ? `אין נתונים לתאריך הזה (מדד הדיוק שומר את 30 הימים האחרונים${days.length ? `: ${fmtD(days[0])}–${fmtD(days[days.length - 1])}` : ''})` :
        !row ? 'אין נתונים לקו בתאריך הזה' :
        `${act.length ? `הנפוץ בנסיעות שנצפו: <b>${esc(act[0][0])}</b> (${num(act[0][1])} מתוך ${num(known)} נסיעות עם סוג רכב מזוהה)` : 'סוג הרכב לא זוהה בנסיעות'}${det && det.plan && det.plan.labels ? `<br>נקבע ברישוי הקו: ${det.plan.labels.map(esc).join(' / ')}` : veh && veh[0] ? `<br>גודל הרכב המתוכנן: ${esc(veh[0])}` : ''}`;
      const tot = rt ? rt[1][rt[1].length - 1] : null;
      const meas = row ? row[3] : 0, onp = row && meas ? Math.round(100 * row[4][1] / meas) : null;
      el.innerHTML = head + title + `<div class="sec"><div class="kpis">
          <div class="kpi"><b>${num(s.stops.length)}</b><span>תחנות ב-${fmtD(iso)} (גרסה מ-${fmtD(s.since)})</span></div>
          <div class="kpi"><b>${tot != null ? mmss(tot) : '—'}</b><span>${tot != null ? `זמן נסיעה מתוכנן, דקות (לו"ז ${esc((OWNMETA && OWNMETA.gtfsDay) ? fmtD(OWNMETA.gtfsDay) : 'GTFS')}, ${num(rt[2])} נסיעות ביום)` : useT ? 'זמן נסיעה: אין נתונים לקו' : 'זמן נסיעה: אין נתונים לתאריך עבר'}</span></div>
          <div class="kpi"><b>${onp != null ? onp + '%' : '—'}</b><span>${row ? `בזמן, בכל התחנות (${num(meas)} הגעות)` : 'אחוז בזמן: אין נתונים'}</span></div>
          <div class="kpi"><b>${row && row[5] ? (row[5][0] > 0 ? '+' : '') + fmt1(row[5][0]) : '—'}</b><span>${row ? `איחור ממוצע, דק׳ · ${num(row[2])}/${num(row[1])} נסיעות נצפו` : 'איחור: אין נתונים'}</span></div>
        </div>
        <h5>סוג רכב</h5><div class="mut">${vehHtml}</div>
        <h5 style="margin-top:8px">מקרא למפה</h5>
        <div class="lgs">${segOk ? SPD.map(([, c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('') + '<small class="mut">מהירות מתוכננת בקטע (מרחק על המסלול ÷ זמן בלו"ז)</small>' : '<small class="mut">צבע המקטעים לפי זמן הנסיעה: אין נתונים לתאריך/לקו הזה</small>'}</div>
        <div class="lgs">${prof ? DCAT.map(([c, t]) => `<span><b style="background:${c}"></b>${t}</span>`).join('') + '<small class="mut">עיגול התחנה — האיחור הממוצע בה ביום הזה</small>' : '<small class="mut">צבע התחנות לפי איחור: אין נתונים</small>'}</div></div>
        <div class="sec"><h5>התחנות</h5><div class="ttwrap"><table class="mini"><thead><tr><th>#</th><th>תחנה</th><th>מהמוצא</th><th>איחור</th><th>בזמן</th></tr></thead><tbody>${s.stops.map((x, i) => { const pr = pmap[x[0]], avg = pr && pr[1] ? pr[2] / 10 : null; return `<tr data-ll="${x[2]},${x[3]}" style="cursor:pointer"><td>${i + 1}</td><td>${esc(x[1])} <small class="mut">${esc(x[0])}</small></td><td>${tByCode[x[0]] != null ? mmss(tByCode[x[0]]) : '—'}</td><td>${avg != null ? `<span style="color:${DCAT[dcat(avg)][0]}">${avg > 0 ? '+' : ''}${fmt1(avg)}</span>` : '—'}</td><td>${pr && pr[1] ? Math.round(100 * pr[3] / pr[1]) + '%' : '—'}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="mut">מקורות: מסלול ותחנות — היסטוריית הקווים; איחור, אחוז בזמן וסוג רכב — מדד דיוק האוטובוסים (${hasDay ? fmtD(iso) : 'אין יום זה'}); זמני נסיעה — לו"ז GTFS של משרד התחבורה${useT ? '' : ' (רק לתאריך הנוכחי)'}.</p></div>`;
      lvList();
      $$('#lineview tr[data-ll]').forEach(tr => { tr.onclick = () => { const [a, b2] = tr.dataset.ll.split(',').map(Number); map.setView([a, b2], Math.max(map.getZoom(), 16)); }; });
    });
  }).catch(e => { console.warn(e); if (LV.rd === rd) el.innerHTML = head + '<div class="note warn">פרטי הקו לא זמינים כרגע.</div>'; });
}
function lvList() {
  const box = $('#lv-list'); if (!box) return;
  const q = LV.q.trim();
  if (!q || (LV.rd && !LV.list)) { box.innerHTML = LV.rd && q ? '<button class="linkbtn" id="lv-more">כיוונים וחלופות נוספים של הקו ←</button>' : ''; return; }
  histLines().then(() => {
    const D = dayOf(DATE);
    const hits = HL.lines.filter(L0 => String(L0[1]) === q && segAt(L0, D)).slice(0, 40);
    box.innerHTML = hits.length ? hits.map(L0 => { const [a, b] = destParts(L0[3]); return `<div class="opt${L0[0] === LV.rd ? ' on' : ''}" data-rd="${esc(L0[0])}"><span class="lb">${esc(L0[1])}</span><span class="grow">${esc(a)} ← ${esc(b)}<br><small>${esc(L0[2])} · ${esc(L0[0])}</small></span></div>`; }).join('') : `<div class="mut">אין קו ${esc(q)} בתוקף ב-${fmtD(DATE)}.</div>`;
  });
}
$('#lineview').addEventListener('input', e => { if (e.target.id === 'lv-q') { LV.q = e.target.value; LV.list = true; clearTimeout(lvList.t); lvList.t = setTimeout(lvList, 250); } });
$('#lineview').addEventListener('change', e => { if (e.target.id === 'lv-date' && e.target.value) setDate(e.target.value); });
$('#lineview').addEventListener('click', e => {
  if (e.target.id === 'lv-more') { LV.list = true; lvList(); return; }
  const o = e.target.closest('[data-rd]'); if (o) { LV.rd = o.dataset.rd; LV.list = false; renderLineView(); }
});

// ---------------------------------------------------------------- תצוגת תחנה: מחוון תאריך — כל המסלולים שעצרו בתחנה ביום שנבחר
const SV = {code: null, name: '', ll: null, iso: null, max: 0};
function openStopView(code, name, ll) { SV.code = String(code); SV.name = name || ''; SV.ll = ll || null; SV.iso = SV.iso || DATE; ANA = 'stop'; if (PANE !== 'analysis') openPane('analysis'); else renderAnalysis(); }
function renderStopView() {
  const el = $('#stopview'); if (PANE !== 'analysis' || ANA !== 'stop') return;
  if (!SV.code) { el.innerHTML = '<div class="note">בוחרים תחנה במפה (שכבת "כל התחנות", "מדד דיוק האוטובוסים" או "התחנה הבאה") ← "ניתוח תחנה". כאן יופיע מחוון תאריך שמזיז את הזמן: המפה תציג את כל המסלולים שעצרו בתחנה ביום שנבחר.</div>'; return; }
  const lo = HMETA ? dayOf(HMETA.from) : dayOf('2015-09-11'), hi = Math.max(dayOf(todayIso()), SV.max || 0);
  if (!SV.max) lastPlanDate().then(d => { SV.max = dayOf(d); if (SV.max > dayOf(todayIso()) && ANA === 'stop') renderStopView(); }).catch(() => {});
  const cur = Math.max(lo, Math.min(hi, dayOf(SV.iso || DATE)));
  if (!(HMETA && SV.iso === HMETA.d2012)) SV.iso = isoOf(cur);
  el.innerHTML = `<div class="sec"><div class="lvh"><span class="lb big">🚏</span><div><b>${esc(SV.name)}</b><div class="mut">מק"ט ${esc(SV.code)} · <a href="../line-history/#stop=${encodeURIComponent(SV.code)}" target="_blank" rel="noopener">כל ההיסטוריה של התחנה ↗</a></div></div></div></div>
    <div class="sec"><h5>הזזת תאריך: <b id="sv-d">${fmtD(SV.iso)}</b></h5><input type="range" id="sv-r" min="${lo}" max="${hi}" step="1" value="${cur}" style="width:100%" aria-label="הזזת תאריך">
    <div class="row" style="display:flex;justify-content:space-between" class="mut"><small class="mut">${fmtD(isoOf(lo))}</small><small class="mut">${hi > dayOf(todayIso()) ? fmtD(isoOf(hi)) + ' (עתידי — לפי התוכניות שפורסמו)' : 'היום'}</small></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><button class="btn" data-j="-365">‹ שנה</button><button class="btn" data-j="-30">‹ חודש</button><button class="btn" data-j="30">חודש ›</button><button class="btn" data-j="365">שנה ›</button>${HMETA ? `<button class="btn" data-j="2012">2012</button>` : ''}</div>
    <div class="mut" style="margin-top:4px">${histRangeTxt()}</div></div><div class="sec" id="sv-out"><div class="note">טוען…</div></div>`;
  svUpdate();
}
let svT = null, svGen = 0;
function svUpdate() {
  const iso = SV.iso, code = SV.code, gen = ++svGen, out = $('#sv-out');
  linesAtStop(code, iso).then(ls => {
    if (gen !== svGen) return;
    svG.clearLayers();
    if (SV.ll) svG.addLayer(L.circleMarker(SV.ll, {radius: 9, color: '#0f172a', weight: 3, fillColor: '#fde047', fillOpacity: 1, interactive: false}));
    if (!dateOkD(iso)) { out.innerHTML = `<div class="note warn">אין תיעוד ל-${fmtD(iso)}.</div>`; return; }
    const byLine = [...new Map(ls.map(x => [x.line + '|' + x.rd, x])).values()];
    out.innerHTML = `<h5>${num(new Set(byLine.map(x => x.line)).size)} קווים ${iso > todayIso() ? 'יעצרו' : 'עצרו'} בתחנה ב-${fmtD(iso)}${iso > todayIso() ? ' (עתידי: הקווים של היום ועליהם התוכניות שפורסמו בלו"ז)' : isNowD(iso) ? ' (היום)' : ''}</h5><div id="sv-list">${byLine.length ? '' : '<div class="mut">אין קווים בתאריך הזה.</div>'}</div><p class="mut">מקור: היסטוריית הקווים והתחנות — stopev (מי עצר בתחנה) ו-lines/&lt;קו&gt; (המסלול באותו יום).</p>`;
    const list = $('#sv-list'), B = [];
    byLine.forEach((x, i) => {
      const c = PALETTE[i % PALETTE.length], [a, b] = destParts(x.dest);
      list.insertAdjacentHTML('beforeend', `<div class="opt" data-rd="${esc(x.rd)}"><i class="swl" style="background:${c}"></i><span class="lb">${esc(x.line)}</span><span class="grow">${esc(a)} ← ${esc(b)}<br><small>${esc(x.op)}${x.plan ? ` · לפי התוכנית מ-${fmtD(x.plan)}` : ''}</small></span></div>`);
      (x.plan ? plans().then(P => { const q = P[x.rd]; return {shape: q && q.shp ? decodePoly(q.shp) : (q ? q.stopinfo.map(s => [s[2], s[3]]) : [])}; }) : lineFile(x.rd).then(lf => lineAt(lf, iso))).then(s => {
        if (gen !== svGen) return;
        if (!s || s.shape.length < 2) return;
        const pl = L.polyline(s.shape, {color: c, weight: 4, opacity: 0.8}).bindTooltip(`קו ${esc(x.line)} · ${esc(a)} ← ${esc(b)}`, {sticky: true});
        pl.on('click', () => openLineView(x.rd));
        svG.addLayer(pl); B.push(pl.getBounds());
        if (B.length === 1 || B.length === byLine.length) { const bb = B.reduce((m, q) => m.extend(q), L.latLngBounds(B[0].getSouthWest(), B[0].getNorthEast())); if (SV.ll) bb.extend(SV.ll); map.fitBounds(bb, {padding: [20, 20], maxZoom: 15}); }
      }).catch(() => {});
    });
  }).catch(e => { console.warn(e); if (gen === svGen) out.innerHTML = '<div class="note warn">נתוני התחנה לא זמינים כרגע.</div>'; });
}
$('#stopview').addEventListener('input', e => {
  if (e.target.id !== 'sv-r') return;
  SV.iso = isoOf(+e.target.value); $('#sv-d').textContent = fmtD(SV.iso);
  clearTimeout(svT); svT = setTimeout(svUpdate, 250);
});
$('#stopview').addEventListener('click', e => {
  const j = e.target.closest('[data-j]');
  if (j) { SV.iso = j.dataset.j === '2012' ? HMETA.d2012 : isoOf(Math.max(dayOf(HMETA ? HMETA.from : '2015-09-11'), Math.min(dayOf(todayIso()), dayOf(SV.iso) + +j.dataset.j))); renderStopView(); return; }
  const o = e.target.closest('[data-rd]'); if (o) { openLineView(o.dataset.rd); }
});

// ---------------------------------------------------------------- שינויים עתידיים לפי עיר
// המקור: line-history/data/planned-state.json — התוכניות הפתוחות שכלי ההיסטוריה עוקב אחריהן (וריאנט חדש / שינוי תחנות
// שפורסם בלו"ז עם תאריך התחלה עתידי). הניסוח כמו PlanLines בכלי: "בתוכנית נוספו / ירדו" לעומת המסלול שנוסע היום.
// ביטולים עתידיים ושינויי לו"ז עתידיים — אין בנתונים; מוצג כך במפורש.
let PLANS = null;
const plans = () => PLANS || (PLANS = load('../line-history/data/planned-state.json').catch(() => ({})));
const FUT = {city: '', sel: null, items: [], lays: {}, tok: 0, hidden: false};
const futG = L.layerGroup().addTo(map);
const FKIND = {add: ['קו / וריאנט חדש', '#16a34a'], chg: ['שינוי מסלול', '#f97316'], del: ['ביטול', '#dc2626']};
function planMatchesCity(p, city) {
  if (!city) return false;
  if (String(p.long || '').includes(city)) return true;
  const H = (byId.hoods.items || []).filter(h => h.p.city === city);
  return (p.stopinfo || []).some(s => H.some(h => bbOf(h).contains([s[2], s[3]]) && pip([s[2], s[3]], h.f.geometry)));
}
function renderFuture() {
  const el = $('#futview'); if (PANE !== 'analysis' || ANA !== 'fut') return;
  el.innerHTML = `<div class="sec"><div class="row" style="display:flex;gap:6px"><input class="fld" id="fu-city" list="fu-cities" placeholder="בחירת עיר…" value="${esc(FUT.city)}" style="flex:1" aria-label="עיר"><datalist id="fu-cities"></datalist></div>
    <div class="lgs"><span><i style="background:${FKIND.add[1]}"></i>${FKIND.add[0]}</span><span><i style="background:${FKIND.chg[1]}"></i>${FKIND.chg[0]}</span><span><i style="background:${FKIND.del[1]}"></i>${FKIND.del[0]}</span><small class="mut">על המפה: המסלול של היום מקווקו אפור, המסלול החדש רציף; הקטע החדש מודגש בהילה, קטע שיוצא מהמסלול — אדום מקווקו; תחנה שנוספת ירוקה, תחנה שיורדת — עיגול אדום. לחיצה על שינוי מתמקדת בו.</small></div></div><div id="fu-out" class="sec">${FUT.city ? '<div class="note">טוען…</div>' : '<div class="note">בוחרים עיר — יוצגו כל השינויים העתידיים שפורסמו בלו"ז (GTFS) לקווים שעוברים בה, עם תאריך הכניסה לתוקף.</div>'}</div>`;
  ensure('hoods').then(() => { const dl = $('#fu-cities'); if (dl && !dl.children.length) dl.innerHTML = [...new Set(byId.hoods.items.map(h => h.p.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')).map(c => `<option value="${esc(c)}">`).join(''); }).catch(() => {});
  if (FUT.city) futList();
}
function futList() {
  const city = FUT.city, out = $('#fu-out');
  Promise.all([plans(), ensure('hoods'), histLines()]).then(([P]) => {
    if (city !== FUT.city || !$('#fu-out')) return;
    const today = todayIso(), D = dayOf(today);
    const list = Object.entries(P).filter(([, p]) => p.start && p.start >= today && planMatchesCity(p, city)).map(([rd, p]) => {
      const k = HL.byRd[rd], active = k != null && !!segAt(HL.lines[k], D);
      return {rd, p, kind: p.kind === 'route' || active ? 'chg' : 'add'};
    }).sort((a, b) => a.p.start.localeCompare(b.p.start) || (parseInt(a.p.line) || 9e9) - (parseInt(b.p.line) || 9e9));
    futG.clearLayers();
    const byDate = {};
    list.forEach(x => { (byDate[x.p.start] = byDate[x.p.start] || []).push(x); });
    out.innerHTML = `<h5>${num(list.length)} שינויים עתידיים ב${esc(city)}</h5>` + (list.length ? Object.entries(byDate).map(([d, xs]) => `<div class="fdate">${fmtD(d)} <small class="mut">${num(xs.length)} שינויים</small></div>` +
      xs.map(x => { const [a, b] = destParts(x.p.long); return `<div class="opt fch${FUT.sel === x.rd ? ' on' : ''}" data-rd="${esc(x.rd)}"><span class="lb" style="background:${FKIND[x.kind][1]}">${esc(x.p.line)}</span><span class="grow"><b>${FKIND[x.kind][0]}</b> · ${esc(a)} ← ${esc(b)}<br><small>${esc(x.p.op)} · ${esc(x.rd)} · נכנס לתוקף ב-${fmtD(x.p.start)}</small><span class="fdet" data-det="${esc(x.rd)}"></span></span></div>`; }).join('')).join('') :
      '<div class="mut">אין שינויים עתידיים לקווים בעיר הזו בנתונים.</div>') +
      `<p class="mut">מקור: היסטוריית הקווים — התוכניות שפורסמו בלו"ז של משרד התחבורה ועוד לא נכנסו לתוקף (planned-state). ${num(Object.keys(P).length)} תוכניות פתוחות בכל הארץ. ביטולי קווים ושינויי לו"ז עתידיים אינם בנתונים, ולכן לא מוצגים.</p>`;
    // כל השינויים על המפה: המסלול של היום מקווקו, המסלול החדש רציף, והקטע שמשתנה מודגש; זום לעיר/לשינויים
    FUT.items = list; FUT.lays = {};
    futHide(true);
    const cb = cityBoundsOf(city);
    const B = cb ? L.latLngBounds(cb.getSouthWest(), cb.getNorthEast()) : null;
    const tok = ++FUT.tok;
    list.forEach(x => { const pts = afterPts(x.p); if (pts.length > 1 && B) B.extend(L.latLngBounds(pts)); });
    if (B && B.isValid()) map.fitBounds(B, {paddingTopLeft: [20, 20], paddingBottomRight: [20, 20 + (isMobile() ? $('#pane').offsetHeight : 0)]});
    // המסלולים של היום נטענים מכלי ההיסטוריה (קובץ לכל קו), עד 60 שינויים
    list.forEach((x, i) => {
      const draw = lf => { if (tok !== FUT.tok) return; const cur = lf ? lineAt(lf, todayIso()) : null; drawChange(x, cur); if (FUT.sel === x.rd) futFocus(x.rd, false); };
      if (x.kind === 'chg' && i < 60) lineFile(x.rd).then(draw, () => draw(null)); else draw(null);
    });
  }).catch(e => { console.warn(e); if (out) out.innerHTML = '<div class="note warn">נתוני השינויים העתידיים לא זמינים כרגע.</div>'; });
}
const afterPts = p => p.shp ? decodePoly(p.shp) : (p.stopinfo || []).map(s => [s[2], s[3]]);
function cityBoundsOf(city) {
  const H = (byId.hoods.items || []).filter(h => h.p.city === city); if (!H.length) return null;
  return H.reduce((m, h) => m.extend(bbOf(h)), L.latLngBounds(bbOf(H[0]).getSouthWest(), bbOf(H[0]).getNorthEast()));
}
// הקטעים במסלול a שרחוקים יותר מ-tol מטר מכל נקודה במסלול b (קירוב מישורי מקומי) — "החלק שמשתנה"
function diffRuns(a, b, tol) {
  if (!a || a.length < 2 || !b || b.length < 2) return [];
  const M = 111320, kx = Math.cos(a[0][0] * Math.PI / 180) * M, P = q => [q[1] * kx, q[0] * M];
  const Bp = b.map(P), t2 = tol * tol;
  const near = q => { const [x, y] = P(q);
    for (let i = 1; i < Bp.length; i++) {
      const [x1, y1] = Bp[i - 1], [x2, y2] = Bp[i], dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2)) : 0, ex = x1 + t * dx - x, ey = y1 + t * dy - y;
      if (ex * ex + ey * ey <= t2) return true;
    }
    return false; };
  const far = a.map(q => !near(q)), runs = [];
  let cur = null;
  far.forEach((f, i) => {
    if (f) { if (!cur) { cur = i > 0 ? [a[i - 1]] : []; runs.push(cur); } cur.push(a[i]); }
    else if (cur) { cur.push(a[i]); cur = null; }
  });
  return runs.filter(r => r.length > 1);
}
// ציור שינוי אחד לשכבת futG. כל הישויות של השינוי נשמרות ב-FUT.lays[rd] לעמעום ולהדגשה
function drawChange(x, cur, add, rem) {
  (FUT.lays[x.rd] || []).forEach(o => futG.removeLayer(o.lay));
  const col = FKIND[x.kind][1], after = afterPts(x.p), ls = [];
  const put = (lay, base) => { futG.addLayer(lay); ls.push({lay, base}); };
  const tip = `קו ${esc(x.p.line)} · ${FKIND[x.kind][0]} · ${fmtD(x.p.start)}`;
  if (cur && cur.shape.length > 1) put(L.polyline(cur.shape, {color: '#475569', weight: 3, opacity: 0.8, dashArray: '7 6'}).bindTooltip(`${tip} — המסלול היום`, {sticky: true}), {opacity: 0.8});
  if (after.length > 1) {
    const runs = cur && cur.shape.length > 1 ? diffRuns(after, cur.shape, 35) : [];
    const minus = cur && cur.shape.length > 1 && after.length > 1 ? diffRuns(cur.shape, after, 35) : [];
    put(L.polyline(after, {color: col, weight: 3, opacity: 0.85}).bindTooltip(`${tip} — המסלול החדש`, {sticky: true}), {opacity: 0.85});
    // הקטע שמשתנה: הילה רחבה ומעליה קו עבה (בקטע שנוסף — בצבע השינוי, בקטע שיורד — אדום מקווקו)
    runs.forEach(r => { put(L.polyline(r, {color: col, weight: 14, opacity: 0.28, interactive: false}), {opacity: 0.28}); put(L.polyline(r, {color: col, weight: 6, opacity: 1}).bindTooltip(`${tip} — הקטע החדש`, {sticky: true}), {opacity: 1}); });
    minus.forEach(r => put(L.polyline(r, {color: '#dc2626', weight: 5, opacity: 0.9, dashArray: '6 5'}).bindTooltip(`${tip} — קטע שיוצא מהמסלול`, {sticky: true}), {opacity: 0.9}));
    x.nDiff = runs.length + minus.length;
    x.focusB = runs.concat(minus).length ? L.latLngBounds([].concat(...runs, ...minus)) : L.latLngBounds(after);
    if (cur && cur.shape.length > 1 && !runs.length && !minus.length) x.focusB.extend(L.latLngBounds(cur.shape));
  }
  (add || []).forEach(s => put(L.circleMarker([s[2], s[3]], {radius: 6, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1}).bindTooltip(`נוספת: ${esc(s[1])} (${esc(s[0])})`), {opacity: 1, fillOpacity: 1}));
  (rem || []).forEach(s => put(L.circleMarker([s[2], s[3]], {radius: 6, color: '#dc2626', weight: 2.5, fillColor: '#fff', fillOpacity: 1}).bindTooltip(`יורדת: ${esc(s[1])} (${esc(s[0])})`), {opacity: 1, fillOpacity: 1}));
  ls.forEach(o => o.lay.on('click', () => futOpen(x.rd)));
  FUT.lays[x.rd] = ls;
}
// הדגשת שינוי אחד ועמעום השאר; zoom — זום לקטע שמשתנה
function futFocus(rd, zoom) {
  Object.entries(FUT.lays || {}).forEach(([r, ls]) => ls.forEach(o => {
    const on = !rd || r === rd;
    o.lay.setStyle({opacity: on ? o.base.opacity : o.base.opacity * 0.18, fillOpacity: o.base.fillOpacity == null ? undefined : on ? o.base.fillOpacity : 0.15});
    if (on && rd && o.lay.bringToFront) o.lay.bringToFront();
  }));
  const x = (FUT.items || []).find(y => y.rd === rd);
  if (zoom && x && x.focusB && x.focusB.isValid()) {
    if (isMobile()) $('#pane').style.height = '42vh';
    setTimeout(() => { map.invalidateSize(); const ph = isMobile() ? $('#pane').offsetHeight : 0; map.fitBounds(x.focusB, {paddingTopLeft: [40, 40], paddingBottomRight: [40, 40 + ph], maxZoom: 17}); }, 60);
  }
}
// בזמן הצגת שינויים לפי עיר מסתירים את שאר השכבות, כדי שרק השינויים ייראו; ביציאה מחזירים
function futHide(on) {
  if (FUT.hidden === on) return; FUT.hidden = on;
  LAYERS.forEach(l => { if (!l.on) return; [l.lg, l.labG].forEach(g => { if (!g) return; if (on) map.removeLayer(g); else g.addTo(map); }); });
  [lvG, svG, areaG].forEach(g => { if (on) g.clearLayers(); });
  if (!on && byId.walk.on) drawWalk();
}
// לחיצה על שינוי: לפני (מקווקו, המסלול של היום מכלי ההיסטוריה) ואחרי (רציף), והפירוט בניסוח של הכלי
function futOpen(rd) {
  FUT.sel = rd;
  $$('#fu-out .fch').forEach(o => o.classList.toggle('on', o.dataset.rd === rd));
  Promise.all([plans(), lineFile(rd).catch(() => null)]).then(([P, lf]) => {
    const p = P[rd]; if (!p) return;
    const cur = lf ? lineAt(lf, todayIso()) : null;
    const k = p.kind === 'route' || cur ? 'chg' : 'add';
    const plan = p.stopinfo || [], base = cur ? cur.stops : [];
    const pc = new Set(plan.map(s => String(s[0]))), bc = new Set(base.map(s => String(s[0])));
    const add = cur ? plan.filter(s => !bc.has(String(s[0]))) : [], rem = cur ? base.filter(s => !pc.has(String(s[0]))) : [];
    const x = (FUT.items || []).find(y => y.rd === rd) || {rd, p, kind: k};
    drawChange(x, cur, add, rem);
    futFocus(rd, true);
    const names = arr => arr.slice(0, 12).map(s => `${esc(s[1])} (${esc(s[0])})`).join(', ') + (arr.length > 12 ? ` ועוד ${arr.length - 12}` : '');
    const det = $(`#fu-out [data-det="${CSS.escape(rd)}"]`);
    if (det) det.innerHTML = `<div class="fd">${cur ? (add.length || rem.length ? `${add.length ? `<div>➕ בתוכנית נוספו: ${names(add)}</div>` : ''}${rem.length ? `<div>➖ בתוכנית ירדו: ${names(rem)}</div>` : ''}` : '<div>🟰 רצף התחנות שתוכנן זהה למסלול שנוסע היום — השינוי בשרטוט בלבד</div>' + (x.nDiff ? `<div>🗺️ הקטע שמשתנה מודגש במפה (${num(x.nDiff)} קטעים)</div>` : '<div class="mut">השרטוט שפורסם לתוכנית זהה לשרטוט של היום (בדיוק של 35 מ\') — אין קטע שונה להדגיש.</div>')) : plan.length > 1 ? `<div>🗺️ המסלול שתוכנן: מ${esc(plan[0][1])} עד ${esc(plan[plan.length - 1][1])}</div>` : ''}<div class="mut">פורסם לראשונה בלו"ז ${fmtD(p.first)} · נראה לאחרונה ${fmtD(p.last)} · <a href="../line-history/#${encodeURIComponent(rd)}" target="_blank" rel="noopener">היסטוריית הקו ↗</a></div></div>`;
  });
}
$('#futview').addEventListener('change', e => { if (e.target.id === 'fu-city') { FUT.city = e.target.value.trim(); FUT.sel = null; renderFuture(); } });
$('#futview').addEventListener('click', e => { if (e.target.closest('a')) return; const o = e.target.closest('.fch'); if (o) futOpen(o.dataset.rd); });

// תאריך עתידי בתחנה: הקווים של היום, ועליהם התוכניות שנכנסות עד התאריך (וריאנט חדש שעוצר בתחנה, או שינוי תחנות
// של וריאנט קיים — אם התחנה ירדה ממנו, הוא יורד מהרשימה)
function futureAtStop(code, iso, base) {
  return plans().then(P => {
    const out = base.slice();
    Object.entries(P).forEach(([rd, p]) => {
      if (!p.start || p.start > iso) return;
      const has = (p.codes || []).includes(code), i = out.findIndex(x => x.rd === rd);
      if (has && i < 0) out.push({line: p.line, rd, op: p.op, dest: p.long, tt: p.tt || 'bus', plan: p.start});
      else if (!has && i >= 0) out.splice(i, 1);
      else if (has && i >= 0) out[i].plan = p.start;
    });
    return out;
  });
}
const lastPlanDate = () => plans().then(P => Object.values(P).reduce((m, p) => p.start && p.start > m ? p.start : m, todayIso()));
// ---------------------------------------------------------------- שכבות משרד התחבורה מהקטלוג
function addCatalog(cat) {
  CATALOG = cat;
  (cat.layers || []).forEach(c => {
    const g = c.group === 'תכניות עתידיות' ? G_FUT : G_NOW;
    reg({id: 'mot:' + c.id, title: c.title, group: g, topic: c.topic || 'אחר', kind: 'geojson', url: 'data/' + c.file, count: c.count, geom: c.geom,
      src: c.source, modified: c.modified, sw: hashColor(c.id), icon: motIcon(c.title, g === G_FUT), marker: c.geom === 'Point' && (c.count || 0) <= ICONMAX,
      style: () => ({color: hashColor(c.id), weight: c.geom === 'LineString' ? 2.5 : 1.2, fillColor: hashColor(c.id), fillOpacity: c.geom === 'Polygon' ? 0.25 : 0.9, opacity: 0.9}),
      link: () => [c.source, 'המאגר ב-data.gov.il']});
  });
}

// ---------------------------------------------------------------- ערכת צבעים
function setTheme(t) { if (t === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme; lsSet('gis.theme', t); }
$('#theme').onclick = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');

// ---------------------------------------------------------------- מצב נשמר (שכבות פעילות, תצוגה)
function saveState() {
  lsSet('gis.on', JSON.stringify(LAYERS.filter(l => l.on).map(l => l.id)));
  const c = map.getCenter();
  history.replaceState(null, '', `#${map.getZoom()}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`);
}
map.on('moveend', saveState);

// ---------------------------------------------------------------- הפעלה
{ const b = lsGet('gis.base', 'light'); setBase(BASES[b] ? b : 'light'); }
load('data/own/meta.json').then(d => { OWNMETA = d; }).catch(() => {});
Promise.all([load('data/catalog.json').then(addCatalog).catch(() => { CATALOG = null; }), load('data/hist/meta.json').then(d => { HMETA = d; }).catch(() => {})]).then(() => {
  // סדר השכבות שנשמר (גרירה בעץ / הבא לחזית)
  { let ord = null; try { ord = JSON.parse(lsGet('gis.order', 'null')); } catch (e) {}
    if (Array.isArray(ord)) { const pos = new Map(ord.map((id, i) => [id, i])), orig = new Map(LAYERS.map((l, i) => [l, i]));
      LAYERS.sort((a, b) => (pos.has(a.id) && pos.has(b.id) ? pos.get(a.id) - pos.get(b.id) : orig.get(a) - orig.get(b))); } }
  renderTree(); renderLyrTop();
  const m = location.hash.match(/^#(\d+)\/([\d.]+)\/([\d.]+)/);
  if (m) map.setView([+m[2], +m[3]], +m[1]);
  let on = null; try { on = JSON.parse(lsGet('gis.on', 'null')); } catch (e) {}
  (on && on.length ? on : ['terminals', 'rail']).forEach(id => { if (byId[id]) setVisible(byId[id], true); });
  if (isMobile()) closePane(); else openPane('layers');
  syncOv(); showView(); showCoord(map.getCenter());
});
window.GIS = {identify, diffRuns, lineAt, afterPts, plans, selectHood, byId, map, setVisible, openTable, setRadius, toITM, setSel, SEL, openPane, hitTest, setDate, openLineView, openStopView, setArea};
})();
