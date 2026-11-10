// מבט פקח (תפקיד "פקח"): עולים לאוטובוס בדלת הקדמית ובודקים כרטיסים בגוף ראשון.
// המצלמה בגובה העיניים (1.65 מ' מעל הרצפה) ונעה רק לאורך מסלול קבוע במעבר (קו האמצע — לא דרך עמודים ומושבים):
// גרירה למעלה/למטה או ▲▼ — קדימה ואחורה; גרירה לצדדים — מבט ימינה ושמאלה. רואים רק יד שמחזיקה את מכשיר הרב-קו.
// הנוסעים יושבים במקומם (PeopleLayer.onboard). הקשה על נוסע עד 2.5 מ' — המכשיר מצפצף, ומעל הראש ✓ (יש כרטיס) או ✗ (אין —
// לפי ההתחמקות בסימולציה, p.noTicket). בלי כרטיס: "קנס" או "אזהרה"; המכשיר מראה אם הנוסע כבר קיבל אזהרה (נשמר בשמירה,
// לפי "אדם" — מוצא, יעד וסוג נוסע — כדי שאותו נוסע יחזור בימים אחרים). ניקוד: נבדק +1, תפיסה +5, החלטה נכונה (אזהרה לראשונה,
// קנס לחוזר) +10, השנייה +3 (אזהרה שנייה — −5). בתחנה הבאה — סיכום, וירידה או המשך.
import * as THREE from 'three';
import { FINE } from './ops.js';
import { dayOf } from './fleet.js';

