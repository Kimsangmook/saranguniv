import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HOME_LINKS = [
  {
    href: "/calendar",
    title: "사유 제출",
    description: "지각·결석 사유를 미리 제출해요",
  },
  {
    href: "/my/requests",
    title: "내 신청 내역",
    description: "제출한 사유의 승인 상태를 확인해요",
  },
  {
    href: "/statistics",
    title: "통계",
    description: "팀 출결과 지각비 현황을 살펴봐요",
  },
  {
    href: "/ranking",
    title: "랭킹",
    description: "이번 시즌 지각비 랭킹을 확인해요",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">찬양팀 지각비 관리</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          토요일 연습과 일요일 예배 출결을 함께 관리해요
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {HOME_LINKS.map(({ href, title, description }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        <Link href="/attendance" className="underline-offset-4 hover:underline">
          지각 기록 (QR 전용)
        </Link>
      </p>
    </main>
  );
}
