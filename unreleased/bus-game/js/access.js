// נוסעים בכיסא גלגלים, משטח העלייה בדלת האמצעית, והנהג שיוצא לעזור.
//
// מדי פעם (בערך אחד מכל 60 נוסעים, או בכוח — __game.forceWheelchair) נוסע מחכה בתחנה בכיסא גלגלים.
// כשהוא עולה: הנהג פותח את דלת התא, קם, הולך במעבר לדלת האמצעית, מתכופף והופך את המשטח (לוח מתקפל ברצפה,
// ציר בשפת הרצפה) החוצה אל המדרכה, יורד, נעמד מאחורי הכיסא, אוחז בידיות ודוחף אותו במעלה המשטח עד המקום
// לכיסא גלגלים מול הדלת. הנוסע מסתובב לבד אל משענת הגב. הנהג יוצא, מרים את המשטח מהמדרכה ומקפל אותו פנימה,
// חוזר לתא ומתיישב. בירידה — אותו דבר בכיוון ההפוך (הנוסע יוצא לבד במורד המשטח).
//
// הכל במערכת הצירים של האוטובוס (‎+Z קדימה, הדלתות בצד ‎-X): הכיסא והנהג הם ילדים של האוטובוס בזמן הרצף.
// הרצף הוא רשימת קטעים עם זמן התחלה ומשך (בשניות משחק), וכל קטע קובע את המצב שלו באופן מוחלט —
// כך שבכל מהירות משחק (×1 עד ×60) ובכל קפיצה בזמן מתקבלת אותה תמונה, בלי הצטברות שגיאות.
// האוטובוס מחכה כל עוד bus.access (sim.js); הרצף משחרר אותו בסוף.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DRIVER_RIG, CAB_DOOR, cabHandle, aim, turn, twoBone, personPart, driverMaterial } from './driver.js';
import { frameV, BENCH } from './stops.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, D2R = THREE.MathUtils.degToRad;
const ease = u => u * u * (3 - 2 * u);
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const hash = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

export const WHEELCHAIR_RATE = 1 / 60;

// ---------- מידות באוטובוס
const FL = 0.66;
// המשטח: ציר בשפת הרצפה מול הדלת האמצעית. סגור — שטוח ברצפה, פנימה (‎+X). פתוח — הפוך, יורד אל המדרכה (‎0.12)
export const RAMP = { hx: -0.85, hy: 0.668, z: 0.025, L: 1.2, W: 0.9, t: 0.035 };
const SLOPE = Math.asin((RAMP.hy - 0.12) / RAMP.L);
const PHI_OUT = Math.PI + SLOPE;                 // הזווית של המשטח הפתוח (0 = סגור, 90° = זקוף)
const HANDLE_U = 1.08;                           // הידית השקועה, ליד הקצה החופשי
const SEAT = { x: 0.74, z: 4.56 }, STAND = { x: 0.1, z: 4.5 };   // הנהג: הכיסא, והמקום שבו הוא עומד מחוץ לתא
const BAY = { x: 0.8, z: 0.13 };                // מקום הכיסא: מול הדלת, הגב אל משענת הגב (z‏ ≈ ‎-0.4)
const DOOR_Z = 0.025;

// גובה הקרקע/הרצפה בנקודה (מערכת האוטובוס): מדרכה, כביש בין השפה לאוטובוס, מדרגת הדלת, רצפה, והמשטח כשהוא פתוח
function rampTopY(x) {
  const c = Math.cos(SLOPE), s = Math.sin(SLOPE), u = (RAMP.hx - RAMP.t * s - x) / c;
  return RAMP.hy - u * s + RAMP.t * c;
}
function groundAt(x, z, phi) {
  const inDoor = Math.abs(z - DOOR_Z) < 0.62, onRamp = Math.abs(z - RAMP.z) < RAMP.W / 2 + 0.05;
  if (onRamp && phi > PHI_OUT - 0.05) {
    const x0 = RAMP.hx - RAMP.L * Math.cos(SLOPE) - RAMP.t * Math.sin(SLOPE);
    if (x >= x0 && x <= RAMP.hx) return rampTopY(x);
  }
  if (x > RAMP.hx - 0.01) return FL;
  if (inDoor && x > -1.28) return 0.34;
  if (x > -1.55) return 0.0;
  return 0.12;
}
const groundSmooth = (x, z, phi) => { let s = 0; for (const d of [-0.12, -0.06, 0, 0.06, 0.12]) s += groundAt(x + d, z, phi); return s / 5; };

// ---------- המשטח (לוח מתקפל ברצפה, כמו בתמונה: לוח מלבני בגובה הרצפה עם ידית שקועה; הצד השני — מונע החלקה עם פסים צהובים)
export function addRamp(busRoot) {
  if (!busRoot || busRoot.getObjectByName('AccessRamp')) return;
  const byName = new Map();
  busRoot.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && !byName.has(m.name)) byName.set(m.name, m); });
  const vinyl = byName.get('M_Vinyl') || new THREE.MeshStandardMaterial({ color: 0xe9eaeb, roughness: 0.6 });
  const alu = new THREE.MeshStandardMaterial({ name: 'M_RampAlu', color: 0xa9adb3, metalness: 0.8, roughness: 0.35 });
  const grip = new THREE.MeshStandardMaterial({ name: 'M_RampGrip', color: 0x3b3e43, roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ name: 'M_RampRecess', color: 0x1d1f22, roughness: 0.7 });
  const yellow = byName.get('M_Pole') || new THREE.MeshStandardMaterial({ color: 0xf2b80d, roughness: 0.5 });
  const { L, W, t } = RAMP;
  const g = new THREE.Group(); g.name = 'AccessRamp';
  g.position.set(RAMP.hx, RAMP.hy, RAMP.z);
  const parts = new Map(), add = (m, geo) => (parts.get(m) || parts.set(m, []).get(m)).push(geo);
  const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // הלוח: למעלה ריצוף הרצפה, מסגרת אלומיניום דקה מסביב
  add(vinyl, bx(L - 0.04, 0.004, W - 0.04, L / 2, -0.002, 0));
  add(alu, bx(L, t - 0.004, W, L / 2, -t / 2 - 0.002, 0));
  for (const s of [-1, 1]) add(alu, bx(L, 0.0045, 0.02, L / 2, -0.0018, s * (W / 2 - 0.01)));
  add(alu, bx(0.02, 0.0045, W, L - 0.01, -0.0018, 0));
  add(alu, bx(0.02, 0.0045, W, 0.01, -0.0018, 0));
  // ידית שקועה: גומחה כהה ומוט בתוכה
  add(dark, bx(0.075, 0.005, 0.24, HANDLE_U, 0.0005, 0));
  add(alu, new THREE.CylinderGeometry(0.009, 0.009, 0.2, 10).rotateX(Math.PI / 2).translate(HANDLE_U, -0.002, 0));
  // הצד השני (למעלה כשהמשטח פתוח): משטח מונע החלקה, צלעות רוחב ופסים צהובים בשוליים
  add(grip, bx(L - 0.02, 0.004, W - 0.02, L / 2, -t - 0.002, 0));
  for (let u = 0.12; u < L - 0.05; u += 0.1) add(grip, bx(0.014, 0.006, W - 0.14, u, -t - 0.005, 0));
  for (const s of [-1, 1]) add(yellow, bx(L - 0.03, 0.006, 0.05, L / 2, -t - 0.004, s * (W / 2 - 0.04)));
  add(yellow, bx(0.05, 0.006, W - 0.14, L - 0.04, -t - 0.004, 0));
  // הציר: צינור לכל הרוחב
  add(alu, new THREE.CylinderGeometry(0.014, 0.014, W, 12).rotateX(Math.PI / 2).translate(0, -t / 2, 0));
  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh(list.length > 1 ? mergeGeometries(list, false) : list[0], m);
    mesh.name = 'AccessRamp_' + m.name; g.add(mesh);
  }
  busRoot.add(g);
  // הגומחה ברצפה מתחת ללוח (נראית רק כשהלוח פתוח)
  const pit = new THREE.Mesh(new THREE.BoxGeometry(L - 0.02, 0.003, W - 0.02), new THREE.MeshStandardMaterial({ name: 'M_RampPit', color: 0x6b6f75, metalness: 0.5, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1 }));
  pit.position.set(RAMP.hx + L / 2, FL + 0.004, RAMP.z); pit.name = 'AccessRampPit';
  busRoot.add(pit);
}
const rampLocal = (phi, u, y, z) => { const c = Math.cos(phi), s = Math.sin(phi); return V3(RAMP.hx + u * c - y * s, RAMP.hy + u * s + y * c, RAMP.z + z); };

// ---------- כיסא הגלגלים (ידני): שלדה, שני גלגלים גדולים עם טבעות הנעה, גלגלים קדמיים קטנים, מושב ומשענת, ידיות דחיפה
// מערכת הכיסא: ‎+Z קדימה, הראשית על הקרקע מתחת לציר הגלגלים האחוריים
const WC = { R: 0.3, axleZ: 0, wx: 0.315, seatY: 0.5, zb: -0.1, front: 0.36, caster: { x: 0.21, z: 0.42, r: 0.075 }, lift: 0.07 };
WC.handles = [-1, 1].map(s => V3(s * 0.215, 0.935, WC.zb - 0.15));
function tubeG(a, b, r, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5); return g.translate(m.x, m.y, m.z);
}
function polyTube(pts, r, out) { for (let i = 0; i + 1 < pts.length; i++) { out.push(tubeG(pts[i], pts[i + 1], r)); if (i) out.push(new THREE.SphereGeometry(r, 8, 6).translate(pts[i].x, pts[i].y, pts[i].z)); } }
const strip = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); return n; };
const merge = list => mergeGeometries(list.map(strip), false);

