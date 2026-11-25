"""מדד דיוק האוטובוסים: אילו שעות SIRI (תיקיות UTC ב-S3) מורידים ליום שירות — מ-00:00 בישראל, גם בשעון קיץ וביום המעבר."""
import datetime
import importlib.util
import unittest
import zoneinfo
from pathlib import Path


def _load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / 'tools' / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


b = _load('bus_reliability')
UTC = datetime.timezone.utc
IL = zoneinfo.ZoneInfo('Asia/Jerusalem')


def h(s):
    return datetime.datetime.fromisoformat(s).replace(tzinfo=UTC)


class SiriHoursTests(unittest.TestCase):
    def check(self, day, first, n):
        hrs = b.siri_hours(day)
        self.assertEqual(h(first), hrs[0])
        self.assertEqual(n, len(hrs))
        nxt = datetime.date.fromisoformat(day) + datetime.timedelta(days=1)
        self.assertEqual(datetime.datetime(nxt.year, nxt.month, nxt.day, 2, tzinfo=UTC), hrs[-1])   # הזנב: עד 02:59 UTC של מחר
        self.assertEqual(hrs, [hrs[0] + datetime.timedelta(hours=i) for i in range(n)])             # רצוף, בלי חורים
        # כל דקה של יום השירות לפי השעון בישראל נמצאת בשעות שמורידים
        d = datetime.date.fromisoformat(day)
        t = datetime.datetime(d.year, d.month, d.day, tzinfo=IL).astimezone(UTC)
        end = datetime.datetime(nxt.year, nxt.month, nxt.day, tzinfo=IL).astimezone(UTC)
        have = set(hrs)
        while t < end:
            self.assertIn(t.replace(minute=0), have, t)
            t += datetime.timedelta(minutes=30)

    def test_winter(self):
        self.check('2026-11-24', '2026-11-23T22:00', 29)

    def test_summer(self):
        self.check('2026-07-01', '2026-06-30T21:00', 30)

    def test_dst_start(self):
        # שעון קיץ מתחיל ביום שישי 27.03.2026 ב-02:00 — היום מתחיל עוד בשעון חורף
        self.check('2026-03-27', '2026-03-26T22:00', 29)

    def test_dst_end(self):
        # שעון חורף חוזר ביום ראשון 25.10.2026 — היום מתחיל עוד בשעון קיץ
        self.check('2026-10-25', '2026-10-24T21:00', 30)

    def test_list_paths_sort_chronologically(self):
        lst = b.siri_list('2026-11-24')
        self.assertEqual('stride-siri-requester/2026/11/23/22/00.br siri/2026112322/00.br', lst[0])
        self.assertEqual('stride-siri-requester/2026/11/25/02/59.br siri/2026112502/59.br', lst[-1])
        self.assertEqual(29 * 60, len(lst))
        local = [x.split()[1] for x in lst]
        self.assertEqual(sorted(local), local)


if __name__ == '__main__':
    unittest.main()
