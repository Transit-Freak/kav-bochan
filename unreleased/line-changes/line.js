/* מה משתנה בקווים — דף של קו אחד: לכל כיוון מפה (לפני מקווקו אדום, אחרי כחול) ורשימות תחנות. */
(function () {
  var id = document.body.getAttribute('data-id');
  var $ = function (s) { return document.getElementById(s); };
  var E = LC.esc;

  LC.getJSON('../data/l/' + id + '.json').then(render).catch(function () {
    $('dirs').innerHTML = '<div class="empty-state">השינוי הזה כבר לא ברשימה. אולי משרד התחבורה ביטל אותו, או שעבר זמן מאז שנכנס לתוקף.<br><a href="../">לכל השינויים</a></div>';
  });

  function render(p) {
    var first = p.dirs[0];
    $('badge').textContent = p.line;
    $('title').textContent = 'מה משתנה בקו ' + p.line;
    $('od').textContent = LC.od(p.od);
    if (p.feed) $('feed').textContent = ' מ-' + LC.dmy(p.feed);

    // לפני ← אחרי: היום האחרון במסלול הישן והיום הראשון בחדש
    var start = p.formal || p.eff;
    var past = p.eff < p.gen;
    var willX = LC.wd(start) + (p.formal && p.formal !== p.eff ? ' · נסיעה ראשונה ב' + (LC.wd(p.eff) + ' ' + LC.dm(p.eff)).replace(/ /g, '\u00a0')
      : ' · ' + (past ? 'כבר בתוקף' : LC.rel(p.gen, start)));
    $('when').innerHTML =
      '<div class="was"><span class="lbl">המסלול הישן</span><span class="d">עד ' + LC.dm(LC.addDays(start, -1)) + '</span>' +
      '<span class="x">כמו שהקו נוסע היום</span></div>' +
      '<div class="arr" aria-hidden="true">←</div>' +
      '<div class="will"><span class="lbl">המסלול החדש</span><span class="d">מ-' + LC.dmy(start) + '</span>' +
      '<span class="x">' + E(willX) + '</span></div>';

    $('facts').innerHTML =
      '<span>חברה: <b>' + E(p.op) + '</b></span>' +
      '<span>מק"ט: <b>' + E(p.makat) + '</b></span>' +
      '<span>' + (p.dirs.length > 1 ? 'משתנים <b>' + p.dirs.length + ' כיוונים</b>' : 'משתנה <b>כיוון אחד</b>') + '</span>';

    if (p.dirs.length > 1) {
      $('dirnav').innerHTML = p.dirs.map(function (d, i) {
        return '<a href="#d' + i + '">' + E(LC.dirOd(d.od)) + altTxt(d) + '</a>';
      }).join('');
    }
    var box = $('dirs');
    p.dirs.forEach(function (d, i) { box.appendChild(dirSection(d, i, p)); });
    document.title = 'מה משתנה בקו ' + p.line + ' · ' + LC.od(p.od);
  }

  function altTxt(d) { return (d.alt && d.alt !== '#' && d.alt !== '0') ? ' · חלופה ' + d.alt : ''; }

  function dirSection(d, i, p) {
    var sec = document.createElement('section');
    sec.className = 'dir';
    sec.id = 'd' + i;
    var addS = d.new.stops.filter(function (s) { return d.added.indexOf(s.code) >= 0; });
    var remS = d.old.stops.filter(function (s) { return d.removed.indexOf(s.code) >= 0; });
    var other = d.eff !== p.eff ? ' · מ' + LC.wd(d.formal || d.eff) + ' ' + LC.dm(d.formal || d.eff) : '';
    sec.innerHTML =
      '<h2>' + E(LC.dirOd(d.od)) + '<small>' + E(altTxt(d).replace(/^ · /, '') + other) + '</small></h2>' +
      '<div class="chips">' + LC.chips({ geo: d.geo, add: d.added.length, rem: d.removed.length, mv: d.moved.length }) + '</div>' +
      '<div class="mapbox"><div class="map" role="img" aria-label="מפת השינוי בכיוון ' + E(LC.dirOd(d.od)) + '"></div>' +
      '<div class="mapctl"><button type="button" data-v="ch" aria-pressed="true">השינוי</button><button type="button" data-v="all" aria-pressed="false">כל המסלול</button></div>' +
      '<div class="legend"><span><i class="sw old"></i>המסלול עד עכשיו</span><span><i class="sw"></i>המסלול החדש</span>' +
      (remS.length ? '<span><i class="dot rem"></i>תחנה שיורדת</span>' : '') +
      (addS.length ? '<span><i class="dot add"></i>תחנה חדשה</span>' : '') +
      '<span><i class="dot same"></i>תחנה בלי שינוי</span></div></div>' +
      '<div class="lists">' + list('rem', 'תחנות שיורדות', remS, 'אין תחנות שיורדות בכיוון הזה') +
      list('add', 'תחנות חדשות', addS, 'אין תחנות חדשות בכיוון הזה') +
      (d.moved.length ? list('mv', 'תחנות שזזות', d.moved, '') : '') + '</div>' +
      (d.swaps && d.swaps.length ? '<p class="minor">ועוד ' + (d.swaps.length === 1 ? 'תחנה אחת שקיבלה' : d.swaps.length + ' תחנות שקיבלו') +
        ' מספר (מק"ט) חדש באותו מקום ובאותו שם. הן לא נספרות כאן כשינוי.</p>' : '');
    // המפה נבנית אחרי שהחלק נכנס לדף (Leaflet צריך גודל)
    setTimeout(function () { drawMap(sec, d, remS, addS); }, 0);
    return sec;
  }

  function list(kind, title, arr, empty) {
    var h = '<div class="list ' + kind + '"><h3>' + title + (arr.length ? ' (' + arr.length + ')' : '') + '</h3>';
    if (!arr.length) return h + '<div class="empty">' + empty + '</div></div>';
    h += '<ol>' + arr.map(function (s, j) {
      var extra = kind === 'mv' ? ' · ' + s.m + ' מ׳' : '';
      return '<li><span class="n">' + (j + 1) + '</span><span class="nm">' + E(s.name) +
        (s.city ? ' <span class="cd">' + E(s.city) + '</span>' : '') + '</span><span class="cd">' + E(s.code) + extra + '</span></li>';
    }).join('') + '</ol></div>';
    return h;
  }

  /* ---- מפה ---- */
  function xy(p, lat0) { return [p[1] * 111320 * Math.cos(lat0 * Math.PI / 180), p[0] * 110540]; }
  function distToLine(pt, line, lat0) {
    var P = xy(pt, lat0), best = Infinity;
    for (var i = 0; i + 1 < line.length; i++) {
      var A = line[i], B = line[i + 1];
      var vx = B[0] - A[0], vy = B[1] - A[1], L = vx * vx + vy * vy;
      var t = L ? Math.max(0, Math.min(1, ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L)) : 0;
      var dx = P[0] - A[0] - t * vx, dy = P[1] - A[1] - t * vy, dd = dx * dx + dy * dy;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  }
  /* נקודות במסלול a שרחוקות מהמסלול b יותר מ-40 מ' — כדי לקרב את המפה למקום שבו משהו השתנה */
  function deviating(a, b) {
    if (a.length < 2 || b.length < 2) return [];
    var lat0 = a[0][0], bxy = b.map(function (p) { return xy(p, lat0); });
    return a.filter(function (p) { return distToLine(p, bxy, lat0) > 40; });
  }

  function drawMap(sec, d, remS, addS) {
    var el = sec.querySelector('.map');
    var map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap'
    }).addTo(map);
    var cBefore = '#b8361f', cAfter = '#1f5fd1';
    // הישן המקווקו מתחת לחדש: איפה שהמסלולים זהים רואים רק כחול, והאדום מופיע רק איפה שהקו כבר לא עובר
    var newL = d.new.shape.length > 1 ? L.polyline(d.new.shape, { color: cAfter, weight: 5, opacity: .9 }) : null;
    var oldL = d.old.shape.length > 1 ? L.polyline(d.old.shape, { color: cBefore, weight: 4, dashArray: '8 7', opacity: .95 }) : null;
    var changed = {};
    d.added.concat(d.removed).forEach(function (c) { changed[c] = 1; });
    d.new.stops.forEach(function (s) {
      if (changed[s.code]) return;
      L.circleMarker(s.ll, { radius: 4, color: '#55625c', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(s.name).addTo(map);
    });
    function numbered(arr, kind) {
      arr.forEach(function (s, j) {
        L.marker(s.ll, { icon: L.divIcon({ className: '', html: '<div class="mk ' + kind + '">' + (j + 1) + '</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
          zIndexOffset: kind === 'add' ? 1000 : 900, keyboard: false })
          .bindTooltip((j + 1) + '. ' + s.name + (kind === 'rem' ? ' — יורדת' : kind === 'add' ? ' — חדשה' : ''))
          .addTo(map);
      });
    }
    numbered(remS, 'rem');
    numbered(addS, 'add');
    numbered(d.moved, 'mv');

    var all = L.latLngBounds([]);
    if (oldL) all.extend(oldL.getBounds());
    if (newL) all.extend(newL.getBounds());
    d.new.stops.forEach(function (s) { all.extend(s.ll); });
    var ch = L.latLngBounds([]);
    remS.concat(addS).concat(d.moved).forEach(function (s) { ch.extend(s.ll); });
    deviating(d.old.shape, d.new.shape).concat(deviating(d.new.shape, d.old.shape)).forEach(function (p) { ch.extend(p); });
    var views = { ch: ch.isValid() ? ch : all, all: all };
    map.fitBounds(views.ch);
    if (oldL) oldL.addTo(map);
    if (newL) newL.addTo(map);
    function show(v) {
      map.fitBounds(views[v], { padding: [28, 28], maxZoom: 16 });
      sec.querySelectorAll('.mapctl button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === v ? 'true' : 'false'); });
    }
    sec.querySelectorAll('.mapctl button').forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-v')); });
    });
    show('ch');
  }
})();
