// קריאה וכתיבה של GLB בלי תלויות (Node בלבד) — בשביל build_bus_variants.mjs.
// הרשתות נקראות ל"משולשים" במערכת הצירים של האוטובוס (‎+Z קדימה, ‎+Y למעלה, הדלתות ב-‎-X), כל אחד עם חומר,
// ונכתבות בחזרה כ-GLB. החומרים, הטקסטורות והתמונות מועתקים כמו שהם (בלי דחיסה מחדש).
import fs from 'fs';

// ---------- מטריצות 4x4 (column-major כמו ב-glTF)
export const M4 = {
  I: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
  },
  pt(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  dir(m, p) { const v = [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]; const l = Math.hypot(...v) || 1; return v.map(a => a / l); },
};

// ---------- קריאה
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function readGLB(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12), json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl, bl = b.readUInt32LE(bo), bin = b.slice(bo + 8, bo + 8 + bl);
  const acc = i => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = COMP[a.componentType], n = NCOMP[a.type];
    const es = T.BYTES_PER_ELEMENT, stride = bv.byteStride || es * n, off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Float64Array(a.count * n), dv = new DataView(bin.buffer, bin.byteOffset);
    const get = { 5126: (o) => dv.getFloat32(o, true), 5125: o => dv.getUint32(o, true), 5123: o => dv.getUint16(o, true), 5121: o => dv.getUint8(o), 5122: o => dv.getInt16(o, true), 5120: o => dv.getInt8(o) }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get(off + k * stride + c * es);
    return out;
  };
  const view = i => { const bv = json.bufferViews[i]; return bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); };
  return { json, bin, acc, view };
}

// מטריצת העולם של כל צומת
export function worldMatrices(json) {
  const W = new Array(json.nodes.length), parent = new Array(json.nodes.length).fill(-1);
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  const local = n => n.matrix || M4.trs(n.translation, n.rotation, n.scale);
  const get = i => W[i] || (W[i] = parent[i] < 0 ? local(json.nodes[i]) : M4.mul(get(parent[i]), local(json.nodes[i])));
  json.nodes.forEach((_, i) => get(i));
  return { W, parent };
}

// "חלק": רשימת משולשים לא-מאונדקסים לכל חומר. tri = 3 קודקודים, לכל קודקוד p[3], n[3], uv[2]
// מבנה: { name, prims: Map<matIndex, Float64Array-like array of numbers (24 לכל משולש)> }
export const VS = 8;   // p3 n3 uv2
export function meshToPart(g, meshIndex, mat, name) {
  const prims = new Map();
  for (const p of g.json.meshes[meshIndex].primitives) {
    const P = g.acc(p.attributes.POSITION), N = p.attributes.NORMAL != null ? g.acc(p.attributes.NORMAL) : null, U = p.attributes.TEXCOORD_0 != null ? g.acc(p.attributes.TEXCOORD_0) : null;
    const I = p.indices != null ? g.acc(p.indices) : Float64Array.from({ length: P.length / 3 }, (_, i) => i);
    const out = prims.get(p.material) || []; prims.set(p.material, out);
    for (let t = 0; t < I.length; t++) {
      const i = I[t], pp = M4.pt(mat, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]), nn = N ? M4.dir(mat, [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]) : [0, 1, 0];
      out.push(pp[0], pp[1], pp[2], nn[0], nn[1], nn[2], U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0);
    }
  }
  return { name, prims };
}

