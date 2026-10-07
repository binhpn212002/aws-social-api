import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MessageType } from '../interfaces/chat-message.interface';

export class SendMessageDto {
  @ApiProperty({
    description: 'UUID cuộc hội thoại',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID('4', { message: 'conversationId phải là UUID v4 hợp lệ' })
  @IsNotEmpty({ message: 'conversationId không được để trống' })
  conversationId: string;

  @ApiPropertyOptional({
    description: 'Loại tin nhắn',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  @IsOptional()
  @IsEnum(MessageType, { message: 'Loại tin nhắn không hợp lệ' })
  type?: MessageType = MessageType.TEXT;

  @ApiPropertyOptional({
    description: 'Nội dung tin nhắn văn bản',
    example: 'Xin chào bạn nhé!',
  })
  @ValidateIf((o) => o.type === MessageType.TEXT || (!o.mediaUrl && !o.content))
  @IsString({ message: 'content phải là chuỗi' })
  @IsNotEmpty({ message: 'content không được để trống khi gửi tin nhắn dạng TEXT' })
  @MaxLength(5000, { message: 'Nội dung tin nhắn tối đa 5000 ký tự' })
  content?: string;

  @ApiPropertyOptional({
    description: 'URL tệp media đính kèm trên S3',
    example: 'https://social-bucket.s3.ap-southeast-1.amazonaws.com/chat/c1/uuid.jpg',
  })
  @IsOptional()
  @IsString({ message: 'mediaUrl phải là chuỗi' })
  mediaUrl?: string;

  @ApiPropertyOptional({
    description: 'S3 Key của tệp media',
    example: 'chat/c1/uuid.jpg',
  })
  @IsOptional()
  @IsString({ message: 's3Key phải là chuỗi' })
  s3Key?: string;

  @ApiPropertyOptional({
    description: 'Tên gốc của file tải lên',
    example: 'photo.jpg',
  })
  @IsOptional()
  @IsString({ message: 'fileName phải là chuỗi' })
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Kích thước file theo bytes',
    example: 1048576,
  })
  @IsOptional()
  @IsNumber({}, { message: 'fileSize phải là số' })
  fileSize?: number;

  @ApiPropertyOptional({
    description: 'ID của tin nhắn muốn trả lời (Reply)',
    example: '8fa85f64-5717-4562-b3fc-2c963f66af99',
  })
  @IsOptional()
  @IsUUID('4', { message: 'replyToId phải là UUID v4 hợp lệ' })
  replyToId?: string;
}
