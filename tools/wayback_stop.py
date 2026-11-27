"""חיפוש זהיר בארכיון האינטרנט: מתי קווים 301 ו-311 (אשקלון–תל אביב) הפסיקו לעצור בתחנה 14718 (צה"ל/המרכבה, חולון).
CDX על עמודי קווים ותחנה ב-Moovit ובאתרים נוספים, ואז הורדה של כמה צילומים לאורך 2018–2023 ובדיקה אם התחנה מופיעה בהם.
קצב: בקשה כל 6 שניות, לכל היותר ~40 בקשות. הפלט — ללוג בלבד."""
import json, re, time, urllib.request, urllib.parse, urllib.error, html
UA = 'kav-bochan-research/1.0'
GAP = 6
N = 0
MAXN = 40
def get(url):
    global N
    if N >= MAXN:
        return None
    N += 1
    time.sleep(GAP)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, url[:150], flush=True)
        if e.code == 429:
            raise SystemExit('rate limited — stopping')
    except Exception as e:  # noqa: BLE001
        print('ERR', e, url[:150], flush=True)
    return None
def cdx(url, match='prefix', frm='2017', to='2024', extra=None, limit=300):
    q = {'url': url, 'matchType': match, 'from': frm, 'to': to, 'output': 'json', 'limit': str(limit),
         'filter': ['statuscode:200'] + (extra or []), 'collapse': 'timestamp:6'}
    b = get('https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode(q, doseq=True))
    try:
        rows = json.loads(b) if b else []
    except ValueError:
        rows = []
    return [dict(zip(rows[0], r)) for r in rows[1:]] if rows else []
KEYS = re.compile(r'המרכבה|צה["\'״]*ל\s*/\s*המרכבה|14718|Merkava', re.I)
def text(b):
    s = b.decode('utf-8', 'replace')
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    return html.unescape(re.sub(r'(?s)<[^>]+>', ' ', s))
cands = []
for pfx in ['moovitapp.com/index/he/תחבורה_ציבורית-line-301-', 'moovitapp.com/index/he/תחבורה_ציבורית-line-311-',
            'moovitapp.com/index/en/public_transit-line-301-Israel', 'moovitapp.com/index/en/public_transit-line-311-Israel']:
    rows = cdx(pfx, extra=['mimetype:text/html'])
    print('CDX', pfx, len(rows), flush=True)
    for r in rows:
        o = urllib.parse.unquote(r['original'])
        if re.search(r'אשקלון|Ashkelon|Ashqelon', o, re.I):
            cands.append((r['timestamp'], r['original']))
cands.sort()
print('candidates', len(cands), flush=True)
for ts, o in cands[:60]:
    print('  ', ts, urllib.parse.unquote(o)[:160])
# בכל כתובת — צילום אחד לכל שנה, עד שנגמר התקציב
seen = set()
pick = []
for ts, o in cands:
    k = (urllib.parse.unquote(o).split('?')[0], ts[:4])
    if k not in seen:
        seen.add(k); pick.append((ts, o))
for ts, o in pick:
    b = get(f'https://web.archive.org/web/{ts}id_/{o}')
    if not b:
        continue
    t = text(b)
    hits = sorted(set(m.group(0) for m in KEYS.finditer(t)))
    stops = len(re.findall(r'\n', t))
    ctx = [t[max(0, m.start() - 60): m.end() + 60].replace('\n', ' ') for m in KEYS.finditer(t)][:2]
    print('SNAP', ts, urllib.parse.unquote(o)[:110], '| מופיעה:' , bool(hits), hits, ctx, flush=True)
print('requests used', N)
