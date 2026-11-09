// משחק הקווים — קריית מלאכי (אב-טיפוס): חיבור העולם, הסימולציה, התצוגה והממשק
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadCity, buildWorld } from './world.js';
import { RoadGraph, speedProfile } from './graph.js';
import { Line, loadLines, saveLines, computeRoute, routeMesh, COLORS } from './lines.js';
import { Sim, clockText } from './sim.js';
import { loadAssets, BusLayer, PeopleLayer } from './actors.js';
import { StopLayer, assignRoadWidths, frameV } from './stops.js';
import { refreshAll } from './texkeep.js';
import { INSPECTOR_DAY, FINE, RESERVE_COST } from './ops.js';
import { Coverage, Career, CoverageLayer, STAGES, STOP_FEE, newCareer, COVER_M } from './career.js';
import { setupLook, updateLook } from './look.js';
import { CameraModes } from './cameras.js';
import { Bank, TYPES, TYPE_ORDER, FARE, SELL_BACK, SUBSIDY_KM, typeOf, lineCycle, vehiclesNeeded, fleetChange, fleetValue, isLease, money, dayOf } from './fleet.js';
import { NightFast, FAST } from './night.js';
import { mapTouch } from './touch.js';
import { Demand, DEFAULT_HOURS, hoursOf, inHours } from './demand.js';
import { DemandLayer, FLOW_COL, FLOW_ICON, FLOW_TXT, flowClass, ZTYPES, symSvg, statusSvg } from './demandview.js';

const $ = s => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);

// ---------- three
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
const MAX_PR = Math.min(devicePixelRatio, isTouch ? 1.5 : 1.75);
let pixelRatio = MAX_PR;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 2, 9000);
camera.position.set(-260, 520, 560);
// תאורה, צללים, שמיים וערפל — js/look.js
const look = setupLook(renderer, scene, { touch: isTouch });
if (params.has('noshadow')) { look.sun.castShadow = false; renderer.shadowMap.enabled = false; }
let slowSec = 0;
// סביבה להחזרות: בלעדיה חומרים מתכתיים (הפח הכסוף של האוטובוס, הזכוכית) נראים שטוחים ואפורים.
// ניתנת רק לחומרי האוטובוס (BusLayer), כל חומר בעוצמה משלו; העיר והאנשים לא משתנים
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.userData.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.42; controls.minDistance = 12; controls.maxDistance = 2600;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
// במגע — שליטה בסגנון מפות (touch.js); OrbitControls נשאר לעכבר
controls.touches = { ONE: -1, TWO: -1 };
// טיפ פעם אחת: בשתי אצבעות אפשר גם להטות את המבט (כדי להסתכל לתוך הסככה)
const touch = mapTouch(canvas, camera, controls, { onTwoFingers: () => {
  let seen = false; try { seen = localStorage.getItem('busgame.tiltHint') === '1'; localStorage.setItem('busgame.tiltHint', '1'); } catch { }
  if (!seen) toast('טיפ: גוררים בשתי אצבעות יחד למעלה או למטה כדי להטות את המבט');
} });
controls.target.set(0, 0, 0);

// ---------- מצב המשחק
const G = window.__game = { scene, camera, controls, renderer, lighting: look, fps: 0, frames: 0 };
let career, coverage, covLayer, night, city, graph, sim, bank, buses, people, stopsById, lineDefs, lines = [], cams, demand, dlayer;
const lineGroups = new Map();
let planning = null, selectedStop = null, selectedLine = null;

async function init() {
  const msg = $('#loadMsg');
  const [c, dj] = await Promise.all([loadCity('world/city.json'), fetch('world/demand.json').then(r => r.json())]);
  city = c;
  msg.textContent = 'בונה רחובות ובניינים…';
  await new Promise(r => setTimeout(r, 20));
  buildWorld(scene, city);
  graph = new RoadGraph(city);
  assignRoadWidths(city, graph);
  stopsById = new Map(city.stops.map(s => [s.id, s]));
  msg.textContent = 'טוען את האוטובוס והנוסעים…';
  const assets = params.has('placeholders') ? { bus: null, person: null, people: [] } : await loadAssets('assets/');
  buses = new BusLayer(scene, assets.bus, assets.people);
  people = new PeopleLayer(scene, assets.people, graph);
  G.assets = { bus: !!assets.bus, person: !!assets.person, peopleModels: assets.people.length, crowdFromGlb: people.fromGlb };
  // הקופה והשעון נשמרים; האוטובוסים שהיו בדרך — לא (הקווים מתחילים מחדש מהמסוף)
  const saved = Bank.load();
  const t0 = typeof saved?.time === 'number' && saved.time > 0 ? saved.time : 6.5 * 3600;
  bank = new Bank(saved, t0);
  bank.onDay = d => { showDaySummary(d); career?.newDay(d.day + 1); };
  demand = new Demand(dj, city.stops);
  sim = new Sim(city.stops, bank, t0, demand);
  dlayer = new DemandLayer(scene, demand.zones, city.stops, city.buildings, city.meta.half); dlayer.resize(innerWidth, innerHeight);
  dlayer.obstacles = () => ['.bar', '#dLegend', '#dlFocus', '#panel'].map(q => $(q)).filter(e => e && !e.hidden).map(e => e.getBoundingClientRect()).filter(r => r.width);
  buildStops();
  cams = new CameraModes(camera, controls, { pickBus, busObject: b => buses.objectOf(b), toast });
  buildCamButtons();
  lineDefs = loadLines();
  // קווים שנשמרו לפני שהיה כסף במשחק: מקבלים אוטובוסים רגילים במתנה, כמה שצריך לתדירות שלהם
  // וקווים שנשמרו לפני שהיו שעות פעילות: 05:00–24:00
  let gift = 0, hrs = 0;
  for (const d of lineDefs) {
    if (!Array.isArray(d.hours)) { d.hours = [...DEFAULT_HOURS]; hrs++; }
    const L = addLine(d, false);
    if (L && d.fleet == null) { d.vtype = 'std'; d.fleet = vehiclesNeeded(L); gift += d.fleet; }
  }
  if (gift || hrs) saveLines(lineDefs);
  if (bank.migrated) setTimeout(() => toast(`המחירים השתנו: רכבים זולים יותר, ויש סבסוד לכל ק"מ. הקופה הותאמה: ${money(bank.money)}`), 600);
  else if (gift) setTimeout(() => toast(`הקווים שכבר בניתם קיבלו ${gift} אוטובוסים רגילים במתנה`), 600);
  else if (hrs) setTimeout(() => toast('לקווים שלכם נקבעו שעות פעילות 05:00–24:00. משנים ב"רכבים ותדירות"'), 600);
  // מצבי משחק ושלבים (career.js). שמירה ישנה — קריירה, והשלבים שכבר מתקיימים מושלמים בשקט; התחנות של הקווים הקיימים "שולמו"
  coverage = new Coverage(demand, city);
  covLayer = new CoverageLayer(scene, city.meta.half);
  career = new Career({ bank, sim, lines: () => lines, coverage, served: servedStops, toast, onDone: stageDone, onMiss: stageMissed });
  if (bank.mode === 'career' && !bank.career) {
    bank.career = newCareer();
    career.payStops(lineDefs.flatMap(d => d.stopIds));
    if (bank.legacy) career.tick(true);
  }
  if (!saved && !lineDefs.length) setTimeout(() => askMode(true), 400);
  night = new NightFast(sim, () => lines, { setSpeed, toast, busy: () => !!planning || !$('#lineForm').hidden });
  bindUI(); renderLines(); renderMoney();
  setInterval(() => bank.save(sim.time), 4000);
  addEventListener('pagehide', () => bank.save(sim.time));
  document.addEventListener('visibilitychange', () => { if (document.hidden) bank.save(sim.time); else refreshGraphics('visible'); });
  Object.assign(G, { city, graph, sim, bank, people, lines: () => lines, stopsById, cams, planTap: id => tapStop(stopsById.get(id)), removeLine, startReverse, renderDispatch, renderOps, career: () => career, coverage: () => coverage, renderMissions, setCoverView, askMode, saveSlot, loadSlot, readSlots, resetGame, reverseStops, stopScreen, busScreen, startPlanning, finishPlanning, saveForm: saveLineFromForm, editLine: openEdit, TYPES,
    night, demand, dlayer, net: sim.net, editRoute, routeAction, saveRoute: () => finishPlanning(), cancelPlanning, setDemandView, renderDemand, showTab, planning: () => planning });
  $('#loading').classList.add('gone');
  G.ready = true;
}

// ---------- תחנות: הסככה, העמוד והשלטים (js/stops.js), וסיכה (שגדלה כשמתרחקים, כדי שיהיה קל להקיש)
let pins, stopView, pinBase = [];
const PIN_COL = new THREE.Color(0x0ea5e9), PIN_SEL = new THREE.Color(0xf59e0b), PIN_ON = new THREE.Color(0x0369a1), PIN_USED = new THREE.Color(0x38bdf8);
function buildStops() {
  const n = city.stops.length;
  stopView = new StopLayer(scene, city.stops, s => people.stopFrame(s));
  const pinGeo = new THREE.SphereGeometry(1, 14, 10);
  pins = new THREE.InstancedMesh(pinGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  pins.name = 'stop-pins'; pins.renderOrder = 5;
  city.stops.forEach((s, i) => {
    const f = people.stopFrame(s);
    const p = new THREE.Vector3(f.px, 0.12, -f.py);
    s.world = p; pinBase[i] = p;
    pins.setColorAt(i, PIN_COL);
  });
  scene.add(pins);
  G.stopView = stopView;
}
function stopIndex(s) { return city.stops.indexOf(s); }
function updatePins() {
  const d = camera.position.distanceTo(controls.target);
  const k = THREE.MathUtils.clamp(d / 220, planning ? 0.5 : 0.2, 7) * (planning ? 1.35 : 1);
  const used = new Set(); for (const L of lines) if (L.visible) for (const s of L.stops) used.add(s);
  const sel = new Set(planning ? planning.stops : []), cur = planning?.selStop;
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  city.stops.forEach((s, i) => {
    v.copy(pinBase[i]); v.y = 4.3 + k * 1.6;
    const r = (s === cur ? 1.6 : sel.has(s) || s === selectedStop ? 1.25 : 1) * k * 0.9;
    m.makeScale(r, r, r).setPosition(v); pins.setMatrixAt(i, m);
    pins.setColorAt(i, s === cur ? PIN_ON : sel.has(s) ? PIN_SEL : s === selectedStop ? PIN_ON : used.has(s) ? PIN_USED : PIN_COL);
  });
  pins.instanceMatrix.needsUpdate = true; pins.instanceColor.needsUpdate = true;
}
function stopScreen(id) {
  const s = stopsById.get(id); const i = stopIndex(s);
  const m = new THREE.Matrix4(); pins.getMatrixAt(i, m);
  const v = new THREE.Vector3().setFromMatrixPosition(m).project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, vis: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
}
function busScreen() {
  const b = pickBus(); if (!b) return null; const o = buses.objectOf(b); if (!o) return null;
  const v = o.position.clone().project(camera), r = canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}
function pickStop(cx, cy) {
  const r = canvas.getBoundingClientRect(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  let best = null, bd = isTouch ? 30 : 22;
  city.stops.forEach((s, i) => {
    pins.getMatrixAt(i, m); v.setFromMatrixPosition(m).project(camera);
    if (v.z > 1) return;
    const x = r.left + (v.x + 1) / 2 * r.width, y = r.top + (1 - v.y) / 2 * r.height;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bd) { bd = d; best = s; }
  });
  return best;
}

// ---------- הקשה על המפה (להבדיל מגרירה)
let down = null;
canvas.addEventListener('pointerdown', e => { if (e.isPrimary) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved > 8 || dt > 600) return;
  if (dview.on && !planning) {        // במפת הביקוש: הקשה על שכונה מציגה לאן נוסעים ממנה; הקשה במקום ריק מחזירה לכל העיר
    const z = pickZone(e.clientX, e.clientY);
    if (z != null || dview.focus != null) { dview.tapT = performance.now(); focusZone(z === dview.focus ? null : z); return; }
  }
  const s = pickStop(e.clientX, e.clientY);
  if (s) tapStop(s);
});
function pickZone(cx, cy) { return dlayer.pick(cx, cy, camera, canvas.getBoundingClientRect(), isTouch ? 30 : 22); }
function tapStop(s) {
  if (!s) return;
  if (planning) return planAdd(s);
  selectedStop = s; showTab('stop'); renderStop(); openPanel();
}

