"""בונה את world/city.json של משחק האוטובוס מנתוני OpenStreetMap ומתחנות ה-GTFS.

קלט:
  world/osm_raw.json.gz — פלט Overpass (ה-workflow ‏bus-game-osm מוריד אותו)
  world/gtfs_stops.csv  — התחנות הפעילות בתחום העיר, מתוך stops.txt בענף gtfs-data
הרצה:  python3 tools/build_city.py   (מתוך unreleased/bus-game; צריך shapely)

הפלט (מטרים, ראשית במרכז העיר, x מזרחה, y צפונה; ערכים שלמים בדצימטרים):
  buildings: [[h_dm, x0,y0,x1,y1,...], ...]           טבעת חיצונית, בלי חזרה על הנקודה הראשונה
  bstyle:    [code, ...]                               לכל בניין: גוון הקיר (code >> 4) והגג (code & 15) — ראו world.js
  bpop:      [h_dm, ...]                               הגובה "הישן" — רק למשקל האוכלוסייה בכיסוי (career.js), כדי שהמשחק לא ישתנה
  roads:     [[class, width_dm, x0,y0,...], ...]       רחובות (גם שבילים) — לציור. הרוחב כבר כולל הרחבה לאוטובוס
  rnames:    [שם רחוב, ...], rname: [אינדקס או -1 לכל רחוב];  bres: [1 מגורים / 2 לא ידוע / 0 אחר לכל בניין]
  rinfo:     [[kind, bus, width0_dm], ...]             לכל רחוב: סוג (מפתח ב-ROAD_KIND), 1 = אוטובוס נוסע בו דו-סטרי,
                                                       2 = חד-סטרי לאוטובוס, 0 = לא ברשת; הרוחב המקורי (לפני ההרחבה)
  patches:   [[x0,y0,...], ...]                        אספלט נוסף בפניות (המקום שהאוטובוס "חותך" בפנייה)
  areas:     [[kind, x0,y0,...], ...]                  פארקים/דשא/מגרשים/שימושי קרקע
  trees:     [x,y,s,k, ...]                            עצים: מיקום, גודל (באחוזים), סוג (0 רחוב, 1 פארק, 2 מטע)
  solar:     [x,y,h,r, ...]                            דודי שמש על הגגות (r = סיבוב במיליראדיאנים)
  graph:     {nodes:[x,y,...], edges:[a,b,a,b,...], lane:[dm,...]}
                                                       רשת נסיעה מכוונת לאוטובוס (חד-סטרי נשמר); lane — כמה ימינה ממרכז
                                                       הכביש נוסע האוטובוס בכל קשת (1.8 מ'; בחד-סטרי צר — פחות)
  stops:     [{id, code, name, x, y, e, t, w}]         e = קשת ברשת (אינדקס לזוג ב-edges), t = מיקום על הקשת 0..1,
                                                       w = משקל ביקוש (שטח הבנייה בסביבה, מנורמל)

כלל המקום לאוטובוס: כל רחוב דו-סטרי שהאוטובוס יכול לנסוע בו מצויר ברוחב 6.6 מ' לפחות (2 × (1.8 + 1.275) + 0.4),
ובחד-סטרי האוטובוס נוסע קרוב יותר למרכז, כך שהוא נשאר על האספלט. בפניות — אספלט נוסף בצורת המעטפת של האוטובוס.
בניינים שנוגעים באספלט הזה נחתכים, ועצים ודודי שמש לא מוצבים עליו. הבדיקה: tools/check_bus_room.mjs
"""
import gzip, json, math, os, csv, hashlib, sys, datetime
from collections import Counter
import shapely
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.ops import unary_union
from shapely.prepared import prep

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

# ---------- מידות האוטובוס (כמו ב-js/lines.js וב-js/actors.js)
LANE = 1.8                 # מרכז הנתיב הימני, ממרכז הכביש
BUS_HW = 1.275             # חצי רוחב האוטובוס (2.55)
BUS_L = 12.0
MIN_TWO_WAY = 6.6          # 2 × (1.8 + 1.275) + 0.4 = 6.55, מעוגל למעלה
FRONT_AXLE, REAR_AXLE, REAR_TO_CENTER = 1.8, 7.75, 2.6
TAPER = 8.0                # מעבר בין נתיב רגיל לנתיב בחד-סטרי צר (js/graph.js lanePath)

def lane_of(w, one):
    """כמה ימינה ממרכז הכביש נוסע האוטובוס: 1.8 מ', ובחד-סטרי צר — עד שיישאר 0.25 מ' עד שפת האספלט"""
    if not one: return LANE
    return round(max(0.0, min(LANE, w / 2 - BUS_HW - 0.25)), 1)

# ---------- בניינים (גובה כמו בתצוגה שאושרה: לפי תגית, ואם אין — לפי סוג ושטח)
blist = []; bgone = []
def old_height(eid, tags, b, a):
    """הגובה שהיה במשחק עד עכשיו — רק למשקל האוכלוסייה (bpop) ולביקוש בתחנות, כדי שהמשחק לא ישתנה"""
    h = hval(tags.get('height')); lv = hval(tags.get('building:levels'))
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
    return h

