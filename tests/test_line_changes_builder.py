# -*- coding: utf-8 -*-
"""בדיקות יחידה לבונה של "מצגת לשינוי בקו" (tools/line_changes.py) — זיהוי סוג השינוי, עם נתונים קטנים בזיכרון
(בלי GTFS אמיתי ובלי רשת): קו חדש וקו שמבוטל (find_new_ended), שינוי מסלול — תחנות שנוספו ובוטלו, החלפת מק"ט,
תחנה שזזה, עקיפה מול שרטוט מחדש, קו שמתארך (compare), שינוי בלוח הזמנים בלבד (tt_change), חלופה שהוחלפה
(find_renamed / rename_records), חלופה שבוטלה וחלופה חדשה (find_variants / variant_records), התחנה החלופית הקרובה
בהליכה (add_walks — WALK_CANDS / WALK_AIR_MAX / WALK_MAX, השירות מוחלף בפונקציה מקומית), סוג הקו (load_line_types)
ומספר התחנות בכל עיר (stop_city_counts — cn), והלו"ז העדכני של השבוע שאחרי (current_tts — w1).
הרצה: python3 -m pytest -q tests/test_line_changes_builder.py"""
import datetime
import json
import os
import sys
import time
from collections import defaultdict

import importlib.util  # noqa: E402
import pytest

# נטען בשם ייחודי: גם בכלי המכרזים יש מודול בשם line_changes (ראו tests/test_line_changes_units.py)
_TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools')
if _TOOLS not in sys.path:
    sys.path.append(_TOOLS)
_spec = importlib.util.spec_from_file_location('lc_builder', os.path.join(_TOOLS, 'line_changes.py'))
L = importlib.util.module_from_spec(_spec)
sys.modules['lc_builder'] = L
_spec.loader.exec_module(L)

D = datetime.date
DAY = datetime.timedelta(days=1)
T0 = D(2026, 11, 19)          # יום חמישי
OLD_D0 = T0 - 7 * DAY         # השבוע שעבר: 12.11 (חמישי) עד 18.11
M_LAT = 1 / 110540            # מטר אחד בקו רוחב, במעלות (כמו ב-dist_m)


def days(a, b):
    """כל התאריכים מ-a עד b (כולל)"""
    return {a + i * DAY for i in range((b - a).days + 1)}


class FakeFeed:
    """GTFS קטן בזיכרון — רק השדות שהפונקציות הנבדקות קוראות. day_deps — הפונקציה האמיתית של Feed"""
    day_deps = L.Feed.day_deps

    def __init__(self, d0, pats=None, stops=None, routes=None, svc_set=None, day=None):
        self.d0, self.day = d0, day or d0
        self.pat_list = pats or {}
        self.stops = stops or {}
        self.routes = routes or {}
        self.agency = {'3': 'אגד', '5': 'דן'}
        self.svc_set = svc_set or {}


def route(line='970', ty='3', ag='3', long='תחנה-רמת גן<->תחנה-חיפה-1#'):
    return dict(line=line, ty=ty, ag=ag, long=long, rd='')


def var(dates, pid=1, shp='s', rid='r', td=None):
    """וריאנט אחד של מק"ט-כיוון-חלופה: {(רצף, שרטוט): {td, dates, svc, rid}}"""
    return {(pid, shp): {'td': td if td is not None else len(dates) * 10, 'dates': set(dates), 'svc': set(), 'rid': rid}}


def stop(code, la, lo, city='בני ברק', name=None):
    return {'code': code, 'name': name or 'תחנה ' + code, 'll': (la, lo), 'city': city}


def line_stops(codes, lat0=32.08, lon=34.83, step=0.004):
    return [stop(c, lat0 + i * step, lon) for i, c in enumerate(codes)]


def straight(n=16, lat0=32.08, lon=34.83, step=0.002):
    return [(lat0 + i * step, lon) for i in range(n)]


def cmp(old, new, o_shape=None, n_shape=None):
    return L.compare(old, new, {s['code']: s for s in old}, {s['code']: s for s in new}, o_shape or [], n_shape or [])


# ---------------------------------------------------------------- קו חדש / קו שמבוטל (find_new_ended)

def new_ended(old_v, new_v, routes=None):
    routes = routes or {'r': route()}
    old, new = FakeFeed(OLD_D0, routes=routes), FakeFeed(T0, routes=routes)
    stats = defaultdict(int)
    keys = sorted(set(old_v) | set(new_v))
    n, e = L.find_new_ended(keys, old_v, new_v, old, new, T0, stats)
    return n, e, stats


def test_new_line_found():
    """מק"ט שלא נסע בשבוע שעבר ומתחיל השבוע — קו חדש, מהיום הראשון שלו (כל הכיוונים יחד)"""
    new_v = {'45009-1-#': var(days(T0 + 2 * DAY, T0 + 20 * DAY)), '45009-2-#': var(days(T0 + 3 * DAY, T0 + 20 * DAY))}
    n, e, _ = new_ended({}, new_v)
    assert n == {'45009': (['45009-1-#', '45009-2-#'], T0 + 2 * DAY)}
    assert e == {}


def test_new_line_later_than_a_week_waits():
    """קו חדש שמתחיל רק בעוד יותר משבוע — לא עכשיו (ייכנס בריצה של שבוע הבא)"""
    n, _e, stats = new_ended({}, {'45009-1-#': var(days(T0 + 8 * DAY, T0 + 20 * DAY))})
    assert n == {} and stats['new_later'] == 1


