#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ויקי-בודק — סריקה מוקדמת של כל הערכים.

עובר על כל התחנות ב-stations.json, מאתר לכל אחת את הערך בוויקיפדיה,
קורא את קוד המקור, מחלץ את הקווים שכתובים בטבלאות (התא הראשון בכל
שורה — כמו באתר) ומשווה לרשימת הקווים האמיתית. הפלט:
wiki-check/data/audit.json — כך שהאתר מציג כבר בכניסה כמה טעויות
יש בכל ערך, בלי שהגולש יריץ בדיקה בעצמו.

השיוך תחנה→ערך קבוע: articles.json (ידני, גובר על הכול) ← audit.json
הקודם (מה שכבר נמצא) ← חיפוש — רק לתחנה חדשה.

רץ מ-GitHub Actions (לוויקיפדיה אין גישה מסביבות אחרות של הפרויקט).
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

STATIONS = os.environ.get('STATIONS', 'wiki-check/data/stations.json')
OUT = os.environ.get('OUT', 'wiki-check/data/audit.json')
API = 'https://he.wikipedia.org/w/api.php?format=json&'
UA = {'User-Agent': 'kav-bochan-wiki-check/1.0 (transit-freak.github.io)'}

CLEAN = re.compile(r"\{\{[^}]*\}\}|\[\[|\]\]|'''?|<[^>]*>")
LINE = re.compile(r'^(\d{1,3}[א-ת]?)$')
TPL_LINE = re.compile(r'\{\{[^}]*?\|\s*(\d{1,3}[א-ת]?)\s*(?:\||\}\})')


def api(params):
    url = API + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f'  retry {attempt + 1}: {e}', flush=True)
            time.sleep(3 * (attempt + 1))


def extract_lines(wt):
    """מספרי קווים מטבלאות בלבד, ורק מהתא הראשון בכל שורה — אותו היגיון כמו באתר."""
    found = []
    in_table, row_start = 0, False
    for raw in wt.split('\n'):
        ln = raw.strip()
        if ln.startswith('{|'):
            in_table += 1
            row_start = True
            continue
        if ln.startswith('|}'):
            in_table = max(0, in_table - 1)
            continue
        if not in_table:
            continue
        if ln.startswith('|-'):
            row_start = True
            continue
        if ln.startswith('|+'):
            continue
        if ln.startswith('!'):
            row_start = False
            continue
        if ln.startswith('|') and row_start:
            cell = ln.lstrip('|').split('||')[0]
            # "9/9א" — זוג קווים באותו תא, מפוצל על לוכסן
            for part in re.split(r'[/\\]', CLEAN.sub(' ', cell)):
                m = LINE.match(part.strip())
                if m and m.group(1) not in found:
                    found.append(m.group(1))
            for t in TPL_LINE.finditer(cell):
                if t.group(1) not in found:
                    found.append(t.group(1))
            row_start = False
    return found


PREFIX = re.compile(r'^(רחוב|שדרות|שד\'|דרך|קניון|מרכז רפואי|בית חולים|ביה"ח|בי\'\'ח|מכללת|תחנת רכבת|אוניברסיטת)\s+')


def find_article(name, city, kind='station'):
    """חיפוש שמחזיר רק ערך שנראה רלוונטי — לא סתם התוצאה הראשונה."""
    core = PREFIX.sub('', name).strip()
    if kind == 'station':
        # חובה: שם העיר בכותרת (או שם המסוף עצמו) — "מרכזית" לבד תופס כל תחנה בארץ
        toks = [city] + [w for w in city.split() if len(w) > 2]
        mcore = PREFIX.sub('', name).replace('ת. מרכזית', '').strip()
        def rel(t):
            return (any(tok and tok in t for tok in toks) or (len(mcore) > 3 and mcore in t)) \
                and any(w in t for w in ('תחנה', 'מסוף', 'מרכזית'))
        qs = (f'{name} {city}', f'התחנה המרכזית של {city}', f'התחנה המרכזית {city}')
    elif kind == 'street':
        def rel(t):
            return core in t and ('רחוב' in t or 'שדרות' in t or 'דרך' in t or city in t)
        qs = (f'{name} {city}', f'רחוב {core} {city}', f'{core} ({city})')
    else:
        def rel(t):
            return core in t
        qs = (f'{name} {city}', f'{core} {city}', core)
    return rel, qs


def search_article(name, city, kind='station'):
    rel, qs = find_article(name, city, kind)
    for q in qs:
        r = api({'action': 'query', 'list': 'search', 'srlimit': '5', 'srsearch': q})
        for h in r.get('query', {}).get('search', []):
            if rel(h['title']):
                return h['title']
    return None


def get_wikitext(title):
    r = api({'action': 'query', 'prop': 'revisions', 'rvprop': 'content',
             'rvslots': 'main', 'redirects': '1', 'titles': title})
    pg = list(r['query']['pages'].values())[0]
    if 'revisions' not in pg:
        return None, None
    return pg['title'], pg['revisions'][0]['slots']['main']['*'] or ''


def main():
    with open(STATIONS, encoding='utf-8') as f:
        data = json.load(f)
    # חיבור קבוע: שיוך תחנה→ערך נשמר בין ריצות — מחפשים רק תחנה חדשה.
    # articles.json = הצמדות ידניות (גוברות על הכול); audit.json הקודם = מה שכבר נמצא.
    override = {}
    ov_path = os.path.join(os.path.dirname(OUT), 'articles.json')
    if os.path.exists(ov_path):
        with open(ov_path, encoding='utf-8') as f:
            override = json.load(f)
    known = {}
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f:
            for k, v in json.load(f).get('stations', {}).items():
                if v.get('article'):
                    known[k] = v['article']
    out = {}
    for name, st in data['stations'].items():
        real = {l[0] for l in st['lines']}
        try:
            if name in override:
                title = override[name]   # null = אין ערך מתאים, לא מחפשים
            else:
                kind = st.get('kind', 'station')
                rel, _ = find_article(name, st['city'], kind)
                prev = known.get(name)
                # שיוך שנשמר מסריקה קודמת חייב לעבור את אותה בדיקת רלוונטיות
                title = prev if (prev and rel(prev)) else search_article(name, st['city'], kind)
            if not title:
                out[name] = {'article': None}
                print(f'{name}: לא נמצא ערך', flush=True)
                continue
            title, wt = get_wikitext(title)
            if wt is None:
                out[name] = {'article': None}
                continue
            in_article = extract_lines(wt)
            has_table = '{|' in wt and bool(in_article)
            wrong = [l for l in in_article if l not in real]
            correct = [l for l in in_article if l in real]
            missing = len(real) - len(correct)
            out[name] = {'article': title, 'kind': st.get('kind', 'station'), 'hasTable': has_table,
                         'inArticle': in_article, 'wrong': wrong,
                         'correct': len(correct), 'missing': missing}
            print(f'{name} → {title}: בערך {len(in_article)} · '
                  f'שגויים {len(wrong)} · חסרים {missing}', flush=True)
        except Exception as e:  # noqa: BLE001 — ערך אחד לא מפיל את כולם
            out[name] = {'article': None, 'err': str(e)}
            print(f'{name}: שגיאה {e}', flush=True)
        time.sleep(0.3)   # נימוס כלפי ה-API של ויקיפדיה
    res = {'updated': data['updated'], 'stations': out}
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    n_bad = sum(1 for v in out.values() if v.get('wrong'))
    print(f'סה"כ: {len(out)} תחנות · {n_bad} ערכים עם קווים שגויים', flush=True)


if __name__ == '__main__':
    import sys
    sys.exit(main())
