// שלושה סוגי אוטובוס נוספים מתוך assets/bus.glb (האוטובוס של Blender): מיניבוס, מפרקי וחשמלי.
// הרצה (מתיקיית unreleased/bus-game):  node tools/build_bus_variants.mjs
// יוצא: assets/bus_mini.glb, assets/bus_artic.glb, assets/bus_elec.glb (+ assets/bus_variants.json — המידות והמקומות)
//
// איך: Blender לא מותקן כאן, ולכן לא בונים מאפס אלא "חותכים ומדביקים" את האוטובוס הקיים לאורכו (ציר Z):
// כל משולש שחוצה קו חיתוך נחתך בדיוק עליו, כך ששני קטעים שנחתכו באותו חתך רוחב מתחברים בלי חריץ.
// החיתוכים עוברים רק ברווחים שבין שורות המושבים, העמודים והשלטים (נמדדו בדגם), כך ששום חפץ לא נחתך באמצע.
// הדלתות, העמודים, ידיות המושבים וטבעות האחיזה הם אובייקטים נפרדים בדגם — עוברים שלמים לפי המרכז שלהם.
// כל השלטים מקלסר "שילוט אוטובוסים אחיד" נמצאים בגוף ובכנפי הדלתות, ועוברים עם הקטע שלהם.
//
// מערכת הצירים כמו ב-bus.glb: חזית ב-‎+Z (פגוש ב-z ≈ 6.0), גג ב-‎+Y, הדלתות בצד ‎-X, הכביש ב-y = 0, רצפה פנימית y = 0.675.
// בכל הדגמים החזית באותו מקום (z = 6) — תא הנהג של js/driver.js, הדלת הקדמית והמתקף הקדמי נשארים בדיוק במקומם.
import { readGLB, worldMatrices, meshToPart, partBox, mapTris, triBox, transformPart, translate, mergeParts, clipSlab, cutSlab,
  Builder, roundRect, writeGLB, triCount, M4 } from './glblib.mjs';
import path from 'path';
import fs from 'fs';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(DIR, 'assets/bus.glb');
const g = readGLB(SRC), J = g.json, { W } = worldMatrices(J);
const MN = J.materials.map(m => m.name), mat = n => { const i = MN.indexOf(n); if (i < 0) throw new Error('no material ' + n); return i; };
const FLOOR = 0.675;

// ---------- חומרים חדשים (נוספים בסוף הרשימה)
const NEW_MATS = [];
const addMat = m => { NEW_MATS.push(m); return J.materials.length + NEW_MATS.length - 1; };
// הגוף לבן (אוטובוס עירוני בארץ) במקום הפח הכסוף של bus.glb — אותו חומר, צבע אחר
const M_WHITE = addMat({ name: 'M_BodyWhite', doubleSided: true, extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.6 } },
  pbrMetallicRoughness: { baseColorFactor: [0.86, 0.87, 0.88, 1], metallicFactor: 0.05, roughnessFactor: 0.3 } });
const M_BELLOWS = addMat({ name: 'M_Bellows', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.035, 0.036, 0.038, 1], metallicFactor: 0, roughnessFactor: 0.85 } });
const M_TURN = addMat({ name: 'M_Turntable', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.2, 0.21, 0.22, 1], metallicFactor: 0.6, roughnessFactor: 0.45 } });
const M_EVLINE = addMat({ name: 'M_EVAccent', doubleSided: true, emissiveFactor: [0.15, 0.55, 1.0], extensions: { KHR_materials_emissive_strength: { emissiveStrength: 2 } },
  pbrMetallicRoughness: { baseColorFactor: [0.1, 0.45, 0.9, 1], metallicFactor: 0, roughnessFactor: 0.3 } });

// ---------- קריאת הדגם
const nodeIdx = n => J.nodes.findIndex(x => x.name === n);
const bodyI = nodeIdx('Bus_Body');
const BODY = meshToPart(g, J.nodes[bodyI].mesh, W[bodyI], 'Bus_Body');
const OBJS = [];        // אובייקטים קטנים: עמודים, ידיות, טבעות, שלט היעד
J.nodes.forEach((n, i) => {
  if (n.mesh == null || n.name === 'Bus_Body' || /^Leaf_/.test(n.name)) return;
  const name = n.name === 'SM_SignDest' || n.name === 'SM_SignNum' ? n.name : n.name;
  const p = meshToPart(g, n.mesh, W[i], name); OBJS.push(p);
});
const DOORS = [];       // { name, T, leaf (בקואורדינטות של הדלת), key: Front|Mid, k: 0|1 }
J.nodes.forEach((n, i) => {
  const m = /^Door_(Front|Mid)([01])$/.exec(n.name); if (!m) return;
  const li = n.children[0], leaf = meshToPart(g, J.nodes[li].mesh, M4.I(), J.nodes[li].name);
  DOORS.push({ name: n.name, T: n.translation.slice(), leaf, key: m[1], k: +m[2] });
});
const ANCH = Object.fromEntries(J.nodes.filter(n => /^Anchor_/.test(n.name)).map(n => [n.name, n.translation.slice()]));
// אנימציית הדלתות: ההזזה של כל כנף ביחס למקומה (DoorsOpen)
const AN = J.animations[0], DOOR_KEYS = {};
for (const ch of AN.channels) {
  const s = AN.samplers[ch.sampler], t = Array.from(g.acc(s.input)), v = Array.from(g.acc(s.output)), node = J.nodes[ch.target.node];
  DOOR_KEYS[node.name] = { times: t, deltas: t.map((_, i) => [0, 1, 2].map(c => v[i * 3 + c] - node.translation[c])) };
}

