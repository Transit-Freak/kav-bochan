/* מה משתנה בקווים — הדף הראשי: רשימת השינויים לפי תאריך, עם סינון לפי עיר ומספר קו. */
(function () {
  var $ = function (s) { return document.getElementById(s); };
  var E = LC.esc;
  var data = null, city = '', q = '';
  try { city = localStorage.getItem('lc-city') || ''; } catch (e) {}

  LC.getJSON('data/index.json').then(function (d) {
    data = d;
    if (d.feed) $('feed').textContent = ' מ-' + LC.dmy(d.feed);
    buildCities();
    draw();
  }).catch(function () {
    $('list').innerHTML = '<div class="empty-state">לא הצלחנו לטעון את רשימת השינויים. נסו לרענן את הדף.</div>';
  });

  function buildCities() {
    // בניסוי: רק הערים שנבדקו. בכל הארץ: הערים שיש בהן הכי הרבה שינויים
    var names = data.scope && data.scope.length ? data.scope.slice() : topCities();
    if (names.indexOf(city) < 0) city = '';
    var h = '<button type="button" data-c="">כל השינויים</button>' +
      names.map(function (c) { return '<button type="button" data-c="' + E(c) + '">' + E(c) + '</button>'; }).join('');
    $('cities').innerHTML = h;
    $('cities').addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      city = b.getAttribute('data-c');
      try { localStorage.setItem('lc-city', city); } catch (e) {}
      draw();
    });
  }
  function topCities() {
    var n = {};
    data.changes.forEach(function (c) { (c.chcities || []).forEach(function (x) { n[x] = (n[x] || 0) + 1; }); });
    return Object.keys(n).sort(function (a, b) { return n[b] - n[a]; }).slice(0, 8);
  }

  $('q').addEventListener('input', function () { q = this.value.trim(); draw(); });

  function match(c) {
    if (city && (c.cities || []).indexOf(city) < 0) return false;
    if (q && String(c.line).indexOf(q) !== 0 && String(c.makat).indexOf(q) !== 0) return false;
    return true;
  }

  function draw() {
    $('cities').querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-c') === city ? 'true' : 'false');
    });
    var rows = data.changes.filter(match);
    var nDirs = rows.reduce(function (s, c) { return s + c.dirs.length; }, 0);
    $('count').textContent = rows.length
      ? (rows.length === 1 ? 'קו אחד' : rows.length + ' קווים') + (nDirs > rows.length ? ' · ' + nDirs + ' כיוונים' : '')
      : '';
    if (!rows.length) {
      $('list').innerHTML = '<div class="empty-state">' + (data.changes.length
        ? 'אין שינויים שמתאימים לחיפוש.'
        : 'אין כרגע שינויי מסלול או תחנות שנכנסים לתוקף בשבועיים הקרובים.') + '</div>';
      return;
    }
    // קבוצה לכל תאריך כניסה לתוקף; מה שכבר נכנס לתוקף — בסוף
    var groups = {}, order = [];
    rows.forEach(function (c) {
      var d = c.formal || c.eff;
      if (!groups[d]) { groups[d] = []; order.push(d); }
      groups[d].push(c);
    });
    order.sort(function (a, b) {
      var pa = a < data.gen, pb = b < data.gen;
      return pa !== pb ? (pa ? 1 : -1) : (pa ? (a < b ? 1 : -1) : (a < b ? -1 : 1));
    });
    $('list').innerHTML = order.map(function (d) {
      var past = d < data.gen;
      return '<section class="day' + (past ? ' past' : '') + '"><div class="dayhead"><h2>' +
        (past ? 'בתוקף מ' : 'מ') + LC.wd(d) + ' ' + LC.dm(d) + '</h2><span>' + LC.rel(data.gen, d) + '</span></div>' +
        '<div class="cards">' + groups[d].map(card).join('') + '</div></section>';
    }).join('');
  }

  function card(c) {
    var t = c.tot;
    if (!t) {
      t = { geo: false, add: 0, rem: 0, mv: 0 };
      c.dirs.forEach(function (d) { t.geo = t.geo || d.geo; t.add += d.add; t.rem += d.rem; t.mv += d.mv; });
    }
    return '<a class="card" href="l/' + encodeURIComponent(c.id) + '.html">' +
      '<div class="row"><span class="badge">' + E(c.line) + '</span><div class="t"><span class="od">' + E(LC.od(c.od)) + '</span>' +
      '<span class="op">' + E(c.op) + (c.dirs.length > 1 ? ' · ' + c.dirs.length + ' כיוונים' : ' · כיוון אחד') + '</span></div></div>' +
      '<div class="chips">' + LC.chips(t) + '</div>' +
      '<div class="seam" aria-hidden="true"><i></i></div></a>';
  }
})();
