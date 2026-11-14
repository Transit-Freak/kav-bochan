// תפעול: שביעות רצון של נוסעים, אירועים (תקלה, נהג מאחר, פקק, התחמקות מתשלום), פקחים, מבקרים סמויים של המשרד
// ודוחות ביקורת, ופעולות הסדרן. בלי ציור — sim.js קורא לפונקציות כאן בכמה נקודות (ops?.…), והתצוגה קוראת את המצב.
// הכל זול: הסתברויות קטנות בכל צעד, בלי מבני נתונים כבדים. במצב יצירתי אפשר לכבות אירועים ודוחות (bank.settings).
import { FARE, dayOf } from './fleet.js';
import { lineTimes } from './demand.js';
import { modeOf } from './difficulty.js';

export const INSPECTOR_DAY = 350;          // ₪ ליום לפקח
export const FINE = 60;                    // ₪ קנס למי שנתפס בלי כרטיס
const EVADE = 0.06;                        // התחמקות מתשלום בלי פקחים; כל פקח מוריד 1.2% (עד 1%)
const BREAK_H = 40;                        // תקלה: בממוצע פעם ב-40 שעות נסיעה של אוטובוס
const JAM_H = 10;                          // פקק: בממוצע פעם ב-10 שעות פעילות של קו
const LATE_P = 0.04;                       // נהג מאחר: 4% מהיציאות
export const RESERVE_COST = 300;
const DOORS = { mini: 1, std: 2, elec: 2, artic: 3 };                  // דלתות לכל סוג רכב — כמה פקחים לכל היותר בקבוצה
const DOOR_NAMES = ['front', 'mid', 'mid'];                           // לדגם יש שתי דלתות; השלישית (מפרקי) — גם באמצעית           // רכב חלופי לאוטובוס תקוע
export const ROLE = new Map();             // id של נוסע ← 'insp' (פקח עם אפוד) / 'ctl' (מבקר סמוי — נראה כמו כולם)
const DAY = 86400;
const mm = s => Math.round(s / 60);

export class Ops {
  constructor(sim) { this.sim = sim; this.log = []; this.jams = []; this.rand = mulberry(11); this.auditsDay = { day: 0, n: 0 }; this.inspT = 0; }
  get bank() { return this.sim.bank; }
  get settings() { return this.bank?.settings || {}; }
  // במצב קריירה הכל פעיל; ביצירתי — לפי ההגדרות
  // רמת הקושי (difficulty.js): כמה תקלות, התחמקות, ביקורת. ביצירתי ובקל אפשר לכבות אירועים ודוחות (הגדרות)
  get M() { return modeOf(this.bank); }
  get incidents() { return !this.M.toggles || this.settings.incidents !== false; }
  get audits() { if (this.M.audits === false) return false; return !this.M.toggles || this.settings.audits !== false; }
  get inspectors() { return this.M.inspectors ? this.bank?.inspectors || 0 : 0; }
  note(type, L, txt, bus) {
    this.log.unshift({ t: this.sim.time, type, line: L?.def.number ?? '', color: L?.color, txt, bus: bus?.id });
    if (this.log.length > 60) this.log.length = 60;
    this.sim.events.push({ type: 'incident', kind: type, line: L, bus, txt });
  }

