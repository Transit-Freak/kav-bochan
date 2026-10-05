import datetime
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'alert_failures', Path(__file__).parents[1] / 'tools' / 'alert_failures.py')
alert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alert)


class ExplainTests(unittest.TestCase):
    def test_gov_il_not_answering(self):
        # line-history, 03.10
        log = alert.clean("2026-10-03T13:04:18.6538656Z curl: (28) Failed to connect to gtfs.mot.gov.il port 443 after 20002 ms: Timeout was reached\n"
                          "2026-10-03T13:04:18.6567650Z ##[error]Process completed with exit code 28.")
        self.assertIn('gov.il', alert.explain(log))

    def test_push_rejected(self):
        log = alert.clean(" ! [rejected]              HEAD -> main (fetch first)\nerror: failed to push some refs\nהדחיפה נכשלה")
        self.assertIn('השמירה ל-GitHub נדחתה', alert.explain(log))

    def test_python_error_and_unknown(self):
        self.assertIn('Python', alert.explain(['Traceback (most recent call last):', 'KeyError: x']))
        self.assertEqual(alert.UNKNOWN, alert.explain(['something odd']))

    def test_cancelled_by_time_limit_not_by_a_newer_run(self):
        # line-history, 04.10: 2 hours, then cancelled
        run = {'conclusion': 'cancelled', 'run_started_at': '2026-10-04T13:22:59Z', 'updated_at': '2026-10-04T15:23:20Z'}
        self.assertTrue(alert.is_timeout(run, [{'conclusion': 'cancelled'}]))
        self.assertEqual(alert.TIMEOUT, alert.explain(['x'], timed_out=True))
        # a push run cancelled after 3 minutes by the next push is not a failure
        short = dict(run, updated_at='2026-10-04T13:26:00Z')
        self.assertFalse(alert.is_timeout(short, [{'conclusion': 'cancelled'}]))

    def test_clean_strips_timestamps_and_bom(self):
        self.assertEqual(['curl: done'], alert.clean('﻿2026-10-03T13:04:18.1Z curl: done'))


class StaleTests(unittest.TestCase):
    def check(self, bus_last, gen, today):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(f'{d}/bus/data'); os.makedirs(f'{d}/line-history/data')
            json.dump({'days': [{'d': bus_last}]}, open(f'{d}/bus/data/index.json', 'w'))
            json.dump({'gen': gen}, open(f'{d}/line-history/data/lines.json', 'w'))
            cwd = os.getcwd(); os.chdir(d)
            try:
                return dict(alert.stale_checks(today))
            finally:
                os.chdir(cwd)

    def test_fresh_data_is_quiet(self):
        out = self.check('2026-10-03', '2026-10-04', datetime.date(2026, 10, 5))
        self.assertEqual([None, None], list(out.values()))

    def test_line_history_stuck_since_02_10(self):
        out = self.check('2026-10-03', '2026-10-02', datetime.date(2026, 10, 5))
        self.assertIn('2026-10-02', out['⚠️ לא מתעדכן: הקו בזמן'])
        self.assertIsNone(out['⚠️ לא מתעדכן: מדד דיוק האוטובוסים'])

    def test_bus_two_days_behind(self):
        out = self.check('2026-10-02', '2026-10-04', datetime.date(2026, 10, 5))
        self.assertIn('2026-10-02', out['⚠️ לא מתעדכן: מדד דיוק האוטובוסים'])


class ReportTests(unittest.TestCase):
    def test_failure_opens_one_issue_and_success_closes_it(self):
        calls, issues = [], []

        def fake_api(path, method='GET', body=None, raw=False):
            calls.append((method, path))
            if path.startswith('actions/runs/') and path.endswith('/jobs?per_page=50'):
                return {'jobs': [{'id': 7, 'conclusion': 'failure', 'steps': [{'name': 'Fetch GTFS', 'conclusion': 'failure'}]}]}
            if path.startswith('actions/runs/'):
                return {'name': 'line-history', 'conclusion': state['c'], 'html_url': 'u',
                        'run_started_at': '2026-10-03T12:40:31Z', 'updated_at': '2026-10-03T13:04:32Z'}
            if path == 'actions/jobs/7/logs':
                return 'curl: (28) Failed to connect to gtfs.mot.gov.il port 443'
            if path.startswith('issues?state=open'):
                return [i for i in issues if i['state'] == 'open']
            if path == 'issues' and method == 'POST':
                issues.append({'number': 1, 'title': body['title'], 'state': 'open', 'body': body['body']}); return issues[-1]
            if path == 'issues/1' and method == 'PATCH':
                issues[0]['state'] = 'closed'
            return {}

        state = {'c': 'failure'}
        with patch.object(alert, 'api', fake_api):
            alert.on_run(1)
            alert.on_run(1)   # a second failure comments on the same issue
            self.assertEqual(1, len(issues))
            self.assertIn('@Transit-Freak', issues[0]['body'])
            self.assertIn('gov.il', issues[0]['body'])
            self.assertIn('Fetch GTFS', issues[0]['body'])
            self.assertIn(('POST', 'issues/1/comments'), calls)
            state['c'] = 'success'
            alert.on_run(1)
        self.assertEqual('closed', issues[0]['state'])


if __name__ == '__main__':
    unittest.main()
