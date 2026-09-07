# -*- coding: utf-8 -*-
"""הקו בזמן — שולח התראות הדפדפן היומי (OneSignal).

רץ אחרי הסריקה היומית: אוסף את שינויי היום (מהותיים בלבד — בלי לו"ז
ותדירות), ולכל קו ששונה שולח התראה אחת לעוקבי הקו (תג l<מקט>) ולעוקבי
ערי הקצה שלו (תג עיר מגובב, OR — כפילויות מסוננות אצל הספק).

env: ONESIGNAL_APP_ID, ONESIGNAL_API_KEY (בלעדיהם — יציאה שקטה),
     DATE (ברירת מחדל: היום), DRY=1 להדפסה בלבד.
"""
import datetime
import json
import os
import sys
import urllib.request

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
APP_ID = os.environ.get('ONESIGNAL_APP_ID', '')
API_KEY = os.environ.get('ONESIGNAL_API_KEY', '')
DATE = os.environ.get('DATE') or datetime.date.today().isoformat()
DRY = os.environ.get('DRY') == '1'
BASE_URL = 'https://transit-freak.github.io/kav-bochan/line-history/'
MAX_SENDS = int(os.environ.get('MAX_SENDS', '200'))

# platform: אירועי "מספר הרציף ברישום השתנה" לא מוצגים באתר (שלמה 07.09) — ולא נשלחים
SKIP_KINDS = {'freq', 'sched', 'times', 'baseline', 'snapshot', 'platform'}
# קבוצות ההרשמה במרכז ההתראות (זהה ל-KIND_GROUPS_N שבאתר)
KIND_GROUP = {}
for _tag, _kinds in (('kg_rem', ['removed']), ('kg_new', ['new']),
                     ('kg_route', ['route', 'redraw', 'extend', 'shorten', 'terminal',
                                   'stops', 'stops-add', 'stops-del']),
                     ('kg_ident', ['dest', 'renum', 'renamed', 'operator', 'mode'])):
    for _k in _kinds:
        KIND_GROUP[_k] = _tag

KIND_LBL = {
    'new': 'וריאנט חדש', 'route': 'שינוי מסלול', 'redraw': 'תיקון שרטוט',
    'terminal': 'שינוי קצה המסלול', 'extend': 'הארכת קו', 'shorten': 'קיצור קו',
    'stops-add': 'תחנות נוספו', 'stops-del': 'תחנות ירדו', 'stops': 'שינוי תחנות',
    'operator': 'החלפת מפעיל', 'dest': 'שינוי יעד', 'renum': 'שינוי מספר',
    'renamed': 'שינוי שם תחנת קצה', 'mode': 'שינוי סוג הקו',
    'access': 'שינוי נגישות', 'board': 'שינוי עלייה/ירידה', 'removed': 'הקו בוטל',
}


def city_tag(name):
    """זהה ל-cityTag שב-app.jsx: djb2 xor על קוד-התו, base36."""
    h = 5381
    for ch in str(name or '').strip():
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    out = ''
    n = h
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    if n == 0:
        out = '0'
    while n:
        out = digits[n % 36] + out
        n //= 36
    return 'c' + out


def dest_cities(dest):
    # העיר = המקטע העברי האחרון; סיומות טכניות ("2#") מדולגות
    import re
    out = []
    for side in str(dest or '').split('<->'):
        for p in reversed(side.strip().split('-')):
            p = p.strip()
            if len(p) >= 2 and '#' not in p and re.search('[א-ת]', p) and not re.search('[0-9]', p):
                if p not in out:
                    out.append(p)
                break
    return out[:2]


def route_words(dest):
    """"מקרית מלאכי לאשדוד" / "בפרדס חנה כרכור" — מאיזו עיר לאיזו עיר הקו נוסע
    (בקשת שלמה 07.09: כשנרשמים לכמה ערים, שההודעה תגיד את זה)."""
    cs = dest_cities(dest)
    if len(cs) == 2 and cs[0] != cs[1]:
        return f'מ{cs[0]} ל{cs[1]}'
    if cs:
        return f'ב{cs[0]}'
    return ''


def terminals(dest):
    """שמות תחנות הקצה בלי סיומת העיר: "מסוף רכבת קיסריה – המייסדים/השמינית"."""
    out = []
    for side in str(dest or '').split('<->'):
        parts = [p.strip() for p in side.strip().split('-')]
        cs = dest_cities(side)
        if cs and cs[0] in parts:
            parts = parts[:parts.index(cs[0])]
        name = '-'.join(p for p in parts if p and not p.isdigit())
        if name:
            out.append(name)
    return ' – '.join(out[:2])


