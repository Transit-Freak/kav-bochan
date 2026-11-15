# צי הרכבים (`fleet/`) — מדריך לסוכנים

תיעוד פנימי. כתוב כאן רק מה שנבדק בקוד, ב-workflows ובנתונים (11.2026). מה שלא נבדק מסומן "לא ברור".

## מה הכלי מציג

כל האוטובוסים שנראו בשידורי ה-SIRI, לפי חברה: מתי כל רכב נראה לראשונה ולאחרונה, כמה נסיעות ביום, דגם ושנה מהרישוי, ורכבי קבלן.
יש גם תצוגות לפי עיר ולפי אשכול, לפי קו (אילו דגמים נוסעים בכל קו), "מעברים" של רכבים בין חברות וערים, נפילות וחזרות, רכבים ממוגנים ותמונות.

## מקורות נתונים

| מקור | מה נלקח ממנו | איפה בקוד |
|---|---|---|
| קובצי SIRI גולמיים ב-S3 של דאטאבוס (אופן באס) | כל נסיעה: מפעיל, קו, journey, מספר רכב, שעת יציאה | `tools/siri_s3.py` ← `tools/fleet_scan.py`, `tools/fleet_line_trips.py` |
| ה-API של דאטאבוס (`/siri_rides/list`) | רק להשוואה (`SRC=api`) | `fleet_scan.py` |
| data.gov.il, מאגר הרישוי (`resource_id` `cf29862d-ca25-4691-84f6-1be60dcb4a1e`) | שנת ייצור, יצרן ודגם, סוג רישוי | `tools/fleet_refresh_registry.py`, `tools/fleet_enrich_gov.py` (דרך API, לפי הכלל בשורש) |
| data.gov.il, "ציי רכב אוטובוסים" | המפרט הרשמי ורכבים ממוגנים. רכב שלא מופיע במאגר נחשב רכב קבלן | `tools/fleet_armor.py` |
| data.gov.il, ביטול סופי | רכבים שירדו מהכביש | `tools/fleet_bitul_sofi.py` |
| GTFS (`routes.txt`) | שיוך קו לערים | `tools/fleet_cities.py`, `tools/fleet_moves.py` |
| GitHub Releases `photos-inbox` / `photos` | תמונות רכבים שהועלו ידנית (שם הקובץ הוא מספר הרכב) | `fleet-photos.yml` |
| `bus/data/fleetday/`, `bus/data/gps.json` | כמה רכבים עבדו ביום, לפי אשכול ועיר. נבנה ב"מדד האמינות" | `tools/bus_reliability.py` (`fleet_day`) ← `bus-reliability.yml` |

## צינור הבנייה

| workflow | מתי | מה הוא מריץ (לפי הסדר) |
|---|---|---|
| `fleet-months` | cron `15 0 * * *` | `fleet_scan.py` עם `MONTHS_ONLY=1`: עובר שוב על העבר וממלא רק את מסיכת החודשים, בלי לספור נסיעות פעמיים. מתקדם עם `months_done` ומשרשר את עצמו (`chain`). אחריו `fleet_cities`, `fleet_flaps`, `fleet_moves`, `fleet_city_veh` |
| `fleet-scan` | cron `30 0 * * *` | `fleet_scan` ← `fleet_enrich_gov` ← `fleet_cities` ← `fleet_km` ← `fleet_armor` ← `fleet_days` ← `fleet_flaps` ← `fleet_moves` + `fleet_city_veh`. כל הצעדים חוץ מהסריקה הם best-effort. אחר כך commit (`data: fleet — ...`), ו-backfill שמפעיל את עצמו שוב עם `from`/`to`/`chain=true` |
| `fleet-registry` | cron `15 2 * * *`, push, dispatch | בדיקת `test_fleet_refresh_registry.py` ← `fleet_refresh_registry` ← `fleet_enrich_gov` ← `fleet_armor` ← `fleet_bitul_sofi` |
| `fleet-line-trips` | cron `10 4 * * *` | `fleet_line_trips.py`: שלושת החודשים האחרונים, מהיום החדש לישן, עם `MAX_MIN`. משרשר את עצמו |
| `fleet-photos` | cron `25 * * * *` | מעביר תמונות מ-`photos-inbox` ל-`photos` ומעדכן את `fleet-photos.json` |
| `fleet-cities` | dispatch בלבד | בנייה מחדש של ערים, ק"מ, מיגון ומעברים |

אין `workflow_run` בין ה-workflows של הצי. הסדר נשמר בתוך כל workflow, ובשעות ה-cron: months ב-00:15, scan ב-00:30, registry ב-02:15, line-trips ב-04:10. `pages-deploy` מפרסם את השינויים.

