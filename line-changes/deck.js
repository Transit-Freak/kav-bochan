/* מצגת לשינוי בקו — בניית השקפים מנתוני השינוי (data/l/<id>.json).
   כל שקף הוא קנבס 1280×720; התצוגה המקדימה מקטינה אותו, וההדפסה (PDF) מדפיסה אותו בגודל מלא.
   סדר השקפים, כמו במצגות שהוכנו ביד: שער · (סקירה, כשיש כמה קווים) · לכל כיוון נסיעה: מפה ותחנות · סיום.
   הטקסט בשקפים — בשפה של נוסעים: בלי מק"ט, כיוון, חלופה או GTFS. */
var LCDeck = (function () {
  var E = LC.esc;
  // מוקדי המידע של החברות — רק מספרים שבדקנו. חברה שאין לה מספר כאן מופיעה בלי מספר.
  var PHONES = { 'נתיב אקספרס': '*3553', 'אגד': '*2800', 'דן': '*3456', 'מטרופולין': '*5900', 'קווים': '*2456' };
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
    var t = pages.length === 1 ? (pages[0].tot || {}) : null;
    if (t && (t.add || 0) + (t.rem || 0) + (t.mv || 0) <= 3 && !t.geo) return 'בעמודים הבאים: מפה קרובה של המקום שבו התחנה משתנה.';
    var rem = pages.some(function (p) { return (p.tot || {}).rem; });
    if (pages.every(function (p) { return (p.tot || {}).ext; })) return 'בעמודים הבאים: מפה של הקטע החדש במסלול.';
    return 'בעמודים הבאים: מפה של המסלול הישן והחדש' + (rem ? ', ואיפה התחנה הקרובה במקום כל תחנה שמבוטלת.' : '.');
  }
  function autoTitle(pages, city) {
    if (pages.length === 1) return 'שינוי בקו ' + pages[0].line;
    // העיר כבר בתגית הגדולה — בכותרת מספרי הקווים (עד 5), בלי לחזור על העיר
    if (pages.length <= 5) return 'שינויים בקווים ' + andList(pages.map(function (x) { return x.line; }), 5);
    return city ? 'שינויים ב-' + pages.length + ' קווים' : 'שינויים ב-' + pages.length + ' קווים';
  }

  /* ---------- השקפים ---------- */
  function cover(pages, city) {
    var s0 = pages.map(start).sort()[0];
    var single = pages.length === 1, p = pages[0];
    var ops = []; pages.forEach(function (x) { if (ops.indexOf(x.op) < 0) ops.push(x.op); });
    var firstTrip = single && p.formal && p.formal !== p.eff ? 'נסיעה ראשונה במסלול החדש: ' + LC.wd(p.eff) + ' ' + LC.dm(p.eff) : '';
    var dates = {}; pages.forEach(function (x) { dates[start(x)] = 1; });
    var multiDate = Object.keys(dates).length > 1;
    var sub = single ? LC.od(p.od) + ' · החל מ-' + LC.dmy(s0)
      : (pages.length > 5 ? 'קווים ' + pages.map(function (x) { return x.line; }).join(', ') + ' · ' : '') + (multiDate ? 'מ-' + LC.dmy(s0) : 'החל מ-' + LC.dmy(s0));
    var opPhone = ops.length === 1 && PHONES[ops[0]];
    return '<div class="s-cover">' +
      '<div class="band"><div class="row">' +
        (single ? '<span class="badge num">' + E(p.line) + '</span>' : '<span class="badge word">' + E(city || 'קווים') + '</span>') +
        '<div class="t"><h1 class="hd" data-k="title">' + E(autoTitle(pages, city)) + '</h1><p class="sub">' + E(sub) + '</p></div></div>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="body">' +
        '<div class="facts">' +
          '<div class="fact"><span class="l">' + (multiDate ? 'החל מ' : 'ממתי') + '</span><span class="v">' + E(LC.wd(s0) + ' ' + LC.dmy(s0)) + '</span>' +
            '<span class="x">' + E(hebDate(s0)) + '</span>' + (firstTrip ? '<span class="x">' + E(firstTrip) + '</span>' : '') + '</div>' +
          '<div class="fact"><span class="l">' + (ops.length > 1 ? 'חברות' : 'חברת האוטובוסים') + '</span><span class="v">' + E(ops.join(' · ')) + '</span>' +
            '<span class="x num">' + (opPhone ? 'מוקד: <span class="ltr">' + E(opPhone) + '</span>' : '') + '</span></div>' +
          '<div class="fact"><span class="l">משרד התחבורה</span><span class="v num"><span class="ltr">' + MOT + '</span></span><span class="x">מוקד המידע</span></div>' +
        '</div>' +
        '<p class="intro" data-k="intro">' + E(autoIntro(pages)) + '</p>' +
        (single || pages.length <= 3 ? '<div class="what"><h3 class="hd">מה משתנה?<span class="counts">' + (single ? E(totLine(p.tot || {})) : '') + '</span></h3>' +
          '<ul data-k="what">' + listHtml(ED.cover, coverItems(pages)) + '</ul></div>' : '') +
        '<div class="note">המידע הוכן על ידי אדם פרטי, ואינו פרסום רשמי של משרד התחבורה או של ' + (ops.length === 1 ? E(ops[0]) : 'חברות האוטובוסים') + '. השינוי עלול להשתנות. לפני הנסיעה בדקו במוקד או באפליקציה.</div>' +
      '</div></div>';
  }

  function overview(pages, part, nparts) {
    return '<div class="s-over"><h2 class="hd">' + (nparts > 1 ? 'כל הקווים שמשתנים (' + (part + 1) + '/' + nparts + ')' : 'כל הקווים שמשתנים') + '</h2>' +
      '<table><tr><th style="width:34%">קו</th><th style="width:44%">מה משתנה</th><th style="width:22%">ממתי</th></tr>' +
      pages.map(function (p) {
        return '<tr><td class="ln"><b class="num">' + E(p.line) + '</b>' + E(LC.od(p.od)) + '</td><td><div class="chips">' +
          LC.chips(p.tot || {}) + '</div></td><td>' + E(LC.wd(start(p)) + ' ' + LC.dm(start(p))) + '</td></tr>';
      }).join('') + '</table>' + foot() + '</div>';
  }

  function foot() {
    return '<div class="sfoot"><span>הוכן על ידי אדם פרטי · לא פרסום רשמי · מפה: © תורמי OpenStreetMap</span><span class="pg num"></span></div>';
  }

  function mapSlide(p, d, part, nparts) {
    var r = d.removed.length, a = d.added.length;
    var near = (d._rem || []).some(function (s) { return s._near && !s._near.none; });
    var when = start(d) !== start(p) ? '<p class="lead">החל מ' + E(LC.wd(start(d)) + ' ' + LC.dmy(start(d))) + '.</p>' : '';
    return '<div class="s-map"><div class="smap"></div><div class="inset"></div><div class="side">' +
      '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(p.op) + '</span></div>' +
      '<h2 class="hd">' + E(trip(d)) + E(altTxt(d)) + '</h2>' +
      (nparts > 1 ? '<p class="part">מפה ' + (part.i + 1) + ' מתוך ' + nparts + ' (' + E(part.name) + ')</p>' : '') +
      (extOf(d) ? '' : rerouted(d) ? '' : '<p class="part">המסלול לא משתנה — רק ' + (r + a + d.moved.length === 1 ? 'התחנה' : 'התחנות') + '</p>') +
      segList(d) + when +
      (small(d) && nparts < 2 ? smallList(d) : '<p class="counts">' + E(countsLine(d)) + '</p>') +
      legendHtml(d) +
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
        (nr && !nr.none ? '<span class="nr">במקום: ' + E(nr.name) + ' (' + walkTxt(nr) + ')</span>' : '<span class="nr">אין תחנה קרובה במסלול החדש</span>') + '</span></li>');
    });
    d.new.stops.filter(function (s) { return d.added.indexOf(s.code) >= 0; }).forEach(function (s, i) {
      rows.push('<li><i class="dot add">' + (i + 1) + '</i><span>' + E(s.name) + ' — חדשה <span class="sc">מק״ט ' + E(s.code) + '</span></span></li>');
    });
    return rows.length ? '<ul class="small">' + rows.join('') + '</ul>' : '';
  }
  function legendHtml(d) {
    var r = d.removed.length, a = d.added.length;
    var near = (d._rem || []).some(function (s) { return s._near && !s._near.none; });
    return '<div class="legend">' +
        (extOf(d) ? '<span><i class="sw same"></i>מסלול הקו (לא משתנה)</span><span><i class="sw"></i>הקטע החדש (מ-' + E(LC.dm(start(d))) + ')</span>' :
          rerouted(d) ? (offRuns(d.old.shape, d.new.shape).length ? '<span><i class="sw old"></i>קטע שהקו כבר לא נוסע בו (עד ' + E(LC.dm(LC.addDays(start(d), -1))) + ')</span>' : '') +
          '<span><i class="sw"></i>המסלול החדש (מ-' + E(LC.dm(start(d))) + ')</span>' : '<span><i class="sw same"></i>מסלול הקו (לא משתנה)</span>') +
        (r ? '<span><i class="dot rem">1</i>תחנה שמבוטלת</span>' : '') +
        (near ? '<span><i class="sw near"></i>אל התחנה הקרובה במסלול החדש' + ((d._rem || []).some(function (s) { return s._near && s._near.path; }) ? ' (זמן ההליכה ברשימה)' : '') + '</span>' : '') +
        (segments(d).some(routeSeg) ? '<span><i class="dot seg">1</i>כאן המסלול משתנה (כמו בהסבר)</span>' : '') +
        (a ? '<span><i class="dot add">1</i>תחנה חדשה</span>' : '') +
        (d.moved.length ? '<span><i class="dot mv">1</i>תחנה שעוברת מקום</span>' : '') +
        '<span><i class="dot same"></i>תחנה שנשארת</span></div>';
  }
  var SEG_MAX = 4;
  function segList(d) {
    var segs = segments(d);
    if (!segs.length) return '<p class="lead">' + dirLead(d) + '</p>';
    var ed = ED.seg && ED.seg[d._key];
    var html = '<ol class="segs">' + segs.slice(0, SEG_MAX).map(function (g, i) {
      var t = ed && typeof ed[i] === 'string' ? E(ed[i]) : g.html;
      // מספר רק לשינוי בדרך עצמה (יש לו סמן על המפה); שינוי של תחנה — נקודה, הסמן הממוספר של התחנה הוא ההפניה
      var num = segNum(d, g);
      return '<li>' + (num ? '<i class="segn">' + num + '</i>' : '<i class="segb"></i>') + '<span data-seg="' + E(d._key) + '" data-i="' + i + '">' + t + '</span></li>';
    }).join('') + '</ol>';
    if (segs.length > SEG_MAX) html += '<p class="counts">ועוד ' + (segs.length - SEG_MAX === 1 ? 'שינוי קטן אחד' : (segs.length - SEG_MAX) + ' שינויים קטנים') + ' — ברשימת התחנות בעמוד הבא.</p>';
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
  function stopList(arr, off, rows, mainCity) {
    var cols = [arr.slice(0, rows), arr.slice(rows, rows * 2)];
    return '<div class="two">' + cols.map(function (col, ci) {
      return '<ol>' + col.map(function (s, j) {
        var n = off + ci * rows + j + 1, nr = s._near;
        var sub = s._k !== 'rem' ? '' : '<span class="nr">' + (!nr || nr.none ? 'אין תחנה קרובה במסלול החדש' : 'במקום: ' + E(nr.name) + ' (' + walkTxt(nr) + ')') + '</span>';
        return '<li' + (sub ? ' class="two-l"' : '') + '><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + E(s.name) + ' <span class="sc">מק״ט ' + E(s.code) + '</span>' +
          (s.city && s.city !== mainCity ? ' <span class="cd">' + E(s.city) + '</span>' : '') + sub + '</span></li>';
      }).join('') + '</ol>';
    }).join('') + '</div>';
  }

  var RR = 10, RA = 16;   // שורות בעמודה: תחנות שמבוטלות (שתי שורות לכל תחנה) / חדשות — "אותיות גדולות": פחות
  function stopsSlides(p, d, remS, addS) {
    var n = Math.max(1, Math.ceil(remS.length / (RR * 2)), Math.ceil(addS.length / (RA * 2)));
    var cnt = {};
    remS.concat(addS).forEach(function (s) { if (s.city) cnt[s.city] = (cnt[s.city] || 0) + 1; });
    var mainCity = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
    var out = [];
    for (var i = 0; i < n; i++) {
      var r = remS.slice(i * RR * 2, (i + 1) * RR * 2), a = addS.slice(i * RA * 2, (i + 1) * RA * 2);
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
              (r.length ? stopList(r, i * RR * 2, RR, mainCity) : '<p class="empty">' + (i ? '' : 'אין תחנות שמבוטלות בנסיעה הזו') + '</p>') + '</div>' +
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
    var ph = ops.filter(function (o) { return PHONES[o]; }).slice(0, 3).map(function (o) {
      return '<div class="ph"><span class="l">' + E(o) + '</span><span class="v">' + PHONES[o] + '</span></div>';
    }).join('');
    return '<div class="s-close"><div class="seam"><i></i></div><h2 class="hd">לפני הנסיעה בדקו</h2>' +
      '<div class="phones">' + ph + '<div class="ph"><span class="l">משרד התחבורה</span><span class="v">' + MOT + '</span></div></div>' +
      '<div class="note">המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי של משרד התחבורה או של ' +
        (ops.length === 1 ? E(ops[0]) : 'חברות האוטובוסים') + '. השינוי עלול להשתנות בכל רגע. לפני הנסיעה בדקו במוקד או באפליקציה.</div>' +
      '<p class="src">לפי נתוני משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') +
        (pages.some(function (x) { return x.past; }) ? ' ולפי הארכיון של הקו הבוחן' : '') + ' · מפות: © תורמי OpenStreetMap</p>' + creditHtml() + '</div>';
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
          return !t || t.none ? 'ליד ' + E(x.name) + ' אין תחנה קרובה במסלול החדש.' : (o.length > 1 ? 'במקום ' + E(x.name) + ': ' : 'התחנה הקרובה: ') + '<b>' + E(t.name) + '</b>, ' + walkTxt(t) + '.';
        }).join(' ') : '';
        g.plain = 'הקו לא יעצור יותר ב' + (o.length === 1 ? 'תחנה ' : 'תחנות ') + names(o) + '.';
        return 'הקו לא יעצור יותר ב' + (o.length === 1 ? 'תחנה ' : 'תחנות ') + names(o) + ' (בין ' + b(A) + ' ל' + b(B) + ').' + (nr ? ' ' + nr : '');
      }
      g.route = true;
      return 'אחרי ' + b(A) + ' הקו כבר לא ייסע ' + E(via(oS)) + '. הוא ייסע בדרך אחרת ויגיע ל' + b(B) + '.';
    }
    if (n.length && !o.length) {
      if (sameRoadNew || !nS.length) {
        g.kind = 'add'; g.names = n.map(function (x) { return skey(x.name); }).sort();
        g.plain = (n.length === 1 ? 'נוספה תחנה חדשה: ' : 'נוספו תחנות חדשות: ') + names(n) + '.';
        return (n.length === 1 ? 'נוספה תחנה חדשה: ' : 'נוספו תחנות חדשות: ') + names(n) + ' (בין ' + b(A) + ' ל' + b(B) + ').';
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
    if (pages.length === 1) {
      var w = whatChanges(pages[0]);
      return w.length > COVER_MAX ? w.slice(0, COVER_MAX).concat(['ועוד שינויים בעמודים הבאים.']) : w;
    }
    // קווים עם אותו שינוי — שורה אחת ("קווים 9 ו-18: ...")
    var rows = [];
    pages.forEach(function (x) {
      var w = (whatChanges(x)[0] || '').replace(/^<b>[^<]*:<\/b> /, '').replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '');
      var r = rows.filter(function (y) { return y.w === w && w; })[0];
      if (r) r.lines.push(x.line); else rows.push({ w: w, lines: [x.line] });
    });
    if (rows.length === 1) return [rows[0].w];   // כל הקווים — אותו שינוי: בלי לחזור על מספרי הקווים
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
      if (g.kind === 'add') return 'נוספות שתי תחנות חדשות בשם ' + b(mine[0]) + ', אחת לכל כיוון' + side + codes + (g.A && g.B ? ', בין ' + b(g.A) + ' ל' + b(g.B) : '') + '.';
      return 'הקו לא יעצור יותר בשתי התחנות בשם ' + b(mine[0]) + ', אחת בכל כיוון' + side + codes + '.';
    }
    if (g.kind === 'add') return '<b>בשני הכיוונים</b> ' + (g.newS.length === 1 ? 'נוספה תחנה חדשה, ' : 'נוספו תחנות חדשות, ') + nm(g.newS) +
      (g.A && g.B ? ', בין ' + b(g.A) + ' ל' + b(g.B) : '') + '.';
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
    if (!pts.length) pts = deviating(d.new.shape, d.old.shape).concat(deviating(d.old.shape, d.new.shape));
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
        if (seen[s.code]) return; seen[s.code] = 1;
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
    if (multi) items = items.map(function (t) { return t.replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, ''); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    return '<div class="s-one"><div class="smap"></div><div class="side">' +   // בלי מפת התמצאות — המפה הקרובה מספיקה
      (multi ? '<div class="ohead multi"><div class="badges">' + lines.map(function (l) { return '<span class="badge num">' + E(l) + '</span>'; }).join('') + '</div>' +
          '<div class="t"><h1 class="hd">אותו שינוי ב-' + lines.length + ' קווים</h1><p class="sub">' + E(ops.join(' · ')) + '</p></div></div>'
        : '<div class="ohead"><span class="badge num">' + E(p.line) + '</span><div class="t"><h1 class="hd">שינוי בקו ' + E(p.line) + '</h1>' +
        '<p class="sub">' + E(LC.od(p.od)) + ' · ' + E(p.op) + '</p></div></div>') +
      '<p class="owhen"><b>' + (p.past ? 'מ' : 'החל מ') + E(LC.wd(s0) + ' ' + LC.dmy(s0)) + '</b> · ' + E(hebDate(s0)) + E(firstTrip) + '</p>' +
      (ng > 1 ? '<p class="part">עמוד ' + (gi + 1) + ' מתוך ' + ng + ' · ' + E(trip(main)) + '</p>' : '') +
      '<div class="owhat"><h3 class="hd">מה משתנה?</h3><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' +
      legendHtml(main) +
      '<div class="ocontact">' + ops.filter(function (o) { return PHONES[o]; }).slice(0, 3).map(function (o) { return '<span>' + E(o) + ' <b class="ltr">' + E(PHONES[o]) + '</b></span>'; }).join('') +
        '<span>משרד התחבורה <b class="ltr">' + MOT + '</b></span></div>' +
      '<div class="note">המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי. השינוי עלול להשתנות — לפני הנסיעה בדקו במוקד או באפליקציה.</div>' +
      '<p class="osrc">לפי נתוני משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') + ' · מפה: © תורמי OpenStreetMap</p>' + creditHtml() +
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

  var ED = {};   // אפשרויות: {look, modes: {pageId: 'one'|'full'}}
  function isOne(p) { var m = ED.modes && ED.modes[p.id]; return m ? m === 'one' : smallInfo(p).small; }
  function build(pages, city, edits) {
    ED = edits || {};
    var big = ED.look === 'large';
    RR = big ? 6 : 10; RA = big ? 10 : 16; SEG_MAX = big ? 3 : 4; COVER_MAX = big ? 2 : 3;
    pages.forEach(prep);
    var feed = pages.map(function (p) { return p.feed; }).filter(Boolean).sort().pop();
    // קו אחד עם שינוי קטן — עמוד אחד (או שניים), בלי שער ובלי שקף סיום
    if (pages.length === 1 && isOne(pages[0])) return onePages(pages[0], feed, '');
    var slides = [{ id: 'cover', label: 'שער', html: cover(pages, city) }];
    if (pages.length > 1) {
      var per = 9, n = Math.ceil(pages.length / per);
      for (var i = 0; i < n; i++) slides.push({ id: 'over' + i, label: 'כל הקווים' + (n > 1 ? ' (' + (i + 1) + ')' : ''), html: overview(pages.slice(i * per, (i + 1) * per), i, n) });
    }
    var merged = {};
    pages.forEach(function (p, i) {
      if (merged[p.id]) return;
      var sig = oneSig(p), others = sig ? pages.slice(i + 1).filter(function (o) { return !merged[o.id] && oneSig(o) === sig; }) : [];
      others.forEach(function (o) { merged[o.id] = 1; });
      var pre = pages.length > 1 ? [p].concat(others).map(function (x) { return x.line; }).join(', ') + ' · ' : '';
      (isOne(p) ? onePages(p, feed, pre, others) : fullSlides(p, pre)).forEach(function (s) { slides.push(s); });
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
  function splitParts(remS, addS) {
    var all = remS.concat(addS);
    var one = [{ i: 0, name: '', show: null }];
    if (all.length < 10 || overlaps(all.map(function (s) { return s.ll; })) <= 4) return one;
    var a = all.map(function (s) { return px(s.ll, 0); });
    var xs = a.map(function (p) { return p[0]; }), ys = a.map(function (p) { return p[1]; });
    var vert = (Math.max.apply(null, ys) - Math.min.apply(null, ys)) >= (Math.max.apply(null, xs) - Math.min.apply(null, xs));
    var key = function (s) { return vert ? -s.ll[0] : s.ll[1]; };   // צפון/מערב קודם
    var sorted = all.slice().sort(function (x, y) { return key(x) - key(y); });
    var half = Math.ceil(sorted.length / 2), A = {}, B = {};
    sorted.forEach(function (s, i) { (i < half ? A : B)[s._k + s.code] = 1; });
    return [{ i: 0, name: vert ? 'החלק הצפוני' : 'החלק המערבי', show: A },
            { i: 1, name: vert ? 'החלק הדרומי' : 'החלק המזרחי', show: B }];
  }

  /* מרחיק סמנים שעולים זה על זה; מחזיר מיקום חדש בפיקסלים לכל סמן */
  var INSET = { x: 16 + 236 + 14, y: 16 + 178 + 14 };   // הפינה של מפת ההתמצאות + מרווח
  function declutter(pts, w, h, inset) {
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
        if (inset && p.x < INSET.x && p.y < INSET.y) {
          if (INSET.x - p.x < INSET.y - p.y) p.x = INSET.x; else p.y = INSET.y;
        }
      });
      if (!moved && it > 10) break;
    }
    return pts;
  }

  /* מצייר את המפה של שקף (ומפת ההתמצאות הקטנה); מחזיר Promise שמתממש כשהאריחים נטענו או אחרי זמן קצוב */
  function drawMap(slideEl, m) {
    var d = m.d, el = slideEl.querySelector('.smap'), inEl = slideEl.querySelector('.inset');
    var opts = { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false };
    var map = L.map(el, opts);
    map.attributionControl.setPrefix(false);
    var waits = [];
    function tiles(mp) {
      var t = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true });
      waits.push(new Promise(function (res) { var done = false, fin = function () { if (!done) { done = true; res(); } }; t.on('load', fin); setTimeout(fin, 12000); }));
      return t;
    }
    var shown = function (s) { return !m.show || m.show[s._k + s.code]; };
    var remN = m.remS.map(function (s, j) { return { s: s, n: j + 1, k: 'rem' }; });
    var addN = m.addS.map(function (s, j) { return { s: s, n: j + 1, k: 'add' }; });
    var mvN = d.moved.map(function (s, j) { return { s: s, n: j + 1, k: 'mv' }; });
    var marks = remN.concat(addN).filter(function (x) { return shown(x.s); }).concat(m.show ? [] : mvN);
    // מספרי המקטעים (①②…) — בנקודה שבה המסלולים נפרדים
    segments(d).slice(0, SEG_MAX).forEach(function (g) {
      var num = segNum(d, g), at = g.A || g.newS[0] || g.oldS[0];
      if (num && at && (!m.show || marks.some(function (x) { return dist(x.s.ll, at.ll) < 1500; }))) marks.push({ s: { ll: at.ll }, n: num, k: 'seg' });
    });

    var all = L.latLngBounds([]), focus = L.latLngBounds([]);
    d.old.shape.forEach(function (p) { all.extend(p); });
    d.new.shape.forEach(function (p) { all.extend(p); });
    marks.forEach(function (x) { focus.extend(x.s.ll); });
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
    if (!focus.isValid()) deviating(d.old.shape, d.new.shape).concat(deviating(d.new.shape, d.old.shape)).forEach(function (p) { focus.extend(p); });
    if (!focus.isValid()) focus = all;
    map.fitBounds(focus, { paddingTopLeft: [PAD, inEl ? 110 : PAD], paddingBottomRight: [PAD, PAD], maxZoom: MAXZ });
    tiles(map).addTo(map);
    // הישן המקווקו מתחת לחדש: איפה שהמסלולים זהים רואים רק כחול, והאדום מופיע רק איפה שהקו כבר לא עובר
    // רק הקטעים שהקו כבר לא נוסע בהם — לא מתחת לקו החדש, כדי שלא ייראה כאילו משהו בוטל במקום שהקו ממשיך לנסוע בו
    if (!extOf(d)) offRuns(d.old.shape, d.new.shape).forEach(function (r) { L.polyline(r, { color: '#b8361f', weight: 5, dashArray: '9 8', opacity: 1, interactive: false }).addTo(map); });
    // המסלול החדש בירוק; כשהדרך לא משתנה — כחול-אפור ניטרלי (רק התחנה משתנה). קו שמתארך: כל המסלול אפור, והקטע החדש בירוק
    var ext = extOf(d);
    if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: rerouted(d) && !ext ? '#1f9152' : '#5f7d96', weight: 6, opacity: .92, interactive: false }).addTo(map);
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
    if (inEl) boxes.push([0, 0, INSET.x, INSET.y]);   // מפת ההתמצאות בפינה
    labels.slice().sort(function (a, b) { return (wasEnd[b.code] ? 1 : 0) - (wasEnd[a.code] ? 1 : 0); }).forEach(function (st) {
      var k = st.name + st.ll.join(',');
      if (seen[k]) return; seen[k] = 1;
      var was = wasEnd[st.code], c = map.latLngToContainerPoint(st.ll);
      var w = Math.max(String(st.name).length, was ? 18 : 0) * 7 + 20, h = was ? 38 : 24, g = 15;
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
    declutter(pts, size.x, size.y, !!inEl);
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
        if (!ext) offRuns(d.old.shape, d.new.shape).forEach(function (r) { L.polyline(r, { color: '#b8361f', weight: 2, dashArray: '4 4', interactive: false }).addTo(mini); });
        if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: rerouted(d) && !ext ? '#1f9152' : '#5f7d96', weight: 2.5, interactive: false }).addTo(mini);
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
  return { geoChanged: geoChanged, smallInfo: smallOf, lookVars: lookVars, drafts: drafts, build: build, drawMap: drawMap, autoIntro: autoIntro, autoTitle: autoTitle, deviating: deviating };
})();
