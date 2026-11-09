// אדם יושב על הספסל בסככה. כמו הנהג (driver.js): מזיזים את העצמות של השלד לתנוחת ישיבה עם IK,
// ואופים פעם אחת לרשת רגילה לכל דגם — היושבים מצוירים בקבוצה (InstancedMesh) כמו העומדים, בלי שלד לכל אדם.
// מערכת הצירים של היושב: ‎+Z קדימה (אל הכביש), ‎+Y למעלה. הראשית: ‎x — מרכז האגן, ‎y — הקרקע (המרצפות),
// ‎z — הנקודה האחורית ביותר של הגוף (הגב או הישבן, שנוגעים בקיר הרפפות).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { aim, turn, twoBone } from './driver.js';

const X = new THREE.Vector3(1, 0, 0);
const D = THREE.MathUtils.degToRad;
const V = () => new THREE.Vector3();

function idleRoot(gltf) {
  const root = SkeletonUtils.clone(gltf.scene);
  const idle = gltf.animations.find(a => /idle/i.test(a.name));
  if (idle) { const mx = new THREE.AnimationMixer(root); mx.clipAction(idle).play(); mx.update(0); }
  root.updateMatrixWorld(true);
  return root;
}

// מידות מתנוחת העמידה: אורך הירך והשוק, גובה הקרסול והבוהן מעל הקרקע, כיוון כף היד
function standing(gltf, skinVerts) {
  const root = idleRoot(gltf), B = n => root.getObjectByName(n), W = o => o.getWorldPosition(V());
  let ground = Infinity;
  for (const { P } of skinVerts(root)) for (let i = 1; i < P.length; i += 3) ground = Math.min(ground, P[i]);
  const hips = W(B('Hips')), legs = {}, palm = {};
  for (const s of ['Left', 'Right']) {
    const a = W(B(s + 'UpLeg')), k = W(B(s + 'Leg')), f = W(B(s + 'Foot')), t = W(B(s + 'ToeBase'));
    legs[s] = { l1: a.distanceTo(k), l2: k.distanceTo(f), ankle: f.y - ground, toe: t.y - ground, len: Math.hypot(t.x - f.x, t.z - f.z) };
    // כף היד: בעמידה הכפות פונות אל הגוף — איזה ציר של עצם היד מצביע פנימה
    const hd = B(s + 'Hand'), inward = new THREE.Vector3(Math.sign(hips.x - W(hd).x), 0, 0), wq = hd.getWorldQuaternion(new THREE.Quaternion());
    let best = null, bd = 0;
    for (const ax of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
      const d = ax.clone().applyQuaternion(wq).dot(inward);
      if (Math.abs(d) > Math.abs(bd)) { bd = d; best = ax; }
    }
    palm[s] = best.clone().multiplyScalar(Math.sign(bd));
  }
  return { legs, palm };
}

