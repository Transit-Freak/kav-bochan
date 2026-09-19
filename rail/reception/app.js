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
const STRUCT = {tunnel: 'מנהרה', cutting: 'חתך (מסילה שקועה)', covered: 'קטע מקורה'};
let D = null, op = 'pel', map, layer, antLayer, bySpeed = false, showAnt = false;

function load(u) { return fetch(u + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }

function init() {
  $('#map').innerHTML = '';
  map = L.map('map', {zoomControl: true});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {maxZoom: 18, attribution: '&copy; OpenStreetMap, &copy; CARTO'}).addTo(map);
  const all = []; for (const s of Object.values(D.segs)) for (const p of s.pts) all.push([p[0], p[1]]);
  map.fitBounds(L.latLngBounds(all).pad(0.05));
  layer = L.layerGroup().addTo(map);
  antLayer = L.layerGroup().addTo(map);
  const ops = $('#ops');
  ops.innerHTML = D.ops.map(o => `<button data-op="${o.code}" class="${o.code === op ? 'on' : ''}">${esc(o.name)}</button>`).join('');
  ops.onclick = e => { const b = e.target.closest('button'); if (!b) return; op = b.dataset.op; ops.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  $('#showAnt').onchange = e => { showAnt = e.target.checked; drawAnt(); };
  $('#showSpd').onchange = e => { bySpeed = e.target.checked; draw(); };
  const upd = (D.updated || '').replace('T', ' ').replace('Z', ' UTC');
  $('#sub').textContent = `הערכה, לא מדידה: לכל ${D.step} מטר מסילה — האנטנה הקרובה של המפעיל, מנהרות וחתכים מ-OSM, ומהירות הנסיעה בפועל ב-${D.days} הימים האחרונים. עודכן ${upd}.`;
  draw();
  method();
}

function draw() {
  layer.clearLayers();
  const ci = D.cols.indexOf('s_' + op), di = D.cols.indexOf('d_' + op);
  const tot = [0, 0, 0, 0];
  let km = 0;
  for (const [key, s] of Object.entries(D.segs)) {
    const [a, b] = key.split('-');
    const name = `${D.stations[a] || a} ↔ ${D.stations[b] || b}`;
    const pts = s.pts;
    km += s.m / 1000;
    // רצפים של אותו צבע → פוליליין אחד (פחות אובייקטים במפה)
    let run = [], runC = null, runInfo = null;
    const flush = () => {
      if (run.length < 2) return;
      const pl = L.polyline(run, {color: runC, weight: 6, opacity: .9, lineCap: 'round'});
      const inf = runInfo;
      pl.bindPopup(() => `<b>${esc(name)}</b><br>${inf.struct ? '🕳️ ' + STRUCT[inf.struct] + '<br>' : ''}` +
        `${bySpeed ? '' : 'קליטה משוערת: <b>' + GNAME[inf.sc] + '</b><br>'}` +
        `אנטנה קרובה של ${esc(opName())}: ${inf.d == null ? 'מעל 8 ק"מ' : inf.d < 1000 ? inf.d + ' מ׳' : (inf.d / 1000).toFixed(1) + ' ק"מ'}<br>` +
        `מהירות ממוצעת במקטע: ${s.spd == null ? '—' : s.spd + ' קמ"ש'} (${s.n} נסיעות)`);
      layer.addLayer(pl);
    };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], sc = p[ci];
      tot[sc]++;
      const c = bySpeed ? SCOL(s.spd) : GCOL[sc];
      if (c !== runC) { if (run.length) { run.push([p[0], p[1]]); flush(); } run = [[p[0], p[1]]]; runC = c; runInfo = {sc, d: p[di], struct: p[2]}; }
      else run.push([p[0], p[1]]);
    }
    flush();
  }
  const n = tot.reduce((a, b) => a + b, 0);
  $('#stats').innerHTML = [3, 2, 1, 0].map(i => `<div style="border-color:${GCOL[i]}"><b>${Math.round(100 * tot[i] / n)}%</b><span>${GNAME[i]} · ${(tot[i] * D.step / 1000).toFixed(0)} ק"מ</span></div>`).join('');
  $('#legend').innerHTML = bySpeed
    ? [['#00A65A', 'עד 60 קמ"ש'], ['#F4B400', '60–100'], ['#F26B1D', '100–130'], ['#D7263D', 'מעל 130'], ['#8A94A3', 'אין נתון']].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')
    : [3, 2, 1, 0].map(i => `<span><i style="background:${GCOL[i]}"></i>${GNAME[i]}</span>`).join('') + `<span>· סה"כ ${km.toFixed(0)} ק"מ מסילה בין תחנות</span>`;
  drawAnt();
}

function opName() { return (D.ops.find(o => o.code === op) || {}).name || op; }

function drawAnt() {
  antLayer.clearLayers();
  if (!showAnt) return;
  for (const a of D.antennas) {
    if (a[2] !== op) continue;
    const m = L.circleMarker([a[0], a[1]], {radius: 4, color: '#fff', weight: 1, fillColor: '#1E5BC6', fillOpacity: .9});
    m.bindPopup(`<b>${esc(opName())}</b><br>${esc(a[3])}${a[4] ? ' · ' + esc(a[4]) : ''}<br>${esc(a[5])}`);
    antLayer.addLayer(m);
  }
}

function method() {
  $('#method').innerHTML = `<h2>איך זה מחושב</h2>
  <p>זו <b>הערכה מנתונים פתוחים</b>, לא מדידת קליטה. השידור של הרכבת עצמה (דאטאבוס) עובר ברשת נפרדת ולכן לא משמש כאן כעדות לקליטה, רק כמקור למהירות.</p>
  <ul>
    <li><b>אנטנות</b> — מאגר "אנטנות סלולריות פעילות" של המשרד להגנת הסביבה (data.gov.il), ${D.antennas.length.toLocaleString('he-IL')} אתרים בטווח 8 ק"מ מהמסילה. PHI היא התשתית המשותפת של פרטנר והוט.</li>
    <li><b>מנהרות וחתכים</b> — מסומנים על המסילה ב-OpenStreetMap (${D.tunnels.length} מנהרות בשם: ${esc(D.tunnels.join(', '))}). במנהרה הציון הוא "אין קליטה" גם אם הותקנה בה תשתית פנימית, כי אין על כך מידע פתוח.</li>
    <li><b>מהירות</b> — הזמן בפועל בין תחנות עוקבות (לו"ז + איחור שנמדד) מול אורך המסילה, חציון על ${D.days} הימים האחרונים. מעל 120 קמ"ש הציון יורד דרגה, כי מסירה בין תאים נכשלת יותר במהירות.</li>
    <li><b>הציון</b> — עד 1.5 ק"מ מאנטנה: טובה; עד 3.5: סבירה; עד 6: חלשה; מעבר לזה: אין. חתך מוריד דרגה. אין כאן קו ראייה וטופוגרפיה עדיין.</li>
  </ul>`;
}

load('../data/reception.json').then(d => { D = d; init(); }).catch(e => { $('#map').innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; });
})();
