// 사유 제출 대상 날짜 검증 규칙 (서버·클라이언트 공용, 순수 함수만 둘 것)

/** 오늘 기준 과거 며칠까지 사유 제출 가능 */
export const EXCUSE_PAST_DAYS = 14;
/** 오늘 기준 미래 며칠까지 사유 제출 가능 */
export const EXCUSE_FUTURE_DAYS = 60;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateKeyToUtc(key: string): Date | null {
  if (!DATE_KEY_PATTERN.test(key)) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // "2026-02-31" 같은 넘침 방지
  if (date.toISOString().slice(0, 10) !== key) return null;
  return date;
}

/**
 * 해당 날짜(dateKey)에 대해 사유 제출이 가능한지 검증한다.
 * - 토요일 또는 일요일이어야 함
 * - 오늘(todayKey) 기준 과거 EXCUSE_PAST_DAYS일 ~ 미래 EXCUSE_FUTURE_DAYS일 이내
 *
 * @param dateKey  대상 날짜 "YYYY-MM-DD" (서울 기준 날짜 키)
 * @param todayKey 오늘 날짜 "YYYY-MM-DD" (서울 기준 날짜 키, getSeoulDateKey())
 */
export function isExcusableDate(
  dateKey: string,
  todayKey: string,
): { ok: boolean; reason?: string } {
  const target = dateKeyToUtc(dateKey);
  const today = dateKeyToUtc(todayKey);
  if (!target || !today) {
    return { ok: false, reason: "날짜 형식이 올바르지 않습니다." };
  }

  const dayOfWeek = target.getUTCDay();
  if (dayOfWeek !== 0 && dayOfWeek !== 6) {
    return { ok: false, reason: "토요일 또는 일요일만 선택할 수 있습니다." };
  }

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < -EXCUSE_PAST_DAYS) {
    return { ok: false, reason: `지난 ${EXCUSE_PAST_DAYS}일 이내의 날짜만 선택할 수 있습니다.` };
  }
  if (diffDays > EXCUSE_FUTURE_DAYS) {
    return { ok: false, reason: `${EXCUSE_FUTURE_DAYS}일 이후의 날짜는 선택할 수 없습니다.` };
  }

  return { ok: true };
}
