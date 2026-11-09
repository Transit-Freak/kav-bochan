// התצוגה של האוטובוסים והאנשים. נכסים מ-assets/*.glb (ייצוא מ-Blender); אם חסרים — דגמים פשוטים (placeholder)
import * as THREE from 'three';
import { keep } from './texkeep.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { labelSprite } from './lines.js';
import { ROLE } from './ops.js';
import { BUS } from './sim.js';
import { TYPES } from './fleet.js';
import { useBitmapTextures } from './texfix.js';
import { addCab, turn } from './driver.js';
import { stopFrame, frameV, frameAD, BENCH } from './stops.js';
import { buildSitter, PHONE } from './sitting.js';
import { SIT_PRESETS } from './sitpresets.js';
import { addStraps, swayStraps } from './straps.js';
import { addRamp } from './access.js';

export async function loadAssets(base) {
  const loader = useBitmapTextures(new GLTFLoader());
  const get = url => new Promise(res => loader.load(url, g => res(g), undefined, () => res(null)));
  // .glb, ואם אין — אותו דגם כקובץ JSON (.gltf.json), למקומות שלא מגישים קבצי glb
  // דגם בתוך קובץ JSON (base64) — מפענחים כאן, בלי כתובות data: שנחסמות בתצוגה הפרטית בטלפון
  const parse = buf => new Promise(res => loader.parse(buf, base, g => res(g), () => res(null)));
  const fromJson = async n => { try { const r = await fetch(base + n + '.glb64.json'); if (!r.ok) return null;
    const b = atob((await r.json()).glb), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return await parse(u.buffer); } catch (e) { return null; } };
  const one = async n => (await get(base + n + '.glb')) || fromJson(n);
  // האנשים: כמה דגמים שונים (assets/people/people.json), ואם אין — האדם היחיד הישן
  const loadPeople = async () => {
    let names = [];
    try { const r = await fetch(base + 'people/people.json'); if (r.ok) names = (await r.json()).map(n => 'people/' + n.replace(/\.glb$/, '')); } catch (e) { }
    const list = (await Promise.all(names.map(async n => { const g = await one(n); if (g) g.userData.file = n; return g; }))).filter(Boolean);
    if (!list.length) { const p = await one('person'); if (p) list.push(p); }
    return list;
  };
  const [bus, people] = await Promise.all([one('bus'), loadPeople()]);
  return { bus, people, person: people[0] || null };
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

// החומרים של האוטובוס כמו ב-Blender (פח כסוף מתכתי, זכוכית כהה מבריקה). ההחזרות באות ממפת סביבה
// (RoomEnvironment, ב-main.js) — בהירה יותר מהרחוב של הרינדור, לכן בזכוכית ובשחור המבריק ההחזרה חלשה יותר,
// אחרת החלונות נראים אפורים
const BUS_ENV = { M_Glass: 0.25, M_GlossBlack: 0.4, M_Plexi: 0.4, M_Silver: 1.15, M_RoofWhite: 0.8 };
function tuneBusMaterials(root, env) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.userData.tuned || !m.isMeshStandardMaterial) continue; m.userData.tuned = true;
      if (env) { m.envMap = env; m.envMapIntensity = BUS_ENV[m.name] ?? 0.7; }
      if (m.name === 'M_Glass' && m.clearcoat !== undefined) m.clearcoat = 0.3;
      m.needsUpdate = true;
    }
  });
}

// חיפוי הקיר התחתון בצד הדלתות (M_Panel, גובה 0.66–1.32) הוא קופסה אחת לכל אורך האוטובוס, גם לרוחב פתחי הדלתות —
// והנוסעים "נכנסים" בו. מחליפים אותו בקטעים שבין הדלתות
const DOORWAYS = [[4.565, 5.735], [-0.585, 0.635]];
function cutDoorPanels(root) {
  root.updateMatrixWorld(true);
  const add = [];
  root.traverse(o => {
    const m = o.isMesh && [].concat(o.material)[0];
    if (!m || m.name !== 'M_Panel' || !o.geometry.index) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index.array, keep = [], box = new THREE.Box3();
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(o.matrixWorld);
      const wall = v.every(p => p.x < -1.1 && p.y > 0.6 && p.y < 1.4) && Math.max(...v.map(p => p.z)) - Math.min(...v.map(p => p.z)) > 2;
      if (wall) v.forEach(p => box.expandByPoint(p)); else keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (box.isEmpty()) return;
    g.setIndex(keep);
    let cuts = [[box.min.z, box.max.z]];
    for (const [a, b] of DOORWAYS) cuts = cuts.flatMap(([z0, z1]) => [[z0, Math.min(z1, a)], [Math.max(z0, b), z1]]).filter(([z0, z1]) => z1 - z0 > 0.02);
    const sx = Math.max(0.02, box.max.x - box.min.x), sy = box.max.y - box.min.y;
    for (const [z0, z1] of cuts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, z1 - z0), m);
      mesh.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (z0 + z1) / 2); mesh.name = 'DadoPanel';
      add.push(mesh);
    }
  });
  for (const m of add) root.add(m);
}

