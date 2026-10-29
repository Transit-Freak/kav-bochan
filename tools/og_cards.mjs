// כרטיסי השיתוף (og-image.png) — התמונה שמופיעה בווטסאפ ובשאר הרשתות כששולחים קישור (שלמה 29.10).
//   og-image.png בשורש — הקו הבוחן: שם, תת-כותרת וכל הכלים שבדף הבית. רשימת הכלים נלקחת מהכרטיסים
//     ב-KavPach.jsx (כותרת h2 של כל כרטיס כלי), כך שכלי חדש בדף הבית נכנס לבד בהרצה הבאה.
//   <כלי>/og-image.png — כרטיס לכלי אחד, לפי TOOLS למטה.
// הרצה: node tools/og_cards.mjs [home] [<תיקיית כלי>…]   (בלי ארגומנטים — הכל)
// צריך Playwright ורשת לגופן Heebo (Google Fonts).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');   // require — כדי ש-NODE_PATH יעבוד גם בלי node_modules בריפו
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;700;800;900&display=block" rel="stylesheet">';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const datauri = f => 'data:image/' + (f.endsWith('.svg') ? 'svg+xml' : 'png') + ';base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');

// כרטיסי הכלים: [תיקייה, שם, משפט, צבע רקע, צבע תת-כותרת, סמל]
const TOOLS = {
  'bus-speed': { name: 'איפה האוטובוס נתקע', sub: 'מהירות האוטובוסים בכל רחוב ובכל שעה', bg: ['#0f172a', '#1e293b', '#B91C1C'], ink: '#fecaca', icon: 'bus-speed/icon.svg' },
};

function homeTools() {
  const jsx = fs.readFileSync(path.join(ROOT, 'KavPach.jsx'), 'utf8');
  return [...jsx.matchAll(/<h2 className="text-3xl font-\[900\][^"]*">([^<{]+)<\/h2>/g)].map(m => m[1].trim());
}

const BUS = `<svg width="230" height="120" viewBox="0 0 230 120"><rect x="6" y="6" width="218" height="86" rx="18" fill="#f8fafc" stroke="#14b8a6" stroke-width="10"/><rect x="6" y="56" width="218" height="10" fill="#14b8a6"/><rect x="24" y="20" width="34" height="26" rx="5" fill="#99f6e4"/><rect x="68" y="20" width="34" height="26" rx="5" fill="#99f6e4"/><rect x="112" y="20" width="34" height="26" rx="5" fill="#99f6e4"/><rect x="156" y="20" width="34" height="26" rx="5" fill="#99f6e4"/><circle cx="52" cy="96" r="17" fill="#fff" stroke="#0f172a" stroke-width="6"/><circle cx="176" cy="96" r="17" fill="#fff" stroke="#0f172a" stroke-width="6"/></svg>`;

function homeHtml(tools) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">${FONT}<style>
*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;overflow:hidden}#c{position:fixed;left:0;top:0;width:1200px;height:630px;overflow:hidden;font-family:Heebo,sans-serif;background:linear-gradient(160deg,#0b1224 0%,#101b34 100%);position:relative}
.blob{position:absolute;left:-200px;bottom:-300px;width:500px;height:650px;border-radius:50%;background:#132340}
.head{position:absolute;top:56px;right:64px;display:flex;align-items:center;gap:30px}
.logo{width:120px;height:120px;border-radius:22px;border:2px solid #38bdf8;background:#0f172a url(${datauri('icon-512.png')}) center/100% no-repeat}
h1{font-size:76px;font-weight:900;color:#fff;line-height:1}h2{font-size:31px;font-weight:700;color:#5eead4;margin-top:12px}
.chips{position:absolute;top:${tools.length > 18 ? 205 : 222}px;right:64px;left:150px;display:flex;flex-wrap:wrap;gap:12px 12px}
.chips span{font-size:${tools.length > 18 ? 22 : 24}px;font-weight:700;color:#e2e8f0;background:#1e293b;border:1.5px solid #2f4d63;border-radius:26px;padding:6px 20px}
.bus{position:absolute;left:58px;bottom:90px}.url{position:absolute;left:64px;bottom:40px;font:500 24px Arial,sans-serif;color:#94a3b8;direction:ltr}
</style></head><body><div id="c"><div class="blob"></div>
<div class="head"><div class="logo"></div><div><h1>הקו הבוחן</h1><h2>ניתוח התחבורה הציבורית בישראל</h2></div></div>
<div class="chips">${tools.map(t => `<span>${esc(t)}</span>`).join('')}</div>
<div class="bus">${BUS}</div><div class="url">kavbochan.app</div></div></body></html>`;
}

function toolHtml(dir, t) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">${FONT}<style>
*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;overflow:hidden}#c{position:fixed;left:0;top:0;width:1200px;height:630px;overflow:hidden;font-family:Heebo,sans-serif;background:linear-gradient(155deg,${t.bg[0]} 0%,${t.bg[1]} 45%,${t.bg[2]} 100%);position:relative}
.blob{position:absolute;left:-120px;top:-230px;width:460px;height:460px;border-radius:50%;background:rgba(255,255,255,.08)}
.icon{position:absolute;right:90px;top:150px;width:150px;height:150px;border-radius:32px;background:url(${datauri(t.icon)}) center/100% no-repeat;box-shadow:0 18px 40px rgba(0,0,0,.35)}
h1{position:absolute;right:90px;top:330px;font-size:84px;font-weight:900;color:#fff;line-height:1.05}
h2{position:absolute;right:90px;top:440px;font-size:34px;font-weight:700;color:${t.ink}}
.url{position:absolute;right:90px;bottom:42px;font:500 24px Arial,sans-serif;color:rgba(255,255,255,.6);direction:ltr}
</style></head><body><div id="c"><div class="blob"></div><div class="icon"></div><h1>${esc(t.name)}</h1><h2>${esc(t.sub)}</h2><div class="url">kavbochan.app/${dir}</div></div></body></html>`;
}

const want = process.argv.slice(2);
const all = !want.length;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
async function shot(html, out) {
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(ROOT, out) });
  console.log('נוצר', out);
}
if (all || want.includes('home')) {
  const tools = homeTools();
  console.log(tools.length, 'כלים:', tools.join(' · '));
  await shot(homeHtml(tools), 'og-image.png');
}
for (const [dir, t] of Object.entries(TOOLS)) if (all || want.includes(dir)) await shot(toolHtml(dir, t), `${dir}/og-image.png`);
await b.close();
