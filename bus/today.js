// היום עד עכשיו — כרטיס בראש מדד הדיוק. הנתונים: today.json, שנבנה כל 10 דקות ב-.github/workflows/bus-today.yml
// (tools/bus_reliability.py --partial) ונדחף כקובץ יחיד לענף bus-today — לא דרך פרסום האתר.
// רק נסיעות שהסתיימו לפי הלו"ז. הכרטיס נעלם כשאין קובץ, כשהוא של יום אחר או ישן מ-3 שעות;
// מעל שעה — מוצג עם "לא עודכן מאז". רענון כל 5 דקות כשהדף גלוי.
(function () {
  'use strict';
  const URL_ = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan/bus-today/today.json';
  const EVERY = 5 * 60 * 1000, STALE = 60 * 60 * 1000, GONE = 3 * 60 * 60 * 1000;
  const CATS = ['מוקדם (יותר מ-2 דק׳)', 'בזמן (עד 5 דק׳)', 'איחור 5–10 דק׳', 'איחור 10–20 דק׳', 'איחור מעל 20 דק׳'];
  const BCOL = ['var(--early)', 'var(--ok)', 'var(--warn)', 'var(--late)', 'var(--bad)'];
  const el = document.getElementById('today');
  if (!el) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = v => v == null ? '—' : Number(v).toLocaleString('he-IL');
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  const fmt1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('he-IL', {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const ilDay = d => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'}).format(d);
  const ilTime = d => new Intl.DateTimeFormat('he-IL', {timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false}).format(d);
  const routeName = l => String(l || '').replace(/-\d+[#א-ת]?$/, '').split('<->').map(x => x.replace(/-[^-]*$/, '').trim()).join(' ← ');
  // איחור ממוצע: שלילי = מוקדם — במילים, בלי סימן מינוס שקופץ בעברית
  const avgTxt = v => v == null ? '—' : v < 0 ? `${fmt1(-v)} דק׳ מוקדם` : `${fmt1(v)} דק׳`;
  const onCell = (on, n) => `${pct(on, n)}<span class="bar"><i style="width:${n ? Math.round(100 * on / n) : 0}%"></i></span>`;
  let last = 0;

  function render(j) {
    const t = j.tot, upd = new Date(j.updated), age = Date.now() - upd;
    const m = t.meas, late10 = t.c[3] + t.c[4];
    const stale = age > STALE;
    const ags = j.agencies.filter(a => a[2] > 0);
    el.innerHTML = `<div class="ptitle">היום עד עכשיו <span class="tdupd${stale ? ' old' : ''}">${stale ? 'לא עודכן מאז' : 'עודכן'} ${ilTime(upd)}</span></div>
      <p class="pdesc"><b>רק נסיעות שהסתיימו</b> לפי הלו״ז עד ${esc(j.until)}: נמדדו ${num(t.obs)} מתוך ${num(t.sched)} נסיעות (${num(m)} הגעות לתחנות).
        התמונה חלקית ומשתנה במשך היום; היום המלא מחושב בלילה ומופיע למטה.</p>
      <div class="tdk">
        <div><b>${pct(t.c[1], m)}</b><span>הגעות בזמן</span><small>עד 5 דק׳ אחרי הלו״ז, ולא יותר מ-2 דק׳ לפני</small></div>
        <div><b>${fmt1(Math.abs(t.s[0]))}<i>דק׳</i></b><span>${t.s[0] < 0 ? 'הקדמה ממוצעת בתחנה' : 'איחור ממוצע בתחנה'}</span><small>${t.s[1] != null ? `חצי מההגעות עד ${avgTxt(t.s[1])}` : ''}</small></div>
        <div><b>${pct(late10, m)}</b><span>איחור מעל 10 דק׳</span><small>מוקדם מדי: ${pct(t.c[0], m)}</small></div>
        <div><b>${pct(j.bunch[1], j.bunch[0])}</b><span>התקבצות</span><small>${num(j.bunch[1])} פעמים שני אוטובוסים של אותו קו הגיעו כמעט יחד</small></div>
      </div>
      <div class="dist">${t.c.map((v, i) => v ? `<i class="s${i}" style="flex:${v}" title="${CATS[i]}: ${num(v)}"></i>` : '').join('')}</div>
      <div class="legend">${t.c.map((v, i) => `<span><i style="background:${BCOL[i]}"></i>${CATS[i]} · ${pct(v, m)}</span>`).join('')}</div>
      <div class="cols2 tdcols">
        <div><div class="tdh">לפי מפעיל</div><div class="tblbox"><table><thead><tr><th>מפעיל</th><th>נסיעות</th><th>בזמן</th><th>מעל 10 דק׳</th></tr></thead><tbody>
          ${ags.map(a => `<tr><td class="nm">${esc(a[0])}</td><td>${num(a[2])}</td><td>${onCell(a[4][1], a[3])}</td><td>${pct(a[4][3] + a[4][4], a[3])}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div><div class="tdh">הקווים הכי פחות מדייקים היום</div>${j.worst.length ? `<div class="tblbox"><table class="tdw"><thead><tr><th>קו</th><th>נסיעות</th><th>בזמן</th><th>איחור ממוצע</th></tr></thead><tbody>
          ${j.worst.map(w => `<tr><td><b>${esc(w[1])}</b><small class="tdrt">${esc(w[3])} · ${esc(routeName(w[2]))}</small></td><td>${num(w[6])}</td><td>${onCell(w[8][1], w[7])}</td><td>${avgTxt(w[9])}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">עוד אין מספיק נסיעות שהסתיימו</div>'}</div>
      </div>`;
    el.hidden = false;
  }

  function refresh() {
    last = Date.now();
    fetch(URL_ + '?t=' + Math.floor(Date.now() / 60000), {cache: 'no-store'})
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        const ok = j && j.tot && j.tot.meas > 0 && j.d === ilDay(new Date()) && Date.now() - new Date(j.updated) < GONE;
        if (ok) render(j); else el.hidden = true;
      })
      .catch(() => {});   // תקלת רשת רגעית — נשאר מה שמוצג
  }

  refresh();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, EVERY);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > EVERY) refresh(); });
})();
