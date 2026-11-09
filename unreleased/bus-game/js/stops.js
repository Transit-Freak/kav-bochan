// תחנת אוטובוס ישראלית, לפי תחנה אמיתית בקריית מלאכי (יגאל הורוביץ/שמעון פרס, 12571):
// סככה בפלדה כהה עם גג דק (לבן מלמטה), קיר אחורי של רפפות, דופן זכוכית כהה בכל צד, ספסל נירוסטה מחורר,
// לוח מידע לבן על הרפפות ושלטי מספרי קווים צהובים על העמוד; עמוד עם שלט התחנה (כותרת לבנה, שורות צהובות לכל קו);
// אבן שפה צבועה אדום-צהוב ומרצפות. בלי מדבקות ובלי פרסומות.
//
// ביצועים: החלקים הקבועים — InstancedMesh אחד לכל חומר לכל 85 התחנות (4 קריאות ציור), המרצפות והשפה — רשת אחת כל אחת.
// השלטים עם הטקסט (שם התחנה, הקווים) — רק לתחנות הקרובות למצלמה: קנבס אחד לכל תחנה (נבנה מחדש רק כשהקווים שלה משתנים).
// רחוק — אותם שלטים בצבעים בלבד.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// מערכת הצירים של תחנה: a — לאורך הכביש בכיוון הנסיעה (0 = הדלת הקדמית של אוטובוס שעוצר), d — מהשפה פנימה (הרחק מהכביש)
export const KERB = 3.35;                 // שפת המדרכה בתחנה, מטרים ממרכז הכביש (האוטובוס נוסע 1.8 מהמרכז, רוחבו 2.55)
const A0 = -5.35, A1 = -0.95, AC = (A0 + A1) / 2, LEN = A1 - A0;   // הסככה: 4.4 מ', מאחורי הדלת הקדמית
const DB = 3.5, DF = 1.7, H = 2.62;       // הקיר האחורי, קצה הגג מקדימה, גובה הגג
const DP = 2.0;                           // קצה דופן הזכוכית מקדימה
export const POLE = { a: 1.9, d: 0.9 };   // עמוד השלט — בראש התחנה, לפני חזית האוטובוס
const PAD = { a0: -12.5, a1: 3.4, d1: 4.3, y: 0.12 };
// הספסל בסככה: המושב (גובה עליון y, מ-d0 מקדימה עד d1 ליד הקיר), חזית הרפפות (wall), ושלושה מקומות ישיבה לאורכו (seats, לפי a)
export const BENCH = { h: 0.43, y: PAD.y + 0.43, d0: 2.95, d1: DB - 0.05, wall: DB - 0.03, seats: [AC - 0.64, AC + 0.64, AC] };
const BOARD = { a: -1.62, y: 1.55, w: 1.0, h: 1.25 };
const SIGN = { y: 3.0, w: 0.8, h: 0.95 };
const PLATE = { w: 0.25, h: 0.125, y0: 1.66, step: 0.137 };

// ---------- מסגרת התחנה
let ROADS = null, BLDG = [];
// רוחב הכביש ליד כל תחנה (הרחוב הקרוב ב-city.roads) — כדי לדעת איפה האספלט נגמר
export function assignRoadWidths(city, graph) {
  ROADS = city.roads.filter(r => r.cls !== 'f');
  BLDG = city.buildings.map(b => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of b.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { pts: b.pts, x0, y0, x1, y1 }; });
  for (const s of city.stops) {
    const [rx, ry] = graph.stopPoint(s);
    let best = 1e9, w = 9;
    for (const r of ROADS) for (let i = 0; i + 1 < r.pts.length; i++) {
      const [x0, y0] = r.pts[i], [x1, y1] = r.pts[i + 1];
      const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1;
      const k = Math.max(0, Math.min(1, ((rx - x0) * (x1 - x0) + (ry - y0) * (y1 - y0)) / L2));
      const dd = Math.hypot(x0 + k * (x1 - x0) - rx, y0 + k * (y1 - y0) - ry);
      if (dd < best) { best = dd; w = r.w; }
    }
    s.hw = w / 2;
  }
}
export function stopFrame(stop, graph) {
  if (stop._frame) return stop._frame;
  const [rx, ry] = graph.stopPoint(stop);
  const [a, b] = graph.edge(stop.e), [ax, ay] = graph.xy(a), [bx, by] = graph.xy(b);
  const tl = Math.hypot(bx - ax, by - ay) || 1, tx = (bx - ax) / tl, ty = (by - ay) / tl;
  const ux = ty, uy = -tx;                 // המדרכה בצד ימין של כיוון הנסיעה
  const kx = rx + ux * KERB, ky = ry + uy * KERB;
  const f = { rx, ry, tx, ty, ux, uy, kx, ky, hw: stop.hw ?? 4.5 };
  f.px = kx + tx * POLE.a + ux * POLE.d; f.py = ky + ty * POLE.a + uy * POLE.d;
  // כמה מקום יש מאחורי השפה עד בניין. מדרכה צרה מדי — רק עמוד, בלי סככה (כמו בהרבה תחנות אמיתיות)
  const near = BLDG.filter(b => b.x1 > kx - 20 && b.x0 < kx + 20 && b.y1 > ky - 20 && b.y0 < ky + 20);
  let free = PAD.d1 + 0.2;
  if (near.length) for (let a = PAD.a0 - 1; a <= PAD.a1 + 0.01; a += 0.5) for (let d = 0.3; d < free; d += 0.1) {
    const x = kx + tx * a + ux * d, y = ky + ty * a + uy * d;
    if (near.some(b => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && inPoly(x, y, b.pts))) { free = d; break; }
  }
  f.free = free; f.shelter = free >= 3.95; f.depth = Math.min(PAD.d1, free);
  f.slots = f.shelter ? SLOTS : SLOTS.filter(([, d]) => d < free - 0.35);
  return (stop._frame = f);
}
function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
// (a, d) בתחנה ← נקודה במפה / וקטור של three
export const frameXY = (f, a, d) => [f.kx + f.tx * a + f.ux * d, f.ky + f.ty * a + f.uy * d];
export const frameV = (f, a, d, y = 0, out = new THREE.Vector3()) => out.set(f.kx + f.tx * a + f.ux * d, y, -(f.ky + f.ty * a + f.uy * d));
export const frameAD = (f, x, y) => [(x - f.kx) * f.tx + (y - f.ky) * f.ty, (x - f.kx) * f.ux + (y - f.ky) * f.uy];

