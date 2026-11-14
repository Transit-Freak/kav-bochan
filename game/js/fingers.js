// אצבעות: בדגמים יש עכשיו לכל יד 15 עצמות אצבע (<Left|Right>Hand<Thumb|Index|Middle|Ring|Pinky><1-3>, מהשלד game_engine
// של MPFB), מעל שלוש העצמות הישנות של cmu_mb: ארבע האצבעות הן ילדות של HandFinger1 והאגודל של LThumb/RThumb. כדי שיד
// תיסגר — צביטה על כרטיס, אחיזה ברצועה או בעמוד, יד רפויה — מסובבים כאן את העצמות האלה (פעם כופפנו קודקודים בקוד).
// התנוחה: root.userData.fingerPose = { Left: { curl: [[שורש, אמצע, קצה] × 4 — מהאצבע המורה עד הזרת, במעלות], add: 0..1
// (כמה האצבעות נצמדות זו לזו), thumb: כיפוף פרקי האגודל במעלות }, Right: {...} }
// poseFingers(root) מחיל אותה על העצמות (skinVerts ב-actors.js קורא לו לפני חישוב הקודקודים).
import * as THREE from 'three';

const FN = ['Index', 'Middle', 'Ring', 'Pinky'];
const INFO = new WeakMap(), SMOOTH = new Map(), BONES = new WeakMap(), POSED = new WeakSet();
const dominant = (g, i) => { let bw = 0, bj = -1; for (let j = 0; j < 4; j++) { const w = g.attributes.skinWeight.getComponent(i, j); if (w > bw) { bw = w; bj = g.attributes.skinIndex.getComponent(i, j); } } return bj; };
// שם העצם הישן שעצם אצבע שייכת אליו (קוד שמחלק קודקודים לפי העצם העיקרי שלהם: יד / אצבעות / אגודל)
const LEG = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)[123]$/;
export function legacyBone(n) { const m = LEG.exec(n || ''); return m ? (m[2] === 'Thumb' ? (m[1] === 'Left' ? 'LThumb' : 'RThumb') : m[1] + 'HandFinger1') : n; }

