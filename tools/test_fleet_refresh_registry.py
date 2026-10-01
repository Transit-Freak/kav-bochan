import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('registry', Path(__file__).with_name('fleet_refresh_registry.py'))
registry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registry)


class RegistryTests(unittest.TestCase):
    def test_html_login_response_is_rejected(self):
        with self.assertRaises(ValueError):
            registry.validate(b'<html>Login</html>')

    def test_incomplete_download_is_rejected(self):
        with self.assertRaises(ValueError):
            registry.validate(b'mispar_rechev|tokef_dt|sug_rechev_nm|shnat_yitzur\n123|2026-10-01|bus|2025\n')

    def test_invalid_expiry_is_rejected(self):
        with self.assertRaises(ValueError):
            registry.validate(b'mispar_rechev|tokef_dt|sug_rechev_nm|shnat_yitzur\n123|tomorrow|bus|2025\n')

    def test_inconsistent_pagination_is_rejected(self):
        pages = [
            {'success': True, 'result': {'fields': [{'id': 'mispar_rechev'}], 'total': 2, 'records': [{'mispar_rechev': 1}]}},
            {'success': True, 'result': {'fields': [{'id': 'mispar_rechev'}], 'total': 3, 'records': [{'mispar_rechev': 2}]}},
        ]
        import json
        with patch.object(registry, 'fetch', side_effect=[json.dumps(p).encode() for p in pages]):
            with self.assertRaises(ValueError):
                registry.datastore_csv()

    def test_failed_download_preserves_existing_files(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            csv_path = directory / (registry.RESOURCE + '.csv')
            csv_path.write_bytes(b'existing valid cache')
            with patch.object(registry, 'DIRECTORY', directory), patch.object(registry, 'fetch', side_effect=OSError('network')):
                with self.assertRaises(OSError):
                    registry.main()
            self.assertEqual(csv_path.read_bytes(), b'existing valid cache')
            self.assertFalse((directory / 'gov-registry-source.json').exists())


if __name__ == '__main__':
    unittest.main()
