import { ApiProperty } from '@nestjs/swagger';

export class DownloadUrlResponseDto {
  @ApiProperty({
    description: 'Presigned URL để Frontend tải hoặc hiển thị file',
    example:
      'https://social-bucket-366518187546.s3.ap-southeast-1.amazonaws.com/posts/...?X-Amz-Signature=...',
  })
  downloadUrl: string;

  @ApiProperty({
    description: 'S3 Object Key của file',
    example: 'posts/1712000000-a1b2c3d4-avatar.jpg',
  })
  key: string;

  @ApiProperty({
    description: 'Thời gian hiệu lực của download URL tính bằng giây',
    example: 3600,
  })
  expiresIn: number;
}
