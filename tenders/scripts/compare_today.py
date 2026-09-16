"""מה שכתוב במכרז מול מה שרץ היום — השוואה בקוד, בלי מודל שפה.

לכל מכרז שיש לו טבלת קווים מנספח (route-data): לכל מק"ט בטבלה בודקים
בלוח הזמנים הרשמי של אתמול (GTFS מארכיון "אופן באס") אם הקו רץ היום, אצל
איזה מפעיל, ובאיזה מספר ושם. בנוסף, לפי קובץ "אשכול לקו" של משרד התחבורה
(כפי שנאסף ב"הקו בזמן"), אילו קווים רצים היום באשכול ואינם בטבלת המכרז.

הפלט: tenders/today.json
{ "gtfsDate": "YYYY-MM-DD", "updated": ..., "tenders": { tid: {
    "lines": { מק"ט: {"today": true/false, "operator": שם, "number": מספר היום,
                       "name": שם הקו היום, "directions": [route_desc...]} },
    "clusterName": שם האשכול בקובץ המשרד או null,
    "notInTender": [[מק"ט, מספר, שם, מפעיל], ...]   ← רצים היום באשכול, לא בטבלה
} } }
"מק"ט" הוא מספר הקטלוג הרשמי של הקו, זהה במכרז ובלוח הזמנים — ולכן ההשוואה
אינה ניחוש. שם האשכול במכרז ובקובץ המשרד לא תמיד זהה; ההתאמה לפי המילים
המשותפות, ואם אין התאמה ברורה — notInTender נשאר ריק.
"""
import datetime
import json
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT.parent / 'tools'))

S3 = ('https://openbus-stride-public.s3.eu-west-1.amazonaws.com'
      '/gtfs_archive/{y}/{m}/{d}/israel-public-transportation.zip')
LTYPE = ROOT.parent / 'line-history' / 'data' / 'ltype-state.json'
OUT = ROOT / 'today.json'


def gtfs_routes(day):
    """route_id → (agency_id, short_name, long_name, route_desc) + agencies, בבקשות Range בלבד."""
    cache = os.environ.get('GTFS_ROUTES_CACHE')
    if cache and os.path.exists(cache):
        d = json.load(open(cache, encoding='utf-8'))
        return d['routes'], d['agencies'], d['date']
    from backfill_geo import central_dir, member_rows
    url = S3.format(y=day.year, m=f'{day.month:02d}', d=f'{day.day:02d}')
    cd = central_dir(url)
    c, rows = member_rows(url, cd, 'routes.txt')
    routes = {r[c['route_id']]: [r[c['agency_id']], r[c['route_short_name']], r[c['route_long_name']], r[c['route_desc']]] for r in rows}
    c2, rows2 = member_rows(url, cd, 'agency.txt')
    agencies = {r[c2['agency_id']]: r[c2['agency_name']] for r in rows2}
    if cache:
        json.dump({'routes': routes, 'agencies': agencies, 'date': day.isoformat()}, open(cache, 'w', encoding='utf-8'), ensure_ascii=False)
    return routes, agencies, day.isoformat()


def by_makat(routes, agencies):
    out = {}
    for rid, (ag, short, long_, desc) in routes.items():
        m = re.match(r'(\d+)-(\d+)-(\S+)', desc or '')
        if not m:
            continue
        e = out.setdefault(m[1], {'operator': agencies.get(ag, ag), 'number': short, 'name': long_.split('<->')[0], 'directions': []})
        e['directions'].append(desc)
    return out


def words(s):
    return {w for w in re.split(r'[\s,/־\-]+', s or '') if len(w) > 2 and w not in ('קווי', 'אשכול', 'עירוני', 'בינעירוני')}


def match_cluster(tender_cluster, cluster_names):
    """שם האשכול במכרז → שם האשכול בקובץ המשרד.
    קודם שם של המשרד שמוכל בשם המכרז ("חיפה עירוני" בתוך "חיפה עירוני מזרח"),
    הארוך ביותר; אחרת לפי מילים משותפות, ורק כשההתאמה יחידה."""
    if not tender_cluster:
        return None
    contained = sorted((c for c in cluster_names if len(c) > 3 and c in tender_cluster), key=len, reverse=True)
    if contained:
        return contained[0]
    tw = words(tender_cluster)
    if not tw:
        return None
    scored = sorted(((len(tw & words(c)), c) for c in cluster_names), reverse=True)
    if not scored or scored[0][0] == 0:
        return None
    if len(scored) > 1 and scored[1][0] == scored[0][0]:
        return None
    return scored[0][1]


def load_route_data():
    index = json.load(open(ROOT / 'route-index.json', encoding='utf-8'))['tenders']
    out = {}
    for tid, meta in index.items():
        versions = []
        for f in meta.get('files', [meta.get('file')]):
            if f:
                versions += json.load(open(ROOT / f, encoding='utf-8'))
        out[tid] = versions
    return out


def main():
    day = datetime.date.today() - datetime.timedelta(days=1)
    routes, agencies, gdate = gtfs_routes(day)
    today = by_makat(routes, agencies)
    ltype = json.load(open(LTYPE, encoding='utf-8'))['m'] if LTYPE.exists() else {}
    cluster_of = {mk: v[2] for mk, v in ltype.items() if len(v) > 2 and v[2]}
    cluster_names = set(cluster_of.values())
    fields = json.load(open(ROOT / 'structured-tenders.json', encoding='utf-8'))
    result = {'updated': datetime.date.today().isoformat(), 'gtfsDate': gdate, 'tenders': {}}
    for tid, versions in load_route_data().items():
        makats = {}
        for v in versions:
            for r in v['routes']:
                mk = str(r['key'][0]).strip()
                if mk.isdigit():
                    makats[mk] = r['key'][1]
        lines = {}
        for mk in makats:
            t = today.get(mk)
            lines[mk] = {'today': bool(t), **({k: t[k] for k in ('operator', 'number', 'name', 'directions')} if t else {})}
        tc = (fields.get(tid, {}).get('identity.cluster') or {}).get('value')
        cname = match_cluster(tc, cluster_names) if tc else None
        # "חיפה עירוני מזרח" הוא חלק מאשכול "חיפה עירוני" של המשרד — קווי המערב
        # אינם "קווים שיבוטלו". הרשימה מוצגת רק כשהשם זהה (ולא חלק מאשכול).
        exact = bool(cname) and words(cname) == words(tc)
        not_in = []
        if cname and exact:
            for mk, cl in cluster_of.items():
                if cl == cname and mk not in makats and mk in today:
                    t = today[mk]
                    not_in.append([mk, t['number'], t['name'], t['operator']])
            not_in.sort(key=lambda x: (len(x[1]), x[1]))
        result['tenders'][tid] = {'lines': lines, 'clusterName': cname, 'clusterExact': exact, 'tenderCluster': tc, 'notInTender': not_in,
                                  'counts': {'inTender': len(lines), 'runningToday': sum(1 for l in lines.values() if l['today']),
                                             'notRunning': sum(1 for l in lines.values() if not l['today']), 'notInTender': len(not_in)}}
        print(tid, result['tenders'][tid]['counts'], 'אשכול:', tc, '→', cname, flush=True)
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    tmp.replace(OUT)


if __name__ == '__main__':
    main()