// ---------- המקומות בדגם המקורי (נמדדו): שורות המושבים, הדלתות, הסרנים, המתקפים
const DOORWAY = { Front: [4.565, 5.735], Mid: [-0.585, 0.635] };
const AXLE = { F: 3.35, R: -2.6 };
const VALIDATORS = [ // מרכז המסך
  { name: 'Validator_Front', door: 'Front', p: [-0.42, 1.91, 4.56], kind: 'portrait' },
  { name: 'Validator_Mid', door: 'Mid', p: [-0.42, 1.91, 0.81], kind: 'portrait' },
  { name: 'Validator_Mid2', door: 'Mid', p: [-0.42, 1.88, -0.55], kind: 'landscape' }];

const isM = (m, ...names) => names.some(n => MN[m] === n);
// חיפוי הקיר התחתון בצד הדלתות (M_Panel) עובר גם לרוחב פתחי הדלתות — חותכים אותו בפתחים (ב-actors.js זה נעשה בזמן ריצה, cutDoorPanels)
function cutDoorways(body, ways) {
  for (const [a, b] of ways) body = cutSlab(body, 2, a, b, (m, tri) => { if (!isM(m, 'M_Panel')) return false; const bx = triBox(tri); return bx.mx[0] < -1.1 && bx.mn[1] > 0.6 && bx.mx[1] < 1.4; });
  return body;
}
// הגלגל הקדמי בצד הנהג (‎+X) בולט מעל הרצפה, ובדגם המקורי אין מעליו קופסת קשת (רק מושב שמסתיר אותו).
// במיניבוס המושבים שם יצאו והצמיג נראה — מוסיפים קופסה כמו קופסאות הקשת האחרות, בכל הדגמים
const ARCH_FX = (() => { const B = new Builder('arch'); B.box(mat('M_Panel'), [0.915, FLOOR + 0.265, AXLE.F - 0.14], [0.62, 0.53, 1.04]); return B.part; })();
// השלטים 4 ו-6 (מקום שמור, עיוור עם כלב) על הקיר מעל הקופסה — מורמים כדי שלא ייכנסו בה
const BASE_BODY = mergeParts('Bus_Body', mapTris(cutDoorways(BODY, Object.values(DOORWAY)), (m, tri) => {
  if (!isM(m, 'M_Sign4', 'M_Sign6')) return true; const o = tri.slice(); for (let v = 0; v < 3; v++) o[v * 8 + 1] += 0.105; return [o]; }), ARCH_FX);

// קטעים: [zLo, zHi, shift] — לוקחים את מה שבין zLo ל-zHi ומזיזים ב-shift
function splice(segs, { body = BASE_BODY, objs = OBJS, doors = DOORS } = {}) {
  const parts = segs.map(([lo, hi, s]) => translate(clipSlab(body, 2, lo, hi), [0, 0, s]));
  const inSeg = z => segs.find(([lo, hi]) => z >= lo && z <= hi);
  const O = [];
  for (const o of objs) { const c = partBox(o).c, sg = inSeg(c[2]); if (sg) O.push({ ...translate(o, [0, 0, sg[2]]), name: o.name }); }
  const D = [];
  for (const d of doors) { const sg = inSeg(d.T[2]); if (sg) D.push({ ...d, T: [d.T[0], d.T[1], d.T[2] + sg[2]] }); }
  return { body: mergeParts('Bus_Body', ...parts), objs: O, doors: D, map: z => { const sg = inSeg(z); return sg ? z + sg[2] : null; } };
}

