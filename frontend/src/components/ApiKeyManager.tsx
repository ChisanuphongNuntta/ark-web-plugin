'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  Key,
  RefreshCw,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Wifi,
  Shield,
  Clock,
  Sparkles,
  Zap,
  Server,
  Map,
  Activity,
  Download,
} from 'lucide-react';
import { userApi, adminApi } from '@/lib/api';
import LaserModal from '@/components/LaserModal';

interface ApiKeyManagerProps {
  apiKey?: string | null;
  apiKeyIp?: string | null;
  apiKeyCreatedAt?: string | null;
  apiKeyServerName?: string | null;
  apiKeyServerMap?: string | null;
  apiKeyLastUsed?: string | null;
  userId?: string;
}

export default function ApiKeyManager({
  apiKey,
  apiKeyIp,
  apiKeyCreatedAt,
  apiKeyServerName,
  apiKeyServerMap,
  apiKeyLastUsed,
  userId,
}: ApiKeyManagerProps) {
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Generate API Key
  const generateMutation = useMutation({
    mutationFn: () => userApi.generateApiKey(),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      showMessage('success', '✨ API Key สร้างสำเร็จและคัดลอกไปยัง Clipboard แล้ว!');
      setShowKey(true);
      if (response.data.apiKey) {
        navigator.clipboard.writeText(response.data.apiKey);
      }
    },
    onError: (error: any) => {
      showMessage('error', error.response?.data?.error || 'เกิดข้อผิดพลาด');
    },
  });

  // Reset IP
  const resetIpMutation = useMutation({
    mutationFn: () => userApi.resetIp(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      showMessage('success', '🌐 รีเซ็ต IP สำเร็จ!');
    },
    onError: (error: any) => {
      showMessage('error', error.response?.data?.error || 'เกิดข้อผิดพลาด');
    },
  });

  // Delete API Key
  const deleteMutation = useMutation({
    mutationFn: () => userApi.deleteApiKey(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      showMessage('info', 'ลบ API Key สำเร็จ');
      setShowKey(false);
    },
    onError: (error: any) => {
      showMessage('error', error.response?.data?.error || 'เกิดข้อผิดพลาด');
    },
  });

  const handleCopyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      showMessage('success', '📋 คัดลอก API Key แล้ว!');
    }
  };

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
    confirmText?: string;
    variant?: 'default' | 'danger' | 'warning';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    content: null,
    onConfirm: () => { },
  });

  const closeModal = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }));
  };

  // Download Plugin
  const downloadMutation = useMutation({
    mutationFn: (variables: { userId: string; serverId?: number }) =>
      adminApi.downloadPlugin(variables.userId, variables.serverId),
    onSuccess: (response) => {
      // Create blob link to download
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
      // Try to parse the blob error response
      if (error.response?.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorObj = JSON.parse(reader.result as string);
            showMessage('error', errorObj.message || errorObj.error || 'Download failed');
          } catch (e) {
            showMessage('error', 'Download failed');
          }
        };
        reader.readAsText(error.response.data);
      } else {
        showMessage('error', error.response?.data?.error || 'Download failed');
      }
    },
  });
  const showConfirmModal = (
    title: string,
    content: React.ReactNode,
    onConfirm: () => void,
    variant: 'default' | 'danger' | 'warning' = 'warning',
    confirmText = 'ยืนยัน'
  ) => {
    setModalConfig({
      isOpen: true,
      title,
      content,
      onConfirm: () => {
        onConfirm();
        closeModal();
      },
      variant,
      confirmText,
    });
  };

  // ... (previous mutations remain same)



  const handleDeleteKey = () => {
    showConfirmModal(
      'ลบ API Key?',
      <p>การลบ API Key จะทำให้ <strong>ARK Plugin ใช้งานไม่ได้ทันที</strong> คุณต้องสร้าง Key ใหม่และไปเปลี่ยนใน Config ของเซิร์ฟเวอร์</p>,
      () => deleteMutation.mutate(),
      'danger',
      'ลบถาวร'
    );
  };

  const handleRegenerateKey = () => {
    showConfirmModal(
      'สร้าง API Key ใหม่?',
      <div className="space-y-2">
        <p>คุณกำลังจะสร้าง API Key ใหม่</p>
        <ul className="list-disc list-inside text-sm text-gray-400">
          <li>Key เก่าจะใช้งานไม่ได้ทันที</li>
          <li>ARK Plugin จะหยุดทำงานจนกว่าจะใส่ Key ใหม่</li>
          <li>IP Whitelist จะถูกรีเซ็ต</li>
        </ul>
      </div>,
      () => generateMutation.mutate(),
      'warning',
      'สร้างใหม่'
    );
  };

  const handleResetIp = () => {
    showConfirmModal(
      'รีเซ็ต IP Whitelist?',
      <p>Plugin จะต้องเชื่อมต่อใหม่เพื่อลงทะเบียน IP ใหม่ (อัตโนมัติ)</p>,
      () => resetIpMutation.mutate(),
      'warning',
      'รีเซ็ต IP'
    );
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 6) + '•'.repeat(24) + key.slice(-6);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Laser Flow Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-emerald-500/20 via-cyan-500/10 to-transparent blur-3xl animate-pulse"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-conic from-emerald-500/30 via-cyan-500/20 to-transparent blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-conic from-cyan-500/30 via-emerald-500/20 to-transparent blur-2xl"></div>
      </div>

      {/* Main Card */}
      <div className="relative bg-black/40 backdrop-blur-xl rounded-2xl border border-emerald-500/20 shadow-2xl shadow-emerald-500/10 overflow-hidden">
        {/* Laser Beam Header */}
        <div className="relative h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent blur-sm animate-pulse"></div>
        </div>

        {/* Header */}
        <div className="relative p-6 border-b border-emerald-500/10">
          <div className="flex items-center gap-4">
            {/* Glowing Icon */}
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/30 rounded-2xl blur-xl animate-pulse"></div>
              <div className="relative p-4 bg-gradient-to-br from-emerald-600/20 to-cyan-600/20 rounded-2xl border border-emerald-500/30">
                <Key className="h-8 w-8 text-emerald-400" />
              </div>
            </div>

            <div>
              <h3 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent animate-gradient">
                API Key Manager
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                เชื่อมต่อ ARK Server กับระบบ HeartShop
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Message Alert */}
          {message && (
            <div
              className={`relative p-4 rounded-xl border backdrop-blur-sm ${message.type === 'success'
                ? 'bg-green-500/10 border-green-500/30'
                : message.type === 'error'
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-blue-500/10 border-blue-500/30'
                }`}
            >
              <div className="flex items-start gap-3">
                {message.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${message.type === 'error' ? 'text-red-400' : 'text-blue-400'
                    }`} />
                )}
                <span className={`text-sm font-medium ${message.type === 'success' ? 'text-green-300' :
                  message.type === 'error' ? 'text-red-300' : 'text-blue-300'
                  }`}>
                  {message.text}
                </span>
              </div>
            </div>
          )}

          {apiKey ? (
            <div className="space-y-6">
              {/* API Key Display with Laser Effect */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-emerald-300 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Your API Key
                </label>

                <div className="relative group">
                  {/* Laser Glow Effect */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 rounded-2xl blur-lg opacity-25 group-hover:opacity-40 transition-opacity"></div>

                  {/* Key Container */}
                  <div className="relative flex gap-2">
                    <div className="flex-1 relative bg-black/60 backdrop-blur-sm border border-emerald-500/30 rounded-xl px-5 py-4 font-mono text-sm overflow-hidden">
                      {/* Inner Glow */}
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-emerald-500/5"></div>

                      <div className="relative flex items-center gap-3">
                        <Zap className="h-4 w-4 text-emerald-400" />
                        <span className={`${showKey ? 'text-emerald-300' : 'text-gray-400'} transition-colors`}>
                          {showKey ? apiKey : maskKey(apiKey)}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="relative px-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl transition-all hover:scale-105"
                      title={showKey ? 'ซ่อน Key' : 'แสดง Key'}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/0 via-emerald-600/20 to-emerald-600/0 blur-sm"></div>
                      {showKey ? (
                        <EyeOff className="relative h-5 w-5 text-emerald-300" />
                      ) : (
                        <Eye className="relative h-5 w-5 text-emerald-300" />
                      )}
                    </button>

                    <button
                      onClick={handleCopyKey}
                      className="relative px-4 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 rounded-xl transition-all hover:scale-105"
                      title="คัดลอก Key"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/0 via-cyan-600/20 to-cyan-600/0 blur-sm"></div>
                      <Copy className="relative h-5 w-5 text-cyan-300" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Server Connection Info */}
              {(apiKeyServerName || apiKeyServerMap) && (
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 rounded-xl blur opacity-25 group-hover:opacity-40 transition-opacity"></div>
                  <div className="relative bg-black/60 backdrop-blur-sm border border-green-500/30 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <Server className="h-5 w-5 text-green-400" />
                      </div>
                      <div>
                        <h4 className="font-bold text-green-300">เซิร์ฟเวอร์ที่เชื่อมต่อ</h4>
                        <p className="text-xs text-gray-400">ข้อมูลล่าสุดจาก Plugin</p>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                        <span className="text-xs text-green-400 font-medium">Online</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Server Name */}
                      <div className="bg-black/40 rounded-lg p-3 border border-green-500/20">
                        <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          Server Name
                        </label>
                        <span className="text-sm font-semibold text-green-300">
                          {apiKeyServerName || 'ไม่ทราบ'}
                        </span>
                      </div>

                      {/* Map */}
                      <div className="bg-black/40 rounded-lg p-3 border border-green-500/20">
                        <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                          <Map className="h-3 w-3" />
                          Map
                        </label>
                        <span className="text-sm font-semibold text-emerald-300">
                          {apiKeyServerMap || 'ไม่ทราบ'}
                        </span>
                      </div>

                      {/* Last Used */}
                      {apiKeyLastUsed && (
                        <div className="bg-black/40 rounded-lg p-3 border border-green-500/20">
                          <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            ใช้งานล่าสุด
                          </label>
                          <span className="text-sm font-semibold text-teal-300">
                            {new Date(apiKeyLastUsed).toLocaleString('th-TH', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Info Grid with Laser Style */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* IP Address */}
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition-opacity"></div>
                  <div className="relative bg-black/60 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-4">
                    <label className="block text-xs font-semibold text-emerald-300 mb-2 flex items-center gap-2">
                      <Wifi className="h-3.5 w-3.5" />
                      Registered IP
                    </label>
                    {apiKeyIp ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                        <span className="font-mono text-sm text-green-300">{apiKeyIp}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-gray-500 rounded-full"></div>
                        <span className="text-sm text-gray-400">รอการเชื่อมต่อ...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Created At */}
                {apiKeyCreatedAt && (
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 to-emerald-600 rounded-xl blur opacity-20 group-hover:opacity-30 transition-opacity"></div>
                    <div className="relative bg-black/60 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-4">
                      <label className="block text-xs font-semibold text-cyan-300 mb-2 flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        สร้างเมื่อ
                      </label>
                      <span className="text-sm text-gray-300">
                        {new Date(apiKeyCreatedAt).toLocaleString('th-TH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons with Laser Style */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-emerald-500/10">
                <button
                  onClick={handleRegenerateKey}
                  disabled={generateMutation.isPending}
                  className="relative flex-1 min-w-[140px] group"
                >
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <div className="relative px-6 py-3 bg-gradient-to-r from-emerald-600/20 to-cyan-600/20 hover:from-emerald-600/30 hover:to-cyan-600/30 border border-emerald-500/30 rounded-xl transition-all flex items-center justify-center gap-2">
                    {generateMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
                    ) : (
                      <Sparkles className="h-5 w-5 text-emerald-300" />
                    )}
                    <span className="font-semibold text-emerald-200">สร้าง Key ใหม่</span>
                  </div>
                </button>

                {userId && (
                  <button
                    onClick={() => downloadMutation.mutate({ userId })}
                    disabled={downloadMutation.isPending}
                    className="relative flex-1 min-w-[140px] group"
                  >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <div className="relative px-6 py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded-xl transition-all flex items-center justify-center gap-2">
                      {downloadMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
                      ) : (
                        <Download className="h-5 w-5 text-emerald-300" />
                      )}
                      <span className="font-semibold text-emerald-200">Download Plugin</span>
                    </div>
                  </button>
                )}

                {apiKeyIp && (
                  <button
                    onClick={handleResetIp}
                    disabled={resetIpMutation.isPending}
                    className="relative flex-1 min-w-[140px] group"
                  >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 to-emerald-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
                    <div className="relative px-6 py-3 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 rounded-xl transition-all flex items-center justify-center gap-2">
                      {resetIpMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                      ) : (
                        <RefreshCw className="h-5 w-5 text-cyan-300" />
                      )}
                      <span className="font-semibold text-cyan-200">รีเซ็ต IP</span>
                    </div>
                  </button>
                )}

                <button
                  onClick={handleDeleteKey}
                  disabled={deleteMutation.isPending}
                  className="relative group"
                >
                  <div className="absolute -inset-0.5 bg-red-600 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
                  <div className="relative px-6 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-xl transition-all">
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin text-red-300" />
                    ) : (
                      <Trash2 className="h-5 w-5 text-red-300" />
                    )}
                  </div>
                </button>
              </div>

              {/* Usage Instructions with Laser Style */}
              <div className="relative group mt-6">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-emerald-600 to-cyan-600 rounded-xl blur opacity-20"></div>
                <div className="relative bg-black/40 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-5">
                  <h4 className="font-bold text-sm mb-3 flex items-center gap-2 text-emerald-300">
                    <Sparkles className="h-4 w-4" />
                    วิธีใช้งาน
                  </h4>
                  <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside marker:text-emerald-400 marker:font-bold">
                    <li>คัดลอก API Key ด้านบนโดยกดปุ่ม <Copy className="h-3 w-3 inline text-cyan-400" /></li>
                    <li>
                      เปิดไฟล์{' '}
                      <code className="px-2 py-1 bg-emerald-500/20 rounded text-xs text-emerald-300 font-mono border border-emerald-500/30">
                        ark-plugin/config.json
                      </code>
                    </li>
                    <li>
                      วาง API Key ลงในช่อง{' '}
                      <code className="px-2 py-1 bg-cyan-500/20 rounded text-xs text-cyan-300 font-mono border border-cyan-500/30">
                        "ApiKey"
                      </code>
                    </li>
                    <li>บันทึกไฟล์และรีสตาร์ท ARK Server</li>
                    <li className="text-green-400">✨ IP จะถูกบันทึกอัตโนมัติเมื่อ Plugin เชื่อมต่อครั้งแรก!</li>
                  </ol>
                </div>
              </div>
            </div>
          ) : (
            /* No API Key State - Laser Style */
            <div className="text-center py-16">
              {/* Glowing Icon */}
              <div className="relative inline-block mb-8">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 rounded-full blur-3xl opacity-30 animate-pulse"></div>
                <div className="relative p-8 bg-gradient-to-br from-emerald-600/10 to-cyan-600/10 rounded-full border-2 border-emerald-500/30">
                  <Key className="h-20 w-20 text-emerald-400" />
                </div>
              </div>

              <h4 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent mb-3">
                ยังไม่มี API Key
              </h4>
              <p className="text-gray-400 mb-10 max-w-md mx-auto">
                สร้าง API Key เพื่อเชื่อมต่อ ARK Server Plugin กับระบบ HeartShop
              </p>

              {/* Generate Button - Laser Style */}
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="relative group"
              >
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-cyan-600 to-emerald-600 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity animate-pulse"></div>
                <div className="relative px-10 py-4 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 rounded-2xl transition-all flex items-center gap-3 shadow-2xl shadow-emerald-500/50">
                  {generateMutation.isPending ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : (
                    <Sparkles className="h-6 w-6 text-white" />
                  )}
                  <span className="font-bold text-lg text-white">สร้าง API Key</span>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="relative h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400 to-transparent blur-sm animate-pulse"></div>
        </div>
      </div>

      <LaserModal
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        variant={modalConfig.variant as any}
        confirmText={modalConfig.confirmText}
      >
        {modalConfig.content}
      </LaserModal>
    </div>
  );
}
