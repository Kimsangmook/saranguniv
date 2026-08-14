import { NextResponse } from "next/server";
import { MemberStatus, Prisma } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate } from "@/lib/seoul-time";

const MEMBER_STATUSES = Object.values(MemberStatus);
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isMemberStatus(value: string): value is MemberStatus {
  return (MEMBER_STATUSES as string[]).includes(value);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      attendanceRecords: {
        orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          attendanceDate: true,
          meetingType: true,
          status: true,
          lateMinutes: true,
          calculatedAmount: true,
          settlementStatus: true,
        },
      },
      excuseRequests: {
        orderBy: [{ targetDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          targetDate: true,
          type: true,
          status: true,
        },
      },
      settlementItems: {
        orderBy: { settlement: { startDate: "desc" } },
        select: {
          id: true,
          amount: true,
          paymentStatus: true,
          settlement: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ message: "팀원을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ member });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await context.params;

  let body: {
    name?: string;
    part?: string | null;
    contact?: string | null;
    joinedAt?: string;
    publicDisplayName?: string | null;
    note?: string | null;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const data: Prisma.MemberUpdateInput = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ message: "이름을 입력해주세요." }, { status: 400 });
    }
    data.name = name;
  }
  if (body.part !== undefined) data.part = body.part?.trim() || null;
  if (body.contact !== undefined) data.contact = body.contact?.trim() || null;
  if (body.publicDisplayName !== undefined) {
    data.publicDisplayName = body.publicDisplayName?.trim() || null;
  }
  if (body.note !== undefined) data.note = body.note?.trim() || null;
  if (body.joinedAt !== undefined) {
    const key = body.joinedAt.trim();
    if (!DATE_KEY_REGEX.test(key)) {
      return NextResponse.json({ message: "가입일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    data.joinedAt = dateKeyToDbDate(key);
  }
  if (body.status !== undefined) {
    if (!isMemberStatus(body.status)) {
      return NextResponse.json({ message: "활동 상태 값이 올바르지 않습니다." }, { status: 400 });
    }
    data.status = body.status;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "변경할 내용이 없습니다." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.member.findUnique({ where: { id } });
      if (!before) return null;

      const updated = await tx.member.update({ where: { id }, data });

      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "member.update",
        targetType: "Member",
        targetId: id,
        beforeData: {
          name: before.name,
          part: before.part,
          contact: before.contact,
          status: before.status,
          joinedAt: before.joinedAt.toISOString(),
          publicDisplayName: before.publicDisplayName,
          note: before.note,
        },
        afterData: {
          name: updated.name,
          part: updated.part,
          contact: updated.contact,
          status: updated.status,
          joinedAt: updated.joinedAt.toISOString(),
          publicDisplayName: updated.publicDisplayName,
          note: updated.note,
        },
      });

      return updated;
    });

    if (!result) {
      return NextResponse.json({ message: "팀원을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ member: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "이미 등록된 연락처입니다." }, { status: 409 });
    }
    throw error;
  }
}