def line_key(s):
    """מיון קווים לפי המספר: 1, 2, 10, 10א, 100."""
    import re
    m = re.match(r'(\d+)', str(s or ''))
    return (int(m.group(1)) if m else 10 ** 9, str(s or ''))


def parse_sub(tags):
    """ההרשמה של מנוי מהתגים שלו: {'cities','watch','lines','freq','groups'}.
    cities/watch = תגי עיר מגובבים (מרכז ההתראות / כפתור "עקוב" — יומי, כל הסוגים);
    groups = None כשלא סומן כלום (= הכל).
    מבנה חדש (07.09): תג אחד kb="f=3|g=rem,new|c=…|w=…|l=…" — ספק ההתראות מגביל
    את מספר התגים למשתמש (ההרשמה של שלמה, 10 תגים, נדחתה ב-409 בלי שנשמר כלום).
    מבנה ישן: תג לכל עיר/קו — נתמך עד שהמנוי ייכנס שוב לאתר ויעבור למבנה החדש."""
    import re
    tags = tags or {}
    s = {'cities': set(), 'watch': set(), 'lines': set(), 'freq': None, 'groups': None}
    if tags.get('kb'):
        for part in str(tags['kb']).split('|'):
            k, _, v = part.partition('=')
            vals = {x for x in v.split(',') if x}
            if k == 'f':
                s['freq'] = v or None
            elif k == 'g':
                s['groups'] = {'kg_' + x for x in vals}
            elif k == 'c':
                s['cities'] = vals
            elif k == 'w':
                s['watch'] = vals
            elif k == 'l':
                s['lines'] = vals
        return s
    s['freq'] = tags.get('freq') or None
    cs = {t for t, v in tags.items() if v == '1' and re.match(r'^c[0-9a-z]+$', t)}
    if s['freq']:
        s['cities'] = cs
    else:
        s['watch'] = cs
    s['lines'] = {t[1:] for t, v in tags.items() if v == '1' and re.match(r'^l\d+$', t)}
    g = {t for t in ('kg_rem', 'kg_new', 'kg_route', 'kg_ident') if tags.get(t) == '1'}
    s['groups'] = g or None
    return s


def collect_changes():
    """{makat: {'line','dest','kinds':set,'rd'}} לשינויים המהותיים של DATE."""
    idx = {}
    try:
        cat = {x['rd']: x for x in json.load(open(f'{OUTDIR}/lines.json'))['lines']}
    except Exception:
        cat = {}
    for f in os.listdir(f'{OUTDIR}/lines'):
        try:
            d = json.load(open(f'{OUTDIR}/lines/{f}', encoding='utf-8'))
        except Exception:
            continue
        for v in d.get('versions') or []:
            if str(v.get('d', ''))[:10] != DATE or v.get('k') in SKIP_KINDS:
                continue
            rd = d.get('rd') or f.rsplit('.', 1)[0]
            mk = rd.split('-')[0]
            e = idx.setdefault(mk, {'line': d.get('line') or (cat.get(rd) or {}).get('line', ''),
                                    'dest': d.get('dest') or (cat.get(rd) or {}).get('dest', ''),
                                    'kinds': set(), 'rd': rd})
            e['kinds'].add(v.get('k'))
    return idx