// מוחקים משולשים בתיבה (אופציונלית לפי חומר)
const dropBox = (part, mn, mx, mats = null) => mapTris(part, (m, tri) => {
  if (mats && !mats.some(n => MN[m] === n)) return true;
  const b = triBox(tri); return b.mn.every((v, k) => v >= mn[k]) && b.mx.every((v, k) => v <= mx[k]) ? null : true;
});
const pickBox = (part, mn, mx, mats) => mapTris(part, (m, tri) => {
  if (mats && !mats.some(n => MN[m] === n)) return null;
  const b = triBox(tri); return b.mn.every((v, k) => v >= mn[k]) && b.mx.every((v, k) => v <= mx[k]) ? true : null;
});
const SEAT_MATS = ['M_SeatFabric', 'M_SeatShell', 'M_Steel', 'M_USB'];
// שורת מושבים k במקור: מרכז המושב z = 4 − 0.8k
const dropSeatRow = (body, k) => dropBox(body, [-1.3, 0.6, 4 - 0.8 * k - 0.42], [1.3, 1.95, 4 - 0.8 * k + 0.26], SEAT_MATS);

// ---------- מידע לשילוב במשחק: מושבים (מתוך הידיות), עמודים, דלתות, מתקפים
function seatsOf(objs, section = 'front', off = 0) {
  return objs.filter(o => /^SM_Seat.*_Grab/.test(o.name)).map(o => {
    const c = partBox(o).c; const zg = c[2];
    return { grab: o.name, x: +c[0].toFixed(3), z: +(zg + 0.3).toFixed(3), back: +(zg + 0.125).toFixed(3), cushionY: 1.14, floorY: FLOOR,
      side: c[0] < 0 ? 'door' : 'driver', pos: Math.abs(c[0]) > 0.7 ? 'window' : 'aisle', section, zBus: +(zg + 0.3 + off).toFixed(3) };
  }).sort((a, b) => b.zBus - a.zBus || b.x - a.x);
}
function polesOf(objs, section = 'front', off = 0) {
  return objs.filter(o => /^SM_Pole/.test(o.name)).map(o => {
    let x = 0, n = 0, ymin = 1e9; for (const a of o.prims.values()) for (let i = 0; i < a.length; i += 8) if (a[i + 1] < ymin + 1e-3) { if (a[i + 1] < ymin - 1e-3) { ymin = a[i + 1]; x = 0; n = 0; } x += a[i]; n++; }
    const c = partBox(o).c; return { name: o.name, x: +(x / n).toFixed(3), z: +c[2].toFixed(3), section, zBus: +(c[2] + off).toFixed(3) };
  }).sort((a, b) => b.zBus - a.zBus);
}

// ---------- כתיבת סצנה
function sceneWriter() {
  const nodes = [], meshes = [];
  const addMesh = (name, part, extra = {}) => { meshes.push({ name, part, ...extra }); return meshes.length - 1; };
  const node = (n) => { nodes.push(n); return nodes.length - 1; };
  return { nodes, meshes, addMesh, node };
}
// מוסיף לסצנה אוטובוס/קטע: הגוף, הדלתות (עם הכנפיים), העמודים וכו'. off — מיקום הצומת של הקטע (מחסירים מהקואורדינטות)
function emitSection(S, sec, { off = 0, suffix = '', doorRename = {} } = {}) {
  const kids = [], sh = p => off ? translate(p, [0, 0, -off]) : p;
  kids.push(S.node({ name: 'Bus_Body' + suffix, mesh: S.addMesh('Bus_Body' + suffix, sh(sec.body)) }));
  for (const o of sec.objs) kids.push(S.node({ name: o.name + suffix, mesh: S.addMesh(o.name + suffix, sh(o)) }));
  const doorNodes = [];
  for (const d of sec.doors) {
    const nm = doorRename[d.key] || d.key, name = `Door_${nm}${d.k}`;
    const leaf = S.node({ name: `Leaf_${nm}${d.k}`, mesh: S.addMesh(`Leaf_${nm}${d.k}`, d.leaf) });
    const T = [d.T[0], d.T[1], d.T[2] - off];
    const di = S.node({ name, translation: T, children: [leaf] }); kids.push(di);
    doorNodes.push({ node: di, src: d.name, T });
  }
  for (const e of sec.empties || []) kids.push(S.node({ name: e.name, translation: [e.p[0], e.p[1], e.p[2] - off], ...(e.extras ? { extras: e.extras } : {}) }));
  for (const m of sec.extraMeshes || []) kids.push(S.node({ name: m.name, mesh: S.addMesh(m.name, sh(m.part)) }));
  return { kids, doorNodes };
}
function doorAnim(doorNodes) {
  return { name: 'DoorsOpen', channels: doorNodes.map(d => { const K = DOOR_KEYS[d.src]; return { node: d.node, path: 'translation', times: K.times, values: K.deltas.flatMap(v => [d.T[0] + v[0], d.T[1] + v[1], d.T[2] + v[2]]) }; }) };
}
// חומרים: רק מה שבשימוש, והפח הכסוף מוחלף בלבן
function finish(file, S, { animations, skins = [], extras, scenes }) {
  const used = new Set(); for (const m of S.meshes) for (const k of m.part.prims.keys()) used.add(k);
  const silver = mat('M_Silver');
  for (const m of S.meshes) if (m.part.prims.has(silver)) { const p = new Map(m.part.prims); const a = p.get(silver); p.delete(silver); p.set(M_WHITE, [...(p.get(M_WHITE) || []), ...a]); m.part = { ...m.part, prims: p }; }
  used.delete(silver); used.add(M_WHITE);
  const all = [...J.materials, ...NEW_MATS], order = [...used].sort((a, b) => a - b), remap = new Map(order.map((m, i) => [m, i]));
  const r = writeGLB(file, { src: g, materials: order.map(i => all[i]), matRemap: m => remap.get(m), nodes: S.nodes, meshes: S.meshes, scenes, animations, skins, extras });
  console.log(path.basename(file), 'tris', r.tris, 'bytes', r.bytes);
  return r;
}
const r3 = v => v.map(x => +x.toFixed(3));

