/* הקו בזמן · 07-line-page.jsx — עמוד הקו (LinePage), מפת אירוע תחנה, ועמוד קו מ-2012.
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

function LinePage({ rd, lineGone, sibs, onSwitch, onBack, initDate, initCats, backHref }) {
  // "· רציף N" ליד תחנה במסוף — הרציף של הווריאנט הזה לפי שורת הרציף בקובץ
  // התחנות (platforms.json rd), מתעדכן מדי יום
  const plats = usePlatforms();
  const rdPlat = (plats && plats.rd && plats.rd[rd]) || {};
  const why = useRailWhy(rd);
  const withPlat = (str, c) => (c != null && rdPlat[String(c)]) ? `${str} · רציף ${rdPlat[String(c)]}` : str;
  const [lf, setLf] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);   // אינדקס גרסה נבחרת
  const detailRef = useRef(null);
  const selectEvent = (i, event) => {
    // בתצוגה החדשה לחיצה שנייה על השינוי שנבחר סוגרת אותו (והמפה חוזרת למעלה)
    if (false) { setSel(null); return; }
    setSel(i);
    if(event.k === "sched" || event.k === "freq"){
      requestAnimationFrame(()=>{
        const panel=detailRef.current;
        if(panel)(panel.querySelector(".early-schedule-diff,.tdiff")||panel).scrollIntoView({block:"start",inline:"nearest",behavior:"instant"});
        window.scrollBy({top:-12,behavior:"instant"});
      });
    }
  };
  const [mon, setMon] = useState("");
  const temps = useTempEvents(rd);
  const [offK, setOffK] = useState(() => new Set());   // קטגוריות שכובו בעמוד הקו
  const [cmpI, setCmpI] = useState(null);              // גרסת בסיס להשוואה חופשית
  const [onlyCur, setOnlyCur] = useState(false);       // מפה בלי שכבת העבר
  const [only12, setOnly12] = useState(true);          // חלונית 2012 פתוחה: במפה רק מסלול 2012 (שלמה 05.09), או יחד עם היום
  const [show12, setShow12] = useState(false);
  const [altRd, setAltRd] = useState(null);   // חלופה שנבחרה להשוואה
  const [d12, setD12] = useState(null);   // קובץ הקו של 2012 (נטען בפתיחה)
  const [r12, setR12] = useState(0);      // וריאנט 2012 נבחר
  const [s12, setS12] = useState(null);   // מסלולים משוערים של 2012 על הכבישים (אם חושבו)
  const [rty, setRty] = useState(0);      // מונה "נסו שוב" אחרי כשל רשת
  // העוגן של 2012 מוטמע בקובץ הקו עצמו (lf.anc, מוזרק בצינור הלילי) —
  // בעבר כל פתיחת עמוד קו הורידה את קובץ העוגנים המלא (1.2MB) רק כדי
  // לשלוף שורה אחת, כולל בקווי רכבת ומוניות שאין להם עוגן בכלל.
  const anc = (lf && lf.anc) || null;
  // הקו של 2012 לפי קובצי משרד התחבורה (tools/link_mot2012.py) — קודם למגיעים (שלמה 26.09)
  const [mot12, setMot12] = useState(null);
  useEffect(() => {
    setMot12(null); let ok = true;
    if (!SHOW_2012_BOX) return undefined;
    const k = (rd.split("-")[0].slice(0, 2) || "0").padStart(2, "0");
    dfetch("data/mot2012-links/" + k + ".json").then((r) => (r.ok ? r.json() : {})).then((m) => { if (ok) setMot12(m[rd] || []); }).catch(() => { if (ok) setMot12([]); });
    return () => { ok = false; };
  }, [rd]);
  useEffect(() => {
    setShow12(false); setD12(null); setR12(0); setS12(null); setAltRd(null);
  }, [rd]);
  // רכבת (שלמה 28.10): חלופות עם אותן תחנות שפעלו באותה תקופה — שורה אחת בבוחר החלופות.
  // נשארת הנציגה (זו שפעלה אחרונה) עם מספר החלופות שהיא מאחדת; החלופה הפתוחה תמיד נשארת.
  const [railG, setRailG] = useState(null);
  const isRail = String(rd).split("-").length >= 3 && sibs && sibs.length > 1 && (lf || {}).tt === "rail";
  useEffect(() => {
    setRailG(null); if (!isRail) return undefined; let ok = true;
    dfetch("data/rail-groups/" + rd.split("-")[0] + ".json").then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (ok) setRailG(j && j.g ? j.g : {}); }).catch(() => { if (ok) setRailG({}); });
    return () => { ok = false; };
  }, [rd.split("-")[0], isRail]);
  const sibsShown = useMemo(() => {
    if (!isRail || !railG || !sibs) return sibs;
    const hide = new Set(), n = {};
    for (const [rep, ms] of Object.entries(railG)) { n[rep] = ms.length; for (const m of ms) if (m !== rep) hide.add(m); }
    return sibs.filter((s) => !hide.has(s.rd) || s.rd === rd).map((s) => (n[s.rd] ? { ...s, merged: n[s.rd] } : s));
  }, [sibs, railG, isRail, rd]);
  // המסלול המשוער על הכבישים נשמר בקובץ נפרד לכל קו 2012 — קיים רק למה שחושב
  useEffect(() => {
    if (!show12 || s12 || !anc) return;
    dfetch("../magihim-2012/data/shapes/l" + anc.k + ".json")
      .then((r) => (r.ok ? r.json() : { routes: {} }))
      .then(setS12).catch(() => setS12({ routes: {} }));
  }, [show12, anc, s12]);
  useEffect(() => {
    if (!show12 || d12 || !anc) return;
    dfetch("../magihim-2012/data/l" + anc.k + ".json")
      .then((r) => r.json())
      .then((d) => {
        // בחירת וריאנט 2012 שתואם את כיוון הווריאנט הפתוח — לפי דמיון
        // תחנות הקצה (ולא סתם הווריאנט הראשון בקובץ)
        const routes = d.routes || [];
        const cur = ((lf || {}).versions || []).slice(-1)[0] || {};
        const st = cur.stops || [];
        let best = 0;
        if (st.length && routes.length > 1) {
          const tok = (x) => new Set(String(x || "").split(/[^א-ת0-9]+/).filter((w) => w.length >= 3));
          const f0 = tok(st[0][1]), l0 = tok(st[st.length - 1][1]);
          let bs = -1;
          routes.forEach((r, i) => {
            const sc = [...tok(r.f)].filter((w) => f0.has(w)).length * 2 +
              [...tok(r.l)].filter((w) => l0.has(w)).length * 2 + (r.n || 0) / 1000;
            if (sc > bs) { bs = sc; best = i; }
          });
        }
        setR12(best);
        setD12(d);
      })
      .catch(() => setD12({ routes: [] }));
  }, [show12, anc, d12, lf]);
  useEffect(() => {
    // מעבר מהיר בין קווים מייצר שתי בקשות, והתשובה האיטית יותר עלולה
    // לנחות אחרונה ולערבב קו אחד עם מצב של אחר. אותו שמירה כמו בהשוואת
    // החלופות.
    let ok = true;
    setLf(null); setErr(null); setSel(null); setMon(""); setOffK(new Set()); setCmpI(null); setOnlyCur(false);
    dfetch("data/lines/" + fsafe(rd) + ".json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { if (!ok) return; const m = materializeLf(d); setLf(m);
        // קישור מציר תחנה מגיע עם תאריך (‎#מקט@תאריך‎) — נוחתים ישר על
        // הגרסה של אותו שינוי, לא על הגרסה האחרונה
        let s = d.versions.reduce((last,v,i)=>v.hid?last:i, 0);
        if (initDate) {
          const i = d.versions.findIndex((v) => v.d === initDate);
          if (i >= 0) s = i;
        }
        setSel(s);
        // נכנסו מתוך חיפוש לפי קטגוריה: הסרגל נדלק רק על סוגי האירועים
        // שמתאימים לה (שלמה 06.09). הסינון הוא לפי סוג האירוע, כמו בסרגל —
        // סוג שיש בו לפחות אירוע אחד מתאים נשאר דלוק. אם שום אירוע לא
        // מתאים — מציגים הכול, לא עמוד ריק.
        const cats = String(initCats || "").split(",").filter(Boolean);
        if (cats.length) {
          const vs2 = m.versions || [], keep = new Set(), all = new Set();
          vs2.forEach((x, i) => { if (x.hid) return; const dk = dispKind(x, i, vs2); all.add(dk); if (cats.some((c) => evInCat(x, i, vs2, c))) keep.add(dk); });
          if (keep.size && keep.size < all.size) setOffK(new Set([...all].filter((k) => !keep.has(k))));
          // נכנסו מהקטגוריה "שינוי זמני" בלבד — מוצגים רק השינויים הזמניים
          else if (!keep.size && cats.every((c) => c === "temp")) setOffK(new Set(all));
          if (!cats.includes("temp")) setOffK((p) => new Set([...p, "temp"]));
        } else {
          // ברירת המחדל (שלמה 08.10): כל סוגי השינויים בסרגל, אבל השגרתיים (לו"ז, תגבור, תיקוני רישום)
          // כבויים — לחיצה על הקטגוריה מדליקה אותה. השינוי שהקישור הוביל אליו נשאר דלוק תמיד,
          // וקו שכל השינויים שלו שגרתיים מוצג כולו ולא כעמוד ריק.
          const vs2 = m.versions || [], all = new Set();
          vs2.forEach((x, i) => { if (!x.hid) all.add(dispKind(x, i, vs2)); });
          const low = new Set([...all].filter((k) => LOW_KINDS.has(k)));
          if (initDate && s != null && vs2[s]) low.delete(dispKind(vs2[s], s, vs2));
          if (low.size && low.size < all.size) setOffK(low);
        } })
      .catch((e) => { if (ok) setErr(e); });
    return () => { ok = false; };
  }, [rd, rty, initDate, initCats]);
  // הודעת שגיאה אחת לשני מצבים שונים הטעתה: כשל רשת רגעי בנייד הוצג
  // כ"לא נמצאו נתונים" והגולש הסיק שאין מה לראות. סטטוס HTTP (404) הוא
  // באמת קו שאין לו קובץ; כל השאר — תקלה, עם כפתור לנסות שוב.
  if (err) return (
    <div className="card"><BackLink href={backHref} onBack={onBack}>→ חזרה</BackLink>
      {/^\d+$/.test(String(err.message)) ? <div className="empty">לא נמצאו נתונים לוריאנט הזה.</div>
        : <div className="empty">📡 הנתונים לא ירדו — כנראה תקלת רשת רגעית.{" "}
          <button className="morebtn" onClick={() => setRty((n) => n + 1)}>↻ נסו שוב</button></div>}
    </div>);
  if (!lf) return <div className="card">טוען…</div>;
  const vs = lf.versions;
  // מספר הנסיעות מגיע מהאינדקס ולא מקובץ הקו: הוא משתנה מיום ליום, ובקובץ
  // הקו הוא היה משנה את כל 13,000 הקבצים בכל ריצה יומית
  const ntr = ((sibs || []).find((x) => x.rd === rd) || {}).ntr || 0;
  const lastReal = vs.filter((v) => !v.syn && v.k !== "planned-dropped").pop();
  const goneD = lastReal ? variantGone(lastReal.k, lastReal.d, lf.historicalOnly, ntr, lf.observationOnly) : null;
  const months = [...new Set(vs.filter((v) => !v.hid).map((v) => v.d.slice(0, 7)))].reverse();
  const shownAll = vs.map((v, i) => ({ v, i }))
    .filter((x) => !x.v.hid && (!mon || x.v.d.slice(0, 7) === mon) && !offK.has(dispKind(x.v, x.i, vs))).reverse();
  const shown = shownAll;
  // הקטגוריות שקיימות בקו הזה בפועל, לפי שכיחות — סרגל כיבוי/הדלקה.
  // שלוש קבוצות מאוחדות כאן ולא בתווית שעל האירוע: בסרגל הן שאלה אחת
  // ("להציג שינויי תחנות?") ואילו על האירוע עצמו ההבחנה כן נושאת מידע.
  const kindsHere = (() => {
    // התווית שעל האירוע נגזרת מ-dispKind ולא מ-k הגולמי; סינון לפי k היה
    // יוצר אי-התאמה — כפתור "שינוי מספר הרכבים" שמשאיר אירועים מתויגים
    // "שינוי לו״ז". הסינון והתוויות חייבים לדבר באותה שפה.
    const c = new Map();
    vs.forEach((x, i) => {
      if (x.hid) return;
      const dk = dispKind(x, i, vs), g = KGROUP[dk] || dk;
      const e = c.get(g) || { n: 0, kinds: new Set() };
      e.n += 1; e.kinds.add(dk); c.set(g, e);
    });
    if (temps.length) c.set("temp", { n: temps.length, kinds: new Set(["temp"]) });
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n);
  })();
  // ציר הזמן: האירועים של הקו, ובתוכם לפי התאריך השינויים הזמניים (אם הקטגוריה דלוקה)
  const tlRows = (() => {
    const tt = offK.has("temp") ? [] : temps.filter((t) => (!mon || t.d.slice(0, 7) === mon));
    const out = []; let k = 0;
    shown.forEach((row) => { while (k < tt.length && tt[k].d >= row.v.d) out.push({ t: tt[k++] }); out.push(row); });
    while (k < tt.length) out.push({ t: tt[k++] });
    return out;
  })();
  const rowD = (r) => (r.t ? r.t.d : r.v.d);
  const toggleK = (ks, wasOff) => setOffK((prev) => {
    const n = new Set(prev);
    ks.forEach((k) => (wasOff ? n.delete(k) : n.add(k)));
    return n;
  });
  // מס' תחנה לרשימות ➕/➖: בהוספה מחפשים בגרסה עצמה, בהורדה בגרסאות שלפניה
  const codeOf = (name, i, isAdd) => {
    const scan = (l) => { const h = (l || []).find((s) => s && s[1] === name); return h ? h[0] : null; };
    // האינדקס עלול להצביע מחוץ למערך כשמעבר בין קווים מותיר מצב מגרסה
    // קודמת. הגבול התחתון נשמר כאן מאז ומתמיד, אבל העליון לא — ובקו שקיבל
    // תחנות בגרסה האחרונה זה הפיל את כל העמוד.
    const top = Math.min(i, vs.length - 1);
    if (isAdd && vs[top]) { const c = scan(vs[top].stops); if (c) return c; }
    for (let j = top - (isAdd ? 0 : 1); j >= 0; j--) { const c = scan(vs[j].stops); if (c) return c; }
    for (let j = i + 1; j < vs.length; j++) { const c = scan(vs[j].stops); if (c) return c; }
    return null;
  };
  // רשומת ➖ שהיא מק"ט חשוף: הסריקה לא מצאה שם לתחנה שירדה (המק"ט כבר
  // נמחק מהרישום הארצי) ושמרה את המספר עצמו. השם קיים בתיעוד הישן של
  // הקו — מאתרים אותו שם. מחזיר את רשומת התחנה המלאה (מק"ט, שם, מיקום)
  const stopByCode = (code, i) => {
    const top = Math.min(i, vs.length - 1);
    for (let j = top; j >= 0; j--) {
      const h = (vs[j].stops || []).find((s) => s && String(s[0]) === code);
      if (h) return h;
    }
    for (let j = top + 1; j < vs.length; j++) {
      const h = (vs[j].stops || []).find((s) => s && String(s[0]) === code);
      if (h) return h;
    }
    return null;
  };
  // ➖ שנשאר בלי מק"ט: שם התחנה בפיד השתנה מאז התיעוד שלנו (למשל
  // "דוד רמז/הכרם" ששמור אצלנו בשמו הישן "מסוף רמז/דוד רמז"), ולכן חיפוש
  // לפי שם לא מוצא כלום. משלימים מול ההפרש בפועל בין הגרסאות: אם בדיוק
  // מק"ט אחד ירד ולא נתבע על ידי שם אחר ברשימה — הוא-הוא התחנה החסרה
  const remFix = (i) => {
    const out = {};
    const top = Math.min(i, vs.length - 1);
    const v = vs[top];
    if (!v || !(v.stops || []).length || !(v.rem || []).length) return out;
    let prevS = null;
    for (let j = top - 1; j >= 0; j--) { if ((vs[j].stops || []).length) { prevS = vs[j].stops; break; } }
    if (!prevS) return out;
    const curC = new Set(v.stops.map((s) => String(s[0])));
    const claimed = new Set();
    const unresolved = [];
    for (const n of v.rem || []) {
      const e = v.nc && v.nc[n];
      const c = Array.isArray(e) ? String(e[0]) : (e || (/^\d{3,}$/.test(n) ? n : codeOf(n, i, false)));
      if (c) claimed.add(String(c)); else unresolved.push(n);
    }
    const free = prevS.filter((s) => !curC.has(String(s[0])) && !claimed.has(String(s[0])));
    if (unresolved.length === 1 && free.length === 1) out[unresolved[0]] = free[0];
    return out;
  };
  // v.nc — מק"טים שהצנרת פענחה מראש לשמות שאינם בקובץ (תחנה שירדה
  // בגרסה הראשונה של קו ארכיוני, למשל) — נבדק לפני החיפוש הרגיל.
  // הערך: מחרוזת מק"ט, או [מק"ט, lat, lon] כשגם המיקום ידוע (למפה)
  const ncOf = (nv, name) => {
    const e = nv && nv.nc && nv.nc[name];
    return Array.isArray(e) ? e[0] : e;
  };
  // כל המק"טים ששייכים לשם — בסדר הסריקה של codeOf. שם שמופיע פעמיים
  // ברשימה הוא שתי תחנות שונות (שני צידי רחוב), וכל מופע צריך את המספר
  // שלו — לא "×2" עם מק"ט אחד לשתיהן (דיווח שלמה: ישעיהו הנביא)
  const codesFor = (name, i, isAdd) => {
    const out = []; const seen = new Set();
    const take = (l) => (l || []).forEach((s) => {
      if (s && s[1] === name && !seen.has(String(s[0]))) { seen.add(String(s[0])); out.push(String(s[0])); }
    });
    const top = Math.min(i, vs.length - 1);
    if (isAdd && vs[top]) take(vs[top].stops);
    for (let j = top - (isAdd ? 0 : 1); j >= 0; j--) take(vs[j].stops);
    for (let j = i + 1; j < vs.length; j++) take(vs[j].stops);
    return out;
  };
  // רשימת ➕/➖ מוכנה להצגה. הכלל: הזיהוי לפי מספר תחנה, השם רק תצוגה.
  // אירועים חדשים נושאים את המק"ט המדויק לצד כל שם (e.c, מיושר מהסורק);
  // הניחוש-לפי-שם נשאר רק לרשומות ישנות שנשמרו בלי מספרים.
  const labelList = (entries, i, isAdd) => {
    const cnt = {};
    const strs = (entries || []).map((e) => {
      const name = e.n;
      if (e.c) {
        if (/^\d{3,}$/.test(name)) { const h = stopByCode(e.c, i); return h ? withPlat(`${h[1]} (${e.c})`, e.c) : name; }
        return withPlat(`${name} (${e.c})`, e.c);
      }
      if (!isAdd && /^\d{3,}$/.test(name)) {
        const h = stopByCode(name, i);
        return h ? withPlat(`${h[1]} (${name})`, name) : name;
      }
      const k = (cnt[name] = (cnt[name] || 0) + 1) - 1;
      const nv = vs[Math.min(i, vs.length - 1)];
      const cs = codesFor(name, i, isAdd);
      const c = cs[k] != null ? cs[k] : (k === 0 ? ncOf(nv, name) : null);
      if (c) return withPlat(`${name} (${c})`, c);
      if (!isAdd) { const f = remFix(i)[name]; if (f) return withPlat(`${name} (${f[0]})`, f[0]); }
      return name;
    });
    // שם מנתוני משרד התחבורה (חופש מידע) — השם של היום (שלמה 18.11)
    const now = new Set([...((vs[i] && vs[i].foiNames) || []), ...((vs[i - 1] && vs[i - 1].foiNames) || [])].map(String));
    const strs2 = now.size ? strs.map((x) => { const m = /\((\d+)\)/.exec(x); return m && now.has(m[1]) ? x + " · שם עדכני" : x; }) : strs;
    return dedupCount(strs2).map(({ x, n: c }) => x + (c > 1 ? ` ×${c}` : "")).join(", ");
  };
  // תחנה שירדה ותחנה שנוספה עם אותו שם ורק רציף שונה — זה מעבר רציף,
  // לא "תחנה חדשה": מזווגים אותן ומציגים שורת מעבר אחת ברורה
  const platOf = (n) => {
    const m = /רציף\s*([^\s/,]+)/.exec(n || "");
    return m ? { plat: m[1], base: (n.replace(/\s*\/?\s*רציף\s*[^\s/,]+/, "").trim() || n) } : null;
  };
  const splitPlatformMoves = (add, rem) => {
    const a = (add || []).map((e) => ({ ...e, p: platOf(e.n), used: false }));
    const r = (rem || []).map((e) => ({ ...e, p: platOf(e.n), used: false }));
    const moves = [];
    for (const x of a) {
      if (!x.p) continue;
      const y = r.find((y2) => y2.p && !y2.used && y2.p.base === x.p.base);
      if (y) { x.used = y.used = true; moves.push({ base: x.p.base, from: y.p.plat, to: x.p.plat }); }
    }
    return { moves,
      add: a.filter((x) => !x.used).map((x) => ({ n: x.n, c: x.c })),
      rem: r.filter((y) => !y.used).map((y) => ({ n: y.n, c: y.c })) };
  };
  // תחנה שירדה ותחנה שנוספה עם אותו שם, מק"ט שונה ואותו מיקום — משרד
  // התחבורה החליף לתחנה את המספר, לא ביטל אותה: שורת החלפה אחת במקום
  // "נוספה"+"ירדה" שנראות כסתירה (קו 80 כפר חב"ד: 33300 ← 33486)
  // סיכות "תחנה שירדה" למפה + מי שנשארה בלי מיקום. תחנה שאי אפשר למקם
  // אסור שתיעלם בשקט (דרישת שלמה) — היא חוזרת ב-unplaced ומוצגת בכיתוב
  const remPinsOf = (v2, vi2, gv2) => {
    const pins = [];
    const unplaced = [];
    (v2.rem || []).forEach((n, j) => {
      // המק"ט המדויק שנשמר עם האירוע (v.rc) קודם לכל ניחוש
      const rc = v2.rc && v2.rc[j] != null ? String(v2.rc[j]) : null;
      if (rc) {
        const h = stopByCode(rc, vi2);
        if (h) { pins.push([rc, /^\d{3,}$/.test(n) ? h[1] : n, h[2], h[3]]); return; }
      }
      const e = v2.nc && v2.nc[n];
      if (Array.isArray(e)) { pins.push([String(e[0]), n, e[1], e[2]]); return; }
      // רשומה שהיא מק"ט חשוף — התחנה מאותרת לפי המספר בתיעוד הישן
      if (/^\d{3,}$/.test(n)) {
        const h = stopByCode(n, vi2);
        if (h) pins.push([n, h[1], h[2], h[3]]); else unplaced.push(n);
        return;
      }
      // התחנה שירדה קיימת עם קואורדינטות ברשימות של גרסאות אחרות —
      // בלי הנפילה הזו לאחור היא הופיעה בטקסט אך לא על המפה
      for (let k = vi2 - 1; k >= 0; k--) {
        const h = (vs[k].stops || []).find((s) => s && s[1] === n);
        if (h) { pins.push([String(h[0]), n, h[2], h[3]]); return; }
      }
      for (let k = vi2 + 1; k < vs.length; k++) {
        const h = (vs[k].stops || []).find((s) => s && s[1] === n);
        if (h) { pins.push([String(h[0]), n, h[2], h[3]]); return; }
      }
      // השם בפיד השתנה מאז התיעוד שלנו — הזיווג מול ההפרש בפועל
      const f = remFix(vi2)[n];
      if (f) pins.push([String(f[0]), n, f[2], f[3]]); else unplaced.push(n);
    });
    return { unplaced,
      pins: pins.filter((p) => p[2] != null && p[3] != null).filter((p) =>
        // מק"ט שהוחלף: תחנה באותו שם ואותו מיקום עדיין בקו — לא מציירים
        // עליה סיכת "ירדה" אדומה שנראית כאילו התחנה בוטלה
        !((gv2 && gv2.stops) || []).some((s) => s && s[1] === p[1] &&
          Math.abs(s[2] - p[2]) < 0.005 && Math.abs(s[3] - p[3]) < 0.005)) };
  };
  const splitRenumbers = (add, rem, i) => {
    const a = (add || []).map((e) => ({ ...e, used: false }));
    const moves = []; const rest = [];
    const oldByName = (n2) => {
      const top = Math.min(i, vs.length - 1);
      for (let j = top - 1; j >= 0; j--) { const h = (vs[j].stops || []).find((s) => s && s[1] === n2); if (h) return h; }
      return remFix(i)[n2] || null;
    };
    const curStops = vs[Math.min(i, vs.length - 1)].stops || [];
    for (const e of rem || []) {
      const bare = !e.c && /^\d{3,}$/.test(e.n);
      // קודם לפי המספר המדויק כשנשמר; חיפוש-שם רק לרשומות ישנות בלעדיו
      const oldStop = (e.c && stopByCode(e.c, i)) || (bare ? stopByCode(e.n, i) : oldByName(e.n));
      const oldName = bare || (e.c && /^\d{3,}$/.test(e.n)) ? (oldStop && oldStop[1]) : e.n;
      const x = oldName && a.find((y) => !y.used && y.n === oldName);
      const newStop = x && ((x.c && curStops.find((s) => s && String(s[0]) === x.c)) ||
        curStops.find((s) => s && s[1] === oldName));
      const near = oldStop && newStop && String(oldStop[0]) !== String(newStop[0]) &&
        Math.abs(oldStop[2] - newStop[2]) < 0.005 && Math.abs(oldStop[3] - newStop[3]) < 0.005;
      if (near) { x.used = true; moves.push({ name: oldName, from: String(e.c || oldStop[0]), to: String(newStop[0]) }); }
      else rest.push(e);
    }
    return { moves, add: a.filter((x) => !x.used).map((x) => ({ n: x.n, c: x.c })), rem: rest };
  };
  const v = vs[sel] || vs[vs.length - 1];
  // ברירת המחדל היא הגרסה הקודמת הסמוכה; במצב השוואה חופשית המשתמש בוחר
  // גרסת בסיס אחרת וכל ההפרש — הרשימה, המפה והמסלול — נמדד מולה.
  const vi = vs.indexOf(v);
  const cmpOn = cmpI != null && cmpI !== vi && cmpI >= 0 && cmpI < vs.length;
  const pi = cmpOn ? cmpI : vi - 1;
  const pv = pi >= 0 ? vs[pi] : null;
  // הפרש התחנות מחושב מהרשימות עצמן — במצב השוואה אי אפשר להסתמך על
  // add/rem ששמורים על הגרסה, כי הם נמדדו מול הגרסה הקודמת ולא מול הבסיס.
  const stopsAt = (idx, dir) => {
    for (let j = idx; dir < 0 ? j >= 0 : j < vs.length; j += dir) {
      if ((vs[j].stops || []).length) return vs[j].stops;
    }
    return null;
  };
  const cmpDiff = (() => {
    if (!cmpOn) return null;
    const a = stopsAt(pi, -1), b = stopsAt(vi, -1);
    if (!a || !b) return null;
    const ac = new Set(a.map((x) => x[0])), bc = new Set(b.map((x) => x[0]));
    return {
      add: b.filter((x) => !ac.has(x[0])),
      rem: a.filter((x) => !bc.has(x[0])),
      from: vs[pi].d, to: vs[vi].d,
    };
  })();
  // גרסת ארכיון בלי גאומטריה אך עם רצף תחנות (שלב ב') — קו מקורב בין התחנות.
  const toPts = (x) => { if(x.shp)return decodeShape(x.shp); const pts=(x.stops||[]).filter(s=>Number.isFinite(s[2])&&Number.isFinite(s[3])).map(s=>[s[2],s[3]]);return pts.length>1?pts:null; };
  // במצב השוואה מעניין מצב הקו בשני התאריכים, לא האירוע עצמו: אירוע לו"ז
  // אינו נושא גאומטריה, ובלי זה המפה לא הייתה נפתחת כלל בהשוואה.
  const geoAt = (idx) => {
    for (let j = idx; j >= 0; j--) if ((vs[j].stops || []).length || vs[j].shp) return vs[j];
    return null;
  };
  // אירוע בלי גאומטריה משלו — "הווריאנט הופיע ברישום", "בוטל" — הציג
  // "אין פירוט" גם כשלקו יש מסלול מתועד. בקשת שלמה: שתיפתח מפה גם בתיעוד
  // הראשון וגם באחרון. לוקחים את הגרסה הגיאומטרית הקרובה — אחורה ואם אין
  // אז קדימה (התיעוד הראשון של קו מהארכיון הוא לרוב אירוע-רישום, והצילום
  // עם המסלול נוסף אחריו) — ואומרים מאיזה תאריך המפה.
  const geoNear = (idx) => {
    const back = geoAt(idx);
    if (back) return back;
    for (let j = idx + 1; j < vs.length; j++) if ((vs[j].stops || []).length || vs[j].shp) return vs[j];
    return null;
  };
  const ownGeo = !!(v.shp || (v.stops || []).length > 1);
  // שינוי שתוכנן ולא יצא לפועל (שלמה 03.09: "כל שינוי שלא נכנס אמור להיות
  // מפה"): המפה מציגה את המסלול שתוכנן (pstops) במקווקו, ואת המסלול בפועל
  // של הווריאנט, אם היה כזה, כרקע אפור — בלי סימוני נוספו/ירדו, כי זה לא
  // שינוי שקרה אלא תוכנית שירדה.
  const plannedV = !cmpOn && v.k === "planned-dropped" && (v.pstops || []).length > 1;
  const actualV = plannedV ? geoNear(vi) : null;
  // מה בדיוק לא יצא לפועל (שלמה 03.09: "חוץ מתחנות אני לא מבין מה היה שונה"):
  // 'new' = הווריאנט כולו פורסם עם תאריך התחלה ולא התחיל בו (המסלול עצמו
  // יכול להיות זהה למה שנסע אחר כך — אז מה שנפל הוא המועד); 'route' = תוכנית
  // לשנות מסלול קיים. ההבדל מול המסלול בפועל נמדד ברצף התחנות.
  const plKind = plannedV ? (v.pk || (/הווריאנט/.test(v.note || "") ? "new" : "route")) : null;
  const plDiff = plannedV && actualV && (actualV.stops || []).length ? (() => {
    const pc = new Set(v.pstops.map((s) => String(s[0]))), ac = new Set(actualV.stops.map((s) => String(s[0])));
    return { add: v.pstops.filter((s) => !ac.has(String(s[0]))), rem: actualV.stops.filter((s) => !pc.has(String(s[0]))) };
  })() : null;
  const plSame = !!plDiff && !plDiff.add.length && !plDiff.rem.length;
  const plInfo = plannedV ? plannedInfo(v, vi, vs) : null;
  const gv = plannedV ? { d: v.d, stops: v.pstops, shp: v.pshp || "" } : (cmpOn ? (geoAt(vi) || v) : (ownGeo ? v : (geoNear(vi) || v)));
  const borrowed = !cmpOn && !ownGeo && !plannedV && gv !== v;
  // "מקורב" נמדד על הגרסה שמצוירת בפועל — כשהמפה שאולה מגרסה אחרת,
  // הדיוק שלה הוא של אותה גרסה ולא של האירוע שנבחר
  const useNext = false, nextGeo = null;   // לקווים בלי שרטוט מסלול לא מציגים מסלול של קו אחר במקומו
  const approx = !useNext && !gv.shp && (gv.stops || []).length > 1;
  const cur = useNext ? nextGeo.pts : (toPts(gv) || []);
  // המסלול הקודם מוצג רק כשיש באמת מה להשוות: הגרסה מתעדת שינוי תחנות
  // (כולל הפרש-פער מול "תיעוד ראשון") או שינוי מסלול, או ששתי הגרסאות
  // מדויקות. בלי זה, קירוב-לפי-תחנות מול גאומטריה מלאה מצייר "מסלול ישן"
  // אדום שנראה כמו שינוי אמיתי כשהמסלול בכלל לא השתנה (בקשת שלמה).
  const ROUTE_KINDS = new Set(["route", "redraw", "extend", "shorten", "terminal", "stops", "stops-add", "stops-del"]);
  // צילום מהארכיון / תיעוד-ראשון אינו שינוי: המפה נפתחת נקייה — בלי
  // שכבת "לפני" ובלי סימוני נוספו/ירדו שנראים כאילו קרה משהו (דיווח
  // שלמה, קו 26). כפתור "השווה" עדיין זמין למי שרוצה להשוות במפורש.
  const snapOnly = (v.k === "snapshot" || v.k === "baseline" || v.k === "times")
    && !(v.add || []).length && !(v.rem || []).length;
  // השוואה מפורשת ("השווה") עובדת תמיד — חסימת הצילומים חלה רק על
  // ההשוואה האוטומטית של הכרטיס (התיקון הקודם שבר את ההשוואה, שלמה)
  const comparable = !plannedV && (cmpOn || (!!pv && !snapOnly &&
    (!!(v.add || v.rem) || ROUTE_KINDS.has(v.k) || !!(v.shp && pv.shp))));
  // הגרסה הסמוכה עשויה להיות אירוע-רישום בלי רצף תחנות — ואז "המסלול
  // הקודם" והתחנות שירדו לא צוירו כלל (הבאג שצילם שלמה בקו 35 אשדוד).
  // שואלים את התיעוד הגיאומטרי האחרון שלפני האירוע, כמו במצב השוואה.
  const pgv = plannedV ? actualV : (cmpOn ? (geoAt(pi) || pv)
    : (pv && !(pv.stops || []).length && !pv.shp ? (geoAt(pi) || pv) : pv));
  const prev = plannedV ? (actualV ? toPts(actualV) : null) : (comparable ? toPts(pgv) : null);
  const prevApprox = !!(pgv && prev && !pgv.shp);
  // קובץ 2012 מקבץ את כל הווריאנטים הארציים של המספר — מציגים רק את
  // הרלוונטיים לקו הפתוח (חפיפת מילים עם התחנות/היעד), עם אפשרות לחשוף הכל
  const rel12 = (() => {
    const routes = (d12 && d12.routes) || [];
    if (routes.length <= 1) return routes.map((_, i) => i);
    // התאמת עיר: וריאנט 2012 רלוונטי רק אם עיר של תחנת קצה שלו ("שם - עיר")
    // מופיעה ביעד או בתחנות של הקו הפתוח. מילים גנריות ("תחנה מרכזית",
    // "הרצל") הטעו את הסינון הקודם והכניסו וריאנטים מערים אחרות.
    const hay = String(lf.dest || "") + " " +
      (([...vs].reverse().find((x) => (x.stops || []).length) || {}).stops || []).map((s) => s[1]).join(" ");
    const cityOf = (x) => { const p = String(x || "").split(" - "); return p.length > 1 ? p[p.length - 1].trim() : null; };
    const passCity = (r) => { const a = cityOf(r.f), b = cityOf(r.l); return !!((a && hay.includes(a)) || (b && hay.includes(b))); };
    let rel = routes.map((r, i) => [r, i]).filter((x) => passCity(x[0])).map((x) => x[1]);
    if (!rel.length) {
      const GEN = new Set(["תחנה", "תחנת", "מרכזית", "רכבת", "צומת", "מסוף", "מרכז",
        "קניון", "שוק", "בית", "שדרות", "כביש", "כיכר", "ככר", "דרך", "רחוב"]);
      const tokset = new Set(hay.split(/[^א-ת0-9]+/).filter((w) => w.length >= 3 && !GEN.has(w)));
      const sc = (r) => String((r.f || "") + " " + (r.l || "")).split(/[^א-ת0-9]+/)
        .filter((w) => w.length >= 3 && tokset.has(w)).length;
      rel = routes.map((r, i) => [sc(r), i]).filter((x) => x[0] > 0).map((x) => x[1]);
    }
    return rel.length ? rel : routes.map((_, i) => i);
  })();
  const vis12 = rel12;
  const sel12 = vis12.includes(r12) ? r12 : (vis12[0] ?? 0);
  // מסלול 2012 למפה: רק כשהפאנל פתוח, ורק תחנות שהוצלבו (יש להן קואורדינטות)
  const stops12 = (show12 && d12 && (d12.routes || []).length)
    ? ((d12.routes[sel12] || d12.routes[0]).stops || []).filter((s) => s.length >= 7).map((s) => [s[1], s[5], s[6], s[7] === 1, s[4] && s[4][0]])
    : null;
  const sh12 = (stops12 && s12 && s12.routes && s12.routes[String(sel12)]) || null;
  const shape12 = sh12 ? decodeShape(sh12.pl) : null;
  // כשפותחים את 2012 המפה מציגה רק את מסלול 2012; כפתור מחזיר את שתי השכבות יחד
  const m12only = !!(show12 && only12 && stops12 && stops12.length);
  // גודל הרכב, סוג הקו והנגישות — בשורת הפרטים, ובתצוגה החדשה גם בכותרת הקו (שלמה 08.10: "לאן נעלם סוג הרכב ונגישות")
  const vehEl = (() => {
    // ביטוי אחד: "מיניבוס עירוני נגיש" — גודל הרכב וסוג הקו מרישוי משרד
    // התחבורה, והנגישות מהפיד הארצי (שלמה 06.09: "פשוט לרשום מיניבוס עירוני
    // נגיש"). "אוטובוס" נשאר כמילה כי "אוטובוס עירוני נגיש" קריא; "לא מוגדר"
    // לא נכתב — נשאר רק סוג הקו.
    const VSZ = { "אוטובוס": "אוטובוס", "מפרקי": "אוטובוס מפרקי", "מיניבוס": "מיניבוס", "מידיבוס": "מידיבוס" };
    const what = [VSZ[lf.vsz] || "", lf.vt || ""].filter(Boolean).join(" ");
    if (lf.wa !== "1" && lf.wa !== "2")
      return what ? <span className="vsz" title="גודל הרכב וסוג הקו שנקבעו לקו ברישוי משרד התחבורה"> · 🚌 {what}</span> : null;
    const chg = [...vs].reverse().find((v) => v.k === "access" || String(v.note || "").includes("הנגישות שוּנתה"));
    const since = chg ? " מאז " + fmtD(chg.d) : "";
    const tip = (lf.wa === "1" ? "לפי הפיד הארצי, הקו מונגש לכיסא גלגלים" : "לפי הפיד הארצי, הקו אינו מונגש לכיסא גלגלים")
      + (chg ? " — השינוי נקלט בפיד ב-" + fmtD(chg.d) : "") + (what ? " · גודל הרכב וסוג הקו לפי רישוי משרד התחבורה: " + what : "");
    // סמל הנגישות רק כשהקו נגיש; לקו שאינו נגיש — סמל אוטובוס והמילים (שלמה 06.09)
    if (lf.wa === "1") return <span className="wa yes" title={tip}> · ♿ {what ? what + " " : ""}נגיש{since}</span>;
    return <span className="wa no" title={tip}> · {what ? "🚌 " + what + " · " : ""}אינו נגיש{since}</span>;
  })();
  // כרטיס המפה והפרטים של הגרסה שנבחרה. בתצוגה החדשה בטלפון הוא עובר לתוך כרטיס השינוי שנבחר
  const mainEl = (
      <div className="card main" ref={detailRef}>
        <div className="vhead">
          {plannedV ? (plKind === "new" ? <>קו שפורסם להתחלה ב-<b>{fmtD(v.ps)}</b> ולא נכנס לפעול</> : <>שינוי תחנות שפורסם ל-<b>{fmtD(v.ps)}</b> ולא נכנס לפעול</>)
            : cmpOn ? <>השוואה שביקשת: <b>{evDate(v).txt}</b> מול <b>{evDate(pv).txt}</b></>
            : <>גרסת <b>{evDate(v).txt}</b>{prev ? <> מול הגרסה שלפניה (<b>{evDate(pv).txt}</b>)</> : pv ? "" : " — הגרסה המתועדת הראשונה"}</>}
        </div>
        {plannedV && (
          <div className="mut">
            {v.pc && v.ps && v.pc >= v.ps ? <>ירד מהרישום ב-<b>{fmtD(v.pc)}</b></> : <>בוטל ב-<b>{fmtD(v.pc || v.d)}</b>, לפני המועד</>}
            {v.pf ? <> · פורסם לראשונה ב-{fmtD(v.pf)}</> : null}
            {" · "}המסלול שתוכנן במקווקו{actualV
              ? (actualV === plInfo.base
                ? <>; המסלול שהקו נסע בו לפני התוכנית ({plInfo.removedAt ? <>עד {fmtD(plInfo.removedAt)}</> : <>מ-{fmtD(actualV.d)}</>}) באפור</>
                : <>; המסלול שנכנס בפועל, מ-{fmtD(actualV.d)}, באפור</>)
              : <>; הווריאנט לא נסע מעולם</>}.
          </div>
        )}
        {plannedV && (
          <div className="mut" style={{ fontWeight: 700 }}>
            {plKind === "new"
              ? (plInfo.entered ? <>מה לא יצא לפועל: מועד ההתחלה בלבד. הווריאנט התחיל ב-{fmtD(plInfo.entered.d)} באותו מסלול, ולכן שתי השכבות במפה חופפות.</>
                : plInfo.changed ? <>מה לא יצא לפועל: הווריאנט במסלול הזה. בפועל התחיל ב-{fmtD(plInfo.changed.d)} במסלול שונה.</>
                : plInfo.base ? <>מה לא יצא לפועל: חזרת הווריאנט. {plInfo.removedAt ? <>נסע עד {fmtD(plInfo.removedAt)}</> : <>תועד נוסע לאחרונה ב-{fmtD(plInfo.base.d)}</>}, פורסם לחזור ב-{fmtD(v.ps)} ולא חזר.</>
                : <>מה לא יצא לפועל: הווריאנט כולו. פורסם עם תאריך התחלה, ירד לפני שהתחיל ולא נסע מעולם.</>)
              : (plInfo.entered ? <>מה לא יצא לפועל: המועד בלבד. השינוי נכנס בסוף ב-{fmtD(plInfo.entered.d)}.</>
                : plInfo.changed ? <>מה לא יצא לפועל: השינוי שמפורט כאן. מה שנכנס ב-{fmtD(plInfo.changed.d)} היה שונה ממנו.</>
                : plInfo.goneAt ? <>מה לא יצא לפועל: השינוי שמפורט כאן. הקו עצמו ירד מהרישום ב-{fmtD(plInfo.goneAt)}.</>
                : <>מה לא יצא לפועל: השינוי שמפורט כאן. {plInfo.base ? "המסלול נשאר כפי שהיה." : "עד היום לא נכנס."}</>)}
            <div className="sub" style={{ fontWeight: 400 }}>
              <PlanLines p={plInfo} max={20} />
            </div>
          </div>
        )}
        {/* אי-הוודאות אינה בפער שבין שתי הגרסאות: המנוע עובר על כל צילומי
            הארכיון, ולכן פער ארוך בין גרסאות פירושו שהמסלול באמת לא השתנה
            לאורכו. אי-הוודאות היחידה היא המרווח בין שני צילומים סמוכים,
            וזה בדיוק מה ש-'sd' מודד. */}
        {!cmpOn && !evDate(v).exact && (
          <div className="gapwarn">
            <TipTag cls="mut" tip={evDate(v).tip}>תאריך משוער</TipTag>
          </div>
        )}
        {v.src === "websiteArchive" ? (() => {
          // מפת מקור שנשמרה: הנקודות אמיתיות, ורק הדרך ביניהן משוערת — מוצגת רק כשחושבה על הכבישים (שלמה 03.10)
          const est = v.websiteMapEstimate, savedRoad = !!(est?.savedPoints && est.shape);
          return <div className="website-capture">
            <p>צילום מאתר מידע לנוסעים שנשמר ב־{fmtD(v.d)}. זהו מועד התיעוד בארכיון, ולא מועד פתיחת הקו או שינוי בתחנות.</p>
            <div className="facts">{(v.stops || []).length} {v.websitePartial ? "נקודות מתועדות" : "תחנות"}
              {est && !est.savedPoints && <> · {est.matched} תחנות הוצלבו למיקום</>}
              {" · "}<a href={v.sourceUrl} target="_blank" rel="noopener noreferrer">צפייה בצילום המקור ↗</a>
            </div>
            {v.websitePartial && <p>זהו תיעוד חלקי של הנקודות שנשמרו במפת המקור. הוא אינו רשימת התחנות המלאה של הקו.</p>}
            {est?.matched >= 2 && (!est.savedPoints || savedRoad) && <div className="website-estimate">
              <Map2012 stops={v.websiteMapEstimate.stops} shape={v.websiteMapEstimate.shape ? decodeShape(v.websiteMapEstimate.shape.pl) : null} year={v.d.slice(0,4)} estimatedLocations={true} />
              <div className="legend">
                <span><i style={{borderColor:"#78350f",borderStyle:"dashed"}} />{v.websiteMapEstimate.shape
                  ? `מסלול משוער — חישוב על כבישי היום דרך ${v.websiteMapEstimate.shape.n} מ-${v.websiteMapEstimate.total} ${est.savedPoints ? "הנקודות שנשמרו במקור" : "התחנות"}, כ-${(v.websiteMapEstimate.shape.m/1000).toFixed(1)} ק"מ`
                  : `מסלול משוער — קו ישר דרך ${v.websiteMapEstimate.matched} מ-${v.websiteMapEstimate.total} התחנות שהוצלבו`}</span>
                <span><i className="dot" style={{background:"#16a34a"}} />ראשונה</span>
                <span><i className="dot" style={{background:"#dc2626"}} />אחרונה</span>
              </div>
            </div>}
            {!savedRoad && (v.stops || []).some(s=>Number.isFinite(s[2])&&Number.isFinite(s[3])) && <>
              <DiffMap pointsOnly={true} cur={[]} prev={null} approx={true} curStops={(v.stops || []).filter(s=>Number.isFinite(s[2])&&Number.isFinite(s[3]))} />
              <div className="legend"><span><i className="dot" style={{background:"#2563eb"}} />מיקומי תחנות שנשמרו במקור</span></div>
            </>}
            <ol className="s12">{(v.stops || []).map((s,i)=>{
              const m=v.websiteMapEstimate?.stops?.[i];
              return <li key={i}>{s[1]}{" "}<span className="pcode">{Number.isFinite(s[2]) ? "מיקום מתועד במקור" : m?.length >= 7
                ? (m[4]?.length===1 ? "התאמה משוערת למק״ט "+m[4][0] : (m[4]?.length||0)+" מק״טים אפשריים") : "לא הוצלבה"}</span></li>;
            })}</ol>
            <div className="katnote">{savedRoad
              ? "ℹ️ הנקודות הן המיקומים שנשמרו במפת המקור. הדרך ביניהן משוערת: היא חושבה על כבישי היום לפי סדר הנקודות במקור, ואינה מתועדת במקור."
              : est && !est.savedPoints
              ? "ℹ️ המפה משוערת: מיקומי התחנות הוצלבו לרישום מאוחר, ותחנה שלא הוצלבה לא מוצגת."
              : (v.stops || []).some(s=>Number.isFinite(s[2])) ? "ℹ️ הנקודות הן המיקומים שנשמרו במקור. לא שורטט ביניהן מסלול נסיעה משוער." : "ℹ️ במקור נשמרו שמות תחנות ללא מיקומים. הצלבה למיקום נדרשת לפני הצגת מפה משוערת."}</div>
          </div>;
        })() : v.k === "times" && v.tb ? (
          /* הלו"ז האחרון של קו מבוטל — צילום מהארכיון (בקשת המשתמש): קו
             שבוטל בלי שום אירוע לו"ז מקבל, שנה אחרי הביטול, את שעות-היציאה
             שלו מיום-הארכיון האחרון שבו פעל */
          <div className="tsnap-wrap">
            <div className="mut">ℹ️ {noteFix(v.note)} — נכון ל-{fmtD(v.d)}, היום האחרון שבו הקו מופיע בארכיון.</div>
            <table className="tsnap"><tbody>
              {v.tb.map(([label, ts]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>{ts.split(",").map((t, ti) => <span key={ti} className="tt">{t}</span>)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ) : !gv.shp && !((gv.stops || []).length > 1) ? (
          <div className="nogeo">
            ℹ️ {noteFix(v.note) || "אין פירוט לגרסה זו"}<br />
            <span className="mut">רשומת-עבר מארכיון אופן באס (הסדנא לידע ציבורי) — המסלול המדויק לא זמין לתקופה זו. רצף התחנות יושלם במילוי הלילי משלב ב׳.</span>
          </div>
        ) : (<>
        {/* ההשוואה עונה על "מה השתנה", אבל לא על "איך הקו נראה עכשיו" —
            שתי השכבות יחד מקשות לקרוא את המסלול עצמו. הכפתור מסיר את
            שכבת העבר ומשאיר את המסלול המלא כפי שהוא אחרי השינוי. */}
        {!m12only && prev && !plannedV && (
          <div className="onlycur">
            <button className={"kchip" + (onlyCur ? "" : " on")}
              style={onlyCur ? {} : { borderColor: "#7c3aed", color: "#5b21b6" }}
              onClick={() => setOnlyCur(false)}>⇄ מה השתנה</button>
            <button className={"kchip" + (onlyCur ? " on" : "")}
              style={onlyCur ? { borderColor: "#7c3aed", color: "#5b21b6" } : {}}
              onClick={() => setOnlyCur(true)}>🚌 המסלול המלא אחרי השינוי</button>
          </div>
        )}
        {/* חלונית 2012 פתוחה: ברירת המחדל היא מסלול 2012 לבד, כי שתי השכבות
            יחד מקשות לקרוא איך הקו נסע אז; הכפתור השני מציג את שתיהן. */}
        {show12 && stops12 && stops12.length > 0 && (
          <div className="onlycur">
            <button className={"kchip" + (only12 ? " on" : "")}
              style={only12 ? { borderColor: "#78350f", color: "#78350f" } : {}}
              onClick={() => setOnly12(true)}>🕰️ רק מסלול 2012</button>
            <button className={"kchip" + (only12 ? "" : " on")}
              style={only12 ? {} : { borderColor: "#78350f", color: "#78350f" }}
              onClick={() => setOnly12(false)}>⇄ 2012 והיום יחד</button>
          </div>
        )}
        {!m12only && borrowed && (
          <div className="mut">ℹ️ האירוע עצמו אינו נושא מסלול — המפה מציגה את המסלול המתועד
            {gv.d < v.d ? " האחרון לפני האירוע" : " הראשון אחרי האירוע"}, מ-{fmtD(gv.d)}.</div>
        )}
        {!m12only && !cmpOn && !onlyCur && !plannedV && prev && pgv !== pv && (
          <div className="mut">ℹ️ לגרסה הקודמת הסמוכה אין רצף תחנות מתועד — "המסלול הקודם" והתחנות שירדו מוצגים מהתיעוד האחרון שלפני האירוע, מ-{fmtD(pgv.d)}.</div>
        )}
        {/* addedCodes: codeOf מצפה לאינדקס גרסה (vi) — האינדקס בתוך רשימת
            ➕ גרם לסריקה מהגרסאות הישנות ביותר, ותחנה עם שם זהה ומק"ט אחר
            מהעבר קיבלה את הסימון הירוק במקום התחנה שבאמת נוספה */}
        <DiffMap key={v.d + v.k + (cmpOn ? "c" + cmpI : "") + (onlyCur ? "o" : "") + (m12only ? "12" : "")}
          cur={m12only ? [] : cur} prev={onlyCur || m12only ? null : prev} planned={plannedV && !m12only}
          approx={cmpOn ? !gv.shp : approx} prevApprox={prevApprox} curStops={m12only ? [] : gv.stops}
          prevStops={m12only ? null : plannedV ? (plDiff && !plSame ? actualV.stops : null) : (!onlyCur && comparable && pgv && (pgv.stops || []).length ? pgv.stops : null)}
          addedCodes={!m12only && !onlyCur && (!pv || !(pv.stops || []).length) && (v.add || []).length
            ? new Set((v.add || []).map((n, j) => (v.ac && v.ac[j] != null ? String(v.ac[j]) : codeOf(n, vi, true))).filter(Boolean)) : null}
          stops12={onlyCur ? null : stops12} shape12={onlyCur ? null : shape12}
          sg={onlyCur || cmpOn || m12only ? null : (v.sg || null)}
          plats={m12only ? null : rdPlat}
          nowNames={(gv.foiNames || (pgv && pgv.foiNames)) ? new Set([...(gv.foiNames || []), ...((pgv && pgv.foiNames) || [])].map(String)) : null}
          remPins={onlyCur || cmpOn || m12only ? null : remPinsOf(v, vi, gv).pins} succ={useNext && !m12only} />
        {/* תחנה שירדה ואין לה מיקום באף מקור — נאמרת במפורש, לא נעלמת */}
        {!cmpOn && !onlyCur && !m12only && (() => {
          const un = remPinsOf(v, vi, gv).unplaced
            .filter((n) => !(((pgv && pgv.stops) || []).some((s) => s && s[1] === n)));
          return un.length ? (
            <div className="mut">ℹ️ תחנות שירדו שאין להן מיקום באף תיעוד, ולכן אינן מסומנות במפה: {un.join(", ")}</div>
          ) : null;
        })()}
        <div className="legend">
          {m12only ? null : plannedV ? <>
            <span><i style={{ borderColor: "#9f1239", borderStyle: "dashed" }} /> המסלול שתוכנן ולא יצא לפועל</span>
            {prev && <span><i style={{ borderColor: "#475569" }} /> המסלול בפועל של הווריאנט</span>}
            {plDiff && !plSame && <span><span className="dot" style={{ background: "#16a34a" }} /> תחנה שתוכננה ואינה במסלול בפועל</span>}
            {plDiff && !plSame && <span><span className="dot" style={{ background: "#fff", border: "3px solid #dc2626" }} /> תחנה במסלול בפועל שלא הייתה בתוכנית</span>}
          </> : <>
          {prev && !onlyCur && <span><i style={{ borderColor: "#dc2626", borderStyle: "dashed" }} /> המסלול הקודם{prevApprox ? " (מקורב לפי תחנות)" : ""}</span>}
          {useNext ? <span><i style={{ borderColor: "#0e7490", borderStyle: "dashed" }} /> המסלול לפי הקו שהמשיך ({nextGeo.d.slice(0, 4)})</span>
            : <span><i style={{ borderColor: prev && !onlyCur ? "#16a34a" : "#4c1d95" }} /> {prev && !onlyCur ? "המסלול החדש" : "המסלול"}</span>}
          <span><span className="dot" style={{ background: "#16a34a" }} /> תחנה שנוספה</span>
          <span><span className="dot" style={{ background: "#fff", border: "3px solid #dc2626" }} /> תחנה שירדה</span>
          </>}
          {stops12 && stops12.length > 1 && <span><i style={{ borderColor: "#78350f", borderStyle: "dashed" }} /> {sh12
            ? `מסלול משוער 2012 — חישוב על כבישי היום דרך ${sh12.n} מ-${sh12.tot} התחנות שמיקומן ידוע`
            : "מסלול 2012 (קו ישר דרך התחנות שהוצלבו)"}</span>}
        </div>
        {!cmpOn && !onlyCur && !m12only && v.sg && ((v.sg.n || []).length + (v.sg.o || []).length > 0) && (
          <div className="mut">🔍 הקטע ששונה שורטט במדויק מצילומי הארכיון — אדום מקווקו = הקטע הישן, ירוק = החדש. שאר המסלול עשוי להיות מקורב.</div>
        )}
        {v.shpref
          ? <div className="mut">ℹ️ רצף התחנות בצילום זהה לגרסה הסמוכה — מוצג המסלול המלא שלה במקום קו מקורב. {(v.stops || []).length} תחנות בגרסה זו.</div>
          : plannedV
          ? <div className="mut">ℹ️ {gv.shp ? "השרטוט המלא של המסלול שתוכנן, כפי שפורסם בפיד" : "המסלול שתוכנן מצויר כקו ישר בין התחנות — לתוכנית הזו לא נשמר שרטוט"}.</div>
          : useNext
          ? <div className="mut">ℹ️ בנתוני משרד התחבורה אין שרטוט מסלול. המפה מציגה את המסלול של <a href={lineHref(lf.foiNext.rd)}>קו {lf.foiNext.line}</a> כפי שנרשם ב-{fmtD(nextGeo.d)}, אחרי שהקו המשיך במק״ט אחר; ייתכן שהמסלול לפני כן היה שונה.</div>
          : approx
          ? <div className="mut">ℹ️ מסלול מקורב: קו ישר בין התחנות, כי לתקופה הזו אין שרטוט. {(gv.stops || []).length} תחנות{borrowed ? " בגרסה המוצגת" : " בגרסה זו"}.</div>
          : <div className="mut">{(gv.stops || []).length} תחנות{borrowed ? " בגרסה המוצגת" : " בגרסה זו"}.</div>}
        {((gv.foiNames || []).length > 0 || ((pgv && pgv.foiNames) || []).length > 0) && <div className="mut">ℹ️ <TipTag cls="mut" tip="שם התחנה כפי שהוא רשום היום — השם בתקופה הזו לא ידוע">שם עדכני</TipTag> — שם התחנה כפי שהוא רשום היום; השם בתקופה הזו לא ידוע{(gv.foiNames || []).length ? ` (${gv.foiNames.length} תחנות בגרסה הזו)` : ""}.</div>}
        </>)}
        {(v.tl || v.tn) && <TimesDiff tl={v.tl} tn={v.tn} />}
      </div>
  );
  // רשימת התחנות של החלופה, לפי הגרסה האחרונה שיש לה רצף תחנות
  return (
    <div className={"linewrap" + ("")}>
      {<>
      <div className="card side">
        {<BackLink href={backHref} onBack={onBack} title="חזרה למסך החיפוש — הטקסט שחיפשתם נשמר">→ חזרה לחיפוש</BackLink>}
        {/* לקווי הרכבת אין מספר קו ב-GTFS — הסמל ממלא את מקומו כדי שהתג לא יופיע ריק */}
        <div className="linehead"><span className="badge">{lf.line || TT_ICON[lf.tt] || "—"}</span><span className="dest">{taxiName(lf) || destShow(lf.dest)}{taxiName(lf) && <small className="taxidest">{destShow(lf.dest)}</small>}</span>
          
          {why && <a className="whymark" href="#why" title="למה הרכבת הזו פעלה רק זמן קצר?"
            onClick={(e) => { e.preventDefault(); const t = document.getElementById("why"); if (t) t.scrollIntoView({ block: "center" }); }}>!</a>}
          {/* שיתוף כמו בהקו המדלג: גיליון השיתוף של הטלפון, ובנפילה — העתקה */}
          <button className="sharebtn" title="שיתוף הקישור לעמוד הקו הזה — כל ההיסטוריה שלו"
            onClick={(e) => {
              // דף-שיתוף ייעודי: מציג בוואטסאפ את שם הקו וסמל האתר, ומקפיץ לדף (בקשת שלמה)
              const url = location.origin + location.pathname.replace(/line-history\/?[^/]*$/, "") + "s/l-" + ssafe(rd) + ".html";
              const b = e.currentTarget;
              // "הועתק" רק אחרי שההעתקה באמת הצליחה; בגיליון השיתוף של
              // הטלפון אין מה להכריז (ציד הבאגים, סבב ב)
              if (navigator.share) { navigator.share({ title: "הקו בזמן — " + (lf.line ? "קו " + lf.line : taxiName(lf) || lf.dest), url }).catch(() => {}); return; }
              const t = b.textContent;
              const done = () => { b.textContent = "✓ הועתק"; setTimeout(() => { b.textContent = t; }, 1500); };
              if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt("העתקה ידנית:", url));
            }}>{"🔗 שיתוף"}</button>
          {/* מעקב לפי קו בודד הוסר (בקשת שלמה 25.08) — הרשמה ברמת עיר בלבד;
              מדף הקו בוחרים סוגי שינוי ותדירות, כמו במרכז (שלמה 13.09) */}
          {/* צילום אתר מידע: היעד הוא "לכיוון X" ולא "מוצא<->יעד", והקו לא ישתנה עוד — בלי הרשמה */}
          {!lf.observationOnly && !String(lf.rd || rd).startsWith("website") && <LineFollow cities={destCities(lf.dest)} />}
        </div>
        {/* "עירוני" פעם אחת בלבד (שלמה 06.09): כשהוא מופיע ליד "נגיש" — התג הנפרד לא מוצג */}
        {/* סוג הקו מרשימת האשכולות של המשרד (ltc), ואם אין — מקובץ הנוסעים (ty); ייחודיות
            (תלמידים/לילה/מזין) ואשכול המכרז — tools/linehistory_ltype.py (שלמה 07.09) */}
        {why && <div className="whybox" id="why">
          <b><span className="whymark">!</span> למה הרכבת הזו?</b> {why.text}{" "}
          <span className="mut">פעלה {fmtD(why.first)} – {fmtD(why.last)}.</span>{" "}
          <a href={why.url} target="_blank" rel="noopener noreferrer">המקור: {why.source}{why.published ? ", " + fmtD(why.published) : ""} ←</a>
        </div>}
        <div className="facts">{lf.op}{(() => { const t = lf.ltc || lf.ty; return t && !(lf.vt && lf.vt.startsWith(t)) ? " · " + t : ""; })()}
          {lf.un && lf.un !== "סדיר" ? " · " + ({ "תלמידים": "קו תלמידים", "לילה": "קו לילה", "קווים מזינים": "קו מזין" }[lf.un] || lf.un) : ""}
          {lf.clu ? <> · <TipTag cls="" tip="אשכול = חבילת המכרז שבה הקו מופעל">אשכול</TipTag> {lf.clu}</> : ""}{lf.tt ? " · " + (TT_LABEL[lf.tt] || "") : ""}
          {/* רציף המוצא לא בשורת הפרטים — רק ליד התחנה ברשימה ובמפה (שלמה 13.09) */}
          {/* נגישות לכיסא גלגלים מגיעה מ-wheelchair_accessible בפיד, והיא
              אחידה לכל נסיעות הקו — ולכן תכונה של הקו. אם תועד אירוע שינוי
              נגישות, התג מציין מאיזה תאריך המצב הנוכחי; שינוי שקרה יחד עם
              שינוי מסלול מסווג route/stops ולא access, ולכן הזיהוי נעזר גם
              בהערה. לקווים שלא נצפה בהם שינוי — תג בלי תאריך, לא תאריך מומצא. */}
          {/* גודל הרכב וסוג הקו מהרישוי נכתבים בביטוי אחד ליד הנגישות —
              "מיניבוס עירוני נגיש" (שלמה 06.09); שינויים בהם — קטגוריה בציר הזמן */}
          {vehEl}
          {/* כמה נסיעות מתוכננות יש לחלופה היום. "קיים בפיד" אינו "פועל":
              הפיד מפרסם קווים לפני הפתיחה, והקו הירוק בירושלים נכנס עם
              נסיעה אחת בכיוון מול 680 של הקו הירוק בתל אביב. המספר מוצג
              כעובדה ולא כמסקנה — שליש מהחלופות נוסעות ארבע פעמים ביום או
              פחות (קווי תלמידים, חלופות משנה), ואזהרה עליהן הייתה רעש. */}
          {ntr > 0 && (
            <span title="מספר הנסיעות המתוכננות לחלופה הזו בפיד של היום, לפי לוחות הזמנים שבתוקף">
              {" · "}{ntr === 1 ? "נסיעה אחת ביום" : `${ntr.toLocaleString()} נסיעות ביום`}</span>
          )}
          {!lf.observationOnly && mkTag(lf.rd)} · {vs.length} גרסאות מתועדות</div>
        <SuccBox rd={rd} />
        {lf.foiNext && <div className="succbox">➡️ הקו המשיך במק״ט אחר: <a href={lineHref(lf.foiNext.rd)}>קו {lf.foiNext.line}</a> (מונית שירות), מ-{fmtD(lf.foiNext.d)}.</div>}
        {/* תקופות שבהן הקו לא היה ברישום וחזר — כרטיס "בוטל וחזר" בציר הזמן
            (materializeLf), לא פס טקסט כאן (שלמה 06.09). ביטול שעדיין לא נגמר
            מוצג בהודעת הסטטוס למטה. */}
        {/* רק "שירות לפי דרישה" מקבל הערה, כי היא נושאת מידע שאינו במקום
            אחר: הקו יושב בין קווי האוטובוס ונראה רגיל לחלוטין, ואי אפשר
            לדעת ממנו שהנסיעה מותנית בהזמנה. לשאר הסוגים התווית בשורת
            הפרטים כבר אומרת הכל, והערה נוספת היא רעש. */}
        {lf.historicalOnly && <TipTag cls="mut" tip="הרשומה אינה קובעת אם הקו פועל היום">תיעוד היסטורי</TipTag>}
        {SHOW_2012_BOX && lf.magihim2012Match && <p><a href={"#2012/" + encodeURIComponent(lf.magihim2012Match.key)}>התאמה מוצעת לקו ברשת מגיעים מ־2012 ({lf.magihim2012Match.overlap}% חפיפת תחנות)</a></p>}
        {SHOW_2012_BOX && lf.earlyRelated?.length > 0 && <details className="early-detail"><summary>קובצי GTFS מקוריים מ־2012 לקווים תואמים</summary><p>התאמה לפי מספר קו וחפיפת תחנות לרשת מגיעים שכבר מקושרת לעמוד זה. אינה הוכחה לזהות רציפה לאורך השנים.</p>{lf.earlyRelated.map(e=><p key={e.rd}><a href={"#"+encodeURIComponent(e.rd)}>קו {e.line} · {e.dest}</a> · חפיפה {e.overlap}%</p>)}</details>}
        {lf.tt === "demand" && (
          <div className="ttnote">
            {/* הניסוח הקודם קבע ש"הנסיעה מבוצעת לפי הזמנה מראש". זו פרשנות
                של route_type 715, והנתונים שלנו סותרים אותה: ל-22 מתוך 61
                הקווים האלה מפורסם לוח זמנים עם שעות יציאה ממש. מה שידוע
                הוא הסיווג בפיד, לא אופן ההזמנה בפועל. */}
            🚐 <b title="הסיווג בפיד הארצי: route_type 715">שירות לפי דרישה</b>: ייתכן שצריך להזמין נסיעה מראש. כדאי לבדוק מול המפעיל.
          </div>
        )}
        {/* הלו"ז השבועי המלא. כשנבחר במפורש אירוע לו"ז/תדירות — במקומו טבלת לפני/אחרי של אותו יום.
            באירוע האחרון (שעליו נפתח הקו) תמיד מוצג, גם כשהוא עצמו שינוי לו"ז: אחרת קו עם שינוי
            יומי בתגבור נראה בלי לו"ז בכלל (שלמה 06.10, קו 470: "למה אין לו"ז?") */}
        {(sel == null || sel >= vs.reduce((l, x, i) => x.hid ? l : i, 0) || (v.k !== "sched" && v.k !== "freq")) && (lf.tt === "rail" ? <RailSched rd={rd} /> : <SchedBox rd={rd} vs={vs} gone={!!goneD} selD={sel != null && vs[sel] ? vs[sel].d : null}
          isLast={sel == null || sel >= vs.length - 1} />)}
        {SHOW_2012_BOX && mot12 && mot12.length > 0 && !NO_2012.has(lf.tt || "") && (
          <div className="a2012">
            <b>2012 · משרד התחבורה</b>{mot12.length > 1 ? ` · ${mot12.length} מסלולים תואמים` : ""}
            {mot12.map((x) => (
              <div key={x[0]} style={{ marginTop: 4 }}>
                {x[1].replace("<->", " ← ")} · {x[3]} תחנות
                <TipTag cls="a2012ov" tip="מספר התחנות (לפי מק״ט) שמופיעות גם במסלול של 2012 לפי קובץ משרד התחבורה וגם במסלול הישן ביותר שידוע לנו לקו הזה">· {x[4]} תחנות משותפות</TipTag>
                <a className="a2012btn" href={lineHref(x[0])} title="הקו כפי שהיה ביולי 2012 לפי קובץ משרד התחבורה — רצף התחנות והמסלול המקורי על המפה">המסלול ב-2012 ←</a>
              </div>
            ))}
            {anc && <div className="mut" style={{ marginTop: 4 }}>גם בצילום אתר מגיעים: <a href={"#2012/" + encodeURIComponent(anc.k)}>{anc.f} ← {anc.l}</a></div>}
          </div>
        )}
        {SHOW_2012_BOX && anc && !(mot12 && mot12.length) && !NO_2012.has(lf.tt || "") && (
          <div className="a2012">
            <b>2012</b> · {anc.f} ← {anc.l} · {anc.n} תחנות
            {/* מספר התחנות המשותפות הוא מה שקושר את הקו של אז לקו של היום.
                כשההתאמה נעשתה לפי שם ומספר קו בלבד הוא לא קיים. */}
            {anc.ov && <TipTag cls="a2012ov" tip="מספר התחנות שמופיעות גם במסלול של 2012 וגם במסלול הישן ביותר שידוע לנו — על סמך זה נקבע שמדובר באותו קו">· {anc.ov} תחנות משותפות</TipTag>}
            <button className="a2012btn" title="הצגת רשימת התחנות של הקו כפי שהייתה ב-2012 — כולל המסלול על המפה בקו מקווקו חום" aria-expanded={show12} onClick={() => setShow12(!show12)}>
              {show12 ? "הסתר ▲" : "רצף התחנות ▼"}
            </button>
            {show12 && (d12 ? (d12.routes || []).length ? (
              <div>
                {vis12.length > 1 && (
                  <div className="s12chips">{vis12.map((i) => (
                    <button key={i} className={"rchip12" + (i === sel12 ? " on" : "")} title="מסלול 2012 נוסף של אותו קו — לחיצה מציגה אותו"
                      onClick={() => setR12(i)}>{d12.routes[i].f} ← {d12.routes[i].l} ({d12.routes[i].n})</button>
                  ))}</div>
                )}
                <ol className="s12">
                  {((d12.routes[sel12] || d12.routes[0]).stops || []).map((s) => (
                    <li key={s[0]}>{s[1]}{" "}
                      {s[4] && s[4].length === 1 ? <span className="pcode">מק״ט {s[4][0]}</span>
                        : s[4] && s[4].length > 1 ? <span className="pcode">{s[4].length} מק״טים אפשריים</span>
                          : <span className="pcode">לא הוצלבה</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ) : <div className="mut">הנתונים לא נטענו — נסו לרענן.</div>
              : <div className="mut">טוען…</div>)}
          </div>
        )}
        {sibs && sibs.length > 1 && <SafeBox key={rd + '|' + (sel != null ? vs[sel]?.d : '')}><RailWrap rail={(lf || {}).tt === "rail"} rd={rd} onSwitch={onSwitch}><AlternativeSelector sibs={sibsShown} rd={rd}
          date={sel != null ? vs[sel]?.d : null} latest={sel == null || sel === vs.reduce((last, v, i) => (v.hid ? last : i), 0)} onSwitch={onSwitch} altRd={altRd} setAltRd={setAltRd} /></RailWrap></SafeBox>}
        {altRd && (
          <AltCompare rd={rd} altRd={altRd} onClose={() => setAltRd(null)}
            label={(sibs.find((x) => x.rd === altRd) || {}).dest || altRd} />
        )}
        {/* הסטטוס נגזר מהרשומה האחרונה שאינה "תוכנן ולא נכנס לתוקף": תוכנית
            להחזיר קו מבוטל שלא התממשה אינה מבטלת את הביטול */}
        {vs.length > 0 && (() => {
          // וגם לא אירוע נגזר (סוג רכב ברישוי) שתאריכו מאוחר מהביטול
          let li = vs.length - 1;
          while (li > 0 && (vs[li].k === "planned-dropped" || vs[li].syn)) li--;
          const lv = vs[li];
          // אותו כלל כמו ברשימה ובבורר (שלמה 28.09)
          const gd = variantGone(lv.k, lv.d, lf.historicalOnly, ntr, lf.observationOnly);
          const stale = gd && lv.k !== "removed";
          const since = stale ? <>(לא נצפה מאז {fmtD(gd)})</> : <>מאז {fmtD(gd)}</>;
          const dk = stale ? ((DATA_GEN ? new Date(DATA_GEN) : Date.now()) - new Date(gd) >= 365 * 864e5 ? "removed-year" : "removed-now") : dispKind(lv, li, vs);
          return gd && (
          <div className="facts" style={{ color: lineGone ? (KINDS[dk] || {}).color : "#c2410c", fontWeight: 700 }}>
            {lineGone
              ? <>❌ הקו בוטל — אין חלופות פעילות — {since}</>
              : <>⚠️ החלופה הזו מבוטלת {since} (לקו יש חלופות פעילות)</>}
            {dk === "removed-year" && !stale ? " — מעל שנה ולא חזרה" : ""}
          </div>);
        })()}
        {cmpOn && (
          <div className="cmpbar">
            <b>השוואה</b> · {String(vs[pi].d).split("-").reverse().join(".")} ← {String(v.d).split("-").reverse().join(".")}
            {cmpDiff && (
              <span className="cmpsum">
                {cmpDiff.add.length ? ` · ➕ ${cmpDiff.add.length} תחנות` : ""}
                {cmpDiff.rem.length ? ` · ➖ ${cmpDiff.rem.length} תחנות` : ""}
                {!cmpDiff.add.length && !cmpDiff.rem.length ? " · אותן תחנות בדיוק" : ""}
              </span>
            )}
            <button className="cmpx" title="סיום ההשוואה — חזרה להפרש מול הגרסה הקודמת" onClick={() => setCmpI(null)}>✕ סיום</button>
            <div className="dayhelp">לחיצה על אירוע אחר בציר משווה אותו מול הבסיס</div>
            {cmpDiff && (cmpDiff.add.length || cmpDiff.rem.length) ? (
              <div className="cmplist">
                {cmpDiff.add.length ? <div className="ad">➕ {dedupCount(cmpDiff.add).map(({ x, n: c }) => `${x[1]} (${x[0]})` + (c > 1 ? ` ×${c}` : "")).join(", ")}</div> : null}
                {cmpDiff.rem.length ? <div className="rm">➖ {dedupCount(cmpDiff.rem).map(({ x, n: c }) => `${x[1]} (${x[0]})` + (c > 1 ? ` ×${c}` : "")).join(", ")}</div> : null}
              </div>
            ) : null}
          </div>
        )}
        {kindsHere.length > 1 && !initCats && offK.size > 0 && (
          <div className="khint">🔎 שינויי לו״ז, תגבור ותיקוני רישום כבויים. לחיצה על קטגוריה מדליקה אותה, ו"הכול" מציג את כל השינויים.</div>
        )}
        {kindsHere.length > 1 && initCats && offK.size > 0 && (
          <div className="khint">🔎 מוצגים רק השינויים מהקטגוריה שבחרת בחיפוש. "הכול" מציג את כל השינויים בקו.</div>
        )}
        {kindsHere.length > 1 && (
          <div className="kfilter">
            <button className={"kchip" + (offK.size ? "" : " on")}
              title="הצגת כל סוגי השינויים בקו הזה" onClick={() => setOffK(new Set())}>הכול</button>
            {kindsHere.map(([g, e]) => {
              const off = [...e.kinds].every((k) => offK.has(k));
              return (
                <button key={g} className={"kchip" + (off ? " off" : " on")}
                  style={off ? null : { borderColor: catColor(g), color: catColor(g) }}
                  title={off ? "הדלקה — האירועים האלה יחזרו לרשימה" : "כיבוי — האירועים האלה ייעלמו מהרשימה"}
                  onClick={() => toggleK([...e.kinds], off)}>
                  {KGLABEL[g] || (KINDS[g] || {}).label || g} <b>{e.n}</b>
                </button>
              );
            })}
          </div>
        )}
        {months.length > 1 && <div className="dayhelp">סינון לפי חודש · המספר = שינויים באותו חודש</div>}
        {months.length > 1 && (
          <div className="months">
            <button className={"mchip" + (!mon ? " on" : "")} aria-pressed={!mon} title="כל התקופה — בלי סינון לחודש" onClick={() => setMon("")}>הכול</button>
            {months.map((m) => (
              <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} title="סינון לחודש הזה · המספר = שינויים באותו חודש" onClick={() => setMon(m)}>
                {m.split("-").reverse().join(".")} <b>{vs.filter((x) => x.d.slice(0, 7) === m).length}</b>
              </button>
            ))}
          </div>
        )}
        <div className="tl">
          {/* בחירת אירוע חייבת לעבוד גם במקלדת ובקורא מסך (סעיף 4) —
              אבל בלי כפתור-בתוך-כפתור: השורה נשארת לחיצה לעכבר בלבד,
              ותגית הסוג היא הכפתור האמיתי (nested-interactive מהביקורת) */}
          {tlRows.map((row, si) => row.t ? (
            <React.Fragment key={"t" + row.t.id}>
            
            <TempEv t={row.t} rd={rd} lf={lf} />
            </React.Fragment>
          ) : (({ v: x, i }) => (
            <React.Fragment key={x.d + x.k + i}>
            
            <div className={"ev" + (i === vs.indexOf(v) ? " sel" : "")}
              onClick={() => selectEvent(i, x)}>
              <div className="d">
                {(() => { const ed = evDate(x); return ed.tip
                  ? <TipTag cls={ed.exact ? "" : "approxd"} tip={ed.tip}>{ed.txt}{ed.exact ? "" : " ≈"}</TipTag>
                  : <span>{ed.txt}</span>; })()}
                {(x.shp || (x.stops || []).length > 1 || (x.pstops || []).length > 1) ? " · 🗺️" : ""}
                {(x.shp || (x.stops || []).length > 1) && (
                <button className={"cmpbtn" + (cmpI === i ? " on" : "")}
                  title={cmpI === i ? "זו גרסת הבסיס להשוואה — לחיצה מבטלת" : "קביעת הגרסה הזו כבסיס, ואז לחיצה על אירוע אחר תשווה מולה"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cmpI === i) { setCmpI(null); return; }
                    setCmpI(i);
                    // לחיצה אחת מספיקה: אם האירוע הפתוח הוא הבסיס עצמו אין מה
                    // להשוות, ולכן נפתחת מולו הגרסה העדכנית ביותר.
                    if (vs.indexOf(v) === i) {
                      const last = vs.length - 1;
                      setSel(last === i ? Math.max(0, i - 1) : last);
                    }
                  }}>
                  {cmpI === i ? "⇄ בסיס ההשוואה" : "⇄ השווה"}</button>)}
              </div>
              <div className="t">
                <button className="k kbtn" title={kTip(dispKind(x, i, vs))} style={{ background: (KINDS[dispKind(x, i, vs)] || {}).color || "#64748b" }}
                  aria-current={i === vs.indexOf(v)}
                  aria-label={"בחירת האירוע מ-" + evDate(x).txt + ": " + ((KINDS[dispKind(x, i, vs)] || { label: x.k }).label)}
                  onClick={(e) => { e.stopPropagation(); selectEvent(i, x); }}>{(KINDS[dispKind(x, i, vs)] || { label: x.k }).label}</button>
                {x.k === "redraw" && " הגאומטריה תוקנה — רצף התחנות לא השתנה"}
                {/* שינוי שרצף התחנות חזר ממנו מיד. בלי הסימון הזה השורה
                    אומרת שתחנות ירדו, בעוד הקו עוצר בהן עד היום. */}
                {x.rv ? (
                  <TipTag cls="rvflag" tip="רצף התחנות חזר בדיוק למה שהיה לפני השינוי הזה. שינוי שמתבטל מיד הוא כמעט תמיד תנודה בפרסום ולא שינוי במסלול">
                    ↩ חזר כעבור {x.rv === 1 ? "יום" : x.rv + " ימים"}</TipTag>
                ) : x.rvb ? (
                  <TipTag cls="rvflag" tip="השינוי הקודם התבטל כאן — רצף התחנות חזר למה שהיה לפניו">
                    ↩ החזרת המצב הקודם</TipTag>
                ) : null}
                {/* הד: אותן תחנות נוספו ואותן ירדו כבר קודם בחלופה אחרת של הקו (קווי אשדוד: 19.07 בחלופות
                    הראשיות, 13.09 בחלופה 6). זה שינוי אמיתי בחלופה הזאת — נשאר ומדווח — אבל אומרים
                    שהוא כבר נכנס קודם בחלופה אחרת (שלמה 16.09) */}
                {x.echo ? (
                  <TipTag cls="rvflag" tip={"אותן תחנות נוספו ואותן תחנות ירדו כבר ב-" + fmtD(x.echo.d) + " בחלופה " + x.echo.rd + " של הקו. עכשיו השינוי הגיע גם לחלופה הזאת"}>
                    ↻ השינוי כבר נכנס ב-{fmtD(x.echo.d)} בחלופה {x.echo.rd}; עכשיו גם בחלופה הזאת</TipTag>
                ) : null}
                {/* בצילום אתר מידע ההערה רק חוזרת על "תאריך השמירה אינו מועד שינוי", שכבר כתוב בכרטיס */}
                {x.note && x.k !== "planned-dropped" && x.src !== "websiteArchive" && <span className="evnote"> <NoteText s={noteFix(x.note)} /></span>}
              </div>
              {/* מאיפה האירוע הזה הגיע. ההערות אמרו "מארכיון הפיד הארצי"
                  בלי לנקוב בשם, ואי אפשר היה לדעת מה נמדד ומי מדד. */}
              {x.foiD && <div className="evnote">לפי נתוני משרד התחבורה (חופש מידע) השינוי נכנס בערך ב-{fmtD(x.foiD)}.</div>}
              <div className="evsrc">{x.k === "vehicle" ? SRC_LABEL.rishui : x.k === "ltype" ? SRC_LABEL.ctl : (SRC_LABEL[x.src] || SRC_LABEL._daily)}</div>
              {/* שינוי שתוכנן ולא נכנס לתוקף: מה קרה בסוף, שני התאריכים (מתי היה
                  אמור להיכנס, מתי ירד), ומה התוכנית הייתה משנה — במקום מספר
                  התחנות (שלמה 05.09) */}
              {x.k === "planned-dropped" && (x.ps || x.pc) && (() => { const p = plannedInfo(x, i, vs); return (
                <div className="sub">
                  <div><PlanStatus p={p} /> · 📅 היה אמור להיכנס ב-<b>{fmtD(x.ps)}</b>
                    {x.pc && x.ps && x.pc >= x.ps ? <> · ירד מהרישום ב-<b>{fmtD(x.pc)}</b></> : <> · בוטל ב-<b>{fmtD(x.pc || x.d)}</b>, לפני המועד</>}
                    {x.sd && gapDays(x.sd, x.pc || x.d) > 1 ? <> (נראה לאחרונה ב-{fmtD(x.sd)})</> : null}
                    {x.pf ? <> · פורסם לראשונה ב-{fmtD(x.pf)}</> : null}</div>
                  <PlanLines p={p} max={8} />
                </div>); })()}
              {(x.add || x.rem) && (() => {
                // הזיהוי לפי מספר תחנה (x.ac/x.rc, מיושרים לשמות) — השם תצוגה
                const addE = (x.add || []).map((n, j) => ({ n, c: x.ac && x.ac[j] != null ? String(x.ac[j]) : null }));
                const remE = (x.rem || []).map((n, j) => ({ n, c: x.rc && x.rc[j] != null ? String(x.rc[j]) : null }));
                const pm = splitPlatformMoves(addE, remE);
                // החלפת מק"ט (אותו שם, אותו מיקום) היא אירוע של רישום
                // התחנות, לא של הקו — לא מוצגת כאן בכלל (בקשת שלמה)
                const rn = splitRenumbers(pm.add, pm.rem, i);
                // אירוע שכל השינוי בו הוא החלפת מק"ט (אותו שם ומיקום) — אומרים את זה, אחרת הכרטיס
                // "שינוי מסלול / שינוי תחנות" נשאר בלי שום פירוט (שלמה 29.10, קו 55 פרדס חנה)
                if (!pm.moves.length && !rn.add.length && !rn.rem.length)
                  return rn.moves.length ? <div className="sub">
                    {rn.moves.map((m, k) => <div key={k}>🔁 התחנה {m.name} קיבלה מספר חדש ({m.from} ← {m.to}), באותו שם ובאותו מקום</div>)}
                    <div className="mut">{x.k === "route" || x.k === "redraw" ? "התחנות לא השתנו לנוסע; שרטוט המסלול עודכן." : "אין שינוי לנוסע."}</div>
                  </div> : null;
                return (
                  <div className="sub">
                    {pm.moves.map((m, k) => <div key={k}>🔀 מעבר רציף: {m.base} — מרציף {m.from} לרציף {m.to}</div>)}
                    {rn.add.length > 0 && <div>➕ נוספו: {labelList(rn.add, i, true)}</div>}
                    {rn.rem.length > 0 && <div>➖ ירדו: {labelList(rn.rem, i, false)}</div>}
                  </div>
                );
              })()}
              
            </div>
            </React.Fragment>
          ))(row))}
        </div>
      </div>
      {mainEl}
      </>}
    </div>
  );
}

/* ---------- מפת אירוע תחנה: מיקום ישן מול חדש ---------- */
function StopEvMap({ ev }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.L) return;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const pts = [[ev.la, ev.lo]];
    if (ev.k === "moved" && ev.ola != null) {
      pts.push([ev.ola, ev.olo]);
      L.polyline([[ev.ola, ev.olo], [ev.la, ev.lo]], { color: "#2563eb", weight: 3, dashArray: "5 7", opacity: 0.9 }).addTo(map);
      L.circleMarker([ev.ola, ev.olo], { radius: 9, color: "#dc2626", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .addTo(map).bindPopup(`<b>המיקום הישן</b><br><span class="pcode" dir="ltr">(${ev.ola}, ${ev.olo})</span>`, { className: "lh-pop" });
    }
    L.circleMarker([ev.la, ev.lo], { radius: 9, color: "#fff", weight: 2,
      fillColor: ev.k === "moved" ? "#16a34a" : ((SKINDS[ev.k] || {}).color || "#2563eb"), fillOpacity: 1 })
      .addTo(map).bindPopup(`<b>${esc(ev.n || ev.nn || "")}</b>${ev.k === "moved" ? "<br>המיקום החדש" : ev.k === "gtfs2012" ? "<br>המיקום ברישום 2012" : ""}<br><span class="pcode" dir="ltr">(${ev.la}, ${ev.lo})</span>`, { className: "lh-pop" });
    map.fitBounds(L.latLngBounds(pts).pad(0.6), { maxZoom: 17 });
    return () => map.remove();
  }, [ev]);
  return <div className="smap" ref={ref} role="img"
    aria-label={ev.k === "moved" ? "מפה: הזזת התחנה מהמיקום הישן לחדש, " + (ev.dist || ev.m || "") + " מטרים" : ev.k === "gtfs2012" ? "מפה: מיקום התחנה ברישום 2012" : "מפה: מיקום התחנה " + (ev.n || ev.nn || "")} />;
}

/* ---------- עמוד קו של 2012 ---------- */
// קו של 2012 נפתח קודם כרשימת תחנות בתוך שורה בפיד, בלי מפה ובלי כתובת
// משלו. זה עמוד לכל דבר: מסלול על המפה דרך התחנות שהוצלבו למק"ט, רצף
// התחנות, ומעבר לקו של היום כשיש כזה.
function Map2012({ stops, shape, year = "2012", estimatedLocations = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.L) return;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    // מיקום התחנה: מרישום התחנות של 2012 עצמו (GTFS יוני 2012 דרך OpenStreetMap,
    // changeset 12028672 — s[7] === 1), ואם התחנה לא נמצאה שם, מהרישום של היום. תחנה שלא
    // הוצלבה למק"ט אינה על המפה. כשחושב מסלול משוער על הכבישים (shape,
    // tools/shape_2012.py) הוא מצויר; אחרת קו ישר בין התחנות, מקווקו.
    const pts = stops.filter((s) => s[5] != null && s[6] != null).map((s) => [s[5], s[6]]);
    const road = shape && shape.length > 1 ? shape : null;
    if (road) L.polyline(road, { color: "#78350f", weight: 5, opacity: 0.85, dashArray: "10 7" }).addTo(map);
    else if (pts.length > 1) L.polyline(pts, { color: "#78350f", weight: 4, opacity: 0.85, dashArray: "6 8" }).addTo(map);
    stops.forEach((s, i) => {
      if (s[5] == null) return;
      const last = i === stops.length - 1;
      L.circleMarker([s[5], s[6]], { radius: i === 0 || last ? 8 : 5, weight: 2,
        color: i === 0 || last ? "#fff" : "#78350f",
        fillColor: i === 0 ? "#16a34a" : last ? "#dc2626" : "#fff", fillOpacity: 1 })
        .addTo(map).bindPopup(`<b>${esc(s[1])}</b><br><span class="pst">תחנה ${s[0]} במסלול ${esc(String(year))}</span>` +
          (s[4] && s[4].length === 1 ? `<br><span class="pcode">${estimatedLocations ? "התאמה משוערת למק״ט" : "מק״ט"} ${esc(String(s[4][0]))}</span>` : ""),
          { className: "lh-pop", offset: [0, -4] });
    });
    const all = pts.concat(road || []);
    if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.15), { maxZoom: 16 });
    else map.setView([31.5, 34.9], 8);
    return () => map.remove();
  }, [stops, shape, year, estimatedLocations]);
  return <div className="map" ref={ref} role="img"
    aria-label={"מפת מסלול " + year + " דרך " + (stops || []).filter((x) => x[5] != null).length + " תחנות שהוצלבו למיקום"} />;
}

