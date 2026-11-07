// כרטיסי השיתוף (og-image.png) — התמונה שמופיעה בווטסאפ ובשאר הרשתות כששולחים קישור (שלמה 29.10).
//   og-image.png בשורש — הקו הבוחן: שם, תת-כותרת וכל הכלים שבדף הבית. רשימת הכלים נלקחת מ-home/home.js
//     (KBH.GROUPS ו-KBH.PARKS — הכרטיסים של דף הבית), כך שכלי חדש בדף הבית נכנס לבד בהרצה הבאה.
//   <כלי>/og-image.png — כרטיס לכלי אחד, לפי TOOLS למטה, עם הסמל החדש של הכלי מ-KBH.ICON.
//   אחרי שינוי בכרטיס — להעלות את ?v= בקישור לתמונה ב-og:image של הדף (ווטסאפ שומר תמונה ישנה לפי הכתובת).
// הרצה: node tools/og_cards.mjs [home] [<תיקיית כלי>…]   (בלי ארגומנטים — הכל)
// צריך Playwright ורשת לגופן Heebo (Google Fonts).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const { chromium } = createRequire(import.meta.url)('playwright');   // require — כדי ש-NODE_PATH יעבוד גם בלי node_modules בריפו
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;700;800;900&display=block" rel="stylesheet">';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const datauri = f => 'data:image/' + (f.endsWith('.svg') ? 'svg+xml' : 'png') + ';base64,' + fs.readFileSync(path.join(ROOT, f)).toString('base64');

// כרטיסי הכלים — מפתח: התיקייה של הכלי (שם נשמר <תיקייה>/og-image.png). k — המפתח של הסמל ב-KBH.ICON (home/home.js),
// sub — משפט קצר (עד שתי שורות), bg — שלושת צבעי הרקע, ink — צבע המשפט.
// קו פח והקו המוזהב נמצאים בדף הבית עצמו (#פח, #מוזהב) — ווטסאפ לא רואה את מה שאחרי # ומציג את הכרטיס של הקו הבוחן.
const TOOLS = {
  'next-station': { k: 'next-station', name: 'התחנה הבאה', sub: 'תחנות אוטובוס ששמן אינו תואם לרחוב שבכתובת', bg: ['#0b1224', '#0a2147', '#2563eb'], ink: '#bfdbfe' },
  'skip-stops': { k: 'skip-stops', name: 'הקו המדלג', sub: 'קווים שחולפים ליד תחנה פעילה — בלי לעצור בה', bg: ['#1c0f07', '#7a2a0e', '#ea580c'], ink: '#fed7aa' },
  'line-history': { k: 'line-history', name: 'הקו בזמן', sub: 'היסטוריית הקווים מ-2003 ועד היום: מסלולים, תחנות ולוחות זמנים', bg: ['#1e0b3a', '#3b1478', '#7c3aed'], ink: '#ddd6fe' },
  'bus': { k: 'bus', name: 'מדד דיוק האוטובוסים', sub: 'כל אוטובוס בארץ מול לוח הזמנים, תחנה אחרי תחנה', bg: ['#04201a', '#063b2c', '#059669'], ink: '#a7f3d0' },
  'bus-speed': { k: 'bus-speed', name: 'איפה האוטובוס נתקע', sub: 'מהירות האוטובוסים בכל רחוב ובכל שעה', bg: ['#0f172a', '#1e293b', '#B91C1C'], ink: '#fecaca' },
  'alerts': { k: 'alerts', name: 'הקו המודיע', sub: 'עבודות, אירועים וחסימות — וכל המסלולים העוקפים', bg: ['#1a0b2e', '#4c1d95', '#c026d3'], ink: '#f5d0fe' },
  'fleet': { k: 'fleet', name: 'צי הרכבים', sub: 'כל האוטובוסים בישראל: חברה, דגם, שנתון, מיגון ותקלות', bg: ['#0a1120', '#1e293b', '#2563eb'], ink: '#bfdbfe' },
  'rail': { k: 'rail', name: 'מדד אמינות הרכבת', sub: 'כל רכבת בלו"ז מול המיקום ששידרה בפועל, יום אחרי יום', bg: ['#071a2b', '#0c3a5c', '#0284c7'], ink: '#bae6fd' },
  'rail/reception': { k: 'reception', name: 'קליטה ברכבת', sub: 'איפה יש קליטה סלולרית ברכבת — כל 100 מטר מסילה, לכל חברה', bg: ['#150a2e', '#3b1478', '#7c3aed'], ink: '#ddd6fe' },
  'feeder': { k: 'feeder', name: 'הקו המזין', sub: 'האם האוטובוסים מגיעים בזמן לרכבת ויוצאים אחריה', bg: ['#04200f', '#0b3d20', '#16a34a'], ink: '#bbf7d0' },
  'fares': { k: 'fares', name: 'המחירון', sub: 'כמה עולה הנסיעה — לכל קו או בין שתי תחנות', bg: ['#04201a', '#064e3b', '#059669'], ink: '#a7f3d0' },
  'ratzif': { k: 'ratzif', name: 'רציף כפול', sub: 'שני אוטובוסים שאמורים לצאת מאותו רציף באותה דקה', bg: ['#0b3443', '#0b4f66', '#0891b2'], ink: '#a5f3fc' },
  'kavbug': { k: 'kavbug', name: 'קו באג', sub: 'תקלות גאומטריות במסלולי הקווים — עיקופים ובליטות מיותרים', bg: ['#0e0c2a', '#1a1745', '#6366f1'], ink: '#c7d2fe' },
};

