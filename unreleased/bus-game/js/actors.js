// התצוגה של האוטובוסים והאנשים. נכסים מ-assets/*.glb (ייצוא מ-Blender); אם חסרים — דגמים פשוטים (placeholder)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { labelSprite } from './lines.js';
import { BUS } from './sim.js';

export async function loadAssets(base) {
  const loader = new GLTFLoader();
  const get = url => new Promise(res => loader.load(url, g => res(g), undefined, () => res(null)));
  const [bus, person] = await Promise.all([get(base + 'bus.glb'), get(base + 'person.glb')]);
  return { bus, person };
}

// ---------- מיקום האוטובוס על הקו: s = מקום הדלת הקדמית; סרן קדמי 1.8 מ' מאחוריה, סרן אחורי 7.75 מ'
const FRONT_AXLE = 1.8, REAR_AXLE = 7.75, REAR_TO_CENTER = 2.6;
function atExt(poly, s, out) {
  if (s >= 0 && s <= poly.length) return poly.at(s, out);
  const P = poly.pts, n = P.length;
  const [a, b] = s < 0 ? [P[0], P[1]] : [P[n - 2], P[n - 1]];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const base = s < 0 ? P[0] : P[n - 1], d = s < 0 ? s : s - poly.length;
  out[0] = base[0] + dx / L * d; out[1] = base[1] + dy / L * d; return out;
}
export function busPose(poly, s) {
  const f = atExt(poly, s - FRONT_AXLE, [0, 0]), r = atExt(poly, s - REAR_AXLE, [0, 0]);
  const dx = f[0] - r[0], dy = f[1] - r[1], L = Math.hypot(dx, dy) || 1;
  return { x: r[0] + dx / L * REAR_TO_CENTER, y: r[1] + dy / L * REAR_TO_CENTER, yaw: Math.atan2(dx / L, -dy / L), dir: [dx / L, dy / L] };
}

// ---------- אוטובוס פשוט (אם bus.glb לא נטען)
function placeholderBus() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f4f6 }), dark = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.55, 2.85, 12), white); body.position.y = 0.3 + 1.425; g.add(body);
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.58, 1.2, 10.6), dark); win.position.set(0, 1.9, -0.3); g.add(win);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.05), dark); wind.position.set(0, 1.8, 6.01); g.add(wind);
  for (const z of [3.35, -2.6]) for (const x of [-1.15, 1.15]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14).rotateZ(Math.PI / 2), dark); w.position.set(x, 0.5, z); g.add(w);
  }
  const glass = new THREE.MeshLambertMaterial({ color: 0x334155 });
  for (const [nm, zc] of [['Front', 5.15], ['Mid', 0.025]]) for (const k of [0, 1]) {
    const e = new THREE.Group(); e.name = `Door_${nm}${k}`; e.position.set(-1.245, 1.54, zc + (k ? -0.31 : 0.31));
    e.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.38, 0.58), glass)); g.add(e);
  }
  for (const [nm, zc] of [['Front', 5.15], ['Mid', 0.025]]) { const a = new THREE.Object3D(); a.name = `Anchor_Door${nm}`; a.position.set(-1.875, 0, zc); g.add(a); }
  return g;
}