def test_rail_and_lines_without_number_are_skipped():
    """רכבת (route_type 2) וקו בלי מספר — לא קו חדש ולא קו מבוטל"""
    routes = {'rail': route(ty='2'), 'nonum': route(line='')}
    new_v = {'1-1-#': var(days(T0, T0 + 20 * DAY), rid='rail'), '2-1-#': var(days(T0, T0 + 20 * DAY), rid='nonum')}
    old_v = {'3-1-#': var(days(OLD_D0, T0 - DAY), rid='rail')}
    n, e, _ = new_ended(old_v, new_v, routes)
    assert n == {} and e == {}


def test_line_started_mid_last_week_is_new():
    """קו שהתחיל ביום שני שעבר: בחמישי ובראשון של השבוע שעבר (ימים שהוא נוסע בהם עכשיו) לא נסע — קו חדש מיום שני"""
    F = D(2026, 11, 16)
    wk = {d for d in days(F, T0 + 20 * DAY) if d.weekday() in (6, 0, 1, 2, 3)}   # א׳–ה׳
    n, _e, stats = new_ended({'45010-1-#': var({d for d in wk if d < T0})}, {'45010-1-#': var({d for d in wk if d >= T0})})
    assert n == {'45010': (['45010-1-#'], F)} and stats['new_started'] == 1


def test_line_missing_one_day_last_week_is_not_new():
    """רק יום אחד בלי נסיעות בתחילת השבוע שעבר — לא מספיק כדי לקרוא לקו "חדש\""""
    F = D(2026, 11, 13)
    wk = {d for d in days(F, T0 + 20 * DAY) if d.weekday() in (6, 0, 1, 2, 3)}
    n, _e, _ = new_ended({'45010-1-#': var({d for d in wk if d < T0})}, {'45010-1-#': var({d for d in wk if d >= T0})})
    assert n == {}


def test_ended_line_found():
    """מק"ט שנסע בשבוע שעבר ואין לו אף נסיעה מעכשיו — קו שמבוטל, עם היום האחרון שלו"""
    old_v = {'71011-1-#': var(days(OLD_D0, T0 - 2 * DAY)), '71011-2-#': var(days(OLD_D0, T0 - 3 * DAY))}
    n, e, _ = new_ended(old_v, {})
    assert n == {}
    assert e == {'71011': (['71011-1-#', '71011-2-#'], T0 - 2 * DAY, False)}


def test_line_ending_this_week_is_ended_soon():
    """קו שהנסיעה האחרונה שלו בשבוע הקרוב, ואחריה אין כלום — קו שמבוטל (soon), מהיום האחרון"""
    old_v = {'71011-1-#': var(days(OLD_D0, T0 - DAY))}
    new_v = {'71011-1-#': var(days(T0, T0 + 3 * DAY))}
    _n, e, _ = new_ended(old_v, new_v)
    assert e == {'71011': (['71011-1-#'], T0 + 3 * DAY, True)}


def test_line_that_keeps_running_is_not_ended():
    old_v = {'71011-1-#': var(days(OLD_D0, T0 - DAY))}
    new_v = {'71011-1-#': var(days(T0, T0 + 20 * DAY))}
    n, e, _ = new_ended(old_v, new_v)
    assert n == {} and e == {}


# ---------------------------------------------------------------- שינוי מסלול (compare)

def test_route_change_stops_added_and_removed():
    """תחנה c בוטלה ובמקומה x במקום אחר — אחת נוספה ואחת בוטלה; התחנות שנשארו — לא"""
    old = line_stops('abcde')
    new = [s for s in old if s['code'] != 'c']
    new.insert(2, stop('x', 32.088, 34.85))
    res, minor = cmp(old, new)
    assert [s['code'] for s in res['added']] == ['x']
    assert [s['code'] for s in res['removed']] == ['c']
    assert res['moved'] == [] and res['swaps'] == [] and res['ext'] == ''
    assert not res['order']
    assert 'code' not in minor


def test_stop_code_swap_is_not_a_change():
    """מק"ט חדש באותו שם ובאותו מקום (עד SWAP_M) — החלפת מק"ט בלבד: לא נוספה ולא בוטלה"""
    old = line_stops('abcde')
    new = [dict(s) for s in old]
    new[2] = stop('c2', old[2]['ll'][0] + 20 * M_LAT, 34.83, name=old[2]['name'])
    res, minor = cmp(old, new)
    assert res['added'] == [] and res['removed'] == []
    assert res['swaps'] == [{'old': 'c', 'new': 'c2', 'name': old[2]['name']}]
    assert minor['code'] == 1


def test_moved_stop():
    """אותו מק"ט שזז יותר מ-MOVE_M — תחנה שזזה; הזזה קטנה — רק בסטטיסטיקה"""
    old = line_stops('abcde')
    new = [dict(s) for s in old]
    new[1] = dict(new[1], ll=(new[1]['ll'][0] + 120 * M_LAT, 34.83))
    new[3] = dict(new[3], ll=(new[3]['ll'][0] + 20 * M_LAT, 34.83))
    res, minor = cmp(old, new)
    assert [m['code'] for m in res['moved']] == ['b'] and 115 <= res['moved'][0]['m'] <= 125
    assert minor['move'] == 1


