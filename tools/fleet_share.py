# -*- coding: utf-8 -*-
"""כרטיסי שיתוף של צי הרכבים (שלמה 22.10): מה מופיע בכרטיס של כל רכב, חברה, דגם, עיר ומעבר.

build() מחזיר {מפתח: פריט}. כל פריט מחזיק את טקסט הדף (title/desc), את הכתובת באתר (url),
ואת תוכן הבאנר (b) — רק מה שמצויר בתמונה. שם קובץ הבאנר נגזר מהתוכן שלו (banner_name),
כך שכשרכב עובר חברה נוצרת תמונה חדשה מעצמה, ותמונה שלא השתנתה לא מצוירת שוב.

משמש את tools/share_fleet_banners.py (ציור והעלאה) ואת tools/share_stubs.py (דפי השיתוף).
שמות הדפים ב-s/ חייבים להתאים ל-fleetStub ב-fleet/index.html ול-404.html.
"""
import datetime
import hashlib
import json
import re
import urllib.parse

BASE = 'https://kavbochan.app'
NEUTRAL = ['#1E4FBF']   # דגם ועיר — בכחול של סמל צי הרכבים


def hexs(s):
    """שם קובץ לטקסט בעברית (דגם, עיר): hex של UTF-8 — כמו באנרי הקווים."""
    return s.encode('utf-8').hex()


def colors():
    """צבעי המפעילים — נקראים מ-fleet/index.html, כדי שיישארו זהים לאתר."""
    src = open('fleet/index.html', encoding='utf-8').read()
    m = re.search(r'const COLORS=\{(.*?)\};', src, re.S)
    out = {}
    for ref, cs in re.findall(r'(\d+):\[([^\]]*)\]', m.group(1) if m else ''):
        out[int(ref)] = re.findall(r"'(#[0-9A-Fa-f]{6})'", cs)
    return out


def approx(n):
    """מספר מעוגל — כדי שהכרטיס לא ישתנה כל לילה (ואיתו אלפי קבצים): עד 100 מדויק, מעל — לעשרות/מאות."""
    if n < 100:
        return f'{n:,}'
    return 'כ-' + f'{round(n, -1 if n < 1000 else -2):,}'


