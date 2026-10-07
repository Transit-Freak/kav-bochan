import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('fleet_armor', Path(__file__).parents[1] / 'tools' / 'fleet_armor.py')
fa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fa)


class FleetChangesTests(unittest.TestCase):
    def test_records_every_field_but_km(self):
        with tempfile.TemporaryDirectory() as d:
            old = {'1': [1000, 50, 'גרמניה', 'דיזל', 'עירוני', 'אוטובוס', 'חשמונאים'] for _ in [0]}
            old.update({str(i): [5, 40, 'סין', 'חשמלי', 'עירוני', 'אוטובוס', 'דן'] for i in range(2, 12)})
            json.dump({'of': old, 'h': {}}, open(f'{d}/fleet-official.json', 'w'))
            json.dump({'armor': {'1': 's'}}, open(f'{d}/fleet-armor.json', 'w'))
            new = {k: list(v) for k, v in old.items()}
            new['1'] = [2000, 50, 'גרמניה', 'חשמלי', 'עירוני', 'אוטובוס', 'ביתר']   # ק"מ, הנעה, אשכול
            h = fa.track_changes(new, {'1': 'ys'}, '2026-10-07', d)
            self.assertEqual({'3', '6', 'a'}, set(h['1']))                    # בלי שדה 0 (ק"מ)
            self.assertEqual([['דיזל', 'חשמלי', '2026-10-07']], h['1']['3'])
            self.assertEqual([['s', 'ys', '2026-10-07']], h['1']['a'])
            self.assertNotIn('2', h)

    def test_partial_download_is_not_a_change(self):
        with tempfile.TemporaryDirectory() as d:
            old = {str(i): [1, 40, 'סין', 'חשמלי', 'עירוני', 'אוטובוס', 'דן'] for i in range(100)}
            json.dump({'of': old}, open(f'{d}/fleet-official.json', 'w'))
            json.dump({'armor': {}}, open(f'{d}/fleet-armor.json', 'w'))
            part = {str(i): [1, 40, 'סין', 'דיזל', 'עירוני', 'אוטובוס', 'דן'] for i in range(50)}
            self.assertEqual({}, fa.track_changes(part, {}, '2026-10-07', d))


if __name__ == '__main__':
    unittest.main()
