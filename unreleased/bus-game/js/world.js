// העולם: קרקע, שטחים, רחובות עם מדרכות, בניינים מוחלצים, דודי שמש ועצים — מתוך world/city.json
// (נבנה ב-tools/build_city.py; העצים, דודי השמש והאספלט הנוסף בפניות כבר מחושבים שם).
//
// ביצועים: כל מה שעל הקרקע (קרקע, שטחים, שבילים, מדרכות, אבני שפה, אספלט, סימון) — רשת אחת, קריאת ציור אחת.
// השכבות מצוירות לפי הסדר בתוך הרשת, בלי כתיבה לעומק (depthWrite: false) ולפני כל השאר (renderOrder שלילי),
// כך שאין הבהוב בין שכבות קרובות. הבניינים — רשת אחת, קווי הגג — אחת, דודי השמש — InstancedMesh אחד,
// העצים — InstancedMesh לגזע ולנוף בכל משבצת של 800 מ' (כדי שמה שמחוץ למסך לא יצויר).
import * as THREE from 'three';
import { keep } from './texkeep.js';

// נקודה בעולם (x מזרחה, y צפונה, במטרים) ← וקטור של three (Y למעלה, ‎-Z צפונה)
export const V = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

export async function loadCity(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('city.json ' + r.status);
  return parseCity(await r.json());
}
export function parseCity(c) {
  const d = v => v / 10;
  const city = { meta: c.meta, stops: c.stops };
  city.buildings = c.buildings.map((b, i) => ({ h: d(b[0]), pts: pairs(b, 1, d), st: c.bstyle?.[i] ?? 0, hp: c.bpop ? d(c.bpop[i]) : d(b[0]) }));
  city.roads = c.roads.map((r, i) => {
    const inf = c.rinfo?.[i];
    return { cls: r[0], w: d(r[1]), pts: pairs(r, 2, d), kind: inf ? inf[0] : (r[0] === 'm' ? 3 : r[0] === 'f' ? 4 : 1), bus: inf ? inf[1] : 0, w0: inf ? d(inf[2]) : d(r[1]) };
  });
  city.areas = c.areas.map(a => ({ kind: a[0], pts: pairs(a, 1, d) }));
  city.patches = (c.patches || []).map(p => pairs(p, 0, d));
  city.trees = c.trees || [];
  city.solar = c.solar || [];
  const n = c.graph.nodes;
  city.nodes = new Float32Array(n.length);
  for (let i = 0; i < n.length; i++) city.nodes[i] = n[i] / 10;
  city.edges = Uint32Array.from(c.graph.edges);
  const L = c.graph.lane;
  city.lane = new Float32Array(city.edges.length / 2).fill(1.8);
  if (L) for (let i = 0; i < L.length; i++) city.lane[i] = L[i] / 10;
  return city;
}
function pairs(a, from, d) {
  const out = [];
  for (let i = from; i + 1 < a.length; i += 2) out.push([d(a[i]), d(a[i + 1])]);
  return out;
}

