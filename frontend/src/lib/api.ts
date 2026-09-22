import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if not already on login/auth pages and visiting a protected route
      if (typeof window !== 'undefined') {
        const currentPath = window.location.pathname;
        const authPaths = ['/login', '/auth/callback', '/auth/link-steam'];
        const protectedPrefixes = ['/orders', '/admin', '/market/my-listings', '/market/my-purchases'];

        const isProtected = protectedPrefixes.some(prefix => currentPath.startsWith(prefix));
        const isAuthPath = authPaths.some(path => currentPath.startsWith(path));

        if (isProtected && !isAuthPath) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  linkSteam: (steamId: string) => api.post('/auth/link-steam', { steamId }),
  unlinkSteam: () => api.post('/auth/unlink-steam'), // placeholder for unlink steam
  unlinkEpic: () => api.post('/auth/unlink-epic'),   // placeholder for unlink epic
};

// Wallet API
export const walletApi = {
  getBalance: () => api.get('/wallet'),
  getTransactions: (page = 1, limit = 10) => api.get('/wallet/transactions', { params: { page, limit } }),
};


// User API
export const userApi = {
  getProfile: () => api.get('/users/profile'),
  getPoints: () => api.get('/users/points'),
  getPointsHistory: (page = 1) => api.get(`/users/points/history?page=${page}`),
  claimPoints: () => api.post('/users/points/claim'),

  // User API Key Management
  getUserProfile: () => api.get('/user/profile'),
  generateApiKey: () => api.post('/user/generate-key'),
  resetIp: () => api.post('/user/reset-ip'),
  deleteApiKey: () => api.delete('/user/api-key'),
};

// Product API
export const productApi = {
  getAll: (params?: Record<string, any>) => api.get('/products', { params }),
  getFeatured: () => api.get('/products/featured'),
  getCategories: () => api.get('/products/categories'),
  getById: (id: number) => api.get(`/products/${id}`),
};

// Order API
export const orderApi = {
  create: (data: { productId: number; serverId: number; quantity?: number }) =>
    api.post('/orders', data),
  getAll: (page = 1, status?: string) =>
    api.get('/orders', { params: { page, status } }),
  getById: (id: string) => api.get(`/orders/${id}`),
};

