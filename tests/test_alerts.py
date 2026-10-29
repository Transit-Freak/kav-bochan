"""הקו המודיע: קריאת נוסח ההודעה, סיווג הסיבה וההודעה שנשלחת (tools/alerts_*.py)."""
import importlib.util
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).parents[1] / 'tools'
sys.path.insert(0, str(TOOLS))


def load(name):
    spec = importlib.util.spec_from_file_location(name, TOOLS / f'{name}.py')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


AR = load('alerts_route')
AF = load('alerts_fetch')
AP = load('alerts_push')

# הנוסח של אשדוד, 18.10.2026 (קווים 16, 20, 350)
ASHDOD = '''קווים 16, 20 לכיוון הטיילת:
עד חנה סנש/שדרות הפלמ"ח, ימינה שדרות הפלמ"ח, שמאלה שמעון בן שטח, שמאלה שדרות משה סנה, שמאלה שדרות בני ברית, ימינה מורדי הגטאות, והמשך מסלול מקורי.
קו 350: עד רוגוזין/ז'בוטינסקי ללא שינוי, ימינה ז'בוטינסקי, שמאלה הרצל והמשך מסלול רגיל.'''


class ParseTests(unittest.TestCase):
    def test_line_numbers(self):
        self.assertEqual({'16', '20', '350'}, AR.line_numbers('קווים 16, 20 ו-350'))
        self.assertEqual({'5א', '6'}, AR.line_numbers('קוים 5א,6'))
        self.assertEqual({'3'}, AR.line_numbers('קו 3 משחמון'))
        # מילה שמתארת את הקווים בין "קווי" למספרים (אילת, 18.10)
        self.assertEqual({'5', '5א', '80', '80א'}, AR.line_numbers('קווים 5, 5א משחמון וקווי התלמידים 80, 80א לשחמון'))
        self.assertEqual({'32', '80א'}, AR.line_numbers('קו 32 לנמל תעופה רמון וקו תלמידים 80א לתיכון גולדווטר'))

    def test_paragraphs_keep_their_lines(self):
        ps = AR.parse(ASHDOD)
        self.assertEqual(2, len(ps))
        self.assertEqual({'16', '20'}, ps[0]['lines'])
        self.assertEqual(('חנה סנש', 'הפלמ"ח'), ps[0]['start'])
        self.assertEqual(['הפלמ"ח', 'שמעון בן שטח', 'משה סנה', 'בני ברית', 'מורדי הגטאות'], ps[0]['steps'])
        self.assertEqual({'350'}, ps[1]['lines'])
        self.assertEqual(["ז'בוטינסקי", 'הרצל'], ps[1]['steps'])

    def test_vague_notice_gives_nothing_to_route(self):
        # הודעה כללית בלי הוראות — לא ממציאים מסלול
        self.assertEqual([], AR.parse('בשל עבודות ייתכנו עיכובים בקווים העוברים באזור.'))
        self.assertEqual([], AR.parse('התחנה הועתקה 50 מטר צפונה.'))

    def test_negative_instruction_is_not_a_step(self):
        ps = AR.parse('עד הרצל/בגין, ימינה בגין, לא פונים שמאלה לויצמן, שמאלה ז\'בוטינסקי והמשך מסלול רגיל.')
        self.assertEqual(['בגין', "ז'בוטינסקי"], ps[0]['steps'])

    def test_dates_are_not_junctions(self):
        # "29/10/2026" נראה כמו "רחוב/רחוב" — לא נקודת התחלה
        self.assertEqual([], AR.parse('החל מיום ראשון 6/9/2026 ועד יום חמישי 29/10/2026 תיחסם לתנועה דרך הרים, בקטע: עין יהב – שרה אמנו'))

    def test_more_lines_after_slash_and_extra_junction_part(self):
        ps = AR.parse('קו 359 דימונה / 373 רחובות / 378 ת"א\nיגיע עד בית וגן / פרי מגדים , ימשיך ישר לסיירת שקד , בכיכר ימינה להמשך סיירת שקד , ימינה מבצע הראל , שמאלה פרי מגדים חזרה למסלול')
        self.assertEqual({'359', '373', '378'}, ps[0]['lines'])
        self.assertEqual(['לסיירת שקד', 'סיירת שקד', 'מבצע הראל', 'פרי מגדים'], ps[0]['steps'])
        ps = AR.parse('קו 14 לרעננה\nיגיע עד המגדל / המחתרת / ימינה המחתרת , שמאלה הנשיאים , ימינה חפץ חיים חזרה למסלול')
        self.assertEqual(('המגדל', 'המחתרת'), ps[0]['start'])
        self.assertEqual(['המחתרת', 'הנשיאים', 'חפץ חיים'], ps[0]['steps'])

    def test_metropolin_sentence_broken_over_lines(self):
        # מטרופולין: כותרת עם כמה קווים ויעד לכל אחד, והוראה שנשברת באמצע משפט
        ps = AR.parse("""המסלול החלופי לקוים 12 לכיוון מכללת לוינסקי, 
604 לכיוון תל אביב:
נוסעים במסלול הרגיל עד לכיכר רוזנפלד/ג'ורג' וייז, לא 
ממשיכים ישר ברח' רוזנפלד אלא פונים ימינה לרח' ג'ורג' וייז, 
שמאלה להמשך רח' ג'ורג' וייז, שמאלה לרח' חיים לבנון
וממשיכים במסלול הרגיל.
אין תחנות מבוטלות!""")
        self.assertEqual(1, len(ps))
        self.assertEqual({'12', '604'}, ps[0]['lines'])
        self.assertEqual(('רוזנפלד', "ג'ורג' וייז"), ps[0]['start'])
        self.assertEqual(["ג'ורג' וייז", "ג'ורג' וייז", 'חיים לבנון'], ps[0]['steps'])

    def test_metropolin_dates_line_is_not_a_junction(self):
        self.assertEqual([], AR.parse("בימים ראשון עד חמישי 18-22/10 ייחסם לתנועה רח' גלבוע,\nהחסימה תחל בשעה 7:00 ועד לשעה 16:00."))

    def test_kavim_turns_without_start(self):
        # קווים: ההוראה מתחילה בפנייה, בלי "עד…"; קווים עם לוכסן
        ps = AR.parse("""אי לכך, קווים: 476/479 ישנו את מסלולם.
קו 476 מכיוון תל אביב: 
יפנו ימינה ליגאל אלון, ימינה אל חיים בר לב, שמאלה אל שד' בן גוריון וימשיכו במסלולם המקורי.""")
        self.assertEqual(1, len(ps))
        self.assertEqual({'476'}, ps[0]['lines'])
        self.assertIsNone(ps[0]['start'])
        self.assertEqual(['ליגאל אלון', 'חיים בר לב', 'בן גוריון'], ps[0]['steps'])
        self.assertEqual({'476', '479'}, AR.line_numbers('אי לכך, קווים: 476/479 ישנו את מסלולם.'))

    def test_extra_dash_list(self):
        # אקסטרה ירושלים: "ייסעו דרך הרחבות חנה - אלי הכהן - גרוסברג"
        ps = AR.parse("קו 3 לכיוון בנייני האומה (כיוון 3)\nמסלול חלופי: ייסעו דרך הרחבות חנה - אלי הכהן - גרוסברג - אהלי יוסף להמשך מסלולם.")
        self.assertEqual({'3'}, ps[0]['lines'])
        self.assertEqual(['חנה', 'אלי הכהן', 'גרוסברג', 'אהלי יוסף'], ps[0]['steps'])

    def test_street_names(self):
        self.assertEqual('הרצל', AR.clean_street('ימינה לרחוב הרצל'))
        self.assertEqual('בני ברית', AR.clean_street("שמאלה שד' בני ברית"))


    def test_roundabout_name_with_junction_in_brackets(self):
        # קריית שמונה 19.10: שם הכיכר לא רחוב — הצומת הוא מה שבסוגריים
        p = AR.parse('קווים 5, 5א: ייסעו על פי המסלולים הקיימים עד כיכר פעולות האיבה (יהודה הלוי/ האצ"ל), '
                     'ימשיכו ישר לרחוב יהודה הלוי, יפנו שמאלה לרחוב יקותיאל אדם ויתחברו להמשך המסלולים הקיימים.')
        self.assertEqual(('יהודה הלוי', 'האצ"ל'), p[0]['start'])

    def test_direction_picks_the_right_paragraph(self):
        # גבעת שמואל 19.10 (דן): פסקה לכל כיוון, מכיוון עתידים / לכיוון עתידים
        p = AR.parse('מכיוון עתידים:\nעד הכיכר ברח' + "'" + ' בגין פינת מוטה גור ללא שינוי, שמאלה מוטה גור, שמאלה יוני נתניהו והמשך במסלול הרגיל.\n\n'
                     'לכיוון עתידים:\nעד הכיכר ברח' + "'" + ' יוני נתניהו פינת מוטה גור ללא שינוי, ימינה מוטה גור, ימינה בגין והמשך במסלול הרגיל.')
        self.assertEqual(2, len(p))
        to = 'תל אביב יפו - קריית עתידים'
        self.assertEqual([False, True], [AR.dir_fits(x, to) for x in p])
        self.assertEqual([True, False], [AR.dir_fits(x, 'גבעת שמואל - הרב שלמה גורן') for x in p])
        # "לכיוון חולון, פתח תקווה" — שני קווים, יעד לכל אחד
        self.assertTrue(AR.dir_fits({'dir': ('to', 'חולון, פתח תקווה')}, 'פתח תקווה - מסוף'))

    def test_direction_from_x_to_y(self):
        # אגד, 20.10: "קו 201 מתל אביב-יפו לרחובות:" — בלי "לכיוון"
        p = AR.parse('קו 201 מתל אביב-יפו לרחובות: ייסע על פי המסלול הקיים עד צומת הרחובות נחלת בנימין/ יהודה הלוי, '
                     'ימשיך ישר ברחוב נחלת בנימין, יפנה ימינה לדרך יפו ויתחבר להמשך המסלול הקיים.\n\n'
                     'קו 201 מרחובות לתל אביב-יפו: ייסע על פי המסלול הקיים עד צומת הרצל/ דרך קיבוץ גלויות, '
                     'ימשיך ישר ברחוב הרצל, יפנה ימינה לדרך שלמה ויתחבר להמשך המסלול הקיים.')
        self.assertEqual([True, False], [AR.dir_fits(x, 'רחובות - תחנה מרכזית') for x in p])
        self.assertEqual([False, True], [AR.dir_fits(x, 'תל אביב יפו - מסוף כרמלית') for x in p])

    def test_direction_after_line_number_and_cancelled_stops(self):
        # תל אביב 20.10 (קרליבך): "קו: 3" ו"מכיוון הטייסים:" התחברו לשורה אחת — הכיוון נשמר, ולכל פסקה
        # התחנות המבוטלות שלה (לא התחנות החלופיות)
        p = AR.parse('קו: 3\nמכיוון הטייסים:\nעד יצחק שדה פינת המסגר ללא שינוי, ימינה המסגר, המשך בגין, שמאלה קפלן.\n\n'
                     'תחנות מבוטלות:\n21237 - יצחק שדה/המסגר\n20731 - קניון טי.אל.וי/קרליבך\n\n'
                     'לכיוון הטייסים:\nעד החשמונאים פינת יהודה הלוי ללא שינוי, ימינה יהודה הלוי, שמאלה לינקולן.\n'
                     'תחנות מבוטלות:\n21729 - החשמונאים/קרליבך\nתחנות חלופיות זמניות:\n36855 מקווה ישראל/אריה שנקר')
        self.assertEqual([('from', 'הטייסים'), ('to', 'הטייסים')], [x['dir'] for x in p])
        self.assertEqual([{'21237', '20731'}, {'21729'}], [x['rm'] for x in p])

    def test_alternative_stops_per_paragraph(self):
        # תל אביב 20.10, אבן גבירול: 25621 חלופית בפסקה של 149 ומבוטלת בפסקה של 445
        p = AR.parse('המסלול החלופי לקו 149 לכיוון כפר סבא:\nנוסעים במסלול הרגיל עד לצומת קרליבך/אבן גבירול, ממשיכים ישר ברח' + "'" + ' מרמורק.\n'
                     'תחנות מבוטלות:\n25625 לונדון מיניסטור/אבן גבירול\nתחנות זמניות חלופיות:\n25621 הבימה/שד' + "'" + ' בן ציון\n\n'
                     'המסלול החלופי לקו 445 לכיוון תל אביב:\nנוסעים במסלול הרגיל עד לצומת אליעזר קפלן/ליאונרדו דה וינצ' + "'" + 'י, ממשיכים ישר ברח' + "'" + ' אליעזר קפלן.\n'
                     'תחנה מבוטלת:\n25621 הבימה-שד' + "'" + ' בן ציון\nתחנה חלופית זמנית:\n25615 הבימה-שד' + "'" + ' תרס"ט')
        self.assertEqual([{'25625'}, {'25621'}], [x['rm'] for x in p])
        self.assertEqual([{'25621'}, {'25615'}], [x['add'] for x in p])

    def test_short_stop_codes_and_connecting_words(self):
        # ירושלים 20.10, קו 616: מק"טים של 3–4 ספרות, ו"ולאחר מכן" / "ומשם" בין הפניות
        p = AR.parse('קו מושפע: 616 לכיוון ירושלים.\n\nשינוי מסלול:\nהקו ימשיך בשדרות בן גוריון, יפנה ימינה לשדרות הרצל, '
                     'שמאלה לשדרות יצחק רבין ולאחר מכן שמאלה לכביש בגין צפון, ומשם ימשיך במסלולו הרגיל.\n\n'
                     'תחנה מבוטלת: 3007 – שערי ירושלים/ליפתא.\nתחנה חלופית: 645 – ויצמן/גבעת שאול.')
        self.assertEqual(1, len(p))
        self.assertEqual(['בן גוריון', 'הרצל', 'יצחק רבין', 'לכביש בגין'], p[0]['steps'])
        self.assertEqual(({'3007'}, {'645'}), (p[0]['rm'], p[0]['add']))

    def test_line_number_after_stop_list_is_not_a_stop(self):
        # בת ים 20.10: "143 לכיוון חולון:" אחרי רשימת התחנות החלופיות — מספר קו, לא מק"ט
        p = AR.parse('קו 143 לכיוון פתח תקווה:\nייסע במסלולו המקורי עד בלפור פינת העצמאות, ימינה העצמאות, ימינה ירושלים.\n'
                     'תחנה חלופית:\n\n35502 - בלפור/רוטשילד\n\n143 לכיוון חולון:\n\nללא שינו במסלול הנסיעה')
        self.assertEqual({'35502'}, p[0]['add'])

    def test_template(self):
        self.assertEqual('junction', AR.template(ASHDOD))
        self.assertEqual('stops', AR.template('עקב עבודות התחנות הבאות מבוטלות זמנית:\n53696 - האצ"ל/נוף חרמון'))
        self.assertEqual('skip', AR.template('קו 73 ידלג על תחנה 36358 - המלאכה/הרוקמים'))
        self.assertEqual('general', AR.template('עקב אירוע צפויים עיכובים בקווים באזור.'))


