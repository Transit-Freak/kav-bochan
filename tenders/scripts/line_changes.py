"""מה המכרז אומר על כל קו — ציטוטים מילה במילה, בלי מודל שפה.

מסמכי המכרז של משרד התחבורה בנויים על תבנית אחת. בחלק ד' (מפרט טכני) יש סעיף
"שינויים שבוצעו בקווי האשכול" עם סעיפי משנה: "קווים חדשים", "שינויים בקווים
קיימים", "קווים מבוטלים", "קווי לילה", "קווי תלמידים". תחת כל סעיף — פריטים:
  • קו – 199 קו חדש מבת ים לחולון, ...                       (פריט לקו)
  • קו 19 (מק"ט 18019) – אין שינוי במכרז, אך ...              (פריט לקו עם מק"ט)
  • שינוי תדירות בלבד: קווים 14 (10014), 13 (11013), 6 (10006)  (רשימת קטגוריה)
  • קו 19 (10019), 217 (14217), 224 (12224)                    (רשימה תחת "קווים מבוטלים")

הקורא כאן עובד רק בכללים:
- מזהה את כותרות הסעיפים ומחזיק את הסעיף הנוכחי (הוא קובע את סוג השינוי).
- פריט מתחיל בשורה עם תבליט (•) או בשורה שמתחילה ב"קו"/"קווים" או ברשימת
  קטגוריה ("… :קווים"), ונמשך עד תבליט/כותרת/שורה ריקה הבאים.
- מספרי הקווים והמק"טים (5 ספרות) נלקחים מהקטע המספרי שאחרי "קו" (לא מתוך
  תיאור הקו, כדי ש"כביש 6" לא יהפוך לקו 6). ברשימת קטגוריה — מכל השורה.
- התגיות: מהסעיף (קו חדש / ביטול / שינוי) ומהמילים בפריט (שינוי מסלול, שינוי
  תדירות, הארכה, קיצור, שינוי מספר, איחוד, פיצול, חלופה); "אין שינוי" מזוהה בנפרד.
- הציטוט הוא הטקסט של הפריט כפי שחולץ מה-PDF (סוגריים שהתהפכו בחילוץ מתוקנים).

הפלט: tenders/line-changes.json
{ "updated": ..., "tenders": { tid: [ {"numbers": ["199"], "makats": ["99199"],
    "tags": ["קו חדש"], "section": "קווים חדשים", "quote": "...", "page": 67,
    "url": "...#page=67", "sha256": ..., "doc": "מסמכי הליך"} ] },
  "sections": { tid: [ {"section": "קווים חדשים", "quote": "המכרז לא כולל קווים חדשים.", ...} ] } }
"""
import datetime
import gzip
import json
import pathlib
import re
import sys
import urllib.parse
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
TEXT = ROOT / 'text'
OUT = ROOT / 'line-changes.json'

# מספר קו: עד 4 ספרות (אופציונלי N ללילה) ואות עברית אחת רק אם אינה תחילת מילה ("6א" כן, "13הינו" לא);
# ו' דבוקה היא ו' החיבור ("6ו-16") אלא אם אחריה גרש
NUM = r"N?\d{1,4}(?:[א-הז-ת](?![א-ת\"])|ו(?=['׳]))?"     # "6א", "48א'" כן; "11מ\"א" — המ' היא קיצור, לא סיומת
MAKAT = r'(?<!\d)[1-9]\d{4}(?!\d)'

SECTIONS = [
    ('קווים חדשים', 'קו חדש'),
    ('שינויים בקווים קיימים', 'שינוי'),
    ('שינויים בקווים', 'שינוי'),
    ('קווים מבוטלים', 'ביטול'),
    ('קווים שיבוטלו', 'ביטול'),
    ('ביטול קווים', 'ביטול'),
    ('קווי לילה', 'קווי לילה'),
    ('קווי תלמידים', 'קווי תלמידים'),
    ('חלופות תלמידים', 'קווי תלמידים'),
    ('שינויים שבוצעו בקווי האשכול', 'כללי'),
    ('שינויים בקווי האשכול', 'כללי'),
    ('מספרי נוסעים', None),
    ('סקירה כללית', None),
    ('הקווים הכלולים באשכול', None),
]
SEC_NUM = r'\d{1,2}(?:\.\d{1,2}){0,3}'
SEC_NUM_DOTTED = r'\d{1,2}(?:\.\d{1,2}){1,3}'       # מספר סעיף בתחילת שורה חייב נקודה ("34.1"); "47קווי תלמידים" הוא ספירה
HEADER = re.compile(r'^\s*(?:' + SEC_NUM_DOTTED + r')?\s*(?P<h>' + '|'.join(re.escape(s) for s, _ in SECTIONS) + r')(?P<rest>.*?)\s*(?:' + SEC_NUM + r')?\s*$')

