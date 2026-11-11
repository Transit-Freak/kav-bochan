// רצועות האחיזה בתקרה, כמו באוטובוס עירוני בארץ: מחזיק פלסטיק שחור מהודק על המוט הצהוב, וממנו תלויה לולאה צהובה
// ארוכה (רצועה שטוחה ברוחב 2.5 ס"מ) בצורת טיפה מתוחה — צרה למעלה, כ-12 ס"מ ברוחב ומעוגלת למטה, כ-30 ס"מ אורך.
// במקום הטבעות הקטנות מהדגם (SM_StrapRing*): שתי רשתות InstancedMesh לכל אוטובוס (מחזיקים, רצועות),
// והרצועות מתנדנדות קצת לפי התאוצה והפנייה של האוטובוס (סיבוב סביב המוט — זול, מטריצה לכל רצועה).
// מערכת הצירים של האוטובוס: ‎+Z קדימה, ‎+Y למעלה.
import * as THREE from 'three';

const RAIL0 = 2.51, RAIL_R = 0.016;                 // המוט האורכי בתקרה כמו שהוא בדגם (x = ±0.5) — נמוך מדי
// מגביהים את המוט ואת הקשתות (liftPoles): תחתית הלולאה כ-1.83 מ' מעל הרצפה (0.675), כמו באוטובוס אמיתי
const FLOOR = 0.675, LIFT_FROM = 1.95, TOP0 = RAIL0 + 0.02, TOP1 = 2.85, ARCH0 = 2.78, ARCH1 = 3.0;
const lift = y => y <= LIFT_FROM ? y : y <= TOP0 ? LIFT_FROM + (y - LIFT_FROM) * (TOP1 - LIFT_FROM) / (TOP0 - LIFT_FROM)
  : TOP1 + (Math.min(y, ARCH0) - TOP0) * (ARCH1 - TOP1) / (ARCH0 - TOP0) + Math.max(0, y - ARCH0);
const RAIL_Y = lift(RAIL0);
const HOLD = { w: 0.042, h: 0.06, d: 0.052 };        // המחזיק: רוחב (x), גובה, אורך לאורך המוט (z)
export const HELD_TILT = Math.asin(0.03 / 0.32);    // הזווית של רצועה שמישהו מחזיק בה ומושך אליו
const LOOP = 0.30, BOTTOM_W = 0.12, BAND_W = 0.025;  // אורך הלולאה מתחת למחזיק, רוחב התחתית, רוחב הרצועה

// מחזיק: תיבה מעוגלת סביב המוט, קצת צרה למטה, עם חריץ שממנו יוצאת הרצועה
function holderGeometry() {
  const g = new THREE.BoxGeometry(HOLD.w, HOLD.h, HOLD.d, 4, 6, 4);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = (v.y + HOLD.h / 2) / HOLD.h;               // 0 למטה, 1 למעלה
    const k = 0.62 + 0.38 * Math.sqrt(t);                // מתחדד למטה
    v.x *= k; v.z *= 0.8 + 0.2 * Math.sqrt(t);
    // פינות מעוגלות: מושכים פנימה את הקודקודים שבפינות
    const cx = Math.abs(v.x) / (HOLD.w / 2), cz = Math.abs(v.z) / (HOLD.d / 2);
    if (cx > 0.7 && cz > 0.7) { v.x *= 0.92; v.z *= 0.92; }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // מרכז המוט בגובה 0; המחזיק עוטף אותו (מעט מעליו) ויורד מתחתיו
  g.translate(0, HOLD.h / 2 - HOLD.h + RAIL_R + 0.012, 0);
  return g;
}

