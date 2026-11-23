# קו פח והקו המוזהב — הקוד

- הקוד של קו פח, של הקו המוזהב ושל `ChoiceScreen` (דף הבית בתוך האפליקציה) נמצא ב-`kavpach/src/`, מחולק לפי נושא
  (עד 11.2026 היה קובץ אחד, `KavPach.jsx` בשורש). החלקים מחוברים לפי הסדר ב-`src/files.json` ומקומפלים יחד כמו קובץ אחד,
  ולכן כל השמות משותפים ביניהם, והסדר ב-`files.json` הוא סדר ההרצה — הגדרות `const` ברמה העליונה צריכות להופיע לפני
  מה שמשתמש בהן בזמן הטעינה. חלק חדש — להוסיף ל-`files.json` במקום הנכון.
- האתר טוען את `KavPach.js` הבנוי (`tools/build_kavpach.mjs`, רץ ב-workflow של kavpach-build ב-main). רק אם הוא חסר,
  `index.html` מוריד את `src/files.json` ואת החלקים ומקמפל בדפדפן.
- מי שקורא את הקוד מחבר את החלקים לפי `files.json`: `tools/build_kavpach.mjs` (גם רשימת הקבצים של Tailwind),
  `tests/kavpach/app.mjs`, `tools/build_line_hub.mjs`, והגיבוי ב-`index.html`.
- `index.html` ו-`og-image.png` בתיקייה הזו הם דף ההפניה לכרטיס השיתוף של קו פח — לא קשורים לקוד.

| קובץ ב-`src/` | מה יש בו |
|---|---|
| `01-core.jsx` | ניקוד החפיפות (`kavPachOverlapScore`), ה-hooks של React, הלשוניות והקישורים (`KP_TABS`, `GOLD_TABS`, `tabHref`, `syncTabHash`), `loadXLSX`, `yieldFrame` |
| `02-inputs.jsx` | `CitiesDatalist`, `SearchInput` |
| `03-cache-icons.jsx` | המטמון ב-IndexedDB (`idbGetCache`, `idbSetCache`, `fileKeyFromHeaders`), הסמלים (`ICONS`, `Ic`) |
| `04-helpers-settings.jsx` | עזרי זמן (`fmtTime`, `timeToMins`, `getPeriod`), `getLineCategory`, `useStoredSettings`, `NumField`, ברירות המחדל (`GOLD_DEFAULTS`, `PACH_DEFAULTS`, `DEADHEAD_DEFAULTS`) |
| `05-shared-ui.jsx` | `ScoreSettingsPanel`, `getCapacity`, `parseDays`, `fmtShekels`, `RouteFormat`, נוסעים לפי רבעון (`RidershipBlock`), `KbToolBar`, `KbToolIcon` |
| `06-home.jsx` | `ChoiceScreen` (ה-HTML עצמו ב-`home/home.js`) |
| `07-golden.jsx` | `GoldenApp` — הקו המוזהב |
| `08-deadhead.jsx` | נסיעות תפעוליות במסווה: `computeDeadheadCounts`, `computeDeadhead` |
| `09-kavpach.jsx` | `KavPach` — האפליקציה הראשית: טעינת הנתונים, קו פח וכל הלשוניות, המעבר בין הכלים |
