#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ויקי-בודק — סריקה מוקדמת של כל הערכים.

עובר על כל התחנות ב-stations.json, מאתר לכל אחת את הערך בוויקיפדיה,
קורא את קוד המקור, מחלץ את הקווים שכתובים בטבלאות (התא הראשון בכל
שורה — כמו באתר) ומשווה לרשימת הקווים האמיתית. הפלט:
wiki-check/data/audit.json — כך שהאתר מציג כבר בכניסה כמה טעויות
יש בכל ערך, בלי שהגולש יריץ בדיקה בעצמו.

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


def find_article(name, city):
    q = api({'action': 'query', 'list': 'search', 'srlimit': '5',
             'srsearch': f'{name} {city}'})
    hits = q.get('query', {}).get('search', [])
    if not hits:
        return None
    # מעדיפים ערך שנשמע כמו תחנה/מסוף; אחרת התוצאה הראשונה
    for h in hits:
        if any(w in h['title'] for w in ('תחנה', 'מסוף', 'מרכזית')):
            return h['title']
    return hits[0]['title']


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
    out = {}
    for name, st in data['stations'].items():
        real = {l[0] for l in st['lines']}
        try:
            title = find_article(name, st['city'])
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
            out[name] = {'article': title, 'hasTable': has_table,
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
