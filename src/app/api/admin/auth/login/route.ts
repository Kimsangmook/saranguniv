import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  clearLoginFailures,
  createSessionToken,
  getLoginLockRemainingMs,
  recordLoginFailure,
  verifyDummyPassword,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INVALID_CREDENTIALS_MESSAGE = "아이디 또는 비밀번호가 올바르지 않습니다.";

export async function POST(request: NextRequest) {
  let body: { loginId?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const loginId = typeof body.loginId === "string" ? body.loginId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!loginId || !password) {
    return NextResponse.json({ message: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const admin = await prisma.admin.findUnique({ where: { loginId } });

  // 계정이 없어도 더미 scrypt 검증을 수행해 응답 시간을 균일화한다 (계정 존재 여부 노출 방지)
  const passwordValid = admin
    ? await verifyPassword(password, admin.passwordHash)
    : await verifyDummyPassword(password);

  // 잠금 상태여도 비밀번호 검증은 수행하고, 올바른 비밀번호면 로그인을 허용한다.
  // (공격자가 실패 시도만으로 정당한 관리자의 로그인을 막는 DoS 방지)
  if (!admin || !admin.isActive || !passwordValid) {
    const lockRemainingMs = getLoginLockRemainingMs(loginId);
    if (lockRemainingMs !== null) {
      const remainingMinutes = Math.ceil(lockRemainingMs / 60_000);
      return NextResponse.json(
        {
          message: `로그인 시도가 너무 많습니다. 약 ${remainingMinutes}분 후 다시 시도해 주세요.`,
        },
        { status: 429 },
      );
    }
    recordLoginFailure(loginId);
    return NextResponse.json({ message: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  clearLoginFailures(loginId);

  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const token = createSessionToken(admin);

  const response = NextResponse.json({
    loginId: admin.loginId,
    role: admin.role,
  });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
