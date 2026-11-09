// מצבי משחק ושלבים: "יצירתי" (כסף בלי הגבלה, בלי כישלון, כל הרכבים) ו"קריירה" (הכלכלה הרגילה + שלבים של משרד התחבורה).
// הכיסוי: אחוז התושבים ומקומות העבודה שיש להם תחנה משורתת עד 500 מ' הליכה (≈ 417 מ' בקו אווירי, כמו demand.js: ×1.2).
// התושבים — לפי הבניינים: התושבים של כל תחנת ביקוש (demand.json) מתחלקים בין הבניינים שבשכונה שלה והכי קרובים אליה,
// לפי שטח × קומות. מקומות העבודה — לפי תחנות הביקוש עצמן. רחובות צרים לא חייבים קו: נדרשים רק תושבים ומקומות עבודה
// שיש לידם (עד 500 מ') תחנה על רחוב רחב (6 מ' ומעלה); מה שרחוק מכל רחוב כזה — לא נספר (אבל מותר לשרת אותו).
// אין כאן ציור חוץ מהשכבה "כיסוי" במפה (CoverageLayer).
import * as THREE from 'three';
import { TYPE_ORDER, money, dayOf, lineCycle } from './fleet.js';
import { hoursOf } from './demand.js';

export const COVER_M = 500;                   // הליכה, מטרים
const COVER_R = COVER_M / 1.2;                // בקו אווירי
const WIDE = 6;                               // רחוב רחב (מטרים): תחנה עליו "נדרשת"
export const STOP_FEE = 500;                  // קריירה: הפעלה ראשונה של תחנה קיימת
const START_TYPES = ['mini', 'std'];

function inRing(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inZone = (z, x, y) => (z.poly || []).some(part => inRing(x, y, part[0]) && !part.slice(1).some(h => inRing(x, y, h)));

// ---------- כיסוי
export class Coverage {
  constructor(demand, city) {
    const stops = city.stops, N = stops.length, Z = demand.zones;
    this.stops = stops; this.zones = Z;
    this.hood = Z.map(z => z.kind === 'hood');
    const wide = stops.map(s => (s.hw ?? 4.5) * 2 >= WIDE);
    const near = (x, y) => { const a = []; for (let i = 0; i < N; i++) if (Math.hypot(stops[i].x - x, stops[i].y - y) <= COVER_R) a.push(i); return a; };
    // הבניינים: שכונה, משקל, והתחנות שבהישג יד
    const B = city.buildings.map(b => {
      let x = 0, y = 0, A = 0; const p = b.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const c = p[j][0] * p[i][1] - p[i][0] * p[j][1]; A += c; x += (p[j][0] + p[i][0]) * c; y += (p[j][1] + p[i][1]) * c; }
      if (Math.abs(A) < 1e-6) { x = p[0][0]; y = p[0][1]; A = 1; } else { x /= 3 * A; y /= 3 * A; }
      const z = Z.findIndex(zz => inZone(zz, x, y));
      return { x, y, w: Math.abs(A / 2) * Math.max(1, b.h / 3), z, pop: 0 };
    }).filter(b => b.z >= 0);
    // התושבים של כל תחנת ביקוש — לבניינים של השכונה שלה שהיא הכי קרובה אליהם
    const byZone = Z.map(() => []);
    B.forEach(b => byZone[b.z].push(b));
    const share = new Map();
    for (const b of B) {
      let best = -1, bd = Infinity;
      for (const i of Z[b.z].stops) { const d = Math.hypot(stops[i].x - b.x, stops[i].y - b.y); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) { b.src = best; share.set(best, (share.get(best) || 0) + b.w); }
    }
    const pts = [];
    stops.forEach((s, i) => {
      const p = demand.pop[i]; if (!p) return;
      const W = share.get(i);
      if (!W) { pts.push({ x: s.x, y: s.y, pop: p, z: demand.zoneOf[i] }); return; }     // אין בניינים — בתחנה עצמה
      for (const b of B) if (b.src === i) pts.push({ x: b.x, y: b.y, pop: p * b.w / W, z: b.z });
    });
    for (const q of pts) { q.near = near(q.x, q.y); q.req = this.hood[q.z] && q.near.some(i => wide[i]); }
    this.res = pts;
    this.jobs = stops.map((s, i) => ({ x: s.x, y: s.y, w: demand.attr.work[i], z: demand.zoneOf[i], near: near(s.x, s.y) }))
      .filter(j => j.w > 0).map(j => ({ ...j, req: this.hood[j.z] && j.near.some(i => wide[i]) }));
  }
  // served: Set של אינדקסים של תחנות (city.stops) שקו פעיל עוצר בהן
  compute(served) {
    const Z = this.zones.length, zp = new Float64Array(Z), zc = new Float64Array(Z);
    let rq = 0, rc = 0, jq = 0, jc = 0;
    for (const q of this.res) {
      const c = q.near.some(i => served.has(i)); q.cov = c;
      if (!q.req) continue;
      rq += q.pop; zp[q.z] += q.pop; if (c) { rc += q.pop; zc[q.z] += q.pop; }
    }
    for (const j of this.jobs) { if (!j.req) continue; jq += j.w; if (j.near.some(i => served.has(i))) jc += j.w; }
    return { res: rq ? rc / rq : 0, jobs: jq ? jc / jq : 0, residents: rq, zones: this.zones.map((z, k) => ({ k, name: z.name, hood: this.hood[k], pop: zp[k], cov: zp[k] ? zc[k] / zp[k] : 0 })) };
  }
}

