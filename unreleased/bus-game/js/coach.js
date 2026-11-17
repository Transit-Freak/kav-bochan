// אוטובוס בין-עירוני (סוג רכב 'coach', fleet.js): אותו דגם של האוטובוס הרגיל (bus.glb), עם פנים וחוץ אחרים — נבנים כאן בקוד.
// פנים: מושבי נוסעים גבוהים 2+2 לכל האורך (במקום המושבים העירוניים ואזור העמידה), מדפי חבילות לאורך שני הצדדים עם פסי לד,
// יחידת שירות מתחת למדף מעל כל זוג מושבים (מנורות קריאה, פתחי מיזוג, כפתור "עצירה" שנדלק כשנוסע יורד בתחנה הקרובה,
// רמקול ושני שקעי USB), מסך תלוי מקדימה עם מספר הקו, השעה והתחנות, ובלי עמודים לאורך המעבר ובלי רצועות.
// חוץ: צבע הגוף לפי צבע הסוג, קו חלונות גבוה יותר, דלת אמצעית צרה, סורג מנוע, פנסי צד כתומים.
// הכול: כמה רשתות ממוזגות לכל חומר (קריאת ציור אחת לחומר), וטקסטורות קנבס קטנות. הדגם נבנה פעם אחת וכל האוטובוסים משכפלים אותו.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { keep } from './texkeep.js';

const FL = 0.675;                    // רצפת הנוסעים
const CUSH = 1.14;                   // גובה הכרית — כמו באוטובוס הרגיל (sitting.js / sitpresets.js מחושבים לגובה הזה)
// שורות המושבים: z של מרכז הכרית, ובאיזה צד יש זוג מושבים (‎+1 — צד הנהג, ‎-1 — צד הדלתות). בצד הדלתות אין שורות מול
// הדלת האמצעית. 21 זוגות = 42 מקומות (TYPES.coach.cap)
export const COACH_ROWS = [[4.0, [1, -1]], [3.2, [1, -1]], [2.4, [1, -1]], [1.6, [1, -1]], [0.8, [1]], [0.0, [1]], [-0.8, [1]],
  [-1.6, [1, -1]], [-2.4, [1, -1]], [-3.2, [1, -1]], [-4.0, [1, -1]], [-4.8, [1, -1]]];
export const COACH_SEAT_X = [0.505, 0.945];          // מרכז המושב: מעבר, חלון (כמו בדגם הרגיל)
// הדלת האמצעית צרה (כנף אחת): רק החצי האחורי של הפתח נשאר פתוח; העוגן שהנוסעים יורדים בו זז אליו
const MID = { z0: -0.585, z1: 0.635, keep: [-0.585, 0.06] };

// ---------- גאומטריה
function rbox(w, h, d, r, k = 2) {
  const N = 2 * k + 1, half = [w / 2, h / 2, d / 2];
  const g = new THREE.BoxGeometry(w, h, d, N, N, N);
  const p = g.attributes.position, nrm = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  const remap = (x, hf) => { const i = Math.round((x + hf) / (2 * hf / N)); if (i <= k) return -hf + r * (i / k); if (i >= N - k) return hf - r * ((N - i) / k); return x; };
  for (let i = 0; i < p.count; i++) {
    v.set(remap(p.getX(i), half[0]), remap(p.getY(i), half[1]), remap(p.getZ(i), half[2]));
    c.set(THREE.MathUtils.clamp(v.x, -half[0] + r, half[0] - r), THREE.MathUtils.clamp(v.y, -half[1] + r, half[1] - r), THREE.MathUtils.clamp(v.z, -half[2] + r, half[2] - r));
    v.sub(c); const L = v.length(); if (L > 1e-6) { v.multiplyScalar(r / L); nrm.setXYZ(i, v.x / r, v.y / r, v.z / r); }
    v.add(c); p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const M4 = new THREE.Matrix4(), E = new THREE.Euler();
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rx || ry || rz) g.applyMatrix4(M4.makeRotationFromEuler(E.set(rx, ry, rz))); return g.translate(x, y, z); };
function rod(a, b, r, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5); return g.translate(m.x, m.y, m.z);
}
// אוסף חלקים לפי חומר, וממזג לרשת אחת לכל חומר
class Parts {
  constructor() { this.by = new Map(); }
  add(m, g) { const gg = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    (this.by.get(m) || this.by.set(m, []).get(m)).push(gg); return this; }
  build(parent, name) { for (const [m, list] of this.by) { const mesh = new THREE.Mesh(list.length > 1 ? mergeGeometries(list, false) : list[0], m); mesh.name = name + '_' + m.name; mesh.receiveShadow = false; parent.add(mesh); } }
}