// ---------- פעולות על חלקים
export function mapTris(part, fn) {   // fn(mat, tri[24]) -> array of tris (each 24 numbers) | null(drop) | true(keep)
  const out = new Map();
  for (const [m, a] of part.prims) {
    const o = [];
    for (let t = 0; t < a.length; t += 24) {
      const tri = a.slice(t, t + 24), r = fn(m, tri);
      if (r === true) o.push(...tri); else if (r) for (const x of r) o.push(...x);
    }
    if (o.length) out.set(m, o);
  }
  return { ...part, prims: out };
}
export const triBox = tri => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], tri[v * 8 + c]); mx[c] = Math.max(mx[c], tri[v * 8 + c]); } return { mn, mx }; };
export function partBox(part) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const a of part.prims.values()) for (let i = 0; i < a.length; i += 8) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], a[i + c]); mx[c] = Math.max(mx[c], a[i + c]); } return { mn, mx, c: mn.map((v, k) => (v + mx[k]) / 2) }; }
export function transformPart(part, fp, fn) {   // fp(p)->p, fn(n,p)->n (אופציונלי)
  const out = new Map();
  for (const [m, a] of part.prims) {
    const o = a.slice();
    for (let i = 0; i < o.length; i += 8) {
      const p = [a[i], a[i + 1], a[i + 2]], q = fp(p); o[i] = q[0]; o[i + 1] = q[1]; o[i + 2] = q[2];
      if (fn) { const n = fn([a[i + 3], a[i + 4], a[i + 5]], p); o[i + 3] = n[0]; o[i + 4] = n[1]; o[i + 5] = n[2]; }
    }
    out.set(m, o);
  }
  return { ...part, prims: out };
}
export const translate = (part, d) => transformPart(part, p => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
export function mergeParts(name, ...parts) {
  const out = new Map();
  for (const p of parts) if (p) for (const [m, a] of p.prims) { const o = out.get(m) || []; for (let i = 0; i < a.length; i++) o.push(a[i]); out.set(m, o); }
  return { name, prims: out };
}
export const triCount = part => [...part.prims.values()].reduce((s, a) => s + a.length / 24, 0);

// חיתוך משולש בציר (0/1/2) — שומרים את הצד sign*(x - v) >= 0. מחזיר מצולע (רשימת קודקודים של 8)
function clipPoly(poly, ax, v, sign) {
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], da = sign * (a[ax] - v), db = sign * (b[ax] - v);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(a.map((x, k) => x + (b[k] - x) * t)); }
  }
  return out;
}
const toPoly = tri => [0, 1, 2].map(v => tri.slice(v * 8, v * 8 + 8));
const fan = poly => { const r = []; for (let i = 1; i + 1 < poly.length; i++) r.push([...poly[0], ...poly[i], ...poly[i + 1]]); return r; };
// משאירים רק את החלק שבין lo ל-hi בציר ax
export function clipSlab(part, ax, lo, hi, pred = null) {
  return mapTris(part, (m, tri) => {
    if (pred && !pred(m, tri)) return true;
    const b = triBox(tri); if (b.mn[ax] >= lo && b.mx[ax] <= hi) return true;
    if (b.mx[ax] <= lo || b.mn[ax] >= hi) return null;
    let p = toPoly(tri); p = clipPoly(p, ax, lo, 1); if (p.length < 3) return null; p = clipPoly(p, ax, hi, -1); if (p.length < 3) return null;
    return fan(p);
  });
}
// מוציאים את מה שבין lo ל-hi (חור) — רק במשולשים שעונים ל-pred
export function cutSlab(part, ax, lo, hi, pred) {
  return mapTris(part, (m, tri) => {
    if (!pred(m, tri)) return true;
    const b = triBox(tri); if (b.mx[ax] <= lo || b.mn[ax] >= hi) return true;
    const r = [];
    let p = clipPoly(toPoly(tri), ax, lo, -1); if (p.length >= 3) r.push(...fan(p));
    p = clipPoly(toPoly(tri), ax, hi, 1); if (p.length >= 3) r.push(...fan(p));
    return r;
  });
}