// ---------- תכנון קו
function startPlanning() {
  if (planning) return;
  planning = { stops: [], color: COLORS[lineDefs.length % COLORS.length], group: null };
  selectedStop = null;
  $('#planTxt').innerHTML = 'הקישו על תחנות לפי הסדר <span id="planCount" class="pill">0 תחנות</span>';
  $('#planDone').textContent = 'המשך'; $('#planUndo').hidden = false; $('#planInfo').hidden = true; $('#planSel').hidden = true;
  $('#plan').hidden = false; $('#planErr').hidden = true; updatePlan();
  document.body.classList.add('planning');
  if (innerWidth <= 820) $('#panel').classList.add('min');
}
// ---------- הכיוון ההפוך של קו: תחנות GTFS הן לכיוון נסיעה אחד, אז לכל תחנה מחפשים את התחנה שמולה —
// הקרובה ביותר (עד 150 מ') שהאוטובוס עובר בה בכיוון ההפוך. תחנה בלי תחנה מולה — מדלגים עליה, חוץ מהמסוף
// (אז נשארת אותה תחנה). קטע שאין אליו דרך (פרסה) — מורידים את התחנה שבאמצע
function oppositeStop(s) {
  const f = people.stopFrame(s); let best = null, bd = 150;
  for (const c of city.stops) {
    if (c === s) continue;
    const g = people.stopFrame(c), d = Math.hypot(c.x - s.x, c.y - s.y);
    if (d < bd && f.tx * g.tx + f.ty * g.ty < -0.5) { bd = d; best = c; }
  }
  return best;
}
function reverseStops(L) {
  const src = [...L.stops].reverse(), n = src.length;
  let out = [];
  src.forEach((s, i) => { const c = oppositeStop(s) || ((i === 0 || i === n - 1) ? s : null); if (c && out[out.length - 1] !== c) out.push(c); });
  for (let guard = 0; out.length >= 2 && guard < 40; guard++) {
    const r = computeRoute(graph, out); if (r.error === undefined) return out;
    const k = r.error;
    out.splice(k < out.length - 1 ? k : k - 1 > 0 ? k - 1 : k, 1);
  }
  return out.length >= 2 && computeRoute(graph, out).error === undefined ? out : null;
}
// פותח תכנון של הקו בכיוון ההפוך, כבר עם התחנות, כדי שהשחקן יראה את המסלול לפני שהוא מאשר.
// "המשך" פותח את טופס הקו עם אותו מספר, השם הפוך, ואותם שעות, תדירות, סוג רכב וקנייה/ליסינג
function startReverse(L) {
  if (planning || !L) return;
  const stops = reverseStops(L);
  if (!stops) { toast('לא מצאתי מסלול בכיוון ההפוך — אפשר לתכנן אותו ידנית'); return; }
  startPlanning();
  planning.stops = stops; planning.color = L.color; planning.rev = L;
  $('#planTxt').innerHTML = `<b>קו ${esc(L.def.number)} — הכיוון ההפוך</b>. אפשר להוסיף תחנות או לבטל את האחרונה <span id="planCount" class="pill"></span>`;
  drawPlan(computeRoute(graph, stops)); updatePlan();
  const pts = stops.map(s => s.world); if (pts.length) fitPoints(pts.map(p => [p.x, -p.z]));
  return stops;
}
const NO_ROUTE = 'אין דרך להגיע לתחנה הזו בלי פרסה באמצע הרחוב — אוטובוס מסתובב רק בכיכר או בצומת גדולה. נסו תחנה בצד השני של הרחוב או תחנה אחרת.';
function planAdd(s) {
  if (planning.edit) return routeTap(s);
  const P = planning.stops;
  if (P[P.length - 1] === s) return;
  P.push(s);
  const r = computeRoute(graph, P);
  if (r.error !== undefined) {
    P.pop(); planError(NO_ROUTE);
    return;
  }
  $('#planErr').hidden = true;
  drawPlan(r); updatePlan();
}
function drawPlan(r) {
  if (planning.group) scene.remove(planning.group);
  planning.group = null;
  if (r && planning.stops.length) {
    planning.group = routeMesh(r.poly, planning.color, planning.stops.map(s => [s.world.x, -s.world.z]), planning.stops.indexOf(planning.selStop));
    scene.add(planning.group);
  }
}
function planError(t) { const e = $('#planErr'); e.hidden = false; e.textContent = t; }
function updatePlan() {
  const n = planning.stops.length;
  if (planning.edit) return updateRouteEdit();
  $('#planCount').textContent = n === 1 ? 'תחנה אחת' : `${n} תחנות`;
  $('#planDone').disabled = n < 2;
}
function cancelPlanning() {
  if (!planning) return;
  if (planning.group) scene.remove(planning.group);
  if (planning.edit) { const g = lineGroups.get(planning.edit.id); if (g) g.visible = planning.edit.visible; }
  planning = null; form = null; $('#plan').hidden = true; $('#lineForm').hidden = true;
  document.body.classList.remove('planning');
}

// ---------- עריכת מסלול של קו קיים: הסרה, הוספה (במקום הכי קצר) והזזה של תחנות; שמירה בונה את הקו מחדש באותו מקום
function editRoute(L) {
  if (planning || !L) return;
  planning = { stops: [...L.stops], color: L.color, group: null, edit: L, selStop: null, segs: new Map() };
  selectedStop = null;
  const g = lineGroups.get(L.id); if (g) g.visible = false;
  $('#planTxt').innerHTML = `<b>מסלול קו ${esc(L.def.number)}</b> — הקישו על תחנה בקו (הסרה או הזזה) או על תחנה חדשה (הוספה)`;
  $('#planDone').textContent = 'שמירה'; $('#planUndo').hidden = true;
  $('#plan').hidden = false; $('#planErr').hidden = true; $('#planInfo').hidden = false;
  document.body.classList.add('planning');
  if (innerWidth <= 820) $('#panel').classList.add('min');
  drawPlan(computeRoute(graph, planning.stops)); updatePlan();
}
// אורך מסלול בין שתי תחנות (במטמון — ההוספה בודקת כל מקום אפשרי)
function segLen(a, b) {
  const key = a.id + '>' + b.id, M = planning.segs;
  if (M.has(key)) return M.get(key);
  const r = graph.route(a, b); let len = Infinity;
  if (r) { len = 0; for (let i = 1; i < r.length; i++) len += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); }
  M.set(key, len); return len;
}
function tryStops(next) {
  const r = computeRoute(graph, next);
  if (r.error !== undefined) { planError(NO_ROUTE); return false; }
  $('#planErr').hidden = true;
  planning.stops = next; drawPlan(r); updatePlan(); return true;
}
function routeTap(s) {
  const P = planning.stops;
  if (P.includes(s)) { planning.selStop = planning.selStop === s ? null : s; $('#planErr').hidden = true; drawPlan(computeRoute(graph, P)); updatePlan(); return; }
  // תחנה חדשה: המקום שמוסיף הכי מעט אורך (גם לפני הראשונה או אחרי האחרונה)
  let best = -1, bd = Infinity;
  for (let i = 0; i <= P.length; i++) {
    const a = P[i - 1], b = P[i];
    const add = (a ? segLen(a, s) : 0) + (b ? segLen(s, b) : 0) - (a && b ? segLen(a, b) : 0);
    if (add < bd) { bd = add; best = i; }
  }
  if (best < 0 || !isFinite(bd)) { planError(NO_ROUTE); return; }
  const next = [...P.slice(0, best), s, ...P.slice(best)];
  planning.selStop = s;
  if (tryStops(next)) toast(`נוספה כתחנה ${best + 1}`); else planning.selStop = null;
}
// a: 'del' | 'up' (מקום מוקדם יותר) | 'down'
function routeAction(a, sid) {
  if (!planning?.edit) return;
  const s = sid ? stopsById.get(sid) : planning.selStop, P = planning.stops, i = P.indexOf(s);
  if (i < 0) return;
  if (a === 'del') {
    if (P.length <= 2) { planError('בקו צריכות להיות לפחות 2 תחנות.'); return; }
    planning.selStop = null;
    if (!tryStops(P.filter((_, k) => k !== i))) planning.selStop = s;
  } else {
    const j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= P.length) return;
    const next = [...P]; [next[i], next[j]] = [next[j], next[i]];
    tryStops(next);
  }
}
function updateRouteEdit() {
  const L = planning.edit, P = planning.stops, r = computeRoute(graph, P);
  const tmp = { poly: r.poly, stops: P, profile: speedProfile(r.poly, r.stopS), def: { headway: L.def.headway } };
  const need = vehiclesNeeded(tmp), have = L.def.fleet || 0, cyc = Math.round(lineCycle(tmp).total / 60);
  const km = (r.poly.length / 1000).toFixed(1), was = (L.poly.length / 1000).toFixed(1);
  $('#planInfo').innerHTML = `${P.length} תחנות · ${km} ק"מ${km !== was ? ` <span class="lmeta">(היה ${was})</span>` : ''} · סיבוב ${cyc} דק' · ` +
    (need > have ? `<b class="bad">צריך ${need} רכבים, יש ${have}</b>` : `<span class="good">${have} רכבים מספיקים</span>`);
  const sel = $('#planSel'), s = planning.selStop, i = P.indexOf(s);
  sel.hidden = i < 0;
  if (i >= 0) sel.innerHTML = `<span class="sname"><b>${i + 1}.</b> ${esc(s.name)}</span>
    <button data-r="del" class="del">הסרה מהקו</button>${i > 0 ? `<button data-r="up">למקום ${i}</button>` : ''}${i < P.length - 1 ? `<button data-r="down">למקום ${i + 2}</button>` : ''}`;
  const same = P.length === L.stops.length && P.every((x, k) => x === L.stops[k]);
  $('#planDone').disabled = same;
}
function saveRouteEdit() {
  const old = planning.edit, P = planning.stops;
  if (P.length < 2 || computeRoute(graph, P).error !== undefined) return;
  // קריירה: תחנות שנוספו ועוד לא שירתו אף קו — ₪500 כל אחת
  const sf = career.stopFee(P.map(s => s.id));
  if (sf.fee && bank.money < sf.fee) { planError(`אין מספיק כסף ל-${sf.n} התחנות החדשות (${money(sf.fee)}).`); return; }
  if (sf.fee) { bank.spend('buy', sf.fee); career.payStops(sf.ids); toast(`${sf.n} תחנות חדשות: ${money(sf.fee)}`); }
  if (planning.group) scene.remove(planning.group);
  planning = null; $('#plan').hidden = true; document.body.classList.remove('planning');
  const d = old.def; d.stopIds = P.map(s => s.id);
  const neo = new Line(d, graph, stopsById);
  if (neo.error !== undefined) { d.stopIds = old.stops.map(s => s.id); return; }
  sim.retire(old, neo);
  lines[lines.indexOf(old)] = neo;
  scene.remove(lineGroups.get(d.id));
  const g = routeMesh(neo.poly, d.color, neo.stops.map(s => [s.world.x, -s.world.z])); g.visible = neo.visible;
  lineGroups.set(d.id, g); scene.add(g);
  if (selectedLine === old) selectedLine = neo;
  saveLines(lineDefs); renderLines(); openPanel(); showTab('lines');
  const busy = old.buses.length;
  toast(`המסלול של קו ${d.number} עודכן${busy ? ' — האוטובוסים שבדרך מסיימים את המסלול הקודם' : ''}`);
  return neo;
}
function finishPlanning() {
  if (planning?.edit) return saveRouteEdit();
  if (!planning || planning.stops.length < 2) return;
  const used = new Set(lineDefs.map(d => d.number));
  let num = 1; while (used.has(String(num))) num++;
  $('#fNum').value = num;
  const a = planning.stops[0].name, b = planning.stops[planning.stops.length - 1].name;
  $('#fName').value = `${a} — ${b}`.slice(0, 40);
  $('#fHead').value = '10'; setHoursForm(DEFAULT_HOURS);
  const R = planning.rev?.def;
  if (R) {      // הכיוון ההפוך: אותו מספר, השם הפוך, ואותם שעות ותדירות
    $('#fNum').value = R.number;
    const parts = (R.name || '').split(' — ');
    if (parts.length === 2) $('#fName').value = `${parts[1]} — ${parts[0]}`.slice(0, 40);
    if ([...$('#fHead').options].some(o => +o.value === R.headway)) $('#fHead').value = String(R.headway);
    setHoursForm(hoursOf(R));
  }
  renderSwatches(planning.color);
  // קו זמני רק כדי לחשב זמן סיבוב וכמה רכבים צריך
  const r = computeRoute(graph, planning.stops);
  const tmp = { poly: r.poly, stops: planning.stops, profile: speedProfile(r.poly, r.stopS), def: { headway: 10 } };
  form = { line: null, tmp, type: R ? typeOf(R) : 'std', lease: R ? isLease(R) : false, n: 0, touched: false };
  $('#fTitle').textContent = 'פרטי הקו';
  $('#fSave').textContent = 'שמירה והפעלה';
  $('#fColors').hidden = false;
  $('#fRev').hidden = !!planning.rev;
  renderForm();
  $('#lineForm').hidden = false;
  if (!isTouch) $('#fNum').focus();
}
// ---------- טופס הקו: סוג רכב, כמה רכבים, ומה זה עולה
let form = null;
function formHeadway() { return +$('#fHead').value || 10; }
function formNeed() { return vehiclesNeeded(form.line || form.tmp, formHeadway()); }
function formCost() {
  const d = form.line?.def;
  const c = fleetChange(d && { type: typeOf(d), n: d.fleet || 0, lease: isLease(d) }, { type: form.type, n: form.n, lease: form.lease });
  // קריירה: תחנה שעוד לא שירתה אף קו — ₪500 בפעם הראשונה
  const sf = form.line ? { n: 0, fee: 0, ids: [] } : career.stopFee(form.tmp.stops.map(s => s.id));
  c.fee = sf.fee; c.feeN = sf.n; c.feeIds = sf.ids;
  return c;
}
// ליסינג: אין תשלום מראש, אבל חברה בחובות לא מקבלת רכבים חדשים. במצב יצירתי — אין הגבלה
const formBlocked = ({ buy, sell, added, fee = 0 }) => career.creative ? false : buy + fee > 0 ? bank.money - buy - fee + sell < 0 : added > 0 && bank.money + sell < 0;
function renderForm() {
  const box = $('#fTypes'); box.innerHTML = '';
  for (const id of TYPE_ORDER) {
    const T = TYPES[id];
    const b = document.createElement('button'); b.type = 'button'; b.dataset.type = id;
    b.className = 'vtype' + (id === form.type ? ' on' : ''); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', id === form.type);
    const locked = !career.unlocked(id) && !(form.line && typeOf(form.line.def) === id);
    const at = STAGES.findIndex(S => S.unlock.includes(id));
    b.innerHTML = `<b>${T.name}</b><span>${T.cap} מקומות</span><span class="vp">${locked ? `נפתח אחרי שלב ${at + 1}` : form.lease ? `${money(T.lease)} ליום` : money(T.price)}</span>`;
    if (locked) { b.disabled = true; b.classList.add('locked'); }
    b.onclick = () => { if (locked) return; form.type = id; renderForm(); };
    box.appendChild(b);
  }
  $('#fMode').querySelectorAll('button').forEach(b => { const on = (b.dataset.m === 'lease') === form.lease; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const need = formNeed();
  if (!form.touched && !form.line) form.n = form.lease ? need : Math.max(0, Math.min(need, Math.floor(bank.money / TYPES[form.type].price)));
  $('#fN').textContent = form.n;
  $('#fMinus').disabled = form.n <= 0;
  const T = TYPES[form.type];
  const cyc = Math.round(lineCycle(form.line || form.tmp).total / 60);
  $('#fNeed').innerHTML = form.n >= need ? `מספיק לכל ${formHeadway()} דק'` : `<span class="bad">צריך ${need} לכל ${formHeadway()} דק'</span>`;
  const c = formCost(), { buy, sell, leaseDay, fee } = c, after = bank.money - buy - fee + sell, blocked = formBlocked(c);
  const parts = [];
  if (buy) parts.push(`קנייה <b>${money(buy)}</b>`);
  if (fee) parts.push(`${c.feeN} תחנות חדשות <b>${money(fee)}</b>`);
  if (sell) parts.push(`מכירה <b class="good">+${money(sell)}</b>`);
  if (leaseDay) parts.push(`ליסינג <b>${money(leaseDay)} ליום</b>`);
  parts.push(`בקופה אחרי: <b class="${after < 0 ? 'bad' : ''}">${money(after)}</b>`);
  const err = !blocked ? '' : buy > 0 ? `<div class="bad">אין מספיק כסף. הורידו רכבים, בחרו רכב זול יותר או ליסינג.</div>`
    : `<div class="bad">החברה בחובות — אי אפשר לקחת עוד רכבים.</div>`;
  const zero = form.n === 0 ? `<div class="bad">בלי רכבים הקו לא יפעל.</div>` : '';
  const [ha, hb] = formHours(), badH = hb <= ha;
  const hrs = badH ? `<div class="bad">שעת הסיום צריכה להיות אחרי שעת ההתחלה.</div>` : '';
  $('#fCost').innerHTML = `<div>${parts.join(' · ')}</div>
    <div class="fsub">סיבוב (הלוך, חזרה ריקה והפסקה) בערך ${cyc} דק'. ${T.cap * form.n ? `נסיעה: ₪${T.km} לק"מ ו-₪${T.hour} לשעת נהג. סבסוד: ₪${SUBSIDY_KM} לכל ק"מ בקו.` : ''}</div>${err}${zero}${hrs}`;
  $('#fSave').disabled = $('#fRev').disabled = blocked || badH;
}
// עריכת קו קיים: תדירות, סוג רכב וכמה רכבים (המסלול נשאר)
function openEdit(L) {
  if (planning) return;
  form = { line: L, type: typeOf(L.def), lease: isLease(L.def), n: L.def.fleet || 0, touched: true };
  $('#fNum').value = L.def.number; $('#fName').value = L.def.name || ''; $('#fHead').value = String(L.def.headway); setHoursForm(hoursOf(L.def));
  $('#fTitle').textContent = `קו ${L.def.number}: רכבים ותדירות`;
  $('#fSave').textContent = 'שמירה';
  $('#fColors').hidden = true; $('#fRev').hidden = true;
  renderForm();
  $('#lineForm').hidden = false;
}
// שעות פעילות: כל חצי שעה. הסיום אחרי ההתחלה (בלי קווי לילה שעוברים את חצות)
const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
// טווח שעות משמאל לימין גם בתוך משפט בעברית (בלי זה הדפדפן הופך את הסדר: 24:00–05:00)
const span = (a, b) => `\u2066${hm(a)}–${hm(b)}\u2069`;
function setHoursForm([a, b]) {
  const opt = (from, to, v) => { let h = ''; for (let m = from; m <= to; m += 30) h += `<option value="${m}"${m === v ? ' selected' : ''}>${hm(m)}</option>`; return h; };
  $('#fFrom').innerHTML = opt(0, 1410, a); $('#fTo').innerHTML = opt(30, 1440, b);
}
const formHours = () => [+$('#fFrom').value, +$('#fTo').value];
function renderSwatches(cur) {
  const box = $('#fColors'); box.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'צבע ' + c);
    b.className = c === cur ? 'on' : ''; b.onclick = () => { planning.color = c; renderSwatches(c); drawPlan(computeRoute(graph, planning.stops)); };
    box.appendChild(b);
  }
}
// o (לבדיקות): { vtype, fleet, headway } במקום מה שבטופס
function saveLineFromForm(o = {}) {
  if (!form) return;
  if (o.vtype) form.type = o.vtype;
  if (o.lease != null) form.lease = !!o.lease;
  if (o.fleet != null) form.n = o.fleet;
  if (o.headway) $('#fHead').value = String(o.headway);
  if (o.hours) setHoursForm(o.hours);
  const hours = formHours();
  const cost = formCost(), { buy, sell, fee } = cost;
  if (formBlocked(cost)) { toast('אין מספיק כסף'); return; }
  if (fee) { bank.spend('buy', fee); }
  career.payStops(cost.feeIds || []);
  if (hours[1] <= hours[0]) { toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה'); return; }
  const number = ($('#fNum').value || '1').trim().slice(0, 4), name = ($('#fName').value || '').trim().slice(0, 40);
  if (buy) bank.spend('buy', buy);
  if (sell) bank.refund(sell);
  if (form.line) {
    const L = form.line, d = L.def, hw = formHeadway();
    if (typeOf(d) !== form.type || isLease(d) !== form.lease) L.returning = [];      // הרכבים הישנים נמכרו / הוחזרו
    d.number = number; d.name = name; d.vtype = form.type; d.fleet = form.n; d.hours = hours;
    if (form.lease) d.lease = true; else delete d.lease;
    sim.net.invalidate();
    if (hw !== d.headway) {
      d.headway = hw;
      const last = L.dispatches[L.dispatches.length - 1];
      L.nextDispatch = last != null ? Math.max(sim.time, Math.min(L.nextDispatch, last + hw * 60)) : sim.time;
    }
    form = null; $('#lineForm').hidden = true;
    saveLines(lineDefs); bank.save(sim.time);
    renderLines(); renderMoney();
    toast(`קו ${d.number}: ${d.fleet} × ${TYPES[d.vtype].name}${d.lease ? ' בליסינג' : ''}, כל ${d.headway} דק', ${span(hours[0], hours[1])}`);
    return L;
  }
  const def = {
    id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), number, name, color: planning.color,
    headway: formHeadway(), stopIds: planning.stops.map(s => s.id), vtype: form.type, fleet: form.n, hours,
  };
  if (form.lease) def.lease = true;
  cancelPlanning();
  lineDefs.push(def); saveLines(lineDefs); bank.save(sim.time);
  const L = addLine(def, true);
  selectedLine = L; renderLines(); renderMoney(); showTab('lines'); openPanel();
  toast(def.fleet ? `קו ${def.number} יצא לדרך — ${def.fleet} × ${TYPES[def.vtype].name}${def.lease ? ' בליסינג' : ''}, כל ${def.headway} דק'` : `קו ${def.number} נשמר בלי רכבים — הוסיפו רכבים כדי שיפעל`);
  return L;
}

