import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
} from '../interfaces/audit-log.interface';

export class GetAuditLogsQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo ID người dùng cụ thể',
    example: '78a9c140-5b43-41bb-aef3-018274cbef01',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId phải là một UUID hợp lệ' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo email hoặc tên tài khoản',
    example: 'admin@social.com',
  })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({
    description:
      'Tháng cần tra cứu (định dạng YYYY-MM, mặc định: tháng hiện tại)',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month phải có định dạng YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({
    description: 'Phân loại nhóm hành động',
    enum: AuditCategory,
  })
  @IsOptional()
  @IsEnum(AuditCategory)
  category?: AuditCategory;

  @ApiPropertyOptional({
    description: 'Tên hành động cụ thể',
    enum: AuditAction,
  })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({
    description: 'Trạng thái kết quả thao tác',
    enum: AuditStatus,
  })
  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @ApiPropertyOptional({
    description: 'Lọc theo địa chỉ IP nguồn',
    example: '14.241.23.10',
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({
    description: 'Số lượng bản ghi mỗi trang (tối đa 100)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Con trỏ phân trang (Cursor) từ kết quả trang trước',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
