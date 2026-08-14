"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MEMBER_STATUS_LABELS } from "@/lib/labels";
import { formatDbDate } from "@/lib/seoul-time";

type MemberRow = {
  id: string;
  name: string;
  part: string | null;
  contact: string | null;
  status: MemberStatus;
  joinedAt: string;
  publicDisplayName: string | null;
};

const STATUS_BADGE_VARIANTS: Record<
  MemberStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  ACTIVE: "success",
  MILITARY: "secondary",
  INTERCESSION: "secondary",
  RESTING: "warning",
  GRADUATED: "outline",
  WITHDRAWN: "destructive",
};

const EMPTY_FORM = {
  name: "",
  part: "",
  contact: "",
  joinedAt: "",
  publicDisplayName: "",
  note: "",
};

export default function AdminMembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadMembers = useCallback(async (q: string, status: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const response = await fetch(`/api/admin/members?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "failed");
      setMembers(data.members ?? []);
    } catch {
      setError("팀원 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers("", "");
  }, [loadMembers]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    loadMembers(query.trim(), statusFilter);
  }

  function openDialog() {
    setForm(EMPTY_FORM);
    setFormError("");
    setDialogOpen(true);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!form.name.trim()) {
      setFormError("이름을 입력해주세요.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          part: form.part || undefined,
          contact: form.contact || undefined,
          joinedAt: form.joinedAt || undefined,
          publicDisplayName: form.publicDisplayName || undefined,
          note: form.note || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.message ?? "팀원 등록에 실패했습니다.");
        return;
      }
      setDialogOpen(false);
      loadMembers(query.trim(), statusFilter);
    } catch {
      setFormError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">팀원 관리</h1>
        <Button type="button" onClick={openDialog}>팀원 등록</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">검색 및 필터</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSearch}>
            <div className="flex-1 space-y-1">
              <Label htmlFor="member-search">이름 검색</Label>
              <Input
                id="member-search"
                placeholder="이름으로 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="w-full space-y-1 sm:w-48">
              <Label htmlFor="member-status-filter">활동 상태</Label>
              <Select
                id="member-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">전체</option>
                {Object.entries(MEMBER_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">조회</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">조건에 맞는 팀원이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>파트</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead>연락처</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow
                    key={member.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/admin/members/${member.id}`)}
                  >
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell>{member.part ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANTS[member.status]}>
                        {MEMBER_STATUS_LABELS[member.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDbDate(new Date(member.joinedAt))}</TableCell>
                    <TableCell>{member.contact ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="팀원 등록"
        description="새 팀원 정보를 입력해주세요. 이름은 필수입니다."
      >
        <form className="space-y-4" onSubmit={handleCreate}>
          <div className="space-y-1">
            <Label htmlFor="create-name">이름 *</Label>
            <Input
              id="create-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-part">파트</Label>
            <Input
              id="create-part"
              placeholder="예: 싱어, 드럼"
              value={form.part}
              onChange={(event) => setForm({ ...form, part: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-contact">연락처</Label>
            <Input
              id="create-contact"
              placeholder="예: 010-1234-5678"
              value={form.contact}
              onChange={(event) => setForm({ ...form, contact: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-joined-at">가입일</Label>
            <Input
              id="create-joined-at"
              type="date"
              value={form.joinedAt}
              onChange={(event) => setForm({ ...form, joinedAt: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-public-name">공개 표시 이름</Label>
            <Input
              id="create-public-name"
              placeholder="공개 통계에 표시할 이름"
              value={form.publicDisplayName}
              onChange={(event) => setForm({ ...form, publicDisplayName: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-note">비고</Label>
            <Textarea
              id="create-note"
              rows={3}
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
