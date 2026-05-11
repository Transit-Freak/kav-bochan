export const fmtTime = (v: unknown): string => {
  if (!v) return "--:--";
  if (typeof v === "string" && v.includes(":")) return v.slice(0, 5);
  const n = parseFloat(String(v));
  if (!isNaN(n) && n >= 0 && n <= 1) {
    const t = Math.round(n * 86400);
    return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(
      Math.floor((t % 3600) / 60)
    ).padStart(2, "0")}`;
  }
  return String(v);
};

export const timeToMins = (t: string): number | null => {
  if (!t || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

export const getPeriod = (mins: number | null): string => {
  if (mins === null) return "לא ידוע";
  if (mins < 360) return "לילה";
  if (mins < 600) return "בוקר";
  if (mins < 960) return "צהריים";
  if (mins < 1140) return "ערב";
  return "לילה";
};

export const getLineCategory = (
  typeStr: string
): "urban" | "regional" | "intercity" => {
  if (!typeStr) return "urban";
  const t = typeStr.replace(/\s/g, "");
  if (t.includes("אזורי") || t.includes("מועצה")) return "regional";
  if (t.includes("בין") || t.includes("בינעירוני")) return "intercity";
  return "urban";
};

export interface DaysInfo {
  list: string[];
  text: string;
}

export const parseDays = (raw: unknown): DaysInfo => {
  if (!raw || String(raw).trim() === "undefined")
    return { list: [], text: "כללי" };
  const s = String(raw).trim();
  const matches = s.match(/[1-7]/g);
  const list = matches ? Array.from(new Set(matches)).sort() : [];
  let text = s;

  if (list.length > 0) {
    const joined = list.join("");
    if (joined === "12345") text = "א'-ה'";
    else if (joined === "123456") text = "א'-ו'";
    else {
      const names: Record<string, string> = {
        "1": "ראשון",
        "2": "שני",
        "3": "שלישי",
        "4": "רביעי",
        "5": "חמישי",
        "6": "שישי",
        "7": "שבת",
      };
      text = list.map((d) => names[d]).join(", ");
    }
  }
  return { list, text };
};

/** Convert any Google Sheets URL to a public CSV export URL */
export const toCSVExportUrl = (url: string): string => {
  const trimmed = url.trim();

  // Already a CSV export link
  if (trimmed.includes("export?format=csv") || trimmed.includes("output=csv")) {
    return trimmed;
  }

  // Extract spreadsheet ID
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error("לא ניתן לזהות קישור Google Sheets תקין");

  const sheetId = match[1];

  // Extract gid if present
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
};
