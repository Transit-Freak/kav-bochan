# -*- coding: utf-8 -*-
"""מצגת לשינוי בקו — הנתונים: שינויי מסלול ותחנות שעומדים להיכנס לתוקף, לכל קו "לפני ← אחרי".
הדף (unreleased/line-changes/) בונה מהם מצגת PDF.

העיקרון: משווים בין מה שהקו עשה בשבוע האחרון (ה-GTFS מלפני REF_DAYS ימים, בתאריכים
שכבר עברו) לבין מה שה-GTFS של היום כבר מכיל לימים הקרובים (HORIZON ימים).
לכל וריאנט קו (route_desc = מק"ט-כיוון-חלופה) נבחר "הדפוס הראשי" — רצף התחנות והשרטוט
שהיו ברוב הנסיעות. כשבימים הקרובים מופיע דפוס חדש שלא היה בשבוע שעבר, משווים את
הדפוס הראשי של השבוע שעבר לדפוס הראשי של השבוע שמתחיל בתאריך השינוי.

נספר כשינוי: תחנות שנוספו או ירדו, תחנה שזזה, או מסלול שסוטה מהקודם לאורך
GEO_LEN מ' לפחות (במרחק של יותר מ-GEO_DEV מ'). לא נספר (ומדווח בנפרד כ"מסונן"):
שינוי בלוח הזמנים בלבד, שרטוט מחדש של כמה מטרים, שינוי שם של תחנה, החלפת מק"ט של
תחנה באותו מקום ובאותו שם, הזזה קטנה של תחנה.

שינוי שכבר נכנס לתוקף נשאר ברשימה KEEP_DAYS ימים (מהריצות הקודמות). שינוי עתידי
שלא נמצא שוב בריצה של היום (המשרד ביטל אותו) — יורד.

הקלט — ישר מהארכיון היומי של דאטאבוס ב-S3 (tools/gtfs_zip.py, קריאה בטווחים בלי להוריד
את כל ה-zip ובלי לכתוב לדיסק). הפלט תחת OUTDIR (ברירת מחדל unreleased/line-changes):
  data/index.json        רשימת השינויים (לדף הראשי)
  data/l/<id>.json       דף לכל קו: מפה וגם רשימות לכל כיוון
  data/lines.json        כל הקווים שפועלים עכשיו, לחיפוש (ועם LH_CHANGES — השינויים מהשנה האחרונה)
  l/<id>.html            דף קטן לכל שינוי (לתצוגה המקדימה בווטסאפ) שמעביר למצגת שלו, מהתבנית line-template.html

רץ כל לילה (.github/workflows/line-changes.yml) על כל הארץ, כדקה וחצי. ב-16.11.2026: 2,849 קווים באינדקס,
235 כיוונים משתנים ב-184 קווים, 27 שינויים קטנים סוננו. עם LH_CHANGES (line-history/data/changes) נוספים
לאינדקס השינויים מהשנה האחרונה של כל קו (python3 tools/line_changes.py past — רק השלב הזה).
פלט נוסף: data/lines.json — כל הקווים (לחיפוש בדף).

משתנים: TODAY (YYYY-MM-DD, ברירת מחדל היום בשעון ישראל), REF_DAYS (7), HORIZON (14),
CITIES (רשימת ערים מופרדת בפסיקים לבדיקה מקומית; ריק = כל הארץ, ברירת המחדל), KEEP_DAYS (14), OUTDIR.
"""
import datetime
import json
import math
import os
import re
import shutil
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gtfs_zip  # noqa: E402

def _today():
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo('Asia/Jerusalem')).date()
    except Exception:  # noqa: BLE001
        return datetime.date.today()

TODAY = datetime.date.fromisoformat(os.environ['TODAY']) if os.environ.get('TODAY') else _today()
REF_DAYS = int(os.environ.get('REF_DAYS', '7'))
HORIZON = int(os.environ.get('HORIZON', '14'))
KEEP_DAYS = int(os.environ.get('KEEP_DAYS', '14'))
CITIES_RAW = os.environ.get('CITIES', '')
OUTDIR = os.environ.get('OUTDIR', 'unreleased/line-changes')
SITE = 'https://kavbochan.app/unreleased/line-changes'

GEO_DEV = 40     # מ' — נקודה במסלול רחוקה מהמסלול השני יותר מזה = סטייה
GEO_LEN = 200    # מ' — אורך סטייה מינימלי כדי שייחשב שינוי מסלול
MOVE_M = 40      # מ' — הזזת תחנה (אותו מק"ט) מעל זה נחשבת שינוי
SWAP_M = 60      # מ' — מק"ט שהוחלף באותו שם ובמרחק עד זה = החלפת מק"ט בלבד
SIMPLIFY_M = 5   # מ' — דילול השרטוט לפלט