TAGS = [
    ('קו חדש', r'קו חדש|קווים חדשים|קו\s+\S+\s+חדש|יופעל קו|הפעלת קו חדש|תופעל|קו אוטובוס חדש'),
    ('ביטול', r'(?<![א-ת])(?:יבוטל|יבוטלו|תבוטל|ביטול ה?קו(?:וים)?|מבוטל(?:ים|ת|ות)?|בוטל(?:ו|ה)?|לביטול|צפי לביטול|שמבוטל)(?![א-ת])'),
    ('שינוי מסלול', r'שינוי מסלול|שינוי במסלול|שינויי מסלול|ישונה מסלול|המסלול ישונה|מסלולו ישונה|יעבור דרך|לא יעבור|ייסע דרך|יסע דרך|מסלול חדש|יוסט|צפוי להשתנות|צפויים להשתנות|יותאם המסלול|מסלול הקו יהיה|יהפוך לחלופה'),
    ('שינוי תדירות', r'תדירות|תדירויות|תגבור|תוגבר|יתוגבר|תוספת נסיעות|הפחתת נסיעות|מתוגברת'),
    ('הארכה', r'יוארך|תוארך|הארכת הקו|הארכת המסלול|הארכה'),
    ('קיצור', r'יקוצר|תקוצר|קיצור המסלול|קיצור הקו|קיצור'),
    ('שינוי מספר', r'ישונה מספרו|מספרו ישונה|מספר הקו ישונה|יקבל את המספר|ימוספר|מספר חדש|במקום קו'),
    ('איחוד', r'יאוחד|יאוחדו|איחוד'),
    ('פיצול', r'יפוצל|יפוצלו|פיצול'),
    ('חלופה', r'חלופה|חלופת|חלופות'),
]
NEG = re.compile(r'(?:ללא|אין|בלי|לא יהיה|לא יחול|לא)\s+(?:כל\s+)?שינוי(?:ים)?(?:\s+ב?\S+){0,2}|יישאר(?:ו)? (?:ללא שינוי|כפי שה(?:וא|ם) היום)|ימשיך לפעול|ימשיכו לפעול|לא ישונה|לא ישתנה')
BULLET = re.compile(r'[•▪●◦■]|(?<![\w"])-(?=\s)')
LINE_START = re.compile(r'^\s*[•▪●◦]?\s*(?:קו|קווים|לקו|לקווים)\s*[:–\-]?\s*[\(\)]?\s*(?:N?\d|\(|\))')
CATEGORY = re.compile(r'^\s*[•▪●◦]?\s*(?P<cat>[^:•]{3,45}?)\s*:\s*(?:קווים?|הקווים?)\b(?P<rest>.*)$')
# הקטע המספרי אחרי "קו": מספרים, מק"טים, סוגריים, מקפים, פסיקים, ו' החיבור והמילה מק"ט
HEAD_TAIL = re.compile(r'(?:קו|קווים|לקו|לקווים)\s*[:–\-]?\s*(?P<nums>(?:[\(\)\s,.–\-\']|N?\d+(?:[א-ת](?![א-ת"]))?|ו(?=[\s\-–\)\(\d])|מק"ט|מק״ט|מקט)+)')   # "11מ"א" — לא סיומת
SECTION_WORDS = tuple(s for s, _ in SECTIONS)


def split_glued(s):
    """pdftotext מדביק מספר למילה שאחריו ("199קו חדש", "19מק"ט"): מפרידים ברווח,
    אבל אות סופית יחידה נשארת דבוקה ("6א")."""
    s = re.sub(r'(\d)(?=[א-ת]{2})', r'\1 ', s)
    s = re.sub(r'(?<=[א-ת])(?=\d)', ' ', s)
    return s
WORDS = re.compile(r'[א-ת]{2,}')


def clean(s):
    return re.sub(r'\s+', ' ', re.sub('[‪-‮‎‏]', '', s)).strip()


