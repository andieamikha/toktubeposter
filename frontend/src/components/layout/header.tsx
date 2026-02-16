'use client';

import { useAuthStore } from '@/stores/auth-store';
import { Bell } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-sm flex items-center justify-between px-6">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        {actions}
        <button className="p-2 text-muted hover:text-white transition-colors relative">
          <Bell className="w-5 h-5" />
        </button>
        <span className="text-sm text-muted">
          {user?.fullName}
        </span>
      </div>
    </header>
  );
}
