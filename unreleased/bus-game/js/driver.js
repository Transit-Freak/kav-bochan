// תא הנהג והנהג היושב. נבנים פעם אחת לתוך דגם האוטובוס (asset.scene), וכל אוטובוס מקבל אותם בשכפול —
// הגאומטריה והחומרים משותפים לכל האוטובוסים, והנהג "אפוי" בתנוחת ישיבה (רשת רגילה, בלי שלד ובלי אנימציה לכל אוטובוס).
// מערכת הצירים של האוטובוס: ‎+Z קדימה, ‎+Y למעלה, הדלתות בצד ‎-X — ולכן הנהג יושב בצד ‎+X (יד שמאל שלו לכיוון ‎+X).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FL = 0.66;                 // גובה הרצפה בפנים
const DX = 0.74;                 // קו האמצע של הנהג, ההגה והמושב
const HIP = new THREE.Vector3(DX, 1.23, 4.56);       // מרכז האגן של הנהג
// ההגה: כמעט שוכב, כמו באוטובוס (35° מהאופק), נוטה אל הנהג
const TILT = THREE.MathUtils.degToRad(35);
const WHEEL = { c: new THREE.Vector3(DX, 1.53, 4.95), r: 0.245, tube: 0.021,
  n: new THREE.Vector3(0, Math.cos(TILT), -Math.sin(TILT)),        // הניצב למישור ההגה (למעלה ואל הנהג)
  v: new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT)) };       // "למעלה" במישור ההגה (השעה 12)
const WX = new THREE.Vector3(1, 0, 0);
const rimPoint = (deg, out = new THREE.Vector3()) => {             // 0° = שעה 3 מצד ‎+X, 90° = שעה 12
  const a = THREE.MathUtils.degToRad(deg);
  return out.copy(WHEEL.c).addScaledVector(WX, Math.cos(a) * WHEEL.r).addScaledVector(WHEEL.v, Math.sin(a) * WHEEL.r);
};

// ---------- גאומטריה
// תיבה עם פינות מעוגלות (נורמלים חלקים), למושב ולריפוד
function rbox(w, h, d, r, k = 3) {
  const N = 2 * k + 1, half = [w / 2, h / 2, d / 2];
  const g = new THREE.BoxGeometry(w, h, d, N, N, N);
  const p = g.attributes.position, nrm = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  const remap = (x, hf) => {                     // k צעדים בתוך אזור העיגול בכל קצה, צעד אחד באמצע
    const i = Math.round((x + hf) / (2 * hf / N));
    if (i <= k) return -hf + r * (i / k);
    if (i >= N - k) return hf - r * ((N - i) / k);
    return x;
  };
  for (let i = 0; i < p.count; i++) {
    v.set(remap(p.getX(i), half[0]), remap(p.getY(i), half[1]), remap(p.getZ(i), half[2]));
    c.set(THREE.MathUtils.clamp(v.x, -half[0] + r, half[0] - r), THREE.MathUtils.clamp(v.y, -half[1] + r, half[1] - r),
      THREE.MathUtils.clamp(v.z, -half[2] + r, half[2] - r));
    v.sub(c); const L = v.length();
    if (L > 1e-6) { v.multiplyScalar(r / L); nrm.setXYZ(i, v.x / r, v.y / r, v.z / r); }
    v.add(c); p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// גליל בין שתי נקודות
function rod(a, b, r, seg = 12) {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5); return g.translate(m.x, m.y, m.z);
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return g.translate(x, y, z);
};

// לוח השעונים: שני שעונים עגולים ומסך קטן ביניהם (טקסטורה מצוירת)
function gaugeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#07090c'; x.fillRect(0, 0, 256, 96);
  for (const cx of [48, 208]) {
    x.strokeStyle = '#b9c2cc'; x.lineWidth = 3; x.beginPath(); x.arc(cx, 50, 36, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#e5e7eb'; x.lineWidth = 2;
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.75 + i * 0.15); x.beginPath(); x.moveTo(cx + Math.cos(a) * 28, 50 + Math.sin(a) * 28); x.lineTo(cx + Math.cos(a) * 33, 50 + Math.sin(a) * 33); x.stroke(); }
    const a = Math.PI * (cx < 128 ? 1.3 : 1.05);
    x.strokeStyle = '#ef4444'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, 50); x.lineTo(cx + Math.cos(a) * 30, 50 + Math.sin(a) * 30); x.stroke();
  }
  x.fillStyle = '#0d2a4a'; x.fillRect(96, 22, 64, 52);
  x.fillStyle = '#7dd3fc'; x.fillRect(102, 30, 40, 6); x.fillRect(102, 44, 52, 4); x.fillRect(102, 56, 30, 4);
  x.fillStyle = '#22c55e'; x.beginPath(); x.arc(128, 12, 4, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// החומרים של תא הנהג: אותם חומרים של האוטובוס מ-Blender (לפי השם), כדי שייראו כמו שאר הפנים
function busMaterials(root) {
  const byName = new Map();
  root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && !byName.has(m.name)) byName.set(m.name, m); });
  const std = (name, color, rough, metal = 0) => byName.get(name) || new THREE.MeshStandardMaterial({ name, color, roughness: rough, metalness: metal });
  return {
    trim: std('M_Trim', 0x060606, 0.55),
    rubber: std('M_Rubber', 0x050505, 0.88),
    steel: std('M_Steel', 0x8a8c8f, 0.4, 1),
    seat: std('M_Seat', 0x0f2350, 0.75),
    panel: std('M_Panel', 0xb9bbbd, 0.5),
    plexi: byName.get('M_Plexi') || null,
    gloss: std('M_GlossBlack', 0x030303, 0.12),
    screen: std('M_Screen', 0x05080f, 0.2),
    // לוח מחוונים: פלסטיק כהה מט, קצת בהיר מהשחור של המסגרות כדי שיהיו צורות
    dash: new THREE.MeshStandardMaterial({ name: 'M_CabDash', color: 0x1b1d20, roughness: 0.7 }),
    frost: new THREE.MeshStandardMaterial({ name: 'M_CabFrost', color: 0xe4eaee, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.62 }),
    gauges: (t => new THREE.MeshStandardMaterial({ name: 'M_CabGauges', map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.35 }))(gaugeTexture()),
  };
}

