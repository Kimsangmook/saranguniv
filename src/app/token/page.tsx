"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TokenPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // ✅ 1. 로컬 스토리지에서 토큰 확인
    const token = localStorage.getItem("attendance_token");
    if (token) {
      router.replace("/checking"); // ✅ 토큰이 있으면 바로 이동
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !contact) {
      setError("이름과 연락처를 입력해주세요.");
      return;
    }

    const response = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, contact }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem("attendance_token", data.token); // ✅ 토큰 저장
      router.replace("/checking"); // ✅ Checking 페이지로 이동
    } else {
      setError("토큰 발급 실패");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-2xl mb-5 text-black">출석 체크</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-72">
        <input
          type="text"
          placeholder="이름 입력"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="p-2 text-base border border-gray-300 rounded"
        />
        <input
          type="text"
          placeholder="연락처 입력"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="p-2 text-base border border-gray-300 rounded"
        />
        <button
          type="submit"
          className="p-2 text-base bg-blue-600 text-white rounded hover:bg-blue-500"
        >
          출석하기
        </button>
      </form>
      {error && <p className="text-red-500 mt-3">{error}</p>}
    </div>
  );
} 