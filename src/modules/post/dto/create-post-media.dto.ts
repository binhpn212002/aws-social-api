import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { MediaType } from '../../../database/entities/post-media.entity';

export class CreatePostMediaDto {
  @ApiProperty({
    description: 'S3 Key nhận được từ bước xin Presigned URL',
    example:
      'posts/b6a82741-2cbe-4c4f-a9cb-b61005d58ff3/1696200000000-a1b2c3d4-vacation.jpg',
  })
  @IsString()
  @IsNotEmpty()
  s3Key: string;

  @ApiProperty({ enum: MediaType, default: MediaType.IMAGE })
  @IsEnum(MediaType)
  mediaType: MediaType;

  @ApiProperty({
    description: 'Đường dẫn file (S3 URL)',
    example: 'https://social-bucket.s3.ap-southeast-1.amazonaws.com/posts/...',
  })
  @IsUrl()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({
    description: 'Đường dẫn ảnh thumbnail (nếu là video)',
    example: 'https://...',
  })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ example: 1920 })
  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ example: 1080 })
  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @ApiPropertyOptional({ example: 2048500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}
