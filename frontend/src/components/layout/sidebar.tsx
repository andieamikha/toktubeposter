'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { UserRole } from '@/types';
import {
  LayoutDashboard,
  Users,
  AtSign,
  FileText,
  Calendar,
  ListChecks,
  Layers,
  User,
  LogOut,
  HardDrive,
  Youtube,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.OPERATOR] },
  { name: 'Akun TikTok', href: '/dashboard/accounts', icon: AtSign, roles: [UserRole.ADMIN] },
  { name: 'Akun YouTube', href: '/dashboard/youtube-accounts', icon: Youtube, roles: [UserRole.ADMIN] },
  { name: 'Operator', href: '/dashboard/operators', icon: Users, roles: [UserRole.ADMIN] },
  { name: 'Video Manager', href: '/dashboard/google-drive', icon: HardDrive, roles: [UserRole.ADMIN] },
  { name: 'Konten', href: '/dashboard/contents', icon: FileText, roles: [UserRole.ADMIN] },
  { name: 'Jadwal', href: '/dashboard/schedules', icon: Calendar, roles: [UserRole.ADMIN] },
  { name: 'Bulk Generate', href: '/dashboard/bulk', icon: Layers, roles: [UserRole.ADMIN] },
  { name: 'Tugas Saya', href: '/dashboard/tasks', icon: ListChecks, roles: [UserRole.ADMIN, UserRole.OPERATOR] },
  { name: 'Profil', href: '/dashboard/profile', icon: User, roles: [UserRole.ADMIN, UserRole.OPERATOR] },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const filteredNav = navigation.filter(
    (item) => user && item.roles.includes(user.role as UserRole),
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-64 bg-sidebar border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89 2.84 2.84 0 01.89.14V9.01a6.32 6.32 0 00-1-.05A6.34 6.34 0 003 15.3a6.34 6.34 0 006.33 6.34A6.34 6.34 0 0015.66 15.3V8.55a8.18 8.18 0 004.78 1.53V6.69h-.85z" />
            </svg>
          </div>
          <span className="font-bold text-lg">TikTok Mgr</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:text-white hover:bg-card',
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/20 rounded-full flex items-center justify-center text-sm font-bold text-primary">
            {user?.fullName?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.fullName}</p>
            <p className="text-xs text-muted capitalize">{user?.role}</p>
          </div>
          <button
            onClick={() => {
              logout();
              window.location.href = '/login';
            }}
            className="p-1.5 text-muted hover:text-danger transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