export class BusLayer {
  constructor(scene, asset, people) {
    this.scene = scene; this.asset = asset; this.people = people || []; this.map = new Map();
    this.group = new THREE.Group(); this.group.name = 'buses'; scene.add(this.group);
    this.isPlaceholder = !asset;
    this.tints = new Map();
  }
  // סוגי הרכבים: עדיין דגם אחד. מיניבוס, מפרקי וחשמלי — גג בצבע אחר ושם הסוג בשלט מעל האוטובוס
  tinted(m, color) {
    const key = m.uuid + ':' + color;
    let t = this.tints.get(key);
    if (!t) { t = m.clone(); t.color = new THREE.Color(color); this.tints.set(key, t); }
    return t;
  }
  make(bus) {
    let obj, mixer = null, action = null;
    if (this.asset) {
      if (!this.tuned) {
        // תא הנהג והנהג היושב (js/driver.js) — פעם אחת לדגם, וכל השכפולים חולקים אותם
        try { addCab(this.asset.scene, this.people); } catch (e) { console.warn('cab failed', e); }
        // רצועות האחיזה (js/straps.js) ומשטח העלייה לכיסא גלגלים בדלת האמצעית (js/access.js)
        try { addStraps(this.asset.scene); } catch (e) { console.warn('straps failed', e); }
        try { addRamp(this.asset.scene); } catch (e) { console.warn('ramp failed', e); }
        cutDoorPanels(this.asset.scene);
        tuneBusMaterials(this.asset.scene, this.scene.userData.envMap); this.tuned = true; }
      obj = this.asset.scene.clone(true);
      const clip = this.asset.animations.find(a => /DoorsOpen/i.test(a.name)) || this.asset.animations[0];
      if (clip) { mixer = new THREE.AnimationMixer(obj); action = mixer.clipAction(clip); action.play(); action.paused = true; }
    } else obj = placeholderBus();
    // האוטובוס מטיל צל על הכביש (בלי הפנים: תא הנהג, הנהג והמושבים לא נראים בצל מבחוץ)
    obj.traverse(o => { if (o.isMesh && !/Driver|Cab|Seat|Interior/i.test(o.name)) o.castShadow = true; });
    const doors = obj.children.length ? [] : [];
    obj.traverse(o => { if (/^Door_/.test(o.name)) doors.push({ o, z0: o.position.z, x0: o.position.x, k: /0$/.test(o.name) ? 1 : -1 }); });
    const anchors = {};
    obj.traverse(o => { if (o.name === 'Anchor_DoorFront') anchors.front = o; if (o.name === 'Anchor_DoorMid') anchors.mid = o; });
    const T = TYPES[bus.type];
    if (T?.tint) obj.traverse(o => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) o.material = o.material.map(m => /RoofWhite|Roof/.test(m.name) ? this.tinted(m, T.tint) : m);
      else if (/RoofWhite|Roof/.test(o.material?.name)) o.material = this.tinted(o.material, T.tint);
    });
    const label = labelSprite('קו ' + bus.line.def.number + (T && bus.type !== 'std' ? ' · ' + T.name : ''), bus.line.color, 1.05);
    label.position.set(0, 5.3, 0); obj.add(label);
    // תקלה (ops.js): סימן אזהרה מעל האוטובוס
    const warn = labelSprite('⚠ תקלה', '#d03b3b', 1.05); warn.position.set(0, 7.2, 0); warn.visible = false; obj.add(warn);
    obj.userData.bus = bus;
    this.group.add(obj);
    const v = { obj, mixer, action, doors, anchors, label, warn };
    this.map.set(bus.id, v); return v;
  }
  // simDt — זמן המשחק שעבר, dt — זמן אמיתי (לנדנוד הרצועות)
  update(lines, simDt = 0, dt = 0) {
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
      v.label.visible = L.visible !== false && !this.hideLabels;
      v.warn.visible = !!b.broken && L.visible !== false;
      if (dt && v.obj.visible) swayStraps(v, b, p.yaw, simDt, dt);
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

// IK של שני עצמות (ירך-שוק): הברך לכיוון pole
function aimBone(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  const p = bone.getWorldPosition(new THREE.Vector3()), c = child.getWorldPosition(new THREE.Vector3());
  const q = new THREE.Quaternion().setFromUnitVectors(c.sub(p).normalize(), target.clone().sub(p).normalize());
  const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
  bone.updateWorldMatrix(false, true);
}
function twoBone(a, b, c, target, pole) {
  a.updateWorldMatrix(true, true);
  const A = a.getWorldPosition(new THREE.Vector3()), B = b.getWorldPosition(new THREE.Vector3()), C = c.getWorldPosition(new THREE.Vector3());
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const dir = target.clone().sub(A); let d = dir.length(); dir.normalize();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pn = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  aimBone(a, b, A.clone().addScaledVector(dir, x).addScaledVector(pn, h));
  aimBone(b, c, A.clone().addScaledVector(dir, d));
}

// ---------- אנשים
// כמה דגמים שונים של אנשים (MPFB), כל אחד עם הטקסטורות שלו. הגיוון הנוסף: גוון עדין לבגדים ושינוי קטן בגובה.
// במצב ?placeholders — דמויות פשוטות בצבעים אחידים (כמו קודם)
// הגיל של כל דגם (tools/person_variants.py): מבוגרים יושבים ראשונים, צעירים משאירים מקום
const AGE = { person_3: 'old', person_4: 'old', person_2: 'young', person_6: 'young' };
const XFER_MAX = 40;                        // הולכים למעבר בבת אחת לכל היותר (השאר — כמו יורדים רגילים)
const SIT_MAX = 256, SIT_GAP = 0.012;
// תנוחת הידיים של היושבים, לפי הדגם (people.json): טלפון ביד אחת (והיד השנייה על הירך), או שתי הידיים על הירכיים;
// הצד של היד שמחזיקה; והאם יד שהאמה שלה נוגעת בגוף זזה קדימה על הירך (נבחר לכל דגם לפי מה שיוצא בלי חפיפות)
const POSE_OF = [['phone', 'Right', true], ['thighs', 'Left', false], ['phone', 'Left', true], ['thighs', 'Left', false], ['phone', 'Left', true], ['thighs', 'Left', false], ['thighs', 'Left', false], ['thighs', 'Left', true], ['thighs', 'Left', false]];
const SKIN = [0xe9c6aa, 0xd9ab8a, 0xbf8b67, 0x8f5d3e, 0xf2d6c2, 0xc99a78];
const CLOTH = [0x0ea5e9, 0x1e3a8a, 0xef4444, 0x22c55e, 0xf8fafc, 0x334155, 0xf59e0b, 0x8b5cf6, 0x0f766e, 0xdb2777, 0x94a3b8, 0x7c2d12];
const HAIR = [0x1c1917, 0x3f2a1d, 0x6b4f2f, 0x0c0a09, 0xa8a29e];
const hash = i => { const x = Math.sin(i * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };
export function personColors(id) {
  return { skin: SKIN[Math.floor(hash(id) * SKIN.length)], cloth: CLOTH[Math.floor(hash(id + 3) * CLOTH.length)],
    hair: HAIR[Math.floor(hash(id + 5) * HAIR.length)], shoes: 0x27272a };
}
// גוונים עדינים לבגדים (כפל על הטקסטורה): אותו בגד בכמה צבעים, בלי צבעים צעקניים
const CLOTH_TINT = [[1, 1, 1], [1, 1, 1], [1.08, 0.94, 0.84], [0.84, 0.92, 1.06], [0.72, 0.72, 0.74], [1.1, 1.08, 1.04],
  [0.95, 1.02, 0.9], [1.06, 0.88, 0.88], [0.9, 0.86, 1.0]];
function partKind(name) {
  const n = name.toLowerCase();
  if (n.includes('shoe') || n.includes('boot')) return 'shoes';
  if (/hair|short0|long0|bob0|ponytail|braid|afro|brow|lash/.test(n)) return 'hair';
  if (/eye|cornea|low-poly|high-poly/.test(n)) return 'eyes';
  if (/body|lips|nail|ears|skin|teeth|tongue/.test(n)) return 'skin';
  return 'cloth';
}
// חומר למשחק: Lambert עם הטקסטורה המקורית. שקיפות "חתוכה" (alphaTest) במקום שקיפות אמיתית —
// כך שיער וגבות נראים נכון גם בלי למיין את כל הדמויות
function gameMaterial(m, kind) {
  const card = kind === 'hair';
  const out = new THREE.MeshLambertMaterial({
    name: m.name, map: m.map || null, normalMap: m.normalMap || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
    alphaTest: m.map ? 0.5 : 0, transparent: false, side: kind === 'skin' || kind === 'eyes' ? THREE.FrontSide : THREE.DoubleSide,
  });
  if (out.map) out.map.anisotropy = 4;
  if (!card && out.map) out.alphaTest = 0.35;
  out.userData.kind = kind;
  return out;
}

// הקודקודים של כל רשת בדגם בתנוחה הנוכחית של השלד (אותו חישוב כמו בשיידר), בקואורדינטות העולם
const _acc = new THREE.Matrix4(), _full = new THREE.Matrix4(), _nm = new THREE.Matrix3();
export function skinVerts(root) {
  root.updateMatrixWorld(true);
  const out = [], v = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    const P = new Float32Array(pos.count * 3), N = nor ? new Float32Array(pos.count * 3) : null;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (o.isSkinnedMesh) o.skeleton.update();
    const bm = o.isSkinnedMesh ? o.skeleton.boneMatrices : null;
    for (let i = 0; i < pos.count; i++) {
      if (bm) {   // bindMatrixInverse · Σ w·bone · bindMatrix
        const e = _acc.elements; e.fill(0);
        for (let j = 0; j < 4; j++) {
          const w = sw.getComponent(i, j); if (!w) continue;
          const b = si.getComponent(i, j) * 16;
          for (let k = 0; k < 16; k++) e[k] += w * bm[b + k];
        }
        _full.multiplyMatrices(o.matrixWorld, o.bindMatrixInverse).multiply(_acc).multiply(o.bindMatrix);
      } else _full.copy(o.matrixWorld);
      v.fromBufferAttribute(pos, i).applyMatrix4(_full); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      if (N) { n.fromBufferAttribute(nor, i).applyMatrix3(_nm.getNormalMatrix(_full)).normalize(); N[i * 3] = n.x; N[i * 3 + 1] = n.y; N[i * 3 + 2] = n.z; }
    }
    out.push({ o, P, N, kind: partKind(o.material.name + ' ' + o.name) });
  });
  return out;
}
// דמות אפויה (רשת רגילה, בלי שלד), מחולקת לפי חומר. בלי posed — בתנוחת העמידה, ממורכזת לפי האגן
// וכפות הרגליים על הקרקע. עם posed ({root, origin}) — שלד שכבר הוזז לתנוחה אחרת (ישיבה), יחסית ל-origin
function bakeVariant(gltf, posed, cache = new Map()) {   // cache: חומרים משותפים לעמידה ולישיבה
  let root, c0;
  if (posed) { root = posed.root; c0 = posed.origin; }
  else {
    root = SkeletonUtils.clone(gltf.scene);
    const idle = gltf.animations.find(a => /idle/i.test(a.name));
    if (idle) { const mx = new THREE.AnimationMixer(root); mx.clipAction(idle).play(); mx.update(0); }
    root.updateMatrixWorld(true);
    // ההקלטה זזה קדימה מהמקור — ממרכזים לפי האגן (Hips), כדי שהדמות תעמוד על הנקודה שלה
    const hips = root.getObjectByName('Hips');
    c0 = hips ? hips.getWorldPosition(new THREE.Vector3()).setY(0) : new THREE.Vector3();
  }
  const verts = skinVerts(root);
  let minY = Infinity;
  if (!posed) for (const { P } of verts) for (let i = 1; i < P.length; i += 3) minY = Math.min(minY, P[i]);
  const byMat = new Map();
  for (const { o, P, N, kind } of verts) {
    const g = o.geometry, uv = g.attributes.uv, Q = new Float32Array(P.length);
    const dy = posed ? c0.y : minY;   // בעמידה — כפות הרגליים בדיוק על הקרקע
    for (let i = 0; i < P.length; i += 3) { Q[i] = P[i] - c0.x; Q[i + 1] = P[i + 1] - dy; Q[i + 2] = P[i + 2] - c0.z; }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(Q, 3));
    if (N) ng.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (uv) ng.setAttribute('uv', uv.clone());
    if (g.index) ng.setIndex(g.index.clone());
    if (!N) ng.computeVertexNormals();
    // חומרים עם אותה טקסטורה (עור, שפתיים, ציפורניים, אוזניים) — רשת אחת
    const m = o.material, key = (m.map?.source?.uuid || m.map?.uuid || m.uuid) + '|' + kind;
    let e = byMat.get(key);
    if (!e) byMat.set(key, e = { geos: [], mat: m, kind, key });
    e.geos.push(ng);
  }
  const groups = [];
  for (const e of byMat.values()) {
    const geo = e.geos.length > 1 ? mergeGeometries(e.geos, false) : e.geos[0];
    if (!geo) continue;
    geo.computeBoundingSphere();
    if (!cache.has(e.key)) cache.set(e.key, gameMaterial(e.mat, e.kind));
    groups.push({ geo, mat: cache.get(e.key), kind: e.kind });
  }
  return groups;
}
function proceduralPerson() {
  const leg = (x) => new THREE.CylinderGeometry(0.075, 0.065, 0.82, 6).translate(x, 0.41 + 0.06, 0);
  const g = {
    shoes: mergeGeometries([new THREE.BoxGeometry(0.11, 0.08, 0.24).translate(-0.1, 0.04, 0.03), new THREE.BoxGeometry(0.11, 0.08, 0.24).translate(0.1, 0.04, 0.03)]),
    cloth: mergeGeometries([leg(-0.1), leg(0.1), new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8).translate(0, 1.18, 0),
      new THREE.CylinderGeometry(0.05, 0.045, 0.6, 5).translate(-0.25, 1.15, 0), new THREE.CylinderGeometry(0.05, 0.045, 0.6, 5).translate(0.25, 1.15, 0)]),
    skin: new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.62, 0),
    hair: new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2).translate(0, 1.65, -0.01),
  };
  return Object.entries(g).map(([kind, geo]) => ({ geo, kind, flat: true, mat: new THREE.MeshLambertMaterial({ color: 0xffffff }) }));
}
// צל רך מתחת לכל אדם (עיגול כהה שקוף) — זול בהרבה ממפת צללים, ומחבר את הדמויות לקרקע
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.55, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return keep(t);
}

