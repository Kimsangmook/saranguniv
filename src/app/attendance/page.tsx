"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Member = { id: string; name: string; part: string | null };
type Result = {
  created: boolean;
  member: { name: string };
  status: "LATE" | "ABSENT";
  arrivedAtLabel: string | null;
  lateMinutes: number | null;
  amount: number;
};

export default function AttendancePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [recordedMemberIds, setRecordedMemberIds] = useState<string[]>([]);
  const [memberId, setMemberId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/attendance")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((data) => {
        setMembers(data.members ?? []);
        setRecordedMemberIds(data.recordedMemberIds ?? []);
      })
      .catch(() => setError("팀원 목록을 불러오지 못했습니다. 새로고침해주세요."));
  }, []);

  const selectedMember = members.find((member) => member.id === memberId);
  const alreadyRecorded = Boolean(memberId) && recordedMemberIds.includes(memberId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "지각 기록을 처리하지 못했습니다.");
        return;
      }
      setResult(data);
      setRecordedMemberIds((previous) => previous.includes(memberId) ? previous : [...previous, memberId]);
    } catch {
      setError("네트워크 오류가 발생했습니다. 연결 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setResult(null);
    setMemberId("");
    setError("");
  }

  if (result) {
    const isAbsent = result.status === "ABSENT";
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            {result.created
              ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              : <Info className={`mx-auto h-12 w-12 ${isAbsent ? "text-amber-600" : "text-blue-600"}`} />}
            <CardTitle>{result.created ? "지각 기록 완료" : "오늘 기록 확인"}</CardTitle>
            <CardDescription>{result.member.name}님</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {result.created
                ? "도착 기록이 완료되었습니다."
                : isAbsent
                  ? "오늘은 결석으로 기록되어 있습니다."
                  : "오늘의 최초 기록이 이미 있습니다."}
            </p>
            {result.arrivedAtLabel && <p className="font-medium">{result.arrivedAtLabel}</p>}
            <p className="text-muted-foreground">
              {isAbsent
                ? `결석 · 결석비 ${result.amount.toLocaleString("ko-KR")}원`
                : `${result.lateMinutes !== null ? `${result.lateMinutes}분 지각 · ` : ""}예상 지각비 ${result.amount.toLocaleString("ko-KR")}원`}
            </p>
            <Button className="mt-2 w-full" type="button" variant="outline" onClick={handleReset}>처음으로 돌아가기</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>지각 기록</CardTitle>
          <CardDescription>목록에서 본인을 선택한 뒤 기록하기 버튼을 눌러주세요.</CardDescription>
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
            {selectedMember && (alreadyRecorded
              ? <p className="text-sm text-amber-600">{selectedMember.name}님은 이미 오늘 기록이 있습니다. 기록하기를 누르면 기존 기록을 보여드립니다.</p>
              : <p className="text-sm text-muted-foreground">{selectedMember.name}님이 맞는지 확인 후 기록해주세요. 서버 시각 기준으로 도착 시간이 기록됩니다.</p>)}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={submitting || !memberId}>
              {submitting ? "기록 중..." : alreadyRecorded ? "기존 기록 확인하기" : selectedMember ? `${selectedMember.name}(으)로 기록하기` : "기록하기"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
