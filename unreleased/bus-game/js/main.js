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
import { CameraModes } from './cameras.js';
import { Bank, TYPES, TYPE_ORDER, FARE, SELL_BACK, START_MONEY, typeOf, lineCycle, vehiclesNeeded, fleetChange, money, dayOf } from './fleet.js';
import { mapTouch } from './touch.js';
import { Demand, DEFAULT_HOURS, hoursOf, inHours } from './demand.js';
import { DemandLayer, FLOW_COL, flowClass } from './demandview.js';

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
scene.background = new THREE.Color(0xdbeefc);
scene.fog = new THREE.Fog(0xdbeefc, 1400, 4200);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 2, 9000);
camera.position.set(-260, 520, 560);
// תאורה: שמיים רכים מלמעלה ואדמה כהה יותר מלמטה (כך יש לדמויות צד מואר וצד מוצל), ושמש נמוכה יותר מהצד
scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x8f8574, 1.45));
const sun = new THREE.DirectionalLight(0xfff1dc, 1.9); sun.position.set(-450, 520, 380); scene.add(sun);
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
const touch = mapTouch(canvas, camera, controls);
controls.target.set(0, 0, 0);

// ---------- מצב המשחק
const G = window.__game = { scene, camera, controls, renderer, fps: 0, frames: 0 };
let city, graph, sim, bank, buses, people, stopsById, lineDefs, lines = [], cams, demand, dlayer;
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
  bank.onDay = showDaySummary;
  demand = new Demand(dj, city.stops);
  sim = new Sim(city.stops, bank, t0, demand);
  dlayer = new DemandLayer(scene, demand.zones); dlayer.resize(innerWidth, innerHeight);
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
  if (gift) setTimeout(() => toast(`הקווים שכבר בניתם קיבלו ${gift} אוטובוסים רגילים במתנה`), 600);
  else if (hrs) setTimeout(() => toast('לקווים שלכם נקבעו שעות פעילות 05:00–24:00. משנים ב"רכבים ותדירות"'), 600);
  bindUI(); renderLines(); renderMoney();
  setInterval(() => bank.save(sim.time), 4000);
  addEventListener('pagehide', () => bank.save(sim.time));
  document.addEventListener('visibilitychange', () => { if (document.hidden) bank.save(sim.time); });
  Object.assign(G, { city, graph, sim, bank, people, lines: () => lines, stopsById, cams, planTap: id => tapStop(stopsById.get(id)), stopScreen, busScreen, startPlanning, finishPlanning, saveForm: saveLineFromForm, editLine: openEdit, TYPES,
    demand, net: sim.net, editRoute, routeAction, saveRoute: () => finishPlanning(), cancelPlanning, setDemandView, renderDemand, showTab, planning: () => planning });
  $('#loading').classList.add('gone');
  G.ready = true;
}

