"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EXCUSE_FUTURE_DAYS, EXCUSE_PAST_DAYS, isExcusableDate } from "@/lib/excuse-rules";
import {
  dateKeyToDbDate,
  formatDbDate,
  getDayOfWeekFromDateKey,
  getSeoulDateKey,
} from "@/lib/seoul-time";
import { DAY_OF_WEEK_LABELS, EXCUSE_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Member = { id: string; name: string; part: string | null };

const MEMBER_STORAGE_KEY = "latefee.memberId";

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [todayKey] = useState(() => getSeoulDateKey());
  const [year, setYear] = useState(() => Number(todayKey.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)));

  const [members, setMembers] = useState<Member[]>([]);
  const [membersError, setMembersError] = useState("");

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [locked, setLocked] = useState(false);
  const [excuseType, setExcuseType] = useState<"LATE" | "ABSENT">("LATE");
  const [reason, setReason] = useState("");
  const [expectedArrival, setExpectedArrival] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/members")
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((data) => {
        const loadedMembers: Member[] = data.members ?? [];
        setMembers(loadedMembers);

        // 저장된 팀원이 아직 현역 목록에 있을 때만 고정한다.
        let savedMemberId = "";
        try {
          savedMemberId = window.localStorage.getItem(MEMBER_STORAGE_KEY) ?? "";
        } catch {
          savedMemberId = "";
        }
        if (savedMemberId && loadedMembers.some((member) => member.id === savedMemberId)) {
          setMemberId(savedMemberId);
          setLocked(true);
        } else if (savedMemberId) {
          try {
            window.localStorage.removeItem(MEMBER_STORAGE_KEY);
          } catch {
            // localStorage 접근 불가 시 무시한다.
          }
        }
      })
      .catch(() => setMembersError("팀원 목록을 불러오지 못했습니다. 새로고침해주세요."));
  }, []);

  const selectedMember = members.find((member) => member.id === memberId);

  const cells = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leadingBlanks = getDayOfWeekFromDateKey(toDateKey(year, month, 1));
    const list: Array<{ day: number; dateKey: string } | null> = [];
    for (let i = 0; i < leadingBlanks; i += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push({ day, dateKey: toDateKey(year, month, day) });
    }
    return list;
  }, [year, month]);

  function moveMonth(delta: number) {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  }

  function openDialog(dateKey: string) {
    setSelectedDateKey(dateKey);
    setExcuseType("LATE");
    setReason("");
    setExpectedArrival("");
    setSubmitError("");
    setSubmitted(false);
  }

  function closeDialog() {
    if (submitting) return;
    setSelectedDateKey(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !selectedDateKey) return;
    if (!memberId) {
      setSubmitError("본인을 선택해주세요.");
      return;
    }
    if (!reason.trim()) {
      setSubmitError("사유를 입력해주세요.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/excuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          excuseDate: selectedDateKey,
          excuseType,
          reason: reason.trim(),
          expectedArrival: excuseType === "LATE" && expectedArrival ? expectedArrival : undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setSubmitError(data?.error ?? "사유 신청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      try {
        window.localStorage.setItem(MEMBER_STORAGE_KEY, memberId);
      } catch {
        // localStorage 접근 불가 시 무시한다.
      }
      setLocked(true);
      setSubmitted(true);
    } catch {
      setSubmitError("사유 신청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>지각·결석 사유 제출</CardTitle>
          <CardDescription>
            토요일·일요일 날짜를 선택해 사유를 제출하세요. 지난 {EXCUSE_PAST_DAYS}일부터{" "}
            {EXCUSE_FUTURE_DAYS}일 이후까지 신청할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => moveMonth(-1)}>
              이전 달
            </Button>
            <p className="text-base font-semibold">
              {year}년 {month}월
            </p>
            <Button variant="outline" size="sm" onClick={() => moveMonth(1)}>
              다음 달
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_OF_WEEK_LABELS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "py-1 text-xs font-medium text-muted-foreground",
                  index === 0 && "text-red-500",
                  index === 6 && "text-blue-500",
                )}
              >
                {label}
              </div>
            ))}
            {cells.map((cell, index) => {
              if (!cell) return <div key={`blank-${index}`} />;
              const selectable = isExcusableDate(cell.dateKey, todayKey).ok;
              const isToday = cell.dateKey === todayKey;
              const dayOfWeek = getDayOfWeekFromDateKey(cell.dateKey);
              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  disabled={!selectable}
                  onClick={() => openDialog(cell.dateKey)}
                  className={cn(
                    "relative flex h-12 flex-col items-center justify-center rounded-md text-sm transition-colors",
                    selectable
                      ? "font-semibold hover:bg-accent hover:text-accent-foreground"
                      : "cursor-not-allowed text-muted-foreground/50",
                    selectable && dayOfWeek === 0 && "text-red-600",
                    selectable && dayOfWeek === 6 && "text-blue-600",
                    isToday && "ring-2 ring-primary",
                  )}
                >
                  {cell.day}
                  {isToday && <span className="text-[10px] leading-none text-primary">오늘</span>}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            토요일과 일요일만 선택할 수 있습니다. 제출한 신청은{" "}
            <Link href="/my/requests" className="underline underline-offset-2">
              내 신청
            </Link>
            에서 확인할 수 있습니다.
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={selectedDateKey !== null}
        onClose={closeDialog}
        title={
          selectedDateKey ? `${formatDbDate(dateKeyToDbDate(selectedDateKey))} 사유 제출` : undefined
        }
        description={submitted ? undefined : "지각 또는 결석 사유를 입력해주세요."}
      >
        {submitted ? (
          <div className="space-y-4">
            <p className="text-sm">
              사유 신청이 접수되었습니다. 관리자 승인 후 결과를 확인할 수 있습니다.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                닫기
              </Button>
              <Button asChild>
                <Link href="/my/requests">내 신청 보러 가기</Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              {locked && selectedMember ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{selectedMember.name}</p>
                    {selectedMember.part && (
                      <p className="truncate text-xs text-muted-foreground">{selectedMember.part}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLocked(false);
                      setMemberId("");
                      try {
                        window.localStorage.removeItem(MEMBER_STORAGE_KEY);
                      } catch {
                        // localStorage 접근 불가 시 무시한다.
                      }
                    }}
                    className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    본인이 아니신가요?
                  </button>
                </div>
              ) : (
                <>
                  <Label htmlFor="excuse-member">본인 선택</Label>
                  <Select
                    id="excuse-member"
                    className="h-11"
                    value={memberId}
                    onChange={(event) => setMemberId(event.target.value)}
                  >
                    <option value="">이름을 선택해주세요</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                        {member.part ? ` (${member.part})` : ""}
                      </option>
                    ))}
                  </Select>
                </>
              )}
              {membersError && <p className="text-sm text-destructive">{membersError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="excuse-type">구분</Label>
              <Select
                id="excuse-type"
                value={excuseType}
                onChange={(event) => setExcuseType(event.target.value as "LATE" | "ABSENT")}
              >
                <option value="LATE">{EXCUSE_TYPE_LABELS.LATE}</option>
                <option value="ABSENT">{EXCUSE_TYPE_LABELS.ABSENT}</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excuse-reason">사유 (필수)</Label>
              <Textarea
                id="excuse-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="사유를 입력해주세요"
                rows={3}
              />
            </div>

            {excuseType === "LATE" && (
              <div className="space-y-2">
                <Label htmlFor="excuse-arrival">예상 도착 시각</Label>
                <Input
                  id="excuse-arrival"
                  type="time"
                  value={expectedArrival}
                  onChange={(event) => setExpectedArrival(event.target.value)}
                />
              </div>
            )}

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
                닫기
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "제출 중..." : "사유 제출"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>
    </div>
  );
}
