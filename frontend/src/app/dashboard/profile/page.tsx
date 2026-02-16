'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { ApiResponse, User } from '@/types';
import { User as UserIcon, MessageCircle, Link, RefreshCw, Save } from 'lucide-react';

export default function ProfilePage() {
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState('');

  // Fetch latest user data from API and update store
  useQuery({
    queryKey: ['profile-me'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User>>('/users/me');
      const user = data.data;
      if (user) setUser(user);
      return user;
    },
    refetchInterval: 5000, // refresh every 5s to catch telegram link status
  });

  // Telegram link code
  const telegramCodeMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse<{ code: string; expires_in: number; instruction: string }>>(
        '/users/me/telegram-link',
      );
      const d = data.data;
      return {
        linkCode: d.code,
        expiresAt: new Date(Date.now() + d.expires_in * 1000).toISOString(),
      };
    },
  });

  // Change password
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/users/${authUser?.id}`, { password: passwordForm.newPassword });
    },
    onSuccess: () => {
      setPwMsg('Password berhasil diubah');
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setTimeout(() => setPwMsg(''), 3000);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setPwMsg(axiosErr.response?.data?.message || 'Gagal mengubah password');
    },
  });

  if (!authUser) return <PageLoading />;

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'YourBot';

  return (
    <>
      <Header title="Profil" subtitle="Pengaturan akun" />

      <div className="p-6 space-y-6 max-w-2xl">
        {/* User Info */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <UserIcon className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Informasi Akun</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted">Nama</p>
              <p className="font-medium">{authUser.fullName}</p>
            </div>
            <div>
              <p className="text-muted">Email</p>
              <p className="font-medium">{authUser.email}</p>
            </div>
            <div>
              <p className="text-muted">Role</p>
              <p className="font-medium capitalize">{authUser.role}</p>
            </div>
            <div>
              <p className="text-muted">Telegram</p>
              <p className={`font-medium ${authUser.telegramChatId ? 'text-success' : 'text-warning'}`}>
                {authUser.telegramChatId ? 'Terhubung' : 'Belum terhubung'}
              </p>
            </div>
          </div>
        </div>

        {/* Telegram Linking */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <MessageCircle className="w-5 h-5 text-info" />
            <h3 className="font-semibold">Hubungkan Telegram</h3>
          </div>
          <p className="text-sm text-muted">
            Hubungkan akun Telegram untuk menerima notifikasi tugas posting.
          </p>

          {telegramCodeMutation.data ? (
            <div className="space-y-3">
              <div className="p-4 bg-card-hover rounded-lg text-center">
                <p className="text-sm text-muted mb-1">Kirim perintah ini ke bot:</p>
                <p className="text-lg font-mono font-bold text-primary">
                  /start {telegramCodeMutation.data.linkCode}
                </p>
              </div>
              <a
                href={`https://t.me/${botUsername}?start=${telegramCodeMutation.data.linkCode}`}
                target="_blank"
                className="btn-primary flex items-center justify-center gap-2 w-full"
              >
                <Link className="w-4 h-4" /> Buka Bot Telegram
              </a>
              <p className="text-xs text-muted text-center">
                Kode berlaku hingga {new Date(telegramCodeMutation.data.expiresAt).toLocaleTimeString('id-ID')}
              </p>
            </div>
          ) : (
            <button
              onClick={() => telegramCodeMutation.mutate()}
              disabled={telegramCodeMutation.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              {telegramCodeMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
              Generate Kode Link
            </button>
          )}
        </div>

        {/* Change Password */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Save className="w-5 h-5 text-warning" />
            <h3 className="font-semibold">Ubah Password</h3>
          </div>

          {pwMsg && (
            <div className={`text-sm rounded-lg px-4 py-3 ${
              pwMsg.includes('berhasil')
                ? 'bg-success/10 border border-success/30 text-success'
                : 'bg-danger/10 border border-danger/30 text-danger'
            }`}>
              {pwMsg}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Password Baru</label>
              <input
                type="password"
                className="input-field"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Min 8 karakter"
                minLength={8}
              />
            </div>
            <button
              onClick={() => changePasswordMutation.mutate()}
              disabled={!passwordForm.newPassword || passwordForm.newPassword.length < 8 || changePasswordMutation.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {changePasswordMutation.isPending ? 'Menyimpan...' : 'Ubah Password'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
