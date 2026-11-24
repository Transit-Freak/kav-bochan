/* מצגת לשינוי בקו — לוח באנגלית ("שפת הלוח: English") בתצוגות שאינן לוח מודעות: תקציר, טבלה לכל קו, טבלה משולבת
   (לו"ז עדכני — cu…, הודעה על שינוי — mt…, sum…, שקפי לוח הזמנים של קו, קו חדש ומבוטל), בכל הצורות: מצגת, שלט A4, סטטוס.
   deck.js / deck-sign.js בודקים ENc() (ED.blang === 'en'), ואז לוקחים מכאן: c_T — טקסט קבוע לפי הנוסח בעברית (TX() בקוד),
   ופונקציות c_* למשפטים שהדקדוק שלהם שונה באנגלית. שמות של תחנות, ערים ויעדים — רק מתרגומי משרד התחבורה (c_N → LCBoardEN.name),
   שם בלי תרגום נשאר בעברית ונרשם ב-c_miss (לאזהרה לפני ההורדה). טקסט חדש בעברית באחת התצוגות האלה — מפתח חדש כאן (ראו CLAUDE.md). */
(function (g) {
  var X = g.LCDeckEN = g.LCDeckEN || {};
  function BE() { return g.LCBoardEN; }
  /* טקסט קבוע: הנוסח העברי בקוד → אנגלית */
  var T = {
    // לוח זמנים של קו (שקפים, שלט, סטטוס)
    'בשני הכיוונים': 'In both directions', 'ימים': 'Days', 'עד היום': 'Until now', 'ללא שינוי': 'No change', 'הקו לא נוסע': 'The line does not run',
    'נסיעות ביום': 'Trips a day', 'הנסיעה הראשונה': 'First trip', 'הנסיעה האחרונה': 'Last trip', 'כל כמה דקות בשעות השיא': 'Every … min at peak times',
    'כל כמה דקות בשאר היום': 'Every … min the rest of the day', 'אין': 'None', ' דק׳': ' min',
    'חדש': 'new', 'בוטלה': 'cancelled', 'היה ': 'was ', ' · ללא שינוי': ' · no change', ' (המשך)': ' (cont.)', 'שעה': 'Hour',
    'דקות אחרי השעה': 'Minutes past the hour', 'דקות אחרי השעה — הלוח החדש': 'Minutes past the hour · New timetable',
    'נסיעה חדשה': 'New trip', 'נסיעה שבוטלה': 'Cancelled trip', 'נסיעה שהוזזה': 'Retimed trip', 'היה 14:31': 'was 14:31',
    'מתי הקו נוסע': 'When the line runs', 'לוח הזמנים החדש': 'The new timetable',
    'שעת היציאה מהתחנה הראשונה · שעות השיא: 7:00–9:00 ו-16:00–19:00 · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי':
      'Departure time from the first stop · Peak hours: 7:00–9:00 and 16:00–19:00 · Based on Ministry of Transport data · Prepared by a private individual, not an official publication',
    // קו חדש / מבוטל
    'המסלול של הקו החדש': 'Route of the new line', 'תחנה באזור הזה (כמו ברשימה)': 'Stop in this area (as in the list)', 'תחנה אחרת של הקו': 'Other stop of the line',
    'תחנה': 'Stop', 'התחנה הראשונה והאחרונה בכל כיוון': 'First and last stop in each direction', 'התחנה הראשונה והאחרונה': 'First and last stop',
    'תחנה שעוצרים בה קווים אחרים': 'Stop served by other lines',
    'לא מצאנו קו אחר שעוצר ברוב התחנות של הקו. כדאי לבדוק במוקד או באפליקציה.': 'We found no other line that stops at most of this line’s stops. Check with the operator or in the app.',
    'קו חדש': 'New line', 'הקו מפסיק לפעול': 'Line discontinued', 'במקום זה': 'Instead', 'הוכן על ידי אדם פרטי · לא פרסום רשמי': 'Prepared by a private individual · Not an official publication',
    'במקום הקו: קווים שעוצרים באותן תחנות': 'Instead of the line: lines that stop at the same stops',
    'לפי התחנות שבהן הקווים עוצרים בנתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי': 'Based on the stops the lines serve in Ministry of Transport data · Prepared by a private individual, not an official publication',
    'מפסיק לפעול': 'Discontinued', 'לוח זמנים חדש': 'New timetable', 'שינוי': 'Change',
    // לו"ז עדכני
    'מסלול הקו': 'Line route', 'ישיר': 'direct', 'במסלול אחר': 'by another route', 'בלילה': 'night', '° רק בחלק מהימים': '° on some days only', 'אין נסיעות': 'No trips',
    'לוח זמנים': 'Timetable', 'נסיעות': 'Trips', 'הראשונה': 'First', 'האחרונה': 'Last', 'לוח זמנים עדכני · ': 'Current timetable · ',
    'מספר הנסיעות כולל תגבורים (כמה אוטובוסים שיוצאים באותה שעה)': 'Trip counts include extra buses (several buses leaving at the same time)',
    'השעות הן שעות היציאה מהתחנה הראשונה · "בלילה" = אחרי חצות של אותו לילה · לפי נתוני משרד התחבורה · לא פרסום רשמי':
      'Times are departures from the first stop · “night” = after midnight of the same night · Based on Ministry of Transport data · Not an official publication',
    ' · "בלילה" = אחרי חצות של אותו לילה': ' · “night” = after midnight of the same night',
    'שעות היציאה מהתחנה הראשונה · לפי נתוני משרד התחבורה · הוכן על ידי אדם פרטי, לא פרסום רשמי':
      'Departure times from the first stop · Based on Ministry of Transport data · Prepared by a private individual, not an official publication',
    // טבלה לכמה קווים
    'אינו פעיל': 'No service', 'בוטלה ': 'Cancelled ', 'הוזזה': 'Moved', 'שני אוטובוסים': 'Two buses', 'קו': 'Line', 'כיוון': 'Direction',
    'מה השתנה': 'What changed', 'לוחות הזמנים: מה משתנה': 'Timetables: what changes', 'לוחות הזמנים החדשים': 'The new timetables',
    'לפי יעד': 'By destination', 'לפי יעד, כל שעות היציאה': 'By destination, all departure times', 'מה משתנה': 'What changes', 'מה משתנה בקווים': 'What changes in the lines',
    'לא פרסום רשמי · הוכן על ידי אדם פרטי': 'Not an official publication · Prepared by a private individual',
    // שלט וסטטוס
    'לפני הנסיעה בדקו:': 'Check before you travel:', 'משרד התחבורה': 'Ministry of Transport', 'הקו החדש': 'The new line', 'מה זה אומר?': 'What does this mean?',
    'התחנות כאן': 'The stops here', 'מה משתנה?': 'What changes?', 'הקו לא נוסע יותר': 'The line no longer runs',
    'הפרטים המלאים של הקווים האלה — במצגת.': 'Full details of these lines are in the presentation.',
    'לא מצאנו קו אחר שעוצר ברוב התחנות.': 'We found no other line that stops at most of the stops.'
  };
  var FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DOWS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  function D() { return g.LCDeck._in; }
  function hm(m) { return g.LC.hm(m); }
  function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* ---- שמות: תרגומי משרד התחבורה (ED.en), מה שהמשתמש הקליד (ED.ben); בלי — עברית, ונרשם ב-c_miss ---- */
  var IX = null, IXsrc = null;
  function reset(ED) { X.c_miss = {}; IX = null; IXsrc = null; }
  function N(s) {
    var ED = D().ED || {};
    if (!s || !BE()) return s;
    if (IXsrc !== ED.en) { IX = BE().index(ED.en); IXsrc = ED.en; }
    return BE().name(s, IX, ED.ben, X.c_miss || (X.c_miss = {}));
  }
  function op(o) { return (BE() && BE().OPS[o]) || N(o); }
  function hol(h) { return (BE() && BE().HOL[h]) || N(h); }
  /* "A, B and C" (max — ואחריהם "and more") */
  function and(a, max) {
    max = max || 3;
    var b = a.slice(0, max);
    if (a.length > b.length) return b.join(', ') + ' and more';
    return b.length < 2 ? b.join('') : b.slice(0, -1).join(', ') + ' and ' + b[b.length - 1];
  }
  function wd(iso) { return (BE() ? BE().DOW : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[new Date(iso + 'T12:00:00').getDay()]; }
  function dix(ts) { return ts.map(function (t) { return DOWS.indexOf(t); }).filter(function (i) { return i >= 0; }).sort(); }
  /* ימים (אינדקסים): [0..4] → "Sun–Thu"; [0,1,3] → "Sun–Mon and Wed" */
  function ds(ix) {
    ix = ix.slice().sort(function (a, b) { return a - b; });
    var DOW = BE().DOW, runs = [];
    ix.forEach(function (i) { var r = runs[runs.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]); });
    return and(runs.map(function (r) { return r.length === 1 ? DOW[r[0]] : DOW[r[0]] + '–' + DOW[r[r.length - 1]]; }), 9);
  }
  function daysShort(ts) { var ix = dix(ts); return ix.join() === '5' ? 'Friday' : ix.join() === '6' ? 'Saturday' : ds(ix); }
  function dtIn(ts) {   // "on weekdays" · "on Thursday" · "on Friday" · "on Saturday and Saturday night" · "on Sun–Wed"
    var ix = dix(ts);
    if (ix.join() === '0,1,2,3,4') return 'on weekdays';
    if (ix.length === 1) return ix[0] === 6 ? 'on Saturday and Saturday night' : 'on ' + FULL[ix[0]];
    return 'on ' + ds(ix);
  }
  function dayName(ts) {
    var ix = dix(ts);
    if (ix.join() === '0,1,2,3,4') return 'Weekdays (Sun–Thu)';
    if (ix.length === 1) return ix[0] === 6 ? 'Saturday and Saturday night' : FULL[ix[0]];
    return ds(ix);
  }
  function trips(n) { return n === 1 ? '1 trip' : n + ' trips'; }
  function every(m) { return m === 60 ? 'every hour' : m === 120 ? 'every 2 hours' : m === 30 ? 'every 30 min' : 'every ' + m + ' min'; }
  function B(w) { return '<b>' + D().E(cap(w)) + ':</b> '; }
  /* ---- משפטים על לוח הזמנים (כמו newTtLine / ttLine / smallLine ב-deck.js) ---- */
  function newTtLine(e) {
    var s = e.sn, t = B(dtIn(e.t));
    if (s.n === 1) return t + '1 trip, at ' + hm(s.f) + '.';
    t += trips(s.n) + ', from ' + hm(s.f) + ' to ' + hm(s.l) + '.';
    var h = [];
    if (s.pk) h.push('at peak times ' + every(s.pk));
    if (s.op) h.push((s.pk ? 'the rest of the day ' : 'midday ') + every(s.op));
    return t + (h.length ? ' ' + cap(h.join(', ')) + '.' : '');
  }
  function ttLine(e) {
    var a = e.so, b = e.sn, w = dtIn(e.t), parts = [];
    if (!a.n) return B(w) + 'The line will start running: ' + trips(b.n) + (b.n > 1 ? ', from ' + hm(b.f) + ' to ' + hm(b.l) : ', at ' + hm(b.f)) + '.';
    if (!b.n) return B(w) + 'The line will no longer run (until now: ' + trips(a.n) + ').';
    if (a.n !== b.n) parts.push(trips(b.n) + ' a day instead of ' + a.n);
    if (a.pk && b.pk && Math.abs(a.pk - b.pk) >= 3) parts.push(every(b.pk) + ' at peak times instead of ' + every(a.pk));
    if (a.op && b.op && Math.abs(a.op - b.op) >= 3) parts.push(every(b.op) + ' the rest of the day instead of ' + every(a.op));
    if (Math.abs(a.f - b.f) >= 10) parts.push('first trip at ' + hm(b.f) + ' instead of ' + hm(a.f));
    if (Math.abs(a.l - b.l) >= 10) parts.push('last trip at ' + hm(b.l) + ' instead of ' + hm(a.l));
    if (!parts.length) parts.push('same number of trips, but some of the times change');
    return B(w) + cap(parts.join('; ')) + '.';
  }
  function noRun(no) { return B(dtIn(no)).replace(':</b>', '</b>') + 'the line does not run.'; }
  function hmList(a) { return and(a.map(hm), 12); }
  function shWord(sh) { return sh.every(function (z) { return Math.abs(z[1] - z[0]) <= 2; }) ? 'by a minute or two' : 'by a few minutes'; }
  /* x — ttDiff(e): {ad, rm, sh} */
  function smallLine(e, x) {
    var w = dtIn(e.t), parts = [];
    if (!x.sh.length && x.ad.length === 1 && x.rm.length === 1 && Math.abs(x.ad[0] - x.rm[0]) <= 30) return B(w) + 'the ' + hm(x.rm[0]) + ' trip will leave at ' + hm(x.ad[0]) + '.';
    if (x.sh.length && x.sh.length <= 3) x.sh.forEach(function (z) { parts.push('the ' + hm(z[0]) + ' trip will leave at ' + hm(z[1])); });
    else if (x.sh.length) parts.push(x.sh.length + ' trips are retimed ' + shWord(x.sh));
    if (x.ad.length) parts.push((x.ad.length === 1 ? 'a trip is added at ' : 'trips are added at ') + hmList(x.ad));
    if (x.rm.length) parts.push((x.rm.length === 1 ? 'the ' + hmList(x.rm) + ' trip is cancelled' : 'the trips at ' + hmList(x.rm) + ' are cancelled'));
    return B(w) + (parts.length > 1 ? parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1] : parts.join('')) + '.';
  }
  function sameLine(ts) { return B(dtIn(ts)).replace(':</b>', '</b>') + '— no change.'; }
  /* מפורט, טבלה: "בימי חול: 2 נסיעות חדשות, אחת בוטלה, בין 7:00 ל-9:00. השאר ללא שינוי." */
  function diffSummary(e, x) {
    var t = [];
    if (!x.ad.length && !x.rm.length && !x.sh.length) return '';
    if (!x.ad.length && !x.rm.length && x.sh.length === 1) return B(dtIn(e.t)) + '1 trip retimed (' + hm(x.sh[0][0]) + ' → ' + hm(x.sh[0][1]) + ')' + (e.n.length > 1 ? '. The other trips are unchanged.' : '.');
    if (x.ad.length) t.push(x.ad.length === 1 ? '1 new trip' : x.ad.length + ' new trips');
    if (x.rm.length) t.push(x.rm.length + (t.length ? ' cancelled' : x.rm.length === 1 ? ' trip cancelled' : ' trips cancelled'));
    if (x.sh.length) t.push(x.sh.length + (t.length ? ' retimed ' : x.sh.length === 1 ? ' trip retimed ' : ' trips retimed ') + shWord(x.sh));
    var all = x.ad.concat(x.rm).concat(x.sh.map(function (z) { return z[1]; })).sort(function (a, b) { return a - b; });
    var rng = all.length === 1 ? 'at ' + hm(all[0]) : 'between ' + hm(all[0]) + ' and ' + hm(all[all.length - 1]);
    var keep = e.n.length - x.ad.length - x.sh.length;
    return B(dtIn(e.t)) + t.join(', ') + ', ' + rng + (keep > 0 ? '. The other trips are unchanged.' : '.');
  }
  /* "רק מה שהשתנה" — שורה אחת לשינוי בלו"ז (כמו ttPlain); x — ttDiff, small — smallLine(e) כבר באנגלית */
  function plainPart(e, x, small) {
    var n = x.ad.length + x.rm.length + x.sh.length, w = dtIn(e.t), late = function (m) { return m >= 1380; };
    if (n <= 3) return small.replace(/<\/?b>/g, '').replace(/\.$/, '');
    if (x.ad.length && !x.rm.length && !x.sh.length && x.ad.every(late)) return cap(w) + ': night trips added until ' + hm(Math.max.apply(null, x.ad));
    if (x.rm.length && !x.ad.length && !x.sh.length && x.rm.every(late)) return cap(w) + ': night trips after ' + hm(Math.min.apply(null, x.rm) - 1) + ' cancelled';
    return (x.ad.length > x.rm.length ? 'More trips ' : x.rm.length > x.ad.length ? 'Fewer trips ' : 'Different times ') + w;
  }
  function plainJoin(out) { return out.slice(0, 3).join(' · ') + (out.length > 3 ? ' and more' : '') + '.'; }
  /* "קו 5" / "קווים 5, 7 ו-9" */
  function linesTxt(l) { return l.length === 1 ? 'Line ' + l[0] : 'Lines ' + and(l, 8); }
  function od(o) { return o && o[0] && o[1] ? N(o[0]) + ' ↔ ' + N(o[1]) : ''; }
  /* קו חדש / מבוטל: "מה משתנה?" */
  function dWhen(iso) { return X.a_dl ? X.a_dl(iso) : wd(iso) + ' ' + g.LC.dmy(iso); }   // "Monday, 16 November 2026"
  function kNew(started, iso) { return (started ? 'The line started running on ' : 'The line will start running on ') + D().E(dWhen(iso)) + '.'; }
  function kRuns(a, b, back, n) { return 'The line runs from <b>' + D().E(N(a)) + '</b> to <b>' + D().E(N(b)) + '</b>' + (back ? ' and back' : '') + ', stopping at ' + n + ' stops.'; }
  function kEnded(last, started, from) { return 'Last trip of the line: ' + D().E(dWhen(last)) + '. ' + (started ? 'The line has not run since.' : 'From ' + D().E(dWhen(from)) + ' the line will no longer run.'); }
  function kAlts(al) {
    var E = D().E;
    return al.length ? 'Instead: ' + (al.length === 1 ? 'line <b>' + E(al[0].line) + '</b> stops' : 'lines <b>' + E(and(al.slice(0, 4).map(function (a) { return a.line; }), 4)) + '</b> stop') + ' at many of the line’s stops.'
      : 'We found no other line that stops at most of the line’s stops.';
  }
  /* לו"ז עדכני: משך הנסיעה, ימים, הערות */
  function durTxt(m) {
    if (!m) return '';
    m = Math.max(5, Math.round(m / 5) * 5);
    var h = Math.floor(m / 60), r = m % 60, rr = r ? ' ' + r + ' min' : '';
    return h === 0 ? 'about ' + r + ' min' : h === 1 ? 'about 1 hr' + rr : 'about ' + h + ' hr' + rr;
  }
  function bandTxt(ms) {
    if (!ms.length) return '—';
    if (ms.length < 4) return ms.length === 1 ? '1 trip' : ms.length + ' trips';
    var gp = []; for (var i = 1; i < ms.length; i++) gp.push(ms[i] - ms[i - 1]);
    gp.sort(function (a, b) { return a - b; });
    var md = gp[Math.floor(gp.length / 2)];
    return 'every ' + (md >= 55 && md <= 65 ? 'hour' : md >= 25 && md <= 35 && md !== 30 ? '~30 min' : Math.max(1, Math.round(md / 5) * 5 || md) + ' min');
  }
  var BANDS = { 'בוקר': 'Morning', 'צהריים': 'Midday', 'אחה״צ': 'Afternoon', 'ערב': 'Evening', 'לילה': 'Night', 'אחרי 24': 'after 24' };
  /* שם קבוצת ימים בלו"ז עדכני / בטבלה לכמה קווים: "Sun–Thu", "Friday", "Saturday night" */
  function dayLbl(days, satNight, short) {
    var k = days.join(',');
    if (k === '0,1,2,3,4') return 'Sun–Thu';
    if (k === '5') return 'Friday';
    if (k === '6') return satNight ? (short ? 'Sat night' : 'Saturday night') : 'Saturday';
    return ds(days);
  }
  function cuNote(e, c) {
    if (!e.part) return '';
    var miss = c.days.filter(function (w) { return e.days.indexOf(w) < 0; });
    return e.days.length <= miss.length ? ds(e.days) + ' only' : 'except ' + ds(miss);
  }
  /* תיאור החלופה מהבונה ("דרך X" / שם) — בלי תרגום אוטומטי של טקסט חופשי: "דרך" → via, והשם מהמילון */
  function altTxt(t) {
    if (!t || t === 'במסלול אחר') return 'by another route';
    var m = /^(לא )?דרך (.+)$/.exec(t);
    return m ? (m[1] ? 'not via ' : 'via ') + N(m[2]) : N(t);
  }
  function altWhen(ms, hm2) { return ms.length === 1 ? 'at ' + hm2(ms[0]) : ms.length <= 3 ? 'at ' + and(ms.map(hm2), 3) : hm2(ms[0]) + '–' + hm2(ms[ms.length - 1]); }
  /* תגית סוג השינוי (כמו LC.chips — רק הראשונה מוצגת בסיכום) */
  function chips(c) {
    var h = '', sw = function (n, one, many) { return n === 1 ? one : n + ' ' + many; };
    var K = { 'new': ['add', 'New line'], ended: ['rem', 'Line discontinued'], timetable: ['tt', 'Timetable change'] };
    if (c.kind && K[c.kind]) return '<span class="chip ' + K[c.kind][0] + '">' + K[c.kind][1] + '</span>';
    if (c.var) h += '<span class="chip ' + (c.var === 'end' ? 'rem' : 'add') + '">' + (c.var === 'end' ? 'Route variant cancelled' : 'New route variant') + '</span>';
    else if (c.ext) h += '<span class="chip geo">' + (c.ext === 'end' ? 'The line extends further' : c.ext === 'start' ? 'The line starts further back' : 'The route is extended') + '</span>';
    else if (c.geo) h += '<span class="chip geo">The line takes a different route</span>';
    if (c.rem) h += '<span class="chip rem">' + sw(c.rem, '1 stop cancelled', 'stops cancelled') + '</span>';
    if (c.add) h += '<span class="chip add">' + sw(c.add, '1 new stop', 'new stops') + '</span>';
    if (c.mv) h += '<span class="chip mv">' + sw(c.mv, '1 stop relocated', 'stops relocated') + '</span>';
    return h;
  }
  Object.assign(X, {
    c_T: T, c_reset: reset, c_N: N, c_op: op, c_hol: hol, c_and: and, c_wd: wd, c_ds: ds, c_cap: cap, c_daysShort: daysShort, c_dtIn: dtIn, c_dayName: dayName,
    c_trips: trips, c_every: every, c_newTtLine: newTtLine, c_ttLine: ttLine, c_noRun: noRun, c_smallLine: smallLine, c_sameLine: sameLine,
    c_diffSummary: diffSummary, c_plainPart: plainPart, c_plainJoin: plainJoin, c_linesTxt: linesTxt, c_od: od, c_dWhen: dWhen,
    c_kNew: kNew, c_kRuns: kRuns, c_kEnded: kEnded, c_kAlts: kAlts, c_durTxt: durTxt, c_bandTxt: bandTxt, c_BANDS: BANDS, c_dayLbl: dayLbl,
    c_cuNote: cuNote, c_altTxt: altTxt, c_altWhen: altWhen, c_chips: chips, c_miss: X.c_miss || {}
  });
})(typeof window !== 'undefined' ? window : this);
