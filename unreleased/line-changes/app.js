/* מצגת לשינוי בקו — הדף: בחירת שינוי, עריכה, תצוגה מקדימה והורדת PDF (הדפסה של הדפדפן).
   כתובת לשיתוף: ?c=<id>[,<id>...] — למשל ?c=10988-20261117 */
(function () {
  var $ = function (s) { return document.getElementById(s); };
  var E = LC.esc;
  var idx = null, cache = {}, sel = [], city = '', q = '';
  var titleDirty = false, introDirty = false, off = {}, slides = [], maps = [], token = 0;

  try { city = localStorage.getItem('lc-city') || ''; } catch (e) {}
  var qs = new URLSearchParams(location.search);
  if (qs.get('c')) sel = qs.get('c').split(',').filter(Boolean);

  LC.getJSON('data/index.json').then(function (d) {
    idx = d;
    if (d.feed) $('feed').textContent = ' מ-' + LC.dmy(d.feed);
    sel = sel.filter(function (id) { return byId(id); });
    if (!sel.length && d.changes.length) sel = [bestDefault()];
    buildCities();
    drawPicks();
    rebuild();
  }).catch(function () {
    $('deck').innerHTML = '<div class="empty-state">לא הצלחנו לטעון את רשימת השינויים. נסו לרענן את הדף.</div>';
  });

  function byId(id) { return idx.changes.filter(function (c) { return c.id === id; })[0]; }
  /* בכניסה בלי בחירה — השינוי הגדול ביותר שעוד לא נכנס לתוקף, כדי שהדף ייפתח עם מצגת אמיתית */
  function bestDefault() {
    var up = idx.changes.filter(function (c) { return (c.formal || c.eff) >= idx.gen; });
    var pool = up.length ? up : idx.changes;
    return pool.slice().sort(function (a, b) { return size(b) - size(a); })[0].id;
  }
  function size(c) { var t = c.tot || {}; return (t.add || 0) + (t.rem || 0) + (t.geo ? 5 : 0); }

  /* ---------- בחירה ---------- */
  function buildCities() {
    var names = idx.scope && idx.scope.length ? idx.scope.slice() : [];
    if (names.indexOf(city) < 0) city = '';
    $('cities').innerHTML = '<button type="button" data-c="">הכול</button>' +
      names.map(function (c) { return '<button type="button" data-c="' + E(c) + '">' + E(c) + '</button>'; }).join('');
    $('cities').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      city = b.getAttribute('data-c');
      try { localStorage.setItem('lc-city', city); } catch (e) {}
      drawPicks();
      if (sel.length > 1 && !titleDirty) applyText();
    });
    $('q').addEventListener('input', function () { q = this.value.trim(); drawPicks(); });
  }

  function match(c) {
    if (city && (c.cities || []).indexOf(city) < 0) return false;
    if (q && String(c.line).indexOf(q) !== 0 && String(c.makat).indexOf(q) !== 0) return false;
    return true;
  }

  function drawPicks() {
    $('cities').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-c') === city ? 'true' : 'false'); });
    var rows = idx.changes.filter(function (c) { return match(c) || sel.indexOf(c.id) >= 0; });
    rows.sort(function (a, b) { return (a.formal || a.eff) < (b.formal || b.eff) ? -1 : (a.formal || a.eff) > (b.formal || b.eff) ? 1 : (+a.line || 0) - (+b.line || 0); });
    $('picks').innerHTML = rows.length ? rows.map(function (c) {
      var on = sel.indexOf(c.id) >= 0, s = c.formal || c.eff;
      return '<label class="pick' + (on ? ' on' : '') + '"><input type="checkbox" value="' + E(c.id) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="badge">' + E(c.line) + '</span><span class="t"><span class="od">' + E(LC.od(c.od)) + '</span>' +
        '<span class="meta">' + E(c.op) + ' · מ' + E(LC.wd(s) + ' ' + LC.dm(s)) + (s < idx.gen ? ' (כבר בתוקף)' : '') + '</span></span></label>';
    }).join('') : '<div class="none">אין שינוי שמתאים לחיפוש.</div>';
  }

  $('picks').addEventListener('change', function (ev) {
    var id = ev.target.value;
    if (ev.target.checked) { if (sel.indexOf(id) < 0) sel.push(id); }
    else sel = sel.filter(function (x) { return x !== id; });
    ev.target.closest('.pick').classList.toggle('on', ev.target.checked);
    try { history.replaceState(null, '', sel.length ? '?c=' + sel.join(',') : location.pathname); } catch (e) {}
    titleDirty = introDirty = false;
    rebuild();
  });

  /* ---------- המצגת ---------- */
  function rebuild() {
    var my = ++token;
    if (!sel.length) {
      slides = []; maps = [];
      $('deck').innerHTML = '<div class="empty-state">סמנו קו אחד או יותר ברשימה, והמצגת תופיע כאן.</div>';
      $('toggles').innerHTML = ''; $('pcount').textContent = '';
      return;
    }
    $('pcount').textContent = 'טוען…';
    Promise.all(sel.map(function (id) {
      return cache[id] ? Promise.resolve(cache[id]) : LC.getJSON('data/l/' + encodeURIComponent(id) + '.json').then(function (p) { cache[id] = p; return p; });
    })).then(function (pages) {
      if (my !== token) return;
      pages.sort(function (a, b) { return (+a.line || 0) - (+b.line || 0); });
      render(pages);
    }).catch(function () {
      $('deck').innerHTML = '<div class="empty-state">הנתונים של השינוי הזה לא נמצאו. אולי הוא כבר ירד מהרשימה.</div>';
    });
  }

  var curPages = [];
  function render(pages) {
    curPages = pages;
    maps.forEach(function (m) { m.map.remove(); });
    maps = [];
    slides = LCDeck.build(pages, deckCity(pages));
    var deck = $('deck');
    deck.innerHTML = slides.map(function (s) {
      return '<div class="sframe" data-id="' + E(s.id) + '"' + (off[s.id] ? ' hidden' : '') + '><div class="slide" role="img" aria-label="' + E(s.label) + '">' + s.html + '</div></div>';
    }).join('');
    $('toggles').innerHTML = slides.map(function (s) {
      return '<label><input type="checkbox" value="' + E(s.id) + '"' + (off[s.id] ? '' : ' checked') + '><span>' + E(s.label) + '</span></label>';
    }).join('');
    if (!titleDirty) $('title').value = LCDeck.autoTitle(pages, deckCity(pages));
    if (!introDirty) $('intro').value = LCDeck.autoIntro(pages);
    applyText();
    scale();
    slides.forEach(function (s) {
      if (!s.map) return;
      var fr = deck.querySelector('.sframe[data-id="' + CSS.escape(s.id) + '"]');
      maps.push(Object.assign({ id: s.id }, LCDeck.drawMap(fr, s.map)));
    });
    number();
  }

  /* עיר למצגת של כמה קווים: העיר שנבחרה, או העיר שמשותפת לכל הקווים */
  function deckCity(pages) {
    if (pages.length < 2) return '';
    if (city) return city;
    var inAll = function (c) { return pages.every(function (p) { return (p.cities || []).indexOf(c) >= 0; }); };
    var sc = (idx.scope || []).filter(inAll);
    if (sc.length) return sc[0];
    var common = (pages[0].chcities || []).filter(function (c) { return pages.every(function (p) { return (p.chcities || []).indexOf(c) >= 0; }); });
    return common[0] || '';
  }

  function applyText() {
    var t = $('title').value.trim() || LCDeck.autoTitle(curPages, deckCity(curPages));
    document.querySelectorAll('[data-k="title"]').forEach(function (el) { el.textContent = t; });
    document.querySelectorAll('[data-k="intro"]').forEach(function (el) { el.textContent = $('intro').value.trim(); });
  }
  $('title').addEventListener('input', function () { titleDirty = true; applyText(); });
  $('intro').addEventListener('input', function () { introDirty = true; applyText(); });

  $('toggles').addEventListener('change', function (ev) {
    var id = ev.target.value;
    off[id] = !ev.target.checked;
    var fr = document.querySelector('.sframe[data-id="' + CSS.escape(id) + '"]');
    if (fr) fr.hidden = off[id];
    if (!off[id]) { scale(); maps.forEach(function (m) { if (m.id === id) m.map.invalidateSize(); }); }
    number();
  });

  function number() {
    var vis = Array.prototype.filter.call(document.querySelectorAll('.sframe'), function (f) { return !f.hidden; });
    vis.forEach(function (f, i) { f.querySelectorAll('.pg').forEach(function (p) { p.textContent = (i + 1) + ' / ' + vis.length; }); });
    $('pcount').textContent = vis.length === 1 ? 'שקף אחד' : vis.length + ' שקפים';
  }

  /* התצוגה המקדימה: השקף בגודל 1280×720 מוקטן לרוחב העמודה */
  function scale() {
    var w = $('deck').clientWidth || 1280, k = Math.min(1, w / 1280);
    document.querySelectorAll('.slide').forEach(function (s) { s.style.transform = 'scale(' + k + ')'; });
  }
  if (window.ResizeObserver) new ResizeObserver(scale).observe($('deck'));
  window.addEventListener('resize', scale);

  /* ---------- PDF ---------- */
  function download() {
    var btns = [$('dl'), $('dl2')];
    if (!slides.length) return;
    btns.forEach(function (b) { b.disabled = true; b.querySelector('span').textContent = 'מכין את המפות…'; });
    var vis = maps.filter(function (m) { var f = document.querySelector('.sframe[data-id="' + CSS.escape(m.id) + '"]'); return f && !f.hidden; });
    Promise.all(vis.map(function (m) { return m.ready; })).then(function () {
      var t0 = document.title;
      document.title = ($('title').value.trim() || 'מצגת') ;
      btns.forEach(function (b) { b.disabled = false; b.querySelector('span').textContent = 'הורדת PDF'; });
      setTimeout(function () {
        window.print();
        document.title = t0;
      }, 50);
    });
  }
  $('dl').addEventListener('click', download);
  $('dl2').addEventListener('click', download);
  window.LCApp = { ready: function () { return Promise.all(maps.map(function (m) { return m.ready; })); } };
})();
