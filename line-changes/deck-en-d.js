/* מצגת לשינוי בקו — מצגת באנגלית (D.ED.blang === 'en'): שינוי מסלול ב"עמוד אחד" (oneHtml ב-deck.js) ובשלט ובסטטוס
   (signHtml, signStops, statusHtml, headline ב-deck-sign.js). כאן רק הטקסט; השמות כבר מתורגמים (תרגומי משרד התחבורה) ומוגנים ל-HTML.
   המשפטים על המסלול עצמו ("מה משתנה?") — מ-deck-en-b.js. טקסט חדש בעברית באחד השקפים האלה — גם כאן (ראו CLAUDE.md). */
(function (g) {
  var X = g.LCDeckEN = g.LCDeckEN || {};
  function walk(nr) { return X.b_walk ? X.b_walk(nr) : nr.m + ' m'; }
  var T = {
    chg: 'Service change',
    what: 'What changes?',
    mot: 'Ministry of Transport',
    check: 'Check before you travel:',
    note: 'This information was prepared by a private individual, based on Ministry of Transport data, and is not an official publication. The change may still be updated.',
    noteOne: 'This information was prepared by a private individual, based on Ministry of Transport data, and is not an official publication. The change may still be updated — check with the info line or the app before you travel.',
    src: 'Based on Ministry of Transport data', srcFrom: ' from ', osm: ' · Map: © OpenStreetMap contributors',
    credit: ' · Made with the HaKav HaBochen tool, ',
    moreNext: 'All the stops that change — on the next page.', moreSmall: 'And some more small changes.',
    nearHead: 'Where to board instead?', instead: 'Instead of ', insteadNr: 'Instead: ',
    stopsHead: 'Stops that change', cont: ' (cont.)', rem: 'Cancelled stops', add: 'New stops', code: 'Stop ',
    nums: 'Numbers as on the map', walkPath: 'Walking time by the street map', walkEst: 'The distance to the nearest stop is an estimate',
    privateShort: 'Prepared by a private individual, not an official publication',
    stNote: 'Not an official publication · Prepared by a private individual', total: 'In total: '
  };
  /* "Starting Tuesday 24.11.2026" · שינוי שכבר התחיל — "From ..." */
  function when(past, iso) { return (past ? 'Since ' : 'Effective ') + X.a_dl(iso); }
  /* כותרת התמונה לסטטוס (המספרים בתגיות שמעל): "Route change" / "Stops cancelled" */
  function head(k, n) {
    return { varEnd: 'Route variant cancelled', varNew: 'New route variant', ext: 'Route extended', route: 'Route change',
      rem: n === 1 ? 'Stop cancelled' : 'Stops cancelled', add: n === 1 ? 'New stop' : 'New stops', move: 'Stop relocated', stops: 'Stops change' }[k];
  }
  /* אותו שינוי בכמה קווים: "The line will" → "The lines will" (וגם "The line takes" → "The lines take") */
  var V = { takes: 'take', goes: 'go', stops: 'stop', starts: 'start', ends: 'end', continues: 'continue', does: 'do', is: 'are', returns: 'return' };
  function plu(t) {
    return String(t).replace(/\b([Tt])he line\b( (takes|goes|stops|starts|ends|continues|does|is|returns)\b)?/g, function (m, c, x, v) { return c + 'he lines' + (v ? ' ' + V[v] : ''); });
  }
  Object.assign(X, {
    d_T: T,
    d_when: when,
    d_head: head,
    d_plu: plu,
    d_same: function (n) { return 'The same change on ' + n + ' lines'; },
    d_first: function (iso) { return ' · First trip on the new route: ' + X.a_dl(iso); },
    d_part: function (i, n) { return 'Page ' + i + ' of ' + n; },
    d_nearRow: function (name, near, nr) { return T.instead + '<b>' + name + '</b>: <b>' + near + '</b> · ' + walk(nr); },
    d_nr: function (near, nr) { return T.insteadNr + near + ' (' + walk(nr) + ')'; },
    d_src: function (dmy, map) { return T.src + (dmy ? T.srcFrom + dmy : '') + (map === false ? '' : T.osm); }
  });
})(typeof window !== 'undefined' ? window : this);
