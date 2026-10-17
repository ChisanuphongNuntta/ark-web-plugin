'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { IconButton, SegmentedControl, useIsClient } from '@/components/ui';
import {
  connectSocket,
  disconnectSocket,
  joinChatRoom,
  sendChatMessage,
  onChatMessage,
  onChatHistory,
  onChatError,
  ChatMessage,
} from '@/lib/socket';

interface ChatServer {
  id: number;
  name: string;
  map?: string;
}

const SOURCE_LABEL: Record<ChatMessage['source'], string> = {
  game: 'ในเกม',
  discord: 'Discord',
  web: 'เว็บ',
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [servers, setServers] = useState<ChatServer[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const isClient = useIsClient();
  // Read on render (client only) so login/logout in another tab is picked up on the next render.
  const isLoggedIn = isClient && document.cookie.split(';').some((c) => c.trim().startsWith('token='));
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Only return focus to the launcher after the panel was open (not on first mount).
  const wasOpenRef = useRef(false);

  // Non-modal panel: move focus in on open, back to the launcher on close.
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      (inputRef.current ?? closeRef.current)?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  const close = useCallback(() => setIsOpen(false), []);

  // Fetch servers
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/servers`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setServers(data.servers);
        }
      })
      .catch(console.error);
  }, []);

  // Connect socket when widget opens
  useEffect(() => {
    if (!isOpen) return;

    const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    const socket = connectSocket(token);

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Join selected room
    joinChatRoom(selectedServer ?? undefined);

    // Setup listeners
    const unsubMessage = onChatMessage((msg) => {
      setMessages(prev => [...prev, msg]);
    });

    const unsubHistory = onChatHistory(({ messages: history }) => {
      setMessages(history);
    });

    const unsubError = onChatError(({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    return () => {
      unsubMessage();
      unsubHistory();
      unsubError();
    };
  }, [isOpen, selectedServer]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !isLoggedIn) return;

    sendChatMessage(inputValue.trim(), selectedServer);
    setInputValue('');
  }, [inputValue, selectedServer, isLoggedIn]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  const roomOptions = [
    { value: 'all', label: 'ทุกเซิร์ฟเวอร์' },
    ...servers.map((server) => ({ value: String(server.id), label: server.name })),
  ];

  if (!isOpen) {
    return (
      <IconButton
        ref={launcherRef}
        variant="secondary"
        size="lg"
        onClick={() => setIsOpen(true)}
        aria-label="เปิดแชท"
        className="fixed bottom-4 right-4 z-overlay bg-surface"
      >
        <MessageSquare className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
      </IconButton>
    );
  }

  return (
    <section
      aria-label="แชทรวม"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
      className="fixed bottom-4 left-4 right-4 z-overlay flex h-[min(480px,calc(100dvh-6rem))] flex-col overflow-hidden rounded-card border border-line-strong bg-surface shadow-overlay sm:left-auto sm:w-96"
    >
      <header className="border-b border-line px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">แชทรวม</h2>
            <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-success' : 'bg-fg-subtle'}`}
              />
              {isConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ'}
            </span>
          </div>
          <IconButton ref={closeRef} size="sm" onClick={close} aria-label="ปิดแชท">
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
        </div>

        <SegmentedControl
          aria-label="ห้องแชท"
          size="sm"
          value={selectedServer === null ? 'all' : String(selectedServer)}
          onChange={(v) => setSelectedServer(v === 'all' ? null : Number(v))}
          options={roomOptions}
          className="mb-3 mt-2"
        />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-fg-muted">ยังไม่มีข้อความในห้องนี้</p>
            <p className="mt-1 text-xs text-fg-subtle">ข้อความจากในเกม Discord และเว็บจะแสดงที่นี่</p>
          </div>
        ) : (
          messages.map((msg) => (
            <article key={msg.id} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 text-xs text-fg-muted">
                {msg.senderAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={msg.senderAvatar} alt="" className="h-8 w-8 object-cover" />
                ) : (
                  <span aria-hidden="true">{msg.senderName?.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-fg">{msg.senderName}</span>
                  <span className="text-xs text-fg-subtle">
                    {msg.source === 'game' && msg.serverName ? msg.serverName : SOURCE_LABEL[msg.source]}
                  </span>
                  <time className="font-mono text-xs tabular-nums text-fg-subtle" dateTime={msg.createdAt}>
                    {formatTime(msg.createdAt)}
                  </time>
                </div>
                <p className="mt-0.5 break-words text-sm text-fg-muted">{msg.content}</p>
              </div>
            </article>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p role="alert" className="mx-4 mb-2 rounded-control border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <footer className="border-t border-line p-3">
        {isLoggedIn ? (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="พิมพ์ข้อความ"
              aria-label="ข้อความ"
              maxLength={500}
              className="h-10 min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-fast focus:border-accent"
            />
            <IconButton
              variant="primary"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              aria-label="ส่งข้อความ"
            >
              <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </IconButton>
          </div>
        ) : (
          <p className="py-1 text-center text-xs text-fg-muted">เข้าสู่ระบบเพื่อส่งข้อความ</p>
        )}
      </footer>
    </section>
  );
}