def fix_paren_lists(s):
    """רשימת מספרים בסוגריים שיצאה הפוכה: "( )229 ,228ושני" → "(228, 229) ושני";  "(,230 .)231" → "(230, 231).";
    "( ).556 ,555" → "(555, 556)."."""
    def rev(m):
        # הסדר יצא הפוך או מעורבב — מספרי הקווים במסמך רשומים בסדר עולה, אז מסדרים מספרית
        nums = sorted({x.strip() for x in m.group(3).split(',')}, key=lambda x: int(x))
        return '(' + ', '.join(nums) + ')' + (m.group(1) or m.group(2) or '') + ' '
    s = re.sub(r'\(\s*([.;,]?)\s*\)\s*([.;,]?)\s*((?:\d+\s*,\s*)+\d+)(?=[\sא-ת]|$)', rev, s)
    s = re.sub(r'\(\s*,\s*(\d+)\s*([.,;]?)\s*\)\s*(\d+)(?=[\sא-ת]|$)', r'(\1, \3)\2 ', s)
    return s


def fix_parens(s):
    """pdftotext מוציא סוגריים הפוכים סביב מספרים: ")10014( 14" → "(10014) 14";
    ברשימות: "מעלה אדומים ( ,)209בית אל (,)269" → "מעלה אדומים (209), בית אל (269),"."""
    s = re.sub(r'\)\s*(\d{4,6})\s*\(', r'(\1)', s)
    s = fix_paren_lists(s)
    s = re.sub(r'\(\s*([,.;]?)\s*\)(\d+)(?=[\sא-ת]|$)', r'(\2)\1 ', s)
    s = re.sub(r'\s+([,.;])', r'\1', re.sub(r'\s{2,}', ' ', s))       # "בנוסף ,קו" → "בנוסף,קו"
    s = re.sub(r'([,.;])(?=[א-ת(])', r'\1 ', s)                          # "בנוסף,קו" → "בנוסף, קו"
    # "468ממודיעין" → "468 ממודיעין"; "11מ"א" → "11 מ"א"; "50009ו(" → "50009 ו("; אבל סיומת קו ("6א", "6ו'") נשארת דבוקה
    s = re.sub(r"(\d)(?=[א-ת](?![\s,;.)'׳]|$))", r'\1 ', s)
    return rebuild_line_list(fix_makat_pairs(tidy_quote(s)))


def fix_makat_pairs(s):
    """pdftotext הופך "80 (12080)" ל-"(12080) 80". מחזירים לסדר של המסמך — מספר הקו ואחריו המק"ט בסוגריים —
    רק כשהמק"ט באמת שייך למספר (3 הספרות האחרונות של המק"ט הן מספר הקו: 12080 → 80, 10787 → 787)."""
    def fits(mk, num):
        digits = re.sub(r'\D', '', num)
        return bool(digits) and int(mk[2:]) == int(digits)

    def swap_punct(m):
        # "של קו, (10006) 6 חלופה" — הפסיק שאחרי מילה שייך לסוף הזוג: "של קו 6 (10006), חלופה"
        punct, mk, num = m.group(1), m.group(2), m.group(3)
        return f' {num} ({mk}){punct} ' if fits(mk, num) else m.group(0)

    def swap(m):
        mk, num = m.group(1), m.group(2)
        return f'{num} ({mk})' if fits(mk, num) else m.group(0)
    s = re.sub(r'(?<=[א-ת])\s*([,.;])\s*\(\s*(\d{5})\s*\)\s*(N?\d{1,3}[א-ת]?)(?![\d(])', swap_punct, s)
    s = re.sub(r'\(\s*(\d{5})\s*\)\s*,?\s*(N?\d{1,3}[א-ת]?)(?![\d(])', swap, s)
    return re.sub(r'\s+([,.;])', r'\1', re.sub(r'\s{2,}', ' ', s)).strip()


LIST_CHARS = re.compile(r'^(?:[\d\s(),.:;\-–]|(?<=\d)[א-ת]|ו(?=[\-–]))*$')


