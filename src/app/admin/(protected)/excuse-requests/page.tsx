"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ExcuseStatus, ExcuseType } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EXCUSE_STATUS_LABELS, EXCUSE_TYPE_LABELS } from "@/lib/labels";
import { formatDbDate, getSeoulTimeLabel } from "@/lib/seoul-time";

type ExcuseRow = {
  id: string;
  targetDate: string;
  type: ExcuseType;
  reason: string;
  expectedArrivalAt: string | null;
  status: ExcuseStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  member: { id: string; name: string; part: string | null };
  reviewedByAdmin: { loginId: string } | null;
};

const STATUS_BADGE_VARIANTS: Record<ExcuseStatus, "warning" | "success" | "destructive" | "outline"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELED: "outline",
};

export default function AdminExcuseRequestsPage() {
  const [requests, setRequests] = useState<ExcuseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");

  const [approveTarget, setApproveTarget] = useState<ExcuseRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ExcuseRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadRequests = useCallback(
    async (filters: { status: string; from: string; to: string; q: string }) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.q) params.set("q", filters.q);
        const response = await fetch(`/api/admin/excuse-requests?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "failed");
        setRequests(data.requests ?? []);
      } catch {
        setError("사유 신청 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadRequests({ status: "PENDING", from: "", to: "", q: "" });
  }, [loadRequests]);

  function handleFilter(event: FormEvent) {
    event.preventDefault();
    loadRequests({ status: statusFilter, from: fromDate, to: toDate, q: query.trim() });
  }

  function refetch() {
    loadRequests({ status: statusFilter, from: fromDate, to: toDate, q: query.trim() });
  }

  async function handleProcess(target: ExcuseRow, action: "approve" | "reject") {
    if (processing) return;
    if (action === "reject" && !rejectionReason.trim()) {
      setDialogError("반려 사유를 입력해주세요.");
      return;
    }
    setDialogError("");
    setNotice("");
    setProcessing(true);
    try {
      const response = await fetch(`/api/admin/excuse-requests/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { action }
            : { action, rejectionReason: rejectionReason.trim() },
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        setDialogError(data.message ?? "처리에 실패했습니다.");
        return;
      }
      let message =
        action === "approve"
          ? `${target.member.name}님의 사유 신청을 승인했습니다.`
          : `${target.member.name}님의 사유 신청을 반려했습니다.`;
      if (action === "approve" && data.existingRecord) {
        message +=
          " 해당 날짜에 이미 미정산 출결 기록이 있습니다. 출결 기록 화면에서 유지 여부를 확인해주세요.";
      }
      setNotice(message);
      setApproveTarget(null);
      setRejectTarget(null);
      setRejectionReason("");
      refetch();
    } catch {
      setDialogError("네트워크 오류가 발생했습니다.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">사유 승인</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">필터</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end" onSubmit={handleFilter}>
            <div className="space-y-1">
              <Label htmlFor="filter-status">신청 상태</Label>
              <Select
                id="filter-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">전체</option>
                {Object.entries(EXCUSE_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-from">시작일</Label>
              <Input
                id="filter-from"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to">종료일</Label>
              <Input
                id="filter-to"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-q">신청자 이름</Label>
              <Input
                id="filter-q"
                placeholder="이름으로 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary">조회</Button>
          </form>
        </CardContent>
      </Card>

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : requests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">조건에 맞는 사유 신청이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>신청자</TableHead>
                  <TableHead>대상 날짜</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>사유</TableHead>
                  <TableHead>예상 도착</TableHead>
                  <TableHead>제출 시각</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>처리 정보</TableHead>
                  <TableHead>처리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      {request.member.name}
                      {request.member.part && (
                        <span className="text-muted-foreground"> · {request.member.part}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDbDate(new Date(request.targetDate))}
                    </TableCell>
                    <TableCell>{EXCUSE_TYPE_LABELS[request.type]}</TableCell>
                    <TableCell className="max-w-56 whitespace-pre-wrap break-words">
                      {request.reason}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {request.expectedArrivalAt
                        ? getSeoulTimeLabel(new Date(request.expectedArrivalAt))
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {getSeoulTimeLabel(new Date(request.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANTS[request.status]}>
                        {EXCUSE_STATUS_LABELS[request.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {request.reviewedAt ? (
                        <div className="space-y-0.5">
                          <p className="whitespace-nowrap">
                            {request.reviewedByAdmin?.loginId ?? "-"} ·{" "}
                            {getSeoulTimeLabel(new Date(request.reviewedAt))}
                          </p>
                          {request.rejectionReason && (
                            <p className="whitespace-pre-wrap break-words text-destructive">
                              반려 사유: {request.rejectionReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {request.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setDialogError("");
                              setApproveTarget(request);
                            }}
                          >
                            승인
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setDialogError("");
                              setRejectionReason("");
                              setRejectTarget(request);
                            }}
                          >
                            반려
                          </Button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        title="사유 승인"
        description={
          approveTarget
            ? `${approveTarget.member.name}님의 ${formatDbDate(new Date(approveTarget.targetDate))} ${EXCUSE_TYPE_LABELS[approveTarget.type]} 사유를 승인할까요?`
            : undefined
        }
      >
        {approveTarget && (
          <div className="space-y-4">
            <p className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap break-words">
              {approveTarget.reason}
            </p>
            <p className="text-sm text-muted-foreground">
              승인하면 해당 날짜의 일요일 출결 체크에서 입력이 비활성화되고 금액이 부과되지 않습니다.
            </p>
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setApproveTarget(null)}>
                취소
              </Button>
              <Button
                type="button"
                disabled={processing}
                onClick={() => handleProcess(approveTarget, "approve")}
              >
                {processing ? "처리 중..." : "승인"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      <Dialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="사유 반려"
        description={
          rejectTarget
            ? `${rejectTarget.member.name}님의 ${formatDbDate(new Date(rejectTarget.targetDate))} ${EXCUSE_TYPE_LABELS[rejectTarget.type]} 사유를 반려합니다.`
            : undefined
        }
      >
        {rejectTarget && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="rejection-reason">반려 사유 *</Label>
              <Textarea
                id="rejection-reason"
                rows={3}
                placeholder="반려 사유를 입력해주세요."
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
              />
            </div>
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={processing || !rejectionReason.trim()}
                onClick={() => handleProcess(rejectTarget, "reject")}
              >
                {processing ? "처리 중..." : "반려"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>
    </div>
  );
}
