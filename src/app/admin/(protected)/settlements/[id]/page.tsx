"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_LABELS,
  formatKrw,
} from "@/lib/labels";
import { dateKeyToDbDate, formatDbDate, getSeoulTimeLabel } from "@/lib/seoul-time";

type PolicyRules = {
  saturdayStartMinutes: number;
  saturdayRates: { throughMinute: number | null; amountPerMinute: number }[];
  sundayLateAmount: number;
  sundayAbsentAmount: number;
};

type MemberRow = {
  memberId: string;
  memberName: string;
  saturdayAmount: number;
  sundayLateAmount: number;
  sundayAbsentAmount: number;
  totalAmount: number;
  recordCount: number;
  paymentStatus: "UNPAID" | "PAID";
  paidAt: string | null;
};

type DetailResponse = {
  settlement: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: "REQUESTED" | "COMPLETED";
    totalAmount: number;
    policySnapshot: PolicyRules;
    confirmedAt: string;
    completedAt: string | null;
  };
  perMember: MemberRow[];
  totals: {
    saturdayAmount: number;
    sundayLateAmount: number;
    sundayAbsentAmount: number;
    totalAmount: number;
    paidAmount: number;
    unpaidAmount: number;
  };
  allPaid: boolean;
  notice: string;
};

const NOTICE_TAIL_STORAGE_KEY = "settlement-notice-tail";

/** 자정 기준 분 → "HH:MM" */
function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 구간표를 "1~10분: 분당 100원" 형식으로 표시 */
function rateRangeLabel(rates: PolicyRules["saturdayRates"], index: number): string {
  const rate = rates[index];
  const prevThrough = index === 0 ? 0 : (rates[index - 1].throughMinute ?? 0);
  if (rate.throughMinute === null) return `${prevThrough + 1}분 이상`;
  return `${prevThrough + 1}~${rate.throughMinute}분`;
}

