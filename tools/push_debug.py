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


def main():
    if not (APP and KEY):
        print('אין מפתחות')
        return
    d = get(f'https://api.onesignal.com/players?app_id={APP}&limit=300')
    ps = d.get('players') or []
    print(f'מנויים: {d.get("total_count")}')
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
