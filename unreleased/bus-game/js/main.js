// משחק הקווים — קריית מלאכי (אב-טיפוס): חיבור העולם, הסימולציה, התצוגה והממשק
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadCity, buildWorld } from './world.js';
import { RoadGraph } from './graph.js';
import { Line, loadLines, saveLines, computeRoute, routeMesh, COLORS } from './lines.js';
import { Sim, clockText } from './sim.js';
import { loadAssets, BusLayer, PeopleLayer } from './actors.js';
import { CameraModes } from './cameras.js';

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
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.target.set(0, 0, 0);

// ---------- מצב המשחק
const G = window.__game = { scene, camera, controls, renderer, fps: 0, frames: 0 };
let city, graph, sim, buses, people, stopsById, lineDefs, lines = [], cams;
const lineGroups = new Map();
let planning = null, selectedStop = null, selectedLine = null;

async function init() {
  const msg = $('#loadMsg');
  city = await loadCity('world/city.json');
  msg.textContent = 'בונה רחובות ובניינים…';
  await new Promise(r => setTimeout(r, 20));
  buildWorld(scene, city);
  graph = new RoadGraph(city);
  stopsById = new Map(city.stops.map(s => [s.id, s]));
  msg.textContent = 'טוען את האוטובוס והנוסעים…';
  const assets = params.has('placeholders') ? { bus: null, person: null, people: [] } : await loadAssets('assets/');
  buses = new BusLayer(scene, assets.bus);
  people = new PeopleLayer(scene, assets.people, graph);
  G.assets = { bus: !!assets.bus, person: !!assets.person, peopleModels: assets.people.length, crowdFromGlb: people.fromGlb };
  sim = new Sim(city.stops);
  buildStops();
  cams = new CameraModes(camera, controls, { pickBus, busObject: b => buses.objectOf(b), toast });
  buildCamButtons();
  lineDefs = loadLines();
  for (const d of lineDefs) addLine(d, false);
  bindUI(); renderLines();
  Object.assign(G, { city, graph, sim, people, lines: () => lines, stopsById, cams, planTap: id => tapStop(stopsById.get(id)), stopScreen, busScreen, startPlanning, finishPlanning, saveForm: saveLineFromForm });
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
  const sel = new Set(planning ? planning.stops : []);
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  city.stops.forEach((s, i) => {
    v.copy(pinBase[i]); v.y = 3.6 + k * 1.6;
    const r = (sel.has(s) || s === selectedStop ? 1.25 : 1) * k * 0.9;
    m.makeScale(r, r, r).setPosition(v); pins.setMatrixAt(i, m);
    pins.setColorAt(i, sel.has(s) ? PIN_SEL : s === selectedStop ? PIN_ON : used.has(s) ? PIN_USED : PIN_COL);
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
  $('#plan').hidden = false; $('#planErr').hidden = true; updatePlan();
  document.body.classList.add('planning');
  if (innerWidth <= 820) $('#panel').classList.add('min');
}
function planAdd(s) {
  const P = planning.stops;
  if (P[P.length - 1] === s) return;
  P.push(s);
  const r = computeRoute(graph, P);
  if (r.error !== undefined) {
    P.pop(); const e = $('#planErr'); e.hidden = false;
    e.textContent = 'אין דרך נסיעה לתחנה הזו מהתחנה הקודמת (רחוב חד-סטרי או מחוץ לרשת). נסו תחנה אחרת.';
    return;
  }
  $('#planErr').hidden = true;
  drawPlan(r); updatePlan();
}
function drawPlan(r) {
  if (planning.group) scene.remove(planning.group);
  planning.group = null;
  if (r && planning.stops.length) {
    planning.group = routeMesh(r.poly, planning.color, planning.stops.map(s => [s.world.x, -s.world.z]));
    scene.add(planning.group);
  }
}
function updatePlan() {
  const n = planning.stops.length;
  $('#planCount').textContent = n === 1 ? 'תחנה אחת' : `${n} תחנות`;
  $('#planDone').disabled = n < 2;
}
function cancelPlanning() {
  if (!planning) return;
  if (planning.group) scene.remove(planning.group);
  planning = null; $('#plan').hidden = true; $('#lineForm').hidden = true;
  document.body.classList.remove('planning');
}
function finishPlanning() {
  if (!planning || planning.stops.length < 2) return;
  const used = new Set(lineDefs.map(d => d.number));
  let num = 1; while (used.has(String(num))) num++;
  $('#fNum').value = num;
  const a = planning.stops[0].name, b = planning.stops[planning.stops.length - 1].name;
  $('#fName').value = `${a} — ${b}`.slice(0, 40);
  $('#fHead').value = '10';
  renderSwatches(planning.color);
  $('#lineForm').hidden = false;
  if (!isTouch) $('#fNum').focus();
}
function renderSwatches(cur) {
  const box = $('#fColors'); box.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'צבע ' + c);
    b.className = c === cur ? 'on' : ''; b.onclick = () => { planning.color = c; renderSwatches(c); drawPlan(computeRoute(graph, planning.stops)); };
    box.appendChild(b);
  }
}
function saveLineFromForm() {
  const def = {
    id: 'L' + Date.now().toString(36), number: ($('#fNum').value || '1').trim().slice(0, 4),
    name: ($('#fName').value || '').trim().slice(0, 40), color: planning.color,
    headway: +$('#fHead').value || 10, stopIds: planning.stops.map(s => s.id),
  };
  cancelPlanning();
  lineDefs.push(def); saveLines(lineDefs);
  const L = addLine(def, true);
  selectedLine = L; renderLines(); showTab('lines'); openPanel();
  toast(`קו ${def.number} יצא לדרך — אוטובוס כל ${def.headway} דקות`);
}

