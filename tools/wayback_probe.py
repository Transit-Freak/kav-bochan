"""זמני: איתור "נספח ב' — מפרטי הקווים" של מכרזי מוניות השירות (2018–2019) במינהל הרכש.
1. CDX: כל הקבצים מ-mr.gov.il/ilgstorefront/he/p/attachment/ שנשמרו בארכיון האינטרנט (בקשה אחת).
2. הורדה ממינהל הרכש עצמו (בקצב איטי), חילוץ טקסט, ושמירה רק של מסמכים שמזכירים מוניות שירות.
3. כתבות מקומיות על קווי הרפורמה ברחובות (HTML)."""
import json, os, re, subprocess, time, urllib.parse, urllib.request
UA = 'Mozilla/5.0 (X11; Linux x86_64) kav-bochan-research'
OUT = 'out'; os.makedirs(OUT, exist_ok=True)
def get(u, t=120):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=t) as r:
            return r.read(), r.headers.get('Content-Type', '')
    except Exception as e:  # noqa: BLE001
        print('ERR', str(e)[:80], u[:120], flush=True); return None, ''
for i, u in enumerate(['https://www.be106.net/233/29262', 'https://rehovot.mynet.co.il/local_news/article/m_301238',
                       'https://www.be106.net/280/29283', 'https://rishon.mynet.co.il/local_news/article/m_301291']):
    b, ct = get(u, 60)
    if b: open(f'{OUT}/article-{i}.html', 'wb').write(b); print('article', u, len(b))
    time.sleep(2)
q = {'url': 'mr.gov.il/ilgstorefront/he/p/attachment/', 'matchType': 'prefix', 'collapse': 'urlkey', 'limit': '20000',
     'filter': 'statuscode:200'}
b, _ = get('https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode(q), 300)
rows = [l.split(' ') for l in (b or b'').decode('utf-8', 'replace').splitlines()]
rows = [r for r in rows if len(r) >= 7 and ('pdf' in r[3] or 'word' in r[3] or 'zip' in r[3])]
print('CDX attachments (pdf/docx/zip):', len(rows), flush=True)
MAX = int(os.environ.get('MAXF', '400'))
kept = []
for n, r in enumerate(rows[:MAX]):
    url = r[2]
    b, ct = get(url, 120)
    time.sleep(1.5)
    if not b:
        continue
    ext = '.pdf' if b[:4] == b'%PDF' else '.docx' if b[:2] == b'PK' else '.bin'
    p = f'/tmp/f{n}{ext}'; open(p, 'wb').write(b)
    txt = ''
    try:
        if ext == '.pdf':
            txt = subprocess.run(['pdftotext', '-l', '40', p, '-'], capture_output=True, timeout=120).stdout.decode('utf-8', 'replace')
        elif ext == '.docx':
            txt = subprocess.run(['unzip', '-p', p, 'word/document.xml'], capture_output=True, timeout=60).stdout.decode('utf-8', 'replace')
    except Exception:  # noqa: BLE001
        pass
    hit = len(re.findall('מוניות שירות|מונית שירות|קווי שירות במוניות', txt))
    if hit:
        name = f'{OUT}/{n:04d}-{hit}{ext}'
        os.replace(p, name); kept.append({'f': name, 'url': url, 'hits': hit, 'size': len(b),
                                          'head': re.sub(r'\s+', ' ', txt[:300])})
        print('KEEP', name, hit, len(b), re.sub(r'\s+', ' ', txt[:160]), flush=True)
    else:
        os.remove(p)
json.dump(kept, open(f'{OUT}/kept.json', 'w'), ensure_ascii=False, indent=1)
print('checked', min(len(rows), MAX), 'kept', len(kept))
