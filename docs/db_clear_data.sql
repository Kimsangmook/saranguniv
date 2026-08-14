-- ============================================
-- saranguniv 데이터 초기화 (테이블 구조는 유지)
--
-- 지우는 것: 팀원, 출결 기록, 사유 신청, 정산, 정산 항목, 감사 로그
-- 남기는 것: 테이블 구조, 마이그레이션 이력, 관리자 계정(admin), 지각비 정책
--
-- 실행:
--   npx prisma db execute --file docs/db_clear_data.sql --schema prisma/schema.prisma
--
-- 주의: 되돌릴 수 없습니다. 남겨야 할 데이터가 있으면 먼저 백업하세요.
-- ============================================

-- 외래키로 얽혀 있으므로 CASCADE로 한 번에 비운다.
-- (SettlementItem → Settlement/AttendanceRecord/Member, AttendanceRecord → Member 등)
-- TRUNCATE 자체가 하나의 원자적 문장이라 별도 트랜잭션 블록은 두지 않는다.
TRUNCATE TABLE
  "SettlementItem",
  "Settlement",
  "AttendanceRecord",
  "ExcuseRequest",
  "AuditLog",
  "Member"
RESTART IDENTITY CASCADE;

-- 관리자 계정은 유지하고 로그인 이력만 초기화한다.
UPDATE "Admin" SET "lastLoginAt" = NULL;
