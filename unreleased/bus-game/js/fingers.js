// אצבעות: בשלד של הדגמים (MPFB, שלד cmu_mb — זה שמתאים להקלטת ההליכה) יש לכל כף יד רק שלוש עצמות: FingerBase,
// HandFinger1 (כל ארבע האצבעות יחד, בלי פרקים) ו-Thumb. כדי שיד תיסגר באמת — צביטה על כרטיס, אחיזה ברצועה או בעמוד,
// יד רפויה — מחלקים כאן את קודקודי האצבעות לארבע אצבעות (לפי המקום שלהן לרוחב כף היד) ולשלושה פרקים בכל אצבע,
// ומכופפים אותן אחרי חישוב השלד, בזמן שאופים את התנוחה (skinVerts ב-actors.js). לאגודל — פרק אחד נוסף באמצע.
// התנוחה: root.userData.fingerPose = { Left: { curl: [[שורש, אמצע, קצה] × 4 — מהאצבע המורה עד הזרת, במעלות], add: 0..1
// (כמה האצבעות נצמדות זו לזו), thumb: כיפוף פרק האגודל במעלות }, Right: {...} }
import * as THREE from 'three';

const JOINT = [0.04, 0.46, 0.74], BLEND = 0.007;   // מקום הפרקים לאורך האצבע (חלק מהאורך), וחצי רוחב אזור הכיפוף (מ')
const CACHE = new Map(), SMOOTH = new Map();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dominant = (g, i) => { let bw = 0, bj = -1; for (let j = 0; j < 4; j++) { const w = g.attributes.skinWeight.getComponent(i, j); if (w > bw) { bw = w; bj = g.attributes.skinIndex.getComponent(i, j); } } return bj; };

