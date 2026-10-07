import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const ALLOWED_POST_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
];

export class GetPostUploadUrlDto {
  @ApiProperty({ example: 'vacation.jpg', description: 'Tên tệp gốc' })
  @IsString()
  @IsNotEmpty({ message: 'Tên file không được để trống' })
  fileName: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'MIME type của tệp tải lên',
    enum: ALLOWED_POST_MIME_TYPES,
  })
  @IsString()
  @IsIn(ALLOWED_POST_MIME_TYPES, {
    message: `Định dạng tệp không được hỗ trợ. Các định dạng hợp lệ: ${ALLOWED_POST_MIME_TYPES.join(', ')}`,
  })
  contentType: string;

  @ApiPropertyOptional({
    example: 2048500,
    description: 'Dung lượng tệp tính bằng byte (Tối đa 50MB)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52428800, { message: 'Dung lượng tệp tối đa là 50MB' })
  fileSize?: number;
}
