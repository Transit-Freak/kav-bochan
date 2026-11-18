/* מצגת לשינוי בקו — אשף בשלושה שלבים: איזה קו? · איזה שינוי? · המצגת (עריכה, תצוגה מקדימה, PDF).
   נתונים:
   - data/lines.json   כל הקווים שפועלים עכשיו (לחיפוש), עם השינויים מהשבועיים האחרונים (תאריכים בלבד)
   הכלי מציג רק שינויים שעוד לא התחילו, או שהתחילו בשבועיים האחרונים (שלמה 16.11; שבועיים — 18.11).
   - data/index.json   השינויים הקרובים שזוהו בלילה, וגם אלה שזוהו בלילות הקודמים והתחילו בשבועיים האחרונים
     (started: 1) — עם כל הפרטים ב-data/l/<id>.json, כך שגם להם יש מצגת מלאה
   - ../line-history/data/lines/<rd>.json — קובצי "הקו בזמן", לשינויים מהשבועיים האחרונים שלא זוהו מראש (נטען רק לקו שנבחר)
   כתובת לשיתוף: ?c=<מזהה>[,<מזהה>...] — שינוי קרוב: 10988-20261117 · שינוי שהיה: p-10988-2026-05-01 */
(function () {
  var $ = function (s) { return document.getElementById(s); };
  var E = LC.esc;
  var LH = '../line-history/data/lines/';
  var PAST_KINDS = { route: 1, stops: 1, 'stops-add': 1, 'stops-del': 1, extend: 1, shorten: 1, terminal: 1 };
  var KIND_TXT = { route: 'דרך אחרת ותחנות אחרות', stops: 'שינוי בתחנות', 'stops-add': 'נוספו תחנות', 'stops-del': 'בוטלו תחנות',
    extend: 'הקו הוארך', shorten: 'הקו קוצר', terminal: 'שינוי בתחנה הראשונה או האחרונה' };

  var LINES = [], OPS = [], CITIES = [], idx = { changes: [] }, upByMakat = {};
  var cache = {}, lhCache = {}, picks = [], cur = null, step = 1, q = '';
  /* מה מכינים: 'chg' — הודעה על שינוי · 'tt' — לו"ז עדכני לכל קו (גם בלי שינוי). לכל אחד רשימת קווים משלו */
  var mode = new URLSearchParams(location.search).get('m') === 'tt' ? 'tt' : 'chg', picksBy = { chg: [], tt: [] };
  var slides = [], maps = [], token = 0, curPages = [];
  var edits = { t: {}, add: {}, boxes: {}, xslides: [], off: {} }, edSig = '';

  /* ---------- טעינה ---------- */
  Promise.all([LC.getJSON('data/lines.json'), LC.getJSON('data/index.json')]).then(function (r) {
    var li = r[0]; idx = r[1];
    OPS = li.ops; CITIES = li.cities;
    var OPIDS = li.op_ids || [];
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
    var want = (sp.get('c') || '').split(',').filter(Boolean).map(resolveId).filter(Boolean), fromUrl = want.length > 0;
    var ss = sessGet(), other = mode === 'tt' ? 'chg' : 'tt';
    if (!fromUrl) want = ss[mode] || [];
    Promise.all(want.map(loadPick).concat([Promise.all((ss[other] || []).map(loadPick))])).then(function (ps) {
      picksBy[other] = ps.pop().filter(Boolean);
      picks = picksBy[mode] = ps.filter(Boolean);
      modeUi();
      var lm = sp.get('l'), ll = lm && lineOf(lm);
      if (fromUrl && picks.length) { cur = lineOf(picks[picks.length - 1].makat, picks[picks.length - 1].op); go(3, 'replace'); }
      else if (ll) { cur = ll; go(2, 'replace'); }
      else go(1, 'replace');
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
    if (step === 2 && cur) sp.push('l=' + cur.makat);
    if (kindF !== 'all' && mode !== 'tt') sp.push('k=' + KF_URL[kindF]);
    if (mode === 'tt') sp.unshift('m=tt');
    var url = sp.length ? '?' + sp.join('&') : location.pathname;
    try { history[how === 'push' ? 'pushState' : 'replaceState']({ s: step, l: cur && cur.makat, op: cur && cur.op }, '', url); } catch (e) {}
    sessSet();
  }
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
     (r שינוי מסלול · n קו חדש · e קו מבוטל · t לו"ז). מזהים ארוכים (27018-20261118-t, p-...) — עובדים כמו קודם */
  var KL = { '': 'r', '-n': 'n', '-e': 'e', '-t': 't' };
  function idParts(id) { var m = String(id).match(/^(\d+)-(\d{8})(-[net])?$/); return m ? { mk: m[1], md: m[2].slice(4), k: KL[m[3] || ''] } : null; }
  function shortId(id) {
    if (/^tt-/.test(id)) return id.slice(3);
    var a = idParts(id); if (!a) return id;
    var same = idx.changes.map(function (c) { return idParts(c.id); }).filter(function (b) { return b && b.mk === a.mk; });
    if (same.length <= 1) return a.mk;
    var sd = same.filter(function (b) { return b.md === a.md; });
    return a.mk + '.' + a.md + (sd.length > 1 ? a.k : '');
  }
  function resolveId(tok) {
    if (mode === 'tt') return /^(tt-)?[\w]+$/.test(tok) ? 'tt-' + String(tok).replace(/^tt-/, '') : null;
    var m = String(tok).match(/^(\d+)(?:\.(\d{4}))?([rnet])?$/);
    if (!m) return tok;
    var hit = idx.changes.filter(function (c) { var b = idParts(c.id); return b && b.mk === m[1] && (!m[2] || b.md === m[2]) && (!m[3] || b.k === m[3]); });
    return hit.length ? hit[0].id : null;
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
        return function (x) { var c = String(p.cities[x[1]]).replace(/''/g, '"'); return { kind: kind, name: x[0], city: c, lines: x[2], n: LC.norm(x[0]), nc: LC.norm(c) }; };
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
    return '<button type="button" class="res" data-i="' + LINES.indexOf(l) + '"><span class="badge">' + E(l.line) + '</span>' +
      '<span class="t"><span class="od">' + E(l.from) + ' ↔ ' + E(l.to) + '</span><span class="meta">' + E(l.op) +
      (l.cities.length ? ' · ' + E(l.cities.slice(0, 3).join(', ')) + (l.cities.length > 3 ? '…' : '') : '') + '</span></span>' + badge(l) + '</button>';
  }
  var SIGS = {};
  function groupRow(sig, ls) {
    SIGS[sig] = ls;
    var c = upK(ls[0]) || upNext(ls[0]), s = c.formal || c.eff, ops = [], cs = [];
    ls.forEach(function (l) { if (ops.indexOf(l.op) < 0) ops.push(l.op); l.cities.forEach(function (x) { if (cs.indexOf(x) < 0) cs.push(x); }); });
    var nums = ls.map(function (l) { return l.line; });
    return '<button type="button" class="res grpres" data-sig="' + E(sig) + '"><span class="badges">' +
      nums.slice(0, 6).map(function (n) { return '<span class="badge">' + E(n) + '</span>'; }).join('') + (nums.length > 6 ? '<span class="more">+' + (nums.length - 6) + '</span>' : '') +
      '</span><span class="t"><span class="od">אותו שינוי ב-' + ls.length + ' קווים' + (c.summary ? ' · ' + E(c.summary) : '') + '</span>' +
      '<span class="meta">' + E(ops.slice(0, 3).join(', ')) + (cs.length ? ' · ' + E(cs.slice(0, 3).join(', ')) + (cs.length > 3 ? '…' : '') : '') + '</span></span>' +
      tagOf(c) + '</button>';
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
    $('qhint').textContent = tt ? 'מספר קו, עיר או חברה. קווים לאותו יעד יוצעו יחד.' : 'מספר קו, רחוב, שכונה, עיר או חברה.';
    $('chiprow').style.display = tt ? 'none' : ''; $('kfil').style.display = tt ? 'none' : '';
    $('q').placeholder = tt ? 'למשל 494, אופקים ירושלים, גלים' : 'למשל 988, הרצל, קרית חב"ד';
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
    return '<button type="button" class="res" data-tt="' + LINES.indexOf(l) + '"><span class="badge">' + E(l.line) + '</span>' +
      '<span class="t"><span class="od">' + E(l.from) + ' ↔ ' + E(l.to) + '</span><span class="meta">' + E(l.op) +
      (l.cities.length ? ' · ' + E(l.cities.slice(0, 3).join(', ')) + (l.cities.length > 3 ? '…' : '') : '') + '</span></span><span class="tag soon">לו״ז עדכני</span></button>';
  }
  function ttGroupRow(k) {
    var ls = TTG[k], l = ls[0];
    return '<button type="button" class="res grpres" data-ttg="' + E(k) + '"><span class="badges">' + ls.map(function (x) { return '<span class="badge">' + E(x.line) + '</span>'; }).join('') + '</span>' +
      '<span class="t"><span class="od">לו״ז משולב · ' + E(l.from) + ' ↔ ' + E(l.to) + '</span><span class="meta">' + E(l.op) + ' · ' + ls.length + ' קווים לאותו יעד, בטבלה אחת</span></span>' +
      '<span class="tag new">מומלץ</span></button>';
  }
  function drawResultsTT() {
    var nq = LC.norm(q);
    $('reshead').textContent = '';
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
    var html = gs.slice(0, 4).map(ttGroupRow).join('') + lines.slice(0, 60).map(ttRow).join('');
    $('results').scrollTop = 0;
    $('results').innerHTML = html || '<div class="none">לא מצאנו. נסו מספר קו, עיר או חברה.</div>';
  }
  /* הלו"ז העדכני של קו: data/tt/<מק"ט % 64>.json (נבנה כל לילה) */
  var ttShards = {};
  function ttShard(mk) {
    var d = String(mk).replace(/\D/g, ''), i = d ? parseInt(d, 10) % 64 : String(mk).split('').reduce(function (t, c) { return t + c.charCodeAt(0); }, 0) % 64;
    return ttShards[i] || (ttShards[i] = LC.getJSON('data/tt/' + i + '.json').catch(function () { delete ttShards[i]; return null; }));
  }
  function ttPick(mk) {
    return ttShard(mk).then(function (sh) {
      var e = sh && sh.lines[mk]; if (!e) return null;
      var l = lineOf(mk), dirs = Object.keys(e.d).sort().map(function (k) {
        var r = e.d[k], x = {};
        Object.keys(r.x || {}).forEach(function (iso) { x[iso] = r.L[r.x[iso]]; });
        return { dir: k, od: r.od, f: r.f, t: r.t, cs: r.cs, du: r.du, days: r.w.map(function (i) { return r.L[i] || []; }), x: x };
      });
      return { id: 'tt-' + mk, kind: 'current', line: e.l, op: e.o, ag: e.a, makat: mk, od: l ? [l.from, l.to] : (dirs[0] || {}).od || ['', ''],
        eff: sh.valid, valid: sh.valid, gen: sh.gen, feed: sh.feed, hol: sh.hol || [], dirs: dirs, tot: { kind: 'current' } };
    });
  }
  $('results').addEventListener('click', function (ev) {
    var b = ev.target.closest('.res'); if (!b) return;
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
    if (ev.target.id === 'plall') addAll(PLROWS, ev.target);
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
        kind: c.kind, last: c.last, summary: c.summary, kchip: many && !c.kind });
    }).join('');
    // שינוי מהארכיון שכבר יש לו רישום מלא (גם לפי התאריך של כיוון אחד) — פעם אחת
    var pastEv = clusterPast(recentPast(l)).filter(function (g) {
      return !l.up.some(function (c) { return !c.kind && [c.formal || c.eff].concat(c.dirs.map(function (d) { return d.eff; })).some(function (x) { return x && Math.abs(LC.daysBetween(x, g.d)) <= 3; }); });
    });
    html += pastEv.map(function (g) {
      return card({ key: 'p-' + l.makat + '-' + g.d, date: g.d, past: true, kinds: g.kinds, dirs: g.rests.length });
    }).join('');
    if (!up.length && !pastEv.length) {
      $('cards').innerHTML = '<div class="none">אין שינוי בקו הזה בשבועיים הקרובים או בשבועיים האחרונים.</div>';
      return;
    }
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
  function card(c) {
    if (c.kind && KIND_LBL[c.kind]) {
      var d = c.kind === 'ended' ? (c.last || LC.addDays(c.date, -1)) : c.date;
      return '<button type="button" class="ccard" data-key="' + E(c.key) + '">' +
        '<span class="when"><span class="l">' + KIND_LBL[c.kind][c.soon ? 0 : 1] + '</span><b>' + E(LC.wd(d) + ' ' + LC.dmy(d)) + '</b>' +
        '<span class="l">' + E(LC.rel(idx.gen, d)) + '</span></span>' +
        '<span class="what"><span class="chips">' + LC.chips(c.tot || { kind: c.kind }) + '</span>' +
        '<span class="size">' + E(c.kind === 'timetable' ? String(c.summary || '').replace(/^שינוי בלוח הזמנים:?\s*/, '') : '') + '</span>' +
        '<span class="meta">' + E(KIND_META[c.kind]) + ' · ' + (c.dirs > 1 ? 'הלוך וחזור' : 'רק בנסיעה לצד אחד') + '</span></span>' +
        '<span class="pick-arrow" aria-hidden="true">←</span></button>';
    }
    var lbl = c.past ? 'היה ב' : (c.soon ? 'בקרוב' : 'נכנס לתוקף');
    var chips = (c.kchip ? '<span class="chip kd">שינוי מסלול</span>' : '') + (c.tot ? LC.chips(c.tot) : '<span class="chip mv">טוען…</span>');
    var kinds = c.kinds ? Object.keys(c.kinds).map(function (k) { return KIND_TXT[k] || k; }).join(' · ') : '';
    return '<button type="button" class="ccard' + (c.past ? ' past' : '') + '" data-key="' + E(c.key) + '">' +
      '<span class="when"><span class="l">' + lbl + '</span><b>' + E(LC.wd(c.date) + ' ' + LC.dmy(c.date)) + '</b>' +
      (c.past ? '' : '<span class="l">' + E(LC.rel(idx.gen, c.date)) + '</span>') + '</span>' +
      '<span class="what"><span class="chips">' + chips + '</span>' +
      '<span class="size">' + (c.size == null ? '' : c.size ? 'שינוי קטן — עמוד אחד' : 'שינוי גדול — מצגת מלאה') + '</span><span class="meta">' + (kinds ? E(kinds) + ' · ' : '') +
      (c.dirs > 1 ? 'הלוך וחזור' : 'רק בנסיעה לצד אחד') + (c.past ? ' · מהארכיון' : '') + '</span></span>' +
      '<span class="pick-arrow" aria-hidden="true">←</span></button>';
  }
  $('cards').addEventListener('click', function (ev) {
    var b = ev.target.closest('.ccard'); if (!b) return;
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
    p.dirs.forEach(function (d) {
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
    return LC.getJSON('data/l/' + encodeURIComponent(key) + '.json').then(function (p) { return (cache[key] = normPage(p)); }).catch(function () { return null; });
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
    return Promise.all(rests.map(function (r) { return lhFile(makat + '-' + r); })).then(function (files) {
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
      return '<span class="pk"><span class="badge">' + E(p.line) + '</span><span>' + E(when) + '</span>' +
        (picks.length > 1 ? '<button type="button" data-rm="' + i + '" aria-label="להוציא את קו ' + E(p.line) + ' מהמצגת">×</button>' : '') + '</span>';
    }).join('') + (showN < picks.length ? '<button type="button" class="pk pkmore" data-more="1" aria-expanded="false">ועוד ' + (picks.length - showN) + ' ▾</button>' : '');
  }
  $('picked').addEventListener('click', function (ev) {
    if (ev.target.closest('[data-more]')) { pkOpen = true; drawPicked(); return; }
    var b = ev.target.closest('[data-rm]'); if (!b) return;
    picks.splice(+b.getAttribute('data-rm'), 1);  rebuild();
  });


  function rebuild() {
    var my = ++token;
    drawPicked();
    if (step === 3) setUrl('replace');
    if (!picks.length) { emptyStage(); return; }
    var pages = picks.slice().sort(function (a, b) { return (parseInt(a.line, 10) || 0) - (parseInt(b.line, 10) || 0); });
    if (my === token) render(pages);
  }

  /* ---------- המצגת: בנייה, עריכות, תצוגה ---------- */
  var editMode = false;
  function normEdits(e) {
    e = e && typeof e === 'object' ? e : {};
    e.t = e.t || {}; e.add = e.add || {}; e.boxes = e.boxes || {}; e.xslides = e.xslides || []; e.off = e.off || {}; e.modes = e.modes || {}; e.hide = e.hide || {};
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
  function render(pages) {
    curPages = pages;
    maps.forEach(function (m) { m.map.remove(); });
    maps = [];
    var sig = pages.map(function (p) { return p.id; }).join(',');
    if (sig !== edSig) { edSig = sig; edits = loadEdits(sig); }
    var form = formOf();
    var base = LCDeck.build(pages, deckCity(pages), { look: edits.look, modes: edits.modes, credit: creditOn(), form: form, tt: ttOpts(), ttc: edits.ttc, ttper: edits.ttper !== false, hol: idx.hol || [] });
    pastTense(base, pages);
    drawKinds(pages);
    ttUi(pages);
    slides = [];
    base.forEach(function (s) {
      slides.push(s);
      if (form === 'deck') edits.xslides.filter(function (x) { return x.after === s.id; }).forEach(function (x) { slides.push(textSlide(x, pages)); });
    });
    if (form === 'deck') edits.xslides.filter(function (x) { return !base.some(function (s) { return s.id === x.after; }); }).forEach(function (x) { slides.splice(slides.length - 1, 0, textSlide(x, pages)); });
    var deck = $('deck'), look = edits.look || 'kav';
    deck.setAttribute('data-look', look);
    $('decktitle').textContent = LCDeck.deckTitle(pages);
    deck.setAttribute('data-form', form);
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
    slides.forEach(function (s) { LCEdit.apply(frameOf(s.id), s.id, edits); });
    slides.forEach(function (s) {
      if (!s.map) return;
      maps.push(Object.assign({ id: s.id }, LCDeck.drawMap(frameOf(s.id), s.map)));
    });
    setEdit(editMode);
    number();
  }
  /* שינוי קטן — עמוד אחד; שינוי גדול — מצגת מלאה. אפשר להחליף לכל קו */
  function drawKinds(pages) {
    $('kinds').innerHTML = pages.filter(function (p) { return !p.kind; }).map(function (p) {
      var info = LCDeck.smallInfo(p), m = edits.modes[p.id], one = m ? m === 'one' : info.small;
      return '<div class="kind"><span class="badge">' + E(p.line) + '</span><span class="kt"><b>' + (info.small ? 'שינוי קטן' : 'שינוי גדול') + '</b> — ' +
        (one ? 'עמוד אחד' : 'מצגת מלאה') + (m ? ' (לפי הבחירה שלכם)' : '') + '</span>' +
        '<button type="button" class="lnk" data-kind="' + E(p.id) + '" data-to="' + (one ? 'full' : 'one') + '">' + (one ? 'להפוך למצגת מלאה' : 'לעמוד אחד') + '</button></div>';
    }).join('');
  }
  $('kinds').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-kind]'); if (!b) return;
    var id = b.getAttribute('data-kind'), to = b.getAttribute('data-to');
    var p = curPages.filter(function (x) { return x.id === id; })[0];
    if (p && (to === 'one') === LCDeck.smallInfo(p).small) delete edits.modes[id]; else edits.modes[id] = to;
    saveEdits(); render(curPages);
  });
  function frameOf(id) { return $('deck').querySelector('.sframe[data-id="' + CSS.escape(id) + '"]'); }

  /* לוח הזמנים (קו חדש ושינוי בלו"ז): כללי / מפורט, טבלה / טקסט — נשמר עם המצגת, כמו העיצוב */
  // לו"ז עדכני — ברירת המחדל: מפורט (כל השעות); הודעה על שינוי — כללי
  function ttOpts() { var t = edits.tt || {}, v = t.v || (curPages && curPages.length && curPages.every(function (p) { return p.kind === 'current'; }) ? 'det' : 'gen'); return { v: v === 'det' ? 'det' : 'gen', f: t.f === 'text' ? 'text' : 'table' }; }
  function ttUi(pages) {
    // שינוי קטן בלו"ז מוצג תמיד כטקסט — הבחירה מופיעה רק כשיש במצגת קו חדש או שינוי גדול יותר
    var cu = pages.some(function (p) { return p.kind === 'current'; }), o = ttOpts();
    var on = cu || pages.some(function (p) { return (p.kind === 'timetable' && !LCDeck.ttSmall(p)) || p.kind === 'new'; });
    $('ttgrp').hidden = !on;
    $('ttfseg').hidden = cu;
    $('ttcseg').hidden = !cu || pages.length < 2;
    if (cu) {
      var to = []; pages.forEach(function (p) { var d = (p.od || [])[1]; if (d && to.indexOf(d) < 0) to.push(d); });
      $('ttcsub').textContent = to.length === 1 ? 'כל השעות ל' + to[0] + ' בטבלה אחת' : 'קווים לאותו יעד בטבלה אחת';
      $('ttcseg').querySelectorAll('[data-ttc]').forEach(function (b) { b.setAttribute('aria-checked', (edits.ttc === 'sep' ? 'sep' : 'comb') === b.getAttribute('data-ttc') ? 'true' : 'false'); });
    }
    var multi = !cu && formOf() === 'deck' && pages.filter(function (p) { return (p.kind === 'timetable' || p.kind === 'new') && p.dirs.some(function (d) { return d.tt && d.tt.length; }); }).length > 1;
    $('ttperw').hidden = !multi;
    $('ttper').checked = edits.ttper !== false;
    $('ttgrp').querySelectorAll('[data-ttv]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-ttv') === o.v ? 'true' : 'false'); });
    $('ttgrp').querySelectorAll('[data-ttf]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-ttf') === o.f ? 'true' : 'false'); });
  }
  $('ttper').addEventListener('change', function () { edits.ttper = this.checked; saveEdits(); keepScroll(function () { render(curPages); }); });
  $('ttgrp').addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-ttc]');
    if (c) { edits.ttc = c.getAttribute('data-ttc') === 'sep' ? 'sep' : undefined; saveEdits(); keepScroll(function () { render(curPages); }); return; }
    var b = ev.target.closest('[data-ttv],[data-ttf]'); if (!b) return;
    var o = ttOpts();
    if (b.hasAttribute('data-ttv')) o.v = b.getAttribute('data-ttv'); else o.f = b.getAttribute('data-ttf');
    edits.tt = o; saveEdits(); keepScroll(function () { render(curPages); });
  });

  /* צורה: מצגת (16:9) · שלט להדפסה (A4 לאורך) · סטטוס (9:16). נשמרת עם המצגת, כמו העיצוב */
  var FORM_TXT = {
    deck: { one: 'שקף אחד', many: ' שקפים', dl: 'הורדת PDF', hint: 'קובץ PDF, שקף בכל עמוד.', credit: 'להוסיף קרדיט לקו הבוחן בסוף המצגת' },
    sign: { one: 'עמוד אחד', many: ' עמודים', dl: 'הורדת PDF', hint: 'קובץ PDF בגודל A4 לאורך, שלט בכל עמוד — להדפסה ולתלייה.', credit: 'להוסיף קרדיט לקו הבוחן בתחתית השלט' },
    status: { one: 'תמונה אחת', many: ' תמונות', dl: 'הורדת תמונות', dl1: 'הורדת תמונה', hint: 'תמונה (PNG) בגודל של סטטוס בווטסאפ, לכל שינוי.', credit: 'להוסיף את הכתובת של הקו הבוחן לתמונה' }
  };
  function formOf() { var f = edits.form; return FORM_TXT[f] ? f : 'deck'; }
  function dims() { return LCDeck.FORMS[formOf()]; }
  function dlText() { var t = FORM_TXT[formOf()]; return t.dl1 && slidesOn() === 1 ? t.dl1 : t.dl; }
  function slidesOn() { return slides.filter(function (s) { return !edits.off[s.id]; }).length; }
  function formUi(form) {
    var t = FORM_TXT[form], d = LCDeck.FORMS[form];
    $('forms').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-form') === form ? 'true' : 'false'); });
    $('kindgrp').style.display = form === 'deck' && curPages.some(function (p) { return !p.kind; }) ? '' : 'none';
    $('dlhint').textContent = t.hint;
    $('creditlbl').textContent = t.credit;
    document.querySelectorAll('.printwrap,.dock .printbtn').forEach(function (x) { x.style.display = form === 'status' ? 'none' : ''; });
    if (!busy) [$('dl'), $('dl2')].forEach(function (b) { b.querySelector('span').textContent = t.dl; });
    document.querySelectorAll('.pngs').forEach(function (x) { if (x.getAttribute('data-form') !== form) { x.hidden = true; x.innerHTML = ''; } });
    // גודל העמוד בהדפסה רגילה
    var st = $('pagesz') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesz' }));
    st.textContent = form === 'deck' ? '' : '@page{size:' + d.w + 'px ' + d.h + 'px;margin:0}';
  }
  $('forms').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-form]'); if (!b) return;
    edits.form = b.getAttribute('data-form'); if (edits.form === 'deck') delete edits.form;
    saveEdits(); render(curPages);
  });

  /* עיר למצגת של כמה קווים: העיר שמשותפת לכל הקווים */
  function deckCity(pages) {
    if (pages.length < 2) return '';
    var lists = pages.map(function (p) { var l = lineOf(p.makat, p.op); return (p.chcities && p.chcities.length ? p.chcities : []).concat(l ? l.cities : []); });
    var common = lists[0].filter(function (c) { return lists.every(function (x) { return x.indexOf(c) >= 0; }); });
    return common[0] || '';
  }

  $('toggles').addEventListener('change', function (ev) {
    edits.off[ev.target.value] = !ev.target.checked;
    if (!edits.off[ev.target.value]) delete edits.off[ev.target.value];
    saveEdits(); render(curPages);
  });

  function number() {
    var vis = Array.prototype.filter.call(document.querySelectorAll('.sitem'), function (f) { return !f.classList.contains('off'); });
    vis.forEach(function (f, i) { f.classList.toggle('lastvis', i === vis.length - 1); f.querySelectorAll('.pg').forEach(function (p) { p.textContent = (i + 1) + ' / ' + vis.length; }); });
    var ft = FORM_TXT[formOf()];
    $('pcount').textContent = vis.length === 1 ? ft.one : vis.length + ft.many;
    if (!busy) [$('dl'), $('dl2')].forEach(function (b) { b.querySelector('span').textContent = dlText(); });
    $('tgcount').textContent = '(' + vis.length + ' מתוך ' + slides.length + ')';
  }

  /* ---------- עריכה במקום ---------- */
  function loadEdits(sig) {
    try { return normEdits(JSON.parse(localStorage.getItem('lc-ed2:' + sig) || 'null')); } catch (x) { return normEdits(null); }
  }
  var saveT = 0;
  function saveEdits() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { try { localStorage.setItem('lc-ed2:' + edSig, JSON.stringify(edits)); } catch (x) {} }, 250);
  }
  function setEdit(on) {
    editMode = on;
    document.body.classList.toggle('editing', on);
    ['editbtn', 'editbtn2'].forEach(function (id) {
      var b = $(id); if (!b) return;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('span').textContent = on ? 'סיום העריכה' : 'עריכת הטקסט';
    });
    $('deck').querySelectorAll('.edt,.tbox-t').forEach(function (el) {
      if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); } else el.removeAttribute('contenteditable');
    });
    $('deck').querySelectorAll('.sitem.off').forEach(function (it) { it.hidden = !on; });
    if (!on) hideBar();
  }
  ['editbtn', 'editbtn2'].forEach(function (id) {
    $(id).addEventListener('click', function () {
      setEdit(!editMode);
      if (editMode && id === 'editbtn2') { var f = $('deck'); f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  // קרדיט לקו הבוחן בסוף המצגת — בחירה של מי שמכין אותה (נשמרת בדפדפן, ברירת המחדל: כן)
  function creditOn() { try { return localStorage.getItem('lc-credit') !== '0'; } catch (e) { return true; } }
  var crEl = $('credit');
  if (crEl) {
    crEl.checked = creditOn();
    crEl.addEventListener('change', function () { try { localStorage.setItem('lc-credit', crEl.checked ? '1' : '0'); } catch (e) {} if (curPages) keepScroll(function () { render(curPages); }); });
  }
  // סימן (מספר, נקודה, צבע במקרא): במצב עריכה לחיצה מסתירה אותו, ולחיצה נוספת מחזירה
  $('deck').addEventListener('click', function (ev) {
    var m = ev.target.closest('.emark'); if (!m || !editMode) return;
    ev.preventDefault();
    var id = m.getAttribute('data-mk'); edits.hide = edits.hide || {};
    if (edits.hide[id]) delete edits.hide[id]; else edits.hide[id] = 1;
    m.classList.toggle('mkoff', !!edits.hide[id]);
    saveEdits();
  });
  // סרגל קטן ליד הטקסט שעורכים
  var bar = document.createElement('div');
  bar.id = 'etb'; bar.className = 'etb noprint'; bar.hidden = true;
  bar.innerHTML = '<button type="button" data-t="del">מחיקה</button><button type="button" data-t="add">+ שורה אחרי</button><button type="button" data-t="reset">שחזור</button>';
  document.body.appendChild(bar);
  var curEl = null;
  function showBar(el) {
    curEl = el;
    var r = el.getBoundingClientRect(), isBox = el.classList.contains('tbox-t');
    bar.querySelector('[data-t="add"]').hidden = isBox;
    bar.querySelector('[data-t="reset"]').hidden = isBox || !(el.classList.contains('edited'));
    bar.querySelector('[data-t="del"]').textContent = isBox ? 'מחיקת התיבה' : 'מחיקה';
    bar.hidden = false;
    var top = r.top - bar.offsetHeight - 6;
    if (top < 60) top = r.bottom + 6;
    bar.style.top = Math.max(8, top) + 'px';
    bar.style.left = Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, r.left + r.width / 2 - bar.offsetWidth / 2)) + 'px';
  }
  function hideBar() { bar.hidden = true; curEl = null; }
  $('deck').addEventListener('focusin', function (ev) {
    var el = ev.target.closest('.edt,.tbox-t');
    if (el && editMode) showBar(el);
  });
  document.addEventListener('mousedown', function (ev) {
    if (!bar.hidden && !ev.target.closest('#etb') && !ev.target.closest('.edt,.tbox-t')) hideBar();
  });
  window.addEventListener('scroll', function () { if (curEl && !bar.hidden) showBar(curEl); }, { passive: true });
  function sidOf(el) { return el.closest('.sframe').getAttribute('data-id'); }
  function splitAdd(id) { var m = id.match(/^(.*)\+(\d+)$/); return m ? { base: m[1], i: +m[2] } : null; }
  $('deck').addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.classList.contains('tbox-t')) {
      var sid = sidOf(el), id = el.getAttribute('data-boxt');
      (edits.boxes[sid] || []).forEach(function (b) { if (b.id === id) b.text = el.innerText; });
    } else if (el.classList.contains('edt')) {
      var eid = el.getAttribute('data-eid'), ad = splitAdd(eid);
      if (ad) { (edits.add[ad.base] = edits.add[ad.base] || [])[ad.i] = el.innerText; }
      else { edits.t[eid] = el.innerText; el.classList.add('edited'); }
    } else return;
    saveEdits();
    LCEdit.fit(el.closest('.sframe'));
    // בשלט ובסטטוס המפה ממלאת את המקום שנשאר — טקסט ארוך או קצר יותר משנה את הגודל שלה
    var fsid = sidOf(el);
    maps.forEach(function (m) { if (m.id === fsid) m.map.invalidateSize({ pan: false }); });
    showBar(el);
  });
  // מחקו את כל הטקסט בהקלדה: כשיוצאים מהשדה — השורה יורדת, יחד עם הסימן שלידה
  $('deck').addEventListener('focusout', function (ev) {
    var el = ev.target;
    if (!editMode || !el.classList || !el.classList.contains('edt') || el.innerText.trim()) return;
    setTimeout(function () { keepScroll(function () { render(curPages); }); }, 0);
  });
  bar.addEventListener('mousedown', function (ev) { ev.preventDefault(); });   // לא לאבד את הפוקוס בטקסט
  bar.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b || !curEl) return;
    var t = b.getAttribute('data-t'), el = curEl, sid = sidOf(el);
    if (el.classList.contains('tbox-t')) {
      if (t === 'del') { var id = el.getAttribute('data-boxt'); edits.boxes[sid] = (edits.boxes[sid] || []).filter(function (x) { return x.id !== id; }); saveEdits(); el.closest('.tbox').remove(); hideBar(); }
      return;
    }
    var eid = el.getAttribute('data-eid'), ad = splitAdd(eid), focusId = null;
    if (t === 'del') {
      if (ad) edits.add[ad.base].splice(ad.i, 1);
      else edits.t[eid] = null;
    } else if (t === 'add') {
      if (ad) { edits.add[ad.base].splice(ad.i + 1, 0, 'טקסט חדש'); focusId = ad.base + '+' + (ad.i + 1); }
      else { (edits.add[eid] = edits.add[eid] || []).unshift('טקסט חדש'); focusId = eid + '+0'; }
    } else if (t === 'reset') { delete edits.t[eid]; }
    saveEdits(); hideBar(); keepScroll(function () { render(curPages); });
    if (focusId) {
      var n = $('deck').querySelector('[data-eid="' + CSS.escape(focusId) + '"]');
      if (n) { n.focus(); selectAll(n); }
    }
  });
  function selectAll(el) { try { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  // פעולות על שקף: תיבת טקסט, לא לכלול / להחזיר, שקף טקסט חדש
  $('deck').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b) return;
    var sid = b.closest('.sitem').getAttribute('data-id'), act = b.getAttribute('data-act');
    if (act === 'box') {
      var D0 = dims(), box = { id: 'b' + Date.now().toString(36), x: 80, y: Math.round(D0.h * 0.72), w: Math.min(520, D0.w - 160), text: 'טקסט חדש' };
      (edits.boxes[sid] = edits.boxes[sid] || []).push(box);
      saveEdits();
      var el = LCEdit.boxEl(box);
      frameOf(sid).querySelector('.slide').appendChild(el);
      var t = el.querySelector('.tbox-t'); t.setAttribute('contenteditable', 'true'); t.focus(); selectAll(t);
      return;
    }
    if (act === 'off') { if (edits.off[sid]) delete edits.off[sid]; else edits.off[sid] = true; }
    else if (act === 'xdel') { edits.xslides = edits.xslides.filter(function (x) { return x.id !== sid; }); }
    else if (act === 'xadd') {
      var nid = 'x' + Date.now().toString(36);
      edits.xslides.push({ id: nid, after: sid });
      if (!editMode) setEdit(true);
    }
    saveEdits(); keepScroll(function () { render(curPages); });
  });
  // גרירת תיבת טקסט (בקואורדינטות של השקף, 1280×720)
  $('deck').addEventListener('pointerdown', function (ev) {
    var h = ev.target.closest('.tbox-h'); if (!h || !editMode) return;
    ev.preventDefault();
    var box = h.closest('.tbox'), sid = sidOf(box), id = box.getAttribute('data-box');
    var D = dims(), k = box.closest('.slide').getBoundingClientRect().width / D.w;
    var x0 = ev.clientX, y0 = ev.clientY, bx = parseFloat(box.style.left), by = parseFloat(box.style.top);
    function mv(e) {
      var nx = Math.max(0, Math.min(D.w - 60, bx - (x0 - e.clientX) / k)), ny = Math.max(0, Math.min(D.h - 30, by + (e.clientY - y0) / k));
      box.style.left = nx + 'px'; box.style.top = ny + 'px';
    }
    function up() {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      (edits.boxes[sid] || []).forEach(function (b) { if (b.id === id) { b.x = parseFloat(box.style.left); b.y = parseFloat(box.style.top); } });
      saveEdits();
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
  // שחזור הכול — לחיצה שנייה מאשרת (אין חלון אישור)
  var resetArm = 0;
  $('resetall').addEventListener('click', function () {
    var b = $('resetall');
    if (!resetArm) { resetArm = setTimeout(function () { resetArm = 0; b.textContent = 'שחזור הכול'; }, 4000); b.textContent = 'בטוח? לחצו שוב לשחזור'; return; }
    clearTimeout(resetArm); resetArm = 0; b.textContent = 'שחזור הכול';
    edits = normEdits({ look: edits.look, form: edits.form, tt: edits.tt }); saveEdits(); render(curPages);
  });

  /* עיצוב המצגת — נשמר עם המצגת (יחד עם העריכות) */
  $('looks').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-look]'); if (!b) return;
    edits.look = b.getAttribute('data-look'); saveEdits(); render(curPages);
  });

  /* התצוגה המקדימה: השקף בגודל המלא (1280×720, ובצורות האחרות — הגודל שלהן) מוקטן לרוחב המסגרת */
  function scale() {
    var W = dims().w;
    document.querySelectorAll('.sframe').forEach(function (f) {
      var s = f.querySelector('.slide'); if (!s) return;
      var k = Math.min(1, (f.clientWidth || W) / W);
      s.style.transform = 'scale(' + k + ')';
    });
  }
  if (window.ResizeObserver) new ResizeObserver(scale).observe($('deck'));
  window.addEventListener('resize', scale);

  /* ---------- PDF ----------
     קובץ PDF אמיתי שנוצר בדפדפן: כל שקף שנכלל מצולם בגודל המלא (1280×720, בחדות כפולה) ונכנס לעמוד משלו
     בגודל 1280×720 בדיוק. הספריות נטענות רק בלחיצה הראשונה. אם משהו נכשל — חלון ההדפסה, כמו קודם.
     html-to-image ולא html2canvas: הוא מצלם דרך הדפדפן עצמו (SVG), כך שהעברית, הגופנים, הקווים המקווקווים
     והקווים של Leaflet יוצאים בדיוק כמו במסך. אריחי המפה צריכים CORS — crossOrigin בשכבת האריחים (deck.js) */
  var LIBS = [
    { test: function () { return window.jspdf && window.jspdf.jsPDF; }, src: 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
      sri: 'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3' },
    { test: function () { return window.htmlToImage; }, src: 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js',
      sri: 'sha384-Tha/42qsYmpYmQ07pX+nJzkKumO0BzKJxK/uzVc7xyBQxVCUgQBhQIG8L7vXK+9C' }
  ];
  var libsP = null;
  function loadLibs() {
    if (!libsP) libsP = Promise.all(LIBS.map(function (l) {
      if (l.test()) return true;
      return new Promise(function (res, rej) {
        var sc = document.createElement('script');
        sc.src = l.src; sc.integrity = l.sri; sc.crossOrigin = 'anonymous';
        sc.onload = function () { l.test() ? res() : rej(new Error('lib')); };
        sc.onerror = function () { rej(new Error('lib ' + l.src)); };
        document.head.appendChild(sc);
      });
    })).catch(function (e) { libsP = null; throw e; });
    return libsP;
  }
  function timeout(p, ms) { return Promise.race([p, new Promise(function (res) { setTimeout(res, ms); })]); }
  function pdfName() {
    var ds = curPages.map(function (p) { return p.formal || p.eff || ''; }).filter(Boolean).sort();
    var base = LCDeck.deckTitle(curPages);   // כמו בשער: שינוי בקו 9 / שינויים בקווים 9, 18 ו-54 / אותו שינוי ב-3 קווים
    var f = formOf();
    if (f === 'sign') base = 'שלט-להדפסה-' + base;
    if (f === 'status') base = 'סטטוס-' + base;
    return (base + (ds[0] ? '-' + ds[0] : '')).replace(/[\\\/:*?"<>|,\s]+/g, '-').replace(/-+/g, '-') + (f === 'status' ? '' : '.pdf');
  }
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var SAFARI = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);
  function save(blob, name, tab) {
    var url = URL.createObjectURL(blob);
    if (tab) { tab.location.href = url; }   // דפדפנים ב-iOS שלא מורידים קבצים מ-Blob: הקובץ נפתח בלשונית שנפתחה בלחיצה
    else {
      var a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function dlMsg(t) { document.querySelectorAll('.dlmsg').forEach(function (m) { m.textContent = t; }); }
  var busy = false;
  function download() {
    if (busy || !slides.length) return;
    busy = true;
    var btns = [$('dl'), $('dl2')], wasEdit = editMode, t0 = performance.now();
    var form = formOf(), D = dims(), PW = D.w, PH = D.h, png = form === 'status', pngs = [];
    document.querySelectorAll('.pngs').forEach(function (x) { x.hidden = true; x.innerHTML = ''; });
    var label = function (t) { btns.forEach(function (b) { b.querySelector('span').textContent = t; }); };
    btns.forEach(function (b) { b.disabled = true; b.classList.add('busy'); });
    var making = png ? 'מכין תמונות…' : 'מכין PDF…';
    label(making); dlMsg('');
    // iOS בלי תמיכה בהורדת Blob (Chrome, Firefox ב-iOS): פותחים לשונית עכשיו, בזמן הלחיצה, ושמים בה את הקובץ בסוף
    // (תמונות לסטטוס — בלי לשונית: הן מוצגות ברשימה, ושומרים בלחיצה ארוכה או בשיתוף)
    var tab = IOS && !SAFARI && !png ? window.open('', '_blank') : null;
    var items = Array.prototype.filter.call($('deck').querySelectorAll('.sitem'), function (it) { return !it.classList.contains('off'); });
    var vis = maps.filter(function (m) { return !edits.off[m.id]; });
    var host = null, cur = null;
    loadLibs().then(function () {
      label('מכין את המפות…');
      // כל אריחי המפות (לכל מפה יש זמן קצוב משלה ב-deck.js), והגופנים — ועוד גבול עליון לכל ההמתנה
      return timeout(Promise.all(vis.map(function (m) { return m.ready; }).concat(document.fonts ? [document.fonts.ready] : [])), 15000);
    }).then(function () {
      if (editMode) setEdit(false);
      // מקום מחוץ למסך, בגודל המלא של שקף; השקף עובר לשם לרגע ומצולם בלי ההקטנה של התצוגה המקדימה.
      // בתוך .deck — כדי שהצבעים והעיצוב (data-look) יחולו עליו
      host = document.createElement('div');
      host.className = 'pdfhost';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;top:0;left:-' + (PW + 1800) + 'px;width:' + PW + 'px;height:' + PH + 'px;overflow:hidden;pointer-events:none';
      $('deck').appendChild(host);
      var H = window.htmlToImage;
      var opts = {
        width: PW, height: PH, pixelRatio: png ? 1 : 2,
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        // בלי ממשק העריכה, ובלי אריחי מפה שלא נטענו (אחרת הספרייה מנסה להוריד אותם שוב ויכולה להיתקע)
        filter: function (n) {
          var c = n.classList; if (!c) return true;
          if (c.contains('leaflet-tile') && !c.contains('leaflet-tile-loaded')) return false;
          return !(c.contains('noprint') || c.contains('tbox-h') || c.contains('mkoff') || c.contains('leaflet-control-zoom'));
        }
      };
      var orient = PW > PH ? 'landscape' : 'portrait';
      var pdf = png ? null : new window.jspdf.jsPDF({ orientation: orient, unit: 'px', format: [PW, PH], hotfixes: ['px_scaling'], compress: true });
      // הגופנים מוטמעים פעם אחת לכל המצגת (במקום בכל שקף מחדש)
      return timeout(H.getFontEmbedCSS($('deck'), opts), 10000).catch(function () { return ''; }).then(function (css) {
        if (css) opts.fontEmbedCSS = css;
        var i = 0;
        function next() {
          if (i >= items.length) return pdf;
          label(making + ' ' + (i + 1) + '/' + items.length);
          var s = items[i].querySelector('.slide'), home = s.parentNode, after = s.nextSibling;
          cur = { s: s, home: home, after: after };
          s.style.transform = 'none';
          host.appendChild(s);
          // Safari: הציור הראשון של SVG עם תמונות לפעמים יוצא בלי התמונות — מציירים פעמיים
          var shot = function () {
            return Promise.race([H.toCanvas(s, opts), new Promise(function (res, rej) { setTimeout(function () { rej(new Error('slide timeout')); }, 30000); })]);
          };
          return (SAFARI ? shot().then(shot) : shot()).then(function (cv) {
            home.insertBefore(s, after); cur = null;
            if (png) {
              return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? res(b) : rej(new Error('png')); }, 'image/png'); }).then(function (b) {
                pngs.push(b); cv.width = cv.height = 0; i++;
                return new Promise(function (r) { setTimeout(r, 0); }).then(next);
              });
            }
            if (i > 0) pdf.addPage([PW, PH], orient);
            pdf.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, PW, PH, undefined, 'FAST');
            cv.width = cv.height = 0;
            i++;
            return new Promise(function (r) { setTimeout(r, 0); }).then(next);   // לתת לדפדפן לצייר את ההתקדמות
          });
        }
        return next();
      });
    }).then(function (pdf) {
      if (png) {
        if (pngs.length !== items.length) throw new Error('png count');
        showPngs(pngs);
        if (window.LCApp) window.LCApp.lastPdf = { pages: pngs.length, png: true, ms: Math.round(performance.now() - t0) };
        return;
      }
      save(pdf.output('blob'), pdfName(), tab);
      if (window.LCApp) window.LCApp.lastPdf = { pages: items.length, ms: Math.round(performance.now() - t0) };
    }).catch(function (e) {
      if (window.console) console.error('PDF', e);
      if (tab) try { tab.close(); } catch (x) {}
      if (png) { dlMsg('לא הצלחנו ליצור את התמונות. נסו שוב, או צלמו את המסך.'); return; }
      dlMsg('לא הצלחנו ליצור את קובץ ה-PDF. נפתח חלון ההדפסה — שם בוחרים "שמירה כ-PDF".');
      setTimeout(printDeck, 300);
    }).then(function () {
      if (cur) { cur.home.insertBefore(cur.s, cur.after); cur = null; }
      if (host) host.remove();
      scale();
      if (wasEdit && !editMode) setEdit(true);
      btns.forEach(function (b) { b.disabled = false; b.classList.remove('busy'); });
      busy = false;
      label(dlText());
    });
  }
  /* תמונות לסטטוס: יורדות אחת אחרי השנייה (חוץ מ-iOS), ונשארות ברשימה — לשמירה שוב או לשיתוף ישר לווטסאפ */
  function showPngs(blobs) {
    var name = pdfName(), form = formOf();
    var files = blobs.map(function (b, i) { return { blob: b, name: name + (blobs.length > 1 ? '-' + (i + 1) : '') + '.png', url: URL.createObjectURL(b) }; });
    var canShare = false;
    try { canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([blobs[0]], files[0].name, { type: 'image/png' })] })); } catch (e) {}
    document.querySelectorAll('.pngs').forEach(function (box) {
      box.setAttribute('data-form', form);
      box.innerHTML = '<p>' + (IOS ? 'לשמירה בתמונות: לחיצה ארוכה על התמונה ← "הוספה לתמונות".' : (files.length > 1 ? 'התמונות ירדו. אפשר להוריד כל אחת שוב:' : 'התמונה ירדה. אפשר להוריד אותה שוב:')) + '</p>' +
        files.map(function (f, i) { return '<a href="' + f.url + '" download="' + E(f.name) + '"><img src="' + f.url + '" alt="תמונה ' + (i + 1) + ' לסטטוס">' + (files.length > 1 ? 'תמונה ' + (i + 1) : 'הורדה') + '</a>'; }).join('') +
        (canShare ? '<button type="button" class="btn sharebtn">שיתוף ' + (files.length > 1 ? 'התמונות' : 'התמונה') + ' (ווטסאפ ועוד)</button>' : '');
      box.hidden = false;
      var sb = box.querySelector('.sharebtn');
      if (sb) sb.addEventListener('click', function () {
        navigator.share({ files: files.map(function (f) { return new File([f.blob], f.name, { type: 'image/png' }); }) }).catch(function () {});
      });
    });
    if (!IOS) files.forEach(function (f, i) { setTimeout(function () { save(f.blob, f.name); }, i * 700); });
  }
  /* הדפסה רגילה (גם כגיבוי כשה-PDF לא נוצר) */
  function printDeck() {
    var vis = maps.filter(function (m) { return !edits.off[m.id]; });
    timeout(Promise.all(vis.map(function (m) { return m.ready; })), 15000).then(function () {
      var t0 = document.title;
      document.title = LCDeck.deckTitle(curPages) || 'מצגת';
      if (editMode) setEdit(false);
      setTimeout(function () { window.print(); document.title = t0; }, 50);
    });
  }
  $('dl').addEventListener('click', download);
  $('dl2').addEventListener('click', download);
  document.querySelectorAll('.printbtn').forEach(function (b) { b.addEventListener('click', printDeck); });
  window.LCApp = { ready: function () { return Promise.all(maps.map(function (m) { return m.ready; })); }, step: function () { return step; } };
})();
