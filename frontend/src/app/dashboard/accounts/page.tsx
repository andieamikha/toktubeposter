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
import type { ApiResponse, TikTokAccount, User, NicheType } from '@/types';
import { Plus, Pencil, Trash2, Link, Unlink, CheckCircle, XCircle, Globe, LogOut, Key, Cookie } from 'lucide-react';

export default function AccountsPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TikTokAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TikTokAccount | null>(null);
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [loginTarget, setLoginTarget] = useState<TikTokAccount | null>(null);

  // Handle OAuth callback result from URL params
  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (oauth === 'success') {
      setOauthMessage('TikTok berhasil terhubung!');
      qc.invalidateQueries({ queryKey: ['accounts'] });
    } else if (oauth === 'error') {
      setOauthMessage(`Gagal menghubungkan TikTok: ${searchParams.get('message') || 'Unknown error'}`);
    }
    if (oauth) {
      setTimeout(() => setOauthMessage(null), 5000);
    }
  }, [searchParams, qc]);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<TikTokAccount[]>>('/tiktok-accounts');
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
    mutationFn: (id: string) => api.delete(`/tiktok-accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setDeleteTarget(null);
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<ApiResponse<{ auth_url: string }>>(`/tiktok-accounts/${id}/connect`);
      return data.data.auth_url;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
    onError: (err: any) => {
      const errData = err.response?.data;
      // Backend wraps in { success, data } — error may be in data.message or direct message
      const msg = errData?.data?.message || errData?.message || err.message || 'Gagal menghubungkan TikTok';
      const code = errData?.data?.code || errData?.code || '';
      if (code === 'TIKTOK_API_NOT_CONFIGURED') {
        setOauthMessage('TikTok OAuth API belum dikonfigurasi. Isi TIKTOK_CLIENT_KEY dan TIKTOK_CLIENT_SECRET di file backend/.env terlebih dahulu.');
      } else {
        setOauthMessage(msg);
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tiktok-accounts/${id}/disconnect`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setOauthMessage('TikTok berhasil diputuskan.');
      setTimeout(() => setOauthMessage(null), 3000);
    },
  });

  const browserLogoutMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tiktok-browser/${id}/logout`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setOauthMessage('Browser login berhasil dihapus.');
      setTimeout(() => setOauthMessage(null), 3000);
    },
  });

  const columns = [
    { key: 'username', label: 'Username', render: (a: TikTokAccount) => <span className="font-medium">@{a.username}</span> },
    { key: 'displayName', label: 'Nama Display' },
    { key: 'niche', label: 'Niche', render: (a: TikTokAccount) => <span className="badge bg-primary/10 text-primary capitalize">{a.niche}</span> },
    {
      key: 'defaultOperator',
      label: 'Operator',
      render: (a: TikTokAccount) => a.defaultOperator?.fullName || <span className="text-muted">—</span>,
    },
    {
      key: 'browserLogin',
      label: 'Browser Login',
      render: (a: TikTokAccount) => a.isBrowserLoggedIn ? (
        <span className="badge bg-success/20 text-success flex items-center gap-1 w-fit">
          <Globe className="w-3 h-3" /> Logged In
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
      key: 'tiktokApi',
      label: 'OAuth API',
      render: (a: TikTokAccount) => a.isOauthConnected ? (
        <span className="badge bg-success/20 text-success flex items-center gap-1 w-fit">
          <CheckCircle className="w-3 h-3" /> Terhubung
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
      render: (a: TikTokAccount) => (
        <div className="flex items-center justify-end gap-1">
          {/* Browser login/logout */}
          {a.isBrowserLoggedIn ? (
            <button
              onClick={(e) => { e.stopPropagation(); browserLogoutMutation.mutate(a.id); }}
              className="p-1.5 text-warning hover:text-danger transition-colors" title="Logout Browser"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setLoginTarget(a); }}
              className="p-1.5 text-muted hover:text-success transition-colors" title="Login Browser (Password/Cookies)"
            >
              <Globe className="w-4 h-4" />
            </button>
          )}
          {/* OAuth connect/disconnect */}
          {a.isOauthConnected ? (
            <button
              onClick={(e) => { e.stopPropagation(); disconnectMutation.mutate(a.id); }}
              className="p-1.5 text-warning hover:text-danger transition-colors" title="Putuskan OAuth API"
            >
              <Unlink className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); connectMutation.mutate(a.id); }}
              className="p-1.5 text-muted hover:text-primary transition-colors" title="Hubungkan OAuth API"
              disabled={connectMutation.isPending}
            >
              <Link className="w-4 h-4" />
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
        title="Akun TikTok"
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
        {oauthMessage && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            oauthMessage.includes('berhasil') ? 'bg-success/10 border border-success/30 text-success' : 'bg-danger/10 border border-danger/30 text-danger'
          }`}>
            {oauthMessage}
          </div>
        )}
        {isLoading ? (
          <PageLoading />
        ) : !accounts?.length ? (
          <EmptyState message="Belum ada akun TikTok" />
        ) : (
          <div className="card p-0 overflow-hidden">
            <DataTable columns={columns} data={accounts} keyExtractor={(a) => a.id} />
          </div>
        )}
      </div>

      <AccountFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        account={editing}
        operators={operators || []}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Akun"
        message={`Yakin ingin menghapus @${deleteTarget?.username}?`}
        confirmText="Hapus"
        loading={deleteMutation.isPending}
      />

      {loginTarget && (
        <BrowserLoginModal
          account={loginTarget}
          onClose={() => {
            setLoginTarget(null);
            qc.invalidateQueries({ queryKey: ['accounts'] });
          }}
          onMessage={(msg) => { setOauthMessage(msg); setTimeout(() => setOauthMessage(null), 5000); }}
        />
      )}
    </>
  );
}

