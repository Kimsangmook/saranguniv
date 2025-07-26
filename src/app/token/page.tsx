"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_ENDPOINTS, ROUTES } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, Phone, CheckCircle } from "lucide-react";

export default function TokenPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // ✅ 1. 로컬 스토리지에서 토큰 확인
    const token = localStorage.getItem("attendance_token");
    if (token) {
      router.replace(ROUTES.CHECKING); // ✅ 토큰이 있으면 바로 이동
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!name || !contact) {
      setError("이름과 연락처를 입력해주세요.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("attendance_token", data.token); // ✅ 토큰 저장
        router.replace(ROUTES.CHECKING); // ✅ Checking 페이지로 이동
      } else {
        setError("토큰 발급 실패");
      }
    } catch (err) {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">출석 체크</CardTitle>
          <CardDescription>
            이름과 연락처를 입력하여 출석을 확인하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                이름
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="이름을 입력하세요"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contact" className="text-sm font-medium">
                연락처
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="contact"
                  type="text"
                  placeholder="연락처를 입력하세요"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
                  처리 중...
                </>
              ) : (
                "출석하기"
              )}
            </Button>
          </form>
          
          {error && (
            <div className="mt-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 