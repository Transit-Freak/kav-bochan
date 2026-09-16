"""התנאים במכרז — הסעיפים עצמם, לפי נושא, בלי מודל שפה (שלמה 16.09).

מסמכי משרד התחבורה בנויים בסעיפים ממוספרים ("38.2 מספר האוטובוסים, תמהילם
ומאפייניהם", "5.7 נהגים – שכר, תמריצים, הכשרה וותק"). כאן:
1. מזהים את כותרות הסעיפים במסמך הראשי של כל מכרז הפעלה → תוכן עניינים עם עמודים.
2. לכל סעיף שומרים את הטקסט שלו כפי שהוא (עד הכותרת הבאה).
3. משייכים סעיפים לנושאים לפי מילים בכותרת (נהגים ושכר, תמורה ותשלומים, ערבויות,
   קנסות ופיצויים, צי הרכבים, ניקוד ההצעות, …). סעיף-משנה יורש את הנושא של הסעיף שמעליו.
4. מוציאים מכל סעיף את המספרים שכתובים בו (₪, אחוזים, חודשים/שנים, נהגים/אוטובוסים/נקודות).

זה לא סיכום: האתר מציג את הסעיף המקורי. אין פרשנות ואין ניסוח מחדש.

פלט: tenders/sections/<tid>.json  ו-tenders/sections-index.json
"""
import datetime
import gzip
import json
import pathlib
import re
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
TEXT = ROOT / 'text'
OUTDIR = ROOT / 'sections'
INDEX = ROOT / 'sections-index.json'

SEC = r'\d{1,2}(?:\.\d{1,2}){0,2}'
# "38.2 מספר האוטובוסים…"  |  "מצבת האוטובוסים      38"  |  "34.1קווים חדשים" (מספר דבוק)
# ".1על מעשה" — pdftotext הופך לפעמים את הנקודה לפני המספר
HEAD_START = re.compile(r'^\s*(?:\.\s*)?(?P<n>' + SEC + r')\s*[.)]?\s*(?P<t>[א-ת"\'(].{2,})$')
HEAD_END = re.compile(r'^\s*(?P<t>[א-ת"\'(].{2,72}?)\s{2,}(?P<n>' + SEC + r')\s*$')
TOC_LINE = re.compile(r'\.\s*\d{1,2}\s*$|^\s*\d{1,3}\s*$')      # "כללי    .1" בתוכן העניינים / מספר עמוד לבד
# "נספח כו' – פיצויים מוסכמים" (כותרת רצה) | "נספח כ"ו" לבד בעמוד שער, והכותרת בשורה הבאה
ANNEX = re.compile(r'^\s*נספח\s+(?P<l>[א-ת]{1,2}["״\'׳]?[א-ת]?[\'׳]?)(?:\s*[–\-:]\s*(?P<t>.+?))?\s*$')
RUNNING = re.compile(r"^\s*(?:חלק [א-ת]['׳]|נספח\s+[א-ת]{1,2}[\"״'׳]?[א-ת]?['׳]?\s*(?:[–\-:]|$)|מהדורה:|מספר הוראה:|סיווג:)")
UNITS_TIME_MONEY = r'חודשים|חודש|שנים|שנה|ימים|יום|שעות|דקות|נקודות|נק\'|אחוז|אלף|מיליון|ש"ח|₪|שקלים'
UNITS_COUNT = r'נהגים|אוטובוסים|קווים|תחנות|נסיעות'

