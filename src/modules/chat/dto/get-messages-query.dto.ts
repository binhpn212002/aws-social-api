import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'Số tin nhắn cần lấy mỗi trang (1-100)',
    default: 30,
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100' })
  limit?: number = 30;

  @ApiPropertyOptional({
    description: 'Cursor phân trang (Base64 chuỗi LastEvaluatedKey của DynamoDB)',
    example: 'eyJjb252ZXJzYXRpb25JZCI6IjNmYTg1ZjY0IiwiY3JlYXRlZEF0I...fQ==',
  })
  @IsOptional()
  @IsString({ message: 'cursor phải là chuỗi' })
  cursor?: string;
}
