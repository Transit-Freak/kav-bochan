import unittest
from unittest.mock import patch
import nahagim_build as b

class QualityTests(unittest.TestCase):
    def test_overlaps_do_not_inflate_length_ratio(self):
        pl=b.Polyline([(32,34+i*.0001) for i in range(301)])
        def match(_,pts,*args):
            return {'code':'Ok','tracepoints':[{} for p in pts],'matchings':[{'distance':b.Polyline(pts).total,'confidence':.95,'geometry':{'coordinates':[[lo,la] for la,lo in pts]},'legs':[]}]}
        with patch.object(b,'match_chunk',match):
            _,q=b.maneuvers_for('',pl,chunk_pts=30,spacing_m=10,overlap=12,margin=5)
        self.assertGreater(q['chunks'],5);self.assertEqual(q['ratio'],1);self.assertEqual(q['status'],'ok')
    def test_a_real_detour_remains_weak(self):
        pl=b.Polyline([(32,34+i*.0001) for i in range(301)])
        def match(_,pts,*args):
            return {'code':'Ok','tracepoints':[{} for p in pts],'matchings':[{'distance':b.Polyline(pts).total*1.25,'confidence':.95,'geometry':{'coordinates':[[lo,la] for la,lo in pts]},'legs':[]}]}
        with patch.object(b,'match_chunk',match):
            _,q=b.maneuvers_for('',pl,chunk_pts=30,spacing_m=10,overlap=12,margin=5)
        self.assertEqual(q['status'],'weak');self.assertEqual(q['ratio'],1.25)

if __name__=='__main__':unittest.main()