  // כל צעד: תקלות ופקקים, ותשלום לפקחים
  tick(h) {
    const S = this.sim, t = S.time;
    if (this.inspectors && this.bank) this.bank.spend('insp', this.inspectors * INSPECTOR_DAY * h / DAY);
    if (this.jams.length) this.jams = this.jams.filter(j => j.until > t);
    if (!this.incidents) return;
    for (const L of S.lines) {
      if (L.retired || L.off || !L.buses.length) continue;
      if (this.rand() < h * this.M.jamK / (JAM_H * 3600) && L.stops.length > 2) {
        const k = Math.floor(this.rand() * (L.stops.length - 1));
        if (!this.jams.some(j => j.L === L && j.k === k)) {
          this.jams.push({ L, k, until: t + 900 + this.rand() * 900, f: 0.35 });
          this.note('jam', L, `פקק בין ${L.stops[k].name} ל${L.stops[k + 1].name}`);
        }
      }
      for (const b of L.buses) {
        if (b.state !== 'drive' || b.broken || b.s < 30) continue;
        if (this.rand() < h * this.M.breakK / (BREAK_H * 3600)) {
          b.broken = true; b.stall = t + 600 + this.rand() * 420;
          this.note('break', L, 'תקלה באוטובוס — עומד בצד ומחכה לרכב חלופי', b);
        }
      }
    }
  }
  // מהירות: פקק בקטע שהאוטובוס נמצא בו
  speedK(L, b) {
    if (!this.jams.length) return 1;
    for (const j of this.jams) if (j.L === L && b.next === j.k + 1) return j.f;
    return 1;
  }
  stalled(b) {
    if (!b.stall) return false;
    if (b.stall > this.sim.time) return true;
    if (b.broken) { b.broken = false; this.note('fixed', b.line, 'רכב חלופי הגיע — האוטובוס ממשיך', b); }
    b.stall = 0; return false;
  }
  // יציאה מהמסוף: לפעמים הנהג מאחר; לפעמים מבקר סמוי עולה לנסיעה כולה
  onDispatch(L, b) {
    const t = this.sim.time;
    if (this.incidents && this.rand() < LATE_P * this.M.lateK) { b.stall = t + 180 + this.rand() * 240; this.note('late', L, `הנהג מאחר — היציאה מתעכבת בכ-${mm(b.stall - t)} דק'`, b); }
    const d = dayOf(t); if (this.auditsDay.day !== d) this.auditsDay = { day: d, n: 0 };
    if (this.audits && this.auditsDay.n < 2 && this.rand() < 0.08) {
      this.auditsDay.n++;
      b.audit = { start: t, delays: [], maxLoad: 0, skipped: 0, stops: 0, broke: false, clean: 6 + this.rand() * 4, driver: 6.5 + this.rand() * 3.5 };
      const p = this.sim.makeRider(L, 0, L.stops.length - 1, 'ctl'); if (p) b.ctl = p;
    }
  }
  // הגעה לתחנה: איחור לעומת הלוח (זמן היציאה + זמן הנסיעה המתוכנן)
  onArrive(L, b, k) {
    const T = lineTimes(L); b.delay = this.sim.time - ((b.sdep ?? b.born) + T[k]);
    if (b.holdNext) { b.hold = this.sim.time + b.holdNext; b.holdNext = 0; }
    if (b.audit) { b.audit.delays.push(b.delay); b.audit.stops++; }
  }
  onPass(L, b, k, waiting) { if (b.audit && waiting) b.audit.skipped++; }
  onLoad(b) { if (b.audit) b.audit.maxLoad = Math.max(b.audit.maxLoad, b.pax.length / b.cap); if (b.broken && b.audit) b.audit.broke = true; }
  // כרטיס: מי שלא משלם — הכנסה שהולכת לאיבוד; פקחים תופסים חלק וגובים קנס
  // התחמקות "חכמה": לכל קו — איזה חלק מהנסיעות שלו נבדקו לאחרונה (היום, אתמול ושלשום במשקל יורד; bank.inspHist),
  // וככל שיותר — פחות מעזים לנסוע בלי לשלם. רצפה: 1.5%. (הפקחים שנשכרים משפיעים דרך הביקורות שהם עושים)
  risk(L) { const h = this.bank?.inspHist?.[L.def?.id || L.id]; if (!h) return 0; const trips = Math.max(10, 960 / (L.def?.headway || 20)); return (h[0] + 0.7 * h[1] + 0.4 * h[2]) / (2.1 * trips); }
  evadeRate(L) { return Math.max(0.015, this.M.evade * Math.exp(-3 * this.risk(L))); }
  noteInspection(L) { if (!this.bank) return; const H = this.bank.inspHist || (this.bank.inspHist = {}), k = L.def?.id || L.id; (H[k] || (H[k] = [0, 0, 0]))[0]++; }
  roll() { const H = this.bank?.inspHist; if (!H) return; for (const k of Object.keys(H)) { const h = H[k]; h.unshift(0); h.length = 3; if (!h[0] && !h[1] && !h[2]) delete H[k]; } }
  pays(L) {
    if (!this.incidents) return true;
    if (!this.M.evade) return true;
    const e = this.evadeRate(L);
    if (this.rand() >= e) return true;
    const T = this.bank?.today; if (T) T.evaded = (T.evaded || 0) + FARE;
    if (this.inspectors && this.rand() < Math.min(0.6, 0.07 * this.inspectors)) {
      if (this.bank) { this.bank.money += FINE; T.fineIn = (T.fineIn || 0) + FINE; T.caught = (T.caught || 0) + 1; }
    }
    return false;
  }
  // שביעות רצון של נסיעה (0–100): המתנה לעומת התדירות, צפיפות, אוטובוס מלא שעבר, איחור, מעברים
  rate(p, L, b, k) {
    const hw = L.def.headway * 60, wait = p.wait ?? 0;
    let s = 100;
    s -= Math.min(35, Math.max(0, wait / hw - 0.5) * 30);
    s -= Math.min(20, Math.max(0, (p.load ?? 0) - 0.6) * 50);
    s -= Math.min(25, (p.skips || 0) * 12);
    s -= Math.min(20, Math.max(0, (b.delay || 0) - 120) / 60 * 3);
    s -= (p.legs?.length - 1 || 0) * 5;
    s = Math.max(0, Math.round(s));
    const st = L.stats; st.satSum = (st.satSum || 0) + s; st.satN = (st.satN || 0) + 1;
    const ss = this.sim.stopStats.get(L.stops[p.from]?.id); if (ss) { ss.satSum = (ss.satSum || 0) + s; ss.satN = (ss.satN || 0) + 1; }
    return s;
  }
  // סוף הנסיעה: מבקר סמוי כותב דוח
  onDone(L, b) {
    if (!b.audit || !this.bank) return;
    const a = b.audit; b.audit = null;
    const md = a.delays.length ? a.delays.reduce((x, y) => x + Math.abs(y), 0) / a.delays.length : 0;
    const sc = {
      clean: a.clean, driver: a.broke ? Math.min(a.driver, 7) : a.driver,
      punct: Math.max(2, 10 - Math.max(0, md - 60) / 60 * 1.6),
      crowd: a.maxLoad <= 0.7 ? 10 : Math.max(3, 10 - (a.maxLoad - 0.7) * 22),
      stops: Math.max(0, 10 - a.skipped * 3),
    };
    const grade = Math.round((sc.clean + sc.driver + sc.punct + sc.crowd + sc.stops) * 2);
    const f = [];
    f.push(sc.clean >= 8.5 ? 'האוטובוס נקי ומסודר' : sc.clean >= 7 ? 'ניקיון סביר' : 'האוטובוס מלוכלך — צריך ניקוי');
    f.push(sc.punct >= 8.5 ? 'עמידה בלוח הזמנים' : `איחור ממוצע של כ-${mm(md)} דק'`);
    f.push(sc.driver >= 8.5 ? 'הנהג אדיב ונוהג בזהירות' : sc.driver >= 7 ? 'התנהגות הנהג תקינה' : 'נהיגה חדה, הנהג לא אדיב');
    f.push(a.maxLoad > 1 - 1e-9 ? 'האוטובוס היה מלא — נוסעים נשארו בתחנה' : a.maxLoad > 0.8 ? 'צפוף בשעת השיא' : 'מקום פנוי לכולם');
    if (a.skipped) f.push(`לא עצר ב-${a.skipped} תחנות שחיכו בהן נוסעים`);
    if (a.broke) f.push('הייתה תקלה בדרך');
    const r = { day: dayOf(this.sim.time), t: this.sim.time, line: L.def.number, color: L.color, grade, sc, find: f, money: 0 };
    const M = this.M;
    if (M.stages) {
      if (M.bonusFrom != null && grade >= M.bonusFrom) { r.money = 2000; this.bank.money += 2000; this.bank.today.bonus = (this.bank.today.bonus || 0) + 2000; }
      else if (M.fineBelow != null && grade < M.fineBelow) { r.money = -3000; this.bank.spend('penalty', 3000); }
    }
    const R = this.bank.reports || (this.bank.reports = []); R.unshift(r); if (R.length > 30) R.length = 30;
    this.note('report', L, `דוח ביקורת: ${grade}`, b);
  }
  // פקחים: מדי פעם פקח (באפוד צהוב) עולה לאוטובוס של קו אקראי
  spawnInspectors(h) {
    if (!this.inspectors) return;
    this.inspT -= h; if (this.inspT > 0) return;
    this.inspT = 2400 / this.inspectors;
    const act = this.sim.lines.filter(L => !L.off && this.sim.inService(L) && L.stops.length > 2);
    if (!act.length) return;
    const L = act[Math.floor(this.rand() * act.length)], k = Math.floor(this.rand() * (L.stops.length - 2));
    // קבוצה: עד פקח אחד לכל דלת (מיניבוס — 1, רגיל וחשמלי — 2, מפרקי — 3), וכל אחד עולה בדלת אחרת
    const n = 1 + Math.floor(this.rand() * (DOORS[L.def.vtype] || 2)), to = Math.min(L.stops.length - 1, k + 2 + Math.floor(this.rand() * 3));
    for (let i = 0; i < n; i++) { const p = this.sim.makeRider(L, k, to, 'insp'); if (p) p.door = DOOR_NAMES[i]; }
    this.noteInspection(L);
  }
  // ---------- פעולות הסדרן
  hold(b, sec = 60) { if (b.state === 'dwell') b.hold = Math.max(b.hold || 0, this.sim.time) + sec; else b.holdNext = (b.holdNext || 0) + sec; this.note('hold', b.line, `הסדרן: החזקה ${mm(sec)} דק' בתחנה`, b); }
  express(b) { b.express = true; this.note('express', b.line, 'הסדרן: ישר למסוף (רק הורדת נוסעים)', b); }
  reserve(L, b) {
    if (b?.broken) {
      if (this.bank) this.bank.spend('penalty', RESERVE_COST);
      b.stall = Math.min(b.stall, this.sim.time + 120); this.note('reserve', L, `הסדרן: רכב חלופי בדרך (${RESERVE_COST} ₪)`, b); return true;
    }
    if (this.sim.roster?.managed(L)) { if (!this.sim.roster.extra(L)) return false; }
    else if (this.sim.available(L) <= 0) return false;
    L.nextDispatch = this.sim.time; this.note('reserve', L, 'הסדרן: אוטובוס נוסף יוצא מהמסוף', null); return true;
  }
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
