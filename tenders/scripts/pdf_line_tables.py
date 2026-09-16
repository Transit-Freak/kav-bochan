#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""טבלת הקווים שבתוך ה-PDF — למכרזים שאין להם נספח אקסל של קווים (המכרזים הישנים, 2014).

שלמה (16.09): "בצפון הנגב לא מציין קווים ללא שינוי, בנוסף אין טבלה כמו בחיפה".
במכרזי 2014 (צפון הנגב, חדרה–נתניה, שרון–חולון) רשימת הקווים היא טבלה בתוך המסמך
(סעיף 31.2 "הקווים הכלולים במכרז"): שירות | מפעיל קיים | תיאור | קו | קבוצה (עיר – קווים עירוניים).
אין בה מק"טים. הסקריפט קורא אותה מהטקסט השמור (tenders/text, פלט pdftotext -layout) לפי
מיקומי העמודות, וכותב גרסת קווים ל-route-data בפורמט של נספחי האקסל, כדי שלשונית "הקווים"
תציג טבלה כמו בחיפה: מה המכרז אומר על כל קו, ומי לא מוזכר — "ממשיך כמו היום".

רץ אחרי extract_route_tables.py. רק למכרזים שאין להם גרסת קווים מאקסל.
"""
import gzip
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

SERVICE = r'עירוני(?:-תלמידים)?|אזורי(?:-תלמידים)?|בינעירוני|בין-עירוני|לילה|תלמידים|מהיר|פרברי'
ROW = re.compile(r'^(?P<ind>\s*)(?P<svc>' + SERVICE + r')\s{2,}(?P<mid>\S.*?\S|\S)\s{2,}(?P<num>\d{1,3}[א-ת]?)(?:\s{2,}(?P<grp>\S.*?))?\s*$')
HEADER = re.compile(r'מפעיל\s+(?:קיים|נוכחי)')
OPERATORS = ['קו חדש', 'אגד תעבורה', 'נתיב אקספרס', 'דן בדרום', 'דן באר שבע', 'נסיעות ותיירות', 'ג.ב טורס', 'ג.ב. טורס',
             'מטרופולין', 'סופרבוס', 'אפיקים', 'אקסטרה', 'תנופה', 'גלים', 'קווים', 'ש.א.מ', 'אגד', 'דן']
KINDS = [('עירוניים', 'עירוני'), ('אזוריים', 'אזורי'), ('בינעירוניים', 'בינעירוני'), ('בין-עירוניים', 'בינעירוני'),
         ('לילה', 'לילה'), ('תלמידים', 'תלמידים')]
MIN_ROWS = 8


def read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def clean(s):
    return re.sub(r'\s+', ' ', re.sub('[‪-‮‎‏]', '', s or '')).strip()


def split_operator(mid):
    """"קו חדש     אצטדיון-רכבת" / "אצטדיון-אזה"ת קו חדש" / "שד' חיים בר לב -אגד תעבורה" → (מפעיל, תיאור)."""
    mid = clean(mid)
    for op in OPERATORS:
        m = re.search(r'(?<![א-ת"\'])' + re.escape(op) + r'(?![א-ת"\'])', mid)
        if m:
            desc = clean(mid[:m.start()] + ' ' + mid[m.end():])
            return op, desc.strip(' -–')
    return '', mid.strip(' -–')


def split_ends(desc):
    """"קריית גת-בית ניר" → ("קריית גת", "בית ניר"); בלי מקף — הכול מוצא."""
    parts = re.split(r'\s*[-–]\s*', desc, 1)
    if len(parts) == 2 and parts[0] and parts[1]:
        return parts[0].strip(), parts[1].strip()
    return desc, ''


def parse_group(text):
    """"קריית גת- קווים עירוניים" → ("קריית גת", "עירוני");  "קווי מ.א בני שמעון" → ("מ.א בני שמעון", "");
    "קווים בינעירוניים אחרים" → ("", "בינעירוני");  "קווי לילה" → ("", "לילה")."""
    t = clean(text)
    kind = ''
    for word, k in KINDS:
        if re.search(r'(?<![א-ת])' + word + r'(?![א-ת])', t):
            kind = k
            break
    area = re.sub(r'קווים?\s*(?:עירוניים|אזוריים|בינעירוניים|בין-עירוניים|אחרים|לילה|תלמידים)?|קווי\s*(?:לילה|תלמידים)?|\bאחרים\b', ' ', t)
    area = clean(area).strip(' -–:,')
    return area, kind


