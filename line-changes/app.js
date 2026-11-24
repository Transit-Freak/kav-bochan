/* מצגת לשינוי בקו — אשף בשלושה שלבים: איזה קו? · איזה שינוי? · המצגת (עריכה, תצוגה מקדימה, PDF).
   נתונים:
   - data/lines.json   כל הקווים שפועלים עכשיו (לחיפוש), עם השינויים מהשבועיים האחרונים (תאריכים בלבד)
   הכלי מציג רק שינויים שעוד לא התחילו, או שהתחילו בשבועיים האחרונים (שלמה 16.11; שבועיים — 18.11).
   - data/index.json   השינויים הקרובים שזוהו בלילה, וגם אלה שזוהו בלילות הקודמים והתחילו בשבועיים האחרונים
     (started: 1) — עם כל הפרטים ב-data/l/<id>.json, כך שגם להם יש מצגת מלאה
   - ../line-history/data/lines/<rd>.json — קובצי "הקו בזמן", לשינויים מהשבועיים האחרונים שלא זוהו מראש (נטען רק לקו שנבחר)
   כתובת לשיתוף: ?c=<מזהה>[,<מזהה>...] — שינוי קרוב: 10988-20261117 · שינוי שהיה: p-10988-2026-05-01 */
(function () {
  // השמות ש-app-settings.js, app-edit.js, app-images.js, app-export.js משתמשים בהם — קריאה והשמה חיות (A.edits = ... משנה את edits כאן)
  var A = {};
  var BCLR, busy;
  Object.defineProperty(A, '$', { get: function () { return $; }, set: function (v) { $ = v; } });
  Object.defineProperty(A, 'BCLR', { get: function () { return BCLR; }, set: function (v) { BCLR = v; } });
  Object.defineProperty(A, 'E', { get: function () { return E; }, set: function (v) { E = v; } });
  Object.defineProperty(A, 'bdColUi', { get: function () { return bdColUi; }, set: function (v) { bdColUi = v; } });
  Object.defineProperty(A, 'bdColsNow', { get: function () { return bdColsNow; }, set: function (v) { bdColsNow = v; } });
  Object.defineProperty(A, 'bdOrderNow', { get: function () { return bdOrderNow; }, set: function (v) { bdOrderNow = v; } });
  Object.defineProperty(A, 'busy', { get: function () { return busy; }, set: function (v) { busy = v; } });
  Object.defineProperty(A, 'curPages', { get: function () { return curPages; }, set: function (v) { curPages = v; } });
  Object.defineProperty(A, 'dims', { get: function () { return dims; }, set: function (v) { dims = v; } });
  Object.defineProperty(A, 'dlText', { get: function () { return dlText; }, set: function (v) { dlText = v; } });
  Object.defineProperty(A, 'edOpts', { get: function () { return edOpts; }, set: function (v) { edOpts = v; } });
  Object.defineProperty(A, 'edSig', { get: function () { return edSig; }, set: function (v) { edSig = v; } });
  Object.defineProperty(A, 'editMode', { get: function () { return editMode; }, set: function (v) { editMode = v; } });
  Object.defineProperty(A, 'edits', { get: function () { return edits; }, set: function (v) { edits = v; } });
  Object.defineProperty(A, 'formOf', { get: function () { return formOf; }, set: function (v) { formOf = v; } });
  Object.defineProperty(A, 'frameOf', { get: function () { return frameOf; }, set: function (v) { frameOf = v; } });
  Object.defineProperty(A, 'hideBar', { get: function () { return hideBar; }, set: function (v) { hideBar = v; } });
  Object.defineProperty(A, 'imgAct', { get: function () { return imgAct; }, set: function (v) { imgAct = v; } });
  Object.defineProperty(A, 'isCu', { get: function () { return isCu; }, set: function (v) { isCu = v; } });
  Object.defineProperty(A, 'keepScroll', { get: function () { return keepScroll; }, set: function (v) { keepScroll = v; } });
  Object.defineProperty(A, 'lineOf', { get: function () { return lineOf; }, set: function (v) { lineOf = v; } });
  Object.defineProperty(A, 'mapEdit', { get: function () { return mapEdit; }, set: function (v) { mapEdit = v; } });
  Object.defineProperty(A, 'maps', { get: function () { return maps; }, set: function (v) { maps = v; } });
  Object.defineProperty(A, 'mapsReady', { get: function () { return mapsReady; }, set: function (v) { mapsReady = v; } });
  Object.defineProperty(A, 'normEdits', { get: function () { return normEdits; }, set: function (v) { normEdits = v; } });
  Object.defineProperty(A, 'pdfName', { get: function () { return pdfName; }, set: function (v) { pdfName = v; } });
  Object.defineProperty(A, 'render', { get: function () { return render; }, set: function (v) { render = v; } });
  Object.defineProperty(A, 'saveEdits', { get: function () { return saveEdits; }, set: function (v) { saveEdits = v; } });
  Object.defineProperty(A, 'scale', { get: function () { return scale; }, set: function (v) { scale = v; } });
  Object.defineProperty(A, 'setEdit', { get: function () { return setEdit; }, set: function (v) { setEdit = v; } });
  Object.defineProperty(A, 'sidOf', { get: function () { return sidOf; }, set: function (v) { sidOf = v; } });
  Object.defineProperty(A, 'slides', { get: function () { return slides; }, set: function (v) { slides = v; } });
  Object.defineProperty(A, 'step', { get: function () { return step; }, set: function (v) { step = v; } });
  Object.defineProperty(A, 'tordOf', { get: function () { return tordOf; }, set: function (v) { tordOf = v; } });

  var $ = function (s) { return document.getElementById(s); };
  var E = LC.esc;
  var LH = '../line-history/data/lines/';
  var PAST_KINDS = { route: 1, stops: 1, 'stops-add': 1, 'stops-del': 1, extend: 1, shorten: 1, terminal: 1 };
  var KIND_TXT = { route: 'דרך אחרת ותחנות אחרות', stops: 'שינוי בתחנות', 'stops-add': 'נוספו תחנות', 'stops-del': 'בוטלו תחנות',
    extend: 'הקו הוארך', shorten: 'הקו קוצר', terminal: 'שינוי בתחנה הראשונה או האחרונה' };

  var LINES = [], OPS = [], OP_PHONES = [], CITIES = [], idx = { changes: [] }, upByMakat = {};
  // סוג הקו לפי משרד התחבורה (lines.json — lt: u עירוני, i בינעירוני, r אזורי), והמקומות שיש בהם לפחות שני קווים פנימיים
  // (TOWNS — לסיווג קו שאין לו סוג בנתונים: קצה שאינו כזה — מושב, קיבוץ, מועצה אזורית — קו אזורי)
  var LT = {}, TOWNS = null;
  function townsOf() {
    if (TOWNS) return TOWNS;
    var n = {}; TOWNS = {};
    LINES.forEach(function (l) { if (l.from && l.from === l.to && l.cities.length === 1 && isBus(l)) n[l.from] = (n[l.from] || 0) + 1; });
    Object.keys(n).forEach(function (c) { if (n[c] >= 2) TOWNS[c.replace(/''/g, '"')] = 1; });
    return TOWNS;
  }
  var cache = {}, lhCache = {}, picks = [], cur = null, step = 1, q = '';
  /* מה מכינים: 'chg' — הודעה על שינוי · 'tt' — לו"ז עדכני לכל קו (גם בלי שינוי). לכל אחד רשימת קווים משלו */
  var mode = new URLSearchParams(location.search).get('m') === 'tt' ? 'tt' : 'chg', picksBy = { chg: [], tt: [] };
  var slides = [], maps = [], token = 0, curPages = [];
  var edits = { t: {}, add: {}, boxes: {}, xslides: [], off: {} }, edSig = '';

  /* ---------- טעינה ---------- */
  // הקבצים כבר בדרך מה-<head> (LCPRE ב-index.html); בלי זה — מורידים כאן
  var PRE = window.LCPRE || { l: {}, tt: {} };
  var indexP = PRE.index || LC.getJSON('data/index.json');
  // קישור קצר (?c=10970): המזהה המלא ידוע רק אחרי index.json — הקובץ של השינוי מתחיל לרדת מיד, בלי לחכות לרשימת הקווים
  if (mode !== 'tt') indexP.then(function (ix) {
    var keep = [idx, goneMk];
    idx = ix;
    try {
      (new URLSearchParams(location.search).get('c') || '').split(',').filter(Boolean).map(resolveId).forEach(function (id) {
        if (id && !/^(tt|p|x)-/.test(id) && !cache[id] && !PRE.l[id]) PRE.l[id] = LC.getJSON('data/l/' + encodeURIComponent(id) + '.json');
      });
    } catch (e) {}
    idx = keep[0]; goneMk = keep[1];
  }).catch(function () {});
  Promise.all([PRE.lines || LC.getJSON('data/lines.json'), indexP]).then(function (r) {
    var li = r[0]; idx = r[1];
    OPS = li.ops; CITIES = li.cities; LT = li.lt || {};
    var OPIDS = li.op_ids || [];
    OP_PHONES = li.op_phones || [];   // agency_phone מ-GTFS, לפי הסדר של ops
    LINES = li.lines.map(function (a) {
      return { makat: a[0], line: a[1], op: OPS[a[2]], ag: OPIDS[a[2]] || '', from: a[3], to: a[4], cities: a[5].map(function (i) { return CITIES[i]; }),
        rds: a[6], ty: a[7], past: (a[8] || []).slice().reverse() };
    });
    idx.changes.forEach(function (c) { (upByMakat[c.makat] = upByMakat[c.makat] || []).push(c); });
    LINES.forEach(function (l) { l.n = LC.norm(l.line + ' ' + l.op + ' ' + l.from + ' ' + l.to + ' ' + l.cities.join(' ')); l.up = upByMakat[l.makat] || []; });
    if (idx.feed) $('feed').textContent = ' מ-' + LC.dmy(idx.feed);
    buildChips();
    // הכתובת מתארת את המסך: ?c=... — המצגת (שלב 3), ?l=<מק"ט> — שלב 2. בלי אחד מהם — שלב 1,
    // והמצגת שכבר הוכנה בלשונית הזו חוזרת מ-sessionStorage (עם פס "המצגת שלך" בשלב 1)
    var sp = new URLSearchParams(location.search);
    var want = (sp.get('c') || '').split(',').filter(Boolean).map(resolveId).filter(Boolean), fromUrl = want.length > 0 || !!goneMk;
    var ss = sessGet(), other = mode === 'tt' ? 'chg' : 'tt';
    if (!fromUrl) want = ss[mode] || [];
    Promise.all(want.map(loadPick).concat([Promise.all((ss[other] || []).map(loadPick))])).then(function (ps) {
      picksBy[other] = ps.pop().filter(Boolean);
      picks = picksBy[mode] = ps.filter(Boolean);
      modeUi();
      var lm = sp.get('l'), ll = lm && lineOf(lm);
      if (fromUrl && picks.length) { cur = lineOf(picks[picks.length - 1].makat, picks[picks.length - 1].op); go(3, 'replace'); }
      else if (ll) { cur = ll; go(2, 'replace'); }
      else if (goneMk && lineOf(goneMk)) { goneNote = goneMk; cur = lineOf(goneMk); go(2, 'replace'); }   // קישור ישן לשינוי שירד — הקו
      else go(1, 'replace');
      // שלב 1 מוכן: הקוד של המצגת יורד ברקע, כדי שהמעבר למצגת יהיה מיידי
      (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(function () { deckLib().catch(function () {}); }, { timeout: 4000 });
    });
  }).catch(function () {
    $('results').innerHTML = '<div class="none">לא הצלחנו לטעון את רשימת הקווים. נסו לרענן את הדף.</div>';
  });

  /* שבועיים אחורה מתאריך הנתונים — מה שהתחיל לפני כן כבר לא מוצג */
  var PAST_DAYS = 14;
  function recentFrom() { return LC.addDays(idx.gen, -PAST_DAYS); }
  /* שינוי שכבר התחיל (היום או לפני כן) */
  function begun(c) { return !!c && (c.formal || c.eff) <= idx.gen; }
  function recentPast(l) { var f = recentFrom(); return l.past.filter(function (e) { return e[0] >= f; }); }
  function lineOf(makat, op) {
    return LINES.filter(function (l) { return l.makat === makat && (!op || l.op === op); })[0] || LINES.filter(function (l) { return l.makat === makat; })[0];
  }

  /* ---------- מעבר בין שלבים ---------- */
  /* מעבר בין שלבים: pushState — כפתור "חזרה" של הדפדפן חוזר שלב אחד; replaceState — שינוי בתוך אותו שלב (how='replace'),
     ובחזרה עם הדפדפן (how='pop') לא נוגעים בהיסטוריה */
  function go(n, how) {
    if (n === 2 && mode === 'tt') n = step === 3 || !picks.length ? 1 : 3;   // לו"ז עדכני: אין שלב 2
    if (n === 2 && !cur) n = 1;
    if (n === 3 && !picks.length) n = cur ? 2 : 1;
    var moved = n !== step;
    step = n;
    if (how !== 'pop') setUrl(how === 'replace' || !moved ? 'replace' : 'push');
    $('reset').hidden = !(n > 1 || picks.length);
    drawDeckbar();
    document.body.setAttribute('data-step', n);
    document.querySelectorAll('.steps [data-go]').forEach(function (b) {
      var k = +b.getAttribute('data-go');
      b.setAttribute('aria-current', k === n ? 'step' : 'false');
      b.disabled = (k === 2 && (!cur || mode === 'tt')) || (k === 3 && !picks.length);
      b.classList.toggle('done', k < n);
    });
    $('back').hidden = n === 1;
    if (n === 1) drawResults();
    if (n === 2) drawChanges();
    if (n === 3) rebuild();
    if (n !== 3 && !picks.length) emptyStage();
    window.scrollTo(0, 0);
  }
  document.querySelector('.steps ol').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-go]'); if (b && !b.disabled) go(+b.getAttribute('data-go'));
  });
  $('back').addEventListener('click', function () { go(Math.max(1, step - 1)); });
  try { history.scrollRestoration = 'manual'; } catch (e) {}
  window.addEventListener('popstate', function (ev) {
    var st = ev.state || {};
    if (st.l) cur = lineOf(st.l, st.op) || cur;
    go(st.s || 1, 'pop');
  });
  /* שלב 1 כשכבר יש מצגת: פס קטן שחוזר אליה */
  function drawDeckbar() {
    var b = $('deckbar'), on = step === 1 && picks.length > 0;
    b.hidden = !on;
    if (!on) return;
    b.innerHTML = '<span>המצגת שלך: ' + (picks.length === 1 ? 'קו אחד' : picks.length + ' קווים') + ' <span class="bl">' +
      picks.slice(0, 4).map(function (p) { return '<span class="badge">' + E(p.line) + '</span>'; }).join('') + (picks.length > 4 ? '…' : '') + '</span></span><span aria-hidden="true">←</span>';
  }
  $('deckbar').addEventListener('click', function () { go(3); });
  /* איפוס: אישור קטן בתוך הדף, ואז הכול מתחיל מההתחלה — בלי קווים, סינון, חיפוש, עריכות וכתובת */
  $('reset').addEventListener('click', function () { $('rconfirm').hidden = false; $('ryes').focus(); });
  $('rno').addEventListener('click', function () { $('rconfirm').hidden = true; $('reset').focus(); });
  $('ryes').addEventListener('click', function () {
    $('rconfirm').hidden = true;
    try { if (edSig) localStorage.removeItem('lc-ed2:' + edSig); localStorage.removeItem('lc-kind'); } catch (e) {}
    try { sessionStorage.removeItem('lc-picks'); } catch (e) {}
    picks = []; picksBy = { chg: [], tt: [] }; cur = null; pkOpen = false; placeSel = null; q = ''; $('q').value = ''; kindF = 'all';
    mode = 'chg'; modeUi();
    edSig = ''; edits = normEdits(null); editMode = false; document.body.classList.remove('editing');
    clearImgs();
    try { history.replaceState({ s: 1 }, '', location.pathname); } catch (e) {}
    step = 0; emptyStage(); go(1, 'replace');
  });
  $('addline').addEventListener('click', function () { $('q').value = ''; q = ''; go(1); setTimeout(function () { $('q').focus(); }, 50); });

  function emptyStage() {
    $('deck').innerHTML = '<div class="empty-state"><div class="ghostslide" aria-hidden="true"><b></b><span><i></i><i></i><i></i></span></div>' +
      '<p>כאן תופיע המצגת: מה משתנה, מפה של המסלול הישן והחדש, התחנות שמבוטלות והתחנות החדשות, ושקף סיום.</p></div>';
    $('pcount').textContent = '';
  }

  /* ---------- שלב 1: איזה קו ---------- */
  function buildChips() {
    var n = {};
    idx.changes.forEach(function (c) { if (c.eff >= idx.gen || (c.formal || '') >= idx.gen) (c.chcities || []).forEach(function (x) { n[x] = (n[x] || 0) + 1; }); });
    var top = Object.keys(n).sort(function (a, b) { return n[b] - n[a]; }).slice(0, 8);
    $('cities').innerHTML = top.map(function (c) { return '<button type="button" data-c="' + E(c) + '">' + E(c) + '</button>'; }).join('');
    $('cities').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      // עיר מהרשימה: ישר לקווים שמשתנים בה (עם "כל הקווים למצגת אחת")
      $('q').value = q = b.getAttribute('data-c');
      placeSel = cities().filter(function (c) { return c.name === q; })[0] || null; drawResults();
    });
  }
  $('q').addEventListener('input', function () { q = this.value; placeSel = null; drawResults(); });

  function upNextOf(list) {
    var u = list.slice().sort(function (a, b) { return (a.formal || a.eff) < (b.formal || b.eff) ? -1 : 1; });
    return u.filter(function (c) { return (c.formal || c.eff) >= idx.gen; })[0] || u[u.length - 1];
  }
  function upNext(l) { return upNextOf(l.up); }
  /* ---------- סינון לפי סוג השינוי — בכל שלב 1: רשימה, חיפוש, מקום, "כל הקווים", קבוצות ---------- */
  var KF = [['all', 'הכול'], ['route', 'שינוי מסלול'], ['new', 'קו חדש'], ['ended', 'קו מבוטל'], ['timetable', 'שינוי בלו״ז'], ['past', 'כבר התחילו']];
  var KF_URL = { route: 'route', 'new': 'new', ended: 'ended', timetable: 'tt', past: 'past' };
  var KF_ALL = { route: 'הקווים עם שינוי מסלול', 'new': 'הקווים החדשים', ended: 'הקווים שמבוטלים', timetable: 'הקווים עם שינוי בלו״ז', past: 'הקווים עם שינוי שכבר התחיל' };
  var kindF = (function () {
    var k = new URLSearchParams(location.search).get('k'), v = null;
    Object.keys(KF_URL).forEach(function (x) { if (KF_URL[x] === k) v = x; });
    if (!v) try { v = localStorage.getItem('lc-kind'); } catch (e) {}
    return KF_URL[v] ? v : 'all';
  })();
  function kindOf(c) { return c.kind || 'route'; }
  function kindsOf(l) {
    var o = {};
    l.up.forEach(function (c) { o[kindOf(c)] = 1; if (begun(c)) o.past = 1; });
    if (recentPast(l).length) o.route = o.past = 1;
    return o;
  }
  function matchK(l) { return kindF === 'all' ? hasCh(l) : !!kindsOf(l)[kindF]; }
  /* השינוי שמוצג לקו (בתגית, ובבחירה): לפי הסינון */
  function upK(l) {
    if (kindF === 'all') return upNext(l);
    if (kindF === 'past') { var b = l.up.filter(begun).sort(function (x, y) { return (x.formal || x.eff) < (y.formal || y.eff) ? 1 : -1; }); return b[0] || null; }
    var u = l.up.filter(function (c) { return kindOf(c) === kindF; });
    return u.length ? upNextOf(u) : null;
  }
  /* הכתובת לפי המסך: שלב 3 — c=<הקווים>, שלב 2 — l=<מק"ט>, שלב 1 — רק הסינון. הבחירות נשמרות גם ב-sessionStorage */
  function setUrl(how) {
    var sp = [];
    if (step === 3 && picks.length) sp.push('c=' + picks.map(function (p) { return shortId(p.id); }).join(','));
    var no = step === 3 ? picks.filter(function (p) { return infNo[p.id]; }) : [];
    if (no.length) sp.push('s=' + no.map(function (p) { return shortId(p.id); }).join(','));
    if (step === 2 && cur) sp.push('l=' + cur.makat);
    if (kindF !== 'all' && mode !== 'tt') sp.push('k=' + KF_URL[kindF]);
    if (mode === 'tt') sp.unshift('m=tt');
    var url = sp.length ? '?' + sp.join('&') : location.pathname;
    var st = { s: step, l: cur && cur.makat, op: cur && cur.op }, w = function () { try { history[how === 'push' ? 'pushState' : 'replaceState'](st, '', url); } catch (e) {} };
    // הנתונים יכולים להגיע עוד לפני שהסקריפטים של האתר (defer — למשל ‎?hag=‎ ב-hagim.js) קראו את הכתובת: משנים אותה רק אחרי שהדף נקרא
    if (document.readyState === 'loading') {
      if (!urlLater) document.addEventListener('DOMContentLoaded', function () { if (urlLater) urlLater(); });
      urlLater = w;
    } else w();
    sessSet();
  }
  var urlLater = null;
  function sessSet() {
    picksBy[mode] = picks;
    var ids = function (a) { return a.map(function (p) { return p.id; }); };
    try { sessionStorage.setItem('lc-picks', JSON.stringify({ chg: ids(picksBy.chg), tt: ids(picksBy.tt) })); } catch (e) {}
  }
  function sessGet() {
    var ok = function (a) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; };
    try { var a = JSON.parse(sessionStorage.getItem('lc-picks') || '{}'); return Array.isArray(a) ? { chg: ok(a) } : { chg: ok(a.chg), tt: ok(a.tt) }; } catch (e) { return {}; }
  }
  /* כתובות קצרות: c=27018 כשלקו יש שינוי קרוב אחד; c=27018.1118 כשצריך את התאריך; c=27018.1118t כשגם זה לא מספיק.
     (r שינוי מסלול · n קו חדש · e קו מבוטל · t לו"ז · v חלופה שבוטלה או נוספה). מזהים ארוכים (27018-20261118-t, p-...) — עובדים כמו קודם */
  var KL = { '': 'r', '-n': 'n', '-e': 'e', '-t': 't', '-v': 'v' };
  function idParts(id) { var m = String(id).match(/^(\d+)-(\d{8})(-[netv])?$/); return m ? { mk: m[1], md: m[2].slice(4), k: KL[m[3] || ''] } : null; }
  function shortId(id) {
    if (/^tt-/.test(id)) return id.slice(3);
    var a = idParts(id); if (!a) return id;
    var same = idx.changes.map(function (c) { return idParts(c.id); }).filter(function (b) { return b && b.mk === a.mk; });
    if (same.length <= 1) return a.mk;
    var sd = same.filter(function (b) { return b.md === a.md; });
    return a.mk + '.' + a.md + (sd.length > 1 ? a.k : '');
  }
  /* קישורים ישנים: מזהה שהשתנה (התאריך של השינוי עודכן) או ירד — index.json alias: {ישן: [חדש או null, תאריך]}.
     אין שינוי חדש — מציגים את הקו (שלב 2) עם הערה קטנה */
  var goneMk = null, goneNote = null;
  function aliasOf(id, mk) {
    var a = (idx.alias || {})[id];
    if (!a) return undefined;
    if (a[0] && idx.changes.some(function (c) { return c.id === a[0]; })) return a[0];
    goneMk = mk; return null;
  }
  function resolveId(tok) {
    if (mode === 'tt') return /^(tt-)?[\w]+$/.test(tok) ? 'tt-' + String(tok).replace(/^tt-/, '') : null;
    tok = String(tok);
    var lp = idParts(tok);
    if (lp) {   // מזהה ארוך: 10970-20261118
      if (idx.changes.some(function (c) { return c.id === tok; })) return tok;
      var al = aliasOf(tok, lp.mk);
      if (al === undefined) goneMk = lp.mk;
      return al || null;
    }
    var m = tok.match(/^(\d+)(?:\.(\d{4}))?([rnetv])?$/);
    if (!m) return tok;
    var match = function (b) { return b && b.mk === m[1] && (!m[2] || b.md === m[2]) && (!m[3] || b.k === m[3]); };
    var hit = idx.changes.filter(function (c) { return match(idParts(c.id)); });
    if (hit.length) return hit[0].id;
    var old = Object.keys(idx.alias || {}).filter(function (id) { return match(idParts(id)); })[0];
    var to = old ? aliasOf(old, m[1]) : undefined;
    if (!to) goneMk = m[1];
    return to || null;
  }
  /* כפתורי הסינון, עם מספר הקווים מכל סוג בתצוגה הנוכחית (החיפוש או המקום) */
  function drawKfil(ls) {
    var kc = { all: 0 };
    ls.forEach(function (l) { if (!hasCh(l)) return; kc.all++; var o = kindsOf(l); Object.keys(o).forEach(function (k) { kc[k] = (kc[k] || 0) + 1; }); });
    $('kfil').innerHTML = KF.map(function (k) {
      var n = kc[k[0]] || 0;
      return '<button type="button" data-kf="' + k[0] + '" aria-pressed="' + (kindF === k[0]) + '"' + (!n && kindF !== k[0] ? ' disabled' : '') + '>' + k[1] + ' <span>' + n + '</span></button>';
    }).join('');
  }
  /* התגית בתוצאות: לכל סוג שינוי — מילים משלו */
  function tagOf(c) {
    var s = c.formal || c.eff, soon = !begun(c);
    if (c.kind === 'new') return '<span class="tag new">' + (soon ? 'קו חדש מ-' : 'קו חדש מ-') + LC.dm(s) + '</span>';
    if (c.kind === 'ended') return '<span class="tag end">' + (soon ? 'נוסע עד ' + LC.dm(c.last || LC.addDays(s, -1)) : 'בוטל ב-' + LC.dm(s)) + '</span>';
    if (c.kind === 'timetable') return '<span class="tag tt">' + (soon ? 'לו״ז חדש מ-' : 'לו״ז השתנה ב-') + LC.dm(s) + '</span>';
    if (c.var) return '<span class="tag ' + (soon ? 'soon' : 'was') + '">' + (c.var === 'end' ? (soon ? 'חלופה מתבטלת מ-' : 'חלופה בוטלה ב-') : 'חלופה חדשה מ-') + LC.dm(s) + '</span>';
    return '<span class="tag ' + (soon ? 'soon' : 'was') + '">' + (soon ? 'משתנה מ-' : 'השתנה ב-') + LC.dm(s) + '</span>';
  }
  function badge(l) {
    var u = upK(l);
    if (u) return tagOf(u);
    var rp = recentPast(l);
    if (rp.length) { var d = rp[0][0]; return '<span class="tag was">השתנה ב-' + LC.dm(d) + '</span>'; }
    return '';
  }

  /* חיפוש: מספר קו → קווים. מילים → ארבע קבוצות: קווים · רחובות · שכונות · ערים.
     רחובות ושכונות (data/places.json) נטענים רק בחיפוש המילים הראשון. */
  var PL = null, plLoading = false, placeSel = null;
  function loadPlaces() {
    if (PL || plLoading) return;
    plLoading = true;
    LC.getJSON('data/places.json').then(function (p) {
      var mk = function (kind) {   // שמות ערים ב-GTFS: כפר ביל''ו → כפר ביל"ו
        return function (x) { var c = String(p.cities[x[1]]).replace(/''/g, '"'); return { kind: kind, name: x[0], city: c, lines: x[2], stops: x[3] || null, n: LC.norm(x[0]), nc: LC.norm(c) }; };
      };
      PL = { streets: p.streets.map(mk('s')), hoods: p.hoods.map(mk('h')) };
      drawResults();
    }).catch(function () { PL = { streets: [], hoods: [] }; });
  }
  /* קו עם שינוי: משתנה בשבועיים הקרובים או השתנה בשבועיים האחרונים — רק הם מוצגים בחיפוש לפי מקום */
  function hasCh(l) { return !!(l && (l.up.length || recentPast(l).length)); }
  function chCount(pl) { return pl.lines.filter(function (i) { return LINES[i] && matchK(LINES[i]); }).length; }
  function lineSort(a, b) {
    var ua = a.up.length ? 0 : a.past.length ? 1 : 2, ub = b.up.length ? 0 : b.past.length ? 1 : 2;
    if (ua !== ub) return ua - ub;
    return (parseInt(a.line, 10) || 0) - (parseInt(b.line, 10) || 0) || (a.line < b.line ? -1 : 1);
  }
  function lineRow(l) {
    return '<a class="res" href="' + resHref('l=' + l.makat) + '" data-i="' + LINES.indexOf(l) + '"><span class="badge">' + E(l.line) + '</span>' +
      '<span class="t"><span class="od">' + E(l.from) + ' ↔ ' + E(l.to) + '</span><span class="meta">' + E(l.op) +
      (l.cities.length ? ' · ' + E(l.cities.slice(0, 3).join(', ')) + (l.cities.length > 3 ? '…' : '') : '') + '</span></span>' + badge(l) + '</a>';
  }
  /* שורה בתוצאות היא קישור אמיתי (לשלב 2 או למצגת): לחיצה רגילה נשארת באותו דף, ולחיצה ארוכה / Ctrl / גלגלת
     פותחות את אותו מסך בלשונית חדשה */
  function resHref(q) { return E('?' + (mode === 'tt' ? 'm=tt&' : '') + q); }
  var SIGS = {};
  function groupRow(sig, ls) {
    SIGS[sig] = ls;
    var c = upK(ls[0]) || upNext(ls[0]), s = c.formal || c.eff, ops = [], cs = [];
    ls.forEach(function (l) { if (ops.indexOf(l.op) < 0) ops.push(l.op); l.cities.forEach(function (x) { if (cs.indexOf(x) < 0) cs.push(x); }); });
    var nums = ls.map(function (l) { return l.line; });
    return '<a class="res grpres" href="' + resHref('c=' + ls.map(function (l) { return shortId((upK(l) || upNext(l)).id); }).join(',')) + '" data-sig="' + E(sig) + '"><span class="badges">' +
      nums.slice(0, 6).map(function (n) { return '<span class="badge">' + E(n) + '</span>'; }).join('') + (nums.length > 6 ? '<span class="more">+' + (nums.length - 6) + '</span>' : '') +
      '</span><span class="t"><span class="od">אותו שינוי ב-' + ls.length + ' קווים' + (c.summary ? ' · ' + E(c.summary) : '') + '</span>' +
      '<span class="meta">' + E(ops.slice(0, 3).join(', ')) + (cs.length ? ' · ' + E(cs.slice(0, 3).join(', ')) + (cs.length > 3 ? '…' : '') : '') + '</span></span>' +
      tagOf(c) + '</a>';
  }
  /* סמלים קטנים (SVG בתוך הדף): שלט רחוב · גבול שכונה · בניינים לעיר */
  var SV = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICON = {
    s: SV + '<path d="M12 22V12"/><rect x="3" y="4" width="18" height="8" rx="1.5"/><path d="M7 8h10"/></svg>',
    h: SV + '<path d="M4 7l5-3 6 2 5-2v13l-5 2-6-2-5 3z" stroke-dasharray="3 2.5"/><circle cx="12" cy="11" r="2.2" fill="currentColor" stroke="none"/></svg>',
    c: SV + '<path d="M3 21h18"/><rect x="4" y="9" width="6" height="12"/><rect x="12" y="4" width="8" height="17"/><path d="M15 8h2M15 12h2M15 16h2M6.5 13h1M6.5 17h1"/></svg>'
  };
  function placeRow(pl, key) {
    var ic = pl.kind === 's' ? 'רחוב ' : pl.kind === 'h' ? 'שכונת ' : '';
    var n = pl.lines.length, soon = chCount(pl);
    return '<button type="button" class="res place" data-pl="' + key + '"><span class="pin" aria-hidden="true">' + ICON[pl.kind] + '</span>' +
      '<span class="t"><span class="od">' + E(ic + pl.name) + (pl.city && pl.kind !== 'c' ? ', ' + E(pl.city) : '') + '</span>' +
      '<span class="meta">' + (n === 1 ? 'קו אחד' : n + ' קווים') + '</span></span>' +
      '<span class="tag soon">' + (soon === 1 ? 'קו אחד משתנה' : soon + ' משתנים') + '</span></button>';
  }
  var cityList = null;
  function cities() {
    if (cityList) return cityList;
    var m = {};
    LINES.forEach(function (l, i) { l.cities.forEach(function (c) { (m[c] = m[c] || []).push(i); }); });
    return (cityList = Object.keys(m).map(function (c) { return { kind: 'c', name: c, city: '', lines: m[c], n: LC.norm(c) }; }));
  }
  function matchPlace(pl, words, nq) {
    var hay = pl.n + ' ' + (pl.nc || '');
    return words.every(function (w) { return hay.indexOf(w) >= 0; }) && (pl.n.indexOf(words[0]) >= 0 || pl.n.indexOf(nq) >= 0);
  }
  function placeSortFor(nq) {
    return function (a, b) {
      var sa = a.n.indexOf(nq) === 0 ? 0 : 1, sb = b.n.indexOf(nq) === 0 ? 0 : 1;
      return sa - sb || b.lines.length - a.lines.length;
    };
  }
  var lastGroups = {};
  function drawResults() {
    if (mode === 'tt') return drawResultsTT();
    var nq = LC.norm(q), html = '', head = '';
    $('cities').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', LC.norm(b.getAttribute('data-c')) === nq ? 'true' : 'false'); });
    if (placeSel) {
      var all = placeSel.lines.map(function (i) { return LINES[i]; }).filter(Boolean);
      drawKfil(all);
      var rows = all.filter(matchK).sort(lineSort);
      var what = kindF === 'all' ? (rows.length === 1 ? 'קו אחד משתנה' : rows.length + ' קווים משתנים') : rows.length + ' ' + KF_ALL[kindF].replace(/^הקווים/, 'קווים');
      $('reshead').innerHTML = '<button type="button" class="lnk" id="plback">→ לכל התוצאות</button> <b class="pltitle">' +
        E((placeSel.kind === 's' ? 'רחוב ' : placeSel.kind === 'h' ? 'שכונת ' : '') + placeSel.name + (placeSel.city && placeSel.kind !== 'c' ? ', ' + placeSel.city : '')) +
        '</b> · ' + E(what) + ' (מתוך ' + all.length + ' שעוצרים כאן)' +
        (rows.length > 1 ? ' <button type="button" class="btn sm" id="plall">+ כל ' + rows.length + ' ' + (kindF === 'all' ? 'הקווים למצגת אחת' : KF_ALL[kindF]) + '</button>' : '');
      PLROWS = rows;
      $('results').innerHTML = rows.length ? rows.map(lineRow).join('') : '<div class="none">' + (kindF === 'all' ? 'אין שינויים קרובים בקווים שעוצרים כאן.' : 'אין כאן ' + E(KF_ALL[kindF].replace(/^הקווים/, 'קווים')) + '. אפשר לבחור "הכול".') + '</div>';
      $('results').scrollTop = 0;
      return;
    }
    if (!nq) {
      var up = LINES.filter(hasCh);
      drawKfil(up);
      up = up.filter(function (l) { return kindF === 'past' ? matchK(l) : upK(l); });
      // קודם מה שעוד לא התחיל (הקרוב ראשון), ואחריו מה שכבר התחיל (האחרון ראשון)
      up.sort(function (a, b) {
        var x = whenOf(a), y = whenOf(b), px = x <= idx.gen, py = y <= idx.gen;
        if (px !== py) return px ? 1 : -1;
        return x === y ? 0 : (x < y) === !px ? -1 : 1;
      });
      $('reshead').textContent = kindF === 'all' ? 'קווים שמשתנים בשבועיים הקרובים או השתנו בשבועיים האחרונים'
        : kindF === 'past' ? 'קווים שהשתנו בשבועיים האחרונים (' + up.length + ')'
        : KF_ALL[kindF].replace(/^הקווים/, 'קווים') + ' — בשבועיים הקרובים או בשבועיים האחרונים (' + up.length + ')';
      // קווים עם בדיוק אותו שינוי (אותן תחנות, אותו יום) — קבוצה אחת, ובחירה בה מכינה מצגת אחת לכולם (רק שינויי מסלול)
      var bySig = {};
      up.forEach(function (l) { var c = upK(l); if (c && c.sig && !c.kind) (bySig[c.sig] = bySig[c.sig] || []).push(l); });
      var done = {}, rowsH = [];
      up.forEach(function (l) {
        var c = upK(l), g = c && c.sig && !c.kind && bySig[c.sig];
        if (g && g.length > 1) { if (!done[c.sig]) { done[c.sig] = 1; rowsH.push(groupRow(c.sig, g)); } }
        else rowsH.push(lineRow(l));
      });
      $('results').innerHTML = rowsH.slice(0, 80).join('');
      return;
    }
    var digits = /^\d+$/.test(nq), words = nq.split(' ');
    var lines = LINES.filter(function (l) {
      if (digits) return l.line.indexOf(nq) === 0 || l.makat === nq;
      if (!hasCh(l)) return false;   // חיפוש במילים (עיר, מקום, חברה) — רק קווים שמשתנים
      var hay = LC.norm(l.line + ' ' + l.op + ' ' + l.from + ' ' + l.to);
      return words.every(function (w) { return hay.indexOf(w) >= 0 || l.line.indexOf(w) === 0 || l.cities.some(function (c) { return LC.norm(c) === w; }); }) &&
        words.some(function (w) { return !/^\d+$/.test(w) ? hay.indexOf(w) >= 0 || l.cities.some(function (c) { return LC.norm(c).indexOf(w) >= 0; }) : l.line.indexOf(w) === 0; });
    });
    drawKfil(lines);
    if (kindF !== 'all') lines = lines.filter(matchK);
    lines.sort(function (a, b) { var ea = a.line === nq ? 0 : 1, eb = b.line === nq ? 0 : 1; return ea - eb || lineSort(a, b); });
    var groups = [];
    if (lines.length) groups.push(['קווים', lines.slice(0, digits ? 80 : 6).map(lineRow).join(''), lines.length]);
    if (!digits) {
      loadPlaces();
      var srt = placeSortFor(nq);
      // רק מקומות שיש בהם קו שמשתנה
      var cs = cities().filter(function (c) { return c.n.indexOf(nq) >= 0 && chCount(c); }).sort(srt).slice(0, 6);
      if (PL) {
        var st = PL.streets.filter(function (x) { return matchPlace(x, words, nq) && chCount(x); }).sort(srt);
        var hd = PL.hoods.filter(function (x) { return matchPlace(x, words, nq) && chCount(x); }).sort(srt);
        if (st.length) groups.push(['רחובות', st.slice(0, 8).map(function (x) { return placeRow(x, 's' + PL.streets.indexOf(x)); }).join(''), st.length]);
        if (hd.length) groups.push(['שכונות', hd.slice(0, 8).map(function (x) { return placeRow(x, 'h' + PL.hoods.indexOf(x)); }).join(''), hd.length]);
      } else groups.push(['רחובות ושכונות', '<div class="none">טוען רחובות ושכונות…</div>', 0]);
      if (cs.length) groups.push(['ערים', cs.map(function (x) { return placeRow(x, 'c' + cityList.indexOf(x)); }).join(''), cs.length]);
    }
    // בחיפוש מילים — קודם מקומות (רחוב, שכונה, עיר), אחר כך קווים שהשם שלהם מתאים
    if (!digits && groups.length > 1 && groups[0][0] === 'קווים') groups.push(groups.shift());
    $('reshead').textContent = '';
    $('results').scrollTop = 0;
    $('results').innerHTML = groups.length ? groups.map(function (g) {
      return '<div class="grp-h">' + g[0] + (g[2] ? ' <span>' + g[2] + '</span>' : '') + '</div>' + g[1];
    }).join('') : '<div class="none">' + (kindF !== 'all' ? 'אין כאן ' + E(KF_ALL[kindF].replace(/^הקווים/, 'קווים')) + '. אפשר לבחור "הכול".' : digits ? 'לא מצאנו. נסו מספר קו, רחוב, שכונה, עיר או חברה.' : 'אין שינויים קרובים בקווים במקום הזה. אפשר לחפש לפי מספר קו.') + '</div>';
  }

  /* ---------- לו"ז עדכני: מה מכינים, חיפוש בכל הקווים, וקבוצות של קווים לאותו יעד ---------- */
  function modeUi() {
    $('modes').querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-mode') === mode ? 'true' : 'false'); });
    var tt = mode === 'tt';
    document.body.setAttribute('data-mode', mode);
    $('qhead').textContent = tt ? 'איזה קווים?' : 'איזה קו?';
    $('qhint').textContent = tt ? 'מספר קו, שכונה, רחוב, עיר או חברה. בשכונה או ברחוב — כל הקווים שעוצרים שם, בלוח אחד.' : 'מספר קו, רחוב, שכונה, עיר או חברה.';
    $('chiprow').style.display = tt ? 'none' : ''; $('kfil').style.display = tt ? 'none' : '';
    $('q').placeholder = tt ? 'למשל 494, גני איילון, אופקים ירושלים' : 'למשל 988, הרצל, קרית חב"ד';
  }
  $('modes').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-mode]'); if (!b) return;
    var m = b.getAttribute('data-mode'); if (m === mode) return;
    picksBy[mode] = picks; mode = m; picks = picksBy[mode]; placeSel = null; pkOpen = false;
    modeUi(); setUrl('replace'); drawResults(); drawDeckbar();
    $('reset').hidden = !picks.length;
  });
  /* קווים של אותה חברה בין אותו זוג ערים (בינעירוני) — קבוצה */
  var TTG = null;
  function ttGroupKey(l) { return l.from && l.to && l.from !== l.to ? l.op + '|' + [l.from, l.to].sort().join('|') : ''; }
  function ttGroups() {
    if (TTG) return TTG;
    TTG = {};
    LINES.forEach(function (l) { var k = ttGroupKey(l); if (k) (TTG[k] = TTG[k] || []).push(l); });
    Object.keys(TTG).forEach(function (k) {
      var seen = {};
      TTG[k] = TTG[k].filter(function (l) { if (seen[l.makat]) return false; seen[l.makat] = 1; return true; }).sort(lineSort);
      if (TTG[k].length < 2 || TTG[k].length > 8) delete TTG[k];
    });
    return TTG;
  }
  function ttRow(l) {
    return '<a class="res" href="' + resHref('c=' + l.makat) + '" data-tt="' + LINES.indexOf(l) + '"><span class="badge">' + E(l.line) + '</span>' +
      '<span class="t"><span class="od">' + E(l.from) + ' ↔ ' + E(l.to) + '</span><span class="meta">' + E(l.op) +
      (l.cities.length ? ' · ' + E(l.cities.slice(0, 3).join(', ')) + (l.cities.length > 3 ? '…' : '') : '') + '</span></span><span class="tag soon">לו״ז עדכני</span></a>';
  }
  function ttGroupRow(k) {
    var ls = TTG[k], l = ls[0];
    return '<a class="res grpres" href="' + resHref('c=' + ls.map(function (x) { return x.makat; }).join(',')) + '" data-ttg="' + E(k) + '"><span class="badges">' + ls.map(function (x) { return '<span class="badge">' + E(x.line) + '</span>'; }).join('') + '</span>' +
      '<span class="t"><span class="od">לו״ז משולב · ' + E(l.from) + ' ↔ ' + E(l.to) + '</span><span class="meta">' + E(l.op) + ' · ' + ls.length + ' קווים לאותו יעד, בטבלה אחת</span></span>' +
      '<span class="tag new">מומלץ</span></a>';
  }
  function isBus(l) { return String(l.ty) === '3' || String(l.ty) === '715'; }
  function plName(pl) { return (pl.kind === 's' ? 'רחוב ' : pl.kind === 'h' ? 'שכונת ' : '') + pl.name + (pl.city && pl.kind !== 'c' ? ', ' + pl.city : ''); }
  function ttPlaceRow(pl, key) {
    var n = pl.lines.filter(function (i) { return LINES[i] && isBus(LINES[i]); }).length;
    return '<button type="button" class="res place" data-pl="' + key + '"><span class="pin" aria-hidden="true">' + ICON[pl.kind] + '</span>' +
      '<span class="t"><span class="od">' + E(plName(pl)) + '</span><span class="meta">' + (n === 1 ? 'קו אחד עוצר כאן' : n + ' קווים עוצרים כאן') + '</span></span>' +
      '<span class="tag soon">כל הקווים</span></button>';
  }
  function drawResultsTT() {
    var nq = LC.norm(q);
    $('reshead').textContent = '';
    if (placeSel) {   // כל הקווים שעוצרים ברחוב, בשכונה או בעיר — ללוח אחד
      var seen = {}, all = placeSel.lines.map(function (i) { return LINES[i]; }).filter(function (l) { if (!l || !isBus(l) || seen[l.makat]) return false; seen[l.makat] = 1; return true; });
      all.sort(function (a, b) { return (parseInt(a.line, 10) || 0) - (parseInt(b.line, 10) || 0) || (a.line < b.line ? -1 : 1); });
      PLROWS = all;
      $('reshead').innerHTML = '<button type="button" class="lnk" id="plback">→ לכל התוצאות</button> <b class="pltitle">' + E(plName(placeSel)) + '</b> · ' +
        (all.length === 1 ? 'קו אחד עוצר כאן' : all.length + ' קווים עוצרים כאן') +
        (all.length > 1 ? ' <button type="button" class="btn sm" id="plall">+ כל ' + all.length + ' הקווים ללוח אחד</button>' : '');
      $('results').innerHTML = all.length ? all.map(ttRow).join('') : '<div class="none">אין כאן קווי אוטובוס.</div>';
      $('results').scrollTop = 0;
      return;
    }
    if (!nq) { $('results').innerHTML = '<div class="none">כתבו מספר קו, עיר או חברה — ויופיעו כל הקווים, גם בלי שינוי.</div>'; return; }
    var digits = /^\d+$/.test(nq), words = nq.split(' ');
    var lines = LINES.filter(function (l) {
      if (String(l.ty) !== '3' && String(l.ty) !== '715') return false;   // רק אוטובוסים
      if (digits) return l.line.indexOf(nq) === 0 || l.makat === nq;
      var hay = LC.norm(l.line + ' ' + l.op + ' ' + l.from + ' ' + l.to);
      return words.every(function (w) { return hay.indexOf(w) >= 0 || l.line.indexOf(w) === 0 || l.cities.some(function (c) { return LC.norm(c).indexOf(w) === 0; }); });
    });
    lines.sort(function (a, b) { var ea = a.line === nq ? 0 : 1, eb = b.line === nq ? 0 : 1; return ea - eb || (parseInt(a.line, 10) || 0) - (parseInt(b.line, 10) || 0) || (a.line < b.line ? -1 : 1); });
    var G = ttGroups(), gs = [], gc = {};
    lines.forEach(function (l) { var k = ttGroupKey(l); if (G[k]) { if (!gc[k]) gs.push(k); gc[k] = (gc[k] || 0) + 1; } });
    gs.sort(function (a, b) { return gc[b] - gc[a]; });
    var html = gs.slice(0, 4).map(ttGroupRow).join('') + lines.slice(0, digits ? 60 : 8).map(ttRow).join('');
    // מילים: גם רחובות, שכונות וערים — "כל הקווים שעוצרים כאן" ללוח אחד
    if (!digits) {
      loadPlaces();
      var srt = placeSortFor(nq), pls = '';
      var cs = cities().filter(function (c) { return c.n.indexOf(nq) >= 0; }).sort(srt).slice(0, 4);
      if (PL) {
        var hd = PL.hoods.filter(function (x) { return matchPlace(x, words, nq); }).sort(srt).slice(0, 6);
        var st = PL.streets.filter(function (x) { return matchPlace(x, words, nq); }).sort(srt).slice(0, 6);
        pls += hd.map(function (x) { return ttPlaceRow(x, 'h' + PL.hoods.indexOf(x)); }).join('') + st.map(function (x) { return ttPlaceRow(x, 's' + PL.streets.indexOf(x)); }).join('');
      } else pls += '<div class="none">טוען רחובות ושכונות…</div>';
      pls += cs.map(function (x) { return ttPlaceRow(x, 'c' + cityList.indexOf(x)); }).join('');
      if (pls) html = '<div class="grp-h">כל הקווים במקום</div>' + pls + (html ? '<div class="grp-h">קווים</div>' + html : '');
    }
    $('results').scrollTop = 0;
    $('results').innerHTML = html || '<div class="none">לא מצאנו. נסו מספר קו, שכונה, רחוב, עיר או חברה.</div>';
  }
  /* הלו"ז העדכני של קו: data/tt/<מק"ט % 64>.json (נבנה כל לילה) */
  var ttShards = {}, EN_NAMES = {};
  function ttShard(mk) {
    var d = String(mk).replace(/\D/g, ''), i = d ? parseInt(d, 10) % 64 : String(mk).split('').reduce(function (t, c) { return t + c.charCodeAt(0); }, 0) % 64;
    var pre = PRE.tt[i]; delete PRE.tt[i];
    return ttShards[i] || (ttShards[i] = (pre || LC.getJSON('data/tt/' + i + '.json')).then(function (sh) {
      if (sh && sh.en) Object.keys(sh.en).forEach(function (k) { EN_NAMES[k] = sh.en[k]; });   // שמות באנגלית (מהבונה) — ללוח באנגלית
      return sh;
    }).catch(function () { delete ttShards[i]; return null; }));
  }
  function ttPick(mk) {
    return ttShard(mk).then(function (sh) {
      var e = sh && sh.lines[mk]; if (!e) return null;
      var l = lineOf(mk), ups = ((l && l.up) || []).map(function (c) { return c.formal || c.eff; }).filter(function (d) { return d && d > sh.valid; }).sort();
      // הקו משתנה השבוע (השינוי האחרון בשבוע שבלו"ז): כל יום בשבוע — מתאריך השינוי והלאה (LC.ttFromEff, w1 מהבונה).
      // כשחסרים נתונים לאחד הכיוונים — כמו קודם (השבוע מהיום)
      var fe = ups.filter(function (d) { return LC.daysBetween(sh.valid, d) <= 6; }).pop() || '', wk = {};
      Object.keys(e.d).forEach(function (k) { if (fe) wk[k] = LC.ttFromEff(e.d[k], sh.valid, fe, !!sh.w1); });
      if (Object.keys(wk).some(function (k) { return !wk[k]; })) fe = '';
      // in — באילו ימים בשבוע יש נתונים (בלו"ז של השבוע עד השינוי — רק הימים מהיום ועד יום לפני השינוי); xin — אילו תאריכים חריגים
      var mkDirs = function (Wof, inW, xin) {
        return Object.keys(e.d).sort().map(function (k) {
          var r = e.d[k], W = Wof(k, r), x = {}, xa = {}, xn = {}, A = r.A || [], N = r.N || [];
          var at = function (L, w) { return inW(w) && W[w] != null ? L[W[w]] : null; };
          Object.keys(r.x || {}).forEach(function (iso) { if (!xin(iso)) return; x[iso] = r.L[r.x[iso]]; xa[iso] = A[r.x[iso]] || 0; xn[iso] = N[r.x[iso]] || 0; });
          // חלופות: v — תיאור לכל חלופה שאינה הראשית; da/xa — לכל יציאה, באיזו חלופה (0 = ראשית)
          // sc / vs / vc — התחנות והערים של החלופה הראשית ושל כל חלופה (ללוח של מקום: רק מה שעוצר בו)
          // cn — כמה תחנות בכל עיר (מקביל ל-cs): קו בין ערים סמוכות שרוב התחנות שלו בעיר אחת — עירוני בלוח
          return { dir: k, od: r.od, f: r.f, fc: r.fc || '', t: r.t, cs: r.cs, cn: r.cn || null, sc: r.sc || null, vs: r.vs || null, vc: r.vc || null, du: r.du, days: W.map(function (i, w) { return at(r.L, w) || []; }), x: x,
            v: r.v || [], da: W.map(function (i, w) { return at(A, w) || 0; }), xa: xa,
            // תגבורים (מהרישוי): dn/xn — [[מקום ברשימה, כמה אוטובוסים]]
            dn: W.map(function (i, w) { return at(N, w) || 0; }), xn: xn,
            // לבחירת תאריכים בלוח (deck-board.js — bdDatePage): הלו"ז של כל יום בשבוע מ-r.w (wd) ומהשבוע שאחריו (wd1 — null כשזהה),
            // ו-l — מספר הקו בכיוון הזה, כשהוא שונה משאר הקו (1 / 1א באותו מק"ט)
            wd: r.w.map(function (i) { return [r.L[i] || [], A[i] || 0, N[i] || 0]; }),
            wd1: r.w1 ? r.w1.map(function (i) { return i == null ? null : [r.L[i] || [], A[i] || 0, N[i] || 0]; }) : null, l: r.l || '' };
        });
      };
      var all7 = function () { return true; };
      var dirs = mkDirs(function (k, r) { return fe ? wk[k] : r.w; }, all7, function (iso) { return !fe || iso >= fe; });
      // הקו משתנה השבוע: גם הלו"ז של הימים שעד השינוי (pre — מהיום ועד יום לפני השינוי, מ-r.w), ללוח נפרד "עד 28.11" לפני הלוח "החל מ-29.11"
      var pre = null;
      if (fe) {
        var d0 = new Date(sh.valid + 'T12:00:00').getDay(), inPre = function (w) { return LC.addDays(sh.valid, (w - d0 + 7) % 7) < fe; };
        var wu = LC.addDays(fe, -1), dow = [0, 1, 2, 3, 4, 5, 6].filter(inPre);
        pre = { dirs: mkDirs(function (k, r) { return r.w; }, inPre, function (iso) { return iso < fe; }), valid: sh.valid, eff: sh.valid, wkUntil: wu, dow: dow,
          hol: (sh.hol || []).filter(function (h) { return h[0] < fe; }) };
      }
      // עד מתי: היום שלפני השינוי הקרוב בקו (אם יש; בלו"ז מתאריך השינוי — השינוי שאחריו)
      var nx = ups.filter(function (d) { return d > (fe || sh.valid); })[0];
      // מוצא ויעד: מהכיוונים בלו"ז (הנסיעות שמוצגות), לא מהשם של הקו ברשימה — שם שנלקח לפעמים מחלופה אחרת של הקו
      var dod = dirs.filter(function (d) { return d.od && d.od[0] && d.od[1] && d.days.some(function (x) { return x && x.length; }); }).map(function (d) { return d.od; })[0];
      return { id: 'tt-' + mk, kind: 'current', line: e.l, op: e.o, ag: e.a, makat: mk, od: dod ? dod.slice() : l ? [l.from, l.to] : (dirs[0] || {}).od || ['', ''],
        eff: fe || sh.valid, valid: fe || sh.valid, fromEff: fe, tv: sh.valid, tvh: sh.hol || [], until: nx ? LC.addDays(nx, -1) : '', gen: sh.gen, feed: sh.feed, hol: (sh.hol || []).filter(function (h) { return !fe || h[0] >= fe; }), dirs: dirs, pre: pre, tot: { kind: 'current' } };
    });
  }
  $('results').addEventListener('click', function (ev) {
    var b = ev.target.closest('.res'); if (!b) return;
    if (b.tagName === 'A') {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button) return;   // לשונית או חלון חדש — הדפדפן פותח את הקישור
      ev.preventDefault();
    }
    var tg = b.getAttribute('data-ttg'), ti = b.getAttribute('data-tt');
    if (tg || ti) {   // לו"ז עדכני: קו אחד, או כל הקווים לאותו יעד
      var ls = tg ? TTG[tg] : [LINES[+ti]];
      b.classList.add('busy');
      Promise.all(ls.map(function (l) { return loadPick('tt-' + l.makat); })).then(function (ps) {
        b.classList.remove('busy');
        ps = ps.filter(Boolean);
        if (!ps.length) { var mt = b.querySelector('.meta'); if (mt) mt.textContent = 'אין לו״ז לקו הזה בשבוע הקרוב'; return; }
        ps.forEach(function (p) { picks = picks.filter(function (x) { return x.id !== p.id; }); picks.push(p); });
        cur = ls[0]; go(3);
      });
      return;
    }
    var pk = b.getAttribute('data-pl');
    if (pk) {
      var k = pk[0], i = +pk.slice(1);
      placeSel = k === 's' ? PL.streets[i] : k === 'h' ? PL.hoods[i] : cityList[i];
      drawResults(); window.scrollTo(0, 0); return;
    }
    var sg = b.getAttribute('data-sig');
    if (sg && SIGS[sg]) {   // קבוצה: כל הקווים נכנסים למצגת אחת (בשלב 3 אפשר להוציא קו עם ×)
      var ls = SIGS[sg];
      Promise.all(ls.map(function (l) { return loadPick((upK(l) || upNext(l)).id); })).then(function (ps) {
        ps.filter(Boolean).forEach(function (p) { picks = picks.filter(function (x) { return x.makat !== p.makat || x.op !== p.op; }); picks.push(p); });
        if (picks.length) { cur = ls[0]; go(3); }
      });
      return;
    }
    cur = LINES[+b.getAttribute('data-i')]; go(2);
  });
  $('reshead').addEventListener('click', function (ev) {
    if (ev.target.id === 'plback') { placeSel = null; drawResults(); }
    if (ev.target.id === 'plall') { if (mode === 'tt') addAllTT(PLROWS, ev.target); else addAll(PLROWS, ev.target); }
  });
  $('kfil').addEventListener('click', function (ev) {
    var kf = ev.target.closest('[data-kf]'); if (!kf || kf.disabled) return;
    kindF = kf.getAttribute('data-kf');
    try { localStorage.setItem('lc-kind', kindF); } catch (e) {}
    setUrl('replace'); drawResults();
  });
  /* כל הקווים שמשתנים במקום (עיר, רחוב או שכונה) — מצגת אחת; בשלב 3 אפשר להוציא קו עם × */
  var PLROWS = [];
  /* התאריך של השינוי שמוצג לקו: מהרשימה, או (שינוי שהיה רק בארכיון) מ"הקו בזמן" */
  function whenOf(l) {
    var u = upK(l);
    if (u) return u.formal || u.eff;
    var rp = recentPast(l);
    return rp.length ? rp[0][0] : '9999';
  }
  function pickKey(l) {
    var u = upK(l);
    if (u) return u.id;
    if (kindF !== 'all' && kindF !== 'route' && kindF !== 'past') return null;
    var g = clusterPast(recentPast(l))[0];
    return g ? 'p-' + l.makat + '-' + g.d : null;
  }
  /* לו"ז עדכני: כל הקווים במקום — "טבלה לפי יעד", ושם המקום בכותרת */
  function addAllTT(ls, btn) {
    if (!ls || !ls.length) return;
    if (btn) { btn.disabled = true; btn.textContent = 'טוען ' + ls.length + ' קווים…'; }
    var nm = placeSel ? placeSel.name + (placeSel.city && placeSel.kind !== 'c' && placeSel.city !== placeSel.name ? ', ' + placeSel.city : '') : '';
    // המקום עצמו — בלוח יוצגו רק כיוונים וחלופות שעוצרים בו
    var pl = placeSel ? { k: placeSel.kind, n: placeSel.name, c: placeSel.kind === 'c' ? placeSel.name : placeSel.city, s: placeSel.stops || null, m: ls.map(function (l) { return l.makat; }) } : null;   // m — הקווים שנבחרו מהמקום (קו שנוסף ביד — מוצג כולו)
    Promise.all(ls.map(function (l) { return loadPick('tt-' + l.makat); })).then(function (ps) {
      ps.filter(Boolean).forEach(function (p) { picks = picks.filter(function (x) { return x.id !== p.id; }); picks.push(p); });
      if (picks.length) { wantBoard = { nm: nm, pl: pl }; cur = ls[0]; go(3); }
      else if (btn) btn.textContent = 'אין לו״ז לקווים האלה בשבוע הקרוב';
    });
  }
  function addAll(ls, btn) {
    if (!ls || !ls.length) return;
    if (btn) { btn.disabled = true; btn.textContent = 'טוען ' + ls.length + ' קווים…'; }
    Promise.all(ls.map(function (l) { var k = pickKey(l); return k ? loadPick(k) : null; })).then(function (ps) {
      ps.filter(Boolean).forEach(function (p) { picks = picks.filter(function (x) { return x.makat !== p.makat || x.op !== p.op; }); picks.push(p); });
      if (picks.length) { cur = ls[0]; go(3); }
    });
  }

  /* ---------- שלב 2: איזה שינוי ---------- */
  function drawChanges() {
    var l = cur;
    $('linehead').innerHTML = '<span class="badge">' + E(l.line) + '</span><div class="t"><b>' + E(l.from) + ' ↔ ' + E(l.to) + '</b><span>' + E(l.op) + '</span></div>';
    var KO = { route: 0, 'new': 1, ended: 1, timetable: 2 }, many = Object.keys(kindsOf(l)).filter(function (k) { return k !== 'past'; }).length > 1;
    var up = l.up.slice().sort(function (a, b) { return KO[kindOf(a)] - KO[kindOf(b)] || ((a.formal || a.eff) < (b.formal || b.eff) ? -1 : 1); });
    var html = up.map(function (c) {
      var t = c.tot || {}, sm = (c.dev || 0) < 1000 && (t.add || 0) + (t.rem || 0) + (t.mv || 0) <= 3;
      return card({ key: c.id, date: c.formal || c.eff, tot: c.tot, soon: (c.formal || c.eff) >= idx.gen, dirs: c.dirs.length, size: c.kind ? null : sm,
        kind: c.kind, last: c.last, summary: c.summary, kchip: many && !c.kind, basis: c.inferred ? null : c.basis, inferred: c.inferred });
    }).join('');
    // שינוי מהארכיון שכבר יש לו רישום מלא (גם לפי התאריך של כיוון אחד) — פעם אחת
    var pastEv = clusterPast(recentPast(l)).filter(function (g) {
      return !l.up.some(function (c) { return !c.kind && [c.formal || c.eff].concat(c.dirs.map(function (d) { return d.eff; })).some(function (x) { return x && Math.abs(LC.daysBetween(x, g.d)) <= 3; }); });
    });
    html += pastEv.map(function (g) {
      return card({ key: 'p-' + l.makat + '-' + g.d, date: g.d, past: true, kinds: g.kinds, dirs: g.rests.length });
    }).join('');
    if (!up.length && !pastEv.length) {
      $('cards').innerHTML = (goneNote === l.makat ? '<div class="none">השינוי עודכן — זה המידע העדכני על הקו</div>' : '') +
        '<div class="none">אין שינוי בקו הזה בשבועיים הקרובים או בשבועיים האחרונים.</div>';
      return;
    }
    if (goneNote === l.makat) html = '<div class="none">השינוי עודכן — זה המידע העדכני על הקו</div>' + html;
    $('cards').innerHTML = html;
    var first = $('cards').querySelector('.ccard');
    if (first) first.classList.add('rec');
    // השינויים שכבר היו: הפרטים (כמה תחנות) מתמלאים אחרי שקובצי "הקו בזמן" נטענים
    pastEv.forEach(function (g) {
      loadPick('p-' + l.makat + '-' + g.d).then(function (p) {
        var el = $('cards').querySelector('[data-key="p-' + l.makat + '-' + g.d + '"] .chips');
        if (el) el.innerHTML = p ? LC.chips(p.tot) : '<span class="chip mv">אין פרטים</span>';
        var sz = $('cards').querySelector('[data-key="p-' + l.makat + '-' + g.d + '"] .size');
        if (sz && p) sz.textContent = LCDeck.smallInfo(p).small ? 'שינוי קטן — עמוד אחד' : 'שינוי גדול — מצגת מלאה';
      });
    });
  }
  function clusterPast(ev) {
    var out = [];
    ev.slice().sort(function (a, b) { return a[0] < b[0] ? 1 : -1; }).forEach(function (e) {
      var g = out[out.length - 1];
      if (g && LC.daysBetween(e[0], g.d) <= 3) { if (g.rests.indexOf(e[1]) < 0) g.rests.push(e[1]); g.kinds[e[2]] = 1; g.d = e[0] < g.d ? e[0] : g.d; }
      else out.push({ d: e[0], rests: [e[1]], kinds: (function () { var k = {}; k[e[2]] = 1; return k; })() });
    });
    return out.slice(0, 8);
  }
  var KIND_LBL = { 'new': ['הקו מתחיל לנסוע', 'הקו התחיל לנסוע'], ended: ['הנסיעה האחרונה', 'הנסיעה האחרונה'], timetable: ['לוח זמנים חדש מ', 'לוח זמנים חדש מ'] };
  var KIND_META = { 'new': 'מפה של המסלול, התחנות ומתי הקו נוסע', ended: 'מפה של המסלול, ואילו קווים עוצרים באותן תחנות', timetable: 'הלוח הישן והחדש — כללי או מפורט' };
  /* על מה מבוססת ההשוואה (חלופה שהוחלפה / בוטלה / חדשה) — שורה קטנה בכרטיס */
  function basisLine(b) {
    if (!b || !b.length) return '';
    return '<span class="basis" style="display:block;font-size:12px;color:var(--sub);margin-top:4px;line-height:1.35">' + E(b[0]) +
      (b.length > 1 ? ' (ועוד ' + (b.length - 1) + ')' : '') + '</span>';
  }
  function card(c) {
    if (c.kind && KIND_LBL[c.kind]) {
      var d = c.kind === 'ended' ? (c.last || LC.addDays(c.date, -1)) : c.date;
      return '<a class="ccard" href="' + resHref('c=' + shortId(c.key)) + '" data-key="' + E(c.key) + '">' +
        '<span class="when"><span class="l">' + KIND_LBL[c.kind][c.soon ? 0 : 1] + '</span><b>' + E(LC.wd(d) + ' ' + LC.dmy(d)) + '</b>' +
        '<span class="l">' + E(LC.rel(idx.gen, d)) + '</span></span>' +
        '<span class="what"><span class="chips">' + LC.chips(c.tot || { kind: c.kind }) + '</span>' +
        '<span class="size">' + E(c.kind === 'timetable' ? String(c.summary || '').replace(/^שינוי בלוח הזמנים:?\s*/, '') : '') + '</span>' +
        '<span class="meta">' + E(KIND_META[c.kind]) + ' · ' + (c.dirs > 1 ? 'הלוך וחזור' : 'רק בנסיעה לצד אחד') + '</span></span>' +
        '<span class="pick-arrow" aria-hidden="true">←</span></a>';
    }
    var lbl = c.past ? 'היה ב' : (c.soon ? 'בקרוב' : 'נכנס לתוקף');
    var chips = (c.kchip ? '<span class="chip kd">שינוי מסלול</span>' : '') + (c.inferred ? '<span class="chip inf">השוואה משוערת</span>' : '') + (c.tot ? LC.chips(c.tot) : '<span class="chip mv">טוען…</span>');
    var kinds = c.kinds ? Object.keys(c.kinds).map(function (k) { return KIND_TXT[k] || k; }).join(' · ') : '';
    return '<a class="ccard' + (c.past ? ' past' : '') + '" href="' + resHref('c=' + shortId(c.key)) + '" data-key="' + E(c.key) + '">' +
      '<span class="when"><span class="l">' + lbl + '</span><b>' + E(LC.wd(c.date) + ' ' + LC.dmy(c.date)) + '</b>' +
      (c.past ? '' : '<span class="l">' + E(LC.rel(idx.gen, c.date)) + '</span>') + '</span>' +
      '<span class="what"><span class="chips">' + chips + '</span>' +
      '<span class="size">' + (c.size == null ? '' : c.size ? 'שינוי קטן — עמוד אחד' : 'שינוי גדול — מצגת מלאה') + '</span><span class="meta">' + (kinds ? E(kinds) + ' · ' : '') +
      (c.dirs > 1 ? 'הלוך וחזור' : 'רק בנסיעה לצד אחד') + (c.past ? ' · מהארכיון' : '') + '</span>' + basisLine(c.basis) + '</span>' +
      '<span class="pick-arrow" aria-hidden="true">←</span></a>';
  }
  $('cards').addEventListener('click', function (ev) {
    var b = ev.target.closest('.ccard'); if (!b) return;
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button) return;   // לשונית חדשה — הקישור עצמו
    ev.preventDefault();
    var key = b.getAttribute('data-key');
    b.classList.add('busy');
    loadPick(key).then(function (p) {
      b.classList.remove('busy');
      if (!p) { b.querySelector('.meta').textContent = 'לא הצלחנו לטעון את הפרטים של השינוי הזה'; return; }
      picks = picks.filter(function (x) { return x.makat !== p.makat || x.op !== p.op; });
      picks.push(p);
      
      go(3);
    });
  });

  /* ---------- טעינת שינוי (קרוב / שהיה / השוואה) ---------- */
  function stopObj(s) {   // בונה: [מק"ט, שם, lat, lon, עיר] · "הקו בזמן": [מק"ט, שם, lat, lon, ...]
    var o = Array.isArray(s) ? { code: String(s[0]), name: s[1], ll: [s[2], s[3]], city: typeof s[4] === 'string' ? s[4] : '' } : s;
    o.name = String(o.name || '').replace(/''/g, '"').replace(/\s+/g, ' ').trim();   // צה''ל → צה"ל
    return o;
  }
  function normPage(p) {
    p.dirs.concat(p.split || []).forEach(function (d) {
      ['old', 'new'].forEach(function (k) {
        d[k].stops = d[k].stops.map(stopObj);
        if (!d[k].shape) d[k].shape = LC.decodePoly(d[k].shp);
      });
    });
    return p;
  }
  function loadPick(key) {
    if (cache[key]) return Promise.resolve(cache[key]);
    var m;
    if ((m = key.match(/^tt-(\w+)$/))) return ttPick(m[1]).then(function (p) { return p ? (cache[key] = p) : null; });
    if ((m = key.match(/^p-(\d+)-(\d{4}-\d{2}-\d{2})$/))) return pastPick(m[1], m[2], null).then(function (p) { return (cache[key] = p); });
    if ((m = key.match(/^x-(\d+)-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/))) return pastPick(m[1], m[3], m[2]).then(function (p) { return (cache[key] = p); });
    var pre = PRE.l[key]; delete PRE.l[key];
    return (pre || LC.getJSON('data/l/' + encodeURIComponent(key) + '.json')).then(function (p) { return (cache[key] = normPage(p)); }).catch(function () { return null; });
  }

  /* קובץ של "הקו בזמן" לכיוון אחד: גרסאות עם תחנות ומסלול */
  function lhFile(rd) {
    if (lhCache[rd]) return lhCache[rd];
    var f = rd.replace(/#/g, 'H').replace(/\//g, '_');
    return (lhCache[rd] = fetch(LH + encodeURIComponent(f) + '.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (lf) {
      if (!lf) return null;
      var pool = lf.pool, spool = lf.spool, vers = [];
      (lf.versions || []).forEach(function (v) {
        var st = (v.stops || []).map(function (x) { return typeof x === 'number' ? (pool || [])[x] : x; }).filter(Boolean);
        var shp = typeof v.shp === 'number' ? ((spool || [])[v.shp] || '') : (v.shp || '');
        if (st.length) vers.push({ d: v.d, k: v.k, stops: st.map(stopObj), shp: shp });
      });
      vers.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
      return { rd: rd, dest: lf.dest, op: lf.op, line: lf.line, vers: vers };
    }).catch(function () { return null; }));
  }

  /* שינוי שהיה (או השוואה): לכל כיוון — הגרסה בתאריך מול הגרסה שלפניה (או בתאריך "לפני") */
  function pastPick(makat, d, before) {
    var l = lineOf(makat);
    if (!l) return Promise.resolve(null);
    var rests = before ? l.rds : l.past.filter(function (e) { return Math.abs(LC.daysBetween(e[0], d)) <= 3; }).map(function (e) { return e[1]; });
    rests = rests.filter(function (r, i) { return rests.indexOf(r) === i; });
    return Promise.all(rests.map(function (r) { return lhFile(makat + '-' + r); }).concat([deckLib()])).then(function (files) {
      files.pop();   // deckLib — LCDeck.geoChanged ב-diffDir
      var dirs = [];
      files.forEach(function (f, i) {
        if (!f) return;
        var nv, ov;
        if (before) {
          nv = f.vers.filter(function (v) { return v.d <= d; }).pop();
          ov = f.vers.filter(function (v) { return v.d <= before; }).pop();
        } else {
          var ix = -1;
          f.vers.forEach(function (v, j) { if (PAST_KINDS[v.k] && Math.abs(LC.daysBetween(v.d, d)) <= 3) ix = j; });
          if (ix < 1) return;
          nv = f.vers[ix];
          ov = f.vers.slice(0, ix).filter(function (v) { return v.d < nv.d; }).pop();
        }
        if (!nv || !ov || nv === ov) return;
        var dd = diffDir(f, rests[i], ov, nv);
        // שרטוט מחדש של אותה דרך (בלי תחנות שהשתנו) — לא שינוי
        if (dd.geo || dd.added.length || dd.removed.length || dd.moved.length) dirs.push(dd);
      });
      if (!dirs.length) return null;
      var tot = { geo: dirs.some(function (x) { return x.geo; }), add: uniq(dirs, 'added'), rem: uniq(dirs, 'removed'), mv: 0 };
      var eff = dirs.map(function (x) { return x.eff; }).sort()[0];
      return { id: (before ? 'x-' + makat + '-' + before + '-' : 'p-' + makat + '-') + d, past: true, cmp: before || null,
        line: l.line, op: l.op, ag: l.ag, makat: makat, od: [l.from, l.to], eff: eff, formal: null, gen: idx.gen, feed: null, tot: tot,
        chcities: [], dirs: dirs };
    });
  }
  function uniq(dirs, k) { var s = {}; dirs.forEach(function (x) { x[k].forEach(function (c) { s[c] = 1; }); }); return Object.keys(s).length; }
  function dist(a, b) { var cl = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180); return Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * cl); }
  function nm(s) { return String(s || '').replace(/[\s"'״׳`.\-\/]/g, ''); }
  function diffDir(f, rest, ov, nv) {
    var oc = {}, nc = {};
    ov.stops.forEach(function (s) { oc[s.code] = s; });
    nv.stops.forEach(function (s) { nc[s.code] = s; });
    var added = nv.stops.filter(function (s) { return !oc[s.code]; }), removed = ov.stops.filter(function (s) { return !nc[s.code]; }), swaps = [];
    removed.slice().forEach(function (r) {   // החלפת מק"ט באותו שם ובאותו מקום — לא שינוי
      var a = added.filter(function (x) { return nm(x.name) === nm(r.name) && dist(x.ll, r.ll) <= 60; })[0];
      if (a) { swaps.push({ old: r.code, new: a.code, name: a.name }); removed.splice(removed.indexOf(r), 1); added.splice(added.indexOf(a), 1); }
    });
    var moved = [];
    nv.stops.forEach(function (s) { var o = oc[s.code]; if (o && dist(o.ll, s.ll) > 40) moved.push({ code: s.code, name: s.name, ll: s.ll, from: o.ll, m: Math.round(dist(o.ll, s.ll)), city: '' }); });
    var os = LC.decodePoly(ov.shp), ns = LC.decodePoly(nv.shp);
    var sameSeq = !added.length && !removed.length && !moved.length && ov.stops.map(function (x) { return x.code; }).join() === nv.stops.map(function (x) { return x.code; }).join();
    var geo = LCDeck.geoChanged(os, ns, sameSeq);
    var od = LC.odOf(f.dest);
    return { rd: f.rd, dir: rest.split('-')[0], alt: rest.split('-')[1] || '#', od: od, eff: nv.d, formal: null, prevDate: ov.d,
      old: { stops: ov.stops, shape: os }, new: { stops: nv.stops, shape: ns },
      added: added.map(function (s) { return s.code; }), removed: removed.map(function (s) { return s.code; }), moved: moved, geo: geo, swaps: swaps };
  }

  /* ---------- שלב 3: המצגת ---------- */
  /* רשימת הקווים במצגת: עם הרבה קווים — 8 הראשונים, ו"ועוד N" פותח את כולם */
  var PK_MAX = 8, pkOpen = false;
  function drawPicked() {
    var showN = pkOpen || picks.length <= PK_MAX + 2 ? picks.length : PK_MAX;
    $('picked').innerHTML = picks.slice(0, showN).map(function (p, i) {
      var when = p.kind === 'current' ? 'לו״ז עדכני' : p.kind === 'ended' ? 'עד ' + LC.dmy(p.last || p.eff) : (p.past ? 'היה ב-' : p.kind === 'new' ? 'קו חדש מ-' : p.kind === 'timetable' ? 'לו״ז מ-' : 'מ-') + LC.dmy(p.formal || p.eff);
      // ↑↓ — הסדר של הקווים (בלוח המודעות: סדר ידני)
      var mv = picks.length > 1 ? '<button type="button" class="pkmv" data-pkmv="' + i + ':-1" aria-label="להעביר את קו ' + E(p.line) + ' למעלה"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button type="button" class="pkmv" data-pkmv="' + i + ':1" aria-label="להעביר את קו ' + E(p.line) + ' למטה"' + (i < picks.length - 1 ? '' : ' disabled') + '>↓</button>' : '';
      return '<span class="pk">' + mv + '<span class="badge">' + E(p.line) + '</span><span>' + E(when) + '</span>' +
        (picks.length > 1 ? '<button type="button" data-rm="' + i + '" aria-label="להוציא את קו ' + E(p.line) + ' מהמצגת">×</button>' : '') + '</span>';
    }).join('') + (showN < picks.length ? '<button type="button" class="pk pkmore" data-more="1" aria-expanded="false">ועוד ' + (picks.length - showN) + ' ▾</button>' : '');
  }
  $('picked').addEventListener('click', function (ev) {
    if (ev.target.closest('[data-more]')) { pkOpen = true; drawPicked(); return; }
    var mb = ev.target.closest('[data-pkmv]');
    if (mb) {
      // הזזה ברשימה: הקווים במצגת בסדר החדש, ובלוח המודעות — סדר ידני לפי הרשימה
      var a = mb.getAttribute('data-pkmv').split(':'), i = +a[0], j = i + +a[1];
      if (j < 0 || j >= picks.length) return;
      var t = picks[i]; picks[i] = picks[j]; picks[j] = t;
      if (curPages && curPages.length && edits) { edits.bman = picks.map(function (p) { return p.makat; }); edits.bord = 'man'; saveEdits(); }
      rebuild();
      setTimeout(function () { var f = $('picked').querySelector('[data-pkmv="' + j + ':' + a[1] + '"]'); if (f && !f.disabled) f.focus(); }, 0);
      return;
    }
    var b = ev.target.closest('[data-rm]'); if (!b) return;
    picks.splice(+b.getAttribute('data-rm'), 1);  rebuild();
  });


  /* ---------- השוואה משוערת: חלופה שהופסקה וחלופה אחרת שהתחילה באותו כיוון ----------
     המערכת לא מחליטה לבד: בשלב 3 שואלים את מי שמכין את המצגת אם זו אותה נסיעה שהשתנתה.
     "כן" (ברירת המחדל) — שינוי מסלול, לפני ואחרי. "לא" — חלופה שבוטלה וחלופה חדשה, כל אחת בדף משלה (p.split מהבונה).
     התשובה "לא" נשמרת בכתובת (s=) ובלשונית (sessionStorage) */
  var infNo = (function () {
    var o = {};
    try { (JSON.parse(sessionStorage.getItem('lc-infno') || '[]') || []).forEach(function (id) { o[id] = 1; }); } catch (e) {}
    return o;
  })();
  function infSave() { try { sessionStorage.setItem('lc-infno', JSON.stringify(Object.keys(infNo))); } catch (e) {} }
  function infPairs(p) { return p.dirs.filter(function (d) { return d.was; }); }
  function expandInf(list) {
    var out = [];
    list.forEach(function (p) {
      if (!infNo[p.id] || !infPairs(p).length) { out.push(p); return; }
      var rest = p.dirs.filter(function (d) { return !d.was; });
      if (rest.length) out.push(Object.assign({}, p, { dirs: rest }));
      ['end', 'new'].forEach(function (v) {
        var ds = (p.split || []).filter(function (d) { return d.var === v; });
        if (!ds.length) return;
        var eff = ds.map(function (d) { return d.eff; }).sort()[0];
        out.push(Object.assign({}, p, { id: p.id + '-x' + v[0], dirs: ds, eff: eff, formal: null, var: v, inferred: 0, sig: '',
          tot: { var: v, rem: v === 'end' ? ds.reduce(function (n, d) { return n + d.removed.length; }, 0) : 0, add: v === 'new' ? ds.reduce(function (n, d) { return n + d.added.length; }, 0) : 0 } }));
      });
    });
    return out;
  }
  var iqMaps = [];
  function drawInfq() {
    iqMaps.forEach(function (m) { m.remove(); }); iqMaps = [];
    var ps = mode === 'tt' ? [] : picks.filter(function (p) { return infPairs(p).length; });
    $('infq').hidden = !ps.length;
    $('infq').innerHTML = ps.map(function (p) {
      var pr = infPairs(p), no = !!infNo[p.id];
      return '<div class="iq" data-iq="' + E(p.id) + '"><span class="flabel">קו ' + E(p.line) + ' · השוואה משוערת</span>' +
        '<ul>' + pr.map(function (d) {
          return '<li>לפי לוח הזמנים, חלופה <b><bdi dir="ltr">' + E(d.was) + '</bdi></b>' + (d.was_last ? ' (עד ' + LC.dmy(d.was_last) + ')' : '') + ' הפסיקה, וחלופה <b><bdi dir="ltr">' + E(d.rd) + '</bdi></b> (מ-' + LC.dmy(d.eff) + ') התחילה באותו כיוון' + (d.od && d.od[1] ? ' (ל' + E(d.od[1]) + ')' : '') + '.</li>';
        }).join('') + '</ul>' +
        '<div class="iqmap"></div><div class="iqkey"><span><i class="o"></i>החלופה שהפסיקה</span><span><i></i>החלופה שהתחילה</span></div>' +
        '<p><b>האם זו אותה נסיעה שהשתנתה?</b></p>' +
        '<div class="seg2" role="radiogroup" aria-label="האם זו אותה נסיעה שהשתנתה?">' +
          '<button type="button" role="radio" data-iqa="yes" aria-checked="' + !no + '"><b>כן — להציג כשינוי מסלול</b><small>לפני ואחרי: מפה, תחנות שבוטלו ונוספו</small></button>' +
          '<button type="button" role="radio" data-iqa="no" aria-checked="' + no + '"' + (p.split && p.split.length ? '' : ' disabled') + '><b>לא — להציג בנפרד</b><small>חלופה שבוטלה וחלופה חדשה</small></button>' +
        '</div></div>';
    }).join('');
    // מפה קטנה: החלופה שהפסיקה (אדום מקווקו) והחלופה שהתחילה (ירוק), עם התחנות שבוטלו ונוספו
    ps.forEach(function (p) {
      var el = $('infq').querySelector('[data-iq="' + CSS.escape(p.id) + '"] .iqmap'); if (!el || typeof L === 'undefined') return;
      var map = L.map(el, { zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false, touchZoom: true, doubleClickZoom: true, zoomSnap: 0.25 });
      map.attributionControl.setPrefix(false);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true }).addTo(map);
      var b = L.latLngBounds([]);
      infPairs(p).forEach(function (d) {
        if (d.old.shape.length > 1) L.polyline(d.old.shape, { color: '#b8361f', weight: 4, dashArray: '8 7', interactive: false }).addTo(map);
        if (d.new.shape.length > 1) L.polyline(d.new.shape, { color: '#1f9152', weight: 4, opacity: .9, interactive: false }).addTo(map);
        d.old.stops.forEach(function (s) { if (d.removed.indexOf(s.code) >= 0) { L.circleMarker(s.ll, { radius: 5, color: '#fff', weight: 2, fillColor: '#b8361f', fillOpacity: 1 }).bindTooltip(E(s.name)).addTo(map); b.extend(s.ll); } });
        d.new.stops.forEach(function (s) { if (d.added.indexOf(s.code) >= 0) { L.circleMarker(s.ll, { radius: 5, color: '#fff', weight: 2, fillColor: '#0a5530', fillOpacity: 1 }).bindTooltip(E(s.name)).addTo(map); b.extend(s.ll); } });
      });
      if (!b.isValid()) infPairs(p).forEach(function (d) { d.new.shape.forEach(function (x) { b.extend(x); }); });
      if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 16 });
      iqMaps.push(map);
    });
  }
  $('infq').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-iqa]'); if (!b || b.disabled) return;
    var id = b.closest('[data-iq]').getAttribute('data-iq');
    if (b.getAttribute('data-iqa') === 'no') infNo[id] = 1; else delete infNo[id];
    infSave(); rebuild();
  });
  function rebuild() {
    var my = ++token;
    drawPicked();
    if (step === 3) setUrl('replace');
    if (!picks.length) { emptyStage(); return; }
    var pages = expandInf(picks).sort(function (a, b) { return (parseInt(a.line, 10) || 0) - (parseInt(b.line, 10) || 0); });
    if (!deckOk()) {   // הקוד של המצגת עוד יורד — הודעה קצרה, והמצגת מיד כשהוא מגיע
      $('deck').innerHTML = '<div class="empty-state"><p>טוען את המצגת…</p></div>';
      deckLib().then(function () { if (my === token && step === 3) rebuild(); }, function () {
        if (my === token) $('deck').innerHTML = '<div class="empty-state"><p>לא הצלחנו לטעון את המצגת. נסו לרענן את הדף.</p></div>';
      });
      return;
    }
    drawInfq();
    if (my === token) render(pages);
  }
  /* deck.js, editor.js ו-Leaflet נטענים רק כשצריך (LCDeckLoad ב-index.html) */
  function deckOk() { return !!(window.LCDeck && window.LCEdit); }
  function deckLib() { return deckOk() ? Promise.resolve() : window.LCDeckLoad ? window.LCDeckLoad() : Promise.reject(new Error('deck')); }

  /* ---------- המצגת: בנייה, עריכות, תצוגה ---------- */
  var editMode = false;
  function normEdits(e) {
    e = e && typeof e === 'object' ? e : {};
    e.t = e.t || {}; e.add = e.add || {}; e.boxes = e.boxes || {}; e.xslides = e.xslides || []; e.off = e.off || {}; e.modes = e.modes || {}; e.hide = e.hide || {}; e.imgs = e.imgs || {}; e.inset = e.inset || {};
    // "טבלה לפי יעד": טקסט שנערך בלוח, שורות וקווים שהוסרו (ראו bdT ב-deck.js)
    e.mv = e.mv && typeof e.mv === 'object' ? e.mv : {};   // התצוגה של כל מפה (מרכז וזום), לפי שקף — מהזזה והגדלה במצב עריכה
    e.bd = e.bd && typeof e.bd === 'object' ? e.bd : {}; e.bd.t = e.bd.t || {}; e.bd.offR = e.bd.offR || {}; e.bd.offL = e.bd.offL || {}; e.bd.al = e.bd.al || {};
    e.bd.nr = Array.isArray(e.bd.nr) ? e.bd.nr : [];   // שורות שהמשתמש הוסיף ללוח: [{id, after: מפתח השורה שמעליה}]
    return e;
  }
  function textSlide(x, pages) {
    return { id: x.id, label: 'שקף טקסט', custom: true,
      html: '<div class="s-text"><div class="head">' + (pages.length === 1 ? '<span class="badge sm num">' + E(pages[0].line) + '</span>' : '') +
        '<h2 class="hd">כותרת השקף</h2></div><div class="body"><p>כתבו כאן את הטקסט. אפשר להוסיף שורות, למחוק ולשנות הכול.</p></div>' +
        '<div class="sfoot"><span>הוכן על ידי אדם פרטי · לא פרסום רשמי</span><span class="pg num"></span></div></div>' };
  }
  /* שינוי שכבר התחיל: הטקסטים במצגת בהווה או בעבר ("הקו כבר לא עוצר", "מה השתנה?", "מאז 17.11").
     רק בשקפים של קו שהשינוי שלו כבר התחיל; שער, סיכום וסיום — כשכל השינויים במצגת כבר התחילו.
     רק בטקסט שהמצגת יצרה — עריכות של המשתמש מוחלות אחר כך, ולא משתנות */
  function pageBegun(p) { return p.kind !== 'current' && (p.past || begun(p)); }
  function pastTense(slides, pages) {
    var was = pages.filter(pageBegun);
    if (!was.length) return;
    var all = was.length === pages.length;
    slides.forEach(function (s) {
      if (!s.html) return;
      var own = null;
      pages.forEach(function (p) { if (String(s.id).indexOf(p.id) >= 0 && (!own || p.id.length > own.id.length)) own = p; });
      // מפה ותחנות של כיוון אחד — לפי התאריך של הכיוון (בקו שהשתנה, כיוון אחד יכול להשתנות רק בעוד כמה ימים)
      var m = own && String(s.id).slice(String(s.id).indexOf(own.id) + own.id.length).match(/^-[ms](\d+)/), d = m && own.dirs[+m[1]];
      if (d && !d.formal && d.eff > idx.gen) return;
      if (own ? pageBegun(own) : all) s.html = pastHtml(s.html);
    });
  }
  var FUT = { 'יעצור': 'עוצר', 'יעצרו': 'עוצרים', 'ייסע': 'נוסע', 'ייסעו': 'נוסעים', 'יתחיל': 'מתחיל', 'יתחילו': 'מתחילים', 'ימשיך': 'ממשיך', 'ימשיכו': 'ממשיכים',
    'יסיים': 'מסיים', 'יסיימו': 'מסיימים', 'יגיע': 'מגיע', 'יגיעו': 'מגיעים', 'יחזור': 'חוזר', 'יחזרו': 'חוזרים' };
  var NOW = { 'משנה': 'שינה', 'משנים': 'שינו', 'מבטל': 'ביטל', 'מבטלים': 'ביטלו', 'מוסיף': 'הוסיף', 'מוסיפים': 'הוסיפו', 'מאריך': 'האריך', 'מאריכים': 'האריכו', 'מעביר': 'העביר', 'מעבירים': 'העבירו' };
  function pastText(t) {
    return t
      .replace(/(^|[^\u0590-\u05FF])(ו|ש)?(יעצור|יעצרו|ייסע|ייסעו|יתחיל|יתחילו|ימשיך|ימשיכו|יסיים|יסיימו|יגיע|יגיעו|יחזור|יחזרו)(?![\u0590-\u05FF])/g, function (m, a, pre, v) { return a + (pre || '') + FUT[v]; })
      .replace(/(הקו|הקווים) (משנה|משנים|מבטל|מבטלים|מוסיף|מוסיפים|מאריך|מאריכים|מעביר|מעבירים)(?![\u0590-\u05FF])/g, function (m, w, v) { return w + ' ' + NOW[v]; })
      .replace(/מה משתנה/g, 'מה השתנה').replace(/שמשתנים/g, 'שהשתנו').replace(/שמשתנות/g, 'שהשתנו')
      .replace(/(המסלול|לא) משתנה(?![\u0590-\u05FF])/g, '$1 השתנה').replace(/לא משתנות/g, 'לא השתנו').replace(/לא משתנים/g, 'לא השתנו')
      .replace(/(התחנה (?:הראשונה|האחרונה)) תהיה/g, '$1 היא')
      .replace(/מפסיק לפעול/g, 'הפסיק לפעול').replace(/מפסיקים לפעול/g, 'הפסיקו לפעול')
      .replace(/תחנה אחת עוברת/g, 'תחנה אחת עברה').replace(/תחנות עוברות/g, 'תחנות עברו')
      .replace(/עד היום/g, 'לפני השינוי').replace(/מעכשיו/g, 'אחרי השינוי')
      .replace(/החל מ-?((?:יום \S+ )?)(\d{1,2})\.(\d{1,2})(\.\d{4})?/g, function (m, w, d, mo, y) {   // רק תאריך שכבר עבר
        var iso = (y ? y.slice(1) : idx.gen.slice(0, 4)) + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
        return iso <= idx.gen ? 'מאז ' + w + d + '.' + mo + (y || '') : m;
      });
  }
  /* רק הטקסט שבין התגיות */
  function pastHtml(h) { return String(h).replace(/>([^<]+)</g, function (m, t) { return '>' + pastText(t) + '<'; }); }
  // שקף תמונה: התמונה על כל השקף — ממלאת אותו (cover) או כולה בתוכו (contain)
  function imgSlide(x) {
    return { id: x.id, label: 'שקף תמונה', custom: true, img: true, fit: x.fit === 'contain' ? 'contain' : 'cover',
      html: '<div class="s-img" data-fit="' + (x.fit === 'contain' ? 'contain' : 'cover') + '"><img alt="' + E(x.alt || '') + '" src="' + E(getImg(x.img)) + '"></div>' };
  }
  function xSlide(x, pages) { return x.img ? imgSlide(x) : textSlide(x, pages); }
  // שקף שנוסף מופיע בצורה הנוכחית? שקף טקסט — רק במצגת; שקף תמונה — בכל הצורות (אם התמונה עוד שמורה)
  function xOk(x, form) { return x.img ? !!getImg(x.img) : form === 'deck'; }
  function tordOf() { return edits.tord === 'ltr' || edits.tord === 'rtl' ? edits.tord : edits.ttc === 'board' || (edits.tt && edits.tt.v === 'board') ? 'ltr' : 'rtl'; }
  function edOpts(form) {
    var tv = syncTv(curPages || []);
    return { look: edits.look, modes: edits.modes, credit: creditOn(), form: form, tt: ttOpts(), tv: tv, ttc: edits.ttc, ttper: edits.ttper, zm: edits.zm, rc: edits.rc, a4full: edits.a4full, hol: idx.hol || [],
      btitle: edits.btitle, bnote: edits.bnote, bplace: edits.bplace, bpl: edits.bpl, bd: edits.bd, editing: editMode, tord: tordOf(),
      bsplit: edits.bsplit, bdense: edits.bdense, bpages: edits.bpages, bbrk: edits.bbrk, bord: edits.bord, bman: edits.bman, btypes: edits.btypes, bthide: edits.bthide, bsub: edits.bsub,
      bk: edits.bk, bops: edits.bops, bflat: edits.bflat, bmb: edits.bmb, bcw: edits.bcw, bstop: edits.bstop, btal: edits.btal, bt1: edits.bt1, bclr: edits.bclr,
      bop: edits.bop, bend: edits.bend, bx2: edits.bx2, bltr: edits.bltr, bdays: edits.bdays, blang: tv === 'board' ? edits.blang : undefined, ben: edits.ben, en: EN_NAMES, btitleEn: edits.btitleEn, bnoteEn: edits.bnoteEn,   // לוח באנגלית — רק בלוח המודעות
      ltype: LT, towns: townsOf(),
      pord: picks.map(function (p) { return p.makat; }) };   // סדר הקווים בלוח: "לפי הסדר שהוספתם" — לפי הסדר של הקווים במצגת
  }
  var wantBoard = null;
  function render(pages) {
    if (!deckOk()) return;
    if (LCDeck.setPhones) LCDeck.setPhones(OPS, OP_PHONES);
    curPages = pages;
    dropMaps();
    var sig = pages.map(function (p) { return p.id; }).join(',');
    if (sig !== edSig) {
      // לו"ז עדכני: הוציאו או הוסיפו קו — העריכות (הצורה, "טבלה לפי יעד", הכותרת, מה שנמחק או הוסר) עוברות לרשימה החדשה
      var had = null; try { had = localStorage.getItem('lc-ed2:' + sig); } catch (x) {}
      var carry = !had && /^tt-/.test(edSig) && edits && pages.length && pages.every(function (p) { return p.kind === 'current'; }) ? JSON.parse(JSON.stringify(edits)) : null;
      edSig = sig; edits = carry ? normEdits(carry) : loadEdits(sig);
      if (carry) saveEdits();
    }
    // נבחרו כל הקווים במקום (לו"ז עדכני) — "טבלה לפי יעד", עם שם המקום בכותרת
    if (wantBoard && pages.every(function (p) { return p.kind === 'current'; })) { if (!edits.tv && !edits.ttc) edits.tv = 'board'; if (!edits.bplace && wantBoard.nm) edits.bplace = wantBoard.nm; if (wantBoard.pl) edits.bpl = wantBoard.pl; saveEdits(); }
    wantBoard = null;
    var form = formOf();
    var base = LCDeck.build(pages, deckCity(pages), edOpts(form));
    pastTense(base, pages);
    drawKinds(pages);
    ttUi(pages); zmUi(pages); rcUi(pages); a4Ui(form); fnUi();
    slides = [];
    base.forEach(function (s) {
      slides.push(s);
      edits.xslides.filter(function (x) { return x.after === s.id && xOk(x, form); }).forEach(function (x) { slides.push(xSlide(x, pages)); });
    });
    edits.xslides.filter(function (x) { return xOk(x, form) && !base.some(function (s) { return s.id === x.after; }); }).forEach(function (x) {
      if (form === 'deck') slides.splice(slides.length - 1, 0, xSlide(x, pages)); else slides.push(xSlide(x, pages));
    });
    var deck = $('deck'), look = edits.look || 'kav';
    deck.setAttribute('data-look', look);
    $('decktitle').textContent = LCDeck.deckTitle(pages);
    deck.setAttribute('data-form', form);
    deck.setAttribute('data-tord', tordOf());   // סדר השעות ברשימות (CSS ב-slides.css)
    formUi(form);
    deck.style.cssText = LCDeck.lookVars(look, pages);
    $('looks').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-look') === look ? 'true' : 'false'); });
    var opv = LCDeck.lookVars('op', pages).match(/--s-brand:([^;]+);.*--s-band:([^;]+)/);
    if (opv) $('swop').style.background = 'linear-gradient(to bottom,' + opv[2] + ' 0 45%,' + opv[1] + ' 45% 62%,#fff 62%)';
    deck.innerHTML = slides.map(function (s, i) {
      var off = !!edits.off[s.id];
      return '<div class="sitem' + (off ? ' off' : '') + '" data-id="' + E(s.id) + '"' + (off && !editMode ? ' hidden' : '') + '>' +
        '<div class="ebar noprint"><span class="ebar-n">' + E(s.label) + '</span>' +
          '<button type="button" data-act="box">+ תיבת טקסט</button>' +
          '<button type="button" data-act="img" aria-label="הוספת תמונה לשקף הזה">+ תמונה</button>' +
          '<button type="button" data-act="ximg" aria-label="שקף חדש עם תמונה על כל השקף, אחרי השקף הזה">+ שקף תמונה</button>' +
          // מפה: הגדלה, הקטנה ואיפוס — בשורה הזו, לא על המפה (גרירה וצביטה — על המפה עצמה)
          (s.map ? '<button type="button" data-act="mzin" aria-label="הגדלת המפה">הגדלה +</button><button type="button" data-act="mzout" aria-label="הקטנת המפה">הקטנה −</button>' +
            '<button type="button" data-act="mreset">איפוס מפה</button>' : '') +
          (s.img ? '<button type="button" data-act="imgalt">תיאור התמונה</button>' : '') +
          (s.img ? '<button type="button" data-act="fit" aria-pressed="' + (s.fit === 'contain' ? 'true' : 'false') + '">' + (s.fit === 'contain' ? 'כל התמונה בשקף' : 'התמונה ממלאת את השקף') + '</button>' : '') +
          '<button type="button" data-act="' + (s.custom ? 'xdel' : 'off') + '">' + (s.custom ? 'מחיקת השקף' : off ? 'להחזיר את השקף' : 'לא לכלול את השקף') + '</button></div>' +
        '<div class="sframe" data-id="' + E(s.id) + '"><div class="slide" aria-label="' + E(s.label) + '">' + s.html + '</div>' +
          '<div class="toolong-msg noprint" role="status">הטקסט ארוך מדי לשקף — קצרו אותו</div>' +
          (off ? '<div class="offmsg noprint">השקף הזה לא ייכלל במצגת</div>' : '') + '</div>' +
        '<div class="addslide noprint"><button type="button" data-act="xadd">+ שקף טקסט כאן</button></div></div>';
    }).join('');
    $('toggles').innerHTML = slides.map(function (s) {
      return '<label><input type="checkbox" value="' + E(s.id) + '"' + (edits.off[s.id] ? '' : ' checked') + '><span>' + E(s.label) + '</span></label>';
    }).join('');
    scale();
    slides.forEach(function (s) { LCEdit.apply(frameOf(s.id), s.id, edits); drawImgs(s.id); });
    if (editMode) $('deck').querySelectorAll('.bdt').forEach(function (el) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); });
    // המפות שכבר על המסך (או קרוב אליו) — מיד, כמו קודם; השאר — כשמגיעים אליהן
    var vh = window.innerHeight || 800, now = [];
    slides.forEach(function (s) {
      if (!s.map) return;
      var m = { id: s.id, spec: s.map, fr: frameOf(s.id), map: null, ready: null }, r = m.fr.getBoundingClientRect();
      maps.push(m);
      if (!mapIO || (r.height && r.bottom > -1.5 * vh && r.top < 2.5 * vh)) now.push(m); else mapIO.observe(m.fr);
    });
    now.forEach(buildMap);
    setEdit(editMode);
    number();
  }
  /* מפות: כל מפה נבנית רק כשהשקף שלה מתקרב למסך (עם מרווח נדיב), ולפני PDF / תמונות / הדפסה — כולן */
  var mapIO = window.IntersectionObserver ? new IntersectionObserver(function (ents) {
    ents.forEach(function (e) {
      if (!e.isIntersecting) return;
      mapIO.unobserve(e.target);
      maps.forEach(function (m) { if (m.fr === e.target) buildMap(m); });
    });
  }, { rootMargin: '150% 0px 150% 0px' }) : null;
  function buildMap(m) {
    if (m.map || m.ready) return m;
    if (mapIO) mapIO.unobserve(m.fr);
    try { var r = LCDeck.drawMap(m.fr, m.spec); m.map = r.map; m.ready = r.ready; mapView(m); if (editMode) mapEdit(m, true); }
    catch (e) { if (window.console) console.error('map', e); m.ready = Promise.resolve(); }
    return m;
  }
  /* מפה במצב עריכה: גרירה, צביטה בטלפון וגלגלת על המפה; "הגדלה +", "הקטנה −" ו"איפוס מפה" — בשורת העריכה של השקף.
     התצוגה (מרכז וזום) נשמרת לשקף ב-edits.mv,
     והיא זו שבהורדה (PDF, שלט, סטטוס). מחוץ לעריכה המפה קבועה, כמו קודם */
  function mapView(m) {
    var v = edits.mv[m.id];
    if (v && m.map) m.map.setView([v[0], v[1]], v[2], { animate: false });
  }
  var MAP_H = ['dragging', 'touchZoom', 'scrollWheelZoom', 'doubleClickZoom'];
  function mapEdit(m, on) {
    var mp = m.map; if (!mp || !window.L) return;
    MAP_H.forEach(function (h) { if (mp[h]) { if (on) mp[h].enable(); else mp[h].disable(); } });
    mp.getContainer().classList.toggle('mapedit', on);
    if (on && !m.save) {
      m.save = function () { var c = mp.getCenter(); edits.mv[m.id] = [+c.lat.toFixed(6), +c.lng.toFixed(6), +mp.getZoom().toFixed(2)]; saveEdits(); };
      mp.on('moveend', m.save);
    } else if (!on && m.save) { mp.off('moveend', m.save); m.save = null; }
  }
  function dropMaps() {
    maps.forEach(function (m) { if (mapIO) mapIO.unobserve(m.fr); if (m.map) m.map.remove(); });
    maps = [];
  }
  // המפות של השקפים שייכללו — נבנות עכשיו (אם עוד לא), ומחכים שיהיו מוכנות
  function mapsReady(all) {
    return Promise.all(maps.filter(function (m) { return all || !edits.off[m.id]; }).map(function (m) { return buildMap(m).ready; }));
  }
  window.addEventListener('beforeprint', function () { maps.forEach(function (m) { if (!edits.off[m.id]) buildMap(m); }); });
  // הגדרות המצגת בלשונית שבצד: סוג השינוי, לוח הזמנים, הצורה, העיצוב, השמירה של העריכות — ב-app-settings.js
  var P_settings = LCAppParts["settings"](A);
  function drawKinds() { return P_settings.drawKinds.apply(this, arguments); }
  function frameOf() { return P_settings.frameOf.apply(this, arguments); }
  function ttOpts() { return P_settings.ttOpts.apply(this, arguments); }
  function isCu() { return P_settings.isCu.apply(this, arguments); }
  function syncTv() { return P_settings.syncTv.apply(this, arguments); }
  function zmUi() { return P_settings.zmUi.apply(this, arguments); }
  function a4Ui() { return P_settings.a4Ui.apply(this, arguments); }
  function rcUi() { return P_settings.rcUi.apply(this, arguments); }
  function fnUi() { return P_settings.fnUi.apply(this, arguments); }
  function ttUi() { return P_settings.ttUi.apply(this, arguments); }
  function formOf() { return P_settings.formOf.apply(this, arguments); }
  function dims() { return P_settings.dims.apply(this, arguments); }
  function dlText() { return P_settings.dlText.apply(this, arguments); }
  function formUi() { return P_settings.formUi.apply(this, arguments); }
  function deckCity() { return P_settings.deckCity.apply(this, arguments); }
  function number() { return P_settings.number.apply(this, arguments); }
  function loadEdits() { return P_settings.loadEdits.apply(this, arguments); }
  function saveEdits() { return P_settings.saveEdits.apply(this, arguments); }
  function setEdit() { return P_settings.setEdit.apply(this, arguments); }


  // קרדיט לקו הבוחן בסוף המצגת — בחירה של מי שמכין אותה (נשמרת בדפדפן, ברירת המחדל: כן)
  function creditOn() { try { return localStorage.getItem('lc-credit') !== '0'; } catch (e) { return true; } }
  var crEl = $('credit');
  if (crEl) {
    crEl.checked = creditOn();
    crEl.addEventListener('change', function () { try { localStorage.setItem('lc-credit', crEl.checked ? '1' : '0'); } catch (e) {} if (curPages) keepScroll(function () { render(curPages); }); });
  }
  // מצב עריכה: מפת ההתמצאות, סרגל העריכה, בחירה בלוח זמני הנסיעות (שורה, קו, פס, תא), רוחב העמודות ושחזור — ב-app-edit.js
  var P_edit = LCAppParts["edit"](A);
  function hideBar() { return P_edit.hideBar.apply(this, arguments); }
  function bdOrderNow() { return P_edit.bdOrderNow.apply(this, arguments); }
  function bdColsNow() { return P_edit.bdColsNow.apply(this, arguments); }
  function bdColUi() { return P_edit.bdColUi.apply(this, arguments); }
  function sidOf() { return P_edit.sidOf.apply(this, arguments); }
  function keepScroll() { return P_edit.keepScroll.apply(this, arguments); }


  // תמונות במצגת: קריאה והקטנה, שמירה ב-IndexedDB, גרירה, תיאור, הדבקה — ב-app-images.js
  var P_images = LCAppParts["images"](A);
  function getImg() { return P_images.getImg.apply(this, arguments); }
  function clearImgs() { return P_images.clearImgs.apply(this, arguments); }
  function drawImgs() { return P_images.drawImgs.apply(this, arguments); }
  function imgAct() { return P_images.imgAct.apply(this, arguments); }


  /* עיצוב המצגת — נשמר עם המצגת (יחד עם העריכות) */
  $('looks').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-look]'); if (!b) return;
    edits.look = b.getAttribute('data-look'); saveEdits(); render(curPages);
  });

  /* התצוגה המקדימה: השקף בגודל המלא (1280×720, ובצורות האחרות — הגודל שלהן) מוקטן לרוחב המסגרת */
  function scale() {
    if (!deckOk()) return;
    var W = dims().w, fs = document.querySelectorAll('.sframe'), fw = 0;
    // כל המסגרות באותו רוחב: קוראים פעם אחת (מהמסגרת הראשונה שמוצגת), ואז כותבים לכולן — בלי חישוב פריסה בכל שקף
    for (var i = 0; i < fs.length && !fw; i++) fw = fs[i].clientWidth;
    var k = Math.min(1, (fw || W) / W), t = 'scale(' + k + ')', ik = (1 / k).toFixed(3);
    fs.forEach(function (f) {
      var s = f.querySelector('.slide'); if (!s) return;
      s.style.transform = t;
      s.style.setProperty('--ik', ik);
    });
  }
  if (window.ResizeObserver) new ResizeObserver(scale).observe($('deck'));
  window.addEventListener('resize', scale);

  // הורדה: PDF, תמונות לסטטוס, הדפסה ואקסל — ב-app-export.js
  var P_export = LCAppParts["export"](A);
  function pdfName() { return P_export.pdfName.apply(this, arguments); }

})();
