import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";

export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { session } = auth;
  return NextResponse.json({ loginId: session.loginId, role: session.role });
}
