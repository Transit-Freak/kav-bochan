// איפה האוטובוס נתקע — מהירות האוטובוסים לפי מקום ושעה (נתוני דאטאבוס, tools/bus_speed.py).
// אריחים (data/t/<y>_<x>.json): [רוחב, אורך, כיוון, דגימות, "מהירויות א'–ה' לכל שעה", "שישי", צומת, הקו לאורך הכביש].
// יישובים (data/cities.json): [יישוב, תושבים, דגימות, רוחב, אורך, [מהירות בכל שעה]].
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const D = 'data/';
const S = { h: 8, d: 'wd', dsel: [], m: 'sp', tool: null, spot: null, csort: 'slow', cgrp: 'all', lay: { sp: 1, bn: 0 } };
const MINZ = 13;   // מתחת לזה — עיגול לכל יישוב
let META = null, CITIES = [], TILE = 0.05;
const tiles = new Map();          // מפתח אריח → רשומות (או Promise בזמן טעינה)
const fmt = h => String(h).padStart(2, '0') + ':00';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = n => n == null ? '—' : Number(n).toLocaleString('he-IL');

// ---------- צבעים ----------
const SP = [[8, '#7f1d1d'], [12, '#dc2626'], [16, '#f97316'], [20, '#facc15'], [28, '#a3e635'], [40, '#22c55e'], [999, '#15803d']];
const SL = [[10, '#15803d'], [25, '#84cc16'], [40, '#facc15'], [55, '#f97316'], [70, '#dc2626'], [999, '#7f1d1d']];
const colSp = v => v == null ? null : SP.find(x => v <= x[0])[1];
const colSl = p => p == null ? null : SL.find(x => p < x[0])[1];

// ---------- רשומה ----------
function hours(r, d) {                 // מחרוזת "35,71,,…" → מערך 24 (null = מעט מדי); d: wd / fr / y (הימים שנבחרו)
  if (d === 'y') return dayHours(r);
  const k = d === 'fr' ? 5 : 4;
  if (!r['_' + k]) { const a = (r[k] || '').split(','); r['_' + k] = Array.from({ length: 24 }, (_, i) => a[i] ? +a[i] : null); }
  return r['_' + k];
}
// המהירות הרגילה כשאין עומס — הבסיס להאטה: ממוצע שלוש השעות המהירות ביום (06:00–21:00). לא הלילה, שבו
// הכבישים ריקים והכל היה נצבע אדום, ולא שעה אחת חריגה
const best = a => {
  const v = a.slice(6, 22).filter(x => x != null).sort((x, y) => y - x).slice(0, 3);
  return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length * 10) / 10 : null;
};
function slowPct(a, h) { const b = best(a); return a[h] == null || !b ? null : Math.max(0, Math.round(100 * (1 - a[h] / b))); }
// "לפי יום": הימים שנבחרו (S.dsel). כמה ימים — ממוצע שלהם בכל שעה. מושווים לממוצע החודשי של אותו סוג יום
const DD = () => (META && META.dd) || [];
const ytype = () => S.dsel.length && S.dsel.every(d => (DD().find(x => x[0] === d) || [])[1] === 'fr') ? 'fr' : 'wd';
function dayHours(r) {
  const key = '_y' + S.dsel.join();
  if (!r[key] || !S.dsel.every(d => r._dd && d in r._dd)) {   // לא שומרים תוצאה לפני שכל הימים נטענו
    const arrs = S.dsel.map(d => ((r._dd || {})[d] || '').split(','));
    r[key] = Array.from({ length: 24 }, (_, h) => {
      const v = arrs.map(a => a[h]).filter(x => x).map(Number);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    });
  }
  return r[key];
}
const dtiles = new Map();   // "תאריך/אריח" → Promise
function loadDays(ks) {     // מהירויות הימים שנבחרו לאריחים שבתצוגה — מוצמדות לרשומות לפי הסדר באריח
  return Promise.all(ks.flatMap(k => S.dsel.map(d => {
    const id = d + '/' + k;
    if (!dtiles.has(id)) dtiles.set(id, Promise.all([loadTile(k), fetch(D + 'd/' + id + '.json').then(r => r.json()).catch(() => [])]).then(([recs, arr]) => {
      recs.forEach((r, i) => { (r._dd = r._dd || {})[d] = arr[i] || ''; });
    }));
    return dtiles.get(id);
  })));
}
const baseD = () => S.d === 'y' ? ytype() : S.d;
// האטה של אתמול: לעומת הממוצע החודשי באותה שעה — כך רואים מה היה חריג באותו יום
function yPct(r, h) {
  const y = hours(r, 'y')[h], m = hours(r, ytype())[h];
  return y == null || !m ? null : Math.max(0, Math.round(100 * (1 - y / m)));
}
function color(r) {
  const a = hours(r, S.d);
  if (S.m === 'sp') return colSp(a[S.h]);
  return colSl(S.d === 'y' ? yPct(r, S.h) : slowPct(a, S.h));
}
const DIRS = ['צפון', 'צפון-מזרח', 'מזרח', 'דרום-מזרח', 'דרום', 'דרום-מערב', 'מערב', 'צפון-מערב'];
const dirName = b => DIRS[Math.round(b / 45) % 8];