TOPICS = [
    ('תקופת ההתקשרות', r'תקופת ההכנות|תקופת ההפעלה|תקופת ההתקשרות|הארכת|תקופה נוספת'),
    ('תנאי סף', r'תנאי סף|תנאי הסף|מגבלת השתתפות|^המציעים'),
    ('נהגים ושכר', r'נהג|(?<![א-ת])[הבלמוש]{0,2}שכר[םו]?(?![א-ת])|הכשרה|כוח אדם|עובדים|(?<![א-ת])[הבלמוש]?ותק(?![א-ת])'),
    ('תמורה ותשלומים', r'עלות ההפעלה|תמורה|תשלום|סובסידיה|תמריץ|הצמדה|תוספת ק"מ|תוספת עלות|הצעה כספית|עדכון עלות'),
    ('ערבויות', r'ערבות'),
    ('קנסות ופיצויים', r'פיצויים מוסכמים|פיצוי מוסכם|קיזוז|חילוט|הפרה|סנקצי|אי[- ]ביצוע|חריגה מלוח|אי עמידה|קנס'),
    ('צי הרכבים', r'מצבת האוטובוסים|סוגי אוטובוסים|מספר האוטובוסים|(?<![א-ת])[הבלמוש]?גיל(?![א-ת])|חשמלי|בחשמל|הנעה חשמלית|מצב האוטובוסים|תחזוקה|מיגון|נגישות|צי הרכב|אוטובוסים חדשים'),
    ('ניקוד ההצעות', r'קריטריונים והמשקלות|הצעה תפעולית|תכנית עסקית|תוכנית עסקית|ניקוד|נקודות|דירוג|בחירת|כשיר שני'),
    ('רמת שירות', r'רמת שירות|לוחות זמנים|תדירות|מקדמי מילוי|תלונות|מידע שוטף|פניות ציבור|בקרה|שביעות רצון|עמדות על קו'),
    ('קבלני משנה ותגבור', r'קבלני משנה|תגבור'),
    ('כרטוס וגבייה', r'כרטוס|גבייה|גביה|תיקוף|כרטיס'),
    ('תשתיות ומסופים', r'מתקני תשתית|תחנות קצה|מסופים|משרדים|חניונ|תשתיות'),
    ('הקווים והשירות', r'הקווים הכלולים|מרחב האשכול|קווים חדשים|שינויים בקווים|קווים מבוטלים|קווי לילה|קווי תלמידים|מספרי נוסעים|שינויים בהפעלת השירות|תיאור מערכת|מסלול|רשימת תחנות'),
    ('מועדים והגשה', r'מועד|הגשת ההצעות|הבהרות ושאלות|רישום להליך|מבנה ההצעה|עריכת ההצעה|שלמות ההצעה|עותקי ההצעה|תצהיר'),
    ('טכנולוגיה ומידע', r'טכנולוגי|מערכות מידע|סייבר|ניהול צי|מצלמות|כריזה|שילוט|אפליקציה|GPS'),
]
TOPIC_ORDER = [t for t, _ in TOPICS]

NUM_PATTERNS = [
    (re.compile(r'(?<![\d,.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(מיליון|אלף)?\s*(?:₪|ש"ח|ש״ח|שקלים חדשים|שקלים|שקל)'), lambda m: f'{m.group(1)}{(" " + m.group(2)) if m.group(2) else ""} ₪'),
    # "₪ 500 -" — הסימן לפני המספר (היפוך של pdftotext)
    (re.compile(r'(?:₪|ש"ח|ש״ח)\s*-?\s*(\d{1,3}(?:,\d{3})+|\d+)(?![\d,])'), lambda m: f'{m.group(1)} ₪'),
    (re.compile(r'(?<![\d.])(\d{1,3}(?:\.\d+)?)\s*%'), lambda m: f'{m.group(1)}%'),
    # "16:00-17:00 נהגים" — שעה, לא כמות: המספר לא יכול לבוא אחרי נקודתיים או מקף
    (re.compile(r'(?<![\d.,:\-])(\d{1,3})\s*(חודשים|חודש|שנים|שנה|ימי עבודה|ימים|יום|שעות|דקות)(?![א-ת])'), lambda m: f'{m.group(1)} {m.group(2)}'),
    (re.compile(r'(?<![\d.,:\-])(\d{1,4})\s*(נהגים|אוטובוסים|אוטובוס|מיניבוסים|נקודות|נק\'|נסיעות|קווים|תחנות|מושבים|מקומות ישיבה)(?![א-ת])'), lambda m: f'{m.group(1)} {m.group(2)}'),
]


def clean(s):
    return re.sub(r'\s+', ' ', re.sub('[‪-‮‎‏]', '', s)).strip()


