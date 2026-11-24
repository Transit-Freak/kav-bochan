/* מצגת לשינוי בקו — שלט להדפסה (A4 לאורך) ותמונה לסטטוס (9:16): לשינוי מסלול, לסוגים האחרים (קו חדש, קו מבוטל,
   שינוי בלו"ז) ולשלט של כמה קווים. חלק מ-LCDeck — נטען אחרי deck.js (ראו שם). */
(function (D) {
  var E = D.E, phoneOf = D.phoneOf, MOT = D.MOT, hebDate = D.hebDate, start = D.start, dist = D.dist, trip = D.trip, noNear = D.noNear,
      walkTxt = D.walkTxt, rerouted = D.rerouted, extOf = D.extOf, legendHtml = D.legendHtml, totLine = D.totLine, whatChanges = D.whatChanges,
      plain = D.plain, uniqDirs = D.uniqDirs, changeCenter = D.changeCenter, allStops = D.allStops, units = D.units, odTxt = D.odTxt,
      opsOf = D.opsOf, plu = D.plu, ttOpt = D.ttOpt, isKind = D.isKind, started = D.started, lastOf = D.lastOf, ttDirs = D.ttDirs,
      ttCount = D.ttCount, ttOne = D.ttOne, kindItems = D.kindItems, altsOf = D.altsOf, TTM = D.TTM, ttBlocks = D.ttBlocks, paginate = D.paginate,
      ttKey = D.ttKey, ttPagesHtml = D.ttPagesHtml, routeLegend = D.routeLegend, routeMap = D.routeMap, altList = D.altList, kTwo = D.kTwo,
      kDirBlocks = D.kDirBlocks, zoomOn = D.zoomOn, zoomGroups = D.zoomGroups, zoomMap = D.zoomMap, zoomList = D.zoomList, badgeTitle = D.badgeTitle,
      linesTxt = D.linesTxt, ttCap = D.ttCap, mtWhen = D.mtWhen, mtSlides = D.mtSlides, sumLine = D.sumLine;
  /* לוח באנגלית (ראו deck.js — ENc, deck-en-c.js) */
  var ENc = D.ENc, TX = D.TX, NM = D.NM, OPN = D.OPN, LDIR = D.LDIR, WDM = D.WDM;
  /* שינוי מסלול באנגלית — שלט, רשימת התחנות וסטטוס (deck-en-d.js — LCDeckEN.d_*; השמות — sN / enOp / Eb מ-deck.js) */
  var ENd = D.ENd, sN = D.sN, Eb = D.Eb, enOp = D.enOp, enWd = D.enWd;
  function dT() { return window.LCDeckEN.d_T; }
  function whenEn(p, iso) { return ENd().d_when(p.past, iso); }

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
  function itemsOf(u, dirs) {
    var items = whatChanges(u.p, dirs).filter(Boolean), X = ENd();
    if (u.others.length && X) items = items.map(function (t) { return X.d_plu(t.replace(X.b_dirRe, '')); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    else if (u.others.length) items = items.map(function (t) { return plu(t.replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '')); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    return items;
  }
  function badgesHtml(lines) { return lines.map(function (l) { return '<span class="badge num">' + E(l) + '</span>'; }).join(''); }
  function contactHtml(ops) {
    return ops.filter(function (o) { return phoneOf(o); }).slice(0, 3).map(function (o) { return '<span>' + E(OPN(o)) + ' <b class="ltr">' + E(phoneOf(o)) + '</b></span>'; }).join('') +
      '<span>' + TX('משרד התחבורה') + ' <b class="ltr">' + MOT + '</b></span>';
  }
  /* "קו 29 משנה מסלול" / "קווים 54 ו-784 מבטלים תחנה" */
  function headline(u, dirs) {
    var many = u.all.length > 1, rem = 0, add = 0, ext = dirs.every(function (d) { return extOf(d); }), rr = dirs.some(rerouted);
    var rs = {}, as = {};
    dirs.forEach(function (d) { d.removed.forEach(function (c) { rs[c] = 1; }); d.added.forEach(function (c) { as[c] = 1; }); });
    rem = Object.keys(rs).length; add = Object.keys(as).length;
    var ve = dirs.every(function (d) { return d.var === 'end'; }), vn = dirs.every(function (d) { return d.var === 'new'; });
    if (ENd()) return ENd().d_head(ve ? 'varEnd' : vn ? 'varNew' : ext ? 'ext' : rr ? 'route' : rem && !add ? 'rem' : add && !rem ? 'add' : rem === 1 && add === 1 ? 'move' : 'stops', rem || add);
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
    var txt = plain(items.join(' ')), X = ENd();
    var rows = remS.filter(function (s) { return s._near && !s._near.none && txt.indexOf(X ? sN(s._near) || s._near.name : s._near.name) < 0; }).slice(0, 3).map(function (s) {
      if (X) return '<li><i class="dot rem"></i><span>' + X.d_nearRow(Eb(sN(s)), Eb(sN(s._near)), s._near) + '</span></li>';
      return '<li><i class="dot rem"></i><span>במקום <b>' + E(s.name) + '</b>: <b>' + E(s._near.name) + '</b> · ' + E(walkTxt(s._near)) + '</span></li>';
    });
    return rows.length ? '<div class="sg-near"><h3 class="hd">' + (X ? dT().nearHead : 'איפה לעלות במקום?') + '</h3><ul>' + rows.join('') + '</ul></div>' : '';
  }
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
  function signHtmlEn(u, g, gi, ng, feed, remS, many) {
    var X = ENd(), T = X.d_T, p = u.p, s0 = start(p), ops = opsOf(u.all), multi = u.all.length > 1;
    var items = itemsOf(u, g.dirs);
    var more = whatChanges(p, g.dirs).length > items.length || many;
    return '<div class="s-sign" dir="ltr" lang="en">' +
      '<div class="sg-band"><div class="sg-row"><div class="badges' + (multi ? ' multi' : '') + '">' + badgesHtml(u.all.map(function (x) { return x.line; })) + '</div>' +
        '<div class="t"><h1 class="hd">' + E(multi ? X.d_same(u.all.length) : T.chg) + '</h1>' +
        '<p class="sub">' + E(multi ? ops.map(enOp).join(' · ') : [odTxtEn(p), enOp(p.op)].filter(Boolean).join(' · ')) + '</p></div></div>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="sg-when"><b>' + E(whenEn(p, s0)) + '</b><span>' + E(X.a_heb(s0)) + '</span></div>' +
      (ng > 1 ? '<p class="sg-part">' + E(trip(g.main)) + ' (' + (gi + 1) + ' of ' + ng + ')</p>' : '') +
      '<div class="sg-mapw"><div class="smap"></div><div class="inset"></div></div>' +
      legendHtml(g.main) +
      '<div class="sg-what"><h2 class="hd">' + T.what + '</h2><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
        (more ? '<li class="more">' + (many ? T.moreNext : T.moreSmall) + '</li>' : '') + '</ul></div>' +
      (many ? '' : nearBox(remS, items)) +
      '<div class="sg-contact"><span class="l">' + T.check + '</span>' + contactEn(ops) + '</div>' +
      '<div class="note">' + T.note + '</div>' +
      '<div class="sg-foot"><span>' + E(X.d_src(feed ? LC.dmy(feed) : '')) +
        (D.ED.credit === false ? '' : T.credit + '<b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>' +
      '</div>';
  }
  function contactEn(ops) {
    return ops.filter(function (o) { return phoneOf(o); }).slice(0, 3).map(function (o) { return '<span>' + E(enOp(o)) + ' <b class="ltr">' + E(phoneOf(o)) + '</b></span>'; }).join('') +
      '<span>' + dT().mot + ' <b class="ltr">' + MOT + '</b></span>';
  }
  function odTxtEn(p) { var o = p.od || []; return o[0] && o[0] === o[1] ? D.enN(o[0]) : D.enOd(o); }
  function signHtml(u, g, gi, ng, feed, remS, many) {
    if (ENd()) return signHtmlEn(u, g, gi, ng, feed, remS, many);
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
        (D.ED.credit === false ? '' : ' · נוצר בכלי של הקו הבוחן, <b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>' +
      '</div>';
  }
  /* רשימת התחנות לשלט: שתי עמודות, ממלאים לפי גובה משוער; עמוד חדש כשנגמר המקום */
  function signStops(u, g, remS, addS) {
    var cnt = {};
    remS.concat(addS).forEach(function (s) { if (s.city) cnt[s.city] = (cnt[s.city] || 0) + 1; });
    var mainCity = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
    var ent = [];
    var lines = function (t, per) { return Math.max(1, Math.ceil(t.length / per)); };
    var X = ENd();
    if (X) mainCity = D.enN(mainCity);
    var row = X ? function (s, n) {
      var nr = s._near, nm0 = sN(s), cty = s.city ? D.enN(s.city) : '';
      var sub = s._k !== 'rem' ? '' : '<span class="nr">' + (!nr || nr.none ? noNear(g.main) : X.d_nr(Eb(sN(nr)), nr)) + '</span>';
      var nm = nm0 + (cty && cty !== mainCity ? ' ' + cty : '');
      return { h: lines(nm + ' Stop ' + s.code, 32) * 28 + (sub ? lines(plain(sub), 40) * 22 : 0) + 14,
        html: '<li><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + Eb(nm0) + ' <span class="sc">' + dT().code + E(s.code) + '</span>' +
          (cty && cty !== mainCity ? ' <span class="cd">' + Eb(cty) + '</span>' : '') + sub + '</span></li>' };
    } : function (s, n) {
      var nr = s._near, sub = s._k !== 'rem' ? '' : '<span class="nr">' + (!nr || nr.none ? noNear(g.main) : 'במקום: ' + E(nr.name) + ' (' + walkTxt(nr) + ')') + '</span>';
      var nm = s.name + (s.city && s.city !== mainCity ? ' ' + s.city : '');
      return { h: lines(nm + ' מק״ט ' + s.code, 32) * 28 + (sub ? lines(plain(sub), 40) * 22 : 0) + 14,
        html: '<li><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + E(s.name) + ' <span class="sc">מק״ט ' + E(s.code) + '</span>' +
          (s.city && s.city !== mainCity ? ' <span class="cd">' + E(s.city) + '</span>' : '') + sub + '</span></li>' };
    };
    if (remS.length) { ent.push({ h: 60, head: '<h3 class="hd rem">' + (X ? dT().rem : 'תחנות שמבוטלות') + ' (' + remS.length + ')</h3>' }); remS.forEach(function (s, i) { ent.push(row(s, i + 1)); }); }
    if (addS.length) { ent.push({ h: 60, head: '<h3 class="hd add">' + (X ? dT().add : 'תחנות חדשות') + ' (' + addS.length + ')</h3>' }); addS.forEach(function (s, i) { ent.push(row(s, i + 1)); }); }
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
      if (X) {
        var T = dT();
        out.push('<div class="s-signstops" dir="ltr" lang="en"><div class="sg-shead"><div class="badges">' + badgesHtml(lines2).replace(/class="badge num"/g, 'class="badge sm num"') + '</div>' +
          '<div class="t"><h2 class="hd">' + T.stopsHead + (i ? T.cont : '') + '</h2><p class="sub">' + E(trip(g.main)) + ' · ' + E(whenEn(u.p, start(u.p))) + '</p></div></div>' +
          '<div class="seam"><i></i></div>' +
          '<div class="sg-cols' + (cols.every(function (c) { return hOf(c.parts) < H * 0.72; }) ? ' roomy' : '') + '">' + colHtml(cols[i]) + (cols[i + 1] ? colHtml(cols[i + 1]) : '<div class="col"></div>') + '</div>' +
          '<div class="sg-foot"><span>' + T.nums + ' · ' + (remS.some(function (x) { return x._near && x._near.path; }) ? T.walkPath : T.walkEst) +
            ' · ' + T.privateShort + '</span><span class="pg num"></span></div></div>');
        continue;
      }
      out.push('<div class="s-signstops"><div class="sg-shead"><div class="badges">' + badgesHtml(lines2).replace(/class="badge num"/g, 'class="badge sm num"') + '</div>' +
        '<div class="t"><h2 class="hd">התחנות שמשתנות' + (i ? ' (המשך)' : '') + '</h2><p class="sub">' + E(trip(g.main)) + ' · ' + (u.p.past ? 'מ' : 'החל מ') + E(LC.wd(start(u.p)) + ' ' + LC.dmy(start(u.p))) + '</p></div></div>' +
        '<div class="seam"><i></i></div>' +
        '<div class="sg-cols' + (cols.every(function (c) { return hOf(c.parts) < H * 0.72; }) ? ' roomy' : '') + '">' + colHtml(cols[i]) + (cols[i + 1] ? colHtml(cols[i + 1]) : '<div class="col"></div>') + '</div>' +
        '<div class="sg-foot"><span>המספרים כמו במפה · ' + (remS.some(function (x) { return x._near && x._near.path; }) ? 'זמן ההליכה לפי מפת הרחובות' : 'המרחק לתחנה הקרובה הוא הערכה') +
          ' · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>');
    }
    return out;
  }
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
  function statusHtmlEn(u, g, gi, ng) {
    var X = ENd(), T = X.d_T, p = u.p, s0 = start(p), ops = opsOf(u.all), multi = u.all.length > 1;
    var items = itemsOf(u, g.dirs).slice(0, 2);
    var rs = {}, as = {};
    g.dirs.forEach(function (d) { d.removed.forEach(function (c) { rs[c] = 1; }); d.added.forEach(function (c) { as[c] = 1; }); });
    var tl = totLine({ rem: Object.keys(rs).length, add: Object.keys(as).length }, g.dirs);
    if (tl && (Object.keys(rs).length + Object.keys(as).length > 2 || whatChanges(p, g.dirs).filter(Boolean).length > items.length)) items.push(T.total + E(tl) + '.');
    var ph = ops.length === 1 && phoneOf(ops[0]);
    return '<div class="s-status" dir="ltr" lang="en">' +
      '<div class="st-top"><div class="badges' + (multi ? ' multi' : '') + '">' + badgesHtml(u.all.map(function (x) { return x.line; })) + '</div>' +
        '<h1 class="hd">' + E(headline(u, g.dirs)) + ' <span class="nw">' + (p.past ? 'since ' : 'from ') + E(LC.dm(s0)) + '</span></h1>' +
        '<p class="sub">' + E(X.a_dl(s0)) + ' · ' + E(multi ? ops.map(enOp).join(' · ') : (ng > 1 ? trip(g.main) : [odTxtEn(p), enOp(p.op)].filter(Boolean).join(' · '))) + '</p>' +
        '<div class="seam"><i></i></div></div>' +
      '<div class="st-mapw"><div class="smap"></div></div>' +
      '<div class="st-what"><ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' +
      '<div class="st-foot"><p class="st-check">' + T.check + ' ' + (ph ? E(enOp(ops[0])) + ' <b class="ltr">' + E(ph) + '</b> · ' : '') + T.mot + ' <b class="ltr">' + MOT + '</b></p>' +
        '<p class="st-note">' + T.stNote + (D.ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</p></div>' +
      '</div>';
  }
  function statusHtml(u, g, gi, ng) {
    if (ENd()) return statusHtmlEn(u, g, gi, ng);
    var p = u.p, s0 = start(p), ops = opsOf(u.all), multi = u.all.length > 1;
    var items = itemsOf(u, g.dirs).slice(0, 2);
    // משפט סיכום: כמה תחנות — רק כשיש יותר שינויים ממה שנכנס
    var rs = {}, as = {};
    g.dirs.forEach(function (d) { d.removed.forEach(function (c) { rs[c] = 1; }); d.added.forEach(function (c) { as[c] = 1; }); });
    var tl = totLine({ rem: Object.keys(rs).length, add: Object.keys(as).length }, g.dirs);
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
        '<p class="st-note">לא פרסום רשמי · הוכן על ידי אדם פרטי' + (D.ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</p></div>' +
      '</div>';
  }

  /* ================= קו חדש · קו מבוטל · שינוי בלוח הזמנים — שלט וסטטוס ================= */
  /* ---- שלט להדפסה ---- */
  function kindWhen(p) {
    if (ENc()) return p.kind === 'ended' ? '<b>Last trip: ' + E(WDM(lastOf(p))) + '</b>' : '<b>Effective ' + E(WDM(start(p))) + '</b>';
    return p.kind === 'ended' ? '<b>הנסיעה האחרונה: ' + E(LC.wd(lastOf(p)) + ' ' + LC.dmy(lastOf(p))) + '</b><span>' + E(hebDate(lastOf(p))) + '</span>'
      : '<b>החל מ' + E(LC.wd(start(p)) + ' ' + LC.dmy(start(p))) + '</b><span>' + E(hebDate(start(p))) + '</span>';
  }
  function signBand(p) {
    return '<div class="sg-band"><div class="sg-row"><div class="badges">' + badgesHtml([p.line]) + '</div>' +
      '<div class="t"><h1 class="hd">' + E(badgeTitle(p)) + '</h1><p class="sub">' + E([odTxt(p), OPN(p.op)].filter(Boolean).join(' · ')) + '</p></div></div>' +
      '<div class="seam"><i></i></div></div>';
  }
  function signFoot(feed, map) {
    if (ENc()) return '<div class="sg-foot"><span>Based on Ministry of Transport data' + (feed ? ' from ' + E(LC.dmy(feed)) : '') + (map ? ' · Map: © OpenStreetMap contributors' : '') +
      (D.ED.credit === false ? '' : ' · Made with the HaKav HaBochen tool, <b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>';
    return '<div class="sg-foot"><span>לפי נתוני משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') + (map ? ' · מפה: © תורמי OpenStreetMap' : '') +
      (D.ED.credit === false ? '' : ' · נוצר בכלי של הקו הבוחן, <b class="ltr">kavbochan.app</b>') + '</span><span class="pg num"></span></div>';
  }
  function kindSign(p, feed, pre) {
    var out = [], o = ttOpt(), ops = [p.op], en = ENc();
    var contact = '<div class="sg-contact"><span class="l">' + TX('לפני הנסיעה בדקו:') + '</span>' + contactHtml(ops) + '</div>' +
      (en ? '<div class="note">This information was prepared by a private individual based on Ministry of Transport data, and is not an official publication. ' + (p.kind === 'ended' ? 'The information' : 'The timetable') + ' may change.</div>'
        : '<div class="note">המידע הוכן על ידי אדם פרטי, על סמך נתוני משרד התחבורה, ואינו פרסום רשמי. ' + (p.kind === 'ended' ? 'המידע' : 'לוח הזמנים') + ' עלול להשתנות.</div>');
    if (p.kind === 'new' || p.kind === 'ended') {
      var items = kindItems(p).slice(p.kind === 'new' ? 1 : 0, p.kind === 'new' ? 4 : 1);
      out.push({ id: 'sg-' + p.id, label: pre + 'שלט', map: routeMap(p),
        html: '<div class="s-sign k-' + p.kind + '"' + LDIR() + '>' + signBand(p) + '<div class="sg-when">' + kindWhen(p) + '</div>' +
          '<div class="sg-mapw"><div class="smap"></div></div>' + routeLegend(p) +
          '<div class="sg-what"><h2 class="hd">' + TX(p.kind === 'new' ? 'הקו החדש' : 'מה זה אומר?') + '</h2>' +
            (kTwo(p) && p.kind === 'new' ? kDirBlocks(p, 2) : '<ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>') + '</div>' +
          (p.kind === 'ended' ? '<div class="sg-near sg-alts"><h3 class="hd">' + TX('במקום זה') + '</h3>' + altList(p, 3) + '</div>' : '') +
          contact + signFoot(feed, true) + '</div>' });
      if (zoomOn(p)) zoomGroups(p).forEach(function (g, i, gs) {
        out.push({ id: 'sg-' + p.id + '-kz' + i, label: pre + 'שלט · מפה קרובה ' + g.name, map: zoomMap(p, g),
          html: '<div class="s-sign k-' + p.kind + '"' + LDIR() + '>' + signBand(p) + '<div class="sg-when"><b>' + E((en ? (p.kind === 'new' ? 'The new line ' : 'The discontinued line ') : p.kind === 'new' ? 'הקו החדש ' : 'הקו שמבוטל ') + g.name) + '</b><span>' +
            (gs.length > 1 ? (en ? 'Close-up map ' + (i + 1) + ' of ' + gs.length : 'מפה קרובה ' + (i + 1) + ' מתוך ' + gs.length) : '') + '</span></div>' +
            '<div class="sg-mapw"><div class="smap"></div></div>' + routeLegend(p, g) +
            '<div class="sg-what"><h2 class="hd">' + TX('התחנות כאן') + '</h2>' + zoomList(p, g, 6) + '</div>' + signFoot(feed, true) + '</div>' });
      });
    }
    if (ttOne(p)) {   // שינוי קטן מאוד בלו"ז: שלט אחד — מה השתנה, בשעות, במילים
      out.push({ id: 'sg-' + p.id + '-tt0', label: pre + 'שלט · לוח הזמנים',
        html: '<div class="s-sign s-signtt"' + LDIR() + '>' + signBand(p) + '<div class="sg-when">' + kindWhen(p) + '</div>' +
          '<div class="sg-what"><h2 class="hd">' + TX('מה משתנה?') + '</h2><p style="font-size:22px;margin:0 0 10px;color:var(--s-sub)">' + (en ? 'The route and stops remain unchanged — only the times of ' + (ttCount(p) === 1 ? 'one trip' : ttCount(p) + ' trips') + ' change'
          : 'המסלול והתחנות לא משתנים — רק השעות של ' + (ttCount(p) === 1 ? 'נסיעה אחת' : ttCount(p) + ' נסיעות')) + '.</p><ul>' + kindItems(p).map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>' +
          contact + signFoot(feed, false) + '</div>' });
      return out;
    }
    if (p.kind !== 'ended' && !(p.kind === 'new' && o.v === 'gen' && o.f === 'text')) {
      // השלט הראשון של שינוי בלו"ז: עם כותרת גדולה, מוקדים והבהרה — פחות מקום ללוח הזמנים
      var first = p.kind === 'timetable', pages = paginate(ttBlocks(p, 'sign'), TTM.sign.H, first ? 660 : 0);
      pages.forEach(function (h, i) {
        out.push({ id: 'sg-' + p.id + '-tt' + i, label: pre + (p.kind === 'new' ? 'מתי הקו נוסע' : 'שלט · לוח הזמנים') + (pages.length > 1 ? ' (' + (i + 1) + '/' + pages.length + ')' : ''),
          html: '<div class="s-sign s-signtt"' + LDIR() + '>' + (i === 0 && first ? signBand(p) + '<div class="sg-when">' + kindWhen(p) + '</div>'
              : '<div class="sg-shead"><div class="badges">' + badgesHtml([p.line]).replace(/class="badge num"/g, 'class="badge sm num"') + '</div><div class="t"><h2 class="hd">' +
                TX(p.kind === 'new' ? 'מתי הקו נוסע' : 'לוח הזמנים החדש') + (i ? TX(' (המשך)') : '') + '</h2><p class="sub">' + E(odTxt(p) + (en ? ' · Effective ' + window.LCDeckEN.a_dy(start(p)) : ' · החל מ-' + LC.dmy(start(p)))) + '</p></div></div><div class="seam"><i></i></div>') +
            ttKey(p).replace('tt-key', 'tt-key sg') +
            '<div class="tt-body f-' + o.f + ' v-' + o.v + '">' + h + '</div>' + (i === 0 && first ? contact : '') + signFoot(feed, false) + '</div>' });
      });
    }
    return out;
  }

  /* ---- סטטוס ---- */
  function kindStatus(p, pre) {
    var out = [], o = ttOpt(), en = ENc();
    var top = function (sub, small) {
      return '<div class="st-top' + (small ? ' sm' : '') + '"><div class="badges">' + badgesHtml([p.line]) + '</div>' +
        '<h1 class="hd">' + E(TX(p.kind === 'new' ? 'קו חדש' : p.kind === 'ended' ? (started(p) ? 'הקו לא נוסע יותר' : 'הקו מפסיק לפעול') : 'לוח זמנים חדש')) + ' <span class="nw">' +
          E(en ? (p.kind === 'ended' ? (started(p) ? 'since ' + LC.dm(start(p)) : 'after ' + LC.dm(lastOf(p))) : 'from ' + LC.dm(start(p))) : p.kind === 'ended' ? (started(p) ? 'מ-' + LC.dm(start(p)) : 'אחרי ' + LC.dm(lastOf(p))) : 'מ-' + LC.dm(start(p))) + '</span></h1>' +
        '<p class="sub">' + E(sub) + '</p><div class="seam"><i></i></div></div>';
    };
    var foot = '<div class="st-foot"><p class="st-check">' + TX('לפני הנסיעה בדקו:') + ' ' + (phoneOf(p.op) ? E(OPN(p.op)) + ' <b class="ltr">' + E(phoneOf(p.op)) + '</b> · ' : '') + TX('משרד התחבורה') + ' <b class="ltr">' + MOT + '</b></p>' +
      '<p class="st-note">' + TX('לא פרסום רשמי · הוכן על ידי אדם פרטי') + (D.ED.credit === false ? '' : ' · <b class="ltr">kavbochan.app</b>') + '</p></div>';
    var sub = [odTxt(p), OPN(p.op)].filter(Boolean).join(' · ');
    if (p.kind === 'new' || p.kind === 'ended') {
      var items = p.kind === 'new' ? kindItems(p).slice(1, 3) : [kindItems(p)[0]];
      if (p.kind === 'ended') {
        var al = altsOf(p).slice(0, 3);
        if (en) items.push(al.length ? 'Instead: ' + al.map(function (a) { return 'line <b>' + E(a.line) + '</b> (' + E(en.c_od(a.od) || NM(a.od[0])) + ')'; }).join(', ') + '.' : TX('לא מצאנו קו אחר שעוצר ברוב התחנות.'));
        else items.push(al.length ? 'במקום זה: ' + al.map(function (a) { return 'קו <b>' + E(a.line) + '</b> (' + E(LC.od(a.od) || a.od[0]) + ')'; }).join(', ') + '.' : 'לא מצאנו קו אחר שעוצר ברוב התחנות.');
      }
      out.push({ id: 'st-' + p.id, label: pre + 'תמונה לסטטוס', map: routeMap(p),
        html: '<div class="s-status k-' + p.kind + '"' + LDIR() + '>' + top(sub) + '<div class="st-mapw"><div class="smap"></div></div>' +
          '<div class="st-what">' + (kTwo(p) && p.kind === 'new' ? kDirBlocks(p, 1) : '<ul>' + items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>') + '</div>' + foot + '</div>' });
      if (zoomOn(p)) zoomGroups(p).forEach(function (g, i, gs) {
        out.push({ id: 'st-' + p.id + '-kz' + i, label: pre + 'סטטוס · מפה קרובה ' + g.name, map: zoomMap(p, g),
          html: '<div class="s-status k-' + p.kind + '"' + LDIR() + '>' + top(g.name + ' · ' + g.ix.length + (en ? ' stops' : ' תחנות') + (gs.length > 1 ? ' · ' + (i + 1) + '/' + gs.length : '')) +
            '<div class="st-mapw"><div class="smap"></div></div>' + foot + '</div>' });
      });
    }
    if (p.kind === 'timetable' || (p.kind === 'new' && o.v === 'det')) {
      var pages = ttPagesHtml(p, 'status');
      pages.forEach(function (h, i) {
        out.push({ id: 'st-' + p.id + '-tt' + i, label: pre + 'סטטוס · לוח הזמנים' + (pages.length > 1 ? ' (' + (i + 1) + '/' + pages.length + ')' : ''),
          html: '<div class="s-status s-sttt"' + LDIR() + '>' + top((ttDirs(p).length === 1 && p.kind === 'timetable' ? trip(ttDirs(p)[0]) : sub) + (pages.length > 1 ? ' · ' + (i + 1) + '/' + pages.length : ''), true) +
            ttKey(p).replace('tt-key', 'tt-key st') + '<div class="tt-body f-' + o.f + ' v-' + o.v + '">' + h + '</div>' + foot + '</div>' });
      });
    }
    return out;
  }

  /* שלט לכמה קווים: כשהוא יוצא ארוך (יותר מ-SIGN_MAX עמודים, למשל "כל הקווים בעיר") — במקום טבלת הלו"ז של כל
     הקווים: עמודי "מה משתנה" (שורה לכל קו), ואחריהם השלטים המפורטים רק של SIGN_LINES הקווים הראשונים.
     ED.a4full — המשתמש ביקש את הגרסה המלאה. SIGN_INFO — כמה עמודים בכל אחת (להודעה בשלב 3) */
  var SIGN_MAX = 10, SIGN_LINES = 20; D.SIGN_INFO = null;
  function signLimit(pages, full, feed) {
    D.SIGN_INFO = { full: full.length, limited: false, short: full.length };   // (נקרא רק בשלט של שינויים)
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
    D.SIGN_INFO = { full: full.length, limited: D.ED.a4full !== true, short: short.length, more: more,
      parts: { sum: sum.length, tt: tab.length, det: dpages.length, ttLines: tts.length,
        detLines: ku.reduce(function (n, u) { return n + u.all.length; }, 0), detUnits: ku.length, sumLines: rest.length } };
    return D.ED.a4full === true ? full : short;
  }
  function sumSign(pages, more) {
    // אותו שינוי בכמה קווים — שורה אחת עם כל מספרי הקווים
    var us = units(pages), per = 8, out = [], n = Math.ceil(us.length / per);
    for (var i = 0; i < n; i++) {
      var ps = us.slice(i * per, (i + 1) * per);
      out.push({ id: 'sg-sum' + i, label: 'שלט · מה משתנה' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: '<div class="s-sign s-sgsum"' + LDIR() + '><div class="sg-band"><div class="sg-row" style="padding-top:14px"><div class="t"><h1 class="hd">' + TX('מה משתנה בקווים') + '</h1><p class="sub">' +
          E(linesTxt(pages) + ' · ' + mtWhen(pages)) + (n > 1 ? ' · ' + (i + 1) + '/' + n : '') + '</p></div></div><div class="seam"><i></i></div></div>' +
          '<ul class="sm-rows" style="margin:12px 40px 0">' + ps.map(function (u) {
            var p = u.p, many = u.all.length > 1;
            return '<li><span class="badges" style="display:flex;flex-wrap:wrap;gap:4px;max-width:180px">' + u.all.map(function (x) { return '<span class="badge sm num">' + E(x.line) + '</span>'; }).join('') + '</span>' +
              '<div class="sm-t"><div class="sm-h">' + (ENc() ? ENc().c_chips : LC.chips)(p.kind ? { kind: p.kind } : p.tot || {}).replace(/^(<span class="chip[^"]*">[^<]*<\/span>)[\s\S]*$/, '$1') +
              '<span class="sm-od">' + E(many ? (ENc() ? 'Same change on ' + u.all.length + ' lines' : 'אותו שינוי ב-' + u.all.length + ' קווים') : odTxt(p)) + '</span></div><p>' + (many ? plu(sumLine(p).replace(/^<b>(בנסיעה|בקו)[^<]*<\/b>, /, '')) : sumLine(p)) + '</p></div></li>';
          }).join('') + '</ul>' +
          (i === n - 1 ? '<p style="margin:14px 40px 0;font-size:20px;font-weight:700">' + TX('הפרטים המלאים של הקווים האלה — במצגת.') + '</p>' : '') +
          signFoot(null, false) + '</div>' });
    }
    return out;
  }

  // לקבצים האחרים של המצגת, ולדף (LCDeck)
  D.signPages = signPages; D.statusPages = statusPages; D.signLimit = signLimit;
})(LCDeck._in);
