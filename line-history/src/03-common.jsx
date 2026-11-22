/* הקו בזמן · 03-common.jsx — עזרים משותפים לממשק: קישורים, תגיות, אירועים זמניים, hooks לנתוני עזר (רציפים, 2012, רכבת).
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

/* שורת קו כקישור אמיתי: קליק רגיל נשאר בתוך האפליקציה, Ctrl/קליק־אמצעי
   פותחים את דף הקו בכרטיסייה חדשה (לכל קו יש כתובת משלו אחרי ה-#) */
const lineHref = (r) => "#" + encodeURIComponent(r);
// לקו יש כתובת משלו ולתחנה לא הייתה — אי אפשר היה לשלוח למישהו שינוי
// בתחנה מסוימת, רק להעתיק לו טקסט. ‎#stop=<מק"ט>‎ פותח את התחנה עם כל
// קורות החיים שלה.
const stopHref = (c) => "#stop=" + encodeURIComponent(c);
const plainClick = (e) => !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey);
// כפתור "חזרה" כקישור אמיתי לרשימה (‎#t=<טאב>‎ או שורש הכלי) — אפשר לפתוח אותו בלשונית חדשה,
// ולחיצה רגילה נשארת חזרה בתוך הדף (שומרת את החיפוש)
const BackLink = ({ href, onBack, title, children }) => (
  <a className="back" href={href || "./"} title={title}
    onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); onBack(); }}>{children}</a>);

/* תגית עם הסבר שנפתח בהקשה: title מוצג רק בריחוף עכבר, ובטלפון אין
   ריחוף — רוב הקהל לא ראה את ההסברים האלה מעולם. הקשה על התגית פותחת
   את אותו הסבר כשורה קטנה מתחתיה, והקשה נוספת סוגרת. */
function TipTag({ cls, tip, children }) {
  const [open, setOpen] = useState(false);
  // כשאותו רכיב מקבל הסבר אחר (החלפת חודש/סינון עם key זהה) — ההסבר
  // הפתוח נסגר, אחרת הוא נשאר "תקוע" ליד תוכן שכבר התחלף
  useEffect(() => { setOpen(false); }, [tip]);
  return (
    <>
      <span className={(cls || "") + " tiptag"} title={tip} role="button" tabIndex={0}
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(!open); } }}>
        {children}</span>
      {open && <span className="tipnote" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>ℹ️ {tip}</span>}
    </>
  );
}

/* "שינוי זמני" — קטגוריה בציר הזמן של הקו (שלמה 18.10): עבודות, עקיפות ותחנות שבוטלו זמנית
   קצר, מהודעות משרד התחבורה. נשמרים רק שינויים שכבר התחילו, ונשארים בהיסטוריה גם אחרי שנגמרו.
   הנתונים: data/temp/<מק"ט>.json (tools/alerts_fetch.py). שורה קצרה, ולחיצה פותחת את ההודעה המלאה. */
const tmpT = (x) => { if (!x) return null; const t = typeof x === "number" ? x * 1000 : Date.parse(x); return isFinite(t) ? t : null; };
const tmpDM = (t) => { try { return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" }).format(new Date(t)); } catch (e) { return ""; } };
function useTempEvents(rd) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let ok = true;
    setList([]);
    const mk = String(rd || "").split("-")[0];
    if (!/^\d+$/.test(mk)) return undefined;
    fetch("data/temp/" + mk + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!ok || !d || !Array.isArray(d.ev)) return;
      // רק שינוי מסלול או תחנות — לא פקקים, תאונות ועיכובים (k:"info"; שלמה 28.10)
      setList(d.ev.filter((t) => t && t.d && t.k !== "info" && (!t.rds || t.rds.includes(rd))).sort((a, b) => (a.d < b.d ? 1 : -1)));
    }).catch(() => {});
    return () => { ok = false; };
  }, [rd]);
  return list;
}
/* מפת השינוי הזמני (שלמה 19.10): המסלול הרגיל ליד השינוי, הקטע שנסגר, המסלול החלופי המשוער
   ותחנות שבוטלו או נוספו — כמו בהקו המודיע. data/temp-map/<מזהה ההודעה>.json, נשמר גם אחרי שההודעה ירדה. */
