import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('bus_reliability', Path(__file__).parents[1] / 'tools' / 'bus_reliability.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class BlameTests(unittest.TestCase):
    def test_split_dispatch_planning_traffic(self):
        BT = []
        # קו r1: בלילה (שעה 3) מוסיף בדרך דקה — זה התכנון; בבוקר (8) מוסיף 10 דק׳ — 9 מהן פקק
        for _ in range(3):
            BT.append(('אגד', 'r1', 3, 0, 0, 60, 10, 'חיפה'))
        for _ in range(3):
            BT.append(('אגד', 'r1', 8, 240, 240, 840, 10, 'חיפה'))   # יצא 4 דק׳ באיחור
        r = b.blame_day(BT, {'r1': [''] * 8 + ['חיפה עירוני', '', '']})
        a = dict(zip(b.BLAME_COLS, r['agencies']['אגד']))
        self.assertEqual(6, a['trips'])
        self.assertEqual(720, a['dispatch late sec (sum of positive origin delay)'])   # 3 × 240
        self.assertEqual(3, a['departed on time (-1..+3 min)'])
        self.assertEqual(3, a['departed late (> +3 min)'])
        self.assertEqual(360, a['planning sec (sum)'])                                # 6 × 60
        self.assertEqual(1620, a['traffic sec (sum)'])                                # 3 × 540
        self.assertNotIn('חיפה עירוני', r['clusters'])                                # פחות מ-30 נסיעות

    def test_unmeasured_origin_is_not_dispatch(self):
        r = b.blame_day([('דן', 'r2', 9, None, 120, 300, 5, 'תל אביב')], {})
        a = dict(zip(b.BLAME_COLS, r['agencies']['דן']))
        self.assertEqual(0, a['origin measured'])
        self.assertEqual(0, a['trips with en-route split'])   # בקו אין שעה עם 3 נסיעות — אין בסיס לתכנון


if __name__ == '__main__':
    unittest.main()
