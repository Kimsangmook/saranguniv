"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AttendanceEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/attendance")
      .then((response) => response.json())
      .then((data) => {
        if (active) router.replace(data.authenticated ? "/attendance/check-in" : "/attendance/verify");
      })
      .catch(() => active && router.replace("/attendance/verify"));
    return () => { active = false; };
  }, [router]);

  return <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">인증 상태를 확인하고 있습니다.</main>;
}
