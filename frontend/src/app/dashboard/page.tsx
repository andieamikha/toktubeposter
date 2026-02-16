'use client';

import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';
import type { ApiResponse, DashboardStats } from '@/types';
import {
  BarChart3,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  TrendingUp,
} from 'lucide-react';

export default function DashboardPage() {
  const today = new Date().toISOString().split('T')[0];

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', today],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<DashboardStats>>(
        `/dashboard/stats?date=${today}`,
      );
      return data.data;
    },
  });

  if (isLoading) return <PageLoading />;

  const overall = stats?.overall;

  return (
    <>
      <Header title="Dashboard" subtitle={`Overview ${formatDate(today)}`} />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Total Jadwal"
            value={overall?.total ?? 0}
            icon={<BarChart3 className="w-5 h-5" />}
            color="text-info"
            bgColor="bg-info/10"
          />
          <StatCard
            label="Selesai"
            value={overall?.done ?? 0}
            icon={<CheckCircle className="w-5 h-5" />}
            color="text-success"
            bgColor="bg-success/10"
          />
          <StatCard
            label="Menunggu"
            value={overall?.pending ?? 0}
            icon={<Clock className="w-5 h-5" />}
            color="text-warning"
            bgColor="bg-warning/10"
          />
          <StatCard
            label="Terlambat"
            value={overall?.late ?? 0}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="text-danger"
            bgColor="bg-danger/10"
          />
          <StatCard
            label="Terlewat"
            value={overall?.missed ?? 0}
            icon={<XCircle className="w-5 h-5" />}
            color="text-red-400"
            bgColor="bg-red-900/20"
          />
        </div>

        {/* Completion Rate */}
        {overall && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Tingkat Penyelesaian</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-card-hover rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all"
                  style={{ width: `${overall.completionRate}%` }}
                />
              </div>
              <span className="text-2xl font-bold text-primary">
                {overall.completionRate.toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {/* Split: By Operator + By Account */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Operator */}
          <div className="card">
            <h3 className="font-semibold mb-4">Per Operator</h3>
            <div className="space-y-3">
              {stats?.byOperator?.length ? (
                stats.byOperator.map((op) => (
                  <div
                    key={op.operatorId}
                    className="flex items-center justify-between p-3 bg-card-hover rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{op.operatorName}</p>
                      <p className="text-xs text-muted">
                        {op.done}/{op.total} selesai
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary">
                      {op.completionRate.toFixed(0)}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-muted text-sm">Belum ada data</p>
              )}
            </div>
          </div>

          {/* By Account */}
          <div className="card">
            <h3 className="font-semibold mb-4">Per Akun TikTok</h3>
            <div className="space-y-3">
              {stats?.byAccount?.length ? (
                stats.byAccount.map((acc) => (
                  <div
                    key={acc.accountId}
                    className="flex items-center justify-between p-3 bg-card-hover rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">@{acc.accountUsername}</p>
                      <p className="text-xs text-muted">
                        {acc.done}/{acc.total} selesai
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary">
                      {acc.completionRate.toFixed(0)}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-muted text-sm">Belum ada data</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`p-3 rounded-xl ${bgColor}`}>
        <div className={color}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}
