'use client';
import { T, useLanguage } from '@/components/i18n/LanguageProvider';


import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Send, Globe, Server, User } from 'lucide-react';
import {
  connectSocket,
  joinChatRoom,
  useSocketStatus,
  sendChatMessage,
  onChatMessage,
  onChatHistory,
  onChatError,
  onSocketEvent,
  leaveChatRoom,
  ChatMessage,
} from '@/lib/socket';
import { useAuthStore } from '@/lib/store';
import { VipAvatar, VipBadgePill } from '@/components/vip/VipAvatar';
import { useVipBadges } from '@/hooks/useVipBadges';
import { toVipBadge } from '@/lib/vip';
import { api } from '@/lib/api';

interface ChatServer {
  id: number;
  name: string;
  map?: string;
}

const SOURCE_ICONS = {
  game: 'GAME',
  discord: 'DISCORD',
  web: 'WEB',
};

const SOURCE_COLORS = {
  game: 'text-green-400',
  discord: 'text-indigo-400',
  web: 'text-blue-400',
};

const ARK_CHAT_ICON = '/images/catalog/ark/items/primalitemtrophy_arklogo.webp';
const safeRankColor = (message: ChatMessage) => /^#[0-9a-f]{6}$/i.test(message.playerRank?.color || '')
  ? message.playerRank!.color : undefined;

