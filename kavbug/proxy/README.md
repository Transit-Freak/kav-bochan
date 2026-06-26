# קו באג — Cloudflare Worker proxy ל-AI

Proxy קטן שמחזיק את מפתח ה-API של Anthropic בצד-שרת, כדי שניתוח ה-AI ("🤖 ניתוח AI")
יעבוד גם באתר החי ב-GitHub Pages — בלי לחשוף את המפתח ב-HTML הציבורי.

## איך זה עובד
- הדפדפן שולח `POST { "prompt": "..." }` ל-Worker.
- ה-Worker פונה ל-Anthropic Messages API (מודל `claude-opus-4-8`) עם המפתח הסודי.
- מחזיר `{ "completion": "..." }` — בדיוק הפורמט ש-`components.jsx` (`aiComplete`) מצפה לו
  (`j.completion || j.text || j.content`).
- CORS פתוח (ניתן להגביל לדומיין שלכם), כך שהקריאה מ-`it-freak.github.io` עובדת.

## פריסה (חד-פעמי)

דרושים: חשבון Cloudflare (חינמי) ו-Node.js.

```bash
cd proxy

# 1. התחברות ל-Cloudflare
npx wrangler login

# 2. הגדרת המפתח הסודי (לא נכנס לקוד / ל-git)
npx wrangler secret put ANTHROPIC_API_KEY
#   הדביקו את מפתח ה-API שלכם מ-https://console.anthropic.com/

# 3. (אופציונלי) סוד שיתופי שמגן על ה-proxy מפני שימוש לרעה.
#    אם תגדירו אותו, צריך גם להגדיר window.KAVBUG_AI_KEY ב-index.html.
# npx wrangler secret put PROXY_SHARED_SECRET

# 4. פריסה
npx wrangler deploy
```

בסיום תקבלו כתובת כמו:
`https://kavbug-ai.<your-subdomain>.workers.dev`

## חיבור לאתר

ב-`index.html`, **לפני** טעינת `app.jsx`, בטלו את ההערה והכניסו את הכתובת שקיבלתם
(עם הנתיב `/api/claude`):

```html
<script>
  window.KAVBUG_AI_ENDPOINT = "https://kavbug-ai.<your-subdomain>.workers.dev/api/claude";
</script>
```

(אם הגדרתם `PROXY_SHARED_SECRET`, הוסיפו גם
`window.KAVBUG_AI_KEY = "<אותו-סוד>";` — אך שימו לב שזה מופיע ב-HTML הציבורי
ולכן אינו סוד אמיתי; להגנה אמיתית הסתמכו על הגבלת `ALLOWED_ORIGINS` ועל מגבלות
השימוש של Cloudflare.)

לאחר מכן, כל הכרטיסים יציגו "🤖 ניתוח AI" במקום "⚡ אבחון מהיר".

## כוונון
- מודל / `effort` / `max_tokens` — בקובץ `worker.js` (קבועים בראש הקובץ ובגוף הבקשה).
- הגבלת CORS — משתנה `ALLOWED_ORIGINS` ב-`wrangler.toml`.

## הערות אבטחה
- מפתח ה-API נשאר **רק** כ-secret ב-Cloudflare — לעולם לא ב-git ולא ב-HTML.
- ה-endpoint ציבורי מעצם טבעו (אתר סטטי). מומלץ:
  - להגביל `ALLOWED_ORIGINS` לדומיין שלכם.
  - לשקול הגדרת `PROXY_SHARED_SECRET` ו/או Rate Limiting ב-Cloudflare כדי לצמצם
    שימוש לרעה.
