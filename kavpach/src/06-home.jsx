/* קו פח · 06-home.jsx — ChoiceScreen — דף הבית של הקו הבוחן בתוך האפליקציה (ה-HTML עצמו ב-home/home.js).
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

// ── ChoiceScreen — דף הבית של הקו הבוחן (שלמה 06.11): העין הבוחנת וכל הכלים סביבה ─────────
// ה-HTML, הסמלים, העין ורשימת הכלים — ב-home/home.js (KBH), משותף לדף הסטטי ב-index.html.
// בטעינה הראשונה React מאמץ את הצומת הסטטי עצמו (window.__kbhNode) — שום דבר לא נבנה מחדש ולא קופץ;
// וגם בחזרה מכלי מוצג אותו צומת. קו פח והקו המוזהב נפתחים בתוך האפליקציה (onPick), כמו קודם.
function ChoiceScreen({ onPick }) {
  const box = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const K = typeof window !== 'undefined' ? window.KBH : null;
  React.useLayoutEffect(() => {
    if (!K || !box.current) return;
    let node = window.__kbhNode;
    if (!node) {
      const t = document.createElement('div');
      t.innerHTML = K.html(null);
      node = window.__kbhNode = t.firstElementChild;
    }
    box.current.appendChild(node);
    K.mount(node, { onPick: (m, e) => { if (!plainClick(e)) return false; pickRef.current(m); return true; } });
    return () => { K.unmount(node); if (node.parentNode) node.parentNode.removeChild(node); };
  }, []);
  if (!K) {
    // home/home.js לא נטען — לפחות הכניסה לשני הכלים שבתוך האפליקציה
    return (
      <div className="min-h-screen p-6 text-right" dir="rtl">
        <h1 className="text-4xl font-[900] text-slate-900">הקו הבוחן</h1>
        <p className="mt-4 flex gap-4 font-black">
          <a href="#פח" onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); onPick('kavpach'); }} className="text-sky-700 underline">קו פח</a>
          <a href="#מוזהב" onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); onPick('golden'); }} className="text-sky-700 underline">הקו המוזהב</a>
        </p>
      </div>
    );
  }
  return <div ref={box} className="kbh-host" />;
}
