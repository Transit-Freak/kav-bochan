// הצי והכסף: סוגי רכבים, קנייה ומכירה, שיוך לקווים, הכנסות והוצאות, וסיכום יומי. בלי ציור.
// הסימולציה (sim.js) קוראת לכאן: take() כשיוצא אוטובוס, release() כשהוא מסיים, earn()/spend() תוך כדי נסיעה.

export const START_MONEY = 2_000_000;
export const FARE = 6;                 // ₪ לכל עלייה
export const DRIVER_HOUR = 100;        // ₪ לשעת נהג (כל זמן שהרכב בשירות, גם בדרך חזרה למוסך)
export const DEADHEAD_SPEED = 9;       // מ'/שנ' — נסיעה ריקה חזרה למוסך (מהתחנה האחרונה לראשונה)
export const LAYOVER = 120;            // שנ' במוסך בין נסיעות (ניקיון, החלפת נהג)
export const SELL_BACK = 0.6;          // מכירה: 60% מהמחיר

// סוגי הרכבים. len — אורך באמת (לרווח בין אוטובוסים ולציור), narrow — נכנס לרחובות צרים
export const TYPES = {
  mini: { name: 'מיניבוס', cap: 20, price: 180_000, km: 2.2, maint: 120, len: 7.5, narrow: true, access: true,
    note: 'קטן וזול. נכנס לכל רחוב' },
  city: { name: 'אוטובוס עירוני', cap: 80, price: 350_000, km: 3.5, maint: 250, len: 12, narrow: true, access: true,
    note: 'הרכב הרגיל של קווים בעיר' },
  artic: { name: 'מפרקי', cap: 140, price: 620_000, km: 5, maint: 480, len: 18, narrow: false, access: true,
    note: 'הכי הרבה מקום. לא נכנס לרחובות צרים' },
  electric: { name: 'חשמלי', cap: 80, price: 560_000, km: 0.9, maint: 180, len: 12, narrow: true, access: true,
    note: 'יקר לקנות, זול מאוד לנסוע' },
  coach: { name: 'בין־עירוני', cap: 50, price: 450_000, km: 3.8, maint: 300, len: 12.6, narrow: true, access: false,
    note: 'מושבים בלבד, בלי רצפה נמוכה' },
};
export const TYPE_ORDER = ['mini', 'city', 'artic', 'electric', 'coach'];
// מפרקי לא נכנס לקו שיש בו יותר מזה מטרים ברחובות צרים (קצת סובלנות לצמתים ולכניסות)
export const NARROW_LIMIT = 25;

const KEY = 'busgame.kiryat-malachi.save.v2';
const DAY = 86400;
export const dayOf = t => Math.floor(t / DAY) + 1;

export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && s.v === 2 ? s : null; } catch { return null; }
}

// כמה רכבים צריך לקו בתדירות שלו: זמן הנסיעה + חזרה ריקה + המתנה במוסך, חלקי התדירות
export function lineCycle(L) {
  if (L._cycle) return L._cycle;
  const P = L.profile; let run = 0;
  for (let i = 0; i + 1 < P.v.length; i++) run += P.STEP / Math.max(1.5, (P.v[i] + P.v[i + 1]) / 2);
  run += L.stops.length * 22;                       // דלתות, עולים ויורדים
  const dead = L.poly.length / DEADHEAD_SPEED;
  return (L._cycle = { run, dead, total: run + dead + LAYOVER });
}
export const vehiclesNeeded = L => Math.max(1, Math.ceil(lineCycle(L).total / (L.def.headway * 60)));
export const canUse = (type, L) => TYPES[type].narrow || !L || (L.narrowM || 0) <= NARROW_LIMIT;

const emptyDay = day => ({ day, fares: 0, pax: 0, drivers: 0, energy: 0, maint: 0, buy: 0, sell: 0, byLine: {} });

export class Fleet {
  constructor(save, time) {
    this.money = save?.money ?? START_MONEY;
    this.nextNum = save?.nextNum ?? 1001;
    // אחרי טעינה כל הרכבים במוסך: האוטובוסים שהיו בדרך לא נשמרים
    this.vehicles = (save?.vehicles || []).filter(v => TYPES[v.type])
      .map(v => ({ id: v.id, num: v.num, type: v.type, bought: v.bought ?? time, lineId: v.lineId ?? null, status: 'depot', availableAt: 0, km: v.km || 0 }));
    this.today = save?.today && save.today.day === dayOf(time) ? { ...emptyDay(save.today.day), ...save.today } : emptyDay(dayOf(time));
    this.history = save?.history || [];
    this.dirty = false;
  }
  toJSON(time) {
    return { v: 2, time, money: Math.round(this.money), nextNum: this.nextNum, today: this.today, history: this.history.slice(-14),
      vehicles: this.vehicles.map(({ id, num, type, bought, lineId, km }) => ({ id, num, type, bought, lineId, km: Math.round(km) })) };
  }
  save(time) {
    try { localStorage.setItem(KEY, JSON.stringify(this.toJSON(time))); this.dirty = false; } catch { }
  }