// ---------- תחנות: עמוד, שלט וסיכה (שגדלה כשמתרחקים, כדי שיהיה קל להקיש)
let pins, poles, pinBase = [];
const PIN_COL = new THREE.Color(0x0ea5e9), PIN_SEL = new THREE.Color(0xf59e0b), PIN_ON = new THREE.Color(0x0369a1), PIN_USED = new THREE.Color(0x38bdf8);
function buildStops() {
  const n = city.stops.length;
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.9, 6).translate(0, 1.45, 0);
  poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x94a3b8 }), n);
  const sign = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.5, 0.06).translate(0, 2.75, 0), new THREE.MeshLambertMaterial({ color: 0x0ea5e9 }), n);
  // סככה: גג, קיר אחורי שקוף-למחצה ושני עמודים (הצד הפתוח פונה לכביש)
  const shelterGeo = mergeGeometries([
    new THREE.BoxGeometry(3.6, 0.08, 1.6).translate(1.6, 2.45, -0.75),
    new THREE.BoxGeometry(3.4, 1.7, 0.04).translate(1.6, 1.35, -1.45),
    new THREE.BoxGeometry(0.07, 2.4, 0.07).translate(-0.05, 1.2, -1.45), new THREE.BoxGeometry(0.07, 2.4, 0.07).translate(3.25, 1.2, -1.45),
    new THREE.BoxGeometry(2.8, 0.06, 0.4).translate(1.6, 0.45, -1.2),
  ]);
  const shelter = new THREE.InstancedMesh(shelterGeo, new THREE.MeshLambertMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.85 }), n);
  const pinGeo = new THREE.SphereGeometry(1, 14, 10);
  pins = new THREE.InstancedMesh(pinGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  pins.name = 'stop-pins'; pins.renderOrder = 5;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  city.stops.forEach((s, i) => {
    const f = people.stopFrame(s);
    q.setFromAxisAngle(up, Math.atan2(-f.ux, f.uy));
    const p = new THREE.Vector3(f.px, 0.12, -f.py);
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m); sign.setMatrixAt(i, m); shelter.setMatrixAt(i, m);
    s.world = p; pinBase[i] = p;
    pins.setColorAt(i, PIN_COL);
  });
  scene.add(poles, sign, shelter, pins);
}
function stopIndex(s) { return city.stops.indexOf(s); }
function updatePins() {
  const d = camera.position.distanceTo(controls.target);
  const k = THREE.MathUtils.clamp(d / 220, planning ? 0.5 : 0.2, 7) * (planning ? 1.35 : 1);
  const used = new Set(); for (const L of lines) if (L.visible) for (const s of L.stops) used.add(s);
  const sel = new Set(planning ? planning.stops : []), cur = planning?.selStop;
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  city.stops.forEach((s, i) => {
    v.copy(pinBase[i]); v.y = 3.6 + k * 1.6;
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
  const s = pickStop(e.clientX, e.clientY);
  if (s) tapStop(s);
});
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
  renderSwatches(planning.color);
  // קו זמני רק כדי לחשב זמן סיבוב וכמה רכבים צריך
  const r = computeRoute(graph, planning.stops);
  const tmp = { poly: r.poly, stops: planning.stops, profile: speedProfile(r.poly, r.stopS), def: { headway: 10 } };
  const need = vehiclesNeeded(tmp, 10);
  form = { line: null, tmp, type: 'std', n: Math.max(0, Math.min(need, Math.floor(bank.money / TYPES.std.price))), touched: false };
  $('#fTitle').textContent = 'פרטי הקו';
  $('#fSave').textContent = 'שמירה והפעלה';
  $('#fColors').hidden = false;
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
  return d ? fleetChange(typeOf(d), d.fleet || 0, form.type, form.n) : { buy: form.n * TYPES[form.type].price, sell: 0 };
}
function renderForm() {
  const box = $('#fTypes'); box.innerHTML = '';
  for (const id of TYPE_ORDER) {
    const T = TYPES[id];
    const b = document.createElement('button'); b.type = 'button'; b.dataset.type = id;
    b.className = 'vtype' + (id === form.type ? ' on' : ''); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', id === form.type);
    b.innerHTML = `<b>${T.name}</b><span>${T.cap} מקומות</span><span class="vp">${money(T.price)}</span>`;
    b.onclick = () => { form.type = id; renderForm(); };
    box.appendChild(b);
  }
  const need = formNeed();
  if (!form.touched && !form.line) form.n = Math.max(0, Math.min(need, Math.floor(bank.money / TYPES[form.type].price)));
  $('#fN').textContent = form.n;
  $('#fMinus').disabled = form.n <= 0;
  const T = TYPES[form.type];
  const cyc = Math.round(lineCycle(form.line || form.tmp).total / 60);
  $('#fNeed').innerHTML = form.n >= need ? `מספיק לכל ${formHeadway()} דק'` : `<span class="bad">צריך ${need} לכל ${formHeadway()} דק'</span>`;
  const { buy, sell } = formCost(), after = bank.money - buy + sell;
  const parts = [];
  if (buy) parts.push(`קנייה <b>${money(buy)}</b>`);
  if (sell) parts.push(`מכירה <b class="good">+${money(sell)}</b>`);
  parts.push(`בקופה אחרי: <b class="${after < 0 ? 'bad' : ''}">${money(after)}</b>`);
  const err = buy > 0 && after < 0 ? `<div class="bad">אין מספיק כסף. הורידו רכבים או בחרו רכב זול יותר.</div>` : '';
  const zero = form.n === 0 ? `<div class="bad">בלי רכבים הקו לא יפעל.</div>` : '';
  const [ha, hb] = formHours(), badH = hb <= ha;
  const hrs = badH ? `<div class="bad">שעת הסיום צריכה להיות אחרי שעת ההתחלה.</div>` : '';
  $('#fCost').innerHTML = `<div>${parts.join(' · ')}</div>
    <div class="fsub">סיבוב (הלוך, חזרה ריקה והפסקה) בערך ${cyc} דק'. ${T.cap * form.n ? `נסיעה: ₪${T.km} לק"מ ו-₪${T.hour} לשעת נהג.` : ''}</div>${err}${zero}${hrs}`;
  $('#fSave').disabled = (buy > 0 && after < 0) || badH;
}
// עריכת קו קיים: תדירות, סוג רכב וכמה רכבים (המסלול נשאר)
function openEdit(L) {
  if (planning) return;
  form = { line: L, type: typeOf(L.def), n: L.def.fleet || 0, touched: true };
  $('#fNum').value = L.def.number; $('#fName').value = L.def.name || ''; $('#fHead').value = String(L.def.headway); setHoursForm(hoursOf(L.def));
  $('#fTitle').textContent = `קו ${L.def.number}: רכבים ותדירות`;
  $('#fSave').textContent = 'שמירה';
  $('#fColors').hidden = true;
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
  if (o.fleet != null) form.n = o.fleet;
  if (o.headway) $('#fHead').value = String(o.headway);
  if (o.hours) setHoursForm(o.hours);
  const hours = formHours();
  const { buy, sell } = formCost();
  if (buy > 0 && bank.money - buy + sell < 0) { toast('אין מספיק כסף'); return; }
  if (hours[1] <= hours[0]) { toast('שעת הסיום צריכה להיות אחרי שעת ההתחלה'); return; }
  const number = ($('#fNum').value || '1').trim().slice(0, 4), name = ($('#fName').value || '').trim().slice(0, 40);
  if (buy) bank.spend('buy', buy);
  if (sell) bank.refund(sell);
  if (form.line) {
    const L = form.line, d = L.def, hw = formHeadway();
    if (typeOf(d) !== form.type) L.returning = [];      // הרכבים הישנים נמכרו
    d.number = number; d.name = name; d.vtype = form.type; d.fleet = form.n; d.hours = hours;
    sim.net.invalidate();
    if (hw !== d.headway) {
      d.headway = hw;
      const last = L.dispatches[L.dispatches.length - 1];
      L.nextDispatch = last != null ? Math.max(sim.time, Math.min(L.nextDispatch, last + hw * 60)) : sim.time;
    }
    form = null; $('#lineForm').hidden = true;
    saveLines(lineDefs); bank.save(sim.time);
    renderLines(); renderMoney();
    toast(`קו ${d.number}: ${d.fleet} × ${TYPES[d.vtype].name}, כל ${d.headway} דק', ${span(hours[0], hours[1])}`);
    return L;
  }
  const def = {
    id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), number, name, color: planning.color,
    headway: formHeadway(), stopIds: planning.stops.map(s => s.id), vtype: form.type, fleet: form.n, hours,
  };
  cancelPlanning();
  lineDefs.push(def); saveLines(lineDefs); bank.save(sim.time);
  const L = addLine(def, true);
  selectedLine = L; renderLines(); renderMoney(); showTab('lines'); openPanel();
  toast(def.fleet ? `קו ${def.number} יצא לדרך — ${def.fleet} × ${TYPES[def.vtype].name}, כל ${def.headway} דק'` : `קו ${def.number} נשמר בלי רכבים — הוסיפו רכבים כדי שיפעל`);
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
  const got = refund && L.def.fleet ? Math.round(L.def.fleet * TYPES[typeOf(L.def)].price * SELL_BACK) : 0;
  if (got) { bank.refund(got); bank.save(sim.time); toast(`קו ${L.def.number} נמחק. ${L.def.fleet} הרכבים שלו נמכרו ב-${money(got)}`); }
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
  $('#dlNow').onclick = () => { dview.now = true; refreshDemandView(true); };
  $('#dlHour').oninput = e => { dview.now = false; dview.hour = +e.target.value; refreshDemandView(true); };
  $('#demandBody').onclick = e => { if (e.target.closest('#dShow')) setDemandView(!dview.on, null, true); };
  $('#fBack').onclick = () => { $('#lineForm').hidden = true; if (form?.line) form = null; };
  $('#fMinus').onclick = () => { form.n = Math.max(0, form.n - 1); form.touched = true; renderForm(); };
  $('#fPlus').onclick = () => { form.n = Math.min(40, form.n + 1); form.touched = true; renderForm(); };
  $('#fHead').onchange = () => { if (form) renderForm(); };
  $('#fFrom').onchange = $('#fTo').onchange = () => { if (form) renderForm(); };
  $('#money').onclick = () => { showTab('money'); openPanel(); };
  $('#dayClose').onclick = () => { $('#daySum').hidden = true; };
  bindReset();
  $('#lineFormCard').onsubmit = e => { e.preventDefault(); saveLineFromForm(); };
  $('#play').onclick = () => setSpeed(sim.speed ? 0 : (G.lastSpeed || 5));
  document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
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
function setSpeed(s) {
  if (s) G.lastSpeed = s;
  sim.speed = s;
  $('#play').textContent = s ? '❚❚' : '▶';
  document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.s === s));
}
function showTab(t) {
  if (t === 'money') renderMoney();
  if (t === 'demand') renderDemand();
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
      <div class="fleet"><div><b>${L.def.fleet || 0} × ${T.name}</b> <span class="lmeta">${T.cap} מקומות</span></div><div data-k="need" class="lmeta"></div></div>
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
        <div class="stat"><b data-k="trips">0</b><span>נסיעות היום</span></div>
        <div class="stat"><b data-k="alight">0</b><span>ירדו היום</span></div>
      </div>
      <div class="lmoney" data-k="money"></div>
      <div class="lbtns"><button data-a="edit" class="primary">רכבים ותדירות</button><button data-a="route">מסלול</button><button data-a="follow">מעקב</button><button data-a="vis">${L.visible ? 'הסתרה' : 'הצגה'}</button><button data-a="del" class="del">מחיקה</button></div>`;
    c.onclick = e => {
      const a = e.target.dataset?.a;
      selectedLine = L;
      if (a === 'edit') return openEdit(L);
      if (a === 'route') return editRoute(L);
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
    const m = bank.today.byLine[L.id] || { fares: 0, cost: 0 }, prof = m.fares - m.cost;
    set('money', `היום: הכנסות ${money(m.fares)} · הוצאות ${money(m.cost)} · <b class="${prof < 0 ? 'bad' : 'good'}">${prof < 0 ? 'הפסד' : 'רווח'} ${money(Math.abs(prof))}</b>`, true);
  }
  if (selectedStop && $('[data-pane="stop"]').classList.contains('on')) renderStop();
  if ($('[data-pane="money"]').classList.contains('on')) renderMoney();
  if ($('[data-pane="demand"]').classList.contains('on')) renderDemand();
}
function updateMoneyChip() {
  const e = $('#money'), t = money(bank.money);
  if (e.textContent !== t) e.textContent = t;
  e.classList.toggle('neg', bank.money < 0);
}
function dayRows(d) {
  const net = d.fares + d.sell - d.buy - d.km - d.drivers;
  return `<table class="ledger">
    <tr><td>כרטיסים <span class="lmeta">${num(d.pax)} נוסעים × ₪${FARE}</span></td><td class="good">+${money(d.fares)}</td></tr>
    <tr><td>דלק, חשמל ותחזוקה</td><td>−${money(d.km)}</td></tr>
    <tr><td>שכר נהגים</td><td>−${money(d.drivers)}</td></tr>
    ${d.buy ? `<tr><td>קניית רכבים</td><td>−${money(d.buy)}</td></tr>` : ''}
    ${d.sell ? `<tr><td>מכירת רכבים</td><td class="good">+${money(d.sell)}</td></tr>` : ''}
    <tr class="tot"><td>סה"כ</td><td class="${net < 0 ? 'bad' : 'good'}">${net < 0 ? '−' : '+'}${money(Math.abs(net))}</td></tr>
  </table>`;
}
function renderMoney() {
  if (!bank) return;
  updateMoneyChip();
  const d = bank.today;
  const fleet = {}; for (const L of lines) { const t = typeOf(L.def); fleet[t] = (fleet[t] || 0) + (L.def.fleet || 0); }
  const fleetTxt = TYPE_ORDER.filter(t => fleet[t]).map(t => `${fleet[t]} × ${TYPES[t].name}`).join(' · ') || 'אין עדיין רכבים';
  const perLine = lines.map(L => {
    const m = d.byLine[L.id] || { fares: 0, cost: 0, pax: 0 }, p = m.fares - m.cost;
    return `<tr><td><span class="num sm" style="background:${L.color}">${esc(L.def.number)}</span></td><td>${num(m.pax)}</td><td>${money(m.fares)}</td><td>${money(m.cost)}</td><td class="${p < 0 ? 'bad' : 'good'}">${p < 0 ? '−' : ''}${money(Math.abs(p))}</td></tr>`;
  }).join('');
  const prev = bank.history[bank.history.length - 1];
  const html = `<div class="bigmoney ${bank.money < 0 ? 'neg' : ''}"><span>בקופה</span><b>${money(bank.money)}</b>${bank.money < 0 ? '<small>החברה בחובות — אי אפשר לקנות רכבים</small>' : ''}</div>
    <h4>היום · יום ${d.day}</h4>${dayRows(d)}
    ${lines.length ? `<h4>לפי קו, היום <span class="lmeta">(בלי קניית רכבים)</span></h4>
    <table class="perline"><tr><th>קו</th><th>נוסעים</th><th>הכנסות</th><th>הוצאות</th><th>רווח</th></tr>${perLine}</table>` : ''}
    <h4>הצי</h4><p class="lmeta big">${fleetTxt}</p>
    <h4>מחירון רכבים</h4>
    <table class="prices"><tr><th>סוג</th><th>מקומות</th><th>מחיר</th><th>לק"מ</th><th>לשעה</th></tr>
    ${TYPE_ORDER.map(t => { const T = TYPES[t]; return `<tr><td>${T.name}</td><td>${T.cap}</td><td>${money(T.price)}</td><td>₪${T.km}</td><td>₪${T.hour}</td></tr>`; }).join('')}</table>
    <p class="hint">כל נוסע משלם ₪${FARE}. מכירת רכב מחזירה ${Math.round(SELL_BACK * 100)}% מהמחיר.</p>
    ${prev ? `<h4>אתמול · יום ${prev.day}</h4>${dayRows(prev)}` : ''}`;
  const body = $('#moneyBody');
  if (body.dataset.html === html) return;
  body.dataset.html = html; body.innerHTML = html;
}
function bindReset() {
  $('#resetGame').onclick = e => {
    if (!e.target.classList.contains('sure')) {
      e.target.classList.add('sure'); e.target.textContent = 'כל הקווים והכסף יימחקו. לחצו שוב';
      setTimeout(() => { if (e.target.isConnected) { e.target.classList.remove('sure'); e.target.textContent = 'התחלה מחדש'; } }, 4000);
      return;
    }
    resetGame();
  };
}
function resetGame() {
  for (const L of [...lines]) removeLine(L, false);
  sim.time = 6.5 * 3600; sim.resetStops(); sim.resetToday(); sim.pending = [];
  bank.money = START_MONEY; bank.history = []; bank.today = { day: dayOf(sim.time), fares: 0, pax: 0, buy: 0, sell: 0, km: 0, drivers: 0, byLine: {} };
  bank.save(sim.time); renderMoney(); showTab('lines');
  const rb = $('#resetGame'); rb.classList.remove('sure'); rb.textContent = 'התחלה מחדש';
  toast('מתחילים מחדש: ₪2,000,000 בקופה');
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
function renderStop() {
  const s = selectedStop; if (!s) return;
  const sm = sim.stopSummary(s.id);
  const rows = sm.per.map(x => `<tr><td><span class="num sm" style="background:${x.line.color}">${esc(x.line.def.number)}</span> ממתינים לקו</td><td>${x.waiting}</td></tr>`).join('');
  const z = demand.zones[s.zone];
  $('#stopPane').innerHTML = `<div class="scard"><h3>${esc(s.name)}</h3><div class="code">תחנה ${esc(s.code)} · ${esc(z?.name || '')} · כ-${num(s.pop || 0)} תושבים קרובים</div>
    <table><tr><td>ממתינים עכשיו</td><td>${sm.waiting}</td></tr><tr><td>עלו כאן היום</td><td>${sm.board}</td></tr><tr><td>ירדו כאן היום</td><td>${sm.alight}</td></tr>
    <tr><td>נשארו בתחנה כי האוטובוס היה מלא</td><td class="${sm.left ? 'bad' : ''}">${sm.left}</td></tr>
    <tr><td>ויתרו והלכו (חיכו יותר מחצי שעה)</td><td class="${sm.gaveUp ? 'bad' : ''}">${sm.gaveUp}</td></tr>
    <tr><td>החליפו כאן קו היום</td><td>${sm.xfer || 0}</td></tr>${rows}</table>
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
let maxFlow = 0;
const dview = { on: false, now: true, hour: 7, key: '' };
// fit: מבט מלמעלה על כל האזורים (ובטלפון גם מקפלים את הלוח, כדי שהמפה תיראה)
function setDemandView(on, hour, fit) {
  dview.on = on;
  if (hour != null) { dview.now = false; dview.hour = hour; }
  dlayer.setVisible(on); $('#dLegend').hidden = !on; $('#demandBtn')?.classList.toggle('on', on);
  if (on) refreshDemandView(true);
  if (on && fit) {
    if (cams.current !== 'free') cams.set('free');
    if (innerWidth <= 820) $('#panel').classList.add('min');
    // העיר עצמה (בלי המושבים הרחוקים — אליהם מגיעים בגרירה), מלמעלה ובהטיה קלה
    const zs = demand.zones, pc = zs.reduce((a, z) => [a[0] + z.x, a[1] + z.y], [0, 0]).map(v => v / zs.length);
    const core = zs.filter(z => Math.hypot(z.x - pc[0], z.y - pc[1]) < 1700), xs = core.map(z => z.x), ys = core.map(z => z.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const hw = (Math.max(...xs) - Math.min(...xs)) / 2 + 200, hh = (Math.max(...ys) - Math.min(...ys)) / 2 + 200;
    const tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), A = camera.aspect;
    const h = Math.max(hh / tf, hw / (tf * A)) * (A < 0.8 ? 1 : 1.12);
    controls.maxDistance = Math.max(2600, h * 1.2);
    scene.fog.near = Math.max(1400, h * 0.9); scene.fog.far = Math.max(4200, h * 2.2);
    camera.far = Math.max(9000, h * 3); camera.updateProjectionMatrix();
    controls.target.set(cx, 0, -cy - (A < 0.8 ? 0.06 * h : 0)); camera.position.set(cx, h, -cy + h * 0.2);
  }
  // מספרי התחנות ותוויות האוטובוסים מסתירים את קווי הביקוש — מסתירים אותם בזמן הזה
  for (const g of lineGroups.values()) g.children.forEach(c => { if (c.isSprite) c.visible = !on; });
  buses.hideLabels = on;
  if (!on) { controls.maxDistance = 2600; scene.fog.near = 1400; scene.fog.far = 4200; }
  if ($('[data-pane="demand"]').classList.contains('on')) renderDemand();
}
function refreshDemandView(force) {
  if (!dview.on || !demand) return;
  const h = dview.now ? hourNow() : dview.hour;
  if (+$('#dlHour').value !== h) $('#dlHour').value = h;
  $('#dlNow').classList.toggle('on', dview.now);
  $('#dlTitle').textContent = `מאיפה לאן · ${span(h * 60, h * 60 + 60)}`;
  const f = flows(h);
  if (!force && f.key === dview.key) return;
  dview.key = f.key;
  const Z = demand.Z;
  if (!maxFlow) for (const R of demand.zoneHour) for (let i = 0; i < Z; i++) for (let j = 0; j < Z; j++) if (i !== j) maxFlow = Math.max(maxFlow, R[i * Z + j]);
  const list = [];
  for (let i = 0; i < Z; i++) for (let j = 0; j < Z; j++) {
    const k = i * Z + j, r = f.pot[k];
    if (i !== j && r >= 1) list.push({ a: i, b: j, rate: r, share: f.cov[k] / r });
  }
  list.sort((a, b) => b.rate - a.rate);
  dlayer.set(list.filter(f => f.rate >= maxFlow * 0.04).slice(0, 36), maxFlow);
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
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => e.hidden = true, 3200); }

