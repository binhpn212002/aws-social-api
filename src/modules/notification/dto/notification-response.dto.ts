import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationStatus,
  NotificationType,
} from '../../../database/entities/notification.entity';

export class SenderSummaryDto {
  @ApiProperty({ example: '78a9c140-5b43-41bb-aef3-018274cbef01' })
  id: string;

  @ApiProperty({ example: 'tran_thi_b' })
  username: string;

  @ApiProperty({ example: 'Trần Thị B' })
  fullName: string;

  @ApiPropertyOptional({ example: 'https://cdn.domain.com/avatars/user_b.jpg' })
  avatarUrl?: string | null;
}

export class NotificationResponseDto {
  @ApiProperty({ example: 'f516a8d0-990a-44c1-84de-c82098b67151' })
  id: string;

  @ApiProperty({ enum: NotificationType, example: NotificationType.COMMENT_POST })
  type: NotificationType;

  @ApiProperty({ example: 'Bình luận mới' })
  title: string;

  @ApiProperty({ example: 'Trần Thị B đã bình luận vào bài viết của bạn.' })
  message: string;

  @ApiProperty({ enum: NotificationStatus, example: NotificationStatus.COMPLETED })
  status: NotificationStatus;

  @ApiPropertyOptional({ type: SenderSummaryDto })
  sender?: SenderSummaryDto | null;

  @ApiPropertyOptional({ example: 'e4b3e811-9a42-4f36-8a71-6c1cf6ec32b9' })
  referenceId?: string | null;

  @ApiPropertyOptional({ example: 'POST' })
  referenceType?: string | null;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiPropertyOptional({ example: null })
  readAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-10-03T14:15:02.000Z' })
  sentAt?: Date | null;

  @ApiProperty({ example: '2026-10-03T14:15:00.000Z' })
  createdAt: Date;
}
