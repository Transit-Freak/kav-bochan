"""בונה את world/city.json של משחק האוטובוס מנתוני OpenStreetMap ומתחנות ה-GTFS.

קלט:
  world/osm_raw.json.gz — פלט Overpass (ה-workflow ‏bus-game-osm מוריד אותו)
  world/gtfs_stops.csv  — התחנות הפעילות בתחום העיר, מתוך stops.txt בענף gtfs-data
הרצה:  python3 tools/build_city.py   (מתוך unreleased/bus-game)

הפלט (מטרים, ראשית במרכז העיר, x מזרחה, y צפונה; ערכים שלמים בדצימטרים):
  buildings: [[h_dm, x0,y0,x1,y1,...], ...]           טבעת חיצונית, בלי חזרה על הנקודה הראשונה
  roads:     [[class, width_dm, x0,y0,...], ...]       רחובות (גם שבילים) — לציור
  areas:     [[kind, x0,y0,...], ...]                  פארקים/דשא/מגרשים
  graph:     {nodes:[x,y,...], edges:[a,b,a,b,...]}    רשת נסיעה מכוונת לאוטובוס (חד-סטרי נשמר)
  stops:     [{id, code, name, x, y, e, t, w}]         e = קשת ברשת (אינדקס לזוג ב-edges), t = מיקום על הקשת 0..1,
                                                       w = משקל ביקוש (שטח הבנייה בסביבה, מנורמל)
"""
import gzip, json, math, os, csv, hashlib, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
W = os.path.join(ROOT, 'world')
raw = json.load(gzip.open(os.path.join(W, 'osm_raw.json.gz'), 'rt', encoding='utf-8'))
EL = raw['elements']

LAT0, LON0 = 31.7305, 34.7445          # מרכז קריית מלאכי (בערך)
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def P(lat, lon): return ((lon - LON0) * KX, (lat - LAT0) * KY)
HALF_X, HALF_Y = 2300, 2000            # גבולות העולם במשחק (מטרים מהמרכז)
def inside(x, y, m=0): return abs(x) <= HALF_X + m and abs(y) <= HALF_Y + m
def dm(v): return int(round(v * 10))

def hval(s):
    try: return float(str(s).replace('m', '').split(';')[0].strip())
    except Exception: return None

def area(pts):
    a = 0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]; a += x0 * y1 - x1 * y0
    return a / 2

def rnd(seed, lo, hi):
    h = int(hashlib.md5(str(seed).encode()).hexdigest()[:8], 16) / 0xffffffff
    return lo + (hi - lo) * h

# ---------- בניינים
buildings = []; bcent = []
def add_building(eid, tags, ring):
    if len(ring) < 3: return
    if ring[0] == ring[-1]: ring = ring[:-1]
    if len(ring) < 3: return
    cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
    if not inside(cx, cy): return
    a = area(ring)
    if a < 0: ring = ring[::-1]; a = -a
    if a < 8: return
    h = hval(tags.get('height'))
    lv = hval(tags.get('building:levels'))
    b = tags.get('building', 'yes')
    if h is None and lv is not None: h = lv * 3.0 + 1.0
    if h is None:
        if b in ('house', 'detached', 'semidetached_house', 'terrace', 'bungalow'): h = rnd(eid, 5.5, 8)
        elif b in ('apartments', 'residential'): h = rnd(eid, 10, 19) if a > 250 else rnd(eid, 7, 11)
        elif b in ('garage', 'garages', 'shed', 'roof', 'carport', 'hut', 'kiosk', 'container'): h = rnd(eid, 2.6, 3.6)
        elif b in ('industrial', 'warehouse', 'retail', 'commercial', 'supermarket'): h = rnd(eid, 6, 10)
        elif b in ('school', 'public', 'civic', 'synagogue', 'kindergarten', 'hospital', 'office'): h = rnd(eid, 6, 11)
        else: h = rnd(eid, 6, 10) if a > 300 else rnd(eid, 3.5, 7)
    h = max(2.5, min(h, 60))
    if b == 'roof': h = 3.0
    flat = [dm(h)]
    for x, y in ring: flat += [dm(x), dm(y)]
    buildings.append(flat); bcent.append((cx, cy, a * max(1, round(h / 3))))

