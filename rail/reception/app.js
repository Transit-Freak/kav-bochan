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
function scoreFor(struct, d, spd, f) {
  if (struct === 'tunnel' || struct === 'covered' || d == null) return 0;
  let s = d < 1500 * f ? 3 : d < 3500 * f ? 2 : d < 6000 * f ? 1 : 0;
  if (struct === 'cutting' && s > 0) s--;
  if (spd && spd > 120 && s > 0 && s < 3) s--;
  return s;
}
const STRUCT = {tunnel: 'מנהרה', cutting: 'חתך (מסילה שקועה)', covered: 'קטע מקורה'};
let D = null, op = 'pel', map, layer, antLayer, cover = null, bySpeed = false, showAnt = true;

function load(u) { return fetch(u + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }); }

function init() {
  $('#map').innerHTML = '';
  map = L.map('map', {zoomControl: true}); window.__recepMap = map;
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {maxZoom: 18, attribution: '&copy; OpenStreetMap, &copy; CARTO'}).addTo(map);
  const all = []; for (const s of Object.values(D.segs)) for (const p of s.pts) all.push([p[0], p[1]]);
  map.fitBounds(L.latLngBounds(all).pad(0.05));
  antLayer = L.layerGroup().addTo(map);
  layer = L.layerGroup().addTo(map);
  const ops = $('#ops');
  ops.innerHTML = D.ops.map(o => `<button data-op="${o.code}" style="--b:${BRAND[o.code]}" class="${o.code === op ? 'on' : ''}">${esc(o.name)}</button>`).join('') + `<button data-op="all" style="--b:#101418">כל החברות</button>`;
  ops.onclick = e => { const b = e.target.closest('button'); if (!b) return; op = b.dataset.op; ops.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
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
}

function draw() {
  layer.clearLayers();
  const all = op === 'all';
  const ci = D.cols.indexOf('s_' + (all ? 'pel' : op)), di = D.cols.indexOf('d_' + (all ? 'pel' : op));
  const dis = D.ops.map(o => D.cols.indexOf('d_' + o.code));
  const f = (TRAINS.find(t => t.code === train) || TRAINS[1]).f;
  let curSpd = null;
  const scoreOf = p => { if (!all) return scoreFor(p[2], p[di], curSpd, f); const v = dis.map(i => scoreFor(p[2], p[i], curSpd, f)).sort(); return v[1]; };
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
      const pl = L.polyline(run, {color: runC, weight: 6, opacity: .9, lineCap: 'round'});
      const inf = runInfo;
      pl.bindPopup(() => `<b>${esc(name)}</b><br>${inf.struct ? '🕳️ ' + STRUCT[inf.struct] + '<br>' : ''}` +
        `${bySpeed ? '' : 'קליטה משוערת: <b>' + GNAME[inf.sc] + '</b><br>'}` +
        (all ? D.ops.map((o, k) => { const v = scoreFor(inf.p[2], inf.p[dis[k]], s.spd, f); return `${esc(o.name)}: <b style="color:${GCOL[v]}">${GNAME[v]}</b>`; }).join(' · ') + '<br>' : `אנטנה קרובה של ${esc(opName())}: ${inf.d == null ? 'מעל 8 ק"מ' : inf.d < 1000 ? inf.d + ' מ׳' : (inf.d / 1000).toFixed(1) + ' ק"מ'}<br>`) +
        `מהירות ממוצעת במקטע: ${s.spd == null ? '—' : s.spd + ' קמ"ש'} (${s.n} נסיעות)`);
      layer.addLayer(pl);
    };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], sc = scoreOf(p);
      tot[sc]++;
      const c = bySpeed ? SCOL(s.spd) : GCOL[sc];
      if (c !== runC) { if (run.length) { run.push([p[0], p[1]]); flush(); } run = [[p[0], p[1]]]; runC = c; runInfo = {sc, d: p[di], struct: p[2], p}; }
      else run.push([p[0], p[1]]);
    }
    flush();
  }
  const n = tot.reduce((a, b) => a + b, 0);
  $('#stats').innerHTML = [3, 2, 1, 0].map(i => `<div style="border-color:${GCOL[i]}"><b>${Math.round(100 * tot[i] / n)}%</b><span>${GNAME[i]} · ${(tot[i] * D.step / 1000).toFixed(0)} ק"מ</span></div>`).join('');
  $('#legend').innerHTML = bySpeed
    ? [['#00A65A', 'עד 60 קמ"ש'], ['#F4B400', '60–100'], ['#F26B1D', '100–130'], ['#D7263D', 'מעל 130'], ['#8A94A3', 'אין נתון']].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')
    : [3, 2, 1, 0].map(i => `<span><i style="background:${GCOL[i]}"></i>${GNAME[i]}</span>`).join('') + `<span>· סה"כ ${km.toFixed(0)} ק"מ מסילה בין תחנות</span>` +
      (showAnt ? '<span class="sep"></span>' + (all ? D.ops : D.ops.filter(o => o.code === op)).map(o => `<span><i class="area" style="background:${BRAND[o.code]}"></i>כיסוי ${esc(o.name)}</span>`).join('') : '') +
      (all ? '<span>· המסילה ב"כל החברות": הציון האמצעי מבין השלוש</span>' : '');
  drawAnt();
}