// תנוחת ישיבה: האגן בגובה hipY מעל הקרקע, כפות הרגליים על הקרקע (fix — תיקון לגובה הקרסול).
// lean — כמה מעלות הגב נשען אחורה (מעבר לבסיס), כדי שהאגן יתקדם על המושב
function pose(gltf, st, hipY, fix, lean = 0) {
  const root = idleRoot(gltf), B = n => root.getObjectByName(n), W = o => o.getWorldPosition(V());
  const hips = B('Hips');
  root.position.sub(W(hips).setY(W(hips).y - hipY)); root.updateMatrixWorld(true);
  // הגב כמעט זקוף, נשען מעט לאחור אל הקיר; הראש קצת למטה
  turn(B('LowerBack'), X, -6 - lean);
  turn(B('Head'), X, 4 + lean * 0.7);
  // רגליים: הירך כמעט אופקית על המושב, הברך בשפת המושב, והשוק נוטה קדימה
  // (כפות הרגליים לפני הברכיים, לא מתחתיהן — אחרת מלמעלה השוקיים נראות כמו מקלות שיורדים ישר מהספסל).
  // רגל אחת קצת יותר קדימה מהשנייה, הברכיים מעט פתוחות לצדדים.
  // מי שהשוק שלו קצרה לגובה הספסל (רוב הדגמים): לא מורידים את הירך באלכסון (אז הוא נראה תלוי על שפת הספסל) —
  // מרימים את העקב, והבוהן נשארת על הקרקע, כמו שאנשים נמוכים יושבים באמת
  const knees = {};
  for (const s of ['Left', 'Right']) {
    const L = st.legs[s], up = B(s + 'UpLeg'), kn = B(s + 'Leg'), ft = B(s + 'Foot'), toe = B(s + 'ToeBase');
    const A = W(up), sx = Math.sign(A.x - W(hips).x) || 1;
    const phi0 = D(s === 'Left' ? 17 : 10), sinT0 = 0.04;
    const reach = Math.hypot(L.len, L.toe - L.ankle);
    const raise = THREE.MathUtils.clamp(A.y - (L.ankle + fix) - L.l2 * Math.cos(phi0) - L.l1 * sinT0, 0, reach * 0.62);
    const ankY = L.ankle + fix + raise, dy = A.y - ankY;
    const sinT = THREE.MathUtils.clamp((dy - L.l2 * Math.cos(phi0)) / L.l1, -0.26, 0.42), cosT = Math.sqrt(1 - sinT * sinT);
    const cosP = THREE.MathUtils.clamp((dy - L.l1 * sinT) / L.l2, -1, 1), sinP = Math.sqrt(1 - cosP * cosP);
    const dir = new THREE.Vector3(sx * 0.24, -sinT, cosT).normalize();
    const K = A.clone().addScaledVector(dir, L.l1);
    const F = K.clone().add(new THREE.Vector3(-sx * 0.035, -L.l2 * cosP, L.l2 * sinP));
    twoBone(up, kn, ft, F, new THREE.Vector3(0, 0.4, 1));
    const f = W(ft), tv = L.toe - L.ankle - raise;
    aim(ft, toe, f.clone().add(new THREE.Vector3(sx * 0.02, tv, Math.sqrt(Math.max(1e-4, reach * reach - tv * tv)))));
    knees[s] = { A, K: W(kn), sx };
  }
  // ידיים: כפות הידיים על הירכיים, האצבעות קדימה, המרפקים קצת לצדדים ואחורה
  for (const s of ['Left', 'Right']) {
    const { A, K, sx } = knees[s];
    const hand = B(s + 'Hand'), fb = B(s + 'FingerBase'), f1 = B(s + 'HandFinger1'), th = B(s === 'Left' ? 'LThumb' : 'RThumb');
    const along = K.clone().sub(A).normalize();
    const wrist = A.clone().lerp(K, 0.3).add(new THREE.Vector3(sx * 0.035, 0.105, 0));
    twoBone(B(s + 'Arm'), B(s + 'ForeArm'), hand, wrist, new THREE.Vector3(sx * 0.6, -0.3, -0.8));
    const h = along.clone().add(new THREE.Vector3(-sx * 0.12, -0.3, 0)).normalize();
    aim(hand, fb, W(hand).add(h));
    // הכף פונה למטה, אל הירך
    const want = new THREE.Vector3(0, -1, 0); want.addScaledVector(h, -want.dot(h)).normalize();
    const pw = st.palm[s].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    pw.addScaledVector(h, -pw.dot(h)).normalize();
    turn(hand, h, THREE.MathUtils.radToDeg(Math.atan2(new THREE.Vector3().crossVectors(pw, want).dot(h), pw.dot(want))));
    const P = st.palm[s].clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
    const curl = (bone, deg) => { if (!bone) return; const d = new THREE.Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
      turn(bone, new THREE.Vector3().crossVectors(d, P), deg); };
    curl(fb, 6); curl(f1, 22); curl(th, 10);
  }
  root.updateMatrixWorld(true);
  return root;
}