def test_same_stops_redraw_is_not_a_route_change():
    """אותן תחנות, השרטוט זז 50 מ' — שרטוט מחדש של אותה דרך, לא שינוי מסלול"""
    st = line_stops('abcde')
    shp = straight()
    lon_m = 1 / (111320 * 0.847)
    redraw = [(la, lo + 50 * lon_m) if 4 <= i <= 10 else (la, lo) for i, (la, lo) in enumerate(shp)]
    res, minor = cmp(st, st, shp, redraw)
    assert not res['geo'] and res['dev'] == 0
    assert minor['redraw'] == 1


def test_same_stops_detour_is_a_route_change():
    """אותן תחנות, אבל קטע של יותר מ-400 מ' רחוק מהמסלול הקודם יותר מ-150 מ' — עקיפה (geo)"""
    st = line_stops('abcde')
    shp = straight()
    lon_m = 1 / (111320 * 0.847)
    detour = [(la, lo + 300 * lon_m) if 4 <= i <= 10 else (la, lo) for i, (la, lo) in enumerate(shp)]
    res, _ = cmp(st, st, shp, detour)
    assert res['geo'] and res['dev'] > 400
    assert res['added'] == [] and res['removed'] == []


def test_extension_at_the_end():
    """אותן תחנות באותו סדר ועוד תחנות בסוף — קו שמתארך (ext=end)"""
    old = line_stops('abc')
    new = line_stops('abcde')
    res, _ = cmp(old, new)
    assert res['ext'] == 'end' and [s['code'] for s in res['added']] == ['d', 'e']
    res2, _ = cmp(line_stops('cde', lat0=32.088), line_stops('abcde'))
    assert res2['ext'] == 'start'


def test_identical_route_is_no_change():
    st = line_stops('abcde')
    shp = straight()
    res, minor = cmp(st, st, shp, list(shp))
    assert not (res['added'] or res['removed'] or res['moved'] or res['geo'])
    assert dict(minor) == {}


# ---------------------------------------------------------------- שינוי בלוח הזמנים בלבד (tt_change)

def tt_feeds(old_deps, new_deps, extra_old=None):
    """שירות אחד בשבוע שעבר ושירות אחד מהיום; extra_old — {תאריך: שעות} לימים חריגים בשבוע שעבר"""
    last = T0 + 20 * DAY
    ref_days = sorted(days(OLD_D0, T0 - DAY))
    o_svc = {'o': list(old_deps)}
    o_set = {'o': set(d for d in ref_days if d not in (extra_old or {}))}
    for i, (d, deps) in enumerate(sorted((extra_old or {}).items())):
        o_svc['x%d' % i] = list(deps)
        o_set['x%d' % i] = {d}
    old = FakeFeed(OLD_D0, svc_set=o_set)
    new = FakeFeed(T0, svc_set={'n': days(T0, last)})
    return L.tt_change(old, new, o_svc, {'n': list(new_deps)}, ref_days, T0, last)


def test_timetable_change_found():
    """אותו מסלול, נסיעה נוספת בכל יום — שינוי בלוח הזמנים מהיום, כל ימי השבוע בקבוצה אחת"""
    res, why = tt_feeds([420, 480, 540], [420, 480, 540, 600])
    assert why == ''
    eff, groups, changed = res
    assert eff == T0
    assert len(groups) == 1 and changed == groups
    assert changed[0][1] == [420, 480, 540] and changed[0][2] == [420, 480, 540, 600]


def test_timetable_same_is_no_change():
    assert tt_feeds([420, 480, 540], [420, 480, 540]) == (None, 'same')


def test_timetable_small_shift_is_not_significant():
    """הזזה של 2 דקות בנסיעה אמצעית — לא שינוי משמעותי (מסונן, 'shift')"""
    assert tt_feeds([420, 480, 540], [420, 482, 540]) == (None, 'shift')


def test_holiday_last_week_is_not_a_change():
    """יום חריג אחד בשבוע שעבר (חג — פחות נסיעות) בתוך ימים עם אותו לוח חדש — מקבל את הלוח של רוב הימים"""
    holiday = D(2026, 11, 16)
    assert tt_feeds([420, 480, 540], [420, 480, 540], extra_old={holiday: [480]}) == (None, 'same')


# ---------------------------------------------------------------- חלופה שהוחלפה (find_renamed / rename_records)

REN_STOPS = {c: stop(c, 32.08 + i * 0.004, 34.83) for i, c in enumerate('abcdefgh')}
REN_STOPS['x'] = stop('x', 32.09, 34.86)


def renamed(old_v, new_v, pats_old=None, pats_new=None):
    pats_old = pats_old or {1: list('abcdefgh'), 2: list('abcdefgh'), 3: list('abcdefgh')}
    pats_new = pats_new or pats_old
    old = FakeFeed(OLD_D0, pats_old, REN_STOPS, {'r': route()})
    new = FakeFeed(T0, pats_new, REN_STOPS, {'r': route()})
    return L.find_renamed(sorted(set(old_v) | set(new_v)), old_v, new_v, old, T0, new), old, new


