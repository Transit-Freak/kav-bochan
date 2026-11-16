/* מצגת לשינוי בקו — עריכה במקום: כל טקסט בשקף אפשר לשנות, למחוק, או להוסיף שורה אחריו.
   אפשר גם להוסיף תיבת טקסט לשקף, להוסיף שקף טקסט שלם, ולמחוק שקף.

   איך מזהים טקסט בין טעינות: מזהה = שקף | גיבוב של הטקסט המקורי | מספר ההופעה בשקף.
   כך העריכה נשארת במקומה גם כשהמצגת נבנית מחדש (עיצוב אחר, רענון הדף).
   העריכות (edits): t — טקסט שהשתנה (null = נמחק) · add — שורות שנוספו אחרי טקסט ·
   boxes — תיבות טקסט חופשיות לכל שקף · xslides — שקפי טקסט שנוספו · off — שקפים שלא ייכללו. */
var LCEdit = (function () {
  var SKIP = '.smap,.inset,.dot,.segn,.segb,.sw,.lc-mk,.pg,.seam,.leaflet-container,svg,.ebar,.tbox-h';
  var FMT = { B: 1, STRONG: 1, EM: 1, U: 1, BR: 1, SUP: 1, SUB: 1, A: 1 };

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function isFmt(el) {
    if (FMT[el.tagName]) return true;
    if (el.tagName === 'SPAN' || el.tagName === 'I') return !el.className || /^(ltr|num)( |$)/.test(el.className);
    return false;
  }
  function isLeaf(el) {
    if (!el.textContent.trim()) return false;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (!isFmt(c)) return false;
    return true;
  }
  /* מסמן את כל הטקסטים בשקף: אלמנט שכולו טקסט (עם הדגשות) — עלה; טקסט "חשוף" ליד אלמנטים אחרים נעטף ב-span */
  function collect(root) {
    var out = [];
    (function visit(el) {
      if (el.matches && el.matches(SKIP)) return;
      if (el !== root && isLeaf(el)) { out.push(el); return; }
      Array.prototype.slice.call(el.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          if (n.nodeValue.trim() && el !== root) {
            var sp = document.createElement('span');
            sp.className = 'etxt';
            el.insertBefore(sp, n); sp.appendChild(n);
            out.push(sp);
          }
        } else if (n.nodeType === 1) visit(n);
      });
    })(root);
    return out;
  }

  /* מחיל את העריכות על שקף אחד, ומחזיר את רשימת הטקסטים הניתנים לעריכה */
  function apply(frame, sid, ed) {
    var slide = frame.querySelector('.slide');
    var els = collect(slide), seen = {};
    els.forEach(function (el) {
      var base = sid + '|' + hash(el.textContent.replace(/\s+/g, ' ').trim());
      seen[base] = (seen[base] || 0) + 1;
      var id = base + '|' + seen[base];
      el.setAttribute('data-eid', id);
      el.classList.add('edt');
      var adds = ed.add && ed.add[id];
      if (adds && adds.length) {
        var after = el;
        adds.forEach(function (t, i) {
          var n = document.createElement(el.tagName === 'SPAN' ? 'div' : el.tagName);
          n.className = 'edt eadd' + (el.tagName === 'SPAN' ? ' ' + el.className.replace(/\bedt\b|\betxt\b/g, '') : '');
          n.setAttribute('data-eid', id + '+' + i);
          n.innerText = t;
          after.parentNode.insertBefore(n, after.nextSibling);
          after = n;
        });
      }
      if (ed.t && Object.prototype.hasOwnProperty.call(ed.t, id)) {
        if (ed.t[id] === null) {
          // נמחק: אם נשארה שורת רשימה בלי טקסט (רק מספר או נקודה) — גם היא יורדת
          var li = el.closest('li'); el.remove();
          if (li && !li.textContent.replace(/\d+/g, '').trim()) li.remove();
        }
        else { el.innerText = ed.t[id]; el.classList.add('edited'); }
      }
    });
    // תיבות טקסט חופשיות
    (ed.boxes && ed.boxes[sid] || []).forEach(function (b) { slide.appendChild(boxEl(b)); });
    fit(frame);
  }
  function boxEl(b) {
    var d = document.createElement('div');
    d.className = 'tbox';
    d.setAttribute('data-box', b.id);
    d.style.left = b.x + 'px'; d.style.top = b.y + 'px'; d.style.width = (b.w || 420) + 'px';
    d.innerHTML = '<span class="tbox-h noprint" aria-label="גרירה" title="גרירה">⠿</span><div class="tbox-t" data-boxt="' + b.id + '"></div>';
    d.querySelector('.tbox-t').innerText = b.text;
    return d;
  }

  /* טקסט ארוך: מקטינים את האזור עד 78%, ואם עדיין לא נכנס — אזהרה (לא מודפסת) */
  var FIT = '.s-cover .body,.s-map .side,.s-one .side,.s-stops,.s-over,.s-close,.s-text';
  function over(el) { return el.scrollHeight > el.clientHeight + 2; }
  function fit(frame) {
    var slide = frame.querySelector('.slide'), bad = false;
    slide.querySelectorAll(FIT).forEach(function (t) {
      t.style.zoom = '';
      var what = t.querySelector('.what');
      var tooBig = function () { return over(t) || (what && over(what)); };
      var z = 1;
      while (tooBig() && z > 0.79) { z -= 0.04; t.style.zoom = z.toFixed(2); }
      if (tooBig()) bad = true;
    });
    frame.classList.toggle('toolong', bad);
  }

  return { apply: apply, fit: fit, boxEl: boxEl };
})();