// ---------- טקסטורות (קנבס קטן)
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(20261117);
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// ריפוד: בד בהיר עם משיכות מכחול קצרות בשחור, צהוב, אדום וכחול (דוגמה שלנו, מקרית)
function fabricTex() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#ece6d8'; x.fillRect(0, 0, w, h);
    const cols = ['#1d1d1f', '#1d1d1f', '#f2b705', '#d7261e', '#1f4fa8', '#1f4fa8', '#e86f1c'];
    x.lineCap = 'round';
    for (let i = 0; i < 300; i++) {
      const cx = rnd() * w, cy = rnd() * h, a = rnd() * Math.PI, L = 7 + rnd() * 14, c = cols[Math.floor(rnd() * cols.length)];
      x.strokeStyle = c; x.lineWidth = 2.5 + rnd() * 3; x.globalAlpha = 0.85;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {     // נמשך מעבר לקצה — בלי תפר בחזרה
        x.beginPath(); x.moveTo(cx + ox - Math.cos(a) * L / 2, cy + oy - Math.sin(a) * L / 2);
        x.quadraticCurveTo(cx + ox + (rnd() - 0.5) * 6, cy + oy + (rnd() - 0.5) * 6, cx + ox + Math.cos(a) * L / 2, cy + oy + Math.sin(a) * L / 2); x.stroke(); }
    }
    x.globalAlpha = 1;
  }, true);
}
// כיס רשת בגב המושב
function netTex() {
  return canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#2a302d'; x.fillRect(0, 0, w, h); x.strokeStyle = '#0d0f0e'; x.lineWidth = 2;
    for (let i = -w; i < w * 2; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); }
    x.fillStyle = '#3a4440'; x.fillRect(0, 0, w, 7);              // השפה העליונה של הכיס
  }, true);
}
// יחידת השירות שמתחת למדף (פונה למטה). "למעלה" בטקסטורה — לכיוון הקיר: לוחית USB שחורה, ואחריה הלוח האובלי עם שתי מנורות
// קריאה, שני פתחי מיזוג, כפתור "עצירה" צהוב בין שני כפתורי מנורה לבנים, ורמקול עגול בצד המעבר
function psuTex() {
  return canvasTex(256, 192, (x, w, h) => {
    x.fillStyle = '#cfcac0'; x.fillRect(0, 0, w, h);
    // לוחית USB
    x.fillStyle = '#16181a'; rr(x, 88, 6, 80, 26, 5); x.fill();
    for (const ux of [104, 136]) { x.fillStyle = '#5c6166'; rr(x, ux, 13, 18, 10, 2); x.fill(); x.fillStyle = '#0a0a0a'; x.fillRect(ux + 3, 16, 12, 4); }
    // הלוח האובלי
    const g = x.createLinearGradient(0, 40, 0, h); g.addColorStop(0, '#e2ddd2'); g.addColorStop(1, '#bdb6a8');
    x.fillStyle = g; x.beginPath(); x.ellipse(128, 114, 118, 72, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#9d968a'; x.lineWidth = 3; x.stroke();
    for (const lx of [60, 196]) {      // מנורות קריאה
      x.fillStyle = '#8f8a80'; x.beginPath(); x.arc(lx, 70, 17, 0, 7); x.fill();
      x.fillStyle = '#fbf7ea'; x.beginPath(); x.arc(lx, 70, 12, 0, 7); x.fill(); }
    for (const lx of [74, 182]) {      // פתחי מיזוג (מתחת יש גם בליטה תלת-ממדית)
      x.fillStyle = '#6e6a63'; x.beginPath(); x.arc(lx, 112, 19, 0, 7); x.fill();
      x.fillStyle = '#2d2c2a'; x.beginPath(); x.arc(lx, 112, 9, 0, 7); x.fill(); }
    for (const bx of [104, 152]) {     // כפתורי מנורה לבנים
      x.fillStyle = '#f7f7f4'; rr(x, bx - 9, 104, 18, 16, 4); x.fill(); x.fillStyle = '#9aa0a6'; x.beginPath(); x.arc(bx, 112, 3, 0, 7); x.fill(); }
    x.fillStyle = '#f2c200'; rr(x, 113, 100, 30, 24, 5); x.fill();   // עצירה (הזוהר — רשת נפרדת מעליו)
    x.fillStyle = '#3a3324'; x.font = '700 9px Arial'; x.textAlign = 'center'; x.fillText('STOP', 128, 116);
    x.fillStyle = '#9b958a'; x.beginPath(); x.arc(128, 160, 20, 0, 7); x.fill();   // רמקול
    x.fillStyle = '#4b4842'; for (let a = 0; a < 6; a++) for (let r = 5; r <= 15; r += 5) { const t = a / 6 * Math.PI * 2 + r; x.beginPath(); x.arc(128 + Math.cos(t) * r, 160 + Math.sin(t) * r, 1.6, 0, 7); x.fill(); }
    x.beginPath(); x.arc(128, 160, 1.8, 0, 7); x.fill();
  });
}
// סורג המנוע (פסים אופקיים)
function grilleTex() {
  return canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#121416'; x.fillRect(0, 0, w, h); for (let y = 2; y < h; y += 8) { x.fillStyle = '#3d4247'; x.fillRect(0, y, w, 4); x.fillStyle = '#5a6066'; x.fillRect(0, y, w, 1); } }, true);
}
function rr(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }

// ---------- מה שיוצא מהדגם הרגיל (במקום — רק בעותק של הבין-עירוני; הגאומטריה משוכפלת לפני השינוי)
// מוחק משולשים של רשת לפי מקום (במערכת האוטובוס)
function dropTris(o, root, kill) {
  if (!o.geometry?.index) return;
  const inv = new THREE.Matrix4(); o.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
  const M = new THREE.Matrix4().multiplyMatrices(inv.copy(root.matrixWorld).invert(), o.matrixWorld);
  const g = o.geometry, pos = g.attributes.position, idx = g.index.array, keepI = [], v = [0, 1, 2].map(() => new THREE.Vector3()), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(M);
    c.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3);
    if (!kill(c, v)) keepI.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (keepI.length === idx.length) return;
  o.geometry = g.clone(); o.geometry.setIndex(keepI);
}
// העמודים שנשארים: ליד הדלת הקדמית וליד הדלת האמצעית (בצד הדלתות). כל השאר — ומה שעליהם (כפתורי עצירה) — יוצאים
const KEEP_POLES = [[-0.5, 5.65], [-0.5, 4.5], [-0.5, 0.75], [-0.5, -0.36], [-0.5, -0.7]];
const GONE_POLES = [[-0.5, 2.84], [0.5, 2.84], [-0.5, 1.24], [0.5, 1.24], [0.5, 0.75], [0.5, -0.36], [0.5, -0.7], [-0.5, -1.96], [0.5, -1.96], [-0.5, -3.56], [0.5, -3.56], [-0.5, -5.16], [0.5, -5.16]];
const HIDE_MATS = /^M_(SeatFabric|SeatShell|USB|Sign5|Sign7|Sign8|Sign15|LCD)$/;   // מושבים עירוניים, שקעים בקיר, שלטי כסא הגלגלים, השלט שמעל המעבר, מסך הקו הישן
function stripCity(root) {
  root.updateMatrixWorld(true);
  const near = (c, list, r = 0.09) => list.some(([x, z]) => Math.abs(c.x - x) < r && Math.abs(c.z - z) < r);
  const list = []; root.traverse(o => list.push(o));
  for (const o of list) {
    if (o.name === 'Straps' || /^SM_StrapRing/.test(o.name) || /^SM_Seat/.test(o.name)) { o.visible = false; continue; }
    if (/^SM_Pole/.test(o.name)) { const p = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); if (!near(p, KEEP_POLES, 0.12)) o.visible = false; continue; }
    if (!o.isMesh || Array.isArray(o.material)) continue;
    const n = o.material.name;
    if (HIDE_MATS.test(n)) { o.visible = false; continue; }
    if (n === 'M_Steel') dropTris(o, root, c => c.y > 0.6 && c.y < 1.9 && Math.abs(c.x) < 1.24 && c.z < 4.4);        // מסגרות המושבים העירוניים
    else if (n === 'M_Pole') dropTris(o, root, c => c.y > 2.3 || (c.x > 0 && c.y > 0.7) || (c.y > 0.7 && near(c, GONE_POLES)));   // מאחזים בתקרה ובצד הנהג
    else if (n === 'M_StopBtn' || n === 'M_StopFace') dropTris(o, root, c => near(c, GONE_POLES) || c.x > 0.6);
    else if (n === 'M_Lamp') dropTris(o, root, c => c.y > 2.5 && c.y < 3.0 && Math.abs(c.x) > 0.6 && Math.abs(c.z) < 5.5);   // המנורות בתקרה — במקומן פסי לד
    else if (n === 'M_Sign16') dropTris(o, root, () => true);
  }
}

