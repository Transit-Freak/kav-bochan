"""מוניות שירות מנתוני חופש המידע (tools/foi_taxi.py): זיהוי, בלי מספר קו משוער, וקישור לקו שהמשיך."""
import collections
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'tools'))
import foi_taxi as ft  # noqa: E402
import import_foi_routes as imp  # noqa: E402

NOTE = ('נתוני משרד התחבורה (חופש מידע, "מסלול לפי שנים"): מופיע בקובץ לראשונה ב-2014 (עד 15.02.2019). '
        'ייתכן שנסע גם קודם. הקו מוכר רק מהקובץ הזה: מספר הקו משוער לפי המק״ט, המפעיל אינו ידוע, '
        'והמפה מחברת את התחנות בקווים ישרים.')

CENTRAL = ['44212', 'תחנת מוניות תל אביב תחנה מרכזית', 32.0565, 34.7794]
READING = ['44089', 'תחנת מוניות תל אביב מסוף רדינג', 32.1048, 34.7956]
READING2 = ['44090', 'תחנת מוניות תל אביב מסוף רדינג', 32.1047, 34.7957]
TAMCHAT = ['44213', 'תחנת מוניות תל אביב תמחת', 32.0566, 34.7795]
BAVLI = ['44095', 'תחנת מוניות תל אביב שכונת בבלי', 32.0961, 34.8033]


def foi_line(rd, a, b, city_a='תל אביב -יפו', city_b='תל אביב -יפו', line=None):
    """קובץ קו דחוס כמו שהייבוא כותב (גרסה אחת, שתי תחנות)."""
    return {'rd': rd, 'line': line or str(int(rd.split('-')[0][-3:])),
            'dest': f'{a[1]}-{city_a}<->{b[1]}-{city_b}', 'op': '', 'tt': None, 'ty': '', 'lineGuess': 1,
            'versions': [{'d': '2019-02-15', 'src': 'mot-foi', 'stops': [0, 1], 'shp': '', 'ap': 'r',
                          'k': 'baseline', 'note': NOTE}],
            'historicalOnly': True, 'foiOnly': 1, 'pool': [a, b]}


def gtfs_line(rd, line, a, b, d='2019-07-18'):
    return {'rd': rd, 'line': line, 'dest': '', 'op': 'מוניות', 'tt': 'taxi',
            'versions': [{'d': d, 'k': 'baseline', 'src': 'tf', 'stops': [0, 1], 'shp': 1}],
            'pool': [a, b], 'spool': ['', '_p~iF~ps|U_ulLnnqC']}


def write(d, lf):
    p = Path(d) / f"{ft.fsafe(lf['rd'])}.json"
    p.write_text(json.dumps(lf, ensure_ascii=False), encoding='utf-8')


def test_detect_taxi():
    jer = ['44001', 'תחנת מוניות ירושלים תחנה מרכזית', 31.789, 35.203]
    assert ft.is_foi_taxi(foi_line('5230112-1-0', jer, TAMCHAT, 'ירושלים'))
    # תחנה אחת בלבד בשם "תחנת מוניות" מספיקה (המוצא השני הוא תחנת רחוב)
    street = ['55555', 'דרך אכסאל/א-סלאם', 32.7, 35.3]
    assert ft.is_foi_taxi(foi_line('4230157-1-0', street, ['1', 'תחנת מוניות המגינים חיפה', 32.8, 35.0]))
    # לא מונית: קו אוטובוס בן שתי תחנות, מק"ט קצר, יותר משתי תחנות, או קו שיש לו תיעוד מעבר לקובץ
    assert not ft.is_foi_taxi(foi_line('5230112-1-0', ['1', 'הרצל/ויצמן', 32, 34], ['2', 'ביאליק', 32, 34]))
    assert not ft.is_foi_taxi(foi_line('10957-1-#', jer, TAMCHAT))
    three = foi_line('5230112-1-0', jer, TAMCHAT)
    three['pool'].append(BAVLI)
    three['versions'][0]['stops'] = [0, 2, 1]
    assert not ft.is_foi_taxi(three)
    official = foi_line('5230112-1-0', jer, TAMCHAT)
    del official['foiOnly']
    assert not ft.is_foi_taxi(official)


def test_no_guessed_number(tmp_path):
    jer = ['44001', 'תחנת מוניות ירושלים תחנה מרכזית', 31.789, 35.203]
    lf = foi_line('5230112-1-0', jer, TAMCHAT, 'ירושלים')
    assert ft.apply(lf, tmp_path)
    assert lf['tt'] == 'taxi' and lf['line'] == '' and 'lineGuess' not in lf and 'foiNext' not in lf
    assert lf['dest'] == 'ירושלים תחנה מרכזית-ירושלים<->תל אביב תמחת-תל אביב יפו'
    note = lf['versions'][0]['note']
    assert 'משוער' not in note and 'המפעיל אינו ידוע, והמפה מחברת את התחנות בקווים ישרים.' in note
    # אידמפוטנטי
    again = copy.deepcopy(lf)
    assert not ft.apply(again, tmp_path) and again == lf


