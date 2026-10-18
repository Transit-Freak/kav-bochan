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

    def test_street_names(self):
        self.assertEqual('הרצל', AR.clean_street('ימינה לרחוב הרצל'))
        self.assertEqual('בני ברית', AR.clean_street("שמאלה שד' בני ברית"))


class CauseTests(unittest.TestCase):
    def test_causes(self):
        cases = {
            'אשדוד, עבודות תשתית, צומת הפלמ"ח/עוזיהו': 'works',
            'ירושלים - מרתון ירושלים': 'event',
            'תל אביב, הפגנה ברחוב קפלן': 'protest',
            'חיפה - פעילות משטרתית בשדרות הנשיא': 'police',
            'באר שבע, תאונת דרכים ברגר': 'accident',
            'נתניה - רכב תקוע ברחוב הרצל': 'stuck',
            'העתקת תחנה בצומת ויצמן/פנקס': 'other',
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
