// תושבים קבועים ומבקרים מבחוץ.
// כל תושב (כ-23,000, לפי התושבים של כל תחנת ביקוש) מקבל פעם אחת: בית (בניין מגורים בשכונה שלו), ואם הוא נוסע לעבודה
// או ללימודים באוטובוס — יעד קבוע ושעות יציאה וחזרה קבועות. כל יום הוא נוסע מאותו בית לאותו יעד, באותן שעות (± כמה דקות).
// הסיכוי להיות "נוסע לעבודה/לימודים" ובחירת היעד — בדיוק לפי הטבלאות של demand.js, כך שהביקוש הכולל נשאר כמו קודם.
// קניות ושאר הנסיעות — אקראיות כמו קודם (demand.js, sampleOther).
// מבחוץ: עובדים שגרים בעיר אחרת (קבועים, נכנסים בנקודת כניסה: מרכז ביג קסטינה, צומת תימורים, הכניסה המערבית) —
// ומבקרים ליום אחד (קניות, משפחה, השוק) — חדשים כל יום. יחד כ-12% מהנסיעות, נוספות על נסיעות התושבים.
// לפעמים (0.2% ליום) תושב עובר דירה או עבודה — ביומן "מה חדש בעיר".
// הכל דטרמיניסטי מתוך seed שנשמר בשמירה: אחרי טעינה מקבלים בדיוק אותם תושבים ואותם מעברים.
import { PROFILES, WALK } from './demand.js';

const ENTRIES = [['41605', 0.5], ['27812', 0.3], ['28616', 0.2]];        // נקודות כניסה לעיר (תחנות בגבול המפה)
const TOWNS = ['אשדוד', 'אשקלון', 'קריית גת', 'גדרה', 'יבנה', 'רחובות', 'באר שבע', 'שדרות', 'מושב בסביבה'];
const OUT_SHARE = 0.06, VIS_SHARE = 0.06, MOVE_P = 0.002;

function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// "בשכונת המייסדים" / "באזור תעשייה"
// "בשכונת X"; אזור תעשייה ומרכז העיר אינם שכונה: "באזור התעשייה", "במרכז העיר"
export const inZone = z => !z ? 'במקום אחר' : /^אזור תעשייה/.test(z.name) ? 'ב' + z.name.replace(/^אזור תעשייה/, 'אזור התעשייה') : /^מרכז /.test(z.name) ? 'ב' + z.name : z.kind === 'hood' ? `בשכונת ${z.name}` : `ב${z.name}`;
export const isIndustry = z => !!z && /^אזור תעשייה/.test(z.name);
const pickCdf = (C, r) => { const x = r * C[C.length - 1]; let lo = 0, hi = C.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (C[m] < x) lo = m + 1; else hi = m; } return lo; };
const cum = a => { const C = new Float64Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) C[i] = s += a[i]; return C; };
// דקה ביום לפי פרופיל שעתי (סכום 1), אחידה בתוך השעה
const minuteOf = (prof, r1, r2) => pickCdf(cum(prof), r1) * 60 + Math.floor(r2 * 60);

