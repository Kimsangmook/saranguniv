import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const SECRET_KEY = process.env.JWT_SECRET || "default-secret-key";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "토큰이 없습니다." }, { status: 401 });
    }

    // ✅ 토큰 검증 및 파싱
    const decoded = jwt.verify(token, SECRET_KEY) as { name: string; contact: string };

    if (!decoded.name || !decoded.contact) {
      return NextResponse.json({ error: "잘못된 토큰입니다." }, { status: 400 });
    }

    // ✅ 출석 데이터 저장
    const attendance = await prisma.attendance.create({
      data: {
        name: decoded.name,
        contact: decoded.contact,
      },
    });

    return NextResponse.json({ message: "출석이 완료되었습니다.", attendance });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "출석 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
