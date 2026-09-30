#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""רשת ההליכה ל-GIS (שלמה 30.09: "טווח הליכה לפי רחובות ושבילים, לא רדיוס קבוע").

קלט: קובץ OSM של ישראל (Geofabrik, israel-and-palestine-latest.osm.pbf — מורד ב-gis-layers.yml).
פלט: gis/data/walk/
  <ty>_<tx>.json   משבצת של 0.02° (בערך 2.2×1.9 ק"מ): צמתים ומקטעים של רשת ההולכי-רגל
                   {"n": [lat*1e5, lon*1e5, ...], "e": [i, j, אורך במטרים, ...], "s": [[שם, [i, j, ...]], ...]}
                   i/j — אינדקס צומת בתוך המשבצת. מקטע שחוצה משבצות נשמר במשבצת של הצומת הראשון, והצומת
                   השני מופיע גם בה (אותה קואורדינטה) — הדפדפן מאחד צמתים לפי הקואורדינטה.
                   "s" — רחובות עם שם (לתצוגת "לפי קטע רחוב"): רצף הצמתים של כל קטע דרך עם שם.
  streets.json     {יישוב: {שם רחוב: [משבצות]}} — היישוב לפי גבולות השכונות (gis/data/own/hoods.json)
  meta.json        תאריך, מקור וקרדיט (OpenStreetMap, ODbL)

מה נכנס לרשת: כל דרך שהולכי רגל יכולים ללכת בה — footway, path, pedestrian, steps, living_street, residential,
service, unclassified, tertiary, secondary, primary, track, cycleway (עם foot לא אסור), crossing וכו'.
לא נכנס: motorway/trunk (אלא אם foot=yes או יש מדרכה מתויגת), access=no/private, foot=no, area=yes.
פישוט: בין צמתים (נקודות שבהן נפגשות דרכים) הקודקודים מפושטים ב-Douglas-Peucker של 4 מ'; אורך המקטע הוא
האורך המקורי המלא (לא של הקו המפושט).
"""
import json
import math
import os
import sys
from collections import defaultdict

import osmium

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('WALK_OUT') or os.path.join(ROOT, 'gis', 'data', 'walk')
CELL = 0.02
TOL_M = 4.0

WALK = {'footway', 'path', 'pedestrian', 'steps', 'living_street', 'residential', 'service', 'unclassified',
        'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'track',
        'cycleway', 'road', 'corridor', 'bridleway', 'crossing', 'platform'}
FAST = {'motorway', 'motorway_link', 'trunk', 'trunk_link'}
NAMED = {'residential', 'living_street', 'pedestrian', 'unclassified', 'tertiary', 'tertiary_link', 'secondary',
         'secondary_link', 'primary', 'primary_link', 'trunk', 'trunk_link', 'service', 'road'}


def walkable(t):
    hw = t.get('highway')
    if not hw or t.get('area') == 'yes':
        return False
    if t.get('access') in ('no', 'private') and t.get('foot') not in ('yes', 'designated', 'permissive'):
        return False
    if t.get('foot') in ('no', 'private'):
        return False
    if hw in FAST:
        return t.get('foot') in ('yes', 'designated') or t.get('sidewalk') in ('both', 'left', 'right', 'yes')
    return hw in WALK


def dist_m(a, b):
    kx = math.cos(math.radians((a[0] + b[0]) / 2)) * 111320.0
    return math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * 110574.0)


def dp(pts, tol):
    """Douglas-Peucker על רשימת (lat, lon); מחזיר אינדקסים לשמירה"""
    if len(pts) < 3:
        return list(range(len(pts)))
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    kx = math.cos(math.radians(pts[0][0])) * 111320.0
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a][1] * kx, pts[a][0] * 110574.0
        bx, by = pts[b][1] * kx, pts[b][0] * 110574.0
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i][1] * kx, pts[i][0] * 110574.0
            t = ((px - ax) * dx + (py - ay) * dy) / L2 if L2 else 0
            t = max(0.0, min(1.0, t))
            d = math.hypot(ax + t * dx - px, ay + t * dy - py)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [i for i, k in enumerate(keep) if k]


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []          # (name|None, highway, [(nid, lat, lon)])
        self.use = defaultdict(int)

    def way(self, w):
        t = w.tags
        if not walkable(t):
            return
        try:
            nodes = [(n.ref, n.location.lat, n.location.lon) for n in w.nodes if n.location.valid()]
        except osmium.InvalidLocationError:
            return
        if len(nodes) < 2:
            return
        for i, (nid, _a, _b) in enumerate(nodes):
            self.use[nid] += 2 if i in (0, len(nodes) - 1) else 1
        hw = t.get('highway')
        self.ways.append((t.get('name:he') or t.get('name') if hw in NAMED else None, hw, nodes))


def load_hoods():
    try:
        d = json.load(open(os.path.join(ROOT, 'gis', 'data', 'own', 'hoods.json'), encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return []
    out = []
    for f in d.get('features', []):
        g = f.get('geometry') or {}
        polys = [g['coordinates']] if g.get('type') == 'Polygon' else g.get('coordinates', []) if g.get('type') == 'MultiPolygon' else []
        for P in polys:
            ring = P[0]
            xs = [c[0] for c in ring]
            ys = [c[1] for c in ring]
            out.append(((min(xs), min(ys), max(xs), max(ys)), ring, (f.get('properties') or {}).get('city')))
    return out


def pip(x, y, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def city_of(lat, lon, hoods, grid):
    for k in grid.get((int(lat * 20), int(lon * 20)), ()):
        (x0, y0, x1, y1), ring, city = hoods[k]
        if x0 <= lon <= x1 and y0 <= lat <= y1 and pip(lon, lat, ring):
            return city
    return None


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PBF', 'israel.osm.pbf')
    if not os.path.exists(src):
        print('!! אין קובץ OSM:', src)
        return 1
    h = H()
    h.apply_file(src, locations=True, idx='flex_mem')
    print(f'דרכים להליכה: {len(h.ways)}')
    tiles = defaultdict(lambda: {'n': [], 'e': [], 's': [], 'ix': {}})

    def tkey(lat, lon):
        return f'{math.floor(lat / CELL)}_{math.floor(lon / CELL)}'

    def nidx(T, lat, lon):
        k = (round(lat * 1e5), round(lon * 1e5))
        i = T['ix'].get(k)
        if i is None:
            i = T['ix'][k] = len(T['n']) // 2
            T['n'] += [k[0], k[1]]
        return i

    hoods = load_hoods()
    hgrid = defaultdict(list)
    for k, ((x0, y0, x1, y1), _r, _c) in enumerate(hoods):
        for a in range(int(y0 * 20), int(y1 * 20) + 1):
            for b in range(int(x0 * 20), int(x1 * 20) + 1):
                hgrid[(a, b)].append(k)
    streets = defaultdict(lambda: defaultdict(set))
    nedges = 0
    for name, _hw, nodes in h.ways:
        # פיצול בצמתים: נקודה שמשמשת יותר מדרך אחת (או קצה דרך)
        cut = [0] + [i for i in range(1, len(nodes) - 1) if h.use[nodes[i][0]] > 1] + [len(nodes) - 1]
        kept_all = []
        for a, b in zip(cut, cut[1:]):
            part = [(p[1], p[2]) for p in nodes[a:b + 1]]
            keep = dp(part, TOL_M)
            # אורך אמיתי בין נקודות שנשמרו
            for u, v in zip(keep, keep[1:]):
                L = sum(dist_m(part[q], part[q + 1]) for q in range(u, v))
                A, B = part[u], part[v]
                T = tiles[tkey(*A)]
                i, j = nidx(T, *A), nidx(T, *B)
                if i != j:
                    T['e'] += [i, j, max(1, round(L))]
                    nedges += 1
            kept_all += [part[q] for q in keep] if not kept_all else [part[q] for q in keep[1:]]
        if name and len(kept_all) > 1:
            # רחוב עם שם: לכל משבצת — הרצף שמתחיל בה
            cur, curT = [], None
            for p in kept_all:
                k = tkey(*p)
                if curT is None:
                    curT = k
                if k != curT and cur:
                    T = tiles[curT]
                    T['s'].append([name, [nidx(T, *q) for q in cur + [p]]])
                    cur, curT = [], k
                cur.append(p)
            if len(cur) > 1:
                T = tiles[curT]
                T['s'].append([name, [nidx(T, *q) for q in cur]])
            mid = kept_all[len(kept_all) // 2]
            city = city_of(mid[0], mid[1], hoods, hgrid)
            if city:
                for p in kept_all[::5] + [kept_all[-1]]:
                    streets[city][name].add(tkey(*p))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json'):
            os.remove(os.path.join(OUT, f))
    mx, tot = 0, 0
    for k, T in tiles.items():
        s = json.dumps({'n': T['n'], 'e': T['e'], 's': T['s']}, ensure_ascii=False, separators=(',', ':'))
        open(os.path.join(OUT, k + '.json'), 'w', encoding='utf-8').write(s)
        mx = max(mx, len(s))
        tot += len(s)
    sidx = {c: {n: sorted(v) for n, v in sorted(d.items())} for c, d in sorted(streets.items())}
    json.dump(sidx, open(os.path.join(OUT, 'streets.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    import datetime
    json.dump({'gen': datetime.date.today().isoformat(), 'cell': CELL, 'tiles': len(tiles), 'edges': nedges,
               'source': 'OpenStreetMap (© תורמי OpenStreetMap, ODbL) דרך Geofabrik'},
              open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'משבצות: {len(tiles)} · מקטעים: {nedges} · הכי גדולה {mx // 1024} KB · סך הכול {tot // 1048576} MB · '
          f'רחובות ב-{len(sidx)} יישובים')
    return 0


if __name__ == '__main__':
    sys.exit(main())
