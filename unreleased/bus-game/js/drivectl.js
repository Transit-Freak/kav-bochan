// נהיגה במבט נהג: גז ובלם (האוטובוס נשאר במסלול ובנתיב — הנהג קובע מהירות ועצירות), דלת קדמית ואחורית לחוד,
// כריעה, איתות שמאלה וימינה, מהבהבים, צופר, פנסים, מגבים, הודעת תחנה, ונורת "עצירה" כשנוסע לחץ.
// במגע (כפתורים על המסך ודוושות), במקלדת, ובלחיצה על לוח המתגים שבתא. בלי לגעת — האוטובוס נוהג לבד, כרגיל.
// במשחק עצמו (sim.js) רק b.ctl: { gas, brake, manual, front, mid, kneel, warn } — כל השאר תצוגה.
import * as THREE from 'three';
import { switchPlate, switchAt } from './cabdetails.js';

const KEYS = { ArrowUp: 'gas', w: 'gas', ArrowDown: 'brake', s: 'brake', ' ': 'brake' };
const TAPS = { ArrowLeft: 'left', ArrowRight: 'right', f: 'front', r: 'mid', k: 'kneel', h: 'horn', l: 'lights', p: 'wipers', z: 'hazard', n: 'announce' };
// באוטובוס (צד הנהג ‎+X): פנסי איתות מלפנים ומאחור, פנסים ראשיים, אורות בלם
const LAMP = { front: 6.062, rear: -6.045 };            // פני החזית והאחור בדגם (הפנסים בדגם: איתות ‎x 1.11–1.24, ‎y ≈ 1; פנסים ראשיים ‎y 0.82)

export class DriveControls {
  constructor(g) {          // { canvas, camera, toast, sim, clock, ui: {root, hud} }
    this.g = g; this.st = { gas: false, brake: false, blink: 0, hazard: false, lights: false, wipers: false, kneel: false };
    // ניקוד: עצירה בזמן בתחנה (+10, באיחור +4), בלימה חדה (‎-3), אזהרה — למשל נסיעה עם דלת פתוחה (‎-5)
    this.score = { pts: 0, stops: 0, ontime: 0, harsh: 0, warns: 0 };
    this.held = new Set(); this.t = 0; this.wipe = 0; this.plate = switchPlate(); this.lastWarn = 0;
    this.bindUI(); this.bindKeys(); this.bindCanvas();
  }
  get on() { return !!this.bus; }

  attach(bus, obj) {
    if (this.bus === bus && this.obj === obj) return;
    this.detach(true);
    this.bus = bus; this.obj = obj;
    bus.ctl = { gas: false, brake: false, manual: false, front: false, mid: false, kneel: this.st.kneel, warn: t => this.warn(t) };
    this.lamps = buildLamps(); obj.add(this.lamps.group);
    const p = obj.getObjectByName('CabSwitchPlate'); if (p) { this.plateMesh = p; this.plate0 = p.material; p.material = this.plate.mat; }
    this.g.ui.root.hidden = false; this.sync();
  }
  detach(keepUI) {
    const b = this.bus;
    if (b) {
      // חזרה לנהיגה אוטומטית: הדלתות שוב יחד (אם פתוחות — האוטובוס סוגר אותן לבד), בלי כריעה
      if (b.dF != null || b.dM != null) b.door = Math.max(b.dF ?? 0, b.dM ?? 0);
      b.dF = b.dM = undefined; b.ctl = null;
    }
    if (this.lamps) this.lamps.group.parent?.remove(this.lamps.group);
    if (this.plateMesh) this.plateMesh.material = this.plate0;
    this.bus = this.obj = this.lamps = this.plateMesh = null;
    this.held.clear(); this.st.gas = this.st.brake = false;
    if (!keepUI) this.g.ui.root.hidden = true;
  }

