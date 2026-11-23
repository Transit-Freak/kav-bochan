"""בדיקות ל-tools/build_data_dates.py (תאריך הנתונים בכרטיסים של דף הבית)."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
from build_data_dates import il_date, date_of, build  # noqa: E402


def test_formats():
    assert il_date("2026-11-23") == "2026-11-23"
    assert il_date("2026-11-23T03:53Z") == "2026-11-23"
    assert il_date("2026-11-23T10:17:33+02:00") == "2026-11-23"
    assert il_date("2026-11-22T23:30Z") == "2026-11-23"      # 01:30 בישראל — כבר היום הבא
    assert il_date("2026-11-23T00:12+00:00") == "2026-11-23"
    assert il_date("") is None and il_date(None) is None and il_date("לא תאריך") is None


def test_max_of_list():
    assert date_of({"days": ["2026-11-02", "2026-11-22", "2026-11-04"]}, "max:days") == "2026-11-22"
    assert date_of({"days": []}, "max:days") is None


def test_build_skips_missing_and_broken(tmp_path):
    (tmp_path / "line-history" / "data").mkdir(parents=True)
    (tmp_path / "line-history" / "data" / "lines.json").write_text(json.dumps({"gen": "2026-11-23", "lines": []}))
    (tmp_path / "fleet" / "data").mkdir(parents=True)
    (tmp_path / "fleet" / "data" / "fleet.json").write_text("{not json")
    assert build(str(tmp_path)) == {"line-history": "2026-11-23"}
