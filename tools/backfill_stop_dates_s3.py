# -*- coding: utf-8 -*-
# "הקו בזמן" — איתור תאריך לשינויי תחנות שהתגלו בין שתי רשומות רחוקות, מארכיון ה-GTFS של דאטאבוס
# ב-S3 במקום מה-API שלהם (שלמה 30.10: backfill_stop_dates.py תיארך 9 פערים בלילה, עם 10 דק' של
# בקשות לשרת שלהם, ו-21 אלף פערים חיכו). קובץ GTFS של יום אחד מכיל את כל הקווים בארץ, ולכן כל
# יום בארכיון נקרא פעם אחת ועונה לכל הפערים שעוברים בו — במקום חיפוש בינארי קו-קו מול ה-API.
#
# שני שלבים (אפשר להריץ את הראשון במקביל, רבעון לכל ריצה):
#   sample FROM TO OUT.json.gz — לכל שלישי בין FROM ל-TO: הקובץ של אותו יום בארכיון (או יום סמוך),
#       ולכל קו שהפער שלו עובר ביום הזה — רצף התחנות של נסיעה אחת שפעלה באותו יום.
#       פלט: {"dates": {יום: {rd: חתימה}}, "seqs": {rd: {חתימה: [[קוד, שם, רוחב, אורך]…]}}}
#   apply DIR — מאחד את כל קובצי הדגימה, ולכל פער: התאריך (בדיוק של שבוע) של כל שינוי ברצף. אותו
#       פלט ואותם כללים כמו backfill_stop_dates.py: אירוע stops / stops-add / stops-del לכל שינוי,
#       והדיף יורד מרשומת העוגן.
import collections
import csv
import datetime
import gzip
import hashlib
import io
import json
import os
import sys
import time
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compact_lines import materialize  # noqa: E402

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com/gtfs_archive/{d:%Y/%m/%d}/israel-public-transportation.zip'
ARCHIVE_START = '2022-01-01'
T0 = time.time()


def days(a, b):
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def targets():
    """אותן מטרות כמו ב-backfill_stop_dates.py: אירוע עם דיף תחנות שעוד לא תוארך, בפער של יותר מ-10 ימים."""
    try:
        skip = json.load(open(f'{OUTDIR}/backfill-dates-skip.json', encoding='utf-8'))
    except Exception:  # noqa: BLE001
        skip = {}
    out = []
    for fn in sorted(os.listdir(f'{OUTDIR}/lines')):
        if not fn.endswith('.json'):
            continue
        try:
            lf = materialize(json.load(open(f'{OUTDIR}/lines/{fn}', encoding='utf-8')))
        except Exception:  # noqa: BLE001
            continue
        vs = lf.get('versions', [])
        prev_i = None
        for i, v in enumerate(vs):
            if not (v.get('stops') or []):
                continue
            if prev_i is not None and (v.get('add') or v.get('rem')) and not v.get('dated') \
               and (v.get('gd') or v.get('src') == 'ob') and f"{lf.get('rd', '')}|{v['d']}" not in skip \
               and days(vs[prev_i]['d'], v['d']) > 10 and v['d'] > ARCHIVE_START:
                out.append((fn, i, prev_i, lf.get('rd', ''), vs[prev_i]['d'], v['d']))
            prev_i = i
    return out


def grid(a, b):
    """כל יום שלישי בין a ל-b (יום חול רגיל באמצע השבוע)."""
    d = datetime.date.fromisoformat(max(a, ARCHIVE_START))
    d += datetime.timedelta(days=(1 - d.weekday()) % 7)
    end = datetime.date.fromisoformat(b)
    while d <= end:
        yield d
        d += datetime.timedelta(days=7)


def fetch_gtfs(d):
    """הקובץ של היום d בארכיון, ואם חסר — יום סמוך (הקובץ של יום X מכיל את הלו"ז מ-X והלאה)."""
    for off in (0, -1, -2, -3, 1):
        dd = d + datetime.timedelta(days=off)
        try:
            with urllib.request.urlopen(S3.format(d=dd), timeout=300) as r:
                return dd, zipfile.ZipFile(io.BytesIO(r.read()))
        except Exception:  # noqa: BLE001
            continue
    return None, None