def test_renamed_gap_up_to_8_days_when_direction_idle():
    """הפסקה של 6 ימים בין הישנה לחדשה, ובינתיים אין בכיוון אף נסיעה — עדיין אותה חלופה"""
    old_v = {'10970-1-#': var(days(OLD_D0 - 7 * DAY, OLD_D0 - DAY) | {OLD_D0}, pid=1)}
    F = OLD_D0 + 6 * DAY
    new_v = {'10970-1-0': var(days(F, T0 + 20 * DAY), pid=2)}
    old_v['10970-1-0'] = var({F}, pid=2)
    ren, _o, _n = renamed(old_v, new_v)
    assert ren == {'10970-1-0': ('10970-1-#', F)}


def test_not_renamed_after_long_gap_with_other_trips():
    """הפסקה של 6 ימים כשחלופה אחרת באותו כיוון נסעה בינתיים — לא החלפה"""
    old_v = {'10970-1-#': var({OLD_D0}, pid=1), '10970-1-5': var(days(OLD_D0, T0 - DAY), pid=3)}
    F = OLD_D0 + 6 * DAY
    old_v['10970-1-0'] = var({F}, pid=2)
    new_v = {'10970-1-0': var(days(F, T0 + 20 * DAY), pid=2), '10970-1-5': var(days(T0, T0 + 20 * DAY), pid=3)}
    ren, _o, _n = renamed(old_v, new_v)
    assert ren == {}


def test_renamed_picks_the_busiest_old_alternative():
    """שתי חלופות ישנות שהפסיקו לפני החדשה — נבחרת זו שנסעה הכי הרבה בשבוע שעבר"""
    F = T0 - 2 * DAY
    old_v = {'10970-1-#': var(days(OLD_D0, F - DAY), pid=1, td=5),
             '10970-1-1': var(days(OLD_D0, F - DAY), pid=3, td=50),
             '10970-1-0': var({F, F + DAY}, pid=2)}
    new_v = {'10970-1-0': var(days(T0, T0 + 20 * DAY), pid=2)}
    ren, _o, _n = renamed(old_v, new_v)
    assert ren == {'10970-1-0': ('10970-1-1', F)}


def test_rename_record_for_changed_stops():
    """חלופה שהוחלפה ובמסלול החדש תחנה אחרת — רשומת שינוי מסלול עם was והסבר (basis)"""
    F = T0 - 2 * DAY
    old_v = {'10970-1-#': var(days(OLD_D0, F - DAY), pid=1), '10970-1-0': var({F, F + DAY}, pid=2)}
    new_v = {'10970-1-0': var(days(T0, T0 + 20 * DAY), pid=2)}
    pats = {1: list('abcdefgh'), 2: list('abcxefgh')}
    ren, old, new = renamed(old_v, new_v, pats, pats)
    stats = {}
    recs = L.rename_records(ren, old_v, new_v, old, new, {}, {}, T0, stats)
    assert len(recs) == 1
    r = recs[0]
    assert r['rd'] == '10970-1-0' and r['was'] == '10970-1-#' and r['eff'] == F.isoformat()
    assert r['added'] == ['x'] and r['removed'] == ['d']
    assert '10970-1-#' in r['basis'] and '10970-1-0' in r['basis']


# ---------------------------------------------------------------- חלופה שבוטלה / חדשה (find_variants / variant_records)

def variants_case(old_v, new_v, pats):
    old = FakeFeed(OLD_D0, pats, REN_STOPS, {'r': route()})
    new = FakeFeed(T0, pats, REN_STOPS, {'r': route()})
    stats = defaultdict(int)
    keys = sorted(set(old_v) | set(new_v))
    out = L.find_variants(keys, old_v, new_v, old, new, {}, {}, {}, T0, stats)
    return out, L.variant_records(out, old, new, {}, {}, T0, defaultdict(int)), stats


def test_ended_alternative_with_lost_stop():
    """חלופה שנסעה בשבוע שעבר ואין לה נסיעות מעכשיו, ותחנה x שאף חלופה אחרת של הקו לא עוצרת בה — חלופה שבוטלה"""
    pats = {1: list('abcdefgh'), 2: list('abcxdefgh')}
    old_v = {'10970-1-#': var(days(OLD_D0, T0 - DAY), pid=1), '10970-1-3': var(days(OLD_D0, T0 - 2 * DAY), pid=2)}
    new_v = {'10970-1-#': var(days(T0, T0 + 20 * DAY), pid=1)}
    out, recs, stats = variants_case(old_v, new_v, pats)
    assert [(v['k'], v['var'], v['lost']) for v in out] == [('10970-1-3', 'end', {'x'})]
    assert stats['varend'] == 1
    assert len(recs) == 1 and recs[0]['var'] == 'end' and recs[0]['removed'] == ['x'] and recs[0]['added'] == []
    assert recs[0]['last'] == (T0 - 2 * DAY).isoformat() and recs[0]['eff'] == (T0 - DAY).isoformat()


def test_ended_alternative_without_lost_stops_is_skipped():
    """חלופה שבוטלה, אבל כל התחנות שלה עדיין בחלופה אחרת (קיצור מסלול) — לא נכנסת"""
    pats = {1: list('abcdefgh'), 2: list('abcd')}
    old_v = {'10970-1-#': var(days(OLD_D0, T0 - DAY), pid=1), '10970-1-3': var(days(OLD_D0, T0 - 2 * DAY), pid=2)}
    new_v = {'10970-1-#': var(days(T0, T0 + 20 * DAY), pid=1)}
    out, _recs, stats = variants_case(old_v, new_v, pats)
    assert out == [] and stats['varend_same'] == 1


