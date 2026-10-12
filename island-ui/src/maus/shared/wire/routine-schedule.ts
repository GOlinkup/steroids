// Ported from OpenMausBot (Apache-2.0, github.com/milind-soni/OpenMausBot). Modified for Steroids island.
// NOTE (Steroids island): croner-free reimplementation of
// shared/routine-schedule.ts. The island cannot add the `croner` npm
// dependency, so the 5-field cron evaluator below is self-contained. It keeps
// the trust-boundary contract (normalizeCronSchedule validation + messages,
// nextCronRuns strictly-future instants, DST policy: missing wall times are
// skipped, repeated wall times yield their first occurrence only) and covers
// the full everyday syntax: *, lists, ranges, steps, month/weekday names,
// day-of-month L / L-n, weekday n#m. Exotic croner-only forms (e.g. W, H)
// are rejected as invalid rather than misread.
// ponytail: minute-stepped matcher with field skipping; full-catalog cron
// parsing (croner) if expressions outside the subset above ever need support.

export interface RoutineCronSchedule {
  type: "cron";
  expression: string;
  /** Explicit IANA timezone; independent of the server or viewer's timezone. */
  timeZone: string;
}

const MAX_EXPRESSION_LENGTH = 256;
const MAX_PREVIEW_RUNS = 1000;

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};

function parseNumberList(
  raw: string,
  min: number,
  max: number,
  names?: Record<string, number>,
): Set<number> | null {
  const values = new Set<number>();
  const field = raw.trim().toLowerCase();
  if (field === "*" || field === "?") {
    for (let value = min; value <= max; value += 1) values.add(value);
    return values;
  }
  const parts = field.split(",");
  if (!parts.length) return null;
  for (const part of parts) {
    let range = part;
    let step = 1;
    const slash = part.indexOf("/");
    if (slash >= 0) {
      range = part.slice(0, slash);
      const stepText = part.slice(slash + 1);
      if (!/^\d+$/.test(stepText)) return null;
      step = Number(stepText);
      if (step < 1 || step > max) return null;
    }
    let from: number;
    let to: number;
    if (range === "*" || range === "") {
      from = min;
      to = max;
    } else {
      const dash = range.indexOf("-");
      if (dash >= 0) {
        const first = range.slice(0, dash);
        const last = range.slice(dash + 1);
        from = names?.[first] ?? (Number(first));
        to = names?.[last] ?? (Number(last));
        if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
      } else {
        const single = names?.[range] ?? Number(range);
        if (!Number.isInteger(single)) return null;
        from = single;
        to = range === "*" ? max : single;
      }
    }
    if (from < min || to > max || from > to) return null;
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values.size ? values : null;
}

interface DayOfMonth {
  days: Set<number> | null;
  lastDays: number[];
}

function parseDayOfMonth(raw: string): DayOfMonth | null {
  const field = raw.trim().toLowerCase();
  if (field === "*" || field === "?") return { days: null, lastDays: [] };
  const days = new Set<number>();
  const lastDays: number[] = [];
  for (const part of field.split(",")) {
    const upper = part.toUpperCase();
    const lastOffset = /^L(?:-(\d+))?$/.exec(upper);
    if (lastOffset) {
      const offset = lastOffset[1] === undefined ? 0 : Number(lastOffset[1]);
      if (offset < 0 || offset > 30) return null;
      lastDays.push(offset);
      continue;
    }
    const parsed = parseNumberList(part, 1, 31);
    if (!parsed) return null;
    for (const value of parsed) days.add(value);
  }
  return days.size || lastDays.length ? { days: days.size ? days : null, lastDays } : null;
}

interface DayOfWeek {
  days: Set<number> | null;
  nth: Array<{ weekday: number; occurrence: number }>;
}

function parseDayOfWeek(raw: string): DayOfWeek | null {
  const field = raw.trim().toLowerCase();
  if (field === "*" || field === "?") return { days: null, nth: [] };
  const days = new Set<number>();
  const nth: Array<{ weekday: number; occurrence: number }> = [];
  for (const part of field.split(",")) {
    const hash = /^([a-z0-9]+)#([1-5])$/.exec(part);
    if (hash) {
      const weekday = WEEKDAY_NAMES[hash[1]!] ?? Number(hash[1]);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 7) return null;
      nth.push({ weekday: weekday % 7, occurrence: Number(hash[2]) });
      continue;
    }
    if (part === "l") {
      days.add(6);
      continue;
    }
    const parsed = parseNumberList(part, 0, 7, WEEKDAY_NAMES);
    if (!parsed) return null;
    for (const value of parsed) days.add(value % 7);
  }
  return days.size || nth.length ? { days: days.size ? days : null, nth } : null;
}

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: DayOfMonth;
  month: Set<number>;
  dow: DayOfWeek;
}

