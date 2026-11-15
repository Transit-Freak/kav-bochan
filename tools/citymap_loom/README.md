# מפת רשת עם LOOM

שרשרת שמציירת מפה סכמטית של קווי עיר בעזרת [LOOM](https://github.com/ad-freiburg/loom) (GPL-3).
קוד LOOM לא נמצא בריפו: בונים אותו מהמקור ושומרים רק את קובצי ה-SVG.

## הקבצים

| קובץ | מה הוא עושה |
|---|---|
| `cities.yml` | ברירת מחדל ועקיפות לכל עיר, רשימת הערים המאושרות, וה-commit של LOOM |
| `run.py` | השרשרת כולה לערים המאושרות, טבלת התרעות, ו-`maps/loom/index.json` |
| `make_gtfs.py` | GTFS קטן מקובץ עיר של `tools/citymap.py`, לפי רמה ולפי ההגדרות |
| `fixrestr.py` | מסיר איסורי פנייה ש-topo מסיק בטעות וקוטעים קו |
| `post.py` | שמות אופקיים למסופים, מרכזית ורכבת; תגי מספר בקצות הקווים; מחיקת סמני שאר התחנות |
| `check.py` | הבדיקה האוטומטית |
| `shot.mjs` | SVG ל-PNG, לבדיקה בעין |

השרשרת: `make_gtfs → gtfs2graph -m bus → topo -d → fixrestr → loom → octi --diag-pen → transitmap -l → post`.

## הרצה

```
git clone https://github.com/ad-freiburg/loom && cd loom && git checkout <loom_commit מתוך cities.yml>
git submodule update --init --recursive && mkdir build && cd build && cmake .. && make -j4    # כ-8.5 דקות
OUTDIR=/tmp/citydata python3 tools/citymap.py                                  # קובצי הערים
POI=poi.json python3 tools/citymap-build.py /tmp/citydata unreleased/citymap/maps   # המנוע הישן, לכל הערים
LOOM_BIN=<loom>/build python3 tools/citymap_loom/run.py /tmp/citydata unreleased/citymap/maps
```

כוונון עיר שעוד לא אושרה (לא משנה את `cities.yml`):

```
LOOM_BIN=… LOOM_KEEP=/tmp/kg python3 tools/citymap_loom/run.py /tmp/citydata /tmp/out --city "קרית גת" --force --set merge_hubs=none --set topo_d=60
node tools/citymap_loom/shot.mjs "/tmp/out/loom/קרית גת.internal.svg" /tmp/kg.png 1500
```

## מי מקבל איזו מפה

- עיר עם `approved: true` מקבלת מפת LOOM ברמות שב-`tiers`. כל השאר מקבלות את המפה של המנוע הישן
  (`tools/citymap-render.py`), שממשיך לרוץ על כל הערים ועל כל הרמות.
- רמה עם התרעה חמורה לא מוצגת, ובמקומה מוצגת המפה הישנה של אותה רמה. אם זו רמת ברירת המחדל
  של העיר, כל העיר חוזרת למפה הישנה. הריצה מדפיסה מה ירד.
- הדף (`unreleased/citymap/index.html`) קורא את `maps/loom/index.json` ומציג את מה שיש.
- מאשרים עיר רק אחרי בדיקה בעין של כל רמה שב-`tiers`.

## הבדיקה האוטומטית

| התרעה | חומרה |
|---|---|
| קו שהוזן ולא מופיע בפלט | חמור |
| קו שמצויר בכמה חלקים מנותקים | חמור |
| השרשרת נכשלה או חרגה מהזמן | חמור |
| קו עם מספר קצוות שאינו 0 או 2 (מתפצל, או כניסה הלוך-וחזור) | אזהרה |
| אורך הקו המצויר חלקי אורך המסלול מחוץ ל-0.6–1.6 | אזהרה |

הבדיקה לא רואה קשר של קווים בצומת, רווח בציור בתוך צומת, או שמות שעולים זה על זה. את אלה בודקים בעין.

## מה נוסה בקרית גת (15.11.2026, לא אושר)

| ניסיון | תוצאה |
|---|---|
| ברירת המחדל (איחוד רציפים לפי שם) | קשר בתחנה המרכזית |
| `merge_hubs: none` / `centroid` | אותן התרעות; `centroid` עם `no_infer_restrs` נבדק בעין, הקשר נשאר |
| `topo_d: 60` | יותר פיצולים |
| `cut_boxes` סביב התחנה המרכזית (200 ו-270 מ') | הקשר קטן, אבל קווים מצוירים עם רווחים והשם של התחנה נעלם |

בתחנה המרכזית יש רציף אחד, כך שהקשר לא בא מאיחוד רציפים אלא מהכניסות והיציאות של הקווים לתחנה.