export class BusLayer {
  constructor(scene, asset) {
    this.scene = scene; this.asset = asset; this.map = new Map();
    this.group = new THREE.Group(); this.group.name = 'buses'; scene.add(this.group);
    this.isPlaceholder = !asset;
  }
  make(bus) {
    let obj, mixer = null, action = null;
    if (this.asset) {
      if (!this.fixed) {   // בלי מפת סביבה, חומר מתכתי נראה שחור — מרככים פעם אחת את החומרים המשותפים
        this.asset.scene.traverse(o => { if (o.isMesh && o.material?.isMeshStandardMaterial) {
          const m = o.material; if (m.metalness > 0.2) { m.metalness = 0.15; m.roughness = Math.max(m.roughness, 0.45); } } });
        this.fixed = true;
      }
      obj = this.asset.scene.clone(true);
      const clip = this.asset.animations.find(a => /DoorsOpen/i.test(a.name)) || this.asset.animations[0];
      if (clip) { mixer = new THREE.AnimationMixer(obj); action = mixer.clipAction(clip); action.play(); action.paused = true; }
    } else obj = placeholderBus();
    const doors = obj.children.length ? [] : [];
    obj.traverse(o => { if (/^Door_/.test(o.name)) doors.push({ o, z0: o.position.z, x0: o.position.x, k: /0$/.test(o.name) ? 1 : -1 }); });
    const anchors = {};
    obj.traverse(o => { if (o.name === 'Anchor_DoorFront') anchors.front = o; if (o.name === 'Anchor_DoorMid') anchors.mid = o; });
    const label = labelSprite('קו ' + bus.line.def.number, bus.line.color, 1.05);
    label.position.set(0, 5.3, 0); obj.add(label);
    obj.userData.bus = bus;
    this.group.add(obj);
    const v = { obj, mixer, action, doors, anchors, label };
    this.map.set(bus.id, v); return v;
  }
  update(lines) {
    const alive = new Set();
    for (const L of lines) for (const b of L.buses) {
      alive.add(b.id);
      const v = this.map.get(b.id) || this.make(b);
      const p = busPose(L.poly, b.s);
      v.obj.position.set(p.x, 0, -p.y); v.obj.rotation.y = p.yaw;
      v.obj.visible = b.state !== 'done' || b.t < 1.2;
      if (v.action) { v.action.time = b.door * v.action.getClip().duration * 0.999; v.mixer.update(0); }
      else for (const d of v.doors) { // placeholder: יציאה החוצה והחלקה
        d.o.position.x = d.x0 - 0.1 * Math.min(1, b.door * 3);
        d.o.position.z = d.z0 + d.k * 0.55 * Math.max(0, b.door * 1.2 - 0.2);
      }
      v.label.visible = L.visible !== false;
    }
    for (const [id, v] of this.map) if (!alive.has(id)) { this.group.remove(v.obj); this.map.delete(id); }
  }
  doorWorld(bus, which) {
    const v = this.map.get(bus.id); if (!v) return null;
    const a = v.anchors[which]; if (!a) return null;
    v.obj.updateMatrixWorld(true);
    return a.getWorldPosition(new THREE.Vector3());
  }
  objectOf(bus) { return this.map.get(bus.id)?.obj; }
}

// ---------- אנשים
const SKIN = [0xe9c6aa, 0xd9ab8a, 0xbf8b67, 0x8f5d3e, 0xf2d6c2, 0xc99a78];
const CLOTH = [0x0ea5e9, 0x1e3a8a, 0xef4444, 0x22c55e, 0xf8fafc, 0x334155, 0xf59e0b, 0x8b5cf6, 0x0f766e, 0xdb2777, 0x94a3b8, 0x7c2d12];
const HAIR = [0x1c1917, 0x3f2a1d, 0x6b4f2f, 0x0c0a09, 0xa8a29e];
const hash = i => { const x = Math.sin(i * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };
export function personColors(id) {
  return { skin: SKIN[Math.floor(hash(id) * SKIN.length)], cloth: CLOTH[Math.floor(hash(id + 3) * CLOTH.length)],
    hair: HAIR[Math.floor(hash(id + 5) * HAIR.length)], shoes: 0x27272a };
}
function partKind(name) {
  const n = name.toLowerCase();
  if (n.includes('shoe')) return 'shoes';
  if (n.includes('hair') || n.includes('short0')) return 'hair';
  if (n.includes('suit') || n.includes('cloth') || n.includes('shirt') || n.includes('pants')) return 'cloth';
  return 'skin';
}

// גוף סטטי בתנוחת עמידה מתוך person.glb (אפוי מהשלד), מחולק לחלקים לפי צבע
function bakePerson(gltf) {
  const root = SkeletonUtils.clone(gltf.scene);
  const idle = gltf.animations.find(a => /idle/i.test(a.name));
  if (idle) { const mx = new THREE.AnimationMixer(root); mx.clipAction(idle).play(); mx.update(0); }
  root.updateMatrixWorld(true);
  // ההקלטה זזה קדימה מהמקור — ממרכזים לפי האגן (Hips), כדי שהדמות תעמוד על הנקודה שלה
  const hips = root.getObjectByName('Hips');
  const c0 = hips ? hips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  const parts = {};
  const v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isSkinnedMesh && !o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, out = new Float32Array(pos.count * 3);
    if (o.isSkinnedMesh) o.skeleton.update();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld); out[i * 3] = v.x - c0.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z - c0.z;
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(out, 3));
    if (g.index) ng.setIndex(g.index.clone());
    ng.computeVertexNormals();
    const k = partKind(o.name + ' ' + (o.material?.name || ''));
    (parts[k] = parts[k] || []).push(ng);
  });
  const res = {};
  for (const k in parts) res[k] = mergeGeometries(parts[k], false);
  return res;
}
function proceduralPerson() {
  const leg = (x) => new THREE.CylinderGeometry(0.075, 0.065, 0.82, 6).translate(x, 0.41 + 0.06, 0);
  return {
    shoes: mergeGeometries([new THREE.BoxGeometry(0.11, 0.08, 0.24).translate(-0.1, 0.04, 0.03), new THREE.BoxGeometry(0.11, 0.08, 0.24).translate(0.1, 0.04, 0.03)]),
    cloth: mergeGeometries([leg(-0.1), leg(0.1), new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8).translate(0, 1.18, 0),
      new THREE.CylinderGeometry(0.05, 0.045, 0.6, 5).translate(-0.25, 1.15, 0), new THREE.CylinderGeometry(0.05, 0.045, 0.6, 5).translate(0.25, 1.15, 0)]),
    skin: new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.62, 0),
    hair: new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).translate(0, 1.65, -0.01),
  };
}

