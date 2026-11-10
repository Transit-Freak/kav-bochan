// מבט פקח (תפקיד "פקח"): עולים לאוטובוס בדלת הקדמית ובודקים כרטיסים בגוף ראשון.
// המצלמה בגובה העיניים (1.65 מ' מעל הרצפה) ונעה רק לאורך מסלול קבוע במעבר (קו האמצע — לא דרך עמודים ומושבים):
// גרירה למעלה/למטה או ▲▼ — קדימה ואחורה; גרירה לצדדים — מבט ימינה ושמאלה. רואים רק יד שמחזיקה את מכשיר הרב-קו.
// הנוסעים יושבים במקומם (PeopleLayer.onboard). הקשה על נוסע עד 1.2 מ' (צריך להתקרב אליו) — המכשיר מצפצף, ומעל הראש ✓ (יש כרטיס) או ✗ (אין —
// לפי ההתחמקות בסימולציה, p.noTicket). בלי כרטיס: "קנס" או "אזהרה"; המכשיר מראה אם הנוסע כבר קיבל אזהרה (נשמר בשמירה,
// לפי "אדם" — מוצא, יעד וסוג נוסע — כדי שאותו נוסע יחזור בימים אחרים). ניקוד: נבדק +1, תפיסה +5, החלטה נכונה (אזהרה לראשונה,
// קנס לחוזר) +10, השנייה +3 (אזהרה שנייה — −5). בתחנה הבאה — סיכום, וירידה או המשך.
import * as THREE from 'three';
import { FINE } from './ops.js';
import { dayOf } from './fleet.js';
import { STAND_POLE } from './actors.js';

