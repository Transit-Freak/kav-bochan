#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""הקו בזמן — קווי הרכבת מ-09.2021 ועד היום (שלמה 28.10).

מאז ספטמבר 2021 משרד התחבורה רושם כל רכבת כ"קו" נפרד (route_desc = מספר הרכבת), ולכן
אין מק"ט שמחבר רכבות לקו אחד. כאן קו = זוג תחנות הקצה (קוד התחנה, stop_code), בשני
כיוונים: נתניה ↔ בית שמש הוא קו אחד, ותל אביב מרכז ↔ בית שמש הוא קו אחר.

לכל חודש — שבוע אחד מהארכיון (TransitFeeds עד 2022, הארכיון של דאטאבוס מ-2023):
  rail-sched/R<A><B>.json  {"m": 1, "p": [{"d", "dirs": {"1": {"from","to","n","days":
                            {"א": [[שעה, "0", הערה, מספר רכבת]]}}}}]}   — ההערה לעומת המסלול
                            הרגיל של הכיוון באותו חודש (tools/rail_hist_sched.diff_note)
  lines/R<A><B>-<כיוון>-0.json — דף קו: המסלול הרגיל (תחנות + שרטוט מהחודש האחרון),
                            גרסה חדשה כשהמסלול הרגיל השתנה, ו-removed כשהקו לא נראה עוד.
