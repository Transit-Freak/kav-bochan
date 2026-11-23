"""שומר הסף של קובץ ה-GTFS היומי (שלמה 23.11.2026: "בדיקה אחת ב-09 לכל האתרים").

gtfs-gate.yml מריץ את זה כל שעה. ההחלטה אם להפעיל עכשיו את העדכון (line-history, ואחריו כל מה
שמחכה לו) תלויה רק בארבעה דברים, ולכן היא פונקציה נפרדת שנבדקת ב-tests/test_gtfs_gate.py:
  - השעה בישראל: לא לפני 09:00.
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

START_HOUR = 9   # 09:00 שעון ישראל


def lm_key(last_modified):
    """מפתח יציב לקובץ לפי Last-Modified (שניות מאז 1970), או '' אם אין כותרת תקינה."""
    if not last_modified:
        return ""
    try:
        return str(int(parsedate_to_datetime(last_modified.strip()).timestamp()))
    except (TypeError, ValueError):
        return ""


def decide(now_il, last_modified, day_done, file_done):
    """מחזיר (go, סיבה). now_il — datetime בשעון ישראל."""
    if now_il.hour < START_HOUR:
        return False, f"השעה {now_il:%H:%M} — הבדיקה מתחילה ב-09:00"
    if day_done:
        return False, "העדכון של היום כבר הופעל — הבדיקה הבאה מחר ב-09:00"
    if not lm_key(last_modified):
        return False, "לא הצלחנו לקרוא מתי הקובץ עודכן — ננסה שוב בעוד שעה"
    if file_done:
        return False, f"אין קובץ חדש (האחרון: {last_modified.strip()}) — ננסה שוב בעוד שעה"
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