// מבנה היד של הדגם (פעם אחת לכל דגם ולכל צד), במערכת הצירים של העצם HandFinger1 במנוחה (bind)
export function handInfo(root, hand) {
  const meshes = []; root.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const key = hand + '|' + meshes.map(o => o.geometry.uuid).join(',');
  if (CACHE.has(key)) return CACHE.get(key);
  const F1 = hand + 'HandFinger1', TH = hand === 'Left' ? 'LThumb' : 'RThumb', fv = [], tv = [], v = new THREE.Vector3(), M = new THREE.Matrix4();
  let thumbInF1 = null;
  meshes.forEach((o, mi) => { const bs = o.skeleton.bones, iF = bs.findIndex(b => b.name === F1), iT = bs.findIndex(b => b.name === TH); if (iF < 0) return;
    const g = o.geometry, P = g.attributes.position; if (!g.attributes.skinIndex) return;
    const toF = M.clone().multiplyMatrices(o.skeleton.boneInverses[iF], o.bindMatrix), toT = iT >= 0 ? new THREE.Matrix4().multiplyMatrices(o.skeleton.boneInverses[iT], o.bindMatrix) : null;
    if (toT && !thumbInF1) thumbInF1 = new THREE.Matrix4().multiplyMatrices(o.skeleton.boneInverses[iF], new THREE.Matrix4().copy(o.skeleton.boneInverses[iT]).invert());
    for (let i = 0; i < P.count; i++) { const d = dominant(g, i);
      if (d === iF) fv.push({ mi, i, p: v.fromBufferAttribute(P, i).clone().applyMatrix4(toF) });
      else if (toT && d === iT) tv.push({ mi, i, p: v.fromBufferAttribute(P, i).clone().applyMatrix4(toT) }); } });
  if (fv.length < 40 || tv.length < 8 || !thumbInF1) { CACHE.set(key, null); return null; }
  // כיוון האצבעות — ציר Y של העצם; הכיוון לרוחב כף היד — הציר הראשי של החצי הרחוק של הקודקודים, במישור הניצב
  const tmax = fv.reduce((m, q) => Math.max(m, q.p.y), 0), far = fv.filter(q => q.p.y > 0.45 * tmax);
  let sxx = 0, sxz = 0, szz = 0, mx = 0, mz = 0; for (const q of far) { mx += q.p.x; mz += q.p.z; } mx /= far.length; mz /= far.length;
  for (const q of far) { const x = q.p.x - mx, z = q.p.z - mz; sxx += x * x; sxz += x * z; szz += z * z; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), across = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), u = q => q.p.x * across.x + q.p.z * across.z;
  // ארבע אצבעות: k-means חד-ממדי על המקום לרוחב (האצבעות פרושות, בחצי הרחוק הן רחוקות זו מזו)
  const us = far.map(u).sort((a, b) => a - b), cen = [0.125, 0.375, 0.625, 0.875].map(f => us[Math.floor(f * (us.length - 1))]);
  for (let it = 0; it < 12; it++) { const s = [0, 0, 0, 0], n = [0, 0, 0, 0]; for (const q of far) { const x = u(q); let b = 0; for (let k = 1; k < 4; k++) if (Math.abs(x - cen[k]) < Math.abs(x - cen[b])) b = k; s[b] += x; n[b]++; } for (let k = 0; k < 4; k++) if (n[k]) cen[k] = s[k] / n[k]; }
  const fingers = cen.map(c => { const vs = far.filter(q => { const x = u(q); let b = 0; for (let k = 1; k < 4; k++) if (Math.abs(x - cen[k]) < Math.abs(x - cen[b])) b = k; return cen[b] === c; });
    // ציר האצבע: מהמרכז של השליש הקרוב אל המרכז של השליש הרחוק של הקודקודים שלה
    const ys = vs.map(q => q.p.y).sort((a, b) => a - b), lo = ys[Math.floor(ys.length * 0.33)], hi = ys[Math.floor(ys.length * 0.66)];
    const mean = a => a.reduce((s, q) => s.add(q.p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, a.length));
    const a = mean(vs.filter(q => q.p.y <= lo)), b = mean(vs.filter(q => q.p.y >= hi)), d = b.clone().sub(a).normalize();
    return { c: a, d }; });
  // כל קודקוד — לאצבע שהציר שלה הכי קרוב אליו
  const dist = (q, f) => { const r = q.p.clone().sub(f.c); return r.addScaledVector(f.d, -r.dot(f.d)).length(); };
  for (const q of fv) { let b = 0; for (let k = 1; k < 4; k++) if (dist(q, fingers[k]) < dist(q, fingers[b])) b = k; q.f = b; }
  fingers.forEach((f, k) => { let lo = Infinity, hi = -Infinity; for (const q of fv) if (q.f === k) { const s = q.p.clone().sub(f.c).dot(f.d); if (q.p.y > 0.25 * tmax) hi = Math.max(hi, s); lo = Math.min(lo, s); }
    const s0 = -f.c.y / f.d.y; f.m = f.c.clone().addScaledVector(f.d, s0); f.L = hi - s0; });   // שורש האצבע — בראש העצם (y = 0)
  for (const q of fv) { const f = fingers[q.f]; q.s = q.p.clone().sub(f.m).dot(f.d); }
  // הצד של כף היד (לשם מתכופפים): הצד שבו האגודל. והאצבע המורה — זו שהכי קרובה לאגודל
  const thumbC = tv.reduce((s, q) => s.add(q.p.clone().applyMatrix4(thumbInF1)), new THREE.Vector3()).multiplyScalar(1 / tv.length);
  const base = fingers.reduce((s, f) => s.add(f.m), new THREE.Vector3()).multiplyScalar(0.25), dm = fingers.reduce((s, f) => s.add(f.d), new THREE.Vector3()).normalize();
  const palm = new THREE.Vector3().crossVectors(across, dm).normalize(); if (thumbC.clone().sub(base).dot(palm) < 0) palm.negate();
  const order = [0, 1, 2, 3].sort((a, b) => fingers[a].m.distanceTo(thumbC) - fingers[b].m.distanceTo(thumbC)); if (Math.abs(order[0] - order[3]) !== 3) { order.length = 0; const asc = fingers[0].m.distanceTo(thumbC) < fingers[3].m.distanceTo(thumbC); for (let k = 0; k < 4; k++) order.push(asc ? k : 3 - k); }
  const rank = []; order.forEach((k, r) => { rank[k] = r; }); for (const q of fv) q.f = rank[q.f];
  const fs = order.map(k => { const f = fingers[k]; return { m: f.m, d: f.d, L: f.L, ax: new THREE.Vector3().crossVectors(f.d, palm).normalize() }; });
  // האגודל: הציר Y של העצם שלו, פרק באמצע; מתכופף אל האצבעות
  const tl = tv.reduce((m, q) => Math.max(m, q.p.y), 0), toThumb = new THREE.Matrix4().copy(thumbInF1).invert();
  const g = fs[0].m.clone().addScaledVector(fs[0].d, fs[0].L * 0.5).applyMatrix4(toThumb); g.y = 0; g.normalize();
  const info = { F1, TH, fv, tv, fingers: fs, palm, dm, thumb: { L: tl, ax: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), g).normalize() }, nm: meshes.length };
  CACHE.set(key, info); return info;
}

