// בדיקות יחידה ל"מצגת לשינוי בקו" (line-changes/deck.js ו-deck-*.js) — בלי דפדפן: כלל הרעש בשרטוט המסלול, ×N (כמה אוטובוסים
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
// deck.js והחלקים שלו — באותו סדר כמו בדף (LCDeckLoad ב-index.html)
for (const f of ['deck.js', 'deck-sign.js', 'board-en.js', 'deck-en-c.js', 'deck-board.js', 'deck-maps.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
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

test('חלופות: לכל חלופה בשורה סימן (# ^ $…) וצבע משלה, וההערה מתחת לתא — עם הסימן', () => {
  const M = ctx.LCDeck.boardModel([ttPage('36011')], { ltype: LINES_FX.lt });
  const r = M.bands[0].rows.find((x) => x.alts && x.alts.length === 2);
  assert.deepEqual(J(r.alts.map((a) => a.L)), ['#', '^']);
  assert.match(M.note, /בסימן ובצבע \(# \^ \$…\)/);
  assert.notEqual(r.alts[0].c, r.alts[1].c);
  const e = r.cells.flatMap((x) => x.ents).find((x) => x.a);
  assert.equal(e.ac, r.alts.find((a) => a.a === e.a).c);
  const nt = r.cells.flatMap((x) => x.notes).find((x) => x.L);
  assert.ok(nt && nt.c);
});

test('מיון בשתי רמות: קודם לפי מפעיל (בסדר שנבחר) ואז לפי מספר קו; האפשרויות המוכנות — אותם מפתחות', () => {
  const ps = lodPages(), o = { ltype: LINES_FX.lt, pord: LOD_MK };
  const M = ctx.LCDeck.boardModel(ps, { ...o, bord: 'key', bk: ['op', 'num'], bflat: true });
  assert.equal(M.ord, 'op');
  assert.deepEqual(J(M.keys), ['op', 'num']);
  const rows = M.bands.flatMap((b) => b.rows), seen = [];
  rows.forEach((r) => { if (!seen.includes(r.p)) seen.push(r.p); });
  const ops = J(M.opList.map((x) => x.k));
  for (let i = 1; i < seen.length; i++) {
    const a = seen[i - 1], b = seen[i], oa = ops.indexOf(String(a.ag || a.op)), ob = ops.indexOf(String(b.ag || b.op));
    assert.ok(oa < ob || (oa === ob && parseInt(a.line, 10) <= parseInt(b.line, 10)), a.line + ' לפני ' + b.line);
  }
  // סדר מפעילים שנבחר: המפעיל האחרון — ראשון
  const last = ops[ops.length - 1], R = ctx.LCDeck.boardModel(lodPages(), { ...o, bord: 'key', bk: ['op', 'num'], bops: [last], bflat: true });
  assert.equal(String(R.bands[0].rows[0].p.ag || R.bands[0].rows[0].p.op), last);
  // בלי פסי יעד — פס אחד בלי כותרת
  assert.equal(M.bands.length, 1); assert.ok(M.bands[0].flat); assert.equal(M.bands[0].label, '');
  // "קודם לפי סוג קו, ואז לפי מספר" — כמו "לפי סוג קו" עם "בתוך כל סוג: לפי מספר קו"
  assert.deepEqual(seq(ctx.LCDeck.boardModel(lodPages(), { ...o, bord: 'key', bk: ['type', 'num'] })), seq(ctx.LCDeck.boardModel(lodPages(), { ...o, bsub: 'num' })));
  assert.equal(ctx.LCDeck.boardModel(lodPages(), { ...o, bord: 'key', bk: ['num', 'op'] }).ord, 'key');
});

test('ידני: קו שהועבר לפס של יעד אחר (bmb) מקבל שם פס משלו עם היעד שלו; פס שקו הועבר לאמצעו — מתחלק; אותו יעד — מצטרף', () => {
  const o = { ltype: LINES_FX.lt, pord: ['11464', '53009', '36011', '14384'] };
  const ps = () => ['36011', '53009', '11464', '14384'].map(ttPage);
  const M0 = ctx.LCDeck.boardModel(ps(), { ...o, bord: 'man', bman: ['11464', '53009', '36011', '14384'] });
  const tlv = M0.bands.find((b) => /תל אביב/.test(b.label)), bb = M0.bands.find((b) => /בני ברק/.test(b.label));
  // 384 (לוד – בני ברק) הועבר לסוף הפס של תל אביב — פס משלו מתחת ל-464, ולא מתחת לכותרת של תל אביב
  const M = ctx.LCDeck.boardModel(ps(), { ...o, bord: 'man', bman: ['11464', '14384', '53009', '36011'], bmb: { 14384: tlv.bk } });
  assert.deepEqual(seq(M), ['לוד – תל אביב יפו: 464', 'לוד – בני ברק: 384', 'הקווים העירוניים · לוד, רמלה: 9 11']);
  const seg = M.bands[1];
  assert.ok(seg.mvs); assert.equal(seg.host, tlv.k); assert.equal(seg.lk, bb.k); assert.notEqual(seg.k, tlv.k);
  // הכותרת של הפס — לפי הטקסט ששונה בפס המקורי שלו
  const R = ctx.LCDeck.boardModel(ps(), { ...o, bord: 'man', bman: ['11464', '14384', '53009', '36011'], bmb: { 14384: tlv.bk }, bd: { t: { ['band:' + bb.k]: 'לבני ברק' } } });
  assert.equal(R.bands[1].label, 'לבני ברק');
  // בראש הפס — פס משלו מעל הכותרת של תל אביב
  assert.deepEqual(seq(ctx.LCDeck.boardModel(ps(), { ...o, bord: 'man', bman: ['14384', '11464', '53009', '36011'], bmb: { 14384: tlv.bk } }))[0], 'לוד – בני ברק: 384');
  // באמצע פס: הפס מתחלק לשני חלקים, ולכל אחד הכותרת שלו
  const two = ['36011', '53009', '11464', '14384', '12509'].map(ttPage);
  const tlv2 = ctx.LCDeck.boardModel(two, { ...o, bord: 'man' }).bands.find((b) => /תל אביב/.test(b.label));
  const S = ctx.LCDeck.boardModel(two.concat([ttPage('11464')].map((p) => ({ ...p, makat: '99464', id: 'tt-99464' }))),
    { ...o, bord: 'man', bman: ['11464', '14384', '99464', '53009', '36011', '12509'], bmb: { 14384: tlv2.bk } });
  const sq = seq(S);
  assert.deepEqual(sq.slice(0, 3), ['לוד – תל אביב יפו: 464', 'לוד – בני ברק: 384', 'לוד – תל אביב יפו: 464']);
  assert.equal(new Set(J(S.bands.map((b) => b.k))).size, S.bands.length, 'מפתח ייחודי לכל חלק');
  assert.equal(S.bands[0].color, S.bands[2].color);
  // אותו יעד — מצטרף לפס (בלי חלק משלו): קו נוסף לתל אביב שהועבר לפס של תל אביב — באותו פס
  const J2 = ctx.LCDeck.boardModel(two.concat([{ ...ttPage('11464'), makat: '99464', id: 'tt-99464' }]),
    { ...o, bord: 'man', bman: ['11464', '14384', '53009', '36011', '12509', '99464'], bmb: { 99464: tlv2.bk } });
  assert.deepEqual(J([...new Set(J2.bands[0].rows.map((r) => r.p.makat))]), ['11464', '99464']);
  assert.ok(J2.bands.every((b) => !b.mvs && !b.host));
  // בלי פסי יעד, ובסדר אחר (לא ידני) — כמו קודם
  assert.equal(ctx.LCDeck.boardModel(ps(), { ...o, bord: 'man', bflat: true, bman: ['11464', '14384', '53009', '36011'], bmb: { 14384: tlv.bk } }).bands.length, 1);
  assert.ok(seq(ctx.LCDeck.boardModel(ps(), { ...o, bord: 'add', bmb: { 14384: tlv.bk } })).includes('לוד – בני ברק: 384'));
});

test('הזזה בסדר ידני (boardMove): קו לבד בפס משלו מדלג על פס שלם; קו שחולק פס — מתחלף עם השכן, ובקצה עובר לפס הסמוך בפס משלו', () => {
  // רמת גן: 1 2 3 · ירושלים: 4 5 · נתניה: 6 (מק"ט → הפס המקורי)
  const NAT = { 1: 'RG', 2: 'RG', 3: 'RG', 4: 'J', 5: 'J', 6: 'N' };
  const H = (bk, mks) => ({ k: bk, bk, mks, nat: Object.fromEntries(mks.map((m) => [m, NAT[m]])), segs: [{ k: bk, mks, mv: false, lk: bk }] });
  const view = (bs) => { const o = []; let last = null; bs.forEach((h) => h.mks.forEach((m) => { if (NAT[m] !== last) o.push('[' + (last = NAT[m]) + ']'); o.push(m); })); return o.join(' '); };
  const mv = (bs, mk, dir) => { const p = ctx.LCDeck.boardMove(bs, { mk }, dir); return p && J(p.bs).map((h) => ({ ...h, nat: Object.fromEntries(h.mks.map((m) => [m, NAT[m]])), segs: [{ k: h.k, mks: h.mks, mv: false, lk: h.bk }] })); };
  const B0 = [H('RG', ['1', '2', '3']), H('J', ['4', '5']), H('N', ['6'])];
  // 6 לבד בפס של נתניה: ↑ — מעל כל הפס של ירושלים (לא לאמצע), ↑ שוב — מעל רמת גן
  const a = mv(B0, '6', -1);
  assert.equal(view(a), '[RG] 1 2 3 [N] 6 [J] 4 5');
  const b = mv(a, '6', -1);
  assert.equal(view(b), '[N] 6 [RG] 1 2 3 [J] 4 5');
  assert.equal(mv(b, '6', -1), null, 'בראש הלוח — אין לאן');
  assert.equal(view(mv(b, '6', 1)), '[RG] 1 2 3 [N] 6 [J] 4 5');
  // 4 חולק את הפס עם 5: ↑ בראש הפס — מתחלף עם 3 (הקו האחרון של רמת גן), בפס משלו עם היעד שלו
  const c = mv(B0, '4', -1);
  assert.equal(view(c), '[RG] 1 2 [J] 4 [RG] 3 [J] 5 [N] 6');
  // ↑ שוב — לבד: מדלג על כל החלק שמעליו (1 2), ולא נכנס לאמצע
  const d = mv(c, '4', -1);
  assert.equal(view(d), '[J] 4 [RG] 1 2 3 [J] 5 [N] 6');
  // ↓ על 4 שלבד — מדלג על כל רמת גן, ומתאחד עם 5 (בלי שתי כותרות זהות צמודות)
  const e = mv(d, '4', 1);
  assert.equal(view(e), '[RG] 1 2 3 [J] 4 5 [N] 6');
  // קו בתוך פס — מתחלף עם השכן
  assert.equal(view(mv(B0, '2', -1)), '[RG] 2 1 3 [J] 4 5 [N] 6');
  // פס: מתחלף עם הפס הסמוך
  const f = ctx.LCDeck.boardMove(B0, { band: 'N' }, -1);
  assert.equal(view(J(f.bs)), '[RG] 1 2 3 [N] 6 [J] 4 5');
});

test('מתחת למוצא (bstop): הכל — התחנה והכיוון; רק כיוון — בלי התחנה; כלום — רק המוצא (גם בלוח של הודעה על שינוי)', () => {
  const rowsOf = (bstop) => ctx.LCDeck.boardModel([ttPage('36011'), ttPage('11464')], { ltype: LINES_FX.lt, bstop }).bands.flatMap((b) => b.rows);
  const all = rowsOf(), dir = rowsOf('dir'), none = rowsOf('none');
  assert.ok(all.every((r) => !r.hideS && !r.hideW) && all.some((r) => r.stop));
  assert.ok(dir.every((r) => r.stop === '' && r.hideS && !r.hideW) && dir.some((r) => r.toward));
  assert.deepEqual(J(dir.map((r) => r.toward)), J(all.map((r) => r.toward)));
  assert.ok(none.every((r) => r.stop === '' && r.toward === '' && r.hideW));
  // הכיוון נשאר למקרא החלופות (קו עם שני כיוונים)
  assert.deepEqual(J(none.map((r) => r.towardAll)), J(all.map((r) => r.toward)));
  assert.deepEqual(J(none.map((r) => r.origin)), J(all.map((r) => r.origin)));
  // ערך לא מוכר — כמו ברירת המחדל
  assert.deepEqual(J(rowsOf('x').map((r) => r.stop)), J(all.map((r) => r.stop)));
});

test('רוחב עמודות: עמודה עם הרבה שעות מקבלת יותר רוחב, והלוח נמוך יותר מאשר ברוחב שווה; ידני — לפי החלקים', () => {
  const T = ctx.LCDeck._test, tk = (n) => Array.from({ length: n }, () => 30);
  const cell = (c, n) => ({ c, s: 1, tk: tk(n), tx: [], nt: [], rm: [] });
  const mt = { n: 3, padH: 8, padV: 6, sp: 5, hT: 14, hN: 12, mN: 2, hR: 12, mR: 2,
    rows: [0, 1, 2, 3].map(() => ({ fl: 20, cells: [cell(0, 6), cell(1, 30), cell(2, 4)] })) };
  const ws = J(T.bdAutoW(mt, 450));
  assert.ok(Math.abs(ws.reduce((a, b) => a + b, 0) - 450) < 1);
  assert.ok(ws[1] > ws[0] && ws[1] > ws[2], ws.join(' '));
  assert.ok(T.bdCost(mt, ws) < T.bdCost(mt, [150, 150, 150]));
  const f = J(T.bdFracs({ o: 0.2, '01234': 0.5, '5': 0.3 }, [{ days: [0, 1, 2, 3, 4] }, { days: [5] }, { days: [6] }]));
  assert.ok(Math.abs(f.o + f.cols.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(f.cols[0] > f.cols[1]);
});

test('ריקון התא ומחיקת טקסט: השעות, ההערה והתחנה ריקות במודל (וכך גם באקסל)', () => {
  const p = ttPage('36011'), M0 = ctx.LCDeck.boardModel([p], { ltype: LINES_FX.lt });
  const r = M0.bands[0].rows.find((x) => x.alts && x.alts.length), i = r.cells.findIndex((x) => x.notes.length);
  const t = { [r.key + '|c' + i]: '', [r.key + '|n' + i]: '', [r.key + '|s']: '' };
  const M = ctx.LCDeck.boardModel([ttPage('36011')], { ltype: LINES_FX.lt, bd: { t } });
  const r2 = M.bands[0].rows.find((x) => x.key === r.key);
  assert.equal(r2.cells[i].txt, ''); assert.equal(r2.cells[i].ntxt, ''); assert.equal(r2.stop, '');
});

test('סימני חלופות: # ^ $ ~ + * כמו בלוחות של קווים, ואחרי שישה — כפולים', () => {
  const sym = ctx.LCDeck._test.altSym;
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(sym), ['#', '^', '$', '~', '+', '*']);
  assert.equal(sym(6), '##'); assert.equal(sym(7), '^^');
});

// ---------- לו"ז עדכני של קו שמשתנה השבוע: כל יום בשבוע מתאריך השינוי והלאה (LC.ttFromEff) ----------
test('ttFromEff: שינוי ביום ראשון 29.11, הלו"ז מיום שני 23.11 — ימים ב׳–ה׳ מהשבוע שאחריו (w1), ראשון מהשבוע הזה', () => {
  const r = { w: [0, 1, 1, 1, 1, 2, 3], w1: [0, 0, 0, 0, 0, 2, 3] };
  assert.deepEqual(J(ctx.LC.ttFromEff(r, '2026-11-23', '2026-11-29', true)), [0, 0, 0, 0, 0, 2, 3]);
  // שינוי ביום חמישי 26.11: ה׳ ושישי, שבת וראשון מהשבוע הזה (26–29.11); ב׳–ד׳ — מהשבוע שאחריו
  const r2 = { w: [10, 11, 12, 13, 14, 15, 16], w1: [20, 21, 22, 23, 24, 25, 26] };
  assert.deepEqual(J(ctx.LC.ttFromEff(r2, '2026-11-23', '2026-11-26', true)), [10, 21, 22, 23, 14, 15, 16]);
  // w1 חסר בכיוון — אותו לו"ז כמו השבוע הזה
  assert.deepEqual(J(ctx.LC.ttFromEff({ w: [0, 1, 1, 1, 1, 2, 3] }, '2026-11-23', '2026-11-29', true)), [0, 1, 1, 1, 1, 2, 3]);
});

test('ttFromEff: בלי צורך או בלי נתונים — null (הלו"ז מהיום, כמו קודם)', () => {
  const r = { w: [0, 1, 1, 1, 1, 2, 3], w1: [0, 0, 0, 0, 0, 2, 3] };
  assert.equal(ctx.LC.ttFromEff(r, '2026-11-23', '', true), null, 'בלי שינוי');
  assert.equal(ctx.LC.ttFromEff(r, '2026-11-23', '2026-11-23', true), null, 'השינוי היום — הלו"ז כבר מהשינוי');
  assert.equal(ctx.LC.ttFromEff(r, '2026-11-23', '2026-11-20', true), null, 'שינוי שעבר');
  assert.equal(ctx.LC.ttFromEff(r, '2026-11-23', '2026-11-30', true), null, 'שינוי אחרי השבוע שבלו"ז');
  assert.equal(ctx.LC.ttFromEff(r, '2026-11-23', '2026-11-29', false), null, 'קובץ ישן בלי w1');
  assert.equal(ctx.LC.ttFromEff({ w: r.w, w1: [0, null, 0, 0, 0, 2, 3] }, '2026-11-23', '2026-11-29', true), null, 'סוף הנתונים');
});

test('לוח לפי יעד של קו שמשתנה השבוע: 07:15 ו-07:30 בכל ימי החול, בלי סימון ימים, ו"החל מ-29.11" בשורת המשנה', () => {
  // כמו ttPick: tt של 384 מ-23.11 (ב׳–ה׳ — הלוח הישן, ראשון 29.11 — החדש), ו-w1 — ב׳–ה׳ מ-30.11 לפי הלוח החדש
  const e = JSON.parse(fs.readFileSync(path.join(FIXD, 'tt', '48.json'), 'utf8')).lines['14384'];
  const r1 = JSON.parse(JSON.stringify(e.d['1']));
  const neu = r1.L[0].map((m) => (m === 440 ? 435 : m === 460 ? 450 : m));   // 07:20 → 07:15, 07:40 → 07:30
  r1.L.push(neu); r1.A.push(r1.A[0]);
  const NEW = r1.L.length - 1;
  r1.w = [NEW, 0, 0, 0, 0, 1, 2]; r1.w1 = [NEW, NEW, NEW, NEW, NEW, 1, 2];
  const page = (fe) => {
    const W = fe ? ctx.LC.ttFromEff(r1, '2026-11-23', fe, true) : r1.w;
    const d = { dir: '1', od: r1.od, f: r1.f, fc: r1.fc, t: r1.t, cs: r1.cs, cn: r1.cn, sc: r1.sc, du: r1.du, days: W.map((i) => r1.L[i]), x: {}, v: r1.v, da: W.map((i) => r1.A[i] || 0), dn: W.map(() => 0) };
    return { id: 'tt-14384', kind: 'current', line: e.l, op: e.o, ag: e.a, makat: '14384', od: r1.od, eff: fe || '2026-11-23', valid: fe || '2026-11-23', fromEff: fe || '', until: '', hol: [], dirs: [d] };
  };
  const wk = (M) => M.bands[0].rows[0].cells[0];
  const old = wk(ctx.LCDeck.boardModel([page('')], { bsplit: false }));
  assert.ok(old.ents.some((x) => x.t === '07:15' && x.part), 'היום: 07:15 רק בחלק מהימים');
  const M = ctx.LCDeck.boardModel([page('2026-11-29')], { bsplit: false }), c = wk(M);
  for (const t of ['07:15', '07:30']) assert.ok(c.ents.some((x) => x.t === t && !x.part), t + ' בכל ימי החול');
  for (const t of ['07:20', '07:40']) assert.ok(!c.ents.some((x) => x.t === t), t + ' לא בלוח');
  assert.ok(c.ents.every((x) => !x.part), 'בלי סימון ימים');
  assert.equal(M.sub.split(' · ')[0], 'החל מ-29.11');
  assert.equal(M.fe, '2026-11-29');
  assert.equal(M.bands[0].rows[0].from, '', 'התאריך בשורת המשנה, לא ליד הקו');
  // בלוח עם קו נוסף שלא משתנה — "החל מ-29.11" ליד 384
  const M2 = ctx.LCDeck.boardModel([page('2026-11-29'), ttPage('11464')], { bord: 'add' });
  const r384 = M2.bands.flatMap((b) => b.rows).find((x) => x.p.makat === '14384');
  assert.equal(r384.from, 'החל מ-29.11'); assert.equal(M2.fe, '');
});

test('קו שמשתנה השבוע: גם לוח של השבוע עד השינוי (curPre) — ב׳–ה׳ מ-23.11 עד 28.11, בלי יום ראשון, עם השעות הישנות', () => {
  const e = JSON.parse(fs.readFileSync(path.join(FIXD, 'tt', '48.json'), 'utf8')).lines['14384'];
  const r1 = JSON.parse(JSON.stringify(e.d['1']));
  const neu = r1.L[0].map((m) => (m === 440 ? 435 : m === 460 ? 450 : m));
  r1.L.push(neu); r1.A.push(r1.A[0]);
  const NEW = r1.L.length - 1, W = ctx.LC.ttFromEff(Object.assign({}, r1, { w: [NEW, 0, 0, 0, 0, 1, 2], w1: [NEW, NEW, NEW, NEW, NEW, 1, 2] }), '2026-11-23', '2026-11-29', true);
  const dir = (days) => ({ dir: '1', od: r1.od, f: r1.f, fc: r1.fc, t: r1.t, cs: r1.cs, cn: r1.cn, sc: r1.sc, du: r1.du, days, x: {}, v: r1.v, da: days.map(() => 0), dn: days.map(() => 0) });
  // כמו ttPick: pre — ימים ב׳–ש׳ (23–28.11) מ-r.w, יום ראשון (29.11 — כבר מהשינוי) בלי נתונים
  const preDays = [[], r1.L[0], r1.L[0], r1.L[0], r1.L[0], r1.L[1], r1.L[2]];
  const p = { id: 'tt-14384', kind: 'current', line: e.l, op: e.o, ag: e.a, makat: '14384', od: r1.od, eff: '2026-11-29', valid: '2026-11-29', fromEff: '2026-11-29', until: '', hol: [],
    dirs: [dir(W.map((i) => r1.L[i]))], pre: { dirs: [dir(preDays)], valid: '2026-11-23', eff: '2026-11-23', wkUntil: '2026-11-28', dow: [1, 2, 3, 4, 5, 6], hol: [] } };
  assert.equal(ctx.LCDeck.curPre([ttPage('11464')]), null, 'בלי קו שמשתנה — לוח אחד, כמו קודם');
  const pre = ctx.LCDeck.curPre([p, ttPage('11464')]);
  assert.equal(pre[0].fromEff, ''); assert.equal(pre[0].wkUntil, '2026-11-28'); assert.equal(pre[1].wkUntil, '2026-11-28');
  assert.deepEqual(J(pre[1].dirs[0].days[0]), [], 'קו שלא משתנה — בלי יום ראשון בלוח של השבוע');
  const M = ctx.LCDeck.boardModel([pre[0]], { bsplit: false }), c = M.bands[0].rows[0].cells[0];
  assert.equal(M.cols[0].label, 'ימים ב׳–ה׳');
  for (const t of ['07:20', '07:40']) assert.ok(c.ents.some((x) => x.t === t && !x.part), t + ' בלוח של השבוע');
  assert.ok(!c.ents.some((x) => x.t === '07:15'), '07:15 רק מהשינוי');
  assert.equal(M.sub.split(' · ')[0], 'מ-23.11 עד 28.11'); assert.equal(M.wk, '2026-11-28'); assert.equal(M.subK, 'wsub');
  // הלוח מהשינוי — כמו קודם
  const M2 = ctx.LCDeck.boardModel([p], { bsplit: false });
  assert.equal(M2.sub.split(' · ')[0], 'החל מ-29.11'); assert.equal(M2.wk, ''); assert.equal(M2.cols[0].label, 'ימים א׳–ה׳');
});

// ---------- אפשרויות בלוח (24.11): בחירת תאריכים, קווים עם אות, מפעיל, תאריך סיום, ×2 ----------
// עמוד כמו ttPick: tv — היום הראשון בנתונים (שלישי 24.11), wd — הלו"ז לכל יום בשבוע מ-r.w, wd1 — מהשבוע שאחריו
function datePage(opt = {}) {
  const wk = [420, 480, 540], sat = [1200, 1260], sun1 = [420, 480, 540, 1300];   // ראשון 29.11 — עם נסיעה נוספת (הילולה)
  const tri = (L) => [L, 0, 0];
  const wd = [tri(sun1), tri(wk), tri(wk), tri(wk), tri(wk), tri([420]), tri(sat)];
  const wd1 = [tri(wk), tri(wk), tri(wk), tri(wk), tri(wk), tri([420]), tri(opt.sat2 || sat)];
  const d = { dir: '1', od: ['צפת', 'צפת'], f: 'תחנה', fc: '1', t: 'סוף', cs: ['צפת'], days: wd.map((x) => x[0]), x: {}, v: [], da: wd.map(() => 0), dn: wd.map(() => 0), xa: {}, xn: {}, wd, wd1, l: opt.l1 || '' };
  const dirs = [d];
  if (opt.l2) dirs.push({ ...d, dir: '2', l: opt.l2 });
  return { id: 'tt-88001', kind: 'current', line: '1א', op: 'נתיב אקספרס', ag: '14', makat: '88001', od: ['צפת', 'צפת'], eff: '2026-11-24', valid: '2026-11-24', tv: '2026-11-24', tvh: opt.hol || [], fromEff: '', until: '2026-12-10', hol: [], dirs };
}
const allTimes = (M) => M.bands[0].rows[0].cells.flatMap((c) => c.ents.map((e) => e.t));

test('בחירת תאריכים: בלי בחירה — כמו קודם; תאריך שהוצא — אותו יום בשבוע הבא', () => {
  const T = ctx.LCDeck._test, p = datePage();
  assert.deepEqual(J(T.bdOnDate(p, p.dirs[0], '2026-11-29'))[0], [420, 480, 540, 1300]);
  assert.deepEqual(J(T.bdOnDate(p, p.dirs[0], '2026-12-06'))[0], [420, 480, 540]);
  assert.equal(T.bdOnDate(p, p.dirs[0], '2026-12-08'), null, 'מחוץ לשבועיים');
  const M0 = ctx.LCDeck.boardModel([p], { bsplit: false });
  assert.ok(allTimes(M0).includes('21:40'), 'ברירת המחדל: הנסיעה של יום ראשון בלוח');
  const q = T.bdDatePage(p, { off: { '2026-11-29': 1 }, sep: {} });
  assert.deepEqual(J(q.dirs[0].days[0]), [420, 480, 540], 'ראשון — מ-6.12');
  assert.deepEqual(J(p.dirs[0].days[0]), [420, 480, 540, 1300], 'העמוד המקורי לא השתנה');
  const M = ctx.LCDeck.boardModel([p], { bsplit: false, bdays: { off: { '2026-11-29': 1 } } });
  assert.ok(!allTimes(M).includes('21:40'));
  assert.equal(M.cols[0].label, 'ימים א׳–ה׳');
});

test('בחירת תאריכים: עמודה נפרדת לכל מוצ״ש, עם התאריך, אחרי העמודה של שבת; בלי תאריך ליום — היום לא בכותרת', () => {
  const p = datePage({ sat2: [1200, 1260, 1320] });
  const M = ctx.LCDeck.boardModel([p], { bsplit: false, bdays: { sep: { '2026-11-28': 1, '2026-12-05': 1 } } });
  assert.deepEqual(J(M.cols.map((c) => c.label)), ['ימים א׳–ה׳', 'יום שישי', 'מוצאי שבת 28.11', 'מוצאי שבת 5.12'], 'שבת רגילה — אין תאריך שלא נפרד');
  const c = M.bands[0].rows[0].cells;
  assert.deepEqual(J(c[3].ents.map((e) => e.t)), ['20:00', '21:00', '22:00']);
  const M2 = ctx.LCDeck.boardModel([p], { bsplit: false, bdays: { sep: { '2026-12-05': 1 } } });
  assert.deepEqual(J(M2.cols.map((c) => c.label)), ['ימים א׳–ה׳', 'יום שישי', 'מוצאי שבת', 'מוצאי שבת 5.12']);
});

test('רשימת התאריכים והצעות: לו"ז חריג ביום ראשון — הצעה להוציא; לחיצה — כלום לא משתנה עד שמחילים', () => {
  const p = datePage(), ds = ctx.LCDeck.boardDates([p], {});
  assert.equal(ds.length, 14); assert.equal(ds[0].iso, '2026-11-24');
  const sun = ds.find((x) => x.iso === '2026-11-29');
  assert.ok(sun.used && sun.diff); assert.ok(!ds.find((x) => x.iso === '2026-12-06').used);
  const sg = J(ctx.LCDeck.boardSuggest([p], {}));
  assert.equal(sg.length, 1);
  assert.match(sg[0].txt, /29\.11 — לו״ז חריג/); assert.deepEqual(sg[0].off, ['2026-11-29']);
  assert.equal(ctx.LCDeck.boardSuggest([p], { bdays: { off: { '2026-11-29': 1 } } }).length, 0, 'אחרי שהוחלה — לא מוצעת שוב');
  // חג מהבונה שהשעות בו שונות — עמודה נפרדת (לא "חריג")
  const h = datePage({ hol: [['2026-11-29', 'erev', 'ערב חג']] });
  const sh = J(ctx.LCDeck.boardSuggest([h], {}));
  assert.deepEqual(sh.map((x) => x.txt), ['ערב חג 29.11: עמודה נפרדת']);
});

test('חנוכה (לוח עברי של הדפדפן): מוצ״ש 5.12 עם שעות שונות — הצעה לעמודה נפרדת, ובלי "לו״ז חריג" ל-28.11', () => {
  const sg = J(ctx.LCDeck.boardSuggest([datePage({ sat2: [1200, 1260, 1320] })], {}));
  const hk = sg.find((x) => /^חנוכה/.test(x.txt));
  assert.ok(hk, JSON.stringify(sg)); assert.equal(hk.txt, 'חנוכה: מוצ״ש 5.12 בעמודה נפרדת'); assert.deepEqual(hk.sep, ['2026-12-05']);
  assert.ok(!sg.some((x) => /28\.11/.test(x.txt)));
});

test('קווים עם אות: ברירת המחדל — שורה אחת בשם של הקו; "בנפרד" — 1 ו-1א, קו לכל מספר', () => {
  const p = datePage({ l1: '1א', l2: '1' });
  const M0 = ctx.LCDeck.boardModel([p], {});
  assert.deepEqual(J(M0.bands[0].rows.map((r) => r.line)), ['1א', '1א']);
  const M = ctx.LCDeck.boardModel([p], { bltr: true });
  assert.deepEqual(J(M.bands[0].rows.map((r) => r.line)), ['1', '1א']);
  assert.ok(M.bands[0].rows.every((r) => r.first), 'כל מספר — קו משלו');
  assert.equal(ctx.LCDeck._test.bdLtrSplit([datePage()], { bltr: true }).length, 1, 'בלי מספר לכל כיוון — כמו קודם');
});

test('בלי מפעיל, בלי תאריך סיום, בלי ×2', () => {
  const p = datePage(); p.dirs[0].wd[1] = [[420, 480, 540], 0, [[0, 2]]]; p.dirs[0].dn = p.dirs[0].wd.map((x) => x[2]);
  const r0 = ctx.LCDeck.boardModel([p], { bsplit: false }), row0 = r0.bands[0].rows[0];
  assert.equal(row0.op, 'נתיב אקספרס'); assert.equal(r0.until, '2026-12-10'); assert.match(r0.sub, /עד 10\.12\.2026/);
  assert.ok(row0.cells[0].ents.some((e) => e.n === 2)); assert.equal(r0.x2, true);
  const M = ctx.LCDeck.boardModel([p], { bsplit: false, bop: false, bend: false, bx2: false }), row = M.bands[0].rows[0];
  assert.equal(row.op, ''); assert.ok(row.hideOp);
  assert.equal(M.until, ''); assert.doesNotMatch(M.sub, /עד/); assert.equal(row.untilTxt, '');
  assert.ok(row.cells[0].ents.every((e) => e.n === 1)); assert.equal(M.x2, false);
});

test('הודעה על שינוי: חג עם לו"ז אחר (hx) בעמודה נפרדת רק כשבוחרים; בלי בחירה — כמו קודם', () => {
  const d = { dir: '1', od: ['צפת', 'צפת'], f: 'תחנה', fc: '1', t: 'סוף', cs: ['צפת'], days: [[420], [420], [420], [420], [420], [400], []], mk: [[], [], [], [], [], [], []], same: [0, 0, 0, 0, 0, 0, 0], hx: { '2026-12-01': [600, 660] } };
  const p = { id: 'x', makat: '1', line: '1', op: 'נתיב אקספרס', ag: '14', valid: '2026-11-29', eff: '2026-11-29', until: '', chg: 'timetable', od: ['צפת', 'צפת'], hol: [], dirs: [d] };
  const ed = { hol: [['2026-12-01', 'erev', 'ערב חג']], bsplit: false };
  assert.deepEqual(J(ctx.LCDeck.boardModel([p], ed).cols.map((c) => c.label)), ['ימים א׳–ה׳', 'יום שישי']);
  const M = ctx.LCDeck.boardModel([p], { ...ed, bdays: { sep: { '2026-12-01': 1 } } });
  assert.deepEqual(J(M.cols.map((c) => c.label)), ['ימים א׳–ה׳', 'ערב חג 1.12', 'יום שישי']);
  assert.deepEqual(J(M.bands[0].rows[0].cells[1].ents.map((e) => e.t)), ['10:00', '11:00']);
});

// ---------- לוח באנגלית (board-en.js): תרגום שמות, גרשיים, רשימת השמות בלי תרגום ----------
test('LCBoardEN.name: גרשיים אחידים, יעד "עיר_תחנה", שם שהוקלד, ורשימת החסרים', () => {
  const EN = ctx.LCBoardEN, ix = EN.index({ 'בי"ס בר לב/בן יהודה': 'Bar Lev School/Ben Yehuda', 'צפת': 'Safed', 'תחנה מרכזית': 'Central Station' }), miss = {};
  assert.equal(EN.name("בי''ס בר לב/בן יהודה", ix, null, miss), 'Bar Lev School/Ben Yehuda');
  assert.equal(EN.name('בי״ס בר לב/בן יהודה', ix, null, miss), 'Bar Lev School/Ben Yehuda');
  assert.equal(EN.name('צפת_תחנה מרכזית', ix, null, miss), 'Safed, Central Station');
  assert.equal(EN.name('נוף כנרת', ix, null, miss), 'נוף כנרת');
  assert.equal(EN.name('נוף כנרת', ix, { 'נוף כנרת': 'Nof Kinneret' }, miss), 'Nof Kinneret');
  assert.equal(EN.name('Safed', ix, null, miss), 'Safed', 'בלי עברית — כמו שהוא');
  assert.deepEqual(Object.keys(miss), ['נוף כנרת']);
  assert.equal(EN.days([0, 1, 2, 3, 4]), 'Sun–Thu'); assert.equal(EN.days([4]), 'Thu'); assert.equal(EN.days([0, 4]), 'Sun, Thu');
});

test('לוח באנגלית: טקסטים קבועים, שמות מהמילון, כיוון לפי היעד המפורסם, ושמות בלי תרגום ב-miss; בלי — כמו קודם', () => {
  const p = datePage(); p.until = '';
  p.dirs[0].h = 'צפת_תחנה מרכזית'; p.dirs[0].f = 'בית חולים זיו'; p.dirs[0].fc = '51041';
  const he = ctx.LCDeck.boardModel([p], { bsplit: false });
  assert.equal(he.en, false); assert.deepEqual(J(he.miss), []);
  assert.match(he.title, /^זמני נסיעות/); assert.equal(he.th.line, 'קו');
  const en = { 'צפת': 'Safed', 'בית חולים זיו': 'Ziv Hospital', 'תחנה מרכזית': 'Central Station' };
  const M = ctx.LCDeck.boardModel([p], { bsplit: false, blang: 'en', en });
  assert.equal(M.en, true);
  assert.equal(M.title, 'Timetable · Line \u20661א\u2069');
  assert.match(M.sub, /^Valid from 24\.11\.2026/);
  assert.deepEqual(J(M.cols.map((c) => c.label)), ['Days Sun–Thu', 'Friday', 'Saturday night']);
  assert.deepEqual(J([M.th.line, M.th.orig, M.lbl.off]), ['Line', 'From', 'No service']);
  const r = M.bands[0].rows[0];
  assert.equal(r.origin, 'Ziv Hospital'); assert.equal(r.toward, 'To Safed, Central Station'); assert.equal(r.op, 'Nateev Express');
  assert.equal(M.bands[0].label, 'City line · Safed');
  assert.deepEqual(J(M.miss), [], 'הכול מתורגם');
  const M2 = ctx.LCDeck.boardModel([p], { bsplit: false, blang: 'en', en: { 'צפת': 'Safed' } });
  assert.deepEqual(J(M2.miss).sort(), ['בית חולים זיו', 'צפת_תחנה מרכזית'].sort());
  assert.equal(M2.bands[0].rows[0].origin, 'בית חולים זיו', 'בלי תרגום — בעברית');
  const M3 = ctx.LCDeck.boardModel([p], { bsplit: false, blang: 'en', en: { 'צפת': 'Safed' }, ben: { 'בית חולים זיו': 'Ziv Medical Center' } });
  assert.equal(M3.bands[0].rows[0].origin, 'Ziv Medical Center', 'שם שהמשתמש הקליד');
  // טקסט שנערך בלוח בעברית — לא נכנס ללוח באנגלית
  const M4 = ctx.LCDeck.boardModel([p], { bsplit: false, blang: 'en', en, bd: { t: { title: 'כותרת' } } });
  assert.equal(M4.title, 'Timetable · Line \u20661א\u2069');
});

// ---------- ממשק באנגלית (ui-en.js): לכל מפתח יש אנגלית, ולכל טקסט בעברית בדף (index.html) יש תרגום ----------
test('ui-en.js: לכל טקסט במילון יש אנגלית, ולכל טקסט ותכונה בעברית ב-index.html יש תרגום', () => {
  const c2 = {}; vm.createContext(c2);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'ui-en.js'), 'utf8'), c2);
  const U = c2.LCUI;
  const empty = Object.keys(U.UI).filter((k) => !String(U.UI[k] || '').trim() || /[א-ת]/.test(U.UI[k].replace(/1א/g, '')));
  assert.deepEqual(empty, [], 'מפתחות בלי אנגלית');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const he = new Set();
  html.replace(/>([^<]*)</g, (m, t) => { t = t.replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim(); if (/[א-ת]/.test(t)) he.add(t); return m; });
  html.replace(/\s(?:placeholder|aria-label|title|alt)="([^"]*)"/g, (m, t) => { t = t.replace(/&quot;/g, '"'); if (/[א-ת]/.test(t)) he.add(t.trim()); return m; });
  const miss = [...he].filter((t) => U.tr(t) == null);
  assert.deepEqual(miss, [], 'טקסטים בדף בלי תרגום');
  assert.equal(U.tr('טוען 14 קווים…'), 'Loading 14 lines…');
  assert.equal(U.tr('  חזרה '), '  Back ');
  assert.equal(U.tr('צפת'), null, 'שם — לא במילון');
  assert.equal(U.file('לוח-זמנים-קו-1-2026-11-24'), 'timetable-line-1-2026-11-24');
});

/* בדיקת טקסטים בקוד: כל טקסט בעברית ב-line-changes/app*.js, editor.js ו-common.js שמופיע בממשק — יש לו אנגלית ב-ui-en.js.
   חלק מטקסט שמחובר לערך (מתחיל או נגמר ברווח / סוגר / נקודה) — נבדק כטקסט שלם בדף (תבנית ב-UIP), לא כאן.
   UI_LINT_SKIP — טקסטים שאינם ממשק: הנוסח של השקפים עצמם (פעלים ומשפטים בשקף, שקף טקסט חדש, שורת "הוכן על ידי"),
   שמות גיליונות באקסל (board-en.js — SHEET) ומילות מפתח בקובץ ה-PDF; וחלקים שהבדיקה לא מפרקת נכון (תכונה בתוך טקסט) */
const UI_LINT_SKIP = new Set(('">נפרד|$1 היא|$1 השתנה|) התחילה באותו כיוון|). אפשר לנסות שוב, או להוריד בכל זאת — עם חלקים ריקים במפה.|. אפשר לבחור "הכול".|' +
  '. חיצים להזזה, פלוס ומינוס לשינוי גודל, Delete למחיקה|<div class="bcw-h" role="separator" aria-orientation="vertical" aria-label="רוחב העמודה — לגרור" data-cb="|> להציג|' +
  'ביטל|ביטלו|האריך|האריכו|הוכן על ידי אדם פרטי · לא פרסום רשמי|הוסיף|הוסיפו|הלו״ז הקודם|העביר|העבירו|הפסיק לפעול|הפסיקו לפעול|התמונה|התמונות|חוזר|חוזרים|' +
  'יגיע|יגיעו|יחזור|יחזרו|ייסע|ייסעו|ימשיך|ימשיכו|יסיים|יסיימו|יעצור|יעצרו|יתחיל|יתחילו|כותרת השקף|כתבו כאן את הטקסט. אפשר להוסיף שורות, למחוק ולשנות הכול.|' +
  'לא השתנו|לו״ז|לו״ז חדש|לפי לוח הזמנים, חלופה|מאריך|מאריכים|מבטל|מבטלים|מגיע|מגיעים|מוסיף|מוסיפים|ממשיך|ממשיכים|מסיים|מסיימים|מעביר|מעבירים|משנה|משנים|' +
  'מתחיל|מתחילים|נוסע|נוסעים|עוצר|עוצרים|שהשתנו|שינה|שינו|תחבורה ציבורית, שינוי בקו|תחנה אחת עברה|תחנות עברו').split('|'));
test('ui-en.js: לכל טקסט בעברית בקוד של הממשק (app*.js, editor.js, common.js) יש אנגלית', () => {
  const c3 = {}; vm.createContext(c3);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'ui-en.js'), 'utf8'), c3);
  const miss = new Set();
  for (const f of ['app.js', 'app-settings.js', 'app-edit.js', 'app-images.js', 'app-export.js', 'editor.js', 'common.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      const lit = m[1]; if (!/[א-ת]/.test(lit)) continue;
      for (let p of lit.split(/<[^>]*>/)) {
        p = p.replace(/&quot;/g, '"');
        if (!/[א-ת]/.test(p)) continue;
        if (/^[\s(·,:\-–—]|[\s(·,:\-–—]$/.test(p) && (lit.startsWith(p) || lit.endsWith(p))) continue;
        const t = p.trim();
        if (!UI_LINT_SKIP.has(t) && c3.LCUI.tr(t) == null) miss.add(f + ': ' + t);
      }
    }
  }
  assert.deepEqual([...miss], [], 'טקסטים בממשק בלי אנגלית ב-ui-en.js');
});