// home/home.js — רשימת הכלים של דף הבית (KBH.ALL: כל הכרטיסים, וגם נגישות אזורי תעשייה) והסמלים (KBH.ICON).
// ממנו נבנים גם ChoiceScreen ב-KavPach.jsx וגם הדף הסטטי ב-index.html
const HOME_JS = fs.readFileSync(path.join(ROOT, 'home', 'home.js'), 'utf8');
const KBH = (() => { const ctx = { window: {}, console }; vm.createContext(ctx); vm.runInContext(HOME_JS, ctx); return ctx.window.KBH; })();
// הסמל כקובץ SVG עצמאי — עם ההגדרות המשותפות (kb-sheen, kb-glass…) שבדף הבית נמצאות פעם אחת ב-DEFS
const DEFS_INNER = HOME_JS.match(/const DEFS = `([\s\S]*?)`;/)[1].replace(/^[\s\S]*?<defs>/, '').replace(/<\/defs>[\s\S]*$/, '');
const iconSvg = k => KBH.ICON[k]().replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/, '$1<defs>' + DEFS_INNER + '</defs>');
// נגישות אזורי תעשייה — אתר של שותפים, עם הסמל שלהם
const iconUri = k => k === 'parks' ? datauri('parks/icon-180.png') : 'data:image/svg+xml;base64,' + Buffer.from(iconSvg(k)).toString('base64');

function homeHtml(tools) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">${FONT}<style>
*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;overflow:hidden}#c{position:fixed;left:0;top:0;width:1200px;height:630px;overflow:hidden;font-family:Heebo,sans-serif;background:linear-gradient(160deg,#0b1224 0%,#101b34 100%)}
.blob{position:absolute;left:-200px;bottom:-300px;width:500px;height:650px;border-radius:50%;background:#132340}
.head{position:absolute;top:40px;right:56px;display:flex;align-items:center;gap:26px}
.logo{width:104px;height:104px;border-radius:24px;border:2px solid #38bdf8;background:#0f172a url(${datauri('icon-512.png')}) center/100% no-repeat}
h1{font-size:68px;font-weight:900;color:#fff;line-height:1}h2{font-size:29px;font-weight:700;color:#5eead4;margin-top:10px}
.url{position:absolute;left:56px;top:62px;font:500 24px Arial,sans-serif;color:#94a3b8;direction:ltr}
.grid{position:absolute;top:186px;right:56px;left:56px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px 14px}
.t{display:flex;align-items:center;gap:12px;background:#16213a;border:1.5px solid #26395a;border-radius:20px;padding:9px 10px;height:92px}
.t i{flex:none;width:70px;height:70px;border-radius:17px;background:center/100% no-repeat;box-shadow:0 6px 14px rgba(0,0,0,.35)}
.t b{font-size:23px;font-weight:800;color:#e2e8f0;line-height:1.15}
</style></head><body><div id="c"><div class="blob"></div>
<div class="head"><div class="logo"></div><div><h1>הקו הבוחן</h1><h2>ניתוח התחבורה הציבורית בישראל</h2></div></div>
<div class="url">kavbochan.app</div>
<div class="grid">${tools.map(t => `<div class="t"><i style="background-image:url(${iconUri(t.k)})"></i><b>${esc(t.n)}</b></div>`).join('')}</div>
</div></body></html>`;
}

function toolHtml(dir, t) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">${FONT}<style>
*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;overflow:hidden}#c{position:fixed;left:0;top:0;width:1200px;height:630px;overflow:hidden;font-family:Heebo,sans-serif;background:linear-gradient(155deg,${t.bg[0]} 0%,${t.bg[1]} 45%,${t.bg[2]} 100%)}
.blob{position:absolute;left:-120px;top:-230px;width:460px;height:460px;border-radius:50%;background:rgba(255,255,255,.08)}
.main{position:absolute;right:90px;left:90px;bottom:118px}
.icon{width:170px;height:170px;border-radius:38px;background:url(${iconUri(t.k)}) center/100% no-repeat;box-shadow:0 18px 40px rgba(0,0,0,.4);margin-bottom:30px}
h1{font-size:84px;font-weight:900;color:#fff;line-height:1.05}
h2{font-size:34px;font-weight:700;color:${t.ink};margin-top:16px;line-height:1.3;max-width:960px}
.url{position:absolute;right:90px;bottom:42px;font:500 24px Arial,sans-serif;color:rgba(255,255,255,.6);direction:ltr}
</style></head><body><div id="c"><div class="blob"></div><div class="main"><div class="icon"></div><h1>${esc(t.name)}</h1><h2>${esc(t.sub)}</h2></div><div class="url">kavbochan.app/${dir}</div></div></body></html>`;
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
  const tools = KBH.ALL;
  console.log(tools.length, 'כלים:', tools.map(t => t.n).join(' · '));
  await shot(homeHtml(tools), 'og-image.png');
}
for (const [dir, t] of Object.entries(TOOLS)) if (all || want.includes(dir)) await shot(toolHtml(dir, t), `${dir}/og-image.png`);
await b.close();