// ---------- המושב: מקום אחד, הראשית במרכז הכרית על הרצפה, פונה ל-‎+Z. aisle — הכיוון אל המעבר (‎±1)
function seatParts(P, M, x, z, aisle) {
  const T = (g) => g.translate(x, FL, z);
  const recl = -0.2, back = new THREE.Matrix4().makeRotationX(recl), bz = -0.205, by = CUSH - FL + 0.01;
  const B = (g, ly, lz) => { g.translate(0, ly, lz); g.applyMatrix4(back); return T(g.translate(0, by, bz)); };
  P.add(M.fabric, T(at(rbox(0.42, 0.11, 0.45, 0.04), 0, CUSH - FL - 0.055, 0.015)));                 // כרית
  P.add(M.fabric, B(rbox(0.42, 0.66, 0.09, 0.035), 0.36, 0));                                      // משענת
  P.add(M.fabric, B(rbox(0.38, 0.2, 0.11, 0.045), 0.79, 0.008));                                   // משענת ראש
  P.add(M.shell, B(rbox(0.44, 0.92, 0.05, 0.02), 0.46, -0.06));                                    // מעטפת הפלסטיק מאחור
  P.add(M.shell, B(box(0.03, 0.66, 0.1), -aisle * 0.205, 0.36, -0.01));                             // שוליים בצד החלון
  P.add(M.net, B(box(0.32, 0.22, 0.012), 0.3, -0.09));                                             // כיס רשת
  P.add(M.belt, B(box(0.035, 0.62, 0.012), -aisle * 0.165, 0.38, 0.05));                           // חגורת בטיחות (צד החלון)
  P.add(M.belt, T(at(box(0.05, 0.02, 0.07), aisle * 0.1, CUSH - FL + 0.005, -0.17)));              // האבזם
  // ידית אחיזה צהובה קצרה בפינה העליונה של המושב בצד המעבר
  const h0 = new THREE.Vector3(aisle * 0.15, 0.92, -0.075), h1 = new THREE.Vector3(aisle * 0.205, 0.92, -0.075);
  for (const g of [rod(h0, h0.clone().add(new THREE.Vector3(0, 0, -0.06)), 0.011), rod(h1, h1.clone().add(new THREE.Vector3(0, 0, -0.06)), 0.011), rod(h0.clone().add(new THREE.Vector3(0, 0, -0.06)), h1.clone().add(new THREE.Vector3(0, 0, -0.06)), 0.012)])
    { g.applyMatrix4(back); P.add(M.pole, T(g.translate(0, by, bz))); }
  // משענת יד בצד המעבר, ורגל המושב
  P.add(M.shell, T(at(rbox(0.05, 0.05, 0.36, 0.018), aisle * 0.235, CUSH - FL + 0.2, 0.0)));
  P.add(M.shell, T(at(box(0.035, 0.2, 0.05), aisle * 0.235, CUSH - FL + 0.08, -0.15)));
  P.add(M.frame, T(at(box(0.36, 0.06, 0.36), 0, CUSH - FL - 0.14, -0.01)));
  P.add(M.frame, T(at(box(0.05, CUSH - FL - 0.17, 0.05), aisle * 0.15, (CUSH - FL - 0.17) / 2, -0.02)));
}