// =====================================================================================
// 1. מיניבוס 8.6 מ': דלת קדמית אחת, גג נמוך ב-25 ס"מ, 18 מושבים ואזור עמידה/כסא גלגלים
// =====================================================================================
function buildMini() {
  // לפני החיתוך: מוציאים את שורות המושבים 2 ו-7 (אזור עמידה וכסא גלגלים), ואת השלט "תיקוף בסלולרי" שליד הדלת האמצעית מבחוץ
  let body = dropSeatRow(dropSeatRow(BASE_BODY, 2), 7);
  body = dropBox(body, [-1.4, 1.4, -0.95], [-1.2, 2.1, -0.6], ['M_Sign1']);
  const objs = OBJS.filter(o => !/^SM_Seat(2|7)_/.test(o.name));
  // קטעים: חזית [1.835, 6] (דלת קדמית, סרן קדמי), אמצע [-3.7, -0.75] (הסרן האחורי), אחור [-6, -4.5]
  const F = [1.835, 7, 0], Mseg = [-3.7, -0.75, 1.835 + 0.75], Rseg = [-7, -4.5, (-3.7 + 1.835 + 0.75) + 4.5];
  const sec = splice([F, Mseg, Rseg], { body, objs, doors: DOORS.filter(d => d.key === 'Front') });
  // אזור כסא גלגלים (מושב מתקפל, חגורה, מעקים, לחצן ושלטים 8, 5, 7) — מועתק מול הדלת האמצעית במקור אל המקום הפנוי
  const WC = pickBox(BASE_BODY, [0.6, 0.6, -0.95], [1.3, 2.2, 0.95], ['M_SeatFabric', 'M_Trim', 'M_Steel', 'M_Pole', 'M_StopBtn', 'M_Sign8', 'M_Sign5', 'M_Sign7']);
  const WC_DZ = 1.75;
  sec.body = mergeParts('Bus_Body', sec.body, translate(WC, [0, 0, WC_DZ]));
  // גלגלים: אפשר להקטין (WS), אבל כרגע בגודל המקורי
  const axles = [AXLE.F, sec.map(AXLE.R)], WS = 1;   // הקטנת הגלגלים (WS < 1) השאירה את קשתות הגלגל ריקות וכהות — נשארים בגודל המקורי
  const wheel = (tri, m) => { if (!(isM(m, 'M_Rubber') || (isM(m, 'M_Steel') && triBox(tri).mx[1] < 0.98))) return null;
    for (const az of axles) { let ok = true; for (let v = 0; v < 3; v++) { const y = tri[v * 8 + 1], z = tri[v * 8 + 2], x = tri[v * 8]; if (Math.abs(x) < 0.85 || Math.hypot(y - 0.53, z - az) > 0.56) ok = false; } if (ok) return az; } return null; };
  if (WS !== 1) sec.body = mapTris(sec.body, (m, tri) => { const az = wheel(tri, m); if (az == null) return true; const o = tri.slice(); for (let v = 0; v < 3; v++) { o[v * 8 + 1] = 0.53 * WS + (tri[v * 8 + 1] - 0.53) * WS; o[v * 8 + 2] = az + (tri[v * 8 + 2] - az) * WS; } return [o]; });
  // גג נמוך: מעל y = 2.1 הכל נדחס, כך שהגג יורד מ-3.15 ל-2.90 (החלונות נמוכים יותר, הדלת עד 2.58)
  const Y0 = 2.1, YS = (3.15 - 0.25 - Y0) / (3.15 - Y0);
  const ry = p => [p[0], p[1] > Y0 ? Y0 + (p[1] - Y0) * YS : p[1], p[2]];
  const rn = (n, p) => p[1] > Y0 ? (() => { const v = [n[0], n[1] / YS, n[2]]; const l = Math.hypot(...v) || 1; return v.map(a => a / l); })() : n;
  sec.body = transformPart(sec.body, ry, rn);
  sec.objs = sec.objs.map(o => ({ ...transformPart(o, ry, rn), name: o.name }));
  sec.doors = sec.doors.map(d => ({ ...d, leaf: transformPart(d.leaf, p => { const w = ry([p[0] + d.T[0], p[1] + d.T[1], p[2] + d.T[2]]); return [w[0] - d.T[0], w[1] - d.T[1], w[2] - d.T[2]]; }, rn) }));
  const rearZ = sec.map(-6), seats = seatsOf(sec.objs), poles = polesOf(sec.objs);
  seats.forEach((s, i) => { s.name = `Seat_${String(i + 1).padStart(2, '0')}`; });
  sec.empties = [
    { name: 'Anchor_DoorFront', p: ANCH.Anchor_DoorFront },
    { name: 'Validator_Front', p: VALIDATORS[0].p, extras: { door: 'Front', kind: 'portrait' } },
    { name: 'Wheelchair_Area', p: [0.85, FLOOR, 0.025 + WC_DZ] },
    ...seats.map(s => ({ name: s.name, p: [s.x, FLOOR, s.z], extras: { back: s.back, cushionY: s.cushionY, side: s.side, pos: s.pos } }))];
  const S = sceneWriter(), { kids, doorNodes } = emitSection(S, sec);
  const extras = { type: 'mini', length: +(6.09 - rearZ + 0.09).toFixed(2), width: 2.55, roofY: 2.9, floorY: FLOOR, frontZ: 6, rearZ: +rearZ.toFixed(3),
    axles: axles.map(z => +z.toFixed(3)), wheelRadius: +(0.53 * WS).toFixed(3), roofLower: { from: Y0, scale: +YS.toFixed(4) },
    doors: [{ name: 'Front', z0: DOORWAY.Front[0], z1: DOORWAY.Front[1], anchor: 'Anchor_DoorFront' }],
    validators: [{ name: 'Validator_Front', door: 'Front', p: VALIDATORS[0].p }],
    wheelchair: { x: [0.6, 1.25], z: r3([-0.66 + WC_DZ, 0.76 + WC_DZ]) }, standArea: { x: [-1.0, 1.0], z: [0.75, 2.85] },
    seats, poles, strapRings: sec.objs.filter(o => /StrapRing/.test(o.name)).map(o => r3(partBox(o).c)) };
  const scenes = [{ name: 'Scene', nodes: kids }];
  const r = finish(path.join(DIR, 'assets/bus_mini.glb'), S, { animations: [doorAnim(doorNodes)], extras, scenes });
  return { extras, ...r };
}