let CHAIR = null;
function chairShared(env) {
  if (CHAIR) return CHAIR;
  const M = {
    frame: new THREE.MeshStandardMaterial({ name: 'M_WcFrame', color: 0x262a31, metalness: 0.55, roughness: 0.38, envMap: env, envMapIntensity: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ name: 'M_WcMetal', color: 0xc9cdd3, metalness: 0.9, roughness: 0.22, envMap: env, envMapIntensity: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ name: 'M_WcTire', color: 0x141516, roughness: 0.88 }),
    fabric: new THREE.MeshStandardMaterial({ name: 'M_WcFabric', color: 0x17191d, roughness: 0.95 }),
    grip: new THREE.MeshStandardMaterial({ name: 'M_WcGrip', color: 0x0d0d0e, roughness: 0.7 }),
  };
  const { R, wx, seatY, zb, front, caster } = WC;
  const fr = [], fab = [], grip = [], met = [];
  for (const s of [-1, 1]) {
    const x = s * 0.225;
    // משענת הגב והידית שפונה לאחור
    polyTube([V3(x, 0.24, zb + 0.02), V3(x, 0.5, zb), V3(x, 0.9, zb - 0.04), V3(x, 0.93, zb - 0.075)], 0.0125, fr);
    fr.push(tubeG(V3(x, 0.93, zb - 0.075), V3(x, 0.935, zb - 0.1), 0.0125));
    grip.push(tubeG(V3(x, 0.935, zb - 0.095), V3(x, 0.937, zb - 0.2), 0.017, 12));
    // מסגרת המושב, החזית שיורדת אל משענות הרגליים, והמסילה התחתונה
    polyTube([V3(x, seatY - 0.03, zb), V3(x, seatY - 0.03, front)], 0.012, fr);
    polyTube([V3(x, 0.24, zb + 0.02), V3(x, 0.24, caster.z - 0.03)], 0.012, fr);
    // בית הגלגל הקדמי
    fr.push(tubeG(V3(s * caster.x, 0.2, caster.z), V3(s * caster.x, 0.27, caster.z), 0.02, 12));
    fr.push(tubeG(V3(x, 0.24, caster.z - 0.03), V3(s * caster.x, 0.24, caster.z), 0.012));
    // לוחית הציר של הגלגל האחורי
    fr.push(new THREE.BoxGeometry(0.012, 0.09, 0.07).translate(s * 0.245, R, WC.axleZ));
    fr.push(tubeG(V3(x, 0.26, WC.axleZ), V3(s * 0.245, R, WC.axleZ), 0.01));
    // מוט נגד התהפכות מאחור
    polyTube([V3(x, 0.24, zb + 0.02), V3(s * 0.21, 0.12, zb - 0.2)], 0.01, fr);
    met.push(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 12).rotateZ(Math.PI / 2).translate(s * 0.21, 0.1, zb - 0.22));
    // מגן בגדים מעל הגלגל
    fab.push(new THREE.BoxGeometry(0.006, 0.1, 0.28).translate(s * 0.238, seatY + 0.04, 0.06));
  }
  // מושב ומשענת (בד שחור, שוקע מעט)
  const seat = new THREE.BoxGeometry(0.45, 0.03, front - zb - 0.02, 6, 1, 6);
  { const p = seat.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / 0.225; p.setY(i, p.getY(i) - 0.012 * (1 - x * x)); } seat.computeVertexNormals(); }
  fab.push(seat.translate(0, seatY - 0.012, (front + zb) / 2 + 0.01));
  fab.push(new THREE.BoxGeometry(0.44, 0.38, 0.02).translate(0, 0.72, zb - 0.025).applyMatrix4(new THREE.Matrix4().makeRotationX(0)));
  // מוט רוחב מאחורי המשענת ושני מוטות מוצלבים מתחת למושב (מתקפל)
  fr.push(tubeG(V3(-0.225, 0.62, zb - 0.03), V3(0.225, 0.62, zb - 0.03), 0.009));
  fr.push(tubeG(V3(-0.225, 0.24, 0.16), V3(0.225, seatY - 0.04, 0.16), 0.011));
  fr.push(tubeG(V3(0.225, 0.24, 0.16), V3(-0.225, seatY - 0.04, 0.16), 0.011));
  // גלגל גדול: צמיג, חישוק, חישורים, טבור, וטבעת הנעה מבחוץ
  const tire = new THREE.TorusGeometry(R - 0.017, 0.017, 10, 48).rotateY(Math.PI / 2);
  const wm = [new THREE.TorusGeometry(R - 0.035, 0.008, 6, 48).rotateY(Math.PI / 2),
    new THREE.CylinderGeometry(0.03, 0.03, 0.06, 14).rotateZ(Math.PI / 2)];
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, b = a + (i % 2 ? 0.35 : -0.35), side = i % 2 ? 0.022 : -0.022;
    wm.push(tubeG(V3(side, Math.sin(b) * 0.03, Math.cos(b) * 0.03), V3(0, Math.sin(a) * (R - 0.04), Math.cos(a) * (R - 0.04)), 0.0022, 4));
  }
  const rimX = 0.04;
  wm.push(new THREE.TorusGeometry(R - 0.035, 0.0085, 8, 48).rotateY(Math.PI / 2).translate(rimX, 0, 0));
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; wm.push(tubeG(V3(0.006, Math.sin(a) * (R - 0.04), Math.cos(a) * (R - 0.04)), V3(rimX, Math.sin(a) * (R - 0.035), Math.cos(a) * (R - 0.035)), 0.005, 5)); }
  // גלגל קדמי: מזלג וגלגל קטן
  const cr = caster.r;
  const fork = merge([new THREE.BoxGeometry(0.006, 0.11, 0.035).translate(-0.022, -0.035, -0.025), new THREE.BoxGeometry(0.006, 0.11, 0.035).translate(0.022, -0.035, -0.025),
    new THREE.BoxGeometry(0.05, 0.012, 0.04).translate(0, 0.02, -0.02), new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8).translate(0, 0.05, 0)]);
  const cw = new THREE.CylinderGeometry(cr, cr, 0.028, 20).rotateZ(Math.PI / 2), ch = new THREE.CylinderGeometry(0.02, 0.02, 0.034, 10).rotateZ(Math.PI / 2);
  CHAIR = { M, frame: merge(fr), fabric: merge(fab), grip: merge(grip), metal: merge(met), tire: strip(tire), wheel: merge(wm), fork, cw: strip(cw), ch: strip(ch) };
  return CHAIR;
}
// החלק הקדמי של השלדה תלוי במקום כפות הרגליים של היושב (שונה מעט בין הדגמים)
function chairFront(fz) {
  const fr = [], met = [], { seatY, front } = WC;
  for (const s of [-1, 1]) {
    polyTube([V3(s * 0.225, seatY - 0.03, front), V3(s * 0.2, 0.33, front + 0.05), V3(s * 0.17, 0.1, fz - 0.06)], 0.012, fr);
    met.push(new THREE.BoxGeometry(0.15, 0.012, 0.15).translate(s * 0.1, 0.06, fz));
    fr.push(tubeG(V3(s * 0.17, 0.1, fz - 0.06), V3(s * 0.1, 0.065, fz - 0.065), 0.01));
  }
  return { frame: merge(fr), metal: merge(met) };
}

function makeChairObject(env, person, fz) {
  const S = chairShared(env), M = S.M;
  const g = new THREE.Group(); g.name = 'Wheelchair'; g.rotation.order = 'YXZ';
  const mesh = (geo, m, parent = g) => { const o = new THREE.Mesh(geo, m); parent.add(o); return o; };
  mesh(S.frame, M.frame); mesh(S.fabric, M.fabric); mesh(S.grip, M.grip); mesh(S.metal, M.metal);
  const F = chairFront(fz); mesh(F.frame, M.frame); mesh(F.metal, M.metal);
  const wheels = [-1, 1].map(s => {
    const w = new THREE.Group(); w.position.set(s * WC.wx, WC.R, WC.axleZ); g.add(w);
    const inner = new THREE.Group(); inner.scale.x = s; w.add(inner);       // טבעת ההנעה תמיד בצד החיצוני
    mesh(S.tire, M.rubber, inner); mesh(S.wheel, M.metal, inner);
    return w;
  });
  const casters = [-1, 1].map(s => {
    const c = new THREE.Group(); c.position.set(s * WC.caster.x, WC.caster.r, WC.caster.z); g.add(c);
    const fk = new THREE.Mesh(S.fork, M.frame); fk.position.set(0, 0.08, 0.025); c.add(fk);
    const w = new THREE.Group(); c.add(w); mesh(S.cw, M.rubber, w); mesh(S.ch, M.metal, w);
    return w;
  });
  if (person) { person.position.set(0, WC.lift, WC.zb + 0.012); g.add(person); }
  g.userData.wc = { wheels, casters };
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
  return g;
}

