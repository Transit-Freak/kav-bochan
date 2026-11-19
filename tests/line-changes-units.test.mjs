// בדיקות יחידה ל"מצגת לשינוי בקו" (line-changes/deck.js) — בלי דפדפן: כלל הרעש בשרטוט המסלול, ×N (כמה אוטובוסים
// באותה שעה), קיצור ימים, ושורת "לא נמצאה תחנה חלופית קרובה". הרצה: node --test tests/line-changes-units.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'line-changes');
const ctx = { console };
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'common.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'deck.js'), 'utf8') + ';this.LCDeck = LCDeck;', ctx);
const T = ctx.LCDeck._test;

// מסלול ישר צפונה, נקודה כל ~22 מ' (0.0002°), ומסלול שני שזז מזרחה בקטע אחד
const LAT0 = 32.08, LON0 = 34.83, DLAT = 0.0002;
const straight = (n) => Array.from({ length: n }, (_, i) => [LAT0 + i * DLAT, LON0]);
const bend = (n, from, to, east) => straight(n).map((p, i) => (i >= from && i <= to ? [p[0], LON0 + east] : p));
const M_PER_DEG_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const dir = (o, n, extra) => Object.assign({ old: { shape: o, stops: [] }, new: { shape: n, stops: [] }, removed: [], added: [] }, extra || {});

test('רעש: שרטוט מחדש קרוב (40 מ\' הצידה, לאורך 400 מ\') — לא שינוי', () => {
  const o = straight(80), n = bend(80, 20, 38, 40 / M_PER_DEG_LON);
  const d = dir(o, n);
  assert.equal(T.offRuns(n, o).length, 1, 'יש קטע שונה ב-GTFS');
  assert.equal(T.realRuns(d, 'new').length, 0);
});

test('שינוי אמיתי: רחוב מקביל 150 מ\' הצידה לאורך 600 מ\' — שני הצדדים נשארים (ישן מול חדש)', () => {
  const o = straight(100), n = bend(100, 20, 48, 150 / M_PER_DEG_LON);
  const d = dir(o, n);
  assert.equal(T.realRuns(d, 'new').length, 1);
  // הקטע הישן (על המסלול הישר) — לא רחוק מהחדש לכל אורכו, אבל הוא "הדרך הישנה" של אותו שינוי (PAIR_M)
  const d2 = dir(n, o);
  assert.equal(T.realRuns(d2, 'old').length, 1);
});

test('קטע קצר עם תחנה שבוטלה — תמיד שינוי', () => {
  const o = bend(80, 30, 36, 60 / M_PER_DEG_LON), n = straight(80);
  const d = dir(o, n, { removed: ['s1'] });
  d.old.stops = [{ code: 's1', ll: o[33] }];
  assert.equal(T.realRuns(d, 'old').length, 1);
  const d0 = dir(o, n);
  assert.equal(T.realRuns(d0, 'old').length, 0, 'בלי התחנה — רעש');
});

test('חלופה חדשה / שבוטלה — בלי סינון', () => {
  const o = straight(80), n = bend(80, 20, 30, 40 / M_PER_DEG_LON);
  assert.equal(T.realRuns(dir(o, n, { var: 'new' }), 'new').length, 1);
});

test('סימון כבישים מהבונה: same מוריד לרעש רק עד 150 מ\' סטייה; diff מעלה רק קטע ארוך שמתרחק', () => {
  const o = straight(100), n = bend(100, 20, 48, 120 / M_PER_DEG_LON);
  // הבונה מסמן כל קטע שונה, בשני הצדדים (נקודת האמצע שלו)
  const flags = (a, b, f) => [[a[34][0], a[34][1], f], [b[34][0], b[34][1], f]];
  assert.equal(T.realRuns(dir(o, n, { rdr: flags(o, n, 'same') }), 'new').length, 0, 'same, 120 מ\'');
  assert.equal(T.realRuns(dir(o, n), 'new').length, 1, 'אותו קטע בלי סימון — שינוי (כלל המרחק)');
  const far = bend(100, 20, 48, 400 / M_PER_DEG_LON);
  assert.equal(T.realRuns(dir(o, far, { rdr: flags(o, far, 'same') }), 'new').length, 1, 'same, 400 מ\' — נשאר שינוי');
  const short = bend(100, 32, 34, 90 / M_PER_DEG_LON);
  assert.equal(T.realRuns(dir(o, short, { rdr: [[short[33][0], short[33][1], 'diff'], [o[33][0], o[33][1], 'diff']] }), 'new').length, 0, 'diff קצר — רעש');
});

test('×N: אותה שעה פעמיים באותו יום — יציאה אחת עם n=2; בטבלת התגבורים (dn) — לפי הטבלה', () => {
  const it = { p: { line: '1' }, d: { days: [[420, 420, 480], [420, 480], [420, 480], [420, 480], [420, 480], [], []] } };
  const r = T.cuMerge([it], [0, 1, 2, 3, 4]);
  const e420 = r.ents.find((e) => e.m === 420), e480 = r.ents.find((e) => e.m === 480);
  assert.equal(e420.n, 2);
  assert.equal(e420.part, false, 'בכל הימים');
  assert.equal(e480.n, 1);
  const it2 = { p: { line: '1' }, d: { days: [[420], [], [], [], [], [], []], dn: [[[0, 3]], 0, 0, 0, 0, 0, 0] } };
  const r2 = T.cuMerge([it2], [0, 1, 2, 3, 4]);
  assert.equal(r2.ents[0].n, 3);
  assert.equal(r2.ents[0].part, true, 'רק ביום א׳');
});

test('קיצור ימים ושעה', () => {
  assert.equal(T.dShort([0, 1, 2, 3]), 'א׳–ד׳');
  assert.equal(T.dShort([1, 2]), 'ב׳–ג׳');
  assert.equal(T.hm2(1445), '00:05');
  assert.equal(T.hm2(7 * 60 + 5), '07:05');
});

test('אין תחנה קרובה — עם מספר הקו', () => {
  assert.equal(T.noNear({ _nn: 'של קו 999' }), 'לא נמצאה תחנה חלופית קרובה של קו 999 במסלול החדש');
});
