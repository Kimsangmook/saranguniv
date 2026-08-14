import { NextResponse } from "next/server";
import { MeetingType, PaymentStatus } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth";
import { DAY_OF_WEEK_LABELS } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import {
  buildKakaoNotice,
  dbDateToKey,
  formatSeoulHourMinute,
  type KakaoNoticeGroup,
} from "@/lib/settlement";

type MemberRow = {
  memberId: string;
  memberName: string;
  saturdayAmount: number;
  sundayLateAmount: number;
  sundayAbsentAmount: number;
  totalAmount: number;
  recordCount: number;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
};

/** "2026-03-28" → "2026.03.28" */
function toDotDate(key: string): string {
  return key.replaceAll("-", ".");
}

/** "2026-03-28" → "3.28" */
function toShortDate(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(month)}.${day}`;
}

/**
 * 정산 상세 (사람별 집계 + 카카오 공지 문구)
 * GET /api/admin/settlements/[id]
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi({ role: "ADMIN" });
  if ("error" in auth) return auth.error;
  const { session } = auth;
  void session;

  const { id } = await params;
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          member: { select: { id: true, name: true, status: true } },
          attendanceRecord: true,
        },
      },
    },
  });
  if (!settlement) {
    return NextResponse.json({ message: "정산을 찾을 수 없습니다." }, { status: 404 });
  }

  // 사람별 집계 (토/일 소계 포함)
  const memberMap = new Map<string, MemberRow>();
  for (const item of settlement.items) {
    const row = memberMap.get(item.memberId) ?? {
      memberId: item.memberId,
      memberName: item.member.name,
      saturdayAmount: 0,
      sundayLateAmount: 0,
      sundayAbsentAmount: 0,
      totalAmount: 0,
      recordCount: 0,
      paymentStatus: PaymentStatus.PAID,
      paidAt: null,
    };
    if (item.meetingType === MeetingType.SATURDAY) {
      row.saturdayAmount += item.amount;
    } else if (item.attendanceStatus === "ABSENT") {
      row.sundayAbsentAmount += item.amount;
    } else {
      row.sundayLateAmount += item.amount;
    }
    row.totalAmount += item.amount;
    row.recordCount += 1;
    if (item.paymentStatus !== PaymentStatus.PAID) {
      row.paymentStatus = PaymentStatus.UNPAID;
    } else if (item.paidAt) {
      const iso = item.paidAt.toISOString();
      if (!row.paidAt || iso > row.paidAt) row.paidAt = iso;
    }
    memberMap.set(item.memberId, row);
  }
  const perMember = [...memberMap.values()].sort((a, b) =>
    a.memberName.localeCompare(b.memberName, "ko"),
  );

  const totals = {
    saturdayAmount: perMember.reduce((s, m) => s + m.saturdayAmount, 0),
    sundayLateAmount: perMember.reduce((s, m) => s + m.sundayLateAmount, 0),
    sundayAbsentAmount: perMember.reduce((s, m) => s + m.sundayAbsentAmount, 0),
    totalAmount: perMember.reduce((s, m) => s + m.totalAmount, 0),
    paidAmount: perMember
      .filter((m) => m.paymentStatus === PaymentStatus.PAID)
      .reduce((s, m) => s + m.totalAmount, 0),
  };
  const allPaid =
    settlement.items.length > 0 &&
    settlement.items.every((item) => item.paymentStatus === PaymentStatus.PAID);

  // 카카오 공지: 날짜별 그룹 구성 (0원 제외는 buildKakaoNotice에서 처리)
  const sortedItems = [...settlement.items].sort((a, b) => {
    const dateA = a.attendanceRecord.attendanceDate.getTime();
    const dateB = b.attendanceRecord.attendanceDate.getTime();
    if (dateA !== dateB) return dateA - dateB;
    const arrivedA = a.attendanceRecord.arrivedAt?.getTime() ?? 0;
    const arrivedB = b.attendanceRecord.arrivedAt?.getTime() ?? 0;
    return arrivedA - arrivedB;
  });

  const groupMap = new Map<string, KakaoNoticeGroup>();
  for (const item of sortedItems) {
    const record = item.attendanceRecord;
    const dateKey = dbDateToKey(record.attendanceDate);
    const group = groupMap.get(dateKey) ?? {
      dateLabel: toShortDate(dateKey),
      dayLabel: DAY_OF_WEEK_LABELS[record.attendanceDate.getUTCDay()],
      saturdayEntries: [],
      sundayEntries: [],
    };
    if (item.meetingType === MeetingType.SATURDAY) {
      const detail =
        typeof item.calculationDetail === "object" && item.calculationDetail !== null
          ? (item.calculationDetail as { lateMinutes?: number })
          : {};
      group.saturdayEntries.push({
        arrivalLabel: record.arrivedAt ? formatSeoulHourMinute(record.arrivedAt) : "-",
        lateMinutes: detail.lateMinutes ?? record.lateMinutes ?? 0,
        name: item.member.name,
        amount: item.amount,
      });
    } else {
      group.sundayEntries.push({ name: item.member.name, amount: item.amount });
    }
    groupMap.set(dateKey, group);
  }

  const startKey = dbDateToKey(settlement.startDate);
  const endKey = dbDateToKey(settlement.endDate);
  const notice = buildKakaoNotice(
    "찬양팀 지각비 정산 안내",
    `${toDotDate(startKey)} ~ ${toDotDate(endKey)}`,
    [...groupMap.values()],
  );

  return NextResponse.json({
    settlement: {
      id: settlement.id,
      name: settlement.name,
      startDate: startKey,
      endDate: endKey,
      status: settlement.status,
      totalAmount: settlement.totalAmount,
      policySnapshot: settlement.policySnapshot,
      confirmedAt: settlement.confirmedAt.toISOString(),
      completedAt: settlement.completedAt?.toISOString() ?? null,
    },
    items: settlement.items.map((item) => ({
      id: item.id,
      memberId: item.memberId,
      memberName: item.member.name,
      attendanceRecordId: item.attendanceRecordId,
      attendanceDate: dbDateToKey(item.attendanceRecord.attendanceDate),
      meetingType: item.meetingType,
      attendanceStatus: item.attendanceStatus,
      arrivedAt: item.attendanceRecord.arrivedAt?.toISOString() ?? null,
      calculationDetail: item.calculationDetail,
      amount: item.amount,
      paymentStatus: item.paymentStatus,
      paidAt: item.paidAt?.toISOString() ?? null,
    })),
    perMember,
    totals: {
      ...totals,
      unpaidAmount: totals.totalAmount - totals.paidAmount,
    },
    allPaid,
    notice,
  });
}
