import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetConversationsQueryDto {
  @ApiPropertyOptional({
    description: 'Số lượng cuộc hội thoại lấy mỗi trang (1-50)',
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor phân trang cho lần đọc tiếp theo',
    example: 'eyJpZCI6IjNmYTg1ZjY0LTU3MTctNDU2Mi1iM2ZjLTJjOTYzZjY2YWZhNiJ9',
  })
  @IsOptional()
  @IsString({ message: 'cursor phải là chuỗi' })
  cursor?: string;
}
