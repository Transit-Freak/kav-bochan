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

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
TEXT = ROOT / 'text'
OUT = ROOT / 'line-changes.json'

# מספר קו: עד 4 ספרות (אופציונלי N ללילה) ואות עברית אחת רק אם אינה תחילת מילה ("6א" כן, "13הינו" לא);
# ו' דבוקה היא ו' החיבור ("6ו-16") אלא אם אחריה גרש
NUM = r"N?\d{1,4}(?:[א-הז-ת](?![א-ת])|ו(?=['׳]))?"
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
HEAD_TAIL = re.compile(r'(?:קו|קווים|לקו|לקווים)\s*[:–\-]?\s*(?P<nums>(?:[\(\)\s,.–\-\']|N?\d+[א-ת]?|ו(?=[\s\-–\)\(\d])|מק"ט|מק״ט|מקט)+)')
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


def fix_parens(s):
    """pdftotext מוציא סוגריים הפוכים סביב מספרים: ")10014( 14" → "(10014) 14"."""
    return re.sub(r'\)\s*(\d{4,6})\s*\(', r'(\1)', s)


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


def items_of(text, section=None):
    """חלוקת עמוד לפריטים: [{'lines': [...], 'kind': 'line'|'category'|'note', 'section': שם}].
    section — הסעיף שבו העמוד הקודם נגמר (רשימה שנמשכת לעמוד הבא). מחזיר גם את הסעיף בסוף העמוד."""
    out = []
    cur = None
    note = None         # הערת סעיף פתוחה — שורות עוקבות מצטרפות לפסקה אחת
    budget = 0          # הערות סעיף נשמרות רק בעמוד הכותרת, ורק כמה שורות אחריה
    for raw in text.split('\n'):
        line = raw.rstrip()
        if not line.strip():
            if cur:
                out.append(cur)
                cur = None
            note = None
            continue
        h = header_of(line)
        if h:
            if cur:
                out.append(cur)
                cur = None
            section = h[0]
            budget = NOTE_BUDGET
            note = None
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
            if cur:
                out.append(cur)
            cur = {'kind': 'category', 'section': section, 'category': clean(cat['cat']), 'lines': [line.strip()]}
            note = None
        elif is_bullet or starts:
            if cur:
                out.append(cur)
            cur = {'kind': 'line', 'section': section, 'lines': [line.strip()]}
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
    for u in units:
        text = u.get('text') or ''
        if not text or u.get('rows'):
            continue
        page = u.get('page')
        head = text[:400]
        if 'נוהל' in head and ('שם ההוראה' in head or 'מספר הוראה' in head):
            section = None
            continue
        items, next_section = items_of(text, section)
        page_items = 0
        for item in items:
            if item['kind'] == 'note':
                q = fix_parens(clean(' '.join(item['lines'])))
                if len(q) >= 12 and re.search('[א-ת]', q):
                    notes.append({'section': item['section'], 'quote': q[:600], 'page': page, 'url': f'{url}#page={page}', 'sha256': sha, 'doc': doc_name})
                continue
            nums, makats, tags, quote = analyze_item(item)
            if not (nums or makats) or not tags or len(quote) < 8:
                continue
            in_section = item['section'] in CHANGE_SECTIONS
            if not in_section and not (set(tags) & STRONG):
                continue
            page_items += 1
            found.append({'numbers': nums, 'makats': makats, 'tags': tags, 'section': item['section'], 'quote': quote[:900],
                          'page': page, 'url': f'{url}#page={page}', 'sha256': sha, 'doc': doc_name})
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


def main():
    index = json.load(open(TEXT / 'index.json', encoding='utf-8'))['documents'] if (TEXT / 'index.json').exists() else {}
    packages = json.load(open(ROOT / 'packages-state.json', encoding='utf-8'))['tenders'] if (ROOT / 'packages-state.json').exists() else {}
    current = {d['sha256'] for t in packages.values() for d in t.get('documents', {}).values() if d.get('sha256')}
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
        if found:
            result['tenders'].setdefault(meta['tender'], []).extend(found)
            n += len(found)
        if notes:
            result['sections'].setdefault(meta['tender'], []).extend(notes)
    for tid in list(result['tenders']):
        result['tenders'][tid] = dedupe(result['tenders'][tid], lambda it: (it['quote'], tuple(it['numbers'])))
    for tid in list(result['sections']):
        result['sections'][tid] = dedupe(result['sections'][tid], lambda it: (it['section'], it['quote']))
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    tmp.replace(OUT)
    print(f'שינויי קווים: {n} ציטוטים ב-{len(result["tenders"])} מכרזים · הערות סעיף: {sum(len(v) for v in result["sections"].values())}', flush=True)


if __name__ == '__main__':
    main()