// מקומות ההמתנה (a, d): שתי שורות בין השפה לסככה, בתוך הסככה מול הספסל, ובצדדים — אף אחד לא בתוך הספסל, הקירות או העמוד
const sh = i => { const x = Math.sin(i * 78.233 + 12.9898) * 43758.5453; return x - Math.floor(x); };
export const SLOTS = (() => {
  const r0 = [-0.6, -1.25, -1.9, -2.55, -3.2, -3.85, -4.5, 0.05, -5.15, 0.7, -5.8, 1.3];
  const inside = [-1.6, -2.3, -3.0, -3.7, -4.45].map(a => [a, 2.35]);
  const row0 = r0.map(a => [a, 1.05]), row1 = r0.map(a => [a + 0.32, 1.65]);
  const ahead = [], behind = [];
  for (const d of [2.25, 2.85, 3.45]) { for (const a of [-0.3, 0.35, 1.0]) ahead.push([a, d]); for (const a of [-6.1, -6.7, -7.3]) behind.push([a, d]); }
  const all = [...row0.slice(0, 7), ...inside, ...row0.slice(7), ...row1, ...ahead, ...behind];
  return all.map(([a, d], i) => [a + (sh(i) - 0.5) * 0.16, d + (sh(i + 7) - 0.5) * 0.12]);
})();

