'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Send, Globe, Server, User } from 'lucide-react';
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

const SOURCE_ICONS = {
  game: '🎮',
  discord: '💬',
  web: '🌐',
};

const SOURCE_COLORS = {
  game: 'text-green-400',
  discord: 'text-indigo-400',
  web: 'text-blue-400',
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const [servers, setServers] = useState<ChatServer[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check login status
  useEffect(() => {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('token='));
    setIsLoggedIn(!!token);
  }, []);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !isLoggedIn) return;

    sendChatMessage(inputValue.trim(), selectedServer);
    setInputValue('');
  }, [inputValue, selectedServer, isLoggedIn]);

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
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-gradient-to-r from-emerald-600 to-blue-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
        title="Open Chat"
      >
        <MessageSquare size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 h-[500px] bg-gray-900/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600/20 to-blue-600/20 p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} className="text-emerald-400" />
            <h3 className="font-semibold text-white">Cross-Chat</h3>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Server tabs */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedServer(null)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
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
              key={server.id}
              onClick={() => setSelectedServer(server.id)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
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
            <p className="text-sm">No messages yet</p>
            <p className="text-xs">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="group">
              <div className="flex items-start gap-2">
                {/* Avatar or icon */}
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                  {msg.senderAvatar ? (
                    <img
                      src={msg.senderAvatar}
                      alt={msg.senderName}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <span className="text-lg">{SOURCE_ICONS[msg.source]}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Server/Source tag */}
                    {msg.source === 'game' && msg.serverName && (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                        {msg.serverName}
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
                    <span className={`font-medium text-sm ${SOURCE_COLORS[msg.source]}`}>
                      {msg.senderName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm break-words">{msg.content}</p>
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
              placeholder="Type a message..."
              maxLength={500}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-gray-400 text-sm">
              <User size={16} className="inline mr-1" />
              Login to send messages
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
