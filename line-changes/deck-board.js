/* מצגת לשינוי בקו — "טבלה לפי יעד" (לוח מודעות): המודל, העימוד, סדר הקווים וסוגי הקווים, צבע ואות לכל חלופה,
   והלוח של הודעה על שינוי (גם לייצוא לאקסל). חלק מ-LCDeck — נטען אחרי deck.js ו-deck-sign.js (ראו deck.js). */
(function (D) {
  var E = D.E, phoneOf = D.phoneOf, MOT = D.MOT, start = D.start, cover = D.cover, closing = D.closing, streetOf = D.streetOf, onePages = D.onePages,
      fullSlides = D.fullSlides, opsOf = D.opsOf, isKind = D.isKind, mergeSh = D.mergeSh, kindSlides = D.kindSlides, CU_COL = D.CU_COL, hm2 = D.hm2,
      isoDow = D.isoDow, dShort = D.dShort, linesTxt = D.linesTxt, cuDay = D.cuDay, cuMerge = D.cuMerge, altSym = D.altSym, cuTagCol = D.cuTagCol,
      ttCap = D.ttCap, mtDirs = D.mtDirs, lastStop = D.lastStop, mtFrom = D.mtFrom, mtGroups = D.mtGroups, mtDay = D.mtDay, FORMS = D.FORMS,
      isOne = D.isOne, COLORS = D.COLORS, PALETTE = D.PALETTE, contrast = D.contrast, shade = D.shade, agOf = D.agOf, lookVars = D.lookVars,
      signPages = D.signPages, statusPages = D.statusPages;

  /* ================= לו"ז עדכני — "טבלה לפי יעד" (ED.ttc === 'board'), כמו לוח מודעות של שכונה =================
     פס צבעוני לכל יעד (אותו זוג ערים, גם של חברות שונות; קווים עירוניים — "הקווים העירוניים · <עיר>"),
     שורה לכל קו וכיוון עם המוצא (והתחנה הראשונה), עמודות א׳–ה׳ · שישי · מוצ״ש, ובתא — כל שעות היציאה.
     נסיעה בחלופה אחרת — באדום, ומתחת לשעות הערה "<שעות> — <הדרך>". ×2 — תגבור. נסיעה שרק בחלק מהימים — ה׳ קטן ליד השעה.
     הכותרת (ED.btitle) וההערות (ED.bnote) — מהמשתמש. העמודים נחתכים לפי מדידה של הגובה האמיתי בדף.
     boardModel — אותו מבנה, גם לייצוא לאקסל */
  var BD_COLS = [[0, 1, 2, 3, 4], [5], [6]];
  function bdPhone(op) { return phoneOf(op); }
  function bdNum(l) { return (parseInt(l, 10) || 0) * 10 + (String(l).replace(/^\d+/, '') ? 1 : 0); }
  function bdHome(pages) {
    var cnt = {};
    pages.forEach(function (p) { var o = p.od || []; [o[0], o[1]].forEach(function (c) { if (c) cnt[c] = (cnt[c] || 0) + 1; });
      p.dirs.forEach(function (d) { (d.cs || []).forEach(function (c) { cnt[c] = (cnt[c] || 0) + 0.5; }); }); });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || '';
  }
  /* עריכה בלוח (ED.bd): t — טקסט שהמשתמש שינה, לפי מפתח (data-bk); "" — נמחק. offR — שורות (קו+כיוון) שהוסרו,
     offL — קווים שהוסרו (לפי מק"ט). הכול חל גם על השלט, המצגת, הסטטוס והאקסל — כי כולם נבנים מ-bdModel */
  /* לוח באנגלית (ED.blang === 'en', שלמה 24.11): הטקסטים הקבועים מ-LCBoardEN.TXT (board-en.js), השמות מתרגומי משרד התחבורה
     (ED.en — מ-data/tt, מהבונה) או ממה שהמשתמש הקליד (ED.ben); שם בלי תרגום — בעברית, ונרשם ב-BD_MISS (M.miss — לאזהרה לפני ההורדה).
     טקסט שהמשתמש שינה בלוח באנגלית — במפתח משלו ('en|' לפני המפתח), כדי שלא יתערבב עם העברית */
  var BD_IX = null, BD_MISS = {};
  function bdEn() { return D.ED.blang === 'en' && !!window.LCBoardEN; }
  function bdX(k, he) { return bdEn() ? window.LCBoardEN.TXT[k] : he; }
  function bdN(s) { return bdEn() ? window.LCBoardEN.name(s, BD_IX, D.ED.ben, BD_MISS) : s; }
  function bdDs(ix) { return bdEn() ? window.LCBoardEN.days(ix) : dShort(ix); }
  function bdOpN(op) { return bdEn() ? window.LCBoardEN.OPS[op] || bdN(op) : op; }
  function bdHolN(h) { return bdEn() ? window.LCBoardEN.HOL[h] || bdN(h) : h; }
  function bdLinesT(ps) {
    if (!bdEn()) return linesTxt(ps);
    // מספר קו עם אות (1א) — משמאל לימין בתוך הטקסט באנגלית (LRI … PDI), כדי שהרשימה לא תתהפך
    var l = ps.map(function (p) { return /[א-ת]/.test(p.line) ? '\u2066' + p.line + '\u2069' : p.line; }), X = window.LCBoardEN.TXT;
    if (l.length === 1) return X.line + ' ' + l[0];
    var a = l.slice(0, 8);
    return X.lines + ' ' + (l.length > 8 ? a.join(', ') + X.more : a.slice(0, -1).join(', ') + X.and + a[a.length - 1]);
  }
  function bdHeb(s) { return /[א-ת]/.test(s || ''); }
  function bdKk(k) { return bdEn() ? 'en|' + k : k; }
  function bdT(k, dflt) { var t = D.ED.bd && D.ED.bd.t; k = bdKk(k); return t && Object.prototype.hasOwnProperty.call(t, k) && t[k] != null ? t[k] : dflt; }
  function bdOff(kind, k) { var o = D.ED.bd && D.ED.bd[kind]; return !!(o && o[k]); }
  // טקסט שנמחק (""): bdel — לא תופס מקום; במצב עריכה — סימן קטן לשחזור (slides.css)
  function bdDel(k) { var t = D.ED.bd && D.ED.bd.t; return !!(t && t[bdKk(k)] === ''); }
  function bdK(k, cls, ph) { return ' class="bdt' + (cls ? ' ' + cls : '') + (bdDel(k) && !ph ? ' bdel' : '') + '" data-bk="' + E(bdKk(k)) + '"' + (ph ? ' data-ph="' + E(ph) + '"' : ''); }
  /* שורה שהמשתמש הוסיף (ED.bd.nr — [{id, after}]): קו, מוצא ותאים ריקים לכתיבה, באותו פס, מתחת לשורה after */
  function bdNewRow(id) {
    var k = 'n' + id, p = { makat: k, line: '', op: '' }, sm = bdStopMode();
    return { p: p, d: null, add: true, key: k, first: true, n: 1, line: bdT('ln:' + k, ''), op: bdT('op:' + k, ''), color: '#3d4a45',
      origin: bdT(k + '|o', ''), stop: sm === 'all' ? bdT(k + '|s', '') : '', hideS: sm !== 'all', toward: sm === 'none' ? '' : bdT(k + '|w', ''), hideW: sm === 'none',
      towardAll: bdT(k + '|w', ''), until: '', comment: '' };
  }
  /* מה מופיע מתחת למוצא (ED.bstop): 'all' — שם התחנה והקוד, והכיוון (ברירת המחדל); 'dir' — רק "לכיוון …"; 'none' — כלום */
  function bdStopMode() { var m = D.ED.bstop; return m === 'dir' || m === 'none' ? m : 'all'; }
  /* אפשרויות בלוח (נחמיה דרך שלמה, 24.11) — ברירת המחדל כמו קודם: ED.bop === false — בלי שם המפעיל מתחת למספר הקו;
     ED.bend === false — בלי "עד DD.MM" (לרוב זה רק סוף הנתונים של משרד התחבורה, לא שינוי אמיתי); ED.bx2 === false — בלי ×2 ליד השעה ובמקרא;
     ED.bltr — קווים עם אות בנפרד: מק"ט שבו לכל כיוון מספר אחר (1 / 1א — d.l מהבונה) נהיה קו נפרד לכל מספר; ED.bdays — בחירת תאריכים (bdDatePage) */
  function bdOpOn() { return D.ED.bop !== false; }
  function bdEndOn() { return D.ED.bend !== false; }
  function bdX2On() { return D.ED.bx2 !== false; }
  function bdLk(p) { return p._lk || p.makat; }   // המפתח של טקסטים של הקו (מספר, מפעיל, "עד") — לקו שפוצל לפי אות: מק"ט/מספר
  function bdLtrSplit(pages) {
    if (!D.ED.bltr) return pages;
    var out = [];
    pages.forEach(function (p) {
      var by = {}, ns = [];
      p.dirs.forEach(function (d) { var n = d.l || p.line; if (!by[n]) { by[n] = []; ns.push(n); } by[n].push(d); });
      if (ns.length < 2) { out.push(p); return; }
      ns.sort(function (a, b) { return bdNum(a) - bdNum(b) || (a < b ? -1 : a > b ? 1 : 0); }).forEach(function (n) {
        var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; });
        q.line = n; q.dirs = by[n]; q._lk = p.makat + '/' + n; out.push(q);
      });
    });
    return out;
  }
  /* בחירת תאריכים (ED.bdays — {off: {תאריך: 1}, sep: {תאריך: 1}}): הלוח של כל יום בשבוע — מהתאריך הראשון של אותו יום (מהיום, שבועיים
     קדימה) שלא הוצא (off), שאינו בעמודה נפרדת (sep) ושאינו חג — כמו בבונה. תאריך שהוצא (למשל הילולה עם נסיעות נוספות) — נלקח אותו יום
     בשבוע הבא; sep — עמודה משלו עם התאריך ("מוצ״ש 19.12"). הנתונים מ-ttPick: wd (מ-r.w), wd1 (מ-r.w1; null — זהה), x (חגים בשבוע הראשון) */
  var BD_NDAYS = 14;
  function bdDaysSel() {
    var s = D.ED.bdays || {}, off = s.off || {}, sep = s.sep || {};
    return Object.keys(off).length || Object.keys(sep).length ? { off: off, sep: sep } : null;
  }
  function bdDateList(pages) {
    var t0 = pages.map(function (p) { return p.tv || ''; }).filter(Boolean).sort()[0];
    if (!t0) return [];
    var out = [];
    for (var i = 0; i < BD_NDAYS; i++) { var iso = LC.addDays(t0, i); out.push({ iso: iso, w: isoDow(iso), k: i < 7 ? 0 : 1 }); }
    return out;
  }
  /* [יציאות, חלופות, תגבורים] של כיוון בתאריך, או null — אין נתונים (לפני השינוי בקו, מחוץ לשבועיים, סוף הנתונים) */
  function bdOnDate(p, d, iso) {
    if (!d.wd || !p.tv) return null;
    var k = LC.daysBetween(p.tv, iso), w = isoDow(iso);
    if (k < 0 || k >= BD_NDAYS || (p.fromEff && iso < p.fromEff) || (p.wkUntil && iso > p.wkUntil)) return null;
    if (k < 7) return d.x && d.x[iso] ? [d.x[iso], (d.xa || {})[iso] || 0, (d.xn || {})[iso] || 0] : d.wd[w];
    return d.wd1 ? d.wd1[w] : d.wd[w];
  }
  function bdHolOf(p) { var h = {}; (p.tvh || p.hol || []).forEach(function (x) { h[x[0]] = x; }); return h; }
  /* העמוד עם הימים לפי הבחירה: כיוונים חדשים (days/da/dn מהתאריך שנבחר לכל יום, x — גם לתאריכים בעמודה נפרדת); _bw — הימים שיש להם תאריך */
  function bdDatePage(p, sel) {
    if (!p.tv || !p.dirs.some(function (d) { return d.wd; })) return p;
    var hol = bdHolOf(p), ds = bdDateList([p]), q = {}, bw = {};
    Object.keys(p).forEach(function (k) { q[k] = p[k]; });
    q.dirs = p.dirs.map(function (d) {
      if (!d.wd) return d;
      var o = {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; });
      o.days = []; o.da = []; o.dn = []; o.x = Object.assign({}, d.x || {}); o.xa = Object.assign({}, d.xa || {}); o.xn = Object.assign({}, d.xn || {});
      for (var w = 0; w < 7; w++) {
        var t = null;
        ds.some(function (x) { if (x.w !== w || sel.off[x.iso] || sel.sep[x.iso] || hol[x.iso]) return false; t = bdOnDate(p, d, x.iso); return !!t; });
        if (t) bw[w] = 1;
        o.days.push(t ? t[0] : []); o.da.push(t ? t[1] || 0 : 0); o.dn.push(t ? t[2] || 0 : 0);
      }
      ds.forEach(function (x) {
        if (!sel.sep[x.iso] || sel.off[x.iso]) return;
        var t = bdOnDate(p, d, x.iso);
        o.x[x.iso] = t ? t[0] : []; o.xa[x.iso] = t ? t[1] || 0 : 0; o.xn[x.iso] = t ? t[2] || 0 : 0;
      });
      return o;
    });
    q._bw = bw;
    return q;
  }
  /* הודעה על שינוי (chgBdPages): אין לו"ז לכל תאריך — רק לחגים בשבוע הקרוב (hx מהבונה). תאריך חג בעמודה נפרדת — x מ-hx */
  function bdHxPage(p, sep) {
    if (!sep.length || !p.dirs.some(function (d) { return d.hx; })) return p;
    var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; });
    q.dirs = p.dirs.map(function (d) {
      if (!d.hx) return d;
      var o = {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; });
      o.x = Object.assign({}, d.x || {}); sep.forEach(function (iso) { if (d.hx[iso]) o.x[iso] = d.hx[iso]; });
      return o;
    });
    return q;
  }
  /* חנוכה — מלוח השנה העברי של הדפדפן (Intl, כמו hagim.js): 25 בכסלו ושבעת הימים שאחריו. הבונה (tools/hebcal.py) לא מסמן אותו,
     כי הוא לא משנה את הלו"ז ברוב הקווים — כאן רק כדי לתת לתאריך שם כשהשעות בו באמת שונות */
  var BD_HEB = null;
  function bdHanukkah(iso) {
    try {
      BD_HEB = BD_HEB || new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', month: 'long', day: 'numeric' });
      for (var k = 0; k < 8; k++) {
        var o = {}; BD_HEB.formatToParts(new Date(LC.addDays(iso, -k) + 'T12:00:00Z')).forEach(function (x) { o[x.type] = x.value; });
        if (o.month === 'Kislev' && +o.day === 25) return true;
      }
    } catch (e) { /* דפדפן בלי לוח עברי — בלי שם */ }
    return false;
  }
  function bdDayName(w) { return w === 6 ? 'מוצ״ש' : w === 5 ? 'שישי' : 'יום ' + dShort([w]); }
  /* הצעות (שלמה 24.11): לחיצה אחת מחילה, ובלי לחיצה — כלום לא משתנה. {txt, off: [תאריכים], sep: [תאריכים]}.
     חג (hol מהבונה או מ-index.json) שהשעות בו שונות — עמודה נפרדת; מוצ״ש של חנוכה (רק כשהשעות שונות) — עמודה נפרדת, כל התאריכים בהצעה אחת;
     תאריך שהלוח מבוסס עליו (בשימוש), ובקו כלשהו הוא היום היחיד שבו השבוע הראשון שונה מהשני, ולא חג — "לו״ז חריג": להוציא מהלוח */
  function bdSuggest(pages, edits) {
    var keep = D.ED; D.ED = edits || {};
    try {
      var sel = bdDaysSel() || { off: {}, sep: {} }, out = [], dm = LC.dm;
      var add = function (txt, off, sep) {
        off = off.filter(function (x) { return !sel.off[x]; }); sep = sep.filter(function (x) { return !sel.sep[x]; });
        if (off.length || sep.length) out.push({ txt: txt, off: off, sep: sep });
      };
      var tt = pages.filter(function (p) { return p.tv && p.dirs.some(function (d) { return d.wd; }); });
      if (!tt.length) {
        // הודעה על שינוי: חגים בשבוע הקרוב שבהם לו"ז אחר (hx)
        var cps = pages.filter(ttCap);
        (D.ED.hol || []).forEach(function (h) {
          if (!cps.some(function (p) { return mtDirs(p).some(function (d) { return d.hx && d.hx[h[0]]; }); })) return;
          add(h[2] + ' ' + dm(h[0]) + ': עמודה נפרדת', [], [h[0]]);
        });
        return out;
      }
      var ds = bdDates(tt, edits), by = {}; ds.forEach(function (x) { by[x.iso] = x; });
      // חגים מהבונה
      ds.forEach(function (x) { if (x.hol && !x.na && !x.off && x.diff) add(x.hol + ' ' + dm(x.iso) + ': עמודה נפרדת', [], [x.iso]); });
      // חנוכה
      var hk = ds.filter(function (x) { return x.w === 6 && !x.hol && !x.na && x.diff && bdHanukkah(x.iso); });
      if (hk.length) add('חנוכה: ' + hk.map(function (x) { return bdDayName(x.w) + ' ' + dm(x.iso); }).join(' ו-') + (hk.length > 1 ? ' בעמודות נפרדות' : ' בעמודה נפרדת'), [], hk.map(function (x) { return x.iso; }));
      // לו"ז חריג
      var odd = {};
      tt.forEach(function (p) {
        if (p.fromEff) return;
        p.dirs.forEach(function (d) {
          if (!d.wd) return;
          var dif = ds.filter(function (x) { return x.k === 0; }).filter(function (x) {
            var y = by[LC.addDays(x.iso, 7)], a = bdOnDate(p, d, x.iso), b = y && bdOnDate(p, d, y.iso);
            return a && b && JSON.stringify(a) !== JSON.stringify(b);
          });
          if (dif.length === 1) odd[dif[0].iso] = 1;
        });
      });
      Object.keys(odd).sort().forEach(function (iso) {
        var x = by[iso], y = by[LC.addDays(iso, 7)];
        if (!x || !x.used || x.hol || (x.w === 6 && bdHanukkah(iso)) || (y && (y.hol || (y.w === 6 && bdHanukkah(y.iso))))) return;
        add(bdDayName(x.w).replace('מוצ״ש', 'שבת') + ' ' + dm(iso) + ' — לו״ז חריג (שונה מ-' + dm(y.iso) + '): להוציא מהלוח?', [iso], []);
      });
      return out;
    } finally { D.ED = keep; }
  }
  /* לרשימת התאריכים בהגדרות: לכל תאריך — חג, בשימוש (התאריך של היום בשבוע באחד הקווים), הוצא, נפרד, אין נתונים,
     ו-diff — באחד הקווים השעות שונות מאותו יום בשבוע בתאריך אחר */
  function bdDates(pages, edits) {
    var keep = D.ED; D.ED = edits || {};
    try {
      var ps = pages.filter(function (p) { return p.tv && p.dirs.some(function (d) { return d.wd; }); });
      var ds = bdDateList(ps), sel = bdDaysSel() || { off: {}, sep: {} }, used = {}, has = {}, diff = {}, hol = {};
      ps.forEach(function (p) {
        var h = bdHolOf(p); Object.keys(h).forEach(function (k) { hol[k] = h[k]; });
        var q = bdDatePage(p, sel), sig = function (t) { return t ? JSON.stringify(t) : ''; };
        p.dirs.forEach(function (d) {
          if (!d.wd) return;
          var sg = {};
          ds.forEach(function (x) { var t = bdOnDate(p, d, x.iso); if (t) { has[x.iso] = 1; sg[x.iso] = sig(t); } });
          ds.forEach(function (x) { if (sg[x.iso] && ds.some(function (y) { return y.w === x.w && y.iso !== x.iso && sg[y.iso] && sg[y.iso] !== sg[x.iso]; })) diff[x.iso] = 1; });
        });
        // בשימוש: התאריך הראשון של כל יום שנכנס ללוח של הקו
        for (var w = 0; w < 7; w++) {
          if (!q._bw || !q._bw[w]) continue;
          ds.some(function (x) { if (x.w !== w || sel.off[x.iso] || sel.sep[x.iso] || h[x.iso]) return false; if (p.dirs.some(function (d) { return bdOnDate(p, d, x.iso); })) { used[x.iso] = 1; return true; } return false; });
        }
      });
      return ds.map(function (x) {
        return { iso: x.iso, w: x.w, k: x.k, hol: hol[x.iso] ? hol[x.iso][2] : '', used: !!used[x.iso], off: !!sel.off[x.iso], sep: !!sel.sep[x.iso], na: !has[x.iso], diff: !!diff[x.iso] };
      });
    } finally { D.ED = keep; }
  }
  function bdWithNew(rows) {
    var nr = (D.ED.bd && D.ED.bd.nr) || [], out = [];
    var put = function (r) { out.push(r); nr.forEach(function (x) { if (x.after === r.key) put(bdNewRow(x.id)); }); };
    rows.forEach(put);
    return out;
  }
  function bdQ(s) { return String(s || '').replace(/''/g, '"'); }   // כפר חב''ד (ב-GTFS) → כפר חב"ד
  /* לוח של מקום (ED.bpl — {k: 'c' עיר | 'h' שכונה | 's' רחוב, c: העיר, s: קודי התחנות במקום}): רק כיוונים וחלופות שעוצרים בו.
     a — 0 לחלופה הראשית של הכיוון, 1… לחלופות (לפי d.v). בעיר — לפי רשימת הערים (cs / vc); בשכונה וברחוב — לפי קודי התחנות
     (sc / vs, מהבנייה הלילית). כשאין את הנתונים האלה (קובץ ישן) — הכול מוצג, כמו קודם */
  function bdServes(d, a, p) {
    var pl = D.ED.bpl; if (!pl || (p && pl.m && pl.m.indexOf(p.makat) < 0)) return true;   // קו שנוסף ביד, לא מהמקום — כולו
    var hit = function (cs, st) {
      if (pl.k === 'c') return cs ? cs.map(bdQ).indexOf(bdQ(pl.c)) >= 0 : true;
      if (!st || !pl.s) return true;
      var o = {}; pl.s.forEach(function (c) { o[String(c)] = 1; });
      return st.some(function (c) { return o[String(c)]; });
    };
    if (!a) return hit(d.cs, d.sc);
    return hit(d.vc ? d.vc[a - 1] : null, d.vs ? d.vs[a - 1] : null);
  }
  /* פיצול ימי חול: מכל החלוקות של א׳–ה׳ לרצפים (עד 3 עמודות) — זו שבה הכי מעט סימוני ימים ליד שעות ("ה׳", "חוץ מה׳"),
     כשכל עמודה נוספת "עולה" כמו סימון וחצי ועוד BD_SPLIT_COST לכל שורה (כדי שלא יתפצל בגלל נסיעה אחת). בלי סיבה טובה — עמודה אחת.
     שורה שבה כל ימי החול זהים — תא אחד על פני כל העמודות, כך שהיא לא "משלמת" על הפיצול */
  var BD_SPLIT_COST = 0.05;
  function bdWkSplit(rows, W) {
    W = W || [0, 1, 2, 3, 4];   // ימי החול שבלוח (בלוח של השבוע עד השינוי — רק מהיום)
    var cands = [[W]];
    for (var a = 1; a < W.length; a++) {
      cands.push([W.slice(0, a), W.slice(a)]);
      for (var b = a + 1; b < W.length; b++) cands.push([W.slice(0, a), W.slice(a, b), W.slice(b)]);
    }
    var marks = function (g) {   // כמה שעות בשורות מסומנות כ"רק בחלק מהימים" בקבוצה g; שורה שכל הימים בה זהים — אפס
      var n = 0;
      rows.forEach(function (r) {
        var sig0 = bdDaySig(r.d, g[0]);
        if (g.every(function (w) { return bdDaySig(r.d, w) === sig0; })) return;
        var cnt = {};
        g.forEach(function (w) { var seen = {}; (r.d.days[w] || []).forEach(function (m) { if (!seen[m]) { seen[m] = 1; cnt[m] = (cnt[m] || 0) + 1; } }); });
        Object.keys(cnt).forEach(function (m) { if (cnt[m] < g.length) n++; });
        if (r.d.mk) g.forEach(function (w) { n += (r.d.mk[w] || []).filter(function (x) { return x[1]; }).length / g.length; });
      });
      return n;
    };
    var best = null;
    cands.forEach(function (c) {
      var sc = c.reduce(function (t, g) { return t + marks(g); }, 0) + (c.length - 1) * (1.5 + BD_SPLIT_COST * rows.length);
      if (!best || sc < best.sc - 1e-9) best = { sc: sc, c: c };
    });
    return best.c;
  }
  /* מה שרואים ביום w בשורה (לפיצול ימי חול): היציאות, החלופות, התגבורים, וסימוני השינוי */
  function bdDaySig(d, w) {
    if (d.same && d.same[w]) return 's';
    return (d.days[w] || []).join(',') + '/' + (d.da ? d.da[w] || '' : '') + '/' + (d.dn && bdX2On() ? JSON.stringify(d.dn[w] || '') : '') + '/' + (d.mk ? JSON.stringify(d.mk[w] || '') : '');
  }
  /* הכיוונים שמוצגים בלוח לקו: יש בהם נסיעות, ובלוח של מקום — החלופה הראשית שלהם עוצרת במקום */
  function bdDirs(p) { return p.dirs.filter(function (d) { return (d.days.some(function (x) { return x && x.length; }) || (d.same && d.same.some(Boolean))) && bdServes(d, 0, p); }); }
  /* סדר הקווים בלוח (ED.bord): 'add' — לפי הסדר שהקווים נוספו (ED.pord — המק"טים לפי הסדר, ברירת המחדל); 'dest' — לפי יעד
     (הפסים הבינעירוניים ואחריהם העירוניים, כל פס לפי המספר הקטן בו); 'op' — לפי מפעיל (המפעילים לפי הסדר שבו נוספו, ובכל
     מפעיל לפי מספר הקו); 'num' — לפי מספר הקו. בכל הסדרים הפסים נשארים לפי יעד: קווים לאותו יעד יחד, במקום של הראשון מהם */
  // 'man' — ידני: ED.bman — המק"טים בסדר שהמשתמש קבע (במצב עריכה, ↑↓ על פס או על קו, או ברשימת הקווים בשלב 3);
  // קו שלא ברשימה (נוסף אחר כך) — בסוף, לפי הסדר שבו נוסף
  // 'type' — לפי סוג קו (ברירת המחדל): פרקים "קווים עירוניים" / "בין-עירוניים" / "אזוריים" בסדר שהמשתמש בחר (ED.btypes),
  // סוג שהמשתמש הוריד (ED.bthide) — לא בלוח; בתוך כל פרק — לפי הסדר שהוספתם, או לפי מספר הקו (ED.bsub === 'num')
  // מיון בשתי רמות (ED.bk — "קודם לפי" ו"ואז לפי", ED.bord === 'key'): סוג קו / מפעיל / יעד / מספר קו / הסדר שהוספתם.
  // האפשרויות המוכנות הן צירופים קבועים של אותם מפתחות (BD_PRESET). בסוף — תמיד לפי הסדר שהוספתם.
  // מפתח ראשון "סוג קו" — פרקים; "סוג קו" או "מפעיל" ראשון — פס היעד מתחלק לפיו (קווים של מפעיל אחד לא נכנסים לפס של מפעיל אחר)
  // מפעיל — לפי הסדר שהמשתמש בחר (ED.bops), ואחריו המפעילים לפי הסדר שבו נוספו. יעד — הפסים הבינעירוניים ואחריהם העירוניים,
  // כל פס במקום של הקו הראשון בו לפי המפתחות שאחרי "יעד"
  var BD_ORD = ['type', 'add', 'dest', 'op', 'num', 'man', 'key'];
  var BD_KEYS = ['type', 'op', 'dest', 'num', 'add'];
  var BD_PRESET = { type: ['type', 'add'], add: ['add'], dest: ['dest', 'num'], op: ['op', 'num'], num: ['num'] };
  function bdOrd() { return BD_ORD.indexOf(D.ED.bord) >= 0 ? D.ED.bord : 'type'; }
  function bdKeys() {
    var o = bdOrd(); if (o === 'man') return [];
    var k = o === 'key' && Array.isArray(D.ED.bk) ? D.ED.bk.filter(function (x, i, a) { return BD_KEYS.indexOf(x) >= 0 && a.indexOf(x) === i; }).slice(0, 2) : [];
    if (k.length) return k;
    if (o === 'type' || o === 'key') return ['type', D.ED.bsub === 'num' ? 'num' : 'add'];
    return BD_PRESET[o].slice();
  }
  // האפשרות המוכנה שמתאימה למפתחות (לכפתורים), או 'key' — צירוף אחר
  function bdPresetOf(k) {
    if (!k.length) return 'man';
    if (k.length === 2 && k[0] === 'type' && k[1] === 'num') return 'type';
    for (var o in BD_PRESET) if (BD_PRESET[o].join() === k.join()) return o;
    return 'key';
  }
  var BD_TYPES = ['u', 'i', 'r'], BD_TYPE_HE = { u: 'קווים עירוניים', i: 'קווים בין-עירוניים', r: 'קווים אזוריים' }, BD_TYPE_LBL = BD_TYPE_HE;
  function bdTypeOrder() {
    var o = (D.ED.btypes || []).filter(function (t) { return BD_TYPES.indexOf(t) >= 0; });
    BD_TYPES.forEach(function (t) { if (o.indexOf(t) < 0) o.push(t); });
    return o;
  }
  function bdOpK(p) { return String(agOf(p) || p.op); }
  /* keys — המפתחות ([] — ידני, ED.bman); G — הפס של קו לפי יעד ({k, local}), למפתח "יעד" (בלי — המפתח לא משפיע) */
  function bdSort(pages, keys, G) {
    var po = D.ED.pord || [], pm = !keys.length && D.ED.bman ? D.ED.bman : [];
    var rk = function (p) { var j = pm.indexOf(p.makat); if (j >= 0) return j; var i = po.indexOf(p.makat); return pm.length + (i < 0 ? po.length + pages.indexOf(p) : i); };
    var to = bdTypeOrder(), oo = bdOpOrder(pages, rk), dr = {};
    var cmp1 = function (k, a, b) {
      if (k === 'num') return bdNum(a.line) - bdNum(b.line) || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0);
      if (k === 'type') return to.indexOf(a._t) - to.indexOf(b._t);
      if (k === 'op') return oo.indexOf(bdOpK(a)) - oo.indexOf(bdOpK(b));
      if (k === 'dest') return G ? dr[pages.indexOf(a)] - dr[pages.indexOf(b)] : 0;
      return 0;
    };
    var cmp = function (ks) { return function (a, b) { for (var i = 0; i < ks.length; i++) { var c = cmp1(ks[i], a, b); if (c) return c; } return rk(a) - rk(b); }; };
    var di = keys.indexOf('dest');
    if (di >= 0 && G) {
      var gr = {}, n = 0;
      pages.slice().sort(cmp(keys.slice(di + 1))).forEach(function (p) { var g = G(p); if (!(g.k in gr)) gr[g.k] = { r: n++, l: g.local }; });
      pages.forEach(function (p, i) { var g = gr[G(p).k]; dr[i] = (g.l ? 1e6 : 0) + g.r; });
    }
    return pages.slice().sort(cmp(keys));
  }
  /* סדר המפעילים: מה שהמשתמש קבע (ED.bops), ואחריו המפעילים לפי הסדר שבו הקווים שלהם נוספו */
  function bdOpOrder(pages, rk) {
    var have = {}, out = [];
    pages.forEach(function (p) { have[bdOpK(p)] = 1; });
    (D.ED.bops || []).forEach(function (o) { o = String(o); if (have[o] && out.indexOf(o) < 0) out.push(o); });
    pages.slice().sort(function (a, b) { return rk(a) - rk(b); }).forEach(function (p) { var o = bdOpK(p); if (out.indexOf(o) < 0) out.push(o); });
    return out;
  }
  /* כמה תחנות בכל עיר בכיוונים שבלוח (d.cn — מקביל ל-d.cs, מהבנייה הלילית); בלי הנתון — null */
  function bdCityStops(p) {
    var cnt = {}, tot = 0, ok = p._sd.length > 0;
    p._sd.forEach(function (d) {
      if (!d.cn || !d.cs || d.cn.length !== d.cs.length) { ok = false; return; }
      var s = 0;
      d.cs.forEach(function (c, i) { c = bdQ(c); cnt[c] = (cnt[c] || 0) + d.cn[i]; s += d.cn[i]; });
      tot += Math.max(s, d.sc && d.sc.length || 0);   // תחנה בלי עיר — נספרת בסך הכול
    });
    return ok && tot ? { cnt: cnt, tot: tot } : null;
  }
  /* קו בין שתי ערים סמוכות (לוד–רמלה) — עירוני: רוב התחנות (60%) בעיר אחת — העיר של הלוח או אחת אחרת; כמעט כל התחנות (85%)
     בערים שבקצוות; והתחנות צפופות לכל אורך הדרך (בממוצע תחנה לפחות כל 1.25 דקות — אין דרך ארוכה בין הערים).
     כך קו בינעירוני שרוב התחנות שלו בעיר אחת (לוד–תל אביב, בית שמש–לוד) — נשאר בינעירוני */
  var BD_ENDS = 0.85, BD_MOST = 0.6, BD_MIN_STOP = 1.25;
  function bdAdjLocal(p, home) {
    if (p._E.length < 2) return false;
    var x = bdCityStops(p); if (!x) return false;
    var du = 0, ns = 0;
    p._sd.forEach(function (d) { var n = d.sc && d.sc.length || 0; if (d.du && n) { du += d.du; ns += n; } });
    if (!ns || du / ns > BD_MIN_STOP) return false;
    var ends = p._E.reduce(function (t, c) { return t + (x.cnt[c] || 0); }, 0);
    if (ends < BD_ENDS * x.tot) return false;
    var top = Math.max.apply(null, Object.keys(x.cnt).map(function (c) { return x.cnt[c]; }));
    return (home && (x.cnt[home] || 0) >= BD_MOST * x.tot) || top >= BD_MOST * x.tot;
  }
  /* ידני: פס שקווים הועברו אליו (ED.bmb) מתחלק לפי הסדר שבו: רצף של קווים שהועברו ושייכים לאותו יעד — פס משלו, עם הכותרת
     של היעד שלהם (מפתח הטקסט — של הפס המקורי, lk); הקווים של הפס עצמו — תחת הכותרת שלו (כשקו הועבר לאמצע — שני חלקים,
     ולכל אחד כותרת). host — הפס שאליו הועברו (להזזה במצב עריכה), k — מפתח ייחודי לכל חלק */
  function bdSegs(all) {
    var out = [];
    all.forEach(function (b) {
      var segs = [];
      b.pages.forEach(function (p) {
        var sk = p._mv ? p._nbk : b.bk, last = segs[segs.length - 1];
        if (last && last.sk === sk) last.pages.push(p); else segs.push({ sk: sk, pages: [p] });
      });
      if (segs.length === 1 && segs[0].sk === b.bk) { out.push(b); return; }
      var nh = 0, nm = {};
      segs.forEach(function (s) {
        var mv = s.sk !== b.bk, k;
        if (!mv) k = nh++ ? b.k + '~' + nh : b.k;
        else { nm[s.sk] = (nm[s.sk] || 0) + 1; k = b.k + '>' + s.sk + (nm[s.sk] > 1 ? '~' + nm[s.sk] : ''); }
        out.push({ k: k, bk: b.bk, lk: mv ? s.sk : b.k, flat: false, pages: s.pages, mvs: mv, host: b.k, hostPages: mv ? null : b.pages });
      });
    });
    return out;
  }
  /* סדר העמודות (ED.bcols — רשימת מזהים, bdColId): ידני, מההגדרות. מזהה שכבר אין לו עמודה — לא נחשב; עמודה חדשה (למשל תאריך
     שהופרד עכשיו) — אחרי העמודה שלפניה בסדר הרגיל. מחזיר את המזהים בסדר החדש */
  function bdColOrder(ids, saved) {
    if (!saved || !saved.length) return ids.slice();
    var out = [], have = {};
    ids.forEach(function (id) { have[id] = 1; });
    saved.forEach(function (id) { if (have[id] && out.indexOf(id) < 0) out.push(id); });
    ids.forEach(function (id, i) {
      if (out.indexOf(id) >= 0) return;
      var at = 0;
      for (var j = i - 1; j >= 0; j--) { var k = out.indexOf(ids[j]); if (k >= 0) { at = k + 1; break; } }
      out.splice(at, 0, id);
    });
    return out;
  }
  /* מזהה עמודה: ימים ("01234", "5", "6"), תאריך ("h2026-11-27"); עמודות "יום חול" מפוצלות זזות יחד — "wk" */
  function bdColId(c) { return c.wk ? 'wk' : bdColKey(c); }
  /* העמודות בסדר הידני; _i — המקום הרגיל של העמודה (המפתח של טקסט שנכתב בתא נשאר אותו מפתח) */
  function bdColsOrdered(cols, saved) {
    if (!saved || !saved.length || cols.length < 2) return cols;
    var units = [], by = {};
    cols.forEach(function (c, i) { var id = bdColId(c); if (!by[id]) { by[id] = []; units.push(id); } by[id].push(i); });
    var ord = bdColOrder(units, saved);
    if (ord.join(',') === units.join(',')) return cols;
    var out = [];
    ord.forEach(function (id) { by[id].forEach(function (i) { var c = cols[i]; c._i = i; out.push(c); }); });
    return out;
  }
  function bdModel(pages, xo) {
    var keys = bdKeys(), man = !keys.length, k1 = keys[0] || '', flat = !!D.ED.bflat;
    BD_MISS = {}; BD_IX = bdEn() ? window.LCBoardEN.index(D.ED.en) : null;
    // בחירת תאריכים — לא בלוח של השבוע עד השינוי (curPre: שם כבר רק הימים עד השינוי)
    var DSEL = bdDaysSel(), SEPD = DSEL ? Object.keys(DSEL.sep).filter(function (k) { return !DSEL.off[k]; }).sort() : [];
    if (DSEL) pages = pages.map(function (p) { return p.tv ? bdDatePage(p, DSEL) : bdHxPage(p, SEPD); });
    pages = bdLtrSplit(pages);
    // סדר ראשון, בלי סוג הקו והיעד (שעוד לא ידועים) — ממנו העיר "שלנו" כשיש תיקו
    var ps = bdSort(pages, keys.filter(function (k) { return k !== 'type' && k !== 'dest'; })), ord = man ? 'man' : bdPresetOf(keys);
    // המוצא והיעד — מהכיוונים שמוצגים בשורות (העיר של התחנה הראשונה והאחרונה), לא מהשם של הקו ברשימת הקווים
    ps.forEach(function (p) {
      p._sd = bdDirs(p);
      p._E = [];
      p._sd.forEach(function (d) { (d.od || []).forEach(function (c) { c = bdQ(c); if (c && p._E.indexOf(c) < 0) p._E.push(c); }); });
    });
    ps = ps.filter(function (p) { return p._sd.length; });
    // הודעה על שינוי: כשהקווים משתנים בתאריכים שונים — התאריך ליד כל קו ("מ-29.11"), ולא אחד בכותרת
    var vset = {}; ps.forEach(function (p) { if (p.chg) vset[p.valid || p.eff] = 1; });
    BD_FROM = Object.keys(vset).length > 1;
    // לו"ז עדכני של קו שמשתנה השבוע (p.fromEff — הלו"ז מתאריך השינוי והלאה): כשכל הקווים כאלה, מאותו תאריך — "החל מ-29.11"
    // בשורת המשנה; אחרת — ליד כל קו כזה
    var fes = ps.map(function (p) { return p.fromEff || ''; });
    BD_FE = fes.length && fes.every(function (f) { return f && f === fes[0]; }) ? fes[0] : '';
    // הלוח של השבוע עד השינוי (curPre): היום האחרון שלו, והימים בשבוע שבו (רק מהיום ועד יום לפני השינוי)
    var WK = D.curWk(pages), AV = null;
    if (WK) { AV = {}; pages.forEach(function (p) { (p.dow || []).forEach(function (w) { AV[w] = 1; }); }); }
    // בחירת תאריכים: יום בשבוע שאין לו תאריך (כולם הוצאו או בעמודה נפרדת) — לא בכותרת
    if (DSEL && pages.some(function (p) { return p._bw; })) {
      var AV2 = {}; pages.forEach(function (p) { if (!p._bw) [0, 1, 2, 3, 4, 5, 6].forEach(function (w) { AV2[w] = 1; }); else Object.keys(p._bw).forEach(function (w) { AV2[w] = 1; }); });
      if (AV) Object.keys(AV).forEach(function (w) { if (!AV2[w]) delete AV[w]; }); else AV = AV2;
    }
    var inAv = function (w) { return !AV || AV[w]; };
    var home = bdQ(D.ED.bpl && D.ED.bpl.c ? D.ED.bpl.c : bdHome(ps));
    // סוג הקו: לפי משרד התחבורה (ED.ltype — מ-lines.json: u עירוני, i בינעירוני, r אזורי). בלי הנתון — נגזר:
    // עירוני — אותה עיר בשני הקצוות, שני קצוות שהם ערים של קווים עירוניים, או קו בין ערים סמוכות שרוב התחנות שלו בעיר אחת (לוד–רמלה);
    // אזורי — אחד הקצוות הוא מקום בלי קווים פנימיים משלו (מושב, קיבוץ, מועצה אזורית — ED.towns: המקומות שיש בהם קווים פנימיים); אחרת בינעירוני
    var LT = D.ED.ltype || {}, off = function (p) { var t = LT[p.makat]; return BD_TYPES.indexOf(t) >= 0 ? t : ''; };
    var U = {};
    ps.forEach(function (p) { if (p._E.length === 1 && !(off(p) && off(p) !== 'u')) U[p._E[0]] = 1; });
    var dLocal = function (p) { return p._E.length === 1 || p._E.every(function (c) { return U[c]; }) || bdAdjLocal(p, home); };
    var dRegion = function (p) { var tw = D.ED.towns; return !!tw && p._E.some(function (c) { return !tw[c]; }); };
    ps.forEach(function (p) { p._t = off(p) || (dLocal(p) ? 'u' : dRegion(p) ? 'r' : 'i'); p._tsrc = off(p) ? 'mot' : 'derived'; });
    var local = function (p) { return p._t === 'u'; };
    // לפי סוג קו: כמה קווים מכל סוג (לרשימה בשלב 3), וסוג שהמשתמש הוריד — לא בלוח
    var tcount = { u: 0, i: 0, r: 0 };
    ps.forEach(function (p) { tcount[p._t]++; });
    if (keys.indexOf('type') >= 0 && D.ED.bthide) ps = ps.filter(function (p) { return !D.ED.bthide[p._t]; });
    var par = {}, find = function (c) { while (par[c] && par[c] !== c) c = par[c]; return c; };
    ps.forEach(function (p) { if (!local(p)) return; p._E.forEach(function (c) { par[c] = par[c] || c; }); p._E.forEach(function (c) { par[find(c)] = find(p._E[0]); }); });
    var k0of = function (p) { return local(p) ? 'L|' + find(p._E[0]) : 'I|' + p._E.slice().sort().join('|'); };
    ps = bdSort(ps, keys, function (p) { return { k: k0of(p), local: local(p) }; });
    // המפעילים שבלוח, לפי הסדר (לרשימה בשלב 3)
    var po0 = D.ED.pord || [], opn = {};
    var opl = bdOpOrder(ps, function (p) { var i = po0.indexOf(p.makat); return i < 0 ? po0.length + pages.indexOf(p) : i; });
    ps.forEach(function (p) { var o = bdOpK(p); opn[o] = opn[o] || { k: o, name: p.op, n: 0 }; opn[o].n++; });
    // הפס של כל קו: לפי יעד (סוג קו או מפעיל ראשון — גם לפיהם); בלי פסי יעד (ED.bflat) — פס אחד (בכל פרק). ידני — קו שהמשתמש
    // העביר לפס אחר (ED.bmb: מק"ט → הפס) נכנס לשם, כל עוד הפס קיים
    var grp = function (p) { return k1 === 'type' ? p._t : k1 === 'op' ? bdOpK(p) : ''; };
    var natK = function (p) { var k0 = k0of(p), g = grp(p); return flat ? 'F|' + (k1 === 'type' ? p._t : '') : g ? g + '>' + k0 : k0; };
    var nat = {}; ps.forEach(function (p) { p._nbk = natK(p); nat[p._nbk] = 1; });
    var by = {}, all = [], used = {};
    ps.forEach(function (p) {
      var bk = p._nbk, mv = man && !flat && D.ED.bmb && D.ED.bmb[p.makat];
      p._mv = !!(mv && nat[mv] && mv !== bk);
      if (p._mv) bk = mv;
      if (!by[bk]) {
        var k0 = bk.replace(/^[^>]*>/, ''), k = used[k0] ? k0 + '#' + bk.split('>')[0] : k0; used[k0] = 1;
        by[bk] = { k: k, bk: bk, flat: flat, pages: [] }; all.push(by[bk]);
      }
      by[bk].pages.push(p);
    });
    // ידני: קו שהועבר לפס של יעד אחר — לא נכנס מתחת לכותרת של הפס הזה, אלא בפס משלו באותו מקום, עם היעד שלו (bdSegs)
    if (man && !flat) all = bdSegs(all);
    // מה שמגדיר את הפס (עירוני, סוג, הקצוות) — מהקווים שבו מלכתחילה, לא מקו שהועבר אליו (בפס שהתפצל — מכל הקווים שלו)
    all.forEach(function (b) {
      var np = (b.hostPages || b.pages).filter(function (p) { return !p._mv; }), p0 = (np[0] || b.pages[0]);
      b.np = np.length ? np : b.pages; b.local = flat ? b.pages.every(local) : local(p0); b.t = p0._t; b.E = p0._E;
    });
    var bands = all, ci = 0, colBy = {};
    if (bdEn()) BD_TYPE_LBL = { u: bdX('secU'), i: bdX('secI'), r: bdX('secR') };
    else BD_TYPE_LBL = BD_TYPE_HE;
    if (k1 === 'type') {
      var to = bdTypeOrder();
      bands = bands.map(function (b, i) { return [b, i]; }).sort(function (x, y) { return to.indexOf(x[0].t) - to.indexOf(y[0].t) || x[1] - y[1]; }).map(function (x) { return x[0]; });
      // כותרת פרק מעל הפס הראשון של כל סוג (אפשר לשנות או למחוק, כמו כל טקסט בלוח)
      bands.forEach(function (b, i) { if (!i || bands[i - 1].t !== b.t) { b.sec = b.t; b.secLabel = bdT('sec:' + b.t, BD_TYPE_LBL[b.t]); } });
    }
    bands.forEach(function (b) {
      if (b.flat) b.label = '';   // בלי פסי יעד — אין כותרת פס
      else if (b.local) {
        var cs = b.E.slice(); b.np.forEach(function (p) { p._E.forEach(function (c) { if (cs.indexOf(c) < 0) cs.push(c); }); });
        cs.sort(function (x, y) { return (y === home) - (x === home); });
        b.label = (b.np.length > 1 ? bdX('cityLines', 'הקווים העירוניים · ') : bdX('cityLine', 'קו עירוני · ')) + cs.map(bdN).join(', ');
      } else {
        // הזוגות (מוצא, יעד) של השורות; כשלכל השורות אותם שני קצוות — "א – ב"; אחרת הקצה המשותף מול השאר ("קרית מלאכי / באר טוביה – נחם")
        var pairs = [];
        b.np.forEach(function (p) { p._sd.forEach(function (d) { pairs.push((d.od || []).map(bdQ)); }); });
        var ends = b.E, shared = ends.filter(function (c) { return pairs.every(function (q) { return q.indexOf(c) >= 0; }); });
        var homeFirst = function (x, y) { return (y === home) - (x === home); };
        if (ends.length === 1) b.label = bdN(ends[0]);   // קו שיוצא וחוזר לאותו מקום (קו אזורי מעגלי)
        else if (ends.length === 2) b.label = ends.slice().sort(homeFirst).map(bdN).join(' – ');
        else if (shared.length === 1) {
          var rest = ends.filter(function (c) { return c !== shared[0]; }).sort(homeFirst);
          b.label = rest.indexOf(home) >= 0 ? rest.map(bdN).join(' / ') + ' – ' + bdN(shared[0]) : bdN(shared[0]) + ' – ' + rest.map(bdN).join(' / ');
        } else b.label = ends.slice().sort(homeFirst).map(bdN).join(' / ');
        // "(דרך X)": רק כש-X לא אחד הקצוות, וכל השורות בפס עוצרות בו
        var via = home && ends.indexOf(home) < 0 && b.np.every(function (p) { return p._sd.every(function (d) { return (d.cs || []).map(bdQ).indexOf(home) >= 0; }); });
        if (via) b.label += ' (' + bdX('via', 'דרך ') + bdN(home) + ')';
      }
      b.label = bdT('band:' + (b.lk || b.k), b.label);
      var ags = opsOf(b.pages.map(function (p) { return { op: String(agOf(p)) }; }));
      // חלקים של אותו פס, ופס של קו שהועבר והפס המקורי שלו — באותו צבע
      b.color = b.lk && colBy[b.lk] ? colBy[b.lk] : ags.length === 1 && COLORS[ags[0]] ? cuTagCol(ags[0], 0) : CU_COL[ci++ % CU_COL.length];
      colBy[b.lk || b.k] = colBy[b.lk || b.k] || b.color;
      b.ops = opsOf(b.pages);
      b.rows = [];
      b.pages.forEach(function (p) {
        var ds = p._sd.slice();
        // הכיוון שיוצא מהעיר "שלנו" — ראשון
        ds.sort(function (x, y) { return (bdQ((y.od || [])[0]) === home) - (bdQ((x.od || [])[0]) === home) || (x.dir < y.dir ? -1 : 1); });
        // קו שהועבר לפס אחר, או בלי פסי יעד — המוצא והיעד בשורה לפי הקו עצמו (עירוני או לא)
        ds.forEach(function (d, i) { b.rows.push(bdRow(p, d, i, ds.length, b.flat || p._mv ? { local: local(p) } : b)); });
      });
      b.rows = bdWithNew(b.rows);
      // שורות וקווים שהוסרו: נשארים ברשימה (כדי שאפשר יהיה להחזיר אותם במצב עריכה) עם off; פס שכל השורות בו הוסרו — off
      b.rows.forEach(function (r) { r.offL = bdOff('offL', r.p.makat); r.off = r.offL || bdOff('offR', r.key); });
      b.off = b.rows.every(function (r) { return r.off; });
    });
    // פרק שכל הפסים בו הוסרו — גם הכותרת שלו (רק במצב עריכה)
    bands.forEach(function (b, i) { if (b.sec) { var j = i; b.secOff = true; while (j < bands.length && bands[j].t === b.t) { if (!bands[j].off) b.secOff = false; j++; } } });
    var vis = function (r) { return !r.off; };
    // עמודות: א׳–ה׳ · שישי · מוצ״ש (רק מה שיש בו נסיעות); שבת שכולה בערב — "מוצאי שבת".
    // פיצול ימי חול (ED.bsplit, ברירת מחדל — אוטומטי): יום חול שבאחד הקווים יש בו לו"ז אחר משאר הימים — עמודה משלו
    // (ימים שבכל השורות אותו לו"ז — באותה עמודה; כך מספר העמודות הקטן ביותר), תחת כותרת משותפת "יום חול"
    var cols = [], wk = [[0, 1, 2, 3, 4]];
    if (D.ED.bsplit !== false) {
      var rowsV = []; bands.forEach(function (b) { b.rows.forEach(function (r) { if (vis(r) && !r.add) rowsV.push(r); }); });
      wk = bdWkSplit(rowsV, [0, 1, 2, 3, 4].filter(inAv));
    } else wk = [[0, 1, 2, 3, 4].filter(inAv)];
    var cgs = wk.concat([[5], [6]]).map(function (g) { return g.filter(inAv); }).filter(function (g) { return g.length; });
    cgs.forEach(function (days, gi) {
      var any = false, eve = true;
      bands.forEach(function (b) { b.rows.filter(vis).forEach(function (r) { if (r.add) return; days.forEach(function (w) { var l = r.d.days[w] || []; if (l.length || (r.d.same && r.d.same[w])) any = true; if (r.d.same && r.d.same[w]) eve = false; l.forEach(function (m) { if (m < 16 * 60) eve = false; }); }); }); });
      if (!any) return;
      var isWk = days[0] < 5, split = isWk && wk.length > 1;
      cols.push({ days: days, wk: split, label: bdT('th:' + days.join(''), split ? (days.length === 1 ? (bdEn() ? '' : 'יום ') + bdDs(days) : bdDs(days)) : isWk ? bdX('days', 'ימים ') + bdDs(days) : days[0] === 5 ? bdX('friday', 'יום שישי') : eve ? bdX('satNight', 'מוצאי שבת') : bdX('saturday', 'שבת')) });
    });
    // ימים בעמודות של ימי חול שאין בהם נסיעות בכלל (למשל לוח בלי יום רביעי) — נכנסים לעמודה הסמוכה, כדי שלא יחסרו בכותרת
    var nWk = cols.filter(function (c) { return c.wk; }).length;
    if (nWk === 1) cols.forEach(function (c) { if (c.wk) { c.wk = false; c.label = bdT('th:' + c.days.join(''), bdX('days', 'ימים ') + bdDs(c.days)); } });
    // לאקסל: עמודה לחג בשבוע הקרוב — רק כשהשעות בו שונות מהיום הרגיל באחד הקווים (כמו ב"משולב")
    // בחירת תאריכים: עמודה לכל תאריך נפרד — אחרי העמודה של אותו יום בשבוע, עם התאריך ("מוצ״ש 19.12", או שם החג)
    // בלוח מהשינוי (יש קו עם fromEff) — רק תאריכים מהשינוי; התאריכים שלפניו בלוח של השבוע עד השינוי
    var FE0 = pages.map(function (p) { return p.fromEff || ''; }).filter(Boolean).sort()[0] || '';
    SEPD.forEach(function (iso) {
      if ((WK && iso > WK) || (!WK && FE0 && iso < FE0)) return;
      var x = { iso: iso, w: isoDow(iso) }, any = false, eve = true, hn = '';
      pages.forEach(function (p) { var h = bdHolOf(p)[x.iso]; if (h) hn = h[2]; });
      (D.ED.hol || []).forEach(function (h) { if (h[0] === iso) hn = h[2]; });
      bands.forEach(function (b) { b.rows.filter(vis).forEach(function (r) { if (r.add || !r.d.x || !r.d.x[x.iso]) return; r.d.x[x.iso].forEach(function (m) { any = true; if (m < 16 * 60) eve = false; }); }); });
      if (!any) return;
      var nm = hn ? bdHolN(hn) : (x.w === 6 ? (eve ? bdX('satNight', 'מוצאי שבת') : bdX('saturday', 'שבת')) : x.w === 5 ? bdX('friday', 'יום שישי') : (bdEn() ? '' : 'יום ') + bdDs([x.w]));
      var c = { days: [x.w], hol: [x.iso, 'sep', nm], sep: true, label: bdT('th:d' + x.iso, nm + ' ' + LC.dm(x.iso)) }, at = cols.length;
      for (var i = cols.length - 1; i >= 0; i--) if (cols[i].days[0] <= x.w) { at = i + 1; break; } else at = i;
      cols.splice(at, 0, c);
    });
    if (xo && xo.hol) ((D.ED.hol && D.ED.hol.length ? D.ED.hol : (pages[0] || {}).hol) || []).forEach(function (h) {
      if (WK && h[0] > WK) return;
      if (DSEL && (DSEL.off[h[0]] || DSEL.sep[h[0]])) return;
      if (bands.some(function (b) { return b.rows.some(function (r) { return !r.off && r.d && r.d.x && r.d.x[h[0]]; }); }))
        cols.push({ days: [isoDow(h[0])], hol: h, label: bdHolN(h[2]) + ' ' + LC.dm(h[0]) });
    });
    cols = bdColsOrdered(cols, D.ED.bcols);
    bands.forEach(function (b) { b.rows.forEach(function (r) {
      // שורה שבה כמה עמודות של ימי חול זהות — תא אחד על פני כולן
      var mcols = cols.map(function (c) { return c; });
      if (!r.add) for (var a = 0; a < cols.length; a++) {
        if (!cols[a].wk) continue;
        var z = a + 1;
        while (z < cols.length && cols[z].wk && cols[z].days.every(function (w) { return bdDaySig(r.d, w) === bdDaySig(r.d, cols[a].days[0]); })) z++;
        if (z - a > 1) { mcols[a] = { days: [].concat.apply([], cols.slice(a, z).map(function (c) { return c.days; })).sort(), label: cols[a].label, span: z - a }; for (var y = a + 1; y < z; y++) mcols[y] = { skip: true }; }
        a = z - 1;
      }
      r.cells = mcols.map(function (c, i) { if (c.skip) return { skip: true, ents: [], notes: [] }; var x = bdCellX(r, c, cols[i]._i != null ? cols[i]._i : i); if (c.span) x.span = c.span; return x; });
      bdAltMarks(r);
    }); });
    function bdCellX(r, c, i) {
      return r.add ? { ents: [], notes: [], key: r.key + '|c' + i, nkey: r.key + '|n' + i, txt: bdT(r.key + '|c' + i, ''), ntxt: bdT(r.key + '|n' + i, null), ph: 'שעות' } : bdCell(r, c, i);
    }
    var valid = pages.map(function (p) { return p.valid || p.eff; }).filter(Boolean).sort()[0] || '';
    var unt = pages.map(function (p) { return p.until || ''; }), until = bdEndOn() && unt.every(function (u) { return u && u === unt[0]; }) ? unt[0] : '';
    // הקווים שנשארו בלוח (אחרי הסרות) — לשורת המשנה ולמוקדי המידע
    var vps = ps.filter(function (p) { return bands.some(function (b) { return b.rows.some(function (r) { return r.p === p && !r.off; }); }); });
    var ops = opsOf(vps), cities = [];
    if (home) cities.push(home);
    var chg = ps.some(function (p) { return p.chg; });
    var bplace = bdEn() && bdHeb(D.ED.bplace) ? bdN(D.ED.bplace) : D.ED.bplace;   // בלוח באנגלית — טקסט בעברית של העורך לא נכנס כמו שהוא
    var dflt = chg ? bdX('titleNew', 'לוח הזמנים החדש') + ' · ' + bdLinesT(ps) : bdX('title', 'זמני נסיעות') + ' · ' + (bplace || (ps.length <= 3 ? bdLinesT(ps) : cities.map(bdN).join(', ')) || bdLinesT(ps));
    var alts = bands.some(function (b) { return b.rows.some(function (r) { return !r.off && r.cells.some(function (x) { return x.notes.length && x.ntxt == null && x.txt == null; }); }); });
    // השבוע עד השינוי: "עד 28.11 · מ-29.11 — לוח זמנים חדש" (הלוח שאחריו — "החל מ-29.11")
    var sub = bdEn() ? [WK ? bdX('fromD') + LC.dm(valid) + bdX('until') + LC.dm(WK) + ' · ' + bdX('from') + LC.dm(LC.addDays(WK, 1)) + ' — ' + bdX('newTt') : BD_FROM ? bdX('fromEach') : BD_FE ? bdX('fromD') + LC.dm(BD_FE) + (until ? bdX('until') + LC.dm(until) : '') : valid ? bdX('validFrom') + LC.dmy(valid) + (until ? bdX('until') + LC.dmy(until) : '') : '', vps.length ? bdLinesT(vps) : ''].filter(Boolean).join(' · ')
      : [WK ? 'מ-' + LC.dm(valid) + ' עד ' + LC.dm(WK) + ' · מ-' + LC.dm(LC.addDays(WK, 1)) + ' — לוח זמנים חדש' : BD_FROM ? 'בתוקף מהתאריך שליד כל קו' : BD_FE ? 'החל מ-' + LC.dm(BD_FE) + (until ? ' עד ' + LC.dm(until) : '') : valid ? 'בתוקף מ-' + LC.dmy(valid) + (until ? ' עד ' + LC.dmy(until) : '') : '', vps.length ? linesTxt(vps) : ''].filter(Boolean).join(' · ');
    var contacts = ops.map(function (o) { return [o, bdPhone(o)]; }).filter(function (x) { return x[1]; }).concat([['משרד התחבורה', MOT]])
      .map(function (c) { return [bdT('phn:' + c[0], bdOpN(c[0])), bdT('php:' + c[0], c[1]), c[0]]; }).filter(function (c) { return c[0] || c[1]; });
    var btitle = bdEn() ? D.ED.btitleEn : D.ED.btitle, bnote = bdEn() ? D.ED.bnoteEn : D.ED.bnote;
    // מראה הלוח — גם לייצוא לאקסל: יישור הכותרת, צבעים, רקע ויישור לשורה ולתא
    return { look: { tal: D.ED.btal || '', clr: D.ED.bclr || null, bg: (D.ED.bd && D.ED.bd.bg) || {}, al: (D.ED.bd && D.ED.bd.al) || {} }, ord: ord, keys: keys, flat: flat, opList: opl.map(function (o) { return opn[o]; }).filter(Boolean), cw: bdCwOf(cols), tcount: tcount, types: bdTypeOrder(), title: bdT('title', ((btitle || '').trim() || dflt) + (WK ? ' · ' + bdX('untilD', 'עד ') + LC.dm(WK) : BD_FE ? ' · ' + bdX('fromD', 'החל מ-') + LC.dm(BD_FE) : '')), dflt: dflt, valid: valid, fe: BD_FE, wk: WK, until: until, sub: bdT(WK ? 'wsub' : 'sub', sub), subDflt: sub, subK: WK ? 'wsub' : 'sub', home: home, cols: cols, bands: bands, pages: vps.length ? vps : ps,
      // "עדכונים": מה שהמשתמש כתב; בלי טקסט — משפט על הנסיעות באדום, רק כשיש כאלה בלוח (אחרת השורה לא מופיעה); נמחק בלוח — לא מופיע
      note: bdT('note', (bnote || '').trim() || (alts ? bdX('altNote', 'נסיעות שמסומנות בסימן ובצבע (# ^ $…) עוברות בדרך אחרת') : '')), contacts: contacts,
      // המשפט על הנסיעות בסימן — רק בעמוד שיש בו נסיעה כזו (bdFoot), כשהמשתמש לא כתב או שינה את "עדכונים"
      noteAuto: !(bnote || '').trim() && bdT('note', null) == null,
      feed: pages.map(function (p) { return p.feed; }).filter(Boolean).sort().pop() || '', credit: D.ED.credit !== false, tord: D.ED.tord || 'ltr', x2: bdX2On(),
      // כל טקסט בלוח ניתן לעריכה: כותרות העמודות, "עדכונים", "מוקדי מידע", שורת ההסבר והקרדיט (את הקרדיט מורידים ב"להוסיף קרדיט", שלמה 22.11)
      th: { line: bdT('th:line', bdX('thLine', 'קו')), orig: bdT('th:orig', bdX('thOrig', 'מוצא')), wk: bdT('th:wk', bdX('thWk', 'יום חול')) }, lbl: { upd: bdT('lbl:upd', bdX('upd', 'עדכונים')), ph: bdT('lbl:ph', bdX('ph', 'מוקדי מידע')), cont: bdT('lbl:cont', bdX('cont', '(המשך)')), off: bdT('lbl:off', bdX('off', 'אינו פעיל')), same: bdT('lbl:same', bdX('same', 'ללא שינוי')) },
      legend: bdT('legend', null), creditTxt: bdT('credit', '') || BD_CR, en: bdEn(), miss: Object.keys(BD_MISS),
      // הודעה על שינוי: מקרא לסימונים (ירוק — חדש או שונה, אדום מחוק — בוטל), רק כשיש כאלה בלוח
      chg: chg, key: chg ? { nw: bdT('lbl:knw', bdX('keyNew', 'חדש או שונה')), rm: bdT('lbl:krm', bdX('keyRm', 'בוטל')), hasNw: bdHas(bands, 'nw'), hasRm: bdHas(bands, 'rm') } : null };
  }
  /* חלופות בשורה (קו וכיוון): לכל חלופה סימן (# ^ $ ~ + *, כמו בלוחות של קווים) וצבע משלה — לפי הסדר של d.v. הסימן אחרי השעה,
     כדי שגם בהדפסה בשחור-לבן רואים איזו נסיעה באיזו דרך; ההערה מתחת לתא ובמקרא — באותו צבע ועם אותו סימן. r.alts — למקרא */
  var BD_ALT_COL = ['#c81e1e', '#7e22ce', '#c2410c', '#0f766e', '#92400e', '#be185d', '#1d4ed8', '#4d7c0f'];
  function bdAltMarks(r) {
    var used = {};
    (r.cells || []).forEach(function (x) { x.ents.forEach(function (e) { if (e.a) used[e.a] = 1; }); });
    var as = Object.keys(used).map(Number).sort(function (a, b) { return a - b; }), mk = {};
    r.alts = as.map(function (a, i) {
      return (mk[a] = { a: a, L: altSym(i), c: BD_ALT_COL[i % BD_ALT_COL.length], txt: bdAltTxt((r.d && r.d.v || [])[a - 1]) });
    });
    (r.cells || []).forEach(function (x) {
      x.ents.forEach(function (e) { if (e.a) { e.al = mk[e.a].L; e.ac = mk[e.a].c; } });
      x.notes.forEach(function (nt) { if (nt.a) { nt.L = mk[nt.a].L; nt.c = mk[nt.a].c; } });
    });
  }
  function bdHas(bands, k) { return bands.some(function (b) { return b.rows.some(function (r) { return !r.off && (r.cells || []).some(function (x) { return x.txt == null && (k === 'rm' ? (x.rm || []).length : x.ents.some(function (e) { return e.k || e.nwp; })); }); }); }); }
  var BD_FROM = false, BD_FE = '';
  function bdAltTxt(v) { return v && v !== 'במסלול אחר' ? bdN(v) : bdX('otherRoute', 'במסלול אחר'); }
  var BD_CR = 'הוכן בכלי ״מצגת לשינוי בקו״ של הקו הבוחן · kavbochan.app';
  function bdRow(p, d, i, n, b) {
    var o = (d.od || []).map(bdQ), inter = !b.local && o[0] && o[1] && o[0] !== o[1], cs = (d.cs || []).map(bdQ);
    var to = inter ? o[1] : d.t, city0 = cs[0] || o[0] || '';
    var en = bdEn(), toE = en ? bdN(d.h || to) : '';
    var stop = bdN(d.f) + (d.fc ? ' (' + d.fc + ')' : ''), k = p.makat + '.' + d.dir, sm = bdStopMode(), tw = bdT(k + '|w', en ? (toE ? bdX('toward') + toE : '') : to ? 'לכיוון ' + to : '');
    return { p: p, d: d, key: k, first: i === 0, n: n, inter: inter, line: bdT('ln:' + bdLk(p), p.line), op: bdOpOn() ? bdT('op:' + bdLk(p), bdOpN(p.op)) : '', hideOp: !bdOpOn(), color: bdOpCol(p), color2: bdOpCol2(p),
      origin: bdT(k + '|o', en ? (inter ? bdX('from') + bdN(o[0]) : bdN(d.f)) : inter ? 'מ' + o[0] : d.f),
      // מתחת למוצא (ED.bstop): הכל — התחנה והכיוון; 'dir' — רק הכיוון; 'none' — כלום. towardAll — הכיוון גם כשהוא מוסתר (למקרא)
      stop: sm === 'all' ? bdT(k + '|s', inter ? stop : (d.fc ? bdX('stop', 'תחנה ') + d.fc : '')) : '', hideS: sm !== 'all',
      toward: sm === 'none' ? '' : tw, hideW: sm === 'none', towardAll: tw,
      from: p.chg && BD_FROM ? bdT('fr:' + bdLk(p), bdX('fromD', 'מ-') + LC.dm(p.valid)) : p.fromEff && !BD_FE ? bdT('fr:' + bdLk(p), bdX('fromD', 'החל מ-') + LC.dm(p.fromEff)) : '',
      until: bdEndOn() && p.until || '', untilTxt: bdEndOn() && p.until ? bdT('un:' + bdLk(p), bdX('untilD', 'עד ') + LC.dm(p.until)) : '',
      comment: en ? (toE ? bdX('toward') + toE + ': ' : '') + bdN(d.f) + ' (' + [d.fc, bdN(city0)].filter(Boolean).join(' | ') + ')'
        : (to ? 'לכיוון ' + to + (cs.length && cs[cs.length - 1] !== to ? ', ' + cs[cs.length - 1] : '') + ': ' : '') +
        d.f + ' (' + [d.fc, city0].filter(Boolean).join(' | ') + ')' };
  }
  /* תא: היציאות של שורה אחת בקבוצת ימים; נסיעה שרק בחלק מהימים — part (למשל "ה׳"), חלופה — a, תגבור — n */
  function bdCell(r, c, i) {
    var mg = cuMerge([{ p: r.p, d: r.d }], c.days, c.hol ? function (it, w) { var x = it.d.x && it.d.x[c.hol[0]]; return x ? [x, (it.d.xa || {})[c.hol[0]], (it.d.xn || {})[c.hol[0]]] : cuDay(it, w); } : null), alts = {};
    var ents = mg.ents.filter(function (e) { return !e.a || bdServes(r.d, e.a, r.p); }).map(function (e) {   // נסיעה של חלופה שלא עוצרת במקום — לא בלוח
      var part = '';
      if (e.part) { var miss = c.days.filter(function (w) { return e.days.indexOf(w) < 0; }); part = e.days.length <= miss.length ? bdDs(e.days) : bdX('except', 'חוץ מ') + bdDs(miss); }
      if (e.a) (alts[e.a] = alts[e.a] || []).push(hm2(e.m));
      return { m: e.m, t: hm2(e.m), a: e.a, n: bdX2On() ? e.n : 1, part: part, days: e.days };
    });
    var notes = Object.keys(alts).map(Number).sort(function (a, b) { return a - b; }).map(function (a) { return { a: a, times: alts[a], all: alts[a].length === ents.length, txt: bdAltTxt((r.d.v || [])[a - 1]) }; });
    var key = r.key + '|c' + i, rm = [];
    // הודעה על שינוי: כל יציאה בלוח החדש מסומנת — חדשה (nw) או שהשעה שלה זזה (sh, מ-was); נסיעות שבוטלו — rm (בשעה הקודמת)
    if (r.d.mk) {
      var partOf = function (ds, all) { var miss = all.filter(function (w) { return ds.indexOf(w) < 0; }); return !miss.length ? '' : ds.length <= miss.length ? bdDs(ds) : bdX('except', 'חוץ מ') + bdDs(miss); };
      var sameD = c.days.filter(function (w) { return r.d.same && r.d.same[w]; }), act = c.days.filter(function (w) { return sameD.indexOf(w) < 0; });
      if (!act.length) return { ents: [], notes: [], rm: [], key: key, nkey: r.key + '|n' + i, txt: bdT(key, BD_SAME()), same: true, ntxt: bdT(r.key + '|n' + i, null) };
      ents.forEach(function (e) {
        var nd = [];   // הימים שבהם היציאה הזו חדשה (או בשעה חדשה)
        act.forEach(function (w) {
          (r.d.mk[w] || []).forEach(function (x) { if (x[0] !== e.m) return; if (x[1] === 'ad' || x[1] === 'sh') nd.push(w); if (x[1] === 'sh') e.was = x[2]; });
        });
        if (!nd.length) return;
        var ed = e.days || act;
        // חדשה בכל הימים שבהם היא נוסעת — ירוק; רק בחלק מהם (למשל רק ביום חמישי) — השעה רגילה, והערה קטנה בירוק: "חדש ב-ה׳"
        if (nd.length >= ed.length) e.k = e.was != null ? 'sh' : 'nw';
        else { e.k = ''; e.nwp = bdDs(nd); }
      });
      var rmBy = {};
      act.forEach(function (w) { (r.d.mk[w] || []).forEach(function (x) { if (x[1] === 'rm') (rmBy[x[0]] = rmBy[x[0]] || []).push(w); }); });
      rm = Object.keys(rmBy).map(Number).sort(function (a, b) { return a - b; }).map(function (m) { return { m: m, t: hm2(m), rm: true, part: partOf(rmBy[m], act) }; });
      if (sameD.length) notes.push({ plain: bdDs(sameD) + bdX('noChange', ' — ללא שינוי') });
    }
    // טקסט שהמשתמש כתב במקום השעות (txt) או במקום ההערה (ntxt); "" — התא / ההערה נמחקו
    return { ents: ents, notes: notes, rm: rm, key: key, nkey: r.key + '|n' + i, txt: bdT(key, null), ntxt: bdT(r.key + '|n' + i, null) };
  }
  function BD_SAME() { return BD_M ? BD_M.lbl.same : bdX('same', 'ללא שינוי'); }
  /* ההערה מתחת לתא: "* 08:00 — מארבע עונות" (בצפוף — רק "* — מארבע עונות": השעות כבר מסומנות בסימן בתא) */
  // חלופה עם סימן — הסימן לבד ("# — מארבע עונות"): השעות כבר מסומנות בתא, ואין צורך לחזור עליהן (שמואל דרך שלמה, 23.11).
  // בלי סימן (צבע בלבד) — השעות ("08:00 09:00 — מארבע עונות"); כל הנסיעות — "כל הנסיעות"
  function bdNoteLine(nt) {
    if (nt.plain) return nt.plain;
    var L = nt.L || '', ts = nt.all || D.ED.bdense || L ? '' : nt.times.join(' ');
    return ((ts ? ts : L + (nt.all ? bdX('allTrips', ' כל הנסיעות') : '')) + ' — ' + nt.txt).replace(/ {2,}/g, ' ').replace(/^ /, '');
  }
  function bdNoteTxt(x) { return x.ntxt != null ? x.ntxt : x.txt != null && !x.same ? '' : x.notes.map(bdNoteLine).join('\n'); }
  function bdNoteHtml(x) {
    if (x.ntxt != null || (x.txt != null && !x.same)) return E(bdNoteTxt(x)).replace(/\n/g, '<br>');
    // "#08:00" — יחידה משמאל לימין, כדי שגם ^ ~ + יישארו משמאל לשעה בשורה בעברית
    var h = function (nt) { return E(bdNoteLine(nt)).replace(/([#^$~+*]+)(\d\d:\d\d)/g, function (m, L, t) { return '<bdi dir="ltr">' + L + t + '</bdi>'; }); };
    return x.notes.map(function (nt) { return nt.c ? '<span class="bna" style="color:' + nt.c + '">' + h(nt) + '</span>' : h(nt); }).join('<br>');
  }
  function bdCellHtml(x) {
    var nt = bdNoteTxt(x), nh = nt ? '<span' + bdK(x.nkey, 'bnote') + '>' + bdNoteHtml(x) + '</span>' : x.ntxt === '' && x.notes.length ? '<span' + bdK(x.nkey, 'bnote') + '></span>' : '';
    if (x.txt != null) return '<td class="bt' + (x.same ? ' same' : '') + '"><span' + bdK(x.key, 'tl', x.ph) + '>' + E(x.txt) + '</span>' + nh + '</td>';
    var rms = x.rm || [], inl = BD_RM !== 'note' && rms.length <= BD_RM_MAX;   // הרבה נסיעות שבוטלו בתא אחד — בשורה מתחת לתא
    if (!x.ents.length && !rms.length) return '<td class="bt off"><span' + bdK(x.key) + '>' + E(BD_M ? BD_M.lbl.off : bdX('off', 'אינו פעיל')) + '</span>' + nh + '</td>';
    // נסיעות שבוטלו: בשעה הקודמת שלהן, באדום מחוק (או בשורה מתחת לתא: "בוטלו: 07:35, 09:10")
    var toks = inl ? x.ents.concat(rms).sort(function (a, b) { return a.m - b.m || (a.rm ? 1 : 0) - (b.rm ? 1 : 0); }) : x.ents;
    var rmLine = !inl && rms.length ? '<span class="bdrm">' + bdX('cancelled', 'בוטלו: ') + rms.map(function (e) { return '<span class="t num" dir="ltr">' + e.t + (e.part ? '<sup dir="rtl">' + E(e.part) + '</sup>' : '') + '</span>'; }).join(', ') + '</span>' : '';
    return '<td class="bt"><span' + bdK(x.key, 'tl') + '>' + toks.map(function (e) {
      // כל שעה עם ×N והסימן שלה — יחידה אחת מבודדת (dir=ltr), כדי שהסימן בעברית לא יהפוך את סדר השעות בתא
      var k = e.rm ? ' rm' : e.k ? ' nw' : '', sr = e.rm ? bdX('srRm', 'בוטלה') : e.k === 'nw' ? bdX('srNew', 'חדשה') : '';
      var en = bdEn(), wd = en ? 'ltr' : 'rtl', ea = function () { return en ? (e.m < e.was ? bdX('earlier') : bdX('later')) + bdX('fromT') : (e.m < e.was ? 'הוקדם' : 'נדחה') + ' מ-'; };
      var was = e.k === 'sh' ? '<small class="was" dir="' + wd + '">' + ea() + hm2(e.was) + '</small>' :
        e.nwp ? '<small class="was" dir="' + wd + '">' + (e.was != null ? e.nwp + ': ' + ea() + hm2(e.was) : bdX('newOn', 'חדש ב-') + e.nwp) + '</small>' : '';
      // חלופה: השעה בצבע של החלופה, והסימן שלה (# ^ $…) לפניה — "#07:00", הסימן משמאל לשעה (שלמה 23.11), בתוך אותה יחידה
      // היחידה בכיוון של סדר השעות: הסימן והשעה (תמיד משמאל לימין), ואחריהם (בכיוון הקריאה) ×N והימים — משמאל לימין מימין לשעה, מימין לשמאל משמאל לה
      var tm = e.al ? '<bdi dir="ltr" class="tu"><bdi dir="ltr" class="al">' + e.al + '</bdi>' + e.t + '</bdi>' : e.t;
      return '<span class="t num' + (e.a ? ' alt' : '') + k + '" dir="' + (D.ED.tord === 'rtl' ? 'rtl' : 'ltr') + '"' + (e.ac && !e.rm ? ' style="color:' + e.ac + '"' : '') + '>' + tm +
        (sr ? '<span class="vh"> (' + sr + ')</span>' : '') + (e.n > 1 ? '<bdi dir="ltr" class="xn">×' + e.n + '</bdi>' : '') +
        (e.part ? '<sup dir="rtl">' + E(e.part) + '</sup>' : '') + was + '</span>';
    }).join(' ') + '</span>' + rmLine + nh + '</td>';
  }
  var BD_RM = 'inline', BD_RM_MAX = 6;   // נסיעות שבוטלו: 'inline' — במקום שלהן, מחוקות (עד BD_RM_MAX בתא); 'note' — שורה מתחת לתא
  /* צבע מספר הקו: הצבע של החברה (כמו בפסים), כהה מספיק לטקסט לבן — ניגודיות 4.5 לפחות */
  function bdOpCol(p) {
    var ag = String(agOf(p)), cs = COLORS[ag], base = cs ? cs[0] : PALETTE[(parseInt(ag, 10) || 0) % PALETTE.length], c = base, f = 1;
    while (contrast(c, '#ffffff') < 4.5 && f > 0.2) { f -= 0.05; c = shade(base, f); }
    return c;
  }
  /* הצבע השני של החברה (למשל הירוק של קווים): פס בתחתית הריבוע של מספר הקו, כמו בשילוט שלהן (שלמה 22.11) */
  function bdOpCol2(p) { var cs = COLORS[String(agOf(p))]; return cs && cs[1] ? cs[1] : null; }
  function bdLineCell(r, span) {
    var bg = r.color2 ? 'background:linear-gradient(to bottom,' + r.color + ' 0 74%,' + r.color2 + ' 74%)' : 'background:' + r.color;
    var lk = bdLk(r.p);
    return '<td class="bl" rowspan="' + span + '"><span' + bdK('ln:' + lk, 'badge sm num' + (r.color2 ? ' two' : ''), r.add ? 'קו' : '') + ' style="' + bg + ';color:#fff">' + (bdEn() ? '\u200e' : '') + E(r.line) + '</span>' + (r.hideOp ? '' : '<small' + bdK('op:' + lk, 'op', r.add ? 'מפעיל' : '') + '>' + E(r.op) + '</small>') +
      (r.until ? '<small' + bdK('un:' + lk, 'un') + '>' + E(r.untilTxt) + '</small>' : '') +
      (r.p.chg === 'new' ? '<small' + bdK('nl:' + r.p.makat, 'nwl') + '>' + E(bdT('nl:' + r.p.makat, bdX('newLine', 'קו חדש'))) + '</small>' : '') +
      (r.from ? '<small' + bdK('fr:' + lk, 'un') + '>' + E(r.from) + '</small>' : '') + '</td>';
  }
  /* יישור שהמשתמש בחר לתא (ED.bd.al — המפתח של התא: השעות או המוצא): r — ימין, c — מרכז, l — שמאל */
  function bdAlC(k) { var a = D.ED.bd && D.ED.bd.al && D.ED.bd.al[k]; return a === 'r' || a === 'c' || a === 'l' ? ' al-' + a : ''; }
  /* רקע שהמשתמש בחר (ED.bd.bg, סרגל העריכה — שמואל 22.11): לתא, לשורה או לקו כולו. הטקסט — שחור או לבן לפי הרקע */
  function bdBgOf(k, r) { var g = (D.ED.bd && D.ED.bd.bg) || {}; return g[k] || g['r:' + r.key] || g['l:' + r.p.makat] || null; }
  function bdBgSt(c) { var f = c && bdInk(c); return f ? ' style="background:' + c + ';color:' + f + '"' : ''; }
  function bdRowHtml(r, lineSpan) {
    // data-rk / data-mk — במצב עריכה לוחצים על שורה כדי לבחור אותה (ועל מספר הקו — את כל השורות של הקו), ואז מוחקים מהסרגל
    return '<tr class="br' + (r.first ? ' lead' : '') + (r.add ? ' badd' : '') + '" data-rk="' + E(r.key) + '" data-mk="' + E(r.p.makat) + '" data-ln="' + E(r.line) + '">' + (lineSpan ? bdLineCell(r, lineSpan) : '') +
      '<td class="bo' + bdAlC(r.key + '|o') + '"' + bdBgSt(bdBgOf(r.key + '|o', r)) + '>' +
      // טקסט שנמחק — נשאר כשדה ריק (במצב עריכה אפשר ללחוץ עליו ולשחזר; בהדפסה הוא לא תופס מקום)
      '<b' + bdK(r.key + '|o', '', r.add ? 'מוצא' : '') + '>' + E(r.origin) + '</b>' + (r.hideS ? '' : '<small' + bdK(r.key + '|s', '', r.add ? 'תחנה' : '') + '>' + E(r.stop) + '</small>') +
      (r.hideW ? '' : '<small' + bdK(r.key + '|w', r.inter ? 'tw twi' : 'tw', r.add ? 'לכיוון' : '') + '>' + E(r.toward) + '</small>') + '</td>' +
      r.cells.map(function (x) { if (x.skip) return ''; var h = bdCellHtml(x).replace('<td class="bt', '<td' + bdBgSt(bdBgOf(x.key, r)) + ' class="bt' + bdAlC(x.key)); return x.span ? h.replace('<td ', '<td colspan="' + x.span + '" ') : h; }).join('') + '</tr>';
  }
  /* שורה או קו שהוסרו: במצב עריכה — שורה דקה ואפורה עם "להחזיר" (מחוץ לעריכה, בהדפסה ובקובץ — לא מופיעה) */
  function bdOffHtml(r, ncol, whole) {
    return '<tr class="boff noprint"><td colspan="' + (ncol + 2) + '"><button type="button" class="bdr" data-bdx="' + (whole ? 'L:' + E(r.p.makat) : 'R:' + E(r.key)) + '">להחזיר</button> ' +
      E((r.add && !r.line ? 'שורה שהוספת' : 'קו ' + r.line) + (whole ? '' : ' · ' + [r.origin, r.toward].filter(Boolean).join(' ')) + ' — הוסר מהלוח') + '</td></tr>';
  }
  /* כותרת פרק (לפי סוג קו): "קווים עירוניים" וכו'. נמחקה — שורה ריקה שנראית רק במצב עריכה */
  function bdSecHtml(b, ncol) {
    return '<tr class="bsec' + (b.secOff ? ' boff noprint' : '') + (b.secLabel ? '' : ' bsec0 noprint') + '" data-sec="' + b.sec + '"><td colspan="' + (ncol + 2) + '"><span' + bdK('sec:' + b.sec, '', 'כותרת הפרק') + '>' + E(b.secLabel) + '</span></td></tr>';
  }
  function bdBandHtml(b, ncol, cont) {
    return '<tr class="bband' + (b.off ? ' boff noprint' : '') + '" data-bkey="' + E(b.k) + '" style="background:' + b.color + '"><td colspan="' + (ncol + 2) + '"><span' + bdK('band:' + (b.lk || b.k)) + '>' + E(b.label) + '</span>' + (cont && BD_M && BD_M.lbl.cont ? ' <span' + bdK('lbl:cont') + '>' + E(BD_M.lbl.cont) + '</span>' : '') + '</td></tr>';
  }
  /* רוחב העמודות של הימים — בכל צפיפות, כך שהלוח כולו יהיה הכי נמוך: מודדים בדף (מחוץ למסך) כל שעה, כל הערה וכל טקסט
     בכל תא, ומחשבים מזה כמה שורות תופס כל תא בכל רוחב (שעות — לפי הסדר, כמה שנכנסות בשורה; הערות וטקסט — לפי האורך).
     גובה שורה — התא הגבוה בה (גם המוצא ומספר הקו). מתחילים מהרוחב הקטן ביותר של כל עמודה (השעה הרחבה בה, ולא פחות
     מ-BD_WMIN מהרוחב), ומוסיפים כל פעם רוחב לעמודה שהכי מקצרת את סכום הגבהים (עד BD_WMAX); מה שנשאר — לפי כמות הטקסט בכל
     עמודה. אותו רוחב בכל העמודים (חישוב אחד ללוח כולו). תא ממוזג (ימי חול זהים) — על הרוחב של כל העמודות שלו.
     ידני (ED.bcw — {o: המוצא, '<ימים>': עמודה}, חלק מהרוחב שאחרי עמודת הקו): גוררים במצב עריכה את הגבול בין העמודות */
  var BD_GEO = { form: 'sign', sc: 1 }, BD_CG = {}, BD_LASTW = {};
  var BD_WMIN = 0.07, BD_WMAX = 0.5, BD_WU = 4;
  function bdColKey(c) { return c.hol ? 'h' + c.hol[0] : c.days.join(''); }
  function bdManW() { var w = D.ED.bcw; return w && typeof w === 'object' && Object.keys(w).length ? w : null; }
  /* החלקים (המוצא וכל עמודה) מתוך ED.bcw או מהרוחב האוטומטי האחרון; עמודה שאין לה רוחב שמור — כמו הממוצע של השאר */
  function bdFracs(w, cols) {
    var known = cols.map(function (c) { return +w[bdColKey(c)] || 0; }).filter(function (x) { return x > 0; });
    var o = +w.o > 0 ? +w.o : 0.16, avg = known.length ? known.reduce(function (a, b) { return a + b; }, 0) / known.length : (1 - o) / Math.max(1, cols.length);
    var fs = cols.map(function (c) { return +w[bdColKey(c)] > 0 ? +w[bdColKey(c)] : avg; }), tot = o + fs.reduce(function (a, b) { return a + b; }, 0);
    return { o: o / tot, cols: fs.map(function (f) { return f / tot; }) };
  }
  /* לאקסל: היחס בין המוצא לעמודות הימים — כמו בלוח (ידני, או האוטומטי של הלוח שעל המסך) */
  function bdCwOf(cols) {
    var w = bdManW() || BD_LASTW[cols.filter(function (c) { return !c.hol; }).map(bdColKey).join(',')];
    return w ? bdFracs(w, cols) : null;
  }
  function bdHost(M, form, sc, html) {
    var host = document.createElement('div');
    host.className = 'deck'; host.setAttribute('data-form', form); host.setAttribute('data-look', D.ED.look || 'kav');
    host.style.cssText = 'position:absolute;left:-40000px;top:0;visibility:hidden;width:' + FORMS[form].w + 'px;' + lookVars(D.ED.look, M.pages);
    host.innerHTML = '<div class="sframe"><div class="slide">' + html + '</div></div>';
    document.body.appendChild(host);
    return host;
  }
  /* המדידה לרוחב העמודות: הרוחב של הטבלה ושל עמודות הקו והמוצא, ולכל שורה — הגובה של המוצא ושל מספר הקו, ולכל תא —
     רוחב כל שעה (עם הסימנים שלה), של כל שורת הערה ושל טקסט שנכתב במקום השעות */
  function bdMetrics(M, form, sc, items) {
    var n = M.cols.length;
    if (!n) return null;
    var cg = '<colgroup><col class="cl"><col class="co">' + M.cols.map(function () { return '<col>'; }).join('') + '</colgroup>';
    var host = bdHost(M, form, sc, bdSlideHtml(M, form, sc, bdTable(M, items.map(function (x) { return x.html; }).join(''), cg)));
    try {
      var W = function (e) { return e.getBoundingClientRect().width; }, Hh = function (e) { return e.getBoundingClientRect().height; };
      var tb = host.querySelector('table.bd-t'), ths = host.querySelectorAll('thead tr:first-child th');
      var mt = { tw: W(tb), cl: W(ths[0]), co: W(ths[1]), rows: [], n: n };
      var td0 = host.querySelector('td.bt'); if (!td0) return null;
      var cs = getComputedStyle(td0);
      mt.padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 1; mt.padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 1;
      var probe = document.createElement('span'); probe.className = 'tl'; probe.style.cssText = 'display:inline-block;white-space:nowrap';
      probe.innerHTML = '<span class="t num">00:00</span> <span class="t num">00:00</span>';
      td0.appendChild(probe);
      mt.sp = Math.max(0, W(probe) - W(probe.firstChild) - W(probe.lastChild)); mt.hT = Hh(probe);
      probe.className = 'bnote'; probe.textContent = 'א'; mt.hN = Hh(probe);
      probe.style.display = 'block'; mt.mN = parseFloat(getComputedStyle(probe).marginTop) || 0;
      probe.className = 'bdrm'; mt.hR = Hh(probe); mt.mR = parseFloat(getComputedStyle(probe).marginTop) || 0;
      td0.removeChild(probe);
      // טקסט שנשבר לשורות: הרוחב של כל שורה (בין <br>), בלי שבירה
      var segs = function (el) {
        var out = [], st = el.style.cssText; el.style.whiteSpace = 'nowrap'; el.style.display = 'inline-block';
        var rg = document.createRange(), cur = [];
        var flush = function () { if (!cur.length) return; rg.setStartBefore(cur[0]); rg.setEndAfter(cur[cur.length - 1]); var w = rg.getBoundingClientRect().width; if (w > 0.5) out.push(w); cur = []; };
        Array.prototype.forEach.call(el.childNodes, function (c) { if (c.nodeName === 'BR') flush(); else cur.push(c); });
        flush(); el.style.cssText = st;
        return out;
      };
      var trs = host.querySelectorAll('tbody tr.br'), rIts = items.filter(function (x) { return x.r; });
      Array.prototype.forEach.call(trs, function (tr, j) {
        var r = rIts[j] && rIts[j].r; if (!r) return;
        var rg = document.createRange(), fl = 0, bo = tr.querySelector('td.bo'), bl = tr.querySelector('td.bl');
        if (bo) { rg.selectNodeContents(bo); fl = Math.max(fl, rg.getBoundingClientRect().height + mt.padV); }
        if (bl) { rg.selectNodeContents(bl); fl = Math.max(fl, (rg.getBoundingClientRect().height + mt.padV) / (+bl.getAttribute('rowspan') || 1)); }
        var cis = r.cells.map(function (x, i) { return x.skip ? -1 : i; }).filter(function (i) { return i >= 0; });
        var cells = Array.prototype.map.call(tr.querySelectorAll('td.bt'), function (td, q) {
          var ci = cis[q], x = r.cells[ci] || {}, c = { c: ci, s: x.span || 1, tk: [], tx: [], nt: [], rm: [] };
          var tl = td.querySelector(':scope > .tl');
          var toks = tl ? tl.querySelectorAll(':scope > .t') : [];
          if (toks.length) c.tk = Array.prototype.map.call(toks, W);
          else { var t0 = td.querySelector(':scope > .bdt'); if (t0 && t0.textContent.trim()) c.tx = segs(t0); }
          var nt = td.querySelector(':scope > .bnote'); if (nt) c.nt = segs(nt);
          var rm = td.querySelector(':scope > .bdrm'); if (rm) c.rm = segs(rm);
          return c;
        });
        mt.rows.push({ fl: fl, cells: cells });
      });
      return mt;
    } finally { document.body.removeChild(host); }
  }
  /* כמה גבוה תא ברוחב w (פיקסלים) */
  function bdCellH(mt, c, w) {
    var av = Math.max(8, w - mt.padH), h = mt.padV, ln = function (ws) { return ws.reduce(function (t, x) { return t + Math.max(1, Math.ceil(x * 1.03 / av - 1e-9)); }, 0); };
    if (c.tk.length) {
      var L = 1, x = 0;
      c.tk.forEach(function (t) { if (!x) x = t; else if (x + mt.sp + t <= av + 0.5) x += mt.sp + t; else { L++; x = t; } });
      h += L * mt.hT;
    } else if (c.tx.length) h += ln(c.tx) * mt.hT;
    if (c.nt.length) h += mt.mN + ln(c.nt) * mt.hN;
    if (c.rm.length) h += mt.mR + ln(c.rm) * mt.hR;
    return h;
  }
  /* סכום הגבהים של השורות כשרוחב העמודות ws (עם זיכרון לכל תא ורוחב) */
  function bdCost(mt, ws) {
    var t = 0;
    mt.rows.forEach(function (r) {
      var mx = r.fl;
      r.cells.forEach(function (c) {
        var w = 0; for (var k = c.c; k < c.c + c.s; k++) w += ws[k] || 0;
        var key = Math.round(w), m = c.m || (c.m = {});
        var h = m[key] != null ? m[key] : (m[key] = bdCellH(mt, c, key));
        if (h > mx) mx = h;
      });
      t += mx;
    });
    return t;
  }
  /* הרוחב הקטן ביותר של כל עמודה: השעה הרחבה בה (עם הסימנים), ולא פחות מ-f מהרוחב; ו"משקל" — כמות הטקסט בה */
  function bdMins(mt, Wd, f) {
    var n = mt.n, mins = [], wt = [];
    for (var c = 0; c < n; c++) { mins.push(f * Wd); wt.push(0); }
    mt.rows.forEach(function (r) { r.cells.forEach(function (x) {
      var big = Math.max.apply(null, [0].concat(x.tk)) + mt.padH + 1;
      if (x.s === 1 && big > mins[x.c]) mins[x.c] = big;
      var len = x.tk.reduce(function (a, b) { return a + b + mt.sp; }, 0) + x.tx.reduce(function (a, b) { return a + b; }, 0) + x.nt.reduce(function (a, b) { return a + b; }, 0) * 0.8;
      for (var k = x.c; k < x.c + x.s; k++) wt[k] += len / x.s;
    }); });
    return { mins: mins, wt: wt };
  }
  function bdAutoW(mt, Wd) {
    var n = mt.n, mw = bdMins(mt, Wd, BD_WMIN), mins = mw.mins, wt = mw.wt;
    var sMin = mins.reduce(function (a, b) { return a + b; }, 0);
    if (sMin >= Wd) return mins.map(function (m) { return m / sMin * Wd; });
    var maxs = mins.map(function (m) { return Math.max(m, BD_WMAX * Wd); });
    var ws = mins.slice(), R = Wd - sMin, cur = bdCost(mt, ws);
    while (R >= BD_WU) {
      var best = null;
      for (var j = 0; j < n; j++) for (var k = 1; k <= 30 && k * BD_WU <= R && ws[j] + k * BD_WU <= maxs[j]; k++) {
        ws[j] += k * BD_WU; var v = bdCost(mt, ws); ws[j] -= k * BD_WU;
        var g = (cur - v) / k;
        if (g > 1e-6 && (!best || g > best.g + 1e-6)) best = { g: g, j: j, k: k, v: v };
      }
      if (!best) break;
      ws[best.j] += best.k * BD_WU; R -= best.k * BD_WU; cur = best.v;
    }
    // מה שנשאר — לפי כמות הטקסט בכל עמודה (עד BD_WMAX)
    for (var it = 0; it < 4 && R > 0.5; it++) {
      var open = [], sw = 0;
      for (var q = 0; q < n; q++) if (ws[q] < maxs[q] - 0.5) { open.push(q); sw += wt[q] || 1; }
      if (!open.length) break;
      var R0 = R;
      open.forEach(function (q) { var add = Math.min(maxs[q] - ws[q], R0 * (wt[q] || 1) / sw); ws[q] += add; R -= add; });
    }
    if (R > 0.5) ws = ws.map(function (w) { return w + R / n; });
    // ליטוש: העברת רוחב מעמודה לעמודה, כל עוד זה מקצר את הלוח (הוספה בלבד נתקעת לפעמים לפני "מדרגה")
    cur = bdCost(mt, ws);
    for (var pass = 0; pass < 30; pass++) {
      var bt = null;
      for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
        if (a === b) continue;
        for (var d = BD_WU; d <= 64; d += BD_WU) {
          if (ws[b] - d < mins[b] - 0.01 || ws[a] + d > maxs[a] + 0.01) break;
          ws[a] += d; ws[b] -= d; var v2 = bdCost(mt, ws); ws[a] -= d; ws[b] += d;
          if (v2 < cur - 0.5 && (!bt || v2 < bt.v)) bt = { a: a, b: b, d: d, v: v2 };
        }
      }
      if (!bt) break;
      ws[bt.a] += bt.d; ws[bt.b] -= bt.d; cur = bt.v;
    }
    return ws;
  }
  /* הרוחב לצורה ולגודל (מטמון לכל לוח) */
  function bdWidths(M, form, sc, items) {
    if (BD_CG.M !== M) BD_CG = { M: M };
    var key = form + '|' + sc;
    if (key in BD_CG) return BD_CG[key];
    var mt = bdMetrics(M, form, sc, items);
    if (!mt) return (BD_CG[key] = null);
    var man = bdManW(), avail = mt.tw - mt.cl, co, ws;
    if (man) {
      // ידני — כמו שנגרר, אבל לא צר מהשעה הרחבה בעמודה (שהשעות לא יעלו על העמודה הבאה); את מה שחסר לוקחים מהשאר
      var fr = bdFracs(man, M.cols), mn = bdMins(mt, avail, 0).mins;
      co = Math.max(48, fr.o * avail); ws = fr.cols.map(function (f, i) { return Math.max(mn[i], f * avail); });
      var over = co + ws.reduce(function (a, b) { return a + b; }, 0) - avail;
      if (over > 0) {
        var room = (co - 48) + ws.reduce(function (t, w, i) { return t + w - mn[i]; }, 0);
        if (room > 0) { var q = Math.min(1, over / room); co -= (co - 48) * q; ws = ws.map(function (w, i) { return w - (w - mn[i]) * q; }); }
      }
    }
    else { co = mt.co; ws = bdAutoW(mt, avail - co); }
    return (BD_CG[key] = { tw: mt.tw, cl: mt.cl, co: co, ws: ws, man: !!man, mt: mt });
  }
  function bdColgroup(M) {
    var g = BD_CG.M === M ? BD_CG[BD_GEO.form + '|' + BD_GEO.sc] : null;
    if (!g || g.ws.length !== M.cols.length) return '<colgroup><col class="cl"><col class="co">' + M.cols.map(function () { return '<col style="width:' + (100 / Math.max(1, M.cols.length)).toFixed(2) + '%">'; }).join('') + '</colgroup>';
    var pc = function (x) { return (x / g.tw * 100).toFixed(3) + '%'; };
    return '<colgroup><col class="cl"><col class="co"' + (g.man ? ' style="width:' + pc(g.co) + '"' : '') + '>' +
      g.ws.map(function (x, i) { return '<col data-ck="' + E(bdColKey(M.cols[i])) + '" style="width:' + pc(x) + '">'; }).join('') + '</colgroup>';
  }
  function bdHead(M, form) {
    return '<div class="cu-head bd-head"><div class="t"><div>' + (M.title ? '<h1' + bdK('title', 'hd') + '>' + E(M.title) + '</h1>' : '') +
      (M.sub ? '<p' + bdK(M.subK || 'sub', 'sub') + '>' + E(M.sub) + '</p>' : '') +
      (M.key && (M.key.hasNw || M.key.hasRm) ? '<p class="bd-key">' + (M.key.hasNw ? '<span' + bdK('lbl:knwx', 't num nw') + ' dir="ltr">' + E(bdT('lbl:knwx', '07:00')) + '</span> <span' + bdK('lbl:knw') + '>' + E(M.key.nw) + '</span>' : '') +
        (M.key.hasRm ? '<span' + bdK('lbl:krmx', 't num rm') + ' dir="ltr">' + E(bdT('lbl:krmx', '07:00')) + '</span> <span' + bdK('lbl:krm') + '>' + E(M.key.rm) + '</span>' : '') + '</p>' : '') + '</div></div></div>';
  }
  /* מקרא לחלופות: שורה לכל קו וכיוון בעמוד שיש בו נסיעות בדרך אחרת — הסימן והצבע של כל חלופה, ומה הדרך */
  function bdAltEntry(r) {
    var tw = r.towardAll || r.toward, two = r.n > 1 && tw;
    return '<p class="bd-al" data-ak="' + E(r.key) + '"><b class="bd-aln">' + bdX('line', 'קו') + ' ' + E(r.line) + (two ? ' ' + E(tw) : '') + ':</b> ' + r.alts.map(function (x) {
      return '<span class="bd-ali" style="color:' + x.c + '"><b class="al" dir="ltr">' + x.L + '</b> ' + E(x.txt) + '</span>';
    }).join(' <span class="bd-als">·</span> ') + '</p>';
  }
  function bdAltRows(rows) { return (rows || []).filter(function (r) { return !r.off && r.alts && r.alts.length; }); }
  function bdAltLegend(rows) { rows = bdAltRows(rows); return rows.length ? '<div class="bd-alts">' + rows.map(bdAltEntry).join('') + '</div>' : ''; }
  /* מוקדי מידע: רק החברות שהקווים שלהן בעמוד הזה (ops), ומשרד התחבורה. בלי ops — כל החברות שבלוח. rows — השורות בעמוד (למקרא החלופות) */
  function bdFoot(M, ops, pgi, rows) {
    var cs = ops ? M.contacts.filter(function (c) { return c[2] === 'משרד התחבורה' || ops.indexOf(c[2]) >= 0; }) : M.contacts, X = M.en ? window.LCBoardEN.TXT : null;
    // מה שבעמוד הזה (שלמה 24.11): נסיעה בסימן (חלופה) — המשפט ב"עדכונים" והחלק במקרא; ×2 — החלק במקרא. בלי rows (מדידה) — כל הלוח
    var vr = (rows || M.bands.reduce(function (a, b) { return a.concat(b.rows); }, [])).filter(function (r) { return r && !r.off && r.cells; });
    var pAlt = vr.some(function (r) { return r.cells.some(function (x) { return x.txt == null && x.ents.some(function (e) { return e.a; }); }); });
    var pX2 = M.x2 !== false && vr.some(function (r) { return r.cells.some(function (x) { return x.txt == null && x.ents.some(function (e) { return e.n > 1; }); }); });
    var note = M.note && (pAlt || !M.noteAuto) ? M.note : '';
    var leg = X ? [X.legendDep, M.chg ? '<span class="nwt">' + X.legendNew.replace(' — ', '</span> — ') + ' · <span class="alt">' + X.legendRm.replace(' — ', '</span> — ') : pAlt ? '<span class="alt">' + X.legendAlt.replace(' (', '</span> (') : '', pX2 ? X.legendX2 : '', X.legendMot + (M.feed ? ' · ' + LC.dmy(M.feed) : '')]
      : ['שעות היציאה מהתחנה הראשונה', M.chg ? '<span class="nwt">בירוק</span> — נסיעה חדשה או בשעה חדשה · <span class="alt">באדום מחוק</span> — נסיעה שבוטלה' : pAlt ? '<span class="alt">בסימן ובצבע</span> (# ^ $…) — נסיעה בדרך אחרת' : '', pX2 ? '×2 — שני אוטובוסים' : '', 'לפי נתוני משרד התחבורה' + (M.feed ? ' מ-' + LC.dmy(M.feed) : '')];
    return '<div class="bd-foot">' + bdAltLegend(rows) + (note ? '<p class="bd-upd">' + (M.lbl.upd ? '<b' + bdK('lbl:upd') + '>' + E(M.lbl.upd) + '</b> ' : '') + '<span' + bdK('note') + '>' + E(note) + '</span></p>' : '') +
      (cs.length ? '<p class="bd-ph">' + (M.lbl.ph ? '<b' + bdK('lbl:ph') + '>' + E(M.lbl.ph) + '</b> ' : '') + cs.map(function (c) {
        return '<span>' + (c[0] ? '<span' + bdK('phn:' + c[2]) + '>' + E(c[0]) + '</span>' : '') + ' ' + (c[1] ? '<b' + bdK('php:' + c[2], 'ltr') + '>' + E(c[1]) + '</b>' : '') + '</span>';
      }).join('') + '</p>' : '') +
      '<div class="cu-foot"><span' + bdK('legend') + '>' + (M.legend != null ? E(M.legend) : leg.filter(Boolean).join(' · ')) + '</span><span' + bdK('pg:' + (pgi || 0), 'pg num') + '></span></div>' +
      // בכל עמוד, גם בצפוף ובעמוד אחד: שורת "אדם פרטי" (לא ניתנת לעריכה) והקרדיט (אפשר לשנות את הניסוח; מורידים אותו ב"להוסיף קרדיט")
      '<p class="bd-priv">' + (X ? X.priv : 'המידע הוכן על ידי אדם פרטי · לא פרסום רשמי · לפני הנסיעה בדקו במוקד') + '</p>' +
      (M.credit ? '<p' + bdK('credit', 'bd-cr') + '>' + (M.creditTxt === BD_CR ? (X ? E(X.credit) : 'הוכן בכלי ״מצגת לשינוי בקו״ של הקו הבוחן · <span class="ltr">kavbochan.app</span>') : E(M.creditTxt)) + '</p>' : '') + '</div>';
  }
  function bdTable(M, rows, cg) {
    var nw = M.cols.filter(function (c) { return c.wk; }).length, two = nw > 1, rs = two ? ' rowspan="2"' : '';
    var th = function (c) { return '<th' + (two && !c.wk ? rs : '') + '><span' + bdK('th:' + c.days.join('')) + '>' + E(c.label) + '</span></th>'; };
    var head = '<tr><th' + rs + '><span' + bdK('th:line') + '>' + E(M.th.line) + '</span></th><th' + rs + '><span' + bdK('th:orig') + '>' + E(M.th.orig) + '</span></th>' +
      (two ? M.cols.map(function (c, i) { return !c.wk ? th(c) : i && M.cols[i - 1].wk ? '' : '<th colspan="' + nw + '" class="wkh"><span' + bdK('th:wk') + '>' + E(M.th.wk) + '</span></th>'; }).join('') + '</tr><tr class="wk2">' + M.cols.filter(function (c) { return c.wk; }).map(th).join('')
        : M.cols.map(th).join('')) + '</tr>';
    return '<table class="bd-t">' + (cg || bdColgroup(M)) + '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }
  /* מראה הלוח (שמואל 22.11): יישור הכותרת (ED.btal — 'c' במרכז), כותרת רק בעמוד הראשון (ED.bt1), וצבעים (ED.bclr — {h, c}:
     h — רקע הכותרת וכותרות העמודות, c — רקע תאי השעות, hf / cf — צבע הטקסט שלהם). המשתמש בוחר בחופשיות; בלי צבע טקסט —
     שחור או לבן, מה שקריא יותר על הרקע */
  function bdInk(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; var n = parseInt(m[1], 16), l = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * l(n >> 16 & 255) + 0.7152 * l(n >> 8 & 255) + 0.0722 * l(n & 255); return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#111111' : '#ffffff'; }
  function bdLookVars() {
    var c = D.ED.bclr || {}, v = '';
    if (bdInk(c.h)) v += ';--bdh-bg:' + c.h + ';--bdh-fg:' + (bdInk(c.hf) ? c.hf : bdInk(c.h));
    if (bdInk(c.c)) v += ';--bdc-bg:' + c.c + ';--bdc-fg:' + (bdInk(c.cf) ? c.cf : bdInk(c.c));
    return v;
  }
  function bdSlideHtml(M, form, sc, body, ops, pgi, rows, noHead) {
    var c = D.ED.bclr || {};
    return '<div class="s-cur s-bd f-' + form + (M.en ? ' en" dir="ltr" lang="en' : '') + (D.ED.bdense ? ' dense' : '') + (D.ED.btal === 'c' ? ' tal-c' : D.ED.btal === 'l' ? ' tal-l' : '') + (bdInk(c.h) ? ' clr-h' : '') + (bdInk(c.c) ? ' clr-c' : '') + '" style="--bd:' + sc + bdLookVars() + '">' +
      (noHead ? '' : bdHead(M, form)) + '<div class="cu-body">' + body + '</div>' + bdFoot(M, ops, pgi, rows) + '</div>';
  }
  /* מדידה: כל השורות בעמוד אחד מחוץ למסך — הגובה של כל שורה והמקום שיש לטבלה */
  function bdMeasure(M, form, sc, items) {
    bdWidths(M, form, sc, items);
    var host = bdHost(M, form, sc, bdSlideHtml(M, form, sc, bdTable(M, items.map(function (x) { return x.html; }).join(''))));
    var body = host.querySelector('.cu-body'), th = host.querySelector('thead'), trs = host.querySelectorAll('tbody > tr');
    var avail = body.clientHeight - th.offsetHeight - 4, hs = Array.prototype.map.call(trs, function (t) { return t.getBoundingClientRect().height; });
    // כותרת רק בעמוד הראשון: בשאר העמודים יש לטבלה גם את המקום של הכותרת
    var hd = host.querySelector('.bd-head'), headH = hd ? hd.getBoundingClientRect().height + (parseFloat(getComputedStyle(hd).marginBottom) || 0) : 0;
    // מקרא החלופות (בתחתית העמוד): הגובה של השורה של כל קו וכיוון, ומה שהמקרא מוסיף מעבר לשורות (ריווח)
    var arows = bdAltRows(items.filter(function (x) { return x.r; }).map(function (x) { return x.r; })), al = { h: {}, base: 0 };
    if (arows.length) {
      var ft = host.querySelector('.bd-foot'), h0 = ft.getBoundingClientRect().height;
      ft.insertAdjacentHTML('afterbegin', bdAltLegend(arows));
      var sum = 0;
      Array.prototype.forEach.call(ft.querySelectorAll('.bd-al'), function (e) { var h = e.getBoundingClientRect().height; al.h[e.getAttribute('data-ak')] = h; sum += h; });
      al.base = Math.max(0, ft.getBoundingClientRect().height - h0 - sum);
    }
    document.body.removeChild(host);
    return { avail: avail, hs: hs, al: al, headH: headH };
  }
  function bdPaginate(M, form, sc) {
    var items = [];
    BD_GEO = { form: form, sc: sc };
    var offs = {}, prevKey = '^';   // מה שהוסר — נכנס לעמוד אחרי הפריט שלפניו (רק במצב עריכה הוא נראה)
    M.bands.forEach(function (b) {
      if (b.sec) {   // לפי סוג קו: כותרת הפרק מעל הפס הראשון שלו
        var secIt = { sec: b, html: bdSecHtml(b, M.cols.length) };
        if (b.secOff) (offs[prevKey] = offs[prevKey] || []).push(secIt); else { items.push(secIt); prevKey = items.length - 1; }
      }
      var bandIt = { band: b, html: bdBandHtml(b, M.cols.length, false) };
      if (b.flat) { /* בלי פסי יעד — אין שורת פס */ }
      else if (b.off) (offs[prevKey] = offs[prevKey] || []).push(bandIt); else { items.push(bandIt); prevKey = items.length - 1; }
      var seenL = {};
      b.rows.forEach(function (r) {
        if (!r.off) { items.push({ b: b, r: r, html: null }); prevKey = items.length - 1; return; }
        if (r.offL && seenL[r.p.makat]) return;
        seenL[r.p.makat] = 1;
        (offs[prevKey] = offs[prevKey] || []).push({ off: true, html: bdOffHtml(r, M.cols.length, r.offL) });
      });
    });
    // למדידה — כמו בעמוד: תא אחד של מספר הקו לכל הכיוונים שלו (אחרת כל שורה נמדדת עם המספר, שם החברה וה"עד" שלה, וגבוהה מדי)
    items.forEach(function (it, i) {
      if (!it.r) return;
      if (items[i - 1] && items[i - 1].r && items[i - 1].r.p === it.r.p) { it.html = bdRowHtml(it.r, 0); return; }
      var span = 1; while (items[i + span] && items[i + span].r && items[i + span].r.p === it.r.p) span++;
      it.html = bdRowHtml(it.r, span);
    });
    var ms = bdMeasure(M, form, sc, items), pgs = [], cur = [], used = 0, H = ms.avail;
    // שורה שהוסרה נראית רק במצב עריכה (שורה דקה) — שומרים לה מקום בתחתית העמוד, כדי שבעריכה הלוח לא יגלוש
    var offH = D.ED.editing ? (ms.hs[0] || 24) * 0.85 : 0;   // רק במצב עריכה; בהדפסה העמודים מלאים
    (offs['^'] || []).forEach(function (x) { cur.push(x); used += offH; });
    // כמה צריך כדי להתחיל כאן: כל הכיוונים של הקו (שלא ייחתך באמצע), ופס — יחד עם הקו הראשון אחריו
    // שורה עם חלופות — גם השורה שלה במקרא החלופות בתחתית העמוד (והריווח של המקרא, בשורה הראשונה כזו בעמוד)
    var alOn = false;
    // מעבר עמוד ידני (ED.bbrk, שמואל 22.11): פס, קו או שורה שהמשתמש ביקש שיתחילו בעמוד חדש
    var brk = {}; (D.ED.bbrk || []).forEach(function (k) { brk[k] = 1; });
    var brkAt = function (it, i) {
      if (it.band) return brk['b:' + it.band.k];
      if (!it.r) return false;
      var prev = items[i - 1];
      return brk['r:' + it.r.key] || (brk['l:' + it.r.p.makat] && !(prev && prev.r && prev.r.p === it.r.p));
    };
    ms.hs = ms.hs.map(function (h, i) { return h + (items[i] && items[i].r && ms.al.h[items[i].r.key] || 0); });
    items.forEach(function (it, i) {
      var h = ms.hs[i] || 0;
      var ab = it.r && ms.al.h[it.r.key] && !alOn ? ms.al.base : 0;
      // כדי לא לבזבז נייר: פס (או כותרת פרק) מתחיל גם בתחתית העמוד, אם נכנסת אחריו לפחות השורה הראשונה; פס ארוך — ממשיך
      // בעמוד הבא עם "(המשך)", וגם הכיוונים של קו אחד יכולים להתחלק בין עמודים. רק שורה אחת (קו וכיוון) לא נחתכת אף פעם
      var bandNeed = function (j) { return (ms.hs[j] || 0) + (items[j + 1] && items[j + 1].r ? ms.hs[j + 1] || 0 : 0); };
      var need = (it.sec ? h + (items[i + 1] && items[i + 1].band ? bandNeed(i + 1) : 0) : it.band ? bandNeed(i) : h) + ab;
      var hasRow = cur.some(function (x) { return x.r || x.band || x.sec; });
      // פס עם מעבר ידני: הכותרת של הפרק שלפניו (אם יש) עוברת איתו
      var fb = hasRow && brkAt(it, i) && !(cur.length && cur[cur.length - 1].sec);
      if (!fb && it.sec && items[i + 1] && items[i + 1].band && brkAt(items[i + 1], i + 1) && hasRow) fb = true;
      if (cur.length && (used + need > H || fb)) {
        pgs.push(cur); cur = []; used = 0; alOn = false; ab = it.r && ms.al.h[it.r.key] ? ms.al.base : 0;
        if (D.ED.bt1 && pgs.length === 1) H = ms.avail + ms.headH;
        if (!it.band && !it.sec && !it.b.flat) { var bi = items.indexOf(items.filter(function (x) { return x.band === it.b; })[0]); cur.push({ cont: it.b }); used += ms.hs[bi]; }
      }
      cur.push(it); used += h + ab;
      if (ab || (it.r && ms.al.h[it.r.key])) alOn = true;
      (offs[i] || []).forEach(function (x) { cur.push(x); used += offH; });
    });
    if (cur.length) pgs.push(cur);
    return pgs.length ? pgs : [[]];
  }
  function bdPageHtml(M, its) {
    return its.map(function (it, i) {
      if (it.cont) return it.cont.flat ? '' : bdBandHtml(it.cont, M.cols.length, true);
      if (it.band || it.off || it.sec) return it.html;
      // מספר הקו — תא אחד לכל הכיוונים של הקו באותו עמוד (שורה שהוסרה באמצע — מפרידה)
      var prev = its[i - 1];
      if (prev && prev.r && prev.r.p === it.r.p) return bdRowHtml(it.r, 0);
      var span = 1; for (var k = i + 1; k < its.length && its[k].r && its[k].r.p === it.r.p; k++) span++;
      return bdRowHtml(it.r, span);
    }).join('');
  }
  var BD_M = null;   // המודל של הלוח שנבנה עכשיו (לטקסטים הקבועים בתאים ובפסים)
  var BD_SC = { sign: [1, 0.9, 0.8, 0.72], deck: [1, 0.88, 0.78], status: [1, 0.88, 0.78] };
  // שלט A4 "להכניס ל-N עמודים": מקטינים הכול יחד (גופן, גובה שורות, ריווח) עד שנכנס — לא פחות מ-BD_MIN
  // (13px × 0.67 ≈ 8.7px ≈ 6.5pt בהדפסה — עדיין קריא). לא נכנס גם בגודל הזה — כמה עמודים צריך (BOARD_FIT.need)
  var BD_MIN = 0.67, BOARD_FIT = null;
  function bdSlides(pages, form) {
    var M = BD_M = bdModel(pages), best = null, want = form === 'sign' ? +D.ED.bpages || 0 : 0;
    BOARD_FIT = null;
    if (want) {
      for (var sc0 = 1; ; sc0 = Math.max(BD_MIN, Math.round((sc0 - 0.04) * 100) / 100)) {
        var pg0 = bdPaginate(M, form, sc0);
        if (!best || pg0.length < best.pg.length || pg0.length <= want) best = { sc: sc0, pg: pg0 };
        if (pg0.length <= want || sc0 <= BD_MIN) break;
      }
      BOARD_FIT = { want: want, pages: best.pg.length, need: best.pg.length > want ? best.pg.length : 0, sc: best.sc };
    } else
    // הגופן: הגדול ביותר שלא מוסיף עמודים (עד 3 ניסיונות קטנים יותר)
    BD_SC[form].forEach(function (sc) {
      var pg = bdPaginate(M, form, sc);
      if (!best || pg.length < best.pg.length) best = { sc: sc, pg: pg };
    });
    var n = best.pg.length;
    BD_GEO = { form: form, sc: best.sc };
    // לאקסל — הרוחב שיצא (חלק מהרוחב שאחרי עמודת הקו)
    var gw = BD_CG.M === M ? BD_CG[form + '|' + best.sc] : null;
    if (gw && !gw.man) { var lw = { o: gw.co / (gw.tw - gw.cl) }; M.cols.forEach(function (c, i) { lw[bdColKey(c)] = gw.ws[i] / (gw.tw - gw.cl); }); BD_LASTW[M.cols.map(bdColKey).join(',')] = lw; }
    var out = best.pg.map(function (its, i) {
      var ops = opsOf(its.filter(function (it) { return it.r && !it.r.off; }).map(function (it) { return it.r.p; }));
      return { id: (form === 'deck' ? '' : form === 'sign' ? 'sg-' : 'st-') + 'bd' + i, label: 'לוח לפי יעד' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: bdSlideHtml(M, form, best.sc, bdTable(M, bdPageHtml(M, its)), ops, i, its.filter(function (it) { return it.r; }).map(function (it) { return it.r; }), !!D.ED.bt1 && i > 0) };
    });
    out.pages = M.pages;   // הקווים שבלוח בפועל (לשקף הסיום)
    return out;
  }
  /* המבנה של "טבלה לפי יעד" — לייצוא לאקסל (edits: btitle, bnote, bplace) */
  /* הודעה על שינוי, "טבלה לפי יעד": הקווים שהלו"ז שלהם משתנה (וקווים חדשים) — כמו לו"ז עדכני, עם הלוח החדש מיום השינוי.
     לכל יום: השעות החדשות (days), הסימונים מול הלוח הקודם (mk — mergeSh), וימים בלי שינוי (same — אין שעות בנתונים) */
  function chgBdPages(pages) {
    return pages.filter(ttCap).map(function (p) {
      var q = { id: p.id, makat: p.makat, line: p.line, op: p.op, ag: agOf(p), feed: p.feed, valid: start(p), eff: start(p), until: '', chg: p.kind, od: p.od, hol: [] };
      q.dirs = mtDirs(p).map(function (d) {
        var S = (d.new && d.new.stops.length ? d.new : d.old).stops, s0 = S[0] || {}, cs = [];
        S.forEach(function (x) { if (x.city && cs.indexOf(x.city) < 0) cs.push(x.city); });
        var x = { dir: String(d.dir || d.rd || ''), od: d.od || p.od, f: s0.name || '', fc: s0.code || '', cs: cs, t: streetOf(lastStop(d)), ag: d.ag, days: [], mk: [], same: [], hx: d.hx || null };
        for (var w = 0; w < 7; w++) {
          var m = mtDay({ p: p, d: d }, w);
          x.days[w] = m.k === 'c' || m.k === 'n' || m.k === 'k' ? (m.e.n || []).slice() : [];
          x.mk[w] = m.k === 'c' && p.kind !== 'new' ? mergeSh(m.e.o || [], m.e.n || []) : [];
          x.same[w] = m.k === 's' ? 1 : 0;
        }
        return x;
      });
      return q;
    }).filter(function (q) { return q.dirs.length; });
  }
  function chgBoardModel(pages, edits) { return boardModel(chgBdPages(pages), edits); }
  /* המצגת במצב "טבלה לפי יעד": שער, הלוח (הקווים שהלו"ז שלהם משתנה), ואחריו הקווים שמשתנים רק במסלול — כמו היום, וסיום */
  function chgBoardBuild(pages, city, feed) {
    var bp = chgBdPages(pages), rest = pages.filter(function (p) { return !ttCap(p); }), form = D.ED.form || 'deck';
    var bs = bdSlides(bp, form);
    if (form === 'sign') return bs.concat(rest.length ? signPages(rest, feed) : []);
    if (form === 'status') return bs.concat(rest.length ? statusPages(rest) : []);
    var slides = [{ id: 'cover', label: 'שער', html: cover(pages, city) }].concat(bs);
    // קו חדש: המפה, המפות הקרובות והתחנות נשארים במצגת — השעות שלו בלוח
    pages.filter(function (p) { return p.kind === 'new' && ttCap(p); }).forEach(function (p) {
      kindSlides(p, pages.length > 1 ? p.line + ' · ' : '', true).forEach(function (x) { slides.push(x); });
    });
    rest.forEach(function (p) {
      var pre = pages.length > 1 ? p.line + ' · ' : '';
      (isKind(p) ? kindSlides(p, pre) : isOne(p) ? onePages(p, feed, pre) : fullSlides(p, pre)).forEach(function (x) { slides.push(x); });
    });
    slides.push({ id: 'close', label: 'סיום: לפני הנסיעה בדקו', html: closing(pages, feed) });
    return slides;
  }
  function boardModel(pages, edits, xo) { var keep = D.ED; D.ED = edits || {}; try { return bdModel(pages, xo); } finally { D.ED = keep; } }
  /* לאקסל — לו"ז חדש בהודעה על שינוי (שינוי בלו"ז, קו חדש): אותו מבנה כמו "טבלה לפי יעד" (ראו xlsx.js).
     old=false — הלוח החדש מיום השינוי (שעה חדשה או שזזה — בירוק); old=true — הלוח הקודם (שעה שמתבטלת או שזזה — באדום).
     ימים עם אותו לוח בכל השורות — עמודה אחת; חג בשבוע של השינוי — עמודה משלו */
  var MT_COL = ['#0f766e', '#c2410c', '#6d28d9', '#1d4ed8', '#a16207', '#be185d'];
  function chgModel(pages, edits, old) {
    var keep = D.ED; D.ED = edits || {};
    try {
      BD_MISS = {}; BD_IX = bdEn() ? window.LCBoardEN.index(D.ED.en) : null;
      var ps = pages.filter(ttCap), groups = mtGroups(ps), all = [];
      groups.forEach(function (g) { all = all.concat(g.rows); });
      var day = function (r, w) {   // [רשימת שעות או null, סימונים] ליום w
        var x = mtDay(r, w);
        if (x.k === 'c') { var it = mergeSh(x.e.o || [], x.e.n || []); return { list: old ? x.e.o || [] : x.e.n || [], mk: it }; }
        if (x.k === 'n' || x.k === 'k') return { list: x.e.n || [] };
        if (x.k === 's') return { same: true };
        return { list: [] };
      };
      var sig = {}, order = [];
      for (var w = 0; w < 7; w++) {
        var k = all.map(function (r) { var d = day(r, w); return d.same ? 's' : d.list.join(','); }).join('|');
        if (all.every(function (r) { var d = day(r, w); return !d.same && !d.list.length; })) continue;
        if (!sig[k]) { sig[k] = []; order.push(k); }
        sig[k].push(w);
      }
      var cols = order.map(function (k) {
        var ds = sig[k], kk = ds.join(',');
        return { days: ds, label: bdEn() ? (kk === '5' ? bdX('friday') : kk === '6' ? bdX('satNight') : bdDs(ds)) : kk === '0,1,2,3,4' ? 'ימים א׳–ה׳' : kk === '5' ? 'יום שישי' : kk === '6' ? 'מוצ״ש' : ds.length === 1 ? 'יום ' + dShort(ds) : dShort(ds) };
      });
      if (!old) (D.ED.hol || []).forEach(function (h) { if (all.some(function (r) { return r.d.hx && r.d.hx[h[0]]; })) cols.push({ days: [isoDow(h[0])], hol: h, label: bdHolN(h[2]) + ' ' + LC.dm(h[0]) }); });
      var cell = function (r, c) {
        if (c.hol && r.d.hx && r.d.hx[c.hol[0]]) return { ents: r.d.hx[c.hol[0]].map(function (m) { return { t: hm2(m), n: 1 }; }), notes: [] };
        var d = day(r, c.days[0]);
        if (d.same) return { ents: [], notes: [], txt: bdX('same', 'ללא שינוי') };
        var hl = {};
        (d.mk || []).forEach(function (x) {
          if (old) { if (x[1] === 'rm') hl[x[0]] = 1; else if (x[1] === 'sh') hl[x[2]] = 1; }
          else if (x[1] === 'ad' || x[1] === 'sh') hl[x[0]] = 1;
        });
        var cnt = {}; d.list.forEach(function (m) { cnt[m] = (cnt[m] || 0) + 1; });
        var seen = {};
        return { ents: d.list.filter(function (m) { if (seen[m]) return false; seen[m] = 1; return true; }).map(function (m) { return { t: hm2(m), n: cnt[m], c: hl[m] ? (old ? 'C81E1E' : '1F9152') : '' }; }), notes: [] };
      };
      var first = function (d) { var st = (old ? d.old : d.new.stops.length ? d.new : d.old).stops; return st[0] || {}; };
      var bands = groups.map(function (g) {
        var en = bdEn();
        return { label: en ? String(g.label || '').split(' – ').map(bdN).join(' – ') : g.label, color: MT_COL[g.c % MT_COL.length], rows: g.rows.map(function (r) {
          var o = r.d.od || [], to = o[1] && o[1] !== o[0] ? o[1] : streetOf(lastStop(r.d)), s0 = first(r.d);
          if (en) return { p: r.p, off: false, line: r.p.line, op: bdOpN(r.p.op), origin: bdN(mtFrom(r.d)), toward: to ? bdX('toward') + bdN(to) : '',
            comment: (to ? bdX('toward') + bdN(to) + ': ' : '') + bdN(s0.name || '') + ' (' + [s0.code, bdN(s0.city)].filter(Boolean).join(' | ') + ')',
            cells: cols.map(function (c) { return cell(r, c); }) };
          return { p: r.p, off: false, line: r.p.line, op: r.p.op, origin: mtFrom(r.d), toward: to ? 'לכיוון ' + to : '',
            comment: (to ? 'לכיוון ' + to + ': ' : '') + (s0.name || '') + ' (' + [s0.code, s0.city].filter(Boolean).join(' | ') + ')',
            cells: cols.map(function (c) { return cell(r, c); }) };
        }) };
      });
      var when = ps.map(start).sort()[0] || '', ops = opsOf(ps);
      var X = bdEn() ? window.LCBoardEN.TXT : null;
      var title = X ? (old ? X.oldUntil + (when ? LC.dmy(LC.addDays(when, -1)) : X.theChange) : X.newTimetable) + ' · ' + bdLinesT(ps)
        : (old ? 'לו״ז עד ' + (when ? LC.dmy(LC.addDays(when, -1)) : 'השינוי') : 'לו״ז חדש') + ' · ' + linesTxt(ps);
      var sub = X ? (old ? X.prevTt : when ? X.validFrom + LC.dmy(when) : '') : old ? 'לוח הזמנים הקודם — לפני השינוי' : when ? 'בתוקף מ-' + LC.dmy(when) : '';
      return { title: title, sub: sub, subDflt: null, cols: cols, bands: bands, pages: ps, credit: D.ED.credit !== false, en: !!X, miss: Object.keys(BD_MISS),
        note: X ? (old ? X.oldNote : ps.some(function (p) { return p.kind === 'timetable'; }) ? X.newNote : '') : old ? 'באדום — נסיעה שמתבטלת או שהשעה שלה משתנה' : ps.some(function (p) { return p.kind === 'timetable'; }) ? 'בירוק — נסיעה חדשה או בשעה חדשה' : '',
        legend: X ? X.legendDep + (bdX2On() ? ' · ' + X.legendX2 : '') + ' · ' + X.legendMot + ' · ' + X.legendNoOff
          : 'השעות הן שעות היציאה מהתחנה הראשונה' + (bdX2On() ? ' · ×2 — שני אוטובוסים' : '') + ' · לפי נתוני משרד התחבורה · לא פרסום רשמי',
        contacts: ops.map(function (o) { return [o, bdPhone(o)]; }).filter(function (x) { return x[1]; }).concat([['משרד התחבורה', MOT]]).map(function (c) { return X ? [bdOpN(c[0]), c[1]] : c; }),
        feed: ps.map(function (p) { return p.feed; }).filter(Boolean).sort().pop() || '', when: when, tord: D.ED.tord || 'rtl' };
    } finally { D.ED = keep; }
  }

  /* ===== סדר ידני במצב עריכה: הזזה של קו או של פס (↑↓) =====
     bs — הפסים והקווים בסדר שרואים (app-edit.js, bdOrderNow): [{k, bk, mks, nat: {מק"ט: הפס המקורי}, segs: [{k, mks, mv, lk}]}].
     בלוח רואים "חלקים": רצף של קווים עם אותו פס מקורי (natOf) — תחת כותרת אחת */
  function bdWhereSel(bs, sel) {
    if (sel.band) {
      for (var i = 0; i < bs.length; i++) for (var s = 0; s < bs[i].segs.length; s++) if (bs[i].segs[s].k === sel.band) return { b: i, s: s, mv: bs[i].segs[s].mv };
      return null;
    }
    for (var j = 0; j < bs.length; j++) { var x = bs[j].mks.indexOf(sel.mk); if (x >= 0) return { b: j, l: x }; }
    return null;
  }
  // מה שרואים: הקווים לפי הסדר, וכותרת בכל מקום שהפס המקורי מתחלף
  function bdMvSig(bs, natOf) {
    var out = [], last = null;
    bs.forEach(function (H) { H.mks.forEach(function (m) { if (natOf[m] !== last) out.push('[' + (last = natOf[m]) + ']'); out.push(m); }); });
    return out.join('|');
  }
  // קו שהועבר, בקצה של פס, ליד קו מאותו יעד בפס הסמוך — עובר לשם (אין שתי כותרות זהות צמודות)
  function bdMvNorm(bs, natOf) {
    for (var g = 0; g < 200; g++) {
      var ne = bs.filter(function (H) { return H.mks.length; }), ch = false;
      for (var i = 0; i + 1 < ne.length && !ch; i++) {
        var A = ne[i], B = ne[i + 1], a = A.mks[A.mks.length - 1], b = B.mks[0];
        if (natOf[a] !== natOf[b]) continue;
        if (natOf[a] !== A.bk) { A.mks.pop(); B.mks.unshift(a); ch = true; }
        else if (natOf[b] !== B.bk) { B.mks.shift(); A.mks.push(b); ch = true; }
      }
      if (!ch) break;
    }
    return bs;
  }
  /* פס: מתחלף עם הפס הסמוך (פס של קווים שהועברו — עם החלק הסמוך בפס שהוא בתוכו, ובקצה — לפס הסמוך).
     קו שחולק את החלק שלו עם קווים אחרים: מתחלף עם הקו הסמוך — גם בקצה הפס, עם הקו האחרון של הפס הקודם / הראשון של הבא
     (ושם, כשהיעד שלו אחר, הוא מופיע בפס משלו). קו שעומד לבד בחלק שלו: זז כמו פס קטן — מדלג על כל החלק שמעליו / מתחתיו, ולא נכנס לאמצע פס.
     מחזיר {bs, natOf, mk0} או null כשאין מה להזיז (או שלא משתנה כלום במה שרואים) */
  function bdMovePlan(bs, sel, dir) {
    var w = bdWhereSel(bs, sel); if (!w) return null;
    var natOf = {}; bs.forEach(function (H) { Object.keys(H.nat).forEach(function (m) { natOf[m] = H.nat[m]; }); });
    var ws = bs.map(function (H) { return { k: H.k, bk: H.bk, mks: H.mks.slice(), segs: H.segs }; });
    var before = bdMvSig(bs, natOf), mk0 = sel.mk;
    if (w.l == null) {
      if (w.mv) {
        var H = ws[w.b], sg = H.segs.slice(), s2 = w.s + dir, mvs = sg[w.s];
        if (s2 >= 0 && s2 < sg.length) { sg[w.s] = sg[s2]; sg[s2] = mvs; H.mks = sg.reduce(function (a, x) { return a.concat(x.mks); }, []); }
        else {
          var nb2 = w.b + dir; if (nb2 < 0 || nb2 >= ws.length) return null;
          H.mks = H.mks.filter(function (m) { return mvs.mks.indexOf(m) < 0; });
          ws[nb2].mks = dir < 0 ? ws[nb2].mks.concat(mvs.mks) : mvs.mks.concat(ws[nb2].mks);
        }
        mk0 = mvs.mks[0];
      } else { var j = w.b + dir; if (j < 0 || j >= ws.length) return null; var t = ws[w.b]; ws[w.b] = ws[j]; ws[j] = t; mk0 = ws[j].mks[0]; }
    } else {
      // החלקים שרואים: כל קו לפי הסדר, עם הפס שהוא בתוכו (h) והחלק שלו (r)
      var it = [], r = -1;
      ws.forEach(function (H, h) { H.mks.forEach(function (m) { if (!it.length || natOf[m] !== natOf[it[it.length - 1].m]) r++; it.push({ m: m, h: h, r: r }); }); });
      var pos = -1; it.forEach(function (x, i) { if (x.m === sel.mk) pos = i; });
      if (pos < 0) return null;
      var me = it[pos], alone = it.filter(function (x) { return x.r === me.r; }).length === 1;
      if (alone) {
        // לבד בחלק שלו: לפני החלק שמעליו / אחרי החלק שמתחתיו, בפס של הקו שבקצה החלק הזה
        var nbr = it.filter(function (x) { return x.r === me.r + dir; }); if (!nbr.length) return null;
        var an = dir < 0 ? nbr[0] : nbr[nbr.length - 1], L0 = ws[me.h].mks;
        L0.splice(L0.indexOf(me.m), 1);
        var T = ws[an.h].mks, ai = T.indexOf(an.m);
        T.splice(dir < 0 ? ai : ai + 1, 0, me.m);
      } else {
        var L = ws[w.b].mks, k = w.l + dir;
        if (k >= 0 && k < L.length) { var u = L[w.l]; L[w.l] = L[k]; L[k] = u; }
        else {
          var nb = w.b + dir; while (nb >= 0 && nb < ws.length && !ws[nb].mks.length) nb += dir;
          if (nb < 0 || nb >= ws.length) return null;
          // מתחלף עם הקו שמעבר לקצה: לפני הקו האחרון של הפס הקודם / אחרי הקו הראשון של הפס הבא
          L.splice(w.l, 1);
          var N = ws[nb].mks; N.splice(dir < 0 ? N.length - 1 : 1, 0, sel.mk);
        }
      }
    }
    bdMvNorm(ws, natOf);
    return bdMvSig(ws, natOf) === before ? null : { bs: ws, natOf: natOf, mk0: mk0 };
  }

  // לקבצים האחרים של המצגת, ולדף (LCDeck)
  D.bdSlides = bdSlides; D.chgBoardBuild = chgBoardBuild;
  LCDeck.boardFit = function () { return BOARD_FIT; }; LCDeck.boardInk = bdInk; LCDeck.chgBoardModel = chgBoardModel; LCDeck.boardModel = boardModel; LCDeck.chgModel = chgModel;
  LCDeck.boardMove = bdMovePlan; LCDeck.boardWhere = bdWhereSel; LCDeck.boardDates = bdDates; LCDeck.boardSuggest = bdSuggest;
  LCDeck._test.bdDatePage = bdDatePage; LCDeck._test.bdOnDate = bdOnDate; LCDeck._test.bdLtrSplit = function (ps, ed) { var keep = D.ED; D.ED = ed || {}; try { return bdLtrSplit(ps); } finally { D.ED = keep; } };
  LCDeck._test.bdColOrder = bdColOrder; LCDeck.boardColId = bdColId; LCDeck._test.bdWkSplit = bdWkSplit; LCDeck._test.bdAutoW = bdAutoW; LCDeck._test.bdCost = bdCost; LCDeck._test.bdFracs = bdFracs;
  LCDeck.boardWidths = function () { var g = BD_CG[BD_GEO.form + '|' + BD_GEO.sc]; return g ? { tw: g.tw, cl: g.cl, co: g.co, ws: g.ws.slice(), man: g.man, mt: g.mt, cost: bdCost(g.mt, g.ws), rows: g.mt.rows.map(function (r) { return Math.max.apply(null, [r.fl].concat(r.cells.map(function (c) { var w = 0; for (var k = c.c; k < c.c + c.s; k++) w += g.ws[k]; return bdCellH(g.mt, c, w); }))); }) } : null; };
})(LCDeck._in);
