"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_NAV_ITEMS = [
  { href: "/admin/dashboard", label: "대시보드" },
  { href: "/admin/members", label: "팀원 관리" },
  { href: "/admin/late-records", label: "출결 기록" },
  { href: "/admin/sunday-attendance", label: "일요일 출결" },
  { href: "/admin/excuse-requests", label: "사유 승인" },
  { href: "/admin/settlements", label: "정산" },
  { href: "/admin/settings", label: "설정" },
  { href: "/admin/qr", label: "QR 인쇄" },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  };

  const links = ADMIN_NAV_ITEMS.map(({ href, label }) => {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        {label}
      </Link>
    );
  });

  return (
    <>
      {/* 데스크톱: 좌측 사이드바 */}
      <aside className="hidden w-56 shrink-0 border-r bg-background md:flex md:min-h-screen md:flex-col">
        <div className="border-b px-4 py-4">
          <Link href="/admin/dashboard" className="text-sm font-bold">
            찬양팀 지각비 관리자
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">{links}</nav>
        <div className="border-t p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일: 상단 가로 메뉴 */}
      <div className="border-b bg-background md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin/dashboard" className="text-sm font-bold">
            찬양팀 지각비 관리자
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            로그아웃
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3">{links}</nav>
      </div>
    </>
  );
}
