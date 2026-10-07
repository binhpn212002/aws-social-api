import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  NotificationDeliveryChannel,
  NotificationStatus,
} from '../../../database/entities/notification.entity';

export class NotifyCompletedDto {
  @ApiPropertyOptional({
    description: 'ID thông báo đơn lẻ nếu gửi thông báo tương tác',
    example: 'f516a8d0-990a-44c1-84de-c82098b67151',
  })
  @ValidateIf((o: NotifyCompletedDto) => !o.scheduleId)
  @IsUUID('4', { message: 'notificationId phải là UUID v4 hợp lệ' })
  notificationId?: string;

  @ApiPropertyOptional({
    description: 'ID lịch thông báo nếu là job của Scheduled Notification',
    example: '9d18e8a0-43aa-4e12-b912-3210ef87a012',
  })
  @ValidateIf((o: NotifyCompletedDto) => !o.notificationId)
  @IsUUID('4', { message: 'scheduleId phải là UUID v4 hợp lệ' })
  scheduleId?: string;

  @ApiProperty({
    description: 'Trạng thái xử lý sau khi Lambda thực thi gửi',
    enum: [NotificationStatus.COMPLETED, NotificationStatus.FAILED],
    example: NotificationStatus.COMPLETED,
  })
  @IsNotEmpty({ message: 'status không được để trống' })
  @IsEnum([NotificationStatus.COMPLETED, NotificationStatus.FAILED], {
    message: 'status phải là COMPLETED hoặc FAILED',
  })
  status: NotificationStatus.COMPLETED | NotificationStatus.FAILED;

  @ApiPropertyOptional({
    description: 'Kênh đã phát tán thông báo thành công',
    enum: NotificationDeliveryChannel,
    example: NotificationDeliveryChannel.WEBSOCKET,
  })
  @IsOptional()
  @IsEnum(NotificationDeliveryChannel)
  deliveredVia?: NotificationDeliveryChannel;

  @ApiPropertyOptional({
    description: 'Tổng số người nhận đã được gửi thành công (dành cho scheduled notification)',
    example: 25,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalRecipients?: number;

  @ApiProperty({
    description: 'Thời điểm thực tế gửi thông báo (ISO-8601)',
    example: '2026-10-03T14:15:00.000Z',
  })
  @IsNotEmpty({ message: 'sentAt không được để trống' })
  @IsDateString({}, { message: 'sentAt phải là chuỗi ISO-8601 hợp lệ' })
  sentAt: string;

  @ApiPropertyOptional({
    description: 'Chi tiết nguyên nhân nếu trạng thái là FAILED',
    example: 'WebSocket Connection ID stale & expired',
  })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
