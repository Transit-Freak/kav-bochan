# -*- coding: utf-8 -*-
"""הקו המודיע — התראות השירות של משרד התחבורה (שלמה 18.10.2026).

המקור: bus-alerts.com (קוד פתוח בנחלת הכלל, github.com/dvorakroth/bus-alerts), שקורא את פיד
ההתראות בזמן אמת של משרד התחבורה ומפרסם אותו כ-JSON. כל ההתראות בבקשה אחת (/api/all_alerts,
שהשרת שם שומר בזיכרון 10 דקות), ומפת השינויים (/api/get_route_changes) רק להתראה חדשה או שהשתנתה.

פלט (alerts/data/):
  alerts.json      כל ההתראות הפעילות והעתידיות, מצומצמות לאתר, עם סוג הסיבה
  rc/<id>.json     לכל התראה עם שינויי מסלול: השרטוט של כל קו, סדר התחנות החדש, תחנות שבוטלו,
                   והמסלול המשוער לפי נוסח ההודעה (tools/alerts_route.py)
  by-rd.json       מק"ט-כיוון-חלופה (או מק"ט בלבד, כשאין מפה) → מזהי ההתראות ("שינוי זמני" בהקו בזמן)
  state.json       מה כבר נמשך (hash לכל התראה) — כדי לא למשוך שוב מפה שלא השתנתה
  report.json      סיכום הריצה: כמה התראות מכל סוג, לכמה נמצא מסלול לפי הנוסח ולמה לא

env: MAX_MIN (תקציב זמן, ברירת מחדל 25), OUT (ברירת מחדל alerts/data)
"""
import datetime
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alerts_route as AR  # noqa: E402

SRC = 'https://bus-alerts.com'
OUT = os.environ.get('OUT', 'alerts/data')
MAX_MIN = float(os.environ.get('MAX_MIN', '25'))
# גרסת קריאת הנוסח: כשהיא עולה, התראות ש"לא נמצא בהן מסלול" מחושבות שוב (שלמה 18.10, אילת)
PARSE_V = 5
# הארכיון של הקו בזמן: שינויים זמניים שכבר התחילו, לפי מק"ט — נשמרים גם אחרי שההתראה ירדה (שלמה 18.10)
TEMP_DIR = os.environ.get('TEMP_DIR', 'line-history/data/temp')
UA = {'User-Agent': 'kavbochan.app alerts mirror (twice a day; github.com/Transit-Freak/kav-bochan)'}
T0 = time.time()
S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com'


def left():
    return MAX_MIN * 60 - (time.time() - T0)


def get_json(url, tries=3, timeout=120, data=None):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA, data=data)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:
            print(f'  ניסיון {k + 1} נכשל: {url[:90]} — {e}', file=sys.stderr)
            time.sleep(5 * (k + 1))
    return None


# ------------------------------------------------------------------ סוג הסיבה
# לפי הכותרת והנוסח. הסדר חשוב: "עבודות" מנצח, "תאונה" לפני "עומס".
CAUSES = [
    ('works', 'עבודות', r'עבודות|עבודה|תשתית|חפיר|סליל|ריבוד|שיפוץ|הנחת צנרת|רכבת קלה|קו (?:ה)?סגול|קו (?:ה)?ירוק|הקמת|בנייה|בניה|גשר חדש|הסדרי תנועה זמניים'),
    ('police', 'משטרה וביטחון', r'משטר|ביטחונ|בטחונ|חפץ חשוד|פיגוע|אירוע חריג|סגירה ביטחונית|הנחיית (?:ה)?משטרה|פינוי|תרגיל'),
    ('protest', 'הפגנות', r'הפגנ|מחאה|מחאת|עצרת|חסימת כבישים'),
    ('event', 'אירועים', r'מרתון|מירוץ|מרוץ|ריצת|ריצה|אופניים|טקס|הלוויה|הלויה|פסטיבל|הופעה|משחק|אצטדיון|מצעד|תהלוכ|הקפות|יום הזיכרון|יום הזכרון|יום העצמאות|ל"ג בעומר|לג בעומר|ביקור|כנס|אירוע|חגיגות|הדלקת|יריד|קרנבל|אדלאידע|עדלאידע|הילולה|הילולת|עלייה לקבר|תפילה המונית'),
    ('accident', 'תאונה', r'תאונ'),
    ('stuck', 'רכב תקוע או חסימה', r'תקוע|תקועה|נתקע|חסימת רכבים|רכב חוסם|משאית'),
    ('weather', 'מזג אוויר', r'הצפ|שיטפון|שטפון|גשם|שלג|סערה|מזג האוויר|מזג אוויר'),
    ('strike', 'שביתה או השבתה', r'שביתה|שביתת|השבתה|עיצומים'),
    ('traffic', 'עומסי תנועה', r'עומס|פקק'),
    ('fault', 'תקלה', r'תקלה|תקלת|תקלות|קריסת|נזק'),
    # שלמה 18.10: "סיבה: העתקת תחנה" — לא "לא צוינה סיבה"
    ('relocate', 'העתקת תחנה', r'העתקת (?:ה)?תחנ|העתקה של (?:ה)?תחנ|תועתק (?:ה)?תחנ|תועתקנה|הזזת (?:ה)?תחנ|תחנה זמנית|תחנות זמניות|מיקום (?:ה)?תחנה'),
]
CAUSE_LABEL = dict((k, l) for k, l, _ in CAUSES) | {'other': 'לא צוינה סיבה'}


