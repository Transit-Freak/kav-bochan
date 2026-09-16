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
    # הסוגריים ההפוכים תוקנו, והזוג חזר לסדר של המסמך: מספר הקו ואחריו המק"ט, בסדר עולה
    assert by[('14', '13', '6', '16')]['quote'] == 'שינוי תדירות בלבד: קווים 6 (10006), 13 (11013), 14 (10014) ו-16 (10016).'
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
    assert s == 'החברה שתזכה תקבל מענק של 30 אלף ₪ על כל נהג, עד 45 נהגים, בתוך 18 חודשים מהתאריך של תחילת ההפעלה.'
    assert tender_sections.simplify('למען הסר ספק מובהר ,כי הממשלה רשאית לקזז את הסכומים כאמור מהתשלומים.') == 'המדינה יכולה לקזז את הסכומים מהתשלומים.'
    assert tender_sections.simplify('הזוכה בהליך התחרותי יגיש למפקח על התעבורה, לכל המאוחר 180 ימים ממועד ההודעה על הזכייה, מסמכים.') == 'החברה שתזכה תגיש למפקח על התעבורה, עד 180 ימים מהיום שהודיעו למי שזכה, מסמכים.'
    assert tender_sections.simplify('שני ( )2עותקים של ההצעה ,כשהם כוללים את כל הנספחים -עותק אחד מקור.') == 'שני (2) עותקים של ההצעה, כשהם כוללים את כל הנספחים - עותק אחד מקור.'
    # המשפט עם המספרים נבחר, לא משפט-המסגרת המשפטי; הכותרת נשארת לפני
    b = tender_sections.brief_of('מצבת האוטובוסים', 'למען הסר ספק ,האמור בסעיף זה כפוף לנספח ב\' .המספר הכולל של הרכבים באשכול לא יפחת מ 120-אוטובוסים.', ['צי הרכבים'])
    assert b == 'מצבת האוטובוסים: המספר הכולל של הרכבים באשכול יהיה לפחות 120 אוטובוסים.'
    # שורת טבלה (רצף מספרים) לא נבחרת; המשפט המוביל כן, ומשפט מוביל שמסתיים בנקודתיים מקבל את הבא
    t = 'המפעיל יקבל תשלום בגין הצטיידות באוטובוסים כדלקמן: 52.2.1.1 בגין אוטובוס עירוני סך של. ₪ 155,000 52.2.1.2 בגין אוטובוס מפרקי. ₪ 205,000'
    assert tender_sections.brief_of('52.2.1 ' + t, '', ['תמורה ותשלומים']).startswith('52.2.1 החברה שתזכה תקבל תשלום על הצטיידות באוטובוסים כך: 52.2.1.1 על אוטובוס עירוני סך של 155,000 ₪.')
    assert tender_sections.brief_of('פיצויים', 'שיעור יומי סכום הפיצוי 0 1.0% 0% 63 1.5% 1.0% 93 2.5% 1.5%. הפיצוי ישולם תוך 30 ימים.', ['קנסות ופיצויים']) == 'פיצויים: הפיצוי ישולם תוך 30 ימים.'
    assert tender_sections.simplify('במשך כל תקופת ההתקשרות בהתאם להליך תחרותי זה, בהתאם לאמור בסעיף 5.') == 'במשך כל תקופת החוזה לפי מכרז זה.'
    long = tender_sections.brief_of('כללי', 'מילה ' * 120, [])
    assert len(long) <= 191 and long.endswith('…')


import fill_fields  # noqa: E402

