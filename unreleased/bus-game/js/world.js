// העולם: קרקע, שטחים ירוקים, רחובות עם מדרכות, בניינים מוחלצים, עצים ותחנות — מתוך world/city.json
import * as THREE from 'three';
import { keep } from './texkeep.js';

// נקודה בעולם (x מזרחה, y צפונה, במטרים) ← וקטור של three (Y למעלה, ‎-Z צפונה)
export const V = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

export async function loadCity(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('city.json ' + r.status);
  const c = await r.json();
  const d = v => v / 10;
  const city = { meta: c.meta, stops: c.stops };
  city.buildings = c.buildings.map(b => ({ h: d(b[0]), pts: pairs(b, 1, d) }));
  city.roads = c.roads.map(r => ({ cls: r[0], w: d(r[1]), pts: pairs(r, 2, d) }));
  city.areas = c.areas.map(a => ({ kind: a[0], pts: pairs(a, 1, d) }));
  const n = c.graph.nodes;
  city.nodes = new Float32Array(n.length);
  for (let i = 0; i < n.length; i++) city.nodes[i] = n[i] / 10;
  city.edges = Uint32Array.from(c.graph.edges);
  return city;
}
function pairs(a, from, d) {
  const out = [];
  for (let i = from; i + 1 < a.length; i += 2) out.push([d(a[i]), d(a[i + 1])]);
  return out;
}

// ---------- צבעים (מראה בהיר: לבן, תכלת, אבן)
const AREA_COL = { park: 0xcfe6bf, grass: 0xd8eacb, pitch: 0xbadfa6, scrub: 0xd9e3c4, farm: 0xece6cf, orchard: 0xd3e4bd,
  wood: 0xbcd9ad, play: 0xe8e0c8, parking: 0xdfe2e7, sand: 0xefe7d2 };
// קירות: טיח לבן ואבן בהירה בגוונים חמים וקרים מעט שונים — שכונה לא נראית כמו בלוק אחד.
// גגות: בטון/איטום אפור-בהיר, כהים מעט מהקיר, כך שמלמעלה רואים את צורת הבניין
const WALL_TONES = [0xfdfcf9, 0xf8f3ea, 0xf3ede2, 0xf9f8f5, 0xf5f0e8, 0xf0f2f4, 0xf8f2e8, 0xebeff3, 0xf3ebdc, 0xf7f5f0];
const ROOF_TONES = [0xd9d7d2, 0xcfcdc8, 0xdedad1, 0xc9ccd0, 0xd4d0c6, 0xe2e0db];