function buildCab(M) {
  const parts = [];                               // [geometry, material]
  const add = (m, g) => { if (m && g) parts.push([g, m]); };
  // לוח המחוונים בצד הנהג: מתחת לשמשה (עד גובה 1.25), ומעליו מכסה השעונים מאחורי ההגה. מתחתיו גומחה לרגליים
  add(M.dash, at(rbox(0.9, 0.3, 0.71, 0.04), 0.77, 1.1, 5.595));
  add(M.trim, at(rbox(0.92, 0.03, 0.72, 0.012), 0.77, 1.255, 5.6));                    // משטח עליון כהה
  add(M.dash, at(box(0.9, 0.29, 0.05), 0.77, FL + 0.145, 5.52));                     // הקיר הקדמי של גומחת הרגליים
  add(M.dash, at(rbox(0.5, 0.16, 0.24, 0.05), DX, 1.32, 5.34));                       // מכסה השעונים
  const gp = new THREE.PlaneGeometry(0.34, 0.1); gp.rotateY(Math.PI); gp.rotateX(0.12);
  add(M.gauges, gp.translate(DX - 0.03, 1.325, 5.214));
  // הקונסולה האמצעית בין הנהג לדלת (מתגים, מסך קטן), עד הרצפה
  add(M.dash, at(rbox(0.3, 0.7, 0.74, 0.035), 0.17, FL + 0.35, 5.59));
  add(M.trim, at(rbox(0.32, 0.03, 0.75, 0.012), 0.17, FL + 0.705, 5.59));
  add(M.screen, at(box(0.17, 0.11, 0.012), 0.17, FL + 0.5, 5.214));
  for (let i = 0; i < 6; i++) add(M.gloss, at(rbox(0.035, 0.022, 0.035, 0.008, 1), 0.08 + (i % 3) * 0.09, FL + 0.725, 5.36 + Math.floor(i / 3) * 0.08));
  // זרוע למכשיר הכרטוס (בדגם הוא תלוי באוויר מעל הקונסולה)
  add(M.trim, rod(new THREE.Vector3(0.22, 1.63, 5.07), new THREE.Vector3(0.2, 1.36, 5.3), 0.018, 10));
  add(M.trim, at(rbox(0.09, 0.02, 0.09, 0.008, 1), 0.2, 1.37, 5.3));
  // מתחת לשמשה בצד הדלת: לוח צר בלבד, כדי שהכניסה מהדלת הקדמית תישאר פנויה
  add(M.dash, at(rbox(1.16, 0.34, 0.32, 0.04), -0.56, FL + 0.43, 5.79));
  add(M.trim, at(rbox(1.18, 0.05, 0.34, 0.02), -0.56, FL + 0.62, 5.79));
  // ההגה: טבעת, טבור ושלושה חישורים, עמוד הגה עד הלוח
  const ring = new THREE.TorusGeometry(WHEEL.r, WHEEL.tube, 10, 40);
  ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), WHEEL.n));
  add(M.rubber, ring.translate(WHEEL.c.x, WHEEL.c.y, WHEEL.c.z));
  const hub = new THREE.CylinderGeometry(0.075, 0.085, 0.06, 20);
  hub.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), WHEEL.n));
  add(M.trim, hub.translate(WHEEL.c.x, WHEEL.c.y, WHEEL.c.z));
  for (const deg of [0, 180, 270]) add(M.trim, rod(WHEEL.c, rimPoint(deg), 0.014, 8));
  const col0 = WHEEL.c.clone().addScaledVector(WHEEL.n, -0.03), col1 = WHEEL.c.clone().addScaledVector(WHEEL.n, -0.36);
  add(M.dash, rod(col0, col1, 0.055, 14));
  add(M.trim, rod(col1, col1.clone().add(new THREE.Vector3(0, -0.05, 0.12)), 0.075, 14));
  return parts;
}