def test_confirmed_numbers_and_successors(tmp_path):
    write(tmp_path, gtfs_line('90004-1-#', '4', ['44210', 'תחנת מוניות תמח\'\'ת', 32.0566, 34.7795], READING))
    write(tmp_path, gtfs_line('90004-2-#', '4', READING2, ['44281', 'תחנת מוניות ההגנה', 32.0545, 34.7860]))
    write(tmp_path, gtfs_line('87005-1-א', '5א', ['44210', 'תחנת מוניות תמח\'\'ת', 32.0566, 34.7795], BAVLI))
    write(tmp_path, gtfs_line('87005-2-א', '5א', BAVLI, CENTRAL))
    cases = {
        '5104104-1-0': (CENTRAL, READING, '4', '90004-1-#'),
        '5104104-2-0': (READING2, CENTRAL, '4', '90004-2-#'),
        '5104104-1-2': (TAMCHAT, BAVLI, '5א', '87005-1-א'),
        '5104104-2-2': (BAVLI, CENTRAL, '5א', '87005-2-א'),
        '5104104-3-1': (READING2, READING, '', None),   # רדינג ↔ רדינג: לא ברור איזה קו
    }
    for rd, (a, b, line, nxt) in cases.items():
        lf = foi_line(rd, a, b)
        ft.apply(lf, tmp_path)
        assert lf['line'] == line, rd
        assert (lf.get('foiNext') or {}).get('rd') == nxt, rd
        if nxt:
            assert lf['foiNext'] == {'rd': nxt, 'line': line, 'd': '2019-07-18'}
            assert 'והמפה מציגה את המסלול של הקו שהמשיך אותו.' in lf['versions'][0]['note']


def test_line_16_direction_and_missing_successor(tmp_path):
    kov = ['44203', 'תחנת מוניות תל אביב הכובשים', 32.0663, 34.7660]
    rg = ['44029', 'תחנת מוניות רמת גן דרך הטייסים', 32.0662, 34.8200]
    rg2 = ['44028', 'תחנת מוניות רמת גן דרך הטייסים', 32.0661, 34.8201]
    lf = foi_line('5208160-2-0', rg2, kov, 'רמת גן')
    ft.apply(lf, tmp_path)   # אין עדיין קבצי 52016: המספר כן, הקישור לא
    assert lf['line'] == '16' and 'foiNext' not in lf
    write(tmp_path, gtfs_line('52016-1-#', '16', rg, kov, '2020-10-01'))
    write(tmp_path, gtfs_line('52016-2-#', '16', kov, rg, '2020-10-01'))
    ft.apply(lf, tmp_path)
    assert lf['foiNext']['rd'] == '52016-1-#'


def test_beer_sheva_ofakim_not_linked(tmp_path):
    bs = ['44006', 'תחנת מוניות באר שבע יצחק בן צבי', 31.25, 34.79]
    ofa = ['44009', 'תחנת מוניות אופקים שדרות הרצל', 31.31, 34.62]
    lf = foi_line('3215116-1-0', bs, ofa, 'באר שבע', 'אופקים')
    ft.apply(lf, tmp_path)
    assert lf['line'] == '' and 'foiNext' not in lf


def test_importer_marks_taxi(tmp_path):
    def st(s, city):
        return (s[0], s[1], str(s[2]), str(s[3]), city)
    foi_vs = {'1': {'max': '2019-02-12', 'trips': {2014: 300}, 'years': {2014},
                    'stops': [st(CENTRAL, 'תל אביב -יפו'), st(READING, 'תל אביב -יפו')]}}
    stats = collections.Counter()
    lf = imp.build('5104104-1-0', foi_vs, {}, imp.Names(None), {}, stats, tmp_path)
    assert lf['tt'] == 'taxi' and lf['line'] == '4' and 'lineGuess' not in lf
    assert 'משוער' not in lf['versions'][0]['note'] and stats['taxi'] == 1
    foi_vs['1']['stops'] = [st(TAMCHAT, 'תל אביב -יפו'), st(['44300', 'תחנת מוניות אשדוד מונטיפיורי', 31.77, 34.62], 'אשדוד')]
    lf = imp.build('5225112-1-0', foi_vs, {}, imp.Names(None), {}, stats, tmp_path)
    assert lf['line'] == '' and lf['tt'] == 'taxi'
    # קו אוטובוס רגיל מהקובץ — מספר משוער כמו קודם
    foi_vs['1']['stops'] = [st(['1', 'הרצל/ויצמן', 32, 34], 'חולון'), st(['2', 'ביאליק', 32, 34], 'חולון'),
                            st(['3', 'סוקולוב', 32, 34], 'חולון')]
    lf = imp.build('2310025-1-0', foi_vs, {}, imp.Names(None), {}, stats, tmp_path)
    assert lf['line'] == '25' and lf.get('lineGuess') == 1 and not lf.get('tt')
    assert 'מספר הקו משוער' in lf['versions'][0]['note']
