/* תמונות במצגת: קריאה והקטנה, שמירה ב-IndexedDB, גרירה, תיאור, הדבקה
   חלק מ-app.js (מצגת לשינוי בקו): נטען לפני app.js, ו-app.js מריץ אותו במקום שבו הקוד היה. השמות של app.js — דרך A
   (A.edits, A.render...). מה שהחלק מחזיר — פונקציות ש-app.js והחלקים האחרים קוראים להן. */
(window.LCAppParts = window.LCAppParts || {})["images"] = function (A) {
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
    if (A.edits) { Object.keys(A.edits.imgs || {}).forEach(function (sid) { (A.edits.imgs[sid] || []).forEach(function (b) { used[b.img] = 1; }); }); (A.edits.xslides || []).forEach(function (x) { if (x.img) used[x.img] = 1; }); }
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
      if (A.curPages && A.slides && A.slides.length && Object.keys(IMGS).length) A.keepScroll(function () { A.render(A.curPages); });
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
    var fr = A.frameOf(sid); if (!fr) return;
    var slide = fr.querySelector('.slide'), D = A.dims();
    slide.querySelectorAll('.ibox').forEach(function (x) { x.remove(); });
    (A.edits.imgs[sid] || []).forEach(function (b) {
      var src = getImg(b.img); if (!src) return;
      var el = LCEdit.imgEl(b, src, D.w, D.h);
      if (A.editMode) el.setAttribute('tabindex', '0');
      slide.appendChild(el);
    });
  }
  function imgMsg(t) { var m = A.$('imgmsg'); if (m) { m.textContent = t; clearTimeout(imgMsg.t); imgMsg.t = setTimeout(function () { m.textContent = ''; }, 4000); } }
  // מוסיפים תמונה: על השקף sid (תיבה שאפשר להזיז ולשנות גודל), או כשקף תמונה חדש אחריו
  function addImage(file, sid, asSlide) {
    if (!sid) return;
    imgMsg('מכין את התמונה…');
    readImage(file).then(function (r) {
      var iid = 'i' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
      putImg(iid, r.url);
      if (asSlide) {
        var nid = 'x' + Date.now().toString(36);
        A.edits.xslides.push({ id: nid, after: sid, img: iid, fit: 'cover' });
        if (!A.editMode) A.setEdit(true);
        A.saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
        imgMsg('נוסף שקף עם התמונה');
        imgAlt(nid, null);
        return;
      }
      var D = A.dims(), port = D.h > D.w;
      var w = port ? 60 : 36, maxW = 100 * 0.6 * D.h * r.r / D.w;   // עד 60% מגובה השקף
      if (w > maxW) w = maxW;
      var hP = w * D.w / r.r / D.h;
      var b = { id: iid, img: iid, x: +(50 - w / 2).toFixed(2), y: +((100 - hP) / 2).toFixed(2), w: +w.toFixed(2), r: +r.r.toFixed(4) };
      (A.edits.imgs[sid] = A.edits.imgs[sid] || []).push(b);
      A.saveEdits();
      if (!A.editMode) A.setEdit(true);
      drawImgs(sid);
      var el = A.frameOf(sid).querySelector('.ibox[data-ibox="' + CSS.escape(iid) + '"]');
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
  function findImg(sid, id) { return (A.edits.imgs[sid] || []).filter(function (b) { return b.id === id; })[0]; }
  function delImg(sid, id) {
    A.edits.imgs[sid] = (A.edits.imgs[sid] || []).filter(function (b) { return b.id !== id; });
    if (!A.edits.imgs[sid].length) delete A.edits.imgs[sid];
    A.saveEdits();
    var el = A.frameOf(sid) && A.frameOf(sid).querySelector('.ibox[data-ibox="' + CSS.escape(id) + '"]');
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
    var b = id ? findImg(sid, id) : A.edits.xslides.filter(function (x) { return x.id === sid; })[0];
    if (!b) return;
    altDlg(b.alt, function (v) {
      if (v) b.alt = v; else delete b.alt;
      A.saveEdits();
      if (id) drawImgs(sid); else A.keepScroll(function () { A.render(A.curPages); });
      imgMsg(v ? 'התיאור נשמר' : 'התמונה בלי תיאור');
    });
  }
  // פעולות התמונות בסרגל של השקף. מחזיר true אם הפעולה טופלה כאן
  function imgAct(act, sid, b) {
    if (act === 'imgalt') { var ib0 = b.closest('.ibox'); imgAlt(ib0 ? A.sidOf(ib0) : sid, ib0 ? ib0.getAttribute('data-ibox') : null); return true; }
    if (act === 'img' || act === 'ximg') { pickFor = { sid: sid, slide: act === 'ximg' }; picker.click(); return true; }
    if (act === 'imgdel') { var ib = b.closest('.ibox'); if (ib) delImg(A.sidOf(ib), ib.getAttribute('data-ibox')); return true; }
    if (act === 'fit') {
      A.edits.xslides.forEach(function (x) { if (x.id === sid) x.fit = x.fit === 'contain' ? 'cover' : 'contain'; });
      A.saveEdits(); A.keepScroll(function () { A.render(A.curPages); });
      return true;
    }
    return false;
  }
  // הזזה (גרירה של התמונה) ושינוי גודל (העיגול בפינה, שומר על היחס) — עכבר ומגע
  A.$('deck').addEventListener('pointerdown', function (ev) {
    var box = ev.target.closest('.ibox'); if (!box || !A.editMode || ev.target.closest('.ibox-x,.ibox-a')) return;
    if (ev.button > 0) return;
    ev.preventDefault();
    box.focus({ preventScroll: true });
    var sid = A.sidOf(box), b = findImg(sid, box.getAttribute('data-ibox')); if (!b) return;
    var D = A.dims(), k = box.closest('.slide').getBoundingClientRect().width / D.w;
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
      A.saveEdits();
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  // מקלדת: חיצים מזיזים (עם Shift — יותר), פלוס ומינוס משנים גודל, Delete מוחק
  A.$('deck').addEventListener('keydown', function (ev) {
    var box = ev.target; if (!A.editMode || !box.classList || !box.classList.contains('ibox')) return;
    var sid = A.sidOf(box), b = findImg(sid, box.getAttribute('data-ibox')); if (!b) return;
    var D = A.dims(), st = ev.shiftKey ? 5 : 1, hP = function () { return b.w * D.w / b.r / D.h; };
    var k = ev.key;
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); delImg(sid, b.id); var it = A.frameOf(sid); if (it) it.closest('.sitem').querySelector('[data-act="img"]').focus(); return; }
    if (k === 'ArrowLeft') b.x -= st; else if (k === 'ArrowRight') b.x += st;
    else if (k === 'ArrowUp') b.y -= st; else if (k === 'ArrowDown') b.y += st;
    else if (k === '+' || k === '=') b.w += st; else if (k === '-' || k === '_') b.w -= st;
    else return;
    ev.preventDefault();
    b.w = Math.max(4, Math.min(b.w, 100, 100 * D.h * b.r / D.w));
    b.x = +Math.max(0, Math.min(100 - b.w, b.x)).toFixed(2); b.y = +Math.max(0, Math.min(100 - hP(), b.y)).toFixed(2); b.w = +b.w.toFixed(2);
    box.style.left = b.x + '%'; box.style.top = b.y + '%'; box.style.width = b.w + '%';
    A.saveEdits();
  });
  // הדבקת תמונה (Ctrl+V במחשב) במצב עריכה: נכנסת לשקף שעובדים עליו — או לשקף שבמרכז המסך
  var lastSid = null;
  A.$('deck').addEventListener('pointerdown', function (ev) { var it = ev.target.closest('.sitem'); if (it) lastSid = it.getAttribute('data-id'); }, true);
  A.$('deck').addEventListener('focusin', function (ev) { var it = ev.target.closest('.sitem'); if (it) lastSid = it.getAttribute('data-id'); });
  function sidNow() {
    var its = Array.prototype.filter.call(A.$('deck').querySelectorAll('.sitem'), function (x) { return !x.hidden; });
    if (lastSid && its.some(function (x) { return x.getAttribute('data-id') === lastSid; })) return lastSid;
    var mid = window.innerHeight / 2, best = null, bd = 1e9;
    its.forEach(function (x) { var r = x.getBoundingClientRect(), d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid)); if (d < bd) { bd = d; best = x; } });
    return best ? best.getAttribute('data-id') : null;
  }
  document.addEventListener('paste', function (ev) {
    if (!A.editMode || A.step !== 3 || !ev.clipboardData) return;
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
  return { getImg: getImg, clearImgs: clearImgs, drawImgs: drawImgs, imgAct: imgAct };
};