def header(line):
    """כותרת סעיף ("38.2 מספר האוטובוסים") או תחילת סעיף ממוספר ("2.2 אי ביצוע של לפחות 2 נסיעות …").
    שורה ארוכה מתקבלת רק עם מספר סעיף מנוקד (2.2 / 5.7.3); מספר בודד בתחילת שורה ארוכה הוא בדרך כלל כמות."""
    s = line.rstrip()
    st = s.strip()
    if not st or len(st) > 220 or TOC_LINE.search(s):
        return None
    m = HEAD_START.match(s)
    if m and not ('.' in m['n'] or len(st) <= 80):
        m = None
    if not m and len(st) <= 80:
        m = HEAD_END.match(s)
    if not m:
        return None
    n, t = m['n'], clean(m['t'])
    if len(t) < 3 or re.match(r'^(?:בוטל|מבוטל)\.?$', t):
        return None
    if re.fullmatch(r'\d{1,2}', n) and int(n) > 60:
        return None
    # "12 חודשים ממועד ההודעה…" / "3.5 מיליון ₪" — כמות ולא מספר סעיף
    units = UNITS_TIME_MONEY if '.' in n else UNITS_TIME_MONEY + '|' + UNITS_COUNT
    if re.match(r'^(?:' + units + r')(?![א-ת])', t):
        return None
    heading = len(t) <= 48
    if heading:
        # כותרת קצרה: בלי מספרים גדולים, בלי פסיקים רבים, לא מסתיימת בנקודה/נקודתיים ("3.2 תאגיד רשום בישראל.")
        if re.search(r'\d{3,}', t) or t.count(',') > 2 or t.endswith((':', ';', ',', '.')):
            return None
    elif '.' not in n:
        return None
    return n, t


def numbers_in(text):
    out = []
    for pat, fmt in NUM_PATTERNS:
        for m in pat.finditer(text):
            v = fmt(m)
            if v not in out:
                out.append(v)
    return out[:14]


def number_contexts(text, before=5, after=4, limit=8):
    """כל מספר עם המילים שסביבו, בניסוח פשוט: "פיצוי מוסכם של 100 אלף ₪ על כל שבוע איחור".
    מספר לבד ("100 אלף ₪") לא אומר כלום למי שלא קרא את הסעיף."""
    text = tidy(text)
    found = []
    for pat, fmt in NUM_PATTERNS:
        for m in pat.finditer(text):
            found.append((m.start(), m.end(), fmt(m)))
    found.sort()
    out, seen = [], set()
    for start, end, v in found:
        if v in seen:
            continue
        seen.add(v)
        # גבולות: משפט (נקודה) או תת-סעיף ממוספר
        left = max(text.rfind('. ', 0, start), text.rfind('; ', 0, start), text.rfind(': ', 0, start)) + 1
        right = min(x for x in (text.find('. ', end), text.find('; ', end), len(text)) if x >= 0)
        pre = text[left:start].split()[-before:]
        post = text[end:right].split()[:after]
        ctx = simplify(' '.join(pre) + ' ' + v + ' ' + ' '.join(post)).strip(' ,;:-–')
        ctx = re.sub(r'\s+(?:עבור|בשביל|של|על|את|לפי|עד|או|כי|אם|כל|בין|לכל|מתוך|ועד|החל|כולל|ממועד|מיום)$', '', ctx)   # לא מסיימים במילת קישור
        if not ctx.startswith(v) and not ctx.endswith(v) and len(ctx) > 90:
            ctx = ctx[:90].rsplit(' ', 1)[0] + '…'
        out.append([v, ctx])
        if len(out) >= limit:
            break
    return out


