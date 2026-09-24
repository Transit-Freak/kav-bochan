import datetime
import importlib.util
from pathlib import Path
from unittest.mock import patch

import unittest

spec = importlib.util.spec_from_file_location(
    'rail_reliability', Path(__file__).parents[1] / 'tools' / 'rail_reliability.py')
rail = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rail)


class RailFetchTests(unittest.TestCase):
    def test_scheduled_stops_cover_every_ride_and_keep_after_midnight_window(self):
        start = datetime.datetime(2026, 9, 23, tzinfo=rail.IL)
        end = start + datetime.timedelta(days=1)
        calls = []

        def fetch(path, **params):
            calls.append((path, params))
            return [{'gtfs_ride_id': int(i)} for i in params['gtfs_ride_ids'].split(',')]

        with patch.object(rail, 'fetch_all', side_effect=fetch):
            rows = rail.fetch_scheduled_stops(list(range(1, 32)), start, end)
        assert {r['gtfs_ride_id'] for r in rows} == set(range(1, 32))
        assert len(calls) == 2
        for path, params in calls:
            assert path == '/gtfs_ride_stops/list'
            assert params['arrival_time_from'] == '2026-09-23T00:00:00+03:00'
            assert params['arrival_time_to'] == '2026-09-24T03:00:00+03:00'
            assert 'gtfs_route__line_refs' not in params


    def test_missing_ride_stops_do_not_publish_a_partial_day(self):
        start = datetime.datetime(2026, 9, 23, tzinfo=rail.IL)
        with patch.object(rail, 'fetch_all', return_value=[{'gtfs_ride_id': 1}]):
            with self.assertRaisesRegex(ValueError, 'חסרות תחנות'):
                rail.fetch_scheduled_stops([1, 2], start, start + datetime.timedelta(days=1))
