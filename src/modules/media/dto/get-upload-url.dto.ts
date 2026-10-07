import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class GetUploadUrlDto {
  @ApiProperty({
    description: 'Tên file cần upload (ví dụ: avatar.jpg, video.mp4)',
    example: 'avatar.jpg',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    description:
      'Content-Type / MIME type của file (ví dụ: image/jpeg, video/mp4)',
    example: 'image/jpeg',
  })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({
    description: 'Thư mục lưu trữ trên S3 (ví dụ: avatars, posts, attachments)',
    example: 'posts',
    default: 'uploads',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_\-/]+$/, {
    message:
      'Folder chỉ được chứa ký tự chữ, số, gạch dưới, gạch ngang và dấu gạch chéo',
  })
  folder?: string;
}
