export interface Trip {
  id: number;
  lineNum: string;
  direction: string;
  origin: string;
  dest: string;
  time: string;
  timeMins: number | null;
  period: string;
  days: string;
  daysList: string[];
  district: string;
  lineType: string;
  ridership: number;
  peakLoad: number;
  efficiency: number;
  // שדות חדשים
  usedMetric?: string;      // המדד שנבחר לחישוב (למשל "ridership" או "load")
  metricVal?: number;       // הערך המספרי של המדד
  isNightLine?: boolean;    // האם מדובר בקו לילה
}

export interface RedundantLine {
  lineNum: string;
  avg: string;
  count: number;
  score: number;
  origin: string;
  dest: string;
  district: string;
  status: string;
  percentLow: number;
  avgPeak: number;
  // שדות חדשים (אם רלוונטי גם ברמת הקו)
  isNightLine?: boolean;
}

export interface MergeOptimization {
  type: "merge";
  categoryLabel: string;
  line: string;
  origin: string;
  dest: string;
  direction: string;
  from: string;
  to: string;
  timeMins: number;
  suggestedTime: string;
  days: string;
  gap: number;
  total: number;
  riders1: number;
  riders2: number;
  // שדות חדשים
  usedMetric?: string;
  metricVal?: number;
}

export interface CancelOptimization {
  type: "cancel";
  isTrash: boolean;
  categoryLabel: string;
  line: string;
  origin: string;
  dest: string;
  direction: string;
  time: string;
  timeMins: number;
  days: string;
  ridership: number;
  efficiency: number;
  // שדות חדשים
  usedMetric?: string;
  metricVal?: number;
  isNightLine?: boolean;
}

export interface OkOptimization {
  type: "ok";
  categoryLabel: string;
  line: string;
  origin: string;
  dest: string;
  direction: string;
  time: string;
  timeMins: number;
  days: string;
  ridership: number;
  efficiency: number;
  // שדות חדשים
  usedMetric?: string;
  metricVal?: number;
  isNightLine?: boolean;
}

export type Optimization = MergeOptimization | CancelOptimization | OkOptimization;

export type TabType = "redundant" | "allTrips" | "simulator" | "about" | "overlap";

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  key: keyof Trip | null;
  direction: SortDirection;
}