### קובץ נתונים ← סקריפט ← workflow
| קובץ ב-`fleet/data/` | סקריפט | workflow |
|---|---|---|
| `fleet-state.json` (המצב המצטבר) | `fleet_scan.py` | `fleet-scan`, `fleet-months` |
| `fleet.json` | `fleet_scan.py` כותב את הבסיס, ו-`fleet_enrich_gov.py` ו-`fleet_bitul_sofi.py` מוסיפים שדות | `fleet-scan`, `fleet-registry` |
| `fleet-bitul.json`, `gov-details-0..9.json` | `fleet_enrich_gov.py` | `fleet-scan`, `fleet-registry` |
| `cf29862d-....csv`, `gov-registry-source.json` | `fleet_refresh_registry.py` | `fleet-registry` |
| `fleet-armor.json`, `fleet-official.json` | `fleet_armor.py` | `fleet-scan`, `fleet-registry` |
| `fleet-bitul-sofi.json` | `fleet_bitul_sofi.py` | `fleet-registry` |
| `fleet-cities.json` | `fleet_cities.py` | `fleet-scan`, `fleet-months` |
| `fleet-km.json` | `fleet_km.py` | `fleet-scan` |
| `fleet-days.json` | `fleet_days.py` | `fleet-scan` |
| `fleet-gaps.json` | `fleet_flaps.py` | `fleet-scan`, `fleet-months` |
| `fleet-moves.json` | `fleet_moves.py` | `fleet-scan`, `fleet-months` |
| `fleet-city-veh.json` | `fleet_city_veh.py` | `fleet-scan`, `fleet-months` |
| `fleet-lines.json`, `lines/<op>-<route>.json`, `fleet-line-trips-state.json.gz` | `fleet_line_trips.py` | `fleet-line-trips` |
| `fleet-photos.json` | סקריפט בתוך ה-workflow | `fleet-photos` |

## מבנה הנתונים העיקרי

| קובץ | שדות מרכזיים |
|---|---|
| `fleet.json` | `updated`, `retire_days` (30), `v` (2), `operators[]`: `{ref, name, vehicles[]}`. כל רכב הוא מערך: `[מספר רכב, ראשון, אחרון, נסיעות ליום בממוצע, שנה, "יצרן דגם", דלתות, סוג רישוי]`. ארבעת האחרונים מגיעים מ-`short_info` ב-`fleet_enrich_gov.py`. ב-`v:2` הדף משתמש ב-`OFF=1`, ובגרסה הישנה לא היה שדה ממוצע |
| `fleet-state.json` | `vehicles: {"מפעיל:רכב": [ראשון, אחרון, סך נסיעות, ימי פעילות, [קווים, עד 40], מסיכת חודשים (bit, 0 = ינואר 2020), {קו: [חודש ראשון, חודש אחרון]} עד 60 קווים]}`, ונקודות שמירה של הסריקה |
| `fleet-moves.json` | `since`, `cov` (טווחי ימים שנסרקו עם רישום "קו לפי חודשים"), `m: {רכב: {מפעיל: [[ערים], {עיר: [חודש ראשון, אחרון]} או null]}}`. נכללים רק רכבים שהיו אצל יותר מחברה אחת, או שעברו עיר באותה חברה |
| `fleet-days.json` | `d: {"מפעיל:רכב": [ימי פעילות, סך נסיעות]}` |
| `fleet-lines.json` | `from`, `to`, `ndays`, `newy`, `models[]` ולכל קו הדגמים לפי רכבים ולפי נסיעות. הפירוט נמצא ב-`lines/<op>-<route>.json` (`models`, `mt`, `dep` לכל שעת יציאה) |
| `fleet-city-veh.json` | `cities[]` ורכבים לכל עיר, לפי חודשים |
| `fleet-armor.json` | `armor: {רכב: 'y'/'s'/'ys'}` |

## הדף

- `index.html` הוא קובץ HTML אחד, עם JS ו-CSS בתוכו, בלי React ו**בלי build**. `moves.js` נטען כ-`<script>` (`window.FleetMoves`), וגם כמודול ב-Node בשביל הבדיקות.
- `window.FLEET_BUILD='23'` (שורה ~309): בכל טעינה הדף מוריד את עצמו ובודק אם יש מספר גבוה יותר, ואם כן נטען מחדש. **צריך להעלות את המספר בכל שינוי בדף**, אחרת דפדפנים עלולים להמשיך להציג את הגרסה הישנה מהמטמון.
- טעינה ראשית בשורה ~2064: `fetch('data/fleet.json')`. מסננים את המפעילים `ref` 2, 20 ו-21 ושמות מהצורה "מפעיל N", ואז `buildX()` ← `applyHash()` ← `render()`.

