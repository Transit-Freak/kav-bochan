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
    """קובץ דקה → {(מפעיל, קו, יום, journey, רכב, יציאה)}."""
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
            out.add((mj.get('OperatorRef') or '', mj.get('LineRef') or '', fr.get('DataFrameRef') or '',
                     fr.get('DatedVehicleJourneyRef') or '', (mj.get('VehicleRef') or '').strip(),
                     mj.get('OriginAimedDepartureTime') or ''))
    return out


def day_rides(day, threads=THREADS):
    """[{operator_ref, line_ref, journey_ref, scheduled_start_time, vehicle_ref}] — נסיעות היום, כמו siri_rides.
    המפתח של נסיעה אצל דאטאבוס (נבדק מול ה-API, 30.10): מפעיל + קו + journey_ref ("{DataFrameRef}-{Dated
    VehicleJourneyRef}") + רכב, ושעת היציאה — הראשונה שנראתה. כך כל רשומות ה-"0" (רכב שממתין במסוף עם
    שעת יציאה שמתעדכנת כל דקה) של רכב בקו נספרות כנסיעה אחת, כמו ב-API, ולא כעשרות.
    operator_ref/line_ref כמספרים, כמו שה-API מחזיר אותם."""
    a, b = window(day)
    first = {}
    files = 0
    st = time.time()
    with ThreadPoolExecutor(threads) as ex:
        for raw in ex.map(fetch, keys(day)):
            if not raw:
                continue
            files += 1
            for op, line, frame, jr, veh, dep in parse(raw):
                try:
                    t = datetime.datetime.fromisoformat(dep.replace('Z', '+00:00'))
                except ValueError:
                    continue
                if t.tzinfo is None:
                    t = t.replace(tzinfo=datetime.timezone(datetime.timedelta(hours=3)))
                k = (op, line, f'{frame}-{jr}', veh)
                if k not in first or t < first[k]:
                    first[k] = t
    out = [{'operator_ref': _int(op), 'line_ref': _int(line), 'journey_ref': jr,
            'scheduled_start_time': t.astimezone(UTC).isoformat(), 'vehicle_ref': veh}
           for (op, line, jr, veh), t in first.items() if a <= t < b]
    print(f'{day}: S3 — {files} קבצי דקה, {len(out)} נסיעות ({round(time.time() - st)} שנ\')', flush=True)
    if files < 1400:
        # יום שחסרים בו קבצים רבים (תקלה אצל דאטאבוס) — לא נספר, כדי לא לרשום יום חלקי כמלא
        raise RuntimeError(f'רק {files} קבצי דקה ל-{day} ב-S3')
    return out


def _keys_between(a, b):
    """קובצי הדקה מ-a עד b (UTC)."""
    t = a.astimezone(UTC).replace(tzinfo=None, second=0, microsecond=0)
    end = b.astimezone(UTC).replace(tzinfo=None)
    out = []
    while t < end:
        out.append(t.strftime('%Y/%m/%d/%H/%M') + '.br')
        t += datetime.timedelta(minutes=1)
    return out


def _parse_locs(op):
    def f(b):
        import brotli
        try:
            j = json.loads(brotli.decompress(b))
        except Exception:  # noqa: BLE001
            return []
        out = []
        for sd in j.get('Siri', {}).get('ServiceDelivery', {}).get('StopMonitoringDelivery') or []:
            for v in sd.get('MonitoredStopVisit') or []:
                mj = v.get('MonitoredVehicleJourney') or {}
                if (mj.get('OperatorRef') or '') != op:
                    continue
                loc = mj.get('VehicleLocation') or {}
                fr = mj.get('FramedVehicleJourneyRef') or {}
                try:
                    la, lo = float(loc['Latitude']), float(loc['Longitude'])
                except (KeyError, TypeError, ValueError):
                    continue
                out.append(((mj.get('LineRef') or '', fr.get('DatedVehicleJourneyRef') or '',
                             mj.get('OriginAimedDepartureTime') or '', (mj.get('VehicleRef') or '').strip()),
                            v.get('RecordedAtTime') or '', la, lo))
        return out
    return f


def vehicle_locations(op, start, end, before_h=1, after_h=3, threads=THREADS):
    """שידורי המיקום של מפעיל op, לנסיעות שיצאו (לפי הלו"ז) בין start ל-end — באותו מבנה כמו
    /siri_vehicle_locations/list של ה-API (siri_ride__id הוא מספר סידורי לנסיעה, בלי gtfs_ride_id —
    ההצמדה לנסיעת הלו"ז נעשית לפי קו + שעת יציאה)."""
    a, b = start.astimezone(UTC), end.astimezone(UTC)
    ks = _keys_between(a - datetime.timedelta(hours=before_h), b + datetime.timedelta(hours=after_h))
    rides, seen, out = {}, set(), []
    files = 0
    parse_one = _parse_locs(str(op))
    with ThreadPoolExecutor(threads) as ex:
        for raw in ex.map(fetch, ks):
            if not raw:
                continue
            files += 1
            for key, rec, la, lo in parse_one(raw):
                try:
                    t = datetime.datetime.fromisoformat(key[2].replace('Z', '+00:00'))
                except ValueError:
                    continue
                if not (a <= t < b) or (key, rec) in seen:
                    continue
                seen.add((key, rec))
                rid = rides.setdefault(key, len(rides) + 1)
                out.append({'siri_ride__id': rid, 'lat': la, 'lon': lo, 'recorded_at_time': rec,
                            'siri_ride__gtfs_ride_id': None, 'siri_route__line_ref': _int(key[0]),
                            'siri_ride__scheduled_start_time': t.astimezone(UTC).isoformat(),
                            'siri_ride__vehicle_ref': key[3] or None})
    print(f'  S3: {files}/{len(ks)} קבצי דקה, {len(rides)} נסיעות SIRI, {len(out)} שידורים', flush=True)
    if files < len(ks) * 0.85:
        raise RuntimeError(f'רק {files} מתוך {len(ks)} קבצי דקה ב-S3')
    return out
