import type { Metadata } from "next";
import "./globals.css";
import { Assistant, Heebo, Outfit, Varela_Round } from 'next/font/google';


const assistant = Assistant({ subsets: ['hebrew'], weight: ['300', '400', '500'] });

const heebo = Heebo({ 
  subsets: ['hebrew'], 
  weight: ['300', '400', '700'] 
});

const varela = Varela_Round({ 
  subsets: ['hebrew'], 
  weight: ['400'] // שים לב: בדר"כ מגיע במשקל אחד
});

export const metadata: Metadata = {
  title: "קו פח – מאתרים קווים ריקים",
  description: "מערכת לניתוח קווי אוטובוס ויעול לוחות זמנים",
  
  // הגדרות בסיסיות נוספות
  keywords: ["תחבורה ציבורית", "אוטובוסים", "ייעול לוחות זמנים", "קו פח"],
  authors: [{ name: "צוות קו פח" }],

  // הגדרת האייקון שמופיע בלשונית (Favicon)
  icons: {
    icon: "/favicon.ico", // וודא שהקובץ נמצא בתיקיית public
    apple: "/apple-touch-icon.png", // אופציונלי לאייפון
  },

  // איך הקישור יראה כשמשתפים אותו (WhatsApp, Facebook, LinkedIn)
  openGraph: {
    
    title: "קו פח – מאתרים קווים ריקים",
    description: "המערכת המובילה לניתוח נתוני תחבורה ציבורית בזמן אמת",
    url: "https://www.kav-pach.co.il", // הכתובת של האתר שלך
    siteName: "קו פח",
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: "/og-image.png", // תמונה בגודל 1200x630 בתיקיית public
        width: 1200,
        height: 630,
        alt: "תצוגה מקדימה של מערכת קו פח",
      },
    ],
  },

  // התאמה ספציפית ל-Twitter/X
  twitter: {
    card: "summary_large_image",
    title: "קו פח – מאתרים קווים ריקים",
    description: "מערכת לניתוח קווי אוטובוס ויעול לוחות זמנים",
    images: ["/og-image.png"],
  },
};

// הגדרת צבע סרגל הכתובות בדפדפנים בנייד (Chrome Android / Safari)
export const viewport = {
  themeColor: "#F8FAFC", 
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`bg-[#F8FAFC] text-slate-900 antialiased ${assistant.className}`}
      >
        {children}
      </body>
    </html>
  );
}
