// הקו המודיע (alerts/app.js): מיזוג המפות של הודעות מקובצות, ומרחק של תחנה חלופית מהעקיפה
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../alerts/app.js', import.meta.url), 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const ctx = {};
vm.runInNewContext(cut('function mergeRcs', 'function nearestIdx') + cut('function distTo', 'function isMainR') +
  'this.mergeRcs = mergeRcs; this.distTo = distTo; this.noMapLines = noMapLines;', ctx);
const { mergeRcs, distTo, noMapLines } = ctx;
const plain = (x) => JSON.parse(JSON.stringify(x));

test('קו שכתוב בהודעה שנפתחה לא מקבל מסלול של הודעה אחרת בקבוצה (תל אביב 29.10, קו 12)', () => {
  const mine = { id: 'A', routes: [{ num: '572', rd: '572-1-#' }], xadd: ['s1'] };
  const other = { id: 'B', routes: [{ num: '12', rd: '12-1-#' }, { num: '24', rd: '24-1-#' }], xadd: ['s9'] };
  const rc = mergeRcs(['A', 'B'], [mine, other], ['A'], [['12', '', '', false], ['572', '572-1-#', '', true]]);
  assert.deepEqual(rc.routes.map((r) => r.num), ['572', '24']);
  assert.equal(rc.routes[1]._src, 'B');
  assert.deepEqual(plain(rc.xadd), ['s1']);
  assert.deepEqual(plain(rc.xs), { B: ['s9'] });
});

test('הודעה שאוחדה להודעה שנפתחה — כל rd שאין, עם התחנות החלופיות שלה', () => {
  const rc = mergeRcs(['A', 'C'], [{ id: 'A', routes: [{ num: '5', rd: '5-1-#' }] }, { id: 'C', routes: [{ num: '5', rd: '5-2-#' }], xadd: ['s2'] }], ['A', 'C'], []);
  assert.deepEqual(rc.routes.map((r) => r.rd), ['5-1-#', '5-2-#']);
  assert.equal(rc.routes[1]._src, undefined);
  assert.deepEqual(plain(rc.xadd), ['s2']);
});

test('מרחק לקו שבור (תחנה חלופית רחוקה מ-500 מ\')', () => {
  assert.ok(distTo([32.0, 34.005], [[32.0, 34.0], [32.0, 34.01]]) < 1);
  assert.ok(Math.abs(distTo([32.005, 34.005], [[32.0, 34.0], [32.0, 34.01]]) - 556.6) < 2);
});

test('קווים בהודעה בלי מסלול ובלי כפתור — "קווים נוספים בהודעה, בלי מפה" (תל אביב 29.10, 12 ו-604)', () => {
  const lines = [['572', '10572-2-#', '', true], ['12', '', '', false], ['604', '', '', false], ['12', '', '', false], ['24', '', '', false]];
  assert.deepEqual(plain(noMapLines(lines, [{ num: '572' }, { num: '24' }])), ['12', '604']);
  assert.deepEqual(plain(noMapLines(lines, [{ num: '572' }, { num: '12' }, { num: '604' }, { num: '24' }])), []);
});