| מה | איפה (בערך) |
|---|---|
| `TNAMES`/`fixT` (שמות סוגי רישוי), `gY/gM/gD/gT/gR` (גישה לשדות) | 336–350 |
| `isActive`, `isKab` (רכב קבלן), `inOfc`, `buildX` (`XPLATE`: מספר רכב ← רשומות), `movedTo` | 358–386 |
| `home`, `kpis` | 394–408 |
| ערים ואשכולות (`cityView`, `clusterHome`, `loadFD` מ-`bus/data/fleetday`) | 453–760 |
| מעברים (`loadMoves`, ושימוש ב-`FleetMoves.moves`) | 817–900 |
| `occSet` / `occLine` (נסיעות בודדות) | 1357–1370 |
| כרטיס רכב (`showV`) | 1515 |
| לפי קו (`loadLines`, `loadDep`) | 1720–1760 |

- `moves.js` מכיל את הלוגיקה של "מעבר": חפיפה של עד 120 יום מותרת, ו-`minDays` מסנן הופעה קצרה אצל חברה אחות.

## בדיקות

| בדיקה | הרצה | workflow |
|---|---|---|
| `tests/fleet-moves.test.mjs` (`moves.js`) | `node --test tests/*.test.mjs` | `tests.yml` (push ל-`tools/**`, `tests/**`, `fleet/*.js`) |
| `tests/test_fleet_tools.py`, `tests/test_fleet_changes.py`, `tests/test_fleet_day.py` (`fleet_day` ב-`bus_reliability.py`) | `python3 -m pytest tests -q` | `tests.yml` |
| `tests/test_fleet_refresh_registry.py` | `python3 -m unittest discover -s tests -p 'test_fleet_refresh_registry.py'` | `fleet-registry` |

הבדיקות לא מכסות את `index.html`. אחרי שינוי בדף צריך לבדוק אותו בעין.

## מלכודות ידועות

- **המפעיל של נסיעה נקבע לפי ה-SIRI של אותו יום** (`operator_ref` בכל רשומה ב-`siri_s3.py`), ולא לפי ה-GTFS. רכב של חברה אחת שמדווח בקוד של חברה אחרת יוצר רשומה נפרדת אצל החברה השנייה.
- **"נסיעות בודדות" (`occSet`):** רשומה של רכב אצל חברה שנייה עם עד 60 נסיעות (`OCC_MAX`), פחות מ-5% מהחברה הראשית, וכולה בתוך התקופה של החברה הראשית. היא מוצגת כ"↪ נסיעות בודדות" ולא נספרת כמעבר (PR #396). **הכלל לא חל על רכבי קבלן**, כי הם נוסעים אצל כמה חברות לפי עבודה.
- **אותו מספר רכב יכול להופיע אצל כמה חברות.** המפתח בכל הקבצים הוא `מפעיל:רכב`, ו-`XPLATE` בדף מקבץ את כל הרשומות של אותו מספר. אין להניח שמספר רכב מזהה רכב אחד בלי לבדוק גם את המפעיל.
- **רכב קבלן** הוא רכב פעיל שלא מופיע במאגר "ציי רכב אוטובוסים". רכב שכבר ירד מהשירות מסווג לפי סוג הרישוי (`isKab`). רכבי קבלן לא נכללים ב"הכי מקולקלים" ובמדד האמינות של הדגמים.
- **מצב "חודשים בלבד"** (`MONTHS_ONLY`) לא סופר נסיעות וימים. ספירה כזו בסריקה חוזרת הייתה מכפילה את הממוצעים.
- **רשימות מוגבלות בגודל:** ב-`fleet-state` נשמרים עד 40 קווים לכל רכב, ועד 60 קווים ברישום "קו לפי חודשים". קווים היסטוריים שכבר לא נמצאים ב-`routes.txt` לא משויכים לעיר.
- **מפעילים 2, 20, 21 מוסתרים בדף**, אבל קיימים בנתונים. הסיבה לא כתובה בקוד (לא ברור).
- הערת `nextScan` ב-`index.html` מדברת על "סריקה חודשית ב-1 בחודש", אבל ה-cron של `fleet-scan` רץ כל לילה. לא ברור אם ההערה פשוט ישנה.
- נתוני `fleetday` שייכים ל-`bus/` (מדד האמינות), לא לצי. שינוי בפורמט שלהם משפיע על שני הכלים.

## כללים מה-CLAUDE.md הראשי

- `versions.json`, מפתח `fleet`: לעדכן בכל שינוי שהמשתמש רואה (גרסה אחת ביום). בדף הזה צריך גם להעלות את `FLEET_BUILD`.
- נתונים מ-data.gov.il מושכים רק דרך ה-API, לא דרך הורדת קבצים.
- עותק מקומי חלקי בלי `fleet/data/`. קבצי נתונים קוראים עם `git show origin/main:fleet/data/...`.
- כרטיס שיתוף: `fleet/og-image.png` (`tools/og_cards.mjs`).