// Admin API
export const adminApi = {
  // Dashboard
  getStats: () => api.get('/admin/stats'),

  // Users
  getUsers: (page = 1, search?: string) =>
    api.get('/admin/users', { params: { page, search } }),
  getUserById: (id: string) => api.get(`/admin/users/${id}`),
  updateUser: (id: string, data: { isBanned?: boolean; isAdmin?: boolean }) =>
    api.put(`/admin/users/${id}`, data),
  updateUserRole: (id: string, role: string) =>
    api.put(`/admin/users/${id}/role`, { role }),
  adjustPoints: (id: string, amount: number, reason?: string) =>
    api.post(`/admin/users/${id}/points`, { amount, reason }),

  // Products
  getProducts: () => api.get('/admin/products'),
  createProduct: (data: any) => api.post('/admin/products', data),
  updateProduct: (id: number, data: any) => api.put(`/admin/products/${id}`, data),
  deleteProduct: (id: number) => api.delete(`/admin/products/${id}`),

  // Categories
  createCategory: (data: any) => api.post('/admin/categories', data),
  updateCategory: (id: number, data: any) => api.put(`/admin/categories/${id}`, data),
  deleteCategory: (id: number) => api.delete(`/admin/categories/${id}`),

  // Orders
  getAllOrders: (page = 1, status?: string) =>
    api.get('/admin/orders', { params: { page, status } }),
  refundOrder: (id: string) => api.post(`/admin/orders/${id}/refund`),

  // Servers
  getServers: () => api.get('/admin/servers'),
  createServer: (data: { name: string; map?: string; webhookUrl?: string }) =>
    api.post('/admin/servers', data),
  updateServer: (id: number, data: any) => api.put(`/admin/servers/${id}`, data),
  deleteServer: (id: number) => api.delete(`/admin/servers/${id}`),
  regenerateServerKey: (id: number) => api.post(`/admin/servers/${id}/regenerate-key`),

  // Chat Ranks
  getChatRanks: (params?: { serverId?: number }) =>
    api.get('/admin/chat-ranks', { params }),
  createChatRank: (data: any) => api.post('/admin/chat-ranks', data),
  updateChatRank: (id: number, data: any) => api.put(`/admin/chat-ranks/${id}`, data),
  deleteChatRank: (id: number) => api.delete(`/admin/chat-ranks/${id}`),

  // Audit Logs
  getAuditLogs: (params?: { userId?: string; action?: string; resource?: string; page?: number }) =>
    api.get('/audit/logs', { params }),
  getSecurityEvents: (params?: { eventType?: string; severity?: string; page?: number }) =>
    api.get('/audit/security', { params }),
  getSecurityStats: () => api.get('/audit/security/stats'),

  // Data Requests (PDPA)
  getDataRequests: (params?: { status?: string; page?: number }) =>
    api.get('/pdpa/admin/requests', { params }),
  processDataRequest: (id: number, status: string, response?: string) =>
    api.patch(`/pdpa/admin/requests/${id}`, { status, response }),
  createPolicy: (data: { type: string; version: string; content: string; contentTh?: string; effectiveAt: string }) =>
    api.post('/pdpa/admin/policy', data),

  // Plugin Management
  getPluginStatus: () => api.get('/admin/plugin/status'),
  compilePlugin: () => api.post('/admin/plugin/compile'),

  // API Keys Management
  getApiKeys: (page = 1, search?: string) =>
    api.get('/admin/api-keys', { params: { page, search } }),
  getApiKeyByUser: (userId: string) => api.get(`/admin/api-keys/${userId}`),
  resetApiKeyIp: (userId: string) => api.post(`/admin/api-keys/${userId}/reset-ip`),
  revokeApiKey: (userId: string) => api.delete(`/admin/api-keys/${userId}`),
  downloadPlugin: (userId: string, serverId?: number) => {
    const params = serverId ? `?serverId=${serverId}` : '';
    return api.get(`/admin/api-keys/${userId}/download-plugin${params}`, {
      responseType: 'blob',
    });
  },
};

