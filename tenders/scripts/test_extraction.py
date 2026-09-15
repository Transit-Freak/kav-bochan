import unittest
from extract_documents import VERSION, extract, fingerprint, is_due
from tender_fields import validate


class ExtractionTests(unittest.TestCase):
    def test_versions_keep_disagreements_null(self):
        from document_versions import reconcile
        a,_=extract(['מכרז מספר 03/2024','14.1 המציע יצרף ערבות בסכום של 2,000 ש"ח 14.2 אחר'],{'id':'sample','number':'3/2024'},'https://mr.gov.il/a','a')
        b,_=extract(['מכרז מספר 03/2024','14.1 המציע יצרף ערבות בסכום של 3,000 ש"ח 14.2 אחר'],{'id':'sample','number':'3/2024'},'https://mr.gov.il/b','b')
        result=reconcile([a,b]);self.assertIsNone(result['guarantee.bid']['value']);self.assertEqual(result['guarantee.bid']['status'],'conflict')
        self.assertEqual(len(result['guarantee.bid']['sources']),2)
        self.assertEqual(reconcile([a,a])['guarantee.bid']['value'],2000)

    def test_alternative_qualification_is_not_universal(self):
        text='4.1.1.3 בעל שליטה 30% מחזור מכירות שנתי ממוצע בשלוש השנים האחרונות (2023-2021) של לפחות 300 מיליון ₪ לשנה וההון העצמי בשנת 2023 הוא לפחות 60 מיליון ₪ בנוסף לפחות 80 אוטובוסים שהינם בעלי 34 מקומות ישיבה לפחות שירותי הסעות במהלך 5 השנים האחרונות 4.1.2 אחר'
        fields,error=extract(['מכרז מספר 03/2024',text],{'id':'sample','number':'3/2024'},'https://mr.gov.il/a','a')
        f=fields['eligibility.turnover'];self.assertIsNone(f['value']);self.assertEqual(f['status'],'verified_conditional')
        self.assertEqual(f['conditions'][0]['value'],300000000);self.assertEqual(f['conditions'][0]['comparison'],'gte')
        self.assertEqual(validate('sample',fields),[])
        untouched,_=extract(['מכרז מספר 03/2024',text.replace('4.1.1.3','9.9.9')],{'id':'sample','number':'3/2024'},'https://mr.gov.il/a','a')
        self.assertIsNone(untouched['eligibility.turnover']['value']);self.assertEqual(untouched['eligibility.turnover']['status'],'unverified')

    def test_daily_queue_and_publication_changes(self):
        item = {'id': 'sample', 'number': '3/24', 'updated': '2026-09-15', 'deadline': '2026-10-01'}
        previous = {'sourceVersion': item['updated'], 'sourceFingerprint': fingerprint(item), 'parserVersion': VERSION, 'nextCheckAt': '2026-09-16T00:00:00'}
        self.assertTrue(is_due(item, {}, '2026-09-15'))
        self.assertFalse(is_due(item, previous, '2026-09-15'))
        self.assertTrue(is_due({**item, 'deadline': '2026-10-15'}, previous, '2026-09-15'))
        self.assertTrue(is_due(item, previous, '2026-09-17'))

    def test_different_money_scopes_and_source_page(self):
        pages = ['הליך תחרותי מספר 3/24 משרד התחבורה באוטובוסים',
                 '14.1 המציע יצרף ערבות בסכום של 2,000,000 ש"ח 14.2 אחר',
                 '15.1 ימסור הזוכה ערבות',
                 'על סך של 20 מיליון ₪ 15.2 אחר; תוקף עד 2030; 17.14.1 אזכור אחר']
        fields, error = extract(pages, {'id': 'sample', 'number': '03/24'}, 'https://mr.gov.il/document', 'sample')
        self.assertIsNone(error)
        self.assertEqual(fields['guarantee.bid']['value'], 2000000)
        self.assertEqual(fields['guarantee.performance']['value'], 20000000)
        self.assertEqual(fields['guarantee.performance']['sources'][0]['locator'], 'עמוד PDF 4, סעיף 15.1')
        self.assertIsNone(fields['award.awarded_price']['value'])
        self.assertIsNone(fields['dates.submission']['value'])
        self.assertEqual(validate('sample', fields), [])

    def test_wrong_tender_never_publishes_values(self):
        fields, error = extract(['מכרז מספר 07/2024'], {'id': 'sample', 'number': '03/2024'}, 'https://mr.gov.il/document', 'sample')
        self.assertTrue(error)
        self.assertTrue(all(f['value'] is None for f in fields.values()))

    def test_ambiguous_guarantee_remains_null(self):
        fields, _ = extract(['מכרז מספר 03/2024', '14.1 המציע יצרף ערבות בסכום של 2,000 ש"ח או בסכום של 3,000 ש"ח 14.2 אחר'], {'id':'sample','number':'3/2024'}, 'https://mr.gov.il/document', 'sample')
        self.assertEqual(fields['guarantee.bid']['status'], 'conflict')
        self.assertIsNone(fields['guarantee.bid']['value'])


if __name__ == '__main__':
    unittest.main()