# ---- "בקצרה": ניסוח קצר וברור בחוקים קבועים (לא מודל שפה) -------------------------
# בוחרים את המשפט המרכזי של הסעיף (הכי הרבה מספרים ומילות נושא, לא משפט-מסגרת משפטי),
# ומחליפים ניסוח משפטי במילים פשוטות. כל החלפה שומרת על המשמעות; מה שלא בטוח — לא מוחלף.
PLAIN = [
    (r'למען הסר ספק,?\s*(?:מובהר|יובהר)?\s*(?:בזאת)?,?\s*(?:כי)?\s*', ''),
    (r'מבלי לגרוע מ(?:האמור|כלליות האמור|הוראות)(?: לעיל)?(?: בסעי(?:פים|ף) \d+(?:\.\d+)*(?:\s*[–-]\s*\d+(?:\.\d+)*)?)?(?: לעיל)?,?\s*', ''),
    (r'(?:מובהר|יובהר|יצוין|יודגש) (?:בזאת,? )?כי\s*', ''),
    (r'על אף האמור(?: לעיל)?,?\s*', 'בכל מקרה, '),
    (r'בכפוף ל(?:הוראות )?', 'בתנאי של '),
    (r'כמפורט (?:להלן|לעיל)(?: בסעיף [\d.]+)?', ''),
    # "המפורטים בסעיפים 1.6.1.2 – 1.6.1.1", "כמפורט בסעיף 34", "האמור בסעיף 15.1 לעיל" — הפניות פנימיות, לא תוכן
    (r',?\s*(?:בהתאם\s+)?ל?(?:ה)?(?:כ?מפורט(?:ים|ת|ות)?|אמור|נקוב(?:ים)?|קבוע(?:ים|ה)?|מוגדר(?:ים|ת)?)\s+בסעי(?:פים|ף)\s+\d+(?:\.\d+)*(?:\s*[–-]\s*[\d.]+)?(?:\s+(?:לעיל|להלן))?(?:\s+ל(?:הליך|מכרז)[^,.;]{0,20})?', ''),
    (r'(?<![א-ת])ובכלל זה ', 'כולל '),
    (r'(?<![א-ת])כפיצוי ', 'פיצוי '),
    # מילים שאזרח רגיל לא מכיר
    (r'(?<![א-ת])ההודעה על החילוט', 'ההודעה שהמדינה לקחה את כסף הערבות'),
    (r'(?<![א-ת])חולט(?:ה)? ', 'המדינה לקחה '),
    (r'(?<![א-ת])(?:ה)?חילוט(?![א-ת])', 'לקיחת כסף הערבות'),
    (r'(?<![א-ת])לחלט ', 'לקחת '),
    (r'(?<![א-ת])יחולט ', 'ייקח '),
    (r'(?<![א-ת])תחולט ', 'תילקח '),
    (r'(?<![א-ת])ערבות אוטונומית', 'ערבות בנקאית'),
    (r'(?<![א-ת])בלתי צמודה', 'לא צמודה למדד'),
    (r'(?<![א-ת])ובלתי מותנית', 'ובלי תנאים'),
    (r'(?<![א-ת])בלתי מותנית', 'בלי תנאים'),
    (r'(?<![א-ת])להצעתו ', 'להצעה '),
    (r'(?<![א-ת])המפקח על התעבורה', 'המפקח על התעבורה (האחראי במשרד התחבורה)'),
    (r'(?<![א-ת])ליסינג מימוני או תפעולי', 'ליסינג'),
    (r'(?<![א-ת])סך מקסימלי של ', 'עד '),
    (r'(?<![א-ת])סך מינימלי של ', 'לפחות '),
    (r'(?<![א-ת])לכל המאוחר ', 'עד '),
    (r'(?<![א-ת])עבור ', 'בשביל '),
    (r'(?:כאמור|לעיל|להלן)(?: בסעיף [\d.]+)?(?![א-ת])', ''),
    (r'(?<![א-ת])(?:ה)?מפעיל השירות', 'המפעיל'),
    (r'(?<![א-ת])([לבמ]?)הליך תחרותי זה', r'\1מכרז זה'),
    (r'(?<![א-ת])בהתאם לאמור ב', 'לפי '),
    (r'(?<![א-ת])(?:ה)?הליך (?:ה)?תחרותי', 'המכרז'),
    (r'(?<![א-ת])יהיה זכאי ל', 'יקבל '),
    (r'(?<![א-ת])זכאי ל', 'יקבל '),
    (r'(?<![א-ת])לא יפחת מ-?\s*', 'יהיה לפחות '),
    (r'(?<![א-ת])לא יעלה על\s*', 'עד '),
    (r'(?<![א-ת])לא יאוחר מ-?\s*', 'עד '),
    (r'(?<![א-ת])עד לתקרה של\s*', 'עד '),
    (r'(?<![א-ת])בסך (?:של )?', 'של '),
    (r'(?<![א-ת])בסכום של ', 'של '),
    (r'(?<![א-ת])בגין ', 'על '),
    (r'(?<![א-ת])לרבות ', 'כולל '),
    (r'(?<![א-ת])בהתאם ל(?:הוראות )?', 'לפי '),
    (r'(?<![א-ת])על[- ]פי ', 'לפי '),
    (r'עפ"י ', 'לפי '),
    (r'ע"י ', 'על ידי '),
    (r'(?<![א-ת])ככל ש', 'אם '),
    (r'(?<![א-ת])במידה ש', 'אם '),
    (r'(?<![א-ת])ו/או ', 'או '),
    (r'(?<![א-ת])רשאי ', 'יכול '),
    (r'(?<![א-ת])רשאית ', 'יכולה '),
    (r'(?<![א-ת])יידרש ', 'יצטרך '),
    (r'(?<![א-ת])בטרם ', 'לפני '),
    # מילים של אנשים, לא של עורכי דין (שלמה: "לאיש פשוט כמוני")
    (r'(?<![א-ת])(?:ה)?זוכה בהליך התחרותי', 'החברה שתזכה'),
    (r'(?<![א-ת])(?:ה)?זוכה במכרז', 'החברה שתזכה'),
    (r'(?<![א-ת])ממועד ההודעה על הזכייה', 'מהיום שהודיעו למי שזכה'),
    (r'(?<![א-ת])מועד ההודעה על הזכייה', 'היום שהודיעו למי שזכה'),
    (r'(?<![א-ת])(?:ה)?ועדת המכרזים', 'ועדת המכרזים'),
    (r'(?<![א-ת])הוועדה ', 'ועדת המכרזים '),
    (r'(?<![א-ת])הממשלה(?![א-ת])', 'המדינה'),
    (r'(?<![א-ת])לממשלה(?![א-ת])', 'למדינה'),
    (r'(?<![א-ת])מהממשלה(?![א-ת])', 'מהמדינה'),
    (r'(?<![א-ת])המציע יציין בהצעתו ', 'החברה המתמודדת תכתוב בהצעה '),
    (r'(?<![א-ת])המציע יגיש ', 'החברה המתמודדת תגיש '),
    (r'(?<![א-ת])המציע יצרף ', 'החברה המתמודדת תוסיף '),
    (r'(?<![א-ת])על המציע ל', 'החברה המתמודדת צריכה ל'),
    (r'(?<![א-ת])בהצעתו ', 'בהצעה '),
    (r'(?<![א-ת])תקופת ההכנות', 'תקופת ההכנה'),
    (r'(?<![א-ת])כדלקמן:?', 'כך:'),
    (r'(?<![א-ת])לעניין סעיף זה,?\s*', ''),
    (r'(?<![א-ת])בשים לב לאמור,?\s*', ''),
    (r'(?<![א-ת])לצורך ', 'כדי '),
    (r'(?<![א-ת])בתום ', 'בסוף '),
    (r'(?<![א-ת])מעת לעת', 'מדי פעם'),
    (r'(?<![א-ת])אך ורק ', 'רק '),
    (r'(?<![א-ת])ימציא ', 'יביא '),
    (r'(?<![א-ת])יעמיד ', 'ייתן '),
    (r'(?<![א-ת])בפועל', 'באמת'),
    (r'(?<![א-ת])הינו ', 'הוא '),
    (r'(?<![א-ת])הינה ', 'היא '),
    (r'(?<![א-ת])הינם ', 'הם '),
    (r'(?<![א-ת])במסגרת ', 'בתוך '),
    (r'(?<![א-ת])ביחס ל', 'לעומת '),
    (r'(?<![א-ת])בהתאמה', ''),
    (r'(?<![א-ת])אינו ', 'לא '),
    (r'(?<![א-ת])אינם ', 'לא '),
    (r'(?<![א-ת])אינה ', 'לא '),
    (r'ש"ח', '₪'),
]
PLAIN_RX = [(re.compile(p), r) for p, r in PLAIN]
BOILER = re.compile(r'^(?:למען הסר ספק|מבלי לגרוע|על אף האמור|מובהר|יובהר|יצוין|האמור|בכפוף|הוראות סעיף|סעיף זה)')
FIXES = [
    (re.compile(r'\s(\d{1,3})\s\.(?=\s?[א-ת])'), r'. \1 '),   # "בשלב א' 10 .שנים" → "בשלב א'. 10 שנים" (הנקודה של המשפט הקודם נדדה)
    (re.compile(r'\)(\d[\d.,%]*)\('), r'(\1)'),        # ")2(" → "(2)"
    (re.compile(r'\(\s*([,.;]?)\s*\)(\d+)'), r'(\2)\1 '),   # "מעלה אדומים ( ,)209בית אל" → "מעלה אדומים (209), בית אל"
    (re.compile(r'\.\)(\d[\d.,]*%?)'), r' \1).'),      # "של.)20%" → "של 20%)."
    (re.compile(r'\.\s*₪\s*(\d[\d,]*)'), r' \1 ₪.'),   # "סך של. ₪ 155,000" → "סך של 155,000 ₪."
    (re.compile(r'(\d)-(?=[א-ת])'), r'\1 '),           # "166-אוטובוסים" → "166 אוטובוסים"
    (re.compile(r'\(\s*\)\s*(\d+)'), r'(\1)'),         # "( )2עותקים" → "(2) עותקים"
    (re.compile(r'\(\s*\)'), ''),
    (re.compile(r'\s+([,.;:])'), r'\1'),               # " ,אותו" → ",אותו"
    (re.compile(r',{2,}'), ','),
    (re.compile(r'([,;:])(?=[א-ת(])'), r'\1 '),        # ",אותו" → ", אותו"
    (re.compile(r'(?<!\d)([,;:])(?=\d)'), r'\1 '),     # אבל לא בתוך "2,000" או "16:00"
    (re.compile(r'(?<=\d):(?=\s*[א-ת])'), ' '),        # "ותמשך 10: שנים" → "ותמשך 10 שנים" (נקודתיים הפוכות)
    (re.compile(r'(?<=[א-ת])\s*:(?=\s*\d+\s*[א-ת])'), ' '),   # "ותמשך :10 שנים" → "ותמשך 10 שנים"
    (re.compile(r'\.(?=[א-ת])'), '. '),                # "לפחות.המענק" → "לפחות. המענק"
    (re.compile(r'(\d|\)|₪|%)(?=[א-ת])'), r'\1 '),     # "30אלף" / "₪בגין" / "11%מסכום" → עם רווח
    (re.compile(r'\s-(?=[א-ת])'), ' - '),              # "שכר יסוד -המציע" → "שכר יסוד - המציע"
    (re.compile(r'(?<![א-ת])ו (?=\d)'), 'ו-'),             # "10 שנים ו 12 חודשים" → "ו-12 חודשים"
    (re.compile(r'(?<=\s)\.(?=\d)'), ''),                 # "בשלב א' .10 שנים" → "בשלב א' 10 שנים" (נקודה הפוכה לפני מספר)
    (re.compile(r'\s{2,}'), ' '),
]
# סוף משפט, או תת-סעיף ממוספר בתוך הטקסט ("… כדלקמן: 52.2.1.1 בגין …")
SENT_SPLIT = re.compile(r'(?<=[.;])\s+(?=[א-ת"\'(])|\s+(?=\d{1,2}(?:\.\d{1,2}){1,3}\s+(?!לעיל|להלן)[א-ת"\'(])')
TABLE_LIKE = re.compile(r'(?:\S*\d\S*\s+){5,}')      # חמישה "מספרים" ברצף — שורת טבלה, לא משפט


