import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ATTENDANCE_STATUS_LABELS,
  RECORD_METHOD_LABELS,
  SETTLEMENT_STATUS_LABELS,
  formatKrw,
} from "@/lib/labels";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDbDate, getSeoulTimeLabel } from "@/lib/seoul-time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // 레이아웃 가드만으로는 부분 렌더링 시 우회될 수 있으므로 페이지에서도 세션을 확인한다.
  await requireAdminPage();

  const [
    unsettledCount,
    requestedSettlementCount,
    unpaidGroups,
    pendingExcuseCount,
    recentSaturdayRecords,
    recentSundayRecords,
    recentSettlements,
  ] = await Promise.all([
    prisma.attendanceRecord.count({ where: { settlementStatus: "UNSETTLED" } }),
    prisma.settlement.count({ where: { status: "REQUESTED" } }),
    prisma.settlementItem.groupBy({
      by: ["memberId"],
      where: {
        paymentStatus: "UNPAID",
        settlement: { status: { in: ["REQUESTED", "COMPLETED"] } },
      },
      _sum: { amount: true },
    }),
    prisma.excuseRequest.count({ where: { status: "PENDING" } }),
    prisma.attendanceRecord.findMany({
      where: { meetingType: "SATURDAY", method: "QR" },
      orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        attendanceDate: true,
        arrivedAt: true,
        lateMinutes: true,
        calculatedAmount: true,
        member: { select: { name: true } },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { meetingType: "SUNDAY" },
      orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        attendanceDate: true,
        status: true,
        method: true,
        calculatedAmount: true,
        member: { select: { name: true } },
      },
    }),
    prisma.settlement.findMany({
      orderBy: { confirmedAt: "desc" },
      take: 3,
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        totalAmount: true,
      },
    }),
  ]);

  const unpaidMemberCount = unpaidGroups.length;
  const unpaidTotalAmount = unpaidGroups.reduce(
    (sum, group) => sum + (group._sum.amount ?? 0),
    0,
  );

  const summaryCards = [
    {
      title: "미정산 기록",
      value: `${unsettledCount}건`,
      description: "정산에 포함되지 않은 출결 기록",
      href: "/admin/late-records",
      linkLabel: "출결 기록 관리",
    },
    {
      title: "정산 요청 중",
      value: `${requestedSettlementCount}건`,
      description: "납부가 진행 중인 정산",
      href: "/admin/settlements",
      linkLabel: "정산 관리",
    },
    {
      title: "미납 현황",
      value: `${unpaidMemberCount}명 · ${formatKrw(unpaidTotalAmount)}`,
      description: "정산 항목 중 미납 상태 기준",
      href: "/admin/settlements",
      linkLabel: "정산 관리",
    },
    {
      title: "승인 대기 사유",
      value: `${pendingExcuseCount}건`,
      description: "처리가 필요한 사유 신청",
      href: "/admin/excuse-requests",
      linkLabel: "사유 승인 관리",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          미정산 기록, 미납 금액, 최근 정산 현황을 한눈에 확인합니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              <Link
                href={card.href}
                className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {card.linkLabel} →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">최근 토요일 QR 기록</CardTitle>
            <Link
              href="/admin/late-records"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              전체 보기 →
            </Link>
          </CardHeader>
          <CardContent>
            {recentSaturdayRecords.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                아직 토요일 QR 기록이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>팀원</TableHead>
                    <TableHead>날짜</TableHead>
                    <TableHead>도착</TableHead>
                    <TableHead className="text-right">지각 분</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSaturdayRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.member.name}</TableCell>
                      <TableCell>{formatDbDate(record.attendanceDate)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {record.arrivedAt ? getSeoulTimeLabel(record.arrivedAt) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.lateMinutes !== null ? `${record.lateMinutes}분` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatKrw(record.calculatedAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">최근 일요일 기록</CardTitle>
            <Link
              href="/admin/late-records"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              전체 보기 →
            </Link>
          </CardHeader>
          <CardContent>
            {recentSundayRecords.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                아직 일요일 출결 기록이 없습니다.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>팀원</TableHead>
                    <TableHead>날짜</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>방식</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSundayRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.member.name}</TableCell>
                      <TableCell>{formatDbDate(record.attendanceDate)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={record.status === "ABSENT" ? "destructive" : "warning"}
                        >
                          {ATTENDANCE_STATUS_LABELS[record.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {RECORD_METHOD_LABELS[record.method]}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatKrw(record.calculatedAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">최근 정산</CardTitle>
          <Link
            href="/admin/settlements"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            전체 보기 →
          </Link>
        </CardHeader>
        <CardContent>
          {recentSettlements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              아직 생성된 정산이 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>정산명</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">총액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSettlements.map((settlement) => (
                  <TableRow key={settlement.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/settlements/${settlement.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {settlement.name}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDbDate(settlement.startDate)} ~ {formatDbDate(settlement.endDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={settlement.status === "COMPLETED" ? "success" : "warning"}
                        className={cn(settlement.status === "REQUESTED" && "whitespace-nowrap")}
                      >
                        {SETTLEMENT_STATUS_LABELS[settlement.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatKrw(settlement.totalAmount)}
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