  // ---------- פעולות
  act(id) {
    const b = this.bus; if (!b) return;
    const c = b.ctl, S = this.st, dwell = b.state === 'dwell';
    switch (id) {
      case 'front': case 'mid':
        if (!dwell) { this.warn('אפשר לפתוח דלתות רק כשעומדים בתחנה'); break; }
        if (!c.manual) { c.manual = true; c.front = c.mid = b.door >= 0.5; }
        c[id] = !c[id]; break;
      case 'kneel': S.kneel = c.kneel = !S.kneel; if (S.kneel && b.v > 0.1) this.warn('הכריעה תופעל כשהאוטובוס יעמוד'); break;
      case 'left': case 'right': { const d = id === 'left' ? 1 : -1; S.blink = S.blink === d ? 0 : d; break; }
      case 'hazard': S.hazard = !S.hazard; break;
      case 'lights': S.lights = !S.lights; break;
      case 'wipers': S.wipers = !S.wipers; break;
      case 'horn': horn(); break;
      case 'announce': this.announce(); break;
    }
    this.sync();
  }
  announce() {
    const b = this.bus, L = b.line, S = L.stops[Math.min(L.stops.length - 1, b.next)];
    const txt = S ? `${b.state === 'dwell' ? 'תחנה' : 'התחנה הבאה'}: ${S.name}` : 'תחנה אחרונה';
    chime(); this.g.toast(`📢 ${txt}`);
    try { const u = new SpeechSynthesisUtterance(txt); u.lang = 'he-IL'; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { }
  }
  warn(t) { const now = performance.now(); if (now - this.lastWarn < 2500) return; this.lastWarn = now; this.g.toast(`⚠ ${t}`); this.score.warns++; this.score.pts -= 5; }
  setPedal(p, v) {
    if (p === 'brake' && v && !this.st.brake && this.bus && this.bus.v > 11) { this.score.harsh++; this.score.pts -= 3; }
    this.st[p] = v; if (this.bus) { this.bus.ctl.gas = this.st.gas; this.bus.ctl.brake = this.st.brake; } this.sync(); }

  // ---------- ממשק: כפתורים, דוושות, מקלדת, ולוח המתגים בתא
  bindUI() {
    const root = this.g.ui.root;
    root.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); this.act(b.dataset.c); }));
    root.querySelectorAll('[data-p]').forEach(b => {
      const p = b.dataset.p, on = e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); this.setPedal(p, true); }, off = () => this.setPedal(p, false);
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
  }
  bindKeys() {
    const typing = e => /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || '');
    addEventListener('keydown', e => {
      if (!this.bus || typing(e)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYS[k]) { e.preventDefault(); if (!this.held.has(k)) { this.held.add(k); this.setPedal(KEYS[k], true); } }
      else if (TAPS[k] && !e.repeat) { e.preventDefault(); this.act(TAPS[k]); }
    });
    addEventListener('keyup', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYS[k] && this.held.delete(k)) { const p = KEYS[k]; if (![...this.held].some(h => KEYS[h] === p)) this.setPedal(p, false); }
    });
    addEventListener('blur', () => { this.held.clear(); if (this.bus) { this.setPedal('gas', false); this.setPedal('brake', false); } });
  }
  bindCanvas() {
    const cv = this.g.canvas, rc = new THREE.Raycaster(), v = new THREE.Vector2(); let down = null;
    cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', e => {
      if (!this.plateMesh || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const r = cv.getBoundingClientRect(); v.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(v, this.g.camera); const h = rc.intersectObject(this.plateMesh, false)[0]; if (!h) return;
      const p = this.obj.worldToLocal(h.point.clone()), sw = switchAt(p.x, p.z); if (sw) this.act(sw[0]);
    });
  }

  // ---------- כל פריים
  update(dt) {
    const b = this.bus; if (!b) return;
    this.t += dt;
    if (b.state === 'dwell' && this._prev === 'drive') { const S = this.score, ok = Math.abs(b.delay || 0) < 120; S.stops++; if (ok) S.ontime++; S.pts += ok ? 10 : 4; }
    this._prev = b.state;
    this.g.ui.score.textContent = `ניקוד ${this.score.pts}`;
    const S = this.st, c = b.ctl, blinkOn = Math.floor(this.t * 2.6) % 2 === 0;
    const L = S.hazard || S.blink === 1, R = S.hazard || S.blink === -1;
    const Lm = this.lamps;
    Lm.blinkL.forEach(m => { m.visible = L && blinkOn; }); Lm.blinkR.forEach(m => { m.visible = R && blinkOn; });
    Lm.head.forEach(m => { m.visible = S.lights; }); Lm.brake.forEach(m => { m.visible = S.brake || (b.v < 0.05 && b.state !== 'done'); });
    // מגבים: הלוך וחזור כ-1.1 שניות, נחים למטה
    if (S.wipers || this.wipe % 1 > 0.02) this.wipe += dt / 1.1; else this.wipe = 0;
    // במנוחה — שוכבים לאורך תחתית השמשה (מצביעים לצד הנהג), ובתנועה עולים כמעט עד האנך
    const a = Math.sin(Math.PI * (this.wipe % 1)) * 1.4;
    Lm.wipers.forEach(w => { w.rotation.z = -1.5 + a; });
    // נורת "עצירה": נוסע לחץ (יורד בתחנה הבאה)
    const req = b.state === 'drive' && b.pax.some(p => p.to === b.next);
    Lm.dashL.visible = L && blinkOn; Lm.dashR.visible = R && blinkOn; Lm.dashStop.visible = req;
    const ui = this.g.ui;
    ui.stop.classList.toggle('on', req);
    ui.root.querySelector('[data-c="left"]').classList.toggle('blink', L && blinkOn);
    ui.root.querySelector('[data-c="right"]').classList.toggle('blink', R && blinkOn);
    if (c.manual !== this._man || b.state !== this._st) this.sync();
    this.plate.draw({ front: b.state === 'dwell' && (c.manual ? c.front : b.door > 0.5), mid: b.state === 'dwell' && (c.manual ? c.mid : b.door > 0.5), kneel: S.kneel, lights: S.lights, wipers: S.wipers, hazard: S.hazard && blinkOn });
  }
  // מצב הכפתורים על המסך
  sync() {
    const b = this.bus, ui = this.g.ui; if (!b) return;
    const c = b.ctl, S = this.st, set = (id, on) => ui.root.querySelector(`[data-c="${id}"]`)?.classList.toggle('on', !!on);
    this._man = c.manual; this._st = b.state;
    set('front', b.state === 'dwell' && (c.manual ? c.front : b.door > 0.5)); set('mid', b.state === 'dwell' && (c.manual ? c.mid : b.door > 0.5));
    set('kneel', S.kneel); set('hazard', S.hazard); set('lights', S.lights); set('wipers', S.wipers);
    set('left', S.blink === 1); set('right', S.blink === -1);
    ui.root.querySelector('[data-p="gas"]').classList.toggle('on', S.gas); ui.root.querySelector('[data-p="brake"]').classList.toggle('on', S.brake);
  }
}

