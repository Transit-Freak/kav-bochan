/* הקו בזמן · 05-schedule.jsx — לוחות זמנים: קווים ממשיכים, לו"ז הקו (SchedBox) ולו"ז הרכבת (RailSched).
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

/* טבלת הלו"ז המלא של החלופה (בקשת שלמה): כל שעות היציאה לפי יום,
   מפרסום הרישוי של 10 הימים הקרובים — אותו קובץ שמזין את מעקב
   התגבורים, ולכן שעה שמתוכננים בה 2+ אוטובוסים מסומנת בה במפורש.
   יושבת בכרטיס הצד ולכן מוצגת בכל גרסה שנבחרת — גם שינוי מסלול
   וכל שינוי שאינו שינוי לו"ז. */
const SCHED_DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const SCHED_LBL = { "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי", "ש": "שבת" };
// היום בשבוע שאירוע לו"ז נגע בו — נשלף מנוסח ההערה ("ימי ראשון" / "שבת")
const schedDayOf = (note) => {
  const m = /\((?:ימי )?([א-ת]+)/.exec(note || "");
  return { "ראשון": "א", "שני": "ב", "שלישי": "ג", "רביעי": "ד",
           "חמישי": "ה", "שישי": "ו", "שבת": "ש" }[m && m[1]] || null;
};
// "ראשון–חמישי", "ראשון וחמישי", "ראשון–שלישי וחמישי" — ימים עם אותו לו"ז בשורה אחת
// חודשים לפני 2015 שיש להם קובץ GTFS מלא מהארכיון (early-sources: miu12) — השאר מצילומי האתר
// הישן. מ-2015 כל החודשים מהארכיון, ולכן אין צורך לסמן (שלמה 28.10).
const DETAILED_EARLY = new Set(["2012-07"]);

/* "קו ממשיך — השערה" (שלמה 28.10): איזה קו החליף קו שבוטל, או איך מסלול של 2012 נמשך —
   לפי התחנות המשותפות, לא לפי רישום רשמי. data/successors/<2 תווים>.json (tools/line_successors.py) */
function SuccBox({ rd }) {
  const [e, setE] = useState(null);
  useEffect(() => {
    let ok = true; setE(null);
    dfetch("data/successors/" + fsafe(rd).slice(0, 2) + ".json").then((r) => (r.ok ? r.json() : {}))
      .then((m) => { if (ok) setE(m[rd] || null); }).catch(() => {});
    return () => { ok = false; };
  }, [rd]);
  if (!e) return null;
  const lk = (t) => <a href={lineHref(t[1])}>קו {t[0] || "?"}</a>;
  const join = (xs) => xs.map((x, i) => <React.Fragment key={i}>{i ? (i === xs.length - 1 ? " ו" : ", ") : ""}{x}</React.Fragment>);
  const how = (t) => t[2] === t[3] && t[2] === t[4] ? `אותן ${t[2]} תחנות` : `${t[2]} מתוך ${t[3]} התחנות משותפות`;
  const sent = (x, when) => {
    const to = x.to || [];
    if (!to.length) return null;
    if (x.k === "פוצל") {
      const ts = [...to].sort((a, b) => (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0));
      return <>פוצל כנראה {when} לקווים {join(ts.map((t) => <a key={t[1]} href={lineHref(t[1])}>{t[0] || "?"}</a>))}</>;
    }
    if (x.k === "אותו קו") return <>המשיך כנראה {when} כ{lk(to[0])} ({how(to[0])})</>;
    if (x.k === "אותו מספר, מסלול שונה") return <>המשיך כנראה {when} כ{lk(to[0])}, עם מסלול שונה ({how(to[0])})</>;
    return <>{x.k === "הוחלף" ? "הוחלף כנראה" : "השתנה כנראה"} {when} ב{lk(to[0])} ({how(to[0])})</>;
  };
  const when = (x) => x.d === "2015" ? "ב-2015" : "ב-" + fmtD(x.d);
  return (
    <div className="succbox">
      <b>🔮 השערה לפי התחנות</b>
      {e.to && <div>{sent(e, when(e))}{e.then ? <>, ואחר כך {sent(e.then, when(e.then))}</> : null}.</div>}
      {e.from && <div>כנראה מחליף את {join(e.from.map((f) => <a key={f[1]} href={lineHref(f[1])}>קו {f[0] || "?"}</a>))} שבוטל ב-{fmtD(e.from[0][3])}.</div>}
      <div className="mut">לא מידע רשמי: משרד התחבורה לא רושם איזה קו החליף איזה. ההשערה מבוססת על התחנות המשותפות ועל תאריכי הביטול והפתיחה.</div>
    </div>
  );
}

function schedDaysLbl(ds) {
  const items = [];
  for (let i = 0; i < ds.length;) {
    let j = i;
    while (j + 1 < ds.length && SCHED_DAYS.indexOf(ds[j + 1]) === SCHED_DAYS.indexOf(ds[j]) + 1) j++;
    if (j - i >= 2) items.push(SCHED_LBL[ds[i]] + "–" + SCHED_LBL[ds[j]]);
    else for (let k = i; k <= j; k++) items.push(SCHED_LBL[ds[k]]);
    i = j + 1;
  }
  return items.length === 1 ? items[0] : items.slice(0, -1).join(", ") + " ו" + items[items.length - 1];
}

/* לו"ז הרכבת ההיסטורי (שלמה 28.10): בקו רכבת כמעט כל רכבת היא חלופה משלה, ולכן הטבלה
   מציגה את כל הרכבות של הכיוון בשבוע האחרון שבו החלופה הזו פעלה — שעה, ומה שונה בה
   מהמסלול הרגיל (ריק = כמו הרגיל). הרכבות של החלופה הזו מודגשות; לחיצה על שעה פותחת
   את החלופה של אותה רכבת. data/rail-sched/<מק"ט>.json — tools/rail_hist_sched.py */
// הלו"ז של קו רכבת נטען פעם אחת ומשמש גם את בחירת שעת היציאה וגם את הטבלה
const RAIL_SCHED = {};
function getRailSched(mk) {
  return RAIL_SCHED[mk] || (RAIL_SCHED[mk] = dfetch("data/rail-sched/" + mk + ".json")
    .then((r) => (r.ok ? r.json() : null)).catch(() => { delete RAIL_SCHED[mk]; return null; }));
}
/* רכבת עם לו"ז (שלמה 03.11): כמעט כל רכבת היא חלופה משלה, ולכן אין "החלפת חלופה" — פותחים
   את הלו"ז ולוחצים על הנסיעה. כאן נשאר רק הכיוון. בלי לו"ז — בוחר החלופות הרגיל */
function RailWrap({ rail, rd, onSwitch, children }) {
  return rail ? <RailTimePick rd={rd} onSwitch={onSwitch}>{children}</RailTimePick> : children;
}
function RailTimePick({ rd, onSwitch, children }) {
  const [d, setD] = useState(undefined);
  const [mk, dr, ...rest] = String(rd).split("-"), alt = rest.join("-");
  useEffect(() => { let ok = true; setD(undefined); getRailSched(mk).then((j) => { if (ok) setD(j); }); return () => { ok = false; }; }, [mk]);
  if (d === undefined) return null;
  const ps = d ? (d.p || []).filter((q) => q.dirs && q.dirs[dr]) : [];
  const has = (q) => Object.values(q.dirs[dr].days).some((rs) => rs.some((r) => r[1] === alt));
  const p = [...ps].reverse().find(has) || ps[ps.length - 1];
  if (!p) return children;
  // החלופה הנפוצה בכל כיוון — לשם עוברים בלחיצה על הכיוון
  const common = (k) => { const c = {}; for (const rs of Object.values(p.dirs[k].days)) for (const r of rs) c[r[1]] = (c[r[1]] || 0) + 1;
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
  const keys = Object.keys(p.dirs);
  if (keys.length < 2) return null;
  return <div className="alt-selector">
    <div className="sibs">
      <span className="sibt">כיוון:</span>
      {keys.map((k) => (
        <a key={k} className={"sib sibdir" + (k === dr ? " on" : "")} aria-current={k === dr ? "true" : undefined}
          href={common(k) != null ? lineHref(mk + "-" + k + "-" + common(k)) : undefined}
          onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); const a = common(k), to = mk + "-" + k + "-" + a; if (a != null && to !== rd) onSwitch(to); }}>
          {p.dirs[k].from} ← {p.dirs[k].to}
        </a>
      ))}
    </div>
  </div>;
}
function RailSched({ rd }) {
  const [d, setD] = useState(undefined), [why, setWhy] = useState({}), [pi, setPi] = useState(null);
  const [mk, dr, ...rest] = String(rd).split("-"), alt = rest.join("-");
  // רכבת שהסיבה שלה תועדה (שינוי זמני — rail-reasons.json): הסיבה מופיעה בשורה שלה
  useEffect(() => { let on = true; getRailWhy().then((w) => { if (on) setWhy(w.rd || {}); }); return () => { on = false; }; }, []);
  useEffect(() => {
    let ok = true;
    setD(undefined);
    getRailSched(mk).then((j) => { if (ok) setD(j); });
    return () => { ok = false; };
  }, [mk]);
  useEffect(() => { setPi(null); }, [rd]);
  if (d === undefined) return <div className="mut">טוען את הלו״ז…</div>;
  const has = (p) => p.dirs[dr] && Object.values(p.dirs[dr].days).some((rs) => rs.some((x) => x[1] === alt));
  // קווי הרכבת מ-2021 (rail_now.py, m=1): צילום לכל חודש — בוחרים חודש, ברירת המחדל האחרון
  const monthly = !!(d && d.m), ps = d ? (d.p || []).filter(has) : [];
  const p = monthly && pi != null && ps[pi] ? ps[pi] : ps[ps.length - 1];
  // בלי קובץ (עוד לא נבנה) — לא מציגים כלום; קובץ בלי החלופה — אומרים
  if (!d) return null;
  if (!p) return <div className="mut">אין לו״ז לחלופה הזו בארכיון.</div>;
  const x = p.dirs[dr], groups = new Map(), withTn = monthly;
  for (const b of SCHED_DAYS) {
    const rs = x.days[b];
    if (!rs || !rs.length) continue;
    const key = JSON.stringify(rs);
    if (!groups.has(key)) groups.set(key, { rs, days: [] });
    groups.get(key).days.push(b);
  }
  return (
    <details className="schedbox">
      <summary>🕐 לו״ז הרכבת · לחיצה על שעה פותחת את המסלול שלה <span className="mut">(שבוע של {fmtD(p.d)})</span></summary>
      {monthly ? <div className="schednote">
        כל הרכבות בכיוון {x.from} ← {x.to} לפי הלו"ז שפורסם, שבוע אחד בכל חודש. "דרך / שינוי" ריק = המסלול הרגיל.
      </div> : <div className="schednote" title="לפי ארכיון משרד התחבורה. מספרי הרכבות לא נשמרו בקבצים של אותן שנים">
        כל הרכבות {x.from} ← {x.to} בשבוע האחרון של החלופה. השורות שלה מודגשות; "דרך / שינוי" ריק = מסלול רגיל.
      </div>}
      {/* ~60 חודשים — רשימה נפתחת ולא שורת כפתורים */}
      {monthly && ps.length > 1 && <div style={{ margin: "8px 0" }}>
        <label className="pdesc">חודש: <select value={ps.indexOf(p)} onChange={(e) => setPi(+e.target.value)}>
          {ps.map((q, i) => i).reverse().map((i) => (
            <option key={i} value={i}>{String(ps[i].ym || ps[i].d.slice(0, 7)).split("-").reverse().join(".")}</option>
          ))}
        </select></label>
      </div>}
      {/* טבלה של ממש — עמודות וקווי הפרדה (שלמה 28.10: "שיראה יותר כמו טבלה") */}
      {[...groups.values()].map((g) => (
        <div key={g.days.join("")}>
          <div className="rgrp">{schedDaysLbl(g.days)} · {g.rs.length} רכבות</div>
          <table className="rtbl"><thead><tr><th>שעה</th>{withTn && <th>רכבת</th>}<th>דרך / שינוי</th></tr></thead><tbody>
            {g.rs.map(([t, a, n, tn], i) => (
              <tr key={i} className={a === alt ? "me" : ""} style={{ cursor: "pointer" }} title="פתיחת הנסיעה הזו — המסלול והתחנות"
                onClick={(e) => { if (e.target.closest("a")) return; location.hash = lineHref(mk + "-" + dr + "-" + a); }}>
                <td className="t">{<a href={lineHref(mk + "-" + dr + "-" + a)} title="פתיחת החלופה של הרכבת הזו — המסלול והתחנות">{t}</a>}</td>
                {withTn && <td className="t">{tn}</td>}
                <td>{n >= 0 ? x.n[n] : ""}{why[mk + "-" + dr + "-" + a] ? <div className="mut">❗ {why[mk + "-" + dr + "-" + a].text}</div> : null}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ))}
    </details>
  );
}

function SchedBox({ rd, vs, selD, isLast, gone }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let ok = true;
    setD(null);
    dfetch("data/sched/" + fsafe(rd).slice(0, 2) + ".json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((j) => { if (ok) setD(j.lines && j.lines[rd] ? { g: j.g, days: j.lines[rd] } : false); })
      .catch(() => { if (ok) setD(false); });
    return () => { ok = false; };
  }, [rd]);
  if (String(rd).startsWith("website") || (vs?.length && vs.every(v => v.src === "websiteArchive"))) return null;
  // אין לו"ז לשבוע הקרוב = החלופה אינה פעילה כרגע — וזה נאמר, לא נשתק (שלמה 07.09:
  // "פעיל" הוא רק מי שיש לו לו"ז לשבוע הקרוב). קו שכבר מסומן מבוטל לא צריך את זה.
  if (d === false) {
    const real = (vs || []).filter((v) => !v.syn && v.k !== "planned-dropped");
    if (gone || (real.length && real[real.length - 1].k === "removed")) return null;
    // אין לו"ז = מבוטל כרגע (שלמה 28.09), לא "הפסקה"
    return <div className="gapwarn" style={{ background: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b" }}>✖ מבוטל כרגע: אין לחלופה הזו לו״ז לשבוע הקרוב (לפי פרסום הרישוי ל-10 הימים הקרובים).</div>;
  }
  if (!d) return null;
  // הלו"ז של אז (בקשת שלמה): כשנבחרה גרסה ישנה משחזרים אחורה מהלו"ז של
  // היום — כל אירוע לו"ז שמאוחר מהגרסה מוחזר לשעות הישנות שלו (tl).
  // מהחדש לישן, כך שהאירוע הקרוב ביותר לגרסה קובע אחרון = המצב בזמנה.
  const past = !isLast && selD;
  let days = d.days, touched = new Set();
  if (past) {
    days = {};
    for (const b of SCHED_DAYS) days[b] = (d.days[b] || []).map((t) => Array.isArray(t) ? t[0] : t);
    (vs || []).filter((v) => (v.k === "sched" || v.k === "freq") && v.tl != null && v.d > selD)
      .sort((a, b) => b.d.localeCompare(a.d))
      .forEach((v) => {
        const L = schedDayOf(v.note);
        if (L) { days[L] = String(v.tl || "").split(",").map((s) => s.trim()).filter(Boolean); touched.add(L); }
      });
    // רק מה שתועד באמת: ימים שלא תועד בהם שינוי לו"ז מאז — אין מידע על אותה תקופה,
    // ולא "כנראה כמו היום" (שלמה 13.09). כשאין שום יום כזה — הלו"ז לא מוצג בכלל.
    for (const b of SCHED_DAYS) if (!touched.has(b)) days[b] = [];
  }
  if (past && !touched.size) return null;
  const hasTb = !past && SCHED_DAYS.some((b) => (days[b] || []).some((t) => Array.isArray(t)));
  return (
    <details className="schedbox">
      <summary>🕐 {past ? `הלו"ז כפי שהיה בגרסת ${selD.split("-").reverse().join(".")}` : 'הלו"ז המלא של החלופה — כל שעות היציאה'}{hasTb ? " · יש תגבורים" : ""}</summary>
      <div className="schednote">
        {/* ההערה על השחזור לא הובנה (שלמה 07.09: "מה ההערה המוזרה הזו?") — עכשיו
            במילים פשוטות, ובלי לדבר על ✱ כשאין אף יום כזה בטבלה */}
        {past ? <>
          ✱ = השעות שלפני שינוי מאוחר יותר.
          {SCHED_DAYS.some((b) => !touched.has(b)) ? " לשאר הימים אין מידע." : ""}
        </> : <>
          מפרסום הרישוי ל-10 הימים הקרובים (נכון ל-{d.g.split("-").reverse().join(".")}) —
          זה הלו"ז הנוכחי.
          {/* ההסבר על ×N רק כשיש באמת שעה כזאת בלו"ז (שלמה 06.09) */}
          {hasTb ? <> שעה מודגשת עם ×N פירושה ש-N אוטובוסים יוצאים באותה שעה (תגבור).</> : null}
        </>}
      </div>
      <table className="schedtbl"><tbody>
        {(() => {
          // ימים עם אותו לו"ז בדיוק מתאחדים לשורה אחת, גם כשאינם עוקבים:
          // "ראשון–חמישי", "ראשון וחמישי", "ראשון–שלישי וחמישי" (שלמה 06.09)
          const groups = new Map();
          for (const b of SCHED_DAYS) {
            const ts = days[b] || [];
            if (!ts.length) continue;
            const key = JSON.stringify(ts);
            if (!groups.has(key)) groups.set(key, { ts, days: [] });
            groups.get(key).days.push(b);
          }
          const rows = [...groups.values()];
          const lbl = schedDaysLbl;
          return rows.map((r) => (
            <tr key={r.days.join("")}>
              <th>{lbl(r.days)}{past && r.days.some((b) => touched.has(b)) ? " ✱" : ""}</th>
              <td>{r.ts.map((t, i) => Array.isArray(t)
                ? <span key={i} className="tchip tb" title={`${t[1]} אוטובוסים יוצאים בשעה זו (תגבור)`}>{t[0]} ×{t[1]}</span>
                : <span key={i} className="tchip">{t}</span>)}</td>
            </tr>
          ));
        })()}
      </tbody></table>
    </details>
  );
}
