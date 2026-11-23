/**
 * Times written the way QLC+ writes them: "10s200ms", "1m05s", "800ms".
 * The same rules as QLC+'s own Function::speedToString and stringToSpeed
 * (engine/src/function.cpp), so a time copied from QLC+ means the same here.
 */

const HOUR = 3_600_000;
const MINUTE = 60_000;
const SECOND = 1000;

/** 10200 → "10s200ms", 65000 → "1m05s", 800 → "800ms", 0 → "0ms". */
export function formatDuration(ms: number): string {
  let rest = Math.max(0, Math.round(ms));
  const h = Math.floor(rest / HOUR);
  rest -= h * HOUR;
  const m = Math.floor(rest / MINUTE);
  rest -= m * MINUTE;
  const s = Math.floor(rest / SECOND);
  rest -= s * SECOND;
  let out = "";
  if (h) out += `${h}h`;
  if (m) out += `${out ? String(m).padStart(2, "0") : m}m`;
  if (s) out += `${out ? String(s).padStart(2, "0") : s}s`;
  if (rest || !out) out += `${out ? String(rest).padStart(3, "0") : rest}ms`;
  return out;
}

/**
 * Read a time someone typed. Takes QLC+'s style ("10s200ms", "1m30s",
 * "10s.20", "500ms") and the everyday ones ("10.2s", "1:30", "2.5"). A bare
 * number with no unit counts as `bare` (seconds unless said otherwise).
 * Returns milliseconds, or null when it can't be read.
 */
export function parseDuration(text: string, bare: "s" | "ms" = "s"): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
  if (!t) return null;
  // Minutes and seconds with a colon: "1:30", "1:30.5", "1:02:03".
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(t)) {
    const parts = t.split(":").map(Number);
    const [a = 0, b = 0, c] = parts;
    return Math.round((c === undefined ? a * 60 + b : a * 3600 + b * 60 + c) * 1000);
  }
  // A plain number: in the field's own unit.
  if (/^\d*\.?\d+$/.test(t)) return Math.round(Number(t) * (bare === "s" ? 1000 : 1));
  // Units, in any order QLC+ allows: h, m, s, ms, each with an optional decimal.
  const re = /(\d*\.?\d+)(ms|h|m|s)/g;
  let total = 0;
  let used = "";
  for (let m: RegExpExecArray | null; (m = re.exec(t)); ) {
    const n = Number(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * SECOND : m[2] === "m" ? n * MINUTE : n * HOUR;
    used += m[0];
  }
  // QLC+'s "10s.20": a decimal straight after the seconds is a fraction of a second.
  const tail = /s(\.\d+)$/.exec(t);
  if (tail && !t.endsWith("ms")) {
    total += Number(tail[1]) * SECOND;
    used += tail[1];
  }
  if (!used || used.length !== t.length) return null;
  return Math.round(total);
}
