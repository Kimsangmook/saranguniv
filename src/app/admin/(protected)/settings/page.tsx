"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXCUSE_FUTURE_DAYS, EXCUSE_PAST_DAYS } from "@/lib/excuse-rules";
import type { SaturdayRate } from "@/lib/late-fee";
import { cn } from "@/lib/utils";

type PolicyResponse = {
  policy: {
    id: string | null;
    saturdayStartMinutes: number;
    saturdayRates: SaturdayRate[];
    sundayLateAmount: number;
    sundayAbsentAmount: number;
  };
};

/** 상한이 있는 구간 편집 행 (마지막 "이후" 행은 별도 상태로 관리) */
type RateRow = {
  key: number;
  throughMinute: string;
  amountPerMinute: string;
};

function minutesToTimeValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

let rowKeySeq = 0;
function nextRowKey(): number {
  rowKeySeq += 1;
  return rowKeySeq;
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [startTime, setStartTime] = React.useState("10:30");
  const [rateRows, setRateRows] = React.useState<RateRow[]>([]);
  const [lastRateAmount, setLastRateAmount] = React.useState("");
  const [sundayLateAmount, setSundayLateAmount] = React.useState("");
  const [sundayAbsentAmount, setSundayAbsentAmount] = React.useState("");

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const applyPolicy = React.useCallback((policy: PolicyResponse["policy"]) => {
    setStartTime(minutesToTimeValue(policy.saturdayStartMinutes));
    setSundayLateAmount(String(policy.sundayLateAmount));
    setSundayAbsentAmount(String(policy.sundayAbsentAmount));

    const bounded = policy.saturdayRates.filter((rate) => rate.throughMinute !== null);
    const unbounded = policy.saturdayRates.find((rate) => rate.throughMinute === null);
    setRateRows(
      bounded.map((rate) => ({
        key: nextRowKey(),
        throughMinute: String(rate.throughMinute),
        amountPerMinute: String(rate.amountPerMinute),
      })),
    );
    setLastRateAmount(String(unbounded?.amountPerMinute ?? ""));
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/settings/policy");
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? "정책을 불러오지 못했습니다.");
        }
        const data = (await res.json()) as PolicyResponse;
        if (!cancelled) {
          applyPolicy(data.policy);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "정책을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [applyPolicy]);

  const updateRow = (key: number, patch: Partial<Omit<RateRow, "key">>) => {
    setRateRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRateRows((rows) => [
      ...rows,
      { key: nextRowKey(), throughMinute: "", amountPerMinute: "" },
    ]);
  };

  const removeRow = (key: number) => {
    setRateRows((rows) => rows.filter((row) => row.key !== key));
  };

  /** 폼 값 → PUT 페이로드. 오류가 있으면 message 반환 */
  const buildPayload = ():
    | { ok: true; payload: Record<string, unknown> }
    | { ok: false; message: string } => {
    const minutes = timeValueToMinutes(startTime);
    if (minutes === null) {
      return { ok: false, message: "토요일 기준 시각을 입력해 주세요." };
    }

    const rates: SaturdayRate[] = [];
    for (let i = 0; i < rateRows.length; i += 1) {
      const row = rateRows[i];
      const through = Number(row.throughMinute);
      const amount = Number(row.amountPerMinute);
      if (!Number.isInteger(through) || through <= 0) {
        return { ok: false, message: `${i + 1}번째 구간의 상한 분을 1 이상의 정수로 입력해 주세요.` };
      }
      if (!Number.isInteger(amount) || amount <= 0) {
        return { ok: false, message: `${i + 1}번째 구간의 분당 금액을 1원 이상의 정수로 입력해 주세요.` };
      }
      const prev = rates[rates.length - 1];
      if (prev && prev.throughMinute !== null && through <= prev.throughMinute) {
        return { ok: false, message: "구간 상한 분은 오름차순으로 커져야 합니다." };
      }
      rates.push({ throughMinute: through, amountPerMinute: amount });
    }

    const lastAmount = Number(lastRateAmount);
    if (!Number.isInteger(lastAmount) || lastAmount <= 0) {
      return { ok: false, message: "'이후' 구간의 분당 금액을 1원 이상의 정수로 입력해 주세요." };
    }
    rates.push({ throughMinute: null, amountPerMinute: lastAmount });

    const late = Number(sundayLateAmount);
    if (!Number.isInteger(late) || late < 0) {
      return { ok: false, message: "일요일 지각 금액을 0원 이상의 정수로 입력해 주세요." };
    }
    const absent = Number(sundayAbsentAmount);
    if (!Number.isInteger(absent) || absent < 0) {
      return { ok: false, message: "일요일 결석 금액을 0원 이상의 정수로 입력해 주세요." };
    }

    return {
      ok: true,
      payload: {
        saturdayStartMinutes: minutes,
        saturdayRates: rates,
        sundayLateAmount: late,
        sundayAbsentAmount: absent,
      },
    };
  };

  const handleSaveClick = () => {
    setSuccessMessage(null);
    const result = buildPayload();
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setFormError(null);
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    const result = buildPayload();
    if (!result.ok) {
      setConfirmOpen(false);
      setFormError(result.message);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.payload),
      });
      const data = (await res.json().catch(() => null)) as
        | (PolicyResponse & { message?: string })
        | null;
      if (!res.ok) {
        throw new Error(data?.message ?? "저장에 실패했습니다.");
      }
      if (data?.policy) applyPolicy(data.policy);
      setFormError(null);
      setSuccessMessage("지각비 규칙이 저장되었습니다. 새 규칙은 이후 기록부터 적용됩니다.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">설정</h1>
        <p className="py-16 text-center text-sm text-muted-foreground">
          설정을 불러오는 중입니다...
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">설정</h1>
        <p className="py-16 text-center text-sm text-destructive">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          지각비 기본 규칙을 관리합니다. 저장 시 새 정책이 생성되며, 이미 확정된 정산에는 영향이
          없습니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">토요일 지각비 규칙</CardTitle>
          <CardDescription>
            기준 시각까지 도착하면 지각비가 없고, 이후에는 도착 시각이 속한 구간의 분당 금액을
            전체 지각 시간에 적용합니다. (누진 합산 아님)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="saturday-start-time">기준 시각</Label>
            <Input
              id="saturday-start-time"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">
              예: 10:30 — 10:30까지 도착하면 지각비가 없습니다.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>구간표</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                구간 추가
              </Button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
                <span>상한 (지각 분)</span>
                <span>분당 금액 (원)</span>
                <span className="w-16" />
              </div>

              {rateRows.map((row, index) => (
                <div key={row.key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="예: 10"
                    value={row.throughMinute}
                    onChange={(event) => updateRow(row.key, { throughMinute: event.target.value })}
                    aria-label={`${index + 1}번째 구간 상한 분`}
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="예: 100"
                    value={row.amountPerMinute}
                    onChange={(event) =>
                      updateRow(row.key, { amountPerMinute: event.target.value })
                    }
                    aria-label={`${index + 1}번째 구간 분당 금액`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-16 text-destructive hover:text-destructive"
                    onClick={() => removeRow(row.key)}
                  >
                    삭제
                  </Button>
                </div>
              ))}

              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <div
                  className={cn(
                    "flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm",
                    "text-muted-foreground",
                  )}
                >
                  이후 (상한 없음)
                </div>
                <Input
                  type="number"
                  min={1}
                  placeholder="예: 1000"
                  value={lastRateAmount}
                  onChange={(event) => setLastRateAmount(event.target.value)}
                  aria-label="마지막 구간 분당 금액"
                />
                <span className="w-16" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              마지막 &quot;이후&quot; 구간은 상한 없이 고정이며, 상한 분은 위에서부터 오름차순이어야
              합니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">일요일 지각·결석 금액</CardTitle>
          <CardDescription>일요일 예배 지각·결석 시 부과되는 고정 금액입니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sunday-late-amount">지각 금액 (원)</Label>
            <Input
              id="sunday-late-amount"
              type="number"
              min={0}
              value={sundayLateAmount}
              onChange={(event) => setSundayLateAmount(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sunday-absent-amount">결석 금액 (원)</Label>
            <Input
              id="sunday-absent-amount"
              type="number"
              min={0}
              value={sundayAbsentAmount}
              onChange={(event) => setSundayAbsentAmount(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {formError && <p className="text-sm text-destructive">{formError}</p>}
      {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSaveClick} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">사유 신청 허용 범위</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            팀원은 오늘 기준 과거 <span className="font-medium text-foreground">{EXCUSE_PAST_DAYS}일</span>부터
            미래 <span className="font-medium text-foreground">{EXCUSE_FUTURE_DAYS}일</span>까지의 토·일요일에
            대해 사유를 신청할 수 있습니다.
          </p>
          <p>이 범위는 코드 상수로 고정되어 있어 이 화면에서 변경할 수 없습니다.</p>
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!saving) setConfirmOpen(false);
        }}
        title="지각비 규칙 저장"
        description="새 규칙을 저장할까요? 이미 확정된 정산에는 영향이 없습니다."
      >
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmOpen(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="button" onClick={handleConfirmSave} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
