import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
  IAuditLogItem,
} from '../interfaces/audit-log.interface';
import { AuditLogEvent } from '../events/audit-log.event';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repository: jest.Mocked<Partial<AuditLogRepository>>;

  const mockLogItem: IAuditLogItem = {
    PK: 'LOG#test-uuid-1',
    SK: 'METADATA',
    id: 'test-uuid-1',
    userId: 'user-uuid-1',
    identifier: 'test@example.com',
    category: AuditCategory.AUTH,
    action: AuditAction.LOGIN_SUCCESS,
    status: AuditStatus.SUCCESS,
    ipAddress: '14.241.23.10',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/122.0',
    deviceInfo: 'Chrome / macOS',
    failureReason: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 90 * 86400,
  };

  beforeEach(async () => {
    repository = {
      appendLog: jest.fn().mockResolvedValue(mockLogItem),
      getMyLogs: jest.fn().mockResolvedValue({
        items: [mockLogItem],
        meta: { count: 1, nextCursor: null, hasMore: false },
      }),
      getLogsForAdmin: jest.fn().mockResolvedValue({
        items: [mockLogItem],
        meta: { count: 1, nextCursor: null, hasMore: false },
      }),
      getLogById: jest.fn().mockResolvedValue(mockLogItem),
      countRecentFailedLogins: jest.fn().mockResolvedValue({
        byIdentifier: 0,
        byIp: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: AuditLogRepository,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('processAuditLogEvent', () => {
    it('should save log item successfully', async () => {
      const event = new AuditLogEvent({
        userId: 'user-uuid-1',
        identifier: 'test@example.com',
        category: AuditCategory.AUTH,
        action: AuditAction.LOGIN_SUCCESS,
        status: AuditStatus.SUCCESS,
        ipAddress: '14.241.23.10',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/122.0',
      });

      const result = await service.processAuditLogEvent(event);

      expect(repository.appendLog).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLogItem);
    });

    it('should check brute force on login failure', async () => {
      const event = new AuditLogEvent({
        identifier: 'test@example.com',
        category: AuditCategory.AUTH,
        action: AuditAction.LOGIN_FAILED,
        status: AuditStatus.FAILURE,
        failureReason: 'INVALID_PASSWORD',
        ipAddress: '14.241.23.10',
      });

      (repository.countRecentFailedLogins as jest.Mock).mockResolvedValue({
        byIdentifier: 5,
        byIp: 5,
      });

      await service.processAuditLogEvent(event);

      expect(repository.countRecentFailedLogins).toHaveBeenCalledWith(
        'test@example.com',
        '14.241.23.10',
        10,
      );
    });
  });

  describe('getMyAuditLogs', () => {
    it('should return paginated personal logs for user', async () => {
      const result = await service.getMyAuditLogs('user-uuid-1', { limit: 10 });

      expect(repository.getMyLogs).toHaveBeenCalledWith('user-uuid-1', {
        limit: 10,
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(mockLogItem.id);
      expect(result.meta.count).toBe(1);
    });
  });

  describe('getAuditLogsForAdmin', () => {
    it('should return audit logs for admin with filters', async () => {
      const query = { month: '2026-10', limit: 20 };
      const result = await service.getAuditLogsForAdmin(query);

      expect(repository.getLogsForAdmin).toHaveBeenCalledWith(query);
      expect(result.items.length).toBe(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getAuditLogDetail', () => {
    it('should return log detail when requester is the owner', async () => {
      const result = await service.getAuditLogDetail(
        'test-uuid-1',
        'user-uuid-1',
        false,
      );

      expect(repository.getLogById).toHaveBeenCalledWith('test-uuid-1');
      expect(result.id).toBe('test-uuid-1');
      expect(result.userId).toBe('user-uuid-1');
    });

    it('should return log detail when requester is admin even if not owner', async () => {
      const result = await service.getAuditLogDetail(
        'test-uuid-1',
        'admin-uuid-999',
        true,
      );

      expect(result.id).toBe('test-uuid-1');
    });

    it('should throw ForbiddenException when user is neither owner nor admin', async () => {
      await expect(
        service.getAuditLogDetail('test-uuid-1', 'other-user-uuid', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when log does not exist', async () => {
      (repository.getLogById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getAuditLogDetail('non-existent-id', 'user-uuid-1', false),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
