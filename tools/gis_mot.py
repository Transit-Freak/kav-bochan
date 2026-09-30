#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GIS הקו הבוחן — שכבות משרד התחבורה מ-data.gov.il (רץ ב-GitHub Actions בלבד:
מהסביבה המקומית gov.il חסום).

שלמה 30.09: "תוסיף הכל" — כל מאגר של משרד התחבורה שיש לו גאומטריה.
1. package_search ‏fq=organization:ministry_of_transport — כל המאגרים.
2. לכל מאגר: משאבי ZIP/SHP/KMZ/KML/GeoJSON, או CSV עם עמודות קואורדינטות.
   XLSX / CSV בלי קואורדינטות — מדלגים ורושמים ביומן.
3. ogr2ogr: כל shapefile בתוך ה-ZIP הוא תת-שכבה → GeoJSON ב-EPSG:4326, דיוק 5 ספרות,
   פישוט מתון לקווים ולפוליגונים, כל השדות נשמרים. בלי ‎.prj ועם ערכים בטווח רשת
   ישראל החדשה — מניחים ITM ‏(EPSG:2039); אחרת — מדלגים (לא מנחשים).
4. קובץ מעל 15MB — מפשטים חזק יותר; אם עדיין גדול — מדלגים ורושמים.
5. הורדה שנכשלה — משאירים את הקובץ הקודם ואת הרשומה הקודמת בקטלוג.
הפלט: gis/data/mot/<name>[__<sub>].geojson ו-gis/data/catalog.json
"""
import csv
import datetime
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTD = os.path.join(ROOT, 'gis', 'data', 'mot')
CAT = os.path.join(ROOT, 'gis', 'data', 'catalog.json')
API = 'https://data.gov.il/api/3/action/'
UA = {'User-Agent': 'Mozilla/5.0 (kavbochan.app GIS)'}
MAXB = 15 * 1024 * 1024
# פישוט במעלות (אחרי ההמרה ל-4326): ~2 מ', ואז מדרגות חזקות יותר לקבצים גדולים
TOLS = [0.00002, 0.0001, 0.0003, 0.001]

FUTURE = re.compile(r'מתוכנ|עתיד|אסטרטג|תכני|תוכני|תמ"א|תמא|2030|2035|2040|2045|2050|מטרו(?!נית)|BRT|ישימות|workplan|'
                    r'depo|דיפו|strat|plan|metro(?!nit)|mataan|tma|2040|future|פרויקט', re.I)
TOPICS = [
    ('רכבת, רק"ל ומטרו', r'רכבת|רק"ל|רקל|מטרו|מטרונית|lrt|rail|metro|metronit|depo|דיפו|מסיל'),
    ('תחבורה ציבורית', r'אוטובוס|מסוף|תח"צ|תחצ|תחנ(?!ות רכבת)|נת"צ|נתצ|העדפה|חניון|חנה וסע|park|bus|nataz|tahaz|'
                       r'terminal|brt|אשכול|קו(?:ו)?ים|מתע"ן|מתען|mataan|תחבורה ציבורית|הסעה'),
    ('דרכים ונתיבים', r'דרך|דרכים|כביש|נתיב|מחלף|צומת|road|רמזור|מספור|גשר|מנהר'),
    ('אופניים', r'אופני|bike|cycl|שביל'),
    ('תאונות ובטיחות', r'תאונ|בטיחות|נפגע|accident|crash|אכיפה|מצלמ'),
    ('אוכלוסייה ותכנון', r'אוכלוסי|מרחב|תכנון|תמ"א|תמא|ייעוד|אזור|תעשי|תעסוק|industrial|ttl|מע"צ|workplan|תשתית'),
    ('תעופה', r'תעופה|שדה|נמל|airport|aviation|מנחת'),
]
# סדר התצוגה בעץ: תחבורה ציבורית קודם (שלמה 30.09), גם אם סדר הבדיקה שונה
TOPIC_ORDER = ['תחבורה ציבורית', 'רכבת, רק"ל ומטרו', 'דרכים ונתיבים', 'אופניים', 'תאונות ובטיחות', 'אוכלוסייה ותכנון', 'תעופה', 'אחר']


def get_json(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f'   ניסיון {i + 1} נכשל: {e}')
            time.sleep(5 * (i + 1))
    return None


_BR = {}


def _browser_ctx():
    """שרת ההורדות של data.gov.il מגיש לבקשות שאינן דפדפן דף JavaScript של הגנת-בוטים
    במקום הקובץ (כך נכשלו כל 167 ההורדות בריצה הראשונה, 30.09). כמו ב-fetch_mot_shapes.py:
    נכנסים פעם אחת לאתר בכרומיום, פותרים את האתגר, ומורידים עם אותו הקשר."""
    if 'ctx' in _BR:
        return _BR['ctx']
    _BR['ctx'] = None
    try:
        from playwright.sync_api import sync_playwright
        pw = sync_playwright().start()
        br = pw.chromium.launch(args=['--no-sandbox'])
        ctx = br.new_context(accept_downloads=True, locale='he-IL', user_agent=UA['User-Agent'])
        pg = ctx.new_page()
        pg.goto('https://data.gov.il/dataset/', wait_until='domcontentloaded', timeout=120000)
        pg.wait_for_timeout(8000)
        print('  דפדפן: האתר נטען —', (pg.title() or '(בלי כותרת)')[:60])
        _BR.update(pw=pw, br=br, ctx=ctx, page=pg)
    except Exception as e:  # noqa: BLE001
        print('  דפדפן לא זמין:', e)
    return _BR['ctx']


def _looks_ok(path, ext=''):
    with open(path, 'rb') as f:
        head = f.read(512)
    if not head or re.search(rb'<html|<!doctype|<script', head, re.I):
        return False
    if ext in ('.zip', '.kmz', '.gdb') and head[:2] != b'PK':
        return False
    return True


def _alt_hosts(url):
    """אותו קובץ בשני שרתי ההורדה (data.gov.il / e.data.gov.il) — כמו ב-fetch_mot_shapes.py"""
    out = [url]
    if '://e.data.gov.il/' in url:
        out.append(url.replace('://e.data.gov.il/', '://data.gov.il/'))
    elif '://data.gov.il/' in url:
        out.append(url.replace('://data.gov.il/', '://e.data.gov.il/'))
    return out


def download(url, dest, ds_name=None):
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    try:
        subprocess.run(['curl', '-fsSL', '--connect-timeout', '30', '--max-time', '900', '-A', UA['User-Agent'],
                        '-o', dest, url], check=True, capture_output=True)
        if os.path.getsize(dest) > 0 and _looks_ok(dest, ext):
            return True
        print('   curl קיבל דף HTML (הגנת בוטים) — מנסים בדפדפן')
    except Exception as e:  # noqa: BLE001
        print(f'   curl נכשל: {e}')
    ctx = _browser_ctx()
    if not ctx:
        return False
    # כניסה לעמוד הדאטהסט פעם אחת לכל מאגר, כדי שאתגר הגנת-הבוטים ייפתר גם לשרת ההורדות שלו
    if ds_name and ds_name not in _BR.setdefault('visited', set()):
        _BR['visited'].add(ds_name)
        try:
            pg = _BR['page']
            pg.goto(f'https://data.gov.il/dataset/{ds_name}', wait_until='domcontentloaded', timeout=120000)
            pg.wait_for_timeout(4000)
        except Exception as e:  # noqa: BLE001
            print('   עמוד הדאטהסט לא נטען:', e)
    for u in _alt_hosts(url):
        try:
            r = ctx.request.get(u, timeout=300000)
            body = r.body()
            if r.ok and body:
                open(dest, 'wb').write(body)
                if _looks_ok(dest, ext):
                    print(f'   ירד בדפדפן: {len(body)} bytes | {u}')
                    return True
            print(f'   דפדפן: סטטוס {r.status}, {len(body)} בתים — לא קובץ | {u}')
        except Exception as e:  # noqa: BLE001
            print(f'   דפדפן נכשל: {e}')
        try:   # נפילה לאחור: ניווט שמפעיל הורדת-קובץ בדפדפן
            pg = _BR['page']
            with pg.expect_download(timeout=60000) as dl:
                try:
                    pg.goto(u, timeout=60000)
                except Exception:  # noqa: BLE001
                    pass
            dl.value.save_as(dest)
            if _looks_ok(dest, ext):
                print(f'   ירד כהורדת-דפדפן: {os.path.getsize(dest)} bytes')
                return True
        except Exception as e:  # noqa: BLE001
            print(f'   הורדת-דפדפן נכשלה: {str(e)[:120]}')
    return False


def classify(name, title, notes=''):
    txt = f'{name} {title}'
    group = 'תכניות עתידיות' if FUTURE.search(txt) else 'מצב קיים'
    topic = 'אחר'
    for t, rx in TOPICS:
        if re.search(rx, txt, re.I):
            topic = t
            break
    return group, topic


def ogr_info(path):
    """רשימת שכבות וסוג גאומטריה לכל אחת (ogrinfo -so)."""
    try:
        out = subprocess.run(['ogrinfo', '-ro', '-q', '-so', path], capture_output=True, text=True, timeout=300).stdout
    except Exception:  # noqa: BLE001
        return []
    lays = []
    for line in out.splitlines():
        m = re.match(r'\s*\d+:\s*(.+?)\s*(?:\((.+)\))?\s*$', line)
        if m:
            lays.append((m.group(1), m.group(2) or ''))
    return lays


def dbf_encoding(shp):
    base = shp[:-4]
    for ext in ('.cpg', '.CPG'):
        if os.path.exists(base + ext):
            return open(base + ext, encoding='ascii', errors='ignore').read().strip() or None
    dbf = next((base + e for e in ('.dbf', '.DBF') if os.path.exists(base + e)), None)
    if not dbf:
        return None
    raw = open(dbf, 'rb').read()
    try:
        raw.decode('utf-8')
        return 'UTF-8'
    except UnicodeDecodeError:
        return 'CP1255'   # קבצי ממשלה ישנים בלי ‎.cpg — חלונות עברית


def looks_itm(path):
    """בלי ‎.prj: בודקים את התיבה החוסמת. ITM: ‏X‏ 100–300 אלף, Y‏ 350–800 אלף."""
    out = subprocess.run(['ogrinfo', '-ro', '-so', '-al', path], capture_output=True, text=True).stdout
    m = re.search(r'Extent:\s*\(([-\d.]+),\s*([-\d.]+)\)\s*-\s*\(([-\d.]+),\s*([-\d.]+)\)', out)
    if not m:
        return None
    x0, y0, x1, y1 = map(float, m.groups())
    if 100000 <= x0 <= 300000 and 350000 <= y0 <= 820000 and x1 <= 300000 and y1 <= 820000:
        return 'EPSG:2039'
    if 33 <= x0 <= 37 and 29 <= y0 <= 34:
        return 'EPSG:4326'
    return None


def convert(src, layer, dest, s_srs=None, enc=None):
    """מקור → GeoJSON‏ 4326 עם פישוט מדורג עד שהקובץ קטן מ-15MB. מחזיר (tol, bytes) או None."""
    tmp = dest + '.tmp.gpkg'
    env = dict(os.environ)
    if enc:
        env['SHAPE_ENCODING'] = enc
    cmd = ['ogr2ogr', '-f', 'GPKG', tmp, src, '-t_srs', 'EPSG:4326', '-nln', 'l', '-nlt', 'PROMOTE_TO_MULTI',
           '-skipfailures', '-makevalid']
    if s_srs:
        cmd += ['-s_srs', s_srs]
    if layer:
        cmd.append(layer)
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0 or not os.path.exists(tmp):
        # ‎-makevalid דורש GDAL חדש — ניסיון שני בלעדיו
        cmd = [c for c in cmd if c != '-makevalid']
        r = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if r.returncode != 0 or not os.path.exists(tmp):
            print('   ogr2ogr נכשל:', (r.stderr or '')[-300:])
            return None
    try:
        for tol in TOLS:
            if os.path.exists(dest):
                os.remove(dest)
            cmd = ['ogr2ogr', '-f', 'GeoJSON', dest, tmp, 'l', '-lco', 'COORDINATE_PRECISION=5', '-lco', 'RFC7946=YES',
                   '-simplify', str(tol)]
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0 or not os.path.exists(dest):
                print('   המרה ל-GeoJSON נכשלה:', (r.stderr or '')[-300:])
                return None
            sz = os.path.getsize(dest)
            if sz <= MAXB:
                return tol, sz
            print(f'   {sz // 1048576}MB עם פישוט {tol} — מפשטים יותר')
        os.remove(dest)
        return 'big', sz
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def geojson_stats(path):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    feats = d.get('features') or []
    types = {}
    fields = []
    for ft in feats:
        g = ft.get('geometry') or {}
        t = (g.get('type') or '').replace('Multi', '')
        if t:
            types[t] = types.get(t, 0) + 1
        for k in (ft.get('properties') or {}):
            if k not in fields:
                fields.append(k)
    geom = max(types, key=types.get) if types else None
    return len(feats), geom, fields, d


COORD_X = re.compile(r'^(lon|lng|long|longitude|x|x_itm|itm_x|coord_x|אורך|קו_אורך|נ\.צ\. ?x)$', re.I)
COORD_Y = re.compile(r'^(lat|latitude|y|y_itm|itm_y|coord_y|רוחב|קו_רוחב|נ\.צ\. ?y)$', re.I)


def csv_to_geojson(path, dest):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp1255'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        return None
    rows = list(csv.DictReader(text.splitlines()))
    if not rows:
        return None
    cols = list(rows[0].keys())
    cx = next((c for c in cols if c and COORD_X.match(c.strip())), None)
    cy = next((c for c in cols if c and COORD_Y.match(c.strip())), None)
    if not cx or not cy:
        return None
    pts = []
    for r in rows:
        try:
            pts.append((float(r[cx]), float(r[cy]), r))
        except (TypeError, ValueError):
            continue
    if not pts:
        return None
    xs = [p[0] for p in pts]
    if all(33 <= x <= 37 for x in xs):
        srs = 'EPSG:4326'
    elif all(100000 <= x <= 300000 for x in xs):
        srs = 'EPSG:2039'
    else:
        return None
    tmp = dest + '.src.csv'
    with open(tmp, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for _x, _y, r in pts:
            w.writerow(r)
    try:
        return _csv_convert(tmp, cx, cy, srs, dest)
    finally:
        os.remove(tmp)


def _csv_convert(tmp, cx, cy, srs, dest):
    vrt = dest + '.vrt'
    lname = os.path.splitext(os.path.basename(tmp))[0]
    with open(vrt, 'w', encoding='utf-8') as f:
        f.write(f'<OGRVRTDataSource><OGRVRTLayer name="{lname}"><SrcDataSource>{tmp}</SrcDataSource>'
                f'<GeometryType>wkbPoint</GeometryType><LayerSRS>{srs}</LayerSRS>'
                f'<GeometryField encoding="PointFromColumns" x="{cx}" y="{cy}"/></OGRVRTLayer></OGRVRTDataSource>')
    try:
        return convert(vrt, None, dest)
    finally:
        os.remove(vrt)


def safe(s):
    return re.sub(r'[^A-Za-z0-9_-]+', '_', s).strip('_')[:60] or 'layer'


def process_dataset(ds, work, prev):
    name, title = ds['name'], ds.get('title') or ds['name']
    group, topic = classify(name, title, ds.get('notes') or '')
    res = ds.get('resources') or []
    geo = [r for r in res if (r.get('format') or '').upper() in ('ZIP', 'SHP', 'KMZ', 'KML', 'GEOJSON', 'JSON', 'GDB')
           or re.search(r'\.(zip|kmz|kml|geojson|shp)(\?|$)', r.get('url') or '', re.I)]
    csvs = [r for r in res if (r.get('format') or '').upper() == 'CSV' or (r.get('url') or '').lower().endswith('.csv')]
    base = {'dataset': name, 'datasetTitle': title, 'group': group, 'topic': topic,
            'source': f'https://data.gov.il/dataset/{name}', 'modified': (ds.get('metadata_modified') or '')[:19]}
    out, why = [], None
    cands = geo or csvs
    if not cands:
        fm = sorted({(r.get('format') or '?').upper() for r in res})
        return [], f'אין משאב גאוגרפי ({",".join(fm) or "אין משאבים"})'
    for r in cands:
        url = r.get('url') or ''
        if not url:
            continue
        rtitle = r.get('name') or r.get('description') or ''
        ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or '.' + (r.get('format') or 'bin').lower()
        d = tempfile.mkdtemp(dir=work)
        f = os.path.join(d, 'src' + ext)
        print(f'  ↓ {url}')
        if not download(url, f, name):
            why = 'ההורדה נכשלה'
            continue
        srcs = []   # (path, layer, label)
        if zipfile.is_zipfile(f):
            try:
                zipfile.ZipFile(f).extractall(d)
            except Exception as e:  # noqa: BLE001
                why = f'ZIP פגום: {e}'
                continue
            for inner in glob.glob(os.path.join(d, '**', '*.zip'), recursive=True):
                if inner != f and zipfile.is_zipfile(inner):
                    zipfile.ZipFile(inner).extractall(os.path.dirname(inner))
            for shp in sorted(glob.glob(os.path.join(d, '**', '*.[sS][hH][pP]'), recursive=True)):
                srcs.append((shp, None, os.path.splitext(os.path.basename(shp))[0]))
            for k in sorted(glob.glob(os.path.join(d, '**', '*.km[lz]'), recursive=True)
                            + glob.glob(os.path.join(d, '**', '*.geojson'), recursive=True)):
                for lay, _t in ogr_info(k) or [(None, '')]:
                    srcs.append((k, lay, lay or os.path.splitext(os.path.basename(k))[0]))
            for gdb in glob.glob(os.path.join(d, '**', '*.gdb'), recursive=True):
                for lay, _t in ogr_info(gdb):
                    srcs.append((gdb, lay, lay))
            for c in sorted(glob.glob(os.path.join(d, '**', '*.csv'), recursive=True)):
                srcs.append((c, 'CSV', os.path.splitext(os.path.basename(c))[0]))
        elif ext in ('.csv',):
            srcs.append((f, 'CSV', rtitle or name))
        elif ext in ('.kml', '.kmz', '.geojson', '.json', '.shp'):
            for lay, _t in ogr_info(f) or [(None, '')]:
                srcs.append((f, lay, lay or rtitle or name))
        if not srcs:
            why = 'אין קובץ גאוגרפי בתוך המשאב'
            continue
        multi = len(srcs) > 1 or len(cands) > 1
        for path, lay, label in srcs:
            lid = safe(name) + ('__' + safe(label) if multi else '')
            dest = os.path.join(OUTD, lid + '.geojson')
            tmpdest = dest + '.new'
            if lay == 'CSV':
                rr = csv_to_geojson(path, tmpdest)
                if rr is None:
                    print(f'   {label}: CSV בלי עמודות קואורדינטות — מדלגים')
                    why = why or 'CSV בלי קואורדינטות'
                    continue
            else:
                s_srs, enc = None, None
                if path.lower().endswith('.shp'):
                    enc = dbf_encoding(path)
                    if not os.path.exists(path[:-4] + '.prj') and not os.path.exists(path[:-4] + '.PRJ'):
                        s_srs = looks_itm(path)
                        if not s_srs:
                            print(f'   {label}: אין ‎.prj והקואורדינטות לא מזוהות — מדלגים')
                            why = 'מערכת קואורדינטות לא ידועה'
                            continue
                        print(f'   {label}: אין ‎.prj — {s_srs} לפי טווח הקואורדינטות')
                rr = convert(path, lay, tmpdest, s_srs=s_srs, enc=enc)
            if rr is None:
                why = 'ההמרה נכשלה'
                continue
            if rr[0] == 'big':
                print(f'   {label}: עדיין מעל 15MB אחרי פישוט — מדלגים')
                why = 'גדול מדי גם אחרי פישוט'
                continue
            n, geom, fields, _d = geojson_stats(tmpdest)
            if not n or not geom:
                os.remove(tmpdest)
                why = 'אין ישויות עם גאומטריה'
                continue
            os.replace(tmpdest, dest)
            title_l = title if not multi else f'{title} — {label}'
            out.append(dict(base, id=lid, title=title_l, sub=label if multi else None, resource=rtitle,
                            url=url, geom=geom, count=n, fields=fields, file=f'mot/{lid}.geojson',
                            bytes=os.path.getsize(dest), simplify=rr[0]))
            print(f'   ✓ {lid}: {n} {geom}, {os.path.getsize(dest) // 1024} KB')
        shutil.rmtree(d, ignore_errors=True)
    if not out and why == 'ההורדה נכשלה':
        kept = [l for l in prev if l.get('dataset') == name and os.path.exists(os.path.join(ROOT, 'gis', 'data', l['file']))]
        if kept:
            print(f'   ההורדה נכשלה — משאירים {len(kept)} שכבות קודמות')
            return [dict(l, stale=True) for l in kept], None
    return out, (None if out else why)


def roads_compare(layers):
    """מספרי דרכים: roadnumbers מול roadnumber_tma. משווים רק אם יש שדה מזהה משותף
    שערכיו חופפים ברובם; אחרת — שתי השכבות זו לצד זו, בלי ניחוש."""
    a = [l for l in layers if l['dataset'] == 'roadnumbers']
    b = [l for l in layers if l['dataset'] == 'roadnumber_tma']
    if len(a) != 1 or len(b) != 1:
        print('  מספרי דרכים: אין בדיוק שכבה אחת לכל מאגר — אין השוואה')
        return None
    A = json.load(open(os.path.join(ROOT, 'gis', 'data', a[0]['file']), encoding='utf-8'))
    B = json.load(open(os.path.join(ROOT, 'gis', 'data', b[0]['file']), encoding='utf-8'))
    fa = set(a[0]['fields']); fb = set(b[0]['fields'])
    idc = [f for f in fa & fb if re.search(r'id|key|seg|code|קוד|מזהה', f, re.I)
           and not re.fullmatch(r'(?i)objectid|fid|shape_.*|oid', f)]
    numa = [f for f in fa if re.search(r'road|kvish|num|mispar|כביש|מספר|דרך', f, re.I) and f not in idc]
    numb = [f for f in fb if re.search(r'road|kvish|num|mispar|כביש|מספר|דרך|tma|תמא', f, re.I) and f not in idc]
    print(f'  מספרי דרכים: שדות משותפים מועמדים {idc} · מספר א {numa} · מספר ב {numb}')
    for key in idc:
        va = {}
        for ft in A['features']:
            v = (ft.get('properties') or {}).get(key)
            if v is not None:
                va.setdefault(v, ft)
        vb = {}
        for ft in B['features']:
            v = (ft.get('properties') or {}).get(key)
            if v is not None:
                vb.setdefault(v, ft)
        common = set(va) & set(vb)
        if not va or not vb or len(common) < 0.8 * min(len(va), len(vb)):
            print(f'   {key}: חפיפה {len(common)} — לא מספיק')
            continue
        if len(numa) != 1 or len(numb) != 1:
            print(f'   {key}: חופף, אבל שדה המספר לא חד-משמעי — אין השוואה')
            return None
        feats = []
        for k in common:
            x = (va[k]['properties'] or {}).get(numa[0]); y = (vb[k]['properties'] or {}).get(numb[0])
            if str(x).strip() != str(y).strip():
                feats.append({'type': 'Feature', 'geometry': va[k]['geometry'],
                              'properties': {key: k, 'מספר נוכחי': x, 'מספר בתמ"א': y}})
        lid = 'roadnumbers__diff'
        dest = os.path.join(OUTD, lid + '.geojson')
        json.dump({'type': 'FeatureCollection', 'features': feats}, open(dest, 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        print(f'   ✓ השוואה לפי {key}: {len(feats)} דרכים שמספרן שונה')
        return dict(a[0], id=lid, title='דרכים שמספרן בתמ"א שונה מהמספר הנוכחי', sub=None,
                    count=len(feats), fields=[key, 'מספר נוכחי', 'מספר בתמ"א'], file=f'mot/{lid}.geojson',
                    bytes=os.path.getsize(dest), derived=True)
    print('  מספרי דרכים: אין מזהה משותף אמין — מוצגות שתי השכבות זו לצד זו')
    return None


def main():
    os.makedirs(OUTD, exist_ok=True)
    try:
        prev = json.load(open(CAT, encoding='utf-8')).get('layers', [])
    except Exception:  # noqa: BLE001
        prev = []
    r = get_json(API + 'package_search?' + urllib.parse.urlencode(
        {'fq': 'organization:ministry_of_transport', 'rows': 1000}))
    if not r:
        print('!! package_search נכשל — הקטלוג הקודם נשאר')
        return 0
    dss = r['result']['results']
    extra = [n.strip() for n in os.environ.get('EXTRA', 'roadnumbers,roadnumber_tma,merhavironi,accid_taz,functional_areas').split(',') if n.strip()]
    have = {d['name'] for d in dss}
    for n in extra:
        if n not in have:
            x = get_json(API + 'package_show?id=' + n)
            if x and x.get('success'):
                dss.append(x['result'])
    only = os.environ.get('ONLY')
    if only:
        dss = [d for d in dss if d['name'] in only.split(',')]
    print(f'== {len(dss)} מאגרים')
    layers, skipped = [], []
    work = tempfile.mkdtemp()
    for ds in sorted(dss, key=lambda d: d['name']):
        print(f'\n# {ds["name"]} — {ds.get("title")}')
        try:
            got, why = process_dataset(ds, work, prev)
        except Exception as e:  # noqa: BLE001
            got, why = [], f'שגיאה: {e}'
            kept = [l for l in prev if l.get('dataset') == ds['name']]
            got = [dict(l, stale=True) for l in kept if os.path.exists(os.path.join(ROOT, 'gis', 'data', l['file']))]
        layers.extend(got)
        if why and not got:
            skipped.append({'dataset': ds['name'], 'title': ds.get('title'), 'reason': why})
            print(f'  ✗ דילוג: {why}')
    shutil.rmtree(work, ignore_errors=True)
    rc = roads_compare(layers)
    if rc:
        layers.append(rc)
    keep = {os.path.basename(l['file']) for l in layers}
    for f in glob.glob(os.path.join(OUTD, '*.geojson')):
        if os.path.basename(f) not in keep:
            os.remove(f)
    for f in glob.glob(os.path.join(OUTD, '*.new')) + glob.glob(os.path.join(OUTD, '*.gpkg')):
        os.remove(f)
    layers.sort(key=lambda l: (l['group'] != 'מצב קיים', TOPIC_ORDER.index(l['topic']), l['title']))
    if not layers and prev:
        # ריצה בלי אף שכבה (הורדות חסומות) לא מוחקת את הקטלוג הקודם
        print('!! 0 שכבות — הקטלוג הקודם נשאר; הריצה תסומן כנכשלת')
        return 1
    cat = {'updated': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'),
           'source': 'data.gov.il — משרד התחבורה', 'topics': TOPIC_ORDER, 'layers': layers, 'skipped': skipped}
    json.dump(cat, open(CAT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n================ סיכום ================')
    print(f'שכבות: {len(layers)} · מאגרים שדולגו: {len(skipped)}')
    tot = 0
    for l in layers:
        tot += l.get('bytes', 0)
        print(f"  [{l['group']} / {l['topic']}] {l['id']}: {l['count']} {l['geom']}, {l.get('bytes', 0) // 1024} KB"
              f"{' (ישן)' if l.get('stale') else ''}")
    print(f'  סך הכול {tot // 1048576} MB')
    for s in skipped:
        print(f"  ✗ {s['dataset']}: {s['reason']}")
    if not layers:
        print('!! 0 שכבות — הריצה תסומן כנכשלת')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
