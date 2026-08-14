import { NextResponse } from "next/server";
import { AttendanceStatus, MemberStatus, MeetingType, Prisma, RecordMethod } from "@prisma/client";
import { calculateSaturdayLateFee } from "@/lib/late-fee";
import { prisma } from "@/lib/prisma";
import { getSeoulDateKey, getSeoulSaturdayStandardTime, getSeoulTimeLabel } from "@/lib/seoul-time";

function getSeoulAttendanceDate(date: Date): Date {
  return new Date(`${getSeoulDateKey(date)}T00:00:00.000Z`);
}

function isSeoulSaturday(date: Date): boolean {
  return getSeoulAttendanceDate(date).getUTCDay() === 6;
}

function toRecordResponse(created: boolean, memberName: string, record: { status: AttendanceStatus; arrivedAt: Date | null; lateMinutes: number | null; calculatedAmount: number }) {
  return {
    created,
    member: { name: memberName },
    status: record.status,
    arrivedAt: record.arrivedAt,
    arrivedAtLabel: record.arrivedAt ? getSeoulTimeLabel(record.arrivedAt) : null,
    lateMinutes: record.lateMinutes,
    amount: record.calculatedAmount,
  };
}

export async function GET() {
  const attendanceDate = getSeoulAttendanceDate(new Date());
  const [members, todayRecords] = await Promise.all([
    prisma.member.findMany({
      where: { status: MemberStatus.ACTIVE },
      select: { id: true, name: true, part: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.attendanceRecord.findMany({
      where: { attendanceDate, meetingType: MeetingType.SATURDAY },
      select: { memberId: true },
    }),
  ]);
  return NextResponse.json({ members, recordedMemberIds: todayRecords.map((record) => record.memberId) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  if (!memberId) {
    return NextResponse.json({ error: "본인을 선택해주세요." }, { status: 400 });
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.status !== MemberStatus.ACTIVE) {
    return NextResponse.json({ error: "기록할 수 없는 팀원입니다." }, { status: 403 });
  }

  const arrivedAt = new Date();
  if (!isSeoulSaturday(arrivedAt)) {
    return NextResponse.json({ error: "토요일 모임 시간에만 지각을 기록할 수 있습니다." }, { status: 422 });
  }

  const standardTime = getSeoulSaturdayStandardTime(arrivedAt);
  const attendanceDate = getSeoulAttendanceDate(arrivedAt);
  const lateMinutes = Math.max(0, Math.floor((arrivedAt.getTime() - standardTime.getTime()) / 60_000));

  if (lateMinutes <= 0) {
    return NextResponse.json({ error: "지각 기록은 모임 시작 시각 이후에만 남길 수 있습니다." }, { status: 422 });
  }

  const uniqueWhere = {
    memberId_attendanceDate_meetingType: { memberId: member.id, attendanceDate, meetingType: MeetingType.SATURDAY },
  };

  const existing = await prisma.attendanceRecord.findUnique({ where: uniqueWhere });
  if (existing) {
    return NextResponse.json(toRecordResponse(false, member.name, existing));
  }

  try {
    const record = await prisma.attendanceRecord.create({
      data: {
        memberId: member.id,
        attendanceDate,
        meetingType: MeetingType.SATURDAY,
        status: "LATE",
        standardTime,
        arrivedAt,
        lateMinutes,
        method: RecordMethod.QR,
        calculatedAmount: calculateSaturdayLateFee(lateMinutes),
      },
    });
    return NextResponse.json(toRecordResponse(true, member.name, record));
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.attendanceRecord.findUnique({ where: uniqueWhere });
      if (raced) {
        return NextResponse.json(toRecordResponse(false, member.name, raced));
      }
      return NextResponse.json({ error: "이미 오늘의 지각 기록이 처리되었습니다. 새로고침해주세요." }, { status: 409 });
    }
    throw error;
  }
}
