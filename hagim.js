/* חגים — שמות וסמלים חגיגיים לכל האתר (בקשת שלמה 07.09).

   בכל חג שמות הכלים משתנים ("קו פח" → "הרימון הרקוב" בראש השנה), הסמלים
   בכרטיסי דף הבית מתחלפים בסמל של החג, "הקו הבוחן" עצמו מקבל שם ועין
   חגיגיים, ויש פייביקון ושורת ברכה. השם האמיתי לא מוצג (רק כטולטיפ).
   מאז העיצוב החדש (18.11): הכרטיסים והסמלים סביב העין בדף הבית מזוהים לפי data-k (home/home.js — GROUPS)
   וסמל החג יושב בריבוע בצבע הכלי; העין הגדולה נשארת חיה ומקבלת קישוט חג (FEYE), ואותה עין חגיגית
   מופיעה ליד השם בכותרת ובפייביקון. כלי חדש בדף הבית = מפתח ב-DK, שם ב-TOOLS, וערך בכל חג ב-N וב-ART.
   בימים עצובים (צומות, יום כיפור, יום השואה, יום הזיכרון, תשעה באב) אין
   שמות מצחיקים ואין אפקטים — רק ברכה שקטה ("צום קל", "יזכור").

   התאריך העברי מגיע מלוח השנה המובנה בדפדפן (Intl, ca=hebrew) — נבדק מול
   hebcal, ויקיפדיה (en+he) ושתי ספריות לשנים 2026–2028 (tools/probe_holidays.py).
   לפי ימים, לא לפי שעה (שלמה 07.09): החג מוצג מתחילת היום שבערבו הוא נכנס
   (ערב חג, מ-00:00) ועד סוף היום האחרון שלו. בלי ערב: יום העצמאות (ערבו הוא
   יום הזיכרון) והצומות הקלים שמתחילים בבוקר. בתענית אסתר, שהיא ערב פורים,
   מוצג פורים והברכה מזכירה גם את הצום. חגי המדינה זזים לפי יום השבוע כמו
   בחוק (יום העצמאות שיוצא בשישי/שבת → חמישי, בשני → שלישי; יום השואה
   בשישי → חמישי, בראשון → שני; צום שיוצא בשבת → ראשון, תענית אסתר → חמישי).

   תצוגה מקדימה בכל יום: ‎?hag=purim‎ (או שם עברי: ‎?hag=פורים‎). מכבד "בלי
   תנועה" (העדפת המערכת או כפתור הנגישות). */
