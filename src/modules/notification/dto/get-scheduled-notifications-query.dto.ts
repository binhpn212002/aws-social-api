import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';
import { ScheduleNotificationStatus } from '../../../database/entities/scheduled-notification.entity';

export class GetScheduledNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái lịch hẹn thông báo',
    enum: ScheduleNotificationStatus,
  })
  @IsOptional()
  @IsEnum(ScheduleNotificationStatus)
  status?: ScheduleNotificationStatus;
}