function parseFields(expression: string): CronFields | null {
  const [minute, hour, dom, month, dow] = expression.trim().split(/\s+/);
  const parsedMinute = parseNumberList(minute ?? "", 0, 59);
  const parsedHour = parseNumberList(hour ?? "", 0, 23);
  const parsedDom = parseDayOfMonth(dom ?? "");
  const parsedMonth = parseNumberList(month ?? "", 1, 12, MONTH_NAMES);
  const parsedDow = parseDayOfWeek(dow ?? "");
  if (!parsedMinute || !parsedHour || !parsedDom || !parsedMonth || !parsedDow) return null;
  return { minute: parsedMinute, hour: parsedHour, dom: parsedDom, month: parsedMonth, dow: parsedDow };
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", hourCycle: "h23",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

interface WallParts { year: number; month: number; day: number; hour: number; minute: number }

function wallParts(instant: number, timeZone: string): WallParts {
  const parts = zoneFormatter(timeZone).formatToParts(new Date(instant));
  const get = (kind: string): number => {
    const found = parts.find((part) => part.type === kind)?.value;
    const value = Number(found);
    if (!Number.isInteger(value)) throw new Error("The cron schedule produced an invalid date");
    return value;
  };
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** A wall-clock reading back to a UTC instant, or null when the wall time
 * never occurs (a DST gap). Converges through the zone offset twice. */
function wallToUtc(wall: WallParts, timeZone: string): number | null {
  let guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const read = wallParts(guess, timeZone);
    const readAsUtc = Date.UTC(read.year, read.month - 1, read.day, read.hour, read.minute);
    guess += Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - readAsUtc;
  }
  const check = wallParts(guess, timeZone);
  if (check.year !== wall.year || check.month !== wall.month || check.day !== wall.day
    || check.hour !== wall.hour || check.minute !== wall.minute) {
    return null;
  }
  return guess;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function dayMatches(fields: CronFields, year: number, month: number, day: number): boolean {
  const domRestricted = fields.dom.days !== null || fields.dom.lastDays.length > 0;
  const dowRestricted = fields.dow.days !== null || fields.dow.nth.length > 0;
  let domMatch = false;
  if (!domRestricted) domMatch = true;
  else {
    if (fields.dom.days?.has(day)) domMatch = true;
    const lastDay = daysInMonth(year, month);
    if (fields.dom.lastDays.some((offset) => day === lastDay - offset)) domMatch = true;
  }
  let dowMatch = false;
  if (!dowRestricted) dowMatch = true;
  else {
    const weekday = weekdayOf(year, month, day);
    if (fields.dow.days?.has(weekday)) dowMatch = true;
    for (const rule of fields.dow.nth) {
      if (weekday !== rule.weekday) continue;
      const occurrence = Math.ceil(day / 7);
      if (occurrence === rule.occurrence) dowMatch = true;
    }
  }
  if (domRestricted && dowRestricted) return domMatch || dowMatch;
  return domRestricted ? domMatch : dowMatch;
}

function nextInSet(values: Set<number>, current: number): number | null {
  let next: number | null = null;
  for (const value of values) {
    if (value >= current && (next === null || value < next)) next = value;
  }
  return next;
}

function firstInSet(values: Set<number>): number {
  let first = Infinity;
  for (const value of values) first = Math.min(first, value);
  return first;
}

function cronCalculator(value: unknown): { schedule: RoutineCronSchedule; fields: CronFields } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a valid cron schedule");
  const input = value as Partial<RoutineCronSchedule>;
  if (input.type !== "cron" || typeof input.expression !== "string") throw new Error("Choose a valid cron schedule");
  if (Object.keys(input).some(key => !["type", "expression", "timeZone"].includes(key))) {
    throw new Error("Cron schedules accept only type, expression and timeZone; start/end dates and other restrictions are not supported");
  }
  const expression = input.expression.trim().replace(/\s+/g, " ");
  if (expression.length > MAX_EXPRESSION_LENGTH || expression.split(" ").length !== 5 || expression.includes("@")) {
    throw new Error("Cron must have five fields: minute hour day-of-month month weekday (no seconds, year, or macros)");
  }
  const timeZone = typeof input.timeZone === "string" ? input.timeZone.trim() : "";
  // Intl also accepts numeric offsets in newer runtimes. Require a named zone
  // so wall-clock schedules follow its daylight-saving rules instead.
  if (timeZone.length > 128 || !(timeZone === "UTC" || /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/.test(timeZone))) {
    throw new Error("Choose an IANA timezone such as America/New_York, Asia/Kolkata, or UTC");
  }
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(0); }
  catch { throw new Error("Choose a valid IANA timezone such as America/New_York, Asia/Kolkata, or UTC"); }
  const fields = parseFields(expression);
  if (!fields) throw new Error(`Invalid cron expression: ${expression}`);
  return { schedule: { type: "cron", expression, timeZone }, fields };
}

