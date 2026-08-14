import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { getActivePolicy } from "@/lib/policy";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate } from "@/lib/seoul-time";
import {
  computeSettlementItems,
  parsePolicyRules,
  validateSettlementRecords,
} from "@/lib/settlement";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 정산 미리보기 (금액 계산은 전부 서버)
 * POST /api/admin/settlements/preview
 * body: { periodStart, periodEnd, recordIds, rules? }
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;
  void session;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const periodStart = typeof body.periodStart === "string" ? body.periodStart : "";
  const periodEnd = typeof body.periodEnd === "string" ? body.periodEnd : "";
  if (!DATE_KEY_REGEX.test(periodStart) || !DATE_KEY_REGEX.test(periodEnd)) {
    return NextResponse.json({ message: "정산 기간을 올바르게 입력해주세요." }, { status: 400 });
  }
  if (periodStart > periodEnd) {
    return NextResponse.json(
      { message: "정산 시작일은 종료일보다 늦을 수 없습니다." },
      { status: 400 },
    );
  }

  const recordIds = Array.isArray(body.recordIds)
    ? body.recordIds.filter((v): v is string => typeof v === "string")
    : [];

  const activePolicy = await getActivePolicy();

  let rules = null;
  if (body.rules !== undefined && body.rules !== null) {
    rules = parsePolicyRules(body.rules);
    if (!rules) {
      return NextResponse.json({ message: "적용 규칙이 올바르지 않습니다." }, { status: 400 });
    }
  } else {
    rules = {
      saturdayStartMinutes: activePolicy.saturdayStartMinutes,
      saturdayRates: activePolicy.saturdayRates,
      sundayLateAmount: activePolicy.sundayLateAmount,
      sundayAbsentAmount: activePolicy.sundayAbsentAmount,
    };
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { id: { in: recordIds } },
    include: { member: { select: { id: true, name: true } } },
  });

  const errors: string[] = [];
  if (records.length < recordIds.length) {
    errors.push("존재하지 않는 기록이 포함되어 있습니다. 목록을 새로고침해주세요.");
  }
  errors.push(
    ...validateSettlementRecords(records, dateKeyToDbDate(periodStart), dateKeyToDbDate(periodEnd)),
  );

  const computation = computeSettlementItems(records, rules);

  return NextResponse.json({
    items: computation.items,
    perMember: computation.perMember,
    totalAmount: computation.totalAmount,
    recordCount: records.length,
    activePolicy,
    rules,
    errors,
  });
}