// ---------- לוח באנגלית בתקציר / טבלה לכל קו / טבלה משולבת (deck-en-c.js) ----------
test('LCDeckEN: ימים, משפטים על לוח הזמנים, משך, תדירות ותיאור חלופה — באנגלית', () => {
  const X = ctx.LCDeckEN, D = ctx.LCDeck._in;
  D.ED = { blang: 'en', en: { 'לוד': 'Lod', 'הרצל': 'Herzl' } }; X.c_reset(D.ED);
  const WK = ['d0', 'd1', 'd2', 'd3', 'd4'];
  assert.equal(X.c_dtIn(WK), 'on weekdays'); assert.equal(X.c_dtIn(['d4']), 'on Thursday'); assert.equal(X.c_dtIn(['d6']), 'on Saturday and Saturday night');
  assert.equal(X.c_daysShort(['d0', 'd1', 'd3']), 'Sun–Mon and Wed'); assert.equal(X.c_daysShort(['d5']), 'Friday');
  assert.equal(X.c_dayName(WK), 'Weekdays (Sun–Thu)');
  const s = (n, f, l, pk, op) => ({ n, f, l, pk, op });
  assert.equal(X.c_ttLine({ t: WK, so: s(36, 360, 1320, 20, 30), sn: s(42, 330, 1410, 15, 30) }),
    '<b>On weekdays:</b> 42 trips a day instead of 36; every 15 min at peak times instead of every 20 min; first trip at 5:30 instead of 6:00; last trip at 23:30 instead of 22:00.');
  assert.equal(X.c_ttLine({ t: ['d5'], so: s(3, 400, 600), sn: s(0) }), '<b>On Friday:</b> The line will no longer run (until now: 3 trips).');
  assert.equal(X.c_smallLine({ t: WK }, { ad: [450], rm: [460], sh: [[440, 435]] }), '<b>On weekdays:</b> The 7:20 trip will leave at 7:15, a trip added at 7:30, and the 7:40 trip cancelled.');
  assert.equal(X.c_smallLine({ t: ['d4'] }, { ad: [600], rm: [590], sh: [] }), '<b>On Thursday:</b> The 9:50 trip will leave at 10:00.');
  assert.equal(X.c_newTtLine({ t: WK, sn: s(34, 330, 1380, 15, 30) }), '<b>On weekdays:</b> 34 trips, from 5:30 to 23:00. At peak times every 15 min, the rest of the day every 30 min.');
  assert.equal(X.c_durTxt(65), 'about 1 hr 5 min'); assert.equal(X.c_durTxt(40), 'about 40 min');
  assert.equal(X.c_bandTxt([360, 380, 400, 420]), 'every 20 min'); assert.equal(X.c_bandTxt([360]), '1 trip');
  assert.equal(X.c_altTxt('דרך הרצל'), 'via Herzl'); assert.equal(X.c_altTxt('לא דרך הרצל'), 'not via Herzl'); assert.equal(X.c_altTxt('במסלול אחר'), 'by another route');
  assert.equal(X.c_linesTxt(['5', '7', '9']), 'Lines 5, 7 and 9');
  assert.equal(X.c_N('לוד'), 'Lod'); assert.equal(X.c_N('רמלה'), 'רמלה');
  assert.deepEqual(Object.keys(X.c_miss), ['רמלה'], 'שם בלי תרגום — ברשימה');
  D.ED = {};
});

