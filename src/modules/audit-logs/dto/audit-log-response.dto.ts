import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
} from '../interfaces/audit-log.interface';

export class AuditLogItemDto {
  @ApiProperty({ example: '7fa1bc82-0192-4f2a-8c65-b1a9e88029d1' })
  id: string;

  @ApiPropertyOptional({ example: '78a9c140-5b43-41bb-aef3-018274cbef01' })
  userId?: string | null;

  @ApiProperty({ example: 'user_a@social.com' })
  identifier: string;

  @ApiProperty({ enum: AuditCategory, example: AuditCategory.AUTH })
  category: AuditCategory;

  @ApiProperty({ enum: AuditAction, example: AuditAction.LOGIN_SUCCESS })
  action: AuditAction;

  @ApiProperty({ enum: AuditStatus, example: AuditStatus.SUCCESS })
  status: AuditStatus;

  @ApiProperty({ example: '14.241.23.10' })
  ipAddress: string;

  @ApiPropertyOptional({ example: 'Chrome / macOS' })
  deviceInfo?: string | null;

  @ApiPropertyOptional({ example: 'INVALID_CREDENTIALS' })
  failureReason?: string | null;

  @ApiProperty({ example: '2026-10-02T19:00:00.000Z' })
  createdAt: string;
}

export class AuditLogDetailResponseDto extends AuditLogItemDto {
  @ApiPropertyOptional({
    example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
  })
  userAgent?: string | null;

  @ApiPropertyOptional({
    example: { country: 'VN', city: 'Hanoi', isp: 'FPT Telecom' },
  })
  metadata?: Record<string, any> | null;
}

export class DynamoPaginationMetaDto {
  @ApiProperty({ example: 10 })
  count: number;

  @ApiPropertyOptional({
    description:
      'Chuỗi con trỏ (Cursor) dùng để tải trang tiếp theo (null nếu là trang cuối)',
    example:
      'eyJQSyI6IlVTRVIjMTIzIiwiU0siOiJMT0cjMjAyNi0xMC0wMlQxOTowMDowMC4wMDBaI3V1aWQifQ==',
  })
  nextCursor?: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogItemDto] })
  items: AuditLogItemDto[];

  @ApiProperty({ type: DynamoPaginationMetaDto })
  meta: DynamoPaginationMetaDto;
}