// ---------- מפה ----------
// מפת הרקע — OpenStreetMap, כמו בשאר הכלים באתר (בערכה הכהה — היפוך צבעים ב-CSS)
const BASE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 7, maxZoom: 19 }).setView([31.9, 34.95], 8);
let base = null;
function setBase() {
  if (base) map.removeLayer(base);
  base = L.tileLayer(BASE, { maxZoom: 19, attribution: '© תורמי <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
}
setBase();
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
const rend = L.canvas({ padding: 0.3, tolerance: 6 });
const segG = L.layerGroup().addTo(map), cityG = L.layerGroup().addTo(map), hiG = L.layerGroup().addTo(map);
const shown = new Map();   // רשומה → קו במפה

function geom(r) {
  // הקו לאורך הכביש (מסלול הקו ב-GTFS), מוזז 5 מ' לימין — כל כיוון בצד שלו של הכביש
  if (r[7]) {
    if (!r._g) {
      const e = r[7], p = [[e[0] / 1e5, e[1] / 1e5]];
      for (let i = 2; i < e.length; i += 2) { const q = p[p.length - 1]; p.push([q[0] + e[i] / 1e5, q[1] + e[i + 1] / 1e5]); }
      r._g = shift(p, 5);
    }
    return r._g;
  }
  // אין מסלול שעובר כאן — קו ישר של ~100 מ' לאורך כיוון הנסיעה (בצומת — 50 מ')
  const [la, lo, b] = r, L2 = r[6] ? 24 : 48, t = b * Math.PI / 180, kx = 111320 * Math.cos(la * Math.PI / 180), ky = 111320;
  const ex = Math.sin(t), ny = Math.cos(t), rx = Math.cos(t), ry = -Math.sin(t);
  const p = s => [la + (ny * s + ry * 6) / ky, lo + (ex * s + rx * 6) / kx];
  return [p(-L2), p(L2)];
}
function shift(p, m) {      // הזזת קו שבור m מטרים ימינה מכיוון הנסיעה
  const k = Math.cos(p[0][0] * Math.PI / 180), out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    const dy = (b[0] - a[0]), dx = (b[1] - a[1]) * k, d = Math.hypot(dx, dy) || 1;
    // הנורמל הימני של (dx, dy) הוא (dy, -dx)
    out.push([p[i][0] - dx / d * m / 111320, p[i][1] + dy / d * m / (111320 * k)]);
  }
  return out;
}
const tkey = (la, lo) => `${Math.floor(la / TILE)}_${Math.floor(lo / TILE)}`;
function needTiles(set) {
  const b = map.getBounds(), out = [];
  for (let y = Math.floor(b.getSouth() / TILE); y <= Math.floor(b.getNorth() / TILE); y++)
    for (let x = Math.floor(b.getWest() / TILE); x <= Math.floor(b.getEast() / TILE); x++) {
      const k = `${y}_${x}`;
      if ((set || META.tilesSet).has(k)) out.push(k);
    }
  return out;
}
async function loadTile(k) {
  if (!tiles.has(k)) tiles.set(k, fetch(D + 't/' + k + '.json').then(r => r.json()).then(a => { tiles.set(k, a); return a; }).catch(() => { tiles.set(k, []); return []; }));
  return tiles.get(k);
}
let drawSeq = 0;
async function draw() {
  if (!META) return;
  const z = map.getZoom(), seq = ++drawSeq;
  $('#s-zoom').textContent = z;
  if (z < MINZ) {
    segG.clearLayers(); shown.clear();
    drawCities();
    msg('התקרבו למפה כדי לראות כל רחוב');
    summary([]);
    return;
  }
  cityG.clearLayers();
  const ks = needTiles();
  if (ks.length > 30) { msg('התקרבו עוד קצת'); return; }
  msg(ks.some(k => !Array.isArray(tiles.get(k))) ? 'טוען…' : '');
  const all = (await Promise.all(ks.map(loadTile))).flat();
  if (S.d === 'y') await loadDays(ks);
  if (seq !== drawSeq) return;
  msg('');
  const b = map.getBounds().pad(0.15), w = z >= 16 ? 5 : z >= 15 ? 4 : 3;
  const vis = new Set();
  for (const r of S.lay.sp ? all : []) {
    if (!b.contains([r[0], r[1]])) continue;
    if (!r[7] && r[6]) continue;   // צומת בלי מסלול שעובר בו — קו ישר שם נראה כמו X
    vis.add(r);
    const c = color(r);
    let ln = shown.get(r);
    if (!ln) {
      ln = L.polyline(geom(r), { renderer: rend, weight: w, opacity: .95, lineCap: 'butt', lineJoin: 'round', color: c || '#94a3b8' });
      ln.on('click', () => pick(r));
      ln.on('mouseover', () => ln.bindTooltip(tip(r), { sticky: true }).openTooltip());
      shown.set(r, ln); segG.addLayer(ln);
    } else ln.setStyle({ color: c || '#94a3b8', weight: w });
    ln.setStyle({ opacity: c ? .95 : .25 });
  }
  for (const [r, ln] of shown) if (!vis.has(r)) { segG.removeLayer(ln); shown.delete(r); }
  summary([...vis]);
  drawBunch(seq);
}

// ---------- שכבת ההתקבצות ----------
// לכל תחנה: כמה זוגות של שני אוטובוסים עוקבים של אותו קו הגיעו צמודים — פחות מ-30% מהמרווח המתוכנן
// (אותה הגדרה כמו במדד דיוק האוטובוסים). [רוחב, אורך, מק"ט, שם, זוגות, צמודים, רווח כפול, "זוגות לשעה", "צמודים לשעה", קווים]
let BMETA = null;
const btiles = new Map(), bshown = new Map();
const bunG = L.layerGroup().addTo(map);
const BN = [[5, '#15803d'], [10, '#84cc16'], [20, '#facc15'], [30, '#f97316'], [999, '#dc2626']];
const colBn = p => p == null ? null : BN.find(x => p < x[0])[1];
function bhours(b) {   // [זוגות, צמודים] לכל שעה
  if (!b._h) { const n = (b[7] || '').split(','), k = (b[8] || '').split(','); b._h = Array.from({ length: 24 }, (_, i) => [+(n[i] || 0), +(k[i] || 0)]); }
  return b._h;
}
const bpct = (b, h) => { const [n, k] = bhours(b)[h]; return n >= 5 ? Math.round(100 * k / n) : null; };
async function drawBunch(seq) {
  if (!S.lay.bn || map.getZoom() < MINZ) { bunG.clearLayers(); bshown.clear(); return; }
  if (!BMETA) BMETA = await fetch(D + 'bunch.json').then(r => r.json()).catch(() => ({ tiles: [] }));
  const set = new Set(BMETA.tiles), ks = needTiles(set);
  const all = (await Promise.all(ks.map(k => {
    if (!btiles.has(k)) btiles.set(k, fetch(D + 'b/' + k + '.json').then(r => r.json()).catch(() => []).then(a => { btiles.set(k, a); return a; }));
    return btiles.get(k);
  }))).flat();
  if (seq !== drawSeq) return;
  const bb = map.getBounds().pad(0.15), vis = new Set();
  for (const b of all) {
    if (!bb.contains([b[0], b[1]])) continue;
    vis.add(b);
    let m = bshown.get(b);
    if (!m) {
      m = L.circleMarker([b[0], b[1]], { renderer: rend, radius: 6, weight: 1.5, color: '#0f172a' });
      m.on('click', () => pickStop(b));
      m.on('mouseover', () => m.bindTooltip(btip(b), { sticky: true }).openTooltip());
      bshown.set(b, m); bunG.addLayer(m);
    }
    styleB(b, m);
  }
  for (const [b, m] of bshown) if (!vis.has(b)) { bunG.removeLayer(m); bshown.delete(b); }
}
function styleB(b, m) {
  const p = bpct(b, S.h), c = colBn(p);
  m.setStyle({ fillColor: c || '#cbd5e1', fillOpacity: c ? .95 : .5, opacity: c ? 1 : .4, radius: c ? 6 : 4 });
}
function btip(b) {
  const p = bpct(b, S.h), [n, k] = bhours(b)[S.h];
  return `<b>${esc(b[3] || 'תחנה')}</b> <small>(${b[2]})</small><br>${fmt(S.h)}: ${p == null ? 'מעט נסיעות' : `${p}% מהאוטובוסים הגיעו צמודים (${k} מתוך ${n})`}<br><small>לחיצה — כל שעות היום והקווים</small>`;
}
function pickStop(b) {
  lastPick = Date.now();
  S.spot = { stop: b };
  hiG.clearLayers();
  L.circleMarker([b[0], b[1]], { renderer: rend, radius: 13, color: '#0ea5e9', weight: 3, fill: false, interactive: false }).addTo(hiG);
  tool('spot');
}
function stopPane(b) {
  const H = bhours(b), pct = H.map(([n, k]) => n >= 5 ? Math.round(100 * k / n) : null);
  const W = 300, Ht = 110, P = 18, mx = Math.max(30, ...pct.filter(x => x != null));
  const x = h => P + h * (W - P - 4) / 24, y = v => Ht - 16 - v / mx * (Ht - 26);
  let g = `<svg class="chart" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="התקבצות לפי שעה">`;
  for (const t of [10, 20, 30, 40, 50].filter(t => t < mx)) g += `<line class="ax" x1="${P}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="0" y="${y(t) + 3}">${t}%</text>`;
  pct.forEach((v, h) => { if (v != null) g += `<rect x="${x(h) + 1}" y="${y(v)}" width="${(W - P) / 24 - 2.5}" height="${Ht - 16 - y(v)}" fill="${colBn(v)}"><title>${fmt(h)} · ${v}% (${H[h][1]} מתוך ${H[h][0]})</title></rect>`; });
  g += `<rect x="${x(S.h)}" y="2" width="${(W - P) / 24}" height="${Ht - 18}" fill="none" stroke="#0ea5e9" stroke-width="1.5"/>`;
  for (const h of [0, 6, 12, 18, 23]) g += `<text x="${x(h)}" y="${Ht - 3}">${String(h).padStart(2, '0')}</text>`;
  g += '</svg>';
  const tot = b[4], pb = Math.round(100 * b[5] / tot), pg = Math.round(100 * b[6] / tot);
  return `<div class="blk"><h3>${esc(b[3] || 'תחנה')} <span class="mut">· ${b[2]}</span></h3>` +
    `<div class="mut sm">התקבצות — אחוז הפעמים ששני אוטובוסים עוקבים של אותו קו הגיעו צמודים (פחות משליש מהמרווח שבלו"ז)</div>${g}` +
    `<div class="kv"><span>${fmt(S.h)}</span><b>${pct[S.h] == null ? 'מעט נסיעות' : pct[S.h] + '%'}</b>` +
    `<span>כל היום, ימי חול</span><b>${pb}% צמודים · ${pg}% מרווח כפול</b><span>זוגות שנבדקו</span><b>${num(tot)}</b></div></div>` +
    (b[9] && b[9].length ? `<div class="blk"><h3>הקווים שמתקבצים כאן הכי הרבה</h3><table class="t bt"><thead><tr><th>קו</th><th>לכיוון</th><th>צמודים</th></tr></thead><tbody>` +
      b[9].map(([ln, to, n, k]) => `<tr><td><b>${esc(ln)}</b></td><td>${esc(to)}</td><td class="n">${n ? Math.round(100 * k / n) : 0}% <span class="mut">(${k}/${n})</span></td></tr>`).join('') + '</tbody></table></div>' : '') +
    `<div class="note">"מרווח כפול" — הפער בפועל גדול פי 2 ומעלה מהמתוכנן: הנוסעים חיכו הרבה, ואז הגיעו שניים יחד. מקור: אותו חישוב של מדד דיוק האוטובוסים, ${BMETA && BMETA.days ? BMETA.days.length : ''} ימי חול אחרונים.</div>`;
}
function layersPane() {
  const it = [['sp', 'מהירות האוטובוסים', 'הצבע לאורך הכביש — כמה מהר נוסעים בכל קטע'], ['bn', 'התקבצות בתחנות', 'עיגול לכל תחנה — כמה פעמים שני אוטובוסים של אותו קו הגיעו צמודים']];
  $('#layers').innerHTML = `<div class="blk">${it.map(([k, t, d]) => `<label class="lyr"><input type="checkbox" data-l="${k}"${S.lay[k] ? ' checked' : ''}><span><b>${t}</b><br><small class="mut">${d}</small></span></label>`).join('')}</div>` +
    `<div class="note">שתי השכבות יחד מראות איפה האוטובוס גם איטי וגם מתקבץ — שם בדרך כלל נת"צ או עדיפות ברמזור עוזרים הכי הרבה.</div>`;
}
$('#layers').addEventListener('change', e => {
  const k = e.target.dataset.l; if (!k) return;
  S.lay[k] = e.target.checked ? 1 : 0;
  if (!S.lay.sp) { segG.clearLayers(); shown.clear(); }
  draw(); hash(); if (S.tool === 'legend') legendPane();
});
function tip(r) {
  const a = hours(r, S.d), v = a[S.h];
  let t = `<b>לכיוון ${dirName(r[2])}</b><br>${S.d === 'y' ? ylabel() + ', ' : ''}${fmt(S.h)}: ${v == null ? 'מעט נסיעות' : v + ' קמ"ש'}`;
  if (S.d === 'y') { const m = hours(r, ytype())[S.h]; if (m != null) t += ` · בממוצע ${m}`; }
  else if (v != null && S.m === 'sl') t += ` · ${slowPct(a, S.h)}% לאט יותר מבלי עומס`;
  return t + '<br><small>לחיצה — השעות העמוסות והמעבר כולו</small>';
}
function recolor() {
  if (map.getZoom() < MINZ) return drawCities();
  for (const [b, m] of bshown) styleB(b, m);
  for (const [r, ln] of shown) { const c = color(r); ln.setStyle({ color: c || '#94a3b8', opacity: c ? .95 : .25 }); }
  summary([...shown.keys()]);
}
function drawCities() {
  cityG.clearLayers();
  for (const c of CITIES) {
    const a = c[5], v = a[S.h], col = S.m === 'sp' ? colSp(v) : colSl(slowPct(a, S.h));
    if (!col) continue;
    const r = Math.max(4, Math.min(16, Math.sqrt((c[1] || c[2] / 30) / 1000) * 1.1));
    L.circleMarker([c[3], c[4]], { renderer: rend, radius: r, color: '#0f172a', weight: 1, fillColor: col, fillOpacity: .85 })
      .bindTooltip(`<b>${esc(c[0])}</b><br>${fmt(S.h)}: ${v} קמ"ש` + (c[1] ? `<br>${num(c[1])} תושבים` : ''))
      .on('click', () => map.setView([c[3], c[4]], 14)).addTo(cityG);
  }
}
function msg(t) { $('#s-msg').textContent = t; }

// סיכום מה שבתצוגה
function summary(rs) {
  const el = $('#viewsum');
  if (!rs.length) { el.innerHTML = '<div class="mut">' + (map.getZoom() < MINZ ? 'מוצגים היישובים. התקרבו כדי לראות כל רחוב.' : 'אין נתונים בתחום המפה') + '</div>'; return; }
  let n = 0, s = 0, slow = 0;
  for (const r of rs) { const v = hours(r, S.d)[S.h]; if (v == null) continue; n++; s += v; if (v < 12) slow++; }
  el.innerHTML = `<h3>בתחום המפה, ${fmt(S.h)}</h3><div class="kv"><span>מקטעים עם נתונים</span><b>${num(n)}</b>` +
    `<span>מהירות ממוצעת</span><b>${n ? (s / n).toFixed(1) + ' קמ"ש' : '—'}</b><span>מתחת ל-12 קמ"ש</span><b>${n ? Math.round(100 * slow / n) + '%' : '—'}</b></div>`;
}

// ---------- מקום נבחר ----------
function pick(r) {
  lastPick = Date.now();
  // הכיוון ההפוך באותו רחוב: רשומה קרובה (עד 110 מ') שכיוונה הפוך (הפרש 135° ומעלה)
  let opp = null, bd = 110;
  for (const q of shown.keys()) {
    if (q === r) continue;
    const dd = Math.abs(((q[2] - r[2] + 540) % 360) - 180);
    if (dd < 135) continue;
    const d = map.distance([r[0], r[1]], [q[0], q[1]]);
    if (d < bd) { bd = d; opp = q; }
  }
  const cor = corridor(r);
  S.spot = { r, opp, cor };
  hiG.clearLayers();
  for (const q of cor.segs) if (q !== r) L.polyline(geom(q), { renderer: rend, weight: 9, color: '#0ea5e9', opacity: .18, interactive: false }).addTo(hiG);
  for (const q of [r, opp].filter(Boolean)) L.polyline(geom(q), { renderer: rend, weight: 11, color: '#0ea5e9', opacity: .35, interactive: false }).addTo(hiG);
  tool('spot');
}

// ---------- המעבר כולו ----------
// קטע אחד הוא 100 מ'. כדי לראות את התמונה המלאה (למשל: מהר על הגשר, ותקוע ברמזור מיד אחריו) — ממשיכים
// לאורך הרחוב באותו כיוון: הקטע הבא מתחיל איפה שהקודם נגמר (עד 30 מ') וכיוונו דומה. עד ~1 ק"מ לכל צד.
const segLen = q => { const g = geom(q); let d = 0; for (let i = 1; i < g.length; i++) d += map.distance(g[i - 1], g[i]); return d; };
const brg = (a, b) => (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI + 360) % 360;
const adiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
function loaded() { const out = []; for (const v of tiles.values()) if (Array.isArray(v)) for (const r of v) out.push(r); return out; }
function corridor(r) {
  const all = loaded().filter(q => q[7] && map.distance([r[0], r[1]], [q[0], q[1]]) < 1500);
  if (!r[7]) return { segs: [r] };
  const endB = q => { const g = geom(q); return brg(g[g.length - 2], g[g.length - 1]); };
  const startB = q => { const g = geom(q); return brg(g[0], g[1]); };
  const step = (cur, fwd) => {
    const g = geom(cur), p = fwd ? g[g.length - 1] : g[0], b = fwd ? endB(cur) : startB(cur);
    let best = null, bd = 30;
    for (const q of all) {
      if (q === cur) continue;
      const h = geom(q), e = fwd ? h[0] : h[h.length - 1];
      if (adiff(fwd ? startB(q) : endB(q), b) > 50) continue;
      const d = map.distance(p, e);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  };
  const segs = [r], seen = new Set([r]);
  for (const fwd of [true, false]) {
    let cur = r, len = 0;
    while (len < 1000) {
      const q = step(cur, fwd);
      if (!q || seen.has(q)) break;
      seen.add(q); fwd ? segs.push(q) : segs.unshift(q); len += segLen(q); cur = q;
    }
  }
  return { segs };
}
// מהירות המעבר כולו בכל שעה: האורך הכולל חלקי סכום הזמנים בכל קטע. רק כשיש נתונים ל-80% מהאורך לפחות
function corSpeeds(segs, d) {
  const L = segs.map(segLen), tot = L.reduce((a, b) => a + b, 0);
  return Array.from({ length: 24 }, (_, h) => {
    let len = 0, t = 0;
    segs.forEach((q, i) => { const v = hours(q, d)[h]; if (v) { len += L[i]; t += L[i] / (v / 3.6); } });
    return len >= 0.8 * tot && t ? Math.round(len / t * 3.6 * 10) / 10 : null;
  });
}
function chart(a, b) {      // עמודות לכל שעה; b — הכיוון ההפוך (קו)
  const W = 300, H = 120, P = 18, mx = Math.max(30, ...a.filter(x => x != null), ...(b || []).filter(x => x != null));
  const x = h => P + h * (W - P - 4) / 24, y = v => H - 16 - v / mx * (H - 26);
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="מהירות לפי שעה">`;
  for (const t of [10, 20, 30, 40, 50].filter(t => t < mx)) g += `<line class="ax" x1="${P}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="0" y="${y(t) + 3}">${t}</text>`;
  a.forEach((v, h) => { if (v != null) g += `<rect x="${x(h) + 1}" y="${y(v)}" width="${(W - P) / 24 - 2.5}" height="${H - 16 - y(v)}" fill="${colSp(v)}"><title>${fmt(h)} · ${v} קמ"ש</title></rect>`; });
  if (b) { const pts = b.map((v, h) => v == null ? null : `${x(h) + (W - P) / 48},${y(v)}`); let seg = []; pts.forEach(p => { if (p) seg.push(p); else { if (seg.length > 1) g += `<polyline class="cur" points="${seg.join(' ')}"/>`; seg = []; } }); if (seg.length > 1) g += `<polyline class="cur" points="${seg.join(' ')}"/>`; }
  g += `<rect x="${x(S.h)}" y="2" width="${(W - P) / 24}" height="${H - 18}" fill="none" stroke="#0ea5e9" stroke-width="1.5"/>`;
  for (const h of [0, 6, 12, 18, 23]) g += `<text x="${x(h)}" y="${H - 3}">${String(h).padStart(2, '0')}</text>`;
  return g + '</svg>';
}
// השעות העמוסות: שעות ביום (06:00–22:00) שבהן נוסעים לפחות 25% לאט יותר מהמהירות בלי עומס, כטווחים.
// רק כשיש נתונים לרוב שעות היום — אחרת אי אפשר לדעת
function busyHours(a) {
  const day = [];
  for (let h = 6; h <= 22; h++) if (a[h] != null) day.push(h);
  if (day.length < 10) return '<span class="mut">אין כאן מספיק נסיעות כדי לדעת מה השעות העמוסות</span>';
  const b = best(a), hs = day.filter(h => a[h] <= b * 0.75);
  if (!hs.length) return '<b>אין כאן שעה עמוסה במיוחד</b> — המהירות כמעט זהה כל היום';
  const rg = [];
  for (const h of hs) { const l = rg[rg.length - 1]; if (l && h === l[1] + 1) l[1] = h; else rg.push([h, h]); }
  return '<b>השעות העמוסות:</b> ' + rg.map(([x, y]) => `<bdi>${fmt(x)}–${fmt(y + 1)}</bdi>`).join(' · ');
}
// אתמול מול הממוצע החודשי: שעות שבהן נסעו לפחות 40% לאט יותר (ו-5 קמ"ש לפחות) — יום חריג
function odd(y, m) {
  const hs = [];
  for (let h = 5; h <= 23; h++) if (y[h] != null && m[h] && y[h] <= m[h] * 0.6 && m[h] - y[h] >= 5) hs.push(h);
  if (y.filter(v => v != null).length < 4) return `<span class="mut">${ylabel()}: מעט נסיעות כאן — אי אפשר לדעת</span>`;
  if (!hs.length) return `<b>${ylabel()}: יום רגיל</b> — בלי איטיות חריגה לעומת הממוצע`;
  return `<b>${ylabel()}: איטי מהרגיל</b> ` + hs.map(h => `<bdi>${fmt(h)} — ${y[h]} במקום ${m[h]}</bdi>`).join(' · ');
}
// המעבר כולו: מהירות וזמן לכל הקטעים הרצופים ברחוב, ופס צבעוני של הקטעים — מהקטע הראשון לאחרון
function corBlock(cor, r) {
  if (!cor || cor.segs.length < 3) return '';
  const segs = cor.segs, L = segs.map(segLen), tot = L.reduce((a, b) => a + b, 0), sp = corSpeeds(segs, S.d), v = sp[S.h];
  const strip = segs.map((q, i) => { const x = hours(q, S.d)[S.h]; return `<i style="flex:${L[i].toFixed(0)};background:${colSp(x) || '#cbd5e1'}"${q === r ? ' class="me"' : ''} title="${x == null ? 'מעט נסיעות' : x + ' קמ"ש'}"></i>`; }).join('');
  const day = sp.map((x, h) => [x, h]).filter(x => x[0] != null && x[1] >= 6 && x[1] <= 21).sort((a, b) => a[0] - b[0]);
  return `<div class="blk cor"><h3>המעבר כולו ברחוב לכיוון ${dirName(r[2])} — ${(tot / 1000).toFixed(1)} ק"מ</h3>` +
    `<div class="strip" dir="ltr">${strip}</div><div class="mut sm">כל פס הוא קטע; המסומן — הקטע שנבחר. משמאל לימין בכיוון הנסיעה.</div>` +
    `<div class="kv"><span>${fmt(S.h)}</span><b>${v == null ? 'מעט נתונים' : `${v} קמ"ש · ${Math.max(1, Math.round(tot / (v / 3.6) / 60))} דק'`}</b>` +
    (day.length ? `<span>הכי איטי ביום</span><b>${fmt(day[0][1])} · ${day[0][0]} קמ"ש · ${Math.round(tot / (day[0][0] / 3.6) / 60)} דק'</b>` : '') + `</div></div>`;
}
const dayName = ds => { const [y, m, d] = ds.split('-'); return `${'ראשון שני שלישי רביעי חמישי שישי שבת'.split(' ')[new Date(ds + 'T12:00').getDay()]} ${+d}.${+m}`; };
const dayShort = ds => { const [y, m, d] = ds.split('-'); return `${'אבגדהוש'[new Date(ds + 'T12:00').getDay()]}׳ ${+d}.${+m}`; };
const ylabel = () => S.dsel.length === 1 ? dayName(S.dsel[0]) : `${S.dsel.length} הימים שנבחרו`;
// "לפי יום": לוח שנה כמו במדד הדיוק — הימים שיש להם נתונים לחיצים; אפשר לסמן כמה ימים (ממוצע שלהם)
const HEM = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
let calYM = null;
function dayPicker() {
  const el = $('#dpick');
  if (S.d !== 'y' || !DD().length) { el.hidden = true; return; }
  el.hidden = false;
  const have = new Map(DD().map(([d, t]) => [d, t]));
  if (!calYM) { const d = S.dsel[0] || DD()[0][0]; calYM = [+d.slice(0, 4), +d.slice(5, 7) - 1]; }
  const [y, m] = calYM, nDays = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay(), mm = String(m + 1).padStart(2, '0');
  const cells = [];
  for (let i = 0; i < start; i++) cells.push('<span></span>');
  for (let day = 1; day <= nDays; day++) {
    const iso = `${y}-${mm}-${String(day).padStart(2, '0')}`;
    cells.push(have.has(iso) ? `<button class="cd${S.dsel.includes(iso) ? ' on' : ''}" data-dd="${iso}" title="${dayName(iso)}">${day}</button>` : `<span class="cd off">${day}</span>`);
  }
  const all = DD().map(x => x[0]).sort(), canPrev = all[0] < `${y}-${mm}-01`, canNext = all[all.length - 1] > `${y}-${mm}-${nDays}`;
  el.innerHTML = `<div class="calhead"><button class="cnav" data-nav="-1" title="חודש קודם" ${canPrev ? '' : 'disabled'}>‹</button><b>${HEM[m]} ${y}</b><button class="cnav" data-nav="1" title="חודש הבא" ${canNext ? '' : 'disabled'}>›</button></div>` +
    `<div class="calgrid">${['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(w => `<i>${w}׳</i>`).join('')}${cells.join('')}</div>` +
    `<div class="mut sm">${S.dsel.length === 1 ? dayName(S.dsel[0]) : `${S.dsel.length} ימים — מוצג הממוצע שלהם`}. אפשר לסמן כמה ימים. אפור: אין נתונים (שבת, או לפני ${dayShort(all[0])}).</div>`;
}
function spotPane() {
  const el = $('#spot');
  if (S.spot && S.spot.stop) { el.innerHTML = stopPane(S.spot.stop); return; }
  if (!S.spot) { el.innerHTML = '<div class="note">לחצו על קו במפה (בזום קרוב) כדי לראות את המהירות שם בכל שעות היום.</div>'; return; }
  const { r, opp, cor } = S.spot, yd = S.d === 'y';
  const one = (q, other) => {
    const a = hours(q, S.d), sl = a.map((v, h) => [v, h]).filter(x => x[0] != null).sort((p, q2) => p[0] - q2[0]);
    const worst = sl[0], top = best(hours(q, baseD())), busy = yd ? odd(a, hours(q, ytype())) : busyHours(a);
    return `<div class="blk"><div class="dirh"><span class="arr" style="transform:rotate(${q[2]}deg)">↑</span><h3>לכיוון ${dirName(q[2])}</h3></div>` +
      chart(a, yd ? hours(q, ytype()) : other ? hours(other, S.d) : null) +
      `<div class="busy">${busy}</div>` +
      `<div class="kv"><span>${fmt(S.h)}</span><b>${a[S.h] == null ? '—' : a[S.h] + ' קמ"ש'}</b>` +
      (worst ? `<span>השעה האיטית ביותר</span><b>${fmt(worst[1])} · ${worst[0]} קמ"ש</b>` : '') +
      (top ? `<span>בלי עומס (בשעות היום)</span><b>${top} קמ"ש</b>` : '') +
      `<span>דגימות (28 יום)</span><b>${num(q[3])}</b></div></div>`;
  };
  el.innerHTML = corBlock(cor, r) + one(r, opp) + (opp ? one(opp, r) : '') +
    `<div class="note">${yd ? `העמודות — ${ylabel()}; הקו הדק — הממוצע החודשי.` : opp ? 'הקו הדק בכל גרף הוא הכיוון השני.' : 'אין כאן מספיק נתונים לכיוון השני.'} המהירות כוללת עצירות בתחנות וברמזורים.` +
    ` <a href="https://www.google.com/maps?q=${r[0]},${r[1]}" target="_blank" rel="noopener">במפות Google</a></div>`;
}

// ---------- יישובים ----------
const GRPS = [['all', 'הכל'], ['200', 'מעל 200 אלף'], ['100', '100–200 אלף'], ['50', '50–100 אלף'], ['20', '20–50 אלף'], ['0', 'עד 20 אלף']];
const inGrp = (p, g) => g === 'all' || (p != null && (g === '200' ? p >= 2e5 : g === '100' ? p >= 1e5 && p < 2e5 : g === '50' ? p >= 5e4 && p < 1e5 : g === '20' ? p >= 2e4 && p < 5e4 : p < 2e4));
function cityRows() {
  return CITIES.filter(c => inGrp(c[1], S.cgrp)).map(c => {
    const a = c[5], top = best(a), day = a.map((v, h) => [v, h]).filter(x => x[0] != null && x[1] >= 6 && x[1] <= 20).sort((p, q) => p[0] - q[0]);
    const w = day[0];
    return { c, name: c[0], pop: c[1], now: a[S.h], worstH: w ? w[1] : null, worst: w ? w[0] : null, top,
      slow: w && top ? Math.round(100 * (1 - w[0] / top)) : null, nowSlow: slowPct(a, S.h) };
  });
}
function citiesPane() {
  const rows = cityRows();
  // יישוב — א'–ב'; שעה ושעה עמוסה — האיטי קודם; תושבים והאטה — הגדול קודם
  const k = S.csort, nn = v => v ?? -1;
  rows.sort(k === 'name' ? (p, q) => p.name.localeCompare(q.name, 'he')
    : k === 'now' || k === 'worstH' ? (p, q) => (p[k] ?? 999) - (q[k] ?? 999) : (p, q) => nn(q[k]) - nn(p[k]));
  const th = (key, t) => `<th data-k="${key}" class="${S.csort === key ? 's' : ''}">${t}</th>`;
  $('#cities').innerHTML = `<div class="blk"><div class="chips" id="cgrp">${GRPS.map(([v, t]) => `<button data-v="${v}" class="${S.cgrp === v ? 'on' : ''}">${t}</button>`).join('')}</div>` +
    `<div class="mut">משווים יישובים בגודל דומה (לפי מספר התושבים). ימי א׳–ה׳, 06:00–20:00.</div>` +
    `<div class="mut">מספר התושבים: רשות האוכלוסין וההגירה, <a href="https://data.gov.il/" target="_blank" rel="noopener">data.gov.il</a></div></div>` +
    `<div class="tw"><table class="t"><thead><tr>${th('name', 'יישוב')}${th('pop', 'תושבים')}${th('now', fmt(S.h))}${th('slow', 'האטה')}${th('worstH', 'שעת שיא')}</tr></thead><tbody>` +
    rows.map(r => `<tr data-c="${esc(r.name)}"><td>${esc(r.name)}</td><td class="n">${r.pop ? num(r.pop) : '—'}</td>` +
      `<td class="n"><span class="sw" style="background:${colSp(r.now) || 'transparent'}"></span>${r.now ?? '—'}</td>` +
      `<td class="n">${r.slow == null ? '—' : r.slow + '%'}</td><td class="n">${r.worstH == null ? '—' : fmt(r.worstH)}</td></tr>`).join('') +
    `</tbody></table></div><div class="note">"האטה" — כמה לאט יותר נוסעים בשעה העמוסה ביותר, לעומת השעות בלי עומס ביום (06:00–21:00) באותו יישוב. כך אפשר להשוות בין עיר גדולה לעיר קטנה בלי שמהירות הכבישים הבין-עירוניים תשפיע.</div>`;
}
$('#cities').addEventListener('click', e => {
  const b = e.target.closest('#cgrp button'); if (b) { S.cgrp = b.dataset.v; citiesPane(); return; }
  const th = e.target.closest('th[data-k]'); if (th) { S.csort = th.dataset.k; citiesPane(); return; }
  const tr = e.target.closest('tr[data-c]'); if (tr) goCity(tr.dataset.c);
});
function goCity(n) { const c = CITIES.find(x => x[0] === n); if (c) map.setView([c[3], c[4]], 14); }

// ---------- מקרא, מידע, אקסל ----------
function legendPane() {
  const it = S.m === 'sp' ? SP.map((x, i) => [x[1], i === 0 ? `עד ${x[0]} קמ"ש` : x[0] === 999 ? `מעל ${SP[i - 1][0]} קמ"ש` : `${SP[i - 1][0]}–${x[0]} קמ"ש`])
    : SL.map((x, i) => [x[1], i === 0 ? `עד ${x[0]}% לאט יותר` : x[0] === 999 ? `מעל ${SL[i - 1][0]}%` : `${SL[i - 1][0]}–${x[0]}%`]);
  $('#legend').innerHTML = `<div class="blk"><h3>${S.m === 'sp' ? 'מהירות ממוצעת' : S.d === 'y' ? `${ylabel()}: כמה לאט יותר מהממוצע החודשי באותה שעה` : 'האטה לעומת השעות בלי עומס ביום (06:00–21:00) באותו מקום'}</h3><div class="lg">` +
    it.map(([c, t]) => `<div><i style="background:${c}"></i>${t}</div>`).join('') + `<div><i style="background:#94a3b8;opacity:.4"></i>מעט נסיעות בשעה הזו</div></div></div>` +
    (S.lay.bn ? `<div class="blk"><h3>התקבצות בתחנה — אוטובוסים שהגיעו צמודים</h3><div class="lg">` +
      BN.map((x, i) => `<div><b class="dot" style="background:${x[1]}"></b>${i === 0 ? `פחות מ-${x[0]}%` : x[0] === 999 ? `${BN[i - 1][0]}% ומעלה` : `${BN[i - 1][0]}–${x[0]}%`}</div>`).join('') +
      `<div><b class="dot" style="background:#cbd5e1"></b>מעט נסיעות בשעה הזו</div></div></div>` : '');
}
function aboutPane() {
  const d = META && META.days, n = d ? (d.wd || []).length : 0, f = d ? (d.fr || []).length : 0;
  $('#about').innerHTML = `<div class="note"><p>כל דקה משדר כל אוטובוס בנסיעה את המיקום והמהירות שלו. דאטאבוס של הסדנא לידע ציבורי שומר את כל השידורים, ומהם מחושבת כאן המהירות הממוצעת בכל קטע רחוב, בכל כיוון ובכל שעה.</p>` +
    `<p>זו מהירות האוטובוסים, כולל העצירות בתחנות ובאורות אדומים — לא מהירות הרכבים הפרטיים. ככל שהמספר נמוך יותר, האוטובוס נתקע שם יותר.</p>` +
    `<p>התקופה: ${n} ימי חול${f ? ` ו-${f} ימי שישי` : ''} מ-28 הימים האחרונים. חגים וימים חריגים לא נספרים. מתעדכן כל לילה.</p>` +
    `<p>שעה עם פחות מ-5 דגימות במקום מסוים לא מוצגת.</p>` +
    `<p>מספר התושבים בכל יישוב (להשוואת היישובים): רשות האוכלוסין וההגירה, דרך <a href="https://data.gov.il/" target="_blank" rel="noopener">data.gov.il</a>.</p></div>`;
}
function excelPane() {
  $('#excel').innerHTML = `<div class="blk"><h3>הורדת סיכום לאקסל</h3><div class="mut">קובץ עם שלושה גיליונות: היישובים לפי שעה, כל הקטעים שבתחום המפה כרגע, והמקום שנבחר.</div>` +
    `<button class="btn" id="xl">הורדה (xlsx)</button></div>`;
  $('#xl').onclick = excel;
}
function loadScript(u) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
async function excel() {
  const b = $('#xl'); b.disabled = true; b.textContent = 'מכין…';
  try {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const H = Array.from({ length: 24 }, (_, h) => fmt(h));
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, name); };
    add('יישובים', [['יישוב', 'תושבים', 'האטה (%)', 'שעת שיא', 'מהירות בשעת השיא', 'בלי עומס (קמ"ש)', ...H],
      ...cityRows().map(r => [r.name, r.pop ?? '', r.slow ?? '', r.worstH == null ? '' : fmt(r.worstH), r.worst ?? '', r.top ?? '', ...r.c[5].map(v => v ?? '')])]);
    const dl = S.d === 'fr' ? 'שישי' : 'א׳–ה׳';
    add('קטעים במפה', [['רוחב', 'אורך', 'כיוון', 'דגימות', ...H.map(h => `${h} (${dl})`)],
      ...[...shown.keys()].map(r => [r[0], r[1], dirName(r[2]), r[3], ...hours(r, S.d).map(v => v ?? '')])]);
    if (S.spot) add('מקום נבחר', [['כיוון', 'סוג יום', ...H], ...[S.spot.r, S.spot.opp].filter(Boolean).flatMap(r =>
      [['wd', 'א׳–ה׳'], ['fr', 'שישי']].map(([d, t]) => [dirName(r[2]), t, ...hours(r, d).map(v => v ?? '')]))]);
    XLSX.writeFile(wb, 'מהירות-האוטובוסים.xlsx');
  } catch (e) { alert('ההורדה נכשלה: ' + e.message); }
  b.disabled = false; b.textContent = 'הורדה (xlsx)';
}

