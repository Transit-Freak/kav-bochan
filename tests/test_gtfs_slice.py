# -*- coding: utf-8 -*-
"""בדיקות לפרוסה היומית של ה-GTFS (tools/gtfs_slice.py) ולקריאה שלה ב"מצגת לשינוי בקו" (BaseFeed, open_baseline
ב-tools/line_changes.py): על GTFS זעיר שנבנה כאן. העיקר: השבוע שעבר שנבנה מפרוסות (וגם מפרוסות + גיבוי מהקובץ המלא)
נותן בדיוק את אותם וריאנטים ואותן שעות יציאה כמו הקובץ המלא."""
import datetime
import importlib.util
import os
import sys
import zipfile

import pytest

_TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools')
if _TOOLS not in sys.path:
    sys.path.append(_TOOLS)
import gtfs_slice as GS  # noqa: E402

_spec = importlib.util.spec_from_file_location('lc_slices', os.path.join(_TOOLS, 'line_changes.py'))
L = importlib.util.module_from_spec(_spec)
sys.modules['lc_slices'] = L
_spec.loader.exec_module(L)

D = datetime.date(2026, 11, 16)   # יום שני
D1 = D + datetime.timedelta(days=1)
DAY = datetime.timedelta(days=1)

CAL = """service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
S1,1,1,1,1,1,0,1,20261101,20261231
S2,0,1,0,0,0,0,0,20261101,20261231
S3,0,0,0,0,0,0,0,20261101,20261231
S4,1,0,0,0,0,0,0,20261101,20261231
S5,1,1,1,1,1,1,1,20260101,20260131
S6,1,0,1,0,0,0,0,20261101,20261231
"""
# S3 — רק דרך calendar_dates (נוסף ב-D); S4 — בוטל ב-D; S5 — תקופה שעברה
CAL_DATES = """service_id,date,exception_type
S3,20261116,1
S4,20261116,2
"""
TRIPS = """route_id,service_id,trip_id,trip_headsign,direction_id,shape_id
R1,S1,T1,,0,SH1
R2,S2,T2,,0,SH2
R1,S3,T3,,0,SH1
R3,S4,T4,,0,SH3
R3,S5,T5,,0,SH3
R1,S1,T6,,0,SH1
R1,S6,T7,,0,SH1
"""
ST = """trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,shape_dist_traveled
T1,07:00:00,07:00:00,A,1,0,0,0
T1,07:10:00,07:10:00,B,2,0,0,100
T2,00:30:00,00:30:00,B,1,0,0,0
T2,00:40:00,00:40:00,C,2,0,0,100
T3,09:00:00,09:00:00,A,1,0,0,0
T3,09:05:00,09:05:00,C,2,0,0,100
T4,10:00:00,10:00:00,D,1,0,0,0
T4,10:10:00,10:10:00,E,2,0,0,100
T5,11:00:00,11:00:00,D,1,0,0,0
T5,11:10:00,11:10:00,E,2,0,0,100
T6,00:15:00,00:15:00,A,1,0,0,0
T6,00:25:00,00:25:00,B,2,0,0,100
T7,00:20:00,00:20:00,A,1,0,0,0
T7,00:30:00,00:30:00,C,2,0,0,100
"""
STOPS = """stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon,location_type,parent_station,zone_id
A,1001,אלף,רחוב: הרצל 1 עיר: צפת רציף:   קומה:  ,32.96,35.49,0,P,1
B,1002,בית,רחוב: הרצל 9 עיר: צפת רציף:   קומה:  ,32.97,35.50,0,,1
C,1003,"גימל, צפון",רחוב: העצמאות עיר: צפת רציף:   קומה:  ,32.98,35.51,0,,1
D,1004,דלת,רחוב: א עיר: חיפה רציף:   קומה:  ,32.80,35.00,0,,2
E,1005,הא,רחוב: ב עיר: חיפה רציף:   קומה:  ,32.81,35.01,0,,2
P,9000,תחנה מרכזית,,32.96,35.49,1,,1
"""
ROUTES = """route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_color
R1,3,1,א-צפת<->ב-צפת-1#,10001-1-#,3,
R2,3,2,ב-צפת<->ג-צפת-1#,10002-1-#,3,
R3,5,3,ד-חיפה<->ה-חיפה-1#,10003-1-#,3,
"""
AGENCY = """agency_id,agency_name,agency_url,agency_timezone,agency_lang,agency_phone,agency_fare_url
3,אגד,http://www.bus.co.il,Asia/Jerusalem,he,*2800,
5,דן,http://www.bus.co.il,Asia/Jerusalem,he,*3456,
"""
SHAPES = """shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence
SH1,32.96,35.49,1
SH1,32.97,35.50,2
SH2,32.97,35.50,1
SH2,32.98,35.51,2
SH3,32.80,35.00,1
SH3,32.81,35.01,2
"""


