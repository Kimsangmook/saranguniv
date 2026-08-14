import { NextResponse } from "next/server";
import { ExcuseStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";

  if (action !== "cancel") {
    return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  }
  if (!memberId) {
    return NextResponse.json({ error: "본인을 선택해주세요." }, { status: 400 });
  }

  const excuse = await prisma.excuseRequest.findUnique({ where: { id } });
  if (!excuse) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  }
  if (excuse.memberId !== memberId) {
    return NextResponse.json({ error: "본인의 신청만 취소할 수 있습니다." }, { status: 403 });
  }
  if (excuse.status !== ExcuseStatus.PENDING) {
    return NextResponse.json({ error: "이미 처리된 신청은 취소할 수 없습니다." }, { status: 409 });
  }

  // 동시 처리(관리자 승인 등)와의 경합 방지: PENDING 상태일 때만 갱신 + 감사 로그
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.excuseRequest.updateMany({
      where: { id, memberId, status: ExcuseStatus.PENDING },
      data: { status: ExcuseStatus.CANCELED },
    });
    if (updated.count === 0) return null;

    await writeAuditLog(tx, {
      actorMemberId: memberId,
      action: "excuse.cancel",
      targetType: "ExcuseRequest",
      targetId: id,
      beforeData: {
        status: excuse.status,
        type: excuse.type,
        targetDate: excuse.targetDate.toISOString().slice(0, 10),
        reason: excuse.reason,
      },
      afterData: { status: ExcuseStatus.CANCELED },
    });

    return updated;
  });
  if (!result) {
    return NextResponse.json({ error: "이미 처리된 신청은 취소할 수 없습니다." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: ExcuseStatus.CANCELED });
}
