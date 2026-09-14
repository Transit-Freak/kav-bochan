import unittest
from nahagim_build import Polyline
from nahagim_coverage import assess, merge_ranges

class CoverageTests(unittest.TestCase):
    def reply(self, pts, confidence=.99):
        return {'code':'Ok','tracepoints':[{} for p in pts], 'matchings':[{'confidence':confidence,'geometry':{'coordinates':[[lon,lat] for lat,lon in pts]}}]}
    def test_straight_verified_and_clipped_ranges(self):
        p=Polyline([(32,34),(32,34.01)])
        self.assertEqual(assess(p,self.reply(p.pts),0,1),[])
        self.assertEqual(assess(p,None,.3,.4),[{'from':.3,'to':.4,'reason':'matching-unavailable'}])
    def test_shortcut_between_good_endpoints_is_detected(self):
        p=Polyline([(32,34),(32.002,34.002)])
        r=self.reply([(32,34),(32,34.002),(32.002,34.002)])
        bad=assess(p,r,0,1)
        self.assertTrue(bad);self.assertTrue(any(x['from']<.5<x['to'] for x in bad))
        self.assertGreaterEqual(bad[0]['from'],0);self.assertLessEqual(bad[-1]['to'],1)
    def test_low_confidence_and_dropped_points_are_not_verified(self):
        p=Polyline([(32,34),(32,34.01)])
        self.assertEqual(assess(p,self.reply(p.pts,.5),0,1)[0]['reason'],'matching-uncertain')
        r=self.reply(p.pts);r['tracepoints'][0]=None
        self.assertEqual(assess(p,r,0,1)[0]['reason'],'source-points-unmatched')
    def test_gaps_merge_without_crossing_verified_interval(self):
        x=merge_ranges([{'from':.1,'to':.3},{'from':.2,'to':.4},{'from':.6,'to':.8}])
        self.assertEqual(x,[{'from':.1,'to':.4},{'from':.6,'to':.8}])

    def test_dropped_sample_only_blocks_its_neighbours(self):
        pts=[(32,34+i*.001) for i in range(11)]
        p=Polyline(pts);r=self.reply(pts);r['tracepoints'][5]=None
        bad=assess(p,r,0,1,[i/10 for i in range(11)])
        self.assertEqual(len(bad),1)
        self.assertGreater(bad[0]['from'],.3)
        self.assertLess(bad[0]['to'],.7)
        self.assertTrue(bad[0]['from'] < .5 < bad[0]['to'])
    def test_all_samples_dropped_still_blocks_whole_route(self):
        p=Polyline([(32,34),(32,34.01)])
        r=self.reply(p.pts);r['tracepoints']=[None,None]
        self.assertEqual(assess(p,r,0,1,[0,1]),[{'from':0,'to':1,'reason':'source-points-unmatched'}])
    def test_invalid_fraction_mapping_fails_closed(self):
        p=Polyline([(32,34),(32,34.01)]);r=self.reply(p.pts);r['tracepoints'][0]=None
        self.assertEqual(assess(p,r,0,1,[1,0])[0]['to'],1)
