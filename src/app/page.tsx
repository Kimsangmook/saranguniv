"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";

export default function Home() {
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
    <Container>
      <Title>출석 체크</Title>
      <Form onSubmit={handleSubmit}>
        <Input
          type="text"
          placeholder="이름 입력"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          type="text"
          placeholder="연락처 입력"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
        <Button type="submit">출석하기</Button>
      </Form>
      {error && <ErrorText>{error}</ErrorText>}
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

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 300px;
`;

const Input = styled.input`
  padding: 10px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 5px;
`;

const Button = styled.button`
  padding: 10px;
  font-size: 16px;
  background: #0070f3;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;

  &:hover {
    background: #005ecb;
  }
`;

const ErrorText = styled.p`
  color: red;
  margin-top: 10px;
`;

