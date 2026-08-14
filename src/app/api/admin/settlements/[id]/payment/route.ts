import { NextResponse } from "next/server";
import { PaymentStatus, SettlementStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

class PaymentUpdateError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 사람별 납부 상태 일괄 갱신 (해당 정산 × 팀원의 모든 항목)
 * PATCH /api/admin/settlements/[id]/payment
 * body: { memberId, paymentStatus }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  const paymentStatus = typeof body?.paymentStatus === "string" ? body.paymentStatus : "";

  if (!memberId) {
    return NextResponse.json({ message: "팀원을 선택해주세요." }, { status: 400 });
  }
  if (!Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)) {
    return NextResponse.json({ message: "납부 상태가 올바르지 않습니다." }, { status: 400 });
  }
  const nextStatus = paymentStatus as PaymentStatus;

  const settlement = await prisma.settlement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!settlement) {
    return NextResponse.json({ message: "정산을 찾을 수 없습니다." }, { status: 404 });
  }
  if (settlement.status === SettlementStatus.COMPLETED) {
    return NextResponse.json(
      { message: "완료된 정산의 납부 상태는 변경할 수 없습니다." },
      { status: 409 },
    );
  }

  const paid = nextStatus === PaymentStatus.PAID;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 감사 로그 beforeData용: 이전 납부 상태를 미리 조회
      const beforeItems = await tx.settlementItem.findMany({
        where: { settlementId: id, memberId },
        select: { id: true, paymentStatus: true },
      });
      if (beforeItems.length === 0) {
        throw new PaymentUpdateError(404, "해당 팀원의 정산 항목을 찾을 수 없습니다.");
      }

      // 경합 원자 차단: 정산이 REQUESTED 상태일 때만 갱신 (동시 완료 처리와의 경합 방지)
      const updated = await tx.settlementItem.updateMany({
        where: { settlementId: id, memberId, settlement: { status: SettlementStatus.REQUESTED } },
        data: {
          paymentStatus: nextStatus,
          paidAt: paid ? new Date() : null,
          paidByAdminId: paid ? session.adminId : null,
        },
      });
      if (updated.count === 0) {
        throw new PaymentUpdateError(409, "완료된 정산의 납부 상태는 변경할 수 없습니다.");
      }

      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "settlement.payment",
        targetType: "Settlement",
        targetId: id,
        beforeData: {
          memberId,
          items: beforeItems.map((item) => ({ id: item.id, paymentStatus: item.paymentStatus })),
        },
        afterData: { memberId, paymentStatus: nextStatus, itemCount: updated.count },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, updatedCount: result.count });
  } catch (error) {
    if (error instanceof PaymentUpdateError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
