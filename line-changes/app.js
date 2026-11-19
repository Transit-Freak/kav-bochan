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
  var ttShards = {};
  function ttShard(mk) {
    var d = String(mk).replace(/\D/g, ''), i = d ? parseInt(d, 10) % 64 : String(mk).split('').reduce(function (t, c) { return t + c.charCodeAt(0); }, 0) % 64;
    var pre = PRE.tt[i]; delete PRE.tt[i];
    return ttShards[i] || (ttShards[i] = (pre || LC.getJSON('data/tt/' + i + '.json')).catch(function () { delete ttShards[i]; return null; }));
  }
  function ttPick(mk) {
    return ttShard(mk).then(function (sh) {
      var e = sh && sh.lines[mk]; if (!e) return null;
      var l = lineOf(mk), dirs = Object.keys(e.d).sort().map(function (k) {
        var r = e.d[k], x = {}, xa = {}, xn = {}, A = r.A || [], N = r.N || [];
        Object.keys(r.x || {}).forEach(function (iso) { x[iso] = r.L[r.x[iso]]; xa[iso] = A[r.x[iso]] || 0; xn[iso] = N[r.x[iso]] || 0; });
        // חלופות: v — תיאור לכל חלופה שאינה הראשית; da/xa — לכל יציאה, באיזו חלופה (0 = ראשית)
        // sc / vs / vc — התחנות והערים של החלופה הראשית ושל כל חלופה (ללוח של מקום: רק מה שעוצר בו)
        // cn — כמה תחנות בכל עיר (מקביל ל-cs): קו בין ערים סמוכות שרוב התחנות שלו בעיר אחת — עירוני בלוח
        return { dir: k, od: r.od, f: r.f, fc: r.fc || '', t: r.t, cs: r.cs, cn: r.cn || null, sc: r.sc || null, vs: r.vs || null, vc: r.vc || null, du: r.du, days: r.w.map(function (i) { return r.L[i] || []; }), x: x,
          v: r.v || [], da: r.w.map(function (i) { return A[i] || 0; }), xa: xa,
          // תגבורים (מהרישוי): dn/xn — [[מקום ברשימה, כמה אוטובוסים]]
          dn: r.w.map(function (i) { return N[i] || 0; }), xn: xn };
      });
      // עד מתי: היום שלפני השינוי הקרוב בקו (אם יש)
      var nx = ((l && l.up) || []).map(function (c) { return c.formal || c.eff; }).filter(function (d) { return d && d > sh.valid; }).sort()[0];
      // מוצא ויעד: מהכיוונים בלו"ז (הנסיעות שמוצגות), לא מהשם של הקו ברשימה — שם שנלקח לפעמים מחלופה אחרת של הקו
      var dod = dirs.filter(function (d) { return d.od && d.od[0] && d.od[1] && d.days.some(function (x) { return x && x.length; }); }).map(function (d) { return d.od; })[0];
      return { id: 'tt-' + mk, kind: 'current', line: e.l, op: e.o, ag: e.a, makat: mk, od: dod ? dod.slice() : l ? [l.from, l.to] : (dirs[0] || {}).od || ['', ''],
        eff: sh.valid, valid: sh.valid, until: nx ? LC.addDays(nx, -1) : '', gen: sh.gen, feed: sh.feed, hol: sh.hol || [], dirs: dirs, tot: { kind: 'current' } };
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
      return '<button type="button" class="ccard" data-key="' + E(c.key) + '">' +
        '<span class="when"><span class="l">' + KIND_LBL[c.kind][c.soon ? 0 : 1] + '</span><b>' + E(LC.wd(d) + ' ' + LC.dmy(d)) + '</b>' +
        '<span class="l">' + E(LC.rel(idx.gen, d)) + '</span></span>' +
        '<span class="what"><span class="chips">' + LC.chips(c.tot || { kind: c.kind }) + '</span>' +
        '<span class="size">' + E(c.kind === 'timetable' ? String(c.summary || '').replace(/^שינוי בלוח הזמנים:?\s*/, '') : '') + '</span>' +
        '<span class="meta">' + E(KIND_META[c.kind]) + ' · ' + (c.dirs > 1 ? 'הלוך וחזור' : 'רק בנסיעה לצד אחד') + '</span></span>' +
        '<span class="pick-arrow" aria-hidden="true">←</span></button>';
    }
    var lbl = c.past ? 'היה ב' : (c.soon ? 'בקרוב' : 'נכנס לתוקף');
    var chips = (c.kchip ? '<span class="chip kd">שינוי מסלול</span>' : '') + (c.inferred ? '<span class="chip inf">השוואה משוערת</span>' : '') + (c.tot ? LC.chips(c.tot) : '<span class="chip mv">טוען…</span>');
    var kinds = c.kinds ? Object.keys(c.kinds).map(function (k) { return KIND_TXT[k] || k; }).join(' · ') : '';
    return '<button type="button" class="ccard' + (c.past ? ' past' : '') + '" data-key="' + E(c.key) + '">' +
      '<span class="when"><span class="l">' + lbl + '</span><b>' + E(LC.wd(c.date) + ' ' + LC.dmy(c.date)) + '</b>' +
      (c.past ? '' : '<span class="l">' + E(LC.rel(idx.gen, c.date)) + '</span>') + '</span>' +
      '<span class="what"><span class="chips">' + chips + '</span>' +
      '<span class="size">' + (c.size == null ? '' : c.size ? 'שינוי קטן — עמוד אחד' : 'שינוי גדול — מצגת מלאה') + '</span><span class="meta">' + (kinds ? E(kinds) + ' · ' : '') +
      (c.dirs > 1 ? 'הלוך וחזור' : 'רק בנסיעה לצד אחד') + (c.past ? ' · מהארכיון' : '') + '</span>' + basisLine(c.basis) + '</span>' +
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
    e.bd = e.bd && typeof e.bd === 'object' ? e.bd : {}; e.bd.t = e.bd.t || {}; e.bd.offR = e.bd.offR || {}; e.bd.offL = e.bd.offL || {};
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
      bsplit: edits.bsplit, bdense: edits.bdense, bpages: edits.bpages, bord: edits.bord, bman: edits.bman, btypes: edits.btypes, bthide: edits.bthide, bsub: edits.bsub,
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
    ttUi(pages); zmUi(pages); rcUi(pages); a4Ui(form);
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
  function ttOpts() { var t = edits.tt || {}, v = t.v || (curPages && curPages.length && curPages.every(function (p) { return p.kind === 'current'; }) ? 'det' : 'gen'); return { v: v === 'det' || v === 'board' ? v : 'gen', f: t.f === 'text' ? 'text' : 'table' }; }
  /* "איך להציג את לוח הזמנים" — כרטיס אחד (edits.tv), בשני המצבים:
     board — לוח מודעות (ברירת המחדל) · sum — תקציר (edits.tall — "להציג את כל השעות") · sep — טבלה לכל קו · comb — טבלה משולבת.
     מהכרטיס נגזרות ההגדרות שהבונה קורא (edits.ttc בלו"ז עדכני, edits.tt ו-edits.ttper בהודעה על שינוי) — וההורדה לפי אותו כרטיס.
     עריכות שנשמרו לפני הכרטיסים (ttc / tt.v / ttper) — מתורגמות לכרטיס המתאים */
  var TVS = ['board', 'sum', 'sep', 'comb'];
  function isCu(pages) { return !!(pages && pages.length && pages.every(function (p) { return p.kind === 'current'; })); }
  function tvOld(cu) {
    var v = edits.tt && edits.tt.v;
    if (cu) {
      if (edits.ttc === 'board') return 'board';
      if (edits.ttc === 'sep') { if (v === 'gen') return 'sum'; return 'sep'; }
      if (v === 'gen') return 'sum';
      return v === 'det' ? 'comb' : '';
    }
    if (v === 'board') return 'board';
    if (v === 'gen') return 'sum';
    if (v === 'det') { if (edits.ttper === false) return 'comb'; edits.tall = true; return 'sum'; }
    return '';
  }
  function syncTv(pages) {
    var cu = isCu(pages);
    if (TVS.indexOf(edits.tv) < 0) edits.tv = tvOld(cu) || 'board';
    var tv = edits.tv === 'comb' && !LCDeck.combOk(pages) ? 'board' : edits.tv, det = tv === 'sep' || tv === 'comb' || (tv === 'sum' && edits.tall === true);
    if (cu) { edits.ttc = tv === 'board' ? 'board' : tv === 'comb' ? undefined : 'sep'; edits.tt = { v: det ? 'det' : 'gen', f: 'table' }; edits.ttper = undefined; }
    else { edits.ttc = undefined; edits.tt = { v: tv === 'board' ? 'board' : det ? 'det' : 'gen', f: 'table' }; edits.ttper = tv === 'comb' ? false : tv === 'sep' ? true : undefined; }
    return tv;
  }
  /* מפות מקורבות לתחנות — רק כשיש במצגת קו חדש או מבוטל. בלי בחירה: קו חדש — כן, קו מבוטל — לא (כמו ב-LCDeck) */
  function zmUi(pages) {
    var nk = pages.filter(function (p) { return p.kind === 'new' || p.kind === 'ended'; });
    $('zmgrp').hidden = !nk.length;
    var v = edits.zm || (nk.some(function (p) { return p.kind === 'new'; }) ? 'yes' : 'no');
    $('zmgrp').querySelectorAll('[data-zm]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-zm') === v ? 'true' : 'false'); });
  }
  /* שלט ארוך (הרבה קווים): הודעה, וכפתור לגרסה המלאה / המקוצרת (edits.a4full) */
  function a4Ui(form) {
    var si = form === 'sign' && LCDeck.signInfo(), el = $('a4note');
    if (!si || si.full <= si.short && !si.limited && edits.a4full !== true) { el.hidden = true; return; }
    el.hidden = false;
    var pt = si.parts || {};
    el.innerHTML = si.limited
      ? 'השלט היה יוצא ארוך — ' + si.full + ' עמודים. הכנו גרסה מקוצרת של ' + si.short + ' עמודים: ' +
        [pt.ttLines ? 'טבלת לוח הזמנים של ' + pt.ttLines + ' קווים (' + pt.tt + ' עמ׳)' : '',
         pt.detLines ? 'שלט מפורט ל-' + (pt.detUnits && pt.detUnits < pt.detLines ? pt.detUnits + ' שינויים ב-' + pt.detLines + ' קווים' : pt.detLines + ' קווים') + ' עם שינוי מסלול, קו חדש או מבוטל (' + pt.det + ' עמ׳)' : '',
         pt.sumLines ? 'שורה קצרה לעוד ' + pt.sumLines + ' קווים (' + pt.sum + ' עמ׳; הפרטים — במצגת)' : ''].filter(Boolean).join(' · ') +
        '. <button type="button" class="lnk" data-a4="full">להציג את כל ' + si.full + ' העמודים</button>'
      : 'השלט ארוך — ' + si.full + ' עמודים. <button type="button" class="lnk" data-a4="short">לגרסה המקוצרת (' + si.short + ' עמודים)</button>';
  }
  $('a4note').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-a4]'); if (!b) return;
    edits.a4full = b.getAttribute('data-a4') === 'full'; saveEdits(); keepScroll(function () { render(curPages); });
  });
  /* צבעי המסלול במפת השינוי — רק כשיש במצגת שינוי מסלול (לא קו חדש / מבוטל / לו"ז) */
  function rcUi(pages) {
    // רק כשיש במצגת קו שהדרך שלו משתנה (לא רק תחנה שנוספה או בוטלה)
    $('rcgrp').hidden = !pages.some(function (p) { return !p.kind && (p.tot && (p.tot.geo || p.tot.ext) || (p.dirs || []).some(function (d) { return d.geo || d.ext; })); });
    var v = edits.rc === 'all' ? 'all' : 'chg';
    $('rcgrp').querySelectorAll('[data-rc]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-rc') === v ? 'true' : 'false'); });
  }
  $('rcgrp').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-rc]'); if (!b) return;
    edits.rc = b.getAttribute('data-rc'); saveEdits(); keepScroll(function () { render(curPages); });
  });
  $('zmgrp').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-zm]'); if (!b) return;
    edits.zm = b.getAttribute('data-zm'); saveEdits(); keepScroll(function () { render(curPages); });
  });
  function ttUi(pages) {
    // הכרטיסים מופיעים בכל מצגת עם לוח זמנים: לו"ז עדכני, שינוי בלו"ז (גם שינוי קטן של נסיעה אחת) וקו חדש
    var cu = isCu(pages), tv = syncTv(pages), hasTt = cu || pages.some(LCDeck.ttCap);
    $('ttgrp').hidden = !hasTt;
    ['xl', 'xl2'].forEach(function (id) { $(id).hidden = !hasTt; });
    if (!hasTt) return;
    var cok = LCDeck.combOk(pages), bd = tv === 'board';
    $('tvbsub').textContent = cu ? 'שורה לכל קו, עמודה לכל יום' : 'שורה לכל קו, עמודה לכל יום. מה שמשתנה מסומן בצבע';
    var cb = $('tvcards').querySelector('[data-tv="comb"]');
    cb.disabled = !cok;
    $('tvcsub').textContent = cok ? 'כל השעות לאותו יעד יחד' : 'כל השעות לאותו יעד יחד. מופיע כשיש כמה קווים לאותו יעד';
    $('tvcards').querySelectorAll('[data-tv]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-tv') === tv ? 'true' : 'false'); });
    $('tallw').hidden = tv !== 'sum';
    $('tall').checked = edits.tall === true;
    $('bdopts').hidden = !bd;
    // סדר השעות — בכל תצוגה עם רשימות שעות (לא בתקציר בלי "כל השעות")
    $('ttow').hidden = tv === 'sum' && edits.tall !== true;
    $('ttoseg').querySelectorAll('[data-tto]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-tto') === tordOf() ? 'true' : 'false'); });
    if (bd) {
      var M = cu ? LCDeck.boardModel(pages, edOpts(formOf())) : LCDeck.chgBoardModel(pages, edOpts(formOf()));
      $('bdtitle').placeholder = M.dflt;
      if (document.activeElement !== $('bdtitle')) $('bdtitle').value = 'title' in edits.bd.t ? '' : edits.btitle || M.dflt;
      if (document.activeElement !== $('bdnote')) $('bdnote').value = edits.bnote || '';
      $('bdnote').placeholder = edits.bnote ? '' : M.note;
      // "להכניס ל-N עמודים" — רק בשלט A4; צפיפות ופיצול ימי חול — בכל הצורות
      $('bpgw').hidden = formOf() !== 'sign';
      var bpg = String(+edits.bpages || 0), fit = LCDeck.boardFit && LCDeck.boardFit();
      $('bpgseg').querySelectorAll('[data-bpg]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bpg') === bpg ? 'true' : 'false'); });
      $('bdneed').hidden = !(fit && fit.need);
      if (fit && fit.need) $('bdneed').textContent = 'גם באותיות הקטנות ביותר שעוד אפשר לקרוא, הלוח לא נכנס — צריך לפחות ' + fit.need + ' עמודים.';
      $('bdnseg').querySelectorAll('[data-bdn]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bdn') === (edits.bdense ? '1' : '0') ? 'true' : 'false'); });
      $('bspseg').querySelectorAll('[data-bsp]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bsp') === (edits.bsplit === false ? 'no' : 'auto') ? 'true' : 'false'); });
      var bord = M.ord || edits.bord || 'type';
      $('borseg').querySelectorAll('[data-bor]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bor') === bord ? 'true' : 'false'); });
      $('bmanh').hidden = bord !== 'man';
      // לפי סוג קו: רשימה קטנה — עירוני / בין-עירוני / אזורי, בסדר שנבחר, עם ↑↓ ו"להציג"; סוג בלי קווים — אפור
      $('btyw').hidden = bord !== 'type';
      if (bord === 'type') {
        var TN = { u: 'עירוני', i: 'בין-עירוני', r: 'אזורי' }, hide = edits.bthide || {}, ty = M.types || ['u', 'i', 'r'];
        $('btyl').innerHTML = ty.map(function (t, i) {
          var n = (M.tcount || {})[t] || 0;
          return '<li data-bty="' + t + '"' + (n ? '' : ' class="empty"') + '><button type="button" class="mv" data-bty-mv="-1" aria-label="להעביר את ' + TN[t] + ' למעלה"' + (i ? '' : ' disabled') + '>↑</button>' +
            '<button type="button" class="mv" data-bty-mv="1" aria-label="להעביר את ' + TN[t] + ' למטה"' + (i < ty.length - 1 ? '' : ' disabled') + '>↓</button>' +
            '<b>' + TN[t] + '</b><small>' + (n === 1 ? 'קו אחד' : n ? n + ' קווים' : 'אין קווים') + '</small>' +
            '<label><input type="checkbox" data-bty-show' + (hide[t] ? '' : ' checked') + (n ? '' : ' disabled') + '> להציג</label></li>';
        }).join('');
        $('bsubseg').querySelectorAll('[data-bsub]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bsub') === (edits.bsub === 'num' ? 'num' : 'add') ? 'true' : 'false'); });
      }
    }
  }
  /* הכותרת וההערות של "טבלה לפי יעד" — נשמרות עם המצגת; הלוח נבנה מחדש אחרי הפסקה קצרה בהקלדה */
  var bdT = 0;
  ['bdtitle', 'bdnote'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var v = this.value;
      if (id === 'bdtitle') edits.btitle = v.trim() && v.trim() !== this.placeholder ? v : undefined; else edits.bnote = v.trim() ? v : undefined;
      delete edits.bd.t[id === 'bdtitle' ? 'title' : 'note'];
      saveEdits(); clearTimeout(bdT); bdT = setTimeout(function () { keepScroll(function () { render(curPages); }); }, 450);
    });
  });
  $('btyl').addEventListener('change', function (ev) {
    var c = ev.target.closest('[data-bty-show]'); if (!c) return;
    var t = c.closest('[data-bty]').getAttribute('data-bty'), h = Object.assign({}, edits.bthide || {});
    if (c.checked) delete h[t]; else h[t] = 1;
    edits.bthide = Object.keys(h).length ? h : undefined;
    saveEdits(); keepScroll(function () { render(curPages); });
  });
  $('tall').addEventListener('change', function () { edits.tall = this.checked || undefined; saveEdits(); keepScroll(function () { render(curPages); }); });
  $('ttgrp').addEventListener('click', function (ev) {
    var to = ev.target.closest('[data-tto]');
    if (to) { edits.tord = to.getAttribute('data-tto'); saveEdits(); keepScroll(function () { render(curPages); }); return; }
    // סדר הסוגים (לפי סוג קו): ↑↓ ו"להציג"
    var tm = ev.target.closest('[data-bty-mv]');
    if (tm) {
      var ty = (edits.btypes || []).filter(function (t) { return 'uir'.indexOf(t) >= 0; });
      'uir'.split('').forEach(function (t) { if (ty.indexOf(t) < 0) ty.push(t); });
      var t0 = tm.closest('[data-bty]').getAttribute('data-bty'), i0 = ty.indexOf(t0), j0 = i0 + +tm.getAttribute('data-bty-mv');
      if (j0 < 0 || j0 >= ty.length) return;
      ty[i0] = ty[j0]; ty[j0] = t0; edits.btypes = ty;
      saveEdits(); keepScroll(function () { render(curPages); });
      setTimeout(function () { var f = $('btyl').querySelector('[data-bty="' + t0 + '"] [data-bty-mv="' + tm.getAttribute('data-bty-mv') + '"]'); if (f && !f.disabled) f.focus(); }, 0);
      return;
    }
    var bo = ev.target.closest('[data-bpg],[data-bdn],[data-bsp],[data-bor],[data-bsub]');
    if (bo) {
      if (bo.hasAttribute('data-bor')) {
        var nb = bo.getAttribute('data-bor');
        // ידני — מתחיל מהסדר שרואים עכשיו, כדי ששום דבר לא יקפוץ
        if (nb === 'man' && (edits.bord || 'type') !== 'man') edits.bman = bdOrderNow().reduce(function (a, b) { return a.concat(b.mks); }, []);
        edits.bord = nb === 'type' ? undefined : nb;
      }
      else if (bo.hasAttribute('data-bsub')) edits.bsub = bo.getAttribute('data-bsub') === 'num' ? 'num' : undefined;
      else if (bo.hasAttribute('data-bpg')) edits.bpages = +bo.getAttribute('data-bpg') || undefined;
      else if (bo.hasAttribute('data-bdn')) edits.bdense = bo.getAttribute('data-bdn') === '1' || undefined;
      else edits.bsplit = bo.getAttribute('data-bsp') === 'no' ? false : undefined;
      saveEdits(); keepScroll(function () { render(curPages); }); return;
    }
    var c = ev.target.closest('[data-tv]');
    if (!c || c.disabled) return;
    edits.tv = c.getAttribute('data-tv'); saveEdits(); keepScroll(function () { render(curPages); });
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
    vis.forEach(function (f, i) { f.classList.toggle('lastvis', i === vis.length - 1); f.querySelectorAll('.pg').forEach(function (p) {
      var k = p.getAttribute('data-bk');   // מספר העמוד בלוח — אפשר לערוך (טקסט שנערך נשאר, "" — בלי מספר)
      p.textContent = k && edits.bd.t[k] != null ? edits.bd.t[k] : (i + 1) + ' / ' + vis.length;
    }); });
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
    $('deck').querySelectorAll('.edt,.tbox-t,.bdt').forEach(function (el) {
      if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); } else el.removeAttribute('contenteditable');
    });
    $('deck').querySelectorAll('.ibox').forEach(function (el) { if (on) el.setAttribute('tabindex', '0'); else el.removeAttribute('tabindex'); });
    $('deck').querySelectorAll('.sitem.off').forEach(function (it) { it.hidden = !on; });
    maps.forEach(function (m) { mapEdit(m, on); });
    if (!on) hideBar();
  }
  ['editbtn', 'editbtn2'].forEach(function (id) {
    $(id).addEventListener('click', function () {
      setEdit(!editMode);
      // "טבלה לפי יעד": במצב עריכה יש מקום לשורות שהוסרו (עם "להחזיר"); בלי עריכה — העמודים מלאים
      if ($('deck').querySelector('.s-bd')) keepScroll(function () { render(curPages); });
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
  /* מפת ההתמצאות: במצב עריכה גוררים אותה (עכבר או מגע) לכל מקום בתוך המפה (לא על הקרדיט של OpenStreetMap למטה) — נשמר לכל שקף באחוזים מגודל המפה
     (edits.inset), גם להדפסה ול-PDF; ✕ מסתיר ומחזיר (edits.hide). "שחזור הכול" — חזרה לפינה האוטומטית */
  $('deck').addEventListener('pointerdown', function (ev) {
    var ins = ev.target.closest('.inset'); if (!ins || !editMode || ev.target.closest('.inset-x') || ev.button > 0) return;
    var par = ins.parentNode, mapEl = par.querySelector('.smap'); if (!mapEl) return;
    ev.preventDefault(); ev.stopPropagation();
    var k = mapEl.getBoundingClientRect().width / mapEl.offsetWidth, W = mapEl.offsetWidth, H = mapEl.offsetHeight;
    var x0 = ev.clientX, y0 = ev.clientY, bx = ins.offsetLeft, by = ins.offsetTop, moved = false;
    function mv(e) {
      moved = true;
      ins.style.left = Math.max(0, Math.min(W - ins.offsetWidth, bx + (e.clientX - x0) / k)) + 'px';
      ins.style.top = Math.max(0, Math.min(H - ins.offsetHeight - 22, by + (e.clientY - y0) / k)) + 'px';
    }
    function up() {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if (!moved) return;
      var sid = ins.getAttribute('data-ins').replace(/\|inset$/, '');
      edits.inset[sid] = { x: +(ins.offsetLeft / W * 100).toFixed(2), y: +(ins.offsetTop / H * 100).toFixed(2) };
      ins.setAttribute('data-fx', edits.inset[sid].x); ins.setAttribute('data-fy', edits.inset[sid].y);
      saveEdits();
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  $('deck').addEventListener('click', function (ev) {
    var b = ev.target.closest('.inset-x'); if (!b || !editMode) return;
    ev.preventDefault();
    var ins = b.closest('.inset'), id = ins.getAttribute('data-ins');
    if (edits.hide[id]) delete edits.hide[id]; else edits.hide[id] = 1;
    ins.classList.toggle('inoff', !!edits.hide[id]);
    saveEdits();
  });
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
  bar.innerHTML = '<button type="button" data-t="del">מחיקה</button><button type="button" data-t="add">+ שורה אחרי</button><button type="button" data-t="reset">שחזור</button>' +
    '<button type="button" data-t="mvup" class="mvb">העברה למעלה ↑</button><button type="button" data-t="mvdn" class="mvb">העברה למטה ↓</button>' +
    '<button type="button" data-t="rowadd" class="rowdel">הוספת שורה מתחת</button><button type="button" data-t="rowdel" class="rowdel">מחיקת השורה</button><button type="button" data-t="linedel" class="rowdel">מחיקת הקו</button>';
  document.body.appendChild(bar);
  var curEl = null;
  function showBar(el) {
    curEl = el;
    var r = el.getBoundingClientRect(), isBox = el.classList.contains('tbox-t'), isBd = el.classList.contains('bdt'), isRow = el.tagName === 'TR';
    bar.querySelector('[data-t="add"]').hidden = isBox || isBd || isRow;
    // הקרדיט בלוח — אפשר לשנות, לא למחוק (מורידים אותו רק ב"להוסיף קרדיט")
    bar.querySelector('[data-t="del"]').hidden = isRow || (isBd && el.getAttribute('data-bk') === 'credit');
    bar.querySelector('[data-t="rowadd"]').hidden = !bdSel || !!bdSel.band;
    // סדר ידני: קו (בתוך הפס שלו) או פס שלם — למעלה / למטה
    var mv = bdSel ? bdCanMove(bdSel) : null;
    bar.querySelector('[data-t="mvup"]').hidden = !mv; bar.querySelector('[data-t="mvdn"]').hidden = !mv;
    if (mv) { bar.querySelector('[data-t="mvup"]').disabled = !mv.up; bar.querySelector('[data-t="mvdn"]').disabled = !mv.dn; }
    bar.querySelector('[data-t="reset"]').hidden = isRow || isBox || !(isBd ? bdEdited(el.getAttribute('data-bk')) : el.classList.contains('edited'));
    bar.querySelector('[data-t="del"]').textContent = isBox ? 'מחיקת התיבה' : 'מחיקה';
    // שורה שנבחרה בלוח: "מחיקת השורה" / "מחיקת הקו", והסרגל מעל השורה או מתחתיה — לא עליה
    bar.querySelector('[data-t="rowdel"]').hidden = !bdSel || bdSel.line || !!bdSel.band;
    bar.querySelector('[data-t="linedel"]').hidden = !bdSel || !!bdSel.band;
    if (bdSel && el.closest('.slide')) r = bdSelRect(el.closest('.slide')) || r;
    bar.hidden = false;
    var top = r.top - bar.offsetHeight - 6;
    if (top < 60 && r.bottom + 6 + bar.offsetHeight < window.innerHeight) top = r.bottom + 6;
    bar.style.top = Math.max(8, top) + 'px';
    bar.style.left = Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, r.left + r.width / 2 - bar.offsetWidth / 2)) + 'px';
  }
  function hideBar() { bar.hidden = true; curEl = null; bdSelect(null); }
  /* "טבלה לפי יעד" במצב עריכה: לחיצה על תא בוחרת את השורה שלו (על תא מספר הקו — את כל השורות של הקו),
     והסרגל מציע "מחיקת השורה" / "מחיקת הקו". Delete במקלדת (כשלא עורכים טקסט) מוחק את מה שנבחר */
  var bdSel = null;
  function bdSelect(sel) {
    bdSel = sel;
    $('deck').querySelectorAll('.s-bd tr.bsel').forEach(function (t) { t.classList.remove('bsel'); });
    if (sel) $('deck').querySelectorAll(sel.band ? '.s-bd tr.bband[data-bkey="' + CSS.escape(sel.band) + '"]' : sel.line ? '.s-bd tr.br[data-mk="' + CSS.escape(sel.mk) + '"]' : '.s-bd tr.br[data-rk="' + CSS.escape(sel.rk) + '"]').forEach(function (t) { t.classList.add('bsel'); });
  }
  /* סדר ידני בלוח: הפסים והקווים בסדר שרואים עכשיו — [{k: מפתח הפס, mks: [מק"טים]}] */
  function bdOrderNow() {
    var o = edOpts(formOf()), M = isCu(curPages) ? LCDeck.boardModel(curPages, o) : LCDeck.chgBoardModel(curPages, o);
    return M.bands.map(function (b) {
      var mks = [];
      b.rows.forEach(function (r) { if (!r.add && r.p && r.p.makat && mks.indexOf(r.p.makat) < 0) mks.push(r.p.makat); });
      return { k: b.k, mks: mks };
    });
  }
  function bdWhere(bs, sel) {
    if (sel.band) { for (var i = 0; i < bs.length; i++) if (bs[i].k === sel.band) return { b: i }; return null; }
    for (var j = 0; j < bs.length; j++) { var x = bs[j].mks.indexOf(sel.mk); if (x >= 0) return { b: j, l: x }; }
    return null;
  }
  function bdCanMove(sel) {
    var bs = bdOrderNow(), w = bdWhere(bs, sel); if (!w) return null;
    return w.l == null ? { up: w.b > 0, dn: w.b < bs.length - 1 } : { up: w.l > 0, dn: w.l < bs[w.b].mks.length - 1 };
  }
  /* העברה של קו (בתוך הפס) או של פס שלם — והסדר עובר ל"ידני" (מהסדר שרואים עכשיו) */
  function bdMove(dir) {
    if (!bdSel) return;
    var bs = bdOrderNow(), w = bdWhere(bs, bdSel), sel = bdSel; if (!w) return;
    if (w.l == null) { var j = w.b + dir; if (j < 0 || j >= bs.length) return; var t = bs[w.b]; bs[w.b] = bs[j]; bs[j] = t; }
    else { var L = bs[w.b].mks, k = w.l + dir; if (k < 0 || k >= L.length) return; var u = L[w.l]; L[w.l] = L[k]; L[k] = u; }
    edits.bman = bs.reduce(function (a, b) { return a.concat(b.mks); }, []);
    edits.bord = 'man';
    saveEdits(); hideBar();
    keepScroll(function () { render(curPages); });
    // אותו קו / פס נשאר מסומן, עם הסרגל — כדי שאפשר להמשיך להזיז
    setTimeout(function () { bdSelect(sel); var tr = $('deck').querySelector('.s-bd tr.bsel'); if (tr) showBar(tr); }, 30);
  }
  function bdSelRect(slide) {
    var trs = slide.querySelectorAll('tr.bsel'); if (!trs.length) return null;
    var a = trs[0].getBoundingClientRect(), b = trs[trs.length - 1].getBoundingClientRect();
    return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), width: Math.max(a.right, b.right) - Math.min(a.left, b.left) };
  }
  /* "הוספת שורה מתחת": שורה ריקה (קו, מוצא, שעות) מתחת לשורה שנבחרה — באותו פס; כשנבחר קו שלם — מתחת לשורה האחרונה שלו */
  function bdAddRow() {
    if (!bdSel) return;
    var trs = $('deck').querySelectorAll('.s-bd tr.bsel'), after = trs.length ? trs[trs.length - 1].getAttribute('data-rk') : bdSel.rk;
    var id = Date.now().toString(36);
    edits.bd.nr.push({ id: id, after: after });
    saveEdits(); hideBar();
    keepScroll(function () { render(curPages); });
    setTimeout(function () { var c = $('deck').querySelector('.s-bd tr.br[data-rk="n' + id + '"] [data-bk="ln:n' + id + '"]'); if (c) c.focus(); }, 60);
  }
  function bdDelSel(line) {
    if (!bdSel) return;
    if (line) edits.bd.offL[bdSel.mk] = 1; else edits.bd.offR[bdSel.rk] = 1;
    saveEdits(); hideBar(); keepScroll(function () { render(curPages); });
  }
  $('deck').addEventListener('pointerdown', function (ev) {
    if (!editMode) return;
    var bt = ev.target.closest('.s-bd tr.bband[data-bkey]');
    if (bt && !bt.classList.contains('boff')) { bdSelect({ band: bt.getAttribute('data-bkey') }); return; }
    var tr = ev.target.closest('.s-bd tr.br');
    if (!tr) return;
    var td = ev.target.closest('td');
    bdSelect({ rk: tr.getAttribute('data-rk'), mk: tr.getAttribute('data-mk'), line: !!(td && td.classList.contains('bl')) });
  }, true);
  $('deck').addEventListener('click', function (ev) {
    if (!editMode || !bdSel || ev.target.closest('.bdt,[data-bdx]')) return;
    var tr = ev.target.closest('.s-bd tr.br, .s-bd tr.bband[data-bkey]'); if (!tr) return;
    showBar(tr);   // לחיצה על תא בלי טקסט לעריכה — רק בחירת השורה (או הפס)
  });
  document.addEventListener('keydown', function (ev) {
    if (!editMode || !bdSel || bdSel.band || (ev.key !== 'Delete' && ev.key !== 'Backspace')) return;
    var a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    ev.preventDefault(); bdDelSel(bdSel.line);
  });
  $('deck').addEventListener('focusin', function (ev) {
    var el = ev.target.closest('.edt,.tbox-t,.bdt');
    if (el && editMode) { if (el.classList.contains('bdt') && !el.hasAttribute('data-o')) el.setAttribute('data-o', el.innerText); showBar(el); }
  });
  document.addEventListener('mousedown', function (ev) {
    if (!bar.hidden && !ev.target.closest('#etb') && !ev.target.closest('.edt,.tbox-t,.bdt,.s-bd tr.br,.s-bd tr.bband')) hideBar();
  });
  window.addEventListener('scroll', function () { if (curEl && !bar.hidden) showBar(curEl); }, { passive: true });
  function sidOf(el) { return el.closest('.sframe').getAttribute('data-id'); }
  function splitAdd(id) { var m = id.match(/^(.*)\+(\d+)$/); return m ? { base: m[1], i: +m[2] } : null; }
  /* "טבלה לפי יעד": טקסט בלוח (.bdt) נשמר לפי המפתח שלו (data-bk) ב-edits.bd.t, ואחרי היציאה מהשדה הלוח נבנה מחדש —
     כך השינוי (או המחיקה) מגיע לכל העמודים, לשלט, למצגת, לסטטוס ולאקסל. כותרת ו"עדכונים" — אותם שדות כמו בשלב 3 */
  function bdEdited(k) {
    if (k === 'title') return edits.btitle !== undefined || 'title' in edits.bd.t;
    if (k === 'note') return edits.bnote !== undefined || 'note' in edits.bd.t;
    return k in edits.bd.t;
  }
  function bdSet(k, v) {   // v === null — שחזור
    var t = edits.bd.t;
    if (k === 'title' || k === 'note') {
      var f = k === 'title' ? 'btitle' : 'bnote';
      delete t[k];
      if (v === null) edits[f] = undefined; else if (v.trim()) edits[f] = v.trim(); else { edits[f] = undefined; t[k] = ''; }
    } else if (v === null || (k === 'credit' && !v.trim())) delete t[k]; else t[k] = v.replace(/\s+$/, '');
    saveEdits();
  }
  $('deck').addEventListener('focusout', function (ev) {
    var el = ev.target;
    if (!el.classList || !el.classList.contains('bdt') || !editMode) return;
    var o = el.getAttribute('data-o'); el.removeAttribute('data-o');
    if (o === null || o === el.innerText) return;
    bdSet(el.getAttribute('data-bk'), el.innerText);
    setTimeout(function () { if (!bar.hidden && curEl === el) hideBar(); keepScroll(function () { render(curPages); }); }, 0);
  });
  // "להחזיר" — שורה או קו שהוסרו חוזרים ללוח
  $('deck').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-bdx]'); if (!b) return;
    ev.preventDefault();
    var v = b.getAttribute('data-bdx'), kind = v.charAt(0) === 'L' ? 'offL' : 'offR', k = v.slice(2);
    if (edits.bd[kind][k]) delete edits.bd[kind][k]; else edits.bd[kind][k] = 1;
    // מחזירים קו שלם — גם השורות שלו שהוסרו אחת-אחת
    if (kind === 'offL' && !edits.bd.offL[k]) Object.keys(edits.bd.offR).forEach(function (rk) { if (rk.split('.')[0] === k) delete edits.bd.offR[rk]; });
    saveEdits(); hideBar(); keepScroll(function () { render(curPages); });
  });
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
    maps.forEach(function (m) { if (m.id === fsid && m.map) m.map.invalidateSize({ pan: false }); });
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
    if (t === 'rowdel' || t === 'linedel') { if (el.classList.contains('bdt')) el.removeAttribute('data-o'); bdDelSel(t === 'linedel'); return; }
    if (t === 'rowadd') { if (el.classList.contains('bdt')) el.removeAttribute('data-o'); bdAddRow(); return; }
    if (t === 'mvup' || t === 'mvdn') { if (el.classList.contains('bdt')) { el.removeAttribute('data-o'); el.blur(); } bdMove(t === 'mvup' ? -1 : 1); return; }
    if (el.classList.contains('bdt')) {   // טקסט בלוח: מחיקה — ריק, שחזור — הטקסט מהנתונים
      el.removeAttribute('data-o');
      bdSet(el.getAttribute('data-bk'), t === 'reset' ? null : '');
      hideBar(); keepScroll(function () { render(curPages); });
      return;
    }
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
    if (imgAct(act, sid, b)) return;
    if (act === 'mzin' || act === 'mzout' || act === 'mreset') {
      if (act === 'mreset') { delete edits.mv[sid]; saveEdits(); keepScroll(function () { render(curPages); }); return; }
      maps.forEach(function (m) { if (m.id === sid && m.map) { if (act === 'mzin') m.map.zoomIn(0.5); else m.map.zoomOut(0.5); } });
      return;
    }
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
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      (edits.boxes[sid] || []).forEach(function (b) { if (b.id === id) { b.x = Math.round(parseFloat(box.style.left)); b.y = Math.round(parseFloat(box.style.top)); } });
      saveEdits();
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  // שחזור הכול — לחיצה שנייה מאשרת (אין חלון אישור)
  var resetArm = 0;
  $('resetall').addEventListener('click', function () {
    var b = $('resetall');
    if (!resetArm) { resetArm = setTimeout(function () { resetArm = 0; b.textContent = 'שחזור הכול'; }, 4000); b.textContent = 'בטוח? לחצו שוב לשחזור'; return; }
    clearTimeout(resetArm); resetArm = 0; b.textContent = 'שחזור הכול';
    edits = normEdits({ look: edits.look, form: edits.form, tv: edits.tv, tall: edits.tall, tt: edits.tt, ttc: edits.ttc, bplace: edits.bplace, bpl: edits.bpl }); saveEdits(); render(curPages);
  });

  /* ---------- תמונות ----------
     התמונה נשארת במחשב או בטלפון: נקראת מהקובץ (או מההדבקה), מוקטנת על canvas לעד 1600 פיקסלים בצד הארוך
     (JPEG, או PNG כשיש בה שקיפות) — כך ה-PDF נשאר קטן. לא עולה לשום מקום.
     התמונות עצמן בזיכרון וב-IndexedDB (נשארות גם אחרי סגירת הלשונית, כמו העריכות ב-localStorage);
     במצגת (edits.imgs, xslides) נשמר רק המיקום, המזהה והתיאור. תמונות שאף מצגת שמורה לא משתמשת בהן — נמחקות בטעינה */
  var IMGS = {}, MAXPX = 1600, IDB = null;
  function idb() {
    if (IDB) return IDB;
    IDB = new Promise(function (res, rej) {
      try {
        var rq = indexedDB.open('lc-imgs', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('img'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
        rq.onblocked = function () { rej(new Error('blocked')); };
      } catch (e) { rej(e); }
    });
    IDB.catch(function () {});
    return IDB;
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('img', mode), st = tx.objectStore('img'), out = fn(st);
        tx.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        tx.onerror = tx.onabort = function () { rej(tx.error || new Error('idb')); };
      });
    });
  }
  function getImg(id) { return IMGS[id] || ''; }
  function putImg(id, url) {
    IMGS[id] = url;
    return idbDo('readwrite', function (st) { st.put(url, id); }).catch(function (e) {
      imgMsg(e && e.name === 'QuotaExceededError' ? 'אין מספיק מקום בדפדפן לשמור את התמונה — היא תישאר רק עד שהלשונית תיסגר.' : 'לא הצלחנו לשמור את התמונה בדפדפן — היא תישאר רק עד שהלשונית תיסגר.');
    });
  }
  /* כל מזהי התמונות שמצגות שמורות (localStorage) משתמשות בהן */
  function usedImgs() {
    var used = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!k || k.indexOf('lc-ed2:') !== 0) continue;
        var e = JSON.parse(localStorage.getItem(k) || 'null') || {};
        Object.keys(e.imgs || {}).forEach(function (sid) { (e.imgs[sid] || []).forEach(function (b) { if (b && b.img) used[b.img] = 1; }); });
        (e.xslides || []).forEach(function (x) { if (x && x.img) used[x.img] = 1; });
      }
    } catch (e) {}
    if (edits) { Object.keys(edits.imgs || {}).forEach(function (sid) { (edits.imgs[sid] || []).forEach(function (b) { used[b.img] = 1; }); }); (edits.xslides || []).forEach(function (x) { if (x.img) used[x.img] = 1; }); }
    return used;
  }
  /* בטעינה: תמונות מ-sessionStorage (גרסה קודמת) עוברות ל-IndexedDB, הכול נטען לזיכרון, ומה שלא בשימוש — נמחק */
  var imgsReady = (function () {
    var moved = {};
    try {
      for (var i = sessionStorage.length - 1; i >= 0; i--) {
        var k = sessionStorage.key(i); if (k && k.indexOf('lc-img:') === 0) { moved[k.slice(7)] = sessionStorage.getItem(k); }
      }
    } catch (e) {}
    Object.keys(moved).forEach(function (id) { IMGS[id] = moved[id]; });
    if (!window.indexedDB) return Promise.resolve();
    return idbDo('readwrite', function (st) { Object.keys(moved).forEach(function (id) { st.put(moved[id], id); }); }).then(function () {
      try { Object.keys(moved).forEach(function (id) { sessionStorage.removeItem('lc-img:' + id); }); } catch (e) {}
      var all = {};
      return idbDo('readonly', function (st) {
        var rq = st.openCursor();
        rq.onsuccess = function () { var c = rq.result; if (c) { all[c.key] = c.value; c.continue(); } };
      }).then(function () { return all; });
    }).then(function (all) {
      var used = usedImgs(), drop = Object.keys(all).filter(function (id) { return !used[id]; });
      Object.keys(all).forEach(function (id) { if (used[id] && !IMGS[id]) IMGS[id] = all[id]; });
      if (drop.length) return idbDo('readwrite', function (st) { drop.forEach(function (id) { st.delete(id); }); });
    }).catch(function () {}).then(function () {
      // התמונות הגיעו אחרי הציור הראשון — מציירים שוב את השקפים שיש בהם תמונות
      if (curPages && slides && slides.length && Object.keys(IMGS).length) keepScroll(function () { render(curPages); });
    });
  })();
  function clearImgs() {
    // "איפוס": המצגת הזו נמחקה מ-localStorage; תמונות שאף מצגת שמורה לא משתמשת בהן — נמחקות
    setTimeout(function () {
      var used = usedImgs(), drop = Object.keys(IMGS).filter(function (id) { return !used[id]; });
      drop.forEach(function (id) { delete IMGS[id]; });
      if (window.indexedDB) idbDo('readwrite', function (st) {
        var rq = st.openCursor();
        rq.onsuccess = function () { var c = rq.result; if (c) { if (!used[c.key]) c.delete(); c.continue(); } };
      }).catch(function () {});
    }, 0);
  }
  function readImage(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type || 'image/')) { rej(new Error('type')); return; }
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('read')); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { rej(new Error('decode')); };
        im.onload = function () {
          var w0 = im.naturalWidth, h0 = im.naturalHeight;
          if (!w0 || !h0) { rej(new Error('size')); return; }
          var k = Math.min(1, MAXPX / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          var cx = cv.getContext('2d');
          cx.drawImage(im, 0, 0, w, h);
          var alpha = false;
          if (!/jpe?g/i.test(file.type || '')) {
            try {
              var d = cx.getImageData(0, 0, w, h).data;
              for (var i = 3; i < d.length; i += 16) if (d[i] < 250) { alpha = true; break; }
            } catch (e) {}
          }
          var url;
          if (alpha) url = cv.toDataURL('image/png');
          else {
            // JPEG בלי שקיפות: רקע לבן מתחת (אחרת פיקסלים שקופים למחצה יוצאים שחורים)
            var cv2 = document.createElement('canvas'); cv2.width = w; cv2.height = h;
            var c2 = cv2.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, w, h); c2.drawImage(cv, 0, 0);
            url = cv2.toDataURL('image/jpeg', 0.85);
          }
          res({ url: url, r: w / h });
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function drawImgs(sid) {
    var fr = frameOf(sid); if (!fr) return;
    var slide = fr.querySelector('.slide'), D = dims();
    slide.querySelectorAll('.ibox').forEach(function (x) { x.remove(); });
    (edits.imgs[sid] || []).forEach(function (b) {
      var src = getImg(b.img); if (!src) return;
      var el = LCEdit.imgEl(b, src, D.w, D.h);
      if (editMode) el.setAttribute('tabindex', '0');
      slide.appendChild(el);
    });
  }
  function imgMsg(t) { var m = $('imgmsg'); if (m) { m.textContent = t; clearTimeout(imgMsg.t); imgMsg.t = setTimeout(function () { m.textContent = ''; }, 4000); } }
  // מוסיפים תמונה: על השקף sid (תיבה שאפשר להזיז ולשנות גודל), או כשקף תמונה חדש אחריו
  function addImage(file, sid, asSlide) {
    if (!sid) return;
    imgMsg('מכין את התמונה…');
    readImage(file).then(function (r) {
      var iid = 'i' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
      putImg(iid, r.url);
      if (asSlide) {
        var nid = 'x' + Date.now().toString(36);
        edits.xslides.push({ id: nid, after: sid, img: iid, fit: 'cover' });
        if (!editMode) setEdit(true);
        saveEdits(); keepScroll(function () { render(curPages); });
        imgMsg('נוסף שקף עם התמונה');
        imgAlt(nid, null);
        return;
      }
      var D = dims(), port = D.h > D.w;
      var w = port ? 60 : 36, maxW = 100 * 0.6 * D.h * r.r / D.w;   // עד 60% מגובה השקף
      if (w > maxW) w = maxW;
      var hP = w * D.w / r.r / D.h;
      var b = { id: iid, img: iid, x: +(50 - w / 2).toFixed(2), y: +((100 - hP) / 2).toFixed(2), w: +w.toFixed(2), r: +r.r.toFixed(4) };
      (edits.imgs[sid] = edits.imgs[sid] || []).push(b);
      saveEdits();
      if (!editMode) setEdit(true);
      drawImgs(sid);
      var el = frameOf(sid).querySelector('.ibox[data-ibox="' + CSS.escape(iid) + '"]');
      if (el) { el.setAttribute('tabindex', '0'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      imgMsg('התמונה נוספה. גוררים כדי להזיז, והעיגול הכחול משנה את הגודל.');
      imgAlt(sid, iid);
    }).catch(function () { imgMsg('לא הצלחנו לקרוא את התמונה. נסו קובץ JPG או PNG.'); });
  }
  var picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'image/*'; picker.className = 'vh noprint'; picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');
  document.body.appendChild(picker);
  var pickFor = null;
  picker.addEventListener('change', function () {
    var f = picker.files && picker.files[0], p = pickFor; pickFor = null;
    if (f && p) addImage(f, p.sid, p.slide);
    picker.value = '';
  });
  function findImg(sid, id) { return (edits.imgs[sid] || []).filter(function (b) { return b.id === id; })[0]; }
  function delImg(sid, id) {
    edits.imgs[sid] = (edits.imgs[sid] || []).filter(function (b) { return b.id !== id; });
    if (!edits.imgs[sid].length) delete edits.imgs[sid];
    saveEdits();
    var el = frameOf(sid) && frameOf(sid).querySelector('.ibox[data-ibox="' + CSS.escape(id) + '"]');
    if (el) el.remove();
    imgMsg('התמונה נמחקה');
  }
  /* תיאור התמונה (alt) לקוראי מסך: שדה רשות אחרי ההוספה, ואפשר לשנות במצב עריכה ("תיאור" על התמונה / "תיאור התמונה" בשקף תמונה).
     ריק — התמונה דקורטיבית (alt="") */
  function altDlg(cur, save) {
    var old = document.querySelector('.altdlg'); if (old) old.remove();
    var back = document.activeElement;
    var box = document.createElement('div');
    box.className = 'altdlg noprint'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'altdlg-l');
    box.innerHTML = '<label id="altdlg-l" for="altdlg-i">תיאור התמונה (לקוראי מסך)</label>' +
      '<input id="altdlg-i" type="text" dir="auto" maxlength="300" placeholder="למשל: מפת השינוי בתחנה המרכזית">' +
      '<p class="ad-h">רשות. בלי תיאור — קוראי מסך ידלגו על התמונה.</p>' +
      '<div class="tw-b"><button type="button" class="btn" data-ad="ok">שמירה</button><button type="button" class="lnk" data-ad="no">בלי תיאור</button></div>';
    document.body.appendChild(box);
    var inp = box.querySelector('input'); inp.value = cur || ''; inp.focus();
    var done = function (v) { box.remove(); if (v !== null) save(v); if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) {} };
    box.addEventListener('click', function (ev) { var b = ev.target.closest('[data-ad]'); if (!b) return; done(b.getAttribute('data-ad') === 'ok' ? inp.value.trim() : ''); });
    box.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); done(inp.value.trim()); } else if (ev.key === 'Escape') done(null); });
  }
  function imgAlt(sid, id) {
    var b = id ? findImg(sid, id) : edits.xslides.filter(function (x) { return x.id === sid; })[0];
    if (!b) return;
    altDlg(b.alt, function (v) {
      if (v) b.alt = v; else delete b.alt;
      saveEdits();
      if (id) drawImgs(sid); else keepScroll(function () { render(curPages); });
      imgMsg(v ? 'התיאור נשמר' : 'התמונה בלי תיאור');
    });
  }
  // פעולות התמונות בסרגל של השקף. מחזיר true אם הפעולה טופלה כאן
  function imgAct(act, sid, b) {
    if (act === 'imgalt') { var ib0 = b.closest('.ibox'); imgAlt(ib0 ? sidOf(ib0) : sid, ib0 ? ib0.getAttribute('data-ibox') : null); return true; }
    if (act === 'img' || act === 'ximg') { pickFor = { sid: sid, slide: act === 'ximg' }; picker.click(); return true; }
    if (act === 'imgdel') { var ib = b.closest('.ibox'); if (ib) delImg(sidOf(ib), ib.getAttribute('data-ibox')); return true; }
    if (act === 'fit') {
      edits.xslides.forEach(function (x) { if (x.id === sid) x.fit = x.fit === 'contain' ? 'cover' : 'contain'; });
      saveEdits(); keepScroll(function () { render(curPages); });
      return true;
    }
    return false;
  }
  // הזזה (גרירה של התמונה) ושינוי גודל (העיגול בפינה, שומר על היחס) — עכבר ומגע
  $('deck').addEventListener('pointerdown', function (ev) {
    var box = ev.target.closest('.ibox'); if (!box || !editMode || ev.target.closest('.ibox-x,.ibox-a')) return;
    if (ev.button > 0) return;
    ev.preventDefault();
    box.focus({ preventScroll: true });
    var sid = sidOf(box), b = findImg(sid, box.getAttribute('data-ibox')); if (!b) return;
    var D = dims(), k = box.closest('.slide').getBoundingClientRect().width / D.w;
    var rsz = !!ev.target.closest('.ibox-r');
    var x0 = ev.clientX, y0 = ev.clientY;
    var bx = parseFloat(box.style.left), by = parseFloat(box.style.top), bw = parseFloat(box.style.width);
    var moved = false;
    function mv(e) {
      moved = true;
      var dx = (e.clientX - x0) / k / D.w * 100, dy = (e.clientY - y0) / k / D.h * 100;
      if (rsz) {
        // לפי הכיוון שזז יותר — הגובה מומר לרוחב לפי היחס של התמונה
        var dw = Math.abs(dx) > Math.abs(dy * D.h / D.w * b.r) ? dx : dy * D.h * b.r / D.w;
        var maxW = Math.min(100 - bx, (100 - by) * D.h * b.r / D.w);
        var nw = Math.max(4, Math.min(maxW, bw + dw));
        box.style.width = nw + '%';
      } else {
        var hP = bw * D.w / b.r / D.h;
        box.style.left = Math.max(0, Math.min(100 - bw, bx + dx)) + '%';
        box.style.top = Math.max(0, Math.min(100 - hP, by + dy)) + '%';
      }
    }
    function up() {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if (!moved) return;
      b.x = +parseFloat(box.style.left).toFixed(2); b.y = +parseFloat(box.style.top).toFixed(2); b.w = +parseFloat(box.style.width).toFixed(2);
      saveEdits();
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  // מקלדת: חיצים מזיזים (עם Shift — יותר), פלוס ומינוס משנים גודל, Delete מוחק
  $('deck').addEventListener('keydown', function (ev) {
    var box = ev.target; if (!editMode || !box.classList || !box.classList.contains('ibox')) return;
    var sid = sidOf(box), b = findImg(sid, box.getAttribute('data-ibox')); if (!b) return;
    var D = dims(), st = ev.shiftKey ? 5 : 1, hP = function () { return b.w * D.w / b.r / D.h; };
    var k = ev.key;
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); delImg(sid, b.id); var it = frameOf(sid); if (it) it.closest('.sitem').querySelector('[data-act="img"]').focus(); return; }
    if (k === 'ArrowLeft') b.x -= st; else if (k === 'ArrowRight') b.x += st;
    else if (k === 'ArrowUp') b.y -= st; else if (k === 'ArrowDown') b.y += st;
    else if (k === '+' || k === '=') b.w += st; else if (k === '-' || k === '_') b.w -= st;
    else return;
    ev.preventDefault();
    b.w = Math.max(4, Math.min(b.w, 100, 100 * D.h * b.r / D.w));
    b.x = +Math.max(0, Math.min(100 - b.w, b.x)).toFixed(2); b.y = +Math.max(0, Math.min(100 - hP(), b.y)).toFixed(2); b.w = +b.w.toFixed(2);
    box.style.left = b.x + '%'; box.style.top = b.y + '%'; box.style.width = b.w + '%';
    saveEdits();
  });
  // הדבקת תמונה (Ctrl+V במחשב) במצב עריכה: נכנסת לשקף שעובדים עליו — או לשקף שבמרכז המסך
  var lastSid = null;
  $('deck').addEventListener('pointerdown', function (ev) { var it = ev.target.closest('.sitem'); if (it) lastSid = it.getAttribute('data-id'); }, true);
  $('deck').addEventListener('focusin', function (ev) { var it = ev.target.closest('.sitem'); if (it) lastSid = it.getAttribute('data-id'); });
  function sidNow() {
    var its = Array.prototype.filter.call($('deck').querySelectorAll('.sitem'), function (x) { return !x.hidden; });
    if (lastSid && its.some(function (x) { return x.getAttribute('data-id') === lastSid; })) return lastSid;
    var mid = window.innerHeight / 2, best = null, bd = 1e9;
    its.forEach(function (x) { var r = x.getBoundingClientRect(), d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid)); if (d < bd) { bd = d; best = x; } });
    return best ? best.getAttribute('data-id') : null;
  }
  document.addEventListener('paste', function (ev) {
    if (!editMode || step !== 3 || !ev.clipboardData) return;
    var items = ev.clipboardData.items || [], f = null;
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { f = items[i].getAsFile(); break; }
    if (!f) {
      // טקסט שמודבק לתוך שקף: רק טקסט פשוט (בלי תמונות ועיצוב מאתרים אחרים)
      var tg = ev.target.closest && ev.target.closest('#deck [contenteditable]');
      if (tg) { ev.preventDefault(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain') || ''); }
      return;
    }
    ev.preventDefault();
    var it = ev.target.closest && ev.target.closest('.sitem');
    addImage(f, it ? it.getAttribute('data-id') : sidNow(), false);
  });

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
  /* PDF נגיש: מעל התמונה של כל שקף — שכבת טקסט בלתי נראית (אותו טקסט באותם מקומות), כדי שאפשר יהיה לחפש, לסמן ולהעתיק,
     וקוראי מסך יקראו אותו. הגופן (Heebo, עם עברית) נטען רק כשמורידים PDF; בלי הגופן — PDF בלי שכבת הטקסט, כמו קודם */
  var fontP = null;
  function loadPdfFont() {
    if (!fontP) fontP = fetch('fonts/Heebo-Regular.ttf').then(function (r) { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); }).then(function (b) {
      var u = new Uint8Array(b), s = '';
      for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    }).catch(function () { fontP = null; return null; });
    return fontP;
  }
  var NO_GLYPH = /[\u2190-\u21ff\u2700-\u27bf\u2600-\u26ff\ud800-\udfff\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;   // אין בגופן — לא נכנס לשכבת הטקסט
  /* שורות הטקסט בשקף (s, בגודל מלא): המילים של כל בלוק (פסקה, תא, פריט ברשימה), מקובצות לשורות לפי המקום על המסך,
     בסדר הקריאה (כמו ב-DOM). הכיוון — של הבלוק, כך שתא של שעות משמאל לימין נשאר משמאל לימין */
  var TXT_BLOCK = 'p,li,td,th,h1,h2,h3,h4,dd,dt,figcaption,.tbox-t,.leaflet-tooltip,div';
  function textRuns(s) {
    var R = s.getBoundingClientRect(), lines = [], rg = document.createRange(), blocks = [];
    var w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    for (var t; (t = w.nextNode());) {
      var v = t.nodeValue; if (!v || !v.trim()) continue;
      var el = t.parentElement;
      if (!el || el.closest('.noprint,.tbox-h,style,script,.leaflet-control-attribution,.leaflet-control-zoom')) continue;
      var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      var blk = el.closest(TXT_BLOCK) || s, bi = blocks.indexOf(blk);
      if (bi < 0) { blocks.push(blk); bi = blocks.length - 1; }
      var re = /\S+/g, m;
      while ((m = re.exec(v))) {
        rg.setStart(t, m.index); rg.setEnd(t, m.index + m[0].length);
        var r = rg.getBoundingClientRect();
        if (!r.width || !r.height || r.right < R.left || r.left > R.right || r.bottom < R.top || r.top > R.bottom) continue;
        var line = null;
        for (var k = lines.length - 1; k >= 0 && k >= lines.length - 40; k--) { var x = lines[k]; if (x.bi === bi && Math.abs(r.top - x.top) < r.height * 0.5) { line = x; break; } }
        if (line) { line.words.push(m[0]); line.l = Math.min(line.l, r.left); line.r = Math.max(line.r, r.right); line.b = Math.max(line.b, r.bottom); }
        else lines.push({ bi: bi, words: [m[0]], top: r.top, l: r.left, r: r.right, b: r.bottom, rtl: getComputedStyle(blk).direction === 'rtl' });
      }
    }
    var out = lines;
    // תמונות עם תיאור (alt) — התיאור במקום של התמונה
    s.querySelectorAll('img[alt]').forEach(function (im) {
      var a = (im.getAttribute('alt') || '').trim(), r = im.getBoundingClientRect(); if (!a || !r.width) return;
      out.push({ words: [a], top: r.top, l: r.left, r: r.right, b: r.top + Math.min(r.height, 24), rtl: true });
    });
    return out.map(function (x) { return { t: x.words.join(' '), x: x.l - R.left, y: x.top - R.top, w: x.r - x.l, h: x.b - x.top, rtl: x.rtl }; });
  }
  function addTextLayer(pdf, runs) {
    runs.forEach(function (r) {
      var t = r.t.replace(NO_GLYPH, '').trim(); if (!t) return;
      var pt = Math.max(2, r.h * 0.78 * 0.75);   // גובה השורה בפיקסלים → גודל הגופן בנקודות
      pdf.setFontSize(pt);
      var tw = pdf.getTextWidth(t); if (!tw) return;
      try {
        pdf.text(t, r.x, r.y + r.h * 0.8, { renderingMode: 'invisible', baseline: 'alphabetic', horizontalScale: Math.max(0.2, Math.min(5, r.w / tw)),
          isInputVisual: false, isOutputVisual: true, isInputRtl: !!r.rtl, isOutputRtl: false });
      } catch (e) {}
    });
  }
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
  /* לפני ההורדה: אריחי מפה שחסרים בשקפים שנכללים — עוד ניסיון אחד, ואם עדיין חסר — שואלים (לא מורידים מפה חלקית בשקט).
     מתממש כשאפשר להמשיך; נדחה עם {cancel: true} כשמבטלים */
  function tileGate(label) {
    var inc = function (el) { var it = el.closest('.sitem'); return !!it && !it.classList.contains('off'); };
    var waitTiles = function (ms) {
      return new Promise(function (res) {
        var t0 = Date.now();
        (function poll() { var n = LCDeck.tilesMissing(inc); if (!n || Date.now() - t0 > ms) res(n); else setTimeout(poll, 300); })();
      });
    };
    // קודם מחכים לאריחים שעוד בטעינה או בניסיון החוזר האוטומטי; מה שעדיין חסר — טוענים שוב את השכבה, ורק אז שואלים
    return waitTiles(6000).then(function (n) {
      if (!n) return 0;
      label('טוען את המפה שוב…');
      LCDeck.tilesMissing(inc, true);
      return new Promise(function (r) { setTimeout(r, 600); }).then(function () { return waitTiles(10000); });
    }).then(function (n2) {
      if (!n2) return;
      return new Promise(function (res, rej) {
        var box = document.createElement('div');
        box.className = 'tilewarn noprint'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-labelledby', 'tilewarn-t');
        box.innerHTML = '<p id="tilewarn-t">חלק מהמפה לא נטען (' + n2 + (n2 === 1 ? ' אריח' : ' אריחים') + '). אפשר לנסות שוב, או להוריד בכל זאת — עם חלקים ריקים במפה.</p>' +
          '<div class="tw-b"><button type="button" class="btn" data-tw="retry">לנסות שוב</button><button type="button" class="btn2" data-tw="go">להוריד בכל זאת</button>' +
          '<button type="button" class="lnk" data-tw="no">ביטול</button></div>';
        document.body.appendChild(box);
        box.querySelector('[data-tw="retry"]').focus();
        box.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-tw]'); if (!b) return;
          var a = b.getAttribute('data-tw'); box.remove();
          if (a === 'go') res();
          else if (a === 'no') rej({ cancel: true });
          else tileGate(label).then(res, rej);
        });
      });
    });
  }
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
    var host = null, cur = null;
    var mapsP = mapsReady();   // המפות שעוד לא נבנו — מתחילות עכשיו, במקביל לספריות
    loadLibs().then(function () {
      label('מכין את המפות…');
      // כל אריחי המפות (לכל מפה יש זמן קצוב משלה ב-deck.js), והגופנים — ועוד גבול עליון לכל ההמתנה
      return timeout(Promise.all([mapsP].concat(document.fonts ? [document.fonts.ready] : [])), 15000);
    }).then(function () {
      return tileGate(label);
    }).then(function () {
      label(making);
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
      var txt = false;
      if (pdf) {
        // כותרת, שפה וכיוון קריאה לקוראי מסך ולתוכנות PDF
        var ttl = LCDeck.deckTitle(curPages) || pdfName();
        pdf.setProperties({ title: ttl, subject: ttl, author: 'מצגת לשינוי בקו · הקו הבוחן', creator: 'kavbochan.app', keywords: 'תחבורה ציבורית, שינוי בקו' });
        try { if (pdf.setLanguage) pdf.setLanguage('he'); } catch (e) {}
        try { pdf.viewerPreferences({ Direction: 'R2L', DisplayDocTitle: true }); } catch (e) {}
      }
      // הגופנים מוטמעים פעם אחת לכל המצגת (במקום בכל שקף מחדש)
      return Promise.all([timeout(H.getFontEmbedCSS($('deck'), opts), 10000).catch(function () { return ''; }), pdf ? timeout(loadPdfFont(), 10000) : null]).then(function (rs) {
        var css = rs[0];
        if (rs[1]) { try { pdf.addFileToVFS('Heebo-Regular.ttf', rs[1]); pdf.addFont('Heebo-Regular.ttf', 'Heebo', 'normal'); pdf.setFont('Heebo'); txt = true; } catch (e) { txt = false; } }
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
            var runs = txt ? textRuns(s) : null;   // לפני שהשקף חוזר למקומו (שם הוא מוקטן)
            home.insertBefore(s, after); cur = null;
            if (png) {
              return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? res(b) : rej(new Error('png')); }, 'image/png'); }).then(function (b) {
                pngs.push(b); cv.width = cv.height = 0; i++;
                return new Promise(function (r) { setTimeout(r, 0); }).then(next);
              });
            }
            if (i > 0) pdf.addPage([PW, PH], orient);
            pdf.addImage(cv.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, PW, PH, undefined, 'FAST');
            if (runs) addTextLayer(pdf, runs);
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
      if (e && e.cancel) { if (tab) try { tab.close(); } catch (x) {} dlMsg('ההורדה בוטלה.'); return; }
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
    timeout(mapsReady(), 15000).then(function () {
      var t0 = document.title;
      document.title = LCDeck.deckTitle(curPages) || 'מצגת';
      if (editMode) setEdit(false);
      setTimeout(function () { window.print(); document.title = t0; }, 50);
    });
  }
  /* ייצוא לאקסל (לו"ז עדכני): אותו מבנה של "טבלה לפי יעד", בקובץ xlsx — xlsx.js נטען רק בלחיצה */
  var xlP = null;
  function xlLib() {
    if (window.LCXlsx) return Promise.resolve();
    return xlP || (xlP = new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = 'xlsx.js?v=11'; sc.onload = res; sc.onerror = function () { xlP = null; rej(new Error('xlsx')); };
      document.head.appendChild(sc);
    }));
  }
  function fileName(s) { return s.replace(/[\\\/:*?"<>|,\s]+/g, '-').replace(/-+/g, '-') + '.xlsx'; }
  function exportXlsx() {
    var cu = curPages.filter(function (p) { return p.kind === 'current'; }), tt = curPages.filter(LCDeck.ttCap);
    if (!cu.length && !tt.length) return;
    dlMsg('מכין את קובץ האקסל…');
    var tab = IOS && !SAFARI ? window.open('', '_blank') : null;
    xlLib().then(function () {
      var o = edOpts(formOf()), tv = o.tv, blob, nm;
      if (cu.length) {
        // לו"ז עדכני: שורה לכל קו וכיוון, עמודה לכל קבוצת ימים, ועמודה לחג כשיש — לפי הכרטיס:
        // לוח מודעות — גיליון אחד לכל הקווים; טבלה משולבת — גיליון לכל יעד; תקציר וטבלה לכל קו — גיליון לכל קו
        var M = LCDeck.boardModel(cu, o, { hol: true });
        nm = fileName('לוח-זמנים-' + (edits.bplace || (cu.length <= 3 ? 'קו-' + cu.map(function (p) { return p.line; }).join('-') : M.home)) + '-' + (M.valid || LC.todayIso()));
        if (tv === 'board' || cu.length === 1) blob = LCXlsx.board(M);
        else {
          var gs = [], by = {}, used = {};
          cu.forEach(function (p) {
            var od = p.od || [], k = tv === 'comb' && od[0] && od[1] && od[0] !== od[1] ? [od[0], od[1]].sort().join('|') : p.id;
            if (!by[k]) gs.push(by[k] = []);
            by[k].push(p);
          });
          blob = LCXlsx.book(gs.map(function (g) {
            var od = g[0].od || [], name = (g.length > 1 ? od.filter(Boolean).join('-') : 'קו ' + g[0].line + (od[1] ? ' ' + od[1] : '')).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 28).trim() || 'לו״ז', n = name, i = 2;
            while (used[n]) n = name.slice(0, 25) + ' ' + i++;
            used[n] = 1;
            return [LCDeck.boardModel(g, o, { hol: true }), n];
          }));
        }
      } else if (tv === 'board') {
        // הודעה על שינוי, לוח מודעות — הלוח החדש עם אותם סימונים כמו בשקף (ירוק — חדש או שונה, אדום מחוק — בוטל)
        var B = LCDeck.chgBoardModel(tt, o);
        if (!B.when) B.when = B.valid;
        nm = fileName('לוח-מודעות-קו-' + tt.map(function (p) { return p.line; }).slice(0, 4).join('-') + '-מ-' + (B.when || LC.todayIso()));
        blob = LCXlsx.book([[B, 'לוח מודעות']]);
      } else {
        // הודעה על שינוי: הלו"ז החדש מיום השינוי, ובגיליון שני — הלוח הקודם
        var N = LCDeck.chgModel(tt, o, false), sheets = [[N, 'לו״ז חדש']];
        if (!N.when) N.when = N.valid;
        if (LCDeck.hasOld(tt)) sheets.push([LCDeck.chgModel(tt, o, true), 'הלו״ז הקודם']);
        nm = fileName('לו״ז-חדש-קו-' + tt.map(function (p) { return p.line; }).slice(0, 4).join('-') + '-מ-' + (N.when || LC.todayIso()));
        blob = LCXlsx.book(sheets);
      }
      save(blob, nm, tab);
      dlMsg('');
    }).catch(function () { if (tab) tab.close(); dlMsg('לא הצלחנו להכין את קובץ האקסל. נסו שוב.'); });
  }
  $('xl').addEventListener('click', exportXlsx);
  $('xl2').addEventListener('click', exportXlsx);
  $('dl').addEventListener('click', download);
  $('dl2').addEventListener('click', download);
  document.querySelectorAll('.printbtn').forEach(function (b) { b.addEventListener('click', printDeck); });
  window.LCApp = { ready: function () { return mapsReady(true); }, step: function () { return step; } };
})();