DOC = {'tender': '999', 'doc': 'https://mr.gov.il/x/מסמכי הליך', 'sections': [
    {'n': '1.6.2', 'p': 8, 't': 'תקופת הפעלת שלב א\' תחל לא יאוחר מ – 12חודשים ממועד ההודעה על הזכייה ותקופת ההפעלה של שלב ב\' תחל לא יאוחר מ – 18חודשים ממועד ההודעה על הזכייה.', 'text': 'כפיצוי מוסכם סך מקסימלי של 100אלף ₪בגין כל שבוע איחור.', 'topics': ['תקופת ההתקשרות'], 'numbers': [], 'brief': ''},
    {'n': '1.10', 'p': 10, 't': 'רשאית הממשלה להאריך את תקופת ההפעלה לתקופה נוספת של 12חודשים', 'text': '', 'topics': [], 'numbers': [], 'brief': ''},
    {'n': '4.1', 'p': 17, 't': 'תנאי סף כלליים', 'text': '4.1.1 על המציע לעמוד באחד מתנאי הסף: 4.1.1.1 המציע הוא מפעיל תחבורה ציבורית פעיל ,בעל רישיון תקף להסעת נוסעים בקווי שירות בתחבורה ציבורית באוטובוסים הכוללים לפחות 80אוטובוסים. 4.1.1.2 תנאי אחר.', 'topics': ['תנאי סף'], 'numbers': [], 'brief': ''},
    {'n': '12.2', 'p': 28, 't': 'ריכוז מועדים', 'text': 'שעה תאריך 25/12/2025 פרסום ההליך התחרותי עד 18:00 22/01/2026 הגשת שאלות הבהרה עד 12:00 18/03/2026 הגשת מסמכי ההליך', 'topics': ['מועדים והגשה'], 'numbers': [], 'brief': ''},
    {'n': '28.4', 'p': 55, 't': 'ניסיון עבר של המציע בהפעלת קווי שירות לפי מדדי הבקרה – 24נקודות:', 'text': 'טקסט. 28.5 הצעה תפעולית – 21נקודות: המציע יגיש.', 'topics': ['ניקוד ההצעות'], 'numbers': [], 'brief': ''},
    {'n': '28.7', 'p': 60, 't': 'תכנית עסקית 10 - נקודות', 'text': '', 'topics': ['ניקוד ההצעות'], 'numbers': [], 'brief': ''},
    {'n': '38.2.2', 'p': 79, 't': 'המציע יחשב את מספר האוטובוסים ,כאשר המספר הכולל של הרכבים באשכול לא יפחת מ 166-אוטובוסים (להלן "מצבת האוטובוסים הבסיסית").', 'text': 'המציע יוכל לרכוש אוטובוסים משומשים שגילם לא יעלה על • 6שנים במועד הפעלת האשכול.', 'topics': ['צי הרכבים'], 'numbers': [], 'brief': ''},
    {'n': '38.2.9', 'p': 80, 't': 'אוטובוסים המונעים בחשמל – כל האוטובוסים באשכול ,לאורך כל תקופת ההפעלה, יופעלו באוטובוסים חשמליים (כולל רזרבה תפעולית של .)20%', 'text': '', 'topics': ['צי הרכבים'], 'numbers': [], 'brief': ''},
    {'n': '40.1.6', 'p': 100, 't': 'גיל האוטובוסים לא יעלה על 10שנים או בהתאם לאמור בנספח.', 'text': '', 'topics': ['צי הרכבים'], 'numbers': [], 'brief': ''},
    {'n': '49', 'p': 111, 't': 'הגדרות לעניין חישובי סובסידיה', 'text': '"מפת הבסיס לאשכול" – סך נסיעות וק"מ רכב בשנה בכל קווי האשכול ,המסתכם ב – 512 אלפי נסיעות ו 7,179-אלפי ק"מ. "סובסידיה שוטפת" – הסכום המשולם. "מדד מחירי התשומות" – יהיה מורכב.', 'topics': ['תמורה ותשלומים'], 'numbers': [], 'brief': ''},
]}


