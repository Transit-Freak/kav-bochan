import importlib.machinery
import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
loader = importlib.machinery.SourceFileLoader('kav_window', str(ROOT / 'tools' / 'kav_window.pyw'))
spec = importlib.util.spec_from_loader('kav_window', loader)
win = importlib.util.module_from_spec(spec)
loader.exec_module(win)


class CommandTests(unittest.TestCase):
    def test_hebrew_commands(self):
        self.assertEqual(('start', ''), win.parse_command('התחל'))
        self.assertEqual(('start', '20:30'), win.parse_command('התחל עד 20:30'))
        self.assertEqual(('start', '09:05'), win.parse_command('תאסוף עד 9:05'))
        self.assertEqual(('stop', ''), win.parse_command('עצור'))
        self.assertEqual(('stop', ''), win.parse_command('תעצור עכשיו!'))
        self.assertEqual(('status', ''), win.parse_command('מה המצב'))
        self.assertEqual(('update', ''), win.parse_command('עדכן'))
        self.assertEqual(('help', ''), win.parse_command(' עזרה '))
        self.assertEqual(('unknown', 'בננה'), win.parse_command('בננה'))
        self.assertEqual(('none', ''), win.parse_command('   '))


class TranslateTests(unittest.TestCase):
    SAMPLES = [
        'Uploads to GitHub: automatic, every 30 minutes while new routes are found',
        'Uploads to GitHub: by hand (no github-token.txt)',
        '1234 captures from last time were not uploaded yet; uploading them now...',
        'Installing lxml (needed to read the archived pages)...',
        'Downloading the list of captures...',
        '4846 captures to fetch. Stopping at 21:50. Ctrl+C stops safely.',
        '10:52 50/4846 done (31 routes, 10 other pages, 9 failed); one request every 4 s',
        '11:01 archive refused; pausing 5 min, then one request every 8 s',
        '10:58 uploaded 113 new captures to GitHub (the site shows them in about 15-20 minutes)',
        '11:00 upload failed (HTTP Error 409: Conflict); will try again later',
        'Stopping...',
        'Done for now: 558 fetched this time, 11302 in total.',
        'Upload this file: C:\\x\\kavbochan-home\\website-home.json.gz',
        'GitHub -> line-history/data/website-home/ -> Add file -> Upload files -> Commit.',
        'Key saved in github-token.txt.',
        'That key did not work; continuing without automatic uploads.',
        'Another collection is already running on this computer.',
    ]

    def test_every_collector_message_comes_out_in_hebrew(self):
        for line in self.SAMPLES:
            text, _ = win.translate(line)
            self.assertRegex(text, '[א-ת]', line)
            # no English sentence left over (paths, file names and HTTP codes may stay)
            self.assertNotRegex(text, r'\b(captures|done|uploaded|Stopping|fetch|routes)\b', line)

    def test_progress_moves_the_bar(self):
        self.assertEqual((50, 4846), win.translate(self.SAMPLES[6])[1])
        self.assertEqual((0, 4846), win.translate(self.SAMPLES[5])[1])
        self.assertIsNone(win.translate(self.SAMPLES[8])[1])

    def test_errors_ask_for_a_screenshot(self):
        self.assertIn('צלם', win.translate('Traceback (most recent call last):')[0])
        self.assertIn('צלם', win.translate('ModuleNotFoundError: No module named lxml')[0])
        self.assertEqual((None, None), win.translate('   '))

    def test_the_samples_cover_every_message_the_collector_prints(self):
        # each print(...) in home_collect.py must match one of the samples above
        src = (ROOT / 'tools' / 'home_collect.py').read_text(encoding='utf-8')
        firsts = re.findall(r"print\(f?'([^'{]{6,})", src)
        firsts += ['automatic, every 30 minutes', 'by hand (no github-token.txt)']
        for start in firsts:
            start = start.lstrip('\\n')
            self.assertTrue(any(start.strip() in s for s in self.SAMPLES), start)


if __name__ == '__main__':
    unittest.main()
