# -*- coding: utf-8 -*-
"""בדיקות לכלי המכרזים שעובדים בלי מודל שפה: השוואה להיום וציטוטי שינויי קווים.
הרצה: python3 -m pytest tests/ -q
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tenders', 'scripts'))

import compare_today  # noqa: E402
import line_changes  # noqa: E402


def test_by_makat_groups_directions_and_names_operator():
    routes = {'1': ['3', '6א', 'שוק הפשפשים-חיפה<->הגפן-חיפה-1#', '10006-1-#'],
              '2': ['3', '6', 'שוק הפשפשים-חיפה<->שוק הפשפשים-חיפה-3#', '10006-3-#'],
              '3': ['25', '1', 'א-יבנה<->ב-יבנה-1#', '67001-1-#'],
              '4': ['25', 'x', 'bad', '']}
    out = compare_today.by_makat(routes, {'3': 'אגד', '25': 'אלקטרה אפיקים'})
    assert set(out) == {'10006', '67001'}
    assert out['10006']['operator'] == 'אגד'
    assert out['10006']['directions'] == ['10006-1-#', '10006-3-#']
    assert out['10006']['name'] == 'שוק הפשפשים-חיפה'


def test_match_cluster_prefers_contained_name_and_refuses_ties():
    names = {'חיפה עירוני', 'חיפה פרברי', 'דרום גוש דן', 'צפון הנגב', 'הנגב'}
    assert compare_today.match_cluster('חיפה עירוני מזרח', names) == 'חיפה עירוני'
    assert compare_today.match_cluster('דרום גוש דן', names) == 'דרום גוש דן'
    assert compare_today.match_cluster('צפון הנגב', names) == 'צפון הנגב'     # הארוך שמוכל, לא "הנגב"
    assert compare_today.match_cluster('מטה בנימין ומעלה אדומים', names) is None
    assert compare_today.match_cluster(None, names) is None


PAGE = """3.4 שינויים בקווים

קו 199 – קו חדש בין בת ים לחולון, שמטרתו לחבר את מרכז בת ים עם אזור התעשייה
בדרום מזרח חולון.

קו 144: המסלול המרכזי ישונה ויעבור דרך בת ים ורמלה, בתגבור התדירות.

קווים 4 ו-N4 יאוחדו לחלופה אחת לפי מסלול קו 4.
בשלב ב' יבוטלו הקווים 19, 217 ו-224. הביטול אינו מוסיף קווים למצבת ההפעלה.
קו 7 ימשיך לפעול ללא שינוי במסלולו הנוכחי.
"""


def test_paragraphs_start_at_line_headers_and_carry_numbers():
    ps = line_changes.paragraphs(PAGE)
    heads = [p['numbers'] for p in ps]
    assert ['199'] in heads and ['144'] in heads and ['4', 'N4'] in heads and ['7'] in heads
    p199 = next(p for p in ps if p['numbers'] == ['199'])
    assert len(p199['lines']) == 2          # פסקה נמשכת עד השורה הריקה


def test_scan_units_keeps_only_change_paragraphs_with_tags():
    units = [{'page': 66, 'text': PAGE}, {'page': 67, 'rows': [['a']], 'text': 'קו 5 יבוטל'}]
    found = line_changes.scan_units(units, 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    by = {tuple(f['numbers']): f for f in found}
    assert 'קו חדש' in by[('199',)]['tags'] and by[('199',)]['page'] == 66 and by[('199',)]['url'].endswith('#page=66')
    assert 'שינוי מסלול' in by[('144',)]['tags'] and 'שינוי תדירות' in by[('144',)]['tags']
    assert 'איחוד' in by[('4', 'N4')]['tags']
    assert ('19', '217', '224') in by and 'ביטול' in by[('19', '217', '224')]['tags']
    assert by[('7',)]['tags'] == ['ללא שינוי']   # "ללא שינוי במסלולו" אינו שינוי מסלול
    assert all(f['sha256'] == 'abc' for f in found)
    # טבלאות (rows) לא נסרקות כפסקאות
    assert not any(f['page'] == 67 for f in found)