// ---------- לולאה
const clock = new THREE.Clock();
let acc = 0, fcount = 0, statT = 0;
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
    const simDt = sim.step(dt);
    buses.update(sim.lines);
    people.update(sim, city.stops, simDt, buses);
    sim.events.length = 0;
    cams.update(dt);
    updatePins();
    $('#time').textContent = clockText(sim.time);
    updateMoneyChip();
    statT += dt; if (statT > 0.4) { statT = 0; updateStats(); refreshDemandView(false); }
  }
  touch.update(dt);
  // שומרים את המצלמה מעל העיר
  const t = controls.target, H = city ? city.meta.half : [3000, 3000];
  const cx = THREE.MathUtils.clamp(t.x, -H[0], H[0]) - t.x, cz = THREE.MathUtils.clamp(t.z, -H[1], H[1]) - t.z;
  t.x += cx; t.z += cz; camera.position.x += cx; camera.position.z += cz; t.y = Math.max(0, Math.min(t.y, 20));
  controls.update();
  renderer.render(scene, camera);
  fcount++; acc += dt; G.frames++;
  if (G.manual) return;
  if (acc >= 1) {
    G.fps = fcount / acc; fcount = 0; acc = 0;
    // רזולוציה דינמית: במכשיר חלש מורידים רזולוציה כדי שהמשחק יישאר חלק
    if (G.ready && !params.has('fixedres')) {
      const pr = G.fps < 24 ? Math.max(isTouch ? 1 : 0.6, pixelRatio * 0.85) : G.fps > 50 ? Math.min(MAX_PR, pixelRatio * 1.1) : pixelRatio;
      if (Math.abs(pr - pixelRatio) > 0.01) { pixelRatio = pr; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); }
      G.pixelRatio = pixelRatio;
    }
    if (!$('#fps').hidden) $('#fps').textContent = ` · ${G.fps.toFixed(0)} fps`;
  }
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); dlayer?.resize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
frame();
init().catch(e => { console.error(e); $('#loadMsg').textContent = 'שגיאה בטעינה: ' + e.message; });
