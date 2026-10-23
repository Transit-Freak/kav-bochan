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
        old = sorted(have - set(want))
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


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'render':
        render(sys.argv[2])
    else:
        write_map()
