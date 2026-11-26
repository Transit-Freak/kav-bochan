/* הקו בזמן · 02-diff.jsx — השוואת מסלולים: segDiff, השוואת זמנים (TimesDiff) ומפת השינוי (DiffMap).
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

/* ---------- איתור הקטעים ששונו בין שתי גאומטריות ----------
   לכל נקודה בגרסה אחת מחשבים את המרחק (במטרים) לקטע הקרוב ביותר בגרסה
   השנייה; רצף נקודות רחוקות = קטע ששונה. עמיד גם כשכל המסלול נדגם מחדש
   בנקודות אחרות (המרחק נשאר ~0 בקטעים שלא זזו באמת). */
function segDiff(cur, prev) {
  if (!cur || cur.length < 2 || !prev || prev.length < 2) return null;
  const ky = 110540, kx = 111320 * Math.cos((cur[0][0] * Math.PI) / 180);
  const M = (p) => [p[1] * kx, p[0] * ky];
  /* דגימה צפופה (כל ~12 מ') של שני השרטוטים לפני ההשוואה: קטע ישר ארוך
     בלי קודקודים באמצע — כמו חציית כיכר בקו ישר — לא נדגם קודם בכלל,
     והתוואי הישן שעבר בתוך הכיכר לא סומן באדום (צילומי שלמה, קו 26,
     צומת ברור חיל וצומת אור הנר). הנקודות הנדגמות יושבות בדיוק על
     הקו המקורי — שום גאומטריה לא מומצאת. */
  function densify(Praw, Pm) {
    const R = [Praw[0]], Q = [Pm[0]];
    for (let i = 1; i < Praw.length; i++) {
      const a = Pm[i - 1], b = Pm[i];
      const n = Math.min(60, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        R.push([Praw[i - 1][0] + (Praw[i][0] - Praw[i - 1][0]) * t,
                Praw[i - 1][1] + (Praw[i][1] - Praw[i - 1][1]) * t]);
        Q.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      R.push(Praw[i]); Q.push(Pm[i]);
    }
    return [R, Q];
  }
  const [cd, A] = densify(cur, cur.map(M));
  const [pd, B] = densify(prev, prev.map(M));
  const CS = 60; // גודל תא הרשת במטרים
  function buildGrid(S) {
    const g = new Map();
    for (let i = 0; i < S.length - 1; i++) {
      const x0 = Math.min(S[i][0], S[i + 1][0]) - 20, x1 = Math.max(S[i][0], S[i + 1][0]) + 20;
      const y0 = Math.min(S[i][1], S[i + 1][1]) - 20, y1 = Math.max(S[i][1], S[i + 1][1]) + 20;
      for (let gx = Math.floor(x0 / CS); gx <= Math.floor(x1 / CS); gx++)
        for (let gy = Math.floor(y0 / CS); gy <= Math.floor(y1 / CS); gy++) {
          const k = gx + ":" + gy;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push(i);
        }
    }
    return g;
  }
  function segd(p, s0, s1) {
    const dx = s1[0] - s0[0], dy = s1[1] - s0[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - s0[0]) * dx + (p[1] - s0[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = s0[0] + t * dx - p[0], y = s0[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  function dists(P, S, g) {
    return P.map((p) => {
      const gx = Math.floor(p[0] / CS), gy = Math.floor(p[1] / CS);
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const segs = g.get((gx + dx) + ":" + (gy + dy));
        if (segs) for (const i of segs) { const d = segd(p, S[i], S[i + 1]); if (d < best) best = d; }
      }
      return best;
    });
  }
  function runsIdx(ds, th) {
    const idx = [];
    ds.forEach((d, i) => { if (d > th) idx.push(i); });
    if (!idx.length) return [];
    const out = [];
    let s = idx[0], e = idx[0];
    for (let i = 1; i < idx.length; i++) {
      // גישור הדוק (3 נקודות): גישור רחב הדביק רסיסי-רעש לרצף של מאות
      // מטרים והסימון נראה "בערך" (דיווח שלמה, קו 26 — הכיכר החדשה)
      if (idx[i] - e <= 3) e = idx[i];
      else { out.push([s, e]); s = e = idx[i]; }
    }
    out.push([s, e]);
    return out;
  }
  const gB = buildGrid(B), gA = buildGrid(A);
  const da = dists(A, B, gB), db = dists(B, A, gA);
  // סף מסתגל: שני שרטוטים שדוללו אחרת "רועדים" זה סביב זה לכל האורך,
  // ועם סף קבוע כל המסלול הודגש כאילו הוחלף (דיווח שלמה, קו 26). הסף
  // עולה מעל רעש-הבסיס של ההשוואה כך שרק הסטייה האמיתית מודגשת
  const med = (arr) => {
    const s = [...arr].filter((x) => isFinite(x)).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const noise = med(da.concat(db));
  // בלי רף זיהוי (בקשת שלמה: "שלא תהיה הגבלה — שפשוט יסמן את הקטע"):
  // הסף הוא רק דיוק הציור — 5 מ'. כל מקום ששני השרטוטים אינם אותו קו
  // בו מסומן. הרכיב המסתגל מגן רק מצמד שרטוטים ישן ורועד.
  let th = Math.max(5, noise * 2.5 + 3);
  let curRuns = runsIdx(da, th), prevRuns = runsIdx(db, th);
  if (!curRuns.length && !prevRuns.length) {
    th = Math.max(3, noise * 2.5 + 2);
    curRuns = runsIdx(da, th); prevRuns = runsIdx(db, th);
  }
  if (!curRuns.length && !prevRuns.length) return null;
  /* הרחבה עד נקודת האיחוי (בקשת שלמה: "הקטע שמצויר בצבע החלש — שיודגש
     כולו"): רצף שנתפס מעל הסף מתרחב לאורך הקו שלו עד המקום שבו שני
     השרטוטים באמת מתאחדים (מתחת ל-LOW), כך שההדגשה מכסה את כל הקטע
     שנראה נפרד בעין — לא רק את ליבו שחצה את הסף. */
  const LOW = Math.max(3, th - 2);
  const grow = (runs, ds) => {
    const n = ds.length;
    const sep = new Array(n);
    for (let i = 0; i < n; i++) sep[i] = ds[i] > LOW;
    // כשהקו הישן חוצה את החדש המרחק צונח לרגע לאפס — חור של עד 2 דגימות
    // (~24 מ') בנקודת ההצטלבות לא קוטע את הרצף, והזנב שמעבר לה מודגש גם
    for (let i = 1; i < n - 1; i++) {
      if (!sep[i] && sep[i - 1] && (sep[i + 1] || (i + 2 < n && sep[i + 2]))) sep[i] = true;
    }
    const out = [];
    for (let [a, b] of runs) {
      while (a > 0 && sep[a - 1]) a--;
      while (b < n - 1 && sep[b + 1]) b++;
      if (out.length && a <= out[out.length - 1][1] + 3) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
      else out.push([a, b]);
    }
    return out;
  };
  curRuns = grow(curRuns, da);
  prevRuns = grow(prevRuns, db);
  /* הסימון מדויק לפי קואורדינטות השרטוטים בלבד (דרישת שלמה, קו 26
     שדרות — "לא לנחש בערך"): לכל קטע ששונה בצד אחד נחתך גם הצד השני
     בדיוק בין ההטלות הגיאומטריות של קצות הקטע על הפוליליין שלו. כך
     האדום עוקב אחרי השרטוט הישן עצמו מנקודת ההתפצלות ועד נקודת
     ההתאחדות, והירוק אחרי החדש — בלי להמציא תוואי ובלי קיטוע. */
  /* קטע-הנגד המדויק: קצות הרצף מוטלים על הפוליליין השני, וכשמסלול
     עובר באותו כביש פעמיים (הלוך-ושוב) יש לכל קצה כמה הטלות אפשריות —
     נבחר צמד ההטלות שממזער את האורך הכלוא ביניהן. בחירה לפי סדר-לאורך-
     הקו כלאה בקו 26 לולאה של 4 ק"מ שקיימת בשני השרטוטים והציגה אותה
     כאילו בוטלה. גם עכשיו: אם האורך הכלוא לא פרופורציונלי לרצף — אין
     תוואי מקביל אמיתי (הארכה מעבר לקצה) ולא ממציאים כלום. */
  const cumOf = (S) => { const c = [0]; for (let i = 1; i < S.length; i++) c.push(c[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1])); return c; };
  const cumA = cumOf(A), cumB = cumOf(B);
  const lenAt = (c, pos) => { const i = Math.max(0, Math.min(Math.floor(pos), c.length - 2)); return c[i] + (c[i + 1] - c[i]) * (pos - i); };
  function candsOn(q, Sm) {   // אשכולות ההטלות הקרובות (אחד לכל מעבר של הכביש)
    const raw = [];
    let dmin = Infinity;
    for (let i = 0; i < Sm.length - 1; i++) {
      const s0 = Sm[i], s1 = Sm[i + 1];
      const dx = s1[0] - s0[0], dy = s1[1] - s0[1];
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((q[0] - s0[0]) * dx + (q[1] - s0[1]) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const x = s0[0] + t * dx - q[0], y = s0[1] + t * dy - q[1];
      const dd = Math.sqrt(x * x + y * y);
      if (dd < dmin) dmin = dd;
      raw.push({ d: dd, pos: i + t });
    }
    const lim = Math.min(250, Math.max(dmin * 2, dmin + 30));
    const near = raw.filter((c) => c.d <= lim);
    const out = [];
    for (const c of near) {
      if (out.length && c.pos - out[out.length - 1].pos <= 3) {
        if (c.d < out[out.length - 1].d) out[out.length - 1] = { d: c.d, pos: c.pos };
      } else out.push({ d: c.d, pos: c.pos });
    }
    return out;
  }
  const counterIv = (run, Pm, cumP, Sm, cumS) => {
    const a0 = Math.max(0, run[0] - 1), b0 = Math.min(Pm.length - 1, run[1] + 1);
    const c0 = candsOn(Pm[a0], Sm), c1 = candsOn(Pm[b0], Sm);
    const runLen = lenAt(cumP, b0) - lenAt(cumP, a0);
    // הצמד הנבחר: האורך הכלוא הכי דומה לאורך הרצף עצמו (מזעור טהור קרס
    // לאפס כששני הקצוות נפלו על אותה נקודת צומת), עם שובר-שוויון לקרבה
    let best = null;
    for (const u of c0) for (const v of c1) {
      const span = Math.abs(lenAt(cumS, v.pos) - lenAt(cumS, u.pos));
      const score = Math.abs(span - runLen) + (u.d + v.d) * 2;
      if (!best || score < best.score) best = { score, span, lo: Math.min(u.pos, v.pos), hi: Math.max(u.pos, v.pos) };
    }
    if (!best) return null;
    if (best.span > runLen * 3 + 300 || best.span < runLen * 0.15 - 60) return null;
    return [best.lo, best.hi];
  };
  const ivA = curRuns.map(([a, b]) => [Math.max(0, a - 1), Math.min(A.length - 1, b + 1)]);
  const ivB = prevRuns.map(([a, b]) => [Math.max(0, a - 1), Math.min(B.length - 1, b + 1)]);
  for (const r of curRuns) { const iv = counterIv(r, A, cumA, B, cumB); if (iv) ivB.push(iv); }
  for (const r of prevRuns) { const iv = counterIv(r, B, cumB, A, cumA); if (iv) ivA.push(iv); }
  const mergeIv = (iv) => {
    const s = iv.filter(([x, y]) => y - x > 0.05).sort((u, v) => u[0] - v[0]);
    const out = [];
    for (const r of s) {
      if (out.length && r[0] <= out[out.length - 1][1] + 2) out[out.length - 1][1] = Math.max(out[out.length - 1][1], r[1]);
      else out.push([r[0], r[1]]);
    }
    return out;
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const slice = (P, [x0, x1]) => {
    const i0 = Math.floor(x0), i1 = Math.min(Math.floor(x1), P.length - 1);
    const t0 = x0 - i0, t1 = x1 - i1;
    const out = [t0 > 0.001 && i0 < P.length - 1 ? lerp(P[i0], P[i0 + 1], t0) : P[i0]];
    for (let i = i0 + 1; i <= i1; i++) out.push(P[i]);
    if (t1 > 0.001 && i1 < P.length - 1) out.push(lerp(P[i1], P[i1 + 1], t1));
    return out;
  };
  const curSegs = mergeIv(ivA).map((r) => slice(cd, r)).filter((r) => r.length > 1);
  const prevSegs = mergeIv(ivB).map((r) => slice(pd, r)).filter((r) => r.length > 1);
  const derived = curRuns.length && !prevRuns.length ? "prev"
    : prevRuns.length && !curRuns.length ? "cur" : null;
  return { curSegs, prevSegs, derived };
}

/* ---------- מפת לפני/אחרי ---------- */
/* טבלת "לפני / אחרי" ללוח היציאות — לאירועי תדירות/לו"ז שנשמרו עם
   הרשימות המלאות (tl/tn). ריבוי באותה שעה = תגבור, ומוצג כמונה. */
function TimesDiff({ tl, tn }) {
  const [open, setOpen] = useState(true);   // נפתחת מיד עם הלחיצה על האירוע
  const rows = useMemo(() => {
    const cnt = (s) => {
      const c = new Map();
      (s ? s.split(",") : []).forEach((t) => c.set(t, (c.get(t) || 0) + 1));
      return c;
    };
    const a = cnt(tl), b = cnt(tn);
    const times = [...new Set([...a.keys(), ...b.keys()])].sort();
    const out = [], oldOnly = [], newOnly = [];
    times.forEach((t) => {
      const x = a.get(t) || 0, y = b.get(t) || 0;
      if (x > 0 && y > 0) {
        if (x === y) out.push({ key: t, before: x > 1 ? `${t} (${x}×)` : t, cls: "same" });
        else out.push({ key: t, before: `${t} (${x}×)`, after: `${t} (${y}×)`, cls: "changed" });
      } else if (x > 0) oldOnly.push(t);
      else newOnly.push(t);
    });
    // התאמת יציאות שזזו: שעה שירדה מול שעה קרובה שנוספה (עד 20 דק' הפרש)
    const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    let i = 0, j = 0;
    while (i < oldOnly.length || j < newOnly.length) {
      const o = oldOnly[i], n = newOnly[j];
      if (o != null && n != null && Math.abs(mins(o) - mins(n)) <= 20) {
        out.push({ key: o + n, before: o, after: n, cls: "moved" }); i++; j++;
      } else if (o != null && (n == null || o < n)) {
        out.push({ key: o + "-", before: o, after: "—", cls: "removed" }); i++;
      } else {
        out.push({ key: "-" + n, before: "—", after: n, cls: "added" }); j++;
      }
    }
    out.sort((r, s) => (r.before !== "—" ? r.before : r.after).localeCompare(s.before !== "—" ? s.before : s.after));
    return out;
  }, [tl, tn]);
  const nOld = tl ? tl.split(",").length : 0, nNew = tn ? tn.split(",").length : 0;
  const changed = rows.filter((r) => r.cls !== "same").length;
  return (
    <div className="tdiff">
      <button className="tdiff-btn" aria-expanded={open} onClick={() => setOpen(!open)}
        title="כל היציאות שורה-שורה: השעה לפני מול השעה אחרי; שעה שלא השתנתה מוצגת פעם אחת">
        📊 {open ? "הסתר את" : "הצג את"} טבלת הלפני/אחרי המלאה ({nOld} ← {nNew} יציאות · {changed} השתנו)
      </button>
      {open && (
        <div className="tdiff-wrap">
          <table className="tdiff-tbl">
            <thead><tr><th>לפני</th><th>אחרי</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={"td-" + r.cls}>
                  {r.cls === "same"
                    ? <td className="num" colSpan={2}>{r.before}</td>
                    : <><td className="num">{r.before}</td><td className="num">{r.after}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tdiff-leg">
            {[["same", "ללא שינוי"], ["moved", "זזה / תגבור השתנה"], ["removed", "ירדה"], ["added", "נוספה"]].map(([c, t]) =>
              <span key={c} className={"legchip td-" + c}><span className="num">{t}</span></span>)}
            {" "}2× = שני אוטובוסים
          </div>
        </div>
      )}
    </div>
  );
}


// קו מעגלי עוצר באותה תחנה בשני קטעי המסלול — ברשימות ➕/➖ השם הופיע
// פעמיים ונראה כמו באג (קו 114 דן). מאחדים ומציינים ×N במקום לשכפל.
const dedupCount = (arr) => {
  const m = new Map();
  (arr || []).forEach((x) => { const k = typeof x === "string" ? x : x[0] + "|" + x[1]; const e = m.get(k); if (e) e.n += 1; else m.set(k, { x, n: 1 }); });
  return [...m.values()];
};
function DiffMap({ cur, prev, approx, prevApprox, curStops, prevStops, addedCodes, stops12, shape12, remPins, sg, planned, plats, pointsOnly, nowNames, succ }) {
  // בצילומי אתרי המידע לנוסעים לתחנות אין מיקום ([קוד, שם, null, null]) — מפה עם נקודות null
  // קרסה (L.latLngBounds של רשימה ריקה / circleMarker([null,null])) והורידה את כל הדף
  const finite = (s) => Number.isFinite(s[2]) && Number.isFinite(s[3]);
  curStops = useMemo(() => (curStops ? curStops.filter(finite) : curStops), [curStops]);
  prevStops = useMemo(() => (prevStops ? prevStops.filter(finite) : prevStops), [prevStops]);
  const ref = useRef(null);
  const mapRef = useRef(null);
  // קטעי-שינוי ששולפו מהארכיון (v.sg) — הגאומטריה האמיתית של מה שירד
  // ומה שנוסף גם כשלגרסאות אין שרטוט מלא (בקשת שלמה: רק הקטע ששונה)
  const sgO = useMemo(() => (sg && sg.o ? sg.o.map(decodeShape).filter((r) => r.length > 1) : null), [sg]);
  const sgN = useMemo(() => (sg && sg.n ? sg.n.map(decodeShape).filter((r) => r.length > 1) : null), [sg]);
  // הקטעים ששונו + התחנות ששונו — היעד של מצב "התמקדות" (בקשת המשתמש:
  // בתיקון באג לראות רק את הקטע שהשתנה, לא את כל המסלול).
  // השוואת קטעים רק כששני הצדדים מדויקים — קו מקורב בין תחנות ייתן רעש
  const diff = useMemo(() => (prev && !approx && !prevApprox ? segDiff(cur, prev) : null), [cur, prev, approx, prevApprox]);
  const chStops = useMemo(() => {
    const pts = [];
    const curCodes = new Set((curStops || []).map((s) => s[0]));
    if (addedCodes && (curStops || []).length) {
      pts.push(...(curStops || []).filter((s) => addedCodes.has(s[0])).map((s) => [s[2], s[3]]));
    } else if (prevStops) {
      const prevCodes = new Set((prevStops || []).map((s) => s[0]));
      pts.push(...(curStops || []).filter((s) => !prevCodes.has(s[0])).map((s) => [s[2], s[3]]));
    }
    // גם התחנות שירדו הן חלק מהשינוי — בלעדיהן המיקוד התכווץ לתחנה
    // שנוספה בלבד והשאיר את הירידות מחוץ למסך (דיווח שלמה)
    pts.push(...(prevStops || []).filter((s) => !curCodes.has(s[0])).map((s) => [s[2], s[3]]));
    pts.push(...(remPins || []).map((p) => [p[2], p[3]]));
    return pts;
  }, [curStops, prevStops, addedCodes, remPins]);
  const focusPts = useMemo(() => {
    const pts = [];
    if (diff) { diff.curSegs.forEach((s2) => pts.push(...s2)); diff.prevSegs.forEach((s2) => pts.push(...s2)); }
    (sgO || []).forEach((r) => pts.push(...r));
    (sgN || []).forEach((r) => pts.push(...r));
    pts.push(...chStops);
    return pts;
  }, [diff, chStops, sgO, sgN]);
  const [focus, setFocus] = useState(true);
  const canFocus = focusPts.length > 0;
  useEffect(() => {
    if (!ref.current || !window.L) return;   // Leaflet לא נטען (unpkg חסום/נפל) — בלי מפה, הדף ממשיך
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const map = L.map(ref.current, { scrollWheelZoom: !coarse });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const focused = canFocus && focus;
    const pts12 = (stops12 || []).map((s) => [s[1], s[2]]);
    const pinPts = (remPins || []).map((p) => [p[2], p[3]]);
    const stationPts = [...(curStops||[]),...(prevStops||[])].filter(s=>Number.isFinite(s[2])&&Number.isFinite(s[3])).map(s=>[s[2],s[3]]);
    const all = focused ? focusPts : cur.concat(prev || []).concat(pts12).concat(shape12 || []).concat(pinPts).concat(stationPts);
    map.fitBounds(L.latLngBounds(all.length ? all : [[32.08, 34.78]]).pad(focused ? 0.35 : 0.1), { maxZoom: 16 });
    // במצב התמקדות שכבות-הרקע כמעט שקופות: המקווקו האדום העדין שמצויר
    // לאורך כל המסלול נקרא בטעות כ"שינוי לא מסומן" בקטעים שבהם שני
    // השרטוטים זהים והוא מציץ מתחת לירוק (דיווח שלמה)
    if (prev && prev.length > 1) {
      // תוכנית שלא יצאה לפועל: המסלול בפועל הוא רקע אפור, לא "מסלול קודם" אדום
      L.polyline(prev, planned
        ? { color: "#475569", weight: 4, opacity: 0.6 }
        : { color: "#dc2626", weight: focused ? 2 : 4, opacity: focused ? 0.12 : 0.75, dashArray: "8 7" }).addTo(map);
    }
    if (cur.length > 1) {
      L.polyline(cur, planned
        ? { color: "#9f1239", weight: 5, opacity: 0.9, dashArray: "10 8" }   // המסלול שתוכנן ולא נסע — קו מקווקו בין התחנות
        : succ
        ? { color: "#0e7490", weight: 5, opacity: 0.85, dashArray: "12 8" }   // המסלול של הקו שהמשיך (מונית מחופש המידע)
        : approx
        ? { color: "#7c3aed", weight: 4, opacity: 0.8, dashArray: "7 9" }   // קו מקורב בין תחנות
        : { color: prev ? "#16a34a" : "#4c1d95", weight: focused ? 3 : 5, opacity: focused ? 0.25 : 0.9 }).addTo(map);
    }
    if (focused && diff && !planned) {
      diff.prevSegs.forEach((s2) => L.polyline(s2, { color: "#dc2626", weight: 6, opacity: 0.95, dashArray: "9 8" }).addTo(map));
      diff.curSegs.forEach((s2) => L.polyline(s2, { color: "#16a34a", weight: 7, opacity: 0.95 }).addTo(map));
    }
    if (!diff && (sgO || sgN)) {
      (sgO || []).forEach((r) => L.polyline(r, { color: "#dc2626", weight: 6, opacity: 0.95, dashArray: "9 8" }).addTo(map));
      (sgN || []).forEach((r) => L.polyline(r, { color: "#16a34a", weight: 7, opacity: 0.95 }).addTo(map));
    }
    // מסלול 2012 — קו חום מקווקו. כשיש מסלול משוער על הכבישים (shape12,
    // tools/shape_2012.py — בקשת שלמה 05.09) הוא מצויר; אחרת קו ישר דרך
    // התחנות שהוצלבו למק"ט (מיקום לפי המאגר של היום)
    if (shape12 && shape12.length > 1) {
      L.polyline(shape12, { color: "#78350f", weight: 4, opacity: 0.8, dashArray: "8 6" }).addTo(map);
    } else if (pts12.length > 1) {
      L.polyline(pts12, { color: "#78350f", weight: 3, opacity: 0.75, dashArray: "3 7" }).addTo(map);
    }
    if (pts12.length) {
      stops12.forEach((s) => {
        L.circleMarker([s[1], s[2]], { radius: 4, color: "#78350f", weight: 2, fillColor: "#fff", fillOpacity: 1 })
          .addTo(map).bindPopup(`<b>${esc(s[0])}</b><br><span class="pst">מסלול 2012</span>` + (s[4] ? `<br><span class="pcode">מק״ט ${esc(String(s[4]))}</span>` : ""), { className: "lh-pop", offset: [0, -4] });
      });
    }
    const curCodes = new Set((curStops || []).map((s) => s[0]));
    const prevCodes = new Set((prevStops || []).map((s) => s[0]));
    // החלפת מק"ט: תחנה שירדה ותחנה חדשה באותו שם ובאותו מקום (אותו כלל כמו
    // splitRenumbers ברשימה) — זו אותה תחנה עם מספר חדש. בלי זה המפה סימנה
    // באדום תחנות שהרשימה לא מונה כ"ירדו" (קו 94 של קווים: 3 אדומות מול 1, שלמה 08.10)
    const renumNew = new Map(), renumOld = new Set();
    (prevStops || []).forEach((s) => {
      if (curCodes.has(s[0]) || !s[1]) return;
      const t = (curStops || []).find((c) => !prevCodes.has(c[0]) && !renumNew.has(c[0]) && c[1] === s[1] &&
        Math.abs(c[2] - s[2]) < 0.005 && Math.abs(c[3] - s[3]) < 0.005);
      if (t) { renumNew.set(t[0], s[0]); renumOld.add(s[0]); }
    });
    // שם התחנה נפתח בחלון קופץ (popup) — הוא מוצמד לעוגן של התחנה והמפה
    // זזה אליו לבד, אז השם תמיד מוצג במקום הנכון גם בקצה המפה ובנייד.
    // האיבר החמישי בתחנה הוא מגבלת עלייה/ירידה מהפיד: אחת מכל תשע עצירות
    // מוגבלת כך, ובשום מקום לא כתוב לנוסע שבתחנה הזו רק מורידים.
    // 1 = אין הורדה (העלאה בלבד), 2 = אין העלאה (הורדה בלבד) — כפי שהצנרת
    // מקודדת (tools/linehistory.py). המיפוי היה הפוך והציג "העלאה בלבד"
    // על תחנות סופיות (דיווח שלמה, תחנה 787)
    const PD = { 1: "איסוף נוסעים בלבד (בלי הורדה)", 2: "הורדת נוסעים בלבד (בלי איסוף)", 3: "לא עוצר לנוסעים" };
    const popHtml = (s, status) =>
      `<b>${esc(s[1])}</b>${status ? `<br><span class="pst">${status}</span>` : ""}` +
      (PD[s[4]] ? `<br><span class="pst">⛔ ${PD[s[4]]}</span>` : "") +
      // הרציף של הווריאנט בתחנה הזו היום (platforms.json) — רק במסופים עם רציפים
      (plats && plats[String(s[0])] ? `<br><span class="pst">🛤️ רציף ${esc(String(plats[String(s[0])]))}</span>` : "") +
      // שם מנתוני משרד התחבורה (חופש מידע) — השם של היום, לא של התקופה
      (nowNames && nowNames.has(String(s[0])) ? `<br><span class="pcode">שם עדכני — שם התחנה כפי שהוא רשום היום; השם בתקופה הזו לא ידוע</span>` : "") +
      `<br><span class="pcode">${String(s[0]).startsWith('website:')?'מזהה פנימי במקור':'מק״ט תחנה'} ${esc(s[0])}</span>`;
    (curStops || []).forEach((s) => {
      // הגרסה הקודמת עשויה להיות שינוי תדירות בלי רצף תחנות, ואז אין מול מה
      // להשוות. רשימת התחנות שנוספו כבר חושבה בצנרת ונשמרה על הגרסה — היא
      // המקור האמין לסימון, ולא השוואה מול גרסה שאין בה גאומטריה.
      const isNew = !renumNew.has(s[0]) && (addedCodes ? addedCodes.has(s[0]) : (prevStops && !prevCodes.has(s[0])));
      const m = L.circleMarker([s[2], s[3]], {
        radius: isNew ? 8 : 5, color: isNew ? "#fff" : "#4c1d95", weight: 2,
        fillColor: isNew ? "#16a34a" : "#fff", fillOpacity: 1, opacity: focused && !isNew ? 0.4 : 1,
      }).addTo(map)
        .bindPopup(popHtml(s, isNew ? "🟢 תחנה שנוספה בגרסה זו" : renumNew.has(s[0]) ? "מק״ט חדש לתחנה (קודם " + esc(String(renumNew.get(s[0]))) + ")" : ""), { className: "lh-pop", offset: [0, -4] });
      // שם התחנה מוצג רק בלחיצה (popup צמוד לתחנה) — תוויות ריחוף בוטלו
      // לגמרי: הן נתקעו פתוחות והציגו שם כפול/ישן במקום אחר על המפה
    });
    (prevStops || []).forEach((s) => {
      if (curCodes.has(s[0]) || renumOld.has(s[0])) return;
      const m = L.circleMarker([s[2], s[3]], { radius: 8, color: "#dc2626", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .addTo(map)
        .bindPopup(popHtml(s, "🔴 תחנה שירדה מהקו בגרסה זו"), { className: "lh-pop", offset: [0, -4] });
    });
    // תחנות שירדו שאינן באף רשימה בקובץ (הצנרת פענחה מק"ט+מיקום מצילום
    // הארכיון, v.nc) — בלעדיהן התחנה שירדה פשוט לא הופיעה במפה
    (remPins || []).forEach((p) => {
      if (curCodes.has(p[0]) || prevCodes.has(p[0])) return;
      L.circleMarker([p[2], p[3]], { radius: 8, color: "#dc2626", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .addTo(map)
        .bindPopup(popHtml([p[0], p[1]], "🔴 תחנה שירדה מהקו בגרסה זו"), { className: "lh-pop", offset: [0, -4] });
    });
    return () => { mapRef.current = null; map.remove(); };
  }, [cur, prev, curStops, prevStops, addedCodes, focus, diff, chStops, focusPts, canFocus, stops12, shape12, remPins, sgO, sgN, plats, succ]);
  // סיכום טקסטואלי למי שלא רואה את המפה — המספרים כבר מחושבים ממילא
  const nAdd = (curStops || []).filter((s) => addedCodes && addedCodes.has(s[0])).length;
  const curC = new Set((curStops || []).map((s) => s[0]));
  const nRem = (prevStops || []).filter((s) => !curC.has(s[0])).length;
  const mapLabel = (pointsOnly ? "נקודות שנשמרו במפת המקור" : "מפת המסלול") + (prev ? " בהשוואה לגרסה הקודמת" : "") +
    (nAdd ? " · " + nAdd + " תחנות נוספו" : "") + (nRem ? " · " + nRem + " תחנות ירדו" : "");
  return (
    <div className="mapwrap">
      <div className="map" ref={ref} role="img" aria-label={mapLabel} />
      {canFocus && (
        <button className="focusbtn" title="החלפה בין תצוגת כל המסלול לבין התקרבות רק לקטע שבו היה השינוי" onClick={() => setFocus(!focus)}>
          {focus ? "🗺️ כל המסלול" : "🔍 רק הקטע ששונה"}
        </button>
      )}
      {/* כשרק צד אחד חרג מהסף (תיקון שרטוט קטן) — הצד השני הוא חיתוך
          מדויק של השרטוט שלו בין נקודות ההתפצלות; וכשהתוואי הישן עבר
          צמוד (כיכר חדשה בקו 26 — הקו הישן משיק לה) אין בכלל מה לסמן
          באדום, ואומרים את זה במקום להמציא קטע (דרישת שלמה) */}
      {diff && diff.derived === "prev" && diff.prevSegs.length > 0 && (
        <div className="mut">ℹ️ אדום = התוואי הישן, ירוק = התיקון.</div>
      )}
      {diff && diff.derived === "prev" && diff.prevSegs.length === 0 && (
        <div className="mut">ℹ️ נוסף תוואי (ירוק). הישן עבר צמוד לחדש, ולכן אין קטע אדום.</div>
      )}
      {diff && diff.derived === "cur" && diff.curSegs.length > 0 && (
        <div className="mut">ℹ️ ירוק = התיקון, אדום = מה שירד.</div>
      )}
      {diff && diff.derived === "cur" && diff.curSegs.length === 0 && (
        <div className="mut">ℹ️ ירד תוואי (אדום). החדש עובר צמוד לישן, ולכן אין קטע ירוק.</div>
      )}
      {diff && !diff.prevSegs.length && !diff.curSegs.length && (
        <div className="mut">ℹ️ השרטוטים כמעט זהים; ההבדל קטן מעשרות מטרים.</div>
      )}
    </div>
  );
}
