#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""הקו בזמן — מתי חלופה הפסיקה לנסוע, מהארכיון היומי הישן של אופן באס (2017–2022).

הארכיון הישן של הסדנא (s3.obus.hasadna.org.il) שומר קובץ GTFS של משרד התחבורה לכל יום, מ-01.2017 ועד
12.2022. ממנו נבנה בזמנו התיעוד של 2015–2018 (obusOld), אבל רק עד 31.12.2018. מ-2019 ואילך היה לנו
רק TransitFeeds, שמשמש לזיהוי שינויי מסלול — כשחלופה נעלמה או נשארה בלי נסיעות זה לא נרשם (שלמה
27.11: קווים 301 ו-311 בתחנה 14718 — לפי האתר עוצרים שם עד היום, ובפועל הפסיקו ב-2020 וב-2021).

כאן נקבע לכל חלופה היום האחרון שבו היו לה נסיעות בארכיון. חלופה שהתיעוד שלה נגמר בלי ביטול, ושאחרי
היום הזה אין עליה שום רישום, מקבלת "בוטלה" ביום הבא בארכיון — עם הטווח (sd) כמו בשאר האתר.

  days    FROM TO OUT            רשימת הימים בארכיון בטווח (קובץ JSON)
  sample  FROM TO OUT.json.gz    לכל יום: החלופות שיש להן לפחות נסיעה אחת → {rd: [ראשון, אחרון]}
  apply   SAMPLES_DIR            איחוד, obus-late-seen.json, וסימון הביטולים בקובצי הקווים
