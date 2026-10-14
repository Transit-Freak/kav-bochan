/* הקו המזין — החישוב המשותף לכל התצוגות (רעיון של משה דודק, ממונה מחוז דרום, 14.10.2026).
   אוטובוסים: bus/data/feeder/D.json — מעבר בפועל בכל תחנה עד 600 מ' מתחנת רכבת (tools/bus_reliability.py).
   רכבות: rail/data/days/D.json — איחור ההגעה לכל תחנה (tools/rail_reliability.py). נמדד בכשליש מהתחנות;
   בשאר — האיחור של התחנה הקרובה שנמדדה באותה נסיעה, ובלי מדידה — הלו"ז. רכבת לא יוצאת לפני הזמן.
   כיוון רכבת = התחנה הבאה (ביציאה) או הקודמת (בהגעה). */
window.FeederCore = (function () {
  "use strict";
  const CATS = [
    { k: "upd", label: "דורש עדכון", c: "#D7263D" },
    { k: "edge", label: "גבולי", c: "#F4B400" },
    { k: "ok", label: "תקין", c: "#00A65A" },
    { k: "chk", label: "לבדיקה", c: "#1E5BC6" },
    { k: "far", label: "רחוק מרכבת", c: "#C9CED6" },
  ];
  const DEF_TH = [5, 8, 13, 18];   // גבולות עליונים (לא כולל), בדקות: 0–4 / 5–7 / 8–12 / 13–17 / 18+
  const C = { F: null, RAIL: null, STN: {}, TR: {}, meas: 0, day: "" };
  const base = (document.currentScript && document.currentScript.src.replace(/feeder\/core\.js.*$/, "")) || "../";

  const fmt = (m) => { m = Math.round(m); const h = Math.floor(m / 60) % 24, mm = ((m % 60) + 60) % 60; return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); };
  const fmtD = (d) => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const side = (x) => { x = (x || "").trim(); const i = x.lastIndexOf("-"); return i > 0 ? x.slice(0, i).trim() : x; };
  const ends = (long) => { const p = (long || "").split("<->"); return [side(p[0]), side((p[1] || "").replace(/-\d+[א-ת#]*$/, ""))]; };
  const cat = (g, th) => { for (let i = 0; i < 4; i++) if (g < th[i]) return i; return 4; };
  async function getJSON(u) { const r = await fetch(base + u, { cache: "no-cache" }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }

  async function days() {
    const [idx, st] = await Promise.all([getJSON("bus/data/feeder/index.json"), getJSON("rail/data/stations.json")]);
    C.STN = st;
    const out = [];
    for (const d of idx.days.slice().reverse()) {
      try { const r = await fetch(base + "rail/data/days/" + d + ".json", { method: "HEAD", cache: "no-cache" }); if (r.ok) out.push(d); } catch (e) { /* אין */ }
      if (out.length >= 14) break;
    }
    return out;
  }

  async function load(d) {
    [C.F, C.RAIL] = await Promise.all([getJSON("bus/data/feeder/" + d + ".json"), getJSON("rail/data/days/" + d + ".json")]);
    C.day = d;
    const TR = {}, STN = C.STN;
    let meas = 0, all = 0;
    for (const ride of C.RAIL.rides) {
      const s = ride.s, n = s.length;
      const dest = (STN[String(s[n - 1][0])] || [ride.nm])[0], orig = (STN[String(s[0][0])] || [""])[0];
      // הקדמה של יותר מ-10 דק' היא הצמדה שגויה של השידור, לא רכבת מוקדמת — כאילו לא נמדד
      const m = (i) => (s[i][2] != null && s[i][2] >= -10 ? s[i][2] : null);
      for (let i = 0; i < n; i++) {
        let d_ = m(i), how = "נמדד";
        if (d_ == null) {
          let j = i - 1; while (j >= 1 && m(j) == null) j--;
          if (j >= 1) { d_ = m(j); how = "לפי " + ((STN[String(s[j][0])] || ["תחנה קודמת"])[0]); }
          else { let k = i + 1; while (k < n && m(k) == null) k++; if (k < n) { d_ = m(k); how = "לפי " + ((STN[String(s[k][0])] || ["תחנה הבאה"])[0]); } }
        }
        all++; if (m(i) != null) meas++;
        const p = s[i][1]; if (p == null) continue;
        const delay = d_ == null ? 0 : d_;
        const e = { p, delay, how: d_ == null ? "לפי הלו\"ז" : how, dest, orig, nm: ride.nm, id: ride.id };
        const t = (TR[String(s[i][0])] = TR[String(s[i][0])] || { dep: [], arr: [] });
        if (i < n - 1) t.dep.push(Object.assign({ t: p + Math.max(0, delay), dk: String(s[i + 1][0]) }, e));
        if (i > 0) t.arr.push(Object.assign({ t: p + delay, dk: String(s[i - 1][0]) }, e));
      }
    }
    for (const t of Object.values(TR)) { t.dep.sort((a, b) => a.t - b.t); t.arr.sort((a, b) => a.t - b.t); }
    C.TR = TR; C.meas = all ? meas / all : 0;
  }

  const stations = () => Object.keys(C.F.st).filter((c) => C.TR[c] && C.STN[c]);

  // הנסיעות של כל מסלול בתחנות הסמוכות. o = {mode, walk, lines}
  function busTrips(code, o) {
    const F = C.F, seen = new Set();
    const near = (F.st[code] || []).filter((x) => x[2] <= o.walk && !seen.has(x[0]) && seen.add(x[0]));
    const termNear = new Set();
    for (const [sc] of F.st[code] || []) for (const [rid, v] of Object.entries(F.p[sc] || {})) for (let i = 0; i < v.length; i += 3) if (v[i] % 10 !== 1) { termNear.add(rid); break; }
    const byRid = {};
    for (const [sc, sname, dist] of near) {
      for (const [rid, v] of Object.entries(F.p[sc] || {})) {
        for (let i = 0; i < v.length; i += 3) {
          // מקום ברצף: 0 מוצא, 1 באמצע, 2 סוף; +10 = הזמן משוער (לא נמדד כאן — מתחנה סמוכה באותה נסיעה)
          const pos = v[i] % 10, est = v[i] >= 10;
          if (o.mode === "to" && pos === 0) continue;     // יוצא מכאן — לא מביא נוסעים לרכבת
          if (o.mode === "from" && pos === 2) continue;   // מסיים כאן — לא לוקח נוסעים מהרכבת
          (byRid[rid] = byRid[rid] || []).push({ sc, sname, dist, est, sched: v[i + 1] / 60, act: v[i + 2] / 60 });
        }
      }
    }
    const out = [];
    for (const [rid, ps] of Object.entries(byRid)) {
      ps.sort((a, b) => a.sched - b.sched);
      const trips = [];
      for (const x of ps) {   // אותה נסיעה בשתי תחנות סמוכות — התחנה הקרובה לרכבת
        const last = trips[trips.length - 1];
        if (last && x.sched - last.sched <= 6 && x.sc !== last.sc) { if (x.dist < last.dist) trips[trips.length - 1] = x; }
        else trips.push(x);
      }
      const R = F.r[rid] || ["?", "", "", "", "", 0];
      const feed = R[5] ? 2 : (termNear.has(rid) || /רכבת/.test(R[2])) ? 1 : 0;   // 2 מזין (משרד התחבורה) · 1 מסוף
      if (feed >= o.lines) out.push({ rid, R, feed, num: R[0], op: R[1], from: ends(R[2])[0], to: ends(R[2])[1], trips });
    }
    return out;
  }

  function directions(code, mode) {
    const tr = C.TR[code]; if (!tr) return [];
    const list = mode === "to" ? tr.dep : tr.arr, by = {};
    for (const x of list) (by[x.dk] = by[x.dk] || []).push(x);
    return Object.entries(by).map(([dk, trains]) => {
      const cnt = {}; trains.forEach((x) => { const e = mode === "to" ? x.dest : x.orig; cnt[e] = (cnt[e] || 0) + 1; });
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
      return { dk, trains, name: (C.STN[dk] || ["?"])[0], label: (mode === "to" ? "לכיוון " : "מכיוון ") + (C.STN[dk] || ["?"])[0], sub: (mode === "to" ? "ל" : "מ") + top.join(", "), n: trains.length };
    }).sort((a, b) => b.n - a.n);
  }

  // לכל נסיעת אוטובוס: הרכבת הבאה (הגעה לרכבת) או הקודמת (יציאה מהרכבת) באותו כיוון.
  // shift — ההזזה שמביאה את החציון לאמצע הטווח התקין (חיובי = לאחר, שלילי = להקדים)
  function evalDir(lines, dir, o) {
    const T = dir.trains, ts = T.map((x) => x.t), th = o.th;
    const lb = (v) => { let lo = 0, hi = ts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < v) lo = m + 1; else hi = m; } return lo; };
    const mid = (th[1] + th[2] - 1) / 2;
    return lines.map((l) => {
      const rows = l.trips.map((x) => {
        let tr = null, gap = Infinity;
        if (o.mode === "to") { const k = lb(x.act); if (k < T.length) { tr = T[k]; gap = tr.t - x.act; } }
        else { const k = lb(x.act + 1e-9) - 1; if (k >= 0) { tr = T[k]; gap = x.act - tr.t; } }
        return Object.assign({ gap, c: cat(gap, th), tr }, x);
      });
      const cnt = [0, 0, 0, 0, 0]; rows.forEach((r) => cnt[r.c]++);
      const conn = rows.filter((r) => r.c < 4).map((r) => r.gap).sort((a, b) => a - b);
      const med = conn.length ? conn[conn.length >> 1] : null;
      // הגעה לרכבת: פער קטן → להקדים (שלילי). יציאה מהרכבת: פער קטן → לאחר (חיובי)
      const shift = med == null || (med >= th[1] && med < th[2]) ? 0 : Math.round(o.mode === "to" ? med - mid : mid - med);
      const hours = {};   // שעה → מונה קטגוריות
      rows.forEach((r) => { const h = Math.floor(r.act / 60) % 24; (hours[h] = hours[h] || [0, 0, 0, 0, 0])[r.c]++; });
      return Object.assign({ rows, cnt, n: rows.length, conn: conn.length, med, shift, hours, dir }, l);
    }).sort((a, b) => (b.feed - a.feed) || (b.cnt[0] - a.cnt[0]) || (b.n - a.n));
  }

  // כל הצירופים (תחנה × כיוון × קו) — לרשימת העבודה.
  // main: הכיוון שהקו מותאם אליו בתחנה — זה עם הכי הרבה חיבורים (פער עד הטווח "לבדיקה"), ובשוויון החציון
  // הקרוב לטווח התקין. שלמה 14.10 על 10א בקריית מלאכי: "מותאם לרכבת לתל אביב" — לכיוון קריית גת אין לו חיבור.
  function allRows(o) {
    const out = [];
    for (const c of stations()) {
      const lines = busTrips(c, o); if (!lines.length) continue;
      const best = {};
      for (const d of directions(c, o.mode)) for (const l of evalDir(lines, d, o)) {
        if (!l.n) continue;
        const r = Object.assign({ st: c, stName: C.STN[c][0], main: false }, l);
        out.push(r);
        const b = best[l.rid], score = (x) => [x.conn, -Math.abs((x.med == null ? 99 : x.med) - (o.th[1] + o.th[2] - 1) / 2)];
        if (r.conn && (!b || score(r)[0] > score(b)[0] || (score(r)[0] === score(b)[0] && score(r)[1] > score(b)[1]))) best[l.rid] = r;
      }
      for (const r of Object.values(best)) r.main = true;
    }
    return out;
  }

  const shiftText = (s, conn) => conn === 0 ? "אין חיבור" : !s ? "תקין" : (s < 0 ? "להקדים " + (-s) : "לאחר " + s) + " דק'";

  return { C, CATS, DEF_TH, fmt, fmtD, esc, ends, cat, days, load, stations, busTrips, directions, evalDir, allRows, shiftText };
})();