class HistoryShapeTests(unittest.TestCase):
    def test_decode_polyline(self):
        # הדוגמה של Google: (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
        self.assertEqual([(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)], AF.decode_poly('_p~iF~ps|U_ulLnnqC_mqNvxq`@'))


class MergeTests(unittest.TestCase):
    """הודעה עם רשימת תחנות בלבד ועוד הודעה מפורטת על אותו שינוי — נשארת המפורטת (שלמה 19.10)."""

    def alert(self, i, d, rm, lines, per, mp=False):
        return {'id': i, 'd': d, 'rm': [[x, ''] for x in rm], 'add': [], 'lines': [[n, '', '', False] for n in lines],
                'per': per, 'ag': ['אגד'], 'dep': [], 'map': mp, 'kind': 'stops'}

    def test_stops_only_merges_into_detailed(self):
        det = self.alert('2', 'קווים 10, 10א: ייסעו על פי המסלולים הקיימים עד צומת הרחובות הרצל/ הירדן, ימשיכו ברחוב הרצל, '
                              'יפנו ימינה לרחוב הגליל ויתחברו להמשך המסלולים הקיימים. (תחנה 34763)',
                         ['34761', '34762'], ['10', '10א'], [[100, 200], [300, 400]], mp=True)
        weak = self.alert('3', 'עקב עבודות התחנות הבאות מבוטלות זמנית', ['34761', '34763'], ['10', '18'], [[300, 400]], mp=True)
        out, merged = AF.merge_dups([det, weak])
        self.assertEqual({'3': '2'}, merged)
        self.assertEqual(['2'], [a['id'] for a in out])
        self.assertEqual({'10', '10א', '18'}, {x[0] for x in out[0]['lines']})
        self.assertEqual(['2', '3'], out[0]['rcs'])
        self.assertEqual(['3'], out[0]['also'])

    def test_not_merged_when_dates_would_be_lost(self):
        det = self.alert('2', 'עד הרצל/הירדן, ימינה הגליל והמשך מסלול רגיל.', ['1'], ['10'], [[300000, 400000]])
        weak = self.alert('3', 'התחנה מבוטלת', ['1'], ['10'], [[100000, 400000]])
        self.assertEqual({}, AF.merge_dups([det, weak])[1])

    def test_same_detail_keeps_the_longer_text(self):
        a = self.alert('5', 'עקב עבודות התחנה הבאה מבוטלת זמנית', ['1'], ['5'], [[1, 2]])
        b = self.alert('4', 'קו 5 ידלג על תחנה 43727 ויחזור אחרי תחנת פורטק', ['1'], ['5'], [[1, 2]])
        self.assertEqual({'5': '4'}, AF.merge_dups([a, b])[1])


