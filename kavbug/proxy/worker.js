/* ===========================================================================
   קו באג — Cloudflare Worker proxy ל-Anthropic (Claude)
   מקבל POST { prompt } מהדפדפן, פונה ל-Messages API עם מפתח השרת (סוד),
   ומחזיר { completion } — בדיוק הפורמט ש-components.jsx (aiComplete) מצפה לו.
   המפתח לעולם לא נחשף ב-HTML הציבורי; הוא יושב כ-secret בלבד ב-Cloudflare.
   =========================================================================== */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-8";

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    // preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "method-not-allowed" }, 405, cors);
    }

    // אימות סוד אופציונלי: אם הוגדר PROXY_SHARED_SECRET, דורשים Authorization: Bearer
    // (תואם ל-window.KAVBUG_AI_KEY בצד הלקוח). באתר ציבורי לרוב נשאר כבוי.
    if (env.PROXY_SHARED_SECRET) {
      const auth = request.headers.get("Authorization") || "";
      if (auth !== "Bearer " + env.PROXY_SHARED_SECRET) {
        return json({ error: "unauthorized" }, 401, cors);
      }
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "server-misconfigured: missing ANTHROPIC_API_KEY" }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid-json" }, 400, cors);
    }
    const prompt = body && body.prompt;
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "missing 'prompt' (string)" }, 400, cors);
    }

    let apiResp;
    try {
      apiResp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          // חשיבה אדפטיבית — המודל מחליט כמה לחשוב; effort בינוני לאיזון עלות/דיוק.
          // הניתוח מחזיר JSON קצר ({verdict, reason}); אפשר לכוונן effort כאן בלבד.
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (e) {
      return json({ error: "upstream-fetch-failed", detail: String(e) }, 502, cors);
    }

    if (!apiResp.ok) {
      const detail = (await apiResp.text()).slice(0, 800);
      return json({ error: "anthropic-" + apiResp.status, detail }, 502, cors);
    }

    const data = await apiResp.json();
    // מאחדים את כל בלוקי הטקסט (מתעלמים מבלוקי thinking) לכדי completion יחיד.
    const completion = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return json({ completion }, 200, cors);
  },
};

// CORS: ברירת מחדל "*"; אפשר להגביל לרשימת מקורות דרך env.ALLOWED_ORIGINS
// (מופרד בפסיקים, למשל "https://it-freak.github.io").
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allow = (env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let acao = "*";
  if (!(allow.length === 1 && allow[0] === "*")) {
    acao = allow.includes(origin) ? origin : allow[0] || "*";
  }
  return {
    "Access-Control-Allow-Origin": acao,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
