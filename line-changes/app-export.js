/* הורדה: PDF, תמונות לסטטוס, הדפסה ואקסל
   חלק מ-app.js (מצגת לשינוי בקו): נטען לפני app.js, ו-app.js מריץ אותו במקום שבו הקוד היה. השמות של app.js — דרך A
   (A.edits, A.render...). מה שהחלק מחזיר — פונקציות ש-app.js והחלקים האחרים קוראים להן. */
(window.LCAppParts = window.LCAppParts || {})["export"] = function (A) {
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
  // שם הקובץ: מה שהמשתמש כתב בשדה "שם הקובץ", ואם לא — השם הרגיל
  function cleanName(s) { return s.replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/\.(pdf|xlsx|png)$/i, '').replace(/^[-. ]+|[-. ]+$/g, ''); }
  function userName() { return cleanName(String(A.edits.fname || '').trim()); }
  function pdfName(dflt) {
    var f = A.formOf(), un = dflt ? '' : userName();
    if (un) return un + (f === 'status' ? '' : '.pdf');
    var ds = A.curPages.map(function (p) { return p.formal || p.eff || ''; }).filter(Boolean).sort();
    var base = LCDeck.deckTitle(A.curPages);   // כמו בשער: שינוי בקו 9 / שינויים בקווים 9, 18 ו-54 / אותו שינוי ב-3 קווים
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
  A.busy = false;
  function download() {
    if (A.busy || !A.slides.length) return;
    A.busy = true;
    var btns = [A.$('dl'), A.$('dl2')], wasEdit = A.editMode, t0 = performance.now();
    var form = A.formOf(), D = A.dims(), PW = D.w, PH = D.h, png = form === 'status', pngs = [];
    document.querySelectorAll('.pngs').forEach(function (x) { x.hidden = true; x.innerHTML = ''; });
    var label = function (t) { btns.forEach(function (b) { b.querySelector('span').textContent = t; }); };
    btns.forEach(function (b) { b.disabled = true; b.classList.add('busy'); });
    var making = png ? 'מכין תמונות…' : 'מכין PDF…';
    label(making); dlMsg('');
    // iOS בלי תמיכה בהורדת Blob (Chrome, Firefox ב-iOS): פותחים לשונית עכשיו, בזמן הלחיצה, ושמים בה את הקובץ בסוף
    // (תמונות לסטטוס — בלי לשונית: הן מוצגות ברשימה, ושומרים בלחיצה ארוכה או בשיתוף)
    var tab = IOS && !SAFARI && !png ? window.open('', '_blank') : null;
    var items = Array.prototype.filter.call(A.$('deck').querySelectorAll('.sitem'), function (it) { return !it.classList.contains('off'); });
    var host = null, cur = null;
    var mapsP = A.mapsReady();   // המפות שעוד לא נבנו — מתחילות עכשיו, במקביל לספריות
    loadLibs().then(function () {
      label('מכין את המפות…');
      // כל אריחי המפות (לכל מפה יש זמן קצוב משלה ב-deck.js), והגופנים — ועוד גבול עליון לכל ההמתנה
      return timeout(Promise.all([mapsP].concat(document.fonts ? [document.fonts.ready] : [])), 15000);
    }).then(function () {
      return tileGate(label);
    }).then(function () {
      label(making);
      if (A.editMode) A.setEdit(false);
      // מקום מחוץ למסך, בגודל המלא של שקף; השקף עובר לשם לרגע ומצולם בלי ההקטנה של התצוגה המקדימה.
      // בתוך .deck — כדי שהצבעים והעיצוב (data-look) יחולו עליו
      host = document.createElement('div');
      host.className = 'pdfhost';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;top:0;left:-' + (PW + 1800) + 'px;width:' + PW + 'px;height:' + PH + 'px;overflow:hidden;pointer-events:none';
      A.$('deck').appendChild(host);
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
        var ttl = LCDeck.deckTitle(A.curPages) || pdfName();
        pdf.setProperties({ title: ttl, subject: ttl, author: 'מצגת לשינוי בקו · הקו הבוחן', creator: 'kavbochan.app', keywords: 'תחבורה ציבורית, שינוי בקו' });
        try { if (pdf.setLanguage) pdf.setLanguage('he'); } catch (e) {}
        try { pdf.viewerPreferences({ Direction: 'R2L', DisplayDocTitle: true }); } catch (e) {}
      }
      // הגופנים מוטמעים פעם אחת לכל המצגת (במקום בכל שקף מחדש)
      return Promise.all([timeout(H.getFontEmbedCSS(A.$('deck'), opts), 10000).catch(function () { return ''; }), pdf ? timeout(loadPdfFont(), 10000) : null]).then(function (rs) {
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
      A.scale();
      if (wasEdit && !A.editMode) A.setEdit(true);
      btns.forEach(function (b) { b.disabled = false; b.classList.remove('busy'); });
      A.busy = false;
      label(A.dlText());
    });
  }
  /* תמונות לסטטוס: יורדות אחת אחרי השנייה (חוץ מ-iOS), ונשארות ברשימה — לשמירה שוב או לשיתוף ישר לווטסאפ */
  function showPngs(blobs) {
    var name = pdfName(), form = A.formOf();
    var files = blobs.map(function (b, i) { return { blob: b, name: name + (blobs.length > 1 ? '-' + (i + 1) : '') + '.png', url: URL.createObjectURL(b) }; });
    var canShare = false;
    try { canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([blobs[0]], files[0].name, { type: 'image/png' })] })); } catch (e) {}
    document.querySelectorAll('.pngs').forEach(function (box) {
      box.setAttribute('data-form', form);
      box.innerHTML = '<p>' + (IOS ? 'לשמירה בתמונות: לחיצה ארוכה על התמונה ← "הוספה לתמונות".' : (files.length > 1 ? 'התמונות ירדו. אפשר להוריד כל אחת שוב:' : 'התמונה ירדה. אפשר להוריד אותה שוב:')) + '</p>' +
        files.map(function (f, i) { return '<a href="' + f.url + '" download="' + A.E(f.name) + '"><img src="' + f.url + '" alt="תמונה ' + (i + 1) + ' לסטטוס">' + (files.length > 1 ? 'תמונה ' + (i + 1) : 'הורדה') + '</a>'; }).join('') +
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
    timeout(A.mapsReady(), 15000).then(function () {
      var t0 = document.title;
      document.title = LCDeck.deckTitle(A.curPages) || 'מצגת';
      if (A.editMode) A.setEdit(false);
      setTimeout(function () { window.print(); document.title = t0; }, 50);
    });
  }
  /* ייצוא לאקסל (לו"ז עדכני): אותו מבנה של "טבלה לפי יעד", בקובץ xlsx — xlsx.js נטען רק בלחיצה */
  var xlP = null;
  function xlLib() {
    if (window.LCXlsx) return Promise.resolve();
    return xlP || (xlP = new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = 'xlsx.js?v=18'; sc.onload = res; sc.onerror = function () { xlP = null; rej(new Error('xlsx')); };
      document.head.appendChild(sc);
    }));
  }
  function fileName(s) { var un = userName(); if (un) return un + '.xlsx'; return s.replace(/[\\\/:*?"<>|,\s]+/g, '-').replace(/-+/g, '-') + '.xlsx'; }
  function exportXlsx() {
    var cu = A.curPages.filter(function (p) { return p.kind === 'current'; }), tt = A.curPages.filter(LCDeck.ttCap);
    if (!cu.length && !tt.length) return;
    dlMsg('מכין את קובץ האקסל…');
    var tab = IOS && !SAFARI ? window.open('', '_blank') : null;
    xlLib().then(function () {
      var o = A.edOpts(A.formOf()), tv = o.tv, blob, nm;
      if (cu.length) {
        // לו"ז עדכני: שורה לכל קו וכיוון, עמודה לכל קבוצת ימים, ועמודה לחג כשיש — לפי הכרטיס:
        // לוח מודעות — גיליון אחד לכל הקווים; טבלה משולבת — גיליון לכל יעד; תקציר וטבלה לכל קו — גיליון לכל קו
        var M = LCDeck.boardModel(cu, o, { hol: true });
        nm = fileName('לוח-זמנים-' + (A.edits.bplace || (cu.length <= 3 ? 'קו-' + cu.map(function (p) { return p.line; }).join('-') : M.home)) + '-' + (M.valid || LC.todayIso()));
        // קו שמשתנה בימים הקרובים: קודם גיליון של השבוע עד השינוי ("עד 28.11"), ואחריו הגיליון מהשינוי ("החל מ-29.11") — כמו בשקפים
        var wkOf = function (g, MM, name) {
          var pre = LCDeck.curPre(g); if (!pre) return [[MM, name]];
          var W = LCDeck.boardModel(pre, o, { hol: true }), wu = W.wk, cut = function (n, s) { return (n ? n.slice(0, 30 - s.length).trim() + ' ' : '') + s; };
          return [[W, cut(name === 'לוח זמנים' ? '' : name, 'עד ' + LC.dm(wu))], [MM, cut(name === 'לוח זמנים' ? '' : name, 'החל מ-' + LC.dm(LC.addDays(wu, 1)))]];
        };
        if (tv === 'board' || cu.length === 1) blob = LCXlsx.book(wkOf(cu, M, 'לוח זמנים'));
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
            return wkOf(g, LCDeck.boardModel(g, o, { hol: true }), n);
          }).reduce(function (a, b) { return a.concat(b); }, []));
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
  A.$('xl').addEventListener('click', exportXlsx);
  A.$('xl2').addEventListener('click', exportXlsx);
  A.$('dl').addEventListener('click', download);
  A.$('dl2').addEventListener('click', download);
  document.querySelectorAll('.printbtn').forEach(function (b) { b.addEventListener('click', printDeck); });
  window.LCApp = { ready: function () { return A.mapsReady(true); }, step: function () { return A.step; } };
  return { pdfName: pdfName };
};
