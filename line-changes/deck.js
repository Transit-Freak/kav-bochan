/* מצגת לשינוי בקו — בניית השקפים מנתוני השינוי (data/l/<id>.json).
   כל שקף הוא קנבס 1280×720; התצוגה המקדימה מקטינה אותו, וההדפסה (PDF) מדפיסה אותו בגודל מלא.
   סדר השקפים, כמו במצגות שהוכנו ביד: שער · (סקירה, כשיש כמה קווים) · לכל כיוון נסיעה: מפה ותחנות · סיום.
   הטקסט בשקפים — בשפה של נוסעים: בלי מק"ט, כיוון, חלופה או GTFS. */
var LCDeck = (function () {
  var E = LC.esc;
  // מוקדי המידע של החברות — רק מספרים שבדקנו. חברה שאין לה מספר כאן מופיעה בלי מספר.
  /* מוקדי המידע של החברות: מ-agency_phone ב-GTFS (data/lines.json → op_phones, דרך LCDeck.setPhones), ואם אין — מהטבלה כאן
     (agency.txt מ-19.11.2026). ההתאמה לפי השם המדויק של החברה ("דן בדרום" אינו "דן").
     חברה שהמוקד שלה הוא 8787 (של משרד התחבורה) — לא מופיעה לחוד, רק "משרד התחבורה *8787" */
  var PHONES = { 'אגד': '2800', 'אלקטרה אפיקים': '6686', 'אלקטרה אפיקים תחבורה': '6686', 'דן': '3456', 'דן בדרום': '5467', 'דן באר שבע': '3527',
    'מטרופולין': '5900', 'קווים': '2060', 'גלים': '0737968430', 'סופרבוס': '1-700-700-181', 'בית שמש אקספרס': '3343', 'אקסטרה': '6747',
    'אקסטרה ירושלים': '6747', 'תנופה': '8797', 'נתיב אקספרס': '3553', 'נסיעות ותיירות': '3553', 'ש.א.מ': '3553', 'גי.בי.טורס': '046036100',
    'מוניות מטרו קו': '0737801500', 'רכבת ישראל': '5770' };
  var OP_PH = {};
  function setPhones(ops, phones) { OP_PH = {}; (ops || []).forEach(function (o, i) { if (phones && phones[i]) OP_PH[phKey(o)] = String(phones[i]); }); }
  function phKey(op) { return String(op || '').replace(/''/g, '"').replace(/\s+/g, ' ').trim(); }
  /* 2800 → *2800 · 0737968430 → 073-796-8430 · 046036100 → 04-603-6100 · 1700700181 → 1-700-700-181 */
  function fmtPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 4) return '*' + d;
    if (/^1[5-9]00\d{6}$/.test(d)) return d.slice(0, 1) + '-' + d.slice(1, 4) + '-' + d.slice(4, 7) + '-' + d.slice(7);
    if (/^0[5-7]\d{8}$/.test(d)) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    if (/^0[2-489]\d{7}$/.test(d)) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
    return String(v).trim();
  }
  function phoneOf(op) {
    var k = phKey(op), raw = OP_PH[k] || PHONES[k] || '';
    return String(raw).replace(/\D/g, '') === '8787' ? '' : fmtPhone(raw);
  }
  var MOT = '*8787';

  /* תאריך עברי באותיות: "ז׳ בכסלו תשפ״ז" (Intl נותן רק ספרות: "7 בכסלו 5787") */
  function gem(n) {
    var L = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'],
             [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
    var out = '';
    L.forEach(function (x) { while (n >= x[0]) { out += x[1]; n -= x[0]; } });
    out = out.replace('יה', 'טו').replace('יו', 'טז');
    return out.length === 1 ? out + '׳' : out.slice(0, -1) + '״' + out.slice(-1);
  }
  function hebDate(iso) {
    try {
      var p = iso.split('-');
      var parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' })
        .formatToParts(new Date(+p[0], +p[1] - 1, +p[2], 12));
      var get = function (t) { return (parts.filter(function (x) { return x.type === t; })[0] || {}).value || ''; };
      var day = parseInt(get('day'), 10), year = parseInt(get('year'), 10), month = get('month');
      if (!day || !year || !month) return '';
      return gem(day) + ' ב' + month.replace(/^ב/, '') + ' ' + gem(year % 1000);
    } catch (e) { return ''; }
  }
  function start(c) { return c.formal || c.eff; }
  // וריאנט חלופי של קו = רק חלק מהנסיעות. לנוסעים: "בחלק מהנסיעות", בלי המונח "חלופה"
  function altTxt(d) { return (d.alt && d.alt !== '#' && d.alt !== '0') ? ' (בחלק מהנסיעות)' : ''; }
  function plural(n, one, many) { return n === 1 ? one : n + ' ' + many; }
  function dist(a, b) { var cl = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * cl); }

  /* שם לנסיעה בשפה של נוסעים: "מקרית גת לחצור הגלילית"; קו מעגלי — "הקו" */
  // "ת. מרכזית אשדוד" → "התחנה המרכזית אשדוד", כדי שייקרא "מהתחנה המרכזית" ולא "מת. מרכזית"
  function firstStreet(d) { var st = (d.new.stops[0] || d.old.stops[0]); return st ? streetOf(st.name).replace(/^ת\.\s*מרכזית/, 'התחנה המרכזית').replace(/^תחנה מרכזית/, 'התחנה המרכזית') : ''; }
  function trip(d) {
    var o = d.od || [], A = endName(d, 0), B = endName(d, 1);
    if (!o[0] || !o[1] || o[0] === o[1]) {
      // קו בתוך העיר: מאיפה לאן (התחנה הראשונה והאחרונה); קו מעגלי — רק מאיפה
      if (A && B && skey(A) !== skey(B)) return 'הקו ב' + o[0] + ', מ' + A + ' ל' + B;
      return 'הקו' + (o[0] ? ' ב' + o[0] : '') + (A ? ', מ' + A : '');
    }
    return 'מ' + o[0] + ' ל' + o[1];
  }
  function toward(d) {
    var o = d.od || [], B = endName(d, 1);
    if (!o[0] || !o[1] || o[0] === o[1]) return B && skey(B) !== skey(endName(d, 0)) ? 'בנסיעה ל' + B : (firstStreet(d) ? 'בנסיעה מ' + firstStreet(d) : 'בקו');
    return 'בנסיעה ל' + o[1];
  }
  /* שם קצר לתחנה הראשונה (0) או האחרונה (1) במסלול החדש: "ת. מרכזית אשדוד/רציפים" → "התחנה המרכזית אשדוד", "רכבת/מסוף" → "הרכבת" */
  function endName(d, last) {
    var S = d.new.stops.length ? d.new.stops : d.old.stops, st = last ? S[S.length - 1] : S[0];
    if (!st) return '';
    var t = String(st.name).split('/')[0].trim();
    if (/^(ת\.\s*מרכזית|תחנה מרכזית)/.test(t)) return t.replace(/^(ת\.\s*מרכזית|תחנה מרכזית)/, 'התחנה המרכזית');
    if (/^(רכבת|ת\. רכבת|תחנת רכבת)$/.test(t)) return 'תחנת הרכבת';
    if (/^רכבת\s/.test(t)) return t.replace(/^רכבת\s/, 'תחנת הרכבת ');
    return streetOf(st.name);
  }
  /* "הקו כבר לא יעצור ב-16 תחנות, ויעצור ב-5 תחנות חדשות" */
  function stopsSentence(r, a, geo) {
    var s = [];
    if (r) s.push(r === 1 ? 'הקו כבר לא יעצור בתחנה אחת' : 'הקו כבר לא יעצור ב-' + r + ' תחנות');
    if (a) s.push((r ? 'ויעצור ב-' : 'הקו יעצור ב-') + (a === 1 ? 'תחנה חדשה אחת' : a + ' תחנות חדשות'));
    var out = s.join(', ');
    if (geo) out = out ? 'הקו נוסע בדרך אחרת. ' + out.charAt(0) + out.slice(1) : 'הקו נוסע בדרך אחרת, והתחנות לא משתנות';
    return out;
  }

  /* התחנה הקרובה במסלול החדש לכל תחנה שמבוטלת. המרחק בקו אווירי × 1.25 (הערכה להליכה), מעוגל ל-50 מ' */
  var NEAR_MAX = 600;
  function nearest(s, d) {
    // מסלול הליכה אמיתי (מהבנייה הלילית, לפי מפת הרחובות): התחנה שהכי מהר להגיע אליה ברגל
    var w = d.walk && d.walk[s.code];
    if (w) {
      if (w.none) return { none: true };
      var to = d.new.stops.filter(function (n) { return n.code === w.to; })[0];
      if (to) return { name: to.name, ll: to.ll, m: Math.max(50, Math.round(w.m / 50) * 50), min: Math.max(1, Math.round(w.m / 75)), path: w.line };
    }
    var best = null, bd = Infinity;
    d.new.stops.forEach(function (n) { if (n.code !== s.code) { var x = dist(s.ll, n.ll); if (x < bd) { bd = x; best = n; } } });
    if (!best) return null;
    var walk = Math.max(50, Math.round(bd * 1.25 / 50) * 50);
    return walk <= NEAR_MAX ? { name: best.name, ll: best.ll, m: walk } : { none: true };
  }

  /* "כ-5 דק׳ הליכה (400 מ׳)" כשיש מסלול הליכה אמיתי, אחרת "כ-400 מ׳ הליכה" */
  /* אין תחנה קרובה במקום תחנה שמבוטלת: "של קו N" — כדי שלא ייקרא כאילו אין שום תחנה בסביבה (d._nn — ב-build) */
  var NN_CUR = '';
  function noNear(d) { return 'לא נמצאה תחנה חלופית קרובה ' + ((d && d._nn) || NN_CUR || 'של הקו') + ' במסלול החדש'; }
  function walkTxt(nr) { return nr.min ? 'כ-' + nr.min + ' דק׳ הליכה, ' + nr.m + ' מ׳' : 'כ-' + nr.m + ' מ׳ הליכה'; }

  function dirLead(d) {
    var s = '<b>' + E(stopsSentence(d.removed.length, d.added.length, d.geo)) + '.</b>';
    if (d.moved.length) s += ' ' + plural(d.moved.length, 'תחנה אחת עוברת', 'תחנות עוברות') + ' למקום קרוב.';
    var ch = {};
    d.added.concat(d.removed).forEach(function (c) { ch[c] = 1; });
    var cities = {};
    d.old.stops.concat(d.new.stops).forEach(function (st) { if (ch[st.code] && st.city) cities[st.city] = 1; });
    var cl = Object.keys(cities);
    if (cl.length) s += ' השינויים ב' + (cl.length > 3 ? cl.slice(0, 3).join(', ') + ' ועוד' : cl.join(', ')) + '.';
    return s;
  }

  function autoIntro(pages) {
    var k = pages.length === 1 && pages[0].kind;
    if (k === 'new') return 'בעמודים הבאים: מפה של המסלול, כל התחנות, ומתי הקו נוסע.';
    if (k === 'ended') return 'בעמודים הבאים: מפה של המסלול, ואילו קווים אחרים עוצרים באותן תחנות.';
    if (k === 'timetable') return 'המסלול והתחנות לא משתנים — רק השעות. בעמודים הבאים: לוח הזמנים הישן והחדש.';
    if (pages.every(function (p) { return p.kind === 'timetable'; })) return 'המסלולים לא משתנים — רק השעות. בעמודים הבאים: לוח הזמנים של כל קו.';
    var t = pages.length === 1 ? (pages[0].tot || {}) : null;
    if (t && (t.add || 0) + (t.rem || 0) + (t.mv || 0) <= 3 && !t.geo) return 'בעמודים הבאים: מפה קרובה של המקום שבו התחנה משתנה.';
    var rem = pages.some(function (p) { return (p.tot || {}).rem; });
    if (pages.every(function (p) { return (p.tot || {}).ext; })) return 'בעמודים הבאים: מפה של הקטע החדש במסלול.';
    // רק תחנות (הדרך לא משתנה באף קו)
    if (pages.every(function (p) { return !p.kind && !(p.tot || {}).geo; })) {
      var add = pages.some(function (p) { return (p.tot || {}).add; }), mv = pages.some(function (p) { return (p.tot || {}).mv; });
      var many = pages.reduce(function (n, p) { return n + ((p.tot || {}).add || 0) + ((p.tot || {}).rem || 0); }, 0) > 1 && pages.length === 1;
      if (add && !rem && !mv) return 'בעמודים הבאים: מפה עם ' + (many ? 'התחנות החדשות.' : 'התחנה החדשה.');
      if (rem && !add && !mv) return 'בעמודים הבאים: מפה עם ' + (many ? 'התחנות שמבוטלות' : 'התחנה שמבוטלת') + ', ואיפה התחנה הקרובה.';
      return 'בעמודים הבאים: מפה של התחנות שמשתנות.';
    }
    return 'בעמודים הבאים: מפה של המסלול הישן והחדש' + (rem ? ', ואיפה התחנה הקרובה במקום כל תחנה שמבוטלת.' : '.');
  }
  /* שם המצגת: יחיד רק כשיש בדיוק קו אחד. כמה קווים: "שינויים בקווים 9, 18 ו-54" (עד 5), "שינויים ב-12 קווים" (יותר),
     ואותו שינוי בכמה קווים: "אותו שינוי ב-3 קווים". (העיר כבר בתגית הגדולה בשער — לא חוזרים עליה) */
  function autoTitle(pages, city) {
    var lines = []; pages.forEach(function (x) { if (lines.indexOf(x.line) < 0) lines.push(x.line); });
    if (pages.length === 1 || lines.length === 1) return isKind(pages[0]) ? kindTitle(pages[0]) : 'שינוי בקו ' + pages[0].line;
    var sg = function (x) { return isKind(x) ? '' : x.sig || oneSig(x); };
    if (sg(pages[0]) && pages.every(function (x) { return sg(x) === sg(pages[0]); })) return 'אותו שינוי ב-' + lines.length + ' קווים';
    if (lines.length <= 5) return 'שינויים בקווים ' + andList(lines, 5);
    return 'שינויים ב-' + lines.length + ' קווים';
  }

  /* ---------- השקפים ---------- */
  function cover(pages, city, one) {
    var s0 = pages.map(start).sort()[0];
    var single = pages.length === 1, p = pages[0];
    var ops = []; pages.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); });
    var firstTrip = single && p.formal && p.formal !== p.eff ? 'נסיעה ראשונה במסלול החדש: ' + LC.wd(p.eff) + ' ' + LC.dm(p.eff) : '';
    var dates = {}; pages.forEach(function (x) { dates[start(x)] = 1; });
    var multiDate = Object.keys(dates).length > 1;
    var endK = single && p.kind === 'ended';
    var sub = endK ? (LC.od(p.od) || p.od[0]) + ' · הנסיעה האחרונה ' + LC.dmy(lastOf(p)) : single ? (LC.od(p.od) || p.od[0]) + ' · החל מ-' + LC.dmy(s0)
      : (pages.length > 5 ? 'קווים ' + pages.map(function (x) { return x.line; }).join(', ') + ' · ' : '') + (multiDate ? 'מ-' + LC.dmy(s0) : 'החל מ-' + LC.dmy(s0));
    var opPhone = ops.length === 1 && phoneOf(ops[0]);
    return '<div class="s-cover">' +
      '<div class="band"><div class="row">' +
        (single ? '<span class="badge num">' + E(p.line) + '</span>' : '<span class="badge word">' + E(city || 'קווים') + '</span>') +
        '<div class="t"><h1 class="hd" data-k="title">' + E(single ? badgeTitle(p) : autoTitle(pages, city)) + '</h1><p class="sub">' + E(sub) + '</p></div></div>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="body">' +
        '<div class="facts">' +
          (endK ? '<div class="fact"><span class="l">הנסיעה האחרונה</span><span class="v">' + E(LC.wd(lastOf(p)) + ' ' + LC.dmy(lastOf(p))) + '</span>' +
            '<span class="x">' + E(hebDate(lastOf(p))) + '</span>'
          : '<div class="fact"><span class="l">' + (multiDate ? 'החל מ' : 'ממתי') + '</span><span class="v">' + E(LC.wd(s0) + ' ' + LC.dmy(s0)) + '</span>' +
            '<span class="x">' + E(hebDate(s0)) + '</span>') + (firstTrip ? '<span class="x">' + E(firstTrip) + '</span>' : '') + '</div>' +
          '<div class="fact"><span class="l">' + (ops.length > 1 ? 'חברות' : 'חברת האוטובוסים') + '</span><span class="v">' + E(ops.join(' · ')) + '</span>' +
            '<span class="x num">' + (opPhone ? 'מוקד: <span class="ltr">' + E(opPhone) + '</span>' : '') + '</span></div>' +
          '<div class="fact"><span class="l">משרד התחבורה</span><span class="v num"><span class="ltr">' + MOT + '</span></span><span class="x">מוקד המידע</span></div>' +
        '</div>' +
        '<p class="intro" data-k="intro">' + E(one ? 'המסלול והתחנות לא משתנים — רק השעות של ' + (ttCount(pages[0]) === 1 ? 'נסיעה אחת' : ttCount(pages[0]) + ' נסיעות') + '.' : autoIntro(pages)) + '</p>' +
        (single || pages.length <= 3 ? '<div class="what"><h3 class="hd">' + (single && p.kind === 'new' ? 'מה חשוב לדעת?' : 'מה משתנה?') + '<span class="counts">' + (single ? E(totLine(p.tot || {})) : '') + '</span></h3>' +
          '<ul data-k="what">' + listHtml(ED.cover, coverItems(pages)) + '</ul></div>' : coverRows(pages)) +
        '<div class="note">המידע הוכן על ידי אדם פרטי, ואינו פרסום רשמי של משרד התחבורה או של ' + (ops.length === 1 ? E(ops[0]) : 'חברות האוטובוסים') + '. השינוי עלול להשתנות. לפני הנסיעה בדקו במוקד או באפליקציה.</div>' +
        (one ? '<p class="osrc">לפי נתוני משרד התחבורה' + (one.feed ? ' מ-' + E(LC.dmy(one.feed)) : '') + '</p>' + creditHtml() : '') +
      '</div></div>';
  }

  /* שער של יותר משלושה קווים: שורה קצרה לכל קו — מספר, סוג השינוי, ומאיפה לאן ומתי */
  var COVER_ROWS = 8;
  function coverRows(pages) {
    var rows = pages.slice(0, COVER_ROWS).map(function (p) {
      var when = p.kind === 'ended' ? 'נסיעה אחרונה ' + LC.dm(lastOf(p)) : (p.past ? 'היה ב-' : 'מ-') + LC.dm(start(p));
      return '<li><span class="badge sm num">' + E(p.line) + '</span><span class="chips">' + LC.chips(p.kind ? { kind: p.kind } : p.tot || {}) + '</span>' +
        '<span class="cs">' + E((odTxt(p) ? odTxt(p) + ' · ' : '') + when) + '</span></li>';
    });
    if (pages.length > COVER_ROWS) rows.push('<li class="more">ועוד ' + (pages.length - COVER_ROWS) + ' קווים — בעמוד הבא</li>');
    return '<div class="what crows"><ul>' + rows.join('') + '</ul></div>';
  }
  function overview(pages, part, nparts) {
    return '<div class="s-over"><h2 class="hd">' + (nparts > 1 ? 'כל הקווים שמשתנים (' + (part + 1) + '/' + nparts + ')' : 'כל הקווים שמשתנים') + '</h2>' +
      '<table><tr><th style="width:34%">קו</th><th style="width:44%">מה משתנה</th><th style="width:22%">ממתי</th></tr>' +
      pages.map(function (p) {
        return '<tr><td class="ln"><b class="num">' + E(p.line) + '</b>' + E(LC.od(p.od)) + '</td><td><div class="chips">' +
          LC.chips(p.tot || {}) + '</div></td><td>' + E(p.kind === 'ended' ? 'עד ' + LC.wd(lastOf(p)) + ' ' + LC.dm(lastOf(p)) : LC.wd(start(p)) + ' ' + LC.dm(start(p))) + '</td></tr>';
      }).join('') + '</table>' + foot() + '</div>';
  }

  function foot() {
    return '<div class="sfoot"><span>הוכן על ידי אדם פרטי · לא פרסום רשמי · מפה: © תורמי OpenStreetMap</span><span class="pg num"></span></div>';
  }

  /* מפה של אזור אחד (כשהמפה מחולקת לאזורים): רק ההסברים, המספרים והשכבות של האזור הזה */
  function areaOf(d, part, nparts) {
    if (nparts < 2 || !part.show) return null;
    var rem = (d._rem || []).filter(function (s) { return part.show[s._k + s.code]; });
    var add = (d._add || []).filter(function (s) { return part.show[s._k + s.code]; });
    var pts = rem.concat(add).map(function (s) { return s.ll; }), codes = {};
    rem.concat(add).forEach(function (s) { codes[s.code] = 1; });
    var segs = segments(d).slice(0, SEG_MAX).filter(function (g) {
      if (g.oldS.concat(g.newS).some(function (s) { return codes[s.code]; })) return true;
      var at = g.A ? divergeAt(d, g) : ((g.newS[0] || g.oldS[0] || {}).ll);
      return at && pts.some(function (c) { return dist(c, at) < 1500; });
    });
    return { rem: rem, add: add, segs: segs };
  }
  function mapSlide(p, d, part, nparts) {
    var r = d.removed.length, a = d.added.length, ar = areaOf(d, part, nparts);
    var near = (d._rem || []).some(function (s) { return s._near && !s._near.none; });
    var when = start(d) !== start(p) ? '<p class="lead">החל מ' + E(LC.wd(start(d)) + ' ' + LC.dmy(start(d))) + '.</p>' : '';
    var where = toward(d).replace(/^בנסיעה ל/, 'לכיוון ');
    return '<div class="s-map"><div class="smap"></div><div class="inset"></div><div class="side">' +
      '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(p.op) + '</span></div>' +
      '<h2 class="hd">' + E(trip(d)) + E(altTxt(d)) + '</h2>' +
      (nparts > 1 ? '<p class="part">' + E((/^לכיוון /.test(where) ? where + ' · ' : '') + part.name) + ' <small style="font-weight:600;color:var(--s-sub)">· מפה ' + (part.i + 1) + ' מתוך ' + nparts + '</small></p>' : '') +
      (extOf(d) ? '' : rerouted(d) ? '' : '<p class="part">המסלול לא משתנה — רק ' + (r + a + d.moved.length === 1 ? 'התחנה' : 'התחנות') + '</p>') +
      segList(d, ar) + when +
      (small(d) && nparts < 2 ? smallList(d) : '<p class="counts">' + E(ar ? areaCounts(ar) : countsLine(d)) + '</p>') +
      legendHtml(d, ar) + basisHtml([d]) +
      '<div style="font-size:13px;color:var(--s-sub)">הוכן על ידי אדם פרטי · לא פרסום רשמי</div>' +
      '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>';
  }

  /* הקו נוסע בדרך אחרת (ולא רק תחנה שנוספה/בוטלה/זזה על אותה דרך) */
  function rerouted(d) { return !!d.geo || segments(d).some(routeSeg); }
  /* הקו רק מתארך בתחילתו או בסופו: אותן תחנות באותו סדר, ועוד תחנות לפני או אחרי, והמסלול הישן כולו בתוך החדש.
     מחזיר 'start' / 'end' / 'both' או '' */
  function extOf(d) {
    if (d._ext != null) return d._ext;
    var O = d.old.stops.map(function (s) { return s.code; }), N = d.new.stops.map(function (s) { return s.code; }), k = -1;
    if (!d.removed.length && !d.moved.length && O.length && N.length > O.length) {
      k = N.indexOf(O[0]);
      if (k < 0 || N.slice(k, k + O.length).join() !== O.join()) k = -1;
    }
    var e = '';
    // המסלול הישן בתוך החדש — מלבד הבדלי שרטוט קטנים (עד 300 מ' בסך הכול; לפעמים השרטוט הישן לא מגיע בדיוק עד התחנה)
    var off = offRuns(d.old.shape, d.new.shape).reduce(function (t, r) { return t + runLen(r); }, 0);
    if (k >= 0 && off < 300) e = k > 0 && k + O.length < N.length ? 'both' : k > 0 ? 'start' : 'end';
    return (d._ext = e);
  }
  /* איפה המסלול באמת נפרד מהישן אחרי התחנה A — הסמן של "כאן המסלול משתנה" שם, ולא בתחנה A עצמה
     (בקו מהיר A יכולה להיות עשרות ק"מ לפני השינוי, והמפה הייתה מתרחקת כדי להראות אותה) */
  function divergeAt(d, g) {
    var S = d.new.shape, O = d.old.shape;
    if (!g.route || S.length < 2 || O.length < 2) return g.A.ll;
    var lat0 = S[0][0], oxy = O.map(function (p) { return xy(p, lat0); });
    var bi = 0, bd = Infinity;
    S.forEach(function (p, i) { var x = dist(p, g.A.ll); if (x < bd) { bd = x; bi = i; } });
    // רק נקודה שעל קטע שמשתנה באמת (realRuns) — לא שרטוט מחדש של אותה דרך
    var rn = []; realRuns(d, 'new').forEach(function (r) { rn = rn.concat(r); });
    var ro = []; realRuns(d, 'old').forEach(function (r) { ro = ro.concat(r); });
    for (var i = bi; i < S.length; i++) if (rn.indexOf(S[i]) >= 0 && distToLine(xy(S[i], lat0), oxy) > 40) return S[Math.max(bi, i - 1)];
    // המסלול החדש לא יוצא מהישן (למשל קו 999 ב-17.11: הישן נכנס לרכסים, והחדש פשוט נשאר על הכביש הראשי) —
    // המקום שבו הישן נפרד מהחדש
    var sxy = S.map(function (p) { return xy(p, lat0); }), oi = 0, od = Infinity;
    O.forEach(function (p, j) { var x = dist(p, g.A.ll); if (x < od) { od = x; oi = j; } });
    for (var j = oi; j < O.length; j++) if (ro.indexOf(O[j]) >= 0 && distToLine(xy(O[j], lat0), sxy) > 40) return O[Math.max(oi, j - 1)];
    return g.A.ll;
  }
  /* קטע שמשתנה באמת, ולא שרטוט מחדש של אותה דרך (קו 971: כמה מטרים בכביש 4 ליד חדרה צוירו מחדש, והמפה התרחקה לכל הארץ):
     הקטע נחשב רק אם הוא רחוק מהמסלול השני יותר מ-NOISE_DEV מ' לאורך יותר מ-NOISE_LEN מ' ברצף, או שיש בו תחנה שנוספה /
     שבוטלה (עד STOP_NEAR מ' ממנו). השאר — אפור כמו המסלול שלא השתנה, ולא נכנס לגבולות המפה ולמקום שבו "כאן המסלול משתנה".
     קטע שמתחיל ונגמר ליד קטע אמיתי בצד השני (עד PAIR_M מ') — גם אמיתי (הדרך הישנה מול החדשה). בחלופה חדשה / שבוטלה — בלי סינון.
     d.rdr (מהבונה, כשיש) — לכל קטע: 'same' (אותם כבישים ב-OSM) או 'diff'. 'diff' — שינוי, אם הקטע ארוך מ-NOISE_LEN ומתרחק NOISE_DEV;
     'same' — רעש רק עד SAME_MAX מ' סטייה.
     תחנה שנוספה או בוטלה — תמיד שינוי */
  var NOISE_DEV = 80, NOISE_LEN = 300, STOP_NEAR = 60, PAIR_M = 250, SAME_MAX = 150;   // PAIR_M — קצוות של קטע ישן וחדש שהם אותו שינוי
  function realRuns(d, side) {
    if (!d._rr) {
      var raw = { old: offRuns(d.old.shape, d.new.shape), 'new': offRuns(d.new.shape, d.old.shape) };
      // חלופה חדשה / שבוטלה: הדרך של החלופה היא השינוי עצמו — כמו קודם, בלי סינון
      if (d.var) d._rr = raw;
      else {
        var keep = function (sd) {
          var b = sd === 'old' ? d.new.shape : d.old.shape, list = sd === 'old' ? d.removed : d.added;
          var st = (sd === 'old' ? d.old : d.new).stops.filter(function (x) { return list.indexOf(x.code) >= 0; });
          return raw[sd].map(function (r) {
            if (st.length) {
              var lat0 = r[0][0], rxy = r.map(function (p) { return xy(p, lat0); });
              if (st.some(function (x) { return distToLine(xy(x.ll, lat0), rxy) <= STOP_NEAR; })) return true;
            }
            // הסימון מהבונה (כבישים ב-OSM), בזהירות: 'diff' — שינוי רק בקטע ארוך שמתרחק; 'same' — רעש רק כשהקטע לא מתרחק
            // יותר מ-SAME_MAX מ' מהמסלול השני. אחרת — כלל המרחק
            var flag = rdFlag(d, r);
            if (flag) {
              var lat1 = r[0][0], bxy = b.map(function (p) { return xy(p, lat1); });
              var mx = Math.max.apply(null, r.map(function (p) { return distToLine(xy(p, lat1), bxy); }));
              // 'diff' — רק קטע של NOISE_LEN מ' לפחות שמתרחק NOISE_DEV מ' לפחות (קטעים קצרים ליד כביש עם שם אחר הם בדרך כלל רעש)
              if (flag === 'diff' && mx >= NOISE_DEV && runLen(r) >= NOISE_LEN) return true;
              if (flag === 'same' && mx <= SAME_MAX) return false;
            }
            return devRuns(r, b, NOISE_DEV).some(function (m) { return m > NOISE_LEN; });
          });
        };
        var k = { old: keep('old'), 'new': keep('new') };
        // קטע שנפסל, אבל בצד השני יש קטע אמיתי שמתחיל ונגמר באותם מקומות (הדרך הישנה מול החדשה, למשל רחוב מקביל) — גם הוא אמיתי
        var ends = function (r) { return [r[0], r[r.length - 1]]; };
        var paired = function (r, sd) {
          var o = sd === 'old' ? 'new' : 'old', e = ends(r);
          return raw[o].some(function (q, i) {
            if (!k[o][i]) return false;
            var f = ends(q);
            return (dist(e[0], f[0]) <= PAIR_M && dist(e[1], f[1]) <= PAIR_M) || (dist(e[0], f[1]) <= PAIR_M && dist(e[1], f[0]) <= PAIR_M);
          });
        };
        var k2 = { old: raw.old.map(function (r, i) { return k.old[i] || paired(r, 'old'); }), 'new': raw['new'].map(function (r, i) { return k['new'][i] || paired(r, 'new'); }) };
        d._rr = { old: raw.old.filter(function (r, i) { return k2.old[i]; }), 'new': raw['new'].filter(function (r, i) { return k2['new'][i]; }) };
      }
    }
    return d._rr[side === 'old' ? 'old' : 'new'];
  }
  /* הסימון מהבונה לקטע (שלב 2): d.rdr = [[lat, lon, 'same'|'diff'], ...] — נקודת אמצע של כל קטע שונה ב-GTFS */
  function rdFlag(d, r) {
    if (!d.rdr || !d.rdr.length) return '';
    var best = null, bd = 120;
    d.rdr.forEach(function (f) { r.forEach(function (p) { var x = dist(p, [f[0], f[1]]); if (x < bd) { bd = x; best = f[2]; } }); });
    return best || '';
  }
  /* נקודות על הקטעים שמשתנים באמת (לגבולות המפה כשאין סמנים) */
  function chgPts(d) { var o = []; realRuns(d, 'old').concat(realRuns(d, 'new')).forEach(function (r) { o = o.concat(r); }); return o; }
  function runLen(r) { var m = 0; for (var i = 1; i < r.length; i++) m += dist(r[i - 1], r[i]); return m; }
  /* הקטע החדש של קו שמתארך: מהתחנה שבה הקו הסתיים עד היום ועד הסוף (או מההתחלה עד התחנה שבה הקו התחיל) — חותכים את
     המסלול החדש בנקודה הקרובה לתחנה, ולא לפי ההבדל בין השרטוטים (השרטוט הישן לא תמיד מגיע עד התחנה) */
  function extPart(d) {
    var e = extOf(d), S = d.new.shape, O = d.old.stops, out = [];
    if (!e || S.length < 2 || !O.length) return out;
    var near = function (ll) { var bi = 0, bd = Infinity; S.forEach(function (p, i) { var x = dist(p, ll); if (x < bd) { bd = x; bi = i; } }); return bi; };
    if (e === 'end' || e === 'both') { var i = near(O[O.length - 1].ll); out.push([O[O.length - 1].ll].concat(S.slice(i + 1))); }
    if (e === 'start' || e === 'both') { var j = near(O[0].ll); out.push(S.slice(0, j).concat([O[0].ll])); }
    return out.filter(function (r) { return r.length > 1; });
  }
  /* קטעים במסלול a שרחוקים מ-b יותר מ-35 מ' (עם הנקודה שלפני ואחרי, כדי שהקטע יתחבר לקו) */
  function offRuns(a, b) {
    if (a.length < 2 || b.length < 2) return a.length > 1 && b.length < 2 ? [a] : [];
    var lat0 = a[0][0], bxy = b.map(function (p) { return xy(p, lat0); });
    var far = a.map(function (p) { return distToLine(xy(p, lat0), bxy) > 35; });
    var runs = [], cur = null;
    a.forEach(function (p, i) {
      if (far[i]) { if (!cur) { cur = i > 0 ? [a[i - 1]] : []; } cur.push(p); }
      else if (cur) { cur.push(p); runs.push(cur); cur = null; }
    });
    if (cur) runs.push(cur);
    // קטע קצר מאוד (פחות מ-40 מ') הוא שרטוט שונה של אותה דרך
    return runs.filter(function (r) { var m = 0; for (var i = 1; i < r.length; i++) m += dist(r[i - 1], r[i]); return m >= 40; });
  }
  /* שינוי קטן (עד 3 תחנות בכיוון): בלי שקף תחנות נפרד — הרשימה הקצרה ליד המפה, והמפה מתקרבת לתחנה */
  function small(d) { return d.added.length + d.removed.length + d.moved.length <= 3; }
  function smallList(d) {
    var rows = [];
    (d._rem || []).forEach(function (s, i) {
      var nr = s._near;
      rows.push('<li><i class="dot rem">' + (i + 1) + '</i><span>' + E(s.name) + ' — מבוטלת' +
        (nr && !nr.none ? '<span class="nr">במקום: ' + E(nr.name) + ' (' + walkTxt(nr) + ')</span>' : '<span class="nr">' + noNear(d) + '</span>') + '</span></li>');
    });
    d.new.stops.filter(function (s) { return d.added.indexOf(s.code) >= 0; }).forEach(function (s, i) {
      rows.push('<li><i class="dot add">' + (i + 1) + '</i><span>' + E(s.name) + ' — חדשה <span class="sc">מק״ט ' + E(s.code) + '</span></span></li>');
    });
    return rows.length ? '<ul class="small">' + rows.join('') + '</ul>' : '';
  }
  function allGreen(d) { return ED.rc === 'all' && rerouted(d) && !extOf(d); }
  function legendHtml(d, ar) {
    // מפה של אזור (ar): רק השכבות שיש באזור הזה
    var r = ar ? ar.rem.length : d.removed.length, a = ar ? ar.add.length : d.added.length;
    var remL = ar ? ar.rem : (d._rem || []);
    var near = remL.some(function (s) { return s._near && !s._near.none; });
    var segs = ar ? ar.segs : segments(d);
    var oldSeg = !ar || r || segs.some(function (g) { return g.oldS.length && routeSeg(g); });
    // קטע חדש בירוק — רק אם יש כזה (במפת אזור: ליד התחנות של האזור)
    var apts = ar ? ar.rem.concat(ar.add).map(function (x) { return x.ll; }) : null;
    var newSeg = realRuns(d, 'new').some(function (rn) { return !apts || rn.some(function (pt) { return apts.some(function (c) { return dist(c, pt) < 1500; }); }); });
    return '<div class="legend">' +
        (d.var === 'end' ? '<span><i class="sw old"></i>הדרך של הנסיעות שבוטלו (עד ' + E(LC.dm(LC.addDays(start(d), -1))) + ')</span><span><i class="sw same"></i>מסלול הקו (לא משתנה)</span>' :
        d.var === 'new' ? '<span><i class="sw same"></i>מסלול הקו (לא משתנה)</span><span><i class="sw"></i>הדרך של הנסיעות החדשות (מ-' + E(LC.dm(start(d))) + ')</span>' :
        extOf(d) ? '<span><i class="sw same"></i>מסלול הקו (לא משתנה)</span><span><i class="sw"></i>הקטע החדש (מ-' + E(LC.dm(start(d))) + ')</span>' :
          rerouted(d) ? (oldSeg && realRuns(d, 'old').length ? '<span><i class="sw old"></i>קטע שהקו כבר לא נוסע בו (עד ' + E(LC.dm(LC.addDays(start(d), -1))) + ')</span>' : '') +
          (allGreen(d) ? '<span><i class="sw"></i>המסלול החדש (מ-' + E(LC.dm(start(d))) + ')</span>'
            : '<span><i class="sw same"></i>המסלול שלא השתנה</span>' + (newSeg ? '<span><i class="sw"></i>קטע חדש (מ-' + E(LC.dm(start(d))) + ')</span>' : '')) : '<span><i class="sw same"></i>מסלול הקו (לא משתנה)</span>') +
        (r ? '<span><i class="dot rem">1</i>תחנה שמבוטלת</span>' : '') +
        (near ? '<span><i class="sw near"></i>אל התחנה הקרובה במסלול החדש' + (remL.some(function (s) { return s._near && s._near.path; }) ? ' (זמן ההליכה ברשימה)' : '') + '</span>' : '') +
        (segs.some(routeSeg) ? '<span><i class="dot seg">1</i>כאן המסלול משתנה (כמו בהסבר)</span>' : '') +
        (a ? '<span><i class="dot add">1</i>תחנה חדשה</span>' : '') +
        (!ar && d.moved.length ? '<span><i class="dot mv">1</i>תחנה שעוברת מקום</span>' : '') +
        '<span><i class="dot same"></i>תחנה שנשארת</span></div>';
  }

  var SEG_MAX = 4;
  function areaCounts(ar) {
    var s = [];
    if (ar.rem.length) s.push(plural(ar.rem.length, 'תחנה אחת מבוטלת', 'תחנות מבוטלות'));
    if (ar.add.length) s.push(plural(ar.add.length, 'תחנה חדשה אחת', 'תחנות חדשות'));
    return s.length ? s.join(' · ') + ' באזור הזה · המספרים במפה כמו ברשימה בעמוד הבא' : '';
  }
  function segList(d, ar) {
    var segs = segments(d);
    if (!segs.length) return '<p class="lead">' + dirLead(d) + '</p>';
    var ed = ED.seg && ED.seg[d._key];
    var html = '<ol class="segs">' + segs.slice(0, SEG_MAX).map(function (g, i) {
      if (ar && ar.segs.indexOf(g) < 0) return '';   // מפה של אזור: רק ההסברים של האזור הזה (עם המספרים המקוריים)
      var t = ed && typeof ed[i] === 'string' ? E(ed[i]) : g.html;
      // מספר רק לשינוי בדרך עצמה (יש לו סמן על המפה); שינוי של תחנה — נקודה, הסמן הממוספר של התחנה הוא ההפניה
      var num = segNum(d, g);
      return '<li>' + (num ? '<i class="segn">' + num + '</i>' : '<i class="segb"></i>') + '<span data-seg="' + E(d._key) + '" data-i="' + i + '">' + t + '</span></li>';
    }).join('') + '</ol>';
    if (segs.length > SEG_MAX && !ar) html += '<p class="counts">ועוד ' + (segs.length - SEG_MAX === 1 ? 'שינוי קטן אחד' : (segs.length - SEG_MAX) + ' שינויים קטנים') + ' — ברשימת התחנות בעמוד הבא.</p>';
    return html;
  }
  function routeSeg(g) { return !g.kind; }
  function segNum(d, g) {
    if (!routeSeg(g)) return 0;
    var n = 0, out = 0;
    segments(d).slice(0, SEG_MAX).forEach(function (x) { if (routeSeg(x)) { n++; if (x === g) out = n; } });
    return out;
  }
  function totLine(t) {
    var s = [];
    if (t.rem) s.push(plural(t.rem, 'תחנה אחת מבוטלת', 'תחנות מבוטלות'));
    if (t.add) s.push(plural(t.add, 'תחנה חדשה אחת', 'תחנות חדשות'));
    return s.join(' · ');
  }
  function countsLine(d) {
    var r = d.removed.length, a = d.added.length, s = [];
    if (r) s.push(plural(r, 'תחנה אחת מבוטלת', 'תחנות מבוטלות'));
    if (a) s.push(plural(a, 'תחנה חדשה אחת', 'תחנות חדשות'));
    return s.join(' · ') + (s.length ? ' · המספרים במפה כמו ברשימה בעמוד הבא' : '');
  }

  /* רשימת תחנות: עמודות של rows שורות; בתחנה שמבוטלת — שורה שנייה: התחנה הקרובה במקומה */
  function nrTxt(s) { var nr = s._near; return !nr || nr.none ? noNear() : 'במקום: ' + nr.name + ' (' + walkTxt(nr) + ')'; }
  /* תחנות שמבוטלות: עמודות לפי הגובה המשוער (שורה שנייה ארוכה — עוד שורה), כדי שהרשימה לא תגלוש לתחתית השקף */
  function remCols(arr) {
    var big = ED.look === 'large', nrCap = big ? 36 : 46, nmCap = big ? 28 : 36, cap = RR + 1.5, cols = [], cur = [], used = 0;
    arr.forEach(function (s) {
      var w = 1 + (nrTxt(s).length > nrCap ? 0.27 : 0) + ((s.name + ' מק״ט ' + s.code).length > nmCap ? 0.27 : 0);
      if (cur.length && used + w > cap) { cols.push(cur); cur = []; used = 0; }
      cur.push(s); used += w;
    });
    if (cur.length) cols.push(cur);
    return cols;
  }
  function stopList(arr, off, rows, mainCity, given) {
    var cols = given || [arr.slice(0, rows), arr.slice(rows, rows * 2)], base = 0;
    return '<div class="two">' + cols.map(function (col, ci) {
      var b0 = base; base += col.length;
      return '<ol>' + col.map(function (s, j) {
        var n = off + b0 + j + 1, nr = s._near;
        var sub = s._k !== 'rem' ? '' : '<span class="nr">' + E(nrTxt(s)) + '</span>';
        return '<li' + (sub ? ' class="two-l"' : '') + '><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + E(s.name) + ' <span class="sc">מק״ט ' + E(s.code) + '</span>' +
          (s.city && s.city !== mainCity ? ' <span class="cd">' + E(s.city) + '</span>' : '') + sub + '</span></li>';
      }).join('') + '</ol>';
    }).join('') + '</div>';
  }

  var RR = 10, RA = 16;   // שורות בעמודה: תחנות שמבוטלות (שתי שורות לכל תחנה) / חדשות — "אותיות גדולות": פחות
  function stopsSlides(p, d, remS, addS) {
    NN_CUR = d._nn || '';
    var rc = remCols(remS), rOff = [0];
    for (var q = 0; q < rc.length; q += 2) rOff.push(rOff[rOff.length - 1] + rc[q].length + (rc[q + 1] ? rc[q + 1].length : 0));
    var n = Math.max(1, Math.ceil(rc.length / 2), Math.ceil(addS.length / (RA * 2)));
    var cnt = {};
    remS.concat(addS).forEach(function (s) { if (s.city) cnt[s.city] = (cnt[s.city] || 0) + 1; });
    var mainCity = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
    var out = [];
    for (var i = 0; i < n; i++) {
      var rcs = rc.slice(i * 2, i * 2 + 2), r = [].concat.apply([], rcs), a = addS.slice(i * RA * 2, (i + 1) * RA * 2);
      var extra = '';
      if (i === n - 1) {
        if (d.moved.length) extra += '<p class="extra">תחנות שעוברות למקום קרוב: ' + d.moved.map(function (m) { return E(m.name) + ' (כ-' + m.m + ' מ׳)'; }).join(' · ') + '</p>';
        if (d.swaps && d.swaps.length) extra += '<p class="extra">' + plural(d.swaps.length, 'תחנה אחת נשארת', 'תחנות נשארות') +
          ' באותו מקום ובאותו שם, ורק המספר שלהן השתנה.</p>';
      }
      out.push({
        label: 'תחנות · ' + trip(d) + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: '<div class="s-stops"><div class="head"><span class="badge sm num">' + E(p.line) + '</span><h2 class="hd">' +
          E(trip(d)) + E(altTxt(d)) + (i ? ' (המשך)' : '') + '</h2></div>' +
          '<div class="cols">' +
            '<div class="grp rem"><h3 class="hd">תחנות שמבוטלות' + (remS.length ? ' (' + remS.length + ')' : '') + '</h3>' +
              (r.length ? stopList(r, rOff[i], RR, mainCity, rcs.length > 1 ? rcs : [rcs[0], []]) : '<p class="empty">' + (i ? '' : 'אין תחנות שמבוטלות בנסיעה הזו') + '</p>') + '</div>' +
            '<div class="grp add"><h3 class="hd">תחנות חדשות' + (addS.length ? ' (' + addS.length + ')' : '') + '</h3>' +
              (a.length ? stopList(a, i * RA * 2, RA, mainCity) : '<p class="empty">' + (i ? '' : 'אין תחנות חדשות בנסיעה הזו') + '</p>') + '</div>' +
          '</div>' + extra +
          '<div class="sfoot"><span>המספרים כמו במפה · ' + ((d._rem || []).some(function (x) { return x._near && x._near.path; }) ? 'זמן ההליכה לפי מפת הרחובות, בקצב רגיל' : 'המרחק לתחנה הקרובה הוא הערכה') + ' · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>'
      });
    }
    return out;
  }

  // קרדיט לקו הבוחן — רק אם מי שמכין את המצגת השאיר את הסימון (ברירת המחדל: כן)
  function creditHtml() { return ED.credit === false ? '' : '<p class="credit">נוצר בכלי "מצגת לשינוי בקו" של הקו הבוחן · <b class="ltr">kavbochan.app</b></p>'; }
  function closing(pages, feed) {
    var ops = []; pages.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); });
    // כל החברות שבמצגת שיש להן מוקד (בלי חיתוך לשלוש)
    var ph = ops.filter(function (o) { return phoneOf(o); }).map(function (o) {
      var v = phoneOf(o);
      return '<div class="ph"><span class="l">' + E(o) + '</span><span class="v' + (v.length > 6 ? ' lg' : '') + '">' + E(v) + '</span></div>';
    }).join('');
    return '<div class="s-close"><div class="seam"><i></i></div><h2 class="hd">לפני הנסיעה בדקו</h2>' +
      '<div class="phones">' + ph + '<div class="ph"><span class="l">משרד התחבורה</span><span class="v">' + MOT + '</span></div></div>' +
      '<div class="note">המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי של משרד התחבורה או של ' +
        (ops.length === 1 ? E(ops[0]) : 'חברות האוטובוסים') + '. ' + (pages.every(isCur) ? 'לוח הזמנים' : 'השינוי') + ' עלול להשתנות בכל רגע. לפני הנסיעה בדקו במוקד או באפליקציה.</div>' +
      '<p class="src">לפי נתוני משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') +
        (pages.some(function (x) { return x.past; }) ? ' ולפי הארכיון של הקו הבוחן' : '') + (pages.every(isCur) ? '' : ' · מפות: © תורמי OpenStreetMap') + '</p>' + creditHtml() + '</div>';
  }

  /* ---------- הסבר במילים: מקטעי שינוי ----------
     עוברים על רצף התחנות הישן והחדש: איפה הם נפרדים (התחנה המשותפת האחרונה) ואיפה הם נפגשים שוב.
     כל מקטע = {A: תחנה לפני, B: תחנה אחרי, oldS: תחנות במסלול הישן בין שתיהן, newS: במסלול החדש}.
     מהשמות של התחנות ("רחוב/רחוב חוצה" או שם של מקום) בונים משפט פשוט. */
  var PLACE = /^(בית|בי"ס|בי''ס|ביה"ס|מרכז|קופת|ת\. ?מרכזית|תחנה מרכזית|מעונות|צומת|מסעף|קניון|מתנ"ס|מתנ''ס|ישיבת|אולפנת|מכללת|בי"ח|בי''ח|מסוף|חניון|שכונת|כניסה|יציאה|גשר|תחנת|מחלף|אזור|פארק|קריית|קרית|שוק|משטרה|עירייה|עיריית|בנק|דואר|סניף)/;
  function streetOf(name) {
    var parts = String(name || '').split('/').map(function (x) { return x.trim(); });
    var a = parts[0], b = parts[1];
    // "בית כנסת חב"ד/זלמן שז"ר" → זלמן שז"ר; אבל "ת. מרכזית צפת/רציפים" נשאר התחנה המרכזית
    if (b && PLACE.test(a) && !PLACE.test(b) && !/^(רציפים|רציף|הורדה|איסוף|יציאה|כניסה)/.test(b)) a = b;
    // קיצורים: "שד' ירושלים", "שד.ירושלים" ו"שדרות ירושלים" — אותו רחוב, כתוב תמיד "שדרות"; "רח' הרצל" — "הרצל"
    a = a.replace(/^שד(?:רות\s+|['׳.]\s*)/, 'שדרות ').replace(/^(?:רח(?:וב)?['׳.]?\s+|רח['׳.]\s*)/, '');
    return a.replace(/^דרך\s+/, '').replace(/\s+\d+[א-ת]?$/, '').replace(/\s+(א|ב|ג)'?$/, '').trim();
  }
  function skey(t) { return t.replace(/["'״׳`.]/g, '').replace(/\s+/g, ' ').trim(); }   // צה"ל = צהל
  function streets(list, minus) {
    var out = [], keys = (minus || []).map(skey);
    list.forEach(function (s) { var t = streetOf(s.name), k = skey(t); if (t && keys.indexOf(k) < 0) { keys.push(k); out.push(t); } });
    return out;
  }
  function andList(arr, max) {
    max = max || 3;
    var a = arr.slice(0, max), rest = arr.length - a.length;
    if (rest > 0) return a.join(', ') + ' ועוד';
    if (a.length < 2) return a.join('');
    var last = String(a[a.length - 1]);
    return a.slice(0, -1).join(', ') + (/^[\d"'(]/.test(last) ? ' ו-' : ' ו') + last;   // "54, 784 ו-791"

  }
  var PLACEWORD = /(ת\. ?מרכזית|תחנה מרכזית|קניון|בי"ס|בי''ס|כיכר|ככר|צומת|מסעף|פארק)/;
  /* "דרך גני הדר וצה"ל, ודרך מסעף בית העלמין" — רחובות ברשימה, ומקום אחד לכל היותר */
  function via(list) {
    var st = list.filter(function (x) { return !PLACEWORD.test(x); }), pl = list.filter(function (x) { return PLACEWORD.test(x); });
    var out = st.length ? 'דרך ' + andList(st) : '';
    if (pl.length) out += (out ? ', ודרך ' : 'דרך ') + pl[0];
    return out;
  }
  function q(s) { return s.name; }   // שם התחנה מודגש בשקף — בלי מירכאות (ממילא יש בשמות גרשיים)
  function nearLine(stops, shape) {
    if (!stops.length || shape.length < 2) return false;
    var lat0 = shape[0][0], sx = shape.map(function (p) { return xy(p, lat0); });
    return stops.every(function (s) { return distToLine(xy(s.ll, lat0), sx) <= 60; });
  }

  function segments(d) {
    if (d._segs) return d._segs;
    var sw = {};
    (d.swaps || []).forEach(function (x) { sw[x.new] = x.old; });
    var O = d.old.stops, N = d.new.stops;
    var kO = O.map(function (s) { return s.code; }), kN = N.map(function (s) { return sw[s.code] || s.code; });
    var i = 0, j = 0, segs = [];
    while (i < O.length || j < N.length) {
      if (i < O.length && j < N.length && kO[i] === kN[j]) { i++; j++; continue; }
      var A = (i > 0 && j > 0) ? N[j - 1] : null, best = null;
      for (var j2 = j; j2 < N.length; j2++) {
        var i2 = kO.indexOf(kN[j2], i);
        if (i2 >= 0) { var c = (i2 - i) + (j2 - j); if (!best || c < best.c) best = { i2: i2, j2: j2, c: c }; }
      }
      var seg;
      if (best) { seg = { A: A, B: N[best.j2], oldS: O.slice(i, best.i2), newS: N.slice(j, best.j2) }; i = best.i2; j = best.j2; }
      else { seg = { A: A, B: null, oldS: O.slice(i), newS: N.slice(j) }; i = O.length; j = N.length; }
      if (seg.oldS.length || seg.newS.length) segs.push(seg);
    }
    // חלופה שבוטלה / חדשה: רק הקטעים שבהם יש תחנות שבוטלו (או נוספו) לקו — הדרך הראשית לא משתנה
    if (d.var) segs = segs.filter(function (g) {
      var list = d.var === 'end' ? d.removed : d.added;
      return (d.var === 'end' ? g.oldS : g.newS).some(function (x) { return list.indexOf(x.code) >= 0; });
    });
    segs.forEach(function (g) { g.html = segText(g, d); g.weight = g.oldS.length + g.newS.length + (g.route ? 3 : 0); });
    // תחנה שעוברת מקום (אותה תחנה, מקום אחר)
    d.moved.forEach(function (m) {
      var t = 'התחנה <b>' + E(m.name) + '</b> עוברת למקום חדש, כ-' + m.m + ' מ׳ מהמקום הקודם.';
      segs.push({ A: { ll: m.ll, name: m.name }, B: null, oldS: [], newS: [], html: t, plain: t, kind: 'mv', names: [skey(m.name)], weight: 1, moved: m });
    });
    return (d._segs = segs);
  }

  /* משפט למקטע. מחזיר HTML (שמות תחנות מודגשים); g.route = הקו נוסע בדרך אחרת */
  function segText(g, d) {
    var A = g.A, B = g.B, o = g.oldS, n = g.newS, b = function (s) { return '<b>' + E(q(s)) + '</b>'; };
    var keep = streets([A, B].filter(Boolean));
    if (d.var) return varText(g, d, keep, b);
    var oS = streets(o, streets(n).concat(keep)), nS = streets(n, streets(o).concat(keep));
    g.oS = oS; g.nS = nS;
    var names = function (arr) { return andList(arr.map(function (s) { return E(q(s)); })); };
    if (!A && !B) return 'הקו נוסע במסלול אחר לגמרי.';
    if (!A) {   // תחילת הקו
      if (o.length && !n.length) return 'הקו לא יתחיל יותר ב' + b(o[0]) + '. התחנה הראשונה תהיה ' + b(B) + '.';
      if (n.length && !o.length) {
        if (extOf(d)) { g.ext = 'start'; g.kind = 'ext'; g.names = ['start'].concat(n.map(function (x) { return skey(x.name); }));
          return (n.length === 1 ? 'הקו יתחיל את הנסיעה בתחנה חדשה: ' + b(n[0]) : 'הקו יתחיל את הנסיעה ' + n.length + ' תחנות קודם, בתחנה ' + b(n[0])) +
            '. משם הוא ייסע לתחנה ' + b(B) + ', שהייתה עד היום התחנה הראשונה, וימשיך במסלול הרגיל. כל שאר התחנות נשארות.'; }
        return 'הקו יתחיל את הנסיעה כבר ב' + b(n[0]) + ', לפני ' + b(B) + '.';
      }
      return 'הקו יתחיל את הנסיעה ב' + b(n[0]) + ' במקום ב' + b(o[0]) + '.';
    }
    if (!B) {   // סוף הקו
      if (o.length && !n.length) return 'הקו לא יגיע יותר עד ' + b(o[o.length - 1]) + '. התחנה האחרונה תהיה ' + b(A) + '.';
      if (n.length && !o.length) {
        if (extOf(d)) { g.ext = 'end'; g.kind = 'ext'; g.names = ['end'].concat(n.map(function (x) { return skey(x.name); }));
          return 'הקו לא יסיים יותר את הנסיעה בתחנה ' + b(A) + '. הוא ימשיך משם ' + (n.length === 1 ? 'לתחנה חדשה: ' : n.length + ' תחנות נוספות, עד ') + b(n[n.length - 1]) +
            '. כל שאר המסלול והתחנות נשארים.'; }
        return 'הקו ימשיך אחרי ' + b(A) + ' עד ' + b(n[n.length - 1]) + '.';
      }
      return 'הקו יסיים את הנסיעה ב' + b(n[n.length - 1]) + ' במקום ב' + b(o[o.length - 1]) + '.';
    }
    var sameRoadOld = nearLine(o, d.new.shape), sameRoadNew = nearLine(n, d.old.shape);
    if (o.length && !n.length) {
      if (sameRoadOld || !oS.length) {
        g.kind = 'rem'; g.names = o.map(function (x) { return skey(x.name); }).sort();
        var nr = o.length <= 2 ? o.map(function (x) {
          var t = nearest(x, d);
          return !t || t.none ? 'ליד ' + E(x.name) + ' ' + noNear(d) + '.' : (o.length > 1 ? 'במקום ' + E(x.name) + ': ' : 'התחנה הקרובה: ') + '<b>' + E(t.name) + '</b>, ' + walkTxt(t) + '.';
        }).join(' ') : '';
        g.plain = 'הקו לא יעצור יותר ב' + (o.length === 1 ? 'תחנה ' : 'תחנות ') + names(o) + '.';
        g.loc = locOf(o, A, B, d.old.shape); g.locN = LOCN;
        return 'הקו לא יעצור יותר ב' + (o.length === 1 ? 'תחנה ' : 'תחנות ') + names(o) + ' (' + g.loc + ').' + (nr ? ' ' + nr : '');
      }
      g.route = true;
      return 'אחרי ' + b(A) + ' הקו כבר לא ייסע ' + E(via(oS)) + '. הוא ייסע בדרך אחרת ויגיע ל' + b(B) + '.';
    }
    if (n.length && !o.length) {
      if (sameRoadNew || !nS.length) {
        g.kind = 'add'; g.names = n.map(function (x) { return skey(x.name); }).sort();
        g.plain = (n.length === 1 ? 'נוספה תחנה חדשה: ' : 'נוספו תחנות חדשות: ') + names(n) + '.';
        g.loc = locOf(n, A, B, d.new.shape); g.locN = LOCN;
        return (n.length === 1 ? 'נוספה תחנה חדשה: ' : 'נוספו תחנות חדשות: ') + names(n) + ', ' + g.loc + '.';
      }
      g.route = true;
      return 'אחרי ' + b(A) + ' הקו ייסע בדרך חדשה, ' + E(via(nS)) + ', ויחזור למסלול הרגיל ב' + b(B) + '.';
    }
    // הדרך לא משתנה (לפי הבונה), רק תחנה מתחלפת בתחנה אחרת — לא "הקו ייסע דרך..."
    if (!d.geo && o.length && n.length && nearLine(o, d.new.shape) && nearLine(n, d.old.shape)) {
      g.kind = 'swap'; g.names = o.concat(n).map(function (x) { return skey(x.name); }).sort();
      if (o.length === 1 && n.length === 1) {
        var m = Math.max(50, Math.round(dist(o[0].ll, n[0].ll) / 50) * 50);
        return 'המסלול לא משתנה. במקום התחנה ' + b(o[0]) + ' הקו יעצור בתחנה חדשה, ' + b(n[0]) + ', כ-' + m + ' מ׳ ממנה.';
      }
      return 'המסלול לא משתנה. בין ' + b(A) + ' ל' + b(B) + ' הקו יעצור בתחנות ' + names(n) + ' במקום ' + names(o) + '.';
    }
    if (oS.length || nS.length) {
      g.route = true;
      return 'אחרי ' + b(A) + ' הקו ' + (oS.length ? 'כבר לא ייסע ' + E(via(oS)) + '. במקום זה הוא ייסע' : 'ייסע') +
        (nS.length ? ' ' + E(via(nS)) : ' בדרך אחרת') + ', ויחזור למסלול הרגיל ב' + b(B) + '.';
    }
    return 'בין ' + b(A) + ' ל' + b(B) + ' הקו יעצור בתחנות אחרות באותם רחובות: ' + names(n) + ' במקום ' + names(o) + '.';
  }

  /* חלופה שבוטלה: "אחרי A, האוטובוסים כבר לא ייסעו דרך X ולא יעצרו בתחנות ...".
     חלופה חדשה: "אחרי A, חלק מהאוטובוסים ייסעו דרך Y ויעצרו בתחנות ..." (בזמן עבר — pastTense ב-app.js) */
  function varText(g, d, keep, b) {
    var end = d.var === 'end', list = end ? d.removed : d.added;
    var mine = (end ? g.oldS : g.newS).filter(function (x) { return list.indexOf(x.code) >= 0; });
    var S = streets(end ? g.oldS : g.newS, streets(end ? g.newS : g.oldS).concat(keep));
    g.oS = end ? S : []; g.nS = end ? [] : S; g.names = mine.map(function (x) { return skey(x.name); }).sort();
    var names = andList(mine.map(function (x) { return E(q(x)); }));
    var at = g.A ? 'אחרי ' + b(g.A) + ', ' : '';
    var where = S.length ? ' ' + E(via(S)) : '';
    var st = (mine.length === 1 ? 'בתחנה ' : 'בתחנות ') + names;
    if (end) return at + 'האוטובוסים כבר לא ייסעו' + (where || ' בדרך הזו') + ', ולא יעצרו ' + st + '.' +
      (d.last ? ' הנסיעה האחרונה בדרך הזו: ' + E(LC.wd(d.last) + ' ' + LC.dm(d.last)) + '.' : '');
    return at + 'חלק מהאוטובוסים ייסעו' + (where || ' בדרך חדשה') + ' ויעצרו ' + st + '.' + (d.freq ? ' ' + E(d.freq) + '.' : '');
  }
  /* על מה מבוססת ההשוואה (חלופה שהוחלפה / בוטלה / חדשה) — שורה קטנה בשקף המפה */
  function basisHtml(dirs) {
    var seen = [];
    // התאמה בין חלופות (d.was) — מי שמכין את המצגת כבר בחר אם זו אותה נסיעה; אין צורך בהערה בשקף
    dirs.forEach(function (d) { if (d.basis && !d.was && seen.indexOf(d.basis) < 0) seen.push(d.basis); });
    return seen.map(function (t) { return '<p class="basis" style="font-size:12.5px;color:var(--s-sub);margin:4px 0 0">' + E(t) + '</p>'; }).join('');
  }

  /* איפה התחנה שנוספה/בוטלה: "בין A ל-B" רק כששתי השכנות קרובות (עד 600 מ' לאורך המסלול);
     אחרת ביחס לשכנה הקרובה — "כ-200 מ׳ אחרי A" או "כ-300 מ׳ לפני B" (המרחק לאורך שרטוט המסלול, מעוגל ל-50 מ') */
  var NEAR_PAIR = 600;
  function alongOf(shape) {
    var cum = [0];
    for (var i = 1; i < shape.length; i++) cum.push(cum[i - 1] + dist(shape[i - 1], shape[i]));
    var lat0 = shape.length ? shape[0][0] : 31.5, sx = shape.map(function (p) { return xy(p, lat0); });
    return function (ll) {   // המרחק מתחילת המסלול לנקודה הקרובה ביותר על המסלול
      var P = xy(ll, lat0), best = Infinity, at = 0;
      for (var i = 0; i + 1 < sx.length; i++) {
        var A = sx[i], B = sx[i + 1], vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy;
        var t = L2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2)) : 0;
        var dx = P[0] - A[0] - t * vx, dy = P[1] - A[1] - t * vy, dd = dx * dx + dy * dy;
        if (dd < best) { best = dd; at = cum[i] + t * Math.sqrt(L2); }
      }
      return at;
    };
  }
  function m50(m) { return Math.max(50, Math.round(m / 50) * 50); }
  function locOf(st, A, B, shape) {
    var bb = function (x) { return '<b>' + E(x.name) + '</b>'; };
    var first = st[0], last = st[st.length - 1], dA, dB;
    if (shape && shape.length > 1) {
      var al = alongOf(shape);
      dA = al(first.ll) - al(A.ll); dB = al(B.ll) - al(last.ll);
      if (dA < 0 || dB < 0) { dA = dist(A.ll, first.ll); dB = dist(last.ll, B.ll); }   // השרטוט חוזר על עצמו (קו מעגלי) — בקו אווירי
    } else { dA = dist(A.ll, first.ll); dB = dist(last.ll, B.ll); }
    if (dA <= NEAR_PAIR && dB <= NEAR_PAIR) { LOCN = 'בין ' + bb(A) + ' ל' + bb(B); return LOCN; }
    // בלי כיוון (למשפט של שני הכיוונים: "אחרי" בכיוון אחד הוא "לפני" בשני)
    LOCN = 'כ-' + m50(Math.min(dA, dB)) + ' מ׳ מהתחנה ' + bb(dA <= dB ? A : B);
    return dA <= dB ? 'כ-' + m50(dA) + ' מ׳ אחרי ' + bb(A) : 'כ-' + m50(dB) + ' מ׳ לפני ' + bb(B);
  }
  var LOCN = '';

  /* "מה משתנה?" לשער: 2–4 משפטים לכל הקו, החשובים קודם. מקטע זהה בשני הכיוונים — פעם אחת */
  function whatChanges(p, only) {
    var items = [];
    (only || p.dirs).forEach(function (d) {
      segments(d).forEach(function (g) { items.push({ d: d, g: g }); });
    });
    items.sort(function (x, y) { return y.g.weight - x.g.weight; });
    var out = [], used = [];
    items.forEach(function (it) {
      if (out.length >= COVER_MAX || used.indexOf(it) >= 0) return;
      var g = it.g, twin = null;
      if (g.route && (only || p.dirs).length > 1) {
        twin = items.filter(function (o) {
          return o !== it && o.d !== it.d && o.g.route && used.indexOf(o) < 0 &&
            sameSet(o.g.oS, g.oS) && sameSet(o.g.nS, g.nS);
        })[0];
      }
      if (!twin && g.kind && (only || p.dirs).length > 1) {
        var twins = items.filter(function (o) { return o !== it && o.d !== it.d && used.indexOf(o) < 0 && o.g.kind === g.kind && sameSet(o.g.names || [], g.names || []); });
        if (twins.length) { twins.forEach(function (o) { used.push(o); }); used.push(it); out.push(bothText(g, twins[0].g)); return; }
      }
      if (twin) {
        used.push(twin);
        out.push('<b>בשני הכיוונים</b> הקו ' + (g.oS.length ? 'כבר לא ייסע ' + E(via(g.oS)) + (g.nS.length ? ', ובמקום זה ייסע ' + E(via(g.nS)) : '') : 'ייסע בדרך חדשה, ' + E(via(g.nS))) + '.');
      } else {
        out.push(((only || p.dirs).length > 1 ? '<b>' + E(toward(it.d)) + '</b>, ' : '') + g.html);
      }
      used.push(it);
    });
    if (items.length > used.length && out.length >= COVER_MAX) out.push('');   // סימן שיש עוד
    return out.filter(function (x, i) { return x || i >= COVER_MAX; });
  }
  var COVER_MAX = 3;
  function coverItems(pages) {
    if (pages.length === 1 && isKind(pages[0])) {
      var ki = kindItems(pages[0]);
      return ki.length > COVER_MAX + 1 ? ki.slice(0, COVER_MAX + 1).concat(['ועוד בעמודים הבאים.']) : ki;
    }
    if (pages.length === 1) {
      var w = whatChanges(pages[0]);
      return w.length > COVER_MAX ? w.slice(0, COVER_MAX).concat(['ועוד שינויים בעמודים הבאים.']) : w;
    }
    // קווים עם אותו שינוי — שורה אחת ("קווים 9 ו-18: ...")
    var rows = [];
    pages.forEach(function (x) {
      if (isKind(x)) { var kw = { 'new': 'קו חדש — ' + kindItems(x)[0], ended: 'הקו מפסיק לפעול. ' + kindItems(x)[0], timetable: 'לוח זמנים חדש. ' + (kindItems(x)[0] || '').replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '') }[x.kind];
        rows.push({ w: kw, lines: [x.line] }); return; }
      var w = (whatChanges(x)[0] || '').replace(/^<b>[^<]*:<\/b> /, '').replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '');
      var r = rows.filter(function (y) { return y.w === w && w; })[0];
      if (r) r.lines.push(x.line); else rows.push({ w: w, lines: [x.line] });
    });
    if (rows.length === 1) return [rows[0].lines.length > 1 ? plu(rows[0].w) : rows[0].w];   // כל הקווים — אותו שינוי: בלי לחזור על מספרי הקווים
    return rows.map(function (r) { return '<b>' + (r.lines.length > 1 ? 'קווים ' + E(andList(r.lines, 12)) : 'קו ' + E(r.lines[0])) + ':</b> ' + r.w; });
  }
  /* טקסט שהמשתמש ערך (מערך של מחרוזות) — או הטקסט שנוצר אוטומטית (HTML) */
  function listHtml(edited, gen) {
    return (Array.isArray(edited) ? edited.map(E) : gen).map(function (t, i) { return '<li data-i="' + i + '">' + t + '</li>'; }).join('');
  }
  function plain(h) { return String(h).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
  /* אותו שינוי בשני הכיוונים — משפט אחד, בלי שני נקודתיים */
  function bothText(g, t) {
    var b = function (st) { return st ? '<b>' + E(st.name) + '</b>' : ''; };
    var nm = function (arr) { return andList(arr.map(function (x) { return E(x.name); })); };
    // תחנה אחת לכל כיוון באותו שם (זוג תחנות משני צדי הכביש) — לא "אותה תחנה"
    var mine = g.kind === 'add' ? g.newS : g.oldS, his = t ? (g.kind === 'add' ? t.newS : t.oldS) : [];
    if ((g.kind === 'add' || g.kind === 'rem') && mine.length === 1 && his.length === 1 && mine[0].code !== his[0].code) {
      var side = dist(mine[0].ll, his[0].ll) <= 300 ? ', משני צדי הכביש' : '';
      var codes = ' (מק״ט ' + E(mine[0].code) + ' ו-' + E(his[0].code) + ')';
      if (g.kind === 'add') return 'נוספות שתי תחנות חדשות בשם ' + b(mine[0]) + ', אחת לכל כיוון' + side + codes + (g.locN ? ', ' + g.locN : '') + '.';
      return 'הקו לא יעצור יותר בשתי התחנות בשם ' + b(mine[0]) + ', אחת בכל כיוון' + side + codes + '.';
    }
    if (g.kind === 'add') return '<b>בשני הכיוונים</b> ' + (g.newS.length === 1 ? 'נוספה תחנה חדשה, ' : 'נוספו תחנות חדשות, ') + nm(g.newS) +
      (g.locN ? ', ' + g.locN : '') + '.';
    if (g.kind === 'rem') return '<b>בשני הכיוונים</b> הקו לא יעצור יותר ב' + (g.oldS.length === 1 ? 'תחנה ' : 'תחנות ') + nm(g.oldS) + '.';
    if (g.kind === 'mv') return '<b>בשני הכיוונים</b> ' + g.html.replace(/^התחנה/, 'התחנה');
    return '<b>בשני הכיוונים</b> ' + g.html;
  }
  function sameSet(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }

  /* כל השקפים לבחירה: [{id, label, html, map?}] */
  var ED = {};   // עריכות של המשתמש: {cover: [..], seg: {key: [..]}, look}
  /* הכיוונים שמקבלים שקפים: חלופה (חלק מהנסיעות) עם בדיוק אותו שינוי כמו הקו הרגיל באותו כיוון — לא */
  function uniqDirs(p) {
    return p.dirs.filter(function (d) {
      return !(altTxt(d) && p.dirs.some(function (o) { return o !== d && o.dir === d.dir && !altTxt(o) && sameSet(o.added, d.added) && sameSet(o.removed, d.removed) && !o.geo === !d.geo; }));
    });
  }
  function prep(p) {
    p.dirs.forEach(function (d, di) {
      d._key = p.id + '-' + di;
      d._rem = d.old.stops.filter(function (s) { return d.removed.indexOf(s.code) >= 0; }).map(function (s) { return Object.assign({ _k: 'rem', _near: nearest(s, d) }, s); });
      d._add = d.new.stops.filter(function (s) { return d.added.indexOf(s.code) >= 0; }).map(function (s) { return Object.assign({ _k: 'add' }, s); });
    });
  }

  /* ---------- שינוי קטן או גדול ----------
     קטן: הדרך משתנה בפחות מקילומטר (בכיוון שמשתנה הכי הרבה) ועד 3 תחנות בסך הכול
     (תחנה שמשתנה בשני הכיוונים באותו שם נספרת פעם אחת). קטן → עמוד אחד (או שניים, כשהכיוונים במקומות שונים). */
  function devLen(a, b) {
    if (a.length < 2 || b.length < 2) return 0;
    var lat0 = a[0][0], bxy = b.map(function (p) { return xy(p, lat0); }), axy = a.map(function (p) { return xy(p, lat0); }), sum = 0;
    for (var i = 0; i + 1 < axy.length; i++) {
      var A = axy[i], B = axy[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(L / 25));
      for (var k = 0; k < n; k++) {
        var P = [A[0] + (B[0] - A[0]) * (k + .5) / n, A[1] + (B[1] - A[1]) * (k + .5) / n];
        if (distToLine(P, bxy) > 40) sum += L / n;
      }
    }
    return sum;
  }
  /* קטעים רצופים במסלול a שרחוקים מ-b יותר מ-thr מטרים — אורך כל קטע */
  function devRuns(a, b, thr) {
    var runs = [];
    if (a.length < 2 || b.length < 2) return runs;
    var lat0 = a[0][0], bxy = b.map(function (p) { return xy(p, lat0); }), axy = a.map(function (p) { return xy(p, lat0); }), cur = 0;
    for (var i = 0; i + 1 < axy.length; i++) {
      var A = axy[i], B = axy[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(L / 25));
      for (var k = 0; k < n; k++) {
        var P = [A[0] + (B[0] - A[0]) * (k + .5) / n, A[1] + (B[1] - A[1]) * (k + .5) / n];
        if (distToLine(P, bxy) > thr) cur += L / n; else if (cur) { runs.push(cur); cur = 0; }
      }
    }
    if (cur) runs.push(cur);
    return runs;
  }
  /* האם הדרך עצמה השתנתה (כמו בבונה): אותן תחנות — רק עקיפה של יותר מ-400 מ' במרחק של יותר מ-150 מ';
     תחנות השתנו — קטע שנשאר עד 60 מ' מהמסלול הקודם הוא אותה דרך (ונדרשים 200 מ' לפחות מחוץ לזה) */
  function geoChanged(os, ns, sameSeq) {
    if (os.length < 2 || ns.length < 2) return false;
    if (sameSeq) return devRuns(ns, os, 150).concat(devRuns(os, ns, 150)).some(function (r) { return r > 400; });
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    return Math.max(sum(devRuns(ns, os, 60)), sum(devRuns(os, ns, 60))) >= 200;
  }
  function routeLen(d) {
    if (typeof d.dev === 'number') return d.geo ? d.dev : Math.min(d.dev, 199);
    if (d._len == null) d._len = Math.max(devLen(d.new.shape, d.old.shape), devLen(d.old.shape, d.new.shape));
    return d._len;
  }
  function smallInfo(p) {
    var ds = uniqDirs(p), names = {}, len = 0;
    ds.forEach(function (d) {
      d.added.concat(d.removed).forEach(function (c) {
        var st = d.new.stops.concat(d.old.stops).filter(function (x) { return x.code === c; })[0];
        names[skey(st ? st.name : c)] = 1;
      });
      d.moved.forEach(function (m) { names[skey(m.name)] = 1; });
      len = Math.max(len, routeLen(d));
    });
    var n = Object.keys(names).length;
    return { small: len < 1000 && n <= 3, len: Math.round(len), stops: n };
  }

  /* ---------- עמוד אחד לשינוי קטן ----------
     מפה קרובה מצד אחד, ומהצד השני הכול: קו, תאריך, מה משתנה, מוקדים וההבהרה.
     כשהשינויים בשני הכיוונים רחוקים זה מזה — עמוד שני עם מפה משלו (לא יותר משניים). */
  function changeCenter(d) {
    var pts = d._rem.concat(d._add).map(function (s) { return s.ll; }).concat(d.moved.map(function (m) { return m.ll; }));
    if (!pts.length) pts = chgPts(d);
    if (!pts.length) return null;
    return [pts.reduce(function (a, p) { return a + p[0]; }, 0) / pts.length, pts.reduce(function (a, p) { return a + p[1]; }, 0) / pts.length];
  }
  /* כמה קווים עם בדיוק אותו שינוי קטן (אותן תחנות, אותו יום, בלי שינוי בדרך) — עמוד אחד לכולם */
  function oneSig(p) {
    if (!isOne(p) || p.dirs.some(function (d) { return d.geo; })) return '';
    var u = function (k) { var o = {}; p.dirs.forEach(function (d) { d[k].forEach(function (c) { o[c.code || c] = 1; }); }); return Object.keys(o).sort().join(','); };
    return start(p) + '|' + u('added') + '|' + u('removed') + '|' + u('moved');
  }
  /* התחנות שמשתנות בכל הכיוונים שבעמוד — כל אחת עם "לכיוון X" כשיש יותר מכיוון אחד (לשם על המפה) */
  function allStops(dirs, k) {
    var out = [], seen = {};
    dirs.forEach(function (d) {
      (d[k] || []).forEach(function (s) {
        if (seen[s.code]) { out.forEach(function (x, i) { if (x.code === s.code && x._to) out[i] = Object.assign({}, x, { _to: 'בשני הכיוונים' }); }); return; }
        seen[s.code] = 1;
        out.push(dirs.length > 1 ? Object.assign({}, s, { _to: toward(d).replace(/^בנסיעה /, '') }) : s);
      });
    });
    return out;
  }
  function onePages(p, feed, pre, others) {
    var ds = uniqDirs(p).filter(function (d) { return d.added.length || d.removed.length || d.moved.length || d.geo; });
    if (!ds.length) ds = uniqDirs(p).slice(0, 1);
    var groups = [];
    ds.forEach(function (d) {
      var c = changeCenter(d), g = groups.filter(function (x) { return c && x.c && dist(c, x.c) < 1500; })[0];
      if (g || groups.length >= 2) (g || groups[groups.length - 1]).dirs.push(d);
      else groups.push({ c: c, dirs: [d] });
    });
    return groups.map(function (g, gi) {
      var main = g.dirs.slice().sort(function (a, b) { return (b.added.length + b.removed.length + b.moved.length) - (a.added.length + a.removed.length + a.moved.length); })[0];
      return { id: p.id + '-one' + (gi ? '-' + gi : ''), label: (pre || '') + (groups.length > 1 ? 'עמוד ' + (gi + 1) + ' · ' + trip(main) : 'עמוד אחד'),
        html: oneHtml(p, g.dirs, main, gi, groups.length, feed, others), map: { d: main, remS: allStops(g.dirs, '_rem'), addS: allStops(g.dirs, '_add'), show: null, one: true } };
    });
  }
  function oneHtml(p, dirs, main, gi, ng, feed, others) {
    var s0 = start(p), all = [p].concat(others || []), ops = [];
    all.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); });
    var lines = all.map(function (x) { return x.line; });
    var multi = all.length > 1;
    var firstTrip = p.formal && p.formal !== p.eff ? ' · נסיעה ראשונה ' + LC.wd(p.eff) + ' ' + LC.dm(p.eff) : '';
    var items = whatChanges(p, dirs).filter(Boolean);
    // כמה קווים: בלי "בנסיעה ל..." של הקו הראשון (ליעדים של הקווים האחרים זה לא נכון), ובלי כפילויות
    if (multi) items = items.map(function (t) { return plu(t.replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '')); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    return '<div class="s-one"><div class="smap"></div><div class="side">' +   // בלי מפת התמצאות — המפה הקרובה מספיקה
      (multi ? '<div class="ohead multi"><div class="badges">' + lines.map(function (l) { return '<span class="badge num">' + E(l) + '</span>'; }).join('') + '</div>' +
          '<div class="t"><h1 class="hd">אותו שינוי ב-' + lines.length + ' קווים</h1><p class="sub">' + E(ops.join(' · ')) + '</p></div></div>'
        : '<div class="ohead"><span class="badge num">' + E(p.line) + '</span><div class="t"><h1 class="hd">שינוי</h1>' +
        '<p class="sub">' + E(LC.od(p.od)) + ' · ' + E(p.op) + '</p></div></div>') +
      '<p class="owhen"><b>' + (p.past ? 'מ' : 'החל מ') + E(LC.wd(s0) + ' ' + LC.dmy(s0)) + '</b> · ' + E(hebDate(s0)) + E(firstTrip) + '</p>' +
      (ng > 1 ? '<p class="part">עמוד ' + (gi + 1) + ' מתוך ' + ng + ' · ' + E(trip(main)) + '</p>' : '') +
      '<div class="owhat"><h3 class="hd">מה משתנה?</h3><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' +
      legendHtml(main) +
      '<div class="ocontact">' + ops.filter(function (o) { return phoneOf(o); }).slice(0, 3).map(function (o) { return '<span>' + E(o) + ' <b class="ltr">' + E(phoneOf(o)) + '</b></span>'; }).join('') +
        '<span>משרד התחבורה <b class="ltr">' + MOT + '</b></span></div>' +
      '<div class="note">המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי. השינוי עלול להשתנות — לפני הנסיעה בדקו במוקד או באפליקציה.</div>' +
      '<p class="osrc">לפי נתוני משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') + ' · מפה: © תורמי OpenStreetMap</p>' + basisHtml(dirs) + creditHtml() +
      '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>';
  }

  /* השקפים של שינוי גדול: לכל כיוון מפה (או שתיים) ושקף תחנות */
  function fullSlides(p, pre) {
    var out = [];
    p.dirs.forEach(function (d, di) {
      if (uniqDirs(p).indexOf(d) < 0) return;
      var remS = d._rem, addS = d._add;
      var parts = splitParts(remS, addS);
      parts.forEach(function (pt, k) {
        out.push({ id: p.id + '-m' + di + (k ? '-' + k : ''), label: pre + 'מפה · ' + trip(d) + (parts.length > 1 ? ' (' + pt.name + ')' : ''),
          html: mapSlide(p, d, pt, parts.length), map: { d: d, remS: remS, addS: addS, show: pt.show } });
      });
      if (!small(d) || parts.length > 1) stopsSlides(p, d, remS, addS).forEach(function (s, k) {
        out.push({ id: p.id + '-s' + di + '-' + k, label: pre + s.label, html: s.html });
      });
    });
    return out;
  }


  /* ================= צורות נוספות: שלט להדפסה (A4 לאורך) ותמונה לסטטוס (9:16) =================
     אותו תוכן כמו במצגת (מה משתנה, מקרא, התחנה הקרובה, מפה) — בעימוד אחר.
     המזהים של העמודים מתחילים ב-sg- / st-, כדי שהעריכות שלהם לא יתערבבו עם השקפים של המצגת. */
  /* הכיוונים של שינוי, בקבוצות לפי מקום (כמו בעמוד אחד): כיוונים שהשינוי בהם קרוב — יחד, עד שתי קבוצות */
  function dirGroups(p) {
    var ds = uniqDirs(p).filter(function (d) { return d.added.length || d.removed.length || d.moved.length || d.geo; });
    if (!ds.length) ds = uniqDirs(p).slice(0, 1);
    var groups = [];
    ds.forEach(function (d) {
      var c = changeCenter(d), g = groups.filter(function (x) { return c && x.c && dist(c, x.c) < 1500; })[0];
      if (g || groups.length >= 2) (g || groups[groups.length - 1]).dirs.push(d);
      else groups.push({ c: c, dirs: [d] });
    });
    groups.forEach(function (g) {
      g.main = g.dirs.slice().sort(function (a, b) { return (b.added.length + b.removed.length + b.moved.length) - (a.added.length + a.removed.length + a.moved.length); })[0];
    });
    return groups;
  }
  /* קווים עם אותו שינוי — יחידה אחת (שלט אחד / תמונה אחת) */
  function units(pages) {
    var out = [], merged = {};
    pages.forEach(function (p, i) {
      if (merged[p.id]) return;
      var sig = oneSig(p), others = sig ? pages.slice(i + 1).filter(function (o) { return !merged[o.id] && oneSig(o) === sig; }) : [];
      others.forEach(function (o) { merged[o.id] = 1; });
      out.push({ p: p, others: others, all: [p].concat(others) });
    });
    return out;
  }
  /* "קרית גת ↔ חצור" — וקו בתוך העיר: רק שם העיר */
  function odTxt(p) { var o = p.od || []; return o[0] && o[0] === o[1] ? o[0] : LC.od(o); }
  function opsOf(all) { var ops = []; all.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); }); return ops; }
  function itemsOf(u, dirs) {
    var items = whatChanges(u.p, dirs).filter(Boolean);
    if (u.others.length) items = items.map(function (t) { return plu(t.replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '')); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    return items;
  }
  /* אותו שינוי בכמה קווים: "הקו יעצור" → "הקווים יעצרו" (ושאר הפעלים שבמשפטים) */
  var PLU = { 'יעצור': 'יעצרו', 'ייסע': 'ייסעו', 'יתחיל': 'יתחילו', 'ימשיך': 'ימשיכו', 'יסיים': 'יסיימו', 'יגיע': 'יגיעו', 'יחזור': 'יחזרו', 'נוסע': 'נוסעים', 'עוצר': 'עוצרים' };
  function plu(t) {
    return String(t).replace(/(^|[\s>.,])(הקו|הוא)( כבר)?( לא)? (יעצור|ייסע|יתחיל|ימשיך|יסיים|יגיע|יחזור|נוסע|עוצר)(?=[\s<.,]|$)/g, function (m, a, who, k, l, v) {
      return a + (who === 'הקו' ? 'הקווים' : 'הם') + (k || '') + (l || '') + ' ' + PLU[v];
    }).replace(/^המסלול לא משתנה\./, 'המסלול לא משתנה.');
  }
  function badgesHtml(lines) { return lines.map(function (l) { return '<span class="badge num">' + E(l) + '</span>'; }).join(''); }
  function contactHtml(ops) {
    return ops.filter(function (o) { return phoneOf(o); }).slice(0, 3).map(function (o) { return '<span>' + E(o) + ' <b class="ltr">' + E(phoneOf(o)) + '</b></span>'; }).join('') +
      '<span>משרד התחבורה <b class="ltr">' + MOT + '</b></span>';
  }
  /* "קו 29 משנה מסלול" / "קווים 54 ו-784 מבטלים תחנה" */
  function headline(u, dirs) {
    var many = u.all.length > 1, rem = 0, add = 0, ext = dirs.every(function (d) { return extOf(d); }), rr = dirs.some(rerouted);
    var rs = {}, as = {};
    dirs.forEach(function (d) { d.removed.forEach(function (c) { rs[c] = 1; }); d.added.forEach(function (c) { as[c] = 1; }); });
    rem = Object.keys(rs).length; add = Object.keys(as).length;
    var ve = dirs.every(function (d) { return d.var === 'end'; }), vn = dirs.every(function (d) { return d.var === 'new'; });
    var v = ve ? (many ? 'מבטלים חלופה' : 'מבטל חלופה') : vn ? (many ? 'מוסיפים חלופה' : 'מוסיף חלופה')
      : ext ? (many ? 'מאריכים את המסלול' : 'מאריך את המסלול')
      : rr ? (many ? 'משנים מסלול' : 'משנה מסלול')
      : rem && !add ? (many ? 'מבטלים ' : 'מבטל ') + (rem === 1 ? 'תחנה' : 'תחנות')
      : add && !rem ? (many ? 'מוסיפים ' : 'מוסיף ') + (add === 1 ? 'תחנה' : 'תחנות')
      : rem === 1 && add === 1 ? (many ? 'מעבירים תחנה' : 'מעביר תחנה')
      : (many ? 'משנים תחנות' : 'משנה תחנות');
    // המספרים כבר בתגיות שמעל — בכותרת רק "הקו" / "הקווים"
    return (many ? 'הקווים ' : 'הקו ') + v;
  }
  /* התחנה הקרובה לכל תחנה שמבוטלת — רק אם זה עוד לא כתוב ב"מה משתנה?" */
  function nearBox(remS, items) {
    var txt = plain(items.join(' '));
    var rows = remS.filter(function (s) { return s._near && !s._near.none && txt.indexOf(s._near.name) < 0; }).slice(0, 3).map(function (s) {
      return '<li><i class="dot rem"></i><span>במקום <b>' + E(s.name) + '</b>: <b>' + E(s._near.name) + '</b> · ' + E(walkTxt(s._near)) + '</span></li>';
    });
    return rows.length ? '<div class="sg-near"><h3 class="hd">איפה לעלות במקום?</h3><ul>' + rows.join('') + '</ul></div>' : '';
  }

  /* ---- שלט להדפסה: A4 לאורך (794×1123), עמוד לכל שינוי; הרבה תחנות — עמוד נוסף עם הרשימה ---- */
  var SG_W = 794, SG_H = 1123;
  function signPages(pages, feed) {
    var out = [];
    units(pages).forEach(function (u) {
      if (isKind(u.p)) { kindSign(u.p, feed, pages.length > 1 ? u.p.line + ' · ' : '').forEach(function (s) { out.push(s); }); return; }
      var gs = dirGroups(u.p), pre = pages.length > 1 ? u.all.map(function (x) { return x.line; }).join(', ') + ' · ' : '';
      gs.forEach(function (g, gi) {
        var id = 'sg-' + u.p.id + (gi ? '-' + gi : '');
        var remS = allStops(g.dirs, '_rem'), addS = allStops(g.dirs, '_add');
        var many = remS.length + addS.length > 4;
        var lbl = pre + 'שלט' + (gs.length > 1 ? ' ' + (gi + 1) + ' · ' + trip(g.main) : '');
        out.push({ id: id, label: lbl, html: signHtml(u, g, gi, gs.length, feed, remS, many),
          map: { d: g.main, remS: remS, addS: addS, show: null, one: !many } });
        if (many) signStops(u, g, remS, addS).forEach(function (h, k, a) {
          out.push({ id: id + '-s' + k, label: pre + 'התחנות' + (a.length > 1 ? ' (' + (k + 1) + '/' + a.length + ')' : ''), html: h });
        });
      });
    });
    return out;
  }
  function signHtml(u, g, gi, ng, feed, remS, many) {
    var p = u.p, s0 = start(p), ops = opsOf(u.all), multi = u.all.length > 1;
    var items = itemsOf(u, g.dirs);
    var more = whatChanges(p, g.dirs).length > items.length || many;
    return '<div class="s-sign">' +
      '<div class="sg-band"><div class="sg-row"><div class="badges' + (multi ? ' multi' : '') + '">' + badgesHtml(u.all.map(function (x) { return x.line; })) + '</div>' +
        '<div class="t"><h1 class="hd">' + (multi ? 'אותו שינוי ב-' + u.all.length + ' קווים' : 'שינוי') + '</h1>' +
        '<p class="sub">' + E(multi ? ops.join(' · ') : [odTxt(p), p.op].filter(Boolean).join(' · ')) + '</p></div></div>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="sg-when"><b>' + (p.past ? 'מ' : 'החל מ') + E(LC.wd(s0) + ' ' + LC.dmy(s0)) + '</b><span>' + E(hebDate(s0)) + '</span></div>' +
      (ng > 1 ? '<p class="sg-part">' + E(trip(g.main)) + ' (' + (gi + 1) + ' מתוך ' + ng + ')</p>' : '') +
      '<div class="sg-mapw"><div class="smap"></div><div class="inset"></div></div>' +
      legendHtml(g.main) +
      '<div class="sg-what"><h2 class="hd">מה משתנה?</h2><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
        (more ? '<li class="more">' + (many ? 'כל התחנות שמשתנות — בעמוד הבא.' : 'ועוד שינויים קטנים.') + '</li>' : '') + '</ul></div>' +
      (many ? '' : nearBox(remS, items)) +
      '<div class="sg-contact"><span class="l">לפני הנסיעה בדקו:</span>' + contactHtml(ops) + '</div>' +
      '<div class="note">המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי. השינוי עלול להשתנות.</div>' +
      '<div class="sg-foot"><span>לפי נתוני משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') + ' · מפה: © תורמי OpenStreetMap' +
        (ED.credit === false ? '' : ' · נוצר בכלי של הקו הבוחן, <b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>' +
      '</div>';
  }
  /* רשימת התחנות לשלט: שתי עמודות, ממלאים לפי גובה משוער; עמוד חדש כשנגמר המקום */
  function signStops(u, g, remS, addS) {
    var cnt = {};
    remS.concat(addS).forEach(function (s) { if (s.city) cnt[s.city] = (cnt[s.city] || 0) + 1; });
    var mainCity = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
    var ent = [];
    var lines = function (t, per) { return Math.max(1, Math.ceil(t.length / per)); };
    var row = function (s, n) {
      var nr = s._near, sub = s._k !== 'rem' ? '' : '<span class="nr">' + (!nr || nr.none ? noNear(g.main) : 'במקום: ' + E(nr.name) + ' (' + walkTxt(nr) + ')') + '</span>';
      var nm = s.name + (s.city && s.city !== mainCity ? ' ' + s.city : '');
      return { h: lines(nm + ' מק״ט ' + s.code, 32) * 28 + (sub ? lines(plain(sub), 40) * 22 : 0) + 14,
        html: '<li><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + E(s.name) + ' <span class="sc">מק״ט ' + E(s.code) + '</span>' +
          (s.city && s.city !== mainCity ? ' <span class="cd">' + E(s.city) + '</span>' : '') + sub + '</span></li>' };
    };
    if (remS.length) { ent.push({ h: 60, head: '<h3 class="hd rem">תחנות שמבוטלות (' + remS.length + ')</h3>' }); remS.forEach(function (s, i) { ent.push(row(s, i + 1)); }); }
    if (addS.length) { ent.push({ h: 60, head: '<h3 class="hd add">תחנות חדשות (' + addS.length + ')</h3>' }); addS.forEach(function (s, i) { ent.push(row(s, i + 1)); }); }
    var H = 860, cols = [], col = null;
    var hOf = function (a) { return a.reduce(function (t, e) { return t + e.h; }, 0); };
    var cut = remS.length ? remS.length + 1 : 0;
    // הכול נכנס בעמוד אחד: תחנות שמבוטלות בעמודה אחת, חדשות בשנייה (כמו במצגת)
    if (cut && addS.length && hOf(ent.slice(0, cut)) <= H && hOf(ent.slice(cut)) <= H) cols = [{ parts: ent.slice(0, cut) }, { parts: ent.slice(cut) }];
    else ent.forEach(function (e, i) {
      // כותרת לא נשארת לבד בתחתית עמודה
      var need = e.head ? e.h + (ent[i + 1] ? ent[i + 1].h : 0) : e.h;
      if (!col || col.h + need > H) { col = { h: 0, parts: [] }; cols.push(col); }
      col.parts.push(e); col.h += e.h;
    });
    var colHtml = function (c) {
      var h = '', open = false;
      c.parts.forEach(function (e) {
        if (e.head) { if (open) h += '</ol>'; h += e.head; h += '<ol>'; open = true; }
        else { if (!open) { h += '<ol>'; open = true; } h += e.html; }
      });
      return '<div class="col">' + h + (open ? '</ol>' : '') + '</div>';
    };
    var lines2 = u.all.map(function (x) { return x.line; }), out = [];
    for (var i = 0; i < cols.length; i += 2) {
      out.push('<div class="s-signstops"><div class="sg-shead"><div class="badges">' + badgesHtml(lines2).replace(/class="badge num"/g, 'class="badge sm num"') + '</div>' +
        '<div class="t"><h2 class="hd">התחנות שמשתנות' + (i ? ' (המשך)' : '') + '</h2><p class="sub">' + E(trip(g.main)) + ' · ' + (u.p.past ? 'מ' : 'החל מ') + E(LC.wd(start(u.p)) + ' ' + LC.dmy(start(u.p))) + '</p></div></div>' +
        '<div class="seam"><i></i></div>' +
        '<div class="sg-cols' + (cols.every(function (c) { return hOf(c.parts) < H * 0.72; }) ? ' roomy' : '') + '">' + colHtml(cols[i]) + (cols[i + 1] ? colHtml(cols[i + 1]) : '<div class="col"></div>') + '</div>' +
        '<div class="sg-foot"><span>המספרים כמו במפה · ' + (remS.some(function (x) { return x._near && x._near.path; }) ? 'זמן ההליכה לפי מפת הרחובות' : 'המרחק לתחנה הקרובה הוא הערכה') +
          ' · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>');
    }
    return out;
  }

  /* ---- תמונה לסטטוס: 1080×1920 לכל שינוי — מספר הקו, כותרת אחת, מפה קטנה, עד שלושה משפטים ---- */
  var ST_W = 1080, ST_H = 1920;
  function statusPages(pages) {
    var out = [];
    units(pages).forEach(function (u) {
      if (isKind(u.p)) { kindStatus(u.p, pages.length > 1 ? u.p.line + ' · ' : '').forEach(function (s) { out.push(s); }); return; }
      var gs = dirGroups(u.p), pre = pages.length > 1 ? u.all.map(function (x) { return x.line; }).join(', ') + ' · ' : '';
      gs.forEach(function (g, gi) {
        var remS = allStops(g.dirs, '_rem'), addS = allStops(g.dirs, '_add');
        out.push({ id: 'st-' + u.p.id + (gi ? '-' + gi : ''), label: pre + 'תמונה לסטטוס' + (gs.length > 1 ? ' ' + (gi + 1) + ' · ' + trip(g.main) : ''),
          html: statusHtml(u, g, gi, gs.length), map: { d: g.main, remS: remS, addS: addS, show: null, one: remS.length + addS.length <= 4 } });
      });
    });
    return out;
  }
  function statusHtml(u, g, gi, ng) {
    var p = u.p, s0 = start(p), ops = opsOf(u.all), multi = u.all.length > 1;
    var items = itemsOf(u, g.dirs).slice(0, 2);
    // משפט סיכום: כמה תחנות — רק כשיש יותר שינויים ממה שנכנס
    var rs = {}, as = {};
    g.dirs.forEach(function (d) { d.removed.forEach(function (c) { rs[c] = 1; }); d.added.forEach(function (c) { as[c] = 1; }); });
    var tl = totLine({ rem: Object.keys(rs).length, add: Object.keys(as).length });
    if (tl && (rs && Object.keys(rs).length + Object.keys(as).length > 2 || whatChanges(p, g.dirs).filter(Boolean).length > items.length)) items.push('בסך הכול: ' + E(tl) + '.');
    var ph = ops.length === 1 && phoneOf(ops[0]);
    return '<div class="s-status">' +
      '<div class="st-top"><div class="badges' + (multi ? ' multi' : '') + '">' + badgesHtml(u.all.map(function (x) { return x.line; })) + '</div>' +
        '<h1 class="hd">' + E(headline(u, g.dirs)) + ' <span class="nw">מ-' + E(LC.dm(s0)) + '</span></h1>' +
        '<p class="sub">' + E(LC.wd(s0) + ' ' + LC.dmy(s0)) + ' · ' + E(multi ? ops.join(' · ') : (ng > 1 ? trip(g.main) : [odTxt(p), p.op].filter(Boolean).join(' · '))) + '</p>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="st-mapw"><div class="smap"></div></div>' +
      '<div class="st-what"><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' +
      '<div class="st-foot"><p class="st-check">לפני הנסיעה בדקו: ' + (ph ? E(ops[0]) + ' <b class="ltr">' + E(ph) + '</b> · ' : '') + 'משרד התחבורה <b class="ltr">' + MOT + '</b></p>' +
        '<p class="st-note">לא פרסום רשמי · הוכן על ידי אדם פרטי' + (ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</p></div>' +
      '</div>';
  }

  /* ================= סוגים נוספים: קו חדש · קו מבוטל · שינוי בלוח הזמנים =================
     p.kind: 'new' / 'ended' / 'timetable' (שינוי מסלול — בלי kind). לכל סוג שקפים משלו, בשלוש הצורות.
     לוח הזמנים — לפי הבחירה בשלב 3 (ED.tt): v = 'gen' כללי / 'det' מפורט, f = 'table' טבלה / 'text' טקסט. */
  /* ימים בשבוע: d0 = ראשון ... d6 = שבת. ימים עם אותו לוח זמנים מקובצים: "א׳–ד׳", "ה׳", "שישי", "שבת" */
  var DOWS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  var DOW_LET = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], DOW_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
  function dix(ts) { return ts.map(function (t) { return DOWS.indexOf(t); }).filter(function (i) { return i >= 0; }).sort(); }
  function daysShort(ts) {
    var ix = dix(ts);
    if (ix.join() === '5') return 'שישי';
    if (ix.join() === '6') return 'שבת';
    var runs = [];
    ix.forEach(function (i) { var r = runs[runs.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]); });
    var parts = runs.map(function (r) { return r.length === 1 ? DOW_LET[r[0]] : DOW_LET[r[0]] + '–' + DOW_LET[r[r.length - 1]]; });
    return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' ו-' + parts[parts.length - 1];
  }
  function dtIn(ts) {   // "בימי חול" · "ביום חמישי" · "בשישי" · "בשבת ובמוצאי שבת" · "בימים א׳–ד׳"
    var ix = dix(ts);
    if (ix.join() === '0,1,2,3,4') return 'בימי חול';
    if (ix.length === 1) return ix[0] < 5 ? 'ביום ' + DOW_FULL[ix[0]] : ix[0] === 5 ? 'בשישי' : 'בשבת ובמוצאי שבת';
    return 'בימים ' + daysShort(ts);
  }
  function dayName(ts) {   // כותרת: "ימי חול (א׳–ה׳)" · "יום חמישי" · "שישי" · "שבת ומוצאי שבת" · "ימים א׳–ד׳"
    var ix = dix(ts);
    if (ix.join() === '0,1,2,3,4') return 'ימי חול (א׳–ה׳)';
    if (ix.length === 1) return ix[0] < 5 ? 'יום ' + DOW_FULL[ix[0]] : ix[0] === 5 ? 'שישי' : 'שבת ומוצאי שבת';
    return 'ימים ' + daysShort(ts);
  }
  function trips(n) { return n === 1 ? 'נסיעה אחת' : n + ' נסיעות'; }
  function every(m) { return m === 60 ? 'כל שעה' : m === 120 ? 'כל שעתיים' : m === 30 ? 'כל חצי שעה' : 'כל ' + m + ' דק׳'; }
  var hm = LC.hm;
  function ttOpt() { var t = ED.tt || {}; return { v: t.v === 'det' ? 'det' : 'gen', f: t.f === 'text' ? 'text' : 'table' }; }
  function isKind(p) { return !!(p && p.kind && p.kind !== 'route'); }
  function kSide(d, p) { return p.kind === 'ended' ? d.old : d.new; }
  function started(p) { return !!p.gen && start(p) <= p.gen; }
  function lastOf(p) { return p.last || LC.addDays(start(p), -1); }
  /* הכיוונים של קו חדש או מבוטל: כיוון שהתחנות שלו זהות לכיוון אחר (קו מעגלי עם שני מק"טים) — פעם אחת */
  function kDirs(p) {
    var seen = {};
    return p.dirs.filter(function (d) {
      var k = kSide(d, p).stops.map(function (s) { return s.code; }).join(',');
      if (seen[k]) return false; seen[k] = 1; return true;
    });
  }
  function ttDirs(p) { return p.dirs.filter(function (d) { return d.tt && d.tt.length; }); }

  /* ---- משפטים: כללי ---- */
  /* קו חדש: "בימי חול: 34 נסיעות, מ-5:30 עד 23:00. בשעות השיא כל 15 דק׳, בשאר היום כל 30 דק׳." */
  function newTtLine(e) {
    var s = e.sn, t = '<b>' + E(cap(dtIn(e.t))) + ':</b> ';
    if (s.n === 1) return t + 'נסיעה אחת, ב-' + hm(s.f) + '.';
    t += trips(s.n) + ', מ-' + hm(s.f) + ' עד ' + hm(s.l) + '.';
    var h = [];
    if (s.pk) h.push('בשעות השיא ' + every(s.pk));
    if (s.op) h.push((s.pk ? 'בשאר היום ' : 'באמצע היום ') + every(s.op));
    return t + (h.length ? ' ' + cap(h.join(', ')) + '.' : '');
  }
  function cap(s) { return s; }
  /* שינוי: רק מה שהשתנה — "בימי חול: 42 נסיעות במקום 36; כל 15 דק׳ בשעות השיא במקום 20; הנסיעה האחרונה ב-23:30 במקום 22:00" */
  function ttLine(e) {
    var a = e.so, b = e.sn, w = dtIn(e.t), parts = [];
    if (!a.n) return '<b>' + E(w) + '</b> הקו יתחיל לנסוע: ' + trips(b.n) + (b.n > 1 ? ', מ-' + hm(b.f) + ' עד ' + hm(b.l) : ', ב-' + hm(b.f)) + '.';
    if (!b.n) return '<b>' + E(w) + '</b> הקו כבר לא ייסע (עד היום: ' + trips(a.n) + ').';
    if (a.n !== b.n) parts.push(trips(b.n) + ' ביום במקום ' + a.n);
    if (a.pk && b.pk && Math.abs(a.pk - b.pk) >= 3) parts.push(every(b.pk) + ' בשעות השיא במקום ' + every(a.pk).replace(/^כל /, ''));
    if (a.op && b.op && Math.abs(a.op - b.op) >= 3) parts.push(every(b.op) + ' בשאר היום במקום ' + every(a.op).replace(/^כל /, ''));
    if (Math.abs(a.f - b.f) >= 10) parts.push('הנסיעה הראשונה ב-' + hm(b.f) + ' במקום ' + hm(a.f));
    if (Math.abs(a.l - b.l) >= 10) parts.push('הנסיעה האחרונה ב-' + hm(b.l) + ' במקום ' + hm(a.l));
    if (!parts.length) parts.push('אותו מספר נסיעות, אבל חלק מהשעות משתנות');
    return '<b>' + E(w) + ':</b> ' + parts.join('; ') + '.';
  }
  function noRun(p, d) {   // סוגי ימים שהקו החדש לא נוסע בהם
    var has = {}; (d.tt || []).forEach(function (e) { e.t.forEach(function (t) { has[t] = 1; }); });
    var no = DOWS.filter(function (t) { return !has[t]; });
    return no.length && no.length < 7 ? '<b>' + E(dtIn(no)) + '</b> הקו לא נוסע.' : '';
  }
  /* שינוי קטן בלו"ז: עד 6 נסיעות שנוספו או בוטלו בסך הכול, והנסיעה הראשונה/האחרונה לא זזה בחצי שעה או יותר.
     אז תמיד טקסט, ובו בדיוק אילו נסיעות */
  /* נסיעה שבוטלה ונסיעה שנוספה באותה שעה, עד 5 דקות זו מזו — אותה נסיעה שהוזזה: [שעה חדשה, 'sh', השעה הקודמת] */
  var SHIFT_MAX = 5;
  function mergeSh(o, n) {
    var items = merge(o, n), used = {};
    items.forEach(function (x, i) {
      if (x[1] !== 'rm' || used[i]) return;
      var best = -1, bd = SHIFT_MAX + 1;
      items.forEach(function (y, j) {
        if (y[1] === 'ad' && !used[j] && Math.floor(y[0] / 60) === Math.floor(x[0] / 60) && Math.abs(y[0] - x[0]) < bd) { bd = Math.abs(y[0] - x[0]); best = j; }
      });
      if (best >= 0) { used[i] = 1; used[best] = 1; items[best] = [items[best][0], 'sh', x[0]]; }
    });
    return items.filter(function (x, i) { return !(used[i] && x[1] === 'rm'); });
  }
  function ttDiff(e) {
    var out = { ad: [], rm: [], sh: [] };
    mergeSh(e.o || [], e.n || []).forEach(function (x) { if (x[1] === 'sh') out.sh.push([x[2], x[0]]); else if (x[1]) out[x[1]].push(x[0]); });
    return out;
  }
  function shWord(sh) {   // "בדקה–שתיים" / "בכמה דקות"
    return sh.every(function (z) { return Math.abs(z[1] - z[0]) <= 2; }) ? 'בדקה–שתיים' : 'בכמה דקות';
  }
  /* כמה נסיעות השתנו בסך הכול (נוספו, בוטלו, הוזזו) — בכל הימים והכיוונים */
  function ttCount(p) {
    var n = 0;
    ttDirs(p).forEach(function (d) { d.tt.forEach(function (e) {
      var x = ttDiff(e);
      // נסיעה שנוספה ונסיעה שבוטלה קרוב אליה — נסיעה אחת שזזה (כמו ב-smallLine)
      n += !x.sh.length && x.ad.length === 1 && x.rm.length === 1 && Math.abs(x.ad[0] - x.rm[0]) <= 30 ? 1 : x.ad.length + x.rm.length + x.sh.length;
    }); });
    return n;
  }
  /* שינוי קטן מאוד בלו"ז (עד 3 נסיעות): עמוד אחד — כותרת, "מה השתנה?" עם השעות במילים, והבהרות. בלי שער ובלי טבלה */
  var TT_ONE = 3;
  // "להציג את כל השעות" (ttOpt().v === 'det') — גם שינוי קטן מוצג בטבלה עם כל השעות, לא במילים
  function ttOne(p) { return ttSmall(p) && ttCount(p) <= TT_ONE && ttOpt().v !== 'det'; }
  function ttWords(p) { return ttSmall(p) && ttOpt().v !== 'det'; }
  function ttSmall(p) {
    if (p.kind !== 'timetable') return false;
    var n = 0, big = false;
    ttDirs(p).forEach(function (d) {
      d.tt.forEach(function (e) {
        var x = ttDiff(e); n += x.ad.length + x.rm.length + x.sh.length;
        if (!e.so.n || !e.sn.n || Math.abs(e.so.f - e.sn.f) >= 30 || Math.abs(e.so.l - e.sn.l) >= 30) big = true;
      });
    });
    return !big && n > 0 && n <= 6;
  }
  function hmList(a) { return andList(a.map(hm), 12); }
  function smallLine(e) {
    var x = ttDiff(e), w = dtIn(e.t), parts = [];
    if (!x.sh.length && x.ad.length === 1 && x.rm.length === 1 && Math.abs(x.ad[0] - x.rm[0]) <= 30) return '<b>' + E(w) + '</b> הנסיעה של ' + hm(x.rm[0]) + ' תצא ב-' + hm(x.ad[0]) + '.';
    if (x.sh.length && x.sh.length <= 3) x.sh.forEach(function (z) { parts.push('הנסיעה של ' + hm(z[0]) + ' תצא ב-' + hm(z[1])); });
    else if (x.sh.length) parts.push(x.sh.length + ' נסיעות הוזזו ' + shWord(x.sh));
    if (x.ad.length) parts.push((x.ad.length === 1 ? 'נוספה נסיעה ב-' : 'נוספו נסיעות ב-') + hmList(x.ad));
    if (x.rm.length) parts.push((x.rm.length === 1 ? 'בוטלה הנסיעה של ' : 'בוטלו הנסיעות של ') + hmList(x.rm));
    return '<b>' + E(w) + '</b> ' + parts.join(', ו') + '.';
  }
  /* כמה שורות כלליות לכיוון אחד */
  function ttItems(p, d) {
    if (p.kind === 'new') { var out = (d.tt || []).map(newTtLine), nr = noRun(p, d); if (nr) out.push(nr); return out; }
    if (ttSmall(p)) return (d.tt || []).map(smallLine);
    var it = (d.tt || []).map(ttLine);
    if (d.same && d.same.length) it.push('<b>' + E(dtIn(d.same)) + '</b> — אין שינוי.');
    return it;
  }
  /* "מה משתנה?" לשער, לשלט ולסטטוס */
  function kindItems(p, max) {
    var ds = p.kind === 'timetable' ? ttDirs(p) : kDirs(p), two = ds.length > 1, out = [];
    var pre = function (d) { return two ? '<b>' + E(toward(d)) + '</b>, ' : ''; };
    if (p.kind === 'new') {
      out.push((started(p) ? 'הקו התחיל לנסוע ב' : 'הקו יתחיל לנסוע ב') + E(LC.wd(start(p)) + ' ' + LC.dmy(start(p))) + '.');
      var d0 = ds[0], S0 = d0 ? d0.new.stops : [];
      if (S0.length) out.push('הקו נוסע מ<b>' + E(S0[0].name) + '</b> עד <b>' + E(S0[S0.length - 1].name) + '</b>' + (ds.length > 1 ? ' ובחזרה' : '') + ', ועוצר ב-' + S0.length + ' תחנות.');
      if (d0 && d0.tt && d0.tt.length) out.push(newTtLine(d0.tt[0]));
      if (d0) { var nr = noRun(p, d0); if (nr) out.push(nr); }
    } else if (p.kind === 'ended') {
      out.push('הנסיעה האחרונה של הקו: ' + E(LC.wd(lastOf(p)) + ' ' + LC.dmy(lastOf(p))) + '. ' + (started(p) ? 'מאז הקו לא נוסע.' : 'מ' + E(LC.wd(start(p)) + ' ' + LC.dmy(start(p))) + ' הקו לא ייסע יותר.'));
      var al = altsOf(p);
      out.push(al.length ? 'במקום זה: ' + (al.length === 1 ? 'קו <b>' + E(al[0].line) + '</b> עוצר' : 'קווים <b>' + E(andList(al.slice(0, 4).map(function (a) { return a.line; }), 4)) + '</b> עוצרים') + ' בחלק גדול מהתחנות של הקו.'
        : 'לא מצאנו קו אחר שעוצר ברוב התחנות של הקו.');
    } else if (ttSmall(p)) {
      ds.forEach(function (d) { ttItems(p, d).forEach(function (t) { out.push(t.replace(/\.$/, '') + (two ? ' (' + E(toward(d).replace(/^בנסיעה ל/, 'לכיוון ')) + ').' : '.')); }); });
    } else {
      ds.forEach(function (d) { ttItems(p, d).forEach(function (t, i) { out.push((i ? '' : pre(d)) + t); }); });
    }
    return max ? out.slice(0, max) : out;
  }
  /* קווים במקום קו שמבוטל: רק מה שהבונה מצא (תחנות משותפות), בלי כפילויות של אותו מספר קו */
  function altsOf(p) {
    var seen = {}, out = [];
    ((p.dirs[0] || {}).alts || []).forEach(function (a) { var k = a.line + '|' + a.op; if (!seen[k]) { seen[k] = 1; out.push(a); } });
    return out;
  }

  /* ---- בלוקים של לוח הזמנים, ועימוד לעמודים ---- */
  // מידות לכל צורה: H — גובה שטח התוכן; rowH — שורת טבלה; per — כמה שעות נכנסות בשורה בעמודת זמנים; lineH/perLine — טקסט
  var TTM = {
    deck: { cols: 14, gridH: 40, genH: 40, H: 520, th: 40, rowH: 31, rowX: 24, per: 15, perN: 9, lineH: 31, cpl: 92, tok: 19, titleH: 46, gap: 14 },
    sign: { cols: 10, gridH: 42, genH: 46, H: 800, th: 44, rowH: 33, rowX: 26, per: 9, perN: 6, lineH: 34, cpl: 56, tok: 11, titleH: 48, gap: 16 },
    status: { cols: 8, gridH: 62, genH: 64, H: 1120, th: 64, rowH: 50, rowX: 40, per: 8, perN: 5, lineH: 52, cpl: 38, tok: 8, titleH: 70, gap: 24 }
  };
  function merge(o, n) {
    var i = 0, j = 0, out = [];
    while (i < o.length || j < n.length) {
      if (j >= n.length || (i < o.length && o[i] < n[j])) out.push([o[i++], 'rm']);
      else if (i >= o.length || n[j] < o[i]) out.push([n[j++], 'ad']);
      else { out.push([o[i], '']); i++; j++; }
    }
    return out;
  }
  function hh(m) { return String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0'); }
  function mm(m) { return String(m % 60).padStart(2, '0'); }
  function byHour(items) {   // [[דקות, סימן]] → [{h, items}] לפי השעה (אחרי חצות — בסוף, לפי הסדר)
    var out = [];
    items.forEach(function (x) { var h = Math.floor(x[0] / 60), r = out[out.length - 1]; if (!r || r.h !== h) out.push(r = { h: h, items: [] }); r.items.push(x); });
    return out;
  }
  function tok(x, full) { return '<span class="tm' + (x[1] ? ' ' + x[1] : '') + '">' + (full ? hm(x[0]) : mm(x[0])) + '</span>'; }
  function dirTitle(p, d, n) { return n > 1 || p.kind !== 'timetable' ? '<h3 class="tt-dir hd">' + E(trip(d)) + '</h3>' : ''; }

  /* מחזיר רשימת בלוקים: {h, html} (לא מתחלק) או {rows: [{h, html}], open(cont), close, th} (טבלה שמתחלקת בין עמודים) */
  function ttBlocks(p, form) {
    var M = TTM[form], o = ttWords(p) ? { v: 'gen', f: 'text' } : ttOpt(), blocks = [], ds = p.kind === 'timetable' ? ttDirs(p) : kDirs(p).filter(function (d) { return d.tt && d.tt.length; });
    var effTxt = 'מ-' + LC.dm(start(p));
    // שני כיוונים עם בדיוק אותו לוח זמנים — פעם אחת, "בשני הכיוונים"
    var sig2 = function (d) { return JSON.stringify([o.v === 'gen' ? (d.tt || []).map(function (e) { return [e.t, e.so, e.sn]; }) : d.tt, d.same]); };
    var same2 = ds.length === 2 && sig2(ds[0]) === sig2(ds[1]);
    if (same2) ds = ds.slice(0, 1);
    ds.forEach(function (d, di) {
      var title = same2 ? '<h3 class="tt-dir hd">בשני הכיוונים</h3>' : dirTitle(p, d, ds.length), tH = title ? M.titleH : 0;
      if (o.v === 'gen' && o.f === 'text') {
        var items = ttItems(p, d), h = tH + M.gap;
        items.forEach(function (t) { h += Math.ceil(plain(t).length / M.cpl) * M.lineH + 6; });
        blocks.push({ h: h, html: '<div class="tt-blk">' + title + '<ul class="tt-list">' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' });
      } else if (o.v === 'gen') {
        blocks.push(genTable(p, d, title, tH, M, effTxt));
      } else if (o.f === 'table') {
        d.tt.forEach(function (e, ei) { blocks.push(detTable(p, e, ei ? '' : title, M)); });
      } else {
        (p.kind === 'new' ? d.tt : d.tt).forEach(function (e, ei) { blocks.push(detText(p, e, ei ? '' : title, ei ? 0 : tH, M, effTxt)); });
      }
    });
    return blocks;
  }
  /* ---- כללי, טבלה: שורה לכל סוג יום; עמודה לכל נתון — "עד היום" ו"מ-..." (מה שהשתנה — מודגש בירוק) ---- */
  var METS = [
    ['נסיעות ביום', function (s) { return s.n ? String(s.n) : 'אין'; }, function (a, b) { return a.n !== b.n; }],
    ['הנסיעה הראשונה', function (s) { return s.n ? hm(s.f) : '—'; }, function (a, b) { return a.n && b.n && Math.abs(a.f - b.f) >= 10; }],
    ['הנסיעה האחרונה', function (s) { return s.n ? hm(s.l) : '—'; }, function (a, b) { return a.n && b.n && Math.abs(a.l - b.l) >= 10; }],
    ['כל כמה דקות בשעות השיא', function (s) { return s.pk ? s.pk + ' דק׳' : '—'; }, function (a, b) { return a.pk && b.pk && Math.abs(a.pk - b.pk) >= 3; }],
    ['כל כמה דקות בשאר היום', function (s) { return s.op ? s.op + ' דק׳' : '—'; }, function (a, b) { return a.op && b.op && Math.abs(a.op - b.op) >= 3; }]
  ];
  function genTable(p, d, title, tH, M, effTxt) {
    var es = d.tt, isNew = p.kind === 'new', ncol = METS.length * (isNew ? 1 : 2);
    var head = '<tr><th class="dt" rowspan="' + (isNew ? 1 : 2) + '">ימים</th>' + METS.map(function (m) { return isNew ? '<th>' + m[0] + '</th>' : '<th colspan="2" class="grp">' + m[0] + '</th>'; }).join('') + '</tr>' +
      (isNew ? '' : '<tr>' + METS.map(function () { return '<th class="was">עד היום</th><th class="now">' + E(effTxt) + '</th>'; }).join('') + '</tr>');
    var rows = es.map(function (e) {
      return '<tr><th class="dt">' + E(daysShort(e.t)) + '</th>' + METS.map(function (m) {
        if (isNew) return '<td class="now">' + m[1](e.sn) + '</td>';
        return '<td class="was">' + m[1](e.so) + '</td><td class="now' + (m[2](e.so, e.sn) ? ' chg' : '') + '">' + m[1](e.sn) + '</td>';
      }).join('') + '</tr>';
    });
    // סוגי ימים בלי שינוי (או שהקו החדש לא נוסע בהם) — שורה בהירה אחת
    var other = isNew ? DOWS.filter(function (t) { return !es.some(function (e) { return e.t.indexOf(t) >= 0; }); }) : (d.same || []);
    if (other.length) rows.push('<tr class="same"><th class="dt">' + E(daysShort(other)) + '</th><td colspan="' + ncol + '">' + (isNew ? 'הקו לא נוסע' : 'ללא שינוי') + '</td></tr>');
    return { h: tH + M.th * (isNew ? 1 : 2) + rows.length * M.genH + M.gap,
      html: '<div class="tt-blk">' + title + '<table class="tt-g2' + (isNew ? ' one' : '') + '"><thead>' + head + '</thead><tbody>' + rows.join('') + '</tbody></table></div>' };
  }

  /* ---- מפורט, טבלה: כמו לוח זמנים מודפס. שורה לכל שעה ("14:00" בתא כהה מימין), וכל יציאה בתא משלה
     (הדקות), בסדר עולה מימין לשמאל. מציגים את הלוח החדש; נסיעה חדשה — תא ירוק עם "חדש", נסיעה שבוטלה — באותה שורה,
     תא אדום מחוק. בשינוי קטן — שעות בלי שינוי מתקפלות לשורה אחת בהירה ("06:00–13:00 ללא שינוי") ---- */
  function diffSummary(e) {
    var x = ttDiff(e), t = [];
    if (!x.ad.length && !x.rm.length && !x.sh.length) return '';
    if (x.ad.length) t.push(x.ad.length === 1 ? 'נסיעה חדשה אחת' : x.ad.length + ' נסיעות חדשות');
    if (x.rm.length) t.push(x.rm.length === 1 ? (t.length ? 'אחת בוטלה' : 'נסיעה אחת בוטלה') : x.rm.length + (t.length ? ' בוטלו' : ' נסיעות בוטלו'));
    if (x.sh.length) t.push((x.sh.length === 1 ? (t.length ? 'אחת הוזזה ' : 'נסיעה אחת הוזזה ') : x.sh.length + (t.length ? ' הוזזו ' : ' נסיעות הוזזו ')) + shWord(x.sh));
    var all = x.ad.concat(x.rm).concat(x.sh.map(function (z) { return z[1]; })).sort(function (a, b) { return a - b; });
    var rng = all.length === 1 ? 'ב-' + hm(all[0]) : 'בין ' + hm(all[0]) + ' ל-' + hm(all[all.length - 1]);
    var keep = e.n.length - x.ad.length - x.sh.length;
    return '<b>' + E(dtIn(e.t)) + ':</b> ' + t.join(', ') + ', ' + rng + (keep > 0 ? '. השאר ללא שינוי.' : '.');
  }
  function detTable(p, e, title, M) {
    var isNew = p.kind === 'new', items = isNew ? e.n.map(function (m) { return [m, '']; }) : mergeSh(e.o, e.n);
    // לפחות 5 תאים בשורה — גם בקו עם נסיעה אחת בשעה, כדי שהטבלה לא תהיה עמודה צרה
    var hrs = byHour(items), K = Math.max(5, Math.min(M.cols, Math.max.apply(null, hrs.map(function (r) { return r.items.length; }))));
    var chg = function (r) { return r.items.some(function (x) { return x[1]; }); };
    var nChg = hrs.filter(chg).length, fold = !isNew && nChg <= Math.max(2, hrs.length * 0.4);
    var cellOf = function (x) {
      return '<td class="m' + (x[1] ? ' ' + x[1] : '') + '">' + mm(x[0]) + (x[1] === 'ad' ? '<small>חדש</small>' : x[1] === 'rm' ? '<small>בוטלה</small>' : x[1] === 'sh' ? '<small>היה ' + hm(x[2]) + '</small>' : '') + '</td>';
    };
    var rows = [];
    for (var i = 0; i < hrs.length; i++) {
      var r = hrs[i];
      if (fold && !chg(r)) {
        var j = i; while (j + 1 < hrs.length && !chg(hrs[j + 1])) j++;
        if (j > i) {
          rows.push({ h: M.gridH * 0.8, html: '<tr class="fold"><th class="hr"></th><td colspan="' + K + '"><b class="num">' + hh(r.h * 60) + ':00–' + hh(hrs[j].h * 60) + ':59</b> · ללא שינוי</td></tr>' });
          i = j; continue;
        }
      }
      for (var k = 0; k < r.items.length; k += K) {
        var part = r.items.slice(k, k + K), pad = '';
        for (var q = part.length; q < K; q++) pad += '<td class="m e"></td>';
        rows.push({ h: M.gridH, html: '<tr' + (chg(r) ? ' class="hc"' : '') + '><th class="hr' + (k ? ' cont' : '') + '">' + (k ? '' : hh(r.h * 60) + ':00') + '</th>' + part.map(cellOf).join('') + pad + '</tr>' });
      }
    }
    var sum = isNew ? '' : diffSummary(e);
    var cap = function (cont) { return '<h4 class="tt-day">' + E(dayName(e.t)) + (cont ? ' (המשך)' : '') + '<span>' + (isNew ? trips(e.sn.n) : trips(e.so.n) + ' עד היום · ' + trips(e.sn.n) + ' מעכשיו') + '</span></h4>'; };
    return { rows: rows, th: M.th + M.titleH + (sum ? M.lineH : 0) + (title ? M.titleH : 0), gap: M.gap,
      open: function (cont) {
        return '<div class="tt-blk">' + (cont ? '' : title) + cap(cont) + (sum && !cont ? '<p class="tt-sum">' + sum + '</p>' : '') +
          '<table class="tt-grid"><thead><tr><th class="hr">שעה</th><th colspan="' + K + '">' + (isNew ? 'דקות אחרי השעה' : 'דקות אחרי השעה — הלוח החדש') + '</th></tr></thead><tbody>';
      },
      close: '</tbody></table></div>' };
  }
  /* מפורט, טקסט: כל השעות ברצף — חדשות בירוק, שמבוטלות באדום מחוק */
  function detText(p, e, title, tH, M, effTxt) {
    var items = p.kind === 'new' ? e.n.map(function (m) { return [m, '']; }) : mergeSh(e.o, e.n);
    var head = '<div class="tt-cap"><b>' + E(dayName(e.t)) + '</b><span>' + (p.kind === 'new' ? trips(e.sn.n) : trips(e.so.n) + ' ← ' + trips(e.sn.n)) + '</span></div>';
    // בטקסט ארוך — מחלקים לשורות של שעה-שעתיים, כדי שהעין תמצא את השעה
    var rows = [], cur = [], curH = -1;
    items.forEach(function (x) { var h = Math.floor(x[0] / 120); if (h !== curH && cur.length) { rows.push(cur); cur = []; } curH = h; cur.push(x); });
    if (cur.length) rows.push(cur);
    return { rows: rows.map(function (r) { return { h: Math.ceil(r.length / M.tok) * M.lineH + 4, html: '<p class="tt-run">' + r.map(function (x) { return tok(x, true); }).join(' ') + '</p>' }; }),
      th: tH + M.titleH, gap: M.gap,
      open: function (cont) { return '<div class="tt-blk">' + (cont ? '' : title) + head.replace('</b>', cont ? ' (המשך)</b>' : '</b>'); },
      close: '</div>' };
  }
  /* H0 — גובה העמוד הראשון, כשהוא קצר יותר (יש בו כותרת גדולה) */
  function paginate(blocks, H1, H0) {
    var pages = [], cur = '', used = 0, H = H0 || H1;
    var flush = function () { if (cur) pages.push(cur); cur = ''; used = 0; H = H1; };
    blocks.forEach(function (b) {
      if (!b.rows) { if (used && used + b.h > H) flush(); cur += b.html; used += b.h; return; }
      var i = 0;
      while (i < b.rows.length) {
        var min = b.th + b.rows.slice(i, i + 3).reduce(function (t, r) { return t + r.h; }, 0);
        if (used && used + min > H) flush();
        var room = H - used - b.th, k = i;
        while (k < b.rows.length && (k === i || room - b.rows[k].h >= 0)) { room -= b.rows[k].h; k++; }
        // שארית של שורה-שתיים — עוברת לעמוד הבא יחד עם קודמותיה, לא לבד
        if (k < b.rows.length && b.rows.length - k <= 2 && k - i > 4) k -= 2;
        cur += b.open(i > 0) + b.rows.slice(i, k).map(function (r) { return r.html; }).join('') + b.close;
        used += b.th + b.rows.slice(i, k).reduce(function (t, r) { return t + r.h; }, 0) + b.gap;
        i = k;
        if (i < b.rows.length) flush();
      }
    });
    flush();
    return pages;
  }
  function ttKey(p) {
    var o = ttOpt();
    if (o.v !== 'det' || p.kind !== 'timetable' || ttWords(p)) return '';
    return o.f === 'table'
      ? '<p class="tt-key"><span><i class="m">20</i>ללא שינוי</span><span><i class="m ad">20<small>חדש</small></i>נסיעה חדשה</span><span><i class="m rm">20<small>בוטלה</small></i>נסיעה שבוטלה</span><span><i class="m sh">30<small>היה 14:31</small></i>נסיעה שהוזזה</span></p>'
      : '<p class="tt-key"><span class="tm ad">14:20</span> נסיעה חדשה <span class="tm rm">14:20</span> נסיעה שבוטלה <span class="tm sh">14:30</span> נסיעה שהוזזה</p>';
  }
  function ttPagesHtml(p, form, H) { return paginate(ttBlocks(p, form), H || TTM[form].H); }

  /* ---- מפה של כל המסלול (קו חדש: ירוק · קו מבוטל: אדום מקווקו) ---- */
  function routeLegend(p, g) {
    // מפה קרובה (g): התחנות של האזור ממוספרות; בלי "הראשונה והאחרונה" ובלי "קווים אחרים" — הם לא מסומנים בה
    var al = !g && p.kind === 'ended' && altsOf(p).length;
    return '<div class="legend">' + (p.kind === 'new' ? '<span><i class="sw"></i>המסלול של הקו החדש</span>' : '<span><i class="sw old"></i>המסלול של הקו (עד ' + E(LC.dm(lastOf(p))) + ')</span>') +
      (g ? '<span><i class="dot ' + (p.kind === 'ended' ? 'rem' : 'add') + '">1</i>תחנה באזור הזה (כמו ברשימה)</span><span><i class="dot same"></i>תחנה אחרת של הקו</span>'
        : '<span><i class="dot same"></i>תחנה</span>' + (kTwo(p) ? '<span><i class="dot end"></i><i class="dot end b"></i>התחנה הראשונה והאחרונה בכל כיוון</span>'
          : '<span><i class="dot end"></i>התחנה הראשונה והאחרונה</span>')) +
      (al ? '<span><i class="dot alt"></i>תחנה שעוצרים בה קווים אחרים</span>' : '') + '</div>';
  }
  function routeMap(p) { return { route: true, kind: p.kind, dirs: kDirs(p), alts: p.kind === 'ended' ? altsOf(p) : [] }; }
  function altList(p, max, cls) {
    var al = altsOf(p).slice(0, max || 4);
    if (!al.length) return '<p class="alt-none">לא מצאנו קו אחר שעוצר ברוב התחנות של הקו. כדאי לבדוק במוקד או באפליקציה.</p>';
    return '<ul class="alts' + (cls ? ' ' + cls : '') + '">' + al.map(function (a) {
      return '<li><span class="badge sm num">' + E(a.line) + '</span><span class="at"><b>' + E(LC.od(a.od) || a.od[0]) + '</b>' +
        '<span>' + E(a.op) + ' · עוצר ב-' + a.n + ' מתוך ' + a.tot + ' התחנות, למשל ב' + E(a.s) + '</span></span></li>';
    }).join('') + '</ul>';
  }
  function kindMapSlide(p, pre) {
    var ds = kDirs(p), d = ds[0], S = kSide(d, p).stops, two = kTwo(p);
    // שני כיוונים שונים (הלוך וחזור): במקום משפט על הכיוון הראשון — שורה לכל כיוון, עם התחנות והשעות שלו
    var lead = p.kind === 'new'
      ? (started(p) ? 'הקו התחיל לנסוע ב' : 'הקו יתחיל לנסוע ב') + E(LC.wd(start(p)) + ' ' + LC.dmy(start(p))) + '. ' + (S.length && !two ? 'הוא נוסע מ<b>' + E(S[0].name) + '</b> עד <b>' + E(S[S.length - 1].name) + '</b>, ועוצר ב-' + S.length + ' תחנות.' : '')
      : 'הנסיעה האחרונה: <b>' + E(LC.wd(lastOf(p)) + ' ' + LC.dmy(lastOf(p))) + '</b>. ' + (started(p) ? 'מאז הקו לא נוסע.' : 'אחרי זה הקו לא ייסע יותר.');
    return { id: p.id + '-km', label: pre + 'מפה · ' + (p.kind === 'new' ? 'המסלול של הקו החדש' : 'המסלול של הקו שמבוטל'), map: routeMap(p),
      html: '<div class="s-map k-' + p.kind + (two ? ' two' : '') + '"><div class="smap"></div><div class="side">' +
        '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(p.op) + '</span></div>' +
        '<h2 class="hd">' + E(p.kind === 'new' ? 'קו חדש' : 'הקו מפסיק לפעול') + '</h2><p class="kod">' + E(odTxt(p)) + '</p>' +
        '<p class="lead">' + lead + '</p>' + (two ? kDirBlocks(p, p.kind === 'new' ? 3 : 0) : '') +
        (p.kind === 'ended' ? '<div class="instead"><h3 class="hd">במקום זה</h3>' + altList(p, two ? 2 : 3) + '</div>'
          : (!two && d.tt && d.tt.length ? '<ul class="tt-list sm">' + ttItems(p, d).slice(0, 3).map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '')) +
        routeLegend(p) +
        '<div style="font-size:13px;color:var(--s-sub)">הוכן על ידי אדם פרטי · לא פרסום רשמי</div>' +
        '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>' };
  }
  /* קו חדש או מבוטל עם שני כיוונים שונים (הלוך וחזור): בשקף המפה, בשלט ובסטטוס — בלוק קצר לכל כיוון:
     "מבית שמש לנוף הגליל: מ<הראשונה> עד <האחרונה>, 38 תחנות", ומתחתיו השעות של הכיוון (עד nTT שורות) */
  function kTwo(p) { return (p.kind === 'new' || p.kind === 'ended') && kDirs(p).length > 1; }
  function kDirLbl(d) { var o = d.od || []; return o[0] && o[1] && o[0] !== o[1] ? 'מ' + o[0] + ' ל' + o[1] : 'מ' + endName(d, 0) + ' ל' + endName(d, 1); }
  function kDirBlocks(p, nTT) {
    return '<div class="kdirs">' + kDirs(p).slice(0, 3).map(function (d, i) {
      var S = kSide(d, p).stops; if (!S.length) return '';
      var its = nTT ? ttItems(p, d).slice(0, nTT) : [];
      return '<div class="kdir"><p><i class="dot end' + (i ? ' b' : '') + '"></i><span><b>' + E(kDirLbl(d)) + ':</b> מ' + E(S[0].name) + ' עד ' + E(S[S.length - 1].name) + ', ' + S.length + ' תחנות</span></p>' +
        (its.length ? '<ul class="tt-list sm">' + its.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }).join('') + '</div>';
  }
  /* כל התחנות של קו חדש: שלוש עמודות, המשך בשקף הבא */
  function routeStopsSlides(p, d, pre, rows) {
    var S = d.new.stops;
    if (S.length <= rows * 3) rows = Math.max(6, Math.ceil(S.length / 3));
    var per = rows * 3, out = [], n = Math.ceil(S.length / per);
    var cnt = {}; S.forEach(function (s) { if (s.city) cnt[s.city] = (cnt[s.city] || 0) + 1; });
    var main = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
    for (var i = 0; i < n; i++) {
      var part = S.slice(i * per, (i + 1) * per), cols = [0, 1, 2].map(function (c) { return part.slice(c * rows, (c + 1) * rows); }).filter(function (c) { return c.length; });
      out.push({ id: p.id + '-rs' + p.dirs.indexOf(d) + '-' + i, label: pre + 'התחנות · ' + trip(d) + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: '<div class="s-stops s-rstops"><div class="head"><span class="badge sm num">' + E(p.line) + '</span><h2 class="hd">התחנות · ' + E(trip(d)) + (i ? ' (המשך)' : '') + '</h2></div>' +
          '<div class="rcols">' + cols.map(function (c, ci) {
            return '<ol>' + c.map(function (s, j) {
              var k = i * per + ci * rows + j, end = k === 0 || k === S.length - 1;
              return '<li><i class="dot ' + (end ? 'end' : 'add') + '">' + (k + 1) + '</i><span class="nm">' + E(s.name) + (s.city && s.city !== main ? ' <span class="cd">' + E(s.city) + '</span>' : '') + '</span></li>';
            }).join('') + '</ol>';
          }).join('') + '</div>' +
          '<div class="sfoot"><span>' + S.length + ' תחנות · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>' });
    }
    return out;
  }
  /* "במקום זה" — שקף עם כל הקווים שעוצרים בתחנות של קו שמבוטל */
  function altsSlide(p, pre) {
    return { id: p.id + '-alt', label: pre + 'במקום זה: קווים אחרים',
      html: '<div class="s-alts"><div class="head"><span class="badge sm num">' + E(p.line) + '</span><h2 class="hd">במקום הקו: קווים שעוצרים באותן תחנות</h2></div>' +
        '<p class="lead">הקווים האלה עוצרים בחלק גדול מהתחנות של קו ' + E(p.line) + '. הם לא נוסעים בדיוק באותו מסלול — בדקו לאן כל קו נוסע לפני שעולים.</p>' +
        altList(p, 5, 'big') +
        '<div class="sfoot"><span>לפי התחנות שבהן הקווים עוצרים בנתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>' };
  }
  /* שקפי לוח הזמנים (מצגת) */
  function ttSlides(p, pre) {
    var o = ttOpt(), pages = ttPagesHtml(p, 'deck');
    var ttl = p.kind === 'new' ? 'מתי הקו נוסע' : 'לוח הזמנים החדש';
    return pages.map(function (h, i) {
      return { id: p.id + '-tt' + i, label: pre + ttl + (pages.length > 1 ? ' (' + (i + 1) + '/' + pages.length + ')' : ''),
        html: '<div class="s-tt"><div class="head"><span class="badge sm num">' + E(p.line) + '</span><div class="t"><h2 class="hd">' + E(ttl) + (i ? ' (המשך)' : '') + '</h2>' +
          '<p class="sub">' + E((p.kind === 'timetable' ? (ttDirs(p).length === 1 ? trip(ttDirs(p)[0]) + ' · ' : '') : '') + (p.kind === 'new' ? 'החל מ-' : 'החל מ') + (p.kind === 'new' ? LC.dmy(start(p)) : LC.wd(start(p)) + ' ' + LC.dmy(start(p)))) + '</p></div>' + ttKey(p) + '</div>' +
          '<div class="tt-body f-' + o.f + ' v-' + o.v + '">' + h + '</div>' +
          '<div class="sfoot"><span>שעת היציאה מהתחנה הראשונה · שעות השיא: 7:00–9:00 ו-16:00–19:00 · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>' };
    });
  }
  /* ---- מפות מקורבות לתחנות (קו חדש / מבוטל): אחרי מפת כל המסלול — מפה קרובה לכל מקום שבו הקו נכנס ליישוב
     או לשכונה (מושב, קיבוץ, לולאה בעיר), כשבמפה הכללית התחנות שם צפופות מדי. בחירה של מי שמכין (ED.zm):
     'yes' / 'no'; בלי בחירה — בקו חדש כן, בקו מבוטל לא ---- */
  function zoomOn(p) { return ED.zm === 'yes' ? true : ED.zm === 'no' ? false : p.kind === 'new'; }
  var ZM_GAP = 1500, ZM_MAX = 4;
  function zoomGroups(p) {
    var d = kDirs(p)[0]; if (!d) return [];
    var S = kSide(d, p).stops; if (S.length < 6) return [];
    var lats = S.map(function (x) { return x.ll[0]; }), lons = S.map(function (x) { return x.ll[1]; });
    var diag = dist([Math.min.apply(null, lats), Math.min.apply(null, lons)], [Math.max.apply(null, lats), Math.max.apply(null, lons)]);
    var mpp = diag / 950;   // מטרים לפיקסל בערך, במפה של כל המסלול (כ-700×680)
    var gs = [], cur = null;
    S.forEach(function (st, k) {
      var prev = k ? S[k - 1] : null;
      if (!cur || (st.city && prev.city && st.city !== prev.city) || dist(prev.ll, st.ll) > ZM_GAP) { cur = { ix: [] }; gs.push(cur); }
      cur.ix.push(k);
    });
    var ext = function (g) {
      var a = g.ix.map(function (k) { return S[k].ll; }), la = a.map(function (x) { return x[0]; }), lo = a.map(function (x) { return x[1]; });
      return dist([Math.min.apply(null, la), Math.min.apply(null, lo)], [Math.max.apply(null, la), Math.max.apply(null, lo)]);
    };
    var spacing = function (g) {   // המרחק החציוני בין תחנות סמוכות באזור
      var ds = []; for (var i = 1; i < g.ix.length; i++) ds.push(dist(S[g.ix[i - 1]].ll, S[g.ix[i]].ll));
      ds.sort(function (a, b) { return a - b; }); return ds.length ? ds[Math.floor(ds.length / 2)] : 1e9;
    };
    // רק אזורים עם 3 תחנות לפחות, שבמפה הכללית צפופים (פחות מ-28 פיקסלים בין תחנות), ולא כמעט כל המסלול
    gs = gs.filter(function (g) { return g.ix.length >= 3 && spacing(g) / mpp < 28 && ext(g) < diag * 0.5; });
    while (gs.length > ZM_MAX) {   // יותר מדי — מאחדים את שני האזורים הסמוכים הקרובים ביותר
      var bi = 0, bd = Infinity;
      for (var i = 1; i < gs.length; i++) { var dd = dist(S[gs[i - 1].ix[gs[i - 1].ix.length - 1]].ll, S[gs[i].ix[0]].ll); if (dd < bd) { bd = dd; bi = i; } }
      var a = gs[bi - 1].ix[0], b = gs[bi].ix[gs[bi].ix.length - 1];
      gs.splice(bi - 1, 2, { ix: S.slice(a, b + 1).map(function (_, j) { return a + j; }) });
    }
    var names = gs.map(function (g) {
      var n = {}; g.ix.forEach(function (k) { var c = S[k].city; if (c) n[c] = (n[c] || 0) + 1; });
      var c = Object.keys(n).sort(function (x, y) { return n[y] - n[x]; })[0];
      return c ? 'ב' + c : 'ליד ' + S[g.ix[0]].name;
    });
    return gs.map(function (g, i) {
      var same = names.filter(function (x) { return x === names[i]; }).length > 1;
      return { d: d, ix: g.ix, name: names[i] + (same ? ' (' + (names.slice(0, i + 1).filter(function (x) { return x === names[i]; }).length) + ')' : ''),
        codes: g.ix.map(function (k) { return S[k].code; }) };
    });
  }
  function zoomMap(p, g) {
    var nums = {}, S = kSide(g.d, p).stops; g.ix.forEach(function (k) { nums[S[k].code] = k + 1; });
    return { route: true, kind: p.kind, dirs: [g.d], alts: p.kind === 'ended' ? altsOf(p) : [], focus: g.codes, nums: nums };
  }
  function zoomList(p, g, max) {
    var S = kSide(g.d, p).stops, ix = g.ix.slice(0, max || 16), two = ix.length > 8;
    // הרבה תחנות — בשתי עמודות, כדי שהרשימה תיכנס לצד של השקף
    return '<ol class="zm-list" style="list-style:none;margin:0;padding:0;' + (two ? 'columns:2;column-gap:14px;font-size:15px' : 'font-size:17px') + '">' + ix.map(function (k) {
      return '<li style="display:flex;gap:6px;align-items:center;break-inside:avoid;margin-bottom:4px"><i class="dot ' + (p.kind === 'ended' ? 'rem' : 'add') + '">' + (k + 1) + '</i><span>' + E(S[k].name) + '</span></li>';
    }).join('') + (g.ix.length > ix.length ? '<li>ועוד ' + (g.ix.length - ix.length) + ' תחנות</li>' : '') + '</ol>';
  }
  function zoomSlides(p, pre) {
    if (!zoomOn(p)) return [];
    var gs = zoomGroups(p);
    return gs.map(function (g, i) {
      return { id: p.id + '-kz' + i, label: pre + 'מפה קרובה · ' + g.name, map: zoomMap(p, g),
        html: '<div class="s-map k-' + p.kind + '"><div class="smap"></div><div class="inset"></div><div class="side">' +
          '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(p.op) + '</span></div>' +
          '<h2 class="hd">' + E((p.kind === 'new' ? 'הקו החדש ' : 'הקו שמבוטל ') + g.name) + '</h2>' +
          (gs.length > 1 ? '<p class="part">מפה קרובה ' + (i + 1) + ' מתוך ' + gs.length + '</p>' : '') +
          '<p class="kod">' + E(trip(g.d)) + ' · ' + g.ix.length + ' תחנות כאן (המספרים כמו ברשימת התחנות)</p>' +
          zoomList(p, g, 16) + routeLegend(p, g) +
          '<div style="font-size:13px;color:var(--s-sub)">הוכן על ידי אדם פרטי · לא פרסום רשמי</div>' +
          '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>' };
    });
  }
  function kindSlides(p, pre, noTt) {
    var out = [];
    if (p.kind === 'new' || p.kind === 'ended') { out.push(kindMapSlide(p, pre)); zoomSlides(p, pre).forEach(function (s) { out.push(s); }); }
    if (p.kind === 'new') kDirs(p).forEach(function (d) { routeStopsSlides(p, d, pre, ED.look === 'large' ? 9 : 12).forEach(function (s) { out.push(s); }); });
    if (p.kind === 'ended' && altsOf(p).length > 3) out.push(altsSlide(p, pre));
    if (p.kind !== 'ended' && !noTt) ttSlides(p, pre).forEach(function (s) { out.push(s); });
    return out;
  }

  /* ---- שלט להדפסה ---- */
  /* כותרת ליד התגית הכחולה, שכבר מראה את מספר הקו — בלי לחזור על המספר */
  function badgeTitle(p) {
    return p.kind === 'new' ? 'קו חדש' : p.kind === 'ended' ? 'מפסיק לפעול' : p.kind === 'timetable' ? 'לוח זמנים חדש' : 'שינוי';
  }
  function kindTitle(p) {
    return p.kind === 'new' ? 'קו חדש: ' + p.line : p.kind === 'ended' ? 'קו ' + p.line + ' מפסיק לפעול' : 'לוח זמנים חדש לקו ' + p.line;
  }
  function kindWhen(p) {
    return p.kind === 'ended' ? '<b>הנסיעה האחרונה: ' + E(LC.wd(lastOf(p)) + ' ' + LC.dmy(lastOf(p))) + '</b><span>' + E(hebDate(lastOf(p))) + '</span>'
      : '<b>החל מ' + E(LC.wd(start(p)) + ' ' + LC.dmy(start(p))) + '</b><span>' + E(hebDate(start(p))) + '</span>';
  }
  function signBand(p) {
    return '<div class="sg-band"><div class="sg-row"><div class="badges">' + badgesHtml([p.line]) + '</div>' +
      '<div class="t"><h1 class="hd">' + E(badgeTitle(p)) + '</h1><p class="sub">' + E([odTxt(p), p.op].filter(Boolean).join(' · ')) + '</p></div></div>' +
      '<div class="seam"><i></i></div></div>';
  }
  function signFoot(feed, map) {
    return '<div class="sg-foot"><span>לפי נתוני משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') + (map ? ' · מפה: © תורמי OpenStreetMap' : '') +
      (ED.credit === false ? '' : ' · נוצר בכלי של הקו הבוחן, <b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>';
  }
  function kindSign(p, feed, pre) {
    var out = [], o = ttOpt(), ops = [p.op];
    var contact = '<div class="sg-contact"><span class="l">לפני הנסיעה בדקו:</span>' + contactHtml(ops) + '</div>' +
      '<div class="note">המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי. ' + (p.kind === 'ended' ? 'המידע' : 'לוח הזמנים') + ' עלול להשתנות.</div>';
    if (p.kind === 'new' || p.kind === 'ended') {
      var items = kindItems(p).slice(p.kind === 'new' ? 1 : 0, p.kind === 'new' ? 4 : 1);
      out.push({ id: 'sg-' + p.id, label: pre + 'שלט', map: routeMap(p),
        html: '<div class="s-sign k-' + p.kind + '">' + signBand(p) + '<div class="sg-when">' + kindWhen(p) + '</div>' +
          '<div class="sg-mapw"><div class="smap"></div></div>' + routeLegend(p) +
          '<div class="sg-what"><h2 class="hd">' + (p.kind === 'new' ? 'הקו החדש' : 'מה זה אומר?') + '</h2>' +
            (kTwo(p) && p.kind === 'new' ? kDirBlocks(p, 2) : '<ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>') + '</div>' +
          (p.kind === 'ended' ? '<div class="sg-near sg-alts"><h3 class="hd">במקום זה</h3>' + altList(p, 3) + '</div>' : '') +
          contact + signFoot(feed, true) + '</div>' });
      if (zoomOn(p)) zoomGroups(p).forEach(function (g, i, gs) {
        out.push({ id: 'sg-' + p.id + '-kz' + i, label: pre + 'שלט · מפה קרובה ' + g.name, map: zoomMap(p, g),
          html: '<div class="s-sign k-' + p.kind + '">' + signBand(p) + '<div class="sg-when"><b>' + E((p.kind === 'new' ? 'הקו החדש ' : 'הקו שמבוטל ') + g.name) + '</b><span>' +
            (gs.length > 1 ? 'מפה קרובה ' + (i + 1) + ' מתוך ' + gs.length : '') + '</span></div>' +
            '<div class="sg-mapw"><div class="smap"></div></div>' + routeLegend(p, g) +
            '<div class="sg-what"><h2 class="hd">התחנות כאן</h2>' + zoomList(p, g, 6) + '</div>' + signFoot(feed, true) + '</div>' });
      });
    }
    if (ttOne(p)) {   // שינוי קטן מאוד בלו"ז: שלט אחד — מה השתנה, בשעות, במילים
      out.push({ id: 'sg-' + p.id + '-tt0', label: pre + 'שלט · לוח הזמנים',
        html: '<div class="s-sign s-signtt">' + signBand(p) + '<div class="sg-when">' + kindWhen(p) + '</div>' +
          '<div class="sg-what"><h2 class="hd">מה משתנה?</h2><p style="font-size:22px;margin:0 0 10px;color:var(--s-sub)">המסלול והתחנות לא משתנים — רק השעות של ' +
          (ttCount(p) === 1 ? 'נסיעה אחת' : ttCount(p) + ' נסיעות') + '.</p><ul>' + kindItems(p).map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' +
          contact + signFoot(feed, false) + '</div>' });
      return out;
    }
    if (p.kind !== 'ended' && !(p.kind === 'new' && o.v === 'gen' && o.f === 'text')) {
      // השלט הראשון של שינוי בלו"ז: עם כותרת גדולה, מוקדים והבהרה — פחות מקום ללוח הזמנים
      var first = p.kind === 'timetable', pages = paginate(ttBlocks(p, 'sign'), TTM.sign.H, first ? 660 : 0);
      pages.forEach(function (h, i) {
        out.push({ id: 'sg-' + p.id + '-tt' + i, label: pre + (p.kind === 'new' ? 'מתי הקו נוסע' : 'שלט · לוח הזמנים') + (pages.length > 1 ? ' (' + (i + 1) + '/' + pages.length + ')' : ''),
          html: '<div class="s-sign s-signtt">' + (i === 0 && first ? signBand(p) + '<div class="sg-when">' + kindWhen(p) + '</div>'
              : '<div class="sg-shead"><div class="badges">' + badgesHtml([p.line]).replace(/class="badge num"/g, 'class="badge sm num"') + '</div><div class="t"><h2 class="hd">' +
                (p.kind === 'new' ? 'מתי הקו נוסע' : 'לוח הזמנים החדש') + (i ? ' (המשך)' : '') + '</h2><p class="sub">' + E(odTxt(p) + ' · החל מ-' + LC.dmy(start(p))) + '</p></div></div><div class="seam"><i></i></div>') +
            ttKey(p).replace('tt-key', 'tt-key sg') +
            '<div class="tt-body f-' + o.f + ' v-' + o.v + '">' + h + '</div>' + (i === 0 && first ? contact : '') + signFoot(feed, false) + '</div>' });
      });
    }
    return out;
  }

  /* ---- סטטוס ---- */
  function kindStatus(p, pre) {
    var out = [], o = ttOpt();
    var top = function (sub, small) {
      return '<div class="st-top' + (small ? ' sm' : '') + '"><div class="badges">' + badgesHtml([p.line]) + '</div>' +
        '<h1 class="hd">' + E(p.kind === 'new' ? 'קו חדש' : p.kind === 'ended' ? (started(p) ? 'הקו לא נוסע יותר' : 'הקו מפסיק לפעול') : 'לוח זמנים חדש') + ' <span class="nw">' +
          E(p.kind === 'ended' ? (started(p) ? 'מ-' + LC.dm(start(p)) : 'אחרי ' + LC.dm(lastOf(p))) : 'מ-' + LC.dm(start(p))) + '</span></h1>' +
        '<p class="sub">' + E(sub) + '</p><div class="seam"><i></i></div></div>';
    };
    var foot = '<div class="st-foot"><p class="st-check">לפני הנסיעה בדקו: ' + (phoneOf(p.op) ? E(p.op) + ' <b class="ltr">' + E(phoneOf(p.op)) + '</b> · ' : '') + 'משרד התחבורה <b class="ltr">' + MOT + '</b></p>' +
      '<p class="st-note">לא פרסום רשמי · הוכן על ידי אדם פרטי' + (ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</p></div>';
    var sub = [odTxt(p), p.op].filter(Boolean).join(' · ');
    if (p.kind === 'new' || p.kind === 'ended') {
      var items = p.kind === 'new' ? kindItems(p).slice(1, 3) : [kindItems(p)[0]];
      if (p.kind === 'ended') { var al = altsOf(p).slice(0, 3); items.push(al.length ? 'במקום זה: ' + al.map(function (a) { return 'קו <b>' + E(a.line) + '</b> (' + E(LC.od(a.od) || a.od[0]) + ')'; }).join(', ') + '.' : 'לא מצאנו קו אחר שעוצר ברוב התחנות.'); }
      out.push({ id: 'st-' + p.id, label: pre + 'תמונה לסטטוס', map: routeMap(p),
        html: '<div class="s-status k-' + p.kind + '">' + top(sub) + '<div class="st-mapw"><div class="smap"></div></div>' +
          '<div class="st-what">' + (kTwo(p) && p.kind === 'new' ? kDirBlocks(p, 1) : '<ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>') + '</div>' + foot + '</div>' });
      if (zoomOn(p)) zoomGroups(p).forEach(function (g, i, gs) {
        out.push({ id: 'st-' + p.id + '-kz' + i, label: pre + 'סטטוס · מפה קרובה ' + g.name, map: zoomMap(p, g),
          html: '<div class="s-status k-' + p.kind + '">' + top(g.name + ' · ' + g.ix.length + ' תחנות' + (gs.length > 1 ? ' · ' + (i + 1) + '/' + gs.length : '')) +
            '<div class="st-mapw"><div class="smap"></div></div>' + foot + '</div>' });
      });
    }
    if (p.kind === 'timetable' || (p.kind === 'new' && o.v === 'det')) {
      var pages = ttPagesHtml(p, 'status');
      pages.forEach(function (h, i) {
        out.push({ id: 'st-' + p.id + '-tt' + i, label: pre + 'סטטוס · לוח הזמנים' + (pages.length > 1 ? ' (' + (i + 1) + '/' + pages.length + ')' : ''),
          html: '<div class="s-status s-sttt">' + top((ttDirs(p).length === 1 && p.kind === 'timetable' ? trip(ttDirs(p)[0]) : sub) + (pages.length > 1 ? ' · ' + (i + 1) + '/' + pages.length : ''), true) +
            ttKey(p).replace('tt-key', 'tt-key st') + '<div class="tt-body f-' + o.f + ' v-' + o.v + '">' + h + '</div>' + foot + '</div>' });
      });
    }
    return out;
  }

  /* ---- מפה של כל המסלול ---- */
  function zoomDraw(map, m, stops, fset, all, slideEl, inEl, opts, waits) {
    stops.forEach(function (s) { if (!fset[s.code]) L.circleMarker(s.ll, { radius: 4, color: '#55625c', weight: 2.2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map); });
    var msz = map.getSize(), boxes = [], pts = [];
    stops.forEach(function (s) {
      if (!fset[s.code]) return;
      var c = map.latLngToContainerPoint(s.ll);
      pts.push({ x: c.x, y: c.y, x0: c.x, y0: c.y, s: s });
    });
    // מפת ההתמצאות — בפינה שבה היא מסתירה הכי מעט (כמו במפות השינוי), או במקום שהמשתמש גרר אליו
    var INSET = null;
    if (inEl) {
      var w = 170, h = 128, best = null;
      [[14, 14], [msz.x - w - 14, 14], [14, msz.y - h - 44], [msz.x - w - 14, msz.y - h - 30]].forEach(function (c) {
        var r = [c[0] - 12, c[1] - 12, c[0] + w + 12, c[1] + h + 12];
        var n = pts.filter(function (p) { return p.x > r[0] && p.x < r[2] && p.y > r[1] && p.y < r[3]; }).length;
        if (!best || n < best.n) best = { n: n, x: c[0], y: c[1] };
      });
      var fx = parseFloat(inEl.getAttribute('data-fx')), fy = parseFloat(inEl.getAttribute('data-fy'));
      if (!isNaN(fx) && !isNaN(fy)) best = { x: Math.max(0, Math.min(msz.x - w, fx * msz.x / 100)), y: Math.max(0, Math.min(msz.y - h - 22, fy * msz.y / 100)) };
      inEl.style.left = best.x + 'px'; inEl.style.top = best.y + 'px'; inEl.style.width = w + 'px'; inEl.style.height = h + 'px';
      if (!inEl.classList.contains('inoff')) INSET = [best.x - 14, best.y - 14, best.x + w + 14, best.y + h + 14];
      var mini = L.map(inEl, Object.assign({}, opts, { attributionControl: false }));
      mini.fitBounds(all, { padding: [8, 8] });
      var t2 = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true });
      waits.push(tileWait(t2));
      t2.addTo(mini);
      m.dirs.forEach(function (d) { var S = m.kind === 'ended' ? d.old : d.new; if ((S.shape || []).length > 1) L.polyline(S.shape, { color: m.kind === 'ended' ? '#b8361f' : '#1f9152', weight: 2.5, interactive: false }).addTo(mini); });
      var view = map.getBounds();
      L.rectangle(view, { color: '#13201b', weight: 2, fillColor: '#f2c14e', fillOpacity: .35, interactive: false }).addTo(mini);
      L.circleMarker(view.getCenter(), { radius: 7, color: '#13201b', weight: 2.5, fillColor: '#f2c14e', fillOpacity: .9, interactive: false }).addTo(mini);
    }
    declutter(pts, msz.x, msz.y, INSET);
    if (INSET) boxes.push(INSET);
    pts.forEach(function (p) {
      var at = map.containerPointToLatLng([p.x, p.y]);
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 5) L.polyline([p.s.ll, at], { color: '#13201b', weight: 1.5, opacity: .8, interactive: false }).addTo(map);
      L.marker(at, { icon: L.divIcon({ className: '', html: '<div class="lc-mk ' + (m.kind === 'ended' ? 'rem' : 'add') + '">' + m.nums[p.s.code] + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(map);
      boxes.push([p.x - 13, p.y - 13, p.x + 13, p.y + 13]);
    });
    // שמות התחנות — איפה שיש מקום
    pts.forEach(function (p) {
      var w = String(p.s.name).length * 7 + 20, h = 24, g = 15, c = p;
      var pick = [
        { dir: 'top', off: [0, -g], b: [c.x - w / 2, c.y - g - h, c.x + w / 2, c.y - g] },
        { dir: 'bottom', off: [0, g], b: [c.x - w / 2, c.y + g, c.x + w / 2, c.y + g + h] },
        { dir: 'right', off: [g, 0], b: [c.x + g, c.y - h / 2, c.x + g + w, c.y + h / 2] },
        { dir: 'left', off: [-g, 0], b: [c.x - g - w, c.y - h / 2, c.x - g, c.y + h / 2] }
      ].filter(function (o) { return o.b[0] >= 2 && o.b[1] >= 2 && o.b[2] <= msz.x - 2 && o.b[3] <= msz.y - 2 && !boxes.some(function (q) { return o.b[0] < q[2] && o.b[2] > q[0] && o.b[1] < q[3] && o.b[3] > q[1]; }); })[0];
      if (!pick) return;
      boxes.push(pick.b);
      L.tooltip({ permanent: true, direction: pick.dir, offset: pick.off, className: 'lc-lbl', interactive: false }).setLatLng(map.containerPointToLatLng([p.x, p.y])).setContent(E(p.s.name)).addTo(map);
    });
    return { map: map, ready: Promise.all(waits) };
  }
  function drawRouteMap(slideEl, m) {
    var el = slideEl.querySelector('.smap'), inEl = slideEl.querySelector('.inset');
    if (inEl && !m.focus) { inEl.remove(); inEl = null; }
    var opts = { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false };
    var map = L.map(el, opts), waits = [];
    map.attributionControl.setPrefix(false);
    var ended = m.kind === 'ended', all = L.latLngBounds([]), seen = {}, stops = [];
    m.dirs.forEach(function (d) {
      var S = ended ? d.old : d.new;
      (S.shape || []).forEach(function (pt) { all.extend(pt); });
      S.stops.forEach(function (s) { all.extend(s.ll); if (!seen[s.code]) { seen[s.code] = 1; stops.push(s); } });
    });
    if (!all.isValid()) all = L.latLngBounds([[31.5, 34.8], [32.1, 35.2]]);
    // מפה קרובה: רק התחנות של האזור (וקטע המסלול ביניהן), עם מספרים כמו ברשימה
    var fset = {}, focusB = L.latLngBounds([]);
    (m.focus || []).forEach(function (c) { fset[c] = 1; });
    if (m.focus) stops.forEach(function (s) { if (fset[s.code]) focusB.extend(s.ll); });
    if (m.focus && focusB.isValid()) map.fitBounds(focusB, { padding: [60, 60], maxZoom: 17 });
    else map.fitBounds(all, { padding: [44, 44], maxZoom: 16 });
    var t = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true });
    waits.push(tileWait(t));
    t.addTo(map);
    m.dirs.forEach(function (d) {
      var S = ended ? d.old : d.new;
      if ((S.shape || []).length > 1) L.polyline(S.shape, ended ? { color: '#b8361f', weight: 5, dashArray: '10 8', opacity: 1, interactive: false } : { color: '#1f9152', weight: 6, opacity: .92, interactive: false }).addTo(map);
      else if (S.stops.length > 1) L.polyline(S.stops.map(function (s) { return s.ll; }), { color: ended ? '#b8361f' : '#1f9152', weight: 4, dashArray: ended ? '10 8' : null, opacity: .8, interactive: false }).addTo(map);
    });
    var altAt = {};
    (m.alts || []).forEach(function (a) { (altAt[a.code] = altAt[a.code] || []).push(a.line); });
    if (m.focus) return zoomDraw(map, m, stops, fset, all, slideEl, inEl, opts, waits);
    stops.forEach(function (s) {
      if (!altAt[s.code]) L.circleMarker(s.ll, { radius: 4, color: '#55625c', weight: 2.2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map);
    });
    // התחנה הראשונה והאחרונה עם שם; בשני כיוונים שונים — של כל כיוון, בסימן אחר לכל כיוון (תחנה משותפת — תווית אחת);
    // בקו מבוטל — גם התחנות שעוצרים בהן הקווים האחרים
    var labels = [], dd = m.dirs.slice(0, 2), two = dd.length > 1;
    dd.forEach(function (d, i) {
      var S = ended ? d.old.stops : d.new.stops, o = d.od || [], inter = o[0] && o[1] && o[0] !== o[1];
      if (!S.length) return;
      var add = function (s, t) { var same = labels.filter(function (x) { return x.s.code === s.code; })[0]; if (same) { same.t += ' · ' + t; same.ds[i] = 1; } else { var ds = {}; ds[i] = 1; labels.push({ s: s, t: t, k: 'end', ds: ds }); } };
      add(S[0], two ? 'יציאה ל' + (inter ? o[1] : endName(d, 1)) : 'תחילת הקו');
      if (S.length > 1) add(S[S.length - 1], two ? 'סוף הנסיעה מ' + (inter ? o[0] : endName(d, 0)) : 'סוף הקו');
    });
    // תחנות קרובות מאוד על המפה (למשל תחילת הכיוון הראשון וסוף השני, משני צדי הכביש) — סימן ותווית אחת
    for (var li = 0; li < labels.length; li++) for (var lj = labels.length - 1; lj > li; lj--) {
      if (map.latLngToContainerPoint(labels[li].s.ll).distanceTo(map.latLngToContainerPoint(labels[lj].s.ll)) < 28) { labels[li].t += ' · ' + labels[lj].t; Object.keys(labels[lj].ds || {}).forEach(function (k) { (labels[li].ds = labels[li].ds || {})[k] = 1; }); labels.splice(lj, 1); }
    }
    Object.keys(altAt).forEach(function (c) {
      var s = stops.filter(function (x) { return x.code === c; })[0], ls = altAt[c];
      var t = ls.length > 1 ? 'קווים ' + andList(ls, 4) + ' עוצרים כאן' : 'קו ' + ls[0] + ' עוצר כאן';
      var same = labels.filter(function (x) { return x.s.code === c; })[0];
      if (same) { same.t += ' · ' + t; same.k = 'alt'; } else if (s) labels.push({ s: s, t: t, k: 'alt' });
    });
    var msz = map.getSize(), boxes = [];
    labels.forEach(function (x) {
      L.marker(x.s.ll, { icon: L.divIcon({ className: '', html: '<div class="lc-mk ' + (x.k === 'alt' ? 'alt' : 'end' + (x.ds && x.ds[1] ? (x.ds[0] ? ' ab' : ' b') : '')) + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      var c = map.latLngToContainerPoint(x.s.ll), w = Math.max(String(x.s.name).length, x.t.length) * 7 + 22, h = 38, g = 13;
      var cand = [
        { dir: 'top', off: [0, -g], b: [c.x - w / 2, c.y - g - h, c.x + w / 2, c.y - g] },
        { dir: 'bottom', off: [0, g], b: [c.x - w / 2, c.y + g, c.x + w / 2, c.y + g + h] },
        { dir: 'right', off: [g, 0], b: [c.x + g, c.y - h / 2, c.x + g + w, c.y + h / 2] },
        { dir: 'left', off: [-g, 0], b: [c.x - g - w, c.y - h / 2, c.x - g, c.y + h / 2] }
      ].filter(function (o) { return o.b[0] >= 2 && o.b[1] >= 2 && o.b[2] <= msz.x - 2 && o.b[3] <= msz.y - 2; });
      var pick = cand.filter(function (o) { return !boxes.some(function (q) { return o.b[0] < q[2] && o.b[2] > q[0] && o.b[1] < q[3] && o.b[3] > q[1]; }); })[0];
      if (!pick) return;
      boxes.push(pick.b);
      L.tooltip({ permanent: true, direction: pick.dir, offset: pick.off, className: 'lc-lbl' + (x.k === 'alt' ? ' alt' : ''), interactive: false }).setLatLng(x.s.ll)
        .setContent(E(x.s.name) + '<small' + (x.k === 'alt' ? '' : ' class="cd"') + '>' + E(x.t) + '</small>').addTo(map);
    });
    return { map: map, ready: Promise.all(waits) };
  }

  /* ================= לו"ז עדכני (p.kind === 'current') =================
     לוח הזמנים הנוכחי של כל קו, גם בלי שינוי — להדפסה ולהפצה. קווים לאותו יעד (אותו זוג ערים, גם של חברות שונות) —
     בטבלה אחת ("משולב לפי יעד", ברירת המחדל), וליד כל שעה תגית קטנה בצבע של הקו; ED.ttc === 'sep' — כל קו לחוד.
     צבע התגית: כשבטבלה יש קווים של כמה חברות, או בעיצוב "צבעי המפעיל" — הצבע של החברה של הקו (cuTagCol).
     סימנים ליד השעה: אות (א, ב…) — נסיעה בחלופה אחרת של המסלול (d.v / d.da), ×2 — שני אוטובוסים באותה דקה.
     לכל כיוון: עמודה לכל קבוצת ימים (א׳–ה׳ · שישי · מוצאי שבת, או חלוקה דקה יותר כשהימים שונים מדי),
     ועמודה לתאריך חג בשבוע הקרוב — רק כשהשעות בו שונות מהיום הרגיל. נסיעה שיש רק בחלק מהימים — "ה׳ בלבד";
     אחרי חצות (עד 03:00) — בסוף הערב שלפני, "בלילה". מפורט = כל השעות; כללי = כמה נסיעות, ראשונה/אחרונה ותדירות. */
  var CU_COL = ['#0f766e', '#c2410c', '#6d28d9', '#1d4ed8', '#a16207', '#be185d', '#334155', '#15803d'];
  function isCur(p) { return !!(p && p.kind === 'current'); }
  function hm2(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function isoDow(iso) { return new Date(iso + 'T12:00:00').getDay(); }
  function durTxt(m) {
    if (!m) return '';
    m = Math.max(5, Math.round(m / 5) * 5);
    var h = Math.floor(m / 60), r = m % 60, rr = r ? ' ו-' + r + ' דק׳' : '';
    return h === 0 ? 'כ-' + r + ' דק׳' : h === 1 ? 'כשעה' + rr : h === 2 ? 'כשעתיים' + rr : 'כ-' + h + ' שעות' + rr;
  }
  function dShort(ix) { return daysShort(ix.map(function (i) { return DOWS[i]; })); }
  function linesTxt(ps) { var l = ps.map(function (p) { return p.line; }); return l.length === 1 ? 'קו ' + l[0] : 'קווים ' + andList(l, 8); }
  /* קבוצות: אותו זוג ערים (בינעירוני) — טבלה אחת, גם כשהקווים של חברות שונות */
  function cuGroups(pages) {
    var sep = ED.ttc === 'sep', out = [], by = {};
    pages.forEach(function (p) {
      var o = p.od || [], k = !sep && o[0] && o[1] && o[0] !== o[1] ? [o[0], o[1]].sort().join('|') : p.id;
      if (!by[k]) out.push(by[k] = { pages: [] });
      by[k].pages.push(p);
    });
    out.forEach(function (g) {
      var multi = g.pages.length > 1, byOp = ED.look === 'op' || opsOf(g.pages).length > 1, seen = {};
      g.pages.forEach(function (p, i) {
        var a = String(agOf(p)); seen[a] = (seen[a] || 0) + 1;
        p._c = !multi ? '' : byOp ? cuTagCol(a, seen[a] - 1) : CU_COL[i % CU_COL.length];
      });
      g.od = g.pages[0].od || [];
      g.sides = cuSides(g);
      cuVia(g);
    });
    return out;
  }
  function cuSides(g) {
    var A = g.od[0], B = g.od[1], P = g.pages, used = [];
    if (A && B && A !== B) {
      var mk = function (from, to, fb) {
        var items = [];
        P.forEach(function (p) {
          var ds = p.dirs.filter(function (d) { return d.od[0] === from && d.od[1] !== from && used.indexOf(d) < 0; });
          if (!ds.length) ds = p.dirs.filter(function (d) { return d.dir === fb && used.indexOf(d) < 0; });
          ds.forEach(function (d) { used.push(d); items.push({ p: p, d: d }); });
        });
        return { title: 'מ' + from + ' ל' + to, items: items };
      };
      return [mk(A, B, '1'), mk(B, A, '2')].filter(function (s) { return s.items.length; });
    }
    var out = [];
    P.forEach(function (p) {
      p.dirs.forEach(function (d) {
        var o = d.od || [];
        out.push({ title: o[0] && o[1] && o[0] !== o[1] ? 'מ' + o[0] + ' ל' + o[1] : p.dirs.length > 1 ? 'לכיוון ' + d.t : 'מסלול הקו',
          sub: d.f && d.t ? d.f + ' ← ' + d.t : '', items: [{ p: p, d: d }] });
      });
    });
    return out;
  }
  /* "דרך": הערים שרק בחלק מהקווים של הקבוצה עוברים בהן ("דרך תפרח"); קו בלי ערים כאלה — "ישיר" */
  function cuVia(g) {
    var P = g.pages, cs = P.map(function (p) { var o = {}; p.dirs.forEach(function (d) { (d.cs || []).forEach(function (c) { o[c] = 1; }); }); return o; });
    var ex = P.map(function (p, i) {
      var od = g.od;
      return Object.keys(cs[i]).filter(function (c) { return od.indexOf(c) < 0 && cs.some(function (o, j) { return j !== i && !o[c]; }); });
    });
    var any = P.length > 1 && ex.some(function (e) { return e.length; });
    P.forEach(function (p, i) {
      p._via = any ? (ex[i].length ? 'דרך ' + andList(ex[i], 2) : 'ישיר') : '';
      var du = p.dirs.map(function (d) { return d.du; }).filter(Boolean);
      p._du = du.length ? du.reduce(function (a, b) { return a + b; }, 0) / du.length : 0;
    });
  }
  /* היציאות של כמה קווים בכמה ימים — רשימה אחת; לכל יציאה: באילו ימים יש אותה, באיזו חלופה (a, 0 = הראשית)
     וכמה אוטובוסים יוצאים באותה דקה (n: כמה נסיעות באותה דקה, או התגבור מהרישוי — הגדול מהשניים).
     get(it, w) → [דקות, חלופות (מחרוזת, ספרה לכל יציאה) או 0, תגבורים [[מקום, כמה]] או 0] */
  function cuDay(it, w) { return [it.d.days[w], it.d.da ? it.d.da[w] : 0, it.d.dn ? it.d.dn[w] : 0]; }
  function cuMerge(items, days, get) {
    get = get || cuDay;
    var map = {}, ents = [];
    items.forEach(function (it, li) {
      days.forEach(function (w) {
        var cnt = {}, tb = {}, tbk = {}, g = get(it, w), al = g[1] || '';
        (g[2] || []).forEach(function (x) { tb[x[0]] = x[1]; });
        (g[0] || []).forEach(function (m, i) { var k = m + ':' + (+al.charAt(i) || 0); cnt[k] = (cnt[k] || 0) + 1; tbk[k] = Math.max(tbk[k] || 0, tb[i] || 0); });
        Object.keys(cnt).forEach(function (k) { cnt[k] = Math.max(cnt[k], tbk[k]); });
        Object.keys(cnt).forEach(function (mk) {
          var k = li + ':' + mk, e = map[k], ma = mk.split(':');
          if (!e) { e = map[k] = { m: +ma[0], a: +ma[1], p: it.p, li: li, n: 0, days: [] }; ents.push(e); }
          e.n = Math.max(e.n, cnt[mk]); e.days.push(w);
        });
      });
    });
    ents.forEach(function (e) { e.part = e.days.length < days.length; });
    ents.sort(function (a, b) { return a.m - b.m || a.li - b.li || a.a - b.a; });
    return { days: days, ents: ents };
  }
  var CU_STD = [[0, 1, 2, 3, 4], [5], [6]];
  function cuCols(side, hol) {
    var cols = [];
    CU_STD.forEach(function (grp) {
      var days = grp.filter(function (w) { return side.items.some(function (it) { return (it.d.days[w] || []).length; }); });
      if (!days.length) return;
      var c = cuMerge(side.items, days), part = c.ents.filter(function (e) { return e.part; }).length;
      // יותר מדי נסיעות שרק בחלק מהימים — עמודות נפרדות לימים עם לו"ז שונה
      if (days.length > 1 && part > Math.max(2, c.ents.length * 0.15)) {
        var sg = {}, order = [];
        days.forEach(function (w) {
          var k = side.items.map(function (it) { return (it.d.days[w] || []).join(',') + '/' + (it.d.da ? it.d.da[w] || '' : ''); }).join('|');
          if (!sg[k]) { sg[k] = []; order.push(k); }
          sg[k].push(w);
        });
        order.forEach(function (k) { cols.push(cuMerge(side.items, sg[k])); });
      } else cols.push(c);
    });
    (hol || []).forEach(function (h) {
      if (!side.items.some(function (it) { return it.d.x && it.d.x[h[0]]; })) return;
      var w = isoDow(h[0]);
      var c = cuMerge(side.items, [w], function (it) { return it.d.x && it.d.x[h[0]] ? [it.d.x[h[0]], (it.d.xa || {})[h[0]], (it.d.xn || {})[h[0]]] : cuDay(it, w); });
      c.hol = h; c.ents.forEach(function (e) { e.part = false; });
      if (c.ents.length || cols.length) cols.push(c);
    });
    cols.forEach(function (c) { c.label = cuLabel(c); });
    cuAlts(side, cols);
    return cols;
  }
  /* החלופות שמופיעות בצד הזה: אות לכל (קו, חלופה) — א, ב, ג… לפי הסדר; side.alts — למקרא */
  var ALT_LET = 'אבגדהוזחטיכלמנ';
  function cuAlts(side, cols) {
    var used = {}, list = [];
    cols.forEach(function (c) { c.ents.forEach(function (e) { if (e.a) { var k = e.li + ':' + e.a; if (!used[k]) list.push(used[k] = { li: e.li, a: e.a, ms: [] }); used[k].ms.push(e.m); } }); });
    list.sort(function (x, y) { return x.li - y.li || x.a - y.a; });
    list.forEach(function (x, i) { var it = side.items[x.li]; x.L = ALT_LET.charAt(i) || '*'; x.p = it.p; x.txt = (it.d.v || [])[x.a - 1] || 'במסלול אחר'; });
    cols.forEach(function (c) { c.ents.forEach(function (e) { e.al = e.a ? used[e.li + ':' + e.a].L : ''; }); });
    side.alts = list;
  }
  /* סימנים ליד השעה: אות החלופה, ו-×2 במצגת (עדין; בשלט ובסטטוס — .xn אחרי התגית) */
  function cuMarks(e, form) {
    return (e.al ? '<i class="al">' + e.al + '</i>' : '') + (e.n > 1 && form === 'deck' ? '<sup class="x2">×' + e.n + '</sup>' : '');
  }
  /* מקרא לסימנים: רק מה שמופיע ברשימה ents. multi — יש כמה קווים (אז גם מספר הקו ליד החלופה) */
  function cuKey(side, ents, multi) {
    var has = {}, dbl = false;
    ents.forEach(function (e) { if (e.al) has[e.al] = 1; if (e.n > 1) dbl = true; });
    var its = (side.alts || []).filter(function (x) { return has[x.L]; }).map(function (x) {
      return '<span><i class="al">' + x.L + '</i>' + E((multi ? 'קו ' + x.p.line + ' ' : '') + x.txt) + '</span>';
    });
    if (dbl) its.push('<span><b class="num" dir="ltr">×2</b> שני אוטובוסים באותה שעה (תגבור)</span>');
    return its.length ? '<p class="cu-key">' + its.join('') + '</p>' : '';
  }
  /* כללי: "חלק מהנסיעות דרך X (בשעות …)" */
  function cuAltLines(side, multi) {
    return (side.alts || []).map(function (x) {
      var ms = x.ms.filter(function (m, i, a) { return a.indexOf(m) === i; }).sort(function (a, b) { return a - b; });
      var when = ms.length === 1 ? 'בשעה ' + hm2(ms[0]) : ms.length <= 3 ? 'בשעות ' + andList(ms.map(hm2), 3) : 'בשעות ' + hm2(ms[0]) + '–' + hm2(ms[ms.length - 1]);
      return '<li>' + E((multi ? 'קו ' + x.p.line + ': ' : '') + 'חלק מהנסיעות ' + x.txt + ' (' + when + ')') + '</li>';
    }).join('');
  }
  function cuLabel(c) {
    if (c.hol) return c.hol[2];
    var k = c.days.join(',');
    if (k === '0,1,2,3,4') return 'א׳–ה׳';
    if (k === '5') return 'שישי';
    if (k === '6') return c.ents.every(function (e) { return e.m >= 16 * 60; }) ? 'מוצאי שבת' : 'שבת';
    return c.days.length === 1 ? 'יום ' + dShort(c.days) : dShort(c.days);
  }
  function cuSub(c) { return c.hol ? LC.wd(c.hol[0]) + ' ' + LC.dm(c.hol[0]) : ''; }
  function cuNote(e, c) {
    if (e.part) {
      var miss = c.days.filter(function (w) { return e.days.indexOf(w) < 0; });
      if (e.days.length <= miss.length) return dShort(e.days) + ' בלבד';
      return 'חוץ מ' + (miss.length === 1 ? 'יום ' + dShort(miss) : 'ימים ' + dShort(miss));
    }
    return '';
  }
  /* צבע התגית של קו לפי החברה: הקו הראשון של החברה — הצבע העיקרי שלה, השני — המשני (או גוון כהה יותר).
     צבע בהיר מדי (צהוב, ירוק בהיר) — מוכהה עד שהטקסט הלבן קריא */
  function cuTagCol(ag, k) {
    var cs = COLORS[ag] || [PALETTE[(parseInt(ag, 10) || 0) % PALETTE.length]], base = cs[k % cs.length], f = 1;
    if (k >= cs.length) base = shade(base, Math.pow(0.72, Math.floor(k / cs.length)));
    var c = base;
    while (contrast(c, '#ffffff') < 4 && f > 0.3) { f -= 0.06; c = shade(base, f); }
    return c;
  }
  /* הסגנון של שקף לו"ז ב"צבעי המפעיל": הצבעים של החברה של הקבוצה (ולא של הקו הראשון במצגת) */
  function cuStyle(g) { return ED.look === 'op' ? ' style="' + lookVars('op', g.pages) + '"' : ''; }
  function cuLb(p) { return p._c ? '<span class="lb num" style="background:' + p._c + '">' + E(p.line) + '</span>' : ''; }
  /* שורה ברשימה: שעה · תגית הקו · ×2 (רק בשלט ובסטטוס) · הערה ("ה׳ בלבד", "בלילה") */
  function cuRow(e, c, form) {
    var nt = cuNote(e, c), night = e.m >= 1440;
    return '<li' + (nt || night ? ' class="hn"' : '') + '><span class="tm num">' + hm2(e.m) + cuMarks(e, form) + '</span>' + cuLb(e.p) +
      (e.n > 1 && form !== 'deck' ? '<small class="xn num">×' + e.n + '</small>' : '') +
      (nt || night ? '<small class="nt">' + E([nt, night ? 'בלילה' : ''].filter(Boolean).join(' · ')) + '</small>' : '') + '</li>';
  }
  /* תצוגה לפי שעה (קו תדיר): "07 | 05 15 25 …" — הדקות בצבע של הקו */
  function cuHourRows(c, perLine, lineH) {
    var by = [], cur = null;
    c.ents.forEach(function (e) {
      var h = Math.floor(e.m / 60);
      if (!cur || cur.h !== h) by.push(cur = { h: h, es: [] });
      cur.es.push(e);
    });
    var out = by.map(function (r) {
      return { h: Math.ceil(r.es.length / perLine) * lineH + 6, hour: true, es: r.es,
        html: '<li class="hr"><b class="num">' + String(r.h % 24).padStart(2, '0') + '</b><span class="ms">' + r.es.map(function (e) {
          return '<span class="num" dir="ltr"' + (e.p._c ? ' style="color:' + e.p._c + '"' : '') + '>' + String(e.m % 60).padStart(2, '0') + (e.part ? '*' : '') + cuMarks(e, 'deck') + '</span>';
        }).join(' ') + '</span></li>' };
    });
    if (c.ents.some(function (e) { return e.part; })) out.push({ h: lineH + 6, hour: true, html: '<li class="hn"><small class="nt">* רק בחלק מהימים</small></li>' });
    return out;
  }
  var CUM = {
    sign: { slots: 7, Hc: 820, rowH: 27, noteH: 13, perLine: 9, lineH: 21, twoSides: true },
    status: { slots: 3, Hc: 1260, rowH: 58, noteH: 26, perLine: 10, lineH: 44, twoSides: false }
  };
  /* עמודות פיזיות: עמודה ארוכה מתפצלת להמשך; עמודה ארוכה מאוד (קו תדיר) — לפי שעה, ברוחב של שתי עמודות */
  function cuChunks(side, cols, M, form) {
    // המקרא לסימנים (חלופות, ×2) תופס גובה מעל העמודות
    var out = [], nk = (side.alts || []).length + (cols.some(function (c) { return c.ents.some(function (e) { return e.n > 1; }); }) ? 1 : 0);
    var Hc = M.Hc - (nk ? Math.ceil(nk / (form === 'status' ? 2 : 3)) * (form === 'status' ? 36 : 18) + 6 : 0);
    cols.forEach(function (c) {
      var rows = c.ents.map(function (e) { var nt = e.part || e.m >= 1440; return { h: M.rowH + (nt ? M.noteH : 0), e: e }; });
      var tot = rows.reduce(function (t, r) { return t + r.h; }, 0), w = 1;
      if (tot > Hc * 2.2) { rows = cuHourRows(c, M.perLine, M.lineH); w = 2; }
      var cur = null, used = 0, part = 0;
      rows.forEach(function (r) {
        if (!cur || used + r.h > Hc) { out.push(cur = { c: c, w: w, rows: [], ents: [], cont: part++ > 0 }); used = 0; }
        cur.rows.push(r.hour ? r.html : cuRow(r.e, c, form)); used += r.h;
        if (r.es) cur.ents = cur.ents.concat(r.es); else if (r.e) cur.ents.push(r.e);
      });
      if (!rows.length) out.push({ c: c, w: 1, rows: ['<li class="none">אין נסיעות</li>'], cont: false });
    });
    return out;
  }
  function cuSideHtml(side, chunks, cont) {
    var slots = chunks.reduce(function (t, k) { return t + k.w; }, 0), ents = [];
    chunks.forEach(function (k) { ents = ents.concat(k.ents || []); });
    return '<section class="cu-side"><h2 class="cu-sh hd">' + E(side.title) + (cont ? ' (המשך)' : '') + '</h2>' +
      (side.sub ? '<p class="cu-ss">' + E(side.sub) + '</p>' : '') + cuKey(side, ents, side.items.length > 1 && side.items.some(function (it) { return it.p !== side.items[0].p; })) +
      '<div class="cu-cols' + (chunks.some(function (k) { return k.c.hol; }) ? ' hashol' : '') + '" style="grid-template-columns:repeat(' + slots + ',minmax(0,1fr))">' + chunks.map(function (k) {
        return '<div class="cu-col' + (k.w > 1 ? ' hrs' : '') + '" style="grid-column:span ' + k.w + '"><h3 class="cu-ch">' + E(k.c.label) + (k.cont ? ' (המשך)' : '') +
          (cuSub(k.c) ? '<small>' + E(cuSub(k.c)) + '</small>' : '') + '</h3><ol class="ttc">' + k.rows.join('') + '</ol></div>';
      }).join('') + '</div></section>';
  }
  function cuLegend(g) {
    if (g.pages.length < 2) return '';
    var many = opsOf(g.pages).length > 1;
    return '<div class="cu-leg">' + g.pages.map(function (p) {
      return '<span>' + cuLb(p) + E([many ? p.op : '', p._via, durTxt(p._du)].filter(Boolean).join(' · ')) + '</span>';
    }).join('') + '</div>';
  }
  function cuTitle(g) {
    var o = g.od;
    return o[0] && o[1] && o[0] !== o[1] ? o[0] + ' ↔ ' + o[1] : 'קו ' + g.pages[0].line + (o[0] ? ' · ' + o[0] : '');
  }
  function cuValid(g) { var v = g.pages.map(function (p) { return p.valid || p.eff; }).filter(Boolean).sort()[0]; return v ? 'בתוקף מ-' + LC.dmy(v) : ''; }
  function cuHead(g, big) {
    var ops = opsOf(g.pages);
    return '<div class="cu-head"><div class="t">' + (g.pages.length === 1 ? '<span class="badge sm num">' + E(g.pages[0].line) + '</span>' : '') +
      '<div><h1 class="hd">' + E(cuTitle(g)) + '</h1><p class="sub">' + E(['לוח זמנים', g.pages.length > 1 ? linesTxt(g.pages) : '', ops.join(', '), cuValid(g)].filter(Boolean).join(' · ')) + '</p></div></div>' +
      cuLegend(g) + '</div>';
  }
  function cuFoot(form) {
    return '<div class="cu-foot"><span>השעות הן שעות היציאה מהתחנה הראשונה · "בלילה" = אחרי חצות של אותו לילה · לפי נתוני משרד התחבורה · לא פרסום רשמי' +
      (ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>';
  }
  /* ---- כללי: לכל קבוצת ימים — כמה נסיעות, הראשונה והאחרונה, ותדירות בכל חלק של היום ---- */
  var BANDS = [[180, 540, 'בוקר', '6–9'], [540, 900, 'צהריים', '9–15'], [900, 1140, 'אחה״צ', '15–19'], [1140, 1440, 'ערב', '19–24'], [1440, 1620, 'לילה', 'אחרי 24']];
  function bandTxt(ms) {
    if (!ms.length) return '—';
    if (ms.length < 4) return ms.length === 1 ? 'נסיעה אחת' : ms.length + ' נסיעות';
    var g = []; for (var i = 1; i < ms.length; i++) g.push(ms[i] - ms[i - 1]);
    g.sort(function (a, b) { return a - b; });
    var md = g[Math.floor(g.length / 2)];
    return 'כל ' + (md >= 55 && md <= 65 ? 'שעה' : md >= 25 && md <= 35 && md !== 30 ? '~30 דק׳' : Math.max(1, Math.round(md / 5) * 5 || md) + ' דק׳');
  }
  function cuGenTable(side, cols, g) {
    var night = cols.some(function (c) { return c.ents.some(function (e) { return e.m >= 1440; }); });
    var bands = BANDS.filter(function (b) { return b[0] < 1440 || night; });
    var head = '<tr><th>ימים</th><th>נסיעות</th><th>הראשונה</th><th>האחרונה</th>' + bands.map(function (b) { return '<th>' + b[2] + '<small>' + b[3] + '</small></th>'; }).join('') + '</tr>';
    var rows = cols.map(function (c) {
      var ms = c.ents.map(function (e) { return e.m; }), uniq = ms.filter(function (m, i) { return ms.indexOf(m) === i; });
      var per = g.pages.length > 1 ? '<small>' + g.pages.map(function (p) { var n = c.ents.filter(function (e) { return e.p === p && !e.part; }).reduce(function (t, e) { return t + e.n; }, 0); return n ? '<span class="pl">' + cuLb(p) + '<span class="num">' + n + '</span></span>' : ''; }).filter(Boolean).join('') + '</small>' : '';
      var full = c.ents.filter(function (e) { return !e.part; }).reduce(function (t, e) { return t + e.n; }, 0);
      return '<tr><th>' + E(c.label) + (cuSub(c) ? '<small>' + E(cuSub(c)) + '</small>' : '') + '</th><td class="n"><b class="num">' + (full || c.ents.length) + '</b>' + per + '</td>' +
        '<td class="num">' + (ms.length ? hm2(ms[0]) : '—') + '</td><td class="num">' + (ms.length ? hm2(ms[ms.length - 1]) : '—') + '</td>' +
        bands.map(function (b) { return '<td>' + bandTxt(uniq.filter(function (m) { return m >= b[0] && m < b[1]; })) + '</td>'; }).join('') + '</tr>';
    });
    var al = cuAltLines(side, g.pages.length > 1);
    // תגבור (כמה אוטובוסים באותה שעה) נספר בעמודת הנסיעות
    if (cols.some(function (c) { return c.ents.some(function (e) { return e.n > 1; }); })) al += '<li>מספר הנסיעות כולל תגבורים (כמה אוטובוסים שיוצאים באותה שעה)</li>';
    return '<section class="cu-side"><h2 class="cu-sh hd">' + E(side.title) + '</h2><table class="cu-gt"><thead>' + head + '</thead><tbody>' + rows.join('') + '</tbody></table>' +
      (al ? '<ul class="cu-alts">' + al + '</ul>' : '') + '</section>';
  }
  /* שלט (A4) ותמונה לסטטוס: כמה שפחות עמודים */
  function cuPaged(pages, form, hol) {
    var out = [], M = CUM[form], o = ttOpt();
    cuGroups(pages).forEach(function (g, gi) {
      var lbl = cuTitle(g), pre = 'לו״ז · ' + (g.pages.length === 1 && lbl.indexOf('קו ') !== 0 ? 'קו ' + g.pages[0].line + ' · ' : '') + lbl, sides = g.sides.map(function (s) { return { s: s, cols: cuCols(s, hol) }; }).filter(function (x) { return x.cols.length; });
      var wrap = function (body, i, n) {
        return { id: (form === 'sign' ? 'sg-' : 'st-') + 'cu' + gi + '-' + i, label: pre + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
          html: '<div class="s-cur f-' + form + ' v-' + o.v + '"' + cuStyle(g) + '>' + cuHead(g) + '<div class="cu-body">' + body + '</div>' + cuFoot(form) + '</div>' };
      };
      var bodies = [];
      if (o.v === 'gen') {
        if (form === 'status') sides.forEach(function (x) { bodies.push(cuGenTable(x.s, x.cols, g)); });
        else bodies.push(sides.map(function (x) { return cuGenTable(x.s, x.cols, g); }).join(''));
      } else {
        var cur = [], used = 0;
        var flush = function () { if (cur.length) bodies.push('<div class="cu-sides" style="grid-template-columns:' + cur.map(function (x) { return x.w + 'fr'; }).join(' ') + '">' + cur.map(function (x) { return x.html; }).join('') + '</div>'); cur = []; used = 0; };
        sides.forEach(function (x) {
          var ch = cuChunks(x.s, x.cols, M, form), w = ch.reduce(function (t, k) { return t + k.w; }, 0);
          if (w <= M.slots) {
            if (!M.twoSides || used + w > M.slots) flush();
            cur.push({ w: w, html: cuSideHtml(x.s, ch, false) }); used += w;
            if (!M.twoSides) flush();
            return;
          }
          flush();
          var run = [], rw = 0, k = 0;
          ch.forEach(function (c) {
            if (rw + c.w > M.slots) { bodies.push(cuSideHtml(x.s, run, k++ > 0)); run = []; rw = 0; }
            run.push(c); rw += c.w;
          });
          if (run.length) bodies.push(cuSideHtml(x.s, run, k > 0));
        });
        flush();
      }
      bodies.forEach(function (b, i) { out.push(wrap(b, i, bodies.length)); });
    });
    return out;
  }
  /* מצגת: שקף לכל כיוון ולכל קבוצת ימים; השעות זורמות בעמודות (מעט שעות — גדול, הרבה — קטן יותר) */
  function cuDeck(pages, hol) {
    var out = [], o = ttOpt();
    cuGroups(pages).forEach(function (g, gi) {
      // החברה: בקו אחד — בשורת המשנה; בכמה קווים של כמה חברות — במקרא, ליד כל קו
      var lt = g.pages.length > 1 ? linesTxt(g.pages) + ' · ' + (opsOf(g.pages).length === 1 ? g.pages[0].op + ' · ' : '') : g.pages[0].op ? g.pages[0].op + ' · ' : '';
      g.sides.forEach(function (s, si) {
        var cols = cuCols(s, hol);
        if (!cols.length) return;
        var head = function (sub) {
          return '<div class="cu-head"><div class="t">' + (g.pages.length === 1 ? '<span class="badge sm num">' + E(g.pages[0].line) + '</span>' : '') +
            '<div><h1 class="hd">' + E(s.title) + '</h1><p class="sub">' + E(sub) + '</p></div></div>' + cuLegend(g) + '</div>';
        };
        var foot = '<div class="sfoot"><span>שעות היציאה מהתחנה הראשונה · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div>';
        if (o.v === 'gen') {
          out.push({ id: 'cu' + gi + '-' + si, label: 'לו״ז · ' + s.title,
            html: '<div class="s-cur f-deck v-gen"' + cuStyle(g) + '>' + head(lt + 'לוח זמנים עדכני · ' + cuValid(g)) + '<div class="cu-body">' + cuGenTable({ title: '', alts: s.alts }, cols, g).replace('<h2 class="cu-sh hd"></h2>', '') + '</div>' + foot + '</div>' });
          return;
        }
        cols.forEach(function (c, ci) {
          // עם מקרא לסימנים (חלופה, ×2) — שורה אחת פחות בכל עמודה
          var n = c.ents.length, ky = (c.ents.some(function (e) { return e.al || e.n > 1; }) ? 1 : 0) + (g.pages.length > 2 ? 1 : 0), parts = [];
          var L = n <= 21 - 3 * ky ? [3, 7 - ky, 1] : n <= 32 - 4 * ky ? [4, 8 - ky, 2] : n <= 50 - 5 * ky ? [5, 10 - ky, 3] : null;
          if (L) { for (var i = 0; i < Math.max(1, n); i += L[0] * L[1]) parts.push(c.ents.slice(i, i + L[0] * L[1])); }
          var dayTxt = (c.hol ? c.label + ' · ' + cuSub(c) : (c.days.length > 1 ? 'ימים ' : '') + c.label);
          if (!L) {   // קו תדיר: לפי שעה, בשתי עמודות
            var rows = cuHourRows(c, 11, 30), H = 500, pg = [[]], used = 0;
            rows.forEach(function (r) { var cur = pg[pg.length - 1]; if (used + r.h > H * 2 && cur.length) { pg.push(cur = []); used = 0; } cur.push(r); used += r.h; });
            pg.forEach(function (rs, k) {
              out.push({ id: 'cu' + gi + '-' + si + '-' + ci + (k ? '-' + k : ''), label: 'לו״ז · ' + s.title + ' · ' + c.label + (pg.length > 1 ? ' (' + (k + 1) + ')' : ''),
                html: '<div class="s-cur f-deck v-det"' + cuStyle(g) + '>' + head(lt + dayTxt + ' · לוח זמנים עדכני · ' + cuValid(g) + (k ? ' (המשך)' : '')) +
                  cuKey(s, [].concat.apply([], rs.map(function (r) { return r.es || []; })), g.pages.length > 1) +
                  '<ol class="ttc cu-hrs">' + rs.map(function (r) { return r.html; }).join('') + '</ol>' + foot + '</div>' });
            });
            return;
          }
          parts.forEach(function (es, k) {
            out.push({ id: 'cu' + gi + '-' + si + '-' + ci + (k ? '-' + k : ''), label: 'לו״ז · ' + s.title + ' · ' + c.label + (parts.length > 1 ? ' (' + (k + 1) + ')' : ''),
              html: '<div class="s-cur f-deck v-det"' + cuStyle(g) + '>' + head(lt + dayTxt + ' · לוח זמנים עדכני · ' + cuValid(g) + (k ? ' (המשך)' : '')) +
                cuKey(s, es, g.pages.length > 1) + '<ol class="ttc cu-grid sz' + L[2] + '" style="grid-template-rows:repeat(' + L[1] + ',minmax(0,1fr))">' +
                (es.length ? es.map(function (e) { return cuRow(e, c, 'deck'); }).join('') : '<li class="none">אין נסיעות</li>') + '</ol>' + foot + '</div>' });
          });
        });
      });
    });
    return out;
  }
  function curBuild(pages, feed) {
    var hol = ED.hol || [];
    if (ED.ttc === 'board') {
      var bs = bdSlides(pages, ED.form === 'sign' || ED.form === 'status' ? ED.form : 'deck');
      if (ED.form !== 'sign' && ED.form !== 'status') bs.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(bs.pages || pages, feed) });
      return bs;
    }
    if (ED.form === 'sign') return cuPaged(pages, 'sign', hol);
    if (ED.form === 'status') return cuPaged(pages, 'status', hol);
    var s = cuDeck(pages, hol);
    s.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(pages, feed) });
    return s;
  }

  /* ================= לו"ז עדכני — "טבלה לפי יעד" (ED.ttc === 'board'), כמו לוח מודעות של שכונה =================
     פס צבעוני לכל יעד (אותו זוג ערים, גם של חברות שונות; קווים עירוניים — "הקווים העירוניים · <עיר>"),
     שורה לכל קו וכיוון עם המוצא (והתחנה הראשונה), עמודות א׳–ה׳ · שישי · מוצ״ש, ובתא — כל שעות היציאה.
     נסיעה בחלופה אחרת — באדום, ומתחת לשעות הערה "<שעות> — <הדרך>". ×2 — תגבור. נסיעה שרק בחלק מהימים — ה׳ קטן ליד השעה.
     הכותרת (ED.btitle) וההערות (ED.bnote) — מהמשתמש. העמודים נחתכים לפי מדידה של הגובה האמיתי בדף.
     boardModel — אותו מבנה, גם לייצוא לאקסל */
  var BD_COLS = [[0, 1, 2, 3, 4], [5], [6]];
  function bdPhone(op) { return phoneOf(op); }
  function bdNum(l) { return (parseInt(l, 10) || 0) * 10 + (String(l).replace(/^\d+/, '') ? 1 : 0); }
  function bdHome(pages) {
    var cnt = {};
    pages.forEach(function (p) { var o = p.od || []; [o[0], o[1]].forEach(function (c) { if (c) cnt[c] = (cnt[c] || 0) + 1; });
      p.dirs.forEach(function (d) { (d.cs || []).forEach(function (c) { cnt[c] = (cnt[c] || 0) + 0.5; }); }); });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
  }
  /* עריכה בלוח (ED.bd): t — טקסט שהמשתמש שינה, לפי מפתח (data-bk); "" — נמחק. offR — שורות (קו+כיוון) שהוסרו,
     offL — קווים שהוסרו (לפי מק"ט). הכול חל גם על השלט, המצגת, הסטטוס והאקסל — כי כולם נבנים מ-bdModel */
  function bdT(k, dflt) { var t = ED.bd && ED.bd.t; return t && Object.prototype.hasOwnProperty.call(t, k) && t[k] != null ? t[k] : dflt; }
  function bdOff(kind, k) { var o = ED.bd && ED.bd[kind]; return !!(o && o[k]); }
  function bdK(k, cls, ph) { return ' class="bdt' + (cls ? ' ' + cls : '') + '" data-bk="' + E(k) + '"' + (ph ? ' data-ph="' + E(ph) + '"' : ''); }
  /* שורה שהמשתמש הוסיף (ED.bd.nr — [{id, after}]): קו, מוצא ותאים ריקים לכתיבה, באותו פס, מתחת לשורה after */
  function bdNewRow(id) {
    var k = 'n' + id, p = { makat: k, line: '', op: '' };
    return { p: p, d: null, add: true, key: k, first: true, n: 1, line: bdT('ln:' + k, ''), op: bdT('op:' + k, ''), color: '#3d4a45',
      origin: bdT(k + '|o', ''), stop: bdT(k + '|s', ''), toward: bdT(k + '|w', ''), until: '', comment: '' };
  }
  function bdWithNew(rows) {
    var nr = (ED.bd && ED.bd.nr) || [], out = [];
    var put = function (r) { out.push(r); nr.forEach(function (x) { if (x.after === r.key) put(bdNewRow(x.id)); }); };
    rows.forEach(put);
    return out;
  }
  function bdQ(s) { return String(s || '').replace(/''/g, '"'); }   // כפר חב''ד (ב-GTFS) → כפר חב"ד
  /* לוח של מקום (ED.bpl — {k: 'c' עיר | 'h' שכונה | 's' רחוב, c: העיר, s: קודי התחנות במקום}): רק כיוונים וחלופות שעוצרים בו.
     a — 0 לחלופה הראשית של הכיוון, 1… לחלופות (לפי d.v). בעיר — לפי רשימת הערים (cs / vc); בשכונה וברחוב — לפי קודי התחנות
     (sc / vs, מהבנייה הלילית). כשאין את הנתונים האלה (קובץ ישן) — הכול מוצג, כמו קודם */
  function bdServes(d, a, p) {
    var pl = ED.bpl; if (!pl || (p && pl.m && pl.m.indexOf(p.makat) < 0)) return true;   // קו שנוסף ביד, לא מהמקום — כולו
    var hit = function (cs, st) {
      if (pl.k === 'c') return cs ? cs.map(bdQ).indexOf(bdQ(pl.c)) >= 0 : true;
      if (!st || !pl.s) return true;
      var o = {}; pl.s.forEach(function (c) { o[String(c)] = 1; });
      return st.some(function (c) { return o[String(c)]; });
    };
    if (!a) return hit(d.cs, d.sc);
    return hit(d.vc ? d.vc[a - 1] : null, d.vs ? d.vs[a - 1] : null);
  }
  /* פיצול ימי חול: מכל החלוקות של א׳–ה׳ לרצפים (עד 3 עמודות) — זו שבה הכי מעט סימוני ימים ליד שעות ("ה׳", "חוץ מה׳"),
     כשכל עמודה נוספת "עולה" כמו סימון וחצי ועוד BD_SPLIT_COST לכל שורה (כדי שלא יתפצל בגלל נסיעה אחת). בלי סיבה טובה — עמודה אחת.
     שורה שבה כל ימי החול זהים — תא אחד על פני כל העמודות, כך שהיא לא "משלמת" על הפיצול */
  var BD_SPLIT_COST = 0.05;
  function bdWkSplit(rows) {
    var cands = [[[0, 1, 2, 3, 4]]];
    for (var a = 1; a < 5; a++) {
      cands.push([[0, 1, 2, 3, 4].slice(0, a), [0, 1, 2, 3, 4].slice(a)]);
      for (var b = a + 1; b < 5; b++) cands.push([[0, 1, 2, 3, 4].slice(0, a), [0, 1, 2, 3, 4].slice(a, b), [0, 1, 2, 3, 4].slice(b)]);
    }
    var marks = function (g) {   // כמה שעות בשורות מסומנות כ"רק בחלק מהימים" בקבוצה g; שורה שכל הימים בה זהים — אפס
      var n = 0;
      rows.forEach(function (r) {
        var sig0 = bdDaySig(r.d, g[0]);
        if (g.every(function (w) { return bdDaySig(r.d, w) === sig0; })) return;
        var cnt = {};
        g.forEach(function (w) { var seen = {}; (r.d.days[w] || []).forEach(function (m) { if (!seen[m]) { seen[m] = 1; cnt[m] = (cnt[m] || 0) + 1; } }); });
        Object.keys(cnt).forEach(function (m) { if (cnt[m] < g.length) n++; });
        if (r.d.mk) g.forEach(function (w) { n += (r.d.mk[w] || []).filter(function (x) { return x[1]; }).length / g.length; });
      });
      return n;
    };
    var best = null;
    cands.forEach(function (c) {
      var sc = c.reduce(function (t, g) { return t + marks(g); }, 0) + (c.length - 1) * (1.5 + BD_SPLIT_COST * rows.length);
      if (!best || sc < best.sc - 1e-9) best = { sc: sc, c: c };
    });
    return best.c;
  }
  /* מה שרואים ביום w בשורה (לפיצול ימי חול): היציאות, החלופות, התגבורים, וסימוני השינוי */
  function bdDaySig(d, w) {
    if (d.same && d.same[w]) return 's';
    return (d.days[w] || []).join(',') + '/' + (d.da ? d.da[w] || '' : '') + '/' + (d.dn ? JSON.stringify(d.dn[w] || '') : '') + '/' + (d.mk ? JSON.stringify(d.mk[w] || '') : '');
  }
  /* הכיוונים שמוצגים בלוח לקו: יש בהם נסיעות, ובלוח של מקום — החלופה הראשית שלהם עוצרת במקום */
  function bdDirs(p) { return p.dirs.filter(function (d) { return (d.days.some(function (x) { return x && x.length; }) || (d.same && d.same.some(Boolean))) && bdServes(d, 0, p); }); }
  function bdModel(pages, xo) {
    var ps = pages.slice().sort(function (a, b) { return bdNum(a.line) - bdNum(b.line) || (a.line < b.line ? -1 : 1); });
    // המוצא והיעד — מהכיוונים שמוצגים בשורות (העיר של התחנה הראשונה והאחרונה), לא מהשם של הקו ברשימת הקווים
    ps.forEach(function (p) {
      p._sd = bdDirs(p);
      p._E = [];
      p._sd.forEach(function (d) { (d.od || []).forEach(function (c) { c = bdQ(c); if (c && p._E.indexOf(c) < 0) p._E.push(c); }); });
    });
    ps = ps.filter(function (p) { return p._sd.length; });
    // הודעה על שינוי: כשהקווים משתנים בתאריכים שונים — התאריך ליד כל קו ("מ-29.11"), ולא אחד בכותרת
    var vset = {}; ps.forEach(function (p) { if (p.chg) vset[p.valid || p.eff] = 1; });
    BD_FROM = Object.keys(vset).length > 1;
    var home = bdQ(ED.bpl && ED.bpl.c ? ED.bpl.c : bdHome(ps));
    // קווים עירוניים: אותה עיר בשני הקצוות, או שני קצוות שהם ערים של קווים עירוניים (לוד–רמלה)
    var U = {};
    ps.forEach(function (p) { if (p._E.length === 1) U[p._E[0]] = 1; });
    var local = function (p) { return p._E.length === 1 || p._E.every(function (c) { return U[c]; }); };
    var par = {}, find = function (c) { while (par[c] && par[c] !== c) c = par[c]; return c; };
    ps.forEach(function (p) { if (!local(p)) return; p._E.forEach(function (c) { par[c] = par[c] || c; }); p._E.forEach(function (c) { par[find(c)] = find(p._E[0]); }); });
    var by = {}, inter = [], loc = [];
    ps.forEach(function (p) {
      var isL = local(p), k = isL ? 'L|' + find(p._E[0]) : 'I|' + p._E.slice().sort().join('|');
      if (!by[k]) { by[k] = { k: k, local: isL, pages: [], E: p._E }; (isL ? loc : inter).push(by[k]); }
      by[k].pages.push(p);
    });
    var bands = inter.concat(loc), ci = 0;
    bands.forEach(function (b) {
      if (b.local) {
        var cs = b.E.slice(); b.pages.forEach(function (p) { p._E.forEach(function (c) { if (cs.indexOf(c) < 0) cs.push(c); }); });
        cs.sort(function (x, y) { return (y === home) - (x === home); });
        b.label = (b.pages.length > 1 ? 'הקווים העירוניים · ' : 'קו עירוני · ') + cs.join(', ');
      } else {
        // הזוגות (מוצא, יעד) של השורות; כשלכל השורות אותם שני קצוות — "א – ב"; אחרת הקצה המשותף מול השאר ("קרית מלאכי / באר טוביה – נחם")
        var pairs = [];
        b.pages.forEach(function (p) { p._sd.forEach(function (d) { pairs.push((d.od || []).map(bdQ)); }); });
        var ends = b.E, shared = ends.filter(function (c) { return pairs.every(function (q) { return q.indexOf(c) >= 0; }); });
        var homeFirst = function (x, y) { return (y === home) - (x === home); };
        if (ends.length === 2) b.label = ends.slice().sort(homeFirst).join(' – ');
        else if (shared.length === 1) {
          var rest = ends.filter(function (c) { return c !== shared[0]; }).sort(homeFirst);
          b.label = rest.indexOf(home) >= 0 ? rest.join(' / ') + ' – ' + shared[0] : shared[0] + ' – ' + rest.join(' / ');
        } else b.label = ends.slice().sort(homeFirst).join(' / ');
        // "(דרך X)": רק כש-X לא אחד הקצוות, וכל השורות בפס עוצרות בו
        var via = home && ends.indexOf(home) < 0 && b.pages.every(function (p) { return p._sd.every(function (d) { return (d.cs || []).map(bdQ).indexOf(home) >= 0; }); });
        if (via) b.label += ' (דרך ' + home + ')';
      }
      b.label = bdT('band:' + b.k, b.label);
      var ags = opsOf(b.pages.map(function (p) { return { op: String(agOf(p)) }; }));
      b.color = ags.length === 1 && COLORS[ags[0]] ? cuTagCol(ags[0], 0) : CU_COL[ci++ % CU_COL.length];
      b.ops = opsOf(b.pages);
      b.rows = [];
      b.pages.forEach(function (p) {
        var ds = p._sd.slice();
        // הכיוון שיוצא מהעיר "שלנו" — ראשון
        ds.sort(function (x, y) { return (bdQ((y.od || [])[0]) === home) - (bdQ((x.od || [])[0]) === home) || (x.dir < y.dir ? -1 : 1); });
        ds.forEach(function (d, i) { b.rows.push(bdRow(p, d, i, ds.length, b)); });
      });
      b.rows = bdWithNew(b.rows);
      // שורות וקווים שהוסרו: נשארים ברשימה (כדי שאפשר יהיה להחזיר אותם במצב עריכה) עם off; פס שכל השורות בו הוסרו — off
      b.rows.forEach(function (r) { r.offL = bdOff('offL', r.p.makat); r.off = r.offL || bdOff('offR', r.key); });
      b.off = b.rows.every(function (r) { return r.off; });
    });
    var vis = function (r) { return !r.off; };
    // עמודות: א׳–ה׳ · שישי · מוצ״ש (רק מה שיש בו נסיעות); שבת שכולה בערב — "מוצאי שבת".
    // פיצול ימי חול (ED.bsplit, ברירת מחדל — אוטומטי): יום חול שבאחד הקווים יש בו לו"ז אחר משאר הימים — עמודה משלו
    // (ימים שבכל השורות אותו לו"ז — באותה עמודה; כך מספר העמודות הקטן ביותר), תחת כותרת משותפת "יום חול"
    var cols = [], wk = [[0, 1, 2, 3, 4]];
    if (ED.bsplit !== false) {
      var rowsV = []; bands.forEach(function (b) { b.rows.forEach(function (r) { if (vis(r) && !r.add) rowsV.push(r); }); });
      wk = bdWkSplit(rowsV);
    }
    var cgs = wk.concat([[5], [6]]);
    cgs.forEach(function (days, gi) {
      var any = false, eve = true;
      bands.forEach(function (b) { b.rows.filter(vis).forEach(function (r) { if (r.add) return; days.forEach(function (w) { var l = r.d.days[w] || []; if (l.length || (r.d.same && r.d.same[w])) any = true; if (r.d.same && r.d.same[w]) eve = false; l.forEach(function (m) { if (m < 16 * 60) eve = false; }); }); }); });
      if (!any) return;
      var isWk = days[0] < 5, split = isWk && wk.length > 1;
      cols.push({ days: days, wk: split, label: bdT('th:' + days.join(''), split ? (days.length === 1 ? 'יום ' + dShort(days) : dShort(days)) : isWk ? 'ימים ' + dShort(days) : days[0] === 5 ? 'יום שישי' : eve ? 'מוצאי שבת' : 'שבת') });
    });
    // ימים בעמודות של ימי חול שאין בהם נסיעות בכלל (למשל לוח בלי יום רביעי) — נכנסים לעמודה הסמוכה, כדי שלא יחסרו בכותרת
    var nWk = cols.filter(function (c) { return c.wk; }).length;
    if (nWk === 1) cols.forEach(function (c) { if (c.wk) { c.wk = false; c.label = bdT('th:' + c.days.join(''), 'ימים ' + dShort(c.days)); } });
    // לאקסל: עמודה לחג בשבוע הקרוב — רק כשהשעות בו שונות מהיום הרגיל באחד הקווים (כמו ב"משולב")
    if (xo && xo.hol) ((ED.hol && ED.hol.length ? ED.hol : (pages[0] || {}).hol) || []).forEach(function (h) {
      if (bands.some(function (b) { return b.rows.some(function (r) { return !r.off && r.d && r.d.x && r.d.x[h[0]]; }); }))
        cols.push({ days: [isoDow(h[0])], hol: h, label: h[2] + ' ' + LC.dm(h[0]) });
    });
    bands.forEach(function (b) { b.rows.forEach(function (r) {
      // שורה שבה כמה עמודות של ימי חול זהות — תא אחד על פני כולן
      var mcols = cols.map(function (c) { return c; });
      if (!r.add) for (var a = 0; a < cols.length; a++) {
        if (!cols[a].wk) continue;
        var z = a + 1;
        while (z < cols.length && cols[z].wk && cols[z].days.every(function (w) { return bdDaySig(r.d, w) === bdDaySig(r.d, cols[a].days[0]); })) z++;
        if (z - a > 1) { mcols[a] = { days: [].concat.apply([], cols.slice(a, z).map(function (c) { return c.days; })).sort(), label: cols[a].label, span: z - a }; for (var y = a + 1; y < z; y++) mcols[y] = { skip: true }; }
        a = z - 1;
      }
      r.cells = mcols.map(function (c, i) { if (c.skip) return { skip: true, ents: [], notes: [] }; var x = bdCellX(r, c, i); if (c.span) x.span = c.span; return x; });
    }); });
    function bdCellX(r, c, i) {
      return r.add ? { ents: [], notes: [], key: r.key + '|c' + i, nkey: r.key + '|n' + i, txt: bdT(r.key + '|c' + i, ''), ntxt: bdT(r.key + '|n' + i, null), ph: 'שעות' } : bdCell(r, c, i);
    }
    var valid = pages.map(function (p) { return p.valid || p.eff; }).filter(Boolean).sort()[0] || '';
    var unt = pages.map(function (p) { return p.until || ''; }), until = unt.every(function (u) { return u && u === unt[0]; }) ? unt[0] : '';
    // הקווים שנשארו בלוח (אחרי הסרות) — לשורת המשנה ולמוקדי המידע
    var vps = ps.filter(function (p) { return bands.some(function (b) { return b.rows.some(function (r) { return r.p === p && !r.off; }); }); });
    var ops = opsOf(vps), cities = [];
    if (home) cities.push(home);
    var chg = ps.some(function (p) { return p.chg; });
    var dflt = chg ? 'לוח הזמנים החדש · ' + linesTxt(ps) : 'זמני נסיעות · ' + (ED.bplace || (ps.length <= 3 ? linesTxt(ps) : cities.join(', ')) || linesTxt(ps));
    var alts = bands.some(function (b) { return b.rows.some(function (r) { return !r.off && r.cells.some(function (x) { return x.notes.length && x.ntxt == null && x.txt == null; }); }); });
    var sub = [BD_FROM ? 'בתוקף מהתאריך שליד כל קו' : valid ? 'בתוקף מ-' + LC.dmy(valid) + (until ? ' עד ' + LC.dmy(until) : '') : '', vps.length ? linesTxt(vps) : ''].filter(Boolean).join(' · ');
    var contacts = ops.map(function (o) { return [o, bdPhone(o)]; }).filter(function (x) { return x[1]; }).concat([['משרד התחבורה', MOT]])
      .map(function (c) { return [bdT('phn:' + c[0], c[0]), bdT('php:' + c[0], c[1]), c[0]]; }).filter(function (c) { return c[0] || c[1]; });
    return { title: bdT('title', (ED.btitle || '').trim() || dflt), dflt: dflt, valid: valid, until: until, sub: bdT('sub', sub), subDflt: sub, home: home, cols: cols, bands: bands, pages: vps.length ? vps : ps,
      // "עדכונים": מה שהמשתמש כתב; בלי טקסט — משפט על הנסיעות באדום, רק כשיש כאלה בלוח (אחרת השורה לא מופיעה); נמחק בלוח — לא מופיע
      note: bdT('note', (ED.bnote || '').trim() || (alts ? 'נסיעות באדום עוברות בדרך אחרת' : '')), contacts: contacts,
      feed: pages.map(function (p) { return p.feed; }).filter(Boolean).sort().pop() || '', credit: true, tord: ED.tord || 'ltr',
      // כל טקסט בלוח ניתן לעריכה: כותרות העמודות, "עדכונים", "מוקדי מידע", שורת ההסבר והקרדיט (את הקרדיט — רק לשנות, לא למחוק)
      th: { line: bdT('th:line', 'קו'), orig: bdT('th:orig', 'מוצא'), wk: bdT('th:wk', 'יום חול') }, lbl: { upd: bdT('lbl:upd', 'עדכונים'), ph: bdT('lbl:ph', 'מוקדי מידע'), cont: bdT('lbl:cont', '(המשך)'), off: bdT('lbl:off', 'אינו פעיל'), same: bdT('lbl:same', 'ללא שינוי') },
      legend: bdT('legend', null), creditTxt: bdT('credit', '') || BD_CR,
      // הודעה על שינוי: מקרא לסימונים (ירוק — חדש או שונה, אדום מחוק — בוטל), רק כשיש כאלה בלוח
      chg: chg, key: chg ? { nw: bdT('lbl:knw', 'חדש או שונה'), rm: bdT('lbl:krm', 'בוטל'), hasNw: bdHas(bands, 'nw'), hasRm: bdHas(bands, 'rm') } : null };
  }
  function bdHas(bands, k) { return bands.some(function (b) { return b.rows.some(function (r) { return !r.off && (r.cells || []).some(function (x) { return x.txt == null && (k === 'rm' ? (x.rm || []).length : x.ents.some(function (e) { return e.k || e.nwp; })); }); }); }); }
  var BD_FROM = false;
  var BD_CR = 'הוכן בכלי ״מצגת לשינוי בקו״ של הקו הבוחן · kavbochan.app';
  function bdRow(p, d, i, n, b) {
    var o = (d.od || []).map(bdQ), inter = !b.local && o[0] && o[1] && o[0] !== o[1], cs = (d.cs || []).map(bdQ);
    var to = inter ? o[1] : d.t, city0 = cs[0] || o[0] || '';
    var stop = d.f + (d.fc ? ' (' + d.fc + ')' : ''), k = p.makat + '.' + d.dir;
    return { p: p, d: d, key: k, first: i === 0, n: n, inter: inter, line: bdT('ln:' + p.makat, p.line), op: bdT('op:' + p.makat, p.op), color: bdOpCol(p),
      origin: bdT(k + '|o', inter ? 'מ' + o[0] : d.f),
      stop: bdT(k + '|s', inter ? stop : (d.fc ? 'תחנה ' + d.fc : '')),
      toward: bdT(k + '|w', to ? 'לכיוון ' + to : ''),
      from: p.chg && BD_FROM ? bdT('fr:' + p.makat, 'מ-' + LC.dm(p.valid)) : '',
      until: p.until || '', untilTxt: p.until ? bdT('un:' + p.makat, 'עד ' + LC.dm(p.until)) : '',
      comment: (to ? 'לכיוון ' + to + (cs.length && cs[cs.length - 1] !== to ? ', ' + cs[cs.length - 1] : '') + ': ' : '') +
        d.f + ' (' + [d.fc, city0].filter(Boolean).join(' | ') + ')' };
  }
  /* תא: היציאות של שורה אחת בקבוצת ימים; נסיעה שרק בחלק מהימים — part (למשל "ה׳"), חלופה — a, תגבור — n */
  function bdCell(r, c, i) {
    var mg = cuMerge([{ p: r.p, d: r.d }], c.days, c.hol ? function (it, w) { var x = it.d.x && it.d.x[c.hol[0]]; return x ? [x, (it.d.xa || {})[c.hol[0]], (it.d.xn || {})[c.hol[0]]] : cuDay(it, w); } : null), alts = {};
    var ents = mg.ents.filter(function (e) { return !e.a || bdServes(r.d, e.a, r.p); }).map(function (e) {   // נסיעה של חלופה שלא עוצרת במקום — לא בלוח
      var part = '';
      if (e.part) { var miss = c.days.filter(function (w) { return e.days.indexOf(w) < 0; }); part = e.days.length <= miss.length ? dShort(e.days) : 'חוץ מ' + dShort(miss); }
      if (e.a) (alts[e.a] = alts[e.a] || []).push(hm2(e.m));
      return { m: e.m, t: hm2(e.m), a: e.a, n: e.n, part: part, days: e.days };
    });
    var notes = Object.keys(alts).map(function (a) { return { times: alts[a], all: alts[a].length === ents.length, txt: (r.d.v || [])[a - 1] || 'במסלול אחר' }; });
    var key = r.key + '|c' + i, rm = [];
    // הודעה על שינוי: כל יציאה בלוח החדש מסומנת — חדשה (nw) או שהשעה שלה זזה (sh, מ-was); נסיעות שבוטלו — rm (בשעה הקודמת)
    if (r.d.mk) {
      var partOf = function (ds, all) { var miss = all.filter(function (w) { return ds.indexOf(w) < 0; }); return !miss.length ? '' : ds.length <= miss.length ? dShort(ds) : 'חוץ מ' + dShort(miss); };
      var sameD = c.days.filter(function (w) { return r.d.same && r.d.same[w]; }), act = c.days.filter(function (w) { return sameD.indexOf(w) < 0; });
      if (!act.length) return { ents: [], notes: [], rm: [], key: key, nkey: r.key + '|n' + i, txt: bdT(key, BD_SAME()), same: true, ntxt: bdT(r.key + '|n' + i, null) };
      ents.forEach(function (e) {
        var nd = [];   // הימים שבהם היציאה הזו חדשה (או בשעה חדשה)
        act.forEach(function (w) {
          (r.d.mk[w] || []).forEach(function (x) { if (x[0] !== e.m) return; if (x[1] === 'ad' || x[1] === 'sh') nd.push(w); if (x[1] === 'sh') e.was = x[2]; });
        });
        if (!nd.length) return;
        var ed = e.days || act;
        // חדשה בכל הימים שבהם היא נוסעת — ירוק; רק בחלק מהם (למשל רק ביום חמישי) — השעה רגילה, והערה קטנה בירוק: "חדש ב-ה׳"
        if (nd.length >= ed.length) e.k = e.was != null ? 'sh' : 'nw';
        else { e.k = ''; e.nwp = dShort(nd); }
      });
      var rmBy = {};
      act.forEach(function (w) { (r.d.mk[w] || []).forEach(function (x) { if (x[1] === 'rm') (rmBy[x[0]] = rmBy[x[0]] || []).push(w); }); });
      rm = Object.keys(rmBy).map(Number).sort(function (a, b) { return a - b; }).map(function (m) { return { m: m, t: hm2(m), rm: true, part: partOf(rmBy[m], act) }; });
      if (sameD.length) notes.push({ plain: dShort(sameD) + ' — ללא שינוי' });
    }
    // טקסט שהמשתמש כתב במקום השעות (txt) או במקום ההערה (ntxt); "" — התא / ההערה נמחקו
    return { ents: ents, notes: notes, rm: rm, key: key, nkey: r.key + '|n' + i, txt: bdT(key, null), ntxt: bdT(r.key + '|n' + i, null) };
  }
  function BD_SAME() { return BD_M ? BD_M.lbl.same : 'ללא שינוי'; }
  function bdNoteTxt(x) { return x.ntxt != null ? x.ntxt : x.txt != null && !x.same ? '' : x.notes.map(function (nt) { return nt.plain || ((nt.all ? 'כל הנסיעות' : ED.bdense ? 'באדום' : nt.times.join(' ')) + ' — ' + nt.txt); }).join('\n'); }   // צפוף: השעות כבר באדום בתא
  function bdCellHtml(x) {
    var nt = bdNoteTxt(x), nh = nt ? '<span' + bdK(x.nkey, 'bnote') + '>' + E(nt).replace(/\n/g, '<br>') + '</span>' : '';
    if (x.txt != null) return '<td class="bt' + (x.same ? ' same' : '') + '"><span' + bdK(x.key, 'tl', x.ph) + '>' + E(x.txt) + '</span>' + nh + '</td>';
    var rms = x.rm || [], inl = BD_RM !== 'note' && rms.length <= BD_RM_MAX;   // הרבה נסיעות שבוטלו בתא אחד — בשורה מתחת לתא
    if (!x.ents.length && !rms.length) return '<td class="bt off"><span' + bdK(x.key) + '>' + E(BD_M ? BD_M.lbl.off : 'אינו פעיל') + '</span>' + nh + '</td>';
    // נסיעות שבוטלו: בשעה הקודמת שלהן, באדום מחוק (או בשורה מתחת לתא: "בוטלו: 07:35, 09:10")
    var toks = inl ? x.ents.concat(rms).sort(function (a, b) { return a.m - b.m || (a.rm ? 1 : 0) - (b.rm ? 1 : 0); }) : x.ents;
    var rmLine = !inl && rms.length ? '<span class="bdrm">בוטלו: ' + rms.map(function (e) { return '<span class="t num" dir="ltr">' + e.t + (e.part ? '<sup dir="rtl">' + E(e.part) + '</sup>' : '') + '</span>'; }).join(', ') + '</span>' : '';
    return '<td class="bt"><span' + bdK(x.key, 'tl') + '>' + toks.map(function (e) {
      // כל שעה עם ×N והסימן שלה — יחידה אחת מבודדת (dir=ltr), כדי שהסימן בעברית לא יהפוך את סדר השעות בתא
      var k = e.rm ? ' rm' : e.k ? ' nw' : '', sr = e.rm ? 'בוטלה' : e.k === 'nw' ? 'חדשה' : '';
      var was = e.k === 'sh' ? '<small class="was" dir="rtl">' + (e.m < e.was ? 'הוקדם' : 'נדחה') + ' מ-' + hm2(e.was) + '</small>' :
        e.nwp ? '<small class="was" dir="rtl">' + (e.was != null ? e.nwp + ': ' + (e.m < e.was ? 'הוקדם' : 'נדחה') + ' מ-' + hm2(e.was) : 'חדש ב-' + e.nwp) + '</small>' : '';
      return '<span class="t num' + (e.a ? ' alt' : '') + k + '" dir="ltr">' + e.t + (sr ? '<span class="vh"> (' + sr + ')</span>' : '') + (e.n > 1 ? '<bdi dir="ltr" class="xn">×' + e.n + '</bdi>' : '') +
        (e.part ? '<sup dir="rtl">' + E(e.part) + '</sup>' : '') + was + '</span>';
    }).join(' ') + '</span>' + rmLine + nh + '</td>';
  }
  var BD_RM = 'inline', BD_RM_MAX = 6;   // נסיעות שבוטלו: 'inline' — במקום שלהן, מחוקות (עד BD_RM_MAX בתא); 'note' — שורה מתחת לתא
  /* צבע מספר הקו: הצבע של החברה (כמו בפסים), כהה מספיק לטקסט לבן — ניגודיות 4.5 לפחות */
  function bdOpCol(p) {
    var ag = String(agOf(p)), cs = COLORS[ag], base = cs ? cs[0] : PALETTE[(parseInt(ag, 10) || 0) % PALETTE.length], c = base, f = 1;
    while (contrast(c, '#ffffff') < 4.5 && f > 0.2) { f -= 0.05; c = shade(base, f); }
    return c;
  }
  function bdLineCell(r, span) {
    return '<td class="bl" rowspan="' + span + '"><span' + bdK('ln:' + r.p.makat, 'badge sm num', r.add ? 'קו' : '') + ' style="background:' + r.color + ';color:#fff">' + E(r.line) + '</span><small' + bdK('op:' + r.p.makat, 'op', r.add ? 'מפעיל' : '') + '>' + E(r.op) + '</small>' +
      (r.until ? '<small' + bdK('un:' + r.p.makat, 'un') + '>' + E(r.untilTxt) + '</small>' : '') +
      (r.p.chg === 'new' ? '<small' + bdK('nl:' + r.p.makat, 'nwl') + '>' + E(bdT('nl:' + r.p.makat, 'קו חדש')) + '</small>' : '') +
      (r.from ? '<small' + bdK('fr:' + r.p.makat, 'un') + '>' + E(r.from) + '</small>' : '') + '</td>';
  }
  function bdRowHtml(r, lineSpan) {
    // data-rk / data-mk — במצב עריכה לוחצים על שורה כדי לבחור אותה (ועל מספר הקו — את כל השורות של הקו), ואז מוחקים מהסרגל
    return '<tr class="br' + (r.first ? ' lead' : '') + (r.add ? ' badd' : '') + '" data-rk="' + E(r.key) + '" data-mk="' + E(r.p.makat) + '" data-ln="' + E(r.line) + '">' + (lineSpan ? bdLineCell(r, lineSpan) : '') +
      '<td class="bo">' +
      // טקסט שנמחק — נשאר כשדה ריק (במצב עריכה אפשר ללחוץ עליו ולשחזר; בהדפסה הוא לא תופס מקום)
      '<b' + bdK(r.key + '|o', '', r.add ? 'מוצא' : '') + '>' + E(r.origin) + '</b><small' + bdK(r.key + '|s', '', r.add ? 'תחנה' : '') + '>' + E(r.stop) + '</small>' +
      '<small' + bdK(r.key + '|w', r.inter ? 'tw twi' : 'tw', r.add ? 'לכיוון' : '') + '>' + E(r.toward) + '</small></td>' +
      r.cells.map(function (x) { return x.skip ? '' : x.span ? bdCellHtml(x).replace('<td ', '<td colspan="' + x.span + '" ') : bdCellHtml(x); }).join('') + '</tr>';
  }
  /* שורה או קו שהוסרו: במצב עריכה — שורה דקה ואפורה עם "להחזיר" (מחוץ לעריכה, בהדפסה ובקובץ — לא מופיעה) */
  function bdOffHtml(r, ncol, whole) {
    return '<tr class="boff noprint"><td colspan="' + (ncol + 2) + '"><button type="button" class="bdr" data-bdx="' + (whole ? 'L:' + E(r.p.makat) : 'R:' + E(r.key)) + '">להחזיר</button> ' +
      E((r.add && !r.line ? 'שורה שהוספת' : 'קו ' + r.line) + (whole ? '' : ' · ' + [r.origin, r.toward].filter(Boolean).join(' ')) + ' — הוסר מהלוח') + '</td></tr>';
  }
  function bdBandHtml(b, ncol, cont) {
    return '<tr class="bband' + (b.off ? ' boff noprint' : '') + '" style="background:' + b.color + '"><td colspan="' + (ncol + 2) + '"><span' + bdK('band:' + b.k) + '>' + E(b.label) + '</span>' + (cont && BD_M && BD_M.lbl.cont ? ' <span' + bdK('lbl:cont') + '>' + E(BD_M.lbl.cont) + '</span>' : '') + '</td></tr>';
  }
  /* רוחב העמודות: כך שהלוח כולו יהיה הכי נמוך — מחלקים את הרוחב ב"משבצות" (שעה אחת ברוחב), כל פעם למשבצת שהכי
     מקצרת את סכום הגבהים של השורות (גובה שורה — התא הגבוה בה: שעות, סימונים והערות). תא ממוזג (ימי חול זהים) — על
     הרוחב של כל העמודות שלו. BD_GEO — הצורה והגודל (מהם כמה שעות נכנסות בשורה) */
  var BD_GEO = { form: 'sign', sc: 1 }, BD_CG = {};
  var BD_FS = { sign: 13, deck: 16, status: 23 };
  function bdSlots(form, sc) {
    var dn = !!ED.bdense, W = FORMS[form].w - (form === 'sign' ? (dn ? 36 : 52) : 72) - (form === 'sign' ? (dn ? 128 : 156) : form === 'deck' ? (dn ? 178 : 226) : (dn ? 218 : 266));
    return Math.max(4, W / (BD_FS[form] * sc * (dn ? 3.1 : 3.4)));
  }
  function bdColW(M, T) {
    var n = M.cols.length, rows = [];
    M.bands.forEach(function (b) { b.rows.forEach(function (r) {
      if (r.off) return;
      rows.push(r.cells.map(function (x, i) {
        if (x.skip) return null;
        var wt, notes = bdNoteTxt(x).split('\n').filter(Boolean).map(function (s) { return s.length; });
        if (x.txt != null) wt = Math.max(1.8, x.txt.length / 5.5);
        else if (!x.ents.length && !(x.rm || []).length) wt = 1.8;
        else wt = x.ents.concat(BD_RM !== 'note' && (x.rm || []).length <= BD_RM_MAX ? x.rm || [] : []).reduce(function (t, e) { return t + 1 + (e.part ? 0.5 : 0) + (e.was != null || e.nwp ? 1 : 0) + (e.n > 1 ? 0.3 : 0); }, 0);
        return { c: i, s: x.span || 1, wt: wt, nt: notes };
      }).filter(Boolean));
    }); });
    var cost = function (ws) {
      var t = 0;
      rows.forEach(function (cs) {
        var mx = 1;
        cs.forEach(function (x) { var w = 0; for (var k = x.c; k < x.c + x.s; k++) w += ws[k]; var l = Math.ceil(x.wt / w - 1e-9); x.nt.forEach(function (s) { l += Math.ceil(s / (w * 5.5) - 1e-9) * 0.8; }); if (l > mx) mx = l; });
        t += mx;
      });
      return t;
    };
    var ws = M.cols.map(function () { return 2; }), rem = T - 2 * n;
    if (rem <= 0) return ws;
    var cur = cost(ws);
    while (rem >= 0.5) {
      var best = null;
      for (var c = 0; c < n; c++) for (var k = 1; k <= 8 && k * 0.5 <= rem; k++) {
        ws[c] += k * 0.5; var v = cost(ws); ws[c] -= k * 0.5;
        var gain = (cur - v) / k;
        if (gain > 1e-9 && (!best || gain > best.g + 1e-9)) best = { g: gain, c: c, k: k, v: v };
      }
      if (!best) break;
      ws[best.c] += best.k * 0.5; rem -= best.k * 0.5; cur = best.v;
    }
    return ws;   // מה שנשאר — מתחלק לפי היחס (הרוחב באחוזים)
  }
  function bdColgroup(M) {
    var T = Math.round(bdSlots(BD_GEO.form, BD_GEO.sc) * 2) / 2, ck = T + '|' + M.cols.length;
    if (BD_CG.M !== M) BD_CG = { M: M };
    var w = BD_CG[ck] || (BD_CG[ck] = bdColW(M, T));
    var tot = w.reduce(function (a, b) { return a + b; }, 0);
    return '<colgroup><col class="cl"><col class="co">' + w.map(function (x) { return '<col style="width:' + (x / tot * 100).toFixed(2) + '%">'; }).join('') + '</colgroup>';
  }
  function bdHead(M, form) {
    return '<div class="cu-head bd-head"><div class="t"><div>' + (M.title ? '<h1' + bdK('title', 'hd') + '>' + E(M.title) + '</h1>' : '') +
      (M.sub ? '<p' + bdK('sub', 'sub') + '>' + E(M.sub) + '</p>' : '') +
      (M.key && (M.key.hasNw || M.key.hasRm) ? '<p class="bd-key">' + (M.key.hasNw ? '<span' + bdK('lbl:knwx', 't num nw') + ' dir="ltr">' + E(bdT('lbl:knwx', '07:00')) + '</span> <span' + bdK('lbl:knw') + '>' + E(M.key.nw) + '</span>' : '') +
        (M.key.hasRm ? '<span' + bdK('lbl:krmx', 't num rm') + ' dir="ltr">' + E(bdT('lbl:krmx', '07:00')) + '</span> <span' + bdK('lbl:krm') + '>' + E(M.key.rm) + '</span>' : '') + '</p>' : '') + '</div></div></div>';
  }
  /* מוקדי מידע: רק החברות שהקווים שלהן בעמוד הזה (ops), ומשרד התחבורה. בלי ops — כל החברות שבלוח */
  function bdFoot(M, ops, pgi) {
    var cs = ops ? M.contacts.filter(function (c) { return c[2] === 'משרד התחבורה' || ops.indexOf(c[2]) >= 0; }) : M.contacts;
    return '<div class="bd-foot">' + (M.note ? '<p class="bd-upd">' + (M.lbl.upd ? '<b' + bdK('lbl:upd') + '>' + E(M.lbl.upd) + '</b> ' : '') + '<span' + bdK('note') + '>' + E(M.note) + '</span></p>' : '') +
      (cs.length ? '<p class="bd-ph">' + (M.lbl.ph ? '<b' + bdK('lbl:ph') + '>' + E(M.lbl.ph) + '</b> ' : '') + cs.map(function (c) {
        return '<span>' + (c[0] ? '<span' + bdK('phn:' + c[2]) + '>' + E(c[0]) + '</span>' : '') + ' ' + (c[1] ? '<b' + bdK('php:' + c[2], 'ltr') + '>' + E(c[1]) + '</b>' : '') + '</span>';
      }).join('') + '</p>' : '') +
      '<div class="cu-foot"><span' + bdK('legend') + '>' + (M.legend != null ? E(M.legend) : 'שעות היציאה מהתחנה הראשונה · ' + (M.chg ? '<span class="nwt">בירוק</span> — נסיעה חדשה או בשעה חדשה · <span class="alt">באדום מחוק</span> — נסיעה שבוטלה' : '<span class="alt">באדום</span> — נסיעה בדרך אחרת') + ' · ×2 — שני אוטובוסים · לפי נתוני משרד התחבורה' +
      (M.feed ? ' מ-' + LC.dmy(M.feed) : '')) + '</span><span' + bdK('pg:' + (pgi || 0), 'pg num') + '></span></div>' +
      // בכל עמוד, גם בצפוף ובעמוד אחד: שורת "אדם פרטי" (לא ניתנת לעריכה) והקרדיט (אפשר לשנות את הניסוח, לא למחוק)
      '<p class="bd-priv">המידע הוכן על ידי אדם פרטי · לא פרסום רשמי · לפני הנסיעה בדקו במוקד</p>' +
      (M.credit ? '<p' + bdK('credit', 'bd-cr') + '>' + (M.creditTxt === BD_CR ? 'הוכן בכלי ״מצגת לשינוי בקו״ של הקו הבוחן · <span class="ltr">kavbochan.app</span>' : E(M.creditTxt)) + '</p>' : '') + '</div>';
  }
  function bdTable(M, rows) {
    var nw = M.cols.filter(function (c) { return c.wk; }).length, two = nw > 1, rs = two ? ' rowspan="2"' : '';
    var th = function (c) { return '<th' + (two && !c.wk ? rs : '') + '><span' + bdK('th:' + c.days.join('')) + '>' + E(c.label) + '</span></th>'; };
    var head = '<tr><th' + rs + '><span' + bdK('th:line') + '>' + E(M.th.line) + '</span></th><th' + rs + '><span' + bdK('th:orig') + '>' + E(M.th.orig) + '</span></th>' +
      (two ? '<th colspan="' + nw + '" class="wkh"><span' + bdK('th:wk') + '>' + E(M.th.wk) + '</span></th>' + M.cols.filter(function (c) { return !c.wk; }).map(th).join('') + '</tr><tr class="wk2">' + M.cols.filter(function (c) { return c.wk; }).map(th).join('')
        : M.cols.map(th).join('')) + '</tr>';
    return '<table class="bd-t">' + bdColgroup(M) + '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }
  function bdSlideHtml(M, form, sc, body, ops, pgi) {
    return '<div class="s-cur s-bd f-' + form + (ED.bdense ? ' dense' : '') + '" style="--bd:' + sc + '">' + bdHead(M, form) + '<div class="cu-body">' + body + '</div>' + bdFoot(M, ops, pgi) + '</div>';
  }
  /* מדידה: כל השורות בעמוד אחד מחוץ למסך — הגובה של כל שורה והמקום שיש לטבלה */
  function bdMeasure(M, form, sc, items) {
    var host = document.createElement('div');
    host.className = 'deck'; host.setAttribute('data-form', form); host.setAttribute('data-look', ED.look || 'kav');
    host.style.cssText = 'position:absolute;left:-40000px;top:0;visibility:hidden;width:' + FORMS[form].w + 'px;' + lookVars(ED.look, M.pages);
    host.innerHTML = '<div class="sframe"><div class="slide">' + bdSlideHtml(M, form, sc, bdTable(M, items.map(function (x) { return x.html; }).join(''))) + '</div></div>';
    document.body.appendChild(host);
    var body = host.querySelector('.cu-body'), th = host.querySelector('thead'), trs = host.querySelectorAll('tbody > tr');
    var avail = body.clientHeight - th.offsetHeight - 4, hs = Array.prototype.map.call(trs, function (t) { return t.getBoundingClientRect().height; });
    document.body.removeChild(host);
    return { avail: avail, hs: hs };
  }
  function bdPaginate(M, form, sc) {
    var items = [];
    BD_GEO = { form: form, sc: sc };
    var offs = {}, prevKey = '^';   // מה שהוסר — נכנס לעמוד אחרי הפריט שלפניו (רק במצב עריכה הוא נראה)
    M.bands.forEach(function (b) {
      var bandIt = { band: b, html: bdBandHtml(b, M.cols.length, false) };
      if (b.off) (offs[prevKey] = offs[prevKey] || []).push(bandIt); else { items.push(bandIt); prevKey = items.length - 1; }
      var seenL = {};
      b.rows.forEach(function (r) {
        if (!r.off) { items.push({ b: b, r: r, html: null }); prevKey = items.length - 1; return; }
        if (r.offL && seenL[r.p.makat]) return;
        seenL[r.p.makat] = 1;
        (offs[prevKey] = offs[prevKey] || []).push({ off: true, html: bdOffHtml(r, M.cols.length, r.offL) });
      });
    });
    // למדידה — כמו בעמוד: תא אחד של מספר הקו לכל הכיוונים שלו (אחרת כל שורה נמדדת עם המספר, שם החברה וה"עד" שלה, וגבוהה מדי)
    items.forEach(function (it, i) {
      if (!it.r) return;
      if (items[i - 1] && items[i - 1].r && items[i - 1].r.p === it.r.p) { it.html = bdRowHtml(it.r, 0); return; }
      var span = 1; while (items[i + span] && items[i + span].r && items[i + span].r.p === it.r.p) span++;
      it.html = bdRowHtml(it.r, span);
    });
    var ms = bdMeasure(M, form, sc, items), pgs = [], cur = [], used = 0, H = ms.avail;
    // שורה שהוסרה נראית רק במצב עריכה (שורה דקה) — שומרים לה מקום בתחתית העמוד, כדי שבעריכה הלוח לא יגלוש
    var offH = ED.editing ? (ms.hs[0] || 24) * 0.85 : 0;   // רק במצב עריכה; בהדפסה העמודים מלאים
    (offs['^'] || []).forEach(function (x) { cur.push(x); used += offH; });
    // כמה צריך כדי להתחיל כאן: כל הכיוונים של הקו (שלא ייחתך באמצע), ופס — יחד עם הקו הראשון אחריו
    var lineH = function (i) { var t = 0, p = items[i].r.p; for (var k = i; k < items.length && items[k].r && items[k].r.p === p; k++) t += ms.hs[k] || 0; return t; };
    items.forEach(function (it, i) {
      var h = ms.hs[i] || 0, first = it.r && !(items[i - 1] && items[i - 1].r && items[i - 1].r.p === it.r.p);
      var need = it.band ? h + (items[i + 1] && items[i + 1].r ? Math.min(lineH(i + 1), H * 0.6) : 0) : first ? Math.min(lineH(i), H * 0.6) : h;
      if (cur.length && used + need > H) {
        pgs.push(cur); cur = []; used = 0;
        if (!it.band) { var bi = items.indexOf(items.filter(function (x) { return x.band === it.b; })[0]); cur.push({ cont: it.b }); used += ms.hs[bi]; }
      }
      cur.push(it); used += h;
      (offs[i] || []).forEach(function (x) { cur.push(x); used += offH; });
    });
    if (cur.length) pgs.push(cur);
    return pgs.length ? pgs : [[]];
  }
  function bdPageHtml(M, its) {
    return its.map(function (it, i) {
      if (it.cont) return bdBandHtml(it.cont, M.cols.length, true);
      if (it.band || it.off) return it.html;
      // מספר הקו — תא אחד לכל הכיוונים של הקו באותו עמוד (שורה שהוסרה באמצע — מפרידה)
      var prev = its[i - 1];
      if (prev && prev.r && prev.r.p === it.r.p) return bdRowHtml(it.r, 0);
      var span = 1; for (var k = i + 1; k < its.length && its[k].r && its[k].r.p === it.r.p; k++) span++;
      return bdRowHtml(it.r, span);
    }).join('');
  }
  var BD_M = null;   // המודל של הלוח שנבנה עכשיו (לטקסטים הקבועים בתאים ובפסים)
  var BD_SC = { sign: [1, 0.9, 0.8, 0.72], deck: [1, 0.88, 0.78], status: [1, 0.88, 0.78] };
  // שלט A4 "להכניס ל-N עמודים": מקטינים הכול יחד (גופן, גובה שורות, ריווח) עד שנכנס — לא פחות מ-BD_MIN
  // (13px × 0.67 ≈ 8.7px ≈ 6.5pt בהדפסה — עדיין קריא). לא נכנס גם בגודל הזה — כמה עמודים צריך (BOARD_FIT.need)
  var BD_MIN = 0.67, BOARD_FIT = null;
  function bdSlides(pages, form) {
    var M = BD_M = bdModel(pages), best = null, want = form === 'sign' ? +ED.bpages || 0 : 0;
    BOARD_FIT = null;
    if (want) {
      for (var sc0 = 1; ; sc0 = Math.max(BD_MIN, Math.round((sc0 - 0.04) * 100) / 100)) {
        var pg0 = bdPaginate(M, form, sc0);
        if (!best || pg0.length < best.pg.length || pg0.length <= want) best = { sc: sc0, pg: pg0 };
        if (pg0.length <= want || sc0 <= BD_MIN) break;
      }
      BOARD_FIT = { want: want, pages: best.pg.length, need: best.pg.length > want ? best.pg.length : 0, sc: best.sc };
    } else
    // הגופן: הגדול ביותר שלא מוסיף עמודים (עד 3 ניסיונות קטנים יותר)
    BD_SC[form].forEach(function (sc) {
      var pg = bdPaginate(M, form, sc);
      if (!best || pg.length < best.pg.length) best = { sc: sc, pg: pg };
    });
    var n = best.pg.length;
    BD_GEO = { form: form, sc: best.sc };
    var out = best.pg.map(function (its, i) {
      var ops = opsOf(its.filter(function (it) { return it.r && !it.r.off; }).map(function (it) { return it.r.p; }));
      return { id: (form === 'deck' ? '' : form === 'sign' ? 'sg-' : 'st-') + 'bd' + i, label: 'לוח לפי יעד' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: bdSlideHtml(M, form, best.sc, bdTable(M, bdPageHtml(M, its)), ops, i) };
    });
    out.pages = M.pages;   // הקווים שבלוח בפועל (לשקף הסיום)
    return out;
  }

  /* ================= טבלת לו"ז לכמה קווים (שינוי בלו"ז וקו חדש — כשיש במצגת שניים או יותר) =================
     "רק מה שהשתנה" — שורה קצרה לכל קו (שקף סיכום אחרי השער, ובסטטוס).
     מפורט — "לפי יעד": פס צבעוני לכל זוג ערים, שורה לכל קו וכיוון, עמודה לכל קבוצת ימים (החלוקה הדקה ביותר שמשותפת
     לכל השורות), ובתא — שעות היציאה: חדשה בירוק, שבוטלה באדום מחוק, שהוזזה בכתום. "אינו פעיל" — אין נסיעות.
     כללי — לכל קו, כיוון וקבוצת ימים: כמה נסיעות (לפני ← אחרי), הראשונה, האחרונה ומה השתנה. */
  function ttCap(p) { return (p.kind === 'timetable' || p.kind === 'new') && p.dirs.some(function (d) { return d.tt && d.tt.length; }); }
  function mtDirs(p) { return (p.kind === 'timetable' ? ttDirs(p) : kDirs(p)).filter(function (d) { return d.tt && d.tt.length; }); }
  function lastStop(d) { var S = (d.new && d.new.stops.length ? d.new : d.old).stops; return S.length ? S[S.length - 1].name : ''; }
  function mtFrom(d) { var o = d.od || []; return o[0] && o[1] && o[0] !== o[1] ? 'מ' + o[0] : 'ל' + streetOf(lastStop(d)); }
  /* שורות: קבוצה לכל זוג ערים (בלי קשר לחברה) */
  function mtGroups(pages) {
    var by = {}, out = [];
    pages.forEach(function (p) {
      var o = p.od || [], k = o[0] && o[1] ? [o[0], o[1]].sort().join('|') : p.id;
      if (!by[k]) out.push(by[k] = { label: o[0] && o[1] && o[0] !== o[1] ? o[0] + ' – ' + o[1] : (o[0] || p.line) + ' · קווים בעיר', rows: [] });
      mtDirs(p).forEach(function (d, i, a) { by[k].rows.push({ p: p, d: d, first: i === 0, n: a.length }); });
    });
    out.forEach(function (g, i) { g.c = i % 6; });
    return out;
  }
  /* מה יש לשורה ביום w: שינוי (רשומה עם לוח ישן וחדש), אותו לוח (keep), "ללא שינוי" בלי שעות (same), או כלום */
  function mtDay(r, w) {
    var t = DOWS[w], e;
    for (var i = 0; i < r.d.tt.length; i++) if (r.d.tt[i].t.indexOf(t) >= 0) { e = r.d.tt[i]; return { k: r.p.kind === 'new' ? 'n' : 'c', e: e, id: 'c' + i }; }
    var kp = r.d.keep || [];
    for (var j = 0; j < kp.length; j++) if (kp[j].t.indexOf(t) >= 0) return { k: 'k', e: kp[j], id: 'k' + j };
    if ((r.d.same || []).indexOf(t) >= 0) return { k: 's', id: 's' };
    return { k: '', id: '' };
  }
  function mtCols(rows, hol) {
    var sig = {}, order = [];
    for (var w = 0; w < 7; w++) {
      // לפי מה שמוצג בתא (השעות והסימונים) — ימים שנראים אותו דבר בכל השורות נכנסים לאותה עמודה
      if (rows.every(function (r) { return !mtDay(r, w).id; })) continue;
      var cells = rows.map(function (r) { var it = mtItems(r, { days: [w] }); return it && it.map ? it.map(function (x) { return x[0] + x[1]; }).join() : String(it); });
      var k = cells.join('|');
      if (!sig[k]) { sig[k] = []; order.push(k); }
      sig[k].push(w);
    }
    var cols = order.map(function (k) { return { days: sig[k] }; });
    (hol || []).forEach(function (h) {
      if (rows.some(function (r) { return r.d.hx && r.d.hx[h[0]]; })) cols.push({ days: [isoDow(h[0])], hol: h });
    });
    cols.forEach(function (c) {
      var k = c.days.join(',');
      c.label = c.hol ? c.hol[2] : k === '0,1,2,3,4' ? 'א׳–ה׳' : k === '5' ? 'שישי' : k === '6' ? 'מוצ״ש' : c.days.length === 1 ? 'יום ' + dShort(c.days) : dShort(c.days);
      c.sub = c.hol ? LC.wd(c.hol[0]) + ' ' + LC.dm(c.hol[0]) : '';
    });
    return cols;
  }
  /* התא: רשימת שעות (עם סימון) או טקסט. ×2 — כמה אוטובוסים באותה דקה (רק בשלט) */
  function mtItems(r, c) {
    if (c.hol && r.d.hx && r.d.hx[c.hol[0]]) return r.d.hx[c.hol[0]].map(function (m) { return [m, '']; });
    var x = mtDay(r, c.days[0]);
    if (x.k === 'c') return mergeSh(x.e.o || [], x.e.n || []);
    if (x.k === 'n' || x.k === 'k') return x.e.n.map(function (m) { return [m, '']; });
    return x.k === 's' ? 'same' : null;
  }
  function mtCell(items, form) {
    if (items === 'same') return { n: 1, html: '<td class="tx">ללא שינוי</td>' };
    if (!items || !items.length) return { n: 1, html: '<td class="tx off">אינו פעיל</td>' };
    var toks = [];
    items.forEach(function (x) {
      var t = toks[toks.length - 1];
      if (t && t.m === x[0] && t.k === x[1]) { t.n++; return; }
      toks.push({ m: x[0], k: x[1], n: 1, was: x[2] });
    });
    return { n: toks.length, html: '<td class="tms">' + toks.map(function (t) {
      return '<span class="tm' + (t.k ? ' ' + t.k : '') + '"' + (t.k === 'sh' ? ' title="היה ' + hm2(t.was) + '"' : '') + '>' + hm2(t.m) +
        (t.n > 1 && form === 'sign' ? '<small class="xn">×' + t.n + '</small>' : '') + '</span>';
    }).join(' ') + '</td>' };
  }
  var MTM = {
    deck: { W: 1184, lineW: 74, fromW: 150, tokW: 64, lineH: 27, pad: 12, bandH: 38, headH: 44, H: 530 },
    sign: { W: 730, lineW: 50, fromW: 96, tokW: 45, lineH: 20, pad: 8, bandH: 30, headH: 38, H: 880 }
  };
  function mtKey(form) {
    return '<p class="mt-key"><span><span class="tm">07:30</span> ללא שינוי</span><span><span class="tm ad">07:45</span> נסיעה חדשה</span>' +
      '<span><span class="tm rm">08:15</span> בוטלה</span><span><span class="tm sh">08:20</span> הוזזה</span>' + (form === 'sign' ? '<span><span class="tm">13:45<small class="xn">×2</small></span> שני אוטובוסים</span>' : '') + '</p>';
  }
  /* מפורט: שורות עם גובה משוער, ואז עמודים */
  function mtDetRows(groups, cols, form) {
    var M = MTM[form], cw = (M.W - M.lineW - M.fromW) / Math.max(1, cols.length), per = Math.max(1, Math.floor(cw / M.tokW)), out = [];
    groups.forEach(function (g) {
      out.push({ band: true, g: g, h: M.bandH, html: '<tr class="band c' + g.c + '"><td colspan="' + (cols.length + 2) + '">' + E(g.label) + '</td></tr>' });
      g.rows.forEach(function (r, ri) {
        var its = cols.map(function (c) { return mtItems(r, c); }), lead = ri === 0 || g.rows[ri - 1].p !== r.p;
        var linesOf = function (a, b) { return Math.max.apply(null, its.map(function (x) { return x && x.filter ? Math.ceil(x.filter(function (y) { return y[0] >= a && y[0] < b; }).length / per) : 1; })); };
        // שורה ארוכה (קו תדיר) — מתחלקת לפי שעות, כדי שהעמודים יתמלאו ולא יישאר מקום ריק
        var maxL = Math.max(4, Math.floor(M.H * 0.45 / M.lineH)), cuts = [0];
        if (linesOf(0, 4000) > maxL) {
          var a = 0;
          for (var hr = 1; hr <= 30; hr++) if (linesOf(a, hr * 60) > maxL && hr * 60 - 60 > a) { a = hr * 60 - 60; cuts.push(a); }
        }
        cuts.push(4000);
        for (var k = 0; k + 1 < cuts.length; k++) {
          var a0 = cuts[k], b0 = cuts[k + 1], part = cuts.length > 2;
          var cells = its.map(function (x) { return mtCell(x && x.filter ? x.filter(function (y) { return y[0] >= a0 && y[0] < b0; }) : x, form); });
          var lines = Math.max.apply(null, cells.map(function (x) { return Math.ceil(x.n / per); }));
          var first = lead && k === 0;
          out.push({ g: g, h: lines * M.lineH + M.pad, html: '<tr class="' + (first ? 'lead' : 'cont') + '"><td class="ln">' + (first ? '<span class="badge sm num">' + E(r.p.line) + '</span>' : '') + '</td>' +
            '<td class="from">' + (k === 0 ? E(mtFrom(r.d)) : '') + (part ? '<small>' + (k === 0 ? 'עד ' + hm2(b0 - 1) : b0 === 4000 ? 'מ-' + hm2(a0) : hm2(a0) + '–' + hm2(b0 - 1)) + '</small>' : '') + '</td>' +
            cells.map(function (x) { return x.html.replace('<td class="tx off">אינו פעיל</td>', k ? '<td></td>' : '<td class="tx off">אינו פעיל</td>'); }).join('') + '</tr>' });
        }
      });
    });
    return out;
  }
  function mtGenRows(groups, form) {
    var out = [];
    groups.forEach(function (g) {
      out.push({ band: true, g: g, h: MTM[form].bandH, html: '<tr class="band c' + g.c + '"><td colspan="7">' + E(g.label) + '</td></tr>' });
      g.rows.forEach(function (r, ri) {
        var lead = ri === 0 || g.rows[ri - 1].p !== r.p, isNew = r.p.kind === 'new';
        var ents = r.d.tt.slice(), rest = [];
        (r.d.keep || []).forEach(function (k) { rest = rest.concat(k.t); });
        if (!rest.length) rest = (r.d.same || []).slice();
        var row = function (e, first) {
          var a = e ? e.so : null, b = e ? e.sn : null;
          var cmp = function (f) { return isNew || !a || !a.n || !b.n || Math.abs(a[f] - b[f]) < 10 ? (b && b.n ? hm2(b[f]) : '—') : '<s>' + hm2(a[f]) + '</s> ← <b>' + hm2(b[f]) + '</b>'; };
          return '<tr class="' + (first && lead ? 'lead' : 'cont') + '"><td class="ln">' + (first && lead ? '<span class="badge sm num">' + E(r.p.line) + '</span>' : '') + '</td>' +
            '<td class="from">' + (first ? E(mtFrom(r.d)) : '') + '</td>' +
            (e ? '<td class="dy">' + E(daysShort(e.t)) + '</td><td class="num">' + (isNew ? '<b>' + b.n + '</b>' : a.n === b.n ? b.n : a.n + ' ← <b>' + b.n + '</b>') + '</td>' +
              '<td class="num">' + cmp('f') + '</td><td class="num">' + cmp('l') + '</td><td class="wt">' + (isNew ? 'קו חדש' : ttSmall(r.p) ? smallLine(e).replace(/^<b>[^<]*<\/b>\s*/, '') : ttLine(e).replace(/^<b>[^<]*<\/b>\s*/, '')) + '</td>'
              : '<td class="dy">' + E(daysShort(rest)) + '</td><td colspan="4" class="tx">ללא שינוי</td>') + '</tr>';
        };
        ents.forEach(function (e, i) { out.push({ g: g, h: form === 'sign' ? 44 : 50, html: row(e, i === 0) }); });
        if (rest.length && !isNew) out.push({ g: g, h: form === 'sign' ? 30 : 36, html: row(null, false) });
      });
    });
    return out;
  }
  function mtPages(rows, H) {
    var pages = [], cur = [], used = 0;
    rows.forEach(function (r, i) {
      var need = r.h + (r.band ? (rows[i + 1] ? rows[i + 1].h : 0) : 0);   // פס בלי שורה אחריו — לעמוד הבא
      if (used && used + need > H) {
        pages.push(cur); cur = []; used = 0;
        if (!r.band) { var b = rows.filter(function (x) { return x.band && x.g === r.g; })[0]; cur.push({ h: b.h, html: b.html.replace('</td></tr>', ' (המשך)</td></tr>') }); used += b.h; }
      }
      cur.push(r); used += r.h;
    });
    if (cur.length) pages.push(cur);
    return pages;
  }
  function mtTable(rows, cols, form, gen) {
    var head = gen ? '<tr><th class="ln">קו</th><th class="from">כיוון</th><th>ימים</th><th>נסיעות ביום</th><th>הראשונה</th><th>האחרונה</th><th>מה השתנה</th></tr>'
      : '<tr><th class="ln">קו</th><th class="from">כיוון</th>' + cols.map(function (c) { return '<th>' + E(c.label) + (c.sub ? '<small>' + E(c.sub) + '</small>' : '') + '</th>'; }).join('') + '</tr>';
    return '<table class="mt-t' + (gen ? ' gen' : '') + '"><thead>' + head + '</thead><tbody>' + rows.map(function (r) { return r.html; }).join('') + '</tbody></table>';
  }
  function mtWhen(pages) { var s = pages.map(start).sort()[0]; return s ? 'מ-' + LC.dmy(s) : ''; }
  function mtSlides(pages, form) {
    var o = ttOpt(), ps = pages.filter(ttCap), groups = mtGroups(ps), allRows = [];
    groups.forEach(function (g) { allRows = allRows.concat(g.rows); });
    var cols = mtCols(allRows, ED.hol), gen = o.v === 'gen', M = MTM[form];
    var rows = gen ? mtGenRows(groups, form) : mtDetRows(groups, cols, form);
    var pg = mtPages(rows, M.H), ttl = gen ? 'לוחות הזמנים: מה משתנה' : 'לוחות הזמנים החדשים';
    var sub = linesTxt(ps) + ' · ' + (gen ? 'לפי יעד' : 'לפי יעד, כל שעות היציאה') + ' · ' + mtWhen(ps);
    return pg.map(function (rs, i) {
      return { id: (form === 'sign' ? 'sg-' : '') + 'mt' + i, label: ttl + (pg.length > 1 ? ' (' + (i + 1) + '/' + pg.length + ')' : ''),
        html: '<div class="s-cur s-mt f-' + form + '"><div class="cu-head"><div class="t"><div><h1 class="hd">' + E(ttl) + '</h1><p class="sub">' + E(sub) + '</p></div></div>' +
          (gen ? '' : mtKey(form)) + '</div><div class="cu-body">' + mtTable(rs, cols, form, gen) + '</div>' +
          (form === 'sign' ? cuFoot(form).replace(' · "בלילה" = אחרי חצות של אותו לילה', '') : '<div class="sfoot"><span>שעות היציאה מהתחנה הראשונה · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div>') + '</div>' };
    });
  }
  /* "רק מה שהשתנה": שורה לכל קו — תגית, סוג השינוי ומשפט אחד */
  /* שינוי בלו"ז בשורה אחת — מה השתנה בפועל, בלי מספרי נסיעות: שינוי קטן (עד 3 נסיעות) — השעות עצמן;
     נסיעות לילה — "נוספו נסיעות לילה עד 2:00"; אחרת — "יותר נסיעות בימי חול" / "שעות אחרות בשישי" */
  function ttPlain(p) {
    var out = [];
    ttDirs(p).forEach(function (d) {
      d.tt.forEach(function (e) {
        var x = ttDiff(e), n = x.ad.length + x.rm.length + x.sh.length, w = dtIn(e.t), t;
        if (!n) return;
        var late = function (m) { return m >= 1380; };
        if (n <= 3) t = smallLine(e).replace(/<\/?b>/g, '').replace(/\.$/, '');
        else if (x.ad.length && !x.rm.length && !x.sh.length && x.ad.every(late)) t = w + ' נוספו נסיעות לילה עד ' + hm(Math.max.apply(null, x.ad));
        else if (x.rm.length && !x.ad.length && !x.sh.length && x.rm.every(late)) t = w + ' בוטלו נסיעות הלילה אחרי ' + hm(Math.min.apply(null, x.rm) - 1);
        else t = (x.ad.length > x.rm.length ? 'יותר נסיעות ' : x.rm.length > x.ad.length ? 'פחות נסיעות ' : 'שעות אחרות ') + w;
        if (out.indexOf(t) < 0) out.push(t);
      });
    });
    return out.slice(0, 3).join(' · ') + (out.length > 3 ? ' ועוד' : '') + '.';
  }
  function sumLine(p) {
    if (p.kind === 'timetable') return E(ttPlain(p));
    var it = isKind(p) ? kindItems(p) : whatChanges(p);
    if (p.kind === 'new') return [it[0], it[2]].filter(Boolean).join(' ');
    if (p.kind === 'ended') return it[0] || '';
    return (it[0] || totLine(p.tot || {})) + '';
  }
  /* שלט לכמה קווים: כשהוא יוצא ארוך (יותר מ-SIGN_MAX עמודים, למשל "כל הקווים בעיר") — במקום טבלת הלו"ז של כל
     הקווים: עמודי "מה משתנה" (שורה לכל קו), ואחריהם השלטים המפורטים רק של SIGN_LINES הקווים הראשונים.
     ED.a4full — המשתמש ביקש את הגרסה המלאה. SIGN_INFO — כמה עמודים בכל אחת (להודעה בשלב 3) */
  var SIGN_MAX = 10, SIGN_LINES = 20, SIGN_INFO = null;
  function signLimit(pages, full, feed) {
    SIGN_INFO = { full: full.length, limited: false, short: full.length };   // (נקרא רק בשלט של שינויים)
    if (pages.length < 2 || full.length <= SIGN_MAX) return full;
    // שינוי בלו"ז — רק בשורת הסיכום ובטבלת הלו"ז של כל הקווים (כללי / מפורט, לפי הבחירה), בלי שלט משלו.
    // שלטים מפורטים (מפה ותחנות) — לשינויי מסלול, קווים חדשים ומבוטלים, עד SIGN_LINES קווים
    var tts = pages.filter(function (p) { return p.kind === 'timetable' && ttCap(p); });
    var det = pages.filter(function (p) { return p.kind !== 'timetable'; });
    // אותו שינוי בכמה קווים (units) — שלט אחד, ונספר פעם אחת מתוך SIGN_LINES
    var us = units(det), ku = us.slice(0, SIGN_LINES), keepIds = {};
    ku.forEach(function (u) { u.all.forEach(function (p) { keepIds[p.id] = 1; }); });
    var keep = ku, more = us.length - ku.length;
    // שורה בעמוד "מה משתנה" — רק לקווים שאין להם שלט מפורט ואינם בטבלת הלו"ז
    var rest = det.filter(function (p) { return !keepIds[p.id]; });
    var sum = rest.length ? sumSign(rest, 0) : [], tab = tts.length ? mtSlides(tts, 'sign') : [];
    var dpages = signPages(det.filter(function (p) { return keepIds[p.id]; }), feed);
    var short = sum.concat(tab, dpages);
    SIGN_INFO = { full: full.length, limited: ED.a4full !== true, short: short.length, more: more,
      parts: { sum: sum.length, tt: tab.length, det: dpages.length, ttLines: tts.length,
        detLines: ku.reduce(function (n, u) { return n + u.all.length; }, 0), detUnits: ku.length, sumLines: rest.length } };
    return ED.a4full === true ? full : short;
  }
  function sumSign(pages, more) {
    // אותו שינוי בכמה קווים — שורה אחת עם כל מספרי הקווים
    var us = units(pages), per = 8, out = [], n = Math.ceil(us.length / per);
    for (var i = 0; i < n; i++) {
      var ps = us.slice(i * per, (i + 1) * per);
      out.push({ id: 'sg-sum' + i, label: 'שלט · מה משתנה' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: '<div class="s-sign s-sgsum"><div class="sg-band"><div class="sg-row" style="padding-top:14px"><div class="t"><h1 class="hd">מה משתנה בקווים</h1><p class="sub">' +
          E(linesTxt(pages) + ' · ' + mtWhen(pages)) + (n > 1 ? ' · ' + (i + 1) + '/' + n : '') + '</p></div></div><div class="seam"><i></i></div></div>' +
          '<ul class="sm-rows" style="margin:12px 40px 0">' + ps.map(function (u) {
            var p = u.p, many = u.all.length > 1;
            return '<li><span class="badges" style="display:flex;flex-wrap:wrap;gap:4px;max-width:180px">' + u.all.map(function (x) { return '<span class="badge sm num">' + E(x.line) + '</span>'; }).join('') + '</span>' +
              '<div class="sm-t"><div class="sm-h">' + LC.chips(p.kind ? { kind: p.kind } : p.tot || {}).replace(/^(<span class="chip[^"]*">[^<]*<\/span>)[\s\S]*$/, '$1') +
              '<span class="sm-od">' + E(many ? 'אותו שינוי ב-' + u.all.length + ' קווים' : odTxt(p)) + '</span></div><p>' + (many ? plu(sumLine(p).replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '')) : sumLine(p)) + '</p></div></li>';
          }).join('') + '</ul>' +
          (i === n - 1 ? '<p style="margin:14px 40px 0;font-size:20px;font-weight:700">הפרטים המלאים של הקווים האלה — במצגת.</p>' : '') +
          signFoot(null, false) + '</div>' });
    }
    return out;
  }
  function sumSlides(pages, form) {
    var per = form === 'status' ? 7 : 5, out = [], n = Math.ceil(pages.length / per);
    var rowsOf = function (ps) {
      return ps.map(function (p) {
        return '<li><span class="badge sm num">' + E(p.line) + '</span><div class="sm-t"><div class="sm-h">' + LC.chips(p.kind ? { kind: p.kind } : p.tot || {}).replace(/^(<span class="chip[^"]*">[^<]*<\/span>)[\s\S]*$/, '$1') +
          '<span class="sm-od">' + E(odTxt(p)) + '</span></div><p>' + sumLine(p) + '</p></div></li>';
      }).join('');
    };
    for (var i = 0; i < n; i++) {
      var ps = pages.slice(i * per, (i + 1) * per), lab = 'רק מה שהשתנה' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : '');
      if (form === 'status') {
        out.push({ id: 'st-sum' + i, label: lab, html: '<div class="s-status s-sum"><div class="st-top sm"><h1 class="hd">מה משתנה בקווים</h1><p class="sub">' + E(linesTxt(pages) + ' · ' + mtWhen(pages)) + (n > 1 ? ' · ' + (i + 1) + '/' + n : '') + '</p><div class="seam"><i></i></div></div>' +
          '<ul class="sm-rows">' + rowsOf(ps) + '</ul><div class="st-foot"><p class="st-check">לפני הנסיעה בדקו: משרד התחבורה <b class="ltr">' + MOT + '</b></p>' +
          '<p class="st-note">לא פרסום רשמי · הוכן על ידי אדם פרטי' + (ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</p></div></div>' });
      } else {
        out.push({ id: 'sum' + i, label: lab, html: '<div class="s-sum"><h2 class="hd">מה משתנה' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : '') + '</h2><ul class="sm-rows">' + rowsOf(ps) + '</ul>' + foot() + '</div>' });
      }
    }
    return out;
  }

  /* גודל העמוד של כל צורה */
  var FORMS = { deck: { w: 1280, h: 720 }, sign: { w: SG_W, h: SG_H }, status: { w: ST_W, h: ST_H } };

  var ED = {};   // אפשרויות: {look, modes: {pageId: 'one'|'full'}, form: 'deck'|'sign'|'status', credit}
  function isOne(p) { if (isKind(p)) return false; var m = ED.modes && ED.modes[p.id]; return m ? m === 'one' : smallInfo(p).small; }
  function build(pages, city, edits) {
    ED = edits || {}; SIGN_INFO = null;
    var big = ED.look === 'large';
    RR = big ? 6 : 10; RA = big ? 10 : 16; SEG_MAX = big ? 3 : 4; COVER_MAX = big ? 2 : 3;
    var feed = pages.map(function (p) { return p.feed; }).filter(Boolean).sort().pop();
    if (pages.length && pages.every(isCur)) { ED.hol = ED.hol || pages[0].hol || []; return curBuild(pages, feed); }
    pages.forEach(prep);
    // "של קו N" / "של הקווים N, M" — לטקסט על תחנה שמבוטלת בלי תחנה קרובה במקומה
    units(pages).forEach(function (u) {
      var ln = []; u.all.forEach(function (x) { if (ln.indexOf(x.line) < 0) ln.push(x.line); });
      var t = ln.length > 1 ? 'של הקווים ' + ln.join(', ') : 'של קו ' + ln[0];
      u.all.forEach(function (x) { (x.dirs || []).forEach(function (d) { d._nn = t; }); });
    });
    if (ED.tt && ED.tt.v === 'board' && pages.some(ttCap)) return chgBoardBuild(pages, city, feed);
    // שניים או יותר עם לו"ז (שינוי בלו"ז, קו חדש): טבלה אחת לכל הקווים, ושורה קצרה לכל קו
    // שינוי קטן מאוד בלו"ז (ttOne) — לא נכנס לטבלת הלו"ז של כל הקווים, אלא אם ביקשו "גם שקף נפרד לכל קו"
    // ED.tv — הבחירה בשלב 3: 'sep' (טבלה לכל קו) — בלי טבלה משותפת; 'comb' (טבלה משולבת) — כל הקווים בטבלה המשותפת, גם שינוי קטן מאוד
    var ttCapB = function (p) { return ttCap(p) && (ED.tv === 'comb' || !(ttOne(p) && ED.ttper !== true && pages.length > 1)); };
    var mt = ED.tv !== 'sep' && pages.filter(ttCapB).length > 1, rest = mt ? pages.filter(function (p) { return !ttCapB(p); }) : pages;
    if (ED.form === 'sign') return signLimit(pages, mt ? mtSlides(pages.filter(ttCapB), 'sign').concat(rest.length ? signPages(rest, feed) : []) : signPages(pages, feed), feed);
    if (ED.form === 'status') return mt ? sumSlides(pages, 'status').concat(rest.length ? statusPages(rest) : []) : statusPages(pages);
    // קו אחד עם שינוי קטן — עמוד אחד (או שניים), בלי שער ובלי שקף סיום
    if (pages.length === 1 && isOne(pages[0])) return onePages(pages[0], feed, '');
    if (pages.length === 1 && ttOne(pages[0])) return [{ id: pages[0].id + '-one', label: 'עמוד אחד', html: cover(pages, city, { feed: feed }) }];
    var slides = [{ id: 'cover', label: 'שער', html: cover(pages, city) }];
    if (mt) sumSlides(pages, 'deck').concat(mtSlides(pages.filter(ttCapB), 'deck')).forEach(function (x) { slides.push(x); });
    else if (pages.length > 1) {
      var per = 9, n = Math.ceil(pages.length / per);
      for (var i = 0; i < n; i++) slides.push({ id: 'over' + i, label: 'כל הקווים' + (n > 1 ? ' (' + (i + 1) + ')' : ''), html: overview(pages.slice(i * per, (i + 1) * per), i, n) });
    }
    var merged = {};
    pages.forEach(function (p, i) {
      if (merged[p.id] || (mt && ED.ttper === false && ttCap(p))) return;
      // שינוי קטן מאוד בלו"ז במצגת של כמה קווים — רק שורה בסיכום, בלי שקפים משלו (אלא אם ביקשו "גם שקף נפרד לכל קו")
      if (ttOne(p) && ED.ttper !== true) return;
      var sig = oneSig(p), others = sig ? pages.slice(i + 1).filter(function (o) { return !merged[o.id] && oneSig(o) === sig; }) : [];
      others.forEach(function (o) { merged[o.id] = 1; });
      var pre = pages.length > 1 ? [p].concat(others).map(function (x) { return x.line; }).join(', ') + ' · ' : '';
      (isKind(p) ? kindSlides(p, pre) : isOne(p) ? onePages(p, feed, pre, others) : fullSlides(p, pre)).forEach(function (s) { slides.push(s); });
    });
    slides.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(pages, feed) });
    return slides;
  }

  /* ---------- מפה ---------- */
  function xy(p, lat0) { return [p[1] * 111320 * Math.cos(lat0 * Math.PI / 180), p[0] * 110540]; }
  function distToLine(P, line) {
    var best = Infinity;
    for (var i = 0; i + 1 < line.length; i++) {
      var A = line[i], B = line[i + 1], vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx * vx + vy * vy;
      var t = L2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2)) : 0;
      var dx = P[0] - A[0] - t * vx, dy = P[1] - A[1] - t * vy, dd = dx * dx + dy * dy;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  }
  /* נקודות במסלול a שרחוקות מ-b יותר מ-40 מ' — לשם המפה מתמקדת */
  function deviating(a, b) {
    if (a.length < 2 || b.length < 2) return [];
    var lat0 = a[0][0], bxy = b.map(function (p) { return xy(p, lat0); });
    return a.filter(function (p) { return distToLine(xy(p, lat0), bxy) > 40; });
  }

  /* ---------- חלוקת מפה צפופה לשתיים ----------
     מחשבים בהיטל של המפה (Web Mercator) באיזה זום ייכנסו כל התחנות שמשתנות לשטח המפה (760×720),
     וכמה זוגות סמנים יעלו זה על זה. כשיש הרבה — שתי מפות: חצי צפוני/דרומי (או מערבי/מזרחי). */
  var MW = 760, MH = 720, PAD = 56, MK = 27, MAXZ = 17;
  function px(ll, z) {
    var s = 256 * Math.pow(2, z), sin = Math.sin(ll[0] * Math.PI / 180);
    return [s * (ll[1] + 180) / 360, s * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI))];
  }
  function fitZ(lls) {
    var a = lls.map(function (l) { return px(l, 0); });
    var xs = a.map(function (p) { return p[0]; }), ys = a.map(function (p) { return p[1]; });
    var dx = Math.max.apply(null, xs) - Math.min.apply(null, xs), dy = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    var z = Math.min(Math.log2((MW - 2 * PAD) / Math.max(dx, 1e-9)), Math.log2((MH - 2 * PAD) / Math.max(dy, 1e-9)));
    return Math.min(MAXZ, Math.floor(z * 4) / 4);
  }
  function overlaps(lls) {
    if (lls.length < 2) return 0;
    var z = fitZ(lls), a = lls.map(function (l) { return px(l, z); }), n = 0;
    for (var i = 0; i < a.length; i++) for (var j = i + 1; j < a.length; j++)
      if (Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1]) < MK) n++;
    return n;
  }
  /* חלוקה למפות לפי אזורים: תחנות שמשתנות שרחוקות זו מזו יותר מ-PART_GAP — מפה לכל אזור (עד 4; יותר — מאחדים
     את הקרובים). אזור אחד צפוף (10 תחנות ויותר שעולות זו על זו) — שתי מפות, חצי מהתחנות בכל אחת */
  var PART_GAP = 4000;
  function clusters(all, gap) {
    var id = all.map(function (_, i) { return i; });
    var root = function (i) { while (id[i] !== i) i = id[i] = id[id[i]]; return i; };
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      if (dist(all[i].ll, all[j].ll) <= gap) id[root(i)] = root(j);
    }
    var g = {};
    all.forEach(function (s, i) { (g[root(i)] = g[root(i)] || []).push(s); });
    return Object.keys(g).map(function (k) { return g[k]; });
  }
  function splitParts(remS, addS) {
    var all = remS.concat(addS);
    var one = [{ i: 0, name: '', show: null }];
    if (!all.length) return one;
    var gap = PART_GAP, cl = clusters(all, gap);
    while (cl.length > 4) { gap *= 2; cl = clusters(all, gap); }
    var a = all.map(function (s) { return px(s.ll, 0); });
    var xs = a.map(function (p) { return p[0]; }), ys = a.map(function (p) { return p[1]; });
    var vert = (Math.max.apply(null, ys) - Math.min.apply(null, ys)) >= (Math.max.apply(null, xs) - Math.min.apply(null, xs));
    var key = function (s) { return vert ? -s.ll[0] : s.ll[1]; };   // צפון/מערב קודם
    var mid = function (c) { return c.reduce(function (t, s) { return t + key(s); }, 0) / c.length; };
    var mk = function (c) { var o = {}; c.forEach(function (s) { o[s._k + s.code] = 1; }); return o; };
    if (cl.length > 1) {
      cl.sort(function (x, y) { return mid(x) - mid(y); });
      // שם לכל אזור: העיר (כשלכל אזור עיר אחרת), ואחרת צפוני/דרומי (מערבי/מזרחי)
      var city = cl.map(function (c) {
        var n = {}; c.forEach(function (s) { if (s.city) n[s.city] = (n[s.city] || 0) + 1; });
        return Object.keys(n).sort(function (x, y) { return n[y] - n[x]; })[0] || '';
      });
      var byCity = city.every(function (c, i) { return c && city.indexOf(c) === i; });
      var pos = cl.length === 2 ? (vert ? ['החלק הצפוני', 'החלק הדרומי'] : ['החלק המערבי', 'החלק המזרחי']) : null;
      return cl.map(function (c, i) { return { i: i, name: byCity ? 'ב' + city[i] : pos ? pos[i] : 'אזור ' + (i + 1), show: mk(c) }; });
    }
    if (all.length < 10 || overlaps(all.map(function (s) { return s.ll; })) <= 4) return one;
    var sorted = all.slice().sort(function (x, y) { return key(x) - key(y); });
    var half = Math.ceil(sorted.length / 2);
    return [{ i: 0, name: vert ? 'החלק הצפוני' : 'החלק המערבי', show: mk(sorted.slice(0, half)) },
            { i: 1, name: vert ? 'החלק הדרומי' : 'החלק המזרחי', show: mk(sorted.slice(half)) }];
  }

  /* מרחיק סמנים שעולים זה על זה; מחזיר מיקום חדש בפיקסלים לכל סמן */
  function declutter(pts, w, h, inset) {   // inset: [x0, y0, x1, y1] — מפת ההתמצאות (עם מרווח), או null
    for (var it = 0; it < 120; it++) {
      var moved = false;
      for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
        var A = pts[i], B = pts[j], dx = B.x - A.x, dy = B.y - A.y, dd = Math.hypot(dx, dy);
        if (dd < MK) {
          if (dd < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); dd = 1; }
          var push = (MK - dd) / 2 + 0.3;
          A.x -= dx / dd * push; A.y -= dy / dd * push; B.x += dx / dd * push; B.y += dy / dd * push; moved = true;
        }
      }
      pts.forEach(function (p) {
        p.x += (p.x0 - p.x) * 0.03; p.y += (p.y0 - p.y) * 0.03;
        p.x = Math.max(16, Math.min(w - 16, p.x)); p.y = Math.max(16, Math.min(h - 16, p.y));
        // לא מתחת למפת ההתמצאות (בפינה השמאלית העליונה): יוצאים בכיוון הקרוב
        if (inset && p.x > inset[0] && p.x < inset[2] && p.y > inset[1] && p.y < inset[3]) {
          var mv = [[inset[0] - p.x, 0], [inset[2] - p.x, 0], [0, inset[1] - p.y], [0, inset[3] - p.y]].filter(function (v) {
            var x = p.x + v[0], y = p.y + v[1]; return x >= 16 && x <= w - 16 && y >= 16 && y <= h - 16;
          }).sort(function (a, b) { return Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]); })[0];
          if (mv) { p.x += mv[0]; p.y += mv[1]; }
        }
      });
      if (!moved && it > 10) break;
    }
    return pts;
  }

  /* אריחי המפה: כל אריח שנכשל — עוד ניסיון אחד; הבטחה שמתממשת כשאין אריחים בטעינה (או אחרי 12 שניות).
     tilesMissing — כמה אריחים במפות שבדף עדיין חסרים (לא נטענו או נכשלו), כדי לא לייצא מפה חלקית בשקט */
  var TILES = [];
  function tileWait(t) {
    var st = t._lc = { err: {}, tried: {}, again: {}, seen: false };
    TILES.push(t);
    t.on('tileerror', function (e) {
      var k = t._tileCoordsToKey(e.coords);
      if (!st.tried[k]) { st.tried[k] = 1; st.again[k] = 1; setTimeout(function () { if (t._tiles[k]) { t._tiles[k].loaded = 0; e.tile.src = t.getTileUrl(e.coords) + (t.getTileUrl(e.coords).indexOf('?') < 0 ? '?' : '&') + 'r=1'; } }, 500); }
      else { st.err[k] = 1; delete st.again[k]; }
    });
    t.on('tileload', function (e) { var k = t._tileCoordsToKey(e.coords); delete st.err[k]; delete st.again[k]; });
    t.on('tileunload', function (e) { var k = t._tileCoordsToKey(e.coords); delete st.err[k]; delete st.again[k]; });
    t.on('load', function () { st.seen = true; });
    return new Promise(function (res) {
      var t0 = Date.now();
      (function poll() {
        var miss = tileMiss(t), busy = Object.keys(t._tiles || {}).some(function (k) { return !t._tiles[k].loaded || st.again[k]; });
        if ((st.seen && !busy) || Date.now() - t0 > 12000) { res(miss); return; }
        setTimeout(poll, 250);
      })();
    });
  }
  function tileMiss(t) {
    var st = t._lc || { err: {} }, n = 0;
    Object.keys(t._tiles || {}).forEach(function (k) { if (!t._tiles[k].loaded || st.err[k] || st.again[k]) n++; });   // לא נטען / נכשל / בניסיון חוזר
    return n;
  }
  /* root — רק מפות בתוך root (למשל השקפים שנכללים); retry — לטעון מחדש שכבות שחסר בהן משהו */
  function tilesMissing(inc, retry) {
    TILES = TILES.filter(function (t) { return t._map && document.contains(t._map.getContainer()); });
    var n = 0;
    TILES.forEach(function (t) {
      if (inc && !inc(t._map.getContainer())) return;
      var m = tileMiss(t);
      if (m && retry) { t._lc.err = {}; t._lc.tried = {}; t._lc.again = {}; t.redraw(); }
      n += m;
    });
    return n;
  }
  /* מצייר את המפה של שקף (ומפת ההתמצאות הקטנה); מחזיר Promise שמתממש כשהאריחים נטענו או אחרי זמן קצוב */
  function drawMap(slideEl, m) {
    if (m.route) return drawRouteMap(slideEl, m);
    var d = m.d, el = slideEl.querySelector('.smap'), inEl = slideEl.querySelector('.inset');
    var opts = { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false };
    var map = L.map(el, opts);
    map.attributionControl.setPrefix(false);
    var waits = [];
    function tiles(mp) {
      var t = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true });
      waits.push(tileWait(t));
      return t;
    }
    var shown = function (s) { return !m.show || m.show[s._k + s.code]; };
    var remN = m.remS.map(function (s, j) { return { s: s, n: j + 1, k: 'rem' }; });
    var addN = m.addS.map(function (s, j) { return { s: s, n: j + 1, k: 'add' }; });
    var mvN = d.moved.map(function (s, j) { return { s: s, n: j + 1, k: 'mv' }; });
    var marks = remN.concat(addN).filter(function (x) { return shown(x.s); }).concat(m.show ? [] : mvN);
    // מספרי המקטעים (①②…) — בנקודה שבה המסלולים נפרדים
    segments(d).slice(0, SEG_MAX).forEach(function (g) {
      var num = segNum(d, g), at = g.A ? { ll: divergeAt(d, g) } : (g.newS[0] || g.oldS[0]);
      if (num && at && (!m.show || marks.some(function (x) { return dist(x.s.ll, at.ll) < 1500; }))) marks.push({ s: { ll: at.ll }, n: num, k: 'seg' });
    });

    var all = L.latLngBounds([]), focus = L.latLngBounds([]);
    d.old.shape.forEach(function (p) { all.extend(p); });
    d.new.shape.forEach(function (p) { all.extend(p); });
    // סמן של מקטע (①) נכנס לגבולות רק אם הוא ליד תחנה שמשתנה — סמן רחוק לא מרחיק את המפה מהשינוי
    var stopLL = marks.filter(function (x) { return x.k !== 'seg'; }).map(function (x) { return x.s.ll; });
    marks.forEach(function (x) { if (x.k !== 'seg' || !stopLL.length || stopLL.some(function (c) { return dist(c, x.s.ll) < 2500; })) focus.extend(x.s.ll); });
    // שינוי קטן: גם התחנות שלפני ואחרי, והתחנה הקרובה — עם שמות על המפה, כדי שיהיה ברור איפה זה
    var labels = [];
    if ((m.one || small(d)) && !m.show) {
      segments(d).forEach(function (g) {
        [g.A, g.B].concat(g.newS, g.oldS).forEach(function (st) { if (st && st.ll && st.name) labels.push(st); });
      });
      m.remS.forEach(function (st) { if (st._near && !st._near.none) labels.push(st._near); });
      if (m.one) m.remS.concat(m.addS).forEach(function (st) { if (st._to && !labels.some(function (x) { return x.code === st.code; })) labels.push(st); else if (st._to) labels.forEach(function (x, i) { if (x.code === st.code) labels[i] = st; }); });
      // רק מה שקרוב (עד 2.5 ק"מ מתחנה שמשתנה) נכנס לגבולות המפה — כדי שהמפה תתקרב לתחנה
      var core = marks.filter(function (x) { return x.k !== 'seg'; }).map(function (x) { return x.s.ll; });
      labels = labels.filter(function (st) { return !core.length || core.some(function (c) { return dist(c, st.ll) <= 2500; }); });
      labels.forEach(function (st) { focus.extend(st.ll); });
    }
    // קו שמתארך: התחנה שבה הקו התחיל או הסתיים עד היום — תמיד עם שם (גם בשינוי גדול), אם היא בתוך המפה
    if (extOf(d) && !m.show) segments(d).forEach(function (g) { var t = g.ext === 'start' ? g.B : g.ext === 'end' ? g.A : null; if (t && labels.indexOf(t) < 0) labels.push(t); });
    // הקטעים שמשתנים (האדום שהקו כבר לא נוסע בו, והירוק החדש) — כולם בתוך המפה; כשהמפה מחולקת לאזורים —
    // רק הקטעים שעוברים ליד התחנות של האזור הזה
    var core0 = marks.map(function (x) { return x.s.ll; }), chgRuns = [];
    (d.var === 'new' ? [] : realRuns(d, 'old')).concat(extOf(d) ? extPart(d) : d.var === 'end' ? [] : realRuns(d, 'new')).forEach(function (r) {
      if (m.show && !r.some(function (p) { return core0.some(function (c) { return dist(c, p) <= 1500; }); })) return;
      chgRuns.push(r);
      r.forEach(function (p) { focus.extend(p); });
    });
    if (!focus.isValid()) chgPts(d).forEach(function (p) { focus.extend(p); });
    if (!focus.isValid()) focus = all;
    map.fitBounds(focus, { paddingTopLeft: [PAD, PAD], paddingBottomRight: [PAD, PAD], maxZoom: MAXZ });
    // מפת ההתמצאות: בפינה שבה היא מסתירה הכי מעט ממה שמשתנה (סמנים, הקטע האדום והירוק). אם בכל הפינות היא
    // מסתירה משהו — קטנה יותר, ואם גם זה לא מספיק — מרחיקים את המפה הגדולה מהפינה (שוליים גדולים יותר בצד שלה)
    var INSET = null;
    if (inEl) {
      var place = function () {
        var sz = map.getSize(), pts0 = core0.map(function (ll) { return map.latLngToContainerPoint(ll); });
        chgRuns.forEach(function (r) { r.forEach(function (p) { pts0.push(map.latLngToContainerPoint(p)); }); });
        var best = null;
        [[190, 142], [150, 112]].forEach(function (wh) {
          if (best && !best.n) return;
          var w = wh[0], h = wh[1];
          [[14, 14], [sz.x - w - 14, 14], [14, sz.y - h - 44], [sz.x - w - 14, sz.y - h - 30]].forEach(function (c, ci) {
            var r = [c[0] - 12, c[1] - 12, c[0] + w + 12, c[1] + h + 12];
            var n = pts0.filter(function (p) { return p.x > r[0] && p.x < r[2] && p.y > r[1] && p.y < r[3]; }).length;
            // בשוויון — הפינה שהכי רחוקה ממה שמשתנה
            var gap = Math.min.apply(null, pts0.map(function (p) { return Math.hypot(Math.max(r[0] - p.x, 0, p.x - r[2]), Math.max(r[1] - p.y, 0, p.y - r[3])); }).concat([1e4]));
            if (!best || n < best.n || (n === best.n && gap > best.gap + 20)) best = { n: n, gap: gap, x: c[0], y: c[1], w: w, h: h, top: ci < 2 };
          });
        });
        return best;
      };
      var ip = place(), fx = parseFloat(inEl.getAttribute('data-fx')), fy = parseFloat(inEl.getAttribute('data-fy'));
      if (!isNaN(fx) && !isNaN(fy)) {   // המשתמש גרר את מפת ההתמצאות (edits.inset, אחוזים מגודל המפה)
        var msz0 = map.getSize();
        ip.x = Math.max(0, Math.min(msz0.x - ip.w, fx * msz0.x / 100)); ip.y = Math.max(0, Math.min(msz0.y - ip.h - 22, fy * msz0.y / 100)); ip.n = 0;
      }
      if (ip.n) {
        var extra = ip.h + 28;
        map.fitBounds(focus, { paddingTopLeft: [PAD, ip.top ? extra : PAD], paddingBottomRight: [PAD, ip.top ? PAD : extra], maxZoom: MAXZ });
        var ip2 = place();
        if (ip2.n <= ip.n) ip = ip2;
      }
      inEl.style.left = ip.x + 'px'; inEl.style.top = ip.y + 'px'; inEl.style.width = ip.w + 'px'; inEl.style.height = ip.h + 'px';
      if (!inEl.classList.contains('inoff')) INSET = [ip.x - 14, ip.y - 14, ip.x + ip.w + 14, ip.y + ip.h + 14];
    }
    tiles(map).addTo(map);
    // הישן המקווקו מתחת לחדש: איפה שהמסלולים זהים רואים רק כחול, והאדום מופיע רק איפה שהקו כבר לא עובר
    // רק הקטעים שהקו כבר לא נוסע בהם — לא מתחת לקו החדש, כדי שלא ייראה כאילו משהו בוטל במקום שהקו ממשיך לנסוע בו
    if (!extOf(d) && d.var !== 'new') realRuns(d, 'old').forEach(function (r) { L.polyline(r, { color: '#b8361f', weight: 5, dashArray: '9 8', opacity: 1, interactive: false }).addTo(map); });
    // המסלול החדש בירוק; כשהדרך לא משתנה — כחול-אפור ניטרלי (רק התחנה משתנה). קו שמתארך: כל המסלול אפור, והקטע החדש בירוק
    var ext = extOf(d);
    // חלופה חדשה: מסלול הקו (שלא משתנה) אפור, והדרך של החלופה בירוק רק איפה שהיא שונה. חלופה שבוטלה: הדרך שנשארה אפורה
    if (d.var === 'new' && d.old.shape.length > 1) L.polyline(d.old.shape, { color: '#5f7d96', weight: 6, opacity: .92, interactive: false }).addTo(map);
    // צבעי המסלול (ED.rc): 'chg' (ברירת המחדל) — המסלול שלא השתנה אפור-כחול, ורק הקטעים החדשים באמת בירוק;
    // 'all' — כל המסלול החדש בירוק (כמו קודם)
    if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: allGreen(d) && !d.var ? '#1f9152' : '#5f7d96', weight: 6, opacity: .92, interactive: false }).addTo(map);
    if ((rerouted(d) && !ext && !allGreen(d) && d.var !== 'end') || d.var === 'new') realRuns(d, 'new').forEach(function (r) { L.polyline(r, { color: '#1f9152', weight: 7, opacity: 1, interactive: false }).addTo(map); });
    if (ext) extPart(d).forEach(function (r) { L.polyline(r, { color: '#1f9152', weight: 7, opacity: 1, interactive: false }).addTo(map); });
    var changed = {};
    d.added.concat(d.removed).forEach(function (c) { changed[c] = 1; });
    d.new.stops.forEach(function (s) {
      if (!changed[s.code]) L.circleMarker(s.ll, { radius: 4.5, color: '#55625c', weight: 2.5, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map);
    });
    // מכל תחנה שמבוטלת — קו מנוקד דק אל התחנה הקרובה במסלול החדש
    m.remS.forEach(function (s) {
      // קו ישר (הדרך ברגל עוברת ברחובות של הקו ומתערבבת עם הירוק והאדום); זמן ההליכה האמיתי — ברשימה ובהסבר
      if (shown(s) && s._near && !s._near.none) L.polyline([s.ll, s._near.ll], { color: '#13201b', weight: 2, dashArray: '2 5', opacity: .75, interactive: false }).addTo(map);
    });
    // קו שמתארך: איפה הקו התחיל או הסתיים עד היום
    var wasEnd = {};
    if (ext) segments(d).forEach(function (g) {
      if (g.ext === 'start' && g.B) wasEnd[g.B.code] = 'עד היום הקו התחיל כאן';
      if (g.ext === 'end' && g.A) wasEnd[g.A.code] = 'עד היום הקו הסתיים כאן';
    });
    var seen = {}, chgCode = {};
    m.remS.concat(m.addS).forEach(function (s) { chgCode[s.code] = 1; });
    // תוויות בלי חפיפה: לכל תווית מנסים מעל, מתחת, ימינה ושמאלה מהתחנה; אם אין מקום פנוי — מוותרים עליה
    // (גם לא על סמן ממוספר). התוויות של "עד היום הקו התחיל כאן" — קודם
    var boxes = marks.map(function (x) { var c = map.latLngToContainerPoint(x.s.ll); return [c.x - 13, c.y - 13, c.x + 13, c.y + 13]; });
    var hit = function (b) { return boxes.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; }); };
    var msz = map.getSize();
    if (INSET) boxes.push(INSET);   // מפת ההתמצאות
    labels.slice().sort(function (a, b) { return (wasEnd[b.code] ? 1 : 0) - (wasEnd[a.code] ? 1 : 0); }).forEach(function (st) {
      var k = st.name + st.ll.join(',');
      if (seen[k]) return; seen[k] = 1;
      var was = wasEnd[st.code], c = map.latLngToContainerPoint(st.ll);
      var w = Math.max(String(st.name).length, was ? 18 : 0, chgCode[st.code] ? 12 + (st._to ? st._to.length + 3 : 0) : 0) * 7 + 20, h = was || chgCode[st.code] ? 38 : 24, g = 15;
      var opts2 = [
        { dir: 'top', off: [0, -g], b: [c.x - w / 2, c.y - g - h, c.x + w / 2, c.y - g] },
        { dir: 'bottom', off: [0, g], b: [c.x - w / 2, c.y + g, c.x + w / 2, c.y + g + h] },
        { dir: 'right', off: [g, 0], b: [c.x + g, c.y - h / 2, c.x + g + w, c.y + h / 2] },
        { dir: 'left', off: [-g, 0], b: [c.x - g - w, c.y - h / 2, c.x - g, c.y + h / 2] }
      ].filter(function (o) { return o.b[0] >= 2 && o.b[1] >= 2 && o.b[2] <= msz.x - 2 && o.b[3] <= msz.y - 2; });
      var pick = opts2.filter(function (o) { return !hit(o.b); })[0];
      if (!pick) return;
      boxes.push(pick.b);
      L.tooltip({ permanent: true, direction: pick.dir, offset: pick.off, className: 'lc-lbl' + (was ? ' was' : ''), interactive: false }).setLatLng(st.ll)
        .setContent(E(st.name) + (was ? '<small>' + was + '</small>' : '') + (chgCode[st.code] ? '<small class="cd">מק״ט ' + E(st.code) + (st._to ? ' · ' + E(st._to) : '') + '</small>' : '')).addTo(map);
    });
    // סמנים ממוספרים: מרחיקים כאלה שעולים זה על זה, עם קו קצר אל המקום האמיתי
    var size = map.getSize();
    var pts = marks.map(function (x) { var c = map.latLngToContainerPoint(x.s.ll); return { x: c.x, y: c.y, x0: c.x, y0: c.y, m: x }; });
    declutter(pts, size.x, size.y, INSET);
    var col = { rem: '#b8361f', add: '#0a5530', mv: '#55625c', seg: '#13201b' };
    pts.forEach(function (p) {
      var at = map.containerPointToLatLng([p.x, p.y]);
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 5) {
        L.polyline([p.m.s.ll, at], { color: '#13201b', weight: 1.5, opacity: .8, interactive: false }).addTo(map);
        L.circleMarker(p.m.s.ll, { radius: 3.5, color: '#fff', weight: 1.5, fillColor: col[p.m.k], fillOpacity: 1, interactive: false }).addTo(map);
      }
    });
    pts.forEach(function (p) {
      var at = map.containerPointToLatLng([p.x, p.y]);
      L.marker(at, { icon: L.divIcon({ className: '', html: '<div class="lc-mk ' + p.m.k + '">' + p.m.n + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: p.m.k === 'seg' ? 1200 : p.m.k === 'add' ? 1000 : 900, interactive: false, keyboard: false }).addTo(map);
    });

    // מפת התמצאות: כל המסלול, ומלבן סביב האזור שבמפה הגדולה
    if (inEl && all.isValid()) {
      var view = map.getBounds();
      // רק כשהמפה הגדולה לא מראה את כל המסלול
      if (!view.pad(0.03).contains(all)) {
        var mini = L.map(inEl, Object.assign({}, opts, { attributionControl: false }));
        mini.fitBounds(all.extend(view), { padding: [10, 10] });
        tiles(mini).addTo(mini);
        if (!ext) realRuns(d, 'old').forEach(function (r) { L.polyline(r, { color: '#b8361f', weight: 2, dashArray: '4 4', interactive: false }).addTo(mini); });
        if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: allGreen(d) ? '#1f9152' : '#5f7d96', weight: 2.5, interactive: false }).addTo(mini);
        if (rerouted(d) && !ext && !allGreen(d)) realRuns(d, 'new').forEach(function (r) { L.polyline(r, { color: '#1f9152', weight: 3, interactive: false }).addTo(mini); });
        if (ext) extPart(d).forEach(function (r) { L.polyline(r, { color: '#1f9152', weight: 3, interactive: false }).addTo(mini); });
        L.rectangle(view, { color: '#13201b', weight: 2, fillColor: '#f2c14e', fillOpacity: .35, interactive: false }).addTo(mini);
        // כשהמסלול ארוך המלבן קטן מאוד — עיגול צהוב סביבו כדי שיראו איפה זה
        L.circleMarker(view.getCenter(), { radius: 9, color: '#13201b', weight: 2.5, fillColor: '#f2c14e', fillOpacity: .9, interactive: false }).addTo(mini);
      } else inEl.remove();
    }
    return { map: map, ready: Promise.all(waits) };
  }

  /* הטקסט שנוצר אוטומטית, כטקסט רגיל — לשדות העריכה */
  function drafts(pages) {
    pages.forEach(function (p) { p.dirs.forEach(function (d, di) { d._key = p.id + '-' + di; }); });
    var cover = (pages.length <= 3 ? coverItems(pages) : []).map(plain);
    var segs = [];
    pages.forEach(function (p) {
      p.dirs.forEach(function (d) {
        var g = segments(d).slice(0, SEG_MAX);
        if (g.length) segs.push({ key: d._key, label: (pages.length > 1 ? 'קו ' + p.line + ' · ' : '') + 'מפה · ' + trip(d), items: g.map(function (x) { return plain(x.html); }) });
      });
    });
    return { cover: cover, segs: segs, hasCover: pages.length <= 3 };
  }
  /* צבעי המפעיל לפי מספר החברה ב-GTFS (agency_id). הראשון — הצבע העיקרי, השני — משני.
     מקור: fleet/index.html COLORS — לעדכן ביחד */
  var COLORS={3:['#009B4E'],4:['#8DB43A','#0C8454'],5:['#00539B'],6:['#C2B70C','#14A651'],7:['#E42424','#8A8F98'],8:['#A61E22','#3C3C3C'],10:['#E53935'],
    14:['#E8590C','#9AA0A6'],15:['#F7840C'],16:['#0C546C','#12B5B0'],18:['#0C246C','#9CCB3B'],21:['#0C8484','#E42424'],23:['#129FD6','#C8C80C'],
    24:['#6CB424','#E53935'],25:['#0C84CC'],31:['#2F6DB5'],32:['#6A9BD8'],33:['#0C6CB4','#8A8F98'],34:['#2BA88C','#1A8CB4'],35:['#E09A4F','#8A8F98'],
    37:['#0C9CE4','#F28C28','#3C4A4A'],38:['#F28C28','#0C9CE4','#3C4A4A'],39:['#0B3A6E'],42:['#1E8A4C'],44:['#3C6CCC'],49:['#3BA56B'],50:['#5BB57F'],135:['#2E9467','#24549C','#8CB4DC']};
  // חברות קטנות שאין להן צבע קבוע: גוונים אפורים שונים, כדי שלא ייראו כמו אחת הגדולות
  // חברות בלי צבע קבוע — אפורים (גם מ-fleet/index.html)
  var PALETTE=['#64748B','#7C6F64','#5B6B7F','#706A8A','#5F7563','#6B7280','#80646C','#4B5563'];
  function hex(c) { return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); }); }
  function toHex(a) { return '#' + a.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
  function lum(c) { var a = hex(c).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function shade(c, k) { return toHex(hex(c).map(function (v) { return v * k; })); }
  function tint(c, k) { return toHex(hex(c).map(function (v) { return v + (255 - v) * k; })); }
  function agOf(p) { return p.ag || (p.dirs && p.dirs[0] && p.dirs[0].ag) || ''; }
  /* "צבעי המפעיל": שלט הקו בצבע העיקרי, קו מתאר וקצה הכרטיסים בצבע המשני, פס הכותרת בגוון כהה של העיקרי.
     טקסט על הצבע — לבן או כהה, מה שנותן ניגודיות של 4.5 לפחות */
  function lookVars(look, pages) {
    if (look !== 'op') return '';
    var ags = []; pages.forEach(function (p) { var a = String(agOf(p)); if (ags.indexOf(a) < 0) ags.push(a); });
    var cs = ags.length === 1 && COLORS[ags[0]] ? COLORS[ags[0]] : [PALETTE[ags.length === 1 ? (parseInt(ags[0], 10) || 0) % PALETTE.length : 0]];
    var c = cs[0], c2 = cs[1] || cs[0];
    var on = contrast(c, '#ffffff') >= 4.5 ? '#ffffff' : '#14201b';
    var band = shade(c, 0.42), k = 0.42;
    while (contrast(band, '#ffffff') < 7 && k > 0.1) { k -= 0.04; band = shade(c, k); }
    return '--s-brand:' + c + ';--s-on-brand:' + on + ';--s-brand2:' + c2 + ';--s-band:' + band + ';--s-band2:' + shade(c, Math.min(0.62, k + 0.14)) +
      ';--s-band-fg:#ffffff;--s-band-sub:' + tint(c, 0.7);
  }
  function smallOf(p) { prep(p); return smallInfo(p); }
  function deckTitle(pages) {
    if (pages && pages.length && pages.every(isCur)) {
      var ods = []; pages.forEach(function (p) { var o = p.od || [], t = o[0] && o[0] === o[1] ? 'קו ' + p.line + ' · ' + o[0] : LC.od(o) || o[0] || ''; if (t && ods.indexOf(t) < 0) ods.push(t); });
      return 'לו״ז עדכני' + (ods.length === 1 ? ' · ' + ods[0] : ' · ' + linesTxt(pages));
    }
    return pages && pages.length ? autoTitle(pages, '') : '';
  }
  /* המבנה של "טבלה לפי יעד" — לייצוא לאקסל (edits: btitle, bnote, bplace) */
  /* הודעה על שינוי, "טבלה לפי יעד": הקווים שהלו"ז שלהם משתנה (וקווים חדשים) — כמו לו"ז עדכני, עם הלוח החדש מיום השינוי.
     לכל יום: השעות החדשות (days), הסימונים מול הלוח הקודם (mk — mergeSh), וימים בלי שינוי (same — אין שעות בנתונים) */
  function chgBdPages(pages) {
    return pages.filter(ttCap).map(function (p) {
      var q = { id: p.id, makat: p.makat, line: p.line, op: p.op, ag: agOf(p), feed: p.feed, valid: start(p), eff: start(p), until: '', chg: p.kind, od: p.od, hol: [] };
      q.dirs = mtDirs(p).map(function (d) {
        var S = (d.new && d.new.stops.length ? d.new : d.old).stops, s0 = S[0] || {}, cs = [];
        S.forEach(function (x) { if (x.city && cs.indexOf(x.city) < 0) cs.push(x.city); });
        var x = { dir: String(d.dir || d.rd || ''), od: d.od || p.od, f: s0.name || '', fc: s0.code || '', cs: cs, t: streetOf(lastStop(d)), ag: d.ag, days: [], mk: [], same: [] };
        for (var w = 0; w < 7; w++) {
          var m = mtDay({ p: p, d: d }, w);
          x.days[w] = m.k === 'c' || m.k === 'n' || m.k === 'k' ? (m.e.n || []).slice() : [];
          x.mk[w] = m.k === 'c' && p.kind !== 'new' ? mergeSh(m.e.o || [], m.e.n || []) : [];
          x.same[w] = m.k === 's' ? 1 : 0;
        }
        return x;
      });
      return q;
    }).filter(function (q) { return q.dirs.length; });
  }
  function chgBoardModel(pages, edits) { return boardModel(chgBdPages(pages), edits); }
  /* המצגת במצב "טבלה לפי יעד": שער, הלוח (הקווים שהלו"ז שלהם משתנה), ואחריו הקווים שמשתנים רק במסלול — כמו היום, וסיום */
  function chgBoardBuild(pages, city, feed) {
    var bp = chgBdPages(pages), rest = pages.filter(function (p) { return !ttCap(p); }), form = ED.form || 'deck';
    var bs = bdSlides(bp, form);
    if (form === 'sign') return bs.concat(rest.length ? signPages(rest, feed) : []);
    if (form === 'status') return bs.concat(rest.length ? statusPages(rest) : []);
    var slides = [{ id: 'cover', label: 'שער', html: cover(pages, city) }].concat(bs);
    // קו חדש: המפה, המפות הקרובות והתחנות נשארים במצגת — השעות שלו בלוח
    pages.filter(function (p) { return p.kind === 'new' && ttCap(p); }).forEach(function (p) {
      kindSlides(p, pages.length > 1 ? p.line + ' · ' : '', true).forEach(function (x) { slides.push(x); });
    });
    rest.forEach(function (p) {
      var pre = pages.length > 1 ? p.line + ' · ' : '';
      (isKind(p) ? kindSlides(p, pre) : isOne(p) ? onePages(p, feed, pre) : fullSlides(p, pre)).forEach(function (x) { slides.push(x); });
    });
    slides.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(pages, feed) });
    return slides;
  }
  function boardModel(pages, edits, xo) { var keep = ED; ED = edits || {}; try { return bdModel(pages, xo); } finally { ED = keep; } }
  /* לאקסל — לו"ז חדש בהודעה על שינוי (שינוי בלו"ז, קו חדש): אותו מבנה כמו "טבלה לפי יעד" (ראו xlsx.js).
     old=false — הלוח החדש מיום השינוי (שעה חדשה או שזזה — בירוק); old=true — הלוח הקודם (שעה שמתבטלת או שזזה — באדום).
     ימים עם אותו לוח בכל השורות — עמודה אחת; חג בשבוע של השינוי — עמודה משלו */
  var MT_COL = ['#0f766e', '#c2410c', '#6d28d9', '#1d4ed8', '#a16207', '#be185d'];
  function chgModel(pages, edits, old) {
    var keep = ED; ED = edits || {};
    try {
      var ps = pages.filter(ttCap), groups = mtGroups(ps), all = [];
      groups.forEach(function (g) { all = all.concat(g.rows); });
      var day = function (r, w) {   // [רשימת שעות או null, סימונים] ליום w
        var x = mtDay(r, w);
        if (x.k === 'c') { var it = mergeSh(x.e.o || [], x.e.n || []); return { list: old ? x.e.o || [] : x.e.n || [], mk: it }; }
        if (x.k === 'n' || x.k === 'k') return { list: x.e.n || [] };
        if (x.k === 's') return { same: true };
        return { list: [] };
      };
      var sig = {}, order = [];
      for (var w = 0; w < 7; w++) {
        var k = all.map(function (r) { var d = day(r, w); return d.same ? 's' : d.list.join(','); }).join('|');
        if (all.every(function (r) { var d = day(r, w); return !d.same && !d.list.length; })) continue;
        if (!sig[k]) { sig[k] = []; order.push(k); }
        sig[k].push(w);
      }
      var cols = order.map(function (k) {
        var ds = sig[k], kk = ds.join(',');
        return { days: ds, label: kk === '0,1,2,3,4' ? 'ימים א׳–ה׳' : kk === '5' ? 'יום שישי' : kk === '6' ? 'מוצ״ש' : ds.length === 1 ? 'יום ' + dShort(ds) : dShort(ds) };
      });
      if (!old) (ED.hol || []).forEach(function (h) { if (all.some(function (r) { return r.d.hx && r.d.hx[h[0]]; })) cols.push({ days: [isoDow(h[0])], hol: h, label: h[2] + ' ' + LC.dm(h[0]) }); });
      var cell = function (r, c) {
        if (c.hol && r.d.hx && r.d.hx[c.hol[0]]) return { ents: r.d.hx[c.hol[0]].map(function (m) { return { t: hm2(m), n: 1 }; }), notes: [] };
        var d = day(r, c.days[0]);
        if (d.same) return { ents: [], notes: [], txt: 'ללא שינוי' };
        var hl = {};
        (d.mk || []).forEach(function (x) {
          if (old) { if (x[1] === 'rm') hl[x[0]] = 1; else if (x[1] === 'sh') hl[x[2]] = 1; }
          else if (x[1] === 'ad' || x[1] === 'sh') hl[x[0]] = 1;
        });
        var cnt = {}; d.list.forEach(function (m) { cnt[m] = (cnt[m] || 0) + 1; });
        var seen = {};
        return { ents: d.list.filter(function (m) { if (seen[m]) return false; seen[m] = 1; return true; }).map(function (m) { return { t: hm2(m), n: cnt[m], c: hl[m] ? (old ? 'C81E1E' : '1F9152') : '' }; }), notes: [] };
      };
      var first = function (d) { var st = (old ? d.old : d.new.stops.length ? d.new : d.old).stops; return st[0] || {}; };
      var bands = groups.map(function (g) {
        return { label: g.label, color: MT_COL[g.c % MT_COL.length], rows: g.rows.map(function (r) {
          var o = r.d.od || [], to = o[1] && o[1] !== o[0] ? o[1] : streetOf(lastStop(r.d)), s0 = first(r.d);
          return { p: r.p, off: false, line: r.p.line, op: r.p.op, origin: mtFrom(r.d), toward: to ? 'לכיוון ' + to : '',
            comment: (to ? 'לכיוון ' + to + ': ' : '') + (s0.name || '') + ' (' + [s0.code, s0.city].filter(Boolean).join(' | ') + ')',
            cells: cols.map(function (c) { return cell(r, c); }) };
        }) };
      });
      var when = ps.map(start).sort()[0] || '', ops = opsOf(ps);
      var title = (old ? 'לו״ז עד ' + (when ? LC.dmy(LC.addDays(when, -1)) : 'השינוי') : 'לו״ז חדש') + ' · ' + linesTxt(ps);
      var sub = old ? 'לוח הזמנים הקודם — לפני השינוי' : when ? 'בתוקף מ-' + LC.dmy(when) : '';
      return { title: title, sub: sub, subDflt: null, cols: cols, bands: bands, pages: ps, credit: ED.credit !== false,
        note: old ? 'באדום — נסיעה שמתבטלת או שהשעה שלה משתנה' : ps.some(function (p) { return p.kind === 'timetable'; }) ? 'בירוק — נסיעה חדשה או בשעה חדשה' : '',
        legend: 'השעות הן שעות היציאה מהתחנה הראשונה · ×2 — שני אוטובוסים · לפי נתוני משרד התחבורה · לא פרסום רשמי',
        contacts: ops.map(function (o) { return [o, bdPhone(o)]; }).filter(function (x) { return x[1]; }).concat([['משרד התחבורה', MOT]]),
        feed: ps.map(function (p) { return p.feed; }).filter(Boolean).sort().pop() || '', when: when, tord: ED.tord || 'rtl' };
    } finally { ED = keep; }
  }
  /* "טבלה משולבת" אפשרית? רק כשיש לפחות שני קווים לאותו יעד (כמו הקיבוץ בטבלה: לו"ז עדכני — cuGroups, הודעה על שינוי — mtGroups) */
  function combOk(pages) {
    var cu = pages.length && pages.every(isCur), by = {};
    return (cu ? pages : pages.filter(ttCap)).some(function (p) {
      var o = p.od || [], k = o[0] && o[1] && (!cu || o[0] !== o[1]) ? [o[0], o[1]].sort().join('|') : '';
      if (!k) return false;
      by[k] = (by[k] || 0) + 1;
      return by[k] > 1;
    });
  }
  function hasOld(pages) { return pages.some(function (p) { return p.kind === 'timetable' && ttCap(p); }); }
  // לבדיקות (tests/line-changes-units.test.mjs): פונקציות פנימיות — לא בשימוש בדף
  var _test = { bdWkSplit: bdWkSplit, realRuns: realRuns, offRuns: offRuns, cuMerge: cuMerge, dShort: dShort, hm2: hm2, noNear: noNear, remCols: remCols };
  return { combOk: combOk, boardFit: function () { return BOARD_FIT; }, chgBoardModel: chgBoardModel, _test: _test, tilesMissing: tilesMissing, setPhones: setPhones, fmtPhone: fmtPhone, boardModel: boardModel, chgModel: chgModel, hasOld: hasOld, ttCap: ttCap, signInfo: function () { return SIGN_INFO; }, ttCount: ttCount, ttOne: ttOne, ttSmall: ttSmall, deckTitle: deckTitle, FORMS: FORMS, geoChanged: geoChanged, smallInfo: smallOf, lookVars: lookVars, drafts: drafts, build: build, drawMap: drawMap, autoIntro: autoIntro, autoTitle: autoTitle, deviating: deviating };
})();