def tidy(s):
    for rx, rep in FIXES:
        s = rx.sub(rep, s)
    return s.strip()


def simplify(s):
    """מילים פשוטות במקום ניסוח משפטי — החלפות קבועות, בלי לשנות את התוכן."""
    s = tidy(s)
    for rx, rep in PLAIN_RX:
        s = rx.sub(rep, s)
    s = re.sub(r'\s*\([^()]{30,}\)', '', s)             # הערת-אגב ארוכה בסוגריים — לא בקצרה
    # "הזוכה יגיש" הפך ל"החברה שתזכה" — הפועל עובר לנקבה (יגיש → תגיש, ישלם → תשלם)
    s = re.sub(r'(החברה (?:שתזכה|המתמודדת)) י([א-ת]{2,})', r'\1 ת\2', s)
    s = re.sub(r'(?<![א-ת])י([א-ת]{2,}) (החברה (?:שתזכה|המתמודדת))', r'ת\1 \2', s)    # "ישלים החברה שתזכה" → "תשלים החברה שתזכה"
    s = s.replace('(האחראי במשרד התחבורה)', '(האחראי במשרד התחבורה)', 1)
    if s.count('(האחראי במשרד התחבורה)') > 1:
        first = s.find('(האחראי במשרד התחבורה)') + len('(האחראי במשרד התחבורה)')
        s = s[:first] + s[first:].replace(' (האחראי במשרד התחבורה)', '')
    s = re.sub(r'^\s*[\d.]+(?:\s*[–-]\s*[\d.]+)?\s*,\s*', '', s)   # שארית של הפניה לסעיפים שנמחקה ("1.8 , ")
    s = re.sub(r'\s+([,.;:])', r'\1', re.sub(r'\s{2,}', ' ', s)).strip(' ,;-–')
    s = re.sub(r'^(?:ו|וכן|וכי|כי)\s+', '', s)
    if s and s[0] in '"\'' and s.count(s[0]) == 1:
        s = s[1:]
    return s.strip()