export default function ChatWidget() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [servers, setServers] = useState<ChatServer[]>([]);
  const isConnected = useSocketStatus((state) => state.status === 'connected');
  // The session cookie is httpOnly, so login state comes from the auth store.
  const isLoggedIn = useAuthStore((state) => Boolean(state.user));
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const deletedIds = useRef(new Set<string>());
  // VIP frames: a message may carry `vip` (backend), else look up web users by id.
  const badges = useVipBadges(
    messages.filter((m) => m.senderType === 'web_user' && m.vip === undefined).map((m) => m.senderId),
    isOpen,
  );
  const badgeOf = (m: ChatMessage) => {
    const own = m.vip;
    return own !== undefined ? toVipBadge(own) : m.senderType === 'web_user' ? (badges.get(m.senderId) ?? null) : null;
  };

  // Fetch servers
  useEffect(() => {
    api.get('/chat/servers')
      .then(({ data }) => {
        if (data.success) {
          setServers(data.servers);
        }
      })
      .catch(console.error);
  }, []);

  // Connect socket when widget opens
  useEffect(() => {
    if (!isOpen) return;

    // Shared, cookie-authenticated connection (see lib/socket.ts).
    connectSocket();

    // Keep live messages received while the history query is in flight.
    const receivedIds = new Set<string>();
    const unsubMessage = onChatMessage((msg) => {
      if (selectedServer !== null && msg.serverId !== selectedServer) return;
      if (deletedIds.current.has(msg.id)) return;
      receivedIds.add(msg.id);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg].slice(-200));
    });

    const unsubHistory = onChatHistory(({ messages: history, serverId }) => {
      if ((serverId ?? null) !== selectedServer) return;
      setMessages(prev => {
        const byId = new Map(history.filter(m => !deletedIds.current.has(m.id)).map(m => [m.id, m]));
        for (const m of prev) if (receivedIds.has(m.id) && !deletedIds.current.has(m.id)) byId.set(m.id, m);
        return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-200);
      });
    });
    const unsubDeleted = onSocketEvent<{ id: string }>('chat:deleted', ({ id }) => {
      deletedIds.current.add(id);
      setMessages(prev => prev.filter(m => m.id !== id));
    });

    const unsubError = onChatError(({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    joinChatRoom(selectedServer ?? undefined);
    return () => {
      unsubMessage();
      unsubHistory();
      unsubError();
      unsubDeleted();
      leaveChatRoom(selectedServer ?? undefined);
    };
  }, [isOpen, selectedServer]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !isLoggedIn || !isConnected) return;

    sendChatMessage(inputValue.trim(), selectedServer);
    setInputValue('');
  }, [inputValue, selectedServer, isLoggedIn, isConnected]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="tk-chat-launch"
        title="Open Chat"
        aria-label="เปิดหน้าต่างแชท"
      >
        <MessageSquare size={24} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="tek-frame fixed bottom-[5.5rem] right-4 min-[821px]:bottom-4 z-50 w-[min(24rem,calc(100vw-2rem))] h-[min(500px,calc(100dvh-7.5rem))] min-[821px]:h-[min(500px,calc(100dvh-2rem))] bg-surface-1 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.98)] border border-cyan-500/40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-surface-2 p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/brand/iris-emblem-v1.webp" alt="IRIS Thailand" width={30} height={30} className="h-8 w-8 object-contain" />
            <div><h3 className="font-semibold text-white">IRIS Cross-Chat</h3><p className="text-[10px] tracking-wide text-cyan-100/60">ARK · Discord · Web</p></div>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center text-gray-300 hover:text-white transition-colors"
            aria-label="ปิดหน้าต่างแชท"
          >
            <X size={20} />
          </button>
        </div>

        {/* Server tabs */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => { setMessages([]); setSelectedServer(null); }}
            className={`flex min-h-11 items-center gap-1.5 px-4 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
              selectedServer === null
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Globe size={12} />
            Global
          </button>
          {servers.map((server) => (
            <button
              type="button"
              key={server.id}
              onClick={() => { setMessages([]); setSelectedServer(server.id); }}
              className={`flex min-h-11 items-center gap-1.5 px-4 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                selectedServer === server.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Server size={12} />
              {server.name}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm"><T text={"ยังไม่มีข้อความในห้องนี้"} /></p>
            <p className="text-xs"><T text={"พูดคุยกับผู้เล่นผ่าน ARK, Discord และเว็บได้ที่นี่"} /></p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`group rounded-xl border p-2.5 ${badgeOf(msg) ? 'border-amber-300/20 bg-amber-300/5' : 'border-white/5 bg-white/[0.025]'}`}>
              <div className="flex items-start gap-2">
                {/* Avatar or icon */}
                <VipAvatar
                  size={32}
                  src={msg.senderAvatar}
                  name={msg.senderName}
                  vip={badgeOf(msg)}
                  showLabel={false}
                  plainClassName="bg-surface-3"
                  fallback={msg.source === 'game' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ARK_CHAT_ICON} alt="ARK" width={28} height={28} className="h-7 w-7 object-contain" />
                  ) : <span className="text-[9px] font-bold tracking-widest">{SOURCE_ICONS[msg.source]}</span>}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Server/Source tag */}
                    {msg.source === 'game' && msg.serverName && (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                        ARK · {msg.serverStyle?.chatTag || msg.serverName}
                      </span>
                    )}
                    {msg.source === 'discord' && (
                      <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded">
                        Discord
                      </span>
                    )}
                    {msg.source === 'web' && (
                      <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                        Web
                      </span>
                    )}
                    {msg.playerRank && msg.playerRank.name !== badgeOf(msg)?.label && (
                      <span className="rounded border px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: safeRankColor(msg), borderColor: safeRankColor(msg) }}>
                        {msg.playerRank.name}
                      </span>
                    )}
                    <span className={`font-medium text-sm ${badgeOf(msg) ? 'text-amber-200' : SOURCE_COLORS[msg.source]}`} style={{ color: badgeOf(msg) ? undefined : safeRankColor(msg) }}>
                      {msg.senderName}
                    </span>
                    <VipBadgePill vip={badgeOf(msg)} />
                    <span className="text-xs text-gray-500">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed break-words ${badgeOf(msg) ? 'text-amber-100' : 'text-slate-200'}`} style={{ color: badgeOf(msg) ? undefined : safeRankColor(msg) }}>{msg.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-700/50">
        {isLoggedIn ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('ส่งข้อความถึงผู้เล่นในคลัสเตอร์…', 'Message players in the cluster...')}
              maxLength={500}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputValue.trim() || !isConnected}
              aria-label="ส่งข้อความ"
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-gray-400 text-sm">
              <User size={16} className="inline mr-1" /><T text={"เข้าสู่ระบบเพื่อส่งข้อความ"} /></p>
          </div>
        )}
      </div>
    </div>
  );
}
