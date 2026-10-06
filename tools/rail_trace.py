#!/usr/bin/env python3
"""איפה הרכבת צוברת איחור — מעקב דקה-אחר-דקה מהשידורים הגולמיים (שלמה 06.10).

המדד הלילי (rail_reliability.py) מודד הגעה לתחנה רק כשיש שידור GPS עד 500 מ׳ ממנה, וכך נמדדות
כ-40% מההגעות. אבל רכבת ישראל משדרת בכל דקה גם את "התחנה הנוכחית" (MonitoredCall), גם כשאין
GPS — למשל בתחנה התת-קרקעית בנתב"ג. כאן משלבים את שניהם:

  - הגעה = השידור הראשון שבו הרכבת עומדת (מהירות 0) בתחנה; בלי עמידה — השידור הראשון עד 350 מ׳
    מהתחנה; בלי GPS — הרגע שבו "התחנה הנוכחית" התחלפה אליה (כדקה לפני העצירה).
    בדיקה מול המדד הקיים ב-05.10: חציון הפרש 0.0 דק׳, 80% בטווח ±1.3 דק׳; ההגעות שנמדדו
    בשעות 06–14 עלו מ-1,240 ל-2,775 מתוך 3,120.
  - יציאה = השידור הראשון שבו הרכבת זזה אחרי העמידה בתחנה.
  - איחור שנצבר בקטע A→B = איחור ההגעה ל-B פחות האיחור ב-A (כולל העמידה ב-A). ביציאה מתחנת
    המוצא — מול זמן היציאה המתוכנן.
  - "בוטלה באמצע המסלול" (הכלל של שלמה, 06.10): הרכבת לא הגיעה לתחנה הבאה 20 דקות אחרי שהייתה
    אמורה להגיע אליה. שני מקרים: המשיכה לשדר ונשארה במקום (stuck), או הפסיקה לשדר בזמן שרכבות
    אחרות המשיכו (silent). במקרה השני רק כשנותרו לה לפחות 3 תחנות: כמעט כל הרכבות מפסיקות לשדר
    תחנה-שתיים לפני היעד, וזו תכונה של השידור ולא ביטול.

מקור: הארכיון הגולמי של דאטאבוס ב-S3 (stride-siri-requester/YYYY/MM/DD/HH/MM.br, שעון UTC),
צילום של כל הרכבים בכל דקה. הלו"ז המתוכנן — מ-rail/data/days/<יום>.json של המדד הלילי.

פלט:
  rail/data/trace/<יום>.json  — לכל רכבת: [תחנה, מתוכנן, איחור הגעה, איחור יציאה, מקור, עמידה]
  rail/data/trace/sum/<יום>.json — סיכום קטן לתצוגת התקופה: קטעים, קווים, רכבות שנעצרו
  rail/data/trace/index.json  — רשימת הימים

הפעלה: FROM=2026-10-01 TO=2026-10-05 python3 tools/rail_trace.py   (ברירת מחדל: ימים שחסרים)
"""
import concurrent.futures as cf
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'rail', 'data')
OUT = os.path.join(DATA, 'trace')
S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com/stride-siri-requester/'
TZ = ZoneInfo('Asia/Jerusalem')
NEAR_M = 350          # "בתחנה" לפי GPS
CANCEL_AFTER = 20     # דקות אחרי ההגעה הצפויה לתחנה הבאה — בלי הגעה, הרכבת נחשבת שבוטלה
CUT_MIN_STOPS = 3


def log(*a):
    print(*a, flush=True)


