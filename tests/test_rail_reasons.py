import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('build_rail_reasons', Path(__file__).parents[1] / 'tools' / 'build_rail_reasons.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

CANDS = [
    {'id': 'a|b', 'first': '2019-02-25', 'last': '2019-03-06', 'rds': ['1-1-1', '1-2-1']},
    {'id': 'c|d', 'first': '2020-01-01', 'last': '2020-02-01', 'rds': ['2-1-1']},
    {'id': 'e|f', 'first': '2021-01-01', 'last': '2021-02-01', 'rds': ['3-1-1']},
]


class RailReasonsTests(unittest.TestCase):
    def test_only_confirmed_reasons_with_a_link_reach_the_site(self):
        research = [
            {'id': 'a|b', 'reason': 'עבודות', 'url': 'https://x', 'source': 'ynet', 'published': '2019-02-20', 'verdict': 'confirmed'},
            {'id': 'c|d', 'reason': 'אולי', 'url': 'https://y', 'source': 'z', 'verdict': 'rejected'},
            {'id': 'e|f', 'reason': None, 'url': None, 'verdict': 'confirmed'},
        ]
        out = b.build(CANDS, research)
        self.assertEqual(1, out['trains'])
        self.assertEqual({'1-1-1', '1-2-1'}, set(out['rd']))   # every variant and direction of the train
        self.assertEqual('עבודות', out['rd']['1-1-1']['text'])
        self.assertEqual('2019-03-06', out['rd']['1-2-1']['last'])

    def test_no_research_means_no_marks(self):
        self.assertEqual({'v': 1, 'trains': 0, 'rd': {}}, b.build(CANDS, []))


if __name__ == '__main__':
    unittest.main()
