export type ScheduleRuleType =
  | "date_time_range"
  | "specific_date_time"
  | "daily_time"
  | "month_day"
  | "weekdays"
  | "month"
  | "weekly_time";

export type ScheduleRule = {
  type: ScheduleRuleType;
  startAt?: string;
  endAt?: string;
  date?: string;
  startMinute?: number;
  endMinute?: number;
  weekdays?: number[];
  day?: number;
  month?: number;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minute: number;
  date: string;
};

export function getLocalParts(now: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  return {
    year,
    month,
    day,
    weekday: Math.max(0, weekdays.indexOf(value("weekday"))),
    minute: Number(value("hour")) * 60 + Number(value("minute")),
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function minuteMatches(now: number, start = 0, end = 1440) {
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

export function scheduleSpecificity(type: ScheduleRuleType) {
  return {
    date_time_range: 600,
    specific_date_time: 500,
    daily_time: 400,
    month_day: 300,
    weekdays: 200,
    weekly_time: 200,
    month: 100,
  }[type];
}

export function matchesScheduleRule(
  rule: ScheduleRule,
  now = new Date(),
  timezone = "America/Sao_Paulo",
) {
  const local = getLocalParts(now, timezone);
  switch (rule.type) {
    case "date_time_range":
      return (
        (!rule.startAt || now >= new Date(rule.startAt)) &&
        (!rule.endAt || now < new Date(rule.endAt))
      );
    case "specific_date_time":
      return (
        local.date === rule.date && minuteMatches(local.minute, rule.startMinute, rule.endMinute)
      );
    case "daily_time":
      return minuteMatches(local.minute, rule.startMinute, rule.endMinute);
    case "month_day":
      return local.day === rule.day;
    case "weekdays":
    case "weekly_time":
      return (
        (rule.weekdays ?? []).includes(local.weekday) &&
        minuteMatches(local.minute, rule.startMinute, rule.endMinute)
      );
    case "month":
      return local.month === rule.month;
  }
}

export function anyScheduleRuleMatches(
  rules: ScheduleRule[] | null | undefined,
  now = new Date(),
  timezone = "America/Sao_Paulo",
) {
  return !rules?.length || rules.some((rule) => matchesScheduleRule(rule, now, timezone));
}

export function legacyScheduleRule(row: {
  ruleType: string;
  ruleConfig: unknown;
  weekdayMask: number;
  startMinute: number;
  endMinute: number;
  validFrom: Date | null;
  validUntil: Date | null;
}): ScheduleRule {
  const config = (
    row.ruleConfig && typeof row.ruleConfig === "object" ? row.ruleConfig : {}
  ) as Omit<ScheduleRule, "type">;
  if (row.ruleType !== "weekly_time" || Object.keys(config).length > 0) {
    return { type: row.ruleType as ScheduleRuleType, ...config };
  }
  if (row.validFrom || row.validUntil) {
    return {
      type: "date_time_range",
      startAt: row.validFrom?.toISOString(),
      endAt: row.validUntil?.toISOString(),
    };
  }
  return {
    type: "weekly_time",
    weekdays: Array.from({ length: 7 }, (_, day) => day).filter(
      (day) => ((row.weekdayMask >> day) & 1) === 1,
    ),
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  };
}
