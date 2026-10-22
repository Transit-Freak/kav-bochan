# -*- coding: utf-8 -*-
"""בדיקה חד-פעמית (שלמה 22.10): לכל דגם אוטובוס נפוץ — תמונות ברישיון חופשי בוויקישיתוף,
כמועמדות לכרטיס השיתוף בוואטסאפ. לא משנה כלום באתר: כותב רשימה ודפי תמונות לבדיקה ידנית
ב-docs/fetched/model-photos/. רק רישיונות חופשיים (נחלת הכלל, CC0, CC BY, CC BY-SA).
"""
import collections, io, json, os, re, time, urllib.parse, urllib.request

OUT = 'docs/fetched/model-photos'
TOP = int(os.environ.get('TOP', '48'))
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'kav-bochan-model-photos/1.0 (+https://github.com/transit-freak/kav-bochan)'
EN = {'וולבו': 'Volvo', 'גולדן דרגון': 'Golden Dragon', 'הייגר': 'Higer', 'יוטונג': 'Yutong',
      'אוובוס': 'Mercedes-Benz', 'מרצדס בנץ': 'Mercedes-Benz', 'דיימלר קרייזלר': 'Mercedes-Benz',
      'מאן': 'MAN', 'איסוזו': 'Isuzu', 'אוטוקאר': 'Otokar', 'סולאריס': 'Solaris', 'סקניה': 'Scania',
      'בי ווי די': 'BYD', 'זונגטונג': 'Zhongtong', 'טמסה': 'Temsa', 'וויסדום': 'Wisdom',
      'איריזר': 'Irizar', 'וי די אל': 'VDL', 'קינג לונג': 'King Long', 'קרסאן': 'Karsan',
      'סאנווין': 'Sunwin', 'אנקאיי': 'Ankai', 'פוטון': 'Foton', 'גרי': ''}
FREE = re.compile(r'^(public domain|pd|cc0|cc by(-sa)?( \d\.\d)?|cc-by(-sa)?-\d\.\d)', re.I)


def get(params):
    url = API + '?' + urllib.parse.urlencode(dict(params, format='json'))
    for a in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print('retry', a, e, flush=True); time.sleep(5 * (a + 1))
    return {}


def split(model):
    for he, en in sorted(EN.items(), key=lambda x: -len(x[0])):
        if model.startswith(he):
            code = re.sub(r'^[א-ת\s\'"\-]+', '', model[len(he):]).strip()
            return en, code
    return '', re.sub(r'^[א-ת\s\'"\-]+', '', model).strip()


