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


# עמוד כמו במסמכי משרד התחבורה (חילוץ pdftotext: תבליטים בסוף השורה, סוגריים הפוכים)
HAIFA = """                                   קווים חדשים      34.1
                                                                 המכרז לא כולל קווים חדשים.
                                       שינויים בקווים קיימים      34.2
                 שינוי תדירות בלבד :קווים  )10014( 14 ,)11013( 13 ,)10006( 6ו.)10016( 16-     •
                                          שינוי מסלול בלבד :קווים .)25041( 41 ,)10010( 10     •
שינוי מסלול ותדירות :קווים 36 ,)10024( 24 ,)10020( 20 ,)10018( 18 ,)10017( 17 ,)11009( 9      •
                                  ( )10042( 42 ,)10040( 40 ,)10038( 38 ,)10036ו.)10076( 76-
                                                               קווים מבוטלים      34.3
                                                  קו .)12224( 224 ,)14217( 217 ,)10019( 19    •
                                                                     קווי לילה    34.4
אשכול זה אינו כולל קווי לילה .במרחב האשכול פועלים מספר קווי לילה שרובם מופעלים
"""

DGD = """                                                        34.1.1קווים חדשים
המכרז כולל שני קווים חדשים ,וחלופה חדשה בקו קיים שמהווה שינוי מסלול
• קו  – 199קו חדש מבת ים לחולון ,מספק שירות מהיר ממרכז בת ים לאזור
התעשייה בדרום מזרח חולון.
• קו  – 13קו חדש מבאר יעקב לאזור התעשייה בחולון ,דרך מרכז ראשל"צ.
                         מהווה קו מכין לקו הסגול של הרכבת הקלה.
                                                     34.1.2שינויים בקווים קיימים –
קו ( 19מק"ט  – )18019אין שינוי במכרז ,אך יצוין כי מסלול הקו צפוי להשתנות   •
                                     יותאם המסלול לציר שייקבע בהמשך.
קו  – 144מסלול הקו כיום הוא מחולון לבסיס בן עמי דרך רמלה ולוד .במסגרת      •
המכרז ישונה מסלול הקו כך שמסלול הבסיס הנוכחי יהפוך לחלופה ,ומסלול
הקו העיקרי יהיה מחולון לנתב"ג דרך בת ים ורמלה ,בתדירות מתוגברת ביחס
      34.1.3קווים מבוטלים – הקווים יבוטלו בסבירות גבוהה עוד לפני כניסת הזוכה
קו  – )22083( 83מתוכנן לביטול במסגרת שינויים והתאמות לאחר פתיחת            •
                      הרק"ל ,נכון להיום טרם נקבע מועד לביטול הקו.
קו 7 ימשיך לפעול ללא שינוי במסלולו הנוכחי דרך כביש 6.                       •
"""