class GroupTests(unittest.TestCase):
    """הודעות של חברות שונות על אותן עבודות — כרטיס אחד; עבודות ברחובות סמוכים לא משורשרות (שלמה 20.10)."""

    def alert(self, i, h, codes, per=((100, 200),)):
        return {'id': i, 'h': h, 's': '2026-10-18', 'rm': [[c, ''] for c in codes], 'per': [list(p) for p in per]}

    def setUp(self):
        AF.STOP_POS.update({'s1': (32.075, 34.853), 's2': (32.0752, 34.8533), 's3': (32.10, 34.80), 's4': (32.0751, 34.8531)})
        self.stops = {'s1': ('1', ''), 's2': ('2', ''), 's3': ('3', ''), 's4': ('4', '')}

    def test_same_works_different_operators(self):
        al = [self.alert('a', 'גבעת שמואל – עבודות יום ברחוב יוני נתניהו בקטע מוטה גור/זבולון המר', ['1']),
              self.alert('b', "גבעת שמואל, עבודות יום, רח' יוני נתניהו 18-20/10/26.", ['2']),
              self.alert('c', 'גבעת שמואל, עבודות תשתית, רחוב יוני נתניהו, 18.10.26', ['4'])]
        self.assertEqual(1, AF.group_alerts(al, self.stops))
        self.assertEqual({'a'}, {x['grp'] for x in al})

    def test_far_apart_or_other_street_or_other_dates_not_grouped(self):
        al = [self.alert('a', "תל-אביב – עבודות לילה ברח' קרליבך", ['1']),
              self.alert('b', "תל אביב, עבודות לילה, רח' קרליבך", ['3']),            # רחוק
              self.alert('c', "תל אביב, עבודות לילה, רח' המלך ג'ורג'", ['2']),       # רחוב אחר
              self.alert('d', "תל אביב, עבודות לילה, רח' קרליבך", ['4'], ((300, 400),))]   # תאריכים אחרים
        self.assertEqual(0, AF.group_alerts(al, self.stops))

    def test_city_spelling(self):
        self.assertEqual('תל אביב', AF._city('תל-אביב – עבודות'))
        self.assertEqual('תל אביב', AF._city('תל אביב יפו - עבודות'))
        self.assertEqual('ראשון לציון', AF._city('ראשל"צ - חסימה'))


