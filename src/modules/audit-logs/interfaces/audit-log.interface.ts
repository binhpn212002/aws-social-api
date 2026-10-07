export enum AuditCategory {
  AUTH = 'AUTH',
  ACCOUNT_SECURITY = 'ACCOUNT_SECURITY',
  ADMIN_ACTION = 'ADMIN_ACTION',
}

export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  REFRESH_TOKEN = 'REFRESH_TOKEN',
  CHANGE_PASSWORD_SUCCESS = 'CHANGE_PASSWORD_SUCCESS',
  CHANGE_PASSWORD_FAILED = 'CHANGE_PASSWORD_FAILED',
  FORGOT_PASSWORD_REQUEST = 'FORGOT_PASSWORD_REQUEST',
  RESET_PASSWORD_SUCCESS = 'RESET_PASSWORD_SUCCESS',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

export interface IAuditLogItem {
  PK: string;
  SK: string;
  id: string;
  userId?: string | null;
  identifier: string;
  category: AuditCategory;
  action: AuditAction;
  status: AuditStatus;
  ipAddress: string;
  userAgent?: string | null;
  deviceInfo?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string; // ISO-8601 UTC
  ttl: number; // Unix epoch timestamp (giây)
}
