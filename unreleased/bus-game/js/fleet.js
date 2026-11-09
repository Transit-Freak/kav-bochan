// הכסף והצי: סוגי רכבים, קופה, הכנסות והוצאות, סיכום יומי ושמירה. בלי ציור.
// כל קו מחזיק צי משלו מסוג אחד (def.vtype, def.fleet), קנוי או בליסינג (def.lease).
// sim.js קורא ל-earn() בכל עלייה, ל-spend() על נסיעה ונהגים, ל-subsidize() על כל ק"מ בשירות ול-accrue() בכל צעד (ליסינג).

import { MODES, normMode, modeOf } from './difficulty.js';
export const START_MONEY = 60_000;
export const FARE = 6;                 // ₪ לכל עלייה (נסיעה בודדת)
export const SUBSIDY_KM = 10;          // ₪ מהמדינה לכל ק"מ בשירות (כמו במכרזים). לא על החזרה הריקה למסוף
export const SELL_BACK = 0.6;          // מכירת רכב: 60% מהמחיר
export const PRICE_SCALE_V1 = 200_000 / 6_000;   // בשמירות ישנות (v1) המחירים היו פי 33 — הקופה מותאמת בטעינה
export const DEADHEAD_SPEED = 9;       // מ'/שנ' — נסיעה ריקה מהתחנה האחרונה חזרה לראשונה (לא מצוירת)
export const LAYOVER = 180;            // שנ' הפסקה במסוף לפני הנסיעה הבאה
const DAY = 86400;
export const dayOf = t => Math.floor(t / DAY) + 1;

// סוגי הרכבים: מקומות, מחיר קנייה, ליסינג ליום, עלות לק"מ (דלק/חשמל ותחזוקה), עלות לשעה (נהג)
export const TYPES = {
  mini:  { name: 'מיניבוס', cap: 20, price: 3_000, lease: 300, km: 2.0, hour: 90, tint: 0xf6c453 },
  std:   { name: 'אוטובוס רגיל', cap: 80, price: 6_000, lease: 600, km: 3.5, hour: 100, tint: null },
  artic: { name: 'מפרקי', cap: 120, price: 10_000, lease: 1_000, km: 5.0, hour: 110, tint: 0xf08a8a },
  elec:  { name: 'חשמלי', cap: 80, price: 7_500, lease: 750, km: 0.8, hour: 100, tint: 0x7fd99a },
};
export const TYPE_ORDER = ['mini', 'std', 'artic', 'elec'];
// מחירי הרכבים לפי רמת הקושי (קל ×0.7, קשה ×1.2): משנים את TYPES במקום, מהמחירים הבסיסיים
const BASE = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, { price: v.price, lease: v.lease }]));
export function applyPrices(mode) {
  const k = MODES[normMode(mode)].price;
  for (const t of Object.keys(TYPES)) { TYPES[t].price = Math.round(BASE[t].price * k / 100) * 100; TYPES[t].lease = Math.round(BASE[t].lease * k / 10) * 10; }
}
// סבסוד לק"מ בפועל: לפי רמת הקושי ולפי הקיצוץ על מועדים שעברו
export const subsidyKm = bank => SUBSIDY_KM * modeOf(bank).subsidy * (bank?.career?.subsidyK ?? 1);
export const typeOf = def => TYPES[def?.vtype] ? def.vtype : 'std';

// זמן סיבוב משוער: נסיעה לפי פרופיל המהירות, עצירות, חזרה ריקה והפסקה במסוף
export function lineCycle(L) {
  if (L._cycle) return L._cycle;
  const P = L.profile; let run = 0;
  for (let i = 0; i + 1 < P.v.length; i++) run += P.STEP / Math.max(1.5, (P.v[i] + P.v[i + 1]) / 2);
  run += L.stops.length * 20;
  const dead = L.poly.length / DEADHEAD_SPEED;
  return (L._cycle = { run, dead, total: run + dead + LAYOVER });
}
export const vehiclesNeeded = (L, headway = L.def.headway) => Math.max(1, Math.ceil(lineCycle(L).total / (headway * 60)));

// כמה עולה לעבור מצי אחד לאחר. from/to: { type, n, lease }.
// קנוי: קונים את מה שחסר, מוכרים ב-60% את מה שמיותר. ליסינג: בלי תשלום מראש, מחזירים בלי החזר.
// החלפת סוג, או מעבר בין קנייה לליסינג = כל הישנים נמכרים/מוחזרים. leaseDay: דמי הליסינג ליום אחרי השינוי
export function fleetChange(from, to) {
  const P = t => TYPES[t].price, f = from || { type: to.type, n: 0, lease: to.lease };
  const leaseDay = to.lease ? to.n * TYPES[to.type].lease : 0;
  if (f.type === to.type && !!f.lease === !!to.lease) {
    const d = to.n - f.n;
    if (to.lease) return { buy: 0, sell: 0, leaseDay, added: Math.max(0, d) };
    return d >= 0 ? { buy: d * P(to.type), sell: 0, leaseDay, added: d } : { buy: 0, sell: Math.round(-d * P(to.type) * SELL_BACK), leaseDay, added: 0 };
  }
  return { buy: to.lease ? 0 : to.n * P(to.type), sell: f.lease ? 0 : Math.round(f.n * P(f.type) * SELL_BACK), leaseDay, added: to.n };
}
export const isLease = def => !!def?.lease;
// כמה מקבלים על הרכבים של קו (מחיקה): קנויים — 60%, ליסינג — כלום
export const fleetValue = def => isLease(def) || !def?.fleet ? 0 : Math.round(def.fleet * TYPES[typeOf(def)].price * SELL_BACK);

