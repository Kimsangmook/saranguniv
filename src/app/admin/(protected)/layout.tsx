import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="min-h-screen bg-background md:flex">
      <AdminSidebar />
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