// מושב הנהג, לפי מידות הנהג אחרי הישיבה (seatY — גובה הריפוד, back — המשענת)
function buildSeat(M, seatY, back) {
  const parts = [], add = (m, g) => { if (m && g) parts.push([g, m]); };
  const cz = HIP.z + 0.1;
  add(M.seat, at(rbox(0.5, 0.11, 0.5, 0.045), DX, seatY - 0.055, cz, -0.06));            // ריפוד
  add(M.trim, at(rbox(0.46, 0.06, 0.46, 0.02), DX, seatY - 0.135, cz));                   // מסגרת
  // משענת: נוטה לאחור, צמודה לגב של הנהג
  const bh = 0.62, ba = back.angle, bz = back.z0;
  const bg = rbox(0.5, bh, 0.11, 0.045); bg.translate(0, bh / 2, -0.055);
  add(M.seat, at(bg, DX, seatY + 0.02, bz, -ba));
  const hr = rbox(0.3, 0.2, 0.09, 0.04); hr.translate(0, bh + 0.16, -0.06);              // משענת ראש
  add(M.seat, at(hr, DX, seatY + 0.02, bz - 0.01, -ba));
  for (const sx of [-0.09, 0.09]) {                                                     // מוטות משענת הראש
    const r = rod(new THREE.Vector3(sx, bh - 0.02, -0.06), new THREE.Vector3(sx, bh + 0.07, -0.06), 0.008, 6);
    add(M.steel, at(r, DX, seatY + 0.02, bz - 0.01, -ba));
  }
  // משענת יד בצד המעבר
  add(M.seat, at(rbox(0.07, 0.06, 0.32, 0.025), DX - 0.31, seatY + 0.2, cz - 0.02));
  add(M.trim, rod(new THREE.Vector3(DX - 0.31, seatY + 0.17, cz - 0.15), new THREE.Vector3(DX - 0.27, seatY - 0.1, cz - 0.2), 0.012, 6));
  // רגל המושב: בולם אוויר (גומי) על בסיס
  add(M.rubber, new THREE.CylinderGeometry(0.11, 0.11, seatY - 0.17 - (FL + 0.12), 18).translate(DX, (seatY - 0.17 + FL + 0.12) / 2, cz));
  add(M.trim, at(rbox(0.4, 0.12, 0.42, 0.02), DX, FL + 0.06, cz));
  return parts;
}

// מחיצה מאחורי הנהג: פח בחלק התחתון, פרספקס למעלה (השלטים לנוסעים כבר מודבקים עליה בדגם)
function buildBackWall(M) {
  const parts = [], add = (m, g) => { if (m && g) parts.push([g, m]); };
  add(M.panel, at(box(0.86, 0.72, 0.025), 0.76, FL + 0.36, 4.235));
  add(M.trim, at(box(0.88, 0.035, 0.04), 0.76, FL + 0.73, 4.235));
  add(M.plexi, at(box(0.86, 0.85, 0.012), 0.76, FL + 1.17, 4.235));
  return parts;
}

