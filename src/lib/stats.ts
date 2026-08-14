// 공개 통계·랭킹 집계 전담 모듈 (서버 전용 — 서버 컴포넌트/서버 코드에서만 import할 것)
//
// 공개 데이터 기준 (기획서 15.3):
// - 정산 완료(Settlement.status = COMPLETED)된 SettlementItem만 공식 통계·랭킹에 포함한다.
// - 금액은 AttendanceRecord.calculatedAmount가 아니라 SettlementItem.amount 기준이다.
// - 공개 범위 (기획서 15.4, 19장): 표시 이름(publicDisplayName ?? name), 활동 상태,
//   횟수, 금액만 반환한다. 연락처·메모·사유·관리자 정보는 절대 포함하지 않는다.

import type { MemberStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate, getSeoulDateKey } from "@/lib/seoul-time";

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------

/** @db.Date(UTC 자정 저장) 값 → "YYYY-MM-DD" 키 (UTC getter만 사용) */
function dbDateToKey(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "YYYY-MM" 월 키를 기준으로 n개월 이전 월 키를 반환 */
function shiftMonthKey(monthKey: string, diff: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + diff;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 공개 통계
// ---------------------------------------------------------------------------

export interface MonthlyTrendPoint {
  /** "YYYY-MM" */
  monthKey: string;
  /** "8월" 형태 표시 라벨 */
  label: string;
  /** 해당 월 1월이거나 추이 시작 월이면 "2026년" 형태 연도 라벨, 아니면 null */
  yearLabel: string | null;
  amount: number;
}

export interface PublicStatistics {
  /** 완료된 정산이 하나라도 있는지 */
  hasData: boolean;
  /** 전체 누적 지각비 */
  totalAmountAll: number;
  /** 올해(서울 기준) 누적 지각비 */
  totalAmountYear: number;
  /** 이번 달(서울 기준) 지각비 */
  totalAmountMonth: number;
  /** 최근 12개월 월별 금액 추이 (과거 → 현재 순) */
  monthlyTrend: MonthlyTrendPoint[];
  /** 유형별 횟수 */
  typeCounts: {
    saturdayLate: number;
    sundayLate: number;
    sundayAbsent: number;
  };
  /** 토·일 금액 비율 계산용 금액 */
  amountByMeeting: {
    saturday: number;
    sunday: number;
  };
  /** 가장 최근 완료된 정산 요약 */
  latestSettlement: {
    name: string;
    startDate: Date;
    endDate: Date;
    completedAt: Date | null;
    totalAmount: number;
  } | null;
}

export async function getPublicStatistics(): Promise<PublicStatistics> {
  const [items, latestSettlement] = await Promise.all([
    prisma.settlementItem.findMany({
      where: { settlement: { status: "COMPLETED" } },
      select: {
        amount: true,
        meetingType: true,
        attendanceStatus: true,
        attendanceRecord: { select: { attendanceDate: true } },
      },
    }),
    prisma.settlement.findFirst({
      where: { status: "COMPLETED" },
      orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { endDate: "desc" }],
      select: {
        name: true,
        startDate: true,
        endDate: true,
        completedAt: true,
        totalAmount: true,
      },
    }),
  ]);

  const todayKey = getSeoulDateKey(); // "YYYY-MM-DD" (서울 기준 오늘)
  const yearPrefix = todayKey.slice(0, 4); // "YYYY"
  const monthPrefix = todayKey.slice(0, 7); // "YYYY-MM"

  let totalAmountAll = 0;
  let totalAmountYear = 0;
  let totalAmountMonth = 0;
  let saturdayLate = 0;
  let sundayLate = 0;
  let sundayAbsent = 0;
  let saturdayAmount = 0;
  let sundayAmount = 0;
  const amountByMonthKey = new Map<string, number>();

  for (const item of items) {
    const dateKey = dbDateToKey(item.attendanceRecord.attendanceDate);
    const monthKey = dateKey.slice(0, 7);

    totalAmountAll += item.amount;
    if (dateKey.startsWith(yearPrefix)) totalAmountYear += item.amount;
    if (dateKey.startsWith(monthPrefix)) totalAmountMonth += item.amount;
    amountByMonthKey.set(monthKey, (amountByMonthKey.get(monthKey) ?? 0) + item.amount);

    if (item.meetingType === "SATURDAY") {
      saturdayAmount += item.amount;
      if (item.attendanceStatus === "LATE") saturdayLate += 1;
    } else {
      sundayAmount += item.amount;
      if (item.attendanceStatus === "LATE") sundayLate += 1;
      if (item.attendanceStatus === "ABSENT") sundayAbsent += 1;
    }
  }

  // 최근 12개월(이번 달 포함, 과거 → 현재)
  const monthlyTrend: MonthlyTrendPoint[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const monthKey = shiftMonthKey(monthPrefix, -i);
    const [y, m] = monthKey.split("-");
    const isFirst = i === 11;
    monthlyTrend.push({
      monthKey,
      label: `${Number(m)}월`,
      yearLabel: isFirst || m === "01" ? `${y}년` : null,
      amount: amountByMonthKey.get(monthKey) ?? 0,
    });
  }

  return {
    hasData: latestSettlement !== null,
    totalAmountAll,
    totalAmountYear,
    totalAmountMonth,
    monthlyTrend,
    typeCounts: { saturdayLate, sundayLate, sundayAbsent },
    amountByMeeting: { saturday: saturdayAmount, sunday: sundayAmount },
    latestSettlement,
  };
}

// ---------------------------------------------------------------------------
// 공개 랭킹
// ---------------------------------------------------------------------------

export type RankingScope = "active" | "all";
export type RankingPeriod = "all" | "year" | "month";
export type RankingSort = "total" | "count" | "saturday" | "sunday";

export interface PublicRankingOptions {
  scope: RankingScope;
  period: RankingPeriod;
  sort: RankingSort;
}

export interface PublicRankingEntry {
  /** 공동 순위(competition ranking: 1, 1, 3 ...) */
  rank: number;
  /** 공개용 표시 이름 (publicDisplayName ?? name) */
  displayName: string;
  /** 활동 상태 */
  memberStatus: MemberStatus;
  /** 누적 지각비 합계 */
  totalAmount: number;
  /** 지각·결석 총횟수 */
  totalCount: number;
  /** 토요일 지각 횟수 */
  saturdayLateCount: number;
  /** 토요일 지각비 합계 */
  saturdayAmount: number;
  /** 일요일 지각 횟수 */
  sundayLateCount: number;
  /** 일요일 결석 횟수 */
  sundayAbsentCount: number;
  /** 일요일 지각·결석 금액 합계 */
  sundayAmount: number;
  /** 현재 정렬 기준의 값 (순위 산정에 사용된 값) */
  sortValue: number;
}

interface MemberAccumulator {
  displayName: string;
  memberStatus: MemberStatus;
  totalAmount: number;
  totalCount: number;
  saturdayLateCount: number;
  saturdayAmount: number;
  sundayLateCount: number;
  sundayAbsentCount: number;
  sundayAmount: number;
}

function getSortValue(acc: MemberAccumulator, sort: RankingSort): number {
  switch (sort) {
    case "total":
      return acc.totalAmount;
    case "count":
      return acc.totalCount;
    case "saturday":
      return acc.saturdayAmount;
    case "sunday":
      return acc.sundayAmount;
  }
}

export async function getPublicRanking(
  options: PublicRankingOptions,
): Promise<PublicRankingEntry[]> {
  const { scope, period, sort } = options;

  // 기간 경계: 서울 기준 오늘 키로 올해/이번 달 시작일을 계산해 @db.Date 값과 비교
  const todayKey = getSeoulDateKey();
  let periodStart: Date | null = null;
  if (period === "year") {
    periodStart = dateKeyToDbDate(`${todayKey.slice(0, 4)}-01-01`);
  } else if (period === "month") {
    periodStart = dateKeyToDbDate(`${todayKey.slice(0, 7)}-01`);
  }

  const items = await prisma.settlementItem.findMany({
    where: {
      settlement: { status: "COMPLETED" },
      ...(scope === "active" ? { member: { status: "ACTIVE" } } : {}),
      ...(periodStart
        ? { attendanceRecord: { attendanceDate: { gte: periodStart } } }
        : {}),
    },
    select: {
      amount: true,
      meetingType: true,
      attendanceStatus: true,
      memberId: true,
      member: {
        select: { name: true, publicDisplayName: true, status: true },
      },
    },
  });

  const byMember = new Map<string, MemberAccumulator>();

  for (const item of items) {
    let acc = byMember.get(item.memberId);
    if (!acc) {
      acc = {
        displayName: item.member.publicDisplayName ?? item.member.name,
        memberStatus: item.member.status,
        totalAmount: 0,
        totalCount: 0,
        saturdayLateCount: 0,
        saturdayAmount: 0,
        sundayLateCount: 0,
        sundayAbsentCount: 0,
        sundayAmount: 0,
      };
      byMember.set(item.memberId, acc);
    }

    acc.totalAmount += item.amount;
    acc.totalCount += 1;
    if (item.meetingType === "SATURDAY") {
      acc.saturdayAmount += item.amount;
      if (item.attendanceStatus === "LATE") acc.saturdayLateCount += 1;
    } else {
      acc.sundayAmount += item.amount;
      if (item.attendanceStatus === "LATE") acc.sundayLateCount += 1;
      if (item.attendanceStatus === "ABSENT") acc.sundayAbsentCount += 1;
    }
  }

  const sorted = Array.from(byMember.values()).sort((a, b) => {
    const diff = getSortValue(b, sort) - getSortValue(a, sort);
    if (diff !== 0) return diff;
    // 동점은 공동 순위 — 표시 안정성을 위해 이름 오름차순으로만 정렬
    return a.displayName.localeCompare(b.displayName, "ko");
  });

  // competition ranking: 동점이면 같은 순위, 다음 값은 건너뛴 순위(1, 1, 3 ...)
  const entries: PublicRankingEntry[] = [];
  let prevValue: number | null = null;
  let prevRank = 0;

  sorted.forEach((acc, index) => {
    const value = getSortValue(acc, sort);
    const rank = value === prevValue ? prevRank : index + 1;
    prevValue = value;
    prevRank = rank;

    entries.push({
      rank,
      displayName: acc.displayName,
      memberStatus: acc.memberStatus,
      totalAmount: acc.totalAmount,
      totalCount: acc.totalCount,
      saturdayLateCount: acc.saturdayLateCount,
      saturdayAmount: acc.saturdayAmount,
      sundayLateCount: acc.sundayLateCount,
      sundayAbsentCount: acc.sundayAbsentCount,
      sundayAmount: acc.sundayAmount,
      sortValue: value,
    });
  });

  return entries;
}
