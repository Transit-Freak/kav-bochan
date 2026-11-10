// מצבי מצלמה. כל מצב הוא אובייקט עם enter/exit/update — כך אפשר להוסיף בהמשך נהג, פקח ונוסע
// בלי לגעת בשאר הקוד. כרגע פעילים: "חופשי", "מעקב אחרי אוטובוס" ו"נהג" (מבט בלבד, עוד בלי נהיגה).
import * as THREE from 'three';
import { MIRRORS } from './driver.js';
import { lineDisplay } from './cabdetails.js';

export class CameraModes {
  constructor(camera, controls, game) {
    this.camera = camera; this.controls = controls; this.game = game;
    this.modes = {
      free: { label: 'חופשי', ready: true, enter() { }, exit() { }, update() { } },
      follow: followMode(this),
      // הכנה לשלב הבא: מבט מתוך האוטובוס/מהרחוב
      driver: driverMode(this),
      inspector: { label: 'פקח', ready: false, soon: 'בקרוב: פקח שעולה לאוטובוס' },
      passenger: { label: 'נוסע', ready: false, soon: 'בקרוב: נסיעה כנוסע' },
    };
    this.current = 'free';
    this.listeners = [];
  }
  set(id) {
    const m = this.modes[id];
    if (!m || !m.ready || id === this.current) return false;
    this.modes[this.current].exit?.();
    this.current = id; m.enter?.();
    this.listeners.forEach(f => f(id));
    return true;
  }
  update(dt) { this.modes[this.current].update?.(dt); }
  onChange(f) { this.listeners.push(f); }
}

