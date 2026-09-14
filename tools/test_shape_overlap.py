import unittest
from shape_overlap import Shape,compare

def shape(points):return Shape([(31+y/111195,34+x/(111195*.857167)) for x,y in points])
class OverlapTests(unittest.TestCase):
 def test_identical_and_reverse(self):
  a=shape([(0,0),(1000,0)])
  self.assertEqual(compare(a,a)['selfPct'],100)
  self.assertEqual(compare(a,shape([(1000,0),(0,0)]))['sharedKm'],0)
 def test_crossing_and_separate_parallel(self):
  a=shape([(0,0),(1000,0)])
  self.assertEqual(compare(a,shape([(500,-500),(500,500)]))['sharedKm'],0)
  self.assertEqual(compare(a,shape([(0,50),(1000,50)]))['sharedKm'],0)
 def test_partial_percentage_uses_each_route_length(self):
  a=shape([(0,0),(1000,0)]);b=shape([(0,0),(500,0)])
  r=compare(a,b)
  self.assertAlmostEqual(r['sharedKm'],.5,delta=.02)
  self.assertAlmostEqual(r['selfPct'],50,delta=1)
  self.assertEqual(r['otherPct'],100)
 def test_separate_runs_not_one_long_shared_section(self):
  a=shape([(0,0),(400,0),(400,200),(600,200),(600,0),(1000,0)])
  b=shape([(0,0),(1000,0)]);r=compare(a,b)
  self.assertGreater(r['sharedKm'],r['longestKm']*1.5)
  self.assertLess(r['longestKm'],.5)
 def test_repeated_lap_does_not_duplicate_target_length(self):
  a=shape([(0,0),(1000,0),(1000,100),(0,100),(0,0),(1000,0)])
  r=compare(a,shape([(0,0),(1000,0)]))
  self.assertLessEqual(r['sharedKm'],1.01)
 def test_missing_geometry_is_unavailable(self):
  self.assertIsNone(compare(Shape([]),shape([(0,0),(1000,0)])))
if __name__=='__main__':unittest.main()
