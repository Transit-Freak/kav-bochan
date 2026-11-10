// נוסעים בכיסא גלגלים, משטח העלייה בדלת האמצעית, והנהג שיוצא לעזור.
//
// מדי פעם (בערך אחד מכל 60 נוסעים, או בכוח — __game.forceWheelchair) נוסע מחכה בתחנה בכיסא גלגלים.
// כשהוא עולה: הנהג יוצא מהתא ובדלת הקדמית אל המדרכה, הולך לדלת האמצעית, מושך ברצועה ופותח את המשטח (לוח מתקפל
// ברצפה, ציר בסף) החוצה אל המדרכה, נעמד מאחורי הכיסא ודוחף אותו במעלה המשטח עד מעבר לסף. משם הנוסע נוסע לבד
// אל המקום שלו. הנהג מקפל את המשטח מבחוץ, חוזר על המדרכה ונכנס בדלת הקדמית. בירידה — הנהג פותח את המשטח מבחוץ,
// והנוסע יורד לבד. הנהג לא הולך בתוך האוטובוס (חוץ מהצעדים ליד הדלת הקדמית).
//
// הכל במערכת הצירים של האוטובוס (‎+Z קדימה, הדלתות בצד ‎-X): הכיסא והנהג הם ילדים של האוטובוס בזמן הרצף.
// הרצף הוא רשימת קטעים עם זמן התחלה ומשך (בשניות משחק), וכל קטע קובע את המצב שלו באופן מוחלט —
// כך שבכל מהירות משחק (×1 עד ×60) ובכל קפיצה בזמן מתקבלת אותה תמונה, בלי הצטברות שגיאות.
// האוטובוס מחכה כל עוד bus.access (sim.js); הרצף משחרר אותו בסוף.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DRIVER_RIG, aim, turn, twoBone, personPart, driverMaterial } from './driver.js';
import { frameV, BENCH } from './stops.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, D2R = THREE.MathUtils.degToRad;
const ease = u => u * u * (3 - 2 * u);
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const hash = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

export const WHEELCHAIR_RATE = 1 / 60;

// ---------- מידות באוטובוס
const FL = 0.66, FLOOR = 0.675;                  // FL — גובה הרצפה בתא הנהג (driver.js); FLOOR — פני הרצפה בפועל (נמדד בדגם)
// המשטח: ציר בשפת הרצפה מול הדלת האמצעית. סגור — שטוח ברצפה, פנימה (‎+X). פתוח — הפוך, יורד אל המדרכה (‎0.12)
// בין שני העמודים שליד הדלת (z‏ ‎-0.36 ו-0.75) — המשטח לא עובר דרכם כשהוא מתהפך
// הלוח ממורכז על ציר הסיבוב (‎±t/2), כך שהוא בגובה הרצפה גם כשהוא סגור וגם כשהוא פתוח (בלי מדרגה בציר)
// הציר בסף הדלת (שם נגמרת הרצפה בפועל, x‏ ‎-1.215), באמצע בין כנפי הדלת הפתוחות
export const RAMP = { hx: -1.215, hy: 0.665, z: 0.1, L: 1.2, W: 0.86, t: 0.024 };
// השיפוע: לפי גובה הקרקע שמתחת לקצה (מדרכה 0.12, או אבן השפה כשהאוטובוס רחוק ממנה) — נקבע לכל תחנה (setSlope)
const slopeFor = g => Math.asin((RAMP.hy - g - RAMP.t / 2) / RAMP.L);
let SLOPE = slopeFor(0.12);
let PHI_OUT = Math.PI + SLOPE;                   // הזווית של המשטח הפתוח (0 = סגור, 90° = זקוף)
function setSlope(s) { SLOPE = s; PHI_OUT = Math.PI + s; }
const HANDLE_U = 1.1, HANDLE_Z = 0;             // הידית: ליד הקצה החופשי, באמצע הרוחב           // הידית השקועה: ליד הקצה החופשי, בשוליים שמצד המעבר (הנהג עומד לידו)
const SEAT = { x: 0.74, z: 4.56 };               // כיסא הנהג
// מקום הכיסא: ליד הדלת יש ארבעה עמודים ומתקפים בגובה החזה, ואין מקום לסובב כיסא אל משענת הגב שבדגם; לכן הכיסא
// נעמד בשטח הפתוח שבין העמודים, מאחורי הדלת. נכנס: מסתובב במקום (הרדיוס פנוי מכל העמודים) ונוסע אליו;
// יוצא: חוזר לנקודת הסיבוב, מסתובב אל הדלת ויורד לאחור במורד המשטח
const BAY = { x: 0.0, z: -0.75 };                // בין ארבעת העמודים שליד הדלת, פונה לאחור
// מרכז פתח הדלת; הקו שבו עוברים במשטח; PIV — נקודת הסיבוב של הכיסא בפנים (באמצע בין ארבעת העמודים)
const DOOR_Z = 0.025, LANE = RAMP.z, PIV = 0.19;
const FRONT_Z = 5.15;                            // מרכז הדלת הקדמית (הנהג יוצא ונכנס דרכה)
// הרצועה: קשורה לידית שבקצה החופשי, מונחת על הלוח הסגור ונתלית מעל הסף — הנהג מושך בה מהמדרכה
const XF0 = () => RAMP.hx + RAMP.L * Math.cos(PHI_OUT) - 0.3;   // איפה הנהג עומד כדי להרים את המשטח הפתוח מהקצה
const STRAP_LOOP = { x: RAMP.hx - 0.09, y: 0.53 };