// Content Builder API
export const contentApi = {
  // Public
  getBlockTypes: () => api.get('/content/block-types'),
  getPublicPages: () => api.get('/content/pages'),
  getPublicPageBySlug: (slug: string) => api.get(`/content/pages/slug/${slug}`),

  // Admin - Pages
  getPages: (params?: { pageType?: string; search?: string; page?: number }) =>
    api.get('/content/admin/pages', { params }),
  getPageById: (id: number) => api.get(`/content/admin/pages/${id}`),
  createPage: (data: {
    slug: string;
    title: string;
    description?: string;
    pageType?: string;
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
    layout?: string;
    settings?: any;
  }) => api.post('/content/admin/pages', data),
  updatePage: (id: number, data: any) => api.put(`/content/admin/pages/${id}`, data),
  deletePage: (id: number) => api.delete(`/content/admin/pages/${id}`),
  duplicatePage: (id: number, data?: { newSlug?: string; newTitle?: string }) =>
    api.post(`/content/admin/pages/${id}/duplicate`, data),

  // Admin - Blocks
  getBlocks: (pageId: number) => api.get(`/content/admin/pages/${pageId}/blocks`),
  createBlock: (pageId: number, data: {
    blockType: string;
    content: any;
    settings?: any;
    sortOrder?: number;
    isVisible?: boolean;
  }) => api.post(`/content/admin/pages/${pageId}/blocks`, data),
  updateBlock: (blockId: number, data: any) => api.put(`/content/admin/blocks/${blockId}`, data),
  deleteBlock: (blockId: number) => api.delete(`/content/admin/blocks/${blockId}`),
  reorderBlocks: (pageId: number, blockOrders: { id: number; sortOrder: number }[]) =>
    api.post(`/content/admin/pages/${pageId}/blocks/reorder`, { blockOrders }),

  // Admin - Media
  getMediaFiles: (params?: { folder?: string; mimeType?: string; search?: string; page?: number }) =>
    api.get('/content/admin/media', { params }),
  getFolders: () => api.get('/content/admin/media/folders'),
  uploadMedia: (file: File, data?: { alt?: string; caption?: string; folder?: string }) => {
    const formData = new FormData();
    formData.append('file', file);
    if (data?.alt) formData.append('alt', data.alt);
    if (data?.caption) formData.append('caption', data.caption);
    if (data?.folder) formData.append('folder', data.folder);
    return api.post('/content/admin/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  updateMedia: (id: number, data: { alt?: string; caption?: string; folder?: string }) =>
    api.put(`/content/admin/media/${id}`, data),
  deleteMedia: (id: number) => api.delete(`/content/admin/media/${id}`),
};

// Protection API
export const protectionApi = {
  // User - Get my protection status
  getMyProtection: () => api.get('/protection/me'),
};

// Admin Protection API
export const protectionAdminApi = {
  // Get all protections
  getProtections: (params?: { type?: string; isActive?: string; page?: number; limit?: number }) =>
    api.get('/admin/protection', { params }),

  // Grant protection
  grantProtection: (data: {
    steamId: string;
    protectionDays: number;
    reason?: string;
    protectTribe?: boolean;
    tribeId?: string;
    tribeName?: string;
    serverId?: number;
  }) => api.post('/admin/protection/grant', data),

  // Revoke protection
  revokeProtection: (steamId: string, data?: { reason?: string; revokeTribe?: boolean }) =>
    api.delete(`/admin/protection/${steamId}`, { data }),

  // Get protection logs
  getLogs: (params?: { eventType?: string; steamId?: string; serverId?: number; page?: number; limit?: number }) =>
    api.get('/admin/protection/logs', { params }),

  // Get protection stats
  getStats: () => api.get('/admin/protection/stats'),
};

// Dino Marketplace API
export const dinoMarketApi = {
  // Public
  getListings: (params?: {
    species?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    minLevel?: number;
    maxLevel?: number;
    gender?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) => api.get('/market/listings', { params }),
  getListingById: (id: string) => api.get(`/market/listings/${id}`),
  getSpeciesList: () => api.get('/market/species'),
  getStats: () => api.get('/market/stats'),
  getDeliveryServers: () => api.get('/servers'),

  // Authenticated
  getMyListings: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/market/my/listings', { params }),
  getMyPurchases: (params?: { page?: number; limit?: number }) =>
    api.get('/market/my/purchases', { params }),
  cancelListing: (id: string) => api.post(`/market/listings/${id}/cancel`),
  buyDino: (id: string, serverId: number) => api.post(`/market/listings/${id}/buy`, { serverId }),
};

// PDPA API
export const pdpaApi = {
  // Policy
  getPolicy: (type: string) => api.get(`/pdpa/policy/${type}`),

  // Consents
  getConsents: () => api.get('/pdpa/consents'),
  grantConsent: (consentType: string, version: string) =>
    api.post('/pdpa/consents/grant', { consentType, version }),
  revokeConsent: (consentType: string) =>
    api.post('/pdpa/consents/revoke', { consentType }),

  // Data Requests
  getMyRequests: () => api.get('/pdpa/requests'),
  createRequest: (requestType: string, description?: string) =>
    api.post('/pdpa/requests', { requestType, description }),

  // Export/Delete
  exportData: () => api.get('/pdpa/export'),
  deleteData: (confirmation: string) =>
    api.post('/pdpa/delete', { confirmation }),
};

// Payment API
export const paymentApi = {
  getPackages: () => api.get('/payments/packages').then((r) => r.data),
  createIntent: (payload: { packageId: string; provider: string; autoCredit?: boolean }, idempotencyKey?: string) => {
    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `topup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    return api
      .post('/payments/intents', payload, {
        headers: { 'Idempotency-Key': key },
      })
      .then((r) => r.data);
  },
  submitSlip: (payload: any) => api.post('/payments/slips', payload).then((r) => r.data),
  verifyStripeSession: (sessionId: string) => api.post('/payments/verify-session', { sessionId }).then((r) => r.data),
};

export default api;
