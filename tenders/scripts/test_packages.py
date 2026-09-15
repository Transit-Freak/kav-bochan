import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from package_pipeline import AttachmentLinks, decode_file, discover, process
from analyze_packages import route_rows
from extract_documents import extract
from apply_review import prepare
from package_pipeline import make_queue


class PackageTests(unittest.TestCase):
    def test_stale_review_is_rejected_before_reading_cache(self):
        with self.assertRaisesRegex(ValueError,'Document changed'):
            prepare({'tenderId':'a','documentKey':'x','sha256':'old'},
                    {'tenders':{'a':{'documents':{'x':{'sha256':'new'}}}}})

    def test_review_queue_is_fair_and_excludes_reviewed_units(self):
        doc={'sha256':'x','url':'https://mr.gov.il/a','units':20,'reviewedUnits':[0,1]}
        state={'tenders':{tid:{'documents':{'x':doc}} for tid in ('a','b')}}
        queue=make_queue(state,Path('/tmp/unused-tender-test'))
        self.assertEqual([b['tenderId'] for b in queue],['a','b','a','b','a','b'])
        self.assertEqual(queue[0]['units'],[2,3,4,5,6,7])

    def test_attachment_discovery_deduplicates_id_and_rejects_external(self):
        p=AttachmentLinks('https://mr.gov.il/ilgstorefront/he/p/123')
        p.feed('<a href="/ilgstorefront/he/p/attachment/ID/old">x</a><a href="/ilgstorefront/he/p/attachment/ID/new">x</a><a href="https://other.test/file.pdf">x</a>')
        self.assertEqual(list(p.links.values()),['https://mr.gov.il/ilgstorefront/he/p/attachment/ID/new'])

    def test_failed_listing_preserves_all_prior_documents(self):
        previous={'documents':{'x':{'url':'https://mr.gov.il/a.pdf','sha256':'old'}}}
        with patch('package_pipeline.get',side_effect=OSError('offline')):
            _,result=discover({'id':'a','url':'https://mr.gov.il/a'},previous)
        self.assertFalse(result['listingOk']);self.assertEqual(result['documents'],previous['documents'])

    def test_route_columns_keep_directions_variants_and_catalog(self):
        u={'page':1,'sheet':'קווים','rows':[['קו','שם יישוב מוצא','שם יישוב יעד','כיוון','חלופה','מקט'],['7','א','ב','1','#','10007'],['7','ב','א','2','א','10007']]}
        rows=route_rows(u,'https://mr.gov.il/a','hash')
        self.assertEqual(len(rows),2);self.assertEqual(rows[1]['direction'],'2');self.assertEqual(rows[1]['variant'],'א')
        self.assertEqual(rows[1]['catalogNumber'],'10007')
        self.assertEqual(route_rows({'page':1,'text':'קו 7 מוזכר ברקע'},'u','h'),[])

    def test_zip_extracts_supported_members_and_reports_unsupported(self):
        import openpyxl
        w=openpyxl.Workbook();w.active.append(['קו','מוצא','יעד']);w.active.append([7,'א','ב'])
        b=io.BytesIO();w.save(b);z=io.BytesIO()
        with zipfile.ZipFile(z,'w') as f:f.writestr('routes.xlsx',b.getvalue());f.writestr('notes.xyz',b'data')
        with tempfile.TemporaryDirectory() as tmp:
            units,errors=decode_file(z.getvalue(),Path(tmp)/'source.bin')
        self.assertEqual(units[0]['member'],'routes.xlsx');self.assertEqual(errors[0]['member'],'notes.xyz')

    def test_short_year_matches_full_year(self):
        f,e=extract(['הליך תחרותי מספר 3/24 משרד התחבורה'],{'id':'a','number':'03/2024'},'https://mr.gov.il/a','hash')
        self.assertIsNone(e);self.assertEqual(f['identity.number']['value'],'3/24')

    def test_download_failure_preserves_hash_and_review(self):
        prior={'url':'https://mr.gov.il/a.pdf','sha256':'good','reviewedUnits':[0]}
        with tempfile.TemporaryDirectory() as tmp,patch('package_pipeline.get',side_effect=OSError('offline')):
            _,_,result=process({'id':'a'},'key',prior,Path(tmp))
        self.assertEqual(result['sha256'],'good');self.assertEqual(result['reviewedUnits'],[0])
        self.assertEqual(result['status'],'retry_pending')


if __name__=='__main__':unittest.main()
