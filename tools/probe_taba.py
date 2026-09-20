#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ניסיון (שלמה 20.09): האם תב"ע של מסילות (תת"ל) זמינה כנתונים שאפשר לקרוא —
מנהרות, חתכים, גשרים עם קילומטראז'. רץ ב-Actions (מהסביבה של קלוד האתרים חסומים).
מדפיס ליומן מה נמצא; לא כותב קבצים למאגר."""
import io
import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36', 'Accept': '*/*'}


def get(url, data=None, headers=None, timeout=90):
    h = dict(UA)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get('content-type', ''), r.read()


def step(title):
    print('\n' + '=' * 70 + '\n' + title + '\n' + '=' * 70, flush=True)


# ---------------------------------------------------------------- 1. ArcGIS ציבורי של מנהל התכנון
step('1. שכבות ה-GIS הציבוריות של מנהל התכנון (ags.iplan.gov.il)')
BASE = 'https://ags.iplan.gov.il/arcgisiplan/rest/services'
svc_layers = {}
try:
    st, ct, body = get(BASE + '?f=json')
    j = json.loads(body)
    names = [s['name'] for s in j.get('services', [])] + j.get('folders', [])
    print('שירותים:', names[:40])
    for folder in j.get('folders', []):
        try:
            st, ct, b2 = get(f'{BASE}/{folder}?f=json')
            j2 = json.loads(b2)
            for s in j2.get('services', []):
                names.append(s['name'])
        except Exception as ex:  # noqa: BLE001
            print('  תיקייה', folder, 'נכשלה:', repr(ex)[:100])
    print('כל השירותים:', names)
    # שירותים שנשמעים רלוונטיים: תוכניות / xplan
    for sname in names:
        if not re.search(r'plan|Plan|tochnit|Xplan', sname):
            continue
        try:
            st, ct, b3 = get(f'{BASE}/{sname}/MapServer?f=json')
            j3 = json.loads(b3)
            lays = [(l['id'], l['name']) for l in j3.get('layers', [])]
            svc_layers[sname] = lays
            print(f'  {sname}: {len(lays)} שכבות: {lays[:25]}')
        except Exception as ex:  # noqa: BLE001
            print(f'  {sname}: נכשל {repr(ex)[:100]}')
except Exception as ex:  # noqa: BLE001
    print('ArcGIS נכשל:', repr(ex)[:200])

# חיפוש תת"ל של מסילות בשכבת התוכניות
step('2. חיפוש תוכניות תת"ל של מסילות רכבת בשכבת התוכניות')
found_plans = []
for sname, lays in svc_layers.items():
    for lid, lname in lays:
        if not re.search(r'תכנית|תוכנית|plan', lname, re.I):
            continue
        try:
            st, ct, b = get(f'{BASE}/{sname}/MapServer/{lid}?f=json')
            fields = [f['name'] for f in json.loads(b).get('fields', [])]
            print(f'  שכבה {sname}/{lid} "{lname}": שדות {fields[:30]}')
            numf = next((f for f in fields if re.search(r'pl_number|plan_number|number|מספר', f, re.I)), None)
            namef = next((f for f in fields if re.search(r'pl_name|plan_name|name|שם', f, re.I)), None)
            if not numf:
                continue
            where = f"{numf} LIKE 'תתל%' OR {numf} LIKE 'תת\"ל%'"
            q = urllib.parse.urlencode({'where': where, 'outFields': '*', 'returnGeometry': 'false', 'f': 'json', 'resultRecordCount': 200})
            st, ct, b = get(f'{BASE}/{sname}/MapServer/{lid}/query?{q}')
            feats = json.loads(b).get('features', [])
            rail = [f['attributes'] for f in feats if re.search(r'רכבת|מסילה|מסילת', json.dumps(f['attributes'], ensure_ascii=False))]
            print(f'    תת"ל: {len(feats)} · מהן רכבת: {len(rail)}')
            for a in rail[:40]:
                print('     ', a.get(numf), '|', (a.get(namef) or '')[:70], '|', {k: v for k, v in a.items() if re.search(r'url|link|mavat|status|מצב', k, re.I)})
            found_plans += rail
        except Exception as ex:  # noqa: BLE001
            print(f'  שכבה {lid} נכשלה: {repr(ex)[:150]}')

# ---------------------------------------------------------------- 3. מב"ת (תכנון זמין) — מסמכי תוכנית
step('3. מב"ת (mavat.iplan.gov.il): חיפוש תוכנית ומסמכיה')
mavat_docs = []
for probe in [
    ('POST SV3', 'https://mavat.iplan.gov.il/rest/api/SV3/1', json.dumps({'searchEntity': 1, 'planNumber': 'תתל/ 22', 'gushNumber': '', 'chelkaNumber': '', 'planStatus': ''}).encode(), {'Content-Type': 'application/json'}),
    ('GET SV3 q', 'https://mavat.iplan.gov.il/rest/api/SV3/1?planNumber=' + urllib.parse.quote('תתל/ 22'), None, None),
    ('GET search', 'https://mavat.iplan.gov.il/rest/api/Attacments/?eid=&pn=' + urllib.parse.quote('תתל/ 22'), None, None),
]:
    try:
        st, ct, b = get(probe[1], probe[2], probe[3])
        txt = b.decode('utf-8', 'replace')
        print(f'  {probe[0]}: {st} {ct[:40]} · {len(b)} בתים · {txt[:400]!r}')
    except Exception as ex:  # noqa: BLE001
        print(f'  {probe[0]}: נכשל {repr(ex)[:160]}')

# ---------------------------------------------------------------- 4. חיפוש קובץ מסמכים של תת"ל רכבת דרך גוגל של gov.il? — לא זמין; במקום: data.gov.il
step('4. data.gov.il: מאגרים של מנהל התכנון / רכבת ישראל / תשתיות מסילה')
for q in ('תת"ל רכבת', 'מנהל התכנון תוכניות', 'רכבת ישראל מסילה', 'מנהרות', 'תשתית לאומית'):
    try:
        st, ct, b = get('https://data.gov.il/api/3/action/package_search?' + urllib.parse.urlencode({'q': q, 'rows': 15}))
        res = json.loads(b)['result']['results']
        print(f'  "{q}": {len(res)}')
        for p in res[:15]:
            print('     -', p.get('title'), '|', (p.get('organization') or {}).get('title'), '|', [(r.get('format'), (r.get('name') or '')[:40]) for r in p.get('resources', [])][:4])
    except Exception as ex:  # noqa: BLE001
        print(f'  "{q}": נכשל {repr(ex)[:120]}')

# ---------------------------------------------------------------- 5. ניסיון להוריד נספח אחד (אם נמצא קישור) ולחלץ טקסט
step('5. חילוץ טקסט מנספח (אם נמצא קישור למסמך)')
links = []
for a in found_plans:
    for k, v in a.items():
        if isinstance(v, str) and v.startswith('http'):
            links.append((a.get('pl_number') or a.get('PL_NUMBER') or '', v))
print('קישורים שנמצאו:', links[:10])
for num, url in links[:3]:
    try:
        st, ct, b = get(url, timeout=120)
        print(f'  {num} {url}: {st} {ct[:50]} {len(b)} בתים')
        if 'pdf' in ct.lower() or b[:4] == b'%PDF':
            try:
                import subprocess, tempfile, os
                with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
                    f.write(b)
                out = subprocess.run(['pdftotext', '-layout', f.name, '-'], capture_output=True, text=True, timeout=120).stdout
                hits = [ln.strip() for ln in out.splitlines() if re.search(r'מנהר|חתך|גשר|ק"מ|קמ\'|ק״מ', ln)]
                print(f'    טקסט: {len(out)} תווים · שורות עם מנהרה/חתך/גשר/ק"מ: {len(hits)}')
                for h in hits[:30]:
                    print('      ', h[:140])
                os.unlink(f.name)
            except Exception as ex:  # noqa: BLE001
                print('    pdftotext נכשל:', repr(ex)[:120])
        else:
            print('    לא PDF:', b[:300].decode('utf-8', 'replace'))
    except Exception as ex:  # noqa: BLE001
        print(f'  {url}: נכשל {repr(ex)[:150]}')
print('\nסיום הניסיון')
