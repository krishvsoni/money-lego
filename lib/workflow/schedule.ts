// When a schedule trigger fires next. Pure and shared, so the editor can preview the next
// run and the scheduler computes the same instant. Weekly times are wall-clock times in the
// chosen IANA timezone, so a Friday 15:00 run stays at 15:00 across daylight saving changes.

export function isTimeZone(value: string): boolean {
  if (!value || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Converts a wall-clock time in a zone to UTC. The second pass corrects for an offset
// change between the guess and the answer (the day daylight saving starts or ends).
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const guess = Date.UTC(y, m, d, hh, mm);
  const first = guess - zoneOffsetMs(guess, timeZone);
  return new Date(guess - zoneOffsetMs(first, timeZone));
}

function localDate(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(utcMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: Number(get("year")), m: Number(get("month")) - 1, d: Number(get("day")), weekday };
}

export interface ScheduleConfig {
  mode?: unknown;
  intervalMinutes?: unknown;
  weekday?: unknown;
  time?: unknown;
  timezone?: unknown;
}

// A stable fingerprint of the timing fields; a saved workflow keeps its next slot unless
// this changes.
export function scheduleKey(config: ScheduleConfig): string {
  return config.mode === "weekly" ? `weekly:${config.weekday}:${config.time}:${config.timezone}` : `interval:${Number(config.intervalMinutes) || 60}`;
}

export function nextRunAt(config: ScheduleConfig, after: Date): Date | null {
  if (config.mode !== "weekly") {
    const minutes = Math.max(5, Number(config.intervalMinutes) || 60);
    return new Date(after.getTime() + minutes * 60_000);
  }
  const timeZone = String(config.timezone ?? "");
  const weekday = Number(config.weekday);
  const match = String(config.time ?? "").match(/^(\d{2}):(\d{2})$/);
  if (!isTimeZone(timeZone) || !match || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  const [hh, mm] = [Number(match[1]), Number(match[2])];
  for (let i = 0; i <= 8; i++) {
    const day = localDate(after.getTime() + i * 86_400_000, timeZone);
    if (day.weekday !== weekday) continue;
    const at = zonedToUtc(day.y, day.m, day.d, hh, mm, timeZone);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
}
