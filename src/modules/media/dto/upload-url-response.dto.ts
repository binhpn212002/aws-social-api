import { ApiProperty } from '@nestjs/swagger';

export class UploadUrlResponseDto {
  @ApiProperty({
    description:
      'Presigned URL để Frontend thực hiện HTTP PUT upload file trực tiếp lên S3',
    example:
      'https://social-bucket-366518187546.s3.ap-southeast-1.amazonaws.com/posts/...',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'S3 Object Key đại diện cho file',
    example: 'posts/1712000000-a1b2c3d4-avatar.jpg',
  })
  key: string;

  @ApiProperty({
    description: 'Public URL của file sau khi upload thành công',
    example:
      'https://social-bucket-366518187546.s3.ap-southeast-1.amazonaws.com/posts/1712000000-a1b2c3d4-avatar.jpg',
  })
  fileUrl: string;

  @ApiProperty({
    description: 'Thời gian hiệu lực của upload URL tính bằng giây',
    example: 900,
  })
  expiresIn: number;
}
