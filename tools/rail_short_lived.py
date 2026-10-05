#!/usr/bin/env python3
"""רכבות שפעלו שנה או פחות — המועמדים לבדיקת "למה" באינטרנט (שלמה 05.10).

"פאנל שיבדוק רכבות מוזרות שפעלו לתקופה של שנה או פחות, יבדוק באינטרנט אם אלו רכבות זמניות,
ויציין באתר מהכתבה למה הקו הזה, עם קישור לכתבה." רכבות בלבד, לא אוטובוסים; בלי הרכבות
התפעוליות של 2013–2015 (early-rail).

רכבת = זוג תחנות הקצה (בלי כיוון), על פני כל החלופות והכיוונים שלה. שמות התחנות מנורמלים,
כי אותה תחנה נכתבה אחרת במקורות שונים ("באר שבע-צפון" / "באר שבע צפון", "נת-בג" / "נתב''ג").
אותו זוג יכול לחזור (למשל רכבות ל"ג בעומר לכרמיאל ב-2019 וב-2021), ולכן כל תקופת פעילות
רציפה היא רכבת נפרדת: תקופות של החלופות שנוגעות זו בזו (פער של עד GAP_DAYS) מתאחדות.
מועמד: תקופה של 365 יום או פחות. תקופה שנוגעת בתחילת הנתונים או בסופם לא נכללת, כי לא
ידוע כמה זמן באמת פעלה.

  OUTDIR=line-history/data python3 tools/rail_short_lived.py   # כותב rail-short-lived.json
"""
import collections, datetime, json, os, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from compact_lines import materialize

OUT = Path(os.environ.get('OUTDIR', 'line-history/data'))
MAX_DAYS = 365
EDGE_DAYS = 14   # this close to the first or last day of the data = unknown lifespan
GAP_DAYS = 60    # variants of a pair this close in time belong to one period of operation


def norm(name):
    n = name.replace("''", '"').replace('נת-בג', 'נתבג').replace('נתב"ג', 'נתבג')
    n = re.sub(r'[-/–]', ' ', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n.replace('תא אוניברסיטה', 'תל אביב אוניברסיטה').replace('רשל"צ', 'ראשון לציון')


def file_of(rd):
    return OUT / 'lines' / (rd.replace('#', 'H').replace('/', '_') + '.json')


def main():
    index = json.loads((OUT / 'lines.json').read_text(encoding='utf-8'))['lines']
    pairs = collections.defaultdict(list)
    data_first, data_last = None, None
    for entry in index:
        if 'רכבת' not in str(entry.get('op', '')):
            continue
        try:
            versions = materialize(json.loads(file_of(entry['rd']).read_text(encoding='utf-8')))['versions']
        except Exception:
            continue
        stops = next((v['stops'] for v in reversed(versions) if v.get('stops')), None)
        if not stops:
            continue
        dates = [v['d'] for v in versions if v.get('d')]
        removed = [v['d'] for v in versions if v.get('k') == 'removed']
        first, last = min(dates), (max(removed) if removed else max(dates))
        data_first = min(filter(None, [data_first, first]))
        data_last = max(filter(None, [data_last, max(dates)]))
        a, b = norm(stops[0][1]), norm(stops[-1][1])
        pairs[tuple(sorted((a, b)))].append({'rd': entry['rd'], 'first': first, 'last': last,
                                             'name': (stops[0][1], stops[-1][1]), 'via': [s[1] for s in stops[1:-1]]})
    day = datetime.date.fromisoformat
    start, end = day(data_first), day(data_last)
    out = []
    periods = 0
    for (a, b), variants in pairs.items():
        variants.sort(key=lambda v: v['first'])
        groups = []
        for v in variants:
            if groups and (day(v['first']) - day(groups[-1]['last'])).days <= GAP_DAYS:
                g = groups[-1]
                g['last'] = max(g['last'], v['last'])
                g['vs'].append(v)
            else:
                groups.append({'first': v['first'], 'last': v['last'], 'vs': [v]})
        periods += len(groups)
        for g in groups:
            days = (day(g['last']) - day(g['first'])).days
            if days > MAX_DAYS:
                continue
            if (day(g['first']) - start).days < EDGE_DAYS or (end - day(g['last'])).days < EDGE_DAYS:
                continue
            names = collections.Counter(v['name'] for v in g['vs'])
            via = collections.Counter(s for v in g['vs'] for s in v['via'])
            shown = names.most_common(1)[0][0]
            out.append({'id': f"{a}|{b}|{g['first']}", 'from': shown[0], 'to': shown[1], 'first': g['first'],
                        'last': g['last'], 'days': days, 'via': [n for n, _ in via.most_common(8)],
                        'rds': sorted(v['rd'] for v in g['vs'])})
    out.sort(key=lambda x: (x['first'], x['id']))
    (OUT / 'rail-short-lived.json').write_text(
        json.dumps({'data': [data_first, data_last], 'maxDays': MAX_DAYS, 'candidates': out}, ensure_ascii=False, indent=1),
        encoding='utf-8')
    print(f'{len(out)} רכבות שפעלו {MAX_DAYS} יום או פחות (מתוך {periods} תקופות של {len(pairs)} זוגות תחנות, '
          f'נתונים {data_first}–{data_last})')


if __name__ == '__main__':
    main()