class StreetMatchTests(unittest.TestCase):
    def test_prefix_then_road_word(self):
        # "לדרך הרים" בנוסח, "הרים" במפה (אילת 18.10) — אחרי הורדת ה-ל גם "דרך" יורדת
        net = AR.Streets([({'name': 'הרים', 'highway': 'primary'}, [(29.54, 34.93), (29.545, 34.935)]),
                          ({'name': 'שדרות ששת הימים', 'highway': 'primary'}, [(29.55, 34.94), (29.551, 34.941)])])
        self.assertEqual({'הרים'}, net.match('לדרך הרים'))
        self.assertEqual({'ששת הימים'}, net.match('לשדרות ששת הימים'))

    def test_road_number_and_typo(self):
        net = AR.Streets([({'name': 'יהושע שטמפפר', 'highway': 'secondary'}, [(32.09, 34.88), (32.091, 34.881)]),
                          ({'name': '', 'ref': '461', 'highway': 'primary'}, [(32.03, 34.86), (32.031, 34.861)])])
        self.assertEqual({'יהושע שטמפפר'}, net.match('שמפפר'))
        self.assertEqual({'כביש 461'}, net.match('לכביש 461'))
        self.assertEqual({'כביש 461'}, net.match("כביש מס' 461"))


class DetourTests(unittest.TestCase):
    """רשת קטנה: הראשי (מזרח-מערב) חסום באמצע; עוקפים דרך אחד ← הצפוני ← שתיים."""

    def setUp(self):
        lon = lambda i: round(34.8 + 0.001 * i, 6)  # noqa: E731
        self.net = AR.Streets([
            ({'name': 'הראשי', 'highway': 'primary'}, [(32.0, lon(i)) for i in range(11)]),
            ({'name': 'הצפוני', 'highway': 'residential'}, [(32.002, lon(i)) for i in range(11)]),
            ({'name': 'אחד', 'highway': 'residential'}, [(32.0, lon(3)), (32.001, lon(3)), (32.002, lon(3))]),
            ({'name': 'שתיים', 'highway': 'residential'}, [(32.0, lon(7)), (32.001, lon(7)), (32.002, lon(7))]),
        ])
        self.shape = [(32.0, round(34.8 + 0.0002 * i, 6)) for i in range(51)]

    def route(self, start, steps):
        return AR.route_detour(self.net, {'start': start, 'steps': steps}, self.shape, 20, 30)

    def test_by_junction(self):
        r = self.route(('הראשי', 'אחד'), ['לאחד', 'הצפוני', 'שתיים'])
        self.assertIsNotNone(r)
        self.assertIn((32.002, 34.805), [tuple(p) for p in r['path']])
        self.assertEqual(35, r['i_in'])

    def test_unknown_junction_falls_back_to_first_street(self):
        self.assertIsNotNone(self.route(('הראשי', 'לא קיים'), ['אחד', 'הצפוני', 'שתיים']))

    def test_typo_and_skipped_street(self):
        self.assertIsNotNone(self.route(('הראשי', 'אחד'), ['אחד', 'הצפני', 'שתיים']))
        self.assertIsNotNone(self.route(('הראשי', 'אחד'), ['אחד', 'שתיים']))

    def test_two_streets_in_one_step(self):
        self.assertIsNotNone(self.route(None, ['אחד', 'הצפוני ושתיים']))

    def test_one_way_against_the_text_still_follows_the_text(self):
        # הצפוני חד-סטרי מערבה במפה, וההודעה אומרת לנסוע בו מזרחה (פנייה שלא מחוברת במפה) — בלי זה הדרך
        # מסתובבת או לא נמצאת (תל אביב 20.10, בגין ← קפלן)
        lon = lambda i: round(34.8 + 0.001 * i, 6)  # noqa: E731
        net = AR.Streets([
            ({'name': 'הראשי', 'highway': 'primary'}, [(32.0, lon(i)) for i in range(11)]),
            ({'name': 'הצפוני', 'highway': 'residential', 'oneway': '-1'}, [(32.002, lon(i)) for i in range(11)]),
            ({'name': 'אחד', 'highway': 'residential'}, [(32.0, lon(3)), (32.001, lon(3)), (32.002, lon(3))]),
            ({'name': 'שתיים', 'highway': 'residential'}, [(32.0, lon(7)), (32.001, lon(7)), (32.002, lon(7))]),
        ])
        r = AR.route_detour(net, {'start': ('הראשי', 'אחד'), 'steps': ['לאחד', 'הצפוני', 'שתיים']}, self.shape, 20, 30)
        self.assertIsNotNone(r)
        self.assertLess(r['len'], 1000)

    def test_cut_on_a_route_that_passes_twice(self):
        # הלוך מזרחה ובחזרה מערבה באותו רחוב: שתי תחנות סמוכות — הקטע הקצר, לא מההלוך עד החזור
        sh = [(32.0, 34.80 + 0.0005 * i) for i in range(20)] + [(32.0001, 34.80 + 0.0005 * i) for i in range(19, -1, -1)]
        self.assertEqual([4, 8], AR.cut_range(sh, [(32.0, 34.802), (32.0, 34.804)]))

    def test_first_pass_through_a_junction(self):
        # קו שעובר באותה צומת בכניסה לשכונה וביציאה ממנה: החזרה למסלול — במעבר הראשון (קריית שמונה 20.10)
        dist = {10: 30.0, 11: 20.0, 12: 35.0, 80: 2.0, 81: 5.0}
        self.assertEqual(11, AR._first_pass(list(dist), dist))
        self.assertEqual(80, AR._first_pass(list(dist), dist, last=True))

    def test_despike(self):
        a, b, c, d = (0, 0), (0, 1), (0, 2), (1, 2)
        self.assertEqual([a, b, d], AR._despike([a, b, c, c, b, d]))

    def test_mostly_unknown_streets_give_nothing(self):
        self.assertIsNone(self.route(('הראשי', 'אחד'), ['אחד', 'מחלף א', 'מחלף ב', 'מחלף ג']))