// ---------- הנוסע בכיסא: עותק עם שלד של תנוחת הישיבה של הדגם (sitting.js). כשדוחפים אותו — הידיים על הירכיים;
// כשהוא מניע את הכיסא בעצמו — הידיים אוחזות בטבעות ההנעה ודוחפות, בקצב שבו הגלגלים מסתובבים
const ARM_BONES = ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'FingerBase', 'HandFinger1'];
const STROKE = 0.42;                  // מטרים של נסיעה לכל דחיפה
class Sitter {
  constructor(V) {
    const S = V.sit;
    this.root = SkeletonUtils.clone(S.root);
    this.root.position.copy(S.root.position).sub(S.origin);
    this.holder = new THREE.Group(); this.holder.name = 'WheelchairSitter'; this.holder.add(this.root);
    const cache = new Map();
    this.root.traverse(o => {
      if (!o.isMesh) return;
      let m = cache.get(o.material);
      if (!m) { m = driverMaterial(o.material, personPart(o.material.name + ' ' + o.name)); cache.set(o.material, m); }
      o.material = m; o.frustumCulled = false;
    });
    this.bones = new Map(); this.root.traverse(o => { if (o.isBone) this.bones.set(o.name, o); });
    this.rest = [];
    for (const sd of ['Left', 'Right']) for (const b of [...ARM_BONES.map(n => sd + n), sd === 'Left' ? 'LThumb' : 'RThumb']) {
      const o = this.bones.get(b); if (o) this.rest.push([o, o.quaternion.clone()]);
    }
    this.fz = WC.zb + 0.012 + S.feet.z + 0.04;
    this.on = 0;
  }
  // propel: 0 — ידיים על הירכיים, 1 — דוחף. rl/rr — סיבוב הגלגלים (רדיאנים), כדי שהיד תזוז יחד עם הטבעת
  arms(chair, propel, rl, rr) {
    if (propel <= 0.001 && this.on <= 0.001) return;
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.on = propel;
    if (propel <= 0.001) return;
    chair.updateMatrixWorld(true);
    const r = WC.R - 0.035;
    for (const [sd, sx, roll] of [['Left', 1, rl], ['Right', -1, rr]]) {
      const B = n => this.bones.get(sd + n), hand = B('Hand'); if (!hand || !B('Arm')) continue;
      const ph = (((roll * WC.R) / STROKE) % 1 + 1) % 1;
      // אחיזה: היד נעה עם הטבעת מלמעלה-מאחור קדימה (כמו הגלגל); חזרה: מעל הטבעת, קצת החוצה
      let a, lift = 0, outw = 0;
      if (ph < 0.55) a = D2R(102) - (ph / 0.55) * (STROKE * 0.55 / WC.R);
      else { const k = (ph - 0.55) / 0.45; a = D2R(102) - (1 - ease(k)) * (STROKE * 0.55 / WC.R); lift = Math.sin(Math.PI * k) * 0.07; outw = Math.sin(Math.PI * k) * 0.04; }
      const p = V3(sx * (WC.wx + 0.045 + outw), WC.R + (r + lift) * Math.sin(a), WC.axleZ + (r + lift) * Math.cos(a));
      const tgt = chair.localToWorld(p.add(V3(-sx * 0.015, 0.03, -0.02)));
      const cur = hand.getWorldPosition(V3());
      twoBone(B('Arm'), B('ForeArm'), hand, cur.lerp(tgt, propel), chair.localToWorld(V3(sx * 0.6, 0.2, -1)).sub(chair.getWorldPosition(V3())));
      const down = chair.localToWorld(V3(sx * 0.15, -0.7, 0.5)).sub(chair.getWorldPosition(V3()));
      if (B('FingerBase')) aim(hand, B('FingerBase'), hand.getWorldPosition(V3()).add(down));
      const grip = ph < 0.55 ? 1 : 0.3;
      const ax = chair.localToWorld(V3(1, 0, 0)).sub(chair.getWorldPosition(V3()));
      if (B('HandFinger1')) turn(B('HandFinger1'), ax, sx * 55 * grip * propel);
    }
  }
}
// במצב ?placeholders — יושב פשוט
function proceduralSitter() {
  const m = new THREE.MeshLambertMaterial({ color: 0x3b5b8c }), sk = new THREE.MeshLambertMaterial({ color: 0xd9ab8a });
  const g = new THREE.Group(), add = (geo, mat) => g.add(new THREE.Mesh(geo, mat));
  add(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 10).translate(0, 0.72, 0.13), m);
  add(new THREE.SphereGeometry(0.11, 12, 10).translate(0, 1.13, 0.15), sk);
  for (const s of [-1, 1]) { add(tubeG(V3(s * 0.1, 0.45, 0.15), V3(s * 0.1, 0.45, 0.5), 0.07), m); add(tubeG(V3(s * 0.1, 0.45, 0.5), V3(s * 0.1, 0.05, 0.53), 0.055), m); }
  return { holder: g, fz: 0.55, arms() { } };
}

