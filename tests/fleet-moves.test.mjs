// בדיקות ללוגיקת "מעברים" של צי הרכבים (fleet/moves.js)
// הרצה: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FM = require('../fleet/moves.js');

// המקרה האמיתי ששאלו עליו (16.09): סולאריס מפרקית 8130484 — "קווים" על קווי
// פתח תקווה–תל אביב, ואז מטרופולין על קווי אלעד–תל אביב (חפיפה של חודש בשידורים)
const recs = [
  { op: 18, first: '2023-01-02', last: '2023-10-02', days: 190 },
  { op: 15, first: '2023-08-31', last: '2026-09-01', days: 700 },
];
const mv = { '18': [['פתח תקווה', 'תל אביב יפו'], null], '15': [['אלעד', 'תל אביב יפו'], null] };

test('החלפת חברה נחשבת מעבר, עם התאריכים הנכונים', () => {
  const m = FM.moves(recs, mv);
  const op = m.find((x) => x.from === 'op:18' && x.to === 'op:15');
  assert.ok(op, 'קווים → מטרופולין');
  assert.equal(op.left, '2023-10-02');
  assert.equal(op.arrived, '2023-08-31');
  assert.ok(!m.some((x) => x.from === 'op:15' && x.to === 'op:18'), 'לא בכיוון ההפוך');
});

test('עיר → עיר בין חברות: פתח תקווה → אלעד כן, תל אביב → תל אביב לא', () => {
  const m = FM.moves(recs, mv);
  assert.ok(m.some((x) => x.from === 'city:פתח תקווה' && x.to === 'city:אלעד'));
  assert.ok(!m.some((x) => x.from === 'city:תל אביב יפו' && x.to === 'city:תל אביב יפו'));
  // חברה → עיר: "עזב את קווים והגיע לאלעד"
  assert.ok(m.some((x) => x.from === 'op:18' && x.to === 'city:אלעד'));
});

test('שתי חברות במקביל שנים (קבוצת אגד) — לא מעבר', () => {
  const r = [
    { op: 3, first: '2024-09-20', last: '2026-05-07', days: 300 },
    { op: 135, first: '2024-09-20', last: '2026-04-05', days: 280 },
    { op: 14, first: '2025-07-19', last: '2026-09-01', days: 200 },
  ];
  const m = FM.moves(r, null);
  assert.equal(m.length, 0, JSON.stringify(m));
});

test('בליפ של יום אצל חברה אחות מסונן עם minDays', () => {
  const r = [
    { op: 35, first: '2023-01-01', last: '2026-09-01', days: 900 },
    { op: 14, first: '2024-08-27', last: '2024-08-27', days: 1 },
  ];
  assert.equal(FM.moves(r, null).length, 0, 'תקופה שמוכלת בתוך תקופה אחרת אינה מעבר');
  const r2 = [
    { op: 14, first: '2023-01-01', last: '2024-02-05', days: 3 },
    { op: 35, first: '2024-02-06', last: '2026-09-01', days: 500 },
  ];
  assert.equal(FM.moves(r2, null).length, 1);
  assert.equal(FM.moves(r2, null, { minDays: 5 }).length, 0);
});

test('בתוך אותה חברה: מעיר לעיר רק עם רישום חודשים, ורק אם העיר הראשונה נגמרה', () => {
  const r = [{ op: 15, first: '2025-06-01', last: '2026-09-01', days: 400 }];
  const i = (y, m) => (y - 2020) * 12 + (m - 1);
  const cm = { 'באר שבע': [i(2025, 6), i(2025, 12)], 'אלעד': [i(2026, 2), i(2026, 9)], 'תל אביב יפו': [i(2025, 6), i(2026, 9)] };
  const m = FM.moves(r, { '15': [Object.keys(cm), cm] });
  assert.deepEqual(m.map((x) => x.from + '>' + x.to), ['city:באר שבע>city:אלעד']);
  assert.equal(m[0].left, '2025-12-31');
  assert.equal(m[0].arrived, '2026-02-01');
  // בלי רישום חודשים — אין מעברים בתוך אותה חברה
  assert.equal(FM.moves(r, { '15': [Object.keys(cm), null] }).length, 0);
});

test('המרת מדד חודש לתאריכים', () => {
  assert.equal(FM.mFirst(0), '2020-01-01');
  assert.equal(FM.mLast(1), '2020-02-29');
  assert.equal(FM.mLast(80), '2026-09-30');
});
