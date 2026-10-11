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


    def test_layover_absorbs_late_arrival(self):
        # המרווח במסוף (שלמה 11.10: בקרית מלאכי בשיא נותנים לקו 2 30–40 דק' עד הנסיעה הבאה)
        H, P = 3600, (31.75, 34.77)
        far = (31.80, 34.77)          # כ-5.5 ק"מ — לא אותו מסוף
        DQ = [
            # רכב 1: מגיע 7:20 באיחור 10 דק' (7:30), יוצא 7:50 — מרווח 30 דק', נספג, יצא בזמן
            ('קווים', 'r2', 6 * H + 3600, 7 * H + 1200, 0, 600, '1', P, P),
            ('קווים', 'r2', 7 * H + 3000, 8 * H + 600, 60, None, '1', P, P),
            # רכב 2: מגיע 12:00 באיחור 8 דק', יוצא 12:05 — מרווח 5 דק', לא נספג, יצא 3 דק' אחרי... באיחור 6
            ('קווים', 'r2', 11 * H, 12 * H, 0, 480, '2', P, P),
            ('קווים', 'r2', 12 * H + 300, 13 * H, 360, 0, '2', P, P),
            # רכב 3: הנסיעה הקודמת הסתיימה רחוק — לא נספר
            ('קווים', 'r2', 9 * H, 10 * H, 0, 0, '3', P, far),
            ('קווים', 'r2', 10 * H + 600, 11 * H, 0, 0, '3', P, P),
        ]
        r = b.layover_day(DQ, {'r2': [''] * 8 + ['קרית מלאכי', '', '']})
        a = dict(zip(b.LAY_COLS, r['agencies']['קווים']))
        self.assertEqual(2, r['tot'][0])
        self.assertEqual(1800 + 300, r['tot'][1])                    # מרווחים מתוכננים
        self.assertEqual(2, a['previous trip arrived 3+ min late'])
        self.assertEqual(1, a['of them: the layover absorbed it (bus there 1+ min before departure)'])
        self.assertEqual(0, a['of them (not absorbed): departed on time'])
        self.assertEqual(360, a['of them (not absorbed): sum of positive origin delay sec'])
        self.assertEqual(1, a['peak departures (06-09, 15-19)'])      # 7:50 בשיא, 12:05 לא
        self.assertNotIn('r2', r['lines'])                              # פחות מ-3 יציאות לקו — לא נשמר

if __name__ == '__main__':
    unittest.main()