def new_height(eid, tags, b, a):
    h = hval(tags.get('height')); lv = hval(tags.get('building:levels'))
    if h is None and lv is not None: h = lv * 3.1 + 0.6
    if h is None:
        if b in ('school', 'synagogue', 'public', 'civic', 'commercial', 'retail', 'industrial', 'warehouse'): h = rnd(eid, 6, 10)
        elif b == 'apartments': h = rnd(eid, 12, 22)
        elif a > 900: h = rnd(eid, 7, 12)          # שטח גדול: אולמות, קניונים, תעשייה
        elif a > 330: h = rnd(eid, 10, 17)         # בנייני דירות (3–5 קומות)
        elif a > 120: h = rnd(eid, 5.5, 9)
        else: h = rnd(eid, 3, 6)
    return max(2.6, min(h, 80))

def add_building(eid, tags, ring, hid):
    if len(ring) < 3: return
    if ring[0] == ring[-1]: ring = ring[:-1]
    if len(ring) < 3: return
    b = tags.get('building', 'yes')
    cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
    if not inside(cx, cy): return
    a = area(ring)
    if a < 0: ring = ring[::-1]; a = -a
    if a < 8: return
    if b in ('destroyed', 'no', 'construction', 'ruins'):
        bgone.append((cx, cy, a * max(1, round(old_height(eid, tags, b, a) / 3)))); return    # לא מצויר, אבל נשאר בביקוש כמו קודם
    h = new_height(hid, tags, b, a)
    # מראה: גוון קיר (8), גג — אפור (0-4), רעפים אדומים (5-7) בבתים קטנים ונמוכים, פח בהיר (8) במבנים גדולים
    r1, r2 = rnd(f'{hid}w', 0, 1), rnd(f'{hid}r', 0, 1)
    small = a < 160 and h < 7.5
    if small and r2 < 0.45: roof = 5 + int(r2 * 6.6) % 3
    elif b == 'industrial' or a > 1500: roof = 8
    else: roof = int(r2 * 5)
    blist.append({'id': hid, 'ring': ring, 'h': h, 'hp': old_height(eid, tags, b, a), 'a': a, 't': b,
                  'style': int(r1 * 8) * 16 + roof, 'cx': cx, 'cy': cy})

# ---------- רחובות ורשת
DRIVE = {'motorway': 14, 'trunk': 13, 'primary': 12, 'secondary': 10.5, 'tertiary': 9, 'unclassified': 7,
         'residential': 7, 'living_street': 6, 'service': 4.5, 'motorway_link': 7, 'trunk_link': 7,
         'primary_link': 7, 'secondary_link': 7, 'tertiary_link': 6.5, 'road': 6, 'bus_guideway': 6, 'busway': 7}
FOOT = {'footway': 2.2, 'path': 1.8, 'pedestrian': 5, 'cycleway': 2, 'steps': 2, 'track': 3.2}
# סוג הרחוב לציור (גוון האספלט) — אותו סדר כמו ROAD_KIND ב-js/world.js
ROAD_KIND = {'motorway': 3, 'trunk': 3, 'primary': 3, 'secondary': 3, 'trunk_link': 3, 'primary_link': 3, 'secondary_link': 3,
             'motorway_link': 3, 'tertiary': 2, 'tertiary_link': 2, 'service': 0, 'track': 5}
rrec = []; areas = []; places_raw = []
nodes = {}; nid = []; einfo = {}
def node(osm_id, x, y):
    if osm_id not in nodes:
        nodes[osm_id] = len(nid); nid.append((x, y))
    return nodes[osm_id]

AREA_KIND = {('leisure', 'park'): 'park', ('leisure', 'garden'): 'park', ('landuse', 'grass'): 'grass',
             ('landuse', 'meadow'): 'meadow', ('leisure', 'pitch'): 'pitch', ('leisure', 'playground'): 'play',
             ('landuse', 'recreation_ground'): 'park', ('natural', 'wood'): 'wood', ('landuse', 'forest'): 'wood',
             ('landuse', 'orchard'): 'orchard', ('landuse', 'farmland'): 'farm', ('natural', 'scrub'): 'scrub',
             ('amenity', 'parking'): 'parking', ('landuse', 'cemetery'): 'cemetery', ('landuse', 'residential'): 'res',
             ('landuse', 'industrial'): 'ind', ('landuse', 'commercial'): 'com', ('landuse', 'retail'): 'com',
             ('landuse', 'construction'): 'constr', ('leisure', 'swimming_pool'): 'water', ('natural', 'water'): 'water',
             ('leisure', 'stadium'): 'pitch', ('leisure', 'sports_centre'): 'sport', ('amenity', 'school'): 'school',
             ('landuse', 'military'): 'farm', ('amenity', 'bus_station'): 'busst', ('natural', 'sand'): 'sand',
             ('landuse', 'village_green'): 'grass'}
def add_area(t, ring):
    for (k, v), kind in AREA_KIND.items():
        if t.get(k) == v:
            if len(ring) < 3 or not any(inside(x, y, 200) for x, y in ring): return
            flat = [kind]
            for x, y in ring: flat += [dm(x), dm(y)]
            areas.append(flat); return

