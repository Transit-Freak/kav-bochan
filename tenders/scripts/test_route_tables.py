import unittest
from unittest.mock import patch
from extract_route_tables import parse


class RouteTablesTests(unittest.TestCase):
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
