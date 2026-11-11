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
// כריעה: הצד של הדלתות יורד (סיבוב קטן סביב הציר האורכי, הצד השני ‎x = far‏ נשאר). bus.kneel — 0..1 (כפתור במבט נהג)
export const KNEEL = { th: 0.0304, far: 1.25 };
export const kneelDrop = (k, x) => k * KNEEL.th * (KNEEL.far - x);

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
        // רצועות האחיזה (js/straps.js)
        try { addStraps(this.asset.scene); } catch (e) { console.warn('straps failed', e); }
        cutDoorPanels(this.asset.scene);
        tuneBusMaterials(this.asset.scene, this.scene.userData.envMap); this.tuned = true; }
      obj = this.asset.scene.clone(true);
      const clip = this.asset.animations.find(a => /DoorsOpen/i.test(a.name)) || this.asset.animations[0];
      if (clip) {
        // שתי הדלתות לחוד (במבט נהג פותחים כל אחת בנפרד): הקליפ מתפצל לדלת הקדמית ולאמצעית
        mixer = new THREE.AnimationMixer(obj);
        const sp = this.doorClips || (this.doorClips = ['Front', 'Mid'].map(k => new THREE.AnimationClip('Doors' + k, clip.duration, clip.tracks.filter(t => t.name.includes(k)))));
        action = sp.map(c => { const a = mixer.clipAction(c); a.play(); a.paused = true; return a; });
      }
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
      // כריעה: הצד של הדלתות יורד, הצד השני נשאר
      const kn = b.kneel ? b.kneel * KNEEL.th : 0;
      v.obj.position.set(p.x, -kn * KNEEL.far, -p.y); v.obj.rotation.set(0, p.yaw, kn);
      v.obj.visible = b.state !== 'done' || b.t < 1.2;
      if (v.action) { const [aF, aM] = v.action, d = aF.getClip().duration * 0.999; aF.time = (b.dF ?? b.door) * d; aM.time = (b.dM ?? b.door) * d; v.mixer.update(0); }
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

// עומד באוטובוס ומחזיק בעמוד אנכי: היד hand ('Left'/'Right') סוגרת על העמוד שלפניו ובצד (dx, dz מהאגן, בגובה האחיזה מעל הרצפה).
// אגרוף סביב עמוד: האמה קדימה, האגודל למעלה, כף היד אל העמוד והאצבעות מקיפות אותו. origin — הרצפה מתחת לאגן
function buildStander(gltf, hand, dx, dz, gripH, poleR = 0.02) {
  const root = SkeletonUtils.clone(gltf.scene);
  const idle = gltf.animations.find(a => /idle/i.test(a.name));
  if (idle) { const mx = new THREE.AnimationMixer(root); mx.clipAction(idle).play(); mx.update(0); }
  root.updateMatrixWorld(true);
  const B = n => root.getObjectByName(n), W = o => o.getWorldPosition(new THREE.Vector3());
  const hips = B('Hips'), hd = B(hand + 'Hand'), fb = B(hand + 'FingerBase'), f1 = B(hand + 'HandFinger1'), th = B(hand === 'Left' ? 'LThumb' : 'RThumb');
  if (!hips || !hd || !fb) return null;
  let ground = Infinity;
  for (const { P } of skinVerts(root)) for (let i = 1; i < P.length; i += 3) ground = Math.min(ground, P[i]);
  const origin = W(hips).setY(ground);
  // כיוון כף היד בעמידה (הכפות פונות אל הגוף)
  const inward = new THREE.Vector3(Math.sign(W(hips).x - W(hd).x), 0, 0), wq0 = hd.getWorldQuaternion(new THREE.Quaternion());
  let palm = null, bd = 0;
  for (const ax of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) { const d = ax.clone().applyQuaternion(wq0).dot(inward); if (Math.abs(d) > Math.abs(bd)) { bd = d; palm = ax; } }
  palm = palm.clone().multiplyScalar(Math.sign(bd));
  const pole = origin.clone().add(new THREE.Vector3(dx, gripH ?? (W(B(hand + 'Arm')).y - ground - 0.17), dz)), up = new THREE.Vector3(0, 1, 0);
  const sh = W(B(hand + 'Arm')), h = pole.clone().sub(sh).setY(0).normalize();             // האמה והיד — אל העמוד, אופקית
  const n = new THREE.Vector3().crossVectors(up, h).multiplyScalar(hand === 'Right' ? 1 : -1); // כף היד פונה אל העמוד (האגודל למעלה)
  const handLen = W(hd).distanceTo(W(fb));
  const wrist = pole.clone().addScaledVector(h, -(handLen + 0.015)).addScaledVector(n, -(poleR + 0.032));
  twoBone(B(hand + 'Arm'), B(hand + 'ForeArm'), hd, wrist, new THREE.Vector3(hand === 'Right' ? -0.6 : 0.6, -1, -0.3));
  aimBone(hd, fb, W(hd).add(h));
  const pw = palm.clone().applyQuaternion(hd.getWorldQuaternion(new THREE.Quaternion())); pw.addScaledVector(h, -pw.dot(h)).normalize();
  turn(hd, h, THREE.MathUtils.radToDeg(Math.atan2(new THREE.Vector3().crossVectors(pw, n).dot(h), pw.dot(n))));
  const P = palm.clone().applyQuaternion(hd.getWorldQuaternion(new THREE.Quaternion()));
  const curl = (bone, deg) => { if (!bone) return; const d = new THREE.Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())); turn(bone, new THREE.Vector3().crossVectors(d, P), deg); };
  curl(fb, 40); curl(f1, 80); curl(th, 40);
  root.updateMatrixWorld(true);
  return { root, origin, hip: W(hips).sub(origin), hand: W(hd).sub(origin) };
}