function opName() { return op === 'all' ? 'כל החברות' : (D.ops.find(o => o.code === op) || {}).name || op; }

// רדיוס כיסוי משוער לפי סוג האתר (מטרים) — תורן קרקעי מכסה הרבה, אתר זעיר כמעט כלום
const RADIUS = {'תורן קרקעי': 3000, 'תורן על הגג': 2000, 'אנטנת עוקץ': 1500, 'אנטנה משתפלת': 1500, 'אתר זעיר פנימי': 300, 'אתר זעיר חיצוני': 400, 'מתקן גישה אלחוטי': 300};
// שכבת כיסוי על קנבס אחד: כל האזורים בצבע מלא על קנבס נסתר, ואז מצוירים
// במפה בשקיפות אחידה — כך חפיפות לא מצטברות והגבול "יש/אין" נשאר ברור.
const CoverLayer = L.Layer.extend({
  onAdd(m) { this._m = m; this._c = L.DomUtil.create('canvas', 'leaflet-zoom-animated'); this._c.style.pointerEvents = 'none'; this._c.style.position = 'absolute';
    m.getPanes().overlayPane.appendChild(this._c); m.on('moveend zoomend resize', this._draw, this); this._draw(); },
  onRemove(m) { m.off('moveend zoomend resize', this._draw, this); this._c.remove(); },
  _draw() {
    const m = this._m, sz = m.getSize(), c = this._c;
    c.width = sz.x; c.height = sz.y;
    const tl = m.containerPointToLayerPoint([0, 0]); L.DomUtil.setPosition(c, tl);
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, sz.x, sz.y);
    const b = m.getBounds().pad(0.2);
    const mpp = 40075016.686 * Math.cos(m.getCenter().lat * Math.PI / 180) / (256 * Math.pow(2, m.getZoom()));
    const codes = op === 'all' ? D.ops.map(o => o.code) : [op];
    for (const code of codes) {
      ctx.fillStyle = BRAND[code]; ctx.globalAlpha = op === 'all' ? .16 : .22; ctx.beginPath();
      for (const a of D.antennas) {
        if (a[2] !== code || !b.contains([a[0], a[1]])) continue;
        const p = m.latLngToContainerPoint([a[0], a[1]]);
        const r = (RADIUS[a[3]] || 1000) / mpp;
        ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
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
    <li><b>אנטנות ואזורי כיסוי</b> — הכתמים הכחולים הם רדיוס משוער לפי סוג האתר (תורן קרקעי 3 ק"מ, על גג 2, עוקץ/משתפלת 1.5, אתר זעיר 300–400 מ׳); מאגר "אנטנות סלולריות פעילות" של המשרד להגנת הסביבה (data.gov.il), ${D.antennas.length.toLocaleString('he-IL')} אתרים בטווח 8 ק"מ מהמסילה. PHI היא התשתית המשותפת של פרטנר והוט.</li>
    <li><b>מנהרות וחתכים</b> — מסומנים על המסילה ב-OpenStreetMap (${D.tunnels.length} מנהרות בשם: ${esc(D.tunnels.join(', '))}). במנהרה הציון הוא "אין קליטה" גם אם הותקנה בה תשתית פנימית, כי אין על כך מידע פתוח.</li>
    <li><b>מהירות</b> — הזמן בפועל בין תחנות עוקבות (לו"ז + איחור שנמדד) מול אורך המסילה, חציון על ${D.days} הימים האחרונים. מעל 120 קמ"ש הציון יורד דרגה, כי מסירה בין תאים נכשלת יותר במהירות.</li>
    <li><b>הציון</b> — עד 1.5 ק"מ מאנטנה: טובה; עד 3.5: סבירה; עד 6: חלשה; מעבר לזה: אין. חתך מוריד דרגה. אין כאן קו ראייה וטופוגרפיה עדיין.</li>
    <li><b>סוג הרכבת</b> — הקרון עצמו חוסם: זכוכית עם ציפוי מתכתי (בידוד תרמי) מחלישה את האות פי מאות, וחריצת לייזר של הציפוי מחזירה כמעט לקליטה חיצונית. לכן הטווחים למעלה מוכפלים במקדם לפי הסוג: חלונות מחורצים 1.0, דו-קומתי טווינדקס 0.55, דזירו HC 0.4, ויאג׳ו 0.7. המקדמים הם הערכה מהספרות המקצועית, לא מדידה בקרונות של רכבת ישראל. משרד התחבורה הקצה 68 מיליון ₪ (יולי 2025) לחריצת כל 800 הקרונות; עד כה כ-30 קרונות, ואין רשימה פומבית איזה. רכבת ישראל לא מפרסמת איזה ציוד רץ על איזו רכבת, ולכן הבחירה כאן ידנית.</li>
  </ul>`;
}

load('../data/reception.json').then(d => { D = d; init(); }).catch(e => { $('#map').innerHTML = `<div class="msg">הנתונים לא נטענו (${esc(e.message)})</div>`; });
})();