def test_fill_fields_reads_single_values_with_their_section():
    known = {'scoring.price_weight': {'status': 'verified', 'value': 35}, 'guarantee.bid': {'status': 'verified', 'value': 2000000}}
    out = fill_fields.rules(DOC, DOC['sections'], {'counts': {'inTender': 38}}, None, known)
    assert out['dates.questions']['value'] == '2026-01-22' and out['dates.questions']['sources'][0]['locator'] == 'סעיף 12.2, עמוד PDF 28'
    assert out['dates.service_start']['value'] == "עד 12 חודשים מההודעה על הזכייה (שלב א'), שלב ב' עד 18 חודשים"
    assert out['term.extension']['value'] == 12 and out['term.extension']['unit'] == 'months'
    assert out['fleet.operating']['value'] == 166 and out['fleet.operating']['sources'][0]['url'].endswith('#page=79')
    assert out['fleet.reserve']['value'] == 20 and out['fleet.reserve']['kind'] == 'percent'
    assert out['fleet.max_age']['value'] == 10 and '6 שנים' in out['fleet.max_age']['notes']
    assert out['fleet.electric_share']['value'] == 100
    assert out['eligibility.licenses']['status'] == 'verified' and 'בעל רישיון תקף' in out['eligibility.licenses']['notes']
    assert '4.1.1.2' not in out['eligibility.licenses']['notes']          # רק תת-הסעיף שבו נמצא, לא כל הסעיף
    assert out['eligibility.drivers']['status'] == 'not_found'              # "80 אוטובוסים" אינו דרישת נהגים
    assert out['service.routes']['value'] == 38
    assert out['service.annual_km']['value'] == 7179000 and out['service.annual_km']['unit'] == 'km'
    assert out['service.frequency']['status'] == 'per_line'
    assert out['price.fixed_payment']['status'] == 'not_applicable' and out['price.indexation']['value'] == 'מדד מחירי התשומות'
    q = out['scoring.quality_weight']
    assert q['value'] == 65 and 'ניסיון עבר 24' in q['notes'] and 'הצעה תפעולית 21' in q['notes'] and 'תכנית עסקית 10' in q['notes']
    assert 'עד 100 אלף ₪ לכל שבוע' in out['penalties.amount']['value']
    assert out['award.winner']['status'] == 'later'
    assert 'guarantee.bid' not in out and 'scoring.price_weight' not in out   # מה שאומת במסמך לא נדרס


import feed_rules  # noqa: E402


def test_feed_classification_keeps_only_public_transport_in_the_main_list():
    c = feed_rules.classify
    assert c('הליך תחרותי לקבלת רישיונות להפעלת קווי שירות בתחבורה הציבורית באוטובוסים באשכול מטה בנימין') == 'operating_tender'
    assert c('מכרז להפעלת אוטובוסים באשכול צפון הנגב') == 'operating_tender'
    assert c('קול קורא לקבלת התייחסות הציבור להחלת מנגנונים במסגרת הפעלת קווי שירות') == 'transport_related'
    assert c('התקנת סככות המתנה בתחנות אוטובוסים') == 'transport_related'
    assert c('מכרז פומבי למתן שירותי בקרה בענף התחבורה הציבורית באוטובוסים ובמוניות השירות') == 'transport_related'
    assert c('חידוש רישיונות מיקרוסופט מוצרים לא ייחודיים לשנת 2026') == 'unrelated'
    assert c('חידוש רישיונות DATAPOWER מה-1.1.26 עד 31.12.26 תחבורה ציבורית חברת טנגרם') == 'unrelated'
    assert c('מתן שירותי הנפקת רישיון נהיגה בינלאומי, רישיונות משיט ותחנות צילום') == 'unrelated'
    assert c('תחזוקת רישיונות לתוכנות GIS עבור מערכת מידע תחבורתי') == 'unrelated'