def norm_city(s):
    s = re.sub(r'["\'״׳`]', '', s or '').strip()
    s = s.replace('יי', 'י').replace('-', ' ')
    return re.sub(r'\s+', ' ', s)


CITIES = {norm_city(c) for c in CITIES_RAW.split(',') if c.strip()}


def city_of(desc):
    m = re.search(r'עיר:\s*(.*?)\s*(?:רציף:|$)', desc or '')
    return m.group(1).strip() if m else ''


def norm_name(s):
    return re.sub(r'[\s"\'״׳`.\-/]', '', s or '')


def d8(d):
    return d.strftime('%Y%m%d')


def dist_m(a, b):
    cl = math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * cl)


# ---------------------------------------------------------------- קריאת GTFS

class Feed:
    """GTFS של יום אחד, מסונן לחלון תאריכים [d0, d1]."""

    def __init__(self, day, d0, d1):
        self.day, self.d0, self.d1 = day, d0, d1
        self.url = gtfs_zip.archive_url(day)
        print(f'GTFS {day} · תאריכים {d0}–{d1}', flush=True)
        self.members = gtfs_zip.central_dir(self.url)
        self._read_small()
        self._read_stop_times()

    def rows(self, name):
        return gtfs_zip.member_rows(self.url, self.members, name)

    def _read_small(self):
        h, rd = self.rows('agency.txt')
        self.agency = {r[h['agency_id']]: r[h['agency_name']] for r in rd if r}
        h, rd = self.rows('routes.txt')
        self.routes = {}
        for r in rd:
            if not r:
                continue
            self.routes[r[h['route_id']]] = dict(
                ag=r[h['agency_id']], line=r[h['route_short_name']], long=r[h['route_long_name']],
                rd=r[h['route_desc']], ty=r[h['route_type']])
        h, rd = self.rows('stops.txt')
        self.stops = {}
        for r in rd:
            if not r:
                continue
            try:
                ll = (float(r[h['stop_lat']]), float(r[h['stop_lon']]))
            except ValueError:
                continue
            self.stops[r[h['stop_id']]] = dict(
                code=r[h['stop_code']], name=r[h['stop_name']], ll=ll, city=city_of(r[h['stop_desc']]))
        # תאריכי פעילות לכל שירות בתוך החלון
        h, rd = self.rows('calendar.txt')
        wd = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        days = []
        d = self.d0
        while d <= self.d1:
            days.append(d)
            d += datetime.timedelta(days=1)
        self.svc_dates, self.svc_start = {}, {}
        for r in rd:
            if not r:
                continue
            s = datetime.datetime.strptime(r[h['start_date']], '%Y%m%d').date()
            e = datetime.datetime.strptime(r[h['end_date']], '%Y%m%d').date()
            act = tuple(x for x in days if s <= x <= e and r[h[wd[x.weekday()]]] == '1')
            if act:
                self.svc_dates[r[h['service_id']]] = act
                self.svc_start[r[h['service_id']]] = s
        h, rd = self.rows('trips.txt')
        self.trips = {}
        for r in rd:
            if not r:
                continue
            sv = r[h['service_id']]
            if sv in self.svc_dates and r[h['route_id']] in self.routes:
                self.trips[r[h['trip_id']]] = (r[h['route_id']], sv, r[h['shape_id']])
        print(f'  {len(self.routes)} מסלולים · {len(self.trips)} נסיעות בחלון', flush=True)

    def _read_stop_times(self):
        """רצף התחנות לכל נסיעה בחלון. השורות מקובצות לפי נסיעה — סוגרים נסיעה כשמתחילה הבאה."""
        keep = {t.encode() for t in self.trips}
        pats = {}            # tuple(stop_id) -> pid
        self.pat_list = []
        self.trip_pat = {}
        partial = defaultdict(list)
        st = {'rest': b'', 'hdr': None, 'cur': None, 'buf': []}

        def close():
            t, buf = st['cur'], st['buf']
            if t is None:
                return
            tid = t.decode()
            if tid in self.trip_pat or tid in partial:
                partial[tid].extend(buf)
                self.trip_pat.pop(tid, None)
            else:
                buf.sort()
                p = tuple(s for _, s in buf)
                pid = pats.get(p)
                if pid is None:
                    pid = pats[p] = len(self.pat_list)
                    self.pat_list.append(p)
                self.trip_pat[tid] = pid
                # שומרים גם את הרשימה הגולמית לנסיעה שאולי תופיע שוב (נדיר) — רק כמזהה
            st['cur'], st['buf'] = None, []

        def cb(chunk):
            data = st['rest'] + chunk
            lines = data.split(b'\n')
            st['rest'] = lines.pop()
            hdr = st['hdr']
            for ln in lines:
                if hdr is None:
                    cols = ln.decode('utf-8-sig').strip().split(',')
                    hdr = st['hdr'] = (cols.index('trip_id'), cols.index('stop_id'), cols.index('stop_sequence'))
                    continue
                f = ln.rstrip(b'\r').split(b',')
                t = f[hdr[0]]
                if t != st['cur']:
                    close()
                    if t not in keep:
                        st['cur'] = None
                        continue
                    st['cur'] = t
                elif st['cur'] is None:
                    continue
                st['buf'].append((int(f[hdr[2]]), f[hdr[1]].decode()))

        gtfs_zip.stream_member(self.url, self.members, 'stop_times.txt', cb)
        if st['rest'].strip():
            cb(b'\n')
        close()
        for tid, buf in partial.items():   # נסיעות שהשורות שלהן מפוזרות בקובץ
            buf.sort()
            p = tuple(s for _, s in buf)
            pid = pats.get(p)
            if pid is None:
                pid = pats[p] = len(self.pat_list)
                self.pat_list.append(p)
            self.trip_pat[tid] = pid
        print(f'  {len(self.trip_pat)} נסיעות עם תחנות · {len(self.pat_list)} רצפים שונים', flush=True)

    def load_shapes(self, ids):
        ids = {i.encode() for i in ids if i}
        pts = defaultdict(list)
        st = {'rest': b'', 'hdr': None}

        def cb(chunk):
            data = st['rest'] + chunk
            lines = data.split(b'\n')
            st['rest'] = lines.pop()
            hdr = st['hdr']
            for ln in lines:
                if hdr is None:
                    cols = ln.decode('utf-8-sig').strip().split(',')
                    hdr = st['hdr'] = (cols.index('shape_id'), cols.index('shape_pt_lat'),
                                       cols.index('shape_pt_lon'), cols.index('shape_pt_sequence'))
                    continue
                f = ln.rstrip(b'\r').split(b',')
                if f[hdr[0]] in ids:
                    pts[f[hdr[0]].decode()].append((int(f[hdr[3]]), float(f[hdr[1]]), float(f[hdr[2]])))

        if ids:
            gtfs_zip.stream_member(self.url, self.members, 'shapes.txt', cb)
            if st['rest'].strip():
                cb(b'\n')
        out = {}
        for k, v in pts.items():
            v.sort()
            out[k] = [(la, lo) for _, la, lo in v]
        return out

    def variants(self, d0, d1):
        """route_desc -> {(pid, shape_id): {'td': נסיעות×ימים, 'dates': set, 'svc': set, 'rid': route_id}}"""
        out = defaultdict(dict)
        for tid, (rid, sv, shp) in self.trips.items():
            pid = self.trip_pat.get(tid)
            if pid is None:
                continue
            dates = [x for x in self.svc_dates[sv] if d0 <= x <= d1]
            if not dates:
                continue
            key = self.routes[rid]['rd'] or rid
            v = out[key].setdefault((pid, shp), {'td': 0, 'dates': set(), 'svc': set(), 'rid': rid})
            v['td'] += len(dates)
            v['dates'].update(dates)
            v['svc'].add(sv)
        return out


