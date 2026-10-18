# -*- coding: utf-8 -*-
"""הקו המודיע — התראות דפדפן על שינויים זמניים חדשים (שלמה 18.10.2026).

אחרי כל משיכה (alerts_fetch.py): התראות שלא נראו קודם, ושעוד לא נגמרו, נשלחות דרך אותה
מערכת התראות של הקו בזמן (OneSignal, tools/send_push.py):
  - מי שעוקב אחרי קו (l=) — על כל שינוי זמני בקו שלו
  - מי שנרשם לעיר במרכז ההתראות, במצב "כל יום", וסימן את הסוג "שינויים זמניים" (kg_temp)
כל נרשם מקבל לכל היותר הודעה אחת בריצה: שינוי אחד — עם הכותרת שלו; כמה — רשימה קצרה.
הריצה הראשונה (בלי alerts/data/push.json) רק מסמנת את מה שכבר קיים, בלי לשלוח.
"""
import datetime
import json
import os
import re
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import send_push as SP  # noqa: E402

OUT = os.environ.get('OUT', 'alerts/data')
LH = os.environ.get('OUTDIR', 'line-history/data')
DRY = os.environ.get('DRY') == '1'
MAX_SENDS = int(os.environ.get('MAX_SENDS', '150'))
URL = 'https://kavbochan.app/alerts/'
TZ = ZoneInfo('Asia/Jerusalem')


def ts(x):
    """זמן מההתראה (ISO עם אזור זמן, או מספר) — שניות, או None."""
    if not x:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    try:
        return datetime.datetime.fromisoformat(str(x).replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def dm(t):
    d = datetime.datetime.fromtimestamp(t, TZ)
    return f'{d.day}.{d.month}'


def when(a):
    s, e = ts(a.get('s')), ts(a.get('e'))
    if s and e and dm(s) != dm(e):
        return f'{dm(s)}–{dm(e)}'
    if s:
        return dm(s)
    return ''


def short(text, n):
    text = re.sub(r'\s+', ' ', str(text or '')).strip()
    return text if len(text) <= n else text[:n - 1].rstrip() + '…'


def nums(a, mks=None):
    """מספרי הקווים בהתראה (רק אלה של הנרשם, אם נתון) — בלי כפילויות, ממוינים."""
    out = {str(n) for n, rd, *_ in a.get('lines') or [] if n and (mks is None or str(rd).split('-')[0] in mks)}
    return sorted(out, key=SP.line_key)


def message(items, causes):
    """items: [(alert, makats של הנרשם או None)]. מחזיר (כותרת, גוף, קישור)."""
    if len(items) == 1:
        a, mks = items[0]
        ns = nums(a, mks) or nums(a)
        title = ('שינוי זמני בקו ' if len(ns) == 1 else 'שינוי זמני בקווים ') + ', '.join(ns[:5]) + ('…' if len(ns) > 5 else '')
        lead = ' · '.join(x for x in (causes.get(a.get('cause')) if a.get('cause') != 'other' else '', when(a)) if x)
        body = (lead + ' — ' if lead else '') + short(a.get('h'), 110)
        return title, body, f'{URL}#{a["id"]}'
    parts = []
    for a, mks in items[:6]:
        ns = nums(a, mks) or nums(a)
        parts.append(f'{"קו" if len(ns) == 1 else "קווים"} {", ".join(ns[:3])}: {short(a.get("h"), 40)}')
    more = f' ועוד {len(items) - 6}' if len(items) > 6 else ''
    return f'{len(items)} שינויים זמניים חדשים', ' · '.join(parts)[:220] + more, URL


def main():
    try:
        d = json.load(open(f'{OUT}/alerts.json'))
    except Exception as ex:
        print(f'אין alerts.json ({ex})')
        return
    alerts, causes = d.get('alerts') or [], d.get('causes') or {}
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    pfile = f'{OUT}/push.json'
    try:
        seen = set(json.load(open(pfile)).get('seen') or [])
        first = False
    except Exception:
        seen, first = set(), True
    ids = {a['id'] for a in alerts}
    fresh = [a for a in alerts if a['id'] not in seen and a.get('lines') and not (ts(a.get('e')) and ts(a['e']) < now)]
    print(f'{len(alerts)} התראות · {len(fresh)} חדשות עם קווים')

    def save():
        if DRY:
            return
        json.dump({'seen': sorted((seen | {a['id'] for a in fresh}) & ids),
                   'at': datetime.datetime.utcnow().isoformat(timespec='minutes')},
                  open(pfile, 'w'), separators=(',', ':'))

    if first:
        print('ריצה ראשונה — מסמנים את הקיים, בלי לשלוח')
        save()
        return
    if not fresh:
        save()
        return
    if not (SP.APP_ID and SP.API_KEY) and not DRY:
        print('אין מפתחות OneSignal — יציאה שקטה')
        save()
        return
    # ערי הקצה של כל קו, מהקטלוג של הקו בזמן
    dest = {}
    try:
        for x in json.load(open(f'{LH}/lines.json'))['lines']:
            dest[x['rd']] = x.get('dest') or ''
    except Exception:
        pass
    info = []
    for a in fresh:
        rds = [str(rd) for _, rd, *_ in a['lines']]
        mks = {rd.split('-')[0] for rd in rds}
        ctags = {SP.city_tag(c) for rd in rds for c in SP.dest_cities(dest.get(rd, ''))}
        info.append((a, mks, ctags))
    try:
        players = SP.list_players() if (SP.APP_ID and SP.API_KEY) else []
    except Exception as ex:
        print(f'רשימת הנרשמים נכשלה ({ex}) — ננסה בריצה הבאה', file=sys.stderr)
        return
    # הודעה לכל נרשם; נרשמים עם אותה הודעה בדיוק נשלחים יחד
    groups = {}
    for p in players:
        if not p.get('id') or p.get('invalid_identifier'):
            continue
        s = SP.parse_sub(p.get('tags'))
        city_ok = s['freq'] in (None, '1') and (s['groups'] is None or 'kg_temp' in s['groups'])
        items = []
        for a, mks, ctags in info:
            mine = mks & s['lines']
            if mine:
                items.append((a, mine))
            elif city_ok and ctags & s['cities']:
                items.append((a, None))
        if items:
            groups.setdefault(message(items, causes), []).append(p['id'])
    sent = 0
    for (title, body, url), pids in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        if sent >= MAX_SENDS:
            print(f'הגעת לתקרת {MAX_SENDS} שליחות')
            break
        payload = {'app_id': SP.APP_ID, 'headings': {'en': title, 'he': title},
                   'contents': {'en': body, 'he': body}, 'url': url, 'include_subscription_ids': pids}
        if DRY:
            print('DRY:', title, '|', body, '|', url, '|', f'{len(pids)} נמענים')
        else:
            try:
                res = SP.send(payload)
                print(f'{title}: {res.get("recipients", 0)} נמענים' + (f' · {res.get("errors")}' if res.get('errors') else ''))
            except Exception as ex:
                print(f'שגיאת שליחה ({title}): {ex}', file=sys.stderr)
        sent += 1
    print(f'סה"כ קריאות שליחה: {sent}')
    save()


if __name__ == '__main__':
    main()
