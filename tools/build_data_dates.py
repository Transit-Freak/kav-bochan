"""data-dates.json — מתי עודכנו הנתונים של כל כלי (שלמה 23.11.2026: בכרטיס בדף הבית היה כתוב "עודכן 22.11"
כשהנתונים כבר היו מ-23.11, כי התאריך שם היה של השינוי האחרון בקוד, מ-versions.json).

רץ ב-pages-deploy בכל פריסה, וכותב קובץ קטן אחד לשורש האתר: { "<מפתח הכלי>": "YYYY-MM-DD", ... } — תאריך
ישראלי. דף הבית (home/home.js) מציג בכל כרטיס "נתונים: 23.11.2026". המפתחות הם אלה של versions.json
(vk בכרטיסים). כלי שאין לו תאריך בנתונים — לא נכנס לקובץ, וכרטיס שלו נשאר בלי תאריך (ולא תאריך לא נכון).

שימוש: python3 tools/build_data_dates.py [שורש המאגר] > data-dates.json
"""
import json
import os
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

IL = ZoneInfo("Asia/Jerusalem")

# מפתח הכלי ← (קובץ הנתונים העיקרי שלו, השדה שבו תאריך היצירה). "max:<שדה>" — התאריך האחרון ברשימה.
SOURCES = {
    "line-history": ("line-history/data/lines.json", "gen"),
    "line-changes": ("line-changes/data/index.json", "gen"),
    "kavpach": ("data-lines.json", "updated"),
    "bus": ("bus/data/index.json", "updated"),
    "bus-speed": ("bus-speed/data/meta.json", "built"),
    "alerts": ("alerts/data/alerts.json", "gen"),
    "fleet": ("fleet/data/fleet.json", "updated"),
    "rail": ("rail/data/index.json", "updated"),
    "feeder": ("bus/data/feeder/index.json", "max:days"),
    "fares": ("fares/data/current.json", "gen"),
    "ratzif": ("ratzif/data/conflicts.json", "updated"),
    "next-station": ("next-station/data.json", "generated"),
    "skip-stops": ("skip-stops/data.json", "gen"),
}


def il_date(value):
    """'2026-11-23', '2026-11-23T03:53Z' או '2026-11-23T10:17:33+02:00' ← התאריך בישראל, או None."""
    if not isinstance(value, str):
        return None
    s = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:?\d{2})?$", s)
    if not m:
        return None
    if not m.group(3):
        return m.group(1)   # בלי אזור זמן — כמו שכתוב
    t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return t.astimezone(IL).date().isoformat()


def date_of(data, key):
    if key.startswith("max:"):
        vals = [il_date(v) for v in (data.get(key[4:]) or [])]
        vals = [v for v in vals if v]
        return max(vals) if vals else None
    return il_date(data.get(key))


def build(root):
    out = {}
    for vk, (path, key) in SOURCES.items():
        try:
            with open(os.path.join(root, path), encoding="utf-8") as f:
                d = date_of(json.load(f), key)
        except (OSError, ValueError, AttributeError):
            d = None
        if d:
            out[vk] = d
    return out


if __name__ == "__main__":
    print(json.dumps(build(sys.argv[1] if len(sys.argv) > 1 else "."), ensure_ascii=False, sort_keys=True))
