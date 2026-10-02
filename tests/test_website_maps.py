import sys,unittest,copy,json,os,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from enrich_website_maps import estimate,match_name
from build_magihim_site import make_stop_matcher
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
    def test_exact_numbered_address_uses_2012_location(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'line-history/data').mkdir(parents=True);(root/'magihim-2012/data').mkdir(parents=True)
            (root/'line-history/data/stops-state.json').write_text(json.dumps({'12':['Changed modern name',32.9,35.6,'טבריה']}))
            (root/'magihim-2012/data/stops-2012.json').write_text(json.dumps({'stops':{'12':['Different station name',32.8,35.5,'אהבת ציון 39 טבריה']}}))
            previous=os.getcwd()
            try:
                os.chdir(root);matcher=make_stop_matcher()
                row=matcher['route_stops']({'stops':[{'seq':1,'name':'אהבת ציון 39 - טבריה','t':'','type':''}]})[0]
                self.assertEqual(row[4],['12']);self.assertEqual(row[5:7],[32.8,35.5])
                nearby=matcher['route_stops']({'stops':[{'seq':1,'name':'אהבת ציון 41 - טבריה','t':'','type':''}]})[0]
                self.assertEqual(nearby[4],[])
            finally:os.chdir(previous)
    def test_placeholders_are_not_city_matches(self):
        self.assertEqual(match_name('(צמתים) - צומת גולני'),'צומת גולני')
if __name__=='__main__':unittest.main()