// ---------- צבעים (כמו בתצוגה מ-OpenStreetMap שאושרה: חול, טיח בהיר, גגות אפורים ומעט רעפים)
const GROUND = 0xd8cfba;
// שטחים: [צבע, סדר] — סדר גבוה מצויר מעל
const AREA_STYLE = {
  farm: [0xdcd4a8, 2], meadow: [0xd2d8a4, 3], orchard: [0xb7c98a, 3], res: [0xe2dac8, 2], ind: [0xdcd6cc, 2], com: [0xe2d8cc, 2],
  constr: [0xddd0b4, 3], cemetery: [0xc9d3b0, 3], school: [0xe4dac2, 3], sport: [0xd2dcae, 4], sand: [0xe6dbbd, 3], scrub: [0xcfd3a4, 4],
  parking: [0xcfccc5, 5], wood: [0x9fbf7d, 5], grass: [0xbad49a, 5], park: [0xaed08b, 6], play: [0xe4cfa3, 7],
  pitch: [0x8fc47a, 7], water: [0x7fc4dd, 8], busst: [0xd6d1c8, 8],
};
// רחובות לפי סוג (rinfo ב-city.json): 0 שירות, 1 מקומי, 2 עורק (tertiary), 3 ראשי, 4 שביל, 5 דרך עפר
const ASPH = [0xaeaba7, 0xa29f9b, 0x989591, 0x8b8987];
const CASING = 0xe2ddd1, CASING_M = 0xd9d3c6, KERB = 0xc0bbb0, FOOT = 0xf3eee2, TRACK = 0xd3c4a0, MARK = 0xf4f4f0;
// קירות: טיח ואבן בגוונים חמים מעט שונים; גגות: אפור (0-4), רעפים (5-7), פח בהיר (8)
const WALLS = [0xfbf8f1, 0xf7f0e2, 0xfdfbf6, 0xf3e7d0, 0xf8eedb, 0xeeebe4, 0xf9ecd8, 0xe8e2d6];
const ROOFS = [0xd2d0cb, 0xc8c5be, 0xdcd9d2, 0xbfbcb5, 0xd0ccc3, 0xb5654a, 0xa85a43, 0xc0775a, 0xd0cfca];
const GREENS = [0x6f9a4c, 0x7fa856, 0x5e8a45, 0x8bae5c, 0x6c9150, 0x97b56a];