export class PeopleLayer {
  constructor(scene, gltf, graph, max = 1600) {
    this.scene = scene; this.gltf = gltf; this.graph = graph;
    this.group = new THREE.Group(); this.group.name = 'people'; scene.add(this.group);
    let geos = null;
    if (gltf) { try { geos = bakePerson(gltf); } catch (e) { console.warn('bake person failed', e); } }
    this.fromGlb = !!geos;
    geos = geos || proceduralPerson();
    this.parts = {};
    for (const k of ['skin', 'cloth', 'hair', 'shoes']) {
      if (!geos[k]) continue;
      const im = new THREE.InstancedMesh(geos[k], new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
      im.count = 0; im.frustumCulled = false; im.name = 'crowd-' + k;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im); this.parts[k] = im;
    }
    this.max = max;
    this.walkers = []; this.pool = [];
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpC = new THREE.Color();
    this.layoutCache = new Map();
  }

  // מקום התחנה: עמוד התחנה (המיקום האמיתי מ-GTFS), כיוון "הרחק מהכביש" וכיוון לאורך הכביש
  stopFrame(stop) {
    let f = this.layoutCache.get(stop.id);
    if (f) return f;
    const [rx, ry] = this.graph.stopPoint(stop);
    const [a, b] = this.graph.edge(stop.e), [ax, ay] = this.graph.xy(a), [bx, by] = this.graph.xy(b);
    const tl = Math.hypot(bx - ax, by - ay) || 1, tx = (bx - ax) / tl, ty = (by - ay) / tl;
    // מדרכה בצד ימין של כיוון הנסיעה
    let ux = ty, uy = -tx;
    const dpole = Math.hypot(stop.x - rx, stop.y - ry);
    let px = stop.x, py = stop.y;
    if (dpole < 4 || ((stop.x - rx) * ux + (stop.y - ry) * uy) < 0) { px = rx + ux * 5.5; py = ry + uy * 5.5; }
    f = { px, py, ux, uy, tx, ty, rx, ry };
    this.layoutCache.set(stop.id, f); return f;
  }
  slot(stop, i) {
    const f = this.stopFrame(stop);
    const col = i % 8, row = Math.floor(i / 8);
    const along = (col - 2) * 0.62 + (row % 2) * 0.3, out = 0.45 + row * 0.6;
    return [f.px + f.ux * out + f.tx * along, f.py + f.uy * out + f.ty * along, Math.atan2(-f.ux, f.uy)];
  }