for e in EL:
    t = e.get('tags', {})
    if e['type'] == 'way' and 'geometry' in e:
        g = [P(p['lat'], p['lon']) for p in e['geometry'] if p]
        # מרכזים מסחריים ואזורי תעשייה (לכתובות וליעדים של הנוסעים, ולמטיילים): קניון (shop=mall), מסחר (landuse=retail/commercial), תעשייה
        pk = 'mall' if t.get('shop') == 'mall' or t.get('landuse') in ('retail', 'commercial') else 'ind' if t.get('landuse') == 'industrial' else None
        if pk and len(g) >= 3 and t.get('power') != 'plant' and any(inside(x, y, 100) for x, y in g): places_raw.append((pk, (t.get('name') or '').strip(), g))
        if 'building' in t and t.get('building') != 'no':
            add_building(e['id'], t, g, e['id']); continue
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
            rec = {'cls': cls, 'w': w, 'w0': w, 'pts': g, 'kind': ROAD_KIND.get(hw, 4 if hw in FOOT else 1), 'pairs': [], 'one': False, 'name': (t.get('name') or '').strip()}
            rrec.append(rec)
            # רשת הנסיעה: בלי חניונים, דרכים פרטיות ו"שירות" צרות; האוטובוס לא נוסע בשבילים
            if hw in DRIVE and t.get('access') not in ('private', 'no') and t.get('service') not in ('parking_aisle', 'driveway', 'drive-through'):
                ow = t.get('oneway', 'no'); rev = ow == '-1'
                one = ow in ('yes', '1', 'true', '-1') or t.get('junction') == 'roundabout' or hw in ('motorway', 'motorway_link')
                if t.get('oneway:bus') == 'no' or t.get('busway') == 'opposite_lane': one = False
                rec['one'] = one
                ids = e['nodes']
                for i in range(len(ids) - 1):
                    a = node(ids[i], *g[i]); b = node(ids[i + 1], *g[i + 1])
                    if a == b: continue
                    rec['pairs'].append((a, b))
                    for k in ([(a, b)] if not one or not rev else []) + ([(b, a)] if not one or rev else []):
                        einfo.setdefault(k, []).append(rec)
            continue
        if len(g) >= 4 and g[0] == g[-1]: add_area(t, g[:-1])
    elif e['type'] == 'relation':
        for m in e.get('members', []):
            if m.get('role') != 'outer' or not m.get('geometry'): continue
            ring = [P(p['lat'], p['lon']) for p in m['geometry'] if p]
            if 'building' in t: add_building(f"{e['id']}_{m.get('ref')}", t, ring, e['id'])
            elif len(ring) >= 4 and ring[0] == ring[-1]: add_area(t, ring[:-1])

# ---------- דחיסת הרשת: רק הרכיב הקשיר החזק הגדול (שהאוטובוס לא ייתקע ברחוב ללא מוצא חד-סטרי)
edges = set(einfo)
N = len(nid)
adj = [[] for _ in range(N)]; radj = [[] for _ in range(N)]
for a, b in edges: adj[a].append(b); radj[b].append(a)
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
big = Counter(comp).most_common(1)[0][0]
keep = [i for i in range(N) if comp[i] == big]
remap = {o: n for n, o in enumerate(keep)}
gnodes = [nid[i] for i in keep]
gedges = sorted((remap[a], remap[b]) for a, b in edges if a in remap and b in remap)
print('graph nodes', len(gnodes), 'of', N, 'edges', len(gedges), 'of', len(edges))

# ---------- המקום לאוטובוס: רחוב שהאוטובוס נוסע בו — דו-סטרי לפחות 6.6 מ'; בחד-סטרי — נתיב קרוב יותר למרכז
inv = {n: o for o, n in remap.items()}
gset = set(gedges)
widened = Counter(); seg_widened = 0
for r in rrec:
    used = [p for p in r['pairs'] if (remap.get(p[0]), remap.get(p[1])) in gset or (remap.get(p[1]), remap.get(p[0])) in gset]
    r['bus'] = 0 if not used else (2 if r['one'] else 1)
    if r['bus'] == 1 and r['w'] < MIN_TWO_WAY:
        widened[r['w']] += 1; seg_widened += len(used); r['w'] = MIN_TWO_WAY
lane = []
for a, b in gedges:
    recs = einfo[(inv[a], inv[b])]
    lane.append(min(lane_of(r['w'], r['one']) for r in recs))
print('widened ways', sum(widened.values()), dict(widened), 'segments', seg_widened,
      '| one-way edges with a smaller lane offset', sum(1 for v in lane if v < LANE), Counter(v for v in lane if v < LANE))

# ---------- האספלט כפי שהוא מצויר (js/world.js ribbon): רצועה עם חיבורים משופעים + מצולע של 10 צלעות בקצוות ובפינות
def miter_normals(pts):
    """נורמל לכל נקודה, בחיבור משופע (miter) בין הקטעים — כך אין "שקעים" בפינות קטנות. כמו miterNormals ב-js/world.js"""
    n = len(pts); out = []
    for i in range(n):
        a = pts[max(0, i - 1)]; p = pts[i]; b = pts[min(n - 1, i + 1)]
        d1x, d1y, d2x, d2y = p[0] - a[0], p[1] - a[1], b[0] - p[0], b[1] - p[1]
        l1 = math.hypot(d1x, d1y); l2 = math.hypot(d2x, d2y)
        if l1 < 1e-6: d1x, d1y, l1 = d2x, d2y, l2
        if l2 < 1e-6: d2x, d2y, l2 = d1x, d1y, l1
        l1 = l1 or 1; l2 = l2 or 1
        d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2
        nx, ny = -(d1y + d2y), d1x + d2x; nl = math.hypot(nx, ny)
        if nl < 1e-3: out.append((-d1y, d1x)); continue
        nx /= nl; ny /= nl
        k = min(2.0, 1 / max(0.5, nx * -d1y + ny * d1x))
        out.append((nx * k, ny * k))
    return out

