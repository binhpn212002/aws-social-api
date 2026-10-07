import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetMyAuditLogsQueryDto {
  @ApiPropertyOptional({
    description: 'Số lượng bản ghi trên một trang (tối đa 50)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    description:
      'Con trỏ phân trang (Cursor) từ meta.nextCursor của lần truy vấn trước (để trống cho trang đầu tiên)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
