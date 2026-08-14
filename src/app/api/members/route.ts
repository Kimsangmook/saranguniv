import { NextResponse } from "next/server";
import { MemberStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// 공개용 현역 팀원 목록 (id/name/part 외 개인정보는 절대 노출하지 않는다)
export async function GET() {
  const members = await prisma.member.findMany({
    where: { status: MemberStatus.ACTIVE },
    select: { id: true, name: true, part: true },
    orderBy: [{ name: "asc" }],
  });
  return NextResponse.json({ members });
}