def rebuild_line_list(s):
    """רשימת קווים עם מק"טים שיצאה הפוכה ושבורה מ-pdftotext (חיפה, סעיף 34.5):
    "קווי תלמידים86, (24085) 85, … 80 : (, (10787) 787, … 87,)43086. (10789) 789, (10788) 788"
    → "קווי תלמידים: 80 (12080), 81 (11081), …, 788 (10788) ו-789 (10789)."
    רק כשהטקסט הוא כותרת קצרה ואחריה רשימה בלבד, וכל מק"ט מתאים למספר קו ברשימה; אחרת לא נוגעים."""
    m = re.match(r'^\s*(?P<pre>[^\d()]*[א-ת][^\d()]*?)\s*:?\s*(?P<rest>[\d(].*)$', s, re.S)
    if not m or not LIST_CHARS.match(m.group('rest')):
        return s
    rest = m.group('rest')
    makats = re.findall(r'(?<!\d)(\d{5})(?!\d)', rest)
    nums = re.findall(r'(?<![\d(])(N?\d{1,3}[א-ת]?)(?![\d)])', re.sub(r'\d{5}', ' ', rest))
    if len(makats) < 2 or len(makats) != len(nums):
        return s
    by_num = {}
    for n in nums:
        by_num.setdefault(int(re.sub(r'\D', '', n)), []).append(n)
    pairs = []
    for mk in makats:
        key = int(mk[2:])
        if not by_num.get(key):
            return s
        pairs.append((key, by_num[key].pop(0), mk))
    if any(v for v in by_num.values()):
        return s
    items = [f'{n} ({mk})' for _, n, mk in sorted(set(pairs))]
    pre = m.group('pre').strip(' :')
    sep = ' ' if re.search(r'קו(?:וים)?$', pre) else ': '
    body = ', '.join(items[:-1]) + ' ו-' + items[-1] if len(items) > 1 else items[0]
    return f'{pre}{sep}{body}.'


BULLETS = '•▪●◦■□➢➤►'


def tidy_quote(s):
    """ניקוי נוסף לציטוטים מהמכרזים הישנים (pdftotext על PDF מ-2014): תבליטים, מקף שקפץ לפני המספר,
    נקודה שנדדה, סוגריים הפוכים סביב מספר ומילה, רשימת מספרים שיצאה הפוכה.
    "• קו – 3 שינוי במסלול." → "קו 3 – שינוי במסלול.";  "קו ) 11 מ"א אשכול( –" → "קו 11 (מ"א אשכול) –";
    "ב4- קווים חדשים 66,64,62:ו.164-" → "ב-4 קווים חדשים 62, 64, 66 ו-164.";  "ישונה ל,65-הקו" → "ישונה ל-65, הקו";
    "בקו.28" → "בקו 28."."""
    s = re.sub('[' + BULLETS + ']', ' ', s)
    s = re.sub(r'\b(קו|קווים)\s*\)\s*(\d+[א-ת]?)\s+([^()\d]{2,30}?)\s*\(', r'\1 \2 (\3)', s)
    s = re.sub(r'\)([^().]{3,60}?)\.\s*\((\d{1,3})(?=\s[א-ת])', r'(\1 \2).', s)   # ")היישוב מקבל שירות בקו. (14 חלופות" → "(היישוב מקבל שירות בקו 14). חלופות"
    s = re.sub(r'(?<=[א-ת]\s)\)\s*\(\s*(\d+)(?=[\sא-ת]|$)', r'(\1)', s)           # "לנתיבות ) (55 והיישוב" → "לנתיבות (55) והיישוב"
    s = re.sub(r'\b(קו|קווים)\s*[–\-]\s*(\d+[א-ת]?)\s+(?=[א-ת])', r'\1 \2 – ', s)
    s = re.sub(r'\bו\s*[–\-]\s*(\d+)-(?=[א-ת])', r'ו-\1 – ', s)                   # "ו – 35-חלופות" → "ו-35 – חלופות"
    # "10 :ו.12-אחד" → "10 ו-12. אחד";  חיפה: "(10006) 6ו. (10016) 16-" → "(10006) 6 ו-(10016) 16."
    s = re.sub(r'\s*:?\s*(?<![א-ת])ו\s*\.\s*(?:\((\d{4,6})\)\s*)?(\d+[א-ת]?)-?(?=\s|$|[א-ת])',
               lambda m: ' ו-' + (f'({m.group(1)}) ' if m.group(1) else '') + m.group(2) + '. ', s)
    s = re.sub(r'\b([בלמכה])(\d+)-\s+', r'\1-\2 ', s)                             # "ב4- קווים" → "ב-4 קווים"
    s = re.sub(r'\b([בלמכה]),(\d+)-(?=[א-ת])', r'\1-\2, ', s)                      # "ל,65-הקו" → "ל-65, הקו"
    # "בקו.28" → "בקו 28.";  "לקווים.573,561,571" → "לקווים 561, 571, 573."
    s = re.sub(r'([א-ת])\.((?:\d{1,3}\s*,\s*)*\d{1,3})(?=\s|$)',
               lambda m: m.group(1) + ' ' + ', '.join(sorted({x.strip() for x in m.group(2).split(',')}, key=int)) + '.', s)
    s = re.sub(r'\b((?:\d+,)+\d+)\b(?=\s*ו-\d)', lambda m: ', '.join(sorted(set(m.group(1).split(',')), key=int)), s)
    s = re.sub(r'\s+:(?=\S)', ': ', s)                                              # "הבאות :קו 30" → "הבאות: קו 30"
    s = re.sub(r'\s+([,.;])', r'\1', re.sub(r'\s{2,}', ' ', s)).strip()
    return re.sub(r'^[\-–—:]\s*', '', s)