const _q = new THREE.Quaternion(), _r = new THREE.Vector3();
// כיפוף נקודה של אצבע f (במערכת העצם, s — המקום שלה לאורך האצבע במנוחה); n — נורמל (אופציונלי) שמסתובב איתה
function bend(info, pose, f, s, p, n) {
  const F = info.fingers[f], c = pose.curl?.[f] || [0, 0, 0];
  for (let k = 2; k >= 0; k--) { const a = c[k]; if (!a) continue; const sk = JOINT[k] * F.L, w = sstep(sk - BLEND, sk + BLEND, s); if (!w) continue;
    _q.setFromAxisAngle(F.ax, THREE.MathUtils.degToRad(a) * w); _r.copy(F.m).addScaledVector(F.d, sk); p.sub(_r).applyQuaternion(_q).add(_r); if (n) n.applyQuaternion(_q); }
  if (pose.add) { const w = sstep(-BLEND, BLEND, s); _q.setFromUnitVectors(F.d, _r.copy(F.d).lerp(info.dm, pose.add).normalize()); _q.slerp(new THREE.Quaternion(), 1 - w); p.sub(F.m).applyQuaternion(_q).add(F.m); if (n) n.applyQuaternion(_q); }
  return p;
}
// מחיל את תנוחת האצבעות על הקודקודים שכבר חושבו לפי השלד (verts מ-skinVerts: [{ o, P, N }], בקואורדינטות העולם)
export function applyFingers(root, verts) {
  const FP = root.userData.fingerPose; const meshes = verts.filter(e => e.o.isSkinnedMesh); if (!FP) return;
  const p = new THREE.Vector3(), n = new THREE.Vector3(), M = new THREE.Matrix4(), Mi = new THREE.Matrix4(), N3 = new THREE.Matrix3(), N3i = new THREE.Matrix3();
  for (const hand of ['Left', 'Right']) { const pose = FP[hand]; if (!pose) continue; const info = handInfo(root, hand); if (!info || info.nm !== meshes.length) continue;
    const run = (bone, list, fn) => { if (!bone) return; M.copy(bone.matrixWorld); Mi.copy(M).invert(); N3.setFromMatrix4(M); N3i.setFromMatrix4(Mi);
      for (const q of list) { const e = meshes[q.mi], i3 = q.i * 3; p.set(e.P[i3], e.P[i3 + 1], e.P[i3 + 2]).applyMatrix4(Mi); const hasN = !!e.N; if (hasN) n.set(e.N[i3], e.N[i3 + 1], e.N[i3 + 2]).applyMatrix3(N3i).normalize();
        fn(q, p, hasN ? n : null); p.applyMatrix4(M); e.P[i3] = p.x; e.P[i3 + 1] = p.y; e.P[i3 + 2] = p.z;
        if (hasN) { n.applyMatrix3(N3).normalize(); e.N[i3] = n.x; e.N[i3 + 1] = n.y; e.N[i3 + 2] = n.z; } } };
    run(root.getObjectByName(info.F1), info.fv, (q, p, n) => bend(info, pose, q.f, q.s, p, n));
    if (pose.thumb) { const sk = info.thumb.L * 0.5, c = new THREE.Vector3(0, sk, 0);
      run(root.getObjectByName(info.TH), info.tv, (q, p, n) => { const w = sstep(sk - BLEND, sk + BLEND, q.p.y); if (!w) return; _q.setFromAxisAngle(info.thumb.ax, THREE.MathUtils.degToRad(pose.thumb) * w); p.sub(c).applyQuaternion(_q).add(c); if (n) n.applyQuaternion(_q); }); }
  }
  smoothHands(root, meshes);
}
// נורמלים חלקים לידיים אחרי הכיפוף: לכל קודקוד של כף היד, האצבעות והאגודל — ממוצע הנורמלים של המשולשים סביבו,
// ומאחדים קודקודים שנמצאים באותו מקום (תפרים של הטקסטורה) — בלי "פינות" על האצבעות
function smoothHands(root, meshes) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const e of meshes) { const g = e.o.geometry, I = g.index; if (!I || !e.N || !g.attributes.skinIndex) continue;
    const bs = e.o.skeleton.bones, hb = new Set(); bs.forEach((bn, i) => { if (/^(Left|Right)(Hand|FingerBase|HandFinger1)$|^[LR]Thumb$/.test(bn.name)) hb.add(i); }); if (!hb.size) continue;
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
  const info = handInfo(root, hand), bone = info && root.getObjectByName(info.F1); if (!bone) return null;
  const F = info.fingers[f], s = F.L * frac, p = F.m.clone().addScaledVector(F.d, s), n = info.palm.clone();
  bend(info, root.userData.fingerPose?.[hand] || {}, f, s, p, n);
  return p.addScaledVector(n, pad).applyMatrix4(bone.matrixWorld);
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
