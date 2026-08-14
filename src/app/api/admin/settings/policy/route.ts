import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { requireAdminApi } from "@/lib/auth";
import type { SaturdayRate } from "@/lib/late-fee";
import { getActivePolicy } from "@/lib/policy";
import { prisma } from "@/lib/prisma";
import { getSeoulAttendanceDate } from "@/lib/seoul-time";

const MINUTES_PER_DAY = 24 * 60;

export async function GET() {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;

  const policy = await getActivePolicy();
  return NextResponse.json({ policy });
}

type PutBody = {
  saturdayStartMinutes?: unknown;
  saturdayRates?: unknown;
  sundayLateAmount?: unknown;
  sundayAbsentAmount?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

/** saturdayRates 검증: 실패 시 오류 메시지, 성공 시 정규화된 배열 반환 */
function validateRates(
  input: unknown,
): { ok: true; rates: SaturdayRate[] } | { ok: false; message: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, message: "지각비 구간표는 최소 1행 이상이어야 합니다." };
  }

  const rates: SaturdayRate[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const row = input[i] as { throughMinute?: unknown; amountPerMinute?: unknown } | null;
    const label = `${i + 1}번째 구간`;

    if (typeof row !== "object" || row === null) {
      return { ok: false, message: `${label}의 형식이 올바르지 않습니다.` };
    }

    const { throughMinute, amountPerMinute } = row;

    if (!Number.isInteger(amountPerMinute) || (amountPerMinute as number) <= 0) {
      return { ok: false, message: `${label}의 분당 금액은 1원 이상의 정수여야 합니다.` };
    }

    const isLast = i === input.length - 1;

    if (throughMinute === null) {
      if (!isLast) {
        return {
          ok: false,
          message: "상한 없음('이후') 구간은 마지막 행에만 둘 수 있습니다.",
        };
      }
    } else {
      if (!Number.isInteger(throughMinute) || (throughMinute as number) <= 0) {
        return { ok: false, message: `${label}의 상한 분은 1 이상의 정수여야 합니다.` };
      }
      if (isLast) {
        return {
          ok: false,
          message: "마지막 구간의 상한은 '이후'(상한 없음)여야 합니다.",
        };
      }
      const prev = rates[rates.length - 1];
      if (prev && prev.throughMinute !== null && (throughMinute as number) <= prev.throughMinute) {
        return { ok: false, message: "구간 상한 분은 오름차순으로 커져야 합니다." };
      }
    }

    rates.push({
      throughMinute: throughMinute === null ? null : (throughMinute as number),
      amountPerMinute: amountPerMinute as number,
    });
  }

  return { ok: true, rates };
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return badRequest("잘못된 요청 형식입니다.");
  }

  const { saturdayStartMinutes, sundayLateAmount, sundayAbsentAmount } = body;

  if (
    !Number.isInteger(saturdayStartMinutes) ||
    (saturdayStartMinutes as number) < 0 ||
    (saturdayStartMinutes as number) >= MINUTES_PER_DAY
  ) {
    return badRequest("토요일 기준 시각이 올바르지 않습니다. (0분 ~ 23:59 사이여야 합니다)");
  }
  if (!Number.isInteger(sundayLateAmount) || (sundayLateAmount as number) < 0) {
    return badRequest("일요일 지각 금액은 0원 이상의 정수여야 합니다.");
  }
  if (!Number.isInteger(sundayAbsentAmount) || (sundayAbsentAmount as number) < 0) {
    return badRequest("일요일 결석 금액은 0원 이상의 정수여야 합니다.");
  }

  const ratesResult = validateRates(body.saturdayRates);
  if (!ratesResult.ok) return badRequest(ratesResult.message);
  const rates = ratesResult.rates;

  const beforePolicy = await getActivePolicy();

  const created = await prisma.$transaction(async (tx) => {
    await tx.lateFeePolicy.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const newPolicy = await tx.lateFeePolicy.create({
      data: {
        saturdayStartMinutes: saturdayStartMinutes as number,
        saturdayRates: rates as unknown as Prisma.InputJsonValue,
        sundayLateAmount: sundayLateAmount as number,
        sundayAbsentAmount: sundayAbsentAmount as number,
        effectiveFrom: getSeoulAttendanceDate(),
        isActive: true,
      },
    });

    await writeAuditLog(tx, {
      actorAdminId: session.adminId,
      action: "policy.update",
      targetType: "LateFeePolicy",
      targetId: newPolicy.id,
      beforeData: beforePolicy as unknown as Prisma.InputJsonValue,
      afterData: {
        id: newPolicy.id,
        saturdayStartMinutes: newPolicy.saturdayStartMinutes,
        saturdayRates: rates,
        sundayLateAmount: newPolicy.sundayLateAmount,
        sundayAbsentAmount: newPolicy.sundayAbsentAmount,
      } as unknown as Prisma.InputJsonValue,
    });

    return newPolicy;
  });

  return NextResponse.json({
    policy: {
      id: created.id,
      saturdayStartMinutes: created.saturdayStartMinutes,
      saturdayRates: rates,
      sundayLateAmount: created.sundayLateAmount,
      sundayAbsentAmount: created.sundayAbsentAmount,
    },
  });
}
