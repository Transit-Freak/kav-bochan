#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GIS הקו הבוחן — בניית השכבות "שלנו" (קבוצה ג') מתוך הנתונים שכבר יושבים במאגר,
ועוד GTFS יומי אחד (תחנות, מסלולים ולוח זמנים ליום חול).

שלמה 30.09: "כלי GIS שמאחד את מדדי האמינות, הצי, קו פח, קו באג ותכניות העתיד".
אין כאן שום ניחוש: כל שכבה נגזרת מקובץ קיים, ומה שאין לו מיקום אמיתי — לא נכנס.

שימוש (מקומי וב-CI):
  GTFS_DIR=/path/to/unzipped/gtfs python3 tools/gis_build.py
  (או GTFS_ZIP=gtfs.zip). בלי GTFS — נבנות רק השכבות שלא תלויות בו.
הפלט: gis/data/own/*.json (+ gis/data/own/tt/*.json — לוח זמנים לפי משבצות).
"""
import csv
import datetime
import glob
import gzip
import io
import json
import math
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'gis', 'data', 'own')
TT = os.path.join(OUT, 'tt')
PERIOD = 30            # ימים אחרונים לצבירת מדדי האמינות (ברירת המחדל של עמודי המדד)
RADII = [150, 250, 400, 500, 800]   # רדיוסי הליכה שהמשתמש יכול לבחור (מטר)
MAXR = 800
CELL = 20              # משבצת לוח זמנים: 1/20 מעלה (~5 ק"מ)

csv.field_size_limit(10 ** 9)


def jdump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    return os.path.getsize(path)


def jload(rel, default=None):
    p = os.path.join(ROOT, rel)
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:  # noqa: BLE001
        print(f'  ! לא נקרא {rel}: {e}')
        return default


def r5(v):
    return round(v, 5)


# ---------------------------------------------------------------- גאומטריה
M_LAT = 110574.0


def m_lon(lat):
    return 111320.0 * math.cos(math.radians(lat))


def dp(pts, tol):
    """Douglas-Peucker על [x,y] במעלות (tol במעלות)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
                d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > tol * tol:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def simp_line(pts, tol=0.00003):
    out = [[r5(x), r5(y)] for x, y in dp(pts, tol)]
    ded = [out[0]]
    for p in out[1:]:
        if p != ded[-1]:
            ded.append(p)
    return ded


def pip(x, y, ring):
    ins = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi:
            ins = not ins
        j = i
    return ins


def in_poly(x, y, polys):
    """polys = MultiPolygon [[outer, hole...], ...] בקואורדינטות [lon,lat]"""
    for poly in polys:
        if pip(x, y, poly[0]) and not any(pip(x, y, h) for h in poly[1:]):
            return True
    return False


def dist_to_poly_m(x, y, polys):
    """מרחק במטרים מנקודה לגבול הפוליגון (0 אם בפנים)."""
    if in_poly(x, y, polys):
        return 0.0
    kx, ky = m_lon(y), M_LAT
    best = 1e18
    for poly in polys:
        for ring in poly:
            for i in range(len(ring) - 1):
                ax, ay = (ring[i][0] - x) * kx, (ring[i][1] - y) * ky
                bx, by = (ring[i + 1][0] - x) * kx, (ring[i + 1][1] - y) * ky
                dx, dy = bx - ax, by - ay
                L = dx * dx + dy * dy
                t = 0 if L == 0 else max(0, min(1, -(ax * dx + ay * dy) / L))
                d = (ax + t * dx) ** 2 + (ay + t * dy) ** 2
                if d < best:
                    best = d
    return math.sqrt(best)


def ring_area_m2(ring):
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = m_lon(lat0)
    s = 0.0
    for i in range(len(ring) - 1):
        s += (ring[i][0] * kx) * (ring[i + 1][1] * M_LAT) - (ring[i + 1][0] * kx) * (ring[i][1] * M_LAT)
    return abs(s) / 2


def poly_area_m2(polys):
    return sum(ring_area_m2(p[0]) - sum(ring_area_m2(h) for h in p[1:]) for p in polys)


# ---------------------------------------------------------------- GTFS
class Gtfs:
    def __init__(self):
        self.dir = os.environ.get('GTFS_DIR')
        self.zip = None
        z = os.environ.get('GTFS_ZIP')
        if not self.dir and z and os.path.exists(z):
            self.zip = zipfile.ZipFile(z)
        self.ok = bool(self.zip) or bool(self.dir and os.path.exists(os.path.join(self.dir, 'stops.txt')))

    def rows(self, name):
        if self.zip:
            f = io.TextIOWrapper(self.zip.open(name), encoding='utf-8-sig', newline='')
        else:
            f = open(os.path.join(self.dir, name), encoding='utf-8-sig', newline='')
        with f:
            yield from csv.DictReader(f)


def city_of(desc):
    m = re.search(r'עיר:\s*(.*?)\s*רציף:', desc or '')
    return m.group(1).strip() if m else ''


def pick_day(g):
    """יום חול טיפוסי: יום שלישי הראשון מהיום והלאה שנמצא בטווח לוח השירות."""
    today = datetime.date.today()
    lo = hi = None
    for r in g.rows('calendar.txt'):
        s = datetime.datetime.strptime(r['start_date'], '%Y%m%d').date()
        e = datetime.datetime.strptime(r['end_date'], '%Y%m%d').date()
        lo = s if lo is None or s < lo else lo
        hi = e if hi is None or e > hi else hi
    d = max(today, lo or today)
    while d.weekday() != 1:   # שלישי
        d += datetime.timedelta(days=1)
    return d


def build_gtfs(g):
    print('== GTFS')
    stops = {}
    for r in g.rows('stops.txt'):
        stops[r['stop_id']] = r
    day = pick_day(g)
    dname = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][day.weekday()]
    ds = day.strftime('%Y%m%d')
    services = {r['service_id'] for r in g.rows('calendar.txt')
                if r[dname] == '1' and r['start_date'] <= ds <= r['end_date']}
    agencies = {r['agency_id']: r['agency_name'] for r in g.rows('agency.txt')}
    routes = {}
    for r in g.rows('routes.txt'):
        desc = (r.get('route_desc') or '').split('-')
        routes[r['route_id']] = {
            'short': r['route_short_name'], 'long': r['route_long_name'],
            'agency': agencies.get(r['agency_id'], r['agency_id']), 'type': r['route_type'],
            'makat': desc[0] if desc else '', 'dir': desc[1] if len(desc) > 1 else '',
            'alt': desc[2] if len(desc) > 2 else ''}
    trips = {}
    shape_cnt = defaultdict(Counter)
    for r in g.rows('trips.txt'):
        if r['service_id'] in services:
            trips[r['trip_id']] = r['route_id']
            if r.get('shape_id'):
                shape_cnt[r['route_id']][r['shape_id']] += 1
    print(f'  יום ייצוגי {day} · {len(trips)} נסיעות פעילות')
    # מעבר אחד על stop_times: כמה נסיעות לכל תחנה × קו × שעה
    tt = defaultdict(lambda: defaultdict(lambda: [0] * 24))
    n = 0
    for r in g.rows('stop_times.txt'):
        rid = trips.get(r['trip_id'])
        if rid is None:
            continue
        t = r['departure_time'] or r['arrival_time']
        try:
            h = int(t[:2]) % 24
        except ValueError:
            continue
        tt[r['stop_id']][rid][h] += 1
        n += 1
    print(f'  {n} עצירות ביום')
    return {'stops': stops, 'routes': routes, 'tt': tt, 'day': day, 'shape_cnt': shape_cnt}


def build_route_times(g, day=None, per_route=9):
    """זמני נסיעה מתוכננים בין תחנות, לכל מסלול (route_id) ביום החול הייצוגי — לתצוגת "קו" ב-GIS
    (שלמה 30.09: "זמן הנסיעה על המפה"). לכל מסלול: עד per_route נסיעות מפוזרות על פני היום, רצף התחנות
    הנפוץ ביניהן, ולכל קטע — החציון של הזמן בלו"ז. הפלט: rtime/XX.json (לפי שתי הספרות האחרונות של
    route_id): {route_id: [[מק"ט תחנה…], [שניות מצטברות מהמוצא…], מספר נסיעות ביום]}."""
    print('== זמני נסיעה בין תחנות')
    day = day or pick_day(g)
    dname = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][day.weekday()]
    ds = day.strftime('%Y%m%d')
    services = {r['service_id'] for r in g.rows('calendar.txt')
                if r[dname] == '1' and r['start_date'] <= ds <= r['end_date']}
    by_route = defaultdict(list)
    for r in g.rows('trips.txt'):
        if r['service_id'] in services:
            by_route[r['route_id']].append(r['trip_id'])
    want, ntrips = {}, {}
    for rid, ts in by_route.items():
        ntrips[rid] = len(ts)
        step = max(1, len(ts) // per_route)
        for t in ts[::step][:per_route]:
            want[t] = rid
    code = {r['stop_id']: r.get('stop_code') or r['stop_id'] for r in g.rows('stops.txt')}
    seqs = defaultdict(list)
    for r in g.rows('stop_times.txt'):
        if r['trip_id'] not in want:
            continue
        t = r['arrival_time'] or r['departure_time']
        try:
            h, m, s = (int(x) for x in t.split(':'))
        except ValueError:
            continue
        seqs[r['trip_id']].append((int(r['stop_sequence']), code.get(r['stop_id'], r['stop_id']), h * 3600 + m * 60 + s))
    per = defaultdict(list)
    for t, rows in seqs.items():
        rows.sort()
        per[want[t]].append(([c for _, c, _ in rows], [x for _, _, x in rows]))
    out = defaultdict(dict)
    for rid, trips in per.items():
        common = Counter(tuple(s) for s, _ in trips).most_common(1)[0][0]
        same = [ts for s, ts in trips if tuple(s) == common]
        cum = [0]
        for i in range(1, len(common)):
            d = sorted(ts[i] - ts[i - 1] for ts in same)
            cum.append(cum[-1] + max(0, d[len(d) // 2]))
        out[rid[-2:].rjust(2, '0')][rid] = [list(common), cum, ntrips.get(rid, 0)]
    RT = os.path.join(OUT, 'rtime')
    if os.path.isdir(RT):
        for f in glob.glob(os.path.join(RT, '*.json')):
            os.remove(f)
    tot = sum(jdump(os.path.join(RT, k + '.json'), v) for k, v in out.items())
    print(f'  rtime: {sum(len(v) for v in out.values())} מסלולים, {len(out)} קבצים, {tot // 1024} KB · יום {day}')


def load_shapes(g, want):
    pts = defaultdict(list)
    for r in g.rows('shapes.txt'):
        s = r['shape_id']
        if s in want:
            pts[s].append((int(r['shape_pt_sequence']), float(r['shape_pt_lon']), float(r['shape_pt_lat'])))
    return {s: [[x, y] for _, x, y in sorted(v)] for s, v in pts.items()}


# ---------------------------------------------------------------- שכבות
def table(fields, labels, rows, **meta):
    """פורמט טבלאי קומפקטי לשכבות נקודה: [lon, lat, ...שדות]"""
    d = {'type': 'points', 'fields': fields, 'labels': labels, 'rows': rows}
    d.update(meta)
    return d


def bus_stats():
    """צבירת קובצי התחנות היומיים של מדד הדיוק על פני PERIOD הימים האחרונים —
    כמו profileOf ב-bus/app.js: [קוד, הגעות שנמדדו, איחור ממוצע×10, בזמן, מתוכנן]."""
    files = sorted(glob.glob(os.path.join(ROOT, 'bus/data/days/*.stops.json')))[-PERIOD:]
    acc = defaultdict(lambda: [0, 0.0, 0, 0, 0])   # n, sum, on, plan, n_with_plan
    for f in files:
        with open(f, encoding='utf-8') as fh:
            d = json.load(fh)
        for rows in d.values():
            for code, n, avg10, on, plan in rows:
                if not n:
                    continue
                a = acc[str(code)]
                a[0] += n; a[1] += avg10 / 10 * n; a[2] += on
                if plan:
                    a[3] += plan; a[4] += n
    days = [os.path.basename(f)[:10] for f in files]
    print(f'  מדד הדיוק: {len(acc)} תחנות, {days[0] if days else "-"}–{days[-1] if days else "-"}')
    return acc, days


def build_bus_stops(G, stats, days):
    fields = ['code', 'name', 'city', 'on', 'avg', 'n', 'seen', 'tpd', 'lines']
    labels = {'code': 'מק"ט תחנה', 'name': 'שם התחנה', 'city': 'יישוב', 'on': 'הגעות בזמן (%)',
              'avg': 'איחור ממוצע (דק׳)', 'n': 'הגעות שנמדדו', 'seen': 'נצפו מתוך המתוכנן (%)',
              'tpd': 'נסיעות ביום חול', 'lines': 'קווים'}
    rows = []
    per_stop = {}   # code -> (lon, lat, tpd, lines_set)
    for sid, s in G['stops'].items():
        if s['location_type'] not in ('0', ''):
            continue
        code = s['stop_code']
        try:
            x, y = float(s['stop_lon']), float(s['stop_lat'])
        except ValueError:
            continue
        rts = G['tt'].get(sid, {})
        tpd = sum(sum(v) for v in rts.values())
        lines = sorted({G['routes'][r]['short'] for r in rts if r in G['routes']}, key=lambda v: (len(v), v))
        a = stats.get(code)
        if not a and not tpd:
            continue
        on = round(100 * a[2] / a[0], 1) if a and a[0] else None
        avg = round(a[1] / a[0], 1) if a and a[0] else None
        seen = round(100 * a[4] / a[3]) if a and a[3] else None
        if seen is not None:
            seen = min(seen, 100)
        rows.append([r5(x), r5(y), code, s['stop_name'].strip(), city_of(s['stop_desc']), on, avg,
                     a[0] if a else 0, seen, tpd, ' '.join(lines[:40])])
        per_stop[code] = (x, y, sid)
    sz = jdump(os.path.join(OUT, 'bus-stops.json'), table(
        fields, labels, rows, period=[days[0], days[-1]] if days else None, day=str(G['day'])))
    print(f'  bus-stops.json: {len(rows)} תחנות, {sz // 1024} KB')
    return per_stop


def build_terminals(G):
    kids = defaultdict(list)
    for sid, s in G['stops'].items():
        if s.get('parent_station'):
            kids[s['parent_station']].append(sid)
    rows = []
    for sid, s in G['stops'].items():
        if s['location_type'] != '1':
            continue
        members = [sid] + kids.get(sid, [])
        rts = defaultdict(int)
        for m in members:
            for r, v in G['tt'].get(m, {}).items():
                rts[r] += sum(v)
        lines = sorted({G['routes'][r]['short'] for r in rts if r in G['routes']}, key=lambda v: (len(v), v))
        rows.append([r5(float(s['stop_lon'])), r5(float(s['stop_lat'])), s['stop_name'].strip(),
                     city_of(s['stop_desc']), len(kids.get(sid, [])), sum(rts.values()), len(lines),
                     ' '.join(lines[:60])])
    sz = jdump(os.path.join(OUT, 'terminals.json'), table(
        ['name', 'city', 'plat', 'tpd', 'nl', 'lines'],
        {'name': 'שם', 'city': 'יישוב', 'plat': 'רציפים/תחנות-בת', 'tpd': 'נסיעות ביום חול',
         'nl': 'מספר קווים', 'lines': 'קווים'}, rows,
        note='תחנות שמסומנות ב-GTFS כ"תחנת אב" (location_type=1): מסופים, תחנות מרכזיות ותחנות רכבת עם רציפים'))
    print(f'  terminals.json: {len(rows)}, {sz // 1024} KB')


def build_timetable(G, per_stop):
    """לוח זמנים לפי משבצות: לכל תחנה — לכל קו 24 ספירות (נסיעות לפי שעה)."""
    ridx, rlist = {}, []
    cells = defaultdict(dict)
    for code, (x, y, sid) in per_stop.items():
        rts = G['tt'].get(sid)
        if not rts:
            continue
        ent = []
        for rid, hrs in rts.items():
            if rid not in ridx:
                ridx[rid] = len(rlist)
                r = G['routes'].get(rid, {})
                rlist.append([r.get('short', ''), r.get('long', ''), r.get('agency', ''), r.get('makat', ''),
                              r.get('dir', ''), r.get('type', '')])
            last = max(i for i, v in enumerate(hrs) if v) + 1
            ent.append([ridx[rid]] + hrs[:last])
        cells[f'{math.floor(y * CELL)}_{math.floor(x * CELL)}'][code] = ent
    if os.path.isdir(TT):
        for f in glob.glob(os.path.join(TT, '*.json')):
            os.remove(f)
    tot = 0
    for k, v in cells.items():
        tot += jdump(os.path.join(TT, k + '.json'), v)
    jdump(os.path.join(OUT, 'routes.json'), {'cols': ['short', 'long', 'agency', 'makat', 'dir', 'type'],
                                             'day': str(G['day']), 'cell': CELL, 'routes': rlist})
    print(f'  tt: {len(cells)} משבצות, {tot // 1024} KB · {len(rlist)} מסלולים')


def build_rail():
    st = jload('rail/data/stations.json', {}) or {}
    idx = jload('rail/data/index.json', {}) or {}
    days = sorted([d for d in idx.get('days', []) if d.get('rides') and not (d.get('fix', 0) < d['rides'] * 0.5)],
                  key=lambda d: d['d'])[-PERIOD:]
    acc = defaultdict(lambda: [0, 0, 0.0, 0, 0])   # rides, n, sum, ok, b3
    for d in days:
        for k, s in (d.get('stations') or {}).items():
            a = acc[k]
            a[0] += s.get('rides') or 0
            if s.get('n'):
                a[1] += s['n']; a[2] += (s.get('avg') or 0) * s['n']
                b = s.get('b') or [0, 0, 0, 0]
                a[3] += b[0]; a[4] += b[3] if len(b) > 3 else 0
    rows = []
    for code, v in st.items():
        if not isinstance(v, list) or len(v) < 3 or v[1] is None:
            continue
        a = acc.get(code, [0, 0, 0, 0, 0])
        rows.append([r5(v[2]), r5(v[1]), code, v[0], a[0], a[1],
                     round(100 * a[3] / a[1], 1) if a[1] else None,
                     round(a[2] / a[1], 1) if a[1] else None,
                     round(100 * a[4] / a[1], 1) if a[1] else None])
    sz = jdump(os.path.join(OUT, 'rail-stations.json'), table(
        ['code', 'name', 'rides', 'n', 'on', 'avg', 'b3'],
        {'code': 'מק"ט', 'name': 'תחנה', 'rides': 'עצירות בלו"ז', 'n': 'נמדדו', 'on': 'בזמן (%)',
         'avg': 'איחור ממוצע (דק׳)', 'b3': 'איחור מעל 20 דק׳ (%)'}, rows,
        period=[days[0]['d'], days[-1]['d']] if days else None))
    print(f'  rail-stations.json: {len(rows)}, {sz // 1024} KB')
    return {code: (v[2], v[1], v[0]) for code, v in st.items() if isinstance(v, list) and len(v) > 2 and v[1] is not None}


def build_kavbug():
    scan = jload('kavbug-data/country-scan.json', {}) or {}
    feats = []
    for it in scan.get('issues', []):
        props = {k: it.get(k) for k in ('line', 'operator', 'dir', 'type', 'from', 'to', 'city', 'excessKm',
                                        'tripsDay', 'wasteDayKm', 'ratio', 'verdict', 'reason')}
        seg = it.get('seg')
        if seg and len(seg) > 1:
            geom = {'type': 'LineString', 'coordinates': simp_line([[p[1], p[0]] for p in seg], 0.00002)}
        elif it.get('lat') is not None:
            geom = {'type': 'Point', 'coordinates': [r5(it['lng']), r5(it['lat'])]}
        else:
            continue
        feats.append({'type': 'Feature', 'properties': props, 'geometry': geom})
    sz = jdump(os.path.join(OUT, 'kavbug.json'), {'type': 'FeatureCollection', 'generated': scan.get('generatedAt'),
                                                 'features': feats})
    print(f'  kavbug.json: {len(feats)}, {sz // 1024} KB')


def build_kavpach(G, g):
    d = jload('data-lines.json', {}) or {}
    th = (d.get('psetDefaults') or {}).get('minScore', 25)
    lines = [l for l in d.get('lines', []) if (l.get('sc') or {}).get('score', 0) >= th]
    by_makat = defaultdict(list)
    for rid, r in G['routes'].items():
        by_makat[r['makat']].append(rid)
    # לכל מק"ט וכיוון — המסלול (חלופה) עם הכי הרבה נסיעות ביום, והצורה הנפוצה שלו.
    # רק החלופה הראשית: כל החלופות יחד ניפחו את הקובץ ל-10MB
    want = {}
    for l in lines:
        for mk in l.get('makats') or [l.get('makat')]:
            best = {}
            for rid in by_makat.get(str(mk), []):
                sc = G['shape_cnt'].get(rid)
                if not sc:
                    continue
                dr = G['routes'][rid]['dir']
                if dr not in best or sum(sc.values()) > best[dr][0]:
                    best[dr] = (sum(sc.values()), rid, sc.most_common(1)[0][0])
            for _n, rid, shp in best.values():
                want[rid] = shp
    shapes = load_shapes(g, set(want.values()))
    feats = []
    for l in lines:
        segs = []
        seen = set()
        for mk in l.get('makats') or [l.get('makat')]:
            for rid in by_makat.get(str(mk), []):
                s = want.get(rid)
                if s in shapes and s not in seen:
                    seen.add(s)
                    segs.append(simp_line(shapes[s], 0.00012))
        if not segs:
            continue
        sc = l.get('sc') or {}
        props = {'line': l.get('lineNum'), 'makat': ' '.join(map(str, l.get('makats') or [])),
                 'origin': l.get('origin'), 'dest': l.get('dest'), 'district': l.get('district'),
                 'category': l.get('category'), 'score': sc.get('score'), 'trips': l.get('totalTrips'),
                 'avgRiders': round(l['avgRiders'], 1) if l.get('avgRiders') is not None else None,
                 'wastedKm': l.get('wastedKm'), 'avgCost': l.get('avgCost')}
        feats.append({'type': 'Feature', 'properties': props,
                      'geometry': {'type': 'MultiLineString', 'coordinates': segs}})
    sz = jdump(os.path.join(OUT, 'kavpach.json'), {'type': 'FeatureCollection', 'threshold': th,
                                                  'updated': d.get('updated'), 'features': feats})
    print(f'  kavpach.json: {len(feats)} מתוך {len(lines)} קווים עם ציון ≥{th}, {sz // 1024} KB')
    return {str(m) for l in lines for m in (l.get('makats') or [])}


def build_skip():
    d = jload('skip-stops/data.json', {}) or {}
    rows = []
    for it in d.get('items', []):
        if it.get('la') is None:
            continue
        rows.append([r5(it['lo']), r5(it['la']), it.get('line'), it.get('op'), it.get('city'), it.get('stop'),
                     it.get('code'), (it.get('bstop') or {}).get('n'), (it.get('astop') or {}).get('n'),
                     it.get('onum')])
    sz = jdump(os.path.join(OUT, 'skip-stops.json'), table(
        ['line', 'op', 'city', 'stop', 'code', 'before', 'after', 'others'],
        {'line': 'קו', 'op': 'מפעיל', 'city': 'יישוב', 'stop': 'התחנה שמדלגים עליה', 'code': 'מק"ט',
         'before': 'התחנה הקודמת', 'after': 'התחנה הבאה', 'others': 'קווים אחרים שעוצרים בה'}, rows))
    print(f'  skip-stops.json: {len(rows)}, {sz // 1024} KB')


def build_parks():
    meta = jload('parks/data/parks.json', []) or []
    feats = []
    for m in meta:
        p = jload('parks/data/' + m['f'], None)
        if not p or not p.get('polys'):
            continue
        polys = []
        for ring in p['polys']:
            r = simp_line([[q[1], q[0]] for q in ring], 0.00003)
            if len(r) >= 4:
                polys.append([r])
        if not polys:
            continue
        props = {'name': m.get('name'), 'city': m.get('city'), 'area': m.get('area'), 'lines': m.get('lines'),
                 'cov': m.get('cov'), 'zt': m.get('zt'), 'f': m['f']}
        feats.append({'type': 'Feature', 'properties': props,
                      'geometry': {'type': 'MultiPolygon', 'coordinates': polys}})
    sz = jdump(os.path.join(OUT, 'parks.json'), {'type': 'FeatureCollection', 'features': feats})
    print(f'  parks.json: {len(feats)}, {sz // 1024} KB')


def build_fleet():
    fc = jload('fleet/data/fleet-cities.json', {}) or {}
    fl = jload('fleet/data/fleet.json', {}) or {}
    boxes = jload('line-history/data/cities.json', {}) or {}
    ops = {str(o.get('ref')): o.get('name') for o in fl.get('operators', []) if isinstance(o, dict)}
    rows, miss = [], []
    for city, c in (fc.get('cities') or {}).items():
        b = boxes.get(city)
        if not b:
            miss.append(city)
            continue
        top = ' · '.join(f'{ops.get(str(r), "מפעיל " + str(r))} {n}' for r, n in (c.get('ops') or [])[:5])
        rows.append([r5((b[1] + b[3]) / 2), r5((b[0] + b[2]) / 2), city, c.get('total'), c.get('act'), top])
    sz = jdump(os.path.join(OUT, 'fleet-cities.json'), table(
        ['city', 'total', 'act', 'ops'],
        {'city': 'יישוב', 'total': 'רכבים שונים ששירתו את היישוב', 'act': 'פעילים בחודש האחרון',
         'ops': 'המפעילים הגדולים (רכבים)'}, rows, updated=fc.get('updated'),
        note='הנקודה היא מרכז תחום היישוב (תיבת הגבול שלו), לא מיקום של חניון או רכב'))
    print(f'  fleet-cities.json: {len(rows)} יישובים ({len(miss)} בלי תיבת גבול — לא נכנסו), {sz // 1024} KB')


# ---------------------------------------------------------------- שכונות
HEB = re.compile(r'[\u0590-\u05FF]')


def _field_profile(feats, f):
    vals = [(ft.get('properties') or {}).get(f) for ft in feats]
    vals = [v for v in vals if v not in (None, '')]
    heb = sum(1 for v in vals if isinstance(v, str) and HEB.search(v))
    return len(vals), heb, len(set(map(str, vals)))


def _mot_hoods(prefix, need_name):
    """שכבת שכונות ממאגר של משרד התחבורה (שלמה 30.09: מאותו מקור כמו שאר ה-GIS).
    בודקים את השדות בפועל ומדפיסים; אם אין שם עברי / יישוב ברור — מחזירים None."""
    cat = jload('gis/data/catalog.json', {}) or {}
    cands = [l for l in cat.get('layers', []) if l.get('dataset') == prefix or l.get('dataset', '').startswith(prefix + '_')]
    if cands:   # כמה גרסאות (taz_2016, taz_2020...) — לוקחים את המאגר שעודכן אחרון, לא מערבבים
        ds = max(cands, key=lambda l: l.get('modified') or '')['dataset']
        cands = [l for l in cands if l['dataset'] == ds and l.get('geom') == 'Polygon']
    files = [os.path.join(ROOT, 'gis', 'data', l['file']) for l in cands if os.path.exists(os.path.join(ROOT, 'gis', 'data', l['file']))]
    if not files:
        print(f'  {prefix}: אין קובץ (שכבות משרד התחבורה עוד לא ירדו)')
        return None
    feats = []
    for f in files:
        with open(f, encoding='utf-8') as fh:
            feats.extend(x for x in json.load(fh).get('features', [])
                         if (x.get('geometry') or {}).get('type') in ('Polygon', 'MultiPolygon'))
    if not feats:
        print(f'  {prefix}: אין פוליגונים')
        return None
    fields = []
    for ft in feats[:500]:
        for k in (ft.get('properties') or {}):
            if k not in fields:
                fields.append(k)
    prof = {f: _field_profile(feats, f) for f in fields}
    print(f'  {prefix}: {len(feats)} פוליגונים · שדות: ' +
          ', '.join(f'{f}(ערכים {p[0]}, עברית {p[1]}, שונים {p[2]})' for f, p in prof.items()))
    city_f = next((f for f in fields if re.search(r'city|yishuv|ishuv|settl|muni|shem_y|עיר|ישוב|יישוב|רשות', f, re.I)
                   and prof[f][1] > 0.8 * len(feats)), None)
    name_f = next((f for f in fields if f != city_f and prof[f][1] > 0.8 * len(feats) and prof[f][2] > 0.3 * len(feats)), None)
    id_f = next((f for f in fields if re.search(r'taz|id|num|code|מס', f, re.I) and prof[f][2] > 0.9 * len(feats)), None)
    print(f'   שם={name_f} יישוב={city_f} מזהה={id_f}')
    if need_name and not name_f:
        return None
    if not need_name and not (city_f and id_f):
        return None
    rows = []
    for ft in feats:
        pr = ft.get('properties') or {}
        g = ft['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        pts = [p for poly in polys for ring in poly for p in ring]
        if not pts:
            continue
        bbox = [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]
        city = str(pr.get(city_f) or '') if city_f else ''
        name = str(pr.get(name_f)) if name_f else f'אזור תנועה {pr.get(id_f)}'
        rows.append([pr.get(id_f), name, city, bbox, polys])
    return rows


def load_hoods():
    """מקור גבולות השכונות, לפי סדר העדפה (שלמה 30.09):
    1. שכבת השכונות של המרכז למיפוי ישראל (GovMap שכבה 22, דרך over.org.il) — שמות עבריים
       וכיסוי ארצי; כבר יושבת במאגר (line-history/data/neighborhoods, tools/build_neighborhoods.py);
    2. גיבוי בלבד: merhavironi / אזורי תנועה (TAZ) של משרד התחבורה — הם מוצגים גם כשכבות
       נפרדות בעץ של משרד התחבורה."""
    rows = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'line-history/data/neighborhoods/*.json.gz'))):
        with gzip.open(f, 'rt', encoding='utf-8') as fh:
            rows.extend(json.load(fh))
    src = jload('line-history/data/neighborhoods/source.json', {}) or {}
    if rows:
        src = dict(src, source='המרכז למיפוי ישראל — שכבת השכונות ב-GovMap (שכבה 22), דרך over.org.il')
        rows.sort(key=lambda r: (r[2] or '', r[1] or '', r[3]))
        return rows, src
    for prefix, need_name, label in (('merhavironi', True, 'משרד התחבורה — מרחבים עירוניים (merhavironi)'),
                                      ('taz', False, 'משרד התחבורה — אזורי תנועה (TAZ)'),
                                      ('accid_taz', False, 'משרד התחבורה — אזורי תנועה (accid_taz)')):
        rows = _mot_hoods(prefix, need_name)
        if rows and len(rows) >= 500:
            rows.sort(key=lambda r: (r[2] or '', r[1] or '', r[3]))
            return rows, {'source': label, 'url': f'https://data.gov.il/dataset/{prefix}', 'count': len(rows)}
        if rows:
            print(f'   {prefix}: רק {len(rows)} יחידות — לא מספיק לכיסוי ארצי')
    return [], {}


class Grid:
    def __init__(self, pts, cell=0.01):
        self.c = cell
        self.g = defaultdict(list)
        for p in pts:
            self.g[(int(p[0] // cell), int(p[1] // cell))].append(p)

    def near(self, x0, y0, x1, y1):
        c = self.c
        for i in range(int(x0 // c), int(x1 // c) + 1):
            for j in range(int(y0 // c), int(y1 // c) + 1):
                yield from self.g.get((i, j), ())


def build_hoods(per_stop, rail):
    rows, src = load_hoods()
    if not rows:
        print('  ! אין שכבת שכונות')
        return
    feats = []
    stop_pts = [(x, y, code) for code, (x, y, _sid) in per_stop.items()]
    grid = Grid(stop_pts)
    rail_pts = [(x, y, code) for code, (x, y, _n) in rail.items()]
    link = []        # לכל שכונה: [[קוד תחנה, מרחק], ...] עד 800 מ'
    cover = []       # לכל שכונה: אחוז כיסוי לכל רדיוס
    rails = []
    for i, (hid, name, city, bbox, polys) in enumerate(rows):
        sp = []
        for poly in polys:
            rr = [simp_line(ring, 0.00002) for ring in poly]
            rr = [r for r in rr if len(r) >= 4]
            if rr:
                sp.append(rr)
        if not sp:
            sp = polys
        area = poly_area_m2(polys)
        feats.append({'type': 'Feature', 'properties': {'i': i, 'name': name, 'city': city,
                                                         'km2': round(area / 1e6, 3)},
                      'geometry': {'type': 'MultiPolygon', 'coordinates': sp}})
        x0, y0, x1, y1 = bbox
        lat = (y0 + y1) / 2
        dx, dy = MAXR / m_lon(lat), MAXR / M_LAT
        near = []
        for x, y, code in grid.near(x0 - dx, y0 - dy, x1 + dx, y1 + dy):
            if x0 - dx <= x <= x1 + dx and y0 - dy <= y <= y1 + dy:
                dd = dist_to_poly_m(x, y, polys)
                if dd <= MAXR:
                    near.append((x, y, code, dd))
        link.append([[c, int(round(d))] for _x, _y, c, d in sorted(near, key=lambda t: t[3])])
        rails.append([[c, int(round(dist_to_poly_m(x, y, polys)))] for x, y, c in rail_pts
                      if x0 - dx <= x <= x1 + dx and y0 - dy <= y <= y1 + dy
                      and dist_to_poly_m(x, y, polys) <= MAXR])
        # כיסוי: דגימת רשת בתוך השכונה (~400 נקודות), לכל נקודה המרחק לתחנה הקרובה
        step = max(15.0, math.sqrt(max(area, 1) / 400))
        sx, sy = step / m_lon(lat), step / M_LAT
        inside = 0
        hit = [0] * len(RADII)
        kx = m_lon(lat)
        cand = [(x, y) for x, y, _c, _d in near]
        yy = y0 + sy / 2
        while yy < y1:
            xx = x0 + sx / 2
            while xx < x1:
                if in_poly(xx, yy, polys):
                    inside += 1
                    best = min((((x - xx) * kx) ** 2 + ((y - yy) * M_LAT) ** 2 for x, y in cand), default=1e18)
                    best = math.sqrt(best)
                    for k, r in enumerate(RADII):
                        if best <= r:
                            hit[k] += 1
                xx += sx
            yy += sy
        cover.append([round(100 * h / inside) if inside else None for h in hit])
    sz = jdump(os.path.join(OUT, 'hoods.json'), {'type': 'FeatureCollection', 'source': src, 'features': feats})
    sz2 = jdump(os.path.join(OUT, 'hoods-link.json'), {'radii': RADII, 'max': MAXR, 'stops': link,
                                                       'cover': cover, 'rail': rails})
    print(f'  hoods.json: {len(feats)} שכונות, {sz // 1024} KB · hoods-link.json {sz2 // 1024} KB')


def main():
    os.makedirs(OUT, exist_ok=True)
    print('== שכבות שלא תלויות ב-GTFS')
    build_kavbug()
    build_skip()
    build_parks()
    build_fleet()
    rail = build_rail()
    g = Gtfs()
    if not g.ok:
        print('!! אין GTFS (GTFS_DIR/GTFS_ZIP) — תחנות, מסופים, קו פח, לוח זמנים ושכונות לא נבנו מחדש')
        return
    G = build_gtfs(g)
    stats, days = bus_stats()
    per_stop = build_bus_stops(G, stats, days)
    build_terminals(G)
    build_timetable(G, per_stop)
    build_route_times(g, G['day'])
    build_kavpach(G, g)
    build_hoods(per_stop, rail)
    jdump(os.path.join(OUT, 'meta.json'), {'built': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'),
                                          'gtfsDay': str(G['day']), 'period': [days[0], days[-1]] if days else None,
                                          'radii': RADII})
    print('== סיום')


if __name__ == '__main__':
    sys.exit(main())
