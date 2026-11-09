// מצבי מצלמה. כל מצב הוא אובייקט עם enter/exit/update — כך אפשר להוסיף בהמשך נהג, פקח ונוסע
// בלי לגעת בשאר הקוד. כרגע פעילים: "חופשי" ו"מעקב אחרי אוטובוס".
import * as THREE from 'three';

export class CameraModes {
  constructor(camera, controls, game) {
    this.camera = camera; this.controls = controls; this.game = game;
    this.modes = {
      free: { label: 'חופשי', ready: true, enter() { }, exit() { }, update() { } },
      follow: followMode(this),
      // הכנה לשלב הבא: מבט מתוך האוטובוס/מהרחוב
      driver: { label: 'נהג', ready: false, soon: 'בקרוב: נהיגה מכיסא הנהג' },
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