// ---------- השלבים
// כל שלב: כותרת, תיאור, ימים (עד המועד), פרס (כסף + סוגי רכבים שנפתחים), ובדיקה שמחזירה רשימת סעיפים
const pct = v => Math.round(v * 100) + '%';
const zoneItem = (name, target) => c => { const z = c.cov.zones.find(x => x.name === name); const v = z ? z.cov : 0; return { label: `שכונת ${name}: ${pct(target)} מהתושבים`, v, target, txt: pct(v) }; };
export const STAGES = [
  { title: 'השכונות הראשונות', days: 3, reward: 25000, unlock: [],
    desc: 'משרד התחבורה מבקש קו שמשרת את מרכז העיר ואת השכונות שלידו. מספיק קו אחד שעובר בשלוש השכונות.',
    items: [zoneItem('מרכז העיר', 0.6), zoneItem('חב"ד', 0.6), zoneItem('המ"ג', 0.6)] },
  { title: 'חצי העיר', days: 5, reward: 40000, unlock: ['elec'],
    desc: 'עכשיו חצי מתושבי העיר צריכים תחנה עם קו עד 500 מ\' הליכה מהבית. רחובות צרים לא חייבים קו.',
    items: [c => ({ label: 'תושבים עם תחנה קרובה', v: c.cov.res, target: 0.5, txt: pct(c.cov.res) })] },
  { title: 'שירות לכל היום', days: 7, reward: 60000, unlock: ['artic'],
    desc: 'רוב העיר, וגם אזורי העבודה. כל הקווים צריכים לפעול לפחות מ-06:00 עד 22:00.',
    items: [c => ({ label: 'תושבים עם תחנה קרובה', v: c.cov.res, target: 0.7, txt: pct(c.cov.res) }),
      c => ({ label: 'מקומות עבודה עם תחנה קרובה', v: c.cov.jobs, target: 0.6, txt: pct(c.cov.jobs) }),
      c => { const n = c.active.length, ok = c.active.filter(L => { const [a, b] = hoursOf(L.def); return a <= 360 && b >= 1320; }).length;
        return { label: 'קווים שפועלים 06:00–22:00', v: n ? ok / n : 0, target: 1, txt: `${ok} מתוך ${n}` }; }] },
  { title: 'שירות מלא', days: 10, reward: 100000, unlock: [], hard: true,
    desc: 'השלב הקשה: כמעט כל העיר, אוטובוס לפחות כל 20 דקות בשעות השיא בכל הקווים, ובלי הפסד שלושה ימים ברציפות.',
    items: [c => ({ label: 'תושבים עם תחנה קרובה', v: c.cov.res, target: 0.85, txt: pct(c.cov.res) }),
      c => { const n = c.active.length, ok = c.active.filter(L => L.def.headway <= 20 && (L.def.fleet || 0) * 1200 >= lineCycle(L).total).length;
        return { label: 'קווים עם אוטובוס כל 20 דק\' לפחות בשיא', v: n ? ok / n : 0, target: 1, txt: `${ok} מתוך ${n}` }; },
      c => { const h = c.days3; return { label: 'רווח בשלושת הימים האחרונים (כל יום)', v: h.n / 3 * (h.ok ? 1 : 0), target: 1,
        txt: h.n < 3 ? `${h.n} מתוך 3 ימים` : h.ok ? 'בלי הפסד' : 'היה הפסד' }; }] },
];

