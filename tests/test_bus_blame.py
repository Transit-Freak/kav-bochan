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


    def test_time_given_for_trip(self):
        # קו 2 בקרית מלאכי, 8.10 (שלמה 11.10: "נותנים לקו 2 30–40 דקות"): בלו"ז הרשמי 21 דק'.
        # בבוקר הנסיעה של 7:55 לקחה 40 דק' והאוטובוס יצא שוב ב-8:45 — ניתנו לה 50 דק'.
        # בערב הנסיעה של 19:15 לקחה 35 דק', והבאה (19:45) יצאה ב-20:00 — ניתנו רק 30.
        H, P = 3600, (31.73, 34.74)
        far = (31.80, 34.74)
        m = lambda h, mi: h * H + mi * 60
        DQ = [
            ('דן בדרום', 'r2', m(7, 55), m(8, 16), 120, 21 * 60, '1', P, P),     # יצא 7:57, הגיע 8:37
            ('דן בדרום', 'r2b', m(8, 45), m(9, 5), 0, 0, '1', P, P),
            ('דן בדרום', 'r2', m(19, 15), m(19, 36), 240, 18 * 60, '2', P, P),   # יצא 19:19, הגיע 19:54
            ('דן בדרום', 'r2b', m(19, 45), m(20, 5), 900, 0, '2', P, P),
            ('דן בדרום', 'r2', m(12, 0), m(12, 21), 0, 0, '3', P, far),          # הבאה רחוקה — לא נספר
            ('דן בדרום', 'r2b', m(12, 30), m(12, 50), 0, 0, '3', P, P),
        ]
        r = b.layover_day(DQ, {})
        a = dict(zip(b.LAY_COLS, r['agencies']['דן בדרום']))
        g = lambda blk, k: a[blk + k]
        PK, OF = 'peak (06-09, 15-19): ', 'off-peak: '
        N = "trips followed by the same vehicle's next trip (from within 1.5 km of its end, up to 90 min after)"
        GIV = "time given sec (sum): next trip's scheduled departure minus this trip's scheduled departure"
        # 7:55 בשיא; 19:15 כבר אחרי השיא (15:00–19:00); 12:00 לא נספר (הבאה רחוקה)
        self.assertEqual(1, g(PK, N))
        self.assertEqual(50 * 60, g(PK, GIV))
        self.assertEqual(21 * 60, g(PK, 'official trip time sec (sum): scheduled end minus scheduled departure'))
        self.assertEqual(40 * 60, g(PK, 'actual trip time sec (sum, of those)'))
        self.assertEqual(1, g(PK, 'bus reached the end 1+ min before the next scheduled departure'))
        self.assertEqual(1, g(PK, 'of them: departed on time (-1..+3 min)'))
        self.assertEqual(1, g(OF, N))
        self.assertEqual(30 * 60, g(OF, GIV))
        self.assertEqual(35 * 60, g(OF, 'actual trip time sec (sum, of those)'))
        self.assertEqual(0, g(OF, 'bus reached the end 1+ min before the next scheduled departure'))
        self.assertEqual(1, g(OF, 'next trip departure measured'))
        self.assertEqual(0, g(OF, 'of them: departed on time (-1..+3 min)'))

if __name__ == '__main__':
    unittest.main()
