import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MEMBER_STATUS_LABELS, formatKrw } from "@/lib/labels";
import {
  getPublicRanking,
  type RankingPeriod,
  type RankingScope,
  type RankingSort,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공개 랭킹",
};

const SCOPE_OPTIONS: { value: RankingScope; label: string }[] = [
  { value: "active", label: "현역만" },
  { value: "all", label: "전체 팀원" },
];

const PERIOD_OPTIONS: { value: RankingPeriod; label: string }[] = [
  { value: "all", label: "전체 기간" },
  { value: "year", label: "올해" },
  { value: "month", label: "이번 달" },
];

const SORT_OPTIONS: { value: RankingSort; label: string }[] = [
  { value: "total", label: "누적 지각비" },
  { value: "count", label: "총횟수" },
  { value: "saturday", label: "토요일 지각비" },
  { value: "sunday", label: "일요일 금액" },
];

const SORT_VALUE_HEAD: Record<RankingSort, string> = {
  total: "누적 지각비",
  count: "총횟수",
  saturday: "토요일 지각비",
  sunday: "일요일 금액",
};

function parseParam<T extends string>(raw: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function buildHref(scope: RankingScope, period: RankingPeriod, sort: RankingSort): string {
  const params = new URLSearchParams();
  if (scope !== "active") params.set("scope", scope);
  if (period !== "all") params.set("period", period);
  if (sort !== "total") params.set("sort", sort);
  const query = params.toString();
  return query ? `/ranking?${query}` : "/ranking";
}

interface RankingPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RankingPage({ searchParams }: RankingPageProps) {
  const params = await searchParams;
  const scope = parseParam(params.scope, ["active", "all"] as const, "active");
  const period = parseParam(params.period, ["all", "year", "month"] as const, "all");
  const sort = parseParam(params.sort, ["total", "count", "saturday", "sunday"] as const, "total");

  const entries = await getPublicRanking({ scope, period, sort });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">공개 랭킹</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          정산 완료된 기록만 집계됩니다. 동점은 공동 순위로 표시됩니다.
        </p>
      </div>

      {/* 필터 (Link 기반) */}
      <div className="space-y-2">
        <FilterGroup
          label="대상"
          items={SCOPE_OPTIONS.map((option) => ({
            key: option.value,
            label: option.label,
            active: option.value === scope,
            href: buildHref(option.value, period, sort),
          }))}
        />
        <FilterGroup
          label="기간"
          items={PERIOD_OPTIONS.map((option) => ({
            key: option.value,
            label: option.label,
            active: option.value === period,
            href: buildHref(scope, option.value, sort),
          }))}
        />
        <FilterGroup
          label="정렬"
          items={SORT_OPTIONS.map((option) => ({
            key: option.value,
            label: option.label,
            active: option.value === sort,
            href: buildHref(scope, period, option.value),
          }))}
        />
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            아직 완료된 정산이 없습니다.
            <p className="mt-1 text-sm">선택한 조건에 해당하는 기록이 없으면 조건을 바꿔보세요.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-center">순위</TableHead>
                <TableHead>이름</TableHead>
                <TableHead className="text-right">{SORT_VALUE_HEAD[sort]}</TableHead>
                <TableHead className="text-right">총횟수</TableHead>
                <TableHead className="hidden text-right sm:table-cell">토요일 지각</TableHead>
                <TableHead className="hidden text-right sm:table-cell">일요일 지각</TableHead>
                <TableHead className="hidden text-right sm:table-cell">일요일 결석</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => {
                const isTop3 = entry.rank <= 3;
                return (
                  <TableRow
                    key={`${index}-${entry.displayName}`}
                    className={cn(isTop3 && "bg-amber-50/60 hover:bg-amber-50")}
                  >
                    <TableCell className="p-2 text-center">
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums",
                          entry.rank === 1 && "bg-amber-400 font-bold text-white",
                          entry.rank === 2 && "bg-slate-400 font-bold text-white",
                          entry.rank === 3 && "bg-orange-400 font-bold text-white",
                          !isTop3 && "text-muted-foreground",
                        )}
                      >
                        {entry.rank}
                      </span>
                    </TableCell>
                    <TableCell className={cn("p-2", isTop3 && "font-semibold")}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {entry.displayName}
                        {scope === "all" && entry.memberStatus !== "ACTIVE" ? (
                          <Badge variant="secondary" className="font-normal">
                            {MEMBER_STATUS_LABELS[entry.memberStatus]}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className={cn("p-2 text-right tabular-nums", isTop3 && "font-semibold")}>
                      {sort === "count" ? `${entry.sortValue}회` : formatKrw(entry.sortValue)}
                    </TableCell>
                    <TableCell className="p-2 text-right tabular-nums">{entry.totalCount}회</TableCell>
                    <TableCell className="hidden p-2 text-right tabular-nums sm:table-cell">
                      {entry.saturdayLateCount}회
                    </TableCell>
                    <TableCell className="hidden p-2 text-right tabular-nums sm:table-cell">
                      {entry.sundayLateCount}회
                    </TableCell>
                    <TableCell className="hidden p-2 text-right tabular-nums sm:table-cell">
                      {entry.sundayAbsentCount}회
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: string; active: boolean; href: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              item.active
                ? "border-transparent bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
