# מסלול לפי שנים (2013–2017)

קובץ "מסלול לפי שנים.csv" ששלמה העלה ב-18.11.2026, מפוצל לקובץ דחוס לכל שנה (הקובץ המקורי 452MB, מעל המגבלה של GitHub).
התוכן זהה לקובץ המקורי שורה בשורה, רק מחולק לפי העמודה `year1`. קידוד UTF-8 עם BOM.

שורה לכל תחנה במסלול של מק"ט בשנה.

| קובץ | שורות | מק"טים |
|---|---|---|
| `routes-by-year-2013.csv.gz` | 188,767 | 5,704 |
| `routes-by-year-2014.csv.gz` | 869,087 | 24,914 |
| `routes-by-year-2015.csv.gz` | 673,948 | 19,458 |
| `routes-by-year-2016.csv.gz` | 911,525 | 26,407 |
| `routes-by-year-2017.csv.gz` | 775,448 | 22,473 |

## עמודות

`year1, makat, freq, StationId, StationOrder, StationName, Lat, Long, yishuv_nm, yishuv_cd, station_status_nm, station_status_cd, StationVersion, max_date`

- `makat` בנוי מארבעה חלקים: מק"ט_כיוון_חלופה_גרסה (למשל `10003_1_ת_253807`).
- ב-73 שורות חסרים שם התחנה, הקואורדינטות והיישוב.
- המשמעות המדויקת של `freq` ושל `max_date` לא נבדקה.
