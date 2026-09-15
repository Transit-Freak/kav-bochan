import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from extract_route_tables import parse, route_counts, main


class RouteTablesTests(unittest.TestCase):
    def test_rerun_updates_published_counts_and_marks_old_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'tenders';root.mkdir();cache=Path(folder)/'cache';cache.mkdir()
            header=['מקט','קו','כיוון','חלופה','שם תחנת מוצא','שם תחנת יעד']
            rows=[['10001','1','1','#','מוצא','יעד'],['10001','1','2','#','יעד','מוצא']]
            def run(digest,source_rows):
                target=cache/digest;target.mkdir(exist_ok=True)
                (target/'units.json').write_text(json.dumps({'units':[{'sheet':'קווים','rows':[header,*source_rows]}]}))
                (root/'packages-state.json').write_text(json.dumps({'tenders':{'a':{'documents':{'x':{'url':'https://mr.gov.il/a','sha256':digest}}}}}))
                with patch('extract_route_tables.ROOT',root),patch('package_pipeline.CACHE',cache),patch('package_pipeline.STATE',root/'packages-state.json'):
                    main()
                return json.loads((root/'route-data/a.json').read_text())
            self.assertEqual(run('first',rows)[0]['counts']['lines'],1)
            changed=rows+[['10002','2','1','#','יישוב א','יישוב ב']]
            versions=run('second',changed)
            self.assertEqual([v['counts']['lines'] for v in versions],[1,2])
            self.assertEqual([v['sourceStatus'] for v in versions],['superseded','current_download'])
            self.assertEqual(len(run('second',changed)),2)
            self.assertEqual(run('third',changed[-1:])[-1]['counts']['lines'],1)

    def test_counts_recompute_when_lines_change_without_counting_directions_twice(self):
        routes=[{'key':['10001','1','1','#']},{'key':['10001','1','2','#']},
                {'key':['10001','1','1','א']}]
        self.assertEqual(route_counts(routes),{'lines':1,'directionVariants':3,'rows':3})
        routes.append({'key':['10002','2','1','#']})
        self.assertEqual(route_counts(routes)['lines'],2)
        routes=[r for r in routes if r['key'][0]!='10001']
        self.assertEqual(route_counts(routes)['lines'],1)

    def test_direction_and_variant_stop_join(self):
        header=dict(enumerate(['מקט','קו','כיוון','חלופה','שם תחנת מוצא','שם תחנת יעד']))
        stop_header=dict(enumerate(['מקט','קו','כיוון','חלופה','סידורי תחנה','מקט תחנה','שם תחנה','Long','Lat']))
        tables=[('קווים',[(1,header),(2,dict(enumerate(['10001','1','1','#','מוצא','יעד']))),(3,dict(enumerate(['10001','1','2','#','יעד','מוצא'])))]),
                ('תחנות',[(1,stop_header),(2,dict(enumerate(['10001','1','1','#','1','10','תחנה א','35','32']))),(3,dict(enumerate(['10001','1','2','#','1','20','תחנה ב','200000','600000'])))])]
        with patch('extract_route_tables.sheets',return_value=iter(tables)):
            routes=parse(b'')
        self.assertEqual(routes[0]['stops'][0][1],'10')
        self.assertEqual(routes[1]['stops'][0][1],'20')
        self.assertIsNone(routes[1]['stops'][0][3])
        self.assertEqual(routes[0]['stops'][0][-2:],[2,'תחנות'])

    def test_unrecognized_and_empty_proposal_are_not_routes(self):
        tables=[('דוגמה',[(1,{0:'מספר קו',1:'תחנת מוצא',2:'תחנת יעד'}),(2,{0:'1',1:'2',2:'3'})])]
        with patch('extract_route_tables.sheets',return_value=iter(tables)):
            self.assertEqual(parse(b''),[])


if __name__=='__main__':unittest.main()