// ---------- בניית גאומטריה חדשה: מוסיפים משולשים לחלק
export class Builder {
  constructor(name) { this.part = { name, prims: new Map() }; }
  tri(m, a, b, c, n = null, uv = [[0, 0], [1, 0], [1, 1]]) {
    if (!n) { const u = a.map((x, k) => b[k] - x), v = a.map((x, k) => c[k] - x); n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1; n = n.map(x => x / l); }
    const na = Array.isArray(n[0]) ? n : [n, n, n];
    const o = this.part.prims.get(m) || []; this.part.prims.set(m, o);
    [a, b, c].forEach((p, i) => o.push(p[0], p[1], p[2], ...na[i], ...uv[i]));
  }
  quad(m, a, b, c, d, n = null) { this.tri(m, a, b, c, n, [[0, 0], [1, 0], [1, 1]]); this.tri(m, a, c, d, n, [[0, 0], [1, 1], [0, 1]]); }
  box(m, c, s) {   // מרכז, גודל
    const [x, y, z] = c, [hx, hy, hz] = s.map(v => v / 2);
    const P = (i, j, k) => [x + i * hx, y + j * hy, z + k * hz];
    this.quad(m, P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), [1, 0, 0]);
    this.quad(m, P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1), [-1, 0, 0]);
    this.quad(m, P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), [0, 1, 0]);
    this.quad(m, P(-1, -1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), [0, -1, 0]);
    this.quad(m, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [0, 0, 1]);
    this.quad(m, P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), [0, 0, -1]);
  }
  // רצועה בין שתי טבעות (מערכי נקודות באותו אורך), סגורה. נורמלים חלקים לפי שכנים
  strip(m, A, B, closed = true, smoothOut = null) {
    const n = A.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      this.quad(m, A[i], A[j], B[j], B[i], smoothOut ? null : null);
    }
  }
  // משטח טבעת: בין מתאר חיצוני לפנימי באותו מספר נקודות
  ring(m, O, I, n) { for (let i = 0; i < O.length; i++) { const j = (i + 1) % O.length; this.quad(m, O[i], O[j], I[j], I[i], n); } }
  // מצולע קמור/כוכבי — מניפה מהמרכז
  cap(m, P, n) { const c = P.reduce((s, p) => s.map((v, k) => v + p[k] / P.length), [0, 0, 0]); for (let i = 0; i < P.length; i++) this.tri(m, c, P[i], P[(i + 1) % P.length], n); }
}

