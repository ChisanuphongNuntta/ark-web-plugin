'use client';

import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';


import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { protectionAdminApi } from '@/lib/api';
import {
  Shield,
  Users,
  Building2,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Search,
  Loader2,
  History,
  BarChart3,
} from 'lucide-react';

interface ProtectionData {
  id: number;
  steamId: string;
  protectionDays: number;
  protectionStartAt: string;
  protectionEndAt: string;
  protectionType: string;
  isActive: boolean;
  grantedBy: string | null;
  grantedReason: string | null;
  tribeProtection: {
    tribeId: string;
    tribeName: string;
    serverId: number;
  } | null;
}

interface ProtectionLog {
  id: number;
  serverId: number;
  eventType: string;
  steamId: string | null;
  tribeId: string | null;
  attackerSteamId: string | null;
  attackerTribeId: string | null;
  details: string | null;
  createdAt: string;
}

interface Stats {
  totalPlayers: number;
  activePlayers: number;
  totalTribes: number;
  activeTribes: number;
  damageBlockedToday: number;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ProtectionTypeBadge({ type }: { type: string }) {
  const badges: Record<string, { label: string; className: string }> = {
    new_player: {
      label: 'New Player',
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
    },
    admin_granted: {
      label: 'Admin',
      className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    },
  };

  const badge = badges[type] || { label: type, className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const badges: Record<string, { label: string; className: string }> = {
    protection_started: { label: 'Started', className: 'bg-green-500/20 text-green-400' },
    protection_ended: { label: 'Ended', className: 'bg-red-500/20 text-red-400' },
    damage_blocked: { label: 'Blocked', className: 'bg-blue-500/20 text-blue-400' },
    tribe_protected: { label: 'Tribe', className: 'bg-emerald-500/20 text-emerald-400' },
    admin_grant: { label: 'Grant', className: 'bg-yellow-500/20 text-yellow-400' },
    admin_revoke: { label: 'Revoke', className: 'bg-orange-500/20 text-orange-400' },
  };

  const badge = badges[type] || { label: type, className: 'bg-gray-500/20 text-gray-400' };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

export default function ProtectionAdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'list' | 'logs' | 'grant'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'expired'>('all');

  // Grant form state
  const [grantForm, setGrantForm] = useState({
    steamId: '',
    protectionDays: 7,
    reason: '',
    protectTribe: false,
    tribeId: '',
    tribeName: '',
    serverId: 1,
  });

  // Queries
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['protection-stats'],
    queryFn: () => protectionAdminApi.getStats().then(res => res.data),
  });

  const { data: protectionsData, isLoading: protectionsLoading } = useQuery({
    queryKey: ['protections', filterActive],
    queryFn: () => protectionAdminApi.getProtections({
      isActive: filterActive === 'all' ? undefined : filterActive === 'active' ? 'true' : 'false',
      limit: 50,
    }).then(res => res.data),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['protection-logs'],
    queryFn: () => protectionAdminApi.getLogs({ limit: 100 }).then(res => res.data),
    enabled: activeTab === 'logs',
  });

