# -*- coding: utf-8 -*-
"""באנרי שיתוף של צי הרכבים — נשמרים בריפו הארכיון, בענף share-fleet (שלמה 23.10).

עד 22.10 הבאנרים עלו ל-releases, אבל כל קובץ הוא בקשה נפרדת ו-GitHub חסם אחרי כאלף בשעה —
מתוך 20 אלף עלו 2,456. בענף בריפו הארכיון כל הקבצים עולים בדחיפה אחת.

כ-20 אלף באנרים (רכב, חברה, דגם, עיר, מעבר). שם הקובץ נגזר מהתוכן (fleet_share.banner_name),
לכן רק מה שהשתנה מצויר מחדש.

שני מצבים:
  python3 tools/share_fleet_banners.py render DEST
      רץ בריפו הארכיון (sync-share-fleet.yml שם), מתוך עותק של הריפו הראשי: מצייר לתוך DEST
      את החסרים, מוחק תמונות שאף כרטיס כבר לא משתמש בהן, וכותב DEST/index.json — רשימת הקבצים.
  python3 tools/share_fleet_banners.py
      רץ בריפו הראשי (share-stubs.yml): קורא את index.json מהארכיון וכותב s/fleet-banners.json
      {קובץ: מקום}. share_stubs.py בונה ממנו את כתובת התמונה; פריט בלי באנר מקבל את התמונה הכללית.
"""
import json, os, subprocess, sys, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import fleet_share

ARCHIVE = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan-archive/share-fleet/'
MAIN = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan/main/'
OUTF = 's/fleet-banners.json'
CHUNK = 400


def render(dest):
    items = fleet_share.build()
    want = {}
    for it in items.values():
        want.setdefault(it['img'], it['b'])
    os.makedirs(dest, exist_ok=True)
    have = {f for f in os.listdir(dest) if f.startswith('fl-') and f.endswith('.jpg')}
    missing = [f for f in want if f not in have]
    print('באנרים נדרשים:', len(want), '| קיימים:', len(have & set(want)), '| חסרים:', len(missing), flush=True)
    chrome = os.environ.get('CHROME') or subprocess.run('which google-chrome || which chromium-browser', shell=True,
                                                        capture_output=True, text=True).stdout.strip()
    for k in range(0, len(missing), CHUNK):
        part = missing[k:k + CHUNK]
        json.dump([{'img': f, 'b': want[f]} for f in part], open('fbmissing.json', 'w', encoding='utf-8'), ensure_ascii=False)
        subprocess.run(['node', 'tools/share_fleet_banner.mjs', 'fbmissing.json', dest, chrome], check=True)
        print(f'צוירו {min(k + CHUNK, len(missing))} מתוך {len(missing)}', flush=True)
    # ניקוי (שלמה 22.10: "המאגר יצטרך לדעת למחוק את התמונה הישנה"): תמונה שאף כרטיס כבר לא משתמש בה
    # — למשל רכב שעבר חברה. זהירות: לא מוחקים אם הנתונים נראים חסרים (פחות מ-10,000 כרטיסים)
    if len(want) < 10000:
        print('ניקוי: מדלג — רק', len(want), 'כרטיסים, הנתונים נראים חסרים')
    else:
        # תמונה שדף שיתוף חי עדיין מצביע עליה נשארת עד הלילה הבא (דפי השיתוף מתעדכנים אחרי הציור)
        try:
            live = set(json.load(urllib.request.urlopen(MAIN + OUTF, timeout=60)))
        except Exception as e:
            print('ניקוי: מדלג — לא הצלחתי לקרוא את דפי השיתוף החיים:', e); live = have
        old = sorted(have - set(want) - live)
        print('ניקוי: תמונות ישנות שאין להן שימוש:', len(old))
        for f in old:
            os.remove(os.path.join(dest, f))
    files = sorted(f for f in os.listdir(dest) if f.startswith('fl-') and f.endswith('.jpg'))
    json.dump(files, open(os.path.join(dest, 'index.json'), 'w', encoding='utf-8'))
    print('index.json:', len(files), 'קבצים')


def write_map():
    try:
        old = json.load(open(OUTF, encoding='utf-8'))
    except Exception:
        old = {}
    try:
        files = json.load(urllib.request.urlopen(ARCHIVE + 'index.json', timeout=60))
    except Exception as e:
        # הארכיון לא נקרא — לא נוגעים במפה, כדי שדפי השיתוף לא יאבדו את התמונות שלהם
        print('לא הצלחתי לקרוא את רשימת הבאנרים מהארכיון — המפה נשארת כמו שהיא:', e); return
    want = {it['img'] for it in fleet_share.build().values()}
    m = {f: 'archive' for f in files if f in want}
    # באנרים שעלו ל-releases לפני המעבר — נשארים עד שהארכיון מחזיק אותם
    for f, t in old.items():
        if f in want and f not in m and t != 'archive':
            m[f] = t
    json.dump(dict(sorted(m.items())), open(OUTF, 'w', encoding='utf-8'), ensure_ascii=False)
    print('נכתב', OUTF, len(m), 'מתוך', len(want), '| מהארכיון:', sum(1 for t in m.values() if t == 'archive'))
    # ה-releases הישנים (share-fleet, share-fleet-2...) — נמחקים רק כשכל הכרטיסים כבר מקבלים תמונה מהארכיון,
    # כלומר אף דף שיתוף לא מצביע עליהם (שלמה 23.10: "אם זה לא בשימוש תמחוק")
    # release עם 990 קבצים נכשל במחיקה אחת (GitHub מחזיר 502, 23.10) — מוחקים קודם את הקבצים במנות
    # (עד ASSET_MAX בלילה, מגבלת הבקשות של GitHub), ואת ה-release עצמו כשהוא ריק
    if len(want) >= 10000 and all(m.get(f) == 'archive' for f in want):
        R, budget = 'Transit-Freak/kav-bochan', int(os.environ.get('ASSET_MAX', '800'))
        gh = lambda *a: subprocess.run(['gh', *a], capture_output=True, text=True)
        for i in range(1, 10):
            t = 'share-fleet' if i == 1 else f'share-fleet-{i}'
            r = gh('api', f'repos/{R}/releases/tags/{t}', '--jq', '.id')
            if r.returncode:
                continue   # כבר נמחק (או לא היה)
            rid = r.stdout.strip()
            ids = gh('api', '--paginate', f'repos/{R}/releases/{rid}/assets?per_page=100', '--jq', '.[].id').stdout.split()
            n = 0
            for a in ids:
                if budget <= 0:
                    break
                if gh('api', '-X', 'DELETE', f'repos/{R}/releases/assets/{a}').returncode == 0:
                    n += 1
                budget -= 1
            left = len(ids) - n
            print(f'{t}: נמחקו {n} תמונות ישנות, נשארו {left}')
            if left == 0:
                d = gh('release', 'delete', t, '-R', R, '-y', '--cleanup-tag')
                print('נמחק release ישן:', t) if d.returncode == 0 else print('מחיקת', t, 'נכשלה:', d.stderr.strip()[:200])
            if budget <= 0:
                print('המשך המחיקה בלילה הבא')
                break


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'render':
        render(sys.argv[2])
    else:
        write_map()
