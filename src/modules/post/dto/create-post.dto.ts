import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostPrivacy } from '../../../database/entities/post.entity';
import { CreatePostMediaDto } from './create-post-media.dto';

export class CreatePostDto {
  @ApiPropertyOptional({
    example: 'Hôm nay trời đẹp quá, cùng đi dã ngoại nhé!',
    description: 'Nội dung văn bản (tối đa 5000 ký tự)',
  })
  @ValidateIf((o: CreatePostDto) => !o.media || o.media.length === 0)
  @IsString({ message: 'Nội dung bài viết phải là chuỗi ký tự' })
  @MaxLength(5000, { message: 'Nội dung bài viết tối đa 5000 ký tự' })
  content?: string;

  @ApiPropertyOptional({
    enum: PostPrivacy,
    default: PostPrivacy.PUBLIC,
    description: 'Quyền riêng tư: PUBLIC, FRIENDS, PRIVATE',
  })
  @IsOptional()
  @IsEnum(PostPrivacy)
  privacy?: PostPrivacy = PostPrivacy.PUBLIC;

  @ApiPropertyOptional({
    type: [CreatePostMediaDto],
    description: 'Danh sách các tệp đa phương tiện đính kèm (tối đa 10 tệp)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePostMediaDto)
  media?: CreatePostMediaDto[];
}
