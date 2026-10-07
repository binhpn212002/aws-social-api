import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { AuditStatus, IAuditLogItem } from '../interfaces/audit-log.interface';
import { AuditLogEvent } from '../events/audit-log.event';
import { GetMyAuditLogsQueryDto } from '../dto/get-my-audit-logs-query.dto';
import { GetAuditLogsQueryDto } from '../dto/get-audit-logs-query.dto';
import {
  AuditLogDetailResponseDto,
  AuditLogItemDto,
  AuditLogListResponseDto,
} from '../dto/audit-log-response.dto';
import { ClientInfoUtil } from '../../../common/utils/client-info.util';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private static readonly BRUTE_FORCE_THRESHOLD = 5;
  private static readonly BRUTE_FORCE_WINDOW_MINUTES = 10;

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Xử lý sự kiện ghi nhật ký kiểm toán vào DynamoDB
   */
  async processAuditLogEvent(event: AuditLogEvent): Promise<IAuditLogItem> {
    try {
      const deviceInfo = ClientInfoUtil.parseDeviceInfo(event.userAgent);

      const record = await this.auditLogRepository.appendLog({
        userId: event.userId || null,
        identifier: event.identifier,
        category: event.category,
        action: event.action,
        status: event.status,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent || null,
        deviceInfo,
        failureReason: event.failureReason || null,
        metadata: event.metadata || null,
      });

      // Nếu đăng nhập thất bại, kiểm tra ngưỡng Brute-Force
      if (event.status === AuditStatus.FAILURE) {
        await this.detectBruteForce(event.identifier, event.ipAddress);
      }

      return record;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Không thể lưu bản ghi AuditLog vào DynamoDB: ${message}`,
        stack,
      );
      throw error;
    }
  }

  /**
   * Phát hiện Brute-Force từ DynamoDB Sliding Window
   */
  private async detectBruteForce(
    identifier: string,
    ipAddress: string,
  ): Promise<void> {
    try {
      const { byIdentifier, byIp } =
        await this.auditLogRepository.countRecentFailedLogins(
          identifier,
          ipAddress,
          AuditLogService.BRUTE_FORCE_WINDOW_MINUTES,
        );

      if (
        byIdentifier >= AuditLogService.BRUTE_FORCE_THRESHOLD ||
        byIp >= AuditLogService.BRUTE_FORCE_THRESHOLD
      ) {
        this.logger.warn(
          `[SECURITY ALERT] Phát hiện dấu hiệu Brute-Force trên DynamoDB! Identifier: ${identifier}, IP: ${ipAddress}, Thất bại: byIdentifier=${byIdentifier}, byIp=${byIp}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Lỗi khi quét Brute-Force trên DynamoDB: ${message}`);
    }
  }

  /**
   * Lấy lịch sử bảo mật người dùng đang đăng nhập
   */
  async getMyAuditLogs(
    userId: string,
    query: GetMyAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    const { items, meta } = await this.auditLogRepository.getMyLogs(
      userId,
      query,
    );

    return {
      items: items.map((item) => this.mapToItemDto(item)),
      meta,
    };
  }

  /**
   * Lấy danh sách kiểm toán hệ thống cho Admin
   */
  async getAuditLogsForAdmin(
    query: GetAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    const { items, meta } =
      await this.auditLogRepository.getLogsForAdmin(query);

    return {
      items: items.map((item) => this.mapToItemDto(item)),
      meta,
    };
  }

  /**
   * Xem chi tiết 1 bản ghi kiểm toán bằng ID
   */
  async getAuditLogDetail(
    id: string,
    requestUserId: string,
    isAdmin: boolean,
  ): Promise<AuditLogDetailResponseDto> {
    const log = await this.auditLogRepository.getLogById(id);

    if (!log) {
      throw new NotFoundException('Không tìm thấy bản ghi kiểm toán');
    }

    if (!isAdmin && log.userId !== requestUserId) {
      throw new ForbiddenException('Bạn không có quyền truy cập bản ghi này');
    }

    return this.mapToDetailDto(log);
  }

  private mapToItemDto(log: IAuditLogItem): AuditLogItemDto {
    return {
      id: log.id,
      userId: log.userId,
      identifier: log.identifier,
      category: log.category,
      action: log.action,
      status: log.status,
      ipAddress: log.ipAddress,
      deviceInfo: log.deviceInfo,
      failureReason: log.failureReason,
      createdAt: log.createdAt,
    };
  }

  private mapToDetailDto(log: IAuditLogItem): AuditLogDetailResponseDto {
    const base = this.mapToItemDto(log);
    return {
      ...base,
      userAgent: log.userAgent,
      metadata: log.metadata,
    };
  }
}
