#!/usr/bin/env python3
# קוד תחנה בארכיון רכבת פתוחה (2013–2014) → מיקום התחנה מ-stops.txt של GTFS, לפי שם.
# שינויי שם ודאיים בלבד ברשימה; נקודות תפעוליות (צמתים, "תפעולי") ותחנות שנסגרו — בלי מיקום.
import csv, gzip, glob, json, re, sys
S = sys.argv[1]
ALIAS = {'אשדוד עד הלום': 'אשדוד עד הלום- מטרופול', 'בת ים יוספטל': 'בת ים אלי כהן - יוספטל',
         'תא אוניברסיטה': 'תל אביב האוניברסיטה - אקספו', 'רשל"צ דרום': "רשל''צ משה דיין",
         'לב המפרץ': 'מרכזית המפרץ'}
norm = lambda s: re.sub(r'[\s\-"\'״׳.]', '', s)
g = {}
for r in csv.DictReader(open(S, encoding='utf-8-sig')):
    if r['stop_code'].startswith('17') and len(r['stop_code']) == 5:
        g.setdefault(norm(r['stop_name']), (round(float(r['stop_lat']), 6), round(float(r['stop_lon']), 6)))
names = {}
for f in glob.glob('line-history/data/early-rail/*.json.gz'):
    for row in json.load(gzip.open(f))['rows']:
        names[row[2]] = row[1]
out = {}
for c, n in names.items():
    p = g.get(norm(ALIAS.get(n.strip(), n)))
    if p: out[c] = [n.strip(), p[0], p[1]]
json.dump(out, open('line-history/data/early-rail/stations.json', 'w'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
print(len(out), 'מתוך', len(names))