// ---------- הנהג "החי": עותק עם שלד של דגם הנהג, הליכה ועמידה מהקובץ, ו-IK לידיים, לרגליים ולמבט
class DriverActor {
  constructor(rig) {
    this.rig = rig;
    this.obj = new THREE.Group(); this.obj.name = 'DriverActor';
    this.inner = SkeletonUtils.clone(rig.gltf.scene); this.obj.add(this.inner);
    const cache = new Map();
    this.inner.traverse(o => {
      if (!o.isMesh) return;
      let m = cache.get(o.material);
      if (!m) { m = driverMaterial(o.material, personPart(o.material.name + ' ' + o.name)); cache.set(o.material, m); }
      o.material = m; o.frustumCulled = false;
    });
    this.bones = new Map(); this.inner.traverse(o => { if (o.isBone) this.bones.set(o.name, o); });
    this.B = n => this.bones.get(n);
    this.mixer = new THREE.AnimationMixer(this.inner);
    const an = rig.gltf.animations, walk = an.find(a => /walk/i.test(a.name)), idle = an.find(a => /idle/i.test(a.name));
    this.walk = walk ? this.mixer.clipAction(walk).play() : null;
    this.idle = idle ? this.mixer.clipAction(idle).play() : null;
    this.measure(walk);
  }
  // מהירות ההליכה של ההקלטה (כף הרגל שעל הקרקע זזה אחורה ביחס לאגן — כך לא מחליקים), הגובה של הקרסול בצעד,
  // וכיוון כף היד (לסגירת האצבעות)
  measure(walk) {
    this.stride = 0.9; this.restA = 0.1;
    const B = this.B, P = V3();
    if (walk && this.walk) {
      this.walk.setEffectiveWeight(1); this.idle?.setEffectiveWeight(0);
      const N = 48, f = [], dur = walk.duration;
      let minA = Infinity;
      for (let k = 0; k <= N; k++) {
        this.mixer.setTime(k / N * dur); this.inner.updateMatrixWorld(true);
        const h = B('Hips').getWorldPosition(V3()), l = B('LeftFoot').getWorldPosition(V3());
        f.push([l.z - h.z, l.y]); minA = Math.min(minA, l.y, B('RightFoot').getWorldPosition(P).y);
      }
      // הקטע שבו כף הרגל השמאלית על הקרקע: נמוכה, וזזה אחורה
      let back = 0, tt = 0;
      for (let k = 1; k <= N; k++) if (f[k][1] < minA + 0.02 && f[k - 1][1] < minA + 0.02 && f[k][0] < f[k - 1][0]) { back += f[k - 1][0] - f[k][0]; tt += dur / N; }
      if (tt > 0.2 && back > 0.2) this.stride = back / tt;
      this.restA = minA - this.inner.getWorldPosition(P).y;
      // לכל רגל: חלק המחזור שבו כף הרגל על הקרקע (נמוכה וזזה אחורה ביחס לאגן) — שם נועלים אותה במקום
      this.dur = dur; this.stance = [];
      for (const foot of ['LeftFoot', 'RightFoot']) {
        const a = [];
        for (let k = 0; k < N; k++) { this.mixer.setTime(k / N * dur); this.inner.updateMatrixWorld(true); const h = B('Hips').getWorldPosition(V3()), f = B(foot).getWorldPosition(V3()); a.push([f.z - h.z, f.y]); }
        const on = a.map(v => v[1] < minA + 0.035);
        let best = null;
        for (let k = 0; k < N; k++) if (on[k] && !on[(k + N - 1) % N]) { let n = 0; while (n < N && on[(k + n) % N]) n++; if (!best || n > best[1]) best = [k, n]; }
        this.stance.push(best ? { ps: best[0] / N, len: best[1] / N } : null);
      }
    }
    this.idle?.setEffectiveWeight(1); this.walk?.setEffectiveWeight(0); this.mixer.setTime(0); this.inner.updateMatrixWorld(true);
    this.palm = {};
    const hips = B('Hips').getWorldPosition(V3());
    for (const s of ['Left', 'Right']) {
      const hd = B(s + 'Hand'); if (!hd) continue;
      const inward = V3(Math.sign(hips.x - hd.getWorldPosition(V3()).x) || 1, 0, 0), wq = hd.getWorldQuaternion(new THREE.Quaternion());
      let best = V3(1, 0, 0), bd = 0;
      for (const ax of [V3(1, 0, 0), V3(0, 0, 1)]) { const d = ax.clone().applyQuaternion(wq).dot(inward); if (Math.abs(d) > Math.abs(bd)) { bd = d; best = ax; } }
      this.palm[s] = best.clone().multiplyScalar(Math.sign(bd) || 1);
    }
  }
  // s: x, z (מערכת האוטובוס), yaw, walkT (זמן בהקלטת ההליכה), walkW (משקל ההליכה מול העמידה), sitK (1 = יושב),
  // crouch (0..1), lean (מעלות), hands {L, R} + handW, look (נקודה שהוא מסתכל עליה), phi (המשטח — לגובה הקרקע)
  pose(s, bus) {
    const { obj, inner, B } = this, W = V3();
    const ww = this.idle ? clamp(s.walkW ?? 0, 0, 1) : 1;
    this.walk?.setEffectiveWeight(ww); this.idle?.setEffectiveWeight(1 - ww);
    // three.js כותב לעצם רק ערך שהשתנה מהפעם הקודמת — כשזמן ההליכה עומד, ה-IK של הפריים הקודם היה נשאר ומצטבר.
    // לכן מחזירים קודם את העצמות למה שהאנימציה נתנה בפעם הקודמת, ורק אז מעדכנים
    if (this.snap) for (const [b, q, p] of this.snap) { b.quaternion.copy(q); b.position.copy(p); }
    this.mixer.setTime(s.walkT || 0);
    if (!this.snap) this.snap = [...this.bones.values()].map(b => [b, new THREE.Quaternion(), new THREE.Vector3()]);
    for (const [b, q, p] of this.snap) { q.copy(b.quaternion); p.copy(b.position); }
    const phi = s.phi ?? 0;
    obj.position.set(s.x, groundSmooth(s.x, s.z, phi), s.z); obj.rotation.set(0, s.yaw, 0);
    inner.position.set(0, 0, 0); obj.updateMatrixWorld(true);
    const h = obj.worldToLocal(B('Hips').getWorldPosition(W));
    inner.position.set(-h.x, 0, -h.z); obj.updateMatrixWorld(true);
    const wq = obj.getWorldQuaternion(new THREE.Quaternion());
    const fwd = V3(0, 0, 1).applyQuaternion(wq), side = V3(1, 0, 0).applyQuaternion(wq), up = V3(0, 1, 0);
    const legs = [['LeftUpLeg', 'LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg', 'RightFoot']];
    const k = clamp(s.sitK || 0, 0, 1), c = clamp(s.crouch || 0, 0, 1);
    // כפות הרגליים על הקרקע: הגוף בגובה הרגל הנמוכה, והרגל שעל מדרגה/משטח מתכופפת אליה (כמו הנוסעים במדרגות)
    let lift = null;
    if (k === 0) {
      const g = legs.map(l => { const p = bus.worldToLocal(B(l[2]).getWorldPosition(V3())); return groundSmooth(p.x, p.z, phi); });
      const base = Math.min(g[0], g[1]);
      obj.position.y = base; obj.updateMatrixWorld(true);
      lift = g.map(v => v - base);
    }
    const A1 = legs.map(l => B(l[2]).getWorldPosition(V3()));
    if (k > 0) {
      for (const [name, q] of this.rig.quats) { const b = this.bones.get(name); if (b) b.quaternion.slerp(q, k); }
      // תנוחת הישיבה יחסית לנקודת הכיסא (SEAT) — מסתובבת יחד עם הגוף (כמו כיסא מסתובב)
      inner.position.lerp(V3(this.rig.rootPos.x - SEAT.x, this.rig.rootPos.y - FL, this.rig.rootPos.z - SEAT.z), k);
      obj.updateMatrixWorld(true);
    }
    // התכופפות: האגן יורד ואחורה (משקל על העקבים), הברכיים מתכופפות, הגב נוטה קדימה והראש מסתכל קדימה-למטה
    if (c > 0) { inner.position.y -= c * 0.34; inner.position.z -= c * 0.12; obj.updateMatrixWorld(true); }
    if (c > 0 || s.lean) {
      turn(B('LowerBack'), side, c * 34 + (s.lean || 0));
      if (B('Spine1')) turn(B('Spine1'), side, c * 22 + (s.lean || 0) * 0.4);
      if (B('Neck')) turn(B('Neck'), side, -c * 16);
    }
    const tuck = clamp(s.tuck || 0, 0, 1);
    if (c > 0 || (k > 0 && k < 1) || (k > 0 && tuck > 0)) {
      // tuck: כפות הרגליים יורדות מהדוושות ונמשכות אחורה מתחת לכיסא (לפני שהוא מסתובב החוצה)
      const seatFeet = this.rig.feet ? [this.rig.feet[1][0], this.rig.feet[0][0]].map(p => {
        const v = V3(p.x - SEAT.x, p.y - FL, p.z - SEAT.z), hz = Math.hypot(v.x, v.z), back = Math.min(hz - 0.22, 0.2) * tuck;
        if (hz > 1e-3) { v.x -= v.x / hz * back; v.z -= v.z / hz * back; } v.y -= 0.06 * tuck;
        return obj.localToWorld(v);
      }) : null;
      legs.forEach((l, j) => {
        const tgt = A1[j].clone(); if (seatFeet && k > 0) tgt.lerp(seatFeet[j], k);
        twoBone(B(l[0]), B(l[1]), B(l[2]), tgt, fwd.clone().add(V3(0, 0.4, 0)));
      });
    } else if (lift) {
      legs.forEach((l, j) => {
        const tgt = A1[j].clone().setY(A1[j].y + lift[j]);
        // נעילת כף הרגל: במקום שבו היא דרכה על הקרקע (s.lock — נקודה במערכת האוטובוס ומשקל)
        const lk = s.lock?.[j];
        if (lk && lk.w > 0) tgt.lerp(bus.localToWorld(lk.p.clone()), lk.w);
        if (lift[j] > 0.004 || (lk && lk.w > 0)) twoBone(B(l[0]), B(l[1]), B(l[2]), tgt, fwd.clone().add(V3(0, 0.3, 0)));
      });
    }
    // מבט: הראש והצוואר פונים אל מה שהוא עושה (או אל הדרך), עד גבול סביר
    if (s.look && B('Head')) {
      const head = B('Head').getWorldPosition(V3()), d = bus.localToWorld(s.look.clone()).sub(head);
      const yaw = clamp(Math.atan2(d.dot(side), d.dot(fwd)), -1.25, 1.25), pitch = clamp(Math.atan2(-d.y, Math.hypot(d.dot(side), d.dot(fwd))), -0.5, 0.9);
      const lw = clamp(s.lookW ?? 1, 0, 1);
      // ‎+side זה שמאל הדמות: סיבוב חיובי סביב "למעלה" פונה שמאלה
      if (B('Neck')) turn(B('Neck'), up, THREE.MathUtils.radToDeg(yaw) * 0.4 * lw);
      turn(B('Head'), up, THREE.MathUtils.radToDeg(yaw) * 0.6 * lw);
      const hs = V3(1, 0, 0).applyQuaternion(B('Head').getWorldQuaternion(new THREE.Quaternion()));
      if (B('Neck')) turn(B('Neck'), side, THREE.MathUtils.radToDeg(pitch) * 0.35 * lw);
      turn(B('Head'), side, THREE.MathUtils.radToDeg(pitch) * 0.45 * lw);
    }
    // ידיים: IK לידית; האצבעות נסגרות סביבה. handW — אחיזה ושחרור הדרגתיים
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      const tgt = s.hands?.[sd]; if (!tgt) continue;
      const nm = sd === 'L' ? 'Left' : 'Right';
      const w = clamp((sd === 'L' ? s.handWL : undefined) ?? s.handW ?? 1, 0, 1); if (w <= 0) continue;
      const hand = B(nm + 'Hand'), pw = hand.getWorldPosition(V3()).lerp(bus.localToWorld(tgt.clone()), w);
      const pole = side.clone().multiplyScalar(sx * 0.7).add(V3(0, -0.8, 0)).addScaledVector(fwd, -0.3);
      twoBone(B(nm + 'Arm'), B(nm + 'ForeArm'), hand, pw, pole);
      const dir = s.handDir ? bus.localToWorld(s.handDir.clone()).sub(bus.localToWorld(V3())) : fwd.clone().multiplyScalar(0.7).add(V3(0, -0.5, 0)).addScaledVector(side, sx * 0.1);
      const fb = B(nm + 'FingerBase'); if (fb) aim(hand, fb, hand.getWorldPosition(V3()).add(dir));
      if (w > 0.3 && this.palm[nm]) {
        const P = this.palm[nm].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())), g = (w - 0.3) / 0.7;
        const curl = (bone, deg) => { if (!bone) return; const d = V3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())); turn(bone, V3().crossVectors(d, P), deg * g); };
        curl(fb, 18); curl(B(nm + 'HandFinger1'), 85); curl(B(sd === 'L' ? 'LThumb' : 'RThumb'), 40);
      }
    }
    obj.updateMatrixWorld(true);
  }
}

// ---------- מסלולים: קו שבור עם אורך, מיקום ו"כיוון" (ממוצע סביב הנקודה — פינות מתעגלות)
class Path {
  constructor(pts) {
    this.p = pts.map(p => [p[0], p[1]]); this.c = [0];
    for (let i = 1; i < this.p.length; i++) this.c.push(this.c[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    this.L = this.c[this.c.length - 1] || 1e-6;
  }
  at(d) {
    d = clamp(d, 0, this.L); let i = 1; while (i < this.c.length - 1 && this.c[i] < d) i++;
    const a = this.p[i - 1], b = this.p[i] || a, l = (this.c[i] - this.c[i - 1]) || 1, k = (d - this.c[i - 1]) / l;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }
  yaw(d, w = 0.3) {
    const a = this.at(Math.max(0, Math.min(d - w, this.L - 2 * w))), b = this.at(Math.min(this.L, Math.max(d + w, 2 * w)));
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
}
function bezier(P0, P1, P2, P3, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0], u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1]]);
  }
  return out;
}
// תנועה עם האצה והאטה: אורך L במהירות v, תאוצה בזמן ta בכל קצה. מחזיר משך, ומרחק לפי זמן
function profile(L, v, ta = 0.5) {
  ta = Math.min(ta, L / v);
  const dur = L / v + ta;
  const d = t => t <= 0 ? 0 : t >= dur ? L : t < ta ? v * t * t / (2 * ta) : t > dur - ta ? L - v * (dur - t) ** 2 / (2 * ta) : v * ta / 2 + v * (t - ta);
  const sp = t => t < ta ? t / ta : t > dur - ta ? Math.max(0, (dur - t) / ta) : 1;
  return { dur, d, sp };
}

// ---------- רצף: קטעים עם זמן התחלה ומשך. כל קטע כותב את החלק שלו במצב (st), באופן מוחלט
class Timeline {
  constructor() { this.segs = []; this.t = 0; }
  seq(dur, fn) { this.segs.push({ t0: this.t, dur, fn }); this.t += dur; return this.t; }
  at(t0, dur, fn) { this.segs.push({ t0, dur, fn }); return t0 + dur; }
  get total() { return Math.max(this.t, ...this.segs.map(s => s.t0 + s.dur)); }
  eval(T, st) {
    for (const s of this.segs) if (s.t0 <= T) s.fn(s.dur > 0 ? clamp((T - s.t0) / s.dur, 0, 1) : 1, st);
  }
  finish() { this.segs.sort((a, b) => a.t0 - b.t0); }
}

