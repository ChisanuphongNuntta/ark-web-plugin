'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { adminApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import LaserModal from '@/components/LaserModal';

interface Server {
  id: number;
  name: string;
}

interface ChatRank {
  id: number;
  name: string;
  groupKey: string;
  color: string;
  icon: string | null;
  priority: number;
  serverId: number | null;
  isActive: boolean;
  server: { id: number; name: string } | null;
}

export default function ChatRanksPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const [ranks, setRanks] = useState<ChatRank[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRank, setEditingRank] = useState<ChatRank | null>(null);
  const [filterServerId, setFilterServerId] = useState<string>('all');
  const [formData, setFormData] = useState({
    name: '',
    groupKey: '',
    color: '#FFD700',
    icon: '',
    priority: 0,
    serverId: '',
    isActive: true,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && !user.isAdmin) {
      router.push('/');
    } else if (user && user.isAdmin) {
      fetchData();
    }
  }, [user, authLoading, router]);

  const fetchData = async () => {
    try {
      const [ranksRes, serversRes] = await Promise.all([
        adminApi.getChatRanks(),
        adminApi.getServers(),
      ]);
      setRanks(ranksRes.data.ranks || ranksRes.data || []);
      setServers(serversRes.data.servers || serversRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      groupKey: '',
      color: '#FFD700',
      icon: '',
      priority: 0,
      serverId: '',
      isActive: true,
    });
  };

  const handleAdd = async () => {
    try {
      await adminApi.createChatRank({
        ...formData,
        priority: parseInt(formData.priority.toString()) || 0,
        serverId: formData.serverId ? parseInt(formData.serverId) : null,
      });
      fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Failed to add rank:', error);
    }
  };

  const handleUpdate = async () => {
    if (!editingRank) return;
    try {
      await adminApi.updateChatRank(editingRank.id, {
        ...formData,
        priority: parseInt(formData.priority.toString()) || 0,
        serverId: formData.serverId ? parseInt(formData.serverId) : null,
      });
      fetchData();
      setEditingRank(null);
      resetForm();
    } catch (error) {
      console.error('Failed to update rank:', error);
    }
  };

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

  const showConfirmModal = ({
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

  const handleDelete = async (id: number) => {
    showConfirmModal({
      title: 'Delete Chat Rank?',
      content: <p>Are you sure you want to delete this chat rank? This action cannot be undone.</p>,
      onConfirm: async () => {
        try {
          await adminApi.deleteChatRank(id);
          fetchData();
        } catch (error) {
          console.error('Failed to delete rank:', error);
        }
      },
      variant: 'danger',
      confirmText: 'Delete',
    });
  };

  const handleToggleActive = async (rank: ChatRank) => {
    try {
      await adminApi.updateChatRank(rank.id, { isActive: !rank.isActive });
      fetchData();
    } catch (error) {
      console.error('Failed to toggle rank:', error);
    }
  };

  const filteredRanks = filterServerId === 'all'
    ? ranks
    : filterServerId === 'global'
      ? ranks.filter(r => r.serverId === null)
      : ranks.filter(r => r.serverId === parseInt(filterServerId));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Chat Ranks</h1>
          <p className="text-gray-400 text-sm mt-1">
            Configure chat display for Permissions plugin groups
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <span>+</span> Add Rank
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={filterServerId}
          onChange={(e) => setFilterServerId(e.target.value)}
          className="bg-ark-dark border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
        >
          <option value="all">All Servers</option>
          <option value="global">Global Only</option>
          {servers.map((server) => (
            <option key={server.id} value={server.id}>{server.name}</option>
          ))}
        </select>
      </div>

      {/* Ranks Table */}
      <div className="bg-ark-dark rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-ark-darker">
            <tr>
              <th className="px-4 py-3 text-left">Priority</th>
              <th className="px-4 py-3 text-left">Preview</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Group Key</th>
              <th className="px-4 py-3 text-left">Server</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRanks.map((rank) => (
              <tr key={rank.id} className="border-t border-ark-darker hover:bg-ark-darker/50">
                <td className="px-4 py-3 text-center">
                  <span className="bg-ark-darker px-2 py-1 rounded text-sm">{rank.priority}</span>
                </td>
                <td className="px-4 py-3">
                  <span style={{ color: rank.color }}>
                    {rank.icon && `${rank.icon} `}
                    [{rank.name}]
                  </span>
                  <span className="text-gray-300"> Player</span>
                </td>
                <td className="px-4 py-3 font-medium">{rank.name}</td>
                <td className="px-4 py-3">
                  <code className="bg-ark-darker px-2 py-1 rounded text-xs text-green-400">
                    {rank.groupKey}
                  </code>
                </td>
                <td className="px-4 py-3 text-sm">
                  {rank.server ? (
                    <span className="text-blue-400">{rank.server.name}</span>
                  ) : (
                    <span className="text-yellow-400">Global</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(rank)}
                    className={`px-2 py-1 rounded text-xs ${rank.isActive
                      ? 'bg-green-600/20 text-green-400'
                      : 'bg-red-600/20 text-red-400'
                      }`}
                  >
                    {rank.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingRank(rank);
                        setFormData({
                          name: rank.name,
                          groupKey: rank.groupKey,
                          color: rank.color,
                          icon: rank.icon || '',
                          priority: rank.priority,
                          serverId: rank.serverId ? rank.serverId.toString() : '',
                          isActive: rank.isActive,
                        });
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rank.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredRanks.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No chat ranks configured. Click "Add Rank" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-ark-dark rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">How It Works</h2>
        <div className="space-y-4 text-gray-400 text-sm">
          <div>
            <h3 className="text-white font-medium mb-1">Group Key</h3>
            <p>The group name from Permissions plugin (e.g., "VIP", "Admin", "Moderator").
              Players in this group will display with this rank's styling in chat.</p>
          </div>
          <div>
            <h3 className="text-white font-medium mb-1">Priority</h3>
            <p>Higher priority ranks display first when a player has multiple groups.
              For example, if a player has both "VIP" (priority 10) and "Admin" (priority 100),
              they'll show as Admin.</p>
          </div>
          <div>
            <h3 className="text-white font-medium mb-1">Server-Specific vs Global</h3>
            <p>Server-specific ranks only apply on that server.
              Global ranks apply to all servers (but can be overridden by server-specific ranks).</p>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showModal || editingRank) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-ark-dark rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingRank ? 'Edit Chat Rank' : 'Add New Chat Rank'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VIP"
                    className="w-full bg-ark-darker border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Group Key</label>
                  <input
                    type="text"
                    value={formData.groupKey}
                    onChange={(e) => setFormData({ ...formData, groupKey: e.target.value })}
                    placeholder="VIP"
                    className="w-full bg-ark-darker border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="h-[38px] w-12 bg-ark-darker border border-gray-700 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="flex-1 bg-ark-darker border border-gray-700 rounded-lg px-2 py-2 focus:outline-none focus:border-green-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Icon</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="Crown emoji"
                    className="w-full bg-ark-darker border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Priority</label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full bg-ark-darker border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Server (optional)</label>
                <select
                  value={formData.serverId}
                  onChange={(e) => setFormData({ ...formData, serverId: e.target.value })}
                  className="w-full bg-ark-darker border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                >
                  <option value="">Global (all servers)</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>{server.name}</option>
                  ))}
                </select>
              </div>

              {/* Preview */}
              <div className="p-3 bg-ark-darker rounded-lg">
                <span className="text-xs text-gray-400 block mb-1">Preview:</span>
                <span style={{ color: formData.color }}>
                  {formData.icon && `${formData.icon} `}
                  [{formData.name || 'RANK'}]
                </span>
                <span className="text-gray-300"> PlayerName: Hello everyone!</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingRank(null);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={editingRank ? handleUpdate : handleAdd}
                disabled={!formData.name || !formData.groupKey || !formData.color}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingRank ? 'Update' : 'Add Rank'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Laser Modal */}
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