def banner_name(b):
    return 'fl-' + hashlib.sha1(json.dumps(b, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16] + '.jpg'


def kab_type(t):
    return bool(t) and any(x in t for x in ('הסעות', 'מיוחד', 'סיור', 'טיולית', 'פרטי'))


def short_model(m):
    """'וולבו שבדיה B11R-SNS' ← 'וולבו B11R-SNS': בלי ארץ הייצור (כמו בהדמיה שאושרה)."""
    m = re.sub(r'\s+', ' ', m or '').strip()
    m = re.sub(r'^(.*?)\s+(שבדיה|גרמניה|גרמנ|סין|סי|ספרד|טורקיה|פולין|פולי|הולנד|אוסטריה|איטליה|צרפת|הודו)(?=\s|$)', r'\1', m)
    return m


def build():
    d = json.load(open('fleet/data/fleet.json', encoding='utf-8'))
    off = 1 if d.get('v') == 2 else 0
    up = datetime.date.fromisoformat(str(d['updated'])[:10])
    rd = d.get('retire_days', 30)
    try:
        ofc = json.load(open('fleet/data/fleet-official.json', encoding='utf-8')).get('of') or {}
    except Exception:
        ofc = {}
    col = colors()
    ops = [o for o in d['operators'] if o['ref'] not in (2, 20, 21) and not re.match(r'^מפעיל \d+$', o['name'])]
    name = {o['ref']: o['name'] for o in ops}
    active = lambda v: (up - datetime.date.fromisoformat(v[2])).days <= rd
    out = {}

    # --- רכבים: הרשומה האחרונה של כל לוחית (רכב שעבר חברה — החברה שבה נצפה לאחרונה) ---
    recs = {}
    for o in ops:
        for v in o['vehicles']:
            p = str(v[0])
            if p not in recs or v[2] > recs[p][1][2]:
                recs[p] = (o, v)
    for p, (o, v) in recs.items():
        model = short_model(v[4 + off] if len(v) > 4 + off else '')
        typ = v[6 + off] if len(v) > 6 + off else ''
        on = active(v)
        kab = (p.replace('-', '').lstrip('0') not in ofc) and (kab_type(typ) or on) if ofc else kab_type(typ)
        # בלי מספר הנסיעות ביום: הוא זז כל לילה, וכל שינוי כותב מחדש את דף השיתוף
        if on:
            status = 'פעיל'
        else:
            status = 'ירד מהשירות ב-' + v[2][5:7] + '.' + v[2][:4]
        out['v:' + p] = {
            'stub': f'v-{p.replace("/", "")}.html',
            'title': f'רכב {p} · {o["name"]}', 'desc': status,
            'url': f'{BASE}/fleet/#v={p}',
            'b': {'p': p, 'm': model or 'רכב', 'c': o['name'] + (' · רכב קבלן' if kab else ''), 'col': col.get(o['ref'], NEUTRAL)},
        }

    # --- חברות ---
    for o in ops:
        n = len(o['vehicles']); a = sum(1 for v in o['vehicles'] if active(v))
        out[f'o:{o["ref"]}'] = {
            'stub': f'o-{o["ref"]}.html',
            'title': f'{o["name"]} · צי הרכבים', 'desc': f'{approx(n)} רכבים · {approx(a)} פעילים',
            'url': f'{BASE}/fleet/#op={o["ref"]}',
            'b': {'k': 'חברה', 'm': o['name'], 'c': f'{approx(n)} רכבים · {approx(a)} פעילים', 'col': col.get(o['ref'], NEUTRAL)},
        }

    # --- דגמים (כמו במסך הדגמים: לפי שם הדגם המלא מהרישוי) ---
    agg = {}
    for o in ops:
        for v in o['vehicles']:
            m = v[4 + off] if len(v) > 4 + off else ''
            if not m:
                continue
            g = agg.setdefault(m, [0, 0, set()])
            g[0] += 1; g[1] += active(v); g[2].add(o['ref'])
    for m, (n, a, s) in agg.items():
        if n < 5:
            continue
        out['m:' + m] = {
            'stub': f'm-{hexs(m)}.html',
            'title': f'{short_model(m)} · צי הרכבים', 'desc': f'{approx(n)} רכבים · {approx(a)} פעילים',
            'url': f'{BASE}/fleet/#m=type&model=' + urllib.parse.quote(m),
            'b': {'k': 'דגם', 'm': short_model(m), 'c': f'{approx(n)} רכבים · {len(s)} חברות', 'col': NEUTRAL},
        }

    # --- ערים ---
    try:
        cities = json.load(open('fleet/data/fleet-cities.json', encoding='utf-8')).get('cities') or {}
    except Exception:
        cities = {}
    for c, x in cities.items():
        n = x.get('total') or 0
        if n < 5:
            continue
        nops = len(x.get('ops') or [])
        out['c:' + c] = {
            'stub': f'c-{hexs(c)}.html',
            'title': f'{c} · צי הרכבים',
            'desc': (f'{approx(x["act"])} רכבים פעילים בעיר' if x.get('act') is not None else f'{approx(n)} רכבים'),
            'url': f'{BASE}/fleet/#m=city&city=' + urllib.parse.quote(c),
            'b': {'k': 'עיר', 'm': c, 'c': f'{approx(n)} רכבים · {nops} חברות', 'col': NEUTRAL},
        }

    # --- מעברים בין חברות: כל זוג שיש בו לפחות רכב אחד שנצפה קודם אצל אחת ואחר כך אצל השנייה ---
    seen = {}
    for o in ops:
        for v in o['vehicles']:
            seen.setdefault(str(v[0]), []).append((v[1], o['ref']))
    pairs = set()
    for lst in seen.values():
        if len(lst) < 2:
            continue
        lst.sort()
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                if lst[i][1] != lst[j][1]:
                    pairs.add((lst[i][1], lst[j][1]))
    for a, b in pairs:
        out[f'mv:{a}-{b}'] = {
            'stub': f'mv-{a}-{b}.html',
            'title': f'מעברים מ{name[a]} ל{name[b]} · צי הרכבים', 'desc': 'מי עבר, מתי ואיזה דגם',
            'url': f'{BASE}/fleet/#m=moves&mf=op:{a}&mt=op:{b}',
            'b': {'k': 'מעברים', 'm': f'מ{name[a]} ל{name[b]}', 'c': 'רכבים שעברו בין החברות',
                  'col2': [col.get(a, NEUTRAL)[0], col.get(b, NEUTRAL)[0]]},
        }
    for it in out.values():
        it['img'] = banner_name(it['b'])
    return out


if __name__ == '__main__':
    import collections
    x = build()
    print(len(x), collections.Counter(k.split(':')[0] for k in x))
    for k in ('v:7291052', 'o:3', 'mv:34-3'):
        print(k, json.dumps(x.get(k), ensure_ascii=False))