// ---------- מדף החבילות, פסי הלד ויחידות השירות
const SHELF = { x0: 0.8, x1: 1.23, y0: 2.56, y1: 2.78, z0: -5.3, z1: 4.32 };
function shelfParts(P, M) {
  const L = SHELF.z1 - SHELF.z0, zc = (SHELF.z0 + SHELF.z1) / 2;
  for (const s of [1, -1]) {
    const xc = s * (SHELF.x0 + SHELF.x1) / 2, w = SHELF.x1 - SHELF.x0;
    P.add(M.shelf, at(box(w, 0.03, L), xc, SHELF.y0 + 0.015, zc));                                  // התחתית
    P.add(M.shelf, at(box(0.03, SHELF.y1 - SHELF.y0, L), s * SHELF.x0, (SHELF.y0 + SHELF.y1) / 2, zc));   // החזית
    P.add(M.trimDark, at(box(0.035, 0.03, L), s * (SHELF.x0 - 0.004), SHELF.y0 + 0.005, zc));         // פס כהה בשפה
    P.add(M.shelf, at(box(w, 0.02, L), xc, SHELF.y1, zc));                                            // המדף עצמו
    P.add(M.shelf, at(box(0.03, 3.07 - SHELF.y1, L), s * (SHELF.x0 + 0.03), (3.07 + SHELF.y1) / 2, zc));   // מחיצה עד התקרה
    P.add(M.led, at(box(0.012, 0.035, L - 0.1), s * (SHELF.x0 + 0.012), 2.98, zc));                 // פס לד לבן
    P.add(M.shelf, at(box(w + 0.03, SHELF.y1 - SHELF.y0, 0.03), xc, (SHELF.y0 + SHELF.y1) / 2, SHELF.z1));   // דפנות בקצוות
    P.add(M.shelf, at(box(w + 0.03, SHELF.y1 - SHELF.y0, 0.03), xc, (SHELF.y0 + SHELF.y1) / 2, SHELF.z0));
  }
}
// יחידת שירות מעל כל זוג מושבים: הלוח (טקסטורה), שני פתחי מיזוג בולטים, וכפתור העצירה (רשת נפרדת שנדלקת)
const PSU = { w: 0.34, d: 0.26 };
function psuParts(P, stopP, M) {
  for (const [z, sides] of COACH_ROWS) for (const s of sides) {
    const xc = s * (SHELF.x0 + SHELF.x1) / 2, zc = z + 0.05, y = SHELF.y0 - 0.004;
    // הלוח: ‎u לאורך האוטובוס, ‎v מהקיר (למעלה בטקסטורה) אל המעבר
    P.add(M.psu, fixPlane(s).translate(xc, y, zc));
    for (const dv of [-0.29, 0.29]) {   // פתחי המיזוג (בטקסטורה x = 74, 182 מתוך 256 → ‎±0.29 מהמרכז, לאורך)
      const vz = zc + dv * PSU.d * 0.84 * s, vx = xc + s * 0.0;
      P.add(M.vent, at(new THREE.CylinderGeometry(0.026, 0.03, 0.022, 12), vx - s * 0.005, y - 0.011, vz));
      P.add(M.ventDark, at(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 10), vx - s * 0.005, y - 0.023, vz));
    }
    stopP.push(at(box(0.034, 0.006, 0.03), xc - s * 0.002, y - 0.003, zc));
  }
}
// משטח שפונה למטה: ‎u של הטקסטורה לאורך ‎z, ‎v (למעלה) אל הקיר (‎s·x)
function fixPlane(s) {
  const g = new THREE.BufferGeometry(), hw = PSU.w / 2, hd = PSU.d / 2;
  // ארבע פינות: (u,v) → (x,z). v=1 — ליד הקיר
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => [s * (-hw + v * PSU.w) * 1, (u - 0.5) * PSU.d * (s > 0 ? 1 : -1), u, v]);
  const pos = [], uv = [];
  for (const i of [0, 2, 1, 0, 3, 2]) { const [x, z, u, v] = pts[i]; pos.push(x, 0, z); uv.push(u, v); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) > 0) { const p = g.attributes.position.array, u2 = g.attributes.uv.array;   // שהנורמל יפנה למטה
    for (let t = 0; t < 6; t += 3) { for (let k = 0; k < 3; k++) { const a = p[(t + 1) * 3 + k]; p[(t + 1) * 3 + k] = p[(t + 2) * 3 + k]; p[(t + 2) * 3 + k] = a; } for (let k = 0; k < 2; k++) { const a = u2[(t + 1) * 2 + k]; u2[(t + 1) * 2 + k] = u2[(t + 2) * 2 + k]; u2[(t + 2) * 2 + k] = a; } }
    g.computeVertexNormals(); }
  return g;
}

