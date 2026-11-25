"""היום (--partial) במדד דיוק האוטובוסים: סינון הנסיעות שהסתיימו, today.json, ולולאת העדכון של bus-today.yml."""
import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


def _load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / 'tools' / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


b = _load('bus_reliability')


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


class IndexTests(unittest.TestCase):
    def test_index_has_day_row_and_files(self):
        tot = {'sched': 13, 'obs': 10, 'meas': 94, 'c': [2, 40, 6, 4, 42], 's': [3.9, 1.6, 15.7], 'o': [0, 5, 0, 0, 0],
               'far': 1, 'extra': 2, 'reach': [1, 2, 3, 4]}
        j = b.today_index('2026-11-25', 15 * 3600 + 30 * 60, 15 * 3600 + 15 * 60, '2026-11-25T13:30:00Z', 900, tot, b.PARTIAL_FILES)
        self.assertTrue(j['partial'])
        self.assertEqual(2, j['fmt'])
        self.assertEqual(('15:30', '15:15', 900), (j['now'], j['until'], j['minutes']))
        # שורת היום — כמו שורה ב-index.json (רק השדות של האינדקס)
        self.assertEqual({'d': '2026-11-25', 'sched': 13, 'obs': 10, 'meas': 94, 'c': [2, 40, 6, 4, 42], 's': [3.9, 1.6, 15.7], 'o': [0, 5, 0, 0, 0]}, j['day'])
        self.assertIn('days/2026-11-25.json', j['files'])
        self.assertIn('days/2026-11-25.stops.json', j['files'])
        self.assertIn('days/2026-11-25.dep.json', j['files'])
        self.assertNotIn('days/2026-11-25.deadhead.json', j['files'])   # הדף לא קורא


class LoopTests(unittest.TestCase):
    """tools/bus_today_loop.sh בשעון מדומה: בלי GTFS ליום — אין חישוב; יום חדש — מטמון חדש; d ל-GITHUB_OUTPUT."""
    SH = Path(__file__).parents[1] / 'tools' / 'bus_today_loop.sh'

    def run_loop(self, tmp, now, until):
        env = dict(os.environ, CACHE=f'{tmp}/cache', INTERVAL='1', DRY='1', NOW_CMD=f'echo {now}', GITHUB_OUTPUT=f'{tmp}/out',
                   B='http://127.0.0.1:9')   # אין שרת — ה-GTFS "עוד לא עלה"
        return subprocess.run(['bash', str(self.SH), 'run', str(until)], cwd=tmp, env=env, capture_output=True, text=True, timeout=60)

    def test_midnight_starts_fresh_cache_and_reports_day(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(f'{tmp}/cache/siri/2026112421')
            Path(f'{tmp}/cache/day').write_text('2026-11-24\n')
            Path(f'{tmp}/cache/siri/2026112421/50.br').write_text('x')
            now = 1795645800          # 2026-11-26 00:30 בישראל
            r = self.run_loop(tmp, now, now + 1)   # עדכון אחד ויציאה
            self.assertEqual(0, r.returncode, r.stderr)
            self.assertEqual('2026-11-26', Path(f'{tmp}/cache/day').read_text().strip())
            self.assertFalse(os.path.exists(f'{tmp}/cache/siri/2026112421'))
            self.assertIn('d=2026-11-26', Path(f'{tmp}/out').read_text())
            self.assertFalse(os.path.exists(f'{tmp}/cache/last'))   # בלי GTFS אין עדכון


if __name__ == '__main__':
    unittest.main()