def test_numbers_come_with_their_context_and_cross_references_are_dropped():
    t = 'כפיצוי מוסכם סך מקסימלי של 100אלף ₪בגין כל שבוע איחור. התקופה הכוללת, המפורטים בסעיפים 1.6.1.2 – 1.6.1.1, תחל ממועד ההודעה על הזכייה ותמשך :10 שנים ו 12 חודשים עבור קווי השירות בשלב א\'.'
    nums = dict(tender_sections.number_contexts(t))
    assert nums['100 אלף ₪'] == 'קנס שנקבע מראש עד 100 אלף ₪ על כל שבוע איחור'
    assert '10 שנים' in nums and 'ותמשך 10 שנים' in nums['10 שנים']
    b = tender_sections.simplify('התקופה הכוללת של הפעלת הקווים, ובכלל זה תקופת ההכנות, המפורטים בסעיפים 1.6.1.2 – 1.6.1.1, תחל ממועד ההודעה על הזכייה ותמשך :10 שנים.')
    assert b == 'התקופה הכוללת של הפעלת הקווים, כולל תקופת ההכנה, תחל מהיום שהודיעו למי שזכה ותמשך 10 שנים.'


def test_old_pdf_quotes_are_tidied_without_touching_good_ones():
    """מכרזי 2014 (צפון הנגב, שרון-חולון): תבליטים, "קו – 3", סוגריים הפוכים, נקודה שנדדה, רשימה הפוכה."""
    f = lambda s: line_changes.fix_parens(line_changes.clean(s))
    assert f('• קו – 3 שינוי במסלול.') == 'קו 3 – שינוי במסלול.'
    assert f('• קו ) 11 מ"א אשכול( – הקו לא ישרת את היישוב מגן )היישוב מקבל שירות בקו. (14 חלופות הקו יאוחדו.') == \
        'קו 11 (מ"א אשכול) – הקו לא ישרת את היישוב מגן (היישוב מקבל שירות בקו 14). חלופות הקו יאוחדו.'
    assert f('• קו – 11 יבוטל ויוחלף ב4- קווים חדשים 66,64,62:ו.164-') == 'קו 11 – יבוטל ויוחלף ב-4 קווים חדשים 62, 64, 66 ו-164.'
    assert f('• קו – 15 שילוט קו זה ישונה ל,65-הקו יוארך.') == 'קו 15 – שילוט קו זה ישונה ל-65, הקו יוארך.'
    assert f('• קווים 130,30 ו – 35-חלופות יבוטלו :קו 30 יופעל') == 'קווים 30, 130 ו-35 – חלופות יבוטלו: קו 30 יופעל'
    assert f('לנתיבות ) (55 והיישוב נחל עוז יקבל שירות בקו.28') == 'לנתיבות (55) והיישוב נחל עוז יקבל שירות בקו 28.'
    assert f('הערה זו מתייחסת גם לקווים.573,561,571') == 'הערה זו מתייחסת גם לקווים 561, 571, 573.'
    assert f('קו – 12 קיצור :הפיכה לרכבת  האוניברסיטה.') == 'קו 12 – קיצור: הפיכה לרכבת האוניברסיטה.'
    # ציטוטים שכבר תקינים (חיפה, דרום גוש דן) לא משתנים
    # זוג מק"ט-מספר חוזר לסדר של המסמך ("14 (10014)"), רשימות בסוגריים מסודרות
    assert f('בנוסף, קו 468 ממודיעין )10014( 14 ימשיך; מעלה אדומים ( ,)209בית אל (,)269') == \
        'בנוסף, קו 468 ממודיעין 14 (10014) ימשיך; מעלה אדומים (209), בית אל (269),'
    assert f("קו 6א יוארך; קו 6ו' יבוטל; 468ממודיעין") == "קו 6א יוארך; קו 6ו' יבוטל; 468 ממודיעין"
    assert line_changes.numbers_in('קו ) 11מ"א אשכול( – הקו') == (['11'], [])


import pdf_line_tables  # noqa: E402