// הדלת של תא הנהג (בצד המעבר, בין המחיצה האחורית לקונסולה): פח למטה, פרספקס למעלה, מסגרת שחורה.
// ציר אנכי בקצה הקדמי; סגורה — לאורך ‎-Z, פתוחה — מסתובבת החוצה אל אזור הדלת הקדמית (rotation.y חיובי), כך שהמעבר נשאר פנוי.
// כל אוטובוס מקבל עותק משלו (בשכפול), עם אותה גאומטריה
export const CAB_DOOR = { x: 0.345, z: 4.95, w: 0.62, open: 1.45, handle: { y: 0.95, back: 0.56, out: 0.055 } };
// הידית של דלת התא במערכת האוטובוס, כשהדלת פתוחה בזווית th (רדיאנים). side: ‎+1 — מצד התא, ‎-1 — מצד המעבר
export function cabHandle(th, side = 1, out = new THREE.Vector3()) {
  const x = side * CAB_DOOR.handle.out, z = -CAB_DOOR.handle.back, c = Math.cos(th), s = Math.sin(th);
  return out.set(CAB_DOOR.x + x * c + z * s, FL + CAB_DOOR.handle.y, CAB_DOOR.z - x * s + z * c);
}
function buildCabDoor(M) {
  const g = new THREE.Group(); g.name = 'CabDoor';
  g.position.set(CAB_DOOR.x, FL, CAB_DOOR.z);
  const W = CAB_DOOR.w, parts = [], add = (m, geo) => { if (m && geo) parts.push([geo, m]); };
  add(M.panel, at(box(0.02, 0.72, W - 0.04), 0, 0.38, -W / 2));
  add(M.trim, at(box(0.03, 0.035, W), 0, 0.03, -W / 2));                      // מסגרת תחתונה
  add(M.trim, at(box(0.034, 0.04, W), 0, 0.76, -W / 2));                      // אמצע
  add(M.trim, at(box(0.034, 0.035, W), 0, 1.45, -W / 2));                     // עליונה
  add(M.trim, at(box(0.036, 1.47, 0.035), 0, 0.735, -0.0175));                // צד הציר
  add(M.trim, at(box(0.036, 1.47, 0.035), 0, 0.735, -W + 0.0175));            // צד הידית
  // פרספקס חלבי (לא שקוף כמו חלון), כדי שייראה כמו דלת
  add(M.frost, at(box(0.008, 0.66, W - 0.07), 0, 1.105, -W / 2));
  for (const sx of [-1, 1]) add(M.steel, at(rbox(0.022, 0.12, 0.022, 0.008, 1), sx * CAB_DOOR.handle.out, CAB_DOOR.handle.y, -CAB_DOOR.handle.back)); // ידיות משני הצדדים
  for (const y of [0.2, 1.25]) add(M.steel, at(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), 0, y, 0));   // צירים
  g.add(mergeParts(parts, 'CabDoorParts'));
  return g;
}

