import importlib.util
import math
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('bus_speed', Path(__file__).parents[1] / 'tools' / 'bus_speed.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

# קו r1: שלוש תחנות, האחרונה (רצף 3) ב-32.0, 35.0
RS = ({'r1': {1: 'A', 2: 'B', 3: 'C'}}, {'A': (31.98, 35.0), 'B': (31.99, 35.0), 'C': (32.0, 35.0)}, {'r1'}, {})
DEP = '2026-11-09T08:00:00+02:00'


class ArrivedTests(unittest.TestCase):
    def setUp(self):
        self.last = b.last_stops(RS)
        self.done = set()

    def arr(self, order, vel, la, lo=35.0, veh='3/1', dep=DEP):
        return b.arrived(self.done, self.last, veh, dep, 'r1', order, vel, la, lo)

    def test_last_stop(self):
        self.assertEqual((3, 32.0, 35.0), self.last['r1'])
        self.assertEqual({}, b.last_stops(None))

    def test_driving_to_last_stop_counts(self):
        self.assertFalse(self.arr(2, 0, 32.0))           # עומד ליד התחנה האחרונה, אבל התחנה הבאה עוד לא האחרונה
        self.assertFalse(self.arr(3, 25, 31.9995))        # בדרך לתחנה האחרונה, נוסע
        self.assertFalse(self.arr(3, 0, 31.997))          # עומד ברמזור כ-330 מ' לפני המסוף

    def test_idle_at_terminal_and_after(self):
        self.assertTrue(self.arr(3, 0, 31.9995))          # 55 מ' מהמסוף, עומד — הגיע
        self.assertTrue(self.arr(3, 30, 31.99))           # אחר כך באותה נסיעה (נוסע לחניון) — גם לא נספר
        self.assertFalse(self.arr(3, 30, 31.99, veh='3/2'))                      # רכב אחר
        self.assertFalse(self.arr(1, 0, 31.98, dep='2026-11-09T09:00:00+02:00'))  # הנסיעה הבאה של אותו רכב

    def test_no_departure_or_unknown_line(self):
        self.assertFalse(self.arr(3, 0, 32.0, dep=''))
        self.assertFalse(b.arrived(self.done, self.last, '3/1', DEP, 'r9', 3, 0, 32.0, 35.0))


class CountTests(unittest.TestCase):
    def test_encoding_close(self):
        for n in (5, 17, 100, 1234, 30000):
            q = b.CNT.index(b.cnt_enc(n))
            self.assertLess(abs(2 ** (q / 4) / n - 1), 0.1)
        self.assertEqual(b.CNT[-1], b.cnt_enc(10 ** 9))
        self.assertEqual(1, len(b.cnt_enc(1)))


if __name__ == '__main__':
    unittest.main()
