import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('rail_trace', Path(__file__).parents[1] / 'tools' / 'rail_trace.py')
t = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)

# שתי תחנות במרחק ~11 ק"מ: A (מוצא) ו-B, ואחריהן C ו-D
ST = {'1': ['A', 32.00, 34.80], '2': ['B', 32.10, 34.80], '3': ['C', 32.20, 34.80], '4': ['D', 32.30, 34.80]}
RIDE = {'s': [[1, 600, None, None], [2, 610, None, None], [3, 620, None, None], [4, 630, None, None]]}


def rec(m, stop, dist, vel, la=0.0, lo=0.0):
    return (m, str(stop), float(dist), float(vel), la, lo)


class RailTraceTests(unittest.TestCase):
    def test_arrival_and_departure_from_gps_standing(self):
        seq = [rec(599, 1, 0, 0, 32.0, 34.8), rec(601, 1, 300, 40, 32.003, 34.8),
               rec(605, 1, 5000, 120, 32.05, 34.8), rec(612, 2, 11000, 0, 32.1, 34.8),
               rec(613.5, 2, 11000, 0, 32.1, 34.8), rec(614.5, 2, 11300, 30, 32.102, 34.8)]
        rows, last_i, _ = t.trace_ride(RIDE, seq, ST)
        self.assertEqual(1.0, rows[0][3])                 # יצאה מ-A דקה אחרי הזמן
        self.assertEqual([2.0, 4.5, 'g', 2.5], rows[1][2:])  # הגיעה ל-B ב-612, יצאה ב-614.5
        self.assertEqual(1, last_i)
        self.assertEqual([(1, 2, 1.0)], t.gains(rows))   # בקטע A→B נוספה דקה

    def test_station_field_measures_arrival_without_gps(self):
        # במנהרה: אין מיקום, מהירות 0 תמיד — ההגעה לפי החלפת "התחנה הנוכחית", בלי עמידה ובלי יציאה
        seq = [rec(600, 1, 0, 0), rec(608, 1, 0, 0), rec(613, 2, 0, 0), rec(616, 2, 0, 0), rec(625, 3, 0, 0)]
        rows, last_i, _ = t.trace_ride(RIDE, seq, ST)
        self.assertEqual([3.0, None, 's', None], rows[1][2:])
        self.assertEqual(5.0, rows[2][2])
        self.assertEqual(2, last_i)

    def test_frozen_gps_while_station_advances_is_ignored(self):
        # ה-GPS תקוע ב-A, והתחנה הנוכחית ממשיכה ל-B ול-C (רכבת 506, 05.10)
        seq = [rec(600, 1, 100, 0, 32.0, 34.8)] + [rec(m, s, 100, 0, 32.0, 34.8) for m, s in ((605, 1), (611, 2), (621, 3))]
        frozen = t.unfreeze(seq)
        self.assertEqual(0.0, frozen[2][4])
        rows, _, _ = t.trace_ride(RIDE, seq, ST)
        self.assertEqual(1.0, rows[1][2])
        self.assertIsNone(rows[0][3])   # היציאה מ-A לא נמדדת מ-GPS תקוע

    def test_departure_far_from_station_is_not_trusted(self):
        # תחנה תת-קרקעית: השידור הבא אחרי העמידה כבר 11 ק"מ משם — היציאה לא ידועה
        seq = [rec(598, 1, 0, 0, 32.0, 34.8), rec(599, 1, 0, 0, 32.0, 34.8), rec(611, 2, 11000, 50, 32.1, 34.8)]
        rows, _, _ = t.trace_ride(RIDE, seq, ST)
        self.assertIsNone(rows[0][3])

    def test_frozen_tail_is_cut(self):
        seq = [rec(600, 1, 0, 50, 32.0, 34.8), rec(601, 1, 500, 0, 32.005, 34.8)] + [rec(602 + i, 1, 500, 0, 32.005, 34.8) for i in range(5)]
        self.assertEqual(2, t.frozen_tail(seq))


if __name__ == '__main__':
    unittest.main()