export class PeopleLayer {
  constructor(scene, gltfs, graph, max = 1600) {
    this.scene = scene; this.graph = graph;
    if (gltfs && !Array.isArray(gltfs)) gltfs = [gltfs];
    this.gltfs = (gltfs || []).filter(Boolean);
    this.group = new THREE.Group(); this.group.name = 'people'; scene.add(this.group);
    this.variants = [];
    for (const g of this.gltfs) {
      const cache = new Map();
      try { this.variants.push({ gltf: g, groups: bakeVariant(g, null, cache), age: AGE[(g.userData.file || '').replace(/^.*\//, '')] || '' }); }
      catch (e) { console.warn('bake person failed', e); continue; }
      // אותו אדם יושב על הספסל: תנוחה אפויה אחת לכל דגם (sitting.js)
      try {
        const vi = this.variants.length - 1, [armPose, side, pushFore] = POSE_OF[vi % POSE_OF.length];
        // התוצאות של החיפוש שמורות מראש (js/sitpresets.js) — כך הטעינה מהירה; דגם חדש או שונה — מחפשים מחדש
        const key = `${g.userData.file}|${armPose}|${side}|${pushFore ? 1 : 0}`;
        const S = buildSitter(g, skinVerts, BENCH.h, BENCH.wall - SIT_GAP - BENCH.d0 - 0.03, armPose, side, pushFore, SIT_PRESETS[key] || null);
        if (S) S.key = key;
        if (S) { const V = this.variants[this.variants.length - 1]; V.sit = S; V.sitGroups = bakeVariant(g, S, cache);
          // הרוחב של היושב לאורך הספסל (ציר x שלו), לבדיקת השכנים
          let lo = Infinity, hi = -Infinity; for (const gr of V.sitGroups) { const p = gr.geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x < lo) lo = x; if (x > hi) hi = x; } }
          V.sitExt = [lo, hi]; }
      } catch (e) { console.warn('sitting pose failed', e); }
    }
    this.fromGlb = this.variants.length > 0;
    if (!this.fromGlb) { this.gltfs = []; this.variants.push({ gltf: null, groups: proceduralPerson() }); }
    // לכל דגם ולכל חומר — InstancedMesh אחד
    for (const [vi, V] of this.variants.entries()) {
      V.meshes = V.groups.map(gr => {
        const im = new THREE.InstancedMesh(gr.geo, gr.mat, max);
        im.count = 0; im.frustumCulled = false; im.name = `crowd-${vi}-${gr.kind}`;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.setColorAt(0, new THREE.Color(1, 1, 1));
        this.group.add(im); return im;
      });
      V.n = 0;
      V.sitMeshes = (V.sitGroups || []).map(gr => {
        const im = new THREE.InstancedMesh(gr.geo, gr.mat, SIT_MAX);
        im.count = 0; im.frustumCulled = false; im.name = `crowd-${vi}-sit-${gr.kind}`;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.setColorAt(0, new THREE.Color(1, 1, 1));
        this.group.add(im); return im;
      });
      V.sn = 0;
    }
    // טלפון ביד של חלק מהיושבים: מלבן כהה, בלי מסך (קבוצה אחת לכל הדגמים)
    this.phones = new THREE.InstancedMesh(new THREE.BoxGeometry(PHONE.w, PHONE.t, PHONE.l), new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.35, metalness: 0.3 }), SIT_MAX);
    this.phones.count = 0; this.phones.frustumCulled = false; this.phones.name = 'crowd-phones'; this.phones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.phones); this.tmpP = new THREE.Matrix4();
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.blobGeo = new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(this.blobGeo, this.blobMat, max);
    this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.renderOrder = 1; this.blobs.name = 'crowd-shadows';
    this.group.add(this.blobs);
    this.max = max;
    this.walkers = []; this.pools = this.variants.map(() => []);
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpC = new THREE.Color();
    this.layoutCache = new Map(); this.seats = new Map(); this.benches = new Map();
  }

