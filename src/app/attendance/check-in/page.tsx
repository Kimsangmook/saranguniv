"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Result = { created: boolean; member: { name: string }; arrivedAtLabel: string | null; lateMinutes: number | null; amount: number };

export default function AttendanceCheckInPage() {
  const router = useRouter();
  const started = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/attendance", { method: "POST" })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (response.status === 401) {
          router.replace("/attendance/verify");
          return;
        }
        if (!response.ok) {
          setError(data.error ?? "지각 기록을 처리하지 못했습니다.");
          return;
        }
        setResult(data);
      })
      .catch(() => setError("네트워크 오류가 발생했습니다. 연결 후 다시 시도해주세요."));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <CardTitle>{result ? "지각 기록 완료" : error ? "기록할 수 없습니다" : "지각 기록 중"}</CardTitle>
          <CardDescription>{result ? `${result.member.name}님` : error || "서버 시각을 기준으로 도착 시간을 기록하고 있습니다."}</CardDescription>
        </CardHeader>
        {result && <CardContent className="space-y-2 text-sm">
          <p>{result.created ? "도착 기록이 완료되었습니다." : "오늘의 최초 기록이 이미 있습니다."}</p>
          <p className="font-medium">{result.arrivedAtLabel}</p>
          <p className="text-muted-foreground">{result.lateMinutes}분 지각 · 예상 지각비 {result.amount.toLocaleString("ko-KR")}원</p>
        </CardContent>}
      </Card>
    </main>
  );
}