function Line2012Page({ k12, anchorRd, openLine, onBack, backHref }) {
  const [d, setD] = useState(null);
  const [sh, setSh] = useState(null);     // מסלולים משוערים על הכבישים, אם חושבו
  const [ri, setRi] = useState(0);
  useEffect(() => {
    setD(null); setSh(null); setRi(0);
    fetch("../magihim-2012/data/l" + k12 + ".json?v=" + BUILD)
      .then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(false));
    dfetch("../magihim-2012/data/shapes/l" + k12 + ".json")
      .then((r) => (r.ok ? r.json() : { routes: {} })).then(setSh).catch(() => setSh({ routes: {} }));
  }, [k12]);
  if (d === null) return <div className="card">טוען…</div>;
  if (!d) return <div className="card"><BackLink href={backHref} onBack={onBack}>→ חזרה</BackLink>
    <div className="empty">הקו לא נמצא בצילום 2012.</div></div>;
  const r = (d.routes || [])[ri] || (d.routes || [])[0] || { stops: [] };
  const stops = r.stops || [];
  const matched = stops.filter((s) => s[5] != null).length;
  const rsh = (sh && sh.routes && sh.routes[String((d.routes || []).indexOf(r))]) || null;
  const shape = rsh ? decodeShape(rsh.pl) : null;
  return (
    <div className="card">
      <BackLink href={backHref} onBack={onBack}>→ חזרה</BackLink>
      <div className="linehead">
        <span className="badge">{d.no}</span>
        <span className="dest">{d.dest}</span>
        <span className="k" style={{ background: "#78350f" }}>צילום 2012</span>
        {/* שיתוף כמו בעמוד קו של היום: דף-שיתוף ייעודי (s/k-*.html) שמציג בוואטסאפ
            את מספר הקו ואת סמל האתר — לקווי 2012 לא היה כזה (שלמה 07.09) */}
        <button className="sharebtn" title="שיתוף הקישור לקו הזה כפי שהיה ב-2012"
          onClick={(e) => {
            const url = location.origin + location.pathname.replace(/line-history\/?[^/]*$/, "") + "s/k-" + ssafe(k12) + ".html";
            const b = e.currentTarget;
            if (navigator.share) { navigator.share({ title: "הקו בזמן — קו " + (d.no || k12) + " (2012)", url }).catch(() => {}); return; }
            const t = b.textContent;
            const done = () => { b.textContent = "✓ הועתק"; setTimeout(() => { b.textContent = t; }, 1500); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt("העתקה ידנית:", url));
          }}>🔗 שיתוף</button>
      </div>
      <div className="facts">{d.an} · {stops.length} תחנות · {(d.routes || []).length} מסלולים ·
        {" "}{matched} תחנות הוצלבו למק"ט · {stops.filter((s) => s[7] === 1).length} מהן מרישום 2012 עצמו
        {anchorRd && <> · <a className="totoday" href={lineHref(anchorRd)}
          onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(anchorRd); }}>הקו של היום ←</a></>}
      </div>
      {(d.routes || []).length > 1 && (
        <div className="s12chips">{d.routes.map((x, i) => (
          <button key={x.rid} className={"rchip12" + (i === ri ? " on" : "")} title="מסלולי הקו ב-2012 · לחיצה מציגה את המסלול הזה" onClick={() => setRi(i)}>
            {x.f} ← {x.l} · {x.n} תחנות</button>
        ))}</div>
      )}
      <Map2012 stops={stops} shape={shape} />
      <div className="legend">
        <span><i style={{ borderColor: "#78350f", borderStyle: "dashed" }} /> {rsh
          ? `מסלול משוער — חישוב על כבישי היום דרך ${rsh.n} מ-${rsh.tot} התחנות, כ-${(rsh.m / 1000).toFixed(1)} ק"מ`
          : "מסלול 2012 (קו ישר דרך התחנות שהוצלבו)"}</span>
        <span><i className="dot" style={{ background: "#16a34a" }} /> ראשונה</span>
        <span><i className="dot" style={{ background: "#dc2626" }} /> אחרונה</span>
      </div>
      <ol className="s12">
        {stops.map((s) => (
          <li key={s[0]}>{s[1]}{" "}
            {s[4] && s[4].length === 1 ? <span className="pcode">מק״ט {s[4][0]}</span>
              : s[4] && s[4].length > 1 ? <span className="pcode">{s[4].length} מק״טים אפשריים</span>
                : <span className="pcode">לא הוצלבה</span>}
          </li>
        ))}
      </ol>
      <div className="katnote">ℹ️ מיקומי התחנות מרישום 2012 או מרישום היום. {rsh ? "המסלול ביניהן משוער, על כבישי היום." : "תחנה שלא הוצלבה לא מוצגת, והקו ביניהן מקווקו."}
        <details className="howcalc"><summary>איך זה מחושב</summary>
          <p>המק"ט והמיקום נלקחים קודם מרישום התחנות של משרד התחבורה מיוני 2012 (קובץ GTFS), כפי שיובא ל-<a href="https://www.openstreetmap.org/changeset/12028672" target="_blank" rel="noopener">OpenStreetMap ב-26.06.2012</a>: 33,055 תחנות, רישיון ODbL. תחנה שלא נמצאה בו הוצלבה לרישום התחנות של היום, ותחנה שלא הוצלבה כלל לא מופיעה על המפה.</p>
          {rsh && <p>המסלול: נסיעת אוטובוס בכבישים של היום דרך התחנות הידועות, לפי הסדר. כביש שנפתח מאז 2012 או תחנה שלא הוצלבה יכולים לעקם אותו.</p>}
        </details></div>
    </div>
  );
}