def assign_continuation(line, col, last, group):
    """שורת המשך: כל מקטע (מופרד ב-2 רווחים ומעלה) הולך לפי העמודה שלו — מימין לעמודת מספר הקו
    זה המשך שם הקבוצה ("קווים עירוניים"), משמאל לה זה המשך התיאור שנשבר ("מלכי ישראל")."""
    for seg in re.finditer(r'\S+(?: \S+)*', line):
        if col is not None and seg.start() >= col - 1:
            if group is not None:
                group['text'] = clean(group['text'] + ' ' + seg.group(0))
        elif last is not None:
            last['mid'] = last['mid'] + ' ' + seg.group(0)


def parse_pages(pages):
    """pages: [(מספר עמוד, טקסט)] רצופים, מהעמוד עם כותרת הטבלה. מחזיר שורות גולמיות."""
    rows = []
    group = None            # הקבוצה הנוכחית (עיר – סוג קווים), טקסט מצטבר
    last = None             # השורה האחרונה — שורות ההמשך (תיאור שנשבר, שם קבוצה שנשבר) מצטרפות אליה
    header_col = None
    for page, text in pages:
        page_rows = 0
        pending = []        # שורות המשך בראש עמוד, לפני השורה הראשונה בו — העמודות משתנות מעמוד לעמוד,
                            # לכן מסווגים אותן לפי השורה הראשונה של העמוד הזה
        for i, raw in enumerate(text.split('\n')):
            line = raw.rstrip()
            s = line.strip()
            if not s:
                continue
            if HEADER.search(line):
                # שורת הכותרת: "שירות   מפעיל קיים   תיאור   קו   קריית גת-" — הקבוצה הראשונה כתובה כבר בה
                m = re.search(r'(?<!\S)קו\s{2,}(\S.*)$', line)
                header_col = line.find('קו', line.find('תיאור')) if 'תיאור' in line else None
                if m:
                    group = {'text': m.group(1).strip()}
                last = None
                continue
            m = ROW.match(line)
            row = None
            if m:
                prev_group = group
                if m.group('grp'):
                    group = {'text': m.group('grp').strip()}
                row = {'svc': m.group('svc'), 'mid': m.group('mid'), 'num': m.group('num'), 'num_col': m.start('num'),
                       'group': group, 'page': page, 'line': i + 1}
            else:
                # לפעמים מספר הקו קפץ לסוף השורה, אחרי שם הקבוצה: "אזורי   קו חדש   באר שבע-   באר שבע -קווים 40"
                cells = re.split(r'\s{2,}', s)
                m2 = re.match(r'^(?P<grp>[^\d]+?)\s(?P<num>\d{1,3}[א-ת]?)$', cells[-1]) if len(cells) >= 3 else None
                if m2 and re.fullmatch(SERVICE, cells[0]) and not re.search(r'\d', ' '.join(cells[1:-1])):
                    prev_group = group
                    group = {'text': m2.group('grp').strip()}
                    row = {'svc': cells[0], 'mid': ' '.join(cells[1:-1]), 'num': m2.group('num'), 'num_col': line.rfind(cells[-1]),
                           'group': group, 'page': page, 'line': i + 1}
            if row:
                for pl in pending:
                    assign_continuation(pl, row['num_col'], last, prev_group)
                pending = []
                rows.append(row)
                last = row
                page_rows += 1
                continue
            if re.fullmatch(r'\d{1,3}', s):           # מספר עמוד
                continue
            if 'מפרט טכני' in s or re.match(r"^\s*חלק [א-ת]['׳]", s):
                continue
            if re.search(r'\d', s) or len(s.split()) > 4:
                # טקסט רץ / כותרת סעיף — אם כבר יש שורות, הטבלה נגמרה
                if rows and len(s.split()) >= 3:
                    print(f'  הטבלה נגמרה בעמוד {page}: "{s[:60]}"', flush=True)
                    return rows
                continue
            if page_rows == 0 and last is not None:
                pending.append(line)
                continue
            assign_continuation(line, header_col if last is None else last['num_col'], last, group)
        if not page_rows and rows:
            break
    return rows


