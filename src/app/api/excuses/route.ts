import { NextResponse } from "next/server";
import { ExcuseStatus, ExcuseType, MemberStatus, type ExcuseRequest } from "@prisma/client";
import { isExcusableDate } from "@/lib/excuse-rules";
import { dateKeyToDbDate, getSeoulDateKey, getSeoulTimeLabel } from "@/lib/seoul-time";
import { prisma } from "@/lib/prisma";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const REASON_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// 간단한 in-memory rate limit (memberId 기준 분당 5회)
// 주의: 서버리스/멀티 인스턴스 환경에서는 인스턴스마다 별도의 Map을 가지므로
// 완전한 보호는 아니다(인스턴스별 best-effort 제한). 필요 시 Redis 등으로 대체.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const submissionTimes = new Map<string, number[]>();

function isRateLimited(memberId: string): boolean {
  const now = Date.now();
  const recent = (submissionTimes.get(memberId) ?? []).filter(
    (time) => now - time < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    submissionTimes.set(memberId, recent);
    return true;
  }
  recent.push(now);
  submissionTimes.set(memberId, recent);
  return false;
}

class DuplicateExcuseError extends Error {}

/** timestamp → 서울 기준 "HH:MM" */
function toSeoulTimeOfDay(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** 관리자 식별 정보(reviewedByAdminId 등)를 제외한 공개 응답 직렬화 */
function toExcuseResponse(excuse: ExcuseRequest) {
  return {
    id: excuse.id,
    excuseDate: excuse.targetDate.toISOString().slice(0, 10),
    excuseType: excuse.type,
    reason: excuse.reason,
    expectedArrival: excuse.expectedArrivalAt ? toSeoulTimeOfDay(excuse.expectedArrivalAt) : null,
    status: excuse.status,
    rejectionReason: excuse.rejectionReason,
    reviewedAtLabel: excuse.reviewedAt ? getSeoulTimeLabel(excuse.reviewedAt) : null,
    canceledAtLabel: excuse.status === ExcuseStatus.CANCELED ? getSeoulTimeLabel(excuse.updatedAt) : null,
    submittedAtLabel: getSeoulTimeLabel(excuse.createdAt),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");
  if (!memberId) {
    return NextResponse.json({ error: "memberId가 필요합니다." }, { status: 400 });
  }

  const excuses = await prisma.excuseRequest.findMany({
    where: { memberId },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json({ excuses: excuses.map(toExcuseResponse) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  const excuseDate = typeof body?.excuseDate === "string" ? body.excuseDate : "";
  const excuseType = typeof body?.excuseType === "string" ? body.excuseType : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const expectedArrival = typeof body?.expectedArrival === "string" ? body.expectedArrival : "";

  if (!memberId) {
    return NextResponse.json({ error: "본인을 선택해주세요." }, { status: 400 });
  }
  if (excuseType !== ExcuseType.LATE && excuseType !== ExcuseType.ABSENT) {
    return NextResponse.json({ error: "지각 또는 결석을 선택해주세요." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "사유를 입력해주세요." }, { status: 400 });
  }
  if (reason.length > REASON_MAX_LENGTH) {
    return NextResponse.json(
      { error: `사유는 ${REASON_MAX_LENGTH}자 이내로 입력해주세요.` },
      { status: 400 },
    );
  }
  if (excuseType === ExcuseType.LATE && expectedArrival && !TIME_PATTERN.test(expectedArrival)) {
    return NextResponse.json({ error: "예상 도착 시각 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const excusable = isExcusableDate(excuseDate, getSeoulDateKey());
  if (!excusable.ok) {
    return NextResponse.json({ error: excusable.reason ?? "신청할 수 없는 날짜입니다." }, { status: 422 });
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.status !== MemberStatus.ACTIVE) {
    return NextResponse.json({ error: "사유를 신청할 수 없는 팀원입니다." }, { status: 403 });
  }

  // rate limit 기록은 실제 존재하는 ACTIVE 팀원 검증 이후에만 남긴다.
  // (임의 문자열 memberId 스팸으로 in-memory Map이 무한 증가하는 것을 방지)
  if (isRateLimited(member.id)) {
    return NextResponse.json(
      { error: "신청이 너무 잦습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const targetDate = dateKeyToDbDate(excuseDate);

  try {
    // 중복 검사와 생성을 한 트랜잭션으로 묶어 check-then-act 경합 창을 줄인다.
    const created = await prisma.$transaction(async (tx) => {
      const duplicated = await tx.excuseRequest.findFirst({
        where: {
          memberId: member.id,
          targetDate,
          status: { in: [ExcuseStatus.PENDING, ExcuseStatus.APPROVED] },
        },
      });
      if (duplicated) throw new DuplicateExcuseError();

      return tx.excuseRequest.create({
        data: {
          memberId: member.id,
          targetDate,
          type: excuseType,
          reason,
          expectedArrivalAt:
            excuseType === ExcuseType.LATE && expectedArrival
              ? new Date(`${excuseDate}T${expectedArrival}:00+09:00`)
              : null,
        },
      });
    });
    return NextResponse.json({ excuse: toExcuseResponse(created) }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateExcuseError) {
      return NextResponse.json(
        { error: "이미 해당 날짜에 처리 중인 신청이 있습니다." },
        { status: 409 },
      );
    }
    throw error;
  }
}