def tags_in(text):
    neg = NEG.search(text)
    stripped = NEG.sub(' ', text)
    tags = [name for name, pat in TAGS if re.search(pat, stripped)]
    if neg:
        tags.append('ללא שינוי')
    return tags


def numbers_in(segment):
    """מק"טים (5 ספרות) ומספרי קווים מתוך קטע מספרי; מספרי סעיפים (34.1) ושנים אינם קווים."""
    seg = re.sub(r'\d{1,2}(?:\.\d{1,2}){1,3}', ' ', segment)   # 34.1.2
    seg = re.sub(r'\d{6,}', ' ', seg)                          # מספר של 6 ספרות ומעלה אינו קו ואינו מק"ט
    makats = re.findall(MAKAT, seg)
    seg2 = re.sub(MAKAT, ' ', seg)
    nums = [n for n in re.findall(r'(?<![\dא-ת])' + NUM, seg2) if not re.fullmatch(r'(?:19|20)\d\d', n)]
    return nums, makats


STRONG = {'קו חדש', 'ביטול', 'שינוי מסלול', 'שינוי תדירות', 'הארכה', 'קיצור', 'שינוי מספר', 'איחוד', 'פיצול', 'שינוי'}
# סעיפים שכל פריט בהם הוא שינוי (גם בלי מילת שינוי בטקסט)
CHANGE_SECTIONS = {'קווים חדשים', 'שינויים בקווים קיימים', 'שינויים בקווים', 'קווים מבוטלים', 'קווים שיבוטלו', 'ביטול קווים'}
# סעיפים שמתארים את הקווים (לילה/תלמידים) — נשמרות הערות הסעיף, אבל פריט נחשב שינוי רק עם מילת שינוי
NOTE_SECTIONS = CHANGE_SECTIONS | {'קווי לילה', 'קווי תלמידים', 'חלופות תלמידים'}
NOTE_BUDGET = 6     # כמה שורות אחרי כותרת סעיף נשמרות כהערת סעיף


def header_of(line):
    """כותרת סעיף: שם הסעיף לבדו, או עם מספר סעיף (34.1), או עם המשך אחרי קו מפריד.
    משפט שרק מתחיל במילים "קווים חדשים שלא הופעלו עד כה…" אינו כותרת."""
    if not any(s in line for s in SECTION_WORDS):   # בדיקה זולה לפני הביטוי הרגולרי
        return None
    m = HEADER.match(line)
    if not m:
        return None
    rest = clean(m['rest'] or '')
    numbered = bool(re.match(r'^\s*' + SEC_NUM_DOTTED + r'\s*\S', line)) or bool(re.search(r'\s' + SEC_NUM + r'\s*$', line))
    if rest and not (numbered or re.match(r'^[–\-:]', rest)):
        return None
    if not rest and not numbered and len(line.strip()) > 45:
        return None
    name = m['h']
    # המשך של שם הכותרת ("שינויים שבוצעו בקווי האשכול הקיימים היום") אינו הערה; הערה מתחילה בקו מפריד
    if rest and not re.match(r'^[–\-:]', rest):
        rest = ''
    for s, cat in SECTIONS:
        if s == name:
            return name, cat, rest.lstrip('–-: ').strip(), numbered
    return None