// ---------- חומרים וטקסטורות
function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  return t;
}
// מרצפות: 4 מ' לאורך × 4.4 מ' לעומק. רצועה בהירה ליד השפה, ואחריה אבן אפורה-חמה
function pavingTexture() {
  const W = 512, Hh = 512, c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d'), pxA = W / 4, pxD = Hh / PAD.d1;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#5d5853'; g.fillRect(0, 0, W, Hh);          // הפוגות
  const strip = 1.35;
  for (let d = 0, row = 0; d < PAD.d1; d += 0.1, row++) {
    const light = d < strip, lw = light ? 0.2 : 0.2, off = row % 2 ? lw / 2 : 0;
    for (let a = -off; a < 4; a += lw) {
      const v = (rnd() - 0.5) * (light ? 14 : 18);
      const base = light ? [222, 217, 210] : [178, 170, 167];
      g.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v * 0.9 | 0})`;
      g.fillRect(Math.round(a * pxA) + 1, Math.round(d * pxD) + 1, Math.round(lw * pxA) - 2, Math.round(0.1 * pxD) - 2);
    }
  }
  // חספוס עדין
  for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * Hh, 1.5, 1.5); }
  return canvasTex(c, true);
}
// נירוסטה מחוררת
function perforatedTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#c9ced3'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3b4046';
  for (let y = 4; y < 128; y += 8) for (let x = (y / 8) % 2 ? 8 : 4; x < 128; x += 8) { g.beginPath(); g.arc(x, y, 2.1, 0, 7); g.fill(); }
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- גאומטריה מקומית של סככה אחת (x = a, z = d, y למעלה)
const parts = () => ({ steel: [], paint: [], glass: [], bench: [] });
const WHITE = new THREE.Color(1, 1, 1);
function colorize(geo, col, k = 1) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(col ?? 0xffffff).multiplyScalar(k);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
const prep = g => (g.index ? g.toNonIndexed() : g);
function box(list, w, h, d, x, y, z, col) { list.push(prep(colorize(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col))); }
// קופסה עם פינות קטומות (שיפוע קטן בכל הקצוות) — מראה של פלדה מכופפת, לא של קוביית צעצוע
function bevelBox(list, w, h, d, x, y, z, b = 0.012, col) {
  const s = new THREE.Shape(), hw = w / 2 - b, hh = h / 2 - b, c = b;
  s.moveTo(-hw + c, -hh); s.lineTo(hw - c, -hh); s.lineTo(hw, -hh + c); s.lineTo(hw, hh - c); s.lineTo(hw - c, hh);
  s.lineTo(-hw + c, hh); s.lineTo(-hw, hh - c); s.lineTo(-hw, -hh + c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * b) / 2); g.translate(x, y, z); g.clearGroups();
  list.push(prep(colorize(g, col)));
}
// מוט מנקודה לנקודה (חתך מרובע t)
function bar(list, p, q, t) {
  const P = new THREE.Vector3(...p), Q = new THREE.Vector3(...q), dir = Q.clone().sub(P), L = dir.length();
  const g = new THREE.BoxGeometry(L + t * 0.6, t, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize()));
  g.translate((P.x + Q.x) / 2, (P.y + Q.y) / 2, (P.z + Q.z) / 2);
  list.push(prep(colorize(g)));
}
// לוח שטוח בכיוון מסוים: n = '+x' | '-x' | '-z' | '-y'
function quad(list, w, h, x, y, z, n, col, k) {
  const g = new THREE.PlaneGeometry(w, h);
  if (n === '-x') g.rotateY(-Math.PI / 2); else if (n === '+x') g.rotateY(Math.PI / 2); else if (n === '-z') g.rotateY(Math.PI); else if (n === '-y') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  list.push(prep(colorize(g, col, k)));
}

// ספסל בטון: פרופיל של מושב שזורם למשענת מעוגלת, באורך 0.6 מ', המושב פונה לכביש
function concreteBench(list, a, d) {
  const s = new THREE.Shape();      // x = -d (מקדימה ← אחורה), y למעלה
  s.moveTo(0.26, 0); s.lineTo(0.26, 0.4); s.quadraticCurveTo(0.26, 0.46, 0.2, 0.46);
  s.lineTo(-0.08, 0.46); s.quadraticCurveTo(-0.2, 0.46, -0.24, 0.62); s.quadraticCurveTo(-0.27, 0.8, -0.34, 0.8);
  s.quadraticCurveTo(-0.42, 0.8, -0.42, 0.68); s.quadraticCurveTo(-0.42, 0.35, -0.3, 0.18); s.lineTo(-0.3, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.52, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 5 });
  g.clearGroups(); g.translate(0, 0, -0.26); g.rotateY(Math.PI / 2); g.translate(a, 0.12, d);
  list.push(prep(colorize(g, 0xe2e0db)));
}

function shelterParts() {
  const P = parts(), { steel, paint, glass, bench } = P;
  // שני עמודים מרובעים בפינות האחוריות
  for (const a of [A0 + 0.075, A1 - 0.075]) bevelBox(steel, 0.15, H, 0.15, a, H / 2, DB, 0.014);
  // קורה עליונה, גג דק: פלדה כהה מלמעלה, לבן מלמטה עם כמה צלעות, ושפה מקופלת מקדימה
  bevelBox(steel, LEN, 0.26, 0.12, AC, H - 0.13, DB, 0.01);
  const RD0 = DF, RD1 = DB + 0.16;
  bevelBox(steel, LEN + 0.22, 0.085, RD1 - RD0, AC, H + 0.042, (RD0 + RD1) / 2, 0.012);
  quad(paint, LEN + 0.16, RD1 - RD0 - 0.05, AC, H - 0.004, (RD0 + RD1) / 2, '-y', 0xe6eefc, 1.9);   // מוארת רק מלמטה (אור הקרקע העמום) — מבהירים
  for (const d of [2.15, 2.6, 3.05]) box(steel, LEN + 0.12, 0.03, 0.035, AC, H - 0.02, d);
  box(steel, LEN + 0.22, 0.055, 0.03, AC, H - 0.02, RD0 + 0.015);
  // קיר הרפפות: מסגרת, שתי חלוקות אנכיות ופסים אופקיים מוטים
  const wa0 = A0 + 0.15, wa1 = A1 - 0.15, wl = wa1 - wa0, wc = (wa0 + wa1) / 2;
  box(steel, wl, 0.05, 0.06, wc, 0.24, DB); box(steel, wl, 0.05, 0.06, wc, 2.3, DB);
  for (const k of [1, 2]) box(steel, 0.05, 2.06, 0.06, wa0 + wl * k / 3, 1.27, DB);
  for (let y = 0.32; y < 2.27; y += 0.098) {
    const g = new THREE.BoxGeometry(wl, 0.078, 0.016).rotateX(0.62).translate(wc, y, DB);
    steel.push(prep(colorize(g)));
  }
  // דופן זכוכית כהה בשני הקצוות, במסגרת פלדה, עם תיבה סגורה למעלה
  for (const a of [A0 + 0.075, A1 - 0.075]) {
    const d0 = DB - 0.075, span = d0 - DP, dc = (d0 + DP) / 2;
    box(steel, 0.055, 2.2, 0.055, a, 1.1, DP + 0.027);
    box(steel, 0.055, 0.055, span, a, 0.1, dc);
    bevelBox(steel, 0.1, 0.3, span + 0.055, a, 2.32, dc - 0.027, 0.01);
    box(glass, 0.014, 2.0, span - 0.02, a, 1.15, dc);
  }
  // ספסל נירוסטה מחורר, תלוי על הקיר, עם מסגרות צד משופעות. המושב 0.43 מ' מעל המרצפות (PAD.y)
  const b0 = AC - 1.0, b1 = AC + 1.0, sd0 = BENCH.d0, sd1 = BENCH.d1, sy = BENCH.y - 0.009;
  box(bench, b1 - b0, 0.018, sd1 - sd0, AC, sy, (sd0 + sd1) / 2);
  box(bench, b1 - b0, 0.05, 0.018, AC, sy - 0.02, sd0);
  for (const a of [b0, b1]) {
    const pts = [[sd1, sy - 0.04], [sd0 - 0.02, sy - 0.04], [sd0 - 0.12, sy + 0.13], [sd0 - 0.02, sy + 0.28], [sd1, sy + 0.28]];
    for (let k = 0; k + 1 < pts.length; k++) bar(bench, [a, pts[k][1], pts[k][0]], [a, pts[k + 1][1], pts[k + 1][0]], 0.034);
  }
  box(bench, 0.04, sy - PAD.y, 0.03, AC, (sy + PAD.y) / 2, DB - 0.04);
  // לוח המידע על הרפפות: מסגרת ופנים לבנים (הטקסט — בשלט הקרוב)
  bevelBox(steel, BOARD.w + 0.07, BOARD.h + 0.07, 0.035, BOARD.a, BOARD.y, DB - 0.062, 0.008);
  quad(paint, BOARD.w, BOARD.h, BOARD.a, BOARD.y, DB - 0.0805, '-z', 0xf2f3f4);
  // שני ספסלי בטון לבנים בצורת גל, מאחורי הסככה (כמו בתמונה)
  for (const a of [-8.85, -9.95]) concreteBench(paint, a, 3.45);
  return P;
}
// עמוד ושלט התחנה (דו-צדדי, פונה לאורך הכביש) — בכל תחנה, גם בלי סככה
function poleParts() {
  const P = parts(), { steel, paint } = P;
  const pole = new THREE.CylinderGeometry(0.042, 0.048, 3.55, 10).translate(POLE.a, 3.55 / 2, POLE.d);
  steel.push(prep(colorize(pole)));
  const sd = POLE.d - 0.03 - SIGN.w / 2;
  bevelBox(steel, 0.04, SIGN.h + 0.04, SIGN.w + 0.04, POLE.a, SIGN.y, sd, 0.008);
  for (const [x, n] of [[POLE.a - 0.0205, '-x'], [POLE.a + 0.0205, '+x']]) {
    quad(paint, SIGN.w, 0.24, x, SIGN.y + SIGN.h / 2 - 0.12, sd, n, 0xffffff);
    quad(paint, SIGN.w, SIGN.h - 0.24, x, SIGN.y - 0.12, sd, n, 0xf2cd16);
  }
  box(steel, 0.08, 0.06, 0.12, POLE.a, SIGN.y + 0.3, POLE.d - 0.05);
  box(steel, 0.08, 0.06, 0.12, POLE.a, SIGN.y - 0.3, POLE.d - 0.05);
  return P;
}

// ---------- השלטים עם הטקסט (קנבס לכל תחנה קרובה)
const CS = 512;
const R_SIGN = [0, 0, 256, 304], R_BOARD = [256, 0, 256, 320], R_PLATES = [0, 320, 256, 192];
const FONT = 'Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';
function uvRegion(geo, [x, y, w, h]) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * w) / CS, 1 - (y + (1 - uv.getY(i)) * h) / CS);
  return geo;
}
function fitFont(g, text, weight, size, maxW, min = 9) {
  let s = size; g.font = `${weight} ${s}px ${FONT}`;
  while (s > min && g.measureText(text).width > maxW) { s -= 1; g.font = `${weight} ${s}px ${FONT}`; }
  return s;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function busIcon(g, x, y, w, h) {
  g.fillStyle = '#1d5ea8'; rr(g, x, y, w, h, 4); g.fill();
  const bx = x + w * 0.12, by = y + h * 0.24, bw = w * 0.76, bh = h * 0.46;
  g.fillStyle = '#fff'; rr(g, bx, by, bw, bh, 5); g.fill();
  g.fillStyle = '#1d5ea8';
  for (let k = 0; k < 4; k++) g.fillRect(bx + 4 + k * (bw - 8) / 4, by + 4, (bw - 8) / 4 - 3, bh * 0.38);
  g.fillStyle = '#fff';
  for (const fx of [0.25, 0.75]) { g.beginPath(); g.arc(bx + bw * fx, by + bh + 1, h * 0.09, 0, 7); g.fill(); }
}
function splitName(name) {
  const i = name.indexOf('/');
  return i > 0 && i < name.length - 1 ? [name.slice(0, i + 1), name.slice(i + 1)] : [name];
}
function drawSign(g, stop, rows) {
  const [x0, y0, W, Hh] = R_SIGN;
  g.fillStyle = '#ffffff'; g.fillRect(x0, y0, W, Hh);
  // כותרת: סמל אוטובוס, שם התחנה, מספר התחנה
  busIcon(g, x0 + 8, y0 + 9, 62, 50);
  g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillStyle = '#1b1d20';
  const lines = splitName(stop.name);
  const fs = Math.min(...lines.map(t => fitFont(g, t, 700, lines.length > 1 ? 23 : 26, W - 92)));
  g.font = `700 ${fs}px ${FONT}`;
  lines.forEach((t, k) => g.fillText(t, x0 + W - 9, y0 + (lines.length > 1 ? 30 + k * 25 : 44)));
  g.direction = 'ltr'; g.textAlign = 'left'; g.font = `700 17px ${FONT}`; g.fillText(stop.code || stop.id, x0 + 10, y0 + 80);
  g.direction = 'rtl'; g.textAlign = 'right'; g.font = `500 10px ${FONT}`; g.fillStyle = '#555'; g.fillText('מספר תחנה', x0 + 112, y0 + 80);
  // שורות צהובות: מספר קו ויעד
  const top = y0 + 88, rh = (Hh - 92) / 6;
  g.fillStyle = '#f2cd16'; g.fillRect(x0, top, W, Hh - 88);
  for (let k = 0; k < 6; k++) {
    const y = top + k * rh;
    g.fillStyle = '#2b2b2b'; g.fillRect(x0, y, W, 2);
    const r = rows[k]; if (!r) continue;
    g.direction = 'ltr'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#141414';
    g.font = `800 ${fitFont(g, r.num, 800, 24, 74)}px ${FONT}`; g.fillText(r.num, x0 + 9, y + rh / 2 + 2);
    g.direction = 'rtl'; g.textAlign = 'right';
    g.font = `700 ${fitFont(g, r.dest, 700, 17, W - 100)}px ${FONT}`; g.fillText(r.dest, x0 + W - 9, y + rh / 2 + 2);
  }
  g.fillStyle = '#2b2b2b'; g.fillRect(x0, y0 + 86, W, 2);
  g.strokeStyle = '#3a3d41'; g.lineWidth = 4; g.strokeRect(x0 + 2, y0 + 2, W - 4, Hh - 4);
  g.textBaseline = 'alphabetic';
}
function drawBoard(g, stop, rows) {
  const [x0, y0, W, Hh] = R_BOARD;
  g.fillStyle = '#eef0f2'; g.fillRect(x0, y0, W, Hh);
  // פס כותרת: שם התחנה, ומימין "תחנה מספר"
  g.fillStyle = '#5f6872'; g.fillRect(x0 + 6, y0 + 6, W - 12, 44);
  g.fillStyle = '#fff'; g.direction = 'rtl'; g.textAlign = 'right';
  g.font = `500 9px ${FONT}`; g.fillText('תחנה מספר', x0 + W - 12, y0 + 20);
  g.font = `700 16px ${FONT}`; g.fillText(stop.code || stop.id, x0 + W - 12, y0 + 40);
  const nm = stop.name.replace('/', ' / ');
  g.font = `700 ${fitFont(g, nm, 700, 17, W - 100)}px ${FONT}`; g.fillText(nm, x0 + W - 66, y0 + 34);
  // אין עישון
  g.strokeStyle = '#d33'; g.lineWidth = 3; g.beginPath(); g.arc(x0 + 26, y0 + 28, 13, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(x0 + 17, y0 + 37); g.lineTo(x0 + 35, y0 + 19); g.stroke();
  // עמודות הקווים (מימין לשמאל)
  const N = 7, cw = (W - 12) / N, ct = y0 + 56, ch = 150;
  for (let k = 0; k < N; k++) {
    const x = x0 + W - 6 - (k + 1) * cw;
    g.fillStyle = '#fff'; g.fillRect(x + 1.5, ct, cw - 3, ch);
    const r = rows[k]; if (!r) continue;
    g.fillStyle = '#5f6872'; g.fillRect(x + 3, ct + 2, cw - 6, 18);
    g.fillStyle = '#fff'; g.direction = 'ltr'; g.textAlign = 'center';
    g.font = `800 ${fitFont(g, r.num, 800, 14, cw - 8)}px ${FONT}`; g.fillText(r.num, x + cw / 2, ct + 16);
    g.fillStyle = '#9aa1a8'; const n = 10 + (r.n % 6);
    for (let j = 0; j < n; j++) { g.fillRect(x + 5, ct + 26 + j * 7, cw - 15 - (j * 7 % 5), 2); }
    g.fillStyle = '#6b7279'; g.fillRect(x + cw - 8, ct + 25, 2, n * 7);
    if (r.here) { g.fillStyle = '#f4d23a'; g.fillRect(x + 4, ct + 24 + r.here * 7, cw - 10, 6); }
  }
  // החלק התחתון: מידע ומפה משמאל, טבלאות זמנים מימין
  const bt = ct + ch + 8;
  g.fillStyle = '#fff'; g.fillRect(x0 + 6, bt, 74, Hh - bt - 6); g.fillRect(x0 + 84, bt, W - 90, Hh - bt - 6);
  g.fillStyle = '#c9383c'; g.fillRect(x0 + 10, bt + 4, 66, 30);
  g.fillStyle = '#dfe5ea'; g.fillRect(x0 + 10, bt + 40, 66, Hh - bt - 54);
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  for (const [a, b, c, d] of [[12, 60, 74, 48], [30, 42, 40, 100], [10, 82, 74, 92]]) { g.beginPath(); g.moveTo(x0 + a, bt + b); g.lineTo(x0 + c, bt + d); g.stroke(); }
  g.fillStyle = '#5f6872'; g.fillRect(x0 + 88, bt + 4, W - 98, 14);
  const tn = Math.max(1, Math.min(4, rows.length));
  const tw = (W - 102) / Math.min(4, Math.max(2, tn));
  for (let k = 0; k < tn && rows.length; k++) {
    const x = x0 + W - 10 - (k + 1) * tw;
    g.strokeStyle = '#aab1b8'; g.lineWidth = 1; g.strokeRect(x + 2, bt + 24, tw - 4, Hh - bt - 36);
    for (let j = 0; j < 9; j++) { g.fillStyle = '#c3c8cd'; g.fillRect(x + 5, bt + 30 + j * 8, tw - 10, 1); }
  }
  g.strokeStyle = '#b8bec4'; g.lineWidth = 3; g.strokeRect(x0 + 1.5, y0 + 1.5, W - 3, Hh - 3);
  g.textAlign = 'left'; g.direction = 'ltr';
}
function drawPlates(g, rows) {
  const [x0, y0] = R_PLATES;
  g.clearRect(x0, y0, 256, 192);
  rows.slice(0, 6).forEach((r, k) => {
    const x = x0 + (k % 2) * 128 + 4, y = y0 + Math.floor(k / 2) * 64 + 3;
    g.fillStyle = '#1d1d1d'; rr(g, x, y, 120, 58, 6); g.fill();
    g.fillStyle = '#f2c414'; rr(g, x + 3, y + 3, 114, 52, 4); g.fill();
    g.fillStyle = '#121212'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'ltr';
    g.font = `600 ${fitFont(g, r.num, 600, 44, 104)}px ${FONT}`; g.fillText(r.num, x + 60, y + 32);
  });
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
}
function signGeometry(nPlates, shelter) {
  const L = [];
  const sd = POLE.d - 0.03 - SIGN.w / 2;
  L.push(uvRegion(new THREE.PlaneGeometry(SIGN.w, SIGN.h).rotateY(-Math.PI / 2).translate(POLE.a - 0.0215, SIGN.y, sd), R_SIGN));
  L.push(uvRegion(new THREE.PlaneGeometry(SIGN.w, SIGN.h).rotateY(Math.PI / 2).translate(POLE.a + 0.0215, SIGN.y, sd), R_SIGN));
  if (shelter) L.push(uvRegion(new THREE.PlaneGeometry(BOARD.w, BOARD.h).rotateY(Math.PI).translate(BOARD.a, BOARD.y, DB - 0.0815), R_BOARD));
  for (let k = 0; k < (shelter ? Math.min(6, nPlates) : 0); k++) {
    const r = [(k % 2) * 128 + 4, 320 + Math.floor(k / 2) * 64 + 3, 120, 58];
    L.push(uvRegion(new THREE.PlaneGeometry(PLATE.w, PLATE.h).rotateY(-Math.PI / 2).translate(A0 - 0.004, PLATE.y0 - k * PLATE.step, DB), r));
  }
  return mergeGeometries(L.map(g => g.toNonIndexed()));
}

// ---------- המרצפות והשפה (בקואורדינטות העולם, רשת אחת לכל התחנות)
function padAndKerb(frames) {
  const P = { pos: [], uv: [] }, K = { pos: [], col: [] };
  const RED = new THREE.Color(0xc9243a), YEL = new THREE.Color(0xf0c419), GREY = new THREE.Color(0xb9b6b1);
  const w = (f, a, d, y) => { const [x, z] = frameXY(f, a, d); return [x, y, -z]; };
  for (const f of frames) {
    // כשהכביש רחב (האוטובוס נוסע רחוק מהשפה) — המדרכה בולטת אל הכביש עד האוטובוס, עם קצוות משופעים
    const bulge = Math.max(0, f.hw - KERB), T = bulge > 0.25 ? bulge * 1.6 : 0, Dd = T ? bulge : 0;
    const D1 = Math.max(f.depth, Dd + 0.5), poly = [[PAD.a0 - T, D1], [PAD.a0 - T, Dd], [PAD.a0, 0], [PAD.a1, 0], [PAD.a1 + T, Dd], [PAD.a1 + T, D1]];
    const c = [(PAD.a0 + PAD.a1) / 2, D1 * 0.6];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      for (const [a, d] of [c, q, p]) { P.pos.push(...w(f, a, d, PAD.y)); P.uv.push(a / 4, 1 - d / PAD.d1); }
    }
    // אבן שפה: למעלה, החזית לכביש והצד הפנימי. אדום-צהוב לסירוגין, כל מטר
    const edge = T ? [[PAD.a0 - T, Dd], [PAD.a0, 0], [PAD.a1, 0], [PAD.a1 + T, Dd]] : [[PAD.a0, 0], [PAD.a1, 0]];
    let run = 0;
    for (let i = 0; i + 1 < edge.length; i++) {
      const [a0, d0] = edge[i], [a1, d1] = edge[i + 1], L = Math.hypot(a1 - a0, d1 - d0);
      const ua = (a1 - a0) / L, ud = (d1 - d0) / L, na = -ud, nd = ua;     // na,nd — פנימה (d גדל)
      for (let s = 0; s < L - 1e-3; s += 1) {
        const e = Math.min(L, s + 1), col = Math.floor(run + s + 1e-3) % 2 ? YEL : RED;
        const A = [a0 + ua * s, d0 + ud * s], B = [a0 + ua * e, d0 + ud * e];
        const Ai = [A[0] + na * 0.2, A[1] + nd * 0.2], Bi = [B[0] + na * 0.2, B[1] + nd * 0.2];
        const yT = 0.165, yB = 0.085;
        const q4 = (p1, p2, p3, p4, cc) => { for (const p of [p1, p2, p3, p1, p3, p4]) { K.pos.push(...p); K.col.push(cc.r, cc.g, cc.b); } };
        q4(w(f, ...A, yT), w(f, ...Ai, yT), w(f, ...Bi, yT), w(f, ...B, yT), col);
        q4(w(f, ...A, yB), w(f, ...A, yT), w(f, ...B, yT), w(f, ...B, yB), col);
        q4(w(f, ...Ai, yT), w(f, ...Ai, PAD.y), w(f, ...Bi, PAD.y), w(f, ...Bi, yT), GREY);
      }
      run += L;
    }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
  pg.computeVertexNormals();
  if (pg.attributes.normal.count && pg.attributes.normal.getY(0) < 0) {      // סדר הקודקודים הפוך — הופכים כדי שהנורמל יפנה למעלה
    const a = pg.attributes.position.array, u = pg.attributes.uv.array;
    for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
    for (let i = 0; i < u.length; i += 6) for (let k = 0; k < 2; k++) { const t = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = t; }
    pg.computeVertexNormals();
  }
  const kg = new THREE.BufferGeometry();
  kg.setAttribute('position', new THREE.Float32BufferAttribute(K.pos, 3));
  kg.setAttribute('color', new THREE.Float32BufferAttribute(K.col, 3));
  kg.computeVertexNormals();
  return [pg, kg];
}

export class StopLayer {
  constructor(scene, stops, frameOf) {
    this.scene = scene; this.stops = stops; this.frameOf = frameOf;
    const env = scene.userData.envMap || null;
    this.group = new THREE.Group(); this.group.name = 'stops'; scene.add(this.group);
    const frames = stops.map(frameOf);
    // החומרים: פלדה צבועה אפור-פחם, צבע (לבן/צהוב, לפי צבע הקודקוד), זכוכית כהה מבריקה, נירוסטה מחוררת
    const mats = {
      steel: new THREE.MeshStandardMaterial({ name: 'stop-steel', color: 0x2b2e32, metalness: 0.5, roughness: 0.55, envMap: env, envMapIntensity: 0.4 }),
      paint: new THREE.MeshStandardMaterial({ name: 'stop-paint', vertexColors: true, metalness: 0, roughness: 0.75, envMap: env, envMapIntensity: 0.25, emissive: 0x111111 }),
      glass: new THREE.MeshStandardMaterial({ name: 'stop-glass', color: 0x0b0e12, metalness: 0.1, roughness: 0.06, envMap: env, envMapIntensity: 0.9, transparent: true, opacity: 0.92 }),
      bench: new THREE.MeshStandardMaterial({ name: 'stop-bench', color: 0xe4e8ec, map: perforatedTexture(), metalness: 0.75, roughness: 0.38, envMap: env, envMapIntensity: 0.9 }),
    };
    mats.bench.map.repeat.set(6, 6);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    this.matrices = frames.map(f => m.clone().compose(new THREE.Vector3(f.kx, 0, -f.ky), q.setFromAxisAngle(up, Math.atan2(f.ty, f.tx)), one));
    const withShelter = this.matrices.filter((M, i) => frames[i].shelter);
    for (const [name, P, list] of [['shelter', shelterParts(), withShelter], ['pole', poleParts(), this.matrices]]) {
      for (const k of Object.keys(P)) {
        if (!P[k].length || !list.length) continue;
        const geo = mergeGeometries(P[k]);
        if (k !== 'paint') geo.deleteAttribute('color');
        const im = new THREE.InstancedMesh(geo, mats[k], list.length);
        list.forEach((M, i) => im.setMatrixAt(i, M));
        im.name = `stop-${name}-${k}`; im.computeBoundingSphere();
        if (k === 'glass') im.renderOrder = 1;
        this.group.add(im);
      }
    }
    const [pg, kg] = padAndKerb(frames);
    const pad = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ map: pavingTexture(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    pad.name = 'stop-paving'; pad.renderOrder = 3;
    const kerb = new THREE.Mesh(kg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    kerb.name = 'stop-kerb';
    this.group.add(pad, kerb);
    // שלטים קרובים
    this.near = new Map();      // stopId -> {mesh, tex, canvas, key, n}
    this.t = 0; this.fontsOk = false;
    if (document.fonts) document.fonts.load(`700 20px Heebo`).then(() => { this.fontsOk = true; for (const e of this.near.values()) e.key = ''; }).catch(() => { this.fontsOk = true; });
    this.v = new THREE.Vector3();
  }
  // הקווים שעוצרים בתחנה: מספר ויעד (התחנה האחרונה), לפי מספר הקו
  rowsOf(stop, lines) {
    const out = [];
    for (const L of lines) {
      if (L.visible === false) continue;
      const k = L.stops.indexOf(stop); if (k < 0) continue;
      const last = L.stops[L.stops.length - 1];
      out.push({ num: String(L.def.number), dest: (last === stop ? L.stops[0] : last).name, n: L.stops.length, here: Math.min(18, k + 1) });
    }
    return out.sort((a, b) => (parseInt(a.num) || 0) - (parseInt(b.num) || 0) || a.num.localeCompare(b.num));
  }
  update(camera, lines, dt = 0) {
    this.t -= dt;
    const cam = camera.position, far = 85, maxN = 8;
    // קרובות: לפי מרחק מהמצלמה, עד 8
    const cand = [];
    this.stops.forEach((s, i) => {
      const f = this.frameOf(s); const dx = f.px - cam.x, dz = -f.py - cam.z, d = Math.hypot(dx, dz, cam.y);
      if (d < far) cand.push([d, s, i]);
    });
    cand.sort((a, b) => a[0] - b[0]); cand.length = Math.min(cand.length, maxN);
    const want = new Set(cand.map(c => c[1].id));
    for (const [id, e] of this.near) if (!want.has(id)) { e.mesh.visible = false; e.idle = (e.idle || 0) + 1; }
    for (const [, s, i] of cand) {
      let e = this.near.get(s.id);
      if (!e) {
        if (this.near.size >= 14) {      // מפנים את השלט שלא נראה הכי הרבה זמן
          let worst = null; for (const [id, x] of this.near) if (!want.has(id) && (!worst || x.idle > worst[1].idle)) worst = [id, x];
          if (worst) { worst[1].mesh.geometry.dispose(); worst[1].tex.dispose(); worst[1].mesh.material.dispose(); this.group.remove(worst[1].mesh); this.near.delete(worst[0]); }
        }
        const c = document.createElement('canvas'); c.width = c.height = CS;
        const tex = canvasTex(c);
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(this.matrices[i]); mesh.name = 'stop-signs-' + s.id;
        this.group.add(mesh);
        e = { mesh, tex, canvas: c, key: null, n: -1, idle: 0 };
        this.near.set(s.id, e);
      }
      e.mesh.visible = true; e.idle = 0;
      if (e.key === null || this.t <= 0) {
        const rows = this.rowsOf(s, lines);
        const key = (this.fontsOk ? 'f' : 'x') + rows.map(r => r.num + '>' + r.dest).join('|');
        if (key !== e.key) {
          e.key = key;
          const g = e.canvas.getContext('2d');
          g.clearRect(0, 0, CS, CS);
          drawSign(g, s, rows); drawBoard(g, s, rows); drawPlates(g, rows);
          e.tex.needsUpdate = true;
          const n = Math.min(6, rows.length);
          if (n !== e.n) { e.mesh.geometry.dispose(); e.mesh.geometry = signGeometry(n, this.frameOf(s).shelter); e.n = n; }
        }
      }
    }
    if (this.t <= 0) this.t = 0.5;
  }
}