function addLine(def, fresh) {
  const L = new Line(def, graph, stopsById);
  if (L.error !== undefined) { console.warn('line route failed', def); return null; }
  sim.addLine(L); lines.push(L);
  const g = routeMesh(L.poly, def.color, L.stops.map(s => [s.world.x, -s.world.z]));
  if (dview.on) g.children.forEach(c => { if (c.isSprite) c.visible = false; });
  lineGroups.set(def.id, g); scene.add(g);
  return L;
}
function removeLine(L, refund = true) {
  const got = refund ? fleetValue(L.def) : 0;
  if (got) { bank.refund(got); bank.save(sim.time); toast(`קו ${L.def.number} נמחק. ${L.def.fleet} הרכבים שלו נמכרו ב-${money(got)}`); }
  else if (refund && L.def.fleet && isLease(L.def)) toast(`קו ${L.def.number} נמחק. ${L.def.fleet} הרכבים בליסינג הוחזרו`);
  sim.removeLine(L); lines = lines.filter(x => x !== L);
  for (const K of sim.lines) if (K.retired && sim.current(K) === L) K.buses = [];
  scene.remove(lineGroups.get(L.id)); lineGroups.delete(L.id);
  lineDefs = lineDefs.filter(d => d.id !== L.id); saveLines(lineDefs);
  L.buses = [];
  if (selectedLine === L) selectedLine = null;
  renderLines(); renderMoney();
}

function pickBus(after) {
  const all = lines.flatMap(L => L.buses.filter(b => b.state === 'drive' || b.state === 'dwell'));
  const pref = selectedLine ? all.filter(b => b.line === selectedLine) : [];
  const list = pref.length ? pref : all;
  if (!list.length) return null;
  const i = after ? list.indexOf(after) : -1;
  return list[(i + 1) % list.length];
}

// ---------- ממשק
function bindUI() {
  $('#newLine').onclick = startPlanning;
  $('#planUndo').onclick = () => { if (!planning) return; planning.stops.pop(); drawPlan(planning.stops.length ? computeRoute(graph, planning.stops) : null); updatePlan(); };
  $('#planCancel').onclick = cancelPlanning;
  $('#planDone').onclick = finishPlanning;
  $('#planSel').onclick = e => { const a = e.target.closest('button')?.dataset.r; if (a) routeAction(a); };
  $('#dlClose').onclick = () => setDemandView(false);
  $('#dlChips').onclick = e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.h === 'now') dview.now = true; else { dview.now = false; dview.hour = +b.dataset.h; }
    refreshDemandView(true); };
  $('#dlHour').oninput = e => { dview.now = false; dview.hour = +e.target.value; refreshDemandView(true); };
  // הלחיצה ה"מדומה" שאחרי מגע במפה עלולה ליפול על הכרטיס שהופיע עכשיו באותו מקום — מתעלמים ממנה
  $('#dlFocus').addEventListener('click', e => {
    if (performance.now() - (dview.tapT || 0) < 450) return;
    const d = e.target.closest('[data-dir]'); if (d) { dview.dir = d.dataset.dir; dview.dirUser = true; dview.fit = true; refreshDemandView(true); return; }
    const z = e.target.closest('[data-zone]');
    if (z) { focusZone(z.dataset.zone === '' ? null : +z.dataset.zone); }
  });
  $('#demandBody').onclick = e => { if (e.target.closest('#dShow')) setDemandView(!dview.on, null, true); };
  $('#fBack').onclick = () => { $('#lineForm').hidden = true; if (form?.line) form = null; };
  $('#fMode').onclick = e => { const m = e.target.closest('button')?.dataset.m; if (!m || !form) return; form.lease = m === 'lease'; renderForm(); };
  $('#fMinus').onclick = () => { form.n = Math.max(0, form.n - 1); form.touched = true; renderForm(); };
  $('#fPlus').onclick = () => { form.n = Math.min(40, form.n + 1); form.touched = true; renderForm(); };
  $('#fHead').onchange = () => { if (form) renderForm(); };
  $('#fFrom').onchange = $('#fTo').onchange = () => { if (form) renderForm(); };
  $('#money').onclick = () => { showTab('money'); openPanel(); };
  $('#dayClose').onclick = () => { $('#daySum').hidden = true; };
  $('#stopPane').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeLook(selectedStop); });
  canvas.addEventListener('pointerdown', () => { camAnim = null; });
  canvas.addEventListener('wheel', () => { camAnim = null; }, { passive: true });
  bindReset();
  $('#lineFormCard').onsubmit = e => { e.preventDefault(); saveLineFromForm(); };
  // קו חדש: שומרים אותו, ומיד פותחים את הכיוון ההפוך לבדיקה (רק כשהשחקן מבקש)
  $('#fRev').onclick = () => { const L = saveLineFromForm(); if (L && startReverse(L)) toast(`קו ${L.def.number} יצא לדרך. עכשיו הכיוון ההפוך: בדקו את המסלול ולחצו "המשך"`); };
  $('#play').onclick = () => { night.manual(); setSpeed(sim.speed ? 0 : (G.lastSpeed || 5)); };
  document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => { night.manual(); setSpeed(+b.dataset.s); });
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('#grip').onclick = () => $('#panel').classList.toggle('min');
  $('#creditsBtn').onclick = () => { $('#credits').hidden = false; };
  $('#creditsClose').onclick = () => { $('#credits').hidden = true; };
  addEventListener('keydown', e => {
    if (e.target.closest('input,select')) return;
    if (e.code === 'Space') { e.preventDefault(); $('#play').click(); }
    if (e.key === 'Escape') cancelPlanning();
  });
  if (params.has('fps')) $('#fps').hidden = false;
}
function setSpeed(s, auto = false) {
  if (s && !auto) G.lastSpeed = s;
  sim.speed = s;
  $('#play').textContent = s ? '❚❚' : '▶';
  document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.s === s));
}
function showTab(t) {
  if (t === 'money') renderMoney();
  if (t === 'demand') renderDemand();
  if (t === 'missions') renderMissions();
  if (t === 'dispatch') renderDispatch(true);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t));
}
function openPanel() { $('#panel').classList.remove('min'); }
function buildCamButtons() {
  const box = $('#cams'); box.innerHTML = '';
  for (const [id, m] of Object.entries(cams.modes)) {
    const b = document.createElement('button'); b.dataset.cam = id; b.textContent = m.label;
    if (!m.ready) { b.className = 'soon'; b.title = m.soon; b.onclick = () => toast(m.soon); }
    else b.onclick = () => { if (id === 'follow' && cams.current === 'follow') cams.modes.follow.next(); else cams.set(id); };
    box.appendChild(b);
  }
  const sync = id => box.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', b.dataset.cam === id);
    if (b.dataset.cam === 'follow') b.textContent = id === 'follow' ? 'אוטובוס הבא ›' : cams.modes.follow.label;
  });
  const dm = document.createElement('button'); dm.id = 'demandBtn'; dm.className = 'dm'; dm.textContent = 'ביקוש';
  dm.title = 'מאיפה לאן רוצים לנסוע'; dm.onclick = () => setDemandView(!dview.on, null, true);
  box.prepend(dm);
  const cv = document.createElement('button'); cv.id = 'coverBtn'; cv.className = 'dm cv'; cv.textContent = 'כיסוי';
  cv.title = `מה שבטווח ${COVER_M} מ' הליכה מתחנה עם קו`; cv.onclick = () => setCoverView(!covLayer.visible);
  dm.after(cv);
  cams.onChange(sync); sync('free');
}

