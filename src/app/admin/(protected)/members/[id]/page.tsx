"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  AttendanceStatus,
  ExcuseStatus,
  ExcuseType,
  MeetingType,
  MemberStatus,
  PaymentStatus,
  RecordSettlementStatus,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTENDANCE_STATUS_LABELS,
  EXCUSE_STATUS_LABELS,
  EXCUSE_TYPE_LABELS,
  MEETING_TYPE_LABELS,
  MEMBER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  RECORD_SETTLEMENT_STATUS_LABELS,
  formatKrw,
} from "@/lib/labels";
import { formatDbDate } from "@/lib/seoul-time";

type MemberDetail = {
  id: string;
  name: string;
  part: string | null;
  contact: string | null;
  status: MemberStatus;
  joinedAt: string;
  publicDisplayName: string | null;
  note: string | null;
  attendanceRecords: {
    id: string;
    attendanceDate: string;
    meetingType: MeetingType;
    status: AttendanceStatus;
    lateMinutes: number | null;
    calculatedAmount: number;
    settlementStatus: RecordSettlementStatus;
  }[];
  excuseRequests: {
    id: string;
    targetDate: string;
    type: ExcuseType;
    status: ExcuseStatus;
  }[];
  settlementItems: {
    id: string;
    amount: number;
    paymentStatus: PaymentStatus;
    settlement: { id: string; name: string };
  }[];
};

const SETTLEMENT_BADGE_VARIANTS: Record<RecordSettlementStatus, "outline" | "warning" | "success"> = {
  UNSETTLED: "outline",
  REQUESTED: "warning",
  COMPLETED: "success",
};

const EXCUSE_BADGE_VARIANTS: Record<ExcuseStatus, "warning" | "success" | "destructive" | "outline"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELED: "outline",
};

