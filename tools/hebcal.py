# -*- coding: utf-8 -*-
"""לוח עברי בלי רשת: המרה מתאריך עברי לתאריך לועזי, והחגים בישראל (לוח הזמנים של האוטובוסים משתנה בהם).
החישוב לפי האלגוריתם המקובל (Reingold & Dershowitz, Calendrical Calculations): מולד תשרי ודחיות ראש השנה.
המספר הקבוע (fixed) של תאריך הוא ה-ordinal של Python (1.1.1 = 1), כמו אצל Reingold.

holidays(d0, d1) → [(date, סוג, שם)] — סוג: 'erev' ערב חג · 'yt' יום טוב · 'chm' חול המועד · 'motz' יום טוב שאחריו מוצאי חג
· 'purim' · 'atz' יום העצמאות · 'erev-atz' ערב יום העצמאות.
בדיקה: python3 tools/hebcal.py (ראש השנה תשפ"ז = 12.9.2026, פסח תשפ"ו = 2.4.2026)."""
import datetime

EPOCH = -1373427   # fixed של 1 בתשרי שנה 1 (7.10.3761 לפני הספירה, יוליאני)
NISAN, IYAR, SIVAN, TAMMUZ, AV, ELUL, TISHREI, HESHVAN, KISLEV, TEVET, SHEVAT, ADAR, ADAR2 = range(1, 14)


def leap(y):
    return (7 * y + 1) % 19 < 7


def last_month(y):
    return ADAR2 if leap(y) else ADAR


def _elapsed(y):
    months = (235 * y - 234) // 19
    parts = 12084 + 13753 * months
    day = months * 29 + parts // 25920
    return day + 1 if (3 * (day + 1)) % 7 < 3 else day


def _delay(y):
    ny0, ny1, ny2 = _elapsed(y - 1), _elapsed(y), _elapsed(y + 1)
    if ny2 - ny1 == 356:
        return 2
    if ny1 - ny0 == 382:
        return 1
    return 0


def new_year(y):
    return EPOCH + _elapsed(y) + _delay(y)


def year_len(y):
    return new_year(y + 1) - new_year(y)


def month_len(y, m):
    if m in (IYAR, TAMMUZ, ELUL, TEVET, ADAR2):
        return 29
    if m == ADAR:
        return 30 if leap(y) else 29
    if m == HESHVAN:
        return 30 if year_len(y) % 10 == 5 else 29
    if m == KISLEV:
        return 29 if year_len(y) % 10 == 3 else 30
    return 30


def to_date(y, m, d):
    """תאריך עברי → datetime.date"""
    n = new_year(y) + d - 1
    if m < TISHREI:
        for mm in range(TISHREI, last_month(y) + 1):
            n += month_len(y, mm)
        for mm in range(NISAN, m):
            n += month_len(y, mm)
    else:
        for mm in range(TISHREI, m):
            n += month_len(y, mm)
    return datetime.date.fromordinal(n)


def _year_holidays(y):
    """החגים של שנה עברית y (מתשרי עד אלול)"""
    D = lambda m, d: to_date(y, m, d)  # noqa: E731
    out = [
        (to_date(y - 1, ELUL, 29), 'erev', 'ערב ראש השנה'),
        (D(TISHREI, 1), 'yt', 'ראש השנה'),
        (D(TISHREI, 2), 'motz', 'ראש השנה'),
        (D(TISHREI, 9), 'erev', 'ערב יום כיפור'),
        (D(TISHREI, 10), 'motz', 'יום כיפור'),
        (D(TISHREI, 14), 'erev', 'ערב חג הסוכות'),
        (D(TISHREI, 15), 'motz', 'חג הסוכות'),
    ]
    out += [(D(TISHREI, d), 'chm', 'חול המועד סוכות') for d in range(16, 21)]
    out += [(D(TISHREI, 21), 'erev', 'ערב שמחת תורה'), (D(TISHREI, 22), 'motz', 'שמחת תורה')]
    adar = ADAR2 if leap(y) else ADAR
    out += [(D(adar, 14), 'purim', 'פורים'), (D(adar, 15), 'purim', 'שושן פורים')]
    out += [(D(NISAN, 14), 'erev', 'ערב פסח'), (D(NISAN, 15), 'motz', 'פסח')]
    out += [(D(NISAN, d), 'chm', 'חול המועד פסח') for d in range(16, 20)]
    out += [(D(NISAN, 20), 'erev', 'ערב שביעי של פסח'), (D(NISAN, 21), 'motz', 'שביעי של פסח')]
    # יום העצמאות: ה' באייר, ומוקדם או נדחה כשהוא נופל ליד שבת (weekday של Python: שני = 0)
    atz = D(IYAR, 5)
    wd = atz.weekday()
    if wd == 4:      # שישי → חמישי
        atz -= datetime.timedelta(days=1)
    elif wd == 5:    # שבת → חמישי
        atz -= datetime.timedelta(days=2)
    elif wd == 0:    # שני → שלישי (שלא יחול יום הזיכרון במוצאי שבת)
        atz += datetime.timedelta(days=1)
    out += [(atz - datetime.timedelta(days=1), 'erev-atz', 'ערב יום העצמאות'), (atz, 'atz', 'יום העצמאות')]
    out += [(D(SIVAN, 5), 'erev', 'ערב שבועות'), (D(SIVAN, 6), 'motz', 'שבועות')]
    return out


def heb_year(day):
    """השנה העברית שבה נמצא התאריך"""
    y = day.year + 3760
    while new_year(y + 1) <= day.toordinal():
        y += 1
    while new_year(y) > day.toordinal():
        y -= 1
    return y


def holidays(d0, d1):
    """החגים בין d0 ל-d1 (כולל), לפי הסדר"""
    out = []
    for y in range(heb_year(d0), heb_year(d1) + 2):
        out += [h for h in _year_holidays(y) if d0 <= h[0] <= d1]
    seen = set()
    res = []
    for h in sorted(out):
        if h[0] not in seen:
            seen.add(h[0])
            res.append(h)
    return res


def label(kind, name):
    """שם העמודה בלוח הזמנים: "ערב חג הסוכות" · "חג הסוכות ומוצאי החג" · "חול המועד סוכות" · "פורים" """
    if kind == 'motz':
        return name + ' ומוצאי החג' if not name.startswith('יום כיפור') else 'יום כיפור ומוצאי הצום'
    return name


if __name__ == '__main__':
    assert to_date(5787, TISHREI, 1) == datetime.date(2026, 9, 12), to_date(5787, TISHREI, 1)
    assert to_date(5786, NISAN, 15) == datetime.date(2026, 4, 2), to_date(5786, NISAN, 15)
    assert to_date(5785, TISHREI, 1) == datetime.date(2024, 10, 3)
    assert to_date(5784, ADAR2, 14) == datetime.date(2024, 3, 24)   # פורים בשנה מעוברת
    for h in holidays(datetime.date(2026, 9, 1), datetime.date(2027, 6, 30)):
        print(h[0], h[1], label(h[1], h[2]))
