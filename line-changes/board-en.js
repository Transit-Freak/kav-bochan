/* מצגת לשינוי בקו — לוח באנגלית ("שפת הלוח: English", שלמה 24.11): עורכים בעברית, מדפיסים באנגלית.
   כל הטקסטים הקבועים שמודפסים בלוח (בכל הצורות) ובאקסל — כאן, במילון אחד. טקסט חדש בלוח = מפתח חדש כאן (ראו CLAUDE.md).
   שמות של תחנות, ערים ויעדים — לא כאן: רק מהתרגומים של משרד התחבורה (translations.txt — data/tt/*.json → en מהבונה),
   או שם שהמשתמש הקליד (edits.ben). שם בלי תרגום — בעברית, ואזהרה לפני ההורדה (LCBoardEN.name רושם אותו ב-miss). */
(function (g) {
  var TXT = {
    title: 'Timetable', titleNew: 'New timetable', line: 'Line', lines: 'Lines', and: ' and ', more: ' and more',
    thLine: 'Line', thOrig: 'From', thWk: 'Weekdays', days: 'Days ', friday: 'Friday', satNight: 'Saturday night', saturday: 'Saturday',
    upd: 'Updates', ph: 'Information', cont: '(cont.)', off: 'No service', same: 'No change', mot: 'Ministry of Transport',
    validFrom: 'Valid from ', until: ' until ', fromD: 'From ', untilD: 'Until ', fromEach: 'Valid from the date next to each line',
    newTt: 'new timetable', newLine: 'New line', toward: 'To ', from: 'From ', stop: 'Stop ', cityLines: 'City lines · ', cityLine: 'City line · ', via: 'via ',
    secU: 'City lines', secI: 'Intercity lines', secR: 'Regional lines',
    altNote: 'Trips marked with a symbol and colour (# ^ $…) take a different route', otherRoute: 'by another route', allTrips: ' all trips',
    legendDep: 'Departure times from the first stop', legendAlt: 'symbol and colour (# ^ $…) — a different route', legendX2: '×2 — two buses',
    legendMot: 'Based on Ministry of Transport data', legendNew: 'green — new trip or new time', legendRm: 'struck out in red — cancelled trip',
    legendNoOff: 'Not an official publication', priv: 'Prepared by a private individual · Not an official publication · Check with the operator before travelling',
    credit: 'Made with the “Line change slides” tool of HaKav HaBochen · kavbochan.app', cancelled: 'Cancelled: ', earlier: 'earlier', later: 'later',
    fromT: ' from ', newOn: 'new on ', except: 'except ', noChange: ' — no change', keyNew: 'New or changed', keyRm: 'Cancelled',
    oldUntil: 'Timetable until ', theChange: 'the change', newTimetable: 'New timetable', prevTt: 'Previous timetable — before the change',
    oldNote: 'Red — trip cancelled or moved', newNote: 'Green — new trip or new time',
    // אקסל
    xOp: 'Operator', xPhone: 'Phone', xLine: 'Line', xNotes: 'Notes', xOnly: ' only', xValidUntil: 'Timetable valid until ', xFeed: 'Based on Ministry of Transport data from '
  };
  /* שמות הגיליונות באקסל */
  var SHEET = { 'לוח זמנים': 'Timetable', 'לוח מודעות': 'Timetable', 'לו״ז חדש': 'New timetable', 'הלו״ז הקודם': 'Previous timetable', 'לו״ז': 'Timetable' };
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /* שמות החגים מהבונה (tools/hebcal.py — hol: [תאריך, סוג, שם]) */
  var HOL = {
    'ערב ראש השנה': 'Rosh Hashanah eve', 'ראש השנה': 'Rosh Hashanah', 'ערב יום כיפור': 'Yom Kippur eve', 'יום כיפור': 'Yom Kippur',
    'ערב חג הסוכות': 'Sukkot eve', 'חג הסוכות': 'Sukkot', 'חול המועד סוכות': 'Sukkot (intermediate days)', 'ערב שמחת תורה': 'Simchat Torah eve',
    'שמחת תורה': 'Simchat Torah', 'פורים': 'Purim', 'שושן פורים': 'Shushan Purim', 'ערב פסח': 'Passover eve', 'פסח': 'Passover',
    'חול המועד פסח': 'Passover (intermediate days)', 'ערב שביעי של פסח': 'Seventh day of Passover eve', 'שביעי של פסח': 'Seventh day of Passover',
    'ערב יום העצמאות': 'Independence Day eve', 'יום העצמאות': 'Independence Day', 'ערב שבועות': 'Shavuot eve', 'שבועות': 'Shavuot',
    'ראש השנה ומוצאי החג': 'Rosh Hashanah and evening after', 'יום כיפור ומוצאי הצום': 'Yom Kippur and evening after',
    'חג הסוכות ומוצאי החג': 'Sukkot and evening after', 'שמחת תורה ומוצאי החג': 'Simchat Torah and evening after', 'פסח ומוצאי החג': 'Passover and evening after',
    'שביעי של פסח ומוצאי החג': 'Seventh day of Passover and evening after', 'שבועות ומוצאי החג': 'Shavuot and evening after'
  };
  /* החברות: ב-agency.txt / translations.txt יש אנגלית רק לחלק קטן (דן, כרמלית, כפיר) — טבלה קבועה לחברות העיקריות */
  var OPS = {
    'אגד': 'Egged', 'דן': 'Dan', 'קווים': 'Kavim', 'מטרופולין': 'Metropoline', 'סופרבוס': 'Superbus', 'נתיב אקספרס': 'Nateev Express',
    'אפיקים': 'Afikim', 'אלקטרה אפיקים': 'Electra Afikim', 'אלקטרה אפיקים תחבורה': 'Electra Afikim', 'אקסטרה': 'Extra', 'אקסטרה ירושלים': 'Extra Jerusalem',
    'דן בדרום': 'Dan BaDarom', 'דן באר שבע': 'Dan Be\'er Sheva', 'גלים': 'Galim', 'תנופה': 'Tnufa', 'בית שמש אקספרס': 'Beit Shemesh Express',
    'אגד תעבורה': 'Egged Ta\'avura', 'כרמלית': 'Carmelit', 'כפיר': 'Kfir', 'רכבת ישראל': 'Israel Railways', 'ש.א.מ': 'S.A.M', 'גי.בי.טורס': 'GB Tours',
    'מועצה אזורית גולן': 'Golan Regional Council', 'מועצה אזורית אילות': 'Eilot Regional Council', 'דן נתיבים בעמ': 'Dan Netivim', 'תבל': 'Tevel',
    'נסיעות ותיירות': 'Nesiot VeTayarut', 'כבל אקספרס': 'Cable Express', 'יונייטד טורס': 'United Tours', 'דרך אגד עוטף ירושלים': 'Derech Egged',
    'משרד התחבורה': 'Ministry of Transport'
  };
  /* מפתח להשוואת שמות: גרשיים אחידים (בי''ס / בי״ס / בי"ס), רווחים — כמו en_key בבונה */
  function key(s) { return String(s == null ? '' : s).replace(/''/g, '"').replace(/[״”“]/g, '"').replace(/׳/g, "'").replace(/\s+/g, ' ').trim(); }
  /* ימים באנגלית: [0,1,2,3,4] → "Sun–Thu", רצף — עם מקף, אחרת בפסיקים */
  function days(ix) {
    ix = ix.slice().sort(function (a, b) { return a - b; });
    if (!ix.length) return '';
    var run = ix.every(function (w, i) { return !i || w === ix[i - 1] + 1; });
    return run && ix.length > 1 ? DOW[ix[0]] + '–' + DOW[ix[ix.length - 1]] : ix.map(function (w) { return DOW[w]; }).join(', ');
  }
  /* מילון {עברית: אנגלית} → {מפתח מנורמל: אנגלית} (פעם אחת לכל בנייה של הלוח) */
  function index(dict) { var ix = {}; Object.keys(dict || {}).forEach(function (h) { if (dict[h]) ix[key(h)] = dict[h]; }); return ix; }
  /* שם בעברית → אנגלית: מה שהמשתמש הקליד (man), תרגומי משרד התחבורה (ix — מ-index); בלי — העברית, ונרשם ב-miss */
  function name(s, ix, man, miss) {
    if (!s || !/[א-ת]/.test(s)) return s;
    var k = key(s), t = (man && (man[s] || man[k])) || (ix && ix[k]);
    if (!t && /_/.test(s)) {   // יעד "עיר_תחנה" — מהחלקים, "City, Stop"
      var a = s.split('_'), b = a.slice(1).join('_'), ta = name(a[0], ix, man, null), tb = name(b, ix, man, null);
      if (ta !== a[0] && tb !== b) t = ta + ', ' + tb;
    }
    if (t) return t;
    if (miss) miss[s] = 1;
    return s;
  }
  g.LCBoardEN = { TXT: TXT, SHEET: SHEET, DOW: DOW, HOL: HOL, OPS: OPS, key: key, days: days, name: name, index: index };
})(typeof window !== 'undefined' ? window : this);
