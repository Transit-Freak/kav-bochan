/* הקו בזמן · 09-changes.jsx — שינויים לפי יום (DayFeed) והשינויים האחרונים בדף הראשי (RecentChanges).
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

function DayFeed({ idx, openLine, open12, onBack, kats, embedded, mode = "lines" }) {
  const lite = React.useContext(LiteCtx);
  // בתצוגה החדשה שינויי לו"ז/תגבור/רישום מקופלים לשורה אחת לכל סוג ביום (שלמה 09.10: "פירוט יתר")
  const [openLow, setOpenLow] = useState(() => new Set());
  const citySearch = useRouteCities();
  const earlyMonths = useHistoricalMonths(mode);
  const [regularMonths, setRegularMonths] = useState([]);
  const [months, setMonths] = useState(null);
  // השנה והחודש שנבחרו נשמרים ללשונית: פתיחת קו וחזרה החזירו ל-2026 (שלמה 13.09)
  const [yr, setYr] = useState(() => { try { const rh = mode === "rail" && railHash(); if (rh) return rh.day.slice(0,4); return location.hash === "#t=early" ? "2012" : sessionStorage.getItem("lh-day-yr-"+mode) || ""; } catch (e) { return ""; } });
  const [mon, setMon] = useState(() => { try { const rh = mode === "rail" && railHash(); if (rh) return rh.day.slice(0,7); return location.hash === "#t=early" ? "2012-07" : sessionStorage.getItem("lh-day-mon-"+mode) || ""; } catch (e) { return ""; } });
  // צילומי אתרי המידע לנוסעים (2003–2015) הם מקור נפרד: בשנה שיש בה גם נתוני משרד
  // התחבורה, בחירת השנה מציגה רק את משרד התחבורה, והצילומים בכפתור משלהם (שלמה 03.10)
  const [webSrc, setWebSrc] = useState(false);
  const [srcMonths, setSrcMonths] = useState({ web: [], official: null });
  // הודעות החברות מהארכיון (דן 2000–2012, אגד 2004–2012): מקור שלישי, עם כפתור משלו (שלמה 22.11)
  const [newsSrc, setNewsSrc] = useState(false);
  const news = useCompanyNews(mode);
  const newsOf = (y) => (news || []).filter((x) => x.d.startsWith(y));
  useEffect(() => { try { sessionStorage.setItem("lh-day-yr-"+mode, yr); sessionStorage.setItem("lh-day-mon-"+mode, mon); } catch (e) { /* ignore */ } }, [yr, mon]);
  const [chs, setChs] = useState(null);
  const [q, setQ] = usePersistedQ("lh-q-day");
  const [lim, setLim] = useState(300);
  const [dayF, setDayF] = useState(null);   // לחיצה על כותרת יום מציגה רק אותו
  useEffect(() => setLim(300), [q, mon]);
  useEffect(() => setDayF(null), [mon]);
  // יעד ומפעיל לא משוכפלים בקובצי החודש — נשלפים מהאינדקס לפי מק"ט
  const meta = useMemo(() => { const m = {}; ((idx && idx.lines) || []).forEach((l) => { m[l.rd] = l; }); return m; }, [idx]);
  // לשונית 2012: כל קווי הצילום. כל שורה מובילה לעמוד של אותו קו כפי
  // שהיה ב-2012 — מפה ורצף תחנות — ולא נפתחת בתוך השורה
  const [a12, setA12] = useState(null);
  const [idx12, setIdx12] = useState(null);
  useEffect(() => { getAnchors2012().then((d) => setA12(d.anchors || {})); }, []);
  useEffect(() => {
    dfetch("../magihim-2012/data/index.json")
      .then((r) => (r.ok ? r.json() : { lines: [] }))
      .then(setIdx12).catch(() => setIdx12({ lines: [] }));
  }, []);
  const k2rd = useMemo(() => {
    const m = {};
    for (const [rd, v] of Object.entries(a12 || {})) if (!(v.k in m)) m[v.k] = rd;
    return m;
  }, [a12]);
  const rows12 = useMemo(() =>
    (((idx12 && idx12.lines) || []).map((l) => ({ ...l, rd: k2rd[l.k] || null }))),
  [idx12, k2rd]);
  const [mErr, setMErr] = useState(false);
  const [chErr, setChErr] = useState(false);
  const [rty, setRty] = useState(0);
  useEffect(() => {
    let ok = true;
    setMErr(false);
    getMonths()
      .then((d) => {
        if (!ok) return;
        // ממיינים כאן במקום לסמוך על סדר הקובץ: ריצת שלב ב' הפכה את
        // months ליורד, וההנחה "האיבר האחרון הוא הנוכחי" שלחה את הפיד
        // למרץ 2017. מיון מקומי עולה מנתק את התלות בכיוון שבדיסק.
        const regular = mode === "lines" ? (d.months || []) : (d.modeMonths?.[mode] || []);
        setRegularMonths(regular);
        setSrcMonths({ web: mode === "lines" ? (d.webMonths || []) : [], official: d.officialMonths || null });
        const ms = [...new Set([...regular,...earlyMonths])].sort(); setMonths(ms);
        // לא דורסים בחירה שכבר נעשתה — כניסה מכתובת ‎#2012/<k>‎ קובעת
        // את השנה לפני שהחודשים נטענים. אחרי המיון האיבר האחרון הוא
        // החודש הנוכחי.
        const last = ms[ms.length - 1] || "";
        const rhk = mode === "rail" && railHash();
        if (ms.length && !rhk) { setYr((cur) => cur && ms.some(m => m.startsWith(cur)) ? cur : last.slice(0, 4)); setMon((cur) => cur === "legacy2012" || ms.includes(cur) ? cur : last); }
      })
      .catch(() => { if (ok) { setMErr(true); setMonths([]); } });
    return () => { ok = false; };
  }, [rty, mode, earlyMonths]);
  useEffect(() => {
    if (!mon || mon === "legacy2012" || !regularMonths.includes(mon)) return;
    // מעבר מהיר בין חודשים ברשת איטית: בלי הביטול, תשובה איטית של החודש
    // הקודם עלולה לנחות אחרונה ולהציג רשימה של חודש אחד תחת כותרת של אחר
    let ok = true;
    setChs(null); setChErr(false);
    dfetch("data/changes/" + mon + ".json")
      .then((r) => (r.ok ? r.json() : { changes: [] }))
      .then((d) => { if (ok) setChs((d.changes || []).filter((c) => !hiddenEv(c))); })
      .catch(() => { if (ok) { setChErr(true); setChs([]); } });
    return () => { ok = false; };
  }, [mon, rty, regularMonths]);
  const missingYear = !!yr && mon !== "legacy2012" && months !== null && !regularMonths.includes(mon);
  const wrap = embedded ? "" : "card";
  if (months === null) return <div className={wrap}>טוען…</div>;
  if (mErr) return <div className={wrap}><NetErr onRetry={() => { setMonths(null); setRty((n) => n + 1); }} /></div>;
  const webSet = new Set(srcMonths.web);
  // earlyMonths כולל גם את חודשי צילומי האתרים, ולכן המקור נקבע רק לפי officialMonths
  const offSet = srcMonths.official ? new Set(srcMonths.official) : null;
  const isOfficial = (m) => !offSet || offSet.has(m) || !webSet.has(m);
  const officialOf = (y) => months.filter((m) => m.startsWith(y) && isOfficial(m));
  const webOf = (y) => srcMonths.web.filter((m) => m.startsWith(y));
  const showWeb = webSrc || (!!yr && !officialOf(yr).length && webOf(yr).length > 0);
  const needle = q.trim();
  // הפיד יושב בטאב "קווים", שהוא טאב האוטובוסים. רכבת ומוניות שירות הן
  // טאבים משלהן, וכשהן הופיעו כאן הן גם הגיעו בלי מספר קו — תג ריק.
  // סינון לפי הקטגוריות המסומנות בעמוד (שלמה 13.09: "שינויים לפי יום" באותו עמוד)
  const inKats = (c) => !kats || !kats.size || [...kats].some(k => {
    if(k === "endpoint")return ENDPOINT_KINDS.includes(c.k);
    if(k === "sched")return c.k === "sched" || c.k === "freq";
    if(REMOVAL_CATS.has(k))return c.k === "removed" && catMatch(meta[c.rd] || {},k);
    if(k === "stops" || k === "stops-add" || k === "stops-del"){
      if(c.k === k)return true;
      if(c.k !== "removed"){
        const add=(c.add||[]).length,rem=(c.rem||[]).length;
        return k === "stops" ? add>0&&rem>0 : k === "stops-add" ? add>0&&!rem : rem>0&&!add;
      }
    }
    return c.k === k;
  });
  const list = collapse2012Rows((chs || []).filter((c) => {
    const m = meta[c.rd] || {};
    if (!inHistoryMode(m, mode)) return false;
    // הפרדת המקורות רק כשידוע מה המקור של כל חודש; בלי המידע הזה מציגים הכול, כמו קודם
    if (srcMonths.official && String(c.rd).startsWith("website") !== showWeb) return false;
    if (!inKats(c)) return false;
    // Match words across fields, just like the main line search.
    return matchesRouteSearch({ ...m, rd: c.rd, line: c.line || m.line }, needle, citySearch.data, c.d);

  }).sort((a, b) => routeSearchRank({ ...meta[a.rd], line: a.line || meta[a.rd]?.line }, needle)
    - routeSearchRank({ ...meta[b.rd], line: b.line || meta[b.rd]?.line }, needle)
    || String(a.line || meta[a.rd]?.line || "").localeCompare(String(b.line || meta[b.rd]?.line || ""), "he", { numeric: true })
    || String(a.rd).localeCompare(String(b.rd), "he", { numeric: true })), meta);
  // מעבר לצילומי אתרי המידע של השנה: לחודש האחרון שבו החיפוש מוצא משהו
  const toWeb = async () => {
    const ws = webOf(yr).slice().reverse();
    let pick = ws[0];
    if (needle) for (const m of ws) {
      try {
        const d = await (await dfetch("data/changes/" + m + ".json")).json();
        if ((d.changes || []).some((c) => String(c.rd).startsWith("website") &&
          matchesRouteSearch({ ...(meta[c.rd] || {}), rd: c.rd, line: c.line || meta[c.rd]?.line }, needle, citySearch.data, c.d))) { pick = m; break; }
      } catch (e) { /* חודש שלא נטען — ממשיכים לבא */ }
    }
    setWebSrc(true); setMon(pick);
  };
  const days = []; const byd = new Map();
  for (const c of list) { let g = byd.get(c.d); if (!g) { g = []; byd.set(c.d, g); days.push(c.d); } g.push(c); }
  days.sort().reverse();
  const WD = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  let shown = 0, cut = false;   // cut — שורה או יום לא הוצגו בגלל המגבלה (רק אז יש טעם ב"הצג עוד")
  return (
    <div className={wrap}>
      {!embedded && <button className="back" title="חזרה למסך החיפוש הראשי — הטקסט שחיפשתם נשמר" onClick={onBack}>→ חזרה לחיפוש הקווים</button>}
      <div className="months">
        {/* שנים וחודשים עם נתונים זמינים בלבד. */}
        {[...new Set([...months.map((m) => m.slice(0, 4)), ...(news || []).map((x) => x.d.slice(0, 4))])].sort().reverse().map((y) => (
          <button key={y} className={"mchip" + (yr === y && (newsSrc || (mon !== "legacy2012" && !webSrc)) ? " on" : "")} aria-pressed={yr === y && (newsSrc || (mon !== "legacy2012" && !webSrc))}
            aria-label={y}
            title={"הצגת השינויים של שנת " + y} onClick={() => { setYr(y); setNewsSrc(!months.some((m) => m.startsWith(y))); const off = officialOf(y); const ms = off.length ? off : months.filter((m) => m.startsWith(y)); setWebSrc(!off.length && webOf(y).length > 0); if (!ms.includes(mon) || (off.length && !isOfficial(mon))) setMon(ms[ms.length - 1] || ""); }}>{y}</button>
        ))}
      </div>
      {/* מקורות השנה: רק כשבוחרים שנה שיש לה יותר ממקור אחד — 2012 (משרד התחבורה ואתר מגיעים)
          או שנה עם צילומי אתרי מידע לנוסעים (שלמה 21.11) */}
      {mode === "lines" && yr && (yr === "2012" || (officialOf(yr).length > 0 && webOf(yr).length > 0) || newsOf(yr).length > 0) && <div className="srcrow">
        <span className="pdesc" style={{ marginInlineEnd: 10 }}>מקורות של {yr}:</span>
        {officialOf(yr).length > 0 && <button className={"mchip src-mot" + (mon !== "legacy2012" && !showWeb && !newsSrc ? " on" : "")} aria-pressed={mon !== "legacy2012" && !showWeb && !newsSrc}
          title={"נתוני משרד התחבורה, " + yr}
          onClick={() => { const off = officialOf(yr); setWebSrc(false); setNewsSrc(false); if (!off.includes(mon)) setMon(off[off.length - 1]); }}>משרד התחבורה</button>}
        {yr === "2012" && <button className={"mchip src-mag" + (mon === "legacy2012" && !newsSrc ? " on" : "")} aria-pressed={mon === "legacy2012" && !newsSrc} title="צילום רשת האוטובוסים מאתר מגיעים, 2012"
          onClick={() => { setWebSrc(false); setNewsSrc(false); setMon("legacy2012"); }}>צילום ממקור נוסף · אתר מגיעים</button>}
        {webOf(yr).length > 0 && (officialOf(yr).length > 0 || newsOf(yr).length > 0) && <button className={"mchip src-web" + (showWeb && mon !== "legacy2012" && !newsSrc ? " on" : "")} aria-pressed={showWeb && mon !== "legacy2012" && !newsSrc}
          title={"צילומים מאתרי מידע לנוסעים שנשמרו ב־Internet Archive, " + yr}
          onClick={() => { const ws = webOf(yr); setWebSrc(true); setNewsSrc(false); if (!ws.includes(mon)) setMon(ws[ws.length - 1]); }}>צילום ממקור נוסף · אתרי מידע לנוסעים</button>}
        {newsOf(yr).length > 0 && <button className={"mchip src-news" + (newsSrc ? " on" : "")} aria-pressed={newsSrc}
          title={"הודעות על שינויים בקווים מאתר החברה, שנשמרו ב־Internet Archive, " + yr}
          onClick={() => setNewsSrc(true)}>הודעות החברות · {["דן", "אגד"].filter((o) => newsOf(yr).some((x) => x.op === o)).join(" ו")}</button>}
      </div>}
      {/* שורת המקור של מה שמוצג, בצבע של המקור — כדי שההבדל בין המקורות ייראה מיד (שלמה 21.11) */}
      {newsSrc ? <SrcNote k="news" n={newsOf(yr).length} u="הודעות" /> : <>
      {mode === "lines" && mon === "legacy2012" && <SrcNote k="mag" />}
      {mode === "lines" && mon !== "legacy2012" && showWeb && <SrcNote k="web" />}
      {mode === "lines" && mon !== "legacy2012" && !showWeb && !missingYear && chs && (() => {
        const own = chs.filter((c) => !String(c.rd).startsWith("website") && inHistoryMode(meta[c.rd] || {}, mode));
        const nf = own.filter((c) => c.ap).length, ng = own.length - nf;
        return <>
          {(ng > 0 || !nf) && <SrcNote k={yr === "2012" ? "gtfs2012" : "gtfs"} n={nf ? ng : 0} />}
          {nf > 0 && <SrcNote k="foi" n={ng ? nf : 0} />}
        </>;
      })()}
      {mode === "lines" && mon !== "legacy2012" && showWeb && yr && <WebsiteYearSummary year={yr} />}
      </>}
      {yr && mon !== "legacy2012" && !newsSrc && (
        <div className="months">
          {months.filter((m) => m.startsWith(yr) && (showWeb ? webSet.has(m) : isOfficial(m))).slice().reverse().map((m) => (
            <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} title="הצגת השינויים של החודש הזה בלבד" onClick={() => setMon(m)}>{m.split("-").reverse().join(".")}</button>
          ))}
        </div>
      )}
      {!missingYear && !newsSrc && <CitySearchStatus state={citySearch} />}
      {(!missingYear || newsSrc) && <input className="search" type="search" placeholder={newsSrc ? "סינון: מספר קו או מילה מההודעה…" : "סינון: מספר קו, עיר בדרך, יעד, מפעיל או מק״ט…"} value={q} onChange={(e) => setQ(e.target.value)} />}
      {newsSrc ? <NewsFeed items={newsOf(yr)} needle={needle} /> : missingYear ? <HistoricalPeriod key={yr} idx={idx} openLine={openLine} mode={mode} year={yr} month={mon} embedded /> : mon === "legacy2012" ? (() => {
        if (!a12 || !idx12) return "טוען…";
        const list12 = sort12(rows12.filter((v) => match12(v, needle)), needle);
        if (!list12.length) return <div className="empty">אין קווי 2012 תואמים.</div>;
        const linked = list12.filter((v) => v.rd).length;
        return (
          <div>
            <div className="dayhead">צילום מצב 2012 · {list12.length.toLocaleString()} קווים ·
              {" "}{linked.toLocaleString()} מקושרים לקווים של היום</div>
            {list12.slice(0, lim).map((v) => (
              <a key={v.k} className="lrow" href={"#2012/" + encodeURIComponent(v.k)}
                onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); open12(v.k); }}>
                <span className="badge sm">{v.no}</span>
                <span className="k" style={{ background: v.rd ? "#78350f" : "#57534e" }}>
                  {v.rd ? "2012" : "לא קיים היום"}</span>
                <span className="ldest">{v.dest || "—"}</span>
                <span className="lmeta">{v.an} · {v.nr} מסלולים · {v.ns} תחנות · מפה ורצף ←</span>
              </a>
            ))}
            {list12.length > lim && (
              <button className="morebtn" onClick={() => setLim(lim + 500)}>
                ⌄ הצג עוד — מוצגים {Math.min(lim, list12.length).toLocaleString()} מתוך {list12.length.toLocaleString()}
              </button>
            )}
            <div className="katnote">ℹ️ "לא קיים היום" — לא נמצא לקו הזה קו תואם ברשת הנוכחית: בוטל,
              או ששונה עד ללא היכר. לחיצה על השורה פותחת את רצף התחנות שלו מ-2012.</div>
          </div>
        );
      })() : chs === null ? "טוען…" : chErr ? <NetErr onRetry={() => setRty((n) => n + 1)} />
        : days.length === 0 ? <div className="empty">אין שינויים תואמים בחודש הזה.
            {/* צילומי אתרי המידע של אותה שנה נמצאים בכפתור משלהם — מפנים אליהם במקום להשאיר חיפוש ריק */}
            {!showWeb && yr && officialOf(yr).length > 0 && webOf(yr).length > 0 && <div style={{ marginTop: 8 }}>
              <button type="button" className="mchip" onClick={toWeb}>
                {q ? "לחפש את \u201C" + q + "\u201D בצילומי אתרי המידע לנוסעים, " + yr : "לצילומי אתרי המידע לנוסעים, " + yr}</button></div>}
          </div> : (
        <div>
          {/* אינדקס הימים של החודש: רואים מראש באילו תאריכים יש שינויים,
              ולחיצה קופצת ישר ליום — בלי לגלול ולגלות אותם אחד-אחד */}
          {days.length > 1 && (
            <div className="months">
              <button className={"mchip" + (!dayF ? " on" : "")} aria-pressed={!dayF} title="כל ימי החודש ברצף" onClick={() => setDayF(null)}>כל החודש</button>
              {days.map((d) => (
                <button key={d} className={"mchip" + (dayF === d ? " on" : "")} aria-pressed={dayF === d}
                  title={"יום " + WD[new Date(d).getDay()] + " · " + byd.get(d).length.toLocaleString() + " שינויים"}
                  onClick={() => setDayF(dayF === d ? null : d)}>{d.slice(8, 10) + "." + d.slice(5, 7)}</button>
              ))}
            </div>
          )}
          {days.filter((d) => !dayF || d === dayF).map((d) => shown >= lim ? ((cut = true), null) : (
            <React.Fragment key={d}>
              <div className="dayhead" role="button" tabIndex={0} style={{ cursor: "pointer" }}
                title={dayF === d ? "לחיצה חוזרת מציגה שוב את כל החודש" : "לחיצה מציגה רק את היום הזה"}
                onClick={() => setDayF(dayF === d ? null : d)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDayF(dayF === d ? null : d); } }}>
                {fmtD(d)} · יום {WD[new Date(d).getDay()]} · {byd.get(d).length.toLocaleString()} שינויים {dayF === d ? "· 📌" : ""}</div>
              {(() => {
                const rowOf = (c, i, withNote) => {
                if (shown >= lim) { cut = true; return null; }
                shown++;
                const m = meta[c.rd] || {};
                const kk = <span className="k" style={{ background: (KINDS[evKind(c)] || {}).color || "#64748b" }}>{(KINDS[evKind(c)] || { label: c.k }).label}</span>;
                return (
                  <a key={c.rd + c.k + i} className={"lrow" + (lite ? " lite-row" : "")} href={lineHref(c.rd)}
                    onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(c.rd); }}>
                    <span className="badge sm">{c.line || TT_ICON[m.tt] || "—"}</span>
                    {lite ? <>
                      {/* כמו "החשובים של היום" בדף הראשי (שלמה 08.10): "עיר – עיר", החברה בקטן, סוג השינוי בסוף */}
                      <span className="ldest">{m.dest ? routeTitle(m.dest, m) : idx ? rdTxt(c.rd) : "…"}<small className="lop">{m.op || ""}{mkTag(c.rd)}</small></span>
                      {kk}
                    </> : <>
                      {kk}
                      <span className="ldest">{m.dest || (idx ? rdTxt(c.rd) : "…")}</span>
                      <span className="lmeta">{m.op || ""}{mkTag(c.rd)}</span>
                    </>}
                    {c.ap ? <TipTag cls="approxd foi-tag" tip={"מקור: משרד התחבורה (חופש מידע) — התאריך משוער"}>חופש מידע · ≈ תאריך</TipTag> : c.sd && gapDays(c.sd, c.d) > 3 ? <TipTag cls="approxd" tip={"אותר בין " + fmtD(c.sd) + " ל-" + fmtD(c.d) + " — היום המדויק אינו ידוע"}>≈ תאריך מקורב</TipTag> : null}
                    {c.k === "planned-dropped" && c.ps ? <span className="lnote">📅 תוכנן ל-{fmtD(c.ps)} · בוטל ב-{fmtD(c.pc || c.d)}</span> : null}
                    {c.note && withNote ? <span className="lnote">{noteFix(c.note)}</span> : null}
                  </a>
                );
                };
                const all = byd.get(d);
                if (!lite) return all.map((c, i) => rowOf(c, i, true));
                const imp = all.filter((c) => !LOW_KINDS.has(evKind(c)));
                const grp = new Map();
                all.forEach((c) => { const k = evKind(c); if (LOW_KINDS.has(k)) { if (!grp.has(k)) grp.set(k, []); grp.get(k).push(c); } });
                return <>
                  {imp.map((c, i) => rowOf(c, i, true))}
                  {[...grp.entries()].map(([k, list]) => {
                    const key = d + "|" + k, open = openLow.has(key);
                    return (
                      <React.Fragment key={key}>
                        <button className={"lowgrp" + (open ? " open" : "")} aria-expanded={open}
                          onClick={() => setOpenLow((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; })}>
                          <span className="k" style={{ background: (KINDS[k] || {}).color || "#64748b" }}>{(KINDS[k] || { label: k }).label}</span>
                          <span>{list.length.toLocaleString()} {list.length === 1 ? "קו" : "קווים"}</span>
                          <span className="ch" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
                        </button>
                        {open && list.map((c, i) => rowOf(c, "l" + i, false))}
                      </React.Fragment>);
                  })}
                </>;
              })()}
            </React.Fragment>
          ))}
          {cut && (
            <button className="morebtn" onClick={() => setLim(lim + 500)}>
              ⌄ הצג עוד — מוצגים {shown.toLocaleString()} מתוך {(dayF ? (byd.get(dayF) || []).length : list.length).toLocaleString()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- מק"ט שהוא גם כפתור העתקה ---------- */
// לחיצה על המק"ט מעתיקה את הקישור לתחנה ישר ללוח, בלי תפריט ובלי שלב
// נוסף. הוא נשאר קישור אמיתי, כך שפתיחה בלשונית חדשה (לחיצה אמצעית או
// לחיצה ארוכה) ממשיכה לעבוד כרגיל.
function StopCode({ code }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(false), 1600);
    return () => clearTimeout(t);
  }, [ok]);
  const copy = (e) => {
    e.stopPropagation();
    if (!plainClick(e)) return;      // Ctrl/אמצעית — פתיחה בלשונית חדשה
    e.preventDefault();
    const url = location.origin + location.pathname + stopHref(code);
    const done = () => setOk(true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => fallback(url, done));
    } else fallback(url, done);
  };
  const fallback = (url, done) => {
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (err) { /* אין לוח — הקישור עדיין ב-href */ }
    document.body.removeChild(ta);
  };
  return (
    <a className={"code slink" + (ok ? " copied" : "")} href={stopHref(code)} onClick={copy}
      title="לחיצה מעתיקה את הקישור לתחנה הזו — כל השינויים שלה, מכל השנים">
      {" "}({code}) {ok ? "✓ הועתק" : "🔗"}</a>
  );
}

