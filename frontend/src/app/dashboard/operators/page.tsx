'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { DataTable } from '@/components/ui/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageLoading, EmptyState } from '@/components/ui/loading';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { ApiResponse, User, UserRole } from '@/types';
import { Plus, Pencil, Trash2, MessageCircle } from 'lucide-react';

export default function OperatorsPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [modalKey, setModalKey] = useState(0);

  const { data: users, isLoading } = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users');
      return data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operators'] });
      setDeleteTarget(null);
    },
  });

  const columns = [
    { key: 'fullName', label: 'Nama', render: (u: User) => <span className="font-medium">{u.fullName}</span> },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Role',
      render: (u: User) => (
        <span className={`badge ${u.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-info/20 text-info'}`}>
          {u.role === 'admin' ? 'Admin' : 'Operator'}
        </span>
      ),
    },
    {
      key: 'telegram',
      label: 'Telegram',
      render: (u: User) => (
        u.telegramChatId ? (
          <span className="flex items-center gap-1 text-success text-xs">
            <MessageCircle className="w-3 h-3" /> Terhubung
          </span>
        ) : (
          <span className="text-muted text-xs">Belum terhubung</span>
        )
      ),
    },
    { key: 'createdAt', label: 'Terdaftar', render: (u: User) => <span className="text-muted text-xs">{formatDateTime(u.createdAt)}</span> },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      render: (u: User) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(u); setModalKey(k => k + 1); setModalOpen(true); }}
            className="p-1.5 text-muted hover:text-white transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }}
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
        title="Operator"
        subtitle={`${users?.length ?? 0} pengguna`}
        actions={
          <button onClick={() => { setEditing(null); setModalKey(k => k + 1); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tambah Operator
          </button>
        }
      />
      <div className="p-6">
        {isLoading ? (
          <PageLoading />
        ) : !users?.length ? (
          <EmptyState message="Belum ada operator" />
        ) : (
          <div className="card p-0 overflow-hidden">
            <DataTable columns={columns} data={users} keyExtractor={(u) => u.id} />
          </div>
        )}
      </div>

      <OperatorFormModal key={modalKey} open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} user={editing} />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Hapus Pengguna"
        message={`Yakin ingin menghapus ${deleteTarget?.fullName}?`}
        confirmText="Hapus"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

function OperatorFormModal({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    password: '',
    role: (user?.role || 'operator') as UserRole,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: form.fullName,
        email: form.email,
        role: form.role,
      };
      if (form.password) payload.password = form.password;

      if (isEdit) {
        await api.patch(`/users/${user!.id}`, payload);
      } else {
        await api.post('/users', payload);
      }
      qc.invalidateQueries({ queryKey: ['operators'] });
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Pengguna' : 'Tambah Pengguna'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Nama Lengkap</label>
          <input className="input-field" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Email</label>
          <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">
            Password {isEdit && <span className="text-xs text-muted">(kosongkan jika tidak diubah)</span>}
          </label>
          <input
            type="password"
            className="input-field"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!isEdit}
            minLength={8}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-1">Role</label>
          <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
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