def full_gtfs(path, cal_dates=True):
    files = {'calendar.txt': CAL, 'trips.txt': TRIPS, 'stop_times.txt': ST, 'stops.txt': STOPS,
             'routes.txt': ROUTES, 'agency.txt': AGENCY, 'shapes.txt': SHAPES, 'translations.txt': 'x\n'}
    if cal_dates:
        files['calendar_dates.txt'] = CAL_DATES
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for k, v in files.items():
            z.writestr(k, ('﻿' if k == 'trips.txt' else '') + v.replace('\n', '\r\n'))
    return str(path)


def read(path, name):
    with zipfile.ZipFile(path) as z:
        return z.read(name).decode('utf-8-sig').splitlines()


def col(lines, name):
    h = lines[0].split(',')
    return [ln.split(',')[h.index(name)] for ln in lines[1:]]


@pytest.fixture
def full(tmp_path):
    return full_gtfs(tmp_path / 'gtfs.zip')


def test_slice_keeps_only_the_day(full, tmp_path):
    out = str(tmp_path / 'slice.zip')
    st = GS.make_slice(full, out, D)
    with zipfile.ZipFile(out) as z:
        assert sorted(z.namelist()) == sorted(['agency.txt', 'routes.txt', 'trips.txt', 'stop_times.txt',
                                               'stops.txt', 'calendar.txt', 'shapes.txt'])
    # T1, T6 (S1), T3 (S3 נוסף ב-calendar_dates), T7 (S6); T2 — שירות של מחר, אבל יוצא 00:30: הערב של היום;
    # לא T4 (בוטל), T5 (תקופה אחרת)
    assert sorted(col(read(out, 'trips.txt'), 'trip_id')) == ['T1', 'T2', 'T3', 'T6', 'T7']
    assert sorted(set(col(read(out, 'stop_times.txt'), 'trip_id'))) == ['T1', 'T2', 'T3', 'T6', 'T7']
    assert sorted(col(read(out, 'routes.txt'), 'route_id')) == ['R1', 'R2']
    # תחנות שבשימוש, ותחנת האם של A
    assert sorted(col(read(out, 'stops.txt'), 'stop_id')) == ['A', 'B', 'C', 'P']
    assert sorted(set(col(read(out, 'shapes.txt'), 'shape_id'))) == ['SH1', 'SH2']
    assert st['trips'] == 4 and st['night'] == 1 and st['stop_times'] == 10
    # השורות נשמרות כמו שהן (גם שם עם פסיק במרכאות)
    assert any(ln.startswith('C,1003,"גימל, צפון"') for ln in read(out, 'stops.txt'))
    cal = read(out, 'calendar.txt')
    rows = {ln.split(',')[0]: ln.split(',') for ln in cal[1:]}
    assert sorted(rows) == ['S1', 'S2', 'S3', 'S6']
    h = cal[0].split(',')
    # S1 פעיל גם מחר (שלישי) — הדגל של שלישי נשאר, בשביל הנסיעות שאחרי חצות; S3 רק היום
    assert [rows['S1'][h.index(w)] for w in GS.WD] == ['1', '1', '0', '0', '0', '0', '0']
    assert [rows['S3'][h.index(w)] for w in GS.WD] == ['1', '0', '0', '0', '0', '0', '0']
    assert [rows['S2'][h.index(w)] for w in GS.WD] == ['0', '1', '0', '0', '0', '0', '0']
    assert rows['S1'][h.index('start_date')] == '20261116' and rows['S1'][h.index('end_date')] == '20261117'