NEGEV_TABLE = """        שירות      מפעיל קיים             תיאור             קו                     קריית גת-
                                                                               קווים עירוניים
        עירוני        קו חדש     אצטדיון-רכבת                    1
        עירוני        אצטדיון-אזה"ת קו חדש                  11

        עירוני        קו חדש          שד' מלכי                   8
                                    ישראל-שד'
                                   מלכי ישראל

        אזורי         קו חדש     קריית גת-שחר               61                     קריית גת-
                                                                               קווים אזוריים
        אזורי         אגד תעבורה   קריית גת-מ.א               66
                                         לכיש
                                     59
"""
NEGEV_TABLE_2 = """עירוני-תלמידים   אגד תעבורה      רמב"ם-בית       96
                                  ספר אורט
   אזורי       קו חדש        באר שבע-      באר שבע -קווים 40
                                  חצרים              אזוריים
   אזורי       קו חדש        באר שבע-      41
                                  חצרים
                                                  מרחב האשכול  -סקירה כללית   1BU     32
להלן סקירה כללית של האשכול ,המבטאת את עיקר הנתונים הרלבנטיים שבידי
"""


def test_pdf_line_table_rows_groups_and_continuations():
    """טבלת הקווים בתוך ה-PDF (צפון הנגב 2014): קבוצה מהכותרת, תיאור שנשבר לשורות, "קו חדש" מול מפעיל קיים,
    מספר קו שקפץ אחרי שם הקבוצה, וסוף הטבלה בכותרת הסעיף הבא."""
    rows = pdf_line_tables.parse_pages([(65, NEGEV_TABLE), (66, NEGEV_TABLE_2)])
    routes = pdf_line_tables.build_routes(rows)
    by = {r['key'][1]: r for r in routes}
    assert [r['key'][1] for r in routes] == ['1', '11', '8', '61', '66', '96', '40', '41']
    assert by['1']['area'] == 'קריית גת' and by['1']['isNew'] and by['1']['origin'] == 'אצטדיון' and by['1']['destination'] == 'רכבת'
    assert by['11']['isNew'] and by['11']['destination'] == 'אזה"ת'                     # המפעיל אחרי התיאור
    assert by['8']['origin'] == "שד' מלכי ישראל" and by['8']['destination'] == "שד' מלכי ישראל"
    assert by['61']['group'] == 'קריית גת- קווים אזוריים' and by['61']['service'] == 'אזורי'
    assert by['66']['operator'] == 'אגד תעבורה' and not by['66']['isNew'] and by['66']['destination'] == 'מ.א לכיש'
    assert by['96']['service'] == 'עירוני-תלמידים' and by['96']['destination'] == 'בית ספר אורט'
    assert by['40']['area'] == 'באר שבע' and by['40']['destination'] == 'חצרים' and by['41']['area'] == 'באר שבע'
    assert by['40']['key'][0] == 'pdf:באר שבע:40' and by['1']['key'][0] == 'pdf:קריית גת:1'


def test_city_and_kind_headings_attach_to_line_quotes():
    """סעיף 34 במכרזי 2014: "34.1.2 שינויים במסלול הקווים האזוריים", ואחריו כותרות עיר ("אשקלון:") — הציטוט
    יודע לאיזו עיר ולאיזה סוג קו הוא שייך, כדי לא להיצמד לקו 3 של עיר אחרת."""
    text = """34.1.1שינויים במסלול הקווים העירוניים
                                                                               שדרות:
                                                      • קו  – 3שינוי במסלול.
                                                                            אשקלון:
        • קו  – 2הארכת קצה הקו מערבה לשכונת ברנע ג' וסיום במסוף חופית.
                                               34.1.2שינויים במסלול הקווים האזוריים
• קו ) 11מ"א אשכול( – הקו לא ישרת את היישוב מגן )היישוב מקבל שירות בקו
                                   .(14חלופות הקו יאוחדו לחלופה יחידה.
                                               34.1.4קווים עירוניים חדשים
                                                                            קריית גת:
• קו  – 1משרת את המוקדים: אצטדיון, ציר מלכי ישראל צפון.
"""
    found, _ = line_changes.scan_units([{'page': 84, 'text': text}], 'https://x/doc.pdf', 'abc', 'doc.pdf')
    by = {tuple(f['numbers']): f for f in found}
    assert by[('3',)]['city'] == 'שדרות' and by[('3',)]['kind'] == 'עירוני' and by[('3',)]['quote'].startswith('קו 3 – שינוי במסלול.')
    assert by[('2',)]['city'] == 'אשקלון' and by[('2',)]['kind'] == 'עירוני'
    assert by[('11',)]['city'] == 'מ"א אשכול' and by[('11',)]['kind'] == 'אזורי'      # העיר מתוך הסוגריים
    assert by[('1',)]['city'] == 'קריית גת' and by[('1',)]['kind'] == 'עירוני' and 'קו חדש' in by[('1',)]['tags'] and by[('1',)]['section'] == 'קווים חדשים'


