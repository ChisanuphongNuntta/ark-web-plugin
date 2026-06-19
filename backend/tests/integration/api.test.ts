/**
 * Integration tests against the live API at https://localhost
 * Requires the production stack to be running: docker compose --env-file .env.prod --profile prod up -d
 */
import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_API_URL || 'https://localhost';

// Disable TLS verification for localhost self-signed cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

// ─── Health ───────────────────────────────────────────────────────────────────

describe('Health Check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const { status, body } = await api('/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

// ─── Products (public endpoints) ─────────────────────────────────────────────

describe('Products API', () => {
  it('GET /api/products returns paginated list', async () => {
    const { status, body } = await api('/api/products');
    expect(status).toBe(200);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(typeof body.pagination.total).toBe('number');
  });

  it('GET /api/products supports pagination params', async () => {
    const { status, body } = await api('/api/products?page=1&limit=5');
    expect(status).toBe(200);
    expect(body.products.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/products/:id returns 404 for nonexistent product', async () => {
    const { status } = await api('/api/products/999999');
    expect(status).toBe(404);
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Auth API', () => {
  it('GET /api/auth/discord redirects to Discord OAuth', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/discord`, { redirect: 'manual' });
    expect([301, 302, 307, 308]).toContain(res.status);
    const location = res.headers.get('location') || '';
    expect(location).toContain('discord.com');
  });

  it('GET /api/auth/me returns 401 without token', async () => {
    const { status } = await api('/api/auth/me');
    expect(status).toBe(401);
  });

  it('POST /api/auth/logout returns 200', async () => {
    const { status } = await api('/api/auth/logout', { method: 'POST' });
    expect(status).toBe(200);
  });
});

// ─── Auth-protected endpoints return 401 ─────────────────────────────────────

describe('Auth-protected Endpoints (must return 401)', () => {
  const protectedEndpoints: [string, string, object?][] = [
    ['GET',  '/api/orders'],
    ['POST', '/api/orders', { productId: 1, quantity: 1, serverId: 1 }],
    ['GET',  '/api/users/me'],
    ['GET',  '/api/admin/users'],
    ['GET',  '/api/admin/products'],
    ['GET',  '/api/admin/servers'],
    ['GET',  '/api/protection/me'],
    ['POST', '/api/pdpa/consent', { consentType: 'privacy_policy', granted: true }],
    ['GET',  '/api/market/my/listings'],
  ];

  for (const [method, path, body] of protectedEndpoints) {
    it(`${method} ${path} returns 401 without auth`, async () => {
      const { status } = await api(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      expect(status).toBe(401);
    });
  }
});

// ─── Plugin API ───────────────────────────────────────────────────────────────

describe('Plugin API', () => {
  it('GET /api/plugin/orders/pending without API key returns 401', async () => {
    const { status } = await api('/api/plugin/orders/pending');
    expect(status).toBe(401);
  });

  it('GET /api/plugin/orders/pending with wrong API key returns 401', async () => {
    const { status } = await api('/api/plugin/orders/pending', {
      headers: { 'x-api-key': 'invalid-key', 'x-server-id': '1' },
    });
    expect(status).toBe(401);
  });

  it('POST /api/plugin/heartbeat without API key returns 401', async () => {
    const { status } = await api('/api/plugin/heartbeat', { method: 'POST' });
    expect(status).toBe(401);
  });

  it('POST /api/plugin/stats without API key returns 401', async () => {
    const { status } = await api('/api/plugin/stats', { method: 'POST' });
    expect(status).toBe(401);
  });
});

// ─── Public Content APIs ──────────────────────────────────────────────────────

describe('Content API', () => {
  it('GET /api/content/pages returns published pages list', async () => {
    const { status, body } = await api('/api/content/pages');
    expect(status).toBe(200);
    expect(Array.isArray(body.pages)).toBe(true);
  });
});

describe('Market API', () => {
  it('GET /api/market/listings returns dino listings', async () => {
    const { status, body } = await api('/api/market/listings');
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });

  it('GET /api/market/species returns available species', async () => {
    const { status } = await api('/api/market/species');
    expect(status).toBe(200);
  });
});

// ─── Security Headers ─────────────────────────────────────────────────────────

describe('Security Headers', () => {
  it('API responses include x-content-type-options: nosniff', async () => {
    const res = await fetch(`${BASE_URL}/api/products`);
    const header = res.headers.get('x-content-type-options') || '';
    // Nginx + Express both add this header, so it may appear as 'nosniff, nosniff'
    expect(header).toContain('nosniff');
  });

  it('API responses include x-frame-options header', async () => {
    const res = await fetch(`${BASE_URL}/api/products`);
    expect(res.headers.get('x-frame-options')).toBeTruthy();
  });

  it('CORS rejects requests from unauthorized origins', async () => {
    const res = await fetch(`${BASE_URL}/api/products`, {
      headers: { 'Origin': 'https://evil.com' },
    });
    const corsHeader = res.headers.get('access-control-allow-origin');
    // Should NOT reflect evil.com
    expect(corsHeader).not.toBe('https://evil.com');
  });
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────

describe('Rate Limit Headers', () => {
  it('API responses include rate limit headers (X-RateLimit-* or RateLimit-*)', async () => {
    const res = await fetch(`${BASE_URL}/api/products`);
    const hasXRateLimit = !!res.headers.get('x-ratelimit-limit');
    const hasRateLimit   = !!res.headers.get('ratelimit-limit');
    expect(hasXRateLimit || hasRateLimit).toBe(true);
  });
});

// ─── 404 Handling ─────────────────────────────────────────────────────────────

describe('404 Handling', () => {
  it('unknown routes return 404', async () => {
    const { status } = await api('/api/does-not-exist-xyz');
    expect(status).toBe(404);
  });
});
