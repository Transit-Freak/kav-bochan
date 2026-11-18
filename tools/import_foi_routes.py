#!/usr/bin/env python3
"""היסטוריית מסלולים 2013–2017 מקובץ "מסלול לפי שנים" של משרד התחבורה (תשובה לבקשת חופש מידע).

המקור: חמישה קבצים (שנה לכל קובץ) בשחרור data-foi-routes-2013-2017. שורה לכל תחנה בכל גרסת מסלול
של מק"ט בכל שנה. העמודות שהמשמעות שלהן לא כתובה בקובץ נבדקו מול הצילומים של 2015–2016:
- `makat` = מק"ט_כיוון_חלופה_גרסה. החלופה כתובה כמו ב-GTFS (# ראשית, ספרות, אותיות), כך שהמזהה
  של הווריאנט הוא בדיוק ה-rd של הקו בזמן.
- `max_date` = היום האחרון שבו גרסת המסלול נסעה (הצילום האחרון של קו שבוטל נופל עליו).
- `freq` = מספר הנסיעות של הגרסה באותה שנה (קו של שתי נסיעות ביום חול: כ-2 × ימי החול שבין התאריכים).
- שמות התחנות בקובץ הם השמות המאוחרים של המשרד, לא השמות שהיו אז. לכן שם ומיקום של תחנה נלקחים
  קודם מהקו עצמו, אחר כך מצילום התחנות של 11.09.2015, ורק אם אין — מהקובץ.
- קובץ 2013 מכסה רק את הימים האחרונים של דצמבר 2013.

מה נכנס לקו (src "mot-foi"):
- רק לפני התיעוד הרשמי הראשון של הקו מ-12.2013 ואילך (הצילומים של 2015 והלאה, GTFS). מקור מאוחר
  יותר לא נדרס. קו שאין לו תיעוד רשמי בכלל (הסתיים לפני 2015 או נעלם בין צילומים) מקבל את כל ההיסטוריה.
- גרסאות רצופות עם אותן תחנות הן מצב אחד; אירוע נרשם רק כשרצף התחנות משתנה.
- תאריך שינוי = יום אחרי הנסיעה האחרונה של המסלול הקודם. התאריך מוצג בדיוק של חודש (`ap`).
- בפער ארוך בין צילומים רשמיים, שינוי רשמי שהקובץ מראה את אותו מעבר בדיוק מקבל `foiD` (מועד משוער).

הרצה חוזרת מוחקת קודם את כל מה שהכלי כתב, ולכן היא אידמפוטנטית.
"""
import argparse
import collections
import csv
import datetime
import gzip
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compact_lines import compact, materialize  # noqa: E402
from backfill_tf import classify  # noqa: E402

SRC = 'mot-foi'
YEARS = range(2013, 2018)
DATA_START = '2013-12-30'   # קובץ 2013 מתחיל כאן (ארבע נסיעות לקו של שתי נסיעות ביום חול)
DATA_END = '2017-12-31'
OFFICIAL_FROM = '2013-12-01'
STOP_KINDS = {'stops', 'stops-add', 'stops-del', 'route', 'extend', 'shorten', 'terminal'}
NOTE_BASE = 'נתוני משרד התחבורה (חופש מידע, "מסלול לפי שנים")'


def fsafe(rd):
    return rd.replace('#', 'H').replace('/', '_')


def day(s):
    return datetime.date.fromisoformat(s)


def plus(s, n):
    return (day(s) + datetime.timedelta(days=n)).isoformat()


def fmt(s):
    return f'{s[8:10]}.{s[5:7]}.{s[:4]}'


def load_foi(folder, only=None):
    """{rd: {vid: {'max', 'trips': {year: n}, 'stops': [(order, code, name, lat, lon, city)]}}}"""
    out = collections.defaultdict(dict)
    for y in YEARS:
        p = Path(folder) / f'routes-by-year-{y}.csv.gz'
        with gzip.open(p, 'rt', encoding='utf-8-sig') as f:
            for r in csv.DictReader(f):
                mk, d, a, vid = r['makat'].split('_')
                rd = f'{mk}-{d}-{a}'
                if only and rd not in only:
                    continue
                v = out[rd].get(vid)
                if v is None:
                    v = out[rd][vid] = {'max': r['max_date'], 'trips': {}, 'stops': {}, 'years': set()}
                if y not in v['years']:
                    v['years'].add(y)
                    v['trips'][y] = int(r['freq'] or 0)
                v['stops'][int(r['StationOrder'])] = (r['StationId'], r['StationName'].strip(),
                                                      r['Lat'], r['Long'], r['yishuv_nm'].strip())
    for vs in out.values():
        for v in vs.values():
            v['stops'] = [v['stops'][k] for k in sorted(v['stops'])]
    return out


