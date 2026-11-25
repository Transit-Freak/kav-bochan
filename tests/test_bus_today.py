"""היום עד עכשיו (--partial) במדד דיוק האוטובוסים: סינון הנסיעות שהסתיימו ובניית הסיכום."""
import importlib.util
import unittest
from pathlib import Path


def _load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / 'tools' / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


b = _load('bus_reliability')


def acc(sched=0, obs=0, c=(0, 0, 0, 0, 0), d=(), o=(0, 0, 0, 0, 0)):
    c = list(c)
    return {'sched': sched, 'obs': obs, 'meas': sum(c), 'c': c, 'd': list(d), 'o': list(o)}


class FinishedTripsTests(unittest.TestCase):
    def test_only_trips_whose_scheduled_end_passed(self):
        st = {
            'done': [(1, 'A', 28800, 28800, None), (2, 'B', 30000, 30000, None)],     # 08:00–08:20
            'edge': [(1, 'A', 30000, 30000, None), (2, 'B', 32400, 32400, None)],     # מסתיימת בדיוק ב-cutoff
            'running': [(1, 'A', 31000, 31000, None), (2, 'B', 34000, 34000, None)],  # יצאה, עוד לא הגיעה
            'later': [(1, 'A', 40000, 40000, None), (2, 'B', 41000, 41000, None)],
            'empty': [],
        }
        self.assertEqual({'done', 'edge'}, b.finished_trips(st, 32400))

    def test_after_midnight_times_are_not_finished_in_the_morning(self):
        # 25:10 בלו"ז = 01:10 של מחר — לא "הסתיימה" ב-23:00 של היום
        st = {'night': [(1, 'A', 86000, 86000, None), (2, 'B', 90600, 90600, None)]}
        self.assertEqual(set(), b.finished_trips(st, 23 * 3600))


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.routes = {
            'r1': {'short': '1', 'long': 'א<->ב-1#', 'agency': 'אגד', 'mkt': '10001', 'dir': '1'},
            'r2': {'short': '2', 'long': 'ג<->ד-1#', 'agency': 'דן', 'mkt': '10002', 'dir': '2'},
            'r3': {'short': '3', 'long': 'ה<->ו-1#', 'agency': 'דן', 'mkt': '10003', 'dir': '1'},
        }
        self.R = {
            'r1': acc(obs=5, c=(0, 30, 0, 0, 0), d=[0] * 30),             # 100% בזמן
            'r2': acc(obs=4, c=(2, 10, 6, 4, 2), d=[600] * 24),           # 10/24
            'r3': acc(obs=1, c=(0, 0, 0, 0, 40), d=[1800] * 40),          # נסיעה אחת — לא בדירוג
        }
        self.A = {'אגד': acc(sched=6, obs=5, c=(0, 30, 0, 0, 0), d=[0] * 30, o=(0, 5, 0, 0, 0)),
                  'דן': acc(sched=7, obs=5, c=(2, 10, 6, 4, 42), d=[600] * 24 + [1800] * 40)}
        self.tot = acc(sched=13, obs=10, c=(2, 40, 6, 4, 42), d=[0] * 30 + [600] * 24 + [1800] * 40, o=(0, 5, 0, 0, 0))

    def build(self, **kw):
        return b.today_summary('2026-11-25', 15 * 3600 + 30 * 60, 15 * 3600 + 15 * 60, '2026-11-25T13:30:00Z', 900,
                               self.tot, self.A, self.R, self.routes, [100, 7, 3], {'דן': [60, 5, 2]}, {'r2': [10, 2, 1]},
                               {7: [50, 40], 8: [44, 0]}, **kw)

    def test_totals_and_times(self):
        s = self.build()
        self.assertTrue(s['partial'])
        self.assertEqual(('15:30', '15:15', 900), (s['now'], s['until'], s['minutes']))
        self.assertEqual({'sched': 13, 'obs': 10, 'meas': 94}, {k: s['tot'][k] for k in ('sched', 'obs', 'meas')})
        self.assertEqual(round(40 / 94, 4), s['on'])
        self.assertEqual(round(2 / 94, 4), s['early'])
        self.assertEqual([100, 7, 3], s['bunch'])
        self.assertEqual([[7, 50, 40], [8, 44, 0]], s['hours'])

    def test_agencies_sorted_by_measurements_with_bunching(self):
        s = self.build()
        self.assertEqual(['דן', 'אגד'], [a[0] for a in s['agencies']])
        self.assertEqual([60, 5, 2], s['agencies'][0][7])
        self.assertEqual([0, 0, 0], s['agencies'][1][7])

    def test_worst_lines_need_enough_rides_and_are_worst_first(self):
        s = self.build()
        self.assertEqual(['r2', 'r1'], [w[0] for w in s['worst']])   # r3 — נסיעה אחת בלבד
        w = s['worst'][0]
        self.assertEqual(['2', 'דן', 4, 24, 10.0, [10, 2, 1]], [w[1], w[3], w[6], w[7], w[9], w[10]])
        self.assertEqual(['r2'], [w[0] for w in self.build(top=1)['worst']])

    def test_empty_day(self):
        s = b.today_summary('2026-11-25', 3600, 2700, 'x', 60, acc(), {}, {}, {}, [0, 0, 0], {}, {}, {})
        self.assertIsNone(s['on'])
        self.assertEqual([], s['worst'])
        self.assertEqual([None, None, None], s['tot']['s'])


if __name__ == '__main__':
    unittest.main()
