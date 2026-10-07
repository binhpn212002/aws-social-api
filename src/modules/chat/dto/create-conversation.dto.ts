import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ConversationType } from '../interfaces/chat-conversation.interface';

export class CreateConversationDto {
  @ApiProperty({
    description: 'Loại hội thoại (DIRECT hoặc GROUP)',
    enum: ConversationType,
    example: ConversationType.DIRECT,
  })
  @IsEnum(ConversationType, { message: 'type phải là DIRECT hoặc GROUP' })
  @IsNotEmpty({ message: 'type không được để trống' })
  type: ConversationType;

  @ApiPropertyOptional({
    description: 'UUID của người nhận khi tạo hội thoại DIRECT 1-1',
    example: '78a9c140-5b43-41bb-aef3-018274cbef01',
  })
  @ValidateIf((o) => o.type === ConversationType.DIRECT)
  @IsUUID('4', { message: 'recipientId phải là một UUID v4 hợp lệ' })
  @IsNotEmpty({ message: 'recipientId bắt buộc khi type là DIRECT' })
  recipientId?: string;

  @ApiPropertyOptional({
    description: 'Tên nhóm chat khi type là GROUP',
    example: 'Nhóm Dự Án X',
  })
  @ValidateIf((o) => o.type === ConversationType.GROUP)
  @IsString({ message: 'name phải là chuỗi' })
  @IsNotEmpty({ message: 'name không được để trống khi type là GROUP' })
  @MaxLength(100, { message: 'Tên nhóm tối đa 100 ký tự' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện của nhóm chat khi type là GROUP',
    example: 'https://social-bucket.s3.amazonaws.com/groups/avatar.png',
  })
  @IsOptional()
  @IsString({ message: 'avatarUrl phải là chuỗi' })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Danh sách UUID của các thành viên khi tạo nhóm (không bao gồm người tạo)',
    example: ['78a9c140-5b43-41bb-aef3-018274cbef01', '99a1c220-4b11-41bb-beef-018274cbef99'],
    type: [String],
  })
  @ValidateIf((o) => o.type === ConversationType.GROUP)
  @IsArray({ message: 'memberIds phải là mảng các UUID' })
  @IsUUID('4', { each: true, message: 'Từng memberId phải là UUID v4' })
  @IsNotEmpty({ message: 'memberIds không được để trống khi type là GROUP' })
  memberIds?: string[];
}
