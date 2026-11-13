// רמות הקושי — כל המספרים במקום אחד, כדי שקל לכוון.
// creative — יצירתי (בלי שלבים, כסף בלי הגבלה); easy / medium — קריירה עם שלבים (career.js) ברמות שונות.
// medium הוא בדיוק המשחק שהיה ("קריירה"). שמירות ישנות: career → medium, creative → creative.
// simple — רמה "קל": רק הבסיס. מוסתרים סדרן, ביקוש, פקחים, מבקרים ודוחות, אירועים, שביעות רצון, ליסינג,
// דמי תחנה וההגדרות; בטופס הקו — שם, צבע ושעות תחת "מתקדם". audits: false — אין מבקרים סמויים. lease: false — רק קנייה.
// הייתה גם רמה "קשה" — הוסרה (שלמה 10.11.2026). שמירות שלה נטענות כבינוני (normMode, ובטעינה — הודעה פעם אחת).
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
};
export const MODE_ORDER = ['easy', 'medium', 'creative'];
export const normMode = m => (m === 'career' || m === 'hard' || !MODES[m]) ? 'medium' : m;
export const HARD_GONE = 'רמת קשה הוסרה — המשחק ממשיך ברמה בינונית';
export const modeOf = bank => MODES[normMode(bank?.mode)];
