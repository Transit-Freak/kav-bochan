#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""סקר "קווי האוטובוס הבעייתיים" לעיר — כמו הכתבה של mynet ירושלים (05.10.2026, שלמה 06.10):
לכל קו: כמה נסיעות תוכננו, וכמה מהן לא בוצעו. רץ ב-Actions (data.gov.il חסום מהמכולה).

המקור: "תכנון מול ביצוע נסיעות אוטובוסים ברמת נסיעה בודדת" של משרד התחבורה (bitzua_bus_trip)
דרך ה-API של data.gov.il (datastore_search, לפי CLAUDE.md — לא הורדת קבצים). כל שורה היא נסיעה
מתוכננת; נסיעה בלי שעת התחלה בפועל (bitzua_history_start_dt) = אי-ביצוע. erua_hachraga_ind מסמן
נסיעה בזמן "אירוע חריג" שאושר — מוצג בנפרד, כי ייתכן שהמשרד לא סופר אותה לחובת המפעיל.

הקווים: כל המק"טים שבאשכולות שנבחרו, לפי ClusterToLine (bus/data/routes.json). קו = מפעיל + מספר
קו, כל הכיוונים והחלופות יחד (כמו בכתבה).

    YEAR=2026 MONTHS=1,2 CLUSTERS="ירושלים מרכז,ירושלים עירוני,..." NAME=jerusalem python3 tools/bitzua_survey.py
