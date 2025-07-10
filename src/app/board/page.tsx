"use client";

import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react"; // ✅ 여기 수정!

export default function Board() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    // ✅ 현재 도메인 기반으로 `/checking` URL 생성
    const currentUrl = `${window.location.origin}/checking`;
    setUrl(currentUrl);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-2xl mb-5 text-black">QR 코드 스캔 후 출석 체크</h1>
      {url && <QRCodeCanvas value={url} size={200} />}
      <p className="text-base mt-3 text-gray-500">QR 코드를 스캔하면 출석 페이지로 이동합니다.</p>
    </div>
  );
}

// 이전 styled-components 정의는 제거되었습니다.