def rows(z, name):
    return csv.DictReader(io.TextIOWrapper(z.open(name), 'utf-8-sig'))


def norm_rd(desc):
    """route_desc "11301-2-#" → אותו מבנה כמו rd בקובצי הקו."""
    p = (desc or '').strip().split('-')
    return f'{p[0].lstrip("0") or "0"}-{p[1]}-{p[2]}' if len(p) == 3 else ''


def seqs_on(z, d, want):
    """לכל rd מתוך want: רצף התחנות של נסיעה אחת שפועלת ביום d, או None."""
    key = {norm_rd(rd): rd for rd in want}
    route_rd = {}
    for r in rows(z, 'routes.txt'):
        k = norm_rd(r.get('route_desc'))
        if k in key:
            route_rd[r['route_id']] = key[k]
    wd = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')[d.weekday()]
    ds = d.strftime('%Y%m%d')
    active = {c['service_id'] for c in rows(z, 'calendar.txt')
              if c[wd] == '1' and c['start_date'] <= ds <= c['end_date']}
    trip_rd, done = {}, set()
    for t in rows(z, 'trips.txt'):
        rd = route_rd.get(t['route_id'])
        if rd and rd not in done and t['service_id'] in active:
            trip_rd[t['trip_id']] = rd
            done.add(rd)
    st = collections.defaultdict(list)
    with z.open('stop_times.txt') as f:
        head = f.readline().decode('utf-8-sig').strip().split(',')
        it, isd, iseq = head.index('trip_id'), head.index('stop_id'), head.index('stop_sequence')
        for line in io.TextIOWrapper(f, 'utf-8'):
            c = line.split(',', iseq + 1)
            if c[it] in trip_rd:
                st[c[it]].append((int(c[iseq]), c[isd]))
    need = {sid for v in st.values() for _, sid in v}
    stops = {s['stop_id']: [s['stop_code'], s['stop_name'], round(float(s['stop_lat']), 5), round(float(s['stop_lon']), 5)]
             for s in rows(z, 'stops.txt') if s['stop_id'] in need}
    out = {rd: None for rd in want}
    for tid, lst in st.items():
        seq = [stops[sid] for _, sid in sorted(lst) if sid in stops]
        if len(seq) >= 2:
            out[trip_rd[tid]] = seq
    return out


def sig(seq):
    return hashlib.md5('|'.join(s[0] for s in seq).encode()).hexdigest()[:10]


def sample(a, b, out):
    T = targets()
    print(f'פערים: {len(T)}', flush=True)
    by_date = collections.defaultdict(set)
    for _, _, _, rd, lo, hi in T:
        for d in grid(lo, hi):
            if a <= d.isoformat() <= b:
                by_date[d].add(rd)
    res = {'dates': {}, 'seqs': collections.defaultdict(dict), 'src': {}}
    for d in sorted(by_date):
        dd, z = fetch_gtfs(d)
        if not z:
            print(f'{d}: אין קובץ בארכיון', flush=True)
            continue
        got = seqs_on(z, dd, by_date[d])
        res['src'][d.isoformat()] = dd.isoformat()
        cur = res['dates'][d.isoformat()] = {}
        for rd, seq in got.items():
            if seq:
                h = sig(seq)
                cur[rd] = h
                res['seqs'][rd][h] = seq
        print(f'{d} (קובץ {dd}): {len(cur)}/{len(by_date[d])} קווים · {int((time.time() - T0) / 60)} דק׳', flush=True)
    with gzip.open(out, 'wt', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, separators=(',', ':'))


def diff(a, b):
    ac = {s[0] for s in a}
    bc = {s[0] for s in b}
    return [s[1] for s in b if s[0] not in ac], [s[1] for s in a if s[0] not in bc]


