#!/usr/bin/env python3
# רחוב לכל תחנה לפי המפה (OpenStreetMap, roads.json מענף osm-roads): הרחוב/הכביש הקרוב לתחנה עד 40 מ'.
# רק כשאין רחוב במפה בטווח — הכתובת מ-GTFS (stop_desc "רחוב: X"). עיר לכל תחנה מ-stop_desc. (שלמה 26.09)
import csv, json, math, os, re, sys
from collections import defaultdict
src = sys.argv[1] if len(sys.argv) > 1 else 'stops.txt'
roads_path = sys.argv[2] if len(sys.argv) > 2 else 'roads.json'
outdir = os.environ.get('OUTDIR', 'line-history/data')
HEB = re.compile('[א-ת]')
CELL = 0.002
grid = defaultdict(list)
roads = []
try:
    for r in json.load(open(roads_path, encoding='utf-8'))['roads']:
        n = r['n']
        if not HEB.search(n): continue
        ri = len(roads); roads.append(n); g = r['g']
        for (a, b), (c, d) in zip(g, g[1:]):
            for i in range(int(min(a, c) / CELL) - 1, int(max(a, c) / CELL) + 2):
                for j in range(int(min(b, d) / CELL) - 1, int(max(b, d) / CELL) + 2):
                    grid[(i, j)].append((ri, a, b, c, d))
except FileNotFoundError:
    print('אין roads.json — רק לפי כתובת')
def seg_dist(py, px, a, b, c, d):
    # מטרים, הקרנה שטוחה מקומית
    ky, kx = 111320, 94000
    x1, y1, x2, y2, x, y = b * kx, a * ky, d * kx, c * ky, px * kx, py * ky
    dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
def nearest(lat, lon, name=''):
    # הרחוב הקרוב ביותר במפה, עד 40 מ' — לפי המפה בלבד, לא לפי שם התחנה
    cand = {}
    for seg in grid.get((int(lat / CELL), int(lon / CELL)), ()):
        dd = seg_dist(lat, lon, *seg[1:])
        if dd <= 40:
            n = roads[seg[0]]
            if dd < cand.get(n, 99): cand[n] = dd
    if not cand: return None
    return min(cand, key=lambda n: cand[n])
m, cities, nmap = {}, {}, 0
for r in csv.DictReader(open(src, encoding='utf-8-sig')):
    code = r.get('stop_code')
    if not code: continue
    c = re.search(r'עיר:\s*(.*?)\s*רציף:', r.get('stop_desc') or '')
    if c and c.group(1).strip(): cities[code] = c.group(1).strip()
    st = None
    try: st = nearest(float(r['stop_lat']), float(r['stop_lon']), r.get('stop_name', ''))
    except ValueError: pass
    if st: nmap += 1
    else:
        s = re.search(r'רחוב:\s*(.*?)\s*עיר:', r.get('stop_desc') or '')
        st = s.group(1).strip() if s else ''
        if re.fullmatch(r'[\d/]+', st): st = 'כביש ' + st
        else: st = re.sub(r'\s+\d+[א-ת]?$', '', st).strip()
    if st: m[code] = st
if len(m) > 1000:
    json.dump(m, open(os.path.join(outdir, 'stop-streets.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
if len(cities) > 1000:
    json.dump(cities, open(os.path.join(outdir, 'stop-cities.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
print('רחובות תחנות:', len(m), '· מהמפה:', nmap, '· ערים:', len(cities))