# כותרת עיר בתוך סעיף השינויים (מכרזי 2014: "אשקלון:" ואחריה תבליטים) — הקווים שאחריה שייכים לעיר
CITY_HEAD = re.compile(r'^\s*(?P<c>[א-ת][א-ת"׳\'.\- ]{1,24}):\s*$')
# תת-סעיף לפי סוג קו: "34.1.2 שינויים במסלול הקווים האזוריים" / "34.1.4 קווים עירוניים חדשים"
KIND_HEAD = re.compile(r'^\s*\d+(?:\.\d+)*\s*(?:שינויים במסלול הקווים ה?(?P<k>עירוניים|אזוריים|בינעירוניים|בין-עירוניים)|קווים ה?(?P<kn>עירוניים|אזוריים|בינעירוניים|בין-עירוניים) חדשים)\s*$')
KIND_MAP = {'עירוניים': 'עירוני', 'אזוריים': 'אזורי', 'בינעירוניים': 'בינעירוני', 'בין-עירוניים': 'בינעירוני'}


def items_of(text, section=None, state=None):
    """חלוקת עמוד לפריטים: [{'lines': [...], 'kind': 'line'|'category'|'note', 'section': שם, 'city', 'kind'}].
    section — הסעיף שבו העמוד הקודם נגמר (רשימה שנמשכת לעמוד הבא). מחזיר גם את הסעיף בסוף העמוד.
    state — {'city', 'lineKind'}: העיר וסוג הקו של הכותרות האחרונות (נמשכים לעמוד הבא)."""
    out = []
    cur = None
    note = None         # הערת סעיף פתוחה — שורות עוקבות מצטרפות לפסקה אחת
    budget = 0          # הערות סעיף נשמרות רק בעמוד הכותרת, ורק כמה שורות אחריה
    state = state if state is not None else {}

    def close():
        nonlocal cur
        if cur:
            out.append(cur)
            cur = None

    for raw in text.split('\n'):
        line = raw.rstrip()
        if not line.strip():
            close()
            note = None
            continue
        kh = KIND_HEAD.match(line)
        if kh:
            close()
            section = 'קווים חדשים' if kh.group('kn') else 'שינויים בקווים קיימים'
            budget = NOTE_BUDGET
            note = None
            state['lineKind'] = KIND_MAP[kh.group('k') or kh.group('kn')]
            state['city'] = None
            continue
        ch = CITY_HEAD.match(line)
        if ch and 'קו' not in line and len(ch.group('c').split()) <= 3:
            close()
            note = None
            state['city'] = clean(ch.group('c'))
            continue
        h = header_of(line)
        if h:
            close()
            section = h[0]
            budget = NOTE_BUDGET
            note = None
            state['city'] = None
            state['lineKind'] = None
            if h[2] and len(h[2]) > 8:
                note = {'kind': 'note', 'section': section, 'lines': [h[2]], 'numbered': h[3]}
                out.append(note)
            continue
        # כותרת רצה של חלק במסמך ("חלק ד' – מפרט טכני") — לא תוכן; חלק אחר (חלק ה', נספח) מסיים את הסעיף
        if re.match(r"^\s*(?:חלק [א-ת]['׳]|נספח [א-ת]{1,3}['׳]?\s*[–\-:])", line):
            if 'מפרט טכני' in line:
                continue
            if cur:
                out.append(cur)
                cur = None
            section = None
            continue
        is_bullet = bool(BULLET.search(line))
        cat = CATEGORY.match(line) if ':' in line and 'קו' in line else None
        starts = 'קו' in line and bool(LINE_START.match(line))
        if cat and (is_bullet or re.search(r'\d', cat['rest'])):
            close()
            cur = {'kind': 'category', 'section': section, 'category': clean(cat['cat']), 'lines': [line.strip()],
                   'city': state.get('city'), 'lineKind': state.get('lineKind')}
            note = None
        elif is_bullet or starts:
            close()
            cur = {'kind': 'line', 'section': section, 'lines': [line.strip()], 'city': state.get('city'), 'lineKind': state.get('lineKind')}
            note = None
        elif cur:
            cur['lines'].append(line.strip())
        elif section in NOTE_SECTIONS and budget > 0:
            # טקסט תחת כותרת סעיף בלי תבליט — הערת סעיף ("המכרז לא כולל קווים חדשים.");
            # שורות עוקבות מצטרפות לאותה פסקה
            if note is not None and note['section'] == section:
                note['lines'].append(line.strip())
            else:
                note = {'kind': 'note', 'section': section, 'lines': [line.strip()]}
                out.append(note)
            budget -= 1
    if cur:
        out.append(cur)
    return out, section