const fmtMin = s => s < 60 ? `${Math.round(s)} שנ'` : `${(s / 60).toFixed(1)} דק'`;
const fmtHw = s => s < 90 ? `${Math.round(s)} שנ'` : `${Math.round(s / 60)} דק'`;
const num = n => Math.round(n).toLocaleString('en-US');
function renderLines() {
  const box = $('#lineList'); box.innerHTML = '';
  $('#emptyLines').hidden = lines.length > 0;
  for (const L of lines) {
    const T = TYPES[typeOf(L.def)];
    const c = document.createElement('div'); c.className = 'lcard' + (L === selectedLine ? ' sel' : ''); c.dataset.line = L.id;
    c.innerHTML = `<div class="lhead"><span class="num" style="background:${L.color}">${esc(L.def.number)}</span>
      <div style="flex:1;min-width:0"><div class="lname">${esc(L.def.name || 'קו ' + L.def.number)}</div>
      <div class="lmeta">${L.stops.length} תחנות · ${(L.poly.length / 1000).toFixed(1)} ק"מ</div></div></div>
      <div class="fleet"><div><b>${L.def.fleet || 0} × ${T.name}</b> <span class="lmeta">${T.cap} מקומות${isLease(L.def) ? ' · ליסינג' : ''}</span></div><div data-k="need" class="lmeta"></div></div>
      <div class="hw" data-k="hw"></div>
      <div class="dchart" data-k="chart"></div>
      <div class="stats">
        <div class="stat"><b data-k="board">0</b><span>עלו היום</span></div>
        <div class="stat"><b data-k="onboard">0</b><span>באוטובוסים</span></div>
        <div class="stat"><b data-k="waiting">0</b><span>ממתינים</span></div>
        <div class="stat" data-w="left"><b data-k="left">0</b><span>נשארו (מלא)</span></div>
        <div class="stat" data-w="gaveUp"><b data-k="gaveUp">0</b><span>ויתרו והלכו</span></div>
        <div class="stat"><b data-k="wait">—</b><span>המתנה ממוצעת</span></div>
        <div class="stat"><b data-k="load">—</b><span>תפוסה ממוצעת</span></div>
        <div class="stat"><b data-k="sat">—</b><span>שביעות רצון</span></div>
        <div class="stat"><b data-k="trips">0</b><span>נסיעות היום</span></div>
        <div class="stat"><b data-k="alight">0</b><span>ירדו היום</span></div>
      </div>
      <div class="lmoney" data-k="money"></div>
      <div class="lbtns"><button data-a="edit" class="primary">רכבים ותדירות</button><button data-a="route">מסלול</button><button data-a="rev">כיוון הפוך</button><button data-a="follow">מעקב</button><button data-a="vis">${L.visible ? 'הסתרה' : 'הצגה'}</button><button data-a="del" class="del">מחיקה</button></div>`;
    c.onclick = e => {
      const a = e.target.dataset?.a;
      selectedLine = L;
      if (a === 'edit') return openEdit(L);
      if (a === 'route') return editRoute(L);
      if (a === 'rev') return startReverse(L);
      if (a === 'follow') { cams.modes.follow.bus = pickBus(); cams.current === 'follow' ? cams.modes.follow.enter() : cams.set('follow'); }
      else if (a === 'vis') { L.visible = !L.visible; lineGroups.get(L.id).visible = L.visible; }
      else if (a === 'del') {
        // confirm() חסום בדף מוטמע — אישור בלחיצה שנייה על אותו כפתור
        if (e.target.classList.contains('sure')) return removeLine(L);
        e.target.classList.add('sure'); e.target.textContent = 'בטוח? לחצו שוב';
        setTimeout(() => { if (e.target.isConnected) { e.target.classList.remove('sure'); e.target.textContent = 'מחיקה'; } }, 4000);
        return;
      }
      renderLines();
    };
    box.appendChild(c);
  }
  updateStats();
}
function updateStats() {
  for (const L of lines) {
    const c = document.querySelector(`.lcard[data-line="${L.id}"]`); if (!c) continue;
    const set = (k, v, html) => { const e = c.querySelector(`[data-k="${k}"]`); if (!e) return; if (html) { if (e.innerHTML !== v) e.innerHTML = v; } else if (e.textContent !== String(v)) e.textContent = v; };
    set('board', num(L.stats.board)); set('onboard', L.onboard); set('waiting', L.waiting); set('left', num(L.stats.left));
    set('gaveUp', num(L.stats.gaveUp)); set('trips', L.stats.trips); set('alight', num(L.stats.alight));
    c.querySelector('[data-w="left"]').classList.toggle('warn', L.stats.left > 0);
    c.querySelector('[data-w="gaveUp"]').classList.toggle('warn', L.stats.gaveUp > 0);
    set('wait', L.stats.waitN ? fmtMin(L.avgWait) : '—');
    set('load', L.stats.loadT > 60 ? Math.round(L.avgLoad * 100) + '%' : '—');
    set('sat', L.stats.satN ? Math.round(L.stats.satSum / L.stats.satN) : '—');
    const need = vehiclesNeeded(L), n = L.def.fleet || 0, onRoad = L.buses.filter(b => b.state === 'drive' || b.state === 'dwell').length;
    const free = Math.max(0, n - onRoad - L.returning.length);
    set('need', `בדרך: ${onRoad} · חוזרים: ${L.returning.length} · במסוף: ${free}${n < need ? ` · <span class="bad">צריך ${need}</span>` : ''}`, true);
    const hw = L.def.headway, real = sim.realHeadway(L), [ha, hb] = hoursOf(L.def);
    const hrs = `<span class="lmeta">${span(ha, hb)}</span>${L.off ? ' <span class="offnow">לא פועל עכשיו</span>' : ''}<br>`;
    let t;
    if (!n) t = `<span class="bad">אין רכבים — הקו לא פועל</span>`;
    else if (real == null) t = `מתוכנן כל ${hw} דק'`;
    else {
      const bad = real > hw * 60 * 1.2;
      t = `מתוכנן כל ${hw} דק' · <b class="${bad ? 'bad' : 'good'}">בפועל כל ${fmtHw(real)}</b>${L.short ? ' <span class="lmeta">(מחכה לרכב)</span>' : ''}`;
    }
    set('hw', hrs + t, true);
    set('chart', lineChart(L), true);
    const m = bank.today.byLine[L.id] || { fares: 0, cost: 0 }, sub = m.subsidy || 0, prof = m.fares + sub - m.cost;
    set('money', `היום: כרטיסים ${money(m.fares)} · סבסוד ${money(sub)} · הוצאות ${money(m.cost)} · <b class="${prof < 0 ? 'bad' : 'good'}">${prof < 0 ? 'הפסד' : 'רווח'} ${money(Math.abs(prof))}</b>`, true);
  }
  if (selectedStop && $('[data-pane="stop"]').classList.contains('on')) renderStop();
  if ($('[data-pane="money"]').classList.contains('on')) renderMoney();
  if ($('[data-pane="demand"]').classList.contains('on')) renderDemand();
}
function updateMoneyChip() {
  const e = $('#money'), t = money(bank.money);
  const mb = $('#modeBadge'), mt = career?.creative ? 'יצירתי' : bank.career ? (STAGES[bank.career.stage] ? `שלב ${bank.career.stage + 1}/${STAGES.length}` : 'כל השלבים ✓') : '';
  if (mb && mb.textContent !== mt) mb.textContent = mt;
  if (e.textContent !== t) e.textContent = t;
  e.classList.toggle('neg', bank.money < 0);
}
function dayRows(d) {
  const net = Bank.net(d), op = net + d.buy - d.sell;
  return `<table class="ledger">
    <tr><td>כרטיסים <span class="lmeta">${num(d.pax)} נוסעים × ₪${FARE}</span></td><td class="good">+${money(d.fares)}</td></tr>
    <tr><td>סבסוד ממשלתי לק"מ <span class="lmeta">₪${SUBSIDY_KM} לק"מ בקו</span></td><td class="good">+${money(d.subsidy || 0)}</td></tr>
    <tr><td>דלק, חשמל ותחזוקה</td><td>−${money(d.km)}</td></tr>
    <tr><td>שכר נהגים</td><td>−${money(d.drivers)}</td></tr>
    ${d.lease ? `<tr><td>ליסינג</td><td>−${money(d.lease)}</td></tr>` : ''}
    ${d.insp ? `<tr><td>פקחים</td><td>−${money(d.insp)}</td></tr>` : ''}
    ${d.fineIn ? `<tr><td>קנסות שגבו הפקחים <span class="lmeta">${num(d.caught || 0)} נתפסו</span></td><td class="good">+${money(d.fineIn)}</td></tr>` : ''}
    ${d.evaded ? `<tr><td class="lmeta">נסעו בלי לשלם (הכנסה שלא נכנסה)</td><td class="lmeta">${money(d.evaded)}</td></tr>` : ''}
    ${d.bonus ? `<tr><td>מענקים ובונוסים</td><td class="good">+${money(d.bonus)}</td></tr>` : ''}
    ${d.penalty ? `<tr><td>קנסות מהמשרד ורכב חלופי</td><td>−${money(d.penalty)}</td></tr>` : ''}
    ${d.buy || d.sell ? `<tr class="sub"><td>רווח מהקווים</td><td class="${op < 0 ? 'bad' : 'good'}">${op < 0 ? '−' : '+'}${money(Math.abs(op))}</td></tr>` : ''}
    ${d.buy ? `<tr><td>קניית רכבים</td><td>−${money(d.buy)}</td></tr>` : ''}
    ${d.sell ? `<tr><td>מכירת רכבים</td><td class="good">+${money(d.sell)}</td></tr>` : ''}
    <tr class="tot"><td>סה"כ</td><td class="${net < 0 ? 'bad' : 'good'}">${net < 0 ? '−' : '+'}${money(Math.abs(net))}</td></tr>
  </table>`;
}
function renderMoney() {
  if (!bank) return;
  updateMoneyChip();
  const d = bank.today;
  const fleet = {}, leased = {};
  for (const L of lines) { const t = typeOf(L.def), o = isLease(L.def) ? leased : fleet; o[t] = (o[t] || 0) + (L.def.fleet || 0); }
  const fleetTxt = [...TYPE_ORDER.filter(t => fleet[t]).map(t => `${fleet[t]} × ${TYPES[t].name}`),
    ...TYPE_ORDER.filter(t => leased[t]).map(t => `${leased[t]} × ${TYPES[t].name} בליסינג`)].join(' · ') || 'אין עדיין רכבים';
  const perLine = lines.map(L => {
    const m = d.byLine[L.id] || { fares: 0, cost: 0, pax: 0 }, sub = m.subsidy || 0, p = m.fares + sub - m.cost;
    return `<tr><td><span class="num sm" style="background:${L.color}">${esc(L.def.number)}</span></td><td>${num(m.pax)}</td><td>${money(m.fares)}</td><td>${money(sub)}</td><td>${money(m.cost)}</td><td class="${p < 0 ? 'bad' : 'good'}">${p < 0 ? '−' : ''}${money(Math.abs(p))}</td></tr>`;
  }).join('');
  const prev = bank.history[bank.history.length - 1];
  const html = `<div class="bigmoney ${bank.money < 0 ? 'neg' : ''}"><span>בקופה</span><b>${money(bank.money)}</b>${bank.money < 0 ? '<small>החברה בחובות — אי אפשר לקנות רכבים</small>' : ''}</div>
    <h4>היום · יום ${d.day}</h4>${dayRows(d)}
    ${lines.length ? `<h4>לפי קו, היום <span class="lmeta">(בלי קניית רכבים)</span></h4>
    <table class="perline"><tr><th>קו</th><th>נוסעים</th><th>כרטיסים</th><th>סבסוד</th><th>הוצאות</th><th>רווח</th></tr>${perLine}</table>` : ''}
    <h4>הצי</h4><p class="lmeta big">${fleetTxt}</p>
    <h4>מחירון רכבים</h4>
    <table class="prices"><tr><th>סוג</th><th>מקומות</th><th>קנייה</th><th>ליסינג ליום</th><th>לק"מ</th><th>לשעה</th></tr>
    ${TYPE_ORDER.map(t => { const T = TYPES[t]; return `<tr><td>${T.name}</td><td>${T.cap}</td><td>${money(T.price)}</td><td>${money(T.lease)}</td><td>₪${T.km}</td><td>₪${T.hour}</td></tr>`; }).join('')}</table>
    <p class="hint">כל נוסע משלם ₪${FARE}, והמדינה משלמת ₪${SUBSIDY_KM} על כל ק"מ שאוטובוס נוסע בקו (לא על החזרה הריקה). מכירת רכב קנוי מחזירה ${Math.round(SELL_BACK * 100)}% מהמחיר. רכב בליסינג משלמים עליו כל יום ומחזירים מתי שרוצים, בלי החזר.</p>
    ${prev ? `<h4>אתמול · יום ${prev.day}</h4>${dayRows(prev)}` : ''}`;
  const body = $('#moneyBody');
  if (body.dataset.html === html) return;
  body.dataset.html = html; body.innerHTML = html;
}
// ---------- מצבי משחק, שלבים וכיסוי (career.js)
function activeLines() { return lines.filter(L => !L.retired && L.def.fleet > 0); }
function servedStops() { const set = new Set(); for (const L of activeLines()) for (const s of L.stops) set.add(stopIndex(s)); return set; }
function setCoverView(on) {
  covLayer.visible = on; $('#coverBtn')?.classList.toggle('on', on);
  if (on) { drawCover(); toast(`כחול — עד ${COVER_M} מ' הליכה מתחנה עם קו. נקודות אדומות — תושבים בלי תחנה קרובה`); }
}
function drawCover() {
  const served = servedStops(), key = [...served].sort().join(',');
  coverage.compute(served); covLayer.draw(coverage, [...served].map(i => city.stops[i]), key);
}
const bar = (v, t, done) => `<div class="mbar"><i style="width:${Math.min(100, Math.round(v / (t || 1) * 100))}%" class="${done ? 'ok' : ''}"></i></div>`;
function renderMissions() {
  const box = $('#missionBody'); if (!box) return;
  let html = '';
  if (career.creative) {
    const c = coverage.compute(servedStops());
    html = `<div class="scard"><h3>מצב יצירתי</h3><p class="hint">כסף בלי הגבלה, כל סוגי הרכבים, ואין משימות. אפשר לבנות כל רשת שרוצים. הכלכלה מוצגת רק לידיעה.</p>
      <table><tr><td>תושבים עם תחנה קרובה</td><td>${Math.round(c.res * 100)}%</td></tr><tr><td>מקומות עבודה עם תחנה קרובה</td><td>${Math.round(c.jobs * 100)}%</td></tr></table></div>`;
  } else {
    career.tick();
    const r = career.status(), st = bank.career, day = dayOf(sim.time);
    if (r.finished) html = `<div class="scard"><h3>סיימתם את כל השלבים 🎉</h3><p class="hint">משרד התחבורה מרוצה. אפשר להמשיך לשפר את הרשת, או להתחיל משחק חדש.</p></div>`;
    else {
      const left = st.deadline - day + 1;
      html = `<div class="scard mission"><div class="mhead"><span class="pill">שלב ${r.stage + 1} מתוך ${STAGES.length}${r.S.hard ? ' · קשה' : ''}</span><span class="${left <= 1 ? 'bad' : 'lmeta'}">${left > 0 ? `עוד ${left} ימים` : 'היום האחרון'}</span></div>
        <h3>${esc(r.S.title)}</h3><p class="hint">${esc(r.S.desc)}</p>
        <ul class="checks">${r.items.map(i => `<li class="${i.done ? 'ok' : ''}"><div class="crow"><span>${i.done ? '✓' : '○'} ${esc(i.label)}</span><b>${esc(i.txt)}</b></div>${bar(i.v, i.target, i.done)}</li>`).join('')}</ul>
        <div class="reward">פרס: <b>${money(r.S.reward)}</b>${r.S.unlock.length ? ` · נפתח: ${r.S.unlock.map(t => TYPES[t].name).join(', ')}` : ''}</div>
        ${st.subsidyK < 1 ? `<div class="bad">הסבסוד מצומצם ל-${Math.round(st.subsidyK * 100)}% כי מועד עבר (${st.misses}).</div>` : ''}</div>`;
    }
    html += `<p class="hint">שלבים שהושלמו: ${st.done.length ? st.done.map(d => `${d.stage + 1}. ${esc(STAGES[d.stage].title)}`).join(' · ') : 'עדיין אין'}. תחנה שמתחילה לשרת קו בפעם הראשונה עולה ${money(STOP_FEE)}.</p>`;
  }
  const R = bank.reports || [];
  html += `<h4>דוחות ביקורת</h4>${R.length ? R.slice(0, 8).map(r => `<div class="report"><div class="rhead"><span class="num sm" style="background:${r.color}">${esc(r.line)}</span>
    <span class="lmeta">יום ${r.day}, ${clockText(r.t)}</span><b class="grade ${r.grade >= 85 ? 'good' : r.grade < 60 ? 'bad' : ''}">${r.grade}</b></div>
    <ul>${r.find.map(f => `<li>${esc(f)}</li>`).join('')}</ul>${r.money ? `<div class="${r.money > 0 ? 'good' : 'bad'}">${r.money > 0 ? 'בונוס' : 'קנס'} ${money(Math.abs(r.money))}</div>` : ''}</div>`).join('')
    : `<p class="hint">${career.creative && bank.settings.audits === false ? 'הדוחות כבויים (הגדרות בלשונית "קופה").' : 'מבקרים סמויים של משרד התחבורה נוסעים בקווים בלי להודיע, וכותבים דוח: ניקיון, דיוק, התנהגות הנהג, צפיפות, ועצירה בכל תחנה שמחכים בה. ציון 85 ומעלה — בונוס, מתחת ל-60 — קנס (בקריירה).'}</p>`}`;
  const c = coverage.compute(servedStops());
  html += `<h4>כיסוי לפי שכונה</h4><div class="zcov">${c.zones.filter(z => z.hood && z.pop > 30).sort((a, b) => b.pop - a.pop).map(z => `<div class="zrow"><span>${esc(z.name)}</span>${bar(z.cov, 1, z.cov >= 0.7)}<b>${Math.round(z.cov * 100)}%</b></div>`).join('')}</div>
    <p class="hint">כיסוי: תושבים שיש להם תחנה עם קו עד ${COVER_M} מ' הליכה. רחובות צרים לא חייבים קו. בכפתור "כיסוי" שעל המפה — מה מכוסה ומי עוד לא.</p>`;
  if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
}
function updateMissions() {
  career.tick();
  if ($('[data-pane="missions"]')?.classList.contains('on')) renderMissions();
  if (covLayer.visible) drawCover();
}
function stageDone(S, next) {
  bank.save(sim.time); renderMoney(); renderMissions();
  $('#stageTitle').textContent = `שלב הושלם: ${S.title}`;
  $('#stageBody').innerHTML = `<p class="big">🎉</p><p>משרד התחבורה מאשר. קיבלתם <b>${money(S.reward)}</b>${S.unlock.length ? `, ועכשיו אפשר לקנות ${S.unlock.map(t => TYPES[t].name).join(' ו')}` : ''}.</p>
    ${STAGES[next] ? `<p class="hint">השלב הבא: <b>${esc(STAGES[next].title)}</b> — ${esc(STAGES[next].desc)}</p>` : '<p class="hint">זה היה השלב האחרון. כל הכבוד!</p>'}`;
  $('#stageModal').hidden = false;
}
function stageMissed(S, st) {
  bank.save(sim.time);
  $('#stageTitle').textContent = `המועד עבר: ${S.title}`;
  $('#stageBody').innerHTML = `<p>השלב לא הושלם בזמן, ולכן משרד התחבורה מקצץ בסבסוד: מעכשיו <b>${Math.round(st.subsidyK * 100)}%</b> מהסבסוד לק"מ.</p>
    <p class="hint">המשחק ממשיך — יש עוד ${st.deadline - dayOf(sim.time) + 1} ימים להשלים את השלב. הסבסוד לא יורד מתחת ל-50%.</p>`;
  $('#stageModal').hidden = false;
}
// בחירת מצב: במשחק חדש, ובהתחלה מחדש
let modePick = 'career';
function askMode(fresh) {
  modePick = career?.creative ? 'creative' : 'career'; syncModePick();
  $('#modeAsk').dataset.fresh = fresh ? '1' : ''; $('#modeAsk').hidden = false;
}
function syncModePick() { document.querySelectorAll('[data-mode]').forEach(b => { const on = b.dataset.mode === modePick; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); }
function startMode(mode, save) {
  if (save && !saveSlot()) return;
  resetGame(!!save, mode);
}
// ---------- סדרן: כל קו כרצועה — תחנות כקווים קטנים, אוטובוסים כנקודות לפי האיחור; צפיפות ופערים מסומנים.
// הקשה על אוטובוס בוחרת אותו: החזקה בתחנה, ישר למסוף, רכב חלופי (בתקלה). לכל קו: "אוטובוס נוסף"
let dispSel = null, dispT = 0;
const ICON = { break: '⚠', late: '⏱', jam: '🚦', report: '📋', fixed: '✓', hold: '⏸', express: '⏩', reserve: '🚌' };
function renderDispatch(force) {
  if (!$('[data-pane="dispatch"]')?.classList.contains('on')) return;
  const now = performance.now(); if (!force && now - dispT < 900) return; dispT = now;
  const act = lines.filter(L => !L.retired && L.def.fleet > 0);
  const W = 360, X0 = 12, X1 = W - 12;
  const strips = act.map(L => {
    const len = L.poly.length, x = s => X1 - (X1 - X0) * s / len;          // מימין לשמאל, כמו הקריאה
    const cyc = lineCycle(L), plan = len * L.def.headway * 60 / Math.max(60, cyc.run);
    const bs = L.buses.filter(b => b.state === 'drive' || b.state === 'dwell').sort((a, b) => b.s - a.s);
    let bands = '';
    for (let i = 1; i < bs.length; i++) { const g = bs[i - 1].s - bs[i].s, cls = g < plan * 0.4 ? 'bunch' : g > plan * 1.8 ? 'gap' : '';
      if (cls) bands += `<rect class="${cls}" x="${x(bs[i - 1].s)}" y="15" width="${x(bs[i].s) - x(bs[i - 1].s)}" height="14" rx="4"/>`; }
    const jams = sim.ops.jams.filter(j => j.L === L).map(j => `<rect class="jam" x="${x(L.stopS[j.k + 1])}" y="18" width="${x(L.stopS[j.k]) - x(L.stopS[j.k + 1])}" height="8"/>`).join('');
    const ticks = L.stopS.map(s => `<line x1="${x(s)}" x2="${x(s)}" y1="17" y2="27"/>`).join('');
    const dots = bs.map(b => { const d = (b.delay || 0) / 60, col = b.broken ? '#d03b3b' : d > 5 ? '#d03b3b' : d > 2 ? '#eda100' : '#1baf7a';
      return `<g class="bus${dispSel === b.id ? ' sel' : ''}" data-bus="${b.id}"><circle cx="${x(b.s)}" cy="22" r="${dispSel === b.id ? 9 : 7}" fill="${col}"/>${b.broken ? `<text x="${x(b.s)}" y="26" text-anchor="middle">!</text>` : ''}<circle class="hit" cx="${x(b.s)}" cy="22" r="16"/></g>`; }).join('');
    const sel = bs.find(b => b.id === dispSel);
    const late = bs.filter(b => (b.delay || 0) > 120).length, bunch = (bands.match(/bunch/g) || []).length, gaps = (bands.match(/class="gap/g) || []).length;
    const info = sel ? `<div class="dsel"><b>אוטובוס ${sel.id}</b> · ${sel.broken ? '<span class="bad">תקלה</span>' : `איחור ${Math.round((sel.delay || 0) / 60)} דק'`} · ${sel.pax.filter(p => !p.role).length} נוסעים${sel.express ? ' · ישר למסוף' : ''}
        <div class="dbtns"><button data-act="hold" data-b="${sel.id}" data-l="${L.id}">החזקה 1 דק'</button><button data-act="express" data-b="${sel.id}" data-l="${L.id}" ${sel.express ? 'disabled' : ''}>ישר למסוף</button>${sel.broken ? `<button data-act="fix" data-b="${sel.id}" data-l="${L.id}">רכב חלופי (${money(RESERVE_COST)})</button>` : ''}</div></div>` : '';
    return `<div class="dline"><div class="dhead"><span class="num sm" style="background:${L.color}">${esc(L.def.number)}</span><span class="lmeta">כל ${L.def.headway} דק' · ${bs.length} בדרך${late ? ` · <span class="bad">${late} מאחרים</span>` : ''}${bunch ? ` · <span class="bad">צפיפות</span>` : ''}${gaps ? ` · <span class="warnt">פער</span>` : ''}</span>
      <button class="dres" data-act="reserve" data-l="${L.id}">אוטובוס נוסף</button></div>
      <svg viewBox="0 0 ${W} 44" class="dstrip"><line class="track" x1="${X0}" x2="${X1}" y1="22" y2="22"/>${jams}${bands}${ticks}${dots}</svg>${info}</div>`;
  }).join('');
  const log = sim.ops.log.slice(0, 12).map(e => `<li><span class="lmeta">${clockText(e.t)}</span> ${ICON[e.type] || '•'} ${e.line ? `<span class="num sm" style="background:${e.color}">${esc(e.line)}</span> ` : ''}${esc(e.txt)}</li>`).join('');
  const html = `${act.length ? strips : '<p class="hint">אין קווים פעילים.</p>'}
    <div class="dkey"><span><i style="background:#1baf7a"></i>בזמן</span><span><i style="background:#eda100"></i>איחור 2–5 דק'</span><span><i style="background:#d03b3b"></i>איחור / תקלה</span><span><i class="kb"></i>צפיפות</span><span><i class="kg"></i>פער</span><span><i class="kj"></i>פקק</span></div>
    <h4>יומן אירועים</h4>${log ? `<ul class="dlog">${log}</ul>` : `<p class="hint">${career.creative && bank.settings.incidents === false ? 'האירועים כבויים (הגדרות בלשונית "קופה").' : 'עוד אין אירועים.'}</p>`}`;
  const box = $('#dispBody'); if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
}
function dispatchAction(e) {
  const g = e.target.closest('[data-bus]'); if (g) { dispSel = dispSel === +g.dataset.bus ? null : +g.dataset.bus; renderDispatch(true); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const L = lines.find(x => x.id === a.dataset.l), b = L?.buses.find(x => x.id === +a.dataset.b);
  if (a.dataset.act === 'hold' && b) { sim.ops.hold(b, 60); toast('האוטובוס יחכה דקה נוספת בתחנה'); }
  if (a.dataset.act === 'express' && b) { sim.ops.express(b); toast('האוטובוס נוסע ישר למסוף — מוריד נוסעים ולא אוסף'); }
  if (a.dataset.act === 'fix' && b) { sim.ops.reserve(L, b); toast(`רכב חלופי בדרך: ${money(RESERVE_COST)}`); }
  if (a.dataset.act === 'reserve' && L) toast(sim.ops.reserve(L) ? 'אוטובוס נוסף יוצא עכשיו מהמסוף' : 'אין רכב פנוי במסוף — הוסיפו רכבים לקו');
  renderDispatch(true);
}
// ---------- משחק: התחלה מחדש, ושמירות בשם (נוסף לשמירה האוטומטית). הכל ב-localStorage בתוך try/catch
const SLOTS_KEY = 'busgame.kiryat-malachi.slots.v1';
function readSlots() { try { const a = JSON.parse(localStorage.getItem(SLOTS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function writeSlots(a) { try { localStorage.setItem(SLOTS_KEY, JSON.stringify(a)); return true; } catch { return false; } }
const dayTime = t => `יום ${dayOf(t)}, ${clockText(t)}`;
function saveSlot(name) {
  const now = new Date(), stamp = now.toLocaleDateString('he-IL') + ' ' + now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const slot = { id: 'S' + Date.now().toString(36), name: name || `${stamp} · ${money(bank.money)}`, at: Date.now(), time: sim.time, money: bank.money,
    lines: JSON.parse(JSON.stringify(lineDefs)), bank: JSON.parse(JSON.stringify(bank.snapshot(sim.time))) };
  const a = readSlots(); a.unshift(slot);
  if (!writeSlots(a.slice(0, 20))) { toast('לא הצלחתי לשמור — אין מקום בדפדפן'); return null; }
  renderSlots(); return slot;
}
// טוען משחק: הקווים, הצי, הקופה והשעה כמו שהיו
function loadSlot(id) {
  const sl = readSlots().find(x => x.id === id); if (!sl) return;
  cancelPlanning();
  for (const L of [...lines]) removeLine(L, false);
  sim.time = sl.time; sim.resetStops(); sim.resetToday(); sim.pending = [];
  const nb = new Bank(sl.bank, sl.time); bank.money = nb.money; bank.today = nb.today; bank.history = nb.history;
  bank.mode = nb.mode; bank.career = nb.career || (nb.mode === 'career' ? newCareer() : null);
  bank.inspectors = nb.inspectors; bank.reports = nb.reports; bank.settings = nb.settings; renderOps();
  if (nb.mode === 'career' && !nb.career) { career.payStops(sl.lines.flatMap(d => d.stopIds)); }
  lineDefs = [];
  for (const d of sl.lines) { const dd = JSON.parse(JSON.stringify(d)); lineDefs.push(dd); addLine(dd, false); }
  saveLines(lineDefs); bank.save(sim.time);
  renderLines(); renderMoney(); renderSlots(); showTab('lines');
  toast(`נטען: ${sl.name}`);
}
function deleteSlot(id) { writeSlots(readSlots().filter(x => x.id !== id)); renderSlots(); }
// פקחים והגדרות (בלשונית "קופה")
function renderOps() {
  const box = $('#opsBox'); if (!box) return;
  const n = bank.inspectors || 0, cre = career.creative, S = bank.settings;
  box.innerHTML = `<h4>פקחים</h4>
    <div class="fcount"><span class="flabel">כמה פקחים</span><div class="stepper"><button type="button" data-insp="-1" aria-label="פחות" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button type="button" data-insp="1" aria-label="עוד">+</button></div>
      <span class="fneed">${money(INSPECTOR_DAY)} ליום לפקח</span></div>
    <p class="hint">בלי פקחים כ-6% מהנוסעים לא משלמים. כל פקח מוריד את זה ב-1.2%, ומי שנתפס משלם קנס של ${money(FINE)}. הפקחים עולים לאוטובוסים באפוד צהוב.</p>
    <h4>הגדרות</h4>
    <label class="tog"><input type="checkbox" data-set="incidents" ${S.incidents !== false || !cre ? 'checked' : ''} ${cre ? '' : 'disabled'}> תקלות ואירועים (תקלה, נהג מאחר, פקק, התחמקות מתשלום)</label>
    <label class="tog"><input type="checkbox" data-set="audits" ${S.audits !== false || !cre ? 'checked' : ''} ${cre ? '' : 'disabled'}> מבקרים סמויים ודוחות ביקורת</label>
    ${cre ? '' : '<p class="hint">בקריירה הכל פעיל. אפשר לכבות במצב יצירתי.</p>'}`;
}
function renderSlots() {
  const a = readSlots(), box = $('#slotList'); if (!box) return;
  box.innerHTML = a.length ? a.map(x => `<div class="slot"><div class="sn"><b>${esc(x.name)}</b><span>${x.bank?.mode === 'creative' ? 'יצירתי' : 'קריירה'} · ${dayTime(x.time)} · ${money(x.money)} · ${x.lines.length} קווים</span></div>
    <button type="button" data-load="${x.id}">טעינה</button><button type="button" class="del" data-del="${x.id}">מחיקה</button></div>`).join('')
    : '<p class="hint">אין משחקים שמורים. "שמירה" שומרת את המשחק הנוכחי.</p>';
}
function bindReset() {
  $('#resetGame').onclick = () => { modePick = bank.mode; syncModePick(); $('#resetAsk').hidden = false; };
  $('#resetCancel').onclick = () => { $('#resetAsk').hidden = true; };
  $('#resetNoSave').onclick = () => { $('#resetAsk').hidden = true; startMode(modePick, false); };
  $('#resetSave').onclick = () => { $('#resetAsk').hidden = true; startMode(modePick, true); };
  document.querySelectorAll('.modepick').forEach(g => g.onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { modePick = b.dataset.mode; syncModePick(); } });
  $('#modeGo').onclick = () => { $('#modeAsk').hidden = true; if (modePick !== bank.mode || !$('#modeAsk').dataset.fresh) resetGame(false, modePick); };
  $('#stageClose').onclick = () => { $('#stageModal').hidden = true; flushToasts(); };
  $('#opsBox').onclick = e => { const b = e.target.closest('[data-insp]'); if (!b) return; bank.inspectors = Math.max(0, Math.min(20, (bank.inspectors || 0) + +b.dataset.insp)); bank.save(sim.time); renderOps(); };
  $('#opsBox').onchange = e => { const c = e.target.closest('[data-set]'); if (!c) return; bank.settings[c.dataset.set] = c.checked; bank.save(sim.time); renderOps(); };
  $('#dispBody').onclick = e => dispatchAction(e);
  renderOps();
  $('#saveSlot').onclick = () => { const s = saveSlot(); if (s) toast(`נשמר: ${s.name}`); };
  $('#slotList').onclick = e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (l) loadSlot(l.dataset.load);
    if (d) { if (d.classList.contains('sure')) deleteSlot(d.dataset.del); else { d.classList.add('sure'); d.textContent = 'בטוח?'; } }
  };
  renderSlots();
}
function resetGame(saved, mode = bank.mode) {
  cancelPlanning();
  for (const L of [...lines]) removeLine(L, false);
  sim.time = 6.5 * 3600; sim.resetStops(); sim.resetToday(); sim.pending = [];
  bank.reset(sim.time, mode, mode === 'career' ? newCareer() : null);
  sim.ops.log.length = 0; sim.ops.jams.length = 0; renderOps();
  if (mode === 'creative') bank.money = 10_000_000;
  covLayer && drawCover(); renderMissions();
  bank.save(sim.time); renderMoney(); renderSlots(); showTab('lines');
  toast(mode === 'creative' ? `${saved ? 'המשחק נשמר. ' : ''}מצב יצירתי: כסף בלי הגבלה וכל הרכבים` : `${saved ? 'המשחק נשמר. ' : ''}קריירה, שלב 1: ${money(bank.money)} בקופה`);
}
function showDaySummary(d) {
  bank.save(sim.time);
  $('#dayTitle').textContent = `סיכום יום ${d.day}`;
  const gaveUp = lines.reduce((a, L) => a + L.stats.gaveUp, 0);
  const best = lines.map(L => [L, d.byLine[L.id]]).filter(x => x[1]).sort((a, b) => b[1].pax - a[1].pax)[0];
  const T = sim.today, sum = a => a.reduce((x, y) => x + y, 0), pot = sum(T.pot);
  const dem = pot ? `<p class="hint">רצו לנסוע ${num(pot)} · נסעו ${num(sum(T.ride))} · בלי קו ${num(sum(T.none))}${T.xferTrips ? ` · עם מעבר ${num(T.xferTrips)}` : ''}</p>` : '';
  $('#dayBody').innerHTML = `${dayRows(d)}${dem}
    <p class="hint">${best ? `הקו העמוס ביותר: ${esc(best[0].def.number)} עם ${num(best[1].pax)} נוסעים.` : 'לא נסעו נוסעים היום.'}
    ${gaveUp ? `<span class="bad">${num(gaveUp)} אנשים ויתרו והלכו.</span>` : ''} בקופה עכשיו: <b>${money(bank.money)}</b></p>`;
  $('#daySum').hidden = false;
}
// מבט מקרוב על תחנה: המצלמה עוברת בתנועה רכה למבט נמוך באלכסון, מהכביש אל הסככה (או אל העמוד בתחנה בלי סככה)
let camAnim = null;
function closeLook(s) {
  if (!s) return;
  const f = people.stopFrame(s), a = f.shelter ? -3.15 : 0.5;
  const tgt = frameV(f, a, f.shelter ? 2.4 : 1.2, 0.9), pos = frameV(f, a + 5.5, -10, 4.4);
  if (cams.current !== 'free') cams.set('free');
  if (innerWidth <= 820) $('#panel').classList.add('min');
  camAnim = { t: 0, dur: 1.1, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt };
}
function stepCamAnim(dt) {
  if (!camAnim) return;
  const A = camAnim; A.t = Math.min(A.dur, A.t + dt);
  const k0 = A.t / A.dur, k = k0 * k0 * (3 - 2 * k0);
  // דרך קשת: באמצע המעבר המצלמה קצת גבוהה יותר, כדי שלא תעבור דרך בניינים
  const lift = Math.sin(Math.PI * k0) * Math.min(60, A.p0.distanceTo(A.p1) * 0.15);
  camera.position.lerpVectors(A.p0, A.p1, k); camera.position.y += lift;
  controls.target.lerpVectors(A.t0, A.t1, k);
  if (k0 >= 1) camAnim = null;
}
G.closeLook = id => closeLook(stopsById.get(id));
// חזרה לדף או שחזור של הקשר הגרפי (טלפון): מעלים מחדש טקסטורות וצל, ומציירים מחדש את השלטים.
// אם הקשר הגרפי לא חוזר תוך 4 שנ' — שומרים וטוענים את הדף מחדש (הקווים, הצי, הקופה והשעה נשמרים)
let glLost = false, glLostT = null;
function refreshGraphics(why) {
  if (!G.ready) return;
  const n = refreshAll(scene, renderer, why === 'restored'); stopView.refreshSigns();
  G.refreshed = (G.refreshed || 0) + 1; G.refreshWhy = why; G.refreshTex = n;
  if (glLost && !glLostT) glLostT = setTimeout(() => { if (glLost) { try { saveLines(lineDefs); bank.save(sim.time); } catch { } location.reload(); } }, 4000);
}
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); glLost = true; G.glLost = (G.glLost || 0) + 1;
  if (!document.hidden) refreshGraphics('lost'); }, false);
canvas.addEventListener('webglcontextrestored', () => { glLost = false; clearTimeout(glLostT); glLostT = null; G.glRestored = (G.glRestored || 0) + 1; refreshGraphics('restored'); }, false);
function renderStop() {
  const s = selectedStop; if (!s) return;
  const sm = sim.stopSummary(s.id);
  const rows = sm.per.map(x => `<tr><td><span class="num sm" style="background:${x.line.color}">${esc(x.line.def.number)}</span> ממתינים לקו</td><td>${x.waiting}</td></tr>`).join('');
  const z = demand.zones[s.zone];
  $('#stopPane').innerHTML = `<div class="scard"><button type="button" class="primary closeLook" data-close="1">מבט מקרוב</button><h3>${esc(s.name)}</h3><div class="code">תחנה ${esc(s.code)} · ${esc(z?.name || '')} · כ-${num(s.pop || 0)} תושבים קרובים</div>
    <table><tr><td>ממתינים עכשיו</td><td>${sm.waiting}</td></tr><tr><td>עלו כאן היום</td><td>${sm.board}</td></tr><tr><td>ירדו כאן היום</td><td>${sm.alight}</td></tr>
    <tr><td>נשארו בתחנה כי האוטובוס היה מלא</td><td class="${sm.left ? 'bad' : ''}">${sm.left}</td></tr>
    <tr><td>ויתרו והלכו (חיכו יותר מחצי שעה)</td><td class="${sm.gaveUp ? 'bad' : ''}">${sm.gaveUp}</td></tr>
    <tr><td>החליפו כאן קו היום</td><td>${sm.xfer || 0}</td></tr>
    <tr><td>שביעות רצון של מי שעלה כאן (0–100)</td><td>${sm.satN ? Math.round(sm.satSum / sm.satN) : '—'}</td></tr>${rows}</table>
    ${sm.per.length ? '' : '<p class="hint">אף קו לא עוצר כאן עדיין.</p>'}</div>`;
}
// ---------- ביקוש: גרף לכל קו, לשונית "ביקוש" ושכבת "מאיפה לאן" במפה
const hourNow = () => Math.floor((sim.time / 3600) % 24);
function lineChart(L) {
  const want = sim.net.summary().lineWant[L.id] || new Float64Array(24);
  const st = L.stats, H = hourNow(), T = TYPES[typeOf(L.def)];
  const perH = L.def.fleet ? Math.min(60 / L.def.headway, L.def.fleet * 60 / (lineCycle(L).total / 60)) : 0;
  const cap = [], board = [], on = [];
  for (let h = 0; h < 24; h++) {
    on.push(inHours(L.def, h * 3600 + 1800));
    cap.push(h < H ? st.hCap[h] : on[h] ? perH * T.cap : 0);      // שעות שעברו — מה שיצא בפועל; מעכשיו — לפי התכנון
    board.push(h <= H ? st.hBoard[h] : 0);
  }
  const max = Math.max(10, ...want, ...board) * 1.15;
  const X0 = 4, SW = 280 / 24, Y0 = 4, Y1 = 56, y = v => Y1 - Math.min(1, v / max) * (Y1 - Y0);
  let g = '';
  for (let h = 0; h < 24; h++) if (!on[h]) g += `<rect x="${(X0 + h * SW).toFixed(1)}" y="${Y0}" width="${SW.toFixed(1)}" height="${Y1 - Y0}" fill="#e2e8f0"/>`;
  for (let h = 0; h < 24; h++) {
    const x = X0 + h * SW;
    if (want[h] > 0.05) g += `<rect x="${(x + 1).toFixed(1)}" y="${y(want[h]).toFixed(1)}" width="${(SW - 2).toFixed(1)}" height="${(Y1 - y(want[h])).toFixed(1)}" fill="${L.color}" opacity=".3"/>`;
    if (board[h] > 0) g += `<rect x="${(x + 3).toFixed(1)}" y="${y(board[h]).toFixed(1)}" width="${(SW - 6).toFixed(1)}" height="${(Y1 - y(board[h])).toFixed(1)}" fill="${L.color}"/>`;
  }
  let path = '';
  for (let h = 0; h < 24; h++) { const yy = y(cap[h]).toFixed(1); path += `${h ? 'L' : 'M'}${(X0 + h * SW).toFixed(1)},${yy}L${(X0 + (h + 1) * SW).toFixed(1)},${yy}`; }
  g += `<path d="${path}" fill="none" stroke="#0f172a" stroke-width="1.3" stroke-dasharray="3 2"/>`;
  const nx = X0 + ((sim.time / 3600) % 24) * SW;
  g += `<line x1="${nx.toFixed(1)}" x2="${nx.toFixed(1)}" y1="${Y0 - 2}" y2="${Y1 + 2}" stroke="#f59e0b" stroke-width="1.5"/>`;
  g += `<line x1="${X0}" x2="${X0 + 280}" y1="${Y1}" y2="${Y1}" stroke="#cbd5e1"/>`;
  for (const h of [0, 6, 12, 18, 24]) g += `<text x="${X0 + h * SW}" y="68" font-size="9" fill="#64748b" text-anchor="middle">${h}</text>`;
  let pk = 0; for (let h = 1; h < 24; h++) if (want[h] > want[pk]) pk = h;
  const head = want[pk] >= 1 ? `בשעת השיא ${hm(pk * 60)} רוצים כ-${num(want[pk])} לעלות · מקומות לשעה: ${num(cap[pk] || perH * T.cap)}`
    : (L.def.fleet ? 'כמעט אין ביקוש לקו הזה' : 'בלי רכבים אין נוסעים');
  return `<div class="ct">${head}</div><svg viewBox="0 0 288 72" direction="ltr" role="img" aria-label="ביקוש לפי שעה">${g}</svg>
    <div class="ck"><span><i style="background:${L.color};opacity:.3"></i>רוצים</span><span><i style="background:${L.color}"></i>עלו היום</span><span><i style="border-top:2px dashed #0f172a;height:0;border-radius:0"></i>מקומות</span><span><i style="background:#e2e8f0"></i>לא פועל</span><span>שעות ←</span></div>`;
}
const flowCache = new Map();
function flows(h) {
  const t = sim.net.tableAtHour(h), key = h + '|' + sim.net.ver + '|' + t.key;
  let f = flowCache.get(key);
  if (!f) { f = sim.net.zoneFlows(h); f.key = key; flowCache.clear(); flowCache.set(key, f); }
  return f;
}
let maxDir = 0, symUnit = 0;
const dview = { on: false, now: true, hour: 7, key: '', focus: null, dir: 'out' };
// fit: מבט מלמעלה על כל האזורים (ובטלפון גם מקפלים את הלוח, כדי שהמפה תיראה)
function setDemandView(on, hour, fit) {
  dview.on = on; if (!on) dview.focus = null;
  if (hour != null) { dview.now = false; dview.hour = hour; }
  dlayer.setVisible(on); $('#dLegend').hidden = !on; if (!on) $('#dlFocus').hidden = true; $('#demandBtn')?.classList.toggle('on', on);
  if (on) refreshDemandView(true);
  if (on && fit) {
    if (cams.current !== 'free') cams.set('free');
    if (innerWidth <= 820) $('#panel').classList.add('min');
    // העיר עצמה (בלי המושבים הרחוקים — אליהם מגיעים בגרירה), מלמעלה ובהטיה קלה
    const zs = demand.zones, core = zs.filter(z => z.kind !== 'village');
    fitWide(core.map(z => dlayer.anchor[z.id]), 28, 0);
  }
  // מספרי התחנות ותוויות האוטובוסים מסתירים את קווי הביקוש — מסתירים אותם בזמן הזה
  for (const g of lineGroups.values()) g.children.forEach(c => { if (c.isSprite) c.visible = !on; });
  buses.hideLabels = on;
  if (!on) { controls.maxDistance = 2600; look.fogMin.near = 0; look.fogMin.far = 0; }
  if ($('[data-pane="demand"]').classList.contains('on')) renderDemand();
}
// מבט מלמעלה על נקודות רחוקות (גם מעל הגובה הרגיל), והערפל והמצלמה בהתאם
function fitWide(pts, pad, below) {
  controls.maxDistance = 10000;
  fitPoints(pts, pad, below);
  const h = camera.position.y;
  controls.maxDistance = Math.max(2600, h * 1.2);
  look.fogMin.near = Math.max(1400, h * 0.9); look.fogMin.far = Math.max(4200, h * 2.2);
  camera.far = Math.max(9000, h * 3); camera.updateProjectionMatrix();
}
// בחירת שכונה (או null — חזרה לכל העיר). הכיוון: מה שיש בו יותר נסיעות בשעה הזו (בוקר בשכונת מגורים — יוצאים; באזור תעשייה — מגיעים)
function focusZone(z) {
  dview.focus = z; dview.dirUser = false; dview.fit = true;
  refreshDemandView(true);
}
// המלבן הפנוי במסך (בלי הסרגל, המקרא, הכרטיס והלוח): מכל רכיב חותכים את הצד שמשאיר הכי הרבה מקום
function freeRect() {
  let r = { l: 0, t: 0, r: innerWidth, b: innerHeight };
  for (const el of [$('.bar'), $('#dLegend'), $('#dlFocus'), $('#panel')]) {
    if (!el || el.hidden) continue;
    let o = el.getBoundingClientRect();
    if (el.id === 'panel' && el.classList.contains('min') && innerWidth <= 820) o = { left: o.left, right: o.right, top: o.bottom - 96, bottom: o.bottom, width: o.width };   // בזמן האנימציה
    if (!o.width || o.right <= r.l || o.left >= r.r || o.bottom <= r.t || o.top >= r.b) continue;
    const c = [{ ...r, b: Math.min(r.b, o.top) }, { ...r, t: Math.max(r.t, o.bottom) }, { ...r, r: Math.min(r.r, o.left) }, { ...r, l: Math.max(r.l, o.right) }];
    r = c.reduce((a, x) => (x.r - x.l) * (x.b - x.t) > (a.r - a.l) * (a.b - a.t) ? x : a);
  }
  return r;
}
// מבט מלמעלה (בהטיה קלה) כך שהנקודות (במטרים) ייכנסו למלבן הפנוי
function fitPoints(pts, pad = 46, below = 30) {
  if (!pts.length) return;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), R = freeRect();
  R.b -= below;        // מקום לשם שמתחת לסמל האחרון
  const rw = Math.max(80, R.r - R.l - 2 * pad), rh = Math.max(80, R.b - R.t - 2 * pad);
  const bw = Math.max(300, Math.max(...xs) - Math.min(...xs)), bh = Math.max(300, Math.max(...ys) - Math.min(...ys));
  const mpp = Math.max(bw / rw, bh / rh), tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let h = Math.min(controls.maxDistance, mpp * innerHeight / (2 * tf)), m = h * 2 * tf / innerHeight;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let tx = cx - ((R.l + R.r) / 2 - innerWidth / 2) * m, ty = cy + ((R.t + R.b) / 2 - innerHeight / 2) * m;
  if (cams.current !== 'free') cams.set('free');
  const place = () => { controls.target.set(tx, 0, -ty); camera.position.set(tx, h, -ty + h * 0.2); camera.lookAt(controls.target); camera.updateMatrixWorld(); };
  place();
  // תיקון לפרספקטיבה: מודדים איפה הנקודות נופלות בפועל, ומזיזים/מגדילים עוד פעמיים
  const v = new THREE.Vector3();
  for (let it = 0; it < 3; it++) {
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (const [x, y] of pts) { v.set(x, 24, -y).project(camera); const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
      l = Math.min(l, sx); r = Math.max(r, sx); t = Math.min(t, sy); b = Math.max(b, sy); }
    const k = Math.max((r - l) / rw, (b - t) / rh, 0.3);
    const nh = Math.min(controls.maxDistance, h * k);
    tx += ((l + r) / 2 - (R.l + R.r) / 2) * m; ty -= ((t + b) / 2 - (R.t + R.b) / 2) * m;
    m *= nh / h; h = nh; place();
  }
}
function refreshDemandView(force) {
  if (!dview.on || !demand) return;
  const h = dview.now ? hourNow() : dview.hour;
  if (+$('#dlHour').value !== h) $('#dlHour').value = h;
  for (const b of $('#dlChips').children) b.classList.toggle('on', b.dataset.h === 'now' ? dview.now : !dview.now && +b.dataset.h === h);
  $('#dlTitle').textContent = `מאיפה לאן · ${span(h * 60, h * 60 + 60)}`;
  const f = flows(h), key = f.key + '|' + dview.focus + '|' + dview.dir;
  if (!force && key === dview.key) return;
  dview.key = key;
  const Z = demand.Z, zn = demand.zones;
  // קנה מידה קבוע לכל היום (כך שבוקר וערב בני השוואה): סמל אחד = symUnit נוסעים בשעה, כך שבשכונה העמוסה ביותר יש עד 12 סמלים
  if (!symUnit) {
    let mx = 0;
    for (const R of demand.zoneHour) for (let i = 0; i < Z; i++) {
      let t = 0; for (let j = 0; j < Z; j++) if (j !== i) { t += R[i * Z + j]; maxDir = Math.max(maxDir, R[i * Z + j]); }
      mx = Math.max(mx, t);
    }
    symUnit = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(u => mx / u <= 12) || 1000;
  }
  const U = symUnit, MAXS = 12, F = dview.focus;
  const keys = $('#dlKeys'), note = $('#dlNote'), box = $('#dlFocus');
  if (F == null) {
    // לכל שכונה: סמלים של שכונות היעד (הסמל של היעד), סמל = U נוסעים בשעה. החלוקה בין היעדים — לפי השארית הגדולה,
    // כך שסך הסמלים = סך הנוסעים / U. בכל יעד — המצב שלו (אין קו / חלקי / יש קו)
    const sym = [], more = [];
    let tot = 0, miss = 0;
    zn.forEach((z, i) => {
      const dest = [];
      let sum = 0;
      for (let j = 0; j < Z; j++) {
        const P = f.pot[i * Z + j]; if (j === i || !P) continue;
        sum += P; miss += P * (1 - Math.min(1, f.cov[i * Z + j] / P));
        dest.push({ j, P, k: flowClass(f.cov[i * Z + j] / P) });
      }
      tot += sum;
      let n = Math.round(sum / U); if (!n && sum >= U * 0.4) n = 1;
      dest.sort((a, b) => b.P - a.P);
      const q = dest.map(d => d.P / sum * n), cnt = q.map(Math.floor);
      let left = n - cnt.reduce((a, b) => a + b, 0);
      q.map((v, k) => [v - cnt[k], k]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, k]) => cnt[k]++);
      const list = [];
      dest.forEach((d, k) => { for (let c = 0; c < cnt[k]; c++) list.push({ s: zn[d.j].sym, k: d.k }); });
      more[i] = list.length > MAXS; sym[i] = more[i] ? list.slice(0, MAXS - 1) : list;
    });
    dlayer.setOverview({ sym, more });
    keys.innerHTML = `<div class="dk-types">${ZTYPES.map(t => `<span title="${t.txt}"><i class="sw" style="background:${t.col}"></i>${t.short}</span>`).join('')}</div>
      <div class="dk-sym">${['none', 'some', 'good'].map(k => `<span>${statusSvg(k)}${FLOW_TXT[k]}</span>`).join('')}</div>
      <div class="dk-u">סמל = ${num(U)} נוסעים בשעה · הצורה = שכונת היעד</div>`;
    note.innerHTML = `${num(tot)} רוצים לנסוע בין שכונות${tot ? ` · <b class="${miss / tot > 0.5 ? 'bad' : ''}">${Math.round(miss / tot * 100)}% בלי קו</b>` : ''}. הקישו על שכונה לפרטים`;
    box.hidden = true; box.innerHTML = '';
    $('#dLegend').classList.remove('focus');
    if (dview.fit) { dview.fit = false; setDemandView(true, null, true); }
    return;
  }
  // שכונה אחת: חיצים ליעדים (או מהמקורות), מספר בקצה כל חץ, וטבלה.
  // הכיוון — מה שיש בו יותר נסיעות בשעה הזו (בבוקר משכונת מגורים יוצאים, לאזור תעשייה מגיעים), עד שבוחרים ידנית
  if (!dview.dirUser) {
    let o = 0, i = 0;
    for (let j = 0; j < Z; j++) if (j !== F) { o += f.pot[F * Z + j]; i += f.pot[j * Z + F]; }
    dview.dir = i > o * 1.2 ? 'in' : 'out';
  }
  const dir = dview.dir, all = [];
  for (let j = 0; j < Z; j++) {
    if (j === F) continue;
    const k = dir === 'out' ? F * Z + j : j * Z + F, r = f.pot[k]; if (r < 0.5) continue;
    all.push({ z: j, rate: r, share: f.cov[k] / r });
  }
  all.sort((a, b) => b.rate - a.rate);
  const total = all.reduce((a, x) => a + x.rate, 0);
  const arrows = all.filter(x => x.rate >= Math.max(1, all[0]?.rate * 0.08 || 0)).slice(0, 6);
  dlayer.setFocus({ focus: F, rows: arrows, dir, maxRate: maxDir });
  $('#dLegend').classList.add('focus');
  keys.innerHTML = `<div class="dk-sym">${['none', 'some', 'good'].map(k => `<span><span class="st st-${k}">${FLOW_ICON[k]}</span>${FLOW_TXT[k]}</span>`).join('')}</div>`;
  note.innerHTML = 'עובי החץ והמספר בקצה = נוסעים בשעה';
  const rows = all.slice(0, innerWidth <= 820 ? 6 : 8), mx = Math.max(1, ...rows.map(x => x.rate));
  box.hidden = false;
  // מה יש בשכונה — ממנו נובע הביקוש (בניינים לפי סוג וגודל)
  const zf = zn[F], lvl = v => v >= 0.15 ? 'הרבה' : v >= 0.05 ? 'בינוני' : v > 0.005 ? 'מעט' : '';
  const has = [['work', 'עבודה ותעשייה'], ['school', 'בתי ספר וגנים'], ['other', 'מסחר ושירותים']].filter(([k]) => lvl(zf[k])).map(([k, t]) => `${t}: ${lvl(zf[k])}`);
  const need = rows.filter(x => flowClass(x.share) !== 'good').length;
  box.innerHTML = `<div class="dlf-head">${symSvg(zf.sym)}<b>${esc(zf.name)}</b><button class="link" data-zone="">כל העיר</button></div>
    <div class="dlf-what"><i class="sw" style="background:${ZTYPES[zf.type].col}"></i>${ZTYPES[zf.type].txt} · ${zf.pop >= 50 ? `כ-${num(Math.round(zf.pop / 50) * 50)} תושבים` : 'כמעט בלי מגורים'}${has.length ? ' · ' + has.join(' · ') : ''}</div>
    <div class="dl-chips dir" role="group" aria-label="כיוון"><button data-dir="out" class="${dir === 'out' ? 'on' : ''}">יוצאים מכאן</button><button data-dir="in" class="${dir === 'in' ? 'on' : ''}">מגיעים לכאן</button></div>
    <div class="dlf-tot">${num(total)} נוסעים בשעה ${dir === 'out' ? 'לשכונות אחרות' : 'משכונות אחרות'}${all.length > arrows.length ? ` · במפה ${arrows.length} הגדולים` : ''}</div>
    ${rows.length ? `<table class="dlf"><thead><tr><th><span class="vh">מצב</span></th><th>${dir === 'out' ? 'לאן' : 'מאיפה'}</th><th><span class="vh">כמות</span></th><th>בשעה</th></tr></thead><tbody>
    ${rows.map(x => { const k = flowClass(x.share), z = zn[x.z];
      return `<tr data-zone="${x.z}"><td><span class="st st-${k}" title="${FLOW_TXT[k]}">${FLOW_ICON[k]}</span></td><td class="nm">${symSvg(z.sym)}${esc(z.name)}</td>
        <td><span class="dbar"><i style="width:${Math.max(4, x.rate / mx * 100)}%"></i></span></td><td class="n">${num(x.rate)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="hint">כמעט אין נסיעות בשעה הזו.</p>'}
    ${rows.length ? `<div class="dl-note">${need ? `${need === 1 ? 'יעד אחד' : need + ' יעדים'} בלי קו מלא — כדאי לחבר` : 'לכל היעדים הגדולים יש קו'}</div>` : ''}`;
  if (dview.fit) { dview.fit = false; fitWide([F, ...arrows.map(x => x.z)].map(i => dlayer.anchor[i])); }
}
function renderDemand() {
  if (!sim) return;
  const H = hourNow(), f = flows(H), Z = demand.Z, T = sim.today, sum = a => a.reduce((x, y) => x + y, 0);
  let pot = 0, cov = 0, ride = 0;
  for (let k = 0; k < Z * Z; k++) { pot += f.pot[k]; cov += f.cov[k]; ride += f.ride[k]; }
  const S = sim.net.summary(), byId = new Map(lines.map(L => [L.id, L]));
  const chip = id => { const L = byId.get(id); return L ? `<span class="num sm" style="background:${L.color}">${esc(L.def.number)}</span>` : '?'; };
  const pairs = S.pairs.slice(0, 6).map(p => `<li><span class="pair">${esc(demand.zones[p.a].name)} ↔ ${esc(demand.zones[p.b].name)}</span><b>${num(p.n)} ביום</b></li>`).join('');
  const xf = [...T.xfer].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => { const [a, b] = k.split('>'); return `<li><span>מקו ${chip(a)} לקו ${chip(b)}</span><b>${n === 1 ? 'נוסע אחד' : num(n) + ' נוסעים'}</b></li>`; }).join('');
  const xs = [...T.xferStop].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => `<li><span class="pair">${esc(stopsById.get(id)?.name || id)}</span><b>${num(n)}</b></li>`).join('');
  const tp = sum(T.pot), none = sum(T.none);
  const html = `<h4>עכשיו · ${span(H * 60, H * 60 + 60)}</h4>
    <div class="tiles"><div class="tile"><b>${num(pot)}</b><span>רוצים לנסוע</span></div>
      <div class="tile ${pot && cov / pot < 0.2 ? 'warn' : ''}"><b>${pot ? Math.round(cov / pot * 100) : 0}%</b><span>יש להם קו</span></div>
      <div class="tile"><b>${num(ride)}</b><span>צפויים לנסוע</span></div></div>
    <button id="dShow" class="${dview.on ? '' : 'primary '}wide" style="margin-top:8px">${dview.on ? 'הסתרת "מאיפה לאן" מהמפה' : 'מאיפה לאן — הצגה במפה'}</button>
    <h4>היום</h4>
    <div class="tiles"><div class="tile"><b>${num(tp)}</b><span>רצו לנסוע</span></div><div class="tile"><b>${num(sum(T.ride))}</b><span>נסעו</span></div>
      <div class="tile ${none ? 'warn' : ''}"><b>${num(none)}</b><span>בלי קו בכלל</span></div>
      <div class="tile"><b>${num(sum(T.declined))}</b><span>לא נסעו (ארוך מדי)</span></div><div class="tile"><b>${num(T.xferTrips)}</b><span>נסיעות עם מעבר</span></div>
      <div class="tile"><b>${num(demand.dayTot)}</b><span>ביקוש ביום בכל העיר</span></div></div>
    <h4>חסר חיבור</h4>
    ${pairs ? `<ul class="dlist">${pairs}</ul><p class="hint">בין האזורים האלה רוצים לנסוע, ואין שום דרך בקווים שלכם (גם לא עם מעבר). כדאי לבנות שם.</p>` : '<p class="hint">לכל הזוגות הגדולים יש חיבור.</p>'}
    <h4>מעברים בין קווים · היום</h4>
    ${xf ? `<ul class="dlist">${xf}</ul>` : '<p class="hint">עוד לא היו מעברים. מעבר קורה כשאין קו ישיר, ושני קווים נפגשים באותה תחנה או בתחנות קרובות (עד 400 מטר).</p>'}
    ${xs ? `<h4>איפה מחליפים קו</h4><ul class="dlist">${xs}</ul>` : ''}
    <p class="hint">המעבר בחינם: משלמים ₪${FARE} פעם אחת לנסיעה.</p>`;
  const body = $('#demandBody');
  if (body.dataset.html === html) return;
  body.dataset.html = html; body.innerHTML = html;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT;
// הודעה קצרה. כשחלון פתוח — ההודעות מחכות בתור ומוצגות אחרי שהוא נסגר (לא מעל החלון)
const toastQ = [];
const modalOpen = () => !!document.querySelector('.modal:not([hidden])');
function toast(t) {
  if (modalOpen()) { if (!toastQ.includes(t)) toastQ.push(t); if (toastQ.length > 4) toastQ.shift(); $('#toast').hidden = true; return; }
  const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; flushToasts(); }, 3200);
}
function flushToasts() { if (toastQ.length && !modalOpen() && $('#toast').hidden) toast(toastQ.shift()); }

