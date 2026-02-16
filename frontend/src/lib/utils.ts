import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string, fmt = 'dd MMM yyyy') {
  return format(parseISO(dateStr), fmt, { locale: idLocale });
}

export function formatDateTime(dateStr: string) {
  return format(parseISO(dateStr), 'dd MMM yyyy HH:mm', { locale: idLocale });
}

export function formatTime(dateStr: string) {
  return format(parseISO(dateStr), 'HH:mm', { locale: idLocale });
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    done: 'bg-success/20 text-success',
    pending: 'bg-warning/20 text-warning',
    notified: 'bg-info/20 text-info',
    late: 'bg-danger/20 text-danger',
    missed: 'bg-red-900/30 text-red-400',
    draft: 'bg-muted/20 text-muted',
    ai_generating: 'bg-purple-900/30 text-purple-400',
    ai_done: 'bg-secondary/20 text-secondary',
    ai_generated: 'bg-purple-900/30 text-purple-400',
    ready: 'bg-success/20 text-success',
    used: 'bg-danger/20 text-danger',
    finalized: 'bg-success/20 text-success',
    scheduled: 'bg-info/20 text-info',
    preview: 'bg-warning/20 text-warning',
    published: 'bg-success/20 text-success',
    cancelled: 'bg-muted/20 text-muted',
  };
  return colors[status] || 'bg-muted/20 text-muted';
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    done: 'Selesai',
    pending: 'Menunggu',
    notified: 'Dinotifikasi',
    late: 'Terlambat',
    missed: 'Terlewat',
    draft: 'Draft',
    ai_generating: 'AI Proses',
    ai_done: 'AI Selesai',
    ai_generated: 'AI Selesai',
    ready: 'Siap Upload',
    used: 'Terpakai',
    finalized: 'Final',
    scheduled: 'Terjadwal',
    preview: 'Preview',
    published: 'Dipublish',
    cancelled: 'Dibatalkan',
  };
  return labels[status] || status;
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
