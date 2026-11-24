/* מצגת לשינוי בקו — בניית השקפים מנתוני השינוי (data/l/<id>.json).
   כל שקף הוא קנבס 1280×720; התצוגה המקדימה מקטינה אותו, וההדפסה (PDF) מדפיסה אותו בגודל מלא.
   סדר השקפים, כמו במצגות שהוכנו ביד: שער · (סקירה, כשיש כמה קווים) · לכל כיוון נסיעה: מפה ותחנות · סיום.
   הטקסט בשקפים — בשפה של נוסעים: בלי מק"ט, כיוון, חלופה או GTFS.
   הקוד מחולק לכמה קבצים, שנטענים לפי הסדר (LCDeckLoad ב-index.html): deck.js — הבסיס (עזרים, שקפי המצגת, לוחות זמנים,
   build); deck-sign.js — שלט A4 ותמונה לסטטוס; deck-board.js — "טבלה לפי יעד" (לוח מודעות); deck-maps.js — ציור המפות (Leaflet).
   מה שמשותף לכמה קבצים — ב-LCDeck._in (בקוד: D), כולל ED ועוד כמה ערכים שמשתנים בכל בנייה. */
var LCDeck = (function () {
  var D = {};   // המקום המשותף לקבצים של המצגת (LCDeck._in): כל קובץ מוסיף לו את מה שהאחרים צריכים
  var E = LC.esc;
  /* מצגת באנגלית (ED.blang === 'en', שלמה 24.11): השער, הסקירה, שקף המפה, הסיום והמקרא — באנגלית ומשמאל לימין.
     הטקסטים והעזרים ב-deck-en-a.js (LCDeckEN.a_*); tx(מפתח, עברית) — האנגלית או העברית כמו שהייתה */
  function EN() { return !!(D.ED && D.ED.blang === 'en' && window.LCBoardEN && window.LCDeckEN && window.LCDeckEN.a_T); }
  function tx(k, he) { return EN() ? window.LCDeckEN.a_T[k] : he; }
  function enRoot(cls) { return EN() ? cls + ' en" dir="ltr" lang="en' : cls; }   // class="..." של השקף: באנגלית — גם dir ו-lang
  function enN(s) { return EN() ? window.LCDeckEN.a_nm(s) : s; }   // שם של תחנה/עיר — מתרגומי משרד התחבורה
  function enOp(o) { return EN() ? window.LCDeckEN.a_op(o) : o; }
  function enLn(l) { return EN() ? window.LCDeckEN.a_ln(l) : l; }
  function enOd(o) { return EN() ? window.LCDeckEN.a_od(o) : LC.od(o); }
  function enWd(iso, long) { return EN() ? window.LCDeckEN.a_wd(iso, long) : LC.wd(iso); }
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
  function altTxt(d) { return (d.alt && d.alt !== '#' && d.alt !== '0') ? (ENb() ? XB.b_alt : ' (בחלק מהנסיעות)') : ''; }
  /* שקפים באנגלית (לוח באנגלית — ED.blang, שלמה 24.11): המשפטים על המסלול והתחנות — deck-en-b.js (LCDeckEN.b_*).
     השמות — מתרגומי משרד התחבורה (LCBoardEN.name); שם בלי תרגום נשאר בעברית ונרשם ב-LCDeckEN.b_miss */
  var XB = null, EN_ED = null, EN_IX = null, EN_ST = {};
  function ENb() { return D.ED.blang === 'en' && !!window.LCBoardEN && !!window.LCDeckEN && !!window.LCDeckEN.b_ok && !!(XB = window.LCDeckEN); }
  function enIx() { if (EN_ED !== D.ED) { EN_ED = D.ED; EN_IX = window.LCBoardEN.index(D.ED.en); EN_ST = {}; XB.b_miss = {}; } return EN_IX; }
  function enT(s, miss) { return window.LCBoardEN.name(s, enIx(), D.ED.ben, miss === false ? null : XB.b_miss); }
  function Eb(s) { var h = E(s); return ENb() && /[א-ת]/.test(s) ? '<bdi>' + h + '</bdi>' : h; }   // שם בלי תרגום (עברית) בתוך משפט באנגלית — מבודד
  function nE(s) { return ENb() && s ? enT(s) : s; }   // שם של תחנה, עיר או יעד
  function sN(st) { return st && ENb() ? (st.en || enT(st.name)) : st && st.name; }   // שם של תחנה (אובייקט)
  /* רחוב מתוך שם תחנה, באנגלית: מתרגמים את כל שם התחנה ולוקחים את אותו חלק ("Herzl/Weizmann" → Herzl). בלי תרגום — עברית, ונרשם */
  function stPick(name) {
    var parts = String(name || '').split('/').map(function (x) { return x.trim(); });
    return parts[1] && PLACE.test(parts[0]) && !PLACE.test(parts[1]) && !/^(רציפים|רציף|הורדה|איסוף|יציאה|כניסה)/.test(parts[1]) ? 1 : 0;
  }
  function stEnOf(st) {
    var full = st.en || enT(st.name, false), he = streetOf(st.name);
    if (full && full !== st.name) {
      var ep = String(full).split('/').map(function (x) { return x.trim(); }), t = ep[stPick(st.name)] || ep[0];
      t = t.replace(/^(Derech|Rehov|Rechov|Rehob)\s+/i, '').replace(/\s+\d+[a-z]?$/i, '').trim();
      if (t) return t;
    }
    var t2 = enT(he, false);
    return t2 !== he ? t2 : null;
  }
  function noteSt(t, s) { enIx(); var k = skey(t); if (!EN_ST[k]) EN_ST[k] = { s: s }; }
  function stE(t) {   // רחוב (כמו ש-streets() מחזיר) → אנגלית
    enIx();
    var r = EN_ST[skey(t)];
    if (r && !('en' in r)) r.en = stEnOf(r.s);
    if (r && r.en) return r.en;
    if (r) XB.b_miss[r.s.name] = 1; else return enT(t);
    return t;
  }
  function plural(n, one, many) { return n === 1 ? one : n + ' ' + many; }
  function dist(a, b) { var cl = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * cl); }

  /* שם לנסיעה בשפה של נוסעים: "מקרית גת לחצור הגלילית"; קו מעגלי — "הקו" */
  // "ת. מרכזית אשדוד" → "התחנה המרכזית אשדוד", כדי שייקרא "מהתחנה המרכזית" ולא "מת. מרכזית"
  function firstStreet(d) { var st = (d.new.stops[0] || d.old.stops[0]); if (st && ENb()) { noteSt(streetOf(st.name), st); return stE(streetOf(st.name)); } return st ? streetOf(st.name).replace(/^ת\.\s*מרכזית/, 'התחנה המרכזית').replace(/^תחנה מרכזית/, 'התחנה המרכזית') : ''; }
  function trip(d) {
    var o = d.od || [], A = endName(d, 0), B = endName(d, 1);
    if (ENb()) return XB.b_trip(nE(o[0]), nE(o[1]), A, B, !!(A && B && skey(endName(d, 0, true)) === skey(endName(d, 1, true))));
    if (!o[0] || !o[1] || o[0] === o[1]) {
      // קו בתוך העיר: מאיפה לאן (התחנה הראשונה והאחרונה); קו מעגלי — רק מאיפה
      if (A && B && skey(A) !== skey(B)) return 'הקו ב' + o[0] + ', מ' + A + ' ל' + B;
      return 'הקו' + (o[0] ? ' ב' + o[0] : '') + (A ? ', מ' + A : '');
    }
    return 'מ' + o[0] + ' ל' + o[1];
  }
  function toward(d) {
    var o = d.od || [], B = endName(d, 1);
    if (ENb()) return !o[0] || !o[1] || o[0] === o[1] ? XB.b_toward(B && skey(endName(d, 1, true)) !== skey(endName(d, 0, true)) ? B : '', firstStreet(d)) : XB.b_toward(nE(o[1]));
    if (!o[0] || !o[1] || o[0] === o[1]) return B && skey(B) !== skey(endName(d, 0)) ? 'בנסיעה ל' + B : (firstStreet(d) ? 'בנסיעה מ' + firstStreet(d) : 'בקו');
    return 'בנסיעה ל' + o[1];
  }
  /* שם קצר לתחנה הראשונה (0) או האחרונה (1) במסלול החדש: "ת. מרכזית אשדוד/רציפים" → "התחנה המרכזית אשדוד", "רכבת/מסוף" → "הרכבת" */
  function endName(d, last, he) {
    var S = d.new.stops.length ? d.new.stops : d.old.stops, st = last ? S[S.length - 1] : S[0];
    if (!st) return '';
    var t = String(st.name).split('/')[0].trim();
    if (!he && ENb()) {   // באנגלית: החלק הראשון של השם המתורגם ("Ashdod Central Station/Platforms" → "Ashdod Central Station")
      if (/^(ת\.\s*מרכזית|תחנה מרכזית|רכבת|ת\. רכבת|תחנת רכבת)/.test(t)) { var f = st.en || enT(st.name, false); if (f && f !== st.name) return String(f).split('/')[0].trim(); return enT(st.name); }
      noteSt(streetOf(st.name), st); return stE(streetOf(st.name));
    }
    if (/^(ת\.\s*מרכזית|תחנה מרכזית)/.test(t)) return t.replace(/^(ת\.\s*מרכזית|תחנה מרכזית)/, 'התחנה המרכזית');
    if (/^(רכבת|ת\. רכבת|תחנת רכבת)$/.test(t)) return 'תחנת הרכבת';
    if (/^רכבת\s/.test(t)) return t.replace(/^רכבת\s/, 'תחנת הרכבת ');
    return streetOf(st.name);
  }
  /* "הקו כבר לא יעצור ב-16 תחנות, ויעצור ב-5 תחנות חדשות" */
  function stopsSentence(r, a, geo) {
    if (ENb()) return XB.b_stops(r, a, geo);
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
  function noNear(d) { if (ENb()) return XB.b_noNear((d && d._nn) || NN_CUR); return 'לא נמצאה תחנה חלופית קרובה ' + ((d && d._nn) || NN_CUR || 'של הקו') + ' במסלול החדש'; }
  function walkTxt(nr) { if (ENb()) return XB.b_walk(nr); return nr.min ? 'כ-' + nr.min + ' דק׳ הליכה, ' + nr.m + ' מ׳' : 'כ-' + nr.m + ' מ׳ הליכה'; }

  function dirLead(d) {
    var s = '<b>' + E(stopsSentence(d.removed.length, d.added.length, d.geo)) + '.</b>';
    if (d.moved.length) s += ' ' + (ENb() ? XB.b_moved(d.moved.length) : plural(d.moved.length, 'תחנה אחת עוברת', 'תחנות עוברות') + ' למקום קרוב.');
    var ch = {};
    d.added.concat(d.removed).forEach(function (c) { ch[c] = 1; });
    var cities = {};
    d.old.stops.concat(d.new.stops).forEach(function (st) { if (ch[st.code] && st.city) cities[st.city] = 1; });
    var cl = Object.keys(cities);
    if (cl.length && ENb()) s += E(XB.b_cities(cl.map(nE)));
    else if (cl.length) s += ' השינויים ב' + (cl.length > 3 ? cl.slice(0, 3).join(', ') + ' ועוד' : cl.join(', ')) + '.';
    return s;
  }

  function autoIntro(pages) {
    var k = pages.length === 1 && pages[0].kind;
    if (k === 'new') return tx('inNew', 'בעמודים הבאים: מפה של המסלול, כל התחנות, ומתי הקו נוסע.');
    if (k === 'ended') return tx('inEnded', 'בעמודים הבאים: מפה של המסלול, ואילו קווים אחרים עוצרים באותן תחנות.');
    if (k === 'timetable') return tx('inTt', 'המסלול והתחנות לא משתנים — רק השעות. בעמודים הבאים: לוח הזמנים הישן והחדש.');
    if (pages.every(function (p) { return p.kind === 'timetable'; })) return tx('inTtAll', 'המסלולים לא משתנים — רק השעות. בעמודים הבאים: לוח הזמנים של כל קו.');
    var t = pages.length === 1 ? (pages[0].tot || {}) : null;
    if (t && (t.add || 0) + (t.rem || 0) + (t.mv || 0) <= 3 && !t.geo) return tx('inSmall', 'בעמודים הבאים: מפה קרובה של המקום שבו התחנה משתנה.');
    var rem = pages.some(function (p) { return (p.tot || {}).rem; });
    if (pages.every(function (p) { return (p.tot || {}).ext; })) return tx('inExt', 'בעמודים הבאים: מפה של הקטע החדש במסלול.');
    // רק תחנות (הדרך לא משתנה באף קו)
    if (pages.every(function (p) { return !p.kind && !(p.tot || {}).geo; })) {
      var add = pages.some(function (p) { return (p.tot || {}).add; }), mv = pages.some(function (p) { return (p.tot || {}).mv; });
      var many = pages.reduce(function (n, p) { return n + ((p.tot || {}).add || 0) + ((p.tot || {}).rem || 0); }, 0) > 1 && pages.length === 1;
      if (EN()) return add && !rem && !mv ? tx(many ? 'inAddN' : 'inAdd1') : rem && !add && !mv ? tx(many ? 'inRemN' : 'inRem1') : tx('inStops');
      if (add && !rem && !mv) return 'בעמודים הבאים: מפה עם ' + (many ? 'התחנות החדשות.' : 'התחנה החדשה.');
      if (rem && !add && !mv) return 'בעמודים הבאים: מפה עם ' + (many ? 'התחנות שמבוטלות' : 'התחנה שמבוטלת') + ', ואיפה התחנה הקרובה.';
      return 'בעמודים הבאים: מפה של התחנות שמשתנות.';
    }
    if (EN()) return tx('inRoute') + (rem ? tx('inRouteRem') : '.');
    return 'בעמודים הבאים: מפה של המסלול הישן והחדש' + (rem ? ', ואיפה התחנה הקרובה במקום כל תחנה שמבוטלת.' : '.');
  }
  /* שם המצגת: יחיד רק כשיש בדיוק קו אחד. כמה קווים: "שינויים בקווים 9, 18 ו-54" (עד 5), "שינויים ב-12 קווים" (יותר),
     ואותו שינוי בכמה קווים: "אותו שינוי ב-3 קווים". (העיר כבר בתגית הגדולה בשער — לא חוזרים עליה) */
  function autoTitle(pages, city) {
    var lines = []; pages.forEach(function (x) { if (lines.indexOf(x.line) < 0) lines.push(x.line); });
    if (EN()) return enTitle(pages, lines);
    if (pages.length === 1 || lines.length === 1) return isKind(pages[0]) ? kindTitle(pages[0]) : 'שינוי בקו ' + pages[0].line;
    var sg = function (x) { return isKind(x) ? '' : x.sig || oneSig(x); };
    if (sg(pages[0]) && pages.every(function (x) { return sg(x) === sg(pages[0]); })) return 'אותו שינוי ב-' + lines.length + ' קווים';
    if (lines.length <= 5) return 'שינויים בקווים ' + andList(lines, 5);
    return 'שינויים ב-' + lines.length + ' קווים';
  }
  function enTitle(pages, lines) {
    var X = window.LCDeckEN, T = X.a_T, p = pages[0], l = X.a_ln(p.line);
    if (pages.length === 1 || lines.length === 1) return !isKind(p) ? T.chg1 + l + T.chg1b : p.kind === 'new' ? T.newLine + l : p.kind === 'ended' ? T.line + ' ' + l + T.ended : T.ttFor + l;
    var sg = function (x) { return isKind(x) ? '' : x.sig || oneSig(x); };
    if (sg(p) && pages.every(function (x) { return sg(x) === sg(p); })) return T.same + lines.length + T.linesN;
    if (lines.length <= 5) return T.chgs + X.a_list(lines.map(X.a_ln));
    return T.chgsN + lines.length + T.linesN;
  }
  /* כותרת ליד התגית (כמו badgeTitle) — באנגלית */
  function enBadge(p) { var T = window.LCDeckEN.a_T; return p.kind === 'new' ? T.bNew : p.kind === 'ended' ? T.bEnded : p.kind === 'timetable' ? T.bTt : T.bChg; }

  /* ---------- השקפים ---------- */
  function cover(pages, city, one) {
    var s0 = pages.map(start).sort()[0];
    var single = pages.length === 1, p = pages[0], en = EN(), X = window.LCDeckEN;
    var ops = []; pages.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); });
    var dmy = LC.dmy, dm = LC.dm;
    var firstTrip = single && p.formal && p.formal !== p.eff ? tx('firstTrip', 'נסיעה ראשונה במסלול החדש: ') + (en ? X.a_dl(p.eff) : enWd(p.eff, en) + ' ' + dm(p.eff)) : '';
    var dates = {}; pages.forEach(function (x) { dates[start(x)] = 1; });
    var multiDate = Object.keys(dates).length > 1;
    var endK = single && p.kind === 'ended';
    var odS = function () { var o = p.od || []; return enOd(o) || enN(o[0]); };
    var sub = en ? (endK ? odS() + ' · ' + X.a_T.lastTripS + X.a_dy(lastOf(p)) : single ? odS() + ' · ' + X.a_T.starting + X.a_dy(s0)
      : (pages.length > 5 ? X.a_T.lines + ' ' + pages.map(function (x) { return X.a_ln(x.line); }).join(', ') + ' · ' : '') + (multiDate ? X.a_T.from : X.a_T.starting) + X.a_dy(s0))
      : endK ? (LC.od(p.od) || p.od[0]) + ' · הנסיעה האחרונה ' + LC.dmy(lastOf(p)) : single ? (LC.od(p.od) || p.od[0]) + ' · החל מ-' + LC.dmy(s0)
      : (pages.length > 5 ? 'קווים ' + pages.map(function (x) { return x.line; }).join(', ') + ' · ' : '') + (multiDate ? 'מ-' + LC.dmy(s0) : 'החל מ-' + LC.dmy(s0));
    var opPhone = ops.length === 1 && phoneOf(ops[0]);
    var hd = function (iso) { return en ? X.a_heb(iso) : hebDate(iso); };
    var ttN = one ? ttCount(pages[0]) : 0;
    var intro = one ? (en ? X.a_T.onlyTimes + (ttN === 1 ? X.a_T.oneTrip : ttN + X.a_T.trips) + ' change.' : 'המסלול והתחנות לא משתנים — רק השעות של ' + (ttN === 1 ? 'נסיעה אחת' : ttN + ' נסיעות') + '.') : autoIntro(pages);
    return '<div class="' + enRoot('s-cover') + '">' +
      '<div class="band"><div class="row">' +
        (single ? '<span class="badge num">' + E(p.line) + '</span>' : '<span class="badge word">' + E(city ? enN(city) : tx('lines', 'קווים')) + '</span>') +
        '<div class="t"><h1 class="hd" data-k="title">' + E(single ? (en ? enBadge(p) : badgeTitle(p)) : autoTitle(pages, city)) + '</h1><p class="sub">' + E(sub) + '</p></div></div>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="body">' +
        '<div class="facts">' +
          (endK ? '<div class="fact"><span class="l">' + tx('lastTrip', 'הנסיעה האחרונה') + '</span><span class="v">' + E(en ? X.a_dl(lastOf(p)) : enWd(lastOf(p), en) + ' ' + LC.dmy(lastOf(p))) + '</span>' +
            (en ? '<span class="vh"> · </span>' : '') + '<span class="x">' + E(hd(lastOf(p))) + '</span>'
          : '<div class="fact"><span class="l">' + (multiDate ? tx('factFromMulti', 'החל מ') : tx('factFrom', 'ממתי')) + '</span><span class="v">' + E(en ? X.a_dl(s0) : enWd(s0, en) + ' ' + LC.dmy(s0)) + '</span>' +
            (en ? '<span class="vh"> · </span>' : '') + '<span class="x">' + E(hd(s0)) + '</span>') + (firstTrip ? '<span class="x">' + E(firstTrip) + '</span>' : '') + '</div>' +
          '<div class="fact"><span class="l">' + (ops.length > 1 ? tx('companies', 'חברות') : tx('company', 'חברת האוטובוסים')) + '</span><span class="v">' + E(ops.map(enOp).join(' · ')) + '</span>' +
            '<span class="x num">' + (opPhone ? tx('infoLine', 'מוקד: ') + '<span class="ltr">' + E(opPhone) + '</span>' : '') + '</span></div>' +
          '<div class="fact"><span class="l">' + tx('mot', 'משרד התחבורה') + '</span><span class="v num"><span class="ltr">' + MOT + '</span></span><span class="x">' + tx('motX', 'מוקד המידע') + '</span></div>' +
        '</div>' +
        '<p class="intro" data-k="intro">' + E(intro) + '</p>' +
        (single || pages.length <= 3 ? '<div class="what"><h3 class="hd">' + (single && p.kind === 'new' ? tx('whatNew', 'מה חשוב לדעת?') : tx('what', 'מה משתנה?')) + (en ? ' ' : '') + '<span class="counts">' + (single ? E(totLine(p.tot || {}, p.dirs)) : '') + '</span></h3>' +
          '<ul data-k="what">' + listHtml(D.ED.blang === 'en' ? D.ED.coverEn : D.ED.cover, coverItems(pages)) + '</ul></div>' : coverRows(pages)) +
        '<div class="note">' + (en ? E(X.a_T.noteA) + (ops.length === 1 ? E(enOp(ops[0])) : X.a_T.noteOps) + E(X.a_T.noteB)
          : 'המידע הוכן על ידי אדם פרטי, ואינו פרסום רשמי של משרד התחבורה או של ' + (ops.length === 1 ? E(ops[0]) : 'חברות האוטובוסים') + '. השינוי עלול להשתנות. לפני הנסיעה בדקו במוקד או באפליקציה.') + '</div>' +
        (one ? '<p class="osrc">' + tx('src', 'לפי נתוני משרד התחבורה') + (one.feed ? tx('srcFrom', ' מ-') + E(LC.dmy(one.feed)) : '') + '</p>' + creditHtml() : '') +
      '</div></div>';
  }

  /* שער של יותר משלושה קווים: שורה קצרה לכל קו — מספר, סוג השינוי, ומאיפה לאן ומתי */
  var COVER_ROWS = 8;
  function coverRows(pages) {
    var en = EN(), chips = en ? window.LCDeckEN.a_chips : LC.chips;
    var rows = pages.slice(0, COVER_ROWS).map(function (p) {
      var when = p.kind === 'ended' ? tx('lastTripS', 'נסיעה אחרונה ') + LC.dm(lastOf(p)) : (p.past ? tx('started', 'היה ב-') : tx('from', 'מ-')) + LC.dm(start(p));
      var o = en ? (p.od || [])[0] && p.od[0] === p.od[1] ? enN(p.od[0]) : enOd(p.od) : odTxt(p);
      return '<li><span class="badge sm num">' + E(p.line) + '</span><span class="chips">' + chips(p.kind ? { kind: p.kind } : p.tot || {}) + '</span>' +
        '<span class="cs">' + E((o ? o + ' · ' : '') + when) + '</span></li>';
    });
    if (pages.length > COVER_ROWS) rows.push('<li class="more">' + (en ? E(tx('more1') + (pages.length - COVER_ROWS) + tx('more2')) : 'ועוד ' + (pages.length - COVER_ROWS) + ' קווים — בעמוד הבא') + '</li>');
    return '<div class="what crows"><ul>' + rows.join('') + '</ul></div>';
  }
  function overview(pages, part, nparts) {
    var chips = EN() ? window.LCDeckEN.a_chips : LC.chips;
    return '<div class="' + enRoot('s-over') + '"><h2 class="hd">' + (nparts > 1 ? tx('allLines', 'כל הקווים שמשתנים') + ' (' + (part + 1) + '/' + nparts + ')' : tx('allLines', 'כל הקווים שמשתנים')) + '</h2>' +
      '<table><tr><th style="width:34%">' + tx('thLine', 'קו') + '</th><th style="width:44%">' + tx('thWhat', 'מה משתנה') + '</th><th style="width:22%">' + tx('thWhen', 'ממתי') + '</th></tr>' +
      pages.map(function (p) {
        return '<tr><td class="ln"><b class="num">' + E(p.line) + '</b>' + E(enOd(p.od)) + '</td><td><div class="chips">' +
          chips(p.tot || {}) + '</div></td><td>' + E(p.kind === 'ended' ? tx('until', 'עד ') + enWd(lastOf(p)) + ' ' + LC.dm(lastOf(p)) : enWd(start(p)) + ' ' + LC.dm(start(p))) + '</td></tr>';
      }).join('') + '</table>' + foot() + '</div>';
  }

  function foot() {
    return '<div class="sfoot"><span>' + tx('foot', 'הוכן על ידי אדם פרטי · לא פרסום רשמי · מפה: © תורמי OpenStreetMap') + '</span><span class="pg num"></span></div>';
  }

  /* מפה של אזור אחד (כשהמפה מחולקת לאזורים): רק ההסברים, המספרים והשכבות של האזור הזה */
  function areaOf(d, part, nparts) {
    if (nparts < 2 || !part.show) return null;
    var rem = (d._rem || []).filter(function (s) { return part.show[s._k + s.code]; });
    var add = (d._add || []).filter(function (s) { return part.show[s._k + s.code]; });
    var pts = rem.concat(add).map(function (s) { return s.ll; }), codes = {};
    rem.concat(add).forEach(function (s) { codes[s.code] = 1; });
    var segs = segments(d).slice(0, D.SEG_MAX).filter(function (g) {
      if (g.oldS.concat(g.newS).some(function (s) { return codes[s.code]; })) return true;
      var at = g.A ? divergeAt(d, g) : ((g.newS[0] || g.oldS[0] || {}).ll);
      return at && pts.some(function (c) { return dist(c, at) < 1500; });
    });
    return { rem: rem, add: add, segs: segs };
  }
  function mapSlide(p, d, part, nparts) {
    var r = d.removed.length, a = d.added.length, ar = areaOf(d, part, nparts);
    var near = (d._rem || []).some(function (s) { return s._near && !s._near.none; });
    var en = EN();
    var when = start(d) !== start(p) ? '<p class="lead">' + tx('starting', 'החל מ') + E(en ? window.LCDeckEN.a_dl(start(d)) : enWd(start(d), en) + ' ' + LC.dmy(start(d))) + '.</p>' : '';
    var where = en ? enToward(d) : toward(d).replace(/^בנסיעה ל/, 'לכיוון ');
    return '<div class="' + enRoot('s-map') + '"><div class="smap"></div><div class="inset"></div><div class="side">' +
      '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(enOp(p.op)) + '</span></div>' +
      '<h2 class="hd">' + E(trip(d)) + E(en ? (altTxt(d) ? tx('someTrips') : '') : altTxt(d)) + '</h2>' +
      (nparts > 1 ? '<p class="part">' + (en ? E((where ? where + ' · ' : '') + part.name) + ' <small style="font-weight:600;color:var(--s-sub)">· ' + tx('mapOf') + (part.i + 1) + tx('of') + nparts + '</small>'
        : E((/^לכיוון /.test(where) ? where + ' · ' : '') + part.name) + ' <small style="font-weight:600;color:var(--s-sub)">· מפה ' + (part.i + 1) + ' מתוך ' + nparts + '</small>') + '</p>' : '') +
      (extOf(d) ? '' : rerouted(d) ? '' : '<p class="part">' + tx('sameRoute', 'המסלול לא משתנה — רק ') + (r + a + d.moved.length === 1 ? tx('stopW', 'התחנה') : tx('stopsW', 'התחנות')) + '</p>') +
      segList(d, ar) + when +
      (small(d) && nparts < 2 ? smallList(d) : '<p class="counts">' + E(ar ? areaCounts(ar) : countsLine(d)) + '</p>') +
      legendHtml(d, ar) + basisHtml([d]) +
      '<div style="font-size:13px;color:var(--s-sub)">' + tx('footShort', 'הוכן על ידי אדם פרטי · לא פרסום רשמי') + '</div>' +
      '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>';
  }

  /* באנגלית: "Toward Safed" (קו בין עירוני — עיר היעד; בתוך העיר — התחנה האחרונה), או '' (קו מעגלי) */
  function enToward(d) {
    var o = d.od || [], S = d.new.stops.length ? d.new.stops : d.old.stops;
    if (o[0] && o[1] && o[0] !== o[1]) return tx('toward') + enN(o[1]);
    var A = S[0], B = S[S.length - 1];
    return A && B && A.code !== B.code && skey(A.name) !== skey(B.name) ? tx('toward') + enN(B.name) : '';
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
      if (ENb()) { rows.push('<li><i class="dot rem">' + (i + 1) + '</i><span>' + Eb(sN(s)) + XB.b_small.rem +
        '<span class="nr">' + E(nr && !nr.none ? XB.b_instead(nE(nr.name), nr) : noNear(d)) + '</span></span></li>'); return; }
      rows.push('<li><i class="dot rem">' + (i + 1) + '</i><span>' + E(s.name) + ' — מבוטלת' +
        (nr && !nr.none ? '<span class="nr">במקום: ' + E(nr.name) + ' (' + walkTxt(nr) + ')</span>' : '<span class="nr">' + noNear(d) + '</span>') + '</span></li>');
    });
    d.new.stops.filter(function (s) { return d.added.indexOf(s.code) >= 0; }).forEach(function (s, i) {
      rows.push(ENb() ? '<li><i class="dot add">' + (i + 1) + '</i><span>' + Eb(sN(s)) + XB.b_small.add + ' <span class="sc">' + XB.b_code + E(s.code) + '</span></span></li>' :
        '<li><i class="dot add">' + (i + 1) + '</i><span>' + E(s.name) + ' — חדשה <span class="sc">מק״ט ' + E(s.code) + '</span></span></li>');
    });
    return rows.length ? '<ul class="small"' + (ENb() ? ' dir="ltr"' : '') + '>' + rows.join('') + '</ul>' : '';
  }
  function allGreen(d) { return D.ED.rc === 'all' && rerouted(d) && !extOf(d); }
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
    var until = E(LC.dm(LC.addDays(start(d), -1))), from = E(LC.dm(start(d)));
    var sp = function (cls, k, he, tail) { return '<span><i class="' + cls + '"></i>' + tx(k, he) + (tail || '') + '</span>'; };
    var dot = function (cls, k, he) { return '<span><i class="dot ' + cls + '">1</i>' + tx(k, he) + '</span>'; };
    var lgSame = function () { return sp('sw same', 'lgSame', 'מסלול הקו (לא משתנה)'); };
    return '<div class="legend"' + (EN() ? ' dir="ltr"' : '') + '>' +
        (d.var === 'end' ? sp('sw old', 'lgVarEnd', 'הדרך של הנסיעות שבוטלו (עד ', until + ')') + lgSame() :
        d.var === 'new' ? lgSame() + sp('sw', 'lgVarNew', 'הדרך של הנסיעות החדשות (מ-', from + ')') :
        extOf(d) ? lgSame() + sp('sw', 'lgExt', 'הקטע החדש (מ-', from + ')') :
          rerouted(d) ? (oldSeg && realRuns(d, 'old').length ? sp('sw old', 'lgOld', 'קטע שהקו כבר לא נוסע בו (עד ', until + ')') : '') +
          (allGreen(d) ? sp('sw', 'lgAll', 'המסלול החדש (מ-', from + ')')
            : sp('sw same', 'lgSameR', 'המסלול שלא השתנה') + (newSeg ? sp('sw', 'lgNewSeg', 'קטע חדש (מ-', from + ')') : '')) : lgSame()) +
        (r ? dot('rem', 'lgRem', 'תחנה שמבוטלת') : '') +
        (near ? sp('sw near', 'lgNear', 'אל התחנה הקרובה במסלול החדש', remL.some(function (s) { return s._near && s._near.path; }) ? tx('lgWalk', ' (זמן ההליכה ברשימה)') : '') : '') +
        (segs.some(routeSeg) ? dot('seg', 'lgSeg', 'כאן המסלול משתנה (כמו בהסבר)') : '') +
        (a ? dot('add', 'lgAdd', 'תחנה חדשה') : '') +
        (!ar && d.moved.length ? dot('mv', 'lgMv', 'תחנה שעוברת מקום') : '') +
        '<span><i class="dot same"></i>' + tx('lgStay', 'תחנה שנשארת') + '</span></div>';
  }

  D.SEG_MAX = 4;
  function areaCounts(ar) {
    var s = [], X = EN() && window.LCDeckEN;
    if (ar.rem.length) s.push(X ? X.a_pl(ar.rem.length, 'stop cancelled', 'stops cancelled') : plural(ar.rem.length, 'תחנה אחת מבוטלת', 'תחנות מבוטלות'));
    if (ar.add.length) s.push(X ? X.a_pl(ar.add.length, 'new stop', 'new stops') : plural(ar.add.length, 'תחנה חדשה אחת', 'תחנות חדשות'));
    return s.length ? s.join(' · ') + tx('inArea', ' באזור הזה · המספרים במפה כמו ברשימה בעמוד הבא') : '';
  }
  function segList(d, ar) {
    var segs = segments(d);
    var LT = ENb() ? ' dir="ltr"' : '';
    if (!segs.length) return '<p class="lead"' + LT + '>' + dirLead(d) + '</p>';
    var sg = D.ED.blang === 'en' ? D.ED.segEn : D.ED.seg, ed = sg && sg[d._key];   // עריכות לפי שפה — עברית לא נכנסת למצגת באנגלית ולהפך
    var html = '<ol class="segs"' + LT + '>' + segs.slice(0, D.SEG_MAX).map(function (g, i) {
      if (ar && ar.segs.indexOf(g) < 0) return '';   // מפה של אזור: רק ההסברים של האזור הזה (עם המספרים המקוריים)
      var t = ed && typeof ed[i] === 'string' ? E(ed[i]) : g.html;
      // מספר רק לשינוי בדרך עצמה (יש לו סמן על המפה); שינוי של תחנה — נקודה, הסמן הממוספר של התחנה הוא ההפניה
      var num = segNum(d, g);
      return '<li>' + (num ? '<i class="segn">' + num + '</i>' : '<i class="segb"></i>') + '<span data-seg="' + E(d._key) + '" data-i="' + i + '">' + t + '</span></li>';
    }).join('') + '</ol>';
    if (segs.length > D.SEG_MAX && !ar && ENb()) html += '<p class="counts" dir="ltr">' + XB.b_moreSegs(segs.length - D.SEG_MAX) + '</p>';
    else if (segs.length > D.SEG_MAX && !ar) html += '<p class="counts">ועוד ' + (segs.length - D.SEG_MAX === 1 ? 'שינוי קטן אחד' : (segs.length - D.SEG_MAX) + ' שינויים קטנים') + ' — ברשימת התחנות בעמוד הבא.</p>';
    return html;
  }
  function routeSeg(g) { return !g.kind; }
  function segNum(d, g) {
    if (!routeSeg(g)) return 0;
    var n = 0, out = 0;
    segments(d).slice(0, D.SEG_MAX).forEach(function (x) { if (routeSeg(x)) { n++; if (x === g) out = n; } });
    return out;
  }
  /* "27 תחנות מבוטלות · 20 תחנות חדשות" — ובשינוי בכמה כיוונים (dirs) גם ", בשני הכיוונים": המספרים הם של כל הכיוונים יחד
     (כל כיוון עם התחנות שלו בצד שלו של הכביש), כדי שלא יתבלבלו עם המספרים במפה של כיוון אחד */
  function totLine(t, dirs) {
    var s = [], dk = {};
    (dirs || []).forEach(function (d) { if ((d.added || []).length + (d.removed || []).length) dk[d.dir] = 1; });
    var both = Object.keys(dk).length > 1 && (t.rem || t.add);
    if (ENb()) { if (t.rem) s.push(XB.b_cnt.rem(t.rem)); if (t.add) s.push(XB.b_cnt.add(t.add)); return s.join(' · ') + (both ? ', in both directions' : ''); }
    if (t.rem) s.push(plural(t.rem, 'תחנה אחת מבוטלת', 'תחנות מבוטלות'));
    if (t.add) s.push(plural(t.add, 'תחנה חדשה אחת', 'תחנות חדשות'));
    return s.join(' · ') + (both ? ', בשני הכיוונים' : '');
  }
  function countsLine(d) {
    var r = d.removed.length, a = d.added.length, s = [];
    if (ENb()) { if (r) s.push(XB.b_cnt.rem(r)); if (a) s.push(XB.b_cnt.add(a)); return s.join(' · ') + (s.length ? XB.b_cnt.map : ''); }
    if (r) s.push(plural(r, 'תחנה אחת מבוטלת', 'תחנות מבוטלות'));
    if (a) s.push(plural(a, 'תחנה חדשה אחת', 'תחנות חדשות'));
    return s.join(' · ') + (s.length ? ' · המספרים במפה כמו ברשימה בעמוד הבא' : '');
  }

  /* רשימת תחנות: עמודות של rows שורות; בתחנה שמבוטלת — שורה שנייה: התחנה הקרובה במקומה */
  function nrTxt(s) { var nr = s._near; if (ENb()) return !nr || nr.none ? noNear() : XB.b_instead(nE(nr.name), nr); return !nr || nr.none ? noNear() : 'במקום: ' + nr.name + ' (' + walkTxt(nr) + ')'; }
  /* תחנות שמבוטלות: עמודות לפי הגובה המשוער (שורה שנייה ארוכה — עוד שורה), כדי שהרשימה לא תגלוש לתחתית השקף */
  function remCols(arr) {
    var big = D.ED.look === 'large', nrCap = big ? 36 : 46, nmCap = big ? 28 : 36, cap = RR + 1.5, cols = [], cur = [], used = 0;
    arr.forEach(function (s) {
      var w = 1 + (nrTxt(s).length > nrCap ? 0.27 : 0) + (((ENb() ? sN(s) : s.name) + ' מק״ט ' + s.code).length > nmCap ? 0.27 : 0);
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
        var en = ENb(), nr2 = en && s._near && !s._near.none ? XB.b_instead(Eb(nE(s._near.name)), s._near) : null;
        var sub = s._k !== 'rem' ? '' : '<span class="nr">' + (nr2 || E(nrTxt(s))) + '</span>';
        return '<li' + (sub ? ' class="two-l"' : '') + '><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + (en ? Eb(sN(s)) : E(s.name)) + ' <span class="sc">' + (en ? XB.b_code : 'מק״ט ') + E(s.code) + '</span>' +
          (s.city && s.city !== mainCity ? ' <span class="cd">' + (en ? Eb(nE(s.city)) : E(s.city)) + '</span>' : '') + sub + '</span></li>';
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
    if (ENb()) return stopsSlidesEn(p, d, remS, addS, rc, rOff, n, mainCity);
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

  /* שקף התחנות באנגלית — אותו מבנה, משמאל לימין */
  function stopsSlidesEn(p, d, remS, addS, rc, rOff, n, mainCity) {
    var X = XB.b_sl, out = [];
    for (var i = 0; i < n; i++) {
      var rcs = rc.slice(i * 2, i * 2 + 2), r = [].concat.apply([], rcs), a = addS.slice(i * RA * 2, (i + 1) * RA * 2);
      var extra = '';
      if (i === n - 1) {
        if (d.moved.length) extra += '<p class="extra">' + X.moved + d.moved.map(function (m) { return Eb(sN(m)) + X.about(m.m); }).join(' · ') + '</p>';
        if (d.swaps && d.swaps.length) extra += '<p class="extra">' + X.swaps(d.swaps.length) + '</p>';
      }
      out.push({
        label: X.label + trip(d) + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: '<div class="s-stops" dir="ltr" lang="en"><div class="head"><span class="badge sm num">' + E(p.line) + '</span><h2 class="hd">' +
          E(trip(d)) + E(altTxt(d)) + (i ? X.cont : '') + '</h2></div>' +
          '<div class="cols">' +
            '<div class="grp rem"><h3 class="hd">' + X.rem + (remS.length ? ' (' + remS.length + ')' : '') + '</h3>' +
              (r.length ? stopList(r, rOff[i], RR, mainCity, rcs.length > 1 ? rcs : [rcs[0], []]) : '<p class="empty">' + (i ? '' : X.noRem) + '</p>') + '</div>' +
            '<div class="grp add"><h3 class="hd">' + X.add + (addS.length ? ' (' + addS.length + ')' : '') + '</h3>' +
              (a.length ? stopList(a, i * RA * 2, RA, mainCity) : '<p class="empty">' + (i ? '' : X.noAdd) + '</p>') + '</div>' +
          '</div>' + extra +
          '<div class="sfoot"><span>' + X.foot((d._rem || []).some(function (x) { return x._near && x._near.path; })) + '</span><span class="pg num"></span></div></div>'
      });
    }
    return out;
  }

  // קרדיט לקו הבוחן — רק אם מי שמכין את המצגת השאיר את הסימון (ברירת המחדל: כן)
  function creditHtml() {
    if (D.ED.credit === false) return '';
    if (EN()) return '<p class="credit" dir="ltr">' + E(window.LCBoardEN.TXT.credit.replace(/ · kavbochan\.app$/, '')) + ' · <b class="ltr">kavbochan.app</b></p>';
    return '<p class="credit">נוצר בכלי "מצגת לשינוי בקו" של הקו הבוחן · <b class="ltr">kavbochan.app</b></p>';
  }
  function closing(pages, feed) {
    var ops = []; pages.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); });
    var en = EN(), T = en ? window.LCDeckEN.a_T : null;
    // כל החברות שבמצגת שיש להן מוקד (בלי חיתוך לשלוש)
    var ph = ops.filter(function (o) { return phoneOf(o); }).map(function (o) {
      var v = phoneOf(o);
      return '<div class="ph"><span class="l">' + E(enOp(o)) + '</span><span class="v' + (v.length > 6 ? ' lg' : '') + '">' + E(v) + '</span></div>';
    }).join('');
    var cur = pages.every(isCur);
    return '<div class="' + enRoot('s-close') + '"><div class="seam"><i></i></div><h2 class="hd">' + tx('check', 'לפני הנסיעה בדקו') + '</h2>' +
      '<div class="phones">' + ph + '<div class="ph"><span class="l">' + tx('mot', 'משרד התחבורה') + '</span><span class="v">' + MOT + '</span></div></div>' +
      '<div class="note">' + (en ? E(T.closeA) + (ops.length === 1 ? E(enOp(ops[0])) : T.noteOps) + E(cur ? T.closeTt : T.closeCh)
        : 'המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי של משרד התחבורה או של ' +
        (ops.length === 1 ? E(ops[0]) : 'חברות האוטובוסים') + '. ' + (cur ? 'לוח הזמנים' : 'השינוי') + ' עלול להשתנות בכל רגע. לפני הנסיעה בדקו במוקד או באפליקציה.') + '</div>' +
      '<p class="src">' + tx('src', 'לפי נתוני משרד התחבורה') + (feed ? tx('srcFrom', ' מ-') + E(LC.dmy(feed)) : '') +
        (pages.some(function (x) { return x.past; }) ? tx('archive', ' ולפי הארכיון של הקו הבוחן') : '') + (cur ? '' : tx('osmMaps', ' · מפות: © תורמי OpenStreetMap')) + '</p>' + creditHtml() + '</div>';
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
    var en = ENb();
    list.forEach(function (s) { var t = streetOf(s.name), k = skey(t); if (t && en) noteSt(t, s); if (t && keys.indexOf(k) < 0) { keys.push(k); out.push(t); } });
    return out;
  }
  function andList(arr, max) {
    if (ENb()) return XB.b_andList(arr, max);
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
    if (ENb()) return XB.b_via(st.map(stE), pl.slice(0, 1).map(stE));
    var out = st.length ? 'דרך ' + andList(st) : '';
    if (pl.length) out += (out ? ', ודרך ' : 'דרך ') + pl[0];
    return out;
  }
  function q(s) { return sN(s); }   // שם התחנה מודגש בשקף — בלי מירכאות (ממילא יש בשמות גרשיים)
  function nearLine(stops, shape) {
    if (!stops.length || shape.length < 2) return false;
    var lat0 = shape[0][0], sx = shape.map(function (p) { return xy(p, lat0); });
    return stops.every(function (s) { return distToLine(xy(s.ll, lat0), sx) <= 60; });
  }

  function segments(d) {
    var ck = ENb() ? '_segsEn' : '_segs';
    if (ck === '_segsEn' && d._segsEd !== D.ED) { d._segsEn = null; d._segsEd = D.ED; }   // באנגלית — מחדש בכל בנייה (השמות שהוקלדו, ורשימת השמות בלי תרגום)
    if (d[ck]) return d[ck];
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
      var t = ENb() ? XB.b_seg.moved('<b>' + Eb(sN(m)) + '</b>', m.m) : 'התחנה <b>' + E(m.name) + '</b> עוברת למקום חדש, כ-' + m.m + ' מ׳ מהמקום הקודם.';
      segs.push({ A: { ll: m.ll, name: m.name }, B: null, oldS: [], newS: [], html: t, plain: t, kind: 'mv', names: [skey(m.name)], weight: 1, moved: m });
    });
    return (d[ck] = segs);
  }

  /* משפט למקטע. מחזיר HTML (שמות תחנות מודגשים); g.route = הקו נוסע בדרך אחרת */
  function segText(g, d) {
    var A = g.A, B = g.B, o = g.oldS, n = g.newS, b = function (s) { return '<b>' + Eb(q(s)) + '</b>'; };
    var keep = streets([A, B].filter(Boolean));
    if (d.var) return varText(g, d, keep, b);
    var oS = streets(o, streets(n).concat(keep)), nS = streets(n, streets(o).concat(keep));
    g.oS = oS; g.nS = nS;
    if (ENb()) return segTextEn(g, d, b);
    var names = function (arr) { return andList(arr.map(function (s) { return Eb(q(s)); })); };
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

  /* אותו משפט באנגלית (LCDeckEN.b_seg) — אותם מקרים ואותם סימונים (g.kind, g.names, g.loc) כמו בעברית */
  function segTextEn(g, d, b) {
    var A = g.A, B = g.B, o = g.oldS, n = g.newS, oS = g.oS, nS = g.nS, T = XB.b_seg;
    var names = function (arr) { return andList(arr.map(function (s) { return E(q(s)); })); };
    if (!A && !B) return T.other();
    if (!A) {
      if (o.length && !n.length) return T.startCut(b(o[0]), b(B));
      if (n.length && !o.length) {
        if (extOf(d)) { g.ext = 'start'; g.kind = 'ext'; g.names = ['start'].concat(n.map(function (x) { return skey(x.name); })); return T.startExt(n.length, b(n[0]), b(B)); }
        return T.startAdd(b(n[0]), b(B));
      }
      return T.startNew(b(n[0]), b(o[0]));
    }
    if (!B) {
      if (o.length && !n.length) return T.endCut(b(o[o.length - 1]), b(A));
      if (n.length && !o.length) {
        if (extOf(d)) { g.ext = 'end'; g.kind = 'ext'; g.names = ['end'].concat(n.map(function (x) { return skey(x.name); })); return T.endExt(n.length, b(A), b(n[n.length - 1])); }
        return T.endAdd(b(A), b(n[n.length - 1]));
      }
      return T.endNew(b(n[n.length - 1]), b(o[o.length - 1]));
    }
    var sameRoadOld = nearLine(o, d.new.shape), sameRoadNew = nearLine(n, d.old.shape);
    if (o.length && !n.length) {
      if (sameRoadOld || !oS.length) {
        g.kind = 'rem'; g.names = o.map(function (x) { return skey(x.name); }).sort();
        var nr = o.length <= 2 ? o.map(function (x) {
          var t = nearest(x, d);
          return !t || t.none ? T.remNone(Eb(q(x)), noNear(d)) : T.remNear(o.length > 1, Eb(q(x)), '<b>' + Eb(nE(t.name)) + '</b>', t);
        }).join(' ') : '';
        g.plain = T.rem(o.length, names(o));
        g.loc = locOf(o, A, B, d.old.shape); g.locN = LOCN;
        return T.rem(o.length, names(o), g.loc) + (nr ? ' ' + nr : '');
      }
      g.route = true;
      return T.offRoute(b(A), E(via(oS)), b(B));
    }
    if (n.length && !o.length) {
      if (sameRoadNew || !nS.length) {
        g.kind = 'add'; g.names = n.map(function (x) { return skey(x.name); }).sort();
        g.plain = T.add(n.length, names(n));
        g.loc = locOf(n, A, B, d.new.shape); g.locN = LOCN;
        return T.add(n.length, names(n), g.loc);
      }
      g.route = true;
      return T.newRoute(b(A), E(via(nS)), b(B));
    }
    if (!d.geo && o.length && n.length && nearLine(o, d.new.shape) && nearLine(n, d.old.shape)) {
      g.kind = 'swap'; g.names = o.concat(n).map(function (x) { return skey(x.name); }).sort();
      if (o.length === 1 && n.length === 1) return T.swap1(b(o[0]), b(n[0]), Math.max(50, Math.round(dist(o[0].ll, n[0].ll) / 50) * 50));
      return T.swapN(b(A), b(B), names(n), names(o));
    }
    if (oS.length || nS.length) { g.route = true; return T.route(b(A), oS.length ? E(via(oS)) : '', nS.length ? E(via(nS)) : '', b(B)); }
    return T.sameSt(b(A), b(B), names(n), names(o));
  }

  /* חלופה שבוטלה: "אחרי A, האוטובוסים כבר לא ייסעו דרך X ולא יעצרו בתחנות ...".
     חלופה חדשה: "אחרי A, חלק מהאוטובוסים ייסעו דרך Y ויעצרו בתחנות ..." (בזמן עבר — pastTense ב-app.js) */
  function varText(g, d, keep, b) {
    var end = d.var === 'end', list = end ? d.removed : d.added;
    var mine = (end ? g.oldS : g.newS).filter(function (x) { return list.indexOf(x.code) >= 0; });
    var S = streets(end ? g.oldS : g.newS, streets(end ? g.newS : g.oldS).concat(keep));
    g.oS = end ? S : []; g.nS = end ? [] : S; g.names = mine.map(function (x) { return skey(x.name); }).sort();
    var names = andList(mine.map(function (x) { return Eb(q(x)); }));
    if (ENb()) return XB.b_var(end, g.A ? b(g.A) : '', S.length ? E(via(S)) : '', mine.length, names,
      d.last ? E(window.LCBoardEN.DOW[new Date(d.last + 'T12:00:00').getDay()] + ' ' + LC.dm(d.last)) : '', d.freq ? E(XB.b_freq(d.freq)) : '');
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
    var en = ENb();
    dirs.forEach(function (d) { var t = d.basis && en ? XB.b_basis(d.basis) : d.basis; if (t && !d.was && seen.indexOf(t) < 0) seen.push(t); });
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
    var bb = function (x) { return '<b>' + Eb(sN(x)) + '</b>'; }, L = ENb() && XB.b_loc;
    var first = st[0], last = st[st.length - 1], dA, dB;
    if (shape && shape.length > 1) {
      var al = alongOf(shape);
      dA = al(first.ll) - al(A.ll); dB = al(B.ll) - al(last.ll);
      if (dA < 0 || dB < 0) { dA = dist(A.ll, first.ll); dB = dist(last.ll, B.ll); }   // השרטוט חוזר על עצמו (קו מעגלי) — בקו אווירי
    } else { dA = dist(A.ll, first.ll); dB = dist(last.ll, B.ll); }
    if (L) {
      if (dA <= NEAR_PAIR && dB <= NEAR_PAIR) { LOCN = L.between(bb(A), bb(B)); return LOCN; }
      LOCN = L.from(m50(Math.min(dA, dB)), bb(dA <= dB ? A : B));
      return dA <= dB ? L.after(m50(dA), bb(A)) : L.before(m50(dB), bb(B));
    }
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
        if (ENb()) out.push(XB.b_both.route(g.oS.length ? E(via(g.oS)) : '', g.nS.length ? E(via(g.nS)) : ''));
        else out.push('<b>בשני הכיוונים</b> הקו ' + (g.oS.length ? 'כבר לא ייסע ' + E(via(g.oS)) + (g.nS.length ? ', ובמקום זה ייסע ' + E(via(g.nS)) : '') : 'ייסע בדרך חדשה, ' + E(via(g.nS))) + '.');
      } else {
        out.push(((only || p.dirs).length > 1 ? (ENb() ? XB.b_dirLbl(E(toward(it.d))) : '<b>' + E(toward(it.d)) + '</b>, ') : '') + g.html);
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
      return ki.length > COVER_MAX + 1 ? ki.slice(0, COVER_MAX + 1).concat([ENb() ? XB.b_more : 'ועוד בעמודים הבאים.']) : ki;
    }
    if (pages.length === 1) {
      var w = whatChanges(pages[0]);
      return w.length > COVER_MAX ? w.slice(0, COVER_MAX).concat([ENb() ? XB.b_moreCh : 'ועוד שינויים בעמודים הבאים.']) : w;
    }
    // קווים עם אותו שינוי — שורה אחת ("קווים 9 ו-18: ...")
    var rows = [];
    pages.forEach(function (x) {
      if (isKind(x) && ENb()) {   // באנגלית
        var ki0 = (kindItems(x)[0] || '').replace(/^<b>(Toward|From)[^<]*<\/b>, /, '').replace(/^<b>on /, '<b>On ');
        rows.push({ w: { 'new': 'New line — ' + ki0, ended: 'Line discontinued. ' + ki0, timetable: 'New timetable. ' + ki0 }[x.kind], lines: [x.line] }); return;
      }
      if (isKind(x)) { var kw = { 'new': 'קו חדש — ' + kindItems(x)[0], ended: 'הקו מפסיק לפעול. ' + kindItems(x)[0], timetable: 'לוח זמנים חדש. ' + (kindItems(x)[0] || '').replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '') }[x.kind];
        rows.push({ w: kw, lines: [x.line] }); return; }
      var w = (whatChanges(x)[0] || '').replace(/^<b>[^<]*:<\/b> /, '').replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '');
      if (ENb()) w = w.replace(XB.b_dirRe, '');
      var r = rows.filter(function (y) { return y.w === w && w; })[0];
      if (r) r.lines.push(x.line); else rows.push({ w: w, lines: [x.line] });
    });
    if (rows.length === 1) return [rows[0].lines.length > 1 ? (ENd() ? XB.d_plu(rows[0].w) : plu(rows[0].w)) : rows[0].w];   // כל הקווים — אותו שינוי: בלי לחזור על מספרי הקווים
    if (ENb()) return rows.map(function (r) { return (r.lines.length > 1 ? XB.b_lines(r.lines.map(E)) : XB.b_line(E(r.lines[0]))) + r.w; });
    return rows.map(function (r) { return '<b>' + (r.lines.length > 1 ? 'קווים ' + E(andList(r.lines, 12)) : 'קו ' + E(r.lines[0])) + ':</b> ' + r.w; });
  }
  /* טקסט שהמשתמש ערך (מערך של מחרוזות) — או הטקסט שנוצר אוטומטית (HTML) */
  function listHtml(edited, gen) {
    var LT = ENb() ? ' dir="ltr"' : '';
    return (Array.isArray(edited) ? edited.map(E) : gen).map(function (t, i) { return '<li data-i="' + i + '"' + LT + '>' + t + '</li>'; }).join('');
  }
  function plain(h) { return String(h).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
  /* אותו שינוי בשני הכיוונים — משפט אחד, בלי שני נקודתיים */
  function bothText(g, t) {
    var b = function (st) { return st ? '<b>' + Eb(sN(st)) + '</b>' : ''; };
    var nm = function (arr) { return andList(arr.map(function (x) { return Eb(sN(x)); })); };
    if (ENb()) return bothTextEn(g, t, b, nm);
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
  function bothTextEn(g, t, b, nm) {
    var T = XB.b_both, mine = g.kind === 'add' ? g.newS : g.oldS, his = t ? (g.kind === 'add' ? t.newS : t.oldS) : [];
    if ((g.kind === 'add' || g.kind === 'rem') && mine.length === 1 && his.length === 1 && mine[0].code !== his[0].code) {
      var side = dist(mine[0].ll, his[0].ll) <= 300, codes = T.codes(E(mine[0].code), E(his[0].code));
      return g.kind === 'add' ? T.addPair(b(mine[0]), side, codes, g.locN) : T.remPair(b(mine[0]), side, codes);
    }
    if (g.kind === 'add') return T.add(g.newS.length, nm(g.newS), g.locN);
    if (g.kind === 'rem') return T.rem(g.oldS.length, nm(g.oldS));
    return T.lead + g.html;
  }
  function sameSet(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }

  /* כל השקפים לבחירה: [{id, label, html, map?}] */
  D.ED = {};   // עריכות של המשתמש: {cover: [..], seg: {key: [..]}, look}
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
  /* מצגת באנגלית ב"עמוד אחד", בשלט ובסטטוס של שינוי מסלול (deck-en-d.js — LCDeckEN.d_*) */
  function ENd() { return EN() && ENb() && window.LCDeckEN.d_T ? window.LCDeckEN : null; }
  function oneHtmlEn(p, dirs, main, gi, ng, feed, others) {
    var X = ENd(), T = X.d_T, s0 = start(p), all = [p].concat(others || []), ops = [];
    all.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); });
    var lines = all.map(function (x) { return x.line; }), multi = all.length > 1;
    var firstTrip = p.formal && p.formal !== p.eff ? X.d_first(p.eff) : '';
    var items = whatChanges(p, dirs).filter(Boolean);
    if (multi) items = items.map(function (t) { return X.d_plu(t.replace(XB.b_dirRe, '')); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    return '<div class="s-one en" dir="ltr" lang="en"><div class="smap"></div><div class="side">' +
      (multi ? '<div class="ohead multi"><div class="badges">' + lines.map(function (l) { return '<span class="badge num">' + E(l) + '</span>'; }).join('') + '</div>' +
          '<div class="t"><h1 class="hd">' + E(X.d_same(lines.length)) + '</h1><p class="sub">' + E(ops.map(enOp).join(' · ')) + '</p></div></div>'
        : '<div class="ohead"><span class="badge num">' + E(p.line) + '</span><div class="t"><h1 class="hd">' + T.chg + '</h1>' +
        '<p class="sub">' + E(enOd(p.od) || enN((p.od || [])[0])) + ' · ' + E(enOp(p.op)) + '</p></div></div>') +
      '<p class="owhen"><b>' + E(X.d_when(p.past, s0)) + '</b> · ' + E(X.a_heb(s0)) + E(firstTrip) + '</p>' +
      (ng > 1 ? '<p class="part">' + E(X.d_part(gi + 1, ng)) + ' · ' + E(trip(main)) + '</p>' : '') +
      '<div class="owhat"><h3 class="hd">' + T.what + '</h3><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' +
      legendHtml(main) +
      '<div class="ocontact">' + ops.filter(function (o) { return phoneOf(o); }).slice(0, 3).map(function (o) { return '<span>' + E(enOp(o)) + ' <b class="ltr">' + E(phoneOf(o)) + '</b></span>'; }).join('') +
        '<span>' + T.mot + ' <b class="ltr">' + MOT + '</b></span></div>' +
      '<div class="note">' + T.noteOne + '</div>' +
      '<p class="osrc">' + E(X.d_src(feed ? LC.dmy(feed) : '')) + '</p>' + basisHtml(dirs) + creditHtml() +
      '</div><span class="pg num" style="position:absolute;right:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>';
  }
  function oneHtml(p, dirs, main, gi, ng, feed, others) {
    if (ENd()) return oneHtmlEn(p, dirs, main, gi, ng, feed, others);
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
      var parts = D.splitParts(remS, addS);
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
  function odTxt(p) { var o = p.od || []; if (ENc()) return o[0] && o[0] === o[1] ? NM(o[0]) : ENc().c_od(o); return o[0] && o[0] === o[1] ? o[0] : LC.od(o); }
  function opsOf(all) { var ops = []; all.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); }); return ops; }
  /* אותו שינוי בכמה קווים: "הקו יעצור" → "הקווים יעצרו" (ושאר הפעלים שבמשפטים) */
  var PLU = { 'יעצור': 'יעצרו', 'ייסע': 'ייסעו', 'יתחיל': 'יתחילו', 'ימשיך': 'ימשיכו', 'יסיים': 'יסיימו', 'יגיע': 'יגיעו', 'יחזור': 'יחזרו', 'נוסע': 'נוסעים', 'עוצר': 'עוצרים' };
  function plu(t) {
    return String(t).replace(/(^|[\s>.,])(הקו|הוא)( כבר)?( לא)? (יעצור|ייסע|יתחיל|ימשיך|יסיים|יגיע|יחזור|נוסע|עוצר)(?=[\s<.,]|$)/g, function (m, a, who, k, l, v) {
      return a + (who === 'הקו' ? 'הקווים' : 'הם') + (k || '') + (l || '') + ' ' + PLU[v];
    }).replace(/^המסלול לא משתנה\./, 'המסלול לא משתנה.');
  }

  /* ---- שלט להדפסה: A4 לאורך (794×1123), עמוד לכל שינוי; הרבה תחנות — עמוד נוסף עם הרשימה ---- */
  var SG_W = 794, SG_H = 1123;

  /* ---- תמונה לסטטוס: 1080×1920 לכל שינוי — מספר הקו, כותרת אחת, מפה קטנה, עד שלושה משפטים ---- */
  var ST_W = 1080, ST_H = 1920;

  /* ================= סוגים נוספים: קו חדש · קו מבוטל · שינוי בלוח הזמנים =================
     p.kind: 'new' / 'ended' / 'timetable' (שינוי מסלול — בלי kind). לכל סוג שקפים משלו, בשלוש הצורות.
     לוח הזמנים — לפי הבחירה בשלב 3 (ED.tt): v = 'gen' כללי / 'det' מפורט, f = 'table' טבלה / 'text' טקסט. */
  /* ימים בשבוע: d0 = ראשון ... d6 = שבת. ימים עם אותו לוח זמנים מקובצים: "א׳–ד׳", "ה׳", "שישי", "שבת" */
  /* לוח באנגלית (ED.blang === 'en') בתצוגות שאינן לוח מודעות: הטקסטים מ-LCDeckEN (deck-en-c.js) — TX(נוסח בעברית), NM(שם), c_* למשפטים.
     בלי — הכול כמו קודם (העברית לא משתנה) */
  function ENc() { return D.ED.blang === 'en' && window.LCBoardEN && window.LCDeckEN; }
  function TX(he) { var X = ENc(); return X && X.c_T[he] != null ? X.c_T[he] : he; }
  function NM(s) { var X = ENc(); return X ? X.c_N(s) : s; }
  function OPN(o) { var X = ENc(); return X ? X.c_op(o) : o; }
  function LDIR() { return ENc() ? ' dir="ltr" lang="en"' : ''; }
  function WDM(iso) { var X = ENc(); return X ? (X.a_dl ? X.a_dl(iso) : X.c_wd(iso) + ' ' + LC.dmy(iso)) : LC.wd(iso) + ' ' + LC.dmy(iso); }   // באנגלית: "Monday, 16 November 2026"
  var DOWS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  var DOW_LET = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], DOW_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'];
  function dix(ts) { return ts.map(function (t) { return DOWS.indexOf(t); }).filter(function (i) { return i >= 0; }).sort(); }
  function daysShort(ts) {
    if (ENc()) return ENc().c_daysShort(ts);
    var ix = dix(ts);
    if (ix.join() === '5') return 'שישי';
    if (ix.join() === '6') return 'שבת';
    var runs = [];
    ix.forEach(function (i) { var r = runs[runs.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]); });
    var parts = runs.map(function (r) { return r.length === 1 ? DOW_LET[r[0]] : DOW_LET[r[0]] + '–' + DOW_LET[r[r.length - 1]]; });
    return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' ו-' + parts[parts.length - 1];
  }
  function dtIn(ts) {   // "בימי חול" · "ביום חמישי" · "בשישי" · "בשבת ובמוצאי שבת" · "בימים א׳–ד׳"
    if (ENc()) return ENc().c_dtIn(ts);
    var ix = dix(ts);
    if (ix.join() === '0,1,2,3,4') return 'בימי חול';
    if (ix.length === 1) return ix[0] < 5 ? 'ביום ' + DOW_FULL[ix[0]] : ix[0] === 5 ? 'בשישי' : 'בשבת ובמוצאי שבת';
    return 'בימים ' + daysShort(ts);
  }
  function dayName(ts) {   // כותרת: "ימי חול (א׳–ה׳)" · "יום חמישי" · "שישי" · "שבת ומוצאי שבת" · "ימים א׳–ד׳"
    if (ENc()) return ENc().c_dayName(ts);
    var ix = dix(ts);
    if (ix.join() === '0,1,2,3,4') return 'ימי חול (א׳–ה׳)';
    if (ix.length === 1) return ix[0] < 5 ? 'יום ' + DOW_FULL[ix[0]] : ix[0] === 5 ? 'שישי' : 'שבת ומוצאי שבת';
    return 'ימים ' + daysShort(ts);
  }
  function trips(n) { if (ENc()) return ENc().c_trips(n); return n === 1 ? 'נסיעה אחת' : n + ' נסיעות'; }
  function every(m) { if (ENc()) return ENc().c_every(m); return m === 60 ? 'כל שעה' : m === 120 ? 'כל שעתיים' : m === 30 ? 'כל חצי שעה' : 'כל ' + m + ' דק׳'; }
  var hm = LC.hm;
  function ttOpt() { var t = D.ED.tt || {}; return { v: t.v === 'det' ? 'det' : 'gen', f: t.f === 'text' ? 'text' : 'table' }; }
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
    if (ENc()) return ENc().c_newTtLine(e);
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
    if (ENc()) return ENc().c_ttLine(e);
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
    if (ENc()) return no.length && no.length < 7 ? ENc().c_noRun(no) : '';
    return no.length && no.length < 7 ? '<b>' + E(dtIn(no)) + '</b> הקו לא נוסע.' : '';
  }
  /* שינוי קטן בלו"ז: עד 6 נסיעות שנוספו או בוטלו בסך הכול, והנסיעה הראשונה/האחרונה לא זזה בחצי שעה או יותר.
     אז תמיד טקסט, ובו בדיוק אילו נסיעות */
  /* נסיעה שבוטלה ונסיעה שנוספה באותה שעה, עד 5 דקות זו מזו — אותה נסיעה שהוזזה: [שעה חדשה, 'sh', השעה הקודמת] */
  var SHIFT_MAX = 5, SHIFT_ONE = 30;
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
    // נסיעה אחת שנוספה ונסיעה אחת שבוטלה, עד 30 דקות זו מזו (ושום נסיעה אחרת לא זזה) — נסיעה אחת שזזה. אותו כלל בכל המקומות:
    // "מה השתנה?", הטבלה, הלוח ומספר הנסיעות שהשתנו (ttCount)
    var ads = [], rms = [];
    items.forEach(function (x, i) { if (!used[i] && x[1] === 'ad') ads.push(i); if (!used[i] && x[1] === 'rm') rms.push(i); });
    if (ads.length === 1 && rms.length === 1 && !items.some(function (x) { return x[1] === 'sh'; }) && Math.abs(items[ads[0]][0] - items[rms[0]][0]) <= SHIFT_ONE) {
      used[rms[0]] = 1; items[ads[0]] = [items[ads[0]][0], 'sh', items[rms[0]][0]];
    }
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
      n += x.ad.length + x.rm.length + x.sh.length;   // נסיעה אחת שזזה (גם עד 30 דקות) — כבר sh ב-mergeSh
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
    if (ENc()) return ENc().c_smallLine(e, x);
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
    if (d.same && d.same.length) it.push(ENc() ? ENc().c_sameLine(d.same) : '<b>' + E(dtIn(d.same)) + '</b> — אין שינוי.');
    return it;
  }
  /* "מה משתנה?" לשער, לשלט ולסטטוס */
  function kindItems(p, max) {
    var ds = p.kind === 'timetable' ? ttDirs(p) : kDirs(p), two = ds.length > 1, out = [], X = ENc();
    var pre = function (d) { return two ? '<b>' + E(toward(d)) + '</b>, ' : ''; };
    if (X && p.kind === 'new') {
      out.push(X.c_kNew(started(p), start(p)));
      var e0 = ds[0], T0 = e0 ? e0.new.stops : [];
      if (T0.length) out.push(X.c_kRuns(T0[0].name, T0[T0.length - 1].name, ds.length > 1, T0.length));
      if (e0 && e0.tt && e0.tt.length) out.push(newTtLine(e0.tt[0]));
      if (e0) { var nr0 = noRun(p, e0); if (nr0) out.push(nr0); }
    } else if (X && p.kind === 'ended') {
      out.push(X.c_kEnded(lastOf(p), started(p), start(p)));
      out.push(X.c_kAlts(altsOf(p)));
    } else if (X && ttSmall(p)) {
      ds.forEach(function (d) { ttItems(p, d).forEach(function (t) { out.push(t.replace(/\.$/, '') + (two ? ' (' + E(toward(d)) + ').' : '.')); }); });
    } else if (p.kind === 'new') {
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
      ds.forEach(function (d) { ttItems(p, d).forEach(function (t, i) { out.push((i ? '' : pre(d)) + (X && two && !i ? t.replace(/^<b>On /, '<b>on ') : t)); }); });
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
    var effTxt = (ENc() ? 'From ' : 'מ-') + LC.dm(start(p));
    // שני כיוונים עם בדיוק אותו לוח זמנים — פעם אחת, "בשני הכיוונים"
    var sig2 = function (d) { return JSON.stringify([o.v === 'gen' ? (d.tt || []).map(function (e) { return [e.t, e.so, e.sn]; }) : d.tt, d.same]); };
    var same2 = ds.length === 2 && sig2(ds[0]) === sig2(ds[1]);
    if (same2) ds = ds.slice(0, 1);
    ds.forEach(function (d, di) {
      var title = same2 ? '<h3 class="tt-dir hd">' + TX('בשני הכיוונים') + '</h3>' : dirTitle(p, d, ds.length), tH = title ? M.titleH : 0;
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
    ['נסיעות ביום', function (s) { return s.n ? String(s.n) : TX('אין'); }, function (a, b) { return a.n !== b.n; }],
    ['הנסיעה הראשונה', function (s) { return s.n ? hm(s.f) : '—'; }, function (a, b) { return a.n && b.n && Math.abs(a.f - b.f) >= 10; }],
    ['הנסיעה האחרונה', function (s) { return s.n ? hm(s.l) : '—'; }, function (a, b) { return a.n && b.n && Math.abs(a.l - b.l) >= 10; }],
    ['כל כמה דקות בשעות השיא', function (s) { return s.pk ? s.pk + TX(' דק׳') : '—'; }, function (a, b) { return a.pk && b.pk && Math.abs(a.pk - b.pk) >= 3; }],
    ['כל כמה דקות בשאר היום', function (s) { return s.op ? s.op + TX(' דק׳') : '—'; }, function (a, b) { return a.op && b.op && Math.abs(a.op - b.op) >= 3; }]
  ];
  function genTable(p, d, title, tH, M, effTxt) {
    var es = d.tt, isNew = p.kind === 'new', ncol = METS.length * (isNew ? 1 : 2);
    var head = '<tr><th class="dt" rowspan="' + (isNew ? 1 : 2) + '">' + TX('ימים') + '</th>' + METS.map(function (m) { return isNew ? '<th>' + TX(m[0]) + '</th>' : '<th colspan="2" class="grp">' + TX(m[0]) + '</th>'; }).join('') + '</tr>' +
      (isNew ? '' : '<tr>' + METS.map(function () { return '<th class="was">' + TX('עד היום') + '</th><th class="now">' + E(effTxt) + '</th>'; }).join('') + '</tr>');
    var rows = es.map(function (e) {
      return '<tr><th class="dt">' + E(daysShort(e.t)) + '</th>' + METS.map(function (m) {
        if (isNew) return '<td class="now">' + m[1](e.sn) + '</td>';
        return '<td class="was">' + m[1](e.so) + '</td><td class="now' + (m[2](e.so, e.sn) ? ' chg' : '') + '">' + m[1](e.sn) + '</td>';
      }).join('') + '</tr>';
    });
    // סוגי ימים בלי שינוי (או שהקו החדש לא נוסע בהם) — שורה בהירה אחת
    var other = isNew ? DOWS.filter(function (t) { return !es.some(function (e) { return e.t.indexOf(t) >= 0; }); }) : (d.same || []);
    if (other.length) rows.push('<tr class="same"><th class="dt">' + E(daysShort(other)) + '</th><td colspan="' + ncol + '">' + TX(isNew ? 'הקו לא נוסע' : 'ללא שינוי') + '</td></tr>');
    return { h: tH + M.th * (isNew ? 1 : 2) + rows.length * M.genH + M.gap,
      html: '<div class="tt-blk">' + title + '<table class="tt-g2' + (isNew ? ' one' : '') + '"><thead>' + head + '</thead><tbody>' + rows.join('') + '</tbody></table></div>' };
  }

  /* ---- מפורט, טבלה: כמו לוח זמנים מודפס. שורה לכל שעה ("14:00" בתא כהה מימין), וכל יציאה בתא משלה
     (הדקות), בסדר עולה מימין לשמאל. מציגים את הלוח החדש; נסיעה חדשה — תא ירוק עם "חדש", נסיעה שבוטלה — באותה שורה,
     תא אדום מחוק. בשינוי קטן — שעות בלי שינוי מתקפלות לשורה אחת בהירה ("06:00–13:00 ללא שינוי") ---- */
  function diffSummary(e) {
    var x = ttDiff(e), t = [];
    if (ENc()) return ENc().c_diffSummary(e, x);
    if (!x.ad.length && !x.rm.length && !x.sh.length) return '';
    // רק נסיעה אחת שזזה: "הנסיעה של 7:35 נדחתה ל-7:45"
    if (!x.ad.length && !x.rm.length && x.sh.length === 1) return '<b>' + E(dtIn(e.t)) + ':</b> הנסיעה של ' + hm(x.sh[0][0]) + (x.sh[0][1] < x.sh[0][0] ? ' הוקדמה ל-' : ' נדחתה ל-') + hm(x.sh[0][1]) + (e.n.length > 1 ? '. השאר ללא שינוי.' : '.');
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
      return '<td class="m' + (x[1] ? ' ' + x[1] : '') + '">' + mm(x[0]) + (x[1] === 'ad' ? '<small>' + TX('חדש') + '</small>' : x[1] === 'rm' ? '<small>' + TX('בוטלה') + '</small>' : x[1] === 'sh' ? '<small>' + TX('היה ') + hm(x[2]) + '</small>' : '') + '</td>';
    };
    var rows = [];
    for (var i = 0; i < hrs.length; i++) {
      var r = hrs[i];
      if (fold && !chg(r)) {
        var j = i; while (j + 1 < hrs.length && !chg(hrs[j + 1])) j++;
        if (j > i) {
          rows.push({ h: M.gridH * 0.8, html: '<tr class="fold"><th class="hr"></th><td colspan="' + K + '"><b class="num">' + hh(r.h * 60) + ':00–' + hh(hrs[j].h * 60) + ':59</b>' + TX(' · ללא שינוי') + '</td></tr>' });
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
    var cap = function (cont) { return '<h4 class="tt-day">' + E(dayName(e.t)) + (cont ? TX(' (המשך)') : '') + '<span>' + (isNew ? trips(e.sn.n) : ENc() ? trips(e.so.n) + ' until now · ' + trips(e.sn.n) + ' from now' : trips(e.so.n) + ' עד היום · ' + trips(e.sn.n) + ' מעכשיו') + '</span></h4>'; };
    return { rows: rows, th: M.th + M.titleH + (sum ? M.lineH : 0) + (title ? M.titleH : 0), gap: M.gap,
      open: function (cont) {
        return '<div class="tt-blk">' + (cont ? '' : title) + cap(cont) + (sum && !cont ? '<p class="tt-sum">' + sum + '</p>' : '') +
          '<table class="tt-grid"><thead><tr><th class="hr">' + TX('שעה') + '</th><th colspan="' + K + '">' + TX(isNew ? 'דקות אחרי השעה' : 'דקות אחרי השעה — הלוח החדש') + '</th></tr></thead><tbody>';
      },
      close: '</tbody></table></div>' };
  }
  /* מפורט, טקסט: כל השעות ברצף — חדשות בירוק, שמבוטלות באדום מחוק */
  function detText(p, e, title, tH, M, effTxt) {
    var items = p.kind === 'new' ? e.n.map(function (m) { return [m, '']; }) : mergeSh(e.o, e.n);
    var head = '<div class="tt-cap"><b>' + E(dayName(e.t)) + '</b><span>' + (p.kind === 'new' ? trips(e.sn.n) : trips(e.so.n) + (ENc() ? ' → ' : ' ← ') + trips(e.sn.n)) + '</span></div>';
    // בטקסט ארוך — מחלקים לשורות של שעה-שעתיים, כדי שהעין תמצא את השעה
    var rows = [], cur = [], curH = -1;
    items.forEach(function (x) { var h = Math.floor(x[0] / 120); if (h !== curH && cur.length) { rows.push(cur); cur = []; } curH = h; cur.push(x); });
    if (cur.length) rows.push(cur);
    return { rows: rows.map(function (r) { return { h: Math.ceil(r.length / M.tok) * M.lineH + 4, html: '<p class="tt-run">' + r.map(function (x) { return tok(x, true); }).join(' ') + '</p>' }; }),
      th: tH + M.titleH, gap: M.gap,
      open: function (cont) { return '<div class="tt-blk">' + (cont ? '' : title) + head.replace('</b>', cont ? TX(' (המשך)') + '</b>' : '</b>'); },
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
    if (ENc()) return o.f === 'table'
      ? '<p class="tt-key"><span><i class="m">20</i>No change</span><span><i class="m ad">20<small>new</small></i>New trip</span><span><i class="m rm">20<small>cancelled</small></i>Cancelled trip</span><span><i class="m sh">30<small>was 14:31</small></i>Moved trip</span></p>'
      : '<p class="tt-key"><span class="tm ad">14:20</span> New trip <span class="tm rm">14:20</span> Cancelled trip <span class="tm sh">14:30</span> Retimed trip</p>';
    return o.f === 'table'
      ? '<p class="tt-key"><span><i class="m">20</i>ללא שינוי</span><span><i class="m ad">20<small>חדש</small></i>נסיעה חדשה</span><span><i class="m rm">20<small>בוטלה</small></i>נסיעה שבוטלה</span><span><i class="m sh">30<small>היה 14:31</small></i>נסיעה שהוזזה</span></p>'
      : '<p class="tt-key"><span class="tm ad">14:20</span> נסיעה חדשה <span class="tm rm">14:20</span> נסיעה שבוטלה <span class="tm sh">14:30</span> נסיעה שהוזזה</p>';
  }
  function ttPagesHtml(p, form, H) { return paginate(ttBlocks(p, form), H || TTM[form].H); }

  /* ---- מפה של כל המסלול (קו חדש: ירוק · קו מבוטל: אדום מקווקו) ---- */
  function routeLegend(p, g) {
    // מפה קרובה (g): התחנות של האזור ממוספרות; בלי "הראשונה והאחרונה" ובלי "קווים אחרים" — הם לא מסומנים בה
    var al = !g && p.kind === 'ended' && altsOf(p).length;
    return '<div class="legend">' + (p.kind === 'new' ? '<span><i class="sw"></i>' + TX('המסלול של הקו החדש') + '</span>' : '<span><i class="sw old"></i>' + (ENc() ? 'Route of the line (until ' : 'המסלול של הקו (עד ') + E(LC.dm(lastOf(p))) + ')</span>') +
      (g ? '<span><i class="dot ' + (p.kind === 'ended' ? 'rem' : 'add') + '">1</i>' + TX('תחנה באזור הזה (כמו ברשימה)') + '</span><span><i class="dot same"></i>' + TX('תחנה אחרת של הקו') + '</span>'
        : '<span><i class="dot same"></i>' + TX('תחנה') + '</span>' + (kTwo(p) ? '<span><i class="dot end"></i><i class="dot end b"></i>' + TX('התחנה הראשונה והאחרונה בכל כיוון') + '</span>'
          : '<span><i class="dot end"></i>' + TX('התחנה הראשונה והאחרונה') + '</span>')) +
      (al ? '<span><i class="dot alt"></i>' + TX('תחנה שעוצרים בה קווים אחרים') + '</span>' : '') + '</div>';
  }
  function routeMap(p) { return { route: true, kind: p.kind, dirs: kDirs(p), alts: p.kind === 'ended' ? altsOf(p) : [] }; }
  function altList(p, max, cls) {
    var al = altsOf(p).slice(0, max || 4);
    if (!al.length) return '<p class="alt-none">' + TX('לא מצאנו קו אחר שעוצר ברוב התחנות של הקו. כדאי לבדוק במוקד או באפליקציה.') + '</p>';
    var X = ENc();
    return '<ul class="alts' + (cls ? ' ' + cls : '') + '">' + al.map(function (a) {
      if (X) return '<li><span class="badge sm num">' + E(a.line) + '</span><span class="at"><b>' + E(X.c_od(a.od) || NM(a.od[0])) + '</b>' +
        '<span>' + E(OPN(a.op)) + ' · stops at ' + a.n + ' of the ' + a.tot + ' stops, e.g. ' + E(NM(a.s)) + '</span></span></li>';
      return '<li><span class="badge sm num">' + E(a.line) + '</span><span class="at"><b>' + E(LC.od(a.od) || a.od[0]) + '</b>' +
        '<span>' + E(a.op) + ' · עוצר ב-' + a.n + ' מתוך ' + a.tot + ' התחנות, למשל ב' + E(a.s) + '</span></span></li>';
    }).join('') + '</ul>';
  }
  function kindMapSlide(p, pre) {
    var ds = kDirs(p), d = ds[0], S = kSide(d, p).stops, two = kTwo(p), X = ENc();
    // שני כיוונים שונים (הלוך וחזור): במקום משפט על הכיוון הראשון — שורה לכל כיוון, עם התחנות והשעות שלו
    var lead = X ? (p.kind === 'new' ? X.c_kNew(started(p), start(p)) + ' ' + (S.length && !two ? X.c_kRuns(S[0].name, S[S.length - 1].name, false, S.length).replace(/^The line runs/, 'It runs') : '')
        : 'Last trip: <b>' + E(WDM(lastOf(p))) + '</b>. ' + (started(p) ? 'The line has not run since.' : 'After that the line will no longer run.'))
      : p.kind === 'new'
      ? (started(p) ? 'הקו התחיל לנסוע ב' : 'הקו יתחיל לנסוע ב') + E(LC.wd(start(p)) + ' ' + LC.dmy(start(p))) + '. ' + (S.length && !two ? 'הוא נוסע מ<b>' + E(S[0].name) + '</b> עד <b>' + E(S[S.length - 1].name) + '</b>, ועוצר ב-' + S.length + ' תחנות.' : '')
      : 'הנסיעה האחרונה: <b>' + E(LC.wd(lastOf(p)) + ' ' + LC.dmy(lastOf(p))) + '</b>. ' + (started(p) ? 'מאז הקו לא נוסע.' : 'אחרי זה הקו לא ייסע יותר.');
    return { id: p.id + '-km', label: pre + 'מפה · ' + (p.kind === 'new' ? 'המסלול של הקו החדש' : 'המסלול של הקו שמבוטל'), map: routeMap(p),
      html: '<div class="s-map k-' + p.kind + (two ? ' two' : '') + '"' + LDIR() + '><div class="smap"></div><div class="side">' +
        '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(OPN(p.op)) + '</span></div>' +
        '<h2 class="hd">' + E(TX(p.kind === 'new' ? 'קו חדש' : 'הקו מפסיק לפעול')) + '</h2><p class="kod">' + E(odTxt(p)) + '</p>' +
        '<p class="lead">' + lead + '</p>' + (two ? kDirBlocks(p, p.kind === 'new' ? 3 : 0) : '') +
        (p.kind === 'ended' ? '<div class="instead"><h3 class="hd">' + TX('במקום זה') + '</h3>' + altList(p, two ? 2 : 3) + '</div>'
          : (!two && d.tt && d.tt.length ? '<ul class="tt-list sm">' + ttItems(p, d).slice(0, 3).map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '')) +
        routeLegend(p) +
        '<div style="font-size:13px;color:var(--s-sub)">' + TX('הוכן על ידי אדם פרטי · לא פרסום רשמי') + '</div>' +
        '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>' };
  }
  /* קו חדש או מבוטל עם שני כיוונים שונים (הלוך וחזור): בשקף המפה, בשלט ובסטטוס — בלוק קצר לכל כיוון:
     "מבית שמש לנוף הגליל: מ<הראשונה> עד <האחרונה>, 38 תחנות", ומתחתיו השעות של הכיוון (עד nTT שורות) */
  function kTwo(p) { return (p.kind === 'new' || p.kind === 'ended') && kDirs(p).length > 1; }
  function kDirLbl(d) { var o = d.od || []; if (ENc()) return o[0] && o[1] && o[0] !== o[1] ? 'From ' + NM(o[0]) + ' to ' + NM(o[1]) : 'From ' + NM(endName(d, 0)) + ' to ' + NM(endName(d, 1)); return o[0] && o[1] && o[0] !== o[1] ? 'מ' + o[0] + ' ל' + o[1] : 'מ' + endName(d, 0) + ' ל' + endName(d, 1); }
  function kDirBlocks(p, nTT) {
    return '<div class="kdirs">' + kDirs(p).slice(0, 3).map(function (d, i) {
      var S = kSide(d, p).stops; if (!S.length) return '';
      var its = nTT ? ttItems(p, d).slice(0, nTT) : [];
      return '<div class="kdir"><p><i class="dot end' + (i ? ' b' : '') + '"></i><span><b>' + E(kDirLbl(d)) + ':</b> ' + (ENc() ? 'from ' + E(NM(S[0].name)) + ' to ' + E(NM(S[S.length - 1].name)) + ', ' + S.length + ' stops' : 'מ' + E(S[0].name) + ' עד ' + E(S[S.length - 1].name) + ', ' + S.length + ' תחנות') + '</span></p>' +
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
        html: '<div class="s-stops s-rstops"' + LDIR() + '><div class="head"><span class="badge sm num">' + E(p.line) + '</span><h2 class="hd">' + (ENc() ? 'Stops' : 'התחנות') + ' · ' + E(trip(d)) + (i ? TX(' (המשך)') : '') + '</h2></div>' +
          '<div class="rcols">' + cols.map(function (c, ci) {
            return '<ol>' + c.map(function (s, j) {
              var k = i * per + ci * rows + j, end = k === 0 || k === S.length - 1;
              return '<li><i class="dot ' + (end ? 'end' : 'add') + '">' + (k + 1) + '</i><span class="nm">' + E(NM(s.name)) + (s.city && s.city !== main ? ' <span class="cd">' + E(NM(s.city)) + '</span>' : '') + '</span></li>';
            }).join('') + '</ol>';
          }).join('') + '</div>' +
          '<div class="sfoot"><span>' + S.length + (ENc() ? ' stops · Prepared by a private individual, not an official publication' : ' תחנות · הוכן על ידי אדם פרטי, לא פרסום רשמי') + '</span><span class="pg num"></span></div></div>' });
    }
    return out;
  }
  /* "במקום זה" — שקף עם כל הקווים שעוצרים בתחנות של קו שמבוטל */
  function altsSlide(p, pre) {
    return { id: p.id + '-alt', label: pre + 'במקום זה: קווים אחרים',
      html: '<div class="s-alts"' + LDIR() + '><div class="head"><span class="badge sm num">' + E(p.line) + '</span><h2 class="hd">' + TX('במקום הקו: קווים שעוצרים באותן תחנות') + '</h2></div>' +
        '<p class="lead">' + (ENc() ? 'These lines stop at many of line ' + E(p.line) + '’s stops. They do not follow exactly the same route — check where each line goes before boarding.'
          : 'הקווים האלה עוצרים בחלק גדול מהתחנות של קו ' + E(p.line) + '. הם לא נוסעים בדיוק באותו מסלול — בדקו לאן כל קו נוסע לפני שעולים.') + '</p>' +
        altList(p, 5, 'big') +
        '<div class="sfoot"><span>' + TX('לפי התחנות שבהן הקווים עוצרים בנתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי') + '</span><span class="pg num"></span></div></div>' };
  }
  /* שקפי לוח הזמנים (מצגת) */
  function ttSlides(p, pre) {
    var o = ttOpt(), pages = ttPagesHtml(p, 'deck');
    var ttl = p.kind === 'new' ? 'מתי הקו נוסע' : 'לוח הזמנים החדש', en = ENc();
    return pages.map(function (h, i) {
      return { id: p.id + '-tt' + i, label: pre + ttl + (pages.length > 1 ? ' (' + (i + 1) + '/' + pages.length + ')' : ''),
        html: '<div class="s-tt"' + LDIR() + '><div class="head"><span class="badge sm num">' + E(p.line) + '</span><div class="t"><h2 class="hd">' + E(TX(ttl)) + (i ? TX(' (המשך)') : '') + '</h2>' +
          '<p class="sub">' + E((p.kind === 'timetable' ? (ttDirs(p).length === 1 ? trip(ttDirs(p)[0]) + ' · ' : '') : '') + (en ? 'Effective ' + WDM(start(p)) : (p.kind === 'new' ? 'החל מ-' : 'החל מ') + (p.kind === 'new' ? LC.dmy(start(p)) : WDM(start(p))))) + '</p></div>' + ttKey(p) + '</div>' +
          '<div class="tt-body f-' + o.f + ' v-' + o.v + '">' + h + '</div>' +
          '<div class="sfoot"><span>' + TX('שעת היציאה מהתחנה הראשונה · שעות השיא: 7:00–9:00 ו-16:00–19:00 · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי') + '</span><span class="pg num"></span></div></div>' };
    });
  }
  /* ---- מפות מקורבות לתחנות (קו חדש / מבוטל): אחרי מפת כל המסלול — מפה קרובה לכל מקום שבו הקו נכנס ליישוב
     או לשכונה (מושב, קיבוץ, לולאה בעיר), כשבמפה הכללית התחנות שם צפופות מדי. בחירה של מי שמכין (ED.zm):
     'yes' / 'no'; בלי בחירה — בקו חדש כן, בקו מבוטל לא ---- */
  function zoomOn(p) { return D.ED.zm === 'yes' ? true : D.ED.zm === 'no' ? false : p.kind === 'new'; }
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
      if (ENc()) return c ? 'in ' + NM(c) : 'near ' + NM(S[g.ix[0]].name);
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
      return '<li style="display:flex;gap:6px;align-items:center;break-inside:avoid;margin-bottom:4px"><i class="dot ' + (p.kind === 'ended' ? 'rem' : 'add') + '">' + (k + 1) + '</i><span>' + E(NM(S[k].name)) + '</span></li>';
    }).join('') + (g.ix.length > ix.length ? '<li>' + (ENc() ? 'and ' + (g.ix.length - ix.length) + ' more stops' : 'ועוד ' + (g.ix.length - ix.length) + ' תחנות') + '</li>' : '') + '</ol>';
  }
  function zoomSlides(p, pre) {
    if (!zoomOn(p)) return [];
    var gs = zoomGroups(p);
    return gs.map(function (g, i) {
      return { id: p.id + '-kz' + i, label: pre + 'מפה קרובה · ' + g.name, map: zoomMap(p, g),
        html: '<div class="s-map k-' + p.kind + '"' + LDIR() + '><div class="smap"></div><div class="inset"></div><div class="side">' +
          '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(OPN(p.op)) + '</span></div>' +
          '<h2 class="hd">' + E((ENc() ? (p.kind === 'new' ? 'The new line ' : 'The discontinued line ') : p.kind === 'new' ? 'הקו החדש ' : 'הקו שמבוטל ') + g.name) + '</h2>' +
          (gs.length > 1 ? '<p class="part">' + (ENc() ? 'Close-up map ' + (i + 1) + ' of ' + gs.length : 'מפה קרובה ' + (i + 1) + ' מתוך ' + gs.length) + '</p>' : '') +
          '<p class="kod">' + E(trip(g.d)) + ' · ' + g.ix.length + (ENc() ? ' stops here (numbers as in the stop list)' : ' תחנות כאן (המספרים כמו ברשימת התחנות)') + '</p>' +
          zoomList(p, g, 16) + routeLegend(p, g) +
          '<div style="font-size:13px;color:var(--s-sub)">' + TX('הוכן על ידי אדם פרטי · לא פרסום רשמי') + '</div>' +
          '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>' };
    });
  }
  function kindSlides(p, pre, noTt) {
    var out = [];
    if (p.kind === 'new' || p.kind === 'ended') { out.push(kindMapSlide(p, pre)); zoomSlides(p, pre).forEach(function (s) { out.push(s); }); }
    if (p.kind === 'new') kDirs(p).forEach(function (d) { routeStopsSlides(p, d, pre, D.ED.look === 'large' ? 9 : 12).forEach(function (s) { out.push(s); }); });
    if (p.kind === 'ended' && altsOf(p).length > 3) out.push(altsSlide(p, pre));
    if (p.kind !== 'ended' && !noTt) ttSlides(p, pre).forEach(function (s) { out.push(s); });
    return out;
  }

  /* כותרת ליד התגית הכחולה, שכבר מראה את מספר הקו — בלי לחזור על המספר */
  function badgeTitle(p) {
    if (ENc()) return p.kind === 'new' ? 'New line' : p.kind === 'ended' ? 'Discontinued' : p.kind === 'timetable' ? 'New timetable' : 'Change';
    return p.kind === 'new' ? 'קו חדש' : p.kind === 'ended' ? 'מפסיק לפעול' : p.kind === 'timetable' ? 'לוח זמנים חדש' : 'שינוי';
  }
  function kindTitle(p) {
    if (ENc()) return p.kind === 'new' ? 'New line: ' + p.line : p.kind === 'ended' ? 'Line ' + p.line + ' discontinued' : 'New timetable for line ' + p.line;
    return p.kind === 'new' ? 'קו חדש: ' + p.line : p.kind === 'ended' ? 'קו ' + p.line + ' מפסיק לפעול' : 'לוח זמנים חדש לקו ' + p.line;
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
    if (ENc()) return ENc().c_durTxt(m);
    if (!m) return '';
    m = Math.max(5, Math.round(m / 5) * 5);
    var h = Math.floor(m / 60), r = m % 60, rr = r ? ' ו-' + r + ' דק׳' : '';
    return h === 0 ? 'כ-' + r + ' דק׳' : h === 1 ? 'כשעה' + rr : h === 2 ? 'כשעתיים' + rr : 'כ-' + h + ' שעות' + rr;
  }
  function dShort(ix) { if (ENc()) return ENc().c_ds(ix); return daysShort(ix.map(function (i) { return DOWS[i]; })); }
  function linesTxt(ps) { var l = ps.map(function (p) { return p.line; }); if (ENc()) return ENc().c_linesTxt(l); return l.length === 1 ? 'קו ' + l[0] : 'קווים ' + andList(l, 8); }
  /* קבוצות: אותו זוג ערים (בינעירוני) — טבלה אחת, גם כשהקווים של חברות שונות */
  function cuGroups(pages) {
    var sep = D.ED.ttc === 'sep', out = [], by = {};
    pages.forEach(function (p) {
      var o = p.od || [], k = !sep && o[0] && o[1] && o[0] !== o[1] ? [o[0], o[1]].sort().join('|') : p.id;
      if (!by[k]) out.push(by[k] = { pages: [] });
      by[k].pages.push(p);
    });
    out.forEach(function (g) {
      var multi = g.pages.length > 1, byOp = D.ED.look === 'op' || opsOf(g.pages).length > 1, seen = {};
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
        return { title: ENc() ? 'From ' + NM(from) + ' to ' + NM(to) : 'מ' + from + ' ל' + to, items: items };
      };
      return [mk(A, B, '1'), mk(B, A, '2')].filter(function (s) { return s.items.length; });
    }
    var out = [];
    P.forEach(function (p) {
      p.dirs.forEach(function (d) {
        var o = d.od || [];
        if (ENc()) out.push({ title: o[0] && o[1] && o[0] !== o[1] ? 'From ' + NM(o[0]) + ' to ' + NM(o[1]) : p.dirs.length > 1 ? 'To ' + NM(d.t) : TX('מסלול הקו'),
          sub: d.f && d.t ? NM(d.f) + ' → ' + NM(d.t) : '', items: [{ p: p, d: d }] });
        else out.push({ title: o[0] && o[1] && o[0] !== o[1] ? 'מ' + o[0] + ' ל' + o[1] : p.dirs.length > 1 ? 'לכיוון ' + d.t : 'מסלול הקו',
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
      p._via = any ? (ex[i].length ? (ENc() ? 'via ' + ENc().c_and(ex[i].map(NM), 2) : 'דרך ' + andList(ex[i], 2)) : TX('ישיר')) : '';
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
  /* החלופות שמופיעות בצד הזה: סימן לכל (קו, חלופה) — # ^ $ ~ + * לפי הסדר, כמו בלוחות של קווים; side.alts — למקרא.
     יותר משישה (כמה קווים בצד אחד) — הסימנים כפולים: ** ## … */
  var ALT_LET = '#^$~+*';   // * בסוף: בתחתית הלוח יש מספרי טלפון עם כוכבית (*2060)
  function altSym(i) { var c = ALT_LET.charAt(i % ALT_LET.length); return new Array(Math.floor(i / ALT_LET.length) + 2).join(c); }
  function cuAlts(side, cols) {
    var used = {}, list = [];
    cols.forEach(function (c) { c.ents.forEach(function (e) { if (e.a) { var k = e.li + ':' + e.a; if (!used[k]) list.push(used[k] = { li: e.li, a: e.a, ms: [] }); used[k].ms.push(e.m); } }); });
    list.sort(function (x, y) { return x.li - y.li || x.a - y.a; });
    list.forEach(function (x, i) { var it = side.items[x.li]; x.L = altSym(i); x.p = it.p; x.txt = (it.d.v || [])[x.a - 1] || 'במסלול אחר'; if (ENc()) x.txt = ENc().c_altTxt(x.txt); });
    cols.forEach(function (c) { c.ents.forEach(function (e) { e.al = e.a ? used[e.li + ':' + e.a].L : ''; }); });
    side.alts = list;
  }
  /* סימנים ליד השעה: סימן החלופה — לפני השעה (#07:00, שלמה 23.11; היחידה משמאל לימין), ו-×2 אחריה במצגת (עדין; בשלט ובסטטוס — .xn אחרי התגית) */
  function cuAl(e) { return e.al ? '<i class="al">' + e.al + '</i>' : ''; }
  function cuMarks(e, form) {
    return e.n > 1 && form === 'deck' ? '<sup class="x2">×' + e.n + '</sup>' : '';
  }
  /* מקרא לסימנים: רק מה שמופיע ברשימה ents. multi — יש כמה קווים (אז גם מספר הקו ליד החלופה) */
  function cuKey(side, ents, multi) {
    var has = {}, dbl = false;
    ents.forEach(function (e) { if (e.al) has[e.al] = 1; if (e.n > 1) dbl = true; });
    var its = (side.alts || []).filter(function (x) { return has[x.L]; }).map(function (x) {
      return '<span><i class="al">' + x.L + '</i>' + E((multi ? TX('קו') + ' ' + x.p.line + ' ' : '') + x.txt) + '</span>';
    });
    if (dbl) its.push('<span><b class="num" dir="ltr">×2</b> ' + (ENc() ? 'two buses at the same time (extra bus)' : 'שני אוטובוסים באותה שעה (תגבור)') + '</span>');
    return its.length ? '<p class="cu-key">' + its.join('') + '</p>' : '';
  }
  /* כללי: "חלק מהנסיעות דרך X (בשעות …)" */
  function cuAltLines(side, multi) {
    return (side.alts || []).map(function (x) {
      var ms = x.ms.filter(function (m, i, a) { return a.indexOf(m) === i; }).sort(function (a, b) { return a - b; });
      if (ENc()) return '<li>' + E((multi ? 'Line ' + x.p.line + ': some' : 'Some') + ' trips ' + x.txt + ' (' + ENc().c_altWhen(ms, hm2) + ')') + '</li>';
      var when = ms.length === 1 ? 'בשעה ' + hm2(ms[0]) : ms.length <= 3 ? 'בשעות ' + andList(ms.map(hm2), 3) : 'בשעות ' + hm2(ms[0]) + '–' + hm2(ms[ms.length - 1]);
      return '<li>' + E((multi ? 'קו ' + x.p.line + ': ' : '') + 'חלק מהנסיעות ' + x.txt + ' (' + when + ')') + '</li>';
    }).join('');
  }
  function cuLabel(c) {
    if (ENc()) return c.hol ? ENc().c_hol(c.hol[2]) : ENc().c_dayLbl(c.days, c.ents.every(function (e) { return e.m >= 16 * 60; }));
    if (c.hol) return c.hol[2];
    var k = c.days.join(',');
    if (k === '0,1,2,3,4') return 'א׳–ה׳';
    if (k === '5') return 'שישי';
    if (k === '6') return c.ents.every(function (e) { return e.m >= 16 * 60; }) ? 'מוצאי שבת' : 'שבת';
    return c.days.length === 1 ? 'יום ' + dShort(c.days) : dShort(c.days);
  }
  function cuSub(c) { return c.hol ? (ENc() ? ENc().c_wd(c.hol[0]) : LC.wd(c.hol[0])) + ' ' + LC.dm(c.hol[0]) : ''; }
  function cuNote(e, c) {
    if (ENc()) return ENc().c_cuNote(e, c);
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
  function cuStyle(g) { return D.ED.look === 'op' ? ' style="' + lookVars('op', g.pages) + '"' : ''; }
  function cuLb(p) { return p._c ? '<span class="lb num" style="background:' + p._c + '">' + E(p.line) + '</span>' : ''; }
  /* שורה ברשימה: שעה · תגית הקו · ×2 (רק בשלט ובסטטוס) · הערה ("ה׳ בלבד", "בלילה") */
  function cuRow(e, c, form) {
    var nt = cuNote(e, c), night = e.m >= 1440;
    return '<li' + (nt || night ? ' class="hn"' : '') + '><span class="tm num">' + cuAl(e) + hm2(e.m) + cuMarks(e, form) + '</span>' + cuLb(e.p) +
      (e.n > 1 && form !== 'deck' ? '<small class="xn num">×' + e.n + '</small>' : '') +
      (nt || night ? '<small class="nt">' + E([nt, night ? TX('בלילה') : ''].filter(Boolean).join(' · ')) + '</small>' : '') + '</li>';
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
          return '<span class="num" dir="ltr"' + (e.p._c ? ' style="color:' + e.p._c + '"' : '') + '>' + cuAl(e) + String(e.m % 60).padStart(2, '0') + (e.part ? '°' : '') + cuMarks(e, 'deck') + '</span>';
        }).join(' ') + '</span></li>' };
    });
    if (c.ents.some(function (e) { return e.part; })) out.push({ h: lineH + 6, hour: true, html: '<li class="hn"><small class="nt">' + TX('° רק בחלק מהימים') + '</small></li>' });
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
      if (!rows.length) out.push({ c: c, w: 1, rows: ['<li class="none">' + TX('אין נסיעות') + '</li>'], cont: false });
    });
    return out;
  }
  function cuSideHtml(side, chunks, cont) {
    var slots = chunks.reduce(function (t, k) { return t + k.w; }, 0), ents = [];
    chunks.forEach(function (k) { ents = ents.concat(k.ents || []); });
    return '<section class="cu-side"><h2 class="cu-sh hd">' + E(side.title) + (cont ? TX(' (המשך)') : '') + '</h2>' +
      (side.sub ? '<p class="cu-ss">' + E(side.sub) + '</p>' : '') + cuKey(side, ents, side.items.length > 1 && side.items.some(function (it) { return it.p !== side.items[0].p; })) +
      '<div class="cu-cols' + (chunks.some(function (k) { return k.c.hol; }) ? ' hashol' : '') + '" style="grid-template-columns:repeat(' + slots + ',minmax(0,1fr))">' + chunks.map(function (k) {
        return '<div class="cu-col' + (k.w > 1 ? ' hrs' : '') + '" style="grid-column:span ' + k.w + '"><h3 class="cu-ch">' + E(k.c.label) + (k.cont ? TX(' (המשך)') : '') +
          (cuSub(k.c) ? '<small>' + E(cuSub(k.c)) + '</small>' : '') + '</h3><ol class="ttc">' + k.rows.join('') + '</ol></div>';
      }).join('') + '</div></section>';
  }
  function cuLegend(g) {
    if (g.pages.length < 2) return '';
    var many = opsOf(g.pages).length > 1;
    return '<div class="cu-leg">' + g.pages.map(function (p) {
      return '<span>' + cuLb(p) + E([many ? OPN(p.op) : '', p._via, durTxt(p._du)].filter(Boolean).join(' · ')) + '</span>';
    }).join('') + '</div>';
  }
  function cuTitle(g) {
    var o = g.od;
    if (ENc()) return o[0] && o[1] && o[0] !== o[1] ? NM(o[0]) + ' ↔ ' + NM(o[1]) : 'Line ' + g.pages[0].line + (o[0] ? ' · ' + NM(o[0]) : '');
    return o[0] && o[1] && o[0] !== o[1] ? o[0] + ' ↔ ' + o[1] : 'קו ' + g.pages[0].line + (o[0] ? ' · ' + o[0] : '');
  }
  function cuValid(g) {
    var v = g.pages.map(function (p) { return p.valid || p.eff; }).filter(Boolean).sort()[0], wu = curWk(g.pages);
    if (ENc()) return v ? 'Valid from ' + LC.dmy(v) + (wu ? ' until ' + LC.dmy(wu) : '') : '';
    return v ? 'בתוקף מ-' + LC.dmy(v) + (wu ? ' עד ' + LC.dmy(wu) : '') : '';
  }
  /* הלוח של השבוע עד השינוי (curPre): היום האחרון שלו */
  function curWk(pages) { var u = pages.map(function (p) { return p.wkUntil || ''; }).sort(); return u.length && u[0] ? u[0] : ''; }
  function cuHead(g, big) {
    var ops = opsOf(g.pages);
    return '<div class="cu-head"><div class="t">' + (g.pages.length === 1 ? '<span class="badge sm num">' + E(g.pages[0].line) + '</span>' : '') +
      '<div><h1 class="hd">' + E(cuTitle(g)) + '</h1><p class="sub">' + E([TX('לוח זמנים'), g.pages.length > 1 ? linesTxt(g.pages) : '', ops.map(OPN).join(', '), cuValid(g)].filter(Boolean).join(' · ')) + '</p></div></div>' +
      cuLegend(g) + '</div>';
  }
  function cuFoot(form) {
    return '<div class="cu-foot"><span>' + TX('השעות הן שעות היציאה מהתחנה הראשונה · "בלילה" = אחרי חצות של אותו לילה · לפי נתוני משרד התחבורה · לא פרסום רשמי') +
      (D.ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>';
  }
  /* ---- כללי: לכל קבוצת ימים — כמה נסיעות, הראשונה והאחרונה, ותדירות בכל חלק של היום ---- */
  var BANDS = [[180, 540, 'בוקר', '6–9'], [540, 900, 'צהריים', '9–15'], [900, 1140, 'אחה״צ', '15–19'], [1140, 1440, 'ערב', '19–24'], [1440, 1620, 'לילה', 'אחרי 24']];
  function bandTxt(ms) {
    if (ENc()) return ENc().c_bandTxt(ms);
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
    var BX = ENc() ? ENc().c_BANDS : {};
    var head = '<tr><th>' + TX('ימים') + '</th><th>' + TX('נסיעות') + '</th><th>' + TX('הראשונה') + '</th><th>' + TX('האחרונה') + '</th>' + bands.map(function (b) { return '<th>' + (BX[b[2]] || b[2]) + '<small>' + (BX[b[3]] || b[3]) + '</small></th>'; }).join('') + '</tr>';
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
    if (cols.some(function (c) { return c.ents.some(function (e) { return e.n > 1; }); })) al += '<li>' + TX('מספר הנסיעות כולל תגבורים (כמה אוטובוסים שיוצאים באותה שעה)') + '</li>';
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
          html: '<div class="s-cur f-' + form + ' v-' + o.v + '"' + cuStyle(g) + LDIR() + '>' + cuHead(g) + '<div class="cu-body">' + body + '</div>' + cuFoot(form) + '</div>' };
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
      var lt = g.pages.length > 1 ? linesTxt(g.pages) + ' · ' + (opsOf(g.pages).length === 1 ? OPN(g.pages[0].op) + ' · ' : '') : g.pages[0].op ? OPN(g.pages[0].op) + ' · ' : '';
      g.sides.forEach(function (s, si) {
        var cols = cuCols(s, hol);
        if (!cols.length) return;
        var head = function (sub) {
          return '<div class="cu-head"><div class="t">' + (g.pages.length === 1 ? '<span class="badge sm num">' + E(g.pages[0].line) + '</span>' : '') +
            '<div><h1 class="hd">' + E(s.title) + '</h1><p class="sub">' + E(sub) + '</p></div></div>' + cuLegend(g) + '</div>';
        };
        var foot = '<div class="sfoot"><span>' + TX('שעות היציאה מהתחנה הראשונה · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי') + '</span><span class="pg num"></span></div>';
        if (o.v === 'gen') {
          out.push({ id: 'cu' + gi + '-' + si, label: 'לו״ז · ' + s.title,
            html: '<div class="s-cur f-deck v-gen"' + cuStyle(g) + LDIR() + '>' + head(lt + TX('לוח זמנים עדכני · ') + cuValid(g)) + '<div class="cu-body">' + cuGenTable({ title: '', alts: s.alts }, cols, g).replace('<h2 class="cu-sh hd"></h2>', '') + '</div>' + foot + '</div>' });
          return;
        }
        cols.forEach(function (c, ci) {
          // עם מקרא לסימנים (חלופה, ×2) — שורה אחת פחות בכל עמודה
          var n = c.ents.length, ky = (c.ents.some(function (e) { return e.al || e.n > 1; }) ? 1 : 0) + (g.pages.length > 2 ? 1 : 0), parts = [];
          var L = n <= 21 - 3 * ky ? [3, 7 - ky, 1] : n <= 32 - 4 * ky ? [4, 8 - ky, 2] : n <= 50 - 5 * ky ? [5, 10 - ky, 3] : null;
          if (L) { for (var i = 0; i < Math.max(1, n); i += L[0] * L[1]) parts.push(c.ents.slice(i, i + L[0] * L[1])); }
          var dayTxt = (c.hol ? c.label + ' · ' + cuSub(c) : (c.days.length > 1 && !ENc() ? 'ימים ' : '') + c.label);
          if (!L) {   // קו תדיר: לפי שעה, בשתי עמודות
            var rows = cuHourRows(c, 11, 30), H = 500, pg = [[]], used = 0;
            rows.forEach(function (r) { var cur = pg[pg.length - 1]; if (used + r.h > H * 2 && cur.length) { pg.push(cur = []); used = 0; } cur.push(r); used += r.h; });
            pg.forEach(function (rs, k) {
              out.push({ id: 'cu' + gi + '-' + si + '-' + ci + (k ? '-' + k : ''), label: 'לו״ז · ' + s.title + ' · ' + c.label + (pg.length > 1 ? ' (' + (k + 1) + ')' : ''),
                html: '<div class="s-cur f-deck v-det"' + cuStyle(g) + LDIR() + '>' + head(lt + dayTxt + ' · ' + TX('לוח זמנים עדכני · ') + cuValid(g) + (k ? TX(' (המשך)') : '')) +
                  cuKey(s, [].concat.apply([], rs.map(function (r) { return r.es || []; })), g.pages.length > 1) +
                  '<ol class="ttc cu-hrs">' + rs.map(function (r) { return r.html; }).join('') + '</ol>' + foot + '</div>' });
            });
            return;
          }
          parts.forEach(function (es, k) {
            out.push({ id: 'cu' + gi + '-' + si + '-' + ci + (k ? '-' + k : ''), label: 'לו״ז · ' + s.title + ' · ' + c.label + (parts.length > 1 ? ' (' + (k + 1) + ')' : ''),
              html: '<div class="s-cur f-deck v-det"' + cuStyle(g) + LDIR() + '>' + head(lt + dayTxt + ' · ' + TX('לוח זמנים עדכני · ') + cuValid(g) + (k ? TX(' (המשך)') : '')) +
                cuKey(s, es, g.pages.length > 1) + '<ol class="ttc cu-grid sz' + L[2] + '" style="grid-template-rows:repeat(' + L[1] + ',minmax(0,1fr))">' +
                (es.length ? es.map(function (e) { return cuRow(e, c, 'deck'); }).join('') : '<li class="none">' + TX('אין נסיעות') + '</li>') + '</ol>' + foot + '</div>' });
          });
        });
      });
    });
    return out;
  }
  /* קו שמשתנה בימים הקרובים (p.pre מ-ttPick): קודם הלוח של השבוע עד השינוי ("עד 28.11" — מהיום ועד יום לפני השינוי),
     ואחריו הלוח מהשינוי ("החל מ-29.11"). בלוח הראשון: הקו שמשתנה — הלו"ז של הימים האלה (pre), ושאר הקווים — רק אותם ימים.
     מחזיר את הקווים ללוח הראשון, או null כשאף קו לא משתנה השבוע */
  function curPre(pages) {
    var ps = pages.filter(function (p) { return p.pre; });
    if (!ps.length) return null;
    var wu = ps.map(function (p) { return p.pre.wkUntil; }).sort()[0], dow = ps[0].pre.dow;
    return pages.map(function (p) {
      var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; });
      q.pre = null; q.fromEff = ''; q.until = ''; q.wkUntil = wu;
      if (p.pre) { q.dirs = p.pre.dirs; q.valid = q.eff = p.pre.valid; q.dow = p.pre.dow; q.hol = p.pre.hol; return q; }
      // קו שלא משתנה: רק הימים של הלוח הזה (מהיום ועד wu)
      q.dow = dow;
      q.dirs = p.dirs.map(function (d) {
        var o = {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; });
        o.days = d.days.map(function (x, w) { return dow.indexOf(w) >= 0 ? x : []; });
        o.x = {}; Object.keys(d.x || {}).forEach(function (iso) { if (iso <= wu) o.x[iso] = d.x[iso]; });
        return o;
      });
      q.hol = (p.hol || []).filter(function (h) { return h[0] <= wu; });
      return q;
    });
  }
  function curBuild(pages, feed) {
    var pre = curPre(pages);
    if (!pre) return curBuild1(pages, feed);
    var wu = pre[0].wkUntil, fe = LC.addDays(wu, 1);
    var a = curBuild1(pre, feed).filter(function (s) { return s.id !== 'close'; }), b = curBuild1(pages, feed), out = [];
    a.forEach(function (s) { s.id = 'wk-' + s.id; s.label = 'עד ' + LC.dm(wu) + ' · ' + s.label; out.push(s); });
    b.forEach(function (s) { if (s.id !== 'close') s.label = 'החל מ-' + LC.dm(fe) + ' · ' + s.label; out.push(s); });
    out.pages = b.pages;
    return out;
  }
  function curBuild1(pages, feed) {
    var hol = D.ED.hol || [];
    if (D.ED.ttc === 'board') {
      var bs = D.bdSlides(pages, D.ED.form === 'sign' || D.ED.form === 'status' ? D.ED.form : 'deck');
      if (D.ED.form !== 'sign' && D.ED.form !== 'status') bs.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(bs.pages || pages, feed) });
      return bs;
    }
    if (D.ED.form === 'sign') return cuPaged(pages, 'sign', hol);
    if (D.ED.form === 'status') return cuPaged(pages, 'status', hol);
    var s = cuDeck(pages, hol);
    s.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(pages, feed) });
    return s;
  }

  /* ================= טבלת לו"ז לכמה קווים (שינוי בלו"ז וקו חדש — כשיש במצגת שניים או יותר) =================
     "רק מה שהשתנה" — שורה קצרה לכל קו (שקף סיכום אחרי השער, ובסטטוס).
     מפורט — "לפי יעד": פס צבעוני לכל זוג ערים, שורה לכל קו וכיוון, עמודה לכל קבוצת ימים (החלוקה הדקה ביותר שמשותפת
     לכל השורות), ובתא — שעות היציאה: חדשה בירוק, שבוטלה באדום מחוק, שהוזזה בכתום. "אינו פעיל" — אין נסיעות.
     כללי — לכל קו, כיוון וקבוצת ימים: כמה נסיעות (לפני ← אחרי), הראשונה, האחרונה ומה השתנה. */
  function ttCap(p) { return (p.kind === 'timetable' || p.kind === 'new') && p.dirs.some(function (d) { return d.tt && d.tt.length; }); }
  function mtDirs(p) { return (p.kind === 'timetable' ? ttDirs(p) : kDirs(p)).filter(function (d) { return d.tt && d.tt.length; }); }
  function lastStop(d) { var S = (d.new && d.new.stops.length ? d.new : d.old).stops; return S.length ? S[S.length - 1].name : ''; }
  function mtFrom(d) { var o = d.od || []; if (ENc()) return o[0] && o[1] && o[0] !== o[1] ? 'From ' + NM(o[0]) : 'To ' + NM(lastStop(d)); return o[0] && o[1] && o[0] !== o[1] ? 'מ' + o[0] : 'ל' + streetOf(lastStop(d)); }
  /* שורות: קבוצה לכל זוג ערים (בלי קשר לחברה) */
  function mtGroups(pages) {
    var by = {}, out = [];
    pages.forEach(function (p) {
      var o = p.od || [], k = o[0] && o[1] ? [o[0], o[1]].sort().join('|') : p.id;
      if (!by[k]) out.push(by[k] = { label: ENc() ? (o[0] && o[1] && o[0] !== o[1] ? NM(o[0]) + ' – ' + NM(o[1]) : (o[0] ? NM(o[0]) : p.line) + ' · city lines')
        : o[0] && o[1] && o[0] !== o[1] ? o[0] + ' – ' + o[1] : (o[0] || p.line) + ' · קווים בעיר', rows: [] });
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
      if (ENc()) { var X = ENc(); c.label = c.hol ? X.c_hol(c.hol[2]) : X.c_dayLbl(c.days, true, true); c.sub = c.hol ? X.c_wd(c.hol[0]) + ' ' + LC.dm(c.hol[0]) : ''; return; }
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
    if (items === 'same') return { n: 1, html: '<td class="tx">' + TX('ללא שינוי') + '</td>' };
    if (!items || !items.length) return { n: 1, html: '<td class="tx off">' + TX('אינו פעיל') + '</td>' };
    var toks = [];
    items.forEach(function (x) {
      var t = toks[toks.length - 1];
      if (t && t.m === x[0] && t.k === x[1]) { t.n++; return; }
      toks.push({ m: x[0], k: x[1], n: 1, was: x[2] });
    });
    return { n: toks.length, html: '<td class="tms">' + toks.map(function (t) {
      return '<span class="tm' + (t.k ? ' ' + t.k : '') + '"' + (t.k === 'sh' ? ' title="' + TX('היה ') + hm2(t.was) + '"' : '') + '>' + hm2(t.m) +
        (t.n > 1 && form === 'sign' ? '<small class="xn">×' + t.n + '</small>' : '') + '</span>';
    }).join(' ') + '</td>' };
  }
  var MTM = {
    deck: { W: 1184, lineW: 74, fromW: 150, tokW: 64, lineH: 27, pad: 12, bandH: 38, headH: 44, H: 530 },
    sign: { W: 730, lineW: 50, fromW: 96, tokW: 45, lineH: 20, pad: 8, bandH: 30, headH: 38, H: 880 }
  };
  function mtKey(form) {
    return '<p class="mt-key"><span><span class="tm">07:30</span> ' + TX('ללא שינוי') + '</span><span><span class="tm ad">07:45</span> ' + TX('נסיעה חדשה') + '</span>' +
      '<span><span class="tm rm">08:15</span> ' + TX('בוטלה ').trim() + '</span><span><span class="tm sh">08:20</span> ' + TX('הוזזה') + '</span>' + (form === 'sign' ? '<span><span class="tm">13:45<small class="xn">×2</small></span> ' + TX('שני אוטובוסים') + '</span>' : '') + '</p>';
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
            '<td class="from">' + (k === 0 ? E(mtFrom(r.d)) : '') + (part ? '<small>' + (k === 0 ? (ENc() ? 'until ' : 'עד ') + hm2(b0 - 1) : b0 === 4000 ? (ENc() ? 'from ' : 'מ-') + hm2(a0) : hm2(a0) + '–' + hm2(b0 - 1)) + '</small>' : '') + '</td>' +
            cells.map(function (x) { return x.html.replace('<td class="tx off">' + TX('אינו פעיל') + '</td>', k ? '<td></td>' : '<td class="tx off">' + TX('אינו פעיל') + '</td>'); }).join('') + '</tr>' });
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
          var ar = ENc() ? ' → ' : ' ← ';
          var cmp = function (f) { return isNew || !a || !a.n || !b.n || Math.abs(a[f] - b[f]) < 10 ? (b && b.n ? hm2(b[f]) : '—') : '<s>' + hm2(a[f]) + '</s>' + ar + '<b>' + hm2(b[f]) + '</b>'; };
          return '<tr class="' + (first && lead ? 'lead' : 'cont') + '"><td class="ln">' + (first && lead ? '<span class="badge sm num">' + E(r.p.line) + '</span>' : '') + '</td>' +
            '<td class="from">' + (first ? E(mtFrom(r.d)) : '') + '</td>' +
            (e ? '<td class="dy">' + E(daysShort(e.t)) + '</td><td class="num">' + (isNew ? '<b>' + b.n + '</b>' : a.n === b.n ? b.n : a.n + ar + '<b>' + b.n + '</b>') + '</td>' +
              '<td class="num">' + cmp('f') + '</td><td class="num">' + cmp('l') + '</td><td class="wt">' + (isNew ? TX('קו חדש') : ttSmall(r.p) ? smallLine(e).replace(/^<b>[^<]*<\/b>\s*/, '') : ttLine(e).replace(/^<b>[^<]*<\/b>\s*/, '')) + '</td>'
              : '<td class="dy">' + E(daysShort(rest)) + '</td><td colspan="4" class="tx">' + TX('ללא שינוי') + '</td>') + '</tr>';
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
        if (!r.band) { var b = rows.filter(function (x) { return x.band && x.g === r.g; })[0]; cur.push({ h: b.h, html: b.html.replace('</td></tr>', TX(' (המשך)') + '</td></tr>') }); used += b.h; }
      }
      cur.push(r); used += r.h;
    });
    if (cur.length) pages.push(cur);
    return pages;
  }
  function mtTable(rows, cols, form, gen) {
    var head = gen ? '<tr><th class="ln">' + TX('קו') + '</th><th class="from">' + TX('כיוון') + '</th><th>' + TX('ימים') + '</th><th>' + TX('נסיעות ביום') + '</th><th>' + TX('הראשונה') + '</th><th>' + TX('האחרונה') + '</th><th>' + TX('מה השתנה') + '</th></tr>'
      : '<tr><th class="ln">' + TX('קו') + '</th><th class="from">' + TX('כיוון') + '</th>' + cols.map(function (c) { return '<th>' + E(c.label) + (c.sub ? '<small>' + E(c.sub) + '</small>' : '') + '</th>'; }).join('') + '</tr>';
    return '<table class="mt-t' + (gen ? ' gen' : '') + '"><thead>' + head + '</thead><tbody>' + rows.map(function (r) { return r.html; }).join('') + '</tbody></table>';
  }
  function mtWhen(pages) { var s = pages.map(start).sort()[0]; return s ? (ENc() ? 'From ' : 'מ-') + LC.dmy(s) : ''; }
  function mtSlides(pages, form) {
    var o = ttOpt(), ps = pages.filter(ttCap), groups = mtGroups(ps), allRows = [];
    groups.forEach(function (g) { allRows = allRows.concat(g.rows); });
    var cols = mtCols(allRows, D.ED.hol), gen = o.v === 'gen', M = MTM[form];
    var rows = gen ? mtGenRows(groups, form) : mtDetRows(groups, cols, form);
    var pg = mtPages(rows, M.H), ttl = gen ? 'לוחות הזמנים: מה משתנה' : 'לוחות הזמנים החדשים';
    var sub = linesTxt(ps) + ' · ' + TX(gen ? 'לפי יעד' : 'לפי יעד, כל שעות היציאה') + ' · ' + mtWhen(ps);
    return pg.map(function (rs, i) {
      return { id: (form === 'sign' ? 'sg-' : '') + 'mt' + i, label: ttl + (pg.length > 1 ? ' (' + (i + 1) + '/' + pg.length + ')' : ''),
        html: '<div class="s-cur s-mt f-' + form + '"' + LDIR() + '><div class="cu-head"><div class="t"><div><h1 class="hd">' + E(TX(ttl)) + '</h1><p class="sub">' + E(sub) + '</p></div></div>' +
          (gen ? '' : mtKey(form)) + '</div><div class="cu-body">' + mtTable(rs, cols, form, gen) + '</div>' +
          (form === 'sign' ? cuFoot(form).replace(TX(' · "בלילה" = אחרי חצות של אותו לילה'), '') : '<div class="sfoot"><span>' + TX('שעות היציאה מהתחנה הראשונה · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי') + '</span><span class="pg num"></span></div>') + '</div>' };
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
        if (ENc()) { t = ENc().c_plainPart(e, x, smallLine(e)); if (out.indexOf(t) < 0) out.push(t); return; }
        var late = function (m) { return m >= 1380; };
        if (n <= 3) t = smallLine(e).replace(/<\/?b>/g, '').replace(/\.$/, '');
        else if (x.ad.length && !x.rm.length && !x.sh.length && x.ad.every(late)) t = w + ' נוספו נסיעות לילה עד ' + hm(Math.max.apply(null, x.ad));
        else if (x.rm.length && !x.ad.length && !x.sh.length && x.rm.every(late)) t = w + ' בוטלו נסיעות הלילה אחרי ' + hm(Math.min.apply(null, x.rm) - 1);
        else t = (x.ad.length > x.rm.length ? 'יותר נסיעות ' : x.rm.length > x.ad.length ? 'פחות נסיעות ' : 'שעות אחרות ') + w;
        if (out.indexOf(t) < 0) out.push(t);
      });
    });
    if (ENc()) return ENc().c_plainJoin(out);
    return out.slice(0, 3).join(' · ') + (out.length > 3 ? ' ועוד' : '') + '.';
  }
  function sumLine(p) {
    if (p.kind === 'timetable') return E(ttPlain(p));
    var it = isKind(p) ? kindItems(p) : whatChanges(p);
    if (p.kind === 'new') return [it[0], it[2]].filter(Boolean).join(' ');
    if (p.kind === 'ended') return it[0] || '';
    return (it[0] || totLine(p.tot || {}, p.dirs)) + '';
  }
  function sumSlides(pages, form) {
    var per = form === 'status' ? 7 : 5, out = [], n = Math.ceil(pages.length / per), X = ENc();
    var rowsOf = function (ps) {
      return ps.map(function (p) {
        return '<li><span class="badge sm num">' + E(p.line) + '</span><div class="sm-t"><div class="sm-h">' + (X ? X.c_chips : LC.chips)(p.kind ? { kind: p.kind } : p.tot || {}).replace(/^(<span class="chip[^"]*">[^<]*<\/span>)[\s\S]*$/, '$1') +
          '<span class="sm-od">' + E(odTxt(p)) + '</span></div><p>' + sumLine(p) + '</p></div></li>';
      }).join('');
    };
    for (var i = 0; i < n; i++) {
      var ps = pages.slice(i * per, (i + 1) * per), lab = 'רק מה שהשתנה' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : '');
      if (form === 'status') {
        out.push({ id: 'st-sum' + i, label: lab, html: '<div class="s-status s-sum"' + LDIR() + '><div class="st-top sm"><h1 class="hd">' + TX('מה משתנה בקווים') + '</h1><p class="sub">' + E(linesTxt(pages) + ' · ' + mtWhen(pages)) + (n > 1 ? ' · ' + (i + 1) + '/' + n : '') + '</p><div class="seam"><i></i></div></div>' +
          '<ul class="sm-rows">' + rowsOf(ps) + '</ul><div class="st-foot"><p class="st-check">' + TX('לפני הנסיעה בדקו:') + ' ' + TX('משרד התחבורה') + ' <b class="ltr">' + MOT + '</b></p>' +
          '<p class="st-note">' + TX('לא פרסום רשמי · הוכן על ידי אדם פרטי') + (D.ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</p></div></div>' });
      } else {
        out.push({ id: 'sum' + i, label: lab, html: '<div class="s-sum"' + LDIR() + '><h2 class="hd">' + TX('מה משתנה') + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : '') + '</h2><ul class="sm-rows">' + rowsOf(ps) + '</ul>' + foot() + '</div>' });
      }
    }
    return out;
  }

  /* גודל העמוד של כל צורה */
  var FORMS = { deck: { w: 1280, h: 720 }, sign: { w: SG_W, h: SG_H }, status: { w: ST_W, h: ST_H } };

  D.ED = {};   // אפשרויות: {look, modes: {pageId: 'one'|'full'}, form: 'deck'|'sign'|'status', credit}
  function isOne(p) { if (isKind(p)) return false; var m = D.ED.modes && D.ED.modes[p.id]; return m ? m === 'one' : smallInfo(p).small; }
  /* מצגת באנגלית: רווח אמיתי בין תווית לערך שעומדים זה ליד זה (בשער, בסיום, בשלט, בעמוד אחד ובסטטוס — כולם בתוך flex,
     כך שהרווח לא נראה), כדי שהעתקה וקורא מסך לא יחברו מילים ("Effective Monday", "Bus company Egged") */
  var EN_SP = /^<div class="(s-cover|s-close|s-one|s-sign|s-status)[ "]/;
  function build(pages, city, edits) {
    var out = build0(pages, city, edits);
    if (D.ED.blang === 'en' && out && out.forEach) out.forEach(function (x) {
      if (x && x.html && EN_SP.test(x.html) && !/s-signtt|s-sttt/.test(x.html.slice(0, 60))) x.html = x.html.replace(/<\/span><span( class="(l|v|x)[" ])?/g, function (m) { return '</span> ' + m.slice(7); }).replace(/<\/b><span>/g, '</b> <span>');
    });
    return out;
  }
  function build0(pages, city, edits) {
    D.ED = edits || {}; D.SIGN_INFO = null;
    if (ENc()) ENc().c_reset(D.ED);
    var big = D.ED.look === 'large';
    RR = big ? 6 : 10; RA = big ? 10 : 16; D.SEG_MAX = big ? 3 : 4; COVER_MAX = big ? 2 : 3;
    var feed = pages.map(function (p) { return p.feed; }).filter(Boolean).sort().pop();
    if (pages.length && pages.every(isCur)) { D.ED.hol = D.ED.hol || pages[0].hol || []; return curBuild(pages, feed); }
    pages.forEach(prep);
    // "של קו N" / "של הקווים N, M" — לטקסט על תחנה שמבוטלת בלי תחנה קרובה במקומה
    units(pages).forEach(function (u) {
      var ln = []; u.all.forEach(function (x) { if (ln.indexOf(x.line) < 0) ln.push(x.line); });
      var t = ln.length > 1 ? 'של הקווים ' + ln.join(', ') : 'של קו ' + ln[0];
      u.all.forEach(function (x) { (x.dirs || []).forEach(function (d) { d._nn = t; }); });
    });
    if (D.ED.tt && D.ED.tt.v === 'board' && pages.some(ttCap)) return D.chgBoardBuild(pages, city, feed);
    // שניים או יותר עם לו"ז (שינוי בלו"ז, קו חדש): טבלה אחת לכל הקווים, ושורה קצרה לכל קו
    // שינוי קטן מאוד בלו"ז (ttOne) — לא נכנס לטבלת הלו"ז של כל הקווים, אלא אם ביקשו "גם שקף נפרד לכל קו"
    // ED.tv — הבחירה בשלב 3: 'sep' (טבלה לכל קו) — בלי טבלה משותפת; 'comb' (טבלה משולבת) — כל הקווים בטבלה המשותפת, גם שינוי קטן מאוד
    var ttCapB = function (p) { return ttCap(p) && (D.ED.tv === 'comb' || !(ttOne(p) && D.ED.ttper !== true && pages.length > 1)); };
    var mt = D.ED.tv !== 'sep' && pages.filter(ttCapB).length > 1, rest = mt ? pages.filter(function (p) { return !ttCapB(p); }) : pages;
    if (D.ED.form === 'sign') return D.signLimit(pages, mt ? mtSlides(pages.filter(ttCapB), 'sign').concat(rest.length ? D.signPages(rest, feed) : []) : D.signPages(pages, feed), feed);
    if (D.ED.form === 'status') return mt ? sumSlides(pages, 'status').concat(rest.length ? D.statusPages(rest) : []) : D.statusPages(pages);
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
      if (merged[p.id] || (mt && D.ED.ttper === false && ttCap(p))) return;
      // שינוי קטן מאוד בלו"ז במצגת של כמה קווים — רק שורה בסיכום, בלי שקפים משלו (אלא אם ביקשו "גם שקף נפרד לכל קו")
      if (ttOne(p) && D.ED.ttper !== true) return;
      var sig = oneSig(p), others = sig ? pages.slice(i + 1).filter(function (o) { return !merged[o.id] && oneSig(o) === sig; }) : [];
      others.forEach(function (o) { merged[o.id] = 1; });
      var pre = pages.length > 1 ? [p].concat(others).map(function (x) { return x.line; }).join(', ') + ' · ' : '';
      (isKind(p) ? kindSlides(p, pre) : isOne(p) ? onePages(p, feed, pre, others) : fullSlides(p, pre)).forEach(function (s) { slides.push(s); });
    });
    slides.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(pages, feed) });
    return slides;
  }

  /* ---------- מפה: מרחק מהמסלול (ציור המפות — deck-maps.js) ---------- */
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

  /* הטקסט שנוצר אוטומטית, כטקסט רגיל — לשדות העריכה */
  function drafts(pages) {
    pages.forEach(function (p) { p.dirs.forEach(function (d, di) { d._key = p.id + '-' + di; }); });
    var cover = (pages.length <= 3 ? coverItems(pages) : []).map(plain);
    var segs = [];
    pages.forEach(function (p) {
      p.dirs.forEach(function (d) {
        var g = segments(d).slice(0, D.SEG_MAX);
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
    if (pages && pages.length && pages.every(isCur) && EN()) {
      var X = window.LCDeckEN, eo = [];
      pages.forEach(function (p) { var o = p.od || [], t = o[0] && o[0] === o[1] ? X.a_T.line + ' ' + X.a_ln(p.line) + ' · ' + X.a_nm(o[0]) : X.a_od(o) || (o[0] ? X.a_nm(o[0]) : ''); if (t && eo.indexOf(t) < 0) eo.push(t); });
      var ls = []; pages.forEach(function (p) { if (ls.indexOf(p.line) < 0) ls.push(p.line); });
      return X.a_T.current + ' · ' + (eo.length === 1 ? eo[0] : (ls.length === 1 ? X.a_T.line + ' ' : X.a_T.lines + ' ') + X.a_list(ls.map(X.a_ln)));
    }
    if (pages && pages.length && pages.every(isCur)) {
      var ods = []; pages.forEach(function (p) { var o = p.od || [], t = o[0] && o[0] === o[1] ? 'קו ' + p.line + ' · ' + o[0] : LC.od(o) || o[0] || ''; if (t && ods.indexOf(t) < 0) ods.push(t); });
      return 'לו״ז עדכני' + (ods.length === 1 ? ' · ' + ods[0] : ' · ' + linesTxt(pages));
    }
    return pages && pages.length ? autoTitle(pages, '') : '';
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

  // לקבצים האחרים של המצגת (deck-sign.js, deck-board.js, deck-maps.js)
  D.E = E; D.phoneOf = phoneOf; D.MOT = MOT; D.hebDate = hebDate; D.start = start; D.dist = dist; D.trip = trip; D.endName = endName;
      D.noNear = noNear; D.walkTxt = walkTxt; D.cover = cover; D.rerouted = rerouted; D.extOf = extOf; D.divergeAt = divergeAt;
      D.realRuns = realRuns; D.chgPts = chgPts; D.small = small; D.allGreen = allGreen; D.legendHtml = legendHtml; D.segNum = segNum;
      D.totLine = totLine; D.closing = closing; D.streetOf = streetOf; D.andList = andList; D.segments = segments; D.whatChanges = whatChanges;
      D.plain = plain; D.uniqDirs = uniqDirs; D.changeCenter = changeCenter; D.allStops = allStops; D.onePages = onePages; D.fullSlides = fullSlides;
      D.units = units; D.odTxt = odTxt; D.opsOf = opsOf; D.plu = plu; D.ttOpt = ttOpt; D.isKind = isKind; D.started = started; D.lastOf = lastOf;
      D.ttDirs = ttDirs; D.mergeSh = mergeSh; D.ttCount = ttCount; D.ttOne = ttOne; D.kindItems = kindItems; D.altsOf = altsOf; D.TTM = TTM;
      D.ttBlocks = ttBlocks; D.paginate = paginate; D.ttKey = ttKey; D.ttPagesHtml = ttPagesHtml; D.routeLegend = routeLegend; D.routeMap = routeMap;
      D.altList = altList; D.kTwo = kTwo; D.kDirBlocks = kDirBlocks; D.zoomOn = zoomOn; D.zoomGroups = zoomGroups; D.zoomMap = zoomMap;
      D.zoomList = zoomList; D.kindSlides = kindSlides; D.badgeTitle = badgeTitle; D.CU_COL = CU_COL; D.hm2 = hm2; D.isoDow = isoDow;
      D.dShort = dShort; D.linesTxt = linesTxt; D.cuDay = cuDay; D.cuMerge = cuMerge; D.ALT_LET = ALT_LET; D.altSym = altSym; D.cuTagCol = cuTagCol; D.ttCap = ttCap; D.curWk = curWk;
      D.mtDirs = mtDirs; D.lastStop = lastStop; D.mtFrom = mtFrom; D.mtGroups = mtGroups; D.mtDay = mtDay; D.mtWhen = mtWhen; D.mtSlides = mtSlides;
      D.sumLine = sumLine; D.FORMS = FORMS; D.isOne = isOne; D.COLORS = COLORS; D.PALETTE = PALETTE; D.contrast = contrast; D.shade = shade;
      D.agOf = agOf; D.lookVars = lookVars; D.ENd = ENd; D.ENb = ENb; D.sN = sN; D.Eb = Eb; D.enOp = enOp; D.enOd = enOd; D.enN = enN; D.enWd = enWd; D.ENc = ENc; D.TX = TX; D.NM = NM; D.OPN = OPN; D.LDIR = LDIR; D.WDM = WDM;
  // לבדיקות (tests/line-changes-units.test.mjs): פונקציות פנימיות — לא בשימוש בדף
  var _test = { realRuns: realRuns, offRuns: offRuns, cuMerge: cuMerge, dShort: dShort, hm2: hm2, noNear: noNear, remCols: remCols, altSym: altSym };
  return { curPre: curPre, combOk: combOk, _test: _test, setPhones: setPhones, fmtPhone: fmtPhone, hasOld: hasOld, ttCap: ttCap, signInfo: function () { return D.SIGN_INFO; }, ttCount: ttCount, ttOne: ttOne, ttSmall: ttSmall, deckTitle: deckTitle, FORMS: FORMS, geoChanged: geoChanged, smallInfo: smallOf, lookVars: lookVars, drafts: drafts, build: build, autoIntro: autoIntro, autoTitle: autoTitle, deviating: deviating, _in: D };
})();
