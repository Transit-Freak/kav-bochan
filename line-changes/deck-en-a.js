/* מצגת לשינוי בקו — שקפים באנגלית ("שפת הלוח: English"): שער, סקירה, מפה, סיום, המקרא של המפה והתוויות במפה (deck.js, deck-maps.js).
   כאן — הטקסטים הקבועים (a_T) ועזרים קטנים: תאריכים, רבים, תגיות, שמות. שמות של תחנות, ערים וחברות — רק מתרגומי משרד התחבורה
   (LCBoardEN.name, כמו בלוח) או ממה שהמשתמש הקליד (ED.ben); שם בלי תרגום — בעברית, ונרשם ברשימת החסרים (a_miss) לאזהרה לפני ההורדה. */
(function (g) {
  var T = {
    // שער
    lines: 'Lines', line: 'Line', and: ' and ', starting: 'Starting ', from: 'From ', lastTrip: 'Last trip', lastTripS: 'Last trip ',
    firstTrip: 'First trip on the new route: ', factFrom: 'Effective', factFromMulti: 'Starting from', company: 'Bus company', companies: 'Bus companies',
    infoLine: 'Info line: ', mot: 'Ministry of Transport', motX: 'Information line', whatNew: 'What you need to know', what: 'What changes?',
    oneTrip: 'one trip', trips: ' trips', onlyTimes: 'The route and stops stay the same — only the times of ',
    noteA: 'Prepared by a private individual. This is not an official publication of the Ministry of Transport or of ',
    noteOps: 'the bus companies', noteB: '. Details may still change. Check with the info line or the app before you travel.',
    src: 'Based on Ministry of Transport data', srcFrom: ' from ', archive: ' and the HaKav HaBochen archive', osmMaps: ' · Maps: © OpenStreetMap contributors',
    more1: 'and ', more2: ' more lines — on the next page', started: 'Started ', until: 'Until ',
    // סקירה
    allLines: 'All the lines that change', thLine: 'Line', thWhat: 'What changes', thWhen: 'From',
    foot: 'Prepared by a private individual · Not an official publication · Map: © OpenStreetMap contributors',
    // שקף המפה
    toward: 'Toward ', mapOf: 'map ', of: ' of ', sameRoute: 'The route does not change — only the ', stopW: 'stop', stopsW: 'stops',
    footShort: 'Prepared by a private individual · Not an official publication', someTrips: ' (some trips)',
    // מקרא
    lgVarEnd: 'Route of the cancelled trips (until ', lgSame: 'Line route (unchanged)', lgVarNew: 'Route of the new trips (from ',
    lgExt: 'New section (from ', lgOld: 'Section the line no longer uses (until ', lgAll: 'New route (from ', lgSameR: 'Unchanged route',
    lgNewSeg: 'New section (from ', lgRem: 'Cancelled stop', lgNear: 'To the nearest stop on the new route', lgWalk: ' (walking time in the list)',
    lgSeg: 'The route changes here (see text)', lgAdd: 'New stop', lgMv: 'Stop that moves', lgStay: 'Stop that stays',
    inArea: ' in this area · The numbers on the map match the list on the next page',
    // סיום
    check: 'Check before you travel',
    closeA: 'Prepared by a private individual, based on Ministry of Transport data. This is not an official publication of the Ministry of Transport or of ',
    closeTt: '. The timetable may change at any time. Check with the info line or the app before you travel.',
    closeCh: '. The change may still be updated at any time. Check with the info line or the app before you travel.',
    // שם המצגת
    chg1: 'Line ', chg1b: ' service change', same: 'Same change on ', linesN: ' lines', chgs: 'Service changes: lines ', chgsN: 'Service changes on ',
    newLine: 'New line: ', ended: ' stops running', ttFor: 'New timetable for line ', current: 'Current timetable',
    bNew: 'New line', bEnded: 'Stops running', bTt: 'New timetable', bChg: 'Service change',
    // מבוא בשער
    inNew: 'On the next pages: a map of the route, all the stops, and when the line runs.',
    inEnded: 'On the next pages: a map of the route, and which other lines stop at the same stops.',
    inTt: 'The route and stops stay the same — only the times change. On the next pages: the old and the new timetable.',
    inTtAll: 'The routes stay the same — only the times change. On the next pages: the timetable of each line.',
    inSmall: 'On the next pages: a close-up map of where the stop changes.',
    inExt: 'On the next pages: a map of the new section of the route.',
    inAdd1: 'On the next pages: a map with the new stop.', inAddN: 'On the next pages: a map with the new stops.',
    inRem1: 'On the next pages: a map with the cancelled stop, and where the nearest stop is.',
    inRemN: 'On the next pages: a map with the cancelled stops, and where the nearest stop is.',
    inStops: 'On the next pages: a map of the stops that change.',
    inRoute: 'On the next pages: a map of the old and the new route', inRouteRem: ', and the nearest stop in place of each cancelled stop.',
    // תגיות
    cNew: 'New line', cEnded: 'Line cancelled', cTt: 'Timetable change', cVarEnd: 'Route variant cancelled', cVarNew: 'New route variant',
    cExtEnd: 'Line goes further', cExtStart: 'Line starts further back', cExt: 'Line extended', cGeo: 'Takes a different route',
    // מפות (deck-maps.js)
    mStartTo: 'Start · to ', mEndFrom: 'End · from ', mStart: 'Start of the line', mEnd: 'End of the line', mStopsHere: ' stop here', mStopHere: ' stops here',
    mWasStart: 'The line used to start here', mWasEnd: 'The line used to end here', mCode: 'Stop code ', mBoth: 'both directions', mTo: 'to ', mFrom: 'from ',
    mNorth: 'Northern part', mSouth: 'Southern part', mWest: 'Western part', mEast: 'Eastern part', mArea: 'Area ', mIn: 'In '
  };
  var WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function pd(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  /* יום בשבוע: "Tue" (short) / "Tuesday" */
  function wd(iso, long) { var w = pd(iso).getDay(); return long ? WD[w] : WD[w].slice(0, 3); }
  /* תאריך עברי באנגלית: "7 Kislev 5787" */
  function heb(iso) {
    try {
      var parts = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(pd(iso));
      var get = function (t) { return (parts.filter(function (x) { return x.type === t; })[0] || {}).value || ''; };
      var d = get('day'), m = get('month'), y = get('year');
      return d && m && y ? d + ' ' + m + ' ' + y : '';
    } catch (e) { return ''; }
  }
  /* 1 → "1 stop cancelled", 3 → "3 stops cancelled" */
  function pl(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  /* מספר קו עם אות (1א) — מבודד משמאל לימין בתוך טקסט באנגלית */
  function ln(l) { l = String(l == null ? '' : l); return /[א-ת]/.test(l) ? '⁦' + l + '⁩' : l; }
  /* "9, 18 and 54" */
  function list(a) {
    return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + T.and + a[a.length - 1];
  }
  /* שמות: אינדקס התרגומים ורשימת החסרים — מתאפסים בכל בנייה של המצגת (ED חדש) */
  var ED0 = null, IX = null, MISS = {};
  function ed() {
    var D = g.LCDeck && g.LCDeck._in, E = (D && D.ED) || {};
    if (E !== ED0) { ED0 = E; IX = g.LCBoardEN ? g.LCBoardEN.index(E.en) : {}; MISS = {}; }
    return E;
  }
  function nm(s) { var E = ed(); return g.LCBoardEN ? g.LCBoardEN.name(s, IX, E.ben, MISS) : s; }
  function op(o) { return (g.LCBoardEN && g.LCBoardEN.OPS[o]) || nm(o); }
  function od(o) { return (o && o[0] && o[1]) ? nm(o[0]) + ' ↔ ' + nm(o[1]) : ''; }
  function miss() { ed(); return Object.keys(MISS); }
  /* תגיות סיכום (כמו LC.chips) */
  function stopsWord(n, k) { return k === 'rem' ? pl(n, 'stop cancelled', 'stops cancelled') : k === 'add' ? pl(n, 'new stop', 'new stops') : pl(n, 'stop moves', 'stops move'); }
  function chips(c) {
    var K = { 'new': ['add', T.cNew], ended: ['rem', T.cEnded], timetable: ['tt', T.cTt] }, h = '';
    if (c.kind && K[c.kind]) return '<span class="chip ' + K[c.kind][0] + '">' + K[c.kind][1] + '</span>';
    if (c['var']) h += '<span class="chip ' + (c['var'] === 'end' ? 'rem' : 'add') + '">' + (c['var'] === 'end' ? T.cVarEnd : T.cVarNew) + '</span>';
    else if (c.ext) h += '<span class="chip geo">' + (c.ext === 'end' ? T.cExtEnd : c.ext === 'start' ? T.cExtStart : T.cExt) + '</span>';
    else if (c.geo) h += '<span class="chip geo">' + T.cGeo + '</span>';
    if (c.rem) h += '<span class="chip rem">' + stopsWord(c.rem, 'rem') + '</span>';
    if (c.add) h += '<span class="chip add">' + stopsWord(c.add, 'add') + '</span>';
    if (c.mv) h += '<span class="chip mv">' + stopsWord(c.mv, 'mv') + '</span>';
    return h;
  }
  g.LCDeckEN = g.LCDeckEN || {};
  Object.assign(g.LCDeckEN, { a_T: T, a_wd: wd, a_heb: heb, a_pl: pl, a_ln: ln, a_list: list, a_nm: nm, a_op: op, a_od: od, a_miss: miss, a_chips: chips });
})(typeof window !== 'undefined' ? window : this);