/* ---------- מה השתנה לאחרונה ---------- */
// המסך הראשון הציג שורת חיפוש והוראה להקליד, וכל 58 אלף השינויים היו
// מוסתרים מאחורי פעולה שהמבקר צריך ליזום. כאן מוצגים הימים האחרונים
// שבהם קרה משהו, כמו בטאב התחנות שכבר נפתח על החודש האחרון.
const WDR = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
function RecentChanges({ idx, openLine, onAll, lite }) {
  const [rows, setRows] = useState(null);
  const [nerr, setNerr] = useState(false);
  const [rty, setRty] = useState(0);
  const meta = useMemo(() => { const m = {}; ((idx && idx.lines) || []).forEach((l) => { m[l.rd] = l; }); return m; }, [idx]);
  useEffect(() => {
    let ok = true;
    setNerr(false);
    getMonths()
      .then(async (d) => {
        const ms = (d.months || []).slice().sort();
        if (!ms.length) { if (ok) setRows([]); return; }
        const get = (m) => dfetch("data/changes/" + m + ".json")
          .then((r) => (r.ok ? r.json() : { changes: [] }))
          .then((d) => ({ changes: (d.changes || []).filter((c) => !hiddenEv(c)) }));
        let list = (await get(ms[ms.length - 1])).changes || [];
        // ב-1 בחודש הקובץ החדש כמעט ריק, והמסך הראשי נראה כאילו האתר מת —
        // כשחסרים ימים משלימים מהחודש הקודם כדי שתמיד יוצגו הימים האחרונים
        const daysIn = new Set(list.map((c) => c.d));
        if (daysIn.size < 3 && ms.length > 1) {
          list = list.concat((await get(ms[ms.length - 2])).changes || []);
        }
        if (ok) setRows(list.slice().sort((a, b) => b.d.localeCompare(a.d)));
      })
      .catch(() => { if (ok) { setNerr(true); setRows([]); } });
    return () => { ok = false; };
  }, [rty]);
  if (rows === null) return <div className="empty">טוען את השינויים האחרונים…</div>;
  if (nerr) return <NetErr onRetry={() => { setRows(null); setRty((n) => n + 1); }} />;
  if (!rows.length) return <div className="empty">אין עדיין שינויים בחודש הזה.</div>;
  const days = [];
  const byd = new Map();
  // רק אוטובוסים (רכבת, רק"ל ומוניות הן לשוניות משלהן) — כבר כאן, כדי שהמספרים בכותרת היום וב"ועוד N" יספרו רק את מה שמוצג
  for (const c of rows) {
    const m = meta[c.rd] || {};
    if (m.tt && m.tt !== "demand") continue;
    if (!byd.has(c.d)) { byd.set(c.d, []); days.push(c.d); }
    byd.get(c.d).push(c);
  }
  if (!days.length) return <div className="empty">אין עדיין שינויים בחודש הזה.</div>;
  const top = days.slice(0, 3);
  if (lite) {
    // תצוגה חדשה (שלמה 08.10: "האתר עמוס מדי במידע"): היום האחרון בלבד — סיכום לפי סוג,
    // ו"החשובים של היום": שינויי מסלול, תחנות וביטולים לפני מאות שינויי התגבור והלו"ז
    const d = days[0], all = byd.get(d);
    const cnt = {}; all.forEach((c) => { const k = evKind(c); cnt[k] = (cnt[k] || 0) + 1; });
    const imp = all.filter((c) => !LOW_KINDS.has(evKind(c)));
    const pick = (imp.length ? imp : all).slice(0, 6);
    return (
      <div className="recent lite-recent">
        <div className="dayhead">{fmtD(d)} · יום {WDR[new Date(d).getDay()]} · {byd.get(d).length.toLocaleString()} שינויים</div>
        <div className="rsum">{Object.entries(cnt).sort((a, b) => (LOW_KINDS.has(a[0]) ? 1 : 0) - (LOW_KINDS.has(b[0]) ? 1 : 0) || b[1] - a[1]).map(([k, n]) => (
          <span key={k} className={LOW_KINDS.has(k) ? "low" : ""}>{n.toLocaleString()} {(KINDS[k] || { label: k }).label}</span>))}</div>
        <div className="rechead"><b>{imp.length ? "החשובים של היום" : "השינויים של היום"}</b></div>
        {pick.map((c, i) => {
          const m = meta[c.rd] || {};
          return (
            <a key={c.rd + c.k + i} className="lrow" href={lineHref(c.rd)}
              onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(c.rd); }}>
              <span className="badge sm">{c.line}</span>
              <span className="ldest">{m.dest ? routeTitle(m.dest, m) : idx ? rdTxt(c.rd) : "…"}<small className="lop">{m.op || ""}</small></span>
              <span className="k" style={{ background: (KINDS[evKind(c)] || {}).color || "#64748b" }}>{(KINDS[evKind(c)] || { label: c.k }).label}</span>
            </a>);
        })}
        <button className="recmore" onClick={onAll}>לכל {byd.get(d).length.toLocaleString()} השינויים של {fmtD(d)} ←</button>
      </div>);
  }
  return (
    <div className="recent">
      {/* בלי כפתור "כל השינויים לפי יום" — הוא שכפל את הכפתור הגדול
          שכבר יושב ממש מעל (שלמה סימן את הכפילות בצילום מסך) */}
      <div className="rechead">
        <b>מה השתנה לאחרונה</b>
      </div>
      {/* אותו סינון כמו בפיד היומי: רכבת/רק"ל/מוניות הן טאבים משלהן */}
      {top.map((d) => (
        <React.Fragment key={d}>
          <div className="dayhead">{fmtD(d)} · יום {WDR[new Date(d).getDay()]} · {byd.get(d).length.toLocaleString()} שינויים</div>
          {byd.get(d).slice(0, 8).map((c, i) => {
            const m = meta[c.rd] || {};
            return (
              <a key={c.rd + c.k + i} className="lrow" href={lineHref(c.rd)}
                onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(c.rd); }}>
                <span className="badge sm">{c.line}</span>
                <span className="k" style={{ background: (KINDS[evKind(c)] || {}).color || "#64748b" }}>{(KINDS[evKind(c)] || { label: c.k }).label}</span>
                <span className="ldest">{m.dest || (idx ? rdTxt(c.rd) : "…")}</span>
                <span className="lmeta">{m.op || ""}{mkTag(c.rd)}</span>
                {c.ap ? <TipTag cls="approxd" tip={"בערך — לפי נתוני משרד התחבורה (חופש מידע)"}>≈ תאריך מקורב</TipTag> : c.sd && gapDays(c.sd, c.d) > 3 ? <TipTag cls="approxd" tip={"אותר בין " + fmtD(c.sd) + " ל-" + fmtD(c.d) + " — היום המדויק אינו ידוע"}>≈ תאריך מקורב</TipTag> : null}
                    {c.k === "planned-dropped" && c.ps ? <span className="lnote">📅 תוכנן ל-{fmtD(c.ps)} · בוטל ב-{fmtD(c.pc || c.d)}</span> : null}
                    {c.note ? <span className="lnote">{noteFix(c.note)}</span> : null}
              </a>
            );
          })}
          {byd.get(d).length > 8 && (
            <button className="recmore" onClick={onAll}>
              ועוד {(byd.get(d).length - 8).toLocaleString()} שינויים ב-{fmtD(d)} ←
            </button>
          )}
        </React.Fragment>
      ))}
      <div className="katnote">
        ℹ️ הקלידו מספר קו כדי לראות את ההיסטוריה שלו, או פתחו את "קטגוריות לבחירה"
        וסמנו אילו סוגי שינויים להציג. התיעוד הרציף מתחיל ב-16.03.2017, ולפניו יש צילומים מ-2012 ומ-2015–2016 (בכפתורי השנים).
      </div>
    </div>
  );
}
