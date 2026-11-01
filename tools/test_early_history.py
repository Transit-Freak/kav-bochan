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
 def fixture(self, path, conflicting_service=False, orphans=0):
  tables={
   'routes.txt':[['route_id'],['r1'],['r2']],
   'agency.txt':[['agency_id'],['a']],
   'stops.txt':[['stop_id'],['s']],
   'calendar.txt':[['service_id'],['c'],['c2']],
   'trips.txt':[['route_id','service_id','trip_id','direction_id','shape_id'],
                ['r1','c','t','0','shape'],['r2','c2' if conflicting_service else 'c','t','0','shape'],
                ['r2','c2' if conflicting_service else 'c','t','0','shape']]
                +[['gone','c',f'o{i}','0','shape'] for i in range(orphans)],
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
 def test_few_trips_without_route_are_set_aside(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'feed.zip';self.fixture(p,orphans=2)
   tables,times,shapes=m.load_snapshot([p])
   self.assertEqual(tables['missing-route-trips'],{'gone':['o0','o1']})
   self.assertEqual({r['route_id'] for r in tables['trips.txt'].values()},{'r1','r2'})
   self.assertNotIn('o0',times)
 def test_many_trips_without_route_still_fail(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'feed.zip';self.fixture(p,orphans=m.MAX_ORPHAN_TRIPS+1)
   with self.assertRaisesRegex(ValueError,'Missing route gone'):
    m.load_snapshot([p])
 def test_conflicting_service_still_fails(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'feed.zip';self.fixture(p,True)
   with self.assertRaisesRegex(ValueError,'Conflicting trips.txt'):
    m.load_snapshot([p])


class DuplicateRouteIdentityTest(unittest.TestCase):
 def data(self):
  return {'routes.txt':{
   'a':{'route_id':'a','route_desc':'12345-1-0','route_type':'2','route_long_name':'A-B'},
   'b':{'route_id':'b','route_desc':'12345-1-0','route_type':'2','route_long_name':'A-B'}},
   'trips.txt':{
    't':{'trip_id':'t','route_id':'a','service_id':'c'},
    'alias':{'trip_id':'t','route_id':'b','service_id':'c'},
    'u':{'trip_id':'u','route_id':'b','service_id':'c'}}}, {
     't':[(1,'s','08:00:00')],'alias':[(1,'s','08:00:00')],'u':[(1,'s','09:00:00')]}
 def test_merge_retains_provenance_and_distinct_departures(self):
  tables,times=self.data()
  self.assertEqual(m.coalesce_identical_routes(tables,times),{'a':['a','b']})
  self.assertEqual(len(tables['routes.txt']),1)
  self.assertEqual(set(tables['trips.txt']),{'t','u'})
  self.assertEqual(times['u'][0][2],'09:00:00')
 def test_different_metadata_is_not_merged(self):
  tables,times=self.data();tables['routes.txt']['b']['route_long_name']='A-C'
  with self.assertRaisesRegex(ValueError,'Conflicting metadata'):
   m.coalesce_identical_routes(tables,times)
 def test_different_shared_trip_times_is_not_merged(self):
  tables,times=self.data();times['alias']=[(1,'s','08:30:00')]
  with self.assertRaisesRegex(ValueError,'Conflicting shared trip'):
   m.coalesce_identical_routes(tables,times)


class BrokenSourceTest(unittest.TestCase):
 """הדמיה של התקלה מ-01.11: צילום בלי routes.txt נכשל בכל ריצה ושלח מייל, עד שדולג אחרי 3."""
 def run_main(self,d,download=None,publish=None):
  argv=['import_early_history.py','--out',d,'--limit','1']
  patches=[patch.object(m,'CAT',Path(d)/'cat.json'),patch('sys.argv',argv)]
  if download:patches.append(patch.object(m,'download',download))
  if publish:patches.append(patch.object(m,'publish',publish))
  for p in patches:p.start()
  try:
   try:m.main();return 0
   except SystemExit as e:return e.code
  finally:
   for p in patches:p.stop()
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();d=self.d=self.tmp.name
  m.write(Path(d)/'cat.json',{'snapshots':[{'id':'obus-2018-07-30-x','kind':'obus15','date':'2018-07-30','urls':['https://example/x.zip']}]})
 def tearDown(self):self.tmp.cleanup()
 def progress(self):return m.read(Path(self.d)/'early-progress.json')
 def test_missing_table_is_skipped_at_once_without_failing(self):
  def no_routes(u,p):
   with zipfile.ZipFile(p,'w') as z:z.writestr('agency.txt','agency_id\na\n')
  self.assertEqual(self.run_main(self.d,download=no_routes),0)
  self.assertIn('obus-2018-07-30-x',self.progress()['skipped'])
  self.assertEqual(self.progress()['errors'],{})
 def test_other_data_error_warns_and_skips_after_three(self):
  def bad(source,paths):raise ValueError('Missing route 1')
  ok=lambda u,p:p.write_bytes(b'')
  for i in range(m.SKIP_AFTER-1):
   self.assertEqual(self.run_main(self.d,download=ok,publish=bad),0)
   self.assertEqual(self.progress()['attempts']['obus-2018-07-30-x'],i+1)
  self.assertEqual(self.run_main(self.d,download=ok,publish=bad),0)
  self.assertIn('obus-2018-07-30-x',self.progress()['skipped'])
 def test_network_error_still_fails(self):
  def down(u,p):raise OSError('connection reset')
  self.assertEqual(self.run_main(self.d,download=down),1)
  self.assertNotIn('obus-2018-07-30-x',self.progress().get('skipped',{}))

if __name__=='__main__':unittest.main()
