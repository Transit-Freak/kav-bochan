# -*- coding: utf-8 -*-
""""פרוסה" יומית של ה-GTFS: רק הנסיעות שנוסעות בתאריך אחד, וכל מה שצריך כדי לדעת איך כל קו נסע באותו יום.

הקלט: ה-GTFS המלא של משרד התחבורה (gtfs.zip, כ-135MB). הפלט: zip של יום אחד — ביום חול כ-85MB (כ-124 אלף נסיעות,
4.5 מיליון שורות תחנה; רוב הגודל — השרטוטים והשורות), בשישי כ-64MB ובשבת כ-40MB (נמדד על הקובץ של 16.11.2026):
  agency.txt     כל החברות (קובץ זעיר)
  routes.txt     רק הקווים שיש להם נסיעה בתאריך
  trips.txt      רק הנסיעות של התאריך (שירות שפעיל בו), ועוד הנסיעות שיוצאות לפני 03:00 למחרת בשירותים שפעילים
                 רק למחרת — הערב של התאריך (למשל במוצאי שבת: נסיעת 00:30 של שירות א׳–ה׳)
  stop_times.txt רק השורות של הנסיעות האלה
  stops.txt      רק התחנות שהנסיעות עוצרות בהן (ותחנות האם שלהן, אם יש)
  shapes.txt     רק השרטוטים של הנסיעות האלה
  calendar.txt   שורה לכל שירות, מצומצמת לתאריך: start_date=התאריך, end_date=למחרת, ודגל ליום בשבוע של התאריך
                 (אם השירות פעיל בו) ולמחרת (אם פעיל גם בו) — בשביל הנסיעות שאחרי חצות (Feed.svc_next ב-line_changes.py)
השורות נשמרות כמו שהן בקובץ המקורי (אותן עמודות, אותו סדר), כך שהפרוסה היא GTFS רגיל ש-line_changes.py קורא
באותה דרך כמו את הקובץ המלא. קבצים אחרים (translations, fare_*) לא נכללים.

השימוש: .github/workflows/line-history.yml מכין כל יום את הפרוסה של היום (בשעון ישראל) ושומר אותה כנכס בשחרור
gtfs-slices ב-GitHub (מחוץ להיסטוריה של git), 8 ימים אחרונים. line_changes.py בונה מ-7 הפרוסות של השבוע שעבר את
"מה הקו עשה בפועל" (כל פרוסה — התאריך שלה בלבד).

הרצה: python3 tools/gtfs_slice.py gtfs.zip slice-2026-11-23.zip [--date 2026-11-23]
(בלי --date — היום בשעון ישראל). פרוסה בלי אף נסיעה לא נכתבת (יציאה עם קוד 2).
"""
import argparse
import csv
import datetime
import os
import sys
import zipfile

WD = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']


def today_il():
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo('Asia/Jerusalem')).date()
    except Exception:  # noqa: BLE001
        return datetime.date.today()


def _lines(z, name):
    """שורות גולמיות (bytes, בלי סוף שורה) של איבר ב-zip, בלי לטעון את כולו לזיכרון."""
    with z.open(name) as f:
        rest = b''
        while True:
            b = f.read(1 << 20)
            if not b:
                break
            data = rest + b
            parts = data.split(b'\n')
            rest = parts.pop()
            for ln in parts:
                yield ln.rstrip(b'\r')
        if rest.rstrip(b'\r'):
            yield rest.rstrip(b'\r')


def _header(raw):
    return {h.strip(): i for i, h in enumerate(raw.decode('utf-8-sig').split(','))}


def _fields(ln):
    """שדות שורה; כשיש מרכאות — דרך csv (בקובץ של המשרד אין, וכך זה מהיר)."""
    if b'"' in ln:
        return [x.encode() for x in next(csv.reader([ln.decode('utf-8')]))]
    return ln.split(b',')


def _filter(z, name, col, keep, out=None, sink=None):
    """שורות האיבר שהעמודה col שלהן ב-keep (קבוצת bytes). מחזיר (שורת כותרת, שורות, כותרת→אינדקס).
    עם sink (קובץ פתוח לכתיבה) — השורות נכתבות אליו מיד ולא נשמרות בזיכרון (stop_times)."""
    it = _lines(z, name)
    raw_h = next(it)
    h = _header(raw_h)
    i = h[col]
    rows = []
    n = 0
    if sink is not None:
        sink.write(raw_h + b'\n')
    for ln in it:
        if not ln.strip():
            continue
        f = _fields(ln)
        if i < len(f) and f[i] in keep:
            n += 1
            if sink is not None:
                sink.write(ln + b'\n')
            else:
                rows.append(ln)
            if out is not None:
                out(f, h)
    return raw_h, rows if sink is None else n, h


