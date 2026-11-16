/* מצגת לשינוי בקו — אשף בשלושה שלבים: איזה קו? · איזה שינוי? · המצגת (עריכה, תצוגה מקדימה, PDF).
   נתונים:
   - data/lines.json   כל הקווים שפועלים עכשיו (לחיפוש), עם השינויים מהשנה האחרונה (תאריכים בלבד)
   - data/index.json   השינויים הקרובים שזוהו בלילה; data/l/<id>.json — הפרטים של כל אחד
   - ../../line-history/data/lines/<rd>.json — קובצי "הקו בזמן", לשינויים שכבר היו (נטען רק לקו שנבחר)
   כתובת לשיתוף: ?c=<מזהה>[,<מזהה>...] — שינוי קרוב: 10988-20261117 · שינוי שהיה: p-10988-2026-05-01 */
(function () {
  var $ = function (s) { return document.getElementById(s); };
  var E = LC.esc;
  var LH = '../../line-history/data/lines/';
  var PAST_KINDS = { route: 1, stops: 1, 'stops-add': 1, 'stops-del': 1, extend: 1, shorten: 1, terminal: 1 };
  var KIND_TXT = { route: 'דרך אחרת ותחנות אחרות', stops: 'שינוי בתחנות', 'stops-add': 'נוספו תחנות', 'stops-del': 'בוטלו תחנות',
    extend: 'הקו הוארך', shorten: 'הקו קוצר', terminal: 'שינוי בתחנה הראשונה או האחרונה' };

  var LINES = [], OPS = [], CITIES = [], idx = { changes: [] }, upByMakat = {};
  var cache = {}, lhCache = {}, picks = [], cur = null, step = 1, q = '';
  var titleDirty = false, introDirty = false, off = {}, slides = [], maps = [], token = 0, curPages = [];
  var edits = { seg: {} }, edSig = '';

  /* ---------- טעינה ---------- */
  Promise.all([LC.getJSON('data/lines.json'), LC.getJSON('data/index.json')]).then(function (r) {
    var li = r[0]; idx = r[1];
    OPS = li.ops; CITIES = li.cities;
    LINES = li.lines.map(function (a) {
      return { makat: a[0], line: a[1], op: OPS[a[2]], from: a[3], to: a[4], cities: a[5].map(function (i) { return CITIES[i]; }),
        rds: a[6], ty: a[7], past: (a[8] || []).slice().reverse() };
    });
    idx.changes.forEach(function (c) { (upByMakat[c.makat] = upByMakat[c.makat] || []).push(c); });
    LINES.forEach(function (l) { l.n = LC.norm(l.line + ' ' + l.op + ' ' + l.from + ' ' + l.to + ' ' + l.cities.join(' ')); l.up = upByMakat[l.makat] || []; });
    if (idx.feed) $('feed').textContent = ' מ-' + LC.dmy(idx.feed);
    buildChips();
    var want = (new URLSearchParams(location.search).get('c') || '').split(',').filter(Boolean);
    if (want.length) {
      Promise.all(want.map(loadPick)).then(function (ps) {
        picks = ps.filter(Boolean);
        if (picks.length) { cur = lineOf(picks[picks.length - 1].makat, picks[picks.length - 1].op); go(3); }
        else go(1);
      });
    } else go(1);
  }).catch(function () {
    $('results').innerHTML = '<div class="none">לא הצלחנו לטעון את רשימת הקווים. נסו לרענן את הדף.</div>';
  });

  function lineOf(makat, op) {
    return LINES.filter(function (l) { return l.makat === makat && (!op || l.op === op); })[0] || LINES.filter(function (l) { return l.makat === makat; })[0];
  }

  /* ---------- מעבר בין שלבים ---------- */
  function go(n) {
    if (n === 2 && !cur) n = 1;
    if (n === 3 && !picks.length) n = cur ? 2 : 1;
    step = n;
    document.body.setAttribute('data-step', n);
    document.querySelectorAll('.steps [data-go]').forEach(function (b) {
      var k = +b.getAttribute('data-go');
      b.setAttribute('aria-current', k === n ? 'step' : 'false');
      b.disabled = (k === 2 && !cur) || (k === 3 && !picks.length);
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
  $('addline').addEventListener('click', function () { $('q').value = ''; q = ''; go(1); setTimeout(function () { $('q').focus(); }, 50); });

  function emptyStage() {
    $('deck').innerHTML = '<div class="empty-state"><div class="seam" aria-hidden="true"><i></i></div>' +
      '<p>כאן תופיע המצגת: שער, מפה של לפני ואחרי לכל כיוון, רשימת התחנות שיורדות ושנוספות, ושקף סיום.</p></div>';
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
      $('q').value = q = b.getAttribute('data-c'); drawResults();
    });
  }
  $('q').addEventListener('input', function () { q = this.value; drawResults(); });

  function upNext(l) {
    var u = l.up.slice().sort(function (a, b) { return (a.formal || a.eff) < (b.formal || b.eff) ? -1 : 1; });
    return u.filter(function (c) { return (c.formal || c.eff) >= idx.gen; })[0] || u[u.length - 1];
  }
  function badge(l) {
    var u = upNext(l);
    if (u) {
      var s = u.formal || u.eff;
      return '<span class="tag ' + (s >= idx.gen ? 'soon' : 'was') + '">' + (s >= idx.gen ? 'משתנה מ-' : 'השתנה ב-') + LC.dm(s) + '</span>';
    }
    if (l.past.length) { var d = l.past[0][0]; return '<span class="tag was">השתנה ב-' + LC.dm(d) + '.' + d.slice(2, 4) + '</span>'; }
    return '';
  }

  function drawResults() {
    var nq = LC.norm(q), rows, head;
    $('cities').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', LC.norm(b.getAttribute('data-c')) === nq ? 'true' : 'false'); });
    if (!nq) {
      rows = LINES.filter(function (l) { return l.up.some(function (c) { return (c.formal || c.eff) >= idx.gen; }); });
      rows.sort(function (a, b) { var x = upNext(a), y = upNext(b); return (x.formal || x.eff) < (y.formal || y.eff) ? -1 : (x.formal || x.eff) > (y.formal || y.eff) ? 1 : 0; });
      head = 'קווים שמשתנים בשבועיים הקרובים (' + rows.length + ')';
    } else {
      var digits = /^\d+$/.test(nq), words = nq.split(' ');
      rows = LINES.filter(function (l) {
        if (digits) return l.line.indexOf(nq) === 0 || l.makat === nq;
        return words.every(function (w) { return l.n.indexOf(w) >= 0 || l.line.indexOf(w) === 0; });
      });
      rows.sort(function (a, b) {
        var ea = a.line === nq ? 0 : 1, eb = b.line === nq ? 0 : 1;
        if (ea !== eb) return ea - eb;
        // קודם קווים עם שינוי קרוב, אחר כך עם שינוי מהשנה האחרונה
        var ua = a.up.length ? 0 : a.past.length ? 1 : 2, ub = b.up.length ? 0 : b.past.length ? 1 : 2;
        if (ua !== ub) return ua - ub;
        return (parseInt(a.line, 10) || 0) - (parseInt(b.line, 10) || 0) || (a.line < b.line ? -1 : 1);
      });
      head = rows.length ? (rows.length === 1 ? 'קו אחד' : rows.length + ' קווים') : '';
    }
    var max = 80;
    $('reshead').textContent = head + (rows.length > max ? ' · מוצגים ' + max + ' הראשונים, אפשר לחדד את החיפוש' : '');
    $('results').innerHTML = rows.length ? rows.slice(0, max).map(function (l, i) {
      return '<button type="button" class="res" data-i="' + LINES.indexOf(l) + '"><span class="badge">' + E(l.line) + '</span>' +
        '<span class="t"><span class="od">' + E(l.from) + ' ↔ ' + E(l.to) + '</span><span class="meta">' + E(l.op) +
        (l.cities.length ? ' · ' + E(l.cities.slice(0, 3).join(', ')) + (l.cities.length > 3 ? '…' : '') : '') + '</span></span>' + badge(l) + '</button>';
    }).join('') : '<div class="none">לא מצאנו קו כזה. נסו מספר קו, שם עיר או שם חברה.</div>';
  }
  $('results').addEventListener('click', function (ev) {
    var b = ev.target.closest('.res'); if (!b) return;
    cur = LINES[+b.getAttribute('data-i')]; go(2);
  });

  /* ---------- שלב 2: איזה שינוי ---------- */
  function drawChanges() {
    var l = cur;
    $('linehead').innerHTML = '<span class="badge">' + E(l.line) + '</span><div class="t"><b>' + E(l.from) + ' ↔ ' + E(l.to) + '</b><span>' + E(l.op) + '</span></div>';
    $('compare').innerHTML = '';
    var up = l.up.slice().sort(function (a, b) { return (a.formal || a.eff) < (b.formal || b.eff) ? -1 : 1; });
    var html = up.map(function (c) { return card({ key: c.id, date: c.formal || c.eff, tot: c.tot, soon: (c.formal || c.eff) >= idx.gen, dirs: c.dirs.length }); }).join('');
    var pastEv = clusterPast(l.past);
    html += pastEv.map(function (g) {
      return card({ key: 'p-' + l.makat + '-' + g.d, date: g.d, past: true, kinds: g.kinds, dirs: g.rests.length });
    }).join('');
    if (!up.length && !pastEv.length) {
      $('cards').innerHTML = '<div class="none">לא מצאנו בקו הזה שינוי במסלול או בתחנות: לא בשבועיים הקרובים ולא בשנה האחרונה.</div>';
      offerCompare(l);
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
  function card(c) {
    var lbl = c.past ? 'היה ב' : (c.soon ? 'בקרוב' : 'נכנס לתוקף');
    var chips = c.tot ? LC.chips(c.tot) : '<span class="chip mv">טוען…</span>';
    var kinds = c.kinds ? Object.keys(c.kinds).map(function (k) { return KIND_TXT[k] || k; }).join(' · ') : '';
    return '<button type="button" class="ccard' + (c.past ? ' past' : '') + '" data-key="' + E(c.key) + '">' +
      '<span class="when"><span class="l">' + lbl + '</span><b>' + E(LC.wd(c.date) + ' ' + LC.dmy(c.date)) + '</b>' +
      (c.past ? '' : '<span class="l">' + E(LC.rel(idx.gen, c.date)) + '</span>') + '</span>' +
      '<span class="what"><span class="chips">' + chips + '</span><span class="meta">' + (kinds ? E(kinds) + ' · ' : '') +
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
      titleDirty = introDirty = false;
      go(3);
    });
  });

  /* השוואה בין שני תאריכים — כשאין שינוי מזוהה: לפי הגרסאות השמורות ב"הקו בזמן" */
  function offerCompare(l) {
    var box = $('compare');
    box.innerHTML = '<p class="hint">בודקים אם יש גרסאות שמורות של הקו להשוואה…</p>';
    Promise.all(l.rds.map(function (r) { return lhFile(l.makat + '-' + r); })).then(function (files) {
      var dates = {};
      files.forEach(function (f) { if (f) f.vers.forEach(function (v) { dates[v.d] = 1; }); });
      var ds = Object.keys(dates).sort().reverse();
      if (ds.length < 2) { box.innerHTML = '<p class="hint">אין ל"הקו בזמן" גרסאות שמורות של הקו הזה להשוואה, ולכן אי אפשר להכין מצגת. כשיזוהה שינוי — הוא יופיע כאן.</p>'; return; }
      var opt = function (sel) { return ds.map(function (d, i) { return '<option value="' + d + '"' + (i === sel ? ' selected' : '') + '>' + LC.dmy(d) + '</option>'; }).join(''); };
      box.innerHTML = '<div class="cmp"><b>השוואה בין שני תאריכים</b><p class="hint">המסלול והתחנות כפי שנשמרו ב"הקו בזמן".</p>' +
        '<div class="row"><label>לפני <select id="cmpA">' + opt(1) + '</select></label><label>אחרי <select id="cmpB">' + opt(0) + '</select></label></div>' +
        '<button type="button" class="ghost" id="cmpGo">להשוות</button></div>';
      $('cmpGo').addEventListener('click', function () {
        var a = $('cmpA').value, b = $('cmpB').value;
        if (a > b) { var t = a; a = b; b = t; }
        loadPick('x-' + l.makat + '-' + a + '-' + b).then(function (p) {
          if (!p || !p.dirs.some(function (d) { return d.added.length || d.removed.length || d.geo; })) {
            $('cmpGo').insertAdjacentHTML('afterend', '<p class="hint">בין שני התאריכים האלה לא השתנו המסלול והתחנות.</p>'); return;
          }
          picks = picks.filter(function (x) { return x.makat !== p.makat; }); picks.push(p); go(3);
        });
      });
    });
  }

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
        dirs.push(diffDir(f, rests[i], ov, nv));
      });
      if (!dirs.length) return null;
      var tot = { geo: dirs.some(function (x) { return x.geo; }), add: uniq(dirs, 'added'), rem: uniq(dirs, 'removed'), mv: 0 };
      var eff = dirs.map(function (x) { return x.eff; }).sort()[0];
      return { id: (before ? 'x-' + makat + '-' + before + '-' : 'p-' + makat + '-') + d, past: true, cmp: before || null,
        line: l.line, op: l.op, makat: makat, od: [l.from, l.to], eff: eff, formal: null, gen: idx.gen, feed: null, tot: tot,
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
    var geo = os.length > 1 && ns.length > 1 && (LCDeck.deviating(os, ns).length >= 3 || LCDeck.deviating(ns, os).length >= 3);
    var od = LC.odOf(f.dest);
    return { rd: f.rd, dir: rest.split('-')[0], alt: rest.split('-')[1] || '#', od: od, eff: nv.d, formal: null, prevDate: ov.d,
      old: { stops: ov.stops, shape: os }, new: { stops: nv.stops, shape: ns },
      added: added.map(function (s) { return s.code; }), removed: removed.map(function (s) { return s.code; }), moved: moved, geo: geo, swaps: swaps };
  }

  /* ---------- שלב 3: המצגת ---------- */
  function drawPicked() {
    $('picked').innerHTML = picks.map(function (p, i) {
      return '<span class="pk"><span class="badge">' + E(p.line) + '</span><span>' + E(p.past ? 'היה ב-' : 'מ-') + E(LC.dmy(p.formal || p.eff)) + '</span>' +
        (picks.length > 1 ? '<button type="button" data-rm="' + i + '" aria-label="להוציא את קו ' + E(p.line) + ' מהמצגת">×</button>' : '') + '</span>';
    }).join('');
  }
  $('picked').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-rm]'); if (!b) return;
    picks.splice(+b.getAttribute('data-rm'), 1); titleDirty = introDirty = false; rebuild();
  });

  function rebuild() {
    var my = ++token;
    drawPicked();
    try { history.replaceState(null, '', picks.length ? '?c=' + picks.map(function (p) { return p.id; }).join(',') : location.pathname); } catch (e) {}
    if (!picks.length) { emptyStage(); return; }
    var pages = picks.slice().sort(function (a, b) { return (parseInt(a.line, 10) || 0) - (parseInt(b.line, 10) || 0); });
    if (my === token) render(pages);
  }

  function render(pages) {
    curPages = pages;
    maps.forEach(function (m) { m.map.remove(); });
    maps = [];
    var sig = pages.map(function (p) { return p.id; }).join(',');
    if (sig !== edSig) { edSig = sig; edits = loadEdits(sig); }
    slides = LCDeck.build(pages, deckCity(pages), edits);
    var deck = $('deck');
    deck.innerHTML = slides.map(function (s) {
      return '<div class="sframe" data-id="' + E(s.id) + '"' + (off[s.id] ? ' hidden' : '') + '><div class="slide" role="img" aria-label="' + E(s.label) + '">' + s.html + '</div></div>';
    }).join('');
    $('toggles').innerHTML = slides.map(function (s) {
      return '<label><input type="checkbox" value="' + E(s.id) + '"' + (off[s.id] ? '' : ' checked') + '><span>' + E(s.label) + '</span></label>';
    }).join('');
    drawTexts(pages);
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

  /* עיר למצגת של כמה קווים: העיר שמשותפת לכל הקווים */
  function deckCity(pages) {
    if (pages.length < 2) return '';
    var lists = pages.map(function (p) { var l = lineOf(p.makat, p.op); return (p.chcities && p.chcities.length ? p.chcities : []).concat(l ? l.cities : []); });
    var common = lists[0].filter(function (c) { return lists.every(function (x) { return x.indexOf(c) >= 0; }); });
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
    var t = vis.length === 1 ? 'שקף אחד' : vis.length + ' שקפים';
    $('pcount').textContent = t;
    $('tgcount').textContent = '(' + vis.length + ' מתוך ' + slides.length + ')';
  }

  /* ---------- עריכת הטקסט ("מה משתנה?" בשער, וההסבר ליד כל מפה) ----------
     הטקסט שנוצר אוטומטית הוא טיוטה. העריכות נשמרות בדפדפן (localStorage) לכל מצגת בנפרד. */
  function loadEdits(sig) {
    try { var e = JSON.parse(localStorage.getItem('lc-ed:' + sig) || 'null'); if (e && typeof e === 'object') { e.seg = e.seg || {}; return e; } } catch (x) {}
    return { seg: {} };
  }
  function saveEdits() {
    try { localStorage.setItem('lc-ed:' + edSig, JSON.stringify(edits)); } catch (x) {}
  }
  function txRow(attr, i, val, num) {
    return '<div class="txrow">' + (num ? '<i class="segn">' + num + '</i>' : '') +
      '<textarea rows="2" ' + attr + ' data-i="' + i + '" aria-label="שורה ' + (i + 1) + '">' + E(val) + '</textarea>' +
      (num ? '' : '<button type="button" class="rm" data-rmc="' + i + '" aria-label="למחוק את השורה">×</button>') + '</div>';
  }
  function drawTexts(pages) {
    var dr = LCDeck.drafts(pages), h = '';
    if (dr.hasCover) {
      var cv = Array.isArray(edits.cover) ? edits.cover : dr.cover;
      h += '<div class="tx"><div class="txh"><b>מה משתנה? (בשער)</b>' + (Array.isArray(edits.cover) ? '<button type="button" class="lnk" data-reset="cover">שחזור הטקסט המקורי</button>' : '') + '</div>' +
        cv.map(function (t, i) { return txRow('data-c', i, t); }).join('') +
        '<button type="button" class="ghost sm" data-addc="1">+ להוסיף שורה</button></div>';
    }
    dr.segs.forEach(function (g) {
      var cur = edits.seg[g.key];
      h += '<div class="tx"><div class="txh"><b>' + E(g.label) + '</b>' + (cur ? '<button type="button" class="lnk" data-reset="' + E(g.key) + '">שחזור הטקסט המקורי</button>' : '') + '</div>' +
        g.items.map(function (t, i) { return txRow('data-s="' + E(g.key) + '"', i, cur && typeof cur[i] === 'string' ? cur[i] : t, i + 1); }).join('') + '</div>';
    });
    $('texts').innerHTML = h ? '<p class="hint">הטקסט נוצר אוטומטית מהנתונים. אפשר לתקן אותו כאן — המצגת מתעדכנת מיד.</p>' + h : '';
    $('texts').querySelectorAll('textarea').forEach(grow);
  }
  function grow(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }   // השדה גדל לפי הטקסט
  function coverFromFields() {
    return Array.prototype.map.call($('texts').querySelectorAll('textarea[data-c]'), function (t) { return t.value; });
  }
  function paintCover() {
    document.querySelectorAll('[data-k="what"]').forEach(function (ul) {
      ul.innerHTML = (edits.cover || []).filter(function (t) { return t.trim(); }).map(function (t) { return '<li>' + E(t) + '</li>'; }).join('');
    });
  }
  $('texts').addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.tagName === 'TEXTAREA') grow(t);
    if (t.hasAttribute('data-c')) { edits.cover = coverFromFields(); paintCover(); }
    else if (t.hasAttribute('data-s')) {
      var key = t.getAttribute('data-s');
      edits.seg[key] = Array.prototype.map.call($('texts').querySelectorAll('textarea[data-s="' + CSS.escape(key) + '"]'), function (x) { return x.value; });
      document.querySelectorAll('[data-seg="' + CSS.escape(key) + '"][data-i="' + t.getAttribute('data-i') + '"]').forEach(function (el) { el.textContent = t.value; });
    } else return;
    saveEdits();
    var box = t.closest('.tx'), h = box.querySelector('.txh');
    if (!h.querySelector('.lnk')) h.insertAdjacentHTML('beforeend', '<button type="button" class="lnk" data-reset="' + (t.hasAttribute('data-c') ? 'cover' : E(t.getAttribute('data-s'))) + '">שחזור הטקסט המקורי</button>');
  });
  $('texts').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-rmc')) { edits.cover = coverFromFields(); edits.cover.splice(+b.getAttribute('data-rmc'), 1); }
    else if (b.hasAttribute('data-addc')) { edits.cover = coverFromFields().concat(['']); }
    else if (b.hasAttribute('data-reset')) { var k = b.getAttribute('data-reset'); if (k === 'cover') delete edits.cover; else delete edits.seg[k]; saveEdits(); render(curPages); return; }
    else return;
    saveEdits(); paintCover(); drawTexts(curPages);
    if (b.hasAttribute('data-addc')) { var all = $('texts').querySelectorAll('textarea[data-c]'); if (all.length) all[all.length - 1].focus(); }
  });

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
      document.title = $('title').value.trim() || 'מצגת';
      btns.forEach(function (b) { b.disabled = false; b.querySelector('span').textContent = 'הורדת PDF'; });
      setTimeout(function () { window.print(); document.title = t0; }, 50);
    });
  }
  $('dl').addEventListener('click', download);
  $('dl2').addEventListener('click', download);
  window.LCApp = { ready: function () { return Promise.all(maps.map(function (m) { return m.ready; })); }, step: function () { return step; } };
})();