def open_feed(day, d0, d1, back=4):
    """ה-GTFS של יום מסוים; אם עוד לא בארכיון — של היום שלפניו (עד back ימים)."""
    for i in range(back):
        dd = day - datetime.timedelta(days=i)
        try:
            return Feed(dd, d0, d1)
        except OSError as e:
            print(f'  אין GTFS ל-{dd}: {e}', flush=True)
    raise SystemExit('לא נמצא GTFS בארכיון')


# ---------------------------------------------------------------- גאומטריה

def to_xy(pts, lat0):
    cl = math.cos(math.radians(lat0))
    return [(lo * 111320 * cl, la * 110540) for la, lo in pts]


def densify(xy, step=15.0):
    out = []
    for (x0, y0), (x1, y1) in zip(xy, xy[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) // step))
        for i in range(n):
            out.append((x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n))
    if xy:
        out.append(xy[-1])
    return out


class SegIndex:
    CELL = 100.0

    def __init__(self, xy):
        self.segs = list(zip(xy, xy[1:])) or [(xy[0], xy[0])]
        self.grid = defaultdict(list)
        for i, ((x0, y0), (x1, y1)) in enumerate(self.segs):
            for cx in range(int(min(x0, x1) // self.CELL), int(max(x0, x1) // self.CELL) + 1):
                for cy in range(int(min(y0, y1) // self.CELL), int(max(y0, y1) // self.CELL) + 1):
                    self.grid[(cx, cy)].append(i)

    def near(self, p, lim):
        """המרחק מהנקודה למסלול, אם הוא קטן מ-lim (אחרת lim)."""
        cx, cy = int(p[0] // self.CELL), int(p[1] // self.CELL)
        r = int(lim // self.CELL) + 1
        best = lim
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                for i in self.grid.get((cx + dx, cy + dy), ()):
                    (x0, y0), (x1, y1) = self.segs[i]
                    vx, vy = x1 - x0, y1 - y0
                    L = vx * vx + vy * vy
                    t = 0 if L == 0 else max(0, min(1, ((p[0] - x0) * vx + (p[1] - y0) * vy) / L))
                    d = math.hypot(p[0] - x0 - t * vx, p[1] - y0 - t * vy)
                    if d < best:
                        best = d
        return best


def deviation_len(a, b, lat0):
    """כמה מטרים מהמסלול a רחוקים מהמסלול b יותר מ-GEO_DEV."""
    if len(a) < 2 or len(b) < 2:
        return 0
    xa, xb = densify(to_xy(a, lat0)), to_xy(b, lat0)
    idx = SegIndex(xb)
    dev = 0.0
    for p, q in zip(xa, xa[1:]):
        if idx.near(p, GEO_DEV * 2) > GEO_DEV:
            dev += math.hypot(q[0] - p[0], q[1] - p[1])
    return dev


def simplify(pts, tol=SIMPLIFY_M):
    if len(pts) < 3:
        return pts
    lat0 = pts[0][0]
    xy = to_xy(pts, lat0)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x0, y0), (x1, y1) = xy[i], xy[j]
        vx, vy = x1 - x0, y1 - y0
        L = math.hypot(vx, vy)
        best, bi = 0, -1
        for k in range(i + 1, j):
            x, y = xy[k]
            d = abs(vy * (x - x0) - vx * (y - y0)) / L if L else math.hypot(x - x0, y - y0)
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def rnd(pts):
    return [[round(la, 5), round(lo, 5)] for la, lo in pts]


# ---------------------------------------------------------------- השוואה

def main_variant(vs):
    """הדפוס של רוב הנסיעות (נסיעות×ימים); בשוויון — זה שמתחיל מוקדם יותר."""
    return max(vs.items(), key=lambda kv: (kv[1]['td'], -min(kv[1]['dates']).toordinal()))[0] if vs else None


def stop_arr(st):
    """תחנה בפלט: [מק"ט, שם, lat, lon, עיר]"""
    return [st['code'], st['name'], round(st['ll'][0], 5), round(st['ll'][1], 5), st['city']]


def encode_shape(pts):
    """polyline מקודד (דיוק 1e-5) — אותו פורמט כמו ב"הקו בזמן" (linehistory.py)"""
    out, pla, plo = [], 0, 0
    for la, lo in pts:
        ila, ilo = int(round(la * 1e5)), int(round(lo * 1e5))
        for v in (ila - pla, ilo - plo):
            v = ~(v << 1) if v < 0 else v << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1f)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        pla, plo = ila, ilo
    return ''.join(out)


def stop_rec(st):
    return {'code': st['code'], 'name': st['name'], 'll': [round(st['ll'][0], 5), round(st['ll'][1], 5)],
            'city': st['city']}


def compare(old_codes, new_codes, old_stops, new_stops, old_shape, new_shape):
    """מחזיר (שינויים משמעותיים, שינויים קטנים שסוננו)."""
    oc, nc = [s['code'] for s in old_codes], [s['code'] for s in new_codes]
    so, sn = set(oc), set(nc)
    added = [s for s in new_codes if s['code'] not in so]
    removed = [s for s in old_codes if s['code'] not in sn]
    minor = defaultdict(int)
    # החלפת מק"ט: אותו שם, אותו מקום
    swaps = []
    for r in list(removed):
        for a in added:
            if norm_name(a['name']) == norm_name(r['name']) and dist_m(a['ll'], r['ll']) <= SWAP_M:
                swaps.append((r, a))
                removed.remove(r)
                added.remove(a)
                break
    if swaps:
        minor['code'] += len(swaps)
    moved = []
    for code in so & sn:
        o, n = old_stops[code], new_stops[code]
        dm = dist_m(o['ll'], n['ll'])
        if dm > MOVE_M:
            moved.append({'code': code, 'name': n['name'], 'from': stop_rec(o)['ll'], 'll': stop_rec(n)['ll'],
                          'm': int(dm), 'city': n['city']})
        elif dm > 5:
            minor['move'] += 1
        if norm_name(o['name']) != norm_name(n['name']):
            minor['rename'] += 1
    lat0 = (old_shape or new_shape or [(31.5, 35)])[0][0]
    dev = max(deviation_len(new_shape, old_shape, lat0), deviation_len(old_shape, new_shape, lat0)) \
        if old_shape and new_shape else 0
    geo = dev >= GEO_LEN
    if not geo and dev > 0:
        minor['redraw'] += 1
    elif not geo and old_shape and new_shape and old_shape != new_shape:
        minor['redraw'] += 1
    order = (not added and not removed and oc != nc and so == sn)
    return dict(added=added, removed=removed, moved=moved, geo=geo, dev=int(dev), order=order,
                swaps=[{'old': r['code'], 'new': a['code'], 'name': a['name']} for r, a in swaps]), minor


def keep_key(feed_list, pids_by_key, key):
    if not CITIES:
        return True
    for feed, pids in zip(feed_list, pids_by_key):
        for pid in pids.get(key, ()):
            for sid in feed.pat_list[pid]:
                s = feed.stops.get(sid)
                if s and norm_city(s['city']) in CITIES:
                    return True
    return False


def od_of(long):
    """"תחנה-עיר<->תחנה-עיר-1#" → (עיר מוצא, עיר יעד)."""
    parts = []
    for side in (long or '').split('<->'):
        side = re.sub(r'(-\d+[א-ת]?#?\s*)+$', '', side).strip()
        side = re.sub(r'-[0-9#א-ת]{1,3}$', '', side) if side.count('-') > 1 else side
        parts.append(side.rsplit('-', 1)[1].strip() if '-' in side else side)
    return (parts + ['', ''])[:2]


def run():
    t0 = TODAY
    ref_day = t0 - datetime.timedelta(days=REF_DAYS)
    new = open_feed(t0, t0, t0 + datetime.timedelta(days=HORIZON + 7))
    old = open_feed(ref_day, ref_day, t0 - datetime.timedelta(days=1))
    t0 = new.day if new.day < t0 else t0
    old_v = old.variants(old.d0, old.d1)
    new_v = new.variants(t0, t0 + datetime.timedelta(days=HORIZON + 7))

    keys = sorted(set(old_v) | set(new_v))
    old_p = {k: [p for p, _ in v] for k, v in old_v.items()}
    new_p = {k: [p for p, _ in v] for k, v in new_v.items()}
    keys = [k for k in keys if keep_key([old, new], [old_p, new_p], k)]
    print(f'{len(keys)} וריאנטים בתחום ({", ".join(sorted(CITIES)) or "כל הארץ"})', flush=True)

    stats = defaultdict(int)
    cands = {}
    for k in keys:
        ov, nv = old_v.get(k, {}), new_v.get(k, {})
        if not ov:
            stats['new_line'] += 1
            continue
        if not nv:
            stats['ended_line'] += 1
            continue
        old_sigs = {(tuple(old.pat_list[p]), s) for p, s in ov}
        unknown = {v: x for v, x in nv.items() if (tuple(new.pat_list[v[0]]), v[1]) not in old_sigs}
        firsts = sorted({min(x['dates']) for x in unknown.values()
                         if min(x['dates']) <= t0 + datetime.timedelta(days=HORIZON)})
        if not firsts:
            stats['same'] += 1
            continue
        cands[k] = firsts

    # שרטוטים — רק לווריאנטים שיש בהם דפוס חדש
    need_old, need_new = set(), set()
    for k in cands:
        need_old |= {s for _, s in old_v[k]}
        need_new |= {s for _, s in new_v[k]}
    print(f'{len(cands)} וריאנטים עם דפוס חדש · טוענים שרטוטים', flush=True)
    shp_old, shp_new = old.load_shapes(need_old), new.load_shapes(need_new)

    found = []
    filtered = defaultdict(int)
    for k, firsts in cands.items():
        ov = old_v[k]
        om = main_variant(ov)
        o_codes = [old.stops[s] for s in old.pat_list[om[0]] if s in old.stops]
        o_stops = {s['code']: s for s in o_codes}
        o_shape = shp_old.get(om[1], [])
        hit = None
        last_minor = None
        for D in firsts:
            win = {v: x for v, x in new_v[k].items() if any(D <= d < D + datetime.timedelta(days=7) for d in x['dates'])}
            win = {v: dict(x, td=sum(1 for d in x['dates'] if D <= d < D + datetime.timedelta(days=7)) * 1) for v, x in win.items()}
            nm = main_variant(win)
            if nm is None:
                continue
            n_codes = [new.stops[s] for s in new.pat_list[nm[0]] if s in new.stops]
            n_stops = {s['code']: s for s in n_codes}
            n_shape = shp_new.get(nm[1], [])
            res, minor = compare(o_codes, n_codes, o_stops, n_stops, o_shape, n_shape)
            if res['added'] or res['removed'] or res['moved'] or res['geo']:
                eff = min(d for d in new_v[k][nm]['dates'] if d >= D)
                starts = [new.svc_start[s] for s in new_v[k][nm]['svc'] if new.svc_start[s] > new.day]
                formal = min(starts) if starts else None
                if formal and formal > eff:
                    formal = None
                hit = (D, eff, formal, nm, n_codes, n_shape, res)
                break
            last_minor = minor
        if hit is None:
            stats['minor'] += 1
            for m, c in (last_minor or {'timetable': 1}).items():
                filtered[m] += 1
            if not last_minor:
                filtered['timetable'] += 0
            continue
        D, eff, formal, nm, n_codes, n_shape, res = hit
        r_new = new.routes[new_v[k][nm]['rid']]
        r_old = old.routes[ov[om]['rid']]
        found.append(dict(
            rd=k, makat=k.split('-')[0], dir=(k.split('-') + ['', ''])[1], alt=(k.split('-') + ['', '', ''])[2],
            line=r_new['line'], op=new.agency.get(r_new['ag'], ''), ag=r_new['ag'], ty=r_new['ty'],
            long=r_new['long'], od=od_of(r_new['long']),
            eff=eff.isoformat(), formal=formal.isoformat() if formal else None,
            found=t0.isoformat(),
            old=dict(stops=[stop_arr(s) for s in o_codes], shp=encode_shape(simplify(o_shape))),
            new=dict(stops=[stop_arr(s) for s in n_codes], shp=encode_shape(simplify(n_shape))),
            added=[s['code'] for s in res['added']], removed=[s['code'] for s in res['removed']],
            moved=res['moved'], geo=res['geo'], dev=res['dev'], swaps=res['swaps'],
        ))
    stats['changed'] = len(found)
    print('סטטיסטיקה:', dict(stats), '· סוננו:', dict(filtered), flush=True)
    return found, dict(stats), dict(filtered), new.day, old.day, lines_index(new, new_v)


def lines_index(feed, variants):
    """כל הקווים שפועלים בימים הקרובים — לחיפוש בדף (מספר, חברה, מוצא, יעד, ערים).
    פורמט דחוס: ops/cities הן רשימות, ובכל קו אינדקסים אליהן.
    קו = [מק"ט, מספר, חברה, מוצא, יעד, [ערים], [כיוון-חלופה...], סוג, (שינויים מהשנה האחרונה — add_past)]"""
    by = {}
    for rd, vs in variants.items():
        rid = next(iter(vs.values()))['rid']
        r = feed.routes[rid]
        if not r['line'] or r['ty'] == '2':      # רכבת ישראל — לא כאן
            continue
        makat, _, rest = rd.partition('-')
        e = by.setdefault((r['ag'], makat), {'line': r['line'], 'ag': r['ag'], 'od': None, 'cities': {}, 'rds': set(), 'ty': r['ty']})
        e['rds'].add(rest)
        if e['od'] is None or rest.startswith('1-'):
            e['od'] = od_of(r['long'])
        for (pid, _shp), x in vs.items():
            for sid in feed.pat_list[pid]:
                st = feed.stops.get(sid)
                if st and st['city']:
                    e['cities'][st['city']] = e['cities'].get(st['city'], 0) + x['td']
    ops, cities = [], []
    oi, ci = {}, {}
    out = []
    for (ag, makat), e in sorted(by.items(), key=lambda kv: (int(re.sub(r'\D', '', kv[1]['line']) or 0), kv[1]['line'], kv[0][1])):
        op = feed.agency.get(ag, '')
        if op not in oi:
            oi[op] = len(ops); ops.append(op)
        cl = []
        for c, _ in sorted(e['cities'].items(), key=lambda kv: -kv[1]):
            if c not in ci:
                ci[c] = len(cities); cities.append(c)
            cl.append(ci[c])
        out.append([makat, e['line'], oi[op], e['od'][0], e['od'][1], cl, sorted(e['rds']), e['ty']])
    print(f'{len(out)} קווים באינדקס', flush=True)
    return {'ops': ops, 'cities': cities, 'lines': out}


# ---------------------------------------------------------------- פלט

HEB_DAYS = ['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳']


def fmt_d(iso):
    d = datetime.date.fromisoformat(iso)
    return f'{d.day}.{d.month}.{d.year}'


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def totals(dirs):
    """סיכום לקו כולו — תחנה שיורדת בשני הכיוונים (אותו מק"ט) נספרת פעם אחת."""
    return dict(geo=any(x['geo'] for x in dirs),
                add=len({c for x in dirs for c in x['added']}),
                rem=len({c for x in dirs for c in x['removed']}),
                mv=len({m['code'] for x in dirs for m in x['moved']}))


def summary_line(t):
    parts = []
    if t['geo']:
        parts.append('המסלול משתנה')
    if t['rem']:
        parts.append(f"{t['rem']} תחנות יורדות" if t['rem'] > 1 else 'תחנה אחת יורדת')
    if t['add']:
        parts.append(f"{t['add']} תחנות חדשות" if t['add'] > 1 else 'תחנה חדשה אחת')
    if t['mv']:
        parts.append(f"{t['mv']} תחנות זזות" if t['mv'] > 1 else 'תחנה אחת זזה')
    return ' · '.join(parts)


def write_out(found, stats, filtered, new_day, old_day, lines=None, keep_all=False):
    data = os.path.join(OUTDIR, 'data')
    os.makedirs(os.path.join(data, 'l'), exist_ok=True)
    # השינויים מהריצות הקודמות — מקובצי הדפים עצמם (אין קובץ מצב נפרד)
    prev = []
    for fn in sorted(os.listdir(os.path.join(data, 'l'))):
        if fn.endswith('.json'):
            try:
                prev += json.load(open(os.path.join(data, 'l', fn), encoding='utf-8')).get('dirs', [])
            except Exception:  # noqa: BLE001
                pass
    if os.path.exists(os.path.join(data, 'state.json')):
        os.remove(os.path.join(data, 'state.json'))
    t0 = TODAY.isoformat()
    keep_from = (TODAY - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    seen = {f['rd'] for f in found}
    # שינוי שכבר נכנס לתוקף לא יימצא שוב (השבוע שעבר כבר כולל אותו) — נשמר מהריצות הקודמות
    for p in prev:
        if p['rd'] not in seen and (keep_all or keep_from <= p['eff'] < t0):
            found.append(p)
            seen.add(p['rd'])
    found.sort(key=lambda f: (f['eff'], f['makat'], f['dir']))
    if lines is not None:
        json.dump(dict(gen=t0, feed=new_day.isoformat(), **lines), open(os.path.join(data, 'lines.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))

    # דף לכל מק"ט (שני הכיוונים וכל החלופות)
    pages = defaultdict(list)
    for f in found:
        pages[(f['ag'], f['makat'])].append(f)
    index = []
    want = set()
    tpl = open(os.path.join(OUTDIR, 'line-template.html'), encoding='utf-8').read()
    os.makedirs(os.path.join(OUTDIR, 'l'), exist_ok=True)
    for (ag, makat), dirs in pages.items():
        dirs.sort(key=lambda f: (f['dir'], f['alt']))
        eff = min(f['eff'] for f in dirs)
        formal = min((f['formal'] for f in dirs if f.get('formal')), default=None)
        # הכתובת לפי התאריך הרשמי של השינוי (או הנסיעה הראשונה כשאין) — יציבה בין הריצות
        pid = f'{makat}-{(formal or eff).replace("-", "")}'
        want.add(pid)
        f0 = dirs[0]
        cities = sorted({s[4] for f in dirs for s in f['new']['stops'] + f['old']['stops'] if s[4]})
        ch_codes = {c for f in dirs for c in f['added'] + f['removed']} | {m['code'] for f in dirs for m in f['moved']}
        ch_cities = sorted({s[4] for f in dirs for s in f['new']['stops'] + f['old']['stops']
                            if s[0] in ch_codes and s[4]})
        tot = totals(dirs)
        summ = summary_line(tot)
        # בדף הראשי: רק הערים שבהן משהו משתנה (רשימת כל הערים של הקו נמצאת ב-lines.json)
        rec = dict(id=pid, line=f0['line'], op=f0['op'], makat=makat, od=f0['od'], eff=eff,
                   formal=formal, tot=tot, summary=summ, chcities=ch_cities,
                   dirs=[dict(dir=f['dir'], alt=f['alt'], od=f['od'], eff=f['eff'], add=len(f['added']),
                              rem=len(f['removed']), mv=len(f['moved']), geo=f['geo']) for f in dirs])
        index.append(rec)
        json.dump(dict(rec, cities=cities, gen=t0, feed=new_day.isoformat(), dirs=dirs),
                  open(os.path.join(data, 'l', pid + '.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        title = f'שינוי בקו {f0["line"]} {f0["od"][0]} ↔ {f0["od"][1]} מ-{fmt_d(rec["formal"] or eff)}'
        desc = f'{summ}. {f0["op"]}. מצגת עם מפה של לפני ואחרי לכל כיוון, והתחנות שיורדות ושנוספות.'
        html = (tpl.replace('{{TITLE}}', esc(title)).replace('{{DESC}}', esc(desc))
                .replace('{{URL}}', f'{SITE}/l/{pid}.html').replace('{{ID}}', pid))
        open(os.path.join(OUTDIR, 'l', pid + '.html'), 'w', encoding='utf-8').write(html)
    # ניקוי דפים שכבר לא ברשימה
    for d, ext in ((os.path.join(data, 'l'), '.json'), (os.path.join(OUTDIR, 'l'), '.html')):
        for fn in os.listdir(d):
            if fn.endswith(ext) and fn[:-len(ext)] not in want:
                os.remove(os.path.join(d, fn))
    index.sort(key=lambda r: (r['eff'], int(re.sub(r'\D', '', r['line']) or 0)))
    json.dump(dict(gen=t0, feed=new_day.isoformat(), ref=old_day.isoformat(), horizon=HORIZON,
                   scope=sorted(CITIES_RAW.split(',')) if CITIES else [], stats=stats, filtered=filtered,
                   changes=index),
              open(os.path.join(data, 'index.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(f'{len(index)} דפים נכתבו ל-{OUTDIR}', flush=True)


PAST_KINDS = {'route', 'stops', 'stops-add', 'stops-del', 'extend', 'shorten', 'terminal'}


def add_past(lines_path, ch_dir, days=365):
    """שינויי מסלול ותחנות מהשנה האחרונה, מ"הקו בזמן" (line-history/data/changes/YYYY-MM.json):
    לכל קו באינדקס — [[תאריך, כיוון-חלופה, סוג], ...]. הגאומטריה והתחנות עצמן נטענות בדף
    מקובצי הקווים של "הקו בזמן" (line-history/data/lines/<rd>.json), רק לקו שנבחר."""
    li = json.load(open(lines_path, encoding='utf-8'))
    since = (TODAY - datetime.timedelta(days=days)).isoformat()
    past = defaultdict(list)
    n = 0
    for fn in sorted(os.listdir(ch_dir)):
        if not re.match(r'^\d{4}-\d{2}\.json$', fn) or fn[:7] < since[:7]:
            continue
        for c in json.load(open(os.path.join(ch_dir, fn), encoding='utf-8')).get('changes', []):
            if c.get('k') in PAST_KINDS and since <= c.get('d', '') <= TODAY.isoformat():
                makat, _, rest = c['rd'].partition('-')
                past[makat].append([c['d'], rest, c['k']])
                n += 1
    for ln in li['lines']:
        ev = sorted({tuple(x) for x in past.get(ln[0], []) if x[1] in ln[6]})
        ln[8:] = [[list(x) for x in ev]] if ev else []
    li['past_since'] = since
    json.dump(li, open(lines_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'שינויים מהשנה האחרונה: {n} אירועים · {sum(1 for ln in li["lines"] if len(ln) > 8)} קווים', flush=True)


if __name__ == '__main__':
    LH = os.environ.get('LH_CHANGES')   # line-history/data/changes — לשינויים מהשנה האחרונה
    if len(sys.argv) > 1 and sys.argv[1] == 'past':
        add_past(os.path.join(OUTDIR, 'data', 'lines.json'), LH or 'line-history/data/changes')
        sys.exit()
    if len(sys.argv) > 1 and sys.argv[1] == 'pages':   # רק לבנות מחדש את הדפים מהקבצים הקיימים
        idx = json.load(open(os.path.join(OUTDIR, 'data', 'index.json'), encoding='utf-8'))
        write_out([], idx.get('stats', {}), idx.get('filtered', {}),
                  datetime.date.fromisoformat(idx['feed']), datetime.date.fromisoformat(idx['ref']), keep_all=True)
    else:
        t = datetime.datetime.now()
        write_out(*run())
        if LH and os.path.isdir(LH):
            add_past(os.path.join(OUTDIR, 'data', 'lines.json'), LH)
        print(f'זמן ריצה: {(datetime.datetime.now() - t).seconds} שניות', flush=True)
