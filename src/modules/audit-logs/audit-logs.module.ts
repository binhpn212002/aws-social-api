import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditLogController } from './audit-logs.controller';
import { AuditLogService } from './services/audit-log.service';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { AuditLogListener } from './listeners/audit-log.listener';

@Module({
  imports: [ConfigModule],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogRepository, AuditLogListener],
  exports: [AuditLogService, AuditLogRepository],
})
export class AuditLogsModule {}
