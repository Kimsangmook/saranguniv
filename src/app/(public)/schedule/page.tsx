import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ExcuseStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EXCUSE_TYPE_LABELS } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { getSeoulDateKey } from "@/lib/seoul-time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

type ScheduleEntry = { name: string; type: "LATE" | "ABSENT" };

/** "YYYY-MM" → 해당 월 1일의 UTC 자정 (@db.Date 비교용) */
function monthToUtcDate(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

function shiftMonth(month: string, delta: number): string {
  const date = monthToUtcDate(month);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

export default async function PublicSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const currentMonth = getSeoulDateKey().slice(0, 7);
  const month = params.month && MONTH_PATTERN.test(params.month) ? params.month : currentMonth;

  const monthStart = monthToUtcDate(month);
  const monthEnd = monthToUtcDate(shiftMonth(month, 1));

  // 승인된 사유만, 그리고 이름·구분·날짜만 조회한다.
  // 사유 내용(reason)·연락처·처리 관리자 정보는 공개 영역에 절대 노출하지 않는다. (기획서 15.4 / 19장)
  const approved = await prisma.excuseRequest.findMany({
    where: {
      status: ExcuseStatus.APPROVED,
      targetDate: { gte: monthStart, lt: monthEnd },
    },
    select: {
      targetDate: true,
      type: true,
      member: { select: { name: true, publicDisplayName: true } },
    },
    orderBy: [{ targetDate: "asc" }],
  });

  const entriesByDate = new Map<string, ScheduleEntry[]>();
  for (const item of approved) {
    const key = item.targetDate.toISOString().slice(0, 10);
    const list = entriesByDate.get(key) ?? [];
    list.push({ name: item.member.publicDisplayName ?? item.member.name, type: item.type });
    entriesByDate.set(key, list);
  }
  for (const list of entriesByDate.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  // 달력 그리드 (앞쪽 빈 칸 + 해당 월 날짜)
  const firstWeekday = monthStart.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];

  const dayKeysWithEntries = [...entriesByDate.keys()].sort();
  const todayKey = getSeoulDateKey();
  const [year, monthNumber] = month.split("-");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">일정 공유</h1>
        <p className="text-sm text-muted-foreground">
          사유가 승인된 팀원의 불참 일정입니다. 사유 내용은 공개되지 않습니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/schedule?month=${shiftMonth(month, -1)}`}
              aria-label="이전 달"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-accent"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <CardTitle className="text-base">
              {Number(year)}년 {Number(monthNumber)}월
            </CardTitle>
            <Link
              href={`/schedule?month=${shiftMonth(month, 1)}`}
              aria-label="다음 달"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-accent"
            >
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_LABELS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "pb-1 text-xs font-medium",
                  index === 0 ? "text-red-500" : index === 6 ? "text-blue-500" : "text-muted-foreground",
                )}
              >
                {label}
              </div>
            ))}
            {cells.map((dateKey, index) => {
              if (!dateKey) return <div key={`empty-${index}`} />;
              const entries = entriesByDate.get(dateKey);
              const isToday = dateKey === todayKey;
              const dayNumber = Number(dateKey.slice(8));
              const content = (
                <>
                  <span>{dayNumber}</span>
                  {entries && (
                    <span className="mt-0.5 text-[10px] font-semibold leading-none">
                      {entries.length}
                    </span>
                  )}
                </>
              );

              return entries ? (
                <a
                  key={dateKey}
                  href={`#day-${dateKey}`}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-sm font-medium text-primary transition-colors hover:bg-primary/20",
                    isToday && "ring-2 ring-primary",
                  )}
                >
                  {content}
                </a>
              ) : (
                <div
                  key={dateKey}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md text-sm text-muted-foreground",
                    isToday && "ring-2 ring-primary",
                  )}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {dayKeysWithEntries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          이 달에는 승인된 일정이 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {dayKeysWithEntries.map((dateKey) => {
            const entries = entriesByDate.get(dateKey)!;
            const weekday = DAY_LABELS[new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()];
            return (
              <li key={dateKey} id={`day-${dateKey}`} className="scroll-mt-20">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold">
                      {Number(dateKey.slice(5, 7))}월 {Number(dateKey.slice(8))}일 ({weekday})
                      {dateKey === todayKey && (
                        <span className="ml-2 text-xs font-normal text-primary">오늘</span>
                      )}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {entries.map((entry, index) => (
                        <li
                          key={`${dateKey}-${entry.name}-${index}`}
                          className={cn(
                            "rounded-full px-3 py-1 text-sm",
                            entry.type === "ABSENT"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {entry.name} · {EXCUSE_TYPE_LABELS[entry.type]}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
