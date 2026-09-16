#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""צילום מהמסמך לכל עובדה: העמוד ב-PDF שבו כתוב הדבר, עם הדגשה צהובה על המספר/המילה, חתוך לאזור הרלוונטי.

שלמה (16.09): "צילום מסך איפה שזה רשום, עם הדגשה על זה". רץ בגיטהאב, שם ה-PDF במטמון של package_pipeline.
קלט: tenders/fields-rules.json (לכל שדה: מקור עם #page וערך) + tenders/text/index.json (כתובת → sha).
פלט: tenders/snips/<sha16>-p<עמוד>-<שדה>.webp ו-tenders/snips.json {tid: {field: {image, page, needle}}}.
"""
import datetime
import io
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from package_pipeline import CACHE, ensure_cached  # noqa: E402

SNIPS = ROOT / 'snips'
OUT = ROOT / 'snips.json'
VERSION = 18


def read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def num_core(word):
    """המספר שבתוך מילה מהעמוד: "(20%)" → "20", "מ-12" → "12", "2,000" → "2000", "2003" → "2003"."""
    return re.sub(r'^\D+|\D+$', '', word).replace(',', '')


def find_rects(pg, needle, words=None):
    """איפה כתוב needle בעמוד. מחרוזת שמתחילה במספר ("20", "20%", "9 חודשים") נחשבת רק כשהמספר הוא מילה שלמה —
    כשחיפשו "20" סומנו גם "2003" ו-"2017" באותו עמוד (שלמה 16.09, חיפה עמוד 80)."""
    rects = pg.search_for(needle)
    m = re.match(r'^([\d,./-]+)', needle)
    if not m or not rects:
        return rects
    want = m.group(1).rstrip('.,/-').replace(',', '')     # תאריך "25/11/2020" נשאר שלם — לא "25"
    if words is None:
        words = pg.get_text('words')
    if ' ' in needle:
        rects = merge_by_row(rects)     # "30 ביולי 2014" — search_for מחזיר מלבן לכל מילה; מאחדים כדי שלא יישאר רק "30"
    boxes = [w[:4] for w in words if num_core(w[4]) == want]
    return [r for r in rects if any(r.x0 < b[2] and r.x1 > b[0] and r.y0 < b[3] and r.y1 > b[1] for b in boxes)]


def _letters(s):
    return re.sub(r'[^א-תa-zA-Z%₪"]', '', s)


def phrase_rects(words, num, unit):
    """מלבנים ל"מספר יחידה" ("12 חודשים") לפי המקום בעמוד: מילה שהיא בדיוק המספר, ומילה צמודה אליה באותה שורה
    שהיא היחידה (או אותה מילה כשהיחידה דבוקה: "(20%)"). לא תלוי בסדר שבו ה-PDF שומר טקסט עברי — בחיפה עמוד 8
    search_for מצא רק את ה"12 חודשים" הראשון (אורך החוזה) ולא את זה של מועד ההתחלה שבתחילת שורה."""
    import fitz
    want = num.rstrip('.,').replace(',', '')
    out = []
    for w in words:
        if num_core(w[4]) != want:
            continue
        own = _letters(w[4])
        if own and (own.endswith(unit) or own.startswith(unit)):
            out.append(fitz.Rect(w[:4]))
            continue
        h = max(w[3] - w[1], 4)
        for u in words:
            if _letters(u[4]) != unit or abs((u[1] + u[3]) / 2 - (w[1] + w[3]) / 2) > h * 0.6:
                continue
            if min(abs(u[0] - w[2]), abs(w[0] - u[2])) <= h * 0.8:      # רווח אחד, לא מילה קצרה ביניהן
                out.append(fitz.Rect(min(w[0], u[0]), min(w[1], u[1]), max(w[2], u[2]), max(w[3], u[3])))
                break
    return out


SEC_NUM = re.compile(r'^\d+(?:\.\d+)+\.?$')


def section_span(pg, words, sec_n):
    """טווח ה-y של הסעיף בעמוד: ממספר הסעיף (המילה "38.2.9" בשולי העמוד, הכי ימנית) עד מספר הסעיף הבא באותו
    טור. סימון מוגבל לסעיף — כדי שמספר זהה בסעיף שכן באותו עמוד לא יסומן. None כשהכותרת לא בעמוד הזה."""
    if not sec_n or '.' not in str(sec_n):
        return None
    heads = [w for w in words if w[4].rstrip('.') == str(sec_n)]
    if not heads:
        return None
    head = max(heads, key=lambda w: w[2])
    nxt = [w for w in words if SEC_NUM.match(w[4]) and w[2] >= head[2] - 8 and w[1] > head[3]]
    y1 = min(w[1] for w in nxt) - 2 if nxt else pg.rect.height
    return (head[1] - 2, y1)


UNIT = r'(?:חודשים|חודש|ימים|יום|שנים|שנה|שבועות|אחוז|%|₪|ש"ח|נקודות|מושבים|אוטובוסים|אלף|מיליון)'


def phrases_for(f):
    """ערך טקסטואלי עם כמה מספרים ("עד 9 חודשים … שלב ב' עד 15 חודשים") — מסמנים את כולם, כל אחד עם היחידה
    שלו ("9 חודשים", "15 חודשים"), לא רק את הראשון שנמצא (שלמה 16.09: "סימן רק את ה-15 ולא את ה-6")."""
    v = f.get('value')
    if not isinstance(v, str):
        return []
    out = []
    for m in re.finditer(r'(\d[\d,.]*)\s*(' + UNIT + ')', v):
        num = m.group(1).rstrip('.,')
        out.append(f'{num} {m.group(2)}')
        out.append(num)
    return list(dict.fromkeys(out))


HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']


def date_needles(v):
    """"2020-11-25" → כל הצורות שבהן המסמך יכול לכתוב את התאריך: 25/11/2020, 25.11.2020, 25 בנובמבר 2020 …
    לא חלקים ממנו ("11", "25") — כך סומן "11" של סעיף 11 במקום התאריך (ביקורת 16.09)."""
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', str(v))
    if not m:
        return []
    y, mo, d = m.groups()
    mon = HEB_MONTHS[int(mo) - 1]
    out = []
    for dd, mm in ((d, mo), (str(int(d)), str(int(mo)))):
        out += [f'{dd}/{mm}/{y}', f'{dd}.{mm}.{y}', f'{dd}-{mm}-{y}', f'{dd}/{mm}/{y[2:]}', f'{dd}.{mm}.{y[2:]}']
    out += [f'{int(d)} ב{mon} {y}', f'{int(d)}ב{mon} {y}', f'{int(d)} {mon} {y}']
    return list(dict.fromkeys(out))


def needles_for(key, f):
    """מה לחפש בעמוד: המספר עצמו (יציב גם בעברית הפוכה), תאריך בכל צורותיו, או משפט מהערך הטקסטואלי.
    לא מילים מכותרת הסעיף ולא מילים בודדות: כשהמספר לא נמצא סומנו 12 פעמים "המציע" או "הגדרות" בכל העמוד
    (ביקורת 16.09). כשאין התאמה — main מסמן את משפט המפתח של הסעיף."""
    out = []
    if key == 'penalties.amount':
        # עמוד טבלת הקנסות: מסמנים את הכותרת של הפיצויים, לא מספר עמוד/סעיף מהערך ולא מילים מכותרת סעיף אחר
        # (בחיפה סומן "מוקד טלפוני" שבמקרה היה באותו עמוד)
        return ['סכום הפיצוי', 'פיצויים מוסכמים', 'טבלת פיצויים', 'פיצוי מוסכם', 'קנסות', 'פיצוי', 'קנס']
    v = f.get('value')
    if isinstance(v, (int, float)) and v:
        n = int(v)
        if f.get('kind') == 'percent':
            out.append(f'{n}%')
        out += [f'{n:,}', str(n)]
        if n >= 1000000 and n % 1000000 == 0:
            out.append(f'{n // 1000000} מיליון')   # "300 מיליון ₪"
        if n >= 1000 and n % 1000 == 0:
            out.append(f'{n // 1000:,}')       # "2,000" בתוך "2,000,000"
    elif isinstance(v, str) and date_needles(v):
        out += date_needles(v)
    elif isinstance(v, str):
        # ערך טקסטואלי ("רישיון תקף להסעת נוסעים בקווי שירות"): מחפשים את המשפט עצמו — רצפים של 3 מילים, אחר כך 2
        words = [w for w in re.findall(r'[א-ת"\']{2,}', v) if w not in STOP]
        for size in (3, 2):
            out += [' '.join(words[i:i + size]) for i in range(len(words) - size + 1)]
        out += [x.group(0) for x in re.finditer(r'\d[\d,.]*', v) if len(x.group(0)) >= 3][:3]
    for c in f.get('conditions') or []:
        cv = c.get('value')
        if isinstance(cv, (int, float)) and cv:
            out += [f'{int(cv):,}', str(int(cv))]
    seen, res = set(), []
    for n in out:
        n = str(n).strip()
        if len(n) >= 2 and n not in seen:
            seen.add(n); res.append(n)
    return res


STOP = set('''של את על עם בין דרך הקו קו קווים לקו לקווים גם כל אל או כמו יהיה תהיה היום כיום לפי בלבד אשר כאשר וכן ולא לא אין
יש בכל בתוך עד מן ממנו זה זו זאת הזה אחד אחת שני שתי כדי לצורך בגין ידי חדש חדשים הקווים שינוי במסלול מסלול ביטול'''.split())


def quote_words(quote, strict=True):
    """המילים שמחפשים בעמוד: מילים בעברית של 3 אותיות ומעלה ומספרים — בלי מילות קישור, בלי כפילויות.
    ציטוט קצר שכולו מילים כלליות ("קו 3 – שינוי במסלול") — מחפשים גם אותן (strict=False)."""
    words = re.findall(r'[א-תa-zA-Z]{3,}|\d{2,}', quote)
    return [w for w in dict.fromkeys(words) if not strict or w not in STOP][:40]


def rows_between(pg, y0, y1, tol=3):
    """מלבן לכל שורת טקסט בעמוד בין y0 ל-y1 — כולל שורות אמצע שלא נמצאה בהן מילה — כדי שהסימון יהיה
    פס רציף על כל הציטוט ולא כתמים על מילים בודדות (שלמה 16.09: "דייק את הסימון")."""
    rows = {}
    for w in pg.get_text('words'):
        yc = (w[1] + w[3]) / 2
        if y0 - tol <= yc <= y1 + tol:
            rows.setdefault(round(yc / 4), []).append(w)
    return [(min(w[0] for w in ws), min(w[1] for w in ws), max(w[2] for w in ws), max(w[3] for w in ws)) for ws in rows.values()]


def find_quote(pg, quote):
    """המקום בעמוד שבו כתוב הציטוט: מחפשים את מילות הציטוט, מקבצים לפי שורות, ובוחרים את רצף השורות
    (לפי אורך הציטוט) שבו נמצאו הכי הרבה מילים שונות. מחזיר (y עליון, y תחתון) של שורות הציטוט, או None."""
    hits = []
    words = pg.get_text('words')
    for strict in (True, False):
        for w in quote_words(quote, strict):
            for r in find_rects(pg, w, words)[:20]:
                hits.append((w, r))
        if hits:
            break
    if not hits:
        return None
    # קיבוץ לשורות לפי מרחק אנכי (לא לפי עיגול קבוע — מילים באותה שורה נפלו לדליים שונים: השרון עמוד 69)
    lines = {}
    for w, r in sorted(hits, key=lambda x: (x[1].y0 + x[1].y1) / 2):
        yc = (r.y0 + r.y1) / 2
        key = next((k for k in lines if abs(k - yc) <= 5), None)
        if key is None:
            key = yc
            lines[key] = {'words': set(), 'rects': []}
        lines[key]['words'].add(w)
        lines[key]['rects'].append(r)
    ys = sorted(lines)
    nlines = max(1, min(8, len(quote) // 55 + 1))
    # מק"ט (5–6 ספרות) שמופיע פעם אחת בעמוד מזהה את השורה לבדו — גם כשהמילים האחרות בציטוט לא נמצאו
    unique_ids = {w for w, _ in hits if re.fullmatch(r'\d{5,6}', w) and sum(1 for w2, _ in hits if w2 == w) == 1}
    best = None
    for i, y in enumerate(ys):
        win = [y2 for y2 in ys[i:] if y2 - y <= nlines * 14]
        words = set().union(*(lines[y2]['words'] for y2 in win))
        score = len(words) + (3 if words & unique_ids else 0)
        if best is None or score > best[0]:
            best = (score, win)
    distinct = len({w for w, _ in hits})
    if best is None or best[0] < min(3, distinct):
        return None
    rects = [r for y in best[1] for r in lines[y]['rects']]
    return (min(r.y0 for r in rects), max(r.y1 for r in rects))


HEB_NUM = {1: ['אחת', 'אחד'], 2: ['שתי', 'שני', 'שתיים', 'שניים'], 3: ['שלוש', 'שלושה'], 4: ['ארבע', 'ארבעה'], 5: ['חמש', 'חמישה'],
           6: ['שש', 'שישה'], 7: ['שבע', 'שבעה'], 8: ['שמונה'], 9: ['תשע', 'תשעה'], 10: ['עשר', 'עשרה']}


def number_groups(pg, words, f):
    """ערך מספרי שהמסמך כותב אחרת ממה שחיפשנו: "300מיליון ₪" (דבוק), "60 מליון" (כתיב חסר), "חמש שנים" (במילים)."""
    vals = []
    v = f.get('value')
    if isinstance(v, (int, float)) and v:
        vals.append(int(v))
    for c in f.get('conditions') or []:
        if isinstance(c.get('value'), (int, float)) and c['value']:
            vals.append(int(c['value']))
    out = []
    for n in vals:
        if n >= 1000000 and n % 1000000 == 0:
            for unit in ('מיליון', 'מליון'):
                r = phrase_rects(words, str(n // 1000000), unit)
                if r:
                    out.append((f'{n // 1000000} {unit}', r[:6])); break
        elif n >= 1000 and n % 1000 == 0 and n < 1000000:
            r = phrase_rects(words, str(n // 1000), 'אלף')
            if r:
                out.append((f'{n // 1000} אלף', r[:6]))
        elif 12 < n <= 240 and (f.get('unit') == 'months' or any(c.get('unit') == 'months' for c in f.get('conditions') or []) or 'חודש' in str(f.get('notes') or '')):
            # 129 חודשים שהמסמך כותב "10 שנים ו-9 חודשים"
            y, m = divmod(n, 12)
            ry = phrase_rects(words, str(y), 'שנים')
            rm = phrase_rects(words, str(m), 'חודשים') if m else []
            if not ry and not rm and y >= 1:
                # 132 חודשים שהמסמך כותב "10 שנים ו-12 חודשים"
                ry = phrase_rects(words, str(y - 1), 'שנים')
                rm = phrase_rects(words, str(m + 12), 'חודשים') if ry else []
                if ry and rm:
                    y, m = y - 1, m + 12
                else:
                    ry, rm = [], []
            if ry:
                out.append((f'{y} שנים', ry[:4]))
            if rm:
                out.append((f'{m} חודשים', rm[:4]))
        elif n in HEB_NUM:
            for w in HEB_NUM[n]:
                r = []
                for unit in ('שנים', 'השנים', 'שנות', 'חודשים', 'אוטובוסים', 'מוניות', 'ימים', 'עמודים'):
                    r += find_rects(pg, f'{w} {unit}', words) + find_rects(pg, f'ב{w} {unit}', words)
                if r:
                    out.append((f'{w} …', merge_by_row(r)[:6])); break       # "בחמש השנים" — מלבן אחד לביטוי
    return out


def find_value(pg, words, key, f):
    """הערך עצמו בעמוד: קודם "מספר יחידה" לכל מספר בערך, אחר כך המספר/התאריך/משפט מהערך.
    מחזיר קבוצות [(מה נמצא, מלבנים)] — קבוצה לכל ביטוי, כדי שסינון לפי סעיף או משפט לא יעלים ביטוי שלם."""
    phrases = phrases_for(f)
    if phrases:
        groups, used = [], []
        for n in phrases:
            if ' ' not in n and len(n) < 2:
                continue
            if any(n == u.split(' ')[0] for u in used):
                continue                      # המספר לבדו — רק אם הביטוי עם היחידה לא נמצא
            pm = re.match(r'^([\d,.]+) (\S+)$', n)
            rects = phrase_rects(words, pm.group(1), pm.group(2)) if pm else []
            rects = rects or find_rects(pg, n, words)
            if rects:
                groups.append((n, rects[:6]))
                used.append(n)
        if groups:
            return groups
    for n in needles_for(key, f):
        rects = find_rects(pg, n, words)
        if rects:
            if not re.match(r'^[\d,./-]', n) and ' ' in n:
                rects = merge_by_row(rects)          # "רישיון תקף להסעת" — מלבן אחד לביטוי, לא רק למילה הראשונה
            return [(n, rects[:12])]
    return number_groups(pg, words, f)


def merge_by_row(rects):
    """search_for לביטוי בעברית מחזיר מלבן לכל מילה; מאחדים מלבנים שבאותה שורה וצמודים למלבן אחד."""
    out = []
    for r in sorted(rects, key=lambda r: (round(r.y0 / 4), r.x0)):
        if out and abs(out[-1].y0 - r.y0) < 4 and r.x0 - out[-1].x1 < 40 and out[-1].x0 - r.x1 < 40:
            out[-1] = out[-1] | r
        else:
            out.append(r)
    return out


def _prefer(groups, y0, y1, tol=0):
    """בכל קבוצה: אם יש מופעים בתוך הטווח — רק הם; אחרת הקבוצה נשארת (כדי ש"18 חודשים" שבשורה שאחרי המשפט לא ייעלם)."""
    out = []
    for n, rects in groups:
        inside = [r for r in rects if y0 - tol <= (r.y0 + r.y1) / 2 <= y1 + tol]
        out.append((n, inside or rects))
    return out


def locate(fitz, pdf, pno, key, f):
    """איפה לסמן: הערך בעמוד המקור, ואם אין — בעמוד הבא (סעיף שנמשך; "185 אוטובוסים" היה בעמוד 73 כשהסעיף
    התחיל ב-72); ואם גם שם אין — משפט המפתח של הסעיף (brief) כפס על השורות שלו, כמו בציטוטי הקווים;
    ואם גם הוא לא — שורת הכותרת של הסעיף (מספר הסעיף בשוליים). טבלת הקנסות: גם שני עמודים אחורה, כי הכותרת
    "פיצויים מוסכמים" קודמת לסעיף הראשון בטבלה. מחזיר (עמוד, מספרו, מלבנים, מה נמצא, איך, טווח הסעיף) או None."""
    sec = f.get('sec') or {}
    back = 2 if key == 'penalties.amount' else 0
    pages = [p for p in list(range(pno, pno + 2)) + list(range(pno - 1, pno - back - 1, -1)) if 1 <= p <= pdf.page_count]
    if key == 'penalties.amount':
        # טבלת הקנסות: המילים "פיצוי מוסכם"/"קנס" בתוך הסעיף הראשון שבטבלה (20.2) בעמוד שלו — לא כל אזכור בעמוד
        # (בחיפה סומנו 9 אזכורים שני עמודים לפני הטבלה), ולא רק שורת הכותרת (20.2 היא "מוקד טלפוני", והקנס בסופה)
        carry = False
        for p in pages[:2]:
            pg = pdf[p - 1]
            words = pg.get_text('words')
            span = section_span(pg, words, sec.get('n'))
            if not span and carry:
                # הסעיף התחיל בעמוד הקודם ונמשך לכאן — עד מספר הסעיף הבא בשוליים
                nxt = [w for w in words if SEC_NUM.match(w[4]) and w[2] > pg.rect.width * 0.7]
                span = (0, min(w[1] for w in nxt) - 2 if nxt else pg.rect.height)
            if not span:
                continue
            carry = span[1] >= pg.rect.height - 5
            groups = find_value(pg, words, key, f)
            inside = [r for _, rects in groups for r in rects if span[0] <= (r.y0 + r.y1) / 2 <= span[1]]
            if inside:
                hit = sorted(inside, key=lambda r: r.y0)[:2]
                return pg, p, hit, ' · '.join(n for n, _ in groups), 'value', span
        head = heading_rows(fitz, pdf, pages[:2], sec)
        if head:
            return head
    for p in pages:
        pg = pdf[p - 1]
        words = pg.get_text('words')
        groups = find_value(pg, words, key, f)
        if not groups:
            continue
        if key == 'penalties.amount':
            groups = [(n, sorted(rects, key=lambda r: r.y0)[:2]) for n, rects in groups]
        # רק בתוך הסעיף עצמו, כשכותרתו בעמוד (אותו מספר יכול להופיע גם בסעיף השכן)
        span = section_span(pg, words, sec.get('n'))
        if span:
            groups = _prefer(groups, *span)
        # ואם משפט המפתח נמצא בעמוד — עדיף המופע שבתוכו ("12 חודשים" של מועד ההתחלה, לא של אורך החוזה)
        sent = find_quote(pg, sec['brief']) if len(sec.get('brief') or '') >= 20 else None
        if sent:
            groups = _prefer(groups, sent[0], sent[1], tol=3)
        hit = [r for _, rects in groups for r in rects][:24]
        generic = isinstance(f.get('value'), str) and not date_needles(f['value']) and not phrases_for(f) and len(hit) > 2
        if generic:
            # ביטוי כללי מהערך ("עלות ההפעלה" ×4 בעמוד ההגדרות) — עדיף משפט המפתח של הסעיף, ואם אין — 3 המופעים העליונים
            if sent:
                rows = [fitz.Rect(*b) for b in rows_between(pg, sent[0], sent[1])]
                if rows:
                    return pg, p, rows, 'משפט המפתח של הסעיף', 'sentence', span
            hit = sorted(hit, key=lambda r: r.y0)[:3]
        return pg, p, hit, ' · '.join(n for n, _ in groups), 'value', span
    brief = sec.get('brief') or ''
    if len(brief) >= 20:
        for p in pages:
            pg = pdf[p - 1]
            sent = find_quote(pg, brief)
            if sent:
                rows = [fitz.Rect(*b) for b in rows_between(pg, sent[0], sent[1])]
                if rows:
                    return pg, p, rows, 'משפט המפתח של הסעיף', 'sentence', None
    return heading_rows(fitz, pdf, pages, sec)


def heading_rows(fitz, pdf, pages, sec):
    """שורת הכותרת של הסעיף (מספר הסעיף בשוליים והטקסט שבאותה שורה) בעמוד הראשון מבין pages שבו הוא נמצא."""
    if not sec.get('n') or '.' not in str(sec['n']):
        return None
    for p in pages:
        pg = pdf[p - 1]
        words = pg.get_text('words')
        heads = [w for w in words if w[4].rstrip('.') == str(sec['n'])]
        if heads:
            head = max(heads, key=lambda w: w[2])
            rows = [fitz.Rect(*b) for b in rows_between(pg, head[1], head[3])]
            if rows:
                return pg, p, rows, f'כותרת סעיף {sec["n"]}', 'heading', None
    return None


def snip_quotes(fitz, Image, url_sha, previous, result, pdfs):
    """צילום לכל עמוד שיש בו ציטוטים על קווים (line-changes.json): כל הציטוטים שבעמוד מודגשים בצהוב,
    והתמונה חתוכה לאזור שלהם. שלמה (16.09): "שהתכונה תצלם את המסכים הרלוונטיים לאותו פרק ותסמן את הציטוט"."""
    lc = read(ROOT / 'line-changes.json', {})
    groups = {}
    for tid, items in lc.get('tenders', {}).items():
        for q in items:
            if q.get('sha256') and q.get('page'):
                groups.setdefault((q['sha256'], q['page']), []).append(q['quote'])
    for tid, notes in lc.get('sections', {}).items():
        for q in notes:
            if q.get('sha256') and q.get('page'):
                groups.setdefault((q['sha256'], q['page']), []).append(q['quote'])
    sha_url = {sha: url for url, sha in url_sha.items()}
    made = kept = 0
    for (sha, pno), quotes in sorted(groups.items()):
        key = f'{sha[:12]}:{pno}'
        prev = previous.get(key)
        if prev and prev.get('v') == VERSION and prev.get('n') == len(quotes) and (ROOT / prev['image']).exists():
            result['quotes'][key] = prev
            kept += 1
            continue
        url = sha_url.get(sha)
        path = ensure_cached(sha, url) if url else None
        if not path or path.read_bytes()[:4] != b'%PDF':
            continue
        try:
            pdf = pdfs.get(sha) or fitz.open(str(path))
            pdfs[sha] = pdf
            pg = pdf[pno - 1]
        except Exception:
            continue
        spans = [s for s in (find_quote(pg, q) for q in quotes) if s]
        if not spans:
            continue
        # כל שורה מסומנת פעם אחת גם כשכמה ציטוטים חולקים אותה — סימון כפול נראה כתום
        rows = {}
        for ya, yb in spans:
            for box in rows_between(pg, ya, yb):
                rows[round((box[1] + box[3]) / 2)] = box
        annots = []
        for box in rows.values():
            a = pg.add_highlight_annot(fitz.Rect(*box))
            a.set_colors(stroke=(1, 0.9, 0.2))
            a.update()
            annots.append(a)
        bands = spans
        # תמיד העמוד המלא של המסמך, כמו שהוא (שלמה 16.09: "לצלם את כל הדף במסמך של משרד התחבורה") — הסימון מעליו
        pix = pg.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), clip=pg.rect, alpha=False)
        for a in annots:
            pg.delete_annot(a)
        img = Image.open(io.BytesIO(pix.tobytes('png')))
        if img.width > 1400:
            img = img.resize((1400, int(img.height * 1400 / img.width)))
        rel = f'snips/q-{sha[:12]}-p{pno}.webp'
        img.save(ROOT / rel, 'WEBP', quality=80, method=6)
        result['quotes'][key] = {'image': rel, 'page': pno, 'sha': sha, 'v': VERSION, 'n': len(quotes), 'marked': len(bands)}
        made += 1
    print(f'צילומי ציטוטים: {len(result["quotes"])} עמודים ({made} חדשים, {kept} נשמרו) מתוך {len(groups)} עמודים עם ציטוטים', flush=True)


def main():
    try:
        import fitz  # PyMuPDF
        from PIL import Image
    except ImportError:
        print('אין PyMuPDF/Pillow — מדלגים על הצילומים', flush=True)
        return
    # כל השדות שהאתר מציג (מובנים + סיכומים + חוקים), לא רק החוקים — גם לערבויות ולתנאי הסף יש עמוד במסמך
    from fields_merge import load as load_fields, combined_fields, all_tender_ids, is_verified, source_of
    data = load_fields()
    rules = {tid: {k: f for k, f in combined_fields(data, tid).items() if is_verified(f)} for tid in all_tender_ids(data)}
    index = read(ROOT / 'text' / 'index.json', {'documents': {}})['documents']
    url_sha = {m['url']: sha for sha, m in index.items()}
    prev_all = read(OUT, {'tenders': {}})
    previous = prev_all.get('tenders', {})
    SNIPS.mkdir(exist_ok=True)
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}, 'quotes': {}}
    made = kept = 0
    pdfs = {}
    for tid, fields in rules.items():
        for key, f in fields.items():
            src = source_of(f)
            if not src or key.startswith('identity.'):
                continue
            url, _, page = (src.get('url') or '').partition('#page=')
            sha = url_sha.get(url)
            if not sha or not page.isdigit():
                continue
            pno = int(page)
            prev = previous.get(tid, {}).get(key)
            if prev and prev.get('sha') == sha and prev.get('page') == pno and prev.get('v') == VERSION and (ROOT / prev['image']).exists():
                result['tenders'].setdefault(tid, {})[key] = prev; kept += 1
                continue
            path = ensure_cached(sha, url)          # המטמון ריק בכל ריצה — מורידים את המסמך אם צריך
            if not path or path.read_bytes()[:4] != b'%PDF':
                continue
            try:
                pdf = pdfs.get(sha) or fitz.open(str(path)); pdfs[sha] = pdf
                pdf[pno - 1]
            except Exception:
                continue
            found = locate(fitz, pdf, pno, key, f)
            if not found:
                continue
            pg, used_page, hit, needle, how, span = found
            words = pg.get_text('words')
            # מה בדיוק סומן (המילים שמתחת לכל סימון) — נשמר כדי שאפשר יהיה לבדוק את כל הצילומים בלי לפתוח תמונות
            marks = [' '.join(w[4] for w in words if r.x0 < w[2] and r.x1 > w[0] and r.y0 < w[3] and r.y1 > w[1]) for r in hit]
            hit = [r for r, m in zip(hit, marks) if m]
            marks = [m for m in marks if m]
            if not hit:
                continue
            annots = []
            for r in hit:
                a = pg.add_highlight_annot(r)
                a.set_colors(stroke=(1, 0.9, 0.2)); a.update()
                annots.append(a)
            y0 = max(0, min(r.y0 for r in hit) - 110)
            y1 = min(pg.rect.height, max(r.y1 for r in hit) + 150)
            clip = fitz.Rect(0, y0, pg.rect.width, y1)
            pix = pg.get_pixmap(matrix=fitz.Matrix(1.7, 1.7), clip=clip, alpha=False)
            for a in annots:                       # הסימון של שדה אחד לא נשאר בצילום של שדה אחר באותו עמוד
                pg.delete_annot(a)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            if img.width > 1400:
                img = img.resize((1400, int(img.height * 1400 / img.width)))
            safe = re.sub(r'[^a-z0-9_]', '_', key)
            rel = f'snips/{re.sub(r"[^a-zA-Z0-9_-]", "_", tid)}-{sha[:12]}-p{used_page}-{safe}.webp'   # כולל את המכרז — שני מכרזים יכולים לחלוק מסמך
            img.save(ROOT / rel, 'WEBP', quality=82, method=6)
            result['tenders'].setdefault(tid, {})[key] = {'image': rel, 'page': used_page, 'needle': needle, 'sha': sha, 'v': VERSION,
                                                          'marks': marks[:24], 'how': how, 'inSection': bool(span)}
            made += 1
    snip_quotes(fitz, Image, url_sha, prev_all.get('quotes', {}), result, pdfs)
    for pdf in pdfs.values():
        pdf.close()
    used = {v['image'] for t in result['tenders'].values() for v in t.values()} | {v['image'] for v in result['quotes'].values()}
    removed = 0
    for img in SNIPS.glob('*.webp'):
        if f'snips/{img.name}' not in used:
            img.unlink(); removed += 1
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    total = sum(len(t) for t in result['tenders'].values())
    print(f'צילומים: {total} ({made} חדשים, {kept} נשמרו, {removed} נמחקו) ב-{len(result["tenders"])} מכרזים', flush=True)


if __name__ == '__main__':
    main()