def sentences(text):
    return [x.strip() for x in SENT_SPLIT.split(text) if x.strip()]


def brief_of(title, text, topics, max_len=170):
    """המשפט המוביל של הסעיף (בסעיף משפטי הוא בדרך כלל ההוראה עצמה), בניסוח פשוט וקצר.
    שורות טבלה ומשפטי-מסגרת ("מבלי לגרוע…") נדחים; משפט מוביל קצר או שמסתיים בנקודתיים מקבל את המשפט הבא."""
    heading = len(title) <= 48
    body = tidy(text if heading else (title + ' ' + text))
    sents = sentences(body)
    if not sents:
        return ''
    good = [s for s in sents if not TABLE_LIKE.search(s) and not BOILER.match(simplify(s)) and len(simplify(s)) >= 12]
    if not good:
        good = [s for s in sents if not TABLE_LIKE.search(s)] or sents
    out = simplify(good[0])
    if len(good) > 1 and (out.endswith(':') or len(out) < 70):
        nxt = simplify(good[1])
        if nxt and not TABLE_LIKE.search(nxt):
            out = f'{out} {nxt}'
    if heading and title and not out.startswith(title[:12]):
        out = f'{tidy(title)}: {out}' if len(out) < 120 else out
    if len(out) > max_len:
        cut = out[:max_len].rsplit(' ', 1)[0]
        out = cut.rstrip(' ,;:-–') + '…'
    return out


