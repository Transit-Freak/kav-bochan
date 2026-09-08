#!/usr/bin/env python3
"""קטגוריית "שינוי סוג הקו" באינדקס — כלל אחד לכל בוני האינדקס.

lt בקובץ הקו: [[תאריך, סוג (עירוני/אזורי/בינעירוני), ייחודיות, אשכול], …]
(tools/linehistory_ltype.py). שינוי = סוג או ייחודיות שהשתנו בין שתי רשומות
עוקבות (רק כששני הערכים מלאים — חסר אינו שינוי). ייחודיות לא-סדירה (תלמידים /
לילה / מזין) נשמרת באינדקס לסינון (un).

הכלל הזה ישב רק ב-linehistory.py, ושני כלים אחרים שבונים את lines.json
(rebuild_lines_index.py בצעד ה-commit של הריצות, backfill_routes_exact.py)
דרסו את הקטגוריה בכל ריצה — המונה באתר חזר ל-0 (שלמה 07–08.09).
"""


def ltype_changed(lf):
    lt = lf.get('lt') or []
    return any((lt[i][1] and lt[i - 1][1] and lt[i][1] != lt[i - 1][1])
               or (lt[i][2] and lt[i - 1][2] and lt[i][2] != lt[i - 1][2])
               for i in range(1, len(lt)))


def apply_ltype(e, ks, lf):
    """מוסיף 'ltype' ל-ks ומעדכן e['un'] לפי קובץ הקו lf."""
    if ltype_changed(lf):
        ks.add('ltype')
    if lf.get('un') and lf['un'] != 'סדיר':
        e['un'] = lf['un']
    else:
        e.pop('un', None)
    return ks
