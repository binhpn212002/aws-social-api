import { ApiProperty } from '@nestjs/swagger';

export class ToggleLikeResponseDto {
  @ApiProperty({
    example: true,
    description: 'True nếu vừa like, False nếu vừa unlike',
  })
  liked: boolean;

  @ApiProperty({
    example: 26,
    description: 'Tổng số lượt like của bài viết sau khi thực hiện thao tác',
  })
  likesCount: number;
}