// גובה הקרקע/הרצפה בנקודה (מערכת האוטובוס): מדרכה, כביש בין השפה לאוטובוס, מדרגת הדלת, רצפה, והמשטח כשהוא פתוח
function rampTopY(x) {
  const c = Math.cos(SLOPE), s = Math.sin(SLOPE), h = RAMP.t / 2, u = (RAMP.hx - h * s - x) / c;
  return RAMP.hy - u * s + h * c;
}
// מערכת השפה של התחנה הנוכחית: d (המרחק מהשפה לכיוון המדרכה) = a·x + b·z + c במערכת האוטובוס
let KERB = null;
// "כריעה": כשהמשטח נפתח האוטובוס מוריד את הצד של הדלתות — סיבוב קטן סביב הציר האורכי, כשהצד השני (x = far) נשאר
// במקומו. הסף של הדלת יורד כ-7.5 ס"מ, והמשטח פחות תלול. bus.kneel (0..1) — BusLayer מסובב את האוטובוס לפיו.
// במערכת האוטובוס הקרקע שבחוץ "עולה" בהתאם: ‎+th·k·(far − x)
export const KNEEL = { th: 0.0304, far: 1.25, dur: 1.4 };
let KNEEL_K = 0;
export const kneelDrop = (k, x) => k * KNEEL.th * (KNEEL.far - x);
function groundAt(x, z, phi) {
  const inDoor = Math.abs(z - DOOR_Z) < 0.62, onRamp = Math.abs(z - RAMP.z) < RAMP.W / 2 + 0.05;
  if (onRamp && phi > PHI_OUT - 0.05) {
    const x0 = RAMP.hx - RAMP.L * Math.cos(SLOPE) - RAMP.t / 2 * Math.sin(SLOPE);
    if (x >= x0 && x <= RAMP.hx) return rampTopY(x);
  }
  // הגבהים בפועל בדגם: רצפה 0.675, מדרגת הדלת 0.36, כביש 0.10, אבן השפה 0.165, מרצפות 0.12
  if (x > RAMP.hx - 0.01) return onRamp && phi > 0.05 && x < RAMP.hx + RAMP.L ? FLOOR + 0.006 : FLOOR;   // הגומחה של המשטח (כשהוא פתוח)
  if ((inDoor || Math.abs(z - FRONT_Z) < 0.585) && x > -1.28) return 0.36;   // פס המדרגה הצר שבין הסף לכנפיים (בשתי הדלתות)
  // בחוץ: לפי המרחק מהשפה של התחנה הזו (האוטובוס לא תמיד עומד צמוד ומקביל לשפה)
  const d = KERB ? KERB.a * x + KERB.b * z + KERB.c : -1.55 - x;
  const up = kneelDrop(KNEEL_K, x);
  if (d < 0) return 0.10 + up;
  if (d < 0.2) return 0.165 + up;                // אבן השפה: 20 ס"מ רוחב
  return 0.12 + up;
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
  // פסים צהובים בשוליים גם בצד הזה (כשהמשטח זקוף רואים שזה משטח, לא לוח לבן)
  for (const s of [-1, 1]) add(yellow, bx(L - 0.06, 0.0048, 0.04, L / 2, -0.0015, s * (W / 2 - 0.045)));
  add(yellow, bx(0.035, 0.0048, W - 0.13, L - 0.04, -0.0015, 0));
  // ידית שקועה: גומחה כהה ומוט בתוכה
  add(dark, bx(0.075, 0.005, 0.24, HANDLE_U, 0.0005, HANDLE_Z));
  add(alu, new THREE.CylinderGeometry(0.009, 0.009, 0.2, 10).rotateX(Math.PI / 2).translate(HANDLE_U, -0.002, HANDLE_Z));
  // הצד השני (למעלה כשהמשטח פתוח): משטח מונע החלקה, צלעות רוחב ופסים צהובים בשוליים
  add(grip, bx(L - 0.02, 0.004, W - 0.02, L / 2, -t - 0.002, 0));
  for (let u = 0.12; u < L - 0.05; u += 0.1) add(grip, bx(0.014, 0.006, W - 0.14, u, -t - 0.005, 0));
  for (const s of [-1, 1]) add(yellow, bx(L - 0.03, 0.006, 0.05, L / 2, -t - 0.004, s * (W / 2 - 0.04)));
  add(yellow, bx(0.05, 0.006, W - 0.14, L - 0.04, -t - 0.004, 0));
  // הציר: צינור לכל הרוחב
  add(alu, new THREE.CylinderGeometry(0.014, 0.014, W, 12).rotateX(Math.PI / 2).translate(0, -t / 2, 0));
  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh((list.length > 1 ? mergeGeometries(list, false) : list[0]).translate(0, t / 2, 0), m);
    mesh.name = 'AccessRamp_' + m.name; g.add(mesh);
  }
  busRoot.add(g);
  // הרצועה: שלושה קטעים של סרט שחור ולולאה בקצה
  const sm = new THREE.MeshStandardMaterial({ name: 'M_RampStrap', color: 0x24262a, roughness: 0.8 });
  const sg = new THREE.Group(); sg.name = 'AccessStrap';
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.004, 1).translate(0, 0, 0.5), sm); m.name = 'AccessStrap_' + i; sg.add(m); }
  const lp = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 14), sm); lp.name = 'AccessStrap_loop'; sg.add(lp);
  busRoot.add(sg); setStrap(sg, 0, null);
  cutDoorGlass(busRoot);
  // הגומחה ברצפה מתחת ללוח (נראית רק כשהלוח פתוח)
  const pit = new THREE.Mesh(new THREE.BoxGeometry(L - 0.02, 0.003, W - 0.02), new THREE.MeshStandardMaterial({ name: 'M_RampPit', color: 0x6b6f75, metalness: 0.5, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1 }));
  pit.position.set(RAMP.hx + L / 2, FLOOR + 0.003, RAMP.z); pit.name = 'AccessRampPit';
  busRoot.add(pit);
}
// בדגם, שמשת החלונות בצד הדלתות היא לוח אחד לכל האורך (גם לרוחב פתח הדלת האמצעית) — מי שעובר בדלת עובר דרכה.
// מחליפים אותה בשני חלקים, לפני הדלת ואחריה (כמו החיפוי התחתון ב-actors.js)
const MID_DOOR = [-0.585, 0.635];
function cutDoorGlass(root) {
  root.updateMatrixWorld(true);
  const add = [], v = [V3(), V3(), V3()];
  root.traverse(o => {
    const m = o.isMesh && [].concat(o.material)[0];
    if (!m || m.name !== 'M_Glass' || !o.geometry.index || o.name === 'Cab_Windshield') return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index.array, keep = [], box = new THREE.Box3();
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(o.matrixWorld);
      const slab = v.every(p => p.x < -1.2) && Math.min(...v.map(p => p.z)) < MID_DOOR[0] && Math.max(...v.map(p => p.z)) > MID_DOOR[1];
      if (slab) v.forEach(p => box.expandByPoint(p)); else keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (box.isEmpty()) return;
    g.setIndex(keep);
    for (const [z0, z1] of [[box.min.z, MID_DOOR[0]], [MID_DOOR[1], box.max.z]]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.max.x - box.min.x, box.max.y - box.min.y, z1 - z0), o.material);
      mesh.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (z0 + z1) / 2); mesh.name = 'SideGlass'; mesh.renderOrder = o.renderOrder;
      add.push(mesh);
    }
  });
  for (const m of add) root.add(m);
}
// הרצועה במצב הנוכחי: סגור — על הלוח ומעל הסף; ביד — מהידית אל היד; אחרת — תלויה מתחת לידית
function setStrap(g, phi, hand) {
  const A = rampLocal(phi, HANDLE_U, RAMP.t / 2 + 0.003, 0);
  let pts;
  if (hand) pts = [A, hand.clone()];
  else if (phi < 0.02) pts = [A, V3(RAMP.hx - 0.004, RAMP.hy + RAMP.t / 2 + 0.003, RAMP.z), V3(RAMP.hx - 0.022, RAMP.hy - 0.06, RAMP.z), V3(STRAP_LOOP.x, STRAP_LOOP.y + 0.045, RAMP.z)];
  else pts = [A, rampLocal(phi, 0.03, RAMP.t / 2 + 0.003, 0)];   // מונחת על הלוח (כשהוא פתוח היא מתחתיו)
  const segs = g.children.filter(m => /_\d$/.test(m.name)), lp = g.getObjectByName('AccessStrap_loop');
  segs.forEach((m, i) => {
    const a = pts[i], b = pts[i + 1];
    if (!b || a.distanceTo(b) < 1e-3) { m.visible = false; return; }
    m.visible = true; m.position.copy(a); m.scale.set(1, 1, a.distanceTo(b)); m.lookAt(g.parent ? b.clone().applyMatrix4(g.parent.matrixWorld) : b);
  });
  const e = pts[pts.length - 1]; lp.position.copy(e); lp.position.y -= hand ? 0 : 0.045; lp.rotation.set(0, 0, 0); lp.visible = !hand && phi < 0.02;
}
const endGrip = (phi, s) => { const k = clamp((PHI_OUT - phi) / (PHI_OUT - 1.75), 0, 1); const p = rampLocal(phi, RAMP.L + 0.07, 0, s * 0.3); p.y = Math.max(p.y + 0.14 * (1 - k), groundAt(p.x, p.z, 0) + 0.19 * (1 - k)); return p; };   // מעבר לקצה; כשהמשטח נמוך — גם מעליו
// האצבעות: כשהמשטח שוכב — למטה אל הקצה; כשהוא מורם — ממשיכות את הלוח החוצה מעבר לקצה (לא נכנסות בו)
const endDir = phi => { const k = clamp((PHI_OUT - phi) / (PHI_OUT - 1.75), 0, 1), m = ease(clamp((k - 0.1) / 0.7, 0, 1)); return V3(-0.12, -1, 0).normalize().lerp(V3(Math.cos(phi), Math.sin(phi), 0), m).normalize(); };
const rampLocal = (phi, u, y, z) => { const c = Math.cos(phi), s = Math.sin(phi); return V3(RAMP.hx + u * c - y * s, RAMP.hy + u * s + y * c, RAMP.z + z); };

// ---------- כיסא הגלגלים (ידני): שלדה, שני גלגלים גדולים עם טבעות הנעה, גלגלים קדמיים קטנים, מושב ומשענת, ידיות דחיפה
// מערכת הכיסא: ‎+Z קדימה, הראשית על הקרקע מתחת לציר הגלגלים האחוריים
const WC = { R: 0.3, axleZ: 0, wx: 0.315, seatY: 0.515, zb: -0.1, front: 0.36, caster: { x: 0.21, z: 0.42, r: 0.075 }, lift: 0.085 };
WC.handles = [-1, 1].map(s => V3(s * 0.175, 1.0, WC.zb - 0.165));   // מעל הידית (כף היד עליה, לא בתוכה)
function tubeG(a, b, r, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5); return g.translate(m.x, m.y, m.z);
}
function polyTube(pts, r, out) { for (let i = 0; i + 1 < pts.length; i++) { out.push(tubeG(pts[i], pts[i + 1], r)); if (i) out.push(new THREE.SphereGeometry(r, 8, 6).translate(pts[i].x, pts[i].y, pts[i].z)); } }
const strip = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); return n; };
const merge = list => list.length ? mergeGeometries(list.map(strip), false) : new THREE.BufferGeometry();

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
    met.push(new THREE.BoxGeometry(0.15, 0.012, 0.15).translate(s * 0.1, 0.075, fz));
    fr.push(tubeG(V3(s * 0.17, 0.1, fz - 0.06), V3(s * 0.1, 0.065, fz - 0.065), 0.01));
  }
  return { frame: merge(fr), metal: merge(met) };
}

