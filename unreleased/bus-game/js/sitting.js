// אדם יושב על הספסל בסככה. כמו הנהג (driver.js): מזיזים את העצמות של השלד לתנוחת ישיבה עם IK,
// ואופים פעם אחת לרשת רגילה לכל דגם — היושבים מצוירים בקבוצה (InstancedMesh) כמו העומדים, בלי שלד לכל אדם.
// מערכת הצירים של היושב: ‎+Z קדימה (אל הכביש), ‎+Y למעלה. הראשית: ‎x — מרכז האגן, ‎y — הקרקע (המרצפות),
// ‎z — הנקודה האחורית ביותר של הגוף (הגב או הישבן, שנוגעים בקיר הרפפות).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { aim, turn, twoBone } from './driver.js';

const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
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
// lean — כמה מעלות הגב נשען אחורה (מעבר לבסיס), כדי שהאגן יתקדם על המושב.
// opt (לפי תנוחת הידיים): flex — הגב העליון מתכופף קדימה (הכתפיים קדימה ולמטה, כך שהמרפקים כפופים),
// roll + side — נטייה קלה הצידה אל היד שעל הספסל, head — הראש מסתכל למטה
function pose(gltf, st, hipY, fix, lean = 0, opt = {}) {
  const root = idleRoot(gltf), B = n => root.getObjectByName(n), W = o => o.getWorldPosition(V());
  const hips = B('Hips');
  root.position.sub(W(hips).setY(W(hips).y - hipY)); root.updateMatrixWorld(true);
  // הגב כמעט זקוף, נשען מעט לאחור אל הקיר; הראש קצת למטה
  turn(B('LowerBack'), X, -6 - lean);
  if (opt.roll && opt.side) turn(B('LowerBack'), Z, -(Math.sign(W(B(opt.side + 'UpLeg')).x - W(hips).x) || 1) * opt.roll);
  if (opt.flex) { if (B('Spine')) turn(B('Spine'), X, opt.flex * 0.5); if (B('Spine1')) turn(B('Spine1'), X, opt.flex * 0.5); }
  // הכתפיים רפויות: עצם הבריח קצת למטה
  for (const s of ['Left', 'Right']) { const sh = B(s + 'Shoulder'); if (sh) turn(sh, Z, -(Math.sign(W(sh).x - W(hips).x) || 1) * 3); }
  turn(B('Head'), X, 4 + lean * 0.7 + (opt.head || 0));
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
    const wrist = A.clone().lerp(K, 0.3).add(new THREE.Vector3(sx * 0.035, 0.18, 0));
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

// ---------- הידיים והזרועות: שלוש תנוחות, לפי הדגם (POSE_OF ב-actors.js)
//  'phone' — האמות על הירכיים, ושתי הידיים מחזיקות טלפון מעל הברכיים (מלבן כהה 7×15 ס"מ, בלי מסך)
//  'lap'   — הידיים בחיק, אחת על השנייה, באמצע הירכיים (לא ליד המפשעה)
//  'bench' — יד אחת על הספסל ליד הירך, והשנייה על הירך שלה
// בכולן המרפקים כפופים והכתפיים רפויות. האצבעות סגורות (בשלד יש עצם אחת לכל ארבע האצבעות, והן פרושות —
// מצמצמים אותה לרוחב) וכפופות מעט. כל קודקוד של היד, האמה והטלפון נבדק מול הירכיים, הגוף והספסל.
const SIDES = ['Left', 'Right'];
const HAND_RE = { Left: /^(LeftHand|LeftFingerBase|LeftHandFinger1|LThumb)$/, Right: /^(RightHand|RightFingerBase|RightHandFinger1|RThumb)$/ };
const FORE_RE = { Left: /^LeftForeArm$/, Right: /^RightForeArm$/ };
const LEG_RE = { Left: /^Left(UpLeg|Leg)$/, Right: /^Right(UpLeg|Leg)$/ };
const TORSO_RE = /^(Hips|LowerBack|Spine|Spine1|LHipJoint|RHipJoint)$/;
export const ARM_RE = /(Shoulder|Arm|Hand|Finger|Thumb)/;
export const PHONE = { w: 0.07, l: 0.15, t: 0.008 };
const DOMS = new WeakMap(), PARTS = new WeakMap();
// לכל קודקוד: העצם הדומיננטית (לפי משקלי השלד), פעם אחת לכל רשת
function domBone(o, i) {
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
  let bi = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; bi = si.getComponent(i, j); } }
  return o.skeleton.bones[bi].name;
}
export function doms(o) {
  let d = DOMS.get(o.geometry);
  if (!d) { d = []; const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i++) d.push(domBone(o, i)); DOMS.set(o.geometry, d); }
  return d;
}
// המיקום של קודקודים בודדים (אותו חישוב כמו skinVerts ב-actors.js, רק למה שצריך)
function skinner(o) {
  o.skeleton.update();
  const bm = o.skeleton.boneMatrices, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, pos = o.geometry.attributes.position;
  const full = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, o.bindMatrixInverse), acc = new THREE.Matrix4(), M = new THREE.Matrix4(), memo = new Map();
  return i => { let v = memo.get(i); if (v) return v;
    const e = acc.elements; e.fill(0);
    for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (!w) continue; const b = si.getComponent(i, j) * 16; for (let k = 0; k < 16; k++) e[k] += w * bm[b + k]; }
    M.multiplyMatrices(full, acc).multiply(o.bindMatrix);
    v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M); memo.set(i, v); return v; };
}
// משולשים ונקודות בתנוחה הנוכחית: ידיים ואמות (נקודות), ירכיים וגוף (משולשים עם נורמל החוצה), ורשת חיפוש
function snap(root, skinVerts) {
  if (!root.userData.hs) root.userData.hs = skinVerts(root).filter(({ o, kind }) => o.isSkinnedMesh && (kind === 'cloth' || kind === 'skin')).map(({ o }) => o);
  root.updateMatrixWorld(true);
  const S = { hand: { Left: [], Right: [] }, kind: { Left: [], Right: [] }, fore: { Left: [], Right: [] }, tris: [], norms: [], part: [] };
  for (const o of root.userData.hs) {
    let L = PARTS.get(o.geometry);
    if (!L) {
      const d = doms(o), n = d.length, idx = o.geometry.index, nt = idx ? idx.count / 3 : n / 3, vi = (t, k) => idx ? idx.getX(t * 3 + k) : t * 3 + k;
      L = { hand: {}, fore: {}, tris: [] };
      for (const s of SIDES) { L.hand[s] = []; L.fore[s] = []; for (let i = 0; i < n; i++) { if (HAND_RE[s].test(d[i])) L.hand[s].push([i, d[i]]); else if (FORE_RE[s].test(d[i])) L.fore[s].push(i); } }
      for (let t = 0; t < nt; t++) {
        const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2), q = [d[a], d[b], d[c]];
        const part = q.some(x => LEG_RE.Left.test(x)) ? 'Left' : q.some(x => LEG_RE.Right.test(x)) ? 'Right' : q.every(x => TORSO_RE.test(x)) ? 'torso' : null;
        if (part) L.tris.push([a, b, c, part]);
      }
      PARTS.set(o.geometry, L);
    }
    const at = skinner(o);
    for (const s of SIDES) { for (const [i, k] of L.hand[s]) { S.hand[s].push(at(i)); S.kind[s].push(k); } for (const i of L.fore[s]) S.fore[s].push(at(i)); }
    for (const [a, b, c, part] of L.tris) { S.tris.push(new THREE.Triangle(at(a), at(b), at(c))); S.part.push(part); }
  }
  // הנורמל החוצה: מציר הירך (מפרק הירך ← הברך), ובגוף — מהקו שבין האגן לצוואר
  const W = n => root.getObjectByName(n).getWorldPosition(V());
  const axes = { Left: [W('LeftUpLeg'), W('LeftLeg')], Right: [W('RightUpLeg'), W('RightLeg')], torso: [W('Hips'), W('Neck')] };
  const nn = V(), cc = V(), seg = new THREE.Line3(), cp = V(), vote = { Left: 0, Right: 0, torso: 0 };
  S.norms = S.tris.map((T, i) => { T.getNormal(nn); T.getMidpoint(cc); const [a, b] = axes[S.part[i]]; seg.set(a, b); seg.closestPointToPoint(cc, true, cp); vote[S.part[i]] += Math.sign(nn.dot(cc.clone().sub(cp))); return nn.clone(); });
  S.norms.forEach((v, i) => { if (vote[S.part[i]] < 0) v.negate(); });
  // רשת חיפוש: תאים של 4 ס"מ
  const C = 0.04, grid = new Map(), key = (x, y, z) => x * 73856093 ^ y * 19349663 ^ z * 83492791;
  S.tris.forEach((T, t) => {
    const lo = [Math.min(T.a.x, T.b.x, T.c.x), Math.min(T.a.y, T.b.y, T.c.y), Math.min(T.a.z, T.b.z, T.c.z)].map(v => Math.floor(v / C));
    const hi = [Math.max(T.a.x, T.b.x, T.c.x), Math.max(T.a.y, T.b.y, T.c.y), Math.max(T.a.z, T.b.z, T.c.z)].map(v => Math.floor(v / C));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = key(x, y, z); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(t); }
  });
  const best = V();
  // מרחק מסומן מהירכיים ומהגוף (שלילי = בפנים). רחוק מכל משולש — Infinity
  S.sd = p => {
    const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C), cz = Math.floor(p.z / C), seen = new Set();
    let bd = Infinity, bi = -1;
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) for (let z = cz - 2; z <= cz + 2; z++) {
      const a = grid.get(key(x, y, z)); if (!a) continue;
      for (const t of a) { if (seen.has(t)) continue; seen.add(t); S.tris[t].closestPointToPoint(p, cp); const d = cp.distanceToSquared(p); if (d < bd) { bd = d; bi = t; best.copy(cp); } }
    }
    S.lastPart = bi >= 0 ? S.part[bi] : null;
    if (bi < 0 || bd > 0.06 * 0.06) return Infinity;      // רחוק (יותר מ-6 ס"מ) — לא נוגע; הסימן שם לא אמין
    return Math.sign(p.clone().sub(best).dot(S.norms[bi]) || 1) * Math.sqrt(bd);
  };
  return S;
}
// מצב הכיוונים של כף היד מהרשת (כמו קודם): נורמל כף היד ב-PCA, כיוון האצבעות אל מרכז קצותיהן
function handAxes(root, S, st) {
  const out = {};
  for (const s of SIDES) {
    const hand = root.getObjectByName(s + 'Hand'), fb = root.getObjectByName(s + 'FingerBase');
    let Fl = fb.position.clone().normalize(), Pl = st.palm[s].clone().addScaledVector(Fl, -st.palm[s].dot(Fl)).normalize();
    const inv = hand.matrixWorld.clone().invert();
    const loc = S.hand[s].map((p, i) => [p.clone().applyMatrix4(inv), S.kind[s][i]]);
    const palm = loc.filter(([, k]) => /(Hand|FingerBase)$/.test(k)).map(([p]) => p), tips = loc.filter(([, k]) => /Finger1$/.test(k)).map(([p]) => p);
    if (palm.length >= 8 && tips.length) {
      const m = palm.reduce((a, p) => a.add(p), V()).divideScalar(palm.length), C3 = new Array(9).fill(0);
      for (const p of palm) { const d = [p.x - m.x, p.y - m.y, p.z - m.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C3[i * 3 + j] += d[i] * d[j]; }
      const tr = C3[0] + C3[4] + C3[8]; let v = new THREE.Vector3(1, 0.3, 0.2);
      for (let it = 0; it < 80; it++) v = new THREE.Vector3((tr - C3[0]) * v.x - C3[1] * v.y - C3[2] * v.z, -C3[3] * v.x + (tr - C3[4]) * v.y - C3[5] * v.z, -C3[6] * v.x - C3[7] * v.y + (tr - C3[8]) * v.z).normalize();
      if (v.dot(Pl) < 0) v.negate();
      if (v.dot(Pl) > 0.75) { const tc = tips.reduce((a, p) => a.add(p), V()).divideScalar(tips.length).sub(m); Fl = tc.addScaledVector(v, -tc.dot(v)).normalize(); Pl = v; }
    }
    out[s] = { Fl, Pl };
  }
  return out;
}
// סיבוב בעולם שבו כיוון האצבעות הוא f וכף היד פונה אל P
function handQuat(ax, f, P) {
  const Pw = P.clone().normalize(), fw = f.clone().addScaledVector(Pw, -f.dot(Pw)).normalize();
  const Ml = new THREE.Matrix4().makeBasis(ax.Fl, ax.Pl, ax.Fl.clone().cross(ax.Pl)), Mw = new THREE.Matrix4().makeBasis(fw, Pw, fw.clone().cross(Pw));
  return new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.transpose()));
}
const angleAt = (a, b, c) => THREE.MathUtils.radToDeg(a.clone().sub(b).angleTo(c.clone().sub(b)));

