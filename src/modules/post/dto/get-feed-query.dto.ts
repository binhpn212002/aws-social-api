import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetFeedQueryDto {
  @ApiPropertyOptional({
    example: 10,
    default: 10,
    description: 'Số lượng bài viết trên mỗi lượt tải (tối đa 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTAyVDE3OjAwOjAwLjAwMFoiLCJpZCI6ImU0YjNlODExIn0=',
    description:
      'Con trỏ cursor (Base64 chuỗi { createdAt, id }) của bài viết cuối cùng trong lần tải trước',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
