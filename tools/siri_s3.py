# -*- coding: utf-8 -*-
"""נסיעות SIRI של יום אחד — מקובצי הדקה הגולמיים של דאטאבוס ב-S3, במקום /siri_rides/list ב-API שלהם
(שלמה 30.10: צי הרכבים העסיק את השרת שלהם כשעתיים בכל לילה). אותם קבצים ש-bus_speed ומדד האמינות
כבר קוראים (stride-siri-requester/YYYY/MM/DD/HH/MM.br, שעון UTC), ומהם דאטאבוס עצמם בונים את siri_rides.

נסיעה = צירוף ייחודי של מפעיל, קו (LineRef = route_id ב-GTFS), DatedVehicleJourneyRef, שעת יציאה
מתוכננת (OriginAimedDepartureTime) ורכב — כמו שורה ב-siri_rides. היום נקבע לפי שעת היציאה המתוכננת,
באותו חלון שבו fleet_scan שאל את ה-API: ‎{day}T00:00:00+02:00 עד ‎{day}T23:59:59+02:00.
"""
import datetime
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bus_speed import fetch  # noqa: E402 — אותה הורדה (5 נסיונות, 404 = אין קובץ)

THREADS = int(os.environ.get('SIRI_THREADS', '20'))
TZ2 = datetime.timezone(datetime.timedelta(hours=2))
UTC = datetime.timezone.utc


def window(day):
    """החלון של היום (שעת יציאה מתוכננת), ב-UTC."""
    d = datetime.date.fromisoformat(day)
    a = datetime.datetime(d.year, d.month, d.day, tzinfo=TZ2).astimezone(UTC)
    return a, a + datetime.timedelta(hours=24)


def keys(day):
    """קובצי הדקה שצריך: מתחילת החלון פחות שעה (רכב שמשדר לפני היציאה) ועד שעתיים אחרי סופו
    (נסיעה שיצאה ב-23:59 עוד נראית אחרי החצות) — 27 שעות, 1,620 קבצים."""
    a, _ = window(day)
    t0 = (a - datetime.timedelta(hours=1)).replace(tzinfo=None)
    return [(t0 + datetime.timedelta(minutes=m)).strftime('%Y/%m/%d/%H/%M') + '.br' for m in range(27 * 60)]


def _int(x):
    x = (x or '').strip()
    return int(x) if x.isdigit() else (x or None)


def parse(b):
    """קובץ דקה → {(מפעיל, קו, journey, יציאה, רכב)}."""
    import brotli   # pip install brotli
    try:
        j = json.loads(brotli.decompress(b))
    except Exception:  # noqa: BLE001
        return set()
    out = set()
    for sd in j.get('Siri', {}).get('ServiceDelivery', {}).get('StopMonitoringDelivery') or []:
        for v in sd.get('MonitoredStopVisit') or []:
            mj = v.get('MonitoredVehicleJourney') or {}
            fr = mj.get('FramedVehicleJourneyRef') or {}
            out.add((mj.get('OperatorRef') or '', mj.get('LineRef') or '', fr.get('DatedVehicleJourneyRef') or '',
                     mj.get('OriginAimedDepartureTime') or '', (mj.get('VehicleRef') or '').strip()))
    return out


def day_rides(day, threads=THREADS):
    """[{operator_ref, line_ref, journey_ref, scheduled_start_time, vehicle_ref}] — נסיעות היום, בלי כפילויות.
    operator_ref/line_ref כמספרים, כמו שה-API מחזיר אותם."""
    a, b = window(day)
    seen = set()
    files = 0
    st = time.time()
    with ThreadPoolExecutor(threads) as ex:
        for raw in ex.map(fetch, keys(day)):
            if raw:
                files += 1
                seen |= parse(raw)
    out = []
    bad = 0
    for op, line, jr, dep, veh in seen:
        try:
            t = datetime.datetime.fromisoformat(dep.replace('Z', '+00:00'))
        except ValueError:
            bad += 1
            continue
        if t.tzinfo is None:
            t = t.replace(tzinfo=datetime.timezone(datetime.timedelta(hours=3)))
        if a <= t < b:
            out.append({'operator_ref': _int(op), 'line_ref': _int(line), 'journey_ref': jr,
                        'scheduled_start_time': t.astimezone(UTC).isoformat(), 'vehicle_ref': veh})
    print(f'{day}: S3 — {files} קבצי דקה, {len(out)} נסיעות ({round(time.time() - st)} שנ\')', flush=True)
    if files < 1400:
        # יום שחסרים בו קבצים רבים (תקלה אצל דאטאבוס) — לא נספר, כדי לא לרשום יום חלקי כמלא
        raise RuntimeError(f'רק {files} קבצי דקה ל-{day} ב-S3')
    return out
