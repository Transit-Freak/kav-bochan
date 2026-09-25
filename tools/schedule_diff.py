"""Departure comparisons shared by ordinary history and recovered archives."""
import argparse
from collections import Counter
import datetime as dt
import gzip
import json
from pathlib import Path

DAY_COLS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
DAY_KEYS = ['ב','ג','ד','ה','ו','ש','א']
BUCKET_HE = {'א': 'ימי ראשון', 'ב': 'ימי שני', 'ג': 'ימי שלישי', 'ד': 'ימי רביעי',
             'ה': 'ימי חמישי', 'ו': 'ימי שישי', 'ש': 'שבת'}

def fmt_times(ts, cap=5):
    out = ', '.join(ts[:cap])
    if len(ts) > cap:
        out += f' ועוד {len(ts) - cap}'
    return out

def diff_note(bucket, old_ts, new_ts):
    bh = BUCKET_HE[bucket]
    co, cn = Counter(old_ts), Counter(new_ts)
    added = [t + (' (תגבור)' if co[t] else '') for t in sorted((cn - co).elements())]
    removed = [t + (' (תגבור)' if cn[t] else '') for t in sorted((co - cn).elements())]
    if len(old_ts) != len(new_ts):
        note = f'מספר היציאות ({bh}) השתנה מ-{len(old_ts)} ל-{len(new_ts)}'
        if added:
            note += f' · נוספו: {fmt_times(added)}'
        if removed:
            note += f' · ירדו: {fmt_times(removed)}'
        return 'freq', note
    note = f'לוח הזמנים ({bh}, {len(new_ts)} יציאות) השתנה'
    if added and removed:
        note += f' · שעות חדשות: {fmt_times(added)} · במקום: {fmt_times(removed)}'
    return 'sched', note

def departures(patterns):
    """Expand calendars, not service IDs/profiles, retaining simultaneous trips."""
    days = {}
    first = last = None
    for p in patterns:
        for s in p.get('services', []):
            c = s['calendar']
            start = dt.datetime.strptime(c['start_date'], '%Y%m%d').date()
            end = dt.datetime.strptime(c['end_date'], '%Y%m%d').date()
            first = min(first or start, start)
            last = max(last or end, end)
            times = [t[:5] for t in s.get('departures', [])]
            day = start
            while day <= end:
                if str(c.get(DAY_COLS[day.weekday()], '0')) == '1':
                    days.setdefault(day, []).extend(times)
                day += dt.timedelta(days=1)
    return first, last, {d: sorted(ts) for d, ts in days.items()}

def archive_diff(before, after):
    af, al, a = departures(before)
    bf, bl, b = departures(after)
    if None in (af, al, bf, bl):
        return None
    start, end = max(af, bf), min(al, bl)
    if start > end:
        return None
    # Ignore validity-window tails: expiry of the older publication is not
    # cancellation of trips. Compare the SAME operating date on both sides.
    for day in sorted(set(a) | set(b)):
        if not start <= day <= end:
            continue
        old, new = a.get(day, []), b.get(day, [])
        if old == new:
            continue
        kind, note = diff_note(DAY_KEYS[day.weekday()], old, new)
        # Ordinary history also merges a multi-weekday change into one event,
        # with one representative changed weekday and one before/after table.
        return {'k': kind, 'note': note, 'tl': ','.join(old), 'tn': ','.join(new),
                'scheduleComparisonDate': day.isoformat()}
    return {}

def read_patterns(event, root):
    if 'earlyPatterns' in event:
        return event['earlyPatterns']
    with gzip.open(Path(root) / 'early-patterns' / (event['earlyPatternsFile'] + '.json.gz'), 'rt') as f:
        return json.load(f)

