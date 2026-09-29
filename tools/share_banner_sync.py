# -*- coding: utf-8 -*-
"""באנרי שיתוף (קו N / רכבת N) — רינדור החסרים והעלאה לכמה releases.

GitHub מגביל כל release ל-1000 קבצים. share-img התמלא ב-28.09, ההעלאה נכשלה,
והריצה היומית נעצרה לפני יצירת דפי השיתוף — שבוע בלי דפים חדשים (קווי 2012
נשארו בלי דף). כאן: releases ממוספרים share-img, share-img-2, share-img-3...,
כל באנר חדש הולך לראשון שיש בו מקום, והמפה {מספר: release} נכתבת ל-
s/<kind>-banners.json — share_stubs.py בונה ממנה את כתובת התמונה.

שימוש: python3 tools/share_banner_sync.py <line|rail> <nums.json>
משתני סביבה: R (owner/repo), GH_TOKEN. כשל ברינדור/העלאה לא עוצר את הריצה.
"""
import json, os, subprocess, sys

KIND, NUMS = sys.argv[1], sys.argv[2]
R = os.environ.get('R', 'Transit-Freak/kav-bochan')
PREFIX = 'line-h' if KIND == 'line' else 'rail-h'
CAP = 990   # מתחת ל-1000 — מרווח ביטחון


def gh(*a, check=True):
    return subprocess.run(['gh', *a], capture_output=True, text=True, check=check)


def tag_of(i):
    return 'share-img' if i == 1 else f'share-img-{i}'


def assets(tag):
    r = gh('release', 'view', tag, '-R', R, '--json', 'assets', '-q', '.assets[].name', check=False)
    return None if r.returncode else {l.strip() for l in r.stdout.splitlines() if l.strip()}


def fname(n):
    return f'{PREFIX}{n.encode().hex()}.png'


nums = sorted(set(json.load(open(NUMS, encoding='utf-8'))) - {''})
rel = []           # [(tag, set(assets))]
i = 1
while True:
    a = assets(tag_of(i))
    if a is None:
        break
    rel.append((tag_of(i), a)); i += 1

where = {}
for n in nums:
    for tag, a in rel:
        if fname(n) in a:
            where[n] = tag; break
missing = [n for n in nums if n not in where]
print(KIND, 'מספרים:', len(nums), '| יש תמונה:', len(where), '| חסרים:', len(missing), '| releases:', [t for t, _ in rel])

if missing:
    try:
        json.dump(missing, open('bmissing.json', 'w', encoding='utf-8'), ensure_ascii=False)
        subprocess.run('npm install --no-save playwright-core >/dev/null 2>&1', shell=True)
        chrome = subprocess.run('which google-chrome || which chromium-browser', shell=True, capture_output=True, text=True).stdout.strip()
        env = dict(os.environ, KIND=KIND)
        subprocess.run(['node', 'tools/share_line_banner.mjs', 'bmissing.json', 'bout', chrome], env=env, check=True)
        todo = [n for n in missing if os.path.exists('bout/' + fname(n))]
        while todo:
            slot = next(((t, a) for t, a in rel if len(a) < CAP), None)
            if slot is None:
                t = tag_of(len(rel) + 1)
                gh('release', 'create', t, '-R', R, '--title', 'תמונות שיתוף (אוטומטי — לא לגעת)',
                   '--latest=false', '--notes', 'באנרי שיתוף לוואטסאפ. נוצר אוטומטית.')
                slot = (t, set()); rel.append(slot)
            t, a = slot
            batch = todo[:CAP - len(a)]
            for k in range(0, len(batch), 50):
                part = batch[k:k + 50]
                r = gh('release', 'upload', t, '-R', R, *['bout/' + fname(n) for n in part], '--clobber', check=False)
                if r.returncode:
                    print('העלאה נכשלה:', r.stderr.strip()[:300]); todo = []; break
                for n in part:
                    a.add(fname(n)); where[n] = t
            todo = todo[len(batch):] if todo else []
    except Exception as e:  # רינדור/העלאה נכשלו — דפי השיתוף ייווצרו בכל זאת, עם התמונה הכללית
        print('באנרים: דילוג —', type(e).__name__, e)

json.dump(dict(sorted(where.items())), open(f's/{KIND}-banners.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('נכתב s/%s-banners.json: %d' % (KIND, len(where)))
