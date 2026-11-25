"""מדד אמינות הרכבת — "היום עד עכשיו" (--partial): סינון הנסיעות שהסתיימו, טווח הדקות והמטמון המקומי."""
import datetime
import gzip
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TOOLS = Path(__file__).parents[1] / 'tools'
sys.path.insert(0, str(TOOLS))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, TOOLS / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


rail = _load('rail_reliability')
siri = _load('siri_s3')
UTC = datetime.timezone.utc


def stop(rid, seq, hhmm, code=1):
    h, m = hhmm.split(':')
    t = datetime.datetime(2026, 11, 25, int(h) % 24, int(m), tzinfo=rail.IL) + datetime.timedelta(days=int(h) // 24)
    return {'gtfs_ride_id': rid, 'stop_sequence': seq, 'arrival_time': t.isoformat(), 'departure_time': t.isoformat(),
            'gtfs_stop__code': code, 'gtfs_stop__lat': 32.0, 'gtfs_stop__lon': 34.8}


class FinishedStopsTests(unittest.TestCase):
    def test_only_rides_whose_last_scheduled_arrival_passed(self):
        stops = [stop(1, 1, '08:00'), stop(1, 2, '08:40'),      # הסתיימה
                 stop(2, 1, '08:30'), stop(2, 2, '09:00'),      # מסתיימת בדיוק ב-cutoff
                 stop(3, 1, '08:50'), stop(3, 2, '09:20'),      # עוד בדרך
                 stop(4, 1, '23:30'), stop(4, 2, '24:20')]      # אחרי חצות
        cutoff = datetime.datetime(2026, 11, 25, 9, 0, tzinfo=rail.IL).timestamp()
        got = rail.finished_stops(stops, cutoff)
        self.assertEqual({1, 2}, {s['gtfs_ride_id'] for s in got})
        self.assertEqual(4, len(got))     # כל התחנות של נסיעה שהסתיימה נשארות

    def test_margin_is_applied_to_now(self):
        now = datetime.datetime(2026, 11, 25, 7, 0, tzinfo=UTC)          # 09:00 בישראל
        stops = [stop(1, 1, '07:30'), stop(1, 2, '08:15'), stop(2, 1, '07:40'), stop(2, 2, '08:16')]
        with tempfile.TemporaryDirectory() as tmp:
            sched = os.path.join(tmp, 'sched.json.gz')
            with gzip.open(sched, 'wt', encoding='utf-8') as f:
                json.dump(stops, f)
            with patch.object(siri, 'sync_minutes') as sync, patch.object(siri, 'vehicle_locations', return_value=[]) as vl, \
                    patch.dict(sys.modules, {'siri_s3': siri}):
                start, got, locs = rail.fetch_today(datetime.date(2026, 11, 25), now, tmp, sched, margin=45)
        self.assertEqual({1}, {s['gtfs_ride_id'] for s in got})   # 08:15 ≤ 09:00−45 < 08:16
        self.assertEqual(now, vl.call_args.kwargs['upto'])
        sync.assert_called_once()


class MinuteRangeTests(unittest.TestCase):
    def test_partial_requests_only_minutes_up_to_now(self):
        start = datetime.datetime(2026, 11, 25, tzinfo=rail.IL)
        now = datetime.datetime(2026, 11, 25, 1, 30, tzinfo=rail.IL)
        asked = []

        def rows_of(k):
            asked.append(k)
            return []
        siri.vehicle_locations('2', start, start + datetime.timedelta(days=1), upto=now, rows_of=rows_of)
        asked.sort()
        # מ-23:00 של אתמול (שעה לפני) ועד 01:29 — ב-UTC
        self.assertEqual(150, len(asked))
        self.assertEqual('2026/11/24/21/00.br', asked[0])
        self.assertEqual('2026/11/24/23/29.br', asked[-1])

    def test_completeness_is_checked_against_minutes_elapsed(self):
        start = datetime.datetime(2026, 11, 25, tzinfo=rail.IL)
        now = start + datetime.timedelta(hours=2)
        n = [0]

        def rows_of(k):
            n[0] += 1
            return None if n[0] % 5 == 0 else []     # 80% מהדקות
        with self.assertRaisesRegex(RuntimeError, 'קבצי דקה'):
            siri.vehicle_locations('2', start, start + datetime.timedelta(days=1), upto=now, rows_of=rows_of)

    def test_nightly_range_unchanged(self):
        start = datetime.datetime(2026, 11, 25, tzinfo=rail.IL)
        asked = []
        siri.vehicle_locations('2', start, start + datetime.timedelta(days=1),
                               rows_of=lambda k: asked.append(k) or [])
        self.assertEqual(28 * 60, len(asked))       # שעה לפני ועד 3 שעות אחרי


class CacheTests(unittest.TestCase):
    def test_sync_downloads_only_missing_and_keeps_only_the_operator(self):
        start = datetime.datetime(2026, 11, 25, 10, 0, tzinfo=UTC)
        now = start + datetime.timedelta(minutes=3)
        calls = []

        def fake_fetch(k):
            calls.append(k)
            return None if k.endswith('/01.br') else b'raw'
        rows = [(('1', 'j', '2026-11-25T12:00:00+02:00', '7'), '2026-11-25T12:00:30+02:00', 32.1, 34.8)]
        with tempfile.TemporaryDirectory() as tmp, patch.object(siri, 'fetch', side_effect=fake_fetch), \
                patch.object(siri, '_parse_locs', return_value=lambda b: rows):
            siri.sync_minutes('2', tmp, start, now, before_h=0, give_up_min=0)
            self.assertEqual(3, len(calls))
            # דקה שחסרה (וכבר "ישנה") מסומנת ולא מבוקשת שוב; הקיימות לא מורדות שוב
            siri.sync_minutes('2', tmp, start, now, before_h=0, give_up_min=0)
            self.assertEqual(3, len(calls))
            read = siri.cached_rows(tmp)
            self.assertEqual(rows, read('2026/11/25/10/00.br'))
            self.assertIsNone(read('2026/11/25/10/01.br'))

    def test_recent_missing_minute_is_retried(self):
        start = datetime.datetime(2026, 11, 25, 10, 0, tzinfo=UTC)
        now = start + datetime.timedelta(minutes=2)
        calls = []
        with tempfile.TemporaryDirectory() as tmp, patch.object(siri, 'fetch', side_effect=lambda k: calls.append(k)):
            siri.sync_minutes('2', tmp, start, now, before_h=0, give_up_min=60)
            siri.sync_minutes('2', tmp, start, now, before_h=0, give_up_min=60)
        self.assertEqual(4, len(calls))


class OutputTests(unittest.TestCase):
    def test_partial_writes_day_and_index_entry(self):
        start = datetime.datetime(2026, 11, 25, tzinfo=rail.IL)
        stops = [dict(stop(1, 1, '08:00', 100), gtfs_ride__start_time=(start + datetime.timedelta(hours=8)).isoformat(),
                      gtfs_route__line_ref=5, gtfs_route__route_long_name='א-א<->ב-ב', gtfs_stop__name='א'),
                 dict(stop(1, 2, '08:30', 200), gtfs_ride__start_time=(start + datetime.timedelta(hours=8)).isoformat(),
                      gtfs_route__line_ref=5, gtfs_route__route_long_name='א-א<->ב-ב', gtfs_stop__name='ב')]
        with tempfile.TemporaryDirectory() as tmp, \
                patch.object(rail, 'fetch_today', return_value=(start, stops, [])):
            rail.partial_main(['--partial', '--siri', tmp, '--now', '2026-11-25T10:00:00+02:00', '--out', tmp])
            day = json.load(open(os.path.join(tmp, 'day.json'), encoding='utf-8'))
            summ = json.load(open(os.path.join(tmp, 'summary.json'), encoding='utf-8'))
        self.assertEqual('2026-11-25', day['d'])
        self.assertEqual(rail.FMT, day['fmt'])
        self.assertEqual(1, len(day['rides']))
        self.assertEqual({'d': '2026-11-25', 'rides': 1, 'partial': True, 'now': '10:00', 'until': '09:15'},
                         {k: summ[k] for k in ('d', 'rides', 'partial', 'now', 'until')})
        for k in ('lines', 'hours', 'stations', 'updated'):
            self.assertIn(k, summ)
        self.assertEqual({'100', '200'}, set(summ['st']))


if __name__ == '__main__':
    unittest.main()