// מדידות בתנוחה: התחתית של הישבן (על המושב, עד depth קדימה מהגב), הנקודה האחורית ביותר, התחתית של הנעליים
function measure(root, skinVerts, depth) {
  const hips = root.getObjectByName('Hips').getWorldPosition(V());
  const verts = skinVerts(root);
  let back = Infinity, shoe = Infinity;
  for (const { P, kind } of verts) for (let i = 0; i < P.length; i += 3) {
    if (P[i + 1] > hips.y - 0.3) back = Math.min(back, P[i + 2]);
    if (kind === 'shoes') shoe = Math.min(shoe, P[i + 1]);
  }
  let butt = Infinity;
  for (const { P, kind } of verts) {
    if (kind !== 'cloth' && kind !== 'skin') continue;
    for (let i = 0; i < P.length; i += 3) if (P[i + 2] < Math.min(back + depth, hips.z + 0.1) && Math.abs(P[i] - hips.x) < 0.3 && P[i + 1] < hips.y + 0.05 && P[i + 1] > hips.y - 0.22) butt = Math.min(butt, P[i + 1]);
  }
  return { hips, back, shoe, butt };
}

// בונה את היושב לדגם אחד: seatH — גובה המושב מעל הקרקע, depth — עומק המושב מהקיר.
// מחזיר את התנוחה (לאפייה ולקימה), ומדידות לבדיקה
export function buildSitter(gltf, skinVerts, seatH, depth) {
  const need = ['Hips', 'LowerBack', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
    'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftFingerBase', 'RightArm', 'RightForeArm', 'RightHand', 'RightFingerBase'];
  for (const n of need) if (!gltf.scene.getObjectByName(n)) return null;
  const st = standing(gltf, skinVerts);
  // כמה סבבים: מתקנים את גובה האגן (הישבן בדיוק על המושב), את גובה הקרסוליים (הנעליים בדיוק על הקרקע),
  // ואת הנטייה של הגב: הברכיים צריכות להיות קצת לפני שפת המושב. מי שהירכיים שלו קצרות (רוב הדגמים) —
  // אם הגב צמוד לקיר, הברכיים נשארות מעל המושב, והשוקיים יוצאות מתחת לשפה ונראות כמו רגליים תלויות.
  // אז הגב נשען קצת אחורה, והאגן מתקדם על המושב (כמו שיושבים באמת על ספסל עמוק)
  const kneeAt = depth + 0.07;
  let hipY = seatH + 0.1, fix = 0, lean = 0, root, m;
  for (let k = 0; k < 9; k++) {
    root = pose(gltf, st, hipY, fix, lean);
    m = measure(root, skinVerts, depth);
    if (k < 8) {
      hipY += seatH - m.butt; fix -= m.shoe;
      if (k < 6) {
        const kz = (root.getObjectByName('LeftLeg').getWorldPosition(V()).z + root.getObjectByName('RightLeg').getWorldPosition(V()).z) / 2 - m.back;
        lean = THREE.MathUtils.clamp(lean + THREE.MathUtils.radToDeg(Math.atan((kneeAt - kz) / 0.5)), 0, 18);
      }
    }
  }
  const origin = new THREE.Vector3(m.hips.x, m.butt - seatH, m.back);
  const quats = new Map();
  root.traverse(o => { if (o.isBone) quats.set(o.name, o.quaternion.clone()); });
  const W = n => root.getObjectByName(n).getWorldPosition(V()).sub(origin);
  const feet = W('LeftFoot').add(W('RightFoot')).multiplyScalar(0.5).setY(0);
  return { root, origin, quats, hip: W('Hips'), feet, ankles: [W('LeftFoot'), W('RightFoot')], err: { ground: m.butt - seatH, shoe: m.shoe - origin.y }, lean, knee: (W('LeftLeg').z + W('RightLeg').z) / 2 };
}