// רעש עדין ומשותף (טקסטורה קטנה אחת שחוזרת) — מוריד את המראה ה"פלסטיקי" של משטחים גדולים חלקים
function noiseTexture(seed, lo, hi, blotch) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // כתמים גדולים רכים (ערכים חלקים על רשת גסה, עם גלישה) + גרגר דק
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
// קואורדינטות טקסטורה לפי המיקום בעולם (משטחים שטוחים): size מטרים לכל חזרה
function planarUV(g, size) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / size; uv[i * 2 + 1] = p.getZ(i) / size; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function windowTexture() {
  // תא אחד = קומה אחת × חלון אחד; הפינה (0,0) לבנה — משמשת לגגות
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#9fb3c4'; g.fillRect(18, 16, 28, 26);
  g.fillStyle = '#c8d6e2'; g.fillRect(18, 16, 28, 5);
  g.fillStyle = '#e4e7ea'; g.fillRect(14, 42, 36, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return keep(t);
}

function hash(i) { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

export function buildWorld(scene, city, opts = {}) {
  const group = new THREE.Group(); group.name = 'world';
  scene.add(group);
  const [HX, HY] = city.meta.half;

  // קרקע
  const gg = new THREE.PlaneGeometry(HX * 2 + 3000, HY * 2 + 3000).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ color: 0xe8ebe0 }));
  ground.receiveShadow = true; ground.name = 'ground';
  group.add(ground);

  // שטחים
  {
    const pos = [], col = [], c = new THREE.Color();
    for (const a of city.areas) {
      const contour = a.pts.map(([x, y]) => new THREE.Vector2(x, y));
      if (contour.length < 3) continue;
      let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { continue; }
      c.setHex(AREA_COL[a.kind] ?? 0xdde8d0);
      const h = a.kind === 'parking' ? 0.03 : 0.02;
      for (const t of tris) for (const k of t) { const [x, y] = a.pts[k]; pos.push(x, h, -y); col.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 }));
    m.name = 'areas'; m.receiveShadow = true; group.add(m);
  }

  // רחובות: מדרכה רחבה מתחת, אספלט מעליה; עיגולים בפינות ובצמתים
  {
    const layers = { walk: [], kerb: [], asph: [], asphM: [], foot: [], mark: [] };
    const add = (arr, pts, w, h) => ribbon(arr, pts, w, h);
    for (const r of city.roads) {
      if (r.cls === 'f') { add(layers.foot, r.pts, r.w, 0.05); continue; }
      add(layers.walk, r.pts, r.w + (r.w > 5 ? 4.2 : 2.4), 0.06);
      add(layers.kerb, r.pts, r.w + 0.7, 0.08);   // אבן שפה: קו מתאר כהה מעט בין המדרכה לכביש
      add(r.cls === 'm' ? layers.asphM : layers.asph, r.pts, r.w, r.cls === 'm' ? 0.11 : 0.1);
      if (r.cls === 'm' || r.w >= 9) dashes(layers.mark, r.pts, 0.15, 0.125);
    }
    // השכבות קרובות מאוד בגובה — polygonOffset מונע הבהוב כשמתרחקים
    // היררכיה כמו במפה: כביש אפור ניטרלי (בלי גוון — הצבע שמור לקווים), מדרכה בהירה, שפה ביניהם
    const asphTex = noiseTexture(3, 222, 255, 0.3), walkTex = noiseTexture(5, 236, 255, 0.4);
    const mk = (arr, color, name, k, map, uvSize) => {
      if (!arr.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      if (map) planarUV(g, uvSize);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, map: map || null, polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -k * 2 }));
      m.name = name; m.renderOrder = k; m.receiveShadow = true; group.add(m); return m;
    };
    mk(layers.walk, 0xdcdddf, 'sidewalks', 1, walkTex, 9);
    mk(layers.foot, 0xd9cfbd, 'footways', 1, walkTex, 9);
    mk(layers.kerb, 0xa9adb3, 'kerbs', 1.5);
    mk(layers.asph, 0x777b81, 'asphalt', 2, asphTex, 14);
    mk(layers.asphM, 0x6a6e74, 'asphalt-main', 3, asphTex, 14);
    mk(layers.mark, 0xf4f4f0, 'markings', 4);
  }

  // בניינים
  {
    const pos = [], uv = [], col = [], c = new THREE.Color(), cb = new THREE.Color();
    city.buildings.forEach((b, bi) => {
      // קירות כלפי חוץ וגג כלפי מעלה (סדר נקודות נגד כיוון השעון) — כך הנורמלים נכונים לאור ולצל
      let area2 = 0;
      for (let i = 0, j = b.pts.length - 1; i < b.pts.length; j = i++) area2 += b.pts[j][0] * b.pts[i][1] - b.pts[i][0] * b.pts[j][1];
      const pts = area2 < 0 ? b.pts.slice().reverse() : b.pts, n = pts.length, h = b.h;
      c.setHex(WALL_TONES[Math.floor(hash(bi) * WALL_TONES.length)]);
      const floors = Math.max(1, Math.round(h / 3));
      const fh = h / floors;
      let run = 0;
      for (let i = 0; i < n; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
        const L = Math.hypot(x1 - x0, y1 - y0);
        const u0 = run / 3.6, u1 = (run + L) / 3.6; run += L;
        const v1 = h / fh;
        // שני משולשים; הצבע כהה יותר למטה (צל מגע)
        const A = [x0, 0, -y0], B = [x1, 0, -y1], C = [x1, h, -y1], D = [x0, h, -y0];
        pos.push(...A, ...B, ...C, ...A, ...C, ...D);
        uv.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1);
        cb.copy(c).multiplyScalar(0.86);
        for (const k of [0, 0, 1, 0, 1, 1]) { const cc = k ? c : cb; col.push(cc.r, cc.g, cc.b); }
      }
      // גג
      const contour = pts.map(([x, y]) => new THREE.Vector2(x, y));
      let tris = [];
      try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch { }
      const rc = new THREE.Color(ROOF_TONES[Math.floor(hash(bi + 0.5) * ROOF_TONES.length)]);
      for (const t of tris) for (const k of ((pts[t[1]][0] - pts[t[0]][0]) * (pts[t[2]][1] - pts[t[0]][1]) - (pts[t[1]][1] - pts[t[0]][1]) * (pts[t[2]][0] - pts[t[0]][0]) > 0 ? t : [t[0], t[2], t[1]])) {
        const [x, y] = pts[k]; pos.push(x, h, -y); uv.push(0.05, 0.05); col.push(rc.r, rc.g, rc.b);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture() });   // הפאות מכוונות כלפי חוץ — צד אחד מספיק
    const m = new THREE.Mesh(g, mat); m.name = 'buildings'; m.castShadow = true; m.receiveShadow = true;
    mat.shadowSide = THREE.BackSide;   // רק הפאות האחוריות נכנסות למפת הצל — בלי פסים ("אקנה") על הגגות
    group.add(m);
  }

  // עצים: בפארקים ולאורך רחובות מגורים
  if (opts.trees !== false) group.add(trees(city));
  return group;
}

