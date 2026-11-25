"""חיפוש בארכיון האינטרנט (Wayback) אחרי תיאורי מסלול של מוניות שירות, 2013–2019.
שלב 1: CDX — כתובות שמורות באתרי העיריות ומשרד התחבורה שהכתובת שלהן מרמזת על מוניות.
שלב 2: הורדה של עד MAXF עמודים (בקצב איטי), חילוץ טקסט, ושמירת קטעים שמזכירים מוניות שירות.
פלט: wayback-taxi/candidates.json, wayback-taxi/hits.json, wayback-taxi/hits.txt"""
import json, re, time, os, html, urllib.request, urllib.parse, urllib.error
GAP = 4.0   # שניות בין בקשות — כ-15 בדקה, מתחת למגבלה של הארכיון

UA = 'kav-bochan-research/1.0'
OUT = 'wayback-taxi'
MAXF = int(os.environ.get('MAXF', '250'))
T0 = time.time()
BUDGET = int(os.environ.get('BUDGET', '2400'))   # שניות — אחר כך שומרים את מה שיש
DOMAINS = ['mot.gov.il', 'tel-aviv.gov.il', 'haifa.muni.il', 'petah-tikva.muni.il', 'netanya.muni.il',
           'rishonlezion.muni.il', 'ashdod.muni.il', 'rehovot.muni.il', 'jerusalem.muni.il', 'nahariya.muni.il',
           'beer-sheva.muni.il', 'ramat-gan.muni.il', 'bat-yam.muni.il', 'holon.muni.il', 'herzliya.muni.il',
           'kfar-saba.muni.il', 'raanana.muni.il', 'ashkelon.muni.il', 'bnei-brak.muni.il']
KEYS = r'.*([Tt]axi|monit|sherut|share|%D7%9E%D7%95%D7%A0%D7%99%D7%95%D7%AA|%D7%9E%D7%95%D7%A0%D7%99%D7%AA).*'
WORDS = re.compile(r'מוני(?:ו)?ת(?: ה)?שירות|מונית שירות|מוניות שירות|קווי מוניות|תחנת מוניות')


def get(url, tries=2):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            # 429 = מגבלת קצב של הארכיון: מי שממשיך לבקש — נחסם לשעה (ומכפיל). מחכים דקה ומאטים
            if e.code in (429, 503):
                global GAP
                GAP = min(GAP * 2, 30)
                print('rate limited, gap', GAP, flush=True)
                time.sleep(70)
            else:
                time.sleep(5 * (i + 1))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(5 * (i + 1))
    print('fail', url, last, flush=True)
    return None


def cdx(domain):
    q = {'url': domain, 'matchType': 'domain', 'from': '2013', 'to': '2019', 'output': 'json',
         'filter': ['statuscode:200', 'mimetype:text/html', 'original:' + KEYS], 'collapse': 'urlkey', 'limit': '400'}
    url = 'https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode(q, doseq=True)
    b = get(url)
    if not b:
        return []
    try:
        rows = json.loads(b)
    except Exception:  # noqa: BLE001
        return []
    if not rows:
        return []
    h = rows[0]
    return [dict(zip(h, r)) for r in rows[1:]]


def text_of(b):
    s = b.decode('utf-8', 'replace')
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    s = re.sub(r'(?s)<[^>]+>', '\n', s)
    s = html.unescape(s)
    s = re.sub(r'[ \t\r\f\v]+', ' ', s)
    return re.sub(r'\n\s*\n+', '\n', s)


def save(hits):
    json.dump(hits, open(f'{OUT}/hits.json', 'w'), ensure_ascii=False, indent=1)
    with open(f'{OUT}/hits.txt', 'w') as f:
        for h in hits:
            f.write(f"=== {h['ts']} {h['url']} ({h['n']})\n{h['wb']}\n" + '\n'.join('  • ' + s[:600] for s in h['snips']) + '\n\n')


def main():
    os.makedirs(OUT, exist_ok=True)
    save([])
    cands = []
    for d in DOMAINS:
        rows = cdx(d)
        print(d, len(rows), round(time.time() - T0), flush=True)
        cands += [dict(r, domain=d) for r in rows]
        json.dump(cands, open(f'{OUT}/candidates.json', 'w'), ensure_ascii=False, indent=1)
        if time.time() - T0 > BUDGET / 2:
            print('CDX budget reached', flush=True)
            break
        time.sleep(GAP)
    json.dump(cands, open(f'{OUT}/candidates.json', 'w'), ensure_ascii=False, indent=1)
    hits, n = [], 0
    for c in cands:
        if n >= MAXF or time.time() - T0 > BUDGET:
            break
        url = f"https://web.archive.org/web/{c['timestamp']}id_/{c['original']}"
        b = get(url)
        n += 1
        time.sleep(GAP)
        if not b:
            continue
        t = text_of(b)
        lines = t.split('\n')
        idx = [i for i, l in enumerate(lines) if WORDS.search(l)]
        if not idx:
            continue
        snip = []
        for i in idx[:40]:
            snip.append(' | '.join(x.strip() for x in lines[max(0, i - 3): i + 6] if x.strip()))
        hits.append({'url': c['original'], 'ts': c['timestamp'], 'wb': url.replace('id_/', '/'), 'n': len(idx), 'snips': snip})
        print('HIT', c['timestamp'], c['original'], len(idx), flush=True)
        save(hits)
    save(hits)
    print('candidates', len(cands), 'fetched', n, 'hits', len(hits))


if __name__ == '__main__':
    main()