def test_new_alternative_with_new_stop():
    """חלופה שלא נסעה בשבוע שעבר ומתחילה השבוע (VAR_MIN נסיעות לפחות), עם תחנה חדשה לקו — חלופה חדשה"""
    pats = {1: list('abcdefgh'), 2: list('abcxdefgh')}
    old_v = {'10970-1-#': var(days(OLD_D0, T0 - DAY), pid=1)}
    new_v = {'10970-1-#': var(days(T0, T0 + 20 * DAY), pid=1), '10970-1-4': var(days(T0 + DAY, T0 + 20 * DAY), pid=2, td=40)}
    out, recs, stats = variants_case(old_v, new_v, pats)
    assert [(v['k'], v['var'], v['eff']) for v in out] == [('10970-1-4', 'new', T0 + DAY)]
    assert stats['varnew'] == 1
    assert recs[0]['added'] == ['x'] and recs[0]['removed'] == [] and recs[0]['freq']


# ---------------------------------------------------------------- התחנה החלופית בהליכה (add_walks)

def arr(code, la, lo):
    return [code, 'תחנה ' + code, la, lo, 'בני ברק']


def walk_rec(news, removed=('r',)):
    return {'old': {'stops': [arr('r', 32.0, 34.8)]}, 'new': {'stops': news}, 'removed': list(removed)}


@pytest.fixture
def walk_env(monkeypatch, tmp_path):
    """בלי רשת ובלי המתנה: walk_table מוחלפת ברשימת קריאות ובתשובה קבועה"""
    monkeypatch.delenv('WALK', raising=False)
    monkeypatch.setattr(time, 'sleep', lambda s: None)
    calls = []
    answer = {}

    def fake_table(src, dests):
        calls.append([d[0] for d in dests])
        if answer.get('fail'):
            raise RuntimeError('down')
        return [answer.get(d[0], 500) for d in dests]

    monkeypatch.setattr(L, 'walk_table', fake_table)
    return calls, answer, str(tmp_path)


def north(code, m):
    return arr(code, 32.0 + m * M_LAT, 34.8)


def test_walk_checks_only_the_nearest_candidates(walk_env):
    """נבדקות רק WALK_CANDS התחנות הקרובות ביותר בקו אווירי, ורק עד WALK_AIR_MAX; התחנה עצמה (אותו מק"ט) — לא"""
    calls, answer, data = walk_env
    news = [north('r', 0)] + [north('s%d' % i, 100 * i) for i in range(1, 12)] + [north('far', 1400)]
    answer.update({'s3': 250, 's1': 700})
    f = walk_rec(news)
    L.add_walks([f], data)
    assert len(calls) == 1
    assert calls[0] == ['s%d' % i for i in range(1, L.WALK_CANDS + 1)]
    assert f['walk'] == {'r': {'to': 's3', 'm': 250}}


def test_walk_air_max_none_without_request(walk_env):
    """אין אף תחנה במסלול החדש עד WALK_AIR_MAX בקו אווירי — "לא נמצאה", בלי בקשה לשירות"""
    calls, _answer, data = walk_env
    f = walk_rec([north('a', L.WALK_AIR_MAX + 100), north('b', 2000)])
    L.add_walks([f], data)
    assert calls == [] and f['walk'] == {'r': {'none': 1}}


def test_walk_too_far_on_foot_is_none(walk_env):
    """כל המועמדות רחוקות בהליכה יותר מ-WALK_MAX (או בלי מסלול) — "לא נמצאה\""""
    _calls, answer, data = walk_env
    answer.update({'a': L.WALK_MAX + 50, 'b': None})
    f = walk_rec([north('a', 300), north('b', 400)])
    L.add_walks([f], data)
    assert f['walk'] == {'r': {'none': 1}}


def test_walk_cache_reused_and_pruned(walk_env):
    """זוג שכבר חושב נשמר ב-walk.json ולא מבוקש שוב; בקובץ נשארים רק הזוגות שבשימוש"""
    calls, answer, data = walk_env
    answer.update({'a': 320})
    f = walk_rec([north('a', 300)])
    L.add_walks([f], data)
    L.add_walks([walk_rec([north('a', 300)])], data)
    assert len(calls) == 1
    cache = json.load(open(os.path.join(data, 'walk.json'), encoding='utf-8'))
    assert list(cache.values()) == [320]
    L.add_walks([walk_rec([north('b', 300)], removed=())], data)
    assert json.load(open(os.path.join(data, 'walk.json'), encoding='utf-8')) == {}


def test_walk_service_down_leaves_no_walk(walk_env):
    """השירות לא זמין — אין שדה walk (המצגת משתמשת בהערכה בקו אווירי), ולא "לא נמצאה\""""
    _calls, answer, data = walk_env
    answer['fail'] = True
    f = walk_rec([north('a', 300)])
    f['walk'] = {'old': 1}
    L.add_walks([f], data)
    assert 'walk' not in f


def test_walk_disabled(walk_env, monkeypatch):
    calls, _answer, data = walk_env
    monkeypatch.setenv('WALK', '0')
    f = walk_rec([north('a', 300)])
    L.add_walks([f], data)
    assert calls == [] and 'walk' not in f and not os.path.exists(os.path.join(data, 'walk.json'))


# ---------------------------------------------------------------- סוג הקו (load_line_types)

