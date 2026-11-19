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
# חלופה שהוחלפה (971), שינוי בלו"ז, קו חדש, קו שמבוטל
DECKS = ['10971-20261121', '10999-20261117', '10357-20261120', '10590-20261120', '11152-20261118', '10282-20261116',
         '14457-20261120', '12459-20261120', '10970-20261117', '10970-20261115-v', '12285-20261129-v',
         '70001-20261118-t', '45009-20261115-n', '71011-20261113-e']
BOARD_CITY = 'קרית מלאכי'   # לוח לפי יעד של מקום (עיר), בשני סדרי השעות


def reader(src):
    if src:
        return lambda p: open(os.path.join(src, p), encoding='utf-8').read()
    return lambda p: subprocess.run(['git', 'show', 'origin/main:line-changes/data/' + p], check=True,
                                    capture_output=True, text=True).stdout


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def main():
    rd = reader(sys.argv[1] if len(sys.argv) > 1 else None)
    idx = json.loads(rd('index.json'))
    idx['changes'] = [c for c in idx['changes'] if c['id'] in DECKS]
    idx['alias'] = {}
    missing = set(DECKS) - {c['id'] for c in idx['changes']}
    assert not missing, missing
    lines = json.loads(rd('lines.json'))
    ci = lines['cities'].index(BOARD_CITY)
    makats = {c['makat'] for c in idx['changes']}
    board = {ln[0] for ln in lines['lines'] if ci in ln[5]}
    lines['lines'] = [ln for ln in lines['lines'] if ln[0] in makats or ln[0] in board]
    dump(os.path.join(OUT, 'index.json'), idx)
    dump(os.path.join(OUT, 'lines.json'), lines)
    dump(os.path.join(OUT, 'places.json'), {'gen': lines['gen'], 'cities': [], 'streets': [], 'hoods': []})
    for i in DECKS:
        dump(os.path.join(OUT, 'l', i + '.json'), json.loads(rd('l/' + i + '.json')))
    keep = makats | board
    for n in range(64):
        sh = json.loads(rd('tt/%d.json' % n))
        sh['lines'] = {k: v for k, v in sh['lines'].items() if k in keep}
        dump(os.path.join(OUT, 'tt', '%d.json' % n), sh)
    print('decks', len(DECKS), '| lines', len(lines['lines']), '| board lines', len(board))


if __name__ == '__main__':
    main()