// מבנה היד של הדגם (פעם אחת לכל שלד ולכל צד), במערכת הצירים של העצם HandFinger1 במנוחה (bind):
// fingers[f] = { m — שורש האצבע, d — הכיוון שלה, L — האורך, seg — אורכי שלושת הפרקים, ax — ציר הכיפוף }, palm — אל כף היד
export function handInfo(root, hand) {
  let sm = null; root.traverse(o => { if (!sm && o.isSkinnedMesh && o.skeleton.bones.some(b => b.name === hand + 'HandIndex1')) sm = o; });
  if (!sm) return null;
  let per = INFO.get(sm.skeleton.boneInverses); if (!per) INFO.set(sm.skeleton.boneInverses, per = {});
  if (per[hand] !== undefined) return per[hand];
  const bs = sm.skeleton.bones, inv = sm.skeleton.boneInverses, ix = n => bs.findIndex(b => b.name === n), Bw = i => new THREE.Matrix4().copy(inv[i]).invert();
  const F1 = hand + 'HandFinger1', TH = hand === 'Left' ? 'LThumb' : 'RThumb', iF = ix(F1), iT = ix(TH);
  const fi = FN.map(n => [1, 2, 3].map(k => ix(hand + 'Hand' + n + k))), ti = [1, 2, 3].map(k => ix(hand + 'HandThumb' + k));
  if (iF < 0 || iT < 0 || fi.flat().some(i => i < 0) || ti.some(i => i < 0)) return (per[hand] = null);
  const toF = inv[iF], WF = Bw(iF), pos = i => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(toF, Bw(i)));
  const rotIn = (i, v) => v.clone().transformDirection(WF).transformDirection(inv[i]);   // כיוון ממערכת F1 למערכת של עצם i (במנוחה)
  // אורך הפרק האחרון: עד הקודקוד הרחוק ביותר שהעצם שלו היא הפרק הזה
  const tipLen = (i3, dir) => { let L = 0; const v = new THREE.Vector3(), M = new THREE.Matrix4(), o0 = pos(i3);
    root.traverse(o => { if (!o.isSkinnedMesh || o.skeleton.boneInverses !== inv || !o.geometry.attributes.skinIndex) return; M.multiplyMatrices(toF, o.bindMatrix); const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) if (dominant(o.geometry, i) === i3) L = Math.max(L, v.fromBufferAttribute(P, i).applyMatrix4(M).sub(o0).dot(dir)); });
    return L; };
  const fingers = fi.map(ids => { const J = ids.map(pos), d3 = new THREE.Vector3(0, 1, 0).transformDirection(new THREE.Matrix4().multiplyMatrices(toF, Bw(ids[2])));
    const seg = [J[1].distanceTo(J[0]), J[2].distanceTo(J[1]), 0]; seg[2] = tipLen(ids[2], d3) || seg[1] * 0.8;
    return { m: J[0], d: J[2].clone().sub(J[0]).normalize(), seg, L: seg[0] + seg[1] + seg[2], ids }; });
  const dm = fingers.reduce((s, f) => s.add(f.d), new THREE.Vector3()).normalize(), across = fingers[3].m.clone().sub(fingers[0].m).normalize();
  const palm = new THREE.Vector3().crossVectors(across, dm).normalize(); if (pos(ti[2]).sub(fingers[0].m).dot(palm) < 0) palm.negate();   // הצד שבו האגודל
  for (const f of fingers) { f.ax = new THREE.Vector3().crossVectors(f.d, palm).normalize(); f.axL = f.ids.map(i => rotIn(i, f.ax)); f.palmL = f.ids.map(i => rotIn(i, palm));
    f.R1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().multiplyMatrices(toF, Bw(f.ids[0]))); }
  // האגודל: שני הפרקים הרחוקים מתכופפים אל האצבע המורה
  const T = ti.map(pos), td = T[2].clone().sub(T[1]).normalize(), g = fingers[0].m.clone().addScaledVector(fingers[0].d, fingers[0].L * 0.5).sub(T[1]); g.addScaledVector(td, -g.dot(td)).normalize();
  const tax = new THREE.Vector3().crossVectors(td, g).normalize();
  // תנוחת המנוחה של כל עצם אצבע יחסית להורה שלה
  const q0 = {}; for (const i of [...fi.flat(), ...ti]) { const pi = bs.indexOf(bs[i].parent); q0[bs[i].name] = new THREE.Quaternion().setFromRotationMatrix(pi >= 0 ? new THREE.Matrix4().multiplyMatrices(inv[pi], Bw(i)) : Bw(i)); }
  const names = fingers.map(f => f.ids.map(i => bs[i].name)), tnames = ti.map(i => bs[i].name);
  return (per[hand] = { F1, TH, fingers, palm, dm, names, tnames, q0, thumb: { seg: [T[1].distanceTo(T[0]), T[2].distanceTo(T[1]), tipLen(ti[2], new THREE.Vector3(0, 1, 0).transformDirection(new THREE.Matrix4().multiplyMatrices(toF, Bw(ti[2])))) || 0.025], axL: ti.map(i => rotIn(i, tax)) } });
}

