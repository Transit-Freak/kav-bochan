import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('bus_reliability', Path(__file__).parents[1] / 'tools' / 'bus_reliability.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

ROUTES = {
    'r1': {'long': 'מרכז-מודיעין עילית<->שדרות-מודיעין עילית-1#', 'type': '3', 'agency': 'קווים'},
    'r2': {'long': 'מרכז-מודיעין מכבים רעות<->עזריאלי-מודיעין מכבים רעות-2#', 'type': '3', 'agency': 'קווים'},
    'r3': {'long': 'מרכז-מודיעין עילית<->רכבת-מודיעין מכבים רעות-3#', 'type': '3', 'agency': 'קווים'},
    'rail': {'long': 'מודיעין מרכז-מודיעין מכבים רעות<->נהריה-נהריה', 'type': '2', 'agency': 'רכבת ישראל'},
}
CATALOG = {'r1': [''] * 8 + ['חשמונאים', 'עירוני', ''], 'r2': [''] * 8 + ['חשמונאים', 'עירוני', ''],
           'r3': [''] * 8 + ['חשמונאים', 'בינעירוני', '']}


class FleetDayTests(unittest.TestCase):
    def test_counts_buses_per_city_and_cluster_with_overlap(self):
        meta = {1: ('r1', '18', 'x', '111'), 2: ('r1', '18', 'y', '111'), 3: ('r2', '18', 'x', '222'),
                4: ('r3', '18', 'x', '333'), 5: ('r1', '18', 'z', '333'), 6: ('rail', '2', 'x', '9'),
                7: ('r2', '18', 'x', '0')}
        d = b.fleet_day('2026-10-06', meta, ROUTES, CATALOG, {}, {})
        self.assertEqual(3, d['n'])                                   # בלי הרכבת ובלי רכב "0"
        self.assertEqual({'מודיעין עילית': 2, 'מודיעין מכבים רעות': 2}, d['city'])
        h = d['cl']['חשמונאים']
        self.assertEqual(3, h['n'])
        i, j = h['c'].index('מודיעין עילית'), h['c'].index('מודיעין מכבים רעות')
        both = sum(n for sig, n in h['s'].items() if str(i) in sig.split(',') and str(j) in sig.split(','))
        self.assertEqual(1, both)                                     # רכב 333 עבד בשתי הערים
        self.assertEqual(2, d['wd'])                                  # 6.10.2026 = יום שלישי

    def test_name_cities_strips_codes(self):
        self.assertEqual({'כרמיאל', 'חיפה'}, b.name_cities('תחנת רכבת חיפה מרכז השמונה-חיפה<->מתחם ביג כרמיאל-כרמיאל-10'))


if __name__ == '__main__':
    unittest.main()
