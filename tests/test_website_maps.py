import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from enrich_website_maps import estimate,match_name
class Maps(unittest.TestCase):
    def test_original_coordinates_take_priority(self):
        stops=[['a','first',32.0,35.0],['b','second',None,None]]
        self.assertIsNone(estimate(stops,None))
    def test_shared_matcher_and_source_preservation(self):
        stops=[['a','City - Station',None,None],['b','Other',None,None]]
        before=copy.deepcopy(stops);seen=[]
        def match(raw):
            seen.append(raw)
            return [[i+1,s['name'],'','',[123],32+i*.01,35] for i,s in enumerate(raw['stops'])]
        result=estimate(stops,{'route_stops':match})
        self.assertEqual(stops,before)
        self.assertEqual(seen[0]['stops'][0]['name'],'Station - City')
        self.assertEqual(result['stops'][0][1],stops[0][1])
        self.assertEqual(result['matched'],2)
        self.assertNotIn('shape',result)
    def test_placeholders_are_not_city_matches(self):
        self.assertEqual(match_name('(צמתים) - צומת גולני'),'צומת גולני')
if __name__=='__main__':unittest.main()
