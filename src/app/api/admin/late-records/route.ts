import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AttendanceStatus, MeetingType, MemberStatus, RecordSettlementStatus } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate } from "@/lib/seoul-time";
import { dbDateToKey } from "@/lib/settlement";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isEnumValue<T extends Record<string, string>>(
  enumObject: T,
  value: string,
): value is T[keyof T] {
  return Object.values(enumObject).includes(value);
}

/**
 * 통합 출결 기록 목록
 * GET /api/admin/late-records?from=&to=&meetingType=&status=&settlementStatus=&q=&memberStatus=
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { session } = auth;
  void session;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const meetingType = searchParams.get("meetingType") ?? "";
  const status = searchParams.get("status") ?? "";
  const settlementStatus = searchParams.get("settlementStatus") ?? "";
  const q = (searchParams.get("q") ?? "").trim();
  const memberStatus = searchParams.get("memberStatus") ?? "";

  const where: Prisma.AttendanceRecordWhereInput = {};

  const dateFilter: Prisma.DateTimeFilter = {};
  if (from) {
    if (!DATE_KEY_REGEX.test(from)) {
      return NextResponse.json({ message: "시작일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    dateFilter.gte = dateKeyToDbDate(from);
  }
  if (to) {
    if (!DATE_KEY_REGEX.test(to)) {
      return NextResponse.json({ message: "종료일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    dateFilter.lte = dateKeyToDbDate(to);
  }
  if (dateFilter.gte || dateFilter.lte) where.attendanceDate = dateFilter;

  if (meetingType) {
    if (!isEnumValue(MeetingType, meetingType)) {
      return NextResponse.json({ message: "모임 유형이 올바르지 않습니다." }, { status: 400 });
    }
    where.meetingType = meetingType;
  }
  if (status) {
    if (!isEnumValue(AttendanceStatus, status)) {
      return NextResponse.json({ message: "출결 상태가 올바르지 않습니다." }, { status: 400 });
    }
    where.status = status;
  }
  if (settlementStatus) {
    if (!isEnumValue(RecordSettlementStatus, settlementStatus)) {
      return NextResponse.json({ message: "정산 상태가 올바르지 않습니다." }, { status: 400 });
    }
    where.settlementStatus = settlementStatus;
  }

  const memberWhere: Prisma.MemberWhereInput = {};
  if (q) memberWhere.name = { contains: q };
  if (memberStatus) {
    if (!isEnumValue(MemberStatus, memberStatus)) {
      return NextResponse.json({ message: "활동 상태가 올바르지 않습니다." }, { status: 400 });
    }
    memberWhere.status = memberStatus;
  }
  if (Object.keys(memberWhere).length > 0) where.member = memberWhere;

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: { member: { select: { id: true, name: true, status: true, part: true } } },
    orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    records: records.map((record) => ({
      id: record.id,
      attendanceDate: dbDateToKey(record.attendanceDate),
      meetingType: record.meetingType,
      status: record.status,
      standardTime: record.standardTime?.toISOString() ?? null,
      arrivedAt: record.arrivedAt?.toISOString() ?? null,
      lateMinutes: record.lateMinutes,
      method: record.method,
      calculatedAmount: record.calculatedAmount,
      settlementStatus: record.settlementStatus,
      note: record.note,
      member: record.member,
    })),
  });
}
