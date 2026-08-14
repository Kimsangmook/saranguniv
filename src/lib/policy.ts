import type { LateFeePolicy } from "@prisma/client";
import {
  DEFAULT_SATURDAY_RATES,
  SUNDAY_ABSENT_FEE,
  SUNDAY_LATE_FEE,
  type SaturdayRate,
} from "@/lib/late-fee";
import { prisma } from "@/lib/prisma";

/** 정산/계산 시점에 고정해 두는 정책 스냅샷 (Settlement.policySnapshot 등에 저장) */
export type PolicySnapshot = {
  /** 토요일 기준 시각 (자정 기준 분, 예: 630 = 10:30) */
  saturdayStartMinutes: number;
  saturdayRates: SaturdayRate[];
  sundayLateAmount: number;
  sundayAbsentAmount: number;
};

/** DB 정책 행 또는 (정책이 없을 때) 기본값으로 구성한 가상 정책 */
export type ActivePolicy = PolicySnapshot & {
  /** 가상 정책이면 null (DB에 활성 정책 행이 없음) */
  id: string | null;
};

function parseSaturdayRates(json: unknown): SaturdayRate[] {
  if (Array.isArray(json)) {
    const rates = json.filter(
      (item): item is SaturdayRate =>
        typeof item === "object" &&
        item !== null &&
        "amountPerMinute" in item &&
        typeof (item as SaturdayRate).amountPerMinute === "number" &&
        "throughMinute" in item &&
        (typeof (item as SaturdayRate).throughMinute === "number" ||
          (item as SaturdayRate).throughMinute === null),
    );
    if (rates.length > 0) return rates;
  }
  return DEFAULT_SATURDAY_RATES;
}

/**
 * 현재 활성(isActive) 지각비 정책을 조회한다.
 * 활성 정책이 없으면 late-fee.ts의 기본값으로 구성한 가상 정책(id: null)을 반환한다.
 */
export async function getActivePolicy(): Promise<ActivePolicy> {
  const policy = await prisma.lateFeePolicy.findFirst({
    where: { isActive: true },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!policy) {
    return {
      id: null,
      saturdayStartMinutes: 630,
      saturdayRates: DEFAULT_SATURDAY_RATES,
      sundayLateAmount: SUNDAY_LATE_FEE,
      sundayAbsentAmount: SUNDAY_ABSENT_FEE,
    };
  }

  return {
    id: policy.id,
    ...buildPolicySnapshot(policy),
  };
}

/** 정책(DB 행 또는 활성 정책)에서 저장용 스냅샷을 만든다. */
export function buildPolicySnapshot(
  policy: Pick<
    LateFeePolicy,
    "saturdayStartMinutes" | "saturdayRates" | "sundayLateAmount" | "sundayAbsentAmount"
  > | ActivePolicy,
): PolicySnapshot {
  return {
    saturdayStartMinutes: policy.saturdayStartMinutes,
    saturdayRates: parseSaturdayRates(policy.saturdayRates),
    sundayLateAmount: policy.sundayLateAmount,
    sundayAbsentAmount: policy.sundayAbsentAmount,
  };
}
