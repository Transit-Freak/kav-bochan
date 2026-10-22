# -*- coding: utf-8 -*-
"""באנרי שיתוף של צי הרכבים — ציור החסרים והעלאה ל-releases (כמו share_banner_sync.py לקווים).

כ-20 אלף באנרים (רכב, חברה, דגם, עיר, מעבר). שם הקובץ נגזר מהתוכן (fleet_share.banner_name),
לכן רק מה שהשתנה מצויר מחדש. releases ממוספרים share-fleet, share-fleet-2... (עד 990 קבצים בכל אחד).
הריצה מוגבלת בזמן (BUDGET_MIN): מציירים ומעלים במנות, ומה שלא הספיק — ממשיך בלילה הבא.
לא מוחק כלום. המפה {שם קובץ: release} נכתבת ל-s/fleet-banners.json, ו-share_stubs.py בונה ממנה
את כתובת התמונה; פריט בלי באנר מקבל את התמונה הכללית של צי הרכבים.

שימוש: python3 tools/share_fleet_banners.py · משתני סביבה: R, GH_TOKEN, BUDGET_MIN (ברירת מחדל 50)
"""
import json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import fleet_share

R = os.environ.get('R', 'Transit-Freak/kav-bochan')
BUDGET = float(os.environ.get('BUDGET_MIN', '50')) * 60
CAP = 990
CHUNK = 400
OUTF = 's/fleet-banners.json'
t0 = time.time()


def gh(*a, check=True):
    return subprocess.run(['gh', *a], capture_output=True, text=True, check=check)


def tag_of(i):
    return 'share-fleet' if i == 1 else f'share-fleet-{i}'


def assets(tag):
    r = gh('release', 'view', tag, '-R', R, '--json', 'assets', '-q', '.assets[].name', check=False)
    return None if r.returncode else {l.strip() for l in r.stdout.splitlines() if l.strip()}


items = fleet_share.build()
want = {}
for it in items.values():
    want.setdefault(it['img'], it['b'])
rel, i = [], 1
while True:
    a = assets(tag_of(i))
    if a is None:
        break
    rel.append((tag_of(i), a)); i += 1
where = {f: t for t, a in rel for f in a if f in want}
# אין releases, אבל במפה הקיימת יש באנרים — כנראה קריאת ה-releases נכשלה. לא נוגעים במפה,
# כדי שדפי השיתוף לא יאבדו את התמונות שלהם
try:
    old = json.load(open(OUTF, encoding='utf-8'))
except Exception:
    old = {}
if not rel and old:
    print('לא הצלחתי לקרוא את ה-releases — המפה נשארת כמו שהיא'); sys.exit(0)
missing = [f for f in want if f not in where]
print('באנרים נדרשים:', len(want), '| קיימים:', len(where), '| חסרים:', len(missing), '| releases:', [t for t, _ in rel], flush=True)

if missing:
    try:
        chrome = os.environ.get('CHROME')
        if not chrome:
            subprocess.run('npm install --no-save playwright-core >/dev/null 2>&1', shell=True)
            chrome = subprocess.run('which google-chrome || which chromium-browser', shell=True, capture_output=True, text=True).stdout.strip()
        for k in range(0, len(missing), CHUNK):
            if time.time() - t0 > BUDGET:
                print('נגמר הזמן — השאר בריצה הבאה', flush=True); break
            part = missing[k:k + CHUNK]
            json.dump([{'img': f, 'b': want[f]} for f in part], open('fbmissing.json', 'w', encoding='utf-8'), ensure_ascii=False)
            subprocess.run(['node', 'tools/share_fleet_banner.mjs', 'fbmissing.json', 'fbout', chrome], check=True)
            todo = [f for f in part if os.path.exists('fbout/' + f)]
            while todo:
                slot = next(((t, a) for t, a in rel if len(a) < CAP), None)
                if slot is None:
                    t = tag_of(len(rel) + 1)
                    r = gh('release', 'create', t, '-R', R, '--title', 'תמונות שיתוף — צי הרכבים (אוטומטי, לא לגעת)',
                           '--latest=false', '--notes', 'באנרי שיתוף לוואטסאפ של צי הרכבים. נוצר אוטומטית.', check=False)
                    have = assets(t)   # כבר קיים (ריצה אחרת יצרה אותו) — ממשיכים איתו
                    if r.returncode and have is None:
                        raise RuntimeError('יצירת release נכשלה: ' + r.stderr.strip()[:300])
                    slot = (t, have or set()); rel.append(slot)
                t, a = slot
                batch = todo[:CAP - len(a)]
                for j in range(0, len(batch), 50):
                    sub = batch[j:j + 50]
                    r = gh('release', 'upload', t, '-R', R, *['fbout/' + f for f in sub], '--clobber', check=False)
                    if r.returncode:
                        raise RuntimeError('העלאה נכשלה: ' + r.stderr.strip()[:300])
                    for f in sub:
                        a.add(f); where[f] = t
                todo = todo[len(batch):]
            for f in part:   # מפנים מקום בדיסק אחרי ההעלאה
                try: os.remove('fbout/' + f)
                except OSError: pass
            print(f'הועלו {len(where)} מתוך {len(want)} · {int(time.time() - t0)} שנ׳', flush=True)
    except Exception as e:  # כשל — דפי השיתוף נבנים בכל זאת, עם מה שכבר הועלה
        print('באנרים של צי הרכבים: עצירה —', type(e).__name__, e, flush=True)

json.dump(dict(sorted(where.items())), open(OUTF, 'w', encoding='utf-8'), ensure_ascii=False)
print('נכתב', OUTF, len(where))

# ניקוי (שלמה 22.10: "המאגר יצטרך לדעת למחוק את התמונה הישנה"): תמונה של צי הרכבים שאף כרטיס כבר
# לא משתמש בה — למשל רכב שעבר חברה — נמחקת. רק קבצי fl-*.jpg ורק ב-releases של share-fleet.
# זהירות: לא מוחקים אם הנתונים נראים חסרים (פחות מ-10,000 כרטיסים), ולא יותר מ-PRUNE_MAX בריצה.
PRUNE_MAX = int(os.environ.get('PRUNE_MAX', '3000'))
if len(want) < int(os.environ.get('PRUNE_MIN', '10000')):
    print('ניקוי: מדלג — רק', len(want), 'כרטיסים, הנתונים נראים חסרים')
else:
    old = [(t, f) for t, a in rel for f in sorted(a) if f.startswith('fl-') and f.endswith('.jpg') and f not in want]
    print('ניקוי: תמונות ישנות שאין להן שימוש:', len(old), flush=True)
    for t, f in old[:PRUNE_MAX]:
        r = gh('release', 'delete-asset', t, f, '-R', R, '-y', check=False)
        if r.returncode:
            print('מחיקה נכשלה:', f, r.stderr.strip()[:200]); break
