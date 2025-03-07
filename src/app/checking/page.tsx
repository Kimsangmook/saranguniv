"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";

export default function Checking() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; contact: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("attendance_token");

    if (!token) {
      router.replace("/"); // ✅ 토큰 없으면 렌딩 페이지로 이동
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
        localStorage.removeItem("attendance_token"); // ✅ 토큰 삭제
        router.replace("/");
      }
    };

    checkAttendance();
  }, [router]);

  if (!user) return <p>로딩 중...</p>;

  return (
    <Container>
      <Title>{message}</Title>
      <Message>{user.name}님, 출석이 완료되었습니다.</Message>
    </Container>
  );
}

// ✅ styled-components 적용
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #f8f9fa;
`;

const Title = styled.h1`
  font-size: 24px;
  margin-bottom: 20px;
`;

const Message = styled.p`
  font-size: 18px;
`;
