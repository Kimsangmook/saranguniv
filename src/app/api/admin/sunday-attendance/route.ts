import { NextResponse } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import { requireAdminApi } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getActivePolicy } from "@/lib/policy";
import { prisma } from "@/lib/prisma";
import { dateKeyToDbDate, getDayOfWeekFromDateKey } from "@/lib/seoul-time";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateSundayKey(dateKey: string | null | undefined): NextResponse | null {
  if (!dateKey || !DATE_KEY_REGEX.test(dateKey)) {
    return NextResponse.json({ message: "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)" }, { status: 400 });
  }
  if (getDayOfWeekFromDateKey(dateKey) !== 0) {
    return NextResponse.json({ message: "일요일 날짜만 선택할 수 있습니다." }, { status: 422 });
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const dateKey = searchParams.get("date");
  const invalid = validateSundayKey(dateKey);
  if (invalid) return invalid;

  const attendanceDate = dateKeyToDbDate(dateKey!);

  const [members, records, approvedExcuses, policy] = await Promise.all([
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, part: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { attendanceDate, meetingType: "SUNDAY" },
      select: {
        id: true,
        memberId: true,
        status: true,
        note: true,
        calculatedAmount: true,
        settlementStatus: true,
      },
    }),
    prisma.excuseRequest.findMany({
      where: { targetDate: attendanceDate, status: "APPROVED" },
      select: { memberId: true },
    }),
    getActivePolicy(),
  ]);

  return NextResponse.json({
    members,
    records,
    approvedExcuseMemberIds: approvedExcuses.map((excuse) => excuse.memberId),
    policy: {
      sundayLateAmount: policy.sundayLateAmount,
      sundayAbsentAmount: policy.sundayAbsentAmount,
    },
  });
}

type EntryInput = { memberId?: string; status?: string; note?: string };

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  let body: { date?: string; entries?: EntryInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const invalid = validateSundayKey(body.date);
  if (invalid) return invalid;

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ message: "저장할 출결 내역이 없습니다." }, { status: 400 });
  }
  for (const entry of body.entries) {
    if (
      !entry ||
      typeof entry.memberId !== "string" ||
      !["NONE", "LATE", "ABSENT"].includes(entry.status ?? "")
    ) {
      return NextResponse.json({ message: "출결 항목 형식이 올바르지 않습니다." }, { status: 400 });
    }
  }

  // memberId 중복 제거 (같은 팀원이 여러 번 오면 마지막 항목만 반영)
  const entryByMemberId = new Map<string, EntryInput>();
  for (const entry of body.entries) {
    entryByMemberId.set(entry.memberId!, entry);
  }
  const entries = [...entryByMemberId.values()];

  const attendanceDate = dateKeyToDbDate(body.date!);
  const policy = await getActivePolicy();

  const result = await prisma.$transaction(async (tx) => {
    const [activeMembers, existingRecords, approvedExcuses] = await Promise.all([
      tx.member.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
      tx.attendanceRecord.findMany({ where: { attendanceDate, meetingType: "SUNDAY" } }),
      tx.excuseRequest.findMany({
        where: { targetDate: attendanceDate, status: "APPROVED" },
        select: { memberId: true },
      }),
    ]);

    const memberNameById = new Map(activeMembers.map((member) => [member.id, member.name]));
    const recordByMemberId = new Map(existingRecords.map((record) => [record.memberId, record]));
    const approvedMemberIds = new Set(approvedExcuses.map((excuse) => excuse.memberId));

    let saved = 0;
    let deleted = 0;
    const skipped: { memberId: string; name: string | null; reason: string }[] = [];

    for (const entry of entries) {
      const memberId = entry.memberId!;
      const status = entry.status as "NONE" | "LATE" | "ABSENT";
      const memberName = memberNameById.get(memberId) ?? null;

      if (!memberName) {
        skipped.push({ memberId, name: null, reason: "현역 팀원이 아닙니다." });
        continue;
      }

      // 승인된 사유가 있는 팀원은 부과하지 않는다 (기획서 8.3 / 9.5)
      if (approvedMemberIds.has(memberId)) {
        if (status !== "NONE") {
          skipped.push({ memberId, name: memberName, reason: "승인된 사유가 있어 저장하지 않았습니다." });
        }
        continue;
      }

      const existing = recordByMemberId.get(memberId);
      // note를 보내지 않으면 기존 메모를 유지한다 (일요일 출결 화면에는 메모 입력이 없다).
      const note = entry.note === undefined ? existing?.note ?? null : entry.note.trim() || null;

      // 정산에 포함된 기록은 수정/삭제 불가
      if (existing && existing.settlementStatus !== "UNSETTLED") {
        skipped.push({ memberId, name: memberName, reason: "정산이 확정된 기록은 수정할 수 없습니다." });
        continue;
      }

      if (status === "NONE") {
        if (existing) {
          await tx.attendanceRecord.delete({ where: { id: existing.id } });
          await writeAuditLog(tx, {
            actorAdminId: session.adminId,
            action: "attendance.sunday.delete",
            targetType: "AttendanceRecord",
            targetId: existing.id,
            beforeData: {
              memberId: existing.memberId,
              attendanceDate: body.date!,
              meetingType: existing.meetingType,
              status: existing.status,
              calculatedAmount: existing.calculatedAmount,
              settlementStatus: existing.settlementStatus,
              note: existing.note,
            },
          });
          deleted += 1;
        }
        continue;
      }

      const attendanceStatus: AttendanceStatus = status;
      const calculatedAmount =
        attendanceStatus === "LATE" ? policy.sundayLateAmount : policy.sundayAbsentAmount;

      if (existing) {
        const changed =
          existing.status !== attendanceStatus ||
          existing.note !== note ||
          existing.calculatedAmount !== calculatedAmount;
        if (!changed) continue;
      }

      // upsert로 create/update 분기의 P2002 경합 여지를 제거한다.
      const upserted = await tx.attendanceRecord.upsert({
        where: {
          memberId_attendanceDate_meetingType: {
            memberId,
            attendanceDate,
            meetingType: "SUNDAY",
          },
        },
        update: {
          status: attendanceStatus,
          calculatedAmount,
          note,
          method: "ADMIN_MANUAL",
          updatedByAdminId: session.adminId,
        },
        create: {
          memberId,
          attendanceDate,
          meetingType: "SUNDAY",
          status: attendanceStatus,
          method: "ADMIN_MANUAL",
          calculatedAmount,
          note,
          createdByAdminId: session.adminId,
          updatedByAdminId: session.adminId,
        },
      });
      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "attendance.sunday.save",
        targetType: "AttendanceRecord",
        targetId: upserted.id,
        beforeData: existing
          ? {
              status: existing.status,
              calculatedAmount: existing.calculatedAmount,
              note: existing.note,
            }
          : undefined,
        afterData: {
          memberId,
          attendanceDate: body.date!,
          meetingType: "SUNDAY",
          status: upserted.status,
          calculatedAmount: upserted.calculatedAmount,
          note: upserted.note,
        },
      });
      saved += 1;
    }

    return { saved, deleted, skipped };
  });

  return NextResponse.json(result);
}
