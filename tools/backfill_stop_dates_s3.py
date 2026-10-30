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
from compact_lines import compact, materialize  # noqa: E402

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
    """לכל rd מתוך want: רצף התחנות של נסיעת הנציג ביום d, או None.
    אותו כלל בחירה כמו ב-linehistory.py (שממנו הגיעו הרצפים בקובצי הקו): שירות שבתוקף ביום d
    (חלון התאריכים, בלי דגלי ימי השבוע), התבנית (shape) שרוב הנסיעות רצות בה, ובתוכה מזהה הנסיעה
    הקטן ביותר. נסיעה שרירותית הייתה מחליפה תבנית מיום ליום ומייצרת "שינויים" שלא קרו."""
    key = {norm_rd(rd): rd for rd in want}
    route_rd = {}
    for r in rows(z, 'routes.txt'):
        k = norm_rd(r.get('route_desc'))
        if k in key:
            route_rd[r['route_id']] = key[k]
    ds = d.strftime('%Y%m%d')
    active = {c['service_id'] for c in rows(z, 'calendar.txt')
              if (c.get('start_date') or '0') <= ds <= (c.get('end_date') or '9')}
    cnt = collections.defaultdict(collections.Counter)   # route_id -> {shape: נסיעות}
    first = {}                                            # (route_id, shape) -> מזהה הנסיעה הקטן ביותר
    for t in rows(z, 'trips.txt'):
        rid, sh, tid = t['route_id'], t.get('shape_id') or '', t['trip_id']
        if rid in route_rd and sh and t['service_id'] in active:
            cnt[rid][sh] += 1
            if (rid, sh) not in first or tid < first[(rid, sh)]:
                first[(rid, sh)] = tid
    trip_rd = {}
    for rid, shapes in cnt.items():
        sh = min(shapes, key=lambda x: (-shapes[x], x))
        trip_rd[first[(rid, sh)]] = route_rd[rid]
    st = collections.defaultdict(list)
    with z.open('stop_times.txt') as f:
        head = f.readline().decode('utf-8-sig').strip().split(',')
        it, isd, iseq = head.index('trip_id'), head.index('stop_id'), head.index('stop_sequence')
        for line in io.TextIOWrapper(f, 'utf-8'):
            c = line.split(',', iseq + 1)
            if c[it] in trip_rd:
                st[c[it]].append((int(c[iseq]), c[isd]))
    need = {sid for v in st.values() for _, sid in v}
    stops = {}
    for s in rows(z, 'stops.txt'):
        if s['stop_id'] in need:
            try:
                stops[s['stop_id']] = [s['stop_code'], ' '.join(s['stop_name'].split()),
                                       round(float(s['stop_lat']), 5), round(float(s['stop_lon']), 5)]
            except (TypeError, ValueError):
                pass
    out = {rd: None for rd in want}
    for tid, lst in st.items():
        seq = [stops[sid] for _, sid in sorted(lst) if sid in stops]
        if len(seq) >= 2:
            out[trip_rd[tid]] = seq
    return out


def sig(seq):
    return hashlib.md5('|'.join(s[0] for s in seq).encode()).hexdigest()[:10]


def load_targets():
    """המטרות מקובץ (TARGETS, שחושב פעם אחת בשלב הראשון של התהליך) או מחישוב מחדש מקובצי הקו."""
    p = os.environ.get('TARGETS')
    if p:
        return [tuple(t) for t in json.load(open(p, encoding='utf-8'))]
    return targets()


def sample(a, b, out):
    T = load_targets()
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
        # הקובץ של יום dd מכיל את הלו"ז מ-dd והלאה; כשנלקח קובץ מאוחר יותר — בודקים לפי היום שלו
        got = seqs_on(z, max(d, dd), by_date[d])
        z.close()
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


def codes(seq):
    return {s[0] for s in seq}


def diff(a, b):
    """(נוספו, ירדו) — שמות וגם קודים, כמו ב-enrich_stop_diffs.py (ac/rc מיושרים לשמות)."""
    ac, bc = codes(a), codes(b)
    add = [s for s in b if s[0] not in ac]
    rem = [s for s in a if s[0] not in bc]
    return [s[1] for s in add], [s[1] for s in rem], [str(s[0]) for s in add], [str(s[0]) for s in rem]


def set_diff(v, a, b):
    add, rem, ac, rc = diff(a, b)
    for k, x in (('add', add), ('rem', rem), ('ac', ac), ('rc', rc)):
        if x:
            v[k] = x
        else:
            v.pop(k, None)


def fmt(d):
    return f'{d[8:10]}.{d[5:7]}.{d[:4]}'


