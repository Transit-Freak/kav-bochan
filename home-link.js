/* "חזרה לקו הבוחן" — אותו כפתור, באותו מקום (למעלה משמאל), בכל כלי באתר.
   נטען בכל הכלים במקום קישורי-בית שונים בכל אחד (בקשת שלמה 18.09).
   data-home על התג (אופציונלי) קובע לאן חוזרים; ברירת המחדל: התיקייה שמעל. */
(function () {
  try {
    var me = document.currentScript;
    var home = (me && me.getAttribute('data-home')) || '../';
    var st = document.createElement('style');
    st.textContent = '.kb-home{position:absolute;top:10px;left:10px;z-index:9999;display:inline-flex;align-items:center;gap:6px;' +
      'background:#0f172a;color:#fff;text-decoration:none;font:800 12.5px/1 "Rubik","Heebo",system-ui,sans-serif;' +
      'padding:9px 13px;border-radius:999px;box-shadow:0 2px 10px rgba(15,23,42,.25);direction:rtl}' +
      '.kb-home:hover{background:#1e293b}.kb-home:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
      '@media (max-width:760px){body{padding-top:46px !important}}' +
      '@media print{.kb-home{display:none}}';
    document.head.appendChild(st);
    var mk = function () {
      if (document.querySelector('.kb-home')) return;
      var a = document.createElement('a');
      a.className = 'kb-home';
      a.href = home;
      a.textContent = '← חזרה לקו הבוחן';
      a.setAttribute('aria-label', 'חזרה לעמוד הראשי של הקו הבוחן');
      document.body.appendChild(a);
    };
    if (document.body) mk(); else document.addEventListener('DOMContentLoaded', mk);
  } catch (e) {}
})();
