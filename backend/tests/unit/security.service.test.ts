import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityEventTypes, SecuritySeverity } from '../../src/services/security.service.js';

// Import after mocks are set up via setup.ts
const { default: securityService } = await import('../../src/services/security.service.js');
const { default: prisma } = await import('../../src/config/database.js');

const mockReq = () => ({
  headers: { 'user-agent': 'test-agent' },
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
} as any);

describe('SecurityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.securityEvent.create as any).mockResolvedValue({ id: '1' });
    (prisma.securityEvent.count as any).mockResolvedValue(0);
    (prisma.securityEvent.findMany as any).mockResolvedValue([]);
  });

  describe('logEvent', () => {
    it('creates a security event in the database', async () => {
      await securityService.logEvent({
        eventType: SecurityEventTypes.LOGIN_SUCCESS,
        severity: SecuritySeverity.INFO,
        userId: 'user-123',
        description: 'Test login',
      }, mockReq());

      expect(prisma.securityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: SecurityEventTypes.LOGIN_SUCCESS,
            severity: SecuritySeverity.INFO,
            userId: 'user-123',
          }),
        })
      );
    });

    it('does not throw when database fails', async () => {
      (prisma.securityEvent.create as any).mockRejectedValue(new Error('DB error'));
      await expect(securityService.logEvent({
        eventType: SecurityEventTypes.LOGIN_FAILED,
        description: 'Test',
      })).resolves.not.toThrow();
    });

    it('calls webhook for CRITICAL events when SLACK_WEBHOOK is set', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      process.env.SLACK_WEBHOOK = 'https://hooks.slack.com/test';

      await securityService.logEvent({
        eventType: SecurityEventTypes.SUSPICIOUS_ACTIVITY,
        severity: SecuritySeverity.CRITICAL,
        description: 'Critical test',
      }, mockReq());

      expect(fetchMock).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({ method: 'POST' })
      );

      delete process.env.SLACK_WEBHOOK;
      vi.unstubAllGlobals();
    });

    it('does not call webhook when SLACK_WEBHOOK is not set', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      delete process.env.SLACK_WEBHOOK;

      await securityService.logEvent({
        eventType: SecurityEventTypes.SUSPICIOUS_ACTIVITY,
        severity: SecuritySeverity.CRITICAL,
        description: 'Critical without webhook',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('checkLoginAttempt', () => {
    it('allows first login attempt', async () => {
      const result = await securityService.checkLoginAttempt('user@test.com', mockReq());
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(4);
    });

    it('blocks after 5 failed attempts', async () => {
      const req = mockReq();
      const identifier = `block-test-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        await securityService.checkLoginAttempt(identifier, req);
      }
      const result = await securityService.checkLoginAttempt(identifier, req);
      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
    });

    it('resets after clearLoginAttempts', async () => {
      const req = mockReq();
      const identifier = `clear-test-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        await securityService.checkLoginAttempt(identifier, req);
      }
      securityService.clearLoginAttempts(identifier, '127.0.0.1');
      const result = await securityService.checkLoginAttempt(identifier, req);
      expect(result.allowed).toBe(true);
    });
  });

  describe('getEvents', () => {
    it('returns paginated events', async () => {
      const mockEvents = [{ id: '1', eventType: 'login_success' }];
      (prisma.securityEvent.findMany as any).mockResolvedValue(mockEvents);
      (prisma.securityEvent.count as any).mockResolvedValue(1);

      const result = await securityService.getEvents({ page: 1, limit: 10 });

      expect(result.events).toEqual(mockEvents);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });
  });
});
