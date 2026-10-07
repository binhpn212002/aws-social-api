import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ScheduleNotificationStatus,
  ScheduleTargetType,
} from '../../../database/entities/scheduled-notification.entity';

export class ScheduledNotificationResponseDto {
  @ApiProperty({ example: '9d18e8a0-43aa-4e12-b912-3210ef87a012' })
  id: string;

  @ApiProperty({ example: 'b6a82741-2cbe-4c4f-a9cb-b61005d58ff3' })
  userId: string;

  @ApiProperty({ example: 'Nhắc hẹn cà phê cuối tuần này!' })
  title: string;

  @ApiProperty({ example: 'Tối thứ 7 này lúc 19h cả nhóm gặp nhau ở quán cũ nhé!' })
  content: string;

  @ApiProperty({ example: '2026-10-10T12:00:00.000Z' })
  scheduledAt: Date;

  @ApiProperty({ enum: ScheduleTargetType, example: ScheduleTargetType.ALL_FRIENDS })
  targetType: ScheduleTargetType;

  @ApiPropertyOptional({ example: [], type: [String] })
  targetUserIds?: string[] | null;

  @ApiProperty({ enum: ScheduleNotificationStatus, example: ScheduleNotificationStatus.PENDING })
  status: ScheduleNotificationStatus;

  @ApiPropertyOptional({ example: 25 })
  totalRecipients?: number | null;

  @ApiPropertyOptional({ example: null })
  sentAt?: Date | null;

  @ApiProperty({ example: '2026-10-03T14:10:00.000Z' })
  createdAt: Date;
}
