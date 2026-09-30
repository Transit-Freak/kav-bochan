# קו הנהגים

אפליקציית ניווט לנהגי תחבורה ציבורית: חיפוש קו או מק"ט, מסך נהיגה עם מפה,
תחנות והוראות פנייה (כולל מספר היציאה בכיכר). הכל סטטי, בלי שרת.

## מאיפה הנתונים

בפתיחה האפליקציה טוענת רשימת קווים מוכנה, ובבחירת קו — קובץ קטן עם הנסיעה
המייצגת, התחנות, הצורה והוראות הנהיגה. הקבצים נבנים אחת לשבוע ב-GitHub Actions
של [הקו הבוחן](https://github.com/Transit-Freak/kav-bochan)
(`tools/nahagim_build.py`) ומתפרסמים בענף `nahagim-data` שם:

- `index.json.gz` — כל הקווים
- `routes/<route_id>.json.gz` — קו אחד

הוראות הנהיגה מחושבות בהתאמת מפה של צורת הקו מה-GTFS לרשת הרחובות של
OpenStreetMap, בשרת OSRM עם פרופיל אוטובוס. הבדיקה שהובילה לשיטה הזאת:
[osrm-shape-probe](https://github.com/Transit-Freak/kav-bochan/blob/main/docs/osrm-shape-probe.md).

עדיין אפשר להעלות קובץ GTFS ידנית (`app.html#upload`), ואז הפענוח נעשה בדפדפן
כמו קודם.

## קרדיטים

- לוחות זמנים, תחנות וצורות: GTFS של משרד התחבורה והבטיחות בדרכים.
- מפה והוראות נהיגה: © OpenStreetMap contributors (ODbL).
- ניתוב: [OSRM](https://project-osrm.org/).
