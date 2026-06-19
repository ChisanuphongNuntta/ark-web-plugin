import { Request } from 'express';
import prisma from '../config/database.js';

export interface AuditLogData {
  userId?: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  metadata?: any;
  status?: 'success' | 'failure';
  errorMessage?: string;
}

// Audit Actions
export const AuditActions = {
  // Auth
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',

  // User
  USER_CREATE: 'user_create',
  USER_UPDATE: 'user_update',
  USER_DELETE: 'user_delete',
  USER_BAN: 'user_ban',
  USER_UNBAN: 'user_unban',
  USER_ADMIN_GRANT: 'user_admin_grant',
  USER_ADMIN_REVOKE: 'user_admin_revoke',

  // Points
  POINTS_ADJUST: 'points_adjust',
  POINTS_CLAIM: 'points_claim',

  // Product
  PRODUCT_CREATE: 'product_create',
  PRODUCT_UPDATE: 'product_update',
  PRODUCT_DELETE: 'product_delete',

  // Category
  CATEGORY_CREATE: 'category_create',
  CATEGORY_UPDATE: 'category_update',
  CATEGORY_DELETE: 'category_delete',

  // Order
  ORDER_CREATE: 'order_create',
  ORDER_UPDATE: 'order_update',
  ORDER_DELIVER: 'order_deliver',
  ORDER_REFUND: 'order_refund',

  // Server
  SERVER_CREATE: 'server_create',
  SERVER_UPDATE: 'server_update',
  SERVER_DELETE: 'server_delete',

  // PDPA
  CONSENT_GRANT: 'consent_grant',
  CONSENT_REVOKE: 'consent_revoke',
  DATA_REQUEST_CREATE: 'data_request_create',
  DATA_REQUEST_PROCESS: 'data_request_process',
  DATA_EXPORT: 'data_export',
  DATA_DELETE: 'data_delete',
} as const;

// Resources
export const AuditResources = {
  USER: 'user',
  PRODUCT: 'product',
  CATEGORY: 'category',
  ORDER: 'order',
  SERVER: 'server',
  POINTS: 'points',
  CONSENT: 'consent',
  DATA_REQUEST: 'data_request',
} as const;

class AuditService {
  /**
   * Log an audit event
   */
  async log(data: AuditLogData, req?: Request): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: data.userId || null,
          userEmail: data.userEmail || null,
          ipAddress: req ? this.getClientIP(req) : null,
          userAgent: req?.headers['user-agent'] || null,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId || null,
          oldValue: data.oldValue ? JSON.stringify(data.oldValue) : null,
          newValue: data.newValue ? JSON.stringify(data.newValue) : null,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          status: data.status || 'success',
          errorMessage: data.errorMessage || null,
        },
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw - audit logging should not break main flow
    }
  }

  /**
   * Log successful login
   */
  async logLogin(userId: string, req: Request): Promise<void> {
    await this.log({
      userId,
      action: AuditActions.LOGIN,
      resource: AuditResources.USER,
      resourceId: userId,
    }, req);
  }

  /**
   * Log logout
   */
  async logLogout(userId: string, req: Request): Promise<void> {
    await this.log({
      userId,
      action: AuditActions.LOGOUT,
      resource: AuditResources.USER,
      resourceId: userId,
    }, req);
  }

  /**
   * Log failed login attempt
   */
  async logLoginFailed(identifier: string, reason: string, req: Request): Promise<void> {
    await this.log({
      action: AuditActions.LOGIN_FAILED,
      resource: AuditResources.USER,
      status: 'failure',
      errorMessage: reason,
      metadata: { identifier },
    }, req);
  }

  /**
   * Log user update
   */
  async logUserUpdate(
    adminUserId: string,
    targetUserId: string,
    oldData: any,
    newData: any,
    req: Request
  ): Promise<void> {
    await this.log({
      userId: adminUserId,
      action: AuditActions.USER_UPDATE,
      resource: AuditResources.USER,
      resourceId: targetUserId,
      oldValue: oldData,
      newValue: newData,
    }, req);
  }

  /**
   * Log points adjustment
   */
  async logPointsAdjust(
    adminUserId: string,
    targetUserId: string,
    amount: number,
    reason: string,
    req: Request
  ): Promise<void> {
    await this.log({
      userId: adminUserId,
      action: AuditActions.POINTS_ADJUST,
      resource: AuditResources.POINTS,
      resourceId: targetUserId,
      newValue: { amount, reason },
    }, req);
  }

  /**
   * Log product changes
   */
  async logProductCreate(adminUserId: string, productId: number, data: any, req: Request): Promise<void> {
    await this.log({
      userId: adminUserId,
      action: AuditActions.PRODUCT_CREATE,
      resource: AuditResources.PRODUCT,
      resourceId: String(productId),
      newValue: data,
    }, req);
  }

  async logProductUpdate(adminUserId: string, productId: number, oldData: any, newData: any, req: Request): Promise<void> {
    await this.log({
      userId: adminUserId,
      action: AuditActions.PRODUCT_UPDATE,
      resource: AuditResources.PRODUCT,
      resourceId: String(productId),
      oldValue: oldData,
      newValue: newData,
    }, req);
  }

  async logProductDelete(adminUserId: string, productId: number, oldData: any, req: Request): Promise<void> {
    await this.log({
      userId: adminUserId,
      action: AuditActions.PRODUCT_DELETE,
      resource: AuditResources.PRODUCT,
      resourceId: String(productId),
      oldValue: oldData,
    }, req);
  }

  /**
   * Log order events
   */
  async logOrderCreate(userId: string, orderId: string, data: any, req: Request): Promise<void> {
    await this.log({
      userId,
      action: AuditActions.ORDER_CREATE,
      resource: AuditResources.ORDER,
      resourceId: orderId,
      newValue: data,
    }, req);
  }

  /**
   * Log PDPA consent
   */
  async logConsentGrant(userId: string, consentType: string, version: string, req: Request): Promise<void> {
    await this.log({
      userId,
      action: AuditActions.CONSENT_GRANT,
      resource: AuditResources.CONSENT,
      newValue: { consentType, version },
    }, req);
  }

  async logConsentRevoke(userId: string, consentType: string, req: Request): Promise<void> {
    await this.log({
      userId,
      action: AuditActions.CONSENT_REVOKE,
      resource: AuditResources.CONSENT,
      newValue: { consentType },
    }, req);
  }

  /**
   * Log data request
   */
  async logDataRequest(userId: string, requestType: string, requestId: number, req: Request): Promise<void> {
    await this.log({
      userId,
      action: AuditActions.DATA_REQUEST_CREATE,
      resource: AuditResources.DATA_REQUEST,
      resourceId: String(requestId),
      newValue: { requestType },
    }, req);
  }

  /**
   * Get audit logs with filters
   */
  async getLogs(options: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { userId, action, resource, startDate, endDate, page = 1, limit = 50 } = options;

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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

export const auditService = new AuditService();
export default auditService;
