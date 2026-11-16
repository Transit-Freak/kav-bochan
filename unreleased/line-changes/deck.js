/* מצגת לשינוי בקו — בניית השקפים מנתוני השינוי (data/l/<id>.json).
   כל שקף הוא קנבס 1280×720; התצוגה המקדימה מקטינה אותו, וההדפסה (PDF) מדפיסה אותו בגודל מלא.
   סדר השקפים, כמו במצגות שהוכנו ביד: שער · (סקירה, כשיש כמה קווים) · לכל כיוון: מפה ותחנות · סיום. */
var LCDeck = (function () {
  var E = LC.esc;
  var ROWS = 16;            // שורות בעמודה ברשימת התחנות; שתי עמודות לכל קבוצה
  var PER = ROWS * 2;
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
  function altTxt(d) { return (d.alt && d.alt !== '#' && d.alt !== '0') ? ' · חלופה ' + d.alt : ''; }
  function plural(n, one, many) { return n === 1 ? one : n + ' ' + many; }

  /* הסיכום הקצר של כיוון: "16 תחנות יורדות ו-16 חדשות" */
  function dirLead(d) {
    var r = d.removed.length, a = d.added.length, parts = [];
    if (r) parts.push(plural(r, 'תחנה אחת יורדת', 'תחנות יורדות'));
    if (a) parts.push(plural(a, 'תחנה חדשה אחת', 'תחנות חדשות'));
    var s = parts.length ? '<b>' + parts.join(' ו-') + '</b> בכיוון הזה.' : '';
    if (d.geo) s += (s ? ' ' : '') + 'המסלול עצמו משתנה.';
    if (d.moved.length) s += ' ' + plural(d.moved.length, 'תחנה אחת זזה', 'תחנות זזות') + '.';
    var ch = {};
    d.added.concat(d.removed).forEach(function (c) { ch[c] = 1; });
    var cities = {};
    d.old.stops.concat(d.new.stops).forEach(function (st) { if (ch[st.code] && st.city) cities[st.city] = 1; });
    var cl = Object.keys(cities);
    if (cl.length) s += ' השינויים ב' + (cl.length > 3 ? cl.slice(0, 3).join(', ') + ' ועוד' : cl.join(', ')) + '.';
    return s;
  }

  function autoIntro(pages) {
    if (pages.length === 1) {
      var p = pages[0], t = p.tot || {}, bits = [];
      var both = p.dirs.length > 1 ? 'בשני הכיוונים' : 'בכיוון ' + LC.dirOd(p.dirs[0].od);
      if (t.geo) bits.push('המסלול משתנה ' + both);
      if (t.rem || t.add) bits.push((t.rem ? plural(t.rem, 'תחנה אחת יורדת', 'תחנות יורדות') : '') +
        (t.rem && t.add ? ' ו-' : '') + (t.add ? plural(t.add, 'תחנה חדשה אחת', 'תחנות חדשות') : ''));
      return (bits.join(', ') + '. ').replace(/^\. $/, '') + 'המפות ורשימות התחנות בעמודים הבאים.';
    }
    return pages.length + ' קווים משתנים. לכל קו יש מפה של לפני ואחרי ורשימת התחנות שיורדות ושנוספות.';
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
    var firstTrip = single && p.formal && p.formal !== p.eff ? 'נסיעה ראשונה: ' + LC.wd(p.eff) + ' ' + LC.dm(p.eff) : '';
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
          '<div class="fact"><span class="l">' + (ops.length > 1 ? 'חברות' : 'חברה') + '</span><span class="v">' + E(ops.join(' · ')) + '</span>' +
            '<span class="x num">' + (opPhone ? '<span class="ltr">' + E(opPhone) + '</span>' : (single ? 'מק"ט ' + E(p.makat) : plural(pages.length, 'קו אחד', 'קווים'))) + '</span></div>' +
          '<div class="fact"><span class="l">משרד התחבורה</span><span class="v num"><span class="ltr">' + MOT + '</span></span><span class="x">מוקד המידע</span></div>' +
        '</div>' +
        '<p class="intro" data-k="intro"></p>' +
        (single ? '<div class="dirs">' + p.dirs.map(function (d) {
          return '<div><b>' + E(LC.dirOd(d.od)) + E(altTxt(d)) + '</b><span class="chips">' +
            LC.chips({ geo: d.geo, rem: d.removed.length, add: d.added.length, mv: d.moved.length }) + '</span></div>';
        }).join('') + '</div>'
        : pages.length <= 3 ? '<div class="dirs">' + pages.map(function (x) {
          return '<div><b><span class="num">' + E(x.line) + '</span> · ' + E(LC.od(x.od)) + '</b><span class="chips">' + LC.chips(x.tot || {}) + '</span></div>';
        }).join('') + '</div>' : '') +
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

  function mapSlide(p, d) {
    var r = d.removed.length, a = d.added.length;
    var when = start(d) !== start(p) ? '<p class="lead">החל מ' + E(LC.wd(start(d)) + ' ' + LC.dmy(start(d))) + '.</p>' : '';
    return '<div class="s-map"><div class="smap"></div><div class="side">' +
      '<div class="row"><span class="badge sm num">' + E(p.line) + '</span><span style="font-size:18px;color:var(--s-sub);font-weight:700">' + E(p.op) + E(altTxt(d)) + '</span></div>' +
      '<h2 class="hd">' + E(LC.dirOd(d.od)) + '</h2>' +
      '<div class="chips">' + LC.chips({ geo: d.geo, rem: r, add: a, mv: d.moved.length }) + '</div>' +
      '<p class="lead">' + dirLead(d) + '</p>' + when +
      '<p class="lead" style="color:var(--s-sub);font-size:17px">' + (r || a ? 'המספרים במפה הם כמו ברשימת התחנות בעמוד הבא.' : '') + '</p>' +
      '<div class="legend">' +
        '<span><i class="sw old"></i>המסלול עד ' + E(LC.dm(LC.addDays(start(d), -1))) + '</span>' +
        '<span><i class="sw"></i>המסלול מ-' + E(LC.dm(start(d))) + '</span>' +
        (r ? '<span><i class="dot rem">1</i>תחנה שיורדת</span>' : '') +
        (a ? '<span><i class="dot add">1</i>תחנה חדשה</span>' : '') +
        '<span><i class="dot same"></i>תחנה בלי שינוי</span></div>' +
      '<div style="font-size:13px;color:var(--s-sub)">הוכן על ידי אדם פרטי · לא פרסום רשמי</div>' +
      '</div><span class="pg num" style="position:absolute;left:14px;bottom:10px;font-size:13px;color:#5b6a63;z-index:500;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:6px"></span></div>';
  }

  function stopList(arr, off, mainCity) {
    var cols = [arr.slice(0, ROWS), arr.slice(ROWS, PER)];
    return '<div class="two">' + cols.map(function (col, ci) {
      return '<ol>' + col.map(function (s, j) {
        var n = off + ci * ROWS + j + 1;
        return '<li><i class="dot ' + s._k + '">' + n + '</i><span class="nm">' + E(s.name) +
          (s.city && s.city !== mainCity ? ' <span class="cd">' + E(s.city) + '</span>' : '') +
          '</span><span class="cd">' + E(s.code) + '</span></li>';
      }).join('') + '</ol>';
    }).join('') + '</div>';
  }

  function stopsSlides(p, d, remS, addS) {
    var n = Math.max(1, Math.ceil(remS.length / PER), Math.ceil(addS.length / PER));
    var cnt = {};
    remS.concat(addS).forEach(function (s) { if (s.city) cnt[s.city] = (cnt[s.city] || 0) + 1; });
    var mainCity = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
    var out = [];
    for (var i = 0; i < n; i++) {
      var r = remS.slice(i * PER, (i + 1) * PER), a = addS.slice(i * PER, (i + 1) * PER);
      var extra = '';
      if (i === n - 1) {
        if (d.moved.length) extra += '<p class="extra">תחנות שזזות: ' + d.moved.map(function (m) { return E(m.name) + ' (' + E(m.code) + ', ' + m.m + ' מ׳)'; }).join(' · ') + '</p>';
        if (d.swaps && d.swaps.length) extra += '<p class="extra">' + plural(d.swaps.length, 'תחנה אחת קיבלה', 'תחנות קיבלו') +
          ' מספר (מק"ט) חדש באותו מקום ובאותו שם, ולא נספרו כאן כשינוי.</p>';
      }
      out.push({
        label: 'תחנות · ' + LC.dirOd(d.od) + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: '<div class="s-stops"><div class="head"><span class="badge sm num">' + E(p.line) + '</span><h2 class="hd">' +
          E(LC.dirOd(d.od)) + ': התחנות שמשתנות' + (i ? ' (המשך)' : '') + '</h2></div>' +
          '<div class="cols">' +
            '<div class="grp rem"><h3 class="hd">יורדות' + (remS.length ? ' (' + remS.length + ')' : '') + '</h3>' +
              (r.length ? stopList(r, i * PER, mainCity) : '<p class="empty">' + (i ? '' : 'אין תחנות שיורדות בכיוון הזה') + '</p>') + '</div>' +
            '<div class="grp add"><h3 class="hd">חדשות' + (addS.length ? ' (' + addS.length + ')' : '') + '</h3>' +
              (a.length ? stopList(a, i * PER, mainCity) : '<p class="empty">' + (i ? '' : 'אין תחנות חדשות בכיוון הזה') + '</p>') + '</div>' +
          '</div>' + extra +
          '<div class="sfoot"><span>המספרים כמו במפה · משמאל לכל תחנה: המק"ט שלה · הוכן על ידי אדם פרטי, לא פרסום רשמי</span><span class="pg num"></span></div></div>'
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
      '<p class="src">לפי קובץ הנתונים (GTFS) של משרד התחבורה' + (feed ? ' מ-' + E(LC.dmy(feed)) : '') + ' · מפות: © תורמי OpenStreetMap · הוכן בכלי של הקו הבוחן</p></div>';
  }

  /* כל השקפים לבחירה: [{id, label, html, map?}] */
  function build(pages, city) {
    var slides = [{ id: 'cover', label: 'שער', html: cover(pages, city) }];
    if (pages.length > 1) {
      var per = 9, n = Math.ceil(pages.length / per);
      for (var i = 0; i < n; i++) slides.push({ id: 'over' + i, label: 'כל הקווים' + (n > 1 ? ' (' + (i + 1) + ')' : ''), html: overview(pages.slice(i * per, (i + 1) * per), i, n) });
    }
    pages.forEach(function (p) {
      p.dirs.forEach(function (d, di) {
        var remS = d.old.stops.filter(function (s) { return d.removed.indexOf(s.code) >= 0; }).map(function (s) { return Object.assign({ _k: 'rem' }, s); });
        var addS = d.new.stops.filter(function (s) { return d.added.indexOf(s.code) >= 0; }).map(function (s) { return Object.assign({ _k: 'add' }, s); });
        var pre = (pages.length > 1 ? p.line + ' · ' : '');
        slides.push({ id: p.id + '-m' + di, label: pre + 'מפה · ' + LC.dirOd(d.od), html: mapSlide(p, d), map: { d: d, remS: remS, addS: addS } });
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

  /* מצייר מפה סטטית; מחזיר Promise שמתממש כשהאריחים נטענו (או אחרי זמן קצוב) */
  function drawMap(el, m) {
    var d = m.d;
    var map = L.map(el, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false });
    map.attributionControl.setPrefix(false);
    var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true });
    var all = L.latLngBounds([]), ch = L.latLngBounds([]);
    d.old.shape.forEach(function (p) { all.extend(p); });
    d.new.shape.forEach(function (p) { all.extend(p); });
    m.remS.concat(m.addS).concat(d.moved).forEach(function (s) { ch.extend(s.ll); });
    deviating(d.old.shape, d.new.shape).concat(deviating(d.new.shape, d.old.shape)).forEach(function (p) { ch.extend(p); });
    map.fitBounds(ch.isValid() ? ch : all, { padding: [46, 46], maxZoom: 16 });
    var ready = new Promise(function (res) {
      var done = false, fin = function () { if (!done) { done = true; res(); } };
      tiles.on('load', fin);
      setTimeout(fin, 12000);
    });
    tiles.addTo(map);
    // הישן המקווקו מתחת לחדש: איפה שהמסלולים זהים רואים רק כחול, והאדום מופיע רק איפה שהקו כבר לא עובר
    if (d.old.shape.length > 1) L.polyline(d.old.shape, { color: '#b8361f', weight: 5, dashArray: '9 8', opacity: 1, interactive: false }).addTo(map);
    if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: '#1f5fd1', weight: 6, opacity: .92, interactive: false }).addTo(map);
    var changed = {};
    d.added.concat(d.removed).forEach(function (c) { changed[c] = 1; });
    d.new.stops.forEach(function (s) {
      if (!changed[s.code]) L.circleMarker(s.ll, { radius: 4.5, color: '#55625c', weight: 2.5, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map);
    });
    function numbered(arr, kind, z) {
      arr.forEach(function (s, j) {
        L.marker(s.ll, { icon: L.divIcon({ className: '', html: '<div class="lc-mk ' + kind + '">' + (j + 1) + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
          zIndexOffset: z, interactive: false, keyboard: false }).addTo(map);
      });
    }
    numbered(m.remS, 'rem', 900);
    numbered(m.addS, 'add', 1000);
    numbered(d.moved, 'mv', 800);
    return { map: map, ready: ready };
  }

  return { build: build, drawMap: drawMap, autoIntro: autoIntro, autoTitle: autoTitle };
})();