def states(vs):
    """גרסאות רצופות (לפי היום האחרון) עם אותו רצף תחנות → מצב אחד."""
    order = sorted(vs.items(), key=lambda kv: (kv[1]['max'], int(kv[0]) if kv[0].isdigit() else 0))
    out = []
    for vid, v in order:
        codes = [s[0] for s in v['stops']]
        if out and out[-1]['codes'] == codes:
            g = out[-1]
            g['vids'].append(vid)
            g['end'] = max(g['end'], v['max'])
            for y, n in v['trips'].items():
                g['trips'][y] = g['trips'].get(y, 0) + n
        else:
            out.append({'codes': codes, 'stops': v['stops'], 'vids': [vid], 'end': v['max'],
                        'first_year': min(v['years']), 'first_end': v['max'], 'trips': dict(v['trips'])})
    for i, g in enumerate(out):
        g['start'] = plus(out[i - 1]['end'], 1) if i else None
    return out


class Names:
    """שם ומיקום של תחנה בזמן הנכון: הקו עצמו ← צילום 11.09.2015 ← הקובץ."""

    def __init__(self, ref_path):
        self.ref = {}
        if ref_path and os.path.exists(ref_path):
            raw = gzip.decompress(open(ref_path, 'rb').read())
            for s in json.loads(raw)['stops']:
                self.ref.setdefault(s['c'], [s['n'], s['la'], s['lo']])

    def stop(self, s, own):
        code, name, lat, lon, _ = s
        if code in own:
            return [code, own[code][0], own[code][1], own[code][2]]
        if code in self.ref:
            r = self.ref[code]
            return [code, r[0], r[1], r[2]]
        try:
            return [code, name, float(lat), float(lon)]
        except ValueError:
            return [code, name or code, None, None]


def strip_previous(lf):
    lf['versions'] = [v for v in lf.get('versions', []) if v.get('src') != SRC]
    for v in lf['versions']:
        v.pop('foiD', None)
    return lf


def line_meta(rd, groups, siblings):
    mk = rd.split('-')[0]
    sib = siblings.get(mk) or []
    lines = {s['line'] for s in sib if s.get('line')}
    first, last = groups[0]['stops'][0], groups[-1]['stops'][-1]
    meta = {'rd': rd, 'line': '', 'dest': f'{first[1]}-{first[4]}<->{last[1]}-{last[4]}',
            'op': '', 'tt': None, 'ty': ''}   # המפעיל של היום אינו בהכרח המפעיל של אז
    if len(lines) == 1:
        meta['line'] = lines.pop()
    elif mk.isdigit():
        # 95% מהמק"טים בקו בזמן: מספר הקו הוא שלוש הספרות האחרונות. מסומן כמשוער
        meta['line'] = str(int(mk[-3:]))
        meta['lineGuess'] = 1
    return meta


