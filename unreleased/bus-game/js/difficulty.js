// רמות הקושי — כל המספרים במקום אחד, כדי שקל לכוון.
// creative — יצירתי (בלי שלבים, כסף בלי הגבלה); easy / medium / hard — קריירה עם שלבים (career.js) ברמות שונות.
// medium הוא בדיוק המשחק שהיה ("קריירה"). שמירות ישנות: career → medium, creative → creative.
// simple — רמה "קל": רק הבסיס. מוסתרים סדרן, ביקוש, פקחים, מבקרים ודוחות, אירועים, שביעות רצון, ליסינג,
// דמי תחנה וההגדרות; בטופס הקו — שם, צבע ושעות תחת "מתקדם". audits: false — אין מבקרים סמויים. lease: false — רק קנייה.
// קשה נבדק בסימולציה (שחקן סביר משלים את כל השלבים בזמן ומרוויח). כדי שלא ייכנס לסחרור: התקלות ×1.5 ולא יותר,
// קיצוץ על מועד שעבר לא יורד מתחת ל-missFloor (75%), והסבסוד חוזר למלא כשהשלב מושלם (restore). בלי missFloor — עד 50%.
export const MODES = {
  creative: {
    label: 'יצירתי', desc: 'כסף בלי הגבלה, כל סוגי הרכבים, בלי משימות ובלי כישלון.',
    stages: false, money: 10_000_000, subsidy: 1, price: 1, stopFee: 0, simple: false, audits: true, lease: true,
    breakK: 1, jamK: 1, lateK: 1, evade: 0.06, inspectors: true, fineBelow: null, bonusFrom: null,
    deadlineK: 1, missCut: 0, target: 0, headway: 20, toggles: true,
  },
  easy: {
    label: 'קל', desc: 'רק הבסיס: קווים, רכבים ומשימות. ₪150,000 בקופה, רכבים זולים, בלי תקלות ובלי קנסות.',
    stages: true, money: 150_000, subsidy: 1.5, price: 0.7, stopFee: 0, simple: true, audits: false, lease: false,
    breakK: 0, jamK: 0, lateK: 0, evade: 0, inspectors: false, fineBelow: null, bonusFrom: null,
    deadlineK: 2, missCut: 0, target: -0.10, headway: null, toggles: false,
  },
  medium: {
    label: 'בינוני', desc: '₪60,000 בקופה, הכלכלה הרגילה, תקלות ופקחים, ומשימות בשלבים.',
    stages: true, money: 60_000, subsidy: 1, price: 1, stopFee: 500, simple: false, audits: true, lease: true,
    breakK: 1, jamK: 1, lateK: 1, evade: 0.06, inspectors: true, fineBelow: 60, bonusFrom: 85,
    deadlineK: 1, missCut: 0.2, target: 0, headway: 20, toggles: false,
  },
  hard: {
    label: 'קשה', desc: '₪40,000 בלבד, רכבים יקרים, סבסוד נמוך, יותר תקלות, ביקורת קפדנית ומועדים קצרים.',
    stages: true, money: 40_000, subsidy: 0.75, price: 1.2, stopFee: 800, simple: false, audits: true, lease: true,
    breakK: 1.5, jamK: 1.5, lateK: 1.5, evade: 0.10, inspectors: true, fineBelow: 70, bonusFrom: 85,
    deadlineK: 0.75, missCut: 0.25, missFloor: 0.75, restore: true, rewardK: 0.3, target: 0.05, headway: 15, toggles: false,
  },
};
// פרס של שלב לפי הרמה (rewardK; בלי — הפרס המלא). בקשה הפרסים קטנים, כדי שהכסף יגביל גם בימים הראשונים
export const rewardOf = (S, M) => Math.round(S.reward * (M?.rewardK ?? 1) / 500) * 500;
export const MODE_ORDER = ['easy', 'medium', 'hard', 'creative'];
export const normMode = m => (m === 'career' || !MODES[m]) ? 'medium' : m;
export const modeOf = bank => MODES[normMode(bank?.mode)];
