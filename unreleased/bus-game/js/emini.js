// מיניבוס חשמלי (סוג רכב 'emini', fleet.js): אותו גוף של המיניבוס (bus_mini.glb), עם מראה של מיניבוס חשמלי עירוני קצר —
// נבנה כאן בקוד, לפי תמונות של מיניבוס חשמלי בקו עירוני (שלמה 22.11). בלי לוגו ובלי לוחית רישוי של חברה אמיתית.
// חוץ: גוף לבן, רצועת חלונות שחורה, חצאית כחולה מאחורי הגלגל הקדמי עם קשת אלכסונית וכיתוב "אוטובוס חשמלי",
// ארגז סוללות על הגג, בלי סורג מנוע ובלי אגזוז, ומאחור — פסי אזהרה אדומים-צהובים ופנסים עגולים.
// פנים: ריפוד כחול כהה (דוגמה שלנו), רצועות אחיזה כתומות ושלט לד כתום "התחנה הבאה" מקדימה.
// הכול: כמה רשתות ממוזגות לכל חומר. הדגם נבנה פעם אחת וכל המיניבוסים החשמליים משכפלים אותו.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { keep } from './texkeep.js';

// מידות המיניבוס (bus_variants.md): חזית z = 6.0, אחור ‎-2.615, רוחב 2.55, גג 2.90, סרנים 3.35 ו-‎-0.015, דלת אחת z 4.565–5.735 בצד ‎-X
const HW = 1.275, FZ = 6.0, RZ = -2.615, ROOF = 2.9, AX = [3.35, -0.015], WR = 0.53, DOOR = [4.565, 5.735];
// הבמה האחורית: מ-z ‏PLAT.z אחורה, בגובה PLAT.h מעל הרצפה
const FL = 0.675, PLAT = { z: 0.62, h: 0.2 };
const BLUE = 0x2d4f9e, BLUE_LIGHT = 0x4f74c8, NAVY = 0x16244a;

const M4 = new THREE.Matrix4(), E = new THREE.Euler();
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rx || ry || rz) g.applyMatrix4(M4.makeRotationFromEuler(E.set(rx, ry, rz))); return g.translate(x, y, z); };
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
class Parts {
  constructor() { this.by = new Map(); }
  add(m, g) { const gg = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    (this.by.get(m) || this.by.set(m, []).get(m)).push(gg); return this; }
  build(parent, name) { for (const [m, list] of this.by) { const mesh = new THREE.Mesh(list.length > 1 ? mergeGeometries(list, false) : list[0], m); mesh.name = name + '_' + m.name; mesh.receiveShadow = false; parent.add(mesh); } }
}

// ---------- טקסטורות (קנבס קטן)
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(20261122);
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// ריפוד: כחול כהה מאוד, עם משיכות כחולות בהירות מתפתלות וריבועים קטנים פזורים (דוגמה שלנו)
function fabricTex() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#0b1636'; x.fillRect(0, 0, w, h);
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = rnd() < 0.6 ? '#2f5fd6' : '#1d3f9e'; x.lineWidth = 1.5 + rnd() * 2.5;
      let px = rnd() * w, py = rnd() * h; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 30; py += (rnd() - 0.5) * 30; x.lineTo(px, py); }
      x.stroke();
    }
    x.strokeStyle = '#5b7fe0'; x.lineWidth = 1;
    for (let i = 0; i < 90; i++) { const s = 3 + rnd() * 3; x.strokeRect(Math.round(rnd() * w) + 0.5, Math.round(rnd() * h) + 0.5, s, s); }
  }, true);
}
// "אוטובוס חשמלי" — לבן על כחול, לצד הגוף
function sideTextTex() {
  return canvasTex(512, 96, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.fillStyle = '#ffffff'; x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '600 62px "Rubik", "Heebo", Arial, sans-serif'; x.fillText('אוטובוס חשמלי', w / 2, h / 2 + 2);
  });
}
// פסי אזהרה אדומים-צהובים (מאחור)
function chevronTex() {
  return canvasTex(64, 16, (x, w, h) => {
    x.fillStyle = '#f0b400'; x.fillRect(0, 0, w, h); x.fillStyle = '#c8141c';
    for (let i = -2; i < 6; i++) { x.beginPath(); x.moveTo(i * 16, h); x.lineTo(i * 16 + 8, h); x.lineTo(i * 16 + 8 + h, 0); x.lineTo(i * 16 + h, 0); x.closePath(); x.fill(); }
  }, true);
}

