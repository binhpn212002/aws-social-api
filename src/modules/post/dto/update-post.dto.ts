import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PostPrivacy } from '../../../database/entities/post.entity';

export class UpdatePostDto {
  @ApiPropertyOptional({
    example: 'Nội dung cập nhật sau khi chỉnh sửa...',
    description: 'Nội dung văn bản mới của bài viết',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Nội dung bài viết tối đa 5000 ký tự' })
  content?: string;

  @ApiPropertyOptional({
    enum: PostPrivacy,
    description: 'Cập nhật lại quyền riêng tư của bài viết',
  })
  @IsOptional()
  @IsEnum(PostPrivacy)
  privacy?: PostPrivacy;
}
