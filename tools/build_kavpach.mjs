// קו פח — בנייה מראש (שלמה 18.09: "כל דבר שיגרום לקו פח להיות מהר יותר"):
//   1. KavPach.jsx → KavPach.js בעזרת Babel המצורף (אותה קומפילציה שהדפדפן
//      עשה בכל ביקור, ~2 שניות בטלפון + 650KB של Babel) — נעשית פעם אחת כאן.
//   2. Tailwind: CSS מוכן (vendor/kavpach.css) במקום ה-JIT בזמן ריצה.
//   3. חותמת ?v= ב-index.html לפי hash של הפלט — הדפדפן שומר בקאש ומתחלף רק בשינוי.
// הרצה: node tools/build_kavpach.mjs   (דורש node_modules/tailwindcss — npm i tailwindcss@3)
import fs from 'fs';
import vm from 'vm';
import crypto from 'crypto';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const wr = (p, s) => fs.writeFileSync(path.join(ROOT, p), s);

// 1. JSX → JS
const ctx = { window: {}, self: {}, console };
vm.createContext(ctx);
vm.runInContext(rd('vendor/babel.min.js'), ctx);
ctx.src = rd('KavPach.jsx');
let js = vm.runInContext("Babel.transform(src, { presets: ['react'], filename: 'KavPach.jsx' }).code", ctx);
// מיזעור (terser) — כ-110KB פחות להורדה ופחות זמן פענוח (Lighthouse: unminified-javascript)
try {
  const { minify } = await import('terser');
  const out = await minify(js, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
  if (out.code) js = out.code;
} catch (e) { console.warn('terser לא זמין — הקובץ לא ממוזער:', e.message); }
wr('KavPach.js', '/* נבנה אוטומטית מ-KavPach.jsx (tools/build_kavpach.mjs) — לא לערוך ידנית */\n' + js);

// 2. Tailwind → CSS מוכן
const cfg = path.join(ROOT, 'tools', 'tailwind.kavpach.config.cjs');
fs.writeFileSync(cfg, `module.exports = {
  content: ['${path.join(ROOT, 'KavPach.jsx')}', '${path.join(ROOT, 'index.html')}'],
  // מחלקות שנבנות בזמן ריצה (bg-\${ac}-100 וכד') — לפי accent של לוחות ההגדרות
  safelist: [{ pattern: /^(bg|text|border)-(amber|rose|indigo|emerald|sky|slate|orange)-(50|100|200|300|400|500|600|700|800|900)$/ }],
};
`);
const inCss = path.join(ROOT, 'tools', 'tailwind.kavpach.in.css');
fs.writeFileSync(inCss, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
const tw = path.join(ROOT, 'node_modules', '.bin', 'tailwindcss');
const twBin = fs.existsSync(tw) ? tw : (process.env.TAILWIND_BIN || 'tailwindcss');
execSync(`"${twBin}" -c "${cfg}" -i "${inCss}" -o "${path.join(ROOT, 'vendor', 'kavpach.css')}" --minify`, { stdio: 'inherit' });
fs.unlinkSync(cfg); fs.unlinkSync(inCss);

// 3. חותמת
const h = crypto.createHash('sha1').update(js).update(rd('vendor/kavpach.css')).digest('hex').slice(0, 10);
let html = rd('index.html');
html = html.replace(/KavPach\.js\?v=[0-9a-f]+/g, 'KavPach.js?v=' + h).replace(/vendor\/kavpach\.css\?v=[0-9a-f]+/g, 'vendor/kavpach.css?v=' + h);
wr('index.html', html);
console.log('KavPach.js', (js.length / 1024).toFixed(0) + 'KB · kavpach.css', (rd('vendor/kavpach.css').length / 1024).toFixed(0) + 'KB · v=' + h);
