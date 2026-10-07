import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MarkAsReadDto {
  @ApiPropertyOptional({
    description: 'ID của tin nhắn đọc cuối cùng (tùy chọn)',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsOptional()
  @IsUUID('4', { message: 'messageId phải là UUID v4 hợp lệ' })
  messageId?: string;
}