def topics_for(title, parent_topics):
    found = [name for name, pat in TOPICS if re.search(pat, title)]
    return found or list(parent_topics)


def parse_document(units):
    """→ toc, sections. עובד על שורות המסמך ברצף, עם מספר העמוד לכל שורה."""
    lines = []
    for u in units:
        text = u.get('text') or ''
        if not text or u.get('rows'):
            continue
        page = u.get('page')
        for raw in text.split('\n'):
            lines.append((page, raw))
    # עמודי תוכן עניינים: הרבה שורות "כותרת ... .N" — לא סעיפים
    per_page = {}
    for page, raw in lines:
        if TOC_LINE.search(raw.rstrip()) and re.search('[א-ת]', raw):
            per_page[page] = per_page.get(page, 0) + 1
    toc_pages = {p for p, c in per_page.items() if c >= 6}
    sections = []
    cur = None
    parents = {}     # "38" → topics ; "38.2" → topics
    annex_topics = []   # נספח עם כותרת ("נספח כו' – פיצויים מוסכמים") — הסעיפים שבו יורשים את הנושא
    annex_pending = False   # "נספח כ"ו" לבד (עמוד שער): הכותרת בשורה הבאה
    for page, raw in lines:
        if page in toc_pages:
            continue
        if RUNNING.match(raw):
            am = ANNEX.match(raw)
            if am and am['t']:
                annex_topics = [name for name, pat in TOPICS if re.search(pat, clean(am['t']))]
                annex_pending = False
            elif am:
                annex_pending = True
            elif re.match(r"^\s*חלק [א-ת]['׳]", raw):
                annex_topics, annex_pending = [], False
            continue
        if annex_pending and raw.strip():
            annex_pending = False
            t = clean(raw)
            if len(t) <= 60 and not header(raw):
                annex_topics = [name for name, pat in TOPICS if re.search(pat, t)]
                continue
        h = header(raw)
        if h:
            n, t = h
            if cur:
                sections.append(cur)
            parent = n.rsplit('.', 1)[0] if '.' in n else None
            tps = topics_for(t, parents.get(parent) or annex_topics)
            parents[n] = tps
            cur = {'n': n, 't': t, 'p': page, 'lines': [], 'topics': tps}
            continue
        if cur is not None and raw.strip():
            if len(cur['lines']) < 80:
                cur['lines'].append(raw.strip())
    if cur:
        sections.append(cur)
    out = []
    for s in sections:
        text = clean(' '.join(s['lines']))[:3000]
        out.append({'n': s['n'], 't': s['t'], 'p': s['p'], 'text': text, 'numbers': numbers_in(s['t'] + ' ' + text), 'topics': s['topics'],
                    'nums': number_contexts(s['t'] + ' ' + text), 'brief': brief_of(s['t'], text, s['topics'])})
    toc = [{'n': s['n'], 't': s['t'], 'p': s['p']} for s in out]
    return toc, out