function makeChairObject(env, person, fz) {
  const S = chairShared(env), M = S.M;
  const g = new THREE.Group(); g.name = 'Wheelchair'; g.rotation.order = 'YXZ';
  const mesh = (geo, m, parent = g) => { if (!geo.attributes.position) return null; const o = new THREE.Mesh(geo, m); parent.add(o); return o; };
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
    this.dur = walk ? walk.duration : 1.33;
    this.measure();
  }
  // העלמה והופעה (ביציאה מהתא ובחזרה אליו)
  fade(o) {
    if ((this.op ?? 1) === o) return; this.op = o;
    this.inner.traverse(m => { if (m.isMesh) { m.material.transparent = o < 1; m.material.opacity = o; m.material.depthWrite = o >= 0.99; } });
    this.obj.visible = o > 0.01;
  }
  // מידות מתנוחת העמידה: אורך הרגל, גובה הקרסול מעל הקרקע, ההפרש בין הקרסול לבוהן (לכיוון כף הרגל), כיוון כף היד
  measure() {
    const B = this.B, W = o => o.getWorldPosition(V3());
    this.idle?.setEffectiveWeight(1); this.walk?.setEffectiveWeight(0); this.mixer.setTime(0); this.inner.updateMatrixWorld(true);
    let ground = Infinity;
    this.inner.traverse(o => { if (o.isSkinnedMesh) { const p = o.geometry.attributes.position, v = V3(); for (let i = 0; i < p.count; i += 7) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); ground = Math.min(ground, v.y); } } });
    const a = W(B('LeftFoot')), t = W(B('LeftToeBase'));
    this.restA = a.y - ground;
    this.toe = { f: Math.hypot(t.x - a.x, t.z - a.z), h: a.y - t.y };
    this.legLen = W(B('LeftUpLeg')).distanceTo(W(B('LeftLeg'))) + W(B('LeftLeg')).distanceTo(a);
    this.palm = {};
    const hips = W(B('Hips'));
    for (const s of ['Left', 'Right']) {
      const hd = B(s + 'Hand'); if (!hd) continue;
      const inward = V3(Math.sign(hips.x - W(hd).x) || 1, 0, 0), wq = hd.getWorldQuaternion(new THREE.Quaternion());
      let best = V3(1, 0, 0), bd = 0;
      for (const ax of [V3(1, 0, 0), V3(0, 0, 1)]) { const d = ax.clone().applyQuaternion(wq).dot(inward); if (Math.abs(d) > Math.abs(bd)) { bd = d; best = ax; } }
      this.palm[s] = best.clone().multiplyScalar(Math.sign(bd) || 1);
    }
  }
  // s: x, z (מערכת האוטובוס), yaw, walkT/walkW (פלג הגוף העליון מהקלטת ההליכה), sitK (1 = יושב), crouch, lean (מעלות),
  // feet: [שמאל, ימין] — כל אחת {x, y, z, yaw, pitch} במערכת האוטובוס (מתכנן הצעדים); head: [סיבוב, הטיה] של הראש ביחס לגוף;
  // hands {L, R} + handW; phi — המשטח
  pose(s, bus) {
    const { obj, inner, B } = this;
    const ww = this.idle ? clamp(s.walkW ?? 0, 0, 1) : 1;
    this.walk?.setEffectiveWeight(ww); this.idle?.setEffectiveWeight(1 - ww);
    // three.js כותב לעצם רק ערך שהשתנה מהפעם הקודמת — מחזירים קודם את העצמות למה שהאנימציה נתנה בפעם הקודמת
    if (this.snap) for (const [b, q, p] of this.snap) { b.quaternion.copy(q); b.position.copy(p); }
    this.mixer.setTime(s.walkT || 0);
    if (!this.snap) this.snap = [...this.bones.values()].map(b => [b, new THREE.Quaternion(), new THREE.Vector3()]);
    for (const [b, q, p] of this.snap) { q.copy(b.quaternion); p.copy(b.position); }
    const phi = s.phi ?? 0, k = clamp(s.sitK || 0, 0, 1), c = clamp(s.crouch || 0, 0, 1.6);   // 1 — כריעה, 1.6 — כריעה עמוקה (להגיע לקרקע)
    const feet = k === 0 ? s.feet : null;
    // הגוף: בגובה הקרקע שמתחת לכפות הרגליים (הנמוכה מביניהן), כך שאף רגל לא נמתחת
    const baseY = feet ? (s.baseY ?? Math.min(feet[0].y, feet[1].y) - this.restA) : groundSmooth(s.x, s.z, phi);
    obj.position.set(s.x, baseY, s.z); obj.rotation.set(0, s.yaw, 0);
    inner.position.set(0, 0, 0); obj.updateMatrixWorld(true);
    const h = obj.worldToLocal(B('Hips').getWorldPosition(V3()));
    inner.position.set(-h.x, 0, -h.z); obj.updateMatrixWorld(true);
    const wq = obj.getWorldQuaternion(new THREE.Quaternion());
    const fwd = V3(0, 0, 1).applyQuaternion(wq), side = V3(1, 0, 0).applyQuaternion(wq), up = V3(0, 1, 0);
    const legs = [['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'], ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']];
    if (k > 0) {
      for (const [name, q] of this.rig.quats) { const b = this.bones.get(name); if (b) b.quaternion.slerp(q, k); }
      // תנוחת הישיבה יחסית לנקודת הכיסא (SEAT) — מסתובבת יחד עם הגוף (כמו כיסא מסתובב)
      inner.position.lerp(V3(this.rig.rootPos.x - SEAT.x, this.rig.rootPos.y - obj.position.y, this.rig.rootPos.z - SEAT.z), k);
      obj.updateMatrixWorld(true);
    }
    // התכופפות: האגן יורד ואחורה (משקל על העקבים), הגב נוטה קדימה; הרגליים נשארות במקום (IK)
    if (c > 0) { inner.position.y -= c * 0.3; inner.position.z -= c * 0.1; obj.updateMatrixWorld(true); }
    if (c > 0 || s.lean) {
      turn(B('LowerBack'), side, c * 30 + (s.lean || 0));
      if (B('Spine1')) turn(B('Spine1'), side, c * 18 + (s.lean || 0) * 0.4);
      if (B('Neck')) turn(B('Neck'), side, -c * 14);
    }
    if (feet) {
      // אם רגל לא מגיעה לכף הרגל שלה (למשל במורד המשטח) — מורידים את הגוף, במקום ליישר את הברך עד הסוף
      const tg = feet.map(f => bus.localToWorld(V3(f.x, f.y, f.z)));
      for (let it = 0; it < 2; it++) {
        let drop = 0;
        legs.forEach((l, j) => { const hp = B(l[0]).getWorldPosition(V3()), d = hp.distanceTo(tg[j]), mx = this.legLen * 0.965; if (d > mx) drop = Math.max(drop, (d - mx) * d / Math.max(0.3, hp.y - tg[j].y)); });
        if (drop <= 1e-4) break; obj.position.y -= drop; obj.updateMatrixWorld(true);
      }
      const bq = bus.getWorldQuaternion(new THREE.Quaternion());
      legs.forEach((l, j) => {
        const f = feet[j], dir = V3(Math.sin(f.yaw), 0, Math.cos(f.yaw)).applyQuaternion(bq);
        // הברך מעל אצבעות הרגל (קדימה), אף פעם לא לאחור
        twoBone(B(l[0]), B(l[1]), B(l[2]), tg[j], dir.clone().add(fwd).add(V3(0, 0.4, 0)));
        const toe = tg[j].clone().addScaledVector(dir, this.toe.f * Math.cos(f.pitch || 0)).add(V3(0, -this.toe.h + this.toe.f * Math.sin(f.pitch || 0), 0));
        aim(B(l[2]), B(l[3]), toe);
      });
    } else if (c > 0 || (k > 0 && k < 1) || (k > 0 && (s.tuck || 0) > 0)) {
      // קימה וישיבה: כפות הרגליים עוברות מהדוושות (נמשכות אחורה — tuck) אל הרצפה
      const tuck = clamp(s.tuck || 0, 0, 1);
      const A1 = legs.map(l => B(l[2]).getWorldPosition(V3()));
      const seatFeet = this.rig.feet ? [this.rig.feet[1][0], this.rig.feet[0][0]].map(p => {
        const v = V3(p.x - SEAT.x, p.y - FL, p.z - SEAT.z), hz = Math.hypot(v.x, v.z), back = Math.max(0, Math.min(hz - 0.4, 0.15)) * tuck;   // לא מתחת לבסיס הכיסא
        if (hz > 1e-3) { v.x -= v.x / hz * back; v.z -= v.z / hz * back; } v.y = Math.max(v.y, FLOOR - obj.position.y + this.restA + 0.01);
        return obj.localToWorld(v);
      }) : null;
      legs.forEach((l, j) => {
        const tgt = s.standFeet ? bus.localToWorld(V3(s.standFeet[j].x, s.standFeet[j].y, s.standFeet[j].z)) : A1[j].clone();
        if (seatFeet && k > 0) tgt.lerp(seatFeet[j], k);
        twoBone(B(l[0]), B(l[1]), B(l[2]), tgt, fwd.clone().add(V3(0, 0.4, 0)));
        // כף הרגל שטוחה (לא נכנסת ברצפה) כשהיא בדרך מהדוושה אל העמידה
        if (k < 1) { const a = B(l[2]).getWorldPosition(V3()), flat = a.clone().addScaledVector(fwd, this.toe.f).add(V3(0, -this.toe.h, 0)), cur = B(l[3]).getWorldPosition(V3()); aim(B(l[2]), B(l[3]), cur.lerp(flat, clamp((1 - k) * 2, 0, 1))); }
      });
    }
    // במעבר הצר: הזרועות קרוב לגוף
    if (s.narrow && !s.hands) { if (B('LeftArm')) turn(B('LeftArm'), fwd, 13); if (B('RightArm')) turn(B('RightArm'), fwd, -13); }
    // מבט: רק הראש והצוואר, עד 35° מהחזה (הגוף מסתובב בצעדים); הערכים מוחלקים מראש בזמן (head)
    if (s.head && B('Head')) {
      const [yw, pt] = s.head, R = THREE.MathUtils.radToDeg;
      if (B('Neck')) turn(B('Neck'), up, R(yw) * 0.45);
      turn(B('Head'), up, R(yw) * 0.55);
      if (B('Neck')) turn(B('Neck'), side, R(pt) * 0.4);
      turn(B('Head'), side, R(pt) * 0.5);
    }
    // ידיים: IK לידית; האצבעות נסגרות סביבה. handW — אחיזה ושחרור הדרגתיים
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      const tgt = s.hands?.[sd]; if (!tgt) continue;
      const nm = sd === 'L' ? 'Left' : 'Right';
      const w = clamp((sd === 'L' ? s.handWL : undefined) ?? s.handW ?? 1, 0, 1); if (w <= 0) continue;
      // שורש כף היד כמה ס"מ לפני נקודת האחיזה (כמו שאוחזים במוט) — האצבעות על הידית ולא בתוכה
      const tw = bus.localToWorld(tgt.clone()), sh = B(nm + 'Arm').getWorldPosition(V3());
      tw.addScaledVector(tw.clone().sub(sh).normalize(), -0.06);
      const hand = B(nm + 'Hand'), pw = hand.getWorldPosition(V3()).lerp(tw, w);
      const pole = side.clone().multiplyScalar(sx * 0.7).add(V3(0, -0.8, 0)).addScaledVector(fwd, -0.3);
      twoBone(B(nm + 'Arm'), B(nm + 'ForeArm'), hand, pw, pole);
      const fa = hand.getWorldPosition(V3()).sub(B(nm + 'ForeArm').getWorldPosition(V3())).normalize();
      // כף היד ממשיכה את האמה (לא מתקפלת יותר מ-45°)
      let dir = s.handDir ? bus.localToWorld(s.handDir.clone()).sub(bus.localToWorld(V3())).normalize() : fa.clone();
      if (dir.angleTo(fa) > 0.75) { const ax = V3().crossVectors(fa, dir).normalize(); dir = fa.clone().applyAxisAngle(ax, 0.75); }
      const fb = B(nm + 'FingerBase'); if (fb) aim(hand, fb, hand.getWorldPosition(V3()).add(dir));
      // כף היד פונה אל הידית (למשל למטה, על ידיות הכיסא) — סיבוב סביב כיוון האצבעות
      if (s.palmN && this.palm[nm] && fb) {
        const ax = fb.getWorldPosition(V3()).sub(hand.getWorldPosition(V3())).normalize();
        const P = this.palm[nm].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())), N = bus.localToWorld(s.palmN.clone()).sub(bus.localToWorld(V3())).normalize();
        P.addScaledVector(ax, -P.dot(ax)); N.addScaledVector(ax, -N.dot(ax));
        if (P.lengthSq() > 1e-6 && N.lengthSq() > 1e-6) { P.normalize(); N.normalize(); const ang = Math.atan2(V3().crossVectors(P, N).dot(ax), P.dot(N)); turn(hand, ax, THREE.MathUtils.radToDeg(ang)); }
      }
      if (w > 0.3 && this.palm[nm]) {
        const P = this.palm[nm].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion())), g = (w - 0.3) / 0.7;
        const curl = (bone, deg) => { if (!bone) return; const d = V3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())); turn(bone, V3().crossVectors(d, P), deg * g); };
        curl(fb, 18 * (s.grip ?? 0.2)); curl(B(nm + 'HandFinger1'), 85 * (s.grip ?? 0.2)); curl(B(sd === 'L' ? 'LThumb' : 'RThumb'), 40 * (s.grip ?? 0.2));
      }
    }
    obj.updateMatrixWorld(true);
  }
}

