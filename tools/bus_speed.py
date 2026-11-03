#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""מהירות האוטובוסים לפי מקום ושעה — מקובצי ה-SIRI הגולמיים של דאטאבוס (S3, קובץ לכל דקה).

כל דקה מגיע מיקום ומהירות (Velocity) של כל אוטובוס בנסיעה. ממוצע המהירויות שנדגמו כל דקה
בריבוע של ~100 מ' = המרחק שנסעו שם חלקי הזמן ששהו שם (כולל עצירות בתחנות ובפקק).
נבדק מול ההפרש בין מיקומים עוקבים (27.10.2026): 28.9 מול 28.6 קמ"ש בממוצע.

  python3 tools/bus_speed.py day 2026-10-27      → $SPEED_CACHE/2026-10-27.json.gz (סיכום היום)
  python3 tools/bus_speed.py build [ימים]       → bus-speed/data (ברירת מחדל: 28 הימים האחרונים במטמון)

המפתח: ריבוע (0.0009° רוחב × 0.00105° אורך, ~100×100 מ'), כיוון נסיעה (8 כיוונים), שעה.
לא נספרים: אוטובוס שממתין במסוף לפני היציאה, ונקודה שלא התעדכנה מהדקה הקודמת.
"""
import collections
import datetime
import gzip
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor


S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com/stride-siri-requester/'
CACHE = os.environ.get('SPEED_CACHE', '/tmp/speed-days')
OUT = os.environ.get('SPEED_OUT', 'bus-speed/data')
CY, CX = 0.0009, 0.00105
TILE = 0.05          # קובץ לכל ~5×5 ק"מ
DAYS = 28
MIN_N = 5            # פחות דגימות בשעה — לא מציגים את השעה
MIN_TOTAL = 40       # פחות דגימות בכל היום — לא מציגים את המקום


def fetch(key):
    for i in range(5):
        try:
            with urllib.request.urlopen(S3 + key, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if '404' in str(e):
                return None
            time.sleep(2 * (i + 1))
    return None


def parse(b):
    import brotli   # רק לעיבוד היומי (pip install brotli) — build ו-pop לא צריכים
    try:
        j = json.loads(brotli.decompress(b))
    except Exception:  # noqa: BLE001
        return []
    out = []
    for sd in j.get('Siri', {}).get('ServiceDelivery', {}).get('StopMonitoringDelivery') or []:
        for v in sd.get('MonitoredStopVisit') or []:
            mj = v.get('MonitoredVehicleJourney') or {}
            loc = mj.get('VehicleLocation') or {}
            try:
                mc = mj.get('MonitoredCall') or {}
                # רכב = מפעיל/מספר: מספרי רכב חוזרים בין מפעילים (רכבת ישראל ומפעיל אחר שולחים שניהם "23")
                out.append((f"{mj.get('OperatorRef')}/{mj.get('VehicleRef')}", v['RecordedAtTime'], float(loc['Latitude']), float(loc['Longitude']),
                            float(mj.get('Velocity') or 0), float(mj.get('Bearing') or 0), mj.get('OriginAimedDepartureTime') or '',
                            mj.get('LineRef') or '', int(mc.get('Order') or 0)))
            except Exception:  # noqa: BLE001
                continue
    return out


def day(ds):
    d = datetime.date.fromisoformat(ds)
    # היום המקומי: הקבצים לפי UTC, אז מורידים מ-21:00 UTC של אתמול עד 22:00 UTC של היום ומסננים לפי השעה המקומית
    t0 = datetime.datetime(d.year, d.month, d.day) - datetime.timedelta(hours=3)
    keys = [(t0 + datetime.timedelta(minutes=m)).strftime('%Y/%m/%d/%H/%M') + '.br' for m in range(25 * 60)]
    geo = collections.defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])   # (ריבוע, כיוון) → מיקום וכיוון ממוצעים
    hrs = collections.defaultdict(lambda: [0, 0.0, 0])               # (ריבוע, כיוון, שעה) → דגימות, סכום מהירות, איטיות
    last = {}
    files = recs = used = 0
    st = time.time()
    RS = route_stops(ds)
    at = collections.defaultdict(dict)       # (תחנה, דקה) → {רכב: קו} — אוטובוסים בתחנה
    app = collections.defaultdict(list)      # (תחנה, דקה) → מהירויות בקטע שלפני התחנה
    mins = set()
    good, pend = {}, collections.defaultdict(list)   # רכב → המיקום התקין האחרון (זמן, רוחב, אורך) · כמה שידורים חשודים ברצף
    skip = collections.Counter()
    cells = collections.Counter()           # ריבועים של ~200 מ' שאוטובוסים באמת עברו בהם היום (שידורים תקינים)
    jumps = []                              # קפיצות: [רכב, קו, שעה, יציאה, רוחב, אורך, רוחב קודם, אורך קודם, ק"מ]
    trip = {}                               # (קו, יציאה, רכב) → [שידור ראשון, אחרון, יציאה] — "נסיעות בשעה אחרת"
    nb = collections.Counter()              # שידורים לכל מפעיל
    ts = lambda x: datetime.datetime.fromisoformat(x).timestamp()  # noqa: E731
    with ThreadPoolExecutor(24) as ex:
        for b in ex.map(fetch, keys):
            if not b:
                continue
            files += 1
            for veh, rt, la, lo, vel, br, dep, line, order in parse(b):
                recs += 1
                if not rt.startswith(ds) or last.get(veh) == rt:
                    continue
                last[veh] = rt
                if dep and rt < dep:  # ממתין במסוף לפני היציאה (אותו אזור זמן — השוואת מחרוזות)
                    continue
                if not (29.3 < la < 33.5 and 34.2 < lo < 35.9) or vel > 130:
                    skip['out'] += 1
                    continue
                # אוטובוסים ומוניות שירות. בלי GTFS (ההורדה נכשלה) — לפחות בלי רכבת ישראל (מפעיל 2)
                if (RS and line not in RS[2]) or (not RS and veh.startswith('2/')):
                    skip['notbus'] += 1
                    continue
                t = ts(rt)
                if dep and RS:
                    e = trip.get((line, dep, veh))
                    if e is None:
                        trip[(line, dep, veh)] = [t, t, ts(dep)]
                    elif t > e[1]:
                        e[1] = t
                # נסיעה "תקועה": שידור יותר מ-4 שעות אחרי היציאה המתוכננת — הנהג לא סגר את הנסיעה ונוסע הביתה
                # (שלמה 02.11: מוניות שירות של קו 16 נספרו בשישי ב-23:00 על הנסיעה של 15:11)
                if dep and t - ts(dep) > 4 * 3600:
                    skip['stale'] += 1
                    continue
                # זיוף GPS: "אירוע" — מהקפיצה (מעל 130 קמ"ש ו-500 מ' מהמיקום התקין האחרון) ועד שהרכב חוזר למקום שאפשר
                # להגיע אליו מהמיקום התקין (500 מ' + 90 קמ"ש מאז). כל הנקודות באמצע — מסלול מזויף אחד, גם אם הוא
                # "נוסע" לאורך דרך (שלמה 03.11: שורת נקודות בשמורה ליד כביש 6 — אוטובוס אחד, לא כמה). לא חזר תוך
                # 30 דקות — באמת עבר מקום (למשל אחרי הפסקה בשידור), לא זיוף
                p = good.get(veh)
                if p and t > p[0]:
                    dd = math.hypot((la - p[1]) * 111000, (lo - p[2]) * 93000)
                    if pend[veh]:
                        if dd > 500 + (t - p[0]) * 25 and t - p[0] < 1800:
                            skip['jump'] += 1
                            pend[veh].append([round(la, 5), round(lo, 5), rt[11:19], round(dd / 1000, 1)])
                            continue
                        if dd <= 500 + (t - p[0]) * 25:
                            jumps.append([veh, line, dep[11:16], round(p[1], 5), round(p[2], 5), pend[veh]])
                        pend[veh] = []
                    elif dd > 500 and dd / (t - p[0]) * 3.6 > 130:
                        skip['jump'] += 1
                        pend[veh] = [[round(la, 5), round(lo, 5), rt[11:19], round(dd / 1000, 1)]]
                        continue
                good[veh] = (t, la, lo)
                cells[(round(la / 0.002), round(lo / 0.002))] += 1
                if RS:
                    nb[RS[3].get(line, ('?', ''))[0]] += 1
                s = int(((br + 22.5) % 360) // 45)
                k = (round(la / CY), round(lo / CX), s)
                g = geo[k]
                g[0] += 1; g[1] += la; g[2] += lo; g[3] += math.sin(math.radians(br)); g[4] += math.cos(math.radians(br))
                a = hrs[(*k, int(rt[11:13]))]
                a[0] += 1; a[1] += vel; a[2] += vel < 10
                used += 1
                # עומס בתחנות: התחנה הבאה של הנסיעה (MonitoredCall.Order = stop_sequence ב-GTFS) — כך נספרים
                # רק אוטובוסים של קווים שעוצרים בתחנה, ובכיוון שלה (לא בצד השני של הכביש)
                c = RS[0].get(line, {}).get(order) if RS else None
                if c:
                    sla, slo = RS[1][c]
                    dd = math.hypot((la - sla) * 111000, (lo - slo) * 93000)
                    if dd <= NEAR:
                        at[(c, rt[11:16])][veh] = line
                    elif dd <= APPROACH:
                        app[(c, rt[11:16])].append(vel)
                if rt[11:16] not in mins:
                    mins.add(rt[11:16])
    gk = list(geo)
    ix = {k: i for i, k in enumerate(gk)}
    g = [[*k, a[0], round(a[1], 3), round(a[2], 3), round(a[3], 1), round(a[4], 1)] for k, a in ((k, geo[k]) for k in gk)]
    rows = [[ix[k[:3]], k[3], a[0], round(a[1]), a[2]] for k, a in hrs.items()]
    os.makedirs(CACHE, exist_ok=True)
    with gzip.open(f'{CACHE}/{ds}.tmp', 'wt') as f:   # שם זמני — build לא יקרא קובץ באמצע כתיבה
        json.dump({'d': ds, 'files': files, 'recs': recs, 'used': used, 'skip': skip, 'geo': g, 'rows': rows}, f, separators=(',', ':'))
    os.replace(f'{CACHE}/{ds}.tmp', f'{CACHE}/{ds}.json.gz')
    if RS:
        stop_load(ds, RS[1], at, app, mins)
        gps_quality(ds, RS[3], cells, jumps, trip, nb)
    print(f'{ds}: {files} קבצים, {used:,} דגימות, {len(g):,} מקומות, {round(time.time() - st)} שנ\' · נפסלו: {dict(skip)}', flush=True)


def bearing(a, b):
    y = (b[1] - a[1]) * math.cos(math.radians(a[0]))
    return math.degrees(math.atan2(y, b[0] - a[0])) % 360


def shape_geoms(need):
    """הקו המצויר לכל מקום — הקטע של מסלול קו (shapes.txt ב-GTFS) שעובר בריבוע באותו כיוון.
    כך הצבע נמשך לאורך הכביש עצמו ולא כקו ישר קצר. need: קבוצת (ריבוע y, ריבוע x, כיוון)."""
    import csv
    import io
    import zipfile
    zp = os.environ.get('GTFS_ZIP')
    if not zp or not os.path.exists(zp):
        print('אין GTFS — קווים ישרים')
        return {}
    best = {}
    seen = set()

    def walk(pts):
        if len(pts) < 2:
            return
        sig = (pts[0], pts[-1], len(pts))
        if sig in seen:
            return
        seen.add(sig)
        runs = []   # [(מפתח, [נקודות])]
        for a, b in zip(pts, pts[1:]):
            dy = (b[0] - a[0]) * 111320
            dx = (b[1] - a[1]) * 111320 * math.cos(math.radians(a[0]))
            d = math.hypot(dx, dy)
            if d < 0.5:
                continue
            s = int(((bearing(a, b) + 22.5) % 360) // 45)
            k = max(1, int(d // 15))
            for i in range(k + 1):
                t = i / k
                q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                key = (round(q[0] / CY), round(q[1] / CX), s)
                if runs and runs[-1][0] == key:
                    if i:
                        runs[-1][1].append(q)
                else:
                    if runs:
                        runs[-1][1].append(q)   # ממשיכים עד הנקודה הבאה — שלא יהיה רווח בין הקטעים
                    runs.append((key, [runs[-1][1][-2] if runs and len(runs[-1][1]) > 1 else q, q]))
        for key, r in runs:
            if key in need and len(r) > len(best.get(key, ())):
                best[key] = r

    with zipfile.ZipFile(zp) as z:
        with z.open('shapes.txt') as f:
            rd = csv.reader(io.TextIOWrapper(f, encoding='utf-8-sig'))
            h = next(rd)
            ii, ia, io_, isq = h.index('shape_id'), h.index('shape_pt_lat'), h.index('shape_pt_lon'), h.index('shape_pt_sequence')
            cur, pts = None, []
            for row in rd:
                if row[ii] != cur:
                    walk([p for _, p in sorted(pts)])
                    cur, pts = row[ii], []
                pts.append((int(row[isq]), (float(row[ia]), float(row[io_]))))
            walk([p for _, p in sorted(pts)])
    out = {}
    for key, r in best.items():
        # פישוט: נקודה כל ~15 מ' על קו ישר מיותרת — שומרים רק נקודות שבהן הכיוון משתנה
        keep = [r[0]]
        for i in range(1, len(r) - 1):
            if abs(((bearing(keep[-1], r[i]) - bearing(r[i], r[i + 1]) + 540) % 360) - 180) > 4:
                keep.append(r[i])
        keep.append(r[-1])
        e = [round(keep[0][0] * 1e5), round(keep[0][1] * 1e5)]
        for a, b in zip(keep, keep[1:]):
            e += [round(b[0] * 1e5) - round(a[0] * 1e5), round(b[1] * 1e5) - round(a[1] * 1e5)]
        out[key] = e
    print(f'{len(seen):,} מסלולים, קו מצויר ל-{len(out):,} מתוך {len(need):,} מקומות')
    return out


NEAR, APPROACH = 35, 300   # מטרים: בתחנה / הקטע שלפניה


def route_stops(ds):
    """route_id → {stop_sequence: מק"ט}, מק"ט → (רוחב, אורך) — מה-GTFS של אותו יום בארכיון של דאטאבוס ב-S3
    (או GTFS_ZIP). נסיעה אחת לכל מסלול — לכל המסלולים אותו רצף. None אם אין GTFS."""
    import csv
    import io
    import zipfile
    zp = os.environ.get('GTFS_ZIP')
    if not zp or not os.path.exists(zp):
        d = datetime.date.fromisoformat(ds)
        zp = f'{CACHE}/gtfs-{ds}.zip'
        for back in range(4):
            u = f"https://openbus-stride-public.s3.eu-west-1.amazonaws.com/gtfs_archive/{d - datetime.timedelta(days=back):%Y/%m/%d}/israel-public-transportation.zip"
            try:
                os.makedirs(CACHE, exist_ok=True)
                urllib.request.urlretrieve(u, zp)
                break
            except Exception:  # noqa: BLE001
                zp = None
                time.sleep(3)
        if not zp:
            print(f'{ds}: אין GTFS — בלי עומס בתחנות')
            return None
    z = zipfile.ZipFile(zp)
    rd = lambda n: csv.reader(io.TextIOWrapper(z.open(n), 'utf-8-sig'))  # noqa: E731
    r = rd('stops.txt'); h = next(r)
    i_id, i_c, i_la, i_lo = h.index('stop_id'), h.index('stop_code'), h.index('stop_lat'), h.index('stop_lon')
    sid, S = {}, {}
    for x in r:
        sid[x[i_id]] = x[i_c]
        S[x[i_c]] = (float(x[i_la]), float(x[i_lo]))
    r = rd('agency.txt'); h = next(r)
    agn = {x[h.index('agency_id')]: x[h.index('agency_name')] for x in r}
    r = rd('routes.txt'); h = next(r)
    i_r, i_y, i_a, i_s = h.index('route_id'), h.index('route_type'), h.index('agency_id'), h.index('route_short_name')
    bus, RI = set(), {}
    for x in r:
        if x[i_y] in ('3', '8'):
            bus.add(x[i_r])
            RI[x[i_r]] = (agn.get(x[i_a], x[i_a]), x[i_s])   # אוטובוסים ומוניות שירות (סוג 8, שלמה 02.11) — בלי רכבת ורק"ל
    r = rd('trips.txt'); h = next(r)
    i_r, i_t = h.index('route_id'), h.index('trip_id')
    want = {}
    for x in r:
        want.setdefault(x[i_r], x[i_t])
    want = {t: rt for rt, t in want.items()}
    R = collections.defaultdict(dict)
    with z.open('stop_times.txt') as f:
        h = f.readline().decode('utf-8-sig').strip().split(',')
        i_t, i_s, i_q = h.index('trip_id'), h.index('stop_id'), h.index('stop_sequence')
        mx = max(i_t, i_s, i_q) + 1
        for ln in f:
            x = ln.split(b',', mx)
            rt = want.get(x[i_t].decode())
            if rt:
                c = sid.get(x[i_s].decode())
                if c in S:
                    R[rt][int(x[i_q])] = c
    if zp.startswith(f'{CACHE}/gtfs-'):
        os.remove(zp)
    return dict(R), S, bus, RI


def gps_quality(ds, RI, cells, jumps, trip, nb):
    """אמינות השידורים (שלמה 02.11) → $SPEED_CACHE/D.gps.json.gz:
    "fake": אירועי זיוף GPS — [מפעיל, קו, רכב, יציאה, רוחב אמיתי, אורך אמיתי, [[רוחב, אורך, שעה, ק"מ מהאמיתי]…]].
    אירוע קצר (עד 3 ק"מ) שכל נקודותיו על רחובות שאוטובוסים עברו בהם היום — רעש GPS בעיר, לא זיוף.
    "trips": לכל מפעיל [נסיעות, הופיעו יותר משעה אחרי היציאה, שידרו 4+ שעות].
    "tl": לכל מפעיל {קו: נסיעות בשעה אחרת}. "nb": שידורים תקינים לכל מפעיל."""
    def on(la, lo):
        k = (round(la / 0.002), round(lo / 0.002))
        return sum(cells.get((k[0] + a, k[1] + b), 0) for a in (-1, 0, 1) for b in (-1, 0, 1)) >= 20
    # נקודת זיוף קבועה (למשל בים מול אשדוד): ריבוע של ~1 ק"מ שהרבה רכבים שונים "קופצים" אליו או ממנו. כשה"מיקום
    # התקין" נמצא בריבוע כזה, שכיח יותר מהצד השני של הקפיצה — הוא המזויף, והמסלול הוא האמיתי
    cell = lambda a, b: (round(a / 0.01), round(b / 0.01))  # noqa: E731
    seen = collections.defaultdict(set)
    for v, _, _, ra, ro, pts in jumps:
        seen[cell(ra, ro)].add(v); seen[cell(pts[0][0], pts[0][1])].add(v)
    hot = {k: len(v) for k, v in seen.items()}
    fake = []
    for veh, line, dep, ra, ro, pts in jumps:
        if max(x[3] for x in pts) <= 3 and all(on(x[0], x[1]) for x in pts):
            continue
        # הפוך: ה"מיקום התקין" עצמו היה מזויף (למשל השידור הראשון של הרכב — בים), והמסלול הוא האמיתי
        hr, hp = hot[cell(ra, ro)], hot[cell(pts[0][0], pts[0][1])]
        if (hr >= 3 and hr > hp) or (not on(ra, ro) and 2 * sum(on(x[0], x[1]) for x in pts) > len(pts)):
            pts, ra, ro = [[ra, ro, pts[0][2], pts[0][3]]], pts[0][0], pts[0][1]
        ag, ln = RI.get(line, ('?', ''))
        fake.append([ag, ln, veh.split('/', 1)[-1], dep, ra, ro, pts])
    tr = collections.defaultdict(lambda: [0, 0, 0])
    tl = collections.defaultdict(collections.Counter)
    for (line, dep, veh), (f, l, d) in trip.items():
        ag, ln = RI.get(line, ('?', ''))
        a = tr[ag]
        a[0] += 1
        late, stale = f - d > 3600, l - d > 4 * 3600
        a[1] += late; a[2] += stale
        if late or stale:
            tl[ag][ln] += 1
    with gzip.open(f'{CACHE}/{ds}.gps.tmp', 'wt') as f:
        json.dump({'d': ds, 'fake': fake, 'nb': nb, 'trips': tr, 'tl': {k: dict(v.most_common(30)) for k, v in tl.items()}},
                  f, ensure_ascii=False, separators=(',', ':'))
    os.replace(f'{CACHE}/{ds}.gps.tmp', f'{CACHE}/{ds}.gps.json.gz')
    print(f'{ds}: אמינות השידורים — {len(fake)} אירועי זיוף ({sum(len(x[6]) for x in fake)} שידורים) מ-{len(jumps)} קפיצות, {len(trip):,} נסיעות', flush=True)


def stop_load(ds, S, at, app, mins):
    """סיכום היום לשכבת "עומס בתחנות" (שלמה 30.10) → $SPEED_CACHE/D.load.json.gz:
    {"mins": [דקות עם נתונים לכל שעה], "s": {מק"ט: [רוחב, אורך, [[שעה, דקות עם 3+, Σאוטובוסים, Σמהירות בתור,
    דגימות, Σמהירות פנויה, דגימות]…], [[קו, דקות בתחנה, מהן בתור]…], [[קו, קו, דקות יחד, "דקות לכל שעה"]…]]}}"""
    mh = [0] * 24
    for m in mins:
        mh[int(m[:2])] += 1
    H = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0, 0.0, 0, 0.0, 0]))
    pres = collections.defaultdict(collections.Counter)
    inq = collections.defaultdict(collections.Counter)
    pair = collections.defaultdict(collections.Counter)
    pairh = collections.defaultdict(lambda: collections.defaultdict(lambda: [0] * 24))
    for (c, m), vs in at.items():
        h, n = int(m[:2]), len(vs)
        e = H[c][h]
        e[1] += n
        if n >= 3:
            e[0] += 1
        ls = sorted(set(vs.values()))
        for x in ls:
            pres[c][x] += 1
            if n >= 3:
                inq[c][x] += 1
        for i in range(len(ls)):
            for j in range(i + 1, len(ls)):
                pair[c][(ls[i], ls[j])] += 1
                pairh[c][(ls[i], ls[j])][h] += 1
    for (c, m), sp in app.items():
        n = len(at.get((c, m), ()))
        e = H[c][int(m[:2])]
        if n >= 3:
            e[2] += sum(sp); e[3] += len(sp)
        elif n <= 1:
            e[4] += sum(sp); e[5] += len(sp)
    out = {}
    for c, hs in H.items():
        if not pres[c]:
            continue
        la, lo = S[c]
        out[c] = [round(la, 5), round(lo, 5),
                  [[h, e[0], e[1], round(e[2]), e[3], round(e[4]), e[5]] for h, e in sorted(hs.items())],
                  [[x, n, inq[c][x]] for x, n in pres[c].most_common(40)],
                  [[a, b, n, ','.join(str(v) if v else '' for v in pairh[c][(a, b)]).rstrip(',')] for (a, b), n in pair[c].most_common(15)]]
    with gzip.open(f'{CACHE}/{ds}.load.tmp', 'wt') as f:
        json.dump({'d': ds, 'mins': mh, 's': out}, f, separators=(',', ':'))
    os.replace(f'{CACHE}/{ds}.load.tmp', f'{CACHE}/{ds}.load.json.gz')
    print(f'{ds}: עומס בתחנות — {len(out):,} תחנות', flush=True)


def build(n=DAYS):
    have = sorted(f[:10] for f in os.listdir(CACHE) if len(f) == 18 and f.endswith('.json.gz'))[-n:]   # בלי D.bunch.json.gz
    def load(ds):
        with gzip.open(f'{CACHE}/{ds}.json.gz', 'rt') as f:
            return json.load(f)
    meta = {}
    for ds in have[:]:   # קודם רק מספר הדגימות — כדי לא להחזיק 28 ימים בזיכרון
        try:
            meta[ds] = {'used': load(ds)['used']}
        except Exception as e:  # noqa: BLE001 — קובץ פגום: מדלגים על היום
            print(f'{ds}: קובץ פגום ({e}) — בחוץ')
            have.remove(ds)
    # סוג היום: א'–ה' / שישי (שבת — כמעט בלי אוטובוסים). חג או יום חריג (פחות מ-75% מהדגימות הרגילות) — בחוץ
    typ = {ds: ('wd' if datetime.date.fromisoformat(ds).weekday() in (6, 0, 1, 2, 3) else
                'fr' if datetime.date.fromisoformat(ds).weekday() == 4 else None) for ds in have}
    keep = collections.defaultdict(list)
    for t in ('wd', 'fr'):
        ds_t = [ds for ds in have if typ[ds] == t]
        if not ds_t:
            continue
        med = sorted(meta[ds]['used'] for ds in ds_t)[len(ds_t) // 2]
        keep[t] = [ds for ds in ds_t if meta[ds]['used'] >= 0.75 * med]
    # לכל מקום: [דגימות, Σרוחב, Σאורך, Σsin, Σcos, [דגימות, Σמהירות] × 24 שעות × (א'–ה', שישי)]
    acc = {}
    for t, dss in keep.items():
        for ds in dss:
            m = load(ds)
            keys = []
            for cy, cx, s, n, sla, slo, ssin, scos in m['geo']:
                a = acc.get((cy, cx, s))
                if a is None:
                    a = acc[(cy, cx, s)] = [0, 0.0, 0.0, 0.0, 0.0, [0] * 96]
                a[0] += n; a[1] += sla; a[2] += slo; a[3] += ssin; a[4] += scos
                keys.append(a[5])
            o = 0 if t == 'wd' else 48
            for i, h, n, sv, slow in m['rows']:
                b = keys[i]
                b[o + 2 * h] += n; b[o + 2 * h + 1] += sv
            del m
    # בצומת יש בכל ריבוע כמה כיוונים. כיוון חלש (פחות מרבע מהחזק, ולא הכיוון ההפוך שלו) — אוטובוסים
    # שפונים — לא מצויר. רחוב שחוצה רחוב אחר מסומן (צומת) ומצויר קצר יותר, כדי שלא ייראה כמו X גדול
    top = {}
    for (cy, cx, s), a in acc.items():
        if a[0] > top.get((cy, cx), (0, 0))[0]:
            top[(cy, cx)] = (a[0], s)
    kinds = collections.defaultdict(set)
    tiles = collections.defaultdict(list)
    keep_k = []
    for (cy, cx, s), (n, sla, slo, ssin, scos, hrs) in acc.items():
        # כיוון ממוצע לא מייצג (אוטובוסים פונים לכמה כיוונים) — לא מציירים
        if n < MIN_TOTAL or math.hypot(ssin, scos) / n < 0.75:
            continue
        tn, ts = top[(cy, cx)]
        if n < 0.25 * tn and (s - ts) % 8 != 4:
            continue
        keep_k.append((cy, cx, s))
        kinds[(cy, cx)].add(s % 4)
    geoms = shape_geoms(set(keep_k))
    tkeys = collections.defaultdict(list)
    for (cy, cx, s) in keep_k:
        n, sla, slo, ssin, scos, hrs = acc[(cy, cx, s)]
        la, lo = sla / n, slo / n
        # [רוחב, אורך, כיוון, דגימות, מהירות לכל שעה א'–ה' (מחרוזת, ריק = מעט מדי), שישי, צומת, הקו לאורך הכביש: [רוחב×10⁵, אורך×10⁵, ואז הפרשים] או 0]
        rec = [round(la, 5), round(lo, 5), round(math.degrees(math.atan2(ssin, scos)) % 360), n]
        for t in ('wd', 'fr'):
            o = 0 if t == 'wd' else 48
            sp = [str(round(hrs[o + 2 * h + 1] / hrs[o + 2 * h])) if hrs[o + 2 * h] >= MIN_N else '' for h in range(24)]
            rec.append(','.join(sp).rstrip(','))
        rec.append(1 if len(kinds[(cy, cx)]) > 1 else 0)
        rec.append(geoms.get((cy, cx, s), 0))
        t = (math.floor(la / TILE), math.floor(lo / TILE))
        tiles[t].append(rec)
        tkeys[t].append((cy, cx, s))
    os.makedirs(OUT, exist_ok=True)
    bunching(keep.get('wd', []))
    load_tiles(keep.get('wd', []))
    names = cities(acc)
    os.makedirs(f'{OUT}/t', exist_ok=True)
    for f in os.listdir(f'{OUT}/t'):
        os.remove(f'{OUT}/t/{f}')
    for (ty, tx), recs in tiles.items():
        with open(f'{OUT}/t/{ty}_{tx}.json', 'w') as f:
            json.dump(recs, f, separators=(',', ':'))
    city_export(names or [], tiles)
    gps_files(have, typ)
    dd = by_day(have, typ, load, tiles, tkeys)
    info = {'dd': dd, 'tile': TILE, 'tiles': sorted(f'{ty}_{tx}' for ty, tx in tiles),
            'days': {t: v for t, v in keep.items()}, 'skipped': [ds for ds in have if typ[ds] and ds not in keep[typ[ds]]],
            'cells': sum(len(v) for v in tiles.values()), 'built': datetime.date.today().isoformat()}
    with open(f'{OUT}/meta.json', 'w') as f:
        json.dump(info, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{info["cells"]:,} מקומות ב-{len(tiles)} אריחים · א\'–ה\': {len(keep["wd"])} ימים · שישי: {len(keep["fr"])} · בחוץ: {info["skipped"]}')


BYDAY = 14   # כמה ימים אחרונים אפשר לבחור "לפי יום"


def by_day(have, typ, load, tiles, tkeys):
    """"לפי יום" (שלמה 29.10): לכל אחד מ-BYDAY הימים האחרונים (בלי שבת) — קובץ לכל אריח, באותו סדר של
    המקומות באריח הראשי: מחרוזת מהירויות לכל שעה (שעה עם 2 דגימות ומעלה). OUT/d/<תאריך>/<אריח>.json.
    הדף מציג יום אחד או ממוצע של כמה ימים שנבחרו. מחזיר [[תאריך, סוג יום]…] מהחדש לישן."""
    import shutil
    days = [ds for ds in have if typ[ds]][-BYDAY:]
    if os.path.isdir(f'{OUT}/d'):
        for x in os.listdir(f'{OUT}/d'):
            if x not in days:
                shutil.rmtree(f'{OUT}/d/{x}')
    want = {k for ks in tkeys.values() for k in ks}
    for ds in days:
        m = load(ds)
        g = m['geo']
        hrs = {}
        for i, h, n, sv, slow in m['rows']:
            k = tuple(g[i][:3])
            if k not in want:
                continue
            a = hrs.get(k)
            if a is None:
                a = hrs[k] = [0] * 48
            a[2 * h] += n; a[2 * h + 1] += sv
        del m, g
        os.makedirs(f'{OUT}/d/{ds}', exist_ok=True)
        for t, ks in tkeys.items():
            arr = []
            for k in ks:
                a = hrs.get(k)
                arr.append(','.join(str(round(a[2 * h + 1] / a[2 * h])) if a[2 * h] >= 2 else '' for h in range(24)).rstrip(',') if a else '')
            with open(f'{OUT}/d/{ds}/{t[0]}_{t[1]}.json', 'w') as f:
                json.dump(arr, f, separators=(',', ':'))
    return [[ds, typ[ds]] for ds in reversed(days)]


def bunching(days):
    """שכבת ההתקבצות (שלמה 29.10): לכל תחנה — כמה זוגות של שני אוטובוסים עוקבים של אותו קו הגיעו צמודים
    (פחות מ-30% מהמרווח המתוכנן), בכל שעה, בימי החול. מקור: D.bunch.json.gz מ-tools/bus_reliability.py
    (אותה הגדרה כמו במדד דיוק האוטובוסים). פלט: OUT/b/<אריח>.json —
    [רוחב, אורך, מק"ט, שם, זוגות, צמודים, רווח כפול, "זוגות לכל שעה", "צמודים לכל שעה", [[קו, יעד, זוגות, צמודים]…]]"""
    acc, used = {}, []
    for ds in days:
        p = f'{CACHE}/{ds}.bunch.json.gz'
        if not os.path.exists(p):
            continue
        try:
            with gzip.open(p, 'rt') as f:
                day = json.load(f)
        except Exception:  # noqa: BLE001
            continue
        used.append(ds)
        for code, (la, lo, hrs, top) in day.items():
            a = acc.get(code)
            if a is None:
                a = acc[code] = [la, lo, [0] * 72, {}]
            for h, n, b, g in hrs:
                a[2][3 * h] += n; a[2][3 * h + 1] += b; a[2][3 * h + 2] += g
            for rid, n, b in top:
                r = a[3].setdefault(rid, [0, 0])
                r[0] += n; r[1] += b
    for f in os.listdir(f'{OUT}/b') if os.path.isdir(f'{OUT}/b') else []:
        os.remove(f'{OUT}/b/{f}')
    if not used:
        print('התקבצות: אין עדיין קבצים')
        return
    try:
        routes = json.load(open('bus/data/routes.json', encoding='utf-8'))
        names = json.load(open('bus/data/stops.json', encoding='utf-8'))
    except Exception:  # noqa: BLE001
        routes, names = {}, {}
    tiles = collections.defaultdict(list)
    for code, (la, lo, h, top) in acc.items():
        n, b, g = sum(h[0::3]), sum(h[1::3]), sum(h[2::3])
        if n < 20:
            continue
        rs = []
        for rid, (rn, rb) in sorted(top.items(), key=lambda x: -x[1][1])[:4]:
            r = routes.get(rid) or []
            to = (r[2].split('<->')[-1].rsplit('-', 1)[0] if len(r) > 2 and '<->' in r[2] else '')
            rs.append([r[1] if len(r) > 1 else '', to, rn, rb])
        nm = names.get(code)
        tiles[(math.floor(la / TILE), math.floor(lo / TILE))].append(
            [la, lo, code, nm if isinstance(nm, str) else (nm[0] if nm else ''), n, b, g,
             ','.join(str(x) if x else '' for x in h[0::3]).rstrip(','), ','.join(str(x) if x else '' for x in h[1::3]).rstrip(','), rs])
    os.makedirs(f'{OUT}/b', exist_ok=True)
    for (ty, tx), recs in tiles.items():
        with open(f'{OUT}/b/{ty}_{tx}.json', 'w', encoding='utf-8') as f:
            json.dump(recs, f, ensure_ascii=False, separators=(',', ':'))
    with open(f'{OUT}/bunch.json', 'w', encoding='utf-8') as f:
        json.dump({'days': used, 'tiles': sorted(f'{ty}_{tx}' for ty, tx in tiles)}, f, separators=(',', ':'))
    print(f'התקבצות: {sum(len(v) for v in tiles.values()):,} תחנות מ-{len(used)} ימים')
    pairs_out(used, {r[2]: k for k, recs in tiles.items() for r in recs}, routes)


def pairs_out(days, tile_of, routes):
    """כל הזוגות הצמודים בכל תחנה (שלמה 30.10: "לראות את כל ההתנגשויות") — לכרטיס התחנה במדד הדיוק.
    מקור: D.bpairs.json.gz (tools/bus_reliability.py). הרבה נתונים (כ-80 אלף זוגות ביום), ולכן לא בגיט של
    האתר: PAIRS_OUT/<אריח>.json נדחף לענף orphan בשם bunch-pairs (נדרס בכל ריצה) ומוגש מ-raw.githubusercontent.
    {"days": [ימים], "r": {route_id: [קו, יעד]}, "s": {מק"ט: [[יום, route_id, מתוכנן ב', בפועל ב',
    מרווח מתוכנן, מרווח בפועל]…]}} — שניות מתחילת היום; מרווח בפועל שלילי: השני עקף את הראשון."""
    out_dir = os.environ.get('PAIRS_OUT')
    if not out_dir:
        return
    per = collections.defaultdict(lambda: collections.defaultdict(list))
    have = []
    for di, ds in enumerate(days):
        p = f'{CACHE}/{ds}.bpairs.json.gz'
        if not os.path.exists(p):
            continue
        try:
            with gzip.open(p, 'rt') as f:
                day = json.load(f)
        except Exception:  # noqa: BLE001
            continue
        have.append(ds)
        for code, lst in day.items():
            t = tile_of.get(code)
            if t is None:
                continue
            for rid, s1, s2, a1, a2 in lst:
                per[t][code].append([di, rid, s2, a2, s2 - s1, a2 - a1])
    os.makedirs(out_dir, exist_ok=True)
    n = 0
    for (ty, tx), stops in per.items():
        rids = {e[1] for v in stops.values() for e in v}
        r = {}
        for rid in rids:
            x = routes.get(rid) or []
            r[rid] = [x[1] if len(x) > 1 else '', x[2].split('<->')[-1].rsplit('-', 1)[0] if len(x) > 2 and '<->' in x[2] else '']
        for v in stops.values():
            v.sort(key=lambda e: (-e[0], e[2]))
            n += len(v)
        with open(f'{out_dir}/{ty}_{tx}.json', 'w', encoding='utf-8') as f:
            json.dump({'days': days, 'r': r, 's': stops}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'זוגות צמודים: {n:,} ב-{sum(len(v) for v in per.values()):,} תחנות, מ-{len(have)} ימים')


def load_tiles(days):
    """שכבת "עומס בתחנות" (שלמה 30.10) — מ-D.load.json.gz של ימי החול. OUT/q/<אריח>.json — לכל תחנה:
    [רוחב, אורך, מק"ט, שם, עמודים, "% דקות עם 3+ לכל שעה", "אוטובוסים בממוצע ×10 לכל שעה",
     "מהירות לפני התחנה כשיש תור", "כשפנויה", [[קו, יעד, דקות בתחנה, מהן בתור]…], [[קו, יעד, קו, יעד, ביום, שעת שיא]…]]
    ושעה עם פחות מ-15 דגימות מהירות — ריקה. רק תחנות שבשעה כלשהי היה בהן תור לפחות 2% מהזמן. OUT/load.json: {"days", "tiles"}."""
    mins = [0] * 24
    acc, used = {}, []
    for ds in days:
        p = f'{CACHE}/{ds}.load.json.gz'
        if not os.path.exists(p):
            continue
        try:
            with gzip.open(p, 'rt') as f:
                day = json.load(f)
        except Exception:  # noqa: BLE001
            continue
        used.append(ds)
        mins = [a + b for a, b in zip(mins, day['mins'])]
        for c, (la, lo, hrs, lines, pairs) in day['s'].items():
            a = acc.get(c)
            if a is None:
                a = acc[c] = [la, lo, [[0] * 6 for _ in range(24)], collections.Counter(), collections.Counter(),
                              collections.Counter(), collections.defaultdict(lambda: [0] * 24)]
            for h, q, nb, sq, nq, sf, nf in hrs:
                e = a[2][h]
                e[0] += q; e[1] += nb; e[2] += sq; e[3] += nq; e[4] += sf; e[5] += nf
            for x, n, iq in lines:
                a[3][x] += n; a[4][x] += iq
            for x, y, n, hh in pairs:
                a[5][(x, y)] += n
                ph = a[6][(x, y)]
                for i, v in enumerate(hh.split(',')):
                    if v:
                        ph[i] += int(v)
    if os.path.isdir(f'{OUT}/q'):
        for f in os.listdir(f'{OUT}/q'):
            os.remove(f'{OUT}/q/{f}')
    if not used:
        print('עומס בתחנות: אין עדיין קבצים')
        return
    try:
        routes = json.load(open('bus/data/routes.json', encoding='utf-8'))
        names = json.load(open('bus/data/stops.json', encoding='utf-8'))
    except Exception:  # noqa: BLE001
        routes, names = {}, {}
    # עמודים: תחנות עם אותו שם עד 80 מ' (שדה "רציף" במשרד התחבורה כמעט תמיד ריק)
    try:
        rows = json.load(open('gis/data/own/bus-stops.json', encoding='utf-8'))['rows']
    except Exception:  # noqa: BLE001
        rows = []
    byname = collections.defaultdict(list)
    for r in rows:
        byname[r[3]].append((r[1], r[0]))
    def lname(x):
        r = routes.get(x) or []
        return [r[1] if len(r) > 1 else '', r[2].split('<->')[-1].rsplit('-', 1)[0] if len(r) > 2 and '<->' in r[2] else '']
    nd = len(used)
    tiles = collections.defaultdict(list)
    for c, (la, lo, H, pres, inq, pair, pairh) in acc.items():
        qs = [round(100 * e[0] / mins[h]) if mins[h] and e[1] else None for h, e in enumerate(H)]
        if max((x or 0) for x in qs) < 2:   # כמעט אף פעם לא עמדו בה 3 אוטובוסים — בלי עיגול
            continue
        q = ','.join('' if x is None else str(x) for x in qs).rstrip(',')
        av = ','.join(str(round(10 * e[1] / mins[h])) if mins[h] and e[1] else '' for h, e in enumerate(H)).rstrip(',')
        sq = ','.join(str(round(e[2] / e[3], 1)) if e[3] >= 15 and e[5] >= 15 else '' for e in H).rstrip(',')
        sf = ','.join(str(round(e[4] / e[5], 1)) if e[3] >= 15 and e[5] >= 15 else '' for e in H).rstrip(',')
        nm = names.get(c)
        nm = nm if isinstance(nm, str) else (nm[0] if nm else '')
        poles = 1 + sum(1 for y, x in byname.get(nm, []) if 0 < math.hypot((y - la) * 111000, (x - lo) * 93000) <= 80) if nm else 1
        # כמה מסלולים של אותו קו לאותו יעד (חלופות) — שורה אחת
        lp, li = collections.Counter(), collections.Counter()
        for x, n in pres.items():
            k = tuple(lname(x)); lp[k] += n; li[k] += inq[x]
        ls = [[*k, n, li[k]] for k, n in lp.most_common(10)]
        pp, phh = collections.Counter(), collections.defaultdict(lambda: [0] * 24)
        for (x, y), n in pair.items():
            k = tuple(sorted((tuple(lname(x)), tuple(lname(y)))))
            if k[0] == k[1]:
                continue
            pp[k] += n
            phh[k] = [a + b for a, b in zip(phh[k], pairh[(x, y)])]
        ps = [[*k[0], *k[1], round(n / nd, 1), max(range(24), key=lambda i: phh[k][i])] for k, n in pp.most_common(8) if n >= nd]
        tiles[(math.floor(la / TILE), math.floor(lo / TILE))].append([la, lo, c, nm, poles, q, av, sq, sf, ls, ps])
    os.makedirs(f'{OUT}/q', exist_ok=True)
    for (ty, tx), recs in tiles.items():
        with open(f'{OUT}/q/{ty}_{tx}.json', 'w', encoding='utf-8') as f:
            json.dump(recs, f, ensure_ascii=False, separators=(',', ':'))
    with open(f'{OUT}/load.json', 'w', encoding='utf-8') as f:
        json.dump({'days': used, 'tiles': sorted(f'{ty}_{tx}' for ty, tx in tiles)}, f, separators=(',', ':'))
    print(f'עומס בתחנות: {sum(len(v) for v in tiles.values()):,} תחנות מ-{nd} ימים')


def street_lookup():
    """(רוחב, אורך) → שם הרחוב הקרוב (עד 40 מ'), מקובץ הרחובות של OpenStreetMap שהרענון החודשי שומר בענף
    osm-roads (ROADS_JSON). None אם אין קובץ."""
    p = os.environ.get('ROADS_JSON')
    if not p or not os.path.exists(p):
        return None
    try:
        roads = json.load(open(p, encoding='utf-8'))['roads']
    except Exception:  # noqa: BLE001
        return None
    grid = collections.defaultdict(list)
    for rd in roads:
        g = rd['g']
        for a, b in zip(g, g[1:]):
            grid[(round(a[0] / 0.003), round(a[1] / 0.003))].append((a, b, rd['n']))
    def seg(p, a, b):
        ax, ay, bx, by, px, py = a[1] * 93000, a[0] * 111000, b[1] * 93000, b[0] * 111000, p[1] * 93000, p[0] * 111000
        dx, dy = bx - ax, by - ay
        t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)
    def near(la, lo):
        k, best = (round(la / 0.003), round(lo / 0.003)), (40, '')
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for a, b, n in grid.get((k[0] + dy, k[1] + dx), ()):
                    d = seg((la, lo), a, b)
                    if d < best[0]:
                        best = (d, n)
        return best[1]
    return near


def city_export(names, tiles):
    """הורדה לאקסל של כל הקטעים ביישוב (שלמה 01.11) — OUT/xl/<מספר היישוב ב-cities.json>.json:
    {"n": [שמות רחובות], "t": {אריח: [[מספר הרשומה באריח, מספר שם הרחוב או -1]…]}}. הרחוב — מ-OpenStreetMap
    (שלמה 03.11: "רוחב ואורך אף אחד לא מבין"); בלי קובץ רחובות — שם התחנה הקרובה (עד 200 מ').
    הדף טוען את האריחים עצמם (data/t) ולוקח מהם את המהירויות — כאן רק השיוך."""
    import shutil
    if os.path.isdir(f'{OUT}/xl'):
        shutil.rmtree(f'{OUT}/xl')
    lk = stop_lookup()
    if not lk or not names:
        return
    city, stop = lk
    street = street_lookup() or stop
    ix = {c: i for i, c in enumerate(names)}
    per = collections.defaultdict(lambda: [{}, collections.defaultdict(list)])
    for (ty, tx), recs in tiles.items():
        for i, r in enumerate(recs):
            c = city(r[0], r[1])
            if c not in ix:
                continue
            nm = street(r[0], r[1])
            e = per[ix[c]]
            j = e[0].setdefault(nm, len(e[0])) if nm else -1
            e[1][f'{ty}_{tx}'].append([i, j])
    os.makedirs(f'{OUT}/xl', exist_ok=True)
    for ci, (nm, t) in per.items():
        with open(f'{OUT}/xl/{ci}.json', 'w', encoding='utf-8') as f:
            json.dump({'n': list(nm), 't': t}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'אקסל לפי יישוב: {len(per)} יישובים')


def gps_files(have, typ):
    """אמינות השידורים לאתר (שלמה 02.11) — מ-D.gps.json.gz:
    OUT/gps/<תאריך>.json — אירועי הזיוף של היום למפה, כמו "fake" ב-gps_quality
    OUT/gpsq.json — למדד הדיוק (bus/), יום-יום, כדי שהדף יחבר כל תקופה שנבחרה (יום / 7 / 30):
    {"days": [[תאריך, סוג יום]…], "d": {תאריך: {"nb": {מפעיל: שידורים}, "trips": {מפעיל: [נסיעות, מאוחרות, 4+ שעות]},
     "fk": {מפעיל: זיופים}, "fl": {"קו|מפעיל": זיופים}, "fv": {"רכב|מפעיל": זיופים}, "tl": {"קו|מפעיל": נסיעות בשעה אחרת}}}}"""
    import shutil
    if os.path.isdir(f'{OUT}/gps'):
        shutil.rmtree(f'{OUT}/gps')
    loaded = {}
    for ds in have:
        p = f'{CACHE}/{ds}.gps.json.gz'
        if not os.path.exists(p) or not typ.get(ds):
            continue
        try:
            with gzip.open(p, 'rt') as f:
                loaded[ds] = json.load(f)
        except Exception:  # noqa: BLE001
            continue
    # מקום שחוזר בכמה ימים שונים (3 ומעלה, ריבוע של ~1 ק"מ) — שיבוש GPS קבוע באזור, לא זיוף של רכב: לא מוצג
    # ולא נספר (שלמה 03.11)
    cd = collections.defaultdict(set)
    for ds, g in loaded.items():
        for x in g['fake']:
            for q in x[6]:
                cd[(round(q[0], 2), round(q[1], 2))].add(ds)
    jam = {k for k, v in cd.items() if len(v) >= 3}
    days, per = [], {}
    for ds, g in loaded.items():
        # אירוע שרוב הנקודות שלו במקום של שיבוש קבוע — לא מוצג ולא נספר
        g['fake'] = [x for x in g['fake'] if 2 * sum((round(q[0], 2), round(q[1], 2)) in jam for q in x[6]) < len(x[6])]
        days.append([ds, typ[ds]])
        os.makedirs(f'{OUT}/gps', exist_ok=True)
        with open(f'{OUT}/gps/{ds}.json', 'w', encoding='utf-8') as f:
            json.dump(g['fake'], f, ensure_ascii=False, separators=(',', ':'))
        fk, fl, fv, tl = collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
        for ag, ln, veh, *_ in g['fake']:   # אירוע = זיוף אחד
            fk[ag] += 1; fl[f'{ln}|{ag}'] += 1; fv[f'{veh}|{ag}'] += 1
        for ag, lines in g['tl'].items():
            for ln, n in lines.items():
                tl[f'{ln}|{ag}'] += n
        per[ds] = {'nb': g['nb'], 'trips': g['trips'], 'fk': fk, 'fl': dict(fl.most_common(40)),
                   'fv': dict(fv.most_common(40)), 'tl': dict(tl.most_common(40))}
    with open(f'{OUT}/gpsq.json', 'w', encoding='utf-8') as f:
        json.dump({'days': days, 'd': per}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'אמינות השידורים: {len(days)} ימים, {sum(sum(x["fk"].values()) for x in per.values()):,} זיופים · {len(jam)} מקומות שיבוש קבוע לא נספרו')


def norm(c):
    """שם יישוב להשוואה בין מקורות: בלי גרשיים, מקפים, "יפו" (תל אביב - יפו / תל אביב יפו) ו-יי/וו כפולים."""
    c = str(c).replace('יפו', '').replace('יי', 'י').replace('וו', 'ו')   # קריית/קרית
    return ' '.join(''.join(ch if ch.isalnum() else ' ' for ch in c).split())


def stop_lookup():
    """(יישוב לפי מקום, שם התחנה הקרובה) — מהתחנה הקרובה בקובץ התחנות של ה-GIS. None אם אין קובץ."""
    try:
        st = json.load(open('gis/data/own/bus-stops.json', encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return None
    fi = st['fields']
    grid = collections.defaultdict(list)
    for r in st['rows']:
        lo, la, c = r[0], r[1], r[2 + fi.index('city')]
        grid[(round(la / 0.005), round(lo / 0.005))].append((la, lo, c, r[2 + fi.index('name')]))
    def near(la, lo, lim, need_city):
        best, bd = None, lim ** 2
        gy, gx = round(la / 0.005), round(lo / 0.005)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for x in grid.get((gy + dy, gx + dx), ()):
                    if need_city and not x[2]:
                        continue
                    d = (x[0] - la) ** 2 + ((x[1] - lo) * 0.85) ** 2
                    if d < bd:
                        best, bd = x, d
        return best
    city = lambda la, lo: (near(la, lo, 0.0036, True) or (0, 0, None))[2]          # noqa: E731 — עד 400 מ'
    stop = lambda la, lo: (near(la, lo, 0.0018, False) or (0, 0, '', ''))[3]       # noqa: E731 — עד 200 מ'
    return city, stop


def cities(acc):
    """לכל יישוב: מהירות ממוצעת בכל שעה בימי א'–ה' (כל הדגימות בתוך היישוב), ומספר התושבים.
    מקום שייך ליישוב של התחנה הקרובה אליו (עד 400 מ')."""
    lk = stop_lookup()
    if not lk:
        print('אין קובץ תחנות — בלי טבלת יישובים')
        return
    city = lk[0]
    try:
        pop = json.load(open(f'{OUT}/pop.json', encoding='utf-8'))
    except Exception:  # noqa: BLE001
        pop = {}
    popn = {norm(k): v for k, v in pop.items()}
    agg = collections.defaultdict(lambda: [[0, 0] for _ in range(48)])   # 24 שעות א'–ה', ואחריהן 24 של שישי
    cen = collections.defaultdict(lambda: [0, 0.0, 0.0])
    for (cy, cx, s), (n, sla, slo, *_ , hrs) in acc.items():
        c = city(sla / n, slo / n)
        if not c:
            continue
        a = agg[c]
        m = cen[c]; m[0] += n; m[1] += sla; m[2] += slo
        for h in range(48):
            a[h][0] += hrs[2 * h]; a[h][1] += hrs[2 * h + 1]
    out = []
    for c, a in agg.items():
        tot = sum(x[0] for x in a[:24])
        if tot < 20000 or (popn and (popn.get(norm(c)) or 0) < 5000):
            continue
        sp = [round(x[1] / x[0], 1) if x[0] >= 200 else None for x in a]
        m = cen[c]
        # [יישוב, תושבים, דגימות, רוחב, אורך, מהירות בכל שעה בימי א'–ה', בשישי] — שישי נפרד (שלמה 02.11:
        # בשישי ב-23:00 הוצג עיגול בבני ברק — הממוצע של ימי החול, כי לא היה ליישובים מידע לשישי)
        out.append([c, popn.get(norm(c)), tot, round(m[1] / m[0], 4), round(m[2] / m[0], 4), sp[:24], sp[24:]])
    out.sort(key=lambda r: -(r[1] or 0))
    with open(f'{OUT}/cities.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} יישובים, {sum(1 for r in out if r[1])} עם מספר תושבים')
    return [r[0] for r in out]


def population():
    """מספר התושבים בכל יישוב — רשות האוכלוסין (תושבים לפי יישוב וקבוצות גיל), דרך ה-API של data.gov.il.
    אם המזהה השתנה — מחפשים טבלה עם שם יישוב וסה"כ תושבים."""
    api = 'https://data.gov.il/api/3/action/'

    def get(u):
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'kavbochan'}), timeout=60) as r:
            return json.load(r)

    def fields(rid):
        try:
            return [f['id'] for f in get(f'{api}datastore_search?resource_id={rid}&limit=1')['result']['fields']]
        except Exception:  # noqa: BLE001
            return []

    def pick(fs):
        name = next((f for f in fs if 'שם' in f and ('ישוב' in f or 'יישוב' in f)), None)
        tot = next((f for f in fs if f.replace('"', '').replace('_', ' ').strip() in ('סהכ', 'סה כ', 'סהכ תושבים')), None)
        return name, tot

    rid = os.environ.get('POP_RESOURCE', '64edd0ee-3d5d-43ce-8562-c336c24dbc1f')
    name, tot = pick(fields(rid))
    if not (name and tot):
        for q in ('תושבים יישוב', 'אוכלוסייה יישובים', 'מספר תושבים'):
            for pk in get(f'{api}package_search?q={urllib.parse.quote(q)}&rows=20')['result']['results']:
                for res in pk.get('resources') or []:
                    if res.get('datastore_active'):
                        n2, t2 = pick(fields(res['id']))
                        if n2 and t2:
                            rid, name, tot = res['id'], n2, t2
                            break
                if name and tot:
                    break
            if name and tot:
                break
    if not (name and tot):
        raise SystemExit('לא נמצאה טבלת תושבים לפי יישוב')
    print('טבלה:', rid, 'שדות:', name, tot)
    rows, off = [], 0
    while True:
        j = get(f'{api}datastore_search?resource_id={rid}&limit=5000&offset={off}')['result']
        rows += j['records']
        off += 5000
        if off >= j['total']:
            break
    pop = {}
    for r in rows:
        try:
            k = str(r[name]).strip()
            pop[k] = pop.get(k, 0) + int(float(str(r[tot]).replace(',', '')))
        except Exception:  # noqa: BLE001
            pass
    if len(pop) < 500:
        raise SystemExit(f'רק {len(pop)} יישובים — לא נשמר')
    os.makedirs(OUT, exist_ok=True)
    with open(f'{OUT}/pop.json', 'w', encoding='utf-8') as f:
        json.dump(pop, f, ensure_ascii=False, separators=(',', ':'))
    print(len(pop), 'יישובים; למשל', sorted(pop.items(), key=lambda x: -x[1])[:5])


if __name__ == '__main__':
    if sys.argv[1] == 'day':
        for ds in sys.argv[2:]:
            day(ds)
    elif sys.argv[1] == 'pop':
        population()
    else:
        build(int(sys.argv[2]) if len(sys.argv) > 2 else DAYS)
