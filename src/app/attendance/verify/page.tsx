"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Member = { id: string; name: string; part: string | null };

export default function AttendanceVerifyPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/attendance/verify")
      .then((response) => response.json())
      .then((data) => setMembers(data.members ?? []))
      .catch(() => setError("팀원 목록을 불러오지 못했습니다."));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/attendance/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, code }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "인증에 실패했습니다.");
        return;
      }
      router.replace("/attendance/check-in");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>본인 인증</CardTitle>
          <CardDescription>관리자에게 받은 6자리 인증번호를 입력해주세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium">
              본인 선택
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={memberId} onChange={(event) => setMemberId(event.target.value)} required>
                <option value="">팀원을 선택해주세요</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}{member.part ? ` · ${member.part}` : ""}</option>)}
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              6자리 인증번호
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={submitting || !memberId || code.length !== 6}>{submitting ? "인증 중..." : "인증하기"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
