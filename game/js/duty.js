// סידור עבודה לנהג ושאלות של נוסעים (תפקיד "נהג", על הקווים העירוניים האמיתיים).
// הסידור: ארבע נסיעות בקו שנבחר, לסירוגין בשני הכיוונים. כל נסיעה יוצאת מהמסוף בזמן של לוח הזמנים של הקו
// (היציאה הבאה של הכיוון אחרי סוף הנסיעה הקודמת והפסקה של 5 דקות לפחות). ניקוד: יציאה מהמסוף בזמן (‎-1 עד ‎+2 דק') +15,
// מוקדם או מאוחר −5. בהפסקה — אפשר לדלג עד היציאה הבאה.
// שאלות: לפעמים (בערך פעם בשלוש תחנות) נוסע שעולה שואל שאלה קצרה; המשחק עוצר עד שעונים. תשובה נכונה +5, לא נכונה −5 (תלונה).
import { lineCycle, FARE } from './fleet.js';
import { clockText } from './sim.js';

const BREAK = 300, TRIPS = 4, ASK_P = 0.33;
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class DriverShift {
  constructor(g) { this.g = g; this.trips = null; }      // g: { sim, lines(), toast, demand, setSpeed, speed(), score(pts), ui: {...}, drive(bus) }
  get on() { return !!this.trips; }
  // הכיוון השני של אותו קו (אותו מספר, כיוון אחר)
  pair(L) { return this.g.lines().find(K => K !== L && K.def.real && K.def.number === L.def.number && K.def.real.dir !== L.def.real.dir) || L; }
  // היציאה הבאה של קו L מהמסוף, לא לפני t (לפי התדירות של כל שעה — כמו ה-sim)
  nextDep(L, t) { let d = L.nextDispatch; const hw = () => (L.def.headway || 20) * 60; while (d < t) d += hw(); return d; }
  // הסידור: משמרת אמיתית מתוך סידור הנהגים של כל הקווים (sched.js) — הנסיעות הבאות של נהג שעובד בקו הזה,
  // גם אם הן בקווים אחרים. בלי סידור (או שאין נהג לקו) — ארבע נסיעות לסירוגין בשני הכיוונים, כמו קודם
  plan(L) {
    const sim = this.g.sim, trips = [];
    const S = sim.roster, d = S?.managed(L) ? S.dutyFor(L, sim.time + 60, this.pair(L)) : null;
    if (d) {
      const cur = id => this.g.lines().find(K => K.id === id && !K.retired);
      for (const x of d.trips.slice(0, TRIPS)) { const K = cur(x.lid); if (K) trips.push({ L: K, dep: x.dep, arr: x.arr, key: x.key, up: x.up, vt: x.veh?.type, veh: x.veh ? x.veh.n : null, bus: null, actual: null }); }
      if (trips.length) {
        this.trips = trips; this.i = 0; this.asked = new Set(); this.stats = { ontime: 0, late: 0, early: 0, right: 0, wrong: 0 };
        this.duty = { id: d.driver.id, n: d.driver.trips.length, start: d.driver.start, end: d.driver.end };
        return trips;
      }
    }
    this.duty = null;
    let cur = L, t = this.nextDep(L, sim.time + 60);
    for (let i = 0; i < TRIPS; i++) {
      const run = lineCycle(cur).run;
      trips.push({ L: cur, dep: t, arr: t + run, bus: null, actual: null });
      cur = this.pair(cur); t = this.nextDep(cur, t + run + BREAK);
    }
    this.trips = trips; this.i = 0; this.asked = new Set(); this.stats = { ontime: 0, late: 0, early: 0, right: 0, wrong: 0 };
    return trips;
  }
  sheetHTML() {
    const D = this.duty;
    return `${D ? `<p class="lmeta">משמרת נהג ${D.id} בסידור: ${clockText(D.start)}–${clockText(D.end)}, ${D.n} נסיעות (כאן ${this.trips.length} הנסיעות הבאות שלך)</p>` : ''}<table class="duty"><tr><th>#</th><th>קו</th><th>כיוון</th><th>יציאה</th><th>סיום</th></tr>${this.trips.map((t, i) => {
      const brk = i ? Math.round((t.dep - this.trips[i - 1].arr) / 60) : 0;
      return `${i ? `<tr class="brk"><td colspan="5">הפסקה ${brk} דק'</td></tr>` : ''}<tr><td>${i + 1}</td><td><span class="num sm" style="background:${t.L.color}">${t.L.def.number}</span>${t.up ? ' <span title="רכב גדול מהרגיל בקו">↑</span>' : ''}</td><td>אל ${t.L.def.real?.dest || ''}</td><td><b>${clockText(t.dep)}</b></td><td>${clockText(t.arr)}</td></tr>`; }).join('')}</table>`;
  }
  get trip() { return this.trips?.[this.i] || null; }
  // האוטובוס של הנסיעה הנוכחית: זה שיצא מהמסוף בזמן של הנסיעה (או false — עוד לא יצא, הפסקה)
  busFor(t) {
    if (t.bus) return t.bus;
    const live = b => b.state === 'drive' || b.state === 'dwell';
    if (t.key) {        // לפי הסידור: האוטובוס שיצא לנסיעה הזו (נסיעה שבוטלה — מסומנת, ו-next() מדלג עליה)
      for (const K of this.g.sim.lines) for (const b of K.buses) if (b.trip?.key === t.key && live(b)) t.bus = b;
      if (!t.bus && this.g.sim.roster?.plan?.trips.some(x => x.key === t.key && x.status === 'cancel')) t.cancelled = true;
      return t.bus || null;
    }
    t.bus = t.L.buses.find(b => Math.abs(b.born - t.dep) < 90 && live(b)) || null;
    // התדירות השתנתה בינתיים (שעה אחרת): האוטובוס שיצא הכי קרוב לזמן — והזמן בסידור מתעדכן אליו
    if (!t.bus && this.g.sim.time > t.dep + 120) { const c = t.L.buses.filter(b => live(b) && b.next <= 1 && b.born >= t.dep - 900).sort((a, b) => Math.abs(a.born - t.dep) - Math.abs(b.born - t.dep))[0]; if (c) { t.bus = c; t.dep = c.born; } }
    return t.bus;
  }
  // נקרא כשהאוטובוס של הנהג נגמר: עוברים לנסיעה הבאה
  next(prev) {
    if (!this.trips) return undefined;
    const t = this.trip;
    if (t && t.bus === prev && prev && prev.state !== 'drive' && prev.state !== 'dwell') { this.i++; if (!this.trip) { this.finish(); return null; } }
    while (this.trip && !this.trip.bus && (this.busFor(this.trip), this.trip.cancelled)) { this.g.toast(`הנסיעה של ${clockText(this.trip.dep)} בוטלה`); this.i++; }
    if (!this.trip) { this.finish(); return null; }
    const n = this.trip; return n ? (this.busFor(n) || false) : null;
  }
  // דילוג עד היציאה הבאה (בהפסקה)
  skip() {
    const t = this.trip; if (!t) return;
    const sim = this.g.sim; while (sim.time < t.dep + 2) { sim.tick(0.5); sim.events.length = 0; }
  }
  finish() {
    const s = this.stats; this.trips = null;
    this.g.toast(`סוף המשמרת! יציאות בזמן: ${s.ontime} מתוך ${TRIPS} · תשובות נכונות: ${s.right}`);
    this.g.ended?.();
  }
  // כל פריים: יציאה מהמסוף (בזמן?), ושאלות בעלייה
  update(bus, events) {
    const t = this.trip; if (!t || !bus) return;
    if (t.bus === bus && t.actual == null && bus.state === 'drive' && bus.next >= 1) {
      t.actual = this.g.sim.time; const d = t.actual - t.dep;
      if (d >= -60 && d <= 120) { this.stats.ontime++; this.g.score(15); this.g.toast(`יצאת מהמסוף בזמן ✓ (${clockText(t.dep)})`); }
      else { this.stats[d < 0 ? 'early' : 'late']++; this.g.score(-5); this.g.toast(d < 0 ? `יצאת מוקדם ב-${Math.round(-d / 60)} דק'` : `יצאת באיחור של ${Math.round(d / 60)} דק'`); }
    }
    if (this.q) return;
    for (const e of events) {
      if (e.type !== 'board' || e.bus !== bus || e.p.role) continue;
      const key = bus.id + ':' + bus.next; if (this.asked.has(key)) continue;
      this.asked.add(key);
      if (Math.random() < ASK_P) { this.ask(bus); break; }
    }
  }
  // ---------- שאלות
  question(bus) {
    const L = bus.line, here = bus.next, ahead = L.stops.slice(here + 1), sim = this.g.sim, names = s => s.name;
    const kinds = [];
    // 1. הקו עובר ליד...? (כן — תחנה בהמשך; לא — תחנה של קו אחר שלא בקו הזה)
    const others = this.g.lines().filter(K => K.def.number !== L.def.number).flatMap(K => K.stops).filter(s => !L.stops.includes(s));
    if (ahead.length) kinds.push(() => { const yes = Math.random() < 0.5 || !others.length, s = yes ? pick(ahead) : pick(others);
      return { q: `הקו הזה עובר ב"${s.name}"?`, a: ['כן', 'לא'], ok: yes ? 0 : 1 }; });
    // 2. כמה עולה נסיעה?
    kinds.push(() => { const a = shuffle([`₪${FARE}`, `₪${FARE + 2}`, `₪${FARE - 1.5}`]); return { q: 'כמה עולה נסיעה?', a, ok: a.indexOf(`₪${FARE}`) }; });
    // 3. באיזו תחנה לרדת לשכונה...?
    const Z = this.g.demand?.zones || [];
    const byZone = ahead.filter(s => Z[s.zone]?.name);
    if (byZone.length >= 2) kinds.push(() => { const s = pick(byZone), zn = Z[s.zone].name, wrong = shuffle(ahead.filter(x => Z[x.zone]?.name !== zn)).slice(0, 2);
      if (wrong.length < 1) return null; const a = shuffle([s, ...wrong]); return { q: `באיזו תחנה לרדת לשכונת ${zn}?`, a: a.map(names), ok: a.indexOf(s) }; });
    // 4. מתי האוטובוס הבא של קו X?
    const lx = this.g.lines().filter(K => K.def.real && K.def.number !== L.def.number && !K.off);
    if (lx.length) kinds.push(() => { const K = pick(lx), d = this.nextDep(K, sim.time), c = clockText(d);
      const a = shuffle([c, clockText(d + 600), clockText(Math.max(sim.time, d - 900))].filter((x, i, A) => A.indexOf(x) === i));
      return { q: `מתי יוצא האוטובוס הבא של קו ${K.def.number} (אל ${K.def.real.dest})?`, a, ok: a.indexOf(c) }; });
    for (let n = 0; n < 6; n++) { const r = pick(kinds)(); if (r && r.ok >= 0) return r; }
    return null;
  }
  ask(bus) {
    const q = this.question(bus); if (!q) return;
    const ui = this.g.ui, sp = this.g.speed();
    this.q = q; this.g.setSpeed(0);
    ui.qText.textContent = q.q;
    ui.qBtns.innerHTML = q.a.map((s, i) => `<button type="button" data-i="${i}">${s}</button>`).join('');
    ui.qBox.hidden = false;
    ui.qBtns.onclick = e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const ok = +b.dataset.i === q.ok;
      this.stats[ok ? 'right' : 'wrong']++; this.g.score(ok ? 5 : -5);
      ui.qBox.hidden = true; this.q = null; this.g.setSpeed(sp || 1);
      this.g.toast(ok ? '😊 הנוסע מודה לך' : `😠 תלונה: התשובה הנכונה — ${q.a[q.ok]}`);
    };
  }
  // קצר, לרצועה העליונה במבט נהג
  short() {
    const t = this.trip; if (!t) return '';
    const sim = this.g.sim, n = `${this.i + 1}/${this.trips.length}`;
    if (!t.bus || t.bus.state !== 'drive' && t.bus.state !== 'dwell') return `${n} · הפסקה עד ${clockText(t.dep)}`;
    if (t.actual == null) { const m = Math.round((sim.time - t.dep) / 60); return `${n} · יציאה ${clockText(t.dep)}${m > 0 ? ` (+${m})` : ''}`; }
    const d = Math.round((t.actual - t.dep) / 60); return `${n} · ${d === 0 ? 'בזמן ✓' : d > 0 ? `+${d} דק'` : `${d} דק'`}`;
  }
  // שורה קטנה בתצוגה: הנסיעה הנוכחית או ההפסקה
  status() {
    const t = this.trip; if (!t) return '';
    const sim = this.g.sim, n = `${this.i + 1}/${this.trips.length}`;
    if (!t.bus || t.bus.state !== 'drive' && t.bus.state !== 'dwell') {
      const m = Math.ceil((t.dep - sim.time) / 60);
      return `סידור ${n}: הפסקה — יציאה בקו ${t.L.def.number} ב-${clockText(t.dep)}${m > 0 ? ` (עוד ${m} דק')` : ''}`;
    }
    if (t.actual == null) { const m = Math.round((sim.time - t.dep) / 60); return `סידור ${n}: יציאה ${clockText(t.dep)}${m > 0 ? ` · ${m} דק' איחור` : m < 0 ? ` · עוד ${-m} דק'` : ' · עכשיו'}`; }
    const d = Math.round((t.actual - t.dep) / 60);
    return `סידור ${n}: קו ${t.L.def.number} · יצאת ${d === 0 ? 'בזמן' : d > 0 ? `+${d} דק'` : `${d} דק'`} · סיום ${clockText(t.arr)}`;
  }
}
