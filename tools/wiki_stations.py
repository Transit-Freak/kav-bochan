#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ויקי-בודק — נתוני אמת על תחנות מרכזיות ומסופים.

לעורכי ויקיפדיה: לכל תחנה מרכזית/מסוף נבנית רשימת *כל* הקווים שעוצרים
בה — לא רק אלה שמתחילים/מסתיימים בה — מתוך קובץ ה-GTFS המלא של משרד
התחבורה (stops + trips + stop_times). לכל קו: מפעיל, יעדים (קצות
המסלול) והרציף שבו הוא עוצר בתחנה (מתוך stop_desc).

הקובץ המלא גדול (מאות MB) ולכן ההורדה והעיבוד רצים ב-GitHub Actions.
הפלט: wiki-check/data/stations.json
{updated, stations:{"שם": {city, lines:[[קו, מפעיל, [יעדים], רציף, term, רחובות, נגישות, סימונים,
 thru=[מוצא, רחובות לפני, רחובות אחרי, יעד] כשהתחנה באמצע המסלול]]}}}
term=1 אם הקו מתחיל/מסתיים בתחנה.
"""
import csv
import datetime
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

S3 = ('https://openbus-stride-public.s3.eu-west-1.amazonaws.com'
      '/gtfs_archive/{y}/{m}/{d}/israel-public-transportation.zip')
OUT = os.environ.get('OUT', 'wiki-check/data/stations.json')
ZIP = os.environ.get('GTFS_ZIP', '/tmp/gtfs.zip')
SUFFIX = re.compile(r'(-\d+[א-ת]?#?\s*)+$')
STATION_WORDS = ('מרכזית', 'מסוף')
ABBR = {"ראשל''צ": 'ראשון לציון', 'ראשל"צ': 'ראשון לציון', "כפ''ס": 'כפר סבא', 'כפ"ס': 'כפר סבא',
        "ק''ש": 'קריית שמונה', 'ק"ש': 'קריית שמונה', "ת''א": 'תל אביב', 'ת"א': 'תל אביב',
        "ב''ש": 'באר שבע', 'ב"ש': 'באר שבע', "פ''ת": 'פתח תקווה', 'פ"ת': 'פתח תקווה',
        "ר''ג": 'רמת גן', 'ר"ג': 'רמת גן', "ב''ב": 'בני ברק', 'ב"ב': 'בני ברק'}
CITY_RE = re.compile(r'עיר:\s*(.+?)\s*(?:רציף:|קומה:|$)')
PLAT_RE = re.compile(r'רציף:\s*([^\s:]+)')
STREET_RE = re.compile(r'רחוב:\s*(.+?)\s*עיר:')
# מקומות מרכזיים שיש להם ערכים עם רשימות קווים — לפי מילים בשם התחנה
PLACE_WORDS = ('אוניברסיט', 'בית חולים', 'ביה"ח', "בי''ח", 'מרכז רפואי', 'קניון',
               'מכללת', 'ת. רכבת', 'ת.רכבת', 'תחנת רכבת', 'טרמינל', 'נמל', 'קריית הממשלה')
MIN_LINES = {'station': 5, 'street': 30, 'place': 6}


def station_key(stop_name):
    """שם התחנה בלי רציף/הורדה/קומה, עם איחוד שמות של אותו מתחם."""
    base = stop_name.split('/')[0].strip()
    base = re.sub(r'\s*קומה\s*\d+\s*$', '', base)
    base = re.sub(r'\s+', ' ', base).strip()
    base = re.sub(r'^ת\.\s*מרכזית', 'ת. מרכזית', base)   # איחוד "ת.מרכזית"/"ת. מרכזית"
    base = re.sub(r'^תחנה מרכזית\b', 'ת. מרכזית', base)
    # "מסוף קסטינה-מלאכי לדרום"/"לצפון"/"ת. מרכזית אשקלון רציפים" — אותו מתחם,
    # ערך אחד בוויקיפדיה; בלי האיחוד הקווים מהרציפים האחרים נראו "שגויים" (שלמה 18.09)
    while True:
        b2 = re.sub(r'\s+(לדרום|לצפון|למזרח|למערב|רציפים|רציף|הורדה|איסוף|עליה|עלייה|בינעירוני|עירוני|עירוניים|אזורי)$', '', base)
        if b2 == base:
            break
        base = b2
    # קיצורי ערים בשמות תחנות — כדי שראשל''צ וראשון לציון יהיו אותה תחנה
    for ab, full in ABBR.items():
        base = base.replace(ab, full)
    if 'סבידור' in base or base in ('תל אביב מרכז', 'מסוף 2000'):
        return 'מסוף ארלוזורוב (סבידור)'
    base = re.sub(r'\bקרית\b', 'קריית', base)          # קרית שרת / קריית שרת — אותו מסוף
    if 'סולט' in base and 'סולימאן' in base:               # מסוף סולטאן סולימאן = ת. מרכזית סולטן סולימאן
        return 'ת. מרכזית סולטן סולימאן'
    return base


def download():
    if os.path.exists(ZIP) and os.path.getsize(ZIP) > 10 ** 8:
        return
    day = datetime.date.today() - datetime.timedelta(days=1)
    url = S3.format(y=day.year, m=f'{day.month:02d}', d=f'{day.day:02d}')
    print(f'מוריד GTFS מלא: {url}', flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'kav-bochan-wiki/1.0'})
    with urllib.request.urlopen(req, timeout=600) as r, open(ZIP, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    print(f'הורד: {os.path.getsize(ZIP) / 1e6:.0f}MB', flush=True)


def reader(zf, member):
    return csv.DictReader(io.TextIOWrapper(zf.open(member), encoding='utf-8-sig'))


def endpoint_cities(long_name):
    """קצות המסלול מתוך route_long_name → [(תחנה, עיר), ...]"""
    out = []
    for side in (long_name or '').split('<->'):
        side = SUFFIX.sub('', side).strip()
        if '-' in side:
            stop, city = side.rsplit('-', 1)
            out.append((stop.strip(), city.strip()))
    return out


def main():
    download()
    zf = zipfile.ZipFile(ZIP)

    # 1. קבוצות מתוך stops.txt: תחנות מרכזיות/מסופים, רחובות, מקומות מרכזיים.
    #    לכל עצירה: רשימת (מפתח קבוצה, סוג, שם, עיר, רציף)
    stop_groups = {}
    gpos = {}          # מפתח קבוצה → נקודות התחנות (למרכז המתחם — שידוך לערך לפי קואורדינטות)
    # שיוך ידני מק"ט→מתחם (wiki-check/data/stop-groups.json): תחנת רחוב שהיא
    # בפועל רציף של המסוף (שלמה 18.09: מסוף אגד דימונה = תחנה 12612)
    manual = {}
    mp = os.path.join(os.path.dirname(OUT), 'stop-groups.json')
    if os.path.exists(mp):
        with open(mp, encoding='utf-8') as f:
            manual = {k: v for k, v in json.load(f).items() if not k.startswith('_')}
    stop_street = {}   # stop_id → (רחוב, עיר) — למסלול הרחובות של כל קו
    stop_places = {}   # stop_id → חלקי שם התחנה
    for r in reader(zf, 'stops.txt'):
        name = (r.get('stop_name') or '').strip()
        desc = r.get('stop_desc') or ''
        mc = CITY_RE.search(desc)
        city = re.sub(r'\bקרית\b', 'קריית', mc.group(1).strip()) if mc else ''   # קרית גת = קריית גת
        ms0 = STREET_RE.search(desc)
        st0 = re.sub(r'\s+\d+[א-ת]?$', '', ms0.group(1).strip()) if ms0 else ''   # בלי מספר בית
        if st0 and city and len(st0) > 1 and not st0[0].isdigit():
            stop_street[r['stop_id']] = (st0, city)
        # חלקי שם התחנה ("מרכז רפואי מאיר/ויצמן") — מקומות שמותר לכתוב בתא המסלול
        parts = [x.strip() for x in name.split('/') if len(x.strip()) > 2]
        if parts:
            stop_places[r['stop_id']] = parts
        mp = PLAT_RE.search(desc)
        plat = (mp.group(1).strip() if mp else '')
        if plat in ('0', 'None', 'ם') or plat.startswith('קומה'):
            plat = ''
        # "רציף" בטבלאות ויקיפדיה (שלמה 18.09, סבידור וכרמיאל): קו שעוצר ברחוב ליד
        # המסוף ולא ברציף — כותבים את הרחוב ("רחוב דרור", "דרך נמיר 3"); רציפים
        # בקבוצה עם אות ("רציפים B") מקבלים את האות ("B2"); "רציפים" רגיל — המספר בלבד
        suf = name.split('/')[1].strip() if '/' in name else ''
        if suf and not re.match(r'^(הורדה|איסוף|עליה|עלייה|חנה וסע)$', suf):
            mg = re.match(r'^רציפים?\s*([A-Za-z])$', suf)
            if mg:
                plat = (mg.group(1).upper() + plat) if plat else ''
            elif not suf.startswith('רציפ'):
                street = suf if re.match(r'^(רחוב|דרך|שד|שדרות|גשר|כיכר|מסוף|חניון|מרכז|קניון|בי)', suf) else 'רחוב ' + suf
                plat = f'{street} {plat}' if plat else street
        groups = []
        # רציף הורדה אינו רציף היציאה — בוויקיפדיה כותבים מאיפה הקו יוצא (שלמה 18.09)
        if 'הורדה' in name:
            plat = ''
        code = (r.get('stop_code') or '').strip()
        if code in manual:
            lab = re.sub(r'\s*\(.*?\)\s*$', '', manual[code])
            groups.append((f'S|{lab}|{city}', 'station', lab, city, plat))
        base = station_key(name)
        if any(w in base for w in STATION_WORDS):
            if base in ('תחנה מרכזית', 'ת. מרכזית', 'ת.מרכזית', 'מרכזית') and city:
                base = f'ת. מרכזית {city}'
            if base == 'מסוף' and city:                     # "מסוף" סתמי — המסוף של העיר
                base = f'מסוף {city}'
            if base == 'מסוף ארלוזורוב (סבידור)':
                city = 'תל אביב יפו'
            groups.append((f'S|{base}|{city}', 'station', base, city, plat))
        # רחובות ומקומות מרכזיים הוסרו (שלמה 18.09: "ביקשתי רק מסופים ותחנות
        # מרכזיות שרשומות בוויקיפדיה") — הכלי עוסק בקטגוריה הזו בלבד.
        if groups:
            stop_groups[r['stop_id']] = groups
            try:
                la, lo = float(r['stop_lat']), float(r['stop_lon'])
                for gk, *_ in groups:
                    gpos.setdefault(gk, []).append((la, lo))
            except (KeyError, ValueError, TypeError):
                pass
    print(f'stops: {len(stop_groups)} עצירות בקבוצות', flush=True)

    # 2. routes + agency
    agency = {r['agency_id']: (r.get('agency_name') or '').strip()
              for r in reader(zf, 'agency.txt')}
    routes = {}
    route_makat = {}
    for r in reader(zf, 'routes.txt'):
        routes[r['route_id']] = (
            (r.get('route_short_name') or '').strip(),
            agency.get(r.get('agency_id'), ''),
            r.get('route_long_name') or '')
        route_makat[r['route_id']] = (r.get('route_desc') or '').split('-')[0].strip()
    # סימוני ויקיפדיה מהנתונים שכבר יש לנו (שלמה 18.09): מארכיון "הקו בזמן" —
    # תקן הרכב מרישום המשרד (🛡️ "ממוגן ירי"), שירות לפי דרישה (💺, route_type 715)
    # וקווים מזינים (🚆, מקובץ המשרד "ייחודיות")
    flags = {'arm': set(), 'demand': set(), 'feed': set()}
    lh = os.path.join(os.path.dirname(os.path.dirname(OUT)), '..', 'line-history', 'data', 'lines.json')
    lh = os.path.normpath(lh)
    if os.path.exists(lh):
        with open(lh, encoding='utf-8') as f:
            for l in json.load(f).get('lines', []):
                mk = str(l.get('rd', '')).split('-')[0]
                if 'ממוגן ירי' in (l.get('vt') or ''):
                    flags['arm'].add(mk)
                if l.get('tt') == 'demand':
                    flags['demand'].add(mk)
                if l.get('un') == 'קווים מזינים':
                    flags['feed'].add(mk)
        print(f"סימונים מהארכיון: ממוגן ירי {len(flags['arm'])} · לפי דרישה {len(flags['demand'])} · מזינים {len(flags['feed'])}", flush=True)

    # 3. trips: trip_id → route_id
    trip_route = {}
    route_acc = {}      # route_id → [נסיעות נגישות, נסיעות סה"כ] (wheelchair_accessible: 1 = נגיש)
    for r in reader(zf, 'trips.txt'):
        trip_route[r['trip_id']] = r['route_id']
        a = route_acc.setdefault(r['route_id'], [0, 0])
        a[1] += 1
        if (r.get('wheelchair_accessible') or '').strip() == '1':
            a[0] += 1
    print(f'trips: {len(trip_route)}', flush=True)

    # 4. stop_times — סריקה אחת: אילו מסלולים עוצרים בכל קבוצה ובאיזה רציף
    hits = {}          # (route_id, group_key) → set(רציפים)
    meta = {}          # group_key → (kind, name, city)
    n = 0
    route_streets = {}   # route_id → {(רחוב, עיר): stop_sequence הראשון} לפי סדר ההופעה
    hit_seq = {}         # (route_id, קבוצה) → stop_sequence של התחנה במסלול (לפיצול "לפני/אחרי")
    dep_plats = {}       # (route_id, קבוצה) → רציפי היציאה (התחנה הראשונה בנסיעה)
    route_places = {}    # route_id → חלקי שמות התחנות במסלול
    for r in reader(zf, 'stop_times.txt'):
        n += 1
        sid = r['stop_id']
        ss = stop_street.get(sid)
        rid0 = trip_route.get(r['trip_id'])
        try:
            seq = int(r.get('stop_sequence') or 0)
        except ValueError:
            seq = 0
        if ss is not None and rid0 is not None:
            rs = route_streets.get(rid0)
            if rs is None:
                rs = route_streets[rid0] = {}
            if ss not in rs or seq < rs[ss]:
                rs[ss] = seq
        pp = stop_places.get(sid)
        if pp is not None and rid0 is not None:
            rp = route_places.get(rid0)
            if rp is None:
                rp = route_places[rid0] = set()
            rp.update(pp)
        gs = stop_groups.get(sid)
        if gs is None:
            continue
        rid = trip_route.get(r['trip_id'])
        if rid is None:
            continue
        first = seq == 1   # תחנת המוצא של הנסיעה
        for gk, kind, name, city, plat in gs:
            meta[gk] = (kind, name, city)
            if seq and (rid, gk) not in hit_seq or (seq and seq < hit_seq.get((rid, gk), 10 ** 9)):
                hit_seq[(rid, gk)] = seq
            st = hits.get((rid, gk))
            if st is None:
                st = hits[(rid, gk)] = set()
            if plat:
                st.add(plat)
                if first:
                    dep_plats.setdefault((rid, gk), set()).add(plat)
    print(f'stop_times: {n} שורות · {len(hits)} צירופי קו-קבוצה', flush=True)

    # 5. קיבוץ
    stations = {}
    for (rid, gk), plats in hits.items():
        short, op, long_name = routes.get(rid, ('', '', ''))
        if not short:
            continue
        kind, base, city = meta[gk]
        st = stations.setdefault(gk, {'kind': kind, 'name': base, 'city': city, 'lines': {}, 'pos': gpos.get(gk, [])})
        ends = endpoint_cities(long_name)
        term = kind == 'station' and any(station_key(e[0]) == base for e in ends)
        dests = set()
        for stop, ecity in ends:
            if kind == 'station' and station_key(stop) == base:
                continue
            dests.add(ecity if ecity != city else station_key(stop))
        lk = f'{short}|{op}'
        ent = st['lines'].setdefault(
            lk, {'line': short, 'op': op, 'dests': set(), 'plats': set(),
                 'term': False})
        ent['dests'] |= dests
        # רציף היציאה עדיף על כל רציף אחר (הורדה/מעבר): כמו בערכי ויקיפדיה
        dp = dep_plats.get((rid, gk))
        if dp:
            ent.setdefault('dep', set()).update(dp)
        ent['plats'] |= plats
        ent['term'] = ent['term'] or term
        ent.setdefault('rids', set()).add(rid)
        # רציף לכל כיוון (שלמה 20.09: "לכיוון … עוצר ברציף …"): היעד של הכיוון והרציפים בו
        if len(ends) == 2 and plats:
            dlab = ends[1][1] if ends[1][1] != city else station_key(ends[1][0])
            ent.setdefault('dirs', {}).setdefault(dlab, set()).update(dp or plats)
        # מסלול עובר (התחנה באמצע): מוצא ← רחובות לפני ← התחנה ← רחובות אחרי ← יעד
        # (שלמה 20.09: "מראה רק מהתחנה המרכזית עד לתחנה האחרונה ולא מה שהיה לפני")
        sq = hit_seq.get((rid, gk))
        if not term and sq and len(ends) == 2 and 'thru' not in ent:
            rs = route_streets.get(rid, {})
            before = [list(k) for k, v in sorted(rs.items(), key=lambda kv: kv[1]) if v < sq]
            after = [list(k) for k, v in sorted(rs.items(), key=lambda kv: kv[1]) if v > sq]
            lab = lambda e: e[1] if e[1] != city else station_key(e[0])
            ent['thru'] = [lab(ends[0]), before, after, lab(ends[1])]

    def plat_sort(p):
        m = re.match(r'\d+', p)
        return (int(m.group()) if m else 10 ** 6, p)

    def plat_join(ps):
        # "דרך נמיר" לצד "דרך נמיר 3" — הכללי מיותר כשיש רציף ממוספר באותו רחוב
        ps = [p for p in ps if not any(q != p and q.startswith(p + ' ') for q in ps)]
        ps = sorted(ps, key=plat_sort)[:3]
        # מספרים בלבד — "1/3"; עם שם רחוב — "רחוב דרור · 2" (לוכסן היה נקרא כחלק מהשם)
        return '/'.join(ps) if all(re.fullmatch(r'[A-Z]?\d+[א-ת]?', p) for p in ps) else ' · '.join(ps)

    def linekey(x):
        m = re.match(r'\d+', x['line'])
        return (int(m.group()) if m else 10 ** 6, x['line'], x['op'])

    from collections import Counter
    names = Counter((st['kind'], st['name']) for st in stations.values())

    def streets_of(rids):
        """רחובות המסלול של הקו בתחנה הזו — מהמסלולים שבאמת עוצרים בה, לפי סדר, בלי כפילויות."""
        seen = {}
        for rid in rids:
            for k in route_streets.get(rid, {}):
                if k not in seen:
                    seen[k] = None
        return [[a, b] for a, b in seen]

    def places_of(rids):
        out = set()
        for rid in rids:
            out |= route_places.get(rid, set())
        return sorted(out)

    def flags_of(rids):
        """[ממוגן ירי, לפי דרישה/הזמנה מראש, מזין] — 1/0 לפי המק"טים של המסלולים."""
        mks = {route_makat.get(rid, '') for rid in rids}
        return [1 if mks & flags['arm'] else 0, 1 if mks & flags['demand'] else 0, 1 if mks & flags['feed'] else 0]

    def acc_of(rids):
        """נגישות הקו בתחנה: 1 = כל הנסיעות נגישות, 0 = אף אחת, 2 = חלקית."""
        ok = tot = 0
        for rid in rids:
            a = route_acc.get(rid)
            if a:
                ok += a[0]; tot += a[1]
        if not tot:
            return None
        return 1 if ok == tot else 0 if ok == 0 else 2
    out_st = {}
    out_places = {}
    for st in stations.values():
        if 'תפעול' in st['name'] or len(st['lines']) < MIN_LINES[st['kind']]:
            continue
        lines = sorted(st['lines'].values(), key=linekey)
        if st['kind'] == 'street':
            label = f"{st['name']} ({st['city']})"
        elif names[(st['kind'], st['name'])] == 1:
            label = st['name']
        else:
            label = f"{st['name']} ({st['city']})"
        pos = st.get('pos') or []
        out_st[label] = {
            'kind': st['kind'], 'city': st['city'],
            'lat': round(sum(p[0] for p in pos) / len(pos), 5) if pos else None,
            'lon': round(sum(p[1] for p in pos) / len(pos), 5) if pos else None,
            'lines': [[x['line'], x['op'], sorted(x['dests']),
                       plat_join(x['dep'] if x.get('dep') else x['plats']),
                       1 if x['term'] else 0,
                       streets_of(x.get('rids', ())),
                       acc_of(x.get('rids', ())),
                       flags_of(x.get('rids', ())),
                       x.get('thru'),
                       # רציפים לפי כיוון — רק כשיש יותר מכיוון אחד עם רציפים שונים
                       ([[d, plat_join(ps)] for d, ps in sorted(x['dirs'].items())]
                        if len(x.get('dirs', {})) > 1 and len({plat_join(ps) for ps in x['dirs'].values()}) > 1 else None),
                       # קו מעגלי: רחובות המסלול לפי הסדר (לפירוט "התחנה ← … ← התחנה")
                       ] for x in lines]}
        # שמות התחנות במסלול — לסריקה בלבד (קובץ נפרד, שהאתר לא טוען)
        out_places[label] = {x['line']: places_of(x.get('rids', ())) for x in lines}
    kinds = Counter(v['kind'] for v in out_st.values())
    print(f'קבוצות: {dict(kinds)}', flush=True)
    # שירותים עירוניים שאינם ב-GTFS הלאומי (סבבוס, שאטלים עירוניים וכד') —
    # תוספת ידנית: wiki-check/data/extra-lines.json {"שם מקום": [[קו, מפעיל, [יעדים], רציף, 0], ...]}
    extra_path = os.path.join(os.path.dirname(OUT), 'extra-lines.json')
    if os.path.exists(extra_path):
        with open(extra_path, encoding='utf-8') as f:
            extra = json.load(f)
        n_extra = 0
        for label, lines in extra.items():
            if label in out_st:
                have = {(l[0], l[1]) for l in out_st[label]['lines']}
                for l in lines:
                    if (l[0], l[1]) not in have:
                        out_st[label]['lines'].append(l)
                        n_extra += 1
        print(f'תוספות ידניות: {n_extra} קווים', flush=True)
    # "רחובות מרכזיים" לכל עיר = רחוב שעוברים בו 10 קווים (קו+מפעיל) ומעלה.
    # משמש את הסריקה (tools/wiki_audit.py) לבדיקת עמודת המסלול בטבלאות (שלמה 18.09)
    street_lines = {}
    for rid, rs in route_streets.items():
        short, op, _ln = routes.get(rid, ('', '', ''))
        if not short:
            continue
        for k in rs:
            street_lines.setdefault(k, set()).add(f'{short}|{op}')
    central = {}
    for (st_, ct_), lks in street_lines.items():
        if len(lks) >= 10:
            central.setdefault(ct_, []).append(st_)
    print(f'רחובות מרכזיים: {sum(len(v) for v in central.values())} ב-{len(central)} ערים', flush=True)
    # כל היישובים שבקובץ התחנות — כדי ששם עיר בתא המסלול (זכרון יעקב, בני ברק) לא ייחשב רחוב
    all_cities = sorted({v[1] for v in stop_street.values()} | {c for c in central})
    out = {'updated': datetime.date.today().isoformat(), 'stations': out_st, 'central': central, 'cities': all_cities}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    pp = os.path.join(os.path.dirname(OUT), 'places.json')
    with open(pp + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(out_places, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(pp + '.tmp', pp)
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'תחנות: {len(out_st)} · קובץ: {OUT}', flush=True)


if __name__ == '__main__':
    sys.exit(main())
