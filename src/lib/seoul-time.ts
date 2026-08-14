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

// ---------------------------------------------------------------------------
// @db.Date 컬럼(attendanceDate, targetDate, startDate, endDate, effectiveFrom ...) 규칙:
// - 저장: 서울 기준 날짜 키를 UTC 자정으로 고정한 Date (getSeoulAttendanceDate / dateKeyToDbDate)
// - 읽기/표시: 반드시 UTC getter(getUTC*)만 사용 (formatDbDate, getDayOfWeekFromDateKey)
// - timestamp 계열(arrivedAt, createdAt ...)은 getSeoulTimeLabel 등 서울 시간 변환을 사용
// ---------------------------------------------------------------------------

/** 서울 기준 "오늘" 날짜를 @db.Date 저장용 UTC 자정 Date로 반환 */
export function getSeoulAttendanceDate(date = new Date()): Date {
  return new Date(`${getSeoulDateKey(date)}T00:00:00.000Z`);
}

export function isSeoulSaturday(date = new Date()): boolean {
  return getDayOfWeekFromDateKey(getSeoulDateKey(date)) === 6;
}

export function isSeoulSunday(date = new Date()): boolean {
  return getDayOfWeekFromDateKey(getSeoulDateKey(date)) === 0;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * @db.Date 컬럼 값 표시용 포맷 → "8월 15일 (토)"
 * 주의: UTC 자정으로 저장된 값이므로 UTC getter만 사용해야 한다 (로컬 타임존 오염 방지).
 */
export function formatDbDate(d: Date): string {
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DAY_LABELS[d.getUTCDay()]})`;
}

/** "YYYY-MM-DD" → @db.Date 저장용 UTC 자정 Date */
export function dateKeyToDbDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** "YYYY-MM-DD" → 요일 (0=일 ~ 6=토, UTC 기준) */
export function getDayOfWeekFromDateKey(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}