// ---------- החצאית הכחולה: מאחורי הגלגל הקדמי ועד האחור, עם קשת אלכסונית בקצה הקדמי וחור עגול לגלגל האחורי.
// u — לאורך האוטובוס (z), v — גובה. בצד הדלת היא מתחילה אחרי הדלת
function skirtShape(zFront) {
  const yb = 0.3, yt = 1.22, r = WR + 0.09, cy = WR, za = AX[1];
  const sh = new THREE.Shape();
  sh.moveTo(RZ + 0.05, yb);
  const a0 = Math.asin((yb - cy) / r);
  sh.lineTo(za - r * Math.cos(a0), yb); sh.absarc(za, cy, r, Math.PI - a0, a0, true);
  sh.lineTo(zFront - 0.5, yb);
  sh.quadraticCurveTo(zFront - 0.1, yb + 0.25, zFront, yt);     // קשת אלכסונית קדימה ולמעלה
  sh.lineTo(RZ + 0.05, yt); sh.closePath();
  return sh;
}
function sidePlane(sh, s, x) {
  const g = new THREE.ShapeGeometry(sh, 16);
  // ShapeGeometry במישור XY (הצורה ב-x = z של האוטובוס). סיבוב: הפנים החוצה (‎+X או ‎-X), ו-x של הצורה → z
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); p.setXYZ(i, x, v, u); }
  g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, s, 0, 0);
  // (u, v) → (z, y): המשולשים פונים ל-‎-X. בצד ‎+X הופכים את הסדר
  const idx = g.index;
  if (s > 0 && idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  return g;
}

function exteriorParts(P, M, textG) {
  for (const s of [1, -1]) {
    const X = s * (HW + 0.008);
    // החצאית: בצד הנהג מאחורי הגלגל הקדמי, בצד הדלת — אחרי הדלת (הדלת בין הגלגל הקדמי לחזית, אז גם שם מאחורי הגלגל)
    const zf = AX[0] - WR - 0.15;
    P.add(M.blue, sidePlane(skirtShape(zf), s, X));
    // פס כחול בהיר דק בשפה העליונה, ופס כהה בתחתית
    P.add(M.blueLight, at(box(0.012, 0.05, zf - RZ - 0.6), X + s * 0.002, 1.2, (zf - 0.55 + RZ) / 2));
    // פס כהה בתחתית — בין קשתות הגלגלים בלבד (לא מול הגלגלים)
    for (const [z0, z1] of [[RZ + 0.1, AX[1] - 0.68], [AX[1] + 0.68, AX[0] - 0.68], [AX[0] + 0.68, FZ - 0.1]]) if (!(s < 0 && z0 >= DOOR[0] - 0.2)) P.add(M.navy, at(box(0.014, 0.06, z1 - z0), X + s * 0.001, 0.26, (z0 + z1) / 2));
    // קשתות הגלגלים: בטנה כהה בתוך הקשת (במקום הצד הפנימי הלבן של הגוף), כמו באוטובוס אמיתי
    // (חצי טבעת כהה על פני הגוף, בין הצמיג לשפת הקשת — מסתירה את בית הגלגל הלבן של הדגם)
    for (const az of AX) P.add(M.liner, new THREE.RingGeometry(WR + 0.005, WR + 0.1, 28, 1, -0.3, Math.PI + 0.6).rotateY(s * Math.PI / 2).translate(s * (HW + 0.004), WR, az));
    // רצועת החלונות שחורה: מסגרת כהה מעל ומתחת לחלונות לכל האורך
    for (const y of [1.3, 2.55]) P.add(M.trimDark, at(box(0.014, 0.06, FZ - RZ - 0.3), X, y, (FZ + RZ) / 2 - (s < 0 ? 0 : 0)));
    // הכיתוב "אוטובוס חשמלי" על החצאית, קרוב לאחור
    // (בין הגלגלים: בצד הדלת יש מאחור פתח אוורור של הדגם, והוא מכוסה בכחול)
    const tg = new THREE.PlaneGeometry(1.6, 0.3); tg.rotateY(s * Math.PI / 2); tg.translate(X + s * 0.004, 0.8, 1.35);
    textG.push(tg);
    // פתח האוורור של מנוע הדיזל בדגם (מאחור, בצד הדלת): לוח כחול מעליו — במיניבוס חשמלי אין מנוע כזה
    if (s < 0) P.add(M.blue, at(box(0.04, 0.62, 1.3), X - 0.012, 0.8, -1.85));
        // פנסי צד כתומים קטנים
    for (const z of [2.2, -1.6]) P.add(M.amber, at(rbox(0.02, 0.05, 0.1, 0.008), X + s * 0.012, 0.32, z));
  }
  // ארגז הסוללות על הגג: מעוגל, לבן, קצת מאחורי החזית, עם פתחי אוורור כהים בצדדים
  P.add(M.white, at(rbox(2.1, 0.26, 3.4, 0.08), 0, ROOF + 0.12, 2.2));
  for (const s of [1, -1]) for (const z of [1.2, 2.2, 3.2]) P.add(M.trimDark, at(box(0.01, 0.1, 0.5), s * 1.052, ROOF + 0.12, z));
  P.add(M.white, at(rbox(1.6, 0.18, 1.0, 0.06), 0, ROOF + 0.08, -1.4));            // יחידת המיזוג מאחור
  // מאחור: בלי סורג מנוע. פסי אזהרה, שלושה פנסים עגולים בכל צד, ופגוש כהה
  const BZ = RZ - 0.012;
  for (const s of [1, -1]) {
    P.add(M.chevron, at(box(0.62, 0.13, 0.01), s * 0.72, 0.62, BZ));
    [[0.7, M.tailRed], [0.86, M.tailRed], [1.02, M.tailAmber]].forEach(([y, m]) => {
      P.add(M.trimDark, at(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16).rotateX(Math.PI / 2), s * 1.13, y, BZ));
      P.add(m, at(new THREE.CylinderGeometry(0.047, 0.047, 0.022, 16).rotateX(Math.PI / 2), s * 1.13, y, BZ - 0.006)); });
  }
  P.add(M.trimDark, at(rbox(2.5, 0.18, 0.1, 0.03), 0, 0.36, RZ - 0.03));
}
function interiorParts(P, M) {
  // רצועות אחיזה כתומות: לולאות תלויות מהמסילות שמעל אזור העמידה (z 0.75–2.85), בשני הצדדים
  const y0 = 2.38, L = 0.32;
  for (const s of [1, -1]) for (let z = 0.9; z <= 2.8; z += 0.38) {
    P.add(M.strap, at(box(0.02, L, 0.035), s * 0.62, y0 - L / 2, z));
    P.add(M.strap, at(new THREE.TorusGeometry(0.06, 0.012, 6, 14), s * 0.62, y0 - L - 0.05, z, 0, Math.PI / 2, 0));
  }
}

