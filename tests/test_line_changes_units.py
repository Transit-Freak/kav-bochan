# -*- coding: utf-8 -*-
"""בדיקות יחידה לבונה של "מצגת לשינוי בקו" (tools/line_changes.py): קבוצות ימים, קיצור ימים, סיכום לו"ז ושינוי משמעותי.
(find_renamed — tools/test_line_changes_renamed.py; התאמה לכבישים — tools/test_road_match.py)"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import line_changes as L  # noqa: E402

WD = ['d0', 'd1', 'd2', 'd3', 'd4']


def test_days_short():
    assert L.days_short(['d0', 'd1', 'd2', 'd3']) == 'א׳–ד׳'
    assert L.days_short(['d4']) == 'ה׳'
    assert L.days_short(['d5']) == 'שישי'
    assert L.days_short(['d6']) == 'שבת'
    assert L.days_short(['d0', 'd2']) == 'א׳ ו-ג׳'
    assert L.days_short(['d0', 'd1', 'd3', 'd4']) == 'א׳–ב׳ ו-ד׳–ה׳'


def test_day_in():
    assert L.day_in(WD) == 'בימי חול'
    assert L.day_in(['d5']) == 'בשישי'
    assert L.day_in(['d1', 'd2']) == 'בימים ב׳–ג׳'


def test_day_groups_same_schedule_one_group():
    """ימים עם אותו לוח ישן ואותו לוח חדש — קבוצה אחת; יום עם לוח אחר — קבוצה משלו"""
    old = {w: [420, 480] for w in WD}
    new = {w: [420, 480] for w in WD}
    new['d4'] = [420, 480, 540]
    old['d5'] = new['d5'] = [600]
    g = {tuple(ws): (o, n) for ws, o, n in L.day_groups(old, new)}
    assert g[('d0', 'd1', 'd2', 'd3')] == ([420, 480], [420, 480])
    assert g[('d4',)] == ([420, 480], [420, 480, 540])
    assert g[('d5',)] == ([600], [600])
    assert len(g) == 3


def test_day_groups_new_line():
    """קו חדש (old=None) — רק ימים עם נסיעות בלוח החדש"""
    g = L.day_groups(None, {'d0': [420], 'd1': [420], 'd6': [1200]})
    assert sorted((tuple(ws), o, n) for ws, o, n in g) == [(('d0', 'd1'), None, [420]), (('d6',), None, [1200])]


def test_same_time_twice_is_two_departures():
    """×2: שתי נסיעות באותה שעה נספרות כשתיים בסיכום (הדף מציג "07:00×2")"""
    s = L.tt_sum([420, 420, 480, 540, 600])
    assert s['n'] == 5 and s['f'] == 420 and s['l'] == 600


def test_tt_entries_skips_empty_and_keeps_old():
    e = L.tt_entries([(['d0'], [420], [420, 480]), (['d6'], [], [])])
    assert len(e) == 1 and e[0]['t'] == ['d0'] and e[0]['o'] == [420] and e[0]['n'] == [420, 480]
    assert e[0]['sn']['n'] == 2 and e[0]['so']['n'] == 1


def test_tt_sig():
    a = L.tt_sum(list(range(360, 1320, 30)))
    assert not L.tt_sig(a, L.tt_sum(list(range(360, 1320, 30))))
    assert L.tt_sig(a, L.tt_sum(list(range(360, 1320, 60))))   # חצי מהנסיעות


def _walk_dir(n_new=10):
    """תחנה שמבוטלת ב-(32.08, 34.83), ותחנות חדשות כל ~100 מ' מזרחה"""
    old = [['r', 'מבוטלת', 32.08, 34.83]]
    new = [['n%d' % i, 'חדשה %d' % i, 32.08, 34.83 + (i + 1) * 0.00106] for i in range(n_new)]
    return {'old': {'stops': old}, 'new': {'stops': new}, 'removed': ['r']}


def test_walk_candidates_and_air_limit(tmp_path, monkeypatch):
    """עד WALK_CANDS מועמדות, רק עד WALK_AIR_MAX מ' בקו אווירי; הקרובה ברגל נבחרת"""
    asked = []

    def fake(src, dests):
        asked.extend(d[0] for d in dests)
        return [1500 if d[0] == 'n0' else 200 * (i + 1) for i, d in enumerate(dests)]
    monkeypatch.setattr(L, 'walk_table', fake)
    monkeypatch.setattr(L.time if hasattr(L, 'time') else __import__('time'), 'sleep', lambda s: None)
    f = _walk_dir()
    L.add_walks([f], str(tmp_path))
    assert L.WALK_CANDS == 8 and L.WALK_AIR_MAX == 1300
    assert len(asked) == 8 and 'n8' not in asked   # n8 — כ-900 מ', אבל רק 8 הקרובות
    assert f['walk']['r'] == {'to': 'n1', 'm': 400}   # n0 קרובה באוויר, אבל רחוקה ברגל


def test_walk_partial_cache_keeps_known(tmp_path, monkeypatch):
    """בלי זמן לבקשות חדשות: מה שכבר ידוע מהלילות הקודמים נשאר, ו"אין תחנה קרובה" רק כשהכול נבדק"""
    import json as _j
    f = _walk_dir()
    s = f['old']['stops'][0]
    cache = {L.walk_key(s, n): 300 for n in f['new']['stops'][:4]}
    (tmp_path / 'walk.json').write_text(_j.dumps(cache))
    monkeypatch.setattr(L, 'WALK_BUDGET', -1)
    monkeypatch.setattr(L, 'walk_table', lambda a, b: (_ for _ in ()).throw(AssertionError('no calls')))
    L.add_walks([f], str(tmp_path))
    assert f['walk']['r']['m'] == 300
