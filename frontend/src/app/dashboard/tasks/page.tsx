'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Modal } from '@/components/ui/modal';
import { PageLoading, EmptyState } from '@/components/ui/loading';
import api from '@/lib/api';
import { formatDateTime, formatTime, copyToClipboard } from '@/lib/utils';
import type { ApiResponse, ScheduledPost } from '@/types';
import { Copy, Check, ExternalLink, Clock, CheckCircle, Upload, RefreshCw, AlertTriangle, Globe } from 'lucide-react';

export default function TasksPage() {
  const qc = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<ScheduledPost | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ date: string; summary: any; tasks: ScheduledPost[] }>>('/my-tasks');
      return data.data.tasks;
    },
    refetchInterval: 30_000,
  });

  // Group tasks by status
  const pending = tasks?.filter((t) => ['pending', 'notified'].includes(t.status)) || [];
  const late = tasks?.filter((t) => t.status === 'late') || [];
  const done = tasks?.filter((t) => t.status === 'done') || [];

  return (
    <>
      <Header title="Tugas Saya" subtitle={`${pending.length} tugas menunggu`} />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <PageLoading />
        ) : !tasks?.length ? (
          <EmptyState message="Tidak ada tugas hari ini" />
        ) : (
          <>
            {/* Late tasks - urgent */}
            {late.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-danger mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Terlambat ({late.length})
                </h3>
                <div className="grid gap-3">
                  {late.map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                  ))}
                </div>
              </section>
            )}

            {/* Pending tasks */}
            {pending.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-warning mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Menunggu ({pending.length})
                </h3>
                <div className="grid gap-3">
                  {pending.map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                  ))}
                </div>
              </section>
            )}

            {/* Done tasks */}
            {done.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-success mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Selesai ({done.length})
                </h3>
                <div className="grid gap-3">
                  {done.map((task) => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {selectedTask && (
        <ExecutionModal
          task={selectedTask}
          onClose={() => {
            setSelectedTask(null);
            qc.invalidateQueries({ queryKey: ['my-tasks'] });
          }}
        />
      )}
    </>
  );
}

function TaskCard({ task, onClick }: { task: ScheduledPost; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="card cursor-pointer hover:bg-card-hover transition-colors flex items-center justify-between"
    >
      <div className="flex items-center gap-4">
        <div className="text-center min-w-[60px]">
          <p className="text-2xl font-bold text-primary">{formatTime(task.scheduledAt)}</p>
        </div>
        <div>
          <p className="font-medium">@{task.tiktokAccount?.username}</p>
          <p className="text-sm text-muted">{task.content?.briefTopic}</p>
        </div>
      </div>
      <StatusBadge status={task.status} />
    </div>
  );
}

// ──────────────────────── Execution Modal ────────────────────────
function ExecutionModal({ task, onClose }: { task: ScheduledPost; onClose: () => void }) {
  const [tiktokUrl, setTiktokUrl] = useState(task.tiktokUrl || '');
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [checklist, setChecklist] = useState({
    downloadedVideo: false,
    copiedCaption: false,
    copiedHashtags: false,
    openedTiktok: false,
    postedVideo: false,
  });
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'auto' | 'browser' | 'manual'>('browser');
  const [uploadStatus, setUploadStatus] = useState(task.uploadStatus || 'idle');
  const [uploadError, setUploadError] = useState(task.uploadError || '');
  const [privacyLevel, setPrivacyLevel] = useState('SELF_ONLY');

  const markDoneMutation = useMutation({
    mutationFn: () => api.patch(`/schedules/${task.id}/done`, { tiktokUrl }),
    onSuccess: () => onClose(),
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Gagal menandai selesai');
    },
  });

  const directUploadMutation = useMutation({
    mutationFn: async () => {
      setUploadStatus('downloading');
      setUploadError('');
      const { data } = await api.post(`/upload/${task.id}/tiktok`, { privacy_level: privacyLevel });
      return data.data;
    },
    onSuccess: () => {
      setUploadStatus('published');
      setTimeout(() => onClose(), 2000);
    },
    onError: (err: any) => {
      setUploadStatus('failed');
      setUploadError(err.response?.data?.message || err.message || 'Upload gagal');
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      setUploadStatus('downloading');
      setUploadError('');
      const { data } = await api.post(`/upload/${task.id}/retry`, { privacy_level: privacyLevel });
      return data.data;
    },
    onSuccess: () => {
      setUploadStatus('published');
      setTimeout(() => onClose(), 2000);
    },
    onError: (err: any) => {
      setUploadStatus('failed');
      setUploadError(err.response?.data?.message || err.message || 'Retry gagal');
    },
  });

  const browserUploadMutation = useMutation({
    mutationFn: async () => {
      setUploadStatus('downloading');
      setUploadError('');
      const { data } = await api.post(`/upload/${task.id}/browser`);
      return data.data;
    },
    onSuccess: () => {
      setUploadStatus('published');
      setTimeout(() => onClose(), 2000);
    },
    onError: (err: any) => {
      setUploadStatus('failed');
      setUploadError(err.response?.data?.message || err.message || 'Browser upload gagal');
    },
  });

  const content = task.content;
  const caption = content?.finalCaption || '';
  const hashtags = content?.finalHashtags?.map((h) => `#${h}`).join(' ') || '';
  const allChecked = Object.values(checklist).every(Boolean);
  const isDone = task.status === 'done';
  const isUploading = uploadStatus === 'downloading' || uploadStatus === 'uploading' || uploadStatus === 'processing';
  const isConnected = task.tiktokAccount?.isOauthConnected;
  const isBrowserLoggedIn = task.tiktokAccount?.isBrowserLoggedIn;

  const handleCopyCaption = async () => {
    const ok = await copyToClipboard(caption);
    if (ok) { setCopiedCaption(true); setChecklist({ ...checklist, copiedCaption: true }); setTimeout(() => setCopiedCaption(false), 2000); }
  };

  const handleCopyHashtags = async () => {
    const ok = await copyToClipboard(hashtags);
    if (ok) { setCopiedHashtags(true); setChecklist({ ...checklist, copiedHashtags: true }); setTimeout(() => setCopiedHashtags(false), 2000); }
  };

  const getUploadStatusBadge = () => {
    switch (uploadStatus) {
      case 'downloading': return <span className="badge bg-blue-500/20 text-blue-400 animate-pulse">Mendownload dari Google Drive...</span>;
      case 'uploading': return <span className="badge bg-blue-500/20 text-blue-400 animate-pulse">Mengunggah ke TikTok...</span>;
      case 'processing': return <span className="badge bg-yellow-500/20 text-yellow-400 animate-pulse">TikTok sedang memproses...</span>;
      case 'published': return <span className="badge bg-success/20 text-success">Berhasil dipublikasikan!</span>;
      case 'failed': return <span className="badge bg-danger/20 text-danger">Gagal</span>;
      default: return null;
    }
  };

  return (
    <Modal open={true} onClose={onClose} title="Eksekusi Posting" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Header info */}
        <div className="flex items-center justify-between p-4 bg-card-hover rounded-lg">
          <div>
            <p className="font-semibold">@{task.tiktokAccount?.username}</p>
            <p className="text-sm text-muted">{content?.briefTopic}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary">{formatTime(task.scheduledAt)}</p>
            <StatusBadge status={task.status} />
          </div>
        </div>

        {/* Mode Toggle */}
        {!isDone && (
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setMode('browser')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 border-r border-border ${
                mode === 'browser' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-white'
              }`}
            >
              <Globe className="w-4 h-4" /> Upload Browser
            </button>
            <button
              onClick={() => setMode('auto')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 border-r border-border ${
                mode === 'auto' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4" /> Upload API
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                mode === 'manual' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-white'
              }`}
            >
              <ExternalLink className="w-4 h-4" /> Manual
            </button>
          </div>
        )}

        {/* === BROWSER UPLOAD MODE === */}
        {mode === 'browser' && !isDone && (
          <div className="space-y-4">
            {!isBrowserLoggedIn && (
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning">Akun Belum Login via Browser</p>
                  <p className="text-xs text-muted mt-1">
                    Login akun @{task.tiktokAccount?.username} di halaman Akun TikTok menggunakan Password atau Cookies terlebih dahulu.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Video (Google Drive)</label>
                <div className="p-3 bg-card-hover rounded-lg text-sm flex items-center justify-between">
                  <span className="truncate flex-1">{content?.driveUrl || 'Tidak ada URL'}</span>
                  <a href={content?.driveUrl} target="_blank" className="text-primary hover:underline ml-2 text-xs shrink-0">Buka</a>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Caption + Hashtags</label>
                <div className="p-3 bg-card-hover rounded-lg text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {caption}{hashtags ? `\n\n${hashtags}` : ''}
                </div>
              </div>
            </div>

            <div className="p-3 bg-card-hover rounded-lg text-xs text-muted space-y-1">
              <p className="font-medium text-white">Cara kerja Upload Browser:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Download video dari Google Drive</li>
                <li>Buka browser (Puppeteer) dengan sesi login akun TikTok</li>
                <li>Upload video + isi caption secara otomatis</li>
                <li>Klik tombol Post</li>
              </ol>
            </div>

            {uploadStatus !== 'idle' && (
              <div className="flex items-center gap-3 p-3 bg-card-hover rounded-lg">
                {isUploading && <RefreshCw className="w-4 h-4 text-primary animate-spin" />}
                {getUploadStatusBadge()}
              </div>
            )}

            {uploadError && (
              <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{uploadError}</div>
            )}

            {uploadStatus === 'idle' && (
              <button
                onClick={() => browserUploadMutation.mutate()}
                disabled={!isBrowserLoggedIn || browserUploadMutation.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Globe className="w-4 h-4" /> Upload via Browser (Puppeteer)
              </button>
            )}

            {uploadStatus === 'failed' && (
              <button onClick={() => { setUploadStatus('idle'); setUploadError(''); }} 
                className="btn-warning w-full flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Coba Lagi
              </button>
            )}

            {uploadStatus === 'published' && (
              <div className="p-4 bg-success/10 border border-success/30 rounded-lg text-center">
                <CheckCircle className="w-6 h-6 text-success mx-auto mb-2" />
                <p className="text-sm font-medium text-success">Video berhasil diupload via browser!</p>
              </div>
            )}
          </div>
        )}

        {/* === AUTO UPLOAD MODE === */}
        {mode === 'auto' && !isDone && (
          <div className="space-y-4">
            {!isConnected && (
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning">Akun TikTok Belum Terhubung</p>
                  <p className="text-xs text-muted mt-1">
                    Hubungkan akun @{task.tiktokAccount?.username} ke TikTok API di halaman Akun TikTok terlebih dahulu.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Video (Google Drive)</label>
                <div className="p-3 bg-card-hover rounded-lg text-sm flex items-center justify-between">
                  <span className="truncate flex-1">{content?.driveUrl || 'Tidak ada URL'}</span>
                  <a href={content?.driveUrl} target="_blank" className="text-primary hover:underline ml-2 text-xs shrink-0">Buka</a>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Caption + Hashtags</label>
                <div className="p-3 bg-card-hover rounded-lg text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {caption}{hashtags ? `\n\n${hashtags}` : ''}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Privasi</label>
                <select className="input-field" value={privacyLevel} onChange={(e) => setPrivacyLevel(e.target.value)} disabled={isUploading}>
                  <option value="SELF_ONLY">Hanya Saya</option>
                  <option value="MUTUAL_FOLLOW_FRIENDS">Teman</option>
                  <option value="FOLLOWER_OF_CREATOR">Pengikut</option>
                  <option value="PUBLIC_TO_EVERYONE">Publik</option>
                </select>
              </div>
            </div>

            {uploadStatus !== 'idle' && (
              <div className="flex items-center gap-3 p-3 bg-card-hover rounded-lg">
                {isUploading && <RefreshCw className="w-4 h-4 text-primary animate-spin" />}
                {getUploadStatusBadge()}
              </div>
            )}

            {uploadError && (
              <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{uploadError}</div>
            )}

            {uploadStatus === 'idle' && (
              <button
                onClick={() => directUploadMutation.mutate()}
                disabled={!isConnected || directUploadMutation.isPending}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Upload className="w-4 h-4" /> Upload Langsung ke TikTok
              </button>
            )}

            {uploadStatus === 'failed' && (
              <button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}
                className="btn-warning w-full flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Coba Lagi
              </button>
            )}

            {uploadStatus === 'published' && (
              <div className="p-4 bg-success/10 border border-success/30 rounded-lg text-center">
                <CheckCircle className="w-6 h-6 text-success mx-auto mb-2" />
                <p className="text-sm font-medium text-success">Video berhasil diupload ke TikTok!</p>
              </div>
            )}
          </div>
        )}

        {/* === MANUAL MODE === */}
        {mode === 'manual' && !isDone && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-2">1. Download Video</label>
              <a href={content?.driveUrl} target="_blank" onClick={() => setChecklist({ ...checklist, downloadedVideo: true })}
                className="btn-secondary flex items-center gap-2 w-full justify-center">
                <ExternalLink className="w-4 h-4" /> Buka Google Drive
              </a>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">2. Salin Caption</label>
              <div className="p-3 bg-card-hover rounded-lg text-sm whitespace-pre-wrap mb-2 max-h-36 overflow-y-auto">
                {caption || <span className="text-muted">Belum ada caption</span>}
              </div>
              <button onClick={handleCopyCaption} className="btn-secondary flex items-center gap-2 text-sm" disabled={!caption}>
                {copiedCaption ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                {copiedCaption ? 'Tersalin!' : 'Salin Caption'}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">3. Salin Hashtags</label>
              <div className="p-3 bg-card-hover rounded-lg text-sm text-primary mb-2">
                {hashtags || <span className="text-muted">Belum ada hashtags</span>}
              </div>
              <button onClick={handleCopyHashtags} className="btn-secondary flex items-center gap-2 text-sm" disabled={!hashtags}>
                {copiedHashtags ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                {copiedHashtags ? 'Tersalin!' : 'Salin Hashtags'}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">4. Buka TikTok & Upload</label>
              <button onClick={() => { setChecklist({ ...checklist, openedTiktok: true }); window.open('https://www.tiktok.com/upload', '_blank'); }}
                className="btn-secondary flex items-center gap-2 w-full justify-center text-sm">
                <ExternalLink className="w-4 h-4" /> Buka TikTok Upload
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">5. Checklist</label>
              <div className="space-y-2">
                {[{ key: 'downloadedVideo', label: 'Video sudah didownload' }, { key: 'copiedCaption', label: 'Caption sudah disalin' },
                  { key: 'copiedHashtags', label: 'Hashtags sudah disalin' }, { key: 'openedTiktok', label: 'TikTok sudah dibuka' },
                  { key: 'postedVideo', label: 'Video sudah diposting' }].map((item) => (
                  <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={checklist[item.key as keyof typeof checklist]}
                      onChange={(e) => setChecklist({ ...checklist, [item.key]: e.target.checked })}
                      className="w-4 h-4 rounded border-border bg-card text-primary focus:ring-primary" />
                    <span className="text-sm">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-2">6. URL TikTok Post</label>
              <input className="input-field mb-3" value={tiktokUrl} onChange={(e) => setTiktokUrl(e.target.value)}
                placeholder="https://www.tiktok.com/@username/video/..." required />
              {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3 mb-3">{error}</div>}
              <button onClick={() => markDoneMutation.mutate()} disabled={!allChecked || !tiktokUrl || markDoneMutation.isPending}
                className="btn-success w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <CheckCircle className="w-4 h-4" /> {markDoneMutation.isPending ? 'Memproses...' : 'Tandai Selesai'}
              </button>
            </div>
          </div>
        )}

        {isDone && task.tiktokUrl && (
          <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
            <p className="text-sm font-medium text-success mb-1">Posting selesai!</p>
            <a href={task.tiktokUrl} target="_blank" className="text-sm text-primary hover:underline">{task.tiktokUrl}</a>
          </div>
        )}

        {isDone && task.uploadStatus === 'published' && !task.tiktokUrl && (
          <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
            <p className="text-sm font-medium text-success mb-1">Video berhasil diupload via API!</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