# ---------- רחובות ורשת
DRIVE = {'motorway': 14, 'trunk': 13, 'primary': 12, 'secondary': 10.5, 'tertiary': 9, 'unclassified': 7,
         'residential': 7, 'living_street': 6, 'service': 4.5, 'motorway_link': 7, 'trunk_link': 7,
         'primary_link': 7, 'secondary_link': 7, 'tertiary_link': 6.5, 'road': 6, 'bus_guideway': 6, 'busway': 7}
FOOT = {'footway': 2.2, 'path': 1.8, 'pedestrian': 5, 'cycleway': 2, 'steps': 2}
roads = []; areas = []
nodes = {}; nid = []; edges = set()
def node(osm_id, x, y):
    if osm_id not in nodes:
        nodes[osm_id] = len(nid); nid.append((x, y))
    return nodes[osm_id]

AREA_KIND = {('leisure', 'park'): 'park', ('leisure', 'garden'): 'park', ('landuse', 'grass'): 'grass',
             ('leisure', 'pitch'): 'pitch', ('landuse', 'recreation_ground'): 'park', ('natural', 'scrub'): 'scrub',
             ('landuse', 'meadow'): 'grass', ('landuse', 'farmland'): 'farm', ('landuse', 'orchard'): 'orchard',
             ('natural', 'wood'): 'wood', ('landuse', 'forest'): 'wood', ('leisure', 'playground'): 'play',
             ('amenity', 'parking'): 'parking', ('landuse', 'cemetery'): 'grass', ('natural', 'sand'): 'sand',
             ('leisure', 'stadium'): 'pitch', ('landuse', 'village_green'): 'grass'}

for e in EL:
    t = e.get('tags', {})
    if e['type'] == 'way' and 'geometry' in e:
        g = [P(p['lat'], p['lon']) for p in e['geometry'] if p]
        if 'building' in t and t.get('building') != 'no':
            add_building(e['id'], t, g); continue
        hw = t.get('highway')
        if hw in DRIVE or hw in FOOT:
            if t.get('area') == 'yes': continue
            if not any(inside(x, y, 50) for x, y in g): continue
            lanes = hval(t.get('lanes'))
            w = DRIVE.get(hw) or FOOT.get(hw)
            if hw in DRIVE and lanes: w = max(w, min(lanes * 3.3, 16))
            if hw == 'service' and t.get('service') in ('parking_aisle', 'driveway'): w = 3.5
            cls = 'd' if hw in DRIVE else 'f'
            if hw in ('primary', 'secondary', 'trunk', 'motorway'): cls = 'm'
            flat = [cls, dm(w)]
            for x, y in g: flat += [dm(x), dm(y)]
            roads.append(flat)
            # רשת הנסיעה: בלי חניונים, דרכים פרטיות ו"שירות" צרות; האוטובוס לא נוסע בשבילים
            if hw in DRIVE and t.get('access') not in ('private', 'no') and t.get('service') not in ('parking_aisle', 'driveway', 'drive-through'):
                ow = t.get('oneway', 'no'); rev = ow == '-1'
                one = ow in ('yes', '1', 'true', '-1') or t.get('junction') == 'roundabout' or hw in ('motorway', 'motorway_link')
                if t.get('oneway:bus') == 'no' or t.get('busway') == 'opposite_lane': one = False
                ids = e['nodes']
                for i in range(len(ids) - 1):
                    a = node(ids[i], *g[i]); b = node(ids[i + 1], *g[i + 1])
                    if a == b: continue
                    if not one or not rev: edges.add((a, b))
                    if not one or rev: edges.add((b, a))
            continue
        for (k, v), kind in AREA_KIND.items():
            if t.get(k) == v and len(g) >= 4 and g[0] == g[-1]:
                ring = g[:-1]
                if not any(inside(x, y, 200) for x, y in ring): break
                flat = [kind]
                for x, y in ring: flat += [dm(x), dm(y)]
                areas.append(flat); break
    elif e['type'] == 'relation' and 'building' in e.get('tags', {}):
        for m in e.get('members', []):
            if m.get('role') == 'outer' and m.get('geometry'):
                add_building(f"{e['id']}_{m.get('ref')}", t, [P(p['lat'], p['lon']) for p in m['geometry'] if p])

# ---------- דחיסת הרשת: רק הרכיב הקשיר החזק הגדול (שהאוטובוס לא ייתקע ברחוב ללא מוצא חד-סטרי)
N = len(nid)
adj = [[] for _ in range(N)]; radj = [[] for _ in range(N)]
for a, b in edges: adj[a].append(b); radj[b].append(a)
sys.setrecursionlimit(100000)
order = []; seen = [False] * N
for s in range(N):
    if seen[s]: continue
    stack = [(s, 0)]; seen[s] = True
    while stack:
        v, i = stack.pop()
        if i < len(adj[v]):
            stack.append((v, i + 1)); w = adj[v][i]
            if not seen[w]: seen[w] = True; stack.append((w, 0))
        else: order.append(v)
