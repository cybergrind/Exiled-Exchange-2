// Text for exchange rates, written the way the in-game Currency Exchange
// writes them: a rate below one is "1/N" (one item buys N... per unit).

type Unit = "" | "k";

function round(value: number, unit?: Unit): string {
  const abs = Math.abs(value);
  if (unit === "k" || (unit === undefined && abs >= 10_000)) {
    return `${Number((value / 1000).toFixed(1))}k`;
  }
  if (abs < 10) return String(Number(value.toFixed(1)));
  return String(Math.round(value));
}

/** The number a rate prints: the rate itself, or N of "1/N". */
function shown(value: number): number {
  return value > 0 && value < 1 ? 1 / value : value;
}

/** 4.908 -> "4.9", 0.1561 -> "1/6.4", 0.01894 -> "1/53". */
export function formatRate(value: number, unit?: Unit): string {
  if (!Number.isFinite(value)) return "?";
  if (value > 0 && value < 1) {
    const inverse = round(1 / value, unit);
    return inverse === "1" ? "1" : `1/${inverse}`;
  }
  return round(value, unit);
}

/** Both ends in one unit, so "1/16.4k – 1/6k" rather than "1/16.4k – 1/6002". */
export function formatRange(low: number, high: number): string {
  const unit: Unit = Math.max(shown(low), shown(high)) >= 10_000 ? "k" : "";
  const a = formatRate(low, unit);
  const b = formatRate(high, unit);
  return a === b ? a : `${a} – ${b}`;
}

const COUNT_UNITS = [
  { size: 1e9, suffix: "B" },
  { size: 1e6, suffix: "M" },
  { size: 1e3, suffix: "k" },
];

/** 58 -> "58", 440747 -> "441k", 7502377 -> "7.5M": three significant digits. */
export function formatCount(count: number): string {
  if (Math.round(count) < 1000) return String(Math.round(count));
  for (let i = COUNT_UNITS.length - 1; i >= 0; i--) {
    const { size, suffix } = COUNT_UNITS[i];
    const scaled = count / size;
    const text = Number(scaled < 100 ? scaled.toFixed(1) : scaled.toFixed(0));
    // 999.6k rounds to "1000k": let the next unit print it.
    if (text >= 1000 && i > 0) continue;
    return `${text}${suffix}`;
  }
  return String(Math.round(count));
}

/**
 * How old the newest hour is. An hour's record is complete at its end, so
 * age counts from `asOfHour + 1h`.
 */
export function formatAge(asOfHour: number, nowMs: number): string {
  const minutes = Math.max(
    0,
    Math.floor((nowMs / 1000 - asOfHour - 3600) / 60),
  );
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
