'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { adminApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import LaserModal from '@/components/LaserModal';

interface Server {
  id: number;
  name: string;
  map: string;
  apiKey: string;
  isActive: boolean;
  lastHeartbeat: string | null;
  chatTag: string | null;
  chatColor: string | null;
  chatIcon: string | null;
}

export default function ServersPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const router = useRouter();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    map: '',
    chatTag: '',
    chatColor: '#FF5722',
    chatIcon: ''
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && user && !user.isAdmin) {
      router.push('/');
    } else if (user && user.isAdmin) {
      fetchServers();
    }
  }, [user, authLoading, router]);

  const fetchServers = async () => {
    try {
      const res = await adminApi.getServers();
      setServers(res.data.servers || res.data || []);
    } catch (error) {
      console.error('Failed to fetch servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', map: '', chatTag: '', chatColor: '#FF5722', chatIcon: '' });
  };

  const handleAddServer = async () => {
    try {
      await adminApi.createServer(formData);
      fetchServers();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Failed to add server:', error);
    }
  };

  const handleUpdateServer = async () => {
    if (!editingServer) return;
    try {
      await adminApi.updateServer(editingServer.id, formData);
      fetchServers();
      setEditingServer(null);
      resetForm();
    } catch (error) {
      console.error('Failed to update server:', error);
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

  const handleDeleteServer = async (id: number) => {
    showModal({
      title: 'Delete Server?',
      content: <p>Are you sure you want to delete this server? This action cannot be undone.</p>,
      onConfirm: async () => {
        try {
          await adminApi.deleteServer(id);
          fetchServers();
        } catch (error) {
          console.error('Failed to delete server:', error);
        }
      },
      variant: 'danger',
      confirmText: 'Delete',
    });
  };

  const handleToggleActive = async (server: Server) => {
    try {
      await adminApi.updateServer(server.id, { isActive: !server.isActive });
      fetchServers();
    } catch (error) {
      console.error('Failed to toggle server:', error);
    }
  };

  const regenerateApiKey = async (id: number) => {
    showModal({
      title: 'Regenerate API Key?',
      content: (
        <p>
          Regenerate API key? The server will need to be reconfigured with the new key immediately.
        </p>
      ),
      onConfirm: async () => {
        try {
          await adminApi.regenerateServerKey(id);
          fetchServers();
        } catch (error) {
          console.error('Failed to regenerate key:', error);
        }
      },
      variant: 'warning',
      confirmText: 'Regenerate',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

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
        <h1 className="text-3xl font-bold">Server Management</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <span>+</span> Add Server
        </button>
      </div>

      {/* Servers Table */}
      <div className="bg-ark-dark rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-ark-darker">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Map</th>
              <th className="px-4 py-3 text-left">Chat Tag</th>
              <th className="px-4 py-3 text-left">API Key</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Last Heartbeat</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.id} className="border-t border-ark-darker hover:bg-ark-darker/50">
                <td className="px-4 py-3">{server.id}</td>
                <td className="px-4 py-3 font-medium">{server.name}</td>
                <td className="px-4 py-3">{server.map}</td>
                <td className="px-4 py-3">
                  {server.chatTag ? (
                    <span style={{ color: server.chatColor || '#FF5722' }}>
                      {server.chatIcon && `${server.chatIcon} `}
                      {server.chatTag}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="bg-ark-darker px-2 py-1 rounded text-xs">
                      {server.apiKey.substring(0, 12)}...
                    </code>
                    <button
                      onClick={() => copyToClipboard(server.apiKey)}
                      className="text-gray-400 hover:text-white"
                      title="Copy API Key"
                    >
                      📋
                    </button>
                    <button
                      onClick={() => regenerateApiKey(server.id)}
                      className="text-gray-400 hover:text-yellow-500"
                      title="Regenerate API Key"
                    >
                      🔄
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(server)}
                    className={`px-2 py-1 rounded text-xs ${server.isActive
                      ? 'bg-green-600/20 text-green-400'
                      : 'bg-red-600/20 text-red-400'
                      }`}
                  >
                    {server.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                  {server.lastHeartbeat
                    ? new Date(server.lastHeartbeat).toLocaleString()
                    : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingServer(server);
                        setFormData({
                          name: server.name,
                          map: server.map,
                          chatTag: server.chatTag || '',
                          chatColor: server.chatColor || '#FF5722',
                          chatIcon: server.chatIcon || ''
                        });
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteServer(server.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {servers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No servers configured. Click "Add Server" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Config Instructions */}
      <div className="mt-8 bg-ark-dark rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Plugin Configuration</h2>
        <p className="text-gray-400 mb-4">
          Copy the API Key and Server ID to your plugin's config.json:
        </p>
        <pre className="bg-ark-darker p-4 rounded-lg text-sm overflow-x-auto">
          {`{
  "HeartShop": {
    "ApiUrl": "${typeof window !== 'undefined' ? window.location.origin : ''}/api/plugin",
    "ApiKey": "<PASTE_API_KEY_HERE>",
    "ServerId": <SERVER_ID>,
    ...
  }
}`}
        </pre>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingServer) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-ark-dark rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingServer ? 'Edit Server' : 'Add New Server'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Server Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., IslandPVP, RagnarokPVE"
                  className="w-full bg-ark-darker border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Map</label>
                <select
                  value={formData.map}
                  onChange={(e) => setFormData({ ...formData, map: e.target.value })}
                  className="w-full bg-ark-darker border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                >
                  <option value="">Select Map</option>
                  <option value="TheIsland">The Island</option>
                  <option value="TheCenter">The Center</option>
                  <option value="ScorchedEarth">Scorched Earth</option>
                  <option value="Ragnarok">Ragnarok</option>
                  <option value="Aberration">Aberration</option>
                  <option value="Extinction">Extinction</option>
                  <option value="Valguero">Valguero</option>
                  <option value="Genesis">Genesis</option>
                  <option value="Genesis2">Genesis 2</option>
                  <option value="CrystalIsles">Crystal Isles</option>
                  <option value="LostIsland">Lost Island</option>
                  <option value="Fjordur">Fjordur</option>
                </select>
              </div>

              {/* Chat Display Settings */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Chat Display Settings</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Chat Tag</label>
                    <input
                      type="text"
                      value={formData.chatTag}
                      onChange={(e) => setFormData({ ...formData, chatTag: e.target.value })}
                      placeholder="[PVP5]"
                      className="w-full bg-ark-darker border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-green-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.chatColor}
                        onChange={(e) => setFormData({ ...formData, chatColor: e.target.value })}
                        className="h-[38px] w-12 bg-ark-darker border border-gray-700 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.chatColor}
                        onChange={(e) => setFormData({ ...formData, chatColor: e.target.value })}
                        className="flex-1 bg-ark-darker border border-gray-700 rounded-lg px-2 py-2 focus:outline-none focus:border-green-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Icon</label>
                    <input
                      type="text"
                      value={formData.chatIcon}
                      onChange={(e) => setFormData({ ...formData, chatIcon: e.target.value })}
                      placeholder="⚔️"
                      className="w-full bg-ark-darker border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-green-500 text-sm"
                    />
                  </div>
                </div>
                {/* Preview */}
                {(formData.chatTag || formData.chatIcon) && (
                  <div className="mt-3 p-2 bg-ark-darker rounded-lg">
                    <span className="text-xs text-gray-400">Preview: </span>
                    <span style={{ color: formData.chatColor }}>
                      {formData.chatIcon && `${formData.chatIcon} `}
                      {formData.chatTag || '[TAG]'}
                    </span>
                    <span className="text-gray-300"> PlayerName: Hello!</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingServer(null);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={editingServer ? handleUpdateServer : handleAddServer}
                disabled={!formData.name || !formData.map}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingServer ? 'Update' : 'Add Server'}
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