def test_load_line_types(tmp_path):
    """לפי מק"ט — הסוג של רוב השורות; סוג לא מוכר ושורה קצרה — מדולגים"""
    rows = [[10970, '970', 1, 'א', 'ב', 'מרכז', 'בינעירוני'], [10970, '970', 2, 'ב', 'א', 'מרכז', 'בינעירוני'],
            [10970, '970', 3, 'ב', 'א', 'מרכז', 'עירוני'], [11001, '1', 1, 'א', 'ב', 'דרום', 'עירוני'],
            [12000, '200', 1, 'א', 'ב', 'צפון', 'אזורי'], [13000, '300', 1, 'א', 'ב', 'צפון', 'אחר'], [14000, '400']]
    p = tmp_path / 'main.json'
    p.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    assert L.load_line_types(str(p)) == {'10970': 'i', '11001': 'u', '12000': 'r'}


def test_load_line_types_from_env_and_missing(tmp_path, monkeypatch):
    p = tmp_path / 'm.json'
    p.write_text(json.dumps([[5, '5', 1, '', '', '', 'עירוני']]), encoding='utf-8')
    monkeypatch.setenv('LC_LINE_TYPES', str(p))
    assert L.load_line_types() == {'5': 'u'}
    assert L.load_line_types(str(tmp_path / 'none.json')) == {}
    bad = tmp_path / 'bad.json'
    bad.write_text('{not json', encoding='utf-8')
    assert L.load_line_types(str(bad)) == {}


# ---------------------------------------------------------------- מספר התחנות בכל עיר (cn)

def test_stop_city_counts_parallel_to_stop_cities():
    """לכל עיר ברצף (stop_cities) — כמה תחנות בה; תחנה בלי עיר לא נספרת ולא מפרידה"""
    st = [{'city': c} for c in ['לוד', 'לוד', '', 'לוד', 'רמלה', 'רמלה', 'לוד']]
    assert L.stop_cities(st) == ['לוד', 'רמלה', 'לוד']
    assert L.stop_city_counts(st) == [3, 2, 1]
    assert L.stop_city_counts([]) == [] and L.stop_city_counts([{'city': ''}]) == []


def _tt_rec(eff, found, tt):
    return dict(rd='49010-1-#', kind='timetable', eff=eff, found=found, tt=tt)


def test_keep_prev_drops_later_part_of_same_timetable_change():
    """שינוי בלו"ז ברביעי–שישי מ-18.11 נמצא אתמול. היום נשאר בהשוואה רק שישי (20.11), עם אותן שעות —
    זה אותו שינוי, ולא דף נוסף"""
    fri = dict(t=['d5'], n=[300, 360, 650], o=[300, 360, 655])
    prev = [_tt_rec('2026-11-18', '2026-11-18', [dict(t=['d3', 'd4'], n=[285, 345], o=[290, 350]), fri])]
    found = [_tt_rec('2026-11-20', '2026-11-19', [dict(fri)])]
    out = L.keep_prev(found, prev, '2026-11-19', '2026-11-05')
    assert [f['eff'] for f in out] == ['2026-11-18']


def test_keep_prev_keeps_different_later_timetable_change():
    """שינוי אחר בשישי (שעות אחרות מאלה שברישום הקודם), או שינוי אחרי השבוע הראשון — נשאר בנפרד"""
    prev = [_tt_rec('2026-11-18', '2026-11-18', [dict(t=['d5'], n=[300, 360, 650], o=[300, 360, 655])])]
    other = [_tt_rec('2026-11-20', '2026-11-19', [dict(t=['d5'], n=[300, 400], o=[300, 360, 650])])]
    assert sorted(f['eff'] for f in L.keep_prev(other, prev, '2026-11-19', '2026-11-05')) == ['2026-11-18', '2026-11-20']
    late = [_tt_rec('2026-11-27', '2026-11-19', [dict(t=['d5'], n=[300, 360, 650], o=[300, 360, 655])])]
    assert sorted(f['eff'] for f in L.keep_prev(late, prev, '2026-11-19', '2026-11-05')) == ['2026-11-18', '2026-11-27']


# ---------------------------------------------------------------- לו"ז עדכני: השבוע שאחרי (current_tts — w1)

class TTFeed:
    """GTFS קטן ל-current_tts: קו אחד, כיוון אחד, חלופה אחת. svcs — {שירות: (תאריכים, [יציאות בדקות])}"""

    def __init__(self, t0, svcs, d1):
        self.day, self.d1 = t0, d1
        self.agency = {'18': 'קווים'}
        self.routes = {'r1': dict(ty='3', line='384', rd='14384-1-#', ag='18', long='תחנה-לוד<->תחנה-בני ברק-1#')}
        self.stops = {c: stop(c, 32.0 + i * 0.01, 34.9, city='לוד' if i < 2 else 'בני ברק') for i, c in enumerate('abcd')}
        self.pat_list = {1: list('abcd')}
        self.trips, self.trip_dep, self.trip_end, self.trip_pat, self.svc_dates, self.svc_set = {}, {}, {}, {}, {}, {}
        n = 0
        for sv, (ds, deps) in svcs.items():
            self.svc_set[sv] = self.svc_dates[sv] = set(ds)
            for m in deps:
                n += 1
                tid = f't{n}'
                self.trips[tid] = ('r1', sv, 's')
                self.trip_dep[tid], self.trip_end[tid], self.trip_pat[tid] = m, m + 50, 1