def doc_label(units):
    """שם קצר למסמך מתוך השורות הראשונות שלו ("הסכם הפעלה", "נספח כ' כרטוס חכם")."""
    for u in units[:2]:
        for raw in (u.get('text') or '').split('\n'):
            t = clean(raw)
            if len(t) >= 4 and not re.fullmatch(r'[\d\s./]+', t) and 'מדינת ישראל' not in t and 'משרד התחבורה' not in t:
                return t[:40]
    return ''


def tender_documents(index, current, tid):
    """כל מסמכי הטקסט העכשוויים של המכרז, הגדול ראשון. בלי מודעות לעיתונות (אין בהן סעיפים)."""
    docs = [(sha, m) for sha, m in index.items() if m['tender'] == tid and (not current or sha in current) and 'מודעה לעיתונות' not in m['url']]
    return sorted(docs, key=lambda x: -x[1].get('units', 0))


def is_duplicate(headers, seen, ratio=0.6):
    """מסמך שרוב כותרותיו כבר נראו — גרסה אחרת של אותו מסמך (למשל "הסכם הפעלה" שפורסם פעמיים)."""
    return bool(headers) and sum(1 for h in headers if h in seen) >= ratio * len(headers)


def main():
    index = json.load(open(TEXT / 'index.json', encoding='utf-8'))['documents'] if (TEXT / 'index.json').exists() else {}
    packages = json.load(open(ROOT / 'packages-state.json', encoding='utf-8'))['tenders'] if (ROOT / 'packages-state.json').exists() else {}
    current = {d['sha256'] for t in packages.values() for d in t.get('documents', {}).values() if d.get('sha256')}
    OUTDIR.mkdir(exist_ok=True)
    tenders = sorted({m['tender'] for m in index.values()})
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}}
    for tid in tenders:
        # כל מסמכי המכרז, לא רק הגדול: במכרזים שפורסמו כעשרות קבצים קטנים (הסכם, נספחים) התנאים מפוזרים ביניהם
        sections, toc, docs, seen = [], [], [], set()
        for sha, meta in tender_documents(index, current, tid):
            path = TEXT / (sha + '.json.gz')
            if not path.exists():
                continue
            payload = json.load(gzip.open(path, 'rt', encoding='utf-8'))
            units = payload['units']
            if sum(1 for u in units if u.get('text') and not u.get('rows')) < 2:
                continue
            d_toc, d_secs = parse_document(units)
            if len(d_secs) < 3:
                continue
            headers = {(x['n'], x['t']) for x in d_secs}
            if is_duplicate(headers, seen):
                continue
            seen |= headers
            label = doc_label(units) or urllib.parse.unquote(payload['url'].rstrip('/').split('/')[-1])
            if docs:   # לא המסמך הראשי — כל סעיף נושא את הקישור ואת שם המסמך שלו
                for x in d_secs:
                    x['u'] = payload['url']; x['d'] = label
                for x in d_toc:
                    x['u'] = payload['url']; x['d'] = label
            docs.append({'url': payload['url'], 'name': label, 'sha256': sha, 'pages': meta.get('units', 0), 'sections': len(d_secs)})
            sections += d_secs; toc += d_toc
            if len(sections) >= 4000:
                break
        if len(sections) < 5:
            continue
        counts = {}
        for x in sections:
            for t in x['topics']:
                counts[t] = counts.get(t, 0) + 1
        pages = sum(d['pages'] for d in docs)
        doc = {'tender': tid, 'doc': docs[0]['url'], 'sha256': docs[0]['sha256'], 'pages': pages, 'docs': docs, 'toc': toc, 'sections': sections}
        (OUTDIR / f'{tid}.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
        result['tenders'][tid] = {'file': f'sections/{tid}.json', 'sections': len(sections), 'pages': pages, 'docs': len(docs),
                                  'topics': {t: counts[t] for t in TOPIC_ORDER if counts.get(t)}}
        print(tid, len(sections), 'סעיפים ב-', len(docs), 'מסמכים ·', {t: c for t, c in result['tenders'][tid]['topics'].items()}, flush=True)
    INDEX.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('תנאים:', len(result['tenders']), 'מכרזים', flush=True)


if __name__ == '__main__':
    main()
