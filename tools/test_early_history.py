import copy,tempfile,unittest,csv,io,zipfile
from pathlib import Path
from unittest.mock import patch
import import_early_history as m

class TimelineTest(unittest.TestCase):
 def test_native_identity_and_available_days(self):
  tables={'routes.txt':{'r':{'route_desc':'12345-1-0','route_type':'3','route_short_name':'5','route_long_name':'A-B','agency_id':'a'}},'agency.txt':{'a':{'agency_name':'Operator'}},'stops.txt':{'s':{'stop_id':'s','stop_code':'100','stop_name':'A','stop_lat':'31','stop_lon':'34'}},'calendar.txt':{'c':{'service_id':'c',**{d:'1' for d in m.DAYS},'start_date':'20150101','end_date':'20151231'}},'trips.txt':{'t':{'route_id':'r','service_id':'c'}}}
  times={'t':[(1,'s','08:00:00','08:00:00','0','0')]}
  with tempfile.TemporaryDirectory() as d,patch.object(m,'OUT',Path(d)),patch.object(m,'load_snapshot',return_value=(tables,times,{})):
   source=lambda date:{'id':date,'date':date,'kind':'obus15'}
   self.assertEqual(m.publish(source('2015-01-01'),[])['versionsAdded'],1)
   tables['calendar.txt']['c']['end_date']='20160101'
   self.assertEqual(m.publish(source('2015-01-02'),[])['versionsAdded'],0)
   # Reordering trip IDs must not manufacture a public service change.
   tables['trips.txt']['z']=tables['trips.txt'].pop('t')
   times['z']=times.pop('t')
   self.assertEqual(m.publish(source('2015-01-03'),[])['versionsAdded'],0)
   times['z']=[(1,'s','09:00:00','09:00:00','0','0')]
   self.assertEqual(m.publish(source('2015-01-05'),[])['versionsAdded'],1)
   line=m.materialize(m.read(Path(d)/'lines/12345-1-0.json'))
   self.assertEqual([v['d'] for v in line['versions']],['2015-01-01','2015-01-05'])
   self.assertEqual(line['versions'][-1]['sd'],'2015-01-03')
   self.assertEqual(line['versions'][-1]['k'],'sched')
   self.assertEqual(m.publish(source('2015-01-05'),[])['versionsAdded'],1)
   self.assertEqual(len(m.read(Path(d)/'lines/12345-1-0.json')['versions']),2)


class SharedTripTest(unittest.TestCase):
 def fixture(self, path, conflicting_service=False):
  tables={
   'routes.txt':[['route_id'],['r1'],['r2']],
   'agency.txt':[['agency_id'],['a']],
   'stops.txt':[['stop_id'],['s']],
   'calendar.txt':[['service_id'],['c'],['c2']],
   'trips.txt':[['route_id','service_id','trip_id','direction_id','shape_id'],
                ['r1','c','t','0','shape'],['r2','c2' if conflicting_service else 'c','t','0','shape'],
                ['r2','c2' if conflicting_service else 'c','t','0','shape']],
   'stop_times.txt':[['trip_id','stop_sequence','stop_id','arrival_time','departure_time'],
                     ['t','1','s','08:00:00','08:00:00']],
   'shapes.txt':[['shape_id','shape_pt_sequence','shape_pt_lat','shape_pt_lon'],
                 ['shape','1','31','34']]}
  with zipfile.ZipFile(path,'w') as z:
   for name,rs in tables.items():
    stream=io.StringIO();csv.writer(stream).writerows(rs);z.writestr(name,stream.getvalue())
 def test_shared_trip_preserves_routes_without_duplicate_rows(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'feed.zip';self.fixture(p)
   tables,times,shapes=m.load_snapshot([p])
   self.assertEqual(len(tables['trips.txt']),2)
   self.assertEqual({r['route_id'] for r in tables['trips.txt'].values()},{'r1','r2'})
   self.assertEqual(len(times),2)
   self.assertEqual(list(times.values())[0],list(times.values())[1])
   self.assertEqual(m.load_snapshot([p,p]),(tables,times,shapes))
 def test_conflicting_service_still_fails(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'feed.zip';self.fixture(p,True)
   with self.assertRaisesRegex(ValueError,'Conflicting trips.txt'):
    m.load_snapshot([p])

if __name__=='__main__':unittest.main()
