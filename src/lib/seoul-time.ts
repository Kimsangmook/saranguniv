const SEOUL_TIME_ZONE = "Asia/Seoul";

function seoulParts(date: Date) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(
    values.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

export function getSeoulDateKey(date = new Date()): string {
  const { year, month, day } = seoulParts(date);
  return `${year}-${month}-${day}`;
}

export function getSeoulTimeLabel(date: Date): string {
  const { year, month, day, hour, minute } = seoulParts(date);
  return `${year}년 ${Number(month)}월 ${Number(day)}일 ${hour}시 ${minute}분`;
}

export function getSeoulSaturdayStandardTime(date: Date): Date {
  return new Date(`${getSeoulDateKey(date)}T10:30:00+09:00`);
}
