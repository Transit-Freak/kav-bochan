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
                out.append((mj.get('VehicleRef'), v['RecordedAtTime'], float(loc['Latitude']), float(loc['Longitude']),
                            float(mj.get('Velocity') or 0), float(mj.get('Bearing') or 0), mj.get('OriginAimedDepartureTime') or ''))
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
    with ThreadPoolExecutor(24) as ex:
        for b in ex.map(fetch, keys):
            if not b:
                continue
            files += 1
            for veh, rt, la, lo, vel, br, dep in parse(b):
                recs += 1
                if not rt.startswith(ds) or last.get(veh) == rt:
                    continue
                last[veh] = rt
                if dep and rt < dep:  # ממתין במסוף לפני היציאה (אותו אזור זמן — השוואת מחרוזות)
                    continue
                if not (29.3 < la < 33.5 and 34.2 < lo < 35.9) or vel > 130:
                    continue
                s = int(((br + 22.5) % 360) // 45)
                k = (round(la / CY), round(lo / CX), s)
                g = geo[k]
                g[0] += 1; g[1] += la; g[2] += lo; g[3] += math.sin(math.radians(br)); g[4] += math.cos(math.radians(br))
                a = hrs[(*k, int(rt[11:13]))]
                a[0] += 1; a[1] += vel; a[2] += vel < 10
                used += 1
    gk = list(geo)
    ix = {k: i for i, k in enumerate(gk)}
    g = [[*k, a[0], round(a[1], 3), round(a[2], 3), round(a[3], 1), round(a[4], 1)] for k, a in ((k, geo[k]) for k in gk)]
    rows = [[ix[k[:3]], k[3], a[0], round(a[1]), a[2]] for k, a in hrs.items()]
    os.makedirs(CACHE, exist_ok=True)
    with gzip.open(f'{CACHE}/{ds}.tmp', 'wt') as f:   # שם זמני — build לא יקרא קובץ באמצע כתיבה
        json.dump({'d': ds, 'files': files, 'recs': recs, 'used': used, 'geo': g, 'rows': rows}, f, separators=(',', ':'))
    os.replace(f'{CACHE}/{ds}.tmp', f'{CACHE}/{ds}.json.gz')
    print(f'{ds}: {files} קבצים, {used:,} דגימות, {len(g):,} מקומות, {round(time.time() - st)} שנ\'', flush=True)


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
    cities(acc)
    os.makedirs(f'{OUT}/t', exist_ok=True)
    for f in os.listdir(f'{OUT}/t'):
        os.remove(f'{OUT}/t/{f}')
    for (ty, tx), recs in tiles.items():
        with open(f'{OUT}/t/{ty}_{tx}.json', 'w') as f:
            json.dump(recs, f, separators=(',', ':'))
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


def norm(c):
    """שם יישוב להשוואה בין מקורות: בלי גרשיים, מקפים, "יפו" (תל אביב - יפו / תל אביב יפו) ו-יי/וו כפולים."""
    c = str(c).replace('יפו', '').replace('יי', 'י').replace('וו', 'ו')   # קריית/קרית
    return ' '.join(''.join(ch if ch.isalnum() else ' ' for ch in c).split())


def cities(acc):
    """לכל יישוב: מהירות ממוצעת בכל שעה בימי א'–ה' (כל הדגימות בתוך היישוב), ומספר התושבים.
    מקום שייך ליישוב של התחנה הקרובה אליו (עד 400 מ')."""
    try:
        st = json.load(open('gis/data/own/bus-stops.json', encoding='utf-8'))
    except Exception:  # noqa: BLE001
        print('אין קובץ תחנות — בלי טבלת יישובים')
        return
    fi = st['fields']
    grid = collections.defaultdict(list)
    for r in st['rows']:
        lo, la, c = r[0], r[1], r[2 + fi.index('city')]
        if c:
            grid[(round(la / 0.005), round(lo / 0.005))].append((la, lo, c))
    def city(la, lo):
        best, bd = None, 0.0036 ** 2
        gy, gx = round(la / 0.005), round(lo / 0.005)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for a, b, c in grid.get((gy + dy, gx + dx), ()):
                    d = (a - la) ** 2 + ((b - lo) * 0.85) ** 2
                    if d < bd:
                        best, bd = c, d
        return best
    try:
        pop = json.load(open(f'{OUT}/pop.json', encoding='utf-8'))
    except Exception:  # noqa: BLE001
        pop = {}
    popn = {norm(k): v for k, v in pop.items()}
    agg = collections.defaultdict(lambda: [[0, 0] for _ in range(24)])
    cen = collections.defaultdict(lambda: [0, 0.0, 0.0])
    for (cy, cx, s), (n, sla, slo, *_ , hrs) in acc.items():
        c = city(sla / n, slo / n)
        if not c:
            continue
        a = agg[c]
        m = cen[c]; m[0] += n; m[1] += sla; m[2] += slo
        for h in range(24):
            a[h][0] += hrs[2 * h]; a[h][1] += hrs[2 * h + 1]
    out = []
    for c, a in agg.items():
        tot = sum(x[0] for x in a)
        if tot < 20000 or (popn and (popn.get(norm(c)) or 0) < 5000):
            continue
        sp = [round(x[1] / x[0], 1) if x[0] >= 200 else None for x in a]
        m = cen[c]
        # [יישוב, תושבים, דגימות, רוחב, אורך, מהירות ממוצעת בכל שעה בימי א'–ה']
        out.append([c, popn.get(norm(c)), tot, round(m[1] / m[0], 4), round(m[2] / m[0], 4), sp])
    out.sort(key=lambda r: -(r[1] or 0))
    with open(f'{OUT}/cities.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} יישובים, {sum(1 for r in out if r[1])} עם מספר תושבים')


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
