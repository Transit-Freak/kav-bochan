import copy
import unittest
from nahagim_build import Polyline
from nahagim_followup import clip, repair_row, explain

class FollowupTests(unittest.TestCase):
    def setUp(self):
        self.pl=Polyline([(32,34+i*.0001) for i in range(201)])
        self.row={'kind':'roundabout','f':.5,'exit':None}
    def reply(self, pts, ex=2):
        return {'code':'Ok','tracepoints':[{'location':[p[1],p[0]]} for p in pts], 'matchings':[{'confidence':.99,'distance':Polyline(pts).total,'legs':[{'steps':[{'name':'road','maneuver':{'type':'roundabout','location':[34.01,32],'exit':ex}}]}]}]}
    def test_verified_recovery_preserves_input_and_position(self):
        original=copy.deepcopy(self.row)
        result,attempts,reason=repair_row(self.pl,self.row,'',lambda _,pts,*args:self.reply(pts))
        self.assertEqual(reason,'recovered');self.assertEqual(result['exit'],2)
        self.assertEqual(result['f'],self.row['f']);self.assertEqual(self.row,original)
        self.assertGreaterEqual(len(attempts),2)
    def test_conflicting_exit_prevents_completion(self):
        calls=[]
        def request(_,pts,*args):
            calls.append(1);return self.reply(pts,1 if len(calls)==1 else 2)
        result,_,reason=repair_row(self.pl,self.row,'',request)
        self.assertIsNone(result);self.assertEqual(reason,'conflicting_exits')
    def test_low_confidence_is_recorded(self):
        def request(_,pts,*args):
            r=self.reply(pts);r['matchings'][0]['confidence']=.1;return r
        result,attempts,_=repair_row(self.pl,self.row,'',request)
        self.assertIsNone(result);self.assertTrue(all(x['reason']=='low_confidence' for x in attempts))
    def test_keep_original_corner_vertices_and_short_endpoint_context(self):
        pl=Polyline([(32,34),(32,34.0005),(32.0001,34.00055),(32.0002,34.0005),(32.0002,34.01)])
        c=clip(pl,pl.cum[1],350);self.assertIsNotNone(c)
        pts,index=c;self.assertEqual(pts[index],pl.pts[1])
        self.assertIn(pl.pts[2],pts);self.assertIn(pl.pts[3],pts)
        self.assertIsNone(clip(pl,20,350))
    def test_request_error_preserves_missing_instruction(self):
        def request(*args):raise OSError('offline')
        result,attempts,_=repair_row(self.pl,self.row,'',request)
        self.assertIsNone(result);self.assertTrue(all(x['reason']=='request_error' for x in attempts))

if __name__=='__main__':unittest.main()