// ---------- ממשק ----------
const TITLES = { layers: 'שכבות', map: 'מהירות לפי שעה', spot: 'המקום שנבחר', cities: 'השוואת יישובים', legend: 'מקרא', excel: 'אקסל', about: 'על הנתונים' };
function tool(t) {
  if (S.tool === t && !$('#main').classList.contains('nopane') && t !== 'spot') { $('#main').classList.add('nopane'); $$('.tool').forEach(b => b.classList.remove('on')); setTimeout(() => map.invalidateSize(), 50); return; }
  S.tool = t; $('#main').classList.remove('nopane'); $('#main').classList.toggle('wide', t === 'cities');
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $$('[data-pane]').forEach(s => s.hidden = s.dataset.pane !== t);
  $('#pane-title').textContent = TITLES[t];
  ({ spot: spotPane, layers: layersPane, cities: citiesPane, legend: legendPane, about: aboutPane, excel: excelPane })[t]?.();
  setTimeout(() => map.invalidateSize(), 50);
}
$$('.tool').forEach(b => b.onclick = () => tool(b.dataset.tool));
$('#pane-close').onclick = () => { $('#main').classList.add('nopane'); $$('.tool').forEach(b => b.classList.remove('on')); setTimeout(() => map.invalidateSize(), 50); };
function refresh() {
  $('#hlbl').textContent = fmt(S.h); $('#hour').value = S.h;
  $$('#dtype button').forEach(b => b.classList.toggle('on', b.dataset.v === S.d));
  dayPicker();
  $$('#mode button').forEach(b => b.classList.toggle('on', b.dataset.v === S.m));
  recolor();
  if (S.tool === 'spot') spotPane(); else if (S.tool === 'cities') citiesPane(); else if (S.tool === 'legend') legendPane();
  hash();
}
$('#hour').oninput = e => { S.h = +e.target.value; refresh(); };
$('#dtype').onclick = e => { const b = e.target.closest('button'); if (b) { S.d = b.dataset.v; refresh(); if (S.d === 'y') draw(); } };
$('#dpick').onclick = e => {
  const n = e.target.closest('.cnav');
  if (n && !n.disabled) { let [y, m] = calYM; m += +n.dataset.nav; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } calYM = [y, m]; dayPicker(); return; }
  const b = e.target.closest('[data-dd]'); if (!b) return;
  const d = b.dataset.dd, i = S.dsel.indexOf(d);
  if (i >= 0) { if (S.dsel.length > 1) S.dsel.splice(i, 1); } else S.dsel.push(d);
  S.dsel.sort().reverse();
  refresh(); draw();
};
$('#mode').onclick = e => { const b = e.target.closest('button'); if (b) { S.m = b.dataset.v; refresh(); } };
let timer = null;
$('#play').onclick = () => {
  if (timer) { clearInterval(timer); timer = null; $('#play').classList.remove('on'); return; }
  $('#play').classList.add('on');
  timer = setInterval(() => { S.h = (S.h + 1) % 24; refresh(); }, 900);
};
$('#c-in').onclick = () => map.zoomIn(); $('#c-out').onclick = () => map.zoomOut();
$('#c-home').onclick = () => map.setView([31.9, 34.95], 8);
$('#c-loc').onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(p => map.setView([p.coords.latitude, p.coords.longitude], 15), () => msg('לא התקבל מיקום'));
$('#theme').onclick = () => {
  const d = document.documentElement.dataset.theme === 'dark' ? '' : 'dark';
  if (d) document.documentElement.dataset.theme = d; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('spd.theme', d || 'light'); } catch (e) { /* */ }
  setBase();
};
$('#q-btn').onclick = () => { $('#bar').classList.toggle('sopen'); $('#q').focus(); };
$('#q').oninput = () => {
  const q = $('#q').value.trim(), el = $('#qres');
  if (!q) { el.hidden = true; return; }
  const m = CITIES.filter(c => c[0].includes(q)).slice(0, 12);
  el.innerHTML = m.length ? m.map(c => `<div data-c="${esc(c[0])}">${esc(c[0])}${c[1] ? `<small>${num(c[1])} תושבים</small>` : ''}</div>`).join('') : '<div class="qh">לא נמצא יישוב</div>';
  el.hidden = false;
};
$('#qres').onclick = e => { const d = e.target.closest('[data-c]'); if (d) { goCity(d.dataset.c); $('#qres').hidden = true; $('#q').value = ''; $('#bar').classList.remove('sopen'); } };
map.on('mousemove', e => $('#s-wgs').textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
map.on('moveend', () => { draw(); hash(); });
// לחיצה על המפה (לא על קטע או תחנה) — ביטול הבחירה; גם Esc
let lastPick = 0;
function unpick() { if (!S.spot) return; S.spot = null; hiG.clearLayers(); if (S.tool === 'spot') tool('map'); }
map.on('click', () => { if (Date.now() - lastPick > 300) unpick(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') unpick(); });

// כתובת: #h=8&d=wd&m=sp&@31.72,34.74,15
function hash() {
  const c = map.getCenter();
  history.replaceState(null, '', `#h=${S.h}&d=${S.d}${S.d === 'y' ? '&dd=' + S.dsel.join(',') : ''}&m=${S.m}${S.lay.bn ? '&l=' + (S.lay.sp ? 'sb' : 'b') : ''}&@${c.lat.toFixed(4)},${c.lng.toFixed(4)},${map.getZoom()}`);
}
function readHash() {
  const h = location.hash.slice(1); if (!h) return;
  for (const p of h.split('&')) {
    if (p[0] === '@') { const [la, lo, z] = p.slice(1).split(',').map(Number); if (la && lo) map.setView([la, lo], z || 14); continue; }
    const [k, v] = p.split('=');
    if (k === 'h' && v >= 0 && v < 24) S.h = +v;
    if (k === 'd' && (v === 'wd' || v === 'fr' || v === 'y')) S.d = v;
    if (k === 'dd') S.dsel = v.split(',').filter(x => /^\d{4}-\d\d-\d\d$/.test(x));
    if (k === 'm' && (v === 'sp' || v === 'sl')) S.m = v;
    if (k === 'l') S.lay = { sp: v.includes('s') ? 1 : 0, bn: v.includes('b') ? 1 : 0 };
  }
}

(async function init() {
  readHash();
  try {
    [META, CITIES] = await Promise.all([fetch(D + 'meta.json').then(r => r.json()), fetch(D + 'cities.json').then(r => r.json()).catch(() => [])]);
  } catch (e) { msg('הנתונים עוד לא מוכנים'); return; }
  TILE = META.tile; META.tilesSet = new Set(META.tiles);
  S.dsel = S.dsel.filter(d => DD().some(x => x[0] === d));
  if (!S.dsel.length && DD().length) S.dsel = [DD()[0][0]];
  if (!DD().length) { $('#dtype [data-v=y]').remove(); if (S.d === 'y') S.d = 'wd'; }
  const d = (META.days.wd || []).slice().sort();
  $('#s-per').dir = 'ltr';
  if (d.length) $('#s-per').textContent = `${d[0].split('-').reverse().slice(0, 2).join('.')}–${d.at(-1).split('-').reverse().slice(0, 2).join('.')}`;
  tool('map'); refresh(); draw();
})();
