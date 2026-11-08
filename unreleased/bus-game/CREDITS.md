# קרדיטים — משחק הקווים (אב-טיפוס)

הרעיון והכוונה: **שלמה הרטמן**, הקו הבוחן. הבנייה והקוד: Claude.

## נתונים

| מה | מקור | רישיון |
|---|---|---|
| רחובות, בניינים, פארקים | © תורמי OpenStreetMap — https://www.openstreetmap.org/copyright | ODbL 1.0 |
| מיקומי התחנות | GTFS של משרד התחבורה (stops.txt, מהענף gtfs-data בריפו) | מידע ציבורי |
| גבולות השכונות של קריית מלאכי (`world/neighbourhoods.json`) | מפ"י / GovMap (שכבה 22), באמצעות גרסאות לעם (over.org.il), תמונת מצב ספטמבר 2026 | מידע ציבורי |

## דגמים ותנועה

| מה | יוצר | קישור | רישיון |
|---|---|---|---|
| האוטובוס (`assets/bus.glb`) | נבנה ב-Blender בקוד (`tools/blender-test/bus.py`, ענף claude/blender-test) | — | — |
| האנשים: גוף, עור, עיניים, גבות, שיער ובגדים (`assets/people/`) | MPFB / MakeHuman Community | https://github.com/makehumancommunity/mpfb2 | הנכסים: CC0; התוסף: GPL |
| תנועת ההליכה (הקלטה 16_15) | CMU Graphics Lab Motion Capture Database | http://mocap.cs.cmu.edu | ללא הגבלות שימוש |
| המרת ההקלטות ל-BVH | Bruce Hahne (מאגר: Shriinivas/cmubvh) | https://github.com/Shriinivas/cmubvh | ללא הגבלות שימוש |
| Blender Agent Skills (בניית האוטובוס) | EL4CTEO | https://github.com/EL4CTEO/blender-skills | MIT |

## תוכנה

| מה | יוצר | קישור | רישיון |
|---|---|---|---|
| three.js r170 (עותק מקומי ב-`vendor/three`) | three.js authors | https://threejs.org | MIT |
| Blender 5 | Blender Foundation | https://www.blender.org | GPL |

ההמרה מ-OSM לעולם תלת־ממדי נכתבה כאן (`tools/build_city.py`) ולא השתמשה בקוד של city3d-skill.
