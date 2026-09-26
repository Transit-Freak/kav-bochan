#!/usr/bin/env python3
# רחוב לכל תחנה לפי הכתובת שלה ב-GTFS (stop_desc: "רחוב: X עיר: Y רציף: Z"),
# ולא לפי שם התחנה — לתיאורי החלופות (דרך רחוב…). מפתח: stop_code (שלמה 26.09)
import csv, json, os, re, sys
src = sys.argv[1] if len(sys.argv) > 1 else 'stops.txt'
out = os.path.join(os.environ.get('OUTDIR', 'line-history/data'), 'stop-streets.json')
rows = csv.DictReader(open(src, encoding='utf-8-sig'))
m = {}
for r in rows:
    s = re.search(r'רחוב:\s*(.*?)\s*עיר:', r.get('stop_desc') or '')
    st = s.group(1).strip() if s else ''
    st = re.sub(r'\s+\d+[א-ת]?$', '', st).strip()   # בלי מספר בית
    if st and not st.isdigit() and r.get('stop_code'):
        m[r['stop_code']] = st
if len(m) > 1000:
    json.dump(m, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
print('רחובות תחנות:', len(m))