class CauseTests(unittest.TestCase):
    def test_causes(self):
        cases = {
            'אשדוד, עבודות תשתית, צומת הפלמ"ח/עוזיהו': 'works',
            'ירושלים - מרתון ירושלים': 'event',
            'תל אביב, הפגנה ברחוב קפלן': 'protest',
            'חיפה - פעילות משטרתית בשדרות הנשיא': 'police',
            'באר שבע, תאונת דרכים ברגר': 'accident',
            'נתניה - רכב תקוע ברחוב הרצל': 'stuck',
            'תל אביב – העתקת תחנה בצומת ויצמן/פנקס - החל מתאריך - 12.10.2026': 'relocate',
            'רמת גן, תחנה זמנית ברחוב ביאליק עקב עבודות': 'relocate',
            'מודיעין - שינוי בלוח הזמנים': 'other',
        }
        for h, want in cases.items():
            self.assertEqual(want, AF.cause_of(h, ''), h)

    def test_every_cause_has_a_label(self):
        for k, _, _ in AF.CAUSES:
            self.assertIn(k, AF.CAUSE_LABEL)
        self.assertIn('other', AF.CAUSE_LABEL)


class PushTests(unittest.TestCase):
    A = {'id': '1', 'cause': 'works', 'h': 'אשדוד, עבודות, הפלמ"ח', 's': '2026-10-18T05:00:00.000+03:00',
         'e': '2026-10-22T18:00:00.000+03:00', 'lines': [['16', '6588-1-1', 'הטיילת'], ['20', '6601-2-1', 'הטיילת']]}

    def test_one_alert(self):
        t, b, u = AP.message([(self.A, {'6588'})], {'works': 'עבודות'})
        self.assertEqual('שינוי זמני בקו 16', t)
        self.assertTrue(b.startswith('עבודות · 18.10–22.10 — '))
        self.assertTrue(u.endswith('/alerts/#1'))

    def test_several_alerts_one_message(self):
        b2 = dict(self.A, id='2', h='ירושלים, מרתון', lines=[['18', '1-1-1', '']])
        t, b, u = AP.message([(self.A, None), (b2, None)], {})
        self.assertEqual('2 שינויים זמניים חדשים', t)
        self.assertIn('קווים 16, 20', b)
        self.assertTrue(u.endswith('/alerts/'))

    def test_temp_group_is_read_from_tags(self):
        s = AP.SP.parse_sub({'kb': 'f=1|g=rem,temp|c=cabc'})
        self.assertIn('kg_temp', s['groups'])

    def test_merged_then_split_is_not_sent_again(self):
        import json
        import tempfile
        from unittest import mock
        A = dict(self.A, e='2099-01-01T00:00+02:00')
        B = dict(A, id='2')
        with tempfile.TemporaryDirectory() as d, mock.patch.object(AP, 'OUT', d), mock.patch.object(AP, 'DRY', False), \
                mock.patch.object(AP.SP, 'APP_ID', ''), mock.patch.object(AP.SP, 'API_KEY', ''):
            def run(alerts, alias):
                json.dump({'alerts': alerts, 'alias': alias}, open(f'{d}/alerts.json', 'w'))
                AP.main()
                return json.load(open(f'{d}/push.json'))['seen']
            json.dump({'seen': ['1']}, open(f'{d}/push.json', 'w'))   # הפורמט הישן (רשימה)
            run([A], {})
            self.assertIn('1', run([dict(B, also=['1'])], {'1': '2'}))   # 1 אוחד לתוך 2 — נשאר בזיכרון
            import contextlib
            import io
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                seen = run([A, B], {})                                  # ונפרד — לא חדש
            self.assertIn('· 0 חדשות', buf.getvalue())
            self.assertEqual({'1', '2'}, set(seen))
            self.assertIn('1', run([B], {}))                             # ירד מהפיד לריצה אחת — עדיין זוכרים