// =====================================================================================
// 2. מפרקי 17.8 מ': קטע קדמי (דלת קדמית ואמצעית, סרן קדמי ואמצעי), מפרק (מפוח + צלחת), קטע אחורי (דלת שלישית, סרן מניע)
// =====================================================================================
function buildArtic() {
  const ZF = -3.70, GAP = 0.8, PIV = ZF - GAP / 2, ZR = ZF - GAP;      // קצה הקטע הקדמי, ציר הסיבוב, קצה הקטע האחורי
  const RCUT = 1.28, RSH = ZR - RCUT;                                  // הקטע האחורי = המקור [-6, 1.28], מוזז ב-RSH
  const front = splice([[ZF, 7, 0]]);
  // העמוד שבמקור ב-z = 1.24 (שייך לשורת המושבים שלפניו) היה עומד צמוד למסגרת המעבר — בלעדיו, וגם בלי הבסיס והלחצן שלו
  const rear = splice([[-7, RCUT, RSH]], { body: dropBox(BASE_BODY, [-0.6, 0.6, 1.17], [0.6, 2.3, 1.3], ['M_Trim', 'M_StopBtn', 'M_StopFace']),
    objs: OBJS.filter(o => !/^SM_Pole6/.test(o.name)) });
  // שורות המושבים והאבזרים שנחתכו בקצוות: בקצה של כל קטע — מסגרת מעבר (פורטל), ותושבות לסוף המעקות שבתקרה
  const portal = (z0, z1) => {
    const B = new Builder('portal'), m = mat('M_Trim');
    const O = roundRect(1.29, 0.285, 3.165, 0.33, 0.07, 6), I = roundRect(1.05, 0.655, 2.80, 0.30, 0.0001, 6);
    const P = (a, z) => a.map(([x, y]) => [x, y, z]);
    B.ring(m, P(O, z1), P(I, z1), [0, 0, 1]); B.ring(m, P(I, z0), P(O, z0), [0, 0, -1]);
    B.strip(m, P(O, z0), P(O, z1)); B.strip(m, P(I, z1), P(I, z0));
    for (const sx of [-1, 1]) B.box(m, [sx * 0.5, 2.51, (z0 + z1) / 2 + (z1 > ZF - 0.1 ? -0.03 : 0.03)], [0.05, 0.06, 0.06]);   // סוף המעקה
    return B.part;
  };
  front.extraMeshes = [{ name: 'Joint_PortalFront', part: portal(ZF - 0.025, ZF + 0.035) }];
  rear.extraMeshes = [{ name: 'Joint_PortalRear', part: portal(ZR - 0.035, ZR + 0.025) }];
  // צלחת מסתובבת ברצפה, במרכז המפרק (חלק מהקטע הקדמי)
  { const B = new Builder('turn'), N = 40, R0 = 0.86, y = FLOOR + 0.004;
    for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      const p = (r, a, yy) => [r * Math.cos(a), yy, PIV + r * Math.sin(a)];
      B.tri(M_TURN, [0, y + 0.012, PIV], p(R0, a1, y + 0.012), p(R0, a0, y + 0.012), [0, 1, 0]);
      B.quad(M_TURN, p(R0, a0, y + 0.012), p(R0, a1, y + 0.012), p(R0, a1, y - 0.006), p(R0, a0, y - 0.006));
      B.quad(mat('M_Rubber'), p(0.58, a0, y + 0.0125), p(0.58, a1, y + 0.0125), p(0.6, a1, y + 0.0125), p(0.6, a0, y + 0.0125), [0, 1, 0]); }
    front.extraMeshes.push({ name: 'Joint_Turntable', part: B.part }); }
  // המפוח: טבעות מקופלות בין שני הקטעים. רשת עם שלד (skin): הקצה הקדמי צמוד ל-Section_Front והאחורי ל-Section_Rear
  const bel = new Builder('bellows'), NF = 16, prof = d => roundRect(1.235 - d, 0.36 + d, 3.09 - d, 0.34, 0.08, 6);
  const rings = []; for (let i = 0; i <= NF; i++) { const z = ZF + 0.02 - (GAP + 0.04) * i / NF, d = i % 2 ? 0.045 : 0; rings.push(prof(d).map(([x, y]) => [x, y, z])); }
  for (let i = 0; i < NF; i++) bel.strip(M_BELLOWS, rings[i], rings[i + 1]);
  const belSkin = (x, y, z) => { const t = Math.min(1, Math.max(0, (ZF + 0.02 - z) / (GAP + 0.04))), s = t * t * (3 - 2 * t); return { j: [0, 1, 0, 0], w: [1 - s, s, 0, 0] }; };

  // מושבים וכו'
  const sf = seatsOf(front.objs, 'front', 0), sr = seatsOf(rear.objs, 'rear', PIV);
  [...sf, ...sr].forEach((s, i) => { s.name = `Seat_${String(i + 1).padStart(2, '0')}`; });
  sr.forEach(s => { s.zBus = +(s.z).toFixed(3); s.z = +(s.z - PIV).toFixed(3); s.back = +(s.back - PIV).toFixed(3); });
  const se = (s, section) => ({ name: s.name, p: [s.x, FLOOR, section === 'rear' ? s.z + PIV : s.z], extras: { back: s.back, cushionY: s.cushionY, side: s.side, pos: s.pos, section } });
  front.empties = [{ name: 'Anchor_DoorFront', p: ANCH.Anchor_DoorFront }, { name: 'Anchor_DoorMid', p: ANCH.Anchor_DoorMid },
    { name: 'Validator_Front', p: VALIDATORS[0].p, extras: { door: 'Front', kind: 'portrait' } },
    { name: 'Validator_Mid', p: VALIDATORS[1].p, extras: { door: 'Mid', kind: 'portrait' } },
    { name: 'Validator_Mid2', p: VALIDATORS[2].p, extras: { door: 'Mid', kind: 'landscape' } }, ...sf.map(s => se(s, 'front'))];
  const zr = z => z + RSH;   // מקור → קואורדינטות האוטובוס בקטע האחורי
  rear.empties = [{ name: 'Anchor_DoorRear', p: [ANCH.Anchor_DoorMid[0], 0, zr(ANCH.Anchor_DoorMid[2])] },
    { name: 'Validator_Rear', p: [VALIDATORS[1].p[0], VALIDATORS[1].p[1], zr(VALIDATORS[1].p[2])], extras: { door: 'Rear', kind: 'portrait' } },
    { name: 'Validator_Rear2', p: [VALIDATORS[2].p[0], VALIDATORS[2].p[1], zr(VALIDATORS[2].p[2])], extras: { door: 'Rear', kind: 'landscape' } }, ...sr.map(s => se(s, 'rear'))];
  rear.doors = rear.doors.filter(d => d.key === 'Mid');
  rear.objs = rear.objs.filter(o => !/^SM_Sign(Dest|Num)/.test(o.name));

  const S = sceneWriter();
  const F = emitSection(S, front), Rr = emitSection(S, rear, { off: PIV, suffix: '_R', doorRename: { Mid: 'Rear' } });
  // השמות של הדלתות האחוריות: Door_Rear0/1, Leaf_Rear0/1 (בלי _R)
  const secF = S.node({ name: 'Section_Front', children: F.kids, extras: { pivotZ: PIV } });
  const secR = S.node({ name: 'Section_Rear', translation: [0, 0, PIV], children: Rr.kids, extras: { pivotZ: PIV, note: 'rotation.y = זווית הכיפוף (רדיאנים; חיובי = הקטע האחורי זז לצד הדלתות ‎-X, כמו בפנייה שמאלה)' } });
  const belMesh = S.addMesh('Joint_Bellows', bel.part, { skin: belSkin });
  const belNode = S.node({ name: 'Joint_Bellows', mesh: belMesh, skin: 0 });
  const skins = [{ name: 'Joint', joints: [secF, secR], ibm: [M4.I(), M4.trs([0, 0, -PIV])] }];
  const rearZ = zr(-6);
  const extras = { type: 'artic', length: +(6.09 - rearZ + 0.09).toFixed(2), width: 2.55, roofY: 3.15, floorY: FLOOR, frontZ: 6, rearZ: +rearZ.toFixed(3),
    pivotZ: PIV, joint: { front: ZF, rear: ZR, turntableR: 0.86 }, axles: [AXLE.F, AXLE.R, +zr(AXLE.R).toFixed(3)],
    doors: [{ name: 'Front', z0: DOORWAY.Front[0], z1: DOORWAY.Front[1], anchor: 'Anchor_DoorFront', section: 'front' },
      { name: 'Mid', z0: DOORWAY.Mid[0], z1: DOORWAY.Mid[1], anchor: 'Anchor_DoorMid', section: 'front' },
      { name: 'Rear', z0: +zr(DOORWAY.Mid[0]).toFixed(3), z1: +zr(DOORWAY.Mid[1]).toFixed(3), anchor: 'Anchor_DoorRear', section: 'rear', zLocal: r3([zr(DOORWAY.Mid[0]) - PIV, zr(DOORWAY.Mid[1]) - PIV]) }],
    validators: [...VALIDATORS.map(v => ({ name: v.name, door: v.door, p: v.p, section: 'front' })),
      { name: 'Validator_Rear', door: 'Rear', p: r3([VALIDATORS[1].p[0], VALIDATORS[1].p[1], zr(VALIDATORS[1].p[2])]), section: 'rear' },
      { name: 'Validator_Rear2', door: 'Rear', p: r3([VALIDATORS[2].p[0], VALIDATORS[2].p[1], zr(VALIDATORS[2].p[2])]), section: 'rear' }],
    seats: [...sf, ...sr], poles: [...polesOf(front.objs, 'front', 0), ...polesOf(rear.objs, 'rear', 0).map(p => ({ ...p, zLocal: +(p.z - PIV).toFixed(3) }))],
    strapRings: [...front.objs, ...rear.objs].filter(o => /StrapRing/.test(o.name)).map(o => r3(partBox(o).c)),
    note: 'Section_Rear ו-Section_Front הם עצמות (Bone) של המפוח — לשכפל עם SkeletonUtils.clone ולא עם scene.clone' };
  // הצמתים של הדלתות בקטע האחורי נקראים Door_Rear*, הכנפיים Leaf_Rear* — ב-emitSection הם קיבלו את השם בלי suffix; האנימציה לפי הצמתים
  const scenes = [{ name: 'Scene', nodes: [secF, secR, belNode] }];
  const r = finish(path.join(DIR, 'assets/bus_artic.glb'), S, { animations: [doorAnim([...F.doorNodes, ...Rr.doorNodes])], skins, extras, scenes });
  return { extras, ...r };
}