// העיניים 1.57 מ' מעל רצפת האוטובוס (אדם בגובה ממוצע). אותה מערכת צירים של האוטובוס כמו במבט הנהג (הרצפה ב-0.675 מעל הכביש)
const FLOOR = 0.675, EYE = FLOOR + 1.57, REACH = 1.2;
// המעבר: מהדלת הקדמית, ליד המתקף, ואז לאורך האמצע עד המושבים האחרונים
const PATH = [[-0.95, 5.15], [-0.3, 4.98], [0, 4.3], [0, -4.9]];       // עוקף את העמוד המעוקל שליד הדלת (z ≈ 4.5) ואת המתקף
// המושבים (מתוך ידיות האחיזה בדגם: מושב מול כל משענת, פונה קדימה) וכמה מקומות עמידה ליד הדלת האמצעית
// המושבים (נמדדו בדגם): לכל שורה — ידית האחיזה בראש המשענת (z), הכרית בגובה 1.14 ומ-z+0.10 עד z+0.50, והגב בגובה האגן ב-z+0.12.
// זוג מושבים בכל צד: מעבר (x ≈ 0.58) וחלון (x ≈ 0.87). [x, הרצפה, z של הגב]
const ROWS = [3.7, 2.9, 2.1, 1.3, -1.9, -2.7, -3.5, -4.3, -5.1], SIDES = { 3.7: [-1], 2.9: [-1] };
export const SEAT_H = 1.14 - FLOOR, SEAT_DEPTH = 0.37;
// המושבים צרים (29 ס"מ בין מרכזים) — כתפיים של שני אנשים לא נכנסות בהם. לכן היושב במעבר זז מעט אל המעבר (10 ס"מ)
// וזה שליד החלון מעט אל החלון (5 ס"מ), כמו שאנשים יושבים באמת, וכך אין חפיפה בין השכנים
const SEATS = ROWS.flatMap(z => [0.872, 0.578, -0.578, -0.872].filter(x => !SIDES[z] || SIDES[z].includes(Math.sign(x))).map(x => [x + Math.sign(x) * (Math.abs(x) > 0.7 ? 0.05 : -0.1), FLOOR, z + 0.125]));
// השכן באותו זוג מושבים, ומושבים בשורות הסמוכות באותו צד
const PAIR = SEATS.map(a => SEATS.findIndex(b => b !== a && b[2] === a[2] && Math.sign(b[0]) === Math.sign(a[0])));
const NEAR = SEATS.map(a => SEATS.map((b, k) => k).filter(k => SEATS[k] !== a && Math.sign(SEATS[k][0]) === Math.sign(a[0]) && Math.abs(SEATS[k][2] - a[2]) < 0.9));
// מקומות העמידה ליד הדלת האמצעית: מאחורי העמודים האנכיים שבשפת המעבר (x = ±0.50, z = 0.75 / -0.36 / -0.70 — לא ליד העמוד של z = 1.24, צמוד מדי למושבים;
// מימין, מול הדלת, יש משענת מתקפלת ב-z ≈ -0.4 — שם עומדים מאחוריה, ליד העמוד של z = -0.70),
// פונים קדימה, והיד שבצד המעבר על העמוד (STAND_POLE ב-actors.js). [x, הרצפה, z של האגן, היד]
const STANDS = [[1, 0.75], [-1, 0.75], [1, -0.70], [-1, -0.36]].map(([sx, pz]) => [sx * (0.5 + STAND_POLE.dx), FLOOR, pz - STAND_POLE.dz, sx > 0 ? 'Right' : 'Left']);
const hash = i => { const x = Math.sin(i * 77.7 + 3.1) * 43758.5453; return x - Math.floor(x); };
const day2date = d => { const t = new Date(2026, 10, 1 + (d - 1)); return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}`; };
// אותו אדם בכל הימים: תושב קבוע או עובד מבחוץ (residents.js) — לפי המספר שלו; אחרים — לפי מוצא, יעד וסוג
export const personKey = p => (p.who != null && p.who > -1e6 ? `r${p.who}` : p.o >= 0 && p.d >= 0 ? `${p.o}-${p.d}-${p.id % 3}` : `x${p.id}`);

// תפוסה של האוטובוס ושל הנוסעים בתוכו (במערכת הצירים של האוטובוס, תאים של 3 ס"מ): גוף האוטובוס (מושבים, מחיצת הנהג,
// עמודים, דפנות) — פעם אחת; הנוסעים — מחדש כשמשהו משתנה (עלה/ירד/הושיט יד). בשביל המצלמה, היד והמכשיר של הפקח
const OC = 0.03, OX0 = -1.45, OY0 = 0.6, OZ0 = -5.7, ONX = 97, ONY = 80, ONZ = 400;
class OccGrid {
  constructor() { this.st = new Uint8Array(ONX * ONY * ONZ); this.pp = new Uint8Array(ONX * ONY * ONZ); this.key = ''; }
  idx(x, y, z) { const i = Math.floor((x - OX0) / OC), j = Math.floor((y - OY0) / OC), k = Math.floor((z - OZ0) / OC); return i < 0 || j < 0 || k < 0 || i >= ONX || j >= ONY || k >= ONZ ? -1 : (k * ONY + j) * ONX + i; }
  // נוסע בטבעת ברדיוס r סביב הנקודה (מגובה הכתפיים של יושב ועד העיניים) — למצלמה: לא צמודה לכתף או לראש של נוסע
  ring(x, z, y0, y1, r) { for (let y = y0; y <= y1; y += 0.1) for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2, i = this.idx(x + Math.cos(t) * r, y, z + Math.sin(t) * r); if (i >= 0 && this.pp[i]) return true; } return false; }
  has(x, y, z) { const i = this.idx(x, y, z); return i >= 0 && (this.st[i] || this.pp[i]); }
  // משולש: דגימות כל 2 ס"מ על פני השטח
  tri(A, a, b, c) { const e = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)), n = Math.max(1, Math.ceil(e / 0.02)), q = new THREE.Vector3();
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { q.set(0, 0, 0).addScaledVector(a, i / n).addScaledVector(b, j / n).addScaledVector(c, 1 - (i + j) / n); const k = this.idx(q.x, q.y, q.z); if (k >= 0) A[k] = 1; } }
  bus(o) {
    o.updateMatrixWorld(true); const inv = o.matrixWorld.clone().invert(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    o.traverse(m => { if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || /^Leaf_|Windshield/i.test(m.name)) return;
      const g = m.geometry, P = g.attributes.position, I = g.index, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), n = I ? I.count : P.count;
      for (let t = 0; t < n; t += 3) { a.fromBufferAttribute(P, I ? I.getX(t) : t).applyMatrix4(M); b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1).applyMatrix4(M); c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2).applyMatrix4(M);
        // הרצפה והתקרה לא חוסמות (המצלמה והיד ביניהן)
        if (Math.max(a.y, b.y, c.y) < 0.7 || Math.min(a.y, b.y, c.y) > 2.55) continue;
        this.tri(this.st, a, b, c); } });
  }
  // הנוסעים: הקודקודים של כל אחד בתנוחה שלו (עם מעט "עובי" — גם התאים השכנים)
  people(shapes, inv, skip) {
    shapes = shapes.filter(s => s.pid !== skip);
    const key = shapes.map(s => s.pid + s.key + Math.round(s.M.elements[12] * 100)).join('|'); if (key === this.key) return; this.key = key;
    this.pp.fill(0); const q = new THREE.Vector3(), M = new THREE.Matrix4();
    for (const s of shapes) { M.multiplyMatrices(inv, s.M);
      for (const g of s.groups) { const P = g.geo.attributes.position; for (let i = 0; i < P.count; i++) { q.fromBufferAttribute(P, i).applyMatrix4(M); const k = this.idx(q.x, q.y, q.z); if (k >= 0) this.pp[k] = 1; } } }
  }
  // הקו מ-a ל-b (במערכת האוטובוס) עובר דרך משהו תפוס? (צעדים של 1.5 ס"מ; skip — נקודה שליד הכרטיס לא נבדקת)
  blocked(a, b, skip) { const d = a.distanceTo(b), n = Math.ceil(d / 0.015), q = new THREE.Vector3();
    for (let i = 1; i <= n; i++) { q.lerpVectors(a, b, i / n); if (skip && q.distanceTo(skip) < 0.2) continue; if (this.has(q.x, q.y, q.z)) return true; } return false; }
}

export class InspectorFP {
  constructor(g) {          // g: { camera, scene, canvas, people, sim, bank, busObject(b), toast, ui:{...}, setSpeed, speed(), onExit() }
    this.g = g; this.bus = null; this.s = 0; this.yaw = 0; this.icons = new Map();
    this.reader = buildReader(); this.bindUI();
  }
  get on() { return !!this.bus; }
  enter(bus) {
    const o = this.g.busObject(bus); if (!o) return false;
    this.bus = bus; this.obj = o; this.s = 0; this.yaw = 0; this.v = 0;
    this.stats = { checked: 0, caught: 0, fines: 0, warns: 0, pts: 0, t0: performance.now() };
    this.prevState = bus.state; this.lastStop = bus.next; this.sumAt = 0;
    const seat = new Map(), stand = new Map();
    // מקום קבוע לכל נוסע: מושב פנוי לפי הסדר (קודם מושבים, אחר כך עמידה)
    // מי שעולה בוחר כמו באמת: קודם זוג מושבים ריק, ולא ליד מי שנראה בדיוק כמוהו (אותו דגם ואותם בגדים)
    const look = id => this.g.people.lookOf ? this.g.people.lookOf(id) : this.g.people.variantOf(id);
    const seatOf = id => {
      if (seat.has(id)) return seat.get(id);
      const who = new Map(); for (const [q, k] of seat) if (k >= 0) who.set(k, q);
      if (who.size >= SEATS.length) { seat.set(id, -1); return -1; }
      const me = look(id), k0 = Math.floor(hash(id) * SEATS.length); let best = -1, bs = Infinity;
      for (let n = 0; n < SEATS.length; n++) { const k = (k0 + n) % SEATS.length; if (who.has(k)) continue;
        const pr = PAIR[k] >= 0 && who.has(PAIR[k]);
        const sc = (pr ? 10 : 0) + (pr && look(who.get(PAIR[k])) === me ? 50 : 0) + NEAR[k].reduce((a, j) => a + (who.has(j) && look(who.get(j)) === me ? 5 : 0), 0);
        if (sc < bs) { bs = sc; best = k; } }
      seat.set(id, best); return best; };
    const standOf = id => { if (!stand.has(id)) { const used = new Map(); for (const [q, j] of stand) used.set(j, q);
      // מקום עמידה פנוי, לא צמוד למי שנראה בדיוק כמוהו (המקומות באותו צד זה ליד זה)
      let j = -1; for (const pass of [0, 1]) { for (let i = 0; i < STANDS.length && j < 0; i++) { if (used.has(i)) continue;
        if (!pass && [...used].some(([jj, q]) => look(q) === look(id) && Math.sign(STANDS[jj][0]) === Math.sign(STANDS[i][0]))) continue; j = i; } if (j >= 0) break; }
      stand.set(id, j); } return stand.get(id); };
    this.g.people.busSitters(SEAT_H, SEAT_DEPTH);
    this.occ = o.userData.occ || (o.userData.occ = (() => { const G = new OccGrid(); G.bus(o); return G; })()); this.occ.key = ''; this.beeps = []; this.auditLog = null;
    // זוג מושבים תפוס בשניהם: שני היושבים "מצטמצמים" מעט לרוחב (כתפיים צמודות), אחרת הכתפיים נכנסות זו בזו
    const shared = k => PAIR[k] >= 0 && [...seat.values()].includes(PAIR[k]);
    const partner = k => { if (PAIR[k] < 0) return null; for (const [q, j] of seat) if (j === PAIR[k]) return q; return null; };
    this.g.people.onboard = { bus, obj: o, seats: SEATS, stands: STANDS, floor: FLOOR, seatOf, standOf, shared, partner, narrow: 0.74 };
    const c = this.g.camera;
    this.saved = { near: c.near, far: c.far, fov: c.fov };
    c.near = 0.05; c.far = 2500; c.fov = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(42)) / c.aspect)), 70, 100); c.updateProjectionMatrix();
    this.g.scene.add(c); c.add(this.reader.group); this.reader.show('רב-קו · מוכן לבדיקה', 'הקישו על נוסע', null);
    // בגוף ראשון — בזמן אמת (×1): במהירות גבוהה היורדים "נורים" מהדלת. ביציאה חוזרים למהירות הקודמת
    this.speed0 = this.g.speed(); this.g.setSpeed(1);
    // לא נכנסים לאוטובוס לתוך מי שעולה או יורד: מתחילים בנקודה הראשונה במעבר שרחוקה 50 ס"מ לפחות מכל הולך
    o.updateMatrixWorld(true);
    const ws = this.g.people.walkers.filter(w => w.obj.visible && w.bus === bus).map(w => o.worldToLocal(w.obj.getWorldPosition(new THREE.Vector3())));
    for (let t = 0; t <= this.len; t += 0.1) { const P = this.pathAt(t); if (ws.every(w => Math.hypot(w.x - P.x, w.z - P.z) >= 0.5)) { this.s = t; break; } }
    this.g.ui.root.hidden = false; this.render(); return true;
  }
  exit() {
    if (!this.bus) return;
    for (const sp of this.icons.values()) sp.parent?.remove(sp); this.icons.clear();
    this.anim = null; this.g.people.reach = null; this.readerOff = null; this.reader.group.position.set(0, 0, 0); this.g.people.fpEye = null;
    if (this.speed0 > 1 && this.g.speed() === 1) this.g.setSpeed(this.speed0);
    this.g.people.onboard = null; this.reader.group.parent?.remove(this.reader.group);
    const c = this.g.camera, s = this.saved; this.g.scene.remove(c);
    if (s) { c.near = s.near; c.far = s.far; c.fov = s.fov; c.updateProjectionMatrix(); }
    this.bus = null; this.obj = null; this.g.ui.root.hidden = true; this.g.ui.decide.hidden = true; this.g.ui.sum.hidden = true;
    this.g.onExit?.();
  }
  // נקודה על המסלול (0 — הדלת, אורך המסלול — הסוף)
  pathAt(s, out = new THREE.Vector3()) {
    let d = s;
    for (let i = 0; i + 1 < PATH.length; i++) {
      const [x0, z0] = PATH[i], [x1, z1] = PATH[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      if (d <= L || i + 2 === PATH.length) { const k = Math.min(1, d / L); return out.set(x0 + (x1 - x0) * k, EYE, z0 + (z1 - z0) * k); }
      d -= L;
    }
    return out;
  }
  // המקום על המסלול (s) שבו המעבר נמצא ב-z (בקטע הישר של המעבר)
  sOfZ(z) { let L = 0; for (let i = 0; i + 2 < PATH.length; i++) L += Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]); return L + (PATH[PATH.length - 2][1] - z); }
  get len() { let L = 0; for (let i = 0; i + 1 < PATH.length; i++) L += Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]); return L; }
  update(dt) {
    const b = this.bus; if (!b) return;
    const o = this.g.busObject(b);
    if (!o || b.state === 'done' || b.state === 'gone') { this.summary(true); return; }
    this.obj = o; this.g.people.onboard.obj = o;
    // תנועה: ▲▼ (לחיצה ארוכה) או גרירה — חלק, עם תאוצה קטנה
    const want = (this.hold || 0) * 1.3;
    this.v += (want - this.v) * Math.min(1, dt * 6);
    const PL = this.g.people, inv = o.matrixWorld.clone().invert();
    // מי שהולך במעבר (יורד/עולה) ומחכה מול הפקח יותר מ-0.6 ש' — הפקח זז ממנו במעבר, עד שיש מקום
    const blk = PL.fpBlock && PL.fpBlock.waitFP > 0.6 ? o.worldToLocal(PL.fpBlock.obj.getWorldPosition(new THREE.Vector3())) : null;
    let ns = THREE.MathUtils.clamp(this.s + this.v * dt, 0, this.len);
    if (this.slideTo != null) { const d = this.slideTo - this.s; if (Math.abs(d) < 0.01) this.slideTo = null; else ns = this.s + Math.sign(d) * Math.min(Math.abs(d), 1.2 * dt); }
    if (blk) { const P0 = this.pathAt(this.s), P1 = this.pathAt(Math.min(this.len, this.s + 0.2)); const away = (P1.x - P0.x) * (blk.x - P0.x) + (P1.z - P0.z) * (blk.z - P0.z) > 0 ? -1 : 1; ns = THREE.MathUtils.clamp(this.s + away * 0.8 * dt, 0, this.len); }
    // המצלמה לא נכנסת בגוף: לא מתקרבים לפחות מ-40 ס"מ ממי שהולך במעבר, ולא לתוך תא תפוס
    const E = this.pathAt(ns), E0 = this.pathAt(this.s);
    const near = q => PL.walkers.some(w => w.obj.visible && w.mode !== 'ride' && (() => { const l = o.worldToLocal(w.obj.getWorldPosition(new THREE.Vector3())); return Math.hypot(l.x - q.x, l.z - q.z) < 0.4; })());
    // ולא מתקרבים לראש של נוסע יושב/עומד לפחות מ-45 ס"מ (במישור) — הפקח עומד במעבר, לא מעל הכתף של אף אחד
    const heads = [...(PL.onboardPos || new Map()).values()].map(h => o.worldToLocal(h.clone()));
    const hd = q => heads.reduce((m, h) => Math.min(m, Math.hypot(h.x - q.x, h.z - q.z)), 9);
    const okHead = (hd(E) >= 0.45 || hd(E) >= hd(E0)) && (!this.occ.ring(E.x, E.z, 1.65, E.y, 0.15) || this.occ.ring(E0.x, E0.z, 1.65, E0.y, 0.15));
    // מפנים את הדרך למי שיורד/עולה גם אם זה מקרב לראש של יושב (הפקח עובר לידו במעבר); ואם הוא מחכה כבר 2 ש' — גם הצידה
    if ((!near(E) || near(E0)) && (okHead || blk) && !this.occ.has(E.x, E.y, E.z)) this.s = ns; else { this.v = 0; this.slideTo = null; }
    if (blk && PL.fpBlock.waitFP > 2) this.latTo = -Math.sign(blk.x || 1) * 0.12;
    else if (!this.anim && !blk) this.latTo = 0;
    const P = this.pathAt(this.s), A = this.pathAt(Math.min(this.len, this.s + 0.3)), dir = A.clone().sub(P); if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    // בבדיקה: הפקח זז לצד השני של המעבר (עד 10–12 ס"מ מהמרכז — לא יוצא מהמעבר ולא נצמד לכתפיים של היושבים), כדי לעמוד במרחק מהנוסע
    { const nl = (this.lat || 0) + ((this.latTo || 0) - (this.lat || 0)) * Math.min(1, dt * 4);
      // לא זזים הצידה אל כתף או ראש של נוסע (בטבעת של 15 ס"מ, מגובה הכתפיים של יושב)
      const okL = l => !this.occ.ring(P.x + l, P.z, 1.65, P.y, 0.15);
      if (okL(nl) || !okL(this.lat || 0)) this.lat = nl; else this.latTo = this.lat;
      if (!okL(this.lat) && okL(0)) this.lat *= 0.8; }
    if (P.z < 4.2) P.x += this.lat;
    const base = Math.atan2(dir.x, dir.z) + (this.s < 0.4 ? 0 : 0), yaw = base + this.yaw;
    o.updateMatrixWorld(true);
    const c = this.g.camera, T = P.clone().add(new THREE.Vector3(Math.sin(yaw), -0.28, Math.cos(yaw)));
    c.position.copy(o.localToWorld(P.clone())); c.lookAt(o.localToWorld(T)); c.updateMatrixWorld(true);
    PL.fpEye = c.position.clone();
    this.occ.people(PL.onboardShapes || [], inv, this.anim?.pid);   // מי שמגיש — נבדק בנפרד (clearance), בלי היד שלו
    // הסמלים מעל הראש של מי שנבדק — עוקבים אחרי המקום שלו
    for (const [pid, sp] of this.icons) { const h = this.g.people.onboardPos?.get(pid); if (!h || !b.pax.some(p => p.id === pid)) { sp.parent?.remove(sp); this.icons.delete(pid); continue; } sp.position.copy(h).add(new THREE.Vector3(0, 0.32, 0)); }
    // תחנה: סיכום (פעם אחת לכל תחנה)
    if (b.state === 'dwell' && this.prevState === 'drive' && this.stats.checked > this.sumAt) this.summary(false);
    if (this.prevState !== b.state) this.prevState = b.state;
    this.animate(dt);
    this.clearance(o, inv);
    this.render();
  }
  // לבדיקות: המצלמה בתוך משהו? המרחק להולך הקרוב; כמה נקודות של היד/המכשיר חסומות (אחרי התיקון)
  audit() {
    const o = this.obj, c = this.g.camera; if (!o) return null; const e = o.worldToLocal(c.position.clone());
    let wmin = 9; for (const w of this.g.people.walkers) { if (!w.obj.visible || w.mode === 'ride') continue; const l = o.worldToLocal(w.obj.getWorldPosition(new THREE.Vector3())); wmin = Math.min(wmin, Math.hypot(l.x - e.x, l.z - e.z)); }
    const hm = [...(this.g.people.onboardPos || new Map()).values()].reduce((m, h) => { const l = o.worldToLocal(h.clone()); return Math.min(m, Math.hypot(l.x - e.x, l.z - e.z)); }, 9);
    const ringOcc = this.occ.ring(e.x, e.z, 1.65, e.y, 0.15);
    return { ringOcc, headMin: +hm.toFixed(2), camOcc: !!this.occ.has(e.x, e.y, e.z), walkerMin: +wmin.toFixed(2), readerHits: this.lastHits || 0, pull: +(this.lastPull || 0).toFixed(2), anim: this.anim ? +this.anim.t.toFixed(2) : null };
  }
  // היד והמכשיר של הפקח לא נכנסים בשום דבר: נקודות על המכשיר, היד והאמה — הקו מהעין אליהן פנוי? אם לא, מקרבים
  // את היד אל הגוף (עד 30 ס"מ), ואם עדיין חסום — מורידים אותה מהמסך. ליד הכרטיס המושט (20 ס"מ — היד שמחזיקה אותו) לא בודקים
  clearance(o, inv) {
    const g = this.reader.group, c = this.g.camera, eye = o.worldToLocal(c.position.clone()), card = this.g.people.cardWorld ? o.worldToLocal(this.g.people.cardWorld.clone()) : null;
    const base = this.readerOff || new THREE.Vector3(), dir = this.reader.rest.clone().normalize();
    // מי שמגיש: הראש (כדור 13 ס"מ) והגו (מהאגן עד הצוואר, 16 ס"מ) — המכשיר והיד לא נכנסים בהם
    const hw = this.anim && this.g.people.onboardPos?.get(this.anim.pid), head = hw ? o.worldToLocal(hw.clone()) : null;
    const seg = new THREE.Line3(), cp = new THREE.Vector3();
    if (head) seg.set(head.clone().add(new THREE.Vector3(0, -0.62, 0.05)), head.clone().add(new THREE.Vector3(0, -0.18, 0)));
    const inBody = q => head && (q.distanceTo(head) < 0.13 || seg.closestPointToPoint(q, true, cp).distanceTo(q) < 0.16);
    const test = () => { g.position.copy(this.cur); g.updateMatrixWorld(true); let n = 0; const q = new THREE.Vector3();
      for (const p of this.reader.pts) { q.copy(p).applyMatrix4(g.matrixWorld).applyMatrix4(inv); if (this.occ.blocked(eye, q, card) || inBody(q)) n++; } return n; };
    this.cur = this.cur || new THREE.Vector3();
    let hits = 0, pull = 0;
    for (pull = 0; pull <= 0.3001; pull += 0.06) { this.cur.copy(base).addScaledVector(dir, -pull); hits = test(); if (!hits) break; }
    if (hits) { this.cur.copy(base).add(new THREE.Vector3(0, -0.45, 0.1)); test(); }
    this.lastHits = hits; this.lastPull = Math.min(pull, 0.3);
  }
  // הקשה על המסך: הנוסע הקרוב ביותר לנקודה (עד REACH — צריך להתקרב)
  tap(x, y) {
    if (!this.bus || this.anim || !this.g.ui.decide.hidden || !this.g.ui.sum.hidden) return;
    const r = this.g.canvas.getBoundingClientRect(), c = this.g.camera, cam = c.position;
    let best = null, bd = 70;
    for (const [pid, h] of this.g.people.onboardPos || []) {
      if (h.distanceTo(cam) > REACH) continue;
      const v = h.clone().add(new THREE.Vector3(0, -0.25, 0)).project(c); if (v.z > 1) continue;
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height, d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = pid; }
    }
    if (best == null) { const near = [...(this.g.people.onboardPos || []).values()].some(h => h.distanceTo(cam) <= REACH); if (!near) this.g.toast('אין נוסע קרוב — התקרבו אליו (▲▼)'); return; }
    this.check(best);
  }
  // הבדיקה (כשנייה): הנוסע מרים יד אל המעבר — עם רב-קו, או יד ריקה כשאין לו — המכשיר מתקרב לכרטיס, צפצוף, ואז התוצאה
  check(pid) {
    const p = this.bus.pax.find(q => q.id === pid); if (!p) return;
    if (p.checked) { this.reader.show(p.noTicketSeen ? '✗ נבדק — בלי כרטיס' : '✓ כבר נבדק', '', p.noTicketSeen ? 'bad' : 'ok'); return; }
    this.anim = { pid, t: 0, done: false }; this.g.people.reach = { pid, frac: 0, card: !p.noTicket };
    { const hw0 = this.g.people.onboardPos?.get(pid); if (hw0 && this.obj) this.latTo = -Math.sign(this.obj.worldToLocal(hw0.clone()).x) * 0.1; }
    // הפקח עומד במעבר מול הנוסע: זז לאורך המעבר עד השורה שלו (ובצד השני של המעבר — latTo)
    const hw = this.g.people.onboardPos?.get(pid);
    if (hw && this.obj) { const h = this.obj.worldToLocal(hw.clone()), P = this.pathAt(this.s), dx = Math.abs(h.x - P.x);
      // עומדים במעבר מעט לפניו, כ-63 ס"מ מהראש שלו (הכרטיס מוגש קדימה ואל המעבר) — לא מעליו
      if (P.z < 4.3) { const dx = Math.abs(h.x) - 0.1; this.slideTo = THREE.MathUtils.clamp(this.sOfZ(Math.min(4.2, h.z + Math.sqrt(Math.max(0.09, 0.4 - dx * dx)))), 0, this.len); } }
    this.reader.show('רב-קו · מחכה לכרטיס', '', null);
  }
  animate(dt) {
    const A = this.anim; if (!A) { this.readerOff = null; return; }
    A.t += dt; const t = A.t, R = this.g.people.reach, PL = this.g.people, c = this.g.camera;
    // היד של הנוסע: עולה בשלושה שלבים (0–0.2 ש'), מחזיקה, ויורדת אחרי התוצאה
    if (R) { if (A.down == null) R.frac = [0.33, 0.66, 1][Math.min(2, Math.floor(t / 0.1))]; else R.frac = [0.66, 0.33, 0][Math.min(2, Math.floor((t - A.down) / 0.08))]; }
    // המכשיר יוצא אל הכרטיס (כשהיד למעלה), עד 85 ס"מ מהמקום שלו (יד מושטת); הגב של המכשיר עוצר 2 ס"מ לפני הכרטיס
    const card = PL.cardWorld, rest = this.reader.rest;
    if (!A.off) A.off = new THREE.Vector3();
    if (card && A.down == null && t > 0.3) {
      const cl = c.worldToLocal(card.clone()), want = cl.clone().sub(this.reader.faceRest).addScaledVector(cl.clone().normalize(), -0.02); if (want.length() > 0.85) want.setLength(0.85);
      A.off.lerp(want, Math.min(1, dt * 7));
    } else if (A.down != null) A.off.multiplyScalar(Math.max(0, 1 - dt * 6));
    this.readerOff = A.off;
    // צפצוף רק כשהכרטיס באמת ליד המכשיר (פחות מ-8 ס"מ)
    if (!A.done && card && A.down == null) {
      const face = this.reader.face.getWorldPosition(new THREE.Vector3()), d = face.distanceTo(card);
      if (d < 0.08) { A.done = true; const hw = PL.reachHandWorld; const hl = hw && this.obj ? this.obj.worldToLocal(hw.clone()) : null;
        this.beeps.push({ pid: A.pid, t: +t.toFixed(2), cardDist: +d.toFixed(3), handAboveSeat: hl ? +(hl.y - (FLOOR + SEAT_H)).toFixed(3) : null }); this.result(A.pid, true); A.down = t + 0.45; }
    }
    // בלי כרטיס: יד ריקה; התוצאה בלי צפצוף
    if (!A.done && !R?.card && t > 0.9) { A.done = true; this.result(A.pid, false); A.down = t + 0.3; }
    // לא הגיע (רחוק מדי או חסום): מבטלים — צריך להתקרב
    if (!A.done && t > 1.6) { A.done = true; A.down = t; this.reader.show('רב-קו · רחוק מדי', 'התקרבו לנוסע', 'warn'); }
    if (A.down != null && t >= A.down + 0.3) { this.anim = null; this.g.people.reach = null; this.readerOff = null; this.latTo = 0; }
  }
  result(pid, ok) {
    const p = this.bus.pax.find(q => q.id === pid); if (!p) return;
    p.checked = true; this.stats.checked++; this.stats.pts += 1; if (ok) beep(true);
    if (!p.noTicket) { this.reader.show('✓ כרטיס בתוקף', this.g.info?.(p.who)?.lives || 'רב-קו · חוזה פעיל', 'ok'); this.icon(pid, true); this.render(); return; }
    p.noTicketSeen = true; this.stats.caught++; this.stats.pts += 5; this.icon(pid, false);
    const W = this.g.bank.warnings || (this.g.bank.warnings = {}), k = personKey(p), prev = W[k];
    const hist = prev ? `קיבל כבר אזהרה ב-${day2date(prev)}` : 'אזהרה ראשונה';
    this.reader.show('✗ אין כרטיס תקף', hist, 'bad');
    const ui = this.g.ui; ui.hist.textContent = hist; ui.hist.classList.toggle('repeat', !!prev); ui.decide.hidden = false;
    ui.decide.onclick = e => {
      const a = e.target.closest('[data-d]')?.dataset.d; if (!a) return;
      ui.decide.hidden = true; const S = this.stats, today = dayOf(this.g.sim.time);
      if (a === 'fine') { S.fines += FINE; S.pts += prev ? 10 : 3; this.g.bank.money += FINE; this.g.bank.today.fineIn = (this.g.bank.today.fineIn || 0) + FINE; this.g.toast(prev ? `קנס ${FINE} ₪ — נכון: כבר קיבל אזהרה` : `קנס ${FINE} ₪ (אפשר היה להסתפק באזהרה ראשונה)`); }
      else { S.warns++; S.pts += prev ? -5 : 10; W[k] = today; this.g.toast(prev ? 'אזהרה שנייה — היה צריך לתת קנס' : 'אזהרה נרשמה ✓'); }
      p.noTicket = false;
      const ks = Object.keys(W); if (ks.length > 600) delete W[ks[0]];
      this.reader.show(a === 'fine' ? `קנס ${FINE} ₪` : 'אזהרה נרשמה', hist, a === 'fine' ? 'bad' : 'warn'); this.render();
    };
  }
  icon(pid, ok) {
    const sp = makeIcon(ok); this.g.scene.add(sp); this.icons.set(pid, sp);
    const h = this.g.people.onboardPos?.get(pid); if (h) sp.position.copy(h).add(new THREE.Vector3(0, 0.32, 0));
  }
  summary(ended) {
    const S = this.stats, ui = this.g.ui; this.sumAt = S.checked;
    const secs = (performance.now() - S.t0) / 1000, speed = S.checked ? Math.max(0, Math.round(S.checked * 4 - secs / 8)) : 0;
    const row = (a, b, c = '') => `<tr class="${c}"><td>${a}</td><td><b>${b}</b></td></tr>`;
    ui.sumBody.innerHTML = `<table class="isum">${row('נבדקו', S.checked)}${row('ללא כרטיס', S.caught)}${row('קנסות', '₪' + S.fines)}${row('אזהרות', S.warns)}${row('בונוס מהירות', speed)}${row('ניקוד', S.pts + speed, 'tot')}</table>`;
    ui.sumStay.hidden = ended; ui.sum.hidden = false;
    this.sp = this.g.speed(); if (!ended) this.g.setSpeed(0);
    ui.sumStay.onclick = () => { ui.sum.hidden = true; this.g.setSpeed(this.sp || 1); };
    ui.sumLeave.onclick = () => { ui.sum.hidden = true; this.g.setSpeed(this.sp || 1); this.exit(); };
  }
  render() {
    const b = this.bus, ui = this.g.ui; if (!b) return;
    const L = b.line, S = L.stops[Math.min(L.stops.length - 1, b.next)];
    ui.num.textContent = L.def.number; ui.num.style.background = L.color;
    const t = `${b.state === 'dwell' ? 'בתחנה' : 'הבאה'}: ${S?.name || ''}`; if (ui.next.textContent !== t) ui.next.textContent = t;
    ui.stat.textContent = `נבדקו ${this.stats.checked} · נתפסו ${this.stats.caught} · ניקוד ${this.stats.pts}`;
  }
  bindUI() {
    const ui = this.g.ui;
    for (const [sel, d] of [[ui.up, 1], [ui.down, -1]]) {
      const on = e => { e.preventDefault(); this.hold = d; }, off = () => { this.hold = 0; };
      sel.addEventListener('pointerdown', on); sel.addEventListener('pointerup', off); sel.addEventListener('pointercancel', off); sel.addEventListener('pointerleave', off);
    }
    ui.exit.onclick = () => this.exit();
    // גרירה על המסך: למעלה/למטה — הליכה, לצדדים — מבט; הקשה קצרה — בדיקה
    const cv = this.g.canvas; let d = null;
    cv.addEventListener('pointerdown', e => { if (this.bus) d = { x: e.clientX, y: e.clientY, s: this.s, yaw: this.yaw, t: performance.now() }; });
    cv.addEventListener('pointermove', e => { if (!this.bus || !d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
      this.yaw = THREE.MathUtils.clamp(d.yaw - dx * 0.006, -1.3, 1.3); this.s = THREE.MathUtils.clamp(d.s - dy * 0.012, 0, this.len); });
    cv.addEventListener('pointerup', e => { if (!this.bus || !d) return; const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y); d = null; if (moved < 8) this.tap(e.clientX, e.clientY); });
    addEventListener('keydown', e => { if (!this.bus) return; if (e.key === 'ArrowUp') this.hold = 1; else if (e.key === 'ArrowDown') this.hold = -1; else if (e.key === 'ArrowLeft') this.yaw = Math.min(1.3, this.yaw + 0.2); else if (e.key === 'ArrowRight') this.yaw = Math.max(-1.3, this.yaw - 0.2); });
    addEventListener('keyup', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.hold = 0; });
  }
}

// ---------- היד והמכשיר (ילדים של המצלמה, בתחתית המסך)
function buildReader() {
  const group = new THREE.Group(); group.name = 'InspReader';
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99a78, roughness: 0.7 }), black = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.5 });
  const c = document.createElement('canvas'); c.width = 256; c.height = 200; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  // המכשיר: קטן מעט, בפינה הימנית התחתונה, נוטה אל העיניים
  const dev = new THREE.Group(); dev.position.set(0.09, -0.135, -0.32); dev.rotation.set(-0.5, -0.18, 0.06); group.add(dev);
  const W = 0.066, H = 0.118, D = 0.018;
  dev.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), black));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, H * 0.38), screen); scr.position.set(0, H * 0.2, D / 2 + 0.0005); dev.add(scr);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.014, 20), new THREE.MeshBasicMaterial({ color: 0x1e3a8a })); pad.position.set(0, -H * 0.24, D / 2 + 0.0005); dev.add(pad);
  // יד ימין (פשוטה, כמו של הנהג): כף מאחורי המכשיר, ארבע אצבעות שעוטפות את הצד השמאלי שלו (שלוש פרקים כל אחת), אגודל בצד הימני מלפנים
  const seg = (a, b, r) => { const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, d.length() - 2 * r * 0.2), 4, 8), skin);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); dev.add(m); return m; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.028), skin); palm.position.set(0.006, -0.012, -D / 2 - 0.016); dev.add(palm);
  const pr = [0.0085, 0.009, 0.0085, 0.0075];
  for (let k = 0; k < 4; k++) {
    const y = 0.022 - k * 0.019, r = pr[k];
    const a = V(-0.012, y, -D / 2 - 0.018), b = V(-W / 2 - 0.004, y + 0.002, -D / 2 - 0.012), c = V(-W / 2 - 0.009, y + 0.003, 0.002), d = V(-W / 2 + 0.006, y + 0.003, D / 2 + 0.008);
    seg(a, b, r); seg(b, c, r * 0.95); seg(c, d, r * 0.9);
  }
  const t0 = V(W / 2 - 0.004, -0.04, -D / 2 - 0.006), t1 = V(W / 2 + 0.004, -0.012, D / 2 + 0.004), t2 = V(W / 2 - 0.012, 0.012, D / 2 + 0.009);
  seg(t0, t1, 0.0105); seg(t1, t2, 0.0095);
  // שורש כף היד והאמה — יורדים אל מחוץ למסך
  seg(V(0.012, -0.055, -D / 2 - 0.02), V(0.05, -0.2, -0.03), 0.024);
  // שפת השרוול הקצר של חולצת הפקח (תכלת) בקצה האמה, בשולי המסך
  { const a = V(0.042, -0.17, -0.028), b = V(0.07, -0.27, -0.035), d = new THREE.Vector3().subVectors(b, a);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.037, d.length(), 14, 1, false), new THREE.MeshStandardMaterial({ color: 0xa9c6e6, roughness: 0.8 }));
    sl.position.copy(a).add(b).multiplyScalar(0.5); sl.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); dev.add(sl); }
  for (const m of group.children) m.renderOrder = 10;
  group.traverse(m => { if (m.isMesh) { m.frustumCulled = false; m.renderOrder = 10; } });
  const show = (a, b, kind) => {
    const x = c.getContext('2d'); x.fillStyle = kind === 'ok' ? '#064e3b' : kind === 'bad' ? '#7f1d1d' : kind === 'warn' ? '#78350f' : '#0b1f3a'; x.fillRect(0, 0, 256, 200);
    x.direction = 'rtl'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '700 30px Heebo, Arial'; x.fillText(a, 128, 70);
    x.font = '500 22px Heebo, Arial'; x.fillStyle = '#e2e8f0'; x.fillText(b || '', 128, 128); tex.needsUpdate = true;
  };
  // לבדיקת החסימה: הפינות של כל חלק (מכשיר, כף יד, אצבעות, אמה), ונקודת הפנים של המכשיר (לצפצוף)
  const face = new THREE.Object3D(); face.position.set(0, 0.01, -D / 2); dev.add(face);   // הגב של המכשיר — הצד שנוגע בכרטיס
  group.updateMatrixWorld(true); const pts = [], q = new THREE.Vector3();
  dev.traverse(m => { if (!m.isMesh) return; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(q.set(x, y, z).applyMatrix4(m.matrixWorld).clone()); });
  return { group, show, face, pts, rest: dev.position.clone(), faceRest: face.getWorldPosition(new THREE.Vector3()) };
}
function makeIcon(ok) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = ok ? '#16a34a' : '#dc2626'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = '800 40px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ok ? '✓' : '✗', 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false })); sp.scale.setScalar(0.16); sp.renderOrder = 12; return sp;
}
let AC = null;
function beep(ok) {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = 'square'; o.frequency.value = ok ? 1320 : 440; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + (ok ? 0.12 : 0.35)); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.4); } catch { }
}
export { PATH as INSP_PATH, EYE as INSP_EYE, SEATS as INSP_SEATS };