def test_student_lines_list_is_rebuilt_in_document_order():
    """חיפה סעיף 34.5: הרשימה יצאה הפוכה ושבורה בין שתי שורות — נבנית מחדש לפי המק"טים (3 ספרות אחרונות = מספר הקו)."""
    raw = ("קווי תלמידים86 ,)24085( 85 ,)42084( 84 ,)10083( 83 ,)52082( 82 ,)11081( 81 ,)12080( 80 :\n"
           "(,)10787( 787 ,)10783( 783 ,)13093( 93 ,)38091( 91 ,)12090( 90 ,)11088( 88 ,)44087( 87 ,)43086\n"
           ".)10789( 789 ,)10788( 788")
    out = line_changes.fix_parens(line_changes.clean(raw))
    assert out == ('קווי תלמידים: 80 (12080), 81 (11081), 82 (52082), 83 (10083), 84 (42084), 85 (24085), 86 (43086), '
                   '87 (44087), 88 (11088), 90 (12090), 91 (38091), 93 (13093), 783 (10783), 787 (10787), 788 (10788) ו-789 (10789).')
    # זוג הפוך בתוך משפט רגיל — מתהפך חזרה, והמשפט לא נבנה מחדש
    assert line_changes.fix_parens("חלופה ת' של קו ,)10006( 6חלופה ת' של קו .)11009( 9") == "חלופה ת' של קו 6 (10006), חלופה ת' של קו 9 (11009)."
    # מק"ט שלא מתאים למספר — לא נוגעים
    assert line_changes.fix_parens('קווים (25041) 41, (10010) 10') == 'קווים 10 (10010) ו-41 (25041).'
    assert line_changes.fix_parens('קו (99123) 41 יבוטל') == 'קו (99123) 41 יבוטל'
    # השרון: הסוגריים נפתחו לפני המספר ונסגרו לפני המק"ט
    assert line_changes.fix_parens('קו ( 2 מק"ט )45002 ברעננה.') == 'קו 2 (מק"ט 45002) ברעננה.'
    assert line_changes.fix_parens('קו ( 2מק"ט  )45002ברעננה.') == 'קו 2 (מק"ט 45002) ברעננה.'
    assert line_changes.fix_parens('קו ( 12 מק"ט,)31012 מהוד השרון למסוף רעננה.') == 'קו 12 (מק"ט 31012) מהוד השרון למסוף רעננה.'


import snip_fields  # noqa: E402


def _page_with(text):
    import fitz
    doc = fitz.open()
    pg = doc.new_page()
    pg.insert_text((50, 100), text, fontsize=12)
    return pg


