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

test('פיצול ימי חול: יום ה׳ שונה בכמה קווים — עמודה משלו; נסיעה אחת שונה — בלי פיצול', () => {
  const wkday = [420, 480, 540, 600, 660, 720];
  const row = (thu) => ({ d: { days: [wkday, wkday, wkday, wkday, thu, [], []] } });
  const thu = [420, 500, 560, 620, 700, 760];
  const many = Array.from({ length: 6 }, (_, i) => row(i < 4 ? thu : wkday));
  assert.deepEqual(JSON.parse(JSON.stringify(T.bdWkSplit(many))), [[0, 1, 2, 3], [4]]);
  const one = Array.from({ length: 6 }, (_, i) => row(i === 0 ? wkday.concat([1300]) : wkday));
  assert.deepEqual(JSON.parse(JSON.stringify(T.bdWkSplit(one))), [[0, 1, 2, 3, 4]]);
});

// ---------- לוח לפי יעד: סוג הקו, סדר הקווים וצבע/אות לכל חלופה (מהנתונים הקבועים של לוד) ----------
const FIXD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'line-changes', 'data');
const LINES_FX = JSON.parse(fs.readFileSync(path.join(FIXD, 'lines.json'), 'utf8'));
// כמו ttPick ב-app.js: עמוד "לו"ז עדכני" לקו מתוך tt/<מק"ט % 64>.json
function ttPage(mk) {
  const e = JSON.parse(fs.readFileSync(path.join(FIXD, 'tt', (+mk % 64) + '.json'), 'utf8')).lines[mk];
  const dirs = Object.keys(e.d).sort().map((k) => {
    const r = e.d[k], A = r.A || [], N = r.N || [];
    return { dir: k, od: r.od, f: r.f, fc: r.fc || '', t: r.t, cs: r.cs, cn: r.cn || null, sc: r.sc || null, du: r.du, days: r.w.map((i) => r.L[i] || []), x: {},
      v: r.v || [], da: r.w.map((i) => A[i] || 0), dn: r.w.map((i) => N[i] || 0) };
  });
  return { id: 'tt-' + mk, kind: 'current', line: e.l, op: e.o, ag: e.a, makat: mk, od: dirs[0].od, eff: '2026-11-19', valid: '2026-11-19', until: '', hol: [], dirs };
}
const LOD_MK = ['36011', '68005', '53009', '32012', '31019', '14384', '12408', '11251', '15174', '21134', '36081', '11464', '12509', '11884'];
const lodPages = () => LOD_MK.map(ttPage);
const J = (x) => JSON.parse(JSON.stringify(x));   // מערכים מה-vm — להשוואה
const seq = (M) => J(M.bands.map((b) => (b.sec ? '§' + b.sec + ' ' : '') + b.label + ': ' + b.rows.map((r) => r.line).filter((x, i, a) => a.indexOf(x) === i).join(' ')));
const bandOf = (M, line) => M.bands.find((b) => b.rows.some((r) => r.line === line));

test('סוג קו לפי משרד התחבורה: פרקים עירוני / בין-עירוני / אזורי, בסדר שנבחר; סוג מוסתר — לא בלוח', () => {
  const M = ctx.LCDeck.boardModel(lodPages(), { ltype: LINES_FX.lt, pord: LOD_MK });
  assert.equal(M.ord, 'type');
  assert.deepEqual(J(M.bands.filter((b) => b.sec).map((b) => b.secLabel)), ['קווים עירוניים', 'קווים בין-עירוניים', 'קווים אזוריים']);
  assert.deepEqual(J(M.tcount), { u: 4, i: 7, r: 3 });
  assert.match(bandOf(M, '11').label, /^הקווים העירוניים/);
  const R = ctx.LCDeck.boardModel(lodPages(), { ltype: LINES_FX.lt, pord: LOD_MK, btypes: ['r', 'u', 'i'], bthide: { i: 1 } });
  assert.deepEqual(J(R.bands.filter((b) => b.sec).map((b) => b.sec)), ['r', 'u']);
  assert.ok(!bandOf(R, '464'));
});

test('בלי סוג בנתונים: קו בין ערים סמוכות שרוב התחנות שלו בעיר אחת (11, 5) — עירוני; לוד–תל אביב (464) ובית שמש–לוד (509) — לא', () => {
  const ps = ['14384', '11464', '12509', '53009', '36011', '68005'].map(ttPage);
  const M = ctx.LCDeck.boardModel(ps, { bord: 'add', pord: ps.map((p) => p.makat) });
  for (const l of ['11', '5', '9']) assert.ok(bandOf(M, l).local, l);
  for (const l of ['464', '509', '384']) assert.ok(!bandOf(M, l).local, l);
  // בלי מספר התחנות בכל עיר (נתונים ישנים) — כמו קודם: 11 ו-5 בפס "לוד – רמלה"
  const old = ps.map((p) => ({ ...p, dirs: p.dirs.map((d) => ({ ...d, cn: null })) }));
  assert.ok(!bandOf(ctx.LCDeck.boardModel(old, { bord: 'add' }), '11').local);
});

test('סדר הקווים: לפי הסדר שהוספתם, לפי יעד, לפי מספר, ידני', () => {
  const o = { ltype: LINES_FX.lt, pord: ['11464', '53009', '36011', '14384'] };
  const ps = ['36011', '53009', '11464', '14384'].map(ttPage);
  assert.deepEqual(seq(ctx.LCDeck.boardModel(ps, { ...o, bord: 'add' })), ['לוד – תל אביב יפו: 464', 'הקווים העירוניים · לוד, רמלה: 9 11', 'לוד – בני ברק: 384']);
  assert.deepEqual(seq(ctx.LCDeck.boardModel(ps, { ...o, bord: 'dest' })), ['לוד – בני ברק: 384', 'לוד – תל אביב יפו: 464', 'הקווים העירוניים · לוד, רמלה: 9 11']);
  assert.deepEqual(seq(ctx.LCDeck.boardModel(ps, { ...o, bord: 'num' })), ['הקווים העירוניים · לוד, רמלה: 9 11', 'לוד – בני ברק: 384', 'לוד – תל אביב יפו: 464']);
  assert.deepEqual(seq(ctx.LCDeck.boardModel(ps, { ...o, bord: 'man', bman: ['14384', '36011', '53009', '11464'] })), ['לוד – בני ברק: 384', 'הקווים העירוניים · לוד, רמלה: 11 9', 'לוד – תל אביב יפו: 464']);
});

test('חלופות: לכל חלופה בשורה אות וצבע משלה, וההערה מתחת לתא — עם האות', () => {
  const M = ctx.LCDeck.boardModel([ttPage('36011')], { ltype: LINES_FX.lt });
  const r = M.bands[0].rows.find((x) => x.alts && x.alts.length === 2);
  assert.deepEqual(J(r.alts.map((a) => a.L)), ['א׳', 'ב׳']);
  assert.notEqual(r.alts[0].c, r.alts[1].c);
  const e = r.cells.flatMap((x) => x.ents).find((x) => x.a);
  assert.equal(e.ac, r.alts.find((a) => a.a === e.a).c);
  const nt = r.cells.flatMap((x) => x.notes).find((x) => x.L);
  assert.ok(nt && nt.c);
});
