import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostPrivacy } from '../../../database/entities/post.entity';
import { MediaType } from '../../../database/entities/post-media.entity';

export class PostAuthorDto {
  @ApiProperty({ example: 'b6a82741-2cbe-4c4f-a9cb-b61005d58ff3' })
  id: string;

  @ApiProperty({ example: 'nguyenvana' })
  username: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  fullName: string;

  @ApiPropertyOptional({ example: 'https://...', nullable: true })
  avatarUrl?: string | null;
}

export class PostMediaResponseDto {
  @ApiProperty({ example: '7fa1bc82-0192-4f2a-8c65-b1a9e88029d1' })
  id: string;

  @ApiProperty({ enum: MediaType, example: MediaType.IMAGE })
  mediaType: MediaType;

  @ApiProperty({ example: 'https://social-bucket.s3.amazonaws.com/posts/...' })
  url: string;

  @ApiPropertyOptional({ example: 'https://...', nullable: true })
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({ example: 1920, nullable: true })
  width?: number | null;

  @ApiPropertyOptional({ example: 1080, nullable: true })
  height?: number | null;

  @ApiProperty({ example: 0 })
  orderIndex: number;
}

export class PostResponseDto {
  @ApiProperty({ example: 'e4b3e811-9a42-4f36-8a71-6c1cf6ec32b9' })
  id: string;

  @ApiProperty({ type: () => PostAuthorDto })
  author: PostAuthorDto;

  @ApiPropertyOptional({
    example: 'Hôm nay thật là một ngày tuyệt vời!',
    nullable: true,
  })
  content?: string | null;

  @ApiProperty({ enum: PostPrivacy, example: PostPrivacy.PUBLIC })
  privacy: PostPrivacy;

  @ApiProperty({ example: 25 })
  likesCount: number;

  @ApiProperty({ example: 5 })
  commentsCount: number;

  @ApiProperty({ example: 2 })
  sharesCount: number;

  @ApiProperty({
    example: false,
    description: 'Người dùng hiện tại đã bấm thích hay chưa',
  })
  isLiked: boolean;

  @ApiProperty({ type: [PostMediaResponseDto] })
  media: PostMediaResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class FeedPaginationDto {
  @ApiPropertyOptional({ example: 'eyJjcmVhdGVkQXQi...', nullable: true })
  nextCursor?: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;
}

export class FeedResponseDto {
  @ApiProperty({ type: [PostResponseDto] })
  items: PostResponseDto[];

  @ApiProperty({ type: () => FeedPaginationDto })
  pagination: FeedPaginationDto;
}
