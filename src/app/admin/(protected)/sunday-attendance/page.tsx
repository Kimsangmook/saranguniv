"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceStatus, RecordSettlementStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKrw } from "@/lib/labels";
import { formatDbDate, getDayOfWeekFromDateKey, getSeoulDateKey } from "@/lib/seoul-time";
import { cn } from "@/lib/utils";

type MemberRow = { id: string; name: string; part: string | null };
type RecordRow = {
  id: string;
  memberId: string;
  status: AttendanceStatus;
  note: string | null;
  calculatedAmount: number;
  settlementStatus: RecordSettlementStatus;
};
type EntryStatus = "NONE" | "LATE" | "ABSENT";
type SaveResult = {
  saved: number;
  deleted: number;
  skipped: { memberId: string; name: string | null; reason: string }[];
};

const STATUS_OPTIONS: { value: EntryStatus; label: string; activeClassName: string }[] = [
  { value: "NONE", label: "정상", activeClassName: "border-emerald-600 bg-emerald-600 text-white" },
  { value: "LATE", label: "지각", activeClassName: "border-amber-500 bg-amber-500 text-white" },
  { value: "ABSENT", label: "결석", activeClassName: "border-red-600 bg-red-600 text-white" },
];

/** 서울 기준 오늘 이전(오늘 포함) 가장 가까운 일요일 날짜 키 */
function getLatestSundayKey(): string {
  const todayKey = getSeoulDateKey();
  const dayOfWeek = getDayOfWeekFromDateKey(todayKey);
  const date = new Date(`${todayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - dayOfWeek);
  return date.toISOString().slice(0, 10);
}

export default function AdminSundayAttendancePage() {
  const [dateKey, setDateKey] = useState(getLatestSundayKey);
  const [loadedDateKey, setLoadedDateKey] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [approvedExcuseMemberIds, setApprovedExcuseMemberIds] = useState<string[]>([]);
  const [policy, setPolicy] = useState({ sundayLateAmount: 0, sundayAbsentAmount: 0 });
  const [entries, setEntries] = useState<Record<string, EntryStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  const isSunday = getDayOfWeekFromDateKey(dateKey) === 0;

  const loadData = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    setSaveResult(null);
    try {
      const response = await fetch(`/api/admin/sunday-attendance?date=${key}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? "출결 정보를 불러오지 못했습니다.");
        setLoadedDateKey(null);
        return;
      }
      const loadedRecords: RecordRow[] = data.records ?? [];
      const recordByMemberId = new Map(loadedRecords.map((record) => [record.memberId, record]));
      const nextEntries: Record<string, EntryStatus> = {};
      for (const member of data.members as MemberRow[]) {
        const record = recordByMemberId.get(member.id);
        nextEntries[member.id] = record ? record.status : "NONE";
      }
      setMembers(data.members ?? []);
      setRecords(loadedRecords);
      setApprovedExcuseMemberIds(data.approvedExcuseMemberIds ?? []);
      setPolicy(data.policy ?? { sundayLateAmount: 0, sundayAbsentAmount: 0 });
      setEntries(nextEntries);
      setLoadedDateKey(key);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoadedDateKey(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSunday) loadData(dateKey);
    // 최초 진입 시 자동 로드 (가장 가까운 일요일)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordByMemberId = useMemo(
    () => new Map(records.map((record) => [record.memberId, record])),
    [records],
  );
  const approvedSet = useMemo(() => new Set(approvedExcuseMemberIds), [approvedExcuseMemberIds]);

  const summary = useMemo(() => {
    let lateCount = 0;
    let absentCount = 0;
    let totalAmount = 0;
    for (const member of members) {
      if (approvedSet.has(member.id)) continue;
      const record = recordByMemberId.get(member.id);
      const locked = record && record.settlementStatus !== "UNSETTLED";
      const status = locked ? record!.status : entries[member.id] ?? "NONE";
      if (status === "LATE") {
        lateCount += 1;
        totalAmount += locked ? record!.calculatedAmount : policy.sundayLateAmount;
      } else if (status === "ABSENT") {
        absentCount += 1;
        totalAmount += locked ? record!.calculatedAmount : policy.sundayAbsentAmount;
      }
    }
    return { lateCount, absentCount, totalAmount };
  }, [members, entries, approvedSet, recordByMemberId, policy]);

  function updateEntry(memberId: string, status: EntryStatus) {
    setEntries((previous) => ({ ...previous, [memberId]: status }));
  }

  async function handleSave() {
    if (saving || !loadedDateKey) return;
    setSaving(true);
    setError("");
    setSaveResult(null);
    try {
      const payloadEntries = members
        .filter((member) => {
          if (approvedSet.has(member.id)) return false;
          const record = recordByMemberId.get(member.id);
          return !(record && record.settlementStatus !== "UNSETTLED");
        })
        .map((member) => ({
          memberId: member.id,
          status: entries[member.id] ?? "NONE",
        }));

      if (payloadEntries.length === 0) {
        setError("저장할 출결 내역이 없습니다.");
        return;
      }

      const response = await fetch("/api/admin/sunday-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: loadedDateKey, entries: payloadEntries }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? "저장에 실패했습니다.");
        return;
      }
      setSaveResult(data);
      loadData(loadedDateKey);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold sm:text-2xl">일요일 출결 체크</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">날짜 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1 sm:flex-none">
              <Label htmlFor="sunday-date">일요일 날짜</Label>
              <Input
                id="sunday-date"
                type="date"
                className="h-11 w-full sm:w-48"
                value={dateKey}
                onChange={(event) => setDateKey(event.target.value)}
              />
            </div>
            <Button
              type="button"
              className="h-11 w-full sm:w-auto"
              onClick={() => loadData(dateKey)}
              disabled={!isSunday || loading}
            >
              {loading ? "불러오는 중..." : "불러오기"}
            </Button>
          </div>
          {dateKey && !isSunday && (
            <p className="mt-2 text-sm text-amber-600">
              선택한 날짜는 일요일이 아닙니다. 일요일 날짜를 선택해주세요.
            </p>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {saveResult && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="space-y-1 pt-6 text-sm">
            <p className="font-medium text-emerald-700">
              저장 완료: 저장 {saveResult.saved}건 · 삭제 {saveResult.deleted}건 · 건너뜀 {saveResult.skipped.length}건
            </p>
            {saveResult.skipped.map((item) => (
              <p key={item.memberId} className="text-muted-foreground">
                - {item.name ?? item.memberId}: {item.reason}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {loadedDateKey && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {formatDbDate(new Date(`${loadedDateKey}T00:00:00.000Z`))} 현역 팀원 출결
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">현역 팀원이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {members.map((member) => {
                    const record = recordByMemberId.get(member.id);
                    const hasApprovedExcuse = approvedSet.has(member.id);
                    const isLocked = Boolean(record && record.settlementStatus !== "UNSETTLED");
                    const disabled = hasApprovedExcuse || isLocked;
                    const entryStatus = entries[member.id] ?? "NONE";

                    return (
                      <li
                        key={member.id}
                        className={cn(
                          "rounded-lg border p-3",
                          disabled && "bg-muted/40",
                        )}
                      >
                        <div className="sm:flex sm:items-center sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{member.name}</p>
                            {member.part && (
                              <p className="truncate text-xs text-muted-foreground">{member.part}</p>
                            )}
                          </div>

                          <div
                            role="group"
                            aria-label={`${member.name} 출결 상태`}
                            className="mt-3 grid grid-cols-3 gap-2 sm:mt-0 sm:w-64 sm:shrink-0"
                          >
                            {STATUS_OPTIONS.map((option) => {
                              const selected = entryStatus === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  aria-pressed={selected}
                                  disabled={disabled}
                                  onClick={() => updateEntry(member.id, option.value)}
                                  className={cn(
                                    "h-11 rounded-md border text-sm font-medium transition-colors",
                                    selected
                                      ? option.activeClassName
                                      : "border-input bg-background text-muted-foreground hover:bg-accent",
                                    disabled && "cursor-not-allowed opacity-50 hover:bg-background",
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>

                        </div>

                        {disabled && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {hasApprovedExcuse ? "사유 승인" : "정산 확정"} · 수정할 수 없습니다.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 모바일에서 명단이 길어도 저장 버튼이 항상 보이도록 하단 고정 */}
          <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-8 md:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-sm leading-tight">
                <p>
                  지각 <span className="font-semibold">{summary.lateCount}명</span> · 결석{" "}
                  <span className="font-semibold">{summary.absentCount}명</span>
                </p>
                <p className="text-muted-foreground">예상 합계 {formatKrw(summary.totalAmount)}</p>
              </div>
              <Button
                type="button"
                className="h-11 shrink-0 px-6"
                onClick={handleSave}
                disabled={saving || members.length === 0}
              >
                {saving ? "저장 중..." : "일괄 저장"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
