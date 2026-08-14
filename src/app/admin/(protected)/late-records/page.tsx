"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ATTENDANCE_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  MEMBER_STATUS_LABELS,
  RECORD_METHOD_LABELS,
  RECORD_SETTLEMENT_STATUS_LABELS,
  formatKrw,
} from "@/lib/labels";
import { dateKeyToDbDate, formatDbDate } from "@/lib/seoul-time";

type RecordRow = {
  id: string;
  attendanceDate: string;
  meetingType: "SATURDAY" | "SUNDAY";
  status: "LATE" | "ABSENT";
  standardTime: string | null;
  arrivedAt: string | null;
  lateMinutes: number | null;
  method: "QR" | "ADMIN_MANUAL";
  calculatedAmount: number;
  settlementStatus: "UNSETTLED" | "REQUESTED" | "COMPLETED";
  note: string | null;
  member: { id: string; name: string; status: string; part: string | null };
};

type RateRow = { throughMinute: string; amountPerMinute: string; isLast: boolean };

type PreviewMember = {
  memberId: string;
  memberName: string;
  saturdayAmount: number;
  sundayLateAmount: number;
  sundayAbsentAmount: number;
  totalAmount: number;
  recordCount: number;
};

type PreviewResult = {
  perMember: PreviewMember[];
  totalAmount: number;
  recordCount: number;
  errors: string[];
};

const SETTLEMENT_BADGE_VARIANT = {
  UNSETTLED: "warning",
  REQUESTED: "secondary",
  COMPLETED: "success",
} as const;

// ---------------------------------------------------------------------------
// 서울 시간 표시/변환 헬퍼 (클라이언트 표시 전용 — 금액 계산은 전부 서버)
// ---------------------------------------------------------------------------

function seoulParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map(({ type, value }) => [type, value])) as Record<
    "year" | "month" | "day" | "hour" | "minute",
    string
  >;
}

/** ISO timestamp → 서울 기준 "HH:MM" */
function seoulHm(iso: string | null): string {
  if (!iso) return "-";
  const { hour, minute } = seoulParts(iso);
  return `${hour}:${minute}`;
}