def test_category_lists_with_makats_haifa_style():
    found, notes = line_changes.scan_units([{'page': 71, 'text': HAIFA}], 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    by = {tuple(f['numbers']): f for f in found}
    assert by[('14', '13', '6', '16')]['makats'] == ['10014', '11013', '10006', '10016']
    assert by[('14', '13', '6', '16')]['tags'] == ['שינוי תדירות']
    assert by[('41', '10')]['tags'] == ['שינוי מסלול']
    # שורת ההמשך של הרשימה נקראת גם היא: 36, 38, 40, 42 ו-76 עם המק"טים שלהם
    both = next(f for f in found if '36' in f['numbers'])
    assert both['numbers'] == ['36', '24', '20', '18', '17', '9', '42', '40', '38', '76']
    assert set(both['makats']) >= {'10036', '10038', '10040', '10042', '10076', '11009'}
    assert both['tags'] == ['שינוי מסלול', 'שינוי תדירות']
    canc = by[('224', '217', '19')]
    assert canc['tags'] == ['ביטול'] and canc['section'] == 'קווים מבוטלים' and canc['makats'] == ['12224', '14217', '10019']
    assert '(10014) 14' in by[('14', '13', '6', '16')]['quote']          # הסוגריים ההפוכים תוקנו
    secs = {(n['section'], n['quote']) for n in notes}
    assert ('קווים חדשים', 'המכרז לא כולל קווים חדשים.') in secs
    assert all(f['page'] == 71 and f['url'].endswith('#page=71') and f['sha256'] == 'abc' for f in found)


def test_bulleted_items_south_gush_dan_style():
    found, notes = line_changes.scan_units([{'page': 67, 'text': DGD}], 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    by = {tuple(f['numbers']): f for f in found}
    assert 'קו חדש' in by[('199',)]['tags'] and by[('199',)]['section'] == 'קווים חדשים'
    assert by[('199',)]['quote'].endswith('חולון.')                         # שורת ההמשך צורפה
    assert 'קו חדש' in by[('13',)]['tags'] and 'מכין' in by[('13',)]['quote']
    l19 = by[('19',)]
    assert l19['makats'] == ['18019'] and 'ללא שינוי' in l19['tags'] and 'שינוי מסלול' in l19['tags']
    l144 = by[('144',)]
    assert l144['makats'] == [] and 'שינוי מסלול' in l144['tags'] and 'שינוי תדירות' in l144['tags']
    assert by[('83',)]['makats'] == ['22083'] and 'ביטול' in by[('83',)]['tags'] and by[('83',)]['section'] == 'קווים מבוטלים'
    assert by[('7',)]['tags'] == ['ללא שינוי', 'ביטול'] or by[('7',)]['tags'][0] == 'ללא שינוי'
    assert '6' not in by[('7',)]['numbers']                                # "כביש 6" אינו קו
    # הערת סעיף: "המכרז כולל שני קווים חדשים…" ו"הקווים יבוטלו בסבירות גבוהה…"
    joined = ' '.join(n['quote'] for n in notes)
    assert 'המכרז כולל שני קווים חדשים' in joined and 'בסבירות גבוהה' in joined


def test_tables_and_unrelated_numbers_are_skipped():
    units = [{'page': 1, 'rows': [['קו', '5']], 'text': 'קו 5 יבוטל'},
             {'page': 2, 'text': 'בשנת 2023 הופעלו 48 קווים בתדירות גבוהה.\nקו הרכבת הראשי עובר בחיפה.'},
             # משפט שרק מתחיל במילים "קווים חדשים" אינו כותרת סעיף, ולא יוצר הערת סעיף
             {'page': 7, 'text': 'קווים חדשים שלא הופעלו עד כה באשכול זה כמפורט בחלק ד\' ובנספח ב\' (להלן: "קווי דרום\nגוש דן" או "האשכול").\nהזוכה בהליך התחרותי יקבל רישיונות להפעלת קווי שירות באוטובוסים.'},
             # נספח נוהל פרסום: טבלת "סוג השינוי" עם המילים "קווים חדשים" ושורה שמתחילה ב"קווים (4 קווים ומעלה…"
             {'page': 310, 'text': '  פנימי   סיווג:\n  01.20.01-00  מספר הוראה:  הרשות הארצית לתחבורה\n  נוהל פרסום מידע לציבור  שם ההוראה:\n  קווים חדשים\n  קווים ( 4קווים ומעלה יש להציב מדבקות /קאפות או קו בודד עם מעל 60נסיעות ביום),'}]
    found, notes = line_changes.scan_units(units, 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    assert found == []
    assert notes == []


def test_overview_counts_are_not_headers_and_descriptions_are_not_changes():
    # "47 קווי תלמידים הכוללים…" הוא ספירה בסקירה הכללית, לא כותרת סעיף; ותיאור המטרונית בעמוד הבא אינו שינוי
    units = [{'page': 69, 'text': ' 72קווים עירוניים סדירים הכוללים שירות פנימי בחיפה          •\n 47קווי תלמידים הכוללים שירות פנימי בחיפה ,שירות פנימי בטירת כרמל   •\n'},
             {'page': 70, 'text': 'קו  1פועל  24שעות ביממה ,שבעה ימים בשבוע        •\nקו  2מחבר בין קריית אתא לחיפה ופועל משעות הבוקר       •\n'}]
    found, notes = line_changes.scan_units(units, 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    assert found == [] and notes == []


def test_section_notes_are_limited_to_the_header_page():
    text = '                     קווי לילה    34.4\nאשכול זה אינו כולל קווי לילה .במרחב האשכול פועלים מספר קווי לילה\n' + 'שורה נוספת בתוך הסעיף\n' * 10
    found, notes = line_changes.scan_units([{'page': 71, 'text': text}, {'page': 72, 'text': 'עוד טקסט שאינו קשור\nהמפעיל מחויב לנסות ולמנוע\n'}], 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    # שורות עוקבות מתאחדות לפסקה אחת, רק בעמוד הכותרת, ורק עד תקציב השורות
    assert len(notes) == 1 and notes[0]['page'] == 71
    assert notes[0]['quote'].startswith('אשכול זה אינו כולל קווי לילה')
    assert notes[0]['quote'].count('שורה נוספת') == line_changes.NOTE_BUDGET - 1


def test_section_continues_to_next_page():
    units = [{'page': 68, 'text': '                34.1.2שינויים בקווים קיימים\nקו ( 133מק"ט )11133באזור גבעת זאב – הגדלת תדירות •\n'},
             {'page': 69, 'text': 'חלק ד\' – מפרט טכני\nקו ( 401מק"ט – )11401תגבור תדירות •\n'},
             {'page': 70, 'text': "חלק ה' – ההסכם\nקו 5 יבוטל •\n"}]
    found, _ = line_changes.scan_units(units, 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    by = {tuple(f['numbers']): f for f in found}
    assert by[('133',)]['section'] == 'שינויים בקווים קיימים'
    assert by[('401',)]['section'] == 'שינויים בקווים קיימים'      # הרשימה נמשכה לעמוד הבא
    assert by[('5',)]['section'] is None                             # "חלק ה'" סיים את הסעיף


import tender_sections  # noqa: E402


def test_section_headers_are_recognized_and_sentences_are_not():
    assert tender_sections.header('38.2 מספר האוטובוסים ,תמהילם ומאפייניהם') == ('38.2', 'מספר האוטובוסים ,תמהילם ומאפייניהם')
    assert tender_sections.header('                                  מצבת האוטובוסים      38') == ('38', 'מצבת האוטובוסים')
    assert tender_sections.header('                       34.1קווים חדשים') == ('34.1', 'קווים חדשים')
    assert tender_sections.header('12 חודשים ממועד ההודעה על הזכייה ותקופת ההפעלה של שלב ב') is None    # כמות, לא סעיף
    assert tender_sections.header('כללי    .1') is None                                                   # שורת תוכן עניינים
    assert tender_sections.header('3.2 תאגיד רשום בישראל.') is None                                       # משפט קצר עם נקודה
    assert tender_sections.header('1.7 בוטל') is None
    # תחילת סעיף ממוספר ארוך מתקבלת (מספר מנוקד), ומספר בודד בתחילת שורה ארוכה לא
    long_clause = '2.2אי ביצוע של לפחות  2נסיעות (בתקופת היום) או אי ביצוע גדול מ( 4.5%-הגבוה מהשניים),'
    assert tender_sections.header(long_clause) == ('2.2', 'אי ביצוע של לפחות 2נסיעות (בתקופת היום) או אי ביצוע גדול מ( 4.5%-הגבוה מהשניים),')
    assert tender_sections.header(' .1על מעשה או מחדל של החברה ,המהווים אי-עמידה ברמת ובתנאי שירות ,אי-עמידה בהוראות ההסכם') is None
    assert tender_sections.header('3.5 מיליון ₪ לשנה') is None


def test_numbers_and_topics():
    nums = tender_sections.numbers_in('מפעיל השירות יהיה זכאי למענק בסך 30אלף ₪ בגין כל נהג ,עד לתקרה של 45נהגים ,בתוך 18 חודשים. משקל המחיר 35%')
    assert '30 אלף ₪' in nums and '45 נהגים' in nums and '18 חודשים' in nums and '35%' in nums
    assert '500 ₪' in tender_sections.numbers_in('לתקופת יום בקו ,שאינו מוגדר כקו בתדירות נמוכה.₪ 500 -')
    assert 'צי הרכבים' in tender_sections.topics_for('מצבת האוטובוסים', [])
    assert 'צי הרכבים' not in tender_sections.topics_for('קבלה של מידע כאמור או גילויו', [])   # "גילויו" אינו "גיל"
    assert tender_sections.topics_for('שורה בלי מילת נושא', ['ערבויות']) == ['ערבויות']        # ירושה מהסעיף שמעל


def test_parse_document_splits_sections_and_inherits_topics():
    page = "חלק ד' - מפרט טכני\n                                  מצבת האוטובוסים      38\nסוגי אוטובוסים 38.1\nבקווים הכלולים באשכול זה יופעלו אוטובוסים עירוניים.\n38.2 מספר האוטובוסים ,תמהילם ומאפייניהם\nהמספר הכולל של הרכבים באשכול לא יפחת מ 120 אוטובוסים.\n"
    toc, secs = tender_sections.parse_document([{'page': 78, 'text': page}])
    by = {s['n']: s for s in secs}
    assert [e['n'] for e in toc] == ['38', '38.2'] or [e['n'] for e in toc] == ['38', '38.1', '38.2']
    assert 'צי הרכבים' in by['38']['topics'] and 'צי הרכבים' in by['38.2']['topics']
    assert '120 אוטובוסים' in by['38.2']['numbers']
    assert by['38.2']['p'] == 78


def test_annex_cover_page_gives_its_topic_to_the_clauses_inside():
    cover = '   נספח כ"ו\n\nפיצויים מוסכמים\n'
    body = ' נספח פיצויים מוסכמים מראש בגין אי-עמידה ברמת שירות ("הפרה")\n .2גובה הפיצויים המוסכמים יעמוד על הסכומים המפורטים להלן לכל הפרה המפורטת בפסקאות הבאות\n 2.2אי ביצוע של לפחות  2נסיעות (בתקופת היום) או אי ביצוע גדול מ( 4.5%-הגבוה מהשניים),\n                                 לתקופת יום בקו ,שאינו מוגדר כקו בתדירות נמוכה.₪ 500 -\n2.3 חריגה מלוח הזמנים\nיציאה מוקדמת מתחנת המוצא – 200 ₪ לכל נסיעה.\n'
    toc, secs = tender_sections.parse_document([{'page': 243, 'text': cover}, {'page': 244, 'text': body}])
    by = {s['n']: s for s in secs}
    assert set(by) == {'2.2', '2.3'}
    assert 'קנסות ופיצויים' in by['2.2']['topics'] and 'קנסות ופיצויים' in by['2.3']['topics']
    assert '500 ₪' in by['2.2']['numbers'] and '4.5%' in by['2.2']['numbers']
    assert '200 ₪' in by['2.3']['numbers']


def test_brief_is_the_key_sentence_in_plain_words():
    s = tender_sections.simplify('מפעיל השירות יהיה זכאי למענק בסך 30אלף ₪בגין כל נהג ,עד לתקרה של 45נהגים ,בתוך 18 חודשים ממועד תחילת ההפעלה.')
    assert s == 'המפעיל יקבל מענק של 30 אלף ₪ על כל נהג, עד 45 נהגים, בתוך 18 חודשים ממועד תחילת ההפעלה.'
    assert tender_sections.simplify('למען הסר ספק מובהר ,כי הממשלה רשאית לקזז את הסכומים כאמור מהתשלומים.') == 'הממשלה יכולה לקזז את הסכומים מהתשלומים.'
    assert tender_sections.simplify('שני ( )2עותקים של ההצעה ,כשהם כוללים את כל הנספחים -עותק אחד מקור.') == 'שני (2) עותקים של ההצעה, כשהם כוללים את כל הנספחים - עותק אחד מקור.'
    # המשפט עם המספרים נבחר, לא משפט-המסגרת המשפטי; הכותרת נשארת לפני
    b = tender_sections.brief_of('מצבת האוטובוסים', 'למען הסר ספק ,האמור בסעיף זה כפוף לנספח ב\' .המספר הכולל של הרכבים באשכול לא יפחת מ 120-אוטובוסים.', ['צי הרכבים'])
    assert b == 'מצבת האוטובוסים: המספר הכולל של הרכבים באשכול יהיה לפחות 120 אוטובוסים.'
    # שורת טבלה (רצף מספרים) לא נבחרת; המשפט המוביל כן, ומשפט מוביל שמסתיים בנקודתיים מקבל את הבא
    t = 'המפעיל יקבל תשלום בגין הצטיידות באוטובוסים כדלקמן: 52.2.1.1 בגין אוטובוס עירוני סך של. ₪ 155,000 52.2.1.2 בגין אוטובוס מפרקי. ₪ 205,000'
    assert tender_sections.brief_of('52.2.1 ' + t, '', ['תמורה ותשלומים']).startswith('52.2.1 המפעיל יקבל תשלום על הצטיידות באוטובוסים כדלקמן: 52.2.1.1 על אוטובוס עירוני סך של 155,000 ₪.')
    assert tender_sections.brief_of('פיצויים', 'שיעור יומי סכום הפיצוי 0 1.0% 0% 63 1.5% 1.0% 93 2.5% 1.5%. הפיצוי ישולם תוך 30 ימים.', ['קנסות ופיצויים']) == 'פיצויים: הפיצוי ישולם תוך 30 ימים.'
    assert tender_sections.simplify('במשך כל תקופת ההתקשרות בהתאם להליך תחרותי זה, בהתאם לאמור בסעיף 5.') == 'במשך כל תקופת ההתקשרות לפי מכרז זה, לפי סעיף 5.'
    long = tender_sections.brief_of('כללי', 'מילה ' * 120, [])
    assert len(long) <= 191 and long.endswith('…')