// ---------- המסך התלוי מקדימה: מספר הקו, השעה, ורצועת מסלול כתומה עם ארבע תחנות ודקות
export const MON = { x: 0, y: 2.6, z: 4.5, w: 0.72, h: 0.405 };
function monitorParts(P, M) {
  P.add(M.monFrame, at(rbox(MON.w + 0.04, MON.h + 0.04, 0.05, 0.012), MON.x, MON.y, MON.z + 0.02));
  P.add(M.frame, at(box(0.06, 3.07 - (MON.y + MON.h / 2), 0.03), MON.x, (3.07 + MON.y + MON.h / 2) / 2, MON.z + 0.03));
}
function monitorMesh(mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(MON.w, MON.h).rotateY(Math.PI), mat); m.position.set(MON.x, MON.y, MON.z - 0.007); m.name = 'CoachInterior_Monitor'; return m;
}
const FONT = 'Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';
export function monitorDisplay() {
  const W = 640, H = 360, c = document.createElement('canvas'); c.width = W; c.height = H;
  const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: t, name: 'M_CoachMonLive', toneMapped: false });
  let key = '';
  const fit = (x, s, max, px, w) => { let p = px; x.font = `${w} ${p}px ${FONT}`; while (p > 12 && x.measureText(s).width > max) { p -= 2; x.font = `${w} ${p}px ${FONT}`; } };
  return { mat, draw(d) {
    const k = JSON.stringify(d); if (k === key) return; key = k;
    const x = c.getContext('2d'); x.direction = 'rtl';
    x.fillStyle = '#0d1b2e'; x.fillRect(0, 0, W, H);
    // מימין: מספר הקו והשעה
    x.fillStyle = '#12304f'; x.fillRect(W - 200, 0, 200, H);
    x.textAlign = 'center'; x.fillStyle = '#ffffff'; x.font = `600 26px ${FONT}`; x.fillText('קו', W - 100, 48);
    x.fillStyle = '#ffb020'; fit(x, d.num, 180, 120, 800); x.textBaseline = 'middle'; x.fillText(d.num, W - 100, 135); x.textBaseline = 'alphabetic';
    x.fillStyle = '#ffffff'; fit(x, d.dest ? 'אל ' + d.dest : '', 180, 24, 600); x.fillText(d.dest ? 'אל ' + d.dest : '', W - 100, 222);
    x.fillStyle = '#ffffff'; x.font = `700 44px ${FONT}`; x.direction = 'ltr'; x.fillText(d.clock || '', W - 100, 310); x.direction = 'rtl';
    // רצועת המסלול הכתומה (אנכית) ושורות התחנות
    const sx = W - 236, rows = d.rows || [], top = 34, step = (H - 2 * top) / 3;
    x.fillStyle = '#f07d00'; x.fillRect(sx - 9, top, 18, H - 2 * top);
    rows.forEach((r, i) => {
      const y = top + i * step, cur = i === 1;
      x.fillStyle = r.dim ? '#7d8796' : '#ffffff'; x.beginPath(); x.arc(sx, y, cur ? 15 : 11, 0, 7); x.fill();
      x.strokeStyle = '#f07d00'; x.lineWidth = 5; x.stroke();
      x.textAlign = 'right'; x.fillStyle = cur ? '#ffb020' : '#aab6c6'; x.font = `600 21px ${FONT}`; x.fillText(r.label, sx - 28, y - 13);
      x.fillStyle = r.dim ? '#8a96a8' : '#ffffff'; fit(x, r.name || '—', sx - 140, cur ? 34 : 28, cur ? 800 : 600); x.fillText(r.name || '—', sx - 28, y + 22);
      if (r.min != null) { x.textAlign = 'left'; x.fillStyle = cur ? '#ffb020' : '#ffffff'; x.font = `800 ${cur ? 40 : 32}px ${FONT}`; x.direction = 'ltr'; x.fillText(String(r.min), 22, y + 14);
        x.font = `500 18px ${FONT}`; x.fillStyle = '#aab6c6'; x.direction = 'rtl'; x.textAlign = 'left'; x.fillText("דק'", 70 + (r.min > 9 ? 22 : 0), y + 12); x.direction = 'rtl'; }
    });
    t.needsUpdate = true;
  } };
}
// הנתונים למסך: התחנה הקודמת, הקרובה, הבאה והאחרונה, ובכמה דקות מגיעים (לפי המרחק על הקו, כ-25 קמ"ש ועצירה של 20 שנ' בכל תחנה)
export function monitorData(b, clock) {
  const L = b.line, n = L.stops.length, k = Math.min(n - 1, b.next), name = i => (i >= 0 && i < n ? L.stops[i].name : '');
  const mins = i => i < k ? null : Math.max(0, Math.round(((L.stopS[i] - b.s) / 7 + 20 * (i - k)) / 60));
  return { num: String(L.def.number), dest: name(n - 1), clock, rows: [
    { label: 'התחנה הקודמת', name: name(k - 1), min: null, dim: true },
    { label: 'התחנה הקרובה', name: name(k), min: mins(k) },
    { label: 'התחנה הבאה', name: k + 1 < n ? name(k + 1) : '', min: k + 1 < n ? mins(k + 1) : null },
    { label: 'תחנה אחרונה', name: name(n - 1), min: mins(n - 1) },
  ] };
}
// מסך כבוי/כללי — לאוטובוסים שאף אחד לא בתוכם
function idleMonTex() { return canvasTex(64, 36, (x, w, h) => { x.fillStyle = '#0d1b2e'; x.fillRect(0, 0, w, h); x.fillStyle = '#f07d00'; x.fillRect(w - 22, 6, 3, h - 12); }); }