// רצועה שטוחה לאורך קו שבור (מרובעים פשוטים + עיגול בכל פינה)
function ribbon(out, pts, w, h) {
  const hw = w / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 0.01) continue;
    const nx = -dy / L * hw, ny = dx / L * hw;
    const a = [x0 + nx, h, -(y0 + ny)], b = [x0 - nx, h, -(y0 - ny)], c = [x1 - nx, h, -(y1 - ny)], d = [x1 + nx, h, -(y1 + ny)];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
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
function dashes(out, pts, w, h0) {
  const h = h0 + 0.012, DASH = 3, GAP = 5;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.01) continue;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy * w, ny = ux * w;
    for (let s = (DASH + GAP - acc) % (DASH + GAP); s < L; s += DASH + GAP) {
      const e = Math.min(L, s + DASH);
      const ax = x0 + ux * s, ay = y0 + uy * s, bx = x0 + ux * e, by = y0 + uy * e;
      out.push(ax + nx, h, -(ay + ny), ax - nx, h, -(ay - ny), bx - nx, h, -(by - ny), ax + nx, h, -(ay + ny), bx - nx, h, -(by - ny), bx + nx, h, -(by + ny));
    }
    acc = (acc + L) % (DASH + GAP);
  }
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function trees(city) {
  const spots = [];
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const a of city.areas) {
    if (!['park', 'grass', 'wood', 'orchard', 'scrub'].includes(a.kind)) continue;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const [x, y] of a.pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const area = (maxx - minx) * (maxy - miny);
    const n = Math.min(80, Math.floor(area / (a.kind === 'wood' || a.kind === 'orchard' ? 90 : 260)));
    for (let k = 0; k < n; k++) {
      const x = minx + rnd() * (maxx - minx), y = miny + rnd() * (maxy - miny);
      if (pointInPoly(x, y, a.pts)) spots.push([x, y, 0.8 + rnd() * 0.6]);
    }
  }
  // לאורך רחובות מגורים, על המדרכה, כל ~22 מ'
  for (const r of city.roads) {
    if (r.cls !== 'd' || r.w < 6.5) continue;
    let acc = rnd() * 22;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [x0, y0] = r.pts[i], [x1, y1] = r.pts[i + 1];
      const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1) continue;
      const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      for (let s = acc; s < L; s += 22) {
        const side = rnd() < 0.5 ? 1 : -1, off = r.w / 2 + 1.5;
        spots.push([x0 + ux * s - uy * off * side, y0 + uy * s + ux * off * side, 0.7 + rnd() * 0.4]);
      }
      acc = (acc - L % 22 + 22) % 22;
    }
  }
  const MAX = 4000; if (spots.length > MAX) spots.length = MAX;
  const g = new THREE.Group(); g.name = 'trees';
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 2.2, 5).translate(0, 1.1, 0),
    new THREE.MeshLambertMaterial({ color: 0x8a7158 }), spots.length);
  const crownGeo = new THREE.IcosahedronGeometry(1.6, 0).translate(0, 3.2, 0);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const greens = [0x8fbf7a, 0x7fb36d, 0x9cc78a, 0x86b874, 0xa6cc8f];
  spots.forEach(([x, y, k], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i) * 6.28);
    s.set(k, k * (0.9 + hash(i + 7) * 0.3), k); p.set(x, 0, -y);
    m.compose(p, q, s); trunk.setMatrixAt(i, m); crown.setMatrixAt(i, m);
    crown.setColorAt(i, c.setHex(greens[i % greens.length]));
  });
  trunk.castShadow = crown.castShadow = true;
  g.add(trunk, crown);
  return g;
}
