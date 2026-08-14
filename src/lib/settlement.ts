// 서버 전용 모듈: 정산 계산 엔진 (금액 계산은 반드시 서버에서 수행)
import type { AttendanceStatus, MeetingType, RecordSettlementStatus } from "@prisma/client";
import { formatKrw } from "@/lib/labels";
import type { SaturdayRate } from "@/lib/late-fee";
import type { PolicySnapshot } from "@/lib/policy";

// ---------------------------------------------------------------------------
// 시각 유틸
// ---------------------------------------------------------------------------

/** 자정 기준 분(예: 630) → "10:30" */
export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** timestamp → 서울 기준 "HH:MM" */
export function formatSeoulHourMinute(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${map.hour}:${map.minute}`;
}

/** @db.Date 값 → "YYYY-MM-DD" (UTC getter만 사용) */
export function dbDateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 해당 @db.Date 날짜의 서울 기준 시각(자정 기준 분)을 timestamp로 변환.
 * 예: 2026-08-15 + 630분 → 2026-08-15T10:30:00+09:00
 */
export function getStandardTimeForDate(attendanceDate: Date, startMinutes: number): Date {
  return new Date(`${dbDateToKey(attendanceDate)}T${minutesToTimeLabel(startMinutes)}:00+09:00`);
}

// ---------------------------------------------------------------------------
// 구간 요율 계산 (late-fee.ts와 동일 로직, 요율표 인자화)
// ---------------------------------------------------------------------------

/** 지각 분이 속한 구간을 찾는다. rates는 throughMinute 오름차순(마지막 null) 가정 */
export function findRate(lateMinutes: number, rates: SaturdayRate[]): SaturdayRate {
  const rate = rates.find(
    ({ throughMinute }) => throughMinute === null || lateMinutes <= throughMinute,
  );
  if (!rate) throw new Error("지각비 구간이 올바르지 않습니다.");
  return rate;
}

/**
 * 구간 누진 없이, 도착 구간의 분당 금액을 전체 지각 분에 적용한다.
 * 예: 12분 지각 → 11~20분 구간(분당 300원) → 12 × 300 = 3,600원
 */
export function calculateWithRates(lateMinutes: number, rates: SaturdayRate[]): number {
  if (!Number.isFinite(lateMinutes) || lateMinutes <= 0) return 0;
  return Math.floor(lateMinutes) * findRate(lateMinutes, rates).amountPerMinute;
}

// ---------------------------------------------------------------------------
// 규칙(PolicySnapshot) 파싱
// ---------------------------------------------------------------------------

/** 요청 body의 rules를 검증해 PolicySnapshot으로 변환. 올바르지 않으면 null */
export function parsePolicyRules(input: unknown): PolicySnapshot | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as Record<string, unknown>;

  const start = obj.saturdayStartMinutes;
  const sundayLate = obj.sundayLateAmount;
  const sundayAbsent = obj.sundayAbsentAmount;
  if (
    typeof start !== "number" || !Number.isInteger(start) || start < 0 || start >= 24 * 60 ||
    typeof sundayLate !== "number" || !Number.isInteger(sundayLate) || sundayLate < 0 ||
    typeof sundayAbsent !== "number" || !Number.isInteger(sundayAbsent) || sundayAbsent < 0
  ) {
    return null;
  }

  const ratesInput = obj.saturdayRates;
  if (!Array.isArray(ratesInput) || ratesInput.length === 0) return null;

  const rates: SaturdayRate[] = [];
  for (const item of ratesInput) {
    if (typeof item !== "object" || item === null) return null;
    const { throughMinute, amountPerMinute } = item as Record<string, unknown>;
    const validThrough =
      throughMinute === null ||
      (typeof throughMinute === "number" && Number.isInteger(throughMinute) && throughMinute > 0);
    const validAmount =
      typeof amountPerMinute === "number" && Number.isInteger(amountPerMinute) && amountPerMinute >= 0;
    if (!validThrough || !validAmount) return null;
    rates.push({
      throughMinute: throughMinute as number | null,
      amountPerMinute: amountPerMinute as number,
    });
  }

  // 마지막 구간은 상한 없음(null), 나머지는 오름차순이어야 한다.
  for (let i = 0; i < rates.length; i += 1) {
    const isLast = i === rates.length - 1;
    const through = rates[i].throughMinute;
    if (isLast) {
      if (through !== null) return null;
    } else {
      if (through === null) return null;
      const prev = i > 0 ? rates[i - 1].throughMinute : 0;
      if (prev !== null && through <= prev) return null;
    }
  }

  return {
    saturdayStartMinutes: start,
    saturdayRates: rates,
    sundayLateAmount: sundayLate,
    sundayAbsentAmount: sundayAbsent,
  };
}

// ---------------------------------------------------------------------------
// 항목별 재계산
// ---------------------------------------------------------------------------

export type SettlementSourceRecord = {
  id: string;
  memberId: string;
  attendanceDate: Date;
  meetingType: MeetingType;
  status: AttendanceStatus;
  settlementStatus: RecordSettlementStatus;
  arrivedAt: Date | null;
  lateMinutes: number | null;
  member: { id: string; name: string };
};

export type SettlementCalculationDetail =
  | { base: "saturday"; lateMinutes: number; amountPerMinute: number }
  | { base: "sunday"; status: AttendanceStatus };

export type ComputedSettlementItem = {
  recordId: string;
  memberId: string;
  meetingType: MeetingType;
  status: AttendanceStatus;
  amount: number;
  calculationDetail: SettlementCalculationDetail;
};

export type MemberSettlementSummary = {
  memberId: string;
  memberName: string;
  saturdayAmount: number;
  sundayLateAmount: number;
  sundayAbsentAmount: number;
  totalAmount: number;
  recordCount: number;
};

export type SettlementComputation = {
  items: ComputedSettlementItem[];
  perMember: MemberSettlementSummary[];
  totalAmount: number;
};

/**
 * 선택된 출결 기록을 규칙(rules) 기준으로 전부 재계산한다.
 * - 토요일 LATE: arrivedAt과 rules.saturdayStartMinutes로 지각 분을 재산출해 구간 요율 적용
 * - 일요일: LATE=sundayLateAmount, ABSENT=sundayAbsentAmount
 */
export function computeSettlementItems(
  records: SettlementSourceRecord[],
  rules: PolicySnapshot,
): SettlementComputation {
  const items: ComputedSettlementItem[] = [];
  const perMemberMap = new Map<string, MemberSettlementSummary>();

  for (const record of records) {
    let amount = 0;
    let detail: SettlementCalculationDetail;

    if (record.meetingType === "SATURDAY") {
      let lateMinutes: number;
      if (record.arrivedAt) {
        const standard = getStandardTimeForDate(record.attendanceDate, rules.saturdayStartMinutes);
        lateMinutes = Math.max(
          0,
          Math.floor((record.arrivedAt.getTime() - standard.getTime()) / 60_000),
        );
      } else {
        lateMinutes = record.lateMinutes ?? 0;
      }
      const amountPerMinute =
        lateMinutes > 0 ? findRate(lateMinutes, rules.saturdayRates).amountPerMinute : 0;
      amount = calculateWithRates(lateMinutes, rules.saturdayRates);
      detail = { base: "saturday", lateMinutes, amountPerMinute };
    } else {
      amount = record.status === "ABSENT" ? rules.sundayAbsentAmount : rules.sundayLateAmount;
      detail = { base: "sunday", status: record.status };
    }

    items.push({
      recordId: record.id,
      memberId: record.memberId,
      meetingType: record.meetingType,
      status: record.status,
      amount,
      calculationDetail: detail,
    });

    const summary = perMemberMap.get(record.memberId) ?? {
      memberId: record.memberId,
      memberName: record.member.name,
      saturdayAmount: 0,
      sundayLateAmount: 0,
      sundayAbsentAmount: 0,
      totalAmount: 0,
      recordCount: 0,
    };
    if (record.meetingType === "SATURDAY") {
      summary.saturdayAmount += amount;
    } else if (record.status === "ABSENT") {
      summary.sundayAbsentAmount += amount;
    } else {
      summary.sundayLateAmount += amount;
    }
    summary.totalAmount += amount;
    summary.recordCount += 1;
    perMemberMap.set(record.memberId, summary);
  }

  const perMember = [...perMemberMap.values()].sort((a, b) =>
    a.memberName.localeCompare(b.memberName, "ko"),
  );
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  return { items, perMember, totalAmount };
}

// ---------------------------------------------------------------------------
// 정산 대상 검증
// ---------------------------------------------------------------------------

/**
 * 정산 확정 전 검증. 오류 메시지 목록을 반환한다 (빈 배열이면 통과).
 * - 선택된 기록이 없음
 * - 정산 기간 밖의 기록 포함
 * - 미정산(UNSETTLED)이 아닌 기록 포함
 */
export function validateSettlementRecords(
  records: Pick<
    SettlementSourceRecord,
    "id" | "attendanceDate" | "settlementStatus" | "member"
  >[],
  periodStart: Date,
  periodEnd: Date,
): string[] {
  const errors: string[] = [];

  if (records.length === 0) {
    errors.push("선택된 기록이 없습니다. 정산할 기록을 선택해주세요.");
    return errors;
  }

  const outOfPeriod = records.filter(
    (r) => r.attendanceDate.getTime() < periodStart.getTime() ||
      r.attendanceDate.getTime() > periodEnd.getTime(),
  );
  if (outOfPeriod.length > 0) {
    const names = outOfPeriod
      .map((r) => `${r.member.name}(${dbDateToKey(r.attendanceDate)})`)
      .join(", ");
    errors.push(`정산 기간 밖의 기록이 포함되어 있습니다: ${names}`);
  }

  const notUnsettled = records.filter((r) => r.settlementStatus !== "UNSETTLED");
  if (notUnsettled.length > 0) {
    const names = notUnsettled
      .map((r) => `${r.member.name}(${dbDateToKey(r.attendanceDate)})`)
      .join(", ");
    errors.push(`이미 다른 정산에 포함된 기록이 있습니다: ${names}`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 카카오톡 공지 문구 (기획 14장)
// ---------------------------------------------------------------------------

export type KakaoSaturdayEntry = {
  /** 도착 시각 "HH:MM" */
  arrivalLabel: string;
  lateMinutes: number;
  name: string;
  amount: number;
};

export type KakaoSundayEntry = {
  name: string;
  amount: number;
};

export type KakaoNoticeGroup = {
  /** 예: "3.28" */
  dateLabel: string;
  /** 예: "토" */
  dayLabel: string;
  saturdayEntries: KakaoSaturdayEntry[];
  sundayEntries: KakaoSundayEntry[];
};

/**
 * 카카오톡 공지 문구 생성 (순수 함수).
 * - 날짜·요일별 그룹, 토요일 "HH:MM(n분) 이름 금액원", 일요일 "이름, 이름 (각 3,000원)"
 * - 0원 기록 제외, 전체 총합 미표시
 */
export function buildKakaoNotice(
  title: string,
  periodLabel: string,
  groups: KakaoNoticeGroup[],
): string {
  const blocks: string[] = [];

  for (const group of groups) {
    const lines: string[] = [];

    for (const entry of group.saturdayEntries) {
      if (entry.amount <= 0) continue;
      lines.push(
        `${entry.arrivalLabel}(${entry.lateMinutes}분) ${entry.name} ${formatKrw(entry.amount)}`,
      );
    }

    // 일요일은 금액별로 묶어 "이름, 이름 (각 3,000원)" 형식으로 표시
    const byAmount = new Map<number, string[]>();
    for (const entry of group.sundayEntries) {
      if (entry.amount <= 0) continue;
      const names = byAmount.get(entry.amount) ?? [];
      names.push(entry.name);
      byAmount.set(entry.amount, names);
    }
    for (const [amount, names] of byAmount) {
      lines.push(`${names.join(", ")} (각 ${formatKrw(amount)})`);
    }

    if (lines.length === 0) continue;
    blocks.push([`${group.dateLabel} ${group.dayLabel}`, ...lines].join("\n"));
  }

  return [
    `[${title}]`,
    `정산 기간: ${periodLabel}`,
    ...blocks,
    "각자 금액 확인 후 납부 부탁드립니다.",
  ].join("\n\n");
}