// רעש עדין ומשותף (טקסטורה קטנה אחת שחוזרת) — מוריד את המראה ה"פלסטיקי" של משטחים גדולים חלקים
function noiseTexture(seed, lo, hi, blotch) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const G = 8, grid = Array.from({ length: G * G }, rnd);
  const at = (i, j) => grid[((j + G) % G) * G + ((i + G) % G)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * G, fy = y / N * G, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const sm = t => t * t * (3 - 2 * t), su = sm(u), sv = sm(v);
    const b = (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
    const k = lo + (hi - lo) * ((1 - blotch) * rnd() + blotch * b);
    const o = (y * N + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = k; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return keep(t);
}

function windowTexture() {
  // תא אחד = קומה אחת × חלון אחד; הפינה (0,0) לבנה — משמשת לגגות
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#a9b8c4'; g.fillRect(18, 16, 28, 26);
  g.fillStyle = '#ccd8e2'; g.fillRect(18, 16, 28, 5);
  g.fillStyle = '#e8e8e6'; g.fillRect(14, 42, 36, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return keep(t);
}

function hash(i) { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export function buildWorld(scene, city, opts = {}) {
  const group = new THREE.Group(); group.name = 'world';
  scene.add(group);
  group.add(groundMesh(city));
  group.add(...buildingMeshes(city));
  if (city.solar.length) group.add(solarMesh(city));
  if (opts.trees !== false) group.add(trees(city));
  return group;
}

// ---------- הקרקע: כל השכבות השטוחות ברשת אחת, לפי הסדר
// layers: רשימה של { pos: [], col: THREE.Color } — מצוירות בסדר הזה
function groundMesh(city) {
  const [HX, HY] = city.meta.half;
  const layers = [];
  const layer = hex => { const L = { pos: [], col: new THREE.Color(hex) }; layers.push(L); return L; };
  // קרקע: ריבוע גדול
  {
    const L = layer(GROUND), X = HX + 1600, Y = HY + 1600;
    L.pos.push(-X, 0, -Y, -X, 0, Y, X, 0, Y, -X, 0, -Y, X, 0, Y, X, 0, -Y);
  }
  // שטחים לפי הסדר, ובכל סדר — לפי הסוג
  const kinds = Object.keys(AREA_STYLE).sort((a, b) => AREA_STYLE[a][1] - AREA_STYLE[b][1]);
  for (const k of kinds) {
    const L = layer(AREA_STYLE[k][0]);
    for (const a of city.areas) {
      if (a.kind !== k || a.pts.length < 3) continue;
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(a.pts.map(([x, y]) => new THREE.Vector2(x, y)), []); } catch { continue; }
      for (const t of tris) {
        const [p, q, r] = t.map(i => a.pts[i]);
        const ccw = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) > 0;
        for (const v of ccw ? [p, q, r] : [p, r, q]) L.pos.push(v[0], 0, -v[1]);
      }
    }
  }
  const track = layer(TRACK), foot = layer(FOOT), casM = layer(CASING_M), cas = layer(CASING), kerb = layer(KERB);
  const asph = ASPH.map(c => layer(c)), mark = layer(MARK);
  const drive = city.roads.filter(r => r.cls !== 'f');
  for (const r of city.roads) if (r.cls === 'f') ribbon((r.kind === 5 ? track : foot).pos, r.pts, r.w);
  for (const r of drive) {
    const major = r.kind === 3;
    ribbon((major ? casM : cas).pos, r.pts, r.w + (major ? 4.4 : r.kind === 0 && r.w < 6 ? 1.6 : 3.6));
    ribbon(kerb.pos, r.pts, r.w + 0.7);
  }
  // האספלט הנוסף בפניות — בגוון של רחוב מקומי, לפני שאר האספלט (כך שהראשיים מעליו)
  for (const p of city.patches) polyTris(asph[1].pos, p);
  for (const r of drive) ribbon(asph[Math.min(3, r.kind)].pos, r.pts, r.w);
  for (const r of drive) if (r.kind === 3 || r.w >= 9) dashes(mark.pos, r.pts, 0.15);

  let n = 0; for (const L of layers) n += L.pos.length;
  const pos = new Float32Array(n), col = new Float32Array(n), uv = new Float32Array(n / 3 * 2);
  let o = 0;
  for (const L of layers) {
    pos.set(L.pos, o);
    for (let i = 0; i < L.pos.length; i += 3) { col[o + i] = L.col.r; col[o + i + 1] = L.col.g; col[o + i + 2] = L.col.b; }
    o += L.pos.length;
  }
  for (let i = 0, j = 0; i < n; i += 3, j += 2) { uv[j] = pos[i] / 14; uv[j + 1] = pos[i + 2] / 14; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const nor = new Float32Array(n); for (let i = 1; i < n; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: noiseTexture(3, 226, 255, 0.35), depthWrite: false }));
  m.name = 'ground'; m.receiveShadow = true; m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
function polyTris(out, pts) {
  let tris; try { tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, y]) => new THREE.Vector2(x, y)), []); } catch { return; }
  for (const t of tris) {
    const [p, q, r] = t.map(i => pts[i]);
    const ccw = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]) > 0;
    for (const v of ccw ? [p, q, r] : [p, r, q]) out.push(v[0], 0, -v[1]);
  }
}