"""
import glob
import gzip
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_geo import central_dir, member_rows  # noqa: E402

BUCKET = 'https://s3-eu-west-1.amazonaws.com/s3.obus.hasadna.org.il'
OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
SRC = 'obusLate'
# הארכיון נגמר ב-27.12.2022. חלופה שנראתה בחודש האחרון שלו — לא יודעים אם המשיכה, וזה כבר תפקיד
# הסריקה של דאטאבוס (2022 ואילך). לכן מסמנים רק מי שנעלמה לפני כן.
UNTIL = os.environ.get('UNTIL', '2022-11-30')


def bucket_days():
    days, tok = [], None
    while True:
        u = BUCKET + '/?list-type=2&max-keys=1000' + (
            '&continuation-token=' + urllib.request.quote(tok) if tok else '')
        x = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'kav-bochan/line-history'}),
                                   timeout=120).read().decode()
        days += re.findall(r'<Key>(\d{4}-\d\d-\d\d)\.zip</Key>', x)
        m = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', x)
        if not m:
            return sorted(set(days))
        tok = m.group(1)


def day_variants(day):
    """החלופות שיש להן לפחות נסיעה אחת בקובץ של היום (route_desc = מק"ט-כיוון-חלופה)."""
    u = f'{BUCKET}/{day}.zip'
    m = central_dir(u)
    m = m[0] if isinstance(m, tuple) else m
    h, rows = member_rows(u, m, 'routes.txt')
    r2d = {}
    for r in rows:
        d = r[h['route_desc']].strip()
        if re.fullmatch(r'\d+-[^-]+-[^-]+', d):
            r2d[r[h['route_id']]] = d
    # נסיעה נספרת רק אם לוח השירות שלה עוד בתוקף ביום הקובץ: בקובץ נשארות לפעמים נסיעות שתוקפן נגמר
    # אתמול (קו 301 חלופה ר: הנסיעה האחרונה ב-03.06.2021 עוד הופיעה בקובץ של 04.06)
    ymd = day.replace('-', '')
    try:
        h, rows = member_rows(u, m, 'calendar.txt')
        live = {r[h['service_id']] for r in rows if r[h['end_date']] >= ymd}
    except (KeyError, ValueError):
        live = None
    h, rows = member_rows(u, m, 'trips.txt')
    return {r2d[r[h['route_id']]] for r in rows
            if r[h['route_id']] in r2d and (live is None or r[h['service_id']] in live)}


def cmd_days(a, b, out):
    days = [d for d in bucket_days() if a <= d <= b]
    json.dump(days, open(out, 'w'))
    print(f'{len(days)} ימים בארכיון בין {a} ל-{b}')


def cmd_sample(a, b, out):
    days = [d for d in bucket_days() if a <= d <= b]
    seen, ok, bad = {}, [], []
    t0 = time.time()
    for d in days:
        try:
            vs = day_variants(d)
        except Exception as e:  # noqa: BLE001 — קובץ פגום או ניתוק: נרשם ולא מפיל את הרבעון
            bad.append(d)
            print(f'  {d}: דילוג — {type(e).__name__}: {str(e)[:80]}', flush=True)
            continue
        if not vs:
            bad.append(d)
            continue
        ok.append(d)
        for rd in vs:
            s = seen.get(rd)
            seen[rd] = [d, d] if not s else [min(s[0], d), max(s[1], d)]
        print(f'  {d}: {len(vs)} חלופות עם נסיעות ({time.time() - t0:.0f} ש\')', flush=True)
    with gzip.open(out, 'wt', encoding='utf-8') as f:
        json.dump({'ok': ok, 'bad': bad, 'seen': seen}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(ok)} ימים · {len(bad)} דולגו · {len(seen)} חלופות')


def merge(samples_dir):
    ok, bad, seen = [], [], {}
    for p in sorted(glob.glob(os.path.join(samples_dir, '*.json.gz'))):
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            s = json.load(f)
        ok += s['ok']
        bad += s['bad']
        for rd, (a, b) in s['seen'].items():
            o = seen.get(rd)
            seen[rd] = [a, b] if not o else [min(o[0], a), max(o[1], b)]
    return sorted(set(ok)), sorted(set(bad)), seen


def cmd_apply(samples_dir):
    ok, bad, seen = merge(samples_dir)
    if not ok:
        raise SystemExit('אין דגימות')
    json.dump({'from': ok[0], 'to': ok[-1], 'days': len(ok), 'bad': bad, 'seen': seen},
              open(f'{OUTDIR}/obus-late-seen.json', 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    try:
        early = json.load(open(f'{OUTDIR}/early-seen.json', encoding='utf-8'))
    except OSError:
        early = {}
    marked = cleared = 0
    known = set()
    for p in glob.glob(f'{OUTDIR}/lines/*.json'):
        d = json.load(open(p, encoding='utf-8'))
        rd = d.get('rd') or ''
        known.add(rd)
        vs = d.get('versions') or []
        had = [v for v in vs if v.get('lateGone')]
        real = [v for v in vs if not v.get('lateGone')]
        new = None
        late = (seen.get(rd) or [None, None])[1]
        last = max(x for x in (late, early.get(rd)) if x) if (late or early.get(rd)) else None
        # מה שנמדד בארכיון היומי בלבד (2017 ואילך); רשומה אחרונה שאינה "תוכנן ולא נכנס"
        lr = [v for v in real if not v.get('syn') and v.get('k') != 'planned-dropped']
        if last and '2017-01-01' <= last <= UNTIL and lr and lr[-1].get('k') not in ('removed', 'notrips') \
                and not any(v.get('d', '') > last for v in lr):
            nxt = next((x for x in ok if x > last), None)
            if nxt:
                new = {'d': nxt, 'sd': last, 'k': 'removed', 'src': SRC, 'lateGone': 1,
                       'note': 'אחרי היום הזה אין לחלופה נסיעות בארכיון היומי של אופן באס (2017–2022), '
                               'ולא באף מקור מאוחר יותר. היום המדויק בין שני התאריכים.'}
        if had and new and len(had) == 1 and had[0].get('d') == new['d'] and had[0].get('sd') == new['sd']:
            continue
        if not had and not new:
            continue
        d['versions'] = real + ([new] if new else [])
        marked += bool(new)
        cleared += bool(had) and not new
        json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    unknown = sorted(rd for rd in seen if rd not in known)
    print(f'ימים בארכיון: {len(ok)} ({ok[0]}–{ok[-1]}) · דולגו {len(bad)} · חלופות שנראו: {len(seen)}')
    print(f'סומנו כמבוטלות: {marked} · סימונים שהוסרו: {cleared}')
    print(f'חלופות שנסעו בתקופה ואין להן קובץ קו: {len(unknown)} (לדוגמה: {", ".join(unknown[:12])})')


if __name__ == '__main__':
    cmd, *args = sys.argv[1:]
    {'days': cmd_days, 'sample': cmd_sample, 'apply': cmd_apply}[cmd](*args)