def annotate_archive_schedule(event, previous, root):
    if not previous:
        raise ValueError('Schedule event has no previous archive snapshot')
    result = archive_diff(read_patterns(previous, root), read_patterns(event, root))
    event['earlyScheduleChecked'] = 1
    event.pop('tl', None)
    event.pop('tn', None)
    event.pop('scheduleComparisonDate', None)
    if result:
        event.update(result)
        event.pop('hid', None)
        return 'changed'
    # Keep the original evidence for route reconstruction and later comparisons,
    # but never advertise an unproven departure change as a schedule event.
    event['k'] = 'snapshot'
    event['hid'] = True
    event['note'] = ''
    event['earlyScheduleStatus'] = 'unchanged' if result == {} else 'not-comparable'
    return event['earlyScheduleStatus']

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='line-history/data')
    args = ap.parse_args()
    root = Path(args.out)
    counts = Counter()
    examples = []
    audit = Counter()
    fixes = {}
    summaries = {}
    for p in sorted((root / 'lines').glob('*.json')):
        lf = json.loads(p.read_text())
        audit['linesScanned'] += 1
        previous = None
        dirty = False
        for event in lf.get('versions', []):
            if not event.get('earlyPatternsFile'):
                continue
            if event.get('k') in ('sched', 'freq') and not event.get('earlyScheduleChecked'):
                status = annotate_archive_schedule(event, previous, root)
                counts[status] += 1
                dirty = True
                if status == 'changed' and len(examples) < 5:
                    examples.append({'rd': lf['rd'], 'd': event['d'], 'note': event['note']})
            previous = event
        for event in lf.get('versions', []):
            if event.get('earlyScheduleChecked'):
                fixes[(lf['rd'], event['d'])] = event
            if event.get('hid') or event.get('k') not in ('sched', 'freq'):
                continue
            audit['scheduleEventsScanned'] += 1
            if event.get('earlyPatternsFile'):
                assert event.get('earlyScheduleChecked'), (p.name, event['d'])
                assert event.get('tl', '') != event.get('tn', ''), (p.name, event['d'], 'identical times')
                assert event.get('note'), (p.name, event['d'], 'missing description')
                audit['verifiedArchiveScheduleEvents'] += 1
            elif 'tl' in event or 'tn' in event:
                if event.get('tl', '') == event.get('tn', ''):
                    audit['ordinaryIdenticalTables'] += 1
                else:
                    audit['ordinaryDifferentTables'] += 1
            else:
                audit['ordinaryEventsWithoutStoredTimes'] += 1
        if dirty:
            p.write_text(json.dumps(lf, ensure_ascii=False, separators=(',', ':')))
        if any(v.get('earlyScheduleChecked') for v in lf.get('versions', [])):
            visible = [v for v in lf['versions'] if not v.get('hid')]
            schedules = [v for v in visible if v.get('k') in ('sched', 'freq')]
            summaries[lf['rd']] = (len(visible), bool(schedules),
                any(v.get('k') == 'freq' and 'תגבור' in v.get('note', '') for v in schedules))
    index_path = root / 'lines.json'
    if index_path.exists():
        index = json.loads(index_path.read_text())
        for row in index.get('lines', []):
            summary = summaries.get(row.get('rd'))
            if summary is None:
                continue
            count, sched, freq = summary
            row['v'] = count
            kinds = set(row.get('ks', [])) - {'sched', 'freq'}
            if sched: kinds.add('sched')
            if freq: kinds.add('freq')
            row['ks'] = sorted(kinds)
        index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    # Only annotate the exact historical schedule records verified above.
    # Preserve every monthly row and every unrelated source/event unchanged.
    for p in sorted((root / 'changes').glob('????-??.json')):
        feed = json.loads(p.read_text())
        dirty = False
        for row in feed.get('changes', []):
            event = fixes.get((row.get('rd'), row.get('d')))
            if event is None or row.get('k') not in ('sched', 'freq', 'snapshot'):
                continue
            fields = {k:event[k] for k in ('k','note','tl','tn','earlyScheduleChecked') if k in event}
            fields['hid'] = bool(event.get('hid'))
            if any(row.get(k) != v for k, v in fields.items()):
                row.update(fields)
                dirty = True
                audit['archiveFeedRowsCorrected'] += 1
        if dirty:
            p.write_text(json.dumps(feed, ensure_ascii=False, separators=(',', ':')))
    report = {'counts': dict(counts), 'audit': dict(audit), 'examples': examples}
    (root / 'schedule-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
