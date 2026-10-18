# -*- coding: utf-8 -*-
"""הקו המודיע — מה האוטובוסים עשו בפועל בזמן ההתראה, לפי שידורי המיקום (שלמה 18.10.2026).

כמו "לפי GPS בפועל" בקו באג: לכל קו בהתראה עם שינוי מסלול — עד שתי נסיעות מתוך תקופת
ההתראה (Stride: siri_rides לפי route_id, ואז siri_vehicle_locations לכל נסיעה), רק הנקודות
באזור השינוי. ואז הכרעה פשוטה:
  detour   — האוטובוסים נסעו לפי המסלול המשוער של ההודעה (רוב הנקודות לידו, כמעט אף אחת בקטע הסגור)
  regular  — האוטובוסים המשיכו בקטע שאמור להיות סגור
  avoided  — אין מסלול משוער, אבל האוטובוסים לא נסעו בקטע הסגור
  other    — נסעו בדרך אחרת: לא בקטע הסגור וגם לא לפי המסלול המשוער
רק בקווים עם עקיפה אמיתית (נוספו תחנות חלופיות) — בביטול תחנות בלבד אין מה להשוות.
  unknown  — אין מספיק נקודות
פלט: alerts/data/gps/<id>.json. נמשך פעם אחת לכל קו בהתראה (אחרי שעבר יום מההתחלה), ומתעדכן
רק אם ההתראה השתנתה. תקציב זמן: MAX_MIN (ברירת מחדל 8).
"""
import datetime
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alerts_route as AR  # noqa: E402

OUT = os.environ.get('OUT', 'alerts/data')
STRIDE = 'https://open-bus-stride-api.hasadna.org.il'
MAX_MIN = float(os.environ.get('MAX_MIN', '8'))
T0 = time.time()


def get(path, **q):
    url = f'{STRIDE}{path}?{urllib.parse.urlencode(q)}'
    for k in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'kavbochan.app alerts'}), timeout=120) as r:
                return json.load(r)
        except Exception as e:
            print(f'  Stride ({k + 1}): {e}', file=sys.stderr)
            time.sleep(4 * (k + 1))
    return None


def near_any(p, line, tol):
    return any(AR.seg_dist(p, a, b) < tol for a, b in zip(line, line[1:]))


def judge(points, est, closed):
    """points: [(lat,lon)] באזור השינוי. est: המסלול המשוער (או None). closed: הקטע הסגור במסלול הרגיל."""
    if len(points) < 4:
        return 'unknown', {}
    on_closed = sum(1 for p in points if len(closed) > 1 and near_any(p, closed, 25))
    on_est = sum(1 for p in points if est and near_any(p, est, 35))
    n = len(points)
    st = {'n': n, 'closed': on_closed, 'est': on_est}
    if on_closed >= max(3, 0.35 * n):
        return 'regular', st
    if est and on_est >= 0.6 * n:
        return 'detour', st
    # בלי מסלול משוער אין למה להשוות — רק שהקטע הסגור לא נסוע
    return ('other' if est else 'avoided'), st


def main():
    try:
        alerts = json.load(open(f'{OUT}/alerts.json'))['alerts']
    except Exception:
        return
    os.makedirs(f'{OUT}/gps', exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)
    done = 0
    for a in alerts:
        if time.time() - T0 > MAX_MIN * 60:
            print('תקציב הזמן נגמר — היתר בריצה הבאה')
            break
        if not a.get('map'):
            continue
        try:
            rc = json.load(open(f'{OUT}/rc/{a["id"]}.json'))
        except Exception:
            continue
        gfile = f'{OUT}/gps/{a["id"]}.json'
        try:
            g = json.load(open(gfile))
        except Exception:
            g = {}
        # תקופות ההתראה שכבר עברו לפחות שעתיים מתחילתן — בהן מחפשים נסיעות
        pers = [(s, e) for s, e in (a.get('per') or []) if s and s < now.timestamp() - 7200]
        if not pers:
            continue
        changed = False
        for r in rc['routes']:
            key = r.get('rd') or r.get('rid')
            # רק עקיפה אמיתית (נוספו תחנות חלופיות): בביטול תחנות בלבד האוטובוס עובר באותו רחוב
            # בלי לעצור, ואז "נסע בקטע הסגור" לא אומר כלום
            if not r.get('rid') or key in g or not r.get('del') or not any(add for _, add in r.get('seq') or []):
                continue
            s, e = pers[-1]
            e = min(e or now.timestamp(), now.timestamp())
            fr = datetime.datetime.fromtimestamp(max(s, e - 3 * 86400), datetime.timezone.utc).isoformat()
            to = datetime.datetime.fromtimestamp(e, datetime.timezone.utc).isoformat()
            rides = get('/siri_rides/list', siri_route__line_refs=r['rid'], scheduled_start_time_from=fr,
                        scheduled_start_time_to=to, limit=30, order_by='scheduled_start_time desc') or []
            time.sleep(0.3)
            # אזור השינוי: התחנות שבוטלו/נוספו + המסלול המשוער, ועוד 400 מ'
            stops = rc.get('stops') or {}
            area = [stops[x][:2] for x in r['del'] if x in stops] + [stops[x][:2] for x, add in r['seq'] if add and x in stops]
            est = (r.get('est') or {}).get('path')
            if est:
                area += est
            if not area:
                continue
            la = [p[0] for p in area]
            lo = [p[1] for p in area]
            box = (min(la) - 0.004, min(lo) - 0.005, max(la) + 0.004, max(lo) + 0.005)
            shape = r['shape']
            # הקטע הסגור במסלול הרגיל: הנקודות שבין התחנה המבוטלת הראשונה לאחרונה
            dl = [stops[x][:2] for x in r['del'] if x in stops]
            closed = []
            if dl:
                ix = [min(range(len(shape)), key=lambda i: AR.meters(shape[i], q)) for q in dl]
                closed = shape[min(ix):max(ix) + 1]
            picked, rides_out = [], []
            for rd in rides[:: max(1, len(rides) // 3)][:2]:
                locs = get('/siri_vehicle_locations/list', siri_rides__ids=str(rd['id']), limit=1000,
                           order_by='recorded_at_time asc') or []
                time.sleep(0.3)
                pts = [(round(float(l['lat']), 6), round(float(l['lon']), 6)) for l in locs
                       if l.get('lat') and box[0] <= float(l['lat']) <= box[2] and box[1] <= float(l['lon']) <= box[3]]
                if pts:
                    picked += pts
                    rides_out.append({'t': rd.get('scheduled_start_time'), 'pts': [list(p) for p in pts]})
            verdict, stat = judge(picked, est, closed)
            g[key] = {'verdict': verdict, 'stat': stat, 'rides': rides_out,
                      'at': now.isoformat(timespec='minutes')}
            changed = True
            done += 1
            print(f'{a["id"]} קו {r["num"]} ({key}): {verdict} {stat}')
        if changed:
            json.dump(g, open(gfile, 'w'), ensure_ascii=False, separators=(',', ':'))
    # ניקוי קבצים של התראות שירדו
    ids = {a['id'] for a in alerts}
    for f in os.listdir(f'{OUT}/gps'):
        if f.endswith('.json') and f[:-5] not in ids:
            os.remove(f'{OUT}/gps/{f}')
    print(f'GPS: {done} קווים נבדקו')


if __name__ == '__main__':
    main()
