"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { API_ENDPOINTS } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Menu, Users, Calendar } from "lucide-react";

interface Attendance {
  id: string;
  name: string;
  contact: string;
  createdAt: string;
}

export default function CMS() {
  const router = useRouter();
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchAttendances();
  }, []);

  const fetchAttendances = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.ATTENDANCE, {
        method: "GET",
      });

      if (response.ok) {
        const data = await response.json();
        setAttendances(data.attendances || []);
      } else {
        setError("출석 데이터를 불러오는데 실패했습니다.");
      }
    } catch (err) {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <p className="text-lg text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* 사이드바 */}
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      
      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 상단 헤더 */}
        <header className="bg-card shadow-sm border-b">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="md:hidden mr-2"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold">대시보드</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>총 {attendances.length}명 출석</span>
              </div>
            </div>
          </div>
        </header>

        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* 통계 카드들 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">총 출석자</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{attendances.length}</div>
                <p className="text-xs text-muted-foreground">
                  명이 출석했습니다
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">오늘 출석자</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {attendances.filter(attendance => {
                    const today = new Date().toDateString();
                    const attendanceDate = new Date(attendance.createdAt).toDateString();
                    return today === attendanceDate;
                  }).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  오늘 출석한 사람
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">최근 출석</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {attendances.length > 0 ? 
                    new Date(attendances[0].createdAt).toLocaleDateString('ko-KR') : 
                    '없음'
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  가장 최근 출석일
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 출석 현황 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>출석 현황</CardTitle>
              <CardDescription>
                총 {attendances.length}명이 출석했습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>번호</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>연락처</TableHead>
                    <TableHead>출석 시간</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        아직 출석한 사람이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    attendances.map((attendance, index) => (
                      <TableRow key={attendance.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>{attendance.name}</TableCell>
                        <TableCell className="text-muted-foreground">{attendance.contact}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(attendance.createdAt).toLocaleString('ko-KR')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