  update(sim, stops, simDt, busLayer) {
    // קהל ממתין: לפי תחנה
    const per = new Map();
    for (const L of sim.lines) {
      if (L.visible === false) continue;
      L.queues.forEach((q, k) => { if (!q.length) return; const s = L.stops[k]; const a = per.get(s) || []; for (const p of q) a.push(p); per.set(s, a); });
    }
    let n = 0;
    const M = this.tmpM, Q = this.tmpQ, C = this.tmpC, up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
    for (const [stop, list] of per) {
      for (let i = 0; i < list.length && i < 36 && n < this.max; i++, n++) {
        const [x, y, yaw] = this.slot(stop, i), p = list[i];
        Q.setFromAxisAngle(up, yaw + (hash(p.id) - 0.5) * 0.9);
        P.set(x, 0.12, -y); S.setScalar(0.92 + hash(p.id + 9) * 0.14);
        M.compose(P, Q, S);
        const c = personColors(p.id);
        for (const k in this.parts) { this.parts[k].setMatrixAt(n, M); this.parts[k].setColorAt(n, C.setHex(c[k] ?? 0x888888)); }
      }
    }
    for (const k in this.parts) {
      const im = this.parts[k]; im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.crowdCount = n;

    // הולכים: עולים לאוטובוס / יורדים ממנו
    for (const ev of sim.events) {
      if (sim.speed > 12) break;
      if (ev.type === 'board') {
        const to = busLayer.doorWorld(ev.bus, 'front'); if (!to) continue;
        const [x, y] = this.slot(ev.stop, 0);
        this.walk(ev.p.id, new THREE.Vector3(x, 0.12, -y), to.setY(0.12), null);
      } else if (ev.type === 'alight') {
        const from = busLayer.doorWorld(ev.bus, 'mid'); if (!from) continue;
        const f = this.stopFrame(ev.stop), side = (hash(ev.p.id) - 0.5) * 14;
        const to = new THREE.Vector3(f.px + f.ux * 3 + f.tx * side, 0.12, -(f.py + f.uy * 3 + f.ty * side));
        this.walk(ev.p.id, from.setY(0.12), to, 'fade');
      }
    }
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      w.t += simDt;
      const k = Math.min(1, w.t / w.dur);
      w.obj.position.lerpVectors(w.a, w.b, k);
      if (w.mixer) { w.mixer.update(simDt); this.centre(w); }
      else w.obj.position.y = 0.12 + Math.abs(Math.sin(w.t * 9)) * 0.05;
      if (k >= 1) { w.obj.visible = false; this.pool.push(w); this.walkers.splice(i, 1); }
    }
  }

  walk(id, a, b, mode) {
    let w = this.pool.pop();
    if (!w) {
      if (this.walkers.length > 40) return;
      w = this.makeWalker();
    }
    const c = personColors(id);
    for (const [m, k] of w.mats) m.color.setHex(c[k] ?? 0x888888);
    w.a = a.clone(); w.b = b.clone(); w.t = 0;
    w.dur = Math.max(0.6, a.distanceTo(b) / 1.35);
    const d = new THREE.Vector3().subVectors(b, a);
    w.obj.rotation.y = Math.atan2(d.x, d.z);
    w.obj.position.copy(a); w.obj.visible = true;
    this.walkers.push(w);
  }
  makeWalker() {
    const mats = [];
    let obj, mixer = null;
    let inner = null, hips = null;
    if (this.gltf) {
      inner = SkeletonUtils.clone(this.gltf.scene);
      obj = new THREE.Group(); obj.add(inner);
      hips = inner.getObjectByName('Hips');
      inner.traverse(o => {
        if (!o.isMesh) return;
        const k = partKind(o.name + ' ' + (o.material?.name || ''));
        o.material = new THREE.MeshLambertMaterial({ color: 0x888888 }); mats.push([o.material, k]);
        o.frustumCulled = false;
      });
      const clip = this.gltf.animations.find(a => /walk/i.test(a.name));
      if (clip) { mixer = new THREE.AnimationMixer(inner); mixer.clipAction(clip).play(); }
    } else {
      obj = new THREE.Group();
      const g = proceduralPerson();
      for (const k in g) { const m = new THREE.MeshLambertMaterial(); mats.push([m, k]); obj.add(new THREE.Mesh(g[k], m)); }
    }
    this.group.add(obj);
    return { obj, mixer, mats, inner, hips };
  }
  // ההליכה במקום: מזיזים את הדמות כך שהאגן יישאר מעל נקודת ההליכה
  centre(w) {
    if (!w.hips) return;
    w.inner.position.set(0, 0, 0); w.obj.updateMatrixWorld(true);
    const h = w.obj.worldToLocal(w.hips.getWorldPosition(new THREE.Vector3()));
    w.inner.position.set(-h.x, 0, -h.z);
  }
}
