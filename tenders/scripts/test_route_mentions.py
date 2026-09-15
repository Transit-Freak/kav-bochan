import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from route_mentions import locate
from apply_review import prepare

class RouteContextTests(unittest.TestCase):
    def test_multiple_writing_styles_and_neighboring_pages(self):
        units=[{'page':1,'text':'קו 16 יוארך לתחנה החדשה'},
               {'page':2,'text':'קו )10144( 144 מסלול הבסיס יהפוך לחלופה'},
               {'page':3,'text':'קו חדש ( )172 ממעלה אדומים לתחנה המרכזית'},
               {'page':4,'text':'שינויים במסלולים: הקווים יפוצלו בהתאם למפרט'}]
        found=locate(units)
        self.assertEqual(len(found),4)
        self.assertIn('144',found[1]['numbers']);self.assertIn('172',found[2]['numbers'])
        self.assertNotIn('10144',found[1]['numbers'])
        self.assertEqual(found[1]['contextUnits'],[0,1,2])

    def test_numeric_match_does_not_create_verified_fact(self):
        found=locate([{'page':1,'text':'קו 16 במסמך מתייחס גם לסעיף 22'}])
        self.assertNotIn('targets',found[0]);self.assertNotIn('verified',found[0])

    def test_context_does_not_cross_archive_documents(self):
        found=locate([{'page':1,'member':'a.pdf','text':'קו 16'},
                      {'page':1,'member':'b.pdf','text':'קו 16'}])
        self.assertEqual(found[0]['contextUnits'],[0])
        self.assertEqual(found[1]['contextUnits'],[1])

    def test_notes_require_scoped_identity_and_reviewed_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)/'digest';folder.mkdir();(folder/'units.json').write_text(json.dumps({'units':[{'page':5,'text':'קו 16'}, {'page':6,'text':'המשך'}]}))
            state={'tenders':{'a':{'documents':{'b':{'sha256':'digest','url':'https://mr.gov.il/a'}}}}}
            payload={'tenderId':'a','documentKey':'b','sha256':'digest','units':[{'index':0,'disposition':'summarized','note':'נקרא'}],'routeNotes':[{'text':'תיאור','targets':[{'number':'16','area':'אשקלון'}],'unitIndices':[0]}]}
            with patch('apply_review.CACHE',Path(temp)):
                _,_,result,_=prepare(payload,state)
                self.assertEqual(result['routeNotes'][0]['sources'][0]['unit'],0)
                payload['routeNotes'][0]['targets'][0].pop('area')
                with self.assertRaises(ValueError):prepare(payload,state)
                payload['routeNotes'][0]['targets'][0]['area']='אשקלון'
                payload['routeNotes'][0]['unitIndices']=[1]
                with self.assertRaises(ValueError):prepare(payload,state)

if __name__=='__main__':unittest.main()
