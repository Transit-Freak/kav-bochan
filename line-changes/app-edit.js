/* מצב עריכה: מפת ההתמצאות, סרגל העריכה, בחירה בלוח זמני הנסיעות (שורה, קו, פס, תא), רוחב העמודות ושחזור
   חלק מ-app.js (מצגת לשינוי בקו): נטען לפני app.js, ו-app.js מריץ אותו במקום שבו הקוד היה. השמות של app.js — דרך A
   (A.edits, A.render...). מה שהחלק מחזיר — פונקציות ש-app.js והחלקים האחרים קוראים להן. */
(window.LCAppParts = window.LCAppParts || {})["edit"] = function (A) {
  /* מפת ההתמצאות: במצב עריכה גוררים אותה (עכבר או מגע) לכל מקום בתוך המפה (לא על הקרדיט של OpenStreetMap למטה) — נשמר לכל שקף באחוזים מגודל המפה
     (edits.inset), גם להדפסה ול-PDF; ✕ מסתיר ומחזיר (edits.hide). "שחזור הכול" — חזרה לפינה האוטומטית */
  A.$('deck').addEventListener('pointerdown', function (ev) {
    var ins = ev.target.closest('.inset'); if (!ins || !A.editMode || ev.target.closest('.inset-x') || ev.button > 0) return;
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
      A.edits.inset[sid] = { x: +(ins.offsetLeft / W * 100).toFixed(2), y: +(ins.offsetTop / H * 100).toFixed(2) };
      ins.setAttribute('data-fx', A.edits.inset[sid].x); ins.setAttribute('data-fy', A.edits.inset[sid].y);
      A.saveEdits();
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  A.$('deck').addEventListener('click', function (ev) {
    var b = ev.target.closest('.inset-x'); if (!b || !A.editMode) return;
    ev.preventDefault();
    var ins = b.closest('.inset'), id = ins.getAttribute('data-ins');
    if (A.edits.hide[id]) delete A.edits.hide[id]; else A.edits.hide[id] = 1;
    ins.classList.toggle('inoff', !!A.edits.hide[id]);
    A.saveEdits();
  });
  // סימן (מספר, נקודה, צבע במקרא): במצב עריכה לחיצה מסתירה אותו, ולחיצה נוספת מחזירה
  A.$('deck').addEventListener('click', function (ev) {
    var m = ev.target.closest('.emark'); if (!m || !A.editMode) return;
    ev.preventDefault();
    var id = m.getAttribute('data-mk'); A.edits.hide = A.edits.hide || {};
    if (A.edits.hide[id]) delete A.edits.hide[id]; else A.edits.hide[id] = 1;
    m.classList.toggle('mkoff', !!A.edits.hide[id]);
    A.saveEdits();
  });
  // סרגל קטן ליד הטקסט שעורכים
  var bar = document.createElement('div');
  bar.id = 'etb'; bar.className = 'etb noprint'; bar.hidden = true;
  bar.innerHTML = '<button type="button" data-t="del">מחיקה</button><button type="button" data-t="add">+ שורה אחרי</button><button type="button" data-t="reset">שחזור</button>' +
    '<button type="button" data-t="mvup" class="mvb">העברה למעלה ↑</button><button type="button" data-t="mvdn" class="mvb">העברה למטה ↓</button>' +
    '<button type="button" data-t="al-r" class="bal" title="יישור לימין" aria-label="יישור לימין">⇥ ימין</button><button type="button" data-t="al-c" class="bal" title="יישור למרכז" aria-label="יישור למרכז">↔ מרכז</button><button type="button" data-t="al-l" class="bal" title="יישור לשמאל" aria-label="יישור לשמאל">⇤ שמאל</button><button type="button" data-t="cellclr" class="rowdel">ריקון התא</button><button type="button" data-t="rowadd" class="rowdel">הוספת שורה מתחת</button><button type="button" data-t="pgbrk" class="rowdel">מעבר לעמוד הבא</button>' +
    // הכותרת וכותרות העמודות (כמו בוורד, שמואל 22.11): יישור, "רק בעמוד הראשון", רקע וצבע טקסט
    '<button type="button" data-t="hal-r" class="bhd hal">⇥ ימין</button><button type="button" data-t="hal-c" class="bhd hal">↔ מרכז</button><button type="button" data-t="hal-l" class="bhd hal">⇤ שמאל</button>' +
    '<button type="button" data-t="h1st" class="bhd">רק בעמוד הראשון</button>' +
    '<label class="bclrb bhd bth">רקע הכותרות <input type="color" data-c="hbg"></label><label class="bclrb bhd bth">טקסט הכותרות <input type="color" data-c="hfg"></label>' +
    // צבעי כל הלוח (במקום הלשונית שבצד, שמואל 22.11): ערכה מוכנה, ורקע וטקסט של כל השעות
    '<label class="bclrb bhd">ערכת צבעים <select data-c="preset"><option value="">—</option><option value="dflt">לפי העיצוב</option><option value="blue">כחול</option><option value="green">ירוק</option><option value="gray">אפור</option><option value="yellow">צהוב</option></select></label>' +
    '<label class="bclrb bhd">רקע השעות <input type="color" data-c="call"></label><label class="bclrb bhd">טקסט השעות <input type="color" data-c="cfall"></label>' +
    // שורה ותא בשעות: רקע לשורה, רקע לתא, ובלי רקע
    '<label class="bclrb brow">רקע לשורה <input type="color" data-c="rbg"></label><label class="bclrb bcell">רקע לתא <input type="color" data-c="cbg"></label><button type="button" data-t="bgx" class="brow">בלי רקע</button><button type="button" data-t="rowdel" class="rowdel">מחיקת השורה</button><button type="button" data-t="linedel" class="rowdel">מחיקת הקו</button>';
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
    // הכותרת (title / sub) וכותרות העמודות (th:...) — יישור, עמוד ראשון וצבעים; שורה ותא — רקע
    var bk = isBd ? el.getAttribute('data-bk') || '' : '', isHead = bk === 'title' || bk === 'sub' || bk === 'wsub', isTh = /^th:/.test(bk);
    bar.querySelectorAll('.bhd').forEach(function (b) { b.hidden = !isHead && !(isTh && b.classList.contains('bth')); });
    if (isHead) { var al0 = A.edits.btal === 'c' || A.edits.btal === 'l' ? A.edits.btal : 'r';
      bar.querySelectorAll('.hal').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-t') === 'hal-' + al0 ? 'true' : 'false'); });
      var bc0 = A.edits.bclr || {}; bar.querySelector('[data-c="preset"]').value = '';
      bar.querySelector('[data-c="call"]').value = bc0.c || '#ffffff'; bar.querySelector('[data-c="cfall"]').value = bc0.cf || (bc0.c ? LCDeck.boardInk(bc0.c) : '#111111');
      var multi = A.slides.filter(function (x) { return /(^|-)bd\d/.test(x.id); }).length > 1;
      bar.querySelector('[data-t="h1st"]').hidden = !multi && !A.edits.bt1; bar.querySelector('[data-t="h1st"]').textContent = A.edits.bt1 ? 'כותרת בכל עמוד' : 'רק בעמוד הראשון'; }
    if (isHead || isTh) { var hc = A.edits.bclr || {}; bar.querySelector('[data-c="hbg"]').value = hc.h || '#1f2937'; bar.querySelector('[data-c="hfg"]').value = hc.hf || (hc.h ? LCDeck.boardInk(hc.h) : '#ffffff'); }
    var rowOn = !!(bdSel && !bdSel.band);
    bar.querySelectorAll('.brow').forEach(function (b) { b.hidden = !rowOn; });
    bar.querySelectorAll('.bcell').forEach(function (b) { b.hidden = !(rowOn && bdSel.cell && !bdSel.line); });
    if (rowOn) { var g = (A.edits.bd && A.edits.bd.bg) || {}; bar.querySelector('[data-c="rbg"]').value = g[bdSel.line ? 'l:' + bdSel.mk : 'r:' + bdSel.rk] || '#ffffff';
      if (bdSel.cell) bar.querySelector('[data-c="cbg"]').value = g[bdSel.cell[0]] || '#ffffff';
      bar.querySelector('[data-t="bgx"]').hidden = !Object.keys(g).some(function (k) { return k === 'r:' + bdSel.rk || k === 'l:' + bdSel.mk || (bdSel.cell && k === bdSel.cell[0]); }); }
    // מעבר עמוד ידני (שמואל 22.11): פס, קו או שורה מתחילים בעמוד חדש; לחיצה נוספת מבטלת
    var bk0 = bdSel && bdBrkKey(bdSel), pb = bar.querySelector('[data-t="pgbrk"]');
    pb.hidden = !bk0;
    if (bk0) pb.textContent = (A.edits.bbrk || []).indexOf(bk0) >= 0 ? 'ביטול המעבר לעמוד הבא' : 'מעבר לעמוד הבא';
    // ריקון התא: כל הטקסט בתא שנבחר (השעות של יום אחד והערה שמתחתן, או כל המוצא) — לא תופס מקום; לחיצה נוספת מחזירה
    var cc = bdSel && !bdSel.band && !bdSel.line && bdSel.cell;
    bar.querySelector('[data-t="cellclr"]').hidden = !cc;
    if (cc) bar.querySelector('[data-t="cellclr"]').textContent = bdCellEmpty(bdSel.cell) ? 'שחזור התא' : 'ריקון התא';
    // יישור הטקסט בתא שנבחר — ימין / מרכז / שמאל, כמו בוורד (שלמה 22.11); הכפתור של היישור שנבחר מסומן
    var alNow = cc ? (A.edits.bd.al || {})[bdSel.cell[0]] : null;
    bar.querySelectorAll('.bal').forEach(function (b) { b.hidden = !cc; b.setAttribute('aria-pressed', alNow && b.getAttribute('data-t') === 'al-' + alNow ? 'true' : 'false'); });
    if (bdSel && el.closest('.slide')) r = bdSelRect(el.closest('.slide')) || r;
    bar.hidden = false;
    var top = r.top - bar.offsetHeight - 6;
    if (top < 60 && r.bottom + 6 + bar.offsetHeight < window.innerHeight) top = r.bottom + 6;
    bar.style.top = Math.max(8, top) + 'px';
    bar.style.left = Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, r.left + r.width / 2 - bar.offsetWidth / 2)) + 'px';
  }
  function hideBar() { bar.hidden = true; curEl = null; bdSelect(null); }
  /* מעבר עמוד ידני בלוח (ED.bbrk): 'b:<פס>' · 'l:<מק"ט>' (הקו כולו) · 'r:<שורה>' — מתחילים בעמוד חדש */
  function bdBrkKey(sel) { return sel.band ? 'b:' + sel.band : sel.line ? 'l:' + sel.mk : sel.rk ? 'r:' + sel.rk : null; }
  function bdBrkToggle() {
    var k = bdSel && bdBrkKey(bdSel); if (!k) return;
    var a = (A.edits.bbrk || []).slice(), i = a.indexOf(k);
    if (i >= 0) a.splice(i, 1); else a.push(k);
    A.edits.bbrk = a.length ? a : undefined;
    A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); });
  }
  /* "טבלה לפי יעד" במצב עריכה: לחיצה על תא בוחרת את השורה שלו (על תא מספר הקו — את כל השורות של הקו),
     והסרגל מציע "מחיקת השורה" / "מחיקת הקו". Delete במקלדת (כשלא עורכים טקסט) מוחק את מה שנבחר */
  var bdSel = null;
  function bdSelect(sel) {
    bdSel = sel;
    A.$('deck').querySelectorAll('.s-bd tr.bsel').forEach(function (t) { t.classList.remove('bsel'); });
    if (sel) A.$('deck').querySelectorAll(sel.band ? '.s-bd tr.bband[data-bkey="' + CSS.escape(sel.band) + '"]' : sel.line ? '.s-bd tr.br[data-mk="' + CSS.escape(sel.mk) + '"]' : '.s-bd tr.br[data-rk="' + CSS.escape(sel.rk) + '"]').forEach(function (t) { t.classList.add('bsel'); });
  }
  /* המפתחות (data-bk) של התא: תא שעות — השעות וההערה שמתחת להן; המוצא — המוצא, התחנה ו"לכיוון" */
  function bdCellKeys(tr, td) {
    if (!td || !tr) return null;
    var rk = tr.getAttribute('data-rk');
    if (td.classList.contains('bo')) return [rk + '|o', rk + '|s', rk + '|w'];
    if (!td.classList.contains('bt')) return null;
    var t = td.querySelector('[data-bk*="|c"]'), k = t && t.getAttribute('data-bk');
    return k ? [k, k.replace(/\|c(\d+)$/, '|n$1')] : null;
  }
  function bdCellEmpty(keys) { return keys.every(function (k) { return A.edits.bd.t[k] === ''; }); }
  function bdCellClear() {
    if (!bdSel || !bdSel.cell) return;
    var ks = bdSel.cell, empty = bdCellEmpty(ks);
    ks.forEach(function (k) { if (empty) delete A.edits.bd.t[k]; else A.edits.bd.t[k] = ''; });
    A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); });
  }
  /* סדר ידני בלוח: הפסים והקווים בסדר שרואים עכשיו — [{k: מפתח הפס, bk: המפתח שלו לקיבוץ, mks: [מק"טים], nat: {מק"ט: הפס המקורי},
     segs: [{k, mks, mv, lk}] — החלקים שהפס מוצג בהם: קווים שהועברו אליו מיעד אחר מוצגים בפס משלהם (mv), באותו מקום}] */
  function bdOrderNow() {
    var o = A.edOpts(A.formOf()), M = A.isCu(A.curPages) ? LCDeck.boardModel(A.curPages, o) : LCDeck.chgBoardModel(A.curPages, o), out = [];
    M.bands.forEach(function (b) {
      var mks = [], nat = {}, hk = b.host || b.k, last = out[out.length - 1];
      b.rows.forEach(function (r) { if (!r.add && r.p && r.p.makat && mks.indexOf(r.p.makat) < 0) { mks.push(r.p.makat); nat[r.p.makat] = r.p._nbk; } });
      var sg = { k: b.k, mks: mks, mv: !!b.mvs, lk: b.lk || b.k };
      if (b.host && last && last.k === hk) { last.mks = last.mks.concat(mks); Object.assign(last.nat, nat); last.segs.push(sg); return; }
      out.push({ k: hk, bk: b.bk, mks: mks.slice(), nat: nat, segs: [sg] });
    });
    return out;
  }
  /* רוחב עמודות בלוח: העמודות (הקו, המוצא והימים) של טבלה בסדר שלהן — לפי תאי הכותרת (מימין לשמאל), ברוחב של השקף (בלי הקטנה) */
  function bdColRects(tb) {
    var sl = tb.closest('.slide'), sr = sl.getBoundingClientRect(), k = sr.width / sl.offsetWidth || 1;
    var ths = Array.prototype.filter.call(tb.querySelectorAll('thead th'), function (th) { return !th.classList.contains('wkh'); }).map(function (th) {
      var r = th.getBoundingClientRect(); return { l: (r.left - sr.left) / k, r: (r.right - sr.left) / k };
    }).sort(function (a, b) { return b.r - a.r; });
    var tr = tb.getBoundingClientRect(), hr = tb.querySelector('thead').getBoundingClientRect();
    return { k: k, cols: ths, top: (tr.top - sr.top) / k, h: tr.height / k, hh: hr.height / k, tw: tr.width / k };
  }
  /* הרוחב שעל המסך, כחלקים (ED.bcw): המוצא ('o') וכל עמודת ימים (לפי data-ck), מהרוחב שאחרי עמודת הקו */
  function bdColsNow(tb) {   // tb — הטבלה שגררו בה (כשיש שני לוחות — עד השינוי ומהשינוי); בלי — הראשונה
    tb = tb || A.$('deck').querySelector('.sitem:not(.off) .s-bd table.bd-t'); if (!tb) return null;
    var g = bdColRects(tb), cks = Array.prototype.map.call(tb.querySelectorAll('col[data-ck]'), function (c) { return c.getAttribute('data-ck'); });
    if (g.cols.length !== cks.length + 2) return null;
    var w = g.cols.map(function (c) { return c.r - c.l; }), av = g.tw - w[0], o = { o: +(w[1] / av).toFixed(4) };
    cks.forEach(function (ck, i) { o[ck] = +(w[i + 2] / av).toFixed(4); });
    return o;
  }
  /* במצב עריכה: ידית על כל גבול בין עמודות (המוצא|יום, יום|יום) — גוררים, והרוחב משתנה בכל העמודים של הלוח (בשלט, במצגת,
     בסטטוס ובאקסל — כחלק מהרוחב). בסוף הגרירה — נשמר (ED.bcw), והלוח נבנה מחדש (העמודים לפי הגובה החדש) */
  function bdColUi() {
    A.$('deck').querySelectorAll('.bcw-l').forEach(function (x) { x.remove(); });
    if (!A.editMode) return;
    A.$('deck').querySelectorAll('.sitem:not(.off) .s-bd table.bd-t').forEach(function (tb) {
      var sl = tb.closest('.slide'), g = bdColRects(tb); if (g.cols.length < 3) return;
      var lay = document.createElement('div'); lay.className = 'bcw-l noprint';
      for (var i = 1; i < g.cols.length - 1; i++) {
        var x = g.cols[i].l;
        lay.insertAdjacentHTML('beforeend', '<div class="bcw-g" style="left:' + x + 'px;top:' + g.top + 'px;height:' + g.h + 'px"></div>' +
          '<div class="bcw-h" role="separator" aria-orientation="vertical" aria-label="רוחב העמודה — לגרור" data-cb="' + i + '" style="left:' + x + 'px;top:' + g.top + 'px;height:' + g.hh + 'px"></div>');
      }
      sl.appendChild(lay);
    });
  }
  var bcwDrag = null;
  A.$('deck').addEventListener('pointerdown', function (ev) {
    var h = ev.target.closest('.bcw-h'); if (!h || !A.editMode) return;
    ev.preventDefault(); ev.stopPropagation();
    var tb = h.closest('.slide').querySelector('table.bd-t'), g = bdColRects(tb), i = +h.getAttribute('data-cb');
    // הכי צר: השעה הרחבה בטבלה (עם הריווח בתא); המוצא — לא פחות מ-48
    var big = 0; tb.querySelectorAll('td.bt .t').forEach(function (t) { var w = t.getBoundingClientRect().width / g.k; if (w > big) big = w; });
    bcwDrag = { tb: tb, h: h, i: i, x0: ev.clientX, k: g.k, w: g.cols.map(function (c) { return c.r - c.l; }), tw: g.tw, d: 0, min: Math.max(28, big + 12) };
    h.classList.add('on');
    try { h.setPointerCapture(ev.pointerId); } catch (e) {}
  }, true);
  A.$('deck').addEventListener('pointermove', function (ev) {
    if (!bcwDrag) return;
    var D0 = bcwDrag, i = D0.i, dx = (ev.clientX - D0.x0) / D0.k, m0 = i === 1 ? 48 : D0.min;
    // מימין לשמאל: גרירה שמאלה מרחיבה את העמודה שמימין לגבול (i) ומצרה את זו שמשמאל לו (i+1)
    dx = Math.max(Math.min(0, -(D0.w[i + 1] - D0.min)), Math.min(Math.max(0, D0.w[i] - m0), dx));
    D0.d = dx;
    var w = D0.w.slice(); w[i] -= dx; w[i + 1] += dx;
    // תצוגה מיידית: אותו רוחב בכל הטבלאות של הלוח
    A.$('deck').querySelectorAll('.sitem:not(.off) .s-bd table.bd-t').forEach(function (tb) {
      var cs = tb.querySelectorAll('col');
      if (cs.length !== D0.w.length) return;   // הלוח השני (עד השינוי / מהשינוי) עם עמודות אחרות
      for (var j = 1; j < cs.length && j < w.length; j++) cs[j].style.width = (w[j] / D0.tw * 100).toFixed(3) + '%';
    });
    var l = D0.h.parentNode, gs = l.querySelectorAll('.bcw-g'), hs = l.querySelectorAll('.bcw-h');
    hs[i - 1].style.transform = gs[i - 1].style.transform = 'translateX(' + dx + 'px)';
  });
  function bcwEnd() {
    if (!bcwDrag) return;
    var D0 = bcwDrag; bcwDrag = null; D0.h.classList.remove('on');
    if (Math.abs(D0.d) < 1) return;
    A.edits.bcw = bdColsNow(D0.tb) || A.edits.bcw;
    A.saveEdits(); keepScroll(function () { A.render(A.curPages); });
  }
  A.$('deck').addEventListener('pointerup', bcwEnd);
  A.$('deck').addEventListener('pointercancel', bcwEnd);
  window.addEventListener('resize', function () { if (A.editMode) bdColUi(); });
  function bdWhere(bs, sel) { return LCDeck.boardWhere(bs, sel); }
  function bdCanMove(sel) {
    var bs = bdOrderNow(), w = bdWhere(bs, sel); if (!w) return null;
    // קו: גם מעבר לפס הקודם / הבא (בראש הפס או בסופו)
    // פס של קווים שהועברו — זז בין החלקים של הפס שהוא בתוכו, ומשם לפס הקודם / הבא
    if (w.l == null && w.mv) return { up: w.s > 0 || w.b > 0, dn: w.s < bs[w.b].segs.length - 1 || w.b < bs.length - 1 };
    return w.l == null ? { up: w.b > 0, dn: w.b < bs.length - 1 } : { up: w.l > 0 || w.b > 0, dn: w.l < bs[w.b].mks.length - 1 || w.b < bs.length - 1 };
  }
  /* העברה של קו או של פס שלם — והסדר עובר ל"ידני" (מהסדר שרואים עכשיו) */
  function bdMove(dir) {
    if (!bdSel) return;
    var sel = bdSel;
    // מסדר אחר — קודם עוברים ל"ידני" מהסדר שרואים עכשיו (הפסים של "ידני" — לפי יעד בלבד)
    if (A.edits.bord !== 'man') { A.edits.bman = bdOrderNow().reduce(function (a, b) { return a.concat(b.mks); }, []); A.edits.bord = 'man'; A.edits.bk = undefined; }
    // ההזזה עצמה — LCDeck.boardMove (deck-board.js): הסדר החדש של הפסים והקווים, או null כשאין מה להזיז
    var plan = LCDeck.boardMove(bdOrderNow(), sel, dir); if (!plan) return;
    var res = plan.bs, natOf = plan.natOf, mk0 = plan.mk0;
    // ED.bmb: מק"ט → הפס שאליו הועבר (בלי — כשזה הפס המקורי שלו)
    var mb = Object.assign({}, A.edits.bmb || {});
    res.forEach(function (H) { H.mks.forEach(function (m) { if (natOf[m] === H.bk) delete mb[m]; else mb[m] = H.bk; }); });
    A.edits.bmb = Object.keys(mb).length ? mb : undefined;
    A.edits.bman = res.reduce(function (a, b) { return a.concat(b.mks); }, []);
    A.edits.bord = 'man';
    A.saveEdits(); hideBar();
    keepScroll(function () { A.render(A.curPages); });
    // אותו קו / פס נשאר מסומן, עם הסרגל — כדי שאפשר להמשיך להזיז (פס — לפי הפס שבו הקו הראשון שלו נמצא עכשיו)
    setTimeout(function () {
      if (sel.band && mk0) {
        var r = A.$('deck').querySelector('.sitem:not(.off) .s-bd tr.br[data-mk="' + CSS.escape(mk0) + '"]');
        while (r && !r.classList.contains('bband')) r = r.previousElementSibling;
        if (r) sel = { band: r.getAttribute('data-bkey') };
      }
      bdSelect(sel); var tb = A.$('deck').querySelector('.s-bd tr.bsel'); if (tb) showBar(tb);
    }, 30);
  }
  function bdSelRect(slide) {
    var trs = slide.querySelectorAll('tr.bsel'); if (!trs.length) return null;
    var a = trs[0].getBoundingClientRect(), b = trs[trs.length - 1].getBoundingClientRect();
    return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), width: Math.max(a.right, b.right) - Math.min(a.left, b.left) };
  }
  /* "הוספת שורה מתחת": שורה ריקה (קו, מוצא, שעות) מתחת לשורה שנבחרה — באותו פס; כשנבחר קו שלם — מתחת לשורה האחרונה שלו */
  function bdAddRow() {
    if (!bdSel) return;
    var trs = A.$('deck').querySelectorAll('.s-bd tr.bsel'), after = trs.length ? trs[trs.length - 1].getAttribute('data-rk') : bdSel.rk;
    var id = Date.now().toString(36);
    A.edits.bd.nr.push({ id: id, after: after });
    A.saveEdits(); hideBar();
    keepScroll(function () { A.render(A.curPages); });
    setTimeout(function () { var c = A.$('deck').querySelector('.s-bd tr.br[data-rk="n' + id + '"] [data-bk="ln:n' + id + '"]'); if (c) c.focus(); }, 60);
  }
  function bdDelSel(line) {
    if (!bdSel) return;
    if (line) A.edits.bd.offL[bdSel.mk] = 1; else A.edits.bd.offR[bdSel.rk] = 1;
    A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); });
  }
  A.$('deck').addEventListener('pointerdown', function (ev) {
    if (!A.editMode) return;
    var bt = ev.target.closest('.s-bd tr.bband[data-bkey]');
    if (bt && !bt.classList.contains('boff')) { bdSelect({ band: bt.getAttribute('data-bkey') }); return; }
    var tr = ev.target.closest('.s-bd tr.br');
    if (!tr) return;
    var td = ev.target.closest('td');
    bdSelect({ rk: tr.getAttribute('data-rk'), mk: tr.getAttribute('data-mk'), line: !!(td && td.classList.contains('bl')), cell: bdCellKeys(tr, td) });
  }, true);
  A.$('deck').addEventListener('click', function (ev) {
    if (!A.editMode || !bdSel || ev.target.closest('.bdt,[data-bdx]')) return;
    var tr = ev.target.closest('.s-bd tr.br, .s-bd tr.bband[data-bkey]'); if (!tr) return;
    showBar(tr);   // לחיצה על תא בלי טקסט לעריכה — רק בחירת השורה (או הפס)
  });
  document.addEventListener('keydown', function (ev) {
    if (!A.editMode || !bdSel || bdSel.band || (ev.key !== 'Delete' && ev.key !== 'Backspace')) return;
    var a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    ev.preventDefault(); bdDelSel(bdSel.line);
  });
  A.$('deck').addEventListener('focusin', function (ev) {
    var el = ev.target.closest('.edt,.tbox-t,.bdt');
    if (el && A.editMode) { if (el.classList.contains('bdt') && !el.hasAttribute('data-o')) el.setAttribute('data-o', el.innerText); showBar(el); }
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
    if (k === 'title') return A.edits.btitle !== undefined || 'title' in A.edits.bd.t;
    if (k === 'note') return A.edits.bnote !== undefined || 'note' in A.edits.bd.t;
    return k in A.edits.bd.t;
  }
  function bdSet(k, v) {   // v === null — שחזור
    var t = A.edits.bd.t;
    if (k === 'title' || k === 'note') {
      var f = k === 'title' ? 'btitle' : 'bnote';
      delete t[k];
      if (v === null) A.edits[f] = undefined; else if (v.trim()) A.edits[f] = v.trim(); else { A.edits[f] = undefined; t[k] = ''; }
    } else if (v === null || (k === 'credit' && !v.trim())) delete t[k]; else t[k] = v.replace(/\s+$/, '');
    A.saveEdits();
  }
  A.$('deck').addEventListener('focusout', function (ev) {
    var el = ev.target;
    if (!el.classList || !el.classList.contains('bdt') || !A.editMode) return;
    var o = el.getAttribute('data-o'); el.removeAttribute('data-o');
    if (o === null || o === el.innerText) return;
    bdSet(el.getAttribute('data-bk'), el.innerText);
    setTimeout(function () { if (!bar.hidden && curEl === el) hideBar(); keepScroll(function () { A.render(A.curPages); }); }, 0);
  });
  // "להחזיר" — שורה או קו שהוסרו חוזרים ללוח
  A.$('deck').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-bdx]'); if (!b) return;
    ev.preventDefault();
    var v = b.getAttribute('data-bdx'), kind = v.charAt(0) === 'L' ? 'offL' : 'offR', k = v.slice(2);
    if (A.edits.bd[kind][k]) delete A.edits.bd[kind][k]; else A.edits.bd[kind][k] = 1;
    // מחזירים קו שלם — גם השורות שלו שהוסרו אחת-אחת
    if (kind === 'offL' && !A.edits.bd.offL[k]) Object.keys(A.edits.bd.offR).forEach(function (rk) { if (rk.split('.')[0] === k) delete A.edits.bd.offR[rk]; });
    A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); });
  });
  A.$('deck').addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.classList.contains('tbox-t')) {
      var sid = sidOf(el), id = el.getAttribute('data-boxt');
      (A.edits.boxes[sid] || []).forEach(function (b) { if (b.id === id) b.text = el.innerText; });
    } else if (el.classList.contains('edt')) {
      var eid = el.getAttribute('data-eid'), ad = splitAdd(eid);
      if (ad) { (A.edits.add[ad.base] = A.edits.add[ad.base] || [])[ad.i] = el.innerText; }
      else { A.edits.t[eid] = el.innerText; el.classList.add('edited'); }
    } else return;
    A.saveEdits();
    LCEdit.fit(el.closest('.sframe'));
    // בשלט ובסטטוס המפה ממלאת את המקום שנשאר — טקסט ארוך או קצר יותר משנה את הגודל שלה
    var fsid = sidOf(el);
    A.maps.forEach(function (m) { if (m.id === fsid && m.map) m.map.invalidateSize({ pan: false }); });
    showBar(el);
  });
  // מחקו את כל הטקסט בהקלדה: כשיוצאים מהשדה — השורה יורדת, יחד עם הסימן שלידה
  A.$('deck').addEventListener('focusout', function (ev) {
    var el = ev.target;
    if (!A.editMode || !el.classList || !el.classList.contains('edt') || el.innerText.trim()) return;
    setTimeout(function () { keepScroll(function () { A.render(A.curPages); }); }, 0);
  });
  bar.addEventListener('mousedown', function (ev) { if (!ev.target.closest('input,select')) ev.preventDefault(); });   // לא לאבד את הפוקוס בטקסט (חוץ מבוחר הצבע)
  // בוחרי הצבע בסרגל: הכותרות (ED.bclr.h / hf) או רקע לשורה / לתא (ED.bd.bg)
  bar.addEventListener('input', function (ev) {
    var inp = ev.target.closest('[data-c]'); if (!inp) return;
    var c = inp.getAttribute('data-c'), v = inp.value, sel = bdSel;
    if (c === 'preset') { var pr = A.BCLR[v]; if (v === 'dflt') A.edits.bclr = undefined; else if (pr) A.edits.bclr = { h: pr[0], c: pr[1] }; else return; }
    else if (c === 'hbg' || c === 'hfg' || c === 'call' || c === 'cfall') { var o = Object.assign({}, A.edits.bclr || {}); o[{ hbg: 'h', hfg: 'hf', call: 'c', cfall: 'cf' }[c]] = v; if (!o.h) o.h = '#1f2937'; A.edits.bclr = o; }
    else if (sel) { A.edits.bd.bg = A.edits.bd.bg || {}; var k = c === 'cbg' && sel.cell ? sel.cell[0] : sel.line ? 'l:' + sel.mk : 'r:' + sel.rk; A.edits.bd.bg[k] = v; }
    A.saveEdits(); clearTimeout(inp._t); inp._t = setTimeout(function () { keepScroll(function () { A.render(A.curPages); }); }, 250);
  });
  bar.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b || !curEl) return;
    var t = b.getAttribute('data-t'), el = curEl, sid = sidOf(el);
    if (t === 'rowdel' || t === 'linedel') { if (el.classList.contains('bdt')) el.removeAttribute('data-o'); bdDelSel(t === 'linedel'); return; }
    if (t === 'rowadd') { if (el.classList.contains('bdt')) el.removeAttribute('data-o'); bdAddRow(); return; }
    if (/^al-[rcl]$/.test(t)) {   // יישור התא: לחיצה על היישור שכבר נבחר — חזרה לברירת המחדל
      if (el.classList.contains('bdt')) { el.removeAttribute('data-o'); el.blur(); }
      if (bdSel && bdSel.cell) { var ak = bdSel.cell[0], av = t.slice(3); A.edits.bd.al = A.edits.bd.al || {}; if (A.edits.bd.al[ak] === av) delete A.edits.bd.al[ak]; else A.edits.bd.al[ak] = av; A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); }); }
      return;
    }
    if (/^hal-[rcl]$/.test(t) || t === 'h1st') { if (el.classList.contains('bdt')) { el.removeAttribute('data-o'); el.blur(); }
      if (t !== 'h1st') { var av = t.slice(4); A.edits.btal = av === 'r' ? undefined : av; } else A.edits.bt1 = A.edits.bt1 ? undefined : true;
      A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); }); return; }
    if (t === 'bgx') { if (el.classList.contains('bdt')) { el.removeAttribute('data-o'); el.blur(); }
      var g = A.edits.bd.bg || {}; if (bdSel) { delete g['r:' + bdSel.rk]; delete g['l:' + bdSel.mk]; if (bdSel.cell) delete g[bdSel.cell[0]]; }
      A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); }); return; }
    if (t === 'pgbrk') { if (el.classList.contains('bdt')) { el.removeAttribute('data-o'); el.blur(); } bdBrkToggle(); return; }
    if (t === 'cellclr') { if (el.classList.contains('bdt')) { el.removeAttribute('data-o'); el.blur(); } bdCellClear(); return; }
    if (t === 'mvup' || t === 'mvdn') { if (el.classList.contains('bdt')) { el.removeAttribute('data-o'); el.blur(); } bdMove(t === 'mvup' ? -1 : 1); return; }
    if (el.classList.contains('bdt')) {   // טקסט בלוח: מחיקה — ריק, שחזור — הטקסט מהנתונים
      el.removeAttribute('data-o');
      bdSet(el.getAttribute('data-bk'), t === 'reset' ? null : '');
      hideBar(); keepScroll(function () { A.render(A.curPages); });
      return;
    }
    if (el.classList.contains('tbox-t')) {
      if (t === 'del') { var id = el.getAttribute('data-boxt'); A.edits.boxes[sid] = (A.edits.boxes[sid] || []).filter(function (x) { return x.id !== id; }); A.saveEdits(); el.closest('.tbox').remove(); hideBar(); }
      return;
    }
    var eid = el.getAttribute('data-eid'), ad = splitAdd(eid), focusId = null;
    if (t === 'del') {
      if (ad) A.edits.add[ad.base].splice(ad.i, 1);
      else A.edits.t[eid] = null;
    } else if (t === 'add') {
      if (ad) { A.edits.add[ad.base].splice(ad.i + 1, 0, 'טקסט חדש'); focusId = ad.base + '+' + (ad.i + 1); }
      else { (A.edits.add[eid] = A.edits.add[eid] || []).unshift('טקסט חדש'); focusId = eid + '+0'; }
    } else if (t === 'reset') { delete A.edits.t[eid]; }
    A.saveEdits(); hideBar(); keepScroll(function () { A.render(A.curPages); });
    if (focusId) {
      var n = A.$('deck').querySelector('[data-eid="' + CSS.escape(focusId) + '"]');
      if (n) { n.focus(); selectAll(n); }
    }
  });
  function selectAll(el) { try { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  // פעולות על שקף: תיבת טקסט, לא לכלול / להחזיר, שקף טקסט חדש
  A.$('deck').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b) return;
    var sid = b.closest('.sitem').getAttribute('data-id'), act = b.getAttribute('data-act');
    if (A.imgAct(act, sid, b)) return;
    if (act === 'mzin' || act === 'mzout' || act === 'mreset') {
      if (act === 'mreset') { delete A.edits.mv[sid]; A.saveEdits(); keepScroll(function () { A.render(A.curPages); }); return; }
      A.maps.forEach(function (m) { if (m.id === sid && m.map) { if (act === 'mzin') m.map.zoomIn(0.5); else m.map.zoomOut(0.5); } });
      return;
    }
    if (act === 'box') {
      var D0 = A.dims(), box = { id: 'b' + Date.now().toString(36), x: 80, y: Math.round(D0.h * 0.72), w: Math.min(520, D0.w - 160), text: 'טקסט חדש' };
      (A.edits.boxes[sid] = A.edits.boxes[sid] || []).push(box);
      A.saveEdits();
      var el = LCEdit.boxEl(box);
      A.frameOf(sid).querySelector('.slide').appendChild(el);
      var t = el.querySelector('.tbox-t'); t.setAttribute('contenteditable', 'true'); t.focus(); selectAll(t);
      return;
    }
    if (act === 'off') { if (A.edits.off[sid]) delete A.edits.off[sid]; else A.edits.off[sid] = true; }
    else if (act === 'xdel') { A.edits.xslides = A.edits.xslides.filter(function (x) { return x.id !== sid; }); }
    else if (act === 'xadd') {
      var nid = 'x' + Date.now().toString(36);
      A.edits.xslides.push({ id: nid, after: sid });
      if (!A.editMode) A.setEdit(true);
    }
    A.saveEdits(); keepScroll(function () { A.render(A.curPages); });
  });
  // גרירת תיבת טקסט (בקואורדינטות של השקף, 1280×720)
  A.$('deck').addEventListener('pointerdown', function (ev) {
    var h = ev.target.closest('.tbox-h'); if (!h || !A.editMode) return;
    ev.preventDefault();
    var box = h.closest('.tbox'), sid = sidOf(box), id = box.getAttribute('data-box');
    var D = A.dims(), k = box.closest('.slide').getBoundingClientRect().width / D.w;
    var x0 = ev.clientX, y0 = ev.clientY, bx = parseFloat(box.style.left), by = parseFloat(box.style.top);
    function mv(e) {
      var nx = Math.max(0, Math.min(D.w - 60, bx - (x0 - e.clientX) / k)), ny = Math.max(0, Math.min(D.h - 30, by + (e.clientY - y0) / k));
      box.style.left = nx + 'px'; box.style.top = ny + 'px';
    }
    function up() {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      (A.edits.boxes[sid] || []).forEach(function (b) { if (b.id === id) { b.x = Math.round(parseFloat(box.style.left)); b.y = Math.round(parseFloat(box.style.top)); } });
      A.saveEdits();
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  // שחזור הכול — לחיצה שנייה מאשרת (אין חלון אישור)
  var resetArm = 0;
  A.$('resetall').addEventListener('click', function () {
    var b = A.$('resetall');
    if (!resetArm) { resetArm = setTimeout(function () { resetArm = 0; b.textContent = 'שחזור הכול'; }, 4000); b.textContent = 'בטוח? לחצו שוב לשחזור'; return; }
    clearTimeout(resetArm); resetArm = 0; b.textContent = 'שחזור הכול';
    A.edits = A.normEdits({ look: A.edits.look, form: A.edits.form, tv: A.edits.tv, tall: A.edits.tall, tt: A.edits.tt, ttc: A.edits.ttc, bplace: A.edits.bplace, bpl: A.edits.bpl }); A.saveEdits(); A.render(A.curPages);
  });
  return { hideBar: hideBar, bdOrderNow: bdOrderNow, bdColsNow: bdColsNow, bdColUi: bdColUi, sidOf: sidOf, keepScroll: keepScroll };
};