// ---------- לולאה
const clock = new THREE.Clock();
let acc = 0, fcount = 0, statT = 0, missionT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.25);
  if (G.manual) return;          // הקלטה פריים-אחר-פריים (G.advance)
  tick(dt);
}
// צעד אחד של המשחק והציור — גם להקלטת וידאו חלקה בזמן קבוע
G.advance = dt => tick(dt);
function tick(dt) {
  if (G.ready) {
    night.update();
    const simDt = sim.step(dt);
    buses.update(sim.lines);
    people.update(sim, city.stops, simDt, buses);
    sim.events.length = 0;
    cams.update(dt);
    updatePins();
    stopView.update(camera, lines, dt);
    $('#time').textContent = clockText(sim.time);
    updateMoneyChip();
    statT += dt; if (statT > 0.4) { statT = 0; updateStats(); refreshDemandView(false); missionT++; if (missionT % 5 === 0) updateMissions(); flushToasts(); if (modalOpen()) $('#toast').hidden = true; renderDispatch(); }
  }
  touch.update(dt);
  stepCamAnim(dt);
  // שומרים את המצלמה מעל העיר
  const t = controls.target, H = city ? city.meta.half : [3000, 3000];
  const cx = THREE.MathUtils.clamp(t.x, -H[0], H[0]) - t.x, cz = THREE.MathUtils.clamp(t.z, -H[1], H[1]) - t.z;
  t.x += cx; t.z += cz; camera.position.x += cx; camera.position.z += cz; t.y = Math.max(0, Math.min(t.y, 20));
  controls.update();
  updateLook(look, camera, controls.target);
  renderer.render(scene, camera);
  if (dview.on && dlayer) dlayer.draw(camera);
  fcount++; acc += dt; G.frames++;
  if (G.manual) return;
  if (acc >= 1) {
    G.fps = fcount / acc; fcount = 0; acc = 0;
    // רזולוציה דינמית: במכשיר חלש מורידים רזולוציה כדי שהמשחק יישאר חלק
    if (G.ready && !params.has('fixedres')) {
      const pr = G.fps < 24 ? Math.max(isTouch ? 1 : 0.6, pixelRatio * 0.85) : G.fps > 50 ? Math.min(MAX_PR, pixelRatio * 1.1) : pixelRatio;
      // מכשיר חלש מאוד: כבר ברזולוציה הנמוכה ועדיין איטי 4 שניות ברצף — מוותרים על הצל (פעם אחת)
      slowSec = G.fps < 20 && pr <= (isTouch ? 1 : 0.6) + 0.01 ? slowSec + 1 : 0;
      if (slowSec >= 4 && look.sun.castShadow) { look.sun.castShadow = false; renderer.shadowMap.enabled = false; G.noShadow = true; }
      if (Math.abs(pr - pixelRatio) > 0.01) { pixelRatio = pr; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); }
      G.pixelRatio = pixelRatio;
    }
    if (!$('#fps').hidden) $('#fps').textContent = ` · ${G.fps.toFixed(0)} fps`;
  }
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); dlayer?.resize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
frame();
init().catch(e => { console.error(e); $('#loadMsg').textContent = 'שגיאה בטעינה: ' + e.message; });
