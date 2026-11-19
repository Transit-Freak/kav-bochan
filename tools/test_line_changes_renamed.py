# -*- coding: utf-8 -*-
"""בדיקה: חלופה שהוחלפה (find_renamed / rename_records) — החלפת מספר בלבד לא מופיעה כשינוי.
הרצה: python3 -m pytest tools/test_line_changes_renamed.py (או python3 tools/test_line_changes_renamed.py)"""
import datetime
import os
import sys

import importlib.util  # noqa: E402

# נטען בשם ייחודי: גם בכלי המכרזים יש מודול בשם line_changes, וכשכל הבדיקות רצות יחד
# השם הכפול גרם לבדיקות של המכרזים לקבל את המודול הזה
_TOOLS = os.path.dirname(os.path.abspath(__file__))
if _TOOLS not in sys.path:
    sys.path.append(_TOOLS)
_spec = importlib.util.spec_from_file_location('lc_builder', os.path.join(_TOOLS, 'line_changes.py'))
L = importlib.util.module_from_spec(_spec)
sys.modules['lc_builder'] = L
_spec.loader.exec_module(L)

D = datetime.date
T0 = D(2026, 11, 18)


class Feed:
    def __init__(self, d0, pats, stops):
        self.d0, self.pat_list, self.stops = d0, pats, stops
        self.routes = {'r': {'line': '970', 'ag': '3', 'ty': '3', 'long': 'א-רמת גן<->ב-חיפה-1#'}}
        self.agency = {'3': 'אגד'}


def stop(code, la, lo):
    return {'code': code, 'name': 'תחנה ' + code, 'll': [la, lo], 'city': 'בני ברק'}


STOPS = {c: stop(c, 32.08 + i * 0.004, 34.83) for i, c in enumerate('abcdefgh')}
STOPS['x'] = stop('x', 32.09, 34.86)   # תחנה במקום אחר לגמרי
SHP = [(32.08 + i * 0.002, 34.83) for i in range(16)]
SHP_X = SHP[:4] + [(32.09, 34.86), (32.095, 34.86)] + SHP[10:]


def days(a, b):
    return {a + datetime.timedelta(days=i) for i in range((b - a).days + 1)}


def var(pid, shp, dates):
    return {(pid, shp): {'td': len(dates) * 10, 'dates': dates, 'svc': set(), 'rid': 'r'}}


def run_case(new_pat, new_shp):
    old_v = {'10970-1-#': var(1, 's1', days(D(2026, 11, 11), D(2026, 11, 16))),
             '10970-1-0': var(2, 's2', days(D(2026, 11, 17), D(2026, 11, 17)))}
    new_v = {'10970-1-0': var(2, 's2', days(T0, D(2026, 12, 8)))}
    old = Feed(D(2026, 11, 11), {1: list('abcdefgh'), 2: new_pat}, STOPS)
    new = Feed(T0, {2: new_pat}, STOPS)
    ren = L.find_renamed(sorted(set(old_v) | set(new_v)), old_v, new_v, old, T0, new)
    assert ren == {'10970-1-0': ('10970-1-#', D(2026, 11, 17))}, ren
    stats = {}
    return L.rename_records(ren, old_v, new_v, old, new, {'s1': SHP}, {'s2': new_shp}, T0, stats), stats


def test_number_only_changed():
    """1. רק המספר השתנה (אותן תחנות, אותה דרך) — אין רשומה"""
    recs, st = run_case(list('abcdefgh'), SHP)
    assert recs == [] and st.get('renamed_same') == 1, (recs, st)


def test_stops_and_route_changed():
    """2. התחנות והדרך השתנו — שינוי מסלול מ-17.11"""
    recs, st = run_case(list('abcd') + ['x'] + list('gh'), SHP_X)
    assert len(recs) == 1 and recs[0]['eff'] == '2026-11-17' and set(recs[0]['removed']) == {'e', 'f'} and recs[0]['added'] == ['x'], recs


def test_friday_only_not_renamed():
    """3. חלופה שנוסעת רק בשישי ופשוט עוד לא היה שישי בשבוע שעבר — לא הוחלפה"""
    old_v = {'1-1-#': var(1, 's', days(D(2026, 11, 11), D(2026, 11, 12))),   # נגמרה ב-12.11 (חמישי)
             '1-1-5': var(2, 's', {D(2026, 11, 13)})}                          # שישי בלבד
    new_v = {'1-1-5': var(2, 's', {D(2026, 11, 20), D(2026, 11, 27)})}
    assert L.find_renamed(sorted(set(old_v) | set(new_v)), old_v, new_v, Feed(D(2026, 11, 11), {}, {}), T0) == {}


def test_other_route_not_renamed():
    """4. מסלול אחר לגמרי (אין תחנות משותפות) — לא הוחלפה"""
    far = {c: stop(c, 31.9, 34.7 + i * 0.01) for i, c in enumerate('pqrs')}
    o4 = Feed(D(2026, 11, 11), {1: list('abcdefgh')}, STOPS)
    n4 = Feed(T0, {2: list('pqrs')}, far)
    old_v = {'5-1-#': var(1, 's', days(D(2026, 11, 11), D(2026, 11, 16)))}
    new_v = {'5-1-0': var(2, 's', days(T0, D(2026, 12, 8)))}
    assert L.find_renamed(sorted(set(old_v) | set(new_v)), old_v, new_v, o4, T0, n4) == {}


if __name__ == '__main__':
    for k, f in list(globals().items()):
        if k.startswith('test_'):
            f()
    print('ok')
