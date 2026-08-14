import type { Prisma, PrismaClient } from "@prisma/client";

/** PrismaClient 또는 $transaction 콜백의 트랜잭션 클라이언트 모두 허용 */
export type AuditClient = PrismaClient | Prisma.TransactionClient;

export type WriteAuditLogInput = {
  actorAdminId?: string | null;
  actorMemberId?: string | null;
  /** 예: "member.create", "attendance.update", "excuse.approve" */
  action: string;
  /** 예: "Member", "AttendanceRecord", "ExcuseRequest", "Settlement", "LateFeePolicy" */
  targetType: string;
  targetId: string;
  beforeData?: Prisma.InputJsonValue | null;
  afterData?: Prisma.InputJsonValue | null;
  reason?: string | null;
};

/**
 * 감사 로그 기록. 트랜잭션 안에서는 tx 클라이언트를 넘겨 원자성을 보장할 것.
 *
 * 사용 예:
 *   await prisma.$transaction(async (tx) => {
 *     const updated = await tx.member.update(...);
 *     await writeAuditLog(tx, { actorAdminId, action: "member.update", targetType: "Member", targetId: updated.id, beforeData, afterData: updated });
 *   });
 */
export async function writeAuditLog(client: AuditClient, input: WriteAuditLogInput) {
  return client.auditLog.create({
    data: {
      actorAdminId: input.actorAdminId ?? null,
      actorMemberId: input.actorMemberId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeData: input.beforeData ?? undefined,
      afterData: input.afterData ?? undefined,
      reason: input.reason ?? null,
    },
  });
}
