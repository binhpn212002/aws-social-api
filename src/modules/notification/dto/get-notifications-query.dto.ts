import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';
import { NotificationStatus } from '../../../database/entities/notification.entity';

export class GetNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Chỉ lấy thông báo chưa đọc nếu true',
    example: false,
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean = false;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái gửi của thông báo',
    enum: NotificationStatus,
    default: NotificationStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus = NotificationStatus.COMPLETED;
}
