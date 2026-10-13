// קובץ תקופה (bus/data/periods/N.json, tools/bus_periods.py) חייב לתת ב-mergeDays בדיוק את מה
// שנותנים קבצי הימים שלו אחד-אחד (שלמה 13.10: "30 יום לוקח מעל דקה עד שהוא נטען").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const src = fs.readFileSync(new URL('bus/app.js', root), 'utf8');
// מוציאים מ-app.js רק את הפונקציות של הצבירה (העמוד עצמו רץ בדפדפן)
function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  let j = src.indexOf('{', i), depth = 0;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i, j + 1);
}
const code = ['emptyAgg', 'addReach', 'addVehicleData', 'addAgg', 'finish', 'lineLabel', 'mergeDays'].map(grab).join('\n');
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const has = p => fs.existsSync(new URL(p, root));

// Set → מערך ממוין, ומספרים מעוגלים (סכום של שברים בסדר אחר)
const norm = v => v instanceof Set ? [...v].sort() : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v;
const canon = o => JSON.parse(JSON.stringify(o, (k, v) => norm(v)));

for (const n of [7]) {
  const file = `bus/data/periods/${n}.json`;
  test(`period ${n} merges to the same result as its days`, {skip: !has(file)}, () => {
    const P = read(file);
    const missing = P.days.filter(d => !has(`bus/data/days/${d}.json`));
    if (missing.length) return;   // ימים ישנים שנמחקו מהמאגר
    const ctx = {CAT: has('bus/data/routes.json') ? read('bus/data/routes.json') : {}};
    vm.createContext(ctx);
    vm.runInContext(code + '\nthis.mergeDays = mergeDays;', ctx);
    const a = ctx.mergeDays(P.days.map(d => read(`bus/data/days/${d}.json`)));
    const b = ctx.mergeDays([P]);
    // הגרועות והדוגמאות: בקובץ התקופה רק השורות שהדף יכול להציג
    a.worst = a.worst.slice(0, 40); b.worst = b.worst.slice(0, 40);
    a.Bn.ex = a.Bn.ex.slice(0, 30); b.Bn.ex = b.Bn.ex.slice(0, 30);
    const A = canon(a), B = canon(b);
    // רשימת ההבדלים (ולא deepEqual על כל העץ — הודעת השגיאה שלו על אובייקט כזה ענקית)
    const diffs = [];
    const walk = (x, y, path) => {
      if (diffs.length >= 20) return;
      if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(`${path}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); return; }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path + '.' + k);
    };
    walk(A, B, 'M');
    assert.deepEqual(diffs, []);
  });
}
