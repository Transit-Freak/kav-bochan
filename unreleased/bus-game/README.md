# משחק הקווים — קריית מלאכי (אב-טיפוס, לא באתר)

משחק תלת־ממדי בדפדפן: מתכננים קווי אוטובוס על מפה אמיתית של קריית מלאכי, והאוטובוסים נוסעים ברחובות,
עוצרים בתחנות, פותחים דלתות, ונוסעים עולים ויורדים.

הרצה מקומית: `python3 -m http.server` מתוך התיקייה הזו, ואז `http://localhost:8000/`.
בלי שלב בנייה: three.js נמצא ב-`vendor/three`. `?placeholders` — דגמים פשוטים במקום ה-GLB, `?fps` — מונה פריימים.

## מבנה

| קובץ | מה |
|---|---|
| `js/world.js` | קרקע, שטחים ירוקים, רחובות + מדרכות, בניינים מוחלצים, עצים |
| `js/graph.js` | רשת הנסיעה, Dijkstra, קו שבור, פרופיל מהירות |
| `js/lines.js` | קו: מסלול בין תחנות, ציור, שמירה ב-localStorage |
| `js/sim.js` | שעון, יציאות לפי תדירות, נסיעה, עצירות, עולים/יורדים (בלי ציור) |
| `js/actors.js` | האוטובוסים והאנשים (GLB, ואם חסר — דגם פשוט) |
| `js/cameras.js` | מצבי מצלמה. חופשי ומעקב פעילים; נהג/פקח/נוסע — מקום שמור לשלב הבא |
| `js/main.js` | חיבור הכל + ממשק |

## נתונים ונכסים — שלבים נפרדים, לא בזמן המשחק

1. **OSM**: ‏`.github/workflows/bus-game-osm.yml` מוריד מ-Overpass את `world/osm_raw.json.gz` (Overpass חסום מסביבת העבודה).
2. **העיר**: `python3 tools/build_city.py` ← `world/city.json` (בניינים, רחובות, רשת נסיעה, תחנות GTFS מ-`world/gtfs_stops.csv`).
3. **דגמים**: ‏`.github/workflows/bus-game-assets.yml` מריץ Blender: בונה את האוטובוס ואת האדם בקוד של הענף
   `claude/blender-test`, ומייצא עם `tools/export_bus.py` ו-`tools/export_person.py` ל-`assets/bus.glb` ול-`assets/people/person_<n>.glb`.
   האנשים: כמה אנשים שונים (גברים ונשים, גילים, עור, שיער ובגדים — נכסי MakeHuman CC0 בלבד), מוגדרים ב-`tools/person_variants.py`.
   כל אחד עם הליכה (CMU 16_15) ועמידה, והטקסטורות המקוריות. רשימת הקבצים: `assets/people/people.json`.
   הרצה ידנית של חלק מהאנשים: workflow_dispatch עם `only` (למשל `0,3`), והאוטובוס עם `bus`.
4. **בלי glb**: במקומות שלא מגישים קבצי ‎.glb‏ (התצוגה המקדימה הפרטית) — `python3 tools/glb_to_gltf_json.py assets/bus.glb assets/people/*.glb`
   יוצר ליד כל קובץ `X.gltf.json`, והמשחק טוען אותו אם ה-glb חסר. לא שומרים אותם בריפו (`.gitignore`).
   אפשר גם מקומית עם `pip install bpy` (חוץ מהאדם, שצריך את התוסף MPFB).