// בדגם יש לוח פרספקס קבוע בצד המעבר של תא הנהג, בדיוק במקום של הדלת — מוחקים אותו (הדלת באה במקומו)
function removeCabSidePanel(root) {
  root.updateMatrixWorld(true);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  root.traverse(o => {
    const m = o.isMesh && [].concat(o.material)[0];
    if (!m || m.name !== 'M_Plexi' || !o.geometry.index) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index.array, keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(o.matrixWorld);
      if (!v.every(p => p.x > 0.27 && p.x < 0.38 && p.z > 4.05 && p.z < 5.06)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (keep.length !== idx.length) g.setIndex(keep);
  });
  // השלט לנוסעים (M_Sign2) תלוי בדגם באוויר מעל המעבר, בגובה הראש (z‏ 4.01) — מעבירים אותו אל המחיצה שמאחורי הנהג
  root.traverse(o => {
    const m = o.isMesh && [].concat(o.material)[0];
    if (!m || m.name !== 'M_Sign2') return;
    const b = new THREE.Box3().setFromObject(o);
    if (!(b.min.z > 3.95 && b.max.z < 4.05 && b.min.x < 0.1)) return;
    const inv = o.matrixWorld.clone().invert(), pos = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      v.x += 0.42; v.y -= 0.2; v.z = 4.222;
      v.applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true; o.geometry.computeBoundingSphere();
  });
}

// איחוד לפי חומר — כמה רשתות בודדות לכל תא הנהג
function mergeParts(parts, name) {
  const g = new THREE.Group(); g.name = name;
  const by = new Map();
  for (const [geo, m] of parts) {
    const gg = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    (by.get(m) || by.set(m, []).get(m)).push(gg);
  }
  for (const [m, list] of by) {
    const mesh = new THREE.Mesh(list.length > 1 ? mergeGeometries(list, false) : list[0], m);
    mesh.name = name + '_' + m.name; if (m.transparent) mesh.renderOrder = 2;
    g.add(mesh);
  }
  return g;
}

// ---------- זכוכית: השמשה הקדמית, חלון הנהג וזכוכית הדלתות שקופות יותר מחלונות הנוסעים הכהים — שם רואים את הנהג.
// אותו שם חומר (M_Glass), כדי שיקבל את אותה החזרה של מפת הסביבה
function clearerGlass(root) {
  let clear = null;
  const clearOf = m => { if (!clear) { clear = m.clone(); clear.opacity = 0.32; } return clear; };
  const inDoor = o => { for (let p = o; p; p = p.parent) if (/^(Door|Leaf)_/.test(p.name)) return true; return false; };
  const glass = [];
  root.traverse(o => { if (o.isMesh && !o.userData.cabSplit && [].concat(o.material)[0]?.name === 'M_Glass') glass.push(o); });
  for (const o of glass) {
    if (inDoor(o)) { o.material = clearOf(o.material); continue; }
    if (!o.geometry.index || !/Bus_Body/.test(o.name + ' ' + (o.parent?.name || ''))) continue;
    o.updateMatrixWorld(true);
    const g = o.geometry, idx = g.index.array, p = g.attributes.position, mw = o.matrixWorld;
    const keep = [], front = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(p, idx[i]).applyMatrix4(mw); b.fromBufferAttribute(p, idx[i + 1]).applyMatrix4(mw); c.fromBufferAttribute(p, idx[i + 2]).applyMatrix4(mw);
      const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
      const isClear = (z > 5.7 && y > 1.2) || (x > 1.1 && z > 3.9 && y > 1.2 && y < 2.9);   // שמשה קדמית / חלון הנהג
      (isClear ? front : keep).push(idx[i], idx[i + 1], idx[i + 2]);
    }
    if (!front.length) continue;
    g.setIndex(keep);
    const fg = g.clone(); fg.setIndex(front);
    const fm = new THREE.Mesh(fg, clearOf(o.material)); fm.name = 'Cab_Windshield'; fm.userData.cabSplit = true; fm.renderOrder = o.renderOrder;
    fm.position.copy(o.position); fm.quaternion.copy(o.quaternion); fm.scale.copy(o.scale);
    o.parent.add(fm); o.userData.cabSplit = true;
  }
}

// ---------- הנהג
function partKind(name) {
  const n = name.toLowerCase();
  if (n.includes('shoe') || n.includes('boot')) return 'shoes';
  if (/hair|short0|long0|bob0|ponytail|braid|afro|brow|lash/.test(n)) return 'hair';
  if (/eye|cornea|low-poly|high-poly/.test(n)) return 'eyes';
  if (/body|lips|nail|ears|skin|teeth|tongue/.test(n)) return 'skin';
  return 'cloth';
}
function driverMaterial(m, kind) {
  const out = new THREE.MeshLambertMaterial({ name: 'Driver_' + kind, map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
    alphaTest: m.map ? (kind === 'hair' ? 0.5 : 0.35) : 0, side: kind === 'skin' || kind === 'eyes' ? THREE.FrontSide : THREE.DoubleSide });
  return out;
}