class PipelineTests(unittest.TestCase):
    """main() של alerts_fetch בלי רשת: נוסח שהשתנה, משיכה שנכשלה, GTFS שלא נמשך."""
    RC = {'route_changes': {'דן': {'5_1234': [{'shape': [[34.80, 32.00], [34.81, 32.01]], 'line_number': '5',
                                                 'route_desc': '1234-1-0', 'deleted_stop_ids': ['s1'],
                                                 'updated_stop_sequence': [['s1', False]]}]}},
          'stops_for_map': {'s1': {'stop_lat': 32.005, 'stop_lon': 34.805}}}

    def alert(self, d):
        return {'id': 1, 'use_case': 5, 'header': {'he': 'עיר - עבודות'}, 'description': {'he': d},
                'removed_stop_ids': ['s1'], 'relevant_lines': {'דן': ['5_1234']}, 'first_start_time': '2026-10-20T05:00+03:00'}

    def run_main(self, d, rc, stops):
        import json
        import os
        from unittest import mock
        feed = {'alerts': [self.alert(d)]}
        get = lambda url, **k: feed if 'all_alerts' in url else rc   # noqa: E731
        with mock.patch.object(AF, 'get_json', get), mock.patch.object(AF, 'stop_names', lambda: dict(stops)), \
                mock.patch.object(AF, 'estimate_routes', lambda a, r, s: 'ok'), mock.patch('time.sleep'):
            AF.main()
        st = json.load(open(f'{AF.OUT}/state.json'))['1']
        return st, os.path.exists(f'{AF.OUT}/rc/1.json'), json.load(open(f'{AF.OUT}/alerts.json'))['alerts'][0]

    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.old = AF.OUT, AF.TEMP_DIR, AF.LINES_DIR
        AF.OUT, AF.TEMP_DIR, AF.LINES_DIR = f'{self.tmp.name}/a', f'{self.tmp.name}/t', f'{self.tmp.name}/none'
        import os
        os.makedirs(AF.TEMP_DIR)

    def tearDown(self):
        AF.OUT, AF.TEMP_DIR, AF.LINES_DIR = self.old
        self.tmp.cleanup()

    def test_changed_text_and_failed_fetch_drops_old_map(self):
        st, has, a = self.run_main('נוסח א', self.RC, {'s1': ('111', 'תחנה')})
        self.assertTrue(has and st['map'] and a['kind'] == 'route')
        st, has, a = self.run_main('נוסח ב', None, {'s1': ('111', 'תחנה')})
        self.assertFalse(has)
        self.assertEqual((st['map'], st.get('status')), (False, 'fetch'))
        self.assertNotEqual(a['kind'], 'route')
        st, has, a = self.run_main('נוסח ב', self.RC, {'s1': ('111', 'תחנה')})
        self.assertTrue(has and st['map'])

    def test_report_matches_final_state(self):
        import json
        self.run_main('נוסח א', self.RC, {'s1': ('111', 'תחנה')})
        self.run_main('נוסח א', self.RC, {'s1': ('111', 'תחנה')})   # בלי חישוב — הסיכום עדיין מלא
        r = json.load(open(f'{AF.OUT}/report.json'))
        self.assertEqual(sum(r['kinds'].values()), r['n'])
        self.assertEqual(sum(r['causes'].values()), r['n'])
        self.assertEqual(r['route'], {'ok': 1})

    def test_failed_fetch_same_text_keeps_map(self):
        self.run_main('נוסח א', self.RC, {'s1': ('111', 'תחנה')})
        import json
        f = f'{AF.OUT}/state.json'
        s = json.load(open(f))
        s['1']['pv'] = -1   # קריאת הנוסח השתנתה — מחשבים שוב
        json.dump(s, open(f, 'w'))
        st, has, _ = self.run_main('נוסח א', None, {})
        self.assertTrue(has and st['map'])
        self.assertEqual(st['status'], 'fetch')

    def test_parse_lock_keeps_existing_maps(self):
        import json
        from unittest import mock
        self.run_main('נוסח א', self.RC, {'s1': ('111', 'תחנה')})
        f = f'{AF.OUT}/state.json'
        s = json.load(open(f))
        s['1']['pv'] = -1
        json.dump(s, open(f, 'w'))
        with mock.patch.object(AF, 'PARSE_LOCK', True):
            st, has, _ = self.run_main('נוסח א', None, {})   # לא נמשך בכלל — אחרת היה status=fetch
        self.assertEqual((st['pv'], st['status']), (-1, 'ok'))

    def test_gtfs_failure_keeps_previous_map_and_retries(self):
        import json
        self.run_main('נוסח א', self.RC, {'s1': ('111', 'תחנה')})
        before = open(f'{AF.OUT}/rc/1.json').read()
        st, has, _ = self.run_main('נוסח ב', self.RC, {})
        self.assertTrue(has)
        self.assertEqual(open(f'{AF.OUT}/rc/1.json').read(), before)
        self.assertEqual(st['status'], 'gtfs')
        st, has, _ = self.run_main('נוסח ב', self.RC, {'s1': ('111', 'תחנה')})
        self.assertEqual(st['status'], 'ok')
        self.assertEqual(json.load(open(f'{AF.OUT}/rc/1.json'))['stops']['s1'][2], '111')
        # בלי תחנות ובלי מפה קודמת — לא נשמרת מפה פגומה
        self.tearDown(); self.setUp()
        st, has, _ = self.run_main('נוסח א', self.RC, {})
        self.assertFalse(has)
        self.assertEqual((st['map'], st['status']), (False, 'gtfs'))


