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
    if (bd) {
      var M = cu ? LCDeck.boardModel(pages, A.edOpts(formOf())) : LCDeck.chgBoardModel(pages, A.edOpts(formOf()));
      A.$('bdtitle').placeholder = M.dflt;
      if (document.activeElement !== A.$('bdtitle')) A.$('bdtitle').value = 'title' in A.edits.bd.t ? '' : A.edits.btitle || M.dflt;
      if (document.activeElement !== A.$('bdnote')) A.$('bdnote').value = A.edits.bnote || '';
      A.$('bdnote').placeholder = A.edits.bnote ? '' : M.note;
      // "להכניס ל-N עמודים" — רק בשלט A4; צפיפות ופיצול ימי חול — בכל הצורות
      A.$('bpgw').hidden = formOf() !== 'sign';
      var bpg = String(+A.edits.bpages || 0), fit = LCDeck.boardFit && LCDeck.boardFit();
      A.$('bpgseg').querySelectorAll('[data-bpg]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bpg') === bpg ? 'true' : 'false'); });
      A.$('bdneed').hidden = !(fit && fit.need);
      if (fit && fit.need) A.$('bdneed').textContent = 'גם באותיות הקטנות ביותר שעוד אפשר לקרוא, הלוח לא נכנס — צריך לפחות ' + fit.need + ' עמודים.';
      A.$('bdnseg').querySelectorAll('[data-bdn]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bdn') === (A.edits.bdense ? '1' : '0') ? 'true' : 'false'); });
      A.$('bspseg').querySelectorAll('[data-bsp]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bsp') === (A.edits.bsplit === false ? 'no' : 'auto') ? 'true' : 'false'); });
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
      // לפי סוג קו: רשימה קטנה — עירוני / בין-עירוני / אזורי, בסדר שנבחר, עם ↑↓ ו"להציג"; סוג בלי קווים — אפור
      A.$('btyw').hidden = keys.indexOf('type') < 0;
      if (keys.indexOf('type') >= 0) {
        var TN = { u: 'עירוני', i: 'בין-עירוני', r: 'אזורי' }, hide = A.edits.bthide || {}, ty = M.types || ['u', 'i', 'r'];
        A.$('btyl').innerHTML = ty.map(function (t, i) {
          var n = (M.tcount || {})[t] || 0;
          return '<li data-bty="' + t + '"' + (n ? '' : ' class="empty"') + '><button type="button" class="mv" data-bty-mv="-1" aria-label="להעביר את ' + TN[t] + ' למעלה"' + (i ? '' : ' disabled') + '>↑</button>' +
            '<button type="button" class="mv" data-bty-mv="1" aria-label="להעביר את ' + TN[t] + ' למטה"' + (i < ty.length - 1 ? '' : ' disabled') + '>↓</button>' +
            '<b>' + TN[t] + '</b><small>' + (n === 1 ? 'קו אחד' : n ? n + ' קווים' : 'אין קווים') + '</small>' +
            '<label><input type="checkbox" data-bty-show' + (hide[t] ? '' : ' checked') + (n ? '' : ' disabled') + '> להציג</label></li>';
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
      A.$('bcwseg').querySelectorAll('[data-bcw]').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-bcw') === (A.edits.bcw ? 'man' : 'auto') ? 'true' : 'false'); });
    }
  }
  /* הכותרת וההערות של "טבלה לפי יעד" — נשמרות עם המצגת; הלוח נבנה מחדש אחרי הפסקה קצרה בהקלדה */
  var bdT = 0;
  ['bdtitle', 'bdnote'].forEach(function (id) {
    A.$(id).addEventListener('input', function () {
      var v = this.value;
      if (id === 'bdtitle') A.edits.btitle = v.trim() && v.trim() !== this.placeholder ? v : undefined; else A.edits.bnote = v.trim() ? v : undefined;
      delete A.edits.bd.t[id === 'bdtitle' ? 'title' : 'note'];
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
      var t0 = tm.closest('[data-bty]').getAttribute('data-bty'), i0 = ty.indexOf(t0), j0 = i0 + +tm.getAttribute('data-bty-mv');
      if (j0 < 0 || j0 >= ty.length) return;
      ty[i0] = ty[j0]; ty[j0] = t0; A.edits.btypes = ty;
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
    var bo = ev.target.closest('[data-bpg],[data-bdn],[data-bsp],[data-bor],[data-bsub],[data-bst],[data-btal],[data-bt1],[data-bclr]');
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
