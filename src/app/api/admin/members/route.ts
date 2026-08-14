import { NextResponse } from "next/server";
import { MemberStatus, Prisma } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate, getSeoulAttendanceDate } from "@/lib/seoul-time";

const MEMBER_STATUSES = Object.values(MemberStatus);
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isMemberStatus(value: string): value is MemberStatus {
  return (MEMBER_STATUSES as string[]).includes(value);
}

export async function GET(request: Request) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? "";

  const where: Prisma.MemberWhereInput = {};
  if (q) where.name = { contains: q };
  if (status && isMemberStatus(status)) where.status = status;

  const members = await prisma.member.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      part: true,
      contact: true,
      status: true,
      joinedAt: true,
      publicDisplayName: true,
    },
  });

  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let body: {
    name?: string;
    part?: string;
    contact?: string;
    joinedAt?: string;
    publicDisplayName?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ message: "이름을 입력해주세요." }, { status: 400 });
  }

  const joinedAtKey = body.joinedAt?.trim();
  if (joinedAtKey && !DATE_KEY_REGEX.test(joinedAtKey)) {
    return NextResponse.json({ message: "가입일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.member.create({
        data: {
          name,
          part: body.part?.trim() || null,
          contact: body.contact?.trim() || null,
          // 가입일 미입력 시 서울 기준 오늘 날짜를 기본값으로 사용
          joinedAt: joinedAtKey ? dateKeyToDbDate(joinedAtKey) : getSeoulAttendanceDate(),
          publicDisplayName: body.publicDisplayName?.trim() || null,
          note: body.note?.trim() || null,
        },
      });

      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "member.create",
        targetType: "Member",
        targetId: created.id,
        afterData: {
          name: created.name,
          part: created.part,
          contact: created.contact,
          status: created.status,
          joinedAt: created.joinedAt.toISOString(),
          publicDisplayName: created.publicDisplayName,
          note: created.note,
        },
      });

      return created;
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "이미 등록된 연락처입니다." }, { status: 409 });
    }
    throw error;
  }
}