// ---------- חוץ: צבע, קו חלונות גבוה, דלת אמצעית צרה, סורג מנוע ופנסי צד
function exteriorParts(P, M) {
  for (const s of [1, -1]) {
    const X = s * 1.282;
    // קו החלונות עולה ב-25 ס"מ: פס בצבע הגוף על החלק התחתון של החלונות (מבחוץ) ופס חיפוי מבפנים
    const spans = s > 0 ? [[-5.15, 3.78], [3.78, 5.7]] : [[-5.15, MID.z0 - 0.02], [MID.z1 + 0.02, 3.85]];
    for (const [z0, z1] of spans) {
      P.add(M.body, at(box(0.012, 0.25, z1 - z0), X, 1.445, (z0 + z1) / 2));
      P.add(M.panel, at(box(0.01, 0.25, z1 - z0), s * 1.215, 1.445, (z0 + z1) / 2));
      P.add(M.trimDark, at(box(0.014, 0.02, z1 - z0), X + s * 0.001, 1.58, (z0 + z1) / 2));
    }
    // קו חצאית כהה, ופנסי צד כתומים
    P.add(M.trimDark, at(box(0.014, 0.05, 11.3), X, 0.62, 0));
    for (const z of [4.2, 1.9, -1.3, -3.6, -5.6]) P.add(M.amber, at(rbox(0.02, 0.05, 0.1, 0.008), X + s * 0.006, 0.5, z));
    // שני חלונות חירום קטנים עם ציר עליון (מסגרת כהה בחלק העליון)
    for (const z of [2.0, -3.2]) { P.add(M.trimDark, at(box(0.016, 0.02, 0.9), X, 2.42, z)); P.add(M.trimDark, at(box(0.016, 0.3, 0.02), X, 2.57, z - 0.45)); P.add(M.trimDark, at(box(0.016, 0.3, 0.02), X, 2.57, z + 0.45)); }
  }
  // סורג המנוע בדופן האחורית (צד הנהג)
  P.add(M.grille, at(box(0.02, 0.6, 1.25), 1.285, 0.95, -4.75));
  P.add(M.trimDark, at(box(0.024, 0.66, 1.31), 1.282, 0.95, -4.75));
  // הדלת האמצעית צרה: החצי הקדמי של הפתח סגור — לוח בצבע הגוף למטה וזכוכית כהה למעלה, מבחוץ ומבפנים
  const z0 = MID.keep[1], z1 = MID.z1, zc = (z0 + z1) / 2, dz = z1 - z0;
  P.add(M.body, at(box(0.02, 1.18, dz), -1.27, 0.89, zc));
  P.add(M.glassDark, at(box(0.012, 1.12, dz - 0.04), -1.282, 2.07, zc));
  P.add(M.trimDark, at(box(0.03, 2.4, 0.04), -1.272, 1.3, z0));
  P.add(M.panel, at(box(0.02, 1.1, dz), -1.2, 1.2, zc));
  P.add(M.steelDark, at(box(0.3, 0.08, dz), -1.06, FL - 0.02, zc));   // מדרגה סגורה
}

