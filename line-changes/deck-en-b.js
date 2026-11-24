/* מצגת לשינוי בקו — שקפים באנגלית (D.ED.blang === 'en'): המשפטים על שינוי המסלול ורשימות התחנות (deck.js — ENb()).
   כאן רק הטקסט: deck.js מחשב מה השתנה, מתרגם את השמות (LCBoardEN.name — תרגומי משרד התחבורה), ומעביר לכאן שמות מוכנים
   (כבר מוגנים ל-HTML; שם מודגש — כבר עם <b>). שם בלי תרגום נשאר בעברית ונרשם ב-b_miss (לאזהרה לפני ההורדה). */
(function (g) {
  var EN = g.LCDeckEN = g.LCDeckEN || {};
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function pl(n, one, many) { return n === 1 ? one : n + ' ' + many; }
  /* "A, B and C" · יותר מ-max — "A, B, C and more" */
  function andList(arr, max) {
    max = max || 3;
    var a = arr.slice(0, max);
    if (arr.length > a.length) return a.join(', ') + ' and more';
    if (a.length < 2) return a.join('');
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  /* "via A and B, and via X Junction" — רחובות, ומקום אחד לכל היותר */
  function via(st, places) {
    var out = st.length ? 'via ' + andList(st) : '';
    if (places && places.length) out += (out ? ', and via ' : 'via ') + places[0];
    return out;
  }
  /* "של קו 5" / "של הקווים 5, 7" (d._nn מ-build) → "of line 5" / "of lines 5, 7" */
  function nn(t) {
    var m = /^של הקווים\s+(.+)$/.exec(t || ''), m1 = /^של קו\s+(.+)$/.exec(t || '');
    return m ? 'of lines ' + m[1] : m1 ? 'of line ' + m1[1] : 'of the line';
  }
  function walk(nr) { return nr.min ? 'about ' + nr.min + ' min walk, ' + nr.m + ' m' : 'about ' + nr.m + ' m walk'; }
  /* ימים בקיצור מהבונה ("א׳–ה׳", "א׳ ו-ג׳", "שישי", "שבת") → "Sun–Thu" */
  function heDays(t) {
    var L = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ש': 6 }, ix = [], m, re = /(שישי|שבת|[אבגדהוש])['׳]?(\s*[–-]\s*(?=[אבגדהוש]['׳]))?/g, run = -1;
    if (!/[א-ת]/.test(t || '') || !g.LCBoardEN) return '';
    while ((m = re.exec(t))) {
      var i = m[1] === 'שישי' ? 5 : m[1] === 'שבת' ? 6 : L[m[1]];
      if (run >= 0) for (var k = run + 1; k < i; k++) ix.push(k);
      ix.push(i); run = m[2] ? i : -1;
    }
    return ix.length ? g.LCBoardEN.days(ix) : '';
  }
  Object.assign(EN, {
    b_ok: true,
    b_miss: {},
    b_missing: function () { return Object.keys(EN.b_miss); },
    b_andList: andList,
    b_via: via,
    b_walk: walk,
    b_alt: ' (on some trips)',
    /* כותרת לנסיעה: "From Kiryat Gat to Hatzor HaGlilit" · קו בתוך העיר: "The line in Ashdod, from A to B" */
    b_trip: function (o0, o1, A, B, same) {
      if (!o0 || !o1 || o0 === o1) {
        if (A && B && !same) return 'The line in ' + o0 + ', from ' + A + ' to ' + B;
        return 'The line' + (o0 ? ' in ' + o0 : '') + (A ? ', from ' + A : '');
      }
      return 'From ' + o0 + ' to ' + o1;
    },
    b_toward: function (to, from) { return to ? 'Toward ' + to : from ? 'From ' + from : 'On the line'; },
    b_stops: function (r, a, geo) {
      var s = [];
      if (r) s.push('the line will no longer stop at ' + (r === 1 ? 'one stop' : r + ' stops'));
      if (a) s.push((r ? 'and will stop at ' : 'the line will stop at ') + (a === 1 ? 'one new stop' : a + ' new stops'));
      var out = s.join(', ');
      if (geo) return out ? 'The line takes a different route. ' + cap(out) : 'The line takes a different route, and the stops do not change';
      return cap(out);
    },
    b_noNear: function (t) { return 'No nearby alternative stop ' + nn(t) + ' on the new route'; },
    b_moved: function (n) { return pl(n, 'One stop moves', 'stops move') + ' to a nearby location.'; },
    b_cities: function (cl) { return ' The changes are in ' + (cl.length > 3 ? cl.slice(0, 3).join(', ') + ' and more' : andList(cl)) + '.'; },
    b_cnt: { rem: function (n) { return pl(n, 'One stop cancelled', 'stops cancelled'); }, add: function (n) { return pl(n, 'One new stop', 'new stops'); },
      map: ' · The numbers on the map match the list on the next page' },
    b_moreSegs: function (n) { return 'And ' + (n === 1 ? 'one more small change' : n + ' more small changes') + ' — in the stop list on the next page.'; },
    b_instead: function (name, nr) { return 'Instead: ' + name + ' (' + walk(nr) + ')'; },
    b_code: 'Stop ',
    b_small: { rem: ' — cancelled', add: ' — new' },
    /* שקף התחנות */
    b_sl: {
      label: 'Stops · ', cont: ' (cont.)', rem: 'Cancelled stops', add: 'New stops', noRem: 'No cancelled stops on this trip', noAdd: 'No new stops on this trip',
      moved: 'Stops moving to a nearby location: ', about: function (m) { return ' (about ' + m + ' m)'; },
      swaps: function (n) { return (n === 1 ? 'One stop stays in the same place with the same name; only its number changed.' : n + ' stops stay in the same place with the same names; only their numbers changed.'); },
      foot: function (path) { return 'Numbers as on the map · ' + (path ? 'Walking time by the street map, at a normal pace' : 'The distance to the nearest stop is an estimate') + ' · Prepared by a private individual, not an official publication'; }
    },
    /* איפה התחנה: "between A and B" · "about 200 m after A" · בלי כיוון — "about 200 m from the stop A" */
    b_loc: {
      between: function (A, B) { return 'between ' + A + ' and ' + B; },
      after: function (m, A) { return 'about ' + m + ' m after ' + A; },
      before: function (m, B) { return 'about ' + m + ' m before ' + B; },
      from: function (m, X) { return 'about ' + m + ' m from the stop ' + X; }
    },
    /* משפט לכל מקטע (segText): כל הפרמטרים — HTML מוכן */
    b_seg: {
      other: function () { return 'The line takes a completely different route.'; },
      startCut: function (o0, B) { return 'The line will no longer start at ' + o0 + '. The first stop will be ' + B + '.'; },
      startExt: function (n, n0, B) {
        return (n === 1 ? 'The line will start at a new stop: ' + n0 : 'The line will start ' + n + ' stops earlier, at ' + n0) +
          '. From there it will go to ' + B + ', which until now was the first stop, and continue on its usual route. All other stops stay the same.';
      },
      startAdd: function (n0, B) { return 'The line will now start at ' + n0 + ', before ' + B + '.'; },
      startNew: function (n0, o0) { return 'The line will start at ' + n0 + ' instead of ' + o0 + '.'; },
      endCut: function (oL, A) { return 'The line will no longer go as far as ' + oL + '. The last stop will be ' + A + '.'; },
      endExt: function (n, A, nL) {
        return 'The line will no longer end at ' + A + '. It will continue from there ' + (n === 1 ? 'to a new stop: ' : n + ' more stops, to ') + nL +
          '. The rest of the route and all other stops stay the same.';
      },
      endAdd: function (A, nL) { return 'The line will continue past ' + A + ' to ' + nL + '.'; },
      endNew: function (nL, oL) { return 'The line will end at ' + nL + ' instead of ' + oL + '.'; },
      rem: function (n, names, loc) { return 'The line will no longer stop at ' + (n === 1 ? 'the stop ' : 'the stops ') + names + (loc ? ' (' + loc + ')' : '') + '.'; },
      remNear: function (many, x, near, nr) { return (many ? 'Instead of ' + x + ': ' : 'Nearest stop: ') + near + ', ' + walk(nr) + '.'; },
      remNone: function (x, none) { return 'Near ' + x + ': ' + none.charAt(0).toLowerCase() + none.slice(1) + '.'; },
      offRoute: function (A, S, B) { return 'After ' + A + ', the line will no longer go ' + S + '. It will take another way and reach ' + B + '.'; },
      add: function (n, names, loc) { return (n === 1 ? 'New stop: ' : 'New stops: ') + names + (loc ? ', ' + loc : '') + '.'; },
      newRoute: function (A, S, B) { return 'After ' + A + ', the line will take a new way, ' + S + ', and return to its usual route at ' + B + '.'; },
      swap1: function (o0, n0, m) { return 'The route does not change. Instead of the stop ' + o0 + ', the line will stop at a new stop, ' + n0 + ', about ' + m + ' m away.'; },
      swapN: function (A, B, nn2, on) { return 'The route does not change. Between ' + A + ' and ' + B + ' the line will stop at ' + nn2 + ' instead of ' + on + '.'; },
      route: function (A, oS, nS, B) {
        return 'After ' + A + ', the line ' + (oS ? 'will no longer go ' + oS + '. Instead it will go' : 'will go') + (nS ? ' ' + nS : ' another way') +
          ', and return to its usual route at ' + B + '.';
      },
      sameSt: function (A, B, nn2, on) { return 'Between ' + A + ' and ' + B + ' the line will stop at other stops on the same streets: ' + nn2 + ' instead of ' + on + '.'; },
      moved: function (x, m) { return 'The stop ' + x + ' moves to a new location, about ' + m + ' m from the old one.'; }
    },
    /* חלופה שבוטלה / חדשה (varText) */
    b_var: function (end, A, where, n, names, last, freq) {
      var st = (n === 1 ? 'the stop ' : 'the stops ') + names, at = A ? 'After ' + A + ', ' : '';
      if (end) return at + (A ? 'buses' : 'Buses') + ' will no longer go ' + (where || 'this way') + ', and will not stop at ' + st + '.' + (last ? ' Last trip on this route: ' + last + '.' : '');
      return at + (A ? 'some' : 'Some') + ' buses will go ' + (where || 'a new way') + ' and stop at ' + st + '.' + (freq ? ' ' + freq + '.' : '');
    },
    /* "N נסיעות ביום, א׳–ה׳" (d.freq מהבונה) → "3 trips a day, Sun–Thu"; לא מזוהה — '' */
    b_freq: function (t) {
      var m = /^(נסיעה אחת|(\d+) נסיעות) ביום(?:,\s*(.+))?$/.exec(String(t || '').trim());
      if (!m) return '';
      var ds = m[3] ? heDays(m[3]) : '';
      if (m[3] && !ds) return '';
      return (m[2] ? m[2] + ' trips' : 'One trip') + ' a day' + (ds ? ', ' + ds : '');
    },
    /* הערה על מה מבוססת ההשוואה (d.basis מהבונה) → אנגלית; לא מזוהה — '' (לא מציגים עברית בשקף באנגלית) */
    b_basis: function (t) {
      t = String(t || '');
      var m = /^לפי לוח הזמנים: לחלופה (.+?) אין נסיעות מ-([\d.]+)\.$/.exec(t);
      if (m) return 'According to the timetable, variant ' + m[1] + ' has no trips from ' + m[2] + '.';
      m = /^חלופה (.+?) מופיעה לראשונה ב-([\d.]+)\.\s*$/.exec(t);
      if (m) return 'Variant ' + m[1] + ' first appears on ' + m[2] + '.';
      m = /^ההשוואה היא בין חלופה (.+?) \(עד ([\d.]+)\) לחלופה (.+?) \(מ-([\d.]+)\)/.exec(t);
      if (m) return 'The comparison is between variant ' + m[1] + ' (until ' + m[2] + ') and variant ' + m[3] + ' (from ' + m[4] + ') of the same line and direction, which replaced it.';
      return '';
    },
    /* שער: "מה משתנה?" */
    b_both: {
      lead: '<b>In both directions:</b> ',
      route: function (oS, nS) { return '<b>In both directions</b> the line ' + (oS ? 'will no longer go ' + oS + (nS ? ', and instead will go ' + nS : '') : 'will take a new way, ' + nS) + '.'; },
      addPair: function (x, side, codes, loc) { return 'Two new stops named ' + x + ', one in each direction' + (side ? ', on opposite sides of the road' : '') + codes + (loc ? ', ' + loc : '') + '.'; },
      remPair: function (x, side, codes) { return 'The line will no longer stop at the two stops named ' + x + ', one in each direction' + (side ? ', on opposite sides of the road' : '') + codes + '.'; },
      codes: function (a, b) { return ' (stops ' + a + ' and ' + b + ')'; },
      add: function (n, names, loc) { return '<b>In both directions</b> there ' + (n === 1 ? 'is a new stop, ' : 'are new stops, ') + names + (loc ? ', ' + loc : '') + '.'; },
      rem: function (n, names) { return '<b>In both directions</b> the line will no longer stop at ' + (n === 1 ? 'the stop ' : 'the stops ') + names + '.'; }
    },
    b_dirLbl: function (t) { return '<b>' + t + ':</b> '; },
    b_more: 'More on the next pages.',
    b_moreCh: 'More changes on the next pages.',
    b_lines: function (ls) { return '<b>Lines ' + andList(ls, 12) + ':</b> '; },
    b_line: function (l) { return '<b>Line ' + l + ':</b> '; },
    b_dirRe: /^<b>(Toward|From|On the line)[^<]*:<\/b> /,
    /* שינוי שכבר התחיל (כמו pastTense ב-app.js לעברית): "will no longer stop" → "no longer stops", "Buses will not stop" → "Buses do not stop" */
    b_past: function (t) {
      var V = { be: 'is', go: 'goes', reach: 'reaches', 'continue': 'continues' }, v3 = function (v) { return V[v] || v + 's'; };
      return String(t).split(/(?<=\. )/).map(function (x) {
        if (/\bbuses\b/i.test(x)) return x.replace(/\bwill not\b/g, 'do not').replace(/\bwill (no longer )?/g, '$1');   // רבים: "Buses no longer go"
        return x.replace(/\bwill (no longer |not |now )?(\w+)/g, function (m, n, v) { return n === 'not ' ? 'does not ' + v : (n === 'now ' ? '' : n || '') + v3(v); })
          .replace(/, and (return|continue) /g, function (m, v) { return ', and ' + v3(v) + ' '; });
      }).join('').replace(/which until now was/g, 'which before the change was');
    }
  });
})(typeof window !== 'undefined' ? window : this);
