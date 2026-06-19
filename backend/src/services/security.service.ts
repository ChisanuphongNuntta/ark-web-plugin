import { Request } from 'express';
import prisma from '../config/database.js';

// Security Event Types
export const SecurityEventTypes = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_BLOCKED: 'login_blocked',
  PASSWORD_CHANGE: 'password_change',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  ADMIN_ACTION: 'admin_action',
  DATA_BREACH_ATTEMPT: 'data_breach_attempt',
  SESSION_HIJACK_ATTEMPT: 'session_hijack_attempt',
  BRUTE_FORCE_DETECTED: 'brute_force_detected',
} as const;

// Severity Levels
export const SecuritySeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

interface SecurityEventData {
  eventType: string;
  severity?: string;
  userId?: string;
  description: string;
  metadata?: any;
  blocked?: boolean;
}

// In-memory rate limiting store (for production, use Redis)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

class SecurityService {
  /**
   * Log a security event
   */
  async logEvent(data: SecurityEventData, req?: Request): Promise<void> {
    try {
      await prisma.securityEvent.create({
        data: {
          eventType: data.eventType,
          severity: data.severity || SecuritySeverity.INFO,
          userId: data.userId || null,
          ipAddress: req ? this.getClientIP(req) : null,
          userAgent: req?.headers['user-agent'] || null,
          description: data.description,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          blocked: data.blocked || false,
          notified: false,
        },
      });

      // If critical, could trigger notification (email/Discord webhook)
      if (data.severity === SecuritySeverity.CRITICAL) {
        await this.notifyCriticalEvent(data);
      }
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Check and track login attempts for rate limiting
   */
  async checkLoginAttempt(identifier: string, req: Request): Promise<{ allowed: boolean; remainingAttempts: number }> {
    const key = `${identifier}:${this.getClientIP(req)}`;
    const now = Date.now();
    const record = loginAttempts.get(key);

    if (!record || now - record.firstAttempt > RATE_LIMIT_WINDOW) {
      // Reset or create new record
      loginAttempts.set(key, { count: 1, firstAttempt: now });
      return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS - 1 };
    }

    if (record.count >= MAX_LOGIN_ATTEMPTS) {
      // Log blocked attempt
      await this.logEvent({
        eventType: SecurityEventTypes.LOGIN_BLOCKED,
        severity: SecuritySeverity.WARNING,
        description: `Login blocked due to too many failed attempts for: ${identifier}`,
        metadata: { identifier, attempts: record.count },
        blocked: true,
      }, req);

      return { allowed: false, remainingAttempts: 0 };
    }

    record.count++;
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS - record.count };
  }

  /**
   * Clear login attempts after successful login
   */
  clearLoginAttempts(identifier: string, ip: string): void {
    const key = `${identifier}:${ip}`;
    loginAttempts.delete(key);
  }

  /**
   * Log successful login
   */
  async logLoginSuccess(userId: string, req: Request): Promise<void> {
    await this.logEvent({
      eventType: SecurityEventTypes.LOGIN_SUCCESS,
      severity: SecuritySeverity.INFO,
      userId,
      description: `User logged in successfully`,
    }, req);
  }

  /**
   * Log failed login attempt
   */
  async logLoginFailed(identifier: string, reason: string, req: Request): Promise<void> {
    await this.logEvent({
      eventType: SecurityEventTypes.LOGIN_FAILED,
      severity: SecuritySeverity.WARNING,
      description: `Failed login attempt for: ${identifier}. Reason: ${reason}`,
      metadata: { identifier, reason },
    }, req);
  }

  /**
   * Log unauthorized access attempt
   */
  async logUnauthorizedAccess(userId: string | null, resource: string, req: Request): Promise<void> {
    await this.logEvent({
      eventType: SecurityEventTypes.UNAUTHORIZED_ACCESS,
      severity: SecuritySeverity.WARNING,
      userId: userId || undefined,
      description: `Unauthorized access attempt to: ${resource}`,
      metadata: { resource },
      blocked: true,
    }, req);
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(userId: string | null, description: string, metadata: any, req: Request): Promise<void> {
    await this.logEvent({
      eventType: SecurityEventTypes.SUSPICIOUS_ACTIVITY,
      severity: SecuritySeverity.CRITICAL,
      userId: userId || undefined,
      description,
      metadata,
    }, req);
  }

  /**
   * Log admin action
   */
  async logAdminAction(adminId: string, action: string, targetId: string, req: Request): Promise<void> {
    await this.logEvent({
      eventType: SecurityEventTypes.ADMIN_ACTION,
      severity: SecuritySeverity.INFO,
      userId: adminId,
      description: `Admin performed: ${action} on ${targetId}`,
      metadata: { action, targetId },
    }, req);
  }

  /**
   * Get security events with filters
   */
  async getEvents(options: {
    eventType?: string;
    severity?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { eventType, severity, userId, startDate, endDate, page = 1, limit = 50 } = options;

    const where: any = {};

    if (eventType) where.eventType = eventType;
    if (severity) where.severity = severity;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.securityEvent.count({ where }),
    ]);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get security dashboard stats
   */
  async getDashboardStats() {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalEvents,
      criticalEvents24h,
      loginAttempts24h,
      blockedAttempts24h,
    ] = await Promise.all([
      prisma.securityEvent.count(),
      prisma.securityEvent.count({
        where: {
          severity: SecuritySeverity.CRITICAL,
          createdAt: { gte: last24Hours },
        },
      }),
      prisma.securityEvent.count({
        where: {
          eventType: { in: [SecurityEventTypes.LOGIN_SUCCESS, SecurityEventTypes.LOGIN_FAILED] },
          createdAt: { gte: last24Hours },
        },
      }),
      prisma.securityEvent.count({
        where: {
          blocked: true,
          createdAt: { gte: last24Hours },
        },
      }),
    ]);

    return {
      totalEvents,
      criticalEvents24h,
      loginAttempts24h,
      blockedAttempts24h,
    };
  }

  /**
   * Notify admin of critical security events via Slack/Discord webhook
   */
  private async notifyCriticalEvent(data: SecurityEventData): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK;
    if (!webhookUrl) return;

    const payload = {
      text: `🚨 *CRITICAL SECURITY EVENT*`,
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Event', value: data.eventType, short: true },
          { title: 'Severity', value: data.severity || 'CRITICAL', short: true },
          { title: 'Description', value: data.description, short: false },
          { title: 'User ID', value: data.userId || 'anonymous', short: true },
          { title: 'Time', value: new Date().toISOString(), short: true },
        ],
      }],
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      console.error('[SecurityService] Failed to send webhook notification');
    }
  }

  /**
   * Get client IP from request
   */
  private getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }
}

export const securityService = new SecurityService();
export default securityService;
