#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-planner.py — preprocessor for the transit REFORM PLANNER ("מתכנן הרפורמה").

Emits ONE compact planner-data.json from the four in-hand datasets. Implements the
three column-grounded planning levers + the city scenario aggregator, exactly per the
adversarially-verified spec (run wp5uqur1x). New-line / coverage-gap planning needs GTFS
lat/lon (not on disk) and is handled by a separate GitHub Action — see build-newlines.

Honesty rules enforced here:
  * Merge = overlap-COEFFICIENT (asymmetric, = containment), NOT Jaccard. Browser runs
    greedy CLIQUE-COVER at the slider τ from the edges we emit, so every displayed family
    is a real clique. We ship the stop sets of edge-participating makats so the browser can
    compute within-family-unique stops (the coverage-loss guard) at ANY τ — never col14.
  * Cut = cost/passenger vs the line's OWN effGroup×region peer benchmark (not a fake ₪35).
    Cost is censored at 1000 -> ratio shown as a lower bound. Impact = weekly km / trips.
  * Frequency = relative crowding index loadPerTrip/cap, percentile-ranked within peers.
  * weeklyKm uses col12 directly; dist×trips identity only flags divergent rows.
NO shekel savings, NO absolute passengers — ridership/peakLoad are relative indices only.
"""
import json, os, bisect
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
def load(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return json.load(f)

main  = load("data-main.json")
stops = load("data-stops.json")
sched = load("data-schedule.json")
bench = load("data-benchmark.json")

MK, LN, DIR, OC, DC, RG, LT, UNIQ, EG, DIST, TRIPS, CPP, WKM, BUS, EXCL, RID, PEAK = range(17)
COST_CAP = 1000.0
TAU_BUILD = 0.70   # edges emitted at the loosest τ the UI exposes; browser tightens
TAU_DEFAULT = 0.85

REGION_MAP = {"גולן גליל ועמקים": "גולן גליל עמקים", "מזרח ירושלים": "מזרח י-ם", "ירושלים": "י-ם"}
def peer_cost(eg, rg):
    g = bench.get(eg)
    if not g:
        return None
    return g.get(REGION_MAP.get(rg, rg)) or g.get("כל הארץ")

def num(x, d=0.0):
    return x if isinstance(x, (int, float)) else d

# ---- stop sets per makat -------------------------------------------------
S = defaultdict(set)
for r in stops:
    S[r[0]].add(r[1])
def ov(a, b):
    A, B = S.get(a), S.get(b)
    if not A or not B:
        return 0.0
    return len(A & B) / min(len(A), len(B))

makats_main = {r[MK] for r in main}
makats_stops = set(S.keys())
join_report = {"makatsMain": len(makats_main), "makatsStops": len(makats_stops),
               "inBoth": len(makats_main & makats_stops),
               "droppedOneSide": len(makats_main ^ makats_stops)}

# ---- national cost-per-passenger, four ways (UI never prints a single ~35) -
cpps = [(r[CPP], num(r[TRIPS]), num(r[RID])) for r in main if isinstance(r[CPP], (int, float))]
simple = sum(c for c, _, _ in cpps) / len(cpps)
tw = sum(c * t for c, t, _ in cpps) / (sum(t for _, t, _ in cpps) or 1)
rw = sum(c * rd for c, _, rd in cpps) / (sum(rd for _, _, rd in cpps) or 1)
med = sorted(c for c, _, _ in cpps)[len(cpps) // 2]
national_cpp = {"simpleMean": round(simple, 1), "tripWeighted": round(tw, 1),
                "ridershipWeighted": round(rw, 1), "median": round(med, 1)}

rid_sorted = sorted(num(r[RID]) for r in main if isinstance(r[RID], (int, float)))
def pctl(sorted_vals, x):
    return 100.0 * bisect.bisect_right(sorted_vals, x) / len(sorted_vals) if sorted_vals else 0.0
RID_P25 = rid_sorted[len(rid_sorted) // 4]

# ---- schedule features per makat+dir -------------------------------------
sched_by = defaultdict(list)
for r in sched:
    sched_by[(r[0], str(r[1]))].append(r)
def sched_features(mk, d):
    rows = sched_by.get((mk, str(d)), [])
    hourly = [0.0] * 24
    riders = []
    for row in rows:
        tc = num(row[7], 1); rid = row[5] if isinstance(row[5], (int, float)) else None
        try:
            hh = int(str(row[2]).split(":")[0]) % 24
        except Exception:
            hh = 0
        try:
            wk = set(json.loads(row[4])) if isinstance(row[4], str) else set(row[4] or [])
        except Exception:
            wk = set()
        if wk & {1, 2, 3, 4, 5}:
            hourly[hh] += tc
        if rid is not None:
            riders.append((rid, tc))
    hourly = [int(round(h)) for h in hourly]
    low = 0
    if riders:
        vals = sorted(r for r, _ in riders); m = vals[len(vals) // 2]; thr = 0.5 * m
        low = sum(tc for rid, tc in riders if rid < thr)
    peakShare = 0.0
    tot = sum(hourly)
    if tot:
        top3 = sum(sorted(hourly, reverse=True)[:3])
        peakShare = top3 / tot
    return hourly, low, round(peakShare, 2)

# ---- best same-city same-lineType overlap (cut redundancy tag) -----------
makat_city = {}; makat_lt = {}
for r in main:
    makat_city.setdefault(r[MK], r[OC]); makat_lt.setdefault(r[MK], r[LT])
pool = defaultdict(list)
for mk in makats_stops:
    c = makat_city.get(mk)
    if c:
        pool[(c, makat_lt.get(mk))].append(mk)
best_overlap = {}
for (c, lt), mks in pool.items():
    for a in mks:
        best = (None, 0.0)
        for b in mks:
            if a != b:
                v = ov(a, b)
                if v > best[1]:
                    best = (b, v)
        if best[1] > 0:
            best_overlap[a] = best

# ---- per-direction line records ------------------------------------------
recs = []
for r in main:
    mk, ln, d = r[MK], r[LN], str(r[DIR])
    cpp = r[CPP] if isinstance(r[CPP], (int, float)) else None
    peak = num(r[PEAK]); trips = num(r[TRIPS]); wkm = num(r[WKM]); dist = num(r[DIST])
    rid = r[RID] if isinstance(r[RID], (int, float)) else None
    bus = r[BUS] or "לא מוגדר"
    peer = peer_cost(r[EG], r[RG])
    censored = cpp is not None and cpp >= COST_CAP - 1e-6
    ratio = (cpp / peer) if (cpp is not None and peer) else None
    ridP = pctl(rid_sorted, rid) if rid is not None else None
    lpt = (peak / trips) if trips else 0.0
    cap = {"מיניבוס": 0.5, "מידיבוס": 0.65, "לא מוגדר": 1.0, "אוטובוס": 1.0, "מפרקי": 2.0}.get(bus, 1.0)
    util = lpt / cap if cap else lpt
    recon = dist * trips
    kmRatio = (wkm / recon) if recon else 1.0
    kmDiv = not (0.97 <= kmRatio <= 1.03)
    hourly, low, peakShare = sched_features(mk, d)
    recs.append({
        "mk": mk, "dir": d, "ln": ln, "oc": r[OC], "dc": r[DC], "rg": r[RG],
        "lt": r[LT], "eg": r[EG], "bus": bus,
        "dist": round(dist, 1), "trips": int(trips), "wkm": round(wkm, 1),
        "cpp": round(cpp, 1) if cpp is not None else None,
        "peer": round(peer, 1) if peer else None,
        "ratio": round(ratio, 3) if ratio is not None else None, "cens": censored,
        "rid": round(rid, 1) if rid is not None else None, "ridP": round(ridP, 1) if ridP is not None else None,
        "peak": round(peak, 1), "lpt": round(lpt, 1), "util": round(util, 2),
        "lowTrips": int(low), "peakShare": peakShare, "hourly": hourly,
        "kmRatio": round(kmRatio, 3), "kmDiv": kmDiv,
    })

# ---- frequency percentiles within peer group (lineType × district) -------
groups = defaultdict(list); lt_only = defaultdict(list)
for g in recs:
    groups[(g["lt"], g["rg"])].append(g); lt_only[g["lt"]].append(g)
ADD_U, CUT_U = 75, 25
for (lt, rg), grp in groups.items():
    base = grp if len(grp) >= 20 else lt_only[lt]
    us = sorted(b["util"] for b in base); ts = sorted(b["trips"] for b in base)
    medU = us[len(us) // 2] if us else 0
    for g in grp:
        g["uP"] = round(pctl(us, g["util"]), 1)
        g["tP"] = round(pctl(ts, g["trips"]), 1)
        g["lowData"] = g["trips"] < 6
        uP, tP, util = g["uP"], g["tP"], g["util"]
        if g["lowData"]:
            v = "HOLD"
        elif uP >= ADD_U and tP <= 50:
            v = "ADD"
        elif uP <= CUT_U and tP >= 50:
            v = "CUT"
        elif uP >= ADD_U and tP >= 75:
            v = "RIGHT-SIZE-UP"
        elif uP <= CUT_U and tP <= 25 and g["bus"] in ("אוטובוס", "מפרקי"):
            v = "RIGHT-SIZE-DOWN"
        else:
            v = "HOLD"
        g["verdict"] = v
        if v in ("ADD", "CUT") and util:
            dt = round(g["trips"] * (medU / util) - g["trips"])
            cap = int(0.5 * g["trips"])
            g["dTrips"] = max(-cap, min(cap, dt))
        else:
            g["dTrips"] = 0
        g["addPeakOnly"] = bool(v == "ADD" and g["peakShare"] > 0.5)

# ---- cut flag + redundancy tag -------------------------------------------
RATIO_MIN = 3.0
for g in recs:
    g["cut"] = bool(g["ratio"] is not None and g["ratio"] >= RATIO_MIN
                    and g["rid"] is not None and g["rid"] < RID_P25)
    bo = best_overlap.get(g["mk"])
    if bo and bo[1] >= 0.70:
        g["coveredBy"] = bo[0]; g["coveredOv"] = round(bo[1], 2)
    # action label
    if g["cut"]:
        g["action"] = "COVERED" if g.get("coveredBy") else "CANCEL"
    else:
        g["action"] = "THIN"

# ---- aggregate per makat (merge display) ---------------------------------
agg = {}
for r in main:
    mk = r[MK]
    a = agg.setdefault(mk, {"ln": r[LN], "oc": r[OC], "dc": r[DC], "lt": r[LT],
                            "trips": 0, "wkm": 0.0, "rid": 0.0, "cppN": [],
                            "nstops": len(S.get(mk, ()))})
    if r[DC] and r[DC] != r[OC]:
        a["dc"] = r[DC]
    a["trips"] += num(r[TRIPS]); a["wkm"] += num(r[WKM]); a["rid"] += num(r[RID])
    if isinstance(r[CPP], (int, float)):
        a["cppN"].append((r[CPP], num(r[TRIPS], 1)))
for mk, a in agg.items():
    if a["cppN"]:
        a["cpp"] = round(sum(c * w for c, w in a["cppN"]) / (sum(w for _, w in a["cppN"]) or 1), 1)
    else:
        a["cpp"] = None
    del a["cppN"]
    a["wkm"] = round(a["wkm"], 1); a["rid"] = round(a["rid"], 1); a["trips"] = int(a["trips"])

# ---- merge edges (same city, same lineType, ov>=TAU_BUILD) ----------------
edges_by_city = defaultdict(list)
edge_makats = set()
for (c, lt), mks in pool.items():
    for i in range(len(mks)):
        for j in range(i + 1, len(mks)):
            v = ov(mks[i], mks[j])
            if v >= TAU_BUILD:
                edges_by_city[c].append([mks[i], mks[j], round(v, 3)])
                edge_makats.add(mks[i]); edge_makats.add(mks[j])

# ship stop sets only for edge-participating makats (browser computes unique stops at any τ)
stop_sets = {mk: sorted(S[mk]) for mk in edge_makats}

# default-τ family/foldable headline counts (greedy clique-cover at 0.85)
def clique_cover(mks, adj, tau):
    rem = set(mks); out = []
    deg = {n: sum(1 for m in mks if m != n and adj.get((n, m), 0) >= tau) for n in mks}
    while rem:
        seed = max(rem, key=lambda n: (deg[n], sum(adj.get((n, m), 0) for m in rem if m != n)))
        cl = [seed]
        for m in sorted((x for x in rem if x != seed and adj.get((seed, x), 0) >= tau),
                        key=lambda x: -adj.get((seed, x), 0)):
            if all(adj.get((m, c), 0) >= tau for c in cl):
                cl.append(m)
        for n in cl:
            rem.discard(n)
        out.append(cl)
    return out
fam85 = fold85 = 0
for c, eds in edges_by_city.items():
    by_lt = defaultdict(set)
    adj = {}
    for a, b, v in eds:
        adj[(a, b)] = adj[(b, a)] = v
        by_lt[makat_lt.get(a)].add(a); by_lt[makat_lt.get(b)].add(b)
    for lt, mset in by_lt.items():
        for cl in clique_cover(list(mset), adj, TAU_DEFAULT):
            if len(cl) >= 2:
                fam85 += 1; fold85 += len(cl) - 1

# ---- city baselines + assemble -------------------------------------------
cities = {}
for g in recs:
    c = g["oc"]
    cb = cities.setdefault(c, {"baseline": {"weeklyKm": 0.0, "trips": 0, "lines": 0,
                                            "ridersIndex": 0.0, "posture": {"eff": 0, "par": 0, "worse": 0}},
                               "edges": edges_by_city.get(c, []), "lines_": []})
    b = cb["baseline"]
    b["weeklyKm"] += g["wkm"]; b["trips"] += g["trips"]; b["lines"] += 1
    if g["rid"] is not None:
        b["ridersIndex"] += g["rid"] * g["trips"]
    if g["ratio"] is not None:
        b["posture"]["worse" if g["ratio"] > 1.25 else ("eff" if g["ratio"] < 0.8 else "par")] += 1
    cb["lines_"].append(g)
for c, cb in cities.items():
    cb["baseline"]["weeklyKm"] = round(cb["baseline"]["weeklyKm"], 1)
    cb["baseline"]["ridersIndex"] = round(cb["baseline"]["ridersIndex"], 1)
    cb["lines"] = cb.pop("lines_")
    # makat meta needed for merge display in this city
    mks = {e[0] for e in cb["edges"]} | {e[1] for e in cb["edges"]}
    cb["makats"] = {mk: agg[mk] for mk in mks if mk in agg}

out = {
    "meta": {
        "lines": len(recs), "cities": len(cities),
        "tauBuild": TAU_BUILD, "tauDefault": TAU_DEFAULT,
        "ratioMin": RATIO_MIN, "ridP25": round(RID_P25, 1),
        "addU": ADD_U, "cutU": CUT_U, "costCap": COST_CAP,
        "cutFlagged": sum(1 for g in recs if g["cut"]),
        "familiesAtDefault": fam85, "foldableAtDefault": fold85,
        "networkWeeklyKm": round(sum(g["wkm"] for g in recs), 0),
        "freqVerdicts": dict(Counter(g["verdict"] for g in recs)),
    },
    "joinReport": join_report,
    "nationalCpp": national_cpp,
    "regionMap": REGION_MAP,
    "stopSets": stop_sets,
    "cities": cities,
}
outp = os.path.join(HERE, "planner-data.json")
with open(outp, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

print("wrote", outp, "(%.2f MB)" % (os.path.getsize(outp) / 1e6))
print("  lines:", out["meta"]["lines"], " cities:", out["meta"]["cities"])
print("  network weekly km:", out["meta"]["networkWeeklyKm"], "(expect 15028574)")
print("  cut flagged:", out["meta"]["cutFlagged"], "(expect 379)")
print("  families@0.85:", fam85, " foldable@0.85:", fold85)
print("  edge makats:", len(edge_makats), " edges:", sum(len(e) for e in edges_by_city.values()))
print("  nationalCpp:", national_cpp)
print("  freq verdicts:", out["meta"]["freqVerdicts"])
print("  join:", join_report)