  // ---------- כסף
  line(lineId) { return this.today.byLine[lineId] || (this.today.byLine[lineId] = { fares: 0, pax: 0, cost: 0 }); }
  earn(amount, lineId) {
    this.money += amount; this.today.fares += amount; this.today.pax++;
    if (lineId) { const l = this.line(lineId); l.fares += amount; l.pax++; }
  }
  spend(cat, amount, lineId) {
    this.money -= amount; this.today[cat] += amount;
    if (lineId) this.line(lineId).cost += amount;
  }
  get expensesToday() { const d = this.today; return d.drivers + d.energy + d.maint + d.buy; }

  // ---------- צי
  buy(type, time) {
    const T = TYPES[type]; if (!T) return { ok: false, msg: 'אין סוג רכב כזה' };
    if (this.money < T.price) return { ok: false, msg: `אין מספיק כסף ל${T.name} — חסרים ${money(T.price - this.money)}` };
    const v = this.add(type, time);
    this.spend('buy', T.price);
    return { ok: true, v, msg: `${T.name} ${v.num} נקנה ומחכה במוסך` };
  }
  // רכב בלי תשלום (מתנת פתיחה למי שכבר בנה קווים לפני שהיה כסף במשחק)
  add(type, time, lineId = null) {
    const v = { id: 'V' + this.nextNum, num: this.nextNum++, type, bought: time, lineId, status: 'depot', availableAt: 0, km: 0 };
    this.vehicles.push(v); this.dirty = true; return v;
  }
  sell(id) {
    const v = this.get(id); if (!v) return { ok: false, msg: 'אין רכב כזה' };
    if (v.status !== 'depot') return { ok: false, msg: `רכב ${v.num} בדרך — אפשר למכור רק רכב שנמצא במוסך` };
    const got = Math.round(TYPES[v.type].price * SELL_BACK);
    this.vehicles = this.vehicles.filter(x => x !== v);
    this.money += got; this.today.sell += got; this.dirty = true;
    return { ok: true, msg: `רכב ${v.num} נמכר ב-${money(got)}` };
  }
  get(id) { return this.vehicles.find(v => v.id === id); }
  ofLine(lineId) { return this.vehicles.filter(v => v.lineId === lineId); }
  // שיוך לקו (או null — בלי קו). רכב שבדרך ממשיך את הנסיעה הנוכחית ועובר לקו החדש כשהוא חוזר
  assign(id, L) {
    const v = this.get(id); if (!v) return { ok: false, msg: 'אין רכב כזה' };
    if (L && !canUse(v.type, L)) return { ok: false, msg: `מפרקי לא יכול לנסוע בקו ${L.def.number}: המסלול עובר ברחובות צרים. בחרו רכב אחר או שנו את המסלול` };
    v.lineId = L ? L.id : null; this.dirty = true;
    return { ok: true, msg: L ? `רכב ${v.num} שויך לקו ${L.def.number}` : `רכב ${v.num} חזר למוסך בלי קו` };
  }
  // רכב פנוי לקו ברגע היציאה
  take(lineId, time) {
    let best = null;
    for (const v of this.vehicles) {
      if (v.lineId !== lineId || v.status !== 'depot' || v.availableAt > time) continue;
      if (!best || v.num < best.num) best = v;
    }
    if (best) best.status = 'service';
    return best;
  }
  // סוף הנסיעה: נסיעה ריקה חזרה למוסך — עולה נהג ודלק, והרכב פנוי שוב אחרי זמן שתלוי באורך הקו
  release(v, time, L) {
    if (!v) return;
    const dead = L.poly.length / DEADHEAD_SPEED;
    v.status = 'back'; v.availableAt = time + dead + LAYOVER; v.km += L.poly.length / 1000;
    this.spend('energy', L.poly.length / 1000 * TYPES[v.type].km, L.id);
    this.spend('drivers', dead / 3600 * DRIVER_HOUR, L.id);
  }
  // קו שנמחק: הרכבים שלו חוזרים למוסך בלי קו
  dropLine(lineId) {
    for (const v of this.vehicles) if (v.lineId === lineId) { v.lineId = null; v.status = 'depot'; v.availableAt = 0; }
    this.dirty = true;
  }

  // כל צעד של הסימולציה: תחזוקה יומית (מחולקת לאורך היום), רכבים שחזרו למוסך, ומעבר יום
  tick(h, time) {
    let maint = 0;
    for (const v of this.vehicles) {
      maint += TYPES[v.type].maint;
      if (v.status === 'back' && v.availableAt <= time) v.status = 'depot';
    }
    if (maint) this.spend('maint', maint / DAY * h);
    const d = dayOf(time);
    if (d !== this.today.day) {
      this.history.push(this.today); if (this.history.length > 14) this.history.shift();
      this.today = emptyDay(d); this.dirty = true;
    }
  }
  status(v, time) {
    if (v.status === 'service') return 'בדרך';
    if (v.status === 'back' && v.availableAt > time) return 'חוזר למוסך';
    return 'במוסך';
  }
  ageDays(v, time) { return Math.max(0, Math.floor((time - v.bought) / DAY)); }
}

export const money = n => (n < 0 ? '−' : '') + '₪' + Math.round(Math.abs(n)).toLocaleString('en-US');