function calculationDate(after: number): number {
  if (!Number.isFinite(after)) throw new Error("Choose a valid cron preview date");
  return after;
}

function nextRunAfter(fields: CronFields, timeZone: string, after: number, lastWallKey: string | null): { at: number; wallKey: string } | null {
  const start = wallParts(after + 60_000, timeZone);
  let year = start.year;
  let month = start.month;
  let day = start.day;
  let hour = start.hour;
  let minute = start.minute;
  // Field-skipping search: each step jumps to the next admissible value of
  // the smallest failing field. Bounded well past any satisfiable schedule
  // (impossible dates such as Feb 30 exhaust the bound and report no runs).
  for (let guard = 0; guard < 200_000; guard += 1) {
    const nextMonth = nextInSet(fields.month, month);
    if (nextMonth === null) {
      year += 1;
      month = firstInSet(fields.month);
      day = 1;
      hour = 0;
      minute = 0;
      continue;
    }
    if (nextMonth !== month) {
      month = nextMonth;
      day = 1;
      hour = 0;
      minute = 0;
    }
    if (!dayMatches(fields, year, month, day)) {
      day += 1;
      hour = 0;
      minute = 0;
      if (day > daysInMonth(year, month)) {
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      continue;
    }
    const nextHour = nextInSet(fields.hour, hour);
    if (nextHour === null) {
      day += 1;
      hour = 0;
      minute = 0;
      if (day > daysInMonth(year, month)) {
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      continue;
    }
    if (nextHour !== hour) {
      hour = nextHour;
      minute = 0;
    }
    const nextMinute = nextInSet(fields.minute, minute);
    if (nextMinute === null) {
      hour += 1;
      minute = 0;
      if (hour > 23) {
        hour = 0;
        day += 1;
        if (day > daysInMonth(year, month)) {
          day = 1;
          month += 1;
          if (month > 12) {
            month = 1;
            year += 1;
          }
        }
      }
      continue;
    }
    minute = nextMinute;
    const wallKey = `${year}-${month}-${day} ${hour}:${minute}`;
    const at = wallToUtc({ year, month, day, hour, minute }, timeZone);
    if (at === null || at <= after || wallKey === lastWallKey) {
      // A DST gap (no such wall time), a fold-back instant at/below the
      // cursor, or the repeated hour's second occurrence: step one wall
      // minute past the candidate and keep searching. Wall-clock stepping
      // (not UTC stepping) is what keeps this monotonic.
      minute += 1;
      if (minute > 59) {
        minute = 0;
        hour += 1;
        if (hour > 23) {
          hour = 0;
          day += 1;
          if (day > daysInMonth(year, month)) {
            day = 1;
            month += 1;
            if (month > 12) {
              month = 1;
              year += 1;
            }
          }
        }
      }
      continue;
    }
    return { at, wallKey };
  }
  return null;
}

/** Normalize once at the trust boundary, rejecting impossible schedules. */
export function normalizeCronSchedule(value: unknown, after = Date.now()): RoutineCronSchedule {
  const { schedule, fields } = cronCalculator(value);
  if (!futureRuns(fields, schedule.timeZone, after, 1).length) throw new Error("This cron expression has no future runs. Choose dates that exist.");
  return schedule;
}

/** Strictly-future instants, shared by the scheduler, cards and calendar.
 * DST policy mirrors croner's: missing clock times advance through the gap,
 * and repeated clock times use their first occurrence only. */
export function nextCronRuns(schedule: RoutineCronSchedule, after: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PREVIEW_RUNS) throw new Error("Choose between 1 and 1000 cron preview runs");
  const { fields } = cronCalculator(schedule);
  return futureRuns(fields, schedule.timeZone, after, count);
}

function futureRuns(fields: CronFields, timeZone: string, after: number, count: number): number[] {
  const from = calculationDate(after);
  const runs: number[] = [];
  let cursor = from;
  let lastWallKey: string | null = null;
  while (runs.length < count) {
    const next = nextRunAfter(fields, timeZone, cursor, lastWallKey);
    if (!next) break;
    runs.push(next.at);
    cursor = next.at;
    lastWallKey = next.wallKey;
  }
  return runs;
}