export class Residents {
  constructor(D, stops, seed) {
    this.D = D; this.stops = stops; this.seed = seed >>> 0;
    const N = D.N, r = rng(this.seed), pop = D.pop;
    // כמה תושבים בכל תחנה (מעוגל), ושורות היעד לכל מטרה (לפי demand.js)
    const homes = []; for (let o = 0; o < N; o++) { const n = Math.round(pop[o]); for (let i = 0; i < n; i++) homes.push(o); }
    const R = this.R = homes.length;
    this.home = new Int16Array(R); this.kind = new Uint8Array(R); this.dest = new Int16Array(R).fill(-1);
    this.out = new Int16Array(R); this.back = new Int16Array(R); this.bld = new Int32Array(R).fill(-1);
    this.rows = {};
    for (const p of ['work', 'school']) {
      const T = D.daily[p], rows = new Array(N), share = new Float64Array(N);
      for (let o = 0; o < N; o++) { if (!pop[o]) continue; const row = T.subarray(o * N, o * N + N), C = cum(row); rows[o] = C; share[o] = C[N - 1] / pop[o]; }
      this.rows[p] = { rows, share };
    }
    for (let i = 0; i < R; i++) { this.home[i] = homes[i]; this.assign(i, r, true); }
    // עובדים מבחוץ: קבועים — נקודת כניסה, עבודה בעיר (לפי מקומות העבודה), עיר מגורים
    const daily = D.dayTot || 1;
    const nOut = Math.round(daily * OUT_SHARE / 2);
    this.ent = ENTRIES.map(([id, w]) => [D.idx.get(id), w]).filter(([i]) => i != null);
    const entC = cum(this.ent.map(e => e[1])), workC = cum(D.attr.work);
    this.oEntry = new Int16Array(nOut); this.oDest = new Int16Array(nOut); this.oOut = new Int16Array(nOut); this.oBack = new Int16Array(nOut); this.oTown = new Uint8Array(nOut);
    for (let i = 0; i < nOut; i++) {
      this.oEntry[i] = this.ent[pickCdf(entC, r())][0];
      let d = pickCdf(workC, r()), n = 0; while (D.dist[this.oEntry[i] * N + d] <= WALK && n++ < 8) d = pickCdf(workC, r());
      this.oDest[i] = d; this.oTown[i] = Math.floor(r() * TOWNS.length);
      this.oOut[i] = minuteOf(PROFILES.work.out, r(), r()); let b = minuteOf(PROFILES.work.back, r(), r()), k = 0; while (b < this.oOut[i] + 240 && k++ < 8) b = minuteOf(PROFILES.work.back, r(), r()); this.oBack[i] = Math.max(b, this.oOut[i] + 240);
    }
    this.nVis = Math.round(daily * VIS_SHARE / 2);
    this.otherC = cum(D.attr.other);
    this.applied = 0;
  }
  // בית, סוג ויעד לתושב i (גם כשהוא עובר דירה או עבודה)
  assign(i, r, fresh, keepHome = true) {
    const o = this.home[i], u = r();
    const W = this.rows.work, S = this.rows.school;
    const sw = W.share[o] || 0, ss = S.share[o] || 0;
    const kind = u < sw ? 1 : u < sw + ss ? 2 : 0;
    this.kind[i] = kind; this.dest[i] = -1;
    if (kind) { const P = kind === 1 ? W : S, prof = PROFILES[kind === 1 ? 'work' : 'school']; this.dest[i] = pickCdf(P.rows[o], r());
      this.out[i] = minuteOf(prof.out, r(), r()); let b = minuteOf(prof.back, r(), r()), k = 0; while (b < this.out[i] + 150 && k++ < 8) b = minuteOf(prof.back, r(), r()); this.back[i] = Math.max(b, this.out[i] + 150); }
    // בניין המגורים: אחד מהבניינים של השכונה (המספור — לפי הסדר בכיסוי; רק לכרטיס)
    if (fresh || !keepHome) this.bld[i] = Math.floor(r() * 1e6);
  }
  // מעברי דירה ועבודה ביום day (דטרמיניסטי). מחזיר את ההודעות
  moves(day) {
    const r = rng(this.seed ^ (day * 2654435761)), n = Math.round(this.R * MOVE_P), out = [], Z = this.D.zones, zo = this.D.zoneOf;
    for (let j = 0; j < n; j++) {
      const i = Math.floor(r() * this.R);
      if (r() < 0.5) {    // דירה: תחנה אחרת לפי התושבים
        const C = this.popC || (this.popC = cum(this.D.pop)); this.home[i] = pickCdf(C, r()); this.assign(i, r, false, false);
        out.push(`נוסע עבר לגור ${inZone(Z[zo[this.home[i]]])}`);
      } else if (this.kind[i]) {
        const P = this.rows[this.kind[i] === 1 ? 'work' : 'school']; this.dest[i] = pickCdf(P.rows[this.home[i]], r());
        out.push(this.kind[i] === 1 ? `נוסע עבר לעבוד ${inZone(Z[zo[this.dest[i]]])}` : `תלמיד עבר ללמוד ${inZone(Z[zo[this.dest[i]]])}`);
      }
    }
    return out;
  }
  // מגיעים ליום day: כל המעברים מהימים שלפני (אחרי טעינה — אותו מצב בדיוק)
  catchUp(day) { const news = []; while (this.applied < day - 1) { this.applied++; news.push(...this.moves(this.applied)); } return news; }
  // הנסיעות של יום day, ממוינות לפי הזמן (שנ' מתחילת היום): [t, o, d, who] — who: מספר תושב (‎≥0), עובד מבחוץ (‎-1-i), מבקר (‎-1e6-i)
  schedule(day) {
    const r = rng(this.seed ^ (day * 40503)), T = [], jit = () => Math.round((r() - 0.5) * 8) * 60, N = this.D.N, dist = this.D.dist;
    for (let i = 0; i < this.R; i++) {
      if (!this.kind[i] || this.dest[i] < 0) continue;
      const o = this.home[i], d = this.dest[i]; if (dist[o * N + d] <= WALK) continue;
      T.push([this.out[i] * 60 + jit(), o, d, i], [this.back[i] * 60 + jit(), d, o, i]);
    }
    for (let i = 0; i < this.oEntry.length; i++) T.push([this.oOut[i] * 60 + jit(), this.oEntry[i], this.oDest[i], -1 - i], [this.oBack[i] * 60 + jit(), this.oDest[i], this.oEntry[i], -1 - i]);
    // מבקרים ליום אחד: מגיעים בבוקר או בצהריים, ונשארים 2–6 שעות
    const entC = cum(this.ent.map(e => e[1]));
    for (let i = 0; i < this.nVis; i++) {
      const e = this.ent[pickCdf(entC, r())][0]; let d = pickCdf(this.otherC, r()), n = 0; while (dist[e * N + d] <= WALK && n++ < 8) d = pickCdf(this.otherC, r());
      const a = Math.round((8.5 + r() * 5) * 3600), b = Math.min(23.2 * 3600, a + Math.round((2 + r() * 4) * 3600));
      T.push([a, e, d, -1e6 - i], [b, d, e, -1e6 - i]);
    }
    return T.sort((x, y) => x[0] - y[0]);
  }
  // הכרטיס של נוסע
  info(who) {
    const Z = this.D.zones, zo = this.D.zoneOf, hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (who == null) return null;
    if (who <= -1e6) return { lives: 'מבקר בעיר', goes: 'קניות, משפחה או השוק', out: null };
    if (who < 0) { const i = -1 - who; return { lives: `גר ב${TOWNS[this.oTown[i]]}`, goes: `עובד ${inZone(Z[zo[this.oDest[i]]])}`, out: hm(this.oOut[i]) }; }
    const k = this.kind[who];
    return { lives: isIndustry(Z[zo[this.home[who]]]) ? `גר ליד ${Z[zo[this.home[who]]].name.replace(/^אזור תעשייה/, 'אזור התעשייה')}` : `גר ${inZone(Z[zo[this.home[who]]])}`, goes: k === 1 ? `עובד ${inZone(Z[zo[this.dest[who]]])}` : k === 2 ? `לומד ${inZone(Z[zo[this.dest[who]]])}` : '', out: k ? hm(this.out[who]) : null };
  }
}
