import type { Trip } from "./types";
import { fmtTime, timeToMins, getPeriod, parseDays } from "./helpers";

type RawRow = Record<string, unknown>;

const col = (headers: string[], ...kws: string[]): string | undefined =>
  headers.find((h) => kws.some((k) => String(h).includes(k)));

export const parseRows = (rows: RawRow[]): Trip[] => {
  if (!rows || rows.length === 0) return [];
  const headers = Object.keys(rows[0]);

  const C = {
    line: col(headers, "מספר קו", "קו"),
    direction: col(headers, "כיוון"),
    origin: col(headers, "יישוב מוצא", "מוצא"),
    dest: col(headers, "יישוב יעד", "יעד"),
    time: col(headers, "שעת רישוי", "שעה"),
    days: col(headers, "ימי פעילות", "ימים"),
    ridership: col(headers, "ממוצע תיקופים", "תיקופים", "נוסעים"),
    peak: col(headers, "אומדן ממשיכים", "עומס שיא"),
    district: col(headers, "מחוז"),
    lineType: col(headers, "סוג קו", "אופי שירות", "סוג שירות"),
  };

  return rows
    .map((row, i): Trip | null => {
      const ride = parseFloat(
        String(row[C.ridership ?? ""] ?? "0").replace(/,/g, "")
      );
      const peak = parseFloat(
        String(row[C.peak ?? ""] ?? "0").replace(/,/g, "")
      );
      const timeStr = fmtTime(row[C.time ?? ""]);
      const mins = timeToMins(timeStr);
      const daysInfo = parseDays(row[C.days ?? ""]);

      const maxRidership = Math.max(
        isNaN(ride) ? 0 : ride,
        isNaN(peak) ? 0 : peak
      );
      const eff = Number((maxRidership / 50).toFixed(2));

      return {
        id: i,
        lineNum: String(row[C.line ?? ""] ?? "").trim(),
        direction: String(row[C.direction ?? ""] ?? "").trim(),
        origin: String(row[C.origin ?? ""] ?? "לא ידוע").trim(),
        dest: String(row[C.dest ?? ""] ?? "לא ידוע").trim(),
        time: timeStr,
        timeMins: mins,
        period: getPeriod(mins),
        days: daysInfo.text,
        daysList: daysInfo.list,
        district: String(row[C.district ?? ""] ?? "כללי").trim(),
        lineType: String(row[C.lineType ?? ""] ?? "עירוני").trim(),
        ridership: isNaN(ride) ? 0 : Number(ride.toFixed(2)),
        peakLoad: isNaN(peak) ? 0 : Number(peak.toFixed(2)),
        efficiency: eff,
      };
    })
    .filter(
      (t): t is Trip =>
        t !== null && t.lineNum !== "" && t.lineNum !== "undefined" && t.timeMins !== null
    );
};