def run_tts(tmp_path, monkeypatch, svcs, d1):
    monkeypatch.setattr(L, 'OUTDIR', str(tmp_path))
    monkeypatch.setenv('LH_SCHED', str(tmp_path / 'none'))
    t0 = D(2026, 11, 23)   # יום שני
    L.current_tts(TTFeed(t0, svcs, d1), t0)
    sh = json.load(open(tmp_path / 'data' / 'tt' / f'{L.tt_shard("14384")}.json', encoding='utf-8'))
    return sh, sh['lines']['14384']['d']['1']


def wk_days(a, b):
    """ימי חול (א׳–ה׳) מ-a עד b"""
    return {d for d in days(a, b) if d.weekday() in (6, 0, 1, 2, 3)}


def test_tts_next_week_when_timetable_changes_mid_week(tmp_path, monkeypatch):
    """שינוי ביום ראשון 29.11 (07:20 → 07:15): w — ב׳–ה׳ מהלוח הישן, ראשון מהחדש; w1 — כל ימי החול מהחדש"""
    old, new = [420, 440, 480], [420, 435, 480]
    sh, r = run_tts(tmp_path, monkeypatch, {'o': (wk_days(D(2026, 11, 23), D(2026, 11, 28)), old),
                                            'n': (wk_days(D(2026, 11, 29), D(2026, 12, 31)), new)}, D(2026, 12, 31))
    assert sh['w1'] == 1
    L_ = r['L']
    assert [L_[i] for i in r['w'][:5]] == [new, old, old, old, old]
    assert [L_[i] for i in r['w1'][:5]] == [new] * 5
    assert r['w1'][5:] == r['w'][5:]


def test_tts_no_next_week_when_same(tmp_path, monkeypatch):
    """אותו לו"ז בשני השבועות — בלי w1 (הקובץ לא גדל)"""
    sh, r = run_tts(tmp_path, monkeypatch, {'o': (wk_days(D(2026, 11, 22), D(2026, 12, 31)), [420, 480])}, D(2026, 12, 31))
    assert 'w1' not in r and len(r['L']) == 2   # ימי חול, ויום בלי נסיעות (שישי ושבת)


def test_tts_next_week_beyond_feed_is_null(tmp_path, monkeypatch):
    """הנתונים נגמרים לפני השבוע שאחרי — null לימים שאין להם תאריך (בדף: הלו"ז מהיום, כמו קודם)"""
    sh, r = run_tts(tmp_path, monkeypatch, {'o': (wk_days(D(2026, 11, 22), D(2026, 12, 3)), [420, 480])}, D(2026, 12, 3))
    # השבוע שאחרי: ב׳ 30.11 עד ד׳ 2.12 — יש נתונים; ה׳ 3.12 (אין למחרת), שישי, שבת וראשון 6.12 — אין
    assert r['w1'][1:4] == r['w'][1:4]
    assert [r['w1'][i] for i in (0, 4, 5, 6)] == [None] * 4


def test_tts_direction_line_names(tmp_path, monkeypatch):
    """מק"ט אחד, ובכל כיוון מספר אחר (בצפת: 88001 — "1א" לכיוון 1 ו-"1" לכיוון 2) — l לכל כיוון; מספר אחד — בלי l"""
    t0 = D(2026, 11, 23)
    ds = wk_days(D(2026, 11, 22), D(2026, 12, 31))
    f = TTFeed(t0, {'o': (ds, [420, 480])}, D(2026, 12, 31))
    f.routes['r2'] = dict(f.routes['r1'], line='384א', rd='14384-2-#')
    for tid in list(f.trips):
        f.trips[tid + 'b'] = ('r2', 'o', 's')
        f.trip_dep[tid + 'b'], f.trip_end[tid + 'b'], f.trip_pat[tid + 'b'] = f.trip_dep[tid], f.trip_end[tid], 1
    monkeypatch.setattr(L, 'OUTDIR', str(tmp_path))
    monkeypatch.setenv('LH_SCHED', str(tmp_path / 'none'))
    L.current_tts(f, t0)
    e = json.load(open(tmp_path / 'data' / 'tt' / f'{L.tt_shard("14384")}.json', encoding='utf-8'))['lines']['14384']
    assert e['l'] == '384'
    assert (e['d']['1']['l'], e['d']['2']['l']) == ('384', '384א')
    assert '_l' not in e['d']['1']


def test_tts_no_line_name_when_same(tmp_path, monkeypatch):
    sh, r = run_tts(tmp_path, monkeypatch, {'o': (wk_days(D(2026, 11, 22), D(2026, 12, 31)), [420, 480])}, D(2026, 12, 31))
    assert 'l' not in r and '_l' not in r


# ---------------------------------------------------------------- שמות באנגלית (translations.txt) ללוח באנגלית

def test_en_lookup_quotes_and_headsign():
    rows = ({'trans_id': 0, 'lang': 1, 'translation': 2},
            iter([['בי"ס בר לב/בן יהודה', 'EN', 'Bar Lev School/Ben Yehuda'], ['צפת', 'EN', 'Safed'], ['צפת', 'AR', 'صفد'],
                  ['תחנה מרכזית', 'EN', 'Central Station'], ['ריק', 'EN', ''], []]))
    en = L.read_en(rows)
    assert L.en_of(en, "בי''ס בר לב/בן יהודה") == 'Bar Lev School/Ben Yehuda'   # '' ב-stops.txt מול " בתרגומים
    assert L.en_of(en, 'בי״ס בר לב/בן יהודה') == 'Bar Lev School/Ben Yehuda'
    assert L.en_of(en, 'צפת_תחנה מרכזית') == 'Safed, Central Station'          # יעד "עיר_תחנה" — מהחלקים
    assert L.en_of(en, 'צפת_נוף כנרת') is None and L.en_of(en, 'ריק') is None