// ---------- הבנייה: פעם אחת לדגם (העותק של הבין-עירוני). tint — צבע הגוף
export function buildCoach(root, tint) {
  stripCity(root);
  // החומרים
  const byName = new Map(); root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && !byName.has(m.name)) byName.set(m.name, m); });
  const std = (name, o) => new THREE.MeshStandardMaterial({ name, roughness: 0.6, metalness: 0, ...o });
  const fab = fabricTex(); fab.repeat.set(3.2, 3.2);
  const M = {
    fabric: std('M_CoachFabric', { map: fab, roughness: 0.92 }),
    shell: std('M_CoachShell', { color: 0x3b4842, roughness: 0.55 }),
    net: std('M_CoachNet', { map: netTex(), roughness: 0.9 }),
    belt: std('M_CoachBelt', { color: 0x1a1c1e, roughness: 0.7 }),
    frame: std('M_CoachFrame', { color: 0x2b2e31, roughness: 0.5, metalness: 0.3 }),
    pole: byName.get('M_Pole') || std('M_Pole', { color: 0xf2b80d, roughness: 0.35 }),
    shelf: std('M_CoachShelf', { color: 0xdedad2, roughness: 0.55 }),
    trimDark: std('M_CoachTrim', { color: 0x2a2d30, roughness: 0.5 }),
    led: new THREE.MeshBasicMaterial({ name: 'M_CoachLED', color: 0xf4f8ff }),
    psu: std('M_CoachDetPSU', { map: psuTex(), roughness: 0.45, emissive: 0x202020 }),
    vent: std('M_CoachDetVent', { color: 0xb4ada2, roughness: 0.4, metalness: 0.2 }),
    ventDark: std('M_CoachDetVentIn', { color: 0x2a2826, roughness: 0.6 }),
    monFrame: std('M_CoachMonFrame', { color: 0x111315, roughness: 0.35 }),
    body: std('M_CoachBody', { color: tint, roughness: 0.35, metalness: 0.15 }),
    panel: byName.get('M_Panel') || std('M_Panel', { color: 0xb9bbbd }),
    amber: new THREE.MeshBasicMaterial({ name: 'M_CoachDetAmber', color: 0xffa31a }),
    grille: std('M_CoachGrille', { map: (t => (t.repeat.set(4, 2), t))(grilleTex()), roughness: 0.6 }),
    glassDark: std('M_CoachGlass', { color: 0x0b0f14, roughness: 0.08, metalness: 0.3 }),
    steelDark: std('M_CoachStep', { color: 0x3a3d40, roughness: 0.5, metalness: 0.4 }),
  };
  // הגוף בצבע הסוג (רק בעותק הזה), והזכוכית כהה יותר (חלונות כהים ברצועה רציפה)
  const swap = new Map();
  root.traverse(o => { if (!o.isMesh) return; const f = m => { if (!m) return m; if (m.name === 'M_Silver' || m.name === 'M_BodyWhite') return swap.get(m) || swap.set(m, M.body).get(m);
    if (m.name === 'M_Glass') { if (!swap.has(m)) { const g = m.clone(); g.color = m.color.clone().multiplyScalar(0.55); g.opacity = Math.min(1, (m.opacity ?? 1) + 0.06); swap.set(m, g); } return swap.get(m); } return m; };
    o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
  const grp = new THREE.Group(); grp.name = 'CoachInterior'; root.add(grp);
  const P = new Parts(), stopG = [];
  for (const [z, sides] of COACH_ROWS) for (const s of sides) for (const sx of COACH_SEAT_X) seatParts(P, M, s * sx, z, -s);
  shelfParts(P, M); psuParts(P, stopG, M); monitorParts(P, M); exteriorParts(P, M);
  P.build(grp, 'CoachInterior');
  // כפתורי העצירה: רשת אחת, לכל אוטובוס חומר משלו (נדלק בבקשת עצירה)
  const stop = new THREE.Mesh(mergeGeometries(stopG.map(g => g.toNonIndexed()), false), new THREE.MeshStandardMaterial({ name: 'M_CoachDetStop', color: 0xf2c200, emissive: 0x000000, roughness: 0.4 }));
  stop.name = 'CoachInterior_Stop'; grp.add(stop);
  const mon = monitorMesh(new THREE.MeshBasicMaterial({ name: 'M_CoachDetMon', map: idleMonTex(), toneMapped: false })); grp.add(mon);
  // העוגן של הדלת האמצעית: אל החצי הפתוח
  const a = root.getObjectByName('Anchor_DoorMid'); if (a) a.position.z += (MID.keep[0] + MID.keep[1]) / 2 - (MID.z0 + MID.z1) / 2;
  root.userData.coach = true;
}
// הכנף הקדמית של הדלת האמצעית (מאחורי הלוח הסגור) — מוסתרת בכל שכפול
export function coachClone(obj) {
  obj.traverse(o => { if (/^Leaf_Mid/.test(o.name)) { const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
    if (c.z > (MID.keep[1] + MID.z0) / 2 + 0.25 || /Mid1$/.test(o.name) && c.z > MID.keep[1] - 0.1) o.visible = false; } });
  const stop = obj.getObjectByName('CoachInterior_Stop'); if (stop) stop.material = stop.material.clone();
  return { stop, mon: obj.getObjectByName('CoachInterior_Monitor'), idle: obj.getObjectByName('CoachInterior_Monitor')?.material, lit: false };
}
// בכל פריים: כפתורי העצירה נדלקים כשמישהו יורד בתחנה הקרובה (בנסיעה)
export function coachTick(c, b) {
  if (!c?.stop) return;
  const L = b.line, on = b.state === 'drive' && b.next < L.stops.length - 1 && b.next > 0 && b.pax.some(p => p.to === b.next);
  if (on !== c.lit) { c.lit = on; c.stop.material.emissive.setHex(on ? 0xffb000 : 0x000000); c.stop.material.emissiveIntensity = on ? 1.4 : 0; }
}