// המיקום של כיסא במערכת האוטובוס: גובה ונטייה לפי הקרקע מתחת לגלגלים האחוריים ולגלגלים הקדמיים
function chairPose(c, phi, out = { y: 0, pitch: 0 }) {
  const fx = c.x + Math.sin(c.yaw) * WC.caster.z, fz = c.z + Math.cos(c.yaw) * WC.caster.z;
  const yr = groundAt(c.x, c.z, phi), yf = groundAt(fx, fz, phi);
  out.y = yr; out.pitch = clamp(Math.atan2(yf - yr, WC.caster.z), -SLOPE - 0.03, SLOPE + 0.03); return out;
}
const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _ce = new THREE.Euler(0, 0, 0, 'YXZ');
function chairPoint(c, phi, local) {
  const p = chairPose(c, phi);
  _ce.set(-p.pitch, c.yaw, 0); _cm.compose(V3(c.x, p.y, c.z), _cq.setFromEuler(_ce), V3(1, 1, 1));
  return local.clone().applyMatrix4(_cm);
}

// ---------- השכבה
export class AccessLayer {
  constructor(scene, people) {
    this.scene = scene; this.people = people;
    this.group = new THREE.Group(); this.group.name = 'access'; scene.add(this.group);
    this.rate = WHEELCHAIR_RATE; this.force = null;
    this.waiting = new Map();      // p.id → כיסא בתחנה
    this.riding = new Map();       // p.id → { chair, bus } כיסא באוטובוס
    this.seqs = []; this.pending = [];
    this.drivers = [];
    this.tmp = { y: 0, pitch: 0 };
  }
  env() { return this.scene.userData.envMap || null; }
  variantOf(pid) {
    const P = this.people, Vs = P?.variants || [];
    const ok = Vs.map((V, i) => V.sit ? i : -1).filter(i => i >= 0);
    if (!ok.length) return -1;
    const vi = P.variantOf(pid); return Vs[vi]?.sit ? vi : ok[Math.floor(hash(pid + 5) * ok.length)];
  }
  makeChair(pid) {
    const vi = this.variantOf(pid);
    let s = null;
    if (vi >= 0) { try { s = new Sitter(this.people.variants[vi]); } catch (e) { console.warn('wheelchair sitter failed', e); } }
    s = s || proceduralSitter();
    const ch = makeChairObject(this.env(), s.holder, s.fz);
    ch.userData.pid = pid; ch.userData.sitter = s;
    return ch;
  }
  // סימון נוסע ככיסא גלגלים: לפי הסיכוי, או בכוח (הנוסע הבא בתחנה, או מישהו שכבר מחכה בה)
  mark(p, stop) {
    if (p._wc) return; p._wc = 1;
    if (this.force && (this.force === true || this.force === stop?.id)) { p.wheel = true; this.force = null; }
    else if (this.rate && hash(p.id * 1.618 + 3.3) < this.rate) p.wheel = true;
  }
  forceAt(sim, stopId) {
    for (const L of sim.lines) {
      if (L.retired) continue;
      for (let k = 0; k < L.stops.length - 1; k++) {
        if (stopId && L.stops[k].id !== stopId) continue;
        const p = L.queues[k].find(q => !q.wheel);
        if (p) { p._wc = 1; p.wheel = true; return p.id; }
      }
    }
    this.force = stopId || true; return null;
  }
  // המקום שבו הכיסא מחכה: ליד השפה, מאחורי הסככה (מאחורי המקום שבו הדלת האמצעית תיעצר), פונה בכיוון הנסיעה
  waitSpot(stop, i) {
    const f = this.people.stopFrame(stop);
    const d = clamp((f.free ?? 4) - 0.5, 0.9, 1.7), a = -7.1 - i * 1.2;
    const p = frameV(f, a, d, 0.12);
    return { p, yaw: Math.atan2(f.tx, -f.ty) };
  }