def ribbon_polys(pts, w):
    hw = w / 2; out = []; N = miter_normals(pts)
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        if math.hypot(x1 - x0, y1 - y0) < 0.01: continue
        (ax_, ay_), (bx_, by_) = N[i], N[i + 1]
        for tri in (((x0 + ax_ * hw, y0 + ay_ * hw), (x0 - ax_ * hw, y0 - ay_ * hw), (x1 - bx_ * hw, y1 - by_ * hw)),
                    ((x0 + ax_ * hw, y0 + ay_ * hw), (x1 - bx_ * hw, y1 - by_ * hw), (x1 + bx_ * hw, y1 + by_ * hw))):
            t = Polygon(tri)
            if t.area > 1e-6: out.append(t)
    for i in range(len(pts)):
        need = i == 0 or i == len(pts) - 1
        if not need:
            (xa, ya), (xb, yb), (xc, yc) = pts[i - 1], pts[i], pts[i + 1]
            a1, a2 = math.atan2(yb - ya, xb - xa), math.atan2(yc - yb, xc - xb)
            da = abs(a2 - a1)
            if da > math.pi: da = 2 * math.pi - da
            need = da > 0.12
        if need:
            x, y = pts[i]
            out.append(Polygon([(x + math.cos(k / 10 * 2 * math.pi) * hw, y + math.sin(k / 10 * 2 * math.pi) * hw) for k in range(10)]))
    return out

# הגאומטריה נבדקת בקואורדינטות מעוגלות לדצימטר — בדיוק מה שהמשחק מקבל ב-city.json
R1 = lambda pts: [(round(x, 1), round(y, 1)) for x, y in pts]
for r in rrec: r['rp'] = R1(r['pts'])
gnr = R1(gnodes)
drive_parts = []; bus_parts = []
for r in rrec:
    if r['cls'] == 'f': continue
    ps = ribbon_polys(r['rp'], r['w'])
    drive_parts += ps
    if r['bus']: bus_parts += ps
asphalt = unary_union(drive_parts)
asphalt_p = prep(asphalt)

# ---------- מעטפת האוטובוס בפניות (אותו חישוב כמו js/graph.js: lanePath + offsetRight, ו-busPose ב-js/actors.js)
def lane_path(cpts, dseg):
    n = len(cpts)
    dv = [dseg[0] if i == 0 else dseg[-1] if i == n - 1 else min(dseg[i - 1], dseg[i]) for i in range(n)]
    out, offs, idx = [], [], []
    for i in range(n - 1):
        idx.append(len(out)); out.append(cpts[i]); offs.append(dv[i])
        (ax, ay), (bx, by) = cpts[i], cpts[i + 1]; L = math.hypot(bx - ax, by - ay); d = dseg[i]
        if L < 1: continue
        ts = []
        if dv[i] < d - 1e-6: ts.append(min(TAPER, L / 2))
        if dv[i + 1] < d - 1e-6: ts.append(max(L - TAPER, L / 2))
        last = -1
        for tt in sorted(ts):
            if tt - last < 0.5 or tt < 0.5 or tt > L - 0.5: continue
            out.append((ax + (bx - ax) * tt / L, ay + (by - ay) * tt / L)); offs.append(d); last = tt
    idx.append(len(out)); out.append(cpts[-1]); offs.append(dv[-1])
    return out, offs, idx

def offset_right(pts, ds):
    n = len(pts); out = []
    for i in range(n):
        p = pts[i]; a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]; d = ds[i]
        d1x, d1y, d2x, d2y = p[0] - a[0], p[1] - a[1], b[0] - p[0], b[1] - p[1]
        l1 = math.hypot(d1x, d1y) or 1; l2 = math.hypot(d2x, d2y) or 1
        d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2
        if i == 0: d1x, d1y = d2x, d2y
        if i == n - 1: d2x, d2y = d1x, d1y
        nx, ny = d1y + d2y, -(d1x + d2x); nl = math.hypot(nx, ny)
        if nl < 0.2: out.append((p[0] + d1y * d, p[1] - d1x * d)); continue
        nx /= nl; ny /= nl
        cos = nx * d1y + ny * -d1x
        k = min(2.2, 1 / max(0.3, cos))
        out.append((p[0] + nx * d * k, p[1] + ny * d * k))
    return out

