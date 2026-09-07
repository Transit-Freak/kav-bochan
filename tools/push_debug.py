#!/usr/bin/env python3
"""אבחון ההרשמות להתראות (OneSignal) — מה רשום אצל הספק, בלי לשלוח כלום.

לכל מנוי: מזהה, האם יש טוקן, מכשיר, גרסה, כניסות, תגים ברשומת המנוי — ואז
דרך ה-API החדש: המשתמש שהמנוי שייך לו והתגים ברמת המשתמש. הפער בין השניים
(תגים אצל המשתמש אבל לא אצל המנוי) הוא מה שחיפשנו ב-07.09 כשמנוי אחד נשאר
בלי שום תג למרות "✓ נשמר — 5 ערים" בטלפון.
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

APP = os.environ.get('ONESIGNAL_APP_ID', '')
KEY = os.environ.get('ONESIGNAL_API_KEY', '')


def get(url):
    req = urllib.request.Request(url, headers={'Authorization': f'Key {KEY}', 'accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def ts(x):
    try:
        return datetime.datetime.fromtimestamp(int(x), datetime.timezone.utc).strftime('%d.%m %H:%MZ')
    except Exception:
        return str(x)


def call(url, method='GET', body=None, auth=True, origin=None, extra=None):
    """קריאה גולמית — מחזירה (קוד, כותרות, גוף). auth=False מדמה את הדפדפן (בלי מפתח)."""
    hdr = {'accept': 'application/json'}
    if auth:
        hdr['Authorization'] = f'Key {KEY}'
    if body is not None:
        hdr['content-type'] = 'application/json'
    if origin:
        hdr['Origin'] = origin
    hdr.update(extra or {})
    req = urllib.request.Request(url, method=method, headers=hdr, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode('utf-8', 'replace')


def repair(ps, prefix, tags):
    """REPAIR_SUB=<תחילת מזהה מנוי> REPAIR_TAGS=<json>: כותב את התגים למשתמש של המנוי.
    קודם בדרך של הדפדפן (בלי מפתח — לבדוק שהתיקון העצמי באתר יעבוד), ואם לא — עם המפתח."""
    p = next((x for x in ps if str(x.get('id', '')).startswith(prefix)), None)
    if not p:
        print(f'תיקון: לא נמצא מנוי שמתחיל ב-{prefix}')
        return
    pid = p['id']
    base = f'https://api.onesignal.com/apps/{APP}'
    origin = 'https://transit-freak.github.io'
    print(f'\n== תיקון למנוי {pid[:8]}… ==')
    # 1. preflight כמו דפדפן
    code, h, _ = call(f'{base}/users/by/onesignal_id/x', 'OPTIONS', auth=False, origin=origin,
                      extra={'Access-Control-Request-Method': 'PATCH',
                             'Access-Control-Request-Headers': 'content-type,onesignal-subscription-id'})
    print(f'  preflight PATCH: {code} | allow-origin: {h.get("Access-Control-Allow-Origin")} | allow-methods: {h.get("Access-Control-Allow-Methods")} | allow-headers: {h.get("Access-Control-Allow-Headers")}')
    # 2. זהות המשתמש בלי מפתח
    code, _, body = call(f'{base}/subscriptions/{pid}/user/identity', auth=False, origin=origin,
                         extra={'OneSignal-Subscription-Id': pid})
    print(f'  זהות בלי מפתח: {code} {body[:120]}')
    oid = None
    try:
        oid = json.loads(body).get('identity', {}).get('onesignal_id')
    except Exception:
        pass
    if not oid:
        code, _, body = call(f'{base}/subscriptions/{pid}/user/identity')
        print(f'  זהות עם מפתח: {code} {body[:120]}')
        oid = json.loads(body).get('identity', {}).get('onesignal_id')
    # 3. קריאת המשתמש בלי מפתח
    code, _, body = call(f'{base}/users/by/onesignal_id/{oid}', auth=False, origin=origin)
    print(f'  קריאת משתמש בלי מפתח: {code} {body[:160]}')
    # 4. כתיבת תגים בלי מפתח (כמו שהאתר ינסה), ואם לא — עם מפתח
    code, _, body = call(f'{base}/users/by/onesignal_id/{oid}', 'PATCH', {'properties': {'tags': tags}}, auth=False,
                         origin=origin, extra={'OneSignal-Subscription-Id': pid})
    print(f'  כתיבת תגים בלי מפתח: {code} {body[:160]}')
    if code >= 300:
        code, _, body = call(f'{base}/users/by/onesignal_id/{oid}', 'PATCH', {'properties': {'tags': tags}})
        print(f'  כתיבת תגים עם מפתח: {code} {body[:160]}')
    code, _, body = call(f'{base}/users/by/onesignal_id/{oid}')
    print(f'  אחרי: תגים ברמת המשתמש: {json.loads(body).get("properties", {}).get("tags")}')
    code, _, body = call(f'https://api.onesignal.com/players/{pid}?app_id={APP}')
    print(f'  אחרי: תגים ברשומת המנוי: {json.loads(body).get("tags")}')


def main():
    if not (APP and KEY):
        print('אין מפתחות')
        return
    d = get(f'https://api.onesignal.com/players?app_id={APP}&limit=300')
    ps = d.get('players') or []
    print(f'מנויים: {d.get("total_count")}')
    if os.environ.get('REPAIR_SUB'):
        repair(ps, os.environ['REPAIR_SUB'], json.loads(os.environ.get('REPAIR_TAGS') or '{}'))
        return
    for p in ps:
        pid = p.get('id') or ''
        print(f'\n• מנוי {pid[:8]}… | טוקן: {"יש" if p.get("identifier") else "אין"} | דפדפן {p.get("device_os")} '
              f'{p.get("device_model") or ""} | SDK {p.get("sdk")} | נוצר {ts(p.get("created_at"))} | '
              f'פעיל {ts(p.get("last_active"))} | כניסות {p.get("session_count")} | לא תקין: {p.get("invalid_identifier")}')
        print(f'  תגים ברשומת המנוי: {p.get("tags") or {}}')
        try:
            ident = get(f'https://api.onesignal.com/apps/{APP}/subscriptions/{pid}/user/identity')
            oid = (ident.get('identity') or {}).get('onesignal_id')
            print(f'  משתמש: {str(oid)[:8]}…')
            if oid:
                u = get(f'https://api.onesignal.com/apps/{APP}/users/by/onesignal_id/{oid}')
                subs = u.get('subscriptions') or []
                print(f'  תגים ברמת המשתמש: {(u.get("properties") or {}).get("tags") or {}}')
                print(f'  מנויים של המשתמש: {len(subs)} — ' + ', '.join(
                    f'{str(s.get("id"))[:8]}… ({s.get("type")}, {"פעיל" if s.get("enabled") else "כבוי"})' for s in subs))
        except Exception as ex:
            print(f'  (API משתמשים: {ex})', file=sys.stderr)


if __name__ == '__main__':
    main()