test('לו"ז עדכני באנגלית (תקציר, טבלה לכל קו): השקפים משמאל לימין, השמות מהמילון; בלי — העברית כמו קודם', () => {
  const opt = { form: 'deck', tt: { v: 'gen', f: 'table' }, ttc: 'sep' }, en = { 'לוד': 'Lod', 'בני ברק': 'Bnei Brak' };
  const cu = (s) => s.filter((x) => /^cu/.test(x.id)).map((x) => x.html).join('\n');
  const he = cu(ctx.LCDeck.build([ttPage('14384')], '', Object.assign({}, opt)));
  assert.match(he, /מלוד לבני ברק/); assert.doesNotMatch(he, /dir="ltr" lang="en"/);
  for (const v of ['gen', 'det']) {
    const h = cu(ctx.LCDeck.build([ttPage('14384')], '', Object.assign({}, opt, { tt: { v, f: 'table' }, blang: 'en', en })));
    assert.match(h, /From Lod to Bnei Brak/); assert.match(h, /dir="ltr" lang="en"/); assert.match(h, /Current timetable · Valid from/);
    const heb = (h.replace(/<[^>]+>/g, ' ').match(/[א-ת][^<>]*/g) || []).join(' | ');
    assert.ok(!/לוד|בני ברק|לוח זמנים|נסיעות|ימים/.test(heb), 'עברית בשקף: ' + heb);
  }
  for (const form of ['sign', 'status']) {
    const s = ctx.LCDeck.build([ttPage('14384')], '', Object.assign({}, opt, { form, tt: { v: 'det', f: 'table' }, blang: 'en', en })).map((x) => x.html).join('\n');
    assert.match(s, /Lod ↔ Bnei Brak/); assert.match(s, /Times are departures from the first stop/);
  }
});