function addLine(def, fresh) {
  const L = new Line(def, graph, stopsById);
  if (L.error !== undefined) { console.warn('line route failed', def); return null; }
  sim.addLine(L); lines.push(L);
  const g = routeMesh(L.poly, def.color, L.stops.map(s => [s.world.x, -s.world.z]));
  lineGroups.set(def.id, g); scene.add(g);
  return L;
}
function removeLine(L) {
  sim.removeLine(L); lines = lines.filter(x => x !== L);
  scene.remove(lineGroups.get(L.id)); lineGroups.delete(L.id);
  lineDefs = lineDefs.filter(d => d.id !== L.id); saveLines(lineDefs);
  L.buses = [];
  if (selectedLine === L) selectedLine = null;
  renderLines();
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
  $('#fBack').onclick = () => { $('#lineForm').hidden = true; };
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
  cams.onChange(sync); sync('free');
}

const fmtMin = s => s < 60 ? `${Math.round(s)} שנ'` : `${(s / 60).toFixed(1)} דק'`;
function renderLines() {
  const box = $('#lineList'); box.innerHTML = '';
  $('#emptyLines').hidden = lines.length > 0;
  for (const L of lines) {
    const c = document.createElement('div'); c.className = 'lcard' + (L === selectedLine ? ' sel' : ''); c.dataset.line = L.id;
    c.innerHTML = `<div class="lhead"><span class="num" style="background:${L.color}">${esc(L.def.number)}</span>
      <div style="flex:1;min-width:0"><div class="lname">${esc(L.def.name || 'קו ' + L.def.number)}</div>
      <div class="lmeta">${L.stops.length} תחנות · ${(L.poly.length / 1000).toFixed(1)} ק"מ · כל ${L.def.headway} דק'</div></div></div>
      <div class="stats">
        <div class="stat"><b data-k="board">0</b><span>עולים</span></div>
        <div class="stat"><b data-k="alight">0</b><span>יורדים</span></div>
        <div class="stat"><b data-k="onboard">0</b><span>באוטובוסים כרגע</span></div>
        <div class="stat"><b data-k="waiting">0</b><span>ממתינים בתחנות</span></div>
        <div class="stat"><b data-k="wait">—</b><span>המתנה ממוצעת</span></div>
        <div class="stat"><b data-k="buses">0</b><span>אוטובוסים בדרך</span></div>
      </div>
      <div class="lbtns"><button data-a="follow">מעקב</button><button data-a="vis">${L.visible ? 'הסתרה' : 'הצגה'}</button><button data-a="del" class="del">מחיקה</button></div>`;
    c.onclick = e => {
      const a = e.target.dataset?.a;
      selectedLine = L;
      if (a === 'follow') { cams.modes.follow.bus = pickBus(); cams.current === 'follow' ? cams.modes.follow.enter() : cams.set('follow'); }
      else if (a === 'vis') { L.visible = !L.visible; lineGroups.get(L.id).visible = L.visible; }
      else if (a === 'del') { if (confirm(`למחוק את קו ${L.def.number}?`)) return removeLine(L); }
      renderLines();
    };
    box.appendChild(c);
  }
  updateStats();
}
function updateStats() {
  for (const L of lines) {
    const c = document.querySelector(`.lcard[data-line="${L.id}"]`); if (!c) continue;
    const set = (k, v) => { const e = c.querySelector(`[data-k="${k}"]`); if (e && e.textContent !== String(v)) e.textContent = v; };
    set('board', L.stats.board); set('alight', L.stats.alight); set('onboard', L.onboard); set('waiting', L.waiting);
    set('wait', L.stats.waitN ? fmtMin(L.avgWait) : '—');
    set('buses', L.buses.filter(b => b.state !== 'done').length);
  }
  if (selectedStop && $('[data-pane="stop"]').classList.contains('on')) renderStop();
}
function renderStop() {
  const s = selectedStop; if (!s) return;
  const sm = sim.stopSummary(s.id);
  const rows = sm.per.map(x => `<tr><td><span class="num" style="background:${x.line.color};display:inline-grid;min-width:30px;height:22px;font-size:13px">${esc(x.line.def.number)}</span> ממתינים לקו</td><td>${x.waiting}</td></tr>`).join('');
  $('#stopPane').innerHTML = `<div class="scard"><h3>${esc(s.name)}</h3><div class="code">תחנה ${esc(s.code)} · ביקוש ${Math.round(s.w * 100)}%</div>
    <table><tr><td>ממתינים עכשיו</td><td>${sm.waiting}</td></tr><tr><td>עלו כאן</td><td>${sm.board}</td></tr><tr><td>ירדו כאן</td><td>${sm.alight}</td></tr>${rows}</table>
    ${sm.per.length ? '' : '<p class="hint">אף קו לא עוצר כאן עדיין.</p>'}</div>`;
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
    buses.update(lines);
    people.update(sim, city.stops, simDt, buses);
    sim.events.length = 0;
    cams.update(dt);
    updatePins();
    $('#time').textContent = clockText(sim.time);
    statT += dt; if (statT > 0.4) { statT = 0; updateStats(); }
  }
  // שומרים את המצלמה מעל העיר
  const t = controls.target, H = city ? city.meta.half : [3000, 3000];
  t.x = THREE.MathUtils.clamp(t.x, -H[0], H[0]); t.z = THREE.MathUtils.clamp(t.z, -H[1], H[1]); t.y = Math.max(0, Math.min(t.y, 20));
  controls.update();
  renderer.render(scene, camera);
  fcount++; acc += dt; G.frames++;
  if (G.manual) return;
  if (acc >= 1) {
    G.fps = fcount / acc; fcount = 0; acc = 0;
    // רזולוציה דינמית: במכשיר חלש מורידים רזולוציה כדי שהמשחק יישאר חלק
    if (G.ready && !params.has('fixedres')) {
      const pr = G.fps < 24 ? Math.max(0.6, pixelRatio * 0.85) : G.fps > 50 ? Math.min(MAX_PR, pixelRatio * 1.1) : pixelRatio;
      if (Math.abs(pr - pixelRatio) > 0.01) { pixelRatio = pr; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); }
      G.pixelRatio = pixelRatio;
    }
    if (!$('#fps').hidden) $('#fps').textContent = ` · ${G.fps.toFixed(0)} fps`;
  }
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
frame();
init().catch(e => { console.error(e); $('#loadMsg').textContent = 'שגיאה בטעינה: ' + e.message; });
