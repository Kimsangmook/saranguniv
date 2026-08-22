import { NextResponse } from "next/server";
import type { AttendanceRecord, Prisma } from "@prisma/client";
import { AttendanceStatus, MeetingType, RecordSettlementStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { requireAdminApi } from "@/lib/auth";
import { getActivePolicy } from "@/lib/policy";
import { prisma } from "@/lib/prisma";
import { getSeoulDateKey } from "@/lib/seoul-time";
import { calculateWithRates, dbDateToKey, getStandardTimeForDate } from "@/lib/settlement";

const SETTLED_MESSAGE = "확정된 정산에 포함된 기록은 수정할 수 없습니다.";

function serializeRecord(record: AttendanceRecord): Prisma.InputJsonValue {
  return {
    id: record.id,
    memberId: record.memberId,
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
  };
}

class ConflictError extends Error {}

/** "HH:MM" → 자정 기준 분. 형식이 올바르지 않으면 null */
function timeLabelToMinutes(label: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

/**
 * 출결 기록 수정 (미정산 기록만)
 * PATCH /api/admin/late-records/[id]
 * body: { arrivedAt?(ISO), standardTime?("HH:MM", 토요일 전용), status?, note?, reason(필수) }
 * 토요일 기록은 도착·기준 시각 변경 시 해당 기록(row)의 기준 시각으로 지각 분·금액을 재계산한다.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ message: "수정 사유를 입력해주세요." }, { status: 400 });
  }

  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) {
    return NextResponse.json({ message: "출결 기록을 찾을 수 없습니다." }, { status: 404 });
  }
  if (record.settlementStatus !== RecordSettlementStatus.UNSETTLED) {
    return NextResponse.json({ message: SETTLED_MESSAGE }, { status: 409 });
  }

  const data: Prisma.AttendanceRecordUpdateInput = {
    updatedByAdmin: { connect: { id: session.adminId } },
  };

  // 상태 변경
  let nextStatus = record.status;
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !Object.values(AttendanceStatus).includes(body.status as AttendanceStatus)
    ) {
      return NextResponse.json({ message: "출결 상태가 올바르지 않습니다." }, { status: 400 });
    }
    nextStatus = body.status as AttendanceStatus;
    if (record.meetingType === MeetingType.SATURDAY && nextStatus !== AttendanceStatus.LATE) {
      return NextResponse.json(
        { message: "토요일 기록은 지각 상태만 사용할 수 있습니다." },
        { status: 400 },
      );
    }
    data.status = nextStatus;
  }

  // 기준 시각 변경 (토요일 전용, "HH:MM" 서울 기준 → 기록 날짜의 timestamp로 저장)
  let nextStandardTime = record.standardTime;
  let standardTimeChanged = false;
  if (body.standardTime !== undefined) {
    if (record.meetingType !== MeetingType.SATURDAY) {
      return NextResponse.json(
        { message: "기준 시각은 토요일 기록에서만 수정할 수 있습니다." },
        { status: 400 },
      );
    }
    if (typeof body.standardTime !== "string") {
      return NextResponse.json({ message: "기준 시각이 올바르지 않습니다." }, { status: 400 });
    }
    const minutes = timeLabelToMinutes(body.standardTime);
    if (minutes === null) {
      return NextResponse.json(
        { message: "기준 시각은 HH:MM 형식으로 입력해주세요." },
        { status: 400 },
      );
    }
    nextStandardTime = getStandardTimeForDate(record.attendanceDate, minutes);
    standardTimeChanged =
      record.standardTime === null ||
      nextStandardTime.getTime() !== record.standardTime.getTime();
  }

  // 도착 시각 변경
  let nextArrivedAt = record.arrivedAt;
  let arrivedAtChanged = false;
  if (body.arrivedAt !== undefined) {
    if (typeof body.arrivedAt !== "string") {
      return NextResponse.json({ message: "도착 시각이 올바르지 않습니다." }, { status: 400 });
    }
    const arrivedAt = new Date(body.arrivedAt);
    if (Number.isNaN(arrivedAt.getTime())) {
      return NextResponse.json({ message: "도착 시각이 올바르지 않습니다." }, { status: 400 });
    }

    // 도착 시각은 기록 날짜(서울 기준)와 같은 날이어야 한다. (토·일 공통)
    const recordDateKey = dbDateToKey(record.attendanceDate);
    if (getSeoulDateKey(arrivedAt) !== recordDateKey) {
      return NextResponse.json(
        { message: `도착 시각은 기록 날짜(${recordDateKey})와 같은 날이어야 합니다.` },
        { status: 400 },
      );
    }
    nextArrivedAt = arrivedAt;
    arrivedAtChanged = true;
  }

  if (record.meetingType === MeetingType.SATURDAY) {
    if (arrivedAtChanged || standardTimeChanged) {
      // 토요일: 이 기록(row)의 기준 시각으로 지각 분·금액 서버 재계산
      // (기준 시각이 저장돼 있지 않은 과거 기록은 활성 정책의 기준 시각으로 보완)
      const policy = await getActivePolicy();
      const standardTime =
        nextStandardTime ??
        getStandardTimeForDate(record.attendanceDate, policy.saturdayStartMinutes);
      if (!nextArrivedAt) {
        return NextResponse.json(
          { message: "도착 시각이 없는 토요일 기록은 기준 시각을 재계산할 수 없습니다." },
          { status: 400 },
        );
      }
      const lateMinutes = Math.floor(
        (nextArrivedAt.getTime() - standardTime.getTime()) / 60_000,
      );
      if (lateMinutes <= 0) {
        return NextResponse.json(
          {
            message:
              "도착 시각이 기준 시각보다 빠르거나 같아 지각이 아닙니다. 지각이 아니라면 기록을 무효화해주세요.",
          },
          { status: 400 },
        );
      }
      data.arrivedAt = nextArrivedAt;
      data.standardTime = standardTime;
      data.lateMinutes = lateMinutes;
      data.calculatedAmount = calculateWithRates(lateMinutes, policy.saturdayRates);
    }
  } else if (arrivedAtChanged) {
    data.arrivedAt = nextArrivedAt;
  }

  // 일요일: 상태 변경 시 활성 정책 금액으로 재계산
  if (record.meetingType === MeetingType.SUNDAY && nextStatus !== record.status) {
    const policy = await getActivePolicy();
    data.calculatedAmount =
      nextStatus === AttendanceStatus.ABSENT ? policy.sundayAbsentAmount : policy.sundayLateAmount;
  }

  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") {
      return NextResponse.json({ message: "메모가 올바르지 않습니다." }, { status: 400 });
    }
    data.note = body.note === null || body.note === "" ? null : body.note;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // 경합 방지: 미정산 상태일 때만 수정
      const guard = await tx.attendanceRecord.updateMany({
        where: { id, settlementStatus: RecordSettlementStatus.UNSETTLED },
        data: { updatedByAdminId: session.adminId },
      });
      if (guard.count === 0) throw new ConflictError(SETTLED_MESSAGE);

      const next = await tx.attendanceRecord.update({ where: { id }, data });

      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "attendance.update",
        targetType: "AttendanceRecord",
        targetId: id,
        beforeData: serializeRecord(record),
        afterData: serializeRecord(next),
        reason,
      });

      return next;
    });

    return NextResponse.json({ record: serializeRecord(updated) });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    throw error;
  }
}

/**
 * 출결 기록 무효화 (미정산 기록만, 삭제 전 전체 데이터를 감사 로그로 보존)
 * DELETE /api/admin/late-records/[id]
 * body: { reason(필수) }
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ message: "무효화 사유를 입력해주세요." }, { status: 400 });
  }

  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record) {
    return NextResponse.json({ message: "출결 기록을 찾을 수 없습니다." }, { status: 404 });
  }
  if (record.settlementStatus !== RecordSettlementStatus.UNSETTLED) {
    return NextResponse.json({ message: SETTLED_MESSAGE }, { status: 409 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 삭제 전 레코드 전체를 감사 로그 beforeData로 보존
      await writeAuditLog(tx, {
        actorAdminId: session.adminId,
        action: "attendance.void",
        targetType: "AttendanceRecord",
        targetId: id,
        beforeData: serializeRecord(record),
        reason,
      });

      // 경합 방지: 미정산 상태일 때만 삭제
      const deleted = await tx.attendanceRecord.deleteMany({
        where: { id, settlementStatus: RecordSettlementStatus.UNSETTLED },
      });
      if (deleted.count === 0) throw new ConflictError(SETTLED_MESSAGE);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    throw error;
  }
}