// מבט נהג: המצלמה בגובה העיניים של הנהג היושב באוטובוס שנבחר, זזה איתו ומסתכלת קדימה דרך השמשה.
// הראש של הנהג עצמו מוסתר (שיער ועיניים), והפנים נחתכות במישור הקרוב של המצלמה — כך אין חפיפה עם הראש.
// נדנוד עדין של הראש: קדימה-אחורה לפי התאוצה, לצדדים בפניות, ורעד קטן בנסיעה. בלי OrbitControls ובלי מגע
const EYE_FALLBACK = new THREE.Vector3(0.74, 2.0, 4.62);
const lcdOff = o => o.traverse(c => { if (c.userData.lcd0) { c.material = c.userData.lcd0; delete c.userData.lcd0; } });
function driverMode(cm) {
  const P = new THREE.Vector3(), T = new THREE.Vector3(), sw = { x: 0, z: 0, v: 0, yaw: null, t: 0 };
  const alive = b => b && (b.state === 'drive' || b.state === 'dwell');
  const eyeOf = o => {
    if (o.userData.eye) return o.userData.eye;
    const eyes = o.getObjectByName('Driver_eyes'); let e = EYE_FALLBACK.clone();
    if (eyes) { eyes.geometry.computeBoundingBox(); o.updateMatrixWorld(true); e = o.worldToLocal(eyes.localToWorld(eyes.geometry.boundingBox.getCenter(new THREE.Vector3()))); }
    return (o.userData.eye = e);
  };
  const headParts = o => { const a = []; o.getObjectByName('Driver')?.traverse(c => { if (c.isMesh && /_(hair|eyes)$/.test(c.name)) a.push(c); }); return a; };
  const m = {
    label: 'נהג', ready: true, bus: null, obj: null,
    enter() {
      if (!alive(m.bus)) m.bus = alive(cm.modes.follow.bus) ? cm.modes.follow.bus : cm.game.pickBus();
      const o = m.bus && cm.game.busObject(m.bus);
      if (!o) { setTimeout(() => cm.set('free'), 0); cm.game.toast('אין אוטובוס בדרך — צרו קו קודם'); return; }
      const c = cm.camera;
      if (!m.saved) m.saved = { pos: c.position.clone(), tgt: cm.controls.target.clone(), near: c.near, far: c.far, fov: c.fov };
      m.use(o);
      cm.controls.enabled = false;
      c.near = 0.12; c.far = 3000; m.fit();
      sw.yaw = null; sw.v = m.bus.v || 0;
      cm.game.onDriver?.(true, m.bus);
    },
    use(o) {
      if (m.obj && m.obj !== o) { for (const h of headParts(m.obj)) h.visible = true; mirrors.off(m.obj); lcdOff(m.obj); }
      m.obj = o; for (const h of headParts(o)) h.visible = false; mirrors.on(o);
      o.traverse(c => { if (c.isMesh && c.material?.name === 'M_LCD') { c.userData.lcd0 = c.material; c.material = lcd.mat; } }); m.lcdT = 0;
    },
    // שדה ראייה: בטלפון לאורך — רחב יותר לגובה, כדי שיהיה מספיק לרוחב (כ-57°); לרוחב — כ-115°, והמבט נוטה מעט למטה (רואים את ההגה)
    fit() { const c = cm.camera; c.fov = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(40)) / c.aspect)), 72, 100); c.updateProjectionMatrix(); },
    exit() {
      if (m.obj) { for (const h of headParts(m.obj)) h.visible = true; mirrors.off(m.obj); lcdOff(m.obj); }
      m.obj = null;
      const c = cm.camera, s = m.saved;
      if (s) { c.near = s.near; c.far = s.far; c.fov = s.fov; c.updateProjectionMatrix(); c.position.copy(s.pos); cm.controls.target.copy(s.tgt); c.lookAt(s.tgt); }
      m.saved = null; cm.controls.enabled = true;
      cm.game.onDriver?.(false, null);
    },
    // אוטובוס אחר (מהסדרן): נשארים במבט נהג
    drive(bus) { m.bus = bus; if (cm.current === 'driver') m.enter(); else cm.set('driver'); },
    update(dt) {
      if (!alive(m.bus)) {
        // סידור עבודה (duty.js): הנסיעה הבאה — או הפסקה (נשארים במקום עד שהאוטובוס הבא יוצא)
        const nx = cm.game.nextDriverBus?.(m.bus);
        if (nx === false) return;
        if (nx) { m.bus = nx; cm.game.onDriver?.(true, m.bus); return; }
        const L = m.bus?.line, next = L?.buses.find(alive) || cm.game.pickBus();
        if (!next) { cm.set('free'); return; }
        m.bus = next; cm.game.onDriver?.(true, m.bus);
      }
      const o = cm.game.busObject(m.bus); if (!o) return;
      if (o !== m.obj) m.use(o);
      if (Math.abs(cm.camera.aspect - (m.aspect || 0)) > 1e-3) { m.aspect = cm.camera.aspect; m.fit(); }
      // נדנוד: תאוצה (מהירות האוטובוס) ופנייה (שינוי הכיוון), מוחלקים
      const yaw = o.rotation.y; if (sw.yaw == null) sw.yaw = yaw;
      const h = Math.max(1e-3, dt), v = m.bus.v || 0;
      let dy = yaw - sw.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); sw.yaw = yaw;
      const acc = THREE.MathUtils.clamp((v - sw.v) / h, -3, 3), lat = THREE.MathUtils.clamp(v * dy / h, -3, 3); sw.v = v;
      const k = Math.min(1, dt * 3);
      sw.z += (-acc * 0.012 - sw.z) * k; sw.x += (lat * 0.012 - sw.x) * k; sw.t += dt;
      const run = Math.min(1, v / 5), bob = run * 0.004 * Math.sin(sw.t * 9.1) + 0.002 * Math.sin(sw.t * 1.3);
      const e = eyeOf(o);
      o.updateMatrixWorld(true);
      // קצת מעל העיניים ומעט קדימה — כך רואים את השעונים מעל ההגה
      P.set(e.x + sw.x + 0.003 * Math.sin(sw.t * 0.7), e.y + 0.05 + bob, e.z + 0.07 + sw.z);
      T.set(e.x + sw.x * 0.3, e.y + 0.05 - (cm.camera.aspect > 1 ? 2.1 : 1.25), e.z + 9);
      o.localToWorld(P); o.localToWorld(T);
      cm.camera.position.copy(P); cm.camera.lookAt(T);
      cm.controls.target.copy(T);
      mirrors.render(o);
      if ((m.lcdT = (m.lcdT || 0) - dt) <= 0) { m.lcdT = 0.5; const L = m.bus.line, S = L.stops[Math.min(L.stops.length - 1, m.bus.next)]; lcd.draw(L.def.number, L.color, L.stops[L.stops.length - 1]?.name, S?.name, cm.game.clock?.()); }
    },
  };
  const mirrors = liveMirrors(cm), lcd = lineDisplay();
  return m;
}
// מראות חיות רק לאוטובוס שנוהגים בו: לכל מראה מצלמה קטנה שמסתכלת אחורה לאורך הדופן, אל טקסטורה קטנה (96×154),
// הפוכה לרוחב כמו מראה. כל פריים מתעדכנת מראה אחת לסירוגין, ובפריים השלישי אף אחת — זול גם בטלפון.
// הצללים לא מחושבים מחדש בשבילן
function liveMirrors(cm) {
  const R = cm.game.renderer, S = cm.game.scene; let n = 0;
  const side = {};
  for (const k of ['L', 'R']) {
    const rt = new THREE.WebGLRenderTarget(96, 154);
    rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.repeat.set(-1, 1); rt.texture.offset.set(1, 0);
    const cam = new THREE.PerspectiveCamera(26, MIRRORS.w / MIRRORS.h, 0.5, 600);
    side[k] = { rt, cam, mat: new THREE.MeshBasicMaterial({ map: rt.texture, color: 0xe8eef2 }), saved: null };
  }
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  return {
    // השמשה: מבפנים שקופה יותר (החומר משותף לכל האוטובוסים — חוזר בסוף)
    on(o) { o.traverse(c => { if (c.name === 'Cab_Windshield' && c.material.userData.op0 == null) { c.material.userData.op0 = c.material.opacity; c.material.opacity = 0.12; } });
      for (const k of ['L', 'R']) { const f = o.getObjectByName('Mirror_' + k); if (f && f.material !== side[k].mat) { side[k].saved = f.material; f.material = side[k].mat; } } },
    off(o) { o.traverse(c => { if (c.name === 'Cab_Windshield' && c.material.userData.op0 != null) { c.material.opacity = c.material.userData.op0; delete c.material.userData.op0; } });
      for (const k of ['L', 'R']) { const f = o.getObjectByName('Mirror_' + k); if (f && side[k].saved) f.material = side[k].saved; } },
    render(o) {
      if (!R || !S) return;
      const k = ['L', 'R', null][n++ % 3]; if (!k) return;
      const s = side[k], x = MIRRORS[k].x, sd = Math.sign(x);
      // מהמראה אחורה, קצת החוצה מהדופן — רואים את צד האוטובוס בשולי המראה ואת הכביש מאחור
      P.set(x, MIRRORS.y, MIRRORS.z); T.set(x + sd * 1.2, 1.2, MIRRORS.z - 20);
      o.localToWorld(P); o.localToWorld(T); s.cam.position.copy(P); s.cam.lookAt(T); s.cam.updateMatrixWorld();
      const auto = R.shadowMap.autoUpdate, prev = R.getRenderTarget();
      R.shadowMap.autoUpdate = false; R.setRenderTarget(s.rt); R.render(S, s.cam); R.setRenderTarget(prev); R.shadowMap.autoUpdate = auto;
    },
  };
}

