/* מצגת לשינוי בקו — "טבלה לפי יעד" (לוח מודעות): המודל, העימוד, סדר הקווים וסוגי הקווים, צבע ואות לכל חלופה,
   והלוח של הודעה על שינוי (גם לייצוא לאקסל). חלק מ-LCDeck — נטען אחרי deck.js ו-deck-sign.js (ראו deck.js). */
(function (D) {
  var E = D.E, phoneOf = D.phoneOf, MOT = D.MOT, start = D.start, cover = D.cover, closing = D.closing, streetOf = D.streetOf, onePages = D.onePages,
      fullSlides = D.fullSlides, opsOf = D.opsOf, isKind = D.isKind, mergeSh = D.mergeSh, kindSlides = D.kindSlides, CU_COL = D.CU_COL, hm2 = D.hm2,
      isoDow = D.isoDow, dShort = D.dShort, linesTxt = D.linesTxt, cuDay = D.cuDay, cuMerge = D.cuMerge, ALT_LET = D.ALT_LET, cuTagCol = D.cuTagCol,
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
  function bdT(k, dflt) { var t = D.ED.bd && D.ED.bd.t; return t && Object.prototype.hasOwnProperty.call(t, k) && t[k] != null ? t[k] : dflt; }
  function bdOff(kind, k) { var o = D.ED.bd && D.ED.bd[kind]; return !!(o && o[k]); }
  function bdK(k, cls, ph) { return ' class="bdt' + (cls ? ' ' + cls : '') + '" data-bk="' + E(k) + '"' + (ph ? ' data-ph="' + E(ph) + '"' : ''); }
  /* שורה שהמשתמש הוסיף (ED.bd.nr — [{id, after}]): קו, מוצא ותאים ריקים לכתיבה, באותו פס, מתחת לשורה after */
  function bdNewRow(id) {
    var k = 'n' + id, p = { makat: k, line: '', op: '' };
    return { p: p, d: null, add: true, key: k, first: true, n: 1, line: bdT('ln:' + k, ''), op: bdT('op:' + k, ''), color: '#3d4a45',
      origin: bdT(k + '|o', ''), stop: bdT(k + '|s', ''), toward: bdT(k + '|w', ''), until: '', comment: '' };
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
  function bdWkSplit(rows) {
    var cands = [[[0, 1, 2, 3, 4]]];
    for (var a = 1; a < 5; a++) {
      cands.push([[0, 1, 2, 3, 4].slice(0, a), [0, 1, 2, 3, 4].slice(a)]);
      for (var b = a + 1; b < 5; b++) cands.push([[0, 1, 2, 3, 4].slice(0, a), [0, 1, 2, 3, 4].slice(a, b), [0, 1, 2, 3, 4].slice(b)]);
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
    return (d.days[w] || []).join(',') + '/' + (d.da ? d.da[w] || '' : '') + '/' + (d.dn ? JSON.stringify(d.dn[w] || '') : '') + '/' + (d.mk ? JSON.stringify(d.mk[w] || '') : '');
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
  var BD_ORD = ['type', 'add', 'dest', 'op', 'num', 'man'];
  function bdOrd() { return BD_ORD.indexOf(D.ED.bord) >= 0 ? D.ED.bord : 'type'; }
  var BD_TYPES = ['u', 'i', 'r'], BD_TYPE_LBL = { u: 'קווים עירוניים', i: 'קווים בין-עירוניים', r: 'קווים אזוריים' };
  function bdTypeOrder() {
    var o = (D.ED.btypes || []).filter(function (t) { return BD_TYPES.indexOf(t) >= 0; });
    BD_TYPES.forEach(function (t) { if (o.indexOf(t) < 0) o.push(t); });
    return o;
  }
  function bdSort(pages) {
    var ord = bdOrd(), po = D.ED.pord || [], pm = ord === 'man' && D.ED.bman ? D.ED.bman : [];
    if (ord === 'type') ord = D.ED.bsub === 'num' ? 'num' : 'add';
    var byNum = function (a, b) { return bdNum(a.line) - bdNum(b.line) || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0); };
    var rk = function (p) { var j = pm.indexOf(p.makat); if (j >= 0) return j; var i = po.indexOf(p.makat); return pm.length + (i < 0 ? po.length + pages.indexOf(p) : i); };
    var byAdd = function (a, b) { return rk(a) - rk(b); };
    if (ord === 'add' || ord === 'man') return pages.slice().sort(byAdd);
    if (ord !== 'op') return pages.slice().sort(byNum);
    var opR = {}, n = 0;
    pages.slice().sort(byAdd).forEach(function (p) { var o = String(agOf(p) || p.op); if (!(o in opR)) opR[o] = n++; });
    return pages.slice().sort(function (a, b) { return opR[String(agOf(a) || a.op)] - opR[String(agOf(b) || b.op)] || byNum(a, b); });
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
  function bdModel(pages, xo) {
    var ps = bdSort(pages), ord = bdOrd();
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
    if (ord === 'type' && D.ED.bthide) ps = ps.filter(function (p) { return !D.ED.bthide[p._t]; });
    var par = {}, find = function (c) { while (par[c] && par[c] !== c) c = par[c]; return c; };
    ps.forEach(function (p) { if (!local(p)) return; p._E.forEach(function (c) { par[c] = par[c] || c; }); p._E.forEach(function (c) { par[find(c)] = find(p._E[0]); }); });
    var by = {}, inter = [], loc = [], all = [], used = {};
    ps.forEach(function (p) {
      var isL = local(p), k0 = isL ? 'L|' + find(p._E[0]) : 'I|' + p._E.slice().sort().join('|');
      // לפי סוג קו: אותו יעד בשני סוגים — שני פסים, אחד בכל פרק (המפתח של הראשון — כמו בשאר הסדרים, לטקסט שנערך בפס)
      var bk = ord === 'type' ? p._t + '>' + k0 : k0;
      if (!by[bk]) {
        var k = used[k0] ? k0 + '#' + p._t : k0; used[k0] = 1;
        by[bk] = { k: k, local: isL, t: p._t, pages: [], E: p._E }; (isL ? loc : inter).push(by[bk]); all.push(by[bk]);
      }
      by[bk].pages.push(p);
    });
    // לפי יעד: הפסים הבינעירוניים ואחריהם העירוניים; לפי סוג קו — לפי הפרקים; בשאר הסדרים — הפסים לפי הקו הראשון בכל אחד
    var bands = ord === 'dest' ? inter.concat(loc) : all, ci = 0;
    if (ord === 'type') {
      var to = bdTypeOrder();
      bands = bands.map(function (b, i) { return [b, i]; }).sort(function (x, y) { return to.indexOf(x[0].t) - to.indexOf(y[0].t) || x[1] - y[1]; }).map(function (x) { return x[0]; });
      // כותרת פרק מעל הפס הראשון של כל סוג (אפשר לשנות או למחוק, כמו כל טקסט בלוח)
      bands.forEach(function (b, i) { if (!i || bands[i - 1].t !== b.t) { b.sec = b.t; b.secLabel = bdT('sec:' + b.t, BD_TYPE_LBL[b.t]); } });
    }
    bands.forEach(function (b) {
      if (b.local) {
        var cs = b.E.slice(); b.pages.forEach(function (p) { p._E.forEach(function (c) { if (cs.indexOf(c) < 0) cs.push(c); }); });
        cs.sort(function (x, y) { return (y === home) - (x === home); });
        b.label = (b.pages.length > 1 ? 'הקווים העירוניים · ' : 'קו עירוני · ') + cs.join(', ');
      } else {
        // הזוגות (מוצא, יעד) של השורות; כשלכל השורות אותם שני קצוות — "א – ב"; אחרת הקצה המשותף מול השאר ("קרית מלאכי / באר טוביה – נחם")
        var pairs = [];
        b.pages.forEach(function (p) { p._sd.forEach(function (d) { pairs.push((d.od || []).map(bdQ)); }); });
        var ends = b.E, shared = ends.filter(function (c) { return pairs.every(function (q) { return q.indexOf(c) >= 0; }); });
        var homeFirst = function (x, y) { return (y === home) - (x === home); };
        if (ends.length === 1) b.label = ends[0];   // קו שיוצא וחוזר לאותו מקום (קו אזורי מעגלי)
        else if (ends.length === 2) b.label = ends.slice().sort(homeFirst).join(' – ');
        else if (shared.length === 1) {
          var rest = ends.filter(function (c) { return c !== shared[0]; }).sort(homeFirst);
          b.label = rest.indexOf(home) >= 0 ? rest.join(' / ') + ' – ' + shared[0] : shared[0] + ' – ' + rest.join(' / ');
        } else b.label = ends.slice().sort(homeFirst).join(' / ');
        // "(דרך X)": רק כש-X לא אחד הקצוות, וכל השורות בפס עוצרות בו
        var via = home && ends.indexOf(home) < 0 && b.pages.every(function (p) { return p._sd.every(function (d) { return (d.cs || []).map(bdQ).indexOf(home) >= 0; }); });
        if (via) b.label += ' (דרך ' + home + ')';
      }
      b.label = bdT('band:' + b.k, b.label);
      var ags = opsOf(b.pages.map(function (p) { return { op: String(agOf(p)) }; }));
      b.color = ags.length === 1 && COLORS[ags[0]] ? cuTagCol(ags[0], 0) : CU_COL[ci++ % CU_COL.length];
      b.ops = opsOf(b.pages);
      b.rows = [];
      b.pages.forEach(function (p) {
        var ds = p._sd.slice();
        // הכיוון שיוצא מהעיר "שלנו" — ראשון
        ds.sort(function (x, y) { return (bdQ((y.od || [])[0]) === home) - (bdQ((x.od || [])[0]) === home) || (x.dir < y.dir ? -1 : 1); });
        ds.forEach(function (d, i) { b.rows.push(bdRow(p, d, i, ds.length, b)); });
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
      wk = bdWkSplit(rowsV);
    }
    var cgs = wk.concat([[5], [6]]);
    cgs.forEach(function (days, gi) {
      var any = false, eve = true;
      bands.forEach(function (b) { b.rows.filter(vis).forEach(function (r) { if (r.add) return; days.forEach(function (w) { var l = r.d.days[w] || []; if (l.length || (r.d.same && r.d.same[w])) any = true; if (r.d.same && r.d.same[w]) eve = false; l.forEach(function (m) { if (m < 16 * 60) eve = false; }); }); }); });
      if (!any) return;
      var isWk = days[0] < 5, split = isWk && wk.length > 1;
      cols.push({ days: days, wk: split, label: bdT('th:' + days.join(''), split ? (days.length === 1 ? 'יום ' + dShort(days) : dShort(days)) : isWk ? 'ימים ' + dShort(days) : days[0] === 5 ? 'יום שישי' : eve ? 'מוצאי שבת' : 'שבת') });
    });
    // ימים בעמודות של ימי חול שאין בהם נסיעות בכלל (למשל לוח בלי יום רביעי) — נכנסים לעמודה הסמוכה, כדי שלא יחסרו בכותרת
    var nWk = cols.filter(function (c) { return c.wk; }).length;
    if (nWk === 1) cols.forEach(function (c) { if (c.wk) { c.wk = false; c.label = bdT('th:' + c.days.join(''), 'ימים ' + dShort(c.days)); } });
    // לאקסל: עמודה לחג בשבוע הקרוב — רק כשהשעות בו שונות מהיום הרגיל באחד הקווים (כמו ב"משולב")
    if (xo && xo.hol) ((D.ED.hol && D.ED.hol.length ? D.ED.hol : (pages[0] || {}).hol) || []).forEach(function (h) {
      if (bands.some(function (b) { return b.rows.some(function (r) { return !r.off && r.d && r.d.x && r.d.x[h[0]]; }); }))
        cols.push({ days: [isoDow(h[0])], hol: h, label: h[2] + ' ' + LC.dm(h[0]) });
    });
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
      r.cells = mcols.map(function (c, i) { if (c.skip) return { skip: true, ents: [], notes: [] }; var x = bdCellX(r, c, i); if (c.span) x.span = c.span; return x; });
      bdAltMarks(r);
    }); });
    function bdCellX(r, c, i) {
      return r.add ? { ents: [], notes: [], key: r.key + '|c' + i, nkey: r.key + '|n' + i, txt: bdT(r.key + '|c' + i, ''), ntxt: bdT(r.key + '|n' + i, null), ph: 'שעות' } : bdCell(r, c, i);
    }
    var valid = pages.map(function (p) { return p.valid || p.eff; }).filter(Boolean).sort()[0] || '';
    var unt = pages.map(function (p) { return p.until || ''; }), until = unt.every(function (u) { return u && u === unt[0]; }) ? unt[0] : '';
    // הקווים שנשארו בלוח (אחרי הסרות) — לשורת המשנה ולמוקדי המידע
    var vps = ps.filter(function (p) { return bands.some(function (b) { return b.rows.some(function (r) { return r.p === p && !r.off; }); }); });
    var ops = opsOf(vps), cities = [];
    if (home) cities.push(home);
    var chg = ps.some(function (p) { return p.chg; });
    var dflt = chg ? 'לוח הזמנים החדש · ' + linesTxt(ps) : 'זמני נסיעות · ' + (D.ED.bplace || (ps.length <= 3 ? linesTxt(ps) : cities.join(', ')) || linesTxt(ps));
    var alts = bands.some(function (b) { return b.rows.some(function (r) { return !r.off && r.cells.some(function (x) { return x.notes.length && x.ntxt == null && x.txt == null; }); }); });
    var sub = [BD_FROM ? 'בתוקף מהתאריך שליד כל קו' : valid ? 'בתוקף מ-' + LC.dmy(valid) + (until ? ' עד ' + LC.dmy(until) : '') : '', vps.length ? linesTxt(vps) : ''].filter(Boolean).join(' · ');
    var contacts = ops.map(function (o) { return [o, bdPhone(o)]; }).filter(function (x) { return x[1]; }).concat([['משרד התחבורה', MOT]])
      .map(function (c) { return [bdT('phn:' + c[0], c[0]), bdT('php:' + c[0], c[1]), c[0]]; }).filter(function (c) { return c[0] || c[1]; });
    return { ord: ord, tcount: tcount, types: bdTypeOrder(), title: bdT('title', (D.ED.btitle || '').trim() || dflt), dflt: dflt, valid: valid, until: until, sub: bdT('sub', sub), subDflt: sub, home: home, cols: cols, bands: bands, pages: vps.length ? vps : ps,
      // "עדכונים": מה שהמשתמש כתב; בלי טקסט — משפט על הנסיעות באדום, רק כשיש כאלה בלוח (אחרת השורה לא מופיעה); נמחק בלוח — לא מופיע
      note: bdT('note', (D.ED.bnote || '').trim() || (alts ? 'נסיעות שמסומנות באות ובצבע (א׳, ב׳…) עוברות בדרך אחרת' : '')), contacts: contacts,
      feed: pages.map(function (p) { return p.feed; }).filter(Boolean).sort().pop() || '', credit: true, tord: D.ED.tord || 'ltr',
      // כל טקסט בלוח ניתן לעריכה: כותרות העמודות, "עדכונים", "מוקדי מידע", שורת ההסבר והקרדיט (את הקרדיט — רק לשנות, לא למחוק)
      th: { line: bdT('th:line', 'קו'), orig: bdT('th:orig', 'מוצא'), wk: bdT('th:wk', 'יום חול') }, lbl: { upd: bdT('lbl:upd', 'עדכונים'), ph: bdT('lbl:ph', 'מוקדי מידע'), cont: bdT('lbl:cont', '(המשך)'), off: bdT('lbl:off', 'אינו פעיל'), same: bdT('lbl:same', 'ללא שינוי') },
      legend: bdT('legend', null), creditTxt: bdT('credit', '') || BD_CR,
      // הודעה על שינוי: מקרא לסימונים (ירוק — חדש או שונה, אדום מחוק — בוטל), רק כשיש כאלה בלוח
      chg: chg, key: chg ? { nw: bdT('lbl:knw', 'חדש או שונה'), rm: bdT('lbl:krm', 'בוטל'), hasNw: bdHas(bands, 'nw'), hasRm: bdHas(bands, 'rm') } : null };
  }
  /* חלופות בשורה (קו וכיוון): לכל חלופה אות (א׳, ב׳…) וצבע משלה — לפי הסדר של d.v. האות אחרי השעה, כדי שגם בהדפסה בשחור-לבן
     רואים איזו נסיעה באיזו דרך; ההערה מתחת לתא ובמקרא — באותו צבע ועם אותה אות. r.alts — למקרא */
  var BD_ALT_COL = ['#c81e1e', '#7e22ce', '#c2410c', '#0f766e', '#92400e', '#be185d', '#1d4ed8', '#4d7c0f'];
  function bdAltMarks(r) {
    var used = {};
    (r.cells || []).forEach(function (x) { x.ents.forEach(function (e) { if (e.a) used[e.a] = 1; }); });
    var as = Object.keys(used).map(Number).sort(function (a, b) { return a - b; }), mk = {};
    r.alts = as.map(function (a, i) {
      return (mk[a] = { a: a, L: (ALT_LET.charAt(i) || '*') + '׳', c: BD_ALT_COL[i % BD_ALT_COL.length], txt: (r.d && r.d.v || [])[a - 1] || 'במסלול אחר' });
    });
    (r.cells || []).forEach(function (x) {
      x.ents.forEach(function (e) { if (e.a) { e.al = mk[e.a].L; e.ac = mk[e.a].c; } });
      x.notes.forEach(function (nt) { if (nt.a) { nt.L = mk[nt.a].L; nt.c = mk[nt.a].c; } });
    });
  }
  function bdHas(bands, k) { return bands.some(function (b) { return b.rows.some(function (r) { return !r.off && (r.cells || []).some(function (x) { return x.txt == null && (k === 'rm' ? (x.rm || []).length : x.ents.some(function (e) { return e.k || e.nwp; })); }); }); }); }
  var BD_FROM = false;
  var BD_CR = 'הוכן בכלי ״מצגת לשינוי בקו״ של הקו הבוחן · kavbochan.app';
  function bdRow(p, d, i, n, b) {
    var o = (d.od || []).map(bdQ), inter = !b.local && o[0] && o[1] && o[0] !== o[1], cs = (d.cs || []).map(bdQ);
    var to = inter ? o[1] : d.t, city0 = cs[0] || o[0] || '';
    var stop = d.f + (d.fc ? ' (' + d.fc + ')' : ''), k = p.makat + '.' + d.dir;
    return { p: p, d: d, key: k, first: i === 0, n: n, inter: inter, line: bdT('ln:' + p.makat, p.line), op: bdT('op:' + p.makat, p.op), color: bdOpCol(p),
      origin: bdT(k + '|o', inter ? 'מ' + o[0] : d.f),
      stop: bdT(k + '|s', inter ? stop : (d.fc ? 'תחנה ' + d.fc : '')),
      toward: bdT(k + '|w', to ? 'לכיוון ' + to : ''),
      from: p.chg && BD_FROM ? bdT('fr:' + p.makat, 'מ-' + LC.dm(p.valid)) : '',
      until: p.until || '', untilTxt: p.until ? bdT('un:' + p.makat, 'עד ' + LC.dm(p.until)) : '',
      comment: (to ? 'לכיוון ' + to + (cs.length && cs[cs.length - 1] !== to ? ', ' + cs[cs.length - 1] : '') + ': ' : '') +
        d.f + ' (' + [d.fc, city0].filter(Boolean).join(' | ') + ')' };
  }
  /* תא: היציאות של שורה אחת בקבוצת ימים; נסיעה שרק בחלק מהימים — part (למשל "ה׳"), חלופה — a, תגבור — n */
  function bdCell(r, c, i) {
    var mg = cuMerge([{ p: r.p, d: r.d }], c.days, c.hol ? function (it, w) { var x = it.d.x && it.d.x[c.hol[0]]; return x ? [x, (it.d.xa || {})[c.hol[0]], (it.d.xn || {})[c.hol[0]]] : cuDay(it, w); } : null), alts = {};
    var ents = mg.ents.filter(function (e) { return !e.a || bdServes(r.d, e.a, r.p); }).map(function (e) {   // נסיעה של חלופה שלא עוצרת במקום — לא בלוח
      var part = '';
      if (e.part) { var miss = c.days.filter(function (w) { return e.days.indexOf(w) < 0; }); part = e.days.length <= miss.length ? dShort(e.days) : 'חוץ מ' + dShort(miss); }
      if (e.a) (alts[e.a] = alts[e.a] || []).push(hm2(e.m));
      return { m: e.m, t: hm2(e.m), a: e.a, n: e.n, part: part, days: e.days };
    });
    var notes = Object.keys(alts).map(Number).sort(function (a, b) { return a - b; }).map(function (a) { return { a: a, times: alts[a], all: alts[a].length === ents.length, txt: (r.d.v || [])[a - 1] || 'במסלול אחר' }; });
    var key = r.key + '|c' + i, rm = [];
    // הודעה על שינוי: כל יציאה בלוח החדש מסומנת — חדשה (nw) או שהשעה שלה זזה (sh, מ-was); נסיעות שבוטלו — rm (בשעה הקודמת)
    if (r.d.mk) {
      var partOf = function (ds, all) { var miss = all.filter(function (w) { return ds.indexOf(w) < 0; }); return !miss.length ? '' : ds.length <= miss.length ? dShort(ds) : 'חוץ מ' + dShort(miss); };
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
        else { e.k = ''; e.nwp = dShort(nd); }
      });
      var rmBy = {};
      act.forEach(function (w) { (r.d.mk[w] || []).forEach(function (x) { if (x[1] === 'rm') (rmBy[x[0]] = rmBy[x[0]] || []).push(w); }); });
      rm = Object.keys(rmBy).map(Number).sort(function (a, b) { return a - b; }).map(function (m) { return { m: m, t: hm2(m), rm: true, part: partOf(rmBy[m], act) }; });
      if (sameD.length) notes.push({ plain: dShort(sameD) + ' — ללא שינוי' });
    }
    // טקסט שהמשתמש כתב במקום השעות (txt) או במקום ההערה (ntxt); "" — התא / ההערה נמחקו
    return { ents: ents, notes: notes, rm: rm, key: key, nkey: r.key + '|n' + i, txt: bdT(key, null), ntxt: bdT(r.key + '|n' + i, null) };
  }
  function BD_SAME() { return BD_M ? BD_M.lbl.same : 'ללא שינוי'; }
  /* ההערה מתחת לתא: "א׳ 08:00 — מארבע עונות" (בצפוף — רק "א׳ — מארבע עונות": השעות כבר מסומנות באות בתא) */
  function bdNoteLine(nt) { return nt.plain || ((nt.L ? nt.L + ' ' : '') + (nt.all ? 'כל הנסיעות' : D.ED.bdense ? '' : nt.times.join(' ')) + ' — ' + nt.txt).replace(/ {2,}/g, ' ').replace(/^ /, ''); }
  function bdNoteTxt(x) { return x.ntxt != null ? x.ntxt : x.txt != null && !x.same ? '' : x.notes.map(bdNoteLine).join('\n'); }
  function bdNoteHtml(x) {
    if (x.ntxt != null || (x.txt != null && !x.same)) return E(bdNoteTxt(x)).replace(/\n/g, '<br>');
    return x.notes.map(function (nt) { return nt.c ? '<span class="bna" style="color:' + nt.c + '">' + E(bdNoteLine(nt)) + '</span>' : E(bdNoteLine(nt)); }).join('<br>');
  }
  function bdCellHtml(x) {
    var nt = bdNoteTxt(x), nh = nt ? '<span' + bdK(x.nkey, 'bnote') + '>' + bdNoteHtml(x) + '</span>' : '';
    if (x.txt != null) return '<td class="bt' + (x.same ? ' same' : '') + '"><span' + bdK(x.key, 'tl', x.ph) + '>' + E(x.txt) + '</span>' + nh + '</td>';
    var rms = x.rm || [], inl = BD_RM !== 'note' && rms.length <= BD_RM_MAX;   // הרבה נסיעות שבוטלו בתא אחד — בשורה מתחת לתא
    if (!x.ents.length && !rms.length) return '<td class="bt off"><span' + bdK(x.key) + '>' + E(BD_M ? BD_M.lbl.off : 'אינו פעיל') + '</span>' + nh + '</td>';
    // נסיעות שבוטלו: בשעה הקודמת שלהן, באדום מחוק (או בשורה מתחת לתא: "בוטלו: 07:35, 09:10")
    var toks = inl ? x.ents.concat(rms).sort(function (a, b) { return a.m - b.m || (a.rm ? 1 : 0) - (b.rm ? 1 : 0); }) : x.ents;
    var rmLine = !inl && rms.length ? '<span class="bdrm">בוטלו: ' + rms.map(function (e) { return '<span class="t num" dir="ltr">' + e.t + (e.part ? '<sup dir="rtl">' + E(e.part) + '</sup>' : '') + '</span>'; }).join(', ') + '</span>' : '';
    return '<td class="bt"><span' + bdK(x.key, 'tl') + '>' + toks.map(function (e) {
      // כל שעה עם ×N והסימן שלה — יחידה אחת מבודדת (dir=ltr), כדי שהסימן בעברית לא יהפוך את סדר השעות בתא
      var k = e.rm ? ' rm' : e.k ? ' nw' : '', sr = e.rm ? 'בוטלה' : e.k === 'nw' ? 'חדשה' : '';
      var was = e.k === 'sh' ? '<small class="was" dir="rtl">' + (e.m < e.was ? 'הוקדם' : 'נדחה') + ' מ-' + hm2(e.was) + '</small>' :
        e.nwp ? '<small class="was" dir="rtl">' + (e.was != null ? e.nwp + ': ' + (e.m < e.was ? 'הוקדם' : 'נדחה') + ' מ-' + hm2(e.was) : 'חדש ב-' + e.nwp) + '</small>' : '';
      // חלופה: השעה בצבע של החלופה, ואחריה האות שלה (א׳, ב׳…) — בתוך אותה יחידה
      // היחידה בכיוון של סדר השעות: השעה, ואחריה (בכיוון הקריאה) האות, ×N והימים — משמאל לימין מימין לשעה, מימין לשמאל משמאל לה
      return '<span class="t num' + (e.a ? ' alt' : '') + k + '" dir="' + (D.ED.tord === 'rtl' ? 'rtl' : 'ltr') + '"' + (e.ac && !e.rm ? ' style="color:' + e.ac + '"' : '') + '>' + e.t + (e.al ? '<bdi dir="rtl" class="al">' + e.al + '</bdi>' : '') +
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
  function bdLineCell(r, span) {
    return '<td class="bl" rowspan="' + span + '"><span' + bdK('ln:' + r.p.makat, 'badge sm num', r.add ? 'קו' : '') + ' style="background:' + r.color + ';color:#fff">' + E(r.line) + '</span><small' + bdK('op:' + r.p.makat, 'op', r.add ? 'מפעיל' : '') + '>' + E(r.op) + '</small>' +
      (r.until ? '<small' + bdK('un:' + r.p.makat, 'un') + '>' + E(r.untilTxt) + '</small>' : '') +
      (r.p.chg === 'new' ? '<small' + bdK('nl:' + r.p.makat, 'nwl') + '>' + E(bdT('nl:' + r.p.makat, 'קו חדש')) + '</small>' : '') +
      (r.from ? '<small' + bdK('fr:' + r.p.makat, 'un') + '>' + E(r.from) + '</small>' : '') + '</td>';
  }
  function bdRowHtml(r, lineSpan) {
    // data-rk / data-mk — במצב עריכה לוחצים על שורה כדי לבחור אותה (ועל מספר הקו — את כל השורות של הקו), ואז מוחקים מהסרגל
    return '<tr class="br' + (r.first ? ' lead' : '') + (r.add ? ' badd' : '') + '" data-rk="' + E(r.key) + '" data-mk="' + E(r.p.makat) + '" data-ln="' + E(r.line) + '">' + (lineSpan ? bdLineCell(r, lineSpan) : '') +
      '<td class="bo">' +
      // טקסט שנמחק — נשאר כשדה ריק (במצב עריכה אפשר ללחוץ עליו ולשחזר; בהדפסה הוא לא תופס מקום)
      '<b' + bdK(r.key + '|o', '', r.add ? 'מוצא' : '') + '>' + E(r.origin) + '</b><small' + bdK(r.key + '|s', '', r.add ? 'תחנה' : '') + '>' + E(r.stop) + '</small>' +
      '<small' + bdK(r.key + '|w', r.inter ? 'tw twi' : 'tw', r.add ? 'לכיוון' : '') + '>' + E(r.toward) + '</small></td>' +
      r.cells.map(function (x) { return x.skip ? '' : x.span ? bdCellHtml(x).replace('<td ', '<td colspan="' + x.span + '" ') : bdCellHtml(x); }).join('') + '</tr>';
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
    return '<tr class="bband' + (b.off ? ' boff noprint' : '') + '" data-bkey="' + E(b.k) + '" style="background:' + b.color + '"><td colspan="' + (ncol + 2) + '"><span' + bdK('band:' + b.k) + '>' + E(b.label) + '</span>' + (cont && BD_M && BD_M.lbl.cont ? ' <span' + bdK('lbl:cont') + '>' + E(BD_M.lbl.cont) + '</span>' : '') + '</td></tr>';
  }
  /* רוחב העמודות: כך שהלוח כולו יהיה הכי נמוך — מחלקים את הרוחב ב"משבצות" (שעה אחת ברוחב), כל פעם למשבצת שהכי
     מקצרת את סכום הגבהים של השורות (גובה שורה — התא הגבוה בה: שעות, סימונים והערות). תא ממוזג (ימי חול זהים) — על
     הרוחב של כל העמודות שלו. BD_GEO — הצורה והגודל (מהם כמה שעות נכנסות בשורה) */
  var BD_GEO = { form: 'sign', sc: 1 }, BD_CG = {};
  var BD_FS = { sign: 13, deck: 16, status: 23 };
  function bdSlots(form, sc) {
    var dn = !!D.ED.bdense, W = FORMS[form].w - (form === 'sign' ? (dn ? 36 : 52) : 72) - (form === 'sign' ? (dn ? 128 : 156) : form === 'deck' ? (dn ? 178 : 226) : (dn ? 218 : 266));
    return Math.max(4, W / (BD_FS[form] * sc * (dn ? 3.1 : 3.4)));
  }
  function bdColW(M, T) {
    var n = M.cols.length, rows = [];
    M.bands.forEach(function (b) { b.rows.forEach(function (r) {
      if (r.off) return;
      rows.push(r.cells.map(function (x, i) {
        if (x.skip) return null;
        var wt, notes = bdNoteTxt(x).split('\n').filter(Boolean).map(function (s) { return s.length; });
        if (x.txt != null) wt = Math.max(1.8, x.txt.length / 5.5);
        else if (!x.ents.length && !(x.rm || []).length) wt = 1.8;
        else wt = x.ents.concat(BD_RM !== 'note' && (x.rm || []).length <= BD_RM_MAX ? x.rm || [] : []).reduce(function (t, e) { return t + 1 + (e.al ? 0.35 : 0) + (e.part ? 0.5 : 0) + (e.was != null || e.nwp ? 1 : 0) + (e.n > 1 ? 0.3 : 0); }, 0);
        return { c: i, s: x.span || 1, wt: wt, nt: notes };
      }).filter(Boolean));
    }); });
    var cost = function (ws) {
      var t = 0;
      rows.forEach(function (cs) {
        var mx = 1;
        cs.forEach(function (x) { var w = 0; for (var k = x.c; k < x.c + x.s; k++) w += ws[k]; var l = Math.ceil(x.wt / w - 1e-9); x.nt.forEach(function (s) { l += Math.ceil(s / (w * 5.5) - 1e-9) * 0.8; }); if (l > mx) mx = l; });
        t += mx;
      });
      return t;
    };
    var ws = M.cols.map(function () { return 2; }), rem = T - 2 * n;
    if (rem <= 0) return ws;
    var cur = cost(ws);
    while (rem >= 0.5) {
      var best = null;
      for (var c = 0; c < n; c++) for (var k = 1; k <= 8 && k * 0.5 <= rem; k++) {
        ws[c] += k * 0.5; var v = cost(ws); ws[c] -= k * 0.5;
        var gain = (cur - v) / k;
        if (gain > 1e-9 && (!best || gain > best.g + 1e-9)) best = { g: gain, c: c, k: k, v: v };
      }
      if (!best) break;
      ws[best.c] += best.k * 0.5; rem -= best.k * 0.5; cur = best.v;
    }
    return ws;   // מה שנשאר — מתחלק לפי היחס (הרוחב באחוזים)
  }
  function bdColgroup(M) {
    var T = Math.round(bdSlots(BD_GEO.form, BD_GEO.sc) * 2) / 2, ck = T + '|' + M.cols.length;
    if (BD_CG.M !== M) BD_CG = { M: M };
    var w = BD_CG[ck] || (BD_CG[ck] = bdColW(M, T));
    var tot = w.reduce(function (a, b) { return a + b; }, 0);
    return '<colgroup><col class="cl"><col class="co">' + w.map(function (x) { return '<col style="width:' + (x / tot * 100).toFixed(2) + '%">'; }).join('') + '</colgroup>';
  }
  function bdHead(M, form) {
    return '<div class="cu-head bd-head"><div class="t"><div>' + (M.title ? '<h1' + bdK('title', 'hd') + '>' + E(M.title) + '</h1>' : '') +
      (M.sub ? '<p' + bdK('sub', 'sub') + '>' + E(M.sub) + '</p>' : '') +
      (M.key && (M.key.hasNw || M.key.hasRm) ? '<p class="bd-key">' + (M.key.hasNw ? '<span' + bdK('lbl:knwx', 't num nw') + ' dir="ltr">' + E(bdT('lbl:knwx', '07:00')) + '</span> <span' + bdK('lbl:knw') + '>' + E(M.key.nw) + '</span>' : '') +
        (M.key.hasRm ? '<span' + bdK('lbl:krmx', 't num rm') + ' dir="ltr">' + E(bdT('lbl:krmx', '07:00')) + '</span> <span' + bdK('lbl:krm') + '>' + E(M.key.rm) + '</span>' : '') + '</p>' : '') + '</div></div></div>';
  }
  /* מקרא לחלופות: שורה לכל קו וכיוון בעמוד שיש בו נסיעות בדרך אחרת — האות והצבע של כל חלופה, ומה הדרך */
  function bdAltEntry(r) {
    var two = r.n > 1 && r.toward;
    return '<p class="bd-al" data-ak="' + E(r.key) + '"><b class="bd-aln">קו ' + E(r.line) + (two ? ' ' + E(r.toward) : '') + ':</b> ' + r.alts.map(function (x) {
      return '<span class="bd-ali" style="color:' + x.c + '"><b class="al">' + x.L + '</b> ' + E(x.txt) + '</span>';
    }).join(' <span class="bd-als">·</span> ') + '</p>';
  }
  function bdAltRows(rows) { return (rows || []).filter(function (r) { return !r.off && r.alts && r.alts.length; }); }
  function bdAltLegend(rows) { rows = bdAltRows(rows); return rows.length ? '<div class="bd-alts">' + rows.map(bdAltEntry).join('') + '</div>' : ''; }
  /* מוקדי מידע: רק החברות שהקווים שלהן בעמוד הזה (ops), ומשרד התחבורה. בלי ops — כל החברות שבלוח. rows — השורות בעמוד (למקרא החלופות) */
  function bdFoot(M, ops, pgi, rows) {
    var cs = ops ? M.contacts.filter(function (c) { return c[2] === 'משרד התחבורה' || ops.indexOf(c[2]) >= 0; }) : M.contacts;
    return '<div class="bd-foot">' + bdAltLegend(rows) + (M.note ? '<p class="bd-upd">' + (M.lbl.upd ? '<b' + bdK('lbl:upd') + '>' + E(M.lbl.upd) + '</b> ' : '') + '<span' + bdK('note') + '>' + E(M.note) + '</span></p>' : '') +
      (cs.length ? '<p class="bd-ph">' + (M.lbl.ph ? '<b' + bdK('lbl:ph') + '>' + E(M.lbl.ph) + '</b> ' : '') + cs.map(function (c) {
        return '<span>' + (c[0] ? '<span' + bdK('phn:' + c[2]) + '>' + E(c[0]) + '</span>' : '') + ' ' + (c[1] ? '<b' + bdK('php:' + c[2], 'ltr') + '>' + E(c[1]) + '</b>' : '') + '</span>';
      }).join('') + '</p>' : '') +
      '<div class="cu-foot"><span' + bdK('legend') + '>' + (M.legend != null ? E(M.legend) : 'שעות היציאה מהתחנה הראשונה · ' + (M.chg ? '<span class="nwt">בירוק</span> — נסיעה חדשה או בשעה חדשה · <span class="alt">באדום מחוק</span> — נסיעה שבוטלה' : '<span class="alt">באות ובצבע</span> — נסיעה בדרך אחרת') + ' · ×2 — שני אוטובוסים · לפי נתוני משרד התחבורה' +
      (M.feed ? ' מ-' + LC.dmy(M.feed) : '')) + '</span><span' + bdK('pg:' + (pgi || 0), 'pg num') + '></span></div>' +
      // בכל עמוד, גם בצפוף ובעמוד אחד: שורת "אדם פרטי" (לא ניתנת לעריכה) והקרדיט (אפשר לשנות את הניסוח, לא למחוק)
      '<p class="bd-priv">המידע הוכן על ידי אדם פרטי · לא פרסום רשמי · לפני הנסיעה בדקו במוקד</p>' +
      (M.credit ? '<p' + bdK('credit', 'bd-cr') + '>' + (M.creditTxt === BD_CR ? 'הוכן בכלי ״מצגת לשינוי בקו״ של הקו הבוחן · <span class="ltr">kavbochan.app</span>' : E(M.creditTxt)) + '</p>' : '') + '</div>';
  }
  function bdTable(M, rows) {
    var nw = M.cols.filter(function (c) { return c.wk; }).length, two = nw > 1, rs = two ? ' rowspan="2"' : '';
    var th = function (c) { return '<th' + (two && !c.wk ? rs : '') + '><span' + bdK('th:' + c.days.join('')) + '>' + E(c.label) + '</span></th>'; };
    var head = '<tr><th' + rs + '><span' + bdK('th:line') + '>' + E(M.th.line) + '</span></th><th' + rs + '><span' + bdK('th:orig') + '>' + E(M.th.orig) + '</span></th>' +
      (two ? '<th colspan="' + nw + '" class="wkh"><span' + bdK('th:wk') + '>' + E(M.th.wk) + '</span></th>' + M.cols.filter(function (c) { return !c.wk; }).map(th).join('') + '</tr><tr class="wk2">' + M.cols.filter(function (c) { return c.wk; }).map(th).join('')
        : M.cols.map(th).join('')) + '</tr>';
    return '<table class="bd-t">' + bdColgroup(M) + '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }
  function bdSlideHtml(M, form, sc, body, ops, pgi, rows) {
    return '<div class="s-cur s-bd f-' + form + (D.ED.bdense ? ' dense' : '') + '" style="--bd:' + sc + '">' + bdHead(M, form) + '<div class="cu-body">' + body + '</div>' + bdFoot(M, ops, pgi, rows) + '</div>';
  }
  /* מדידה: כל השורות בעמוד אחד מחוץ למסך — הגובה של כל שורה והמקום שיש לטבלה */
  function bdMeasure(M, form, sc, items) {
    var host = document.createElement('div');
    host.className = 'deck'; host.setAttribute('data-form', form); host.setAttribute('data-look', D.ED.look || 'kav');
    host.style.cssText = 'position:absolute;left:-40000px;top:0;visibility:hidden;width:' + FORMS[form].w + 'px;' + lookVars(D.ED.look, M.pages);
    host.innerHTML = '<div class="sframe"><div class="slide">' + bdSlideHtml(M, form, sc, bdTable(M, items.map(function (x) { return x.html; }).join(''))) + '</div></div>';
    document.body.appendChild(host);
    var body = host.querySelector('.cu-body'), th = host.querySelector('thead'), trs = host.querySelectorAll('tbody > tr');
    var avail = body.clientHeight - th.offsetHeight - 4, hs = Array.prototype.map.call(trs, function (t) { return t.getBoundingClientRect().height; });
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
    return { avail: avail, hs: hs, al: al };
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
      if (b.off) (offs[prevKey] = offs[prevKey] || []).push(bandIt); else { items.push(bandIt); prevKey = items.length - 1; }
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
    ms.hs = ms.hs.map(function (h, i) { return h + (items[i] && items[i].r && ms.al.h[items[i].r.key] || 0); });
    items.forEach(function (it, i) {
      var h = ms.hs[i] || 0;
      var ab = it.r && ms.al.h[it.r.key] && !alOn ? ms.al.base : 0;
      // כדי לא לבזבז נייר: פס (או כותרת פרק) מתחיל גם בתחתית העמוד, אם נכנסת אחריו לפחות השורה הראשונה; פס ארוך — ממשיך
      // בעמוד הבא עם "(המשך)", וגם הכיוונים של קו אחד יכולים להתחלק בין עמודים. רק שורה אחת (קו וכיוון) לא נחתכת אף פעם
      var bandNeed = function (j) { return (ms.hs[j] || 0) + (items[j + 1] && items[j + 1].r ? ms.hs[j + 1] || 0 : 0); };
      var need = (it.sec ? h + (items[i + 1] && items[i + 1].band ? bandNeed(i + 1) : 0) : it.band ? bandNeed(i) : h) + ab;
      if (cur.length && used + need > H) {
        pgs.push(cur); cur = []; used = 0; alOn = false; ab = it.r && ms.al.h[it.r.key] ? ms.al.base : 0;
        if (!it.band && !it.sec) { var bi = items.indexOf(items.filter(function (x) { return x.band === it.b; })[0]); cur.push({ cont: it.b }); used += ms.hs[bi]; }
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
      if (it.cont) return bdBandHtml(it.cont, M.cols.length, true);
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
    var out = best.pg.map(function (its, i) {
      var ops = opsOf(its.filter(function (it) { return it.r && !it.r.off; }).map(function (it) { return it.r.p; }));
      return { id: (form === 'deck' ? '' : form === 'sign' ? 'sg-' : 'st-') + 'bd' + i, label: 'לוח לפי יעד' + (n > 1 ? ' (' + (i + 1) + '/' + n + ')' : ''),
        html: bdSlideHtml(M, form, best.sc, bdTable(M, bdPageHtml(M, its)), ops, i, its.filter(function (it) { return it.r; }).map(function (it) { return it.r; })) };
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
        var x = { dir: String(d.dir || d.rd || ''), od: d.od || p.od, f: s0.name || '', fc: s0.code || '', cs: cs, t: streetOf(lastStop(d)), ag: d.ag, days: [], mk: [], same: [] };
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
        return { days: ds, label: kk === '0,1,2,3,4' ? 'ימים א׳–ה׳' : kk === '5' ? 'יום שישי' : kk === '6' ? 'מוצ״ש' : ds.length === 1 ? 'יום ' + dShort(ds) : dShort(ds) };
      });
      if (!old) (D.ED.hol || []).forEach(function (h) { if (all.some(function (r) { return r.d.hx && r.d.hx[h[0]]; })) cols.push({ days: [isoDow(h[0])], hol: h, label: h[2] + ' ' + LC.dm(h[0]) }); });
      var cell = function (r, c) {
        if (c.hol && r.d.hx && r.d.hx[c.hol[0]]) return { ents: r.d.hx[c.hol[0]].map(function (m) { return { t: hm2(m), n: 1 }; }), notes: [] };
        var d = day(r, c.days[0]);
        if (d.same) return { ents: [], notes: [], txt: 'ללא שינוי' };
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
        return { label: g.label, color: MT_COL[g.c % MT_COL.length], rows: g.rows.map(function (r) {
          var o = r.d.od || [], to = o[1] && o[1] !== o[0] ? o[1] : streetOf(lastStop(r.d)), s0 = first(r.d);
          return { p: r.p, off: false, line: r.p.line, op: r.p.op, origin: mtFrom(r.d), toward: to ? 'לכיוון ' + to : '',
            comment: (to ? 'לכיוון ' + to + ': ' : '') + (s0.name || '') + ' (' + [s0.code, s0.city].filter(Boolean).join(' | ') + ')',
            cells: cols.map(function (c) { return cell(r, c); }) };
        }) };
      });
      var when = ps.map(start).sort()[0] || '', ops = opsOf(ps);
      var title = (old ? 'לו״ז עד ' + (when ? LC.dmy(LC.addDays(when, -1)) : 'השינוי') : 'לו״ז חדש') + ' · ' + linesTxt(ps);
      var sub = old ? 'לוח הזמנים הקודם — לפני השינוי' : when ? 'בתוקף מ-' + LC.dmy(when) : '';
      return { title: title, sub: sub, subDflt: null, cols: cols, bands: bands, pages: ps, credit: D.ED.credit !== false,
        note: old ? 'באדום — נסיעה שמתבטלת או שהשעה שלה משתנה' : ps.some(function (p) { return p.kind === 'timetable'; }) ? 'בירוק — נסיעה חדשה או בשעה חדשה' : '',
        legend: 'השעות הן שעות היציאה מהתחנה הראשונה · ×2 — שני אוטובוסים · לפי נתוני משרד התחבורה · לא פרסום רשמי',
        contacts: ops.map(function (o) { return [o, bdPhone(o)]; }).filter(function (x) { return x[1]; }).concat([['משרד התחבורה', MOT]]),
        feed: ps.map(function (p) { return p.feed; }).filter(Boolean).sort().pop() || '', when: when, tord: D.ED.tord || 'rtl' };
    } finally { D.ED = keep; }
  }

  // לקבצים האחרים של המצגת, ולדף (LCDeck)
  D.bdSlides = bdSlides; D.chgBoardBuild = chgBoardBuild;
  LCDeck.boardFit = function () { return BOARD_FIT; }; LCDeck.chgBoardModel = chgBoardModel; LCDeck.boardModel = boardModel; LCDeck.chgModel = chgModel;
  LCDeck._test.bdWkSplit = bdWkSplit;
})(LCDeck._in);
