import { NextRequest, NextResponse } from "next/server";
import { toCSVExportUrl } from "@/lib/helpers";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawUrl =
    searchParams.get("url") || process.env.GOOGLE_SHEETS_URL || "";

  if (!rawUrl) {
    return NextResponse.json(
      { error: "לא הוגדר קישור Google Sheets. הגדר GOOGLE_SHEETS_URL בקובץ .env.local או שלח url בפרמטר." },
      { status: 400 }
    );
  }

  let csvUrl: string;
  try {
    csvUrl = toCSVExportUrl(rawUrl);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "קישור לא תקין" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(csvUrl, {
      headers: {
        // Avoid Google's "Login required" redirect for private sheets
        Accept: "text/csv,text/plain,*/*",
      },
      redirect: "follow",
      // 10 second timeout
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Check if Google redirected to login (HTML response)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        return NextResponse.json(
          {
            error:
              "הגיליון אינו ציבורי. ודא שה-Google Sheet שלך שיתוף הוגדר ל'כל מי שיש לו את הקישור יכול לצפות'.",
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `שגיאה בטעינת הגיליון: ${res.status} ${res.statusText}` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return NextResponse.json(
        {
          error:
            "הגיליון אינו ציבורי. ודא שה-Google Sheet שלך שיתוף הוגדר ל'כל מי שיש לו את הקישור יכול לצפות'.",
        },
        { status: 403 }
      );
    }

    const csvText = await res.text();

    return new NextResponse(csvText, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[sheets] fetch error:", err);
    return NextResponse.json(
      {
        error:
          "לא ניתן להתחבר ל-Google Sheets. בדוק את הקישור ואת חיבור האינטרנט.",
      },
      { status: 500 }
    );
  }
}
