#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""הקו בזמן — לוח הזמנים של כל קו רכבת היסטורי (שלמה 28.10).

קווי הרכבת בהקו בזמן הם מק"טים עם חלופות (30040-1-41…), כפי שמשרד התחבורה רשם
רכבות עד 2021; כמעט כל רכבת היא חלופה משלה, ולכן לקו יש עשרות חלופות. הכלי בונה
לכל מק"ט טבלה אחת: לכל כיוון ויום בשבוע — שעת היציאה של כל רכבת, החלופה שלה,
ומה שונה בה מהמסלול הרגיל של הכיוון (לא עוצרת ב… / עוצרת גם ב… / יוצאת מ… / עד…).
ריק = כמו המסלול הרגיל. מספר הרכבת אינו קיים בקבצים של אותן שנים.

המקור: השבוע האחרון שבו המק"ט מופיע בארכיון — TransitFeeds (tf-days.txt, 2017–2022)
או אופן באס הישן (early-sources.json, 2015–2018). קריאה בבקשות Range, stop_times בזרימה.

פלט: line-history/data/rail-sched/<מק"ט>.json — צילום לכל שבוע שבו חלופה כלשהי של הקו פעלה לאחרונה:
  {"p": [{"d": יום הצילום, "dirs": {"1": {"from", "to", "n": [הערות],
         "days": {"א": [[שעה, חלופה, אינדקס הערה או -1]]}}}}]}