// מסובבים עצם כך שהעצם הבא אחריו (child) יצביע אל נקודה בעולם
export function aim(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  const p = bone.getWorldPosition(new THREE.Vector3()), c = child.getWorldPosition(new THREE.Vector3());
  const d0 = c.sub(p).normalize(), d1 = target.clone().sub(p).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(d0, d1);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  bone.updateWorldMatrix(false, true);
}
// סיבוב עצם בזווית סביב ציר בעולם
export function turn(bone, axis, deg) {
  bone.updateWorldMatrix(true, false);
  const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), THREE.MathUtils.degToRad(deg));
  const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  bone.updateWorldMatrix(false, true);
}
// IK של שני עצמים (ירך-שוק, זרוע-אמה): המפרק האמצעי לכיוון pole
export function twoBone(a, b, c, target, pole) {
  a.updateWorldMatrix(true, true);
  const A = a.getWorldPosition(new THREE.Vector3()), B = b.getWorldPosition(new THREE.Vector3()), C = c.getWorldPosition(new THREE.Vector3());
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const dir = target.clone().sub(A); let d = dir.length(); dir.normalize();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pn = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const K = A.clone().addScaledVector(dir, x).addScaledVector(pn, h);
  aim(a, b, K); aim(b, c, A.clone().addScaledVector(dir, d));
}

function poseDriver(gltf, hip) {
  const root = SkeletonUtils.clone(gltf.scene);
  const idle = gltf.animations.find(a => /idle/i.test(a.name));
  if (idle) { const mx = new THREE.AnimationMixer(root); mx.clipAction(idle).play(); mx.update(0); }
  root.updateMatrixWorld(true);
  const B = n => root.getObjectByName(n);
  const hips = B('Hips'); if (!hips || !B('RightToeBase') || !B('LeftHand')) return null;
  root.position.add(hip.clone().sub(hips.getWorldPosition(new THREE.Vector3())));
  root.updateMatrixWorld(true);
  const X = new THREE.Vector3(1, 0, 0);
  // כיוון כף היד בצירים של עצם היד: בעמידה הידיים לצד הגוף והכפות פונות פנימה
  const palm = {};
  for (const s of ['Left', 'Right']) {
    const hd = B(s + 'Hand'); if (!hd) continue;
    const inward = new THREE.Vector3(Math.sign(hips.getWorldPosition(new THREE.Vector3()).x - hd.getWorldPosition(new THREE.Vector3()).x), 0, 0);
    const wq = hd.getWorldQuaternion(new THREE.Quaternion());
    let best = null, bd = 0;
    for (const ax of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
      const d = ax.clone().applyQuaternion(wq).dot(inward);
      if (Math.abs(d) > Math.abs(bd)) { bd = d; best = ax; }
    }
    palm[s] = best.clone().multiplyScalar(Math.sign(bd));
  }
  // הגב: נשען מעט לאחור במשענת, והחזה קצת קדימה אל ההגה
  turn(B('LowerBack'), X, -9);
  turn(B('Spine1'), X, 6);
  // רגליים: רגל ימין (‎-X) על דוושת הגז, שמאל ליד דוושת הבלם על הרצפה. הברכיים קדימה ולמעלה
  const up = new THREE.Vector3(0, 1, 0.9);
  twoBone(B('RightUpLeg'), B('RightLeg'), B('RightFoot'), new THREE.Vector3(DX - 0.13, FL + 0.14, 5.05), up.clone().add(new THREE.Vector3(-0.08, 0, 0)));
  twoBone(B('LeftUpLeg'), B('LeftLeg'), B('LeftFoot'), new THREE.Vector3(DX + 0.15, FL + 0.11, 4.98), up.clone().add(new THREE.Vector3(0.12, 0, 0)));
  // כפות הרגליים: שטוחות על הדוושה/הרצפה, האצבעות קדימה
  aim(B('RightFoot'), B('RightToeBase'), B('RightFoot').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0.14)));
  aim(B('LeftFoot'), B('LeftToeBase'), B('LeftFoot').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.02, -0.03, 0.14)));
  // ידיים על ההגה, קצת מעל "רבע לשלוש": כף היד על הצד החיצוני של ההגה, האצבעות סוגרות סביבו.
  // כיוון כף היד (palm) נמדד בתנוחת העמידה — שם כפות הידיים פונות אל הגוף
  for (const [s, deg, pole] of [['Left', 22, new THREE.Vector3(0.8, -1, -0.2)], ['Right', 158, new THREE.Vector3(-0.8, -1, -0.2)]]) {
    const hand = B(s + 'Hand'), fb = B(s + 'FingerBase'), f1 = B(s + 'HandFinger1'), th = B(s === 'Left' ? 'LThumb' : 'RThumb');
    if (!hand || !fb) continue;
    const g = rimPoint(deg), r = g.clone().sub(WHEEL.c).normalize();
    const h = WHEEL.n.clone().multiplyScalar(-0.75).addScaledVector(WHEEL.v, 0.45).addScaledVector(r, -0.25).normalize();
    const wrist = g.clone().addScaledVector(r, 0.035).addScaledVector(WHEEL.n, 0.025).addScaledVector(h, -0.08);
    twoBone(B(s + 'Arm'), B(s + 'ForeArm'), hand, wrist, pole);
    aim(hand, fb, hand.getWorldPosition(new THREE.Vector3()).add(h));
    // הכף פונה אל מרכז ההגה ומעט למטה
    const want = r.clone().negate().addScaledVector(WHEEL.n, -0.5);
    want.addScaledVector(h, -want.dot(h)).normalize();
    const pw = palm[s].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    pw.addScaledVector(h, -pw.dot(h)).normalize();
    turn(hand, h, THREE.MathUtils.radToDeg(Math.atan2(new THREE.Vector3().crossVectors(pw, want).dot(h), pw.dot(want))));
    // אצבעות: מתקפלות לכיוון כף היד
    const P = palm[s].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    const curl = (bone, deg2) => { if (!bone) return; const d = new THREE.Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
      turn(bone, new THREE.Vector3().crossVectors(d, P), deg2); };
    curl(fb, 12); curl(f1, 80); curl(th, 35);
  }
  // הראש: מסתכל קדימה על הכביש, קצת למטה
  turn(B('Neck'), X, -4); turn(B('Head'), X, 6);
  root.updateMatrixWorld(true);
  const W = n => B(n).getWorldPosition(new THREE.Vector3());
  return { root, feet: [[W('RightFoot'), W('RightToeBase')], [W('LeftFoot'), W('LeftToeBase')]] };
}