class Poly:
    def __init__(s, pts):
        s.pts = pts; s.cum = [0.0]
        for i in range(1, len(pts)): s.cum.append(s.cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
        s.length = s.cum[-1]
    def at(s, x):
        P_, c = s.pts, s.cum
        if x < 0 or x > s.length:
            n = len(P_); a, b = (P_[0], P_[1]) if x < 0 else (P_[n - 2], P_[n - 1])
            dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
            base, d = (P_[0], x) if x < 0 else (P_[n - 1], x - s.length)
            return (base[0] + dx / L * d, base[1] + dy / L * d)
        lo, hi = 0, len(c) - 1
        while hi - lo > 1:
            m = (lo + hi) >> 1
            if c[m] <= x: lo = m
            else: hi = m
        L = c[hi] - c[lo] or 1; t = (x - c[lo]) / L; a, b = P_[lo], P_[hi]
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def bus_rect(poly, s, grow=0.0):
    f = poly.at(s - FRONT_AXLE); r = poly.at(s - REAR_AXLE)
    dx, dy = f[0] - r[0], f[1] - r[1]; L = math.hypot(dx, dy) or 1; dx /= L; dy /= L
    cx, cy = r[0] + dx * REAR_TO_CENTER, r[1] + dy * REAR_TO_CENTER
    hl, hw = BUS_L / 2 + grow, BUS_HW + grow; nx, ny = -dy, dx
    return [(cx + dx * hl + nx * hw, cy + dy * hl + ny * hw), (cx - dx * hl + nx * hw, cy - dy * hl + ny * hw),
            (cx - dx * hl - nx * hw, cy - dy * hl - ny * hw), (cx + dx * hl - nx * hw, cy + dy * hl - ny * hw)]

GN = len(gnodes)
eidx = {e: i for i, e in enumerate(gedges)}
gout = [[] for _ in range(GN)]; gin = [[] for _ in range(GN)]
for a, b in gedges: gout[a].append(b); gin[b].append(a)
def unit(a, b):
    (ax, ay), (bx, by) = gnr[a], gnr[b]; L = math.hypot(bx - ax, by - ay) or 1
    return ((bx - ax) / L, (by - ay) / L), L
def chain_back(u, v, need):
    path = [u]; cur, nxt, acc = u, v, 0.0
    while acc < need:
        dirn, _ = unit(cur, nxt); best = None
        for p in gin[cur]:
            if p == nxt or p in path: continue
            dp, L = unit(p, cur); sc = dp[0] * dirn[0] + dp[1] * dirn[1]
            if best is None or sc > best[0]: best = (sc, p, L)
        if not best: break
        path.append(best[1]); acc += best[2]; nxt, cur = cur, best[1]
    return path[::-1]
def chain_fwd(v, w, need):
    path = [w]; prev, cur, acc = v, w, 0.0
    while acc < need:
        dirn, _ = unit(prev, cur); best = None
        for q in gout[cur]:
            if q == prev or q in path: continue
            dq, L = unit(cur, q); sc = dq[0] * dirn[0] + dq[1] * dirn[1]
            if best is None or sc > best[0]: best = (sc, q, L)
        if not best: break
        path.append(best[1]); acc += best[2]; prev, cur = cur, best[1]
    return path

# איפה מותרת פרסה (כמו findTurnarounds ב-js/graph.js): צומת של 3 רחובות ומעלה שאחד מהם ראשי או רחב (9 מ'+),
# או קצה של זנב קצר (פחות מ-20 מ')
nb = [set() for _ in range(GN)]
for a, b in gedges: nb[a].add(b); nb[b].add(a)
wide_at = set()
for r in rrec:
    if r['cls'] == 'f' or not (r['cls'] == 'm' or r['w'] >= 9): continue
    for x, y in r['pts']: wide_at.add((round(x * 10), round(y * 10)))
def uturn_ok(v):
    if len(nb[v]) >= 3 and (round(gnodes[v][0] * 10), round(gnodes[v][1] * 10)) in wide_at: return True
    return len(nb[v]) == 1 and unit(v, next(iter(nb[v])))[1] < 20

def paths_back(u, v, need, cap=8):
    """כל הדרכים אחורה מ-u (לא דרך v) עד need מטרים: רשימות צמתים שנגמרות ב-u"""
    out = []
    def go(path, acc):
        if len(out) >= cap: return
        cur = path[0]; nxt = path[1] if len(path) > 1 else v
        # גם פרסה באמצע (בצומת שמותר בה), כמו שהמסלול במשחק עושה
        prev = [p for p in gin[cur] if (p != nxt or uturn_ok(cur)) and p not in path[1:]]
        if acc >= need or not prev: out.append(path); return
        for p in prev: go([p] + path, acc + unit(p, cur)[1])
    go([u], 0.0); return out
def paths_fwd(v, w, need, cap=8):
    out = []
    def go(path, acc):
        if len(out) >= cap: return
        cur = path[-1]; prev = path[-2] if len(path) > 1 else v
        nx = [q for q in gout[cur] if (q != prev or uturn_ok(cur)) and q not in path[:-1]]
        if acc >= need or not nx: out.append(path); return
        for q in nx: go(path + [q], acc + unit(cur, q)[1])
    go([w], 0.0); return out

def sweep(nodes_path, vi0, cpts=None, dseg=None, s0=-2, s1=13):
    if cpts is None:
        cpts = [gnr[i] for i in nodes_path]
        dseg = [lane[eidx[(nodes_path[i], nodes_path[i + 1])]] for i in range(len(nodes_path) - 1)]
    lp, offs, idx = lane_path(cpts, dseg)
    poly = Poly(offset_right(lp, offs))
    sv = poly.cum[idx[vi0]]
    # רק מקומות שבהם כל האוטובוס על המסלול המחושב (בלי להמשיך קו ישר מעבר לקצה). כל 0.5 מ', וכשהאוטובוס
    # מסתובב מהר (פרסה, פנייה חדה) — כל 5 ס"מ
    ss = [s for s in [sv + s0 + 0.5 * k for k in range(int((s1 - s0) * 2) + 1)] if 11.2 <= s <= poly.length - 0.9]
    out = []
    for i, s in enumerate(ss):
        r = bus_rect(poly, s); out.append(r)
        if i + 1 < len(ss):
            r2 = bus_rect(poly, ss[i + 1])
            a1 = math.atan2(r[0][1] - r[1][1], r[0][0] - r[1][0]); a2 = math.atan2(r2[0][1] - r2[1][1], r2[0][0] - r2[1][0])
            da = abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi)
            if da > 0.08: out += [bus_rect(poly, s + 0.05 * k) for k in range(1, 10)]
    return out

