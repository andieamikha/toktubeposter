'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageLoading, EmptyState } from '@/components/ui/loading';
import { LoadingSpinner } from '@/components/ui/loading';
import api from '@/lib/api';
import { truncate, copyToClipboard } from '@/lib/utils';
import { ContentStatus } from '@/types';
import type { ApiResponse, Content, TikTokAccount, YouTubeAccount, NicheType } from '@/types';
import { Plus, Sparkles, CheckCircle, Copy, Eye, Trash2, Wand2, Upload, MonitorPlay, Youtube, Cloud, Loader2, XCircle, Check, RotateCcw, X, Clock, Pencil, FileText, FolderOpen } from 'lucide-react';

export default function ContentsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewContent, setViewContent] = useState<Content | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Content | null>(null);
  const [uploadTarget, setUploadTarget] = useState<Content | null>(null);
  const [editCaptionTarget, setEditCaptionTarget] = useState<Content | null>(null);

  const { data: contents, isLoading } = useQuery({
    queryKey: ['contents'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ items: Content[]; meta: any }>>('/contents');
      return data.data.items;
    },
    refetchInterval: (query) => {
      // Auto-refetch every 3s when any content has active upload
      const items = query.state.data;
      const hasActive = items?.some((c: Content) =>
        ['queued', 'downloading', 'uploading', 'processing'].includes(c.uploadStatus),
      );
      return hasActive ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contents'] });
      setDeleteTarget(null);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.post(`/upload/queue/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contents'] }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.post(`/upload/queue/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contents'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/upload/queue/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contents'] }),
  });

  const columns = [
    {
      key: 'account',
      label: 'Akun',
      render: (c: Content) => <span className="font-medium">@{c.tiktokAccount?.username}</span>,
    },
    {
      key: 'briefTopic',
      label: 'Topik',
      render: (c: Content) => truncate(c.briefTopic, 40),
    },
    {
      key: 'status',
      label: 'Status',
      render: (c: Content) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={c.status} />
          {c.status === 'used' && c.usedCount > 0 && (
            <span className="text-xs text-danger font-medium">{c.usedCount}x</span>
          )}
        </div>
      ),
    },
    {
      key: 'uploadStatus',
      label: 'Upload',
      render: (c: Content) => <UploadStatusCell content={c} onDismiss={(id) => dismissMutation.mutate(id)} onRetry={(id) => retryMutation.mutate(id)} onCancel={(id) => cancelMutation.mutate(id)} />,
    },
    {
      key: 'finalCaption',
      label: 'Caption',
      render: (c: Content) => c.finalCaption ? truncate(c.finalCaption, 50) : <span className="text-muted">—</span>,
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      render: (c: Content) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setUploadTarget(c); }}
            className="p-1.5 text-muted hover:text-primary transition-colors"
            title="Upload ke TikTok"
            disabled={['queued', 'downloading', 'uploading'].includes(c.uploadStatus)}
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditCaptionTarget(c); }}
            className="p-1.5 text-muted hover:text-yellow-400 transition-colors"
            title="Edit konten"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setViewContent(c); }}
            className="p-1.5 text-muted hover:text-white transition-colors"
            title="Lihat detail"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
            className="p-1.5 text-muted hover:text-danger transition-colors"
            title="Hapus konten"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Header
        title="Konten"
        subtitle={`${contents?.length ?? 0} konten`}
        actions={
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Konten
          </button>
        }
      />
      <div className="p-6">
        {isLoading ? (
          <PageLoading />
        ) : !contents?.length ? (
          <EmptyState message="Belum ada konten" />
        ) : (
          <div className="card p-0 overflow-hidden">
            <DataTable columns={columns} data={contents} keyExtractor={(c) => c.id} />
          </div>
        )}
      </div>

      <CreateContentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {viewContent && (
        <ContentDetailModal content={viewContent} onClose={() => setViewContent(null)} />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Konten"
        message="Yakin ingin menghapus konten ini?"
        confirmText="Hapus"
        loading={deleteMutation.isPending}
      />
      {uploadTarget && (
        <UploadContentModal content={uploadTarget} onClose={() => setUploadTarget(null)} />
      )}
      {editCaptionTarget && (
        <EditCaptionModal content={editCaptionTarget} onClose={() => setEditCaptionTarget(null)} />
      )}
    </>
  );
}

// ──────────────────────── Create Content Modal ────────────────────────
interface UploadedFileInfo {
  id: string;
  name: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
  url: string;
}

function CreateContentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    tiktokAccountId: '',
    driveUrl: '',
    briefTopic: '',
    briefPoints: '',
    targetAudience: '',
    tone: '',
    nicheTemplate: 'bisnis' as NicheType,
  });
  const [videoSource, setVideoSource] = useState<'drive' | 'local'>('local');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<TikTokAccount[]>>('/tiktok-accounts');
      return data.data;
    },
  });

  const { data: uploadedFiles } = useQuery({
    queryKey: ['uploaded-files'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<UploadedFileInfo[]>>('/files');
      return ((data as any).data || data) as UploadedFileInfo[];
    },
    enabled: videoSource === 'local',
  });

  const handleAiSuggest = async () => {
    setAiLoading(true);
    setError('');
    try {
      const { data } = await api.post<ApiResponse<{
        brief_topic: string;
        brief_points: string[];
        target_audience: string;
        tone: string;
      }>>('/contents/ai-suggest-brief', {
        niche_template: form.nicheTemplate,
        drive_url: form.driveUrl || undefined,
      });
      const result = (data as any).data || data;
      setForm((prev) => ({
        ...prev,
        briefTopic: result.brief_topic || prev.briefTopic,
        briefPoints: result.brief_points?.join('\n') || prev.briefPoints,
        targetAudience: result.target_audience || prev.targetAudience,
        tone: result.tone || prev.tone,
      }));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Gagal generate AI. Pastikan AI_API_KEY sudah dikonfig.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/contents', {
        tiktok_account_id: form.tiktokAccountId,
        drive_url: form.driveUrl || undefined,
        brief_topic: form.briefTopic,
        brief_points: form.briefPoints.split('\n').filter(Boolean),
        target_audience: form.targetAudience,
        tone: form.tone,
        niche_template: form.nicheTemplate,
      });
      qc.invalidateQueries({ queryKey: ['contents'] });
      onClose();
      setForm({ tiktokAccountId: '', driveUrl: '', briefTopic: '', briefPoints: '', targetAudience: '', tone: '', nicheTemplate: 'bisnis' as NicheType });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const niches = ['bisnis', 'kesehatan', 'fitnes', 'edukasi', 'hiburan', 'teknologi', 'kuliner', 'travel', 'fashion', 'keuangan'];

  const localFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];

  return (
    <Modal open={open} onClose={onClose} title="Tambah Konten" maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Akun TikTok</label>
            <select className="input-field" value={form.tiktokAccountId} onChange={(e) => setForm({ ...form, tiktokAccountId: e.target.value })} required>
              <option value="">Pilih akun</option>
              {accounts?.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Niche Template</label>
            <select className="input-field" value={form.nicheTemplate} onChange={(e) => setForm({ ...form, nicheTemplate: e.target.value as NicheType })}>
              {niches.map((n) => <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Video source selector */}
        <div>
          <label className="block text-sm font-medium text-muted mb-1">Sumber Video</label>
          <div className="flex gap-1 bg-background border border-border rounded-lg p-1">
            <button
              type="button"
              onClick={() => { setVideoSource('local'); setForm(f => ({ ...f, driveUrl: '' })); }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                videoSource === 'local' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
              }`}
            >
              <Upload className="w-3 h-3 inline mr-1" />
              File Lokal
            </button>
            <button
              type="button"
              onClick={() => { setVideoSource('drive'); setForm(f => ({ ...f, driveUrl: '' })); }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                videoSource === 'drive' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
              }`}
            >
              <Cloud className="w-3 h-3 inline mr-1" />
              Google Drive
            </button>
          </div>
        </div>

        {videoSource === 'drive' ? (
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Link Google Drive</label>
            <input className="input-field" value={form.driveUrl} onChange={(e) => setForm({ ...form, driveUrl: e.target.value })} placeholder="https://drive.google.com/..." />
            <p className="text-xs text-muted mt-1">Opsional — bisa ditambahkan nanti</p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Pilih File Video</label>
            {localFiles.length > 0 ? (
              <select
                className="input-field"
                value={form.driveUrl}
                onChange={(e) => setForm({ ...form, driveUrl: e.target.value })}
              >
                <option value="">-- Pilih video (opsional) --</option>
                {localFiles.map((f) => (
                  <option key={f.id} value={`local://${f.name}`}>
                    {f.originalName} ({formatSize(f.size)})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-muted bg-card-hover rounded-lg p-3">
                Belum ada file video. Upload video di halaman <strong>Video Manager</strong> terlebih dahulu, atau gunakan tab Google Drive.
              </div>
            )}
          </div>
        )}

        {/* AI Suggest Button */}
        <div className="border border-dashed border-primary/30 rounded-lg p-3 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted">
              <span className="font-medium text-primary">AI Auto-Fill:</span> Generate topik, poin penting, target audiens, dan tone otomatis berdasarkan niche yang dipilih.
            </div>
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={aiLoading}
              className="btn-secondary flex items-center gap-2 text-sm whitespace-nowrap shrink-0 border-primary/30 text-primary hover:bg-primary hover:text-white"
            >
              {aiLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate AI
                </>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Topik</label>
          <input className="input-field" value={form.briefTopic} onChange={(e) => setForm({ ...form, briefTopic: e.target.value })} placeholder="Topik video" required />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Poin-poin Penting (satu per baris)</label>
          <textarea className="input-field min-h-[80px]" value={form.briefPoints} onChange={(e) => setForm({ ...form, briefPoints: e.target.value })} placeholder="Poin 1&#10;Poin 2&#10;Poin 3" rows={3} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Target Audiens</label>
            <input className="input-field" value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} placeholder="Wanita 25-35 tahun" />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Tone</label>
            <input className="input-field" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} placeholder="Santai, edukatif" />
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ──────────────────────── Content Detail Modal ────────────────────────
function ContentDetailModal({ content, onClose }: { content: Content; onClose: () => void }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [editingFinal, setEditingFinal] = useState(false);
  const [finalCaptionEdit, setFinalCaptionEdit] = useState(content.finalCaption || '');
  const [finalHashtagsEdit, setFinalHashtagsEdit] = useState(
    content.finalHashtags?.map(h => `#${h}`).join(' ') || ''
  );

  // Local state for AI options (allows editing before saving)
  const [localOptions, setLocalOptions] = useState<{ caption: string; hashtags: string[] }[] | null>(
    content.aiOptions ? content.aiOptions.map(o => ({ caption: o.caption, hashtags: [...o.hashtags] })) : null,
  );
  const [selectedOption, setSelectedOption] = useState<number | null>(content.selectedOptionIndex);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [contentStatus, setContentStatus] = useState(content.status);

  // Generate AI mutation — updates local state immediately
  const generateMutation = useMutation({
    mutationFn: () => api.post(`/contents/${content.id}/ai-generate`),
    onSuccess: (res: any) => {
      const data = res.data?.data || res.data;
      const options = data.options || data.aiOptions || [];
      setLocalOptions(options.map((o: any) => ({ caption: o.caption, hashtags: [...o.hashtags] })));
      setContentStatus(ContentStatus.AI_GENERATED);
      setSelectedOption(null);
      setEditingIdx(null);
      qc.invalidateQueries({ queryKey: ['contents'] });
    },
  });

  // Finalize mutation — saves selected (possibly edited) option
  const finalizeMutation = useMutation({
    mutationFn: ({ optionIndex, caption, hashtags }: { optionIndex: number; caption: string; hashtags: string[] }) => {
      return api.post(`/contents/${content.id}/finalize`, {
        selected_option_index: optionIndex,
        final_caption: caption,
        final_hashtags: hashtags,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['contents'] });
      onClose();
    },
  });

  const startEdit = (idx: number) => {
    if (!localOptions) return;
    const opt = localOptions[idx];
    setEditingIdx(idx);
    setEditCaption(opt.caption);
    setEditHashtags(opt.hashtags.map(h => `#${h}`).join(' '));
  };

  const saveEdit = () => {
    if (editingIdx === null || !localOptions) return;
    const updatedOptions = [...localOptions];
    const cleanHashtags = editHashtags
      .split(/[\s,]+/)
      .map(h => h.replace(/^#/, '').trim())
      .filter(Boolean);
    updatedOptions[editingIdx] = { caption: editCaption, hashtags: cleanHashtags };
    setLocalOptions(updatedOptions);
    setEditingIdx(null);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
  };

  const handleSelect = (idx: number) => {
    if (!localOptions || finalizeMutation.isPending) return;
    setSelectedOption(idx);
    const opt = localOptions[idx];
    finalizeMutation.mutate({
      optionIndex: idx,
      caption: opt.caption,
      hashtags: opt.hashtags,
    });
  };

  const handleCopy = async () => {
    if (content.finalCaption) {
      const text = `${content.finalCaption}\n\n${content.finalHashtags?.map((h) => `#${h}`).join(' ') || ''}`;
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  // Update caption mutation
  const updateCaptionMutation = useMutation({
    mutationFn: ({ caption, hashtags }: { caption: string; hashtags: string[] }) => {
      return api.patch(`/contents/${content.id}`, {
        final_caption: caption,
        final_hashtags: hashtags,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['contents'] });
      setEditingFinal(false);
    },
  });

  const handleSaveFinalEdit = () => {
    const cleanHashtags = finalHashtagsEdit
      .split(/[\s,]+/)
      .map(h => h.replace(/^#/, '').trim())
      .filter(Boolean);
    updateCaptionMutation.mutate({ caption: finalCaptionEdit, hashtags: cleanHashtags });
  };

  const canGenerate = contentStatus === 'draft' || contentStatus === 'ai_generated';

  return (
    <Modal open={true} onClose={onClose} title="Detail Konten" maxWidth="max-w-3xl">
      <div className="space-y-5">
        {/* Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted">Akun:</span>
            <span className="ml-2 font-medium">@{content.tiktokAccount?.username}</span>
          </div>
          <div>
            <span className="text-muted">Status:</span>
            <span className="ml-2"><StatusBadge status={contentStatus} /></span>
          </div>
          <div>
            <span className="text-muted">Topik:</span>
            <span className="ml-2">{content.briefTopic}</span>
          </div>
          <div>
            <span className="text-muted">Video:</span>
            {content.driveUrl ? (
              content.driveUrl.startsWith('local://') ? (
                <span className="ml-2 text-sm">{content.driveUrl.replace('local://', '')} (lokal)</span>
              ) : (
                <a href={content.driveUrl} target="_blank" className="ml-2 text-primary hover:underline">Buka Link</a>
              )
            ) : (
              <span className="ml-2 text-muted">Belum ada video</span>
            )}
          </div>
        </div>

        {/* AI Generation Button */}
        {canGenerate && (
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="btn-primary flex items-center gap-2 w-full justify-center"
          >
            {generateMutation.isPending ? <LoadingSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
            {generateMutation.isPending ? 'Generating...' : localOptions ? 'Re-generate AI Caption' : 'Generate AI Caption'}
          </button>
        )}

        {/* AI Options — editable & selectable */}
        {localOptions && localOptions.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">
              Pilihan AI Caption:
              <span className="text-muted font-normal ml-1">(klik untuk langsung simpan, ✏️ untuk edit dulu)</span>
            </h4>
            {localOptions.map((opt, idx) => (
              <div key={idx}>
                {editingIdx === idx ? (
                  /* ─── Edit Mode ─── */
                  <div className="p-4 rounded-lg border border-primary bg-primary/5 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Caption</label>
                      <textarea
                        className="input-field text-sm min-h-[100px]"
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Hashtags (pisahkan dengan spasi)</label>
                      <input
                        className="input-field text-sm"
                        value={editHashtags}
                        onChange={(e) => setEditHashtags(e.target.value)}
                        placeholder="#hashtag1 #hashtag2 #hashtag3"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={cancelEdit} className="btn-secondary text-xs py-1.5 px-3">Batal</button>
                      <button onClick={saveEdit} className="btn-primary text-xs py-1.5 px-3">Simpan Edit</button>
                    </div>
                  </div>
                ) : (
                  /* ─── View Mode ─── */
                  <div
                    onClick={() => handleSelect(idx)}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedOption === idx
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border/80'
                    } ${finalizeMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm whitespace-pre-wrap">{opt.caption}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {opt.hashtags.map((h, i) => (
                            <span key={i} className="text-xs text-primary">#{h}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(idx); }}
                          className="p-1.5 text-muted hover:text-primary transition-colors"
                          title="Edit caption"
                        >
                          <Wand2 className="w-4 h-4" />
                        </button>
                        {selectedOption === idx && finalizeMutation.isPending && (
                          <LoadingSpinner size="sm" />
                        )}
                        {selectedOption === idx && !finalizeMutation.isPending && (
                          <CheckCircle className="w-5 h-5 text-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Final Caption (already finalized) */}
        {content.finalCaption && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Caption Final</h4>
              <div className="flex items-center gap-2">
                {!editingFinal && (
                  <button
                    onClick={() => setEditingFinal(true)}
                    className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
                <button onClick={handleCopy} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3">
                  <Copy className="w-3 h-3" />
                  {copied ? 'Tersalin!' : 'Salin'}
                </button>
              </div>
            </div>

            {editingFinal ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Caption</label>
                  <textarea
                    className="input-field text-sm min-h-[120px]"
                    value={finalCaptionEdit}
                    onChange={(e) => setFinalCaptionEdit(e.target.value)}
                    rows={5}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Hashtags (pisahkan dengan spasi)</label>
                  <input
                    className="input-field text-sm"
                    value={finalHashtagsEdit}
                    onChange={(e) => setFinalHashtagsEdit(e.target.value)}
                    placeholder="#hashtag1 #hashtag2 #hashtag3"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setEditingFinal(false);
                      setFinalCaptionEdit(content.finalCaption || '');
                      setFinalHashtagsEdit(content.finalHashtags?.map(h => `#${h}`).join(' ') || '');
                    }}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSaveFinalEdit}
                    disabled={updateCaptionMutation.isPending}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    {updateCaptionMutation.isPending ? <LoadingSpinner size="sm" /> : <Check className="w-3 h-3" />}
                    Simpan
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 bg-card-hover rounded-lg text-sm whitespace-pre-wrap">
                  {content.finalCaption}
                </div>
                {content.finalHashtags && (
                  <div className="flex flex-wrap gap-1">
                    {content.finalHashtags.map((h, i) => (
                      <span key={i} className="text-sm text-primary">#{h}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ──────────────────────── Edit Caption Modal ────────────────────────

/** Parse a txt file with key: value format into content fields */
function parseTxtContent(text: string): { title: string; hashtags: string; description: string } {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const result: Record<string, string> = {};
  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    const match = line.match(/^(title|hashtags|description|keywords|timestamps|model\/provider|prompt_used|score|created_at):\s*(.*)$/i);
    if (match) {
      if (currentKey) result[currentKey] = currentValue.trim();
      currentKey = match[1].toLowerCase();
      currentValue = match[2];
    } else if (currentKey) {
      currentValue += '\n' + line;
    }
  }
  if (currentKey) result[currentKey] = currentValue.trim();

  return {
    title: result['title'] || '',
    hashtags: result['hashtags'] || '',
    description: result['description'] || '',
  };
}

function EditCaptionModal({ content, onClose }: { content: Content; onClose: () => void }) {
  const qc = useQueryClient();
  const [briefTopic, setBriefTopic] = useState(content.briefTopic || '');
  const [caption, setCaption] = useState(content.finalCaption || '');
  const [hashtags, setHashtags] = useState(
    content.finalHashtags?.map(h => `#${h}`).join(' ') || ''
  );
  const [aiOptions, setAiOptions] = useState<{ caption: string; hashtags: string[] }[] | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply parsed txt content to form fields
  const applyParsedContent = (parsed: { title: string; hashtags: string; description: string }) => {
    if (parsed.title) setBriefTopic(parsed.title);
    if (parsed.hashtags) setHashtags(parsed.hashtags);
    if (parsed.description) setCaption(parsed.description);
    setImportError('');
  };

  // Import from local txt file
  const handleLocalFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseTxtContent(text);
        applyParsedContent(parsed);
      } catch {
        setImportError('Gagal membaca file txt.');
      } finally {
        setImportLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setImportError('Gagal membaca file.');
      setImportLoading(false);
    };
    reader.readAsText(file);
  };

  // Import from Google Drive txt file
  const handleDriveImport = async () => {
    if (!driveUrl.trim()) return;
    setImportLoading(true);
    setImportError('');
    try {
      const { data } = await api.get('/google-drive/read-txt', { params: { fileId: driveUrl.trim() } });
      const parsed = data.data?.parsed || data.parsed;
      if (parsed) {
        applyParsedContent(parsed);
        setDriveUrl('');
      } else {
        setImportError('Format file tidak sesuai.');
      }
    } catch (err: any) {
      setImportError(err.response?.data?.message || 'Gagal mengambil file dari Google Drive.');
    } finally {
      setImportLoading(false);
    }
  };

  // Generate AI captions
  const generateMutation = useMutation({
    mutationFn: () => api.post(`/contents/${content.id}/ai-generate`, {
      custom_prompt: customPrompt.trim() || undefined,
    }),
    onSuccess: (res: any) => {
      const data = res.data?.data || res.data;
      const options = data.options || data.aiOptions || [];
      const mapped = options.map((o: any) => ({ caption: o.caption, hashtags: [...o.hashtags] }));
      // Auto-fill the first option into caption/hashtags
      if (mapped.length > 0) {
        setCaption(mapped[0].caption);
        setHashtags(mapped[0].hashtags.map((h: string) => `#${h}`).join(' '));
      }
      // Show remaining options as alternatives
      setAiOptions(mapped.length > 1 ? mapped.slice(1) : null);
    },
  });

  // Save caption
  const updateMutation = useMutation({
    mutationFn: () => {
      const cleanHashtags = hashtags
        .split(/[\s,]+/)
        .map(h => h.replace(/^#/, '').trim())
        .filter(Boolean);
      return api.patch(`/contents/${content.id}`, {
        brief_topic: briefTopic.trim() || undefined,
        final_caption: caption,
        final_hashtags: cleanHashtags,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['contents'] });
      onClose();
    },
  });

  const selectAiOption = (opt: { caption: string; hashtags: string[] }) => {
    setCaption(opt.caption);
    setHashtags(opt.hashtags.map(h => `#${h}`).join(' '));
    setAiOptions(null);
  };

  return (
    <Modal open={true} onClose={onClose} title="Edit Konten" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Import from TXT file */}
        <div className="p-3 rounded-lg border border-border bg-card-hover space-y-3">
          <p className="text-xs text-muted">
            <span className="text-green-400 font-medium"><FileText className="w-3.5 h-3.5 inline-block mr-1" />Import dari File TXT:</span> Isi form otomatis dari file metadata (title → Topik, hashtags → Hashtags, description → Caption)
          </p>

          <div className="flex gap-2">
            {/* Local file upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleLocalFileImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              {importLoading ? <LoadingSpinner size="sm" /> : <FolderOpen className="w-3.5 h-3.5" />}
              Pilih File .txt
            </button>

            {/* Google Drive import */}
            <div className="flex-1 flex gap-1.5">
              <input
                className="input-field text-xs flex-1"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="Paste URL Google Drive file .txt..."
              />
              <button
                type="button"
                onClick={handleDriveImport}
                disabled={importLoading || !driveUrl.trim()}
                className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 whitespace-nowrap"
              >
                {importLoading ? <LoadingSpinner size="sm" /> : <Cloud className="w-3.5 h-3.5" />}
                Ambil
              </button>
            </div>
          </div>

          {importError && (
            <p className="text-xs text-danger">{importError}</p>
          )}
        </div>

        {/* Topic */}
        <div>
          <label className="block text-sm font-medium mb-1">Topik</label>
          <input
            className="input-field text-sm"
            value={briefTopic}
            onChange={(e) => setBriefTopic(e.target.value)}
            placeholder="Masukkan topik konten"
          />
        </div>

        {/* Generate AI Section */}
        <div className="p-3 rounded-lg border border-border bg-card-hover space-y-3">
          <p className="text-xs text-muted">
            <span className="text-primary font-medium">AI Generate:</span> Generate ulang caption & hashtags menggunakan AI berdasarkan topik konten.
          </p>
          <textarea
            className="input-field text-sm min-h-[60px]"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={2}
            placeholder="Tulis instruksi tambahan untuk AI... (opsional, contoh: 'buat lebih lucu', 'fokus ke promo diskon')"
          />
          <div className="flex justify-end">
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              {generateMutation.isPending ? <LoadingSpinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate AI
            </button>
          </div>
        </div>

        {/* AI Options — pick one to fill the form */}
        {aiOptions && aiOptions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted">Opsi lainnya (klik untuk ganti):</h4>
            {aiOptions.map((opt, idx) => (
              <div
                key={idx}
                onClick={() => selectAiOption(opt)}
                className="p-3 rounded-lg border border-border hover:border-primary cursor-pointer transition-colors"
              >
                <p className="text-sm whitespace-pre-wrap">{opt.caption}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {opt.hashtags.map((h, i) => (
                    <span key={i} className="text-xs text-primary">#{h}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Caption</label>
          <textarea
            className="input-field text-sm min-h-[150px]"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={6}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Hashtags <span className="text-muted font-normal">(pisahkan dengan spasi)</span></label>
          <input
            className="input-field text-sm"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#hashtag1 #hashtag2 #hashtag3"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !briefTopic.trim()}
            className="btn-primary flex items-center gap-2"
          >
            {updateMutation.isPending ? <LoadingSpinner size="sm" /> : <Check className="w-4 h-4" />}
            Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Upload Status Cell ─── */
function UploadStatusCell({ content, onDismiss, onRetry, onCancel }: {
  content: Content;
  onDismiss: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const s = content.uploadStatus;
  if (!s || s === 'idle') return <span className="text-muted text-xs">—</span>;

  const platformLabel = content.uploadPlatform === 'youtube' ? 'YouTube' : 'TikTok';

  if (s === 'queued') {
    return (
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
        <span className="text-xs text-yellow-400">Antrian</span>
        <span className="text-xs text-muted">({platformLabel})</span>
        <button onClick={(e) => { e.stopPropagation(); onCancel(content.id); }} className="p-0.5 text-muted hover:text-danger" title="Batalkan">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (s === 'downloading') {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
        <span className="text-xs text-blue-400">Downloading...</span>
      </div>
    );
  }

  if (s === 'uploading') {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
        <span className="text-xs text-primary">Uploading...</span>
        <span className="text-xs text-muted">({platformLabel})</span>
      </div>
    );
  }

  if (s === 'processing') {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
        <span className="text-xs text-orange-400">Processing...</span>
      </div>
    );
  }

  if (s === 'published') {
    return (
      <div className="flex items-center gap-1.5">
        <Check className="w-3.5 h-3.5 text-success" />
        <span className="text-xs text-success">Berhasil</span>
        <span className="text-xs text-muted">({platformLabel})</span>
        <button onClick={(e) => { e.stopPropagation(); onDismiss(content.id); }} className="p-0.5 text-muted hover:text-white" title="Hapus status">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (s === 'failed') {
    return (
      <div className="flex items-center gap-1.5">
        <XCircle className="w-3.5 h-3.5 text-danger" />
        <span className="text-xs text-danger" title={content.uploadError || ''}>Gagal</span>
        <button onClick={(e) => { e.stopPropagation(); onRetry(content.id); }} className="p-0.5 text-muted hover:text-primary" title="Retry">
          <RotateCcw className="w-3 h-3" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDismiss(content.id); }} className="p-0.5 text-muted hover:text-white" title="Hapus status">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return <span className="text-xs text-muted">{s}</span>;
}

/* ─── Upload Content Modal ─── */
function UploadContentModal({ content, onClose }: { content: Content; onClose: () => void }) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<'tiktok' | 'youtube'>('tiktok');
  const [method, setMethod] = useState<'browser' | 'api'>('browser');
  const [ytMethod, setYtMethod] = useState<'browser' | 'api'>('browser');
  const [privacyLevel, setPrivacyLevel] = useState('SELF_ONLY');
  const [ytPrivacyStatus, setYtPrivacyStatus] = useState<'public' | 'private' | 'unlisted'>('public');
  const [selectedAccountId, setSelectedAccountId] = useState(content.tiktokAccountId || '');
  const [selectedYtAccountId, setSelectedYtAccountId] = useState('');
  const [error, setError] = useState('');

  // Fetch TikTok accounts
  const { data: tiktokAccountsRes } = useQuery<ApiResponse<TikTokAccount[]>>({
    queryKey: ['tiktok-accounts'],
    queryFn: () => api.get('/tiktok-accounts').then((r) => r.data),
  });
  const allTiktokAccounts = tiktokAccountsRes?.data || [];

  // Fetch YouTube accounts
  const { data: ytAccountsRes } = useQuery<ApiResponse<YouTubeAccount[]>>({
    queryKey: ['youtube-accounts'],
    queryFn: () => api.get('/youtube-accounts').then((r) => r.data),
  });
  const allYtAccounts = ytAccountsRes?.data || [];

  const enqueueMutation = useMutation({
    mutationFn: async () => {
      const accountId = platform === 'tiktok' ? selectedAccountId : selectedYtAccountId;
      const uploadMethod = platform === 'tiktok' ? method : ytMethod;
      const privacy = platform === 'tiktok' ? privacyLevel : ytPrivacyStatus;

      if (!accountId) {
        throw new Error(`Pilih akun ${platform === 'tiktok' ? 'TikTok' : 'YouTube'} terlebih dahulu.`);
      }

      await api.post(`/upload/queue/${content.id}`, {
        platform,
        method: uploadMethod,
        account_id: accountId,
        privacy,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contents'] });
      onClose(); // Close modal immediately!
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Gagal menambahkan ke antrian.');
    },
  });

  const handleUpload = () => {
    setError('');
    enqueueMutation.mutate();
  };

  const hasVideo = !!content.driveUrl;
  const hasCaption = !!content.finalCaption;

  return (
    <Modal open onClose={onClose} title="Upload Video">
      <div className="space-y-4">
        {/* Platform selector */}
        <div>
          <label className="block text-sm font-medium mb-2">Platform</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPlatform('tiktok')}
              className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                platform === 'tiktok'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-muted'
              }`}
            >
              <MonitorPlay className="w-5 h-5 mx-auto mb-1" />
              TikTok
            </button>
            <button
              type="button"
              onClick={() => setPlatform('youtube')}
              className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                platform === 'youtube'
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : 'border-border hover:border-muted'
              }`}
            >
              <Youtube className="w-5 h-5 mx-auto mb-1" />
              YouTube
            </button>
          </div>
        </div>

        {/* Content info */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Topik</span>
            <span className="font-medium">{content.briefTopic}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Video</span>
            <span className={hasVideo ? 'text-success' : 'text-danger'}>
              {hasVideo ? '✓ Ada' : '✗ Belum ada'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Caption</span>
            <span className={hasCaption ? 'text-success' : 'text-danger'}>
              {hasCaption ? '✓ Ada' : '✗ Belum ada'}
            </span>
          </div>
        </div>

        {/* TikTok specific options */}
        {platform === 'tiktok' && (
          <>
            {/* TikTok Account selector */}
            <div>
              <label className="block text-sm font-medium mb-1">Akun TikTok</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
              >
                <option value="">-- Pilih Akun TikTok --</option>
                {allTiktokAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    @{acc.username}{acc.id === content.tiktokAccountId ? ' (asal)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Method selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Metode Upload</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('browser')}
                  className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                    method === 'browser'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted'
                  }`}
                >
                  <MonitorPlay className="w-5 h-5 mx-auto mb-1" />
                  Browser
                  <div className="text-xs text-muted mt-0.5">Via Puppeteer</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('api')}
                  className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                    method === 'api'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted'
                  }`}
                >
                  <Sparkles className="w-5 h-5 mx-auto mb-1" />
                  API
                  <div className="text-xs text-muted mt-0.5">TikTok API</div>
                </button>
              </div>
            </div>

            {/* Privacy level */}
            <div>
              <label className="block text-sm font-medium mb-1">Privasi</label>
              <select
                value={privacyLevel}
                onChange={(e) => setPrivacyLevel(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
              >
                <option value="PUBLIC_TO_EVERYONE">Publik</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">Teman</option>
                <option value="FOLLOWER_OF_CREATOR">Pengikut</option>
                <option value="SELF_ONLY">Hanya Saya</option>
              </select>
            </div>
          </>
        )}

        {/* YouTube specific options */}
        {platform === 'youtube' && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Akun YouTube</label>
              <select
                value={selectedYtAccountId}
                onChange={(e) => setSelectedYtAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
              >
                <option value="">-- Pilih Akun YouTube --</option>
                {allYtAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.channelName}{acc.email ? ` (${acc.email})` : ''}
                    {acc.isApiConnected ? ' [API]' : ''}
                    {acc.isBrowserLoggedIn ? ' [Browser]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* YouTube upload method selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Metode Upload</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setYtMethod('browser')}
                  className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                    ytMethod === 'browser'
                      ? 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-border hover:border-muted'
                  }`}
                >
                  <MonitorPlay className="w-5 h-5 mx-auto mb-1" />
                  Browser
                  <div className="text-xs text-muted mt-0.5">Via Puppeteer</div>
                </button>
                <button
                  type="button"
                  onClick={() => setYtMethod('api')}
                  className={`p-3 rounded-lg border text-sm text-center transition-colors ${
                    ytMethod === 'api'
                      ? 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-border hover:border-muted'
                  }`}
                >
                  <Sparkles className="w-5 h-5 mx-auto mb-1" />
                  API
                  <div className="text-xs text-muted mt-0.5">YouTube Data API</div>
                </button>
              </div>
            </div>

            {/* YouTube privacy status */}
            <div>
              <label className="block text-sm font-medium mb-1">Visibilitas</label>
              <select
                value={ytPrivacyStatus}
                onChange={(e) => setYtPrivacyStatus(e.target.value as 'public' | 'private' | 'unlisted')}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm"
              >
                <option value="public">Publik</option>
                <option value="unlisted">Tidak Tercantum (Unlisted)</option>
                <option value="private">Privat</option>
              </select>
            </div>

            {/* Method-specific info */}
            {ytMethod === 'browser' ? (
              <div className="p-3 bg-card-hover rounded-lg text-xs text-muted">
                Upload ke YouTube menggunakan browser automation (Puppeteer).
                Pastikan akun YouTube sudah login via halaman Akun YouTube.
              </div>
            ) : (
              <div className="p-3 bg-card-hover rounded-lg text-xs text-muted">
                Upload ke YouTube menggunakan YouTube Data API v3.
                Pastikan akun YouTube sudah terhubung via OAuth di halaman Akun YouTube.
              </div>
            )}
          </>
        )}

        {/* Caption preview */}
        {content.finalCaption && (
          <div>
            <label className="block text-sm font-medium mb-1">Caption</label>
            <div className="p-2 bg-surface border border-border rounded-lg text-sm text-muted max-h-24 overflow-y-auto">
              {content.finalCaption}
              {content.finalHashtags?.length ? (
                <span className="text-primary"> {content.finalHashtags.map(h => `#${h}`).join(' ')}</span>
              ) : null}
            </div>
          </div>
        )}

        {/* warnings */}
        {(!hasVideo || !hasCaption) && (
          <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm text-warning">
            {!hasVideo && <div>⚠ Video belum tersedia. Upload mungkin gagal.</div>}
            {!hasCaption && <div>⚠ Caption belum di-generate. Akan digunakan topik sebagai caption.</div>}
          </div>
        )}

        {/* Error / Success */}
        {error && <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost" disabled={enqueueMutation.isPending}>
            Batal
          </button>
          <button
            onClick={handleUpload}
            disabled={enqueueMutation.isPending || ['queued', 'downloading', 'uploading'].includes(content.uploadStatus)}
            className={`flex items-center gap-2 ${platform === 'youtube' ? 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-sm' : 'btn-primary'}`}
          >
            {enqueueMutation.isPending ? (
              <>
                <LoadingSpinner /> Menambahkan...
              </>
            ) : (
              <>
                {platform === 'youtube' ? <Youtube className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                Upload ke {platform === 'youtube' ? 'YouTube' : 'TikTok'}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