  // מסגרת התחנה (js/stops.js): השפה, כיוון "הרחק מהכביש" וכיוון לאורך הכביש; px,py — עמוד השלט
  stopFrame(stop) { return stopFrame(stop, this.graph); }
  // מקום המתנה קבוע (SLOTS): בין השפה לסככה, בתוך הסככה מול הספסל ובצדדים. כולם פונים לכביש
  slot(stop, i) {
    const f = this.stopFrame(stop), [a, d] = f.slots[i % f.slots.length], [x, y] = [f.kx + f.tx * a + f.ux * d, f.ky + f.ty * a + f.uy * d];
    return [x, y, Math.atan2(-f.ux, f.uy), d, a];
  }
  // מקום קבוע לכל ממתין: מי שמגיע מקבל את המקום הפנוי הראשון ונשאר בו עד שהוא הולך לאוטובוס
  // (קודם המקום נקבע לפי הסדר בתור, ולכן כולם קפצו מקום בכל פעם שמישהו עלה)
  seatOf(stop, pid) {
    let m = this.seats.get(stop.id);
    if (!m) { m = new Map(); this.seats.set(stop.id, m); }
    let i = m.get(pid);
    if (i === undefined) { const used = new Set(m.values()); i = 0; while (used.has(i)) i++; m.set(pid, i); }
    return i;
  }
  // ישיבה על הספסל: מי שמגיע לתחנה עם סככה ויש מקום פנוי — יושב, ונשאר על הספסל עד שהאוטובוס שלו מגיע.
  // מבוגרים יושבים בכל מקום פנוי; צעירים — רק כשנשארו לפחות שני מקומות. מי שכבר עומד לא עובר לשבת (בלי קפיצות).
  // מחזיר את מספר המקום על הספסל, או ‎-1
  benchOf(stop, pid) {
    let b = this.benches.get(stop.id);
    if (!b) { b = new Map(); this.benches.set(stop.id, b); }
    const k = b.get(pid); if (k !== undefined) return k;
    if (this.seats.get(stop.id)?.has(pid) || !this.stopFrame(stop).shelter) return -1;
    const V = this.variants[this.variantOf(pid)];
    if (!V.sit || V.sn >= SIT_MAX) return -1;
    const used = new Set(b.values()), free = [0, 1, 2].filter(j => !used.has(j) && this.seatFits(stop, j, pid, b));
    if (!free.length || (V.age === 'young' && free.length < 2)) return -1;
    b.set(pid, free[0]); return free[0];
  }
  // המקום של היושב לאורך הספסל (a), והרוחב של הגוף שלו (מרפקים, ידיים) לכל צד — מהרשת האפויה, בגודל שלו
  seatA(k, pid) { return BENCH.seats[k] + (hash(pid + 41) - 0.5) * 0.06; }
  sitSpan(stop, pid) {
    const V = this.variants[this.variantOf(pid)], f = this.stopFrame(stop), yaw = Math.atan2(-f.ux, f.uy), s = this.personScale(pid);
    const [lo, hi] = V.sitExt, sg = Math.sign(Math.cos(yaw) * f.tx + Math.sin(yaw) * f.ty) || 1;
    return sg > 0 ? [lo * s, hi * s] : [-hi * s, -lo * s];
  }
  // יושב חדש רק במקום שבו הגוף שלו לא נוגע בשכנים (לפחות 1 ס"מ ביניהם); אחרת — עומד
  seatFits(stop, k, pid, b) {
    const [lo, hi] = this.sitSpan(stop, pid), a = this.seatA(k, pid);
    for (const [q, j] of b) {
      const aj = this.seatA(j, q), [ql, qh] = this.sitSpan(stop, q);
      const gap = a < aj ? (aj + ql) - (a + hi) : (a + lo) - (aj + qh);
      if (gap < 0.01) return false;
    }
    return true;
  }
  // המיקום של היושב: הגב צמוד לקיר הרפפות, פונה לכביש. הגובה לא משתנה עם personScale (האגן על המושב, הרגליים על הקרקע)
  sitMatrix(stop, k, pid, out = new THREE.Matrix4()) {
    const f = this.stopFrame(stop), s = this.personScale(pid);
    const p = frameV(f, BENCH.seats[k] + (hash(pid + 41) - 0.5) * 0.06, BENCH.wall - SIT_GAP, 0.12);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-f.ux, f.uy));
    return out.compose(p, q, new THREE.Vector3(s, 1, s));
  }
  personScale(id) { return this.fromGlb ? 0.96 + hash(id + 9) * 0.08 : 0.92 + hash(id + 9) * 0.14; }
  personYaw(stop, i, id) { return this.slot(stop, i)[2] + (hash(id) - 0.5) * 0.9; }
  variantOf(id) { return Math.floor(hash(id * 1.37 + 17.1) * this.variants.length) % this.variants.length; }
  // הצבע לכל חלק: בדגמים האמיתיים — לבן (הטקסטורה כמו שהיא), חוץ מגוון עדין לבגדים ושינוי קטן בבהירות העור
  tint(id, kind, flat, out) {
    // פקח: אפוד צהוב (הבגדים בגוון צהוב-כתום חזק). מבקר סמוי — כמו כולם
    if (ROLE.get(id) === 'insp' && kind === 'cloth') return flat ? out.setHex(0xf2c414) : out.setRGB(1.8, 1.5, 0.22);
    if (flat) return out.setHex(personColors(id)[kind] ?? 0x888888);
    if (kind === 'cloth') { const t = CLOTH_TINT[Math.floor(hash(id + 3) * CLOTH_TINT.length)]; return out.setRGB(t[0], t[1], t[2]); }
    if (kind === 'skin') { const k = 0.94 + hash(id + 21) * 0.1; return out.setRGB(k, k, k); }
    return out.setRGB(1, 1, 1);
  }

  update(sim, stops, simDt, busLayer) {
    // 1. עולים ויורדים — לפני שמעדכנים את הממתינים, כדי שההולך יתחיל בדיוק מהמקום שבו עמד
    for (const ev of sim.events) {
      if (ev.p?.wheel && (ev.type === 'board' || ev.type === 'alight')) continue;   // כיסא גלגלים — js/access.js
      if (ev.type === 'board') {
        const path = this.doorPath(busLayer, ev.bus, 'front'); if (!path) continue;
        const bm = this.benches.get(ev.stop.id), bk = bm?.get(ev.p.id);
        if (bk !== undefined) {
          // קם מהספסל (במקום, מעל כפות הרגליים), יוצא קדימה אל מול הסככה, ומשם הולך לדלת
          bm.delete(ev.p.id);
          const V = this.variants[this.variantOf(ev.p.id)], f = this.stopFrame(ev.stop), M = this.sitMatrix(ev.stop, bk, ev.p.id);
          const start = V.sit.feet.clone().applyMatrix4(M), [a] = frameAD(f, start.x, -start.z);
          this.walk(ev.p.id, [start, frameV(f, a, 1.15, 0.12), ...path.toIn], 'board', ev.bus, Math.atan2(-f.ux, f.uy), undefined, path.door, V.sit);
          continue;
        }
        const i = this.seatOf(ev.stop, ev.p.id), [x, y, , d, a] = this.slot(ev.stop, i);
        this.seats.get(ev.stop.id).delete(ev.p.id);
        const start = new THREE.Vector3(x, 0.12, -y);
        // מי שעומד בתוך הסככה או בצדדים — קודם יוצא קדימה, אל מול הסככה, ורק אז הולך לדלת (לא דרך הדופן או הספסל)
        const via = d > 1.8 ? [frameV(this.stopFrame(ev.stop), a, 1.15, 0.12)] : [];
        this.walk(ev.p.id, [start, ...via, ...path.toIn], 'board', ev.bus, this.personYaw(ev.stop, i, ev.p.id), undefined, path.door);
      } else if (ev.type === 'alight') {
        const path = this.doorPath(busLayer, ev.bus, 'mid'); if (!path) continue;
        const f = this.stopFrame(ev.stop), side = (hash(ev.p.id) - 0.5) * 2;
        const dir = side >= 0 ? 1 : -1, far = 12 + Math.abs(side) * 10;
        // יורדים אל הרצועה שליד השפה, הולכים לאורכה עד קצה התחנה (לפני העמוד או אחרי הסככה), ומשם מתרחקים
        const toOut = path.toIn.slice().reverse(), o = toOut[toOut.length - 1], [ad] = frameAD(f, o.x, -o.z);
        const end = dir > 0 ? Math.max(ad + 0.8, 2.8) : Math.min(ad - 0.8, -7.9);
        const curb = frameV(f, ad + dir * 0.6, 0.5, 0.12), edge = frameV(f, end, 0.5, 0.12);
        // מעבר לקו אחר: הולך מהדלת אל התחנה של הקו הבא (בקו ישר), ומצטרף שם לממתינים כשהוא מגיע
        if (ev.xfer && this.walkers.reduce((n, w) => n + (w.mode === 'xfer'), 0) < XFER_MAX) {
          const g = this.stopFrame(ev.xfer);
          const pts = [...toOut, frameV(f, ad, 0.9, 0.12)];
          if (ev.xfer === ev.stop) pts.push(frameV(f, -2.2 + (hash(ev.p.id) - 0.5) * 3, 1.5, 0.12));
          else {
            const A = frameV(f, ad, 1.0, 0.12), B = frameV(g, 0.6, 1.0, 0.12), Bk = frameV(g, -2.5 + (hash(ev.p.id) - 0.5) * 3, 1.5, 0.12);
            const far = A.distanceTo(B) > 400;      // רחוק: הולכים קטע ונעלמים בהדרגה
            if (far) { pts.push(A, A.clone().lerp(B, 60 / A.distanceTo(B)).setY(0.07)); }
            else pts.push(A, A.clone().lerp(B, 0.15).setY(0.07), A.clone().lerp(B, 0.85).setY(0.07), B, Bk);
            if (far) { this.walk(ev.p.id, pts, 'alight', ev.bus, undefined, toOut.length, path.door); continue; }
          }
          let len = 0; for (let j = 0; j + 1 < pts.length; j++) len += pts[j].distanceTo(pts[j + 1]);
          // הקצב: כך שיגיע בערך כשהסימולציה מכניסה אותו לתור (בין הליכה איטית לזריזה); אם הקדים — מחכה במקום
          const left = Math.max(1, ev.at - sim.time - 1);
          const w = this.walk(ev.p.id, pts, 'xfer', ev.bus, undefined, toOut.length, path.door); if (!w) continue;
          w.speed = THREE.MathUtils.clamp(len / left, 0.9, 1.8); w.p = ev.p; w.sim = sim;
          continue;
        }
        const away = frameV(f, end + dir * far, 3.2 + Math.abs(side) * 2, 0.12);
        this.walk(ev.p.id, [...toOut, curb, edge, away], 'alight', ev.bus, undefined, toOut.length, path.door);
      }
    }

    // 2. קהל ממתין: לפי תחנה, כל אחד במקום הקבוע שלו
    const per = new Map();
    for (const L of sim.lines) {
      if (L.visible === false) continue;
      L.queues.forEach((q, k) => { if (!q.length) return; const s = L.stops[k]; const a = per.get(s) || []; for (const p of q) a.push(p); per.set(s, a); });
    }
    // מי שכבר לא בתור בתחנה הזו (עלה, ויתר, קו שנמחק או הוסתר) — משחררים את המקום שלו, גם על הספסל
    // (גם בתחנה שבה כולם ישבו, ולכן אין לה רשימת מקומות עמידה)
    const ids = new Map(); for (const [s, list] of per) ids.set(s.id, new Set(list.map(p => p.id)));
    for (const M of [this.seats, this.benches]) for (const [sid, m] of M) {
      const here = ids.get(sid);
      for (const pid of m.keys()) if (!here || !here.has(pid)) m.delete(pid);
    }
    let n = 0;
    for (const V of this.variants) V.n = V.sn = 0;
    const M = this.tmpM, Q = this.tmpQ, C = this.tmpC, up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
    const B = new THREE.Matrix4(); let np = 0;
    for (const [stop, list] of per) {
      for (const p of list) {
        if (n >= this.max) break;
        if (p.wheel) continue;                 // כיסא גלגלים — js/access.js
        const bk = this.benchOf(stop, p.id);
        if (bk >= 0) {
          const V = this.variants[this.variantOf(p.id)];
          this.sitMatrix(stop, bk, p.id, M);
          V.sitMeshes.forEach((im, g) => { im.setMatrixAt(V.sn, M); im.setColorAt(V.sn, this.tint(p.id, V.sitGroups[g].kind, false, C)); });
          V.sn++;
          if (V.sit.phone && np < SIT_MAX) this.phones.setMatrixAt(np++, this.tmpP.multiplyMatrices(M, V.sit.phone));
          P.copy(V.sit.feet).lerp(V.sit.hip, 0.5).setY(0.015).applyMatrix4(M); B.makeTranslation(P.x, P.y, P.z); this.blobs.setMatrixAt(n, B);
          n++; continue;
        }
        const i = this.seatOf(stop, p.id); if (i >= this.stopFrame(stop).slots.length) continue;
        const [x, y] = this.slot(stop, i);
        Q.setFromAxisAngle(up, this.personYaw(stop, i, p.id));
        P.set(x, 0.12, -y); S.setScalar(this.personScale(p.id));
        M.compose(P, Q, S);
        const V = this.variants[this.variantOf(p.id)];
        V.meshes.forEach((im, g) => { im.setMatrixAt(V.n, M); im.setColorAt(V.n, this.tint(p.id, V.groups[g].kind, V.groups[g].flat, C)); });
        V.n++;
        B.makeTranslation(x, 0.135, -y); this.blobs.setMatrixAt(n, B);
        n++;
      }
    }
    this.phones.count = np; this.phones.instanceMatrix.needsUpdate = true;
    for (const V of this.variants) for (const im of V.sitMeshes) {
      im.count = V.sn; im.visible = V.sn > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    for (const V of this.variants) for (const im of V.meshes) {
      im.count = V.n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.blobs.count = n; this.blobs.instanceMatrix.needsUpdate = true;
    this.crowdCount = n;

    // 3. הולכים: לאורך מסלול של כמה נקודות, בקצב הליכה קבוע
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (w.rise && this.rising(w, simDt)) continue;
      const lastSeg = w.seg === w.pts.length - 2 && w.d >= w.lens[w.seg];
      // מעבר: הגיע לתחנה הבאה לפני שהסימולציה הכניסה אותו לתור — עומד ומחכה (עד 20 שנ')
      if (w.mode === 'xfer' && lastSeg && w.sim.pending.some(x => x.p === w.p) && (w.hold = (w.hold || 0) + simDt) < 20) {
        if (w.mixer) { w.mixer.setTime(0.02); this.centre(w); }
        continue;
      }
      w.d += simDt * (w.speed || 1.35);
      while (w.seg < w.pts.length - 2 && w.d > w.lens[w.seg]) { w.d -= w.lens[w.seg]; w.seg++; }
      const a = w.pts[w.seg], b = w.pts[w.seg + 1], L = w.lens[w.seg];
      const k = Math.min(1, w.d / L);
      w.obj.position.lerpVectors(a, b, k);
      // מסתובבים בהדרגה לכיוון ההליכה
      const want = Math.atan2(b.x - a.x, b.z - a.z);
      let dy = want - w.obj.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      w.obj.rotation.y += dy * Math.min(1, simDt * 8);
      if (w.mixer) { w.mixer.update(simDt); this.centre(w); if (w.door && w.legs) this.stairs(w, simDt); }
      else w.body.position.y = Math.abs(Math.sin(w.d * 6.7)) * 0.05;
      const last = w.seg === w.pts.length - 2;
      // יורד משחרר את האוטובוס כשהגיע למדרכה, לא כשסיים ללכת
      if (w.mode !== 'board' && w.counted && w.seg >= (w.release || 2)) { w.bus.walking = Math.max(0, (w.bus.walking || 0) - 1); w.counted = false; }
      // יורד: נעלם בהדרגה בסוף ההליכה. עולה: נכנס בדלת ונעלם בתוך האוטובוס
      if (w.mode === 'alight') this.setOpacity(w, last ? Math.min(1, (1 - k) * 3) : 1);
      if (last && k >= 1) this.finish(w, i);
    }
  }

  // בדיקה (לבדיקות ולקונסולה): כל מי שמצויר יושב או עומד בתחנה — נוסע שנמצא עכשיו בתור באותה תחנה. מחזיר את החריגים
  audit(sim) {
    const at = new Map();
    for (const L of sim.lines) L.queues.forEach((q, k) => { for (const p of q) at.set(p.id, L.stops[k].id); });
    const bad = [];
    for (const [name, M] of [['seat', this.seats], ['bench', this.benches]])
      for (const [sid, m] of M) for (const pid of m.keys()) if (at.get(pid) !== sid) bad.push({ name, sid, pid, at: at.get(pid) });
    return bad;
  }
  // מסלול הדלת, מבחוץ פנימה: מול הדלת על המדרכה ← עלייה למדרגה (0.34 מ') ← עלייה לרצפה (0.66 מ') ← פנימה.
  // הנקודות קרובות זו לזו, כך שכל עלייה היא צעד קצר למעלה ולא שיפוע
  doorPath(busLayer, bus, which) {
    const v = busLayer.map.get(bus.id); if (!v) return null;
    const a = v.anchors[which]; if (!a) return null;
    v.obj.updateMatrixWorld(true);
    const at = (dx, y) => { const l = a.position.clone(); l.x += dx; return a.parent.localToWorld(l).setY(y); };
    const pts = [at(0, 0.12), at(0.7, 0.12), at(1.4, 0.12)];
    // מסגרת הדלת: נקודת המוצא בחוץ, וכיוון פנימה — לחישוב הגובה מתחת לכל כף רגל
    const o = at(0, 0), u = at(1, 0).sub(o).normalize();
    return { out: pts[0], in: pts[pts.length - 1], toIn: pts, door: { o, u } };
  }
  finish(w, i) {
    if (w.bus && w.counted) { w.bus.walking = Math.max(0, (w.bus.walking || 0) - 1); w.counted = false; }
    w.obj.visible = false; this.setOpacity(w, 1);
    this.pools[w.vi].push(w); this.walkers.splice(i, 1);
  }
  setOpacity(w, o) {
    if (w.op === o) return; w.op = o;
    for (const [m] of w.mats) { m.transparent = o < 1; m.opacity = o; m.depthWrite = o >= 1; }
    w.blob.material.opacity = o;
  }

  walk(id, pts, mode, bus, yaw0, release, door, sit) {
    const vi = this.variantOf(id);
    let w = this.pools[vi].pop();
    if (!w) {
      if (this.walkers.length >= 150) {          // הרבה מאוד הולכים בבת אחת: מסיימים את הוותיק ביותר במקום לבטל את החדש
        const j = this.walkers.findIndex(x => x.mode === 'alight'); if (j < 0) return;
        this.finish(this.walkers[j], j);
        w = this.pools[vi].pop();
      }
      w = w || this.makeWalker(vi);
    }
    for (const [m, k, flat, base] of w.mats) m.color.copy(base).multiply(this.tint(id, k, flat, this.tmpC));
    this.setOpacity(w, 1);
    w.pts = pts.map(p => p.clone()); w.lens = [];
    for (let j = 0; j < w.pts.length - 1; j++) w.lens.push(Math.max(0.05, w.pts[j].distanceTo(w.pts[j + 1])));
    w.seg = 0; w.d = 0; w.speed = 0; w.hold = 0; w.p = null; w.sim = null; w.mode = mode; w.bus = bus; w.release = release; w.door = door || null; w.baseY = pts[0].y;
    w.counted = !!bus; if (bus) bus.walking = (bus.walking || 0) + 1;
    w.body.scale.setScalar(this.personScale(id));
    w.obj.rotation.y = yaw0 ?? Math.atan2(w.pts[1].x - w.pts[0].x, w.pts[1].z - w.pts[0].z);
    w.obj.position.copy(w.pts[0]); w.obj.visible = true;
    // מתחילים את ההליכה מנקודה אחרת במחזור, כדי שלא כולם ידרכו באותו צעד
    if (w.mixer) { w.mixer.setTime(hash(id + 31) * 2); this.centre(w); }
    // קם מהספסל: מתחילים בתנוחת הישיבה, ובשנייה הראשונה עוברים בהדרגה לעמידה (rising)
    w.rise = sit && w.mixer && w.bones ? { t: 0, dur: 0.8, sit, t0: hash(id + 31) * 2, s: this.personScale(id) } : null;
    if (w.rise) this.rising(w, 0);
    this.walkers.push(w);
    return w;
  }
  makeWalker(vi) {
    const V = this.variants[vi], mats = [];
    const obj = new THREE.Group(), body = new THREE.Group(); obj.add(body);
    let mixer = null, inner = null, hips = null, clip = null;
    if (V.gltf) {
      inner = SkeletonUtils.clone(V.gltf.scene);
      body.add(inner);
      hips = inner.getObjectByName('Hips');
      const cache = new Map();
      inner.traverse(o => {
        if (!o.isMesh) return;
        const kind = partKind(o.material.name + ' ' + o.name);
        let m = cache.get(o.material);
        if (!m) { m = gameMaterial(o.material, kind); cache.set(o.material, m); mats.push([m, kind, false, m.color.clone()]); }
        o.material = m; o.frustumCulled = false;
      });
      clip = V.gltf.animations.find(a => /walk/i.test(a.name));
      if (clip) { mixer = new THREE.AnimationMixer(inner); mixer.clipAction(clip).play(); }
    } else {
      for (const gr of V.groups) {
        const m = new THREE.MeshLambertMaterial(); mats.push([m, gr.kind, true, new THREE.Color(1, 1, 1)]);
        body.add(new THREE.Mesh(gr.geo, m));
      }
    }
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat.clone()); blob.position.y = 0.015; blob.renderOrder = 1; obj.add(blob);
    this.group.add(obj);
    const legs = inner && ['Left', 'Right'].map(sd => ({ up: inner.getObjectByName(sd + 'UpLeg'), knee: inner.getObjectByName(sd + 'Leg'),
      foot: inner.getObjectByName(sd + 'Foot'), toe: inner.getObjectByName(sd + 'ToeBase') }));
    const bones = inner && new Map(); if (inner) inner.traverse(o => { if (o.isBone) bones.set(o.name, o); });
    const w = { obj, body, mixer, mats, inner, hips, blob, vi, bones, legs: legs && legs.every(l => l.up && l.knee && l.foot && l.toe) ? legs : null };
    if (w.legs && mixer) {
      // הגובה הנמוך ביותר של הקרסול ושל הבוהן בזמן ההליכה (כף הרגל על הרצפה)
      let ra = Infinity, rt = Infinity; const P = new THREE.Vector3(), dur = clip ? clip.duration : 1.2;
      for (let k = 0; k < 24; k++) { mixer.setTime(k / 24 * dur); obj.updateMatrixWorld(true);
        for (const l of w.legs) { ra = Math.min(ra, l.foot.getWorldPosition(P).y); rt = Math.min(rt, l.toe.getWorldPosition(P).y); } }
      w.rest = { a: ra - obj.position.y, t: rt - obj.position.y };
    }
    return w;
  }
  // מדרגות בדלת: כל כף רגל נוחתת על הגובה שמתחתיה (מדרכה 0.12, מדרגה 0.34, רצפה 0.66).
  // הגוף בגובה הרגל הנמוכה, והרגל הגבוהה מתכופפת אליה (IK של ירך-שוק). כך אין רגל שנבלעת במדרגה
  stairs(w, dt) {
    const { o, u } = w.door, g = p => { const dx = (p.x - o.x) * u.x + (p.z - o.z) * u.z; return dx < 0.6 ? 0.12 : dx < 1.0 ? 0.34 : 0.66; };
    const A = this.tmpA || (this.tmpA = new THREE.Vector3()), T = this.tmpT || (this.tmpT = new THREE.Vector3());
    w.obj.position.y = w.baseY; w.obj.updateMatrixWorld(true);
    // גם קצת לפני הבוהן: הרגל עולה לפני שפת המדרגה, כדי שהשוק לא תעבור דרך הפינה
    const ahead = new THREE.Vector3(Math.sin(w.obj.rotation.y), 0, Math.cos(w.obj.rotation.y)).multiplyScalar(0.12);
    const gr = w.legs.map(l => Math.max(g(l.foot.getWorldPosition(A)), g(l.toe.getWorldPosition(T)), g(T.add(ahead))));
    const want = Math.min(gr[0], gr[1]);
    w.baseY += (want - w.baseY) * Math.min(1, dt * 10);
    w.obj.position.y = w.baseY; w.obj.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(w.obj.rotation.y), 0, Math.cos(w.obj.rotation.y));
    w.legs.forEach((l, k) => {
      l.foot.getWorldPosition(A); l.toe.getWorldPosition(T);
      const sc = w.body.scale.y;
      const need = Math.max(gr[k] - (A.y - w.rest.a * sc), gr[k] - (T.y - w.rest.t * sc));
      if (need > 0.003) twoBone(l.up, l.knee, l.foot, A.clone().setY(A.y + need), fwd);
    });
  }
  // קימה מהספסל: כל עצם עובר מתנוחת הישיבה (האפויה) אל הצעד הראשון של ההליכה, האגן עולה ומתקדם אל מעל כפות הרגליים,
  // והגב נוטה קדימה באמצע (כמו שקמים באמת). כפות הרגליים נשארות על הקרקע. מחזיר true כל עוד הקימה נמשכת
  rising(w, dt) {
    const r = w.rise; r.t += dt;
    const k0 = Math.min(1, r.t / r.dur), k = k0 * k0 * (3 - 2 * k0);
    w.mixer.setTime(r.t0);
    const T = this.tmpQ;
    for (const [name, q] of r.sit.quats) { const b = w.bones.get(name); if (!b) continue; T.copy(b.quaternion); b.quaternion.copy(q).slerp(T, k); }
    // האצבעות שצומצמו בישיבה (סגורות) חוזרות בהדרגה לרוחב הרגיל
    if (r.sit.scales) for (const [name, sc] of r.sit.scales) { const b = w.bones.get(name); if (!b) continue; if (!r.orig) r.orig = new Map(); if (!r.orig.has(name)) r.orig.set(name, b.scale.clone()); b.scale.copy(sc).lerp(r.orig.get(name), k); }
    w.body.scale.set(r.s, 1 + (r.s - 1) * k, r.s);
    this.centre(w);
    // האגן: מהמושב (מאחורי כפות הרגליים ונמוך) אל העמידה
    const h = w.body.worldToLocal(w.hips.getWorldPosition(new THREE.Vector3()));
    const want = r.sit.hip.clone().sub(r.sit.feet);
    w.inner.position.addScaledVector(want.sub(h), 1 - k);
    w.obj.updateMatrixWorld(true);
    // נטייה קדימה באמצע הקימה
    const lb = w.bones.get('LowerBack');
    if (lb) turn(lb, new THREE.Vector3(Math.cos(w.obj.rotation.y), 0, -Math.sin(w.obj.rotation.y)), 26 * Math.sin(Math.PI * k0) * (1 - k0 * 0.5));
    // כפות הרגליים: נשארות במקום שבו היו בישיבה, ועוברות בהדרגה למקום של הצעד הראשון
    if (w.legs) {
      const fwd = new THREE.Vector3(Math.sin(w.obj.rotation.y), 0, Math.cos(w.obj.rotation.y));
      w.legs.forEach((l, j) => {
        const sitA = r.sit.ankles[j]; if (!sitA) return;
        const A0 = w.body.localToWorld(sitA.clone().sub(r.sit.feet));
        const A1 = l.foot.getWorldPosition(new THREE.Vector3());
        const fq = l.foot.getWorldQuaternion(new THREE.Quaternion());
        twoBone(l.up, l.knee, l.foot, A0.lerp(A1, k), fwd.clone().add(new THREE.Vector3(0, 0.3, 0)));
        // כף הרגל שומרת על הכיוון שלה בעולם (שטוחה על הקרקע)
        const pq = l.foot.parent.getWorldQuaternion(new THREE.Quaternion());
        l.foot.quaternion.copy(pq.invert().multiply(fq)); l.foot.updateWorldMatrix(false, true);
      });
    }
    if (k0 >= 1) { w.rise = null; w.body.scale.setScalar(r.s); return false; }
    return true;
  }
  // ההליכה במקום: מזיזים את הדמות כך שהאגן יישאר מעל נקודת ההליכה
  centre(w) {
    if (!w.hips) return;
    w.inner.position.set(0, 0, 0); w.obj.updateMatrixWorld(true);
    const h = w.body.worldToLocal(w.hips.getWorldPosition(new THREE.Vector3()));
    w.inner.position.set(-h.x, 0, -h.z);
  }
}
