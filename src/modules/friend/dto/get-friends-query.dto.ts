import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetFriendsQueryDto {
  @ApiPropertyOptional({
    description: 'Số thứ tự trang (bắt đầu từ 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng bạn bè trên mỗi trang (tối đa 100)',
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
    description:
      'Từ khóa tìm kiếm theo họ tên (fullName) hoặc tên người dùng (username)',
    example: 'nguyen van a',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sắp xếp theo trường',
    enum: ['createdAt', 'fullName', 'username'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'fullName', 'username'])
  sortBy?: 'createdAt' | 'fullName' | 'username' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Chiều sắp xếp',
    enum: ['ASC', 'DESC', 'asc', 'desc'],
    default: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortDir?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';
}