// pose: 'phone' | 'lap' | 'bench'; side — הצד של היד שעל הספסל / היד שלמטה בחיק
function placeArms(root, st, skinVerts, m, depth, pose, side) {
  const B = n => root.getObjectByName(n), W = n => B(n).getWorldPosition(V()), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1);
  const hips = W('Hips'), sxOf = s => Math.sign(W(s + 'UpLeg').x - hips.x) || (s === 'Left' ? 1 : -1);
  const benchY = m.butt, z0 = m.back - 0.05, z1 = m.back + depth + 0.04;
  const sdBench = p => (p.z > z0 && p.z < z1) ? p.y - benchY : Infinity;
  let S = snap(root, skinVerts);
  const ax = handAxes(root, S, st);
  // פני הירך: הגובה הגבוה ביותר של משולשי הירך ליד (x, z), ורוחב הירך (הקצה החיצוני) בעומק z
  const thighTop = (x, z, r = 0.03) => { let h = -Infinity; S.tris.forEach((T, i) => { if (S.part[i] === 'torso') return; for (const p of [T.a, T.b, T.c]) if (Math.hypot(p.x - x, p.z - z) < r) h = Math.max(h, p.y); }); return h; };
  const thighOuter = (s, z) => { const sx = sxOf(s); let o = 0; S.tris.forEach((T, i) => { if (S.part[i] !== s) return; for (const p of [T.a, T.b, T.c]) if (Math.abs(p.z - z) < 0.04) o = Math.max(o, sx * (p.x - hips.x)); }); return o; };
  // המפשעה: בין הירכיים, הנקודה הקדמית של הגוף בגובה הירכיים
  const crotch = new THREE.Vector3(hips.x, 0, (W('LeftUpLeg').z + W('RightUpLeg').z) / 2 + 0.03);
  const P = {};       // לכל צד: מטרה, כיוון הרמה, כיוון קירוב לכתף, סיבוב כף היד, pole של המרפק, מגע
  for (const s of SIDES) P[s] = { lift: 0, back: 0, out: 0, curl: 14, thumb: 8, contact: true };
  let phone = null;
  const lat = s => new THREE.Vector3(sxOf(s), 0, 0);
  if (pose === 'phone') {
    // הטלפון: מעל הברכיים, נוטה 40° אל הפנים. הידיים מתחתיו משני הצדדים, כפות הידיים אליו, והאמות על הירכיים
    const t = D(32), u = new THREE.Vector3(0, Math.sin(t), Math.cos(t)), n = new THREE.Vector3(0, Math.cos(t), -Math.sin(t));
    const zc = crotch.z + 0.2, top = Math.max(thighTop(W('LeftUpLeg').x, zc), thighTop(W('RightUpLeg').x, zc));
    phone = { c: new THREE.Vector3(hips.x, top + 0.24, crotch.z + 0.2), u, n, lift: 0, back: 0, fwd: 0 };
    for (const s of SIDES) {
      const inw = lat(s).negate();
      Object.assign(P[s], { contact: false, curl: 8, thumb: 12,
        Q: handQuat(ax[s], u.clone().addScaledVector(inw, 0.3), n.clone().addScaledVector(inw, 0.3)),
        base: () => phone.c.clone().addScaledVector(n, -0.025).addScaledVector(lat(s), 0.05).addScaledVector(u, -0.03 - 0.06),
        pole: () => new THREE.Vector3(sxOf(s) * (0.6 + P[s].out), -0.6, -0.6 + P[s].out * 0.2) });
    }
  } else if (pose === 'lap') {
    // בחיק: היד של side למטה, האצבעות אל הצד השני ומעט קדימה; השנייה עליה. מרכזי כפות הידיים 15+ ס"מ מהמפשעה
    const s0 = side, s1 = side === 'Left' ? 'Right' : 'Left', zc = crotch.z + 0.23;
    const top = Math.max(thighTop(hips.x + 0.05, zc + 0.02), thighTop(hips.x - 0.05, zc + 0.02));
    for (const [s, k] of [[s0, 0], [s1, 1]]) {
      const f = lat(s).negate().addScaledVector(fwd, k ? 0.25 : 0.45).normalize(), down = up.clone().negate().addScaledVector(fwd, 0.15);
      const pc = new THREE.Vector3(hips.x + sxOf(s0) * (k ? 0.005 : 0.03), top + 0.03 + k * 0.03, zc + (k ? 0.035 : 0));
      Object.assign(P[s], { Q: handQuat(ax[s], f, down), base: () => pc.clone().addScaledVector(f, -0.065), top: !!k,
        pole: () => new THREE.Vector3(sxOf(s) * (0.7 + P[s].out), -0.5, -0.5) });
    }
    P.under = s0; P.over = s1;
  } else {
    // יד אחת (side) על הספסל ליד הירך, אצבעות קדימה ומעט החוצה; השנייה על הירך שלה, אחרי אמצע הירך
    const sb = side, so = side === 'Left' ? 'Right' : 'Left', zb = hips.z + 0.03, ob = thighOuter(sb, zb);
    const pcB = new THREE.Vector3(hips.x + sxOf(sb) * (ob + 0.065), benchY + 0.025, zb);
    const fB = fwd.clone().addScaledVector(lat(sb), 0.25).normalize();
    Object.assign(P[sb], { Q: handQuat(ax[sb], fB, up.clone().negate()), base: () => pcB.clone().addScaledVector(fB, -0.065),
      pole: () => new THREE.Vector3(sxOf(sb) * (0.8 + P[sb].out), -0.1, -0.9) });
    const A = W(so + 'UpLeg'), K = W(so + 'Leg'), a = K.clone().sub(A).normalize();
    const zt = Math.max(crotch.z + 0.17, A.z + 0.42 * A.distanceTo(K)), xt = A.x + a.x / a.z * (zt - A.z);
    const pcT = new THREE.Vector3(xt, thighTop(xt, zt) + 0.03, zt), fT = a.clone().setY(0).addScaledVector(lat(so), -0.12).normalize();
    Object.assign(P[so], { Q: handQuat(ax[so], fT, up.clone().negate().addScaledVector(lat(so), 0.15)), base: () => pcT.clone().addScaledVector(fT, -0.065),
      pole: () => new THREE.Vector3(sxOf(so) * (0.7 + P[so].out), -0.4, -0.6) });
  }
  // הבסיס של עצמות האצבעות (לפני הצמצום והכיפוף)
  const base = new Map();
  for (const s of SIDES) for (const n of [s + 'FingerBase', s + 'HandFinger1', s === 'Left' ? 'LThumb' : 'RThumb']) { const b = B(n); if (b) base.set(n, [b.quaternion.clone(), b.scale.clone()]); }
  const target = s => P[s].base().addScaledVector(up, P[s].lift + (phone ? phone.lift : 0)).addScaledVector(B(s + 'Arm').getWorldPosition(V()).sub(P[s].base()).normalize(), P[s].back + (phone ? phone.back : 0));
  const apply = () => {
    for (const s of SIDES) {
      const Q = P[s], hand = B(s + 'Hand');
      Q.T = target(s);
      twoBone(B(s + 'Arm'), B(s + 'ForeArm'), hand, Q.T, Q.pole());
      const pq = hand.parent.getWorldQuaternion(new THREE.Quaternion());
      hand.quaternion.copy(pq.invert().multiply(Q.Q)); hand.updateWorldMatrix(false, true);
      for (const [n, [q, sc]] of base) if (n.startsWith(s) || n === (s === 'Left' ? 'LThumb' : 'RThumb')) { const b = B(n); b.quaternion.copy(q); b.scale.copy(sc); b.updateWorldMatrix(false, true); }
      const fb = B(s + 'FingerBase'), f1 = B(s + 'HandFinger1'), th = B(s === 'Left' ? 'LThumb' : 'RThumb');
      const hq = hand.getWorldQuaternion(new THREE.Quaternion()), fw = ax[s].Fl.clone().applyQuaternion(hq), pw = ax[s].Pl.clone().applyQuaternion(hq);
      // האצבעות סגורות: מצמצמים את עצם האצבעות לרוחב כף היד (הציר המקומי שהכי קרוב לרוחב)
      if (f1) {
        const latL = fw.clone().cross(pw).applyQuaternion(f1.getWorldQuaternion(new THREE.Quaternion()).invert());
        const k = Math.abs(latL.x) >= Math.abs(latL.z) ? 'x' : 'z';
        f1.scale[k] *= 0.45; f1.updateWorldMatrix(false, true);
      }
      // כיפוף רפוי אל כף היד
      const axis = fw.clone().cross(pw);
      if (fb) turn(fb, axis, Q.curl * 0.3);
      if (f1) turn(f1, axis, Q.curl * 0.7);
      if (th) turn(th, fw, (sxOf(s) > 0 ? -1 : 1) * Q.thumb);
    }
    root.updateMatrixWorld(true);
    if (phone) {
      // הטלפון שוכב על כפות הידיים: הגב שלו 3 מ"מ מעל הנקודה הגבוהה של כפות הידיים מתחתיו
      const pc = B('LeftHand').getWorldPosition(V()).add(B('RightHand').getWorldPosition(V())).multiplyScalar(0.5);
      const lt = phone.u.clone().cross(phone.n);
      let h = -Infinity; const S2 = snap(root, skinVerts);
      for (const s of SIDES) S2.hand[s].forEach((p, i) => { if (/Thumb$/.test(S2.kind[s][i])) return; const q = p.clone().sub(pc); if (Math.abs(q.dot(lt)) < PHONE.w / 2 + 0.005) h = Math.max(h, q.dot(phone.n)); });
      phone.pos = pc.clone().addScaledVector(phone.u, 0.06).addScaledVector(phone.n, (isFinite(h) ? h : 0) + PHONE.t / 2 + 0.003);
      return S2;
    }
    return null;
  };
  const phonePts = () => { const lt = phone.u.clone().cross(phone.n), out = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 6; j++) for (const k of [-1, 1]) out.push(phone.pos.clone().addScaledVector(lt, (i / 4 - 0.5) * PHONE.w).addScaledVector(phone.u, (j / 6 - 0.5) * PHONE.l).addScaledVector(phone.n, k * PHONE.t / 2));
    return out; };
  // מדידה: לכל צד — היד (מול הירכיים, הגוף והספסל; היד העליונה בחיק — גם מול היד שמתחתיה), האמה, ההחטאה של ה-IK
  const measureArms = (S) => {
    const R = {};
    for (const s of SIDES) {
      const hmin = (p, t) => { const d = S.sd(p), b = sdBench(p); if (d < 0.003) { if (S.lastPart === 'torso') { if (t) R.torso = true; else R.foreTorso = true; } else if (!t) R.foreThigh = true; } return Math.min(d, b); };
      const hd = S.hand[s].map(p => hmin(p, true));
      if (P[s].top) {      // היד העליונה: מול הקודקודים של היד שמתחת (עד 1.2 ס"מ לרוחב)
        const under = S.hand[P.under];
        S.hand[s].forEach((p, i) => { let g = Infinity; for (const q of under) if (Math.hypot(p.x - q.x, p.z - q.z) < 0.012) g = Math.min(g, p.y - q.y); hd[i] = Math.min(hd[i], g); });
      }
      const fd = S.fore[s].map(p => hmin(p, false));
      const hand = B(s + 'Hand').getWorldPosition(V());
      R[s] = { hand: Math.min(...hd), handIn: hd.filter(d => d < 0).length, fore: Math.min(...fd), foreIn: fd.filter(d => d < 0).length,
        miss: hand.distanceTo(P[s].T), elbow: angleAt(W(s + 'Arm'), W(s + 'ForeArm'), hand),
        crotch: Math.min(...S.hand[s].map(p => Math.hypot(p.x - crotch.x, p.z - crotch.z))) };
    }
    if (phone) { const pd = phonePts().map(p => { const d = S.sd(p); if (d < 0.003 && S.lastPart === 'torso') R.torso = true; return Math.min(d, sdBench(p)); }); R.phone = { min: Math.min(...pd), inside: pd.filter(d => d < 0).length }; }
    return R;
  };
  let R;
  for (let it = 0; it < 40; it++) {
    const S2 = apply(); S = S2 || snap(root, skinVerts); R = measureArms(S);
    let done = true;
    for (const s of SIDES) {
      const r = R[s], Q = P[s];
      if (r.miss > 0.004 && (phone ? phone.back : Q.back) < 0.25) { if (phone) phone.back += r.miss / 2; else Q.back += r.miss; done = false; continue; }
      // האמה נכנסת לירך: המרפק החוצה (ובטלפון גם קצת למעלה) — לא מרימים את כף היד, זה רק מוריד את המרפק עוד
      if (r.fore < 0.003 && phone) { if (R.foreTorso) { if (Q.out < 1) Q.out += 0.15; else if (phone.fwd < 0.12) { phone.c.z += 0.01; phone.fwd += 0.01; } } if (R.foreThigh) phone.lift += 0.004; done = false; }
      else if (r.fore < 0.003 && Q.out < 1.5) { Q.out = Math.min(1.5, Q.out + 0.1); done = false; }
      if (Q.contact) { const e = 0.004 - r.hand; if (Math.abs(e) > 0.0015 && isFinite(r.hand)) { Q.lift += THREE.MathUtils.clamp(e, -0.02, 0.02); done = false; } }
      else if (r.hand < 0.003) { if (phone) { if (!R.torso) phone.lift += Math.min(0.02, 0.004 - r.hand); } else Q.lift += 0.004 - r.hand; done = false; }
    }
    if (phone && R.phone.min < 0.003 && !R.torso) { phone.lift += Math.min(0.02, 0.004 - R.phone.min); done = false; }
    // טלפון: מה שנוגע בגוף (הבטן) — הטלפון והידיים זזים קדימה, לא למעלה
    if (phone && R.torso && phone.fwd < 0.12) { phone.c.z += 0.01; phone.fwd += 0.01; done = false; }
    if (done) break;
  }
  const res = { pose, side };
  for (const s of SIDES) {
    const hq = B(s + 'Hand').getWorldQuaternion(new THREE.Quaternion()), lt = ax[s].Fl.clone().applyQuaternion(hq).cross(ax[s].Pl.clone().applyQuaternion(hq)), h0 = B(s + 'Hand').getWorldPosition(V());
    const ws = S.hand[s].filter((p, i) => /Finger1$/.test(S.kind[s][i])).map(p => p.clone().sub(h0).dot(lt)); P[s].width = +((Math.max(...ws) - Math.min(...ws)) * 100).toFixed(1);
  }
  for (const s of SIDES) { const r = R[s]; res[s] = { width: P[s].width, hand: +(r.hand * 1000).toFixed(1), handIn: r.handIn, fore: +(r.fore * 1000).toFixed(1), foreIn: r.foreIn, miss: +(r.miss * 1000).toFixed(1), elbow: Math.round(r.elbow), crotch: +(r.crotch * 100).toFixed(1) }; }
  if (phone) res.phone = { min: +(R.phone.min * 1000).toFixed(1), inside: R.phone.inside, lift: +phone.lift.toFixed(3), back: +phone.back.toFixed(3), c: phone.c.toArray().map(v => +v.toFixed(3)), hips: hips.toArray().map(v => +v.toFixed(3)), pos: phone.pos, u: phone.u, n: phone.n };
  const scales = new Map(); root.traverse(o => { if (o.isBone && (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1)) scales.set(o.name, o.scale.clone()); });
  res.scales = scales;
  return res;
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
  for (const { o, P, kind } of verts) {
    if (kind !== 'cloth' && kind !== 'skin') continue;
    const dm = o.isSkinnedMesh ? doms(o) : null;      // בלי הידיים (יד על הספסל ליד הירך)
    for (let i = 0; i < P.length; i += 3) if (!(dm && ARM_RE.test(dm[i / 3])) && P[i + 2] < Math.min(back + depth, hips.z + 0.1) && Math.abs(P[i] - hips.x) < 0.3 && P[i + 1] < hips.y + 0.05 && P[i + 1] > hips.y - 0.22) butt = Math.min(butt, P[i + 1]);
  }
  return { hips, back, shoe, butt };
}

