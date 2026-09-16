"""מה המכרז אומר על כל קו — ציטוטים מילה במילה, בלי מודל שפה.

מסמכי המכרז (הטקסט השמור ב-tenders/text) נסרקים לפסקאות שמתחילות ב"קו 199"
או "קווים 4 ו-N4" וכוללות מילים של שינוי: קו חדש, ביטול, שינוי מסלול, שינוי
תדירות, הארכה, קיצור, שינוי מספר, איחוד, פיצול. כל פסקה כזאת נשמרת כמו שהיא,
עם מספרי הקווים שבראשה, התגיות שנמצאו בה, העמוד והקישור למסמך.

זה לא סיכום ולא פרשנות: האתר מציג את הפסקה עצמה. מה שלא מנוסח כפסקה של קו
(למשל טבלת שינויים) לא יופיע כאן, וזה נאמר בגלוי בעמוד.

הפלט: tenders/line-changes.json
{ "updated": ..., "tenders": { tid: [ {"numbers": ["199"], "tags": ["קו חדש"],
    "quote": "...", "page": 66, "url": "...#page=66", "sha256": ..., "doc": "מסמכי הליך"} ] } }
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

TAGS = [
    ('קו חדש', r'קו חדש|קווים חדשים|קו\s+\S+\s+חדש|יופעל קו|הפעלת קו חדש|תופעל'),
    ('ביטול', r'יבוטל|יבוטלו|תבוטל|ביטול הקו|ביטול קו|ביטול הקווים|מבוטל|בוטל'),
    ('שינוי מסלול', r'שינוי מסלול|שינוי במסלול|שינויי מסלול|ישונה מסלול|המסלול ישונה|מסלולו ישונה|יעבור דרך|לא יעבור|ייסע דרך|יסע דרך|מסלול חדש|במקום .{0,40}?ייסע|יוסט'),
    ('שינוי תדירות', r'תדירות|תדירויות|תגבור|תוגבר|יתוגבר|תוספת נסיעות|הפחתת נסיעות'),
    ('הארכה', r'יוארך|תוארך|הארכת הקו|הארכת המסלול|הארכה'),
    ('קיצור', r'יקוצר|תקוצר|קיצור המסלול|קיצור הקו|קיצור'),
    ('שינוי מספר', r'ישונה מספרו|מספרו ישונה|מספר הקו ישונה|יקבל את המספר|ימוספר|מספר חדש|במקום קו'),
    ('איחוד', r'יאוחד|יאוחדו|איחוד'),
    ('פיצול', r'יפוצל|יפוצלו|פיצול'),
    ('חלופה', r'חלופה|חלופת|חלופות'),
]
NUM = r'N?\d{1,4}[א-ת]?'
# תחילת פסקה של קו: "קו 199", "קו 4 ו-N4", "קווים 18 ו־N18", "קו 144:" (גם אחרי מספור סעיף)
HEAD = re.compile(r'^\s*(?:\d+(?:\.\d+)*\s+)?(?:קו|קווים|לקו|לקווים)\s+(' + NUM + r'(?:\s*(?:,|ו-|ו־|ו|,\s*ו-)\s*' + NUM + r')*)\s*[:\-–—]?\s*(.*)$')
# שינוי שמתייחס לקו באמצע משפט: "ביטול קו 19", "קו 217 יבוטל"
INLINE = re.compile(r'(?:ביטול|יבוטל|יבוטלו|תבוטל)\s+(?:של\s+)?(?:הקו|קו|הקווים|קווים)\s+(' + NUM + r'(?:\s*(?:,|ו-|ו־|ו)\s*' + NUM + r')*)|(?:הקו|קו)\s+(' + NUM + r')\s+(?:יבוטל|תבוטל|יוארך|יקוצר|יאוחד|יפוצל)')


def numbers(s):
    return re.findall(NUM, s)


def clean(s):
    return re.sub(r'\s+', ' ', re.sub('[‪-‮‎‏]', '', s)).strip()


def paragraphs(text):
    """פסקאות לפי שורות: פסקה מתחילה בשורת "קו …" ונמשכת עד שורה ריקה או תחילת פסקה אחרת."""
    out = []
    cur = None
    for raw in text.split('\n'):
        line = raw.rstrip()
        m = HEAD.match(line)
        if m:
            if cur:
                out.append(cur)
            cur = {'numbers': numbers(m[1]), 'lines': [line.strip()]}
            continue
        if cur is None:
            continue
        if not line.strip():
            out.append(cur)
            cur = None
            continue
        cur['lines'].append(line.strip())
    if cur:
        out.append(cur)
    return out


# "ללא שינוי במסלול" אינו שינוי מסלול: הביטוי המשלול מוסר לפני התיוג ומקבל תגית משלו
NEG = re.compile(r'(?:ללא|אין|בלי|לא יהיה|לא יחול|לא)\s+(?:כל\s+)?שינוי(?:ים)?(?:\s+ב?\S+){0,2}|יישאר(?:ו)? (?:ללא שינוי|כפי שה(?:וא|ם) היום)|ימשיך לפעול|ימשיכו לפעול|לא ישונה|לא ישתנה')


def tags_in(text):
    neg = NEG.search(text)
    stripped = NEG.sub(' ', text)
    tags = [name for name, pat in TAGS if re.search(pat, stripped)]
    if neg:
        tags.append('ללא שינוי')
    return tags


def scan_units(units, url, sha, doc_name):
    found = []
    for u in units:
        text = u.get('text') or ''
        if not text or u.get('rows'):
            continue
        page = u.get('page')
        for p in paragraphs(text):
            quote = clean(' '.join(p['lines']))
            tags = tags_in(quote)
            if not tags or len(quote) < 15:
                continue
            found.append({'numbers': p['numbers'], 'tags': tags, 'quote': quote[:900], 'page': page,
                          'url': f'{url}#page={page}', 'sha256': sha, 'doc': doc_name})
        # אזכור בתוך משפט (ביטול קו 19 …) — המשפט השלם כציטוט
        flat = clean(text)
        for m in INLINE.finditer(flat):
            nums = numbers(m[1] or m[2] or '')
            if not nums:
                continue
            start = max(flat.rfind('.', 0, m.start()) + 1, m.start() - 250)
            end = flat.find('.', m.end())
            end = len(flat) if end < 0 else min(end + 1, m.end() + 250)
            quote = flat[start:end].strip()
            # כבר יש פסקה על אותם קווים שמכילה את המשפט — לא צריך פעמיים;
            # אבל משפט על קווים אחרים בתוך פסקה של קו אחר כן נשמר בנפרד
            if any(f['quote'] == quote or (quote in f['quote'] and set(nums) <= set(f['numbers'])) for f in found):
                continue
            found.append({'numbers': nums, 'tags': tags_in(quote), 'quote': quote[:900], 'page': page,
                          'url': f'{url}#page={page}', 'sha256': sha, 'doc': doc_name})
    return found


def doc_name_of(url):
    return urllib.parse.unquote(url.rstrip('/').split('/')[-1])


def main():
    index = json.load(open(TEXT / 'index.json', encoding='utf-8'))['documents'] if (TEXT / 'index.json').exists() else {}
    packages = json.load(open(ROOT / 'packages-state.json', encoding='utf-8'))['tenders'] if (ROOT / 'packages-state.json').exists() else {}
    current = {d['sha256'] for t in packages.values() for d in t.get('documents', {}).values() if d.get('sha256')}
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}}
    n = 0
    for path in sorted(TEXT.glob('*.json.gz')):
        sha = path.name.split('.')[0]
        meta = index.get(sha)
        if not meta or (current and sha not in current):
            continue
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            payload = json.load(f)
        found = scan_units(payload['units'], payload['url'], sha, doc_name_of(payload['url']))
        if found:
            result['tenders'].setdefault(meta['tender'], []).extend(found)
            n += len(found)
    for tid, items in result['tenders'].items():
        seen = set()
        uniq = []
        for it in items:
            k = (it['quote'], tuple(it['numbers']))
            if k in seen:
                continue
            seen.add(k)
            uniq.append(it)
        result['tenders'][tid] = uniq
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    tmp.replace(OUT)
    print(f'שינויי קווים: {n} ציטוטים ב-{len(result["tenders"])} מכרזים', flush=True)


if __name__ == '__main__':
    main()
