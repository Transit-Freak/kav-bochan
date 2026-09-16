'use strict';
/* "מה המכרז דורש" — האתר מסביר את המכרז כמו שאדם מסביר לאדם אחר: שאלה, ותשובה במשפט פשוט.
   כל משפט נבנה מתבנית קבועה ומהמספר שנקרא מהמסמך (fields-rules.json + השדות שאומתו במסמך),
   עם קישור לסעיף ולעמוד. לא מודל שפה: לכל שדה יש תבנית אחת. */

const heNum = n => typeof n === 'number' ? n.toLocaleString('he-IL') : String(n ?? '');
function money(v) {
  if (typeof v !== 'number') return heNum(v) + ' ₪';
  if (v >= 1e6 && v % 1e5 === 0) return (v / 1e6).toLocaleString('he-IL') + ' מיליון ₪';
  if (v >= 1e3 && v % 1e3 === 0 && v < 1e6) return (v / 1e3).toLocaleString('he-IL') + ' אלף ₪';
  return heNum(v) + ' ₪';
}
function months(v) {
  if (typeof v !== 'number') return heNum(v);
  if (v % 12 === 0) return v === 12 ? 'שנה' : `${v / 12} שנים`;
  if (v > 24) return `${v} חודשים (כ-${Math.round(v / 12)} שנים)`;
  return `${v} חודשים`;
}
function heDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : esc(iso || '');
}
let fieldSnips = { tenders: {} };
fetch('snips.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(r => { if (r) { fieldSnips = r; renderFeed(); } }).catch(() => {});
function snipLink(id, key) {
  const sn = fieldSnips.tenders?.[id]?.[key];
  return sn ? ` <a class="fsrc snip" href="${esc(sn.image)}" data-snip="${esc(sn.image)}" data-snip-page="${sn.page}">צילום מהמסמך 📷</a>` : '';
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-snip]'); if (!a || typeof routeDialog === 'undefined') return;
  e.preventDefault();
  routeDialog.innerHTML = `<form method="dialog"><button>סגירה ✕</button></form><h2 id="route-title">צילום מהמסמך · עמוד ${esc(a.dataset.snipPage)}</h2><p class="muted">ההדגשה הצהובה מסמנת את המקום שממנו נלקח המספר.</p><img class="snipimg" src="${esc(a.dataset.snip)}" alt="צילום מהמסמך">`;
  routeDialog.showModal();
});
function srcLink(f) {
  // הקישור אומר לאן הוא מוביל ("סעיף 38.2.2, עמוד PDF 79"), לא "מקור" סתמי
  const srcs = (f.sources || []).filter(x => /^https:\/\//.test(x.url || '')).slice(0, 2);
  return srcs.length ? ' ' + srcs.map(s => `<a class="fsrc" href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.locator || 'למסמך').replace('עמוד PDF', 'עמוד'))} ↗</a>`).join(' · ') : '';
}
const ok = f => f && ['verified', 'verified_conditional'].includes(f.status);
function condText(f) {
  // שדה "מותנה" (למשל תקופת ההפעלה לפי שלבים, תנאי סף לפי חלופות): התנאים כפי שנקראו, חודשים → שנים
  return (f.conditions || []).map(c => `${esc(c.label)}: ${c.comparison === 'gte' ? 'לפחות ' : c.comparison === 'lte' ? 'עד ' : ''}${formatFieldValue(c)}`).join('; ')
    .replace(/(\d+) חודשים/g, (_, n) => months(Number(n))).replace(/בחלופת סעיף [\d.]+:\s*/g, '').replace(/ · מע״מ: לא (?:צוין|חל)/g, '');
}
const S = v => esc(String(v ?? ''));
function condVal(c) {
  const pre = c.comparison === 'gte' ? 'לפחות ' : c.comparison === 'lte' ? 'עד ' : c.comparison === 'lt' ? 'פחות מ-' : '';
  if (typeof c.value === 'number' && c.currency) return pre + money(c.value);   // השנים כבר בכותרת התנאי
  return pre + formatFieldValue(c).replace(/ · מע״מ: לא (?:צוין|חל)/g, '').replace(/ · /g, ' ');
}
/* תנאי סף במשפט אחד ברור: "להחזיק לפחות 80 אוטובוסים (כל אחד עם לפחות 34 מושבים)" ולא "…עם לפחות 34 מושבים: לפחות 80" */
function eligLine(k, f) {
  const conds = f.status === 'verified_conditional' ? (f.conditions || []) : [{ label: '', value: f.value, comparison: 'gte', currency: f.currency, unit: f.unit, kind: f.kind, period: f.period }];
  return conds.map(c => {
    const val = condVal(c);
    const label = String(c.label || '').replace(/בחלופת סעיף [\d.]+:?\s*/, '').replace('בעלי הזיקה המוגדרים בסעיף', 'חברות קשורות').replace(/המציע/g, 'החברה').trim();
    if (k === 'eligibility.fleet') { const m = /לפחות (\d+) מושבים/.exec(label); return `להחזיק ${val} אוטובוסים${m ? ` (כל אחד עם לפחות ${m[1]} מושבים)` : ''}, בבעלות החברה או חברות קשורות.`; }
    if (k === 'eligibility.turnover') return `מחזור הכנסות ${label.replace(/^מחזור\s*/, '')}: ${val}.`;
    if (k === 'eligibility.equity') return `${label || 'הון עצמי'}: ${val}.`;
    if (k === 'eligibility.experience') return `ניסיון של ${val} ב${label.replace(/^ביצוע\s*/, '').replace(/^ניסיון\s*(?:ב|של)?\s*/, '')}.`;
    return `${label}: ${val}.`;
  }).map(esc).join(' ');
}

/* שאלות ותשובות. כל פונקציה מקבלת את השדות ומחזירה משפטים [טקסט, שדה] (או כלום אם אין נתון). */
const GROUPS = [
  ['מתי?', f => [
    ok(f['dates.publication']) && [`את המכרז פרסמו ב-${heDate(f['dates.publication'].value)}.`, f['dates.publication']],
    ok(f['dates.questions']) && [`שאלות אפשר לשאול עד ${heDate(f['dates.questions'].value)}.`, f['dates.questions']],
    ok(f['dates.submission']) && [`הצעות מגישים עד ${heDate(f['dates.submission'].value)}.`, f['dates.submission']],
    ok(f['dates.service_start']) && [`האוטובוסים אמורים להתחיל לנסוע ${S(f['dates.service_start'].value).replace('מההודעה על הזכייה', 'אחרי שיודיעו מי זכה')}.`, f['dates.service_start']],
  ]],
  ['לכמה זמן?', f => [
    ok(f['term.base']) && [f['term.base'].status === 'verified_conditional' ? `החוזה הוא ל-${condText(f['term.base'])}.` : `החוזה הוא ל-${months(f['term.base'].value)}.`, f['term.base']],
    ok(f['term.extension']) && [`המדינה יכולה להאריך אותו בעוד ${months(f['term.extension'].value)}.`, f['term.extension']],
  ]],
  ['מי יכול להתמודד?', f => [
    ok(f['eligibility.licenses']) && [`רק חברה עם ${S(f['eligibility.licenses'].value)}.`, f['eligibility.licenses']],
    ...['eligibility.fleet', 'eligibility.turnover', 'eligibility.equity', 'eligibility.experience'].map(k => ok(f[k]) && [eligLine(k, f[k]), f[k]]),
    ok(f['eligibility.drivers']) && [S(f['eligibility.drivers'].value), f['eligibility.drivers']],
    ok(f['guarantee.bid']) && [`כדי להגיש הצעה צריך להפקיד ערבות בנקאית של ${money(f['guarantee.bid'].value)} (כסף ביטחון, מקבלים אותו בחזרה אם לא זוכים).`, f['guarantee.bid']],
  ]],
  ['מה החברה שתזכה חייבת לעשות?', f => [
    ok(f['fleet.operating']) && [typeof f['fleet.operating'].value === 'number' ? `להפעיל לפחות ${heNum(f['fleet.operating'].value)} אוטובוסים, כולל רזרבה לתקלות.` : `${S(f['fleet.operating'].value)}.`, f['fleet.operating']],
    ok(f['fleet.reserve']) && [`להחזיק עוד ${heNum(f['fleet.reserve'].value)}% אוטובוסים ברזרבה, למקרה של תקלות.`, f['fleet.reserve']],
    ok(f['fleet.electric_share']) && [typeof f['fleet.electric_share'].value === 'number' ? (f['fleet.electric_share'].value === 100 ? 'כל האוטובוסים יהיו חשמליים.' : `לפחות ${f['fleet.electric_share'].value}% מהאוטובוסים יהיו חשמליים.`) : `אוטובוסים חשמליים: ${S(f['fleet.electric_share'].value)}.`, f['fleet.electric_share']],
    ok(f['fleet.max_age']) && [`לא להשתמש באוטובוס בן יותר מ-${heNum(f['fleet.max_age'].value)} שנים.`, f['fleet.max_age']],
    ok(f['fleet.accessibility']) && [`${S(f['fleet.accessibility'].value)} לאנשים עם מוגבלות.`, f['fleet.accessibility']],
    ok(f['fleet.seats']) && [`בכל אוטובוס לפחות ${heNum(f['fleet.seats'].value)} מקומות ישיבה.`, f['fleet.seats']],
    ok(f['service.routes']) && [`להפעיל ${heNum(f['service.routes'].value)} קווים${ok(f['service.variants']) ? ` (${heNum(f['service.variants'].value)} כיוונים וחלופות)` : ''}.`, f['service.routes']],
    ok(f['service.annual_km']) && [`לנסוע בסך הכול כ-${(f['service.annual_km'].value / 1e6).toLocaleString('he-IL', { maximumFractionDigits: 1 })} מיליון קילומטר בשנה.`, f['service.annual_km']],
    ok(f['guarantee.performance']) && [`להפקיד ערבות ביצוע של ${money(f['guarantee.performance'].value)}. אם היא לא תעמוד בהתחייבויות, המדינה תוכל לקחת מהכסף הזה.`, f['guarantee.performance']],
  ]],
  ['ומה עם הנהגים?', f => [
    ok(f['facts.driver_wage']) && [S(f['facts.driver_wage'].value), f['facts.driver_wage']],
    ok(f['facts.driver_grant']) && [S(f['facts.driver_grant'].value), f['facts.driver_grant']],
  ]],
  ['איך זורם הכסף?', f => [
    ok(f['facts.payment_model']) && [S(f['facts.payment_model'].value), f['facts.payment_model']],
    ok(f['facts.bid_type']) && [S(f['facts.bid_type'].value), f['facts.bid_type']],
    ok(f['price.indexation']) && [`התשלום מתעדכן לפי ${S(f['price.indexation'].value)}: כשהמחירים בענף עולים (דלק, שכר, רכבים), גם התשלום עולה.`, f['price.indexation']],
    ok(f['price.per_km']) && [`התמורה לקילומטר: ${formatFieldValue(f['price.per_km'])}.`, f['price.per_km']],
  ]],
  ['איך בוחרים את הזוכה?', f => [
    ok(f['scoring.price_weight']) && [`${heNum(f['scoring.price_weight'].value)}% מהציון זה המחיר${ok(f['scoring.quality_weight']) ? `, ו-${heNum(f['scoring.quality_weight'].value)}% זה איכות${f['scoring.quality_weight'].notes ? ` (${esc(f['scoring.quality_weight'].notes.replace(/^.*?: /, '').replace(/\.$/, ''))})` : ''}` : ''}.`, f['scoring.price_weight']],
    ok(f['scoring.minimum_quality']) && [S(f['scoring.minimum_quality'].value), f['scoring.minimum_quality']],
  ]],
  ['ואם החברה לא עומדת בדרישות?', f => [
    ok(f['penalties.amount']) && [(() => { const parts = String(f['penalties.amount'].value).split('; '); const tbl = parts.find(p => p.startsWith('טבלת')); const late = parts.find(p => p.startsWith('איחור')); return `${tbl ? `יש טבלת קנסות שנקבעו מראש (${tbl.replace('טבלת הקנסות ', '')}).` : 'יש קנסות שנקבעו מראש.'}${late ? ` למשל, ${late.replace('איחור בתחילת ההפעלה: ', 'איחור בתחילת ההפעלה עולה ')}.` : ''}`; })(), f['penalties.amount']],
  ]],
];

const GLOSSARY = [
  ['מפעיל', 'החברה שמפעילה את הקווים (מי שזכה במכרז).'],
  ['המציע / החברה המתמודדת', 'חברה שמגישה הצעה במכרז.'],
  ['אשכול', 'קבוצת קווים באזור אחד שמוציאים למכרז יחד.'],
  ['ערבות', 'כסף שהחברה מפקידה בבנק כביטחון. אם היא לא עומדת בהתחייבויות, המדינה יכולה לקחת אותו (במסמך זה נקרא "חילוט").'],
  ['סובסידיה', 'התשלום שהמדינה משלמת למפעיל על הפעלת הקווים.'],
  ['עלות ההפעלה השנתית', 'כמה עולה להפעיל את כל הקווים בשנה, לפי חישוב המדינה. על זה מתחרים.'],
  ['תוספת ק"מ', 'קילומטרים נוספים שהחברה מציעה לתת למדינה בלי תשלום, כדי לזכות.'],
  ['רזרבה תפעולית', 'אוטובוסים נוספים שמחזיקים למקרה של תקלות.'],
  ['מק"ט', 'מספר הזיהוי הרשמי של קו (לא מספר הקו שרואים על האוטובוס).'],
  ['המפקח על התעבורה', 'האחראי במשרד התחבורה שנותן את רישיונות הקווים.'],
  ['פיצויים מוסכמים', 'קנסות קבועים מראש שהחברה משלמת על כל הפרה (נסיעה שלא יצאה, איחור, אוטובוס מלוכלך…).'],
  ['תנאי סף', 'הדרישות המינימליות כדי בכלל להתמודד.'],
];
function renderGlossary() {
  return `<details class="glossary"><summary>מילון קצר</summary><dl>${GLOSSARY.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></details>`;
}

const keyOf = (fields, fld) => Object.keys(fields).find(k => fields[k] === fld) || '';
/* מכרז שהקובץ שלו לא ירד (צפון הנגב — gov.il חוסם): מה שנמצא בסריקה הקודמת, עם עמוד לכל פרט.
   מוצג רק כשאין לנו סעיפים שנקראו בקוד מהמסמך הזה. */
function renderPreviousScan(id) {
  const r = (typeof documentReviews !== 'undefined' ? documentReviews : {})[id];
  const haveSections = typeof sectionsIndex !== 'undefined' && sectionsIndex.tenders?.[id];
  if (!r || !r.sections?.length || haveSections) return '';
  const url = r.document?.url || '';
  return `<div class="plain-group prev-scan"><h4>מהסריקה הקודמת של המסמך</h4><p class="muted">הקובץ (${r.document?.pages || '?'} עמודים) חסום להורדה אוטומטית מאתר gov.il, ולכן הפרטים האלה הם מהסריקה הקודמת, לפי עמודים במסמך, ולא נקראו מחדש בקוד.</p><ul>${r.sections.map(sec => `<li><b>${esc(sec.title)}</b>: ${esc(sec.text)}${url ? ` <a class="fsrc" href="${esc(url)}#page=${sec.page}" target="_blank" rel="noopener">עמוד ${sec.page}${sec.alsoPages?.length ? `, ${sec.alsoPages.join(', ')}` : ''} ↗</a>` : ''}</li>`).join('')}</ul></div>`;
}
function renderPlainFacts(id) {
  if (typeof combinedFields !== 'function') return '';
  const f = combinedFields(id);
  const t = (typeof portalItems !== 'undefined' ? portalItems : []).find(x => x.id === id) || {};
  const cluster = ok(f['identity.cluster']) ? ` באזור ${S(f['identity.cluster'].value)}` : '';
  const what = t.type === 'taxi' ? 'קווי מוניות השירות' : 'קווי האוטובוס';
  const groups = GROUPS.map(([name, fn]) => {
    const items = fn(f).filter(Boolean);
    return items.length ? `<div class="plain-group"><h4>${esc(name)}</h4><ul>${items.map(([txt, fld]) => `<li>${txt}${srcLink(fld)}${snipLink(id, keyOf(f, fld))}</li>`).join('')}</ul></div>` : '';
  }).filter(Boolean);
  if (!groups.length) return '';
  // הסעיפים העיקריים שמצאנו: הסעיפים שמהם נלקחו העובדות, בניסוח הפשוט שלהם, עם קישור
  const secs = new Map();
  for (const fld of Object.values(f)) if (ok(fld) && fld.sec && !secs.has(fld.sec.n + (fld.sec.d || ''))) secs.set(fld.sec.n + (fld.sec.d || ''), fld);
  const keyList = [...secs.values()].sort((a, b) => a.sec.n.localeCompare(b.sec.n, undefined, { numeric: true })).slice(0, 14).map(fld => {
    const sc = fld.sec, isHeading = sc.t.length <= 48 && !/[,.]$/.test(sc.t);
    return `<li><b>${esc(sc.n)}</b> ${isHeading ? `<span class="ctitle">${esc(sc.t)}</span> — ` : ''}${esc(sc.brief || sc.t)} <small class="muted">${sc.d ? esc(sc.d) + ' · ' : ''}עמוד ${sc.p}</small>${srcLink(fld)}</li>`;
  });
  return `<section class="plainfacts"><h3>מה המכרז דורש</h3>
    <p class="plain-intro">המדינה מחפשת חברה שתפעיל את ${what}${cluster}. מי שיזכה יקבל תשלום מהמדינה, ובתמורה יצטרך לעמוד בדרישות האלה. ליד כל משפט קישור לסעיף במסמך.</p>
    <div class="plain-grid">${groups.join('')}</div>
    ${keyList.length ? `<details class="fielddetails keysecs"><summary>הסעיפים העיקריים · ${keyList.length}</summary><ol class="keysecs-list">${keyList.join('')}</ol></details>` : ''}
    ${renderPreviousScan(id)}
    ${typeof renderPendingFields === 'function' ? renderPendingFields(id) : ''}
    ${renderGlossary()}</section>`;
}