// מוחק משולשים מרשת (לפי מרכז המשולש, בקואורדינטות של האוטובוס) — למראות שבתוך הגוף של הדגם
function dropTris(o, root, kill) {
  if (!o.geometry?.index) return;
  o.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
  const M = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(root.matrixWorld).invert(), o.matrixWorld);
  const g = o.geometry, pos = g.attributes.position, idx = g.index.array, keepI = [], v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, idx[t + k]).applyMatrix4(M)); c.multiplyScalar(1 / 3);
    if (!kill(c)) keepI.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (keepI.length === idx.length) return;
  o.geometry = g.clone(); o.geometry.setIndex(keepI);
}
// המראות של הדגם (בחיפוי הכהה, מחוץ לגוף מקדימה): ראש המראה בצד הנהג, והמראה התלויה בצד הדלת
const MIRROR_TRI = c => c.z > 5.3 && c.y > 1.5 && (Math.abs(c.x) > HW + 0.03 || (c.z > FZ + 0.1 && c.y > 2.5 && Math.abs(c.x) > 0.95));

// המושבים, הידיות והגבים שמאחורי שפת הבמה — עולים בגובה הבמה (רק הקודקודים שמעל הרצפה, באזור הבמה)
function raiseRear(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || !/Seat/i.test([].concat(o.material).map(m => m?.name).join() + o.name)) return;
    if (o.name.startsWith('EMini')) return;
    const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), Mi = M.clone().invert(), g = o.geometry.clone(), p = g.attributes.position;
    let moved = 0;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(M); if (v.z < PLAT.z + 0.45 && v.z > RZ && v.y > FL - 0.01) { v.y += PLAT.h; v.applyMatrix4(Mi); p.setXYZ(i, v.x, v.y, v.z); moved++; } }
    if (moved) { p.needsUpdate = true; g.computeBoundingSphere(); o.geometry = g; }
  });
}
// שלט היעד בצד, מבחוץ (בחלון שמאחורי הדלת): מספר הקו והיעד, בנקודות לד כתומות
export function sideSignTex(num, dest) {
  return canvasTex(512, 64, (x, w, h) => {
    x.fillStyle = '#0a0a0a'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff9a1c'; x.textBaseline = 'middle';
    x.direction = 'ltr'; x.textAlign = 'left'; x.font = '800 46px "Rubik", Arial, sans-serif'; x.fillText(String(num || ''), 12, h / 2 + 2);
    const nw = x.measureText(String(num || '')).width + 28;
    x.direction = 'rtl'; x.textAlign = 'right'; let p = 40; x.font = `700 ${p}px "Rubik", Arial, sans-serif`;
    while (p > 18 && x.measureText(dest || '').width > w - nw - 16) { p -= 2; x.font = `700 ${p}px "Rubik", Arial, sans-serif`; }
    x.fillText(dest || '', w - 10, h / 2 + 2);
    x.fillStyle = 'rgba(0,0,0,.45)'; for (let i = 0; i < w; i += 3) x.fillRect(i, 0, 1, h); for (let j = 0; j < h; j += 3) x.fillRect(0, j, w, 1);
  });
}