export const newCareer = () => ({ stage: 0, deadline: null, misses: 0, subsidyK: 1, paidStops: [], done: [], unlocked: [...START_TYPES] });

// ---------- מצב הקריירה: בודקים את השלב הנוכחי, פרסים, מועדים
export class Career {
  constructor(game) { this.g = game; }                 // { bank, sim, lines(), coverage, served(), onDone, onMiss, toast }
  get st() { return this.g.bank.career; }
  get mode() { return this.g.bank.mode; }
  get creative() { return this.mode === 'creative'; }
  unlocked(type) { return this.creative || !this.st || (this.st.unlocked || START_TYPES).includes(type); }
  // ההקשר לבדיקה: כיסוי, הקווים הפעילים, והימים האחרונים בקופה
  context() {
    const served = this.g.served(), active = this.g.lines().filter(L => !L.retired && L.def.fleet > 0);
    const st = this.st, from = st?.since ?? 0, h = this.g.bank.history.filter(d => d.day >= from).slice(-3);
    const net = d => (d.fares + (d.subsidy || 0)) - (d.km + d.drivers + (d.lease || 0));
    return { cov: this.g.coverage.compute(served), active, days3: { n: h.length, ok: h.length >= 3 && h.every(d => net(d) >= 0) } };
  }
  status() {
    if (this.creative || !this.st) return null;
    const s = this.st, S = STAGES[s.stage]; if (!S) return { finished: true, ctx: this.context() };
    const ctx = this.context(), items = S.items.map(f => { const r = f(ctx); r.done = r.v >= r.target - 1e-9; return r; });
    return { stage: s.stage, S, items, ctx, done: items.every(i => i.done) };
  }
  // נקרא מדי פעם: שלב שהושלם — פרס ושלב הבא. silent — טעינה של שמירה ישנה (בלי כסף ובלי חלון)
  tick(silent = false) {
    if (this.creative || !this.st) return;
    const s = this.st, day = dayOf(this.g.sim.time);
    if (s.deadline == null && STAGES[s.stage]) { s.deadline = day + STAGES[s.stage].days - 1; s.since = day; }
    for (let guard = 0; guard < STAGES.length; guard++) {
      const r = this.status(); if (!r || r.finished || !r.done) break;
      const S = r.S;
      for (const t of S.unlock) if (!s.unlocked.includes(t)) s.unlocked.push(t);
      s.done.push({ stage: s.stage, day, silent });
      if (!silent) { this.g.bank.money += S.reward; this.g.bank.today.bonus = (this.g.bank.today.bonus || 0) + S.reward; }
      s.stage++; s.since = day;
      s.deadline = STAGES[s.stage] ? day + STAGES[s.stage].days - 1 : null;
      if (!silent) this.g.onDone(S, s.stage);
    }
  }
  // חצות: מועד שעבר — הסבסוד יורד (עד חצי) ויש עוד זמן; יום לפני המועד — אזהרה. אף פעם לא "הפסדתם"
  newDay(day) {
    if (this.creative || !this.st) return;
    const s = this.st, S = STAGES[s.stage]; if (!S || s.deadline == null) return;
    if (day > s.deadline) {
      s.misses++; s.subsidyK = Math.max(0.5, +(s.subsidyK - 0.2).toFixed(2));
      s.deadline = day + Math.ceil(S.days / 2);
      this.g.onMiss(S, s);
    } else if (day === s.deadline) this.g.toast(`נשאר יום אחד לשלב "${S.title}". אחרי זה משרד התחבורה יקצץ בסבסוד.`);
  }
  // תחנות חדשות (קריירה): כמה תחנות בקו הזה עוד לא שירתו אף פעם, וכמה זה עולה
  stopFee(stopIds) {
    if (this.creative || !this.st) return { n: 0, fee: 0, ids: [] };
    const paid = new Set(this.st.paidStops), ids = [...new Set(stopIds)].filter(id => !paid.has(id));
    return { n: ids.length, fee: ids.length * STOP_FEE, ids };
  }
  payStops(ids) { if (!this.st) return; for (const id of ids) if (!this.st.paidStops.includes(id)) this.st.paidStops.push(id); }
}

