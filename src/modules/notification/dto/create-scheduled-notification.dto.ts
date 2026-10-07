import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
import { ScheduleTargetType } from '../../../database/entities/scheduled-notification.entity';

export class CreateScheduledNotificationDto {
  @ApiProperty({
    description: 'Tiêu đề thông báo gửi bạn bè',
    example: 'Nhắc hẹn cà phê cuối tuần này!',
    minLength: 3,
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  @IsString()
  @Length(3, 255, { message: 'Tiêu đề phải từ 3 đến 255 ký tự' })
  title: string;

  @ApiProperty({
    description: 'Nội dung chi tiết thông báo',
    example: 'Tối thứ 7 này lúc 19h cả nhóm gặp nhau ở quán cũ nhé!',
    minLength: 5,
    maxLength: 2000,
  })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  @IsString()
  @Length(5, 2000, { message: 'Nội dung phải từ 5 đến 2000 ký tự' })
  content: string;

  @ApiProperty({
    description: 'Thời điểm dự kiến phát thông báo (UTC, ISO-8601, tối thiểu sau hiện tại 5 phút)',
    example: '2026-10-10T12:00:00.000Z',
  })
  @IsNotEmpty({ message: 'Thời điểm gửi không được để trống' })
  @IsDateString({}, { message: 'scheduledAt phải là định dạng ISO-8601 hợp lệ' })
  scheduledAt: string;

  @ApiProperty({
    description: 'Đối tượng nhận thông báo',
    enum: ScheduleTargetType,
    example: ScheduleTargetType.ALL_FRIENDS,
  })
  @IsNotEmpty({ message: 'Phạm vi người nhận không được để trống' })
  @IsEnum(ScheduleTargetType, { message: 'targetType phải là ALL_FRIENDS hoặc SELECTED_FRIENDS' })
  targetType: ScheduleTargetType;

  @ApiPropertyOptional({
    description: 'Danh sách UUID bạn bè (bắt buộc khi targetType là SELECTED_FRIENDS)',
    example: ['78a9c140-5b43-41bb-aef3-018274cbef01'],
    type: [String],
  })
  @ValidateIf((o: CreateScheduledNotificationDto) => o.targetType === ScheduleTargetType.SELECTED_FRIENDS)
  @IsArray({ message: 'targetUserIds phải là một danh sách UUID' })
  @IsUUID('4', { each: true, message: 'Mỗi phần tử trong targetUserIds phải là UUID v4' })
  @IsNotEmpty({ message: 'Danh sách bạn bè không được rỗng khi chọn SELECTED_FRIENDS' })
  targetUserIds?: string[];
}