def build_routes(rows):
    routes, seen = [], {}
    for r in rows:
        op, desc = split_operator(r['mid'])
        origin, dest = split_ends(desc)
        gtext = r['group']['text'] if r['group'] else ''
        area, kind = parse_group(gtext)
        base = f"pdf:{area or kind or 'כללי'}:{r['num']}"
        key = base
        if key in seen:
            seen[key] += 1
            key = f'{base}-{seen[base]}'
        else:
            seen[key] = 1
        routes.append({'key': [key, r['num'], '1', '#'], 'origin': origin, 'destination': dest, 'area': area,
                       'destinationArea': '', 'sheet': f"עמוד {r['page']}", 'row': r['line'], 'stops': [],
                       'service': r['svc'], 'operator': '' if op == 'קו חדש' else op, 'isNew': op == 'קו חדש',
                       'group': gtext, 'page': r['page']})
    return routes


def table_from_units(units):
    """units: [{'page','text'}] של מסמך אחד → (שורות, [עמוד ראשון, עמוד אחרון]) או (None, None)."""
    by_page = {u['page']: u.get('text') or '' for u in units if u.get('page')}
    starts = sorted(p for p, t in by_page.items() if HEADER.search(t) and 'תיאור' in t and any(ROW.match(l.rstrip()) for l in t.split('\n')))
    if not starts:
        return None, None
    p0 = starts[0]
    pages = [(p, by_page[p]) for p in sorted(by_page) if p >= p0]
    rows = parse_pages(pages)
    if len(rows) < MIN_ROWS:
        return None, None
    return build_routes(rows), [rows[0]['page'], rows[-1]['page']]


def route_counts(routes):
    return {'lines': len({(r['key'][0], r['key'][1]) for r in routes}), 'directionVariants': len({tuple(r['key']) for r in routes}), 'rows': len(routes)}


def main():
    from package_pipeline import STATE
    state = read(STATE, {'tenders': {}})
    feeds = read(ROOT / 'tenders-feed.json', {'items': []})['items'] + read(ROOT / 'archive-feed.json', {'items': []})['items']
    operating = {i['id'] for i in feeds if i.get('classification') == 'operating_tender'}
    index = read(ROOT / 'route-index.json', {'tenders': {}})
    made = 0
    for tid, tender in state['tenders'].items():
        if tid not in operating:
            continue
        meta = index['tenders'].get(tid)
        existing = []
        if meta:
            for f in meta.get('files', [meta.get('file')]):
                if f:
                    existing += read(ROOT / f, [])
        if any(v.get('source') != 'pdf-table' for v in existing):
            continue                     # יש נספח אקסל — הוא הקובע
        versions = []
        for doc in tender.get('documents', {}).values():
            sha = doc.get('sha256')
            if not sha or doc.get('status') != 'extracted':
                continue
            path = ROOT / 'text' / f'{sha}.json.gz'
            if not path.exists():
                continue
            try:
                units = json.loads(gzip.open(path).read().decode('utf-8')).get('units', [])
            except Exception:
                continue
            routes, pages = table_from_units(units)
            if not routes:
                continue
            versions.append({'sha256': sha, 'url': doc['url'], 'member': '', 'routes': routes,
                             'scope': f'טבלת הקווים מתוך המסמך עצמו (עמודים {pages[0]}–{pages[1]}). במסמך אין מק״טים.',
                             'source': 'pdf-table', 'pages': pages, 'counts': route_counts(routes), 'sourceStatus': 'current_download'})
            print(f'  {tid}: {len(routes)} קווים מטבלת ה-PDF, עמודים {pages[0]}–{pages[1]}', flush=True)
        if not versions:
            continue
        (ROOT / 'route-data').mkdir(exist_ok=True)
        filename = f'route-data/{tid}.json'
        (ROOT / filename).write_text(json.dumps(versions, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        index['tenders'][tid] = {'file': filename, 'versions': len(versions), 'rows': sum(len(v['routes']) for v in versions),
                                 'uniqueRoutes': len({tuple(r['key']) for v in versions for r in v['routes']}), 'source': 'pdf-table'}
        made += 1
    (ROOT / 'route-index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'טבלאות קווים מ-PDF: {made} מכרזים', flush=True)


if __name__ == '__main__':
    main()