// בונה את היושב לדגם אחד: seatH — גובה המושב מעל הקרקע, depth — עומק המושב מהקיר.
// מחזיר את התנוחה (לאפייה ולקימה), ומדידות לבדיקה
export function buildSitter(gltf, skinVerts, seatH, depth, armPose = 'lap', side = 'Left') {
  const opt = { phone: { flex: 10, head: 16 }, lap: { flex: 12, head: 8 }, bench: { flex: 8, roll: 7, side } }[armPose] || {};
  const need = ['Hips', 'LowerBack', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
    'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftFingerBase', 'RightArm', 'RightForeArm', 'RightHand', 'RightFingerBase'];
  for (const n of need) if (!gltf.scene.getObjectByName(n)) return null;
  const st = standing(gltf, skinVerts);
  // כמה סבבים: מתקנים את גובה האגן (הישבן בדיוק על המושב), את גובה הקרסוליים (הנעליים בדיוק על הקרקע),
  // ואת הנטייה של הגב: הברכיים צריכות להיות קצת לפני שפת המושב. מי שהירכיים שלו קצרות (רוב הדגמים) —
  // אם הגב צמוד לקיר, הברכיים נשארות מעל המושב, והשוקיים יוצאות מתחת לשפה ונראות כמו רגליים תלויות.
  // אז הגב נשען קצת אחורה, והאגן מתקדם על המושב (כמו שיושבים באמת על ספסל עמוק)
  const kneeAt = depth + 0.07;
  let hipY, fix, lean, root, m, hands;
  for (let tries = 0; tries < 1; tries++) {
    hipY = seatH + 0.1; fix = 0; lean = 0;
    for (let k = 0; k < 9; k++) {
      root = pose(gltf, st, hipY, fix, lean, opt);
      m = measure(root, skinVerts, depth);
      if (k < 8) {
        hipY += seatH - m.butt; fix -= m.shoe;
        if (k < 6) {
          const kz = (root.getObjectByName('LeftLeg').getWorldPosition(V()).z + root.getObjectByName('RightLeg').getWorldPosition(V()).z) / 2 - m.back;
          lean = THREE.MathUtils.clamp(lean + THREE.MathUtils.radToDeg(Math.atan((kneeAt - kz) / 0.5)), 0, 20);
        }
      }
    }
    // הידיים והזרועות (placeArms), בסוף — כשהאגן והרגליים כבר במקום
    hands = placeArms(root, st, skinVerts, m, depth, armPose, side);
  }
  hands.flex = opt.flex;
  m = measure(root, skinVerts, depth);
  const origin = new THREE.Vector3(m.hips.x, m.butt - seatH, m.back);
  const quats = new Map();
  root.traverse(o => { if (o.isBone) quats.set(o.name, o.quaternion.clone()); });
  const W = n => root.getObjectByName(n).getWorldPosition(V()).sub(origin);
  const feet = W('LeftFoot').add(W('RightFoot')).multiplyScalar(0.5).setY(0);
  // הטלפון (אם יש): מטריצה ביחס לראשית של היושב — מצויר בקבוצה ב-actors.js
  let phone = null;
  if (hands.phone) { const ph = hands.phone, lt = ph.u.clone().cross(ph.n); phone = new THREE.Matrix4().makeBasis(lt, ph.n, ph.u).setPosition(ph.pos.clone().sub(origin)); delete hands.phone.pos; delete hands.phone.u; delete hands.phone.n; }
  const scales = hands.scales; delete hands.scales;
  return { root, origin, quats, scales, phone, hip: W('Hips'), feet, ankles: [W('LeftFoot'), W('RightFoot')], err: { ground: m.butt - seatH, shoe: m.shoe - origin.y }, lean, hands, knee: (W('LeftLeg').z + W('RightLeg').z) / 2 };
}