def strip(h):
    return re.sub(r'<[^>]+>', '', h or '').strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    d = json.load(open('fleet/data/fleet.json', encoding='utf-8'))
    cnt = collections.Counter()
    for o in d['operators']:
        for v in o['vehicles']:
            if v[5]:
                cnt[re.sub(r'[\s.\-]', '', v[5])] += 1
    names = {}
    for o in d['operators']:
        for v in o['vehicles']:
            if v[5]:
                names.setdefault(re.sub(r'[\s.\-]', '', v[5]), v[5])
    res = []
    for k, n in cnt.most_common(TOP):
        model = names[k]
        en, code = split(model)
        q = (f'{en} {code}' if en else code).strip()
        # קודם תמונות מישראל (צבעי המפעילים כאן), ואחר כך מכל העולם
        pages, seen = [], set()
        for term in (f'{q} Israel', f'{code} Israel bus', f'{q} bus'):
            r = get({'action': 'query', 'generator': 'search', 'gsrsearch': term, 'gsrnamespace': 6,
                     'gsrlimit': 12, 'prop': 'imageinfo|categories', 'cllimit': 50, 'iiprop': 'url|extmetadata|mime',
                     'iiurlwidth': 480, 'iiextmetadatafilter': 'LicenseShortName|LicenseUrl|Artist|Credit|DateTimeOriginal|DateTime|AttributionRequired'})
            for p in sorted((r.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 99)):
                if p['title'] not in seen:
                    seen.add(p['title']); pages.append(p)
            time.sleep(1)
        isr = lambda p: any('Israel' in c['title'] or 'Egged' in c['title'] or 'Dan bus' in c['title'] for c in p.get('categories') or [])
        # תמונה שסומנה למחיקה או כבעיית זכויות — לא מועמדת
        bad = lambda p: any(re.search(r'deletion|copyright violation|copyvio|no permission|no source|no license', c['title'], re.I) for c in p.get('categories') or [])
        def date(p):
            md = ((p.get('imageinfo') or [{}])[0].get('extmetadata') or {})
            v = strip((md.get('DateTimeOriginal') or md.get('DateTime') or {}).get('value'))
            m = re.search(r'(19|20)\d\d(-\d\d)?(-\d\d)?', v)
            return m.group(0) if m else ''
        pages = [p for p in pages if not bad(p)]
        # מישראל קודם, ובתוך כל קבוצה — החדשה ביותר קודם
        pages.sort(key=lambda p: (not isr(p), ''.join(chr(255 - ord(ch)) for ch in date(p).ljust(10, '0'))))
        cands, skipped = [], []
        for p in pages:
            ii = (p.get('imageinfo') or [{}])[0]
            if not str(ii.get('mime', '')).startswith('image/'):
                continue
            md = ii.get('extmetadata') or {}
            lic = strip((md.get('LicenseShortName') or {}).get('value'))
            if not FREE.match(lic):
                skipped.append((p['title'], lic or 'no license'))
                continue
            tier = 'free-no-conditions' if re.match(r'^(public domain|pd|cc0)', lic, re.I) else ('attribution+share-alike' if re.search(r'sa', lic, re.I) else 'attribution')
            cands.append({'title': p['title'], 'page': ii.get('descriptionurl'), 'thumb': ii.get('thumburl'), 'israel': isr(p),
                          'date': date(p), 'license': lic, 'tier': tier,
                          'license_url': strip((md.get('LicenseUrl') or {}).get('value')),
                          'artist': strip((md.get('Artist') or {}).get('value'))[:80],
                          'credit': strip((md.get('Credit') or {}).get('value'))[:120]})
            if len(cands) >= 4:
                break
        print(f'{n:5} {model} → "{q}": {len(cands)}', flush=True)
        res.append({'model': model, 'n': n, 'query': q, 'cands': cands, 'skipped_not_free': skipped[:5]})
        time.sleep(1)
    json.dump(res, open(f'{OUT}/candidates.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # טבלה קריאה: לכל דגם — כל מועמדת עם הרישיון, הצלם, התאריך והקישור
    with open(f'{OUT}/candidates.md', 'w', encoding='utf-8') as f:
        for i, m in enumerate(res, 1):
            f.write(f'## #{i} {m["model"]} ({m["n"]} רכבים) — חיפוש: {m["query"]}\n')
            for j, c in enumerate(m['cands'], 1):
                f.write(f'{j}. {"🇮🇱 " if c["israel"] else ""}{c["date"] or "?"} · {c["license"]} ({c["tier"]}) · {c["artist"] or "?"} · {c["page"]}\n')
            if not m['cands']:
                f.write('אין תמונה חופשית\n')
            for t, l in m['skipped_not_free']:
                f.write(f'   ✗ לא חופשי: {t} — {l}\n')
            f.write('\n')
    sheets(res)


def sheets(res):
    """דפי תמונות לבדיקה: שורה לכל דגם, עד 4 מועמדות ממוספרות."""
    from PIL import Image, ImageDraw, ImageFont
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
    W, TH, PER = 4 * 300 + 40, 200, 8
    for s in range(0, len(res), PER):
        rows = res[s:s + PER]
        img = Image.new('RGB', (W, len(rows) * (TH + 50) + 10), 'white')
        dr = ImageDraw.Draw(img)
        for i, m in enumerate(rows):
            y = i * (TH + 50) + 10
            dr.text((20, y), f'#{s + i + 1}  {m["query"]}  ({m["n"]} vehicles)', fill='black', font=fb)
            if not m['cands']:
                dr.text((20, y + 40), 'no free image found', fill='gray', font=f)
            for j, c in enumerate(m['cands']):
                try:
                    with urllib.request.urlopen(urllib.request.Request(c['thumb'], headers={'User-Agent': UA}), timeout=60) as r:
                        t = Image.open(io.BytesIO(r.read())).convert('RGB')
                    t.thumbnail((290, TH - 10))
                    img.paste(t, (20 + j * 300, y + 30))
                    dr.text((24 + j * 300, y + 32), str(j + 1), fill='yellow', font=fb, stroke_width=2, stroke_fill='black')
                    if c.get('israel'):
                        dr.text((24 + j * 300, y + 56), 'IL', fill='cyan', font=fb, stroke_width=2, stroke_fill='black')
                except Exception as e:
                    dr.text((20 + j * 300, y + 40), 'load failed', fill='red', font=f)
                time.sleep(0.5)
        img.save(f'{OUT}/sheet-{s // PER + 1}.jpg', quality=82)


if __name__ == '__main__':
    main()