// ---------- אנשים
// כמה דגמים שונים של אנשים (MPFB), כל אחד עם הטקסטורות שלו. הגיוון הנוסף: גוון עדין לבגדים ושינוי קטן בגובה.
// במצב ?placeholders — דמויות פשוטות בצבעים אחידים (כמו קודם)
// הגיל של כל דגם (tools/person_variants.py): מבוגרים יושבים ראשונים, צעירים משאירים מקום
const AGE = { person_3: 'old', person_4: 'old', person_2: 'young', person_6: 'young' };
const XFER_MAX = 40;                        // הולכים למעבר בבת אחת לכל היותר (השאר — כמו יורדים רגילים)
const SIT_MAX = 256, SIT_GAP = 0.012;
export const STAND_POLE = { dx: 0.28, dz: 0.25 };   // העמוד ביחס לאגן של העומד: לצד המעבר ולפניו
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
// המראות של הנוסעים — כמו באוטובוס עירוני בארץ: חיילים במדים זיתיים עם תיק גב גדול (בלי סמלים), תלמידים בחולצת
// בית ספר תכלת/לבנה עם סמל קטן ותיק גדול, סטודנטים עם תיק מחשב, מבוגרים עם שקית קניות, עובדים באפוד זוהר,
// כיפה סרוגה לחלק מהגברים (דגמים 0, 4, 6, 8) ומטפחת לחלק מהנשים (1, 2, 3), ובגדים יומיומיים. לכל דגם (vi) כמה מראות, בלי לשנות שלד או תנועה.
// shirt/pants — מהפלטות SHIRTS/PANTS_P (null — הבגד המקורי בגוון עדין); pat: 1 פסים, 2 אפוד זוהר, 3 בית ספר, 4 מדים, 5 משבצות;
// short — שרוול קצר; strap: 1 תיק גב, 2 תיק צד; acc — אביזרים (markInsp: out.acc); hair/shoes — גוון לשיער ולנעליים; w — משקל
const L_ = (vi, name, o = {}) => ({ vi, name, shirt: null, pants: 0, pat: 0, short: false, strap: 0, acc: [], hair: null, shoes: null, w: 1, ...o });
const ARMY = { shirt: 2, pants: 2, pat: 4, strap: 1, acc: ['army'], shoes: 0x5a4632 };
export const LOOKS = [
  L_(0, 'יומיומי', { w: 2 }), L_(0, 'חייל', ARMY), L_(0, 'כיפה, חולצה לבנה', { shirt: 0, pants: 1, acc: ['kippah'] }), L_(0, 'עובד באפוד זוהר', { shirt: 3, pants: 0, pat: 2 }), L_(0, 'סטודנט', { shirt: 5, pants: 0, short: true, strap: 2, acc: ['side'], hair: 0x8a6a4a }),
  L_(1, 'יומיומית', { w: 2 }), L_(1, 'תלמידה', { shirt: 1, pants: 0, pat: 3, short: true, strap: 1, acc: ['school'] }), L_(1, 'חיילת', ARMY), L_(1, 'סטודנטית', { shirt: 12, pants: 0, short: true, strap: 2, acc: ['side'], hair: 0x5a3a26 }), L_(1, 'מטפחת', { shirt: 9, pants: 6, acc: ['scarf'] }),
  L_(2, 'יומיומית', { w: 2 }), L_(2, 'עובדת', { shirt: 4, pants: 4, pat: 2 }), L_(2, 'מטפחת', { shirt: 1, pants: 5, acc: ['scarf'] }), L_(2, 'חולצה ירוקה', { shirt: 8, pants: 0, short: true }),
  L_(3, 'יומיומית', { w: 2 }), L_(3, 'מטפחת', { shirt: 6, pants: 1, acc: ['scarf'] }), L_(3, 'עם קניות', { shirt: 9, pants: 4, acc: ['shop'] }), L_(3, 'מטפחת וקניות', { shirt: 11, pants: 1, acc: ['scarf', 'shop'] }),
  L_(4, 'חליפה', { w: 2 }), L_(4, 'חליפה וכיפה', { acc: ['kippah'] }), L_(4, 'עם קניות', { shirt: 5, pants: 3, acc: ['shop'] }), L_(4, 'כיפה, חולצה לבנה', { shirt: 0, pants: 1, acc: ['kippah'] }),
  L_(5, 'יומיומית', { w: 2 }), L_(5, 'חיילת', ARMY), L_(5, 'סטודנטית', { shirt: 13, pants: 0, strap: 2, acc: ['side'] }), L_(5, 'חולצה אדומה', { shirt: 7, pants: 1, short: true, hair: 0x6a4a30 }),
  L_(6, 'יומיומי', { w: 2 }), L_(6, 'תלמיד', { shirt: 0, pants: 5, pat: 3, short: true, strap: 1, acc: ['school'] }), L_(6, 'תלמיד עם כיפה', { shirt: 1, pants: 1, pat: 3, short: true, strap: 1, acc: ['school', 'kippah'] }), L_(6, 'חולצה כתומה', { shirt: 4, pants: 0, short: true, hair: 0x3a2618 }),
  L_(7, 'יומיומית', { w: 2 }), L_(7, 'חולצה ירוקה', { shirt: 8, pants: 0, short: true }), L_(7, 'סטודנטית', { shirt: 14, pants: 1, strap: 2, acc: ['side'] }), L_(7, 'חיילת', ARMY),
  L_(8, 'יומיומי', { w: 2 }), L_(8, 'חייל', ARMY), L_(8, 'כיפה', { shirt: 0, pants: 1, acc: ['kippah'] }), L_(8, 'עובד', { shirt: 3, pants: 4, pat: 2 }), L_(8, 'משבצות', { shirt: 7, pants: 0, pat: 5 }),
];
const ACC_COLOR = { kippah: [0x1d2a44, 0xf0f0f0, 0x3a3a3a, 0x7a2a2a], scarf: [0x6e2337, 0x22324f, 0x3f6d6a, 0x9a7b5a, 0x4a3d6b], pack: [0x23272e, 0x1f3a5f, 0x7a2a2a], school: [0xd23a3a, 0x2b6cb0, 0x3f8a4a, 0xe08a1e], army: [0x4f5638], side: [0x1d1e22, 0x3a3f47], shop: [0xf2f2ee, 0xcfe3f2, 0xf2d6dc] };
function partKind(name) {
  const n = name.toLowerCase();
  if (n.includes('shoe') || n.includes('boot')) return 'shoes';
  if (/brow|lash/.test(n)) return 'brow';            // גבות וריסים — נפרדים מהשיער (מטפחת מסתירה את השיער, לא את הגבות)
  if (/hair|short0|long0|bob0|ponytail|braid|afro/.test(n)) return 'hair';
  if (/eye|cornea|low-poly|high-poly/.test(n)) return 'eyes';
  if (/body|lips|nail|ears|skin|teeth|tongue/.test(n)) return 'skin';
  return 'cloth';
}
// חומר למשחק: Lambert עם הטקסטורה המקורית. שקיפות "חתוכה" (alphaTest) במקום שקיפות אמיתית —
// כך שיער וגבות נראים נכון גם בלי למיין את כל הדמויות
function gameMaterial(m, kind) {
  const card = kind === 'hair' || kind === 'brow';   // שיער, גבות וריסים — שקיפות חתוכה של 0.5
  const out = new THREE.MeshLambertMaterial({
    name: m.name, map: m.map || null, normalMap: m.normalMap || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
    alphaTest: m.map ? 0.5 : 0, transparent: false, side: kind === 'skin' || kind === 'eyes' ? THREE.FrontSide : THREE.DoubleSide,
  });
  if (out.map) out.map.anisotropy = 4;
  if (!card && out.map) out.alphaTest = 0.35;
  out.userData.kind = kind;
  if (kind === 'cloth') vestShader(out);
  return out;
}
// פקח (כמו פקחי התחבורה הציבורית בארץ): חולצה תכלת בשרוול קצר, מכנסיים ונעליים שחורים, כובע מצחייה שחור,
// רצועה שחורה באלכסון מהכתף לירך עם תיק קטן, מצלמת גוף על החזה, ולפעמים עניבה כהה; בעמידה — מכשיר בדיקה ביד.
// הבגדים — בשיידר של הבגד, רק למי שהגוון שלו מסומן (INSP_FLAG; עם עניבה — INSP_TIE), לפי האזור של כל קודקוד
// (markInsp: גו, זרוע עליונה, אמה, רגליים) ומיקומו על הגו. הכובע והמכשיר — רשתות קטנות (PeopleLayer). הפנים והידיים — כמו תמיד
export const INSP_FLAG = 4, INSP_TIE = 5;
const SHIRT = new THREE.Color(0xbcd4ee), PANTS = new THREE.Color(0x15171b), DARK = new THREE.Color(0x0c0d10), TIE = new THREE.Color(0x1f2a44);
// בגדים של נוסעים (LOOKS): צבע לחולצה ולמכנסיים מתוך הפלטות, ודוגמה. מקודדים בגוון של הבגד (ערכים מ-10 ומעלה):
// r = 10 + חולצה, g = 10 + מכנסיים (+50 — שרוול קצר), b = 10 + דוגמה (+10 — רצועות תיק גב, +20 — רצועה באלכסון)
export const SHIRTS = [0xf4f4f2, 0xa9cdec, 0x5d6440, 0xd9ff3a, 0xff8a1e, 0x8d9096, 0x22324f, 0xb3312c, 0x3f7d4a, 0xcdbb98, 0x1d1e22, 0x6e2337, 0xe39ab3, 0x2b8a8a, 0xe7d36a, 0x7a5a9e];
export const PANTS_P = [0x2f4a72, 0x16171a, 0x55593a, 0xc8b38c, 0x5c5f66, 0x1f2b44, 0x3b2f2a];
const SHIRT_U = SHIRTS.map(c => new THREE.Color(c)), PANTS_U = PANTS_P.map(c => new THREE.Color(c));
function vestShader(m) {
  const U = m.userData.insp = { skinC: { value: new THREE.Color(0.75, 0.56, 0.44) }, vTop: { value: 0.5 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { shirtC: { value: SHIRT }, pantsC: { value: PANTS }, darkC: { value: DARK }, tieC: { value: TIE }, skinC: U.skinC, vTop: U.vTop, shirtP: { value: SHIRT_U }, pantsP: { value: PANTS_U } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 vest;\nvarying vec3 vVest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVest = vest;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vVest;\nuniform vec3 shirtC, pantsC, darkC, tieC, skinC;\nuniform vec3 shirtP[16];\nuniform vec3 pantsP[7];\nuniform float vTop;')
      .replace('#include <color_fragment>', `float inspF = diffuse.r; vec3 code = diffuse;
#ifdef USE_COLOR
if (vColor.r > inspF) { inspF = vColor.r; code = vColor.rgb; }
#endif
#include <color_fragment>
if (inspF > 9.5) {
  // נוסע בבגדים מהפלטה (LOOKS): הצבע מהפלטה, הקפלים מהטקסטורה
  vec3 base = diffuseColor.rgb / max(code, vec3(1.0));
  float lum = clamp(dot(base, vec3(0.299, 0.587, 0.114)), 0.0, 1.0), sh = 0.72 + 0.45 * lum;
  float si = floor(code.r + 0.01) - 10.0, gi = floor(code.g + 0.01) - 10.0, bi = floor(code.b + 0.01) - 10.0;
  float shortS = step(49.5, gi); gi -= 50.0 * shortS;
  float strap = floor(bi / 10.0 + 0.001); float pat = bi - 10.0 * strap;
  vec3 sc = shirtP[int(clamp(si, 0.0, 15.0))], pc = pantsP[int(clamp(gi, 0.0, 6.0))];
  float reg = floor(vVest.x + 0.01), front = step(0.25, vVest.x - reg);
  float u = vVest.y, v = vVest.z / max(0.2, vTop);
  if (reg > 0.5 && reg < 3.5) {
    vec3 c = sc;
    if (pat > 0.5 && pat < 1.5 && fract(v * 9.0) < 0.42) c = mix(sc, vec3(0.95), 0.75);                       // פסים
    if (pat > 1.5 && pat < 2.5 && reg < 2.5 && (abs(v - 0.38) < 0.035 || abs(v - 0.58) < 0.035)) c = vec3(0.86, 0.88, 0.9);   // אפוד זוהר: פסים מחזירי אור
    if (pat > 2.5 && pat < 3.5 && reg < 1.5 && front > 0.5 && length(vec2(u - 0.08, v - 0.66)) < 0.045) c = vec3(0.12, 0.28, 0.6);   // חולצת בית ספר: סמל קטן
    if (pat > 3.5 && pat < 4.5 && fract(u * 11.0 + v * 3.0) < 0.5 && fract(v * 7.0 - u * 2.0) < 0.5) c = sc * 0.82;   // מנומר עדין (מדים)
    if (pat > 4.5 && pat < 5.5 && (fract(v * 8.0) < 0.2 || fract(u * 8.0) < 0.2)) c = sc * 0.7;                     // משבצות
    if (reg < 1.5 && strap > 0.5 && strap < 1.5 && abs(abs(u) - 0.09) < 0.022 && v > 0.45) c = vec3(0.1);            // רצועות תיק גב
    if (reg < 1.5 && strap > 1.5 && abs(u - (0.16 - 0.32 * clamp((v - 0.06) / 0.9, 0.0, 1.0))) < 0.02 && v > 0.04) c = vec3(0.1);   // רצועה באלכסון
    if (reg > 2.5 && shortS > 0.5) c = skinC * (0.85 + 0.25 * lum) / sh;
    diffuseColor.rgb = c * sh;
  } else {
    vec3 c = pc;
    if (pat > 3.5 && pat < 4.5 && fract(u * 11.0 + v * 3.0) < 0.5 && fract(v * 7.0 - u * 2.0) < 0.5) c = pc * 0.82;
    diffuseColor.rgb = c * (0.8 + 0.45 * lum);
  }
} else if (inspF > 2.5) {
  vec3 base = diffuseColor.rgb / inspF;
  float lum = dot(base, vec3(0.299, 0.587, 0.114)), sh = 0.8 + 0.35 * lum;
  float reg = floor(vVest.x + 0.01), front = step(0.25, vVest.x - reg);
  float u = vVest.y, v = vVest.z / max(0.2, vTop);
  if (reg > 0.5 && reg < 2.5) {
    vec3 c = shirtC * sh;
    // רצועה באלכסון: מהכתף השמאלית (‎+u) לירך הימנית, מלפנים ומאחור; תיק קטן בירך; מצלמת גוף; עניבה
    float ul = -0.16 + 0.32 * clamp((v - 0.06) / 0.9, 0.0, 1.0);
    if (reg < 1.5 && abs(u - ul) < 0.026 && v > 0.04) c = darkC;
    if (reg < 1.5 && front > 0.5 && u < -0.05 && u > -0.11 && v > 0.62 && v < 0.72) c = darkC;   // מצלמת גוף — בצד ימין של החזה (הרצועה בשמאל)
    if (reg < 1.5 && front > 0.5 && inspF > 4.5 && abs(u) < 0.028 + 0.012 * step(0.86, v) && v > 0.22 && v < 0.96) c = tieC;
    diffuseColor.rgb = c;
  } else if (reg > 2.5 && reg < 3.5) diffuseColor.rgb = skinC * (0.85 + 0.25 * lum);     // אמה חשופה (שרוול קצר)
  else diffuseColor.rgb = pantsC * (0.9 + 0.4 * lum);
}`);
  };
  m.customProgramCacheKey = () => 'insp3';
}
// לכל קודקוד בבגדים: האזור (0 אגן ורגליים, 1 גו, 2 זרוע עליונה, 3 אמה; +0.5 — מלפנים. הסדר חשוב: הערך עובר אינטרפולציה בין
// קודקודים, ולכן אזורים שנוגעים זה בזה צמודים במספרים — בלי פס של אזור אחר בגבול) ומיקומו ביחס לאגן
// (u — לרוחב, שמאלה של הדמות חיובי; v — גובה מעל האגן), בתנוחת העמידה. נשמר בגאומטריה המקורית (vest) — משותף לכולם
const REGION = [[/^(LowerBack|Spine|Spine1|LeftShoulder|RightShoulder|Neck|Neck1)$/, 1], [/^(LeftArm|RightArm)$/, 2], [/^(LeftForeArm|RightForeArm|LeftHand|RightHand|LThumb|RThumb|LeftFingerBase|RightFingerBase|LeftHandFinger1|RightHandFinger1)$/, 3]];
function markInsp(gltf) {
  const root = gltf.scene; if (root.userData.insp) return root.userData.insp; 
  const idle = gltf.animations.find(a => /idle/i.test(a.name));
  const R = SkeletonUtils.clone(root);
  if (idle) { const mx = new THREE.AnimationMixer(R); mx.clipAction(idle).play(); mx.update(0); }
  const verts = skinVerts(R), srcs = []; root.traverse(o => { if (o.isMesh) srcs.push(o); });
  const hips = R.getObjectByName('Hips'), c = hips ? hips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  let top = 0, zf = -Infinity, minY = Infinity; const torso = [], hd = { n: 0, x: 0, z: 0, top: -Infinity, pts: [] };
  verts.forEach(({ o, P, N, kind }, k) => {
    for (let i = 1; i < P.length; i += 3) minY = Math.min(minY, P[i]);
    // הראש: קודקודי עור ושיער ששייכים לעצם הראש — המרכז והגובה העליון (לכובע)
    if ((kind === 'skin' || kind === 'hair') && o.isSkinnedMesh) {
      const gg = srcs[k].geometry, si0 = gg.attributes.skinIndex, sw0 = gg.attributes.skinWeight, bs = o.skeleton.bones;
      for (let i = 0; i < gg.attributes.position.count; i++) { let h = 0; for (let j = 0; j < 4; j++) if (bs[si0.getComponent(i, j)]?.name === 'Head') h += sw0.getComponent(i, j);
        if (h < 0.6) continue; const y = P[i * 3 + 1]; if (kind === 'skin') { hd.n++; hd.x += P[i * 3]; hd.z += P[i * 3 + 2]; hd.top = Math.max(hd.top, y); }
        hd.pts.push(P[i * 3], y, P[i * 3 + 2]); }
    }
    const g = srcs[k].geometry, n = g.attributes.position.count, A = new Float32Array(n * 3);
    g.setAttribute('vest', new THREE.BufferAttribute(A, 3));
    if (kind !== 'cloth' || !o.isSkinnedMesh) return;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones;
    for (let i = 0; i < n; i++) {
      const w = [0, 0, 0, 0];
      for (let j = 0; j < 4; j++) { const ww = sw.getComponent(i, j); if (!ww) continue; const nm = bones[si.getComponent(i, j)]?.name || ''; const r = REGION.find(([re]) => re.test(nm)); w[r ? r[1] : 0] += ww; }
      let reg = 0; if (w[1] >= 0.5) reg = 1; else if (w[2] >= Math.max(w[1], w[3], w[0])) reg = 2; else if (w[3] >= 0.5) reg = 3; else if (w[1] > w[0]) reg = 1;
      const u = P[i * 3] - c.x, v = P[i * 3 + 1] - c.y, z = P[i * 3 + 2] - c.z;
      A[i * 3] = reg; A[i * 3 + 1] = u; A[i * 3 + 2] = v;
      if (reg === 1) { top = Math.max(top, v); zf = Math.max(zf, z); torso.push([A, i, z, N ? N[i * 3 + 2] : 0]); }
    }
  });
  for (const [A, i, z, nz] of torso) if (nz > 0.15 && z > zf - 0.16) A[i * 3] += 0.5;
  // הראש והיד הימנית בתנוחת העמידה (לכובע ולמכשיר), יחסית לאגן
  R.updateMatrixWorld(true);
  const bone = n => R.getObjectByName(n), head = bone('Head'), hand = bone('RightHand');
  const out = { vTop: top * 0.92 }, off = new THREE.Vector3(c.x, minY, c.z);
  if (head && hd.n) {
    // הכובע מותאם לראש ולשיער של כל דגם: הכיפה מקיפה את החלק העליון (עור ושיער) והקודקוד שלה נוגע בשיער, בלי רווח
    // המרכז: אמצע המידות של הגולגולת (עור ושיער) בחלק העליון — לא הממוצע, שנמשך קדימה בגלל הפנים
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < hd.pts.length; i += 3) if (hd.pts[i + 1] > hd.top - 0.075) { x0 = Math.min(x0, hd.pts[i]); x1 = Math.max(x1, hd.pts[i]); z0 = Math.min(z0, hd.pts[i + 2]); z1 = Math.max(z1, hd.pts[i + 2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; let top = hd.top;
    for (let i = 0; i < hd.pts.length; i += 3) top = Math.max(top, hd.pts[i + 1]);
    // רדיוס הראש (עור) והשיער בחלק העליון; הכובע קצת רחב מהראש, ולא כמו כל השיער (שיער ארוך יוצא מתחתיו)
    let rS = 0.08, rH = 0;
    for (let i = 0; i < hd.pts.length; i += 3) { const r = Math.hypot(hd.pts[i] - cx, hd.pts[i + 2] - cz); if (hd.pts[i + 1] > top - 0.07) rH = Math.max(rH, r); }
    let sx = 0, sn = 0; for (let i = 0; i < hd.pts.length; i += 3) if (hd.pts[i + 1] > hd.top - 0.06 && hd.pts[i + 1] < hd.top - 0.02) { sx = Math.max(sx, Math.hypot(hd.pts[i] - cx, hd.pts[i + 2] - cz)); sn++; }
    if (sn) rS = sx;
    // שפת הכובע בגובה המצח (קצת מתחת לקודקוד העור), והכיפה גבוהה מספיק כדי לכסות את השיער שמעליו — בלי רווח
    // שפת הכובע בגובה המצח; הרדיוס מכסה גם את השיער בגובה השפה (תספורת קארה רחבה) — כדי שהשיער ייצא מתחת לכובע ולא מסביבו
    const base = hd.top - 0.062;
    let rRim = 0; for (let i = 0; i < hd.pts.length; i += 3) { const y = hd.pts[i + 1]; if (y > base - 0.004 && y < base + 0.035) rRim = Math.max(rRim, Math.hypot(hd.pts[i] - cx, hd.pts[i + 2] - cz)); }
    const rad = THREE.MathUtils.clamp(Math.max(rS + 0.006, rRim + 0.005), 0.092, 0.15), hCap = Math.max(rad * 0.72, top + 0.01 - base);
    out.headFit = { cx, cz, base, top, rad, hCap };
    out.capFit = { rS: +rS.toFixed(3), rH: +rH.toFixed(3), rRim: +rRim.toFixed(3), rad: +rad.toFixed(3), hCap: +hCap.toFixed(3) };
    const capW = new THREE.Matrix4().compose(new THREE.Vector3(cx, base, cz + 0.004), new THREE.Quaternion(), new THREE.Vector3(rad, hCap / 0.82, rad));
    out.capLocal = head.matrixWorld.clone().invert().multiply(capW);                       // בתוך עצם הראש (להולכים ולישיבה)
    out.capStand = capW.clone().premultiply(new THREE.Matrix4().makeTranslation(-off.x, -off.y, -off.z));
  }
  if (hand) {
    const hp = hand.getWorldPosition(new THREE.Vector3()), rW = new THREE.Matrix4().makeTranslation(hp.x - 0.01, hp.y - 0.075, hp.z + 0.045);
    out.readerLocal = hand.matrixWorld.clone().invert().multiply(rW);
    out.readerStand = rW.clone().premultiply(new THREE.Matrix4().makeTranslation(-off.x, -off.y, -off.z));
  }
  // התיק: על הירך הימנית (‎-x) — יחסית לעצם האגן
  // בפינה האחורית של הירך הימנית, צמוד לגוף ומסובב לאורכו (כמו תיק צד שנדחק אחורה): היד שמחזיקה את המכשיר
  // נשארת לפניו בצד, בלי שהמכשיר והתיק יתמזגו
  if (hips) { const bW = new THREE.Matrix4().compose(new THREE.Vector3(c.x - 0.145, c.y + 0.0, c.z - 0.125), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.92), new THREE.Vector3(1, 1, 1));
    out.bagLocal = hips.matrixWorld.clone().invert().multiply(bW);
    // בישיבה: התיק על הספסל ליד הירך הימנית (מאחורי הירך הוא היה נכנס בקיר)
    out.bagSitLocal = hips.matrixWorld.clone().invert().multiply(new THREE.Matrix4().makeTranslation(c.x - 0.25, c.y + 0.015, c.z + 0.02)); out.bagStand = bW.clone().premultiply(new THREE.Matrix4().makeTranslation(-off.x, -off.y, -off.z)); }
  // אביזרים של נוסעים (LOOKS): לכל אחד — העצם שהוא צמוד אליו, המטריצה בתוכו, והמטריצה בעמידה (יחסית לאגן ולקרקע)
  out.acc = {};
  const put = (name, boneName, W) => { const b = bone(boneName); if (!b) return; out.acc[name] = { bone: boneName, local: b.matrixWorld.clone().invert().multiply(W), stand: W.clone().premultiply(new THREE.Matrix4().makeTranslation(-off.x, -off.y, -off.z)) }; };
  const Hf = out.headFit;
  if (Hf) {
    // כיפה סרוגה: עיגול קטן ושטוח על החלק האחורי-עליון של הראש
    put('kippah', 'Head', new THREE.Matrix4().compose(new THREE.Vector3(Hf.cx, Hf.top - 0.012, Hf.cz - 0.04), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.5), new THREE.Vector3(0.066, 0.03, 0.066)));
    // מטפחת: מכסה את השיער מעל המצח ועד העורף (כיפה עמוקה שנוטה לאחור)
    { const cy = Hf.top - 0.112; put('scarf', 'Head', new THREE.Matrix4().compose(new THREE.Vector3(Hf.cx, cy, Hf.cz - 0.008), new THREE.Quaternion(), new THREE.Vector3(Hf.rad * 0.98, Hf.top + 0.012 - cy, Hf.rad * 1.06))); }
  }
  // תיקי גב: על הגב העליון, צמודים (לפי הקודקודים של הגב בגובה השכמות)
  let zBack = 0; for (const [A, i, z] of torso) { const v = A[i * 3 + 2]; if (v > top * 0.35 && v < top * 0.8) zBack = Math.min(zBack, z); }
  const sp = bone('Spine1') ? 'Spine1' : 'Spine';
  for (const [name, w, h, d] of [['pack', 0.29, 0.37, 0.13], ['school', 0.31, 0.4, 0.17], ['army', 0.36, 0.52, 0.22]])
    put(name, sp, new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y + top * 0.6 - (name === 'army' ? 0.04 : 0), c.z + zBack - d / 2 - 0.006), new THREE.Quaternion(), new THREE.Vector3(w, h, d)));
  // תיק צד (מחשב נייד): בפינה האחורית של הירך השמאלית, ברצועה באלכסון
  put('side', 'Hips', new THREE.Matrix4().compose(new THREE.Vector3(c.x + 0.15, c.y - 0.01, c.z - 0.12), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.92), new THREE.Vector3(0.06, 0.27, 0.36)));
  // שקית ניילון ביד שמאל: הידיות באחיזה של כף היד, השקית תלויה מתחתיה, לאורך הרגל
  const lh = bone('LeftHand'); if (lh) { const hp = lh.getWorldPosition(new THREE.Vector3()); put('shop', 'LeftHand', new THREE.Matrix4().compose(new THREE.Vector3(hp.x + 0.008, hp.y - 0.1, hp.z + 0.012), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1))); }
  return (root.userData.insp = out);
}
// הצבע הממוצע של העור (מהטקסטורה של הגוף) — לאמה החשופה של הפקח
function skinColor(groups) {
  const m = groups.find(g => g.kind === 'skin')?.mat?.map, img = m?.image; if (!img) return null;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data, acc = [0, 0, 0]; let n = 0;
    for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; if (d[i + 3] < 200 || l < 90 || l > 720) continue; acc[0] += d[i]; acc[1] += d[i + 1]; acc[2] += d[i + 2]; n++; }
    return n ? new THREE.Color().setRGB(acc[0] / n / 255, acc[1] / n / 255, acc[2] / n / 255, THREE.SRGBColorSpace) : null;
  } catch { return null; }
}
// הכובע (כיפה ומצחייה, פונה ל-‎+z) ומכשיר הבדיקה: גאומטריות משותפות
// מטפחת (טישל) ביחידות של הראש (רדיוס 1, המרכז בגובה האוזניים): מכסה את הקודקוד, המצח עד קו השיער, הצדדים עד
// מתחת לאוזניים והעורף; בעורף — קשר עם נפח. השפה התחתונה נמוכה מאחור וגבוהה מלפנים (לפי הכיוון)
function scarfGeo() {
  const g = new THREE.SphereGeometry(1, 64, 40), P = g.attributes.position, I = g.index, keep = [];
  // גובה השפה (sin של הזווית) לפי הכיוון: מלפנים (z=1) 0.42, בצדדים -0.25, מאחור -0.55
  const rim = (x, z) => { const a = Math.atan2(x, z), c = Math.cos(a); return c > 0 ? -0.25 + 0.67 * c * c : -0.25 - 0.3 * c * c; };
  for (let i = 0; i < I.count; i += 3) { const ids = [I.getX(i), I.getX(i + 1), I.getX(i + 2)];
    if (ids.every(k => P.getY(k) > rim(P.getX(k), P.getZ(k)) - 0.04)) keep.push(...ids); }
  g.setIndex(keep);
  const knot = new THREE.SphereGeometry(0.34, 12, 8).scale(1.1, 0.8, 0.75).translate(0, -0.42, -0.95).toNonIndexed();
  const tail = new THREE.SphereGeometry(0.22, 10, 6).scale(0.8, 1.4, 0.6).translate(0.05, -0.78, -0.92).toNonIndexed();
  return mergeGeometries([g.toNonIndexed(), knot, tail].map(x => { x.deleteAttribute('uv'); return x; }), false);
}
// שקית ניילון (במטרים, הראשית בנקודת האחיזה): גוף שמתרחב למטה, וידיות מהשקית אל היד
function shopGeo() {
  const body = new THREE.BoxGeometry(0.25, 0.27, 0.1, 4, 4, 2), P = body.attributes.position;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = 0.78 + 0.22 * (0.5 - y / 0.27); P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * (0.55 + 0.45 * (0.5 - y / 0.27))); }
  body.translate(0, -0.075 - 0.135, 0); body.computeVertexNormals();
  const h1 = new THREE.TorusGeometry(0.055, 0.007, 4, 10, Math.PI).translate(0, -0.075, 0.025), h2 = h1.clone().translate(0, 0, -0.05);
  return mergeGeometries([body.toNonIndexed(), h1.toNonIndexed(), h2.toNonIndexed()].map(x => { x.deleteAttribute('uv'); return x; }), false);
}
// אביזרי הנוסעים (בגודל יחידה; הגודל והמקום — במטריצה של כל דגם, markInsp: out.acc)
const ACC_GEO = {
  kippah: new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, Math.PI * 0.5),
  scarf: scarfGeo(),
  box: new THREE.BoxGeometry(1, 1, 1),
  shop: shopGeo(),
};
const ACC_KIND = { kippah: 'kippah', scarf: 'scarf', pack: 'box', school: 'box', army: 'box', side: 'box', shop: 'shop' };
const ACC_HEAD = new Set(['kippah', 'scarf']);           // נשארים גם בישיבה (את התיקים מורידים כשמתיישבים)
const capGeo = (() => {          // בגודל יחידה (רדיוס הכיפה 1): כיפה, מצחייה מעוקלת קדימה ומעט למטה, וכפתור למעלה
  const d = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.82, 1.06);
  const b = new THREE.CylinderGeometry(0.82, 0.82, 0.05, 20, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.95).translate(0, 0, 0.62 - 0.95).rotateX(0.16).translate(0, 0.012, 0.95);   // המצחייה יוצאת משפת הכיפה (מסתובבת סביב השפה)
  const btn = new THREE.SphereGeometry(0.09, 8, 4).translate(0, 0.8, 0);
  return mergeGeometries([d, b, btn].map(g => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; }), false); })()
