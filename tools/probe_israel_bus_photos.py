# -*- coding: utf-8 -*-
"""בדיקה חד-פעמית (שלמה 22.10): כל תמונות האוטובוסים בישראל בוויקישיתוף — עוברים על עץ הקטגוריות
"Buses in Israel" (מפעילים, ערים, דגמים), ולכל תמונה חופשית מזהים את הדגם לפי הקטגוריות שלה ושם הקובץ.
לא משנה כלום באתר: כותב ל-docs/fetched/model-photos/israel.json ו-israel.md ודפי תמונות לפי דגם.
"""
import collections, io, json, re, sys, time, urllib.parse, urllib.request
sys.path.insert(0, 'tools')
from probe_model_photos import API, UA, FREE, get, strip, OUT

ROOTS = ['Category:Buses in Israel', 'Category:Bus transport in Israel', 'Category:Egged Bus Cooperative',
         'Category:Dan buses', 'Category:PikiWiki Israel - buses']
DEPTH = 4
SKIP = re.compile(r'stations?|terminals?|stops?|interiors?|tickets?|people|drivers|accidents|logos?|maps?', re.I)


def members(cat, kind):
    out, cont = [], {}
    while True:
        r = get(dict({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmtype': kind, 'cmlimit': 500}, **cont))
        out += [m['title'] for m in (r.get('query') or {}).get('categorymembers', [])]
        if 'continue' not in r:
            return out
        cont = r['continue']; time.sleep(0.5)


def main():
    seen_c, files, q = set(), set(), [(c, 0) for c in ROOTS]
    while q:
        c, d = q.pop(0)
        if c in seen_c:
            continue
        seen_c.add(c)
        files.update(members(c, 'file'))
        if d < DEPTH:
            q += [(s, d + 1) for s in members(c, 'subcat') if not SKIP.search(s)]
        time.sleep(0.3)
    print('categories', len(seen_c), 'files', len(files), flush=True)
    files = sorted(files)
    info = []
    for i in range(0, len(files), 40):
        r = get({'action': 'query', 'titles': '|'.join(files[i:i + 40]), 'prop': 'imageinfo|categories', 'cllimit': 500,
                 'iiprop': 'url|extmetadata|mime', 'iiurlwidth': 480,
                 'iiextmetadatafilter': 'LicenseShortName|Artist|DateTimeOriginal|DateTime'})
        for p in (r.get('query') or {}).get('pages', {}).values():
            ii = (p.get('imageinfo') or [{}])[0]
            md = ii.get('extmetadata') or {}
            lic = strip((md.get('LicenseShortName') or {}).get('value'))
            cats = [c['title'][9:] for c in p.get('categories') or []]
            if not str(ii.get('mime', '')).startswith('image/') or not FREE.match(lic):
                continue
            if any(re.search(r'deletion|copyright violation|copyvio|no permission|no source|no license', c, re.I) for c in cats):
                continue
            dv = strip((md.get('DateTimeOriginal') or md.get('DateTime') or {}).get('value'))
            m = re.search(r'(19|20)\d\d(-\d\d)?(-\d\d)?', dv)
            info.append({'title': p['title'], 'page': ii.get('descriptionurl'), 'thumb': ii.get('thumburl'), 'license': lic,
                         'artist': strip((md.get('Artist') or {}).get('value'))[:80], 'date': m.group(0) if m else '', 'cats': cats})
        time.sleep(0.5)
    print('free images', len(info), flush=True)
    # התאמה לדגמי הצי: קוד הדגם (B8RLE, XML6121J, NL323F...) בשם הקובץ או בקטגוריה, בלי רווחים ונקודות
    models = json.load(open(f'{OUT}/candidates.json', encoding='utf-8'))
    nz = lambda s: re.sub(r'[\s.\-_]', '', s).upper()
    by = collections.defaultdict(list)
    for m in models:
        code = nz(re.sub(r'^(Volvo|MAN|Higer|Yutong|Golden Dragon|Mercedes-Benz|Isuzu|Otokar|Solaris|Scania|BYD|Zhongtong|Irizar)\s*', '', m['query'], flags=re.I))
        if len(code) < 3:
            continue
        for f in info:
            hay = nz(f['title'] + ' ' + ' '.join(f['cats']))
            if code in hay:
                by[m['model']].append(f)
    for k in by:
        by[k].sort(key=lambda f: f['date'], reverse=True)
    json.dump({'files': info, 'by_model': by}, open(f'{OUT}/israel.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(f'{OUT}/israel.md', 'w', encoding='utf-8') as f:
        f.write(f'קטגוריות: {len(seen_c)} · תמונות חופשיות של אוטובוסים בישראל: {len(info)}\n\n')
        for m in models:
            lst = by.get(m['model'], [])
            f.write(f'## {m["model"]} ({m["n"]} רכבים): {len(lst)} תמונות מישראל\n')
            for x in lst[:8]:
                f.write(f'- {x["date"] or "?"} · {x["license"]} · {x["artist"] or "?"} · {x["page"]}\n')
            f.write('\n')
        cc = collections.Counter(c for x in info for c in x['cats'] if re.search(r'Volvo|MAN|Mercedes|Higer|Yutong|Golden Dragon|Scania|Isuzu|Otokar|BYD|Solaris|Merkavim|Haargaz', c))
        f.write('## קטגוריות דגם/יצרן שמופיעות בתמונות מישראל\n')
        for c, n in cc.most_common(80):
            f.write(f'- {n} · {c}\n')
    # דפי תמונות: דגם לכל שורה, עד 4 התמונות החדשות מישראל
    from probe_model_photos import sheets
    rows = [{'model': m['model'], 'n': m['n'], 'query': m['query'] + '  [ISRAEL]', 'cands': by.get(m['model'], [])[:4]} for m in models if by.get(m['model'])]
    sheets(rows, prefix='il-sheet')


if __name__ == '__main__':
    main()