RELOCATE = dict((k, p) for k, _, p in CAUSES)['relocate']


def cause_of(header, desc):
    # כשהכותרת עצמה אומרת "העתקת תחנה" — זו הסיבה, גם אם בנוסח מוזכרות עבודות
    if re.search(RELOCATE, header or ''):
        return 'relocate'
    t = f'{header}\n{desc}'
    for key, _, pat in CAUSES:
        if re.search(pat, t):
            return key
    return 'other'


# ------------------------------------------------------------------ תחנות (שם ומק"ט לפי stop_id)
def stop_names():
    """stop_id → (code, name) מתוך stops.txt של קובץ ה-GTFS האחרון בארכיון (קריאה של איבר אחד בלבד)."""
    import backfill_geo as BG
    for back in range(0, 6):
        ds = (datetime.date.today() - datetime.timedelta(days=back)).isoformat()
        url = f'{S3}/gtfs_archive/{ds[:4]}/{ds[5:7]}/{ds[8:10]}/israel-public-transportation.zip'
        try:
            members = BG.central_dir(url)
            idx, rows = BG.member_rows(url, members, 'stops.txt')
            out = {}
            for r in rows:
                out[r[idx['stop_id']]] = (r[idx['stop_code']], r[idx['stop_name']])
            print(f'תחנות: {len(out):,} מ-GTFS של {ds}')
            return out
        except BaseException as e:   # BG.http עושה SystemExit כשאין קובץ ליום הזה
            print(f'  GTFS {ds}: {e}', file=sys.stderr)
    return {}


# ------------------------------------------------------------------ מסלול לפי הנוסח
def overpass(bbox):
    s, w, n, e = bbox
    q = (f'[out:json][timeout:90];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|'
         f'living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|busway)$"]'
         f'({s:.5f},{w:.5f},{n:.5f},{e:.5f});out geom tags;')
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
                'https://overpass.private.coffee/api/interpreter'):
        d = get_json(url, tries=2, timeout=150, data=urllib.parse.urlencode({'data': q}).encode())
        if d and 'elements' in d:
            return [(el.get('tags', {}), [(p['lat'], p['lon']) for p in el['geometry']])
                    for el in d['elements'] if el.get('type') == 'way' and el.get('geometry')]
        time.sleep(5)
    return None


