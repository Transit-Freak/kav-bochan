"""בדיקות לשומר הסף של קובץ ה-GTFS (tools/gtfs_gate.py)."""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
from gtfs_gate import decide, lm_key  # noqa: E402

LM = "Sun, 22 Nov 2026 17:31:19 GMT"   # הקובץ שעלה אתמול ב-19:31 שעון ישראל


def at(h, m=0):
    return datetime(2026, 11, 23, h, m)


def test_before_nine_waits():
    assert decide(at(8, 59), LM, False, False)[0] is False


def test_nine_with_new_file_runs():
    assert decide(at(9, 0), LM, False, False)[0] is True


def test_same_file_waits():
    go, why = decide(at(12), LM, False, True)
    assert go is False and "אין קובץ חדש" in why


def test_once_a_day():
    assert decide(at(20), LM, True, False)[0] is False


def test_late_file_is_caught_in_the_evening():
    # כמו 22.11: אין קובץ חדש בבוקר, והקובץ עולה ב-19:31 — הבדיקה של 20:00 מפעילה
    assert decide(at(10), LM, False, True)[0] is False
    assert decide(at(20), "Mon, 23 Nov 2026 17:31:19 GMT", False, False)[0] is True


def test_missing_or_broken_header_waits():
    assert decide(at(10), "", False, False)[0] is False
    assert decide(at(10), "not a date", False, False)[0] is False


def test_lm_key_is_stable():
    assert lm_key(LM) == lm_key("  " + LM + "\r\n") == "1795368679"
    assert lm_key("") == ""