// ---------- רצועה שטוחה לאורך קו שבור: חיבור משופע (miter) בכל נקודה, ועיגול (10 צלעות) בקצוות ובפניות.
// אותה צורה בדיוק כמו ribbon_polys ב-tools/build_city.py (שם נבדק שהאוטובוס נשאר על האספלט)
export function miterNormals(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], p = pts[i], b = pts[Math.min(n - 1, i + 1)];
    let d1x = p[0] - a[0], d1y = p[1] - a[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
    let l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
    if (l1 < 1e-6) { d1x = d2x; d1y = d2y; l1 = l2; }
    if (l2 < 1e-6) { d2x = d1x; d2y = d1y; l2 = l1; }
    l1 = l1 || 1; l2 = l2 || 1;
    d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
    let nx = -(d1y + d2y), ny = d1x + d2x; const nl = Math.hypot(nx, ny);
    if (nl < 1e-3) { out.push([-d1y, d1x]); continue; }
    nx /= nl; ny /= nl;
    const k = Math.min(2, 1 / Math.max(0.5, nx * -d1y + ny * d1x));
    out.push([nx * k, ny * k]);
  }
  return out;
}
export function ribbon(out, pts, w, h = 0) {
  const hw = w / 2, N = miterNormals(pts);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (Math.hypot(x1 - x0, y1 - y0) < 0.01) continue;
    const [ax, ay] = N[i], [bx, by] = N[i + 1];
    const A = [x0 + ax * hw, h, -(y0 + ay * hw)], B = [x0 - ax * hw, h, -(y0 - ay * hw)], C = [x1 - bx * hw, h, -(y1 - by * hw)], D = [x1 + bx * hw, h, -(y1 + by * hw)];
    out.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  for (let i = 0; i < pts.length; i++) {
    let need = i === 0 || i === pts.length - 1;
    if (!need) {
      const [xa, ya] = pts[i - 1], [xb, yb] = pts[i], [xc, yc] = pts[i + 1];
      const a1 = Math.atan2(yb - ya, xb - xa), a2 = Math.atan2(yc - yb, xc - xb);
      let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
      need = da > 0.12;
    }
    if (need) disc(out, pts[i][0], pts[i][1], hw, h);
  }
}
function disc(out, x, y, r, h) {
  const N = 10;
  for (let k = 0; k < N; k++) {
    const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
    out.push(x, h, -y, x + Math.cos(a1) * r, h, -(y + Math.sin(a1) * r), x + Math.cos(a0) * r, h, -(y + Math.sin(a0) * r));
  }
}
function dashes(out, pts, w) {
  const DASH = 3, GAP = 5;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.01) continue;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy * w, ny = ux * w;
    for (let s = (DASH + GAP - acc) % (DASH + GAP); s < L; s += DASH + GAP) {
      const e = Math.min(L, s + DASH);
      const ax = x0 + ux * s, ay = y0 + uy * s, bx = x0 + ux * e, by = y0 + uy * e;
      out.push(ax + nx, 0, -(ay + ny), ax - nx, 0, -(ay - ny), bx - nx, 0, -(by - ny), ax + nx, 0, -(ay + ny), bx - nx, 0, -(by - ny), bx + nx, 0, -(by + ny));
    }
    acc = (acc + L) % (DASH + GAP);
  }
}

// ---------- בניינים: קירות (כהים מעט למטה — "צל מגע"), חלונות לפי קומות, גג בגוון שנקבע בבנייה; קווי שפת הגג
function buildingMeshes(city) {
  const pos = [], uv = [], col = [], lines = [], c = new THREE.Color(), cb = new THREE.Color(), rc = new THREE.Color();
  for (const b of city.buildings) {
    let area2 = 0;
    for (let i = 0, j = b.pts.length - 1; i < b.pts.length; j = i++) area2 += b.pts[j][0] * b.pts[i][1] - b.pts[i][0] * b.pts[j][1];
    const pts = area2 < 0 ? b.pts.slice().reverse() : b.pts, n = pts.length, h = b.h;
    c.setHex(WALLS[(b.st >> 4) % WALLS.length]);
    cb.copy(c).multiplyScalar(0.72);
    const floors = Math.max(1, Math.round(h / 3)), fh = h / floors;
    let run = 0;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
      const L = Math.hypot(x1 - x0, y1 - y0);
      const u0 = run / 3.6, u1 = (run + L) / 3.6; run += L;
      const v1 = h / fh;
      const A = [x0, 0, -y0], B = [x1, 0, -y1], C = [x1, h, -y1], D = [x0, h, -y0];
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
      uv.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1);
      for (const k of [0, 0, 1, 0, 1, 1]) { const cc = k ? c : cb; col.push(cc.r, cc.g, cc.b); }
      lines.push(x0, h + 0.03, -y0, x1, h + 0.03, -y1);
    }
    const contour = pts.map(([x, y]) => new THREE.Vector2(x, y));
    let tris = [];
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { }
    rc.setHex(ROOFS[(b.st & 15) % ROOFS.length]);
    for (const t of tris) for (const k of ((pts[t[1]][0] - pts[t[0]][0]) * (pts[t[2]][1] - pts[t[0]][1]) - (pts[t[1]][1] - pts[t[0]][1]) * (pts[t[2]][0] - pts[t[0]][0]) > 0 ? t : [t[0], t[2], t[1]])) {
      const [x, y] = pts[k]; pos.push(x, h, -y); uv.push(0.05, 0.05); col.push(rc.r, rc.g, rc.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture() });   // הפאות מכוונות כלפי חוץ — צד אחד מספיק
  const m = new THREE.Mesh(g, mat); m.name = 'buildings'; m.castShadow = true; m.receiveShadow = true;
  mat.shadowSide = THREE.BackSide;   // רק הפאות האחוריות נכנסות למפת הצל — בלי פסים ("אקנה") על הגגות
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const ln = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9d968a, transparent: true, opacity: 0.5 }));
  ln.name = 'roof-edges';
  return [m, ln];
}

