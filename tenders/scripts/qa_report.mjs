#!/usr/bin/env node
/* לוח הביקורת של הבודק (שלמה 16.09: "שאתה תיצור את הפאנל שלך לבודק"): לא עמוד באתר — כלי שהבודק מריץ
   ומקבל ממנו, לכל מכרז ולכל עובדה, את המשפט כפי שהוא מוצג באתר (נבנה באותה תבנית — plain.js), את המשפט
   במסמך שממנו נלקח, מה סומן בצילום (snips.json → marks) ומה הביקורת האוטומטית אומרת (audit.json),
   ובודק בעצמו: מספר במשפט שאין לו מקור, "בקצרה" של ציטוט עם מספר שאין בציטוט, מילים במשפט שלא מהמסמך.
   פלט: tenders/qa.json (הכול) ודו"ח למסך של מה שצריך עין אנושית (--all מדפיס את כל המשפטים).
   שימוש: node tenders/scripts/qa_report.mjs [--all] [--tender <id>] */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const ONLY = args.includes('--tender') ? args[args.indexOf('--tender') + 1] : null;
const read = (name, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8')); } catch { return fallback; } };

/* plain.js מצפה לדפדפן — כאן רק מה שהוא צריך כדי לבנות משפטים */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function formatFieldValue(f) {
  const unitLabels = { years: 'שנים', months: 'חודשים', days: 'ימים', per_km: 'לק״מ', total: 'סכום כולל', percent: '', points: '', km: 'ק״מ', per_year: 'לשנה', per_month: 'לחודש' };
  let value = Array.isArray(f.value) ? f.value.join(', ') : typeof f.value === 'number' ? f.value.toLocaleString('he-IL') : f.value;
  if (f.kind === 'percent') value += ' %';
  if (f.kind === 'points') value += ' נקודות';
  if (f.currency) value += ' ' + (f.currency === 'ILS' ? '₪' : f.currency);
  if (f.unit && unitLabels[f.unit]) value += (['years', 'months', 'days'].includes(f.unit) ? ' ' : ' · ') + unitLabels[f.unit];
  if (f.period) value += ' · ' + f.period;
  return esc(value);
}
const sandbox = {
  esc, formatFieldValue, renderFeed() {}, console,
  fetch: () => new Promise(() => {}),
  document: { addEventListener() {} },
};
vm.createContext(sandbox);
// הצהרות const/let בקובץ לא הופכות לגלובליות — מייצאים אותן במפורש
vm.runInContext(fs.readFileSync(path.join(ROOT, 'plain.js'), 'utf8').replace(/^'use strict';/, '') + '\n;globalThis.__plain = { GROUPS, keyOf, ok };', sandbox, { filename: 'plain.js' });
const { GROUPS, keyOf, ok } = sandbox.__plain;

const strip = html => String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
// מספרים בטקסט: "20,000" → 20000; תאריך "22.1.2026" → 22, 1, 2026 (לא "22.1"); "7.2 מיליון" → 7.2
const numsOf = s => (String(s || '').replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g, '$1 $2 $3').match(/\d+(?:\.\d+)?/g) || []).map(x => x.replace(/^0+(?=\d)/, ''));
const HOW = { value: 'הערך עצמו', sentence: 'משפט המפתח', heading: 'כותרת הסעיף' };
// מילים שהתבניות מוסיפות (לא מהמסמך) — לא נחשבות "מילה שלא מהמקור"
const TEMPLATE_WORDS = new Set(`המדינה מחפשת חברה שתפעיל תשלום בתמורה יצטרך לעמוד בדרישות המכרז פרסמו שאלות אפשר לשאול הצעות מגישים
האוטובוסים אמורים להתחיל לנסוע אחרי שיודיעו זכה שלב אורך החוזה כולל תקופת ההכנה יכולה להאריך אותו רק חברה עם יכולה להתמודד
להחזיק בבעלות החברה חברות קשורות מחזור הכנסות ניסיון כדי להגיש הצעה צריך להפקיד ערבות בנקאית כסף ביטחון מקבלים בחזרה זוכים
להפעיל לפחות כולל הרזרבה התפעולית רזרבה תפעולית יהיו חשמליים לא להשתמש באוטובוס יותר לאנשים מוגבלות בכל אוטובוס מקומות ישיבה
קווים כיוונים וחלופות לנסוע בסך הכול מיליון קילומטר בשנה ביצוע היא תעמוד בהתחייבויות תוכל לקחת מהכסף הזה משלמת סובסידיה
מתעדכן לפי כשהמחירים בענף עולים דלק שכר רכבים גם עולה התמורה לקילומטר מהציון זה המחיר איכות יש טבלת קנסות שנקבעו מראש
למשל איחור בתחילת ההפעלה עולה לכל שבוע החברה המתמודדת צריכה ניקוד מינימלי שנים חודשים שנה ימים אלף מיליון עד`.split(/\s+/));