// דוושות הגז והבלם (צירים ברצפה), מתחת לכף הרגל הימנית ולידה — לפי התנוחה של הנהג
function buildPedals(M, feet) {
  const parts = [], add = (m, g) => { if (m && g) parts.push([g, m]); };
  const [ank, toe] = feet[0], d = toe.clone().sub(ank); d.x = 0; d.normalize();
  const up = new THREE.Vector3(0, d.z, -d.y);                         // הניצב לסוליה, למעלה
  const ang = Math.atan2(d.z, d.y);                                   // הזווית מהאנך
  const pedal = (x, c, len, w) => {
    add(M.rubber, at(box(w, len, 0.022), x, c.y, c.z, ang));
    const foot = c.clone().addScaledVector(d, -len / 2); foot.x = x;   // הקצה התחתון, אל הרצפה
    add(M.trim, at(box(w * 0.7, Math.max(0.02, foot.y - FL + 0.01), 0.05), x, (foot.y + FL) / 2, foot.z));
  };
  const c = ank.clone().add(toe).multiplyScalar(0.5).addScaledVector(up, -0.075);
  pedal(ank.x, c, 0.24, 0.08);                                        // גז
  pedal(DX + 0.03, c.clone().addScaledVector(up, 0.03).addScaledVector(d, -0.02), 0.13, 0.13);   // בלם
  return parts;
}

