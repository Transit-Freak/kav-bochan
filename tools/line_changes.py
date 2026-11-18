# -*- coding: utf-8 -*-
"""מצגת לשינוי בקו — הנתונים: שינויי מסלול ותחנות שעומדים להיכנס לתוקף, לכל קו "לפני ← אחרי".
הדף (line-changes/) בונה מהם מצגת PDF.

העיקרון: משווים בין מה שהקו עשה בשבוע האחרון (ה-GTFS מלפני REF_DAYS ימים, בתאריכים
שכבר עברו) לבין מה שה-GTFS של היום כבר מכיל לימים הקרובים (HORIZON ימים).
לכל וריאנט קו (route_desc = מק"ט-כיוון-חלופה) נבחר "הדפוס הראשי" — רצף התחנות והשרטוט
שהיו ברוב הנסיעות. כשבימים הקרובים מופיע דפוס חדש שלא היה בשבוע שעבר, משווים את
הדפוס הראשי של השבוע שעבר לדפוס הראשי של השבוע שמתחיל בתאריך השינוי.

נספר כשינוי: תחנות שנוספו או ירדו, תחנה שזזה, או מסלול שסוטה מהקודם לאורך
GEO_LEN מ' לפחות (במרחק של יותר מ-GEO_DEV מ'). לא נספר (ומדווח בנפרד כ"מסונן"):
שינוי בלוח הזמנים בלבד, שרטוט מחדש של כמה מטרים, שינוי שם של תחנה, החלפת מק"ט של
תחנה באותו מקום ובאותו שם, הזזה קטנה של תחנה.

שלושה סוגים נוספים (kind בכל רשומה; בלי kind = שינוי מסלול):
  new        קו חדש — מק"ט שלא נסע בשבוע שעבר (או שהתחיל באמצע אותו שבוע) ונוסע מהשבוע הקרוב:
             תחנות, מסלול, ושעות היציאה לכל סוג יום (א׳–ה׳, שישי, שבת).
  ended      קו מבוטל — מק"ט שנסע בשבוע שעבר ואין לו אף נסיעה מעכשיו ועד סוף החלון (או שהנסיעה האחרונה
             בשבוע הקרוב ואחריה אין כלום). עם תאריך הנסיעה האחרונה, וקווים אחרים שעוצרים ברוב התחנות שלו (alts).
  timetable  שינוי בלוח הזמנים — אותו מסלול, שעות אחרות. משמעותי רק אם באחת מקבוצות הימים (ימים בשבוע שיש להם אותו לוח ישן ואותו לוח חדש, למשל א׳–ד׳ וחמישי לחוד) מספר הנסיעות השתנה,
             הנסיעה הראשונה/האחרונה זזה ב-10 דק' או יותר, או התדירות בשעות השיא/בשאר היום השתנתה ב-3 דק' או יותר,
             והלוח החדש נשאר גם בשבוע שאחריו (אחרת: שינוי זמני — tt_temp). הזזה קטנה של כל הנסיעות — tt_shift.
שינוי שכבר נכנס לתוקף נשאר ברשימה KEEP_DAYS ימים (שבועיים), עם הקובץ המלא שלו (data/l) — כך אפשר להכין
מצגת גם לשינוי שכבר התחיל (מהריצות הקודמות; בדף: "כבר התחילו"). שינוי עתידי שלא נמצא שוב בריצה של היום
(המשרד ביטל אותו) — יורד. כשה-GTFS של השבוע שעבר עוד לא ידע על שינוי שכבר התחיל, הוא "יימצא" שוב בכל לילה
עם תאריך של היום — אז נשאר התאריך המקורי מהריצה הקודמת (keep_prev).

הקלט — ישר מהארכיון היומי של דאטאבוס ב-S3 (tools/gtfs_zip.py, קריאה בטווחים בלי להוריד
את כל ה-zip ובלי לכתוב לדיסק). הפלט תחת OUTDIR (ברירת מחדל line-changes):
  data/index.json        רשימת השינויים (לדף הראשי)
  data/l/<id>.json       דף לכל קו: מפה וגם רשימות לכל כיוון
  data/lines.json        כל הקווים שפועלים עכשיו, לחיפוש (ועם LH_CHANGES — השינויים מהשבועיים האחרונים)
  data/places.json       רחובות (מתיאור התחנות) ושכונות (NBR_DIR, הפוליגונים הרשמיים) → אילו קווים עוצרים בהם
  data/tt/<NN>.json      לו"ז עדכני של כל קווי האוטובוס לשבוע הקרוב (מק"ט % 64; הדף טוען רק את הקובץ של הקו שנבחר) — current_tts
  l/<id>.html            דף קטן לכל שינוי (לתצוגה המקדימה בווטסאפ) שמעביר למצגת שלו, מהתבנית line-template.html

רץ כל לילה (.github/workflows/line-changes.yml) על כל הארץ, כדקה וחצי. ב-16.11.2026: 2,849 קווים באינדקס,
235 כיוונים משתנים ב-184 קווים, 27 שינויים קטנים סוננו. עם LH_CHANGES (line-history/data/changes) נוספים
לאינדקס השינויים מהשבועיים האחרונים של כל קו (python3 tools/line_changes.py past — רק השלב הזה).
חלופה שהוחלפה במק"ט-כיוון-חלופה אחר (find_renamed) — נבדקת כשינוי, גם כשההחלפה כבר הייתה בשבוע שעבר
(ב-18.11.2026: 14 חלופות, למשל קו 970 של אגד ב-17.11).
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
import hebcal  # noqa: E402

def _today():
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo('Asia/Jerusalem')).date()
    except Exception:  # noqa: BLE001
        return datetime.date.today()

TODAY = datetime.date.fromisoformat(os.environ['TODAY']) if os.environ.get('TODAY') else _today()
REF_DAYS = int(os.environ.get('REF_DAYS', '7'))
HORIZON = int(os.environ.get('HORIZON', '14'))
KEEP_DAYS = int(os.environ.get('KEEP_DAYS', '14'))   # שינוי שהתחיל נשאר ברשימה (עם המצגת המלאה) שבועיים, ואז יורד
PAST_DAYS = KEEP_DAYS   # השינויים מ"הקו בזמן" (add_past) — אותו חלון
CITIES_RAW = os.environ.get('CITIES', '')
OUTDIR = os.environ.get('OUTDIR', 'line-changes')
SITE = 'https://kavbochan.app/line-changes'

GEO_DEV = 40     # מ' — נקודה במסלול רחוקה מהמסלול השני יותר מזה = סטייה
GEO_LEN = 200    # מ' — אורך סטייה מינימלי כדי שייחשב שינוי מסלול
MOVE_M = 40      # מ' — הזזת תחנה (אותו מק"ט) מעל זה נחשבת שינוי
SWAP_M = 60      # מ' — מק"ט שהוחלף באותו שם ובמרחק עד זה = החלפת מק"ט בלבד
SIMPLIFY_M = 5   # מ' — דילול השרטוט לפלט
REDRAW_DEV = 150  # מ' — כשהתחנות לא השתנו: מרחק מהמסלול הקודם שנחשב עקיפה
REDRAW_LEN = 400  # מ' — ...לאורך קטע רצוף של יותר מזה; אחרת זה רק שרטוט מחדש
SAME_ROAD = 60    # מ' — כשהתחנות השתנו: קטע שנשאר עד המרחק הזה מהמסלול הקודם — אותה דרך


def norm_city(s):
    s = re.sub(r'["\'״׳`]', '', s or '').strip()
    s = s.replace('יי', 'י').replace('-', ' ')
    return re.sub(r'\s+', ' ', s)


CITIES = {norm_city(c) for c in CITIES_RAW.split(',') if c.strip()}


def city_of(desc):
    m = re.search(r'עיר:\s*(.*?)\s*(?:רציף:|$)', desc or '')
    return m.group(1).strip() if m else ''


def street_of(desc):
    """הרחוב מתיאור התחנה ("רחוב: הרצל 12 עיר: צפת ...") — בלי מספר בית, בלי "רח'", עם גרשיים אחידים"""
    m = re.search(r'רחוב:\s*(.*?)\s*עיר:', desc or '')
    t = (m.group(1) if m else '').replace("''", '"').replace('״', '"').strip()
    t = re.sub(r"^(רח['׳]|רחוב)\s+", '', t)
    t = re.sub(r"^שד['׳]\s+", 'שדרות ', t)
    t = re.sub(r'\s+\d+[א-ת]?$', '', t).strip(' -,')
    return '' if (not t or t.isdigit() or len(t) < 2) else t


def norm_name(s):
    return re.sub(r'[\s"\'״׳`.\-/]', '', s or '')


def hm(b):
    """'07:35:00' (bytes או str) → 455 דקות; ריק/שגוי → None"""
    try:
        t = b.decode() if isinstance(b, bytes) else b
        h, m = t.strip().split(':')[:2]
        return int(h) * 60 + int(m)
    except Exception:  # noqa: BLE001
        return None


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
                code=r[h['stop_code']], name=r[h['stop_name']], ll=ll, city=city_of(r[h['stop_desc']]),
                street=street_of(r[h['stop_desc']]))
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
        self.svc_set = {k: set(v) for k, v in self.svc_dates.items()}
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
        self.trip_dep = {}   # נסיעה → שעת היציאה מהתחנה הראשונה (דקות מחצות; אחרי חצות — 1440 ומעלה)
        self.trip_end = {}   # נסיעה → השעה בתחנה האחרונה (למשך הנסיעה בלו"ז העדכני)
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
                p = tuple(x[1] for x in buf)
                pid = pats.get(p)
                if pid is None:
                    pid = pats[p] = len(self.pat_list)
                    self.pat_list.append(p)
                self.trip_pat[tid] = pid
                self.trip_dep[tid] = hm(buf[0][2])
                self.trip_end[tid] = hm(buf[-1][2])
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
                    hdr = st['hdr'] = (cols.index('trip_id'), cols.index('stop_id'), cols.index('stop_sequence'), cols.index('departure_time'))
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
                st['buf'].append((int(f[hdr[2]]), f[hdr[1]].decode(), f[hdr[3]]))

        gtfs_zip.stream_member(self.url, self.members, 'stop_times.txt', cb)
        if st['rest'].strip():
            cb(b'\n')
        close()
        for tid, buf in partial.items():   # נסיעות שהשורות שלהן מפוזרות בקובץ
            buf.sort()
            self.trip_dep[tid] = hm(buf[0][2])
            self.trip_end[tid] = hm(buf[-1][2])
            p = tuple(x[1] for x in buf)
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

    def deps_by(self, key_of):
        """מפתח (מק"ט-כיוון) → {service_id: [שעות היציאה של הנסיעות]} — ללוח הזמנים"""
        out = defaultdict(lambda: defaultdict(list))
        for tid, (rid, sv, _s) in self.trips.items():
            dep = self.trip_dep.get(tid)
            if dep is not None:
                out[key_of(self.routes[rid]['rd'] or rid)][sv].append(dep)
        return out

    def day_deps(self, svcs, day):
        """שעות היציאה של יום שירות (ממוינות): מ-03:00, ועוד הנסיעות שלפני 03:00 של למחרת (בסוף, 1440+) —
        כמו בלו"ז העדכני. ב-GTFS נסיעות לילה מופיעות לפעמים כ-00:30 של היום שאחרי (ולא 24:30), ובלי זה
        "הנסיעה הראשונה" יוצאת 0:00 (קו 1 בבת ים, 24.11.2026)"""
        nxt = day + datetime.timedelta(days=1)
        lst = []
        for sv, deps in svcs.items():
            ss = self.svc_set.get(sv, ())
            if day in ss:
                lst += [m for m in deps if m >= NIGHT]
            if nxt in ss:
                lst += [m + 1440 for m in deps if m < NIGHT]
        return sorted(lst)

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


def deviation_len(a, b, lat0, thr=None):
    """כמה מטרים מהמסלול a רחוקים מהמסלול b יותר מ-thr (ברירת מחדל GEO_DEV)."""
    return sum(deviation_runs(a, b, lat0, thr))


def deviation_runs(a, b, lat0, thr=None):
    """אורכי הקטעים הרצופים במסלול a שרחוקים מהמסלול b יותר מ-thr מטרים"""
    thr = thr or GEO_DEV
    if len(a) < 2 or len(b) < 2:
        return []
    xa, xb = densify(to_xy(a, lat0)), to_xy(b, lat0)
    idx = SegIndex(xb)
    runs, cur = [], 0.0
    for p, q in zip(xa, xa[1:]):
        if idx.near(p, thr * 2) > thr:
            cur += math.hypot(q[0] - p[0], q[1] - p[1])
        elif cur:
            runs.append(cur); cur = 0.0
    if cur:
        runs.append(cur)
    return runs


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
    same_seq = oc == nc and not any(dist_m(old_stops[c]['ll'], new_stops[c]['ll']) > MOVE_M for c in so & sn)
    if old_shape and new_shape and same_seq:
        # אותן תחנות באותו סדר: רק עקיפה אמיתית נחשבת — קטע רצוף של יותר מ-400 מ' שרחוק מהמסלול הקודם יותר מ-150 מ'.
        # כל השאר הוא שרטוט מחדש של אותה דרך, ולא מדווח בכלל
        runs = deviation_runs(new_shape, old_shape, lat0, REDRAW_DEV) + deviation_runs(old_shape, new_shape, lat0, REDRAW_DEV)
        geo = any(r > REDRAW_LEN for r in runs)
        dev = max(sum(deviation_runs(new_shape, old_shape, lat0, REDRAW_DEV)), sum(deviation_runs(old_shape, new_shape, lat0, REDRAW_DEV))) if geo else 0
    else:
        # תחנות השתנו: קטע שנשאר עד 60 מ' מהמסלול הקודם הוא אותה דרך
        dev = max(deviation_len(new_shape, old_shape, lat0, SAME_ROAD), deviation_len(old_shape, new_shape, lat0, SAME_ROAD)) \
            if old_shape and new_shape else 0
        geo = dev >= GEO_LEN
    if not geo and dev > 0:
        minor['redraw'] += 1
    elif not geo and old_shape and new_shape and old_shape != new_shape:
        minor['redraw'] += 1
    order = (not added and not removed and oc != nc and so == sn)
    # הקו רק מתארך: אותן תחנות באותו סדר ועוד תחנות לפני או אחרי, והמסלול הישן כולו בתוך החדש
    ext = ''
    if added and not removed and not moved and not swaps and oc and len(nc) > len(oc) and oc[0] in nc:
        k = nc.index(oc[0])
        if nc[k:k + len(oc)] == oc and (not old_shape or not new_shape or deviation_len(old_shape, new_shape, lat0, SAME_ROAD) < GEO_LEN):
            ext = 'both' if k and k + len(oc) < len(nc) else 'start' if k else 'end'
    return dict(added=added, removed=removed, moved=moved, geo=geo, dev=int(dev), order=order, ext=ext,
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


# ---------------------------------------------------------------- לוח זמנים, קו חדש, קו מבוטל

# ימים בשבוע: d0 = ראשון ... d6 = שבת (כולל מוצאי שבת — אותו יום שירות). ימים עם בדיוק אותו לוח זמנים
# (גם הישן וגם החדש) מתקבצים יחד: "א׳–ד׳", "ה׳", "שישי", "שבת"
DOWS = ('d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6')
PEAK = ((420, 540), (960, 1140))   # 07–09, 16–19
OFFPEAK = ((540, 960),)            # 09–16
TT_COUNT, TT_EDGE, TT_HW = 1, 10, 3   # שינוי משמעותי: נסיעה אחת לפחות · ראשונה/אחרונה ב-10 דק' · תדירות ב-3 דק'
ALT_MAX = 5
DOW_FULL = ('ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי')
DOW_LET = ('א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳')


def dow(d):
    """datetime.date → 'd0' (ראשון) ... 'd6' (שבת)"""
    return DOWS[(d.weekday() + 1) % 7]


def days_short(ts):
    """['d0','d1','d2','d3'] → "א׳–ד׳" · ['d4'] → "ה׳" · ['d5'] → "שישי" · ['d0','d2'] → "א׳ ו-ג׳" """
    ix = sorted(DOWS.index(t) for t in ts)
    if ix == [5]:
        return 'שישי'
    if ix == [6]:
        return 'שבת'
    runs = []
    for i in ix:
        if runs and runs[-1][-1] == i - 1:
            runs[-1].append(i)
        else:
            runs.append([i])
    parts = [DOW_LET[r[0]] if len(r) == 1 else DOW_LET[r[0]] + '–' + DOW_LET[r[-1]] for r in runs]
    return parts[0] if len(parts) == 1 else ', '.join(parts[:-1]) + ' ו-' + parts[-1]


def day_in(ts):
    """"בימי חול" · "ביום חמישי" · "בשישי" · "בשבת" · "בימים א׳–ד׳" """
    ix = sorted(DOWS.index(t) for t in ts)
    if ix == [0, 1, 2, 3, 4]:
        return 'בימי חול'
    if len(ix) == 1:
        return 'ביום ' + DOW_FULL[ix[0]] if ix[0] < 5 else 'בשישי' if ix[0] == 5 else 'בשבת'
    return 'בימים ' + days_short(ts)


def dir_key(rd):
    """מק"ט-כיוון (כל החלופות יחד) — לוח הזמנים של נוסע בכיוון הזה"""
    p = rd.split('-')
    return p[0] + '-' + (p[1] if len(p) > 1 else '')


def headway(lst, wins):
    """המרווח האופייני (חציון) בין יציאות בתוך חלונות השעות; None כשיש פחות משלוש יציאות"""
    gaps = []
    for a, b in wins:
        xs = [m for m in lst if a <= m < b]
        gaps += [y - x for x, y in zip(xs, xs[1:])]
    if len(gaps) < 2:
        return None
    gaps.sort()
    k = len(gaps) // 2
    return int(round(gaps[k] if len(gaps) % 2 else (gaps[k - 1] + gaps[k]) / 2))


def tt_sum(lst):
    if not lst:
        return {'n': 0}
    return {'n': len(lst), 'f': lst[0], 'l': lst[-1], 'pk': headway(lst, PEAK), 'op': headway(lst, OFFPEAK)}


def tt_sig(a, b):
    """שינוי משמעותי בין שני סיכומים של אותו סוג יום"""
    if abs(a['n'] - b['n']) >= TT_COUNT:
        return True
    if not a['n']:
        return False
    if abs(a['f'] - b['f']) >= TT_EDGE or abs(a['l'] - b['l']) >= TT_EDGE:
        return True
    return any(a.get(k) and b.get(k) and abs(a[k] - b[k]) >= TT_HW for k in ('pk', 'op'))


def wk_typical(feed, svcs, days):
    """לכל יום בשבוע: רשימת היציאות הנפוצה בתאריכים האלה (חג או יום חריג אחד לא קובע).
    בשוויון — רשימה עם נסיעות, ואז של התאריך המאוחר"""
    by = defaultdict(list)
    for d in days:
        by[dow(d)].append(tuple(feed.day_deps(svcs, d)))
    out = {}
    for w, lists in by.items():
        cnt = defaultdict(int)
        pos = {}
        for i, x in enumerate(lists):
            cnt[x] += 1
            pos[x] = i
        out[w] = list(max(lists, key=lambda x: (cnt[x], bool(x), pos[x])))
    return out


def day_groups(old, new):
    """ימים בשבוע עם בדיוק אותו לוח ישן ואותו לוח חדש — קבוצה אחת: [(ימים, ישן, חדש)]. old=None לקו חדש"""
    g = {}
    for w in DOWS:
        if w not in new and (old is None or w not in old):
            continue
        k = (tuple(old.get(w, [])) if old is not None else None, tuple(new.get(w, [])))
        g.setdefault(k, []).append(w)
    return [(ws, list(k[0]) if k[0] is not None else None, list(k[1])) for k, ws in g.items()]


def tt_entries(groups):
    """רשומות לוח הזמנים לפלט: [{t: [ימים], o/n: יציאות, so/sn: סיכום}] (o/so רק כשיש לוח ישן)"""
    out = []
    for ws, o, n in groups:
        if not n and not o:
            continue
        e = {'t': ws, 'n': n, 'sn': tt_sum(n)}
        if o is not None:
            e['o'] = o
            e['so'] = tt_sum(o)
        out.append(e)
    return out


def tt_change(old, new, o_svcs, n_svcs, ref_days, t0, last_day):
    """שינוי בלוח הזמנים של כיוון אחד (אותו מסלול). לכל יום בשבוע: מה היה בשבוע שעבר מול הלוח הנפוץ
    בשלושת השבועות הבאים; ימים עם אותו לוח (ישן וחדש) מתקבצים, והסף נבדק לכל קבוצה.
    מחזיר ((תאריך, קבוצות, קבוצות שהשתנו), '') או (None, סיבה)"""
    day = datetime.timedelta(days=1)
    ref = {dow(d): old.day_deps(o_svcs, d) for d in ref_days}
    win = []
    d = t0
    while d <= last_day:
        win.append(d)
        d += day
    nw = wk_typical(new, n_svcs, win)
    # יום בלי נסיעות בשבוע שעבר, בתוך כמה ימים רצופים בלי נסיעות (השבתה זמנית) — לא יודעים מה היה; לא משווים
    empty = {x for x in ref_days if not ref[dow(x)]}
    for x in ref_days:
        w = dow(x)
        if x in empty and nw.get(w) and any(y in empty and nw.get(dow(y)) for y in (x - day, x + day)):
            ref[w] = nw[w]
    # בשבוע שעבר יש רק תאריך אחד לכל יום. בימים שהלוח החדש שלהם זהה (למשל א׳–ד׳), יום אחד שהיה שונה מכל השאר
    # בשבוע שעבר (חג, ביטול חד-פעמי) — מקבל את הלוח של רוב הימים בקבוצה
    by_new = defaultdict(list)
    for w in DOWS:
        if w in nw:
            by_new[tuple(nw[w])].append(w)
    for ws in by_new.values():
        if len(ws) < 3:
            continue
        cnt = defaultdict(int)
        for w in ws:
            cnt[tuple(ref.get(w, []))] += 1
        mode = max(cnt, key=lambda x: (cnt[x], bool(x)))
        if cnt[mode] >= 2:
            for w in ws:
                if cnt[tuple(ref.get(w, []))] == 1:
                    ref[w] = list(mode)
    groups = day_groups(ref, nw)
    changed = [g for g in groups if tt_sig(tt_sum(g[1]), tt_sum(g[2]))]
    if not changed:
        if any(g[1] != g[2] for g in groups):
            return None, 'shift'
        if any(new.day_deps(n_svcs, x) != nw.get(dow(x), []) for x in win[:8]):
            return None, 'temp'
        return None, 'same'
    chw = {w for g in changed for w in g[0]}
    # השינוי כבר התחיל באמצע השבוע שעבר: בימים שהלוח החדש שלהם זהה, הימים המוקדמים בשבוע שעבר עוד היו לפי הלוח הישן
    # והמאוחרים כבר לפי החדש (למשל שינוי מיום ראשון, כשהשבוע שעבר התחיל ביום רביעי) — התאריך הוא היום שבו זה התחיל
    past = None
    for ws in by_new.values():
        seq = [x for x in sorted(ref_days) if dow(x) in ws]
        ok = [not tt_sig(tt_sum(old.day_deps(o_svcs, x)), tt_sum(nw[dow(x)])) for x in seq]
        if True in ok and False in ok and all(ok[ok.index(True):]) and chw & set(ws):
            x0 = seq[ok.index(True)]
            past = x0 if past is None or x0 < past else past
    if past is not None and all(any(w in ws and any(not tt_sig(tt_sum(old.day_deps(o_svcs, x)), tt_sum(nw[w])) for x in ref_days if dow(x) in ws)
                                    for ws in by_new.values()) for w in chw):
        return None, 'before'   # התחיל כבר בשבוע שעבר — הלילות הקודמים כבר מצאו אותו מראש
    eff = next((x for x in win if dow(x) in chw and tt_sig(tt_sum(ref[dow(x)]), tt_sum(new.day_deps(n_svcs, x)))
                and not tt_sig(tt_sum(new.day_deps(n_svcs, x)), tt_sum(nw[dow(x)]))), None)
    if eff is None or eff > t0 + datetime.timedelta(days=HORIZON):
        return None, 'later'
    return (eff, groups, changed), ''


def stops_of(feed, pid):
    return [feed.stops[s] for s in feed.pat_list[pid] if s in feed.stops]


def blank_side():
    return dict(stops=[], shp='')


def kind_rec(k, kind, r, op, eff, t0, old=None, new=None, **kw):
    """רשומת כיוון לסוגים החדשים — אותם שדות כמו בשינוי מסלול, כדי שהדף יעבוד איתם כרגיל"""
    makat, d = (k.split('-') + [''])[:2]
    return dict(kind=kind, rd=k + '-#', makat=makat, dir=d, alt='#',
                line=r['line'], op=op, ag=r['ag'], ty=r['ty'], long=r['long'], od=od_of(r['long']),
                eff=eff.isoformat(), formal=None, found=t0.isoformat(),
                old=old or blank_side(), new=new or blank_side(),
                added=[], removed=[], moved=[], geo=False, dev=0, swaps=[], ext='', **kw)


def side_of(feed, pid, shapes, shp_id, full=True):
    st = stops_of(feed, pid)
    if not full:   # לוח זמנים: רק התחנה הראשונה והאחרונה (לשם הנסיעה)
        st = st[:1] + st[-1:] if len(st) > 1 else st
        return dict(stops=[stop_arr(s) for s in st], shp='', n=len(stops_of(feed, pid)))
    return dict(stops=[stop_arr(s) for s in st], shp=encode_shape(simplify(shapes.get(shp_id, []))))


def find_alts(ended_codes, cand_index, exclude, max_n=ALT_MAX):
    """קווים אחרים שעוצרים בהכי הרבה מהתחנות של קו שמבוטל (כמו "קו ממשיך — השערה" ב"הקו בזמן",
    אבל בכל המסלול ולא רק בעיר המוצא)"""
    cnt = defaultdict(int)
    first = {}
    for i, c in enumerate(ended_codes):
        for mk in cand_index.get(c, ()):
            if mk in exclude:
                continue
            cnt[mk] += 1
            first.setdefault(mk, i)
    need = max(2, int(math.ceil(len(ended_codes) * 0.15)))
    best = sorted((mk for mk, n in cnt.items() if n >= need), key=lambda mk: (-cnt[mk], first[mk]))
    return [(mk, cnt[mk], first[mk]) for mk in best[:max_n]]


def find_renamed(keys, old_v, new_v, old, t0, new=None):
    """חלופות שהוחלפו: {מק"ט-כיוון-חלופה חדש: (הישן, היום הראשון של החדש)}.
    הישן — נסע בשבוע שעבר ולא נוסע מעכשיו; החדש — באותו מק"ט-כיוון, לא נסע בתחילת השבוע שעבר,
    ומתחיל עד 4 ימים אחרי שהישן הפסיק (או עד 8, כשבינתיים אין בכיוון אף נסיעה), עם חצי מהתחנות משותפות לפחות.
    כמה ישנים לאותו חדש — זה עם הכי הרבה נסיעות בשבוע שעבר (ובשוויון — הדומה ביותר בתחנות)."""
    dates = lambda vs: set().union(*[x['dates'] for x in vs.values()]) if vs else set()   # noqa: E731
    by_dk = defaultdict(list)
    for k in keys:
        by_dk[dir_key(k)].append(k)
    out = {}
    for dk, ks in by_dk.items():
        gone = [(max(dates(old_v[k])), sum(x['td'] for x in old_v[k].values()), k) for k in ks if old_v.get(k) and not new_v.get(k)]
        if not gone:
            continue
        for k in ks:
            if not new_v.get(k):
                continue
            od, nd = dates(old_v.get(k) or {}), dates(new_v[k])
            F = min(od | nd)
            # חלופה שנוסעת רק בחלק מימי השבוע (למשל רק בשישי) ופשוט עוד לא היה היום שלה — לא חדשה
            wds = {d.weekday() for d in nd if d < t0 + datetime.timedelta(days=7)} or {F.weekday()}
            if F <= old.d0 or not any((old.d0 + datetime.timedelta(days=i)).weekday() in wds for i in range((F - old.d0).days)):
                continue
            # עד 4 ימים בין הישנה לחדשה; עד 8 ימים — כשבינתיים אין בכיוון הזה אף נסיעה (הפסקה בשירות ואז מספר חדש)
            busy = set().union(*[dates(old_v.get(x) or {}) | dates(new_v.get(x) or {}) for x in ks if x != k]) if len(ks) > 1 else set()
            pre = [g for g in gone if g[0] < F <= g[0] + datetime.timedelta(days=4)
                   or (g[0] < F <= g[0] + datetime.timedelta(days=8) and not any(g[0] < d < F for d in busy))]
            if pre and new is not None:
                # אותו קו? לפחות חצי מהתחנות משותפות (אחרת זה מסלול אחר, לא החלפה). כמה מועמדים — זו שנסעה הכי הרבה
                # (בדיקה על 9 שבועות, ספטמבר–נובמבר 2026: 65 זוגות; בפחות מחצי תחנות משותפות — 3 זוגות, כולם חלופות של חג)
                def st(feed, vs):
                    return {feed.stops[x]['code'] for pid, _ in vs for x in feed.pat_list[pid] if x in feed.stops}
                b = st(new, new_v[k])
                sim = {}
                for g in pre:
                    a = st(old, old_v[g[2]])
                    if len(a & b) * 2 >= min(len(a), len(b)):
                        sim[g[2]] = (g[1], len(a & b) / len(a | b))   # הישנה עם הכי הרבה נסיעות; בשוויון — הדומה ביותר
                if sim:
                    out[k] = (max(sim, key=lambda x: sim[x]), F)
                continue
            if pre:
                out[k] = (max(pre)[2], F)
    return out


def ltr(s):
    """מק"ט-כיוון-חלופה בתוך משפט בעברית — משמאל לימין (אחרת 10970-1-# מוצג כ-#-10970-1)"""
    return '\u2066' + s + '\u2069'


def rename_records(renamed, old_v, new_v, old, new, shp_old, shp_new, t0, stats):
    """חלופות שהוחלפו (find_renamed): רשומת שינוי מסלול רק כשהתחנות או הדרך באמת השתנו.
    החלפת מספר בלבד (אותן תחנות, אותה דרך) — שום רשומה (stats['renamed_same']); אם השתנו רק השעות,
    זה נמצא בנפרד כשינוי בלוח הזמנים (tt_change עובד לפי מק"ט-כיוון, בלי מספר החלופה)."""
    DAY = datetime.timedelta(days=1)
    found = []
    for k, (ko, F) in renamed.items():
        ov = old_v[ko]
        om = main_variant(ov)
        o_codes = [old.stops[s] for s in old.pat_list[om[0]] if s in old.stops]
        D = max(F, t0)
        win = {v: dict(x, td=sum(1 for d in x['dates'] if D <= d < D + 7 * DAY)) for v, x in new_v[k].items()}
        nm = main_variant({v: x for v, x in win.items() if x['td']})
        if nm is None:
            continue
        n_codes = [new.stops[s] for s in new.pat_list[nm[0]] if s in new.stops]
        res, minor = compare(o_codes, n_codes, {s['code']: s for s in o_codes}, {s['code']: s for s in n_codes},
                             shp_old.get(om[1], []), shp_new.get(nm[1], []))
        if not (res['added'] or res['removed'] or res['moved'] or res['geo']):
            stats['renamed_same'] = stats.get('renamed_same', 0) + 1
            print(f'חלופה שהוחלפה: {ko} ← {k} ({F}) — רק המספר, לא שינוי', flush=True)
            continue
        print(f"חלופה שהוחלפה: {ko} ← {k} ({F}) — שינוי: +{len(res['added'])} -{len(res['removed'])} תחנות, דרך {res['dev']} מ'", flush=True)
        r_new = new.routes[new_v[k][nm]['rid']]
        found.append(dict(
            rd=k, makat=k.split('-')[0], dir=(k.split('-') + ['', ''])[1], alt=(k.split('-') + ['', '', ''])[2],
            line=r_new['line'], op=new.agency.get(r_new['ag'], ''), ag=r_new['ag'], ty=r_new['ty'],
            long=r_new['long'], od=od_of(r_new['long']),
            eff=F.isoformat(), formal=None, found=t0.isoformat(), was=ko,
            was_last=max(d for x in ov.values() for d in x['dates']).isoformat(),
            # ההתאמה בין החלופות היא הסקה — כתובה בכרטיס ובמצגת
            basis=f'ההשוואה היא בין חלופה {ltr(ko)} (עד {fmt_d(max(d for x in ov.values() for d in x["dates"]).isoformat())}) '
                  f'לחלופה {ltr(k)} (מ-{fmt_d(F.isoformat())}) של אותו קו ובאותו כיוון, שהחליפה אותה.',
            old=dict(stops=[stop_arr(s) for s in o_codes], shp=encode_shape(simplify(shp_old.get(om[1], [])))),
            new=dict(stops=[stop_arr(s) for s in n_codes], shp=encode_shape(simplify(shp_new.get(nm[1], [])))),
            added=[s['code'] for s in res['added']], removed=[s['code'] for s in res['removed']],
            moved=res['moved'], geo=res['geo'], dev=res['dev'], swaps=res['swaps'], ext=res['ext'],
        ))
    return found


VAR_MIN = 3   # חלופה שבוטלה / חדשה: לפחות 3 נסיעות בשבוע (בשבוע שעבר / בשבוע הראשון שלה)


def find_variants(keys, old_v, new_v, old, new, renamed, new_mks, ended_mks, t0, stats, only=None, fresh=()):
    """חלופה שבוטלה וחלופה חדשה בקו שממשיך לנסוע (קודם נספרו רק ב-stats ונעלמו).
    חלופה שבוטלה (end): נסעה בשבוע שעבר (VAR_MIN נסיעות לפחות), ואין לה אף נסיעה מעכשיו ועד סוף החלון, והקו
    ממשיך. חלופה חדשה (new): לא נסעה בשבוע שעבר, מתחילה בתוך HORIZON, עם VAR_MIN נסיעות לפחות בשבוע הראשון.
    בלי חלופות שהוחלפו (find_renamed — שם ההשוואה היא בין הישנה לחדשה), ורק כשיש תחנות שאף חלופה אחרת של הקו
    לא עוצרת בהן (שבוטלו, או שנוספו) — כך לא נכנסים החלפת מספר בלבד, קיצור מסלול (עוד תחנות באותה דרך)
    ונסיעות שרק לא היו השבוע. ההשוואה למפה — מול החלופה הראשית של אותו כיוון (מה שנוסע מעכשיו / מה שנסע)."""
    DAY = datetime.timedelta(days=1)
    hz_end = t0 + HORIZON * DAY
    ko_set = {ko for ko, _F in renamed.values()}
    by_mk, by_dk = defaultdict(list), defaultdict(list)
    for k in keys:
        by_mk[k.split('-')[0]].append(k)
        by_dk[dir_key(k)].append(k)

    def codes(feed, vs):
        return {feed.stops[s]['code'] for pid, _ in vs for s in feed.pat_list[pid] if s in feed.stops}

    def dir_main(vmap, ks, d0, d1):
        vs = {}
        for k in ks:
            for v, x in (vmap.get(k) or {}).items():
                td = sum(1 for d in x['dates'] if d0 <= d < d1) * (x['td'] / max(1, len(x['dates'])))
                if td:
                    vs[v] = dict(x, td=td, rd=k)
        return vs

    out = []
    for k in keys:
        if only is not None and k not in only:   # only — רק החלופות האלה (ההצגה "בנפרד" של זוג), מול כל החלופות של הקו
            continue
        mk, ov, nv = k.split('-')[0], old_v.get(k), new_v.get(k)
        if mk in new_mks or mk in ended_mks:
            continue
        if ov and not nv and k not in ko_set:
            if sum(x['td'] for x in ov.values()) < VAR_MIN:
                stats['varend_few'] += 1
                continue
            rest = [x for x in by_mk[mk] if x != k and new_v.get(x)]
            if not rest:
                continue
            lost = codes(old, ov) - set().union(*[codes(new, new_v[x]) for x in rest])
            same_dir = dir_main(new_v, [x for x in by_dk[dir_key(k)] if x != k], t0, t0 + 7 * DAY) or \
                dir_main(new_v, [x for x in by_dk[dir_key(k)] if x != k], t0, hz_end + 7 * DAY)
            if not lost or not same_dir:
                stats['varend_same'] += 1
                continue
            L = max(d for x in ov.values() for d in x['dates'])
            out.append(dict(k=k, var='end', ovs=ov, nvs=same_dir, lost=lost, eff=L + DAY, last=L))
        elif nv and (not ov or only is not None) and k not in renamed:
            # בהצגה "בנפרד" של זוג: החלופה החדשה יכלה להתחיל כבר בשבוע שעבר
            F = min(d for x in list(nv.values()) + list((ov or {}).values()) for d in x['dates'])
            wk = dir_main(new_v, [k], F, F + 7 * DAY)
            if F > hz_end or sum(x['td'] for x in wk.values()) < VAR_MIN:
                stats['varnew_few'] += 1
                continue
            # fresh — החלופות החדשות של הזוגות: גם אם התחילו כבר בשבוע שעבר, הן לא "מה שהיה"
            rest = [x for x in by_mk[mk] if x != k and old_v.get(x) and x not in fresh]
            if not rest:
                continue
            lost = codes(new, nv) - set().union(*[codes(old, old_v[x]) for x in rest])
            same_dir = dir_main(old_v, [x for x in by_dk[dir_key(k)] if x != k and x not in fresh], old.d0, t0)
            if not lost or not same_dir:
                stats['varnew_same'] += 1
                continue
            per_day = defaultdict(float)
            for x in wk.values():
                for d in x['dates']:
                    if F <= d < F + 7 * DAY:
                        per_day[d] += x['td'] / sum(1 for e in x['dates'] if F <= e < F + 7 * DAY)
            n = sorted(per_day.values())[len(per_day) // 2] if per_day else 0
            n = max(1, int(round(n)))
            freq = ('נסיעה אחת ביום' if n == 1 else f'{n} נסיעות ביום') + ', ' + days_short(sorted({dow(d) for d in per_day}, key=DOWS.index))
            out.append(dict(k=k, var='new', ovs=same_dir, nvs=wk, lost=lost, eff=F, freq=freq))
    stats['varend'] = sum(1 for v in out if v['var'] == 'end')
    stats['varnew'] = sum(1 for v in out if v['var'] == 'new')
    return out


def variant_records(varis, old, new, shp_old, shp_new, t0, stats):
    """רשומות "שינוי מסלול" לחלופה שבוטלה (var=end: הישן — החלופה, החדש — החלופה הראשית של הכיוון, ומבוטלות רק
    התחנות שאף חלופה של הקו כבר לא עוצרת בהן) ולחלופה חדשה (var=new: הפוך, ונוספות רק התחנות החדשות לקו)."""
    found = []
    for v in varis:
        om, nm = main_variant(v['ovs']), main_variant(v['nvs'])
        o_codes = [old.stops[s] for s in old.pat_list[om[0]] if s in old.stops]
        n_codes = [new.stops[s] for s in new.pat_list[nm[0]] if s in new.stops]
        res, _minor = compare(o_codes, n_codes, {s['code']: s for s in o_codes}, {s['code']: s for s in n_codes},
                              shp_old.get(om[1], []), shp_new.get(nm[1], []))
        if v['var'] == 'end':
            added, removed = [], [s['code'] for s in o_codes if s['code'] in v['lost']]
        else:
            added, removed = [s['code'] for s in n_codes if s['code'] in v['lost']], []
        if not added and not removed:
            continue
        side = v['ovs'] if v['var'] == 'end' else v['nvs']
        r = (old if v['var'] == 'end' else new).routes[side[main_variant(side)]['rid']]
        k = v['k']
        rec = dict(
            rd=k, makat=k.split('-')[0], dir=(k.split('-') + ['', ''])[1], alt=(k.split('-') + ['', '', ''])[2],
            line=r['line'], op=(old if v['var'] == 'end' else new).agency.get(r['ag'], ''), ag=r['ag'], ty=r['ty'],
            long=r['long'], od=od_of(r['long']), eff=v['eff'].isoformat(), formal=None, found=t0.isoformat(), var=v['var'],
            old=dict(stops=[stop_arr(s) for s in o_codes], shp=encode_shape(simplify(shp_old.get(om[1], [])))),
            new=dict(stops=[stop_arr(s) for s in n_codes], shp=encode_shape(simplify(shp_new.get(nm[1], [])))),
            added=added, removed=removed, moved=[], geo=res['geo'], dev=res['dev'], swaps=[], ext='')
        if v.get('split_of'):
            rec['split_of'] = v['split_of']
        if v['var'] == 'end':
            rec['last'] = v['last'].isoformat()
            rec['basis'] = f"לפי לוח הזמנים: לחלופה {ltr(k)} אין נסיעות מ-{fmt_d(v['eff'].isoformat())}."
        else:
            rec['freq'] = v['freq']
            rec['basis'] = f"חלופה {ltr(k)} מופיעה לראשונה ב-{fmt_d(v['eff'].isoformat())}." 
        print(f"חלופה {'שבוטלה' if v['var'] == 'end' else 'חדשה'}: {k} ({v['eff']}) — {len(removed) or len(added)} תחנות", flush=True)
        found.append(rec)
    return found


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
            stats['new_variant'] += 1
            continue
        if not nv:
            stats['ended_variant'] += 1
            continue
        old_sigs = {(tuple(old.pat_list[p]), s) for p, s in ov}
        unknown = {v: x for v, x in nv.items() if (tuple(new.pat_list[v[0]]), v[1]) not in old_sigs}
        firsts = sorted({min(x['dates']) for x in unknown.values()
                         if min(x['dates']) <= t0 + datetime.timedelta(days=HORIZON)})
        if not firsts:
            stats['same'] += 1
            continue
        cands[k] = firsts

    # חלופה שהוחלפה במק"ט-כיוון-חלופה אחר (למשל 10970-1-# ← 10970-1-0, ב-17.11.2026): לכל אחד מהם לבד זה
    # "וריאנט שנגמר" ו"וריאנט חדש", ושום שינוי לא נמצא. כשהחלופה החדשה מתחילה עד 4 ימים אחרי שהישנה הפסיקה
    # (גם אם זה כבר קרה בשבוע שעבר) — משווים את הישנה (השבוע שעבר) לחדשה (מה שנוסע מעכשיו); התאריך — היום
    # הראשון של החלופה החדשה. שינוי שכבר התחיל נשמר אחר כך עם השאר (keep_prev).
    renamed = find_renamed(keys, old_v, new_v, old, t0, new)
    for k in renamed:
        cands.pop(k, None)
    stats['renamed'] = len(renamed)

    # קו חדש / קו מבוטל — לפי מק"ט (כל הכיוונים והחלופות יחד)
    DAY = datetime.timedelta(days=1)
    week_end, hz_end = t0 + 7 * DAY, t0 + HORIZON * DAY
    old_mk, new_mk = defaultdict(list), defaultdict(list)
    for k in keys:
        if k in old_v:
            old_mk[k.split('-')[0]].append(k)
        if k in new_v:
            new_mk[k.split('-')[0]].append(k)

    def route_of(feed, vs):
        return feed.routes[next(iter(vs.values()))['rid']]

    def mk_dates(vmap, ks):
        out = set()
        for k in ks:
            for x in vmap[k].values():
                out |= x['dates']
        return out

    new_mks, ended_mks = {}, {}
    for mk, ks in new_mk.items():
        r = route_of(new, new_v[ks[0]])
        if r['ty'] == '2' or not r['line']:
            continue
        nd = mk_dates(new_v, ks)
        if mk in old_mk:
            # קו שהתחיל באמצע השבוע שעבר: בימים הראשונים של השבוע לא נסע, אף שבימים מהסוג הזה הוא נוסע עכשיו
            F = min(mk_dates(old_v, old_mk[mk]))
            runs = {d.weekday() for d in nd if d < week_end}
            if sum(1 for i in range((F - old.d0).days) if (old.d0 + DAY * i).weekday() in runs) < 2:   # יום אחד בלי נסיעות — לא מספיק
                continue
            stats['new_started'] += 1
            S = F
        else:
            S = min(nd)
        if S > week_end:          # מתחיל רק בעוד יותר משבוע — ייכנס בריצה של שבוע הבא
            stats['new_later'] += 1
            continue
        new_mks[mk] = (ks, S)
    for mk, ks in old_mk.items():
        r = route_of(old, old_v[ks[0]])
        if r['ty'] == '2' or not r['line']:
            continue
        nd = mk_dates(new_v, new_mk[mk]) if mk in new_mk else set()
        if nd and max(nd) >= week_end:
            continue
        # אין אף נסיעה מעכשיו ועד סוף החלון (שבועיים ועוד שבוע), או שהנסיעה האחרונה בשבוע הקרוב ואחריה אין כלום
        L = max(nd) if nd else max(mk_dates(old_v, ks))
        ended_mks[mk] = (ks, L, bool(nd))
    stats['new_line'] = len(new_mks)
    stats['ended_line'] = len(ended_mks)
    print(f'קווים חדשים: {len(new_mks)} · קווים שמבוטלים: {len(ended_mks)}', flush=True)
    varis = find_variants(keys, old_v, new_v, old, new, renamed, new_mks, ended_mks, t0, stats)
    # ההתאמה בין חלופה שהופסקה לחלופה שהתחילה היא הסקה — מי שמכין את המצגת מחליט. לכן לכל זוג גם הצגה "בנפרד":
    # החלופה הישנה כחלופה שבוטלה והחדשה כחלופה חדשה (split_of — מק"ט-כיוון-חלופה החדש של הזוג)
    pair_of = {}
    for k, (ko, _F) in renamed.items():
        pair_of.setdefault(ko, k)
        pair_of[k] = k
    split = find_variants(keys, old_v, new_v, old, new, {}, new_mks, ended_mks, t0, defaultdict(int), only=set(pair_of), fresh=set(renamed))
    for v in split:
        v['split_of'] = pair_of[v['k']]

    def dir_main(vmap, ks, d0=None, d1=None):
        """לכל כיוון (מק"ט-כיוון): הדפוס הראשי מכל החלופות, בטווח התאריכים"""
        out = defaultdict(dict)
        for k in ks:
            for v, x in vmap[k].items():
                td = sum(1 for d in x['dates'] if (d0 is None or d0 <= d) and (d1 is None or d < d1))
                if td:
                    y = out[dir_key(k)].setdefault(v, dict(x, td=0))
                    y['td'] += td
        return {dk: (main_variant(vs), vs) for dk, vs in out.items()}

    new_main = {mk: dir_main(new_v, ks, max(S, t0), max(S, t0) + 7 * DAY) for mk, (ks, S) in new_mks.items()}
    ended_main = {mk: dir_main(old_v, ks) for mk, (ks, L, _) in ended_mks.items()}

    # שרטוטים — רק לווריאנטים שיש בהם דפוס חדש, ולקווים החדשים והמבוטלים
    need_old, need_new = set(), set()
    for k in cands:
        need_old |= {s for _, s in old_v[k]}
        need_new |= {s for _, s in new_v[k]}
    for k, (ko, F) in renamed.items():
        need_old |= {s for _, s in old_v[ko]}
        need_new |= {s for _, s in new_v[k]}
    for dm in new_main.values():
        need_new |= {m[1] for m, _ in dm.values()}
    for dm in ended_main.values():
        need_old |= {m[1] for m, _ in dm.values()}
    for v in varis + split:
        need_old |= {s for _, s in v['ovs']}
        need_new |= {s for _, s in v['nvs']}
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
            moved=res['moved'], geo=res['geo'], dev=res['dev'], swaps=res['swaps'], ext=res['ext'],
        ))
    found += rename_records(renamed, old_v, new_v, old, new, shp_old, shp_new, t0, stats)
    found += variant_records(varis, old, new, shp_old, shp_new, t0, stats)
    found += variant_records(split, old, new, shp_old, shp_new, t0, defaultdict(int))
    stats['changed'] = len(found)

    # ---- לוחות זמנים: יציאות מהתחנה הראשונה, לכל מק"ט-כיוון (כל החלופות יחד)
    old_deps, new_deps = old.deps_by(dir_key), new.deps_by(dir_key)
    ref_days = []
    d = old.d0
    while d <= old.d1:
        ref_days.append(d)
        d += DAY

    def week_tt(svcs, S):
        days = []
        d = S
        while d <= new.d1:
            days.append(d)
            d += DAY
        return day_groups(None, wk_typical(new, svcs, days))

    # קו חדש
    for mk, (ks, S) in new_mks.items():
        for dk, (nm, vs) in sorted(new_main[mk].items()):
            x = vs[nm]
            r = new.routes[x['rid']]
            S_d = max(S, min(d for v in vs.values() for d in v['dates'])) if S >= t0 else S
            wg = week_tt(new_deps.get(dk, {}), max(S_d, t0))
            hx = hol_lists(new, new_deps.get(dk, {}), t0, max(S_d, t0), {w: n for ws, _o, n in wg for w in ws})
            found.append(kind_rec(dk, 'new', r, new.agency.get(r['ag'], ''), S_d, t0,
                                  new=side_of(new, nm[0], shp_new, nm[1]), tt=tt_entries(wg), **({'hx': hx} if hx else {})))
    # קו מבוטל: קווים אחרים שעוצרים באותן תחנות (בשבוע השני — אחרי שהקו כבר לא נוסע)
    cand_index, mk_route = defaultdict(set), {}
    for k, vs in new_v.items():
        mk = k.split('-')[0]
        for (pid, _s), x in vs.items():
            if not any(week_end <= d <= hz_end for d in x['dates']):
                continue
            r = new.routes[x['rid']]
            if r['ty'] == '2' or not r['line']:
                continue
            if mk not in mk_route or k.split('-')[1:2] == ['1']:
                mk_route[mk] = r
            for sid in new.pat_list[pid]:
                st = new.stops.get(sid)
                if st:
                    cand_index[st['code']].add(mk)
    for mk, (ks, L, soon) in ended_mks.items():
        codes, names = [], {}
        for dk, (om, vs) in sorted(ended_main[mk].items()):
            for st in stops_of(old, om[0]):
                if st['code'] not in names:
                    codes.append(st['code'])
                    names[st['code']] = st['name']
        alts = []
        for amk, n, i in find_alts(codes, cand_index, {mk} | set(ended_mks)):
            ar = mk_route[amk]
            alts.append(dict(makat=amk, line=ar['line'], op=new.agency.get(ar['ag'], ''), od=od_of(ar['long']),
                             n=n, tot=len(codes), s=names[codes[i]], code=codes[i]))
        for dk, (om, vs) in sorted(ended_main[mk].items()):
            r = old.routes[vs[om]['rid']]
            found.append(kind_rec(dk, 'ended', r, old.agency.get(r['ag'], ''), L + DAY, t0,
                                  old=side_of(old, om[0], shp_old, om[1]), last=L.isoformat(), soon=soon, alts=alts))

    # שינוי בלוח הזמנים: אותו מסלול, לוח זמנים אחר (לא בקווים שיש בהם שינוי מסלול, חדשים או מבוטלים)
    skip_dk = {dir_key(f['rd']) for f in found}
    keys_of = defaultdict(list)
    for k in keys:
        if k in new_v:
            keys_of[dir_key(k)].append(k)
    tt_n = 0
    for dk in sorted(set(old_deps) & set(new_deps)):
        mk = dk.split('-')[0]
        if dk in skip_dk or mk in new_mks or mk in ended_mks:
            continue
        ks = keys_of.get(dk)
        if not ks:
            continue
        r = route_of(new, new_v[ks[0]])
        if r['ty'] == '2' or not r['line']:
            continue
        res, why = tt_change(old, new, old_deps[dk], new_deps[dk], ref_days, t0, new.d1)
        if not res:
            if why != 'same':
                filtered['tt_' + why] += 1
            continue
        eff, groups, changed = res
        om = dir_main(old_v, [k for k in ks if k in old_v])
        nm = dir_main(new_v, ks, eff, eff + 7 * DAY)
        if dk not in nm:
            continue
        nmv, nvs = nm[dk]
        r = new.routes[nvs[nmv]['rid']]
        # קבוצות הימים שיש בהן שינוי משמעותי; "same" — ימים שהקו נוסע בהם בלי שינוי
        ent = tt_entries(changed)
        chw = {w for g in changed for w in g[0]}
        same = [w for g in groups if g not in changed and (g[1] or g[2]) for w in g[0] if w not in chw]
        if len(changed) > 1 or any(len(g[0]) not in (1, 5) or (len(g[0]) == 1 and g[0][0] not in ('d5', 'd6')) for g in changed):
            stats['tt_split'] += 1
        omv = om.get(dk)
        # לטבלת הלו"ז של כמה קווים: גם השעות בימים שלא משתנים (keep), ותאריכי חג בשבוע הקרוב עם שעות אחרות (hx)
        keep = [dict(t=g[0], n=g[2]) for g in groups if g not in changed and g[2]]
        hx = hol_lists(new, new_deps[dk], t0, eff, {w: g[2] for g in groups for w in g[0]})
        found.append(kind_rec(dk, 'timetable', r, new.agency.get(r['ag'], ''), eff, t0,
                              old=side_of(old, omv[0][0], {}, '', full=False) if omv else None,
                              new=side_of(new, nmv[0], {}, '', full=False), tt=ent, same=same, keep=keep, **({'hx': hx} if hx else {}),
                              cities=sorted({st['city'] for st in stops_of(new, nmv[0]) if st['city']})))
        tt_n += 1
    stats['timetable'] = tt_n
    print('סטטיסטיקה:', dict(stats), '· סוננו:', dict(filtered), flush=True)
    current_tts(new, t0)
    ended_lines = {k: old_v[k] for mk, (ks, L, s) in ended_mks.items() for k in ks}
    return found, dict(stats), dict(filtered), new.day, old.day, lines_index(new, new_v, (old, ended_lines))


# ---------------------------------------------------------------- לו"ז עדכני לכל קו (גם בלי שינוי)

TT_SHARDS = 64      # הלו"ז של כל הקווים מחולק לקבצים לפי מק"ט % 64 — הדף טוען רק את הקובץ של הקו שנבחר
NIGHT = 180         # נסיעה לפני 03:00 שייכת לערב הקודם ("בלילה"): נשמרת ברשימה של היום שלפני, ב-1440 ומעלה
TT_DAYS = 7         # הלו"ז של השבוע הקרוב


def tt_shard(makat):
    m = re.sub(r'\D', '', makat)
    return int(m) % TT_SHARDS if m else sum(map(ord, makat)) % TT_SHARDS


def hol_week(t0, n=TT_DAYS):
    """החגים בשבוע הקרוב: [[תאריך, סוג, שם העמודה]]"""
    return [[h[0].isoformat(), h[1], hebcal.label(h[1], h[2])]
            for h in hebcal.holidays(t0, t0 + datetime.timedelta(days=n - 1))]


def hol_lists(feed, svcs, t0, eff, by_dow):
    """תאריכי חג בשבוע הקרוב (מ-eff) שבהם היציאות שונות מהלו"ז הרגיל של אותו יום בשבוע → {תאריך: יציאות}"""
    out = {}
    for iso, _k, _n in hol_week(t0):
        d = datetime.date.fromisoformat(iso)
        if d < eff:
            continue
        lst = feed.day_deps(svcs, d)
        if lst != by_dow.get(dow(d), []):
            out[iso] = lst
    return out


def current_tts(feed, t0):
    """הלו"ז העדכני של כל קווי האוטובוס, לשבוע הקרוב: לכל מק"ט ולכל כיוון — היציאות מהתחנה הראשונה לכל יום בשבוע
    (יום רגיל: התאריך הקרוב שאינו חג או ערב חג), ובתאריכי חג בשבוע הקרוב — רק אם השעות שונות מהיום הרגיל.
    נכתב ל-data/tt/NN.json (מק"ט % 64). קו = {l: מספר, a: agency_id, o: חברה, d: {כיוון: {...}}}
    כיוון = {od: [מוצא, יעד], f/t: התחנה הראשונה/האחרונה, cs: הערים לאורך הדרך, du: משך נסיעה טיפוסי (דק'),
             w: [7 אינדקסים ל-L, ראשון..שבת], x: {תאריך חג: אינדקס}, L: רשימות יציאות (דקות; בלילה — 1440+)}"""
    DAY = datetime.timedelta(days=1)
    hol = {h[0] for h in hebcal.holidays(t0 - DAY, feed.d1)}
    week = [t0 + DAY * i for i in range(TT_DAYS)]
    trips = defaultdict(lambda: defaultdict(list))   # (ag, מק"ט, כיוון) → service → [(יציאה, משך)]
    pats = defaultdict(lambda: defaultdict(int))
    for tid, (rid, sv, _shp) in feed.trips.items():
        r = feed.routes[rid]
        if r['ty'] not in ('3', '715') or not r['line']:    # רק אוטובוסים (715 — קו בהזמנה)
            continue
        dep = feed.trip_dep.get(tid)
        if dep is None:
            continue
        end = feed.trip_end.get(tid)
        mk, _, rest = (r['rd'] or rid).partition('-')
        key = (r['ag'], mk, rest.split('-')[0])
        trips[key][sv].append((dep, end - dep if end is not None and end >= dep else None))
        pats[key][(feed.trip_pat.get(tid), rid)] += len(feed.svc_dates[sv])

    def day_list(svcs, d):
        """היציאות של יום שירות: מ-03:00, ועוד הנסיעות שלפני 03:00 של למחרת (בסוף, 1440+)"""
        a, b = [], []
        for sv, lst in svcs.items():
            ss = feed.svc_set.get(sv, ())
            if d in ss:
                a += [x[0] for x in lst if x[0] >= NIGHT]
            if d + DAY in ss:
                b += [x[0] + 1440 for x in lst if x[0] < NIGHT]
        return sorted(a + b)

    shards = defaultdict(dict)
    n_dirs = 0
    for key in sorted(trips):
        ag, mk, dr = key
        svcs = trips[key]
        usual = {}
        for d in week:
            alt = next((x for x in (d, d + 7 * DAY, d + 14 * DAY) if x not in hol and x + DAY <= feed.d1), d)
            usual[dow(d)] = day_list(svcs, alt)
        if not any(usual.values()):
            continue
        L, ix = [], {}

        def idx(lst):
            k = tuple(lst)
            if k not in ix:
                ix[k] = len(L)
                L.append(lst)
            return ix[k]
        w = [idx(usual[x]) for x in DOWS]
        x = {}
        for d in week:
            if d in hol:
                lst = day_list(svcs, d)
                if lst != usual[dow(d)]:
                    x[d.isoformat()] = idx(lst)
        (pid, rid), _n = max(pats[key].items(), key=lambda kv: kv[1])
        r = feed.routes[rid]
        st = stops_of(feed, pid) if pid is not None else []
        cs = []
        for s0 in st:
            if s0['city'] and (not cs or cs[-1] != s0['city']):
                cs.append(s0['city'])
        durs = sorted(du for lst in svcs.values() for _d, du in lst if du)
        rec = dict(od=od_of(r['long']), f=st[0]['name'] if st else '', t=st[-1]['name'] if st else '', cs=cs,
                   du=durs[len(durs) // 2] if durs else None, w=w, L=L)
        if x:
            rec['x'] = x
        sh = shards[tt_shard(mk)]
        e = sh.get(mk)
        if e and e['a'] != ag:     # אותו מק"ט בשתי חברות (נדיר) — נשאר הקו עם יותר נסיעות
            if sum(map(len, e['d'].get(dr, {}).get('L', []))) >= sum(map(len, L)):
                continue
            e = None
        if not e:
            e = sh[mk] = dict(l=r['line'], a=ag, o=feed.agency.get(ag, ''), d={})
        e['d'][dr] = rec
        n_dirs += 1
    out = os.path.join(OUTDIR, 'data', 'tt')
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    size = 0
    hw = hol_week(t0)
    for i in range(TT_SHARDS):
        fn = os.path.join(out, f'{i}.json')
        json.dump(dict(gen=TODAY.isoformat(), feed=feed.day.isoformat(), valid=t0.isoformat(), hol=hw, lines=shards.get(i, {})),
                  open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        size += os.path.getsize(fn)
    print(f'לו"ז עדכני: {sum(len(v) for v in shards.values())} קווים · {n_dirs} כיוונים · {size // 1024} KB ב-{TT_SHARDS} קבצים', flush=True)


def lines_index(feed, variants, extra=None):
    """כל הקווים שפועלים בימים הקרובים — לחיפוש בדף (מספר, חברה, מוצא, יעד, ערים).
    extra = (GTFS של השבוע שעבר, הווריאנטים של הקווים שמבוטלים) — כדי שגם אותם אפשר למצוא.
    פורמט דחוס: ops/cities הן רשימות, ובכל קו אינדקסים אליהן.
    קו = [מק"ט, מספר, חברה, מוצא, יעד, [ערים], [כיוון-חלופה...], סוג, (שינויים מהשבועיים האחרונים — add_past)]"""
    by = {}
    for fd, vmap in [(feed, variants)] + ([extra] if extra else []):
      for rd, vs in vmap.items():
        rid = next(iter(vs.values()))['rid']
        r = fd.routes[rid]
        if not r['line'] or r['ty'] == '2':      # רכבת ישראל — לא כאן
            continue
        makat, _, rest = rd.partition('-')
        if fd is not feed and (r['ag'], makat) in by and not by[(r['ag'], makat)].get('x'):
            continue
        e = by.setdefault((r['ag'], makat), {'line': r['line'], 'ag': r['ag'], 'od': None, 'cities': {}, 'rds': set(), 'ty': r['ty'], 'sids': set(),
                                             'opn': fd.agency.get(r['ag'], ''), 'x': fd is not feed})
        e['rds'].add(rest)
        if e['od'] is None or rest.startswith('1-'):
            e['od'] = od_of(r['long'])
        for (pid, _shp), x in vs.items():
            e['sids'].update(fd.pat_list[pid])
            for sid in fd.pat_list[pid]:
                st = fd.stops.get(sid)
                if st and st['city']:
                    e['cities'][st['city']] = e['cities'].get(st['city'], 0) + x['td']
    ops, cities, op_ids = [], [], []   # op_ids: agency_id לכל חברה (לצבעי המפעיל במצגת)
    oi, ci = {}, {}
    out = []
    for (ag, makat), e in sorted(by.items(), key=lambda kv: (int(re.sub(r'\D', '', kv[1]['line']) or 0), kv[1]['line'], kv[0][1])):
        op = feed.agency.get(ag, '') or e['opn']
        if op not in oi:
            oi[op] = len(ops); ops.append(op); op_ids.append(ag)
        cl = []
        for c, _ in sorted(e['cities'].items(), key=lambda kv: -kv[1]):
            if c not in ci:
                ci[c] = len(cities); cities.append(c)
            cl.append(ci[c])
        out.append([makat, e['line'], oi[op], e['od'][0], e['od'][1], cl, sorted(e['rds']), e['ty']])
    print(f'{len(out)} קווים באינדקס', flush=True)
    places = places_index(feed, [e for _, e in sorted(by.items(), key=lambda kv: (int(re.sub(r'\D', '', kv[1]['line']) or 0), kv[1]['line'], kv[0][1]))], cities, ci)
    return {'ops': ops, 'op_ids': op_ids, 'cities': cities, 'lines': out, '_places': places}


def load_hoods(d):
    """שכונות: הפוליגונים הרשמיים (GovMap שכבה 22) שכבר שמורים ב-line-history/data/neighborhoods"""
    import gzip
    rows = []
    if not d or not os.path.isdir(d):
        return rows
    for fn in sorted(os.listdir(d)):
        if fn.endswith('.json.gz'):
            rows += json.loads(gzip.decompress(open(os.path.join(d, fn), 'rb').read()))
    return rows


def _in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def places_index(feed, entries, cities, ci):
    """רחובות ושכונות → אילו קווים עוצרים בהם (אינדקס בתוך רשימת הקווים).
    רחוב: מתיאור התחנה ב-GTFS. שכונה: הפוליגון הרשמי שהתחנה בתוכו (NBR_DIR)."""
    hoods = load_hoods(os.environ.get('NBR_DIR', 'line-history/data/neighborhoods'))
    grid = defaultdict(list)
    for hi, h in enumerate(hoods):
        x0, y0, x1, y1 = h[3]
        for gx in range(int(x0 * 50), int(x1 * 50) + 1):
            for gy in range(int(y0 * 50), int(y1 * 50) + 1):
                grid[(gx, gy)].append(hi)
    hood_of = {}

    def hood(sid):
        if sid in hood_of:
            return hood_of[sid]
        st = feed.stops.get(sid)
        res = None
        if st:
            la, lo = st['ll']
            for hi in grid.get((int(lo * 50), int(la * 50)), ()):
                h = hoods[hi]
                x0, y0, x1, y1 = h[3]
                if x0 <= lo <= x1 and y0 <= la <= y1 and any(_in_ring(lo, la, poly[0]) and not any(_in_ring(lo, la, hole) for hole in poly[1:]) for poly in h[4]):
                    res = hi
                    break
        hood_of[sid] = res
        return res

    streets, hds = defaultdict(set), defaultdict(set)
    for li, e in enumerate(entries):
        for sid in e['sids']:
            st = feed.stops.get(sid)
            if not st or not st['city']:
                continue
            if st['street']:
                streets[(st['street'], st['city'])].add(li)
            hi = hood(sid)
            if hi is not None and hoods[hi][1].strip():
                hds[(hoods[hi][1].strip(), st['city'])].add(li)

    def cidx(c):
        if c not in ci:
            ci[c] = len(cities); cities.append(c)
        return ci[c]
    out_s = [[n, cidx(c), sorted(v)] for (n, c), v in sorted(streets.items())]
    out_h = [[n, cidx(c), sorted(v)] for (n, c), v in sorted(hds.items())]
    print(f'{len(out_s)} רחובות · {len(out_h)} שכונות ({len(hoods)} פוליגונים)', flush=True)
    return {'streets': out_s, 'hoods': out_h}


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
                mv=len({m['code'] for x in dirs for m in x['moved']}),
                ext=ext_all(dirs))


def same_sig(dirs, day):
    """חתימה לשינוי קטן בלי שינוי בדרך (עד 3 תחנות): קווים עם אותה חתימה — אותו שינוי בדיוק. אחרת ''"""
    if any(x['geo'] for x in dirs):
        return ''
    add = sorted({c for x in dirs for c in x['added']})
    rem = sorted({c for x in dirs for c in x['removed']})
    mv = sorted({m['code'] for x in dirs for m in x['moved']})
    if not add + rem + mv or len(add) + len(rem) + len(mv) > 3:
        return ''
    return f"{day}|{','.join(add)}|{','.join(rem)}|{','.join(mv)}"


def ext_all(dirs):
    """הקו רק מתארך (בכל הכיוונים שמשתנים): 'start' / 'end' / 'both', אחרת ''"""
    e = {x.get('ext') or '' for x in dirs}
    if '' in e or not e:
        return ''
    return e.pop() if len(e) == 1 else 'both'


def summary_line(t):
    """סיכום קצר בשפה של נוסעים (לתצוגה המקדימה בווטסאפ)"""
    parts = []
    if t.get('ext'):
        parts.append({'start': 'הקו מתחיל מוקדם יותר', 'end': 'הקו ממשיך יותר רחוק'}.get(t['ext'], 'הקו מתארך'))
    elif t['geo']:
        parts.append('הקו נוסע בדרך אחרת')
    if t['rem']:
        parts.append(f"{t['rem']} תחנות מבוטלות" if t['rem'] > 1 else 'תחנה אחת מבוטלת')
    if t['add']:
        parts.append(f"{t['add']} תחנות חדשות" if t['add'] > 1 else 'תחנה חדשה אחת')
    if t['mv']:
        parts.append(f"{t['mv']} תחנות עוברות מקום" if t['mv'] > 1 else 'תחנה אחת עוברת מקום')
    return ' · '.join(parts)


# ---------- זמן הליכה לתחנה הקרובה ----------
# לכל תחנה שמבוטלת: עד WALK_CANDS תחנות במסלול החדש שהכי קרובות בקו אווירי, ומהן — זו שהכי קצר להגיע אליה ברגל
# לפי מפת הרחובות (OpenStreetMap, שירות המסלולים להולכי רגל של FOSSGIS). התוצאות נשמרות ב-data/walk.json
# כדי שכל זוג תחנות יחושב פעם אחת בלבד. אם השירות לא זמין — אין שדה walk, והמצגת משתמשת בהערכה בקו אווירי.
WALK_URL = os.environ.get('WALK_URL', 'https://routing.openstreetmap.de/routed-foot')
WALK_CANDS = 4
WALK_AIR_MAX = 1000   # מ' — מועמדת רחוקה יותר בקו אווירי לא נבדקת
WALK_MAX = 900        # מ' הליכה — מעבר לזה: "אין תחנה קרובה במסלול החדש"
WALK_BUDGET = int(os.environ.get('WALK_BUDGET', '1200'))   # שניות לכל הבקשות בריצה אחת (בקשה לוקחת כ-10 שניות); מה שלא הספיק — בלילה הבא


def walk_key(a, b):
    return f"{a[0]}@{a[2]:.5f},{a[3]:.5f}>{b[0]}@{b[2]:.5f},{b[3]:.5f}"


def walk_table(src, dests):
    """מרחקי הליכה (מ') מתחנה אחת לכמה תחנות, בבקשה אחת. None כשאין מסלול."""
    import urllib.request
    pts = ';'.join(f'{s[3]},{s[2]}' for s in [src] + dests)
    url = f'{WALK_URL}/table/v1/driving/{pts}?sources=0&annotations=distance'
    req = urllib.request.Request(url, headers={'User-Agent': 'kavbochan-line-changes/1.0 (nightly, cached)'})
    r = json.load(urllib.request.urlopen(req, timeout=20))
    if r.get('code') != 'Ok':
        raise RuntimeError(r.get('code'))
    return [None if v is None else int(round(v)) for v in r['distances'][0][1:]]


def add_walks(found, data):
    if os.environ.get('WALK', '1') == '0':
        return
    import time
    path = os.path.join(data, 'walk.json')
    try:
        cache = json.load(open(path, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        cache = {}
    used, t_end, calls, fails = {}, time.time() + WALK_BUDGET, 0, 0
    for f in found:
        old = {s[0]: s for s in f['old']['stops']}
        news = f['new']['stops']
        walk = {}
        for code in f['removed']:
            s = old.get(code)
            if not s:
                continue
            cands = sorted((n for n in news if n[0] != code), key=lambda n: dist_m((s[2], s[3]), (n[2], n[3])))[:WALK_CANDS]
            cands = [n for n in cands if dist_m((s[2], s[3]), (n[2], n[3])) <= WALK_AIR_MAX]
            if not cands:
                walk[code] = {'none': 1}
                continue
            keys = [walk_key(s, n) for n in cands]
            miss = [n for n, k in zip(cands, keys) if k not in cache]
            if miss and time.time() < t_end and fails < 5:
                try:
                    calls += 1
                    for n, m in zip(miss, walk_table(s, miss)):
                        cache[walk_key(s, n)] = -1 if m is None else m
                    time.sleep(1)
                except Exception as e:  # noqa: BLE001
                    fails += 1
                    print('הליכה: שגיאה', e, flush=True)
            if any(k not in cache for k in keys):
                continue   # לא חושב — בלי walk לתחנה הזו (המצגת משתמשת בהערכה)
            for k in keys:
                used[k] = cache[k]
            best = min(((cache[k], n) for n, k in zip(cands, keys) if cache[k] >= 0), default=None, key=lambda x: x[0])
            walk[code] = {'none': 1} if not best or best[0] > WALK_MAX else {'to': best[1][0], 'm': best[0]}
        if walk:
            f['walk'] = walk
        else:
            f.pop('walk', None)
    # נשמרים רק הזוגות שבשימוש עכשיו — הקובץ לא גדל עם הזמן
    json.dump(used, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'הליכה: {calls} בקשות, {fails} שגיאות, {len(used)} זוגות', flush=True)


KIND_SUFFIX = {'new': '-n', 'ended': '-e', 'timetable': '-t'}


def kind_summary(kd, dirs):
    """סיכום קצר בשפה של נוסעים לסוגים החדשים"""
    if kd == 'new':
        return 'קו חדש'
    if kd == 'ended':
        return 'הקו מבוטל'
    words = {}
    for w in DOWS:
        dn = [0, 0]
        for f in dirs:
            for e in f.get('tt', []):
                if w in e['t']:
                    dn[0] += e['so']['n']
                    dn[1] += e['sn']['n']
        if dn == [0, 0]:
            continue
        x = 'יותר נסיעות' if dn[1] > dn[0] else 'פחות נסיעות' if dn[1] < dn[0] else 'שעות אחרות'
        if not dn[0]:
            x = 'נסיעות חדשות'
        elif not dn[1]:
            x = 'בלי נסיעות'
        words.setdefault(x, []).append(w)
    parts = [f'{x} {day_in(ws)}' for x, ws in sorted(words.items(), key=lambda kv: DOWS.index(kv[1][0]))]
    return 'שינוי בלוח הזמנים' + (': ' + ', '.join(parts[:2]) if parts else '')


def keep_prev(found, prev, t0, keep_from, keep_all=False):
    """השינויים מהריצות הקודמות (prev) שכבר נכנסו לתוקף, בחלון של KEEP_DAYS ימים, נשארים עם כל הפרטים.
    שינוי שהתחיל לא יימצא שוב כשה-GTFS של השבוע שעבר כבר כולל אותו. אבל כשה-GTFS של השבוע שעבר
    עוד לא ידע עליו (פורסם באיחור), הוא "יימצא" שוב בכל לילה עם התאריך של היום. אם המצב "אחרי" זהה
    (אותן תחנות; בלו"ז — אותו לוח חדש) — זה אותו שינוי: נשאר הרישום הקודם, עם התאריך המקורי ומזהה הדף.
    ואם היום נמצא אותו מצב "אחרי" עם תאריך מוקדם יותר — נשאר הרישום של היום.
    שינוי אחר באותו כיוון (קרוב, או למצב אחר) — נשמר לצידו."""
    kind = lambda f: f.get('kind') or 'route'   # noqa: E731
    codes = lambda f: [s[0] for s in (f.get('new') or {}).get('stops', [])]   # noqa: E731
    sn = lambda f: [e.get('sn') for e in f.get('tt', [])]   # noqa: E731
    seen = {(f['rd'], kind(f), f['eff']) for f in found}
    drop = set()
    keep = []
    for p in sorted(prev, key=lambda p: p['eff']):
        key = (p['rd'], kind(p))
        if (key + (p['eff'],)) in seen or not (keep_all or keep_from <= p['eff'] < t0):
            continue
        same = [i for i, f in enumerate(found) if (f['rd'], kind(f)) == key and f['eff'] <= t0 and f.get('found', t0) >= t0
                and (kind(p) != 'route' or codes(f) == codes(p)) and (kind(p) != 'timetable' or sn(f) == sn(p))]
        if any(found[i]['eff'] <= p['eff'] for i in same):
            continue   # נמצא היום עם תאריך מוקדם יותר (למשל חלופה שהוחלפה) — הרישום של היום מחליף את הקודם
        drop.update(same)
        keep.append(p)
        seen.add(key + (p['eff'],))
    return [f for i, f in enumerate(found) if i not in drop] + keep


ALIAS_DAYS = 30   # מזהה של דף שהשתנה או ירד — קישורים ישנים ממשיכים לעבוד 30 יום


def make_alias(prev_pages, prev_alias, new_pages, index, t0):
    """קישורים ישנים: {מזהה ישן: [מזהה חדש או None, תאריך]}. מזהה שהיה אתמול ואין היום (התאריך שלו
    השתנה, או שהשינוי ירד) — המזהה החדש: באותו מק"ט ובאותו סוג, עם כיוון משותף (ואחרת — כל סוג עם כיוון משותף,
    למשל שינוי בלו"ז שהתברר כשינוי מסלול). אין כזה — None, והדף מציג את הקו. נשמר ALIAS_DAYS ימים, עם הכינויים
    מהריצות הקודמות; כינוי שהיעד שלו ירד היום — מצביע על היעד החדש של היעד."""
    suf = lambda i: (re.match(r'^\d+-\d{8}(-[netv])?$', i) or [None, None])[1] or ''   # noqa: E731
    dk = lambda rds: {dir_key(r) for r in rds}   # noqa: E731
    by_mk = defaultdict(list)
    for r in index:
        by_mk[r['makat']].append(r['id'])

    def succ(old, info):
        mk, sx = old.split('-')[0], suf(old)
        cands = [i for i in by_mk.get(mk, []) if dk(new_pages[i]) & dk(info.get('rds', []))]
        same = [i for i in cands if suf(i) == sx] or cands
        if not same and not info.get('rds'):
            same = [i for i in by_mk.get(mk, []) if suf(i) == sx]
        e = info.get('eff') or ''
        return min(same, key=lambda i: (abs(int(i.split('-')[1]) - int((e or '0').replace('-', '') or 0)), i)) if same else None

    keep_from = (datetime.date.fromisoformat(t0) - datetime.timedelta(days=ALIAS_DAYS)).isoformat()
    out = {}
    for old, info in prev_pages.items():
        if old not in new_pages:
            out[old] = [succ(old, info), t0]
    for old, (to, d) in prev_alias.items():
        if old in new_pages or old in out or d < keep_from:
            continue
        if to and to not in new_pages:
            to = out.get(to, [None])[0] or succ(to, prev_pages.get(to, {}))
        out[old] = [to, d]
    return out


def write_out(found, stats, filtered, new_day, old_day, lines=None, keep_all=False):
    data = os.path.join(OUTDIR, 'data')
    os.makedirs(os.path.join(data, 'l'), exist_ok=True)
    # השינויים מהריצות הקודמות — מקובצי הדפים עצמם (אין קובץ מצב נפרד)
    prev, prev_pages = [], {}
    for fn in sorted(os.listdir(os.path.join(data, 'l'))):
        if fn.endswith('.json'):
            try:
                dd = json.load(open(os.path.join(data, 'l', fn), encoding='utf-8'))
                prev += dd.get('dirs', []) + dd.get('split', [])
                prev_pages[fn[:-5]] = dict(eff=dd.get('eff', ''), rds=[x['rd'] for x in dd.get('dirs', [])])
            except Exception:  # noqa: BLE001
                pass
    try:
        prev_alias = json.load(open(os.path.join(data, 'index.json'), encoding='utf-8')).get('alias', {})
    except Exception:  # noqa: BLE001
        prev_alias = {}
    if os.path.exists(os.path.join(data, 'state.json')):
        os.remove(os.path.join(data, 'state.json'))
    t0 = TODAY.isoformat()
    keep_from = (TODAY - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    found = keep_prev(found, prev, t0, keep_from, keep_all)
    # ההצגה "בנפרד" של זוג חלופות (split_of) — לא דף משלה, אלא חלק מהדף של הזוג (שדה split)
    splits = [f for f in found if f.get('split_of')]
    found = [f for f in found if not f.get('split_of')]
    found = [f for f in found if f.get('ty') != '2' and f.get('line')]   # רכבת ישראל — לא בכלי הזה
    found.sort(key=lambda f: (f['eff'], f['makat'], f['dir']))
    add_walks(found + splits, data)
    if lines is not None:
        places = lines.pop('_places', None)
        json.dump(dict(gen=t0, feed=new_day.isoformat(), **lines), open(os.path.join(data, 'lines.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        if places:
            # רחובות ושכונות — קובץ נפרד שנטען רק כשמחפשים מילים (אינדקס הערים זהה לזה של lines.json)
            json.dump(dict(gen=t0, cities=lines['cities'], **places), open(os.path.join(data, 'places.json'), 'w', encoding='utf-8'),
                      ensure_ascii=False, separators=(',', ':'))

    kind = lambda f: f.get('kind') or 'route'   # noqa: E731
    # דף לכל מק"ט (שני הכיוונים וכל החלופות). כשבאותו כיוון יש שני שינויים (אחד שכבר התחיל ואחד קרוב) — דף לכל אחד
    pages = defaultdict(list)
    cnt = defaultdict(int)
    for f in sorted(found, key=lambda f: f['eff']):
        # חלופה שבוטלה / חדשה — דף משלה (לא מתערבב עם שינוי המסלול של הקו, ולא משנה את התאריך שלו)
        key = (f['ag'], f['makat'], kind(f) + (':' + f['var'] if f.get('var') else ''))
        pages[key + (cnt[key + (f['rd'],)],)].append(f)
        cnt[key + (f['rd'],)] += 1
    index = []
    want = set()
    pages_rds = {}
    tpl = open(os.path.join(OUTDIR, 'line-template.html'), encoding='utf-8').read()
    os.makedirs(os.path.join(OUTDIR, 'l'), exist_ok=True)
    for (ag, makat, kd, _n), dirs in pages.items():
        vk = kd.partition(':')[2]
        kd = kd.partition(':')[0]
        dirs.sort(key=lambda f: (f['dir'], f['alt']))
        eff = min(f['eff'] for f in dirs)
        formal = min((f['formal'] for f in dirs if f.get('formal')), default=None)
        # הכתובת לפי התאריך הרשמי של השינוי (או הנסיעה הראשונה כשאין) — יציבה בין הריצות.
        # הסוגים החדשים: עם סיומת (n קו חדש · e קו מבוטל · t לוח זמנים)
        pid = f'{makat}-{(formal or eff).replace("-", "")}' + KIND_SUFFIX.get(kd, '') + ('-v' if vk else '')
        want.add(pid)
        pages_rds[pid] = dirs
        f0 = dirs[0]
        cities = sorted({s[4] for f in dirs for s in f['new']['stops'] + f['old']['stops'] if s[4]})
        ch_codes = {c for f in dirs for c in f['added'] + f['removed']} | {m['code'] for f in dirs for m in f['moved']}
        ch_cities = sorted({s[4] for f in dirs for s in f['new']['stops'] + f['old']['stops']
                            if s[0] in ch_codes and s[4]})
        if kd == 'route':
            tot = totals(dirs)
            summ = summary_line(tot)
        else:
            tot = {'kind': kd}
            summ = kind_summary(kd, dirs)
            # קו חדש / מבוטל: כל הערים במסלול; לוח זמנים — הערים של הקו (רק הראשונה והאחרונה שמורות בדף)
            ch_cities = sorted({x for f in dirs for x in f.get('cities', [])} or set(cities))
        # בדף הראשי: רק הערים שבהן משהו משתנה (רשימת כל הערים של הקו נמצאת ב-lines.json)
        rec = dict(id=pid, line=f0['line'], op=f0['op'], makat=makat, od=f0['od'], eff=eff,
                   formal=formal, tot=tot, summary=summ, chcities=ch_cities,
                   dev=max((f.get('dev', 0) for f in dirs if f.get('geo')), default=0),   # אורך הדרך שמשתנה (מ') — לשינוי קטן/גדול
                   sig=same_sig(dirs, formal or eff) if kd == 'route' else '',   # אותו שינוי בכמה קווים (אותן תחנות, אותו יום) — מקובצים יחד באתר
                   dirs=[dict(dir=f['dir'], alt=f['alt'], od=f['od'], eff=f['eff'], add=len(f['added']),
                              rem=len(f['removed']), mv=len(f['moved']), geo=f['geo']) for f in dirs])
        if any(f.get('was') for f in dirs):
            rec['inferred'] = 1   # השוואה משוערת: מי שמכין את המצגת בוחר אם זו אותה נסיעה (או להציג בנפרד — split)
        bs = [f['basis'] for f in dirs if f.get('basis')]
        if bs:
            rec['basis'] = list(dict.fromkeys(bs))   # על מה מבוססת ההשוואה (חלופה שהוחלפה / בוטלה / חדשה)
        vs = {f.get('var') or '' for f in dirs}
        if kd == 'route' and len(vs) == 1 and '' not in vs:
            rec['var'] = vs.pop()   # כל הכיוונים בדף: חלופה שבוטלה (end) או חלופה חדשה (new)
            rec['tot']['var'] = rec['var']
            sl = summary_line(dict(tot, geo=False, ext=''))   # בחלופה — בלי "הקו נוסע בדרך אחרת": הדרך הראשית לא משתנה
            rec['summary'] = ('חלופה בוטלה' if rec['var'] == 'end' else 'חלופה חדשה') + (' · ' + sl if sl else '')
            summ = rec['summary']
        if (formal or eff) < t0:
            rec['started'] = 1   # כבר התחיל (נשמר מהריצות הקודמות, KEEP_DAYS). לא "past" — בדף זה שינוי מהארכיון
        if kd != 'route':
            rec['kind'] = kd
            rec['dirs'] = [dict(dir=f['dir'], eff=f['eff']) for f in dirs]
            del rec['dev']
        if kd == 'ended':
            rec['last'] = max(f['last'] for f in dirs)
        index.append(rec)
        rds = {f['rd'] for f in dirs if f.get('was')}
        sp = [x for x in splits if x['split_of'] in rds]
        json.dump(dict(rec, cities=cities, gen=t0, feed=new_day.isoformat(), dirs=dirs, **({'split': sp} if sp else {})),
                  open(os.path.join(data, 'l', pid + '.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        od_t = f'{f0["od"][0]} ↔ {f0["od"][1]}' if f0['od'][0] != f0['od'][1] else f0['od'][0]
        was = rec.get('started')
        if was and kd == 'ended':
            title = f'קו {f0["line"]} {od_t} הפסיק לפעול — נסיעה אחרונה ב-{fmt_d(rec["last"])}'
            desc = f'{f0["op"]}. מפה של המסלול, ואילו קווים עוצרים באותן תחנות.'
        elif was:
            title = {'new': f'קו חדש: {f0["line"]} {od_t} מאז {fmt_d(eff)}',
                     'timetable': f'לוח זמנים חדש לקו {f0["line"]} {od_t} מאז {fmt_d(eff)}'}.get(
                kd, f'שינוי בקו {f0["line"]} {f0["od"][0]} ↔ {f0["od"][1]} מאז {fmt_d(rec["formal"] or eff)}')
            desc = {'new': f'{f0["op"]}. מפה של המסלול, כל התחנות, ומתי הקו נוסע.',
                    'timetable': f'{summ}. {f0["op"]}. מה השתנה בלוח הזמנים, ושעות היציאה הישנות והחדשות.'}.get(
                kd, f'{summ}. {f0["op"]}. מה השתנה, מפה של המסלול הישן והחדש, ואיפה התחנה הקרובה במקום תחנה שבוטלה.')
        elif kd == 'new':
            title = f'קו חדש: {f0["line"]} {od_t} מ-{fmt_d(eff)}'
            desc = f'{f0["op"]}. מפה של המסלול, כל התחנות, ומתי הקו נוסע.'
        elif kd == 'ended':
            title = f'קו {f0["line"]} {od_t} מפסיק לפעול — נסיעה אחרונה ב-{fmt_d(rec["last"])}'
            desc = f'{f0["op"]}. מפה של המסלול, ואילו קווים עוצרים באותן תחנות.'
        elif kd == 'timetable':
            title = f'לוח זמנים חדש לקו {f0["line"]} {od_t} מ-{fmt_d(eff)}'
            desc = f'{summ}. {f0["op"]}. מה משתנה בלוח הזמנים, ושעות היציאה הישנות והחדשות.'
        else:
            title = f'שינוי בקו {f0["line"]} {f0["od"][0]} ↔ {f0["od"][1]} מ-{fmt_d(rec["formal"] or eff)}'
            desc = f'{summ}. {f0["op"]}. מה משתנה, מפה של המסלול הישן והחדש, ואיפה התחנה הקרובה במקום תחנה שמבוטלת.'
        html = (tpl.replace('{{TITLE}}', esc(title)).replace('{{DESC}}', esc(desc))
                .replace('{{URL}}', f'{SITE}/l/{pid}.html').replace('{{ID}}', pid))
        open(os.path.join(OUTDIR, 'l', pid + '.html'), 'w', encoding='utf-8').write(html)
    alias = make_alias(prev_pages, prev_alias, {r['id']: [d['rd'] for d in pages_rds[r['id']]] for r in index}, index, t0)
    # ניקוי דפים שכבר לא ברשימה. דף השיתוף (l/<id>.html) של מזהה ישן נשאר כל עוד יש לו כינוי (ALIAS_DAYS):
    # הוא מעביר ל-?c=<המזהה הישן>, והדף מוצא את השינוי העדכני (או את הקו)
    for d, ext in ((os.path.join(data, 'l'), '.json'), (os.path.join(OUTDIR, 'l'), '.html')):
        for fn in os.listdir(d):
            if fn.endswith(ext) and fn[:-len(ext)] not in want and not (ext == '.html' and fn[:-len(ext)] in alias):
                os.remove(os.path.join(d, fn))
    index.sort(key=lambda r: (r['eff'], int(re.sub(r'\D', '', r['line']) or 0)))
    json.dump(dict(gen=t0, feed=new_day.isoformat(), ref=old_day.isoformat(), horizon=HORIZON,
                   scope=sorted(CITIES_RAW.split(',')) if CITIES else [], stats=stats, filtered=filtered, hol=hol_week(TODAY),
                   changes=index, alias=alias),
              open(os.path.join(data, 'index.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(f'{len(index)} דפים נכתבו ל-{OUTDIR}', flush=True)


PAST_KINDS = {'route', 'stops', 'stops-add', 'stops-del', 'extend', 'shorten', 'terminal'}


def add_past(lines_path, ch_dir, days=PAST_DAYS):
    """שינויי מסלול ותחנות מהשבועיים האחרונים, מ"הקו בזמן" (line-history/data/changes/YYYY-MM.json):
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
    print(f'שינויים מהשבועיים האחרונים: {n} אירועים · {sum(1 for ln in li["lines"] if len(ln) > 8)} קווים', flush=True)


if __name__ == '__main__':
    LH = os.environ.get('LH_CHANGES')   # line-history/data/changes — לשינויים מהשנה האחרונה
    if len(sys.argv) > 1 and sys.argv[1] == 'past':
        add_past(os.path.join(OUTDIR, 'data', 'lines.json'), LH or 'line-history/data/changes')
        sys.exit()
    if len(sys.argv) > 1 and sys.argv[1] == 'tt':   # רק הלו"ז העדכני של כל הקווים (data/tt) — לבדיקה
        t = datetime.datetime.now()
        fd = open_feed(TODAY, TODAY, TODAY + datetime.timedelta(days=HORIZON + 7))
        current_tts(fd, min(TODAY, fd.day))
        print(f'זמן ריצה: {(datetime.datetime.now() - t).seconds} שניות', flush=True)
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