"""
import collections
import datetime
import json
import os
import time
import urllib.parse
import urllib.request

CKAN = 'https://data.gov.il/api/3/action'
UA = {'User-Agent': 'kav-bochan-survey/1.0', 'Referer': 'https://data.gov.il/'}
FIELDS = ['OfficeLineId', 'OperatorLineId', 'operator_nm', 'cluster_nm', 'trip_month', 'bitzua_history_start_dt', 'erua_hachraga_ind']


def log(*a):
    print(*a, flush=True)


def ckan(url, timeout=300):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001 — שרת עמוס: ניסיון חוזר
            log(f'  ניסיון {i + 1} נכשל: {e}')
            time.sleep(10 * (i + 1))
    raise SystemExit('data.gov.il לא ענה')


def resource(year):
    pkg = ckan(f'{CKAN}/package_show?id=bitzua_bus_trip')['result']
    for r in pkg.get('resources', []):
        if str(year) in (r.get('name') or '') and r.get('datastore_active'):
            return r['id'], r.get('last_modified')
    raise SystemExit(f'אין משאב לשנת {year}')


def main():
    year = int(os.environ.get('YEAR') or datetime.date.today().year)
    months = [int(m) for m in (os.environ.get('MONTHS') or '1,2').split(',') if m.strip()]
    clusters = [c.strip() for c in (os.environ.get('CLUSTERS') or '').split(',') if c.strip()]
    name = os.environ.get('NAME') or 'survey'
    min_trips = int(os.environ.get('MIN') or 3000)
    routes = json.load(open('bus/data/routes.json', encoding='utf-8'))
    mkts = sorted({int(v[0]) for v in routes.values() if len(v) > 8 and v[8] in clusters and str(v[0]).isdigit()})
    ltype = {int(v[0]): v[9] for v in routes.values() if len(v) > 9 and str(v[0]).isdigit()}
    log(f'אשכולות: {clusters} · {len(mkts)} מק"טים · {year} חודשים {months}')
    rid, mod = resource(year)
    log(f'משאב {rid} · עודכן {mod}')
    agg = collections.defaultdict(lambda: {'plan': 0, 'miss': 0, 'erua': 0, 'erua_miss': 0, 'mkts': set(), 'cl': collections.Counter(), 'm': collections.Counter()})
    months_seen = collections.Counter()
    limit = 32000
    def take(flt_obj, label):
        n, offset = 0, 0
        flt = urllib.parse.quote(json.dumps(flt_obj, ensure_ascii=False))
        while True:
            res = ckan(f'{CKAN}/datastore_search?resource_id={rid}&limit={limit}&offset={offset}&filters={flt}&fields={",".join(FIELDS)}')['result']
            recs = res.get('records', [])
            for r in recs:
                key = (r.get('operator_nm') or '', str(r.get('OperatorLineId') or ''))
                a = agg[key]
                a['plan'] += 1
                miss = not (r.get('bitzua_history_start_dt') or '').strip()
                er = str(r.get('erua_hachraga_ind') or '0') not in ('0', '', 'None', 'False')
                a['miss'] += miss
                a['erua'] += er
                a['erua_miss'] += miss and er
                a['mkts'].add(int(r['OfficeLineId']))
                a['cl'][r.get('cluster_nm') or ''] += 1
                a['m'][r.get('trip_month')] += 1
                months_seen[r.get('trip_month')] += 1
            n += len(recs)
            log(f'  {label} · היסט {offset:,} · {len(recs):,} שורות')
            if len(recs) < limit:
                return n
            offset += limit
    # קודם לפי שם האשכול בנתוני המשרד עצמם (כולל קווים שבוטלו מאז); אם השמות שם שונים — לפי המק"טים
    got = take({'cluster_nm': clusters, 'trip_month': months}, 'לפי אשכול')
    if not got:
        log('אין שורות לפי שם האשכול — לפי המק"טים של היום')
        for i in range(0, len(mkts), 60):   # רשימת סינון ארוכה מדי ב-URL נדחית
            take({'OfficeLineId': mkts[i:i + 60], 'trip_month': months}, f'מק"טים {i + 1}–{min(i + 60, len(mkts))}')
    lines = []
    for (op, ln), a in agg.items():
        lines.append({'op': op, 'line': ln, 'plan': a['plan'], 'miss': a['miss'], 'rate': round(100 * a['miss'] / a['plan'], 2) if a['plan'] else None,
                      'erua': a['erua'], 'miss_no_erua': a['miss'] - a['erua_miss'],
                      'cluster': a['cl'].most_common(1)[0][0], 'type': collections.Counter(ltype.get(m, '') for m in a['mkts']).most_common(1)[0][0],
                      'mkts': sorted(a['mkts']), 'by_month': {str(k): v for k, v in sorted(a['m'].items())}})
    lines.sort(key=lambda x: -x['plan'])
    big = [x for x in lines if x['plan'] >= min_trips]
    tot = {'plan': sum(x['plan'] for x in lines), 'miss': sum(x['miss'] for x in lines)}
    out = {'name': name, 'year': year, 'months': months, 'months_in_data': {str(k): v for k, v in sorted(months_seen.items())},
           'clusters': clusters, 'min_trips': min_trips, 'resource': rid, 'resource_modified': mod,
           'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'), 'total': tot, 'lines': lines}
    os.makedirs('docs/surveys', exist_ok=True)
    base = f'docs/surveys/bitzua-{name}-{year}-{"-".join(map(str, months))}'
    json.dump(out, open(base + '.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    row = lambda x: f'| {x["line"]} | {x["op"]} | {x["cluster"]} | {x["plan"]:,} | {x["miss"]:,} | {x["rate"]}% |'
    head = '| קו | מפעיל | אשכול | נסיעות מתוכננות | לא בוצעו | שיעור אי-ביצוע |\n|---|---|---|---|---|---|'
    md = [f'# אי-ביצוע נסיעות — {name}, {year} חודשים {",".join(map(str, months))}', '',
          f'מקור: משרד התחבורה, תכנון מול ביצוע ברמת נסיעה בודדת (data.gov.il, משאב {rid}, עודכן {mod}). '
          f'אשכולות: {", ".join(clusters)}. סה"כ {tot["plan"]:,} נסיעות מתוכננות, {tot["miss"]:,} לא בוצעו '
          f'({100 * tot["miss"] / max(1, tot["plan"]):.1f}%). בדירוגי האמינות רק קווים עם {min_trips:,} נסיעות ומעלה.', '',
          '## הקווים עם הכי הרבה נסיעות מתוכננות', head, *[row(x) for x in lines[:15]], '',
          '## שיעור אי-הביצוע הגבוה ביותר', head, *[row(x) for x in sorted(big, key=lambda x: -x['rate'])[:15]], '',
          '## שיעור אי-הביצוע הנמוך ביותר', head, *[row(x) for x in sorted(big, key=lambda x: x['rate'])[:15]], '']
    open(base + '.md', 'w', encoding='utf-8').write('\n'.join(md))
    log('\n'.join(md))


if __name__ == '__main__':
    main()
