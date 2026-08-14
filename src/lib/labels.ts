import type {
  AdminRole,
  AttendanceStatus,
  ExcuseStatus,
  ExcuseType,
  MeetingType,
  MemberStatus,
  PaymentStatus,
  RecordMethod,
  RecordSettlementStatus,
  SettlementStatus,
} from "@prisma/client";

// 전 도메인 enum → 한국어 라벨 맵. UI에서는 반드시 이 맵을 사용한다.

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  ACTIVE: "현역",
  MILITARY: "군 복무",
  INTERCESSION: "중보팀",
  RESTING: "휴식",
  GRADUATED: "졸업",
  WITHDRAWN: "탈퇴",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  LATE: "지각",
  ABSENT: "결석",
};

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  SATURDAY: "토요일",
  SUNDAY: "일요일",
};

export const EXCUSE_STATUS_LABELS: Record<ExcuseStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELED: "취소",
};

export const EXCUSE_TYPE_LABELS: Record<ExcuseType, string> = {
  LATE: "지각",
  ABSENT: "결석",
};

export const RECORD_SETTLEMENT_STATUS_LABELS: Record<RecordSettlementStatus, string> = {
  UNSETTLED: "미정산",
  REQUESTED: "정산 요청",
  COMPLETED: "정산 완료",
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  REQUESTED: "정산 요청",
  COMPLETED: "정산 완료",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "미납",
  PAID: "납부 완료",
};

export const RECORD_METHOD_LABELS: Record<RecordMethod, string> = {
  QR: "QR",
  ADMIN_MANUAL: "수동",
};

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  ADMIN: "관리자",
  ATTENDANCE_MANAGER: "출결 담당자",
};

/** 요일 라벨 (index = Date#getDay / getUTCDay, 0=일요일) */
export const DAY_OF_WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 3000 → "3,000원" */
export function formatKrw(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
