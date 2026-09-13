import copy
import unittest
from nahagim_build import Polyline, classify
from nahagim_roundabouts import recover, window


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.pl = Polyline([(32, 34+i*.0001) for i in range(201)])
        self.row = {'kind': 'roundabout', 'f': .5, 'exit': None}

    def response(self, pts, exit=2):
        return {'code': 'Ok', 'tracepoints': [{'location': [p[1], p[0]]} for p in pts],
                'matchings': [{'confidence': .99, 'distance': Polyline(pts).total,
                              'legs': [{'steps': [{'name': 'road', 'maneuver': {
                                  'type': 'roundabout', 'exit': exit, 'location': [34.01, 32]}}]}]}]}

    def test_two_windows_agree_and_source_unchanged(self):
        rows = [self.row]
        snapshot = copy.deepcopy(rows)
        calls = []
        def match(server, pts, *args):
            calls.append(len(pts))
            return self.response(pts)
        result, stats = recover('', self.pl, rows, match, classify)
        self.assertEqual(result[0]['exit'], 2)
        self.assertEqual(stats['recovered'], 1)
        self.assertEqual(stats['remaining'], 0)
        self.assertEqual(rows, snapshot)
        self.assertEqual(len(calls), 2)
        self.assertNotEqual(calls[0], calls[1])

    def test_conflicting_windows_do_not_fill(self):
        calls = []
        def match(server, pts, *args):
            calls.append(1)
            return self.response(pts, len(calls))
        result, stats = recover('', self.pl, [self.row], match, classify)
        self.assertIsNone(result[0]['exit'])
        self.assertEqual(stats['remaining'], 1)

    def test_reject_bad_matches(self):
        def low_confidence(r): r['matchings'][0]['confidence'] = .1
        def detour(r): r['matchings'][0]['distance'] *= 2
        def gap(r): r['tracepoints'][0] = None
        def wrong_road(r): r['tracepoints'][0]['location'][0] += .001
        def different_entry(r): r['matchings'][0]['legs'][0]['steps'][0]['maneuver']['location'][0] += .0001
        def ambiguous(r): r['matchings'][0]['legs'][0]['steps'] *= 2
        def missing_exit(r): r['matchings'][0]['legs'][0]['steps'][0]['maneuver']['exit'] = None
        for mutate in (low_confidence, detour, gap, wrong_road, different_entry, ambiguous, missing_exit):
            with self.subTest(mutate=mutate.__name__):
                def match(server, pts, *args):
                    reply = self.response(pts)
                    mutate(reply)
                    return reply
                result, stats = recover('', self.pl, [self.row], match, classify)
                self.assertIsNone(result[0]['exit'])
                self.assertEqual(stats['recovered'], 0)

    def test_network_failure_keeps_original(self):
        def match(*args): raise OSError('offline')
        result, stats = recover('', self.pl, [self.row], match, classify)
        self.assertEqual(result, [self.row])

    def test_exact_duplicate_reuses_known_exit_without_request(self):
        def match(*args): self.fail('unnecessary request')
        known = dict(self.row, exit=3)
        result, stats = recover('', self.pl, [self.row, known], match, classify)
        self.assertEqual(result, [known])
        self.assertEqual(stats['duplicates'], 1)

    def test_conflicting_existing_exits_are_preserved(self):
        def match(*args): self.fail('must not resolve conflict')
        rows = [self.row, dict(self.row, exit=2), dict(self.row, exit=3)]
        result, _ = recover('', self.pl, rows, match, classify)
        self.assertEqual(result, rows)

    def test_window_retains_target_on_loop(self):
        pl = Polyline([(32,34),(32,34.01),(32.01,34.01),(32,34.01),(32,34.02)])
        target = pl.cum[3]
        pts, i = window(pl, target, 350)
        self.assertEqual(pts[i], pl.pts[3])
        self.assertIsNone(window(pl, 20, 350))


if __name__ == '__main__':
    unittest.main()