comp = [-1] * N; c = 0
for s in reversed(order):
    if comp[s] != -1: continue
    st = [s]; comp[s] = c
    while st:
        v = st.pop()
        for w in radj[v]:
            if comp[w] == -1: comp[w] = c; st.append(w)
    c += 1
from collections import Counter
big = Counter(comp).most_common(1)[0][0]
keep = [i for i in range(N) if comp[i] == big]
remap = {o: n for n, o in enumerate(keep)}
gnodes = [nid[i] for i in keep]
gedges = sorted((remap[a], remap[b]) for a, b in edges if a in remap and b in remap)
print('graph nodes', len(gnodes), 'of', N, 'edges', len(gedges), 'of', len(edges))

# ---------- תחנות: GTFS (פעילות), מוצמדות לקשת הקרובה בצד ימין של כיוון הנסיעה
def proj(px, py, a, b):
    ax, ay = gnodes[a]; bx, by = gnodes[b]
    dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1e-9
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
    qx, qy = ax + t * dx, ay + t * dy
    side = dx * (py - ay) - dy * (px - ax)     # >0: הנקודה משמאל לכיוון הנסיעה
    return math.hypot(px - qx, py - qy), t, side
# אינדקס מרחבי פשוט לקשתות
CELL = 60; grid = {}
for ei, (a, b) in enumerate(gedges):
    (ax, ay), (bx, by) = gnodes[a], gnodes[b]
    for gx in range(int(min(ax, bx) // CELL), int(max(ax, bx) // CELL) + 1):
        for gy in range(int(min(ay, by) // CELL), int(max(ay, by) // CELL) + 1):
            grid.setdefault((gx, gy), []).append(ei)
def near_edges(x, y, r=1):
    gx, gy = int(x // CELL), int(y // CELL); out = set()
    for i in range(-r, r + 1):
        for j in range(-r, r + 1): out.update(grid.get((gx + i, gy + j), ()))
    return out

stops = []
src = os.path.join(W, 'gtfs_stops.csv')
for r in csv.DictReader(open(src, encoding='utf-8-sig')):
    x, y = P(float(r['stop_lat']), float(r['stop_lon']))
    if not inside(x, y): continue
    best = None
    for ei in near_edges(x, y):
        a, b = gedges[ei]; d, t, side = proj(x, y, a, b)
        # מעדיפים קשת שהתחנה בצד ימין שלה (נסיעה בימין); קשת שהתחנה משמאלה — קנס
        score = d + (0 if side <= 0 else 25)
        if best is None or score < best[0]: best = (score, ei, t, d)
    if not best or best[3] > 35: continue
    stops.append({'id': r['stop_id'], 'code': r['stop_code'], 'name': r['stop_name'].replace("''", '"'),
                  'x': round(x, 1), 'y': round(y, 1), 'e': best[1], 't': round(best[2], 3)})
# ביקוש: שטח הבנייה (קומות × שטח) בטווח 350 מ'
for s in stops:
    s['w'] = sum(fa * max(0, 1 - math.hypot(cx - s['x'], cy - s['y']) / 350) for cx, cy, fa in bcent)
mx = max(s['w'] for s in stops) or 1
for s in stops: s['w'] = round(0.08 + 0.92 * s['w'] / mx, 3)
print('stops', len(stops))

out = {
    'meta': {'city': 'קריית מלאכי', 'origin': [LAT0, LON0], 'half': [HALF_X, HALF_Y], 'units': 'dm',
             'built': datetime.date.today().isoformat(), 'osm_timestamp': raw.get('osm3s', {}).get('timestamp_osm_base'),
             'attribution': '© OpenStreetMap contributors (ODbL); תחנות: GTFS משרד התחבורה'},
    'buildings': buildings, 'roads': roads, 'areas': areas,
    'graph': {'nodes': [v for x, y in gnodes for v in (dm(x), dm(y))], 'edges': [v for e in gedges for v in e]},
    'stops': stops,
}
p = os.path.join(W, 'city.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('buildings', len(buildings), 'roads', len(roads), 'areas', len(areas), '->', p, os.path.getsize(p))
