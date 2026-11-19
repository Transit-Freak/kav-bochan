# בדיקות "מצגת לשינוי בקו"

רצות ב-GitHub על כל PR שנוגע בקוד של הכלי (`line-changes/`, בלי `data/`) או בבונה (`tools/line_changes.py`, `tools/road_match.py`)
— ה-workflow `.github/workflows/line-changes-tests.yml`.

## מה נבדק

| בדיקה | קובץ | מה |
|---|---|---|
| יחידה — הבונה | `tests/test_line_changes_units.py` | קבוצות ימים, קיצור ימים, סיכום לו"ז, שינוי משמעותי |
| יחידה — חלופה שהוחלפה | `tools/test_line_changes_renamed.py` | `find_renamed` / `rename_records` |
| יחידה — כבישים | `tools/test_road_match.py` | סימון `same` / `diff` לקטעים |
| יחידה — הדף | `tests/line-changes-units.test.mjs` | כלל הרעש בשרטוט, ×N, קיצור ימים, "לא נמצאה תחנה חלופית קרובה" |
| המצגות בדפדפן | `tests/line-changes/decks.mjs` | 16 מצגות, 5 לוחות לפי יעד והודעה על שינוי כטבלה לפי יעד, מול `snapshots.json` |

הבדיקה בדפדפן בונה כל מצגת מהנתונים הקבועים ב-`tests/fixtures/line-changes/data`, עם שעה קבועה (19.11.2026) ובלי רשת
(אריחי מפה וגופנים חסומים), ומשווה לתמונה-במילים: הטקסט של כל שקף, קטעי המסלול הצבועים (מספר ואורך במטרים),
גבולות המפה ומפת ההתמצאות, והמקום של "כאן המסלול משתנה". בלוח לפי יעד — כל השורות, ובדיקה שסדר השעות על
המסך נכון (לפי המיקום של כל שעה) ושכל סימן ימים צמוד לשעה שלו; הכותרות (כולל פיצול ימי חול — "יום חול" מעל
א׳–ד׳ · יום ה׳), כמה תאים ממוזגים; "להכניס לעמוד אחד" — שהלוח נכנס, או שמופיע "צריך לפחות N עמודים"; שבכל עמוד יש
שורת "המידע הוכן על ידי אדם פרטי · לא פרסום רשמי" והקרדיט; ובקובץ האקסל — הכותרת הממוזגת, התאים הממוזגים, השורה
והקישור. בקו חדש הלוך וחזור (827) — בלוק לכל כיוון בשקף המפה, בשלט ובסטטוס, בלי לגלוש מהשקף. לא משווים פיקסלים.

## הרצה מקומית

```
npm i --no-save --prefix /tmp/lc playwright leaflet@1.9.4
NODE_PATH=/tmp/lc/node_modules node tests/line-changes/decks.mjs
python3 -m pytest -q tests/test_line_changes_units.py tools/test_line_changes_renamed.py tools/test_road_match.py
node --test tests/line-changes-units.test.mjs
```

`CHROME=/path/to/chrome` — דפדפן אחר; `ONLY=10971-20261121` (או `board-ltr`) — מצגת אחת.

## כשהבדיקה נכשלת

הפלט מראה לכל שקף שהשתנה מה היה ומה יש עכשיו. אם השינוי מכוון (למשל ניסוח חדש, או תיקון במפה) — בודקים
את המצגות באתר, ומעדכנים את התמונה-במילים באותו PR:

```
UPDATE_SNAPSHOTS=1 NODE_PATH=/tmp/lc/node_modules node tests/line-changes/decks.mjs
```

(עם `ONLY=<מזהה>` — רק המצגת הזו מתעדכנת). ב-PR רואים ב-diff של `snapshots.json` בדיוק מה השתנה.

## החלפת המצגות שבבדיקה

הרשימה ב-`make_fixtures.py` (`DECKS`) וב-`decks.mjs` (`DECKS`). אחרי שינוי ברשימה:

```
python3 tests/line-changes/make_fixtures.py          # מעתיק מ-origin/main (git show), בלי להוריד את כל הנתונים
UPDATE_SNAPSHOTS=1 NODE_PATH=/tmp/lc/node_modules node tests/line-changes/decks.mjs
```
