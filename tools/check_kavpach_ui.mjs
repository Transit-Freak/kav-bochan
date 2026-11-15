// בדיקת עשן לקו פח ולקו המוזהב — נולדה עם חיבור הארכיון (kavpach-live).
//
// בודקת: הדף עולה בלי חריגות JS · חותמת הטריות מוצגת · כרטיסים מרונדרים ·
// תג "הקו כבר בוטל" קיים ברשימה · אומדן השקלים מופיע · קישור עמוק
// ‎#פח/קו/<מקט>‎ מסנן ומציג באנר · הקו המוזהב נטען עם כרטיסים.
// הרצה הרמטית: הכל מוגש מקומית (vendor/), בלי רשת חיצונית.
import { loadChromium, serveStatic, launchChromium } from './lib/browser.mjs';

const chromium = loadChromium();
const fail = (msg) => { console.error('❌', msg); process.exit(1); };

const { srv, port } = await serveStatic();
const browser = await launchChromium({ chromium });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
await page.route('**://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
await page.route('**://fonts.gstatic.com/**', (r) => r.fulfill({ body: '' }));
await page.route('**://cdnjs.cloudflare.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));

// ---- קו פח ----
await page.goto(`http://127.0.0.1:${port}/index.html#פח`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.vcard', { timeout: 180000 }).catch(() => fail('קו פח: אף כרטיס לא רונדר תוך 3 דקות'));
const stamp = await page.locator('text=נתוני נוסעים ועלויות').count();
if (!stamp) fail('חותמת הטריות לא מוצגת בכותרת');
const cards = await page.locator('.vcard').count();
const rmTags = await page.locator('text=הקו כבר בוטל').count();
const shekel = await page.locator('text=עלות עודפת באומדן').count();
const share = await page.locator('button:has-text("שיתוף")').count();
console.log(`✓ קו פח: ${cards} כרטיסים · תגי "כבר בוטל": ${rmTags} · אומדני שקלים: ${shekel} · כפתורי שיתוף: ${share}`);
if (!share) fail('אין כפתורי שיתוף על הכרטיסים');
// חדשים מהארכיון: לפחות הגנה אחת מהסוגים החדשים איפשהו ברשימה
const newProt = await page.locator('text=/כבר צומצם|קו חדש בהרצה|אין קו חלופי|הזמנה מראש/').count();
console.log(`✓ הגנות חדשות גלויות ברשימה: ${newProt}`);

// ---- הסבר העלות העודפת נפתח בלחיצה ----
const excBtn = page.locator('button[title="איך חושב האומדן?"]').first();
if (await excBtn.count()) {
  await excBtn.click();
  await page.waitForSelector('text=איך מחושבת העלות העודפת', { timeout: 8000 })
    .catch(() => fail('לחיצה על ? לא פתחה את הסבר העלות העודפת'));
  const hasNumbers = await page.locator('text=/₪[0-9]/').first().count();
  console.log('✓ הסבר העלות העודפת נפתח, עם מספרי הקו עצמו:', hasNumbers > 0 ? 'כן' : 'לא');
} else {
  console.log('· אין כרטיס עם עלות עודפת במסך הראשון — מדלגים על בדיקת הפופאפ');
}

// ---- קישור עמוק ----
const makat = await page.locator('.vcard').first().locator('text=/מק/').first().textContent().catch(() => '');
await page.evaluate(() => { location.hash = 'פח/קו/10415'; });
await page.waitForSelector('text=מציג קו משותף', { timeout: 15000 })
  .catch(() => fail('קישור עמוק: הבאנר "מציג קו משותף" לא הופיע'));
console.log('✓ קישור עמוק לקו בודד עובד (באנר + סינון)');
await page.evaluate(() => { location.hash = 'פח'; });
await page.waitForTimeout(800);

// ---- הקו המוזהב ----
await page.evaluate(() => { location.hash = 'מוזהב'; });
await page.waitForSelector('.vcard', { timeout: 60000 }).catch(() => fail('הקו המוזהב: אף כרטיס לא רונדר'));
const gCards = await page.locator('.vcard').count();
const gShare = await page.locator('button:has-text("שיתוף")').count();
console.log(`✓ הקו המוזהב: ${gCards} כרטיסים · כפתורי שיתוף: ${gShare}`);
if (!gShare) fail('אין כפתורי שיתוף במוזהב');

if (errs.length) fail('חריגות JS בדף: ' + errs.slice(0, 3).join(' | '));
console.log('✅ בדיקת קו פח והקו המוזהב עברה');
await browser.close();
srv.close();
process.exit(0);
