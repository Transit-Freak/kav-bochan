// שליטה במגע בסגנון מפות: אצבע אחת גוררת (הנקודה נשארת מתחת לאצבע), שתי אצבעות —
// צביטה לזום, סיבוב האצבעות מסובב את המפה, גרירה של שתיהן למעלה/למטה מטה את המבט.
import * as THREE from 'three';

export function mapTouch(canvas, camera, controls, opts = {}) {
  const minDist = opts.minDist ?? controls.minDistance, maxDist = opts.maxDist ?? controls.maxDistance;
  const minPolar = 0.05, maxPolar = controls.maxPolarAngle;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pts = new Map();
  let prev = null, start = null, mode = null, vel = new THREE.Vector3(), lastT = 0;

  function ground(x, y, out) {
    const r = canvas.getBoundingClientRect();
    ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // לא לתפוס נקודות רחוקות מדי ליד האופק
    if (ray.ray.direction.y > -0.04) return null;
    return ray.ray.intersectPlane(plane, out);
  }
  function snapshot() {
    const a = [...pts.values()];
    if (a.length === 1) return { n: 1, x: a[0].x, y: a[0].y };
    const [p, q] = a;
    return { n: 2, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, d: Math.hypot(q.x - p.x, q.y - p.y),
      ang: Math.atan2(q.y - p.y, q.x - p.x), p: { ...p }, q: { ...q } };
  }
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), off = new THREE.Vector3();
  function shift(v) { camera.position.add(v); controls.target.add(v); }
  function panTo(fromX, fromY, toX, toY) {
    if (!ground(fromX, fromY, tmpA) || !ground(toX, toY, tmpB)) return null;
    const d = tmpA.sub(tmpB); shift(d); return d;
  }
  function rotateAround(c, a) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.position.sub(c).applyQuaternion(q).add(c);
    controls.target.sub(c).applyQuaternion(q).add(c);
  }
  function zoomAround(c, f) {
    const dist = camera.position.distanceTo(controls.target);
    f = THREE.MathUtils.clamp(dist * f, minDist, maxDist) / dist;
    camera.position.sub(c).multiplyScalar(f).add(c);
    controls.target.sub(c).multiplyScalar(f).add(c);
    controls.target.y = 0;
  }
  function tilt(dy) {
    off.subVectors(camera.position, controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    s.phi = THREE.MathUtils.clamp(s.phi - dy * 0.006, minPolar, maxPolar);
    off.setFromSpherical(s); camera.position.copy(controls.target).add(off);
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vel.set(0, 0, 0); prev = start = snapshot(); mode = null;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size > 2) return;
    const cur = snapshot();
    if (!prev || prev.n !== cur.n) { prev = start = cur; mode = null; return; }
    if (cur.n === 1) {
      const d = panTo(prev.x, prev.y, cur.x, cur.y);
      const now = performance.now(), dt = Math.max(1, now - lastT) / 1000; lastT = now;
      if (d) vel.copy(d).divideScalar(dt).multiplyScalar(0.8).add(vel.multiplyScalar(0.2));
    } else {
      // סוג המחווה נקבע פעם אחת בתחילתה: שתי אצבעות שזזות יחד למעלה/למטה = הטיה, אחרת מפה
      if (!mode) {
        const dyP = cur.p.y - start.p.y, dyQ = cur.q.y - start.q.y, dxP = cur.p.x - start.p.x, dxQ = cur.q.x - start.q.x;
        const mv = Math.max(Math.hypot(dxP, dyP), Math.hypot(dxQ, dyQ));
        if (mv < 12) { prev = cur; return; }
        mode = dyP * dyQ > 0 && Math.abs(dyP) > 1.5 * Math.abs(dxP) && Math.abs(dyQ) > 1.5 * Math.abs(dxQ)
          && Math.abs(cur.d - start.d) < 0.4 * (Math.abs(dyP) + Math.abs(dyQ)) / 2 ? 'tilt' : 'map';
        prev = start;
      }
      const same = mode === 'tilt';
      if (same) tilt(cur.y - prev.y);
      else {
        const c = ground(cur.x, cur.y, new THREE.Vector3());
        if (c) {
          let da = cur.ang - prev.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
          rotateAround(c, da);
          if (cur.d > 10 && prev.d > 10) zoomAround(c, prev.d / cur.d);
        }
        panTo(prev.x, prev.y, cur.x, cur.y);
      }
      vel.set(0, 0, 0);
    }
    prev = cur;
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    prev = start = pts.size ? snapshot() : null; mode = null;
    if (pts.size || performance.now() - lastT > 80) vel.set(0, 0, 0);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  return {
    // החלקה קטנה אחרי שמרימים את האצבע
    update(dt) {
      if (pts.size || vel.lengthSq() < 1) return;
      shift(tmpA.copy(vel).multiplyScalar(dt));
      vel.multiplyScalar(Math.exp(-dt * 5));
    },
  };
}
