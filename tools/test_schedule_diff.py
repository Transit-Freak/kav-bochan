import copy
import unittest
from schedule_diff import archive_diff, annotate_archive_schedule, diff_note

def pattern(times, start='20160201', end='20160401', days=None):
    return [{'services':[{'calendar':{'service_id':'arbitrary', 'start_date':start,
        'end_date':end, **{d:'1' for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']},
        **(days or {})}, 'departures':times, 'profiles':[0]*len(times)}], 'timeProfiles':[[[0,0]]]}]

class ScheduleTest(unittest.TestCase):
    def test_validity_rollover_is_not_change(self):
        self.assertEqual(archive_diff(pattern(['08:00:00']), pattern(['08:00:00'], '20160202','20160402')), {})

    def test_station_profile_is_not_departure_change(self):
        before=pattern(['08:00:00']); after=copy.deepcopy(before)
        after[0]['timeProfiles']=[[[60,90]]]
        self.assertEqual(archive_diff(before,after), {})

    def test_calendar_split_does_not_double_departures(self):
        before=pattern(['08:00:00']); after=pattern(['08:00:00'],end='20160214')
        after[0]['services']+=pattern(['08:00:00'],start='20160215')[0]['services']
        self.assertEqual(archive_diff(before,after), {})

    def test_changed_times_and_ordinary_note(self):
        r=archive_diff(pattern(['08:00:00']),pattern(['08:10:00']))
        self.assertEqual((r['k'],r['tl'],r['tn']),('sched','08:00','08:10'))
        self.assertIn('שעות חדשות: 08:10 · במקום: 08:00',r['note'])

    def test_searches_changed_weekday_not_first_unchanged_day(self):
        before=pattern(['08:00:00']); after=copy.deepcopy(before)
        after[0]['services'][0]['calendar']['saturday']='0'
        r=archive_diff(before,after)
        self.assertEqual((r['tl'],r['tn']),('08:00',''))
        self.assertIn('שבת',r['note']); self.assertIn('ירדו: 08:00',r['note'])

    def test_simultaneous_trip_removal(self):
        r=archive_diff(pattern(['08:00:00','08:00:00']),pattern(['08:00:00']))
        self.assertEqual(r['tl'],'08:00,08:00')
        self.assertEqual(r['k'],'freq'); self.assertIn('תגבור',r['note'])

    def test_nonoverlap_is_not_cancellation(self):
        self.assertIsNone(archive_diff(pattern(['08:00:00'],end='20160202'),pattern(['09:00:00'],start='20160301')))

    def test_noop_event_is_not_advertised(self):
        old={'earlyPatterns':pattern(['08:00:00'])}
        event={'earlyPatterns':pattern(['08:00:00']), 'k':'sched','note':'fake','tl':'old'}
        self.assertEqual(annotate_archive_schedule(event,old,None),'unchanged')
        self.assertTrue(event['hid']); self.assertEqual(event['k'],'snapshot')
        self.assertNotIn('tl',event)

if __name__=='__main__': unittest.main()