def test_slice_without_trips_is_not_written(full, tmp_path):
    out = str(tmp_path / 'slice-empty.zip')
    assert GS.main([full, out, '--date', '2027-06-01']) == 2
    assert not os.path.exists(out)
    assert GS.main([full, out, '--date', D.isoformat()]) == 0
    assert os.path.exists(out)


def test_feed_reads_slice(full, tmp_path):
    out = str(tmp_path / 'slice.zip')
    GS.make_slice(full, out, D)
    f = L.Feed(D, D, D, src=out)
    assert sorted(f.trips) == ['T1', 'T3', 'T6', 'T7']
    assert f.svc_next == {'S1'}
    # night=True: גם נסיעת הלילה של שירות שנוסע רק מחר — בלי תאריכים בחלון (לא בווריאנטים), רק ל-svc_next
    f = L.Feed(D, D, D, src=out, night=True)
    assert sorted(f.trips) == ['T1', 'T2', 'T3', 'T6', 'T7']
    assert f.svc_next == {'S1', 'S2'} and f.svc_dates['S2'] == () and f.svc_set['S2'] == {D1}
    assert all(k != '10002-1-#' for k in f.variants(D, D))
    assert f.agency_phone['3'] == '*2800'
    assert f.stops['C']['name'] == 'גימל, צפון'
    assert f.load_shapes({'SH1'})['SH1'] == [(32.96, 35.49), (32.97, 35.50)]


def norm_variants(feed, d0, d1):
    """הווריאנטים בלי מזהה הרצף הפנימי: (רצף התחנות, שרטוט) → (נסיעות×ימים, תאריכים, קו)"""
    return {k: {(tuple(feed.pat_list[p]), s): (x['td'], sorted(x['dates']), x['rid']) for (p, s), x in vs.items()}
            for k, vs in feed.variants(d0, d1).items()}


def norm_deps(feed, days):
    deps = feed.deps_by(L.dir_key)
    return {dk: [feed.day_deps(svcs, d) for d in days] for dk, svcs in deps.items()}


def test_basefeed_from_slices_equals_full_file(tmp_path):
    # Feed קורא רק calendar.txt (כמו הקובץ של המשרד) — ההשוואה על קובץ בלי calendar_dates
    full = full_gtfs(tmp_path / 'gtfs.zip', cal_dates=False)
    s0, s1 = str(tmp_path / 's0.zip'), str(tmp_path / 's1.zip')
    GS.make_slice(full, s0, D)
    GS.make_slice(full, s1, D1)
    ref = L.Feed(D, D, D1, src=full)
    parts = [(L.Feed(D, D, D, src=s0, night=True), {D}), (L.Feed(D1, D1, D1, src=s1, night=True), {D1})]
    b = L.BaseFeed(D, D, D1, parts)
    assert norm_variants(b, D, D1) == norm_variants(ref, D, D1)
    # שעות היציאה לכל יום — כולל נסיעות אחרי חצות (T2 של שלישי 00:30 שייכת לערב של שני; T6 ו-T7 של רביעי — לערב של שלישי.
    # T7 בשירות שלא נוסע בשלישי — בפרוסה של שלישי כנסיעת לילה בלבד)
    assert norm_deps(b, [D, D1]) == norm_deps(ref, [D, D1])
    assert 1470 in norm_deps(b, [D, D1])['10002-1'][0]
    assert {1455, 1460} <= set(norm_deps(b, [D, D1])['10001-1'][1])
    assert b.load_shapes({'SH1', 'SH2', 'nope'}) == ref.load_shapes({'SH1', 'SH2'})


