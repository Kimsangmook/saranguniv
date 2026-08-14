"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ExcuseStatus, ExcuseType } from "@prisma/client";
import { dateKeyToDbDate, formatDbDate } from "@/lib/seoul-time";
import { EXCUSE_STATUS_LABELS, EXCUSE_TYPE_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Member = { id: string; name: string; part: string | null };

type Excuse = {
  id: string;
  excuseDate: string;
  excuseType: ExcuseType;
  reason: string;
  expectedArrival: string | null;
  status: ExcuseStatus;
  rejectionReason: string | null;
  reviewedAtLabel: string | null;
  canceledAtLabel: string | null;
  submittedAtLabel: string;
};

const MEMBER_STORAGE_KEY = "latefee.memberId";

const STATUS_BADGE_VARIANTS: Record<
  ExcuseStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELED: "secondary",
};

export default function MyRequestsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState("");
  const [excuses, setExcuses] = useState<Excuse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [cancelTarget, setCancelTarget] = useState<Excuse | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    fetch("/api/members")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((data) => setMembers(data.members ?? []))
      .catch(() => setError("팀원 목록을 불러오지 못했습니다. 새로고침해주세요."));

    const savedMemberId = window.localStorage.getItem(MEMBER_STORAGE_KEY);
    if (savedMemberId) setMemberId(savedMemberId);
  }, []);

  const loadExcuses = useCallback(async (targetMemberId: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/excuses?memberId=${encodeURIComponent(targetMemberId)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "신청 내역을 불러오지 못했습니다.");
        setExcuses([]);
        return;
      }
      setExcuses(data?.excuses ?? []);
    } catch {
      setError("신청 내역을 불러오지 못했습니다.");
      setExcuses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!memberId) {
      setExcuses([]);
      return;
    }
    loadExcuses(memberId);
  }, [memberId, loadExcuses]);

  function handleMemberChange(nextMemberId: string) {
    setMemberId(nextMemberId);
    if (nextMemberId) {
      window.localStorage.setItem(MEMBER_STORAGE_KEY, nextMemberId);
    }
  }

  async function handleCancel() {
    if (!cancelTarget || canceling) return;
    setCancelError("");
    setCanceling(true);
    try {
      const response = await fetch(`/api/excuses/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", memberId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setCancelError(data?.error ?? "신청 취소를 처리하지 못했습니다.");
        return;
      }
      setCancelTarget(null);
      await loadExcuses(memberId);
    } catch {
      setCancelError("신청 취소를 처리하지 못했습니다.");
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>내 신청 내역</CardTitle>
          <CardDescription>
            본인을 선택하면 제출한 지각·결석 사유 신청 내역을 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="my-member">본인 선택</Label>
            <Select
              id="my-member"
              value={memberId}
              onChange={(event) => handleMemberChange(event.target.value)}
            >
              <option value="">이름을 선택해주세요</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.part ? ` (${member.part})` : ""}
                </option>
              ))}
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {!memberId ? (
            <p className="text-sm text-muted-foreground">
              본인을 선택하면 신청 내역이 표시됩니다.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">신청 내역을 불러오는 중...</p>
          ) : excuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              제출한 신청이 없습니다.{" "}
              <Link href="/calendar" className="underline underline-offset-2">
                사유 제출
              </Link>
              에서 신청할 수 있습니다.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>대상 날짜</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead>사유</TableHead>
                    <TableHead>예상 도착</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>반려 사유</TableHead>
                    <TableHead>제출 시각</TableHead>
                    <TableHead>처리 시각</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excuses.map((excuse) => (
                    <TableRow key={excuse.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDbDate(dateKeyToDbDate(excuse.excuseDate))}
                      </TableCell>
                      <TableCell>{EXCUSE_TYPE_LABELS[excuse.excuseType]}</TableCell>
                      <TableCell className="max-w-[16rem] whitespace-pre-wrap break-words">
                        {excuse.reason}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {excuse.expectedArrival ?? "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE_VARIANTS[excuse.status]}>
                          {EXCUSE_STATUS_LABELS[excuse.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[12rem] whitespace-pre-wrap break-words">
                        {excuse.rejectionReason ?? "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {excuse.submittedAtLabel}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {excuse.reviewedAtLabel ?? "-"}
                      </TableCell>
                      <TableCell>
                        {excuse.status === "PENDING" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCancelError("");
                              setCancelTarget(excuse);
                            }}
                          >
                            취소
                          </Button>
                        ) : (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            수정 불가
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                승인·반려·취소된 신청은 수정할 수 없습니다. 승인 대기 상태에서만 취소할 수
                있습니다.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={cancelTarget !== null}
        onClose={() => {
          if (!canceling) setCancelTarget(null);
        }}
        title="신청 취소"
        description={
          cancelTarget
            ? `${formatDbDate(dateKeyToDbDate(cancelTarget.excuseDate))} ${
                EXCUSE_TYPE_LABELS[cancelTarget.excuseType]
              } 사유 신청을 취소할까요?`
            : undefined
        }
      >
        <p className="text-sm text-muted-foreground">취소한 신청은 되돌릴 수 없습니다.</p>
        {cancelError && <p className="mt-2 text-sm text-destructive">{cancelError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={canceling}>
            닫기
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={canceling}>
            {canceling ? "취소 중..." : "신청 취소"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
