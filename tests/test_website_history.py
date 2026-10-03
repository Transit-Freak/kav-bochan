import sys
import unittest
import tempfile
import json
import os
import subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from import_website_history import parse_page,needs_retry,MAX_ATTEMPTS
from compact_lines import compact,materialize
from check_history_claims import check
from repair_legacy_diffs import claims_contradict

class HistoricalWebsiteTests(unittest.TestCase):
    def test_public_number_is_read_from_page_not_internal_url(self):
        body='''<meta charset="utf-8"><h1>מפה לקו 186 (סופרבוס)</h1>
        <a href="javascript:SelectPlace(0,'',35.12,31.79,15)">מרכז המפה</a>
        <a href="javascript:SelectPlace(123,'בית מאיר',35.04,31.79,15)">בית מאיר</a>
        <a href="javascript:SelectPlace(124,'ירושלים',35.20,31.78,15)">ירושלים</a>'''
        result=parse_page(body.encode(),'http://bus.co.il/PlacesMap.asp?LineCompanyID=71&LineCode=88')
        self.assertEqual(result['line'],'186')
        self.assertTrue(result['patterns'][0]['partial'])
        self.assertEqual(result['patterns'][0]['stops'][0],['website:71:123','בית מאיר',31.79,35.04])

    def test_duplicate_rendering_is_removed_but_source_rows_are_kept(self):
        body='''<meta charset="utf-8"><h1>מסלול קו 437 (אגד)</h1><table>
        <tr><td>אשקלון ירושלים</td></tr><tr><td>ישוב</td><td>תחנה</td><td>זמן נסיעה</td></tr>
        <tr><td>אשקלון</td><td>מרכזית</td><td>0:00</td></tr><tr><td>אשקלון</td><td>מרכזית</td><td>0:00</td></tr>
        <tr><td>ירושלים</td><td>מרכזית</td><td>1:00</td></tr><tr><td>ירושלים</td><td>מרכזית</td><td>1:00</td></tr></table>'''
        result=parse_page(body.encode(),'http://otobusim.com/LineStations.asp?CompanyID=1&CompanyLineCode=00437')
        p=result['patterns'][0]
        self.assertEqual(len(p['stops']),2)
        self.assertEqual(len(p['sourceRows']),4)
        self.assertIsNone(p['stops'][0][2])

    def test_archive_timeouts_are_retried_but_not_forever(self):
        self.assertTrue(needs_retry({'status':'failed','reason':'<urlopen error timed out>'}))
        self.assertFalse(needs_retry({'status':'failed','reason':'timed out','attempts':MAX_ATTEMPTS}))
        self.assertFalse(needs_retry({'status':'unparsed','reason':'No supported stop table or saved coordinates'}))
        self.assertFalse(needs_retry({'status':'parsed'}))

    def test_unidentified_page_is_not_a_route(self):
        self.assertEqual(parse_page(b'<html>Unavailable</html>','http://bus.co.il/LinePlaces.asp?LineCode=1')['status'],'unparsed')

    def test_historical_geometry_is_not_borrowed_from_later_version(self):
        stops=[['website:1:123','a',31.8,35.2],['website:1:124','b',31.9,35.3]]
        lf={'versions':[{'d':'2003-01-01','stops':stops,'shp':'','noShapeBorrow':True},{'d':'2015-01-01','stops':stops,'shp':'abc'}]}
        result=materialize(compact(lf))
        self.assertFalse(result['versions'][0]['shp'])
        self.assertNotIn('shpref',result['versions'][0])

    def test_repeated_addition_without_intermediate_removal_is_rejected(self):
        a=['1','תחנה א',31.8,35.2];b=['2','תחנה ב',31.9,35.3]
        versions=[{'d':'2025-01-25','k':'snapshot','stops':[a]},
                  {'d':'2025-01-26','k':'stops-add','stops':[a,b],'ac':['2']},
                  {'d':'2025-01-27','k':'stops-add','stops':[a,b],'ac':['2']}]
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp);(data/'lines').mkdir()
            (data/'lines/1.json').write_text(json.dumps({'rd':'1-1-H','versions':versions}))
            with self.assertRaises(RuntimeError):check(data)

    def test_noop_repair_preserves_snapshots_and_updates_monthly_redraw(self):
        stops=[['1','a',None,None],['2','b',None,None]]
        versions=[{'d':'2003-01-01','k':'snapshot','stops':stops,'shp':'abc'},
                  {'d':'2003-01-02','k':'snapshot','stops':stops,'shp':'abc'},
                  {'d':'2003-01-03','k':'stops-add','stops':stops,'ac':['2']},
                  {'d':'2003-01-04','k':'route','stops':stops,'shp':'def','ac':['2']}]
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp);(data/'lines').mkdir();(data/'changes').mkdir()
            (data/'lines/1.json').write_text(json.dumps({'rd':'1','versions':versions}))
            (data/'changes/2003-01.json').write_text(json.dumps({'changes':[{'rd':'1','d':v['d'],'k':v['k'],'add':['b']} for v in versions]}))
            env={**os.environ,'OUTDIR':tmp};env.pop('DRY',None)
            subprocess.run([sys.executable,str(Path(__file__).resolve().parents[1]/'tools/repair_noop_events.py')],env=env,check=True,capture_output=True)
            result=materialize(json.loads((data/'lines/1.json').read_text()))
            self.assertEqual([v['k'] for v in result['versions']],['snapshot','snapshot','redraw'])
            rows=json.loads((data/'changes/2003-01.json').read_text())['changes']
            self.assertEqual(rows[-1]['k'],'redraw')
            self.assertNotIn('add',rows[-1])
            self.assertEqual(len(rows),3)

    def test_truncated_change_list_is_not_a_contradiction(self):
        old=[['1','a',None,None]]
        new=old+[[str(i),'b',None,None] for i in range(2,25)]
        self.assertFalse(claims_contradict(old,new,[str(i) for i in range(2,17)],[]))
        self.assertTrue(claims_contradict(old,new,['1'],[]))

    def test_addition_after_a_documented_removal_is_valid(self):
        a=['1','תחנה א',31.8,35.2];b=['2','תחנה ב',31.9,35.3]
        versions=[{'d':'2025-01-25','k':'snapshot','stops':[a]},
                  {'d':'2025-01-26','k':'stops-add','stops':[a,b],'ac':['2']},
                  {'d':'2025-01-27','k':'stops-del','stops':[a],'rc':['2']},
                  {'d':'2025-01-28','k':'stops-add','stops':[a,b],'ac':['2']}]
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp);(data/'lines').mkdir()
            (data/'lines/1.json').write_text(json.dumps({'rd':'1-1-H','versions':versions}))
            self.assertEqual(check(data)['invalidClaims'],[])

if __name__=='__main__':unittest.main()
