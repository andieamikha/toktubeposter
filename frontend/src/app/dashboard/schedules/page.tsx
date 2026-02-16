'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageLoading, EmptyState } from '@/components/ui/loading';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { ApiResponse, ScheduledPost, Content, User } from '@/types';
import { PostStatus } from '@/types';
import { Plus, Trash2, Upload, RefreshCw } from 'lucide-react';

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledPost | null>(null);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ items: ScheduledPost[]; meta: any }>>('/schedules');
      return data.data.items;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      setDeleteTarget(null);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { data } = await api.post(`/upload/${scheduleId}/tiktok`, { privacy_level: 'SELF_ONLY' });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  const getUploadBadge = (s: ScheduledPost) => {
    switch (s.uploadStatus) {
      case 'downloading': case 'uploading': case 'processing':
        return <span className="badge bg-blue-500/20 text-blue-400 text-xs animate-pulse">Uploading...</span>;
      case 'published':
        return <span className="badge bg-success/20 text-success text-xs">Uploaded</span>;
      case 'failed':
        return <span className="badge bg-danger/20 text-danger text-xs" title={s.uploadError || ''}>Gagal</span>;
      default:
        return null;
    }
  };

  const columns = [
    {
      key: 'account',
      label: 'Akun',
      render: (s: ScheduledPost) => <span className="font-medium">@{s.tiktokAccount?.username}</span>,
    },
    {
      key: 'content',
      label: 'Konten',
      render: (s: ScheduledPost) => s.content?.briefTopic || '—',
    },
    {
      key: 'operator',
      label: 'Operator',
      render: (s: ScheduledPost) => s.assignedOperator?.fullName || '—',
    },
    {
      key: 'scheduledAt',
      label: 'Jadwal',
      render: (s: ScheduledPost) => formatDateTime(s.scheduledAt),
    },
    {
      key: 'status',
      label: 'Status',
      render: (s: ScheduledPost) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={s.status} />
          {getUploadBadge(s)}
        </div>
      ),
    },
    {
      key: 'tiktokUrl',
      label: 'URL',
      render: (s: ScheduledPost) =>
        s.tiktokUrl ? (
          <a href={s.tiktokUrl} target="_blank" className="text-primary hover:underline text-xs">
            Lihat
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      render: (s: ScheduledPost) => (
        <div className="flex items-center justify-end gap-1">
          {s.status !== PostStatus.DONE && s.uploadStatus !== 'published' && s.tiktokAccount?.isOauthConnected && (
            <button
              onClick={(e) => { e.stopPropagation(); uploadMutation.mutate(s.id); }}
              className="p-1.5 text-muted hover:text-primary transition-colors" title="Upload Langsung"
              disabled={uploadMutation.isPending}
            >
              <Upload className="w-4 h-4" />
            </button>
          )}
          {s.status === PostStatus.PENDING || s.status === PostStatus.NOTIFIED ? (
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
              className="p-1.5 text-muted hover:text-danger transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <Header
        title="Jadwal Posting"
        subtitle={`${schedules?.length ?? 0} jadwal`}
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Buat Jadwal
          </button>
        }
      />
      <div className="p-6">
        {isLoading ? (
          <PageLoading />
        ) : !schedules?.length ? (
          <EmptyState message="Belum ada jadwal" />
        ) : (
          <div className="card p-0 overflow-hidden">
            <DataTable columns={columns} data={schedules} keyExtractor={(s) => s.id} />
          </div>
        )}
      </div>

      <CreateScheduleModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Jadwal"
        message="Yakin ingin menghapus jadwal ini?"
        confirmText="Hapus"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

function CreateScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    contentId: '',
    tiktokAccountId: '',
    assignedOperatorId: '',
    scheduledAt: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: contents } = useQuery({
    queryKey: ['contents', 'ready'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ items: Content[]; meta: any }>>('/contents?status=ready');
      return data.data.items;
    },
  });

  const { data: operators } = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users');
      return data.data;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/schedules', {
        content_id: form.contentId,
        tiktok_account_id: form.tiktokAccountId,
        assigned_operator_id: form.assignedOperatorId,
        scheduled_at: new Date(form.scheduledAt).toISOString(),
      });
      qc.invalidateQueries({ queryKey: ['schedules'] });
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
      setError(axiosErr.response?.data?.error?.message || axiosErr.response?.data?.message || 'Gagal membuat jadwal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Buat Jadwal Baru">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Konten (Siap Upload)</label>
          <select
            className="input-field"
            value={form.contentId}
            onChange={(e) => {
              const c = contents?.find((x) => x.id === e.target.value);
              setForm({
                ...form,
                contentId: e.target.value,
                tiktokAccountId: c?.tiktokAccountId || '',
              });
            }}
            required
          >
            <option value="">Pilih konten</option>
            {contents?.map((c) => (
              <option key={c.id} value={c.id}>
                @{c.tiktokAccount?.username} — {c.briefTopic}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Operator</label>
          <select className="input-field" value={form.assignedOperatorId} onChange={(e) => setForm({ ...form, assignedOperatorId: e.target.value })} required>
            <option value="">Pilih operator</option>
            {operators?.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Waktu Jadwal</label>
          <input
            type="datetime-local"
            className="input-field"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            required
          />
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Membuat...' : 'Buat Jadwal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