def changes(samp, lo, lo_seq, hi, hi_seq):
    """השרשרת: הרשומה הקודמת ← הדגימות השבועיות ← הרשומה עצמה. לכל מעבר שבו קבוצת התחנות השתנתה:
    (התאריך שבו נראה לראשונה, התאריך האחרון שבו עוד נראה המצב הקודם, רצף לפני, רצף אחרי).
    "הבהוב" — דגימה בודדת שונה שבין שתי דגימות זהות — לא נספר (נסיעת נציג חריגה בשבוע אחד)."""
    chain = [(lo, lo_seq)] + [(d, s) for d, s in samp if lo < d < hi] + [(hi, hi_seq)]
    keep = [chain[0]]
    for j in range(1, len(chain)):
        if j + 1 < len(chain) and codes(chain[j][1]) != codes(keep[-1][1]) \
           and codes(chain[j + 1][1]) == codes(keep[-1][1]):
            continue
        keep.append(chain[j])
    out = []
    for (d0, s0), (d1, s1) in zip(keep, keep[1:]):
        if codes(s0) != codes(s1):
            out.append((d1, d0, s0, s1))
    return out


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
    for t in load_targets():
        by_file[t[0]].append(t)
    n = collections.Counter()
    for fn, ts in sorted(by_file.items()):
        p = f'{OUTDIR}/lines/{fn}'
        try:
            lf = materialize(json.load(open(p, encoding='utf-8')))
        except Exception:  # noqa: BLE001
            continue
        vs = lf.get('versions', [])
        new_evs = []
        changed = False
        for _, i, prev_i, rd, lo, hi in ts:
            # הקובץ השתנה מאז שחושבו המטרות — מדלגים (ייבדק שוב בריצה הבאה)
            if i >= len(vs) or prev_i >= len(vs) or vs[i]['d'] != hi or vs[prev_i]['d'] != lo \
               or lf.get('rd') != rd or vs[i].get('dated') or not (vs[i].get('stops') and vs[prev_i].get('stops')):
                n['stale'] += 1
                continue
            v, pv = vs[i], vs[prev_i]
            samp = [(d.isoformat(), dates.get(d.isoformat(), {}).get(rd)) for d in grid(lo, hi)]
            samp = [(d, seqs[rd][h]) for d, h in samp if h and h in seqs.get(rd, {})]
            if not samp:
                skip[f'{rd}|{v["d"]}'] = 'אין דגימות בארכיון ה-GTFS בפער'
                n['skip'] += 1
                continue
            res = changes(samp, lo, pv['stops'], hi, v['stops'])
            residual = []
            for d_found, d_prev, s_before, s_after in res:
                if days(d_found, v['d']) <= 7:
                    # השינוי קרה בשבוע של רשומת העוגן — הדיף נשאר עליה
                    residual.append((d_found, d_prev, s_before, s_after))
                    continue
                add, rem, ac, rc = diff(s_before, s_after)
                kind = 'stops' if (add and rem) else ('stops-add' if add else 'stops-del')
                if days(d_prev, d_found) <= 7:
                    note = 'התאריך אותר בארכיון ה-GTFS — דיוק של עד שבוע'
                else:
                    # בין שתי הדגימות אין נתונים (הקו לא פעל, או לפני תחילת הארכיון) — הטווח המלא
                    note = f'התחנות השתנו מתישהו בין {fmt(d_prev)} ל-{fmt(d_found)} (ארכיון ה-GTFS)'
                ev = {'d': d_found, 'k': kind, 'src': 'ob', 'stops': s_after, 'note': note}
                set_diff(ev, s_before, s_after)
                new_evs.append(ev)
                n['events'] += 1
                if days(d_prev, d_found) > 7:
                    n['events_coarse'] += 1
            if residual:
                # נשאר שינוי בשבוע העוגן — מצמצמים את הדיף עליו לשינוי הזה בלבד
                set_diff(v, residual[-1][2], residual[-1][3])
                n['residual'] += 1
            else:
                for k in ('add', 'rem', 'ac', 'rc'):
                    v.pop(k, None)
            if v.get('gd'):
                v.pop('gd', None)
                v.pop('note', None)
            v['dated'] = 1
            n['dated'] += 1
            changed = True
        if changed:
            vs.extend(new_evs)
            vs.sort(key=lambda x: x['d'])
            lf['versions'] = vs
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(compact(lf), f, ensure_ascii=False, separators=(',', ':'))
            n['files'] += 1
    json.dump(skip, open(skip_p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f"סיום: תוארכו {n['dated']} פערים ב-{n['files']} קבצים | נוצרו {n['events']} אירועים "
          f"({n['events_coarse']} בטווח של יותר משבוע) | דיף שנשאר על העוגן {n['residual']} | "
          f"בלי דגימות {n['skip']} | השתנו מאז חישוב המטרות {n['stale']}")


if __name__ == '__main__':
    if sys.argv[1] == 'targets':
        T = targets()
        json.dump(T, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
        print(len(T), 'פערים;', len({d for t in T for d in grid(t[4], t[5])}), 'ימי דגימה')
    elif sys.argv[1] == 'sample':
        sample(sys.argv[2], sys.argv[3], sys.argv[4])
    elif sys.argv[1] == 'apply':
        apply(sys.argv[2])
    elif sys.argv[1] == 'count':
        T = load_targets()
        print(len(T), 'פערים;', len({d for t in T for d in grid(t[4], t[5])}), 'ימי דגימה')
