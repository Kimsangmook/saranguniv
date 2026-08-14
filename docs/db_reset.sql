-- ============================================
-- saranguniv DB 초기화 + 새 스키마 적용 + 테스트 시드
-- ============================================
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- prisma migrate 이력 테이블
CREATE TABLE "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES ('a1b2c3d4-0000-4000-8000-000000000001', '125868bf9421792dcf02c4f152fc311c78bc4757470cb1b4b8e45ac87719bf16', now(), '20260814000000_init', now(), 1);

CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'ATTENDANCE_MANAGER');
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'MILITARY', 'INTERCESSION', 'RESTING', 'GRADUATED', 'WITHDRAWN');
CREATE TYPE "MeetingType" AS ENUM ('SATURDAY', 'SUNDAY');
CREATE TYPE "AttendanceStatus" AS ENUM ('LATE', 'ABSENT');
CREATE TYPE "RecordMethod" AS ENUM ('QR', 'ADMIN_MANUAL');
CREATE TYPE "RecordSettlementStatus" AS ENUM ('UNSETTLED', 'REQUESTED', 'COMPLETED');
CREATE TYPE "ExcuseType" AS ENUM ('LATE', 'ABSENT');
CREATE TYPE "ExcuseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
CREATE TYPE "SettlementStatus" AS ENUM ('REQUESTED', 'COMPLETED');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

CREATE TABLE "Admin" (
  "id" TEXT NOT NULL, "loginId" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'ADMIN', "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Member" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "part" TEXT, "contact" TEXT,
  "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE', "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publicDisplayName" TEXT, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendanceRecord" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "attendanceDate" DATE NOT NULL,
  "meetingType" "MeetingType" NOT NULL, "status" "AttendanceStatus" NOT NULL, "standardTime" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3), "lateMinutes" INTEGER, "method" "RecordMethod" NOT NULL,
  "calculatedAmount" INTEGER NOT NULL DEFAULT 0, "settlementStatus" "RecordSettlementStatus" NOT NULL DEFAULT 'UNSETTLED',
  "note" TEXT, "createdByAdminId" TEXT, "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExcuseRequest" (
  "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "targetDate" DATE NOT NULL, "type" "ExcuseType" NOT NULL,
  "reason" TEXT NOT NULL, "expectedArrivalAt" TIMESTAMP(3), "status" "ExcuseStatus" NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT, "reviewedByAdminId" TEXT, "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExcuseRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Settlement" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "startDate" DATE NOT NULL, "endDate" DATE NOT NULL,
  "status" "SettlementStatus" NOT NULL DEFAULT 'REQUESTED', "policySnapshot" JSONB NOT NULL,
  "totalAmount" INTEGER NOT NULL DEFAULT 0, "createdById" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SettlementItem" (
  "id" TEXT NOT NULL, "settlementId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "attendanceRecordId" TEXT NOT NULL,
  "meetingType" "MeetingType" NOT NULL, "attendanceStatus" "AttendanceStatus" NOT NULL,
  "calculationDetail" JSONB, "amount" INTEGER NOT NULL, "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "paidAt" TIMESTAMP(3), "paidByAdminId" TEXT, CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LateFeePolicy" (
  "id" TEXT NOT NULL, "saturdayStartMinutes" INTEGER NOT NULL DEFAULT 630, "saturdayRates" JSONB NOT NULL,
  "sundayLateAmount" INTEGER NOT NULL DEFAULT 3000, "sundayAbsentAmount" INTEGER NOT NULL DEFAULT 3000,
  "effectiveFrom" DATE NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LateFeePolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL, "actorAdminId" TEXT, "actorMemberId" TEXT, "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "beforeData" JSONB, "afterData" JSONB,
  "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Admin_loginId_key" ON "Admin"("loginId");
CREATE UNIQUE INDEX "Member_contact_key" ON "Member"("contact");
CREATE INDEX "Member_status_name_idx" ON "Member"("status", "name");
CREATE INDEX "AttendanceRecord_attendanceDate_settlementStatus_idx" ON "AttendanceRecord"("attendanceDate", "settlementStatus");
CREATE UNIQUE INDEX "AttendanceRecord_memberId_attendanceDate_meetingType_key" ON "AttendanceRecord"("memberId", "attendanceDate", "meetingType");
CREATE INDEX "ExcuseRequest_targetDate_status_idx" ON "ExcuseRequest"("targetDate", "status");
CREATE INDEX "Settlement_status_startDate_endDate_idx" ON "Settlement"("status", "startDate", "endDate");
CREATE UNIQUE INDEX "SettlementItem_attendanceRecordId_key" ON "SettlementItem"("attendanceRecordId");
CREATE INDEX "SettlementItem_settlementId_memberId_idx" ON "SettlementItem"("settlementId", "memberId");
CREATE INDEX "LateFeePolicy_isActive_effectiveFrom_idx" ON "LateFeePolicy"("isActive", "effectiveFrom");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExcuseRequest" ADD CONSTRAINT "ExcuseRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExcuseRequest" ADD CONSTRAINT "ExcuseRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_paidByAdminId_fkey" FOREIGN KEY ("paidByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 테스트 팀원 시드
INSERT INTO "Member" ("id", "name", "part", "status", "updatedAt")
VALUES ('11111111-1111-4111-8111-111111111111', '김찬양', '테스트', 'ACTIVE', CURRENT_TIMESTAMP);

-- 지각비 활성 정책 시드 (토요일 10:30 기준, late-fee.ts DEFAULT_SATURDAY_RATES와 동일)
INSERT INTO "LateFeePolicy" ("id", "saturdayStartMinutes", "saturdayRates", "sundayLateAmount", "sundayAbsentAmount", "effectiveFrom", "isActive", "updatedAt")
VALUES ('22222222-2222-4222-8222-222222222222', 630,
  '[{"throughMinute":10,"amountPerMinute":100},{"throughMinute":20,"amountPerMinute":300},{"throughMinute":30,"amountPerMinute":500},{"throughMinute":null,"amountPerMinute":1000}]'::jsonb,
  3000, 3000, CURRENT_DATE, true, CURRENT_TIMESTAMP);

-- 관리자 시드 (아이디: admin / 비밀번호: 1234)
-- 해시는 src/lib/auth.ts의 scrypt 형식(scrypt$16384$8$1$<saltHex>$<hashHex>)으로 생성됨
INSERT INTO "Admin" ("id","loginId","passwordHash","role","isActive","updatedAt")
VALUES ('33333333-3333-4333-8333-333333333333','admin','scrypt$16384$8$1$8faecc962616004e7103ee102dfea613$0ac1f23fade53894b14d125dc3ff8b64e1680e67da0f009424e81dbc1d4f2451a9f309aee8d4ee99fa20ef1580a68d455a4e17c282e3923591bded65236b2e66','ADMIN',true,CURRENT_TIMESTAMP);