// ---------- מתכנן הצעדים. עובר פעם אחת על כל הרצף (60 דגימות לשנייה) ומחשב את "מרחק ההליכה" (תנועה + פנייה),
// ואז קובע איפה כל כף רגל דורכת: צעד אחרי צעד, לסירוגין, במקומות שהגוף עובר בהם (עם רוחב האגן). כף רגל על הקרקע
// לא זזה בכלל; בזמן הצעד היא עוברת בקשת נמוכה למקום הבא. כך אין החלקה, הקצב לפי המהירות, פנייה במקום היא צעדים,
// ועל משטח או מדרגה כל כף רגל נוחתת בגובה ובשיפוע שמתחתיה. גם המבט מחושב ומוחלק כאן
const FOOT_W = 0.1, STEP = 0.6, STEP_PUSH = 0.45, TURN_G = 0.3;
// כף הרגל על הקרקע: השיפוע מתחתיה, וגובה שבו אף נקודה בסוליה (עקב עד קצה האצבעות) לא נכנסת בקרקע
function fitFoot(x, z, yaw, phi) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), g = s => groundAt(x + dx * s, z + dz * s, phi);
  const pitch = clamp(Math.atan2(g(0.12) - g(-0.08), 0.2), -0.55, 0.55), tp = Math.tan(pitch);
  let base = -1e9; for (const s of [-0.09, -0.04, 0, 0.05, 0.1, 0.15, 0.19]) base = Math.max(base, g(s) - s * tp);
  return { base: base + (Math.abs(pitch) > 0.1 ? 0.012 : 0), pitch };
}
const badLand = (p, f) => { const sd = f ? -1 : 1, x = p.x + sd * Math.cos(p.yaw) * FOOT_W, z = p.z - sd * Math.sin(p.yaw) * FOOT_W; return Math.abs(z - FRONT_Z) < 0.7 && x > -1.45 && x < -1.05; };
function buildGait(tl, A) {
  const dt = 1 / 60, total = tl.total, N = Math.ceil(total / dt) + 1;
  const X = new Float64Array(N), Z = new Float64Array(N), Y = new Float64Array(N), G = new Float64Array(N), loco = new Uint8Array(N), SL = new Float64Array(N).fill(STEP), PHI = new Float64Array(N);
  const HY = new Float64Array(N), HP = new Float64Array(N);
  let g = 0;
  for (let i = 0; i < N; i++) {
    const t = Math.min(i * dt, total), st = { door: 0, phi: 0 }; tl.eval(t, st); const d = st.drv;
    if (!d) continue;
    X[i] = d.x; Z[i] = d.z; Y[i] = d.yaw; loco[i] = d.sitK > 0 ? 0 : 1; SL[i] = d.step || (d.push ? STEP_PUSH : STEP); PHI[i] = st.phi || 0;
    if (i && loco[i] && loco[i - 1]) g += Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]) + TURN_G * Math.abs(Math.atan2(Math.sin(Y[i] - Y[i - 1]), Math.cos(Y[i] - Y[i - 1])));
    G[i] = g;
    if (d.look) {
      const hy = d.sitK > 0 ? FL + 1.2 : groundAt(d.x, d.z, st.phi) + 1.55, dx = d.look.x - d.x, dz = d.look.z - d.z;
      HY[i] = clamp(Math.atan2(Math.sin(Math.atan2(dx, dz) - d.yaw), Math.cos(Math.atan2(dx, dz) - d.yaw)), -0.6, 0.6);
      HP[i] = clamp(Math.atan2(hy - d.look.y, Math.hypot(dx, dz)), -0.4, 0.7);
    }
  }
  // החלקת המבט (±0.3 שנ')
  const smooth = a => { const o = new Float64Array(N), w = 18; for (let i = 0; i < N; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - w); j <= Math.min(N - 1, i + w); j++) { s += a[j]; n++; } o[i] = s / n; } return o; };
  const sHY = smooth(HY), sHP = smooth(HP);
  // קטעי הליכה: כל קטע שבו הגוף זז (או מסתובב) ברצף. בין קטעים הוא עומד, שתי כפות הרגליים על הקרקע
  const moving = i => i > 0 && loco[i] && loco[i - 1] && G[i] - G[i - 1] > 1e-5;
  const spans = [], spanOf = new Int32Array(N).fill(-1);
  const foot = (p, sd) => ({ x: p.x + sd * Math.cos(p.yaw) * FOOT_W, z: p.z - sd * Math.sin(p.yaw) * FOOT_W, yaw: p.yaw });
  for (let i = 1; i < N;) {
    if (!moving(i)) { if (loco[i] && spans.length && spanOf[i - 1] >= 0) spanOf[i] = spanOf[i - 1]; i++; continue; }
    const i0 = i - 1; let j = i; while (j + 1 < N && (moving(j + 1) || (j + 2 < N && moving(j + 2) && loco[j + 1]))) j++;
    const S = { i0, i1: j, g0: G[i0], g1: G[j] };
    const at = gq => { let lo = i0, hi = j; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (G[m] < gq) lo = m; else hi = m; }
      const k = G[hi] > G[lo] ? clamp((gq - G[lo]) / (G[hi] - G[lo]), 0, 1) : 0; return { x: X[lo] + (X[hi] - X[lo]) * k, z: Z[lo] + (Z[hi] - Z[lo]) * k, yaw: angLerp(Y[lo], Y[hi], k), len: SL[lo] }; };
    // חלונות הצעדים: אורך הצעד לפי מה שהוא עושה באותו מקום (דחיפה — צעדים קצרים); הצעד האחרון מביא את הרגל ליד השנייה
    const wins = [];
    let w = S.g0;
    while (S.g1 - w > 0.06) { const len = at(w).len; let nx = Math.min(S.g1, w + len); if (S.g1 - nx < 0.3 * len) nx = S.g1; wins.push([w, nx]); w = nx; }
    if (wins.length === 1) { const [a, b] = wins[0]; wins[0] = [a, (a + b) / 2]; wins.push([(a + b) / 2, b]); }
    const p0 = at(S.g0);
    S.init = [foot(p0, 1), foot(p0, -1)]; S.steps = [];
    let first = 0;
    if (wins.length) { const p1 = at(wins[0][1]); const lat = (p1.x - p0.x) * Math.cos(p0.yaw) - (p1.z - p0.z) * Math.sin(p0.yaw); first = lat < -0.02 ? 1 : 0; }
    const landG = [S.g0, S.g0];
    wins.forEach(([w0, w1], k) => {
      const f = (k % 2 === 0) ? first : 1 - first, last = k >= wins.length - 1, nlen = wins[k + 1] ? wins[k + 1][1] - wins[k + 1][0] : 0;
      // נוחתת חצי צעד לפני האגן, אבל לא יותר מצעד ורבע לפני הרגל השנייה (הצעד הראשון מעמידה קצר — בלי "לאנג'");
      // בשני הצעדים האחרונים — במקום הסופי, ליד הרגל השנייה
      let land = last ? S.g1 : Math.min(S.g1, w1 + 0.5 * nlen, landG[1 - f] + 1.25 * (w1 - w0));
      // לא דורכים על הסף הצר של הדלת הקדמית (שם כף הרגל הייתה נכנסת בדופן): קצת לפני או אחרי
      if (!last) for (let k2 = 1; k2 <= 8 && badLand(at(land), f); k2++) { const a = land - 0.05 * k2, b2 = land + 0.05 * k2; if (b2 <= S.g1 && !badLand(at(b2), f)) { land = b2; break; } if (a > landG[1 - f] && !badLand(at(a), f)) { land = a; break; } }
      landG[f] = land;
      S.steps.push({ f, w0, w1, to: foot(at(land), f ? -1 : 1) });
    });
    S.d = wins.length ? (S.g1 - S.g0) / wins.length : 1;
    for (let k = i0; k <= j; k++) spanOf[k] = spans.length;
    spans.push(S); i = j + 1;
  }
  const idx = t => clamp(t / dt, 0, N - 1.001);
  const lerpA = (a, t) => { const u = idx(t), i = Math.floor(u), k = u - i; return a[i] + (a[i + 1] - a[i]) * k; };
  function feetAt(t, phi) {
      const i = Math.round(idx(t)), si = spanOf[i];
      if (!loco[i]) return null;
      if (si < 0) {   // עומד לפני שהתחיל ללכת: שתי כפות הרגליים זו ליד זו
        const p = { x: lerpA(X, t), z: lerpA(Z, t), yaw: Y[i] };
        return { feet: [foot(p, 1), foot(p, -1)].map(f => ({ ...f, y: groundAt(f.x, f.z, phi) + A.restA, pitch: 0 })), walkT: 0.375 * A.dur, walkW: 0 };
      }
      const S = spans[si], gq = lerpA(G, t), out = [];
      for (const f of [0, 1]) {
        let plant = S.init[f], sw = null;
        for (const st of S.steps) { if (st.f !== f) continue; if (gq >= st.w1) plant = st.to; else { if (gq > st.w0) sw = { st, s: (gq - st.w0) / (st.w1 - st.w0) }; break; } }
        if (!sw) { const F = fitFoot(plant.x, plant.z, plant.yaw, phi); out.push({ x: plant.x, z: plant.z, yaw: plant.yaw, y: F.base + A.restA + 0.014, pitch: F.pitch }); continue; }
        // בצעד: מדרגה למטה — הרגל עוברת קודם את השפה ורק אז יורדת; מדרגה למעלה — קודם עולה ורק אז נכנסת
        const to = sw.st.to, a = fitFoot(plant.x, plant.z, plant.yaw, phi), b = fitFoot(to.x, to.z, to.yaw, phi), dh = b.base - a.base, s1 = sw.s;
        const e = dh < -0.15 ? 1 - (1 - s1) ** 2.2 : dh > 0.15 ? ease(clamp((s1 - 0.25) / 0.75, 0, 1)) : ease(s1);
        const x = plant.x + (to.x - plant.x) * e, z = plant.z + (to.z - plant.z) * e, yaw = angLerp(plant.yaw, to.yaw, e), lift = Math.sin(Math.PI * s1);
        let h = dh < -0.15 ? a.base + dh * ease(clamp((s1 - 0.5) / 0.5, 0, 1)) : dh > 0.15 ? a.base + dh * ease(clamp(s1 / 0.5, 0, 1)) + 0.05 * lift : a.base + dh * e;
        const C = fitFoot(x, z, yaw, phi), pitch = a.pitch + (b.pitch - a.pitch) * e;
        h = Math.max(h, C.base + 0.01) + lift * 0.09;
        const flat = Math.abs(a.pitch) < 0.05 && Math.abs(b.pitch) < 0.05 && Math.abs(dh) < 0.05;
        out.push({ x, z, yaw, y: h + A.restA + 0.014, pitch: pitch + (flat ? -0.25 * Math.sin(Math.PI * Math.min(1, s1 * 1.6)) : 0) });
      }
      const ph = ((gq - S.g0) / (2 * S.d) + 0.375) % 1, sp = Math.abs(lerpA(G, t + 0.05) - lerpA(G, t - 0.05)) / 0.1;
      return { feet: out, walkT: ph * A.dur, walkW: clamp(sp / 0.7, 0, 1) };
  }
  // גובה הגוף: הממוצע (±0.3 שנ') של כף הרגל הנמוכה — במדרגה גבוהה הגוף יורד ועולה בהדרגה ולא בבת אחת
  const MF = new Float64Array(N).fill(NaN);
  for (let i = 0; i < N; i++) if (loco[i]) { const r = feetAt(i * dt, PHI[i]); if (r) MF[i] = Math.min(r.feet[0].y, r.feet[1].y) - A.restA; }
  const BY = new Float64Array(N);
  for (let i = 0; i < N; i++) { if (isNaN(MF[i])) { BY[i] = NaN; continue; } let s2 = 0, n2 = 0; for (let j = Math.max(0, i - 18); j <= Math.min(N - 1, i + 18); j++) if (!isNaN(MF[j])) { s2 += MF[j]; n2++; } BY[i] = Math.max(Math.min(MF[i], s2 / n2), groundAt(X[i], Z[i], PHI[i]) - 0.3); }
  return {
    // כפות הרגליים בזמן t (או null כשהוא יושב), זמן ההקלטה לפלג הגוף העליון, וגובה הגוף
    feet(t, phi) { const r = feetAt(t, phi); if (r) { const b = BY[Math.round(idx(t))]; if (!isNaN(b)) r.baseY = b; } return r; },
    head: t => [lerpA(sHY, t), lerpA(sHP, t)],
    spans,
  };
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
// פינות מעוגלות (חיתוך פינות), בלי להזיז את ההתחלה והסוף
function chaikin(pts, it = 2) {
  let p = pts;
  for (let k = 0; k < it; k++) {
    const o = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) { const a = p[i], b = p[i + 1]; if (i > 0) o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]); if (i + 2 < p.length) o.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }
    o.push(p[p.length - 1]); p = o;
  }
  return p;
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