function followMode(cm) {
  const last = new THREE.Vector3();
  const m = {
    label: 'מעקב אחרי אוטובוס', ready: true, bus: null,
    enter() {
      if (!m.bus || m.bus.state === 'gone') m.bus = cm.game.pickBus();
      if (!m.bus) { setTimeout(() => cm.set('free'), 0); cm.game.toast('אין אוטובוס בדרך — צרו קו קודם'); return; }
      const o = cm.game.busObject(m.bus);
      if (o) {
        last.copy(o.position);
        // מבט מאחור ומלמעלה
        const back = new THREE.Vector3(0, 0, -1).applyQuaternion(o.quaternion);
        cm.camera.position.copy(o.position).addScaledVector(back, 38).add(new THREE.Vector3(0, 24, 0));
        cm.controls.target.copy(o.position).setY(1.5);
      }
    },
    exit() { },
    next() {
      m.bus = cm.game.pickBus(m.bus);
      if (cm.current === 'follow') m.enter(); else cm.set('follow');
    },
    update() {
      if (!m.bus || m.bus.state === 'gone') {
        m.bus = cm.game.pickBus(m.bus);
        if (!m.bus) { cm.set('free'); return; }
        m.enter(); return;
      }
      const o = cm.game.busObject(m.bus); if (!o) return;
      const d = new THREE.Vector3().subVectors(o.position, last);
      if (d.length() > 60) { m.enter(); return; }
      // המצלמה זזה עם האוטובוס; המשתמש עדיין יכול לסובב ולהתקרב
      cm.camera.position.add(d); cm.controls.target.add(d); last.copy(o.position);
    },
  };
  return m;
}