def estimate_routes(alert, rc_routes, stops):
    """לכל קו בהתראה: ניסיון למצוא את המסלול החלופי לפי הנוסח. לא מתעקשים: אם אין הוראה
    מפורשת, או שהרחובות לא נמצאו במפה, נשארים עם סדר התחנות החדש — ואומרים את זה."""
    paras = AR.parse(alert['description'].get('he', ''))
    why = {}
    if not paras:
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'no-text'
        return 'no-text'
    # אזור הניתוב: הקטע המבוטל של כל הקווים + כ-1 ק"מ (עקיפות ארוכות, כמו ברחובות ראשון לציון)
    pts = []
    for r in rc_routes:
        sh = r['shape']
        if r['cut']:
            pts += sh[max(0, r['cut'][0] - 60):r['cut'][1] + 60]
    if not pts:
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'no-cut'
        return 'no-cut'
    la = [p[0] for p in pts]
    lo = [p[1] for p in pts]
    pad = 0.009
    bbox = (min(la) - pad, min(lo) - pad * 1.2, max(la) + pad, max(lo) + pad * 1.2)
    if (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.012:   # אזור ענק (יותר מ-~10×12 ק"מ) — לא מנתבים
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'area'
        return 'area'
    ways = overpass(bbox)
    time.sleep(3)
    if not ways:
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'osm'
        return 'osm'
    net = AR.Streets(ways)
    for r in rc_routes:
        r['est'], r['why'] = None, 'no-match'
        if not r['cut']:
            r['why'] = 'no-cut'
            continue
        cand = [p for p in paras if not p['lines'] or r['num'] in p['lines']]
        # "78" בהודעה ו-78א במפה, או "6מ'" בהודעה ו-6 במפה — אותו קו, כשאין לו פסקה משלו
        if not cand:
            base = re.sub(r'[א-ת]$', '', r['num'])
            cand = [p for p in paras if any(re.sub(r'[א-ת]$', '', x) == base for x in p['lines'])]
        best = None
        for p in cand:
            try:
                res = AR.route_detour(net, p, [tuple(x) for x in r['shape']], r['cut'][0], r['cut'][1])
            except Exception as e:   # הנוסח לא תמיד צפוי — לא מפילים את הריצה בגלל הודעה אחת
                print(f'  ניתוב נכשל ({alert["id"]} קו {r["num"]}): {e}', file=sys.stderr)
                res = None
            if res and (best is None or res['len'] < best['len']):
                best = res
        if best:
            r['est'], r['why'] = best, 'ok'
        why[r['num']] = r['why']
    return 'ok' if any(r['est'] for r in rc_routes) else 'no-match'


def iso_ts(x):
    try:
        return datetime.datetime.fromisoformat(str(x).replace('Z', '+00:00')).timestamp()
    except (TypeError, ValueError):
        return None


def archive_temp(alerts, now_ts):
    """הקו בזמן שומר רק שינויים שהיו: התראה נכנסת לארכיון של הקו כשהיא כבר התחילה, ומתעדכנת
    כל עוד היא בפיד (תאריכים, נוסח). קובץ לכל מק"ט: {'ev': [...]}, ובכל אירוע rds — הכיוונים
    והחלופות שההתראה חלה עליהם, או None כשההודעה מציינת רק את הקו."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo('Asia/Jerusalem')
    by_mk = {}
    for a in alerts:
        st = iso_ts(a.get('s'))
        if not st or st > now_ts or not a.get('lines'):
            continue
        groups = {}
        for _, rd, *_ in a['lines']:
            rd = str(rd or '')
            mk = rd.split('-')[0]
            if not mk.isdigit():
                continue
            g = groups.setdefault(mk, set())
            g.add(rd if '-' in rd else None)
        for mk, rds in groups.items():
            by_mk.setdefault(mk, []).append({
                'id': a['id'], 'd': datetime.datetime.fromtimestamp(st, tz).date().isoformat(),
                's': a.get('s'), 'e': a.get('e'), 'c': a.get('cause'), 'cl': CAUSE_LABEL.get(a.get('cause'), '') if a.get('cause') != 'other' else '',
                'h': a.get('h'), 'd2': a.get('d'), 'rm': a.get('rm') or [], 'add': a.get('add') or [], 'k': a.get('kind'),
                'rds': None if None in rds else sorted(rds)})
    os.makedirs(TEMP_DIR, exist_ok=True)
    n = 0
    for mk, evs in by_mk.items():
        f = f'{TEMP_DIR}/{mk}.json'
        try:
            old = json.load(open(f)).get('ev') or []
        except Exception:
            old = []
        cur = {e['id']: e for e in old}
        changed = False
        for e in evs:
            if cur.get(e['id']) != e:
                cur[e['id']] = e
                changed = True
        if changed:
            json.dump({'ev': sorted(cur.values(), key=lambda e: (e['d'], e['id']))}, open(f, 'w'),
                      ensure_ascii=False, separators=(',', ':'))
            n += 1
    print(f'הארכיון של הקו בזמן: {n} קבצי קו עודכנו ({len(by_mk)} קווים עם שינוי זמני שהתחיל)')


# ------------------------------------------------------------------ main
def main():
    os.makedirs(f'{OUT}/rc', exist_ok=True)
    try:
        state = json.load(open(f'{OUT}/state.json'))
    except Exception:
        state = {}
    data = get_json(f'{SRC}/api/all_alerts')
    if not data or 'alerts' not in data:
        raise SystemExit('לא התקבלו התראות מ-bus-alerts.com')
    raw = [a for a in data['alerts'] if not a.get('is_deleted') and not a.get('is_expired')]
    print(f'התראות: {len(raw)} (מתוך {len(data["alerts"])})')
    stops = None
    alerts, by_rd, report = [], {}, {'causes': {}, 'route': {}, 'kinds': {}}
    seen = set()
    for a in raw:
        aid = str(a['id'])
        seen.add(aid)
        he = lambda o: (o or {}).get('he') or ''   # noqa: E731
        h = hashlib.sha1(json.dumps([a.get('header'), a.get('description'), a.get('active_periods'),
                                     a.get('added_stop_ids'), a.get('removed_stop_ids'), a.get('relevant_route_ids')],
                                    ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
        cause = cause_of(he(a.get('header')), he(a.get('description')))
        report['causes'][cause] = report['causes'].get(cause, 0) + 1
        st = state.get(aid) or {}
        lines = []
        for ag, pks in (a.get('relevant_lines') or {}).items():
            for pk in pks:
                num, _, mk = str(pk).partition('_')
                lines.append([num, mk])
        has_map = a.get('use_case') in (5, 6, 7, 9) and not a.get('is_national') and (a.get('removed_stop_ids') or a.get('added_stop_ids'))
        rc_file = f'{OUT}/rc/{aid}.json'
        # נמשך שוב: התראה חדשה או שהשתנתה, מפה שלא נשמרה, חישוב שלא הסתיים (נגמר הזמן / מפת הרחובות
        # לא ענתה) — אחרת הוא נשאר כך עד שנוסח ההודעה ישתנה — ו"לא נמצא" אחרי שקריאת הנוסח השתפרה
        redo = (st.get('status') in ('osm', 'time')
                or (st.get('status') in ('no-match', 'no-cut') and st.get('pv') != PARSE_V))
        if has_map and (st.get('h') != h or not os.path.exists(rc_file) or redo) and left() > 60:
            rc = get_json(f'{SRC}/api/get_route_changes?id={urllib.parse.quote(aid)}')
            time.sleep(2)
            if rc and rc.get('route_changes'):
                if stops is None:
                    stops = stop_names()
                rmset = set(a.get('removed_stop_ids') or [])
                routes = []
                used = set()
                for ag, per_line in rc['route_changes'].items():
                    for pk, chs in per_line.items():
                        for c in chs:
                            if not c.get('shape'):
                                continue
                            shape = [[round(p[1], 6), round(p[0], 6)] for p in c['shape']]
                            seq = c.get('updated_stop_sequence') or []
                            dele = c.get('deleted_stop_ids') or []
                            # הקטע המבוטל על השרטוט: מהתחנה המבוטלת/החדשה הראשונה עד האחרונה
                            sfm = rc.get('stops_for_map') or {}
                            touched = [s for s in dele if s in sfm] + [s for s, add in seq if add and s in sfm]
                            cut = None
                            if touched:
                                idx = []
                                for s in touched:
                                    q = (sfm[s]['stop_lat'], sfm[s]['stop_lon'])
                                    idx.append(min(range(len(shape)), key=lambda i: AR.meters(shape[i], q)))
                                cut = [min(idx), max(idx)]
                            used.update(s for s, _ in seq)
                            used.update(dele)
                            routes.append({'num': c.get('line_number'), 'rd': c.get('route_desc'), 'rid': c.get('route_id'), 'to': c.get('to_text'),
                                           'ag': c.get('agency_name'), 'dir': c.get('dir_name'), 'alt': c.get('alt_name'),
                                           'shape': shape, 'seq': seq, 'del': dele, 'cut': cut})
                status = estimate_routes(a, routes, stops) if left() > 120 else 'time'
                report['route'][status] = report['route'].get(status, 0) + 1
                sfm = rc.get('stops_for_map') or {}
                out_stops = {}
                for s in used:
                    if s in sfm:
                        code, name = (stops or {}).get(s, ('', ''))
                        out_stops[s] = [round(sfm[s]['stop_lat'], 6), round(sfm[s]['stop_lon'], 6), code, name]
                for r in routes:
                    full = r.pop('shape')
                    r['shape'] = AR.simplify([tuple(p) for p in full], 4.0)
                    r['shape'] = [[p[0], p[1]] for p in r['shape']]
                    r.pop('cut', None)
                json.dump({'id': aid, 'routes': routes, 'stops': out_stops, 'status': status},
                          open(rc_file, 'w'), ensure_ascii=False, separators=(',', ':'))
                st = {'h': h, 'map': True, 'status': status, 'pv': PARSE_V, 'first': st.get('first') or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')}
            else:
                st = {'h': h, 'map': False, 'first': st.get('first') or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')}
        elif not has_map:
            st = {'h': h, 'map': False, 'first': st.get('first') or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')}
        state[aid] = st
        # הקווים ברשומה: מהמפה אם יש (מק"ט-כיוון-חלופה ויעד), אחרת מרשימת הקווים של ההתראה
        rlines = []
        if os.path.exists(rc_file):
            try:
                rcj = json.load(open(rc_file))
                for r in rcj['routes']:
                    rlines.append([r['num'], r['rd'], r['to'], bool(r.get('est'))])
                    if r.get('rd'):
                        by_rd.setdefault(r['rd'], []).append(aid)
            except Exception:
                pass
        if not rlines:
            rlines = [[n, mk, '', False] for n, mk in lines]
            # בלי מפה אין כיוון וחלופה — המפתח הוא המק"ט, והקו בזמן מחפש גם לפיו
            for n, mk in lines:
                if mk:
                    by_rd.setdefault(str(mk), []).append(aid)
        dep = []
        for ag, per in (a.get('departure_changes') or {}).items():
            for pk, chs in per.items():
                for c in chs:
                    dep.append([c.get('line_number'), c.get('route_desc'), c.get('to_text'), c.get('added_hours') or [], c.get('removed_hours') or []])
                    if c.get('route_desc'):
                        by_rd.setdefault(c['route_desc'], []).append(aid)
        kind = 'route' if os.path.exists(rc_file) else ('times' if dep else ('stops' if a.get('removed_stops') else 'info'))
        report['kinds'][kind] = report['kinds'].get(kind, 0) + 1
        alerts.append({
            'id': aid, 'uc': a.get('use_case'), 'cause': cause, 'kind': kind,
            'h': he(a.get('header')), 'd': he(a.get('description')),
            's': a.get('first_start_time'), 'e': a.get('last_end_time'),
            'per': (a.get('active_periods') or {}).get('raw') or [],
            'nat': bool(a.get('is_national')),
            'ag': [x.get('agency_name') for x in (a.get('relevant_agencies') or [])],
            'lines': rlines, 'rm': a.get('removed_stops') or [], 'add': a.get('added_stops') or [],
            'dep': dep, 'map': os.path.exists(rc_file), 'first': st.get('first'),
        })
    # ניקוי: התראות שירדו מהפיד
    for aid in list(state):
        if aid not in seen:
            state.pop(aid, None)
            try:
                os.remove(f'{OUT}/rc/{aid}.json')
            except FileNotFoundError:
                pass
    alerts.sort(key=lambda x: (x['s'] or '', x['id']))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')
    json.dump({'gen': now, 'src': 'bus-alerts.com', 'causes': CAUSE_LABEL, 'alerts': alerts},
              open(f'{OUT}/alerts.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump({k: sorted(set(v)) for k, v in sorted(by_rd.items())}, open(f'{OUT}/by-rd.json', 'w'), separators=(',', ':'))
    json.dump(state, open(f'{OUT}/state.json', 'w'), separators=(',', ':'), sort_keys=True)
    report['gen'] = now
    report['n'] = len(alerts)
    # התראות שפג תוקפן ועוד לא נמחקו — כבר לא מוצגות בהקו המודיע, אבל קרו: גם הן לארכיון של הקו בזמן
    past = []
    he = lambda o: (o or {}).get('he') or ''   # noqa: E731
    for a in data['alerts']:
        if not a.get('is_expired') or a.get('is_deleted') or str(a['id']) in seen:
            continue
        lines = [[str(pk).partition('_')[0], str(pk).partition('_')[2], '', False]
                 for pks in (a.get('relevant_lines') or {}).values() for pk in pks]
        past.append({'id': str(a['id']), 'cause': cause_of(he(a.get('header')), he(a.get('description'))),
                     'kind': 'stops' if a.get('removed_stops') else 'info', 'h': he(a.get('header')), 'd': he(a.get('description')),
                     's': a.get('first_start_time'), 'e': a.get('last_end_time'), 'lines': lines,
                     'rm': a.get('removed_stops') or [], 'add': a.get('added_stops') or []})
    archive_temp(alerts + past, datetime.datetime.now(datetime.timezone.utc).timestamp())
    json.dump(report, open(f'{OUT}/report.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
