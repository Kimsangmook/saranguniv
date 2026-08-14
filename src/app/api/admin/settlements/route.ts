import { NextResponse } from "next/server";
import { PaymentStatus, Prisma, RecordSettlementStatus, SettlementStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate } from "@/lib/seoul-time";
import {
  computeSettlementItems,
  dbDateToKey,
  parsePolicyRules,
  validateSettlementRecords,
} from "@/lib/settlement";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 정산 목록
 * GET /api/admin/settlements?from=&to=&status=
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;
  void session;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const status = searchParams.get("status") ?? "";

  const where: Prisma.SettlementWhereInput = {};
  if (status) {
    if (!Object.values(SettlementStatus).includes(status as SettlementStatus)) {
      return NextResponse.json({ message: "정산 상태가 올바르지 않습니다." }, { status: 400 });
    }
    where.status = status as SettlementStatus;
  }
  // 기간 필터: 정산 기간이 조회 기간과 겹치는 정산
  if (from) {
    if (!DATE_KEY_REGEX.test(from)) {
      return NextResponse.json({ message: "시작일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    where.endDate = { gte: dateKeyToDbDate(from) };
  }
  if (to) {
    if (!DATE_KEY_REGEX.test(to)) {
      return NextResponse.json({ message: "종료일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    where.startDate = { lte: dateKeyToDbDate(to) };
  }

  const settlements = await prisma.settlement.findMany({
    where,
    include: { items: { select: { memberId: true, paymentStatus: true } } },
    orderBy: [{ confirmedAt: "desc" }],
  });

  return NextResponse.json({
    settlements: settlements.map((settlement) => {
      // 납부 진행: 팀원별로 모든 항목이 납부 완료인 인원 수 / 전체 인원 수
      const memberPaid = new Map<string, boolean>();
      for (const item of settlement.items) {
        const prev = memberPaid.get(item.memberId) ?? true;
        memberPaid.set(item.memberId, prev && item.paymentStatus === PaymentStatus.PAID);
      }
      const memberCount = memberPaid.size;
      const paidMemberCount = [...memberPaid.values()].filter(Boolean).length;

      return {
        id: settlement.id,
        name: settlement.name,
        startDate: dbDateToKey(settlement.startDate),
        endDate: dbDateToKey(settlement.endDate),
        status: settlement.status,
        totalAmount: settlement.totalAmount,
        confirmedAt: settlement.confirmedAt.toISOString(),
        completedAt: settlement.completedAt?.toISOString() ?? null,
        memberCount,
        paidMemberCount,
      };
    }),
  });
}

class SettlementCreateError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly messages: string[],
  ) {
    super(messages.join(" / "));
  }
}

/**
 * 정산 확정 (트랜잭션)
 * POST /api/admin/settlements
 * body: { title, periodStart, periodEnd, recordIds, rules }
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ message: "정산명을 입력해주세요." }, { status: 400 });
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
  if (recordIds.length === 0) {
    return NextResponse.json(
      { message: "선택된 기록이 없습니다. 정산할 기록을 선택해주세요." },
      { status: 400 },
    );
  }

  const rules = parsePolicyRules(body.rules);
  if (!rules) {
    return NextResponse.json({ message: "적용 규칙이 올바르지 않습니다." }, { status: 400 });
  }

  const startDate = dateKeyToDbDate(periodStart);
  const endDate = dateKeyToDbDate(periodEnd);

  try {
    const settlementId = await prisma.$transaction(async (tx) => {
      // ① 레코드 재조회·재검증 (존재 / UNSETTLED / 기간 내 / SettlementItem 미존재)
      const records = await tx.attendanceRecord.findMany({
        where: { id: { in: recordIds } },
        include: {
          member: { select: { id: true, name: true } },
          settlementItem: { select: { id: true } },
        },
      });

      const errors: string[] = [];
      if (records.length < recordIds.length) {
        errors.push("존재하지 않는 기록이 포함되어 있습니다.");
      }
      errors.push(...validateSettlementRecords(records, startDate, endDate));
      const alreadyIncluded = records.filter((r) => r.settlementItem !== null);
      if (alreadyIncluded.length > 0) {
        errors.push(
          `이미 정산 항목이 존재하는 기록이 있습니다: ${alreadyIncluded
            .map((r) => r.member.name)
            .join(", ")}`,
        );
      }
      if (errors.length > 0) throw new SettlementCreateError(422, errors);

      // ② 규칙 기준 전체 재계산
      const computation = computeSettlementItems(records, rules);

      // ③ Settlement 생성 (규칙 스냅샷 저장)
      const settlement = await tx.settlement.create({
        data: {
          name: title,
          startDate,
          endDate,
          status: SettlementStatus.REQUESTED,
          policySnapshot: rules as unknown as Prisma.InputJsonValue,
          totalAmount: computation.totalAmount,
          createdById: session.adminId,
        },
      });

      // ④ 미정산 → 정산 요청 전환. 경합으로 일부가 이미 전환됐다면 전체 롤백
      //    (SettlementItem 생성보다 먼저 수행해 경합을 조기에 원자적으로 차단)
      const updated = await tx.attendanceRecord.updateMany({
        where: { id: { in: recordIds }, settlementStatus: RecordSettlementStatus.UNSETTLED },
        data: { settlementStatus: RecordSettlementStatus.REQUESTED },
      });
      if (updated.count !== recordIds.length) {
        throw new SettlementCreateError(409, [
          "다른 정산에 이미 포함된 기록이 있어 확정을 취소했습니다. 목록을 새로고침해주세요.",
        ]);
      }

      // ⑤ SettlementItem 생성 (attendanceRecordId unique 위반 시 P2002 → 409)
      await tx.settlementItem.createMany({
        data: computation.items.map((item) => ({
          settlementId: settlement.id,
          memberId: item.memberId,
          attendanceRecordId: item.recordId,
          meetingType: item.meetingType,
          attendanceStatus: item.status,
          calculationDetail: item.calculationDetail as unknown as Prisma.InputJsonValue,
          amount: item.amount,
        })),
      });

      // ⑥ 감사 로그
      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "settlement.confirm",
        targetType: "Settlement",
        targetId: settlement.id,
        afterData: {
          name: title,
          periodStart,
          periodEnd,
          recordIds,
          totalAmount: computation.totalAmount,
          policySnapshot: rules as unknown as Prisma.InputJsonValue,
        },
      });

      return settlement.id;
    });

    return NextResponse.json({ id: settlementId }, { status: 201 });
  } catch (error) {
    if (error instanceof SettlementCreateError) {
      return NextResponse.json(
        { message: error.messages[0], errors: error.messages },
        { status: error.statusCode },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { message: "다른 정산에 이미 포함된 기록이 있습니다." },
        { status: 409 },
      );
    }
    throw error;
  }
}