const rules = read('fields-rules.json', { tenders: {} }).tenders;
const snips = read('snips.json', { tenders: {}, quotes: {} });
const audit = read('audit.json', { tenders: {} }).tenders || {};
const lines = read('line-changes.json', { tenders: {}, sections: {} });
const titles = {};
for (const t of [...(read('tenders-feed.json', { items: [] }).items || []), ...(read('archive-feed.json', { items: [] }).items || [])]) titles[t.id] = t.title || t.id;

function allowedNumbers(fld, snip, all) {
  const out = new Set();
  const add = v => { if (typeof v === 'number' && isFinite(v)) { out.add(String(v)); if (v % 12 === 0) out.add(String(v / 12)); if (v % 1000 === 0) out.add(String(v / 1000)); if (v % 1e6 === 0) out.add(String(v / 1e6)); if (v >= 1e5) out.add((v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })); } else numsOf(v).forEach(n => out.add(n)); };
  add(fld.value);
  (fld.conditions || []).forEach(c => { add(c.value); numsOf(c.label).forEach(n => out.add(n)); });
  if (fld.sec) { numsOf(fld.sec.brief).forEach(n => out.add(n)); numsOf(fld.sec.t).forEach(n => out.add(n)); out.add(String(fld.sec.p)); numsOf(fld.sec.n).forEach(n => out.add(n)); }
  (fld.sources || []).forEach(s => numsOf(s.locator).forEach(n => out.add(n)));
  numsOf(fld.notes).forEach(n => out.add(n));
  (snip?.marks || []).forEach(m => numsOf(m).forEach(n => out.add(n)));
  for (const o of Object.values(all || {})) if (ok(o)) { add(o.value); (o.conditions || []).forEach(c => add(c.value)); }
  return out;
}

