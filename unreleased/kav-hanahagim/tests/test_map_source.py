import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('map_source', Path(__file__).parents[1] / 'tools/map-source.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)

class MapSourceTests(unittest.TestCase):
    def test_latest_compatible_available_build(self):
        rows = [{'key': '20260923.pmtiles', 'version': '4.15.2'},
                {'key': '20260922.pmtiles', 'version': '4.15.2'},
                {'key': '20260924.pmtiles', 'version': '5.0.0'}]
        self.assertEqual(source.select_build(rows, lambda url: True)['key'], '20260923.pmtiles')
        self.assertEqual(source.select_build(rows, lambda url: '20260922' in url)['key'], '20260922.pmtiles')
    def test_no_silent_schema_upgrade_or_unavailable_build(self):
        for rows in ([], [{'key': '20260924.pmtiles', 'version': '5.0.0'}],
                     [{'key': '../other.pmtiles', 'version': '4.15.2'}]):
            with self.assertRaises(RuntimeError): source.select_build(rows, lambda url: True)
        with self.assertRaises(RuntimeError):
            source.select_build([{'key': '20260923.pmtiles', 'version': '4.15.2'}], lambda url: False)

if __name__ == '__main__': unittest.main()
