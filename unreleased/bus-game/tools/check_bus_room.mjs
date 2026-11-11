// בדיקת "המקום לאוטובוס": בכל הקווים האמיתיים (world/real_lines.json) — האוטובוס (12 × 2.55 מ') לא יוצא מהאספלט
// כפי שהוא מצויר, לא נוגע בבניין או בנוף של עץ, ושני אוטובוסים בכיוונים מנוגדים ברחוב דו-סטרי לא חופפים.
// משתמש בקוד של המשחק עצמו: parseCity ו-ribbon (js/world.js), RoadGraph (js/graph.js), computeRoute (js/lines.js),
// busPose (js/actors.js — ואם אי אפשר לטעון אותו ב-Node, עותק של אותן שלוש מידות).
// הרצה (מתוך unreleased/bus-game):  node tools/check_bus_room.mjs
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const three = pathToFileURL(path.join(ROOT, 'vendor/three/three.module.min.js')).href;
const addons = pathToFileURL(path.join(ROOT, 'vendor/three/addons/')).href;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true };
  if (s.startsWith('three/addons/')) return { url: ${JSON.stringify(addons)} + s.slice(13), shortCircuit: true };
  return next(s, c);
}`));
const THREE = await import('three');
const { parseCity, ribbon } = await import('../js/world.js');
const { RoadGraph } = await import('../js/graph.js');
const { computeRoute } = await import('../js/lines.js');
let busPose, poseFrom = 'js/actors.js';
try { ({ busPose } = await import('../js/actors.js')); } catch (e) {
  poseFrom = 'copy (' + e.message.split('\n')[0].slice(0, 60) + ')';
  const FRONT_AXLE = 1.8, REAR_AXLE = 7.75, REAR_TO_CENTER = 2.6;
  const atExt = (poly, s, out) => {
    if (s >= 0 && s <= poly.length) return poly.at(s, out);
    const P = poly.pts, n = P.length, [a, b] = s < 0 ? [P[0], P[1]] : [P[n - 2], P[n - 1]];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, base = s < 0 ? P[0] : P[n - 1], d = s < 0 ? s : s - poly.length;
    out[0] = base[0] + dx / L * d; out[1] = base[1] + dy / L * d; return out;
  };
  busPose = (poly, s) => {
    const f = atExt(poly, s - FRONT_AXLE, [0, 0]), r = atExt(poly, s - REAR_AXLE, [0, 0]);
    const dx = f[0] - r[0], dy = f[1] - r[1], L = Math.hypot(dx, dy) || 1;
    return { x: r[0] + dx / L * REAR_TO_CENTER, y: r[1] + dy / L * REAR_TO_CENTER, yaw: Math.atan2(dx / L, -dy / L), dir: [dx / L, dy / L] };
  };
}
const BUS_L = 12, BUS_W = 2.55;

const city = parseCity(JSON.parse(readFileSync(path.join(ROOT, 'world/city.json'), 'utf8')));
const graph = new RoadGraph(city);
const stopsById = new Map(city.stops.map(s => [s.id, s]));
const real = Object.values(JSON.parse(readFileSync(path.join(ROOT, 'world/real_lines.json'), 'utf8')).cities)[0].lines;

// ---------- האספלט: אותם משולשים שהמשחק מצייר (ribbon לכל רחוב נסיעה + האספלט הנוסף בפניות)
const tris = [];
const push = arr => { for (let i = 0; i < arr.length; i += 9) tris.push([arr[i], -arr[i + 2], arr[i + 3], -arr[i + 5], arr[i + 6], -arr[i + 8]]); };
for (const r of city.roads) if (r.cls !== 'f') { const a = []; ribbon(a, r.pts, r.w); push(a); }
for (const p of city.patches) {
  let t; try { t = THREE.ShapeUtils.triangulateShape(p.map(([x, y]) => new THREE.Vector2(x, y)), []); } catch { continue; }
  for (const [i, j, k] of t) tris.push([p[i][0], p[i][1], p[j][0], p[j][1], p[k][0], p[k][1]]);
}
const C = 8, grid = new Map(), key = (i, j) => i * 100003 + j;
function index(map, item, x0, y0, x1, y1) {
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(y0 / C); j <= Math.floor(y1 / C); j++) {
    const k = key(i, j); if (!map.has(k)) map.set(k, []); map.get(k).push(item);
  }
}
for (const t of tris) index(grid, t, Math.min(t[0], t[2], t[4]), Math.min(t[1], t[3], t[5]), Math.max(t[0], t[2], t[4]), Math.max(t[1], t[3], t[5]));
function inTri(x, y, t) {
  const d1 = (x - t[2]) * (t[1] - t[3]) - (t[0] - t[2]) * (y - t[3]);
  const d2 = (x - t[4]) * (t[3] - t[5]) - (t[2] - t[4]) * (y - t[5]);
  const d3 = (x - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (y - t[1]);
  const e = 1e-7;
  return !((d1 < -e || d2 < -e || d3 < -e) && (d1 > e || d2 > e || d3 > e));
}
const onAsphalt = (x, y) => (grid.get(key(Math.floor(x / C), Math.floor(y / C))) || []).some(t => inTri(x, y, t));

// ---------- בניינים ועצים
const bgrid = new Map();
city.buildings.forEach(b => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of b.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } index(bgrid, b, x0, y0, x1, y1); });
const tgrid = new Map(), T = city.trees;
for (let i = 0; i < T.length; i += 4) { const x = T[i] / 10, y = T[i + 1] / 10, r = 3.2 * T[i + 2] / 100; index(tgrid, { x, y, r }, x - r, y - r, x + r, y + r); }
const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

// מלבן האוטובוס: מרכז, כיוון; נקודות דגימה על ההיקף (כל 0.25 מ') ובפנים (כל מטר)
function rect(p) {
  const [dx, dy] = p.dir, nx = -dy, ny = dx, hl = BUS_L / 2, hw = BUS_W / 2;
  return { cx: p.x, cy: p.y, dx, dy, nx, ny, hl, hw, corners: [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => [p.x + dx * hl * a + nx * hw * b, p.y + dy * hl * a + ny * hw * b]) };
}
function samples(R) {
  const out = [];
  for (let a = -R.hl; a <= R.hl + 1e-9; a += 0.25) for (const b of [-R.hw, R.hw]) out.push([R.cx + R.dx * a + R.nx * b, R.cy + R.dy * a + R.ny * b]);
  for (let b = -R.hw; b <= R.hw + 1e-9; b += 0.25) for (const a of [-R.hl, R.hl]) out.push([R.cx + R.dx * a + R.nx * b, R.cy + R.dy * a + R.ny * b]);
  for (let a = -R.hl + 1; a < R.hl; a += 1) for (const b of [-0.6, 0, 0.6]) out.push([R.cx + R.dx * a + R.nx * b, R.cy + R.dy * a + R.ny * b]);
  return out;
}
const local = (R, x, y) => [(x - R.cx) * R.dx + (y - R.cy) * R.dy, (x - R.cx) * R.nx + (y - R.cy) * R.ny];
const inRect = (R, x, y, m = 0) => { const [a, b] = local(R, x, y); return Math.abs(a) <= R.hl + m && Math.abs(b) <= R.hw + m; };
function segX(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
function hitsBuilding(R) {
  const seen = new Set();
  for (const [x, y] of R.corners) for (const b of bgrid.get(key(Math.floor(x / C), Math.floor(y / C))) || []) seen.add(b);
  for (const [x, y] of samples(R)) for (const b of bgrid.get(key(Math.floor(x / C), Math.floor(y / C))) || []) seen.add(b);
  for (const b of seen) {
    if (b.pts.some(([x, y]) => inRect(R, x, y))) return true;
    if (R.corners.some(([x, y]) => inPoly(x, y, b.pts))) return true;
    for (let i = 0; i < 4; i++) for (let j = 0, k = b.pts.length - 1; j < b.pts.length; k = j++) if (segX(R.corners[i], R.corners[(i + 1) % 4], b.pts[k], b.pts[j])) return true;
  }
  return false;
}
function hitsTree(R) {
  const seen = new Set();
  for (const [x, y] of samples(R)) for (const t of tgrid.get(key(Math.floor(x / C), Math.floor(y / C))) || []) seen.add(t);
  for (const t of seen) {
    const [a, b] = local(R, t.x, t.y), qa = Math.max(0, Math.abs(a) - R.hl), qb = Math.max(0, Math.abs(b) - R.hw);
    if (Math.hypot(qa, qb) < t.r) return true;
  }
  return false;
}
function overlap(A, B) {           // SAT בין שני מלבנים
  for (const [ax, ay] of [[A.dx, A.dy], [A.nx, A.ny], [B.dx, B.dy], [B.nx, B.ny]]) {
    const pa = A.corners.map(([x, y]) => x * ax + y * ay), pb = B.corners.map(([x, y]) => x * ax + y * ay);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
  }
  return true;
}

// ---------- הקווים
const res = { lines: 0, poses: 0, offAsphalt: 0, building: 0, tree: 0, failed: [], worst: [] };
const all = [];
for (const r of real) {
  const stops = r.stops.map(id => stopsById.get(id)).filter(Boolean);
  if (stops.length < 2) continue;
  const route = computeRoute(graph, stops);
  if (route.error !== undefined) { res.failed.push(`${r.number}/${r.dir}`); continue; }
  res.lines++;
  const poly = route.poly, name = `${r.number}/${r.dir}`;
  // כל 0.5 מ'; כשהאוטובוס מסתובב מהר (פרסה, פנייה חדה) — כל 5 ס"מ
  const ss = [];
  for (let s = 0; s <= poly.length; s += 0.5) {
    ss.push(s);
    const a = busPose(poly, s).dir, b = busPose(poly, s + 0.5).dir;
    if (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) > 0.08) for (let k = 1; k < 10; k++) ss.push(s + 0.05 * k);
  }
  for (const s of ss) {
    const p = busPose(poly, s), R = rect(p); res.poses++;
    const out = samples(R).filter(([x, y]) => !onAsphalt(x, y));
    if (out.length) { res.offAsphalt++; if (res.worst.length < 12) res.worst.push(`${name} s=${s.toFixed(1)} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) ${out.length} points`); }
    if (hitsBuilding(R)) { res.building++; if (res.worst.length < 12) res.worst.push(`${name} s=${s.toFixed(1)} building`); }
    if (hitsTree(R)) { res.tree++; if (res.worst.length < 12) res.worst.push(`${name} s=${s.toFixed(1)} tree`); }
    // מסתובב: הכיוון 6 מ' לפני ואחרי שונה ביותר מ-35° (פנייה חדה או פרסה) — שם אוטובוס חוצה ממילא את הנתיב השני
    const a = busPose(poly, s - 6).dir, b = busPose(poly, s + 6).dir;
    all.push({ R, name, s, line: name, turning: a[0] * b[0] + a[1] * b[1] < Math.cos(0.6) });
  }
}
// אוטובוסים בכיוונים מנוגדים: כל זוג מיקומים (מקווים שונים או מאותו קו) שהכיוונים שלהם מנוגדים (זווית מעל 135°)
// ומרכזיהם קרובים. ליד צומת (עד 15 מ' מצומת של 3 רחובות ומעלה) — נספר בנפרד: שם אוטובוס שפונה שמאלה חוצה ממילא
const deg = new Map();
for (let e = 0; e < graph.E; e++) { const [a, b] = graph.edge(e); for (const [u, v] of [[a, b], [b, a]]) { if (!deg.has(u)) deg.set(u, new Set()); deg.get(u).add(v); } }
const jgrid = new Map();
for (const [n, s] of deg) if (s.size >= 3) { const [x, y] = graph.xy(n); index(jgrid, [x, y], x, y, x, y); }
const nearJunction = (x, y) => { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const [jx, jy] of jgrid.get(key(Math.floor(x / C) + i, Math.floor(y / C) + j)) || []) if (Math.hypot(jx - x, jy - y) < 15) return true; return false; };
const pgrid = new Map(); all.forEach(p => index(pgrid, p, p.R.cx, p.R.cy, p.R.cx, p.R.cy));
let opp = 0, oppPairs = 0, oppJ = 0; const oppSpots = new Map();
for (const A of all) {
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const B of pgrid.get(key(Math.floor(A.R.cx / C) + i, Math.floor(A.R.cy / C) + j)) || []) {
    if (B === A || A.R.dx * B.R.dx + A.R.dy * B.R.dy > -0.7 || Math.hypot(A.R.cx - B.R.cx, A.R.cy - B.R.cy) > 13) continue;
    if (A.name > B.name || (A.name === B.name && A.s > B.s)) continue;
    oppPairs++;
    if (overlap(A.R, B.R)) {
      if (nearJunction(A.R.cx, A.R.cy) || nearJunction(B.R.cx, B.R.cy) || A.turning || B.turning) oppJ++;
      else { opp++; const k = Math.round(A.R.cx / 20) + ',' + Math.round(A.R.cy / 20); if (!oppSpots.has(k)) oppSpots.set(k, `${A.name} s=${A.s} × ${B.name} s=${B.s} (${A.R.cx.toFixed(1)}, ${A.R.cy.toFixed(1)})`); }
    }
  }
}
console.log(`busPose: ${poseFrom}`);
console.log(`lines routed: ${res.lines} of ${real.length}${res.failed.length ? ' (no route: ' + res.failed.join(', ') + ')' : ''}; bus positions checked (every 0.5 m, 5 cm in sharp turns): ${res.poses}`);
console.log(`off the asphalt: ${res.offAsphalt}; touching a building: ${res.building}; touching a tree crown: ${res.tree}`);
console.log(`opposing-direction pairs checked: ${oppPairs}; overlapping on a street: ${opp}; in a junction (≤15 m) or while turning sharply: ${oppJ}`);
for (const w of res.worst) console.log('  ' + w);
console.log(`  overlapping on a street — places (20 m): ${oppSpots.size}`); for (const w of [...oppSpots.values()].slice(0, 20)) console.log('  opp ' + w);
process.exit(res.offAsphalt || res.building || res.tree || opp ? 1 : 0);