// ---------- הבנייה: פעם אחת לדגם (העותק של המיניבוס)
export function buildEMini(root) {
  const std = (name, o) => new THREE.MeshStandardMaterial({ name, roughness: 0.6, metalness: 0, ...o });
  const fab = fabricTex(); fab.repeat.set(3, 3);
  const M = {
    white: std('M_EMiniWhite', { color: 0xf2f3f4, roughness: 0.35, metalness: 0.1 }),
    blue: std('M_EMiniBlue', { color: BLUE, roughness: 0.35, metalness: 0.15 }),
    blueLight: std('M_EMiniBlueL', { color: BLUE_LIGHT, roughness: 0.35, metalness: 0.15 }),
    navy: std('M_EMiniNavy', { color: NAVY, roughness: 0.45 }),
    trimDark: std('M_EMiniTrim', { color: 0x15181b, roughness: 0.4 }),
    liner: std('M_EMiniLiner', { color: 0x101214, roughness: 0.9, side: THREE.DoubleSide }),
    step: std('M_EMiniStep', { color: 0x2b3038, roughness: 0.85 }),
    stepEdge: std('M_EMiniStepEdge', { color: 0xf0c000, roughness: 0.5 }),
    amber: new THREE.MeshBasicMaterial({ name: 'M_EMiniAmber', color: 0xffa31a }),
    tailRed: new THREE.MeshBasicMaterial({ name: 'M_EMiniTailR', color: 0xc8141c }),
    tailAmber: new THREE.MeshBasicMaterial({ name: 'M_EMiniTailA', color: 0xff9a1a }),
    chevron: std('M_EMiniChevron', { map: (t => (t.repeat.set(3, 1), t))(chevronTex()), roughness: 0.4 }),
    strap: std('M_EMiniStrap', { color: 0xf08a24, roughness: 0.55 }),
    fabric: std('M_EMiniFabric', { map: fab, roughness: 0.92 }),
  };
  // הגוף לבן, הזכוכית כהה יותר (רצועת חלונות שחורה), והריפוד כחול כהה — רק בעותק הזה
  const swap = new Map();
  root.traverse(o => { if (!o.isMesh) return; const f = m => { if (!m) return m;
    if (m.name === 'M_BodyWhite' || m.name === 'M_Silver') return swap.get(m) || swap.set(m, M.white).get(m);
    if (m.name === 'M_SeatFabric') return swap.get(m) || swap.set(m, M.fabric).get(m);
    if (m.name === 'M_Glass') { if (!swap.has(m)) { const g = m.clone(); g.color = m.color.clone().multiplyScalar(0.4); g.opacity = Math.min(1, (m.opacity ?? 1) + 0.1);
      if (m.onBeforeCompile) { g.onBeforeCompile = m.onBeforeCompile; g.customProgramCacheKey = m.customProgramCacheKey; } swap.set(m, g); } return swap.get(m); }
    return m; };
    o.material = Array.isArray(o.material) ? o.material.map(f) : f(o.material); });
  const grp = new THREE.Group(); grp.name = 'EMiniExterior'; root.add(grp);
  const P = new Parts(), textG = [];
  exteriorParts(P, M, textG);
  P.build(grp, 'EMiniExterior');
  const txt = new THREE.Mesh(mergeGeometries(textG, false), new THREE.MeshStandardMaterial({ name: 'M_EMiniText', map: sideTextTex(), transparent: true, roughness: 0.4, depthWrite: false }));
  txt.name = 'EMiniExterior_Text'; grp.add(txt);
  { const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.12), new THREE.MeshBasicMaterial({ name: 'M_EMiniSideSign', map: sideSignTex('', ''), toneMapped: false }));
    sg.rotation.y = -Math.PI / 2; sg.position.set(-(HW + 0.022), 2.42, 3.6); sg.name = 'EMiniSideSign'; grp.add(sg);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 1.0), M.trimDark); fr.position.set(-(HW + 0.004), 2.42, 3.6); fr.name = 'EMiniExterior_SignFrame'; grp.add(fr); }
  const inn = new THREE.Group(); inn.name = 'EMiniInterior'; root.add(inn);
  const Q = new Parts(); interiorParts(Q, M); Q.build(inn, 'EMiniInterior');
  // במה מוגבהת מאחור (כמו במיניבוס האמיתי): שלוש שורות המושבים האחוריות עומדות עליה, עם מדרגה ופס צהוב בשפה.
  // המושבים שם עולים איתה (נוסעים יושבים בפנים רק במבט פקח, ושם המיניבוס מוצג בדגם הרגיל — useStd ב-actors.js)
  { const P2 = new Parts(), z1 = PLAT.z, zc = (RZ + 0.05 + z1) / 2, L = z1 - RZ - 0.05;
    P2.add(M.step, at(box(2.42, PLAT.h, L), 0, FL + PLAT.h / 2, zc));
    P2.add(M.stepEdge, at(box(2.42, 0.006, 0.04), 0, FL + PLAT.h + 0.003, z1 - 0.02));
    P2.add(M.stepEdge, at(box(2.42, PLAT.h, 0.006), 0, FL + PLAT.h / 2, z1 + 0.003));
    P2.build(inn, 'EMiniInterior_Plat');
    raiseRear(root); }
  root.traverse(o => { if (o.isMesh && /^Bus_Body/.test(o.name) && [].concat(o.material).some(m => m?.name === 'M_Trim')) dropTris(o, root, MIRROR_TRI); });
  // מראות: אין. במקומן מצלמות בפינות הגג ושני מסכים בתא הנהג, ליד העמודים הקדמיים (שלמה 22.11, לפי המיניבוס האמיתי).
  // המשטח Mirror_L/R נשאר — הוא המסך, ובמבט נהג (cameras.js) מקבל את התמונה החיה מאחור
  for (const k of ['L', 'R']) {
    const sd = k === 'L' ? 1 : -1;
    for (const n of ['MirrorArm_' + k, 'MirrorHead_' + k]) { const o = root.getObjectByName(n); if (o) o.visible = false; }
    const f = root.getObjectByName('Mirror_' + k);
    if (f) { f.position.set(sd * 1.02, 2.12, 5.62); f.rotation.y = Math.PI + sd * 0.5; f.scale.set(1.1, 0.75, 1);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.29, 0.04), M.trimDark); fr.position.copy(f.position); fr.rotation.y = f.rotation.y;
      fr.translateZ(-0.022); fr.name = 'EMiniCamScreen_' + k; f.parent.add(fr); }
  }
  const pods = new Parts();
  for (const sd of [1, -1]) {
    pods.add(M.trimDark, at(box(0.03, 0.03, 0.22), sd * (HW + 0.05), 2.78, 5.82));                 // זרוע קצרה
    pods.add(M.trimDark, at(rbox(0.09, 0.1, 0.17, 0.03), sd * (HW + 0.13), 2.76, 5.74));          // בית המצלמה
  }
  pods.build(grp, 'EMiniExterior_Cam');
  root.userData.emini = true;
}

// לכל שכפול: שלט היעד שבצד לפי הקו (מספר ויעד)
export function eminiClone(obj, bus) {
  const L = bus?.line, n = String(L?.def?.number ?? ''), dest = L?.stops?.[L.stops.length - 1]?.name || '';
  const sg = obj.getObjectByName('EMiniSideSign'); if (sg) sg.material = new THREE.MeshBasicMaterial({ name: 'M_EMiniSideSign', map: sideSignTex(n, dest), toneMapped: false });
}