// מלבן מעוגל בחתך XY (נקודות נגד כיוון השעון במבט מ-‎+Z), אותו מספר נקודות לכל רדיוס
export function roundRect(hw, y0, y1, rTop, rBot, n = 6) {
  const pts = [], arc = (cx, cy, r, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + Math.PI / 2 * i / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  rBot = Math.max(rBot, 1e-4); rTop = Math.max(rTop, 1e-4);
  arc(hw - rBot, y0 + rBot, rBot, -Math.PI / 2);
  arc(hw - rTop, y1 - rTop, rTop, 0);
  arc(-hw + rTop, y1 - rTop, rTop, Math.PI / 2);
  arc(-hw + rBot, y0 + rBot, rBot, Math.PI);
  return pts;
}

// ---------- כתיבה
export function writeGLB(file, { src, materials, matRemap, nodes, scenes, meshes, animations = [], skins = [], extras = null }) {
  // src: ה-GLB המקורי (לחומרים/טקסטורות/תמונות). materials: מערך חומרי glTF (כבר במספור החדש), textures/images נבנים לפי מה שבשימוש
  const chunks = [], bufferViews = [], accessors = [];
  let len = 0;
  const pushView = (buf, target) => { const pad = (4 - (len % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; } const v = { buffer: 0, byteOffset: len, byteLength: buf.length }; if (target) v.target = target; bufferViews.push(v); chunks.push(buf); len += buf.length; return bufferViews.length - 1; };
  const accessor = (arr, type, compType, target, minmax = false) => {
    const T = COMP[compType], typed = new T(arr), view = pushView(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), target);
    const a = { bufferView: view, componentType: compType, count: arr.length / NCOMP[type], type };
    if (minmax) { const n = NCOMP[type], mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { const c = i % n; mn[c] = Math.min(mn[c], arr[i]); mx[c] = Math.max(mx[c], arr[i]); } a.min = mn; a.max = mx; }
    accessors.push(a); return accessors.length - 1;
  };
  // טקסטורות ותמונות בשימוש
  const sj = src.json, texMap = new Map(), imgMap = new Map(), textures = [], images = [];
  const fixTex = ref => { if (!ref || ref.index == null) return; let ni = texMap.get(ref.index); if (ni == null) { const t = { ...sj.textures[ref.index] }; let ii = imgMap.get(t.source); if (ii == null) { const im = sj.images[t.source]; images.push({ name: im.name, mimeType: im.mimeType, bufferView: pushView(src.view(im.bufferView)) }); ii = images.length - 1; imgMap.set(t.source, ii); } t.source = ii; textures.push(t); ni = textures.length - 1; texMap.set(ref.index, ni); } ref.index = ni; };
  const mats = materials.map(m => { const c = JSON.parse(JSON.stringify(m)); fixTex(c.pbrMetallicRoughness?.baseColorTexture); fixTex(c.emissiveTexture); fixTex(c.normalTexture); fixTex(c.pbrMetallicRoughness?.metallicRoughnessTexture); return c; });
  // רשתות: part -> primitives מאונדקסים (איחוד קודקודים זהים)
  const gltfMeshes = meshes.map(({ name, part, skin }) => {
    const prims = [];
    for (const [m, a] of [...part.prims].sort((x, y) => x[0] - y[0])) {
      if (!a.length) continue;
      const key = new Map(), P = [], N = [], U = [], I = [], J = [], Wt = [];
      for (let i = 0; i < a.length; i += 8) {
        const k = Array.from(a.slice(i, i + 8), v => Math.round(v * 1e5)).join(',');
        let idx = key.get(k);
        if (idx == null) { idx = P.length / 3; key.set(k, idx); P.push(a[i], a[i + 1], a[i + 2]); const l = Math.hypot(a[i + 3], a[i + 4], a[i + 5]) || 1; N.push(a[i + 3] / l, a[i + 4] / l, a[i + 5] / l); U.push(a[i + 6], a[i + 7]); if (skin) { const w = skin(a[i], a[i + 1], a[i + 2]); J.push(...w.j); Wt.push(...w.w); } }
        I.push(idx);
      }
      const attributes = { POSITION: accessor(P, 'VEC3', 5126, 34962, true), NORMAL: accessor(N, 'VEC3', 5126, 34962), TEXCOORD_0: accessor(U, 'VEC2', 5126, 34962) };
      if (skin) { attributes.JOINTS_0 = accessor(J, 'VEC4', 5121, 34962); attributes.WEIGHTS_0 = accessor(Wt, 'VEC4', 5126, 34962); }
      prims.push({ attributes, indices: accessor(I, 'SCALAR', P.length / 3 > 65535 ? 5125 : 5123, 34963), material: matRemap ? matRemap(m) : m });
    }
    return { name, primitives: prims };
  });
  const anims = animations.map(an => ({ name: an.name, channels: an.channels.map((c, i) => ({ sampler: i, target: { node: c.node, path: c.path } })),
    samplers: an.channels.map(c => ({ input: accessor(c.times, 'SCALAR', 5126, null, true), interpolation: 'LINEAR', output: accessor(c.values, 'VEC3', 5126) })) }));
  const gskins = skins.map(s => ({ name: s.name, joints: s.joints, inverseBindMatrices: accessor(s.ibm.flat(), 'MAT4', 5126) }));
  const json = { asset: { version: '2.0', generator: 'kav-bochan build_bus_variants.mjs' }, scene: 0, scenes, nodes, meshes: gltfMeshes, materials: mats, accessors, bufferViews, buffers: [{ byteLength: 0 }] };
  if (textures.length) { json.textures = textures; json.images = images; json.samplers = sj.samplers; }
  if (anims.length) json.animations = anims;
  if (gskins.length) json.skins = gskins;
  if (extras) json.scenes[0].extras = extras;
  const used = new Set(); const walk = o => { if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if (k === 'extensions') Object.keys(v).forEach(e => used.add(e)); walk(v); } } };
  walk(json.materials); walk(json.textures);
  if (used.size) json.extensionsUsed = [...used];
  if (used.has('KHR_texture_transform')) json.extensionsRequired = ['KHR_texture_transform'];
  const binBuf = Buffer.concat(chunks); const binPad = Buffer.concat([binBuf, Buffer.alloc((4 - binBuf.length % 4) % 4)]);
  json.buffers[0].byteLength = binPad.length;
  let js = Buffer.from(JSON.stringify(json), 'utf8'); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
  const ch = (buf, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, buf]); };
  fs.writeFileSync(file, Buffer.concat([head, ch(js, 0x4E4F534A), ch(binPad, 0x004E4942)]));
  return { tris: gltfMeshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + accessors[p.indices].count / 3, 0), 0), bytes: fs.statSync(file).size };
}