A < B בקוד התחנה; כיוון 1 = מ-A ל-B, כיוון 2 = מ-B ל-A.
"""
import collections
import datetime
import json
import os
import sys
import urllib.error
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_geo import central_dir, member_rows, stream_member  # noqa: E402
import rail_hist_sched as R  # noqa: E402

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
TF = R.TF
OB = ('https://openbus-stride-public.s3.eu-west-1.amazonaws.com'
      '/gtfs_archive/{y}/{m:02d}/{d:02d}/israel-public-transportation.zip')
START = datetime.date(2021, 9, 1)
CACHE = os.environ.get('CACHE')
NOTE = 'קו רכבת לפי תחנות הקצה — מלוחות הזמנים שפורסמו מספטמבר 2021'


def enc_num(v, out):
    v = ~(v << 1) if v < 0 else (v << 1)
    while v >= 0x20:
        out.append(chr((0x20 | (v & 0x1f)) + 63))
        v >>= 5
    out.append(chr(v + 63))


def encode_shape(pts):
    out, plat, plon = [], 0, 0
    for lat, lon in pts:
        a, b = int(round(lat * 1e5)), int(round(lon * 1e5))
        enc_num(a - plat, out)
        enc_num(b - plon, out)
        plat, plon = a, b
    return ''.join(out)


def month_days():
    """[(YYYY-MM, url)] — יום אחד בכל חודש: יום TransitFeeds הראשון מה-10 בחודש עד סוף 2022,
    ואחר כך ה-10 בחודש בארכיון של דאטאבוס."""
    tf = sorted(l.strip() for l in open(f'{OUTDIR}/tf-days.txt') if l.strip())
    out, d = [], START
    today = datetime.date.today()
    while d <= today:
        ym = d.strftime('%Y-%m')
        if d.year <= 2022:
            c = [x for x in tf if x.startswith(d.strftime('%Y%m')) and x[6:] >= '10'] or \
                [x for x in tf if x.startswith(d.strftime('%Y%m'))]
            if c:
                out.append((ym, f'{c[0][:4]}-{c[0][4:6]}-{c[0][6:]}', TF.format(ds=c[0])))
        else:
            dd = datetime.date(d.year, d.month, 10)
            if dd < today - datetime.timedelta(days=1):
                out.append((ym, dd.isoformat(), OB.format(y=dd.year, m=dd.month, d=dd.day)))
        d = (d.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    return out


def scan(day, url, want_shapes):
    """{(A, B): [(יום בשבוע, שעה, רכבת, 'קוד|קוד|…', shape_id)]}, תחנות {קוד: [שם, lat, lon]}, שרטוטים"""
    members = central_dir(url)
    c, rows = member_rows(url, members, 'routes.txt')
    rt = {r[c['route_id']]: r[c['route_desc']].strip() for r in rows if r[c['route_type']].strip() == '2'}
    c, rows = member_rows(url, members, 'calendar.txt')
    cal = {r[c['service_id']]: (r[c['start_date']], r[c['end_date']], [r[c[x]] == '1' for x in R.DAYS]) for r in rows}
    c, rows = member_rows(url, members, 'trips.txt')
    trips = {}
    for r in rows:
        if r[c['route_id']] in rt:
            trips[r[c['trip_id']]] = (rt[r[c['route_id']]], r[c['service_id']],
                                      r[c['shape_id']] if 'shape_id' in c else '')
    c, rows = member_rows(url, members, 'stops.txt')
    code, st = {}, {}
    for r in rows:
        k = (r[c['stop_code']] if 'stop_code' in c else '') or r[c['stop_id']]
        code[r[c['stop_id']]] = k
        st[k] = [R.clean(r[c['stop_name']]), float(r[c['stop_lat']]), float(r[c['stop_lon']])]
    tst = collections.defaultdict(list)
    hdr, rest = None, ['']

    def feed(b):
        nonlocal hdr
        txt = rest[0] + b.decode('utf-8', 'replace')
        lines = txt.split('\n')
        rest[0] = lines.pop()
        for ln in lines:
            p = ln.rstrip('\r').lstrip('﻿').split(',')
            if hdr is None:
                hdr = {x.strip(): i for i, x in enumerate(p)}
                continue
            if p[hdr['trip_id']] in trips:
                tst[p[hdr['trip_id']]].append((int(p[hdr['stop_sequence']]), code.get(p[hdr['stop_id']], p[hdr['stop_id']]),
                                               p[hdr['departure_time']][:5]))
    stream_member(url, members, 'stop_times.txt', feed)
    d0 = datetime.date.fromisoformat(day)
    week = {}
    for k in range(7):
        x = d0 + datetime.timedelta(days=k)
        week[(x.weekday() + 1) % 7] = x.strftime('%Y%m%d')
    pairs = collections.defaultdict(list)
    for tid, (tn, svc, shp) in trips.items():
        s = sorted(tst.get(tid, []))
        if len(s) < 2 or svc not in cal:
            continue
        seq = [x[1] for x in s]
        sd, ed, fl = cal[svc]
        for wd, ds in week.items():
            if fl[wd] and sd <= ds <= ed:
                pairs[(seq[0], seq[-1])].append((wd, s[0][2], tn, '|'.join(seq), shp))
    shapes = {}
    if want_shapes:
        need = set()
        for v in pairs.values():
            cnt = collections.Counter((x[3], x[4]) for x in v)
            need.add(cnt.most_common(1)[0][0][1])
        need.discard('')
        pts = collections.defaultdict(list)
        hdr2, rest2 = None, ['']

        def feed2(b):
            nonlocal hdr2
            txt = rest2[0] + b.decode('utf-8', 'replace')
            lines = txt.split('\n')
            rest2[0] = lines.pop()
            for ln in lines:
                p = ln.rstrip('\r').lstrip('﻿').split(',')
                if hdr2 is None:
                    hdr2 = {x.strip(): i for i, x in enumerate(p)}
                    continue
                if p[hdr2['shape_id']] in need:
                    pts[p[hdr2['shape_id']]].append((int(p[hdr2['shape_pt_sequence']]),
                                                     float(p[hdr2['shape_pt_lat']]), float(p[hdr2['shape_pt_lon']])))
        stream_member(url, members, 'shapes.txt', feed2)
        shapes = {k: encode_shape([(a, b) for _, a, b in sorted(v)]) for k, v in pts.items()}
    return {'pairs': {f'{a}>{b}': v for (a, b), v in pairs.items()}, 'st': st, 'shapes': shapes}


def city_of_name(name):
    return next((cc for p, cc in R.CITY_PREFIX if name.startswith(p)), '')


def main():
    months = month_days()
    print(f'{len(months)} חודשים · {months[0][0]}–{months[-1][0]}', flush=True)
    if CACHE:
        os.makedirs(CACHE, exist_ok=True)

    def one(item):
        i, (ym, day, url) = item
        f = f'{CACHE}/now-{ym}.json' if CACHE else None
        if f and os.path.exists(f):
            return ym, day, json.load(open(f, encoding='utf-8'))
        for attempt in range(3):
            try:
                res = scan(day, url, i == len(months) - 1)
                break
            except urllib.error.HTTPError as e:
                print('לא זמין', ym, e, flush=True)
                return ym, day, None
            except Exception as e:  # noqa: BLE001
                print('נכשל', ym, attempt + 1, e, flush=True)
        else:
            return ym, day, None
        if f:
            json.dump(res, open(f, 'w', encoding='utf-8'), ensure_ascii=False)
        print(ym, day, len(res['pairs']), 'זוגות', flush=True)
        return ym, day, res
    with ThreadPoolExecutor(int(os.environ.get('WORKERS', '6'))) as ex:
        res = [r for r in ex.map(one, enumerate(months)) if r[2]]
    res.sort()
    st = {}
    for _, _, r in res:
        st.update(r['st'])
    names = {k: v[0] for k, v in st.items()}
    lines = collections.defaultdict(lambda: collections.defaultdict(dict))  # key -> dir -> ym -> rows
    for ym, day, r in res:
        for k, v in r['pairs'].items():
            a, b = k.split('>')
            if a == b:
                continue
            lo, hi = sorted((a, b))
            lines[f'R{lo}{hi}'][('1' if a == lo else '2')][(ym, day)] = v
    shapes = res[-1][2]['shapes'] if res else {}
    last_ym = res[-1][0] if res else ''
    os.makedirs(f'{OUTDIR}/rail-sched', exist_ok=True)
    nfiles = 0
    for mk, dirs in lines.items():
        periods = {}
        for dr, bym in dirs.items():
            for (ym, day), rows in bym.items():
                cnt = collections.Counter(x[3] for x in rows)
                main_ = cnt.most_common(1)[0][0].split('|')
                notes, rowsd = [], {}
                byd = collections.defaultdict(set)
                for wd, t, tn, seq, _ in rows:
                    byd[R.HE[wd]].add((t, tn, seq))
                for wd in R.HE:
                    if wd not in byd:
                        continue
                    rr = []
                    for t, tn, seq in sorted(byd[wd]):
                        n = R.diff_note(seq.split('|'), main_, names, {})
                        if n and n not in notes:
                            notes.append(n)
                        rr.append([t, '0', notes.index(n) if n else -1, tn])
                    rowsd[wd] = rr
                p = periods.setdefault(ym, {'d': day, 'ym': ym, 'dirs': {}})
                p['dirs'][dr] = {'from': names.get(main_[0], ''), 'to': names.get(main_[-1], ''), 'n': notes, 'days': rowsd}
        json.dump({'m': 1, 'p': [periods[k] for k in sorted(periods)]},
                  open(f'{OUTDIR}/rail-sched/{mk}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        # דף קו לכל כיוון: המסלול הרגיל, גרסה חדשה כשהשתנה, removed כשנעלם
        for dr, bym in dirs.items():
            versions, prev = [], None
            yms = sorted(bym)
            for ym, day in yms:
                rows = bym[(ym, day)]
                cnt = collections.Counter((x[3], x[4]) for x in rows)
                (seq, shp), _ = cnt.most_common(1)[0]
                if seq != prev:
                    stops = [[s, names.get(s, s), st.get(s, [0, 0, 0])[1], st.get(s, [0, 0, 0])[2]] for s in seq.split('|')]
                    v = {'d': day, 'k': 'baseline' if prev is None else 'snapshot', 'src': 'rail-now', 'stops': stops,
                         'note': NOTE if prev is None else 'המסלול הרגיל של הקו השתנה (התחנות שבהן עוצרות רוב הרכבות)'}
                    versions.append(v)
                    prev = seq
            if ym != last_ym:
                nxt = next((m for m in res if m[0] > ym), None)
                versions.append({'d': nxt[1] if nxt else day, 'k': 'removed', 'src': 'rail-now', 'stops': [],
                                 'sd': day, 'note': 'הקו לא מופיע עוד בלוחות הזמנים'})
            else:
                rows = bym[(ym, day)]
                shp = collections.Counter((x[3], x[4]) for x in rows).most_common(1)[0][0][1]
                if shapes.get(shp):
                    last = [v for v in versions if v['k'] != 'removed'][-1]
                    last['shp'] = shapes[shp]
            seq0 = versions[0]['stops']
            a, b = seq0[0], seq0[-1]
            dest = f"{a[1]}-{city_of_name(a[1]) or a[1]}<->{b[1]}-{city_of_name(b[1]) or b[1]}"
            lf = {'rd': f'{mk}-{dr}-0', 'line': '', 'dest': dest, 'op': 'רכבת ישראל', 'ty': '', 'tt': 'rail',
                  'versions': versions}
            json.dump(lf, open(f'{OUTDIR}/lines/{mk}-{dr}-0.json', 'w', encoding='utf-8'),
                      ensure_ascii=False, separators=(',', ':'))
            nfiles += 1
    print('קווי רכבת מ-2021:', len(lines), 'קווים ·', nfiles, 'דפי כיוון')


if __name__ == '__main__':
    main()
