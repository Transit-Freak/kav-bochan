# קו פח 🗑️ – מאתרים קווים ריקים

מערכת לניתוח קווי אוטובוס, איתור חוסר יעילות וייעול לוחות זמנים.

## התקנה מהירה

```bash
npm install
cp .env.local.example .env.local
# ערוך את .env.local והוסף את הקישור ל-Google Sheets שלך
npm run dev
```

פתח את [http://localhost:3000](http://localhost:3000).

---

## הגדרת Google Sheets

### שלב 1 – הפוך את הגיליון לציבורי
בגיליון שלך: **File → Share → Share with others → Anyone with the link → Viewer**

### שלב 2 – הגדר את משתני הסביבה
פתח `.env.local` והוסף:

```env
GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit#gid=0
NEXT_PUBLIC_GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit#gid=0
```

### שלב 3 (אלטרנטיבה) – הזנה ידנית ב-UI
אם לא הגדרת משתנה סביבה, תוכל להדביק את הקישור ישירות בשדה שמופיע במסך הבית.

---

## מבנה הפרויקט

```
kav-pach/
├── app/
│   ├── layout.tsx          # Root layout (HTML, RTL, Heebo font)
│   ├── page.tsx            # דף הבית
│   ├── globals.css         # Tailwind + animations
│   └── api/sheets/
│       └── route.ts        # Proxy API עבור Google Sheets (עוקף CORS)
├── components/
│   ├── KavPach.tsx         # הקומפוננטה הראשית עם כל הלוגיקה
│   └── Icons.tsx           # SVG icons
├── lib/
│   ├── types.ts            # TypeScript interfaces
│   ├── helpers.ts          # פונקציות עזר (זמן, ימים, URLs)
│   └── parser.ts           # פרסור שורות Excel / CSV
├── .env.local.example      # תבנית משתני סביבה
└── README.md
```

---

## פריסה ב-Vercel (מומלץ)

```bash
npm i -g vercel
vercel
```

בממשק Vercel → Project Settings → Environment Variables, הוסף:
- `GOOGLE_SHEETS_URL` = הקישור לגיליון שלך
- `NEXT_PUBLIC_GOOGLE_SHEETS_URL` = אותו קישור

---

## סביבות פריסה אחרות

```bash
npm run build
npm start
```

---

## עמודות Excel / Google Sheets נדרשות

המערכת מזהה אוטומטית את העמודות לפי שמות בעברית:

| עמודה | שמות שנתמכים |
|-------|-------------|
| מספר קו | "מספר קו", "קו" |
| כיוון | "כיוון" |
| יישוב מוצא | "יישוב מוצא", "מוצא" |
| יישוב יעד | "יישוב יעד", "יעד" |
| שעה | "שעת רישוי", "שעה" |
| ימים | "ימי פעילות", "ימים" |
| נוסעים | "ממוצע תיקופים", "תיקופים", "נוסעים" |
| עומס שיא | "אומדן ממשיכים", "עומס שיא" |
| מחוז | "מחוז" |
| סוג קו | "סוג קו", "אופי שירות", "סוג שירות" |
# kav-pach
