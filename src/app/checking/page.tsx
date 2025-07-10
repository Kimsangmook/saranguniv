"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Checking() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; contact: string } | null>(null);
  const [message, setMessage] = useState("");
  const hasFetched = useRef(false); // ✅ 중복 요청 방지용 useRef

  useEffect(() => {
    if (hasFetched.current) return; // ✅ 이미 요청했다면 실행하지 않음
    hasFetched.current = true; // ✅ 첫 실행 이후에는 다시 실행되지 않도록 설정

    const token = localStorage.getItem("attendance_token");

    if (!token) {
      router.replace("/");
      return;
    }

    const checkAttendance = async () => {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        const data = await response.json();
        setUser({ name: data.attendance.name, contact: data.attendance.contact });
        setMessage(data.message);
      } else {
        localStorage.removeItem("attendance_token");
        router.replace("/");
      }
    };

    checkAttendance();
  }, [router]);

  if (!user) return <p>로딩 중...</p>;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-2xl mb-5 text-black">{message}</h1>
      <p className="text-lg text-black">{user.name}님, 출석이 완료되었습니다.</p>
    </div>
  );
}

// 이전 styled-components 정의는 제거되었습니다.
