"""מצגת לשינוי בקו — האם קטע שבו השרטוט של המסלול השתנה הוא שינוי אמיתי בדרך, או רק שרטוט מחדש של אותו כביש.

לכל קטע שבו המסלול החדש רחוק מהישן (או הישן מהחדש) — כמו offRuns בדף: נקודות שרחוקות יותר מ-35 מ', קטע של 40 מ' לפחות —
בודקים לאורך הקטע, כל SAMPLE_M מטרים, על איזה כביש (שם מ-OSM) עובר כל אחד מהשרטוטים: הנקודה בקטע, והנקודה הקרובה אליה
בשרטוט השני. אותו כביש לכל האורך (מלבד קטעים קצרים מ-GAP_M, למשל מחבר או צומת) — 'same' (רעש של שרטוט). כבישים שונים
ברצף של GAP_M או יותר — 'diff' (הקו באמת נוסע בדרך אחרת). כשרוב הקטע לא ליד כביש מוכר (בלי שם ב-OSM) — אין סימון,
והדף מחליט לפי המרחק (NOISE_DEV / NOISE_LEN ב-deck.js).

הכבישים: roads.json מהענף osm-roads (fetch-osm-roads.yml): {'roads': [{'n': שם, 'g': [[lat, lon], ...]}, ...]} —
כבישים עם שם, וכבישים ממוספרים בלי שם ("כביש 4").
"""
import math
from collections import defaultdict

FAR_M = 35        # כמו offRuns בדף
RUN_MIN_M = 40
SAMPLE_M = 20     # מרווח הדגימה לאורך הקטע
NEAR_ROAD_M = 25  # נקודה רחוקה מכל כביש יותר מזה — לא ידוע על איזה כביש היא
GAP_M = 50        # קטע קצר מזה עם כביש אחר (מחבר, צומת) — לא נחשב
KNOWN_MIN = 0.5   # לפחות חצי מהקטע צריך להיות ליד כבישים מוכרים
CELL = 0.002      # רשת לחיפוש מהיר (כ-200 מ')


def _xy(p, lat0):
    return (p[1] * 111320.0 * math.cos(math.radians(lat0)), p[0] * 110540.0)


def _seg_dist(p, a, b, lat0):
    P, A, B = _xy(p, lat0), _xy(a, lat0), _xy(b, lat0)
    vx, vy = B[0] - A[0], B[1] - A[1]
    L2 = vx * vx + vy * vy
    t = 0.0 if not L2 else max(0.0, min(1.0, ((P[0] - A[0]) * vx + (P[1] - A[1]) * vy) / L2))
    qx, qy = A[0] + t * vx, A[1] + t * vy
    return math.hypot(P[0] - qx, P[1] - qy), t


def dist_m(a, b):
    lat0 = (a[0] + b[0]) / 2
    A, B = _xy(a, lat0), _xy(b, lat0)
    return math.hypot(A[0] - B[0], A[1] - B[1])


def dist_to_line(p, line):
    lat0 = p[0]
    return min(_seg_dist(p, line[i], line[i + 1], lat0)[0] for i in range(len(line) - 1)) if len(line) > 1 else float('inf')


def nearest_on_line(p, line):
    lat0, best, bd = p[0], line[0], float('inf')
    for i in range(len(line) - 1):
        d, t = _seg_dist(p, line[i], line[i + 1], lat0)
        if d < bd:
            a, b = line[i], line[i + 1]
            bd, best = d, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    return best