def build(rd, foi_vs, lf, names, siblings, stats):
    groups = states(foi_vs)
    if not groups:
        return None
    new_file = not lf
    if new_file:
        lf = {**line_meta(rd, groups, siblings), 'versions': [], 'historicalOnly': True, 'foiOnly': 1}
        stats['newLines'] += 1
    lf = strip_previous(materialize(lf))
    vs = lf['versions']
    official = [v for v in vs if not v.get('hid') and v.get('src') != 'websiteArchive' and v.get('stops') is not None]
    later = [v for v in official if v['d'] >= OFFICIAL_FROM]
    t0 = min((v['d'] for v in later), default=None)
    own = {}
    for v in sorted(official, key=lambda v: v['d']):
        for s in v.get('stops') or []:
            own.setdefault(s[0], s[1:])

    def stops_of(g):
        return [names.stop(s, own) for s in g['stops']]

    added = []
    earlier = [v for v in official if v['d'] < (groups[0]['start'] or DATA_START) and v.get('stops')]
    for i, g in enumerate(groups):
        sd = None
        if i == 0 and g['first_year'] == 2013:
            d, ap = DATA_START, 'm'
        elif i == 0:
            # לא היה בקובץ של השנה הקודמת: התחיל בין תחילת השנה לבין היום האחרון של הגרסה הראשונה
            sd, d, ap = f"{g['first_year']}-01-01", g['first_end'], 'r'
        else:
            d, ap = g['start'], 'm'
        if t0 and d >= t0:
            break
        st = stops_of(g)
        v = {'d': d, 'src': SRC, 'stops': st, 'shp': '', 'ap': ap, 'foiVer': g['vids'], 'foiEnd': g['end']}
        if sd:
            v['sd'] = sd
        if i == 0:
            if earlier:
                base = earlier[-1]
                kind, add, rem = classify(base['stops'], st, '', '')
                if not kind:
                    continue
                v.update(k=kind, sd=base['d'], ap='r')
                if add: v['add'] = add
                if rem: v['rem'] = rem
                v['note'] = f'{NOTE_BASE}: השינוי מהתיעוד הקודם ({fmt(base["d"])}) קרה לפני {fmt(d)}; המועד המדויק אינו ידוע.'
            elif g['first_year'] == 2013:
                v['k'] = 'baseline'
                v['note'] = f'{NOTE_BASE}: הקובץ מתחיל בסוף 2013, והקו כבר נסע אז. מועד הפתיחה אינו ידוע.'
            elif g['first_year'] == 2014:
                # קובץ 2013 מכסה רק ימים ספורים — קו שלא נסע בהם אולי נסע גם לפני כן
                v['k'] = 'baseline'
                v['note'] = f'{NOTE_BASE}: מופיע בקובץ לראשונה ב-2014 (עד {fmt(d)}). ייתכן שנסע גם קודם.'
            else:
                v['k'] = 'new'
                v['note'] = f'{NOTE_BASE}: לא נסע ב-{g["first_year"] - 1}; התחיל בין {fmt(sd)} ל-{fmt(d)}.'
        else:
            p = groups[i - 1]
            kind, add, rem = classify(stops_of(p), st, '', '')
            v.update(k=kind or 'stops', sd=p['end'])
            if add: v['add'] = add
            if rem: v['rem'] = rem
            v['note'] = f'{NOTE_BASE}: המסלול הקודם נסע לאחרונה ב-{fmt(p["end"])}.'
        added.append(v)
    if added and lf.get('foiOnly'):
        added[0]['note'] += (' הקו מוכר רק מהקובץ הזה: ' + ('מספר הקו משוער לפי המק״ט, ' if lf.get('lineGuess') else '')
                             + 'המפעיל אינו ידוע, והמפה מחברת את התחנות בקווים ישרים.')
    # בלי תיעוד רשמי אחרי הקובץ — גם הסיום מהקובץ
    last = groups[-1]
    if not t0 and last['end'] < DATA_END and (not added or added[-1]['foiVer'] == last['vids']):
        added.append({'d': plus(last['end'], 1), 'sd': last['end'], 'k': 'removed', 'src': SRC, 'ap': 'm',
                      'note': f'{NOTE_BASE}: הנסיעה האחרונה ב-{fmt(last["end"])}.'})
    # בדיקת עקביות: המצב בקובץ ביום התיעוד הרשמי הראשון מול התיעוד עצמו
    if t0:
        at = next((g for g in groups if (g['start'] or DATA_START) <= t0 <= g['end']), None)
        first_off = next(v for v in sorted(later, key=lambda v: v['d']) if v['d'] == t0)
        if at and first_off.get('stops'):
            same = at['codes'] == [s[0] for s in first_off['stops']]
            stats['t0Same' if same else 't0Diff'] += 1
        # פער בין צילומים רשמיים: שינוי שהקובץ מראה בדיוק אותו מעבר — מועד משוער
        srt = sorted([v for v in later if v.get('stops')], key=lambda v: v['d'])
        for a, b in zip(srt, srt[1:]):
            if b.get('k') not in STOP_KINDS or not b.get('sd') or (day(b['d']) - day(b['sd'])).days <= 3:
                continue
            ac, bc = [s[0] for s in a['stops']], [s[0] for s in b['stops']]
            for j in range(1, len(groups)):
                g, p = groups[j], groups[j - 1]
                if b['sd'] <= g['start'] <= b['d'] and g['codes'] == bc and p['codes'] == ac:
                    b['foiD'] = g['start']
                    stats['foiD'] += 1
                    break
    if not added and not any(v.get('foiD') for v in vs):
        return None
    vs.extend(added)
    vs.sort(key=lambda x: x['d'])
    stats['versions'] += len(added)
    stats['lines'] += 1
    for v in added:
        stats['k_' + v['k']] += 1
    return lf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--foi-dir', required=True)
    ap.add_argument('--stops-ref', help='early-stops של 11.09.2015 (json.gz)')
    ap.add_argument('--only', help='רשימת rd מופרדת בפסיקים')
    ap.add_argument('--out', default=os.environ.get('OUTDIR', 'line-history/data'))
    args = ap.parse_args()
    out = Path(args.out)
    only = set(args.only.split(',')) if args.only else None
    foi = load_foi(args.foi_dir, only)
    names = Names(args.stops_ref)
    idx = json.load(open(out / 'lines.json', encoding='utf-8')) if (out / 'lines.json').exists() else {'lines': []}
    siblings = collections.defaultdict(list)
    for e in idx['lines']:
        p = e['rd'].split('-')
        if len(p) == 3 and p[0].isdigit():
            siblings[p[0]].append(e)
    stats = collections.Counter()
    for rd in sorted(foi):
        if not re.fullmatch(r'\d+-\d+-[^-/]+', rd):
            stats['skippedRd'] += 1
            continue
        p = out / 'lines' / f'{fsafe(rd)}.json'
        lf = json.load(open(p, encoding='utf-8')) if p.exists() else {}
        res = build(rd, foi[rd], lf, names, siblings, stats)
        if res is None:
            stats['noInfo'] += 1
            continue
        packed = compact(res)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(packed, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    stats['variants'] = len(foi)
    summary = dict(sorted(stats.items()))
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    (out / 'foi-import.json').write_text(json.dumps({'source': 'data-foi-routes-2013-2017', **summary},
                                                    ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
