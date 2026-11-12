// כתובת לכל נוסע: בניין קבוע ליד תחנת הבית שלו (אותו נוסע — תמיד אותו בניין, גם אחרי שמירה וטעינה: הבחירה לפי מספר התושב),
// ושם הרחוב הקרוב לבניין מנתוני המפה (OpenStreetMap, דרך tools/build_city.py). בלי מספרי בתים. וגם: המרכז המסחרי שליד תחנה.
const NEAR = 400, STREET = 90;
const mix = n => { let x = (n | 0) + 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0; };
const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
export class Homes {
  constructor(city, stops) {
    this.stops = stops; this.places = city.places || [];
    this.B = city.buildings.map((b, i) => { let x = 0, y = 0, r = 0; for (const p of b.pts) { x += p[0]; y += p[1]; } x /= b.pts.length; y /= b.pts.length; for (const p of b.pts) r = Math.max(r, Math.hypot(p[0] - x, p[1] - y)); return { i, x, y, r, h: b.h, res: b.res }; });
    this.named = city.roads.filter(r => r.name && r.cls !== 'f');
    this.cand = new Map(); this.street = new Map();
  }
  // הבניינים שאפשר לגור בהם ליד תחנה: מגורים (לא אזור תעשייה, לא מרכז מסחרי), עד 400 מ', 30 הקרובים. אם אין — הקרובים ביותר שהם מגורים בכל מרחק
  candidates(si) {
    let c = this.cand.get(si); if (c) return c;
    const s = this.stops[si], all = this.B.filter(b => b.res !== 0).map(b => [Math.hypot(b.x - s.x, b.y - s.y), b]).sort((a, b) => a[0] - b[0]);
    c = all.filter(a => a[0] <= NEAR).slice(0, 30).map(a => a[1]); if (!c.length) c = all.slice(0, 8).map(a => a[1]);
    this.cand.set(si, c); return c;
  }
  streetOf(b) {
    if (this.street.has(b.i)) return this.street.get(b.i);
    let best = '', bd = STREET;
    for (const r of this.named) for (let k = 1; k < r.pts.length; k++) { const d = segDist(b.x, b.y, r.pts[k - 1][0], r.pts[k - 1][1], r.pts[k][0], r.pts[k][1]); if (d < bd) { bd = d; best = r.name; } }
    this.street.set(b.i, best); return best;
  }
  // הבית של תושב who שתחנת הבית שלו si: { x, y, r, h, street } או null
  homeOf(who, si) {
    const c = this.candidates(si); if (!c.length) return null;
    const b = c[mix(who) % c.length]; return { x: b.x, y: b.y, r: b.r, h: b.h, street: this.streetOf(b) };
  }
  // המרכז המסחרי שליד תחנה (עד 250 מ' מהקצה שלו) — עדיף עם שם
  mallNear(si) {
    const s = this.stops[si]; let best = null, bd = Infinity;
    for (const p of this.places) { if (p.kind !== 'mall') continue; const d = Math.hypot(p.x - s.x, p.y - s.y) - p.r; if (d > 250) continue; const k = d + (p.name ? 0 : 400); if (k < bd) { bd = k; best = p; } }
    return best;
  }
}
export const inStreet = n => /^(שדרות|שד\'|דרך|רחוב|סמטת|כיכר|מעלה|נתיב) /.test(n) ? 'ב' + n : 'ברחוב ' + n;
