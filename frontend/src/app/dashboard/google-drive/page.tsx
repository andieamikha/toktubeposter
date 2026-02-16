'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { PageLoading, EmptyState } from '@/components/ui/loading';
import api from '@/lib/api';
import type { ApiResponse } from '@/types';
import { FolderOpen, Film, FileText, ExternalLink, Copy, Check, Upload, Trash2, HardDrive, Cloud, X, ChevronRight, ArrowLeft, Home, Plus, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import type { TikTokAccount, NicheType } from '@/types';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailLink?: string;
  modifiedTime: string;
  webViewLink?: string;
}

interface UploadedFile {
  id: string;
  name: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
  url: string;
}

type TabType = 'upload' | 'gdrive';

export default function GoogleDrivePage() {
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const queryClient = useQueryClient();

  return (
    <>
      <Header
        title="Video Manager"
        subtitle="Upload video atau browse dari Google Drive"
      />
      <div className="p-6 space-y-6">
        {/* Tab Switcher */}
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'upload'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card-hover'
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Langsung
          </button>
          <button
            onClick={() => setActiveTab('gdrive')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'gdrive'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card-hover'
            }`}
          >
            <Cloud className="w-4 h-4" />
            Google Drive
          </button>
        </div>

        {activeTab === 'upload' ? (
          <DirectUploadTab queryClient={queryClient} />
        ) : (
          <GoogleDriveTab />
        )}
      </div>
    </>
  );
}

// ============================================
// DIRECT UPLOAD TAB
// ============================================
function DirectUploadTab({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch uploaded files
  const { data: uploadedFiles, isLoading } = useQuery({
    queryKey: ['uploaded-files'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<UploadedFile[]>>('/files');
      return (data as any).data || data;
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results: UploadedFile[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const { data } = await api.post('/files/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percent = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            setUploadProgress(prev => ({ ...prev, [file.name]: percent }));
          },
        });
        results.push((data as any).data || data);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploaded-files'] });
      setUploadProgress({});
    },
    onError: () => {
      setUploadProgress({});
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      await api.delete(`/files/${filename}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploaded-files'] });
    },
  });

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const videoFiles = Array.from(fileList).filter(f => f.type.startsWith('video/'));
    if (videoFiles.length === 0) {
      alert('Hanya file video yang diperbolehkan (mp4, mov, avi, dll)');
      return;
    }
    uploadMutation.mutate(videoFiles);
  }, [uploadMutation]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const copyUrl = async (file: UploadedFile) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const files = Array.isArray(uploadedFiles) ? uploadedFiles : [];

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`card border-2 border-dashed cursor-pointer transition-all ${
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50 hover:bg-card-hover'
        } ${uploadMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className={`p-4 rounded-full ${isDragging ? 'bg-primary/10' : 'bg-card-hover'}`}>
            <Upload className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-muted'}`} />
          </div>
          <div className="text-center">
            <p className="font-medium">
              {uploadMutation.isPending ? 'Mengupload...' : 'Drag & drop video di sini'}
            </p>
            <p className="text-sm text-muted mt-1">
              atau klik untuk memilih file (MP4, MOV, AVI, MKV — maks 500MB)
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Upload Progress */}
      {Object.entries(uploadProgress).length > 0 && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-medium">Mengupload...</p>
          {Object.entries(uploadProgress).map(([name, percent]) => (
            <div key={name} className="space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span className="truncate max-w-[250px]">{name}</span>
                <span>{percent}%</span>
              </div>
              <div className="w-full bg-card-hover rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Error */}
      {uploadMutation.isError && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">
          <p>Gagal mengupload: {(uploadMutation.error as any)?.response?.data?.message || (uploadMutation.error as Error).message}</p>
        </div>
      )}

      {/* Uploaded Files List */}
      <div>
        <h3 className="text-sm font-medium text-muted mb-3 flex items-center gap-2">
          <HardDrive className="w-4 h-4" />
          File Video Terupload ({files.length})
        </h3>

        {isLoading && <PageLoading />}

        {!isLoading && files.length === 0 && (
          <EmptyState message="Belum ada file video yang diupload" />
        )}

        {files.length > 0 && (
          <div className="card p-0 divide-y divide-border">
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-4 p-4 hover:bg-card-hover transition-colors">
                <div className="w-12 h-12 bg-card-hover rounded-lg flex items-center justify-center shrink-0">
                  <Film className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{file.originalName}</p>
                  <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
                    <span>{formatSize(file.size)}</span>
                    <span className="font-mono text-[10px] bg-card-hover px-1.5 py-0.5 rounded">{file.url}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyUrl(file)}
                    className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
                    title="Salin URL (untuk Konten)"
                  >
                    {copiedId === file.id ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                    {copiedId === file.id ? 'Tersalin!' : 'Salin URL'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Hapus file ${file.originalName}?`)) {
                        deleteMutation.mutate(file.name);
                      }
                    }}
                    className="p-1.5 text-muted hover:text-danger transition-colors"
                    title="Hapus file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Info */}
      <div className="bg-primary/5 border border-primary/20 text-sm rounded-lg px-4 py-3 space-y-1">
        <p className="font-medium text-primary">Cara menggunakan file yang diupload:</p>
        <ol className="list-decimal list-inside text-muted space-y-0.5 text-xs">
          <li>Upload video di halaman ini</li>
          <li>Klik &quot;Salin URL&quot; untuk mendapatkan URL file (format: local://...)</li>
          <li>Paste URL tersebut di kolom &quot;Drive URL&quot; saat membuat Konten baru</li>
          <li>Sistem akan menggunakan file lokal secara langsung tanpa download dari Google Drive</li>
        </ol>
      </div>
    </div>
  );
}

// ============================================
// GOOGLE DRIVE TAB
// ============================================
function GoogleDriveTab() {
  const STORAGE_KEY = 'gdrive_folder_url';

  const [folderId, setFolderId] = useState('');
  const [searchFolderId, setSearchFolderId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<DriveFile | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Load saved folder from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setFolderId(saved);
      setSearchFolderId(extractFolderId(saved));
    }
  }, []);

  // Folder navigation stack: [{id, name}]
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  // Current browsing folder (top of stack or searchFolderId)
  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : searchFolderId;

  const extractFolderId = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return trimmed;
  };

  const { data: files, isLoading, error } = useQuery({
    queryKey: ['drive-files', currentFolderId],
    queryFn: async () => {
      if (!currentFolderId) return [];
      const { data } = await api.get<ApiResponse<DriveFile[]>>(`/google-drive/files?folderId=${currentFolderId}`);
      return data.data;
    },
    enabled: !!currentFolderId,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractFolderId(folderId);
    setSearchFolderId(id);
    setFolderStack([]); // Reset navigation when searching new root
    // Save to localStorage for next visit
    localStorage.setItem(STORAGE_KEY, folderId.trim());
  };

  const navigateToFolder = (file: DriveFile) => {
    setFolderStack((prev) => [...prev, { id: file.id, name: file.name }]);
  };

  const navigateBack = () => {
    setFolderStack((prev) => prev.slice(0, -1));
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) {
      // Go to root
      setFolderStack([]);
    } else {
      setFolderStack((prev) => prev.slice(0, index + 1));
    }
  };

  const copyDriveUrl = async (file: DriveFile) => {
    const url = file.mimeType.includes('folder')
      ? `https://drive.google.com/drive/folders/${file.id}`
      : `https://drive.google.com/file/d/${file.id}/view`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const formatSize = (bytes: string) => {
    const b = parseInt(bytes);
    if (isNaN(b)) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  const getIcon = (mimeType: string) => {
    if (mimeType.includes('video')) return <Film className="w-5 h-5 text-primary" />;
    if (mimeType.includes('folder')) return <FolderOpen className="w-5 h-5 text-warning" />;
    return <FileText className="w-5 h-5 text-muted" />;
  };

  // Separate folders and files, folders first
  const folders = files?.filter((f) => f.mimeType.includes('folder')) || [];
  const videoFiles = files?.filter((f) => !f.mimeType.includes('folder')) || [];
  const sortedFiles = [...folders, ...videoFiles];

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="card p-4">
        <label className="block text-sm font-medium text-muted mb-2">
          Folder ID Google Drive
        </label>
        <div className="flex gap-3">
          <input
            className="input-field flex-1"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            placeholder="Paste URL atau Folder ID Google Drive..."
          />
          <button type="submit" className="btn-primary" disabled={!folderId.trim()}>
            Browse
          </button>
        </div>
        <p className="text-xs text-muted mt-2">
          Contoh: https://drive.google.com/drive/folders/<strong>FOLDER_ID</strong>?usp=sharing
        </p>
      </form>

      {/* Breadcrumb Navigation */}
      {searchFolderId && (
        <div className="flex items-center gap-1 text-sm flex-wrap">
          {folderStack.length > 0 && (
            <button
              onClick={navigateBack}
              className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors mr-2 px-2 py-1 rounded hover:bg-primary/10"
              title="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs">Kembali</span>
            </button>
          )}
          <button
            onClick={() => navigateToBreadcrumb(-1)}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              folderStack.length === 0
                ? 'text-foreground font-medium'
                : 'text-primary hover:text-primary/80 hover:bg-primary/10 cursor-pointer'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Root</span>
          </button>
          {folderStack.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5 text-muted" />
              <button
                onClick={() => navigateToBreadcrumb(index)}
                className={`px-2 py-1 rounded transition-colors ${
                  index === folderStack.length - 1
                    ? 'text-foreground font-medium'
                    : 'text-primary hover:text-primary/80 hover:bg-primary/10 cursor-pointer'
                }`}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {isLoading && <PageLoading />}

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3 space-y-2">
          <p>{(error as any)?.response?.data?.message || 'Gagal mengakses Google Drive.'}</p>
          {currentFolderId && (
            <p className="text-xs opacity-75">Folder ID: <code className="bg-white/10 px-1 rounded">{currentFolderId}</code></p>
          )}
          <div className="text-xs opacity-75 space-y-1">
            <p className="font-medium">Troubleshooting:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Pastikan <strong>Google Drive API</strong> sudah di-enable di Google Cloud Console</li>
              <li>Pastikan GOOGLE_API_KEY sudah dikonfigurasi di backend</li>
              <li>Folder harus di-share sebagai <strong>&quot;Anyone with the link&quot;</strong></li>
              <li>Verifikasi: buka URL folder di mode Incognito — jika minta login, folder belum publik</li>
            </ol>
          </div>
          <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded text-primary text-xs">
            <strong>Tip:</strong> Jika Google Drive bermasalah, gunakan tab <strong>&quot;Upload Langsung&quot;</strong> untuk upload video dari komputer.
          </div>
        </div>
      )}

      {files && files.length === 0 && currentFolderId && !isLoading && (
        <EmptyState message="Folder kosong atau tidak ada file video" />
      )}

      {sortedFiles.length > 0 && (
        <div className="card p-0 divide-y divide-border">
          {/* Folder count info */}
          <div className="px-4 py-2.5 bg-card-hover/50 text-xs text-muted flex items-center gap-4">
            {folders.length > 0 && (
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3.5 h-3.5 text-warning" />
                {folders.length} folder
              </span>
            )}
            {videoFiles.length > 0 && (
              <span className="flex items-center gap-1">
                <Film className="w-3.5 h-3.5 text-primary" />
                {videoFiles.length} video
              </span>
            )}
          </div>

          {sortedFiles.map((file) => {
            const isFolder = file.mimeType.includes('folder');
            return (
              <div
                key={file.id}
                className={`flex items-center gap-4 p-4 transition-colors ${
                  isFolder ? 'hover:bg-warning/5 cursor-pointer' : 'hover:bg-card-hover'
                }`}
                onClick={isFolder ? () => navigateToFolder(file) : undefined}
              >
                {file.thumbnailLink && !isFolder ? (
                  <img src={file.thumbnailLink} alt="" className="w-16 h-12 object-cover rounded" />
                ) : (
                  <div className={`w-16 h-12 rounded flex items-center justify-center ${
                    isFolder ? 'bg-warning/10' : 'bg-card-hover'
                  }`}>
                    {getIcon(file.mimeType)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${isFolder ? 'text-warning' : ''}`}>
                    {file.name}
                    {isFolder && <ChevronRight className="w-4 h-4 inline ml-1 opacity-50" />}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
                    <span>{isFolder ? 'Folder' : file.mimeType.includes('video') ? 'Video' : 'File'}</span>
                    {!isFolder && <span>{formatSize(file.size)}</span>}
                    <span>{new Date(file.modifiedTime).toLocaleDateString('id-ID')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {!isFolder && (
                    <>
                      <button
                        onClick={() => setAddTarget(file)}
                        className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${
                          addedIds.has(file.id)
                            ? 'bg-success/20 text-success border border-success/30'
                            : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-white'
                        }`}
                        title="Tambah ke Konten"
                        disabled={addedIds.has(file.id)}
                      >
                        {addedIds.has(file.id) ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {addedIds.has(file.id) ? 'Ditambahkan' : 'Tambah'}
                      </button>
                      <button
                        onClick={() => copyDriveUrl(file)}
                        className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
                        title="Salin Drive URL (untuk Konten)"
                      >
                        {copiedId === file.id ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        {copiedId === file.id ? 'Tersalin!' : 'Salin URL'}
                      </button>
                    </>
                  )}
                  {isFolder && (
                    <button
                      onClick={() => navigateToFolder(file)}
                      className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
                      title="Buka folder"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Buka
                    </button>
                  )}
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      className="p-1.5 text-muted hover:text-primary transition-colors"
                      title="Buka di Google Drive"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick-add to content modal */}
      {addTarget && (
        <QuickAddContentModal
          file={addTarget}
          onClose={() => setAddTarget(null)}
          onAdded={(fileId) => {
            setAddedIds((prev) => new Set(prev).add(fileId));
            setAddTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Quick Add Content Modal ─── */
function QuickAddContentModal({
  file,
  onClose,
  onAdded,
}: {
  file: DriveFile;
  onClose: () => void;
  onAdded: (fileId: string) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [niche, setNiche] = useState('kesehatan');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery<any>({
    queryKey: ['tiktok-accounts'],
    queryFn: async () => {
      const { data } = await api.get('/tiktok-accounts');
      return (data as any).data || data;
    },
  });

  const driveUrl = `https://drive.google.com/file/d/${file.id}/view`;
  const topicFromName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');

  const niches = ['bisnis', 'kesehatan', 'fitnes', 'edukasi', 'hiburan', 'teknologi', 'kuliner', 'travel', 'fashion', 'keuangan'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) {
      setError('Pilih akun TikTok terlebih dahulu.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/contents', {
        tiktok_account_id: accountId,
        drive_url: driveUrl,
        brief_topic: topicFromName,
        brief_points: [topicFromName],
        niche_template: niche,
      });
      queryClient.invalidateQueries({ queryKey: ['contents'] });
      onAdded(file.id);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Gagal menambahkan konten.');
    } finally {
      setLoading(false);
    }
  };

  const accountList: TikTokAccount[] = Array.isArray(accounts) ? accounts : [];

  return (
    <Modal open onClose={onClose} title="Tambah ke Konten" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-card-hover rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary shrink-0" />
            <span className="font-medium truncate">{file.name}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Akun TikTok</label>
          <select
            className="input-field"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            <option value="">Pilih akun</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Niche</label>
          <select
            className="input-field"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          >
            {niches.map((n) => (
              <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger">{error}</div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {loading ? 'Menambahkan...' : 'Tambah Konten'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
