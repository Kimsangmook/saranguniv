"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { SETTLEMENT_STATUS_LABELS, formatKrw } from "@/lib/labels";
import { dateKeyToDbDate, formatDbDate, getSeoulTimeLabel } from "@/lib/seoul-time";

type SettlementRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "REQUESTED" | "COMPLETED";
  totalAmount: number;
  confirmedAt: string;
  completedAt: string | null;
  memberCount: number;
  paidMemberCount: number;
};

export default function SettlementsPage() {
  const router = useRouter();

  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [settlements, setSettlements] = React.useState<SettlementRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const fetchSettlements = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/settlements?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "목록을 불러오지 못했습니다.");
      setSettlements(data.settlements as SettlementRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [from, to, status]);

  React.useEffect(() => {
    void fetchSettlements();
    // 최초 1회만 자동 조회, 이후에는 조회 버튼 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">정산 목록</h1>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
              <Label htmlFor="filter-status">상태</Label>
              <Select
                id="filter-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">전체</option>
                <option value="REQUESTED">정산 요청</option>
                <option value="COMPLETED">정산 완료</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={fetchSettlements} disabled={loading}>
                {loading ? "조회 중..." : "조회"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>정산명</TableHead>
                <TableHead>기간</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead>납부 진행</TableHead>
                <TableHead>확정일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {loading ? "불러오는 중..." : "정산이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                settlements.map((settlement) => (
                  <TableRow
                    key={settlement.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/settlements/${settlement.id}`)}
                  >
                    <TableCell className="font-medium">{settlement.name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDbDate(dateKeyToDbDate(settlement.startDate))} ~{" "}
                      {formatDbDate(dateKeyToDbDate(settlement.endDate))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={settlement.status === "COMPLETED" ? "success" : "secondary"}
                      >
                        {SETTLEMENT_STATUS_LABELS[settlement.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatKrw(settlement.totalAmount)}
                    </TableCell>
                    <TableCell>
                      {settlement.paidMemberCount}/{settlement.memberCount}명
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {getSeoulTimeLabel(new Date(settlement.confirmedAt))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
