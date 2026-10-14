/* הקו המזין — רעיון של משה דודק, ממונה מחוז דרום (14.10.2026).
   לכל אוטובוס שעבר בתחנה ליד תחנת רכבת: כמה דקות עברו עד הרכבת הבאה (הגעה לרכבת),
   או מאז הרכבת הקודמת (יציאה מהרכבת). הכול לפי זמנים בפועל:
   - אוטובוסים: bus/data/feeder/D.json — מעבר בפועל בכל תחנה, מ-SIRI של דאטאבוס (tools/bus_reliability.py)
   - רכבות: rail/data/days/D.json — איחור ההגעה לכל תחנה (tools/rail_reliability.py). האיחור נמדד
     בכשליש מהתחנות; בשאר נלקח האיחור של התחנה הקרובה שנמדדה באותה נסיעה, ובלי מדידה — הלו"ז.
   הטווחים ניתנים לשינוי (נשמרים בדפדפן). ברירת המחדל לפי משה: 0–4 דורש עדכון, 5–7 גבולי,
   8–12 תקין, 13–17 לבדיקה. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const CATS = [
    { k: "upd", label: "דורש עדכון", c: "var(--c0)" },
    { k: "edge", label: "גבולי", c: "var(--c1)" },
    { k: "ok", label: "תקין", c: "var(--c2)" },
    { k: "chk", label: "לבדיקה", c: "var(--c3)" },
    { k: "far", label: "רחוק מרכבת", c: "var(--c4)" },
  ];
  const DEF = [5, 8, 13, 18];   // גבולות עליונים (לא כולל) של ארבע הקטגוריות הראשונות, בדקות
  const store = {
    get(k, d) { try { const v = localStorage.getItem("feeder-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("feeder-" + k, JSON.stringify(v)); } catch (e) { /* פרטי */ } },
  };
  const S = { mode: "to", walk: 400, lines: 1, th: store.get("th", DEF).slice(0, 4), st: null, open: null };
  let F = null, RAIL = null, STN = {}, TR = {}, days = [];

  const fmt = (m) => { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = ((m % 60) + 60) % 60; return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); };
  const fmtD = (d) => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const cat = (g) => { for (let i = 0; i < 4; i++) if (g < S.th[i]) return i; return 4; };
  const side = (x) => { x = (x || "").trim(); const i = x.lastIndexOf("-"); return i > 0 ? x.slice(0, i).trim() : x; };
  const ends = (long) => { const p = (long || "").split("<->"); return [side(p[0]), side((p[1] || "").replace(/-\d+[א-ת#]*$/, ""))]; };
  async function getJSON(u) { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return r.json(); }

  // ---- רכבות: לכל תחנה — יציאות והגעות משוערות בפועל
  function buildTrains() {
    TR = {};
    let meas = 0, all = 0;
    for (const ride of RAIL.rides) {
      const s = ride.s, n = s.length;
      const dest = (STN[String(s[n - 1][0])] || [ride.nm])[0];
      for (let i = 0; i < n; i++) {
        let d = s[i][2], how = "נמדד";
        if (d == null) {
          let j = i - 1; while (j >= 1 && s[j][2] == null) j--;
          if (j >= 1) { d = s[j][2]; how = "לפי " + ((STN[String(s[j][0])] || ["תחנה קודמת"])[0]); }
          else { let k = i + 1; while (k < n && s[k][2] == null) k++; if (k < n) { d = s[k][2]; how = "לפי " + ((STN[String(s[k][0])] || ["תחנה הבאה"])[0]); } }
        }
        all++; if (s[i][2] != null) meas++;
        const p = s[i][1]; if (p == null) continue;
        const delay = d == null ? 0 : d;
        const e = { p, delay, how: d == null ? "לפי הלו\"ז" : how, dest, orig: (STN[String(s[0][0])] || [""])[0], nm: ride.nm };
        const t = (TR[String(s[i][0])] = TR[String(s[i][0])] || { dep: [], arr: [] });
        // הכיוון = התחנה הבאה (ביציאה) או הקודמת (בהגעה): "לכיוון להבים" ולא עשרה יעדים שונים
        if (i < n - 1) t.dep.push(Object.assign({ t: p + Math.max(0, delay), dk: String(s[i + 1][0]) }, e));   // רכבת לא יוצאת לפני הזמן
        if (i > 0) t.arr.push(Object.assign({ t: p + delay, dk: String(s[i - 1][0]) }, e));
      }
    }
    for (const t of Object.values(TR)) { t.dep.sort((a, b) => a.t - b.t); t.arr.sort((a, b) => a.t - b.t); }
    TR._meas = all ? meas / all : 0;
  }

  // ---- אוטובוסים: לכל תחנת רכבת — הנסיעות של כל מסלול בתחנות הסמוכות
  function busTrips(code) {
    const seen = new Set(), near = (F.st[code] || []).filter((x) => x[2] <= S.walk && !seen.has(x[0]) && seen.add(x[0]));
    const termNear = new Set();   // קווים שמתחילים/מסתיימים ליד התחנה (עד 600 מ')
    for (const [sc] of F.st[code] || []) for (const [rid, v] of Object.entries(F.p[sc] || {})) for (let i = 0; i < v.length; i += 3) if (v[i] !== 1) { termNear.add(rid); break; }
    const byRid = {};
    for (const [sc, sname, dist] of near) {
      for (const [rid, v] of Object.entries(F.p[sc] || {})) {
        for (let i = 0; i < v.length; i += 3) {
          const pos = v[i], sched = v[i + 1] / 60, act = v[i + 2] / 60;
          if (S.mode === "to" && pos === 0) continue;     // יוצא מכאן — לא מביא נוסעים לרכבת
          if (S.mode === "from" && pos === 2) continue;   // מסיים כאן — לא לוקח נוסעים מהרכבת
          (byRid[rid] = byRid[rid] || []).push({ sc, sname, dist, sched, act });
        }
      }
    }
    const out = [];
    for (const [rid, ps] of Object.entries(byRid)) {
      // אותה נסיעה בשתי תחנות סמוכות (פער של עד 6 דק' בלו"ז) — נשארת התחנה הקרובה לרכבת
      ps.sort((a, b) => a.sched - b.sched);
      const trips = [];
      for (const x of ps) {
        const last = trips[trips.length - 1];
        if (last && x.sched - last.sched <= 6 && x.sc !== last.sc) { if (x.dist < last.dist) trips[trips.length - 1] = x; }
        else trips.push(x);
      }
      const R = F.r[rid] || ["?", "", "", "", "", 0];
      // 2 = קו מזין לפי משרד התחבורה (ייחודיות "קווים מזינים"); 1 = מתחיל/מסתיים ליד התחנה או ששמו מזכיר רכבת
      const feed = R[5] ? 2 : (termNear.has(rid) || /רכבת/.test(R[2])) ? 1 : 0;
      if (feed >= S.lines) out.push({ rid, R, feed, trips });
    }
    return out;
  }
  // הכיוונים של התחנה: לכל שכנה — הרכבות, ושם לפי היעדים הנפוצים
  function directions(code) {
    const tr = TR[code]; if (!tr) return [];
    const list = S.mode === "to" ? tr.dep : tr.arr, by = {};
    for (const x of list) (by[x.dk] = by[x.dk] || []).push(x);
    return Object.entries(by).map(([dk, trains]) => {
      const ends_ = {}; trains.forEach((x) => { const e = S.mode === "to" ? x.dest : x.orig; ends_[e] = (ends_[e] || 0) + 1; });
      const top = Object.entries(ends_).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
      return { dk, trains, label: (S.mode === "to" ? "לכיוון " : "מכיוון ") + ((STN[dk] || ["?"])[0]), sub: (S.mode === "to" ? "ל" : "מ") + top.join(", "), n: trains.length };
    }).sort((a, b) => b.n - a.n);
  }
  // לכל נסיעת אוטובוס: הרכבת הבאה (הגעה לרכבת) או הקודמת (יציאה מהרכבת) באותו כיוון
  function evalDir(lines, dir) {
    const T = dir.trains, ts = T.map((x) => x.t);
    const lb = (v) => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < v) lo = m + 1; else hi = m; } return lo; };
    const out = lines.map((l) => {
      const rows = l.trips.map((x) => {
        let tr_ = null, gap = Infinity;
        if (S.mode === "to") { const k = lb(x.act); if (k < T.length) { tr_ = T[k]; gap = tr_.t - x.act; } }
        else { const k = lb(x.act + 1e-9) - 1; if (k >= 0) { tr_ = T[k]; gap = x.act - tr_.t; } }
        return Object.assign({ gap, c: cat(gap), tr: tr_ }, x);
      });
      const cnt = [0, 0, 0, 0, 0]; rows.forEach((r) => cnt[r.c]++);
      const conn = rows.filter((r) => r.c < 4).map((r) => r.gap).sort((a, b) => a - b);
      return Object.assign({ rows, cnt, n: rows.length, med: conn.length ? conn[conn.length >> 1] : null }, l);
    });
    out.sort((a, b) => (b.feed - a.feed) || (b.cnt[0] - a.cnt[0]) || (b.n - a.n));
    return out;
  }
  function stationSummary(code) {
    const lines = busTrips(code), cnt = [0, 0, 0, 0, 0];
    if (!lines.length) return { cnt, n: 0, nl: 0 };
    for (const d of directions(code)) for (const l of evalDir(lines, d)) l.cnt.forEach((v, i) => cnt[i] += v);
    return { cnt, n: cnt.reduce((a, b) => a + b, 0), nl: lines.length };
  }

  const bar = (cnt) => { const n = cnt.reduce((a, b) => a + b, 0) || 1; return '<div class="bar" role="img" aria-label="' + CATS.map((c, i) => c.label + " " + cnt[i]).join(", ") + '">' + cnt.map((v, i) => v ? '<i style="width:' + (100 * v / n) + '%;background:' + CATS[i].c + '"></i>' : "").join("") + "</div>"; };
  const pct = (a, n) => n ? Math.round(100 * a / n) + "%" : "–";

  function renderTh() {
    const lo = [0].concat(S.th);
    $("th").innerHTML = '<span>' + (S.mode === "to" ? "דקות מהגעת האוטובוס עד יציאת הרכבת:" : "דקות מהגעת הרכבת עד יציאת האוטובוס:") + "</span>" +
      CATS.slice(0, 4).map((c, i) => '<span class="k"><i style="background:' + c.c + '"></i>' + c.label + " " + lo[i] + "–" +
        '<input type="number" min="1" max="60" data-i="' + i + '" value="' + (S.th[i] - 1) + '" aria-label="' + c.label + ' עד"></span>').join("") +
      '<span class="k"><i style="background:' + CATS[4].c + '"></i>' + CATS[4].label + " " + S.th[3] + "+</span>" +
      '<button class="back" id="thReset" type="button">ברירת מחדל</button>';
    $("th").querySelectorAll("input").forEach((inp) => inp.addEventListener("change", () => {
      const i = +inp.dataset.i, v = Math.max(1, Math.min(60, Math.round(+inp.value || 0))) + 1;
      S.th[i] = v;
      for (let k = i + 1; k < 4; k++) if (S.th[k] <= S.th[k - 1]) S.th[k] = S.th[k - 1] + 1;
      for (let k = i - 1; k >= 0; k--) if (S.th[k] >= S.th[k + 1]) S.th[k] = Math.max(1, S.th[k + 1] - 1);
      store.set("th", S.th); renderTh(); render();
    }));
    $("thReset").onclick = () => { S.th = DEF.slice(); store.set("th", S.th); renderTh(); render(); };
  }

  function renderList() {
    const codes = Object.keys(F.st).filter((c) => TR[c] && STN[c]);
    const cards = codes.map((c) => Object.assign({ c }, stationSummary(c))).filter((x) => x.n);
    const tot = [0, 0, 0, 0, 0]; cards.forEach((x) => x.cnt.forEach((v, i) => tot[i] += v));
    const conn = tot[0] + tot[1] + tot[2] + tot[3];
    cards.sort((a, b) => (b.cnt[0] / b.n) - (a.cnt[0] / a.n) || b.n - a.n);
    $("main").innerHTML =
      '<div class="stats"><div><b>' + conn.toLocaleString("he-IL") + "</b><span>" + (S.mode === "to" ? "אוטובוסים שהגיעו עד " : "אוטובוסים שיצאו עד ") + (S.th[3] - 1) + " דק' " + (S.mode === "to" ? "לפני רכבת" : "אחרי רכבת") + " באחד הכיוונים</span></div>" +
      '<div style="border-color:var(--c2)"><b>' + pct(tot[2], conn) + "</b><span>תקין</span></div>" +
      '<div style="border-color:var(--c1)"><b>' + pct(tot[1], conn) + "</b><span>גבולי</span></div>" +
      '<div style="border-color:var(--c0)"><b>' + pct(tot[0], conn) + "</b><span>דורש עדכון</span></div></div>" +
      '<p class="sub">' + cards.length + " תחנות רכבת · ממוינות לפי אחוז \"דורש עדכון\". לחצו על תחנה לפירוט לפי קו.</p>" +
      '<div class="grid">' + cards.map((x) => {
        const cc = x.cnt[0] + x.cnt[1] + x.cnt[2] + x.cnt[3];
        return '<button class="st" type="button" data-c="' + x.c + '"><h3>' + esc(STN[x.c][0]) + "</h3>" + bar(x.cnt) +
          '<div class="meta">' + x.nl + " קווים · " + cc + " חיבורים · <b style=\"color:var(--c0)\">" + pct(x.cnt[0], cc) + "</b> דורש עדכון · " + pct(x.cnt[2], cc) + " תקין</div></button>";
      }).join("") + "</div>";
    $("main").querySelectorAll(".st").forEach((b) => b.onclick = () => { S.st = b.dataset.c; S.open = null; location.hash = "st=" + S.st; render(); window.scrollTo(0, 0); });
  }

  function rideCard(r) {
    const late = Math.round(r.act - r.sched), tt = r.tr;
    const bus = (S.mode === "to" ? "האוטובוס הגיע " : "האוטובוס יצא ") + "<b>" + fmt(r.act) + "</b> <span class=\"dim\">(בלו\"ז " + fmt(r.sched) + (late ? ", " + (late > 0 ? "+" : "") + late : "") + ")</span>";
    const train = tt ? (S.mode === "to" ? "רכבת ל" + esc(tt.dest) + " יצאה " : "רכבת מ" + esc(tt.orig) + " הגיעה ") + "<b>" + fmt(tt.t) + "</b>" + (Math.round(tt.delay) ? ' <span class="dim">(' + (tt.delay > 0 ? "+" : "") + Math.round(tt.delay) + ", " + esc(tt.how) + ")</span>" : "") : "אין רכבת בכיוון הזה";
    return '<div class="r" style="border-color:' + CATS[r.c].c + '">' + bus + "<br>" + train + "<br><b>" + (isFinite(r.gap) ? Math.round(r.gap) + " דק'" : "") + "</b> · " + CATS[r.c].label + ' <span class="dim">· ' + esc(r.sname) + " (" + r.dist + " מ')</span></div>";
  }
  function renderStation() {
    const c = S.st, lines = busTrips(c), dirs = directions(c);
    const near = [...new Set((F.st[c] || []).filter((x) => x[2] <= S.walk).map((x) => x[0]))];
    let h = '<button class="back" type="button" id="back">→ כל התחנות</button>' +
      "<h2>" + esc(STN[c][0]) + "</h2>" +
      '<p class="sub">' + near.length + " תחנות אוטובוס עד " + S.walk + " מ' · " + lines.length + " קווים · " + dirs.length + " כיווני רכבת. לחצו על קו לפירוט כל הנסיעות.</p>";
    if (!lines.length) h += '<div class="msg">אין קווים' + (S.lines === 2 ? " מזינים" : "") + " בתחנות האלה ביום הזה" + (S.lines ? " — אפשר להציג קווים נוספים בבחירה למעלה" : "") + ".</div>";
    for (const d of lines.length ? dirs : []) {
      const ls = evalDir(lines, d);
      h += '<div class="card" style="padding:8px 8px 4px"><h3 style="margin:2px 6px 0;font-size:17px">🚆 ' + esc(d.label) + '</h3><div class="sub" style="margin:0 6px 4px">' + esc(d.sub) + " · " + d.n + (S.mode === "to" ? " יציאות" : " הגעות") + " ביום</div>" +
        '<div class="tw"><table><thead><tr><th>קו</th><th class="hide-m">מפעיל</th><th>' + (S.mode === "to" ? "מגיע מ…" : "נוסע ל…") + '</th><th class="hide-m">נסיעות</th><th>חלוקה</th><th>דורש עדכון</th><th class="hide-m">חציון</th></tr></thead><tbody>';
      for (const l of ls) {
        const e = ends(l.R[2]), cc = l.cnt[0] + l.cnt[1] + l.cnt[2] + l.cnt[3], key = d.dk + "|" + l.rid;
        h += '<tr class="ln" data-r="' + key + '"><td><span class="num">' + esc(l.R[0]) + "</span>" + (l.feed === 2 ? '<span class="tag" title="קו מזין לפי משרד התחבורה">מזין</span>' : l.feed === 1 ? '<span class="tag t1" title="מתחיל או מסתיים ליד תחנת הרכבת">מסוף</span>' : "") +
          '</td><td class="hide-m op">' + esc(l.R[1]) + "</td><td>" + esc(S.mode === "to" ? e[0] : e[1]) +
          "</td><td class=\"hide-m\">" + l.n + "</td><td>" + bar(l.cnt) + '</td><td class="pct" style="color:var(--c0)">' + pct(l.cnt[0], cc) + '</td><td class="hide-m">' + (l.med == null ? "–" : Math.round(l.med) + " דק'") + "</td></tr>";
        if (S.open === key) h += '<tr class="rides"><td colspan="7"><div class="rl">' + l.rows.map(rideCard).join("") + "</div></td></tr>";
      }
      h += "</tbody></table></div></div>";
    }
    $("main").innerHTML = h;
    $("back").onclick = () => { S.st = null; history.replaceState(null, "", location.pathname); render(); };
    $("main").querySelectorAll("tr.ln").forEach((tr_) => tr_.onclick = () => { S.open = S.open === tr_.dataset.r ? null : tr_.dataset.r; render(); });
  }

  function render() {
    $("sub").innerHTML = (S.mode === "to"
      ? "האם האוטובוסים מגיעים לתחנת הרכבת בזמן לרכבת? לכל אוטובוס — כמה דקות עברו מההגעה שלו עד שהרכבת הבאה יצאה."
      : "האם האוטובוסים מחכים לנוסעים שירדו מהרכבת? לכל אוטובוס — כמה דקות עברו מאז שהרכבת האחרונה הגיעה עד שהוא יצא.") +
      " לפי זמנים בפועל, " + fmtD(F.d) + ".";
    if (S.st && TR[S.st] && STN[S.st]) renderStation(); else renderList();
  }

  function renderMethod() {
    $("method").innerHTML = "<h2>איך זה מחושב</h2><ul>" +
      "<li><b>האוטובוסים:</b> זמן המעבר בפועל בכל תחנה ליד תחנת רכבת, מנתוני ה-GPS (SIRI) של דאטאבוס — אותו חישוב של מדד דיוק האוטובוסים.</li>" +
      "<li><b>הרכבות:</b> זמן ההגעה בפועל לכל תחנה, מנתוני המיקום של הרכבות בדאטאבוס (מדד אמינות הרכבת). השידור של הרכבות מקוטע, והאיחור נמדד ב-" + Math.round(100 * TR._meas) + "% מהתחנות; בשאר נלקח האיחור של התחנה הקרובה שנמדדה באותה נסיעה. רכבת לא יוצאת לפני הזמן שבלו\"ז.</li>" +
      "<li><b>הגעה לרכבת:</b> לכל אוטובוס שהגיע לתחנה (לא כזה שמתחיל בה) — הרכבת הראשונה שיצאה אחריו, בכל כיוון בנפרד. <b>יציאה מהרכבת:</b> לכל אוטובוס שיצא (לא כזה שמסתיים בה) — הרכבת האחרונה שהגיעה לפניו, מכל כיוון בנפרד. כיוון = התחנה הבאה (או הקודמת) של הרכבת.</li>" +
      "<li><b>מזין:</b> קו שמשרד התחבורה מגדיר \"קווים מזינים\" (ייחודיות הקו בקובץ הנוסעים של המשרד). הקווים האלה מופיעים ראשונים. <b>מסוף:</b> קו שמתחיל או מסתיים עד 600 מ' מתחנת הרכבת, או ששמו מזכיר רכבת.</li>" +
      "<li>נסיעה שעוצרת בשתי תחנות סמוכות לרכבת נספרת פעם אחת, בתחנה הקרובה.</li>" +
      "<li>הרעיון: משה דודק, ממונה מחוז דרום. הטווחים ניתנים לשינוי למעלה, ונשמרים בדפדפן.</li></ul>";
  }

  async function load(d) {
    $("main").innerHTML = '<div class="msg">טוען…</div>';
    [F, RAIL] = await Promise.all([getJSON("../bus/data/feeder/" + d + ".json"), getJSON("../rail/data/days/" + d + ".json")]);
    buildTrains(); renderMethod(); render();
  }

  async function init() {
    try {
      const [idx, st] = await Promise.all([getJSON("../bus/data/feeder/index.json"), getJSON("../rail/data/stations.json")]);
      STN = st;
      // רק ימים שיש להם גם נתוני רכבת (מדד הרכבת מעובד בלילה, לפעמים אחרי האוטובוסים)
      for (const d of idx.days.slice().reverse()) {
        try { const r = await fetch("../rail/data/days/" + d + ".json", { method: "HEAD", cache: "no-cache" }); if (r.ok) days.push(d); } catch (e) { /* אין */ }
        if (days.length >= 14) break;
      }
      if (!days.length) { $("main").innerHTML = '<div class="msg">עדיין אין יום עם נתוני אוטובוסים ורכבות יחד.</div>'; return; }
      $("day").innerHTML = days.map((d) => "<option value=\"" + d + "\">" + fmtD(d) + "</option>").join("");
      const m = location.hash.match(/st=(\d+)/); if (m) S.st = m[1];
      renderTh();
      await load(days[0]);
    } catch (e) { $("main").innerHTML = '<div class="msg">הנתונים לא נטענו (' + esc(e.message) + ").</div>"; }
  }
  $("mode").querySelectorAll("button").forEach((b) => b.onclick = () => {
    S.mode = b.dataset.m; S.open = null;
    $("mode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    renderTh(); if (F) render();
  });
  $("day").onchange = (e) => load(e.target.value).catch((er) => { $("main").innerHTML = '<div class="msg">הנתונים לא נטענו (' + esc(er.message) + ").</div>"; });
  $("walk").onchange = (e) => { S.walk = +e.target.value; if (F) render(); };
  $("lines").onchange = (e) => { S.lines = +e.target.value; if (F) render(); };
  init();
})();
