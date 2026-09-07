/* חגים — שמות וסמלים חגיגיים לכל האתר (בקשת שלמה 07.09).

   בכל חג שמות הכלים משתנים ("קו פח" → "הרימון הרקוב" בראש השנה), הסמלים
   בכרטיסי דף הבית מתחלפים בסמל של החג, "הקו הבוחן" עצמו מקבל שם ועין
   חגיגיים, ויש פייביקון ושורת ברכה. השם האמיתי לא מוצג (רק כטולטיפ).
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
    if (!active) return;
    if (fest && qt) alsoQuiet = qt;
  }

  // ---------- שמות וברכות ----------
  var years = gy - 1948 + (nowG.month > "05" ? 0 : 0);   // יום העצמאות של אותה שנה לועזית
  var N = {
  // לכל חג — כל כלי מקבל סמל אחר של החג, ואף מילה לא חוזרת בשני שמות
  // (שלמה 07.09: "חצי מהסמלים הם מסכות", "יש כבר אתר עם אושפיזין")
    rosh:      { hub: "הקו המתוק", greet: "שנה טובה ומתוקה מהקו הבוחן", ico: "🍎", pach: "הרימון הרקוב", gold: "613 גרעינים", bug: "העיקוף של השנה", next: "תחנה טובה", time: "השנה שהייתה", skip: "הקו שמדלג לשנה הבאה", fares: "מחיר הדבש", ratzif: "תפוח כפול", fleet: "צי החלות", rail: "רכבת התקיעות", bus: "דיוק בתשליך" },
    sukkot:    { hub: "הסוכה הבוחנת", greet: "חג סוכות שמח", ico: "🌿", pach: "הסוכה הרעועה", gold: "האתרוג המהודר", bug: "הלולב העקום", next: "תחנת אושפיזין", time: null, skip: "הקו שדילג על ההדס", fares: "מחיר הערבה", ratzif: "סכך כפול", fleet: "צי הקישוטים", rail: "רכבת שמחת תורה", bus: "אוטובוס ארבעת המינים" },
    hanukkah:  { hub: "הקו המאיר", greet: "חג אורים שמח", ico: "🕎", pach: "הסופגנייה השרופה", gold: "פך השמן", bug: "הסביבון שסטה", next: "נר תחנה", time: "שמונה ימים של שינויים", skip: "הקו שדילג על הלביבה", fares: "מחיר דמי החנוכה", ratzif: "חנוכייה כפולה", fleet: "צי המכבים", rail: "רכבת האורים", bus: "נס גדול היה פה" },
    tubishvat: { hub: "הקו הפורח", greet: "ט\"ו בשבט שמח", ico: "🌳", pach: "העץ היבש", gold: "השקדייה הפורחת", bug: "השורש העקום", next: null, time: "טבעות העץ", skip: "הקו שדילג על השתילה", fares: "מחיר הצימוקים", ratzif: "זית כפול", fleet: "צי הפירות", rail: "רכבת שבעת המינים", bus: "האוטובוס הירוק" },
    purim:     { hub: "הקו המתחפש", greet: "פורים שמח", ico: "🎭", pach: "הרעשן", gold: "משלוח מנות", bug: "ונהפוך הוא", next: "התחפושת", time: "מגילת הקו", skip: "הקו שדילג על המשתה", fares: "מחיר אוזני המן", ratzif: "כתר כפול", fleet: "צי הליצנים", rail: "רכבת שושן הבירה", bus: "אוטובוס אחשוורוש" },
    pesach:    { hub: "הקו בודק חמץ", greet: "חג פסח שמח", ico: "🍷", pach: "החמץ", gold: "האפיקומן", bug: "ארבעים שנה במדבר", next: "מה נשתנה", time: "ההגדה של הקו", skip: "הקו שפסח", fares: "מחיר המרור", ratzif: "כוס כפולה", fleet: "צי המצות", rail: "רכבת יציאת מצרים", bus: "אוטובוס עשר המכות" },
    atzmaut:   { hub: "הקו הכחול-לבן", greet: "יום עצמאות שמח", ico: "🇮🇱", pach: "המנגל הכבוי", gold: "המטס", bug: "הזיקוק שסטה", next: null, time: years + " שנים של קווים", skip: "הקו שדילג על הטקס", fares: "מחיר הקבב", ratzif: "דגל כפול", fleet: "צי חיל הים", rail: "רכבת העצמאות", bus: "האוטובוס עם הפטיש" },
    lagbaomer: { hub: "הקו הבוער", greet: "ל\"ג בעומר שמח", ico: "🔥", pach: "המדורה שכבתה", gold: "המדורה הגדולה", bug: "הקשת שהתעקמה", next: null, time: null, skip: "הקו שדילג על המרשמלו", fares: "מחיר תפוח האדמה", ratzif: "חץ כפול", fleet: "צי הזרדים", rail: "רכבת מירון", bus: "אוטובוס על האש" },
    shavuot:   { hub: "הקו הלבן", greet: "חג שבועות שמח", ico: "🧀", pach: "הגבינה שהחמיצה", gold: "עוגת הגבינה", bug: "הביכורים שהלכו לאיבוד", next: null, time: null, skip: "הקו שדילג על התיקון", fares: "מחיר החלב", ratzif: "בלינצ'ס כפול", fleet: "צי הפרחים", rail: "רכבת הר סיני", bus: "אוטובוס מגילת רות" },
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
  var dreidel = W + line + "<polyline points='18,64 44,30 70,64 96,30 122,64' fill='none' stroke='#ef8a17' stroke-width='9' stroke-linecap='round' stroke-linejoin='round' opacity='.55'/><g transform='rotate(22 92 40)'><rect x='76' y='14' width='32' height='32' rx='4' fill='#2563eb' stroke='#0f172a' stroke-width='3'/><path d='M76 46 L108 46 L92 66 Z' fill='#1d4ed8' stroke='#0f172a' stroke-width='3'/><rect x='89' y='2' width='6' height='14' fill='#0f172a'/><text x='92' y='38' text-anchor='middle' font-size='20' font-weight='900' fill='#fff'>נ</text></g>" + dots + E;
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
                 skip: em("🗓️", "⏭️"), fares: em("🎫", "🍯"), ratzif: two("🍎"), fleet: three("🥯"), rail: rail("📯"), bus: bus("🐟") },
    sukkot:    { pach: sukkah, gold: etrog, bug: lulav, next: em("🚏", "🛖"), time: em("🕰️", "🍂"),
                 skip: em("🌿", "⏭️"), fares: em("🎫", "🍃"), ratzif: two("🌴"), fleet: three("🏮"), rail: rail("📜"), bus: bus("🍋") },
    hanukkah:  { pach: sufg, gold: jug, bug: dreidel, next: em("🚏", "🕯️"), time: menorah(),
                 skip: em("🥞", "⏭️"), fares: em("🎫", "🪙"), ratzif: two("🕎"), fleet: three("🛡️"), rail: rail("✨"), bus: bus("🪔") },
    tubishvat: { pach: dryTree, gold: blossom, bug: root, next: em("🚏", "🌳"), time: rings,
                 skip: em("🌱", "⏭️"), fares: em("🎫", "🍇"), ratzif: two("🫒"), fleet: "<span class='hag-em hag-three'>🍎🍐🍊</span>", rail: rail("🌾"), bus: bus("🍃") },
    purim:     { pach: gragger, gold: basket, bug: flipped, next: em("🎭"), time: scroll,
                 skip: em("🎉", "⏭️"), fares: oznei, ratzif: two("👑"), fleet: three("🤡"), rail: rail("🏰"), bus: bus("🐎") },
    pesach:    { pach: em("🍞"), gold: matzah, bug: desert, next: em("🚏", "❓"), time: em("📖", "🍷"),
                 skip: em("🐑", "⏭️"), fares: em("🎫", "🥬"), ratzif: two("🍷"), fleet: multi(matzah.replace(/<text[^>]*>✨<\/text>/, ""), 3), rail: rail("🌊"), bus: bus("🐸") },
    atzmaut:   { pach: grill, gold: flyover, bug: fwZig, next: em("🇮🇱"), time: em("🕰️", "🎂"),
                 skip: em("🏅", "⏭️"), fares: em("🎫", "🍢"), ratzif: two("🇮🇱"), fleet: three("⚓"), rail: rail("🎆"), bus: bus("🔨") },
    lagbaomer: { pach: fireOut, gold: fireBig, bug: bow, next: em("🔥"), time: em("🕰️", "🌙"),
                 skip: em("🍡", "⏭️"), fares: em("🎫", "🥔"), ratzif: two("🏹"), fleet: three("🪵"), rail: rail("⛰️"), bus: bus("🍖") },
    shavuot:   { pach: cheese, gold: em("🍰", "✨"), bug: bikkurim, next: em("🚏", "🌾"), time: em("🕰️", "🧀"),
                 skip: em("🌙", "⏭️"), fares: em("🎫", "🥛"), ratzif: two("🥞"), fleet: three("💐"), rail: rail("⛰️"), bus: bus("📜") }
  };
  // העין של "הקו הבוחן" בכל חג
  function eye(pupil, extra, stroke) {
    stroke = stroke || "#38bdf8";
    return "<svg viewBox='0 0 120 120' class='hag-eye' aria-hidden='true'><rect width='120' height='120' rx='26' fill='#0f172a'/><path d='M14 60 Q60 20 106 60 Q60 100 14 60 Z' stroke='" + stroke + "' stroke-width='6' fill='none' stroke-linejoin='round'/>" + pupil + "<path d='M22 60 H34 M86 60 H98' stroke='" + stroke + "' stroke-width='4' stroke-linecap='round' stroke-dasharray='1 7'/>" + (extra || "") + "</svg>";
  }
  var PUP = "<circle cx='60' cy='60' r='20' fill='#38bdf8'/><circle cx='60' cy='60' r='9.5' fill='#0f172a'/><circle cx='66' cy='54' r='3.5' fill='#fff'/>";
  var EYES = {
    rosh: eye("<circle cx='60' cy='62' r='19' fill='#ef4444'/><path d='M56 44 q4 -8 8 -2' stroke='#16a34a' stroke-width='4' fill='none' stroke-linecap='round'/><circle cx='66' cy='56' r='3.5' fill='#fff' opacity='.8'/>", "<path d='M70 96 q14 -6 22 4' stroke='#f59e0b' stroke-width='6' fill='none' stroke-linecap='round'/>"),
    sukkot: eye(PUP, "<path d='M8 28 L112 22' stroke='#16a34a' stroke-width='7' stroke-linecap='round'/><path d='M14 20 L104 14 M20 12 L98 8' stroke='#22c55e' stroke-width='4' stroke-linecap='round' opacity='.8'/>"),
    hanukkah: eye("<ellipse cx='60' cy='58' rx='12' ry='20' fill='#fb923c'/><ellipse cx='60' cy='63' rx='6' ry='11' fill='#fde68a'/><rect x='56' y='78' width='8' height='18' rx='2' fill='#fff'/>", "", "#fbbf24"),
    tubishvat: eye("<circle cx='60' cy='60' r='20' fill='#16a34a'/><circle cx='52' cy='54' r='5' fill='#f9a8d4'/><circle cx='66' cy='66' r='5' fill='#f9a8d4'/><circle cx='66' cy='52' r='4' fill='#fbbf24'/>", "<path d='M60 96 V80' stroke='#92400e' stroke-width='5' stroke-linecap='round'/>", "#4ade80"),
    purim: eye(PUP, "<path d='M18 50 Q60 30 102 50 Q104 72 80 78 Q60 84 40 78 Q16 72 18 50 Z' fill='#a855f7' opacity='.85'/><path d='M40 58 Q50 50 60 58 M60 58 Q70 50 80 58' stroke='#0f172a' stroke-width='4' fill='none' stroke-linecap='round'/><circle cx='50' cy='58' r='5' fill='#0f172a'/><circle cx='70' cy='58' r='5' fill='#0f172a'/><path d='M100 46 q14 -20 -2 -28' stroke='#fbbf24' stroke-width='5' fill='none' stroke-linecap='round'/>"),
    pesach: eye(PUP, "<path d='M92 18 q-12 20 4 44' stroke='#fde68a' stroke-width='5' fill='none' stroke-linecap='round'/><path d='M92 18 q-8 6 -14 4 q8 -2 10 -12 q4 6 12 6 q-8 2 -8 2' fill='#fde68a'/><rect x='18' y='86' width='26' height='12' rx='2' fill='#fbbf24'/><ellipse cx='31' cy='80' rx='4' ry='8' fill='#fb923c'/>"),
    atzmaut: eye("<circle cx='60' cy='60' r='20' fill='#fff'/><path d='M50 52 L70 52 L60 70 Z M50 68 L70 68 L60 50 Z' fill='none' stroke='#1d4ed8' stroke-width='3'/>", "<path d='M14 26 H106 M14 94 H106' stroke='#1d4ed8' stroke-width='5'/>", "#93c5fd"),
    lagbaomer: eye("<path d='M60 36 C 72 50, 82 60, 78 74 C 76 84, 68 88, 60 86 C 50 86, 42 78, 44 68 C 46 60, 52 56, 50 46 C 56 52, 58 56, 60 36 Z' fill='#f97316'/><path d='M60 56 C 66 64, 70 70, 68 78 C 66 82, 62 84, 60 83 C 55 83, 51 78, 52 73 C 53 68, 56 66, 60 56 Z' fill='#fde047'/>", "", "#fb923c"),
    shavuot: eye("<circle cx='60' cy='60' r='20' fill='#fef3c7'/><circle cx='54' cy='56' r='4' fill='#fbbf24'/><circle cx='66' cy='64' r='3.5' fill='#fbbf24'/><circle cx='64' cy='52' r='2.5' fill='#fbbf24'/>", "<path d='M20 98 q10 -14 20 0 q10 -14 20 0' stroke='#fde68a' stroke-width='4' fill='none' stroke-linecap='round'/>", "#fde68a")
  };

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
    ".hag-eye{width:44px;height:44px;flex:none}@media (min-width:768px){.hag-eye{width:56px;height:56px}}",
    "#hag-pill{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:99996;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:999px;padding:6px 14px 6px 10px;font:800 13px/1.2 'Heebo',system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);display:flex;align-items:center;gap:8px;direction:rtl;max-width:92vw}",
    "#hag-pill.quiet{background:#f1f5f9;color:#334155;border-color:#cbd5e1}",
    "#hag-pill button{border:0;background:transparent;font-size:16px;line-height:1;cursor:pointer;color:#64748b;padding:0 2px;font-family:inherit}"
  ].join("\n");

  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k2) { e.setAttribute(k2, attrs[k2]); }); if (html != null) e.innerHTML = html; return e; }

  // ---------- החלפות בדף ----------
  var TOOLS = { "קו פח": "pach", "הקו המוזהב": "gold", "קו באג": "bug", "התחנה הבאה": "next", "הקו בזמן": "time",
    "הקו המדלג": "skip", "המחירון": "fares", "רציף כפול": "ratzif", "צי הרכבים": "fleet", "מדד אמינות הרכבת": "rail", "מדד דיוק האוטובוסים": "bus" };
  function renameHeading(h, name, orig) {
    if (h.getAttribute("data-hag") === "1") return;
    h.setAttribute("data-hag", "1");
    var w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) { if (n.nodeValue.indexOf(orig) >= 0) { n.nodeValue = n.nodeValue.split(orig).join(name); break; } }
    // בלי השם האמיתי מתחת (שלמה 07.09: "תמחק שמגיע החג את השם של האתרים") — נשאר רק כטולטיפ
    if (!h.getAttribute("title")) h.setAttribute("title", orig);
  }
  function apply() {
    try {
      if (H.quiet) return;
      // "הקו הבוחן": שם + עין (דף הבית)
      var SITE = "הקו הבוחן";
      Array.prototype.forEach.call(document.querySelectorAll("h1"), function (h) {
        if (h.getAttribute("data-hag") === "1") return;
        var t = (h.textContent || "").trim();
        if (t === SITE && H.hub) {
          renameHeading(h, H.hub, SITE);
          var s = h.previousElementSibling;
          if (s && s.tagName.toLowerCase() === "svg" && EYES[active.id]) {
            s.style.display = "none";
            var wrap = el("span", { "class": "hag-eyewrap" }, EYES[active.id]);
            s.parentNode.insertBefore(wrap, h);
          }
          return;
        }
        // כותרת של כלי בעמוד שלו ("🕰️ הקו בזמן", "קו פח", "הקו המוזהב", "התחנה הבאה")
        Object.keys(TOOLS).forEach(function (orig) {
          if (t.indexOf(orig) >= 0 && H[TOOLS[orig]]) renameHeading(h, H[TOOLS[orig]], orig);
        });
      });
      // כרטיסי דף הבית: h2 עם שם הכלי, והסמל בקופסה שלפניו
      Array.prototype.forEach.call(document.querySelectorAll("h2"), function (h) {
        if (h.getAttribute("data-hag") === "1") return;
        var t = (h.textContent || "").trim(), key = TOOLS[t];
        if (!key) return;
        if (H[key]) renameHeading(h, H[key], t); else h.setAttribute("data-hag", "1");
        var box = h.previousElementSibling, art = ART[active.id] && ART[active.id][key];
        if (box && art && box.tagName.toLowerCase() === "div" && !box.querySelector(".hag-art")) {
          box.innerHTML = "";
          box.appendChild(el("div", { "class": "hag-art", "aria-hidden": "true" }, art));
        }
      });
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
      var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='52' font-size='52'>" + H.ico + "</text></svg>";
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
    favicon();
    pill();
    apply();
    try { new MutationObserver(apply).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
