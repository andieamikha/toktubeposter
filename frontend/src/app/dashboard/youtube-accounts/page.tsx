'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageLoading, EmptyState } from '@/components/ui/loading';
import api from '@/lib/api';
import type { ApiResponse, YouTubeAccount, User, NicheType } from '@/types';
import { Plus, Pencil, Trash2, Globe, LogOut, Key, Cookie, CheckCircle, XCircle, Link2, Unlink } from 'lucide-react';

export default function YouTubeAccountsPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<YouTubeAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<YouTubeAccount | null>(null);
  const [loginTarget, setLoginTarget] = useState<YouTubeAccount | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [connectingApiId, setConnectingApiId] = useState<string | null>(null);

  // Handle OAuth callback result from URL params
  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (oauth === 'success') {
      setMessage('YouTube API berhasil terhubung!');
      qc.invalidateQueries({ queryKey: ['youtube-accounts'] });
    } else if (oauth === 'error') {
      setMessage(`Gagal menghubungkan YouTube API: ${searchParams.get('message') || 'Unknown error'}`);
    }
    if (oauth) {
      setTimeout(() => setMessage(null), 5000);
    }
  }, [searchParams, qc]);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['youtube-accounts'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<YouTubeAccount[]>>('/youtube-accounts');
      return data.data;
    },
  });

  const { data: operators } = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users');
      return data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/youtube-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['youtube-accounts'] });
      setDeleteTarget(null);
    },
  });

  const browserLogoutMutation = useMutation({
    mutationFn: (id: string) => api.post(`/youtube-browser/${id}/logout`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['youtube-accounts'] });
      setMessage('Browser login YouTube berhasil dihapus.');
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const apiDisconnectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/youtube-accounts/${id}/api/disconnect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['youtube-accounts'] });
      setMessage('YouTube API berhasil diputuskan.');
      setTimeout(() => setMessage(null), 3000);
    },
  });

  const handleConnectApi = async (accountId: string) => {
    setConnectingApiId(accountId);
    try {
      const { data } = await api.get(`/youtube-accounts/${accountId}/api/auth-url`);
      const authUrl = data.data?.url || data.url;
      if (authUrl) {
        window.location.href = authUrl;
      } else {
        setMessage('Gagal mendapatkan URL OAuth. Pastikan YOUTUBE_CLIENT_ID dan YOUTUBE_CLIENT_SECRET sudah dikonfigurasi.');
        setTimeout(() => setMessage(null), 5000);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || err.response?.data?.message || 'Gagal menghubungkan YouTube API';
      setMessage(errMsg);
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setConnectingApiId(null);
    }
  };

  const columns = [
    {
      key: 'channelName',
      label: 'Channel',
      render: (a: YouTubeAccount) => (
        <div>
          <span className="font-medium">{a.channelName}</span>
          {a.email && <span className="text-xs text-muted ml-2">({a.email})</span>}
        </div>
      ),
    },
    {
      key: 'niche',
      label: 'Niche',
      render: (a: YouTubeAccount) => (
        <span className="badge bg-red-500/10 text-red-400 capitalize">{a.niche}</span>
      ),
    },
    {
      key: 'defaultOperator',
      label: 'Operator',
      render: (a: YouTubeAccount) => a.defaultOperator?.fullName || <span className="text-muted">—</span>,
    },
    {
      key: 'browserLogin',
      label: 'Browser Login',
      render: (a: YouTubeAccount) =>
        a.isBrowserLoggedIn ? (
          <span className="badge bg-success/20 text-success flex items-center gap-1 w-fit">
            <CheckCircle className="w-3 h-3" /> Logged In
          </span>
        ) : a.loginMethod !== 'none' ? (
          <span className="badge bg-warning/20 text-warning flex items-center gap-1 w-fit">
            {a.loginMethod === 'credentials' ? <Key className="w-3 h-3" /> : <Cookie className="w-3 h-3" />}
            {a.loginMethod === 'credentials' ? 'Password' : 'Cookies'}
          </span>
        ) : (
          <span className="badge bg-muted/20 text-muted flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" /> Belum
          </span>
        ),
    },
    {
      key: 'apiStatus',
      label: 'YouTube API',
      render: (a: YouTubeAccount) =>
        a.isApiConnected ? (
          <span className="badge bg-success/20 text-success flex items-center gap-1 w-fit">
            <Link2 className="w-3 h-3" /> Terhubung
          </span>
        ) : (
          <span className="badge bg-muted/20 text-muted flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" /> Belum
          </span>
        ),
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      render: (a: YouTubeAccount) => (
        <div className="flex items-center justify-end gap-1">
          {/* API Connect / Disconnect */}
          {a.isApiConnected ? (
            <button
              onClick={(e) => { e.stopPropagation(); apiDisconnectMutation.mutate(a.id); }}
              className="p-1.5 text-warning hover:text-danger transition-colors"
              title="Putuskan YouTube API"
            >
              <Unlink className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleConnectApi(a.id); }}
              className="p-1.5 text-muted hover:text-success transition-colors"
              title="Hubungkan YouTube API"
              disabled={connectingApiId === a.id}
            >
              <Link2 className="w-4 h-4" />
            </button>
          )}
          {/* Browser Login / Logout */}
          {a.isBrowserLoggedIn ? (
            <button
              onClick={(e) => { e.stopPropagation(); browserLogoutMutation.mutate(a.id); }}
              className="p-1.5 text-warning hover:text-danger transition-colors"
              title="Logout Browser"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setLoginTarget(a); }}
              className="p-1.5 text-muted hover:text-success transition-colors"
              title="Login Browser"
            >
              <Globe className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(a); setModalOpen(true); }}
            className="p-1.5 text-muted hover:text-white transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
            className="p-1.5 text-muted hover:text-danger transition-colors"
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
        title="Akun YouTube"
        subtitle={`${accounts?.length ?? 0} akun terdaftar`}
        actions={
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Tambah Akun
          </button>
        }
      />
      <div className="p-6">
        {message && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            message.includes('berhasil')
              ? 'bg-success/10 border border-success/30 text-success'
              : 'bg-danger/10 border border-danger/30 text-danger'
          }`}>
            {message}
          </div>
        )}
        {isLoading ? (
          <PageLoading />
        ) : !accounts?.length ? (
          <EmptyState message="Belum ada akun YouTube" />
        ) : (
          <div className="card p-0 overflow-hidden">
            <DataTable columns={columns} data={accounts} keyExtractor={(a) => a.id} />
          </div>
        )}
      </div>

      <YTAccountFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        account={editing}
        operators={operators || []}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Akun YouTube"
        message={`Yakin ingin menghapus ${deleteTarget?.channelName}?`}
        confirmText="Hapus"
        loading={deleteMutation.isPending}
      />

      {loginTarget && (
        <YTBrowserLoginModal
          account={loginTarget}
          onClose={() => {
            setLoginTarget(null);
            qc.invalidateQueries({ queryKey: ['youtube-accounts'] });
          }}
          onMessage={(msg) => { setMessage(msg); setTimeout(() => setMessage(null), 5000); }}
        />
      )}
    </>
  );
}

/* ─── YouTube Account Form Modal ─── */
function YTAccountFormModal({
  open,
  onClose,
  account,
  operators,
}: {
  open: boolean;
  onClose: () => void;
  account: YouTubeAccount | null;
  operators: User[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    channelName: '',
    channelUrl: '',
    email: '',
    niche: 'bisnis' as NicheType,
    defaultOperatorId: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!account;
  useState(() => {
    if (account) {
      setForm({
        channelName: account.channelName,
        channelUrl: account.channelUrl || '',
        email: account.email || '',
        niche: account.niche,
        defaultOperatorId: account.defaultOperatorId || '',
        isActive: account.isActive,
      });
    } else {
      setForm({ channelName: '', channelUrl: '', email: '', niche: 'bisnis' as NicheType, defaultOperatorId: '', isActive: true });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        channel_name: form.channelName,
        channel_url: form.channelUrl || undefined,
        email: form.email || undefined,
        niche: form.niche,
        default_operator_id: form.defaultOperatorId || undefined,
      };
      if (isEdit) {
        await api.patch(`/youtube-accounts/${account!.id}`, payload);
      } else {
        await api.post('/youtube-accounts', payload);
      }
      qc.invalidateQueries({ queryKey: ['youtube-accounts'] });
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
      setError(axiosErr.response?.data?.error?.message || axiosErr.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setLoading(false);
    }
  };

  const niches = ['bisnis', 'kesehatan', 'fitnes', 'edukasi', 'hiburan', 'teknologi', 'kuliner', 'travel', 'fashion', 'keuangan'];

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Akun YouTube' : 'Tambah Akun YouTube'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Nama Channel</label>
          <input
            className="input-field"
            value={form.channelName}
            onChange={(e) => setForm({ ...form, channelName: e.target.value })}
            placeholder="Nama channel YouTube"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">URL Channel (opsional)</label>
          <input
            className="input-field"
            value={form.channelUrl}
            onChange={(e) => setForm({ ...form, channelUrl: e.target.value })}
            placeholder="https://www.youtube.com/@channel"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Email Google</label>
          <input
            className="input-field"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="email@gmail.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Niche</label>
          <select
            className="input-field"
            value={form.niche}
            onChange={(e) => setForm({ ...form, niche: e.target.value as NicheType })}
          >
            {niches.map((n) => (
              <option key={n} value={n}>{n.charAt(0).toUpperCase() + n.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Operator Default</label>
          <select
            className="input-field"
            value={form.defaultOperatorId}
            onChange={(e) => setForm({ ...form, defaultOperatorId: e.target.value })}
          >
            <option value="">— Tidak ada —</option>
            {operators.map((op) => (
              <option key={op.id} value={op.id}>{op.fullName}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="w-4 h-4 rounded border-border bg-card text-primary focus:ring-primary"
          />
          <span className="text-sm">Aktif</span>
        </label>

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

/* ─── YouTube Browser Login Modal ─── */
function YTBrowserLoginModal({
  account,
  onClose,
  onMessage,
}: {
  account: YouTubeAccount;
  onClose: () => void;
  onMessage: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'credentials' | 'cookies'>('credentials');
  const [email, setEmail] = useState(account.email || '');
  const [password, setPassword] = useState('');
  const [cookies, setCookies] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const handleLoginCredentials = async () => {
    setError('');
    setResult('');
    setLoading(true);
    try {
      const { data } = await api.post(`/youtube-browser/${account.id}/login-credentials`, { email, password });
      const res = data.data || data;
      if (res.success) {
        setResult(res.message || 'Login berhasil!');
        onMessage('Browser login YouTube berhasil!');
        setTimeout(() => onClose(), 2000);
      } else {
        setError(res.message || 'Login gagal');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.data?.message || err.response?.data?.error?.message || err.response?.data?.message || 'Login gagal';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginCookies = async () => {
    setError('');
    setResult('');
    setLoading(true);
    try {
      const { data } = await api.post(`/youtube-browser/${account.id}/login-cookies`, { cookies });
      const res = data.data || data;
      if (res.success) {
        setResult(res.message || 'Login berhasil!');
        onMessage('Browser login YouTube dengan cookies berhasil!');
        setTimeout(() => onClose(), 2000);
      } else {
        setError(res.message || 'Cookies tidak valid');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.data?.message || err.response?.data?.error?.message || err.response?.data?.message || 'Login cookies gagal';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Login Browser — ${account.channelName}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setMode('credentials')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              mode === 'credentials' ? 'bg-red-500/10 text-red-400' : 'text-muted hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" /> Email & Password
          </button>
          <button
            onClick={() => setMode('cookies')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              mode === 'cookies' ? 'bg-red-500/10 text-red-400' : 'text-muted hover:text-white'
            }`}
          >
            <Cookie className="w-4 h-4" /> Cookies
          </button>
        </div>

        {mode === 'credentials' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Email Google</label>
              <input
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@gmail.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Password Google</label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password Google..."
              />
            </div>
            <p className="text-xs text-muted">
              Puppeteer akan membuka browser dan login ke Google/YouTube.
              Jika ada 2FA atau CAPTCHA, gunakan metode Cookies sebagai alternatif.
            </p>
          </div>
        )}

        {mode === 'cookies' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Cookies (JSON Array)</label>
              <textarea
                className="input-field font-mono text-xs"
                rows={6}
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
                placeholder='[{"name": "SID", "value": "xxx", "domain": ".google.com"}, ...]'
              />
            </div>
            <div className="p-3 bg-card-hover rounded-lg text-xs text-muted space-y-1">
              <p className="font-medium text-white">Cara mendapatkan cookies:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Login ke YouTube Studio di browser biasa</li>
                <li>Buka DevTools (F12) → tab Application → Cookies</li>
                <li>Atau gunakan extension &quot;Cookie-Editor&quot;</li>
                <li>Export semua cookies domain .youtube.com dan .google.com</li>
                <li>Paste di atas sebagai JSON array</li>
              </ol>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {result && (
          <div className="bg-success/10 border border-success/30 text-success text-sm rounded-lg px-4 py-3">{result}</div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button
            onClick={mode === 'credentials' ? handleLoginCredentials : handleLoginCookies}
            className="btn-primary flex items-center gap-2"
            disabled={loading || (mode === 'credentials' ? (!email || !password) : !cookies)}
          >
            <Globe className="w-4 h-4" />
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