function TempMap({ id, rd }) {
  const ref = useRef(null);
  const [m, setM] = useState(undefined);
  useEffect(() => {
    let ok = true;
    fetch("data/temp-map/" + id + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (ok) setM(d && (d.r || []).find((x) => x.rd === rd) || (d && d.r && d.r.length === 1 ? d.r[0] : null)); })
      .catch(() => ok && setM(null));
    return () => { ok = false; };
  }, [id, rd]);
  useEffect(() => {
    if (!m || !ref.current || !window.L) return undefined;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const sh = m.sh || [], c0 = m.c ? m.c[0] : -1, c1 = m.c ? m.c[1] : -1;
    const grey = { color: "#64748B", weight: 4, opacity: 0.8 };
    if (c0 >= 0) {
      L.polyline(sh.slice(0, c0 + 1), grey).addTo(map);
      L.polyline(sh.slice(c0, c1 + 1), { ...grey, opacity: 0.7, dashArray: "6 7" }).addTo(map);
      L.polyline(sh.slice(c1), grey).addTo(map);
    } else L.polyline(sh, grey).addTo(map);
    let focus = c0 >= 0 ? sh.slice(Math.max(0, c0 - 3), c1 + 4) : sh.slice();
    if (m.est) {
      L.polyline(m.est, { color: "#fff", weight: 9, opacity: 0.9 }).addTo(map);
      L.polyline(m.est, { color: "#E2531F", weight: 5 }).addTo(map);
      focus = focus.concat(m.est);
    }
    (m.x || []).forEach((st) => {
      L.circleMarker([st[0], st[1]], { radius: 7, color: "#B91C1C", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .addTo(map).bindTooltip(esc(st[3] || "") + (st[2] ? " · " + st[2] : "") + " · מבוטלת");
      focus.push([st[0], st[1]]);
    });
    (m.a || []).forEach((st) => {
      L.circleMarker([st[0], st[1]], { radius: 6, color: "#fff", weight: 2, fillColor: "#1D4ED8", fillOpacity: 1 })
        .addTo(map).bindTooltip(esc(st[3] || "") + (st[2] ? " · " + st[2] : "") + " · תחנה חלופית");
      focus.push([st[0], st[1]]);
    });
    const b = L.latLngBounds(focus.length > 1 ? focus : sh);
    if (b.isValid()) map.fitBounds(b.pad(0.25), { maxZoom: 17 });
    return () => map.remove();
  }, [m]);
  if (m === undefined) return <div className="sub">המפה נטענת…</div>;
  if (!m) return null;
  return (
    <div onClick={(ev) => ev.stopPropagation()}>
      <div className="smap" ref={ref} role="img" aria-label="מפה: השינוי הזמני במסלול" />
      <div className="tmpleg">
        <span><i style={{ borderTop: "3px solid #64748B" }} />המסלול הרגיל</span>
        {m.c && <span><i style={{ borderTop: "3px dashed #64748B" }} />הקטע שנסגר</span>}
        {m.est && <span><i style={{ borderTop: "4px solid #E2531F" }} />מסלול חלופי משוער, לפי ההודעה</span>}
        {(m.x || []).length > 0 && <span><b style={{ color: "#B91C1C" }}>○</b> תחנה מבוטלת</span>}
        {(m.a || []).length > 0 && <span><b style={{ color: "#1D4ED8" }}>●</b> תחנה חלופית</span>}
      </div>
    </div>
  );
}
function TempEv({ t, rd }) {
  // אותו מבנה כמו שאר האירועים בציר הזמן (שלמה 18.10): תאריך, תגית, שורת תיאור, מקור, תחנות
  const [open, setOpen] = useState(false);
  const s = tmpT(t.s), e = tmpT(t.e), now = Date.now();
  const dates = s && e && tmpDM(s) !== tmpDM(e) ? fmtD(t.d) + " – " + tmpDM(e) : fmtD(t.d);
  const live = s && s <= now && (!e || e >= now);
  const lbl = (l) => l.map((x) => x[1] + (x[0] ? " (" + x[0] + ")" : "")).join(", ");
  return (
    <div className={"ev tmpev" + (open ? " sel" : "")} onClick={() => setOpen(!open)}>
      <div className="d"><span>{dates}</span>{live ? " · פעיל עכשיו" : ""}</div>
      <div className="t">
        <button className="k kbtn" style={{ background: KINDS.temp.color }} aria-expanded={open}
          onClick={(ev) => { ev.stopPropagation(); setOpen(!open); }}>{KINDS.temp.label}</button>
        <span className="evnote"> {t.cl ? t.cl + " — " : ""}{t.h}</span>
      </div>
      <div className="evsrc">הודעת משרד התחבורה על שינוי זמני, דרך bus-alerts.com</div>
      {((t.rm || []).length > 0 || (t.add || []).length > 0) && <div className="sub">
        {(t.rm || []).length > 0 && <div>➖ תחנות שבוטלו זמנית: {lbl(t.rm)}</div>}
        {(t.add || []).length > 0 && <div>➕ תחנות חלופיות: {lbl(t.add)}</div>}
      </div>}
      {t.m && (open ? <TempMap id={t.id} rd={rd} /> : <div className="sub"><span className="tmpmore">🗺 מפת השינוי ⌄</span></div>)}
      {t.d2 && t.d2 !== t.h && <div className="sub">{open
        ? <div className="tmptxt" onClick={(ev) => ev.stopPropagation()}>{t.d2}</div>
        : <span className="tmpmore">נוסח ההודעה ⌄</span>}</div>}
    </div>
  );
}

/* הודעת כשל רשת אחידה עם כפתור ניסיון חוזר — במקום "אין נתונים" מטעה */
function NetErr({ onRetry }) {
  return (
    <div className="empty">📡 הנתונים לא ירדו — כנראה תקלת רשת רגעית.{" "}
      <button className="morebtn" onClick={onRetry}>↻ נסו שוב</button></div>
  );
}

/* חיפוש שנשמר בין ניווטים: חזרה מעמוד קו לא מוחקת את מה שהוקלד */
function usePersistedQ(key) {
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem(key) || ""; } catch (e) { return ""; } });
  useEffect(() => { try { sessionStorage.setItem(key, q); } catch (e) { /* דפדפן חוסם אחסון */ } }, [key, q]);
  return [q, setQ];
}
// ערך שמתעדכן רק אחרי הפסקה בהקלדה: הסינון של "כל התקופה" בטאב התחנות מרנדר
// מאות שורות, וכל תו הריץ אותו מחדש — בטלפון זה איטי (שלמה 06.09)
function useDebounced(v, ms) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/* עוגן 2012: rd -> תקציר המסלול דאז (נטען פעם אחת לכל הדפדוף) */
let ANC2012 = null;
let ANC_SET = new Set();   // המק"טים שהוצלבו — לסינון "2012" בחיפוש
/* months.json נטען פעם אחת לביקור: שלוש קומפוננטות (מסך הבית, הפיד
   היומי וטאב התחנות) ביקשו אותו כל אחת בנפרד. כשל מנקה את המטמון כדי
   שכפתור "נסו שוב" באמת ינסה שוב. */