def test_tts_english_names_and_headsign(tmp_path, monkeypatch):
    """בקובץ: en — {עברית: אנגלית} לשמות שבו (רק מה שיש לו תרגום), ו-h — היעד המפורסם של הכיוון"""
    t0 = D(2026, 11, 23)
    f = TTFeed(t0, {'o': (wk_days(D(2026, 11, 22), D(2026, 12, 31)), [420, 480])}, D(2026, 12, 31))
    f.en = {'לוד': 'Lod', 'בני ברק': 'Bnei Brak', 'תחנה': 'Station'}
    f.trip_hs = {t: 'בני ברק_תחנה' for t in f.trips}
    monkeypatch.setattr(L, 'OUTDIR', str(tmp_path))
    monkeypatch.setenv('LH_SCHED', str(tmp_path / 'none'))
    L.current_tts(f, t0)
    sh = json.load(open(tmp_path / 'data' / 'tt' / f'{L.tt_shard("14384")}.json', encoding='utf-8'))
    r = sh['lines']['14384']['d']['1']
    assert r['h'] == 'בני ברק_תחנה'
    assert sh['en']['בני ברק_תחנה'] == 'Bnei Brak, Station' and sh['en']['לוד'] == 'Lod' and sh['en']['בני ברק'] == 'Bnei Brak'
    assert 'en' not in sh['lines']


# ---------------------------------------------------------------- שמות באנגלית בדף של שינוי (data/l/<id>.json — en)

def test_add_en_names_of_change_record():
    """add_en: לכל רישום — en עם השמות שיש להם תרגום (תחנות, ערים, מוצא ויעד, החלפת מק"ט, קווים באותן תחנות)"""
    f = dict(od=['צפת', 'טבריה'], old=dict(stops=[['1', "בי''ס בר לב/בן יהודה", 32.9, 35.4, 'צפת']]),
             new=dict(stops=[['2', 'נוף כנרת', 32.9, 35.4, 'צפת']]), swaps=[dict(old='1', new='3', name='תחנה מרכזית')],
             alts=[dict(od=['צפת', 'טבריה'], s='תחנה מרכזית')], moved=[])
    nofeed = type('F', (), {})()
    new, old = type('F', (), {'en': {'צפת': 'Safed', 'טבריה': 'Tiberias', 'בי"ס בר לב/בן יהודה': 'Bar Lev School/Ben Yehuda'}})(), \
        type('F', (), {'en': {'תחנה מרכזית': 'Central Station', 'צפת': 'Zefat'}})()
    L.add_en([f], new, old, nofeed)
    assert f['en'] == {'צפת': 'Safed', 'טבריה': 'Tiberias', "בי''ס בר לב/בן יהודה": 'Bar Lev School/Ben Yehuda', 'תחנה מרכזית': 'Central Station'}
    g = dict(od=['ריק', 'ריק'], old=dict(stops=[]), new=dict(stops=[]), en={'x': 'y'})
    L.add_en([g], nofeed)
    assert 'en' not in g


def test_page_file_has_en_once(tmp_path, monkeypatch):
    """בקובץ הדף: en פעם אחת לכל הדף (רק שמות שבדף), ולא בתוך כל כיוון; ונשאר בריצה הבאה (שינוי שכבר התחיל)"""
    fx = os.path.join(os.path.dirname(__file__), 'fixtures', 'line-changes', 'data', 'l', '10282-20261116.json')
    dd = json.load(open(fx, encoding='utf-8'))
    monkeypatch.setattr(L, 'OUTDIR', str(tmp_path))
    monkeypatch.setattr(L, 'TODAY', datetime.date(2026, 11, 19))
    open(tmp_path / 'line-template.html', 'w', encoding='utf-8').write('<title>{{TITLE}}</title>{{DESC}}{{URL}}{{ID}}')
    found = [dict(x) for x in dd['dirs']]
    st = found[0]['new']['stops'][0]
    for f in found:
        f['en'] = {st[1]: 'Golda Terminal/Platforms', st[4]: 'Tel Aviv-Yafo', 'לא בדף': 'Not here'}
    L.write_out(found, {}, {}, datetime.date(2026, 11, 19), datetime.date(2026, 11, 12), keep_all=True)
    out = json.load(open(tmp_path / 'data' / 'l' / '10282-20261116.json', encoding='utf-8'))
    assert out['en'] == {st[1]: 'Golda Terminal/Platforms', st[4]: 'Tel Aviv-Yafo'}
    assert all('en' not in x for x in out['dirs'])
    L.write_out([], {}, {}, datetime.date(2026, 11, 19), datetime.date(2026, 11, 12), keep_all=True)   # כמו "pages": מהקבצים הקיימים
    out2 = json.load(open(tmp_path / 'data' / 'l' / '10282-20261116.json', encoding='utf-8'))
    assert out2['en'] == out['en']