function AccountFormModal({
  open,
  onClose,
  account,
  operators,
}: {
  open: boolean;
  onClose: () => void;
  account: TikTokAccount | null;
  operators: User[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    niche: 'bisnis' as NicheType,
    defaultOperatorId: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens
  const isEdit = !!account;
  useState(() => {
    if (account) {
      setForm({
        username: account.username,
        displayName: account.displayName,
        niche: account.niche,
        defaultOperatorId: account.defaultOperatorId || '',
        isActive: account.isActive,
      });
    } else {
      setForm({ username: '', displayName: '', niche: 'bisnis' as NicheType, defaultOperatorId: '', isActive: true });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        defaultOperatorId: form.defaultOperatorId || undefined,
      };
      if (isEdit) {
        await api.patch(`/tiktok-accounts/${account!.id}`, payload);
      } else {
        await api.post('/tiktok-accounts', payload);
      }
      qc.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setLoading(false);
    }
  };

  const niches = ['bisnis', 'kesehatan', 'fitnes', 'edukasi', 'hiburan', 'teknologi', 'kuliner', 'travel', 'fashion', 'keuangan'];

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Akun' : 'Tambah Akun'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Username</label>
          <input
            className="input-field"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="username_tiktok"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Nama Display</label>
          <input
            className="input-field"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="Nama Akun"
            required
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

// ──────────────────────── Browser Login Modal ────────────────────────
function BrowserLoginModal({
  account,
  onClose,
  onMessage,
}: {
  account: TikTokAccount;
  onClose: () => void;
  onMessage: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'credentials' | 'cookies'>('credentials');
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
      const { data } = await api.post(`/tiktok-browser/${account.id}/login-credentials`, { password });
      const res = data.data || data; // handle both wrapped and unwrapped responses
      if (res.success) {
        setResult(res.message || 'Login berhasil!');
        onMessage('Browser login berhasil!');
        setTimeout(() => onClose(), 2000);
      } else {
        setError(res.message || 'Login gagal');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.data?.message || err.response?.data?.message || 'Login gagal';
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
      const { data } = await api.post(`/tiktok-browser/${account.id}/login-cookies`, { cookies });
      const res = data.data || data; // handle both wrapped and unwrapped responses
      if (res.success) {
        setResult(res.message || 'Login berhasil!');
        onMessage('Browser login dengan cookies berhasil!');
        setTimeout(() => onClose(), 2000);
      } else {
        setError(res.message || 'Cookies tidak valid');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.data?.message || err.response?.data?.message || 'Login cookies gagal';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Login Browser — @${account.username}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setMode('credentials')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              mode === 'credentials' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-white'
            }`}
          >
            <Key className="w-4 h-4" /> Username & Password
          </button>
          <button
            onClick={() => setMode('cookies')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              mode === 'cookies' ? 'bg-primary/10 text-primary' : 'text-muted hover:text-white'
            }`}
          >
            <Cookie className="w-4 h-4" /> Cookies
          </button>
        </div>

        {/* Credentials mode */}
        {mode === 'credentials' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Username TikTok</label>
              <div className="input-field bg-card-hover cursor-not-allowed">@{account.username}</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Password TikTok</label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password akun TikTok..."
              />
            </div>
            <p className="text-xs text-muted">
              Puppeteer akan membuka browser (headless) dan login ke TikTok menggunakan email/username dan password.
              Jika ada CAPTCHA, gunakan metode Cookies sebagai alternatif.
            </p>
          </div>
        )}

        {/* Cookies mode */}
        {mode === 'cookies' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Cookies (JSON Array)</label>
              <textarea
                className="input-field font-mono text-xs"
                rows={6}
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
                placeholder='[{"name": "sessionid", "value": "xxx", "domain": ".tiktok.com"}, ...]'
              />
            </div>
            <div className="p-3 bg-card-hover rounded-lg text-xs text-muted space-y-1">
              <p className="font-medium text-white">Cara mendapatkan cookies:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Login ke TikTok di browser biasa</li>
                <li>Buka DevTools (F12) → tab Application → Cookies</li>
                <li>Atau gunakan extension &quot;EditThisCookie&quot; / &quot;Cookie-Editor&quot;</li>
                <li>Export semua cookies sebagai JSON array</li>
                <li>Paste di atas</li>
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
            disabled={loading || (mode === 'credentials' ? !password : !cookies)}
          >
            <Globe className="w-4 h-4" />
            {loading ? 'Memproses...' : 'Login'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
