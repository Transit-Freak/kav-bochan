# הקו בזמן (`line-history/`) — מדריך לסוכנים

תיעוד פנימי. כאן כתוב רק מה שנבדק בקוד, ב-workflows ובנתונים (11.2026). דברים שלא נבדקו מסומנים "לא ברור".

## מה הכלי מציג

ההיסטוריה של כל קו תחבורה ציבורית בישראל: אוטובוס, רכבת ומונית שירות, מ-2003 ועד היום.
לכל וריאנט (מק"ט-כיוון-חלופה) יש ציר זמן של אירועים: וריאנט חדש, שינוי מסלול, תחנות שנוספו או ירדו, החלפת מפעיל, שינוי לו"ז, ביטול ועוד.
בנוסף יש לשוניות של שינויים לפי חודש, תחנות, מפה וסוגי תחבורה, דף "מה השתנה", מעקב והתראות (OneSignal).

## מקורות נתונים

| מקור | מה נלקח ממנו | איפה בקוד |
|---|---|---|
| GTFS יומי של משרד התחבורה (`gtfs.mot.gov.il/.../israel-public-transportation.zip`) | ההשוואה היומית: מסלולים, תחנות, מפעיל, יעד | `line-history.yml` ← `tools/linehistory.py` |
| ארכיון ה-GTFS היומי של אופן באס / דאטאבוס (S3 `openbus-stride-public/gtfs_archive/YYYY/MM/DD/`) | גיבוי כש-gov.il לא עונה, `ClusterToLine.zip`, שחזור היסטוריה יום-מול-יום (`src:"ob"`) | `line-history.yml`, `tools/last_sched.py`, `backfill-*.yml` |
| `Gtfs_10_days.zip` (רישוי יומי, משרד התחבורה) | תגבורים, כלומר כמה רכבים יוצאים באותה נסיעה (`src:"v10"`) | `tools/scan_vcnt_daily.py` |
| TransitFeeds (ארכיון הפיד הארצי) | היסטוריה לפני ארכיון אופן באס (`src:"tf"`) | `tf-backfill.yml` ← `tools/backfill_tf.py` |
| אתרי המידע לנוסעים מ-2003 | היסטוריה מוקדמת | `website-history.yml` (שם: historical-passenger-websites) ← `tools/import_website_history.py` |
| ארכיון 2012–2018 | צילומי מסלולים ותחנות היסטוריים | `early-history.yml` (שם: historical-2012-2018), `tools/import_early_history.py` |
| ריפו `kav-bochan-archive` | `early-patterns/` ו-`early-stops/`. נמצאות רק שם מ-11.2026 | `ARCHIVE_BASE` + `archFetch()` ב-`src/04-variants.jsx` |
| `magihim-2012/data/` | קווים ותחנות 2012 | נקרא מהדף ב-`../magihim-2012/data/...` |
| מאגר הרישוי (data.gov.il, API) | סוג הרכב בקו | `tools/linehistory_rishui.py` |
| ענף `osm-roads` (`roads.json`) | שם רחוב לכל תחנה, לתיאורי החלופות | `tools/build_stop_streets.py` |

ערכי `src` בגרסאות של קו: `tf`, `ob`, `v10`. ייתכנו ערכים נוספים מכלי ה-backfill (לא נבדק אחד-אחד).

## צינור הבנייה

### `line-history.yml`: הצינור היומי
- **מתי:** cron `30 7 * * *` (10:30 בישראל בקיץ) וגם `30 15 * * *`. הריצה השנייה מדלגת אם `lines.json.gen` כבר שווה לתאריך של היום. רץ גם ב-push ל-main כשמשתנים הסקריפטים שלו, וב-dispatch.
- **סדר הצעדים:**
  1. הורדת GTFS (gov.il, ואם נכשל אז S3) ו-ClusterToLine.
  2. `build_stop_streets.py`.
  3. `linehistory.py` (ההשוואה היומית, עם `REBASE=1` כשקיים `data/.rebase`), ואחריו `platforms.py`, `city_centers.py`, `collapse_wobbles.py`, `mark_echo_events.py`, `qa_checks.py`.
  4. `scan_vcnt_daily.py`, `linehistory_rishui.py`, `linehistory_ltype.py`, `last_sched.py`.
  5. סריקת קו באג (OSRM, GPS) על אותו GTFS, וכתיבה ל-`kavbug-data/`.
  6. העלאת ה-GTFS כ-artifact בשם `gtfs-daily`, לשימוש של צינורות אחרים.
  7. **commit:** אחרי rebase על השינויים של אחרים רצה שרשרת עיבוד-אחרי: `enrich_stop_diffs`, `fix_dest_kind`, `drop_rename_only`, `enrich_2017`, `fix_false_removed`, `mark_reverted_changes`, `repair_*`, `build_archive_months`, `build_stop_shards`, `foi_taxi`, `compact_lines`, `rebuild_lines_index`, `build_alt_desc.mjs`, `link_mot2012`, `line_successors`, `build_stop_history`, `build_city_search`, `build_kavpach_live`, `build_stop_lines_2012`. הקומיט: `data: line-history — ...`.

### מה רץ אחרי (workflow_run על `line-history`)
| workflow | מה הוא עושה |
|---|---|
| `kavpach-overlap` | קו פח, ואחריו `kavpach-build` (שמחכה גם ל-bus-reliability) |
| `notify-push` | התראות למנויים (`tools/send_push.py`), רק על main |
| `update-weekly`, `skiplines-experiment` | צרכנים נוספים של הנתונים |
| `pages-deploy` | פריסה (גם כל 10 דקות כרשת ביטחון). דוחס את `line-history/data/changes/*.json` ל-`.json.gz`, רק בעותק שמתפרסם |

### workflows נוספים שכותבים ל-`line-history/data`
`freq-scan` (`backfill_freq_daily.py`, ידני או push), `tf-backfill`, `backfill-*`, `website-history` (cron `17 */6`), `early-history` (cron `17 * * * *`, ונכשל בכוונה אם יש ייבוא חדש, ראו מלכודות), `pubdest-hist` (`25 */2`), `audit-archive-daily` (`52 * * * *`), `repair-archive-schedules`, `rishui-backfill`, `routes-scan`.

### קובץ נתונים ← סקריפט ← workflow
| קובץ ב-`line-history/data/` | נוצר ע"י | workflow |
|---|---|---|
| `lines/<rd>.json` (גרסאות) | `linehistory.py`, ואחריו `scan_vcnt_daily.py`, `last_sched.py`, ה-backfills ו-`compact_lines.py` | `line-history` ועוד |
| `lines.json` (אינדקס) | `rebuild_lines_index.py` | `line-history`, `tf-backfill`, `backfill-history`, `website-history` |
| `changes/YYYY-MM.json` | `linehistory.py` / `scan_vcnt_daily.py` (הוספה לחודש), `build_line_changes.py` | `line-history`, `freq-scan` |
| `months.json` | `build_archive_months.py` | `line-history`, `early-history`, `website-history` |
| `sched/<2 תווים>.json` | `scan_vcnt_daily.py` | `line-history` |
| `stops/`, `stopev/`, `stops-hist.json` | `build_stop_shards.py`, `build_stop_history.py` | `line-history` |
| `successors/` | `line_successors.py` | `line-history` |
| `alt-desc/` | `build_alt_desc.mjs` | `line-history` |
| `platforms.json` | `platforms.py` | `line-history` |
| `cities.json` | `city_centers.py` | `line-history` |
| `digest.json` | לא ברור (לא נבדק) | — |
| `qa.json`, `qa.html` | `qa_checks.py` | `line-history` |
| `*-state.json` | נקודות שמירה (checkpoints) של כלי ה-backfill, לא נקראים מהדף | שונים |

## מבנה הנתונים העיקרי

**שם קובץ מ-rd:** `fsafe(rd)` (ב-`src/01-core.jsx`) מחליף `#`←`H` ו-`/`←`_`. לדוגמה, rd `10001-3-#` נשמר בקובץ `lines/10001-3-H.json`. בדפי השיתוף (`s/`) יש פונקציה אחרת, `ssafe`, שחייבת להתאים ל-`tools/share_stubs.py`.

| קובץ | שדות מרכזיים |
|---|---|
| `lines.json` | `gen` (תאריך הריצה), `lines[]`: `rd`, `line`, `dest`, `op`, `ty`, `tt` (סוג: rail/taxi/...), `v` (מספר גרסאות לא מוסתרות), `ks` (סוגי האירועים), `lk`/`ld` (סוג ותאריך של האירוע האחרון), `historicalOnly`, `observationOnly` |
| `lines/<rd>.json` | `rd`, `line`, `dest`, `op`, `tt`, `versions[]`, `pool` (תחנות ייחודיות `[קוד, שם, lat, lon]`), `spool` (polylines ייחודיים) |
| `versions[]` | `d` (תאריך), `k` (סוג, הרשימה ב-`KINDS` ב-`src/01-core.jsx`), `note` (טקסט בעברית), `src`, `stops` (אינדקסים ל-`pool`), `shp` (אינדקס ל-`spool`), `sd` (נראה לאחרונה), `hid` (מוסתר), `tb` (טבלת לו"ז, בגרסת `k:"times"` של `last_sched`) |
| `changes/YYYY-MM.json` | `month`, `changes[]`: `d`, `rd`, `line`, `k`, `note` |
| `sched/XX.json` | `g` (תאריך), `lines: { rd: { "א": ["06:00",...], "ב": [...], ..., "ש": [...] } }`. השם הוא שני התווים הראשונים של `fsafe(rd)` |
| `months.json` | רשימת החודשים שיש להם קובץ. חייבת להתאים לקבצים שבדיסק (נבדק ב-guard) |

`compact_lines.py` מעביר תחנות ומסלולים ל-`pool`/`spool`, וב-`versions` נשארים אינדקסים בלבד.

## הדף

- `index.html` טוען את React 18 ואת Babel מ-`../vendor/`, מוריד את `src/files.json` ואת כל החלקים שהוא מונה (`?v=<now>`),
  **מחבר אותם לפי הסדר ומקמפל בדפדפן** (`Babel.transform`, preset react). הפלט נשמר ב-localStorage (`lh-js-190-<hash>`). **אין build.**
- הקוד ב-`src/`, מחולק לפי נושא (עד 11.2026 היה קובץ אחד, `app.jsx`). החלקים מקומפלים יחד כמו קובץ אחד, ולכן כל השמות משותפים
  ביניהם, והסדר ב-`files.json` הוא סדר ההרצה — הגדרות `const` ברמה העליונה צריכות להופיע לפני מה שמשתמש בהן בזמן הטעינה.
  חלק חדש — להוסיף ל-`files.json` במקום הנכון. כלים שקוראים את הקוד (`tools/build_alt_desc.mjs`, `tools/check_line_history_ui.mjs`,
  `website-history.yml`) מחברים את החלקים לפי `files.json`.

| קובץ ב-`src/` | מה יש בו |
|---|---|
| `01-core.jsx` | `KGROUP`, `KINDS` (תוויות וצבעים לסוגי האירועים), `fsafe`/`ssafe`, `dfetchGz`/`dfetch` (קודם `.json.gz`, ואם אין אז `.json`), עזרי תאריכים |
| `02-diff.jsx` | השוואת מסלולים (`segDiff`), השוואת זמנים (`TimesDiff`), מפת השינוי (`DiffMap`) |
| `03-common.jsx` | קישורים (`lineHref`, `plainClick`), תגיות, אירועים זמניים, hooks לנתוני עזר (רציפים, 2012, רכבת) |
| `04-variants.jsx` | החלופות של קו: `describeVariant`, `AlternativeSelector`, `ARCHIVE_BASE`/`archFetch` (ריפו הארכיון) |
| `05-schedule.jsx` | קווים ממשיכים, `SchedBox` (לו"ז מ-`sched/`), `RailSched` |
| `06-follow.jsx` | התראות ומעקב (OneSignal, `cityTag` — זהה ל-`tools/send_push.py`), `NotifyCenter`, `DigestPage` |
| `07-line-page.jsx` | `LinePage` (עמוד הקו), מפת אירוע תחנה, `Line2012Page` |
| `08-search.jsx` | החיפוש: תוצאות 2012, קיבוץ התוצאות, שמות ערים ושם המסלול |
| `09-changes.jsx` | `DayFeed` (שינויים לפי יום) ו-`RecentChanges` (הדף הראשי) |
| `10-stops.jsx` | `StopsTab` ועמוד תחנה (`LinesAtStop`) |
| `11-map.jsx` | `MapTab` |
| `12-sources-history.jsx` | `TABS`, `SOURCES`, `ModesTab`, הארכיון ההיסטורי (`HistoricalPeriod`, `HistoricalDay`), הודעות החברות (`NewsFeed`) |
| `13-app.jsx` | `App`, הלשוניות הראשיות, הניתוב, והרצה |

- עיצוב: `styles.css`. תמונת שיתוף: `og-image.png`.

## בדיקות

| בדיקה | מה היא בודקת | הרצה | workflow |
|---|---|---|---|
| `tools/check_line_history_ui.mjs` | כל חודש שיש לו קובץ מופיע ב-`months.json` ולהפך; בדפדפן: החודש הכי ישן נגיש מהממשק | `npm i --no-save playwright-core && CHROMIUM_PATH=... node tools/check_line_history_ui.mjs` (מהשורש) | `line-history-guard` (push ל-`line-history/**`, רק main) |
| `tools/check_early_history_ui.mjs` | הארכיון ההיסטורי בדפדפן נייד | כמו למעלה | `line-history-guard`, `early-history`, `repair-archive-schedules` |
| `tools/check_website_history_ui.mjs`, `check_history_claims.py`, `check_early_history.py` | ייבוא אתרי הנוסעים | — | `website-history` |
| `tests/test_schedule_diff.py`, `test_early_history.py` | השוואת לו"ז וייבוא מוקדם | `python3 -m pytest tests/test_schedule_diff.py` | `repair-archive-schedules` מריץ את `test_schedule_diff.py`; `test_early_history.py` לא ברור (`tests.yml` מריץ pytest רק על `tests/`) |
| `tests/alternative-selector.cjs` | בוחר החלופות | לא ברור אם רץ ב-CI (`tests.yml` מריץ רק `tests/*.test.mjs` ו-pytest) | — |

הבדיקות צריכות את `line-history/data/`, והוא לא נמצא בעותק המקומי החלקי. לכן מריצים אותן ב-GitHub, לא מקומית.

## מלכודות ידועות

- **הלשוניות הראשיות הן `<a role="tab" href=...>` ולא כפתורים** (מאז 05.11, PR #357), כדי שאפשר יהיה לפתוח אותן בכרטיסייה חדשה. לחיצה רגילה נתפסת ב-`plainClick`. בדיקה או סקריפט שמחפשים `button[role=tab]` לא ימצאו אותן. (במפה עדיין יש לשוניות `<button role="tab">`.)
- **`early-patterns/` ו-`early-stops/` נמצאות רק בריפו `kav-bochan-archive`** (PR #394). `archFetch` מפנה אליו, גם בהרצה מקומית. `early-history.yml` נכשל בכוונה (`::error::`) אם מופיעים צילומים חדשים לייבוא, כי הייבוא עוד לא הותאם לכתיבה לריפו הארכיון.
- **שינוי שעות קטן לא תמיד נרשם כאירוע.** `backfill_freq_daily.py` רושם `freq`/`sched` רק אם השינוי החזיק לפחות 14 יום ונראה לפחות פעמיים באותו "דלי" של יום בשבוע. שינויים בכמה ימים בטווח של 12 יום מאוחדים לאירוע אחד. בנוסף, `freq` בלי המילה "תגבור" בהערה מוצג בדף כ-`sched`.
- **ההיסטוריה של תגבורים (`v10`) מתחילה רק מתחילת הסריקה.** הארכיונים לא שומרים את `Gtfs_10_days.zip`.
- **`changes/` מתפרסם כ-`.json.gz`** רק באתר (`pages-deploy`). במאגר הקבצים הם `.json`. בקוד הדף משתמשים ב-`dfetch` ולא ב-`fetch` רגיל.
- **שם הקובץ שונה מ-rd** (`#`←`H`). חיפוש `lines/10001-3-#.json` לא ימצא את הקובץ.
- **`rebuild_lines_index.py` גם מוחק שדות** (למשל `tt`) כשהם יורדים מקובץ הקו, אחרת סיווג ישן נשאר באינדקס. כשמוסיפים שדה לאינדקס, צריך גם למחוק אותו כשהוא נעלם.
- **מוניות שירות מנתוני חופש המידע (2013–2017) בלי מספר קו.** `import_foi_routes.py` מנחש מספר קו משלוש הספרות האחרונות של המק"ט,
  ובמוניות זה שגוי. `tools/foi_taxi.py` (נקרא מהייבוא וגם בשרשרת של `line-history.yml`) מזהה אותן (`foiOnly`, מק"ט של 7 ספרות,
  שתי תחנות, "תחנת מוניות"), שם `tt:"taxi"` ו-`line:""`, ומשאיר מספר רק כשאומת (`CONFIRMED`). לקווים שהמשיכו ב-GTFS יש
  `foiNext`, והמפה בעמוד הקו מציגה את המסלול של הקו שהמשיך. בדף: `taxiName()` ב-`src/08-search.jsx`. האינדקס מקבל `foi:1`.
- **`versions` עם `hid`** לא נספרות ולא מוצגות. הערות כמו "שוחזר בדיעבד" נשארות בנתונים אבל מוסתרות בציר הזמן (PR #251).
- **ריצת ה-commit עושה rebase ומריצה מחדש את כל שרשרת העיבוד** על הקבצים שהשתנו אצל אחרים. סקריפט חדש שצריך לרוץ אחרי כל שינוי בנתונים צריך להיכנס לשרשרת הזו, ולא רק לצעד ה-diff.
- **`line-history.yml` רץ ב-push רק על main** (`if: github.ref == 'refs/heads/main' || ...`). בענף עבודה הוא לא בונה נתונים.

## כללים מה-CLAUDE.md הראשי

- `versions.json`, מפתח `line-history`: לעדכן בכל שינוי שהמשתמש רואה. גרסה אחת ביום, שורות קצרות.
- עותק מקומי חלקי ורדוד, בלי `*/data/`. קבצי נתונים קוראים עם `git show origin/main:line-history/data/...`.
- מפות Leaflet: כלל ה-tooltip ל-RTL.
- כרטיס שיתוף: `og-image.png` (`tools/og_cards.mjs`).
- לא מזכירים כלים שלא עלו לאתר (`gis/`, `unreleased/`).