def test_basefeed_with_archive_fallback_for_a_missing_day(tmp_path):
    """יום בלי פרוסה — מהקובץ המלא (בעבודה: הארכיון ב-S3), רק התאריך החסר; התוצאה זהה"""
    full = full_gtfs(tmp_path / 'gtfs.zip', cal_dates=False)
    sl = tmp_path / 'slices'
    sl.mkdir()
    GS.make_slice(full, str(sl / f'slice-{D1.isoformat()}.zip'), D1)
    calls = []

    def fake_open_feed(day, d0, d1, back=4):
        calls.append((day, d0, d1))
        return L.Feed(day, d0, d1, src=full)

    orig = L.open_feed
    L.open_feed = fake_open_feed
    try:
        t0 = D1 + DAY
        b = L.open_baseline(t0, D, slices_dir=str(sl))
    finally:
        L.open_feed = orig
    assert calls == [(D, D, D1)]
    assert L.BASE_INFO['slices'] == [D1.isoformat()] and L.BASE_INFO['archive'] == [D.isoformat()]
    ref = L.Feed(D, D, D1, src=full)
    assert norm_variants(b, D, D1) == norm_variants(ref, D, D1)
    assert norm_deps(b, [D, D1]) == norm_deps(ref, [D, D1])


def test_open_baseline_without_slices_is_the_archive_feed(tmp_path):
    full = full_gtfs(tmp_path / 'gtfs.zip', cal_dates=False)
    orig = L.open_feed
    L.open_feed = lambda day, d0, d1, back=4: L.Feed(day, d0, d1, src=full)
    try:
        b = L.open_baseline(D1 + DAY, D, slices_dir=str(tmp_path / 'none'))
    finally:
        L.open_feed = orig
    assert type(b) is L.Feed and L.BASE_INFO['archive'] == [D.isoformat(), D1.isoformat()]


def test_empty_or_broken_slice_falls_back(tmp_path):
    full = full_gtfs(tmp_path / 'gtfs.zip', cal_dates=False)
    sl = tmp_path / 'slices'
    sl.mkdir()
    GS.make_slice(full, str(sl / f'slice-{D.isoformat()}.zip'), D)
    (sl / f'slice-{D1.isoformat()}.zip').write_bytes(b'not a zip')
    orig = L.open_feed
    L.open_feed = lambda day, d0, d1, back=4: L.Feed(day, d0, d1, src=full)
    try:
        b = L.open_baseline(D1 + DAY, D, slices_dir=str(sl))
    finally:
        L.open_feed = orig
    assert L.BASE_INFO['slices'] == [D.isoformat()] and L.BASE_INFO['archive'] == [D1.isoformat()]
    ref = L.Feed(D, D, D1, src=full)
    assert norm_variants(b, D, D1) == norm_variants(ref, D, D1)


def test_new_feed_from_local_file(tmp_path, monkeypatch):
    full = full_gtfs(tmp_path / 'gtfs.zip', cal_dates=False)
    monkeypatch.setenv('NEW_GTFS', full)
    monkeypatch.setenv('NEW_GTFS_DAY', D.isoformat())
    f = L.open_new_feed(D1, D1 + 7 * DAY)
    assert f.day == D and f.url == full and 'T2' in f.trips


def test_last_day_from_archive_keeps_its_own_night_trips(tmp_path):
    """אתמול בלי פרוסה: הנסיעות שאחרי חצות — מהגיבוי (כמו קודם), לא פעמיים"""
    full = full_gtfs(tmp_path / 'gtfs.zip', cal_dates=False)
    sl = tmp_path / 'slices'
    sl.mkdir()
    GS.make_slice(full, str(sl / f'slice-{D.isoformat()}.zip'), D)
    orig = L.open_feed
    L.open_feed = lambda day, d0, d1, back=4: L.Feed(day, d0, d1, src=full)
    t0 = D1 + DAY
    try:
        b = L.open_baseline(t0, D, slices_dir=str(sl))
    finally:
        L.open_feed = orig
    assert L.BASE_INFO['archive'] == [D1.isoformat()]
    ref = L.Feed(D, D, D1, src=full)
    assert norm_variants(b, D, D1) == norm_variants(ref, D, D1)
    assert norm_deps(b, [D, D1]) == norm_deps(ref, [D, D1])