def active_services(z, days):
    """service_id (bytes) → קבוצת התאריכים מתוך days שבהם השירות פעיל (calendar.txt ו-calendar_dates.txt)."""
    names = set(z.namelist())
    act = {}
    if 'calendar.txt' in names:
        it = _lines(z, 'calendar.txt')
        h = _header(next(it))
        for ln in it:
            if not ln.strip():
                continue
            f = _fields(ln)
            s = datetime.datetime.strptime(f[h['start_date']].decode(), '%Y%m%d').date()
            e = datetime.datetime.strptime(f[h['end_date']].decode(), '%Y%m%d').date()
            ds = {d for d in days if s <= d <= e and f[h[WD[d.weekday()]]] == b'1'}
            act[f[h['service_id']]] = ds
    if 'calendar_dates.txt' in names:
        it = _lines(z, 'calendar_dates.txt')
        h = _header(next(it))
        for ln in it:
            if not ln.strip():
                continue
            f = _fields(ln)
            d = datetime.datetime.strptime(f[h['date']].decode(), '%Y%m%d').date()
            if d not in days:
                continue
            sv = f[h['service_id']]
            if f[h['exception_type']] == b'1':
                act.setdefault(sv, set()).add(d)
            elif f[h['exception_type']] == b'2':
                act.get(sv, set()).discard(d)
    return act


NIGHT = 180   # דקות — נסיעה שיוצאת לפני 03:00 שייכת לערב של היום הקודם (כמו NIGHT ב-line_changes.py)


def _minutes(t):
    try:
        h, m = t.decode().strip().split(':')[:2]
        return int(h) * 60 + int(m)
    except Exception:  # noqa: BLE001
        return None