def apply(dirn):
    dates, seqs = {}, collections.defaultdict(dict)
    for fn in sorted(os.listdir(dirn)):
        if fn.endswith('.json.gz'):
            with gzip.open(f'{dirn}/{fn}', 'rt', encoding='utf-8') as f:
                r = json.load(f)
            dates.update(r['dates'])
            for rd, m in r['seqs'].items():
                seqs[rd].update(m)
    print(f'דגימות: {len(dates)} ימים', flush=True)
    skip_p = f'{OUTDIR}/backfill-dates-skip.json'
    try:
        skip = json.load(open(skip_p, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        skip = {}
    by_file = collections.defaultdict(list)
    for t in targets():
        by_file[t[0]].append(t)
    n_dated = n_events = n_skip = 0
    for fn, ts in by_file.items():
        p = f'{OUTDIR}/lines/{fn}'
        lf = materialize(json.load(open(p, encoding='utf-8')))
        vs = lf.get('versions', [])
        changed = False
        for _, i, prev_i, rd, lo, hi in ts:
            v, pv = vs[i], vs[prev_i]
            samp = [(d.isoformat(), dates.get(d.isoformat(), {}).get(rd)) for d in grid(lo, hi)]
            samp = [(d, h) for d, h in samp if h]
            if not samp:
                skip[f'{rd}|{v["d"]}'] = 'אין דגימות בארכיון ה-GTFS בפער'
                n_skip += 1
                continue
            # רצף ידוע בתחילת הפער: הרשומה הקודמת, אם היא מתוך הארכיון; לפני תחילת הארכיון — לא ידוע
            res = []
            prev_d, prev_seq = (lo, pv['stops']) if lo >= ARCHIVE_START else (None, None)
            for d, h in samp:
                s = seqs[rd][h]
                if prev_seq is not None and {x[0] for x in s} != {x[0] for x in prev_seq}:
                    res.append((d, prev_seq, s))
                prev_d, prev_seq = d, s
            # מהדגימה האחרונה לרשומה עצמה
            if prev_seq is not None and {x[0] for x in v['stops']} != {x[0] for x in prev_seq}:
                res.append((v['d'], prev_seq, v['stops']))
            for d_found, s_before, s_after in res:
                add, rem = diff(s_before, s_after)
                if not add and not rem or days(d_found, v['d']) <= 7:
                    continue
                kind = 'stops' if (add and rem) else ('stops-add' if add else 'stops-del')
                ev = {'d': d_found, 'k': kind, 'src': 'ob', 'stops': s_after,
                      'note': 'התאריך אותר בארכיון ה-GTFS — דיוק של עד שבוע'}
                if add:
                    ev['add'] = add
                if rem:
                    ev['rem'] = rem
                vs.append(ev)
                n_events += 1
            residual = [r for r in res if days(r[0], v['d']) <= 7 and (diff(r[1], r[2])[0] or diff(r[1], r[2])[1])]
            if not residual and (res or lo >= ARCHIVE_START):
                for k in ('add', 'rem'):
                    v.pop(k, None)
                if v.get('gd'):
                    v.pop('gd', None)
                    v.pop('note', None)
            elif residual:
                add, rem = diff(residual[-1][1], residual[-1][2])
                for k, x in (('add', add), ('rem', rem)):
                    if x:
                        v[k] = x
                    else:
                        v.pop(k, None)
                if v.get('gd'):
                    v.pop('note', None)
                    v.pop('gd', None)
            v['dated'] = 1
            n_dated += 1
            changed = True
        if changed:
            vs.sort(key=lambda x: x['d'])
            lf['versions'] = vs
            json.dump(lf, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(skip, open(skip_p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'סיום: תוארכו {n_dated} פערים | נוצרו {n_events} אירועים | בלי דגימות {n_skip}')


if __name__ == '__main__':
    if sys.argv[1] == 'sample':
        sample(sys.argv[2], sys.argv[3], sys.argv[4])
    elif sys.argv[1] == 'apply':
        apply(sys.argv[2])
    elif sys.argv[1] == 'count':
        T = targets()
        print(len(T), 'פערים;', len({d for t in T for d in grid(t[4], t[5])}), 'ימי דגימה')