// הכיסא נוסע לאורך מסלול (קדימה או לאחור): כיוון לפי המסלול, הגלגלים מסתובבים לפי המרחק, ובפנייה — כל גלגל לפי הקשת שלו
function chairAlong(tl, t0, pts, o) {
  const P = new Path(pts), pr = profile(P.L, o.v || 0.5, o.ta || 0.8), sg = o.back ? -1 : 1, y0 = P.yaw(0, 0.05) + (o.back ? Math.PI : 0);
  tl.at(t0, pr.dur, (u, st) => {
    const t = u * pr.dur, d = pr.d(t), [x, z] = P.at(d), yaw = P.yaw(d, 0.05) + (o.back ? Math.PI : 0), dy = Math.atan2(Math.sin(yaw - y0), Math.cos(yaw - y0));
    const r = (o.roll0 || 0) + sg * d / WC.R;
    st.chair = { x, z, yaw, roll: r, rl: r - dy * WC.wx / WC.R + (o.dl || 0), rr: r + dy * WC.wx / WC.R + (o.dr || 0), propel: o.propel ?? clamp(Math.min(t, pr.dur - t) / 0.5, 0, 1), op: o.fade ? clamp((P.L - d) / 2.0, 0, 1) : 1 };
  });
  return { t: t0 + pr.dur, roll: (o.roll0 || 0) + sg * P.L / WC.R, yaw: P.yaw(P.L, 0.05) + (o.back ? Math.PI : 0) };
}

// ---------- רצף: קטעים עם זמן התחלה ומשך. כל קטע כותב את החלק שלו במצב (st), באופן מוחלט
class Timeline {
  constructor() { this.segs = []; this.t = 0; this.marks = {}; }
  mark(n) { this.marks[n] = this.t; }
  seq(dur, fn) { this.segs.push({ t0: this.t, dur, fn }); this.t += dur; return this.t; }
  at(t0, dur, fn) { this.segs.push({ t0, dur, fn }); return t0 + dur; }
  get total() { return Math.max(this.t, ...this.segs.map(s => s.t0 + s.dur)); }
  eval(T, st) {
    for (const s of this.segs) if (s.t0 <= T) s.fn(s.dur > 0 ? clamp((T - s.t0) / s.dur, 0, 1) : 1, st);
  }
  finish() { this.segs.sort((a, b) => a.t0 - b.t0); }
}