// אפייה: מחשבים את הקודקודים בתנוחה (כמו השיידר של השלד) ומאחדים לפי חומר
function bake(root) {
  const byKey = new Map(), v = new THREE.Vector3(), n = new THREE.Vector3(), acc = new THREE.Matrix4(), full = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const all = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (o.isSkinnedMesh) o.skeleton.update();
    const bm = o.isSkinnedMesh ? o.skeleton.boneMatrices : null;
    const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      if (bm) {
        const e = acc.elements; e.fill(0);
        for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (!w) continue; const b = si.getComponent(i, j) * 16; for (let k = 0; k < 16; k++) e[k] += w * bm[b + k]; }
        full.multiplyMatrices(o.matrixWorld, o.bindMatrixInverse).multiply(acc).multiply(o.bindMatrix);
      } else full.copy(o.matrixWorld);
      v.fromBufferAttribute(pos, i).applyMatrix4(full); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(nm.getNormalMatrix(full)).normalize(); N[i * 3] = n.x; N[i * 3 + 1] = n.y; N[i * 3 + 2] = n.z; }
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (nor) ng.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    ng.setAttribute('uv', uv ? uv.clone() : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    if (g.index) ng.setIndex(g.index.clone());
    if (!nor) ng.computeVertexNormals();
    const m = o.material, kind = partKind(m.name + ' ' + o.name), key = (m.map?.source?.uuid || m.uuid) + '|' + kind;
    let e = byKey.get(key); if (!e) byKey.set(key, e = { geos: [], m, kind });
    e.geos.push(ng); all.push([P, kind]);
  });
  const group = new THREE.Group(); group.name = 'Driver';
  for (const e of byKey.values()) {
    const geo = e.geos.length > 1 ? mergeGeometries(e.geos, false) : e.geos[0];
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, driverMaterial(e.m, e.kind)); mesh.name = 'Driver_' + e.kind; group.add(mesh);
  }
  return { group, all };
}
// מדידות לגוף היושב: גובה התחתון (לריפוד) וקו הגב (למשענת)
function measure(all) {
  let seatY = Infinity; const backAt = [[0.12, Infinity], [0.42, Infinity]];
  for (const [P, kind] of all) {
    if (kind !== 'cloth' && kind !== 'skin') continue;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (Math.abs(x - DX) > 0.17) continue;
      if (z > HIP.z - 0.12 && z < HIP.z + 0.2 && y < HIP.y) seatY = Math.min(seatY, y);
      for (const b of backAt) if (Math.abs(y - (HIP.y + b[0])) < 0.03 && z < HIP.z + 0.05) b[1] = Math.min(b[1], z);
    }
  }
  return { seatY, backAt };
}

// הנהג: הגבר בן ה-40 מתוך האנשים שכבר נטענו (חולצה כהה בשרוול ארוך — נראה כמו מדים), ואם אין — הגבר בן ה-50
function pickDriver(people) {
  const has = (g, re) => { let f = false; g.scene.traverse(o => { if (re.test(o.name)) f = true; }); return f; };
  return people.find(g => g && has(g, /male_casualsuit01/)) || people.find(g => g && has(g, /male_casualsuit04/)) || null;
}

// הנהג "הלא אפוי" (js/access.js): הדגם ותנוחת הישיבה (סיבובי העצמות ומיקום השורש), כדי לבנות עותק עם שלד
// שקם מהכיסא בדיוק מאותה תנוחה
export let DRIVER_RIG = null;
export { bake as bakePosed, partKind as personPart, driverMaterial };

export function addCab(busRoot, people) {
  if (!busRoot || busRoot.getObjectByName('Cab')) return;
  const M = busMaterials(busRoot);
  removeCabSidePanel(busRoot);
  clearerGlass(busRoot);
  const parts = [...buildCab(M), ...buildBackWall(M)];
  const cab = new THREE.Group(); cab.name = 'Cab';
  const gltf = pickDriver(people || []);
  let seat = { seatY: HIP.y - 0.1, back: { z0: HIP.z - 0.16, angle: 0.17 } };
  if (gltf) {
    try {
      const posed = poseDriver(gltf, HIP);
      if (posed) {
        const quats = new Map(); posed.root.traverse(o => { if (o.isBone) quats.set(o.name, o.quaternion.clone()); });
        DRIVER_RIG = { gltf, quats, rootPos: posed.root.position.clone(), hip: HIP.clone(), feet: posed.feet };
        const { group, all } = bake(posed.root);
        parts.push(...buildPedals(M, posed.feet));
        const m = measure(all);
        if (isFinite(m.seatY)) seat.seatY = m.seatY + 0.008;
        const [lo, hi] = m.backAt;
        if (isFinite(lo[1]) && isFinite(hi[1])) {
          const ang = Math.atan2(lo[1] - hi[1], hi[0] - lo[0]);
          seat.back = { angle: THREE.MathUtils.clamp(ang, 0.05, 0.35), z0: lo[1] - 0.004 + Math.tan(ang) * (lo[0] - (seat.seatY + 0.02 - HIP.y)) };
        }
        cab.add(group);
      }
    } catch (e) { console.warn('driver failed', e); }
  }
  parts.push(...buildSeat(M, seat.seatY, seat.back));
  cab.add(mergeParts(parts, 'CabParts'));
  cab.add(buildCabDoor(M));
  busRoot.add(cab);
  return cab;
}