// =====================================================================================
// 3. חשמלי 12 מ': אותו פנים ואותן דלתות; מארז סוללות אחד ארוך על הגג, חזית סגורה, מכסה שקע טעינה; בלי שלט סולר (28) ופליטת עשן (32)
// =====================================================================================
function buildElec() {
  let body = BASE_BODY;
  // הגג: מוציאים את שני המארזים הלבנים ואת פתחי האוורור שעליהם
  body = mapTris(body, (m, tri) => { const b = triBox(tri); if (isM(m, 'M_RoofWhite') && b.mn[1] > 3.1) return null; if (isM(m, 'M_Trim') && b.mn[1] > 3.3) return null; return true; });
  body = mapTris(body, m => isM(m, 'M_Sign28', 'M_Sign32') ? null : true);
  const B = new Builder('ev'), WH = mat('M_RoofWhite'), TR = mat('M_Trim'), GB = mat('M_GlossBlack');
  // מארז הסוללות: חתך מלבני מעוגל, משופע בקצוות
  const st = [[5.15, 0.86, 3.27], [4.55, 1.05, 3.53], [-4.75, 1.05, 3.53], [-5.3, 0.9, 3.33]];
  const rings = st.map(([z, hw, top]) => roundRect(hw, 3.12, top, 0.13, 0.02, 5).map(([x, y]) => [x, y, z]));
  for (let i = 0; i + 1 < rings.length; i++) B.strip(WH, rings[i], rings[i + 1]);
  B.cap(WH, rings[0], [0, 0, 1]); B.cap(WH, [...rings[3]].reverse(), [0, 0, -1]);
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) B.box(TR, [sx * 1.052, 3.33, 3.6 - k * 1.25], [0.012, 0.13, 0.62]);   // פתחי קירור בצדי המארז
  for (let k = 0; k < 4; k++) B.box(TR, [0, 3.535, 2.6 - k * 2.2], [1.3, 0.008, 0.05]);                                     // תפרים בין מכסי הסוללות
  // חזית: מסכה שחורה סגורה בין אשכולות הפנסים (במקום רשת), ופס תכלת דק מתחתיה
  B.box(GB, [0, 0.82, 6.012], [1.18, 0.26, 0.035]);
  B.box(M_EVLINE, [0, 0.665, 6.008], [1.9, 0.018, 0.022]);
  // מכסה שקע הטעינה בצד הנהג, מאחורי הסרן האחורי
  B.box(GB, [1.281, 1.0, -4.4], [0.012, 0.3, 0.34]); B.box(mat('M_Steel'), [1.285, 1.0, -4.4], [0.006, 0.02, 0.3]);
  body = mergeParts('Bus_Body', body, B.part);
  const sec = { body, objs: OBJS, doors: DOORS };
  const seats = seatsOf(sec.objs), poles = polesOf(sec.objs);
  seats.forEach((s, i) => { s.name = `Seat_${String(i + 1).padStart(2, '0')}`; });
  sec.empties = [{ name: 'Anchor_DoorFront', p: ANCH.Anchor_DoorFront }, { name: 'Anchor_DoorMid', p: ANCH.Anchor_DoorMid },
    ...VALIDATORS.map(v => ({ name: v.name, p: v.p, extras: { door: v.door, kind: v.kind } })),
    ...seats.map(s => ({ name: s.name, p: [s.x, FLOOR, s.z], extras: { back: s.back, cushionY: s.cushionY, side: s.side, pos: s.pos } }))];
  const S = sceneWriter(), { kids, doorNodes } = emitSection(S, sec);
  const extras = { type: 'elec', length: 12.19, width: 2.55, roofY: 3.53, floorY: FLOOR, frontZ: 6, rearZ: -6, axles: [AXLE.F, AXLE.R],
    doors: [{ name: 'Front', z0: DOORWAY.Front[0], z1: DOORWAY.Front[1], anchor: 'Anchor_DoorFront' }, { name: 'Mid', z0: DOORWAY.Mid[0], z1: DOORWAY.Mid[1], anchor: 'Anchor_DoorMid' }],
    validators: VALIDATORS.map(v => ({ name: v.name, door: v.door, p: v.p })), seats, poles,
    strapRings: sec.objs.filter(o => /StrapRing/.test(o.name)).map(o => r3(partBox(o).c)) };
  const r = finish(path.join(DIR, 'assets/bus_elec.glb'), S, { animations: [doorAnim(doorNodes)], extras, scenes: [{ name: 'Scene', nodes: kids }] });
  return { extras, ...r };
}

const only = process.argv[2];
const out = {};
console.log('bus.glb tris', triCount(BODY) + OBJS.reduce((s, o) => s + triCount(o), 0) + DOORS.reduce((s, d) => s + triCount(d.leaf), 0));
for (const [k, f] of [['mini', buildMini], ['artic', buildArtic], ['elec', buildElec]]) if (!only || only === k) { const r = f(); out[k] = { file: `bus_${k}.glb`, tris: r.tris, bytes: r.bytes, ...r.extras }; }
if (!only) fs.writeFileSync(path.join(DIR, 'assets/bus_variants.json'), JSON.stringify(out, null, 1) + '\n');