const readerGeo = new THREE.BoxGeometry(0.075, 0.14, 0.026);
const bagGeo = new THREE.BoxGeometry(0.07, 0.18, 0.24);       // התיק הקטן בקצה הרצועה, על הירך הימנית (7×18×24 ס"מ)
const ACC_MAT = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.55 });
const CAP_MAT = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.75 });   // כובע כחול כהה (לא שחור מלא — רואים את הכיפה)
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
// כפות ידיים מול הגוף של אותו אדם: קודקודי כף היד והאצבעות (העצם העיקרי שלהם — יד/אצבעות/אגודל) מול המשולשים של
// האגן, הירכיים, השוקיים והגו (עור ובגדים). מחזיר לכל צד: כמה קודקודים בתוך הגוף ועד כמה עמוק
const HAND_B = /^(Left|Right)(Hand|FingerBase|HandFinger1)$|^(L|R)Thumb$/, BODY_B = /^(Hips|LHipJoint|RHipJoint|LowerBack|Spine|Spine1|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/;
export function handPen(root, verts = skinVerts(root)) {
  const C = 0.03, grid = new Map(), tris = [], hands = [];
  const key = (x, y, z) => `${Math.floor(x / C)},${Math.floor(y / C)},${Math.floor(z / C)}`;
  for (const { o, P, N, kind } of verts) {
    if (!o.isSkinnedMesh || (kind !== 'skin' && kind !== 'cloth')) continue;
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bs = o.skeleton.bones, n = g.attributes.position.count;
    const dom = new Array(n);
    for (let i = 0; i < n; i++) { let bw = 0, bn = ''; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; bn = bs[si.getComponent(i, j)]?.name || ''; } } dom[i] = bn; }
    for (let i = 0; i < n; i++) if (kind === 'skin' && HAND_B.test(dom[i])) hands.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2], dom[i].startsWith('L') ? 'Left' : 'Right']);
    const I = g.index, m = I ? I.count : n;
    for (let t = 0; t < m; t += 3) {
      const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2;
      if (!BODY_B.test(dom[a]) || !BODY_B.test(dom[b]) || !BODY_B.test(dom[c])) continue;
      const tr = new THREE.Triangle(new THREE.Vector3(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), new THREE.Vector3(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]), new THREE.Vector3(P[c * 3], P[c * 3 + 1], P[c * 3 + 2]));
      // הכיוון החוצה — מהנורמלים של הקודקודים (סדר הקודקודים במשולש לא תמיד אחיד)
      const nf = tr.getNormal(new THREE.Vector3());
      if (N) { const nv = new THREE.Vector3(N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]); if (nv.dot(nf) < 0) nf.negate(); }
      const id = tris.push({ tr, n: nf }) - 1, M = tr.getMidpoint(new THREE.Vector3());
      const k = key(M.x, M.y, M.z); (grid.get(k) || grid.set(k, []).get(k)).push(id);
    }
  }
  const out = { Left: { n: 0, depth: 0, gap: 1 }, Right: { n: 0, depth: 0, gap: 1 } }, q = new THREE.Vector3(), cp = new THREE.Vector3();
  for (const [x, y, z, side] of hands) {
    q.set(x, y, z); let best = null, bd = 0.05;
    const gx = Math.floor(x / C), gy = Math.floor(y / C), gz = Math.floor(z / C);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) { const ids = grid.get(`${gx + dx},${gy + dy},${gz + dz}`); if (!ids) continue;
      for (const id of ids) { tris[id].tr.closestPointToPoint(q, cp); const d = cp.distanceTo(q); if (d < bd) { bd = d; best = { id, d: q.clone().sub(cp).dot(tris[id].n) }; } } }
    if (best) out[side].gap = Math.min(out[side].gap, best.d);
    if (best && best.d < -0.001) { out[side].n++; out[side].depth = Math.max(out[side].depth, -best.d); }
  }
  out.n = out.Left.n + out.Right.n;
  return out;
}
// אצבעות רפויות: מקרבים את עצמות האצבעות והאגודל אל תנוחת המנוחה של הדגם (k — כמה, 0..1), כדי שכף היד תונח שטוחה
// על הירך ולא תיראה כמו טפרים
export function relaxFingers(root, gltf, k = 0.6) {
  const ref = gltf.scene, q = new THREE.Quaternion();
  for (const n of ['LeftFingerBase', 'LeftHandFinger1', 'LThumb', 'RightFingerBase', 'RightHandFinger1', 'RThumb']) {
    const b = root.getObjectByName(n), r = ref.getObjectByName(n); if (!b || !r) continue;
    b.quaternion.slerp(q.copy(r.quaternion), k);
  }
  root.updateMatrixWorld(true);
}
// מוציא כפות ידיים מתוך הגוף: מרים את פרק היד (בגובה החדירה + 1.5 ס"מ) ומעט החוצה מהגוף, באותו IK של זרוע-אמה,
// בלי לשנות את כיוון כף היד. עד 6 סבבים; מחזיר כמה קודקודים היו בפנים לפני ואחרי
export function unsinkHands(root) {
  const B = n => root.getObjectByName(n), W = o => o.getWorldPosition(new THREE.Vector3());
  const hips = B('Hips'); if (!hips) return { before: 0, after: 0 };
  // כף יד שמונחת על הירך: לא בתוכה ולא צמודה — לפחות 6 מ"מ מעל הבד (מרימים את פרק היד 1–2 ס"מ)
  const GAP = 0.006, need = P => P.n || P.gap < GAP;
  let pen = handPen(root); const before = pen.n, gap0 = Math.min(pen.Left.gap, pen.Right.gap);
  for (let it = 0; it < 6 && (need(pen.Left) || need(pen.Right)); it++) {
    for (const side of ['Left', 'Right']) {
      const P = pen[side]; if (!need(P)) continue;
      const arm = B(side + 'Arm'), fore = B(side + 'ForeArm'), hd = B(side + 'Hand'); if (!arm || !fore || !hd) continue;
      root.updateMatrixWorld(true);
      const hq = hd.getWorldQuaternion(new THREE.Quaternion()), h = W(hd), sh = W(arm), el = W(fore), out = Math.sign(h.x - W(hips).x) || 1;
      const pole = el.clone().sub(sh.clone().add(h).multiplyScalar(0.5));
      twoBone(arm, fore, hd, h.clone().add(new THREE.Vector3(0, Math.min(0.04, Math.max(P.depth, -Math.min(0, P.gap)) + GAP - Math.max(0, Math.min(GAP, P.gap)) + 0.006), 0)), pole);
      const pq = hd.parent.getWorldQuaternion(new THREE.Quaternion()); hd.quaternion.copy(pq.invert().multiply(hq));
    }
    root.updateMatrixWorld(true);
    pen = handPen(root);
  }
  return { before, after: pen.n, gap0: +gap0.toFixed(4), gap: +Math.min(pen.Left.gap, pen.Right.gap).toFixed(4) };
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
    try { relaxFingers(root, gltf, 0.3); (gltf.userData.unsink = gltf.userData.unsink || {}).stand = unsinkHands(root); } catch (e) { console.warn('unsink failed', e); }
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
    ng.setAttribute('vest', g.attributes.vest ? g.attributes.vest.clone() : new THREE.BufferAttribute(new Float32Array(P.length), 3));
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
      let IM = null; try { IM = markInsp(g); } catch (e) { console.warn('inspector look failed', e); }
      try { this.variants.push({ gltf: g, groups: bakeVariant(g, null, cache), age: AGE[(g.userData.file || '').replace(/^.*\//, '')] || '', insp: IM, cache }); }
      catch (e) { console.warn('bake person failed', e); continue; }
      // אותו אדם יושב על הספסל: תנוחה אפויה אחת לכל דגם (sitting.js)
      try {
        const vi = this.variants.length - 1, [armPose, side, pushFore] = POSE_OF[vi % POSE_OF.length];
        // התוצאות של החיפוש שמורות מראש (js/sitpresets.js) — כך הטעינה מהירה; דגם חדש או שונה — מחפשים מחדש
        const key = `${g.userData.file}|${armPose}|${side}|${pushFore ? 1 : 0}`;
        const S = buildSitter(g, skinVerts, BENCH.h, BENCH.wall - SIT_GAP - BENCH.d0 - 0.03, armPose, side, pushFore, SIT_PRESETS[key] || null);
        if (S) S.key = key;
        if (S) { const V = this.variants[this.variants.length - 1]; V.sit = S; try { relaxFingers(S.root, g, 0.85); (g.userData.unsink = g.userData.unsink || {}).bench = unsinkHands(S.root); } catch (e) { console.warn(e); } V.sitGroups = bakeVariant(g, S, cache);
          const hp = S.root.getObjectByName('Hips'); if (hp && IM?.bagLocal) { S.root.updateMatrixWorld(true); V.bagSit = hp.matrixWorld.clone().multiply(IM.bagSitLocal || IM.bagLocal).premultiply(new THREE.Matrix4().makeTranslation(-S.origin.x, -S.origin.y, -S.origin.z)); }
          const hb = S.root.getObjectByName('Head'); if (hb && IM?.capLocal) { S.root.updateMatrixWorld(true); V.capSit = hb.matrixWorld.clone().multiply(IM.capLocal).premultiply(new THREE.Matrix4().makeTranslation(-S.origin.x, -S.origin.y, -S.origin.z)); }
          // הרוחב של היושב לאורך הספסל (ציר x שלו), לבדיקת השכנים
          let lo = Infinity, hi = -Infinity; for (const gr of V.sitGroups) { const p = gr.geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x < lo) lo = x; if (x > hi) hi = x; } }
          V.sitExt = [lo, hi]; }
      } catch (e) { console.warn('sitting pose failed', e); }
    }
    this.fromGlb = this.variants.length > 0;
    // פקח: צבע העור של כל דגם (לאמה החשופה) וגובה הכתפיים — במשתנים של חומר הבגד
    for (const V of this.variants) { V.skin = skinColor(V.groups); for (const gr of [...V.groups, ...(V.sitGroups || [])]) { const U = gr.mat.userData.insp; if (!U) continue; if (V.skin) U.skinC.value.copy(V.skin); if (V.insp) U.vTop.value = V.insp.vTop; } }
    // הכובע ומכשיר הבדיקה של הפקחים (מעטים — עד 96)
    // רב-קו ביד של מי שמגיש לפקח (reachPose)
    this.card = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.054, 0.004), new THREE.MeshStandardMaterial({ color: 0x1e88e5, emissive: 0x0b4fa8, emissiveIntensity: 0.45, roughness: 0.45 })); this.card.visible = false; this.card.frustumCulled = false; this.card.matrixAutoUpdate = false; this.group.add(this.card);
    this.caps = new THREE.InstancedMesh(capGeo, CAP_MAT, 96); this.readers = new THREE.InstancedMesh(readerGeo, ACC_MAT, 96); this.bags = new THREE.InstancedMesh(bagGeo, ACC_MAT, 96);
    for (const im of [this.caps, this.readers, this.bags]) { im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.name = 'crowd-insp'; this.group.add(im); }
    // אביזרי הנוסעים (LOOKS) בקהל, בישיבה ובאוטובוס של הפקח — InstancedMesh לכל צורה, הצבע לכל אחד
    this.accIM = {};
    for (const k of Object.keys(ACC_GEO)) { const im = new THREE.InstancedMesh(ACC_GEO[k], new THREE.MeshLambertMaterial({ color: 0xffffff, side: k === 'box' ? THREE.FrontSide : THREE.DoubleSide }), 512); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, new THREE.Color(1, 1, 1)); im.name = 'crowd-acc-' + k; this.group.add(im); this.accIM[k] = im; }
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

  // יושבים במושב אוטובוס (מבט פקח): אותו חיפוש תנוחה של הספסל (sitting.js) — עם גובה המושב והעומק של מושב האוטובוס.
  // נבנה פעם אחת לכל דגם, כשנכנסים לאוטובוס בפעם הראשונה. הראשית: הרצפה, מתחת לגב (z=0 — הגב), הדמות פונה ל-‎+z
  // האביזרים של דגם בתנוחה מסוימת (root עם origin): העצם בתנוחה × המטריצה בתוך העצם, יחסית ל-origin. נשמר לפי key
  accPose(V, key, root, origin) {
    V.accP = V.accP || {}; if (V.accP[key]) return V.accP[key];
    const out = {}, T = new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z); root.updateMatrixWorld(true);
    for (const [t, a] of Object.entries(V.insp?.acc || {})) { const b = root.getObjectByName(a.bone); if (b) out[t] = b.matrixWorld.clone().multiply(a.local).premultiply(T); }
    return (V.accP[key] = out);
  }
  // הרוחב של היושב באוטובוס (x מינימלי ומקסימלי של הגוף בגובה המרפקים והכתפיים, יחסית למרכז המושב)
  busExt(V) {
    if (V.busExt) return V.busExt; let lo = 0, hi = 0;
    for (const g of V.bus?.groups || []) { if (g.kind === 'hair' || g.kind === 'brow') continue; const P = g.geo.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < 0.75 || y > 1.3) continue; const x = P.getX(i); if (x < lo) lo = x; if (x > hi) hi = x; } }
    return (V.busExt = [lo, hi]);
  }
  // מי שלובשת מטפחת: השיער מוסתר (מטריצה אפס) — המטפחת מכסה את הראש עד המצח והאוזניים
  hairM(id, kind, M) { if (kind !== 'hair') return M; const lk = ROLE.get(id) === 'insp' ? null : this.lookFor(id); return lk?.acc.includes('scarf') ? (this._zeroM || (this._zeroM = new THREE.Matrix4().makeScale(0, 0, 0))) : M; }
  // מוסיף את האביזרים של הנוסע (לפי המראה שלו) במקום M; mats — המטריצות של התנוחה; seated — רק מה שעל הראש
  emitAcc(id, mats, M, seated) {
    if (ROLE.get(id) === 'insp') return;
    const lk = this.lookFor(id); if (!lk || !lk.acc.length || !mats) return;
    for (const t of lk.acc) {
      if (seated && !ACC_HEAD.has(t)) continue;
      const L = mats[t], im = this.accIM[ACC_KIND[t]]; if (!L || !im || this.accN[ACC_KIND[t]] >= 512) continue;
      const n = this.accN[ACC_KIND[t]]++, cols = ACC_COLOR[t];
      im.setMatrixAt(n, this.tmpA2.multiplyMatrices(M, L)); im.setColorAt(n, this.tmpC2.setHex(cols[Math.floor(hash(id + 41) * cols.length)]));
    }
  }
  // מגישים רב-קו לפקח (מבט פקח): ביושב — היד שבצד המעבר עולה אל המעבר, מעט קדימה ובגובה הכתף; בעומד — היד הפנויה
  // (זו שלא מחזיקה בעמוד) עוברת לפני הגוף אל המעבר. frac — כמה מהדרך (0.33 / 0.66 / 1, לתנועה של שלבים).
  // אותו IK של שתי עצמות כמו בשאר התנוחות, על השלד של תנוחת הישיבה/העמידה; כל תנוחה נבנית פעם אחת ונשמרת.
  // slot: { kind: 'seat' | 'stand', x: x של המקום באוטובוס, grip: היד שעל העמוד }
  reachPose(vi, slot, frac, empty = false) {
    const V = this.variants[vi]; if (!V) return null;
    const sx = Math.sign(slot.x) || 1, aisle = -sx, win = slot.kind === 'seat' && Math.abs(slot.x) > 0.7;
    const key = `${slot.kind}|${sx}|${slot.grip || ''}|${win ? 1 : 0}|${frac}|${empty ? 1 : 0}`;
    V.reach = V.reach || {}; if (V.reach[key] !== undefined) return V.reach[key];
    const base = slot.kind === 'seat' ? V.bus?.sit : V.stand?.[slot.grip]?.st;
    if (!base) return (V.reach[key] = null);
    const root = base.root, B = n => root.getObjectByName(n), W = o => o.getWorldPosition(new THREE.Vector3());
    // ‎-x היא צד ימין של הדמות (פונה ל-‎+z)
    // עומד: עוזב לרגע את העמוד ומושיט ביד הזו (שבצד המעבר) — היד השנייה, שליד החלון, הייתה עוברת דרך העמוד
    const hand = slot.kind === 'seat' ? (aisle < 0 ? 'Right' : 'Left') : slot.grip;
    const arm = B(hand + 'Arm'), fore = B(hand + 'ForeArm'), hd = B(hand + 'Hand'), fb = B(hand + 'FingerBase');
    if (!arm || !fore || !hd || !fb) return (V.reach[key] = null);
    const saved = []; root.traverse(b => { if (b.isBone) saved.push([b, b.quaternion.clone()]); });   // כל השלד (גם הגו נוטה)
    root.updateMatrixWorld(true);
    const o = base.origin, h0 = W(hd);
    // עם כרטיס: הגו נוטה אל המעבר ומסתובב אליו (ליד החלון יותר — הכתף זזה 10–15 ס"מ), והזרוע נשלחת כמעט עד הסוף,
    // בגובה החזה, קדימה ואל המעבר; ליד החלון — לפני החזה של השכן (קדימה יותר). עומד — יד מתוחה אל הפקח.
    // בלי כרטיס: כף יד ריקה ופתוחה לפני הגוף, נמוך (בלי להושיט ובלי לנטות)
    if (!empty) {
      const lb = B('LowerBack'), s1 = B('Spine1') || B('Spine'), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
      const side = (win ? 8 : slot.kind === 'seat' ? 6 : 0) * frac, twist = (win ? 18 : slot.kind === 'seat' ? 12 : 0) * frac, fwd = (win ? 6 : slot.kind === 'seat' ? 0 : 0) * frac;   // כמעט בלי להתכופף קדימה — הגו נשאר מאחורי המשענת שלפניו
      if (lb) { turn(lb, Z, -aisle * side); turn(lb, X, fwd); }
      if (s1) turn(s1, Y, aisle * twist);
      root.updateMatrixWorld(true);
    }
    const sh = W(arm), L = W(arm).distanceTo(W(fore)) + W(fore).distanceTo(W(hd));
    const dirF = (win ? new THREE.Vector3(aisle * 0.4, 0.42, 0.86) : slot.kind === 'seat' ? new THREE.Vector3(aisle * 0.6, -0.22, 0.77) : new THREE.Vector3(aisle * 0.55, -0.1, 0.83)).normalize();   // עומד: אל המעבר וקדימה, מעבר לעמוד
    const full = empty ? new THREE.Vector3(sh.x - aisle * 0.06, sh.y - 0.2, sh.z + (slot.kind === 'seat' ? 0.3 : 0.1))
      : sh.clone().addScaledVector(dirF, L * 0.93);
    // קודם למעלה ואל המעבר, ורק בסוף קדימה (כך היד לא עוברת דרך המשענת שלפניו); ליד החלון ובעמידה — קודם קדימה, ורק אז אל המעבר
    const T = h0.clone().lerp(full, frac);
    if (slot.kind === 'stand') { T.z = h0.z + (full.z - h0.z) * frac * frac - 0.1 * Math.sin(Math.PI * frac); T.y += 0.08 * Math.sin(Math.PI * frac); }   // עומד: היד יוצאת מהעמוד אחורה ולמעלה, ורק אז קדימה
    else if (win) { T.x = h0.x + (full.x - h0.x) * frac * frac; } else T.z = h0.z + (full.z - h0.z) * frac * frac;
    twoBone(arm, fore, hd, T, win ? new THREE.Vector3(-aisle * 0.2, -0.5, 1) : new THREE.Vector3(-aisle * 0.4, -1, -0.1));
    const fdir = empty ? new THREE.Vector3(aisle * 0.2, 0.25, 1) : new THREE.Vector3(aisle * 0.35, 1, 0.35);
    const dir = T.clone().sub(W(fore)).normalize().lerp(fdir.normalize(), frac).normalize();
    aimBone(hd, fb, W(hd).add(dir));
    // האצבעות פתוחות (כמו בעמידה), לא מכווצות כמו על הירך — אוחזות בכרטיס בקצותיהן
    if (!V.idleRef) { V.idleRef = SkeletonUtils.clone(V.gltf.scene); const ic = V.gltf.animations.find(a => /idle/i.test(a.name)); if (ic) { const mx = new THREE.AnimationMixer(V.idleRef); mx.clipAction(ic).play(); mx.update(0); } }
    fb.traverse(b => { const r = V.idleRef.getObjectByName(b.name); if (r && b !== fb) b.quaternion.copy(r.quaternion); });
    { const th = B(hand === 'Left' ? 'LThumb' : 'RThumb'), r = th && V.idleRef.getObjectByName(th.name); if (r) th.quaternion.copy(r.quaternion); }
    root.updateMatrixWorld(true);
    const us = unsinkHands(root);
    const groups = bakeVariant(V.gltf, base, V.cache);
    // הכרטיס (8.5×5.4 ס"מ) זקוף בין האגודל לאצבעות, הפנים שלו אל הפקח שבמעבר
    const headP = B('Head') ? W(B('Head')).sub(o) : null;
    const accM = {}; { const T0 = new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z); for (const [t, a] of Object.entries(V.insp?.acc || {})) { const bb = B(a.bone); if (bb) accM[t] = bb.matrixWorld.clone().multiply(a.local).premultiply(T0); } }
    const hp = W(hd), fp = W(fb), d = fp.clone().sub(hp).normalize();
    const Z = new THREE.Vector3(aisle * 0.8, 0.1, 0.6).normalize(), Y = new THREE.Vector3(0, 1, 0).addScaledVector(Z, -Z.y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
    const card = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(fp.clone().addScaledVector(d, 0.03).addScaledVector(Y, 0.025).addScaledVector(Z, 0.03).sub(o));   // לפני האצבעות, אל הפקח
    for (const [b, q] of saved) b.quaternion.copy(q);
    root.updateMatrixWorld(true);
    const meshes = groups.map(gr => { const im = new THREE.InstancedMesh(gr.geo, gr.mat, 1); im.count = 0; im.visible = false; im.frustumCulled = false; im.name = `crowd-${vi}-reach-${gr.kind}`; im.setColorAt(0, new THREE.Color(1, 1, 1)); this.group.add(im); return im; });
    return (V.reach[key] = { groups, meshes, card: empty ? null : card, hand: hp.sub(o), head: headP, acc: accM, seated: slot.kind === 'seat', unsink: us });
  }
  busSitters(seatH, depth) {
    if (this.busSit) return this.busSit;
    const t0 = performance.now();
    this.variants.forEach((V, vi) => {
      if (!V.gltf || !V.sit) return;
      try {
        const [armPose, side, pushFore] = POSE_OF[vi % POSE_OF.length];
        const key = `bus|${V.gltf.userData.file}|${armPose === 'phone' ? 'thighs' : armPose}|${side}|${pushFore ? 1 : 0}`;
        const S = buildSitter(V.gltf, skinVerts, seatH, depth, armPose === 'phone' ? 'thighs' : armPose, side, pushFore, SIT_PRESETS[key] || null); if (!S) return;
        S.key = key;
        try { relaxFingers(S.root, V.gltf, 0.85); (V.gltf.userData.unsink = V.gltf.userData.unsink || {}).bus = unsinkHands(S.root); } catch (e) { console.warn(e); }
        V.bus = { sit: S, groups: bakeVariant(V.gltf, S, V.cache), n: 0 };
        const inst = (groups, tag) => groups.map(gr => { const im = new THREE.InstancedMesh(gr.geo, gr.mat, 24); im.count = 0; im.frustumCulled = false; im.name = `crowd-${vi}-${tag}-${gr.kind}`; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, new THREE.Color(1, 1, 1)); this.group.add(im); return im; });
        V.bus.meshes = inst(V.bus.groups, 'bus');
        // עומדים ליד הדלת האמצעית: יד אחת על העמוד שלפניהם, בצד המעבר (STAND_POLE)
        V.stand = {};
        for (const hand of ['Left', 'Right']) {
          const T = buildStander(V.gltf, hand, (hand === 'Right' ? -1 : 1) * STAND_POLE.dx, STAND_POLE.dz, null); if (!T) continue;
          try { relaxFingers(T.root, V.gltf, 0.4); (V.gltf.userData.unsink = V.gltf.userData.unsink || {})['pole' + hand] = unsinkHands(T.root); } catch (e) { console.warn(e); }
          const groups = bakeVariant(V.gltf, T, V.cache);
          V.stand[hand] = { st: T, groups, meshes: inst(groups, 'stand' + hand), n: 0 };
        }
      } catch (e) { console.warn('bus sitter failed', e); }
    });
    this.busSit = { ms: Math.round(performance.now() - t0) };
    return this.busSit;
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
    if (i === undefined) {
      // מקום פנוי — ולא צמוד למי שנראה בדיוק כמוהו (אותו דגם ואותם בגדים: "תאומים")
      const at = new Map(); for (const [q, j] of m) at.set(j, q); const me = this.lookOf(pid);
      const twin = j => [j - 1, j + 1].some(k => at.has(k) && this.lookOf(at.get(k)) === me);
      const nS = this.stopFrame(stop).slots.length;
      i = 0; while (i < nS && (at.has(i) || twin(i))) i++;
      if (i >= nS) { i = 0; while (at.has(i)) i++; }
      m.set(pid, i); }
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
  variantOf(id) { const L = this.lookList(); return L ? L[this.lookIndex(id)].vi : Math.floor(hash(id * 1.37 + 17.1) * this.variants.length) % this.variants.length; }
  // המראה של כל נוסע (LOOKS) — לפי משקל; רק לדגמים שנטענו (בלי ?placeholders)
  lookList() {
    if (this._looks !== undefined) return this._looks;
    if (this.fromGlb === undefined) return null;                  // עוד לא נטענו
    if (!this.fromGlb || this.variants.length < 9) return (this._looks = null);
    const L = LOOKS.filter(l => l.vi < this.variants.length); let tot = 0; for (const l of L) tot += l.w;
    let acc = 0; this._cum = L.map(l => (acc += l.w) / tot);
    return (this._looks = L);
  }
  lookIndex(id) { const L = this.lookList(); if (!L) return this.variantOf(id); const r = hash(id * 1.37 + 17.1); let i = 0; while (i < this._cum.length - 1 && r > this._cum[i]) i++; return i; }
  get looks() { return this.lookList(); }
  lookOf(id) { return this.lookList() ? this.lookIndex(id) : this.variantOf(id); }
  lookFor(id) { const L = this.lookList(); return L ? L[this.lookIndex(id)] : null; }
  // הצבע לכל חלק: בדגמים האמיתיים — לבן (הטקסטורה כמו שהיא), חוץ מגוון עדין לבגדים ושינוי קטן בבהירות העור
  tint(id, kind, flat, out, seated = false) {
    // פקח: גוון-סימן (INSP_FLAG, ולשליש מהם עניבה — INSP_TIE) — השיידר של הבגד מצייר את המדים (vestShader); נעליים שחורות.
    // מבקר סמוי — כמו כולם
    if (ROLE.get(id) === 'insp') {
      if (kind === 'cloth') { const f = hash(id + 77) < 0.34 ? INSP_TIE : INSP_FLAG; return flat ? out.setHex(0xbcd4ee) : out.setRGB(f, f, f); }
      if (kind === 'shoes') return out.setRGB(0.16, 0.16, 0.17);
    }
    if (flat) return out.setHex(personColors(id)[kind] ?? 0x888888);
    const lk = this.lookFor(id);
    if (kind === 'cloth' && lk && lk.shirt != null) return out.setRGB(10 + lk.shirt, 10 + lk.pants + (lk.short ? 50 : 0), 10 + lk.pat + (seated && lk.strap === 1 ? 0 : 10 * lk.strap));
    if (kind === 'hair' && lk?.hair != null) return out.setHex(lk.hair).multiplyScalar(1.6);
    if (kind === 'shoes' && lk?.shoes != null) return out.setHex(lk.shoes).multiplyScalar(2.2);
    if (kind === 'cloth') { const t = CLOTH_TINT[Math.floor(hash(id + 3) * CLOTH_TINT.length)]; return out.setRGB(t[0], t[1], t[2]); }
    if (kind === 'skin') { const k = 0.94 + hash(id + 21) * 0.1; return out.setRGB(k, k, k); }
    return out.setRGB(1, 1, 1);
  }

  update(sim, stops, simDt, busLayer) {
    // 1. עולים ויורדים — לפני שמעדכנים את הממתינים, כדי שההולך יתחיל בדיוק מהמקום שבו עמד
    for (const ev of sim.events) {
      if (ev.type === 'board') {
        const path = this.doorPath(busLayer, ev.bus, ev.p.door || 'front'); if (!path) continue;    // פקחים בקבוצה — כל אחד בדלת אחרת
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
        const insp = ROLE.get(ev.p.id) === 'insp';
        const path = this.doorPath(busLayer, ev.bus, insp && ev.p.door ? ev.p.door : 'mid'); if (!path) continue;
        // פקח שנסע בתוך האוטובוס (ride): יוצא מהמקום שבו עמד
        const rw = insp && this.walkers.find(x => x.mode === 'ride' && x.pid === ev.p.id);
        const pre = rw ? [rw.obj.getWorldPosition(new THREE.Vector3())] : [];
        if (rw) this.finish(rw, this.walkers.indexOf(rw));
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
        // במבט הפקח (onboard): יוצא מהמקום שלו — קם למעבר, הולך בו עד הדלת, ורק אז יורד (לא מופיע פתאום בדלת)
        const ob = this.onboard;
        if (!rw && ob?.obj && ob.bus === ev.bus) {
          const k = ob.seatOf(ev.p.id), sp = k >= 0 ? ob.seats[k] : ob.stands[ob.standOf(ev.p.id)];
          if (sp) { ob.obj.updateMatrixWorld(true);
            const fl = ob.floor, dz = ob.obj.worldToLocal(path.in.clone()).z, P = (x, z) => ob.obj.localToWorld(new THREE.Vector3(x, fl, z));
            pre.push(P(Math.sign(sp[0]) * 0.12, sp[2] + 0.42), P(0, sp[2] + 0.42 + Math.sign(dz - sp[2]) * 0.3), P(0, dz)); }
        }
        this.walk(ev.p.id, [...pre, ...toOut, curb, edge, away], 'alight', ev.bus, undefined, toOut.length + pre.length, path.door);
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
    this.waitPos = new Map();                 // ממתינים: הראש בעולם (להקשה — כרטיס נוסע)
    const M = this.tmpM, Q = this.tmpQ, C = this.tmpC, up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
    const B = new THREE.Matrix4(); let np = 0, nc = 0, nr = 0, nb = 0; const A = new THREE.Matrix4();
    this.accN = { kippah: 0, scarf: 0, box: 0, shop: 0 }; this.tmpA2 = this.tmpA2 || new THREE.Matrix4(); this.tmpC2 = this.tmpC2 || new THREE.Color();
    for (const [stop, list] of per) {
      for (const p of list) {
        if (n >= this.max) break;
        const bk = this.benchOf(stop, p.id);
        if (bk >= 0) {
          const V = this.variants[this.variantOf(p.id)];
          this.sitMatrix(stop, bk, p.id, M);
          V.sitMeshes.forEach((im, g) => { im.setMatrixAt(V.sn, this.hairM(p.id, V.sitGroups[g].kind, M)); im.setColorAt(V.sn, this.tint(p.id, V.sitGroups[g].kind, false, C, true)); });
          V.sn++; this.waitPos.set(p.id, { p, pos: V.sit.hip.clone().applyMatrix4(M).add(new THREE.Vector3(0, 0.55, 0)) });
          if (V.sit.root) this.emitAcc(p.id, this.accPose(V, 'bench', V.sit.root, V.sit.origin), M, true);
          const insp = ROLE.get(p.id) === 'insp';
          if (V.sit.phone && np < SIT_MAX && !insp) this.phones.setMatrixAt(np++, this.tmpP.multiplyMatrices(M, V.sit.phone));
          if (insp && V.capSit && nc < 96) this.caps.setMatrixAt(nc++, A.multiplyMatrices(M, V.capSit));
          if (insp && V.bagSit && nb < 96) this.bags.setMatrixAt(nb++, A.multiplyMatrices(M, V.bagSit));
          P.copy(V.sit.feet).lerp(V.sit.hip, 0.5).setY(0.015).applyMatrix4(M); B.makeTranslation(P.x, P.y, P.z); this.blobs.setMatrixAt(n, B);
          n++; continue;
        }
        const i = this.seatOf(stop, p.id); if (i >= this.stopFrame(stop).slots.length) continue;
        const [x, y] = this.slot(stop, i);
        Q.setFromAxisAngle(up, this.personYaw(stop, i, p.id));
        P.set(x, 0.12, -y); S.setScalar(this.personScale(p.id));
        M.compose(P, Q, S);
        const V = this.variants[this.variantOf(p.id)];
        V.meshes.forEach((im, g) => { im.setMatrixAt(V.n, this.hairM(p.id, V.groups[g].kind, M)); im.setColorAt(V.n, this.tint(p.id, V.groups[g].kind, V.groups[g].flat, C)); });
        V.n++; this.waitPos.set(p.id, { p, pos: new THREE.Vector3(x, 1.45, -y) });
        if (V.insp?.acc) { V.accStand = V.accStand || Object.fromEntries(Object.entries(V.insp.acc).map(([t, a]) => [t, a.stand])); this.emitAcc(p.id, V.accStand, M, false); }
        if (ROLE.get(p.id) === 'insp' && V.insp) {
          if (V.insp.capStand && nc < 96) this.caps.setMatrixAt(nc++, A.multiplyMatrices(M, V.insp.capStand));
          if (V.insp.readerStand && nr < 96) this.readers.setMatrixAt(nr++, A.multiplyMatrices(M, V.insp.readerStand));
          if (V.insp.bagStand && nb < 96) this.bags.setMatrixAt(nb++, A.multiplyMatrices(M, V.insp.bagStand));
        }
        B.makeTranslation(x, 0.135, -y); this.blobs.setMatrixAt(n, B);
        n++;
      }
    }
    // נוסעים בתוך האוטובוס של הפקח (מבט פקח, js/inspfp.js): יושבים במושבים האמיתיים — הישבן על הכרית, הגב למשענת,
    // הרגליים על הרצפה (busSitters). מי שאין לו מושב עומד ליד הדלת האמצעית ומחזיק בעמוד
    this.onboardPos = new Map();
    for (const im of this.reachShown || []) { im.count = 0; im.visible = false; }
    this.reachShown = new Set(); if (this.card) this.card.visible = false;
    this.cardWorld = null; this.reachHandWorld = null; this.onboardShapes = [];
    for (const V of this.variants) { if (V.bus) V.bus.n = 0; for (const S of Object.values(V.stand || {})) S.n = 0; }
    const ob = this.onboard;
    if (ob?.obj && ob.bus) {
      const OM = ob.obj.matrixWorld;
      for (const p of ob.bus.pax) {
        if (p.role) continue;
        const V = this.variants[this.variantOf(p.id)], k = ob.seatOf(p.id);
        // מי שמגיש עכשיו רב-קו לפקח (this.reach מ-inspfp.js): בתנוחת ההגשה במקום התנוחה הרגילה
        const R = this.reach?.pid === p.id && this.reach.frac > 0 ? this.reach : null;
        const show = (pose, x, y, z, sxN = 1) => { M.makeScale(sxN, 1, 1).setPosition(x, y, z).premultiply(OM);
          pose.meshes.forEach((im, g) => { im.setMatrixAt(0, this.hairM(p.id, pose.groups[g].kind, M)); im.setColorAt(0, this.tint(p.id, pose.groups[g].kind, false, C, pose.seated)); im.count = 1; im.visible = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; this.reachShown.add(im); });
          if (R.card && pose.card) { this.card.matrix.multiplyMatrices(M, pose.card); this.card.matrixWorldNeedsUpdate = true; this.card.visible = true; this.cardWorld = new THREE.Vector3().setFromMatrixPosition(this.card.matrix); }
          this.reachHandWorld = pose.hand.clone().applyMatrix4(M); this.onboardShapes.push({ pid: p.id, groups: pose.groups, M: M.clone(), key: 'r' + R.frac + (R.card ? 'c' : 'e') }); };
        if (k < 0) {                          // אין מושב: עומד ליד הדלת האמצעית ומחזיק בעמוד
          const j = ob.standOf(p.id), sp = ob.stands[j], S = sp && V.stand?.[sp[3]];
          if (!S || S.n >= 24) continue;
          const pose = R && this.reachPose(this.variantOf(p.id), { kind: 'stand', x: sp[0], grip: sp[3] }, R.frac, !R.card);
          const pm = this.accPose(V, 'pole' + sp[3], S.st.root, S.st.origin);
          if (pose) { show(pose, sp[0], sp[1], sp[2]); this.emitAcc(p.id, pose.acc, M, false); this.onboardPos.set(p.id, (pose.head ? pose.head.clone().add(new THREE.Vector3(0, -0.08, 0)) : S.st.hip.clone().add(new THREE.Vector3(0, 0.62, 0))).applyMatrix4(M)); continue; }
          M.makeTranslation(sp[0], sp[1], sp[2]).premultiply(OM);
          S.meshes.forEach((im, g) => { im.setMatrixAt(S.n, this.hairM(p.id, S.groups[g].kind, M)); im.setColorAt(S.n, this.tint(p.id, S.groups[g].kind, false, C)); });
          this.emitAcc(p.id, pm, M, false);
          this.onboardShapes.push({ pid: p.id, groups: S.groups, M: M.clone(), key: 'p' });
          S.n++;
          this.onboardPos.set(p.id, S.st.hip.clone().add(new THREE.Vector3(0, 0.62, 0)).applyMatrix4(M));
          continue;
        }
        if (k >= ob.seats.length || !V.bus || V.bus.n >= 24) continue;
        const st = ob.seats[k];               // [x, רצפה, z של הגב בגובה האגן]
        // זוג תפוס: שני היושבים מצטמצמים לרוחב יחד, לפי הרוחב של שניהם בצד שפונה אל השכן (בגובה המרפקים והכתפיים)
        let sxN = 1; const qp = ob.partner?.(k);
        if (qp != null) { const Vq = this.variants[this.variantOf(qp)], kq = ob.seatOf(qp), dx = Math.abs(ob.seats[kq][0] - st[0]);
          const inner = (VV, toward) => { const e = this.busExt(VV); return toward > 0 ? e[1] : -e[0]; };
          const w = inner(V, ob.seats[kq][0] - st[0]) + inner(Vq, st[0] - ob.seats[kq][0]); sxN = Math.min(1, (dx - 0.012) / w); }
        // השכן שליד החלון מושיט כרטיס לפני החזה שלו: היושב במעבר מצטמצם עוד מעט (מפנה מקום ליד)
        if (qp != null && this.reach?.pid === qp && this.reach.frac > 0 && this.reach.card && Math.abs(ob.seats[ob.seatOf(qp)][0]) > 0.7) sxN *= 0.84;
        (this.onboardSX || (this.onboardSX = new Map())).set(p.id, sxN);
        const pose = R && this.reachPose(this.variantOf(p.id), { kind: 'seat', x: st[0] }, R.frac, !R.card);
        const bm = V.bus?.sit?.root ? this.accPose(V, 'bus', V.bus.sit.root, V.bus.sit.origin) : null;
        if (pose) { show(pose, st[0], st[1], st[2], sxN); this.emitAcc(p.id, pose.acc, M, true); this.onboardPos.set(p.id, (pose.head ? pose.head.clone().add(new THREE.Vector3(0, -0.08, 0)) : V.bus.sit.hip.clone().add(new THREE.Vector3(0, 0.62, 0.02))).applyMatrix4(M)); continue; }
        M.makeScale(sxN, 1, 1).setPosition(st[0], st[1], st[2]).premultiply(OM);
        V.bus.meshes.forEach((im, g) => { im.setMatrixAt(V.bus.n, this.hairM(p.id, V.bus.groups[g].kind, M)); im.setColorAt(V.bus.n, this.tint(p.id, V.bus.groups[g].kind, false, C, true)); });
        this.emitAcc(p.id, bm, M, true);
        this.onboardShapes.push({ pid: p.id, groups: V.bus.groups, M: M.clone(), key: 's' });
        V.bus.n++;
        this.onboardPos.set(p.id, V.bus.sit.hip.clone().add(new THREE.Vector3(0, 0.62, 0.02)).applyMatrix4(M));
      }
    }
    for (const V of this.variants) if (V.bus) for (const im of V.bus.meshes) { im.count = V.bus.n; im.visible = V.bus.n > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    for (const V of this.variants) for (const S of Object.values(V.stand || {})) for (const im of S.meshes) { im.count = S.n; im.visible = S.n > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.phones.count = np; this.phones.instanceMatrix.needsUpdate = true;
    for (const [k, im] of Object.entries(this.accIM)) { im.count = this.accN[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    this.caps.count = nc; this.readers.count = nr; this.bags.count = nb; this.caps.instanceMatrix.needsUpdate = this.readers.instanceMatrix.needsUpdate = this.bags.instanceMatrix.needsUpdate = true;
    for (const V of this.variants) for (const im of V.sitMeshes) {
      im.count = V.sn; im.visible = V.sn > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    for (const V of this.variants) for (const im of V.meshes) {
      im.count = V.n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.blobs.count = n; this.blobs.instanceMatrix.needsUpdate = true;
    this.crowdCount = n;

    // 3. הולכים: לאורך מסלול של כמה נקודות, בקצב הליכה קבוע
    this.fpBlock = null;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      if (w.mode === 'ride') { this.riding(w, i, simDt, busLayer); continue; }
      if (w.rise && this.rising(w, simDt)) continue;
      const lastSeg = w.seg === w.pts.length - 2 && w.d >= w.lens[w.seg];
      // מעבר: הגיע לתחנה הבאה לפני שהסימולציה הכניסה אותו לתור — עומד ומחכה (עד 20 שנ')
      if (w.mode === 'xfer' && lastSeg && w.sim.pending.some(x => x.p === w.p) && (w.hold = (w.hold || 0) + simDt) < 20) {
        if (w.mixer) { w.mixer.setTime(0.02); this.centre(w); }
        continue;
      }
      // ריצה לאוטובוס (sim.js: x.run): אותה הליכה, מהר יותר — צעדים מהירים יותר וגם תנועה מהירה יותר
      if (w.mode === 'xfer' && !w.running && w.sim?.pending.some(x => x.p === w.p && x.run)) { w.running = true; w.speed = Math.min(3.4, (w.speed || 1.35) * 1.8); if (w.mixer) w.mixer.timeScale = 1.65; }
      // בדלת: צעדים קצרים ואיטיים במדרגה (בלי "לעוף" מהרצפה למדרכה), ואז שוב בקצב הליכה
      let slow = 1;
      if (w.door && w.legs) { const { o, u } = w.door, P = w.obj.position, dx = (P.x - o.x) * u.x + (P.z - o.z) * u.z; if (dx > 0.2 && dx < 1.2) slow = 0.38; }
      // במבט הפקח: מי שהולך במעבר לא נכנס בפקח — מחכה מולו (inspfp.js זז הצידה במעבר)
      if (this.fpEye && this.onboard && w.bus === this.onboard.bus) {
        const P0 = w.obj.position, nx = w.pts[w.seg + 1], ex = this.fpEye.x - P0.x, ez = this.fpEye.z - P0.z, d = Math.hypot(ex, ez);
        const mx = nx.x - P0.x, mz = nx.z - P0.z, ml = Math.hypot(mx, mz) || 1;
        // אחרי 2.5 ש' (הפקח זז הצידה) עובר לידו במעבר — אבל לא קרוב מ-40 ס"מ
        // הצעד הבא מקרב אותו לפקח: במרחק 75 ס"מ — מחכה, והפקח מפנה לו את הדרך במעבר (inspfp.js)
        const st = 0.08, qx = P0.x + mx / ml * st - this.fpEye.x, qz = P0.z + mz / ml * st - this.fpEye.z, dn = Math.hypot(qx, qz);
        if (dn < d && d < 0.75) { w.waitFP = (w.waitFP || 0) + simDt; this.fpBlock = w; slow = 0; } else if (d >= 0.9) w.waitFP = 0;
      }
      w.d += simDt * (w.speed || 1.35) * slow;
      if (w.mixer && slow < 1) w.mixer.timeScale = slow === 0 ? 0.05 : (w.running ? 1.65 : 1) * 0.6; else if (w.mixer && w.slowed) w.mixer.timeScale = w.running ? 1.65 : 1;
      w.slowed = slow < 1;
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
      // פקח שעלה: לא נעלם — נשאר לעמוד ליד הדלת ובודק כרטיסים עד שהוא יורד
      if (last && k >= 1 && w.mode === 'board' && ROLE.get(w.pid) === 'insp' && this.ride(w, busLayer)) continue;
      if (last && k >= 1) this.finish(w, i);
    }
  }
  // פקח בתוך האוטובוס: נצמד לאוטובוס במקום שבו נגמרה העלייה (מעבר, ליד הדלת), עומד ומסתובב לאט אל הנוסעים
  ride(w, busLayer) {
    const v = busLayer?.map.get(w.bus.id); if (!v) return false;
    if (w.counted) { w.bus.walking = Math.max(0, (w.bus.walking || 0) - 1); w.counted = false; }
    v.obj.updateMatrixWorld(true); v.obj.attach(w.obj);
    w.obj.position.y = 0.675; w.mode = 'ride'; w.rideT = hash(w.pid + 5) * 10;
    w.rideYaw = w.door && w.obj.position.z > 2 ? Math.PI : (hash(w.pid) < 0.5 ? 0 : Math.PI);     // ליד הדלת הקדמית — פונה אחורה
    w.obj.rotation.set(0, w.rideYaw, 0); this.setIdle(w, true);
    return true;
  }
  riding(w, i, dt, busLayer) {
    const v = busLayer?.map.get(w.bus.id);
    if (!v || w.obj.parent !== v.obj || w.bus.state === 'done' || w.bus.state === 'gone') { this.finish(w, i); return; }
    w.rideT += dt;
    w.obj.rotation.y = w.rideYaw + 0.55 * Math.sin(w.rideT * 0.45);
    if (w.mixer) { w.mixer.update(dt); this.centre(w); }
  }
  setIdle(w, on) {
    if (!w.mixer || !w.walkAct) return;
    if (on && w.idleClip) { w.idleAct = w.idleAct || w.mixer.clipAction(w.idleClip); w.walkAct.stop(); w.idleAct.reset().play(); }
    else { w.idleAct?.stop(); if (!w.walkAct.isRunning()) w.walkAct.reset().play(); }
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
    // גובה הנקודות כמו במדרגות (stairs): מדרכה בחוץ, רצפת האוטובוס בפנים — כך מי שיורד מתחיל על הרצפה ולא בתוכה
    const kn = bus.kneel || 0, fl = dx => 0.675 - kneelDrop(kn, dx - 1.875);
    const pts = [at(0, 0.12), at(0.7, fl(0.7)), at(1.4, fl(1.4))];
    // מסגרת הדלת: נקודת המוצא בחוץ, וכיוון פנימה — לחישוב הגובה מתחת לכל כף רגל
    const o = at(0, 0), u = at(1, 0).sub(o).normalize();
    return { out: pts[0], in: pts[pts.length - 1], toIn: pts, door: { o, u } };
  }
  finish(w, i) {
    if (w.bus && w.counted) { w.bus.walking = Math.max(0, (w.bus.walking || 0) - 1); w.counted = false; }
    w.obj.visible = false; this.setOpacity(w, 1);
    if (w.obj.parent !== this.group) this.group.add(w.obj);
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
    for (const [m, k, flat, base] of w.mats) { this.tint(id, k, flat, this.tmpC); if (this.tmpC.r > 9.5) m.color.copy(this.tmpC); else m.color.copy(base).multiply(this.tmpC); }
    { const sc = ROLE.get(id) !== 'insp' && !!this.lookFor(id)?.acc.includes('scarf'); for (const [m, k] of w.mats) if (k === 'hair') m.visible = !sc; }
    for (const a of w.acc || []) a.visible = ROLE.get(id) === 'insp';
    { const lk = ROLE.get(id) === 'insp' ? null : this.lookFor(id); for (const [t, m] of Object.entries(w.lookAcc || {})) { m.visible = !!lk?.acc.includes(t); if (m.visible) m.material.color.setHex(ACC_COLOR[t][Math.floor(hash(id + 41) * ACC_COLOR[t].length)]); } }
    this.setOpacity(w, 1);
    w.pts = pts.map(p => p.clone()); w.lens = [];
    for (let j = 0; j < w.pts.length - 1; j++) w.lens.push(Math.max(0.05, w.pts[j].distanceTo(w.pts[j + 1])));
    if (w.obj.parent !== this.group) this.group.add(w.obj);
    this.setIdle(w, false); w.pid = id; w.running = false; if (w.mixer) w.mixer.timeScale = 1;
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
      if (clip) { mixer = new THREE.AnimationMixer(inner); var walkAct = mixer.clipAction(clip); walkAct.play(); }
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
    const w = { obj, body, mixer, mats, inner, hips, blob, vi, bones, legs: legs && legs.every(l => l.up && l.knee && l.foot && l.toe) ? legs : null,
      walkAct: walkAct || null, idleClip: V.gltf?.animations.find(a => /idle/i.test(a.name)) || null };
    // פקח: כובע על עצם הראש ומכשיר ביד ימין (מוסתרים, ומופיעים רק לפקח); וצבע העור לאמה
    for (const [m] of mats) { const U = m.userData.insp; if (!U) continue; if (V.skin) U.skinC.value.copy(V.skin); if (V.insp) U.vTop.value = V.insp.vTop; }
    w.acc = [];
    for (const [bn, geo, L] of [['Head', capGeo, V.insp?.capLocal], ['RightHand', readerGeo, V.insp?.readerLocal], ['Hips', bagGeo, V.insp?.bagLocal]]) {
      const b = bones?.get(bn); if (!b || !L) continue;
      const m = new THREE.Mesh(geo, geo === capGeo ? CAP_MAT : ACC_MAT); m.name = 'insp-' + bn; m.matrixAutoUpdate = false; m.matrix.copy(L); m.visible = false; m.frustumCulled = false; b.add(m); w.acc.push(m);
    }
    // אביזרי הנוסעים (LOOKS): צמודים לעצמות, מוסתרים; walk() מראה את אלה של המראה של מי שהולך
    w.lookAcc = {};
    for (const [t, a] of Object.entries(V.insp?.acc || {})) {
      const b = bones?.get(a.bone); if (!b) continue;
      const m = new THREE.Mesh(ACC_GEO[ACC_KIND[t]], new THREE.MeshLambertMaterial({ color: 0xffffff, side: ACC_KIND[t] === 'box' ? THREE.FrontSide : THREE.DoubleSide }));
      m.name = 'acc-' + t; m.matrixAutoUpdate = false; m.matrix.copy(a.local); m.visible = false; m.frustumCulled = false; b.add(m); w.lookAcc[t] = m;
    }
    if (w.legs && mixer) {
      // הגובה הנמוך ביותר של הקרסול ושל הבוהן בזמן ההליכה (כף הרגל על הרצפה)
      let ra = Infinity, rt = Infinity; const P = new THREE.Vector3(), dur = clip ? clip.duration : 1.2;
      for (let k = 0; k < 24; k++) { mixer.setTime(k / 24 * dur); obj.updateMatrixWorld(true);
        for (const l of w.legs) { ra = Math.min(ra, l.foot.getWorldPosition(P).y); rt = Math.min(rt, l.toe.getWorldPosition(P).y); } }
      w.rest = { a: ra - obj.position.y, t: rt - obj.position.y };
    }
    return w;
  }
  // מדרגות בדלת: כל כף רגל נוחתת על הגובה שמתחתיה — כמו בדגם: מדרכה 0.12 עד הסף, מדרגה צרה 0.36 (‎x‏ ‎-1.275 עד ‎-1.2),
  // ורצפה 0.675. העוגן של הדלת ב-x‏ ‎-1.875, ולכן dx = x + 1.875. כשהאוטובוס כורע — הרצפה והמדרגה נמוכות יותר.
  // הגוף בגובה הרגל הנמוכה, והרגל הגבוהה מתכופפת אליה (IK של ירך-שוק). כך אין רגל שנבלעת במדרגה
  stairs(w, dt) {
    const { o, u } = w.door, kn = w.bus?.kneel || 0;
    const g = p => { const dx = (p.x - o.x) * u.x + (p.z - o.z) * u.z, x = dx - 1.875; return dx < 0.6 ? 0.12 : (dx < 0.675 ? 0.36 : 0.675) - kneelDrop(kn, x); };
    const A = this.tmpA || (this.tmpA = new THREE.Vector3()), T = this.tmpT || (this.tmpT = new THREE.Vector3());
    w.obj.position.y = w.baseY; w.obj.updateMatrixWorld(true);
    // גם קצת לפני הבוהן: הרגל עולה לפני שפת המדרגה, כדי שהשוק לא תעבור דרך הפינה
    const ahead = new THREE.Vector3(Math.sin(w.obj.rotation.y), 0, Math.cos(w.obj.rotation.y)).multiplyScalar(0.12);
    const gr = w.legs.map(l => Math.max(g(l.foot.getWorldPosition(A)), g(l.toe.getWorldPosition(T)), g(T.add(ahead))));
    const want = Math.min(gr[0], gr[1]);
    // הגוף יורד/עולה בהדרגה (עד 1.1 מ' בשנייה) — צעד למדרגה ועוד צעד למדרכה, לא נפילה
    w.baseY += THREE.MathUtils.clamp((want - w.baseY) * Math.min(1, dt * 7), -1.1 * dt, 1.1 * dt);
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