SECTION_TAG = {s: c for s, c in SECTIONS if c in ('קו חדש', 'ביטול', 'שינוי')}
# סעיפים שמתארים סוג של קווים: הפסקה שמונה אותם נצמדת לקווים בטבלה עם התגית הזאת
DESCRIBE_SECTIONS = {'קווי לילה': 'קו לילה', 'קווי תלמידים': 'קו תלמידים', 'חלופות תלמידים': 'קו תלמידים'}
DESCRIBED = re.compile(r'\((?P<p>\d{1,3}[א-ת]?(?:\s*,\s*\d{1,3}[א-ת]?)*)\)|(?:קו|קווים|וקו)\s+(?P<k>\d{1,4}[א-ת]?)(?![\d.])')


def described_numbers(text):
    """מספרי הקווים בפסקה שמונה קווים: "מעלה אדומים (209), בית אל (269) … קו 468" → ['209', '269', '468'];
    גם רשימה בסוגריים "(228, 229)". לא "5 קווי לילה" (הכמות), לא שנים ולא מספרי סעיפים."""
    out = []
    for m in DESCRIBED.finditer(text):
        for n in re.split(r'\s*,\s*', m.group('p') or m.group('k')):
            if n and n not in out:
                out.append(n)
    return out


def analyze_item(item):
    first = split_glued(item['lines'][0])
    text = clean(' '.join(item['lines']))
    if item['kind'] == 'category':
        # רשימת קטגוריה היא מספרים בלבד, גם בשורות ההמשך ("… 36 (10036), 38 (10038) ו-76 (10076)")
        nums, makats = numbers_in(split_glued(' '.join(item['lines'])))
        base = tags_in(item['category']) or tags_in(first)
    else:
        m = HEAD_TAIL.search(first)
        nums, makats = numbers_in(m['nums']) if m else ([], [])
        base = tags_in(text)
    sec_tag = SECTION_TAG.get(item['section'])
    tags = list(dict.fromkeys(base + ([sec_tag] if sec_tag and sec_tag not in ('כללי', 'שינוי') and sec_tag not in base else [])))
    if sec_tag == 'שינוי' and not tags:
        tags = ['שינוי']
    return nums, makats, tags, fix_parens(text)


def scan_units(units, url, sha, doc_name):
    """סריקת מסמך אחד. הסעיף נמשך מעמוד לעמוד (רשימת שינויים שממשיכה בעמוד הבא).
    פריט נשמר רק כשיש בו מספר קו או מק"ט, ותגית של שינוי ממש (לא "חלופה" לבדה),
    או כשהוא בתוך סעיף שינויים. עמודים של נספחי נהלים (טבלת "סוג השינוי") לא נסרקים."""
    found, notes = [], []
    section = None
    state = {'city': None, 'lineKind': None}
    for u in units:
        text = u.get('text') or ''
        if not text or u.get('rows'):
            continue
        page = u.get('page')
        head = text[:400]
        if 'נוהל' in head and ('שם ההוראה' in head or 'מספר הוראה' in head):
            section = None
            continue
        if section is None:
            state = {'city': None, 'lineKind': None}
        items, next_section = items_of(text, section, state)
        page_items = 0
        for item in items:
            if item['kind'] == 'note':
                q = fix_parens(clean(' '.join(item['lines'])))
                if len(q) >= 12 and re.search('[א-ת]', q):
                    # פסקה על קווי לילה/תלמידים שמונה קווים ("מעלה אדומים (209), בית אל (269)… קו 468") — נצמדת לקווים
                    # עצמם בטבלה (תגית "קו לילה") במקום להופיע כפסקה נפרדת (שלמה 16.09: "שזה יופיע רק בטבלה")
                    kind_tag = DESCRIBE_SECTIONS.get(item['section'])
                    nums = described_numbers(q) if kind_tag else []
                    if nums:
                        found.append({'numbers': nums, 'makats': [], 'tags': [kind_tag], 'section': item['section'], 'quote': q[:900],
                                      'page': page, 'url': f'{url}#page={page}', 'sha256': sha, 'doc': doc_name})
                        page_items += 1
                    else:
                        notes.append({'section': item['section'], 'quote': q[:600], 'page': page, 'url': f'{url}#page={page}', 'sha256': sha, 'doc': doc_name})
                continue
            nums, makats, tags, quote = analyze_item(item)
            if not (nums or makats) or not tags or len(quote) < 8:
                continue
            in_section = item['section'] in CHANGE_SECTIONS
            if not in_section and not (set(tags) & STRONG):
                continue
            page_items += 1
            entry = {'numbers': nums, 'makats': makats, 'tags': tags, 'section': item['section'], 'quote': quote[:900],
                     'page': page, 'url': f'{url}#page={page}', 'sha256': sha, 'doc': doc_name}
            # עיר/אזור וסוג קו — כדי שציטוט על "קו 11" יוצמד לקו 11 הנכון כשאותו מספר משמש כמה ערים (צפון הנגב)
            city = item.get('city')
            if not city:
                m_area = re.search(r'\((מ\.?"?א\.?\s*[א-ת]+(?:\s+[א-ת]+)?)\)', quote)
                city = m_area.group(1) if m_area else None
            if city:
                entry['city'] = city
            if item.get('lineKind'):
                entry['kind'] = item['lineKind']
            found.append(entry)
        # הסעיף נמשך לעמוד הבא רק אם בעמוד הזה עדיין היו פריטים ברשימה (רשימה שנקטעה בסוף עמוד)
        section = next_section if page_items else None
    return found, notes


