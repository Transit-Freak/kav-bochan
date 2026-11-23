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

    def test_late_departure_cause(self):
        # לכל נסיעה שיצאה באיחור (> 3 דק') — מה עשה אותו רכב לפני כן
        H, P = 3600, (31.73, 34.74)
        far = (31.90, 34.74)
        m = lambda h, mi: h * H + mi * 60
        ag = 'אגד'
        DQ = [
            # רכב 1: הנסיעה של 7:00 יצאה 5 דק' באיחור והגיעה 7:35 — הבאה (7:30) יצאה 7:40: (a), והקודמת יצאה באיחור
            (ag, 'r1', m(7, 0), m(7, 25), 300, 10 * 60, '1', P, P),     # הראשונה ביום, יצאה באיחור: (c)
            (ag, 'r1', m(7, 30), m(7, 55), 600, 0, '1', P, P),
            # רכב 2: הגיע 10:20, היציאה 10:30 — יצא 10:36: חיכה במסוף (b)
            (ag, 'r1', m(10, 0), m(10, 25), 0, -5 * 60, '2', P, P),
            (ag, 'r1', m(10, 30), m(10, 55), 360, 0, '2', P, P),
            # רכב 3: הקודמת יצאה בזמן אבל איבדה בדרך 10 דק' — (a) בלי "הקודמת יצאה באיחור"
            (ag, 'r1', m(12, 0), m(12, 25), 60, 10 * 60, '3', P, P),
            (ag, 'r1', m(12, 30), m(12, 55), 300, 0, '3', P, P),
            # רכב 4: הקודמת נגמרה רחוק — אין נסיעה קודמת שמתחברת (c); וסוף לא נמדד (d)
            (ag, 'r1', m(13, 0), m(13, 25), 0, 0, '4', P, far),
            (ag, 'r1', m(13, 30), m(13, 55), 400, None, '4', P, P),
            (ag, 'r1', m(14, 0), m(14, 25), 500, 0, '4', P, P),
            # בזמן — לא באיחור
            (ag, 'r1', m(14, 30), m(14, 55), 120, 0, '4', P, P),
        ]
        r = b.cause_day(DQ, {})
        a = dict(zip(b.CAUSE_COLS, r['agencies'][ag]))
        PK, OF = 'peak (06-09, 15-19): ', 'off-peak: '
        A, A1 = b._CAUSE_BLOCK[3], b._CAUSE_BLOCK[5]
        B, C, D = b._CAUSE_BLOCK[6], b._CAUSE_BLOCK[8], b._CAUSE_BLOCK[10]
        self.assertEqual(2, a[PK + 'departures with measured origin departure'])
        self.assertEqual(2, a[PK + 'departed late (> +3 min)'])
        self.assertEqual(1, a[PK + A])
        self.assertEqual(1, a[PK + A1])
        self.assertEqual(1, a[PK + C])
        self.assertEqual(300, a[PK + b._CAUSE_BLOCK[9]])
        self.assertEqual(8, a[OF + 'departures with measured origin departure'])
        self.assertEqual(4, a[OF + 'departed late (> +3 min)'])
        self.assertEqual(1, a[OF + A])
        self.assertEqual(0, a[OF + A1])
        self.assertEqual(1, a[OF + B])
        self.assertEqual(360, a[OF + b._CAUSE_BLOCK[7]])
        self.assertEqual(1, a[OF + C])
        self.assertEqual(1, a[OF + D])
        self.assertEqual(r['tot'], r['agencies'][ag])
        self.assertIn('r1', r['lines'])


if __name__ == '__main__':
    unittest.main()