"""
import bisect
import collections
import csv
import datetime
import io
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_geo import central_dir, member_rows, stream_member  # noqa: E402

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
OUT = f'{OUTDIR}/rail-sched'
TF = ('https://openmobilitydata-data.s3-us-west-1.amazonaws.com'
      '/public/feeds/ministry-of-transport-and-road-safety/820/{ds}/gtfs.zip')
DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
ONLY = set(filter(None, os.environ.get('ONLY', '').split(',')))


def jload(p, dflt):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return dflt


def fsafe(rd):
    return rd.replace('#', 'H').replace('/', '_')


def rail_variants():
    """{חלופה: היום האחרון שבו נראתה} מכל קווי הרכבת בהקו בזמן — לכל חלופה הלו"ז
    מהשבוע האחרון שבו פעלה (החלופות של קו רכבת פעלו בתקופות שונות)."""
    last = {}
    for l in json.load(open(f'{OUTDIR}/lines.json', encoding='utf-8'))['lines']:
        if l.get('tt') != 'rail' or '-' not in l['rd']:
            continue
        mk = l['rd']
        try:
            f = json.load(open(f'{OUTDIR}/lines/{fsafe(l["rd"])}.json', encoding='utf-8'))
        except Exception:
            continue
        for v in f.get('versions') or []:
            d = v.get('sd') if v.get('k') == 'removed' else (v.get('sd') or v.get('d'))
            if d and d > last.get(mk, ''):
                last[mk] = d
    return last


def sources():
    """[(YYYY-MM-DD, url)] ממוין — אופן באס הישן ו-TransitFeeds."""
    out = []
    for s in json.load(open(f'{OUTDIR}/early-sources.json', encoding='utf-8'))['snapshots']:
        if s['kind'] == 'obusOld' and len(s['urls']) == 1:
            out.append((s['date'], s['urls'][0]))
    for l in open(f'{OUTDIR}/tf-days.txt'):
        l = l.strip()
        if l:
            out.append((f'{l[:4]}-{l[4:6]}-{l[6:]}', TF.format(ds=l)))
    return sorted(out)


def city_of(desc):
    m = re.search(r'עיר:\s*([^:]+?)\s*(?:רציף:|קומה:|$)', desc or '')
    return m.group(1).strip() if m else ''


# עיר לפי תחילת שם התחנה — כשבקובץ אין עיר בתיאור התחנה (בחלק מהשנים)
CITY_PREFIX = [('צומת חולון', 'חולון'), ('חולון', 'חולון'), ('בת ים', 'בת ים'), ('תל אביב', 'תל אביב'),
               ('חיפה', 'חיפה'), ('בת גלים', 'חיפה'), ('חוף הכרמל', 'חיפה'), ('לב המפרץ', 'חיפה'),
               ('באר שבע', 'באר שבע'), ('ירושלים', 'ירושלים'), ('רשל"צ', 'ראשון לציון'),
               ('ראשון לציון', 'ראשון לציון'), ('ראשונים', 'ראשון לציון'), ('פתח תקווה', 'פתח תקווה'),
               ('נתניה', 'נתניה'), ('אשדוד', 'אשדוד'), ('מודיעין', 'מודיעין'), ('כפר סבא', 'כפר סבא'),
               ('ראש העין', 'ראש העין'), ('חדרה', 'חדרה'), ('הרצליה', 'הרצליה'), ('רחובות', 'רחובות')]


def city_name(sid, names, cities):
    if cities.get(sid):
        return cities[sid]
    nm = names.get(sid, '')
    return next((c for p, c in CITY_PREFIX if nm.startswith(p)), '')


def join_he(xs):
    return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' ו' + xs[-1]


def phrase(ids, main, names, cities):
    """רשימת תחנות לטקסט; כמה תחנות של עיר שהן כל תחנותיה במסלול הרגיל → "כל תחנות X ו-Y"."""
    by = collections.OrderedDict()
    for s in ids:
        by.setdefault(city_name(s, names, cities), []).append(s)
    whole, parts = [], []
    for c, ss in by.items():
        allc = [s for s in main if city_name(s, names, cities) == c]
        if c and len(ss) >= 2 and set(ss) >= set(allc):
            whole.append(c)
        else:
            parts.extend(names.get(s, s) for s in ss)
    if whole:
        parts.insert(0, 'כל תחנות ' + join_he(whole))
    return join_he(parts) if len(parts) > 1 else (parts[0] if parts else '')


def diff_note(seq, main, names, cities):
    if seq == main:
        return ''
    notes = []
    if seq[0] != main[0]:
        notes.append('יוצאת מ' + names.get(seq[0], seq[0]))
    if seq[-1] != main[-1]:
        notes.append('עד ' + names.get(seq[-1], seq[-1]))
    i = main.index(seq[0]) if seq[0] in main else 0
    j = main.index(seq[-1]) if seq[-1] in main else len(main) - 1
    span = main[i:j + 1] if i <= j else main
    have = set(seq)
    skip = [s for s in span if s not in have]
    extra = [s for s in seq if s not in set(main)]
    if extra and len(skip) >= 3:
        # מסלול אחר (למשל דרך קרית גת במקום החוף): מה כן — לא רשימת כל מה שהוא מדלג עליו
        notes.append('מסלול אחר: דרך ' + phrase(extra, main, names, cities))
    elif len(skip) > max(3, len(span) // 2):
        # רוב התחנות של המסלול הרגיל חסרות: לא רשימת "לא עוצרת", אלא מה כן
        mid = seq[1:-1]
        if mid:
            notes.append('מהירה: עוצרת רק ב' + phrase(mid, main, names, cities))
        else:
            notes.append('ישירה, בלי עצירות בדרך')
    else:
        if skip:
            notes.append('לא עוצרת ב' + phrase(skip, main, names, cities))
        if extra:
            notes.append('עוצרת גם ב' + phrase(extra, main, names, cities))
    return ' · '.join(notes) or 'סדר תחנות אחר'


def scan_day(day, url, want):
    """{מק"ט: נתוני הפלט} לכל המק"טים ב-want מתוך צילום אחד."""
    members = central_dir(url)
    c, rows = member_rows(url, members, 'routes.txt')
    routes = {}
    for r in rows:
        if r[c['route_type']].strip() != '2':
            continue
        p = r[c['route_desc']].strip().split('-')
        if len(p) >= 3 and p[0].lstrip('0') in want:
            routes[r[c['route_id']]] = (p[0].lstrip('0'), p[1], p[2])
    c, rows = member_rows(url, members, 'calendar.txt')
    cal = {r[c['service_id']]: (r[c['start_date']], r[c['end_date']], [r[c[d]] == '1' for d in DAYS])
           for r in rows}
    c, rows = member_rows(url, members, 'trips.txt')
    trips = {}
    for r in rows:
        if r[c['route_id']] in routes:
            trips[r[c['trip_id']]] = (routes[r[c['route_id']]], r[c['service_id']])
    st = collections.defaultdict(list)
    hdr, rest = None, ['']

    def feed(b):
        nonlocal hdr
        txt = rest[0] + b.decode('utf-8-sig' if hdr is None else 'utf-8', 'replace')
        lines = txt.split('\n')
        rest[0] = lines.pop()
        for ln in lines:
            p = ln.rstrip('\r').split(',')
            if hdr is None:
                hdr = {x.strip(): i for i, x in enumerate(p)}
                continue
            t = p[hdr['trip_id']]
            if t in trips:
                st[t].append((int(p[hdr['stop_sequence']]), p[hdr['stop_id']], p[hdr['departure_time']][:5]))
    stream_member(url, members, 'stop_times.txt', feed)
    c, rows = member_rows(url, members, 'stops.txt')
    names, cities = {}, {}
    for r in rows:
        names[r[c['stop_id']]] = r[c['stop_name']].strip()
        cities[r[c['stop_id']]] = city_of(r[c['stop_desc']] if 'stop_desc' in c else '')
    # השבוע שמסתיים ביום הצילום: לכל יום בשבוע — התאריך שלו בשבוע הזה
    d0 = datetime.date.fromisoformat(day)
    week = {}
    for k in range(7):
        d = d0 + datetime.timedelta(days=k)
        week[(d.weekday() + 1) % 7] = d.strftime('%Y%m%d')
    per = collections.defaultdict(lambda: collections.defaultdict(list))  # (mk, dir) -> wd -> [(t, alt, seq)]
    for tid, ((mk, dr, alt), svc) in trips.items():
        seq = [s for _, s, _ in sorted(st.get(tid, []))]
        if len(seq) < 2 or svc not in cal:
            continue
        t0 = min(st[tid])[2]
        sd, ed, flags = cal[svc]
        for wd, ds in week.items():
            if flags[wd] and sd <= ds <= ed:
                per[(mk, dr)][wd].append((t0, alt, tuple(seq)))
    # גולמי (נשמר במטמון): הערות נבנות אחר כך ב-render(), כך ששינוי בניסוח לא מחייב סריקה מחדש
    out = {}
    for (mk, dr), byd in per.items():
        used = {s for v in byd.values() for _, _, seq in v for s in seq}
        e = out.setdefault(mk, {'d': day, 'dirs': {}, 'st': {}})
        e['dirs'][dr] = {HE[wd]: sorted({(t, a, '|'.join(seq)) for t, a, seq in v}) for wd, v in byd.items()}
        e['st'].update({s: [clean(names.get(s, s)), cities.get(s, '')] for s in used})
    return out


def clean(name):
    return name.replace("''", '"').strip()


def render(raw):
    """הנתונים הגולמיים של צילום → פלט האתר: הערה לכל רכבת לעומת המסלול הרגיל של הכיוון."""
    names = {k: v[0] for k, v in raw['st'].items()}
    cities = {k: v[1] for k, v in raw['st'].items()}
    out = {'d': raw['d'], 'dirs': {}}
    for dr, byd in raw['dirs'].items():
        cnt = collections.Counter(seq for v in byd.values() for _, _, seq in v)
        main = cnt.most_common(1)[0][0].split('|')
        notes, rowsd = [], {}
        for wd in HE:
            if wd not in byd:
                continue
            rr = []
            for t, alt, seq in byd[wd]:
                n = diff_note(seq.split('|'), main, names, cities)
                if n and n not in notes:
                    notes.append(n)
                rr.append([t, alt, notes.index(n) if n else -1])
            rowsd[wd] = rr
        out['dirs'][dr] = {'from': names.get(main[0], ''), 'to': names.get(main[-1], ''), 'n': notes, 'days': rowsd}
    return out


def build_groups():
    """חלופות זהות (שלמה 28.10: אותו כיוון, אותן תחנות בדיוק, ותקופות פעילות חופפות) — שורה אחת
    בבוחר החלופות. rail-groups/<מק"ט>.json: {"g": {נציגה: [כל החברות, כולל הנציגה]}};
    הנציגה = זו שפעלה אחרונה. נבנה מקובצי הקווים בלבד, בלי רשת."""
    info = {}
    for l in json.load(open(f'{OUTDIR}/lines.json', encoding='utf-8'))['lines']:
        if l.get('tt') != 'rail' or '-' not in l['rd']:
            continue
        try:
            f = json.load(open(f'{OUTDIR}/lines/{fsafe(l["rd"])}.json', encoding='utf-8'))
        except Exception:
            continue
        pool, vs = f.get('pool') or [], f.get('versions') or []
        st = next((tuple(pool[x][0] if isinstance(x, int) else x[0] for x in v['stops'])
                   for v in reversed(vs) if v.get('stops')), ())
        ds = [v['d'] for v in vs if v.get('d')]
        if st and ds:
            info[l['rd']] = (st, min(ds), max(v.get('sd') or v.get('d') or '' for v in vs))
    # רכבת עם סיבה מתועדת (שינוי זמני — rail-reasons.json) או רכבת קצרת-ימים (מועמדת לסיבה,
    # rail-short-lived.json) לא מתאחדת: היא נשארת שורה משלה עם ההסבר שלה (שלמה 28.10)
    keep = set(jload(f'{OUTDIR}/rail-reasons.json', {}).get('rd', {}))
    for c in jload(f'{OUTDIR}/rail-short-lived.json', {}).get('candidates', []):
        keep.update(c.get('rds') or [])
    by = collections.defaultdict(list)
    for rd, (st, a, b) in info.items():
        if rd in keep:
            continue
        mk, dr = rd.split('-')[:2]
        by[(mk, dr, st)].append((a, b, rd))
    out = collections.defaultdict(dict)
    for (mk, _, _), v in by.items():
        v.sort()
        cur = None
        groups = []
        for a, b, rd in v:
            if cur and a <= cur[1]:
                cur[1] = max(cur[1], b)
                cur[2].append((b, rd))
            else:
                cur = [a, b, [(b, rd)]]
                groups.append(cur)
        for g in groups:
            if len(g[2]) > 1:
                out[mk][max(g[2])[1]] = [rd for _, rd in g[2]]
    os.makedirs(f'{OUTDIR}/rail-groups', exist_ok=True)
    for mk, g in out.items():
        json.dump({'g': g}, open(f'{OUTDIR}/rail-groups/{mk}.json', 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
    print('חלופות זהות:', sum(len(m) - 1 for g in out.values() for m in g.values()), 'מאוחדות ב-', len(out), 'קווים')


def main():
    if '--groups' in sys.argv:
        return build_groups()
    last = rail_variants()
    if ONLY:
        last = {k: v for k, v in last.items() if k.split('-')[0] in ONLY}
    src = sources()
    dates = [d for d, _ in src]
    groups = collections.defaultdict(set)
    for rd, d in last.items():
        # השבוע האחרון: הצילום שמתחיל עד שבוע לפני היום האחרון שבו נראתה
        ref = (datetime.date.fromisoformat(d) - datetime.timedelta(days=6)).isoformat()
        i = bisect.bisect_right(dates, ref) - 1
        if i < 0:
            i = bisect.bisect_right(dates, d) - 1
        if i >= 0:
            groups[i].add(rd.split('-')[0])
    print(f'{len(last)} חלופות · {len(groups)} צילומים לסריקה', flush=True)
    os.makedirs(OUT, exist_ok=True)
    per = collections.defaultdict(dict)
    cache = os.environ.get('CACHE')   # תוצאה לכל צילום — המשך ריצה שנקטעה
    if cache:
        os.makedirs(cache, exist_ok=True)

    def one(item):
        i, mks = item
        day, url = src[i]
        f = f'{cache}/{day}-{i}.json' if cache else None
        if f and os.path.exists(f):
            return day, json.load(open(f, encoding='utf-8'))
        for attempt in range(3):
            try:
                res = scan_day(day, url, mks)
                break
            except Exception as e:  # noqa: BLE001
                print('נכשל', day, attempt + 1, e, flush=True)
        else:
            return day, None
        if f:
            json.dump(res, open(f, 'w', encoding='utf-8'), ensure_ascii=False)
        print(day, f'{len(res)}/{len(mks)} קווים', flush=True)
        return day, res
    with ThreadPoolExecutor(int(os.environ.get('WORKERS', '4'))) as ex:
        for day, res in ex.map(one, sorted(groups.items())):
            for mk, e in (res or {}).items():
                per[mk][day] = e
    for mk, ps in per.items():
        json.dump({'p': [render(ps[d]) for d in sorted(ps)]}, open(f'{OUT}/{mk}.json', 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
    print('לו"ז רכבת:', len(per), 'קווים')
    build_groups()


if __name__ == '__main__':
    main()