  // Mutations
  const grantMutation = useMutation({
    mutationFn: () => protectionAdminApi.grantProtection({
      steamId: grantForm.steamId,
      protectionDays: grantForm.protectionDays,
      reason: grantForm.reason || undefined,
      protectTribe: grantForm.protectTribe,
      tribeId: grantForm.protectTribe ? grantForm.tribeId : undefined,
      tribeName: grantForm.protectTribe ? grantForm.tribeName : undefined,
      serverId: grantForm.protectTribe ? grantForm.serverId : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protections'] });
      queryClient.invalidateQueries({ queryKey: ['protection-stats'] });
      setGrantForm({
        steamId: '',
        protectionDays: 7,
        reason: '',
        protectTribe: false,
        tribeId: '',
        tribeName: '',
        serverId: 1,
      });
      setActiveTab('list');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (steamId: string) => protectionAdminApi.revokeProtection(steamId, { revokeTribe: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protections'] });
      queryClient.invalidateQueries({ queryKey: ['protection-stats'] });
    },
  });

  const stats: Stats = statsData?.stats || {
    totalPlayers: 0,
    activePlayers: 0,
    totalTribes: 0,
    activeTribes: 0,
    damageBlockedToday: 0,
  };

  const filteredProtections = protectionsData?.protections?.filter((p: ProtectionData) =>
    p.steamId.includes(searchTerm) ||
    p.tribeProtection?.tribeName?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-2xl"></div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent relative flex items-center gap-3">
            <Shield className="h-10 w-10 text-cyan-400" />
            Protection Management
          </h1>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <GlassCard className="border-cyan-500/20">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-cyan-500/10">
                <Users className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-cyan-400">{stats.activePlayers}</p>
                <p className="text-xs text-gray-400">Active Players</p>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-emerald-500/20">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10">
                <Building2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">{stats.activeTribes}</p>
                <p className="text-xs text-gray-400">Active Tribes</p>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-green-500/20">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-green-500/10">
                <Shield className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{stats.damageBlockedToday}</p>
                <p className="text-xs text-gray-400">Blocked Today</p>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-yellow-500/20">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-yellow-500/10">
                <Users className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">{stats.totalPlayers}</p>
                <p className="text-xs text-gray-400">Total Players</p>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="border-orange-500/20">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-orange-500/10">
                <Building2 className="h-6 w-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-400">{stats.totalTribes}</p>
                <p className="text-xs text-gray-400">Total Tribes</p>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${
            activeTab === 'list'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <Shield className="h-4 w-4" />
          Protection List
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <History className="h-4 w-4" />
          Logs
        </button>
        <button
          onClick={() => setActiveTab('grant')}
          className={`px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 ${
            activeTab === 'grant'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <Plus className="h-4 w-4" />
          Grant Protection
        </button>
      </div>

      {/* Content */}
      {activeTab === 'list' && (
        <GlassCard>
          <div className="p-6">
            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by Steam ID or Tribe Name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-cyan-500/50 focus:outline-none text-gray-200"
                />
              </div>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as any)}
                className="px-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-cyan-500/50 focus:outline-none text-gray-200"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            {/* Table */}
            {protectionsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700/50">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Steam ID</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Type</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Tribe</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">End Date</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProtections.map((protection: ProtectionData) => {
                      const isActive = protection.isActive && new Date(protection.protectionEndAt) > new Date();
                      return (
                        <tr key={protection.id} className="border-b border-gray-700/30 hover:bg-gray-800/30">
                          <td className="py-3 px-4">
                            <span className="font-mono text-cyan-300">{protection.steamId}</span>
                          </td>
                          <td className="py-3 px-4">
                            <ProtectionTypeBadge type={protection.protectionType} />
                          </td>
                          <td className="py-3 px-4">
                            {isActive ? (
                              <span className="flex items-center gap-1 text-green-400">
                                <CheckCircle className="h-4 w-4" />
                                Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-400">
                                <XCircle className="h-4 w-4" />
                                Expired
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {protection.tribeProtection ? (
                              <span className="text-emerald-300">
                                {protection.tribeProtection.tribeName || protection.tribeProtection.tribeId}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-gray-400">
                            {formatDate(protection.protectionEndAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isActive && (
                              <button
                                onClick={() => revokeMutation.mutate(protection.steamId)}
                                disabled={revokeMutation.isPending}
                                className="px-3 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-sm"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredProtections.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    No protections found
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === 'logs' && (
        <GlassCard>
          <div className="p-6">
            {logsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="space-y-3">
                {logsData?.logs?.map((log: ProtectionLog) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-4 p-4 rounded-xl bg-black/20 border border-gray-700/30"
                  >
                    <EventTypeBadge type={log.eventType} />
                    <div className="flex-1">
                      {log.steamId && (
                        <span className="font-mono text-cyan-300">{log.steamId}</span>
                      )}
                      {log.tribeId && (
                        <span className="text-emerald-300 ml-2">Tribe: {log.tribeId}</span>
                      )}
                      {log.attackerSteamId && (
                        <span className="text-red-300 ml-2">Attacker: {log.attackerSteamId}</span>
                      )}
                    </div>
                    <span className="text-gray-500 text-sm">Server {log.serverId}</span>
                    <span className="text-gray-500 text-sm">{formatDate(log.createdAt)}</span>
                  </div>
                ))}

                {(!logsData?.logs || logsData.logs.length === 0) && (
                  <div className="text-center py-12 text-gray-400">
                    No logs found
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {activeTab === 'grant' && (
        <GlassCard className="border-green-500/20">
          <div className="p-6">
            <h2 className="text-xl font-bold text-green-400 mb-6 flex items-center gap-2">
              <Plus className="h-6 w-6" />
              Grant Protection
            </h2>

            <div className="space-y-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Steam ID *</label>
                <input
                  type="text"
                  value={grantForm.steamId}
                  onChange={(e) => setGrantForm({ ...grantForm, steamId: e.target.value })}
                  placeholder="76561198000000000"
                  className="w-full px-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-green-500/50 focus:outline-none text-gray-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Protection Days</label>
                <input
                  type="number"
                  value={grantForm.protectionDays}
                  onChange={(e) => setGrantForm({ ...grantForm, protectionDays: parseInt(e.target.value) || 7 })}
                  min={1}
                  max={365}
                  className="w-full px-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-green-500/50 focus:outline-none text-gray-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Reason</label>
                <input
                  type="text"
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                  placeholder="Optional reason..."
                  className="w-full px-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-green-500/50 focus:outline-none text-gray-200"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="protectTribe"
                  checked={grantForm.protectTribe}
                  onChange={(e) => setGrantForm({ ...grantForm, protectTribe: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="protectTribe" className="text-gray-400">Also protect tribe</label>
              </div>

              {grantForm.protectTribe && (
                <div className="space-y-4 pl-6 border-l-2 border-green-500/30">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Tribe ID</label>
                    <input
                      type="text"
                      value={grantForm.tribeId}
                      onChange={(e) => setGrantForm({ ...grantForm, tribeId: e.target.value })}
                      placeholder="Tribe ID"
                      className="w-full px-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-green-500/50 focus:outline-none text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Tribe Name</label>
                    <input
                      type="text"
                      value={grantForm.tribeName}
                      onChange={(e) => setGrantForm({ ...grantForm, tribeName: e.target.value })}
                      placeholder="Tribe Name"
                      className="w-full px-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-green-500/50 focus:outline-none text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Server ID</label>
                    <input
                      type="number"
                      value={grantForm.serverId}
                      onChange={(e) => setGrantForm({ ...grantForm, serverId: parseInt(e.target.value) || 1 })}
                      min={1}
                      className="w-full px-4 py-2 rounded-xl bg-black/40 border border-gray-700/50 focus:border-green-500/50 focus:outline-none text-gray-200"
                    />
                  </div>
                </div>
              )}

              <Button
                variant="primary"
                onClick={() => grantMutation.mutate()}
                loading={grantMutation.isPending}
                disabled={!grantForm.steamId}
                icon={<Plus className="h-5 w-5" />}
                className="w-full mt-6"
              >
                Grant Protection
              </Button>

              {grantMutation.isError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                  Failed to grant protection. Please try again.
                </div>
              )}

              {grantMutation.isSuccess && (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400">
                  Protection granted successfully!
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
