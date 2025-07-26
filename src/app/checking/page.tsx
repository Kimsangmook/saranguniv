"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_ENDPOINTS, ROUTES } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, User, Calendar, ArrowLeft } from "lucide-react";

export default function Checking() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; contact: string } | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false); // ✅ 중복 요청 방지용 useRef

  useEffect(() => {
    if (hasFetched.current) return; // ✅ 이미 요청했다면 실행하지 않음
    hasFetched.current = true; // ✅ 첫 실행 이후에는 다시 실행되지 않도록 설정

    const token = localStorage.getItem("attendance_token");

    if (!token) {
      router.replace(ROUTES.TOKEN);
      return;
    }

    const checkAttendance = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.ATTENDANCE, {
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
          router.replace(ROUTES.TOKEN);
        }
      } catch (err) {
        console.error("출석 확인 중 오류:", err);
      } finally {
        setLoading(false);
      }
    };

    checkAttendance();
  }, [router]);

  const handleBackToHome = () => {
    router.push(ROUTES.HOME);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <p className="text-lg text-muted-foreground">출석 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">사용자 정보를 불러올 수 없습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-600">{message}</CardTitle>
          <CardDescription>
            출석이 성공적으로 완료되었습니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{user.name}님</p>
                <p className="text-xs text-muted-foreground">출석자</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {new Date().toLocaleDateString('ko-KR')}
                </p>
                <p className="text-xs text-muted-foreground">출석 날짜</p>
              </div>
            </div>
          </div>

          <Button 
            onClick={handleBackToHome}
            variant="outline" 
            className="w-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            대시보드로 돌아가기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