const KEY = 'busgame.kiryat-malachi.money.v1';
export const emptyDay = day => ({ day, fares: 0, pax: 0, subsidy: 0, buy: 0, sell: 0, km: 0, drivers: 0, lease: 0, insp: 0, penalty: 0, fineIn: 0, bonus: 0, evaded: 0, caught: 0, byLine: {} });

export class Bank {
  constructor(save, time) {
    this.money = typeof save?.money === 'number' ? save.money : START_MONEY;
    // שמירה מלפני הסבסוד והמחירים החדשים: הקופה בקנה המידה החדש
    this.migrated = save && save.v !== 2 && typeof save.money === 'number';
    if (this.migrated) this.money = Math.round(save.money / PRICE_SCALE_V1);
    this.today = !this.migrated && save?.today?.day === dayOf(time) ? { ...emptyDay(save.today.day), ...save.today } : emptyDay(dayOf(time));
    this.history = !this.migrated && Array.isArray(save?.history) ? save.history.slice(-14).map(d => ({ ...emptyDay(d.day), ...d })) : [];
    this.onDay = null;            // נקרא עם סיכום היום שהסתיים
    // מצב המשחק: 'career' (ברירת המחדל, גם לשמירות ישנות) או 'creative'; והמצב של השלבים (career.js)
    this.mode = normMode(save?.mode);            // שמירה ישנה: career/בלי → medium
    applyPrices(this.mode);
    this.career = save?.career && typeof save.career === 'object' ? save.career : null;
    this.legacy = !!save && !save.mode;
    // תפעול (ops.js): פקחים שנשכרו, דוחות ביקורת, והגדרות (במצב יצירתי אפשר לכבות אירועים ודוחות)
    this.inspectors = save?.inspectors | 0;
    this.reports = Array.isArray(save?.reports) ? save.reports.slice(0, 30) : [];
    this.settings = { incidents: true, audits: true, ...(save?.settings || {}) };          // שמירה מלפני השלבים — השלבים שכבר מתקיימים מושלמים בשקט
  }
  static load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch { return null; }
  }
  static clear() { try { localStorage.removeItem(KEY); } catch { } }
  save(time) {
    try { localStorage.setItem(KEY, JSON.stringify(this.snapshot(time))); } catch { }
  }
  snapshot(time) {
    return { v: 2, time, money: Math.round(this.money * 100) / 100, today: this.today, history: this.history, mode: this.mode, career: this.career, inspectors: this.inspectors, reports: this.reports, settings: this.settings };
  }
  line(id) { return this.today.byLine[id] || (this.today.byLine[id] = { fares: 0, pax: 0, cost: 0, subsidy: 0 }); }
  earn(amount, lineId) {
    this.money += amount; this.today.fares += amount; this.today.pax++;
    const l = this.line(lineId); l.fares += amount; l.pax++;
  }
  // סבסוד ממשלתי: ק"מ בשירות (עם נוסעים או בלי)
  subsidize(km, lineId) {
    const a = km * subsidyKm(this);              // רמת הקושי, ומועד שעבר בשלב — הסבסוד מצטמצם
    this.money += a; this.today.subsidy += a;
    const l = this.line(lineId); l.subsidy = (l.subsidy || 0) + a;
  }
  // דמי ליסינג, ברציפות לפי זמן המשחק (גם בלילה וגם כשהקו לא פועל)
  accrue(lines, sec) {
    for (const L of lines) {
      const d = L.def;
      if (L.retired || !d.lease || !d.fleet) continue;
      this.spend('lease', d.fleet * TYPES[typeOf(d)].lease * sec / DAY, L.id);
    }
  }
  // cat: km | drivers | lease | buy
  spend(cat, amount, lineId) {
    this.money -= amount; this.today[cat] += amount;
    if (lineId && cat !== 'buy') this.line(lineId).cost += amount;
  }
  refund(amount) { this.money += amount; this.today.sell += amount; }
  get costToday() { const d = this.today; return d.km + d.drivers + d.lease; }
  // תוצאת יום: הכנסות פחות הוצאות, כולל קנייה ומכירה של רכבים
  static net(d) { return d.fares + (d.subsidy || 0) + (d.fineIn || 0) + (d.bonus || 0) + d.sell - d.buy - d.km - d.drivers - (d.lease || 0) - (d.insp || 0) - (d.penalty || 0); }
  reset(time, mode = this.mode, career = null) { mode = normMode(mode); applyPrices(mode); this.money = MODES[mode].money; this.history = []; this.today = emptyDay(dayOf(time)); this.mode = mode; this.career = career; this.legacy = false; this.inspectors = 0; this.reports = []; }
  // מעבר יום: שומרים את הסיכום ומתחילים יום חדש
  roll(time) {
    const d = dayOf(time);
    if (d === this.today.day) return;
    const done = this.today;
    this.history.push(done); if (this.history.length > 14) this.history.shift();
    this.today = emptyDay(d);
    this.onDay?.(done);
  }
}

// ₪1,234,567 (מינוס בסימן מינוס אמיתי)
export const money = n => (n < -0.5 ? '−' : '') + '₪' + Math.round(Math.abs(n)).toLocaleString('en-US');
