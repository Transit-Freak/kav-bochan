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

    def test_template(self):
        self.assertEqual('junction', AR.template(ASHDOD))
        self.assertEqual('stops', AR.template('עקב עבודות התחנות הבאות מבוטלות זמנית:\n53696 - האצ"ל/נוף חרמון'))
        self.assertEqual('skip', AR.template('קו 73 ידלג על תחנה 36358 - המלאכה/הרוקמים'))
        self.assertEqual('general', AR.template('עקב אירוע צפויים עיכובים בקווים באזור.'))


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


if __name__ == '__main__':
    unittest.main()
