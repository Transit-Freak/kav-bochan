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


    def test_returning_bus_late_vs_on_time(self):
        # האם הסדרנים מתחשבים בפקקים (שלמה 11.10): יציאה מול הנסיעה של אותו קו בכיוון השני שחוזרת לפניה
        H = 3600
        DQ = [
            ('קווים', 'rB', '100', '2', 7 * H - 3000, 7 * H - 600, 0, 0),      # חוזר 10 דק׳ לפני 7:00 — בזמן
            ('קווים', 'rB', '100', '2', 8 * H - 3000, 8 * H - 300, 0, 600),    # אמור לחזור 7:55, חזר 8:05 — באיחור
            ('קווים', 'rB', '100', '2', 9 * H - 3000, 9 * H - 300, 0, None),   # לא נמדד עד הסוף — לא נחשב
            ('קווים', 'rA', '100', '1', 7 * H, 7 * H + 2400, 60, 120),         # חזר בזמן, יצא בזמן
            ('קווים', 'rA', '100', '1', 8 * H, 8 * H + 2400, 30, 0),           # חזר באיחור, ובכל זאת יצא בזמן
            ('קווים', 'rA', '100', '1', 9 * H, 9 * H + 2400, 400, 0),          # אין נסיעה חוזרת שנמדדה בשעה שלפני
            ('קווים', 'rA', '100', '1', 10 * H, 10 * H + 2400, None, 0),       # המוצא לא נמדד
        ]
        r = b.returns_day(DQ, {'rA': [''] * 8 + ['חשמונאים', '', '']})
        a = dict(zip(b.RET_COLS, r['agencies']['קווים']))
        # גם הנסיעות בכיוון 2 הן יציאות: זו של 8:10 מוצאת את 7:40 בכיוון 1, שחזרה בזמן
        self.assertEqual([3, 1, 1, 30, 2, 2, 60], r['tot'])
        self.assertEqual(1, a['returning bus arrived late: after the departure time minus 1 min'])
        self.assertNotIn('חשמונאים', r['clusters'])                                    # פחות מ-30 יציאות


if __name__ == '__main__':
    unittest.main()