if __name__ == '__main__':
    unittest.main()


def test_route_without_line_number():
    """28.10: קו בלי מספר (line_number = None) הפיל את כל הריצה ב-re.sub"""
    import alerts_fetch as F
    a = {'description': {'he': 'קו 5 יסיים את מסלולו בתחנה הרצל.'}, 'header': {'he': ''}}
    rs = [{'num': None, 'rd': '12345-1-#', 'shape': [], 'seq': [], 'del': [], 'cut': None}]
    F.estimate_routes(a, rs, {})
    assert rs[0]['num'] == ''


class ClosedCheckTests(unittest.TestCase):
    """עקיפה שהקטע הסגור שלה באתר שגוי — נפסלת בזמן הניתוב (AR.closed_check)."""
    RC = Path(__file__).parents[1] / 'alerts' / 'data' / 'rc'

    def route(self, aid, rd):
        import json
        f = self.RC / f'{aid}.json'
        if not f.exists():
            self.skipTest(f'{f.name} לא בנתונים')
        rc = json.load(open(f))
        r = next((r for r in rc['routes'] if r['rd'] == rd), None)
        if r is None:
            self.skipTest(f'{rd} לא ב-{f.name}')
        st = rc['stops']
        return [tuple(p) for p in r['shape']], [st[s][:2] for s in r['del'] if s in st]

    def test_line70_round_trip_long(self):
        # 14587894314 קו 70 בנתניה: יציאה מבנימין במעבר הראשון וחזרה אחרי השני — קטע סגור של כ-12.9 ק"מ
        sh, dels = self.route('14587894314', '34070-3-#')
        self.assertEqual(AR.closed_check(sh, [sh[21], sh[101]], dels, 1555), 'closed-long')

    def test_line35_back_before_last_del(self):
        # 14592923027 קו 35 בתל אביב: חזרה למסלול לפני התחנה המבוטלת האחרונה (חיל השריון/גולומב)
        sh, dels = self.route('14592923027', '36035-1-#')
        self.assertEqual(AR.closed_check(sh, [(32.0480, 34.7934), sh[99]], dels, 1369), 'closed-misses-del')
        # חזרה בצומת קיבוץ גלויות/חיל השריון — תקין
        self.assertIsNone(AR.closed_check(sh, [(32.0480, 34.7934), (32.04722, 34.78260)], dels, 1369))

    def test_matches_regression_rules(self):
        # אותו חישוב כמו closed-long / closed-misses-del בבדיקת הרגרסיה, על כל מה שחושב
        import glob
        import json
        sys.path.insert(0, str(TOOLS))
        import test_alerts_regression as T
        bad = T.invariants({})
        want = set(bad['closed-long']) | set(bad['closed-misses-del'])
        got = set()
        for f in sorted(glob.glob(str(self.RC / '*.json'))):
            rc = json.load(open(f))
            st, seen = rc.get('stops') or {}, {}
            for r in rc['routes']:
                key = f"{rc['id']}/{r.get('rd')}"
                seen[key] = seen.get(key, 0) + 1
                if seen[key] > 1:
                    key += f'#{seen[key]}'
                est = r.get('est')
                if not est or not est.get('path') or len(r.get('shape') or []) < 2:
                    continue
                path = [tuple(p) for p in est['path']]
                dels = [st[s][:2] for s in r.get('del') or [] if s in st]
                if AR.closed_check(r['shape'], path, dels, T._len(path)):
                    got.add(key)
        self.assertEqual(got, want)

    def test_estimate_skips_bad_closed(self):
        # פסקה ראשונה — קטע סגור של כ-4.6 ק"מ לעקיפה של 100 מ'; השנייה תקינה — נבחרת השנייה
        from unittest import mock
        sh = [[32.0, 34.8 + i * 0.001] for i in range(60)]
        d = ('קו 2 לכיוון X:\nנוסעים במסלול הרגיל עד לכיכר תל חי/בן גוריון, ימינה לרח\' רוטשילד וממשיכים במסלול הרגיל.\n'
             'קו 2 לכיוון Y:\nנוסעים במסלול הרגיל עד לכיכר תל חי/בן גוריון, ימינה לרח\' הרצל וממשיכים במסלול הרגיל.')

        def run(ok_second):
            def fake(net, p, shape, c0, c1, diag=None):
                if 'רוטשילד' in ' '.join(p['steps']):
                    return {'path': [sh[1], [32.0005, 34.825], sh[50]], 'streets': ['רוטשילד'], 'len': 100}
                if ok_second:
                    return {'path': [sh[20], [32.0005, 34.821], sh[22]], 'streets': ['הרצל'], 'len': 150}
                diag['why'] = 'no-plan'
                return None
            r = {'num': '2', 'rd': '1-1-#', 'shape': sh, 'cut': [20, 22], 'cuts': [], 'seq': [], 'del': [], 'to': ''}
            with mock.patch.object(AF, 'overpass', return_value=[1]), mock.patch.object(AF.AR, 'Streets'), \
                    mock.patch.object(AF.AR, 'route_detour', side_effect=fake):
                AF.estimate_routes({'id': 'x', 'description': {'he': d}}, [r], {})
            return r
        r = run(True)
        self.assertEqual((r['why'], r['est']['streets']), ('ok', ['הרצל']))
        r = run(False)
        self.assertEqual(r['why'], 'no-match')
        self.assertIn('p0 closed-long', r['why_d'])


