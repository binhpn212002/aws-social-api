import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLogService } from '../services/audit-log.service';
import { AuditLogEvent } from '../events/audit-log.event';

@Injectable()
export class AuditLogListener {
  private readonly logger = new Logger(AuditLogListener.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  @OnEvent('audit.log', { async: true })
  async handleAuditLogEvent(event: AuditLogEvent): Promise<void> {
    try {
      await this.auditLogService.processAuditLogEvent(event);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Xử lý nền sự kiện audit.log vào DynamoDB thất bại: ${message}`,
        stack,
      );
    }
  }
}
