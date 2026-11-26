/* הקו בזמן · 10-stops.jsx — לשונית התחנות ועמוד תחנה (LinesAtStop, StopsTab).
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

/* ---------- טאב תחנות ---------- */
// ציר הקווים של תחנה בודדת: אילו קווים עצרו בה, מי נוסף ומי ירד ומתי
// (בקשת המשתמש). הנתונים: data/stopev/XX.json — נגזרים יומית מקובצי
// הקווים, כך ששינוי אצל קו נרשם אוטומטית גם אצל כל תחנה שהושפעה.
function LinesAtStop({ code, onClose }) {
  const plats = usePlatforms();   // הרציפים הפעילים בתחנה ומי עוצר בכל אחד (שלמה 07.09)
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [all, setAll] = useState(false);
  // קווי 2012 שעצרו בתחנה (מגיעים 2012, לפי המק"ט שהוצלב ברישום 2012) — שבר לפי קידומת (שלמה 22.09)
  const [l12, setL12] = useState(null);
  const [sty, setSty] = useState(null);   // סוג התחנה במאגר של משרד התחבורה (שלמה 10.10)
  useEffect(() => {
    setD(null); setErr(false); setAll(false); setL12(null); setSty(null);
    dfetch("data/stop-types/" + (code.length >= 2 ? code.slice(0, 2) : "0x") + ".json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => setSty(m[code] || ""))
      .catch(() => setSty(""));
    dfetch("data/stopev/" + (code.length >= 2 ? code.slice(0, 2) : "0x") + ".json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => setD(m[code] || { ev: [] }))
      .catch(() => setErr(true));
    dfetch("../magihim-2012/data/stop-lines/" + (code.slice(0, 2) || "0").padStart(2, "0") + ".json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => setL12(m[code] || []))
      .catch(() => setL12([]));
  }, [code]);
  const has12 = !!(l12 && l12.length);
  if (err && !has12) return null;
  if (d && !(d.ev || []).length && l12 !== null && !has12) return null;
  if (!d && !err) return <div className="lat"><div className="empty">⏳ טוען את קווי התחנה…</div></div>;
  const ev = (d && d.ev) || [];
  // מצב נוכחי: האירוע האחרון של כל וריאנט קובע אם הוא עוצר כאן היום
  const lastByRd = {};
  ev.forEach((e) => { lastByRd[e[2]] = e; });
  // "היום" = יש לו"ז לשבוע הקרוב (d.a, מפרסום הרישוי ל-10 הימים; נבנה בצינור).
  // וריאנט שהתיעוד אומר שהוא עוצר כאן אבל אין לו לו"ז אינו פעיל (שלמה 07.09)
  const active = Array.isArray(d && d.a) ? new Set(d.a) : null;   // הקובץ של היום נכשל אבל של 2012 נטען
  const nowMap = new Map();
  Object.values(lastByRd).forEach((e) => { if (e[3] !== "out" && e[3] !== "mvout" && e[1] && (!active || active.has(e[2]))) nowMap.set(e[1], e[2]); });
  const now = [...nowMap.entries()].sort((a, b) => (parseInt(a[0]) || 9e9) - (parseInt(b[0]) || 9e9) || String(a[0]).localeCompare(b[0]));
  // ציר הזמן: אירועי "התיעוד הראשון" של אותו תאריך מקובצים לשורה אחת,
  // וחלופות של אותו קו באותו יום לא מוצגות פעמיים
  const rows = [];
  const baseByDate = {};
  ev.forEach((e) => { if (e[3] === "base" && e[1]) (baseByDate[e[0]] = baseByDate[e[0]] || new Map()).set(e[1], e[2]); });
  Object.entries(baseByDate).forEach(([dte, lines]) => rows.push({ d: dte, k: "base", lines: [...lines.entries()] }));
  // mvin/mvout (הצינור מזהה קו שהפסיק בתחנה אחת והתחיל בתחנה שכנה באותו יום)
  // מוצגים כמו in/out רגילים: "קו 38 הפסיק לעצור בתחנה" — הניסוח "עבר לעצור
  // ב…" לא התבקש (שלמה 07.09). מעבר רציף אמיתי (רציף 2 ← רציף 1) מגיע
  // מנתוני הרציפים (platforms.json), לא מניחוש לפי שמות.
  const seen = new Set();
  ev.forEach((e) => {
    if (e[3] === "base") return;
    const k = e[3] === "mvin" ? "in" : e[3] === "mvout" ? "out" : e[3];
    const key = e[0] + "|" + e[1] + "|" + k;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ d: e[0], k, line: e[1] || "—", rd: e[2] });
  });
  rows.sort((a, b) => b.d.localeCompare(a.d));
  // אותו תאריך ואותו סוג — שורה אחת עם כל הקווים, במקום עשר שורות זהות (שלמה 07.09)
  const grouped = [], gk = {};
  rows.forEach((r) => {
    if (r.k === "base") { grouped.push(r); return; }
    const key = r.d + "|" + r.k;
    if (gk[key]) { gk[key].items.push([r.line, r.rd]); return; }
    gk[key] = { d: r.d, k: r.k, items: [[r.line, r.rd]] };
    grouped.push(gk[key]);
  });
  const shown = all ? grouped : grouped.slice(0, 30);
  // רציפים פעילים = רציפים (שורות בקובץ התחנות של המשרד, אותו מק"ט) שיש בהם
  // נסיעות בלוח הזמנים שבתוקף — לא כל הרציפים הבנויים (שלמה 07.09: "בתחנה זו
  // יש 16 רציפים פעילים"; במרכזית ראשל"צ יש גם רציפים בלי קווים)
  const pst = plats && plats.st && plats.st[code];
  const platNos = pst ? Object.keys(pst.p || {}).sort(platSort) : [];
  return (
    <div className="lat">
      <div className="lathead">🚌 הקווים בתחנה הזו לאורך זמן
        {onClose && <button className="latx" title="סגירת ציר הקווים" onClick={onClose}>✕</button>}
      </div>
      {sty && <div className="latnow" title="השדה StationTypeName במאגר התחנות של משרד התחבורה (data.gov.il)">🏷️ סוג התחנה במאגר של משרד התחבורה: <b>{sty}</b></div>}
      {platNos.length > 0 && (
        <details className="latplat">
          <summary title="לפי שורות הרציפים בקובץ התחנות של משרד התחבורה: רציף נחשב פעיל כשיש בו נסיעות בלוח הזמנים שבתוקף — מתעדכן מדי יום">
            🛤️ {platNos.length === 1
              ? <>בתחנה זו רציף פעיל אחד: <b>רציף {platNos[0]}</b></>
              : <>בתחנה זו יש <b>{platNos.length} רציפים פעילים</b> (רציפים שיש בהם קווים היום)</>}
          </summary>
          <div className="platlist">
            {platNos.map((p) => {
              // כמה חלופות של אותו קו באותו רציף — מספר הקו פעם אחת
              const seenL = new Set();
              const items = (pst.p[p] || []).filter(([rd2, l]) => { const k = l || rd2; if (seenL.has(k)) return false; seenL.add(k); return true; });
              return (
                <div key={p} className="platrow"><b>רציף {p}</b>:{" "}
                  {items.map(([rd2, l], j) => (
                    <React.Fragment key={rd2}>{j > 0 ? ", " : ""}<a href={lineHref(rd2)} title={rd2}>{l || rd2}</a></React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
        </details>
      )}
      {now.length > 0 && (
        <div className="latnow" title="קווים שעוצרים בתחנה לפי התיעוד ויש להם לו״ז לשבוע הקרוב (פרסום הרישוי ל-10 הימים)">עוצרים בה היום (יש להם לו״ז לשבוע הקרוב):{" "}
          {now.slice(0, 40).map(([l, rd2]) => <a key={l} className="badge sm latb" href={lineHref(rd2)}>{l}</a>)}
        </div>
      )}
      {has12 && (
        <div className="latnow" title="לפי מסלולי הקווים במאגר מגיעים 2012, שהוצלבו לרישום התחנות של 2012 (GTFS משרד התחבורה דרך OpenStreetMap). לחיצה פותחת את הקו כפי שהיה ב-2012">🕰️ ב-2012 עצרו כאן (מגיעים 2012):{" "}
          {l12.slice(0, 40).map((x) => <a key={x[0]} className="badge sm latb b12" href={"#2012/" + encodeURIComponent(x[0])} title={"קו " + x[1] + " · " + x[2] + " · " + x[3] + " — רצף התחנות והמסלול כפי שהיו ב-2012"}>{x[1]}</a>)}
          {l12.length > 40 ? <span className="mut">ועוד {l12.length - 40}</span> : null}
        </div>
      )}
      <div className="latlist">
        {shown.map((r, i) => r.k === "base"
          ? <div className="latrow" key={i}><span className="latd">{fmtD(r.d)}</span> {r.lines.length === 1
              ? <>🚏 קו <a href={lineHref(r.lines[0][1]) + "@" + r.d}><b>{r.lines[0][0]}</b></a> תועד בתחנה לראשונה</>
              : <>🚏 בתיעוד הראשון עצרו כאן {r.lines.length} קווים: {r.lines.slice(0, 25).map(([l, rd2], j) =>
                  <React.Fragment key={l + rd2}>{j > 0 ? ", " : ""}<a href={lineHref(rd2) + "@" + r.d}><b>{l}</b></a></React.Fragment>)}{r.lines.length > 25 ? "…" : ""}</>}</div>
          : r.items.length === 1
            ? <div className="latrow" key={i}><span className="latd">{fmtD(r.d)}</span> {r.k === "in"
                ? <>🆕 קו <a href={lineHref(r.items[0][1]) + "@" + r.d}><b>{r.items[0][0]}</b></a> התחיל לעצור בתחנה</>
                : <>➖ קו <a href={lineHref(r.items[0][1]) + "@" + r.d}><b>{r.items[0][0]}</b></a> הפסיק לעצור בתחנה</>}</div>
            : <div className="latrow" key={i}><span className="latd">{fmtD(r.d)}</span> {r.k === "in" ? "🆕" : "➖"} {r.items.length} קווים {r.k === "in" ? "התחילו לעצור בתחנה" : "הפסיקו לעצור בתחנה"}: {r.items.map(([l, rd2], j) =>
                <React.Fragment key={l + rd2}>{j > 0 ? ", " : ""}<a href={lineHref(rd2) + "@" + r.d}><b>{l}</b></a></React.Fragment>)}</div>)}
      </div>
      {grouped.length > shown.length && <button className="morebtn" onClick={() => setAll(true)}>⌄ כל {grouped.length.toLocaleString()} האירועים</button>}
      <div className="latnote">מחושב מהשוואת רצפי התחנות של כל הקווים לאורך התקופה. מעבר רציף נראה כאן כקו שירד — ועלה באותו תאריך ברציף השכן.</div>
    </div>
  );
}

function StopsTab({ sel, selN, idx, openLine }) {
  const [dailyOpen, setDailyOpen] = useState(true);
  useEffect(()=>{if(sel)setDailyOpen(true);},[sel,selN]);
  const earlyMonths = useHistoricalMonths("stops");
  const [months, setMonths] = useState(null);
  const [mon, setMon] = useState("");
  const [yr, setYr] = useState("");   // שנה נבחרת בבוחר החודשים
  const [chs, setChs] = useState(null);
  const [hist, setHist] = useState(null);   // קורות-חיים מצטברים לכל תחנה
  const [kinds, setKinds] = useState(() => new Set());   // סימון מרובה, כמו בקווים
  const [onlyNs, setOnlyNs] = useState(false);           // רק תחנות שהיו ברישום ולא בשירות
  const [katOpen, setKatOpen] = useState(false);
  const [q, setQ] = usePersistedQ("lh-q-stops");
  const [openKey, setOpenKey] = useState(null);   // שורת תחנה פתוחה עם מפה
  // ציר הקווים נסגר ב-✕ או ברגע שהחיפוש כבר לא מציג את התחנה שלו;
  // הסגירה מנקה גם את הכתובת, כדי שריענון לא יחזיר את הפאנל
  const [latHide, setLatHide] = useState(false);
  useEffect(() => setLatHide(false), [sel, selN]);
  const closeLat = () => {
    setLatHide(true);
    if ((location.hash || "").includes("stop=")) history.replaceState(null, "", "#t=stops");
  };
  // גם סגירה עקיפה — שינוי או מחיקה של החיפוש — מנקה את הכתובת, כדי
  // שלחיצה חוזרת על קישור התחנה תיחשב לניווט חדש ותפתח את הפאנל
  // selDone: רק אחרי שהחיפוש כבר קיבל את מק"ט הקישור. בסבב הראשון החיפוש
  // עדיין ריק, והכתובת ‎#stop=274‎ נמחקה ל-‎#t=stops‎ עוד לפני שהתחנה נפתחה —
  // ריענון (או "אתר למחשב") איבד את התחנה (הבדיקה האוטומטית, 18.09)
  useEffect(() => {
    if (sel && selDone.current && q.trim() !== sel && (location.hash || "").includes("stop="))
      history.replaceState(null, "", "#t=stops");
  }, [q, sel]);
  // 100 תחנות בטעינה (היו 250): ב"כל התקופה" כל קבוצה היא כמה שורות, ומאות
  // שורות בכל הקלדה הרגישו כקיפאון בטלפון. "הצג עוד" מרחיב.
  const [lim, setLim] = useState(100);   // "הצג עוד" מרחיב; סינון חדש מאפס
  const dq = useDebounced(q, 220);       // הסינון רץ אחרי הפסקה בהקלדה, לא על כל תו
  useEffect(() => setLim(100), [dq, mon, kinds, onlyNs]);
  // תחנה שהגיעה מהכתובת: כל קורות החיים שלה, ולא רק החודש שנבחר
  useEffect(() => {
    if (!sel) return;
    setMon("all"); setYr(""); setQ(sel); setKinds(new Set()); setOnlyNs(false);
  }, [sel, selN]);
  const toggleKind = (k) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // קורות החיים של כל התחנות הם 4.5 מגה, והם נדרשים רק ל"כל התקופה".
  // תצוגת חודש בודד מסתדרת עם קובץ של עשרות קילובייט כי הכללים שדרשו
  // אותם מסומנים מראש על האירוע (k1/xb), וקישור לתחנה מסתפק בשבר של
  // הקידומת שלה — כמאתיים קילובייט במקום ארבעה וחצי מגה.
  const [shard, setShard] = useState(null);   // המק"ט שהשבר שנטען שייך לו
  const [snap12, setSnap12] = useState(null); // רישום התחנות של 2012 (כולו ב"כל התקופה", שבר לתחנה מקישור)
  const [snapScope, setSnapScope] = useState(""); // "full" / "shard" — מה נטען ל-snap12
  const needHist = mon === "all" || !!sel;
  // מצב "2012" (שלמה 22.09): רק רישום התחנות של 2012 עם מה שהשתנה בכל תחנה עד 2017 —
  // בלי קורות החיים הכבדים
  const need12 = mon === "2012";
  const [ev12, setEv12] = useState(null);       // האירועים המוכנים מהשרת (2012 מול 2017)
  const [counts12, setCounts12] = useState(null);   // הספירה לכל סוג — קובץ זעיר שמגיע ראשון
  const ev12Busy = useRef(false);   // הקובץ הגדול נטען פעם אחת בלבד
  useEffect(() => {
    if (!(need12 || mon === "all") || ev12 || ev12Busy.current) return;
    ev12Busy.current = true;
    dfetch("../magihim-2012/data/stops-2012-counts.json").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCounts12((c) => c || d)).catch(() => {});
    dfetch("../magihim-2012/data/stops-2012-events.json").then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => { setEv12(expand2012(d.events)); if (d.counts) setCounts12(d); })
      .catch(() => setEv12([]));
  }, [need12, mon, ev12]);
  // ההשוואה ל-q הייתה מוקדמת מדי: החיפוש נקבע ל-sel באפקט אחר, ובסבב
  // הראשון הוא עדיין הערך הישן — ואז נטען הקובץ המלא במקום השבר.
  // shardLeft: אחרי שהחיפוש עזב את תחנת הקישור, הדגל נשאר דלוק והשבר
  // נטען שוב ושוב — חיפוש תחנה אחרת רץ בשקט על ~1% מהתחנות בלבד
  // והציג "אין תוצאות" על תחנות קיימות (ציד הבאגים, סבב ב).
  const shardLeft = useRef(false);
  useEffect(() => { shardLeft.current = false; }, [sel]);
  const wantShard = !!sel && !shardLeft.current;
  useEffect(() => {
    if (!needHist || hist) return;
    const done = (d) => setHist(d);
    const done12 = (d) => setSnap12(d && d.stops ? d.stops : d || {});
    setSnap12(null);
    setSnapScope(wantShard ? "shard" : "full");
    if (wantShard) {
      setShard(sel);
      const pre = (sel.slice(0, 2) || "0").padStart(2, "0");
      dfetch("data/stops/" + pre + ".json")
        .then((r) => (r.ok ? r.json() : {})).then(done).catch(() => done({}));
      dfetch("../magihim-2012/data/stops-2012/" + pre + ".json")
        .then((r) => (r.ok ? r.json() : {})).then(done12).catch(() => done12({}));
      return;
    }
    setShard(null);
    dfetch("data/stops-hist.json")
      .then((r) => (r.ok ? r.json() : {})).then(done).catch(() => done({}));
  }, [needHist, hist, wantShard, sel]);
  // חיפוש שיצא מהתחנה של הקישור — השבר כבר לא מספיק, וצריך את הכל.
  // הדגל נחוץ כי בסבב הראשון החיפוש עדיין מחזיק ערך קודם, ובלעדיו השבר
  // היה נזרק ונטען שוב בלולאה אינסופית.
  const selDone = useRef(false);
  useEffect(() => { selDone.current = false; }, [sel]);
  useEffect(() => {
    if (sel && q.trim() === sel) selDone.current = true;
    if (shard && selDone.current && q.trim() !== shard) { shardLeft.current = true; setHist(null); setShard(null); }
  }, [q, shard, sel]);
  // כללי התצוגה (בקשת המשתמש, בעקבות תחנות עונתיות כמו תחנות ההתרעננות):
  // "חדשה" — רק הרישום הראשון אי-פעם של התחנה; הרשמות חוזרות לא מוצגות.
  // "בוטלה" — רק אם עברה שנה בלי שחזרה; ומי שמופיעה ברישום הנוכחי
  // (גם בלי קווים שעוצרים בה) אינה מבוטלת.
  const keepEvent = (c) => {
    // בלי קורות החיים מכריעים לפי הסימונים שחושבו מראש: k1 — זה הרישום
    // הראשון של התחנה, xb — הביטול הזה כבר לא בתוקף. כלל השנה נשאר כאן,
    // כי הוא תלוי בתאריך של היום.
    if (!hist) {
      if (c.k === "new") return !!c.k1;
      if (c.k === "del") return !c.xb && Date.now() - new Date(c.d) >= 365 * 864e5;
      return true;
    }
    const evs = hist[c.c] || [];
    if (c.k === "new") {
      // "חדשה" = לידת התחנה: האירוע הראשון בכלל בקורות-החיים שלה. תחנה
      // שההיסטוריה שלה מתחילה בביטול קיימת מלפני התיעוד — ה"חדשה" שאחריו
      // היא חזרה לרישום, לא לידה
      return !evs.length || (evs[0].k === "new" && evs[0].d === c.d);
    }
    if (c.k === "del") {
      if (evs.some((e) => e.d > c.d && e.k === "new")) return false;   // חזרה לפעול
      const last = evs[evs.length - 1];
      if (last && last.k === "del" && last.now) return false;          // עדיין ברישום
      return Date.now() - new Date(c.d) >= 365 * 864e5;                // מבוטלת = מעל שנה
    }
    return true;
  };
  const [mErr, setMErr] = useState(false);
  const [chErr, setChErr] = useState(false);
  const [rty, setRty] = useState(0);
  useEffect(() => {
    let ok = true;
    setMErr(false);
    getMonths()
      .then((d) => { if (!ok) return;
        // מיון יורד מפורש — לא סומכים על הסדר שבדיסק (ראו הפיד של הקווים)
        const ms = (d.stopMonths || []).slice().sort().reverse();
        setMonths(ms);
        // ברירת המחדל: החודש האחרון — נטען מיידית. "כל התקופה" (פירוק
        // ומיון של כל קורות-החיים, מאות אלפי אירועים) רק בבחירה מפורשת
        // כשהגענו מקישור לתחנה, "כל התקופה" כבר נבחר — וטעינת החודשים
        // דרסה אותו בחודש האחרון, כך שהקישור נחת על מסך ריק
        if (ms.length && !sel) { setMon(ms[0]); setYr(ms[0].slice(0, 4)); } })
      .catch(() => { if (ok) { setMErr(true); setMonths([]); } });
    return () => { ok = false; };
  }, [rty]);
  useEffect(() => {
    // "כל התקופה" נבנית מקורות החיים ולא מקובץ חודש — בלי התנאי הזה נשלחה
    // בקשה ל-stops-all.json שתמיד חוזרת 404
    if (!mon || mon === "all" || mon === "2012" || (earlyMonths.includes(mon) && !months?.includes(mon))) return;
    // ביטול כשעוברים חודש: תשובה איטית של חודש קודם לא דורסת את החדש
    let ok = true;
    setChs(null); setChErr(false);
    // שנה שלמה ("Y:2025"): כל קובצי החודשים של השנה במקביל — כחצי מגה לשנה
    loadPeriod("stops-", mon, months)
      .then((chs) => { if (ok) setChs(chs); })
      .catch(() => { if (ok) { setChErr(true); setChs([]); } });
    return () => { ok = false; };
  }, [mon, rty, months]);
  // ממואם: בלי זה כל הקלדה בחיפוש בנתה ומיינה מחדש את כל האירועים (לאגים).
  // "כל התקופה": כל האירועים מכל הזמנים מתוך קורות-החיים, עם תאריך ליד כל אחד
  const source = useMemo(() => {
    // מחרוזת חיפוש אחת לכל אירוע, מחושבת פעם אחת — במקום ארבע החלפות-regex
    // לכל אירוע בכל הקלדה; המיון בהשוואת מחרוזות רגילה (localeCompare איטי פי 2)
    const withS = (e) => ({ ...e, s: sQ(e.n) + "|" + sQ(e.nn) + "|" + sQ(e.on) + "|" + sQ(e.t) });
    // קישור לתחנה: עד שהחודש הפך ל"כל התקופה" והשבר שלה נטען, הרשימה
    // הראתה לרגע תחנות אחרות מהחודש הנוכחי שמספרן מכיל את המק"ט — מסך
    // "טוען" במקום זה (הבדיקה האוטומטית תפסה: ‎#stop=274‎ "נפתחה על תחנה אחרת")
    if (sel && !shardLeft.current && (mon !== "all" || !hist)) return null;
    const raw = mon === "2012"
      ? (ev12 ? ev12.map(withS).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)) : null)
      : mon === "all"
      ? (hist ? Object.entries(hist).flatMap(([c, evs]) => evs.map((e) => withS({ ...e, c })))
          // רישום 2012: אירוע לכל תחנה שהייתה אז — אחרי כל השאר, כי הוא הישן ביותר
          .concat(ev12 ? ev12.map(withS) : []).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)) : null)
      : (chs ? chs.map(withS) : chs);
    // כשמגיעים לתחנה מקישור מציגים את כל מה שידוע עליה. כללי התצוגה
    // נועדו לפיד החודשי, ובתחנה מסוימת הם הסתירו גם את מה שביקשו לראות:
    // ‎#stop=48‎ הראה מסך ריק, כי שני האירועים שלה נחשבים "חוזרים".
    return raw === null ? null
      : raw.filter((c) => !hiddenEv(c) && ((sel && c.c === sel) || keepEvent(c)));
  }, [mon, hist, chs, sel, snap12, snapScope, ev12]);
  const counts = useMemo(() => {
    const cn = {};
    (source || []).forEach((c) => { cn[c.k] = (cn[c.k] || 0) + 1; });
    return cn;
  }, [source]);
  // ב-useMemo — הסינון על עשרות אלפי אירועים לא רץ מחדש בפעולות שאינן
  // חיפוש (סעיף 14); הערה קיימת על source מסבירה את אותו לאג
  const { nsCount, list } = useMemo(() => {
    const needle = dq.trim(); const sNeedle = sQ(needle);
    const ls = (source || []).filter((c) => (!kinds.size || kinds.has(c.k)) && (!onlyNs || c.ns) &&
      (!needle || c.s.includes(sNeedle) || c.c === needle));
    return { nsCount: (source || []).filter((c) => c.ns).length, list: ls };
  }, [source, dq, kinds, onlyNs]);
  const availableMonths = [...new Set([...(months || []), ...earlyMonths])].sort().reverse();
  const earlySelected = earlyMonths.includes(mon) && !months?.includes(mon);
  if (months === null) return <div className="card">טוען…</div>;
  if (mErr) return <div className="card"><NetErr onRetry={() => { setMonths(null); setRty((n) => n + 1); }} /></div>;
  if (!months.length) return <div className="card"><div className="empty">עדיין אין נתוני שינויי תחנות — הם יצטברו מהריצות היומיות הקרובות.</div></div>;
  return (
    <div className="card">
      <button className="kathead" aria-expanded={dailyOpen} onClick={()=>setDailyOpen(!dailyOpen)}>📅 שינויים לפי יום — מה השתנה בכל תאריך, בכל התחנות</button>
      {dailyOpen && <>
      {/* בוחר לפי שנה: slice(0,18) הישן הסתיר את כל מה שלפני 02.2025 —
          עכשיו כל שנה נגישה בלחיצה, והחודשים שלה נפתחים מתחתיה */}
      <div className="months">
        <button className={"mchip" + (mon === "all" ? " on" : "")} aria-pressed={mon === "all"} title="כל האירועים מכל השנים ברצף אחד" onClick={() => { setYr(""); setMon("all"); }}>🗓️ כל התקופה</button>
        {/* מהחדשה לישנה, באותו כיוון של החודשים בתוך כל שנה.
            stopMonths ממוין יורד (בניגוד ל-months של הקווים) — החודש
            החדש של שנה הוא ms[0], וה-reverse היה הופך את סדר התצוגה */}
        {[...new Set(availableMonths.map((m) => m.slice(0, 4)))].sort().reverse().map((y) => (
          <button key={y} className={"mchip" + (yr === y ? " on" : "")} aria-pressed={yr === y}
            title={"פתיחת חודשי " + y} onClick={() => { setYr(y); const ms = availableMonths.filter((m) => m.startsWith(y)); if (!ms.includes(mon) && mon !== "Y:" + y) setMon(ms[0]); }}>{y}</button>
        ))}
        <button className={"mchip" + (mon === "2012" ? " on" : "")} aria-pressed={mon === "2012"}
          title="רישום התחנות של משרד התחבורה מ-2012 (דרך OpenStreetMap) — כל תחנה שהייתה אז, ומה השתנה בה עד תחילת התיעוד ב-2017"
          onClick={() => { setYr(""); setMon("2012"); }}>2012 · OpenStreetMap</button>
      </div>
      {mon === "2012" && (
        <div className="pdesc" style={{ margin: "12px 0" }}>🕰️ כל תחנה ברישום משרד התחבורה מ-2012, ומה השתנה בה עד 2017: שם, מיקום או ביטול.
          {counts12 ? ` ${counts12.stops.toLocaleString()} תחנות.` : ""}{ev12 ? "" : " טוען את הרשימה…"}
          <details className="howcalc"><summary>איך זה מחושב</summary>
            <p>32,987 תחנות מקובץ ה-GTFS של משרד התחבורה מ-2012, כפי שיובאו ל-<a href="https://www.openstreetmap.org/changeset/14265835" target="_blank" rel="noopener">OpenStreetMap</a> (רישיון ODbL).
              לכל תחנה: השם, הכתובת והמיקום של אז, ומה השתנה באותו מק״ט עד תחילת התיעוד שלנו במרץ 2017. הזזה = 30 מ׳ ומעלה. מק״ט שנמצא ב-2017 במרחק קילומטר ומעלה נחשב תחנה אחרת, לא הזזה.</p>
            <p>מק״ט של 7 ספרות שמתחיל ב-99 הוא מספר זמני שמשרד התחבורה נתן בקובץ 2012 לתחנה בלי מספר שלט. 2,516 כאלה שאף קו לא עצר בהן לא מוצגות; 49 שהן כפילות של תחנה אמיתית באותו שם עד 100 מ׳ מוצגות כתחנה האמיתית; 35 (בעיקר בסיסים, בתי כלא ומחסומים) מוצגות עם הסימון ״מק״ט זמני״.</p>
            {counts12 && <p>מחושב מראש ומתעדכן כל לילה · עדכון אחרון: {counts12.gen}</p>}
          </details></div>
      )}
      {yr && (
        <div className="months">
          {months.some(m=>m.startsWith(yr)) && <button className={"mchip" + (mon === "Y:" + yr ? " on" : "")} aria-pressed={mon === "Y:" + yr} title={"כל שינויי התחנות של שנת " + yr + " ברצף אחד"} onClick={() => setMon("Y:" + yr)}>🗓️ כל {yr}</button>}
          {availableMonths.filter((m) => m.startsWith(yr)).map((m) => (
            <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} title="הצגת השינויים של החודש הזה בלבד" onClick={() => setMon(m)}>{m.split("-").reverse().join(".")}</button>
          ))}
        </div>
      )}
      {earlySelected ? <HistoricalPeriod key={mon} idx={idx} openLine={openLine} mode="stops" year={yr} month={mon} embedded /> : <>
      <input className="search" type="search" placeholder="חיפוש תחנה / עיר / מק״ט…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="katbox">
        <button className="kathead" aria-expanded={katOpen} onClick={() => setKatOpen(!katOpen)}>
          <span className="katarrow" aria-hidden="true">{katOpen ? "▼" : "◀"}</span>
          🗂️ קטגוריות לבחירה
          {kinds.size > 0 && <b className="katn">{kinds.size} מסומנות</b>}
        </button>
        {katOpen && (
          <div className="katlist">
            {Object.entries(SKINDS).map(([k, v]) => (
              <label key={k} className="katrow">
                <input type="checkbox" checked={kinds.has(k)} onChange={() => toggleKind(k)} />
                <i className="katdot" style={{ background: v.color }} />
                <span className="katlab">{v.label}</span>
                {/* בזמן החלפת תקופה המונה הראה 0 מטעה לכמה שניות (בקשת
                    שלמה) — עד שהנתונים נטענים כתוב בו "טוען" */}
                <b className="katc">{source === null ? (mon === "2012" && counts12 ? (counts12.counts[k] || 0).toLocaleString() : "טוען…") : (counts[k] || 0).toLocaleString()}</b>
              </label>
            ))}
            {/* תחנות שלא נמצאו במסלול של אף קו מהמתועדים אצלנו. חלקן
                אושרו ברישוי ולא נפתחו לציבור — ולכן דווקא הן מעניינות.
                אי אפשר לקבוע שאף קו לא עצר בהן: הכיסוי שלנו חלקי, וזה
                מה שהסינון אומר ולא יותר. */}
            <div className="katgrp">רישום מול שירות</div>
            <label className="katrow">
              <input type="checkbox" checked={onlyNs} onChange={() => setOnlyNs(!onlyNs)} />
              <i className="katdot" style={{ background: "#64748b" }} />
              <span className="katlab">רק תחנות שלא נמצאו במסלול של אף קו</span>
              <b className="katc">{chs === null ? "טוען…" : nsCount.toLocaleString()}</b>
            </label>
            {kinds.size > 0 && (
              <button className="katclear" onClick={() => setKinds(new Set())}>✖ נקה את הבחירה</button>
            )}
          </div>
        )}
      </div>
      {sel && !latHide && q.trim() === sel && <LinesAtStop code={sel} onClose={closeLat} />}
      {source === null ? "טוען…" : (
        <div className="slist">
          <div className="dayhelp">לחיצה על המק״ט 🔗 מעתיקה קישור לתחנה</div>
          {(() => {
            // כל השינויים של אותה תחנה מקובצים יחד (בקשת המשתמש)
            const groups = [];
            const byCode = new Map();
            for (const c of list) {
              let g = byCode.get(c.c);
              if (!g) { g = { code: c.c, evs: [] }; byCode.set(c.c, g); groups.push(g); }
              g.evs.push(c);
            }
            const shown = groups.slice(0, lim);
            const evRow = (c, one) => {
              const k0 = c.c + c.k + c.d;
              return (
                <React.Fragment key={k0}>
                {/* השורה לחיצה לעכבר; הכפתור האמיתי למקלדת/קורא מסך הוא
                    סמל המפה בסופה — בלי כפתור-בתוך-כפתור (הביקורת) */}
                <div className={"srow" + (one ? "" : " sub") + (c.la != null ? " clk" : "")}
                  onClick={() => { if (c.la != null) setOpenKey(openKey === k0 ? null : k0); }}>
                  <span className="k" style={{ background: (SKINDS[c.k] || {}).color }}>{c.k === "platform" && c.pv ? (c.st === "add" ? "רציף נוסף" : "רציף בוטל") : (SKINDS[c.k] || { label: c.k }).label}</span>
                  {one ? (
                    <span className="nm">
                      {c.k === "renamed" ? <><s>{c.on}</s> ← <b>{c.nn}</b></> : <b>{c.n}</b>}
                      <StopCode code={c.c} />
                      <a className="latlink" href={"#stop=" + c.c} title="אילו קווים עצרו בתחנה ומה השתנה"
                        onClick={(e) => e.stopPropagation()}>🚌 קווים</a>
                    </span>
                  ) : (c.k === "renamed" && <span className="nm"><s>{c.on}</s> ← <b>{c.nn}</b></span>)}
                  {/* רשומה ברישום שאף קו לא עצר בה. בלי הסימון "תחנה חדשה"
                      נקרא כאילו נוספה תחנה שאפשר לחכות בה — וזה לא נכון. */}
                  {c.ns && <TipTag cls="nsflag" tip="התחנה לא נמצאה במסלול של אף קו מהקווים שמתועדים אצלנו. ייתכן שהיא אושרה ברישוי ולא נפתחה לציבור, וייתכן שעצר בה קו שרצף התחנות שלו חסר לנו">ברישום בלבד</TipTag>}
                  {/* רק על "תחנה חדשה", ששם זה תיקון של מה שכתוב: התחנה
                      חזרה לרישום, לא נבנתה. על שאר סוגי האירועים זו הערת
                      רקע שלא מוסיפה כלום, ולכן היא לא מוצגת. */}
                  {c.m12 && c.k === "new" && <TipTag cls="m12flag"
                    tip="התחנה כבר הופיעה במסלול של קו במאגר מגיעים מ-2012, ולכן אין מדובר בתחנה שנבנתה עכשיו אלא בחזרה לרישום הארצי">
                    הייתה כבר ב-2012</TipTag>}
                  <span className="meta">
                    {one && c.t ? c.t + " · " : ""}{c.b12 ? <span title="השוואה בין רישום התחנות של 2012 לרישום הראשון שיש לנו, ממרץ 2017 — המועד המדויק לא ידוע">בין 2012 ל-2017</span> : fmtD(c.d)}
                    {/* אירועי 2015–2017 מצילומי אופן באס (src=ob): בין צילומים רחוקים היום המדויק לא ידוע */}
                    {c.ap ? <TipTag cls="approxd" tip={"בערך — לפי נתוני משרד התחבורה (חופש מידע)"}>≈ תאריך מקורב</TipTag> : c.sd && gapDays(c.sd, c.d) > 3 ? <> <TipTag cls="approxd" tip={"השתנה בין " + fmtD(c.sd) + " ל-" + fmtD(c.d) + " — היום המדויק אינו ידוע"}>≈ תאריך מקורב</TipTag></> : null}
                    {/* בלי המיקום הקודם השורה יצאה "הוזזה מ׳ · (, ) ← (…)" —
                        חצים ריקים משני הצדדים. כשהוא חסר מוצג היעד בלבד. */}
                    {/* dir=ltr על זוג הקואורדינטות: בטקסט עברי הפסיק והרווח
                        מקבלים כיוון RTL וסדר lat/lon התהפך ויזואלית */}
                    {c.k === "city" && <> · <s>{c.oc}</s> ← <b>{c.nc}</b></>}
                    {c.k === "stype" && <> · סוג התחנה במאגר של משרד התחבורה: <s>{c.ot}</s> ← <b>{c.nt}</b></>}
                    {c.reused && <> · המק״ט עבר לתחנה אחרת: <b>{c.reused}</b> · {c.rdist >= 1000 ? (c.rdist / 1000).toFixed(1) + " ק״מ" : c.rdist + " מ׳"}</>}
                    {c.tmp99 && <> · <TipTag cls="nsflag" tip="מק״ט שמתחיל ב-99: בקובץ 2012 לתחנה לא היה מספר שלט, ומשרד התחבורה נתן לה מספר זמני. היום היא רשומה כנראה תחת מק״ט אחר, ולכן אין כאן המשך">מק״ט זמני</TipTag></>}
                    {c.k === "gtfs2012" && <> · <span dir="ltr">({c.la}, {c.lo})</span>
                      {" "}· <a href="https://www.openstreetmap.org/changeset/12028672" target="_blank" rel="noopener" title="רישום התחנות של משרד התחבורה מיוני 2012 (GTFS), כפי שיובא ל-OpenStreetMap ב-26.06.2012" onClick={(e) => e.stopPropagation()}>מקור: GTFS 06.2012 דרך OSM</a></>}
                    {/* רציף (pv=2, tools/platforms.py): רציף במסוף שקיבל קווים / נשאר בלי קווים —
                        רק זה "שינוי ברציף התחנה" (שלמה 07.09), לא קפיצה של מספר ברישום */}
                    {/* אירועי הארכיון (src=tf/ob, tools/backfill_platform_rows.py) נגזרים מקובץ
                        התחנות בלבד — הרציף הופיע/נעלם מהרישום, ומי עצר בו לא ידוע */}
                    {c.k === "platform" && c.pv && (c.st === "add"
                      ? <> · 🆕 <b>רציף {c.pl}</b> נוסף{(c.lines || []).length ? <> — עוצרים בו: {c.lines.join(", ")}</> : c.src ? " (לפי קובץ התחנות בארכיון)" : ""}</>
                      : <> · ➖ <b>רציף {c.pl}</b> בוטל{(c.lines || []).length ? <> (נשאר בלי קווים) — עצרו בו: {c.lines.join(", ")}</> : c.src ? " (נעלם מקובץ התחנות בארכיון)" : ""}</>)}
    {/* ניסוח פשוט (בקשת שלמה): "השם הישן היה… השם החדש הוא…". אירועי
                        "הפכה/חדלה להיות תחנת יעד" הוסרו כליל — רק שינויי שם */}
                    {c.k === "pubdest" && c.st === "ren" &&
                      <> · תחנת היעד לפרסום שוּנתה · השם הישן היה: <b>{c.oh}</b> · השם החדש הוא: <b>{c.nh}</b></>}
                    {c.k === "moved" && (c.ola != null
                      ? <> · הוזזה <b>{c.dist || c.m} מ׳</b> · <s dir="ltr">({c.ola}, {c.olo})</s> ← <b dir="ltr">({c.la}, {c.lo})</b></>
                      : <> · הוזזה <b>{c.dist || c.m} מ׳</b> · אל <b dir="ltr">({c.la}, {c.lo})</b></>)}
                    {c.lines && c.lines.length > 0 && c.k !== "platform" && <> · {c.k === "new" ? "קווים שעצרו בה מהפתיחה" : "קווים שעצרו בה אז"}: {c.lines.slice(0, 10).join(", ")}</>}
                    {c.la != null && <> · <button className="mapbtn" aria-expanded={openKey === k0}
                      aria-label={"מפת התחנה " + (c.n || c.nn || c.c)}
                      onClick={(e) => { e.stopPropagation(); setOpenKey(openKey === k0 ? null : k0); }}>🗺️</button></>}
                  </span>
                </div>
                {openKey === k0 && c.la != null && <StopEvMap ev={c} />}
                </React.Fragment>
              );
            };
            const rows = shown.map((g) => {
              if (g.evs.length === 1) return evRow(g.evs[0], true);
              const head = g.evs[0];
              const nm = head.nn || head.n || (g.evs.find((e) => e.n || e.nn) || {}).n || "";
              return (
                <div className="sgroup" key={g.code}>
                  <div className="srow ghead">
                    <span className="nm"><b>{nm}</b>
                      <StopCode code={g.code} />
                      <a className="latlink" href={"#stop=" + g.code} title="אילו קווים עצרו בתחנה ומה השתנה"
                        onClick={(e) => e.stopPropagation()}>🚌 קווים</a></span>
                    <span className="meta">{head.t ? head.t + " · " : ""}{g.evs.length} שינויים</span>
                  </div>
                  {g.evs.map((c) => evRow(c, false))}
                </div>
              );
            });
            return (
              <React.Fragment>
                {rows}
                {groups.length > lim && (
                  <button className="morebtn" onClick={() => setLim(lim + 150)}>
                    ⌄ הצג עוד — מוצגות {shown.length.toLocaleString()} מתוך {groups.length.toLocaleString()} תחנות
                  </button>
                )}
              </React.Fragment>
            );
          })()}
          {list.length === 0 && (chErr
            ? <NetErr onRetry={() => setRty((n) => n + 1)} />
            : <div className="empty">אין שינויים תואמים בתקופה הזו.</div>)}
        </div>
      )}
      </>}
      </>}
    </div>
  );
}