// המיקום של כיסא במערכת האוטובוס: גובה ונטייה לפי הקרקע מתחת לגלגלים האחוריים ולגלגלים הקדמיים
// כל גלגל נשען על הנקודה הגבוהה שמתחתיו (לאורך ההיקף שלו) — במעבר בין מדרכה, שפה, משטח ורצפה הגלגל עולה על
// השפה ולא נכנס בה. tilt — הטיה לאחור (הנהג מרים קצת את הגלגלים הקדמיים לפני המשטח)
function wheelBase(x, z, dx, dz, lx, lz, r, phi) {
  let best = -1e9;
  for (const sd of [-1, 1]) for (let k = -4; k <= 4; k++) {
    const s = r * k / 4, px = x + dx * s + lx * sd, pz = z + dz * s + lz * sd;
    best = Math.max(best, groundAt(px, pz, phi) + Math.sqrt(Math.max(0, r * r - s * s)) - r);
  }
  return best;
}
function chairPose(c, phi, out = { y: 0, pitch: 0 }) {
  const dx = Math.sin(c.yaw), dz = Math.cos(c.yaw), fx = c.x + dx * WC.caster.z, fz = c.z + dz * WC.caster.z;
  const yr = wheelBase(c.x, c.z, dx, dz, dz * WC.wx, -dx * WC.wx, WC.R, phi), yf = wheelBase(fx, fz, dx, dz, dz * WC.caster.x, -dx * WC.caster.x, WC.caster.r, phi);
  out.pitch = clamp(Math.atan2(yf - yr, WC.caster.z), -SLOPE - 0.03, SLOPE + 0.03) + (c.tilt || 0);
  out.y = yr + WC.R * (1 - Math.cos(out.pitch)); return out;
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
    const d = clamp((f.free ?? 4) - 0.5, 0.9, 1.4), a = -7.1 - i * 1.2;
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
      if (!this.seqs.some(q => q.bus === ev.bus)) { this.pending.splice(i, 1); this.start(ev._kind, ev); }   // (start מחזיר אותו לרשימה אם עדיין יש מי שהולך)
    }
  }

  start(kind, ev) {
    const bus = ev.bus, v = this.busLayer?.map.get(bus.id);
    if (!v) { if (kind === 'alight') this.drop(ev.p.id); bus.access = false; return; }
    // מחכים שמי שבדרך לדלת הקדמית (או ממנה) יסיים — הנהג יוצא בה
    if (this.seqs.some(q => q.bus === bus) || ((bus.walking || 0) > 0 && bus.state === 'dwell' && bus.ph === 'xchg' && (ev._wait = (ev._wait || 0) + 1) < 4000)) { ev._kind = kind; if (!this.pending.includes(ev)) this.pending.push(ev); bus.access = true; return; }
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
    q.ramp = obj.getObjectByName('AccessRamp'); q.strap = obj.getObjectByName('AccessStrap'); q.door = obj.getObjectByName('CabDoor'); q.baked = obj.getObjectByName('Driver');
    if (DRIVER_RIG && q.baked) {
      q.drv = this.drivers.pop() || (() => { try { return new DriverActor(DRIVER_RIG); } catch (e) { console.warn('driver actor failed', e); return null; } })();
      if (q.drv) { obj.add(q.drv.obj); q.drv.obj.visible = true; }
    }
    // השפה של התחנה במערכת האוטובוס
    try {
      const f = this.people.stopFrame(ev.stop); obj.updateMatrixWorld(true);
      const d = (lx, lz) => { const w = obj.localToWorld(V3(lx, 0, lz)); return (w.x - f.kx) * f.ux + (-w.z - f.ky) * f.uy; };
      const c = d(0, 0); q.kerb = { a: d(1, 0) - c, b: d(0, 1) - c, c };
    } catch (e) { q.kerb = null; }
    KERB = q.kerb; KNEEL_K = 1;          // המשטח פתוח והנהג בחוץ רק כשהאוטובוס כבר כורע
    // הקרקע שמתחת לקצה המשטח הפתוח: הנקודה הגבוהה מבין הפינות והאמצע (כשהאוטובוס עומד באלכסון לשפה, פינה אחת
    // יכולה להיות על אבן השפה והשנייה בכביש — הלוח קשיח ונשען על הגבוהה). שני סבבים, כי הקצה זז עם השיפוע
    { setSlope(slopeFor(0.12));
      for (let it = 0; it < 2; it++) { const xe = RAMP.hx - RAMP.L * Math.cos(SLOPE); let g = 0; for (const dz of [-RAMP.W / 2, -0.2, 0, 0.2, RAMP.W / 2]) g = Math.max(g, groundAt(xe - 0.02, RAMP.z + dz, 0), groundAt(xe + 0.04, RAMP.z + dz, 0)); q.slope = slopeFor(g); setSlope(q.slope); } }
    const stride = q.drv?.stride || 0.9;
    const c0 = { x: chair.position.x, z: chair.position.z, yaw: Math.atan2(V3(0, 0, 1).applyQuaternion(chair.quaternion).x, V3(0, 0, 1).applyQuaternion(chair.quaternion).z) };
    q.tl = kind === 'board' ? this.boardTimeline(c0, q.slot, stride) : this.alightTimeline(q.slot, stride);
    q.tl.finish();
    if (q.drv) q.gait = buildGait(q.tl, q.drv);
    this.seqs.push(q);
    this.apply(q, 0);
  }
  parkedOn(bus) { let n = 0; for (const r of this.riding.values()) if (r.bus === bus) n++; return n; }
  bay(slot) { return slot ? { x: 0.0, z: 1.0, yaw: 0 } : { x: BAY.x, z: BAY.z, yaw: Math.PI }; }
  park(chair, slot) { const b = this.bay(slot); chair.position.set(b.x, FLOOR, b.z); chair.rotation.set(0, b.yaw, 0); }
  drop(pid) { const r = this.riding.get(pid); if (r) { r.chair.parent?.remove(r.chair); this.riding.delete(pid); } }

  // הכריעה לאורך הרצף: יורדת בהתחלה (כשהנהג עוד בתא), ועולה בסוף
  kneelAt(q, T) { const D = KNEEL.dur, tot = q.tl.total; return ease(clamp(Math.min(T / D, (tot - T) / D), 0, 1)); }
  end(q, aborted) {
    q.bus.kneel = 0;
    q.bus.access = this.pending.some(e => e.bus === q.bus);
    if (q.drv) { q.drv.obj.parent?.remove(q.drv.obj); this.drivers.push(q.drv); }
    if (q.baked) this.fade(q.baked, 1);
    if (q.door) q.door.rotation.y = 0;
    if (q.ramp) q.ramp.rotation.z = 0;
    if (q.strap) setStrap(q.strap, 0, null);
    if (q.drv) q.drv.fade(1);
    q.chair.userData.busy = false;
    q.chair.userData.sitter?.arms(q.chair, 0, 0, 0);
    if (q.kind === 'board' && !aborted) { this.park(q.chair, q.slot); this.riding.set(q.pid, { chair: q.chair, bus: q.bus, obj: q.obj }); }
    else q.chair.parent?.remove(q.chair);
  }

  // מחיל את המצב בזמן T: דלת התא, המשטח, הכיסא (גלגלים, גלגלים קדמיים שמסתובבים לכיוון התנועה, ידי הנוסע) והנהג
  apply(q, T) {
    KERB = q.kerb || null; if (q.slope) setSlope(q.slope);
    KNEEL_K = q.bus.kneel = this.kneelAt(q, T);
    const st = { door: 0, phi: 0, chair: null, drv: null, strap: null };
    q.tl.eval(T, st);
    if (q.door) q.door.rotation.y = st.door;
    if (q.ramp) q.ramp.rotation.z = st.phi;
    if (q.strap) setStrap(q.strap, st.phi, st.strap);
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
    if (q.drv && st.drv) {
      st.drv.phi = st.phi;
      const gf = q.gait?.feet(T, st.phi);
      if (gf) { st.drv.feet = gf.feet; st.drv.walkT = gf.walkT; st.drv.walkW = gf.walkW; st.drv.baseY = gf.baseY; }
      if (q.gait) st.drv.head = q.gait.head(T);
      // קימה וישיבה: כפות הרגליים עוברות אל העמידה במקום שבו מתכנן הצעדים מתחיל (בלי קפיצה)
      if (st.drv.sitK > 0 && st.drv.sitK < 1) { const d = st.drv; d.standFeet = [1, -1].map(sd => { const x = d.x + sd * Math.cos(d.yaw) * FOOT_W, z = d.z - sd * Math.sin(d.yaw) * FOOT_W; return { x, z, y: groundAt(x, z, st.phi) + q.drv.restA }; }); }
      // יושב בתא: הנהג הרגיל של האוטובוס (כמו תמיד); עומד: הנהג "החי". ההחלפה — בהעלמה והופעה
      if (st.drv.sitK >= 1) { q.drv.fade(0); if (q.baked) this.fade(q.baked, st.drv.op ?? 1); }
      else { if (q.baked) this.fade(q.baked, 0); q.drv.pose(st.drv, q.obj); q.drv.fade(st.drv.op ?? 1); }
    }
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
        // o.keep — בלי להסתובב (צעדים לצד או לאחור); o.step — אורך הצעד; o.round — פינות מעוגלות
        const P = new Path(o.round === false ? [[D.x, D.z], ...pts] : chaikin([[D.x, D.z], ...pts], 2)), y0 = D.yaw, t0 = D.walkT, pr = profile(P.L, v, o.ta ?? 0.5);
        tl.seq(pr.dur, (u, st) => {
          const t = u * pr.dur, d = pr.d(t), [x, z] = P.at(d), yw = o.keep ? y0 : angLerp(y0, P.yaw(d, 0.35), ease(clamp(d / 0.6, 0, 1)));
          const la = P.at(Math.min(P.L, d + 1.4)), ly = P.yaw(Math.min(P.L, d + 0.8), 0.35);
          set(st, { x, z, yaw: yw, walkT: t0 + d / stride, walkW: ease(clamp(pr.sp(t) * 1.6, 0, 1)), step: typeof o.step === 'function' ? o.step(x, z) : o.step, look: o.look || (o.keep ? ahead(y0, x, z) : P.L - d > 0.5 ? head(la[0], la[1], 1.4) : ahead(ly, x, z)) });
        });
        const e = P.at(P.L); D.x = e[0]; D.z = e[1]; D.yaw = o.keep ? y0 : angLerp(y0, P.yaw(P.L, 0.35), 1); D.walkT = t0 + P.L / stride;
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
  // ---------- הדרך של הנהג: כמעט כולה בחוץ. יוצא בדלת הקדמית, הולך על המדרכה לדלת האמצעית, פותח את המשטח מבחוץ
  // (מושך ברצועה), ובסוף מקפל אותו מבחוץ וחוזר על המדרכה ובדלת הקדמית. היציאה מהתא והחזרה אליו — בהעלמה קצרה
  // מקום ההליכה על המדרכה (לפי השפה של התחנה) ומקום העמידה מול הדלת האמצעית
  lanes() {
    const kx = (d, z) => KERB && Math.abs(KERB.a) > 0.3 ? (d - KERB.b * z - KERB.c) / KERB.a : -1.55 - d;
    return { xw: z => clamp(kx(0.42, z), -2.6, -1.95), XS: clamp(kx(0.15, LANE), -2.0, -1.66) };
  }
  // יושב, מסתכל אל הדלת, ונעלם; מופיע עומד על המדרכה, ליד הדלת הקדמית (היציאה מהתא והמדרגה הגבוהה — בהעלמה קצרה)
  fromCab(tl, K) {
    const { xw } = this.lanes(), D = K.D, seat = { x: SEAT.x, z: SEAT.z, yaw: 0, sitK: 1, look: V3(-1.6, 1.3, 2.5) };
    tl.seq(0.7, (u, st) => K.set(st, seat));
    tl.seq(0.35, (u, st) => K.set(st, { ...seat, op: 1 - ease(u) }));
    const P0 = { x: xw(4.95) + 0.05, z: 4.95, yaw: -2.75, walkT: 0 };
    tl.seq(0.4, (u, st) => K.set(st, { ...P0, op: ease(u), look: V3(P0.x - 0.6, 1.4, 3.0) }));
    Object.assign(D, P0);
  }
  // הולך על המדרכה אל הדלת הקדמית, נעלם, ומופיע יושב בתא
  toCab(tl, K) {
    const { xw } = this.lanes(), D = K.D;
    K.walk([[xw(3.3), 3.3], [xw(4.2) - 0.05, 4.3], [xw(4.85) + 0.1, 4.85]], 1.0);
    const P = { x: D.x, z: D.z, yaw: D.yaw, walkT: D.walkT };
    K.idle(0.2, { look: V3(-1.2, 1.4, 5.1) });
    tl.seq(0.35, (u, st) => K.set(st, { ...P, op: 1 - ease(u), look: V3(-1.2, 1.4, 5.1) }));
    tl.seq(0.4, (u, st) => K.set(st, { x: SEAT.x, z: SEAT.z, yaw: 0, sitK: 1, op: ease(u), look: V3(SEAT.x, 1.6, 8) }));
    K.seated(0.6);
    tl.mark('cab');
  }
  // על המדרכה אל מול הדלת האמצעית (מגיע בקשת רחבה ונעצר מול הסף)
  toMid(tl, K) {
    const { xw, XS } = this.lanes();
    K.walk([[xw(4.0), 3.9], [xw(2.5), 2.5], [xw(1.5), 1.5], [XS - 0.75, 0.75], [XS - 0.75, LANE + 0.05], [XS, LANE]], 1.05);
  }
  // פותח את המשטח מבחוץ: מתכופף, אוחז ברצועה שנתלית מעל הסף, מושך והמשטח מתרומם; כשהוא עובר את האנך — תופס את
  // הקצה בשתי ידיים ומוריד אותו אל המדרכה תוך כדי צעדים לאחור, ומתיישר
  strapOut(tl, K) {
    const D = K.D, x0 = D.x, z0 = D.z, y0 = D.yaw, Y = Math.PI / 2;
    const loop = s => V3(STRAP_LOOP.x - 0.03, STRAP_LOOP.y + 0.05, RAMP.z + s * 0.045);
    const end = endGrip, lookR = phi => rampLocal(phi, RAMP.L * 0.8, 0, 0);
    const UP = D2R(100), xb = rampLocal(UP, RAMP.L, 0, 0).x - 0.5;
    K.idle(0.25, { look: V3(RAMP.hx, 0.6, RAMP.z) });
    // מתכופף ואוחז ברצועה
    tl.seq(1.0, (u, st) => { K.set(st, { x: x0, z: z0, yaw: angLerp(y0, Y, ease(clamp(u / 0.6, 0, 1))), crouch: 0.72 * ease(u), lean: 16 * ease(u), hands: { L: loop(-1), R: loop(1) }, handW: ease(clamp(u * 1.5 - 0.5, 0, 1)), grip: 0.55, handDir: V3(0, -1, 0), look: V3(RAMP.hx, 0.5, RAMP.z) }); st.strap = u > 0.85 ? loop(0) : null; });
    // מושך: מתיישר, הידיים אל החזה, נשען לאחור, ובסוף צעד אחורה
    tl.seq(1.9, (u, st) => {
      const phi = UP * ease(u), x = x0 + (xb - x0) * ease(clamp((u - 0.5) / 0.5, 0, 1)), r = ease(clamp(u * 1.4, 0, 1));
      const H = loop(0).lerp(V3(x + 0.34, 1.12, z0), r);
      K.set(st, { x, z: z0, yaw: Y, step: 0.26, crouch: 0.72 * (1 - ease(clamp(u * 1.8, 0, 1))), lean: 16 * (1 - r) - 9 * Math.sin(Math.PI * clamp(u * 1.2, 0, 1)), hands: { L: H.clone().setZ(z0 - 0.04), R: H.clone().setZ(z0 + 0.04) }, grip: 0.55, look: lookR(phi) });
      st.phi = phi; st.strap = H;
    });
    // עוזב את הרצועה ותופס את הקצה העליון
    const P1 = UP + D2R(5), Hs = V3(xb + 0.34, 1.12, z0);
    tl.seq(0.55, (u, st) => {
      const phi = UP + (P1 - UP) * ease(u), k = ease(u);
      const arc = V3(-0.14 * Math.sin(Math.PI * u), 0, 0);
      K.set(st, { x: xb, z: z0, yaw: Y, step: 0.26, hands: { L: Hs.clone().setZ(z0 - 0.04).lerp(end(phi, -1), k).add(arc), R: Hs.clone().setZ(z0 + 0.04).lerp(end(phi, 1), k).add(arc) }, handDir: V3(0.15, 1, 0).normalize().lerp(endDir(phi), k), grip: 0.3, look: lookR(phi) });
      st.phi = phi; st.strap = u < 0.4 ? Hs : null;
    });
    // מוריד: צעדים קטנים לאחור, מתכופף; כשהלוח כמעט אופקי — משחרר, והוא נופל את הסנטימטרים האחרונים אל המדרכה
    const PL = PHI_OUT - 0.42, xl = rampLocal(PL, RAMP.L, 0, 0).x - 0.4;
    tl.seq(2.1, (u, st) => {
      const e = ease(u), phi = P1 + (PL - P1) * e, p = rampLocal(phi, RAMP.L, 0, 0), x = clamp(p.x - 0.4, xl, xb);
      K.set(st, { x, z: z0, yaw: Y, step: 0.26, crouch: 0.9 * ease(clamp((u - 0.4) / 0.6, 0, 1)), lean: 6 * Math.sin(Math.PI * u) + 14 * ease(clamp((u - 0.5) / 0.5, 0, 1)), hands: { L: end(phi, -1), R: end(phi, 1) }, handDir: endDir(phi), grip: 0.05, look: lookR(phi) });
      st.phi = phi;
    });
    tl.seq(0.5, (u, st) => {
      const phi = u < 0.35 ? PL : u < 0.75 ? PL + (PHI_OUT - PL) * ((u - 0.35) / 0.4) ** 2 : PHI_OUT - Math.sin((u - 0.75) / 0.25 * Math.PI) * 0.025;
      const r = ease(clamp(u / 0.45, 0, 1)), rel = sd => end(PL, sd).lerp(V3(xl + 0.32, 0.62, z0 + sd * 0.2), r);
      K.set(st, { x: xl, z: z0, yaw: Y, crouch: 0.9, lean: 14, hands: { L: rel(-1), R: rel(1) }, handDir: endDir(PL), handW: 1 - ease(clamp((u - 0.4) / 0.5, 0, 1)), look: lookR(phi) });
      st.phi = phi;
    });
    const tDown = tl.t;
    tl.seq(0.7, (u, st) => { K.set(st, { x: xl, z: z0, yaw: Y, crouch: 0.9 * (1 - ease(u)), lean: 14 * (1 - ease(u)), look: lookR(PHI_OUT) }); st.phi = PHI_OUT; });
    Object.assign(D, { x: xl, z: z0, yaw: Y });
    tl.mark('rampOut');
    return tDown;
  }
  // מקפל את המשטח מבחוץ: עומד מול הקצה, מתכופף, מרים, דוחף מעבר לאנך, והמשטח נופל אל הרצפה
  foldIn(tl, K, stride) {
    const D = K.D, z0 = LANE, y0 = D.yaw, yaw = Math.PI / 2;
    const xa = XF0(), sx = D.x, sz = D.z, ta = D.walkT;
    const end = endGrip, look = phi => rampLocal(phi, RAMP.L, 0, 0);
    tl.seq(1.1, (u, st) => { const k = ease(u), m = ease(clamp(u / 0.6, 0, 1)); st.phi = PHI_OUT; st.drv = { x: sx + (xa - sx) * m, z: sz + (z0 - sz) * m, yaw: angLerp(y0, yaw, m), walkT: ta, crouch: 1.05 * ease(clamp((u - 0.3) / 0.7, 0, 1)), lean: 50 * ease(clamp((u - 0.2) / 0.8, 0, 1)), hands: { L: end(PHI_OUT, -1), R: end(PHI_OUT, 1) }, handDir: endDir(PHI_OUT), handW: ease(clamp(u / 0.45, 0, 1)), look: look(PHI_OUT) }; });
    const UP = D2R(98);
    tl.seq(2.3, (u, st) => {
      const e = ease(u), phi = PHI_OUT + (UP - PHI_OUT) * e, p = rampLocal(phi, RAMP.L, 0, 0);
      const x = clamp(p.x - 0.3 - 0.2 * Math.sin(Math.PI * clamp(u * 1.5, 0, 1)), xa - 0.3, -1.62), r = ease(clamp(u * 1.7, 0, 1));   // בהתחלה הקצה מתקרב אליו — צעד קטן לאחור
      st.phi = phi; st.drv = { x, z: z0, yaw, step: 0.26, walkT: ta, crouch: 1.05 * (1 - r), lean: 50 * (1 - r) - 8 * Math.sin(Math.PI * clamp(u * 1.4, 0, 1)),
        hands: { L: end(phi, -1), R: end(phi, 1) }, handDir: endDir(phi), look: look(phi) };
    });
    const x1 = clamp(rampLocal(UP, RAMP.L, 0, 0).x - 0.4, xa - 0.25, -1.62);
    tl.seq(0.75, (u, st) => { const phi = UP - D2R(14) * ease(u); st.phi = phi; st.drv = { x: x1, z: z0, yaw, walkT: ta, lean: 9 * Math.sin(Math.PI * u), hands: { L: end(phi, -1), R: end(phi, 1) }, handDir: endDir(phi), handW: 1 - ease(clamp((u - 0.45) / 0.55, 0, 1)), look: look(phi) }; });
    const P0 = UP - D2R(14);
    tl.seq(0.9, (u, st) => {
      let phi = P0 * (1 - Math.min(1, u * u * 1.25));
      if (u > 0.8) phi = Math.sin((u - 0.8) / 0.2 * Math.PI) * 0.025 * (1 - (u - 0.8) / 0.2);
      st.phi = phi; st.drv = { x: x1, z: z0, yaw, walkT: ta, look: look(phi) };
    });
    Object.assign(D, { x: x1, z: z0, yaw });
    K.idle(0.3, { look: rampLocal(0, 0.6, 0, 0) });
    tl.mark('rampIn');
  }

  boardTimeline(c0, slot, stride) {
    const tl = new Timeline(), K = this.driverKit(tl, stride), D = K.D;
    // הכיסא מחכה במקום (עד שהנהג מגיע)
    tl.at(0, 0, (u, st) => { st.chair = { ...c0, roll: 0 }; });
    this.fromCab(tl, K);
    tl.mark('out');
    this.toMid(tl, K);
    tl.mark('mid');
    this.strapOut(tl, K);
    // אל מאחורי הכיסא: לאורך צד הכיסא שליד האוטובוס, ופנייה רחבה (U) אל מאחוריו. במערכת הכיסא: l לכיוון האוטובוס, f קדימה
    const h = [Math.sin(c0.yaw), Math.cos(c0.yaw)], C = [c0.x, c0.z];
    const sg = (h[1] >= 0 ? 1 : -1), lv = [h[1] * sg, -h[0] * sg];   // לכיוון ‎+x (האוטובוס) כשהכיסא פונה קדימה
    const cf = (l, f) => [C[0] + lv[0] * l + h[0] * f, C[1] + lv[1] * l + h[1] * f];
    K.walk([cf(0.62, 1.15), cf(0.62, -0.2), cf(0.55, -1.2), cf(0.3, -1.6), cf(0.05, -1.55), cf(0, -1.5), cf(0, -0.86)], 1.0);
    D.yaw = c0.yaw;
    tl.mark('behind');
    const hold = c => WC.handles.map(p => chairPoint(c, PHI_OUT, p));
    const hdir = c => { const f = chairPoint(c, PHI_OUT, V3(0, 0, 1)).sub(chairPoint(c, PHI_OUT, V3())); return f.multiplyScalar(0.6).add(V3(0, -0.06, 0)); };
    const grabX = D.x, grabZ = D.z, gy = D.yaw, gt = D.walkT;
    tl.seq(0.8, (u, st) => {
      const hh = hold(c0), k = ease(u);
      st.drv = { push: true, x: grabX, z: grabZ, yaw: gy, walkT: gt, hands: { L: hh[1], R: hh[0] }, handW: k, handDir: hdir(c0), grip: 0.1, lean: 5 * k, look: chairPoint(c0, PHI_OUT, V3(0, 0.9, 0)) };
    });
    // דוחף: ישר קדימה, פנייה אל המשטח, ובמעלה המשטח רק עד מעבר לסף (את השאר הנוסע עושה לבד)
    const F = [-2.25, LANE], IN = -0.55, X0R = rampLocal(PHI_OUT, RAMP.L, 0, 0).x;
    const Cs = [C[0] + h[0] * Math.max(0, -1.3 - C[1]), C[1] + h[1] * Math.max(0, -1.3 - C[1])], kc2 = Math.hypot(F[0] - Cs[0], F[1] - Cs[1]) * 0.5;
    const pts = [C, ...bezier(Cs, [Cs[0] + h[0] * kc2, Cs[1] + h[1] * kc2], [F[0] - kc2, F[1]], F), [IN, LANE]];
    const P = new Path(pts), pr = profile(P.L, 0.6, 1.0), head = K.head;
    const tPush = tl.seq(pr.dur, (u, st) => {
      const t = u * pr.dur, d = pr.d(t), [x, z] = P.at(d), yaw = P.yaw(d, 0.08), fxc = x + Math.sin(yaw) * WC.caster.z;
      // לפני המשטח הנהג מטה מעט את הכיסא לאחור, כדי שהגלגלים הקדמיים ומשענות הרגליים יעלו עליו בלי להיתקע
      const c = { x, z, yaw, roll: d / WC.R, tilt: 0.16 * ease(clamp((fxc - X0R + 0.55) / 0.3, 0, 1)) * (1 - ease(clamp((fxc - X0R - 0.12) / 0.3, 0, 1))) };
      st.chair = c;
      const hh = hold(c), up = x > -2.4 && x < -0.75 ? 1 : 0, la = P.at(Math.min(P.L, d + 1.5));
      st.drv = { push: true, x: x - Math.sin(yaw) * 0.86, z: z - Math.cos(yaw) * 0.86, yaw, walkT: gt + d / stride, lean: 9 + 9 * up * pr.sp(t), hands: { L: hh[1], R: hh[0] }, handDir: hdir(c), grip: 0.1, look: head(la[0], la[1], 1.0) };
    });
    const end = P.at(P.L), eyaw = P.yaw(P.L, 0.08), roll1 = P.L / WC.R, cE = { x: end[0], z: end[1], yaw: eyaw };
    D.x = end[0] - Math.sin(eyaw) * 0.86; D.z = end[1] - Math.cos(eyaw) * 0.86; D.yaw = eyaw; D.walkT = gt + P.L / stride;
    tl.mark('pushed');
    // משחרר ויורד במשטח בצעדים קטנים לאחור, פונה אל הנוסע
    const rx = D.x, rz = D.z, rt = D.walkT;
    tl.seq(0.6, (u, st) => { const hh = hold(cE); st.drv = { x: rx, z: rz, yaw: eyaw, walkT: rt, hands: { L: hh[1], R: hh[0] }, handDir: hdir(cE), grip: 0.1, handW: 1 - ease(u), look: chairPoint(cE, PHI_OUT, V3(0, 1.0, 0.3)) }; });
    K.walk([[XF0(), LANE]], 0.45, { keep: true, step: 0.34, ta: 0.6, look: V3(0, 1.0, LANE) });
    // הנוסע: נוסע לבד אל נקודת הסיבוב, מסתובב במקום אל האחור ונוסע אל המקום שלו
    const b = this.bay(slot);
    const n1 = chairAlong(tl, tPush + 0.5, [end, [-0.3, LANE], [0.0, PIV]], { v: 0.35, roll0: roll1, ta: 0.5 });
    const t0 = n1.t + 0.2;
    const DY = Math.atan2(Math.sin(Math.atan2(b.x, b.z - PIV) - n1.yaw), Math.cos(Math.atan2(b.x, b.z - PIV) - n1.yaw));
    tl.at(t0, 1.8, (u, st) => { const k = ease(u), dy = DY * k; st.chair = { x: 0.0, z: PIV, yaw: n1.yaw + dy, roll: n1.roll, rl: n1.roll + dy * WC.wx / WC.R, rr: n1.roll - dy * WC.wx / WC.R, propel: Math.sin(Math.PI * u) }; });
    const n2 = chairAlong(tl, t0 + 1.9, [[0.0, PIV], [b.x, b.z]], { v: 0.4, roll0: n1.roll, dl: DY * WC.wx / WC.R, dr: -DY * WC.wx / WC.R, ta: 0.5 });
    // מחכה שהנוסע יגיע למקום, ואז מקפל
    if (n2.t + 0.3 > tl.t) K.idle(n2.t + 0.3 - tl.t, { look: V3(-0.2, 1.0, 0.0) });
    this.foldIn(tl, K, stride);
    tl.mark('back');
    this.toCab(tl, K);
    return tl;
  }

  alightTimeline(slot, stride) {
    const tl = new Timeline(), K = this.driverKit(tl, stride), D = K.D, b = this.bay(slot);
    tl.at(0, 0, (u, st) => { st.chair = { x: b.x, z: b.z, yaw: b.yaw, roll: 0 }; });
    this.fromCab(tl, K);
    tl.mark('out');
    this.toMid(tl, K);
    tl.mark('mid');
    const tOut = this.strapOut(tl, K);
    // הנהג פוסע הצידה (בלי להסתובב) ומחכה ליד המשטח, מסתכל על הנוסע
    const sx = D.x, side = LANE + 1.35;
    K.walk([[sx, side]], 0.5, { keep: true, step: 0.34, ta: 0.5, look: V3(-1.0, 1.0, LANE) });
    // הנוסע: לאחור אל נקודת הסיבוב שמול הדלת, מסתובב במקום אל הדלת, ויורד לאחור במורד המשטח אל המדרכה (מטר מהשפה)
    const t1 = tOut + 0.9, PX = KERB && Math.abs(KERB.a) > 0.3 ? clamp((1.0 - KERB.b * LANE - KERB.c) / KERB.a, -4.5, -2.4) : -2.8;
    const n1 = chairAlong(tl, t1, [[b.x, b.z], [0.0, PIV]], { v: 0.35, back: true, ta: 0.5 });
    const tp = n1.t + 0.3;
    const Q1 = [-0.6, LANE - 0.03], Y2 = Math.atan2(Q1[0], Q1[1] - PIV) + Math.PI, DY = Math.atan2(Math.sin(Y2 - n1.yaw), Math.cos(Y2 - n1.yaw));
    tl.at(tp, 1.8, (u, st) => { const k = ease(u), dy = DY * k; st.chair = { x: 0.0, z: PIV, yaw: n1.yaw + dy, roll: n1.roll, rl: n1.roll + dy * WC.wx / WC.R, rr: n1.roll - dy * WC.wx / WC.R, propel: Math.sin(Math.PI * u) }; });
    const n2 = chairAlong(tl, tp + 1.9, [[0.0, PIV], Q1, [PX, LANE]], { v: 0.45, back: true, roll0: n1.roll, dl: DY * WC.wx / WC.R, dr: -DY * WC.wx / WC.R, propel: 0.35 });   // במורד: הידיים על הטבעות, בולם
    const r1 = n2.roll, t2 = n2.t + 0.3;
    const kd = KERB && Math.hypot(KERB.a, KERB.b) > 0.3 ? (() => { const L = Math.hypot(KERB.a, KERB.b); let dx = -KERB.b / L, dz = KERB.a / L; if (dz > 0) { dx = -dx; dz = -dz; } return [dx, dz]; })() : [0, -1];
    const dyT = Math.atan2(Math.sin(Math.atan2(kd[0], kd[1]) - Math.PI / 2), Math.cos(Math.atan2(kd[0], kd[1]) - Math.PI / 2));
    tl.at(t2, 1.6, (u, st) => { const k = ease(u), dy = dyT * k;   // מסתובב במקום (לכיוון לאורך השפה): הגלגלים בכיוונים הפוכים
      st.chair = { x: PX, z: LANE, yaw: Math.PI / 2 + dy, roll: r1, rl: r1 - dy * WC.wx / WC.R, rr: r1 + dy * WC.wx / WC.R, propel: Math.sin(Math.PI * u) }; });
    const t3 = t2 + 1.6;
    chairAlong(tl, t3, [[PX, LANE], [PX + kd[0] * 6.6, LANE + kd[1] * 6.6]], { v: 0.6, roll0: r1, dl: -dyT * WC.wx / WC.R, dr: dyT * WC.wx / WC.R, fade: true, ta: 0.9 });
    // מחכה שהנוסע יתרחק, ואז פוסע חזרה אל קצה המשטח ומקפל
    const tFree = t3 + 1.6;
    if (tFree > tl.t) { const t0 = tl.t, wx = D.x, wz = D.z, wy = D.yaw, wt = D.walkT; tl.seq(tFree - t0, (u, st) => K.set(st, { x: wx, z: wz, yaw: wy, walkT: wt, look: V3(-1.6 - 0.8 * ease(u), 1.0, LANE - 0.9 * ease(u)) })); }
    K.walk([[sx, LANE]], 0.5, { keep: true, step: 0.34, ta: 0.5, look: rampLocal(PHI_OUT, RAMP.L, 0, 0) });
    this.foldIn(tl, K, stride);
    tl.mark('back');
    this.toCab(tl, K);
    return tl;
  }
}