class Roads:
    """אינדקס מרחבי פשוט של קטעי כבישים עם שם"""

    def __init__(self, roads, bbox=None):
        self.grid = defaultdict(list)
        self.segs = []
        for r in roads:
            g, n = r['g'], r['n']
            if bbox and not any(bbox[0] <= p[0] <= bbox[2] and bbox[1] <= p[1] <= bbox[3] for p in g):
                continue
            for i in range(len(g) - 1):
                a, b = g[i], g[i + 1]
                si = len(self.segs)
                self.segs.append((a, b, n))
                for cx in range(int(min(a[1], b[1]) / CELL), int(max(a[1], b[1]) / CELL) + 1):
                    for cy in range(int(min(a[0], b[0]) / CELL), int(max(a[0], b[0]) / CELL) + 1):
                        self.grid[(cx, cy)].append(si)

    def name_at(self, p, maxd=NEAR_ROAD_M):
        best, bd = None, maxd
        cx, cy = int(p[1] / CELL), int(p[0] / CELL)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for si in self.grid.get((cx + dx, cy + dy), ()):
                    a, b, n = self.segs[si]
                    d = _seg_dist(p, a, b, p[0])[0]
                    if d < bd:
                        bd, best = d, n
        return best


def off_runs(a, b):
    """כמו offRuns ב-deck.js: קטעים ב-a שרחוקים מ-b יותר מ-FAR_M (עם הנקודה שלפני ואחרי), באורך RUN_MIN_M לפחות"""
    if len(a) < 2 or len(b) < 2:
        return [a] if len(a) > 1 and len(b) < 2 else []
    far = [dist_to_line(p, b) > FAR_M for p in a]
    runs, cur = [], None
    for i, p in enumerate(a):
        if far[i]:
            if cur is None:
                cur = [a[i - 1]] if i > 0 else []
            cur.append(p)
        elif cur is not None:
            cur.append(p)
            runs.append(cur)
            cur = None
    if cur:
        runs.append(cur)
    return [r for r in runs if sum(dist_m(r[i - 1], r[i]) for i in range(1, len(r))) >= RUN_MIN_M]


def _samples(run):
    out = [run[0]]
    for i in range(1, len(run)):
        a, b = run[i - 1], run[i]
        L = dist_m(a, b)
        n = max(1, int(L // SAMPLE_M))
        for k in range(1, n + 1):
            out.append([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])
    return out


def run_flag(run, other, roads):
    """'same' / 'diff' / '' (לא ידוע) לקטע run מול השרטוט השני"""
    pts = _samples(run)
    if len(pts) < 2:
        return ''
    step = [0.0] + [dist_m(pts[i - 1], pts[i]) for i in range(1, len(pts))]
    total = sum(step)
    known = diff_run = longest = 0.0
    for p, s in zip(pts, step):
        n1 = roads.name_at(p)
        n2 = roads.name_at(nearest_on_line(p, other)) if len(other) > 1 else None
        if n1 is None or n2 is None:
            continue   # לא ידוע — לא מאריך ולא שובר רצף
        known += s
        if n1 != n2:
            diff_run += s
            longest = max(longest, diff_run)
        else:
            diff_run = 0.0
    if total <= 0 or known < KNOWN_MIN * total:
        return ''
    return 'diff' if longest >= GAP_M else 'same'


def road_flags(old, new, roads):
    """[[lat, lon, 'same'|'diff'], ...] — נקודת אמצע של כל קטע שונה (בשני השרטוטים) והסימון שלו"""
    out = []
    for a, b in ((new, old), (old, new)):
        for r in off_runs(a, b):
            f = run_flag(r, b, roads)
            if f:
                m = r[len(r) // 2]
                out.append([round(m[0], 5), round(m[1], 5), f])
    return out


def decode_poly(s):
    """polyline מקודד (דיוק 1e-5) → [[lat, lon], ...] — הפורמט של shp ב-data/l"""
    pts, i, la, lo = [], 0, 0, 0
    if not s or not isinstance(s, str):
        return pts
    while i < len(s):
        for ref in (0, 1):
            sh = res = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                res |= (b & 0x1f) << sh
                sh += 5
                if b < 0x20 or i >= len(s):
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if ref == 0:
                la += d
            else:
                lo += d
        pts.append([la / 1e5, lo / 1e5])
    return pts