def send(payload):
    req = urllib.request.Request(
        'https://api.onesignal.com/notifications',
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json; charset=utf-8',
                 'Authorization': f'Key {API_KEY}'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    if os.environ.get('DIGEST_ALL'):
        send_digest_all(int(os.environ['DIGEST_ALL']))
        return
    changes = collect_changes()
    print(f'{DATE}: {len(changes)} קווים עם שינוי מהותי')
    if not changes:
        return
    if not (APP_ID and API_KEY) and not DRY:
        print('אין מפתחות OneSignal — יציאה שקטה (הפיצ׳ר עוד לא הופעל)')
        return
    # הנמענים נבחרים כאן ולא בסינון תגים אצל הספק — ההרשמה כולה בתג אחד (parse_sub)
    try:
        players = list_players() if (APP_ID and API_KEY) else []
    except Exception as ex:
        print(f'רשימת הנרשמים נכשלה ({ex})', file=sys.stderr)
        return
    subs = [(p['id'], parse_sub(p.get('tags'))) for p in players if p.get('id') and not p.get('invalid_identifier')]
    sent = 0
    for mk, e in sorted(changes.items()):
        if sent >= MAX_SENDS:
            print(f'הגעת לתקרת {MAX_SENDS} שליחות — היתר יחכו למחר')
            break
        kinds = ' · '.join(KIND_LBL.get(k, k) for k in sorted(e['kinds']))
        # "קו 11 מקרית מלאכי לאשדוד" — מאיזו עיר לאיזו עיר (שלמה 07.09), ותחנות הקצה בגוף
        title = f'קו {e["line"]} {route_words(e["dest"])}'.strip() if e['line'] else 'קו'
        body = f'{kinds} — {terminals(e["dest"])[:90]}' if e['dest'] else kinds
        url = f'{BASE_URL}#{e["rd"]}@{DATE}'
        groups = {KIND_GROUP.get(k) for k in e['kinds']} - {None}
        ctags = {city_tag(ct) for ct in dest_cities(e['dest'])}
        # עוקבי קו; עוקבי-עיר מהכפתור הפשוט (הכל, יומית); נרשמי המרכז במצב יומי — בסוגים שסימנו
        ids = [pid for pid, s in subs if mk in s['lines'] or (ctags & s['watch'])
               or ((ctags & s['cities']) and s['freq'] in (None, '1') and (s['groups'] is None or (groups & s['groups'])))]
        payload = {'app_id': APP_ID,
                   'headings': {'en': title, 'he': title},
                   'contents': {'en': body, 'he': body},
                   'url': url, 'include_subscription_ids': ids}
        if DRY:
            print('DRY:', title, '|', body, '|', url, '|', f'{len(ids)} נמענים')
        elif not ids:
            print(f'קו {e["line"]} ({", ".join(dest_cities(e["dest"])) or "—"}): 0 נמענים')
            continue
        else:
            try:
                res = send(payload)
                rec = res.get('recipients', 0)
                # גם 0 נמענים נרשם — כך רואים בלוג שהתראה "נשלחה" אבל אף מנוי לא התאים
                # (שלמה 07.09: קו 11 קרית מלאכי, 06.09 — 25 שליחות, 0 נמענים)
                print(f'קו {e["line"]} ({", ".join(dest_cities(e["dest"])) or "—"}): {rec} נמענים' + (f' · {res.get("errors")}' if res.get('errors') else ''))
            except Exception as ex:
                print(f'שגיאת שליחה לקו {e["line"]}: {ex}', file=sys.stderr)
        sent += 1
    print(f'סה"כ קריאות שליחה: {sent}')
    send_digests()


def collect_range(days):
    since = (datetime.date.fromisoformat(DATE) - datetime.timedelta(days=days)).isoformat()
    by_city = {}
    for f in os.listdir(f'{OUTDIR}/lines'):
        try:
            d = json.load(open(f'{OUTDIR}/lines/{f}', encoding='utf-8'))
        except Exception:
            continue
        for v in d.get('versions') or []:
            dd = str(v.get('d', ''))[:10]
            if not (since < dd <= DATE) or v.get('k') in SKIP_KINDS or v.get('k') in ('baseline', 'snapshot'):
                continue
            rd = d.get('rd') or f.rsplit('.', 1)[0]
            for ct in dest_cities(d.get('dest') or ''):
                e = by_city.setdefault(ct, {'kinds': set(), 'bykind': {}})
                e['kinds'].add(v.get('k'))
                e['bykind'].setdefault(v.get('k'), set()).add(rd.split('-')[0])
    return by_city


def list_players():
    """כל הנרשמים והתגים שלהם — לצורך סיכום מאוחד פר-נרשם."""
    out, offset = [], 0
    while True:
        req = urllib.request.Request(
            f'https://api.onesignal.com/players?app_id={APP_ID}&limit=300&offset={offset}',
            headers={'Authorization': f'Key {API_KEY}'})
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.load(r)
        ps = d.get('players') or []
        out += ps
        if len(ps) < 300:
            return out
        offset += 300


def city_rev():
    """מפה מהתג המגובב חזרה לשם העיר — מערי הקצה של כל הקטלוג."""
    rev = {}
    try:
        for x in json.load(open(f'{OUTDIR}/lines.json'))['lines']:
            for ct in dest_cities(x.get('dest') or ''):
                rev[city_tag(ct)] = ct
    except Exception:
        pass
    return rev


def collect_range_mk(days):
    """מק"ט → {'kinds', 'line', 'rd', 'dest'} לשינויים המהותיים ב-DAYS הימים האחרונים."""
    since = (datetime.date.fromisoformat(DATE) - datetime.timedelta(days=days)).isoformat()
    try:
        cat = {x['rd']: x for x in json.load(open(f'{OUTDIR}/lines.json'))['lines']}
    except Exception:
        cat = {}
    by_mk = {}
    for f in os.listdir(f'{OUTDIR}/lines'):
        try:
            d = json.load(open(f'{OUTDIR}/lines/{f}', encoding='utf-8'))
        except Exception:
            continue
        rd = d.get('rd') or f.rsplit('.', 1)[0]
        for v in d.get('versions') or []:
            dd = str(v.get('d', ''))[:10]
            if not (since < dd <= DATE) or v.get('k') in SKIP_KINDS or v.get('k') in ('baseline', 'snapshot'):
                continue
            e = by_mk.setdefault(rd.split('-')[0], {'kinds': set(), 'line': d.get('line') or (cat.get(rd) or {}).get('line', ''),
                                                    'dest': d.get('dest') or (cat.get(rd) or {}).get('dest', ''), 'rd': rd})
            e['kinds'].add(v.get('k'))
    return by_mk


def digest_body(mks, by_mk, lead=''):
    """גוף הסיכום: שורה לכל קו — "קו 11 מקרית מלאכי לאשדוד: שינוי מסלול", עד 4
    קווים ו"ועוד N" (בקשת שלמה 07.09 אחרי הסיכום הראשון: שיהיה כתוב מאיזו עיר
    לאיזו עיר הקו נוסע). מסודר לפי מספר הקו."""
    rows = []
    for mk in sorted(mks, key=lambda m: line_key((by_mk.get(m) or {}).get('line'))):
        e = by_mk.get(mk)
        if not e:
            continue
        labels = ' · '.join(sorted({KIND_LBL.get(k, k) for k in e['kinds']})[:2])
        rows.append(f'קו {e["line"] or "?"} {route_words(e["dest"])}: {labels}'.replace('  ', ' '))
    more = len(rows) - 4
    body = '\n'.join(rows[:4]) + (f'\nועוד {more} קווים' if more > 0 else '')
    return (lead + '\n' + body) if lead else body


def send_digest_all(days):
    """סיכום חד-פעמי לכל הנרשמים (בקשת שלמה 07.09), בלי קשר לתדירות שבחרו:
    לכל מנוי — הערים שלו (תגי עיר) והקווים שהוא עוקב אחריהם (תגי l…), השינויים
    המהותיים ב-DAYS הימים האחרונים, הודעה אחת. מי שסימן סוגי שינוי — רק הם."""
    if not (APP_ID and API_KEY):
        print('סיכום לכולם: אין מפתחות — דילוג')
        return
    rev = city_rev()
    players = list_players()
    by_city, by_mk = collect_range(days), collect_range_mk(days)
    # DIGEST_SINCE (ISO): רק מנויים שנכנסו לאתר אחרי הזמן הזה — לשליחה חוזרת למי שעדכן
    # הרשמה אחרי הסבב הקודם, בלי לשלוח שוב לכל השאר
    since = os.environ.get('DIGEST_SINCE') or ''
    since_ts = datetime.datetime.fromisoformat(since.replace('Z', '+00:00')).timestamp() if since else 0
    sent = skipped = 0
    for p in players:
        tags = p.get('tags') or {}
        if p.get('invalid_identifier'):
            continue
        if since_ts and (p.get('last_active') or 0) < since_ts:
            continue
        s = parse_sub(tags)
        ucities = [rev[t] for t in sorted(s['cities'] | s['watch']) if t in rev]
        watch_names = {rev[t] for t in s['watch'] if t in rev}   # כפתור "עקוב" — כל הסוגים
        ulines = sorted(s['lines'])
        ugroups = s['groups'] or set(KIND_GROUP.values())
        mks, kinds, hit = set(), set(), []
        for ct in ucities:
            e = by_city.get(ct)
            if not e:
                continue
            for k, kmks in e['bykind'].items():
                if ct in watch_names or KIND_GROUP.get(k) in ugroups:
                    kinds.add(k)
                    mks |= kmks
                    if ct not in hit:
                        hit.append(ct)
        for mk in ulines:
            e = by_mk.get(mk)
            if not e:
                continue
            for k in e['kinds']:
                if KIND_GROUP.get(k) in ugroups:
                    kinds.add(k)
                    mks.add(mk)
        if not mks:
            skipped += 1
            print(f'  מנוי בלי שינויים מתאימים: ערים {ucities or "—"} · קווים {ulines or "—"}')
            continue
        title = f'🔔 סיכום: {len(mks)} קווים השתנו ב-{days} הימים האחרונים'
        body = digest_body(mks, by_mk)
        if ucities:
            url = f'{BASE_URL}#digest={",".join(ucities)}@{days}'
        else:
            first = next((by_mk[m]['rd'] for m in sorted(mks) if m in by_mk), '')
            url = f'{BASE_URL}#{first}' if first else BASE_URL
        payload = {'app_id': APP_ID, 'headings': {'en': title, 'he': title},
                   'contents': {'en': body, 'he': body}, 'url': url,
                   'include_subscription_ids': [p.get('id')]}
        if DRY:
            print('DRY-DIGEST-ALL:', title, '|', body, '|', url)
        else:
            try:
                res = send(payload)
                print(f'  נשלח ({res.get("recipients", "?")} נמענים): {body[:80]}')
            except Exception as ex:
                print(f'שגיאת סיכום לנרשם: {ex}', file=sys.stderr)
        sent += 1
    print(f'סיכום {days} ימים לכל הנרשמים{" (מאז " + since + ")" if since else ""}: '
          f'{sent} קיבלו הודעה · {skipped} בלי שינויים מתאימים · {len(players)} מנויים')


def send_digests():
    """סיכום כל 3 ימים / שבועי (יום ראשון) — הודעה אחת לכל נרשם, שמאחדת
    את כל הערים שבחר (בקשת שלמה: לא הודעה לכל עיר)."""
    today = datetime.date.fromisoformat(DATE)
    jobs = []
    if today.toordinal() % 3 == 0:
        jobs.append(('3', 3))
    if today.weekday() == 6:   # ראשון
        jobs.append(('7', 7))
    if not jobs:
        return
    # מפה מהתג המגובב חזרה לשם העיר — מערי הקצה של כל הקטלוג
    rev = {}
    try:
        for x in json.load(open(f'{OUTDIR}/lines.json'))['lines']:
            for ct in dest_cities(x.get('dest') or ''):
                rev[city_tag(ct)] = ct
    except Exception:
        pass
    if not (APP_ID and API_KEY):
        print('סיכומים: אין מפתחות — דילוג')
        return
    try:
        players = list_players()
    except Exception as ex:
        print(f'סיכומים: רשימת הנרשמים נכשלה ({ex})', file=sys.stderr)
        return
    for freq, days in jobs:
        by_city, by_mk = collect_range(days), collect_range_mk(days)
        sent = 0
        for p in players:
            s = parse_sub(p.get('tags'))
            if s['freq'] != freq or p.get('invalid_identifier'):
                continue
            ucities = [rev[t] for t in sorted(s['cities']) if t in rev]
            ugroups = s['groups'] or set(KIND_GROUP.values())
            mks, kinds = set(), set()
            for ct in ucities:
                e = by_city.get(ct)
                if not e:
                    continue
                for k, kmks in e['bykind'].items():
                    if KIND_GROUP.get(k) in ugroups:
                        kinds.add(k)
                        mks |= kmks
            if not mks:
                continue
            title = f'🔔 {len(mks)} קווים השתנו ב{"ערים שלך" if len(ucities) > 1 else (ucities[0] if ucities else "")}'
            body = digest_body(mks, by_mk, 'סיכום ' + ('שבועי' if days == 7 else f'{days} ימים') + ':')
            url = f'{BASE_URL}#digest={",".join(ucities)}@{days}'
            payload = {'app_id': APP_ID, 'headings': {'en': title, 'he': title},
                       'contents': {'en': body, 'he': body}, 'url': url,
                       'include_subscription_ids': [p.get('id')]}
            if DRY:
                print('DRY-DIGEST:', title, '|', body, '|', url)
            else:
                try:
                    send(payload)
                except Exception as ex:
                    print(f'שגיאת סיכום לנרשם: {ex}', file=sys.stderr)
            sent += 1
        print(f'סיכומי {days} ימים: {sent} נרשמים קיבלו הודעה מאוחדת אחת')


if __name__ == '__main__':
    main()
