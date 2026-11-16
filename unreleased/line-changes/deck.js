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
  function firstStreet(d) { var st = (d.new.stops[0] || d.old.stops[0]); return st ? streetOf(st.name) : ''; }
  function trip(d) {
    var o = d.od || [];
    if (!o[0] || !o[1] || o[0] === o[1]) return 'הקו' + (o[0] ? ' ב' + o[0] : '') + (firstStreet(d) ? ', מ' + firstStreet(d) : '');
    return 'מ' + o[0] + ' ל' + o[1];
  }
  function toward(d) {
    var o = d.od || [];
    if (!o[0] || !o[1] || o[0] === o[1]) return firstStreet(d) ? 'בנסיעה מ' + firstStreet(d) : 'בקו';
    return 'בנסיעה ל' + o[1];
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
    var best = null, bd = Infinity;
    d.new.stops.forEach(function (n) { if (n.code !== s.code) { var x = dist(s.ll, n.ll); if (x < bd) { bd = x; best = n; } } });
    if (!best) return null;
    var walk = Math.max(50, Math.round(bd * 1.25 / 50) * 50);
    return walk <= NEAR_MAX ? { name: best.name, ll: best.ll, m: walk } : { none: true };
  }

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
    return 'בעמודים הבאים: מפה של המסלול הישן והחדש, ואיפה התחנה הקרובה במקום כל תחנה שמבוטלת.';
  }
  function autoTitle(pages, city) {
    if (pages.length === 1) return 'שינוי בקו ' + pages[0].line;
    return city ? 'שינויים בקווים ב' + city : 'שינויים ב-' + pages.length + ' קווים';
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
      : 'קווים ' + pages.map(function (x) { return x.line; }).join(', ') + (multiDate ? ' · מ-' + LC.dmy(s0) : ' · החל מ-' + LC.dmy(s0));
    var opPhone = ops.length === 1 && PHONES[ops[0]];
    return '<div class="s-cover">' +
      '<div class="band"><div class="row">' +
        (single ? '<span class="badge num">' + E(p.line) + '</span>' : '<span class="badge word">' + E(city || 'קווים') + '</span>') +
        '<div class="t"><h1 class="hd" data-k="title"></h1><p class="sub">' + E(sub) + '</p></div></div>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="body">' +
        '<div class="facts">' +
          '<div class="fact"><span class="l">' + (multiDate ? 'החל מ' : 'ממתי') + '</span><span class="v">' + E(LC.wd(s0) + ' ' + LC.dmy(s0)) + '</span>' +
            '<span class="x">' + E(hebDate(s0)) + '</span>' + (firstTrip ? '<span class="x">' + E(firstTrip) + '</span>' : '') + '</div>' +
          '<div class="fact"><span class="l">' + (ops.length > 1 ? 'חברות' : 'חברת האוטובוסים') + '</span><span class="v">' + E(ops.join(' · ')) + '</span>' +
            '<span class="x num">' + (opPhone ? 'מוקד: <span class="ltr">' + E(opPhone) + '</span>' : '') + '</span></div>' +
          '<div class="fact"><span class="l">משרד התחבורה</span><span class="v num"><span class="ltr">' + MOT + '</span></span><span class="x">מוקד המידע</span></div>' +
        '</div>' +
        '<p class="intro" data-k="intro"></p>' +
        (single ? '<div class="what"><h3 class="hd">מה משתנה?<span class="counts">' + E(totLine(p.tot || {})) + '</span></h3><ul>' + whatChanges(p).map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>'
        : pages.length <= 3 ? '<div class="what"><h3 class="hd">מה משתנה?</h3><ul>' + pages.map(function (x) {
          var w = whatChanges(x)[0] || '';
          return '<li><b>קו ' + E(x.line) + ':</b> ' + w.replace(/^<b>[^<]*:<\/b> /, '') + '</li>';
        }).join('') + '</ul></div>' : '') +
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
      (nparts > 1 ? '<p class="part">מפה ' + (part.i + 1) + ' מתוך ' + nparts + ': ' + E(part.name) + '</p>' : '') +
      segList(d) + when +
      '<p class="counts">' + E(countsLine(d)) + '</p>' +
      '<div class="legend">' +
        '<span><i class="sw old"></i>המסלול הישן (עד ' + E(LC.dm(LC.addDays(start(d), -1))) + ')</span>' +
        '<span><i class="sw"></i>המסלול החדש (מ-' + E(LC.dm(start(d))) + ')</span>' +
        (r ? '<span><i class="dot rem">1</i>תחנה שמבוטלת</span>' : '') +
        (near ? '<span><i class="sw near"></i>אל התחנה הקרובה במסלול החדש</span>' : '') +
        (segments(d).length ? '<span><i class="dot seg">1</i>כאן המסלול משתנה (כמו בהסבר)</span>' : '') +
        (a ? '<span><i class="dot add">1</i>תחנה חדשה</span>' : '') +
        '<span><i class="dot same"></i>תחנה שנשארת</span></div>' +
      '<div style="font-size:13px;color:var(--s-sub)">הוכן על ידי אדם פרטי · לא פרסום רשמי</div>' +
      '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>';
  }

  var SEG_MAX = 4;
  function segList(d) {
    var segs = segments(d);
    if (!segs.length) return '<p class="lead">' + dirLead(d) + '</p>';
    var html = '<ol class="segs">' + segs.slice(0, SEG_MAX).map(function (g, i) {
      return '<li><i class="segn">' + (i + 1) + '</i><span>' + g.html + '</span></li>';
    }).join('') + '</ol>';
    if (segs.length > SEG_MAX) html += '<p class="counts">ועוד ' + (segs.length - SEG_MAX === 1 ? 'שינוי קטן אחד' : (segs.length - SEG_MAX) + ' שינויים קטנים') + ' — ברשימת התחנות בעמוד הבא.</p>';
    return html;
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
        var sub = s._k !== 'rem' ? '' : '<span class="nr">' + (!nr || nr.none ? 'אין תחנה קרובה במסלול החדש' : 'במקום: ' + E(nr.name) + ' (כ-' + nr.m + ' מ׳ הליכה)') + '</span>';
        return '<li' + (sub ? ' class="two-l"' : '') + '><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + E(s.name) +
          (s.city && s.city !== mainCity ? ' <span class="cd">' + E(s.city) + '</span>' : '') + sub + '</span></li>';
      }).join('') + '</ol>';
    }).join('') + '</div>';
  }

  var RR = 10, RA = 16;   // שורות בעמודה: תחנות שמבוטלות (שתי שורות לכל תחנה) / חדשות
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
          '<div class="sfoot"><span>המספרים כמו במפה · המרחק לתחנה הקרובה הוא הערכה · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>'
      });
    }
    return out;
  }

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
        (pages.some(function (x) { return x.past; }) ? ' ולפי הארכיון של הקו הבוחן' : '') + ' · מפות: © תורמי OpenStreetMap · הוכן בכלי של הקו הבוחן</p></div>';
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
    return a.replace(/^דרך\s+/, '').replace(/\s+\d+[א-ת]?$/, '').replace(/\s+(א|ב|ג)'?$/, '').trim();
  }
  function streets(list, minus) {
    var out = [];
    list.forEach(function (s) { var t = streetOf(s.name); if (t && out.indexOf(t) < 0 && (!minus || minus.indexOf(t) < 0)) out.push(t); });
    return out;
  }
  function andList(arr, max) {
    max = max || 3;
    var a = arr.slice(0, max), rest = arr.length - a.length;
    if (rest > 0) return a.join(', ') + ' ועוד';
    if (a.length < 2) return a.join('');
    return a.slice(0, -1).join(', ') + ' ו' + a[a.length - 1];
  }
  function q(s) { return s.name; }   // שם התחנה מודגש בשקף — בלי מירכאות (ממילא יש בשמות גרשיים)
  function nearLine(stops, shape) {
    if (!stops.length || shape.length < 2) return false;
    var lat0 = shape[0][0], sx = shape.map(function (p) { return xy(p, lat0); });
    return stops.every(function (s) { return distToLine(xy(s.ll, lat0), sx) <= 40; });
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
      if (n.length && !o.length) return 'הקו יתחיל את הנסיעה כבר ב' + b(n[0]) + ', לפני ' + b(B) + '.';
      return 'הקו יתחיל את הנסיעה ב' + b(n[0]) + ' במקום ב' + b(o[0]) + '.';
    }
    if (!B) {   // סוף הקו
      if (o.length && !n.length) return 'הקו לא יגיע יותר עד ' + b(o[o.length - 1]) + '. התחנה האחרונה תהיה ' + b(A) + '.';
      if (n.length && !o.length) return 'הקו ימשיך אחרי ' + b(A) + ' עד ' + b(n[n.length - 1]) + '.';
      return 'הקו יסיים את הנסיעה ב' + b(n[n.length - 1]) + ' במקום ב' + b(o[o.length - 1]) + '.';
    }
    var sameRoadOld = nearLine(o, d.new.shape), sameRoadNew = nearLine(n, d.old.shape);
    if (o.length && !n.length) {
      if (sameRoadOld || !oS.length) return 'בין ' + b(A) + ' ל' + b(B) + ' הקו ממשיך באותה דרך, אבל לא יעצור יותר ב' + (o.length === 1 ? 'תחנה ' : 'תחנות ') + names(o) + '.';
      g.route = true;
      return 'אחרי ' + b(A) + ' הקו כבר לא ייסע דרך ' + E(andList(oS)) + '. הוא ייסע בדרך אחרת ויגיע ל' + b(B) + '.';
    }
    if (n.length && !o.length) {
      if (sameRoadNew || !nS.length) return (n.length === 1 ? 'נוספה תחנה חדשה: ' : 'נוספו תחנות חדשות: ') + names(n) + ' (בין ' + b(A) + ' ל' + b(B) + ').';
      g.route = true;
      return 'אחרי ' + b(A) + ' הקו ייסע בדרך חדשה, דרך ' + E(andList(nS)) + ', ויחזור למסלול הרגיל ב' + b(B) + '.';
    }
    if (oS.length || nS.length) {
      g.route = true;
      return 'אחרי ' + b(A) + ' הקו ' + (oS.length ? 'כבר לא ייסע דרך ' + E(andList(oS)) + '. במקום זה הוא ייסע' : 'ייסע') +
        (nS.length ? ' דרך ' + E(andList(nS)) : ' בדרך אחרת') + ', ויחזור למסלול הרגיל ב' + b(B) + '.';
    }
    return 'בין ' + b(A) + ' ל' + b(B) + ' הקו יעצור בתחנות אחרות באותם רחובות: ' + names(n) + ' במקום ' + names(o) + '.';
  }

  /* "מה משתנה?" לשער: 2–4 משפטים לכל הקו, החשובים קודם. מקטע זהה בשני הכיוונים — פעם אחת */
  function whatChanges(p) {
    var items = [];
    p.dirs.forEach(function (d) {
      segments(d).forEach(function (g) { items.push({ d: d, g: g }); });
    });
    items.sort(function (x, y) { return y.g.weight - x.g.weight; });
    var out = [], used = [];
    items.forEach(function (it) {
      if (out.length >= 4 || used.indexOf(it) >= 0) return;
      var g = it.g, twin = null;
      if (g.route && p.dirs.length > 1) {
        twin = items.filter(function (o) {
          return o !== it && o.d !== it.d && o.g.route && used.indexOf(o) < 0 &&
            sameSet(o.g.oS, g.oS) && sameSet(o.g.nS, g.nS);
        })[0];
      }
      if (twin) {
        used.push(twin);
        out.push('<b>הלוך וחזור:</b> הקו ' + (g.oS.length ? 'כבר לא ייסע דרך ' + E(andList(g.oS)) + (g.nS.length ? ', ובמקום זה ייסע דרך ' + E(andList(g.nS)) : '') : 'ייסע בדרך חדשה, דרך ' + E(andList(g.nS))) + '.');
      } else {
        out.push((p.dirs.length > 1 ? '<b>' + E(toward(it.d)) + ':</b> ' : '') + g.html);
      }
      used.push(it);
    });
    var rest = items.length - used.length;
    if (rest > 0) out.push('ועוד ' + (rest === 1 ? 'שינוי קטן אחד' : rest + ' שינויים קטנים') + ' — בעמודים הבאים.');
    return out;
  }
  function sameSet(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }

  /* כל השקפים לבחירה: [{id, label, html, map?}] */
  function build(pages, city) {
    var slides = [{ id: 'cover', label: 'שער', html: cover(pages, city) }];
    if (pages.length > 1) {
      var per = 9, n = Math.ceil(pages.length / per);
      for (var i = 0; i < n; i++) slides.push({ id: 'over' + i, label: 'כל הקווים' + (n > 1 ? ' (' + (i + 1) + ')' : ''), html: overview(pages.slice(i * per, (i + 1) * per), i, n) });
    }
    pages.forEach(function (p) {
      p.dirs.forEach(function (d, di) {
        var remS = d.old.stops.filter(function (s) { return d.removed.indexOf(s.code) >= 0; }).map(function (s) { return Object.assign({ _k: 'rem', _near: nearest(s, d) }, s); });
        var addS = d.new.stops.filter(function (s) { return d.added.indexOf(s.code) >= 0; }).map(function (s) { return Object.assign({ _k: 'add' }, s); });
        d._rem = remS;
        var pre = (pages.length > 1 ? p.line + ' · ' : '');
        var parts = splitParts(remS, addS);
        parts.forEach(function (pt, k) {
          slides.push({ id: p.id + '-m' + di + (k ? '-' + k : ''), label: pre + 'מפה · ' + trip(d) + (parts.length > 1 ? ' (' + pt.name + ')' : ''),
            html: mapSlide(p, d, pt, parts.length), map: { d: d, remS: remS, addS: addS, show: pt.show } });
        });
        stopsSlides(p, d, remS, addS).forEach(function (s, k) {
          slides.push({ id: p.id + '-s' + di + '-' + k, label: pre + s.label, html: s.html });
        });
      });
    });
    var feed = pages.map(function (p) { return p.feed; }).filter(Boolean).sort().pop();
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
    segments(d).slice(0, SEG_MAX).forEach(function (g, i) {
      var at = g.A || g.newS[0] || g.oldS[0];
      if (at && (!m.show || marks.some(function (x) { return dist(x.s.ll, at.ll) < 1500; }))) marks.push({ s: { ll: at.ll }, n: i + 1, k: 'seg' });
    });

    var all = L.latLngBounds([]), focus = L.latLngBounds([]);
    d.old.shape.forEach(function (p) { all.extend(p); });
    d.new.shape.forEach(function (p) { all.extend(p); });
    marks.forEach(function (x) { focus.extend(x.s.ll); });
    if (!focus.isValid()) deviating(d.old.shape, d.new.shape).concat(deviating(d.new.shape, d.old.shape)).forEach(function (p) { focus.extend(p); });
    if (!focus.isValid()) focus = all;
    map.fitBounds(focus, { paddingTopLeft: [PAD, inEl ? 110 : PAD], paddingBottomRight: [PAD, PAD], maxZoom: MAXZ });
    tiles(map).addTo(map);
    // הישן המקווקו מתחת לחדש: איפה שהמסלולים זהים רואים רק כחול, והאדום מופיע רק איפה שהקו כבר לא עובר
    if (d.old.shape.length > 1) L.polyline(d.old.shape, { color: '#b8361f', weight: 5, dashArray: '9 8', opacity: 1, interactive: false }).addTo(map);
    if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: '#1f5fd1', weight: 6, opacity: .92, interactive: false }).addTo(map);
    var changed = {};
    d.added.concat(d.removed).forEach(function (c) { changed[c] = 1; });
    d.new.stops.forEach(function (s) {
      if (!changed[s.code]) L.circleMarker(s.ll, { radius: 4.5, color: '#55625c', weight: 2.5, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map);
    });
    // מכל תחנה שמבוטלת — קו מנוקד דק אל התחנה הקרובה במסלול החדש
    m.remS.forEach(function (s) {
      if (shown(s) && s._near && !s._near.none) L.polyline([s.ll, s._near.ll], { color: '#13201b', weight: 2, dashArray: '2 5', opacity: .75, interactive: false }).addTo(map);
    });
    // סמנים ממוספרים: מרחיקים כאלה שעולים זה על זה, עם קו קצר אל המקום האמיתי
    var size = map.getSize();
    var pts = marks.map(function (x) { var c = map.latLngToContainerPoint(x.s.ll); return { x: c.x, y: c.y, x0: c.x, y0: c.y, m: x }; });
    declutter(pts, size.x, size.y, !!inEl);
    var col = { rem: '#b8361f', add: '#127a4f', mv: '#55625c', seg: '#13201b' };
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
        if (d.old.shape.length > 1) L.polyline(d.old.shape, { color: '#b8361f', weight: 2, dashArray: '4 4', interactive: false }).addTo(mini);
        if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: '#1f5fd1', weight: 2.5, interactive: false }).addTo(mini);
        L.rectangle(view, { color: '#13201b', weight: 2, fillColor: '#f2c14e', fillOpacity: .35, interactive: false }).addTo(mini);
        // כשהמסלול ארוך המלבן קטן מאוד — עיגול צהוב סביבו כדי שיראו איפה זה
        L.circleMarker(view.getCenter(), { radius: 9, color: '#13201b', weight: 2.5, fillColor: '#f2c14e', fillOpacity: .9, interactive: false }).addTo(mini);
      } else inEl.remove();
    }
    return { map: map, ready: Promise.all(waits) };
  }

  return { build: build, drawMap: drawMap, autoIntro: autoIntro, autoTitle: autoTitle, deviating: deviating };
})();
