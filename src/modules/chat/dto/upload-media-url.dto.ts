import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsUUID, Max, Min } from 'class-validator';
import { CHAT_MEDIA_LIMITS } from '../../../common/constants/module.constant';

export class UploadMediaUrlDto {
  @ApiProperty({
    description: 'UUID của cuộc hội thoại',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID('4', { message: 'conversationId phải là UUID v4 hợp lệ' })
  @IsNotEmpty({ message: 'conversationId không được để trống' })
  conversationId: string;

  @ApiProperty({
    description: 'Tên file dự kiến tải lên',
    example: 'my_photo.jpg',
  })
  @IsString({ message: 'fileName phải là chuỗi' })
  @IsNotEmpty({ message: 'fileName không được để trống' })
  fileName: string;

  @ApiProperty({
    description: 'MIME Content-Type của file',
    example: 'image/jpeg',
  })
  @IsString({ message: 'contentType phải là chuỗi' })
  @IsNotEmpty({ message: 'contentType không được để trống' })
  contentType: string;

  @ApiProperty({
    description: 'Dung lượng file tính bằng bytes',
    example: 2048576,
  })
  @IsNumber({}, { message: 'fileSize phải là số' })
  @Min(1, { message: 'fileSize phải lớn hơn 0' })
  @Max(CHAT_MEDIA_LIMITS.VIDEO_MAX_SIZE, {
    message: `fileSize tối đa là ${CHAT_MEDIA_LIMITS.VIDEO_MAX_SIZE} bytes (50MB)`,
  })
  fileSize: number;
}
