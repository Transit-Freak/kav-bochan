// הרצה מהירה בלילה: כשאין אף קו בשעות הפעילות שלו ואין אוטובוס בדרך — השעון רץ ×200 עד שהקו הראשון נפתח,
// ואז חוזר למהירות שהייתה. מי שבוחר מהירות בעצמו בזמן הזה — הבחירה שלו נשארת עד שהקווים חוזרים לפעול.
// הסימולציה עצמה מתקדמת בצעדים של רבע שנייה גם במהירות הזו (Sim.step), כך שהחשבון לא משתנה.
import { inHours } from './demand.js';

export const FAST = 200;

export class NightFast {
  // lines: () => הקווים; ui: { setSpeed(s, auto), toast(t), busy() — מתכננים קו או שהטופס פתוח }
  constructor(sim, lines, ui) {
    this.sim = sim; this.lines = lines; this.ui = ui;
    this.on = false; this.prev = 5; this.declined = false;
  }
  // אין מה לראות: יש קווים עם רכבים, אף אחד מהם לא בשעות הפעילות, ואין אוטובוס בדרך
  quiet() {
    const L = this.lines().filter(l => l.def.fleet > 0);
    if (!L.length) return false;
    if (L.some(l => inHours(l.def, this.sim.time))) return false;
    return !this.sim.lines.some(l => l.buses.some(b => b.state === 'drive' || b.state === 'dwell'));
  }
  update() {
    const q = this.quiet();
    if (!q) {
      this.declined = false;
      if (this.on) { this.on = false; this.ui.setSpeed(this.prev, true); }
      return;
    }
    if (this.on || this.declined || !this.sim.speed || this.ui.busy()) return;
    this.on = true; this.prev = this.sim.speed;
    this.ui.setSpeed(FAST, true);
    const h = Math.floor(this.sim.time / 3600) % 24;
    this.ui.toast(h < 5 || h >= 21 ? `לילה — מאיצים ×${FAST} עד שהקווים יוצאים` : `אין קווים פעילים — מאיצים ×${FAST}`);
  }
  // המשתמש לחץ על מהירות או עצירה
  manual() { if (this.on) { this.on = false; this.declined = true; } }
}