const FLOOR = 0.675, EYE = FLOOR + 1.65;
// המעבר: מהדלת הקדמית, ליד המתקף, ואז לאורך האמצע עד המושבים האחרונים
const PATH = [[-0.95, 5.15], [-0.3, 4.98], [0, 4.3], [0, -4.9]];       // עוקף את העמוד המעוקל שליד הדלת (z ≈ 4.5) ואת המתקף
// המושבים (מתוך ידיות האחיזה בדגם: מושב מול כל משענת, פונה קדימה) וכמה מקומות עמידה ליד הדלת האמצעית
const ROWS = [3.7, 2.9, 2.1, 1.3, -1.9, -2.7, -3.5, -4.3, -5.1], SIDES = { 2.9: [-1] };
const SEATS = ROWS.flatMap(z => [0.95, 0.5, -0.5, -0.95].filter(x => !SIDES[z] || SIDES[z].includes(Math.sign(x))).map(x => [x, FLOOR + 0.455, z + 0.16]));
const STANDS = [[-0.8, 0, 0.35, -Math.PI / 2], [-0.85, 0, -0.25, -Math.PI / 2], [0.75, 0, -0.1, Math.PI / 2], [0.8, 0, 0.45, Math.PI / 2]];
const hash = i => { const x = Math.sin(i * 77.7 + 3.1) * 43758.5453; return x - Math.floor(x); };
const day2date = d => { const t = new Date(2026, 10, 1 + (d - 1)); return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}`; };
export const personKey = p => (p.o >= 0 && p.d >= 0 ? `${p.o}-${p.d}-${p.id % 3}` : `x${p.id}`);

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
    const seatOf = id => { if (!seat.has(id)) { const used = new Set(seat.values()); let k = Math.floor(hash(id) * SEATS.length), n = 0; while (used.has(k) && n++ < SEATS.length) k = (k + 1) % SEATS.length; seat.set(id, used.size >= SEATS.length ? -1 : k); } return seat.get(id); };
    const standOf = id => { if (!stand.has(id)) { const used = new Set(stand.values()); let j = 0; while (used.has(j)) j++; stand.set(id, j < STANDS.length ? j : -1); } return stand.get(id); };
    this.g.people.onboard = { bus, obj: o, seats: SEATS, stands: STANDS, floor: FLOOR, seatOf, standOf };
    const c = this.g.camera;
    this.saved = { near: c.near, far: c.far, fov: c.fov };
    c.near = 0.05; c.far = 2500; c.fov = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(42)) / c.aspect)), 70, 100); c.updateProjectionMatrix();
    this.g.scene.add(c); c.add(this.reader.group); this.reader.show('רב-קו · מוכן לבדיקה', 'הקישו על נוסע', null);
    this.g.ui.root.hidden = false; this.render(); return true;
  }
  exit() {
    if (!this.bus) return;
    for (const sp of this.icons.values()) sp.parent?.remove(sp); this.icons.clear();
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
  get len() { let L = 0; for (let i = 0; i + 1 < PATH.length; i++) L += Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]); return L; }
  update(dt) {
    const b = this.bus; if (!b) return;
    const o = this.g.busObject(b);
    if (!o || b.state === 'done' || b.state === 'gone') { this.summary(true); return; }
    this.obj = o; this.g.people.onboard.obj = o;
    // תנועה: ▲▼ (לחיצה ארוכה) או גרירה — חלק, עם תאוצה קטנה
    const want = (this.hold || 0) * 1.3;
    this.v += (want - this.v) * Math.min(1, dt * 6);
    this.s = THREE.MathUtils.clamp(this.s + this.v * dt, 0, this.len);
    const P = this.pathAt(this.s), A = this.pathAt(Math.min(this.len, this.s + 0.3)), dir = A.clone().sub(P); if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    const base = Math.atan2(dir.x, dir.z) + (this.s < 0.4 ? 0 : 0), yaw = base + this.yaw;
    o.updateMatrixWorld(true);
    const c = this.g.camera, T = P.clone().add(new THREE.Vector3(Math.sin(yaw), -0.28, Math.cos(yaw)));
    c.position.copy(o.localToWorld(P.clone())); c.lookAt(o.localToWorld(T)); c.updateMatrixWorld(true);
    // הסמלים מעל הראש של מי שנבדק — עוקבים אחרי המקום שלו
    for (const [pid, sp] of this.icons) { const h = this.g.people.onboardPos?.get(pid); if (!h || !b.pax.some(p => p.id === pid)) { sp.parent?.remove(sp); this.icons.delete(pid); continue; } sp.position.copy(h).add(new THREE.Vector3(0, 0.32, 0)); }
    // תחנה: סיכום (פעם אחת לכל תחנה)
    if (b.state === 'dwell' && this.prevState === 'drive' && this.stats.checked > this.sumAt) this.summary(false);
    if (this.prevState !== b.state) this.prevState = b.state;
    this.render();
  }
  // הקשה על המסך: הנוסע הקרוב ביותר לנקודה (עד 2.5 מ')
  tap(x, y) {
    if (!this.bus || !this.g.ui.decide.hidden || !this.g.ui.sum.hidden) return;
    const r = this.g.canvas.getBoundingClientRect(), c = this.g.camera, cam = c.position;
    let best = null, bd = 70;
    for (const [pid, h] of this.g.people.onboardPos || []) {
      if (h.distanceTo(cam) > 2.5) continue;
      const v = h.clone().add(new THREE.Vector3(0, -0.25, 0)).project(c); if (v.z > 1) continue;
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height, d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = pid; }
    }
    if (best == null) { const near = [...(this.g.people.onboardPos || []).values()].some(h => h.distanceTo(cam) <= 2.5); if (!near) this.g.toast('אין נוסע קרוב — התקרבו (▲▼)'); return; }
    this.check(best);
  }
  check(pid) {
    const p = this.bus.pax.find(q => q.id === pid); if (!p) return;
    if (p.checked) { this.reader.show(p.noTicketSeen ? '✗ נבדק — בלי כרטיס' : '✓ כבר נבדק', '', p.noTicketSeen ? 'bad' : 'ok'); return; }
    p.checked = true; this.stats.checked++; this.stats.pts += 1; beep(!p.noTicket);
    if (!p.noTicket) { this.reader.show('✓ כרטיס בתוקף', 'רב-קו · חוזה פעיל', 'ok'); this.icon(pid, true); this.render(); return; }
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
  const dev = new THREE.Group(); dev.position.set(0.085, -0.13, -0.3); dev.rotation.set(-0.55, -0.12, 0.05); group.add(dev);
  dev.add(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.15, 0.022), black));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.056), screen); scr.position.set(0, 0.035, 0.0115); dev.add(scr);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), new THREE.MeshBasicMaterial({ color: 0x1e3a8a })); pad.position.set(0, -0.035, 0.0115); dev.add(pad);
  // יד: כף, ארבע אצבעות שעוטפות את המכשיר מהצד, ואגודל מקדימה
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.07), skin); palm.position.set(0.055, -0.02, -0.01); dev.add(palm);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.035, 4, 8), skin); f.rotation.z = Math.PI / 2; f.position.set(0.035, -0.055 + i * 0.022, -0.016); dev.add(f); }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.03, 4, 8), skin); th.rotation.set(0, 0, 0.9); th.position.set(0.04, 0.0, 0.016); dev.add(th);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 4, 10), skin); arm.position.set(0.1, -0.08, 0.07); arm.rotation.set(1.1, 0, -0.35); dev.add(arm);
  for (const m of group.children) m.renderOrder = 10;
  group.traverse(m => { if (m.isMesh) { m.frustumCulled = false; m.renderOrder = 10; } });
  const show = (a, b, kind) => {
    const x = c.getContext('2d'); x.fillStyle = kind === 'ok' ? '#064e3b' : kind === 'bad' ? '#7f1d1d' : kind === 'warn' ? '#78350f' : '#0b1f3a'; x.fillRect(0, 0, 256, 200);
    x.direction = 'rtl'; x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '700 30px Heebo, Arial'; x.fillText(a, 128, 70);
    x.font = '500 22px Heebo, Arial'; x.fillStyle = '#e2e8f0'; x.fillText(b || '', 128, 128); tex.needsUpdate = true;
  };
  return { group, show };
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
export { PATH as INSP_PATH, EYE as INSP_EYE };
