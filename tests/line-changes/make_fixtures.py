# -*- coding: utf-8 -*-
"""בונה מחדש את הנתונים הקבועים לבדיקת המצגות (tests/fixtures/line-changes/data) מתוך נתוני האתר.

הנתונים מועתקים פעם אחת ונשארים קבועים, כדי שהבדיקה תראה רק שינויים בקוד ולא שינויים בנתונים של הלילה.
מריצים את זה רק כשרוצים להחליף את המצגות שבבדיקה (ואז מעדכנים גם את התמונות-במילים, ראו README.md).

הרצה (מעותק של הריפו, בלי להוריד את כל תיקיית הנתונים):
    python3 tests/line-changes/make_fixtures.py            # קורא מ-origin/main בעזרת git show
    python3 tests/line-changes/make_fixtures.py <תיקייה>   # או מתיקיית data מקומית
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'fixtures', 'line-changes', 'data')

# המצגות שבבדיקה (ראו DECKS ב-decks.mjs): שינוי מסלול, תחנות שנוספו ובוטלו, רחוב מקביל, חלופה חדשה / שבוטלה,
# חלופה שהוחלפה (971), שינוי בלו"ז, קו חדש (גם בין ערים, הלוך וחזור — 827), קו שמבוטל
DECKS = ['10971-20261121', '10999-20261117', '10357-20261120', '10590-20261120', '11152-20261118', '10282-20261116', '10436-20261119-t',
         '14457-20261120', '12459-20261120', '10970-20261117', '10970-20261115-v', '12285-20261129-v',
         '70001-20261118-t', '45009-20261115-n', '71011-20261113-e', '11827-20261120-n',
         '72001-20261120-t']
BOARD_CITIES = ['קרית מלאכי', 'צפת']   # לוח לפי יעד של מקום (עיר): קרית מלאכי — בשני סדרי השעות; צפת — רוחב העמודות, ריקון תאים, מיון בשתי רמות
# לוח לפי יעד בלוד: קו 11 (רמלה–לוד, שלוש חלופות — צבע ואות לכל חלופה), סדר הקווים, וקו בין ערים סמוכות שנחשב עירוני;
# ולוח של מקום — שכונת גני איילון בלוד (כל הקווים האלה עוצרים בה)
LOD_LINES = ['36011', '68005', '53009', '32012', '31019', '14384', '12408', '11251', '15174', '21134', '36081', '11464', '12509', '11884']
BOARD_HOOD = ('גני איילון', 'לוד')


def reader(src):
    if src:
        return lambda p: open(os.path.join(src, p), encoding='utf-8').read()
    return lambda p: subprocess.run(['git', 'show', 'origin/main:line-changes/data/' + p], check=True,
                                    capture_output=True, text=True).stdout


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def stop_city_map(places):
    """קוד תחנה → עיר, מהרחובות והשכונות של places.json"""
    m = {}
    for x in places['streets'] + places['hoods']:
        for c in x[3] or []:
            m.setdefault(str(c), places['cities'][x[1]])
    return m


def add_cn(rec, cmap):
    """cn (כמה תחנות בכל עיר, מקביל ל-cs) — לנתונים מלפני שהבונה כתב אותו: לפי העיר של כל תחנה ב-places.json"""
    if 'cn' in rec or not rec.get('cs'):
        return
    cs, cn, j = rec['cs'], [0] * len(rec['cs']), 0
    for code in rec.get('sc') or []:
        c = cmap.get(str(code))
        if not c:
            continue
        if c != cs[j] and c in cs[j:]:
            j = cs.index(c, j)
        if c == cs[j]:
            cn[j] += 1
    rec['cn'] = cn


def hood_place(places):
    """השכונה של BOARD_HOOD, עם המקומות של הקווים שלה ברשימת הקווים של הנתונים הקבועים"""
    ci = places['cities'].index(BOARD_HOOD[1])
    h = next(x for x in places['hoods'] if x[0] == BOARD_HOOD[0] and x[1] == ci)
    return h


def main():
    rd = reader(sys.argv[1] if len(sys.argv) > 1 else None)
    idx = json.loads(rd('index.json'))
    idx['changes'] = [c for c in idx['changes'] if c['id'] in DECKS]
    idx['alias'] = {}
    missing = set(DECKS) - {c['id'] for c in idx['changes']}
    assert not missing, missing
    lines = json.loads(rd('lines.json'))
    cis = [lines['cities'].index(c) for c in BOARD_CITIES]
    makats = {c['makat'] for c in idx['changes']}
    board = {ln[0] for ln in lines['lines'] if any(ci in ln[5] for ci in cis)} | set(LOD_LINES)
    places = json.loads(rd('places.json'))
    hood = hood_place(places)
    all_lines = lines['lines']
    lines['lines'] = [ln for ln in all_lines if ln[0] in makats or ln[0] in board]
    # סוג הקו (lt) — מ-lines.json; מנתונים מלפני שהבונה כתב אותו — מ-data-main.json (קו פח), כמו בבונה
    if 'lt' not in lines:
        sys.path.insert(0, os.path.join(HERE, '..', '..', 'tools'))
        import tempfile
        import line_changes as LCB
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            f.write(subprocess.run(['git', 'show', 'origin/main:data-main.json'], check=True, capture_output=True, text=True).stdout)
        lines['lt'] = LCB.load_line_types(f.name)
        os.unlink(f.name)
    lines['lt'] = {ln[0]: lines['lt'][ln[0]] for ln in lines['lines'] if ln[0] in lines['lt']}
    pos = {ln[0]: i for i, ln in enumerate(lines['lines'])}
    hood_lines = [pos[all_lines[i][0]] for i in hood[2] if all_lines[i][0] in pos]
    dump(os.path.join(OUT, 'index.json'), idx)
    dump(os.path.join(OUT, 'lines.json'), lines)
    dump(os.path.join(OUT, 'places.json'), {'gen': lines['gen'], 'cities': [BOARD_HOOD[1]], 'streets': [],
                                            'hoods': [[hood[0], 0, hood_lines, hood[3]]]})
    cmap = stop_city_map(places)
    for i in DECKS:
        dump(os.path.join(OUT, 'l', i + '.json'), json.loads(rd('l/' + i + '.json')))
    keep = makats | board
    for n in range(64):
        sh = json.loads(rd('tt/%d.json' % n))
        sh['lines'] = {k: v for k, v in sh['lines'].items() if k in keep}
        for v in sh['lines'].values():
            for rec in v['d'].values():
                add_cn(rec, cmap)
        dump(os.path.join(OUT, 'tt', '%d.json' % n), sh)
    print('decks', len(DECKS), '| lines', len(lines['lines']), '| board lines', len(board))


if __name__ == '__main__':
    main()
