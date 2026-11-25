/* הגדרות המצגת בלשונית שבצד: סוג השינוי, לוח הזמנים, הצורה, העיצוב, השמירה של העריכות
   חלק מ-app.js (מצגת לשינוי בקו): נטען לפני app.js, ו-app.js מריץ אותו במקום שבו הקוד היה. השמות של app.js — דרך A
   (A.edits, A.render...). מה שהחלק מחזיר — פונקציות ש-app.js והחלקים האחרים קוראים להן. */
(window.LCAppParts = window.LCAppParts || {})["settings"] = function (A) {
  /* שינוי קטן — עמוד אחד; שינוי גדול — מצגת מלאה. אפשר להחליף לכל קו */
  function drawKinds(pages) {
    A.$('kinds').innerHTML = pages.filter(function (p) { return !p.kind; }).map(function (p) {
      var info = LCDeck.smallInfo(p), m = A.edits.modes[p.id], one = m ? m === 'one' : info.small;
      return '<div class="kind"><span class="badge">' + A.E(p.line) + '</span><span class="kt"><b>' + (info.small ? 'שינוי קטן' : 'שינוי גדול') + '</b> — ' +
        (one ? 'עמוד אחד' : 'מצגת מלאה') + (m ? ' (לפי הבחירה שלכם)' : '') + '</span>' +
        '<button type="button" class="lnk" data-kind="' + A.E(p.id) + '" data-to="' + (one ? 'full' : 'one') + '">' + (one ? 'להפוך למצגת מלאה' : 'לעמוד אחד') + '</button></div>';
    }).join('');
  }
  A.$('kinds').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-kind]'); if (!b) return;
    var id = b.getAttribute('data-kind'), to = b.getAttribute('data-to');
    var p = A.curPages.filter(function (x) { return x.id === id; })[0];
    if (p && (to === 'one') === LCDeck.smallInfo(p).small) delete A.edits.modes[id]; else A.edits.modes[id] = to;
    saveEdits(); A.render(A.curPages);
  });
  function frameOf(id) { return A.$('deck').querySelector('.sframe[data-id="' + CSS.escape(id) + '"]'); }

  /* לוח הזמנים (קו חדש ושינוי בלו"ז): כללי / מפורט, טבלה / טקסט — נשמר עם המצגת, כמו העיצוב */
  // לו"ז עדכני — ברירת המחדל: מפורט (כל השעות); הודעה על שינוי — כללי
  function ttOpts() { var t = A.edits.tt || {}, v = t.v || (A.curPages && A.curPages.length && A.curPages.every(function (p) { return p.kind === 'current'; }) ? 'det' : 'gen'); return { v: v === 'det' || v === 'board' ? v : 'gen', f: t.f === 'text' ? 'text' : 'table' }; }
  /* "איך להציג את לוח הזמנים" — כרטיס אחד (edits.tv), בשני המצבים:
     board — לוח מודעות (ברירת המחדל) · sum — תקציר (edits.tall — "להציג את כל השעות") · sep — טבלה לכל קו · comb — טבלה משולבת.
     מהכרטיס נגזרות ההגדרות שהבונה קורא (edits.ttc בלו"ז עדכני, edits.tt ו-edits.ttper בהודעה על שינוי) — וההורדה לפי אותו כרטיס.
     עריכות שנשמרו לפני הכרטיסים (ttc / tt.v / ttper) — מתורגמות לכרטיס המתאים */
  var TVS = ['board', 'sum', 'sep', 'comb'];
  function isCu(pages) { return !!(pages && pages.length && pages.every(function (p) { return p.kind === 'current'; })); }
  function tvOld(cu) {
    var v = A.edits.tt && A.edits.tt.v;
    if (cu) {
      if (A.edits.ttc === 'board') return 'board';
      if (A.edits.ttc === 'sep') { if (v === 'gen') return 'sum'; return 'sep'; }
      if (v === 'gen') return 'sum';
      return v === 'det' ? 'comb' : '';
    }
    if (v === 'board') return 'board';
    if (v === 'gen') return 'sum';
    if (v === 'det') { if (A.edits.ttper === false) return 'comb'; A.edits.tall = true; return 'sum'; }
    return '';
  }
  function syncTv(pages) {
    var cu = isCu(pages);
    if (TVS.indexOf(A.edits.tv) < 0) A.edits.tv = tvOld(cu) || 'board';
    var tv = A.edits.tv === 'comb' && !LCDeck.combOk(pages) ? 'board' : A.edits.tv, det = tv === 'sep' || tv === 'comb' || (tv === 'sum' && A.edits.tall === true);
    if (cu) { A.edits.ttc = tv === 'board' ? 'board' : tv === 'comb' ? undefined : 'sep'; A.edits.tt = { v: det ? 'det' : 'gen', f: 'table' }; A.edits.ttper = undefined; }
    else { A.edits.ttc = undefined; A.edits.tt = { v: tv === 'board' ? 'board' : det ? 'det' : 'gen', f: 'table' }; A.edits.ttper = tv === 'comb' ? false : tv === 'sep' ? true : undefined; }
    return tv;
  }
  /* מפות מקורבות לתחנות — רק כשיש במצגת קו חדש או מבוטל. בלי בחירה: קו חדש — כן, קו מבוטל — לא (כמו ב-LCDeck) */
  function zmUi(pages) {
    var nk = pages.filter(function (p) { return p.kind === 'new' || p.kind === 'ended'; });
    A.$('zmgrp').hidden = !nk.length;
    var v = A.edits.zm || (nk.some(function (p) { return p.kind === 'new'; }) ? 'yes' : 'no');
    A.$('zmgrp').querySelectorAll('[data-zm]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-zm') === v ? 'true' : 'false'); });
  }
  /* שלט ארוך (הרבה קווים): הודעה, וכפתור לגרסה המלאה / המקוצרת (edits.a4full) */
  function a4Ui(form) {
    var si = form === 'sign' && LCDeck.signInfo(), el = A.$('a4note');
    if (!si || si.full <= si.short && !si.limited && A.edits.a4full !== true) { el.hidden = true; return; }
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
  A.$('a4note').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-a4]'); if (!b) return;
    A.edits.a4full = b.getAttribute('data-a4') === 'full'; saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
  });
  /* צבעי המסלול במפת השינוי — רק כשיש במצגת שינוי מסלול (לא קו חדש / מבוטל / לו"ז) */
  function rcUi(pages) {
    // רק כשיש במצגת קו שהדרך שלו משתנה (לא רק תחנה שנוספה או בוטלה)
    A.$('rcgrp').hidden = !pages.some(function (p) { return !p.kind && (p.tot && (p.tot.geo || p.tot.ext) || (p.dirs || []).some(function (d) { return d.geo || d.ext; })); });
    var v = A.edits.rc === 'all' ? 'all' : 'chg';
    A.$('rcgrp').querySelectorAll('[data-rc]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-rc') === v ? 'true' : 'false'); });
  }
  A.$('rcgrp').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-rc]'); if (!b) return;
    A.edits.rc = b.getAttribute('data-rc'); saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
  });
  A.$('zmgrp').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-zm]'); if (!b) return;
    A.edits.zm = b.getAttribute('data-zm'); saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
  });
  function fnUi() {
    var el = A.$('fname');
    el.placeholder = A.pdfName(true).replace(/\.pdf$/, '');
    if (document.activeElement !== el) el.value = A.edits.fname || '';
  }
  A.$('fname').addEventListener('input', function () { A.edits.fname = this.value.trim() ? this.value : undefined; saveEdits(); });
  function ttUi(pages) {
    // הכרטיסים מופיעים בכל מצגת עם לוח זמנים: לו"ז עדכני, שינוי בלו"ז (גם שינוי קטן של נסיעה אחת) וקו חדש
    var cu = isCu(pages), tv = syncTv(pages), hasTt = cu || pages.some(LCDeck.ttCap);
    A.$('ttgrp').hidden = !hasTt;
    ['xl', 'xl2'].forEach(function (id) { A.$(id).hidden = !hasTt; });
    if (!hasTt) return;
    var cok = LCDeck.combOk(pages), bd = tv === 'board';
    A.$('tvbsub').textContent = cu ? 'שורה לכל קו, עמודה לכל יום' : 'שורה לכל קו, עמודה לכל יום. מה שמשתנה מסומן בצבע';
    var cb = A.$('tvcards').querySelector('[data-tv="comb"]');
    cb.disabled = !cok;
    A.$('tvcsub').textContent = cok ? 'כל השעות לאותו יעד יחד' : 'כל השעות לאותו יעד יחד. מופיע כשיש כמה קווים לאותו יעד';
    A.$('tvcards').querySelectorAll('[data-tv]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-tv') === tv ? 'true' : 'false'); });
    A.$('tallw').hidden = tv !== 'sum';
    A.$('tall').checked = A.edits.tall === true;
    A.$('bdopts').hidden = !bd;
    // סדר השעות — בכל תצוגה עם רשימות שעות (לא בתקציר בלי "כל השעות")
    A.$('ttow').hidden = tv === 'sum' && A.edits.tall !== true;
    A.$('ttoseg').querySelectorAll('[data-tto]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-tto') === A.tordOf() ? 'true' : 'false'); });
    if (!bd) enM = null;
    if (bd) {
      var M = cu ? LCDeck.boardModel(pages, A.edOpts(formOf())) : LCDeck.chgBoardModel(pages, A.edOpts(formOf()));
      A.$('bdtitle').placeholder = M.dflt;
      // לוח באנגלית — כותרת והערות משלו (btitleEn / bnoteEn), כדי שהעברית לא תיכנס ללוח באנגלית ולהפך
      var en = A.blangOf() === 'en', tk = en ? 'btitleEn' : 'btitle', nk = en ? 'bnoteEn' : 'bnote';
      if (document.activeElement !== A.$('bdtitle')) A.$('bdtitle').value = (en ? 'en|title' : 'title') in A.edits.bd.t ? '' : A.edits[tk] || M.dflt;
      if (document.activeElement !== A.$('bdnote')) A.$('bdnote').value = A.edits[nk] || '';
      A.$('bdnote').placeholder = A.edits[nk] ? '' : M.note;
      // "להכניס ל-N עמודים" — רק בשלט A4; צפיפות ופיצול ימי חול — בכל הצורות
      A.$('bpgw').hidden = formOf() !== 'sign';
      var bpg = String(+A.edits.bpages || 0), fit = LCDeck.boardFit && LCDeck.boardFit();
      A.$('bpgseg').querySelectorAll('[data-bpg]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bpg') === bpg ? 'true' : 'false'); });
      A.$('bdneed').hidden = !(fit && fit.need);
      if (fit && fit.need) A.$('bdneed').textContent = 'גם באותיות הקטנות ביותר שעוד אפשר לקרוא, הלוח לא נכנס — צריך לפחות ' + fit.need + ' עמודים.';
      A.$('bdnseg').querySelectorAll('[data-bdn]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bdn') === (A.edits.bdense ? '1' : '0') ? 'true' : 'false'); });
      A.$('bspseg').querySelectorAll('[data-bsp]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bsp') === (A.edits.bsplit === false ? 'no' : 'auto') ? 'true' : 'false'); });
      // שם המפעיל, תאריך סיום, ×2, קווים עם אות (רק כשיש בלוח מק"ט עם מספר אחר לכל כיוון), ובחירת תאריכים
      [['bopseg', 'data-bopn', A.edits.bop === false ? '0' : '1'], ['bendseg', 'data-bend', A.edits.bend === false ? '0' : '1'], ['bx2seg', 'data-bx2', A.edits.bx2 === false ? '0' : '1'], ['bltrseg', 'data-bltr', A.edits.bltr ? '1' : '0']].forEach(function (x) {
        A.$(x[0]).querySelectorAll('[' + x[1] + ']').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute(x[1]) === x[2] ? 'true' : 'false'); });
      });
      enM = M;
      A.$('bltrw').hidden = !(A.edits.bltr || pages.some(function (p) { return (p.dirs || []).some(function (d) { return d.l && d.l !== p.line; }); }));
      daysUi(pages);
      colsUi(M);
      var bst = A.edits.bstop === 'dir' || A.edits.bstop === 'none' ? A.edits.bstop : 'all';
      A.$('bstseg').querySelectorAll('[data-bst]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bst') === bst ? 'true' : 'false'); });
      A.$('btalseg').querySelectorAll('[data-btal]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-btal') === (A.edits.btal === 'c' ? 'c' : 'r') ? 'true' : 'false'); });
      A.$('bt1w').hidden = !(A.slides.filter(function (x) { return /(^|-)bd\d/.test(x.id); }).length > 1 || A.edits.bt1);
      A.$('bt1seg').querySelectorAll('[data-bt1]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bt1') === (A.edits.bt1 ? '1' : '0') ? 'true' : 'false'); });
      var bc = A.edits.bclr || {}, bck = Object.keys(A.BCLR).filter(function (k) { return A.BCLR[k] && A.BCLR[k][0] === bc.h && A.BCLR[k][1] === bc.c; })[0] || (A.edits.bclr ? '' : 'dflt');
      A.$('bclrseg').querySelectorAll('[data-bclr]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bclr') === bck ? 'true' : 'false'); });
      [['bclrh', bc.h || '#1f2937'], ['bclrhf', bc.hf || (bc.h ? LCDeck.boardInk(bc.h) : '#ffffff')], ['bclrc', bc.c || '#ffffff'], ['bclrcf', bc.cf || (bc.c ? LCDeck.boardInk(bc.c) : '#111111')]]
        .forEach(function (x) { if (document.activeElement !== A.$(x[0])) A.$(x[0]).value = x[1]; });
      var bord = M.ord || A.edits.bord || 'type', keys = M.keys || [];
      // סדר הקווים — רק כשיש בלוח יותר מקו אחד
      var tc = M.tcount || {};
      A.$('bordw').hidden = (tc.u || 0) + (tc.i || 0) + (tc.r || 0) < 2;
      A.$('borseg').querySelectorAll('[data-bor]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bor') === bord ? 'true' : 'false'); });
      A.$('bmanh').hidden = bord !== 'man';
      // מיון בשתי רמות: "קודם לפי" ו"ואז לפי" (גם האפשרויות המוכנות מוצגות כך); ידני — בלי
      A.$('bkw').hidden = bord === 'man';
      if (bord !== 'man') {
        var KN = [['type', 'סוג קו'], ['op', 'מפעיל'], ['dest', 'יעד'], ['num', 'מספר קו'], ['add', 'הסדר שהוספתם']];
        A.$('bk1').innerHTML = KN.map(function (k) { return '<option value="' + k[0] + '"' + (keys[0] === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('');
        A.$('bk2').innerHTML = '<option value="">—</option>' + KN.filter(function (k) { return k[0] !== keys[0]; }).map(function (k) { return '<option value="' + k[0] + '"' + (keys[1] === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('');
      }
      // לפי סוג קו: רשימה קטנה — עירוני / בין-עירוני / אזורי, בסדר שנבחר, עם ↑↓ ו"להציג". רק הסוגים שיש להם קווים בלוח,
      // ורק כשיש לפחות שניים (או סוג שהוסתר — כדי שאפשר יהיה להחזיר אותו). הסדר השמור של כל הסוגים (edits.btypes) לא משתנה
      var TN = { u: 'עירוני', i: 'בין-עירוני', r: 'אזורי' }, hide = A.edits.bthide || {};
      var ty = (M.types || ['u', 'i', 'r']).filter(function (t) { return (M.tcount || {})[t]; });
      A.$('btyw').hidden = keys.indexOf('type') < 0 || (ty.length < 2 && !ty.some(function (t) { return hide[t]; }));
      if (!A.$('btyw').hidden) {
        A.$('btyl').innerHTML = ty.map(function (t, i) {
          var n = (M.tcount || {})[t] || 0;
          return '<li data-bty="' + t + '"><button type="button" class="mv" data-bty-mv="-1" aria-label="להעביר את ' + TN[t] + ' למעלה"' + (i ? '' : ' disabled') + '>↑</button>' +
            '<button type="button" class="mv" data-bty-mv="1" aria-label="להעביר את ' + TN[t] + ' למטה"' + (i < ty.length - 1 ? '' : ' disabled') + '>↓</button>' +
            '<b>' + TN[t] + '</b><small>' + (n === 1 ? 'קו אחד' : n + ' קווים') + '</small>' +
            '<label><input type="checkbox" data-bty-show' + (hide[t] ? '' : ' checked') + '> להציג</label></li>';
        }).join('');
      }
      // לפי מפעיל: המפעילים שבלוח, בסדר שנבחר, עם ↑↓
      var ol = M.opList || [];
      A.$('bopw').hidden = keys.indexOf('op') < 0 || ol.length < 2;
      if (!A.$('bopw').hidden) A.$('bopl').innerHTML = ol.map(function (o, i) {
        return '<li data-bop="' + A.E(o.k) + '"><button type="button" class="mv" data-bop-mv="-1" aria-label="להעביר את ' + A.E(o.name) + ' למעלה"' + (i ? '' : ' disabled') + '>↑</button>' +
          '<button type="button" class="mv" data-bop-mv="1" aria-label="להעביר את ' + A.E(o.name) + ' למטה"' + (i < ol.length - 1 ? '' : ' disabled') + '>↓</button>' +
          '<b>' + A.E(o.name) + '</b><small>' + (o.n === 1 ? 'קו אחד' : o.n + ' קווים') + '</small></li>';
      }).join('');
      A.$('bflat').checked = !!A.edits.bflat;
      // "בלי פסי יעד" — רק כשיש יותר מפס אחד לאותו סוג (כשזה מסומן — תמיד, כדי שאפשר יהיה לבטל)
      A.$('bflatw').hidden = !A.edits.bflat && !M.flatFx;
      A.$('bcwseg').querySelectorAll('[data-bcw]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bcw') === (A.edits.bcw ? 'man' : 'auto') ? 'true' : 'false'); });
    }
  }
  /* בחירת תאריכים (edits.bdays — {off: {תאריך: 1}, sep: {תאריך: 1}}): לוח שנה קטן של השבועיים שבנתונים, והצעות (חג, חנוכה, לו"ז חריג).
     בהודעה על שינוי אין לו"ז לכל תאריך — רק ההצעות לחגים (hx) */
  var DOW_L = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'], bsug = [];
  function daysUi(pages) {
    var ed = A.edOpts(formOf()), ds = LCDeck.boardDates(pages, ed);
    bsug = LCDeck.boardSuggest(pages, ed);
    var sel = A.edits.bdays || {}, any = Object.keys(sel.off || {}).length || Object.keys(sel.sep || {}).length;
    A.$('bdaysw').hidden = !ds.length && !bsug.length && !any;
    // סגור עד שלוחצים; על הכותרת — כמה הצעות יש
    A.$('bdhint').textContent = bsug.length ? 'יש הצעות לימים מיוחדים (' + bsug.length + ')' : any ? 'יש בחירה' : '';
    A.$('bsug').innerHTML = bsug.map(function (g, i) { return '<button type="button" data-bsg="' + i + '"><b>הצעה:</b>' + A.E(g.txt) + '</button>'; }).join('');
    A.$('bdgw').hidden = !ds.length;
    A.$('bdreset').hidden = !any;
    if (!ds.length) return;
    var html = DOW_L.map(function (l) { return '<span class="bdh">' + l + '</span>'; }).join('');
    for (var i = 0; i < ds[0].w; i++) html += '<span></span>';
    html += ds.map(function (x) {
      var p = x.iso.split('-'), dmT = +p[2] + '.' + +p[1];
      return '<span class="bdc"><button type="button" class="bdd' + (x.used ? ' used' : '') + (x.na ? ' na' : '') + (x.diff ? ' dif' : '') + '" data-bdd="' + x.iso + '" aria-pressed="' + (x.off ? 'false' : 'true') + '"' + (x.na ? ' disabled' : '') +
        ' aria-label="' + A.E(LC.wd(x.iso) + ' ' + dmT + (x.hol ? ', ' + x.hol : '') + (x.off ? ', לא בלוח' : x.used ? ', הלוח לפי התאריך הזה' : '') + (x.diff ? ', השעות שונות' : '')) + '">' + dmT + (x.hol ? '<small>' + A.E(x.hol) + '</small>' : '') + '</button>' +
        '<button type="button" class="bds" data-bds="' + x.iso + '" aria-pressed="' + (x.sep ? 'true' : 'false') + '"' + (x.na || x.off ? ' disabled' : '') + ' aria-label="עמודה נפרדת ל-' + dmT + '">נפרד</button></span>';
    }).join('');
    A.$('bdg').innerHTML = html;
  }
  /* סדר העמודות (edits.bcols — מזהי העמודות, LCDeck.boardColId): רשימה עם ↑↓, למעלה — הראשונה בלוח. עמודות "יום חול" מפוצלות —
     פריט אחד. "סדר מקורי" — רק כשהסדר שונה מהרגיל (לעמודה שזזה יש _i) */
  var colIds = [];
  function colsUi(M) {
    var us = [], lb = {}, sub = {};
    M.cols.forEach(function (c) {
      var id = LCDeck.boardColId(c);
      if (!lb[id]) { us.push(id); lb[id] = c.wk ? M.th.wk : c.label; sub[id] = []; }
      if (c.wk) sub[id].push(c.label);
    });
    colIds = us;
    A.$('bcolw').hidden = us.length < 2;
    A.$('bcolreset').hidden = !M.cols.some(function (c) { return c._i != null; });
    A.$('bcoll').innerHTML = us.length < 2 ? '' : us.map(function (id, i) {
      var t = (lb[id] || '').trim() || id, nm = A.E(t);
      return '<li data-bcol="' + A.E(id) + '"><button type="button" class="mv" data-bcol-mv="-1" aria-label="להקדים את העמודה ' + nm + '"' + (i ? '' : ' disabled') + '>↑</button>' +
        '<button type="button" class="mv" data-bcol-mv="1" aria-label="לאחר את העמודה ' + nm + '"' + (i < us.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<b>' + nm + '</b>' + (sub[id].length ? '<small>' + A.E(sub[id].join(' · ')) + '</small>' : '') + '</li>';
    }).join('');
  }
  /* לוח באנגלית: שמות שאין להם תרגום (M.miss) — מופיעים בעברית. רשימה מעל הלוח עם שדה לשם באנגלית (edits.ben),
     ולפני הורדה, הדפסה או אקסל — אזהרה שצריך לאשר (A.enGate) */
  var enMiss = [], enAck = '', enPend = null, enM = null;
  /* כל השמות בלי תרגום במה שנבנה עכשיו: הלוח (M.miss), השקפים (deck-en-a/b/c) והתוויות במפות — בלי כפילויות */
  function enAll() {
    if (A.blangOf() !== 'en') return null;
    var X = window.LCDeckEN || {}, all = {};
    [].concat(enM && enM.miss || [], X.a_miss ? X.a_miss() : [], X.b_missing ? X.b_missing() : [], Object.keys(X.c_miss || {}))
      .forEach(function (k) { if (k) all[k] = 1; });
    return { en: true, miss: Object.keys(all) };
  }
  /* שפת המצגת — בכל התצוגות; והרשימה של השמות בלי תרגום (אחרי כל בנייה, ואחרי שמפה נבנתה) */
  A.enRefresh = function () {
    A.$('blangseg').querySelectorAll('[data-blang]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-blang') === (A.blangOf() === 'en' ? 'en' : 'he') ? 'true' : 'false'); });
    enUi(enAll());
  };
  A.$('blangseg').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-blang]'); if (!b) return;
    A.edits.blang = b.getAttribute('data-blang') === 'en' ? 'en' : 'he'; enAck = '';   // בחירה מפורשת — גם עברית (לא נדרסת בממשק באנגלית)
    saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
  });
  function enUi(M) {
    var el = A.$('ennote'), on = !!(M && M.en);
    enMiss = on ? (M.miss || []).slice().sort() : [];
    var ben = A.edits.ben || {}, man = Object.keys(ben).filter(function (k) { return ben[k]; });
    // שמות שהוקלדו — נשארים ברשימה (כדי שאפשר לתקן), אחרי השמות שעוד חסרים
    var list = enMiss.concat(on ? man.filter(function (k) { return enMiss.indexOf(k) < 0; }).sort() : []);
    el.hidden = !list.length;
    el.classList.toggle('pend', !!enPend);
    if (!list.length) { el.innerHTML = ''; return; }
    var focus = document.activeElement && document.activeElement.closest && document.activeElement.closest('#ennote') ? document.activeElement.getAttribute('data-en') : null;
    el.innerHTML = '<b>' + (enMiss.length ? (enMiss.length === 1 ? 'שם אחד בלי תרגום לאנגלית — יופיע בעברית.' : enMiss.length + ' שמות בלי תרגום לאנגלית — יופיעו בעברית.') : 'כל השמות מתורגמים.') + '</b> ' +
      'אפשר לכתוב כאן את השם באנגלית (לא חובה).' +
      '<ul>' + list.map(function (k) { return '<li><span>' + A.E(k) + '</span><input type="text" lang="en" dir="ltr" data-en="' + A.E(k) + '" value="' + A.E(ben[k] || '') + '" placeholder="English name" aria-label="השם באנגלית: ' + A.E(k) + '"></li>'; }).join('') + '</ul>' +
      (enPend ? '<div class="enact"><button type="button" class="btn2" data-enok="1">להמשיך — השמות יופיעו בעברית</button><button type="button" class="lnk" data-enok="0">ביטול</button></div>' : '');
    if (focus) { var f = el.querySelector('[data-en="' + CSS.escape(focus) + '"]'); if (f) { f.focus(); var v = f.value; f.setSelectionRange(v.length, v.length); } }
  }
  var enT = 0;
  A.$('ennote').addEventListener('input', function (ev) {
    var i = ev.target.closest('[data-en]'); if (!i) return;
    var b = Object.assign({}, A.edits.ben || {}), k = i.getAttribute('data-en'), v = i.value.trim();
    if (v) b[k] = v; else delete b[k];
    A.edits.ben = Object.keys(b).length ? b : undefined;
    saveEdits(); clearTimeout(enT); enT = setTimeout(function () { A.keepScroll(function () { A.render(A.curPages); }); }, 600);
  });
  A.$('ennote').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-enok]'); if (!b) return;
    var fn = enPend; enPend = null;
    if (b.getAttribute('data-enok') === '1') { enAck = enMiss.join('|'); A.$('ennote').classList.remove('pend'); enUi({ en: true, miss: enMiss }); if (fn) fn(); }
    else enUi({ en: true, miss: enMiss });
  });
  /* לפני הורדה / הדפסה / אקסל: בלוח באנגלית עם שמות בלי תרגום — קודם אזהרה, וההורדה רק אחרי "להמשיך" (פעם אחת לאותה רשימה) */
  A.enGate = function (fn) {
    if (A.blangOf() === 'en') enUi(enAll());   // גם שמות מהמפות שנבנו בינתיים
    if (A.blangOf() !== 'en' || !enMiss.length || enAck === enMiss.join('|')) return true;
    enPend = fn; enUi({ en: true, miss: enMiss });
    A.$('ennote').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  };
  function setDay(kind, iso, on) {
    var s = A.edits.bdays || {}, o = Object.assign({}, s[kind] || {});
    if (on) o[iso] = 1; else delete o[iso];
    var n = { off: s.off, sep: s.sep }; n[kind] = Object.keys(o).length ? o : undefined;
    A.edits.bdays = n.off || n.sep ? n : undefined;
  }
  /* הכותרת וההערות של "טבלה לפי יעד" — נשמרות עם המצגת; הלוח נבנה מחדש אחרי הפסקה קצרה בהקלדה */
  var bdT = 0;
  ['bdtitle', 'bdnote'].forEach(function (id) {
    A.$(id).addEventListener('input', function () {
      var v = this.value;
      var en = A.blangOf() === 'en';
      if (id === 'bdtitle') A.edits[en ? 'btitleEn' : 'btitle'] = v.trim() && v.trim() !== this.placeholder ? v : undefined; else A.edits[en ? 'bnoteEn' : 'bnote'] = v.trim() ? v : undefined;
      delete A.edits.bd.t[(en ? 'en|' : '') + (id === 'bdtitle' ? 'title' : 'note')];
      saveEdits(); clearTimeout(bdT); bdT = setTimeout(function () { A.keepScroll(function () { A.render(A.curPages); }); }, 450);
    });
  });
  A.$('btyl').addEventListener('change', function (ev) {
    var c = ev.target.closest('[data-bty-show]'); if (!c) return;
    var t = c.closest('[data-bty]').getAttribute('data-bty'), h = Object.assign({}, A.edits.bthide || {});
    if (c.checked) delete h[t]; else h[t] = 1;
    A.edits.bthide = Object.keys(h).length ? h : undefined;
    saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
  });
  // "קודם לפי" / "ואז לפי": הסדר עובר לצירוף שנבחר (האפשרות המוכנה שמתאימה לו — מסומנת)
  ['bk1', 'bk2'].forEach(function (id) {
    A.$(id).addEventListener('change', function () {
      var k = [A.$('bk1').value, A.$('bk2').value].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
      A.edits.bk = k; A.edits.bord = 'key';
      saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
    });
  });
  A.$('bflat').addEventListener('change', function () { A.edits.bflat = this.checked || undefined; saveEdits(); A.keepScroll(function () { A.render(A.curPages); }); });
  A.$('tall').addEventListener('change', function () { A.edits.tall = this.checked || undefined; saveEdits(); A.keepScroll(function () { A.render(A.curPages); }); });
  A.$('ttgrp').addEventListener('click', function (ev) {
    var to = ev.target.closest('[data-tto]');
    if (to) { A.edits.tord = to.getAttribute('data-tto'); saveEdits(); A.keepScroll(function () { A.render(A.curPages); }); return; }
    // סדר הסוגים (לפי סוג קו): ↑↓ ו"להציג"
    var tm = ev.target.closest('[data-bty-mv]');
    if (tm) {
      var ty = (A.edits.btypes || []).filter(function (t) { return 'uir'.indexOf(t) >= 0; });
      'uir'.split('').forEach(function (t) { if (ty.indexOf(t) < 0) ty.push(t); });
      // מחליפים עם הסוג הסמוך ברשימה שמוצגת (סוג בלי קווים לא מוצג — נשאר במקומו)
      var vis = Array.prototype.map.call(A.$('btyl').querySelectorAll('[data-bty]'), function (li) { return li.getAttribute('data-bty'); });
      var t0 = tm.closest('[data-bty]').getAttribute('data-bty'), t1 = vis[vis.indexOf(t0) + +tm.getAttribute('data-bty-mv')];
      if (!t1) return;
      var i0 = ty.indexOf(t0), j0 = ty.indexOf(t1);
      ty[i0] = t1; ty[j0] = t0; A.edits.btypes = ty;
      saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
      setTimeout(function () { var f = A.$('btyl').querySelector('[data-bty="' + t0 + '"] [data-bty-mv="' + tm.getAttribute('data-bty-mv') + '"]'); if (f && !f.disabled) f.focus(); }, 0);
      return;
    }
    // סדר המפעילים: ↑↓
    var om = ev.target.closest('[data-bop-mv]');
    if (om) {
      var ops = Array.prototype.map.call(A.$('bopl').querySelectorAll('[data-bop]'), function (li) { return li.getAttribute('data-bop'); });
      var o0 = om.closest('[data-bop]').getAttribute('data-bop'), i1 = ops.indexOf(o0), j1 = i1 + +om.getAttribute('data-bop-mv');
      if (j1 < 0 || j1 >= ops.length) return;
      ops[i1] = ops[j1]; ops[j1] = o0; A.edits.bops = ops;
      saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
      setTimeout(function () { var f = A.$('bopl').querySelector('[data-bop="' + CSS.escape(o0) + '"] [data-bop-mv="' + om.getAttribute('data-bop-mv') + '"]'); if (f && !f.disabled) f.focus(); }, 0);
      return;
    }
    // רוחב עמודות: אוטומטי (מוחק את הרוחב הידני) / ידני (מתחיל מהרוחב שעל המסך, ועוברים לעריכה כדי לגרור)
    var cw = ev.target.closest('[data-bcw]');
    if (cw) {
      if (cw.getAttribute('data-bcw') === 'auto') A.edits.bcw = undefined;
      else if (!A.edits.bcw) { A.edits.bcw = A.bdColsNow() || undefined; if (!A.editMode) setEdit(true); }
      saveEdits(); A.keepScroll(function () { A.render(A.curPages); }); return;
    }
    // סדר העמודות: ↑↓ ו"סדר מקורי"
    var cm = ev.target.closest('[data-bcol-mv],#bcolreset');
    if (cm) {
      if (cm.id === 'bcolreset') A.edits.bcols = undefined;
      else {
        var cs = colIds.slice(), c0 = cm.closest('[data-bcol]').getAttribute('data-bcol'), i2 = cs.indexOf(c0), j2 = i2 + +cm.getAttribute('data-bcol-mv');
        if (i2 < 0 || j2 < 0 || j2 >= cs.length) return;
        cs[i2] = cs[j2]; cs[j2] = c0; A.edits.bcols = cs;
      }
      saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
      if (cm.id === 'bcolreset') setTimeout(function () { var f = A.$('bcoll').querySelector('.mv:not(:disabled)'); if (f) f.focus(); }, 0);
      else setTimeout(function () { var f = A.$('bcoll').querySelector('[data-bcol="' + CSS.escape(c0) + '"] [data-bcol-mv="' + cm.getAttribute('data-bcol-mv') + '"]'); if (f && !f.disabled) f.focus(); }, 0);
      return;
    }
    // בחירת תאריכים: תאריך (בלוח / לא), "נפרד", הצעה, וביטול
    var dd = ev.target.closest('[data-bdd],[data-bds],[data-bsg],#bdreset');
    if (dd) {
      if (dd.id === 'bdreset') A.edits.bdays = undefined;
      else if (dd.hasAttribute('data-bdd')) { var iso = dd.getAttribute('data-bdd'), off = (A.edits.bdays || {}).off || {}; setDay('off', iso, !off[iso]); if (!off[iso]) setDay('sep', iso, false); }
      else if (dd.hasAttribute('data-bds')) { var iso2 = dd.getAttribute('data-bds'); setDay('sep', iso2, !((A.edits.bdays || {}).sep || {})[iso2]); }
      else { var g = bsug[+dd.getAttribute('data-bsg')]; if (!g) return; g.off.forEach(function (x) { setDay('off', x, true); setDay('sep', x, false); }); g.sep.forEach(function (x) { setDay('sep', x, true); setDay('off', x, false); }); }
      saveEdits(); A.keepScroll(function () { A.render(A.curPages); }); return;
    }
    var bo = ev.target.closest('[data-bpg],[data-bdn],[data-bsp],[data-bor],[data-bsub],[data-bst],[data-btal],[data-bt1],[data-bclr],[data-bopn],[data-bend],[data-bx2],[data-bltr]');
    if (bo) {
      if (bo.hasAttribute('data-bor')) {
        var nb = bo.getAttribute('data-bor');
        // ידני — מתחיל מהסדר שרואים עכשיו, כדי ששום דבר לא יקפוץ
        if (nb === 'man' && (A.edits.bord || 'type') !== 'man') A.edits.bman = A.bdOrderNow().reduce(function (a, b) { return a.concat(b.mks); }, []);
        A.edits.bord = nb === 'type' ? undefined : nb; A.edits.bk = undefined;
      }
      else if (bo.hasAttribute('data-bsub')) A.edits.bsub = bo.getAttribute('data-bsub') === 'num' ? 'num' : undefined;
      else if (bo.hasAttribute('data-bpg')) A.edits.bpages = +bo.getAttribute('data-bpg') || undefined;
      else if (bo.hasAttribute('data-bdn')) A.edits.bdense = bo.getAttribute('data-bdn') === '1' || undefined;
      // מתחת למוצא: הכל (ברירת המחדל) / רק הכיוון / כלום
      else if (bo.hasAttribute('data-btal')) A.edits.btal = bo.getAttribute('data-btal') === 'c' ? 'c' : undefined;
      else if (bo.hasAttribute('data-bt1')) A.edits.bt1 = bo.getAttribute('data-bt1') === '1' || undefined;
      else if (bo.hasAttribute('data-bclr')) { var pr = A.BCLR[bo.getAttribute('data-bclr')]; A.edits.bclr = pr ? { h: pr[0], c: pr[1] } : undefined; }
      else if (bo.hasAttribute('data-bst')) { var sv = bo.getAttribute('data-bst'); A.edits.bstop = sv === 'dir' || sv === 'none' ? sv : undefined; }
      else if (bo.hasAttribute('data-bopn')) A.edits.bop = bo.getAttribute('data-bopn') === '0' ? false : undefined;
      else if (bo.hasAttribute('data-bend')) A.edits.bend = bo.getAttribute('data-bend') === '0' ? false : undefined;
      else if (bo.hasAttribute('data-bx2')) A.edits.bx2 = bo.getAttribute('data-bx2') === '0' ? false : undefined;
      else if (bo.hasAttribute('data-bltr')) A.edits.bltr = bo.getAttribute('data-bltr') === '1' || undefined;
      else A.edits.bsplit = bo.getAttribute('data-bsp') === 'no' ? false : undefined;
      saveEdits(); A.keepScroll(function () { A.render(A.curPages); }); return;
    }
    var c = ev.target.closest('[data-tv]');
    if (!c || c.disabled) return;
    A.edits.tv = c.getAttribute('data-tv'); saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
  });

  /* צבעי הלוח: ערכות מוכנות [רקע הכותרות, רקע השעות] (צבע הטקסט נבחר לבד — שחור או לבן), או צבעים שבוחרים */
  A.BCLR = { dflt: null, blue: ['#0b3a7a', '#eef4fb'], green: ['#14532d', '#eefaf2'], gray: ['#374151', '#f3f4f6'], yellow: ['#f2c200', '#fffbea'] };
  // ארבעה צבעים לבחירה חופשית: רקע וטקסט של הכותרות, רקע וטקסט של השעות (שמואל 22.11: "הבן אדם יחליט")
  [['bclrh', 'h'], ['bclrhf', 'hf'], ['bclrc', 'c'], ['bclrcf', 'cf']].forEach(function (x) {
    var el = A.$(x[0]); if (!el) return;
    el.addEventListener('input', function () {
      var c = Object.assign({}, A.edits.bclr || { h: '#1f2937', c: '#ffffff' }); c[x[1]] = el.value; A.edits.bclr = c;
      saveEdits(); clearTimeout(el._t); el._t = setTimeout(function () { A.keepScroll(function () { A.render(A.curPages); }); }, 250);
    });
  });
  /* צורה: מצגת (16:9) · שלט להדפסה (A4 לאורך) · סטטוס (9:16). נשמרת עם המצגת, כמו העיצוב */
  var FORM_TXT = {
    deck: { one: 'שקף אחד', many: ' שקפים', dl: 'הורדת PDF', hint: 'קובץ PDF, שקף בכל עמוד.', credit: 'להוסיף קרדיט לקו הבוחן בסוף המצגת' },
    sign: { one: 'עמוד אחד', many: ' עמודים', dl: 'הורדת PDF', hint: 'קובץ PDF בגודל A4 לאורך, שלט בכל עמוד — להדפסה ולתלייה.', credit: 'להוסיף קרדיט לקו הבוחן בתחתית השלט' },
    status: { one: 'תמונה אחת', many: ' תמונות', dl: 'הורדת תמונות', dl1: 'הורדת תמונה', hint: 'תמונה (PNG) בגודל של סטטוס בווטסאפ, לכל שינוי.', credit: 'להוסיף את הכתובת של הקו הבוחן לתמונה' }
  };
  function formOf() { var f = A.edits.form; return FORM_TXT[f] ? f : 'deck'; }
  function dims() { return LCDeck.FORMS[formOf()]; }
  function dlText() { var t = FORM_TXT[formOf()]; return t.dl1 && slidesOn() === 1 ? t.dl1 : t.dl; }
  function slidesOn() { return A.slides.filter(function (s) { return !A.edits.off[s.id]; }).length; }
  function formUi(form) {
    var t = FORM_TXT[form], d = LCDeck.FORMS[form];
    A.$('forms').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-form') === form ? 'true' : 'false'); });
    A.$('kindgrp').style.display = form === 'deck' && A.curPages.some(function (p) { return !p.kind; }) ? '' : 'none';
    A.$('dlhint').textContent = t.hint;
    A.$('creditlbl').textContent = t.credit;
    document.querySelectorAll('.printwrap,.dock .printbtn').forEach(function (x) { x.style.display = form === 'status' ? 'none' : ''; });
    if (!A.busy) [A.$('dl'), A.$('dl2')].forEach(function (b) { b.querySelector('span').textContent = t.dl; });
    document.querySelectorAll('.pngs').forEach(function (x) { if (x.getAttribute('data-form') !== form) { x.hidden = true; x.innerHTML = ''; } });
    // גודל העמוד בהדפסה רגילה
    var st = A.$('pagesz') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagesz' }));
    st.textContent = form === 'deck' ? '' : '@page{size:' + d.w + 'px ' + d.h + 'px;margin:0}';
  }
  A.$('forms').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-form]'); if (!b) return;
    A.edits.form = b.getAttribute('data-form'); if (A.edits.form === 'deck') delete A.edits.form;
    saveEdits(); A.render(A.curPages);
  });

  /* עיר למצגת של כמה קווים: העיר שמשותפת לכל הקווים */
  function deckCity(pages) {
    if (pages.length < 2) return '';
    var lists = pages.map(function (p) { var l = A.lineOf(p.makat, p.op); return (p.chcities && p.chcities.length ? p.chcities : []).concat(l ? l.cities : []); });
    var common = lists[0].filter(function (c) { return lists.every(function (x) { return x.indexOf(c) >= 0; }); });
    return common[0] || '';
  }

  A.$('toggles').addEventListener('change', function (ev) {
    A.edits.off[ev.target.value] = !ev.target.checked;
    if (!A.edits.off[ev.target.value]) delete A.edits.off[ev.target.value];
    saveEdits(); A.render(A.curPages);
  });

  function number() {
    var vis = Array.prototype.filter.call(document.querySelectorAll('.sitem'), function (f) { return !f.classList.contains('off'); });
    vis.forEach(function (f, i) { f.classList.toggle('lastvis', i === vis.length - 1); f.querySelectorAll('.pg').forEach(function (p) {
      var k = p.getAttribute('data-bk');   // מספר העמוד בלוח — אפשר לערוך (טקסט שנערך נשאר, "" — בלי מספר)
      p.textContent = k && A.edits.bd.t[k] != null ? A.edits.bd.t[k] : (i + 1) + ' / ' + vis.length;
    }); });
    var ft = FORM_TXT[formOf()];
    A.$('pcount').textContent = vis.length === 1 ? ft.one : vis.length + ft.many;
    if (!A.busy) [A.$('dl'), A.$('dl2')].forEach(function (b) { b.querySelector('span').textContent = dlText(); });
    A.$('tgcount').textContent = '(' + vis.length + ' מתוך ' + A.slides.length + ')';
  }

  /* ---------- עריכה במקום ---------- */
  function loadEdits(sig) {
    try { return A.normEdits(JSON.parse(localStorage.getItem('lc-ed2:' + sig) || 'null')); } catch (x) { return A.normEdits(null); }
  }
  var saveT = 0;
  function saveEdits() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { try { localStorage.setItem('lc-ed2:' + A.edSig, JSON.stringify(A.edits)); } catch (x) {} }, 250);
  }
  function setEdit(on) {
    A.editMode = on;
    document.body.classList.toggle('editing', on);
    ['editbtn', 'editbtn2'].forEach(function (id) {
      var b = A.$(id); if (!b) return;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('span').textContent = on ? 'סיום העריכה' : 'עריכת הטקסט';
    });
    A.$('deck').querySelectorAll('.edt,.tbox-t,.bdt').forEach(function (el) {
      if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); } else el.removeAttribute('contenteditable');
    });
    A.$('deck').querySelectorAll('.ibox').forEach(function (el) { if (on) el.setAttribute('tabindex', '0'); else el.removeAttribute('tabindex'); });
    A.$('deck').querySelectorAll('.sitem.off').forEach(function (it) { it.hidden = !on; });
    A.maps.forEach(function (m) { A.mapEdit(m, on); });
    if (!on) A.hideBar();
    A.bdColUi();
  }
  ['editbtn', 'editbtn2'].forEach(function (id) {
    A.$(id).addEventListener('click', function () {
      setEdit(!A.editMode);
      // "טבלה לפי יעד": במצב עריכה יש מקום לשורות שהוסרו (עם "להחזיר"); בלי עריכה — העמודים מלאים
      if (A.$('deck').querySelector('.s-bd')) A.keepScroll(function () { A.render(A.curPages); });
      if (A.editMode && id === 'editbtn2') { var f = A.$('deck'); f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
  return { drawKinds: drawKinds, frameOf: frameOf, ttOpts: ttOpts, isCu: isCu, syncTv: syncTv, zmUi: zmUi, a4Ui: a4Ui, rcUi: rcUi, fnUi: fnUi, ttUi: ttUi, formOf: formOf, dims: dims, dlText: dlText, formUi: formUi, deckCity: deckCity, number: number, loadEdits: loadEdits, saveEdits: saveEdits, setEdit: setEdit };
};
