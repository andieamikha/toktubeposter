'use client';

import { cn, statusColor, statusLabel } from '@/lib/utils';

interface BadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: BadgeProps) {
  return (
    <span className={cn('badge', statusColor(status), className)}>
      {statusLabel(status)}
    </span>
  );
}
