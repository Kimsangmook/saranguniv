// 서버 전용 모듈: 클라이언트 컴포넌트에서 import 금지 (node crypto / next/headers 사용)
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keyLen: number,
) => Promise<Buffer>;

// ---------------------------------------------------------------------------
// 비밀번호 해시 (scrypt)
// 저장 형식: scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>  (기본 N=16384, r=8, p=1, keyLen=64)
// ---------------------------------------------------------------------------

const SCRYPT_KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_LEN);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltHex, hashHex] = parts;
  // 시드/hashPassword 모두 Node scrypt 기본 파라미터(N=16384, r=8, p=1)를 사용한다.
  if (n !== "16384" || r !== "8" || p !== "1") return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    // 파싱된 해시 길이가 규격(64바이트)과 다르면 즉시 실패 (빈/손상 해시 통과 방지)
    if (expected.length !== SCRYPT_KEY_LEN) return false;
    const derived = await scrypt(password, salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// 계정 미존재 시에도 동일한 비용의 scrypt 검증을 수행해 응답 시간을 균일화한다
// (계정 존재 여부가 타이밍으로 노출되는 것을 방지). 항상 false를 반환한다.
let dummyHashPromise: Promise<string> | null = null;

export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHashPromise ??= hashPassword("saranguniv-dummy-password-for-timing");
  await verifyPassword(password, await dummyHashPromise);
  return false;
}

// ---------------------------------------------------------------------------
// 세션 토큰 (HMAC-SHA256 서명)
// 형식: base64url(JSON{adminId, loginId, role, exp}) + "." + HMAC-SHA256(payload)
// ---------------------------------------------------------------------------

export const ADMIN_SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12시간

const FALLBACK_SESSION_SECRET = "saranguniv-dev-session-secret-do-not-use-in-production";

let warnedFallbackSecret = false;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length > 0) return secret;
  // 프로덕션에서 시크릿 미설정은 fail-close: 고정 fallback으로 서명/검증하지 않는다.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[auth] SESSION_SECRET 환경 변수가 설정되지 않았습니다. 프로덕션에서는 SESSION_SECRET 없이 세션 토큰을 서명/검증할 수 없습니다. 배포 환경 변수에 SESSION_SECRET을 설정하세요.",
    );
  }
  if (!warnedFallbackSecret) {
    warnedFallbackSecret = true;
    console.warn(
      "[auth] SESSION_SECRET 환경 변수가 설정되지 않아 개발용 fallback 시크릿을 사용합니다. 프로덕션에서는 반드시 SESSION_SECRET을 설정하세요.",
    );
  }
  return FALLBACK_SESSION_SECRET;
}

export type AdminSession = {
  adminId: string;
  loginId: string;
  role: AdminRole;
  /** 만료 시각 (unix epoch, milliseconds) */
  exp: number;
};

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(admin: {
  id: string;
  loginId: string;
  role: AdminRole;
}): string {
  const session: AdminSession = {
    adminId: admin.id,
    loginId: admin.loginId,
    role: admin.role,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): AdminSession | null {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  // 프로덕션에서 SESSION_SECRET 미설정 시 여기서 throw (catch로 삼키지 않는다)
  const expectedSignature = sign(payload);

  try {
    const expected = Buffer.from(expectedSignature, "utf8");
    const actual = Buffer.from(signature, "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    if (
      typeof session.adminId !== "string" ||
      typeof session.loginId !== "string" ||
      typeof session.role !== "string" ||
      typeof session.exp !== "number"
    ) {
      return null;
    }
    if (session.exp <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * 쿠키의 세션 토큰을 검증하고, DB에서 관리자 활성 상태까지 재확인한다.
 * 유효하지 않으면 null. (Next 15: cookies()는 반드시 await)
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;

  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { isActive: true },
  });
  if (!admin?.isActive) return null;

  return session;
}

/**
 * 서버 컴포넌트(페이지/레이아웃)용 가드. 세션이 없으면 /admin/login으로 redirect.
 */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * API 라우트용 가드.
 * 사용 예:
 *   const auth = await requireAdminApi();                    // 역할 무관 (로그인만 확인)
 *   const auth = await requireAdminApi({ role: "ADMIN" });   // ADMIN 역할 요구
 *   if ("error" in auth) return auth.error;
 *   const { session } = auth;
 */
export async function requireAdminApi(options?: { role?: AdminRole }): Promise<
  { session: AdminSession } | { error: NextResponse }
> {
  const session = await getAdminSession();
  if (!session) {
    return {
      error: NextResponse.json({ message: "관리자 로그인이 필요합니다." }, { status: 401 }),
    };
  }
  if (options?.role && session.role !== options.role) {
    return {
      error: NextResponse.json({ message: "권한이 없습니다." }, { status: 403 }),
    };
  }
  return { session };
}

// ---------------------------------------------------------------------------
// 로그인 시도 제한 (in-memory)
// 주의: 서버리스/멀티 인스턴스 환경에서는 인스턴스마다 별도의 Map을 가지므로
// 완전한 보호는 아니다(인스턴스별 best-effort 제한). 필요 시 Redis 등으로 대체.
// ---------------------------------------------------------------------------

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MS = 5 * 60 * 1000; // 5분

type AttemptState = { failCount: number; lockedUntil: number | null };

const loginAttempts = new Map<string, AttemptState>();

/** 잠금 상태면 남은 시간(ms)을 반환, 아니면 null. */
export function getLoginLockRemainingMs(loginId: string): number | null {
  const state = loginAttempts.get(loginId);
  if (!state?.lockedUntil) return null;
  const remaining = state.lockedUntil - Date.now();
  if (remaining <= 0) {
    loginAttempts.delete(loginId);
    return null;
  }
  return remaining;
}

/** 로그인 실패를 기록한다. 5회 누적 시 5분 잠금. */
export function recordLoginFailure(loginId: string): void {
  const state = loginAttempts.get(loginId) ?? { failCount: 0, lockedUntil: null };
  state.failCount += 1;
  if (state.failCount >= LOGIN_MAX_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    state.failCount = 0;
  }
  loginAttempts.set(loginId, state);
}

/** 로그인 성공 시 실패 기록을 초기화한다. */
export function clearLoginFailures(loginId: string): void {
  loginAttempts.delete(loginId);
}