// ---------- השכבה "כיסוי" במפה: מה שבטווח 500 מ' מתחנה משורתת (כחול שקוף), ותושבים בלי כיסוי (נקודות אדומות)
export class CoverageLayer {
  constructor(scene, half) {
    const [hx, hy] = half, M = 4;                          // 4 מ' לפיקסל
    this.hx = hx; this.hy = hy; this.M = M;
    const c = this.canvas = document.createElement('canvas'); c.width = Math.round(hx * 2 / M); c.height = Math.round(hy * 2 / M);
    this.disc = document.createElement('canvas'); this.disc.width = c.width; this.disc.height = c.height;
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hy * 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false }));
    this.mesh.position.y = 0.4; this.mesh.renderOrder = 8; this.mesh.visible = false; this.mesh.name = 'coverage';
    scene.add(this.mesh); this.key = '';
  }
  draw(cov, servedStops, key) {
    if (key === this.key) return; this.key = key;
    const c = this.canvas, g = c.getContext('2d'), d = this.disc.getContext('2d'), M = this.M;
    const px = (x, y) => [(x + this.hx) / M, (this.hy - y) / M];
    g.clearRect(0, 0, c.width, c.height); d.clearRect(0, 0, c.width, c.height);
    // עיגולים אטומים על קנבס נפרד, ואז בשקיפות אחת — בלי שהחפיפות ייראו כהות יותר
    d.fillStyle = '#2a78d6';
    for (const s of servedStops) { const [x, y] = px(s.x, s.y); d.beginPath(); d.arc(x, y, COVER_R / M, 0, 7); d.fill(); }
    g.globalAlpha = 0.2; g.drawImage(this.disc, 0, 0); g.globalAlpha = 1;
    d.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(42,120,214,.55)'; g.lineWidth = 1.5;
    for (const s of servedStops) { const [x, y] = px(s.x, s.y); g.beginPath(); g.arc(x, y, COVER_R / M, 0, 7); g.stroke(); }
    // תושבים בלי כיסוי (רק מי שנדרש): נקודה לכל בניין, השטח לפי מספר התושבים
    g.fillStyle = 'rgba(208,59,59,.85)';
    for (const q of cov.res) if (q.req && !q.cov && q.pop > 0.5) { const [x, y] = px(q.x, q.y); g.beginPath(); g.arc(x, y, Math.min(3.2, 0.9 + Math.sqrt(q.pop) * 0.3), 0, 7); g.fill(); }
    this.tex.needsUpdate = true;
  }
  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
}
export { TYPE_ORDER, money };