def add_patch(rects):
    if not rects: return False
    arr = shapely.polygons(rects)
    bad = arr[~shapely.contains(asphalt, arr)]
    if not len(bad): return False
    # רק החלק של האוטובוס שמחוץ לאספלט (ועוד 0.25 מ'), וכל חלק — במעטפת קמורה
    rest = unary_union(shapely.buffer(bad, 0.25, join_style='mitre')).difference(asphalt)
    for piece in getattr(rest, 'geoms', [rest]):
        if piece.area > 0.02: patch_polys.append(piece.convex_hull)
    return True

patch_polys = []; turns = 0; bad_turns = 0
for v in range(GN):
    for u in gin[v]:
        for w in gout[v]:
            if w == u and not uturn_ok(v): continue
            turns += 1
            backs, fwds = paths_back(u, v, 14), paths_fwd(v, w, 16)
            sb, sf = chain_back(u, v, 14), chain_fwd(v, w, 16)
            combos = {(tuple(sb + [v] + f), len(sb)) for f in fwds} | {(tuple(bk + [v] + sf), len(bk)) for bk in backs}
            bad_turns += add_patch([r for c, k in combos for r in sweep(list(c), k)])
# גם סביב כל תחנה: במשחק נקודת התחנה היא נקודה במסלול (וקו שמתחיל או מסתיים בה), וזה משנה מעט את הנתיב
# אחרי פרסה סמוכה. האוטובוס מגיע אליה מכל הדרכים האפשריות (גם בפרסה) וממשיך ממנה לכל כיוון
def stop_xy(st):
    a, b = gedges[st['e']]; (ax, ay), (bx, by) = gnr[a], gnr[b]
    return (ax + (bx - ax) * st['t'], ay + (by - ay) * st['t'])

print('turns', turns, 'needing extra asphalt', bad_turns)
# ---------- תחנות: GTFS (פעילות), מוצמדות לקשת הקרובה בצד ימין של כיוון הנסיעה
def proj(px, py, a, b):
    ax, ay = gnodes[a]; bx, by = gnodes[b]
    dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1e-9
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
    qx, qy = ax + t * dx, ay + t * dy
    side = dx * (py - ay) - dy * (px - ax)     # >0: הנקודה משמאל לכיוון הנסיעה
    return math.hypot(px - qx, py - qy), t, side
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
        score = d + (0 if side <= 0 else 25)
        if best is None or score < best[0]: best = (score, ei, t, d)
    if not best or best[3] > 35: continue
    stops.append({'id': r['stop_id'], 'code': r['stop_code'], 'name': r['stop_name'].replace("''", '"'),
                  'x': round(x, 1), 'y': round(y, 1), 'e': best[1], 't': round(best[2], 3)})
# ביקוש: שטח הבנייה (קומות × שטח) בטווח 350 מ' — לפי הגובה "הישן", כמו קודם
bcent = [(b['cx'], b['cy'], b['a'] * max(1, round(b['hp'] / 3))) for b in blist] + bgone
for s in stops:
    s['w'] = sum(fa * max(0, 1 - math.hypot(cx - s['x'], cy - s['y']) / 350) for cx, cy, fa in bcent)
mx = max(s['w'] for s in stops) or 1
for s in stops: s['w'] = round(0.08 + 0.92 * s['w'] / mx, 3)
print('stops', len(stops))

stop_sweeps = 0
for st in stops:
    a, b = gedges[st['e']]; p = stop_xy(st); le = lane[st['e']]
    for bk in paths_back(a, b, 26, cap=40):
        for fw in paths_fwd(a, b, 16, cap=12):
            # fw starts at b (the edge's end); before it the stop point, before that the back path ending at a
            cpts = [gnr[i] for i in bk] + [p] + [gnr[i] for i in fw]
            dseg = [lane[eidx[(bk[i], bk[i + 1])]] for i in range(len(bk) - 1)] + [le, le] + [lane[eidx[(fw[i], fw[i + 1])]] for i in range(len(fw) - 1)]
            stop_sweeps += add_patch(sweep(None, len(bk), cpts, dseg, -26, 13))
print('stop sweeps needing extra asphalt', stop_sweeps)
patches = unary_union(patch_polys) if patch_polys else Polygon()
# מעגלים לדצימטר (כמו בפלט) אחרי הרחבה קטנה, כדי שהעיגול לא יקטין את האספלט; ומוודאים שהמצולע תקין אחרי העיגול
patch_list = []
for p in (patches.geoms if hasattr(patches, 'geoms') else [patches]):
    if p.is_empty: continue
    q = shapely.set_precision(p.buffer(0.1, join_style='mitre').simplify(0.05), 0.1)
    for g in getattr(q, 'geoms', [q]):
        if isinstance(g, Polygon) and g.area > 0.05: patch_list.append(Polygon(g.exterior))
patches = unary_union(patch_list)
bus_asph = unary_union(bus_parts + patch_list)