export default function AdminMemberDetailPage() {
  const params = useParams<{ id: string }>();
  const memberId = params.id;

  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    part: "",
    contact: "",
    joinedAt: "",
    publicDisplayName: "",
    note: "",
  });
  const [infoMessage, setInfoMessage] = useState("");
  const [infoError, setInfoError] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [statusValue, setStatusValue] = useState<MemberStatus>("ACTIVE");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const loadMember = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/members/${memberId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "failed");
      const detail = data.member as MemberDetail;
      setMember(detail);
      setForm({
        name: detail.name,
        part: detail.part ?? "",
        contact: detail.contact ?? "",
        joinedAt: detail.joinedAt.slice(0, 10),
        publicDisplayName: detail.publicDisplayName ?? "",
        note: detail.note ?? "",
      });
      setStatusValue(detail.status);
    } catch {
      setError("팀원 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    loadMember();
  }, [loadMember]);

  async function handleSaveInfo(event: FormEvent) {
    event.preventDefault();
    if (savingInfo) return;
    setInfoMessage("");
    setInfoError("");
    if (!form.name.trim()) {
      setInfoError("이름을 입력해주세요.");
      return;
    }
    setSavingInfo(true);
    try {
      const response = await fetch(`/api/admin/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          part: form.part,
          contact: form.contact,
          joinedAt: form.joinedAt,
          publicDisplayName: form.publicDisplayName,
          note: form.note,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setInfoError(data.message ?? "저장에 실패했습니다.");
        return;
      }
      setInfoMessage("팀원 정보를 저장했습니다.");
      loadMember();
    } catch {
      setInfoError("네트워크 오류가 발생했습니다.");
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleSaveStatus() {
    if (savingStatus) return;
    setStatusMessage("");
    setStatusError("");
    setSavingStatus(true);
    try {
      const response = await fetch(`/api/admin/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusValue }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusError(data.message ?? "상태 변경에 실패했습니다.");
        return;
      }
      setStatusMessage(`활동 상태를 '${MEMBER_STATUS_LABELS[statusValue]}'(으)로 변경했습니다.`);
      loadMember();
    } catch {
      setStatusError("네트워크 오류가 발생했습니다.");
    } finally {
      setSavingStatus(false);
    }
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>;
  }
  if (error || !member) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-sm text-destructive">{error || "팀원을 찾을 수 없습니다."}</p>
        <Button asChild variant="outline">
          <Link href="/admin/members">목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/members">← 목록</Link>
        </Button>
        <h1 className="text-2xl font-bold">{member.name}</h1>
        <Badge variant={member.status === "ACTIVE" ? "success" : "secondary"}>
          {MEMBER_STATUS_LABELS[member.status]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">정보 수정</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSaveInfo}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-name">이름 *</Label>
                  <Input
                    id="edit-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-part">파트</Label>
                  <Input
                    id="edit-part"
                    value={form.part}
                    onChange={(event) => setForm({ ...form, part: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-contact">연락처</Label>
                  <Input
                    id="edit-contact"
                    value={form.contact}
                    onChange={(event) => setForm({ ...form, contact: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-joined-at">가입일</Label>
                  <Input
                    id="edit-joined-at"
                    type="date"
                    value={form.joinedAt}
                    onChange={(event) => setForm({ ...form, joinedAt: event.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="edit-public-name">공개 표시 이름</Label>
                  <Input
                    id="edit-public-name"
                    value={form.publicDisplayName}
                    onChange={(event) => setForm({ ...form, publicDisplayName: event.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="edit-note">비고</Label>
                  <Textarea
                    id="edit-note"
                    rows={3}
                    value={form.note}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                  />
                </div>
              </div>
              {infoError && <p className="text-sm text-destructive">{infoError}</p>}
              {infoMessage && <p className="text-sm text-emerald-600">{infoMessage}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={savingInfo}>
                  {savingInfo ? "저장 중..." : "정보 저장"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">활동 상태 변경</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              활동을 중단해도 삭제하지 않고 상태만 변경합니다. 기존 출결·정산 기록은 유지됩니다.
            </p>
            <Select
              value={statusValue}
              onChange={(event) => setStatusValue(event.target.value as MemberStatus)}
            >
              {Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            {statusError && <p className="text-sm text-destructive">{statusError}</p>}
            {statusMessage && <p className="text-sm text-emerald-600">{statusMessage}</p>}
            <Button
              type="button"
              className="w-full"
              onClick={handleSaveStatus}
              disabled={savingStatus || statusValue === member.status}
            >
              {savingStatus ? "저장 중..." : "상태 저장"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">출결 기록</CardTitle>
        </CardHeader>
        <CardContent>
          {member.attendanceRecords.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">출결 기록이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>금액</TableHead>
                  <TableHead>정산 상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {member.attendanceRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{formatDbDate(new Date(record.attendanceDate))}</TableCell>
                    <TableCell>{MEETING_TYPE_LABELS[record.meetingType]}</TableCell>
                    <TableCell>
                      {ATTENDANCE_STATUS_LABELS[record.status]}
                      {record.lateMinutes !== null ? ` (${record.lateMinutes}분)` : ""}
                    </TableCell>
                    <TableCell>{formatKrw(record.calculatedAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={SETTLEMENT_BADGE_VARIANTS[record.settlementStatus]}>
                        {RECORD_SETTLEMENT_STATUS_LABELS[record.settlementStatus]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">사유 신청</CardTitle>
        </CardHeader>
        <CardContent>
          {member.excuseRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">사유 신청 내역이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {member.excuseRequests.map((excuse) => (
                  <TableRow key={excuse.id}>
                    <TableCell>{formatDbDate(new Date(excuse.targetDate))}</TableCell>
                    <TableCell>{EXCUSE_TYPE_LABELS[excuse.type]}</TableCell>
                    <TableCell>
                      <Badge variant={EXCUSE_BADGE_VARIANTS[excuse.status]}>
                        {EXCUSE_STATUS_LABELS[excuse.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">정산 항목</CardTitle>
        </CardHeader>
        <CardContent>
          {member.settlementItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">정산 항목이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>정산명</TableHead>
                  <TableHead>금액</TableHead>
                  <TableHead>납부 상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {member.settlementItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.settlement.name}</TableCell>
                    <TableCell>{formatKrw(item.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={item.paymentStatus === "PAID" ? "success" : "warning"}>
                        {PAYMENT_STATUS_LABELS[item.paymentStatus]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
