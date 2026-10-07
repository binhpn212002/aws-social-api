import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { FriendRequestType } from '../../../database/entities/friendship.entity';

export class GetFriendRequestsQueryDto {
  @ApiPropertyOptional({
    description: 'Loại lời mời: "received" (nhận được) hoặc "sent" (đã gửi đi)',
    enum: FriendRequestType,
    default: FriendRequestType.RECEIVED,
  })
  @IsOptional()
  @IsEnum(FriendRequestType, {
    message: 'type phải là "received" hoặc "sent"',
  })
  type?: FriendRequestType = FriendRequestType.RECEIVED;

  @ApiPropertyOptional({
    description: 'Số trang',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Số lượng mục trên trang',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