# ---------- בניינים שנוגעים באספלט של האוטובוס — נחתכים (0.3 מ' מהשפה)
cut = prep(bus_asph.buffer(0.3))
cutg = bus_asph.buffer(0.3)
buildings = []; bstyle = []; bpop = []; cut_n = 0; dropped = 0
for b in blist:
    poly = Polygon(b['ring'])
    if not poly.is_valid: poly = poly.buffer(0)
    pieces = [poly]
    if cut.intersects(poly):
        cut_n += 1
        rest = poly.difference(cutg)
        pieces = [g for g in (rest.geoms if hasattr(rest, 'geoms') else [rest]) if isinstance(g, Polygon) and not g.is_empty]
        pieces = [g.simplify(0.05) for g in pieces if g.area >= 6]
        if any(len(g.interiors) for g in pieces): pieces = [g for g in pieces if not g.interiors]
        if not pieces: dropped += 1
    for g in pieces:
        ring = list(g.exterior.coords)[:-1]
        if area(ring) < 0: ring = ring[::-1]
        b2 = dict(b); b2['ring'] = ring; b2['poly'] = g
        buildings.append(b2)
print('buildings', len(buildings), 'cut by bus asphalt', cut_n, 'dropped', dropped)

# אזור התחנה (המרצפות, הסככה והממתינים) — בלי עצים. כמו stopFrame ב-js/stops.js
stop_zones = []
for s in stops:
    a, b = gedges[s['e']]; (ax, ay), (bx, by) = gnodes[a], gnodes[b]
    tl = math.hypot(bx - ax, by - ay) or 1; tx, ty = (bx - ax) / tl, (by - ay) / tl; ux, uy = ty, -tx
    rx, ry = ax + (bx - ax) * s['t'], ay + (by - ay) * s['t']
    kerb = lane[s['e']] + 1.55
    q = lambda A, D: (rx + ux * (kerb + D) + tx * A, ry + uy * (kerb + D) + ty * A)
    stop_zones.append(Polygon([q(-15, -kerb), q(5.5, -kerb), q(5.5, 6), q(-15, 6)]))

# ---------- עצים (כמו בתצוגה שאושרה): בפארקים, בחורשות ולאורך רחובות — לא על כביש, שביל, בניין או תחנה,
# והנוף של עץ לא נכנס לאספלט שהאוטובוס נוסע בו
seed = [12345]
def rand():
    seed[0] = (seed[0] * 16807) % 2147483647; return seed[0] / 2147483647
foot_parts = []
for r in rrec:
    if r['cls'] == 'f': foot_parts += ribbon_polys(r['rp'], r['w'])
def area_poly(ar):
    g = Polygon([(ar[i] / 10, ar[i + 1] / 10) for i in range(1, len(ar), 2)])
    return g if g.is_valid else g.buffer(0)
no_trunk = unary_union([asphalt.buffer(1.0)] + foot_parts + stop_zones +
                       [area_poly(ar) for ar in areas if ar[0] in ('pitch', 'water', 'parking', 'busst')])
no_trunk_p = prep(no_trunk)
btree = shapely.STRtree([b['poly'] for b in buildings])
crown_tree = shapely.STRtree(list(getattr(bus_asph, 'geoms', [bus_asph])) + stop_zones)
CROWN = 3.2
def tree_ok(x, y, s, pad):
    p = Point(x, y)
    if no_trunk_p.contains(p): return False
    # הנוף לא נכנס לקיר: לפחות רדיוס הנוף (ועוד 0.2 מ') מכל בניין
    if len(btree.query(p, predicate='dwithin', distance=max(pad, CROWN * s + 0.2))): return False
    if len(crown_tree.query(p, predicate='dwithin', distance=CROWN * s + 0.1)): return False
    return True
DENS = {'park': 1 / 140, 'wood': 1 / 45, 'orchard': 1 / 60, 'grass': 1 / 400, 'play': 1 / 250, 'school': 1 / 500,
        'cemetery': 1 / 300, 'meadow': 1 / 2500, 'res': 1 / 1800}
trees = []
for ar in areas:
    d = DENS.get(ar[0])
    if not d: continue
    pg = area_poly(ar)
    pgp = prep(pg)
    x0, y0, x1, y1 = pg.bounds
    n = min(3000, round(pg.area * d)); t = 0
    while t < n * 4 and n > 0:
        t += 1
        x, y = x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)
        s = 0.65 if ar[0] == 'orchard' else 0.8 + rand() * 0.6
        if not inside(x, y, 100) or not pgp.contains(Point(x, y)) or not tree_ok(x, y, s, 2.5): continue
        trees.append((x, y, s, 2 if ar[0] == 'orchard' else 1)); n -= 1
for r in rrec:
    if r['cls'] == 'f' or r['kind'] not in (1, 2, 3) or r['w0'] < 6 or r['w0'] > 11: continue
    g = r['pts']
    for i in range(len(g) - 1):
        (ax, ay), (bx, by) = g[i], g[i + 1]; Ls = math.hypot(bx - ax, by - ay)
        if Ls < 6: continue
        nx, ny = -(by - ay) / Ls, (bx - ax) / Ls
        s = 6.0
        while s < Ls - 4:
            for side in (-1, 1):
                if rand() < 0.45: continue
                sc = 0.6 + rand() * 0.35
                off = r['w'] / 2 + max(2.6, (CROWN * sc + 0.15) if r['bus'] else 2.6)
                x, y = ax + (bx - ax) * s / Ls + nx * off * side, ay + (by - ay) * s / Ls + ny * off * side
                if not inside(x, y, 100) or not tree_ok(x, y, sc, 1.6): continue
                trees.append((x, y, sc, 0))
            s += 11 + rand() * 6
