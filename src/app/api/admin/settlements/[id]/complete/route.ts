import { NextResponse } from "next/server";
import { PaymentStatus, RecordSettlementStatus, SettlementStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

class CompleteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 정산 완료 처리 (전원 납부 완료 시에만)
 * POST /api/admin/settlements/[id]/complete
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;

  try {
    await prisma.$transaction(async (tx) => {
      const settlement = await tx.settlement.findUnique({
        where: { id },
        include: { items: { select: { attendanceRecordId: true, paymentStatus: true } } },
      });
      if (!settlement) {
        throw new CompleteError(404, "정산을 찾을 수 없습니다.");
      }
      if (settlement.status === SettlementStatus.COMPLETED) {
        throw new CompleteError(409, "이미 완료된 정산입니다.");
      }
      if (settlement.items.length === 0) {
        throw new CompleteError(422, "정산 항목이 없어 완료 처리할 수 없습니다.");
      }

      const unpaidCount = settlement.items.filter(
        (item) => item.paymentStatus !== PaymentStatus.PAID,
      ).length;
      if (unpaidCount > 0) {
        throw new CompleteError(
          422,
          `아직 납부가 완료되지 않은 항목이 ${unpaidCount}건 있습니다. 전원 납부 후 완료 처리할 수 있습니다.`,
        );
      }

      const completedAt = new Date();

      // 경합 방지: REQUESTED 상태일 때만 완료 전환
      const updated = await tx.settlement.updateMany({
        where: { id, status: SettlementStatus.REQUESTED },
        data: { status: SettlementStatus.COMPLETED, completedAt },
      });
      if (updated.count === 0) {
        throw new CompleteError(409, "이미 완료된 정산입니다.");
      }

      await tx.attendanceRecord.updateMany({
        where: { id: { in: settlement.items.map((item) => item.attendanceRecordId) } },
        data: { settlementStatus: RecordSettlementStatus.COMPLETED },
      });

      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "settlement.complete",
        targetType: "Settlement",
        targetId: id,
        beforeData: {
          status: settlement.status,
          completedAt: settlement.completedAt?.toISOString() ?? null,
        },
        afterData: {
          status: SettlementStatus.COMPLETED,
          completedAt: completedAt.toISOString(),
          recordCount: settlement.items.length,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CompleteError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
