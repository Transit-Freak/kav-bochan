// איפה האוטובוס נתקע — מהירות האוטובוסים לפי מקום ושעה (נתוני דאטאבוס, tools/bus_speed.py).
// אריחים (data/t/<y>_<x>.json): [רוחב, אורך, כיוון, דגימות, "מהירויות א'–ה' לכל שעה", "שישי", צומת, הקו לאורך הכביש].
// יישובים (data/cities.json): [יישוב, תושבים, דגימות, רוחב, אורך, [מהירות בכל שעה]].
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const D = 'data/';
const S = { h: 8, d: 'wd', m: 'sp', tool: null, spot: null, csort: 'slow', cgrp: 'all' };
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
function hours(r, d) {                 // מחרוזת "35,71,,…" → מערך 24 (null = מעט מדי)
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
function color(r) {
  const a = hours(r, S.d);
  return S.m === 'sp' ? colSp(a[S.h]) : colSl(slowPct(a, S.h));
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
function needTiles() {
  const b = map.getBounds(), out = [];
  for (let y = Math.floor(b.getSouth() / TILE); y <= Math.floor(b.getNorth() / TILE); y++)
    for (let x = Math.floor(b.getWest() / TILE); x <= Math.floor(b.getEast() / TILE); x++) {
      const k = `${y}_${x}`;
      if (META.tilesSet.has(k)) out.push(k);
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
  if (seq !== drawSeq) return;
  msg('');
  const b = map.getBounds().pad(0.15), w = z >= 16 ? 5 : z >= 15 ? 4 : 3;
  const vis = new Set();
  for (const r of all) {
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
}
function tip(r) {
  const a = hours(r, S.d), v = a[S.h];
  return `<b>לכיוון ${dirName(r[2])}</b><br>${fmt(S.h)}: ${v == null ? 'מעט נסיעות' : v + ' קמ"ש'}` +
    (v != null && S.m === 'sl' ? ` · ${slowPct(a, S.h)}% לאט יותר מבלי עומס` : '') + '<br><small>לחיצה — השעות העמוסות</small>';
}
function recolor() {
  if (map.getZoom() < MINZ) return drawCities();
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
  // הכיוון ההפוך באותו רחוב: רשומה קרובה (עד 110 מ') שכיוונה הפוך (הפרש 135° ומעלה)
  let opp = null, bd = 110;
  for (const q of shown.keys()) {
    if (q === r) continue;
    const dd = Math.abs(((q[2] - r[2] + 540) % 360) - 180);
    if (dd < 135) continue;
    const d = map.distance([r[0], r[1]], [q[0], q[1]]);
    if (d < bd) { bd = d; opp = q; }
  }
  S.spot = { r, opp };
  hiG.clearLayers();
  for (const q of [r, opp].filter(Boolean)) L.polyline(geom(q), { weight: 11, color: '#0ea5e9', opacity: .35, interactive: false }).addTo(hiG);
  tool('spot');
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
function spotPane() {
  const el = $('#spot');
  if (!S.spot) { el.innerHTML = '<div class="note">לחצו על קו במפה (בזום קרוב) כדי לראות את המהירות שם בכל שעות היום.</div>'; return; }
  const { r, opp } = S.spot;
  const one = (q, other) => {
    const a = hours(q, S.d), sl = a.map((v, h) => [v, h]).filter(x => x[0] != null).sort((p, q2) => p[0] - q2[0]);
    const worst = sl[0], top = best(a), busy = busyHours(a);
    return `<div class="blk"><div class="dirh"><span class="arr" style="transform:rotate(${q[2]}deg)">↑</span><h3>לכיוון ${dirName(q[2])}</h3></div>` +
      chart(a, other ? hours(other, S.d) : null) +
      `<div class="busy">${busy}</div>` +
      `<div class="kv"><span>${fmt(S.h)}</span><b>${a[S.h] == null ? '—' : a[S.h] + ' קמ"ש'}</b>` +
      (worst ? `<span>השעה האיטית ביותר</span><b>${fmt(worst[1])} · ${worst[0]} קמ"ש</b>` : '') +
      (top ? `<span>בלי עומס (בשעות היום)</span><b>${top} קמ"ש</b>` : '') +
      `<span>דגימות (28 יום)</span><b>${num(q[3])}</b></div></div>`;
  };
  el.innerHTML = one(r, opp) + (opp ? one(opp, r) : '') +
    `<div class="note">${opp ? 'הקו הדק בכל גרף הוא הכיוון השני.' : 'אין כאן מספיק נתונים לכיוון השני.'} המהירות כוללת עצירות בתחנות וברמזורים.` +
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
  $('#legend').innerHTML = `<div class="blk"><h3>${S.m === 'sp' ? 'מהירות ממוצעת' : 'האטה לעומת השעות בלי עומס ביום (06:00–21:00) באותו מקום'}</h3><div class="lg">` +
    it.map(([c, t]) => `<div><i style="background:${c}"></i>${t}</div>`).join('') + `<div><i style="background:#94a3b8;opacity:.4"></i>מעט נסיעות בשעה הזו</div></div></div>`;
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
const TITLES = { map: 'מהירות לפי שעה', spot: 'המקום שנבחר', cities: 'השוואת יישובים', legend: 'מקרא', excel: 'אקסל', about: 'על הנתונים' };
function tool(t) {
  if (S.tool === t && !$('#main').classList.contains('nopane') && t !== 'spot') { $('#main').classList.add('nopane'); $$('.tool').forEach(b => b.classList.remove('on')); setTimeout(() => map.invalidateSize(), 50); return; }
  S.tool = t; $('#main').classList.remove('nopane'); $('#main').classList.toggle('wide', t === 'cities');
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $$('[data-pane]').forEach(s => s.hidden = s.dataset.pane !== t);
  $('#pane-title').textContent = TITLES[t];
  ({ spot: spotPane, cities: citiesPane, legend: legendPane, about: aboutPane, excel: excelPane })[t]?.();
  setTimeout(() => map.invalidateSize(), 50);
}
$$('.tool').forEach(b => b.onclick = () => tool(b.dataset.tool));
$('#pane-close').onclick = () => { $('#main').classList.add('nopane'); $$('.tool').forEach(b => b.classList.remove('on')); setTimeout(() => map.invalidateSize(), 50); };
function refresh() {
  $('#hlbl').textContent = fmt(S.h); $('#hour').value = S.h;
  $$('#dtype button').forEach(b => b.classList.toggle('on', b.dataset.v === S.d));
  $$('#mode button').forEach(b => b.classList.toggle('on', b.dataset.v === S.m));
  recolor();
  if (S.tool === 'spot') spotPane(); else if (S.tool === 'cities') citiesPane(); else if (S.tool === 'legend') legendPane();
  hash();
}
$('#hour').oninput = e => { S.h = +e.target.value; refresh(); };
$('#dtype').onclick = e => { const b = e.target.closest('button'); if (b) { S.d = b.dataset.v; refresh(); } };
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

// כתובת: #h=8&d=wd&m=sp&@31.72,34.74,15
function hash() {
  const c = map.getCenter();
  history.replaceState(null, '', `#h=${S.h}&d=${S.d}&m=${S.m}&@${c.lat.toFixed(4)},${c.lng.toFixed(4)},${map.getZoom()}`);
}
function readHash() {
  const h = location.hash.slice(1); if (!h) return;
  for (const p of h.split('&')) {
    if (p[0] === '@') { const [la, lo, z] = p.slice(1).split(',').map(Number); if (la && lo) map.setView([la, lo], z || 14); continue; }
    const [k, v] = p.split('=');
    if (k === 'h' && v >= 0 && v < 24) S.h = +v;
    if (k === 'd' && (v === 'wd' || v === 'fr')) S.d = v;
    if (k === 'm' && (v === 'sp' || v === 'sl')) S.m = v;
  }
}

(async function init() {
  readHash();
  try {
    [META, CITIES] = await Promise.all([fetch(D + 'meta.json').then(r => r.json()), fetch(D + 'cities.json').then(r => r.json()).catch(() => [])]);
  } catch (e) { msg('הנתונים עוד לא מוכנים'); return; }
  TILE = META.tile; META.tilesSet = new Set(META.tiles);
  const d = (META.days.wd || []).slice().sort();
  if (d.length) $('#s-per').textContent = `${d[0].split('-').reverse().slice(0, 2).join('.')}–${d.at(-1).split('-').reverse().slice(0, 2).join('.')}`;
  tool('map'); refresh(); draw();
})();
