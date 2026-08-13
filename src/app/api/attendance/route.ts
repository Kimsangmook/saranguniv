import { NextRequest, NextResponse } from "next/server";
import { MemberStatus, MeetingType, RecordMethod } from "@prisma/client";
import { calculateSaturdayLateFee } from "@/lib/late-fee";
import { hashMemberDeviceToken, MEMBER_DEVICE_COOKIE } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";
import { getSeoulDateKey, getSeoulSaturdayStandardTime, getSeoulTimeLabel } from "@/lib/seoul-time";

async function getVerifiedMember(request: NextRequest) {
  const token = request.cookies.get(MEMBER_DEVICE_COOKIE)?.value;
  if (!token) return null;

  const device = await prisma.memberDevice.findUnique({
    where: { tokenHash: hashMemberDeviceToken(token) },
    include: { member: true },
  });
  if (!device || device.revokedAt || device.expiresAt <= new Date() || device.member.status !== MemberStatus.ACTIVE) {
    return null;
  }
  await prisma.memberDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return device.member;
}

export async function GET(request: NextRequest) {
  const member = await getVerifiedMember(request);
  if (!member) return NextResponse.json({ authenticated: false });

  const today = new Date(`${getSeoulDateKey()}T00:00:00.000Z`);
  const record = await prisma.attendanceRecord.findUnique({
    where: { memberId_attendanceDate_meetingType: { memberId: member.id, attendanceDate: today, meetingType: MeetingType.SATURDAY } },
  });
  return NextResponse.json({
    authenticated: true,
    member: { id: member.id, name: member.name },
    record: record && { arrivedAt: record.arrivedAt, lateMinutes: record.lateMinutes, amount: record.calculatedAmount },
  });
}

export async function POST(request: NextRequest) {
  const member = await getVerifiedMember(request);
  if (!member) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const arrivedAt = new Date();
  const standardTime = getSeoulSaturdayStandardTime(arrivedAt);
  const attendanceDate = new Date(`${getSeoulDateKey(arrivedAt)}T00:00:00.000Z`);
  const lateMinutes = Math.max(0, Math.floor((arrivedAt.getTime() - standardTime.getTime()) / 60_000));

  if (lateMinutes <= 0) {
    return NextResponse.json({ error: "지각 기록은 모임 시작 시각 이후에만 남길 수 있습니다." }, { status: 422 });
  }

  const existing = await prisma.attendanceRecord.findUnique({
    where: { memberId_attendanceDate_meetingType: { memberId: member.id, attendanceDate, meetingType: MeetingType.SATURDAY } },
  });
  if (existing) {
    return NextResponse.json({
      created: false,
      member: { name: member.name },
      arrivedAt: existing.arrivedAt,
      arrivedAtLabel: existing.arrivedAt ? getSeoulTimeLabel(existing.arrivedAt) : null,
      lateMinutes: existing.lateMinutes,
      amount: existing.calculatedAmount,
    });
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
    return NextResponse.json({
      created: true,
      member: { name: member.name },
      arrivedAt: record.arrivedAt,
      arrivedAtLabel: getSeoulTimeLabel(record.arrivedAt!),
      lateMinutes: record.lateMinutes,
      amount: record.calculatedAmount,
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "이미 오늘의 지각 기록이 처리되었습니다. 새로고침해주세요." }, { status: 409 });
    }
    throw error;
  }
}
