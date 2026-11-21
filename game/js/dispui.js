// מסכי הסדרן: היכרות קצרה (3 שקופיות, פעם אחת לכל עיר, ואפשר לפתוח שוב ב-"?"), בחירת משמרת, לוח מצב קטן
// בראש המסך (אמינות, ביטולים, צפופים, משאבים, שעון), כרטיסי אירועים עם ספירה לאחור, ודוח בסוף המשמרת.
// הלוגיקה ב-dispshift.js; main.js קורא ל-enter() כשנכנסים לתפקיד ול-update() כמה פעמים בשנייה.
import { SHIFTS, GOAL, KIND, ESCALATE, FINE_CANCEL, FINE_STRAND } from './dispshift.js';
import { cityKey } from './cityconf.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clk = t => { const m = Math.floor(t / 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const hm = s => { const m = Math.max(0, Math.ceil(s / 60)); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const nis = n => '₪' + Math.round(n).toLocaleString('en-US');
const INTRO_KEY = cityKey('dispIntro.v1'), BEST_KEY = cityKey('dispBest.v1');
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

const SLIDES = [
  { t: 'מה קורה בעיר', icon: '🏙️', rows: [
    'האוטובוסים כבר נוסעים לפי לוח הזמנים.',
    'אתם הסדרן במשמרת של 3 שעות.',
    'במשמרת יקרו תקלות: נהג מאחר, אוטובוס מתקלקל, פקק.',
    'כל תקלה מחכה לכם 5 דקות בשעון המשחק. אחר כך היא מחמירה.'] },
  { t: 'הכלים שלכם', icon: '🎧', rows: [
    '⏱ <b>נהג מחליף</b> — האוטובוס יוצא מהמסוף בזמן.',
    '⚠ <b>אוטובוס רזרבה</b> — מחליף אוטובוס תקול, והנוסעים ממשיכים.',
    '🚦 <b>עיכוב האוטובוס שמאחור</b> — כדי שלא ייצמדו בפקק.',
    '🚌 <b>אוטובוס נוסף</b> לקו צפוף — רזרבה ונהג יחד.',
    '⏸ <b>החזקה בתחנה</b> ו־⏩ <b>ישר למסוף</b> — הקישו על אוטובוס ברצועה בלשונית "סדרן".',
    'יש מעט רזרבות ונהגים. תחליטו איפה הם הכי חשובים.'] },
  { t: 'איך מקבלים ציון', icon: '📊', rows: [
    'כמו מדד האמינות של משרד התחבורה.',
    'נסיעה בזמן: יצאה עד 5 דקות אחרי הלוח.',
    'נסיעה שבוטלה או איחרה — לא בזמן.',
    `המטרה: <b>${GOAL}% נסיעות בזמן ומעלה</b>. ציון מ-A עד F.`,
    'בדוח גם: נסיעות צפופות, נוסעים שוויתרו וקנסות.'] },
];

