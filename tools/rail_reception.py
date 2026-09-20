#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""מפת הקליטה ברכבת — הערכה לכל 100 מטר מסילה, לכל מפעיל.

מקורות (כולם כבר במאגר):
  rail/data/segments.json      — המסילה בין תחנות עוקבות (OSM)
  rail/data/tunnels.json       — מנהרות / חתכים / כיסויים / גשרים (OSM)
  rail/data/antennas-raw.json  — אנטנות סלולריות פעילות (המשרד להגנת הסביבה,
                                 data.gov.il), ברשת ישראל (ITM) → WGS84
  rail/data/days/*.json        — נסיעות: זמן בפועל בין תחנות → מהירות ממוצעת
                                 לכל מקטע (30 הימים האחרונים)

לכל דגימה: מבנה (מנהרה/חתך/גשר), מרחק לאנטנה הקרובה של כל מפעיל, וציון
0–3 (אין / חלש / סביר / טוב): מנהרה → 0; אחרת לפי המרחק (עד 1.5 ק"מ טוב,
עד 3.5 סביר, עד 6 חלש); חתך מוריד דרגה; מהירות מעל 120 קמ"ש מורידה דרגה
מ"סביר" ומטה (מסירה בין תאים נכשלת יותר במהירות). שיקול הדעת בצד הלקוח
מקבל את הגורמים הגולמיים ויכול להציג אחרת.

תוצר: rail/data/reception.json
"""
import datetime
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

OUTDIR = os.environ.get('OUTDIR', 'rail/data')
STEP_M = 100
DAYS_BACK = 30
STATION_POS = {}
OPS = [('פלאפון', 'pel'), ('סלקום', 'cel'), ('PHI', 'phi')]   # PHI = פרטנר + הוט
OP_NAMES = {'pel': 'פלאפון', 'cel': 'סלקום', 'phi': 'פרטנר / הוט (PHI)'}


def jload(p, d=None):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return d


def dec_polyline(s):
    pts, i, la, lo = [], 0, 0, 0
    while i < len(s):
        for which in (0, 1):
            shift = result = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else result >> 1
            if which == 0:
                la += d
            else:
                lo += d
        pts.append((la / 1e5, lo / 1e5))
    return pts


def hav(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- ITM → WGS84
def itm_to_wgs84(x, y):
    """רשת ישראל החדשה (EPSG:2039, GRS80) → WGS84. טרנסבר-מרקטור הפוך ואז
    הזזת דאטום (הלמרט, הפרמטרים המקובלים ל-Israel 1993)."""
    a, f = 6378137.0, 1 / 298.257222101
    k0, lat0, lon0 = 1.0000067, math.radians(31.7343936111), math.radians(35.2045169444)
    fe, fn = 219529.584, 626907.39
    e2 = 2 * f - f * f
    ep2 = e2 / (1 - e2)
    n = f / (2 - f)
    # קשת מרידיאן ל-lat0
    def marc(phi):
        return a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi
                    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi)
                    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi)
                    - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    m = marc(lat0) + (y - fn) / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu))
    sp, cp = math.sin(phi1), math.cos(phi1)
    t = math.tan(phi1) ** 2
    c = ep2 * cp * cp
    nn = a / math.sqrt(1 - e2 * sp * sp)
    r = a * (1 - e2) / (1 - e2 * sp * sp) ** 1.5
    d = (x - fe) / (nn * k0)
    lat = phi1 - (nn * math.tan(phi1) / r) * (d * d / 2 - (5 + 3 * t + 10 * c - 4 * c * c - 9 * ep2) * d ** 4 / 24
                                              + (61 + 90 * t + 298 * c + 45 * t * t - 252 * ep2 - 3 * c * c) * d ** 6 / 720)
    lon = lon0 + (d - (1 + 2 * t + c) * d ** 3 / 6 + (5 - 2 * c + 28 * t - 3 * c * c + 8 * ep2 + 24 * t * t) * d ** 5 / 120) / cp
    # הלמרט: Israel1993(GRS80) → WGS84
    sp, cp = math.sin(lat), math.cos(lat)
    nn = a / math.sqrt(1 - e2 * sp * sp)
    X = nn * cp * math.cos(lon)
    Y = nn * cp * math.sin(lon)
    Z = nn * (1 - e2) * sp
    dx, dy, dz = -24.0024, -17.1032, -17.8444
    rx, ry, rz = [math.radians(v / 3600) for v in (-0.33077, -1.85269, 1.66969)]
    s = 1 + 5.4248e-6
    X2 = dx + s * (X - rz * Y + ry * Z)
    Y2 = dy + s * (rz * X + Y - rx * Z)
    Z2 = dz + s * (-ry * X + rx * Y + Z)
    # ECEF → גאודטי (WGS84)
    a2, f2 = 6378137.0, 1 / 298.257223563
    e22 = 2 * f2 - f2 * f2
    lon2 = math.atan2(Y2, X2)
    p = math.hypot(X2, Y2)
    lat2 = math.atan2(Z2, p * (1 - e22))
    for _ in range(5):
        nn = a2 / math.sqrt(1 - e22 * math.sin(lat2) ** 2)
        lat2 = math.atan2(Z2 + e22 * nn * math.sin(lat2), p)
    return math.degrees(lat2), math.degrees(lon2)


# ---------------------------------------------------------------- אינדקס רשת
class Grid:
    """אינדקס תאים של ~1 ק"מ לחיפוש נקודות קרובות."""
    def __init__(self, cell=0.01):
        self.cell = cell
        self.g = {}

    def key(self, lat, lon):
        return (int(lat / self.cell), int(lon / self.cell))

    def add(self, lat, lon, val):
        self.g.setdefault(self.key(lat, lon), []).append((lat, lon, val))

    def near(self, lat, lon, radius_m):
        rc = int(radius_m / 1000 / (111 * self.cell)) + 1
        k0, k1 = self.key(lat, lon)
        for i in range(k0 - rc, k0 + rc + 1):
            for j in range(k1 - rc, k1 + rc + 1):
                for la, lo, v in self.g.get((i, j), ()):
                    yield la, lo, v

    def nearest(self, lat, lon, radius_m):
        best, bd = None, radius_m
        for la, lo, v in self.near(lat, lon, radius_m):
            if abs(la - lat) * 111000 > bd:
                continue
            d = hav(lat, lon, la, lo)
            if d < bd:
                best, bd = v, d
        return best, (bd if best is not None else None)


def densify(pts, step):
    """נקודות כל step מטר לאורך פוליליין (כולל הקצוות)."""
    out = [pts[0]]
    carry = 0.0
    for i in range(1, len(pts)):
        (la1, lo1), (la2, lo2) = pts[i - 1], pts[i]
        d = hav(la1, lo1, la2, lo2)
        if d == 0:
            continue
        pos = step - carry
        while pos < d:
            f = pos / d
            out.append((la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f))
            pos += step
        carry = d - (pos - step)
    out.append(pts[-1])
    return out


def seg_length(pts):
    return sum(hav(*pts[i - 1], *pts[i]) for i in range(1, len(pts)))


# ---------------------------------------------------------------- מהירות
def segment_speeds(segs_len):
    """מהירות ממוצעת (קמ"ש) לכל מקטע: אורך המסילה / הזמן בפועל בין התחנות,
    חציון על כל הנסיעות ב-30 הימים האחרונים. הזמן בפועל = מתוכנן + איחור."""
    ddir = f'{OUTDIR}/days'
    if not os.path.isdir(ddir):
        return {}
    cutoff = (datetime.date.today() - datetime.timedelta(days=DAYS_BACK)).isoformat()
    files = sorted(f for f in os.listdir(ddir) if f.endswith('.json') and f[:10] >= cutoff)
    times = {}
    for fn in files:
        day = jload(f'{ddir}/{fn}', {})
        for r in day.get('rides', []):
            s = r.get('s', [])
            for i in range(1, len(s)):
                a, b = s[i - 1], s[i]
                if a[0] is None or b[0] is None or a[1] is None or b[1] is None:
                    continue
                ta = a[1] + (a[2] or 0)
                tb = b[1] + (b[2] or 0)
                dt = tb - ta
                if dt <= 0 or dt > 90:
                    continue
                key = f'{a[0]}-{b[0]}' if str(a[0]) < str(b[0]) else f'{b[0]}-{a[0]}'
                if key not in segs_len:
                    continue
                times.setdefault(key, []).append(dt)
    out = {}
    for key, ts in times.items():
        ts.sort()
        med = ts[len(ts) // 2]
        # דקות שלמות — מקטעים קצרים רועשים; מוסיפים חצי דקה לעצירה
        out[key] = round(segs_len[key] / 1000 / (med / 60), 1), len(ts)
    return out


def real_routes(segs_keys):
    """הקווים האמיתיים: רצפי התחנות של הנסיעות ב-7 הימים האחרונים, לפי שם המסלול.
    לכל רצף ייחודי — שם, תחנות ומספר נסיעות. משמש לבחירת מוצא/יעד בעמוד."""
    ddir = f'{OUTDIR}/days'
    if not os.path.isdir(ddir):
        return []
    files = sorted(f for f in os.listdir(ddir) if f.endswith('.json'))[-7:]
    seen = {}
    for fn in files:
        day = jload(f'{ddir}/{fn}', {})
        for r in day.get('rides', []):
            stops = [x[0] for x in r.get('s', []) if x[0] is not None]
            if len(stops) < 2:
                continue
            key = tuple(stops)
            e = seen.setdefault(key, {'nm': r.get('nm') or '', 'n': 0})
            e['n'] += 1
    out = []
    for key, e in seen.items():
        # רק רצפים שכל מקטעיהם קיימים במפה
        ok = all((f'{a}-{b}' if str(a) < str(b) else f'{b}-{a}') in segs_keys for a, b in zip(key, key[1:]))
        if ok and e['n'] >= 3:
            out.append({'nm': e['nm'], 'n': e['n'], 's': list(key)})
    out.sort(key=lambda r: -r['n'])
    return out


def taba_structs(segs_pts, segs_len):
    """מבנים מהתב"ע (rail/data/taba-structures.json): לכל מקטע בין עוגני תחנות,
    הקילומטראז' של כל נקודה מחושב ליניארית לפי המרחק לאורך הפוליליין; מעבר לעוגן
    הקצה ממשיכים באותו קצב למקטעים הסמוכים. מחזיר {(key, index): (kind, depth, plan)}."""
    data = jload(f'{OUTDIR}/taba-structures.json', {})
    out = {}
    for plan in data.get('plans', []):
        anchors = sorted(plan.get('anchors', []), key=lambda a: a['chainage'])
        feats = plan.get('features', [])
        if len(anchors) < 2 or not feats or plan.get('usable') is False:
            continue
        codes = [a['stop'] for a in anchors]
        lo = min(f['from'] for f in feats)
        hi = max(f['to'] for f in feats)

        def assign(key, pts, ch0, ch1, reverse, limit=None):
            """נקודות המקטע key מקבלות קילומטראז' ליניארי מ-ch0 (בתחילת הפוליליין) ל-ch1.
            limit=(עוגן, מרחק): בהארכה מעבר לעוגן — רק עד המרחק הזה ממנו."""
            n = len(pts)
            dist = [0.0]
            for i in range(1, n):
                dist.append(dist[-1] + hav(*pts[i - 1], *pts[i]))
            total = dist[-1] or 1.0
            for i in range(n):
                f = dist[i] / total
                ch = ch0 + (ch1 - ch0) * f
                if limit and abs(ch - limit[0]) > limit[1]:
                    continue
                for ft in feats:
                    if ft['from'] <= ch <= ft['to']:
                        out[(key, i)] = (ft['kind'], ft.get('depth'), plan['plan'])
                        break

        # מקטעים בין עוגנים עוקבים
        for a, b in zip(anchors, anchors[1:]):
            key = f"{a['stop']}-{b['stop']}" if str(a['stop']) < str(b['stop']) else f"{b['stop']}-{a['stop']}"
            pts = segs_pts.get(key)
            if not pts:
                continue
            # כיוון הפוליליין: הקצה הקרוב לתחנה a הוא ההתחלה
            sa = STATION_POS.get(a['stop'])
            if sa and hav(*pts[-1], *sa) < hav(*pts[0], *sa):
                assign(key, pts, b['chainage'], a['chainage'], True)
            else:
                assign(key, pts, a['chainage'], b['chainage'], False)
        # הארכה מעבר לעוגני הקצה: מקטעים שנוגעים בעוגן הראשון/האחרון (ולא בין העוגנים)
        for end, sign in ((anchors[0], -1), (anchors[-1], 1)):
            for key, pts in segs_pts.items():
                x, y = key.split('-')
                if end['stop'] not in (x, y) or (x in codes and y in codes):
                    continue
                se = STATION_POS.get(end['stop'])
                if not se:
                    continue
                # הארכה עד 3 ק"מ מהעוגן — מעבר לזה הקילומטראז' לא אמין
                lim = (end['chainage'], 3000)
                if hav(*pts[0], *se) < hav(*pts[-1], *se):
                    assign(key, pts, end['chainage'], end['chainage'] + sign * segs_len[key], False, lim)
                else:
                    assign(key, pts, end['chainage'] + sign * segs_len[key], end['chainage'], True, lim)
    return out


def score(struct, d, spd):
    if struct in ('tunnel', 'covered'):
        return 0
    if d is None:
        return 0
    s = 3 if d < 1500 else 2 if d < 3500 else 1 if d < 6000 else 0
    if struct == 'deep':
        s = max(0, s - 2)
    if struct == 'cutting' and s > 0:
        s -= 1
    if spd and spd > 120 and 0 < s < 3:
        s -= 1
    return s


def main():
    segs = jload(f'{OUTDIR}/segments.json', {}).get('segments', {})
    tun = jload(f'{OUTDIR}/tunnels.json', {}).get('features', [])
    ant = jload(f'{OUTDIR}/antennas-raw.json', {}).get('records', [])
    stations = jload(f'{OUTDIR}/stations.json', {})
    global STATION_POS
    STATION_POS = {k: (v[1], v[2]) for k, v in stations.items() if v[1] is not None}
    print(f'מקטעים: {len(segs)} · מבנים: {len(tun)} · אנטנות: {len(ant)}')

    # מבנים — נקודות צפופות (כל 25 מ׳) באינדקס
    sg = Grid(0.005)
    for f in tun:
        if f['k'] == 'bridge':
            continue
        for la, lo in densify(dec_polyline(f['p']), 25):
            sg.add(la, lo, f['k'])

    # אנטנות לפי מפעיל
    ag = {code: Grid(0.02) for _, code in OPS}
    ants_out = []
    skipped = 0
    for r in ant:
        try:
            x, y = float(r['X_ITM']), float(r['Y_ITM'])
        except (TypeError, ValueError):
            skipped += 1
            continue
        if not (100000 < x < 300000 and 350000 < y < 820000):
            skipped += 1
            continue
        la, lo = itm_to_wgs84(x, y)
        comp = r.get('חברה') or ''
        code = next((c for n, c in OPS if comp.startswith(n)), None)
        if not code:
            skipped += 1
            continue
        typ = r.get('סוג אתר') or ''
        ag[code].add(la, lo, (typ, r.get('טכנולוגיית שידור') or ''))
        ants_out.append([round(la, 5), round(lo, 5), code, typ, r.get('טכנולוגיית שידור') or '', r.get('עיר') or ''])
    print(f'אנטנות בשימוש: {len(ants_out)} · דולגו: {skipped}')

    segs_pts = {k: dec_polyline(v) for k, v in segs.items()}
    segs_len = {k: seg_length(p) for k, p in segs_pts.items()}
    spd = segment_speeds(segs_len)
    print(f'מהירויות: {len(spd)} מקטעים')
    segs_d = {k: densify(p, STEP_M) for k, p in segs_pts.items()}   # הדגימות עצמן — גם לתב"ע
    taba = taba_structs(segs_d, segs_len)
    print(f'נקודות עם מבנה מהתב"ע: {len(taba)}')

    out_segs = {}
    tot = {c: [0, 0, 0, 0] for _, c in OPS}
    n_pts = 0
    for key, pts in segs_pts.items():
        v, n = spd.get(key, (None, 0))
        rows = []
        dpts = segs_d[key]
        for i, (la, lo) in enumerate(dpts):
            st, _ = sg.nearest(la, lo, 30)
            tb = taba.get((key, i))
            if tb and st not in ('tunnel', 'covered'):
                st = tb[0]
            row = [round(la, 5), round(lo, 5), st or '']
            for _, c in OPS:
                _, d = ag[c].nearest(la, lo, 8000)
                sc = score(st, d, v)
                row.append(round(d) if d is not None else None)
                row.append(sc)
                tot[c][sc] += 1
            rows.append(row)
            n_pts += 1
        out_segs[key] = {'m': round(segs_len[key]), 'spd': v, 'n': n, 'pts': rows}
    # אנטנות רק בסביבת המסילה (עד 8 ק"מ) — לשכבת המפה
    rg = Grid(0.02)
    for s in out_segs.values():
        for p in s['pts'][::5]:
            rg.add(p[0], p[1], 1)
    ants_near = [a for a in ants_out if rg.nearest(a[0], a[1], 8000)[0] is not None]
    print(f'דגימות: {n_pts} · אנטנות ליד המסילה: {len(ants_near)}')
    for _, c in OPS:
        t = tot[c]
        print(f'  {OP_NAMES[c]}: טוב {t[3]} · סביר {t[2]} · חלש {t[1]} · אין {t[0]}')
    routes = real_routes(set(out_segs.keys()))
    print(f'קווים אמיתיים (רצפי תחנות): {len(routes)}')
    tunnel_names = sorted({f['n'] for f in tun if f['n'] and f['k'] == 'tunnel'})
    json.dump({
        'updated': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'),
        'step': STEP_M, 'days': DAYS_BACK,
        'ops': [{'code': c, 'name': OP_NAMES[c]} for _, c in OPS],
        'cols': ['lat', 'lon', 'struct', 'd_pel', 's_pel', 'd_cel', 's_cel', 'd_phi', 's_phi'],
        'stations': {k: v[0] for k, v in stations.items()},
        'tunnels': tunnel_names,
        'antennas': ants_near,
        'routes': routes,
        'segs': out_segs,
    }, open(f'{OUTDIR}/reception.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
