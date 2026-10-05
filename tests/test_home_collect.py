import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('home_collect', Path(__file__).parents[1] / 'tools' / 'home_collect.py')
home = importlib.util.module_from_spec(spec)
spec.loader.exec_module(home)


class UploadNewTests(unittest.TestCase):
    def test_uploads_only_what_github_does_not_have_and_never_twice(self):
        with tempfile.TemporaryDirectory() as d:
            cache = Path(d) / 'cache'; cache.mkdir()
            for name, status in [('a.json', 'parsed'), ('b.json', 'parsed'), ('c.json', 'failed')]:
                (cache / name).write_text(json.dumps({'status': status}))
            sent = []
            remote = gzip.compress(json.dumps({'a.json': {'status': 'parsed'}}).encode())
            with patch.object(home, 'UPLOADED', Path(d) / 'uploaded.json'), \
                 patch.object(home, 'get', lambda url: remote), \
                 patch.object(home, 'put_file', lambda token, url, payload, msg: sent.append((url, json.loads(gzip.decompress(payload)), msg))):
                # the computer turned off after a.json had gone up
                uploaded = home.already_uploaded()
                self.assertEqual({'a.json'}, uploaded)
                self.assertEqual(2, home.upload_new('t', cache, uploaded))
                self.assertEqual({'b.json', 'c.json'}, set(sent[0][1]))
                self.assertIn('/website-home/part-', sent[0][0])
                self.assertIn('(1 דפי קווים)', sent[0][2])
                # nothing new -> nothing sent
                self.assertEqual(0, home.upload_new('t', cache, uploaded))
                # a new capture -> only it
                (cache / 'd.json').write_text(json.dumps({'status': 'parsed'}))
                self.assertEqual(1, home.upload_new('t', cache, uploaded))
                self.assertEqual({'d.json'}, set(sent[1][1]))
                # remembered across runs
                self.assertEqual({'a.json', 'b.json', 'c.json', 'd.json'}, home.already_uploaded())
            self.assertEqual(2, len(sent))


if __name__ == '__main__':
    unittest.main()
