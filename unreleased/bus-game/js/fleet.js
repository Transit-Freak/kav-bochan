// הכסף והצי: סוגי רכבים, קופה, הכנסות והוצאות, סיכום יומי ושמירה. בלי ציור.
// כל קו מחזיק צי משלו מסוג אחד (def.vtype, def.fleet). sim.js קורא ל-earn() בכל עלייה ול-spend() על נסיעה ונהגים.

export const START_MONEY = 2_000_000;
export const FARE = 6;                 // ₪ לכל עלייה (נסיעה בודדת)
export const SELL_BACK = 0.6;          // מכירת רכב: 60% מהמחיר
export const DEADHEAD_SPEED = 9;       // מ'/שנ' — נסיעה ריקה מהתחנה האחרונה חזרה לראשונה (לא מצוירת)
export const LAYOVER = 180;            // שנ' הפסקה במסוף לפני הנסיעה הבאה
const DAY = 86400;
export const dayOf = t => Math.floor(t / DAY) + 1;

// סוגי הרכבים: מקומות, מחיר קנייה, עלות לק"מ (דלק/חשמל ותחזוקה), עלות לשעה (נהג)
export const TYPES = {
  mini:  { name: 'מיניבוס', cap: 20, price: 100_000, km: 2.0, hour: 90, tint: 0xf6c453 },
  std:   { name: 'אוטובוס רגיל', cap: 80, price: 200_000, km: 3.5, hour: 100, tint: null },
  artic: { name: 'מפרקי', cap: 120, price: 340_000, km: 5.0, hour: 110, tint: 0xf08a8a },
  elec:  { name: 'חשמלי', cap: 80, price: 240_000, km: 0.8, hour: 100, tint: 0x7fd99a },
};
export const TYPE_ORDER = ['mini', 'std', 'artic', 'elec'];
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

// כמה עולה לעבור מצי אחד לאחר: קונים את מה שחסר, מוכרים ב-60% את מה שמיותר (החלפת סוג = מכירת כל הישנים)
export function fleetChange(fromType, fromN, toType, toN) {
  if (fromType === toType) {
    const d = toN - fromN;
    return d >= 0 ? { buy: d * TYPES[toType].price, sell: 0 } : { buy: 0, sell: Math.round(-d * TYPES[toType].price * SELL_BACK) };
  }
  return { buy: toN * TYPES[toType].price, sell: Math.round(fromN * TYPES[fromType].price * SELL_BACK) };
}

const KEY = 'busgame.kiryat-malachi.money.v1';
const emptyDay = day => ({ day, fares: 0, pax: 0, buy: 0, sell: 0, km: 0, drivers: 0, byLine: {} });

export class Bank {
  constructor(save, time) {
    this.money = typeof save?.money === 'number' ? save.money : START_MONEY;
    this.today = save?.today?.day === dayOf(time) ? { ...emptyDay(save.today.day), ...save.today } : emptyDay(dayOf(time));
    this.history = Array.isArray(save?.history) ? save.history.slice(-14) : [];
    this.onDay = null;            // נקרא עם סיכום היום שהסתיים
  }
  static load() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch { return null; }
  }
  static clear() { try { localStorage.removeItem(KEY); } catch { } }
  save(time) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, time, money: Math.round(this.money * 100) / 100, today: this.today, history: this.history })); } catch { }
  }
  line(id) { return this.today.byLine[id] || (this.today.byLine[id] = { fares: 0, pax: 0, cost: 0 }); }
  earn(amount, lineId) {
    this.money += amount; this.today.fares += amount; this.today.pax++;
    const l = this.line(lineId); l.fares += amount; l.pax++;
  }
  // cat: km | drivers | buy
  spend(cat, amount, lineId) {
    this.money -= amount; this.today[cat] += amount;
    if (lineId && cat !== 'buy') this.line(lineId).cost += amount;
  }
  refund(amount) { this.money += amount; this.today.sell += amount; }
  get costToday() { const d = this.today; return d.km + d.drivers; }
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