class TrimSharedRoundaboutTests(unittest.TestCase):
    """תחילת העקיפה בכיכר: נקודת היציאה נפלה בצד השני של הכיכר (AR._trim_shared)."""

    def test_eilat_line3_exit_moves_back(self):
        # אילת 14455262371, קו 3 משחמון: היציאה הייתה 36.7 מ' מהצומת הראשון של העקיפה (לכיוון שרה אמנו)
        import json
        f = json.load(open(TOOLS / 'testdata' / 'alerts-trim-roundabout.json'))
        sh = [tuple(p) for p in f['shape']]
        p = [tuple(x) for x in f['path']]
        _, i_out, i_in = AR._trim_shared(p[1:-1], sh, f['i_out'], f['i_in'])
        self.assertEqual(i_in, f['i_in'])
        self.assertLess(i_out, f['i_out'])
        self.assertAlmostEqual(AR.meters(sh[f['i_out']], p[1]), 36.7, delta=0.5)
        self.assertLess(AR.meters(sh[i_out], p[1]), 16)

    def straight(self, first):
        # שרטוט ישר מערבה-מזרחה (כל נקודה כ-10 מ'), יציאה ב-20; העקיפה יוצאת צפונה מ-first
        sh = [(32.0, 34.8 + i * 0.0001) for i in range(60)]
        path = [first, (first[0] + 0.0003, first[1]), (first[0] + 0.0006, first[1]),
                (32.0006, sh[40][1]), (32.0003, sh[40][1]), sh[40]]
        return sh, path

    def test_exit_at_junction_unchanged(self):
        sh, path = self.straight((32.0, 34.8 + 20 * 0.0001))
        self.assertEqual(AR._trim_shared(path, sh, 20, 40)[1], 20)

    def test_small_gain_unchanged(self):
        # הצומת הראשון כ-9 מ' מצפון לנקודה 19: נקודה 19 קרובה אליו רק בכ-4 מ' יותר מ-20 — לא זזים
        sh, path = self.straight((32.00008, 34.8 + 19 * 0.0001))
        d20, d19 = AR.meters(sh[20], path[0]), AR.meters(sh[19], path[0])
        self.assertTrue(3 < d20 - d19 < 6)
        self.assertEqual(AR._trim_shared(path, sh, 20, 40)[1], 20)


class LoopSkipTests(unittest.TestCase):
    """דילוג על לולאה: הקו עובר באותו צומת לפני הקטע הסגור ואחריו (AR._trim_shared עם cut0).
    נתניה 14594603230, קו 64 כיוון 2: "מהגביש שמאלה להארי טרומן" — רשת רחובות מלאכותית מהשרטוט."""

    @classmethod
    def setUpClass(cls):
        import json
        f = json.load(open(TOOLS / 'testdata' / 'alerts-loop-skip.json'))
        S = [tuple(p) for p in f['shape']]
        cls.shape = [(round(a, 6), round(b, 6)) for a, b in AR._densify(S, 8.0)]
        cls.cut0, cls.cut1 = AR.cut_range(cls.shape, [tuple(x) for x in f['del']])
        J = (32.28672, 34.86296)  # הגביש/הארי טרומן
        ways = [
            ({'name': 'הגביש', 'highway': 'secondary'}, [S[9], J, S[10], S[21], S[20]]),
            ({'name': 'המחשב', 'highway': 'residential'}, S[10:16]),
            ({'name': 'הצורן', 'highway': 'residential'}, S[15:19]),
            ({'name': 'המחקר', 'highway': 'residential'}, S[18:21]),
            ({'name': 'הארי טרומן', 'highway': 'secondary'}, [J] + S[24:32]),
        ]
        cls.net = AR.Streets([(t, [(round(a, 6), round(b, 6)) for a, b in AR._densify(g, 10.0)]) for t, g in ways])

    def route(self, steps):
        dg = {}
        return AR.route_detour(self.net, {'steps': steps, 'start': None}, self.shape, self.cut0, self.cut1, diag=dg), dg

    def test_skip_loop_ok(self):
        r, dg = self.route(['מהגביש', 'להארי טרומן'])
        self.assertIsNotNone(r, dg)
        self.assertLess(r['i_out'], self.cut0)
        self.assertGreater(r['i_in'], self.cut1)
        # יוצאים וחוזרים באותו צומת, והקטע הסגור הוא הלולאה כולה
        self.assertLess(AR.meters(self.shape[r['i_out']], self.shape[r['i_in']]), 40)

    def test_one_street_unchanged(self):
        r, _ = self.route(['מהגביש'])
        self.assertEqual((r['i_out'], r['i_in']), (164, 278))

    def test_no_pass_before_cut_unchanged(self):
        # עקיפה קצרה שנגמרת אחרי הקטע הסגור, בלי מעבר בסביבה לפני הקטע הסגור (הכיוון ההפוך) — לא זזים
        sh = [(32.0, round(34.8 + 0.0001 * i, 6)) for i in range(60)]
        path = [sh[45], (32.0001, sh[45][1]), (32.0001, sh[46][1]), sh[46]]
        _, i_out, _ = AR._trim_shared(path, sh, 45, 46, 30, cut0=20)
        self.assertGreaterEqual(i_out, 30)
