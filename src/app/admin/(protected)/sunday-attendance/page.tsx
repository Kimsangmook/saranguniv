"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceStatus, RecordSettlementStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RECORD_SETTLEMENT_STATUS_LABELS, formatKrw } from "@/lib/labels";
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

const STATUS_OPTIONS: { value: EntryStatus; label: string }[] = [
  { value: "NONE", label: "정상" },
  { value: "LATE", label: "지각" },
  { value: "ABSENT", label: "결석" },
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
  const [entries, setEntries] = useState<Record<string, { status: EntryStatus; note: string }>>({});
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
      const nextEntries: Record<string, { status: EntryStatus; note: string }> = {};
      for (const member of data.members as MemberRow[]) {
        const record = recordByMemberId.get(member.id);
        nextEntries[member.id] = {
          status: record ? record.status : "NONE",
          note: record?.note ?? "",
        };
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
      const status = locked ? record!.status : entries[member.id]?.status ?? "NONE";
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

  function updateEntry(memberId: string, patch: Partial<{ status: EntryStatus; note: string }>) {
    setEntries((previous) => ({
      ...previous,
      [memberId]: { ...(previous[memberId] ?? { status: "NONE", note: "" }), ...patch },
    }));
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
          status: entries[member.id]?.status ?? "NONE",
          note: entries[member.id]?.note || undefined,
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">일요일 출결 체크</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">날짜 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="sunday-date">일요일 날짜</Label>
              <Input
                id="sunday-date"
                type="date"
                className="sm:w-48"
                value={dateKey}
                onChange={(event) => setDateKey(event.target.value)}
              />
            </div>
            <Button type="button" onClick={() => loadData(dateKey)} disabled={!isSunday || loading}>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {formatDbDate(new Date(`${loadedDateKey}T00:00:00.000Z`))} 현역 팀원 출결
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {members.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">현역 팀원이 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>파트</TableHead>
                    <TableHead>출결</TableHead>
                    <TableHead>메모</TableHead>
                    <TableHead>비고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const record = recordByMemberId.get(member.id);
                    const hasApprovedExcuse = approvedSet.has(member.id);
                    const isLocked = Boolean(record && record.settlementStatus !== "UNSETTLED");
                    const disabled = hasApprovedExcuse || isLocked;
                    const entry = entries[member.id] ?? { status: "NONE" as EntryStatus, note: "" };

                    return (
                      <TableRow key={member.id} className={cn(disabled && "bg-muted/40")}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.part ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-3">
                            {STATUS_OPTIONS.map((option) => (
                              <label
                                key={option.value}
                                className={cn(
                                  "flex items-center gap-1 text-sm",
                                  disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                                )}
                              >
                                <input
                                  type="radio"
                                  name={`status-${member.id}`}
                                  className="accent-primary"
                                  checked={entry.status === option.value}
                                  disabled={disabled}
                                  onChange={() => updateEntry(member.id, { status: option.value })}
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-9 min-w-32"
                            placeholder="메모"
                            value={entry.note}
                            disabled={disabled}
                            onChange={(event) => updateEntry(member.id, { note: event.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          {hasApprovedExcuse ? (
                            <span className="flex items-center gap-2">
                              <Badge variant="success">사유 승인</Badge>
                              <span className="text-sm text-muted-foreground">{formatKrw(0)}</span>
                            </span>
                          ) : isLocked ? (
                            <span className="flex items-center gap-2">
                              <Badge variant="warning">
                                {RECORD_SETTLEMENT_STATUS_LABELS[record!.settlementStatus]}
                              </Badge>
                              <span className="text-sm text-muted-foreground">수정 불가</span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                지각 <span className="font-semibold">{summary.lateCount}명</span> · 결석{" "}
                <span className="font-semibold">{summary.absentCount}명</span> · 예상 금액 합계{" "}
                <span className="font-semibold">{formatKrw(summary.totalAmount)}</span>
              </p>
              <Button type="button" onClick={handleSave} disabled={saving || members.length === 0}>
                {saving ? "저장 중..." : "일괄 저장"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
