'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/loading';
import { LoadingSpinner } from '@/components/ui/loading';
import api from '@/lib/api';
import { formatTime } from '@/lib/utils';
import type { ApiResponse, BulkPreviewResponse, SchedulePreview } from '@/types';
import { Layers, Eye, Rocket, Calendar } from 'lucide-react';

export default function BulkPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    targetDate: '',
    frequencyMinMinutes: 120,
    frequencyMaxMinutes: 180,
  });
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState('');

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse<BulkPreviewResponse>>('/bulk/preview', form);
      return data.data;
    },
    onSuccess: (data) => setPreview(data),
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Gagal membuat preview');
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/bulk/${preview?.batchId}/publish`),
    onSuccess: () => {
      setConfirmPublish(false);
      setPreview(null);
      setForm({ targetDate: '', frequencyMinMinutes: 120, frequencyMaxMinutes: 180 });
      qc.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Gagal publish');
      setConfirmPublish(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/bulk/${preview?.batchId}/cancel`),
    onSuccess: () => setPreview(null),
  });

  return (
    <>
      <Header title="Bulk Generate Jadwal" subtitle="Generate jadwal otomatis untuk semua konten finalized" />

      <div className="p-6 space-y-6">
        {/* Form */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Layers className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Parameter Generate</h3>
          </div>

          {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" /> Tanggal Target
              </label>
              <input
                type="date"
                className="input-field"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Frekuensi Min (menit)</label>
              <input
                type="number"
                className="input-field"
                value={form.frequencyMinMinutes}
                onChange={(e) => setForm({ ...form, frequencyMinMinutes: Number(e.target.value) })}
                min={60}
                max={480}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Frekuensi Max (menit)</label>
              <input
                type="number"
                className="input-field"
                value={form.frequencyMaxMinutes}
                onChange={(e) => setForm({ ...form, frequencyMaxMinutes: Number(e.target.value) })}
                min={60}
                max={480}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setError('');
                previewMutation.mutate();
              }}
              disabled={!form.targetDate || previewMutation.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {previewMutation.isPending ? <LoadingSpinner size="sm" /> : <Eye className="w-4 h-4" />}
              {previewMutation.isPending ? 'Generating...' : 'Preview'}
            </button>
          </div>
        </div>

        {/* Preview Results */}
        {preview && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                Preview Jadwal ({preview.totalScheduled} posting)
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="btn-secondary text-sm"
                >
                  Batalkan
                </button>
                <button
                  onClick={() => setConfirmPublish(true)}
                  className="btn-success flex items-center gap-2 text-sm"
                >
                  <Rocket className="w-4 h-4" /> Publish Semua
                </button>
              </div>
            </div>

            {preview.previewData.length === 0 ? (
              <EmptyState message="Tidak ada konten finalized yang bisa dijadwalkan" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="text-xs font-medium text-muted uppercase px-4 py-3">Waktu</th>
                      <th className="text-xs font-medium text-muted uppercase px-4 py-3">Akun</th>
                      <th className="text-xs font-medium text-muted uppercase px-4 py-3">Topik</th>
                      <th className="text-xs font-medium text-muted uppercase px-4 py-3">Operator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewData
                      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                      .map((item, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-card-hover">
                          <td className="px-4 py-3 text-sm font-bold text-primary">
                            {formatTime(item.scheduledAt)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            @{item.accountUsername}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted">
                            {item.contentTopic || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {item.operatorName || '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={() => publishMutation.mutate()}
        title="Publish Jadwal"
        message={`Publish ${preview?.totalScheduled} jadwal posting? Aksi ini tidak bisa dibatalkan.`}
        confirmText="Publish"
        variant="primary"
        loading={publishMutation.isPending}
      />
    </>
  );
}