// ---------- פנסים, מגבים ונורות בלוח — רק לאוטובוס שנוהגים בו (נוספים כשנכנסים ונמחקים ביציאה)
function buildLamps() {
  const group = new THREE.Group(); group.name = 'DriveLamps';
  const mk = (color, w, h, x, y, z, ry = 0) => { const m = new THREE.Mesh(h ? new THREE.PlaneGeometry(w, h) : new THREE.CircleGeometry(w, 20), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = ry; m.visible = false; group.add(m); return m; };
  // איתות: שמאל = ‎+X (צד הנהג), ימין = ‎-X (צד הדלתות); מלפנים ומאחור, ועוד אחד בצד ליד הדלת הקדמית
  const amber = 0xffa31a;
  const side = sd => [mk(amber, 0.13, 0.06, sd * 1.175, 0.99, LAMP.front), mk(amber, 0.15, 0.12, sd * 1.155, 1.0, LAMP.rear, Math.PI), mk(amber, 0.08, 0.04, sd * 1.262, 1.1, 5.4, sd * Math.PI / 2)];
  const blinkL = side(1), blinkR = side(-1);
  const head = [0.775, 1.0, -0.775, -1.0].map(x => mk(0xfffbe8, 0.058, 0, x, 0.815, LAMP.front));
  const brake = [1, -1].map(sd => mk(0xff2222, 0.15, 0.22, sd * 1.155, 1.33, LAMP.rear, Math.PI));
  // מגבים: להב שחור על השמשה, ציר בתחתית
  const wipers = [0.42, -0.38].map(x => { const p = new THREE.Group(); p.position.set(x, 1.29, 6.1);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.78, 0.012), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }));
    blade.position.y = 0.39; p.add(blade); p.rotation.x = -0.08; group.add(p); return p; });

  // בלוח השעונים: חיצי איתות ירוקים משני צדי השעונים, ונורת "עצירה" אדומה
  const dashL = mk(0x22c55e, 0.035, 0.03, 0.97, 1.33, 5.212, Math.PI), dashR = mk(0x22c55e, 0.035, 0.03, 0.45, 1.33, 5.212, Math.PI);
  const dashStop = mk(0xff2b2b, 0.05, 0.022, 0.71, 1.415, 5.235, Math.PI);
  return { group, blinkL, blinkR, head, brake, wipers, dashL, dashR, dashStop };
}

// ---------- צלילים (WebAudio, רק אחרי לחיצה של המשתמש)
let AC = null;
const ctx = () => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch { AC = null; } return AC; };
function horn() {
  const a = ctx(); if (!a) return; const t = a.currentTime, g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.03); g.gain.setValueAtTime(0.18, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 0.6); g.connect(a.destination);
  for (const f of [349, 440]) { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.62); }
}
function chime() {
  const a = ctx(); if (!a) return; const t = a.currentTime;
  [[659, 0], [523, 0.32]].forEach(([f, d]) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.16, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.9); o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + 0.95); });
}
