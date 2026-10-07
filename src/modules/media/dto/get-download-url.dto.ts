import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GetDownloadUrlDto {
  @ApiProperty({
    description:
      'Key/đường dẫn của file trên S3 (ví dụ: posts/1712000000-avatar.jpg)',
    example: 'posts/1712000000-avatar.jpg',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiPropertyOptional({
    description:
      'Thời gian hiệu lực của link tính bằng giây (mặc định: 3600s = 1 giờ)',
    example: 3600,
    default: 3600,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(60, { message: 'expiresIn tối thiểu là 60 giây' })
  @Max(604800, { message: 'expiresIn tối đa là 604800 giây (7 ngày)' })
  expiresIn?: number;
}