def hav(la1, lo1, la2, lo2):
    r = math.pi / 180
    a = math.sin((la2 - la1) * r / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin((lo2 - lo1) * r / 2) ** 2
    return 12742000 * math.asin(math.sqrt(a))


def fetch(key):
    import brotli   # רק בהורדה — כך הבדיקות רצות גם בלי החבילה
    for i in range(4):
        try:
            with urllib.request.urlopen(S3 + key, timeout=60) as r:
                return brotli.decompress(r.read())
        except Exception as e:  # noqa: BLE001 — קובץ חסר/פגום בארכיון: מדלגים על הדקה
            if getattr(e, 'code', None) == 404:
                return None
            time.sleep(1 + i * 2)
    return None


def walk(o):
    if isinstance(o, dict):
        if 'MonitoredVehicleJourney' in o:
            yield o
            return
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def collect(day):
    """כל שידורי הרכבות של יום נסיעה אחד: {מספר רכבת: [(דקה, תחנה, מרחק מצטבר, מהירות, lat, lon)]}."""
    d0 = dt.datetime.combine(dt.date.fromisoformat(day), dt.time(0, 0), TZ)
    start = d0.astimezone(dt.timezone.utc)
    end = (d0 + dt.timedelta(hours=27)).astimezone(dt.timezone.utc)   # עד 03:00 למחרת
    keys = []
    t = start
    while t < end:
        keys.append(t.strftime('%Y/%m/%d/%H/%M') + '.br')
        t += dt.timedelta(minutes=1)
    T, seen, last_any, got = {}, set(), 0, 0
    with cf.ThreadPoolExecutor(24) as ex:
        for raw in ex.map(fetch, keys):
            if not raw:
                continue
            got += 1
            try:
                doc = json.loads(raw)
            except ValueError:
                continue
            for v in walk(doc):
                j = v.get('MonitoredVehicleJourney') or {}
                if str(j.get('OperatorRef')) != '2':
                    continue
                fr = j.get('FramedVehicleJourneyRef') or {}
                if fr.get('DataFrameRef') != day:
                    continue
                tn, ts = str(j.get('VehicleRef') or fr.get('DatedVehicleJourneyRef') or ''), v.get('RecordedAtTime') or ''
                if not tn or len(ts) < 19 or (tn, ts) in seen:
                    continue
                seen.add((tn, ts))
                lt = dt.datetime.fromisoformat(ts).astimezone(TZ)
                m = (lt - d0).total_seconds() / 60
                mc, loc = j.get('MonitoredCall') or {}, j.get('VehicleLocation') or {}
                try:
                    la, lo = float(loc.get('Latitude') or 0), float(loc.get('Longitude') or 0)
                except ValueError:
                    la = lo = 0.0
                try:
                    dist = float(mc.get('DistanceFromStop') or 0)
                    vel = float(j.get('Velocity') or 0)
                except ValueError:
                    dist, vel = 0.0, 0.0
                T.setdefault(tn, []).append((round(m, 2), str(mc.get('StopPointRef') or ''), dist, vel, la, lo))
                last_any = max(last_any, m)
    for tn in T:
        T[tn].sort()
    log(f'  {day}: {got}/{len(keys)} דקות בארכיון · {len(T)} רכבות שידרו')
    return T, last_any, got / max(1, len(keys))


def frozen_tail(seq):
    """אינדקס שממנו השידור "קפא" עד הסוף (אותו מיקום ואותו מרחק בכל השידורים) — מה שאחריו לא אמין."""
    # משווים גם את "התחנה הנוכחית": שידורים בלי GPS (מיקום 0) זהים זה לזה גם כשהרכבת מתקדמת
    k = len(seq) - 1
    while k > 0 and seq[k - 1][1:] == seq[k][1:]:
        k -= 1
    return k + 1 if k < len(seq) - 1 else len(seq)


def unfreeze(seq):
    """GPS שנתקע: אותו מיקום ואותו מרחק בשידורים רצופים, בזמן ש"התחנה הנוכחית" ממשיכה להתחלף
    (רכבת 506 ב-05.10: ה-GPS נשאר בבית שמש עד 08:18, והתחנה התחלפה לרמלה וללוד בזמן). מערכת
    המעקב של הרכבת עצמה ממשיכה לעבוד — מתייחסים לשידורים האלה כשידורים בלי GPS."""
    out, i = list(seq), 0
    while i < len(out):
        j = i
        while j + 1 < len(out) and out[j + 1][4] and out[j + 1][2] == out[i][2] and out[j + 1][4:] == out[i][4:]:
            j += 1
        if out[i][4] and j > i and len({x[1] for x in out[i:j + 1]}) > 1:
            for k in range(i + 1, j + 1):
                m, stp, dist, vel, _, _ = out[k]
                out[k] = (m, stp, dist, 0.0, 0.0, 0.0)
        i = j + 1
    return out


def trace_ride(r, seq, ST):
    """לכל תחנה מתוכננת: [קוד, מתוכנן, איחור הגעה, איחור יציאה, מקור, עמידה בדקות]."""
    ft = frozen_tail(seq)
    seq = unfreeze(seq[:ft])
    rows, ptr = [], 0
    n = len(r['s'])
    for i, st in enumerate(r['s']):
        code, pl = st[0], st[1]
        s = ST.get(str(code))
        lo_m, hi_m = pl - 20, pl + 120

        def near(x):
            return bool(s and x[4] and s[1] is not None and hav(x[4], x[5], s[1], s[2]) <= NEAR_M)

        def here(x):
            # "התחנה הנוכחית" מתחלפת בדרך כלל כדקה לפני ההגעה, אבל לפעמים כבר קילומטרים לפני —
            # כשיש GPS שמראה שהרכבת עוד רחוקה מ-3 ק"מ, ההחלפה לא נחשבת הגעה
            if near(x):
                return True
            if x[1] != str(code):
                return False
            return not (x[4] and s and s[1] is not None and hav(x[4], x[5], s[1], s[2]) > 3000)

        cand = [k for k in range(ptr, len(seq)) if lo_m <= seq[k][0] <= hi_m and here(seq[k])]
        # שידור בלי GPS מגיע תמיד עם מהירות 0 — אז "עומדת" נקבע רק משידור עם GPS
        stand = lambda x: bool(x[4]) and x[3] == 0
        arr_k = src = None
        if i > 0:
            for k in cand:
                if stand(seq[k]):
                    arr_k, src = k, 'g'
                    break
            if arr_k is None:
                for k in cand:
                    if near(seq[k]):
                        arr_k, src = k, 'g'
                        break
            if arr_k is None and cand:
                arr_k, src = cand[0], ('g' if seq[cand[0]][4] else 's')
        else:
            arr_k = cand[0] if cand else None
            src = ('g' if seq[arr_k][4] else 's') if arr_k is not None else None
        arr = seq[arr_k][0] if (arr_k is not None and i > 0) else None
        dep = dwell = None
        if arr_k is not None and i < n - 1:
            k = arr_k
            if i == 0:                # במוצא: השידור הראשון שבו עומדת
                while k + 1 < len(seq) and here(seq[k + 1]) and not stand(seq[k]):
                    k += 1
            if stand(seq[k]):
                while k + 1 < len(seq) and here(seq[k + 1]) and stand(seq[k + 1]):
                    k += 1
                nx = seq[k + 1] if k + 1 < len(seq) else None
                # השידור הראשון שבו כבר זזה — רק אם הוא עדיין ליד התחנה. בתחנה תת-קרקעית (נבון) ה-GPS
                # נשאר על המיקום האחרון עד היציאה מהמנהרה, והשידור הבא כבר במרחק 25 ק"מ
                if nx and nx[4] and s and s[1] is not None and hav(nx[4], nx[5], s[1], s[2]) <= 1500:
                    dep = nx[0]
            elif seq[k][4] and i > 0:
                dep = seq[k][0]                   # עברה בתחנה בתנועה: יציאה = הגעה
            if i == 0 and dep is not None and dep < pl - 5:
                dep = None            # יציאה מוקדמת מדי מהמוצא = שידור משובש
            if dep is not None and arr is not None:
                dwell = round(dep - arr, 1)
            ptr = k
        elif arr_k is not None:
            ptr = arr_k
        rows.append([code, pl,
                     round(arr - pl, 1) if arr is not None else None,
                     round(dep - pl, 1) if dep is not None else None,
                     src, dwell])
    reached = [i for i, x in enumerate(rows) if x[2] is not None or (i == 0 and x[3] is not None)]
    return rows, (max(reached) if reached else -1), (seq[-1][0] if seq else None)


def gains(rows):
    """איחור שנצבר בין כל שתי תחנות עוקבות שנמדדו שתיהן: [A, B, דקות]."""
    out = []
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        if b[2] is None:
            continue
        base = a[3] if i == 0 else a[2]
        if base is None:
            continue
        out.append((a[0], b[0], round(b[2] - base, 1)))
    return out


def build_day(day, ST):
    p = os.path.join(DATA, 'days', f'{day}.json')
    if not os.path.exists(p):
        log(f'  {day}: אין לו"ז (days/{day}.json) — מדלג')
        return None
    D = json.load(open(p, encoding='utf-8'))
    cache = os.environ.get('TRACE_CACHE')     # לפיתוח: שמירת השידורים שנאספו, בלי להוריד שוב
    if cache and os.path.exists(f'{cache}/{day}.json'):
        T, last_any, cover = json.load(open(f'{cache}/{day}.json'))
        T = {k: [tuple(x) for x in v] for k, v in T.items()}
    else:
        T, last_any, cover = collect(day)
        if cache:
            os.makedirs(cache, exist_ok=True)
            json.dump([T, last_any, cover], open(f'{cache}/{day}.json', 'w'))
    if cover < 0.5:
        log(f'  {day}: פחות ממחצית הדקות בארכיון — לא נכתב')
        return None
    rides = {}
    for r in D.get('rides', []):
        tn = str(r.get('tn') or '')
        if not tn or not r.get('s'):
            continue
        seq = T.get(tn)
        if not seq:
            rides[tn] = {'nm': r['nm'], 'none': 1}
            continue
        rows, last_i, last_m = trace_ride(r, seq, ST)
        rec = {'nm': r['nm'], 's': rows}
        left = len(rows) - 1 - last_i
        kind = None
        if 0 <= last_i < len(rows) - 1 and last_m is not None:
            # הכלל של שלמה (06.10): רכבת שלא הגיעה לתחנה הבאה 20 דקות אחרי הזמן שהייתה אמורה
            # להגיע אליה — בוטלה. "אמורה" = ההגעה בפועל לתחנה האחרונה + זמן הנסיעה המתוכנן לבאה
            lr = rows[last_i]
            base = lr[1] + (lr[2] if lr[2] is not None else (lr[3] or 0))
            deadline = base + (rows[last_i + 1][1] - lr[1]) + CANCEL_AFTER
            if last_m >= deadline:
                kind = 'stuck'        # המשיכה לשדר (שידור חי, לא קפוא) ולא התקדמה
            elif left >= CUT_MIN_STOPS and last_any >= deadline:
                kind = 'silent'       # הפסיקה לשדר, ורכבות אחרות המשיכו
        if kind:
            rec['cut'] = [rows[last_i][0], round(last_m, 1), kind]
        rides[tn] = rec
    built = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    det = {'d': day, 'fmt': 1, 'built': built, 'cover': round(cover, 3), 'rides': rides}
    json.dump(det, open(os.path.join(OUT, f'{day}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    summ = summarize(det)
    log(f'  {day}: נמדדו {summ["meas"]}/{summ["plan"]} הגעות לתחנות ({summ["gps"]} לפי GPS, '
        f'{summ["meas"] - summ["gps"]} לפי שידור התחנה) · {len(summ["seg"])} קטעים · {len(summ["cut"])} רכבות שבוטלו באמצע')
    return summ


def summarize(det):
    """הסיכום הקטן של יום לתצוגת התקופה — מחושב מקובץ המעקב המפורט, כך שאפשר לבנות אותו מחדש
    בלי להוריד שוב את השידורים (SUMMARIZE=1)."""
    day, rides = det['d'], det['rides']
    seg, lines, cut, origin, lst, lorig, lord = {}, {}, [], {}, {}, {}, {}
    for tn, rec in rides.items():
        rows, nm = rec.get('s'), rec['nm']
        if not rows:
            continue
        if len(rows) > len(lord.get(nm, [])):
            lord[nm] = [x[0] for x in rows]          # סדר התחנות של הקו (הנסיעה הארוכה)
        if rec.get('cut'):
            at, m, kind = (rec['cut'] + ['silent'])[:3]
            last_i = next(i for i, x in enumerate(rows) if x[0] == at)
            cut.append({'tn': tn, 'nm': nm, 'at': at, 'm': m, 'k': kind,
                        'left': len(rows) - 1 - last_i, 'pl_end': rows[-1][1], 'dep': rows[0][1]})
        if rows[0][3] is not None:
            for tgt, key in ((origin, str(rows[0][0])), (lorig, nm)):
                o = tgt.setdefault(key, [0, 0.0, 0])
                o[0] += 1
                o[1] += rows[0][3]
                o[2] += rows[0][3] >= 3
        L = lst.setdefault(nm, {})
        for x in rows[1:]:
            if x[2] is None:
                continue
            st = L.setdefault(str(x[0]), [0, 0.0, 0, 0.0, 0])
            st[0] += 1
            st[1] += x[2]
            st[2] += x[2] <= 5
            if x[5] is not None:
                st[3] += x[5]
                st[4] += 1
        src = {x[0]: x[4] for x in rows}
        for i, (a, b, g) in enumerate(gains(rows)):
            gps = src.get(b) == 'g' and (a == rows[0][0] or src.get(a) == 'g')
            k = f'{a}>{b}'
            for tgt in (seg, lines.setdefault(nm, {})):
                x = tgt.setdefault(k, [0, 0.0, 0.0, 0, -99.0, 0])
                x[0] += 1
                x[1] += g
                x[2] += max(0.0, g)
                x[3] += g >= 2
                x[4] = max(x[4], g)
                x[5] += gps            # כמה מהמדידות בקטע היו לפי GPS בשני הקצוות
    rnd = lambda d: {k: [v[0], round(v[1], 1), round(v[2], 1), v[3], v[4], v[5]] for k, v in d.items()}
    meas = sum(1 for x in rides.values() for i, s in enumerate(x.get('s', [])) if i > 0 and s[2] is not None)
    plan = sum(len(x.get('s', [])) - 1 for x in rides.values() if 's' in x)
    gsrc = sum(1 for x in rides.values() for i, s in enumerate(x.get('s', [])) if i > 0 and s[2] is not None and s[4] == 'g')
    summ = {'d': day, 'fmt': 2, 'rides': len(rides), 'sent': sum(1 for x in rides.values() if 's' in x),
            'meas': meas, 'plan': plan, 'gps': gsrc, 'cover': det.get('cover'),
            'seg': rnd(seg), 'lines': {k: rnd(v) for k, v in lines.items()},
            'origin': {k: [v[0], round(v[1], 1), v[2]] for k, v in origin.items()},
            'lorig': {k: [v[0], round(v[1], 1), v[2]] for k, v in lorig.items()},
            'lst': {nm: {c: [v[0], round(v[1], 1), v[2], round(v[3], 1), v[4]] for c, v in L.items()} for nm, L in lst.items()},
            'lord': lord,
            'cut': sorted(cut, key=lambda c: c['m'])}
    os.makedirs(os.path.join(OUT, 'sum'), exist_ok=True)
    json.dump(summ, open(os.path.join(OUT, 'sum', f'{day}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return summ


def main():
    ST = json.load(open(os.path.join(DATA, 'stations.json'), encoding='utf-8'))
    have = sorted(f[:-5] for f in os.listdir(os.path.join(DATA, 'days')) if f.endswith('.json'))
    os.makedirs(OUT, exist_ok=True)
    done = {f[:-5] for f in os.listdir(OUT) if f.endswith('.json') and f[:4].isdigit()}
    fr, to = os.environ.get('FROM') or '', os.environ.get('TO') or ''
    redo = os.environ.get('REDO') == '1'
    days = [d for d in have if (not fr or d >= fr) and (not to or d <= to)]
    if not (fr or to):
        days = days[-int(os.environ.get('LAST_DAYS') or 14):]
    todo = [d for d in days if redo or d not in done]
    budget = float(os.environ.get('MAX_MIN') or 0) * 60
    t0 = time.time()
    log(f'ימים לעיבוד: {len(todo)}')
    for d in todo:
        if budget and time.time() - t0 > budget:
            log('תקציב הזמן נגמר — היתר בריצה הבאה')
            break
        try:
            build_day(d, ST)
        except Exception as e:  # noqa: BLE001 — יום אחד שנכשל לא עוצר את השאר
            log(f'  {d}: נכשל — {e}')
    for d in sorted(x for x in done | set(todo) if os.path.exists(os.path.join(OUT, f'{x}.json'))):
        sp = os.path.join(OUT, 'sum', f'{d}.json')
        try:
            old = json.load(open(sp, encoding='utf-8')) if os.path.exists(sp) else {}
        except ValueError:
            old = {}
        if old.get('fmt') != 2:
            det = json.load(open(os.path.join(OUT, f'{d}.json'), encoding='utf-8'))
            det.setdefault('cover', old.get('cover'))
            summarize(det)
            log(f'  {d}: הסיכום נבנה מחדש מהקובץ המפורט')
    sums = sorted(f[:-5] for f in os.listdir(os.path.join(OUT, 'sum')) if f.endswith('.json')) if os.path.isdir(os.path.join(OUT, 'sum')) else []
    json.dump({'days': sums, 'updated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')},
              open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