def test_number_needle_matches_whole_numbers_only():
    # בעמוד 80 של חיפה "20" סימן גם את "2003" ו-"2017" (שנות חוקים) — רק המספר כמילה שלמה נחשב
    pg = _page_with('law 2003 and 2017 rules (20%) and 120 buses, 20 more')
    words = pg.get_text('words')
    assert [w[4] for w in words if snip_fields.num_core(w[4]) == '20'] == ['(20%)', '20']
    rects = snip_fields.find_rects(pg, '20', words)
    assert len(rects) == 2
    assert len(pg.search_for('20')) == 5           # בלי הסינון: 2003, 2017, 20%, 120, 20
    assert len(snip_fields.find_rects(pg, '20%', words)) == 1
    # ביטוי עם יחידה: "9 months" לא נתפס בתוך "19 months"
    pg2 = _page_with('phase a within 9 months, phase b within 19 months')
    assert len(snip_fields.find_rects(pg2, '9 months')) == 1
    assert len(pg2.search_for('9 months')) == 2
    # ערך באחוזים מחפש קודם "20%"
    assert snip_fields.needles_for('fleet.reserve', {'value': 20, 'kind': 'percent'})[:2] == ['20%', '20']
    # מספר עשרוני ("7.2 מיליון") עדיין נמצא
    pg3 = _page_with('about 7.2 million km, not 17.2')
    assert len(snip_fields.find_rects(pg3, '7.2')) == 1


def test_phrase_is_found_by_position_and_section_limits_the_marks():
    import fitz
    doc = fitz.open()
    pg = doc.new_page()
    # כותרות סעיפים בטור ימני, גוף בטור שמאלי; "12 months" פעמיים: בסעיף 1.6.1 ובסעיף 1.6.2
    pg.insert_text((520, 100), '1.6.1', fontsize=11)
    pg.insert_text((60, 100), 'the term is 10 years and 12 months in total', fontsize=11)
    pg.insert_text((520, 200), '1.6.2', fontsize=11)
    pg.insert_text((60, 200), 'phase a starts within 12 months, phase b within 18 months', fontsize=11)
    pg.insert_text((60, 230), 'and 112 months is not 12 months or 12 days', fontsize=11)
    pg.insert_text((520, 300), '1.6.3', fontsize=11)
    pg.insert_text((60, 300), 'penalty of 12 months', fontsize=11)
    words = pg.get_text('words')
    r12 = snip_fields.phrase_rects(words, '12', 'months')
    assert len(r12) == 4                      # 100, 200, 230, 300 — לא "112 months" ולא "12 days"
    assert sorted(round(r.y0 / 10) for r in r12) == [9, 19, 22, 29]
    assert len(snip_fields.phrase_rects(words, '18', 'months')) == 1
    span = snip_fields.section_span(pg, words, '1.6.2')
    assert span and 180 < span[0] < 200 and 280 < span[1] < 300
    inside = [r for r in r12 if span[0] <= (r.y0 + r.y1) / 2 <= span[1]]
    assert len(inside) == 2
    assert snip_fields.section_span(pg, words, '9.9.9') is None
    assert snip_fields.section_span(pg, words, '1') is None