// ---------- דודי שמש: מכל לבן על רגליים וקולט כחול נטוי לדרום, על הגג עצמו
function solarMesh(city) {
  const parts = [], add = (geo, hex) => {
    geo = geo.index ? geo.toNonIndexed() : geo; geo.deleteAttribute('uv');
    const n = geo.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(geo);
  };
  add(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 6).rotateZ(Math.PI / 2).translate(0, 1.2, -0.45), 0xf7f7f4);
  add(new THREE.BoxGeometry(1.9, 0.1, 1.6).rotateX(0.55).translate(0, 0.48, 0.7), 0x5d6f88);
  add(new THREE.BoxGeometry(1.5, 0.68, 0.06).translate(0, 0.34, -0.45), 0x8f9296);     // מעמד המכל
  add(new THREE.BoxGeometry(1.8, 0.9, 0.05).translate(0, 0.45, 0.05), 0x8f9296);      // מעמד הקולט (הצד הגבוה)
  const geo = mergeAll(parts);
  const S = city.solar, n = S.length / 4;
  const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    q.setFromAxisAngle(up, S[i * 4 + 3] / 1000);
    m.compose(p.set(S[i * 4] / 10, S[i * 4 + 2] / 10, -S[i * 4 + 1] / 10), q, one);
    im.setMatrixAt(i, m);
  }
  im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; im.name = 'solar';
  return im;
}
function mergeAll(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) {
    const a = new Float32Array(n * 3); let o = 0;
    for (const g of list) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, 3));
  }
  return out;
}

// ---------- עצים: גזע ונוף, InstancedMesh בכל משבצת של 800 מ'. גודל, סיבוב וגוון — קבועים לכל עץ
const TILE = 800;
function trees(city) {
  const T = city.trees, n = T.length / 4;
  const g = new THREE.Group(); g.name = 'trees';
  const crownGeo = new THREE.DodecahedronGeometry(3.2, 0).scale(1, 0.85, 1).translate(0, 5.2, 0);   // 36 משולשים לנוף
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.38, 3.2, 5, 1, true).translate(0, 1.6, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3f });
  const tiles = new Map();
  for (let i = 0; i < n; i++) {
    const x = T[i * 4] / 10, y = T[i * 4 + 1] / 10, k = Math.floor(x / TILE) + ',' + Math.floor(y / TILE);
    if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(i);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  for (const list of tiles.values()) {
    const crown = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    list.forEach((i, j) => {
      const k = T[i * 4 + 2] / 100;
      q.setFromAxisAngle(up, hash(i) * 6.28);
      s.set(k, k * (0.9 + hash(i + 0.37) * 0.25), k); p.set(T[i * 4] / 10, 0, -T[i * 4 + 1] / 10);
      m.compose(p, q, s); crown.setMatrixAt(j, m); trunk.setMatrixAt(j, m);
      crown.setColorAt(j, c.setHex(GREENS[Math.floor(hash(i + 0.71) * GREENS.length)]));
    });
    crown.computeBoundingSphere(); trunk.computeBoundingSphere();
    crown.castShadow = true; crown.receiveShadow = true; trunk.receiveShadow = true;
    crown.name = 'tree-crowns'; trunk.name = 'tree-trunks';
    g.add(trunk, crown);
  }
  return g;
}
