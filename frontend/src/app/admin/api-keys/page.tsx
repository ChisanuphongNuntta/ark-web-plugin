'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { adminApi } from '@/lib/api';
import {
  Loader2,
  Search,
  Key,
  Wifi,
  Server,
  Map,
  Clock,
  RefreshCw,
  Trash2,
  Activity,
  AlertCircle,
  CheckCircle,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import Surface from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';

interface ApiKeyUser {
  id: string;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  steamId: string | null;
  apiKey: string | null;
  apiKeyIp: string | null;
  apiKeyCreatedAt: string | null;
  apiKeyServerId: number | null;
  apiKeyServerName: string | null;
  apiKeyServerMap: string | null;
  apiKeyServerPort: number | null;
  apiKeyLastUsed: string | null;
  isBanned: boolean;
}

export default function AdminApiKeysPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageApiKeys, apiKeyServerId } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-api-keys', page, search],
    queryFn: () => adminApi.getApiKeys(page, search).then((res) => res.data),
    enabled: canManageApiKeys,
  });

  const resetIpMutation = useMutation({
    mutationFn: (userId: string) => adminApi.resetApiKeyIp(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      showMessage('success', 'IP Whitelist ถูกรีเซ็ตแล้ว');
    },
    onError: () => {
      showMessage('error', 'เกิดข้อผิดพลาดในการรีเซ็ต IP');
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (userId: string) => adminApi.revokeApiKey(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      showMessage('success', 'API Key ถูกยกเลิกแล้ว');
    },
    onError: () => {
      showMessage('error', 'เกิดข้อผิดพลาดในการยกเลิก API Key');
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (userId: string) => adminApi.downloadPlugin(userId),
    onSuccess: (response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = response.headers['content-disposition'];
      let fileName = 'HeartShop_Plugin.zip';
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
        if (fileNameMatch.length === 2) fileName = fileNameMatch[1];
      }
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showMessage('success', '📦 Download Started!');
    },
    onError: (error: any) => {
      if (error.response?.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorObj = JSON.parse(reader.result as string);
            showMessage('error', errorObj.message || errorObj.error || 'Download failed');
          } catch (e) {
            showMessage('error', 'Download failed'); // Fallback
          }
        };
        reader.readAsText(error.response.data);
      } else {
        showMessage('error', 'Download failed');
      }
    },
  });

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    content: null,
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  const showModal = ({
    title,
    content,
    onConfirm,
    variant = 'default',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
  }: {
    title: string;
    content: React.ReactNode;
    onConfirm?: () => void;
    variant?: 'default' | 'danger' | 'warning' | 'success';
    confirmText?: string;
    cancelText?: string;
  }) => {
    setModalConfig({
      isOpen: true,
      title,
      content,
      onConfirm: onConfirm
        ? () => {
          onConfirm();
          closeModal();
        }
        : undefined,
      variant,
      confirmText,
      cancelText,
    });
  };

  const handleResetIp = (apiKeyUser: ApiKeyUser) => {
    showModal({
      title: 'รีเซ็ต IP Whitelist?',
      content: (
        <p>
          ต้องการรีเซ็ต IP Whitelist ของ <strong className="text-white">{apiKeyUser.discordUsername}</strong> ใช่หรือไม่?
        </p>
      ),
      onConfirm: () => resetIpMutation.mutate(apiKeyUser.id),
      variant: 'warning',
      confirmText: 'รีเซ็ต',
    });
  };

  const handleRevokeKey = (apiKeyUser: ApiKeyUser) => {
    showModal({
      title: 'ยกเลิก API Key?',
      content: (
        <div className="space-y-2">
          <p>
            คุณต้องการยกเลิก API Key ของ <strong className="text-white">{apiKeyUser.discordUsername}</strong> ใช่หรือไม่?
          </p>
          <p className="text-red-400 text-sm bg-red-500/10 p-2 rounded border border-red-500/20">
            ⚠️ การดำเนินการนี้จะทำให้ ARK Plugin ของผู้ใช้ใช้งานไม่ได้ทันที
          </p>
        </div>
      ),
      onConfirm: () => revokeKeyMutation.mutate(apiKeyUser.id),
      variant: 'danger',
      confirmText: 'ยกเลิก Key',
    });
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="relative">
          <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
        </div>
      </div>
    );
  }

  if (!canManageApiKeys) {
    return (
      <Surface className="border-red-500/30">
        <div className="text-center py-12">
          <p className="text-red-400">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
          <p className="text-gray-500 text-sm mt-2">เฉพาะ Server Admin และ Root เท่านั้น</p>
        </div>
      </Surface>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
            &larr; กลับ Admin
          </Link>
          <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
            <Key className="h-8 w-8 text-emerald-400" />
            จัดการ API Keys
          </h1>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">API Keys ทั้งหมด</p>
          <p className="text-2xl font-bold text-white">{data?.pagination?.total || 0}</p>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <Surface className={message.type === 'success' ? 'border-green-500/30' : 'border-red-500/30'}>
          <div className={`p-4 ${message.type === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            <div className="flex items-center gap-3">
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400" />
              )}
              <span className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>
                {message.text}
              </span>
            </div>
          </div>
        </Surface>
      )}

      {/* Search */}
      <Surface glowOnHover>
        <div className="p-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-emerald-400" />
            </div>
            <input
              type="text"
              placeholder="ค้นหาด้วย Discord Username, Steam ID, หรือ Server Name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input w-full pl-12 bg-black/40 border-emerald-500/30 focus:border-emerald-500/50"
            />
          </div>
        </div>
      </Surface>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
          </div>
        </div>
      ) : (
        <>
          {/* API Keys Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data?.apiKeys?.map((apiKeyUser: ApiKeyUser) => (
              <Surface key={apiKeyUser.id} glowOnHover>
                <div className="p-5">
                  {/* User Header */}
                  <div className="flex items-center gap-4 mb-4">
                    {apiKeyUser.discordAvatar ? (
                      <div className="relative">
                        <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-md"></div>
                        <img
                          src={apiKeyUser.discordAvatar}
                          alt=""
                          className="w-12 h-12 rounded-full relative border-2 border-emerald-500/30"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500/30" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold text-white">
                        {apiKeyUser.discordUsername || 'Unknown'}
                      </h3>
                      <p className="text-xs text-gray-500 font-mono">{apiKeyUser.apiKey}</p>
                    </div>
                    {apiKeyUser.isBanned && (
                      <span className="px-2 py-1 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                        Banned
                      </span>
                    )}
                  </div>

                  {/* Server Info */}
                  {apiKeyUser.apiKeyServerName ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Server className="h-4 w-4 text-green-400" />
                        <span className="text-green-400 font-semibold text-sm">เชื่อมต่ออยู่</span>
                        <div className="ml-auto h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Server Name</p>
                          <p className="text-white font-medium">{apiKeyUser.apiKeyServerName}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Map</p>
                          <p className="text-emerald-400 font-medium">{apiKeyUser.apiKeyServerMap || '-'}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-500/10 border border-gray-500/20 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-500 text-sm">ยังไม่มีการเชื่อมต่อ</span>
                      </div>
                    </div>
                  )}

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                    {/* IP Address */}
                    <div className="bg-black/40 rounded-lg p-3 border border-emerald-500/10">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        <Wifi className="h-3 w-3" />
                        Registered IP
                      </div>
                      {apiKeyUser.apiKeyIp ? (
                        <p className="text-green-400 font-mono text-xs">{apiKeyUser.apiKeyIp}</p>
                      ) : (
                        <p className="text-gray-500 text-xs">รอการเชื่อมต่อ</p>
                      )}
                    </div>

                    {/* Last Used */}
                    <div className="bg-black/40 rounded-lg p-3 border border-emerald-500/10">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        <Activity className="h-3 w-3" />
                        ใช้งานล่าสุด
                      </div>
                      {apiKeyUser.apiKeyLastUsed ? (
                        <p className="text-teal-400 text-xs">
                          {new Date(apiKeyUser.apiKeyLastUsed).toLocaleString('th-TH', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </p>
                      ) : (
                        <p className="text-gray-500 text-xs">-</p>
                      )}
                    </div>

                    {/* Created At */}
                    <div className="bg-black/40 rounded-lg p-3 border border-emerald-500/10">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        <Clock className="h-3 w-3" />
                        สร้างเมื่อ
                      </div>
                      {apiKeyUser.apiKeyCreatedAt ? (
                        <p className="text-gray-400 text-xs">
                          {new Date(apiKeyUser.apiKeyCreatedAt).toLocaleDateString('th-TH')}
                        </p>
                      ) : (
                        <p className="text-gray-500 text-xs">-</p>
                      )}
                    </div>

                    {/* Steam ID */}
                    <div className="bg-black/40 rounded-lg p-3 border border-emerald-500/10">
                      <div className="flex items-center gap-1 text-gray-500 text-xs mb-1">
                        Steam ID
                      </div>
                      <p className="text-gray-400 text-xs font-mono truncate">
                        {apiKeyUser.steamId || '-'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {user?.role === 'root' && (
                      <button
                        onClick={() => downloadMutation.mutate(apiKeyUser.id)}
                        disabled={downloadMutation.isPending}
                        className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium flex items-center justify-center gap-2 transition-all"
                        title="ดาวน์โหลด Plugin Package"
                      >
                        {downloadMutation.isPending && downloadMutation.variables === apiKeyUser.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Plugin Package
                      </button>
                    )}
                    <button
                      onClick={() => handleResetIp(apiKeyUser)}
                      disabled={resetIpMutation.isPending}
                      className="flex-1 px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm font-medium flex items-center justify-center gap-2 transition-all"
                    >
                      {resetIpMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      รีเซ็ต IP
                    </button>
                    <button
                      onClick={() => handleRevokeKey(apiKeyUser)}
                      disabled={revokeKeyMutation.isPending}
                      className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium flex items-center justify-center gap-2 transition-all"
                    >
                      {revokeKeyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </Surface>
            ))}

            {(!data?.apiKeys || data.apiKeys.length === 0) && (
              <div className="col-span-2">
                <Surface>
                  <div className="py-12 text-center text-gray-400">
                    <Key className="h-12 w-12 mx-auto mb-4 text-emerald-400/50" />
                    <p>ไม่พบ API Keys</p>
                  </div>
                </Surface>
              </div>
            )}
          </div>

          {/* Pagination */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-4">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ก่อนหน้า
              </Button>
              <div className="px-4 py-2 bg-black/40 rounded-xl border border-emerald-500/20">
                <span className="text-gray-400">หน้า </span>
                <span className="text-emerald-400 font-bold">{page}</span>
                <span className="text-gray-400"> / {data.pagination.totalPages}</span>
              </div>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
              >
                ถัดไป
              </Button>
            </div>
          )}
        </>
      )}
      {/* Accessible Dialog */}
      <Dialog
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        variant={modalConfig.variant}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
      >
        {modalConfig.content}
      </Dialog>
    </div>
  );
}
