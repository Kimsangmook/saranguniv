import { NextResponse } from "next/server";
import { ExcuseStatus, Prisma } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate } from "@/lib/seoul-time";

const EXCUSE_STATUSES = Object.values(ExcuseStatus);
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isExcuseStatus(value: string): value is ExcuseStatus {
  return (EXCUSE_STATUSES as string[]).includes(value);
}

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const q = searchParams.get("q")?.trim() ?? "";

  const where: Prisma.ExcuseRequestWhereInput = {};
  if (status && isExcuseStatus(status)) where.status = status;

  const targetDate: Prisma.DateTimeFilter = {};
  if (DATE_KEY_REGEX.test(from)) targetDate.gte = dateKeyToDbDate(from);
  if (DATE_KEY_REGEX.test(to)) targetDate.lte = dateKeyToDbDate(to);
  if (targetDate.gte || targetDate.lte) where.targetDate = targetDate;

  if (q) where.member = { name: { contains: q } };

  const requests = await prisma.excuseRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetDate: true,
      type: true,
      reason: true,
      expectedArrivalAt: true,
      status: true,
      rejectionReason: true,
      reviewedAt: true,
      createdAt: true,
      member: { select: { id: true, name: true, part: true } },
      reviewedByAdmin: { select: { loginId: true } },
    },
  });

  return NextResponse.json({ requests });
}
