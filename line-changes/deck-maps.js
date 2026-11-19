/* מצגת לשינוי בקו — המפות: ציור ב-Leaflet (מפת השינוי, מפת כל המסלול ומפות ההתמצאות), חלוקת מפה צפופה לשתיים,
   ואריחי המפה (המתנה וניסיון נוסף). חלק מ-LCDeck — נטען אחרון (ראו deck.js). */
(function (D) {
  var E = D.E, dist = D.dist, endName = D.endName, rerouted = D.rerouted, extOf = D.extOf, divergeAt = D.divergeAt, realRuns = D.realRuns,
      chgPts = D.chgPts, small = D.small, allGreen = D.allGreen, segNum = D.segNum, andList = D.andList, segments = D.segments;
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

  /* ---- מפה של כל המסלול ---- */
  function zoomDraw(map, m, stops, fset, all, slideEl, inEl, opts, waits) {
    stops.forEach(function (s) { if (!fset[s.code]) L.circleMarker(s.ll, { radius: 4, color: '#55625c', weight: 2.2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map); });
    var msz = map.getSize(), boxes = [], pts = [];
    stops.forEach(function (s) {
      if (!fset[s.code]) return;
      var c = map.latLngToContainerPoint(s.ll);
      pts.push({ x: c.x, y: c.y, x0: c.x, y0: c.y, s: s });
    });
    // מפת ההתמצאות — בפינה שבה היא מסתירה הכי מעט (כמו במפות השינוי), או במקום שהמשתמש גרר אליו
    var INSET = null;
    if (inEl) {
      var w = 170, h = 128, best = null;
      [[14, 14], [msz.x - w - 14, 14], [14, msz.y - h - 44], [msz.x - w - 14, msz.y - h - 30]].forEach(function (c) {
        var r = [c[0] - 12, c[1] - 12, c[0] + w + 12, c[1] + h + 12];
        var n = pts.filter(function (p) { return p.x > r[0] && p.x < r[2] && p.y > r[1] && p.y < r[3]; }).length;
        if (!best || n < best.n) best = { n: n, x: c[0], y: c[1] };
      });
      var fx = parseFloat(inEl.getAttribute('data-fx')), fy = parseFloat(inEl.getAttribute('data-fy'));
      if (!isNaN(fx) && !isNaN(fy)) best = { x: Math.max(0, Math.min(msz.x - w, fx * msz.x / 100)), y: Math.max(0, Math.min(msz.y - h - 22, fy * msz.y / 100)) };
      inEl.style.left = best.x + 'px'; inEl.style.top = best.y + 'px'; inEl.style.width = w + 'px'; inEl.style.height = h + 'px';
      if (!inEl.classList.contains('inoff')) INSET = [best.x - 14, best.y - 14, best.x + w + 14, best.y + h + 14];
      var mini = L.map(inEl, Object.assign({}, opts, { attributionControl: false }));
      mini.fitBounds(all, { padding: [8, 8] });
      var t2 = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true });
      waits.push(tileWait(t2));
      t2.addTo(mini);
      m.dirs.forEach(function (d) { var S = m.kind === 'ended' ? d.old : d.new; if ((S.shape || []).length > 1) L.polyline(S.shape, { color: m.kind === 'ended' ? '#b8361f' : '#1f9152', weight: 2.5, interactive: false }).addTo(mini); });
      var view = map.getBounds();
      L.rectangle(view, { color: '#13201b', weight: 2, fillColor: '#f2c14e', fillOpacity: .35, interactive: false }).addTo(mini);
      L.circleMarker(view.getCenter(), { radius: 7, color: '#13201b', weight: 2.5, fillColor: '#f2c14e', fillOpacity: .9, interactive: false }).addTo(mini);
    }
    declutter(pts, msz.x, msz.y, INSET);
    if (INSET) boxes.push(INSET);
    pts.forEach(function (p) {
      var at = map.containerPointToLatLng([p.x, p.y]);
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 5) L.polyline([p.s.ll, at], { color: '#13201b', weight: 1.5, opacity: .8, interactive: false }).addTo(map);
      L.marker(at, { icon: L.divIcon({ className: '', html: '<div class="lc-mk ' + (m.kind === 'ended' ? 'rem' : 'add') + '">' + m.nums[p.s.code] + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(map);
      boxes.push([p.x - 13, p.y - 13, p.x + 13, p.y + 13]);
    });
    // שמות התחנות — איפה שיש מקום
    pts.forEach(function (p) {
      var w = String(p.s.name).length * 7 + 20, h = 24, g = 15, c = p;
      var pick = [
        { dir: 'top', off: [0, -g], b: [c.x - w / 2, c.y - g - h, c.x + w / 2, c.y - g] },
        { dir: 'bottom', off: [0, g], b: [c.x - w / 2, c.y + g, c.x + w / 2, c.y + g + h] },
        { dir: 'right', off: [g, 0], b: [c.x + g, c.y - h / 2, c.x + g + w, c.y + h / 2] },
        { dir: 'left', off: [-g, 0], b: [c.x - g - w, c.y - h / 2, c.x - g, c.y + h / 2] }
      ].filter(function (o) { return o.b[0] >= 2 && o.b[1] >= 2 && o.b[2] <= msz.x - 2 && o.b[3] <= msz.y - 2 && !boxes.some(function (q) { return o.b[0] < q[2] && o.b[2] > q[0] && o.b[1] < q[3] && o.b[3] > q[1]; }); })[0];
      if (!pick) return;
      boxes.push(pick.b);
      L.tooltip({ permanent: true, direction: pick.dir, offset: pick.off, className: 'lc-lbl', interactive: false }).setLatLng(map.containerPointToLatLng([p.x, p.y])).setContent(E(p.s.name)).addTo(map);
    });
    return { map: map, ready: Promise.all(waits) };
  }
  function drawRouteMap(slideEl, m) {
    var el = slideEl.querySelector('.smap'), inEl = slideEl.querySelector('.inset');
    if (inEl && !m.focus) { inEl.remove(); inEl = null; }
    var opts = { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false };
    var map = L.map(el, opts), waits = [];
    map.attributionControl.setPrefix(false);
    var ended = m.kind === 'ended', all = L.latLngBounds([]), seen = {}, stops = [];
    m.dirs.forEach(function (d) {
      var S = ended ? d.old : d.new;
      (S.shape || []).forEach(function (pt) { all.extend(pt); });
      S.stops.forEach(function (s) { all.extend(s.ll); if (!seen[s.code]) { seen[s.code] = 1; stops.push(s); } });
    });
    if (!all.isValid()) all = L.latLngBounds([[31.5, 34.8], [32.1, 35.2]]);
    // מפה קרובה: רק התחנות של האזור (וקטע המסלול ביניהן), עם מספרים כמו ברשימה
    var fset = {}, focusB = L.latLngBounds([]);
    (m.focus || []).forEach(function (c) { fset[c] = 1; });
    if (m.focus) stops.forEach(function (s) { if (fset[s.code]) focusB.extend(s.ll); });
    if (m.focus && focusB.isValid()) map.fitBounds(focusB, { padding: [60, 60], maxZoom: 17 });
    else map.fitBounds(all, { padding: [44, 44], maxZoom: 16 });
    var t = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true });
    waits.push(tileWait(t));
    t.addTo(map);
    m.dirs.forEach(function (d) {
      var S = ended ? d.old : d.new;
      if ((S.shape || []).length > 1) L.polyline(S.shape, ended ? { color: '#b8361f', weight: 5, dashArray: '10 8', opacity: 1, interactive: false } : { color: '#1f9152', weight: 6, opacity: .92, interactive: false }).addTo(map);
      else if (S.stops.length > 1) L.polyline(S.stops.map(function (s) { return s.ll; }), { color: ended ? '#b8361f' : '#1f9152', weight: 4, dashArray: ended ? '10 8' : null, opacity: .8, interactive: false }).addTo(map);
    });
    var altAt = {};
    (m.alts || []).forEach(function (a) { (altAt[a.code] = altAt[a.code] || []).push(a.line); });
    if (m.focus) return zoomDraw(map, m, stops, fset, all, slideEl, inEl, opts, waits);
    stops.forEach(function (s) {
      if (!altAt[s.code]) L.circleMarker(s.ll, { radius: 4, color: '#55625c', weight: 2.2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map);
    });
    // התחנה הראשונה והאחרונה עם שם; בשני כיוונים שונים — של כל כיוון, בסימן אחר לכל כיוון (תחנה משותפת — תווית אחת);
    // בקו מבוטל — גם התחנות שעוצרים בהן הקווים האחרים
    var labels = [], dd = m.dirs.slice(0, 2), two = dd.length > 1;
    dd.forEach(function (d, i) {
      var S = ended ? d.old.stops : d.new.stops, o = d.od || [], inter = o[0] && o[1] && o[0] !== o[1];
      if (!S.length) return;
      var add = function (s, t) { var same = labels.filter(function (x) { return x.s.code === s.code; })[0]; if (same) { same.t += ' · ' + t; same.ds[i] = 1; } else { var ds = {}; ds[i] = 1; labels.push({ s: s, t: t, k: 'end', ds: ds }); } };
      add(S[0], two ? 'יציאה ל' + (inter ? o[1] : endName(d, 1)) : 'תחילת הקו');
      if (S.length > 1) add(S[S.length - 1], two ? 'סוף הנסיעה מ' + (inter ? o[0] : endName(d, 0)) : 'סוף הקו');
    });
    // תחנות קרובות מאוד על המפה (למשל תחילת הכיוון הראשון וסוף השני, משני צדי הכביש) — סימן ותווית אחת
    for (var li = 0; li < labels.length; li++) for (var lj = labels.length - 1; lj > li; lj--) {
      if (map.latLngToContainerPoint(labels[li].s.ll).distanceTo(map.latLngToContainerPoint(labels[lj].s.ll)) < 28) { labels[li].t += ' · ' + labels[lj].t; Object.keys(labels[lj].ds || {}).forEach(function (k) { (labels[li].ds = labels[li].ds || {})[k] = 1; }); labels.splice(lj, 1); }
    }
    Object.keys(altAt).forEach(function (c) {
      var s = stops.filter(function (x) { return x.code === c; })[0], ls = altAt[c];
      var t = ls.length > 1 ? 'קווים ' + andList(ls, 4) + ' עוצרים כאן' : 'קו ' + ls[0] + ' עוצר כאן';
      var same = labels.filter(function (x) { return x.s.code === c; })[0];
      if (same) { same.t += ' · ' + t; same.k = 'alt'; } else if (s) labels.push({ s: s, t: t, k: 'alt' });
    });
    var msz = map.getSize(), boxes = [];
    labels.forEach(function (x) {
      L.marker(x.s.ll, { icon: L.divIcon({ className: '', html: '<div class="lc-mk ' + (x.k === 'alt' ? 'alt' : 'end' + (x.ds && x.ds[1] ? (x.ds[0] ? ' ab' : ' b') : '')) + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      var c = map.latLngToContainerPoint(x.s.ll), w = Math.max(String(x.s.name).length, x.t.length) * 7 + 22, h = 38, g = 13;
      var cand = [
        { dir: 'top', off: [0, -g], b: [c.x - w / 2, c.y - g - h, c.x + w / 2, c.y - g] },
        { dir: 'bottom', off: [0, g], b: [c.x - w / 2, c.y + g, c.x + w / 2, c.y + g + h] },
        { dir: 'right', off: [g, 0], b: [c.x + g, c.y - h / 2, c.x + g + w, c.y + h / 2] },
        { dir: 'left', off: [-g, 0], b: [c.x - g - w, c.y - h / 2, c.x - g, c.y + h / 2] }
      ].filter(function (o) { return o.b[0] >= 2 && o.b[1] >= 2 && o.b[2] <= msz.x - 2 && o.b[3] <= msz.y - 2; });
      var pick = cand.filter(function (o) { return !boxes.some(function (q) { return o.b[0] < q[2] && o.b[2] > q[0] && o.b[1] < q[3] && o.b[3] > q[1]; }); })[0];
      if (!pick) return;
      boxes.push(pick.b);
      L.tooltip({ permanent: true, direction: pick.dir, offset: pick.off, className: 'lc-lbl' + (x.k === 'alt' ? ' alt' : ''), interactive: false }).setLatLng(x.s.ll)
        .setContent(E(x.s.name) + '<small' + (x.k === 'alt' ? '' : ' class="cd"') + '>' + E(x.t) + '</small>').addTo(map);
    });
    return { map: map, ready: Promise.all(waits) };
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
  /* חלוקה למפות לפי אזורים: תחנות שמשתנות שרחוקות זו מזו יותר מ-PART_GAP — מפה לכל אזור (עד 4; יותר — מאחדים
     את הקרובים). אזור אחד צפוף (10 תחנות ויותר שעולות זו על זו) — שתי מפות, חצי מהתחנות בכל אחת */
  var PART_GAP = 4000;
  function clusters(all, gap) {
    var id = all.map(function (_, i) { return i; });
    var root = function (i) { while (id[i] !== i) i = id[i] = id[id[i]]; return i; };
    for (var i = 0; i < all.length; i++) for (var j = i + 1; j < all.length; j++) {
      if (dist(all[i].ll, all[j].ll) <= gap) id[root(i)] = root(j);
    }
    var g = {};
    all.forEach(function (s, i) { (g[root(i)] = g[root(i)] || []).push(s); });
    return Object.keys(g).map(function (k) { return g[k]; });
  }
  function splitParts(remS, addS) {
    var all = remS.concat(addS);
    var one = [{ i: 0, name: '', show: null }];
    if (!all.length) return one;
    var gap = PART_GAP, cl = clusters(all, gap);
    while (cl.length > 4) { gap *= 2; cl = clusters(all, gap); }
    var a = all.map(function (s) { return px(s.ll, 0); });
    var xs = a.map(function (p) { return p[0]; }), ys = a.map(function (p) { return p[1]; });
    var vert = (Math.max.apply(null, ys) - Math.min.apply(null, ys)) >= (Math.max.apply(null, xs) - Math.min.apply(null, xs));
    var key = function (s) { return vert ? -s.ll[0] : s.ll[1]; };   // צפון/מערב קודם
    var mid = function (c) { return c.reduce(function (t, s) { return t + key(s); }, 0) / c.length; };
    var mk = function (c) { var o = {}; c.forEach(function (s) { o[s._k + s.code] = 1; }); return o; };
    if (cl.length > 1) {
      cl.sort(function (x, y) { return mid(x) - mid(y); });
      // שם לכל אזור: העיר (כשלכל אזור עיר אחרת), ואחרת צפוני/דרומי (מערבי/מזרחי)
      var city = cl.map(function (c) {
        var n = {}; c.forEach(function (s) { if (s.city) n[s.city] = (n[s.city] || 0) + 1; });
        return Object.keys(n).sort(function (x, y) { return n[y] - n[x]; })[0] || '';
      });
      var byCity = city.every(function (c, i) { return c && city.indexOf(c) === i; });
      var pos = cl.length === 2 ? (vert ? ['החלק הצפוני', 'החלק הדרומי'] : ['החלק המערבי', 'החלק המזרחי']) : null;
      return cl.map(function (c, i) { return { i: i, name: byCity ? 'ב' + city[i] : pos ? pos[i] : 'אזור ' + (i + 1), show: mk(c) }; });
    }
    if (all.length < 10 || overlaps(all.map(function (s) { return s.ll; })) <= 4) return one;
    var sorted = all.slice().sort(function (x, y) { return key(x) - key(y); });
    var half = Math.ceil(sorted.length / 2);
    return [{ i: 0, name: vert ? 'החלק הצפוני' : 'החלק המערבי', show: mk(sorted.slice(0, half)) },
            { i: 1, name: vert ? 'החלק הדרומי' : 'החלק המזרחי', show: mk(sorted.slice(half)) }];
  }

  /* מרחיק סמנים שעולים זה על זה; מחזיר מיקום חדש בפיקסלים לכל סמן */
  function declutter(pts, w, h, inset) {   // inset: [x0, y0, x1, y1] — מפת ההתמצאות (עם מרווח), או null
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
        if (inset && p.x > inset[0] && p.x < inset[2] && p.y > inset[1] && p.y < inset[3]) {
          var mv = [[inset[0] - p.x, 0], [inset[2] - p.x, 0], [0, inset[1] - p.y], [0, inset[3] - p.y]].filter(function (v) {
            var x = p.x + v[0], y = p.y + v[1]; return x >= 16 && x <= w - 16 && y >= 16 && y <= h - 16;
          }).sort(function (a, b) { return Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]); })[0];
          if (mv) { p.x += mv[0]; p.y += mv[1]; }
        }
      });
      if (!moved && it > 10) break;
    }
    return pts;
  }

  /* אריחי המפה: כל אריח שנכשל — עוד ניסיון אחד; הבטחה שמתממשת כשאין אריחים בטעינה (או אחרי 12 שניות).
     tilesMissing — כמה אריחים במפות שבדף עדיין חסרים (לא נטענו או נכשלו), כדי לא לייצא מפה חלקית בשקט */
  var TILES = [];
  function tileWait(t) {
    var st = t._lc = { err: {}, tried: {}, again: {}, seen: false };
    TILES.push(t);
    t.on('tileerror', function (e) {
      var k = t._tileCoordsToKey(e.coords);
      if (!st.tried[k]) { st.tried[k] = 1; st.again[k] = 1; setTimeout(function () { if (t._tiles[k]) { t._tiles[k].loaded = 0; e.tile.src = t.getTileUrl(e.coords) + (t.getTileUrl(e.coords).indexOf('?') < 0 ? '?' : '&') + 'r=1'; } }, 500); }
      else { st.err[k] = 1; delete st.again[k]; }
    });
    t.on('tileload', function (e) { var k = t._tileCoordsToKey(e.coords); delete st.err[k]; delete st.again[k]; });
    t.on('tileunload', function (e) { var k = t._tileCoordsToKey(e.coords); delete st.err[k]; delete st.again[k]; });
    t.on('load', function () { st.seen = true; });
    return new Promise(function (res) {
      var t0 = Date.now();
      (function poll() {
        var miss = tileMiss(t), busy = Object.keys(t._tiles || {}).some(function (k) { return !t._tiles[k].loaded || st.again[k]; });
        if ((st.seen && !busy) || Date.now() - t0 > 12000) { res(miss); return; }
        setTimeout(poll, 250);
      })();
    });
  }
  function tileMiss(t) {
    var st = t._lc || { err: {} }, n = 0;
    Object.keys(t._tiles || {}).forEach(function (k) { if (!t._tiles[k].loaded || st.err[k] || st.again[k]) n++; });   // לא נטען / נכשל / בניסיון חוזר
    return n;
  }
  /* root — רק מפות בתוך root (למשל השקפים שנכללים); retry — לטעון מחדש שכבות שחסר בהן משהו */
  function tilesMissing(inc, retry) {
    TILES = TILES.filter(function (t) { return t._map && document.contains(t._map.getContainer()); });
    var n = 0;
    TILES.forEach(function (t) {
      if (inc && !inc(t._map.getContainer())) return;
      var m = tileMiss(t);
      if (m && retry) { t._lc.err = {}; t._lc.tried = {}; t._lc.again = {}; t.redraw(); }
      n += m;
    });
    return n;
  }
  /* מצייר את המפה של שקף (ומפת ההתמצאות הקטנה); מחזיר Promise שמתממש כשהאריחים נטענו או אחרי זמן קצוב */
  function drawMap(slideEl, m) {
    if (m.route) return drawRouteMap(slideEl, m);
    var d = m.d, el = slideEl.querySelector('.smap'), inEl = slideEl.querySelector('.inset');
    var opts = { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false };
    var map = L.map(el, opts);
    map.attributionControl.setPrefix(false);
    var waits = [];
    function tiles(mp) {
      var t = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true });
      waits.push(tileWait(t));
      return t;
    }
    var shown = function (s) { return !m.show || m.show[s._k + s.code]; };
    var remN = m.remS.map(function (s, j) { return { s: s, n: j + 1, k: 'rem' }; });
    var addN = m.addS.map(function (s, j) { return { s: s, n: j + 1, k: 'add' }; });
    var mvN = d.moved.map(function (s, j) { return { s: s, n: j + 1, k: 'mv' }; });
    var marks = remN.concat(addN).filter(function (x) { return shown(x.s); }).concat(m.show ? [] : mvN);
    // מספרי המקטעים (①②…) — בנקודה שבה המסלולים נפרדים
    segments(d).slice(0, D.SEG_MAX).forEach(function (g) {
      var num = segNum(d, g), at = g.A ? { ll: divergeAt(d, g) } : (g.newS[0] || g.oldS[0]);
      if (num && at && (!m.show || marks.some(function (x) { return dist(x.s.ll, at.ll) < 1500; }))) marks.push({ s: { ll: at.ll }, n: num, k: 'seg' });
    });

    var all = L.latLngBounds([]), focus = L.latLngBounds([]);
    d.old.shape.forEach(function (p) { all.extend(p); });
    d.new.shape.forEach(function (p) { all.extend(p); });
    // סמן של מקטע (①) נכנס לגבולות רק אם הוא ליד תחנה שמשתנה — סמן רחוק לא מרחיק את המפה מהשינוי
    var stopLL = marks.filter(function (x) { return x.k !== 'seg'; }).map(function (x) { return x.s.ll; });
    marks.forEach(function (x) { if (x.k !== 'seg' || !stopLL.length || stopLL.some(function (c) { return dist(c, x.s.ll) < 2500; })) focus.extend(x.s.ll); });
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
    // הקטעים שמשתנים (האדום שהקו כבר לא נוסע בו, והירוק החדש) — כולם בתוך המפה; כשהמפה מחולקת לאזורים —
    // רק הקטעים שעוברים ליד התחנות של האזור הזה
    var core0 = marks.map(function (x) { return x.s.ll; }), chgRuns = [];
    (d.var === 'new' ? [] : realRuns(d, 'old')).concat(extOf(d) ? extPart(d) : d.var === 'end' ? [] : realRuns(d, 'new')).forEach(function (r) {
      if (m.show && !r.some(function (p) { return core0.some(function (c) { return dist(c, p) <= 1500; }); })) return;
      chgRuns.push(r);
      r.forEach(function (p) { focus.extend(p); });
    });
    if (!focus.isValid()) chgPts(d).forEach(function (p) { focus.extend(p); });
    if (!focus.isValid()) focus = all;
    map.fitBounds(focus, { paddingTopLeft: [PAD, PAD], paddingBottomRight: [PAD, PAD], maxZoom: MAXZ });
    // מפת ההתמצאות: בפינה שבה היא מסתירה הכי מעט ממה שמשתנה (סמנים, הקטע האדום והירוק). אם בכל הפינות היא
    // מסתירה משהו — קטנה יותר, ואם גם זה לא מספיק — מרחיקים את המפה הגדולה מהפינה (שוליים גדולים יותר בצד שלה)
    var INSET = null;
    if (inEl) {
      var place = function () {
        var sz = map.getSize(), pts0 = core0.map(function (ll) { return map.latLngToContainerPoint(ll); });
        chgRuns.forEach(function (r) { r.forEach(function (p) { pts0.push(map.latLngToContainerPoint(p)); }); });
        var best = null;
        [[190, 142], [150, 112]].forEach(function (wh) {
          if (best && !best.n) return;
          var w = wh[0], h = wh[1];
          [[14, 14], [sz.x - w - 14, 14], [14, sz.y - h - 44], [sz.x - w - 14, sz.y - h - 30]].forEach(function (c, ci) {
            var r = [c[0] - 12, c[1] - 12, c[0] + w + 12, c[1] + h + 12];
            var n = pts0.filter(function (p) { return p.x > r[0] && p.x < r[2] && p.y > r[1] && p.y < r[3]; }).length;
            // בשוויון — הפינה שהכי רחוקה ממה שמשתנה
            var gap = Math.min.apply(null, pts0.map(function (p) { return Math.hypot(Math.max(r[0] - p.x, 0, p.x - r[2]), Math.max(r[1] - p.y, 0, p.y - r[3])); }).concat([1e4]));
            if (!best || n < best.n || (n === best.n && gap > best.gap + 20)) best = { n: n, gap: gap, x: c[0], y: c[1], w: w, h: h, top: ci < 2 };
          });
        });
        return best;
      };
      var ip = place(), fx = parseFloat(inEl.getAttribute('data-fx')), fy = parseFloat(inEl.getAttribute('data-fy'));
      if (!isNaN(fx) && !isNaN(fy)) {   // המשתמש גרר את מפת ההתמצאות (edits.inset, אחוזים מגודל המפה)
        var msz0 = map.getSize();
        ip.x = Math.max(0, Math.min(msz0.x - ip.w, fx * msz0.x / 100)); ip.y = Math.max(0, Math.min(msz0.y - ip.h - 22, fy * msz0.y / 100)); ip.n = 0;
      }
      if (ip.n) {
        var extra = ip.h + 28;
        map.fitBounds(focus, { paddingTopLeft: [PAD, ip.top ? extra : PAD], paddingBottomRight: [PAD, ip.top ? PAD : extra], maxZoom: MAXZ });
        var ip2 = place();
        if (ip2.n <= ip.n) ip = ip2;
      }
      inEl.style.left = ip.x + 'px'; inEl.style.top = ip.y + 'px'; inEl.style.width = ip.w + 'px'; inEl.style.height = ip.h + 'px';
      if (!inEl.classList.contains('inoff')) INSET = [ip.x - 14, ip.y - 14, ip.x + ip.w + 14, ip.y + ip.h + 14];
    }
    tiles(map).addTo(map);
    // הישן המקווקו מתחת לחדש: איפה שהמסלולים זהים רואים רק כחול, והאדום מופיע רק איפה שהקו כבר לא עובר
    // רק הקטעים שהקו כבר לא נוסע בהם — לא מתחת לקו החדש, כדי שלא ייראה כאילו משהו בוטל במקום שהקו ממשיך לנסוע בו
    if (!extOf(d) && d.var !== 'new') realRuns(d, 'old').forEach(function (r) { L.polyline(r, { color: '#b8361f', weight: 5, dashArray: '9 8', opacity: 1, interactive: false }).addTo(map); });
    // המסלול החדש בירוק; כשהדרך לא משתנה — כחול-אפור ניטרלי (רק התחנה משתנה). קו שמתארך: כל המסלול אפור, והקטע החדש בירוק
    var ext = extOf(d);
    // חלופה חדשה: מסלול הקו (שלא משתנה) אפור, והדרך של החלופה בירוק רק איפה שהיא שונה. חלופה שבוטלה: הדרך שנשארה אפורה
    if (d.var === 'new' && d.old.shape.length > 1) L.polyline(d.old.shape, { color: '#5f7d96', weight: 6, opacity: .92, interactive: false }).addTo(map);
    // צבעי המסלול (ED.rc): 'chg' (ברירת המחדל) — המסלול שלא השתנה אפור-כחול, ורק הקטעים החדשים באמת בירוק;
    // 'all' — כל המסלול החדש בירוק (כמו קודם)
    if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: allGreen(d) && !d.var ? '#1f9152' : '#5f7d96', weight: 6, opacity: .92, interactive: false }).addTo(map);
    if ((rerouted(d) && !ext && !allGreen(d) && d.var !== 'end') || d.var === 'new') realRuns(d, 'new').forEach(function (r) { L.polyline(r, { color: '#1f9152', weight: 7, opacity: 1, interactive: false }).addTo(map); });
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
    if (INSET) boxes.push(INSET);   // מפת ההתמצאות
    labels.slice().sort(function (a, b) { return (wasEnd[b.code] ? 1 : 0) - (wasEnd[a.code] ? 1 : 0); }).forEach(function (st) {
      var k = st.name + st.ll.join(',');
      if (seen[k]) return; seen[k] = 1;
      var was = wasEnd[st.code], c = map.latLngToContainerPoint(st.ll);
      var w = Math.max(String(st.name).length, was ? 18 : 0, chgCode[st.code] ? 12 + (st._to ? st._to.length + 3 : 0) : 0) * 7 + 20, h = was || chgCode[st.code] ? 38 : 24, g = 15;
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
    declutter(pts, size.x, size.y, INSET);
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
        if (!ext) realRuns(d, 'old').forEach(function (r) { L.polyline(r, { color: '#b8361f', weight: 2, dashArray: '4 4', interactive: false }).addTo(mini); });
        if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: allGreen(d) ? '#1f9152' : '#5f7d96', weight: 2.5, interactive: false }).addTo(mini);
        if (rerouted(d) && !ext && !allGreen(d)) realRuns(d, 'new').forEach(function (r) { L.polyline(r, { color: '#1f9152', weight: 3, interactive: false }).addTo(mini); });
        if (ext) extPart(d).forEach(function (r) { L.polyline(r, { color: '#1f9152', weight: 3, interactive: false }).addTo(mini); });
        L.rectangle(view, { color: '#13201b', weight: 2, fillColor: '#f2c14e', fillOpacity: .35, interactive: false }).addTo(mini);
        // כשהמסלול ארוך המלבן קטן מאוד — עיגול צהוב סביבו כדי שיראו איפה זה
        L.circleMarker(view.getCenter(), { radius: 9, color: '#13201b', weight: 2.5, fillColor: '#f2c14e', fillOpacity: .9, interactive: false }).addTo(mini);
      } else inEl.remove();
    }
    return { map: map, ready: Promise.all(waits) };
  }

  // לקבצים האחרים של המצגת, ולדף (LCDeck)
  D.splitParts = splitParts;
  LCDeck.tilesMissing = tilesMissing; LCDeck.drawMap = drawMap;
})(LCDeck._in);