const report = { updated: new Date().toISOString().slice(0, 10), tenders: {} };
const flagged = [];
let noSnip = 0;
for (const [tid, f] of Object.entries(rules)) {
  if (ONLY && tid !== ONLY) continue;
  const tSn = snips.tenders?.[tid] || {}, tAu = audit[tid] || {};
  const rows = [];
  const covered = new Set();
  for (const [group, fn] of GROUPS) {
    let items = [];
    try { items = fn(f).filter(Boolean); } catch (e) { flagged.push(`${tid}: תבנית "${group}" נכשלה: ${e.message}`); }
    for (const [html, fld] of items) {
      const key = keyOf(f, fld); covered.add(key);
      const sentence = strip(html);
      const sn = tSn[key], au = tAu[key];
      const probs = [...(au?.problems || [])];
      // בלי צילום כי המסמך חסום להורדה או שהמקור הוא טבלה — אין מה לבדוק בעין; נספר בנפרד
      const unfixable = au?.status === 'missing' && /חסום|טבלת קווים/.test(au.reason || '');
      if (au?.status === 'missing' && !unfixable) probs.push('אין צילום: ' + (au.reason || ''));
      if (unfixable) noSnip++;
      const stray = numsOf(sentence).filter(n => !allowedNumbers(fld, sn, f).has(n));
      if (stray.length) probs.push(`מספר במשפט שלא נמצא במקור: ${stray.join(', ')}`);
      // מילים ארוכות במשפט שאינן מהתבנית, מהערך או מהמסמך — ניסוח שהוסיף משהו (כמו "למקרה של תקלות")
      const srcText = [fld.sec?.brief, fld.sec?.t, fld.value, fld.notes, ...(fld.conditions || []).map(c => c.label), ...(sn?.marks || [])].join(' ');
      const strayWords = (sentence.match(/[א-ת]{5,}/g) || []).filter(w => !TEMPLATE_WORDS.has(w) && !srcText.includes(w) && !srcText.includes(w.replace(/^[והבלמשכ]/, '')));
      if (strayWords.length >= 3) probs.push(`מילים במשפט שאינן מהמסמך ולא מהתבנית: ${[...new Set(strayWords)].slice(0, 6).join(', ')}`);
      const row = { group, key, sentence, source: fld.sec ? `סעיף ${fld.sec.n}, עמוד ${fld.sec.p}: ${fld.sec.brief || fld.sec.t || ''}` : (fld.sources?.[0]?.locator || ''), value: fld.status === 'verified_conditional' ? (fld.conditions || []).map(c => `${c.label}: ${c.value}`).join('; ') : fld.value, snip: sn ? { image: sn.image, page: sn.page, how: HOW[sn.how] || sn.how, marks: sn.marks } : null, problems: probs };
      rows.push(row);
      if (probs.length) flagged.push(`${titles[tid] ? titles[tid].slice(0, 40) : tid} · ${key}\n    משפט: ${sentence}\n    מקור: ${row.source.slice(0, 160)}\n    סומן: ${(sn?.marks || []).slice(0, 4).join(' | ') || '—'} (${sn ? HOW[sn.how] || sn.how : 'אין צילום'})\n    ${probs.map(p => '⚠ ' + p).join('\n    ')}`);
    }
  }
  for (const [key, fld] of Object.entries(f)) {
    if (covered.has(key) || !ok(fld) || !fld.sources?.length) continue;
    const au = tAu[key];
    rows.push({ group: '(בלי משפט באתר)', key, sentence: '', source: fld.sec ? `סעיף ${fld.sec.n}, עמוד ${fld.sec.p}: ${fld.sec.brief || ''}` : '', value: fld.value, snip: tSn[key] ? { image: tSn[key].image, page: tSn[key].page, how: HOW[tSn[key].how], marks: tSn[key].marks } : null, problems: au?.problems || [] });
  }
  // ציטוטים על קווים: "בקצרה" מול הציטוט המלא
  const quotes = [];
  for (const q of [...(lines.tenders?.[tid] || []), ...(lines.sections?.[tid] || [])]) {
    const brief = q.brief && q.brief.replace(/…$/, '') !== q.quote ? q.brief : '';
    const probs = [];
    const stray = brief ? numsOf(brief).filter(n => !numsOf(q.quote).includes(n)) : [];
    if (stray.length) probs.push(`מספר ב"בקצרה" שאין בציטוט: ${stray.join(', ')}`);
    const s = snips.quotes?.[`${String(q.sha256 || '').slice(0, 12)}:${q.page}`];
    if (!s) probs.push('אין צילום לעמוד');
    else if (s.marked < s.n) probs.push(`בעמוד ${s.n} ציטוטים, סומנו רק ${s.marked}`);
    quotes.push({ numbers: q.numbers, tags: q.tags, section: q.section, brief, quote: q.quote, page: q.page, snip: s?.image, problems: probs });
    if (probs.length) flagged.push(`${titles[tid] ? titles[tid].slice(0, 40) : tid} · ציטוט ${q.numbers ? 'קו ' + q.numbers.join(', ') : q.section} עמוד ${q.page}\n    בקצרה: ${brief.slice(0, 120)}\n    ציטוט: ${q.quote.slice(0, 160)}\n    ${probs.map(p => '⚠ ' + p).join('\n    ')}`);
  }
  report.tenders[tid] = { title: titles[tid] || tid, sentences: rows, quotes };
}
fs.writeFileSync(path.join(ROOT, 'qa.json'), JSON.stringify(report, null, 0) + '\n');

const nS = Object.values(report.tenders).reduce((n, t) => n + t.sentences.filter(r => r.sentence).length, 0);
const nQ = Object.values(report.tenders).reduce((n, t) => n + t.quotes.length, 0);
if (ALL) {
  for (const [tid, t] of Object.entries(report.tenders)) {
    console.log(`\n=== ${t.title.slice(0, 70)} (${tid})`);
    for (const r of t.sentences) console.log(`  [${r.group}] ${r.sentence || '(' + r.key + ' בלי משפט)'}\n      מקור: ${String(r.source).slice(0, 140)}\n      סומן: ${(r.snip?.marks || []).slice(0, 4).join(' | ') || '—'} (${r.snip?.how || 'אין צילום'})${r.problems.length ? '\n      ⚠ ' + r.problems.join(' ⚠ ') : ''}`);
  }
}
console.log(`\n${Object.keys(report.tenders).length} מכרזים · ${nS} משפטים באתר · ${nQ} ציטוטים על קווים · ${flagged.length} פריטים לעין אנושית · ${noSnip} בלי צילום כי המסמך חסום או שהמקור טבלה\n`);
for (const x of flagged) console.log('• ' + x + '\n');