export class DispUI {
  // ctx: { sim, bank, toast, setSpeed, speed(), preset(t0) — רשת אמיתית חדשה שמתחילה ב-t0, active() — האם תפקיד סדרן }
  constructor(ctx) {
    this.ctx = ctx; this.slide = 0; this.shown = null; this.seen = new Set();
    const div = (id, cls, html, hidden = true) => { const e = document.createElement('div'); e.id = id; e.className = cls; e.innerHTML = html; e.hidden = hidden; document.body.appendChild(e); return e; };
    this.hud = div('dsHud', 'dshud', '');
    this.intro = div('dsIntro', 'modal', '<div class="card dscard" role="dialog" aria-modal="true" aria-labelledby="dsIntroT"></div>');
    this.pick = div('dsPick', 'modal', '<div class="card dscard" role="dialog" aria-modal="true"></div>');
    this.rep = div('dsReport', 'modal', '<div class="card dscard" role="dialog" aria-modal="true"></div>');
    this.hud.onclick = e => this.hudClick(e);
    this.intro.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const a = b.dataset.i;
      if (a === 'next') { if (this.slide < SLIDES.length - 1) { this.slide++; this.drawIntro(); } else this.closeIntro(); }
      else if (a === 'back') { this.slide = Math.max(0, this.slide - 1); this.drawIntro(); }
      else if (a === 'skip') this.closeIntro();
      else if (a.startsWith('dot')) { this.slide = +a.slice(3); this.drawIntro(); } };
    this.pick.onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; const a = b.dataset.p;
      if (a === 'help') { this.pick.hidden = true; this.openIntro(true); }
      else if (a === 'free') { this.pick.hidden = true; this.ctx.toast('בלי משמרת: האוטובוסים נוסעים, ואפשר לתרגל עם הכלים'); }
      else this.start(a); };
    this.rep.onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; this.rep.hidden = true; if (b.dataset.r === 'again') this.openPick(); };
  }
  get ops() { return this.ctx.sim.ops; }
  get shift() { return this.ops.shift; }
  best() { try { return JSON.parse(get(BEST_KEY) || '{}') || {}; } catch { return {}; } }

  // כניסה לתפקיד: היכרות בפעם הראשונה בעיר הזו, ואחר כך בחירת משמרת
  enter() {
    if (this.ops.inShift) return;
    if (get(INTRO_KEY) !== '1') this.openIntro(false); else this.openPick();
  }
  openIntro(again) { this.again = again; this.slide = 0; this.drawIntro(); this.intro.hidden = false; }
  closeIntro() { this.intro.hidden = true; put(INTRO_KEY, '1'); if (!this.ops.inShift) this.openPick(); }
  drawIntro() {
    const s = SLIDES[this.slide], last = this.slide === SLIDES.length - 1;
    this.intro.firstChild.innerHTML = `<div class="dsstep">${this.slide + 1} מתוך ${SLIDES.length}</div>
      <div class="dsbig" aria-hidden="true">${s.icon}</div><h2 id="dsIntroT">${s.t}</h2>
      <ul class="dsrows">${s.rows.map(r => `<li>${r}</li>`).join('')}</ul>
      <div class="dsdots">${SLIDES.map((_, i) => `<button type="button" data-i="dot${i}" class="${i === this.slide ? 'on' : ''}" aria-label="שקופית ${i + 1}"></button>`).join('')}</div>
      <div class="row dsnav">${this.slide ? '<button type="button" data-i="back">הקודם</button>' : '<button type="button" data-i="skip">דילוג</button>'}<button type="button" data-i="next" class="primary">${last ? (this.ops.inShift ? 'חזרה למשמרת' : 'לבחירת משמרת') : 'הבא'}</button></div>`;
  }
  openPick() {
    const B = this.best();
    this.pick.firstChild.innerHTML = `<h2>בחרו משמרת</h2>
      <p class="hint dsgoal">המטרה: <b>${GOAL}% נסיעות בזמן ומעלה</b></p>
      <div class="dspick">${SHIFTS.map(d => { const b = B[d.id];
        return `<button type="button" data-p="${d.id}"><b>${d.name}</b><span><span dir="ltr">${clk(d.from)}–${clk(d.to)}</span>${d.peak ? ' · שעת שיא, יותר תקלות' : ' · רגוע יותר'}</span>${b ? `<small>השיא שלכם: ${b.grade} · ${b.pct}% בזמן</small>` : '<small>עוד לא שיחקתם</small>'}</button>`; }).join('')}</div>
      <div class="row dsnav"><button type="button" data-p="help">איך משחקים?</button><button type="button" data-p="free">בלי משמרת</button></div>`;
    this.pick.hidden = false;
  }
  async start(id) {
    const def = SHIFTS.find(d => d.id === id); if (!def) return;
    this.pick.hidden = true; this.rep.hidden = true; this.shown = null; this.seen.clear();
    this.ctx.toast('מכינים את המשמרת…');
    await this.ctx.preset(def.from - this.ctx.warm);
    this.ops.startShift(def);
    this.ctx.started?.();
    this.ctx.setSpeed(20);
    this.ctx.toast(`${def.name} התחילה. המטרה: ${GOAL}% נסיעות בזמן ומעלה`);
    this.update(true);
  }

  // ---------- כל כמה עשיריות שנייה
  update() {
    const on = this.ctx.active(), sh = this.shift;
    if (!on) { this.hud.hidden = true; return; }
    const top = document.querySelector('.bar')?.getBoundingClientRect().bottom || 60;
    this.hud.style.top = (top + 6) + 'px';
    this.hud.hidden = false;
    if (!sh || sh.done) {
      if (sh?.done && sh.report && this.shown !== sh) { this.shown = sh; this.showReport(sh.report); }
      const html = `<div class="dsbar idle"><button type="button" data-h="pick" class="primary">התחלת משמרת</button><button type="button" data-h="help" class="dsq" aria-label="איך משחקים">?</button></div>`;
      if (this.hud.dataset.html !== html) { this.hud.dataset.html = html; this.hud.innerHTML = html; }
      return;
    }
    const v = sh.live(), t = this.ctx.sim.time;
    // אירוע חדש במהירות גבוהה — מאטים ל-×5, כדי שיהיה זמן לטפל
    for (const e of sh.inc) if (!this.seen.has(e.id)) { this.seen.add(e.id); if (!e.closed && this.ctx.speed() > 5) this.ctx.setSpeed(5); }
    const pctCls = v.pct >= GOAL ? 'ok' : v.pct >= 85 ? 'warn' : 'bad';
    const cards = sh.inc.map(e => {
      const left = e.due - t, k = KIND[e.kind], frac = Math.max(0, Math.min(1, left / ESCALATE));
      let act = '';
      if (!e.closed) {
        if (e.kind === 'late') act = `<button type="button" data-h="spare" data-e="${e.id}" class="primary" ${v.res.drv ? '' : 'disabled'}>נהג מחליף (${v.res.drv})</button>`;
        if (e.kind === 'break') act = `<button type="button" data-h="fix" data-e="${e.id}" class="primary" ${v.res.bus ? '' : 'disabled'}>אוטובוס רזרבה (${v.res.bus})</button>`;
        if (e.kind === 'jam') act = `<button type="button" data-h="jam" data-e="${e.id}" class="primary">לעכב את הבא</button>`;
      }
      const what = e.kind === 'late' ? 'האוטובוס עומד במסוף בלי נהג' : e.kind === 'break' ? `${e.bus ? e.bus.pax.filter(p => !p.role).length : 0} נוסעים מחכים באוטובוס` : `בין ${esc(e.L.stops[e.jam.k].name)} ל${esc(e.L.stops[e.jam.k + 1].name)}`;
      const status = e.closed ? (e.how === 'escalated' ? `<span class="bad">${e.kind === 'jam' ? 'הפקק החמיר' : 'הנסיעה בוטלה'}</span>` : '<span class="good">טופל ✓</span>')
        : `<span class="dscd${left < 90 ? ' hot' : ''}">⏳ ${mmss(left)}</span>`;
      return `<div class="dsinc k-${e.kind}${e.closed ? ' closed' : ''}"><div class="dsih"><span class="num sm" style="background:${e.L.color}">${esc(e.L.def.number)}</span><b>${k.icon} ${k.name}</b>${status}</div>
        <div class="dsib"><span class="dsiw">${what}</span>${act}</div>${e.closed ? '' : `<i class="dsbarL" style="width:${(frac * 100).toFixed(1)}%"></i>`}</div>`;
    }).join('');
    const html = `<div class="dsbar"><div class="dsgoalc">מטרה: ${GOAL}% בזמן ומעלה<span class="dsclock">${clk(t)} · נשארו ${hm(v.left)}</span></div><button type="button" data-h="help" class="dsq" aria-label="איך משחקים">?</button></div>
      <div class="dsstats">
        <span class="dsst ${pctCls}"><b>${v.decided ? v.pct + '%' : '—'}</b>בזמן</span>
        <span class="dsst${v.cancel ? ' bad' : ''}"><b>${v.cancel}</b>בוטלו</span>
        <span class="dsst${v.full ? ' warn' : ''}"><b>${v.full}</b>צפופים</span>
        <span class="dsst"><b>${v.res.bus}/${sh.res0.bus}</b>🚌 רזרבה</span>
        <span class="dsst"><b>${v.res.drv}/${sh.res0.drv}</b>נהגים</span>
      </div>${cards ? `<div class="dsincs">${cards}</div>` : ''}`;
    if (this.hud.dataset.html !== html) { this.hud.dataset.html = html; this.hud.innerHTML = html; }
  }
  hudClick(e) {
    const b = e.target.closest('[data-h]'); if (!b) return;
    const a = b.dataset.h, sh = this.shift;
    if (a === 'help') { this.openIntro(true); return; }
    if (a === 'pick') { this.openPick(); return; }
    const ev = sh?.find(+b.dataset.e); if (!ev) return;
    let ok = false;
    if (a === 'spare') ok = sh.spare(ev);
    if (a === 'fix') ok = this.ops.reserve(ev.L, ev.bus);
    if (a === 'jam') ok = sh.easeJam(ev);
    this.ctx.toast(ok ? ({ spare: 'נהג מחליף יוצא — האוטובוס ייצא תוך דקה', fix: 'אוטובוס רזרבה בדרך — יגיע תוך 2 דקות', jam: 'האוטובוס שמאחור יחכה 2 דקות בתחנה' })[a] : 'לא נשארו משאבים לזה');
    this.hud.dataset.html = ''; this.update();
  }
  showReport(r) {
    const B = this.best(), old = B[r.shift], better = !old || r.pct > old.pct;
    if (better) { B[r.shift] = { pct: r.pct, grade: r.grade, at: Date.now() }; put(BEST_KEY, JSON.stringify(B)); }
    const row = (k, v, cls = '') => `<tr class="${cls}"><th>${k}</th><td>${v}</td></tr>`;
    this.rep.firstChild.innerHTML = `<h2>סיכום ${esc(r.name)}</h2>
      <p class="hint"><span dir="ltr">${clk(r.from)}–${clk(r.to)}</span> · מדד אמינות</p>
      <div class="dsgrade g-${r.grade}"><b>${r.grade}</b><span>${r.pct}% בזמן</span></div>
      <p class="dsverdict ${r.goal ? 'good' : 'bad'}">${r.goal ? `✓ המטרה הושגה: ${GOAL}% בזמן ומעלה` : `✗ המטרה לא הושגה: צריך ${GOAL}% לפחות`}</p>
      <table class="dstable">
        ${row('נסיעות בזמן', `${r.ontime} מתוך ${r.decided}`)}
        ${row('איחרו יותר מ-5 דק\'', r.late, r.late ? 'warn' : '')}
        ${row('בוטלו', r.cancel, r.cancel ? 'bad' : '')}
        ${row('נסיעות צפופות', r.crowded, r.crowded ? 'warn' : '')}
        ${row('נוסעים שוויתרו', r.gaveUp, r.gaveUp ? 'warn' : '')}
        ${row('קנסות', nis(r.fines), r.fines ? 'bad' : '')}
        ${row('אירועים שטופלו', `${r.handled} · החמירו ${r.escalated}`)}
        ${row('רזרבות שנוצלו', `${r.used.bus}/${r.res0.bus} אוטובוסים · ${r.used.drv}/${r.res0.drv} נהגים`)}
      </table>
      <p class="hint">${better ? (old ? 'שיא חדש במשמרת הזו!' : 'זו התוצאה הראשונה שלכם במשמרת הזו.') : `השיא שלכם: ${old.grade} · ${old.pct}%`} קנס: ${nis(FINE_CANCEL)} לכל נסיעה שבוטלה, ${nis(FINE_STRAND)} לתקלה שנוסעים נתקעו בה.</p>
      <div class="row dsnav"><button type="button" data-r="close">סגירה</button><button type="button" data-r="again" class="primary">משמרת נוספת</button></div>`;
    this.rep.hidden = false;
    this.ctx.setSpeed(0);
  }
}
