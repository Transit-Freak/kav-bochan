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

// ---------- הידיים על הירכיים
// לכל קודקוד: העצם הדומיננטית (לפי משקלי השלד)
function domBone(o, i) {
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
  let bi = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; bi = si.getComponent(i, j); } }
  return o.skeleton.bones[bi].name;
}
const HAND_RE = { Left: /^(LeftHand|LeftFingerBase|LeftHandFinger1|LThumb)$/, Right: /^(RightHand|RightFingerBase|RightHandFinger1|RThumb)$/ };
const PARTS = new WeakMap();
const LEG_RE = { Left: /^Left(UpLeg|Leg)$/, Right: /^Right(UpLeg|Leg)$/ };
// מצב הידיים מול הירכיים, בתנוחה הנוכחית: לכל צד — המשולשים של הירך (עור ובגד, כפי שהם בעולם), וכל קודקוד של היד והאצבעות
// עם המרחק המסומן מהירך (שלילי = בתוך הירך). הקצוות של האצבעות: 15% הקודקודים הרחוקים ביותר לכיוון האצבעות
function handState(root, skinVerts, dirs) {
  const out = {};
  for (const s of ['Left', 'Right']) out[s] = { tris: [], hand: [], kind: [] };
  // הרשתות (עור ובגד) — פעם אחת לכל שלד; אחר כך מחשבים רק את הקודקודים של הידיים והירכיים (מהיר)
  if (!root.userData.hsMeshes) root.userData.hsMeshes = skinVerts(root).filter(({ o, kind }) => o.isSkinnedMesh && (kind === 'cloth' || kind === 'skin')).map(({ o, P }) => ({ o, P }));
  root.updateMatrixWorld(true);
  for (const { o, P } of root.userData.hsMeshes) {
    // לכל רשת פעם אחת: אילו קודקודים של היד ואילו משולשים של הירך, לכל צד
    let L = PARTS.get(o.geometry);
    if (!L) {
      const n = P.length / 3, dom = new Array(n);
      for (let i = 0; i < n; i++) dom[i] = domBone(o, i);
      const idx = o.geometry.index, nt = idx ? idx.count / 3 : n / 3, vi = (t, k) => idx ? idx.getX(t * 3 + k) : t * 3 + k;
      L = {};
      for (const s of ['Left', 'Right']) {
        const hand = [], tris = [];
        for (let i = 0; i < n; i++) if (HAND_RE[s].test(dom[i])) hand.push([i, dom[i]]);
        for (let t = 0; t < nt; t++) { const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2); if (LEG_RE[s].test(dom[a]) || LEG_RE[s].test(dom[b]) || LEG_RE[s].test(dom[c])) tris.push([a, b, c]); }
        L[s] = { hand, tris };
      }
      PARTS.set(o.geometry, L);
    }
    o.skeleton.update();
    const bm = o.skeleton.boneMatrices, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, pos = o.geometry.attributes.position;
    const full = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, o.bindMatrixInverse), acc = new THREE.Matrix4(), M = new THREE.Matrix4(), memo = new Map();
    const at = i => { let v = memo.get(i); if (v) return v.clone();
      const e = acc.elements; e.fill(0);
      for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (!w) continue; const b = si.getComponent(i, j) * 16; for (let k = 0; k < 16; k++) e[k] += w * bm[b + k]; }
      M.multiplyMatrices(full, acc).multiply(o.bindMatrix);
      v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M); memo.set(i, v); return v.clone(); };
    for (const s of ['Left', 'Right']) {
      for (const [i, k] of L[s].hand) { out[s].hand.push(at(i)); out[s].kind.push(k); }
      for (const [a, b, c] of L[s].tris) out[s].tris.push(new THREE.Triangle(at(a), at(b), at(c)));
    }
  }
  for (const s of ['Left', 'Right']) {
    const S = out[s], { A, a } = dirs[s];
    // הכיוון של המשולשים: הנורמל החוצה מציר הירך (אם רובם הפוכים — הופכים את כולם)
    let vote = 0; const nn = V(), cc = V(), pa = V();
    S.norms = S.tris.map(T => { T.getNormal(nn); T.getMidpoint(cc); const r = cc.clone().sub(A); pa.copy(a).multiplyScalar(r.dot(a)); r.sub(pa); vote += Math.sign(nn.dot(r)); return nn.clone(); });
    if (vote < 0) S.norms.forEach(v => v.negate());
    // המרחק המסומן של כל קודקוד מהמשולש הקרוב ביותר (רק משולשים ליד כף היד — מהיר יותר)
    const hc = S.hand.reduce((acc, p) => acc.add(p), V()).divideScalar(S.hand.length || 1), mid = V();
    const keep = S.tris.map((T, t) => t).filter(t => S.tris[t].getMidpoint(mid).distanceTo(hc) < 0.22);
    S.tris = keep.map(t => S.tris[t]); S.norms = keep.map(t => S.norms[t]);
    const cp = V(), best = V();
    S.d = S.hand.map(p => {
      let bd = Infinity, bi = -1;
      for (let t = 0; t < S.tris.length; t++) { S.tris[t].closestPointToPoint(p, cp); const d = cp.distanceToSquared(p); if (d < bd) { bd = d; bi = t; best.copy(cp); } }
      if (bi < 0) return Infinity;
      return Math.sign(p.clone().sub(best).dot(S.norms[bi]) || 1) * Math.sqrt(bd);
    });
    const wr = root.getObjectByName(s + 'Hand').getWorldPosition(V()), proj = S.hand.map(p => p.distanceTo(wr));
    const fing = S.hand.map((p, i) => i).filter(i => /Finger1$/.test(S.kind[i])).sort((x, y) => proj[y] - proj[x]);
    // הקצוות: כל הקודקודים של האצבעות ב-3 ס"מ האחרונים (גם הצד התחתון של הכרית, לא רק הציפורן)
    const far = fing.length ? proj[fing[0]] : 0;
    S.tips = fing.filter(i => proj[i] >= far - 0.03);
    const thumb = S.hand.map((p, i) => i).filter(i => /Thumb$/.test(S.kind[i])), rest = S.hand.map((p, i) => i).filter(i => !/Thumb$/.test(S.kind[i]));
    S.minAll = Math.min(...S.d); S.inside = S.d.filter(d => d < 0).length;
    S.minD = Math.min(...rest.map(i => S.d[i]));                 // כף היד והאצבעות (בלי האגודל)
    const palm = S.hand.map((p, i) => i).filter(i => /(Hand|FingerBase)$/.test(S.kind[i]));
    S.palmMin = palm.length ? Math.min(...palm.map(i => S.d[i])) : Infinity;
    S.thumbMin = thumb.length ? Math.min(...thumb.map(i => S.d[i])) : Infinity;
    // כל אצבע לחוד (לפי המקום שלה לרוחב כף היד, ברצועות של 1.8 ס"מ): כמה הצד התחתון של הקצה שלה מעל הירך
    const sideV = dirs[s].f.clone().cross(dirs[s].n), bins = new Map();
    for (const i of S.tips) { const b = Math.floor(S.hand[i].clone().sub(wr).dot(sideV) / 0.018); bins.set(b, Math.min(bins.get(b) ?? Infinity, S.d[i])); }
    const td = [...bins.values()].sort((x, y) => x - y);
    let fp = -Infinity, fn = -Infinity; for (const [b, v] of bins) { if (b >= 0) fp = Math.max(fp, v); else fn = Math.max(fn, v); }
    S.rollErr = isFinite(fp) && isFinite(fn) ? fp - fn : 0;
    S.tipFloat = td[td.length - 1]; S.tipMin = td[0]; S.tipQ = td[Math.floor(td.length * 0.6)]; S.tipMed = td[Math.floor((td.length - 1) / 2)]; S.tipBins = td;
    if (thumb.length) { let sd = 0; const side = dirs[s].f.clone().cross(dirs[s].n); for (const i of thumb) sd += S.hand[i].clone().sub(wr).dot(side); S.thumbSide = Math.sign(sd) || 1; }
  }
  return out;
}
// מניחים את כפות הידיים על הירכיים: מרכז כף היד בערך באמצע הדרך לברך (60%), על הצד העליון של הירך;
// כף היד פונה למטה (אל הירך) והאצבעות קדימה לאורך הירך, אל הברך. הזרוע מגיעה לשם ב-IK (המרפק לצד ולאחור).
// אחר כך כמה סבבים: מרימים או מורידים את פרק היד כך שהקודקוד הנמוך ביותר של היד יהיה 3 מ"מ מעל הירך,
// ומכופפים את האצבעות עד שקצותיהן נוגעות כמעט בירך (עד 6 מ"מ מעליה)
function placeHands(root, st, skinVerts) {
  const B = n => root.getObjectByName(n), W = o => o.getWorldPosition(V()), up = new THREE.Vector3(0, 1, 0);
  const dirs = {}, base = {};
  for (const s of ['Left', 'Right']) {
    const A = W(B(s + 'UpLeg')), K = W(B(s + 'Leg')), a = K.clone().sub(A).normalize();
    const n = up.clone().addScaledVector(a, -up.dot(a)).normalize(), f = a.clone().addScaledVector(n, -a.dot(n)).normalize();
    const hand = B(s + 'Hand'), fb = B(s + 'FingerBase');
    const Fl = fb.position.clone().normalize(), Pl = st.palm[s].clone().addScaledVector(Fl, -st.palm[s].dot(Fl)).normalize();
    const C = A.clone().addScaledVector(a, A.distanceTo(K) * 0.68);
    const sx = Math.sign(A.x - W(B('Hips')).x) || 1, palmLen = fb.position.length() * (hand.getWorldScale(V()).x || 1);
    dirs[s] = { A, a, n, f, Fl, Pl, C, sx, lift: 0.06, curl: 0, thumb: 0, roll: 0, back: 0, lat: 0, palmLen };
    for (const b of [fb, B(s + 'HandFinger1'), B(s === 'Left' ? 'LThumb' : 'RThumb')]) if (b) base[b.name] = b.quaternion.clone();
  }
  // הצד העליון של הירך מתחת לכף היד: הרכס (הנקודה הגבוהה לרוחב — לא תמיד מעל העצם) והשיפוע שלו לרוחב ולאורך.
  // כף היד יושבת על הרכס, ומוטה כמו פני הירך שם
  const T0 = handState(root, skinVerts, dirs);
  // הצירים האמיתיים של כף היד, מהרשת (לא מהעצם): הנורמל של כף היד — הכיוון שבו הקודקודים של כף היד הכי "שטוחים"
  // (PCA), לצד של st.palm; וכיוון האצבעות — אל מרכז קצות האצבעות, במישור של כף היד
  for (const s of ['Left', 'Right']) {
    const D = dirs[s], H = T0[s], hand = B(s + 'Hand');
    const loc = H.hand.map((p, i) => [hand.worldToLocal(p.clone()), H.kind[i]]);
    const palm = loc.filter(([, k]) => /(Hand|FingerBase)$/.test(k)).map(([p]) => p), tips = loc.filter(([, k]) => /Finger1$/.test(k)).map(([p]) => p);
    if (palm.length < 8 || !tips.length) continue;
    const m = palm.reduce((a, p) => a.add(p), V()).divideScalar(palm.length), C3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of palm) { const d = [p.x - m.x, p.y - m.y, p.z - m.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C3[i * 3 + j] += d[i] * d[j]; }
    const tr = C3[0] + C3[4] + C3[8]; let v = new THREE.Vector3(1, 0.3, 0.2);
    for (let it = 0; it < 80; it++) { const w = new THREE.Vector3(
      (tr - C3[0]) * v.x - C3[1] * v.y - C3[2] * v.z, -C3[3] * v.x + (tr - C3[4]) * v.y - C3[5] * v.z, -C3[6] * v.x - C3[7] * v.y + (tr - C3[8]) * v.z); v = w.normalize(); }
    if (v.dot(D.Pl) < 0) v.negate();
    D.pca = +v.dot(D.Pl).toFixed(2);
    if (v.dot(D.Pl) < 0.75) v.copy(D.Pl);        // הרשת לא נתנה כיוון ברור (למשל בגלל האגודל) — לפי העצם
    const tc = tips.reduce((a, p) => a.add(p), V()).divideScalar(tips.length).sub(m);
    D.Fl = tc.addScaledVector(v, -tc.dot(v)).normalize(); D.Pl = v;
  }
  const fit = (pts) => { let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of pts) { n++; sx += x; sy += y; sxx += x * x; sxy += x * y; } const d = n * sxx - sx * sx; return n > 1 && Math.abs(d) > 1e-12 ? (n * sxy - sx * sy) / d : 0; };
  for (const s of ['Left', 'Right']) {
    const D = dirs[s], sd = D.f.clone().cross(D.n), q = V(), byS = new Map();
    const pts = [];
    for (const T of T0[s].tris) for (const p of [T.a, T.b, T.c]) {
      q.copy(p).sub(D.C); const fc = q.dot(D.f), sc = q.dot(sd), h = q.dot(D.n);
      if (fc < -0.05 || fc > 0.13 || Math.abs(sc) > 0.08 || h < 0) continue;
      pts.push([fc, sc, h]); const b = Math.round(sc / 0.01); byS.set(b, Math.max(byS.get(b) ?? -1, h));
    }
    let ridge = 0, bh = -1;
    for (const [b, h] of byS) { const m = (h + (byS.get(b - 1) ?? h) + (byS.get(b + 1) ?? h)) / 3; if (m > bh) { bh = m; ridge = b * 0.01; } }
    ridge = THREE.MathUtils.clamp(ridge, -0.04, 0.04);
    const a1 = fit([...byS].filter(([b]) => Math.abs(b * 0.01 - ridge) <= 0.04).map(([b, h]) => [b * 0.01, h]));
    const byF = new Map(); for (const [fc, sc, h] of pts) if (Math.abs(sc - ridge) < 0.025) { const b = Math.round(fc / 0.015); byF.set(b, Math.max(byF.get(b) ?? -1, h)); }
    const a2 = fit([...byF].map(([b, h]) => [b * 0.015, h]));
    const n2 = D.n.clone().addScaledVector(sd, -THREE.MathUtils.clamp(a1, -0.25, 0.25)).addScaledVector(D.f, -THREE.MathUtils.clamp(a2, -0.3, 0.3)).normalize();
    // קצת פנימה (אל קו האמצע של הגוף), והאצבעות פונות מעט פנימה — כך רוב האצבעות על הצד העליון של הירך ולא נשפכות לצד החיצוני
    const inward = sd.clone().multiplyScalar(Math.sign(sd.x * -D.sx) || 1);
    D.C.addScaledVector(sd, ridge); D.n = n2; D.inward = inward; D.side = sd;
    D.f = D.f.clone().addScaledVector(n2, -D.f.dot(n2)).normalize().applyAxisAngle(n2, THREE.MathUtils.degToRad(6) * Math.sign(D.f.clone().cross(inward).dot(n2) || 1));
    D.fit = { ridge: +ridge.toFixed(3), a1: +a1.toFixed(2), a2: +a2.toFixed(2) };
    // הסיבוב של כף היד בעולם: מהצירים של העצם (אצבעות, כף) אל הצירים הרצויים (לאורך הירך, אל הירך)
    const Pw = D.n.clone().negate();
    const Ml = new THREE.Matrix4().makeBasis(D.Fl, D.Pl, D.Fl.clone().cross(D.Pl)), Mw = new THREE.Matrix4().makeBasis(D.f, Pw, D.f.clone().cross(Pw));
    D.Q = new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.transpose()));
  }
  const apply = () => {
    for (const s of ['Left', 'Right']) {
      const D = dirs[s], hand = B(s + 'Hand'), fb = B(s + 'FingerBase'), f1 = B(s + 'HandFinger1'), th = B(s === 'Left' ? 'LThumb' : 'RThumb');
      // פרק היד: מאחורי מרכז כף היד (לאורך האצבעות), ומעל פני הירך בגובה lift
      // לרוחב: lat — כך שמרכז כף היד יהיה מעל אמצע הירך (ראו בסבבים)
      const wrist = D.C.clone().addScaledVector(D.f, -D.palmLen * 0.55 - D.back).addScaledVector(D.n, D.lift).addScaledVector(D.side, D.lat);
      D.target = wrist;
      twoBone(B(s + 'Arm'), B(s + 'ForeArm'), hand, wrist, new THREE.Vector3(D.sx * 0.7, -0.2, -0.7));
      const pq = hand.parent.getWorldQuaternion(new THREE.Quaternion());
      hand.quaternion.copy(pq.invert().multiply(D.Q)); hand.updateWorldMatrix(false, true);
      if (D.roll) turn(hand, D.f, D.roll);      // גלגול: הצד של כף היד שמרחף יותר יורד אל הירך
      for (const b of [fb, f1, th]) if (b) { b.quaternion.copy(base[b.name]); b.updateWorldMatrix(false, true); }
      // כיפוף האצבעות אל הירך (סביב הציר שבין כיוון האצבעות לכיוון כף היד)
      const axis = D.f.clone().cross(D.n.clone().negate());
      if (fb) turn(fb, axis, D.curl * 0.35);
      if (f1) turn(f1, axis, D.curl * 0.65);
      if (th) turn(th, D.f, -(D.thumbSide || 1) * D.thumb);     // האגודל: מסובבים למעלה (אל הירך מהצד) או למטה
    }
    root.updateMatrixWorld(true);
  };
  let S;
  for (let k = 0; k < 36; k++) {
    apply();
    S = handState(root, skinVerts, dirs);
    let done = true;
    for (const s of ['Left', 'Right']) {
      const D = dirs[s], H = S[s];
      if (!isFinite(H.minD)) continue;
      if (H.thumbSide && !D.thumbSide) D.thumbSide = H.thumbSide;
      // לרוחב: מרכז כף היד (בלי האגודל) מעל אמצע הירך במקום שבו היא מונחת
      { const sdv = D.f.clone().cross(D.n), q = V(); let hs = 0, hf = 0, k = 0;
        H.hand.forEach((p, i) => { if (/Thumb$/.test(H.kind[i])) return; q.copy(p).sub(D.C); hs += q.dot(sdv); hf += q.dot(D.f); k++; });
        if (k) { hs /= k; hf /= k; let lo = Infinity, hi = -Infinity;
          for (const T of H.tris) for (const p of [T.a, T.b, T.c]) { q.copy(p).sub(D.C); if (Math.abs(q.dot(D.f) - hf) < 0.025 && q.dot(D.n) > -0.02) { const v = q.dot(sdv); lo = Math.min(lo, v); hi = Math.max(hi, v); } }
          if (isFinite(lo)) { const e = (lo + hi) / 2 - hs; if (Math.abs(e) > 0.003) { D.lat += THREE.MathUtils.clamp(e, -0.02, 0.02) * Math.sign(sdv.dot(D.side) || 1); done = false; } D.latErr = e; } } }
      // הזרוע קצרה מדי כדי להגיע לשם: מקרבים את כף היד לאגן (לאורך הירך), עד 20 ס"מ
      const miss = B(s + 'Hand').getWorldPosition(V()).distanceTo(D.target);
      if (miss > 0.004 && D.back < 0.2) { D.back = Math.min(0.2, D.back + miss); done = false; }
      // האצבעות (עצם אחת לכל ארבע האצבעות): הקצוות באותו גובה כמו כף היד מעל הירך (שוכבות עליה) —
      // נמוכות יותר (נכנסות או מחזיקות את היד באוויר) — מיישרים; גבוהות יותר — מכופפים אל הירך
      const dt = H.tipMed - H.palmMin - 0.004;
      if (Math.abs(dt) > 0.003 && D.curl > -40 && D.curl < 45) { D.curl += THREE.MathUtils.clamp(dt * 500, -6, 6); done = false; }
      // גלגול כף היד סביב כיוון האצבעות: האצבעות בשני הצדדים מרחפות בערך אותו דבר
      if (Math.abs(H.rollErr) > 0.004 && Math.abs(D.roll) < 35) { D.roll += THREE.MathUtils.clamp(H.rollErr * 250, -4, 4); done = false; }
      // האגודל: בתוך הירך — למעלה; מרחף יותר מס"מ — למטה
      if (H.thumbMin < 0.002 && D.thumb < 80) { D.thumb += 5; done = false; }
      else if (H.thumbMin > 0.012 && H.thumbMin < 1 && D.thumb > -30) { D.thumb -= 4; done = false; }
      const dl = 0.003 - H.minD;
      if (Math.abs(dl) > 0.0007) { D.lift = THREE.MathUtils.clamp(D.lift + THREE.MathUtils.clamp(dl, -0.03, 0.03), 0, 0.3); done = false; }
    }
    if (done) break;
  }
  if (!S) S = handState(root, skinVerts, dirs);
  const res = {};
  for (const s of ['Left', 'Right']) res[s] = { inside: S[s].inside, pen: Math.max(0, -S[s].minAll), minD: S[s].minAll, thumbMin: S[s].thumbMin, thumb: dirs[s].thumb, roll: dirs[s].roll, back: dirs[s].back, lat: dirs[s].lat, latErr: dirs[s].latErr, miss: B(s + 'Hand').getWorldPosition(V()).distanceTo(dirs[s].target), tipQ: S[s].tipQ, pca: dirs[s].pca, fit: dirs[s].fit, tipBins: S[s].tipBins.map(v => +(v * 1000).toFixed(1)), tipFloat: S[s].tipFloat, curl: dirs[s].curl, lift: dirs[s].lift, n: S[s].hand.length, tris: S[s].tris.length };
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
  // הידיים: מונחות על הירכיים (placeHands), בסוף — כשהאגן והרגליים כבר במקום
  const hands = placeHands(root, st, skinVerts);
  m = measure(root, skinVerts, depth);
  const origin = new THREE.Vector3(m.hips.x, m.butt - seatH, m.back);
  const quats = new Map();
  root.traverse(o => { if (o.isBone) quats.set(o.name, o.quaternion.clone()); });
  const W = n => root.getObjectByName(n).getWorldPosition(V()).sub(origin);
  const feet = W('LeftFoot').add(W('RightFoot')).multiplyScalar(0.5).setY(0);
  return { root, origin, quats, hip: W('Hips'), feet, ankles: [W('LeftFoot'), W('RightFoot')], err: { ground: m.butt - seatH, shoe: m.shoe - origin.y }, lean, hands, knee: (W('LeftLeg').z + W('RightLeg').z) / 2 };
}