def make_slice(src, dst, day):
    """כותב את הפרוסה של day (datetime.date) מ-src (zip מלא) ל-dst. מחזיר מילון ספירות.
    "יום" = יום השירות: כל הנסיעות של השירותים שפעילים ב-day, ועוד הנסיעות שיוצאות לפני 03:00 למחרת בשירותים
    שפעילים רק למחרת (הערב של day — למשל במוצאי שבת, נסיעות 00:30 של שירות א׳–ה׳)."""
    nxt = day + datetime.timedelta(days=1)
    tmp = dst + '.tmp'
    with zipfile.ZipFile(src) as z, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        def put(name, lines):
            out.writestr(name, b'\n'.join(lines) + b'\n')

        act = active_services(z, {day, nxt})
        svcs = {sv for sv, ds in act.items() if day in ds}
        night_svcs = {sv for sv, ds in act.items() if nxt in ds and day not in ds}
        it = _lines(z, 'trips.txt')
        trips_h = next(it)
        th = _header(trips_h)
        trips = []          # (שורה, שדות) לפי הסדר בקובץ
        day_trips, night_trips = set(), set()
        for ln in it:
            if not ln.strip():
                continue
            f = _fields(ln)
            sv = f[th['service_id']]
            if sv in svcs:
                day_trips.add(f[th['trip_id']])
            elif sv in night_svcs:
                night_trips.add(f[th['trip_id']])
            else:
                continue
            trips.append((ln, f))
        put('agency.txt', [x for x in _lines(z, 'agency.txt') if x.strip()])
        stops_used, kept_night = set(), set()
        n_st = 0
        with out.open('stop_times.txt', 'w', force_zip64=True) as sink:
            it = _lines(z, 'stop_times.txt')
            raw_h = next(it)
            h = _header(raw_h)
            ti, si, qi, di = h['trip_id'], h['stop_id'], h['stop_sequence'], h['departure_time']
            sink.write(raw_h + b'\n')
            cur, buf = None, []   # נסיעת לילה: השורות שלה נאספות עד שמתברר מתי היא יוצאת

            def flush():
                nonlocal n_st
                if cur is None or not buf:
                    return
                first = min(buf, key=lambda x: int(x[1][qi]))[1]
                dep = _minutes(first[di])
                if dep is not None and dep < NIGHT:
                    kept_night.add(cur)
                    for ln, f in buf:
                        sink.write(ln + b'\n')
                        stops_used.add(f[si])
                    n_st += len(buf)

            for ln in it:
                if not ln.strip():
                    continue
                f = _fields(ln)
                t = f[ti]
                if t in day_trips:
                    sink.write(ln + b'\n')
                    stops_used.add(f[si])
                    n_st += 1
                elif t in night_trips:
                    if t != cur:
                        flush()
                        cur, buf = t, []
                    buf.append((ln, f))
            flush()
        trips = [(ln, f) for ln, f in trips if f[th['trip_id']] in day_trips or f[th['trip_id']] in kept_night]
        put('trips.txt', [trips_h] + [ln for ln, _ in trips])
        routes = {f[th['route_id']] for _, f in trips}
        used_svcs = {f[th['service_id']] for _, f in trips}
        shapes = {f[th['shape_id']] for _, f in trips
                  if 'shape_id' in th and th['shape_id'] < len(f) and f[th['shape_id']]}
        # תחנות האם של התחנות שבשימוש (אם יש עמודה כזו) — כדי שהפרוסה תהיה GTFS שלם
        parents = set()

        def on_stop(f, hh):
            if 'parent_station' in hh and hh['parent_station'] < len(f) and f[hh['parent_station']]:
                parents.add(f[hh['parent_station']])

        stops_h, stops, _ = _filter(z, 'stops.txt', 'stop_id', stops_used, on_stop)
        extra = parents - stops_used
        if extra:
            stops += _filter(z, 'stops.txt', 'stop_id', extra)[1]
        put('stops.txt', [stops_h] + stops)
        routes_h, route_rows, _ = _filter(z, 'routes.txt', 'route_id', routes)
        put('routes.txt', [routes_h] + route_rows)
        cal = [b'service_id,' + ','.join(WD).encode() + b',start_date,end_date']
        for sv in sorted(used_svcs):
            on = act.get(sv, set())
            flags = [b'1' if ((WD[day.weekday()] == w and day in on) or (WD[nxt.weekday()] == w and nxt in on))
                     else b'0' for w in WD]
            cal.append(b','.join([sv] + flags + [day.strftime('%Y%m%d').encode(), nxt.strftime('%Y%m%d').encode()]))
        put('calendar.txt', cal)
        if shapes and 'shapes.txt' in z.namelist():
            with out.open('shapes.txt', 'w', force_zip64=True) as sink:
                _filter(z, 'shapes.txt', 'shape_id', shapes, sink=sink)
        out.comment = f'kav-bochan gtfs slice {day.isoformat()}'.encode()
    os.replace(tmp, dst)
    n_day = sum(1 for _, f in trips if f[th['trip_id']] in day_trips)
    return dict(day=day.isoformat(), services=len(used_svcs), trips=n_day, night=len(kept_night), stop_times=n_st,
                stops=len(stops), routes=len(route_rows), shapes=len(shapes), bytes=os.path.getsize(dst))


def main(argv=None):
    ap = argparse.ArgumentParser(description='פרוסה יומית של GTFS (רק הנסיעות של תאריך אחד)')
    ap.add_argument('src', help='GTFS מלא (zip)')
    ap.add_argument('dst', help='קובץ הפרוסה (zip)')
    ap.add_argument('--date', help='YYYY-MM-DD (ברירת מחדל: היום בשעון ישראל)')
    a = ap.parse_args(argv)
    day = datetime.date.fromisoformat(a.date) if a.date else today_il()
    tmp = a.dst + '.check'
    st = make_slice(a.src, tmp, day)
    print(f"פרוסה {st['day']}: {st['trips']} נסיעות (ועוד {st['night']} אחרי חצות) · {st['stop_times']} שורות תחנה · {st['routes']} קווים · "
          f"{st['stops']} תחנות · {st['shapes']} שרטוטים · {st['bytes'] / 1e6:.1f}MB", flush=True)
    if not st['trips']:
        os.remove(tmp)
        print('אין אף נסיעה בתאריך הזה — הפרוסה לא נכתבה', file=sys.stderr)
        return 2
    os.replace(tmp, a.dst)
    return 0


if __name__ == '__main__':
    sys.exit(main())
