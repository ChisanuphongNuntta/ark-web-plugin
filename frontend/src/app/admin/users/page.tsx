'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, UserRole } from '@/lib/store';
import { usePermissions } from '@/hooks/usePermissions';
import { adminApi } from '@/lib/api';
import {
  Loader2,
  Search,
  Shield,
  Ban,
  Coins,
  X,
  Plus,
  Minus,
  Replace,
  Users,
  Eye,
  History,
  Crown,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import LaserCard from '@/components/LaserCard';
import LaserButton from '@/components/LaserButton';
import LaserModal from '@/components/LaserModal';

interface User {
  id: string;
  discordId: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  steamId: string | null;
  epicId: string | null;
  pointsBalance: number;
  totalSpent: number;
  isAdmin: boolean;
  isBanned: boolean;
  role: UserRole;
  apiKeyServerId?: number | null;
  apiKeyServerName?: string | null;
  createdAt: string;
}

type CoinAction = 'set' | 'add' | 'remove';

export default function AdminUsersPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const { canManageServerUsers, canManageRoles, isRoot } = usePermissions();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCoinModal, setShowCoinModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [coinAction, setCoinAction] = useState<CoinAction>('add');
  const [coinAmount, setCoinAmount] = useState<number>(0);
  const [coinReason, setCoinReason] = useState('');
  const [showRoleDropdown, setShowRoleDropdown] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: () => adminApi.getUsers(page, search).then((res) => res.data),
    enabled: canManageServerUsers,
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isBanned?: boolean; isAdmin?: boolean } }) =>
      adminApi.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      adminApi.updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowRoleDropdown(null);
    },
  });

  const adjustPointsMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      adminApi.adjustPoints(id, amount, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      closeCoinModal();
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

  const handleToggleBan = (targetUser: User) => {
    if (targetUser.id === user?.id) {
      showModal({
        title: 'ดำเนินการไม่ได้',
        content: 'ไม่สามารถแบนตัวเองได้',
        cancelText: 'ตกลง',
        variant: 'warning',
      });
      return;
    }

    showModal({
      title: targetUser.isBanned ? 'ปลดแบนผู้ใช้?' : 'แบนผู้ใช้?',
      content: (
        <p>
          คุณต้องการ {targetUser.isBanned ? 'ปลดแบน' : 'แบน'} ผู้ใช้{' '}
          <strong className="text-white">{targetUser.discordUsername}</strong> ใช่หรือไม่?
        </p>
      ),
      onConfirm: () => {
        updateUserMutation.mutate({ id: targetUser.id, data: { isBanned: !targetUser.isBanned } });
      },
      variant: targetUser.isBanned ? 'success' : 'danger',
      confirmText: targetUser.isBanned ? 'ปลดแบน' : 'แบนถาวร',
    });
  };

  const openCoinModal = (targetUser: User, action: CoinAction = 'add') => {
    setSelectedUser(targetUser);
    setCoinAction(action);
    setCoinAmount(action === 'set' ? targetUser.pointsBalance : 0);
    setCoinReason('');
    setShowCoinModal(true);
  };

  const closeCoinModal = useCallback(() => {
    setShowCoinModal(false);
    setSelectedUser(null);
    setCoinAmount(0);
    setCoinReason('');
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCoinModal) {
        closeCoinModal();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showCoinModal, closeCoinModal]);

  const calculateFinalBalance = (): number => {
    if (!selectedUser) return 0;
    switch (coinAction) {
      case 'set':
        return coinAmount;
      case 'add':
        return selectedUser.pointsBalance + coinAmount;
      case 'remove':
        return Math.max(0, selectedUser.pointsBalance - coinAmount);
      default:
        return selectedUser.pointsBalance;
    }
  };

  const calculateAdjustmentAmount = (): number => {
    if (!selectedUser) return 0;
    switch (coinAction) {
      case 'set':
        return coinAmount - selectedUser.pointsBalance;
      case 'add':
        return coinAmount;
      case 'remove':
        return -coinAmount;
      default:
        return 0;
    }
  };

  const handleSubmitCoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    const adjustmentAmount = calculateAdjustmentAmount();
    if (adjustmentAmount === 0) {
      showModal({
        title: 'ไม่มีการเปลี่ยนแปลง',
        content: 'กรุณาระบุจำนวนหรือเลือกการเปลี่ยนแปลงที่ต้องการ',
        cancelText: 'ตกลง',
        variant: 'default',
      });
      return;
    }

    const actionLabels = {
      set: 'กำหนด',
      add: 'เพิ่ม',
      remove: 'หัก',
    };

    adjustPointsMutation.mutate({
      id: selectedUser.id,
      amount: adjustmentAmount,
      reason: coinReason || `${actionLabels[coinAction]} ${Math.abs(adjustmentAmount).toLocaleString()} IC`,
    });
  };

  const getActionColor = (action: CoinAction) => {
    switch (action) {
      case 'set':
        return 'from-blue-500 to-cyan-500';
      case 'add':
        return 'from-green-500 to-emerald-500';
      case 'remove':
        return 'from-red-500 to-orange-500';
    }
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

  if (!canManageServerUsers) {
    return (
      <LaserCard className="border-red-500/30">
        <div className="text-center py-12">
          <p className="text-red-400">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
          <p className="text-gray-500 text-sm mt-2">เฉพาะ Server Admin และ Root เท่านั้น</p>
        </div>
      </LaserCard>
    );
  }

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'root':
        return { label: 'Root', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'server_admin':
        return { label: 'Server Admin', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
      case 'admin':
        return { label: 'Admin', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      default:
        return { label: 'User', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
    }
  };

  const handleRoleChange = (targetUser: User, newRole: UserRole) => {
    if (targetUser.id === user?.id) {
      showModal({
        title: 'ดำเนินการไม่ได้',
        content: 'ไม่สามารถเปลี่ยน Role ตัวเองได้',
        cancelText: 'ตกลง',
        variant: 'warning',
      });
      return;
    }

    showModal({
      title: 'เปลี่ยนสิทธิ์ผู้ใช้?',
      content: (
        <div className="space-y-2">
          <p>
            คุณต้องการเปลี่ยน Role ของ <strong className="text-white">{targetUser.discordUsername}</strong>{' '}
            เป็น <strong className="text-emerald-400">{newRole}</strong> ใช่หรือไม่?
          </p>
          {(newRole === 'root' || newRole === 'server_admin') && (
            <p className="text-amber-400 text-sm bg-amber-500/10 p-2 rounded border border-amber-500/20">
              ⚠️ สิทธิ์นี้สามารถเข้าถึงข้อมูลสำคัญและจัดการเซิร์ฟเวอร์ได้
            </p>
          )}
        </div>
      ),
      onConfirm: () => {
        updateRoleMutation.mutate({ id: targetUser.id, role: newRole });
      },
      variant: 'warning',
      confirmText: 'ยืนยัน',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-gray-400 hover:text-white text-sm">
            &larr; กลับ Admin
          </Link>
          <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-400" />
            จัดการผู้ใช้
          </h1>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">ผู้ใช้ทั้งหมด</p>
          <p className="text-2xl font-bold text-white">{data?.pagination?.total || 0}</p>
        </div>
      </div>

      {/* Search */}
      <LaserCard glowOnHover>
        <div className="p-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-emerald-400" />
            </div>
            <input
              type="text"
              placeholder="ค้นหาด้วย Discord Username, Discord ID, หรือ Steam ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input w-full pl-12 bg-black/40 border-emerald-500/30 focus:border-emerald-500/50"
            />
          </div>
        </div>
      </LaserCard>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-xl animate-pulse"></div>
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400 relative" />
          </div>
        </div>
      ) : (
        <>
          <LaserCard className="overflow-visible">
            <div className="overflow-visible">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-emerald-500/20">
                    <th className="p-4 text-left text-emerald-300 font-medium">ผู้ใช้</th>
                    <th className="p-4 text-left text-emerald-300 font-medium">Steam ID</th>
                    <th className="p-4 text-left text-emerald-300 font-medium">Iris Coin</th>
                    <th className="p-4 text-left text-emerald-300 font-medium">Role</th>
                    <th className="p-4 text-left text-emerald-300 font-medium">สถานะ</th>
                    <th className="p-4 text-left text-emerald-300 font-medium">วันที่สมัคร</th>
                    <th className="p-4 text-left text-emerald-300 font-medium">จัดการ IC</th>
                    <th className="p-4 text-left text-emerald-300 font-medium">จัดการสิทธิ์</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.users?.map((u: User) => (
                    <tr
                      key={u.id}
                      className="border-b border-emerald-500/10 hover:bg-emerald-500/5 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {u.discordAvatar ? (
                            <div className="relative">
                              <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md"></div>
                              <img
                                src={u.discordAvatar}
                                alt=""
                                className="w-10 h-10 rounded-full relative border border-emerald-500/30"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
                          )}
                          <div>
                            <div className="font-medium text-white">{u.discordUsername || 'Unknown'}</div>
                            <div className="text-xs text-gray-500">{u.discordId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-sm text-gray-400">{u.steamId || '-'}</td>
                      <td className="p-4">
                        <div className="relative inline-block">
                          <div className="absolute inset-0 bg-yellow-500/20 rounded-lg blur-md"></div>
                          <span className="relative bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent font-bold">
                            {u.pointsBalance.toLocaleString()} IC
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          ใช้ไป {u.totalSpent.toLocaleString()} IC
                        </div>
                      </td>
                      {/* Role Column */}
                      <td className="p-4">
                        {canManageRoles ? (
                          <div className="relative">
                            <button
                              onClick={() => setShowRoleDropdown(showRoleDropdown === u.id ? null : u.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs border flex items-center gap-2 transition-all hover:opacity-80 ${getRoleBadge(u.role).color}`}
                            >
                              {u.role === 'root' && <Crown className="h-3 w-3" />}
                              {getRoleBadge(u.role).label}
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            {showRoleDropdown === u.id && (
                              <div className="absolute z-20 mt-1 w-40 bg-black/95 border border-emerald-500/30 rounded-xl shadow-xl overflow-hidden">
                                {(['user', 'admin', 'server_admin', 'root'] as UserRole[]).map((role) => (
                                  <button
                                    key={role}
                                    onClick={() => handleRoleChange(u, role)}
                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-emerald-500/20 transition-all flex items-center gap-2 ${u.role === role ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-300'
                                      }`}
                                  >
                                    {role === 'root' && <Crown className="h-3 w-3 text-red-400" />}
                                    {role === 'server_admin' && <Shield className="h-3 w-3 text-orange-400" />}
                                    {role === 'admin' && <Shield className="h-3 w-3 text-emerald-400" />}
                                    {getRoleBadge(role).label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`px-2 py-1 rounded-lg text-xs border ${getRoleBadge(u.role).color}`}>
                            {getRoleBadge(u.role).label}
                          </span>
                        )}
                      </td>
                      {/* Status Column */}
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {u.isBanned ? (
                            <span className="px-2 py-1 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                              Banned
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                              Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-gray-400 text-sm">
                        {new Date(u.createdAt).toLocaleDateString('th-TH')}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          {/* Set IC */}
                          <button
                            onClick={() => openCoinModal(u, 'set')}
                            className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all group"
                            title="กำหนด IC"
                          >
                            <Replace className="h-4 w-4 text-blue-400 group-hover:scale-110 transition-transform" />
                          </button>
                          {/* Add IC */}
                          <button
                            onClick={() => openCoinModal(u, 'add')}
                            className="p-2 rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 transition-all group"
                            title="เพิ่ม IC"
                          >
                            <Plus className="h-4 w-4 text-green-400 group-hover:scale-110 transition-transform" />
                          </button>
                          {/* Remove IC */}
                          <button
                            onClick={() => openCoinModal(u, 'remove')}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all group"
                            title="หัก IC"
                          >
                            <Minus className="h-4 w-4 text-red-400 group-hover:scale-110 transition-transform" />
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          {/* Toggle Ban */}
                          <button
                            onClick={() => handleToggleBan(u)}
                            className={`p-2 rounded-lg transition-all group ${u.isBanned
                              ? 'bg-red-500/20 border border-red-500/50'
                              : 'bg-gray-500/10 hover:bg-red-500/10 border border-gray-500/30 hover:border-red-500/30'
                              }`}
                            title={u.isBanned ? 'ปลดแบน' : 'แบน'}
                          >
                            <Ban
                              className={`h-4 w-4 transition-transform group-hover:scale-110 ${u.isBanned ? 'text-red-400' : 'text-gray-400'
                                }`}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!data?.users || data.users.length === 0) && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400">
                        ไม่พบผู้ใช้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </LaserCard>

          {/* Pagination */}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="flex justify-center items-center gap-4">
              <LaserButton
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ก่อนหน้า
              </LaserButton>
              <div className="px-4 py-2 bg-black/40 rounded-xl border border-emerald-500/20">
                <span className="text-gray-400">หน้า </span>
                <span className="text-emerald-400 font-bold">{page}</span>
                <span className="text-gray-400"> / {data.pagination.totalPages}</span>
              </div>
              <LaserButton
                variant="secondary"
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
              >
                ถัดไป
              </LaserButton>
            </div>
          )}
        </>
      )}

      {/* Coin Management Modal */}
      {showCoinModal && selectedUser && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && closeCoinModal()}
        >
          <LaserCard className="w-full max-w-lg mx-4 relative animate-in fade-in zoom-in duration-200">
            {/* Close Button */}
            <button
              onClick={closeCoinModal}
              className="absolute -top-3 -right-3 z-10 w-10 h-10 rounded-full bg-black/80 border border-emerald-500/30 hover:border-emerald-500/50 flex items-center justify-center transition-all hover:scale-110 shadow-lg shadow-emerald-500/20"
              title="กด ESC เพื่อปิด"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                {selectedUser.discordAvatar ? (
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-lg"></div>
                    <img
                      src={selectedUser.discordAvatar}
                      alt=""
                      className="w-16 h-16 rounded-full relative border-2 border-emerald-500/50"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/30" />
                )}
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {selectedUser.discordUsername || 'Unknown'}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Coins className="h-4 w-4 text-yellow-500" />
                    <span className="text-yellow-400 font-bold">
                      {selectedUser.pointsBalance.toLocaleString()} IC
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Tabs */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                <button
                  onClick={() => {
                    setCoinAction('set');
                    setCoinAmount(selectedUser.pointsBalance);
                  }}
                  className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${coinAction === 'set'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-black/40 border-emerald-500/20 text-gray-400 hover:border-blue-500/30'
                    }`}
                >
                  <Replace className="h-5 w-5" />
                  <span className="text-sm font-medium">กำหนด IC</span>
                </button>
                <button
                  onClick={() => {
                    setCoinAction('add');
                    setCoinAmount(0);
                  }}
                  className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${coinAction === 'add'
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-black/40 border-emerald-500/20 text-gray-400 hover:border-green-500/30'
                    }`}
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-sm font-medium">เพิ่ม IC</span>
                </button>
                <button
                  onClick={() => {
                    setCoinAction('remove');
                    setCoinAmount(0);
                  }}
                  className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${coinAction === 'remove'
                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                    : 'bg-black/40 border-emerald-500/20 text-gray-400 hover:border-red-500/30'
                    }`}
                >
                  <Minus className="h-5 w-5" />
                  <span className="text-sm font-medium">หัก IC</span>
                </button>
              </div>

              <form onSubmit={handleSubmitCoin} className="space-y-4">
                {/* Amount Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    {coinAction === 'set' && 'กำหนด IC เป็น'}
                    {coinAction === 'add' && 'จำนวน IC ที่ต้องการเพิ่ม'}
                    {coinAction === 'remove' && 'จำนวน IC ที่ต้องการหัก'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={coinAmount}
                      onChange={(e) => setCoinAmount(Math.max(0, Number(e.target.value)))}
                      className={`input w-full text-2xl font-bold text-center bg-black/40 border-2 ${coinAction === 'set'
                        ? 'border-blue-500/30 focus:border-blue-500/50'
                        : coinAction === 'add'
                          ? 'border-green-500/30 focus:border-green-500/50'
                          : 'border-red-500/30 focus:border-red-500/50'
                        }`}
                      placeholder="0"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                      IC
                    </div>
                  </div>
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex flex-wrap gap-2">
                  {[100, 500, 1000, 5000, 10000].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => {
                        if (coinAction === 'set') {
                          setCoinAmount(amount);
                        } else {
                          setCoinAmount((prev) => prev + amount);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all text-sm"
                    >
                      +{amount.toLocaleString()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCoinAmount(0)}
                    className="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/30 text-gray-400 hover:bg-gray-500/20 transition-all text-sm"
                  >
                    รีเซ็ต
                  </button>
                </div>

                {/* Reason Input */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">เหตุผล (ไม่บังคับ)</label>
                  <input
                    type="text"
                    value={coinReason}
                    onChange={(e) => setCoinReason(e.target.value)}
                    className="input w-full bg-black/40 border-emerald-500/30"
                    placeholder="เช่น โบนัสพิเศษ, คืน IC, แก้ไขยอด"
                  />
                </div>

                {/* Preview */}
                <div className="p-4 rounded-xl bg-black/60 border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">IC ปัจจุบัน:</span>
                    <span className="font-bold text-white">
                      {selectedUser.pointsBalance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-gray-400">การเปลี่ยนแปลง:</span>
                    <span
                      className={`font-bold ${calculateAdjustmentAmount() > 0
                        ? 'text-green-400'
                        : calculateAdjustmentAmount() < 0
                          ? 'text-red-400'
                          : 'text-gray-400'
                        }`}
                    >
                      {calculateAdjustmentAmount() > 0 ? '+' : ''}
                      {calculateAdjustmentAmount().toLocaleString()}
                    </span>
                  </div>
                  <div className="border-t border-emerald-500/20 mt-3 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">IC หลังปรับ:</span>
                      <div className="relative">
                        <div
                          className={`absolute inset-0 blur-lg ${coinAction === 'set'
                            ? 'bg-blue-500/30'
                            : coinAction === 'add'
                              ? 'bg-green-500/30'
                              : 'bg-red-500/30'
                            }`}
                        ></div>
                        <span
                          className={`relative text-xl font-bold bg-gradient-to-r ${getActionColor(
                            coinAction
                          )} bg-clip-text text-transparent`}
                        >
                          {calculateFinalBalance().toLocaleString()} IC
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <LaserButton
                    type="submit"
                    variant={coinAction === 'remove' ? 'secondary' : 'primary'}
                    loading={adjustPointsMutation.isPending}
                    disabled={calculateAdjustmentAmount() === 0}
                    className="flex-1"
                  >
                    {coinAction === 'set' && 'กำหนด IC'}
                    {coinAction === 'add' && 'เพิ่ม IC'}
                    {coinAction === 'remove' && 'หัก IC'}
                  </LaserButton>
                  <LaserButton type="button" variant="secondary" onClick={closeCoinModal}>
                    ยกเลิก
                  </LaserButton>
                </div>
              </form>

              {/* ESC hint */}
              <p className="text-center text-gray-500 text-xs mt-4">
                กด <kbd className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">ESC</kbd> เพื่อปิด
              </p>
            </div>
          </LaserCard>
        </div>
      )}
      {/* Modal - Alert & Confirm */}
      <LaserModal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        variant={modalConfig.variant}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
      >
        {modalConfig.content}
      </LaserModal>
    </div>
  );
}