const _q = new THREE.Quaternion(), _a = new THREE.Quaternion(), _v = new THREE.Vector3();
function handBones(root, hand, info) {
  let per = BONES.get(root); if (!per) BONES.set(root, per = {});
  return per[hand] || (per[hand] = { f: info.names.map(ns => ns.map(n => root.getObjectByName(n))), t: info.tnames.map(n => root.getObjectByName(n)) });
}
// מחיל את root.userData.fingerPose על עצמות האצבעות. יד בלי תנוחה חוזרת לתנוחת המנוחה של הדגם (אם כופפנו אותה קודם)
export function poseFingers(root) {
  const FP = root.userData.fingerPose; if (!FP && !POSED.has(root)) return;
  for (const hand of ['Left', 'Right']) { const info = handInfo(root, hand); if (!info) continue; const pose = FP?.[hand], B = handBones(root, hand, info);
    if (!pose && !POSED.has(root)) continue;
    info.fingers.forEach((F, f) => { const c = pose?.curl?.[f] || [0, 0, 0];
      B.f[f].forEach((b, k) => { if (!b) return; b.quaternion.copy(info.q0[b.name]);
        if (k === 0 && pose?.add) { _a.setFromUnitVectors(F.d, _v.copy(F.d).lerp(info.dm, pose.add).normalize()); b.quaternion.multiply(_q.copy(F.R1).invert().multiply(_a).multiply(F.R1)); }
        if (c[k]) b.quaternion.multiply(_q.setFromAxisAngle(F.axL[k], THREE.MathUtils.degToRad(c[k]))); }); });
    const t = pose?.thumb || 0, tk = pose?.thumbK || [0, 1, 0.6];
    B.t.forEach((b, k) => { if (!b) return; b.quaternion.copy(info.q0[b.name]); if (t && tk[k]) b.quaternion.multiply(_q.setFromAxisAngle(info.thumb.axL[k], THREE.MathUtils.degToRad(t * tk[k]))); });
  }
  if (FP) POSED.add(root); else POSED.delete(root);
}
// אחרי חישוב הקודקודים (verts מ-skinVerts: [{ o, P, N }]): הכיפוף עצמו כבר נעשה בעצמות, כאן רק מחליקים את הנורמלים של הידיים
export function applyFingers(root, verts) {
  if (!root.userData.fingerPose) return;
  smoothHands(root, verts.filter(e => e.o.isSkinnedMesh));
}
// נורמלים חלקים לידיים אחרי הכיפוף: לכל קודקוד של כף היד, האצבעות והאגודל — ממוצע הנורמלים של המשולשים סביבו,
// ומאחדים קודקודים שנמצאים באותו מקום (תפרים של הטקסטורה) — בלי "פינות" על האצבעות
function smoothHands(root, meshes) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const e of meshes) { const g = e.o.geometry, I = g.index; if (!I || !e.N || !g.attributes.skinIndex) continue;
    const bs = e.o.skeleton.bones, hb = new Set(); bs.forEach((bn, i) => { if (/^(Left|Right)(Hand|FingerBase|HandFinger1)$|^[LR]Thumb$/.test(legacyBone(bn.name))) hb.add(i); }); if (!hb.size) continue;
    const cnt = g.attributes.position.count; let inS = SMOOTH.get(g.uuid); if (inS === undefined) { inS = new Uint8Array(cnt); let any = false; for (let i = 0; i < cnt; i++) if (hb.has(dominant(g, i))) { inS[i] = 1; any = true; } if (!any) inS = null; SMOOTH.set(g.uuid, inS); } if (!inS) continue;
    const acc = new Map(), key = i => `${Math.round(e.P[i * 3] * 5000)},${Math.round(e.P[i * 3 + 1] * 5000)},${Math.round(e.P[i * 3 + 2] * 5000)}`, P = (v, i) => v.set(e.P[i * 3], e.P[i * 3 + 1], e.P[i * 3 + 2]);
    for (let t = 0; t < I.count; t += 3) { const i0 = I.getX(t), i1 = I.getX(t + 1), i2 = I.getX(t + 2); if (!inS[i0] && !inS[i1] && !inS[i2]) continue;
      P(a, i0); P(b, i1); P(c, i2); n.crossVectors(b.sub(a), c.sub(a));   // לפי השטח
      // הכיוון החוצה לפי הנורמל הקיים (סדר הקודקודים לא תמיד אחיד)
      if (n.x * (e.N[i0 * 3] + e.N[i1 * 3] + e.N[i2 * 3]) + n.y * (e.N[i0 * 3 + 1] + e.N[i1 * 3 + 1] + e.N[i2 * 3 + 1]) + n.z * (e.N[i0 * 3 + 2] + e.N[i1 * 3 + 2] + e.N[i2 * 3 + 2]) < 0) n.negate();
      for (const i of [i0, i1, i2]) if (inS[i]) { const k = key(i), v = acc.get(k); if (v) v.add(n); else acc.set(k, n.clone()); } }
    for (let i = 0; i < cnt; i++) if (inS[i]) { const v = acc.get(key(i)); if (!v || v.lengthSq() < 1e-16) continue; n.copy(v).normalize(); e.N[i * 3] = n.x; e.N[i * 3 + 1] = n.y; e.N[i * 3 + 2] = n.z; } }
}
// נקודה על אצבע f (0 — המורה) בתנוחה הנוכחית, בעולם: frac — לאורך האצבע (1 — הקצה), pad — כמה לצד כף היד (מ')
export function fingerPoint(root, hand, f, frac, pad = 0) {
  const info = handInfo(root, hand); if (!info) return null;
  poseFingers(root); root.updateMatrixWorld(true);
  const F = info.fingers[f], B = handBones(root, hand, info).f[f]; let s = F.L * frac, k = 0;
  while (k < 2 && s > F.seg[k]) { s -= F.seg[k]; k++; }
  const p = k < 2 ? B[k + 1].position.clone().multiplyScalar(s / F.seg[k]) : new THREE.Vector3(0, s, 0);
  return p.addScaledVector(F.palmL[k], pad).applyMatrix4(B[k].matrixWorld);
}
// נקודה על ציר האגודל בתנוחה הנוכחית, בעולם (frac: 0 — שורש האגודל, 1 — הקצה)
export function thumbPoint(root, hand, frac) {
  const info = handInfo(root, hand); if (!info) return null;
  poseFingers(root); root.updateMatrixWorld(true);
  const seg = info.thumb.seg, B = handBones(root, hand, info).t; let s = (seg[0] + seg[1] + seg[2]) * frac, k = 0;
  while (k < 2 && s > seg[k]) { s -= seg[k]; k++; }
  return (k < 2 ? B[k + 1].position.clone().multiplyScalar(s / seg[k]) : new THREE.Vector3(0, s, 0)).applyMatrix4(B[k].matrixWorld);
}
// כיוון הפרק האחרון של אצבע f והכיוון של הכרית שלה (אל כף היד), בעולם
export function fingerDirs(root, hand, f) {
  const a = fingerPoint(root, hand, f, 0.8), b = fingerPoint(root, hand, f, 1), c = fingerPoint(root, hand, f, 0.9, 0.01), d = fingerPoint(root, hand, f, 0.9);
  return a && { dir: b.clone().sub(a).normalize(), pad: c.sub(d).normalize() };
}
// תנוחות מוכנות
export const FINGERS = {
  relaxed: { curl: [[10, 20, 10], [14, 26, 14], [18, 32, 18], [22, 38, 20]], add: 0.5, thumb: 10 },
  hook: { curl: [[0, 92, 55], [0, 93, 56], [0, 94, 57], [0, 95, 58]], add: 1, thumb: 30 },                       // רצועה תלויה: האצבעות נסגרות מעל הצלע התחתונה (שורש האצבעות — בעצם)
  wrap: { curl: [[0, 78, 62], [0, 80, 63], [0, 82, 64], [0, 84, 65]], add: 1, thumb: 30 },                       // עמוד: האצבעות מקיפות אותו
  pinch: c => ({ curl: [[c, 28, 8], [c + 4, 30, 8], [86, 98, 55], [88, 100, 55]], add: 1, thumb: 0 }),           // כרטיס: אגודל מול המורה והאמה, הקמיצה והזרת מקופלות
  phone: { curl: [[55, 70, 25], [58, 72, 25], [60, 72, 25], [62, 70, 25]], add: 0.9, thumb: 18 },                // הפקח מחזיק את המכשיר
};
