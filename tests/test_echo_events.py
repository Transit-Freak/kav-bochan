# -*- coding: utf-8 -*-
"""הד של שינוי שכבר נכנס לקו (tools/mark_echo_events.py): קווי אשדוד — 19.07 בחלופות הראשיות,
13.09 שוב בחלופות שחזרו לרישום. הרצה: python3 -m pytest tests/ -q"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))

import mark_echo_events as M  # noqa: E402

ADD, REM = ['13324', '11059'], ['11367', '11368', '11369']


def ev(d, k='route', add=ADD, rem=REM):
    return {'d': d, 'k': k, 'add': ['a'] * len(add), 'ac': list(add), 'rem': ['r'] * len(rem), 'rc': list(rem)}


def test_same_change_in_another_variant_later_is_an_echo_but_same_day_rollout_is_not():
    files = {
        '10350-1-H': ('350', 'אלקטרה אפיקים', [ev('2026-07-19')]),
        '10350-2-#': ('350', 'אלקטרה אפיקים', [ev('2026-07-19')]),          # אותו יום — אותה פריסה של המשרד
        '10350-1-6': ('350', 'אלקטרה אפיקים', [ev('2026-09-13')]),          # חזרה לרישום עם המסלול המעודכן
        '10351-1-1': ('351', 'אלקטרה אפיקים', [ev('2026-09-13')]),          # קו אחר — אין בסיס בקו הזה
        '10350-1-7': ('350', 'אלקטרה אפיקים', [ev('2026-09-13', add=['1'], rem=['2'])]),   # שינוי אחר
    }
    added, removed, echoes = M.mark(files)
    assert added == 1 and removed == 0
    assert files['10350-1-6'][2][0]['echo'] == {'d': '2026-07-19', 'rd': '10350-1-H'}
    assert 'echo' not in files['10350-2-#'][2][0] and 'echo' not in files['10350-1-H'][2][0]
    assert 'echo' not in files['10351-1-1'][2][0] and 'echo' not in files['10350-1-7'][2][0]


def test_echo_is_recomputed_and_cleared_when_the_base_is_gone_or_too_old():
    stale = ev('2026-09-13')
    stale['echo'] = {'d': '2026-07-19', 'rd': '10350-1-H'}
    files = {'10350-1-6': ('350', 'אלקטרה אפיקים', [stale]),
             '10350-1-H': ('350', 'אלקטרה אפיקים', [ev('2025-12-01')])}       # יותר מ-180 יום — בסיס חדש, לא הד
    added, removed, echoes = M.mark(files)
    assert removed == 1 and 'echo' not in stale and echoes == []
    # שכבות רפרוף באותה חלופה (A→B, B→A, A→B) אינן הד — זה עניין של collapse_wobbles
    files = {'10350-1-H': ('350', 'x', [ev('2026-07-19'), ev('2026-08-01', add=REM, rem=ADD), ev('2026-08-10')])}
    added, removed, echoes = M.mark(files)
    assert echoes == []