  update(sim, simDt, busLayer) {
    this.busLayer = busLayer;
    for (const ev of sim.events) {
      if (ev.type === 'spawn') this.mark(ev.p, ev.stop);
      else if (ev.type === 'board' && ev.p.wheel) this.start('board', ev);
      else if (ev.type === 'alight' && ev.p.wheel) this.start('alight', ev);
    }
    // כיסאות בתחנות
    const seen = new Set(), per = new Map();
    for (const L of sim.lines) {
      if (L.visible === false) continue;
      L.queues.forEach((q, k) => {
        for (const p of q) {
          if (!p.wheel || seen.has(p.id)) continue;
          seen.add(p.id);
          const stop = L.stops[k], i = per.get(stop) || 0; per.set(stop, i + 1);
          let ch = this.waiting.get(p.id);
          if (!ch) { ch = this.makeChair(p.id); this.group.add(ch); this.waiting.set(p.id, ch); }
          const w = this.waitSpot(stop, i);
          ch.position.copy(w.p); ch.rotation.set(0, w.yaw, 0); ch.visible = true;
        }
      });
    }
    for (const [pid, ch] of this.waiting) if (!seen.has(pid) && !ch.userData.busy) { this.group.remove(ch); this.waiting.delete(pid); }
    // כיסאות באוטובוסים שכבר לא קיימים (סוף הקו)
    for (const [pid, r] of this.riding) if (!r.obj.parent || !busLayer.map.has(r.bus.id)) { r.chair.parent?.remove(r.chair); this.riding.delete(pid); }
    // רצפים
    for (let i = this.seqs.length - 1; i >= 0; i--) {
      const q = this.seqs[i];
      q.T += simDt;
      if (!q.obj.parent) { this.end(q, true); this.seqs.splice(i, 1); continue; }
      this.apply(q, Math.min(q.T, q.tl.total));
      if (q.T >= q.tl.total) { this.end(q); this.seqs.splice(i, 1); }
    }
    // רצף שמחכה לאוטובוס פנוי (שני כיסאות באותה תחנה)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const ev = this.pending[i];
      if (!this.seqs.some(q => q.bus === ev.bus)) { this.pending.splice(i, 1); this.start(ev._kind, ev); }
    }
  }

  start(kind, ev) {
    const bus = ev.bus, v = this.busLayer?.map.get(bus.id);
    if (!v) { if (kind === 'alight') this.drop(ev.p.id); bus.access = false; return; }
    if (this.seqs.some(q => q.bus === bus)) { ev._kind = kind; this.pending.push(ev); bus.access = true; return; }
    const obj = v.obj;
    // האוטובוס כבר לא עומד בדלתות פתוחות (נדיר: עלה באותו צעד שבו הדלתות נסגרו) — בלי אנימציה
    const live = bus.state === 'dwell' && bus.ph === 'xchg';
    let chair;
    if (kind === 'board') {
      chair = this.waiting.get(ev.p.id);
      if (chair) this.waiting.delete(ev.p.id);
      else { chair = this.makeChair(ev.p.id); const w = this.waitSpot(ev.stop, 0); chair.position.copy(w.p); chair.rotation.set(0, w.yaw, 0); this.group.add(chair); }
      obj.updateMatrixWorld(true); obj.attach(chair);
    } else {
      chair = this.riding.get(ev.p.id)?.chair;
      this.riding.delete(ev.p.id);
      if (!chair || chair.parent !== obj) { chair?.parent?.remove(chair); chair = this.makeChair(ev.p.id); obj.add(chair); this.park(chair, 0); }
    }
    chair.userData.busy = true;
    if (!live) {
      if (kind === 'board') { this.park(chair, this.parkedOn(bus)); this.riding.set(ev.p.id, { chair, bus, obj }); }
      else chair.parent?.remove(chair);
      bus.access = false; return;
    }
    bus.access = true;
    const q = { kind, bus, obj, v, chair, pid: ev.p.id, T: 0, slot: kind === 'board' ? this.parkedOn(bus) : 0 };
    q.ramp = obj.getObjectByName('AccessRamp'); q.door = obj.getObjectByName('CabDoor'); q.baked = obj.getObjectByName('Driver');
    if (DRIVER_RIG && q.baked) {
      q.drv = this.drivers.pop() || (() => { try { return new DriverActor(DRIVER_RIG); } catch (e) { console.warn('driver actor failed', e); return null; } })();
      if (q.drv) { obj.add(q.drv.obj); q.drv.obj.visible = true; q.baked.visible = false; }
    }
    const stride = q.drv?.stride || 0.9;
    const c0 = { x: chair.position.x, z: chair.position.z, yaw: Math.atan2(V3(0, 0, 1).applyQuaternion(chair.quaternion).x, V3(0, 0, 1).applyQuaternion(chair.quaternion).z) };
    q.tl = kind === 'board' ? this.boardTimeline(c0, q.slot, stride) : this.alightTimeline(q.slot, stride);
    q.tl.finish();
    this.seqs.push(q);
    this.apply(q, 0);
  }
  parkedOn(bus) { let n = 0; for (const r of this.riding.values()) if (r.bus === bus) n++; return n; }
  bay(slot) { return slot ? { x: 0.2, z: -0.95, yaw: 0 } : { x: BAY.x, z: BAY.z, yaw: 0 }; }
  park(chair, slot) { const b = this.bay(slot); chair.position.set(b.x, FL, b.z); chair.rotation.set(0, b.yaw, 0); }
  drop(pid) { const r = this.riding.get(pid); if (r) { r.chair.parent?.remove(r.chair); this.riding.delete(pid); } }

  end(q, aborted) {
    q.bus.access = this.pending.some(e => e.bus === q.bus);
    if (q.drv) { q.drv.obj.parent?.remove(q.drv.obj); this.drivers.push(q.drv); }
    if (q.baked) q.baked.visible = true;
    if (q.door) q.door.rotation.y = 0;
    if (q.ramp) q.ramp.rotation.z = 0;
    q.chair.userData.busy = false;
    q.chair.userData.sitter?.arms(q.chair, 0, 0, 0);
    if (q.kind === 'board' && !aborted) { this.park(q.chair, q.slot); this.riding.set(q.pid, { chair: q.chair, bus: q.bus, obj: q.obj }); }
    else q.chair.parent?.remove(q.chair);
  }

  // מחיל את המצב בזמן T: דלת התא, המשטח, הכיסא (גלגלים, גלגלים קדמיים שמסתובבים לכיוון התנועה, ידי הנוסע) והנהג
  apply(q, T) {
    const st = { door: 0, phi: 0, chair: null, drv: null };
    q.tl.eval(T, st);
    if (q.door) q.door.rotation.y = st.door;
    if (q.ramp) q.ramp.rotation.z = st.phi;
    const c = st.chair;
    if (c) {
      const p = chairPose(c, st.phi, this.tmp), ch = q.chair;
      ch.position.set(c.x, p.y, c.z); ch.rotation.set(-p.pitch, c.yaw, 0);
      const wc = ch.userData.wc, rl = c.rl ?? c.roll ?? 0, rr = c.rr ?? c.roll ?? 0;
      wc.wheels[0].rotation.x = rr; wc.wheels[1].rotation.x = rl;
      // הגלגלים הקדמיים: נגררים אחרי הציר שלהם, כך שהם פונים לכיוון התנועה של הנקודה שבה הם מחוברים
      const pst = { door: 0, phi: 0, chair: null }; q.tl.eval(Math.max(0, T - 0.12), pst);
      const pc = pst.chair;
      wc.casters.forEach((w, i) => {
        const sx = i ? 1 : -1, piv = w.parent;
        if (pc) {
          const loc = (cc) => { const sn = Math.sin(cc.yaw), cs = Math.cos(cc.yaw); const lx = sx * WC.caster.x, lz = WC.caster.z; return [cc.x + lx * cs + lz * sn, cc.z - lx * sn + lz * cs]; };
          const a = loc(c), b = loc(pc), dx = a[0] - b[0], dz = a[1] - b[1];
          if (Math.hypot(dx, dz) > 0.004) {
            const sn = Math.sin(c.yaw), cs = Math.cos(c.yaw), vx = dx * cs - dz * sn, vz = dx * sn + dz * cs;
            piv.rotation.y = Math.atan2(vx, vz);
          }
        }
        w.rotation.x = (c.roll ?? (rl + rr) / 2) * WC.R / WC.caster.r;
      });
      ch.userData.sitter?.arms(ch, c.propel || 0, rl, rr);
      this.fade(ch, c.op ?? 1);
    }
    if (q.drv && st.drv) { st.drv.phi = st.phi; st.drv.lock = this.locks(q, T, st.drv); q.drv.pose(st.drv, q.obj); }
  }
  // נעילת כפות הרגליים בהליכה: אם רגל נמצאת עכשיו בחלק "על הקרקע" של המחזור, מוצאים מתי היא דרכה (לפי זמן ההליכה,
  // שעולה עם הזמן) ומחשבים את התנוחה באותו רגע — שם היא נשארת עד שהיא מתרוממת. כך אין החלקה גם בפניות ובהאצה
  locks(q, T, d) {
    const A = q.drv, walking = s => s && !(s.sitK > 0) && !(s.crouch > 0) && (s.walkW || 0) > 0.3;
    if (!A.stance || !walking(d)) return null;
    const out = [null, null], wt = d.walkT || 0, at = t => { const s = { door: 0, phi: 0 }; q.tl.eval(t, s); return s; };
    A.stance.forEach((S, j) => {
      if (!S) return;
      const ph = ((wt / A.dur) % 1 + 1) % 1, into = ((ph - S.ps) % 1 + 1) % 1;
      if (into >= S.len) return;
      const ws = wt - into * A.dur;
      // הזמן שבו זמן ההליכה היה ws (חיפוש בינארי אחורה, עד 2.5 שנ')
      let lo = Math.max(0, T - 2.5), hi = T;
      if ((at(lo).drv?.walkT ?? Infinity) > ws) return;
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if ((at(m).drv?.walkT ?? 0) < ws) lo = m; else hi = m; }
      const s0 = at(hi); if (!walking(s0.drv)) return;
      s0.drv.phi = s0.phi; s0.drv.lock = null;
      A.pose(s0.drv, q.obj);
      const p = q.obj.worldToLocal(A.B(j ? 'RightFoot' : 'LeftFoot').getWorldPosition(V3()));
      const e = into / S.len, w = clamp((1 - e) / 0.08, 0, 1) * clamp((d.walkW - 0.3) / 0.4, 0, 1);
      out[j] = { p, w: ease(w) };
    });
    return out;
  }
  fade(ch, o) {
    if ((ch.userData.op ?? 1) === o) return;
    if (!ch.userData.ownMats) {
      ch.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); } }); ch.userData.ownMats = true;
    }
    ch.userData.op = o;
    ch.traverse(m => { if (m.isMesh) { m.material.transparent = o < 1; m.material.opacity = o; m.material.depthWrite = o >= 0.99; } });
    ch.visible = o > 0.01;
  }

  // ---------- בניית הרצפים
  // הנהג: סמן (D) שזוכר איפה הוא, לאן הוא פונה והיכן הוא בהקלטת ההליכה, ופונקציות שמוסיפות קטעים
  driverKit(tl, stride) {
    const D = { x: SEAT.x, z: SEAT.z, yaw: 0, walkT: 0 };
    const head = (x, z, y = 1.6) => V3(x, groundAt(x, z, 0) + y, z);
    const set = (st, o) => { st.drv = Object.assign({ x: D.x, z: D.z, yaw: D.yaw, walkT: D.walkT, walkW: 0, sitK: 0, crouch: 0, lean: 0, hands: null }, o); };
    const ahead = (yaw, x = D.x, z = D.z) => head(x + Math.sin(yaw) * 2, z + Math.cos(yaw) * 2, 1.45);
    const K = {
      D, set, head, ahead,
      seated(dur) { return tl.seq(dur, (u, st) => set(st, { x: SEAT.x, z: SEAT.z, yaw: 0, sitK: 1, look: V3(SEAT.x, 1.6, 8) })); },
      // הליכה: מאיץ ומאט בהדרגה, הצעדים לפי המרחק (בלי החלקה), הגוף פונה בהדרגה אל הדרך והמבט מקדים אותו
      walk(pts, v = 1.1, o = {}) {
        const P = new Path([[D.x, D.z], ...pts]), y0 = D.yaw, t0 = D.walkT, pr = profile(P.L, v, o.ta ?? 0.5);
        tl.seq(pr.dur, (u, st) => {
          const t = u * pr.dur, d = pr.d(t), [x, z] = P.at(d), yw = angLerp(y0, P.yaw(d, 0.35), ease(clamp(d / 0.6, 0, 1)));
          const la = P.at(Math.min(P.L, d + 1.4)), ly = P.yaw(Math.min(P.L, d + 0.8), 0.35);
          set(st, { x, z, yaw: yw, walkT: t0 + d / stride, walkW: ease(clamp(pr.sp(t) * 1.6, 0, 1)), look: o.look || (P.L - d > 0.5 ? head(la[0], la[1], 1.4) : ahead(ly, x, z)) });
        });
        const e = P.at(P.L); D.x = e[0]; D.z = e[1]; D.yaw = angLerp(y0, P.yaw(P.L, 0.35), 1); D.walkT = t0 + P.L / stride;
        return P;
      },
      // פנייה במקום: הראש מקדים, ואז הגוף מסתובב בצעדים קטנים
      turnTo(yaw, dur = 0.7, look) {
        const y0 = D.yaw, x = D.x, z = D.z, t = D.walkT, d = Math.abs(Math.atan2(Math.sin(yaw - y0), Math.cos(yaw - y0)));
        tl.seq(dur, (u, st) => set(st, { x, z, yaw: angLerp(y0, yaw, ease(clamp((u - 0.15) / 0.85, 0, 1))), walkT: t + ease(u) * Math.min(0.6, d * 0.35), walkW: 0.6 * Math.sin(Math.PI * u) * clamp(d, 0, 1), look: look || ahead(yaw, x, z) }));
        D.yaw = angLerp(y0, yaw, 1); D.walkT = t + Math.min(0.6, d * 0.35);
      },
      idle(dur, o = {}) { const x = D.x, z = D.z, y = D.yaw, t = D.walkT; return tl.seq(dur, (u, st) => set(st, { x, z, yaw: y, walkT: t, ...o })); },
    };
    return K;
  }
  // יוצא מהתא: מסתכל אחורה-ימינה, מושיט יד לידית ודוחף את הדלת, מסתובב עם הכיסא החוצה, קם תוך כדי שהוא ממשיך לפתוח,
  // ומשחרר. כל תנועה של הדלת היא תנועה של היד
  exitCab(tl, K) {
    const D = K.D, TH1 = 0.62, TH2 = CAB_DOOR.open, SW = -0.55, Y1 = -2.45;
    const hd = (th) => cabHandle(th, 1);
    const seat = { x: SEAT.x, z: SEAT.z, sitK: 1 };
    tl.seq(0.5, (u, st) => K.set(st, { ...seat, yaw: 0, look: hd(0), lookW: ease(u) }));
    tl.seq(0.7, (u, st) => { st.door = 0; K.set(st, { ...seat, yaw: 0, hands: { R: hd(0) }, handW: ease(u), look: hd(0) }); });
    tl.seq(0.25, (u, st) => { st.door = 0; K.set(st, { ...seat, yaw: 0, hands: { R: hd(0) }, look: hd(0) }); });            // אחיזה
    tl.seq(1.0, (u, st) => { const th = TH1 * ease(u); st.door = th; K.set(st, { ...seat, yaw: 0, hands: { R: hd(th) }, lean: -4 * Math.sin(Math.PI * u), look: hd(th) }); });
    tl.seq(1.0, (u, st) => { st.door = TH1; K.set(st, { ...seat, yaw: SW * ease(clamp((u - 0.25) / 0.75, 0, 1)), tuck: ease(clamp(u / 0.5, 0, 1)), hands: { R: hd(TH1) }, look: hd(TH1) }); });
    tl.seq(1.6, (u, st) => {
      const k = ease(u), th = TH1 + (TH2 - TH1) * ease(clamp(u / 0.6, 0, 1)); st.door = th;
      K.set(st, { x: SEAT.x + (STAND.x - SEAT.x) * k, z: SEAT.z + (STAND.z - SEAT.z) * k, yaw: angLerp(SW, Y1, ease(clamp((u - 0.3) / 0.7, 0, 1))), sitK: 1 - ease(clamp(u * 1.15, 0, 1)), tuck: 1, lean: 14 * Math.sin(Math.PI * clamp(u * 1.2, 0, 1)),
        walkT: 0.1, hands: { R: hd(th) }, look: hd(th), lookW: 1 - k * 0.6 });
    });
    tl.seq(0.5, (u, st) => { st.door = TH2; K.set(st, { x: STAND.x, z: STAND.z, yaw: Y1, walkT: 0.1, hands: { R: hd(TH2) }, handW: 1 - ease(u), look: K.ahead(Y1, STAND.x, STAND.z) }); });
    Object.assign(D, STAND, { yaw: Y1, walkT: 0.1 });
  }
  // חוזר לתא: נעמד מול הכיסא עם הגב אליו, אוחז בידית, מתיישב תוך כדי שהוא מושך את הדלת, מסתובב עם הכיסא קדימה,
  // סוגר את הדלת עד הסוף, ומחזיר את הידיים להגה
  enterCab(tl, K) {
    const D = K.D, TH1 = 0.62, TH2 = CAB_DOOR.open, SW = -0.55, Y0 = -1.05;
    const hd = (th) => cabHandle(th, -1), hdIn = (th) => cabHandle(th, 1);
    K.turnTo(Y0, 0.8, hd(TH2));
    const t = D.walkT;
    tl.seq(0.6, (u, st) => { st.door = TH2; K.set(st, { x: STAND.x, z: STAND.z, yaw: Y0, walkT: t, hands: { R: hd(TH2) }, handW: ease(u), look: hd(TH2) }); });
    tl.seq(1.8, (u, st) => {
      const k = ease(u), th = TH2 + (TH1 - TH2) * ease(clamp((u - 0.45) / 0.55, 0, 1)); st.door = th;
      // מתיישב: יורד לאט (הכנה), הגב קצת קדימה, ואז נשען לאחור
      const sk = ease(clamp((u - 0.1) / 0.9, 0, 1));
      K.set(st, { x: STAND.x + (SEAT.x - STAND.x) * k, z: STAND.z + (SEAT.z - STAND.z) * k, yaw: angLerp(Y0, SW, k), sitK: sk, tuck: 1, lean: 16 * Math.sin(Math.PI * sk), walkT: t,
        // יד שמאל נתמכת בכיסא בזמן שהוא יורד אליו
        hands: { R: hd(th).lerp(hdIn(th), k), L: V3(SEAT.x + 0.2, FL + 0.6, SEAT.z + 0.05) }, handWL: Math.sin(Math.PI * clamp(u * 1.1, 0, 1)), look: hd(th), lookW: 0.6 + 0.4 * k });
    });
    tl.seq(1.0, (u, st) => { st.door = TH1; K.set(st, { x: SEAT.x, z: SEAT.z, yaw: SW * (1 - ease(clamp(u / 0.75, 0, 1))), sitK: 1, tuck: 1 - ease(clamp((u - 0.5) / 0.5, 0, 1)), hands: { R: hdIn(TH1) }, look: hdIn(TH1) }); });
    tl.seq(1.0, (u, st) => { const th = TH1 * (1 - ease(u)); st.door = th; K.set(st, { x: SEAT.x, z: SEAT.z, yaw: 0, sitK: 1, hands: { R: hdIn(th) }, lean: -3 * Math.sin(Math.PI * u), look: hdIn(th) }); });
    tl.seq(0.7, (u, st) => { st.door = 0; K.set(st, { x: SEAT.x, z: SEAT.z, yaw: 0, sitK: 1, hands: { R: hdIn(0) }, handW: 1 - ease(u), look: hdIn(0).lerp(V3(SEAT.x, 1.6, 8), ease(u)) }); });
    Object.assign(D, SEAT, { yaw: 0 });
  }
  // מהתא אל הדלת האמצעית: במעבר (מתחת לשלט התלוי ליד המחיצה), עד הידית של המשטח
  toRamp(tl, K) {
    K.walk([[-0.12, 4.2], [-0.06, 3.5], [0.0, 1.5], [0.2, 0.85], [0.66, 0.1]], 1.1);
    K.turnTo(-Math.PI / 2, 0.8, rampLocal(0, HANDLE_U, 0, 0));
  }
  // הנהג הופך את המשטח החוצה מבפנים: מתכופף (ברכיים), אוחז בידית, מרים עם הרגליים ונע אחריו, דוחף מעבר לאנך,
  // והמשטח נופל אל המדרכה
  flipOut(tl, K, stride) {
    const D = K.D, x0 = D.x, z0 = D.z, yaw = D.yaw, t0 = D.walkT;
    const hand = (phi, s) => rampLocal(phi, HANDLE_U, 0.01, s * 0.08), look = phi => rampLocal(phi, HANDLE_U, 0, 0);
    const hdir = V3(0, -1, 0);
    K.idle(0.35, { look: look(0) });
    tl.seq(1.0, (u, st) => { const k = ease(u); st.drv = { x: x0, z: z0, yaw, walkT: t0, crouch: k, hands: { L: hand(0, 1), R: hand(0, -1) }, handW: ease(clamp(u * 1.5 - 0.4, 0, 1)), handDir: hdir, look: look(0) }; });
    tl.seq(0.3, (u, st) => { st.drv = { x: x0, z: z0, yaw, walkT: t0, crouch: 1 - 0.1 * ease(u), hands: { L: hand(0, 1), R: hand(0, -1) }, handDir: hdir, look: look(0) }; });
    const LIFT = D2R(84);
    tl.seq(2.2, (u, st) => {
      const e = ease(u), phi = LIFT * (e * 0.85 + 0.15 * u * u), hx = RAMP.hx + HANDLE_U * Math.cos(phi);
      const x = Math.min(x0, hx + 0.5);
      st.phi = phi;
      st.drv = { x, z: z0, yaw, walkT: t0 + (x0 - x) / stride, walkW: clamp((x0 - x) * 6, 0, 0.9), crouch: 0.9 * (1 - ease(clamp(u * 1.5, 0, 1))), lean: -6 * Math.sin(Math.PI * u),
        hands: { L: hand(phi, 1), R: hand(phi, -1) }, handDir: V3(-Math.sin(phi) * 0.3, -1, 0), look: look(phi) };
    });
    const x1 = Math.min(x0, RAMP.hx + HANDLE_U * Math.cos(LIFT) + 0.5), t1 = t0 + (x0 - x1) / stride;
    tl.seq(0.75, (u, st) => {
      const phi = LIFT + D2R(16) * ease(u); st.phi = phi;
      st.drv = { x: x1 - 0.06 * Math.sin(Math.PI * u), z: z0, yaw, walkT: t1, walkW: 0, lean: 10 * Math.sin(Math.PI * u), hands: { L: hand(phi, 1), R: hand(phi, -1) }, handW: 1 - ease(clamp((u - 0.45) / 0.55, 0, 1)), look: look(phi) };
    });
    // נופל: מאיץ כמו בכובד, ובסוף קפיצה קטנה על המדרכה. הנהג מסתכל עליו
    const P0 = LIFT + D2R(16);
    tl.seq(0.85, (u, st) => {
      let phi = P0 + (PHI_OUT - P0) * Math.min(1, u * u * 1.25);
      if (u > 0.8) phi = PHI_OUT - Math.sin((u - 0.8) / 0.2 * Math.PI) * 0.03 * (1 - (u - 0.8) / 0.2);
      st.phi = phi; st.drv = { x: x1 + 0.08 * ease(u), z: z0, yaw, walkT: t1, look: rampLocal(phi, RAMP.L, 0, 0) };
    });
    D.x = x1 + 0.08; D.walkT = t1;
    K.idle(0.3, { look: rampLocal(PHI_OUT, RAMP.L, 0, 0) });
    return tl.t;
  }
  // הנהג מקפל את המשטח פנימה מהמדרכה: מתכופף לקצה, מרים, דוחף מעבר לאנך, והמשטח נופל אל הרצפה
  flipIn(tl, K, stride) {
    const D = K.D;
    K.walk([[-0.75, DOOR_Z], [-2.4, DOOR_Z], [-2.62, DOOR_Z - 0.05]], 1.0);
    K.turnTo(Math.PI / 2, 0.9, rampLocal(PHI_OUT, RAMP.L, 0, 0));
    const x0 = D.x, z0 = D.z, yaw = D.yaw, t0 = D.walkT;
    const end = (phi, s) => rampLocal(phi, RAMP.L - 0.03, -RAMP.t / 2, s * 0.3), look = phi => rampLocal(phi, RAMP.L, 0, 0);
    // יתקרב לקצה בצעד קטן
    K.walk([[-2.42, DOOR_Z]], 0.5, { look: look(PHI_OUT), ta: 0.3 });
    const xa = D.x, ta = D.walkT;
    tl.seq(1.0, (u, st) => { const k = ease(u); st.phi = PHI_OUT; st.drv = { x: xa, z: z0, yaw, walkT: ta, crouch: k, hands: { L: end(PHI_OUT, -1), R: end(PHI_OUT, 1) }, handW: ease(clamp(u * 1.5 - 0.4, 0, 1)), look: look(PHI_OUT) }; });
    const UP = D2R(98);
    tl.seq(2.3, (u, st) => {
      const e = ease(u), phi = PHI_OUT + (UP - PHI_OUT) * e, p = rampLocal(phi, RAMP.L, 0, 0);
      const x = clamp(p.x - 0.5, xa, -1.42);
      st.phi = phi; st.drv = { x, z: z0, yaw, walkT: ta + (x - xa) / stride, walkW: clamp((x - xa) * 6, 0, 0.9), crouch: Math.max(0, 1 - ease(clamp(u * 1.7, 0, 1))), lean: -8 * Math.sin(Math.PI * clamp(u * 1.4, 0, 1)),
        hands: { L: end(phi, -1), R: end(phi, 1) }, look: look(phi) };
    });
    const x1 = clamp(rampLocal(UP, RAMP.L, 0, 0).x - 0.5, xa, -1.42), t1 = ta + (x1 - xa) / stride;
    tl.seq(0.75, (u, st) => { const phi = UP - D2R(14) * ease(u); st.phi = phi; st.drv = { x: x1 + 0.05 * Math.sin(Math.PI * u), z: z0, yaw, walkT: t1, lean: 9 * Math.sin(Math.PI * u), hands: { L: end(phi, -1), R: end(phi, 1) }, handW: 1 - ease(clamp((u - 0.45) / 0.55, 0, 1)), look: look(phi) }; });
    const P0 = UP - D2R(14);
    tl.seq(0.9, (u, st) => {
      let phi = P0 * (1 - Math.min(1, u * u * 1.25));
      if (u > 0.8) phi = Math.sin((u - 0.8) / 0.2 * Math.PI) * 0.025 * (1 - (u - 0.8) / 0.2);
      st.phi = phi; st.drv = { x: x1 - 0.06 * ease(u), z: z0, yaw, walkT: t1, look: look(phi) };
    });
    D.x = x1 - 0.06; D.walkT = t1;
    K.idle(0.3, { look: rampLocal(0, 0.6, 0, 0) });
  }
  // חזרה מהדלת האמצעית לתא: עולה במדרגה ישר דרך הפתח, פונה אל המעבר, והולך קדימה
  backToCab(tl, K) {
    K.walk([[-1.0, DOOR_Z], [-0.3, DOOR_Z + 0.05], [-0.05, 0.6], [-0.05, 1.5], [0.0, 3.5], [-0.12, 4.15], [STAND.x, STAND.z]], 1.1);
  }

  boardTimeline(c0, slot, stride) {
    const tl = new Timeline(), K = this.driverKit(tl, stride), D = K.D;
    // הכיסא מחכה במקום (עד שהנהג מגיע)
    tl.at(0, 0, (u, st) => { st.chair = { ...c0, roll: 0 }; });
    K.seated(0.3);
    this.exitCab(tl, K);
    this.toRamp(tl, K);
    this.flipOut(tl, K, stride);
    // יורד במשטח ומקיף את הכיסא אל מאחוריו
    const h = [Math.sin(c0.yaw), Math.cos(c0.yaw)], C = [c0.x, c0.z];
    const behind = [C[0] - h[0] * 0.82, C[1] - h[1] * 0.82];
    K.turnTo(-Math.PI / 2, 0.6);
    K.walk([[-0.75, DOOR_Z], [-2.25, DOOR_Z], [Math.min(-2.5, C[0] - 0.45), Math.max(C[1] + 0.9, -0.6)], [C[0] - 0.75, C[1] + 0.15], [C[0] - 0.6, behind[1] - 0.05], behind], 1.1);
    K.turnTo(c0.yaw, 0.7, chairPoint(c0, PHI_OUT, V3(0, 0.95, WC.zb - 0.15)));
    const hold = c => WC.handles.map(p => chairPoint(c, PHI_OUT, p));
    const hdir = c => { const f = chairPoint(c, PHI_OUT, V3(0, 0, 1)).sub(chairPoint(c, PHI_OUT, V3())); return f.multiplyScalar(0.6).add(V3(0, -0.5, 0)); };
    const grabX = D.x, grabZ = D.z, gy = D.yaw, gt = D.walkT;
    tl.seq(0.8, (u, st) => {
      const hh = hold(c0), k = ease(u);
      st.drv = { x: grabX, z: grabZ, yaw: gy, walkT: gt, hands: { L: hh[1], R: hh[0] }, handW: k, handDir: hdir(c0), lean: 5 * k, look: chairPoint(c0, PHI_OUT, V3(0, 0.9, 0)) };
    });
    // דוחף: עקומה עד מול המשטח, ואז ישר במעלה המשטח אל תוך האוטובוס. מאיץ לאט ומאט לפני המקום; נשען קדימה במעלה
    const F = [-2.38, DOOR_Z], dist = Math.hypot(F[0] - C[0], F[1] - C[1]), kc = dist * 0.5;
    const pts = [...bezier(C, [C[0] + h[0] * kc, C[1] + h[1] * kc], [F[0] - kc, F[1]], F), [0.42, DOOR_Z]];
    const P = new Path(pts), pr = profile(P.L, 0.62, 1.0), head = K.head;
    const push = (u, st) => {
      const t = u * pr.dur, d = pr.d(t), [x, z] = P.at(d), yaw = P.yaw(d, 0.08), c = { x, z, yaw, roll: d / WC.R };
      st.chair = c;
      const hh = hold(c), up = x > -2.4 && x < -0.75 ? 1 : 0;
      const la = P.at(Math.min(P.L, d + 1.5));
      st.drv = { x: x - Math.sin(yaw) * 0.82, z: z - Math.cos(yaw) * 0.82, yaw, walkT: gt + d / stride, walkW: ease(clamp(pr.sp(t) * 2, 0, 1)), lean: 9 + 9 * up * pr.sp(t),
        hands: { L: hh[1], R: hh[0] }, handDir: hdir(c), look: head(la[0], la[1], 1.0) };
    };
    const tPush = tl.seq(pr.dur, push);
    const end = P.at(P.L), eyaw = P.yaw(P.L, 0.08), roll1 = P.L / WC.R;
    D.x = end[0] - Math.sin(eyaw) * 0.82; D.z = end[1] - Math.cos(eyaw) * 0.82; D.yaw = eyaw; D.walkT = gt + P.L / stride;
    // משחרר; הנוסע מסתובב לבד אל המקום שלו (הידיים על טבעות ההנעה)
    const rx = D.x, rz = D.z, rt = D.walkT, b = this.bay(slot);
    tl.seq(0.7, (u, st) => { const hh = hold({ x: end[0], z: end[1], yaw: eyaw }); st.drv = { x: rx - 0.12 * ease(u), z: rz, yaw: eyaw, walkT: rt, hands: { L: hh[1], R: hh[0] }, handW: 1 - ease(u), look: chairPoint({ x: end[0], z: end[1], yaw: eyaw }, PHI_OUT, V3(0, 1.0, 0.3)) }; });
    D.x = rx - 0.12;
    tl.at(tPush + 0.5, 3.0, (u, st) => {
      const k = ease(u), yaw = angLerp(eyaw, b.yaw, k), dy = yaw - eyaw, d = Math.hypot(b.x - end[0], b.z - end[1]) * k;
      st.chair = { x: end[0] + (b.x - end[0]) * k, z: end[1] + (b.z - end[1]) * k, yaw, rl: roll1 + (d - dy * WC.wx) / WC.R, rr: roll1 + (d + dy * WC.wx) / WC.R, roll: roll1 + d / WC.R, propel: Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) ** 0.5 };
    });
    K.idle(0.4, { look: chairPoint({ x: b.x, z: b.z, yaw: b.yaw }, PHI_OUT, V3(0, 1.1, 0)) });
    K.turnTo(-Math.PI / 2, 0.9);
    this.flipIn(tl, K, stride);
    this.backToCab(tl, K);
    this.enterCab(tl, K);
    return tl;
  }

  alightTimeline(slot, stride) {
    const tl = new Timeline(), K = this.driverKit(tl, stride), b = this.bay(slot);
    tl.at(0, 0, (u, st) => { st.chair = { x: b.x, z: b.z, yaw: b.yaw, roll: 0 }; });
    K.seated(0.3);
    this.exitCab(tl, K);
    this.toRamp(tl, K);
    const tOut = this.flipOut(tl, K, stride);
    // הנהג זז הצידה אל המעבר ומסתכל על הנוסע
    K.turnTo(Math.PI * 0.1, 0.8);
    K.walk([[-0.15, 0.7], [-0.05, 1.35]], 0.9);
    const A = [0.42, DOOR_Z];
    K.turnTo(-Math.PI * 0.75, 0.9, chairPoint({ x: A[0], z: A[1], yaw: -Math.PI / 2 }, PHI_OUT, V3(0, 1.1, 0)));
    // הנוסע: מסתובב אל הדלת, יורד במשטח (מאט את עצמו), פונה לאורך המדרכה ומתרחק
    const t1 = tl.at(tOut + 0.4, 3.0, (u, st) => {
      const k = ease(u), yaw = angLerp(b.yaw, -Math.PI / 2, k), dy = yaw - b.yaw, d = Math.hypot(A[0] - b.x, A[1] - b.z) * k;
      st.chair = { x: b.x + (A[0] - b.x) * k, z: b.z + (A[1] - b.z) * k, yaw, roll: d / WC.R, rl: (d - dy * WC.wx) / WC.R, rr: (d + dy * WC.wx) / WC.R, propel: Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) ** 0.5 };
    });
    const r0 = Math.hypot(A[0] - b.x, A[1] - b.z) / WC.R;
    const P = new Path([A, [-2.6, DOOR_Z], ...bezier([-2.6, DOOR_Z], [-3.3, DOOR_Z], [-3.3, -0.9], [-3.3, -1.7]).slice(1), [-3.3, -6.5]]);
    const pr = profile(P.L, 0.6, 0.9);
    tl.at(t1, pr.dur, (u, st) => {
      const t = u * pr.dur, d = pr.d(t), [x, z] = P.at(d);
      // במורד המשטח מחזיק את הטבעות (בולם), אחר כך דוחף
      st.chair = { x, z, yaw: P.yaw(d, 0.1), roll: r0 + d / WC.R, op: clamp((P.L - d) / 2.0, 0, 1), propel: clamp(t / 0.6, 0, 1) };
    });
    // הנהג מחכה שהנוסע יתרחק מהמשטח, ואז יוצא לקפל אותו
    const tFree = t1 + pr.dur * 0.55;
    if (tFree > tl.t) K.idle(tFree - tl.t, { look: V3(-2.8, 0.9, -1.0) });
    K.turnTo(-Math.PI * 0.8, 0.6);
    this.flipIn(tl, K, stride);
    this.backToCab(tl, K);
    this.enterCab(tl, K);
    return tl;
  }
}