(function () {
  "use strict";
  var DAY = 864e5;
  var SRC = (document.currentScript && document.currentScript.src) || "hagim.js";
  var q = /[?&]hag=([^&#]+)/.exec(location.search);
  var preview = q ? decodeURIComponent(q[1]) : "";

  // ---------- לוח עברי ----------
  var FMT, GREG;
  try {
    FMT = new Intl.DateTimeFormat("en-u-ca-hebrew", { timeZone: "Asia/Jerusalem", year: "numeric", month: "long", day: "numeric" });
    GREG = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" });
  } catch (e) { return; }
  function heb(t) { var o = {}; FMT.formatToParts(new Date(t)).forEach(function (p) { o[p.type] = p.value; }); return { y: +o.year, m: o.month, d: +o.day }; }
  function greg(t) { var o = {}; GREG.formatToParts(new Date(t)).forEach(function (p) { o[p.type] = p.value; }); return o; }
  var nowG = greg(Date.now());
  // עוגן: צהריים (UTC) של היום הישראלי — היום האזרחי כולו, בלי תלות בשעה
  var anchor = Date.UTC(+nowG.year, +nowG.month - 1, +nowG.day, 12);
  var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var win = {};       // k (ימים מהיום) → תאריך עברי
  for (var k = -50; k <= 50; k++) win[k] = heb(anchor + k * DAY);
  function wday(k) { return WD[greg(anchor + k * DAY).weekday]; }
  // הסטת k של יום עברי (חודש, יום) הקרוב ביותר להיום; אדר = אדר או אדר ב' (שנה מעוברת)
  function find(m, d) {
    var best = null;
    for (var k2 = -50; k2 <= 50; k2++) {
      var h = win[k2];
      var mm = (m === "Adar" && (h.m === "Adar" || h.m === "Adar II")) || h.m === m;
      if (mm && h.d === d && (best === null || Math.abs(k2) < Math.abs(best))) best = k2;
    }
    return best;
  }
  var gy = +nowG.year;

  // ---------- החגים ----------
  // start: (חודש, יום) · len ימים · shift: תזוזה לפי יום השבוע של היום הנומינלי
  // quiet: יום עצוב (ברכה בלבד) · noEve: בלי יום הערב שלפני
  var SPECS = [
    { id: "rosh", m: "Tishri", d: 1, len: 2 },
    { id: "gedaliah", m: "Tishri", d: 3, len: 1, quiet: true, noEve: true, shift: function (w) { return w === 6 ? 1 : 0; } },
    { id: "kippur", m: "Tishri", d: 10, len: 1, quiet: true },
    { id: "sukkot", m: "Tishri", d: 15, len: 8 },        // כולל הושענא רבה ושמחת תורה
    { id: "hanukkah", m: "Kislev", d: 25, len: 8 },
    { id: "tevet10", m: "Tevet", d: 10, len: 1, quiet: true, noEve: true },
    { id: "tubishvat", m: "Shevat", d: 15, len: 1 },
    { id: "esther", m: "Adar", d: 13, len: 1, quiet: true, noEve: true, shift: function (w) { return w === 6 ? -2 : 0; } },
    { id: "purim", m: "Adar", d: 14, len: 2 },           // י"ד + שושן פורים
    { id: "pesach", m: "Nisan", d: 15, len: 7 },
    { id: "shoah", m: "Nisan", d: 27, len: 1, quiet: true, shift: function (w) { return w === 5 ? -1 : (w === 0 ? 1 : 0); } },
    { id: "zikaron", m: "Iyar", d: 4, len: 1, quiet: true, shift: function (w, k0) { var a = wday(k0 + 1); return a === 5 ? -1 : (a === 6 ? -2 : (a === 1 ? 1 : 0)); } },
    { id: "atzmaut", m: "Iyar", d: 5, len: 1, noEve: true, shift: function (w) { return w === 5 ? -1 : (w === 6 ? -2 : (w === 1 ? 1 : 0)); } },
    { id: "lagbaomer", m: "Iyar", d: 18, len: 1 },
    { id: "yerushalayim", m: "Iyar", d: 28, len: 1 },
    { id: "shavuot", m: "Sivan", d: 6, len: 1 },
    { id: "tammuz17", m: "Tamuz", d: 17, len: 1, quiet: true, noEve: true, shift: function (w) { return w === 6 ? 1 : 0; } },
    { id: "av9", m: "Av", d: 9, len: 1, quiet: true, shift: function (w) { return w === 6 ? 1 : 0; } }
  ];
  var ALIAS = { "ראש השנה": "rosh", "צום גדליה": "gedaliah", "יום כיפור": "kippur", "סוכות": "sukkot", "חנוכה": "hanukkah", "עשרה בטבת": "tevet10",
    "טו בשבט": "tubishvat", "ט\"ו בשבט": "tubishvat", "תענית אסתר": "esther", "פורים": "purim", "פסח": "pesach", "יום השואה": "shoah",
    "יום הזיכרון": "zikaron", "יום העצמאות": "atzmaut", "לג בעומר": "lagbaomer", "ל\"ג בעומר": "lagbaomer", "יום ירושלים": "yerushalayim",
    "שבועות": "shavuot", "יז בתמוז": "tammuz17", "י\"ז בתמוז": "tammuz17", "תשעה באב": "av9" };

  var active = null, alsoQuiet = null;   // alsoQuiet: יום שקט שחל באותו יום עם ערב חג (תענית אסתר ← פורים)
  if (preview) {
    var pid = ALIAS[preview] || preview;
    SPECS.forEach(function (s) { if (s.id === pid) active = s; });
    if (!active) return;
  } else {
    var fest = null, qt = null;
    SPECS.forEach(function (s) {
      var k0 = find(s.m, s.d);           // ימים עד היום הראשון של החג (0 = היום)
      if (k0 === null) return;
      if (s.shift) k0 += s.shift(wday(k0), k0);
      var on = (k0 <= 0 && -k0 < s.len) || (k0 === 1 && !s.noEve);   // ימי החג, או ערב החג
      if (!on) return;
      if (s.quiet) { if (!qt) qt = s; } else if (!fest) fest = s;
    });
    active = fest || qt;
    if (!active) { daily(); return; }
    if (fest && qt) alsoQuiet = qt;
  }

  // ---------- שמות וברכות ----------
  var years = gy - 1948 + (nowG.month > "05" ? 0 : 0);   // יום העצמאות של אותה שנה לועזית
  var N = {
  // לכל חג — כל כלי מקבל סמל אחר של החג, ואף מילה לא חוזרת בשני שמות
  // (שלמה 07.09: "חצי מהסמלים הם מסכות", "יש כבר אתר עם אושפיזין")
    rosh:      { hub: "הקו המתוק", greet: "שנה טובה ומתוקה מהקו הבוחן", ico: "🍎", pach: "הרימון הרקוב", gold: "613 גרעינים", bug: "העיקוף של השנה", next: "תחנה טובה", time: "השנה שהייתה", skip: "הקו שמדלג לשנה הבאה", fares: "מחיר הדבש", ratzif: "תפוח כפול", fleet: "צי החלות", rail: "רכבת התקיעות", bus: "דיוק בתשליך", recep: "קליטה בתקיעה", slides: "מצגת התחלה חדשה", speed: "איפה הזנב נתקע", alerts: "הקו המבשר טובות", feeder: "קו הסימנים", game: "משחק התמרים" },
    sukkot:    { hub: "הסוכה הבוחנת", greet: "חג סוכות שמח", ico: "🌿", pach: "הסוכה הרעועה", gold: "האתרוג המהודר", bug: "הלולב העקום", next: "תחנת אושפיזין", time: null, skip: "הקו שדילג על ההדס", fares: "מחיר הערבה", ratzif: "סכך כפול", fleet: "צי הקישוטים", rail: "רכבת שמחת תורה", bus: "אוטובוס ארבעת המינים", recep: "קליטה בסוכה", slides: "מצגת ההקפות", speed: "איפה האורח נתקע", alerts: "הקו המזמין", feeder: "הקו האוסף", game: "משחק ההושענות" },
    hanukkah:  { hub: "הקו המאיר", greet: "חג אורים שמח", ico: "🕎", pach: "הסופגנייה השרופה", gold: "פך השמן", bug: "הסביבון שסטה", next: "נר תחנה", time: "שמונה ימים של שינויים", skip: "הקו שדילג על הלביבה", fares: "מחיר דמי החנוכה", ratzif: "חנוכייה כפולה", fleet: "צי המכבים", rail: "רכבת האורים", bus: "נס גדול היה פה", recep: "קליטת האור", slides: "מצגת הפתילות", speed: "איפה הריבה נתקעה", alerts: "השמש המודיע", feeder: "הקו המטוגן", game: "משחק החשמונאים" },
    tubishvat: { hub: "הקו הפורח", greet: "ט\"ו בשבט שמח", ico: "🌳", pach: "העץ היבש", gold: "השקדייה הפורחת", bug: "השורש העקום", next: null, time: "טבעות העץ", skip: "הקו שדילג על השתילה", fares: "מחיר הצימוקים", ratzif: "זית כפול", fleet: "צי הפירות", rail: "רכבת שבעת המינים", bus: "האוטובוס הירוק", recep: "קליטה בין העצים", slides: "מצגת הנטיעות", speed: "איפה החרוב נתקע", alerts: "הקו המבשר אביב", feeder: "הקו המשקה", game: "משחק הגינה" },
    purim:     { hub: "הקו המתחפש", greet: "פורים שמח", ico: "🎭", pach: "הרעשן", gold: "משלוח מנות", bug: "ונהפוך הוא", next: "התחפושת", time: "מגילת הקו", skip: "הקו שדילג על המשתה", fares: "מחיר אוזני המן", ratzif: "כתר כפול", fleet: "צי הליצנים", rail: "רכבת שושן הבירה", bus: "אוטובוס אחשוורוש", recep: "קליטה בשושן", slides: "מצגת הפור", speed: "איפה הסוס נתקע", alerts: "הקו הכרוז", feeder: "קו הסעודה", game: "משחק המסכות" },
    pesach:    { hub: "הקו בודק חמץ", greet: "חג פסח שמח", ico: "🍷", pach: "החמץ", gold: "האפיקומן", bug: "ארבעים שנה במדבר", next: "מה נשתנה", time: "ההגדה של הקו", skip: "הקו שפסח", fares: "מחיר המרור", ratzif: "כוס כפולה", fleet: "צי המצות", rail: "רכבת יציאת מצרים", bus: "אוטובוס עשר המכות", recep: "ארבע כוסות קליטה", slides: "מצגת דיינו", speed: "איפה המרכבה נתקעה", alerts: "הקו המגיד", feeder: "קו החרוסת", game: "משחק החד גדיא" },
    atzmaut:   { hub: "הקו הכחול-לבן", greet: "יום עצמאות שמח", ico: "🇮🇱", pach: "המנגל הכבוי", gold: "המטס", bug: "הזיקוק שסטה", next: null, time: years + " שנים של קווים", skip: "הקו שדילג על הטקס", fares: "מחיר הקבב", ratzif: "דגל כפול", fleet: "צי חיל הים", rail: "רכבת העצמאות", bus: "האוטובוס עם הפטיש", recep: "קליטה כחול-לבן", slides: "מצגת ההכרזה", speed: "איפה הפיקניק נתקע", alerts: "הקו המדליק משואה", feeder: "קו הפיתות", game: "חידון הקווים" },
    lagbaomer: { hub: "הקו הבוער", greet: "ל\"ג בעומר שמח", ico: "🔥", pach: "המדורה שכבתה", gold: "המדורה הגדולה", bug: "הקשת שהתעקמה", next: null, time: null, skip: "הקו שדילג על המרשמלו", fares: "מחיר תפוח האדמה", ratzif: "חץ כפול", fleet: "צי הזרדים", rail: "רכבת מירון", bus: "אוטובוס על האש", recep: "קליטה ליד המדורה", slides: "מצגת הניצוצות", speed: "איפה העשן נתקע", alerts: "הקו המהבהב", feeder: "קו הקרשים", game: "משחק הלהבות" },
    shavuot:   { hub: "הקו הלבן", greet: "חג שבועות שמח", ico: "🧀", pach: "הגבינה שהחמיצה", gold: "עוגת הגבינה", bug: "הביכורים שהלכו לאיבוד", next: null, time: null, skip: "הקו שדילג על התיקון", fares: "מחיר החלב", ratzif: "בלינצ'ס כפול", fleet: "צי הפרחים", rail: "רכבת הר סיני", bus: "אוטובוס מגילת רות", recep: "קליטה בהר", slides: "מצגת הלוחות", speed: "איפה הטרקטור נתקע", alerts: "הקו הקורא", feeder: "קו הפשטידה", game: "משחק הקציר" },
    yerushalayim: { greet: "יום ירושלים שמח", ico: "🏙️" },
    // ימים שקטים — בלי שמות, בלי אפקטים
    gedaliah: { quiet: true, greet: "צום קל ומועיל — צום גדליה", ico: "🕯️" },
    kippur:   { quiet: true, greet: "גמר חתימה טובה", ico: "🕊️" },
    tevet10:  { quiet: true, greet: "צום קל ומועיל — עשרה בטבת", ico: "🕯️" },
    esther:   { quiet: true, greet: "צום קל — תענית אסתר", ico: "🕯️" },
    shoah:    { quiet: true, greet: "יום הזיכרון לשואה ולגבורה — יזכור", ico: "🕯️" },
    zikaron:  { quiet: true, greet: "יום הזיכרון לחללי מערכות ישראל ונפגעי פעולות האיבה — יזכור", ico: "🕯️" },
    tammuz17: { quiet: true, greet: "צום קל ומועיל — י\"ז בתמוז", ico: "🕯️" },
    av9:      { quiet: true, greet: "צום קל — תשעה באב", ico: "🕯️" }
  };
  var H = N[active.id];
  if (!H) return;
  var noMotion = false;
  try { noMotion = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("a11y-nomotion"); } catch (e) { /* ignore */ }

  // ---------- סמלים ----------
  var S = "<svg viewBox='0 0 120 120' class='hag-svg'>", W = "<svg viewBox='0 0 140 90' class='hag-svg wide'>", E = "</svg>";
  var pomRot = S + "<defs><radialGradient id='hgpr' cx='40%' cy='35%'><stop offset='0' stop-color='#a16207'/><stop offset='1' stop-color='#4a2c0a'/></radialGradient></defs><circle cx='60' cy='68' r='40' fill='url(#hgpr)'/><path d='M48 30 L52 16 L60 26 L68 14 L72 30 Z' fill='#5b3a10'/><circle cx='46' cy='60' r='6' fill='#3f2a10'/><circle cx='72' cy='80' r='5' fill='#3f2a10'/><circle cx='66' cy='58' r='3.5' fill='#3f2a10'/><path d='M84 52 q10 -18 -4 -22' stroke='#166534' stroke-width='3' fill='none'/><text x='86' y='40' font-size='16'>🪰</text>" + E;
  var pomGold = S + "<defs><linearGradient id='hgp' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fef3c7'/><stop offset='.5' stop-color='#fbbf24'/><stop offset='1' stop-color='#b45309'/></linearGradient></defs><circle cx='60' cy='68' r='40' fill='url(#hgp)' stroke='#92400e' stroke-width='3'/><path d='M48 30 L52 16 L60 26 L68 14 L72 30 Z' fill='#d97706' stroke='#92400e' stroke-width='2'/><g fill='#fff7ed' opacity='.95'><circle cx='46' cy='58' r='4.5'/><circle cx='58' cy='52' r='4.5'/><circle cx='70' cy='60' r='4.5'/><circle cx='52' cy='72' r='4.5'/><circle cx='66' cy='76' r='4.5'/><circle cx='60' cy='88' r='4.5'/><circle cx='78' cy='78' r='4.5'/><circle cx='42' cy='76' r='4.5'/></g>" + E;
  var line = "<line x1='18' y1='64' x2='122' y2='64' stroke='#1f9d57' stroke-width='10' stroke-linecap='round'/>", dots = "<circle cx='18' cy='64' r='9' fill='#fff'/><circle cx='122' cy='64' r='9' fill='#fff'/>";
  var shofar = W + line + "<path d='M20 62 C 30 20, 80 10, 100 30 C 116 46, 96 72, 124 64' fill='none' stroke='#d6a054' stroke-width='13' stroke-linecap='round'/><path d='M20 62 C 30 20, 80 10, 100 30 C 116 46, 96 72, 124 64' fill='none' stroke='#8b5a1e' stroke-width='4' stroke-linecap='round' stroke-dasharray='3 9'/>" + dots + E;
  var sukkah = S + "<g transform='rotate(-8 60 80)'><rect x='24' y='52' width='72' height='56' fill='#b45309'/><rect x='30' y='58' width='60' height='50' fill='#7c2d12' opacity='.5'/><path d='M14 54 L106 46' stroke='#15803d' stroke-width='7' stroke-linecap='round'/><path d='M18 46 L100 38 M22 40 L96 32' stroke='#16a34a' stroke-width='4' stroke-linecap='round' opacity='.8'/><rect x='50' y='76' width='18' height='32' fill='#1e293b'/></g><text x='70' y='112' font-size='20'>🍂</text>" + E;
  var etrog = S + "<defs><linearGradient id='hget' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fef9c3'/><stop offset='.6' stop-color='#facc15'/><stop offset='1' stop-color='#b45309'/></linearGradient></defs><path d='M60 22 C 82 22, 96 44, 92 70 C 88 96, 70 108, 58 106 C 40 104, 26 84, 30 58 C 33 36, 44 22, 60 22 Z' fill='url(#hget)' stroke='#92400e' stroke-width='3'/><path d='M58 22 l-4 -10' stroke='#65a30d' stroke-width='4' stroke-linecap='round'/><g fill='#a16207' opacity='.35'><circle cx='50' cy='40' r='3'/><circle cx='70' cy='50' r='3'/><circle cx='46' cy='66' r='3'/><circle cx='74' cy='74' r='3'/><circle cx='58' cy='88' r='3'/><circle cx='64' cy='62' r='3'/></g>" + E;
  var lulav = W + line + "<path d='M22 66 C 40 10, 70 6, 78 40 C 84 62, 108 74, 120 62' fill='none' stroke='#65a30d' stroke-width='12' stroke-linecap='round'/><path d='M40 30 l-10 -8 M52 18 l-8 -12 M66 20 l2 -14' stroke='#4d7c0f' stroke-width='5' stroke-linecap='round'/>" + dots + E;
  var sufg = S + "<ellipse cx='60' cy='72' rx='40' ry='28' fill='#3f1d0b'/><ellipse cx='60' cy='66' rx='40' ry='26' fill='#6b3410'/><ellipse cx='60' cy='66' rx='14' ry='9' fill='#1c0a02'/><ellipse cx='46' cy='58' rx='8' ry='4' fill='#111' opacity='.8'/><path d='M40 40 q4 -10 0 -18 M60 34 q4 -10 0 -18 M80 40 q4 -10 0 -18' stroke='#94a3b8' stroke-width='3' fill='none' stroke-linecap='round' opacity='.8'/>" + E;
  var jug = S + "<defs><linearGradient id='hgjg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fef3c7'/><stop offset='.5' stop-color='#f59e0b'/><stop offset='1' stop-color='#92400e'/></linearGradient></defs><path d='M44 30 h32 v10 q22 10 22 34 q0 34 -38 34 q-38 0 -38 -34 q0 -24 22 -34 Z' fill='url(#hgjg)' stroke='#78350f' stroke-width='3'/><rect x='40' y='18' width='40' height='14' rx='4' fill='#b45309' stroke='#78350f' stroke-width='3'/><path d='M96 56 q16 8 4 26' stroke='#78350f' stroke-width='7' fill='none' stroke-linecap='round'/><path d='M46 44 q-8 12 -6 24' stroke='#fff7ed' stroke-width='4' fill='none' stroke-linecap='round' opacity='.7'/><text x='10' y='112' font-size='22'>🕯️</text>" + E;
  var dreidel = W + line + "<polyline points='18,64 44,30 70,64 96,30 122,64' fill='none' stroke='#ef8a17' stroke-width='9' stroke-linecap='round' stroke-linejoin='round' opacity='.55'/><g class='hag-dreidel' transform='rotate(22 92 40)'><rect x='76' y='14' width='32' height='32' rx='4' fill='#2563eb' stroke='#0f172a' stroke-width='3'/><path d='M76 46 L108 46 L92 66 Z' fill='#1d4ed8' stroke='#0f172a' stroke-width='3'/><rect x='89' y='2' width='6' height='14' fill='#0f172a'/><text x='92' y='38' text-anchor='middle' font-size='20' font-weight='900' fill='#fff'>נ</text></g>" + dots + E;
  function menorah() {   // כל תשעת הנרות דולקים (שלמה 07.09)
    var s = "<svg viewBox='0 0 160 110' class='hag-svg wide'><path d='M20 70 Q80 110 140 70' stroke='#fbbf24' stroke-width='7' fill='none'/><line x1='80' y1='40' x2='80' y2='104' stroke='#fbbf24' stroke-width='7'/><rect x='60' y='100' width='40' height='8' rx='3' fill='#fbbf24'/>";
    [20, 35, 50, 65, 95, 110, 125, 140].forEach(function (x) { s += "<line x1='" + x + "' y1='70' x2='" + x + "' y2='44' stroke='#fbbf24' stroke-width='7'/><rect x='" + (x - 4) + "' y='24' width='8' height='22' rx='2' fill='#fff'/><ellipse class='hag-flame' cx='" + x + "' cy='17' rx='5' ry='9' fill='#fb923c'/><ellipse cx='" + x + "' cy='19' rx='2.5' ry='5' fill='#fde68a'/>"; });
    return s + "<rect x='76' y='12' width='8' height='30' rx='2' fill='#fff'/><ellipse class='hag-flame' cx='80' cy='6' rx='5' ry='9' fill='#fb923c'/><ellipse cx='80' cy='8' rx='2.5' ry='5' fill='#fde68a'/></svg>";
  }
  var dryTree = S + "<path d='M60 110 V60 M60 78 L38 56 M60 66 L84 44 M60 88 L40 74 M38 56 L30 40 M84 44 L96 30 M84 44 L82 26' stroke='#78350f' stroke-width='7' stroke-linecap='round' fill='none'/><text x='14' y='112' font-size='18'>🍂</text>" + E;
  var blossom = S + "<path d='M60 112 V62 M60 78 L36 54 M60 66 L86 42 M36 54 L26 40 M86 42 L98 30' stroke='#92400e' stroke-width='7' stroke-linecap='round' fill='none'/><g fill='#f9a8d4'><circle cx='26' cy='38' r='9'/><circle cx='36' cy='52' r='9'/><circle cx='48' cy='42' r='9'/><circle cx='60' cy='58' r='9'/><circle cx='74' cy='40' r='9'/><circle cx='88' cy='40' r='9'/><circle cx='98' cy='28' r='9'/><circle cx='70' cy='30' r='9'/><circle cx='50' cy='28' r='9'/><circle cx='84' cy='56' r='9'/></g><g fill='#fbbf24'><circle cx='26' cy='38' r='3'/><circle cx='48' cy='42' r='3'/><circle cx='74' cy='40' r='3'/><circle cx='98' cy='28' r='3'/><circle cx='60' cy='58' r='3'/></g>" + E;
  var root = W + "<line x1='18' y1='30' x2='122' y2='30' stroke='#1f9d57' stroke-width='10' stroke-linecap='round'/><path d='M20 32 C 30 70, 60 40, 70 64 C 80 86, 110 40, 120 34' fill='none' stroke='#a16207' stroke-width='11' stroke-linecap='round'/><path d='M46 56 l-8 10 M96 52 l8 12' stroke='#a16207' stroke-width='6' stroke-linecap='round'/><circle cx='18' cy='30' r='9' fill='#fff'/><circle cx='122' cy='30' r='9' fill='#fff'/>" + E;
  var rings = S + "<circle cx='60' cy='60' r='50' fill='#b45309' stroke='#78350f' stroke-width='2'/><circle cx='60' cy='60' r='42' fill='#d6a054' stroke='#78350f' stroke-width='2'/><circle cx='60' cy='60' r='34' fill='#b45309' stroke='#78350f' stroke-width='2'/><circle cx='60' cy='60' r='26' fill='#d6a054' stroke='#78350f' stroke-width='2'/><circle cx='60' cy='60' r='18' fill='#b45309' stroke='#78350f' stroke-width='2'/><circle cx='60' cy='60' r='10' fill='#d6a054' stroke='#78350f' stroke-width='2'/><circle cx='60' cy='60' r='4' fill='#451a03'/>" + E;
  var gragger = S + "<g transform='rotate(-20 60 60)'><rect x='26' y='26' width='60' height='40' rx='6' fill='#dc2626' stroke='#7f1d1d' stroke-width='3'/><rect x='34' y='34' width='44' height='24' rx='3' fill='#fca5a5' opacity='.5'/><rect x='52' y='66' width='10' height='40' rx='3' fill='#78350f'/><circle cx='90' cy='46' r='7' fill='#fbbf24'/></g>" + E;
  var basket = S + "<path d='M24 58 h72 l-8 46 h-56 Z' fill='#d97706' stroke='#78350f' stroke-width='3'/><path d='M30 70 h60 M32 84 h56' stroke='#78350f' stroke-width='2' opacity='.6'/><path d='M40 58 Q60 14 80 58' fill='none' stroke='#78350f' stroke-width='6'/><text x='30' y='60' font-size='22'>🍷</text><text x='60' y='58' font-size='22'>🍪</text><rect x='20' y='52' width='80' height='8' rx='3' fill='#fbbf24'/>" + E;
  var flipped = W + "<line x1='18' y1='24' x2='122' y2='24' stroke='#1f9d57' stroke-width='10' stroke-linecap='round'/><polyline points='18,24 44,70 70,24 96,70 122,24' fill='none' stroke='#ef8a17' stroke-width='11' stroke-linecap='round' stroke-linejoin='round'/><circle cx='18' cy='24' r='9' fill='#fff'/><circle cx='122' cy='24' r='9' fill='#fff'/>" + E;
  // אוזן המן: משולש בצק זהוב, מילוי פרג באמצע, קפלים בצדדים
  var oznei = S + "<g transform='rotate(-8 60 66)'><path d='M60 14 Q98 46 110 96 Q60 112 10 96 Q22 46 60 14 Z' fill='#e9a23b' stroke='#a15c07' stroke-width='3' stroke-linejoin='round'/><path d='M60 36 Q84 58 92 84 Q60 94 28 84 Q36 58 60 36 Z' fill='#2b1105'/><path d='M60 30 Q88 56 98 88 M60 30 Q32 56 22 88 M20 92 Q60 102 100 92' fill='none' stroke='#fbd37a' stroke-width='4' stroke-linecap='round' opacity='.8'/><g fill='#0f0603'><circle cx='50' cy='62' r='2'/><circle cx='66' cy='58' r='2'/><circle cx='58' cy='76' r='2'/><circle cx='74' cy='78' r='2'/><circle cx='44' cy='78' r='2'/></g></g>" + E;
  var scroll = S + "<rect x='18' y='26' width='84' height='66' fill='#fef3c7' stroke='#92400e' stroke-width='3'/><rect x='10' y='18' width='14' height='82' rx='6' fill='#92400e'/><rect x='96' y='18' width='14' height='82' rx='6' fill='#92400e'/><g stroke='#78350f' stroke-width='3' stroke-linecap='round'><line x1='34' y1='42' x2='86' y2='42'/><line x1='34' y1='54' x2='80' y2='54'/><line x1='34' y1='66' x2='86' y2='66'/><line x1='34' y1='78' x2='70' y2='78'/></g>" + E;
  var matzah = S + "<g transform='rotate(-8 60 60)'><path d='M22 30 h76 v44 l-40 6 l-36 -6 Z' fill='#fde68a' stroke='#b45309' stroke-width='3'/><g fill='#b45309' opacity='.7'><circle cx='34' cy='42' r='2.5'/><circle cx='50' cy='40' r='2.5'/><circle cx='66' cy='42' r='2.5'/><circle cx='82' cy='44' r='2.5'/><circle cx='30' cy='56' r='2.5'/><circle cx='46' cy='54' r='2.5'/><circle cx='62' cy='56' r='2.5'/><circle cx='78' cy='58' r='2.5'/><circle cx='40' cy='68' r='2.5'/><circle cx='56' cy='70' r='2.5'/><circle cx='72' cy='68' r='2.5'/></g></g><text x='74' y='110' font-size='20'>✨</text>" + E;
  var desert = W + "<path d='M0 76 Q35 56 70 76 T140 76 V90 H0 Z' fill='#f59e0b' opacity='.7'/><path d='M18 62 C 30 30, 40 80, 56 44 C 70 12, 84 70, 100 34 C 110 14, 118 56, 122 62' fill='none' stroke='#ef8a17' stroke-width='9' stroke-linecap='round' stroke-dasharray='1 14'/><circle cx='18' cy='62' r='9' fill='#fff'/><circle cx='122' cy='62' r='9' fill='#fff'/><text x='100' y='30' font-size='22'>🌴</text><text x='40' y='26' font-size='14' font-weight='900' fill='#fde68a'>40 שנה</text>" + E;
  var grill = S + "<rect x='18' y='46' width='84' height='26' rx='6' fill='#334155' stroke='#0f172a' stroke-width='3'/><g stroke='#94a3b8' stroke-width='3'><line x1='26' y1='46' x2='26' y2='72'/><line x1='40' y1='46' x2='40' y2='72'/><line x1='54' y1='46' x2='54' y2='72'/><line x1='68' y1='46' x2='68' y2='72'/><line x1='82' y1='46' x2='82' y2='72'/><line x1='96' y1='46' x2='96' y2='72'/></g><line x1='30' y1='72' x2='22' y2='110' stroke='#0f172a' stroke-width='5'/><line x1='90' y1='72' x2='98' y2='110' stroke='#0f172a' stroke-width='5'/><g fill='#475569'><circle cx='40' cy='60' r='5'/><circle cx='60' cy='62' r='6'/><circle cx='80' cy='60' r='5'/></g><path d='M56 42 q4 -10 0 -18' stroke='#94a3b8' stroke-width='3' fill='none' stroke-linecap='round' opacity='.6'/>" + E;
  var flyover = "<svg viewBox='0 0 160 100' class='hag-svg wide'><g stroke-width='5' stroke-linecap='round' fill='none'><path d='M10 30 h60' stroke='#fff'/><path d='M10 40 h60' stroke='#60a5fa'/><path d='M10 50 h60' stroke='#fff'/><path d='M10 60 h60' stroke='#60a5fa'/><path d='M10 70 h60' stroke='#fff'/></g><text x='72' y='40' font-size='26'>✈️</text><text x='100' y='60' font-size='26'>✈️</text><text x='72' y='82' font-size='26'>✈️</text></svg>";
  var fwZig = W + line + "<path d='M18 64 C 40 60, 60 30, 70 26' fill='none' stroke='#ef8a17' stroke-width='9' stroke-linecap='round'/><g stroke='#fbbf24' stroke-width='4' stroke-linecap='round'><line x1='84' y1='26' x2='98' y2='26'/><line x1='79.9' y1='35.9' x2='89.8' y2='45.8'/><line x1='70' y1='40' x2='70' y2='54'/><line x1='60.1' y1='35.9' x2='50.2' y2='45.8'/><line x1='56' y1='26' x2='42' y2='26'/><line x1='60.1' y1='16.1' x2='50.2' y2='6.2'/><line x1='70' y1='12' x2='70' y2='-2'/><line x1='79.9' y1='16.1' x2='89.8' y2='6.2'/></g>" + dots + E;
  var fireOut = S + "<g stroke='#78350f' stroke-width='10' stroke-linecap='round'><line x1='24' y1='100' x2='96' y2='80'/><line x1='24' y1='80' x2='96' y2='100'/></g><g fill='#475569'><circle cx='50' cy='78' r='8'/><circle cx='66' cy='74' r='9'/><circle cx='60' cy='88' r='6'/></g><path d='M56 62 q6 -14 -2 -26 M70 58 q6 -14 0 -26' stroke='#94a3b8' stroke-width='3' fill='none' stroke-linecap='round' opacity='.8'/>" + E;
  var fireBig = S + "<g stroke='#78350f' stroke-width='10' stroke-linecap='round'><line x1='24' y1='104' x2='96' y2='86'/><line x1='24' y1='86' x2='96' y2='104'/></g><path d='M60 16 C 78 34, 92 52, 86 74 C 82 88, 70 94, 60 92 C 46 92, 32 82, 34 66 C 36 52, 46 44, 44 30 C 52 40, 54 46, 60 16 Z' fill='#f97316'/><path d='M60 40 C 70 52, 76 62, 72 76 C 70 84, 64 88, 60 86 C 52 86, 46 78, 48 70 C 50 62, 54 58, 60 40 Z' fill='#fde047'/>" + E;
  var bow = W + line + "<path d='M22 66 Q 70 -20 118 66' fill='none' stroke='#a16207' stroke-width='10' stroke-linecap='round'/><line x1='22' y1='66' x2='118' y2='66' stroke='#e2e8f0' stroke-width='3'/><line x1='70' y1='20' x2='70' y2='66' stroke='#e2e8f0' stroke-width='4'/><path d='M64 26 L70 14 L76 26 Z' fill='#e2e8f0'/>" + dots + E;
  var cheese = S + "<path d='M14 80 L96 44 L106 84 Z' fill='#fbbf24' stroke='#b45309' stroke-width='3'/><path d='M14 80 L96 44 L100 30 L20 68 Z' fill='#fde68a' stroke='#b45309' stroke-width='3'/><g fill='#a16207' opacity='.6'><circle cx='50' cy='72' r='5'/><circle cx='72' cy='66' r='4'/><circle cx='86' cy='76' r='4'/></g><g fill='#16a34a'><circle cx='40' cy='78' r='6'/><circle cx='62' cy='60' r='5'/><circle cx='90' cy='62' r='4'/></g><path d='M60 40 q4 -10 0 -18' stroke='#94a3b8' stroke-width='3' fill='none' stroke-linecap='round' opacity='.7'/>" + E;
  var bikkurim = W + line + "<g transform='rotate(30 100 44)'><path d='M78 40 h44 l-6 26 h-32 Z' fill='#d97706' stroke='#78350f' stroke-width='3'/><path d='M88 40 Q100 18 112 40' fill='none' stroke='#78350f' stroke-width='5'/></g><text x='52' y='36' font-size='22'>🍇</text><text x='30' y='54' font-size='20'>🌾</text>" + dots + E;
  // "קליטה ברכבת" — ארבעת פסי הקליטה עשויים מהחג עצמו (שלמה 19.09: "תנסה להיות יותר מקורי")
  var BX = [16, 41, 66, 91], BH = [30, 52, 74, 96];   // ארבעה פסים עולים, תחתית ב-y=112
  function barsOf(fn) { var out = ""; for (var i = 0; i < 4; i++) out += fn(BX[i], 112 - BH[i], BH[i], i); return S + out + E; }
  // ראש השנה: פסים מחלות דבש (משושים נערמים) ודבש נוטף מהגבוה
  var recepRosh = barsOf(function (x, y, h, i) {
    var o = "", n = i + 1, cx = x + 10;
    for (var k = 0; k < n; k++) { var cy = 112 - 12 - k * 22; o += "<polygon points='" + [cx, cy - 12, cx + 10, cy - 6, cx + 10, cy + 6, cx, cy + 12, cx - 10, cy + 6, cx - 10, cy - 6].join(" ") + "' fill='#fbbf24' stroke='#b45309' stroke-width='2.5'/>"; }
    if (i === 3) o += "<path d='M" + (cx + 4) + " 8 q6 6 0 14 q-6 -6 0 -14' fill='#f59e0b'/>";
    return o;
  });
  // סוכות: פסים מסכך — קני במבוק בגבהים עולים עם כפות תמרים
  var recepSukkot = barsOf(function (x, y, h) {
    var cx = x + 10;
    return "<rect x='" + (cx - 4) + "' y='" + y + "' width='8' height='" + h + "' rx='3' fill='#b45309'/><path d='M" + cx + " " + y + " q-16 -8 -22 4 M" + cx + " " + y + " q16 -8 22 4 M" + cx + " " + (y + 10) + " q-14 -4 -20 8 M" + cx + " " + (y + 10) + " q14 -4 20 8' stroke='#22c55e' stroke-width='4' fill='none' stroke-linecap='round'/>";
  });
  // חנוכה: פסים מנרות בגבהים עולים, כולם דולקים
  var recepHan = barsOf(function (x, y, h) {
    var cx = x + 10;
    return "<rect x='" + x + "' y='" + y + "' width='20' height='" + h + "' rx='4' fill='#fff' stroke='#cbd5e1' stroke-width='2'/><rect x='" + (cx - 1.5) + "' y='" + (y - 7) + "' width='3' height='8' fill='#334155'/><ellipse class='hag-flame' cx='" + cx + "' cy='" + (y - 14) + "' rx='6' ry='10' fill='#fb923c'/><ellipse cx='" + cx + "' cy='" + (y - 12) + "' rx='3' ry='5' fill='#fde68a'/>";
  }).replace(E, "<rect x='8' y='112' width='104' height='6' rx='3' fill='#fbbf24'/>" + E);
  // ט"ו בשבט: פסים מברושים בגבהים עולים
  var recepTu = barsOf(function (x, y, h) {
    var cx = x + 10;
    return "<rect x='" + (cx - 3) + "' y='" + (112 - 12) + "' width='6' height='12' fill='#78350f'/><path d='M" + cx + " " + y + " L" + (cx + 11) + " " + (112 - 10) + " L" + (cx - 11) + " " + (112 - 10) + " Z' fill='#15803d'/><path d='M" + cx + " " + (y + 8) + " L" + (cx + 7) + " " + (y + h * 0.55) + " L" + (cx - 7) + " " + (y + h * 0.55) + " Z' fill='#22c55e' opacity='.7'/>";
  });
  // פורים: פסים מאוזני המן נערמות (1, 2, 3, 4)
  var recepPurim = barsOf(function (x, y, h, i) {
    var o = "", cx = x + 10;
    for (var k = 0; k <= i; k++) { var b = 112 - k * 22; o += "<path d='M" + cx + " " + (b - 22) + " L" + (cx + 12) + " " + b + " L" + (cx - 12) + " " + b + " Z' fill='#e9a23b' stroke='#a15c07' stroke-width='2' stroke-linejoin='round'/><circle cx='" + cx + "' cy='" + (b - 8) + "' r='3.5' fill='#1c1917'/>"; }
    return o;
  });
  // פסח: ארבע כוסות — היין עולה מכוס לכוס
  var recepPesach = barsOf(function (x, y, h, i) {
    var cx = x + 10, top = 30, bot = 74, lvl = bot - 8 - i * 10;   // הבור מ-30 עד 74; היין עולה מכוס לכוס
    var bowl = "M" + (cx - 11) + " " + top + " h22 q0 " + (bot - top) + " -11 " + (bot - top) + " q-11 0 -11 -" + (bot - top) + " Z";
    var f = 1 - (lvl - top) / (bot - top);   // רוחב היין בגובה המפלס (הבור מתכווץ למטה)
    var wine = "M" + (cx - 11 * f) + " " + lvl + " h" + (22 * f) + " q" + (2 * f) + " " + (bot - lvl) + " -" + (11 * f) + " " + (bot - lvl) + " q-" + (11 * f) + " 0 -" + (11 * f) + " -" + (bot - lvl) + " Z";
    return "<path d='" + wine + "' fill='#b91c1c'/><path d='" + bowl + "' fill='none' stroke='#e2e8f0' stroke-width='2.5'/><path d='M" + cx + " " + bot + " V104 M" + (cx - 9) + " 106 h18' stroke='#e2e8f0' stroke-width='3' stroke-linecap='round'/>";
  });
  // יום העצמאות: דגלים על תרנים בגבהים עולים
  var recepAtz = barsOf(function (x, y, h) {
    var cx = x + 2;
    return "<rect x='" + cx + "' y='" + y + "' width='3' height='" + h + "' fill='#94a3b8'/><g transform='translate(" + (cx + 3) + " " + y + ")'><rect width='20' height='14' fill='#fff' stroke='#cbd5e1' stroke-width='1'/><rect y='2' width='20' height='2.5' fill='#1d4ed8'/><rect y='9.5' width='20' height='2.5' fill='#1d4ed8'/><path d='M10 4.5 l3 5 h-6 Z M10 9.5 l3 -5 h-6 Z' fill='none' stroke='#1d4ed8' stroke-width='1'/></g>";
  });
  // ל"ג בעומר: להבות בגבהים עולים על גזרים
  var recepLag = barsOf(function (x, y, h) {
    var cx = x + 10, t = y;
    return "<path d='M" + cx + " " + t + " C" + (cx + 12) + " " + (t + h * 0.35) + ", " + (cx + 12) + " " + (t + h * 0.75) + ", " + cx + " " + (112 - 6) + " C" + (cx - 12) + " " + (t + h * 0.75) + ", " + (cx - 12) + " " + (t + h * 0.35) + ", " + cx + " " + t + " Z' fill='#f97316'/><path d='M" + cx + " " + (t + h * 0.4) + " C" + (cx + 6) + " " + (t + h * 0.6) + ", " + (cx + 6) + " " + (t + h * 0.85) + ", " + cx + " " + (112 - 8) + " C" + (cx - 6) + " " + (t + h * 0.85) + ", " + (cx - 6) + " " + (t + h * 0.6) + ", " + cx + " " + (t + h * 0.4) + " Z' fill='#fde047'/><rect x='" + (x - 2) + "' y='108' width='24' height='6' rx='3' fill='#78350f'/>";
  });
  // שבועות: שיבולים בגבהים עולים
  var recepShav = barsOf(function (x, y, h) {
    var cx = x + 10, o = "<path d='M" + cx + " 112 V" + y + "' stroke='#ca8a04' stroke-width='3' stroke-linecap='round'/>";
    for (var k = 0; k < 5; k++) { var yy = y + 4 + k * 8; o += "<ellipse cx='" + (cx - 5) + "' cy='" + yy + "' rx='5' ry='3' fill='#fbbf24' transform='rotate(-30 " + (cx - 5) + " " + yy + ")'/><ellipse cx='" + (cx + 5) + "' cy='" + (yy + 4) + "' rx='5' ry='3' fill='#fbbf24' transform='rotate(30 " + (cx + 5) + " " + (yy + 4) + ")'/>"; }
    return o;
  });
  // אימוג'י גדול עם תג קטן צמוד אליו (לא בפינת הכרטיס — שלמה 07.09: "הסמל נראה מוזר");
  // roof=true: התג יושב על גג הרכב (רכבת/אוטובוס נושאים את סמל החג)
  function em(e, badge, roof) { return "<span class='hag-emwrap" + (roof ? " roof" : "") + "'><span class='hag-em'>" + e + "</span>" + (badge ? "<span class='hag-badge'>" + badge + "</span>" : "") + "</span>"; }
  function rail(b) { return em("🚆", b, true); }
  function bus(b) { return em("🚌", b, true); }
  // דבש נוזל על השעון (ראש השנה, הקו בזמן — שלמה 07.09)
  var honeyClock = "<span class='hag-honey'><span class='hag-em'>🕰️</span><span class='hag-jar'>🍯</span><i class='hag-drop d1'></i><i class='hag-drop d2'></i><i class='hag-drop d3'></i></span>";
  // "כפול" = שניים, "צי" = שלושה — אימוג'י או ציור (שלמה 07.09: "בצי המצות שיהיה מצה")
  function two(e) { return "<span class='hag-em hag-two'>" + e + e + "</span>"; }
  function three(e) { return "<span class='hag-em hag-three'>" + e + e + e + "</span>"; }
  function multi(svg, n) { var s = ""; for (var i = 0; i < n; i++) s += svg; return "<span class='hag-multi n" + n + "'>" + s + "</span>"; }
  // כל כלי — סמל אחר של החג (שלמה 07.09: "חצי מהסמלים הם מסכות")
  var ART = {
    rosh:      { pach: pomRot, gold: pomGold, bug: shofar, next: em("🍎", "🍯"), time: honeyClock,
                 skip: em("🗓️", "⏭️"), fares: em("🎫", "🍯"), ratzif: two("🍎"), fleet: three("🥯"), rail: rail("📯"), bus: bus("🐟"), recep: recepRosh,
                 slides: em("📑", "🆕"), speed: em("🐌", "🍯"), alerts: em("📢", "✨"), feeder: em("🍽️", "🥕"), game: em("🎮", "🌴") },
    sukkot:    { pach: sukkah, gold: etrog, bug: lulav, next: em("🚏", "🛖"), time: em("🕰️", "🍂"),
                 skip: em("🌿", "⏭️"), fares: em("🎫", "🍃"), ratzif: two("🌴"), fleet: three("🏮"), rail: rail("📜"), bus: bus("🍋"), recep: recepSukkot,
                 slides: em("📑", "🎶"), speed: em("🧳", "⏳"), alerts: em("💌", "🍂"), feeder: em("🧺", "🍇"), game: em("🎮", "🌾") },
    hanukkah:  { pach: sufg, gold: jug, bug: dreidel, next: em("🚏", "🕯️"), time: menorah(),
                 skip: em("🥞", "⏭️"), fares: em("🎫", "🪙"), ratzif: two("🕎"), fleet: three("🛡️"), rail: rail("✨"), bus: bus("🪔"), recep: recepHan,
                 slides: em("📑", "🕯️"), speed: em("🍩", "🍓"), alerts: em("📢", "🕯️"), feeder: em("🍳", "🫒"), game: em("🎮", "🔥") },
    tubishvat: { pach: dryTree, gold: blossom, bug: root, next: em("🚏", "🌳"), time: rings,
                 skip: em("🌱", "⏭️"), fares: em("🎫", "🍇"), ratzif: two("🫒"), fleet: "<span class='hag-em hag-three'>🍎🍐🍊</span>", rail: rail("🌾"), bus: bus("🍃"), recep: recepTu,
                 slides: em("📑", "🪴"), speed: em("🫘", "🐌"), alerts: em("📢", "🌸"), feeder: em("🪣", "💧"), game: em("🎮", "🌼") },
    purim:     { pach: gragger, gold: basket, bug: flipped, next: em("🎭"), time: scroll,
                 skip: em("🎉", "⏭️"), fares: oznei, ratzif: two("👑"), fleet: three("🤡"), rail: rail("🏰"), bus: bus("🐎"), recep: recepPurim,
                 slides: em("📑", "🎲"), speed: em("🐴", "🐌"), alerts: em("📢", "🎺"), feeder: em("🍲", "🍪"), game: em("🎮", "🪅") },
    pesach:    { pach: em("🍞"), gold: matzah, bug: desert, next: em("🚏", "❓"), time: em("📖", "🍷"),
                 skip: em("🐑", "⏭️"), fares: em("🎫", "🥬"), ratzif: two("🍷"), fleet: multi(matzah.replace(/<text[^>]*>✨<\/text>/, ""), 3), rail: rail("🌊"), bus: bus("🐸"), recep: recepPesach,
                 slides: em("📑", "🎶"), speed: em("🛞", "🌊"), alerts: em("🗣️", "📖"), feeder: em("🥣", "🌰"), game: em("🎮", "🐐") },
    atzmaut:   { pach: grill, gold: flyover, bug: fwZig, next: em("🇮🇱"), time: em("🕰️", "🎂"),
                 skip: em("🏅", "⏭️"), fares: em("🎫", "🍢"), ratzif: two("🇮🇱"), fleet: three("⚓"), rail: rail("🎆"), bus: bus("🔨"), recep: recepAtz,
                 slides: em("📑", "🎺"), speed: em("🧺", "🚗"), alerts: em("🔥", "✡️"), feeder: em("🥙"), game: em("🏆", "❓") },
    lagbaomer: { pach: fireOut, gold: fireBig, bug: bow, next: em("🔥"), time: em("🕰️", "🌙"),
                 skip: em("🍡", "⏭️"), fares: em("🎫", "🥔"), ratzif: two("🏹"), fleet: three("🪵"), rail: rail("⛰️"), bus: bus("🍖"), recep: recepLag,
                 slides: em("📑", "✨"), speed: em("💨", "🐌"), alerts: em("📢", "💥"), feeder: em("📦", "🔨"), game: em("🎮", "🔥") },
    shavuot:   { pach: cheese, gold: em("🍰", "✨"), bug: bikkurim, next: em("🚏", "🌾"), time: em("🕰️", "🧀"),
                 skip: em("🌙", "⏭️"), fares: em("🎫", "🥛"), ratzif: two("🥞"), fleet: three("💐"), rail: rail("⛰️"), bus: bus("📜"), recep: recepShav,
                 slides: em("📑", "🪨"), speed: em("🚜", "🐌"), alerts: em("📢", "📖"), feeder: em("🥧"), game: em("🎮", "🌾") }
  };
  // העין של "הקו הבוחן" בכל חג — באותו עיצוב כמו העין בדף הבית (ריבוע בהיר, עין כחולה), עם קישוט החג סביבה.
  // הקישוט: bg — בתוך הריבוע, מאחורי העין · fg — מעל העין, ויכול לצאת מהריבוע (תיבת התצוגה FVB).
  // iris — צבעי הקשתית, line — צבע קו העין. משמש לעין הגדולה בדף הבית (העין החיה נשארת ומקבלת את הקישוט),
  // לעין הקטנה ליד השם "הקו הבוחן" בכותרת ולפייביקון.
  var FVB = [-24, -30, 168, 168];
  var TILE = "<rect width='120' height='120' rx='26'/>";
  function candles() {   // חנוכייה על גג הריבוע: שמונה נרות ושמש גבוה באמצע, כולם דולקים
    var o = "<rect x='2' y='-7' width='116' height='8' rx='4' fill='url(#hgfGold)' stroke='#92400e' stroke-width='1.5'/>" +
      "<rect x='54' y='-16' width='12' height='10' rx='2' fill='url(#hgfGold)' stroke='#92400e' stroke-width='1.2'/>";
    [10, 23, 36, 49, 71, 84, 97, 110, 60].forEach(function (x, i) {
      var sh = i === 8, bot = sh ? -15 : -6, top = bot - 13, c = i % 2 ? "#dbeafe" : "#fff";
      o += "<rect x='" + (x - 3.5) + "' y='" + top + "' width='7' height='13' rx='1.5' fill='" + c + "' stroke='#1d4ed8' stroke-width='1'/>" +
        "<ellipse class='hag-fl' cx='" + x + "' cy='" + (top - 6.5) + "' rx='4.4' ry='7' fill='#f97316'/><ellipse cx='" + x + "' cy='" + (top - 5) + "' rx='2.1' ry='3.8' fill='#fde68a'/>";
    });
    return o;
  }
  function blossoms(pts) { var o = ""; pts.forEach(function (p) { var x = p[0], y = p[1], r = p[2] || 5; for (var a = 0; a < 5; a++) { var t = a * 1.2566 - 1.5708; o += "<circle cx='" + (x + Math.cos(t) * r * .75).toFixed(1) + "' cy='" + (y + Math.sin(t) * r * .75).toFixed(1) + "' r='" + (r * .62).toFixed(1) + "' fill='#fbcfe8' stroke='#ec4899' stroke-width='.8'/>"; } o += "<circle cx='" + x + "' cy='" + y + "' r='" + (r * .35).toFixed(1) + "' fill='#f59e0b'/>"; }); return o; }
  function flowers(pts) { var o = ""; pts.forEach(function (p) { var x = p[0], y = p[1], c = p[2]; for (var a = 0; a < 6; a++) { var t = a * 1.0472; o += "<circle cx='" + (x + Math.cos(t) * 4).toFixed(1) + "' cy='" + (y + Math.sin(t) * 4).toFixed(1) + "' r='3.2' fill='" + c + "'/>"; } o += "<circle cx='" + x + "' cy='" + y + "' r='2.6' fill='#facc15'/>"; }); return o; }
  function leaf(x, y, rot, len, c) { return "<ellipse cx='" + x + "' cy='" + y + "' rx='" + len + "' ry='" + (len * .36).toFixed(1) + "' fill='" + c + "' transform='rotate(" + rot + " " + x + " " + y + ")'/>"; }
  var FEYE = {
    rosh: { vb: [-14, -30, 160, 160], iris: ["#fef3c7", "#f59e0b", "#b45309"], line: "#d97706", dash: "#f59e0b",
      fg: "<g clip-path='url(#hgfClip)'><path d='M0 0 H120 V7 q-7 0 -8 7 a5 5 0 0 1 -10 0 q-1 -7 -8 -7 H60 q-6 0 -6 10 a5 5 0 0 1 -10 0 q0 -10 -6 -10 H24 q-5 0 -5 5 a4 4 0 0 1 -8 0 q0 -5 -6 -5 H0 Z' fill='url(#hgfHoney)'/></g>" +
        "<g transform='rotate(14 116 2)'><path d='M116 -6 q-2 -9 4 -14' stroke='#78350f' stroke-width='3' fill='none' stroke-linecap='round'/>" + leaf(126, -16, -30, 9, "#16a34a") +
        "<path d='M116 -6 C 100 -14, 92 4, 98 16 C 104 28, 114 26, 116 22 C 118 26, 128 28, 134 16 C 140 4, 132 -14, 116 -6 Z' fill='url(#hgfApple)' stroke='#7f1d1d' stroke-width='1.5'/><ellipse cx='106' cy='2' rx='3' ry='6' fill='#fff' opacity='.45'/></g>" },
    sukkot: { vb: [-22, -38, 164, 164], iris: ["#bbf7d0", "#16a34a", "#14532d"], line: "#15803d",
      // הסוכה: העין מציצה מתוכה — פנים חם, דפנות בד פתוחות לצדדים, עמודי עץ וסכך ירוק מעל, ושני קישוטים תלויים
      bg: "<rect width='120' height='120' fill='url(#hgfIn)'/><g fill='#fff' opacity='.35'><path d='M30 0 L18 120 H26 L40 0Z'/><path d='M74 0 L70 120 H78 L84 0Z'/></g>",
      fg: "<rect x='-16' y='-8' width='13' height='134' rx='3' fill='url(#hgfWood)' stroke='#78350f' stroke-width='1.5'/><rect x='123' y='-8' width='13' height='134' rx='3' fill='url(#hgfWood)' stroke='#78350f' stroke-width='1.5'/>" +
        "<path d='M-4 -4 H26 Q16 34 9 60 Q16 88 26 124 H-4 Z' fill='url(#hgfCloth)' stroke='#94a3b8' stroke-width='1.2'/><path d='M124 -4 H94 Q104 34 111 60 Q104 88 94 124 H124 Z' fill='url(#hgfCloth)' stroke='#94a3b8' stroke-width='1.2'/>" +
        "<path d='M-2 52 q5 6 9 7 M122 52 q-5 6 -9 7' stroke='#b91c1c' stroke-width='4' fill='none' stroke-linecap='round'/>" +
        "<rect x='-20' y='-12' width='160' height='9' rx='3' fill='url(#hgfWood)' stroke='#78350f' stroke-width='1.5'/>" +
        "<path d='M34 -4 V16 M86 -4 V20' stroke='#a16207' stroke-width='1.2'/><circle cx='34' cy='20' r='5' fill='#ef4444' stroke='#7f1d1d' stroke-width='1'/><path d='M86 18 l2.4 4.8 5.3 .8 -3.8 3.7 .9 5.2 -4.8 -2.5 -4.8 2.5 .9 -5.2 -3.8 -3.7 5.3 -.8z' fill='#fbbf24' stroke='#b45309' stroke-width='1'/>" +
        leaf(-14, -18, -10, 14, "#15803d") + leaf(6, -22, 8, 15, "#22c55e") + leaf(28, -17, -14, 15, "#16a34a") + leaf(50, -23, 6, 16, "#4ade80") + leaf(72, -17, -8, 15, "#15803d") +
        leaf(94, -22, 12, 15, "#22c55e") + leaf(116, -17, -6, 15, "#16a34a") + leaf(134, -21, 10, 13, "#4ade80") +
        leaf(16, -2, 50, 9, "#16a34a") + leaf(60, -1, -40, 9, "#22c55e") + leaf(104, -2, 46, 9, "#15803d") +
        "<path d='M-18 -26 Q20 -36 60 -28 T140 -28' stroke='#166534' stroke-width='2.4' fill='none' stroke-linecap='round'/>" },
    hanukkah: { vb: [-22, -44, 164, 164], iris: ["#fef08a", "#f59e0b", "#c2410c"], line: "#d97706", dash: "#f59e0b",
      // אור הנרות נופל על העין: הילה חמה מלמעלה ונצנוצים
      bg: "<rect width='120' height='120' fill='url(#hgfGlow)'/>" + "<g fill='#f59e0b' opacity='.7'><path d='M16 22 q0 5 5 5 q-5 0 -5 5 q0 -5 -5 -5 q5 0 5 -5z'/><path d='M104 18 q0 4 4 4 q-4 0 -4 4 q0 -4 -4 -4 q4 0 4 -4z'/><path d='M100 98 q0 4 4 4 q-4 0 -4 4 q0 -4 -4 -4 q4 0 4 -4z'/><path d='M18 96 q0 3 3 3 q-3 0 -3 3 q0 -3 -3 -3 q3 0 3 -3z'/></g>",
      fg: candles() },
    tubishvat: { vb: [-20, -38, 164, 164], iris: ["#bbf7d0", "#22c55e", "#166534"], line: "#16a34a",
      fg: "<path d='M140 -24 C 110 -10, 80 -16, 50 -8 C 30 -3, 12 -6, -12 6' stroke='#78350f' stroke-width='5' fill='none' stroke-linecap='round'/><path d='M96 -14 q-6 -10 -2 -18 M58 -10 q4 -10 -2 -18 M24 -5 q-8 6 -8 14' stroke='#78350f' stroke-width='3' fill='none' stroke-linecap='round'/>" +
        leaf(118, -10, 30, 8, "#22c55e") + leaf(74, -6, -20, 7, "#16a34a") +
        blossoms([[134, -22, 7], [104, -18, 7], [94, -30, 6], [56, -26, 6], [66, -10, 6], [36, -6, 7], [14, -8, 6], [16, 12, 6], [-8, 6, 7]]) },
    purim: { vb: [-22, -34, 164, 164], iris: ["#e9d5ff", "#a855f7", "#6b21a8"], line: "#9333ea",
      fg: "<g class='hag-hat' transform='rotate(18 104 -6)'><path d='M82 6 L80 -18 L92 -6 L104 -26 L116 -6 L128 -18 L126 6 Z' fill='url(#hgfGold)' stroke='#92400e' stroke-width='2' stroke-linejoin='round'/><rect x='81' y='2' width='46' height='7' rx='2' fill='#f59e0b' stroke='#92400e' stroke-width='1.5'/><circle cx='104' cy='-6' r='3.5' fill='#ef4444'/><circle cx='92' cy='4' r='2' fill='#2563eb'/><circle cx='116' cy='4' r='2' fill='#16a34a'/></g>" +
        "<g><rect x='-14' y='-10' width='7' height='4' rx='1' fill='#ef4444' transform='rotate(30 -10 -8)'/><rect x='10' y='-22' width='7' height='4' rx='1' fill='#22c55e' transform='rotate(-25 13 -20)'/><rect x='40' y='-16' width='7' height='4' rx='1' fill='#3b82f6' transform='rotate(50 43 -14)'/><rect x='58' y='-26' width='7' height='4' rx='1' fill='#facc15' transform='rotate(-10 61 -24)'/>" +
        "<circle cx='26' cy='-8' r='3' fill='#ec4899'/><circle cx='-18' cy='20' r='3' fill='#f97316'/><circle cx='138' cy='40' r='3' fill='#22c55e'/><rect x='130' y='70' width='7' height='4' rx='1' fill='#a855f7' transform='rotate(40 133 72)'/><circle cx='-16' cy='96' r='3' fill='#3b82f6'/><rect x='-20' y='60' width='7' height='4' rx='1' fill='#facc15' transform='rotate(-30 -17 62)'/></g>" +
        "<path d='M-6 30 q-10 -8 -2 -16 q8 -8 -4 -18' stroke='#ec4899' stroke-width='2.5' fill='none' stroke-linecap='round'/><path d='M128 96 q10 6 4 16 q-6 10 6 16' stroke='#f59e0b' stroke-width='2.5' fill='none' stroke-linecap='round'/>" },
    pesach: { vb: [-26, -30, 166, 166], iris: ["#bae6fd", "#0284c7", "#0c4a6e"], line: "#0369a1",
      fg: "<g transform='rotate(-14 4 -2)'><rect x='-18' y='-22' width='44' height='40' rx='3' fill='#fde68a' stroke='#b45309' stroke-width='2'/><path d='M-14 -12 H22 M-14 -2 H22 M-14 8 H22' stroke='#d97706' stroke-width='1.5' stroke-dasharray='2 3'/><path d='M-18 -22 l6 6 l-6 6 l6 6 l-6 6 l6 6 l-6 6 l6 6' fill='none' stroke='#b45309' stroke-width='1' opacity='.6'/></g>" +
        "<g transform='rotate(10 126 112)'><path d='M110 92 h32 q0 22 -16 24 q-16 -2 -16 -24 Z' fill='#fff' fill-opacity='.4' stroke='#cbd5e1' stroke-width='2'/><path d='M111.5 98 h29 q-1.5 16 -14.5 17 q-13 -1 -14.5 -17 Z' fill='#b91c1c'/><path d='M126 116 V130 M116 132 h20' stroke='#cbd5e1' stroke-width='3.5' stroke-linecap='round'/><ellipse cx='117' cy='102' rx='2' ry='5' fill='#fff' opacity='.5'/></g>" },
    atzmaut: { vb: [-14, -34, 168, 168], iris: ["#bfdbfe", "#2563eb", "#1e3a8a"], line: "#1d4ed8",
      fg: "<path d='M-6 -28 V40' stroke='#64748b' stroke-width='3.5' stroke-linecap='round'/><circle cx='-6' cy='-29' r='3' fill='#fbbf24'/>" +
        "<path d='M-4 -26 C 10 -32, 24 -20, 46 -26 V2 C 24 8, 10 -4, -4 2 Z' fill='#fff' stroke='#cbd5e1' stroke-width='1.2'/><path d='M-4 -22 C 10 -28, 24 -16, 46 -22 M-4 -2 C 10 -8, 24 4, 46 -2' stroke='#1d4ed8' stroke-width='3' fill='none'/>" +
        "<g transform='translate(21 -12)' fill='none' stroke='#1d4ed8' stroke-width='1.6'><path d='M0 -6 L5.2 3 H-5.2 Z M0 6 L5.2 -3 H-5.2 Z'/></g>" +
        "<g stroke-linecap='round' stroke-width='2.6'><g stroke='#3b82f6'><path d='M108 -14 v-10 M108 -4 v10 M98 -9 h-10 M118 -9 h10 M101 -16 l-6 -6 M115 -2 l6 6 M115 -16 l6 -6 M101 -2 l-6 6'/></g><g stroke='#f59e0b'><path d='M136 20 v-7 M136 32 v7 M129 26 h-7 M143 26 h7'/></g><g stroke='#ec4899'><path d='M70 -24 v-5 M70 -12 v5 M64 -18 h-5 M76 -18 h5'/></g></g>" },
    lagbaomer: { vb: [-16, -8, 152, 152], iris: ["#fed7aa", "#f97316", "#9a3412"], line: "#ea580c",
      fg: "<g stroke-linecap='round'><path d='M30 134 L90 118' stroke='#78350f' stroke-width='9'/><path d='M30 118 L90 134' stroke='#92400e' stroke-width='9'/></g>" +
        "<path class='hag-fl' d='M60 84 C 76 98, 92 108, 86 124 C 82 132, 70 134, 60 132 C 46 134, 34 128, 34 118 C 34 106, 46 104, 46 92 C 52 98, 54 102, 60 84 Z' fill='#f97316'/><path d='M60 104 C 68 112, 74 118, 70 126 C 68 130, 64 131, 60 130 C 54 131, 50 127, 50 122 C 50 116, 56 114, 60 104 Z' fill='#fde047'/>" +
        "<g fill='#fbbf24'><circle cx='40' cy='82' r='2'/><circle cx='82' cy='76' r='2.4'/><circle cx='70' cy='68' r='1.6'/><circle cx='28' cy='96' r='1.6'/></g>" },
    shavuot: { vb: [-20, -34, 176, 176], iris: ["#d9f99d", "#65a30d", "#365314"], line: "#4d7c0f",
      fg: "<path d='M-12 10 C 10 -18, 40 -24, 60 -22 C 80 -24, 110 -18, 132 10' stroke='#16a34a' stroke-width='4' fill='none' stroke-linecap='round'/>" +
        leaf(4, -6, -50, 7, "#22c55e") + leaf(36, -22, -15, 7, "#4ade80") + leaf(84, -22, 15, 7, "#22c55e") + leaf(116, -6, 50, 7, "#4ade80") +
        flowers([[-10, 8, "#fff"], [14, -14, "#f9a8d4"], [40, -24, "#fff"], [60, -26, "#fca5a5"], [80, -24, "#fff"], [106, -14, "#f9a8d4"], [130, 8, "#fff"]]) +
        "<g stroke='#ca8a04' stroke-width='2' stroke-linecap='round'><path d='M134 128 V70 M128 128 Q128 92 120 76 M140 128 Q140 92 148 78'/></g>" +
        "<g fill='#facc15'><ellipse cx='134' cy='66' rx='3.2' ry='7'/><ellipse cx='119' cy='72' rx='3' ry='6.5' transform='rotate(-25 119 72)'/><ellipse cx='149' cy='74' rx='3' ry='6.5' transform='rotate(25 149 74)'/></g>" }
  };
  var FDEFS = "<defs><clipPath id='hgfClip'>" + TILE + "</clipPath>" +
    "<linearGradient id='hgfGold' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fde68a'/><stop offset='.5' stop-color='#fbbf24'/><stop offset='1' stop-color='#d97706'/></linearGradient>" +
    "<linearGradient id='hgfHoney' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fcd34d'/><stop offset='1' stop-color='#f59e0b'/></linearGradient>" +
    "<radialGradient id='hgfApple' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#fca5a5'/><stop offset='.5' stop-color='#ef4444'/><stop offset='1' stop-color='#991b1b'/></radialGradient>" +
    "<linearGradient id='hgfWood' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#d97706'/><stop offset='.5' stop-color='#b45309'/><stop offset='1' stop-color='#78350f'/></linearGradient>" +
    "<linearGradient id='hgfCloth' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#f8fafc'/><stop offset='1' stop-color='#e2e8f0'/></linearGradient>" +
    "<radialGradient id='hgfGlow' cx='.5' cy='0' r='.95'><stop offset='0' stop-color='#fde68a' stop-opacity='.95'/><stop offset='.55' stop-color='#fef3c7' stop-opacity='.5'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient>" +
    "<linearGradient id='hgfIn' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fef3c7'/><stop offset='1' stop-color='#fde68a'/></linearGradient></defs>";
  // עין סטטית מלאה (כותרת ופייביקון)
  var eyeN = 0;
  function festEye(id, cls) {
    var F = FEYE[id]; if (!F) return "";
    var px = "hgf" + (++eyeN) + "_";
    var ir = F.iris, ln = F.line || "#0ea5e9", E = "M14 60 Q60 20 106 60 Q60 100 14 60 Z";
    return ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + (F.vb || FVB).join(" ") + "'" + (cls ? " class='" + cls + "'" : "") + " aria-hidden='true'>" + FDEFS +
      "<defs><linearGradient id='hgfBg' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff'/><stop offset='1' stop-color='#e0f2fe'/></linearGradient><radialGradient id='hgfIr' cx='.4' cy='.35' r='.75'><stop offset='0' stop-color='" + ir[0] + "'/><stop offset='.6' stop-color='" + ir[1] + "'/><stop offset='1' stop-color='" + ir[2] + "'/></radialGradient></defs>" +
      "<rect width='120' height='120' rx='26' fill='url(#hgfBg)' stroke='#bae6fd' stroke-width='1.5'/>" + (F.bg ? "<g clip-path='url(#hgfClip)'>" + F.bg + "</g>" : "") +
      "<path d='" + E + "' fill='#fff'/><circle cx='60' cy='60' r='20' fill='url(#hgfIr)'/><circle cx='60' cy='60' r='9.5' fill='#0f172a'/><circle cx='66' cy='54' r='3.5' fill='#fff'/>" +
      "<path d='" + E + "' stroke='" + ln + "' stroke-width='6' fill='none' stroke-linejoin='round'/><path d='M22 60 H34 M86 60 H98' stroke='" + (F.dash || ln) + "' stroke-width='4' stroke-linecap='round' stroke-dasharray='1 7' opacity='.8'/>" +
      F.fg + "</svg>").replace(/hgf(?=[A-Z])/g, px);
  }
  // העין החיה בדף הבית (KBH): לא מחליפים אותה (היא מסתכלת על הכלים ומצמצת) — צובעים את הקשתית ומוסיפים את הקישוט
  function decorateStage() {
    var F = FEYE[active.id], stage = document.querySelector(".kbh .stage"), eyeEl = stage && stage.querySelector(".eye");
    if (!F || !eyeEl || stage.querySelector(".hag-eyedeco")) return;
    var V = F.vb || FVB;
    var tileSvg = eyeEl.querySelector(":scope > svg");
    if (F.bg && tileSvg) { var g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.innerHTML = F.bg.replace(/hgf(?=[A-Z])/g, "hgfB_") ; if (/hgfB_/.test(g.innerHTML)) g.insertAdjacentHTML("afterbegin", "<defs>" + FDEFS.replace(/hgf(?=[A-Z])/g, "hgfB_").replace(/^<defs>|<\/defs>$/g, "") + "</defs>"); tileSvg.appendChild(g); }
    var d = el("div", { "class": "hag-eyedeco", "aria-hidden": "true" }, ("<svg viewBox='" + V.join(" ") + "' style='overflow:visible;width:100%;height:100%'>" + FDEFS + F.fg + "</svg>").replace(/hgf(?=[A-Z])/g, "hgfS_"));
    // אותו מקום וקנה מידה כמו הריבוע של העין (באחוזים מהבמה — נשאר נכון גם כשהמסך משתנה)
    var sw = stage.offsetWidth || 1, sh = stage.offsetHeight || 1, ew = eyeEl.offsetWidth || sw * .34, u = ew / 120;
    var pc = function (v, w) { return (v / w * 100).toFixed(3) + "%"; };
    d.style.cssText = "position:absolute;z-index:3;pointer-events:none;left:" + pc(eyeEl.offsetLeft + V[0] * u, sw) + ";top:" + pc(eyeEl.offsetTop + V[1] * u, sh) +
      ";width:" + pc(V[2] * u, sw) + ";height:" + pc(V[3] * u, sh);
    stage.appendChild(d);
    var ir = F.iris, ln = F.line;
    var st = "#kb-eye-ir-stage stop:nth-child(1){stop-color:" + ir[0] + "}#kb-eye-ir-stage stop:nth-child(2){stop-color:" + ir[1] + "}#kb-eye-ir-stage stop:nth-child(3){stop-color:" + ir[2] + "}" +
      (ln ? ".kbh .stage .eye{box-shadow:0 26px 60px -18px color-mix(in srgb," + ln + " 55%,transparent),0 0 0 1px color-mix(in srgb," + ln + " 22%,transparent),0 0 0 12px color-mix(in srgb," + ir[0] + " 35%,transparent),0 0 70px 10px color-mix(in srgb," + ir[1] + " 30%,transparent)}" +
        ".kbh .stage .eye path[stroke='#0ea5e9']{stroke:" + ln + "}.kbh .stage .eye path[stroke='#38bdf8']{stroke:" + (F.dash || ln) + "}" : "");
    document.head.appendChild(el("style", null, st));
    startPlay(stage);
  }

  // ---------- העין משחקת עם סמלי החג (דף הבית) ----------
  // מדי פעם, כשהעין הגדולה מסתכלת על סמל של החג, היא משחקת איתו לפי סוג הסמל (hagim-play.js, נטען רק בדף הבית).
  // העין תמיד נשארת פתוחה, והסמל תמיד לידה (מתחת, מעל או בצד) — אף פעם לא מול האישון. הסוגים:
  //   eat אוכל · dip טבילה בדבש ואכילה · seeds גרעיני רימון לפה · sip לגימה וסומק · honey דבש מטפטף לפה
  //   read קריאה (מגילה/הגדה) · light הדלקת נרות (סמל עם להבות) · spin סביבון · wear חבישה (כתר/מסכה/מדליה) · wreath זר פרחים
  //   blow תקיעה עם גלי קול (בלי קול) · wave נפנוף דגל · shake ניענוע לולב · sniff הרחה · peek הצצה פנימה
  //   plant שתילה והשקיה · boom זיקוקים · smoke עשן מהמנגל · toast מרשמלו על המדורה · shoot קשת וחץ
  //   pour מזיגת שמן לנר · coins מטבעות · find מציאת האפיקומן · lift הרמה בגאווה · twirl סיבוב · noise רעשן
  //   rot פרי רקוב/שרוף/חמוץ — נאכל ואז פרצוף "איכס" · burn שריפה (חמץ, עצים) · ride נסיעה מתחת לעין (אוטובוס, רכבת, סוס)
  //   slow זחילה לאט (שבלול, טרקטור) · leap קפיצה מעל העין · tick שעון מצלצל · play שלט משחק · juggle ג'אגלינג בשלושה
  //   upside מתהפך (ונהפוך הוא) · signal גלי קליטה מהכפתור אל העין · inspect זכוכית מגדלת · bounce קפיצה במקום — לסמלים שאינם חפץ (גרפים)
  //   "סוג@b" — המשחק על התג הקטן של הסמל (הגזר שעל הצלחת, צנצנת הדבש שעל השעון) במקום על הסמל הגדול
  // חג חדש = שורה כאן (מפתח הכלי כמו ב-ART → סוג המשחק). כל סמל שאין לו שורה — בלי משחק.
  // לא בימים עצובים (וגם לא בתענית אסתר שלפני פורים), ולא כשביקשו "בלי תנועה". בדיקה: ‎?hag=purim&eyeplay=read‎ (או all).
  var PLAY = {
    rosh:      { pach: "rot", gold: "seeds", bug: "blow", next: "dip", time: "honey@b", skip: "leap", fares: "coins", ratzif: "eat", fleet: "eat",
                 rail: "ride", bus: "ride", recep: "signal", slides: "read", speed: "slow", alerts: "blow", feeder: "eat@b", game: "play" },
    sukkot:    { pach: "peek", gold: "sniff", bug: "shake", next: "peek@b", time: "tick", skip: "leap", fares: "coins", ratzif: "shake", fleet: "twirl",
                 rail: "ride", bus: "ride", recep: "signal", slides: "read", speed: "ride", alerts: "read", feeder: "eat@b", game: "play" },
    hanukkah:  { pach: "rot", gold: "pour", bug: "spin", next: "lift@b", time: "light", skip: "eat", fares: "coins", ratzif: "lift", fleet: "juggle",
                 rail: "ride", bus: "ride", recep: "light", slides: "read", speed: "eat", alerts: "blow", feeder: "eat", game: "play" },
    tubishvat: { pach: "plant", gold: "sniff", bug: "inspect", next: "plant@b", time: "inspect", skip: "plant", fares: "coins", ratzif: "eat", fleet: "eat",
                 rail: "ride", bus: "ride", recep: "signal", slides: "read", speed: "eat", alerts: "blow", feeder: "honey", game: "play" },
    purim:     { pach: "noise", gold: "lift", bug: "upside", next: "wear", time: "read", skip: "boom", fares: "eat", ratzif: "wear", fleet: "juggle",
                 rail: "ride", bus: "ride", recep: "eat", slides: "read", speed: "ride", alerts: "blow", feeder: "eat@b", game: "play" },
    pesach:    { pach: "burn", gold: "eat", bug: "slow", next: "inspect", time: "read", skip: "leap", fares: "rot@b", ratzif: "sip", fleet: "find",
                 rail: "ride", bus: "ride", recep: "sip", slides: "read", speed: "twirl", alerts: "read", feeder: "eat", game: "play" },
    atzmaut:   { pach: "smoke", gold: "leap", bug: "boom", next: "wave", time: "eat@b", skip: "wear", fares: "eat@b", ratzif: "wave", fleet: "juggle",
                 rail: "ride", bus: "ride", recep: "wave", slides: "read", speed: "peek", alerts: "lift", feeder: "eat", game: "lift" },
    lagbaomer: { pach: "smoke", gold: "toast", bug: "shoot", next: "toast", time: "tick", skip: "eat", fares: "eat@b", ratzif: "shoot", fleet: "burn",
                 rail: "ride", bus: "ride", recep: "signal", slides: "read", speed: "smoke", alerts: "blow", feeder: "peek", game: "play" },
    shavuot:   { pach: "rot", gold: "eat", bug: "lift", next: "wave@b", time: "eat@b", skip: "leap", fares: "sip@b", ratzif: "eat", fleet: "wreath",
                 rail: "ride", bus: "ride", recep: "signal", slides: "read", speed: "slow", alerts: "blow", feeder: "eat", game: "play" }
  };
  function startPlay(stage) {
    var P = PLAY[active.id], F = FEYE[active.id];
    if (!P || H.quiet || alsoQuiet || noMotion || !stage) return;
    if (!window.__hagPlay) {
      var map = {};
      Object.keys(DK).forEach(function (k) { if (P[DK[k]]) map[k] = P[DK[k]]; });
      window.__hagPlay = { id: active.id, play: map, line: (F && F.line) || "#0ea5e9",
        // הרקע של ריבוע העין (עם קישוט החג) — לעפעף התחתון של העין המחייכת, כדי שיתמזג ברקע
        bg: F && F.bg ? ("<defs>" + FDEFS.replace(/^<defs>|<\/defs>$/g, "") + "</defs>" + F.bg).replace(/hgf(?=[A-Z])/g, "hgfP_") : "" };
    }
    loadPlay(stage);
  }
  function loadPlay(stage) {
    if (window.HagPlay) { window.HagPlay.attach(stage); return; }
    if (document.getElementById("hag-play-js")) return;
    var s = el("script", { id: "hag-play-js", src: SRC.replace(/hagim\.js(\?.*)?$/, "hagim-play.js?v=20261118b") });
    s.onload = function () { if (window.HagPlay) window.HagPlay.attach(document.querySelector(".kbh .stage")); };
    document.head.appendChild(s);
  }
  // ימים רגילים (לא חג ולא יום עצוב): משחק קטן ועדין לכל כלי, נדיר יותר מבחגים (hagim-play.js — המשחקים בסוף הקובץ)
  function daily() {
    if (window.__hagPlay || !document.addEventListener) return;
    try { if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) { return; }
    var DAILY = { kavpach: "lid", golden: "flip", kavbug: "crawl", "next-station": "signflip", "skip-stops": "leap", "line-history": "clock", "line-changes": "slides",
      bus: "gauge", "bus-speed": "speedo", alerts: "ring", fleet: "roll", rail: "train", reception: "bars", feeder: "meet", fares: "drop", ratzif: "align", game: "pad" };
    window.__hagPlay = { id: "daily", daily: true, play: DAILY, line: "#0ea5e9", bg: "" };
    // דף הבית יכול להיבנות מחדש (חזרה מכלי) — מחברים כל במה חדשה
    var go = function () { var st = document.querySelector(".kbh .stage"); if (st && !st.__hagPlay && st.querySelector(".eye")) loadPlay(st); }, pend = 0;
    go();
    try { new MutationObserver(function () { if (!pend) { pend = 1; setTimeout(function () { pend = 0; go(); }, 300); } }).observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }

  // ---------- CSS ----------
  var css = [
    ".hag-svg{width:130px;height:130px;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))}.hag-svg.wide{width:178px;height:auto}",
    ".hag-art{position:relative;height:100%;width:100%;display:flex;align-items:flex-end;justify-content:flex-end}",
    ".hag-em{font-size:90px;line-height:1;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))}.hag-two{font-size:64px;letter-spacing:-6px}.hag-three{font-size:48px;letter-spacing:-4px}",
    ".hag-multi{display:flex;align-items:flex-end;direction:ltr}.hag-multi .hag-svg{margin-right:-18px}.hag-multi.n2 .hag-svg{width:86px;height:86px}.hag-multi.n3 .hag-svg{width:78px;height:78px}.hag-multi .hag-svg:last-child{margin-right:0}",
    ".hag-emwrap{position:relative;display:inline-block;line-height:1}.hag-badge{position:absolute;right:-18px;top:-14px;font-size:36px;line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.4))}",
    ".hag-emwrap.roof .hag-badge{right:auto;left:50%;top:-30px;font-size:42px;transform:translateX(-50%) rotate(-6deg)}",
    ".hag-honey{position:relative;display:inline-block}.hag-jar{position:absolute;right:-22px;top:-30px;font-size:38px;line-height:1;transform:rotate(-35deg)}",
    ".hag-drop{position:absolute;right:16px;top:8px;width:10px;height:16px;border-radius:50% 50% 50% 50%/40% 40% 60% 60%;background:linear-gradient(#fde68a,#f59e0b);opacity:0;animation:hag-drip 2.4s ease-in infinite}",
    ".hag-drop.d2{right:34px;animation-delay:.8s}.hag-drop.d3{right:52px;animation-delay:1.6s;top:14px}",
    "@keyframes hag-drip{0%{transform:translateY(0) scaleY(.6);opacity:0}15%{opacity:1}80%{transform:translateY(64px) scaleY(1.1);opacity:1}100%{transform:translateY(74px);opacity:0}}",
    ".hag-flame{transform-origin:center 26px;animation:hag-flick 1.4s ease-in-out infinite alternate}@keyframes hag-flick{from{transform:scaleY(1)}to{transform:scaleY(.86) translateX(1px)}}",
    "html.a11y-nomotion .hag-drop,html.a11y-nomotion .hag-flame{animation:none}",
    ".glyph.hag-glyph{background:transparent!important;border:0!important;width:auto!important;height:auto!important}.glyph.hag-glyph .hag-svg{width:60px;height:60px}.glyph.hag-glyph .hag-em{font-size:44px}",
    ".hag-fl{transform-box:fill-box;transform-origin:50% 100%;animation:hag-flick 1.4s ease-in-out infinite alternate}",
    "html.a11y-nomotion .hag-fl{animation:none}@media (prefers-reduced-motion:reduce){.hag-fl,.hag-flame,.hag-drop{animation:none}}",
    // סמלי החג בדף הבית בעיצוב החדש: ריבוע מעוגל בצבע הכלי (כמו הסמלים הרגילים), והסמל בפנים — בקנה מידה של הריבוע
    ".hag-tile{position:relative;display:block;width:100%;height:100%;border-radius:28%;overflow:hidden;container-type:size;" +
      "background:radial-gradient(circle at 30% 18%,rgba(255,255,255,.38),rgba(255,255,255,0) 55%),linear-gradient(145deg,color-mix(in srgb,var(--hag-acc,#0ea5e9) 72%,#fff),color-mix(in srgb,var(--hag-acc,#0ea5e9) 70%,#0b1220));" +
      "box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.25)}",
    ".hag-tile .hag-art{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}",
    ".hag-tile .hag-svg{width:76cqw;height:76cqw;filter:drop-shadow(0 2cqw 2.5cqw rgba(0,0,0,.35))}.hag-tile .hag-svg.wide{width:88cqw;height:auto}",
    ".hag-tile .hag-em{font-size:52cqw;filter:drop-shadow(0 2cqw 2.5cqw rgba(0,0,0,.35))}.hag-tile .hag-two{font-size:38cqw;letter-spacing:-4cqw}.hag-tile .hag-three{font-size:28cqw;letter-spacing:-3cqw}",
    ".hag-tile .hag-emwrap{margin-top:8cqw}.hag-tile .hag-badge{right:-12cqw;top:-12cqw;font-size:26cqw}.hag-tile .hag-emwrap.roof .hag-badge{right:auto;top:-22cqw;font-size:26cqw}",
    ".hag-tile .hag-multi .hag-svg{width:42cqw;height:42cqw;margin-right:-10cqw}.hag-tile .hag-multi .hag-svg:last-child{margin-right:0}",
    ".hag-tile .hag-honey{margin-top:10cqw}.hag-tile .hag-jar{right:-12cqw;top:-18cqw;font-size:24cqw}.hag-tile .hag-drop{right:9cqw;top:4cqw;width:6cqw;height:10cqw}.hag-tile .hag-drop.d2{right:20cqw}.hag-tile .hag-drop.d3{right:31cqw;top:8cqw}",
    ".kbh .orb>span .hag-tile{box-shadow:none}",
    // שמות החג ארוכים מהרגילים: התווית של הסמל שהעין מסתכלת עליו נשברת לשתי שורות ולא נמרחת על הסמלים שלידה
    ".hag-fest .kbh .orb b{white-space:normal;width:max-content;max-width:7.5em;text-align:center;line-height:1.25}",
    // העין החגיגית ליד השם "הקו הבוחן"
    ".hag-beye{width:50px;height:50px;flex:none;display:inline-block;vertical-align:middle;margin:-12px 0 -12px 2px;overflow:visible}.kbh .brand svg.hag-beye{width:54px;height:54px;border-radius:0;box-shadow:none}",
    // בטלפון, בעמודי הכלים — בלי העין ליד השם, כדי שיישאר מקום לשם הכלי בסרגל
    ".hag-home .hag-hasbeye{display:inline-flex!important;align-items:center;gap:4px}@media (min-width:601px){.hag-hasbeye{display:inline-flex!important;align-items:center;gap:4px}}",
    "@media (max-width:600px){html:not(.hag-home) .hag-beye{display:none}}",
    "@media (max-width:420px){.hag-beye{width:44px;height:44px;margin:-10px 0 -10px 0}.kbh .brand svg.hag-beye{width:48px;height:48px}}",
    "#hag-pill{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:99996;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:999px;padding:6px 14px 6px 10px;font:800 13px/1.2 'Heebo',system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);display:flex;align-items:center;gap:8px;direction:rtl;max-width:92vw}",
    "#hag-pill.quiet{background:#f1f5f9;color:#334155;border-color:#cbd5e1}",
    "@media (prefers-color-scheme:dark){html:not([data-theme=light]) #hag-pill{background:#1e293b;color:#f1f5f9;border-color:#334155}html:not([data-theme=light]) #hag-pill.quiet{background:#0f172a;color:#cbd5e1}}",
    "html[data-theme=dark] #hag-pill{background:#1e293b;color:#f1f5f9;border-color:#334155}",
    "#hag-pill button{border:0;background:transparent;font-size:16px;line-height:1;cursor:pointer;color:#64748b;padding:0 2px;font-family:inherit}"
  ].join("\n");

  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k2) { e.setAttribute(k2, attrs[k2]); }); if (html != null) e.innerHTML = html; return e; }

  // ---------- החלפות בדף ----------
  // שם הכלי כפי שהוא מופיע באתר → מפתח בטבלאות למעלה
  var TOOLS = { "קו פח": "pach", "הקו המוזהב": "gold", "קו באג": "bug", "התחנה הבאה": "next", "הקו בזמן": "time",
    "הקו המדלג": "skip", "המחירון": "fares", "רציף כפול": "ratzif", "צי הרכבים": "fleet", "מדד אמינות הרכבת": "rail", "מדד דיוק האוטובוסים": "bus", "קליטה ברכבת": "recep",
    "מצגת לשינוי בקו": "slides", "איפה האוטובוס נתקע": "speed", "הקו המודיע": "alerts", "הקו המזין": "feeder", "משחק הקווים": "game" };
  // הכרטיסים והסמלים בדף הבית מזוהים לפי data-k (home/home.js — GROUPS)
  var DK = { kavpach: "pach", golden: "gold", kavbug: "bug", "next-station": "next", "skip-stops": "skip", "line-history": "time", "line-changes": "slides",
    bus: "bus", "bus-speed": "speed", alerts: "alerts", fleet: "fleet", rail: "rail", reception: "recep", feeder: "feeder", fares: "fares", ratzif: "ratzif", game: "game" };
  var ORIG = {}; Object.keys(TOOLS).forEach(function (n) { ORIG[TOOLS[n]] = n; });
  var SITE = "הקו הבוחן";
  function renameHeading(h, name, orig) {
    if (h.getAttribute("data-hag") === "1") return;
    h.setAttribute("data-hag", "1");
    var w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) { if (n.nodeValue.indexOf(orig) >= 0) { n.nodeValue = n.nodeValue.split(orig).join(name); break; } }
    // בלי השם האמיתי מתחת (שלמה 07.09: "תמחק שמגיע החג את השם של האתרים") — נשאר רק כטולטיפ
    if (!h.getAttribute("title")) h.setAttribute("title", orig);
  }
  // הצבע של כל כלי (כמו ב-home/home.js), לרקע של סמל החג בעמודי הכלים
  var ACC = { pach: "#64748b", gold: "#d97706", bug: "#6366f1", next: "#2563eb", skip: "#ea580c", time: "#7c3aed", slides: "#16a34a", bus: "#059669", speed: "#dc2626",
    alerts: "#c026d3", fleet: "#2563eb", rail: "#0284c7", recep: "#7c3aed", feeder: "#16a34a", fares: "#059669", ratzif: "#0891b2", game: "#e11d48" };
  // הסמל שלצד הכותרת בעמוד הכלי: אלמנט שיש בו רק svg או תמונה, ממש לפני הכותרת או לפני העטיפה שלה
  function onlyArt(x) { return Array.prototype.every.call(x.childNodes, function (n) { return n.nodeType === 1 ? /^(svg|img)$/i.test(n.tagName) : !(n.nodeValue || "").trim(); }); }
  function pageIcon(h) {
    var c = [h.previousElementSibling, h.parentElement && h.parentElement.previousElementSibling];
    for (var i = 0; i < c.length; i++) {
      var x = c[i];
      if (x && /^(span|div)$/i.test(x.tagName) && x.querySelector("svg, img") && onlyArt(x) && x.getBoundingClientRect().width <= 160) return x;
    }
    return null;
  }
  function accOf(k, key) {
    if (!k) return ACC[key] || "";
    try { var A = window.KBH && window.KBH.ALL; for (var i = 0; A && i < A.length; i++) if (A[i].k === k) return A[i].a; } catch (e) { /* ignore */ }
    return ACC[key] || "";
  }
  function tileOf(box, key, k) {
    var art = ART[active.id] && ART[active.id][key];
    if (!box || !art || box.querySelector(".hag-tile")) return;
    var t = el("span", { "class": "hag-tile", "aria-hidden": "true" }, "<span class='hag-art'>" + art + "</span>");
    var acc = accOf(k, key); if (acc) t.style.setProperty("--hag-acc", acc);
    box.innerHTML = ""; box.appendChild(t);
  }
  function apply() {
    try {
      if (H.quiet) return;
      // "הקו הבוחן": השם בכותרת הדף + העין החגיגית בקישור לשם האתר (בדף הבית ובסרגל העליון של הכלים)
      Array.prototype.forEach.call(document.querySelectorAll("h1, a.brand, a.kb-brand"), function (h) {
        if (h.getAttribute("data-hag") === "1") return;
        var t = (h.textContent || "").trim();
        if (t === SITE && H.hub) {
          renameHeading(h, H.hub, SITE);
          if (h.tagName.toLowerCase() === "a" && FEYE[active.id]) { h.classList.add("hag-hasbeye"); h.insertAdjacentHTML("afterbegin", festEye(active.id, "hag-beye")); }
          return;
        }
        if (h.tagName.toLowerCase() !== "h1") return;
        // כותרת של כלי בעמוד שלו ("🕰️ הקו בזמן", "קו פח", "הקו המוזהב", "התחנה הבאה")
        Object.keys(TOOLS).forEach(function (orig) {
          if (t.indexOf(orig) >= 0 && H[TOOLS[orig]]) {
            renameHeading(h, H[TOOLS[orig]], orig);
            // הסמל של הכלי לצד הכותרת: אותו סמל חג כמו בכרטיס בדף הבית (שלמה 19.09)
            var g = pageIcon(h);
            if (g) tileOf(g, TOOLS[orig], "");
          }
        });
      });
      // שם הכלי בסרגל העליון של הכלים ("הקו הבוחן | הקו המודיע")
      Array.prototype.forEach.call(document.querySelectorAll(".crumb, .kb-crumb"), function (c) {
        if (c.getAttribute("data-hag") === "1") return;
        var t = (c.textContent || "").trim(), key = TOOLS[t];
        if (key && H[key]) renameHeading(c, H[key], t);
      });
      // דף הבית: הכרטיסים (שם + סמל) והסמלים סביב העין
      Array.prototype.forEach.call(document.querySelectorAll(".kbh .card[data-k], .kbh .orb[data-k]"), function (c) {
        var k = c.getAttribute("data-k"), key = DK[k];
        if (!key) return;
        var isOrb = c.classList.contains("orb");
        var nm = c.querySelector(isOrb ? "b" : "h2");
        if (nm && H[key] && nm.getAttribute("data-hag") !== "1") renameHeading(nm, H[key], ORIG[key]);
        tileOf(c.querySelector(isOrb ? ":scope > span" : ".ico"), key, k);
      });
      decorateStage();
    } catch (e) { /* ignore */ }
  }

  function pill() {
    var key = "kb-hag-" + active.id + "-" + gy;
    try { if (!preview && localStorage.getItem(key)) return; } catch (e) { /* ignore */ }
    var greet = H.greet;
    if (alsoQuiet && N[alsoQuiet.id]) greet = N[alsoQuiet.id].greet + " · " + greet;   // "צום קל — תענית אסתר · פורים שמח"
    var p = el("div", { id: "hag-pill", role: "status" }, "<span>" + H.ico + "</span><span>" + greet + "</span>");
    if (H.quiet) p.className = "quiet";
    var x = el("button", { type: "button", "aria-label": "סגירה" }, "×");
    x.addEventListener("click", function () { p.remove(); try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ } });
    p.appendChild(x);
    document.body.appendChild(p);
  }
  function favicon() {
    try {
      // בחג — העין החגיגית של הקו הבוחן; ביום שקט — הסמל השקט (נר, יונה)
      var svg = !H.quiet && FEYE[active.id] ? festEye(active.id) : "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='52' font-size='52'>" + H.ico + "</text></svg>";
      var href = "data:image/svg+xml," + encodeURIComponent(svg);
      var links = document.querySelectorAll("link[rel~='icon']");
      if (!links.length) { var l = el("link", { rel: "icon" }); document.head.appendChild(l); links = [l]; }
      Array.prototype.forEach.call(links, function (ln) { ln.setAttribute("href", href); ln.removeAttribute("sizes"); ln.setAttribute("type", "image/svg+xml"); });
      if (!H.quiet && document.title.indexOf(H.ico) < 0) document.title = H.ico + " " + document.title;
    } catch (e) { /* ignore */ }
  }

  function init() {
    document.head.appendChild(el("style", null, css));
    document.documentElement.classList.add("hag-" + active.id, H.quiet ? "hag-quiet" : "hag-fest");
    if (document.querySelector(".kbh, #static-choice")) document.documentElement.classList.add("hag-home");
    favicon();
    pill();
    apply();
    try { new MutationObserver(apply).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