def doc_name_of(url):
    return urllib.parse.unquote(url.rstrip('/').split('/')[-1])


def dedupe(items, key):
    seen, out = set(), []
    for it in items:
        k = key(it)
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out


def quote_brief(quote, max_len=240):
    """המשפט הראשון של הציטוט + משפט שמדבר על מה שעשוי להשתנות (ייתכן/יורה/רשאי), במילים פשוטות."""
    from tender_sections import tidy, simplify, sentences, BOILER
    sents = [x for x in sentences(tidy(quote)) if len(x) > 8]
    if not sents:
        return ''
    lead = next((x for x in sents if not BOILER.match(simplify(x))), sents[0])
    out = [simplify(lead)]
    extra = next((x for x in sents if x is not lead and re.search(r'ייתכן|יורה|רשאי|יכול|צפוי|מתוכנן|יבוטל|ישונה|יופעל', x)), None)
    if extra:
        out.append(simplify(extra))
    text = ' '.join(x for x in out if x)
    if len(text) > max_len:
        text = text[:max_len].rsplit(' ', 1)[0].rstrip(' ,;:-–') + '…'
    return text


def main():
    index = json.load(open(TEXT / 'index.json', encoding='utf-8'))['documents'] if (TEXT / 'index.json').exists() else {}
    packages = json.load(open(ROOT / 'packages-state.json', encoding='utf-8'))['tenders'] if (ROOT / 'packages-state.json').exists() else {}
    current = {d['sha256'] for t in packages.values() for d in t.get('documents', {}).values() if d.get('sha256')}
    # אותו קובץ יכול להשתייך לכמה מכרזים (אשכולות המוניות בנתניה) — הציטוטים נרשמים לכל אחד מהם
    sha_tenders = {}
    for tid, t in packages.items():
        for d in t.get('documents', {}).values():
            if d.get('sha256'):
                sha_tenders.setdefault(d['sha256'], set()).add(tid)
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}, 'sections': {}}
    n = 0
    for path in sorted(TEXT.glob('*.json.gz')):
        sha = path.name.split('.')[0]
        meta = index.get(sha)
        if not meta or (current and sha not in current):
            continue
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            payload = json.load(f)
        found, notes = scan_units(payload['units'], payload['url'], sha, doc_name_of(payload['url']))
        for tid in (sha_tenders.get(sha) or {meta['tender']}):
            if found:
                result['tenders'].setdefault(tid, []).extend(found)
                n += len(found)
            if notes:
                result['sections'].setdefault(tid, []).extend(notes)
    for tid in list(result['tenders']):
        result['tenders'][tid] = dedupe(result['tenders'][tid], lambda it: (it['quote'], tuple(it['numbers'])))
    for tid in list(result['sections']):
        result['sections'][tid] = dedupe(result['sections'][tid], lambda it: (it['section'], it['quote']))
    # "בקצרה" לכל ציטוט: המשפט שאומר מה קורה, במילים פשוטות (הציטוט המלא נשמר כפי שהוא)
    for coll in (result['tenders'], result['sections']):
        for items in coll.values():
            for it in items:
                it['brief'] = quote_brief(it['quote'])
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    tmp.replace(OUT)
    print(f'שינויי קווים: {n} ציטוטים ב-{len(result["tenders"])} מכרזים · הערות סעיף: {sum(len(v) for v in result["sections"].values())}', flush=True)


if __name__ == '__main__':
    main()
