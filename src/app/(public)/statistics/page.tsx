import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKrw } from "@/lib/labels";
import { formatDbDate, getSeoulTimeLabel } from "@/lib/seoul-time";
import { getPublicStatistics } from "@/lib/stats";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공개 통계",
};

export default async function StatisticsPage() {
  const stats = await getPublicStatistics();

  if (!stats.hasData) {
    return (
      <div className="space-y-6">
        <PageHeading />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            아직 완료된 정산이 없습니다.
            <p className="mt-1 text-sm">정산이 완료되면 통계가 표시됩니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const maxMonthlyAmount = Math.max(
    1,
    ...stats.monthlyTrend.map((point) => point.amount),
  );
  const meetingTotal = stats.amountByMeeting.saturday + stats.amountByMeeting.sunday;
  const saturdayRatio =
    meetingTotal > 0 ? Math.round((stats.amountByMeeting.saturday / meetingTotal) * 100) : 0;
  const sundayRatio = meetingTotal > 0 ? 100 - saturdayRatio : 0;

  const summaryCards = [
    { label: "전체 누적 지각비", amount: stats.totalAmountAll },
    { label: "올해 누적 지각비", amount: stats.totalAmountYear },
    { label: "이번 달 지각비", amount: stats.totalAmountMonth },
  ];

  const typeCountItems = [
    { label: "토요일 지각", count: stats.typeCounts.saturdayLate, barClass: "bg-blue-500" },
    { label: "일요일 지각", count: stats.typeCounts.sundayLate, barClass: "bg-amber-500" },
    { label: "일요일 결석", count: stats.typeCounts.sundayAbsent, barClass: "bg-rose-500" },
  ];
  const maxTypeCount = Math.max(1, ...typeCountItems.map((item) => item.count));

  return (
    <div className="space-y-6">
      <PageHeading />

      {/* 요약 카드 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {summaryCards.map((item) => (
          <Card key={item.label}>
            <CardHeader className="p-4 pb-1">
              <CardDescription>{item.label}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-bold tracking-tight">{formatKrw(item.amount)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 월별 추이 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">월별 지각비 추이</CardTitle>
          <CardDescription>최근 12개월 · 정산 완료 금액 기준</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.monthlyTrend.map((point) => (
              <div key={point.monthKey} className="flex items-center gap-2">
                <div className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                  {point.yearLabel ? (
                    <span className="mr-1 text-[10px]">{point.yearLabel}</span>
                  ) : null}
                  {point.label}
                </div>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className={cn(
                      "h-full rounded bg-primary transition-all",
                      point.amount === 0 && "bg-transparent",
                    )}
                    style={{ width: `${(point.amount / maxMonthlyAmount) * 100}%` }}
                  />
                </div>
                <div className="w-20 shrink-0 text-right text-xs tabular-nums">
                  {point.amount > 0 ? formatKrw(point.amount) : "-"}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 유형별 횟수 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">유형별 횟수</CardTitle>
          <CardDescription>정산 완료된 지각·결석 기록 기준</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {typeCountItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {item.label}
                </div>
                <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className={cn("h-full rounded", item.barClass, item.count === 0 && "bg-transparent")}
                    style={{ width: `${(item.count / maxTypeCount) * 100}%` }}
                  />
                </div>
                <div className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
                  {item.count}회
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 토·일 금액 비율 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">토요일 · 일요일 금액 비율</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {meetingTotal > 0 ? (
            <>
              <div className="flex h-6 w-full overflow-hidden rounded">
                {saturdayRatio > 0 ? (
                  <div className="bg-blue-500" style={{ width: `${saturdayRatio}%` }} />
                ) : null}
                {sundayRatio > 0 ? (
                  <div className="bg-amber-500" style={{ width: `${sundayRatio}%` }} />
                ) : null}
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                  <span>
                    토요일 {saturdayRatio}% ·{" "}
                    <span className="tabular-nums">{formatKrw(stats.amountByMeeting.saturday)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  <span>
                    일요일 {sundayRatio}% ·{" "}
                    <span className="tabular-nums">{formatKrw(stats.amountByMeeting.sunday)}</span>
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">집계된 금액이 없습니다.</p>
          )}
        </CardContent>
      </Card>

      {/* 최근 완료 정산 */}
      {stats.latestSettlement ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">최근 완료된 정산</CardTitle>
            <CardDescription>{stats.latestSettlement.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">정산 기간</dt>
                <dd>
                  {formatDbDate(stats.latestSettlement.startDate)} ~{" "}
                  {formatDbDate(stats.latestSettlement.endDate)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">완료 시각</dt>
                <dd>
                  {stats.latestSettlement.completedAt
                    ? getSeoulTimeLabel(stats.latestSettlement.completedAt)
                    : "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">정산 금액</dt>
                <dd className="font-medium">{formatKrw(stats.latestSettlement.totalAmount)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-xl font-bold">공개 통계</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        정산 완료된 기록만 집계됩니다. 미정산·정산 요청 상태의 기록은 포함되지 않습니다.
      </p>
    </div>
  );
}
