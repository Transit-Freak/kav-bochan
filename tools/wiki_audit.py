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
import urllib.error
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
    for attempt in range(7):
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # ויקיפדיה מגבילה קצב — מכבדים Retry-After (לפחות דקה) ולא מוותרים
                wait = max(60, int(e.headers.get('Retry-After') or 0))
                print(f'  429 — ממתין {wait}s', flush=True)
                time.sleep(wait)
                continue
            if attempt == 6:
                raise
            time.sleep(5 * (attempt + 1))
        except Exception as e:  # noqa: BLE001
            if attempt == 6:
                raise
            print(f'  retry {attempt + 1}: {e}', flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('ויקיפדיה לא זמינה')


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
                m = LINE.match(part.replace('♿', '').strip())
                if m and m.group(1) not in found:
                    found.append(m.group(1))
            for t in TPL_LINE.finditer(cell):
                if t.group(1) not in found:
                    found.append(t.group(1))
            row_start = False
    return found


def parse_tables(wt):
    """כל הטבלאות בערך: [(כותרות, [שורות של תאים])] — תא = טקסט גולמי (wikitext)."""
    tables, hdr, rows, cur = [], [], [], None
    in_t = 0
    for raw in wt.split('\n'):
        ln = raw.strip()
        if ln.startswith('{|'):
            in_t += 1
            hdr, rows, cur = [], [], None
            continue
        if ln.startswith('|}'):
            if cur:
                rows.append(cur)
            if in_t:
                tables.append((hdr, rows))
            in_t = max(0, in_t - 1)
            hdr, rows, cur = [], [], None
            continue
        if not in_t:
            continue
        if ln.startswith('|-'):
            if cur:
                rows.append(cur)
            cur = []
            continue
        if ln.startswith('|+'):
            continue
        if ln.startswith('!'):
            for c in re.split(r'!!', ln.lstrip('!')):
                c = c.split('|')[-1] if '|' in c and not c.strip().startswith('[[') else c
                hdr.append(CLEAN.sub(' ', c).strip())
            continue
        if ln.startswith('|'):
            if cur is None:
                cur = []
            for c in re.split(r'\|\|', ln.lstrip('|')):
                # תכונות תא ("rowspan=2 | טקסט") — נשאר רק הטקסט
                if re.match(r'^\s*[a-zA-Z-]+\s*=', c) and '|' in c:
                    c = c.split('|', 1)[1]
                cur.append(c)
    return tables


STREET_PFX = re.compile(r"^(רחוב|רח'|רח\"|שד'|שד\"|שדרות|דרך|כביש מס'|כביש)\s+")
STREET_SPLIT = re.compile(r'[,;،·•←→⇐⇒]|\s[-–—]\s|\s/\s|\bדרך\b|\bעד\b|\bאל\b')


def street_norm(t):
    t = re.sub(r"\[\[([^\]|]*)\|[^\]]*\]\]", r"\1", t)     # [[יעד|טקסט]] → יעד (השם המלא)
    t = re.sub(r'\s*\([^)]*\)', ' ', t)                        # (דימונה)
    t = CLEAN.sub(' ', t).strip()
    t = STREET_PFX.sub('', t)
    t = re.sub(r"['\"’]", '', t).replace('-', ' ').replace('–', ' ')
    t = re.sub(r'\bקרית\b', 'קריית', t)
    t = re.sub(r'^ה', '', t.strip())          # ה' הידיעה
    t = t.replace('יי', 'י').replace('וו', 'ו')   # ויצמן/וייצמן, תעש/תע"ש — כתיב מלא/חסר
    t = re.sub(r'[\u200e\u200f\u202a-\u202e\u00a0\u2060]', '', t)   # סימני כיוון ורווחים בלתי נראים מוויקיפדיה
    # בית חולים / בי"ח / מרכז רפואי — אותו מקום
    t = re.sub(r'\b(בית החולים|בית חולים|ביח|מרכז רפואי|המרכז הרפואי)\b', 'ביח', t)
    return re.sub(r'\s+', ' ', t).strip()


GENERIC = {'מסוף', 'תחנה', 'תחנה מרכזית', 'מרכזית', 'ת. מרכזית', 'ת.מרכזית', 'רציף', 'רציפים', 'הורדה', 'איסוף', 'מפגש', 'צומת'}


def route_cell_streets(cell):
    """שמות רחובות מתא המסלול בערך — מנורמלים, בלי מספרים ובלי קטעים קצרים."""
    out = []
    for part in STREET_SPLIT.split(cell):
        if '♿' in (part or ''):            # הערת נגישות ("♿ בשעות הבוקר") אינה רחוב
            continue
        n = street_norm(part or '')
        if len(n) >= 3 and re.search(r'[א-ת]', n) and not n.isdigit() and n not in out and n not in GENERIC:
            out.append(n)
    return out


def same_street(a, b):
    """שוויון רחובות מנורמלים: זהים, או שאחד מכיל את השני (מ-4 תווים)."""
    if a == b:
        return True
    return len(a) >= 4 and len(b) >= 4 and (a in b or b in a)


ACC_RE = re.compile(r'♿|נגיש')


def check_access(wt, real_acc):
    """סימון נגישות (♿) בטבלאות מול ה-GTFS: קו נגיש בלי סימון ('missing'),
    וסימון על קו שאינו נגיש ('wrong'). real_acc: קו → 1/0/2 (שלמה 18.09)."""
    missing, wrong = [], []
    for hdr, rows in parse_tables(wt):
        for row in rows:
            if not row:
                continue
            first = CLEAN.sub(' ', row[0]).strip()
            marked = any(ACC_RE.search(c or '') for c in row)
            for part in re.split(r'[/\\]', first):
                m = LINE.match(ACC_RE.sub('', part).strip())
                if not m:
                    continue
                line = m.group(1)
                acc = real_acc.get(line)
                if acc is None:
                    continue
                if acc == 1 and not marked and line not in missing:
                    missing.append(line)
                if acc == 0 and marked and line not in wrong:
                    wrong.append(line)
    return {'missing': missing, 'wrong': wrong}


JUNK_STREET = re.compile(r'יציאה|כניסה|מחלף|צומת|כביש')


def check_routes(wt, real_lines, central, skip_names, detailed=True):
    """עמודת המסלול בטבלאות: לכל קו — רחובות שכתובים אך הקו לא עובר בהם ('no'),
    ורחובות מרכזיים שהקו עובר בהם ולא הוזכרו ('miss'). (שלמה 18.09)"""
    res = {}
    skip = {street_norm(x) for x in skip_names if x}
    skip |= {street_norm(x) for x in GENERIC}
    for hdr, rows in parse_tables(wt):
        ci = next((i for i, h in enumerate(hdr) if 'מסלול' in h), None)
        if ci is None:
            continue
        for row in rows:
            if len(row) <= ci:
                continue
            first = CLEAN.sub(' ', row[0]).strip()
            for part in re.split(r'[/\\]', first):
                m = LINE.match(part.strip())
                if not m:
                    continue
                line = m.group(1)
                ls = real_lines.get(line)
                if ls is None:
                    continue
                streets = [(x[0], street_norm(x[0])) for x in ls['streets']]
                cities = {x[1] for x in ls['streets']}
                # שמות תחנות במסלול (קניון ערים, מרכז רפואי מאיר) — מותר לכתוב, לא "רחוב שהקו לא עובר בו"
                lskip = skip | {street_norm(c) for c in cities} | {street_norm(p) for p in ls.get('places') or []}
                cent = {street_norm(st) for ct in cities for st in central.get(ct, [])}
                written = route_cell_streets(row[ci])
                no = [w for w in written if not any(same_street(w, c) for c in lskip)
                      and not any(same_street(w, n) for _, n in streets)]
                # רחובות מרכזיים חסרים — רק בערך שמפרט רחובות (בערך עם מסלול קצר אין מה להשלים), עד 3
                miss, seen_m = [], set()
                if detailed:
                    for o, n in streets:
                        if n in cent and n not in seen_m and not JUNK_STREET.search(o) and not any(same_street(w, n) for w in written):
                            miss.append(o); seen_m.add(n)
                miss = miss[:3]
                if no or miss:
                    res[line] = {'no': no[:8], 'miss': miss}
    return res


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


CATEGORY = 'קטגוריה:ישראל: תחנות מרכזיות ומסופי אוטובוסים'


def category_articles(root=CATEGORY, depth=3):
    """כל הערכים בקטגוריה, כולל תת-קטגוריות (לפי עיר) — הרשימה הסמכותית."""
    titles, seen, queue = set(), set(), [(root, 0)]
    while queue:
        cat, d = queue.pop()
        if cat in seen:
            continue
        seen.add(cat)
        cont = {}
        while True:
            r = api({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat,
                     'cmlimit': '500', 'cmtype': 'page|subcat', **cont})
            for m in r.get('query', {}).get('categorymembers', []):
                if m['ns'] == 14:
                    if d < depth:
                        queue.append((m['title'], d + 1))
                elif m['ns'] == 0:
                    titles.add(m['title'])
            cont = r.get('continue', {})
            if not cont:
                break
    print(f'קטגוריה: {len(titles)} ערכים · {len(seen)} קטגוריות', flush=True)
    return titles


def category_coords(titles):
    """קואורדינטות של כל ערך בקטגוריה (prop=coordinates) — {כותרת: (lat, lon)}."""
    out = {}
    ts = sorted(titles)
    for i in range(0, len(ts), 50):
        r = api({'action': 'query', 'prop': 'coordinates', 'coprimary': 'primary',
                 'titles': '|'.join(ts[i:i + 50])})
        for pg in r.get('query', {}).get('pages', {}).values():
            co = pg.get('coordinates')
            if co:
                out[pg['title']] = (co[0]['lat'], co[0]['lon'])
        time.sleep(0.3)
    print(f'קואורדינטות: {len(out)} מתוך {len(ts)} ערכים', flush=True)
    return out


def dist_m(a, b):
    import math
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    x = (lo2 - lo1) * math.cos((la1 + la2) / 2)
    return math.hypot(x, la2 - la1) * 6371000


NEAR_M = 400   # ערך שהקואורדינטות שלו עד 400 מ' ממרכז המתחם — זה הערך של המתחם


def match_by_coords(st, coords):
    """הערך הקרוב ביותר למתחם לפי קואורדינטות (שלמה 18.09: "בכל ערך יש קואורדינטות")."""
    if st.get('lat') is None:
        return None, None
    best, bd = None, None
    for t, c in coords.items():
        d = dist_m((st['lat'], st['lon']), c)
        if bd is None or d < bd:
            best, bd = t, d
    return (best, round(bd)) if bd is not None and bd <= NEAR_M else (None, round(bd) if bd is not None else None)


def norm(t):
    t = re.sub(r'\(.*?\)', ' ', t)
    t = t.replace('"', '').replace("'", '').replace('-', ' ').replace('–', ' ')
    t = re.sub(r'\bקרית\b', 'קריית', t)   # קרית/קריית — אותו דבר
    return re.sub(r'\s+', ' ', t).strip()


def match_in_category(name, city, cat_titles):
    """שידוך תחנה מה-GTFS לערך מתוך הקטגוריה בלבד — לפי עיר ושם המסוף."""
    is_central = 'מרכזית' in name
    core = norm(re.sub(r'^(ת\. מרכזית|תחנה מרכזית|מרכזית|מסוף)\s*', '', name))
    ncity = norm(city)
    # "מסוף אגד (דימונה)": העיר שבסוגריים חייבת להופיע בכותרת
    mpar = re.search(r'\(([^)]+)\)', name)
    par_city = norm(mpar.group(1)) if mpar else ''
    best, best_score = None, 0
    for t in cat_titles:
        nt = norm(t)
        score = 0
        if ncity and ncity in nt:
            score += 2
        # שם המסוף כמילה שלמה — "אגד" לא תופס "חניון אגד חולון" ו"ג'ת" לא תופס "קריית גת"
        core_in = bool(core) and len(core) > 2 and re.search(r'(^|\s)ה?' + re.escape(core) + r'(\s|$)', nt) is not None
        if par_city and par_city not in nt:
            continue
        if core_in:
            score += 3
        if is_central and 'מרכזית' in nt:
            score += 1
        if not is_central and 'מסוף' in nt:
            score += 1
        # מסוף: חובה ששם המסוף עצמו יופיע; תחנה מרכזית: חובה שם העיר
        if is_central and not (ncity and ncity in nt):
            continue
        if not is_central and not core_in:
            continue
        if score > best_score:
            best, best_score = t, score
    return best


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
        # סובלנות לאיות "ת.מרכזית"/"ת. מרכזית" במפתחות
        override = {re.sub(r'^ת\.\s*מרכזית', 'ת. מרכזית', k): v for k, v in override.items()}
    known = {}
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f:
            for k, v in json.load(f).get('stations', {}).items():
                if v.get('article'):
                    known[k] = v['article']
    places = {}
    pp = os.path.join(os.path.dirname(STATIONS), 'places.json')
    if os.path.exists(pp):
        with open(pp, encoding='utf-8') as f:
            places = json.load(f)
    cat_titles = category_articles()
    coords = category_coords(cat_titles)
    out = {}
    for name, st in data['stations'].items():
        real = {l[0] for l in st['lines']}
        try:
            if name in override:
                title = override[name]   # null = אין ערך מתאים, לא מחפשים
            else:
                kind = st.get('kind', 'station')
                if kind == 'station':
                    # תחנות/מסופים: קודם לפי מיקום (הקואורדינטות שבערך מול מרכז
                    # המתחם ב-GTFS), ורק אם אין ערך קרוב — לפי השם, מתוך הקטגוריה בלבד
                    # שם זהה בקטגוריה ("מסוף משה ארנס" = "מסוף משה ארנס") גובר על מיקום —
                    # מסוף זמני ליד תחנה מרכזית סגורה אינו הערך שלה; אחרת לפי מיקום, ואז לפי שם
                    exact = next((t for t in cat_titles if norm(t) == norm(name)), None)
                    if exact:
                        title, how = exact, 'שם זהה'
                    else:
                        title, dm = match_by_coords(st, coords)
                        how = f'לפי מיקום ({dm} מ\')' if title else 'לפי שם'
                    if not title:
                        title = match_in_category(name, st['city'], cat_titles)
                    if title:
                        print(f'  {name} → {title} {how}', flush=True)
                else:
                    rel, _ = find_article(name, st['city'], kind)
                    prev = known.get(name)
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
            # בדיקת עמודת המסלול: רחובות כתובים שהקו לא עובר בהם / מרכזיים שחסרים
            real_lines = {}
            for l in st['lines']:
                sl = l[5] if len(l) > 5 else None
                if sl and l[0] not in real_lines:
                    real_lines[l[0]] = {'streets': sl, 'places': (places.get(name) or {}).get(l[0]) or []}
            # ערים ותחנות קצה אינן רחובות: עיר התחנה, היעדים, וכל היישובים שבקובץ התחנות
            skip_names = {st['city'], name} | {d for l in st['lines'] for d in l[2]} | set(data.get('cities') or [])
            real_acc = {l[0]: l[6] for l in st['lines'] if len(l) > 6 and l[6] is not None}
            acc_issues = check_access(wt, real_acc) if real_acc and has_table else {'missing': [], 'wrong': []}
            # האם הערך מפרט רחובות בעמודת המסלול (חיצים, או 3 קטעים ומעלה בתא) — הטבלה
            # המוכנה באתר מחקה את הסגנון הקיים: מפורט כשהערך מפורט, קצר כשלא (שלמה 18.09)
            detailed = False
            for hdr_, rows_ in parse_tables(wt):
                ci_ = next((i for i, h in enumerate(hdr_) if 'מסלול' in h), None)
                if ci_ is None:
                    continue
                cells = [r_[ci_] for r_ in rows_ if len(r_) > ci_]
                if any(('←' in c or '→' in c or len(route_cell_streets(c)) >= 3) for c in cells):
                    detailed = True
                    break
            route_issues = check_routes(wt, real_lines, data.get('central') or {}, skip_names, detailed) if real_lines else {}
            wrong = [l for l in in_article if l not in real]
            correct = [l for l in in_article if l in real]
            missing = len(real) - len(correct)
            out[name] = {'article': title, 'kind': st.get('kind', 'station'), 'hasTable': has_table,
                         'inArticle': in_article, 'wrong': wrong,
                         'correct': len(correct), 'missing': missing, 'routes': route_issues, 'detailed': detailed,
                         'acc': acc_issues}
            print(f'{name} → {title}: בערך {len(in_article)} · '
                  f'שגויים {len(wrong)} · חסרים {missing} · מסלולים לבדיקה {len(route_issues)}', flush=True)
        except Exception as e:  # noqa: BLE001 — ערך אחד לא מפיל את כולם
            out[name] = {'article': None, 'err': str(e)}
            print(f'{name}: שגיאה {e}', flush=True)
        time.sleep(0.6)   # נימוס כלפי ה-API של ויקיפדיה
        if len(out) % 40 == 0:
            with open(f'{OUT}.tmp', 'w', encoding='utf-8') as f:
                json.dump({'updated': data['updated'], 'stations': out, 'partial': True}, f, ensure_ascii=False)
            os.replace(f'{OUT}.tmp', OUT)
    used = {v.get('article') for v in out.values()}
    unmatched = sorted(t for t in cat_titles if t not in used)
    print(f'ערכים בקטגוריה שלא שודכו לתחנה ({len(unmatched)}): ' + ' | '.join(unmatched[:60]), flush=True)
    res = {'updated': data['updated'], 'stations': out, 'unmatched': unmatched}
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    n_bad = sum(1 for v in out.values() if v.get('wrong'))
    print(f'סה"כ: {len(out)} תחנות · {n_bad} ערכים עם קווים שגויים', flush=True)


if __name__ == '__main__':
    import sys
    sys.exit(main())
