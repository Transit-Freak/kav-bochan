"""שומר הסף של קובץ ה-GTFS היומי (שלמה 23.11.2026).

gtfs-gate.yml מריץ את זה כל 10 דקות. ההחלטה אם להפעיל עכשיו את העדכון (line-history, ואחריו כל מה
שמחכה לו) תלויה רק בארבעה דברים, ולכן היא פונקציה נפרדת שנבדקת ב-tests/test_gtfs_gate.py:
  - השעה בישראל: לא לפני 00:30 (משרד התחבורה מעלה את הקובץ בדרך כלל בלילה; לפעמים רק בערב).
  - האם כבר הפעלנו עדכון היום (פעם אחת ביום).
  - מתי משרד התחבורה עדכן את הקובץ (Last-Modified, מבקשת HEAD — בלי להוריד 140MB).
  - האם הקובץ הזה כבר טופל (אותו Last-Modified).

שימוש בצינור: python3 tools/gtfs_gate.py, עם המשתנים NOW_IL, LAST_MODIFIED, DAY_DONE, FILE_DONE.
מדפיס סיבה בעברית, וכותב go=yes/no ו-lm_key=<מפתח הקובץ> ל-$GITHUB_OUTPUT.
"""
import os
import sys
from datetime import datetime
from email.utils import parsedate_to_datetime

START = (0, 30)   # 00:30 שעון ישראל — מכאן בודקים כל 10 דקות עד שנמצא קובץ חדש


def lm_key(last_modified):
    """מפתח יציב לקובץ לפי Last-Modified, מעוגל לדקה (כמו בדף הקבצים, כדי שהשאלה הישירה והגיבוי ייתנו
    אותו מפתח לאותו קובץ), או '' אם אין כותרת תקינה."""
    if not last_modified:
        return ""
    try:
        return str(int(parsedate_to_datetime(last_modified.strip()).timestamp()) // 60 * 60)
    except (TypeError, ValueError):
        return ""


def lm_from_listing(html, name="israel-public-transportation.zip"):
    """גיבוי, כשהשרת לא עונה על בקשת HEAD: התאריך שליד הקובץ בדף הקבצים של משרד התחבורה
    (https://gtfs.mot.gov.il/gtfsfiles/), למשל "11/22/2026  7:31 PM". זה שעון ישראל, עד הדקה —
    מוחזר כ-Last-Modified (GMT) כדי שאותו מפתח ישמש בשני המקרים."""
    import re
    from zoneinfo import ZoneInfo
    from datetime import timezone
    from email.utils import format_datetime
    for row in re.split(r"<br>", html or "", flags=re.I):
        if f">{name}<" not in row:
            continue
        m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)", row, re.I)
        if not m:
            return ""
        mo, d, y, h, mi, ap = m.groups()
        h = int(h) % 12 + (12 if ap.upper() == "PM" else 0)
        t = datetime(int(y), int(mo), int(d), h, int(mi), tzinfo=ZoneInfo("Asia/Jerusalem"))
        return format_datetime(t.astimezone(timezone.utc), usegmt=True)
    return ""


def decide(now_il, last_modified, day_done, file_done):
    """מחזיר (go, סיבה). now_il — datetime בשעון ישראל."""
    if (now_il.hour, now_il.minute) < START:
        return False, f"השעה {now_il:%H:%M} — הבדיקה מתחילה ב-00:30"
    if day_done:
        return False, "העדכון של היום כבר הופעל — הבדיקה הבאה מחר ב-00:30"
    if not lm_key(last_modified):
        return False, "לא הצלחנו לקרוא מתי הקובץ עודכן — ננסה שוב בעוד 10 דקות"
    if file_done:
        return False, f"אין קובץ חדש (האחרון: {last_modified.strip()}) — ננסה שוב בעוד 10 דקות"
    return True, f"קובץ חדש ממשרד התחבורה ({last_modified.strip()}) — מפעילים את העדכון"


def main():
    now = datetime.fromisoformat(os.environ["NOW_IL"])
    lm = os.environ.get("LAST_MODIFIED", "")
    go, why = decide(now, lm, os.environ.get("DAY_DONE") == "true", os.environ.get("FILE_DONE") == "true")
    print(why)
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"go={'yes' if go else 'no'}\nlm_key={lm_key(lm)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
