import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET || "default-secret-key"; // ✅ .env에서 시크릿 키 가져옴

export async function POST(req: Request) {
  const { name, contact } = await req.json();

  if (!name || !contact) {
    return NextResponse.json({ error: "이름과 연락처를 입력하세요." }, { status: 400 });
  }

  // ✅ JWT 토큰 생성 (DB 저장 없음)
  const token = jwt.sign({ name, contact }, SECRET_KEY, { expiresIn: "7d" });

  return NextResponse.json({ token });
}
