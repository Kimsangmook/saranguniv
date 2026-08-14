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

function readStoredMemberId(): string {
  try {
    return window.localStorage.getItem(MEMBER_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredMemberId(value: string) {
  try {
    window.localStorage.setItem(MEMBER_STORAGE_KEY, value);
  } catch {
    // localStorage 접근 불가(시크릿 모드 등) 시 무시한다.
  }
}

function clearStoredMemberId() {
  try {
    window.localStorage.removeItem(MEMBER_STORAGE_KEY);
  } catch {
    // localStorage 접근 불가 시 무시한다.
  }
}

export default function MyRequestsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState("");
  const [locked, setLocked] = useState(false);
  const [excuses, setExcuses] = useState<Excuse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [cancelTarget, setCancelTarget] = useState<Excuse | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    const storedMemberId = readStoredMemberId();

    fetch("/api/members")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((data) => {
        const loadedMembers: Member[] = data.members ?? [];
        setMembers(loadedMembers);

        // 저장된 팀원이 아직 현역 목록에 있을 때만 고정한다.
        if (storedMemberId && loadedMembers.some((member) => member.id === storedMemberId)) {
          setMemberId(storedMemberId);
          setLocked(true);
        } else if (storedMemberId) {
          clearStoredMemberId();
        }
      })
      .catch(() => setError("팀원 목록을 불러오지 못했습니다. 새로고침해주세요."));
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
      writeStoredMemberId(nextMemberId);
      setLocked(true);
    }
  }

  function handleChangeMember() {
    clearStoredMemberId();
    setLocked(false);
    setMemberId("");
    setExcuses([]);
    setError("");
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

  const selectedMember = members.find((member) => member.id === memberId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>내 신청 내역</CardTitle>
          <CardDescription>
            제출한 지각·결석 사유 신청과 처리 상태를 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {locked && selectedMember ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{selectedMember.name}</p>
                {selectedMember.part && (
                  <p className="truncate text-xs text-muted-foreground">{selectedMember.part}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleChangeMember}
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                본인이 아니신가요?
              </button>
            </div>
          ) : (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="my-member">본인 선택</Label>
              <Select
                id="my-member"
                className="h-11"
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
              <p className="text-xs text-muted-foreground">
                한 번 선택하면 이 기기에서는 계속 기억합니다.
              </p>
            </div>
          )}

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
              <ul className="space-y-3">
                {excuses.map((excuse) => (
                  <li key={excuse.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {formatDbDate(dateKeyToDbDate(excuse.excuseDate))}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {EXCUSE_TYPE_LABELS[excuse.excuseType]}
                          {excuse.expectedArrival ? ` · 예상 도착 ${excuse.expectedArrival}` : ""}
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANTS[excuse.status]} className="shrink-0">
                        {EXCUSE_STATUS_LABELS[excuse.status]}
                      </Badge>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap break-words text-sm">{excuse.reason}</p>

                    {excuse.rejectionReason && (
                      <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                        반려 사유: {excuse.rejectionReason}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        제출 {excuse.submittedAtLabel}
                        {excuse.reviewedAtLabel ? ` · 처리 ${excuse.reviewedAtLabel}` : ""}
                      </p>
                      {excuse.status === "PENDING" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCancelError("");
                            setCancelTarget(excuse);
                          }}
                        >
                          신청 취소
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">수정 불가</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
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
