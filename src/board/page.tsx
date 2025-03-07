"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import { QRCodeCanvas } from "qrcode.react"; // ✅ 여기 수정!

export default function Board() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    // ✅ 현재 도메인 기반으로 `/checking` URL 생성
    const currentUrl = `${window.location.origin}/checking`;
    setUrl(currentUrl);
  }, []);

  return (
    <Container>
      <Title>QR 코드 스캔 후 출석 체크</Title>
      {url && <QRCodeCanvas value={url} size={200} />}
      <InfoText>QR 코드를 스캔하면 출석 페이지로 이동합니다.</InfoText>
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

const InfoText = styled.p`
  font-size: 16px;
  margin-top: 10px;
  color: #555;
`;