let MONTHS_P = null;
const getMonths = () => MONTHS_P || (MONTHS_P = dfetch("data/months.json")
  .then((r) => r.json())
  .catch((e) => { MONTHS_P = null; throw e; }));

/* רציפים (platforms.json v2, tools/platforms.py — נכתב בכל ריצה יומית מהשורות
   של הרציפים בקובץ התחנות של המשרד): st — לכל מק"ט הרציפים שיש בהם נסיעות
   בתוקף ומי עוצר בכל אחד; rd — לכל וריאנט הרציף שלו בכל תחנה. נטען פעם אחת;
   כשל או קובץ ישן = בלי רציפים, בלי לשבור את הדף. */
/* "למה הרכבת הזו?" (שלמה 05.10): רכבות שפעלו שנה או פחות, והסיבה שנמצאה באינטרנט ואומתה
   (tools/rail_short_lived.py + פאנל חיפוש → data/rail-reasons.json). "!" מופיע רק כשיש סיבה
   מאומתת; בלי סיבה — בלי סימון. קובץ חסר = בלי סימונים, בלי לשבור את הדף. */
let RAILWHY_P = null;
const getRailWhy = () => RAILWHY_P || (RAILWHY_P = dfetch("data/rail-reasons.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => (d && d.rd ? d : { rd: {} }))
  .catch(() => ({ rd: {} })));
function useRailWhy(rd) {
  const [w, setW] = useState(null);
  useEffect(() => { let on = true; getRailWhy().then((d) => { if (on) setW(d.rd[rd] || null); }); return () => { on = false; }; }, [rd]);
  return w;
}
function WhyMark({ rd }) {
  const w = useRailWhy(rd);
  return w ? <span className="whymark" title={"למה הרכבת הזו פעלה רק זמן קצר? " + w.text}>!</span> : null;
}
let PLAT_P = null;
const getPlatforms = () => PLAT_P || (PLAT_P = dfetch("data/platforms.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => (d && d.v === 2 ? d : { st: {}, rd: {} }))
  .catch(() => ({ st: {}, rd: {} })));
function usePlatforms() {
  const [p, setP] = useState(null);
  useEffect(() => { let on = true; getPlatforms().then((d) => { if (on) setP(d); }); return () => { on = false; }; }, []);
  return p;
}
const platKey = (p) => (/^\d+$/.test(p) ? [0, parseInt(p, 10)] : [1, p]);
const platSort = (a, b) => { const x = platKey(a), y = platKey(b); return x[0] - y[0] || (x[0] === 0 ? x[1] - y[1] : String(x[1]).localeCompare(String(y[1]))); };

const getAnchors2012 = () =>
  ANC2012 || (ANC2012 = dfetch("data/anchor-2012.json")
    .then((r) => (r.ok ? r.json() : { anchors: {} }))
    .then((d) => { ANC_SET = new Set(Object.keys(d.anchors || {})); return d; })
    .catch(() => ({ anchors: {} })));
