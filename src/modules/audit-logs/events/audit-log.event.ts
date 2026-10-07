import {
  AuditAction,
  AuditCategory,
  AuditStatus,
} from '../interfaces/audit-log.interface';

export class AuditLogEvent {
  userId?: string | null;
  identifier: string;
  category: AuditCategory;
  action: AuditAction;
  status: AuditStatus;
  ipAddress: string;
  userAgent?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, any> | null;

  constructor(partial: Partial<AuditLogEvent>) {
    Object.assign(this, partial);
  }
}