export default function SettlementDetailPage() {
  const params = useParams<{ id: string }>();
  const settlementId = params.id;

  const [data, setData] = React.useState<DetailResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [payingMemberId, setPayingMemberId] = React.useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const [noticeTail, setNoticeTail] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const fetchDetail = React.useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/admin/settlements/${settlementId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "정산 정보를 불러오지 못했습니다.");
      setData(json as DetailResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "정산 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [settlementId]);

  React.useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  // 꼬리말 localStorage 기억
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NOTICE_TAIL_STORAGE_KEY);
      if (saved !== null) setNoticeTail(saved);
    } catch {
      // localStorage 접근 불가 시 무시
    }
  }, []);

  const handleTailChange = (value: string) => {
    setNoticeTail(value);
    try {
      window.localStorage.setItem(NOTICE_TAIL_STORAGE_KEY, value);
    } catch {
      // localStorage 접근 불가 시 무시
    }
  };

  const updatePayment = async (memberId: string, paymentStatus: "UNPAID" | "PAID") => {
    setPayingMemberId(memberId);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/settlements/${settlementId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, paymentStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "납부 상태 변경에 실패했습니다.");
      await fetchDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "납부 상태 변경에 실패했습니다.");
    } finally {
      setPayingMemberId(null);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/settlements/${settlementId}/complete`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? "정산 완료 처리에 실패했습니다.");
      setCompleteOpen(false);
      await fetchDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "정산 완료 처리에 실패했습니다.");
    } finally {
      setCompleting(false);
    }
  };

  const noticeText = React.useMemo(() => {
    if (!data) return "";
    const tail = noticeTail.trim();
    return tail ? `${data.notice}\n\n${tail}` : data.notice;
  }, [data, noticeTail]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(noticeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("복사에 실패했습니다. 문구를 직접 선택해 복사해주세요.");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">{error || "정산을 찾을 수 없습니다."}</p>;
  }

  const { settlement, perMember, totals, allPaid } = data;
  const rules = settlement.policySnapshot;
  const isCompleted = settlement.status === "COMPLETED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{settlement.name}</h1>
          <Badge variant={isCompleted ? "success" : "secondary"}>
            {SETTLEMENT_STATUS_LABELS[settlement.status]}
          </Badge>
        </div>
        {!isCompleted && (
          <Button onClick={() => setCompleteOpen(true)} disabled={!allPaid}>
            정산 완료 처리
          </Button>
        )}
      </div>

      {/* 상단 정보 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">정산 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">정산 기간</span>
              <span>
                {formatDbDate(dateKeyToDbDate(settlement.startDate))} ~{" "}
                {formatDbDate(dateKeyToDbDate(settlement.endDate))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">전체 청구 금액</span>
              <span className="font-semibold">{formatKrw(settlement.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">납부 금액</span>
              <span>{formatKrw(totals.paidAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">미납 금액</span>
              <span>{formatKrw(totals.unpaidAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">확정 시각</span>
              <span>{getSeoulTimeLabel(new Date(settlement.confirmedAt))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">완료 시각</span>
              <span>
                {settlement.completedAt
                  ? getSeoulTimeLabel(new Date(settlement.completedAt))
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">적용 규칙 스냅샷</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">토요일 기본 기준 시각</span>
              <span>
                {minutesToTimeLabel(rules.saturdayStartMinutes)}
                <span className="ml-1 text-xs text-muted-foreground">(기록별 기준 시각 우선)</span>
              </span>
            </div>
            {rules.saturdayRates.map((rate, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-muted-foreground">
                  {rateRangeLabel(rules.saturdayRates, index)} 지각
                </span>
                <span>전체 지각 분 × {formatKrw(rate.amountPerMinute)}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-muted-foreground">일요일 지각</span>
              <span>{formatKrw(rules.sundayLateAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">일요일 결석</span>
              <span>{formatKrw(rules.sundayAbsentAmount)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* 사람별 정산 표 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">사람별 청구 내역</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>팀원</TableHead>
                <TableHead className="text-right">토요일</TableHead>
                <TableHead className="text-right">일요일 지각</TableHead>
                <TableHead className="text-right">일요일 결석</TableHead>
                <TableHead className="text-right">총 청구액</TableHead>
                <TableHead>납부 상태</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perMember.map((member) => (
                <TableRow key={member.memberId}>
                  <TableCell className="font-medium">{member.memberName}</TableCell>
                  <TableCell className="text-right">{formatKrw(member.saturdayAmount)}</TableCell>
                  <TableCell className="text-right">
                    {formatKrw(member.sundayLateAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatKrw(member.sundayAbsentAmount)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatKrw(member.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.paymentStatus === "PAID" ? "success" : "warning"}>
                      {PAYMENT_STATUS_LABELS[member.paymentStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {member.paymentStatus === "UNPAID" ? (
                      <Button
                        size="sm"
                        disabled={isCompleted || payingMemberId === member.memberId}
                        onClick={() => updatePayment(member.memberId, "PAID")}
                      >
                        납부 완료
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isCompleted || payingMemberId === member.memberId}
                        onClick={() => updatePayment(member.memberId, "UNPAID")}
                      >
                        납부 취소
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-bold">총합</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatKrw(totals.saturdayAmount)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatKrw(totals.sundayLateAmount)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatKrw(totals.sundayAbsentAmount)}
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatKrw(totals.totalAmount)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 카카오 공지 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">카카오톡 공지 문구</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="notice-tail">꼬리말 (계좌 정보 등, 자동 저장)</Label>
            <Textarea
              id="notice-tail"
              value={noticeTail}
              onChange={(e) => handleTailChange(e.target.value)}
              rows={2}
              placeholder="예: 국민 000-000000-000 홍길동"
            />
          </div>
          <div className="space-y-1">
            <Label>미리보기</Label>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/50 p-4 text-sm">
              {noticeText}
            </pre>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleCopy}>공지 문구 복사</Button>
            {copied && <span className="text-sm text-emerald-600">복사되었습니다.</span>}
          </div>
        </CardContent>
      </Card>

      {/* 정산 완료 확인 Dialog */}
      <Dialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="정산 완료 처리"
        description="모든 팀원의 납부가 완료되었습니다. 정산을 완료 처리하면 포함된 출결 기록이 정산 완료 상태로 전환되며 공개 통계에 반영됩니다."
      >
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleteOpen(false)}>
            취소
          </Button>
          <Button onClick={handleComplete} disabled={completing}>
            {completing ? "처리 중..." : "정산 완료 처리"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