// הלולאה: עקומה במישור y-z (מקבילה למוט), והרצועה השטוחה לרוחב (x). מתחילה ונגמרת בתוך המחזיק
function loopGeometry() {
  const top = -(HOLD.h - RAIL_R - 0.012) + 0.012;      // קצת בתוך המחזיק
  const L = LOOP, a = BOTTOM_W / 2;
  const half = [[0.008, top], [0.012, top - 0.03], [0.022, top - 0.09], [0.036, top - 0.16], [0.05, top - 0.22],
    [a, top - L + 0.05], [a * 0.82, top - L + 0.017], [a * 0.42, top - L + 0.002], [0, top - L]];
  const pts = [...half.map(([z, y]) => new THREE.Vector3(0, y, -z)), ...half.slice(0, -1).reverse().map(([z, y]) => new THREE.Vector3(0, y, z))];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 72, pos = [], nor = [], idx = [];
  const T = new THREE.Vector3(), n = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), P = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    curve.getPointAt(u, P); curve.getTangentAt(u, T);
    n.crossVectors(T, X).normalize();                     // הניצב במישור, כלפי חוץ
    if (n.y * (P.y - (top - L / 2)) + n.z * P.z < 0) n.negate();
    const low = Math.max(0, Math.min(1, ((top - L * 0.55) - P.y) / (L * 0.3)));
    const th = 0.0035 + 0.0035 * low;                     // החלק התחתון (הידית) עבה יותר
    for (const [sx, sn] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      pos.push(sx * BAND_W / 2, P.y + n.y * th * sn, P.z + n.z * th * sn);
    }
    // ארבע פאות: חוץ, פנים, ושני צדדים. נורמלים לכל קודקוד לפי הפאה העיקרית (חוץ/פנים); הצדדים צרים
    nor.push(0, n.y, n.z, 0, n.y, n.z, 0, -n.y, -n.z, 0, -n.y, -n.z);
  }
  for (let i = 0; i < N; i++) {
    const a0 = i * 4, b0 = (i + 1) * 4;
    const quad = (p, q) => idx.push(a0 + p, b0 + p, b0 + q, a0 + p, b0 + q, a0 + q);
    quad(0, 1); quad(2, 3); quad(1, 2); quad(3, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// המוטות הצהובים (M_Pole) מעל LIFT_FROM נמתחים למעלה: המוט האורכי ל-TOP1, והחלק של הקשתות שמעליו נדחס עד מתחת לתקרה (3.06).
// מה שמתחת ל-LIFT_FROM (מוטות אנכיים, ידיות במושבים, הדלתות) לא זז. כל רשת מקבלת עותק משלה של הגאומטריה
function liftPoles(busRoot) {
  busRoot.updateMatrixWorld(true);
  const v = new THREE.Vector3(), inv = new THREE.Matrix4();
  busRoot.traverse(o => {
    const m = o.isMesh && [].concat(o.material)[0];
    if (!m || m.name !== 'M_Pole' || /^SM_StrapRing/.test(o.name)) return;
    const pos = o.geometry.attributes.position; let hit = false;
    for (let i = 0; i < pos.count && !hit; i++) if (v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y > LIFT_FROM) hit = true;
    if (!hit) return;
    o.geometry = o.geometry.clone();
    const P = o.geometry.attributes.position; inv.copy(o.matrixWorld).invert();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      if (v.y <= LIFT_FROM) continue;
      v.y = lift(v.y); v.applyMatrix4(inv); P.setXYZ(i, v.x, v.y, v.z);
    }
    P.needsUpdate = true; o.geometry.computeBoundingSphere(); o.geometry.computeBoundingBox();
  });
}

let SHARED = null;
function shared(poleMat) {
  if (SHARED) return SHARED;
  const yellow = new THREE.MeshStandardMaterial({ name: 'M_Strap', color: poleMat?.color ? poleMat.color.clone() : new THREE.Color(0.95, 0.72, 0.05), roughness: 0.55, metalness: 0 });
  const black = new THREE.MeshStandardMaterial({ name: 'M_StrapHolder', color: 0x0b0b0c, roughness: 0.45, metalness: 0 });
  SHARED = { holder: holderGeometry(), loop: loopGeometry(), yellow, black };
  return SHARED;
}

// בתוך דגם האוטובוס (פעם אחת, לפני השכפול): מסתירים את הטבעות הישנות ואת המוטות הקטנים שהחזיקו אותן,
// ומוסיפים רצועות באותם מקומות. מחזיר את מספר הרצועות
export function addStraps(busRoot) {
  if (!busRoot || busRoot.getObjectByName('Straps')) return 0;
  busRoot.updateMatrixWorld(true);
  const spots = [], rings = [];
  let poleMat = null;
  busRoot.traverse(o => {
    if (!/^SM_StrapRing/.test(o.name)) return;
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
    o.visible = false; rings.push(new THREE.Vector3(Math.sign(c.x) * 0.5, RAIL_Y, c.z));
    // ליד העמוד האנכי שמעל הדלת האמצעית (z = 0.75) — בלי רצועה (הטבעת של z = 0.70 נוגעת בו)
    if (c.z > 0.4 && c.z < 1.15) return;
    spots.push(new THREE.Vector3(Math.sign(c.x) * 0.5, RAIL_Y, c.z));
    o.traverse(m => { if (m.isMesh && !poleMat) poleMat = [].concat(m.material)[0]; });
  });
  if (!rings.length) return 0;
  // המוטות הקצרים (M_Pole בגוף האוטובוס) בין המוט לטבעת: משולשים קטנים מתחת למוט, ליד כל טבעת
  busRoot.traverse(o => {
    const m = o.isMesh && [].concat(o.material)[0];
    if (!m || m.name !== 'M_Pole' || !o.geometry.index || o.name.startsWith('SM_')) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index.array, keep = [];
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let cut = 0;
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(o.matrixWorld);
      const stem = v.every(p => p.y > 2.3 && p.y < RAIL0 - 0.004 && Math.abs(Math.abs(p.x) - 0.5) < 0.03) &&
        rings.some(s => v.every(p => Math.abs(p.z - s.z) < 0.03 && Math.sign(p.x) === Math.sign(s.x)));
      if (stem) cut++; else keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (cut) g.setIndex(keep);
  });
  liftPoles(busRoot);
  const S = shared(poleMat);
  const grp = new THREE.Group(); grp.name = 'Straps';
  const hold = new THREE.InstancedMesh(S.holder, S.black, spots.length), loop = new THREE.InstancedMesh(S.loop, S.yellow, spots.length);
  hold.name = 'StrapHolders'; loop.name = 'StrapLoops';
  const M = new THREE.Matrix4();
  spots.forEach((p, i) => { M.makeTranslation(p.x, p.y, p.z); hold.setMatrixAt(i, M); loop.setMatrixAt(i, M); });
  for (const im of [hold, loop]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grp.add(im); }
  grp.userData.spots = spots.map(p => [p.x, p.y, p.z]);
  busRoot.add(grp);
  return spots.length;
}

// נדנוד: לכל אוטובוס קפיץ מרוסן אחד (קדימה-אחורה ולצדדים) שמושך אל הזווית שהתאוצה נותנת.
// כל רצועה בזווית קצת אחרת (אורך ומשקל שונים מעט), ו"רעד" קטן בזמן נסיעה
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3(1, 1, 1);
export function swayStraps(v, bus, yaw, simDt, dt) {
  const grp = v.straps || (v.straps = v.obj.getObjectByName('Straps') || null);
  if (!grp || !dt) return;
  const st = v.sway || (v.sway = { a: 0, va: 0, b: 0, vb: 0, v: bus.v || 0, yaw, t: Math.random() * 10, acc: 0, lat: 0 });
  if (simDt > 0) {
    // תאוצה (מ/ש²) וקצב פנייה, בזמן המשחק; מוחלקים כדי שלא יקפצו בין פריימים
    const acc = ((bus.v || 0) - st.v) / simDt;
    let dyaw = yaw - st.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const lat = (bus.v || 0) * dyaw / simDt;
    const k = Math.min(1, dt * 4);
    st.acc += (THREE.MathUtils.clamp(acc, -4, 4) - st.acc) * k; st.lat += (THREE.MathUtils.clamp(lat, -4, 4) - st.lat) * k;
  }
  st.v = bus.v || 0; st.yaw = yaw; st.t += dt;
  // הזווית שהתאוצה נותנת (מטוטלת: tan = a/g), והקפיץ (תדר ~1.1 הרץ, ריסון חלש)
  const ta = Math.atan2(st.acc, 9.8), tb = Math.atan2(-st.lat, 9.8);
  const w = 7, z = 0.35, h = Math.min(dt, 0.05);
  for (let n = Math.ceil(dt / h), i = 0; i < n; i++) {
    st.va += (-w * w * (st.a - ta) - 2 * z * w * st.va) * h; st.a += st.va * h;
    st.vb += (-w * w * (st.b - tb) - 2 * z * w * st.vb) * h; st.b += st.vb * h;
  }
  const moving = Math.min(1, (bus.v || 0) / 6);
  const hold = grp.children[0], loop = grp.children[1], spots = grp.userData.spots;
  spots.forEach(([x, y, zz], i) => {
    const f = grp.userData.held?.has(i) ? 0 : 0.85 + ((i * 0.618) % 1) * 0.3;   // רצועה שמישהו מחזיק — לא מתנדנדת (היד עליה)
    const j = f ? moving * 0.03 * Math.sin(st.t * (5.3 + f) + i * 1.7) : 0;
    _E.set(THREE.MathUtils.clamp(st.a * f + j, -0.5, 0.5), 0, THREE.MathUtils.clamp(st.b * f + j * 0.5, -0.4, 0.4));
    if (!f) _E.set(0, 0, Math.sign(x) * HELD_TILT);   // רצועה שמחזיקים בה: נמשכת מעט אל העומד (3 ס"מ בתחתית), מתוחה
    _M.compose(_P.set(x, y, zz), _Q.setFromEuler(_E), _S);
    loop.setMatrixAt(i, _M);
    // המחזיק מסתובב רק מעט סביב המוט (הוא מהודק)
    _E.set(0, 0, THREE.MathUtils.clamp(st.b * 0.3, -0.1, 0.1));
    _M.compose(_P, _Q.setFromEuler(_E), _S); hold.setMatrixAt(i, _M);
  });
  loop.instanceMatrix.needsUpdate = true; hold.instanceMatrix.needsUpdate = true;
}
