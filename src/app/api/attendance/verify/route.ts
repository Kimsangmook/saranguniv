import { NextResponse } from "next/server";
import { MemberStatus } from "@prisma/client";
import { createMemberDeviceToken, decryptOtpSecret, hashMemberDeviceToken, MEMBER_DEVICE_COOKIE, verifyTotp } from "@/lib/member-auth";
import { prisma } from "@/lib/prisma";

const DEVICE_LIFETIME_DAYS = 180;
const MAX_OTP_FAILURES = 5;
const OTP_LOCK_MINUTES = 10;

export async function GET() {
  const members = await prisma.member.findMany({
    where: { status: MemberStatus.ACTIVE },
    select: { id: true, name: true, part: true },
    orderBy: [{ name: "asc" }],
  });
  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  const code = typeof body?.code === "string" ? body.code : "";

  if (!memberId || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "팀원과 6자리 인증번호를 확인해주세요." }, { status: 400 });
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.status !== MemberStatus.ACTIVE) {
    return NextResponse.json({ error: "인증할 수 없는 팀원입니다." }, { status: 403 });
  }

  if (member.otpLockedUntil && member.otpLockedUntil > new Date()) {
    return NextResponse.json({ error: "인증 시도가 잠시 제한되었습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  let isValid = false;
  try {
    isValid = verifyTotp(decryptOtpSecret(member.otpSecretEncrypted), code);
  } catch (error) {
    console.error("Unable to decrypt member OTP secret", error);
    return NextResponse.json({ error: "인증 설정에 문제가 있습니다. 관리자에게 문의해주세요." }, { status: 500 });
  }

  if (!isValid) {
    const failedAttempts = member.otpFailedAttempts + 1;
    await prisma.member.update({
      where: { id: member.id },
      data: {
        otpFailedAttempts: failedAttempts >= MAX_OTP_FAILURES ? 0 : failedAttempts,
        otpLockedUntil: failedAttempts >= MAX_OTP_FAILURES
          ? new Date(Date.now() + OTP_LOCK_MINUTES * 60_000)
          : null,
      },
    });
    return NextResponse.json({ error: "인증번호가 맞지 않거나 만료되었습니다." }, { status: 401 });
  }

  const token = createMemberDeviceToken();
  const expiresAt = new Date(Date.now() + DEVICE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.member.update({
      where: { id: member.id },
      data: { otpFailedAttempts: 0, otpLockedUntil: null },
    }),
    prisma.memberDevice.create({
      data: { memberId: member.id, tokenHash: hashMemberDeviceToken(token), expiresAt },
    }),
  ]);

  const response = NextResponse.json({ verified: true });
  response.cookies.set(MEMBER_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
