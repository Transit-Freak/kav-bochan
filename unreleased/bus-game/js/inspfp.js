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
import { STAND_POLE, STRAP, REACH_FR } from './actors.js';
import { FINGERS } from './fingers.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// העיניים 1.57 מ' מעל רצפת האוטובוס (אדם בגובה ממוצע). אותה מערכת צירים של האוטובוס כמו במבט הנהג (הרצפה ב-0.675 מעל הכביש)
const FLOOR = 0.675, EYE = FLOOR + 1.57, REACH = 1.2;
// ההזזות של המכשיר כשמשהו בדרך (clearance, במערכת המצלמה): קודם בלי הזזה, אחר כך 3/6/9/12 ס"מ בשמונה כיוונים במישור המסך.
// אף פעם לא אל המצלמה (המכשיר נשאר בגודל של מכשיר ביד — שלמה 16.11)
const CLEAR_OFFS = (() => { const a = [[0, 0, 0]]; for (const r of [0.03, 0.06, 0.09, 0.12]) for (const [dx, dy] of [[0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [1, 0], [-1, 0], [-0.7, 0.7], [0.7, 0.7]]) a.push([dx * r, dy * r, 0]);
  return a.map(v => new THREE.Vector3(...v)); })();
// הפנים של נוסע: מרכז 5 ס"מ מעל onboardPos (צוואר), רדיוס 13 ס"מ (מתחת לסנטר עד מעל המצח) — המכשיר לא מסתיר אותן בבדיקה
export const FACE_DY = 0.05, FACE_R = 0.13;
// עלייה וירידה (cine): העיניים על המדרכה (15 ס"מ מעל הכביש, ועוד 1.65 מ'); מהירות הליכה; כמה מחכים להולך שבדרך
const EYE_OUT = 0.15 + 1.57, CINE_WALK = 1.3, CINE_WAIT = 5;
// הליכה (עלייה וירידה): גובה העיניים מעל מה שעומדים עליו, משך צעד במדרגה, ונדנוד הראש (2 צעדים בשנייה: ±1.7 ס"מ למעלה-למטה, ±0.7 ס"מ לצדדים)
const EYE_H = 1.57, SIDEWALK = 0.15, STEP_T = 0.25, BOB = [0.017, 0.007, 2];
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const END_CLEAR = 0.7;   // בסוף המעבר: המרחק (במישור) מכל ראש של נוסע במקום שבו המבט מסתובב
const REACH_MAX = 0.45;  // כמה המכשיר יוצא אל הכרטיס מהמקום שלו — המרפק נשאר כפוף (קודם 0.8: זרוע מתוחה עד הפנים של הנוסע)
const CARD_CLEAR = 0.075;   // אחרי הקריאה: כמה ימינה מהכרטיס (בעומק של המכשיר) נמצא מרכז המכשיר — חצי המכשיר וחצי הכרטיס
const AISLE_Z1 = 3.55;   // הקצה הקדמי של המעבר — מאחורי מחיצת הנהג ומכונת הכרטיסים; הפקח לא עובר אותו
// המעבר: מהדלת הקדמית, ליד המתקף, ואז לאורך האמצע עד המושבים האחרונים
const PATH = [[-0.95, 5.15], [-0.3, 4.98], [0, 4.3], [0, -4.9]];       // עוקף את העמוד המעוקל שליד הדלת (z ≈ 4.5) ואת המתקף
// המושבים (מתוך ידיות האחיזה בדגם: מושב מול כל משענת, פונה קדימה) וכמה מקומות עמידה ליד הדלת האמצעית
// המושבים (נמדדו בדגם): לכל שורה — ידית האחיזה בראש המשענת (z), הכרית בגובה 1.14 ומ-z+0.10 עד z+0.50, והגב בגובה האגן ב-z+0.12.
// זוג מושבים בכל צד: מעבר (x ≈ 0.58) וחלון (x ≈ 0.87). [x, הרצפה, z של הגב]
const ROWS = [3.7, 2.9, 2.1, 1.3, -1.9, -2.7, -3.5, -4.3, -5.1], SIDES = { 3.7: [-1], 2.9: [-1] };
export const SEAT_H = 1.14 + 0.012 - FLOOR, SEAT_DEPTH = 0.37;   // 1.2 ס"מ מעל הכרית (הבד נמעך קצת — בלי לשקוע בתוכה)
// המושבים צרים (29 ס"מ בין מרכזים) — כתפיים של שני אנשים לא נכנסות בהם. לכן היושב במעבר זז מעט אל המעבר (10 ס"מ)
// וזה שליד החלון מעט אל החלון (5 ס"מ), כמו שאנשים יושבים באמת, וכך אין חפיפה בין השכנים
// העמודים האנכיים בשפת המעבר (z): ליד חלון שיש עמוד 30–80 ס"מ לפניו — היד מושטת יותר למעלה ופחות קדימה (מעל העמוד, לא דרכו)
const POLES_Z = [5.65, 4.5, 2.84, 1.24, 0.75, -0.36, -0.7, -1.96, -3.56, -5.16];
const SEATS = ROWS.flatMap(z => [0.872, 0.578, -0.578, -0.872].filter(x => !SIDES[z] || SIDES[z].includes(Math.sign(x))).map(x => [x + Math.sign(x) * (Math.abs(x) > 0.7 ? 0.05 : -0.1), FLOOR, z + 0.137,
  Math.abs(x) > 0.7 && POLES_Z.some(pz => pz - (z + 0.125) > 0.25 && pz - (z + 0.125) < 0.85) ? 1 : 0]));
// השכן באותו זוג מושבים, ומושבים בשורות הסמוכות באותו צד
const PAIR = SEATS.map(a => SEATS.findIndex(b => b !== a && b[2] === a[2] && Math.sign(b[0]) === Math.sign(a[0])));
const NEAR = SEATS.map(a => SEATS.map((b, k) => k).filter(k => SEATS[k] !== a && Math.sign(SEATS[k][0]) === Math.sign(a[0]) && Math.abs(SEATS[k][2] - a[2]) < 0.9));
// מקום העמידה בעמוד ליד הדלת האמצעית: מאחורי העמוד האנכי שבשפת המעבר (x = 0.50, z = -0.70)
// מימין, מול הדלת, יש משענת מתקפלת ב-z ≈ -0.4 — שם עומדים מאחוריה, ליד העמוד של z = -0.70),
// פונים קדימה, והיד שבצד המעבר על העמוד (STAND_POLE ב-actors.js). [x, הרצפה, z של האגן, היד]
// העומדים הראשונים מחזיקים ברצועה תלויה (straps.js, x = ±0.50, z = 0.08 — בין העמודים ליד הדלת); מי שבא אחריהם, ומי שנמוך
// ולא מגיע לרצועה (STRAP ב-actors.js) — בעמוד של z = -0.70. בלי עומד לפני מי שמחזיק ברצועה: היד שמושיטה כרטיס יוצאת קדימה
const STRAPS = [[1, 0.08], [-1, 0.08]].map(([sx, rz]) => [sx * (0.5 + STRAP.dx), FLOOR, rz - STRAP.dz, sx > 0 ? 'StrapR' : 'StrapL']);
const STANDS = [...STRAPS, ...[[1, -0.70]].map(([sx, pz]) => [sx * (0.5 + (sx > 0 ? STAND_POLE.dx : STAND_POLE.dxL)), FLOOR, pz - (sx > 0 ? STAND_POLE.dz : STAND_POLE.dzL), sx > 0 ? 'Right' : 'Left'])];
const hash = i => { const x = Math.sin(i * 77.7 + 3.1) * 43758.5453; return x - Math.floor(x); };
const day2date = d => { const t = new Date(2026, 10, 1 + (d - 1)); return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}`; };
// אותו אדם בכל הימים: תושב קבוע או עובד מבחוץ (residents.js) — לפי המספר שלו; אחרים — לפי מוצא, יעד וסוג
export const personKey = p => (p.who != null && p.who > -1e6 ? `r${p.who}` : p.o >= 0 && p.d >= 0 ? `${p.o}-${p.d}-${p.id % 3}` : `x${p.id}`);

// תפוסה של האוטובוס ושל הנוסעים בתוכו (במערכת הצירים של האוטובוס, תאים של 3 ס"מ): גוף האוטובוס (מושבים, מחיצת הנהג,
// עמודים, דפנות) — פעם אחת; הנוסעים — מחדש כשמשהו משתנה (עלה/ירד/הושיט יד). בשביל המצלמה, היד והמכשיר של הפקח
const OC = 0.03, OX0 = -1.45, OY0 = 0.6, OZ0 = -5.7, ONX = 97, ONY = 80, ONZ = 400;
class OccGrid {
  constructor() { this.st = new Uint8Array(ONX * ONY * ONZ); this.pp = new Uint8Array(ONX * ONY * ONZ); this.key = ''; }   // pp: הנוסעים (1 — כולם, 2 — מי שמגיש עכשיו)
  idx(x, y, z) { const i = Math.floor((x - OX0) / OC), j = Math.floor((y - OY0) / OC), k = Math.floor((z - OZ0) / OC); return i < 0 || j < 0 || k < 0 || i >= ONX || j >= ONY || k >= ONZ ? -1 : (k * ONY + j) * ONX + i; }
  // נוסע בטבעת ברדיוס r סביב הנקודה (מגובה הכתפיים של יושב ועד העיניים) — למצלמה: לא צמודה לכתף או לראש של נוסע
  ring(x, z, y0, y1, r) { for (let y = y0; y <= y1; y += 0.1) for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2, i = this.idx(x + Math.cos(t) * r, y, z + Math.sin(t) * r); if (i >= 0 && this.pp[i] === 1) return true; } return false; }
  has(x, y, z) { const i = this.idx(x, y, z); return i >= 0 && (this.st[i] || this.pp[i]); }
  // משולש: דגימות כל 2 ס"מ על פני השטח
  tri(A, a, b, c, v = 1) { const e = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)), n = Math.max(1, Math.ceil(e / 0.02)), q = this.tq || (this.tq = new THREE.Vector3());
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { q.set(0, 0, 0).addScaledVector(a, i / n).addScaledVector(b, j / n).addScaledVector(c, 1 - (i + j) / n); const k = this.idx(q.x, q.y, q.z); if (k >= 0 && A[k] !== 1) A[k] = v; } }
  bus(o) {
    o.updateMatrixWorld(true); const inv = o.matrixWorld.clone().invert(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    // רק מה שמצויר: בלי רשתות מוסתרות — הטבעות המקוריות של הדגם (SM_StrapRing, straps.js מחליף אותן ברצועות) והעותק הפשוט
    // של האוטובוס לרחוק (Lite). קודם הן נכנסו לתפוסה: טבעת בלתי נראית ליד העמוד שליד הדלת "חסמה" את המבט אל הפנים של
    // העומד שם, והפקח ויתר על הבדיקה שלו (שלמה 16.11)
    const shown = m => { for (let x = m; x && x !== o.parent; x = x.parent) if (!x.visible) return false; return true; };
    o.traverse(m => { if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || /^Leaf_|Windshield/i.test(m.name) || m.name === 'Lite' || !shown(m)) return;
      const g = m.geometry, P = g.attributes.position, I = g.index, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), n = I ? I.count : P.count;
      for (let t = 0; t < n; t += 3) { a.fromBufferAttribute(P, I ? I.getX(t) : t).applyMatrix4(M); b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1).applyMatrix4(M); c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2).applyMatrix4(M);
        // הרצפה והתקרה לא חוסמות (המצלמה והיד ביניהן)
        if (Math.max(a.y, b.y, c.y) < 0.7 || Math.min(a.y, b.y, c.y) > 2.55) continue;
        this.tri(this.st, a, b, c); } });
  }
  // הנוסעים: המשולשים של כל אחד בתנוחה שלו (כל פני השטח, לא רק הקודקודים — בגו המשולשים גדולים מהתאים)
  people(shapes, inv, active) {
    const key = shapes.map(s => s.pid + s.key + Math.round(s.M.elements[12] * 100)).join('|') + '/' + active; if (key === this.key) return; this.key = key;
    this.pp.fill(0); const q = new THREE.Vector3(), M = new THREE.Matrix4();
    for (const s of shapes) { M.multiplyMatrices(inv, s.M); const v = s.pid === active ? 2 : 1;
      for (const g of s.groups) { const P = g.geo.attributes.position, I = g.geo.index, n = I ? I.count : P.count, a = q, b = this.tb || (this.tb = new THREE.Vector3()), c = this.tc || (this.tc = new THREE.Vector3());
        for (let t = 0; t + 2 < n; t += 3) { a.fromBufferAttribute(P, I ? I.getX(t) : t).applyMatrix4(M); b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1).applyMatrix4(M); c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2).applyMatrix4(M); this.tri(this.pp, a, b, c, v); } } }
  }
  // בשביל היד והמכשיר: גוף האוטובוס או נוסע אחר (לא מי שמגיש — הוא נבדק לפי הראש והגו, ליד הכרטיס מותר)
  hard(x, y, z) { const i = this.idx(x, y, z); return i >= 0 && (this.st[i] || this.pp[i] === 1); }
  // "צינור" ברדיוס r מ-a ל-b (במערכת האוטובוס) נוגע בגוף האוטובוס (עמוד, משענת, מחיצה)? — לבחירת המקום שהפקח עומד בו
  tube(a, b, r, skipEnd = 0) { const d = a.distanceTo(b), n = Math.ceil(d / 0.015), q = new THREE.Vector3();
    for (let i = 0; i <= n; i++) { if (d * (1 - i / n) < skipEnd) break; q.lerpVectors(a, b, i / n); for (const [dx, dy, dz] of [[0, 0, 0], [r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]]) { const k = this.idx(q.x + dx, q.y + dy, q.z + dz); if (k >= 0 && this.st[k]) return true; } } return false; }
  // הקו מ-a ל-b (במערכת האוטובוס) עובר דרך משהו תפוס? (צעדים של 1.5 ס"מ; skip — נקודה שליד הכרטיס לא נבדקת)
  blocked(a, b, skip, sr = 0.2) { const d = a.distanceTo(b), n = Math.ceil(d / 0.015), q = new THREE.Vector3();
    for (let i = 1; i <= n; i++) { q.lerpVectors(a, b, i / n); if (skip && q.distanceTo(skip) < sr) continue; if (this.has(q.x, q.y, q.z)) return true; } return false; }
}

export class InspectorFP {
  constructor(g) {          // g: { camera, scene, canvas, people, sim, bank, busObject(b), toast, ui:{...}, setSpeed, speed(), onExit() }
    this.g = g; this.bus = null; this.s = 0; this.yaw = 0; this.icons = new Map();
    this.reader = buildReader(); this.bindUI();
  }
  get on() { return !!this.bus; }
  enter(bus) {
    this.g.useStd?.(bus, true);          // מיניבוס ומפרקי: מבפנים — הדגם הרגיל (actors.js: useStd)
    const o = this.g.busObject(bus); if (!o) return false;
    this.bus = bus; this.obj = o; this.s = 0; this.yaw = 0; this.v = 0; this.endTurn = 0; this.atEnd = false; this.endS = null;
    document.body.classList.add('fpview');   // מבט פקח: בלי לוח המתכנן, הכפתורים והקרדיטים (game.css) — בכל דרך שנכנסים
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
      const can = i => { const V = this.g.people.variants?.[this.g.people.variantOf(id)]; return !V?.stand || !!V.stand[STANDS[i][3]]; };   // מגיע לידית?
      let j = -1; for (const pass of [0, 1]) { for (let i = 0; i < STANDS.length && j < 0; i++) { if (used.has(i) || !can(i)) continue;
        if (!pass && [...used].some(([jj, q]) => look(q) === look(id) && Math.sign(STANDS[jj][0]) === Math.sign(STANDS[i][0]))) continue; j = i; } if (j >= 0) break; }
      stand.set(id, j); } return stand.get(id); };
    this.g.people.busSitters(SEAT_H, SEAT_DEPTH);
    this.occ = o.userData.occ || (o.userData.occ = (() => { const G = new OccGrid(); G.bus(o); return G; })()); this.occ.key = ''; this.beeps = []; this.auditLog = null;
    // זוג מושבים תפוס בשניהם: שני היושבים "מצטמצמים" מעט לרוחב (כתפיים צמודות), אחרת הכתפיים נכנסות זו בזו
    const shared = k => PAIR[k] >= 0 && [...seat.values()].includes(PAIR[k]);
    const partner = k => { if (PAIR[k] < 0) return null; for (const [q, j] of seat) if (j === PAIR[k]) return q; return null; };
    this.seatMap = seat; this.standMap = stand;   // לבדיקות
    this.g.people.onboard = { bus, obj: o, seats: SEATS, stands: STANDS, floor: FLOOR, seatOf, standOf, shared, partner, narrow: 0.74 };
    const c = this.g.camera;
    this.saved = { near: c.near, far: c.far, fov: c.fov };
    c.near = 0.05; c.far = 2500; c.fov = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(42)) / c.aspect)), 70, 100); c.updateProjectionMatrix();
    if (!this.handSet) { const h = this.g.people.handMesh?.(0, this.reader.handPose); if (h) { this.reader.setHand(h); this.handSet = true; } }
    this.g.scene.add(c); c.add(this.reader.group); this.reader.show('רב-קו · מוכן לבדיקה', 'הקישו על נוסע', null);
    // בגוף ראשון — בזמן אמת (×1): במהירות גבוהה היורדים "נורים" מהדלת. ביציאה חוזרים למהירות הקודמת
    this.speed0 = this.g.speed(); this.g.setSpeed(1);
    // לא נכנסים לאוטובוס לתוך מי שעולה או יורד: מתחילים בנקודה הראשונה במעבר שרחוקה 50 ס"מ לפחות מכל הולך
    o.updateMatrixWorld(true);
    const ws = this.g.people.walkers.filter(w => w.obj.visible && w.bus === bus).map(w => o.worldToLocal(w.obj.getWorldPosition(new THREE.Vector3())));
    // מתחילים במעבר עצמו (אחרי מחיצת הנהג ומכונת הכרטיסים), כדי שהיד והמכשיר לא יצוירו על המחיצה
    this.sMin = this.sOfZ(AISLE_Z1); this.s = Math.max(this.s, this.sMin);
    for (let t = this.sMin; t <= this.len; t += 0.1) { const P = this.pathAt(t); if (ws.every(w => Math.hypot(w.x - P.x, w.z - P.z) >= 0.5)) { this.s = t; break; } }
    this.cine = null; this.startBoard();
    this.g.ui.root.hidden = false; this.render(); return true;
  }
  exit() {
    if (!this.bus) return;
    for (const el of this.icons.values()) el.remove(); this.icons.clear();
    this.anim = null; this.g.people.reach = null; this.readerOff = null; this.reader.group.position.set(0, 0, 0); this.g.people.fpEye = null;
    if (this.speed0 > 1 && this.g.speed() === 1) this.g.setSpeed(this.speed0);
    this.g.people.onboard = null; this.reader.group.parent?.remove(this.reader.group);
    const c = this.g.camera, s = this.saved;
    // המבט האחרון של הפקח — המצלמה הרגילה יוצאת ממנו בתנועה רכה (main.js: onExit), בלי קפיצה
    const pose = { p: c.getWorldPosition(new THREE.Vector3()), t: c.localToWorld(new THREE.Vector3(0, 0, -6)), fov: c.fov };
    this.cine = null; this.g.scene.remove(c);
    if (s) { c.near = s.near; c.far = s.far; c.fov = s.fov; c.updateProjectionMatrix(); }
    this.g.useStd?.(this.bus, false);
    this.bus = null; this.obj = null; this.g.ui.root.hidden = true; this.g.ui.decide.hidden = true; this.g.ui.sum.hidden = true;
    this.g.onExit?.(pose);
  }
  // הדלתות — מתוך הדגם (הצמתים Door_<שם><מספר>, ובלעדיהם Leaf_...: כל כנף במקומה הסגור), לא ממספרים קבועים — כך גם באוטובוס
  // בין-עירוני עם דלת צרה של כנף אחת. לכל דלת: השם, מרכז ה-z, הרוחב (z0–z1) וה-x של הקיר (במערכת האוטובוס)
  doorsOf(o) {
    if (o.userData.doors) return o.userData.doors;
    // הכנפיים מונפשות (נפתחות בהחלקה): מודדים אותן במצב סגור — האנימציה בזמן 0 — ומחזירים אחר כך
    const bus = o.userData.bus || this.bus, acts = bus && this.g.busDoorActs?.(bus), t0 = acts?.map(a => a.time);
    if (acts?.length) { for (const a of acts) a.time = 0; acts[0].getMixer().update(0); }
    o.updateMatrixWorld(true); const by = new Map(), inv = o.matrixWorld.clone().invert();
    // לכל כנף — חצי הרוחב שלה לפי הרשת (במקום הסגור); כך הפתח הוא בדיוק מה שהכנפיים סוגרות (באוטובוס הבין-עירוני — כנף אחת צרה,
    // והכנפיים שמאחורי לוחות סגורים נקראות Closed_* ולא נספרות)
    const halfOf = n => { let h = 0; n.traverse(m => { if (!m.isMesh) return; m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; h = Math.max(h, Math.min(0.5, (bb.max.z - bb.min.z) / 2)); }); return h || 0.3; };
    for (const pre of ['Door', 'Leaf']) { o.traverse(n => { const m = new RegExp(`^${pre}_([A-Za-z]+)\\d*$`).exec(n.name || ''); if (!m) return;
        const p = n.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), k = m[1]; p.h = halfOf(n); (by.get(k) || by.set(k, []).get(k)).push(p); }); if (by.size) break; }
    const out = [...by].map(([name, ps]) => { const z0 = Math.min(...ps.map(p => p.z - p.h)), z1 = Math.max(...ps.map(p => p.z + p.h));
      return { name, z0, z1, zc: (z0 + z1) / 2, x: ps.reduce((a, p) => a + p.x, 0) / ps.length }; }).filter(d => Math.abs(d.x) > 0.8);
    if (acts?.length) { acts.forEach((a, i) => { a.time = t0[i]; }); acts[0].getMixer().update(0); o.updateMatrixWorld(true); }
    if (!out.length) out.push({ name: 'Front', z0: 4.57, z1: 5.73, zc: 5.15, x: -1.245 }, { name: 'Mid', z0: -0.58, z1: 0.63, zc: 0.03, x: -1.245 });
    return (o.userData.doors = out);
  }
  doorOpen(d) { const b = this.bus, v = /front/i.test(d.name) ? b.dF : /mid/i.test(d.name) ? b.dM : null; return (v ?? b.door ?? 0) > 0.6; }
  // מסלול של המצלמה (נקודות במערכת האוטובוס): בלי לעבור דרך עמוד, מושב, מחיצה או אדם — בעיניים ובגובה החזה, כל 5 ס"מ (בתוך האוטובוס)
  cinePathOK(pts, pid = null) {
    const heads = [...(this.g.people.onboardPos || new Map())].filter(([q]) => q !== pid).map(([, v]) => this.obj.worldToLocal(v.clone())), q = new THREE.Vector3();
    for (let i = 0; i + 1 < pts.length; i++) { const L = pts[i].distanceTo(pts[i + 1]), n = Math.max(1, Math.ceil(L / 0.05));
      for (let k = 0; k <= n; k++) { q.lerpVectors(pts[i], pts[i + 1], k / n); if (Math.abs(q.x) > 1.2) continue;
        if (this.occ.has(q.x, q.y, q.z) || this.occ.has(q.x, q.y - 0.45, q.z)) return false;
        if (heads.some(h => Math.hypot(h.x - q.x, h.z - q.z) < 0.3)) return false; } }
    return true;
  }
  // עלייה (כ-2.5 ש'): עומדים על המדרכה מול הדלת הקדמית הפתוחה, הולכים אליה, עולים במדרגה, עוברים ליד מחיצת הנהג והמתקף —
  // עד הנקודה במעבר שנבחרה ב-enter (לא בתוך מי שהולך). האוטובוס מחכה בתחנה עד הסוף (hold). נכנסו כשהאוטובוס נוסע (לא דרך
  // הכפתור — רק בבדיקות): גרסה קצרה מתוך הדלת. prefers-reduced-motion — בלי אנימציה
  startBoard() {
    if (reducedMotion()) return;
    const o = this.obj, b = this.bus, D = this.doorsOf(o), f = D.reduce((a, d) => (d.zc > a.zc ? d : a)), sx = Math.sign(f.x), out = b.state === 'dwell' && this.doorOpen(f);
    const P0 = this.pathAt(0), pts = [];
    // (מתחילים 2.6 מ' מהדלת, מעט מאחוריה — רואים את צד האוטובוס ואת הדלת הפתוחה)
    // (ולא בתוך הסככה, העמוד של התחנה או עץ: נקודת ההתחלה הראשונה שפנויה — streetClear)
    if (out) { const door = new THREE.Vector3(f.x + sx * 0.4, EYE_OUT, f.zc); let st = null;
      for (const [dx, dz] of [[2.6, -1.1], [2.6, 1.1], [2.2, 0], [1.8, -0.8], [1.8, 0.8], [1.4, 0], [1, 0]]) { const q = new THREE.Vector3(f.x + sx * dx, EYE_OUT, f.zc + dz); if (this.streetClear(o, q, door)) { st = q; break; } }
      pts.push(st || new THREE.Vector3(f.x + sx * 1, EYE_OUT, f.zc), door, new THREE.Vector3(f.x - sx * 0.12, EYE - 0.06, f.zc)); }
    pts.push(P0.clone()); for (let t = 0.15; t < this.s; t += 0.15) pts.push(this.pathAt(t)); pts.push(this.pathAt(this.s));
    this.cineGo('board', pts, [this.pathAt(this.s + 0.6)], -1, out ? 1 : -1);
  }
  // ירידה: בתחנה, כשהדלת פתוחה — הולכים במעבר אל הדלת הפתוחה הקרובה (קדמית או אמצעית), יורדים למדרכה, מסתובבים מעט
  // ומסתכלים על האוטובוס שיוצא; אחר כך המצלמה הרגילה (exit). בנסיעה, או בלי דלת פתוחה — יוצאים כמו קודם
  leave() {
    const b = this.bus; if (!b || this.cine) return;
    const o = this.obj, D = this.doorsOf(o).filter(d => this.doorOpen(d));
    if (reducedMotion() || b.state !== 'dwell' || !D.length) { this.exit(); return; }
    this.anim = null; this.g.people.reach = null; this.g.ui.decide.hidden = true;
    // יורדים בדלת האחורית (הפתוחה שהכי מאחור — כמו הנוסעים); אם רק הקדמית פתוחה — בה
    const c = this.g.camera, E = o.worldToLocal(c.getWorldPosition(new THREE.Vector3())), d = D.reduce((a, x) => (x.zc < a.zc ? x : a)), sx = Math.sign(d.x);
    // איפה לעבור בדלת: מהמרכז החוצה בצעדים של 10 ס"מ, המקום הראשון שהדרך אליו פנויה
    let best = null;
    for (const dz of [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3]) { const z = d.zc + dz; if (z < d.z0 + 0.25 || z > d.z1 - 0.25) continue;
      const pts = [E.clone()];
      if (d.zc > AISLE_Z1) { for (let t = this.s - 0.15; t > 0; t -= 0.15) pts.push(this.pathAt(t)); pts.push(this.pathAt(0)); }
      else { const z1 = z + Math.sign(E.z - z) * 0.35, s1 = THREE.MathUtils.clamp(this.sOfZ(z1), this.sMin, this.len), st = s1 > this.s ? 0.15 : -0.15;   // לאורך המעבר
        for (let t = this.s + st; (st > 0 ? t < s1 : t > s1); t += st) pts.push(this.pathAt(t)); pts.push(new THREE.Vector3(0, EYE, z1)); }
      if (d.zc <= AISLE_Z1) pts.push(new THREE.Vector3(d.x - sx * 0.55, EYE, z));
      pts.push(new THREE.Vector3(d.x - sx * 0.1, EYE - 0.05, z));
      if (this.cinePathOK(pts.slice(1))) { best = { pts, z }; break; } if (!best) best = { pts, z, bad: true }; }
    const pts = best.pts, z = best.z; this.cineBad = !!best.bad;
    // למדרכה, מתרחקים 1.6 מ' מהאוטובוס ומסתובבים מעט אליו (המבט לאורך הצד שלו, אל הכיוון שאליו ייסע)
    { const st = new THREE.Vector3(d.x + sx * 0.35, EYE_OUT, z); let e = null;
      for (const [dx, dz] of [[1.6, -0.4], [1.6, 0.4], [1.2, -0.8], [1.2, 0.8], [1.0, 0], [0.7, 0]]) { const q = new THREE.Vector3(d.x + sx * dx, EYE_OUT, z + dz); if (this.streetClear(o, st, q)) { e = q; break; } }
      pts.push(st, e || new THREE.Vector3(d.x + sx * 0.7, EYE_OUT, z)); }
    this.cineGo('alight', pts, [new THREE.Vector3(d.x + sx * 1.2, EYE_OUT - 0.5, z + 3)], pts.length - 2, pts.length - 3);
  }
  // על המדרכה: הקטע מ-a ל-b (במערכת האוטובוס) פנוי מסככה, עמוד, עץ או בניין — בגובה העיניים ובגובה המותניים, ו-40 ס"מ לצדדים
  // של a ושל b (המצלמה והיד לא צמודות לעמוד). רק מה שלא חלק מהאוטובוס, מהאנשים או מהיד של הפקח
  streetClear(o, a, b) {
    const rc = this.rc || (this.rc = new THREE.Raycaster()); rc.camera = this.g.camera; const skip = m => { for (let x = m; x; x = x.parent) { if (x === o || x === this.reader.group || x === this.g.camera || x.isSkinnedMesh || /crowd|people|walker/i.test(x.name || '')) return true; } return false; };
    const objs = this.g.scene.children.filter(x => x !== o && x !== this.g.camera && x.visible), W = o.matrixWorld;
    const seg = (p, q) => { const pw = p.clone().applyMatrix4(W), qw = q.clone().applyMatrix4(W), d = qw.clone().sub(pw), L = d.length(); if (L < 1e-3) return true;
      rc.set(pw, d.normalize()); rc.far = L + 0.3; return !rc.intersectObjects(objs, true).some(h => !skip(h.object) && !h.object.isSprite && !h.object.isPoints && !h.object.isLine); };
    // (גם קטעים מקבילים, 30 ס"מ לכל צד — המצלמה לא חולפת צמוד לעמוד או לדופן הזכוכית של הסככה; ו-40 ס"מ סביב שני הקצוות,
    // כדי שנקודת ההתחלה לא תהיה צמודה לזכוכית)
    const pr = new THREE.Vector3(b.z - a.z, 0, a.x - b.x); if (pr.lengthSq() > 1e-6) pr.setLength(0.3);
    const R = [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4], [0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]];
    for (const dy of [0, -0.6]) { const A = a.clone(), B = b.clone(); A.y += dy; B.y += dy; if (!seg(A, B)) return false;
      if (pr.lengthSq() > 1e-6) for (const k of [1, -1]) if (!seg(A.clone().addScaledVector(pr, k), B.clone().addScaledVector(pr, k))) return false;
      for (const E of [A, B]) for (const [x, z] of R) if (!seg(E, E.clone().add(new THREE.Vector3(x, 0, z)))) return false; }
    return true;
  }
  // pts — המסלול; look — נקודות להמשך המבט אחרי הסוף; off — מאיזו נקודה כבר על המדרכה (בירידה: מקפיאים את המקום בעולם)
  cineGo(kind, pts, look = [], off = -1, pause = -1) {
    // בתוך האוטובוס: המסלול לא עובר צמוד למתקף — לפחות 55 ס"מ (במישור) ממרכז כל מתקף, כדי שהמכשיר שביד לא ייגע בו
    { const V = this.valPts(this.obj), cl = new Map(); for (const v of V) { const k = Math.round(v.z * 2); (cl.get(k) || cl.set(k, []).get(k)).push(v); }
      const cs = [...cl.values()].map(a => a.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / a.length));
      for (const p of pts) { if (Math.abs(p.x) > 1.15) continue; for (const c of cs) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz); if (d < 0.55 && d > 1e-3) { p.x = c.x + dx / d * 0.55; p.z = c.z + dz / d * 0.55; } } } }
    const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const all = pts.concat(look), LA = [0]; for (let i = 1; i < all.length; i++) LA.push(LA[i - 1] + all[i].distanceTo(all[i - 1]));
    this.cine = { kind, pts, all, L, LA, len: L[L.length - 1], u: 0, v: 0, t: 0, wait: 0, off: off >= 0 ? L[off] : Infinity, M: null, watch: 0, hold0: this.bus.hold || 0,
      pauseAt: pause >= 0 ? L[pause] : -1, paused: 0, eyeY: null, step: null, ph: 0 };
    this.v = 0; this.hold = 0; this.slideTo = null; this.lat = 0; this.latTo = 0; this.yaw = 0; this.atEnd = false; this.endTurn = 0;
  }
  // על מה עומדים בנקודה (x, z) במערכת האוטובוס: במעבר ובין המושבים — הרצפה; בפתח הדלת — המדרגות שבדגם (באוטובוס העירוני
  // מדרגה אחת בפתח, M_Floor; בבין-עירוני שתיים); מחוץ לאוטובוס — המדרכה. נמדד בקרן כלפי מטה (בלי הרצפה הכללית, M_Vinyl, שמכסה
  // גם את שולי הפתח), ונשמר
  surfAt(o, x, z) {
    if (Math.abs(x) <= 0.88) return FLOOR;
    const C = o.userData.surf || (o.userData.surf = new Map()), k = Math.round(x * 50) + ',' + Math.round(z * 20); if (C.has(k)) return C.get(k);
    const rc = this.rc2 || (this.rc2 = new THREE.Raycaster()); rc.camera = this.g.camera; o.updateMatrixWorld(true); const inv = o.matrixWorld.clone().invert(), n = new THREE.Vector3();
    rc.set(new THREE.Vector3(x, 1.3, z).applyMatrix4(o.matrixWorld), new THREE.Vector3(0, -1, 0).transformDirection(o.matrixWorld)); rc.far = 1.3;
    let h = SIDEWALK;
    for (const hit of rc.intersectObject(o, true)) { const m = hit.object; if (!m.isMesh || !m.visible || m.isSkinnedMesh || !hit.face) continue;
      const mat = [].concat(m.material)[hit.face.materialIndex || 0] || [].concat(m.material)[0]; if (/^M_Vinyl|^M_Pole/.test(mat?.name || '')) continue;
      if (n.copy(hit.face.normal).transformDirection(m.matrixWorld).y < 0.7) continue; const y = hit.point.applyMatrix4(inv).y; if (y > 0.2 && y < FLOOR + 0.02) { h = Math.max(h, y); break; } }
    if (Math.abs(x) < 1.3 && h === SIDEWALK) h = FLOOR;   // בתוך הגוף בלי מדרגה — הרצפה
    C.set(k, h); return h;
  }
  // נקודה על מסלול (לפי המרחק u מההתחלה)
  cineAt(pts, Ls, u, out = new THREE.Vector3()) { let i = 1; while (i < Ls.length - 1 && Ls[i] < u) i++; const k = Ls[i] > Ls[i - 1] ? THREE.MathUtils.clamp((u - Ls[i - 1]) / (Ls[i] - Ls[i - 1]), 0, 1) : 1; return out.lerpVectors(pts[i - 1], pts[i], k); }
  // המתקפים (M_Val*) — נקודות במערכת האוטובוס, פעם אחת לדגם: המכשיר לא מתקרב אליהם לפחות מ-VAL_CLEAR
  valPts(o) {
    if (o.userData.valPts) return o.userData.valPts; o.updateMatrixWorld(true); const inv = o.matrixWorld.clone().invert(), out = [], q = new THREE.Vector3();
    o.traverse(m => { if (!m.isMesh) return; const mats = [].concat(m.material); if (!mats.some(x => /^M_Val/.test(x?.name || ''))) return;
      const P = m.geometry.attributes.position, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), st = Math.max(1, Math.floor(P.count / 60));
      for (let i = 0; i < P.count; i += st) out.push(q.fromBufferAttribute(P, i).applyMatrix4(M).clone()); });
    return (o.userData.valPts = out);
  }
  valDist(o) { const g = this.reader.group, inv = o.matrixWorld.clone().invert(), V = this.valPts(o), q = new THREE.Vector3(); g.updateMatrixWorld(true); let m = 9;
    for (const p of this.reader.pts) { q.copy(p).applyMatrix4(g.matrixWorld).applyMatrix4(inv); for (const v of V) { const d = q.distanceToSquared(v); if (d < m) m = d; } } return Math.sqrt(m); }
  cineStep(dt, o) {
    const C = this.cine, b = this.bus, c = this.g.camera, PL = this.g.people, sim = this.g.sim;
    o.updateMatrixWorld(true); const inv = o.matrixWorld.clone().invert();
    this.prevState = b.state;
    // האוטובוס מחכה בתחנה עד שהפקח עלה (או ירד)
    const outside = C.kind === 'alight' && C.M;
    if (!outside && b.state === 'dwell') b.hold = Math.max(b.hold || 0, sim.time + 1);
    if (C.skip) { C.t = C.dur; C.watch = 99; }
    // ההולכים (עולים, יורדים, ועל המדרכה) — במערכת של המסלול (האוטובוס, או אחרי הירידה — המקום הקפוא בעולם)
    const W = C.M || o.matrixWorld, Wi = C.M ? C.M.clone().invert() : inv;
    const ws = PL.walkers.filter(w => w.obj.visible && w.mode !== 'ride').map(w => w.obj.getWorldPosition(new THREE.Vector3()).applyMatrix4(Wi));
    // מחכים למי שהולך בדרך — לא עוברים דרכו (45 ס"מ, גם על המדרכה)
    // הליכה: מהירות של הולך (1.3 מ' בשנייה), מאיצים בחצי השנייה הראשונה ומאטים לפני הסוף; עצירה קצרה לפני הדלת (pauseAt)
    const ease = k => k * k * (3 - 2 * k), ahead = this.cineAt(C.pts, C.L, Math.min(C.len, C.u + 0.3)), walking = C.u < C.len - 1e-4;
    C.push = C.push || new THREE.Vector3();
    const near = walking && ws.some(l => Math.hypot(l.x - ahead.x - C.push.x, l.z - ahead.z - C.push.z) < 0.45);
    const atPause = C.pauseAt >= 0 && C.u >= C.pauseAt - 0.01 && C.paused < 0.45;
    let vt = CINE_WALK * Math.min(1, Math.sqrt(Math.max(0, C.len - C.u) / 0.45) + 0.12);
    if (C.pauseAt >= 0 && C.paused < 0.45) vt = Math.min(vt, CINE_WALK * Math.min(1, Math.sqrt(Math.max(0, C.pauseAt - C.u) / 0.3) + 0.08));
    if (near && C.wait < CINE_WAIT) { C.wait += dt; vt = 0; } else if (atPause) { C.paused += dt; vt = 0; }
    C.v += THREE.MathUtils.clamp(vt - C.v, -dt * 3.5, dt * 2.6); if (C.skip) { C.u = C.len; C.v = 0; }
    C.u = Math.min(C.len, C.u + C.v * dt); if (C.pauseAt >= 0 && C.paused < 0.45 && C.u > C.pauseAt) C.u = C.pauseAt;
    // מישהו נכנס למעבר ממש לפנינו (קם ממושב, יוצא מאחור): נסוגים לאט לאחור במסלול, עד שיש 45 ס"מ
    if (!C.M && !C.skip) { const cur = this.cineAt(C.pts, C.L, C.u); if (ws.some(l => Math.hypot(l.x - cur.x, l.z - cur.z) < 0.45)) { C.v = 0; C.u = Math.max(0, C.u - 0.7 * dt); } }
    if (C.u >= C.len - 1e-4) C.t = C.dur = 1; else { C.t = 0; C.dur = 1; }
    const u2 = C.u, P = this.cineAt(C.pts, C.L, u2), T = this.cineAt(C.all, C.LA, u2 + 0.7);
    // גובה העיניים: מעל מה שעומדים עליו, ובמדרגה — צעד מהיר (רבע שנייה), לא שיפוע
    { const W0 = C.M ? null : o, sy = W0 ? this.surfAt(o, P.x, P.z) : SIDEWALK, want = sy + EYE_H;
      if (C.eyeY == null) C.eyeY = want;
      if (!C.step && Math.abs(want - C.eyeY) > 0.01) C.step = { a: C.eyeY, b: want, t: 0 };
      if (C.step) { C.step.b = want; C.step.t += dt; const k = Math.min(1, C.step.t / STEP_T); C.eyeY = C.step.a + (C.step.b - C.step.a) * ease(k); if (k >= 1) C.step = null; }
      P.y = C.eyeY; T.y = C.eyeY - 0.2;
      // נדנוד הראש בזמן ההליכה (לפי המהירות)
      const sp = Math.min(1, C.v / CINE_WALK); C.ph += dt * BOB[2] * Math.max(0.3, sp) * Math.PI * 2;
      P.y += BOB[0] * sp * Math.cos(C.ph); C.sway = BOB[1] * sp * Math.sin(C.ph / 2); }
    // ירידה: על המדרכה — מקפיאים את המקום בעולם (האוטובוס יוצא), ומשחררים את האוטובוס
    if (C.kind === 'alight' && !C.M && u2 >= C.off) { C.M = o.matrixWorld.clone(); b.hold = C.hold0; }
    // על המדרכה: מי שמתקרב (פחות מ-45 ס"מ) — הפקח זז הצידה ממנו (עד 1.5 מ' בשנייה), כך ששום הולך לא עובר דרך המצלמה
    if (C.M) { const Q = P.clone().add(C.push), mv = new THREE.Vector3();
      for (const l of ws) { const dx = Q.x - l.x, dz = Q.z - l.z, d = Math.hypot(dx, dz); if (d < 0.55) mv.add(new THREE.Vector3(dx, 0, dz).multiplyScalar((0.55 - d) / Math.max(0.05, d))); }
      if (mv.lengthSq() > 0) { if (mv.length() > 1.5 * dt * 4) mv.setLength(1.5 * dt * 4); C.push.add(mv.multiplyScalar(0.5)); } }
    // לא חוזרים למצב רחוק מהאוטובוס יותר מדי: הדחיפה עד 1.2 מ'
    if (C.push.length() > 1.2) C.push.setLength(1.2);
    // ...אבל לא אל האוטובוס: לפחות 45 ס"מ מהדופן שלו (האוטובוס עוד יוצא לידנו)
    if (C.M) { const sx = Math.sign(C.pts[C.pts.length - 1].x) || -1, lim = 1.25 + 0.45; if (sx * (P.x + C.push.x) < lim) C.push.x = sx * lim - P.x; }
    const Pw = P.clone().add(C.push).applyMatrix4(W);
    let Tw = T.clone().add(C.push).applyMatrix4(W);
    // אחרי הירידה: המבט מסתובב מעט אל האוטובוס שיוצא; ואם הוא לא זז אחרי 1.2 ש' — המבט פונה לאורך הרחוב (הלאה מהדלת)
    if (C.M) { const bw = o.getWorldPosition(new THREE.Vector3()).setY(Pw.y - 0.4), k = Math.min(1, (u2 - C.off) / Math.max(0.01, C.len - C.off)); Tw.lerp(bw, 0.6 * ease(k));
      if (C.away) { const fw = new THREE.Vector3(0, 0, 1).transformDirection(C.M), st = Pw.clone().addScaledVector(fw, -8).setY(Pw.y - 0.3); Tw.lerp(st, ease(Math.min(1, C.away))); } }
    const dir = Tw.clone().sub(Pw); const h = Math.hypot(dir.x, dir.z) || 1; dir.y = (Pw.y > o.localToWorld(new THREE.Vector3(0, EYE - 0.2, 0)).y ? -0.28 : -0.14) * h;
    { const rt = new THREE.Vector3(-dir.z, 0, dir.x).normalize(); Pw.addScaledVector(rt, C.sway || 0); }
    c.position.copy(Pw); c.lookAt(Pw.clone().add(dir)); c.updateMatrixWorld(true); PL.fpEye = c.position.clone();
    this.reader.group.visible = true; this.occ.people(PL.onboardShapes || [], inv, null);
    this.clearance(o, inv, dt);
    // ליד המתקף (בתוך האוטובוס): היד עם המכשיר יורדת ונוטה ימינה, עד שהמכשיר רחוק ממנו לפחות 12 ס"מ
    if (!C.M) { C.vl = C.vl || 0; const g = this.reader.group, base = g.position.clone(), at = k => { g.position.copy(base).add(new THREE.Vector3(0.05 * k, -0.2 * k, 0)); return this.valDist(o); };
      let want = 0; if (at(C.vl) < 0.13 || at(0) < 0.13) { want = 1; for (let k = 0; k <= 1.001; k += 0.125) if (at(k) >= 0.13) { want = k; break; } }
      C.vl += THREE.MathUtils.clamp(want - C.vl, -dt * 2, dt * 6); at(C.vl); g.updateMatrixWorld(true); this.reader.aimArm(); this.valMin = Math.min(this.valMin ?? 9, this.valDist(o)); }
    // על המדרכה: היד עם המכשיר יורדת בהדרגה אל מחוץ לתמונה
    if (C.M) { C.low = Math.min(1, (C.low || 0) + dt * 1.5); this.reader.group.position.lerp(new THREE.Vector3(0, -0.5, 0), C.low); this.reader.group.updateMatrixWorld(true); }
    this.render();
    if (C.t < C.dur) return;
    if (C.kind === 'board') { const s = this.s; this.cine = null; this.s = s; this.slope = -0.28; this.yaw = 0; return; }
    // מסתכלים על האוטובוס שיוצא — עד שזז 3 מ'. אם לא זז תוך 1.2 ש' (עוד עולים) — מסובבים את המבט לאורך הרחוב וחוזרים
    // למצלמה הרגילה. הירידה כולה עד 5 ש'
    C.watch += dt; const moved = C.M ? o.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3().setFromMatrixPosition(C.M)) : 0;
    if (C.watch > 1.2 && moved < 0.5) C.away = (C.away || 0) + dt * 1.6;
    if ((C.watch > 0.8 && moved > 3) || (C.away || 0) >= 1 || C.watch > 2.6) this.exit();
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
    if (this.cine) { this.cineStep(dt, o); return; }
    // תנועה: ▲▼ (לחיצה ארוכה) או גרירה — חלק, עם תאוצה קטנה
    const want = (this.hold || 0) * 1.3;
    this.v += (want - this.v) * Math.min(1, dt * 6);
    const PL = this.g.people, inv = o.matrixWorld.clone().invert();
    // מי שהולך במעבר (יורד/עולה) ומחכה מול הפקח יותר מ-0.6 ש' — הפקח זז ממנו במעבר, עד שיש מקום
    const blk = PL.fpBlock && PL.fpBlock.waitFP > 0.6 ? o.worldToLocal(PL.fpBlock.obj.getWorldPosition(new THREE.Vector3())) : null;
    let ns = THREE.MathUtils.clamp(this.s + this.v * dt, this.sMin, this.len);
    if (this.slideTo != null) { const d = this.slideTo - this.s; if (Math.abs(d) < 0.01) this.slideTo = null; else ns = this.s + Math.sign(d) * Math.min(Math.abs(d), 1.2 * dt); }
    if (blk) { const P0 = this.pathAt(this.s), P1 = this.pathAt(Math.min(this.len, this.s + 0.2)); const away = (P1.x - P0.x) * (blk.x - P0.x) + (P1.z - P0.z) * (blk.z - P0.z) > 0 ? -1 : 1; ns = THREE.MathUtils.clamp(this.s + away * 0.8 * dt, 0, this.len); }
    // המצלמה לא נכנסת בגוף: לא מתקרבים לפחות מ-40 ס"מ ממי שהולך במעבר, ולא לתוך תא תפוס
    const E = this.pathAt(ns), E0 = this.pathAt(this.s);
    const near = q => PL.walkers.some(w => w.obj.visible && w.mode !== 'ride' && (() => { const l = o.worldToLocal(w.obj.getWorldPosition(new THREE.Vector3())); return Math.hypot(l.x - q.x, l.z - q.z) < 0.4; })());
    // ולא מתקרבים לראש של נוסע יושב/עומד לפחות מ-35 ס"מ (במישור) — הפקח עומד במעבר, לא מעל הכתף של אף אחד
    const heads = [...(PL.onboardPos || new Map()).values()].map(h => o.worldToLocal(h.clone()));
    const hd = q => heads.reduce((m, h) => Math.min(m, Math.hypot(h.x - q.x, h.z - q.z)), 9);
    // כתף רחבה של יושב במעבר בולטת אל המסלול: לא נתקעים — הפקח עובר בצד השני של המעבר (10 ס"מ הצידה, לחצי שנייה)
    const ringAt = (q, l) => this.occ.ring(q.x + l, q.z, 1.5, q.y, 0.12);
    let okRing = !ringAt(E, 0) || ringAt(E0, 0);
    if (!okRing && Math.abs(this.v) > 0.05) for (const l of [0.1, -0.1]) if (!ringAt(E, l)) { this.dodgeLat = l; this.dodgeT = 0.5; okRing = true; break; }
    this.dodgeT = Math.max(0, (this.dodgeT || 0) - dt);
    const okHead = (hd(E) >= 0.35 || hd(E) >= hd(E0)) && okRing;
    // מפנים את הדרך למי שיורד/עולה גם אם זה מקרב לראש של יושב (הפקח עובר לידו במעבר); ואם הוא מחכה כבר 2 ש' — גם הצידה
    if ((!near(E) || near(E0)) && (okHead || blk) && !this.occ.has(E.x, E.y, E.z)) this.s = ns; else { this.v = 0; this.slideTo = null; }
    // מחכה כבר 3 ש' ואין לאן לזוז: הפקח נכנס לשורה הפנויה הקרובה — במעבר שמאחורי היורד (קפיצה קצרה של המבט), והיורד ממשיך
    if (blk && PL.fpBlock.waitFP > 3) { const w = PL.fpBlock, nx = o.worldToLocal(w.pts[w.seg + 1].clone()), dirz = Math.sign(nx.z - blk.z) || 1;
      this.s = THREE.MathUtils.clamp(this.sOfZ(blk.z - dirz * 0.8), this.sMin, this.len); w.waitFP = 0; this.v = 0; }
    if (blk && PL.fpBlock.waitFP > 2) this.latTo = -Math.sign(blk.x || 1) * 0.12;
    else if (!this.anim && !blk) this.latTo = this.dodgeT > 0 ? this.dodgeLat : 0;
    const P = this.pathAt(this.s), A = this.pathAt(Math.min(this.len, this.s + 0.3)), dir = A.clone().sub(P); if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    // בבדיקה: הפקח זז לצד השני של המעבר (עד 10–12 ס"מ מהמרכז — לא יוצא מהמעבר ולא נצמד לכתפיים של היושבים), כדי לעמוד במרחק מהנוסע
    { const nl = (this.lat || 0) + ((this.latTo || 0) - (this.lat || 0)) * Math.min(1, dt * 4);
      // לא זזים הצידה אל כתף או ראש של נוסע (בטבעת של 15 ס"מ, מגובה הכתפיים של יושב)
      const okL = l => !this.occ.ring(P.x + l, P.z, 1.45, P.y, 0.17);
      if (okL(nl) || !okL(this.lat || 0)) this.lat = nl; else this.latTo = this.lat;
      if (!okL(this.lat) && okL(0)) this.lat *= 0.8; }
    if (P.z < 4.2) P.x += this.lat;
    const base = Math.atan2(dir.x, dir.z) + (this.s < 0.4 ? 0 : 0);
    // בבדיקה: המבט מסתובב אל החזה של הנוסע (בעדינות), כדי שהכרטיס והמכשיר ייפגשו לפניו ולא מעל הפנים
    if (this.anim && this.lookPid === this.anim.pid) { const hw = this.g.people.onboardPos?.get(this.anim.pid);
      if (hw) { const cw = this.g.people.cardWorld, h = cw ? o.worldToLocal(cw.clone()).lerp(o.worldToLocal(hw.clone()), 0.45) : o.worldToLocal(hw.clone()), want = Math.atan2(h.x - P.x, h.z - P.z) - base; let d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)); this.yaw += THREE.MathUtils.clamp(d * Math.min(1, dt * 6), -2.4 * dt, 2.4 * dt); this.yaw = THREE.MathUtils.clamp(this.yaw, -1.4, 1.4); } }   // לא מסתובבים אל קדמת האוטובוס (מחיצת הנהג)
    // אחרי בדיקה (ואחרי ההחלטה על קנס/אזהרה) המבט חוזר בהדרגה אל כיוון ההליכה (עד שגוררים את המבט ביד)
    if (this.yawHome && !this.anim && this.g.ui.decide.hidden) { this.yaw *= Math.exp(-dt * 3.5); if (Math.abs(this.yaw) < 0.01) { this.yaw = 0; this.yawHome = false; } }
    // בסוף המעבר (הקיר האחורי): המבט מסתובב בחזרה אל המעבר, ולא נשאר מול הקיר והחלון
    // ושם הפקח נעמד במקום במעבר שאין בו ראש של נוסע ממש לפני המצלמה (לא בתוך שורת המושבים האחרונה)
    if (!this.atEnd && !this.anim && this.g.ui.decide.hidden && this.s > this.len - 0.35 && (this.hold || 0) >= 0) { this.atEnd = true;
      const heads = [...(this.g.people.onboardPos || new Map()).values()].map(v => o.worldToLocal(v.clone())); let t = this.len;
      // ובמקום שבו המבט מסתובב (חצי סיבוב) רחוק לפחות END_CLEAR מכל ראש — לא חולפים צמוד לראש של יושב בשורה האחרונה.
      // אם אין מקום כזה — המקום הרחוק ביותר מהראשים
      const hmin = Q => heads.reduce((m, h) => Math.min(m, Math.hypot(h.x - Q.x, h.z - Q.z)), 9); let bt = this.len, bm = -1;
      for (; t > this.len - 1.6; t -= 0.05) { const Q = this.pathAt(t), m = hmin(Q); if (m > bm + 0.02) { bm = m; bt = t; }
        if (m >= END_CLEAR && !heads.some(h => h.z - Q.z > -0.05 && h.z - Q.z < 0.7 && Math.abs(h.x - Q.x) < 0.8)) break; }
      if (t <= this.len - 1.6) t = bt;
      this.slideTo = t; this.endS = t; }
    if (this.atEnd && ((this.hold || 0) < 0 || this.anim)) { this.atEnd = false; this.endS = null; }
    // (והמבט מסתובב רק אחרי שהפקח הגיע למקום הזה — לא תוך כדי ההליכה אליו, ליד הראשים)
    // בסוף המעבר: לחיצה נוספת קדימה לא מקרבת אל הראשים שמאחור (נשארים במקום שנבחר)
    if (this.atEnd && this.endS != null && this.s > this.endS) { this.s = Math.max(this.endS, this.s - 1.2 * dt); if (this.v > 0) this.v = 0; }
    { const want = this.atEnd && this.slideTo == null ? 1 : 0; this.endTurn = (this.endTurn || 0) + (want - (this.endTurn || 0)) * Math.min(1, dt * 3); if (Math.abs(this.endTurn - want) < 0.002) this.endTurn = want; }
    const yaw = base + this.yaw + (this.endTurn || 0) * Math.PI * (1 - Math.abs(this.yaw) / Math.PI);
    o.updateMatrixWorld(true);
    // המבט למטה: רגיל 0.28 (כ-16°); בבדיקה — מעט יותר אל הכרטיס, עד כ-20°, בהדרגה (רואים את הפנים ואת היד)
    let slope = -0.28; const cw = this.anim && this.g.people.cardWorld;
    if (cw) { const cl = o.worldToLocal(cw.clone()), hz = Math.hypot(cl.x - P.x, cl.z - P.z) || 0.3; slope = THREE.MathUtils.clamp((cl.y - P.y) / hz * 0.85, -0.36, -0.28); }
    // בלי כרטיס (וכשמחליטים קנס/אזהרה): המבט אל החזה — הפנים עולות מעל חלונית ההחלטה
    else if (this.lookPid != null && (this.anim?.pid === this.lookPid || !this.g.ui.decide.hidden)) { const hw = this.g.people.onboardPos?.get(this.lookPid);
      if (hw) { const hl = o.worldToLocal(hw.clone()), hz = Math.hypot(hl.x - P.x, hl.z - P.z) || 0.3; slope = THREE.MathUtils.clamp((hl.y - 0.25 - P.y) / hz * 0.85, -0.45, -0.28); } }
    this.slope = (this.slope ?? -0.28) + THREE.MathUtils.clamp((slope - (this.slope ?? -0.28)) * Math.min(1, dt * 3), -0.3 * dt, 0.3 * dt);
    const c = this.g.camera, T = P.clone().add(new THREE.Vector3(Math.sin(yaw), this.slope, Math.cos(yaw)));
    c.position.copy(o.localToWorld(P.clone())); c.lookAt(o.localToWorld(T)); c.updateMatrixWorld(true);
    PL.fpEye = c.position.clone();
    this.reader.group.visible = this.s >= this.sMin - 0.01;   // ליד הדלת, מחיצת הנהג ומכונת הכרטיסים — בלי היד והמכשיר
    this.occ.people(PL.onboardShapes || [], inv, this.anim?.pid);   // מי שמגיש מסומן בנפרד: המצלמה לא נכנסת בו, היד מתקרבת לכרטיס שלו
    // הסמלים מעל הראש של מי שנבדק — עוקבים אחרי המקום שלו
    // (סימן ✓/✗ בגודל קבוע במסך, תמיד מתחת לפס העליון ובתוך התמונה — אלמנט על המסך, לא בתוך התמונה התלת-ממדית)
    { const r = this.g.canvas.getBoundingClientRect(), top = (this.g.ui.top?.getBoundingClientRect().bottom ?? r.top + 120) + 6 - r.top, v = new THREE.Vector3();
      for (const [pid, el] of this.icons) { const h = this.g.people.onboardPos?.get(pid); if (!h || !b.pax.some(p => p.id === pid)) { el.remove(); this.icons.delete(pid); continue; }
        v.copy(h).add(new THREE.Vector3(0, 0.3, 0)).project(c); const x = (v.x + 1) / 2 * r.width, y = (1 - v.y) / 2 * r.height;
        const on = v.z < 1 && x > 16 && x < r.width - 16 && y < r.height - 60; el.hidden = !on;
        // הראש צמוד לפס העליון (נוסע גבוה שעומד קרוב): הסימן לצד הראש, לא על הפנים
        if (on) { const cl = y < top + 14, hx = cl ? x + (x > r.width / 2 ? -1 : 1) * Math.min(70, 9000 / Math.max(60, h.distanceTo(c.position) * 100)) : x; el.style.transform = `translate(${hx.toFixed(1)}px,${Math.max(top + 14, y).toFixed(1)}px) translate(-50%,-50%)`; } } }
    // תחנה: סיכום (פעם אחת לכל תחנה)
    if (b.state === 'dwell' && this.prevState === 'drive' && this.stats.checked > this.sumAt) this.summary(false);
    if (this.prevState !== b.state) this.prevState = b.state;
    this.animate(dt);
    this.clearance(o, inv, dt);
    this.render();
  }
  // לבדיקות: המצלמה בתוך משהו? המרחק להולך הקרוב; כמה נקודות של היד/המכשיר חסומות (אחרי התיקון)
  audit() {
    const o = this.obj, c = this.g.camera; if (!o) return null; const e = o.worldToLocal(c.position.clone());
    let wmin = 9; for (const w of this.g.people.walkers) { if (!w.obj.visible || w.mode === 'ride') continue; const l = o.worldToLocal(w.obj.getWorldPosition(new THREE.Vector3())); wmin = Math.min(wmin, Math.hypot(l.x - e.x, l.z - e.z)); }
    const hm = [...(this.g.people.onboardPos || new Map()).values()].reduce((m, h) => { const l = o.worldToLocal(h.clone()); return Math.min(m, Math.hypot(l.x - e.x, l.z - e.z)); }, 9);
    const ringOcc = this.occ.ring(e.x, e.z, 1.5, e.y, 0.12);
    // המכשיר על המסך: מרכז הפנים שלו בתוך התמונה (לא מעבר לקצה), כשהוא מוצג ולא ירד מתחת למסך
    let readerOn = null; if (this.reader.group.visible && !((this.drop || 0) > 0.5)) { const f = this.reader.face.getWorldPosition(new THREE.Vector3()).project(c); readerOn = Math.abs(f.x) < 0.9 && Math.abs(f.y) < 0.95 && f.z < 1; }
    return { readerOn, ringOcc, headMin: +hm.toFixed(2), camOcc: !!this.occ.has(e.x, e.y, e.z), walkerMin: +wmin.toFixed(2), readerHits: this.lastHits || 0, pull: +(this.lastPull || 0).toFixed(2), anim: this.anim ? +this.anim.t.toFixed(2) : null, endTurn: +(this.endTurn || 0).toFixed(2) };
  }
  // היד והמכשיר של הפקח לא נכנסים בשום דבר — לא באוטובוס, לא בנוסעים, וגם לא ביד של מי שמגיש את הכרטיס (המכשיר עוצר
  // לפני הכרטיס): נקודות על פני המכשיר, כף היד והאמה (עם העובי שלה) — באף אחת מהן אין תא תפוס. אם יש, המכשיר זז מעט
  // (עד 12 ס"מ) למטה, למעלה או הצידה — ועוקף את מה שבדרך (מתקף, עמוד), ולא מתקרב למצלמה. קודם הוא נמשך אל
  // המצלמה עד 20 ס"מ, ונראה ענק ליד המתקף (שלמה 16.11). אם אין מקום כזה — יורד בהדרגה אל מתחת למסך. התנועה רציפה (עד 60 ס"מ בשנייה)
  clearance(o, inv, dt = 1 / 30) {
    const g = this.reader.group, base = this.readerOff || new THREE.Vector3(), q = new THREE.Vector3();
    // מי שמגיש: גם מרווח מהראש (11 ס"מ) ומהגו (16 ס"מ)
    const hw = this.anim && this.g.people.onboardPos?.get(this.anim.pid), head = hw ? o.worldToLocal(hw.clone()) : null;
    const seg = new THREE.Line3(), cp = new THREE.Vector3();
    if (head) seg.set(head.clone().add(new THREE.Vector3(0, -0.62, 0.05)), head.clone().add(new THREE.Vector3(0, -0.18, 0)));
    const hit = q => this.occ.has(q.x, q.y, q.z) || (head && (q.distanceTo(head) < 0.11 || seg.closestPointToPoint(q, true, cp).distanceTo(q) < 0.16));
    const test = pos => { g.position.copy(pos); g.updateMatrixWorld(true); let n = 0;
      const armP = this.reader.aimArm(), cm = g.parent.matrixWorld;
      const why = (q, t) => { if (n === 1) { const i = this.occ.idx(q.x, q.y, q.z); this.hitDbg = `${t} st${i >= 0 ? this.occ.st[i] : -1} pp${i >= 0 ? this.occ.pp[i] : -1} @${q.toArray().map(v => v.toFixed(2))}`; } };
      for (const p of this.reader.pts) { q.copy(p).applyMatrix4(g.matrixWorld).applyMatrix4(inv); if (hit(q)) { n++; why(q, 'dev'); } }
      for (const p of armP) { q.copy(p).applyMatrix4(cm).applyMatrix4(inv); if (hit(q)) { n++; why(q, 'arm'); } }
      return n; };
    // בבדיקה: הזזה שמכסה במסך את הפנים של הנוסע (או את כפות הידיים שלו בלי כרטיס) — כמו חסומה (לא עוקפים עמוד דרך הפנים).
    // אם אין הזזה אחרת — מוותרים על זה (עדיף מכשיר ליד הסנטר מאשר מכשיר שיורד מהמסך)
    // ובבדיקה גם: עמוד (או חלק אחר של האוטובוס) בין המצלמה למכשיר — המכשיר לא עובר מאחורי עמוד שמסתיר אותו
    const eye = this.g.camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), sq = new THREE.Vector3(), sp = new THREE.Vector3();
    const sight = () => { const P = this.reader.pts, st = Math.max(1, Math.floor(P.length / 12));
      for (let i = 0; i < P.length; i += st) { sp.copy(P[i]).applyMatrix4(g.matrixWorld).applyMatrix4(inv); const L = eye.distanceTo(sp), n = Math.ceil(L / 0.015);
        for (let k = 1; k < n; k++) { if (L * (1 - k / n) < 0.02) break; sq.lerpVectors(eye, sp, k / n); const j = this.occ.idx(sq.x, sq.y, sq.z); if (j >= 0 && this.occ.st[j]) return 1; } } return 0; };
    // (ליד הכרטיס — פחות מ-30 ס"מ — הפנים כבר לא בדרך: שם בודקים רק את העמוד, אחרת המכשיר נדחק אל היד שמחזיקה את הכרטיס)
    const cw = this.g.people.cardWorld, nearCard = cw && this.reader.face.getWorldPosition(new THREE.Vector3()).distanceTo(cw) < 0.3;
    const face = pos => { if (!this.anim) return 0; let n = sight(); if (!this.avD?.length || nearCard) return n; const b = this.devBox(pos); for (const d of this.avD) if (!(b.x1 < d.x - d.r || b.x0 > d.x + d.r || b.y1 < d.y - d.r || b.y0 > d.y + d.r)) n++; return n; };
    // ההזזות האפשריות (במערכת המצלמה): בלי הזזה; 3–12 ס"מ בשמונה כיוונים במישור המסך
    const C = CLEAR_OFFS;
    this.clrT = this.clrT || new THREE.Vector3(); this.clrC = this.clrC || new THREE.Vector3(); this.cur = this.cur || new THREE.Vector3();
    const P = new THREE.Vector3(), at = off => P.copy(base).add(off);
    // נשארים עם ההזזה הנוכחית כל עוד היא פנויה; אחרת — הפנויה הקטנה ביותר, הקרובה להזזה הנוכחית
    let tgt = null;
    for (const T of [p => test(p) + face(p), test]) {
      if (!T(at(this.clrT))) tgt = this.clrT.lengthSq() > 1e-6 && !T(at(C[0])) ? C[0] : this.clrT;
      else { let bc = Infinity; for (const c of C) { const cost = c.length() + 0.5 * c.distanceTo(this.clrT); if (cost < bc && !T(at(c))) { bc = cost; tgt = c; } } }
      if (tgt) break; }
    this.drop = this.drop || 0;
    if (tgt) this.clrT.copy(tgt);
    { const d = this.clrT.clone().sub(this.clrC), mx = 0.6 * dt; if (d.length() > mx) d.setLength(mx); this.clrC.add(d); }
    this.drop = THREE.MathUtils.clamp(this.drop + (tgt ? -5 : 8) * dt, 0, 1);
    this.cur.copy(at(this.clrC)); if (this.drop > 0) this.cur.lerp(new THREE.Vector3(0, -0.5, 0), this.drop);
    g.position.copy(this.cur); g.updateMatrixWorld(true); this.reader.aimArm();
    this.pullS = this.clrC.length();
    this.lastHits = tgt ? 0 : 1; this.lastPull = tgt ? this.pullS : 0.3;
  }
  // הקשה על המסך: הנוסע הקרוב ביותר לנקודה (עד REACH — צריך להתקרב)
  tap(x, y) {
    if (!this.bus || this.anim || this.cine || performance.now() - (this.skipAt || 0) < 700 || !this.g.ui.decide.hidden || !this.g.ui.sum.hidden) return;
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
    this.anim = { pid, t: 0, done: false }; this.yawHome = false; this.g.people.reach = { pid, frac: 0, card: !p.noTicket };
    // הפקח עומד במעבר מול הנוסע: ליד המעבר — בצד השני של המעבר, כ-63 ס"מ מהראש, מעט לפניו; ליד החלון או עומד ליד
    // הדלת — בצד שלו של המעבר (עד 12 ס"מ מהמרכז) וקרוב יותר לשורה, כי הוא מושיט מרחוק. ולפני הבדיקה המבט מסתובב אליו
    const hw = this.g.people.onboardPos?.get(pid);
    if (hw && this.obj) { const h = this.obj.worldToLocal(hw.clone()), P = this.pathAt(this.s), far = Math.abs(h.x) > 0.66;
      this.latTo = (far ? 1 : -1) * Math.sign(h.x) * (far ? 0.18 : 0.1);
      // ליד השורה שלו (מעט לפניו) — המבט מהמעבר אל הפנים, לא מעל המשענת שלפניו; ולא לפני מחיצת הנהג
      this.slideTo = THREE.MathUtils.clamp(this.sOfZ(Math.min(AISLE_Z1, h.z + (far ? 0.9 : 0.75))), this.sMin, this.len);   // לפני הברכיים שלו, מעל המשענת של השורה שלפניו — מבט אחורה אל הפנים
      // איפה לעמוד: מכל המקומות במעבר (לאורך ולרוחב, עד 12 ס"מ מהמרכז) בוחרים את זה שממנו רואים את הפנים הכי מלפנים —
      // כשהמבט אל הפנים ואל הכרטיס והיד (מהכתף אל הכרטיס) לא עוברים דרך עמוד, משענת או נוסע אחר, הכרטיס בהישג יד,
      // והמצלמה לא צמודה לאף ראש. (הכרטיס והראש — כפי שיהיו כשהנוסע יושיט אותו: reachPreview)
      const pv = this.g.people.reachPreview?.(pid, !p.noTicket);
      if (pv?.head) { let best = null, bs = Infinity; const face = pv.head.clone().add(new THREE.Vector3(0, 0.06, 0.05)), card = pv.card;
        const heads = [...(this.g.people.onboardPos || new Map())].map(([q, v]) => [q, this.obj.worldToLocal(v.clone())]);
        // (קודם עם מרווח של 10 ס"מ סביב הקו אל הפנים — כל הראש פנוי; אם אין מקום כזה — 6 ס"מ; ואם גם לא — מרווח קטן יותר ליד, למשל
        // כשהכרטיס של עומד צמוד לעמוד. בכל מקרה היד עצמה נבדקת בכל פריים ב-clearance)
        // maxA — הזווית בין כיוון ההליכה לנוסע: מולו (עד 60°), ואם אין מקום — באלכסון (עד 75°, וגם 18 ס"מ מהמרכז, בצד הרחוק של המעבר).
        // לא עומדים לצדו (מבט של 90°: המכשיר והיד יוצאים מהקצה של המסך) — אם אין מקום טוב, מוותרים על הבדיקה שלו (שלמה 15.11)
        for (const [fr, tr, se, maxA] of [[0.1, 0.09, 0.1, 1.05], [0.06, 0.09, 0.1, 1.05], [0.06, 0.06, 0.18, 1.05], [0.06, 0.06, 0.18, 1.3], [0.04, 0.04, 0.25, 1.3]]) { if (best) break; for (let dz = -0.5; dz <= 1.2501; dz += 0.05) for (const lx of [0, 0.06, -0.06, 0.12, -0.12, 0.18, -0.18]) {
          const E = new THREE.Vector3(lx, EYE, h.z + dz); if (E.z > AISLE_Z1 || E.z < PATH[PATH.length - 1][1]) continue;
          const dh = Math.hypot(E.x - face.x, E.z - face.z); if (dh < 0.5 || dh > 1.25) continue;
          if (Math.atan2(Math.abs(face.x - E.x), E.z - face.z) > maxA) continue;
          if (heads.some(([q, v]) => q !== pid && Math.hypot(v.x - E.x, v.z - E.z) < 0.4) || this.occ.has(E.x, E.y, E.z) || this.occ.ring(E.x, E.z, 1.45, E.y, 0.17)) continue;
          if (this.occ.tube(E, face, fr, 0.14) || this.occ.blocked(E, face, face, 0.28)) continue;
          let cost = Math.abs(Math.atan2(E.x - face.x, E.z - face.z)) / (Math.PI / 2) + Math.abs(dh - 0.8) * 0.4 + Math.abs(lx) * 0.5;
          if (card) { const d = E.distanceTo(card); if (d > 0.84 || d < 0.42) continue;
            // הכתף הימנית והמכשיר במנוחה — כשהמבט אל הכרטיס (ימין = קדימה × למעלה)
            const f = new THREE.Vector3(card.x - E.x, 0, card.z - E.z).normalize(), r = new THREE.Vector3(-f.z, 0, f.x);
            const sh = E.clone().addScaledVector(r, 0.18).addScaledVector(f, -0.1).add(new THREE.Vector3(0, -0.32, 0)), rest = E.clone().addScaledVector(r, 0.09).addScaledVector(f, 0.32).add(new THREE.Vector3(0, -0.135, 0));
            // המכשיר במנוחה (לפני שהוא יוצא אל הכרטיס ואחרי שחזר) לא בתוך עמוד או מעקה: אחרת הוא נמשך אל המצלמה ויוצא מהתמונה
            if ([[0, 0, 0], [0.05, 0, 0], [-0.05, 0, 0], [0, 0, 0.05], [0, 0, -0.05], [0, 0.07, 0], [0, -0.07, 0]].some(([dx, dy, dz]) => this.occ.has(rest.x + dx, rest.y + dy, rest.z + dz))) continue;
            if (this.occ.tube(sh, card, tr, se) || this.occ.tube(rest, card, tr, se) || this.occ.tube(E, card, 0.06, se) || this.occ.blocked(sh, card, card, 0.3)) continue;
            cost += Math.abs(d - 0.62) * 0.6; }
          if (cost < bs) { bs = cost; best = E; } } }
        if (!best) { this.anim = null; this.g.people.reach = null; this.slideTo = null; this.latTo = 0; this.lookPid = null; this.stance = null; p.noReach = true;
          this.reader.show('אין גישה לנוסע', 'אין מקום לעמוד מולו', 'warn'); this.g.toast('אין מקום לעמוד מול הנוסע הזה — ממשיכים הלאה'); return; }
        p.noReach = false;
        if (best) { this.slideTo = THREE.MathUtils.clamp(this.sOfZ(best.z), this.sMin, this.len); this.latTo = best.x; }
        this.stance = best ? [+best.x.toFixed(2), +(best.z - h.z).toFixed(2), +bs.toFixed(2)] : null; }
      this.lookPid = pid; }
    this.reader.show('רב-קו · מחכה לכרטיס', '', null);
  }
  animate(dt) {
    const A = this.anim; if (!A) { this.readerOff = null; this.avD = null; return; }
    A.t += dt; const t = A.t, R = this.g.people.reach, PL = this.g.people, c = this.g.camera;
    // היד של הנוסע: עולה בנחת בשבעה שלבים (חצי שנייה), מחזיקה עד שהמכשיר חוזר, ויורדת אחרי התוצאה באותם שלבים.
    // הכרטיס ביד בכל השלבים, ונעלם רק כשהיד חזרה למנוחה על הירך (לכיס)
    if (R) { if (A.down == null) R.frac = REACH_FR[Math.min(REACH_FR.length - 1, Math.floor(t / 0.08))]; else R.frac = t < A.down + 0.25 ? 1 : [...REACH_FR].reverse().concat(0)[Math.min(REACH_FR.length, 1 + Math.floor((t - A.down - 0.25) / 0.07))];
      // המבט של הנוסע: קודם אל הפקח, כשהיד למעלה — אל הכרטיס והמכשיר, ואחרי התוצאה שוב אל הפקח. הראש מסתובב בהדרגה
      const lt = (A.down == null ? t > 0.65 : t < A.down + 0.1) ? 1 : 0; A.look = (A.look || 0) + THREE.MathUtils.clamp(lt - (A.look || 0), -dt * 3.5, dt * 3.5); R.look = Math.round(A.look * 4) / 4;
      // בלי כרטיס: כשהיד למעלה — נענוע ראש קטן ("אין לי"), עד שהיד יורדת (reachPose: look של יד ריקה הוא הנענוע)
      if (!R.card) R.look = R.frac >= 1 && t > 0.6 && (A.down == null || t < A.down) ? [0.25, 0.5, 0.75, 0.5][Math.floor((t - 0.6) / 0.13) % 4] : 0; }   // היד יורדת רק אחרי שהמכשיר התרחק ממנה
    // המכשיר יוצא אל הכרטיס (כשהיד למעלה), עד 80 ס"מ מהמקום שלו (יד מושטת); הגב של המכשיר עוצר 5 ס"מ לפני הכרטיס — לא נוגע באצבעות שמחזיקות אותו
    const card = PL.cardWorld, rest = this.reader.rest;
    if (!A.off) A.off = new THREE.Vector3();
    // המכשיר יוצא רק כשהכרטיס כבר בתוך התמונה (המבט הסתובב אליו) — רואים את המכשיר מגיע אל הכרטיס
    if (card && !A.seen) { const cl = c.worldToLocal(card.clone()); A.seen = cl.z < 0 && Math.abs(cl.x) < 0.5 * -cl.z; }
    if (card && A.down == null && t > 0.55 && A.seen) {
      const cl = c.worldToLocal(card.clone()), want = cl.clone().sub(this.reader.faceRest.clone().add(new THREE.Vector3(A.side || 0, 0, 0))).addScaledVector(cl.clone().normalize(), -0.05); if (want.length() > REACH_MAX) want.setLength(REACH_MAX); want.x = Math.max(want.x, -0.34);
      // המכשיר לא מגיע אל הפנים: נעצר בגובה החזה (22 ס"מ לפחות מתחת לראש) ובמרחק של 30 ס"מ לפחות מהראש
      { const hp = PL.onboardPos?.get(A.pid); if (hp) { const hl = c.worldToLocal(hp.clone()), r0 = this.reader.faceRest.clone().add(new THREE.Vector3(A.side || 0, 0, 0)), tg = r0.clone().add(want);
        tg.y = Math.min(tg.y, hl.y - 0.22); const dv = tg.clone().sub(hl); if (dv.length() < 0.3) tg.copy(hl).addScaledVector(dv.normalize(), 0.3); want.copy(tg).sub(r0); } }
      A.lim = A.off.distanceTo(want) < 0.02;
      A.off.lerp(want, Math.min(1, dt * 7));
    } else if (A.down != null) A.off.multiplyScalar(Math.max(0, 1 - dt * 6));
    // המכשיר מגיע מהצד שבו הכרטיס (כרטיס משמאל — המכשיר עובר לשמאל המסך), לא מעל הראש של הנוסע
    // אחרי התוצאה המכשיר חוזר למקומו גם מהצד (קודם נשאר בשמאל המסך עד סוף הבדיקה וקפץ אז בבת אחת — ליד המתקף, שלמה 16.11)
    { const cl = card && c.worldToLocal(card.clone()), sd = A.down == null && cl && cl.x < -0.02 ? -0.17 : 0; A.side = (A.side || 0) + (sd - (A.side || 0)) * Math.min(1, dt * 6); }
    this.readerOff = A.off.clone().add(new THREE.Vector3(A.side || 0, 0, 0));
    // יושב, אחרי הקריאה (המסך הירוק): המכשיר זז מעט ימינה, כך שהכרטיס נשאר גלוי משמאלו ולא מוסתר מאחוריו עד שהיד יורדת
    { let w = 0; const cl = A.done && A.down != null && R?.card && card && PL.onboard?.seatOf(A.pid) >= 0 ? c.worldToLocal(card.clone()) : null;
      if (cl && cl.z < 0) { const P = this.reader.faceRest.clone().add(this.readerOff); const cx = cl.x / -cl.z * -P.z; if (cx < P.x + 0.02) w = Math.max(0, cx + CARD_CLEAR - P.x); }   // (כרטיס מימין למכשיר — לא זזים)
      A.clr = (A.clr || 0) + (w - (A.clr || 0)) * Math.min(1, dt * 10); this.readerOff.x += A.clr; }
    // המכשיר נשאר בתוך התמונה (גם כשהכרטיס גבוה או רחוק בצד, למשל עומד גבוה ליד הקיר השמאלי): עד 78% מחצי הרוחב ו-85% מחצי הגובה
    { const P = this.reader.faceRest.clone().add(this.readerOff), ty = Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * Math.max(0.05, -P.z), mx = 0.78 * ty * c.aspect, my = 0.85 * ty;
      this.readerOff.x += THREE.MathUtils.clamp(P.x, -mx, mx) - P.x; this.readerOff.y += THREE.MathUtils.clamp(P.y, -my, my) - P.y; }
    // הפנים של הנוסע הנבדק (ובלי כרטיס — גם שתי כפות הידיים הפתוחות) נשארות גלויות: המכשיר והיד שמחזיקה אותו לא עוברים לפניהן
    // במסך. עם כרטיס — המכשיר עובר מתחת לסנטר (בגובה החזה) בדרך אל הכרטיס, שתמיד נמוך מהפנים; בלי כרטיס — ימינה או למטה
    // מהידיים (מה שקרוב יותר, ונשארים בו עד סוף הבדיקה). עד 14 ס"מ, ובחזרה בהדרגה
    { const av = this.avoidDisks(A, R), sh = new THREE.Vector3(); this.avD = av;
      if (av.length) { if (!A.avMode) A.avMode = R?.card ? 'down' : null;
        const need = mode => { const v = new THREE.Vector3(); for (let it = 0; it < 3; it++) { const b = this.devBox(this.readerOff.clone().add(v)); let ch = false;
            for (const d of av) { const m = d.r + 0.012; if (b.x1 < d.x - m || b.x0 > d.x + m || b.y1 < d.y - m || b.y0 > d.y + m) continue;
              if (mode === 'down') { v.y += (d.y - m - b.y1) * b.zt; ch = true; } else { v.x += (d.x + m - b.x0) * b.zl; ch = true; } }
            if (!ch) break; } return v; };
        // ימינה — רק אם המכשיר נשאר כולו בתוך התמונה (אחרת למטה)
        if (!A.avMode) { const vd = need('down'), vr = need('right'), P = this.reader.faceRest.clone().add(this.readerOff).add(vr), ty = Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * Math.max(0.05, -P.z);
          if (vd.lengthSq() + vr.lengthSq() > 0) A.avMode = vr.length() <= vd.length() && P.x < 0.7 * ty * c.aspect ? 'right' : 'down'; }
        if (A.avMode) sh.copy(need(A.avMode)); if (sh.length() > 0.14) sh.setLength(0.14);
        // ליד הכרטיס (פחות מ-30 ס"מ) ההזזה נעלמת בהדרגה: שם המכשיר כבר מתחת לפנים, ובלי זה הוא נדחק אל היד שמחזיקה את הכרטיס
        if (card && R?.card) { const fd = this.reader.face.getWorldPosition(new THREE.Vector3()).distanceTo(card); sh.multiplyScalar(THREE.MathUtils.clamp((fd - 0.1) / 0.2, 0, 1)); } }
      A.av = A.av || new THREE.Vector3();
      // מתרחקים מיד (אין פריים שבו המכשיר מסתיר), וחוזרים בהדרגה
      for (const k of ['x', 'y']) { const tg = sh[k], cur = A.av[k]; A.av[k] = Math.abs(tg) >= Math.abs(cur) && Math.sign(tg) === Math.sign(cur || tg) ? tg : cur + (tg - cur) * Math.min(1, dt * 5); }
      this.readerOff.add(A.av); }
    // צפצוף רק כשהכרטיס באמת ליד המכשיר (פחות מ-10 ס"מ, קריאה בלי מגע)
    if (!A.done && card && A.down == null) {
      const face = this.reader.face.getWorldPosition(new THREE.Vector3()), d = face.distanceTo(card);
      // המכשיר נעצר לפני הכרטיס (מרפק כפוף, לא אל הפנים): קריאה מקרוב
      if (d < 0.1 || (A.lim && (d < 0.3 || t > 2.4))) { A.done = true; const hw = PL.reachHandWorld; const hl = hw && this.obj ? this.obj.worldToLocal(hw.clone()) : null;
        const f3 = v => v.toArray().map(x => +x.toFixed(2)), hh = PL.onboardPos?.get(A.pid);
        this.beeps.push({ pid: A.pid, t: +t.toFixed(2), cardDist: +d.toFixed(3), handAboveSeat: hl ? +(hl.y - (FLOOR + SEAT_H)).toFixed(3) : null,
          cam: f3(this.obj.worldToLocal(c.position.clone())), head: hh ? f3(this.obj.worldToLocal(hh.clone())) : null, card: f3(this.obj.worldToLocal(card.clone())) }); this.result(A.pid, true); A.down = t + 0.15; }
    }
    // בלי כרטיס: יד ריקה; התוצאה בלי צפצוף
    // (שתי הידיים למעלה כשתי שניות, עם נענוע הראש — רואים את ה"אין לי" לפני שהיד יורדת)
    if (!A.done && !R?.card && t > 2.1) { A.done = true; this.result(A.pid, false); A.down = t + 0.8; }
    // לא הגיע (רחוק מדי או חסום): מבטלים — צריך להתקרב
    // היד חסומה (עמוד או משענת בין המכשיר לכרטיס): הפקח זז מעט לאורך המעבר (קדימה, ואחר כך אחורה) ומנסה שוב
    if (!A.done && card && A.down == null && t > 1.5 && (this.lastPull || 0) > 0 && (A.tries || 0) < 2 && this.slideTo == null) {
      A.tries = (A.tries || 0) + 1; this.slideTo = THREE.MathUtils.clamp(this.s + (A.tries === 1 ? 0.18 : -0.36), 0, this.len); A.t = 0.9; }
    if (!A.done && t > 2.8) { A.done = true; A.down = t; this.reader.show('רב-קו · רחוק מדי', 'התקרבו לנוסע', 'warn'); }
    if (A.down != null && t >= A.down + 0.8) { this.anim = null; this.g.people.reach = null; this.readerOff = null; this.latTo = 0; this.yawHome = true; }   // והמבט חוזר קדימה
  }
  // מה שהמכשיר לא מסתיר בבדיקה (במישור המסך: x/-z, y/-z במערכת המצלמה): הפנים של הנוסע, ובלי כרטיס — גם כפות הידיים
  avoidDisks(A, R) {
    const PL = this.g.people, c = this.g.camera, out = [], hp = PL.onboardPos?.get(A.pid);
    const add = (w, r) => { if (!w) return; const l = c.worldToLocal(w.clone()); if (l.z > -0.1) return; out.push({ x: l.x / -l.z, y: l.y / -l.z, r: r / -l.z }); };
    if (hp) add(hp.clone().add(new THREE.Vector3(0, FACE_DY, 0)), FACE_R);
    if (R && !R.card && R.frac > 0.5) { add(PL.reachHandWorld, 0.08); add(PL.reachHand2World, 0.08); }
    return out;
  }
  // המלבן שהמכשיר והיד שמחזיקה אותו תופסים במסך (x/-z, y/-z), כשהקבוצה מוזזת ב-off (מערכת המצלמה); zt/zl — העומק של הנקודה
  // העליונה/השמאלית ביותר (כמה להזיז במטרים כדי להזיז אותה במסך)
  devBox(off) { const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, zt: 0.35, zl: 0.35 }, q = new THREE.Vector3();
    for (const p of this.reader.pts) { q.copy(p).add(off); if (q.z > -0.05) continue; const x = q.x / -q.z, y = q.y / -q.z;
      if (x < b.x0) { b.x0 = x; b.zl = -q.z; } if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) { b.y1 = y; b.zt = -q.z; } }
    return b; }
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
    this.icons.get(pid)?.remove();
    const el = document.createElement('i'); el.className = 'ifp-mark ' + (ok ? 'ok' : 'bad'); el.textContent = ok ? '✓' : '✗'; el.hidden = true; this.g.ui.root.appendChild(el); this.icons.set(pid, el);
  }
  summary(ended) {
    const S = this.stats, ui = this.g.ui; this.sumAt = S.checked;
    const secs = (performance.now() - S.t0) / 1000, speed = S.checked ? Math.max(0, Math.round(S.checked * 4 - secs / 8)) : 0;
    const row = (a, b, c = '') => `<tr class="${c}"><td>${a}</td><td><b>${b}</b></td></tr>`;
    ui.sumBody.innerHTML = `<table class="isum">${row('נבדקו', S.checked)}${row('ללא כרטיס', S.caught)}${row('קנסות', '₪' + S.fines)}${row('אזהרות', S.warns)}${row('בונוס מהירות', speed)}${row('ניקוד', S.pts + speed, 'tot')}</table>`;
    ui.sumStay.hidden = ended; ui.sum.hidden = false;
    this.sp = this.g.speed(); if (!ended) this.g.setSpeed(0);
    ui.sumStay.onclick = () => { ui.sum.hidden = true; this.g.setSpeed(this.sp || 1); };
    ui.sumLeave.onclick = () => { ui.sum.hidden = true; this.g.setSpeed(this.sp || 1); this.leave(); };
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
    ui.exit.onclick = () => this.leave();
    // הקשה או לחיצה בכל מקום בזמן העלייה או הירידה — מדלגים לסוף
    addEventListener('pointerdown', () => { if (this.cine) { this.cine.skip = true; this.skipAt = performance.now(); } }, true);
    // גרירה על המסך: למעלה/למטה — הליכה, לצדדים — מבט; הקשה קצרה — בדיקה
    const cv = this.g.canvas; let d = null;
    cv.addEventListener('pointerdown', e => { if (this.bus) d = { x: e.clientX, y: e.clientY, s: this.s, yaw: this.yaw, t: performance.now() }; });
    cv.addEventListener('pointermove', e => { if (!this.bus || !d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) > 8) this.yawHome = false;
      this.yaw = THREE.MathUtils.clamp(d.yaw - dx * 0.006, -1.3, 1.3); this.s = THREE.MathUtils.clamp(d.s - dy * 0.012, 0, this.len); });
    cv.addEventListener('pointerup', e => { if (!this.bus || !d) return; const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y); d = null; if (moved < 8) this.tap(e.clientX, e.clientY); });
    addEventListener('keydown', e => { if (!this.bus) return; if (e.key === 'ArrowUp') this.hold = 1; else if (e.key === 'ArrowDown') this.hold = -1; else if (e.key === 'ArrowLeft') this.yaw = Math.min(1.3, this.yaw + 0.2); else if (e.key === 'ArrowRight') this.yaw = Math.max(-1.3, this.yaw - 0.2); });
    addEventListener('keyup', e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.hold = 0; });
  }
}

// ---------- היד והמכשיר (ילדים של המצלמה, בתחתית המסך)
function buildReader() {
  const group = new THREE.Group(); group.name = 'InspReader';
  // היד, האמה, השרוול והמכשיר של הפקח מוארים באור קבוע משלהם (מלמעלה-משמאל, במערכת המצלמה) ולא באור של הסצנה: השמש
  // האירה את כף היד ואת האמה אחרת לפי הכיוון של האוטובוס, וכף היד יצאה כהה מהאמה. הצבע ב-emissive, והצללה לפי הנורמל
  // (הצללה חזקה, וקצוות כהים יותר — כדי שהאצבעות לא ייראו שטוחות וחיוורות מול רקע בצבע דומה, למשל היד של הנוסע)
  const SHADE = 'totalEmissiveRadiance *= (0.5 + 0.5 * clamp(dot(normalize(normal), normalize(vec3(-0.35, 0.6, 0.72))), 0.0, 1.0)) * (0.62 + 0.38 * abs(normalize(normal).z));';
  // פלסטיק מבריק (המכשיר): ברק לפי כיוון המבט והנורמל — על הקצוות המעוגלים ועל בית המדפסת
  const GLOSS = k => `{ vec3 nn = normalize(normal), vv = normalize(vViewPosition); totalEmissiveRadiance += vec3(${k.toFixed(2)}) * pow(clamp(dot(reflect(-vv, nn), normalize(vec3(-0.3, 0.75, 0.6))), 0.0, 1.0), 18.0); }`;
  const selfLit = (hex, extraV = '', extraF = '', uni = null, gloss = 0) => { const m = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: hex, transparent: false, opacity: 1, depthWrite: true, depthTest: true });   // אטום
    m.onBeforeCompile = sh => { if (uni) Object.assign(sh.uniforms, uni); if (extraV) sh.vertexShader = extraV[0] + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + extraV[1]);
      sh.fragmentShader = (extraF ? extraF[0] : '') + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (extraF ? extraF[1] : '') + SHADE + (gloss ? GLOSS(gloss) : '')); }; return m; };
  const skin = selfLit(0xc99a78);
  // המכשיר של הפקח (מסופון קשיח, כמו של פקחי הרב-קו — בלי סמלים ושמות של יצרן): גוף פלסטיק שחור מט, 19.5 × 8 ס"מ ועובי 1.8 ס"מ,
  // פינות מעוגלות ומסגרת עבה; בקצה העליון "גבנון" שחור מוגבה (קורא הכרטיסים בלי מגע) עם סמל כרטיס מובלט, ומתחתיו חריץ רמקול דק;
  // מתחת למסך — שלושה מקשים רכים (תפריט, בית, חזרה) באפור ושורה של ארבעה מקשים קטנים עם פס צבע (כחול, אדום, צהוב, ירוק);
  // בצד השמאלי — כפתור סריקה כתום, בימני — שני מקשים אפורים; מאחור — רצועת אחיזה מגומי.
  // במערכת המכשיר: x — לרוחב (ימינה), y — לאורך (אל הקורא), z — אל החזית (המסך)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const W = 0.08, L = 0.195, D = 0.018, Y0 = -L / 2, Y1 = L / 2, PY = 0.047, PR = 0.022, PCY = Y1 - PR, PCZ = -0.014, PF = D / 2 + 0.003;
  const HY = -0.045;   // מרכז כף היד (מאחורי החצי התחתון של הגוף, מתחת למדפסת)
  const dev = new THREE.Group(); dev.position.set(0.085, -0.15, -0.34); dev.rotation.set(-0.5, -0.18, 0.06); group.add(dev);
  const blue = selfLit(0x2e3137, '', '', null, 0.08), cover = selfLit(0x26292e, '', '', null, 0.12), coverEnd = selfLit(0x1c1e22, '', '', null, 0.06), dark = selfLit(0x0b0c0e);   // (blue — הגוף, עכשיו שחור מט)
  const grey = selfLit(0x80858e, '', '', null, 0.15), orange = selfLit(0xf07a14, '', '', null, 0.3), keyM = selfLit(0x3b3f46, '', '', null, 0.12), rubber = selfLit(0x121315);
  const rrect = (x0, y0, x1, y1, r) => { const s = new THREE.Shape(); s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0); return s; };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
  // הגוף: מלבן מעוגל עם שוליים מעוגלים (נכנס לתוך הגבנון)
  const bv = 0.003, bodyG = new THREE.ExtrudeGeometry(rrect(-W / 2 + bv, Y0 + bv, W / 2 - bv, PY + 0.012, 0.009), { depth: D - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 6 });
  bodyG.translate(0, 0, -D / 2 + bv); bodyG.clearGroups();
  const body = new THREE.Mesh(bodyG, blue); bodyG.deleteAttribute('uv'); dev.add(body);
  // המקשים שבצדדים: שניים אפורים בימין (מעל האגודל), כפתור הסריקה הכתום בשמאל (מעל האצבעות); ומאחור — רצועת גומי לרוחב
  dev.add(new THREE.Mesh(mergeGeometries([box(0.003, 0.009, 0.007, W / 2, 0.026, 0), box(0.003, 0.012, 0.007, W / 2, 0.01, 0)]), grey));
  dev.add(new THREE.Mesh(box(0.0035, 0.022, 0.008, -W / 2, 0.022, 0), orange));
  dev.add(new THREE.Mesh(mergeGeometries([box(W + 0.002, 0.02, 0.0035, 0, 0.022, -D / 2 - 0.0012), box(0.004, 0.02, 0.006, -W / 2 - 0.0005, 0.022, -D / 2 + 0.001), box(0.004, 0.02, 0.006, W / 2 + 0.0005, 0.022, -D / 2 + 0.001)]), rubber));
  // הגבנון (קורא הכרטיסים): פרופיל (y, z) — חזית שטוחה מעט מעל המסך, פינה מעוגלת בקצה, גליל עבה מאחור ושיפוע אל גב הגוף — נמשך לרוחב המכשיר
  { const s = new THREE.Shape(), rc = 0.008; s.moveTo(PY, PF); s.lineTo(Y1 - rc, PF); s.quadraticCurveTo(Y1, PF, Y1, PF - rc); s.lineTo(Y1, PCZ);
    s.absarc(PCY, PCZ, PR, 0, -Math.PI, true); s.lineTo(0.025, -D / 2 + 0.001); s.lineTo(0.025, 0); s.lineTo(PY, 0); s.lineTo(PY, PF);
    const g = new THREE.ExtrudeGeometry(s, { depth: W - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 14 });
    g.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0))).translate(-(W - 0.004) / 2, 0, 0);
    const pm = new THREE.Mesh(g, [coverEnd, cover]); dev.add(pm); }
  // חריץ הרמקול מתחת לגבנון ושקע הטעינה למטה — כהים
  dev.add(new THREE.Mesh(mergeGeometries([box(0.024, 0.0014, 0.0008, 0, PY - 0.0035, D / 2 + 0.0002), box(0.009, 0.0012, 0.003, 0, Y0 + 0.0001, 0)]), dark));
  // המסך: מסגרת עבה (הגוף), מתחתיו המקשים
  const GW = W - 0.012, GY0 = Y0 + 0.034, GY1 = PY - 0.0065, GH = GY1 - GY0;
  // ארבעה מקשים קטנים, כל אחד עם פס צבע (כחול, אדום, צהוב, ירוק), ומעליהם שלושת המקשים הרכים (סמלים אפורים על המסגרת)
  { const KY = Y0 + 0.012, KZ = D / 2 + 0.0008; dev.add(new THREE.Mesh(mergeGeometries([-0.0255, -0.0085, 0.0085, 0.0255].map(x => box(0.0145, 0.0068, 0.0016, x, KY, KZ))), keyM));
    [0x2f7de1, 0xe23b3b, 0xf2c230, 0x2fb35a].forEach((col, k) => dev.add(new THREE.Mesh(box(0.0105, 0.0014, 0.0005, -0.0255 + k * 0.017, KY + 0.0016, KZ + 0.001), selfLit(col))));
    const n = document.createElement('canvas'); n.width = 256; n.height = 40; const x = n.getContext('2d'); x.strokeStyle = x.fillStyle = '#9aa1ab'; x.lineWidth = 3.5; x.lineCap = 'round'; x.lineJoin = 'round';
    for (const y of [12, 20, 28]) { x.beginPath(); x.moveTo(36, y); x.lineTo(60, y); x.stroke(); }   // תפריט
    x.beginPath(); x.arc(128, 20, 9, 0, Math.PI * 2); x.stroke();   // בית
    x.beginPath(); x.moveTo(206, 20); x.lineTo(222, 11); x.lineTo(222, 29); x.closePath(); x.stroke();   // חזרה
    const t = new THREE.CanvasTexture(n); t.colorSpace = THREE.SRGBColorSpace;
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.016, (W - 0.016) * 40 / 256), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    sk.position.set(0, GY0 - 0.0075, D / 2 + 0.0003); dev.add(sk); }
  const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(480 * GH / GW); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const screen = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), screen); scr.position.set(0, (GY0 + GY1) / 2, D / 2 + 0.0004); dev.add(scr);
  // סמל כרטיס מובלט על הגבנון (קווים אפורים כהים, כמו חרוטים בפלסטיק): כרטיס וגלי הקריאה — שם מצמידים את הרב-קו
  { const n = document.createElement('canvas'); n.width = 256; n.height = 144; const x = n.getContext('2d'); x.strokeStyle = 'rgba(120,126,136,0.95)'; x.fillStyle = x.strokeStyle; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.roundRect(92, 44, 72, 48, 7); x.stroke(); x.fillRect(102, 56, 16, 12);   // הכרטיס והשבב
    for (const r of [12, 22, 32]) { x.beginPath(); x.arc(128, 108, r, Math.PI * 0.2, Math.PI * 0.8); x.stroke(); }   // הגלים
    const t = new THREE.CanvasTexture(n); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const ic = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.008, (W - 0.008) * 144 / 256), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    ic.position.set(0, (PY + Y1 - 0.007) / 2, PF + 0.0019); dev.add(ic); }   // מעל השוליים המעוגלים של המכסה (1.5 מ"מ)
  // המרחק מנקודה (במערכת המכשיר) אל פני המכשיר — שלילי בפנים: הגוף (קופסה מעוגלת) ובית המדפסת (גליל וחזית). בשביל האצבעות
  const devSdf = d => { const bc = (Y0 + PY + 0.012) / 2, q = [Math.abs(d.x) - W / 2 + 0.003, Math.abs(d.y - bc) - (PY + 0.012 - Y0) / 2 + 0.003, Math.abs(d.z) - D / 2 + 0.003];
    const b = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - 0.003;
    const ex = Math.abs(d.x) - W / 2, cy = Math.hypot(d.y - PCY, d.z - PCZ) - PR, fr = Math.max(Math.abs(d.y - (PY + Y1) / 2) - (Y1 - PY) / 2, Math.abs(d.z - (PCZ + PF) / 2) - (PF - PCZ) / 2);
    const p2 = Math.min(cy, fr), pr = Math.hypot(Math.max(ex, 0), Math.max(p2, 0)) + Math.min(Math.max(ex, p2), 0); return Math.min(b, pr); };
  // יד ימין (פשוטה, כמו של הנהג): כף מאחורי המכשיר, ארבע אצבעות שעוטפות את הצד השמאלי שלו (שלוש פרקים כל אחת), אגודל על הצד הימני
  const blocks = [];   // היד הפשוטה (עד שהדגמים נטענים — אז מחליפים אותה ביד של אחד הדגמים, setHand)
  const seg = (a, b, r) => { const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, d.length() - 2 * r * 0.2), 4, 8), skin);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); dev.add(m); blocks.push(m); return m; };
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.028), skin); palm.position.set(0.006, HY + 0.006, -D / 2 - 0.016); dev.add(palm); blocks.push(palm);
  const pr = [0.0085, 0.009, 0.0085, 0.0075];
  for (let k = 0; k < 4; k++) {
    const y = HY + 0.04 - k * 0.019, r = pr[k];
    const a = V(-0.012, y, -D / 2 - 0.018), b = V(-W / 2 - 0.004, y + 0.002, -D / 2 - 0.012), c = V(-W / 2 - 0.009, y + 0.003, 0.002), d = V(-W / 2 - 0.004, y + 0.003, D / 2 + 0.004);
    seg(a, b, r); seg(b, c, r * 0.95); seg(c, d, r * 0.9);
  }
  const t0 = V(W / 2 - 0.004, HY - 0.022, -D / 2 - 0.006), t1 = V(W / 2 + 0.008, HY + 0.004, -0.002), t2 = V(W / 2 + 0.009, HY + 0.028, 0.0);
  seg(t0, t1, 0.0105); seg(t1, t2, 0.0095);
  // שורש כף היד והאמה — יורדים אל מחוץ למסך
  // האמה והשרוול: מפרק היד אל הכתף של הפקח (מתחת למצלמה, מימין) — מתכוונים מחדש בכל פריים (aimArm), כך שכשהיד
  // נשלחת אל הכרטיס האמה הולכת אחריה מהכתף, ולא נשארת תלויה למטה (דרך המושבים)
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 1, 4, 8), skin);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.04, 1, 14, 1, false), selfLit(0xa9c6e6));
  group.add(fore, sleeve);
  let WRIST = V(0.012, HY - 0.037, -D / 2 - 0.02); const SHOULDER = V(0.18, -0.32, 0.1), up = V(0, 1, 0);
  const aimArm = () => { const w = WRIST.clone().applyQuaternion(dev.quaternion).add(dev.position), sh = SHOULDER.clone().sub(group.position), d = sh.clone().sub(w), L = d.length(); d.normalize();
    // אמה עד 60 ס"מ מהפרק (יוצאת מהמסך), ואחריה שרוול (10 ס"מ); הבדיקה מול מכשולים — 40 ס"מ הראשונים
    const fl = Math.min(0.6, L), q = new THREE.Quaternion().setFromUnitVectors(up, d);   // אמה ארוכה — יוצאת מהמסך, בלי "גדם"
    fore.position.copy(w).addScaledVector(d, fl / 2); fore.quaternion.copy(q); fore.scale.set(1, fl, 1);
    // שרוול החולצה: מתחיל 8 ס"מ אחרי פרק היד (חפת) ונמשך עד הכתף
    { const c0 = 0.08, sl = Math.max(0.02, fl - c0); sleeve.position.copy(w).addScaledVector(d, c0 + sl / 2); sleeve.quaternion.copy(q); sleeve.scale.set(1, sl, 1); sleeve.visible = fl > c0 + 0.02; }
    // נקודות לבדיקת החסימה: לאורך האמה מפרק היד (עד 45 ס"מ, ובלי 20 הס"מ שליד הכתף — שם הגוף של הפקח עצמו), כל 3 ס"מ — הציר וארבע נקודות על ההיקף
    const out = [], e1 = new THREE.Vector3().crossVectors(d, up).normalize(), e2 = new THREE.Vector3().crossVectors(d, e1), al = Math.max(0.1, Math.min(0.45, L - 0.2)), n = Math.ceil(al / 0.03);
    for (let k = 0; k <= n; k++) { const c = w.clone().addScaledVector(d, al * k / n).add(group.position); out.push(c);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.push(c.clone().addScaledVector(e1, a * 0.035).addScaledVector(e2, b * 0.035)); }
    return out; };
  for (const m of group.children) m.renderOrder = 10;
  group.traverse(m => { if (m.isMesh) { m.frustumCulled = false; m.renderOrder = 10; } });
  // המסך: אפליקציית בקרה (בלי שם או סמל של אפליקציה אמיתית) — שורת מצב של אנדרואיד (שעה, קליטה, סוללה), כותרת תכלת עם ☰
  // ו"בקרה חדשה" (ומשמאל סמלי מצלמה ומיקרופון), ומתחת: בהמתנה — עיגול כחול עם אוטובוס לבן, "נא להציג כרטיס רב-קו", שני כפתורים
  // אפורים ומתג "פיקוח / תיגבור"; בתוצאה — המסך כולו ירוק (✓) או אדום (✗) או כתום (!) עם הטקסט, מתחת לאותה כותרת
  const show = (a, b, kind) => {
    const x = c.getContext('2d'), CW = c.width, CH = c.height, k = CW / 320;
    const rr = (x0, y0, w, h, r) => { x.beginPath(); x.roundRect(x0, y0, w, h, r); };
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#07080a'; x.fillRect(0, 0, CW, CH); x.scale(k, k);
    const W2 = 320, H2 = CH / k, m = 3; x.save(); rr(m, m, W2 - 2 * m, H2 - 2 * m, 6); x.clip();
    const col = kind === 'ok' ? ['#15803d', '#22c55e'] : kind === 'bad' ? ['#b91c1c', '#ef4444'] : kind === 'warn' ? ['#b45309', '#f59e0b'] : null;
    if (col) { const gr = x.createLinearGradient(0, 0, 0, H2); gr.addColorStop(0, col[1]); gr.addColorStop(1, col[0]); x.fillStyle = gr; } else x.fillStyle = '#e6edf5'; x.fillRect(0, 0, W2, H2);
    // שורת המצב
    x.fillStyle = '#1f2a37'; x.fillRect(0, 0, W2, 24); x.fillStyle = '#fff'; x.font = '600 15px Heebo, Arial'; x.direction = 'ltr'; x.textAlign = 'left'; x.fillText('08:42', 10, 17);
    x.fillRect(W2 - 34, 7, 20, 10); x.fillRect(W2 - 14, 10, 2.5, 4); x.fillStyle = '#1f2a37'; x.fillRect(W2 - 32.5, 8.5, 4, 7); x.fillStyle = '#fff';   // סוללה
    for (let i = 0; i < 4; i++) x.fillRect(W2 - 64 + i * 6, 17 - i * 3 - 3, 4, i * 3 + 3);   // קליטה
    // הכותרת: ☰ ו"בקרה חדשה" מימין, מצלמה ומיקרופון משמאל
    x.fillStyle = '#5aa9e6'; x.fillRect(0, 24, W2, 46); x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineWidth = 2.6; x.lineCap = 'round';
    for (const y of [38, 47, 56]) { x.beginPath(); x.moveTo(W2 - 34, y); x.lineTo(W2 - 14, y); x.stroke(); }
    x.direction = 'rtl'; x.textAlign = 'right'; x.font = '700 22px Heebo, Arial'; x.fillText('בקרה חדשה', W2 - 44, 55);
    rr(12, 38, 22, 15, 3); x.stroke(); x.beginPath(); x.arc(23, 45.5, 4, 0, Math.PI * 2); x.stroke();   // מצלמה
    rr(46, 35, 8, 14, 4); x.stroke(); x.beginPath(); x.arc(50, 47, 7, 0, Math.PI); x.stroke(); x.beginPath(); x.moveTo(50, 54); x.lineTo(50, 58); x.stroke();   // מיקרופון
    const cx = W2 / 2, R = 52, cy = 70 + 22 + R;
    x.textAlign = 'center';
    const wrap = (t, font, y, lh, fill) => { x.font = font; x.fillStyle = fill; const w = t.split(' '), lines = []; let cur = '';
      for (const s of w) { const n = cur ? cur + ' ' + s : s; if (x.measureText(n).width > W2 - 28 && cur) { lines.push(cur); cur = s; } else cur = n; } if (cur) lines.push(cur);
      lines.slice(0, 2).forEach((l, i) => x.fillText(l, cx, y + i * lh)); return y + Math.min(2, lines.length) * lh; };
    if (!col) {
      // עיגול כחול עם אוטובוס לבן
      x.fillStyle = '#1e6fd9'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff'; rr(cx - 27, cy - 26, 54, 46, 8); x.fill(); x.fillStyle = '#1e6fd9'; rr(cx - 21, cy - 19, 42, 17, 3); x.fill(); x.fillRect(cx - 21, cy + 3, 12, 5); x.fillRect(cx + 9, cy + 3, 12, 5);
      x.fillStyle = '#fff'; for (const s of [-1, 1]) { rr(cx + s * 17 - 5, cy + 18, 10, 11, 3); x.fill(); }
      const y2 = wrap('נא להציג כרטיס רב-קו', '800 23px Heebo, Arial', cy + R + 34, 28, '#0f172a');
      wrap(String(a || '').replace(/^רב-קו · /, ''), '500 17px Heebo, Arial', y2 + 2, 22, '#475569');
      // שני כפתורים אפורים ומתג
      const by = H2 - 92; for (const [i, t] of [[0, 'סדרן'], [1, 'סריקת ברקוד']]) { const bx = i ? 18 : W2 / 2 + 6, bw = W2 / 2 - 24; x.fillStyle = '#d5dde7'; rr(bx, by, bw, 36, 18); x.fill(); x.fillStyle = '#334155'; x.font = '600 16px Heebo, Arial'; x.fillText(t, bx + bw / 2, by + 24); }
      x.fillStyle = '#334155'; x.font = '500 15px Heebo, Arial'; x.textAlign = 'right'; x.fillText('פיקוח / תיגבור', W2 - 22, H2 - 26);
      x.fillStyle = '#1e6fd9'; rr(24, H2 - 41, 38, 20, 10); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(52, H2 - 31, 7.5, 0, Math.PI * 2); x.fill();
    } else {
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
      x.strokeStyle = col[0]; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = R * 0.2;
      if (kind === 'ok') { x.beginPath(); x.moveTo(cx - R * 0.45, cy + R * 0.02); x.lineTo(cx - R * 0.1, cy + R * 0.38); x.lineTo(cx + R * 0.5, cy - R * 0.36); x.stroke(); }
      else if (kind === 'bad') { x.beginPath(); x.moveTo(cx - R * 0.38, cy - R * 0.38); x.lineTo(cx + R * 0.38, cy + R * 0.38); x.moveTo(cx + R * 0.38, cy - R * 0.38); x.lineTo(cx - R * 0.38, cy + R * 0.38); x.stroke(); }
      else { x.beginPath(); x.moveTo(cx, cy - R * 0.5); x.lineTo(cx, cy + R * 0.12); x.stroke(); x.fillStyle = col[0]; x.beginPath(); x.arc(cx, cy + R * 0.45, R * 0.12, 0, Math.PI * 2); x.fill(); }
      const y2 = wrap(String(a || '').replace(/^[✓✗]\s*/, ''), '800 28px Heebo, Arial', cy + R + 40, 34, '#ffffff');
      wrap(b || '', '500 19px Heebo, Arial', y2 + 6, 24, 'rgba(255,255,255,0.93)');
    }
    x.restore(); tex.needsUpdate = true;
  };
  // לבדיקת החסימה: הפינות של כל חלק (מכשיר, כף יד, אצבעות, אמה), ונקודת ההצמדה (לצפצוף) — הסמל שעל המכסה של המדפסת, בקצה העליון: שם נוגע הרב-קו
  const face = new THREE.Object3D(); face.position.set(0, 0.067, PF + 0.003); dev.add(face);
  group.updateMatrixWorld(true); const pts = [], q = new THREE.Vector3();
  dev.traverse(m => { if (!m.isMesh) return; const P = m.geometry.attributes.position, st = Math.max(1, Math.floor(P.count / 40));
    for (let i = 0; i < P.count; i += st) pts.push(q.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld).clone()); });
  const samplePts = () => { group.updateMatrixWorld(true); pts.length = 0; const gi = group.matrixWorld.clone().invert();
    dev.traverse(m => { if (!m.isMesh) return; const P = m.geometry.attributes.position;
      if (m.userData.hand) { const used = [...new Set(m.geometry.index.array)]; for (let k = 0; k < used.length; k += 2) pts.push(q.fromBufferAttribute(P, used[k]).applyMatrix4(m.matrixWorld).applyMatrix4(gi).clone()); return; }   // רק הקודקודים של היד
      const st = Math.max(1, Math.floor(P.count / 40)); for (let i = 0; i < P.count; i += st) pts.push(q.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld).applyMatrix4(gi).clone()); }); };
  // היד האמיתית: כף יד ימין של אחד הדגמים (אותו עור ואותה רשת כמו של הנוסעים), עוטפת את המכשיר — כף היד מאחוריו, ארבע
  // האצבעות סביב הצד השמאלי אל החזית, והאגודל על הצד הימני
  const fDir = V(-0.7, 0.71, 0).normalize(), pDir = V(0, 0, 1), aDir = new THREE.Vector3().crossVectors(pDir, fDir), hO = V(0.004, HY, -D / 2 - 0.026);
  const toHand = d => { const r = d.clone().sub(hO); return V(r.dot(aDir), r.dot(fDir), r.dot(pDir)); };
  const cfg = { curl: [50, 62, 15], thumb: V(W / 2 + 0.013, HY + 0.012, -0.002) };   // האגודל על הצד הימני של הגוף — לא על המסך
  const handPose = () => ({ fingers: { ...FINGERS.phone, curl: [0, 1, 2, 3].map(k => [cfg.curl[0] + k * 2.5, cfg.curl[1] + (k === 1 || k === 2 ? 2 : 0), cfg.curl[2]]) }, thumbTo: toHand(cfg.thumb),
    // המרחק מנקודה (במערכת היד) אל פני המכשיר (devSdf) — שלילי בפנים. האצבעות נסגרות עד שהן נוגעות (handMesh ב-actors.js)
    sdf: p => devSdf(hO.clone().addScaledVector(aDir, p.x).addScaledVector(fDir, p.y).addScaledVector(pDir, p.z)) });
  let handM = null;
  const setHand = h => { for (const m of blocks) dev.remove(m); if (handM) dev.remove(handM);
    // ליד פרק היד הטקסטורה עוברת בהדרגה לצבע האחיד של האמה (blend מ-handMesh) — אותו צבע עור, בלי תפר
    const bl = !!(h.geo.attributes.blend && h.color);
    const mat = selfLit(h.map ? 0xffffff : 0xc99a78, bl ? ['attribute float blend;\nvarying float vBlend;\n', '  vBlend = blend;'] : '', bl ? ['uniform vec3 uSkin;\nvarying float vBlend;\n', 'totalEmissiveRadiance = mix(uSkin, totalEmissiveRadiance, vBlend);\n'] : '', bl ? { uSkin: { value: skin.emissive } } : null);
    mat.emissiveMap = h.map || null;
    // משני הצדדים: בקפלים של האצבעות הכפופות (ובקצה הגזור של כף היד) יש משולשים שהפנים שלהם הפוכים אל המצלמה — בצד אחד
    // הם נעלמו, ונראו חורים ו"קרעים" בשולי כף היד (שלמה 16.11). החומר בהיר מעצמו (selfLit), כך שהצד ההפוך נראה אותו דבר
    mat.side = THREE.DoubleSide;
    const hm = new THREE.Mesh(h.geo, mat); hm.matrixAutoUpdate = false; hm.matrix.makeBasis(aDir, fDir, pDir).setPosition(hO); hm.userData.hand = true; hm.frustumCulled = false; hm.renderOrder = 10; dev.add(hm); handM = hm;
    // שום קודקוד של היד לא בתוך המכשיר: מה שנכנס אליו (או קרוב מ-3 מ"מ) נדחף החוצה, בכיוון הדופן הקרובה
    { const P = h.geo.attributes.position, inv = hm.matrix.clone().invert(), v = new THREE.Vector3(), g = new THREE.Vector3(), e = 0.0005;
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(hm.matrix); let d = devSdf(v); if (d >= 0.003) continue;
        for (let it = 0; it < 4 && d < 0.003; it++) { g.set(devSdf(v.clone().setX(v.x + e)) - devSdf(v.clone().setX(v.x - e)), devSdf(v.clone().setY(v.y + e)) - devSdf(v.clone().setY(v.y - e)), devSdf(v.clone().setZ(v.z + e)) - devSdf(v.clone().setZ(v.z - e))).normalize();
          v.addScaledVector(g, 0.003 - d); d = devSdf(v); }
        v.applyMatrix4(inv); P.setXYZ(i, v.x, v.y, v.z); } P.needsUpdate = true; }
    if (h.color) skin.emissive.copy(h.color);
    WRIST = h.wrist.clone().applyMatrix4(hm.matrix); samplePts(); aimArm(); };
  aimArm();
  return { group, show, face, pts, aimArm, setHand, handPose, cfg, hO, rest: dev.position.clone(), faceRest: face.getWorldPosition(new THREE.Vector3()) };
}
let AC = null;
function beep(ok) {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = 'square'; o.frequency.value = ok ? 1320 : 440; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + (ok ? 0.12 : 0.35)); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.4); } catch { }
}
export { PATH as INSP_PATH, EYE as INSP_EYE, SEATS as INSP_SEATS };