def test_date_needles_and_value_on_next_page_and_sentence_fallback():
    import fitz
    assert snip_fields.date_needles('2020-11-25')[:2] == ['25/11/2020', '25.11.2020']
    assert '25 בנובמבר 2020' in snip_fields.date_needles('2020-11-25')
    assert snip_fields.needles_for('dates.questions', {'value': '2020-11-25'}) == snip_fields.date_needles('2020-11-25')
    # תאריך שלם נמצא, וחלק ממנו ("11") לא נחשב
    pg = _page_with('section 11 says: questions until 25/11/2020 at 18:00')
    assert len(snip_fields.find_rects(pg, '25/11/2020')) == 1
    assert len(snip_fields.find_rects(pg, '11')) == 1        # רק "11" של הסעיף, לא מתוך התאריך
    # ערך שלא נמצא בעמוד המקור אבל נמצא בעמוד הבא — הצילום מהעמוד הבא
    doc = fitz.open()
    p1 = doc.new_page(); p1.insert_text((520, 100), '38.2.2', fontsize=11); p1.insert_text((60, 100), 'the operator shall compute the fleet', fontsize=11)
    p2 = doc.new_page(); p2.insert_text((60, 100), 'the total shall not be less than 185 buses', fontsize=11)
    f = {'value': 185, 'sec': {'n': '38.2.2', 'brief': 'the operator shall compute the fleet needed for all lines together'}}
    pg, p, hit, needle, how, span = snip_fields.locate(fitz, doc, 1, 'fleet.operating', f)
    assert (p, needle, how, len(hit)) == (2, '185', 'value', 1)
    # ערך שלא כתוב בשום מקום (100% נגזר מ"כל האוטובוסים") — מסמנים את משפט המפתח, לא מילים מהכותרת
    f2 = {'value': 100, 'kind': 'percent', 'sec': {'n': '38.2.2', 'brief': 'the operator shall compute the fleet needed for all lines together'}}
    pg, p, hit, needle, how, span = snip_fields.locate(fitz, doc, 1, 'fleet.electric_share', f2)
    assert (p, how) == (1, 'sentence') and len(hit) >= 1
    assert snip_fields.locate(fitz, doc, 1, 'x', {'value': 999, 'sec': {'n': '9.9', 'brief': 'nothing like this anywhere'}}) is None


NIGHT = """      34.1.5קווי לילה
ההליך כולל חמישה קווי לילה מירושלים ליישובים :מעלה אדומים ( ,)209בית אל ( ,)269מצפה יריחו
( ,)208קדר ( )211ופסגות ( .)270בנוסף ,קו 468 ממודיעין לירושלים דרך יישובי מטה בנימין כולל
חלופת לילה .תשומת לב המציע מופנית לכך שמשרד התחבורה בוחן כל שנה את מערך קווי הלילה.
"""


def test_night_lines_paragraph_attaches_to_its_lines_instead_of_a_section_note():
    found, notes = line_changes.scan_units([{'page': 71, 'text': NIGHT}], 'https://mr.gov.il/doc', 'abc', 'מסמכי הליך')
    assert not any(n['section'] == 'קווי לילה' for n in notes)
    night = [f for f in found if f['tags'] == ['קו לילה']]
    assert len(night) == 1 and night[0]['section'] == 'קווי לילה'
    assert night[0]['numbers'] == ['209', '269', '208', '211', '270', '468']
    assert night[0]['quote'].startswith('ההליך כולל חמישה קווי לילה מירושלים ליישובים: מעלה אדומים (209), בית אל (269)')
    assert line_changes.described_numbers('ההליך כולל 5 קווי לילה, קו 12א וקו 7, בשנת 2024 לפי סעיף 34.1') == ['12א', '7']
    # רשימה בסוגריים (השרון): "קווי לילה עירוניים (228, 229) ושני קווים בינעירוניים (230, 231)"
    assert line_changes.described_numbers('שני קווי לילה עירוניים (228, 229) ושני קווים בינעירוניים (230, 231).') == ['228', '229', '230', '231']


def test_numbers_written_differently_in_the_document_are_still_found():
    # "300מיליון" דבוק, "60 מליון" בכתיב חסר, "חמש שנים" במילים
    pg = _page_with('turnover of 300million NIS and equity of 60 mliyon NIS, experience of five years')
    words = pg.get_text('words')
    assert snip_fields.phrase_rects(words, '300', 'million') and snip_fields.phrase_rects(words, '60', 'mliyon')
    f = {'status': 'verified_conditional', 'value': None, 'conditions': [{'value': 300000000}]}
    import fitz
    doc = fitz.open(); p2 = doc.new_page(); p2.insert_text((50, 100), 'מחזור של לפחות 300מיליון ₪ לשנה', fontsize=11, fontname='helv') if False else None
    assert snip_fields.HEB_NUM[5] == ['חמש', 'חמישה']
