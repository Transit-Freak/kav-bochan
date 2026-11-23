"""דוח היציאות (days/D.dep.json) וסינון התקופה לפי סוג יום (periods/N-wk.json) — מדד דיוק האוטובוסים."""
import importlib.util
import unittest
from pathlib import Path


def _load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / 'tools' / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


b = _load('bus_reliability')
p = _load('bus_periods')


class DeparturesTests(unittest.TestCase):
    def test_every_scheduled_trip_sorted_with_status(self):
        st = {
            't3': [(1, 'S1', 36000, 36000, None), (2, 'S2', 36600, 36600, None)],   # 10:00
            't1': [(1, 'S1', 21600, 21660, None)],                                    # 06:01
            't2': [(1, 'S1', 28800, 28800, None)],                                    # 08:00
            'u1': [(1, 'X', 30000, 30030, None)],                                     # 08:20:30 → 500
            'nostops': [],
        }
        trips = {'t1': 'r1', 't2': 'r1', 't3': 'r1', 'u1': 'r2', 'nostops': 'r1'}
        dep_of = {'t1': -150.4, 't3': b.DEP_SEEN, 'u1': 61}
        out = b.departures_day(st, trips, dep_of)
        self.assertEqual({'r1': [361, -150, 480, None, 600, 's'], 'r2': [500, 61]}, out)

    def test_trip_without_route_is_skipped(self):
        self.assertEqual({}, b.departures_day({'t': [(1, 'S', 0, 60, None)]}, {}, {'t': 0}))


class DayKindTests(unittest.TestCase):
    def test_kinds(self):
        # 22.11.2026 ראשון, 26.11 חמישי, 27.11 שישי, 28.11 שבת
        self.assertEqual('wk', p.day_kind('2026-11-22'))
        self.assertEqual('wk', p.day_kind('2026-11-26'))
        self.assertEqual('fri', p.day_kind('2026-11-27'))
        self.assertEqual('sat', p.day_kind('2026-11-28'))

    def test_window_by_kind_keeps_partial_rule(self):
        idx = [{'d': '2026-11-%02d' % d, 'sched': 100, 'obs': 90} for d in range(15, 29)]
        idx[1]['obs'] = 10     # 16.11 — שידור חלקי, לא נכנס
        self.assertEqual(['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'], p.window(idx, 7, 'wk'))
        self.assertEqual(['2026-11-20', '2026-11-27'], p.window(idx, 14, 'fri'))
        self.assertEqual(['2026-11-21', '2026-11-28'], p.window(idx, 14, 'sat'))
        self.assertNotIn('2026-11-16', p.window(idx, 14, 'wk'))
        self.assertEqual(p.window(idx, 14), p.window(idx, 14, ''))


if __name__ == '__main__':
    unittest.main()
