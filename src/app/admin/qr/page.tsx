import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ATTENDANCE_URL = "https://saranguniv.vercel.app/attendance";

// A4(210mm × 297mm) 한 장에 QR만 인쇄한다.
// 화면에서는 안내와 인쇄 버튼을 함께 보여주고, 인쇄 시에는 .no-print 요소를 모두 숨긴다.
const PRINT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 0;
  }

  @media print {
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }

    .no-print {
      display: none !important;
    }

    .qr-sheet {
      width: 210mm;
      height: 297mm;
      margin: 0 !important;
      border: 0 !important;
      box-shadow: none !important;
      break-after: avoid;
      page-break-after: avoid;
    }
  }
`;

export default async function AdminQrPrintPage() {
  await requireAdminPage();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <main className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
        <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-bold">벽면 부착용 QR</h1>
            <p className="text-sm text-muted-foreground">
              A4 한 장에 QR만 인쇄됩니다. 연결 주소: {ATTENDANCE_URL}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              대시보드로
            </Link>
            <a
              href="/attendance-qr.svg"
              download="찬양팀-지각기록-QR.svg"
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              SVG 내려받기
            </a>
          </div>
        </div>

        <div className="qr-sheet mx-auto flex h-[297mm] w-[210mm] items-center justify-center border bg-white shadow-sm print:border-0 print:shadow-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/attendance-qr.svg"
            alt="토요일 지각 기록 페이지 QR"
            className="h-[160mm] w-[160mm]"
          />
        </div>

        <p className="no-print mx-auto mt-6 max-w-[210mm] text-center text-xs text-muted-foreground">
          인쇄 대화상자에서 용지 A4, 배율 100%(맞춤 없음), 여백 없음으로 설정하면 QR이 정확히 16cm로 인쇄됩니다.
        </p>
      </main>
    </>
  );
}
