import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

class ExcuseProcessError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await context.params;

  let body: { action?: string; rejectionReason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ message: "처리 유형이 올바르지 않습니다." }, { status: 400 });
  }

  const rejectionReason = body.rejectionReason?.trim() ?? "";
  if (action === "reject" && !rejectionReason) {
    return NextResponse.json({ message: "반려 사유를 입력해주세요." }, { status: 400 });
  }

  const excuse = await prisma.excuseRequest.findUnique({ where: { id } });
  if (!excuse) {
    return NextResponse.json({ message: "사유 신청을 찾을 수 없습니다." }, { status: 404 });
  }
  if (excuse.status !== "PENDING") {
    return NextResponse.json({ message: "이미 처리된 신청입니다." }, { status: 409 });
  }

  // check-then-act 경합 방지: 검사·전이·감사 로그를 하나의 트랜잭션으로 묶는다.
  try {
    const { updated, existingRecordWarning } = await prisma.$transaction(async (tx) => {
      // ① 승인 시: 해당 날짜·팀원의 출결 기록이 정산에 포함되어 있으면 처리 불가 (기획서 9.5)
      let warning: { id: string; status: string; calculatedAmount: number } | null = null;
      if (action === "approve") {
        const recordsOnDate = await tx.attendanceRecord.findMany({
          where: { memberId: excuse.memberId, attendanceDate: excuse.targetDate },
          select: { id: true, status: true, calculatedAmount: true, settlementStatus: true },
        });
        if (recordsOnDate.some((record) => record.settlementStatus !== "UNSETTLED")) {
          throw new ExcuseProcessError(409, "정산이 확정된 날짜의 사유는 처리할 수 없습니다.");
        }
        const unsettled = recordsOnDate.find((record) => record.settlementStatus === "UNSETTLED");
        if (unsettled) {
          // 삭제하지 않고 그대로 둔다. 관리자가 출결 기록 화면에서 직접 판단한다.
          warning = {
            id: unsettled.id,
            status: unsettled.status,
            calculatedAmount: unsettled.calculatedAmount,
          };
        }
      }

      // ② PENDING 상태일 때만 원자적으로 전이 (동시 처리·취소와의 경합 차단)
      const transitioned = await tx.excuseRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: action === "approve" ? "APPROVED" : "REJECTED",
          rejectionReason: action === "reject" ? rejectionReason : null,
          reviewedByAdminId: session.adminId,
          reviewedAt: new Date(),
        },
      });
      if (transitioned.count !== 1) {
        throw new ExcuseProcessError(409, "이미 처리된 신청입니다.");
      }

      const next = await tx.excuseRequest.findUniqueOrThrow({ where: { id } });

      // ③ 감사 로그
      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: action === "approve" ? "excuse.approve" : "excuse.reject",
        targetType: "ExcuseRequest",
        targetId: id,
        beforeData: {
          status: excuse.status,
          rejectionReason: excuse.rejectionReason,
          reviewedByAdminId: excuse.reviewedByAdminId,
          reviewedAt: excuse.reviewedAt?.toISOString() ?? null,
        },
        afterData: {
          status: next.status,
          rejectionReason: next.rejectionReason,
          reviewedByAdminId: next.reviewedByAdminId,
          reviewedAt: next.reviewedAt?.toISOString() ?? null,
        },
        reason: action === "reject" ? rejectionReason : null,
      });

      return { updated: next, existingRecordWarning: warning };
    });

    return NextResponse.json({ request: updated, existingRecord: existingRecordWarning });
  } catch (error) {
    if (error instanceof ExcuseProcessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
