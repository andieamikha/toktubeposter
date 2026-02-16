import { AuthGuard } from '@/components/auth-guard';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-surface">
        <Sidebar />
        <main className="ml-64">{children}</main>
      </div>
    </AuthGuard>
  );
}