print('trees', len(trees), Counter(t[3] for t in trees))

# ---------- דודי שמש על גגות בגודל של בית/בניין מגורים (כמו בתצוגה שאושרה)
solar = []
for b in buildings:
    a = b['a']
    if a < 70 or a > 1600 or b['t'] == 'industrial': continue
    g = b['poly']; gp = prep(g); x0, y0, x1, y1 = g.bounds
    n = 3 if a > 500 else 2 if a > 220 else 1; got = 0
    for k in range(n * 3):
        if got >= n: break
        x = x0 + rnd(f"{b['id']}s{k}x", 0, 1) * (x1 - x0); y = y0 + rnd(f"{b['id']}s{k}y", 0, 1) * (y1 - y0)
        if all(gp.contains(Point(x + dx, y + dy)) for dx, dy in ((0, 0), (2, 2), (-2, -2), (2, -2), (-2, 2))):
            # לא צמוד לדוד אחר על אותו גג
            if any(abs(x - sx) < 2.6 and abs(y - sy) < 2.6 for sx, sy, _, _ in solar[-3:]): continue
            solar.append((x, y, b['h'], (rnd(f"{b['id']}o", 0, 1) - 0.5) * 0.3)); got += 1
print('solar', len(solar))

RNAMES = sorted({r['name'] for r in rrec if r.get('name')})
# מקומות: מאחדים חלקים באותו שם (קניון שממופה בכמה מבנים); המרכז — מרכז הכובד; r — רדיוס שמכסה את המקום
def _places():
    grp = {}
    for i, (k, nm, g) in enumerate(places_raw): grp.setdefault((k, nm) if nm else (k, i), []).append(g)
    res = []
    for (k, nm), gs in grp.items():
        polys = [Polygon(g).buffer(0) for g in gs if len(g) >= 3]; u = unary_union(polys)
        if u.is_empty or u.area < 400: continue
        c = u.centroid; r = max(math.hypot(x - c.x, y - c.y) for g in gs for x, y in g)
        res.append({'kind': k, 'name': nm if isinstance(nm, str) else '', 'x': round(c.x, 1), 'y': round(c.y, 1), 'r': round(r, 1), 'geom': u})
    return res
PLACES = _places()
_nonres = [prep(p['geom'].buffer(3)) for p in PLACES]
def _bres(b):
    if b['t'] in RES_TAGS: return 1
    if b['t'] != 'yes' or b['a'] > 1500 or any(g.contains(Point(b['cx'], b['cy'])) for g in _nonres): return 0
    return 2
RES_TAGS = ('apartments', 'residential', 'house', 'detached', 'semidetached_house', 'terrace', 'dormitory', 'bungalow')
out = {
    'meta': {'city': 'קריית מלאכי', 'origin': [LAT0, LON0], 'half': [HALF_X, HALF_Y], 'units': 'dm',
             'built': datetime.date.today().isoformat(), 'osm_timestamp': raw.get('osm3s', {}).get('timestamp_osm_base'),
             'attribution': '© OpenStreetMap contributors (ODbL); תחנות: GTFS משרד התחבורה'},
    'buildings': [[dm(b['h'])] + [dm(v) for p in b['ring'] for v in p] for b in buildings],
    'bstyle': [b['style'] for b in buildings],
    'bpop': [dm(b['hp']) for b in buildings],
    'roads': [[r['cls'], dm(r['w'])] + [dm(v) for p in r['pts'] for v in p] for r in rrec],
    'rinfo': [[r['kind'], r['bus'], dm(r['w0'])] for r in rrec],
    # שמות הרחובות (תג name ב-OSM): rnames — הרשימה, rname — לכל רחוב אינדקס ברשימה (או -1). לכתובת של הנוסעים במשחק
    'rnames': RNAMES, 'rname': [RNAMES.index(r['name']) if r.get('name') else -1 for r in rrec],
    # לכל בניין: 1 = מגורים (apartments / residential / house...), 2 = לא ידוע (building=yes), 0 = לא מגורים (תג אחר, מבנה גדול, או בתוך מרכז מסחרי / אזור תעשייה)
    'bres': [_bres(b) for b in buildings],
    # מרכזים מסחריים (mall) ואזורי תעשייה (ind): שם (אם יש ב-OSM), מרכז ורדיוס במטרים
    'places': [{k: p[k] for k in ('kind', 'name', 'x', 'y', 'r')} for p in PLACES],
    'patches': [[dm(v) for p in list(g.exterior.coords)[:-1] for v in p] for g in patch_list],
    'areas': areas,
    'trees': [v for x, y, s, k in trees for v in (dm(x), dm(y), int(round(s * 100)), k)],
    'solar': [v for x, y, h, r in solar for v in (dm(x), dm(y), dm(h), int(round(r * 1000)))],
    'graph': {'nodes': [v for x, y in gnodes for v in (dm(x), dm(y))], 'edges': [v for e in gedges for v in e],
              'lane': [dm(v) for v in lane]},
    'stops': stops,
}
p = os.path.join(W, 'city.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('buildings', len(buildings), 'roads', len(rrec), 'areas', len(areas), 'patches', len(patch_list), '->', p, os.path.getsize(p))
