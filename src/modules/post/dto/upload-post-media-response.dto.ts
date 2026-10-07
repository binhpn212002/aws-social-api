import { ApiProperty } from '@nestjs/swagger';

export class UploadPostMediaResponseDto {
  @ApiProperty({
    description: 'Presigned S3 PUT URL dùng để upload trực tiếp',
    example: 'https://social-bucket.s3.amazonaws.com/posts/...',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'S3 Key đại diện lưu trong hệ thống',
    example:
      'posts/b6a82741-2cbe-4c4f-a9cb-b61005d58ff3/1696200000000-a1b2c3d4-vacation.jpg',
  })
  s3Key: string;

  @ApiProperty({
    description: 'URL xem tệp công khai sau khi upload xong',
    example: 'https://social-bucket.s3.ap-southeast-1.amazonaws.com/posts/...',
  })
  fileUrl: string;

  @ApiProperty({
    description: 'Thời hạn hiệu lực của URL tải lên tính bằng giây',
    example: 900,
  })
  expiresIn: number;
}