/** ISO timestamp → datetime-local 입력값 (서울 기준) */
function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const { year, month, day, hour, minute } = seoulParts(iso);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** datetime-local 입력값(서울 기준) → ISO */
function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** "HH:MM" → 자정 기준 분 */
function timeLabelToMinutes(label: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(label);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

/** 자정 기준 분 → "HH:MM" */
function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function LateRecordsPage() {
  const router = useRouter();

  // 필터
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [meetingType, setMeetingType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [settlementStatus, setSettlementStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [memberStatus, setMemberStatus] = React.useState("");

  const [records, setRecords] = React.useState<RecordRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [listError, setListError] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const fetchRecords = React.useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (meetingType) params.set("meetingType", meetingType);
      if (status) params.set("status", status);
      if (settlementStatus) params.set("settlementStatus", settlementStatus);
      if (q.trim()) params.set("q", q.trim());
      if (memberStatus) params.set("memberStatus", memberStatus);

      const res = await fetch(`/api/admin/late-records?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "목록을 불러오지 못했습니다.");
      setRecords(data.records as RecordRow[]);
      setSelected((prev) => {
        const validIds = new Set((data.records as RecordRow[]).map((r) => r.id));
        return new Set([...prev].filter((rid) => validIds.has(rid)));
      });
    } catch (error) {
      setListError(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [from, to, meetingType, status, settlementStatus, q, memberStatus]);

  React.useEffect(() => {
    void fetchRecords();
    // 최초 1회만 자동 조회, 이후에는 조회 버튼 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unsettledIds = React.useMemo(
    () => records.filter((r) => r.settlementStatus === "UNSETTLED").map((r) => r.id),
    [records],
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    invalidatePreview();
  };

  const selectAllUnsettled = () => {
    setSelected(new Set(unsettledIds));
    invalidatePreview();
  };

  const allUnsettledSelected =
    unsettledIds.length > 0 && unsettledIds.every((id) => selected.has(id));

  // -------------------------------------------------------------------------
  // 수정 Dialog
  // -------------------------------------------------------------------------
  const [editTarget, setEditTarget] = React.useState<RecordRow | null>(null);
  const [editArrivedAt, setEditArrivedAt] = React.useState("");
  const [editStatus, setEditStatus] = React.useState<"LATE" | "ABSENT">("LATE");
  const [editNote, setEditNote] = React.useState("");
  const [editReason, setEditReason] = React.useState("");
  const [editError, setEditError] = React.useState("");
  const [editSubmitting, setEditSubmitting] = React.useState(false);

  const openEdit = (record: RecordRow) => {
    setEditTarget(record);
    setEditArrivedAt(isoToDatetimeLocal(record.arrivedAt));
    setEditStatus(record.status);
    setEditNote(record.note ?? "");
    setEditReason("");
    setEditError("");
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!editReason.trim()) {
      setEditError("수정 사유를 입력해주세요.");
      return;
    }
    setEditSubmitting(true);
    setEditError("");
    try {
      const body: Record<string, unknown> = {
        status: editStatus,
        note: editNote.trim() === "" ? null : editNote.trim(),
        reason: editReason.trim(),
      };
      if (editArrivedAt) {
        const iso = datetimeLocalToIso(editArrivedAt);
        if (!iso) {
          setEditError("도착 시각이 올바르지 않습니다.");
          setEditSubmitting(false);
          return;
        }
        body.arrivedAt = iso;
      }
      const res = await fetch(`/api/admin/late-records/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "수정에 실패했습니다.");
      setEditTarget(null);
      await fetchRecords();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "수정에 실패했습니다.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // 무효화 Dialog
  // -------------------------------------------------------------------------
  const [voidTarget, setVoidTarget] = React.useState<RecordRow | null>(null);
  const [voidReason, setVoidReason] = React.useState("");
  const [voidError, setVoidError] = React.useState("");
  const [voidSubmitting, setVoidSubmitting] = React.useState(false);

  const submitVoid = async () => {
    if (!voidTarget) return;
    if (!voidReason.trim()) {
      setVoidError("무효화 사유를 입력해주세요.");
      return;
    }
    setVoidSubmitting(true);
    setVoidError("");
    try {
      const res = await fetch(`/api/admin/late-records/${voidTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "무효화에 실패했습니다.");
      setVoidTarget(null);
      setVoidReason("");
      await fetchRecords();
    } catch (error) {
      setVoidError(error instanceof Error ? error.message : "무효화에 실패했습니다.");
    } finally {
      setVoidSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // 정산 만들기 Dialog
  // -------------------------------------------------------------------------
  const [settleOpen, setSettleOpen] = React.useState(false);
  const [settleTitle, setSettleTitle] = React.useState("");
  const [settleFrom, setSettleFrom] = React.useState("");
  const [settleTo, setSettleTo] = React.useState("");
  const [ruleStartTime, setRuleStartTime] = React.useState("10:30");
  const [rateRows, setRateRows] = React.useState<RateRow[]>([]);
  const [ruleSundayLate, setRuleSundayLate] = React.useState("3000");
  const [ruleSundayAbsent, setRuleSundayAbsent] = React.useState("3000");
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [settleError, setSettleError] = React.useState("");
  const [confirmChecked, setConfirmChecked] = React.useState(false);
  const [confirmSubmitting, setConfirmSubmitting] = React.useState(false);

  /** 미리보기 이후 규칙·기간·선택 기록이 바뀌면 미리보기를 무효화한다 (확정 버튼 다시 비활성). */
  const invalidatePreview = React.useCallback(() => {
    setPreview(null);
    setConfirmChecked(false);
  }, []);

  /** 규칙 편집 폼 → 서버 rules 객체. 올바르지 않으면 null */
  const buildRules = React.useCallback(() => {
    const startMinutes = timeLabelToMinutes(ruleStartTime);
    if (startMinutes === null) return null;
    const rates: { throughMinute: number | null; amountPerMinute: number }[] = [];
    for (const row of rateRows) {
      const amount = Number(row.amountPerMinute);
      if (!Number.isInteger(amount) || amount < 0) return null;
      if (row.isLast) {
        rates.push({ throughMinute: null, amountPerMinute: amount });
      } else {
        const through = Number(row.throughMinute);
        if (!Number.isInteger(through) || through <= 0) return null;
        rates.push({ throughMinute: through, amountPerMinute: amount });
      }
    }
    const sundayLate = Number(ruleSundayLate);
    const sundayAbsent = Number(ruleSundayAbsent);
    if (!Number.isInteger(sundayLate) || sundayLate < 0) return null;
    if (!Number.isInteger(sundayAbsent) || sundayAbsent < 0) return null;
    return {
      saturdayStartMinutes: startMinutes,
      saturdayRates: rates,
      sundayLateAmount: sundayLate,
      sundayAbsentAmount: sundayAbsent,
    };
  }, [ruleStartTime, rateRows, ruleSundayLate, ruleSundayAbsent]);

  const requestPreview = React.useCallback(
    async (params: {
      periodStart: string;
      periodEnd: string;
      rules?: ReturnType<typeof buildRules>;
    }) => {
      setPreviewLoading(true);
      setSettleError("");
      try {
        const res = await fetch("/api/admin/settlements/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            recordIds: [...selected],
            rules: params.rules ?? undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message ?? "미리보기에 실패했습니다.");
        setPreview({
          perMember: data.perMember,
          totalAmount: data.totalAmount,
          recordCount: data.recordCount,
          errors: data.errors,
        });
        return data;
      } catch (error) {
        setSettleError(error instanceof Error ? error.message : "미리보기에 실패했습니다.");
        return null;
      } finally {
        setPreviewLoading(false);
      }
    },
    [selected],
  );

  const openSettlement = async () => {
    if (selected.size === 0) return;
    // 기간 기본값: 필터 기간, 없으면 선택된 기록의 최소·최대 날짜
    const selectedDates = records
      .filter((r) => selected.has(r.id))
      .map((r) => r.attendanceDate)
      .sort();
    const periodStart = from || selectedDates[0] || "";
    const periodEnd = to || selectedDates[selectedDates.length - 1] || "";

    setSettleFrom(periodStart);
    setSettleTo(periodEnd);
    setSettleTitle(`${periodStart} ~ ${periodEnd} 지각비 정산`);
    setPreview(null);
    setSettleError("");
    setConfirmChecked(false);
    setSettleOpen(true);

    // 활성 정책을 preview 응답에서 받아 규칙 편집 기본값으로 사용
    const data = await requestPreview({ periodStart, periodEnd });
    if (data?.activePolicy) {
      const policy = data.activePolicy as {
        saturdayStartMinutes: number;
        saturdayRates: { throughMinute: number | null; amountPerMinute: number }[];
        sundayLateAmount: number;
        sundayAbsentAmount: number;
      };
      setRuleStartTime(minutesToTimeLabel(policy.saturdayStartMinutes));
      setRateRows(
        policy.saturdayRates.map((rate, index) => ({
          throughMinute: rate.throughMinute === null ? "" : String(rate.throughMinute),
          amountPerMinute: String(rate.amountPerMinute),
          isLast: index === policy.saturdayRates.length - 1,
        })),
      );
      setRuleSundayLate(String(policy.sundayLateAmount));
      setRuleSundayAbsent(String(policy.sundayAbsentAmount));
    }
  };

  const handlePreviewClick = async () => {
    const rules = buildRules();
    if (!rules) {
      setSettleError("적용 규칙을 올바르게 입력해주세요.");
      return;
    }
    if (!settleFrom || !settleTo) {
      setSettleError("정산 기간을 입력해주세요.");
      return;
    }
    setConfirmChecked(false);
    await requestPreview({ periodStart: settleFrom, periodEnd: settleTo, rules });
  };

  const handleConfirmSettlement = async () => {
    const rules = buildRules();
    if (!rules) {
      setSettleError("적용 규칙을 올바르게 입력해주세요.");
      return;
    }
    if (!settleTitle.trim()) {
      setSettleError("정산명을 입력해주세요.");
      return;
    }
    setConfirmSubmitting(true);
    setSettleError("");
    try {
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: settleTitle.trim(),
          periodStart: settleFrom,
          periodEnd: settleTo,
          recordIds: [...selected],
          rules,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "정산 확정에 실패했습니다.");
      router.push(`/admin/settlements/${data.id}`);
    } catch (error) {
      setSettleError(error instanceof Error ? error.message : "정산 확정에 실패했습니다.");
      setConfirmSubmitting(false);
    }
  };

  const canConfirm =
    preview !== null && preview.errors.length === 0 && preview.recordCount > 0 && confirmChecked;

  // -------------------------------------------------------------------------
  // 렌더링
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">통합 출결 기록</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={selectAllUnsettled} disabled={unsettledIds.length === 0}>
            기간 내 미정산 전체 선택
          </Button>
          <Button onClick={openSettlement} disabled={selected.size === 0}>
            선택 {selected.size}건 정산 만들기
          </Button>
        </div>
      </div>

      {/* 필터 바 */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <div className="space-y-1">
              <Label htmlFor="filter-from">시작일</Label>
              <Input
                id="filter-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to">종료일</Label>
              <Input id="filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-meeting">모임 유형</Label>
              <Select
                id="filter-meeting"
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value)}
              >
                <option value="">전체</option>
                <option value="SATURDAY">토요일</option>
                <option value="SUNDAY">일요일</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-status">출결 상태</Label>
              <Select id="filter-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">전체</option>
                <option value="LATE">지각</option>
                <option value="ABSENT">결석</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-settlement">정산 상태</Label>
              <Select
                id="filter-settlement"
                value={settlementStatus}
                onChange={(e) => setSettlementStatus(e.target.value)}
              >
                <option value="">전체</option>
                <option value="UNSETTLED">미정산</option>
                <option value="REQUESTED">정산 요청</option>
                <option value="COMPLETED">정산 완료</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-member-status">활동 상태</Label>
              <Select
                id="filter-member-status"
                value={memberStatus}
                onChange={(e) => setMemberStatus(e.target.value)}
              >
                <option value="">전체</option>
                {Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-q">팀원명 검색</Label>
              <Input
                id="filter-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="이름"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={fetchRecords} disabled={loading}>
              {loading ? "조회 중..." : "조회"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {listError && <p className="text-sm text-destructive">{listError}</p>}

      {/* 기록 표 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            출결 기록 {records.length}건 (선택 {selected.size}건)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="미정산 전체 선택"
                    checked={allUnsettledSelected}
                    disabled={unsettledIds.length === 0}
                    onChange={() => {
                      if (allUnsettledSelected) {
                        setSelected(new Set());
                        invalidatePreview();
                      } else {
                        selectAllUnsettled();
                      }
                    }}
                  />
                </TableHead>
                <TableHead>날짜</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>팀원</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>기준 시각</TableHead>
                <TableHead>도착 시각</TableHead>
                <TableHead className="text-right">지각 분</TableHead>
                <TableHead>방식</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>정산 상태</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground">
                    {loading ? "불러오는 중..." : "조건에 맞는 기록이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => {
                  const selectable = record.settlementStatus === "UNSETTLED";
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Checkbox
                          aria-label="기록 선택"
                          checked={selected.has(record.id)}
                          disabled={!selectable}
                          onChange={() => toggleSelect(record.id)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDbDate(dateKeyToDbDate(record.attendanceDate))}
                      </TableCell>
                      <TableCell>{MEETING_TYPE_LABELS[record.meetingType]}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {record.member.name}
                      </TableCell>
                      <TableCell>{ATTENDANCE_STATUS_LABELS[record.status]}</TableCell>
                      <TableCell>{seoulHm(record.standardTime)}</TableCell>
                      <TableCell>{seoulHm(record.arrivedAt)}</TableCell>
                      <TableCell className="text-right">
                        {record.lateMinutes === null ? "-" : `${record.lateMinutes}분`}
                      </TableCell>
                      <TableCell>{RECORD_METHOD_LABELS[record.method]}</TableCell>
                      <TableCell className="text-right">
                        {formatKrw(record.calculatedAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SETTLEMENT_BADGE_VARIANT[record.settlementStatus]}>
                          {RECORD_SETTLEMENT_STATUS_LABELS[record.settlementStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-32 truncate" title={record.note ?? ""}>
                        {record.note ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!selectable}
                            onClick={() => openEdit(record)}
                          >
                            수정
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={!selectable}
                            onClick={() => {
                              setVoidTarget(record);
                              setVoidReason("");
                              setVoidError("");
                            }}
                          >
                            무효화
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 수정 Dialog */}
      <Dialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="출결 기록 수정"
        description={
          editTarget
            ? `${editTarget.member.name} · ${formatDbDate(dateKeyToDbDate(editTarget.attendanceDate))} · ${MEETING_TYPE_LABELS[editTarget.meetingType]}`
            : undefined
        }
      >
        {editTarget && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-arrived">도착 시각</Label>
              <Input
                id="edit-arrived"
                type="datetime-local"
                value={editArrivedAt}
                onChange={(e) => setEditArrivedAt(e.target.value)}
              />
              {editTarget.meetingType === "SATURDAY" && (
                <p className="text-xs text-muted-foreground">
                  토요일 기록은 도착 시각 변경 시 지각 분과 금액이 서버에서 재계산됩니다.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-status">출결 상태</Label>
              <Select
                id="edit-status"
                value={editStatus}
                disabled={editTarget.meetingType === "SATURDAY"}
                onChange={(e) => setEditStatus(e.target.value as "LATE" | "ABSENT")}
              >
                <option value="LATE">지각</option>
                {editTarget.meetingType === "SUNDAY" && <option value="ABSENT">결석</option>}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-note">메모</Label>
              <Textarea
                id="edit-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-reason">수정 사유 (필수)</Label>
              <Input
                id="edit-reason"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="예: 도착 시각 오기록 정정"
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)}>
                취소
              </Button>
              <Button onClick={submitEdit} disabled={editSubmitting}>
                {editSubmitting ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </Dialog>

      {/* 무효화 Dialog */}
      <Dialog
        open={voidTarget !== null}
        onClose={() => setVoidTarget(null)}
        title="출결 기록 무효화"
        description={
          voidTarget
            ? `${voidTarget.member.name} · ${formatDbDate(dateKeyToDbDate(voidTarget.attendanceDate))} 기록을 무효화합니다. 무효화된 기록은 목록에서 제거되며 감사 로그에 보존됩니다.`
            : undefined
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="void-reason">무효화 사유 (필수)</Label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="예: 중복 기록"
            />
          </div>
          {voidError && <p className="text-sm text-destructive">{voidError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              취소
            </Button>
            <Button variant="destructive" onClick={submitVoid} disabled={voidSubmitting}>
              {voidSubmitting ? "처리 중..." : "무효화"}
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* 정산 만들기 Dialog */}
      <Dialog
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        title="정산 만들기"
        description={`선택된 기록 ${selected.size}건으로 정산을 생성합니다.`}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="settle-title">정산명</Label>
            <Input
              id="settle-title"
              value={settleTitle}
              onChange={(e) => setSettleTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="settle-from">정산 시작일</Label>
              <Input
                id="settle-from"
                type="date"
                value={settleFrom}
                onChange={(e) => {
                  setSettleFrom(e.target.value);
                  invalidatePreview();
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="settle-to">정산 종료일</Label>
              <Input
                id="settle-to"
                type="date"
                value={settleTo}
                onChange={(e) => {
                  setSettleTo(e.target.value);
                  invalidatePreview();
                }}
              />
            </div>
          </div>

          {/* 규칙 편집 */}
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm font-semibold">적용 규칙 (확정 전까지만 수정 가능)</p>
            <div className="space-y-1">
              <Label htmlFor="rule-start">토요일 기준 시각</Label>
              <Input
                id="rule-start"
                type="time"
                value={ruleStartTime}
                onChange={(e) => {
                  setRuleStartTime(e.target.value);
                  invalidatePreview();
                }}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label>토요일 과금 구간 (구간 상한 분 · 분당 금액)</Label>
              {rateRows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  {row.isLast ? (
                    <span className="w-40 text-sm text-muted-foreground">
                      {rateRows.length > 1 && rateRows[index - 1]?.throughMinute
                        ? `${Number(rateRows[index - 1].throughMinute) + 1}분 이상`
                        : "그 이상"}
                    </span>
                  ) : (
                    <div className="flex w-40 items-center gap-1">
                      <Input
                        type="number"
                        value={row.throughMinute}
                        onChange={(e) => {
                          setRateRows((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, throughMinute: e.target.value } : r,
                            ),
                          );
                          invalidatePreview();
                        }}
                        aria-label={`구간 ${index + 1} 상한(분)`}
                      />
                      <span className="whitespace-nowrap text-sm text-muted-foreground">분까지</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={row.amountPerMinute}
                      onChange={(e) => {
                        setRateRows((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, amountPerMinute: e.target.value } : r,
                          ),
                        );
                        invalidatePreview();
                      }}
                      className="w-28"
                      aria-label={`구간 ${index + 1} 분당 금액`}
                    />
                    <span className="whitespace-nowrap text-sm text-muted-foreground">원/분</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rule-sunday-late">일요일 지각 금액</Label>
                <Input
                  id="rule-sunday-late"
                  type="number"
                  value={ruleSundayLate}
                  onChange={(e) => {
                    setRuleSundayLate(e.target.value);
                    invalidatePreview();
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-sunday-absent">일요일 결석 금액</Label>
                <Input
                  id="rule-sunday-absent"
                  type="number"
                  value={ruleSundayAbsent}
                  onChange={(e) => {
                    setRuleSundayAbsent(e.target.value);
                    invalidatePreview();
                  }}
                />
              </div>
            </div>
            <Button variant="secondary" onClick={handlePreviewClick} disabled={previewLoading}>
              {previewLoading ? "계산 중..." : "미리보기"}
            </Button>
          </div>

          {/* 미리보기 결과 */}
          {preview && (
            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-semibold">
                미리보기 · 기록 {preview.recordCount}건 · 총액 {formatKrw(preview.totalAmount)}
              </p>
              {preview.errors.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                  {preview.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              )}
              {preview.perMember.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>팀원</TableHead>
                      <TableHead className="text-right">토요일</TableHead>
                      <TableHead className="text-right">일요일 지각</TableHead>
                      <TableHead className="text-right">일요일 결석</TableHead>
                      <TableHead className="text-right">합계</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.perMember.map((member) => (
                      <TableRow key={member.memberId}>
                        <TableCell>{member.memberName}</TableCell>
                        <TableCell className="text-right">
                          {formatKrw(member.saturdayAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatKrw(member.sundayLateAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatKrw(member.sundayAbsentAmount)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatKrw(member.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold">총합</TableCell>
                      <TableCell colSpan={3} />
                      <TableCell className="text-right font-bold">
                        {formatKrw(preview.totalAmount)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              className="mt-0.5"
            />
            <span>정산을 확정하면 포함된 기록과 금액을 수정할 수 없습니다. 확인했습니다.</span>
          </label>

          {settleError && <p className="text-sm text-destructive">{settleError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleOpen(false)}>
              취소
            </Button>
            <Button onClick={handleConfirmSettlement} disabled={!canConfirm || confirmSubmitting}>
              {confirmSubmitting ? "확정 중..." : "정산 확정"}
            </Button>
          </DialogFooter>
        </div>
      </Dialog>
    </div>
  );
}
