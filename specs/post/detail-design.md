# Thiết kế chi tiết (Detail Design): Module Post (Quản lý Bài viết & Tương tác)

Tài liệu thiết kế chi tiết kỹ thuật cho module **Post** dựa trên [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/post/basic-design.md), tuân thủ nguyên tắc kiến trúc trong [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md) và [implement.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/implement.promt.md).

---

## 1. Cấu trúc file & thư mục triển khai

```text
src/
├── database/
│   └── entities/
│       ├── post.entity.ts                     # Entity Post kế thừa BaseEntity
│       ├── post-media.entity.ts               # Entity PostMedia lưu tệp đính kèm trên S3
│       └── post-like.entity.ts                # Entity PostLike ghi nhận lượt thích bài viết
├── common/
│   ├── constants/
│   │   └── module.constant.ts                 # Cập nhật TABLE_NAMES: posts, post_media, post_likes
│   └── decorators/
│       └── current-user.decorator.ts          # Decorator trích xuất user từ JWT Request
├── integrations/
│   └── storage/
│       ├── s3.service.ts                      # Đã có - sinh presigned PUT/GET URL, xóa tệp
│       └── storage.module.ts                  # StorageModule cung cấp S3Service
├── modules/
│   ├── media/
│   │   └── services/media.service.ts          # Đã có - hỗ trợ upload url tổng quát
│   └── post/
│       ├── post.controller.ts                 # Định tuyến /api/v1/posts
│       ├── post.module.ts                     # Khai báo PostModule
│       ├── services/
│       │   ├── post.service.ts                # Nghiệp vụ tạo, sửa, xóa, lấy feed, chi tiết bài viết
│       │   └── post-like.service.ts           # Nghiệp vụ Like/Unlike và cập nhật atomic counter
│       ├── repositories/
│       │   ├── post.repository.ts             # Kế thừa BaseRepository<Post> (QueryBuilder News Feed)
│       │   ├── post-media.repository.ts       # Kế thừa BaseRepository<PostMedia>
│       │   └── post-like.repository.ts        # Kế thừa BaseRepository<PostLike>
│       └── dto/
│           ├── get-post-upload-url.dto.ts     # DTO xin presigned URL cho media của post
│           ├── upload-post-media-response.dto.ts
│           ├── create-post-media.dto.ts       # DTO chi tiết từng item media gửi lên khi tạo post
│           ├── create-post.dto.ts             # DTO tạo bài viết kèm danh sách media
│           ├── update-post.dto.ts             # DTO cập nhật nội dung & quyền riêng tư
│           ├── get-feed-query.dto.ts          # DTO cursor pagination cho News Feed
│           ├── post-response.dto.ts           # DTO trả về thông tin bài viết đầy đủ
│           └── toggle-like-response.dto.ts    # DTO trả về kết quả toggle like
```

---

## 2. Chi tiết Entities & Database Schema

### 2.1. Cập nhật `src/common/constants/module.constant.ts`
```typescript
export const TABLE_NAMES = {
  USERS: 'users',
  ROLES: 'roles',
  USER_ROLES: 'user_roles',
  POSTS: 'posts',
  POST_MEDIA: 'post_media',
  POST_LIKES: 'post_likes',
  COMMENTS: 'comments',
  LIKES: 'likes',
  FOLLOWS: 'follows',
  FRIENDSHIPS: 'friendships',
} as const;
```

### 2.2. Enums
Đặt tại `src/database/entities/post.entity.ts` (hoặc tái xuất trong common types):
```typescript
export enum PostPrivacy {
  PUBLIC = 'PUBLIC',
  FRIENDS = 'FRIENDS',
  PRIVATE = 'PRIVATE',
}

export enum PostStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN = 'HIDDEN',
  DELETED = 'DELETED',
}

export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}
```

### 2.3. Entity `Post`: `src/database/entities/post.entity.ts`
Kế thừa [BaseEntity](file:///Users/macos/project/personal/aws/social/social-api/src/shared/base.entity.ts) (`id: string (UUID)`, `createdAt`, `updatedAt`, `deletedAt`).

```typescript
import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { TABLE_NAMES } from '../../common/constants/module.constant';
import { User } from './user.entity';
import { PostMedia } from './post-media.entity';
import { PostLike } from './post-like.entity';

export enum PostPrivacy {
  PUBLIC = 'PUBLIC',
  FRIENDS = 'FRIENDS',
  PRIVATE = 'PRIVATE',
}

export enum PostStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN = 'HIDDEN',
  DELETED = 'DELETED',
}

@Entity({ name: TABLE_NAMES.POSTS || 'posts' })
@Index('idx_posts_user_created', ['userId', 'createdAt'])
@Index('idx_posts_privacy_created', ['privacy', 'createdAt'])
@Index('idx_posts_feed', ['status', 'privacy', 'createdAt'])
export class Post extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    enum: PostPrivacy,
    default: PostPrivacy.PUBLIC,
  })
  privacy: PostPrivacy;

  @Column({
    type: 'varchar',
    length: 20,
    enum: PostStatus,
    default: PostStatus.ACTIVE,
  })
  status: PostStatus;

  @Column({ type: 'int', default: 0, name: 'likes_count' })
  likesCount: number;

  @Column({ type: 'int', default: 0, name: 'comments_count' })
  commentsCount: number;

  @Column({ type: 'int', default: 0, name: 'shares_count' })
  sharesCount: number;

  @OneToMany(() => PostMedia, (media) => media.post, {
    cascade: true,
    eager: false,
  })
  media: PostMedia[];

  @OneToMany(() => PostLike, (like) => like.post)
  likes: PostLike[];
}
```

### 2.4. Entity `PostMedia`: `src/database/entities/post-media.entity.ts`
Lưu trữ thông tin metadata của hình ảnh/video gắn với bài viết trên AWS S3.

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TABLE_NAMES } from '../../common/constants/module.constant';
import { Post } from './post.entity';

export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

@Entity({ name: TABLE_NAMES.POST_MEDIA || 'post_media' })
export class PostMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'post_id' })
  postId: string;

  @ManyToOne(() => Post, (post) => post.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({
    type: 'varchar',
    length: 20,
    enum: MediaType,
    name: 'media_type',
    default: MediaType.IMAGE,
  })
  mediaType: MediaType;

  @Column({ type: 'varchar', length: 500, name: 's3_key' })
  s3Key: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true, name: 'thumbnail_url' })
  thumbnailUrl?: string | null;

  @Column({ type: 'int', nullable: true })
  width?: number | null;

  @Column({ type: 'int', nullable: true })
  height?: number | null;

  @Column({ type: 'bigint', nullable: true, name: 'size_bytes' })
  sizeBytes?: number | null;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;
}
```

### 2.5. Entity `PostLike`: `src/database/entities/post-like.entity.ts`
Bảng ghi nhận tương tác thích bài viết kèm ràng buộc Unique Composite Key `(post_id, user_id)`.

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { TABLE_NAMES } from '../../common/constants/module.constant';
import { Post } from './post.entity';
import { User } from './user.entity';

@Entity({ name: TABLE_NAMES.POST_LIKES || 'post_likes' })
@Unique('uq_post_likes_post_user', ['postId', 'userId'])
export class PostLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'post_id' })
  postId: string;

  @ManyToOne(() => Post, (post) => post.likes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;
}
```

---

## 3. Data Transfer Objects (DTO)

### 3.1. `src/modules/post/dto/get-post-upload-url.dto.ts`
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const ALLOWED_POST_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
];

export class GetPostUploadUrlDto {
  @ApiProperty({ example: 'vacation.jpg', description: 'Tên tệp gốc' })
  @IsString()
  @IsNotEmpty({ message: 'Tên file không được để trống' })
  fileName: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'MIME type của tệp tải lên',
    enum: ALLOWED_POST_MIME_TYPES,
  })
  @IsString()
  @IsIn(ALLOWED_POST_MIME_TYPES, {
    message: `Định dạng tệp không được hỗ trợ. Các định dạng hợp lệ: ${ALLOWED_POST_MIME_TYPES.join(', ')}`,
  })
  contentType: string;

  @ApiPropertyOptional({
    example: 2048500,
    description: 'Dung lượng tệp tính bằng byte (Tối đa 50MB)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52428800, { message: 'Dung lượng tệp tối đa là 50MB' })
  fileSize?: number;
}
```

### 3.2. `src/modules/post/dto/upload-post-media-response.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';

export class UploadPostMediaResponseDto {
  @ApiProperty({
    description: 'Presigned S3 PUT URL dùng để upload trực tiếp',
    example: 'https://social-bucket.s3.amazonaws.com/posts/...',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'S3 Key đại diện lưu trong hệ thống',
    example: 'posts/b6a82741-2cbe-4c4f-a9cb-b61005d58ff3/1696200000000-a1b2c3d4-vacation.jpg',
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
```

### 3.3. `src/modules/post/dto/create-post-media.dto.ts`
```typescript
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
    example: 'posts/b6a82741-2cbe-4c4f-a9cb-b61005d58ff3/1696200000000-a1b2c3d4-vacation.jpg',
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
```

### 3.4. `src/modules/post/dto/create-post.dto.ts`
```typescript
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
```

### 3.5. `src/modules/post/dto/update-post.dto.ts`
```typescript
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
```

### 3.6. `src/modules/post/dto/get-feed-query.dto.ts`
```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetFeedQueryDto {
  @ApiPropertyOptional({
    example: 10,
    default: 10,
    description: 'Số lượng bài viết trên mỗi lượt tải (tối đa 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    example: 'eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTAyVDE3OjAwOjAwLjAwMFoiLCJpZCI6ImU0YjNlODEx...'}',
    description: 'Con trỏ cursor (Base64 chuỗi { createdAt, id }) của bài viết cuối cùng trong lần tải trước',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
```

### 3.7. `src/modules/post/dto/post-response.dto.ts`
```typescript
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

  @ApiPropertyOptional({ example: 'Hôm nay thật là một ngày tuyệt vời!', nullable: true })
  content?: string | null;

  @ApiProperty({ enum: PostPrivacy, example: PostPrivacy.PUBLIC })
  privacy: PostPrivacy;

  @ApiProperty({ example: 25 })
  likesCount: number;

  @ApiProperty({ example: 5 })
  commentsCount: number;

  @ApiProperty({ example: 2 })
  sharesCount: number;

  @ApiProperty({ example: false, description: 'Người dùng hiện tại đã bấm thích hay chưa' })
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
```

### 3.8. `src/modules/post/dto/toggle-like-response.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';

export class ToggleLikeResponseDto {
  @ApiProperty({ example: true, description: 'True nếu vừa like, False nếu vừa unlike' })
  liked: boolean;

  @ApiProperty({ example: 26, description: 'Tổng số lượt like của bài viết sau khi thực hiện thao tác' })
  likesCount: number;
}
```

---

## 4. Chi tiết Repositories

### 4.1. `PostRepository`: `src/modules/post/repositories/post.repository.ts`
Kế thừa [BaseRepository](file:///Users/macos/project/personal/aws/social/social-api/src/common/repositories/base.repository.ts):

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { Post, PostPrivacy, PostStatus } from '../../../database/entities/post.entity';

export interface FeedQueryOptions {
  viewerId: string;
  friendIds: string[];
  limit: number;
  cursorCreatedAt?: Date;
  cursorId?: string;
}

@Injectable()
export class PostRepository extends BaseRepository<Post> {
  constructor(
    @InjectRepository(Post)
    repository: Repository<Post>,
  ) {
    super(repository);
  }

  /**
   * Tạo QueryBuilder cơ bản join với User và PostMedia
   */
  private createPostBaseQuery(): SelectQueryBuilder<Post> {
    return this.repository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'author')
      .leftJoinAndSelect('post.media', 'media')
      .where('post.status = :status', { status: PostStatus.ACTIVE })
      .andWhere('post.deletedAt IS NULL');
  }

  /**
   * Lấy danh sách News Feed theo thuật toán quyền riêng tư và Cursor Pagination
   */
  async findNewsFeed(options: FeedQueryOptions): Promise<Post[]> {
    const { viewerId, friendIds, limit, cursorCreatedAt, cursorId } = options;

    const qb = this.createPostBaseQuery();

    // Điều kiện hiển thị quyền riêng tư (Privacy filtering):
    // 1. Bài của chính mình (viewerId)
    // 2. Hoặc bài viết công khai (PUBLIC)
    // 3. Hoặc bài viết dành cho bạn bè (FRIENDS) mà author nằm trong danh sách bạn bè
    if (friendIds.length > 0) {
      qb.andWhere(
        '(post.userId = :viewerId OR post.privacy = :publicPrivacy OR (post.privacy = :friendsPrivacy AND post.userId IN (:...friendIds)))',
        {
          viewerId,
          publicPrivacy: PostPrivacy.PUBLIC,
          friendsPrivacy: PostPrivacy.FRIENDS,
          friendIds,
        },
      );
    } else {
      qb.andWhere(
        '(post.userId = :viewerId OR post.privacy = :publicPrivacy)',
        {
          viewerId,
          publicPrivacy: PostPrivacy.PUBLIC,
        },
      );
    }

    // Áp dụng Cursor Pagination dựa trên cặp khóa (createdAt, id)
    if (cursorCreatedAt && cursorId) {
      qb.andWhere(
        '(post.createdAt < :cursorCreatedAt OR (post.createdAt = :cursorCreatedAt AND post.id < :cursorId))',
        { cursorCreatedAt, cursorId },
      );
    }

    qb.orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .addOrderBy('media.orderIndex', 'ASC')
      .take(limit + 1); // Lấy dư 1 phần tử để xác định hasMore

    return qb.getMany();
  }

  /**
   * Lấy bài viết chi tiết kèm User tác giả và danh sách Media
   */
  async findPostByIdWithDetails(postId: string): Promise<Post | null> {
    return this.createPostBaseQuery()
      .andWhere('post.id = :postId', { postId })
      .addOrderBy('media.orderIndex', 'ASC')
      .getOne();
  }

  /**
   * Lấy danh sách bài viết trên tường nhà của một User cụ thể
   */
  async findUserTimeline(
    targetUserId: string,
    viewerId: string,
    isFriend: boolean,
    limit: number,
    cursorCreatedAt?: Date,
    cursorId?: string,
  ): Promise<Post[]> {
    const qb = this.createPostBaseQuery().andWhere('post.userId = :targetUserId', {
      targetUserId,
    });

    const isOwner = targetUserId === viewerId;
    if (!isOwner) {
      if (isFriend) {
        qb.andWhere('post.privacy IN (:...privacies)', {
          privacies: [PostPrivacy.PUBLIC, PostPrivacy.FRIENDS],
        });
      } else {
        qb.andWhere('post.privacy = :publicPrivacy', {
          publicPrivacy: PostPrivacy.PUBLIC,
        });
      }
    }

    if (cursorCreatedAt && cursorId) {
      qb.andWhere(
        '(post.createdAt < :cursorCreatedAt OR (post.createdAt = :cursorCreatedAt AND post.id < :cursorId))',
        { cursorCreatedAt, cursorId },
      );
    }

    qb.orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .addOrderBy('media.orderIndex', 'ASC')
      .take(limit + 1);

    return qb.getMany();
  }
}
```

### 4.2. `PostMediaRepository`: `src/modules/post/repositories/post-media.repository.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { PostMedia } from '../../../database/entities/post-media.entity';

@Injectable()
export class PostMediaRepository extends BaseRepository<PostMedia> {
  constructor(
    @InjectRepository(PostMedia)
    repository: Repository<PostMedia>,
  ) {
    super(repository);
  }

  async findByPostId(postId: string): Promise<PostMedia[]> {
    return this.repository.find({
      where: { postId },
      order: { orderIndex: 'ASC' },
    });
  }

  async deleteByPostId(postId: string): Promise<boolean> {
    const result = await this.repository.delete({ postId });
    return (result.affected ?? 0) > 0;
  }
}
```

### 4.3. `PostLikeRepository`: `src/modules/post/repositories/post-like.repository.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { PostLike } from '../../../database/entities/post-like.entity';

@Injectable()
export class PostLikeRepository extends BaseRepository<PostLike> {
  constructor(
    @InjectRepository(PostLike)
    repository: Repository<PostLike>,
  ) {
    super(repository);
  }

  async findByPostAndUser(postId: string, userId: string): Promise<PostLike | null> {
    return this.repository.findOne({
      where: { postId, userId },
    });
  }

  /**
   * Lấy danh sách postIds mà userId đã like trong tập hợp cho trước
   */
  async getLikedPostIds(postIds: string[], userId: string): Promise<Set<string>> {
    if (!postIds.length) return new Set();

    const likes = await this.repository
      .createQueryBuilder('like')
      .select('like.postId', 'postId')
      .where('like.userId = :userId', { userId })
      .andWhere('like.postId IN (:...postIds)', { postIds })
      .getRawMany();

    return new Set(likes.map((l) => l.postId));
  }
}
```

---

## 5. Chi tiết Dịch vụ Nghiệp vụ (Services)

### 5.1. `PostService`: `src/modules/post/services/post.service.ts`
Kế thừa [BaseService](file:///Users/macos/project/personal/aws/social/social-api/src/shared/base.service.ts):

```typescript
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseService } from '../../../shared/base.service';
import { Post, PostPrivacy, PostStatus } from '../../../database/entities/post.entity';
import { PostMedia } from '../../../database/entities/post-media.entity';
import { PostRepository } from '../repositories/post.repository';
import { PostLikeRepository } from '../repositories/post-like.repository';
import { S3Service } from '../../../integrations/storage/s3.service';
import { GetPostUploadUrlDto } from '../dto/get-post-upload-url.dto';
import { UploadPostMediaResponseDto } from '../dto/upload-post-media-response.dto';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { GetFeedQueryDto } from '../dto/get-feed-query.dto';
import {
  FeedResponseDto,
  PostResponseDto,
} from '../dto/post-response.dto';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class PostService extends BaseService<Post, PostRepository> {
  private readonly logger = new Logger(PostService.name);

  constructor(
    postRepository: PostRepository,
    private readonly postLikeRepository: PostLikeRepository,
    private readonly s3Service: S3Service,
    private readonly dataSource: DataSource,
  ) {
    super(postRepository);
  }

  /**
   * 1. Sinh S3 Presigned PUT URL để client upload trực tiếp media lên S3
   */
  async generateUploadUrl(
    userId: string,
    dto: GetPostUploadUrlDto,
  ): Promise<UploadPostMediaResponseDto> {
    const ext = path.extname(dto.fileName).toLowerCase();
    const cleanBaseName = path
      .basename(dto.fileName, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueId = randomUUID().slice(0, 8);
    const timestamp = Date.now();

    // Cấu trúc key phân lập theo userId: posts/{userId}/{timestamp}-{uniqueId}-{baseName}{ext}
    const s3Key = `posts/${userId}/${timestamp}-${uniqueId}-${cleanBaseName}${ext}`;
    const expiresIn = 900; // 15 phút

    const uploadUrl = await this.s3Service.getPresignedPutUrl(
      s3Key,
      dto.contentType,
      expiresIn,
    );

    const fileUrl = this.s3Service.getFileUrl(s3Key);

    return {
      uploadUrl,
      s3Key,
      fileUrl,
      expiresIn,
    };
  }

  /**
   * 2. Tạo bài viết mới kèm danh sách Media trong 1 Transaction
   */
  async createPost(userId: string, dto: CreatePostDto): Promise<PostResponseDto> {
    if (!dto.content && (!dto.media || dto.media.length === 0)) {
      throw new BadRequestException('Bài viết phải có ít nhất nội dung văn bản hoặc hình ảnh/video');
    }

    if (dto.media && dto.media.length > 10) {
      throw new BadRequestException('Mỗi bài viết tối đa đính kèm 10 tệp hình ảnh hoặc video');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Tạo Post entity
      const post = queryRunner.manager.create(Post, {
        userId,
        content: dto.content?.trim() || null,
        privacy: dto.privacy || PostPrivacy.PUBLIC,
        status: PostStatus.ACTIVE,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
      });

      const savedPost = await queryRunner.manager.save(post);

      // 2. Tạo các bản ghi PostMedia nếu có
      let savedMedia: PostMedia[] = [];
      if (dto.media && dto.media.length > 0) {
        const mediaEntities = dto.media.map((item, index) =>
          queryRunner.manager.create(PostMedia, {
            postId: savedPost.id,
            mediaType: item.mediaType,
            s3Key: item.s3Key,
            url: item.url,
            thumbnailUrl: item.thumbnailUrl || null,
            width: item.width || null,
            height: item.height || null,
            sizeBytes: item.sizeBytes || null,
            orderIndex: item.orderIndex !== undefined ? item.orderIndex : index,
          }),
        );
        savedMedia = await queryRunner.manager.save(mediaEntities);
      }

      await queryRunner.commitTransaction();

      // Nạp lại đầy đủ quan hệ User để trả về response chuẩn
      const fullPost = await this.repository.findPostByIdWithDetails(savedPost.id);
      return this.mapToPostResponseDto(fullPost!, false);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error creating post for user ${userId}: ${(error as Error).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 3. Lấy News Feed theo Cursor Pagination & Quyền riêng tư
   */
  async getNewsFeed(userId: string, query: GetFeedQueryDto): Promise<FeedResponseDto> {
    const limit = query.limit || 10;
    const { cursorCreatedAt, cursorId } = this.decodeCursor(query.cursor);

    // Lấy danh sách ID bạn bè từ Friend Service (hoặc helper)
    const friendIds = await this.getFriendUserIds(userId);

    const posts = await this.repository.findNewsFeed({
      viewerId: userId,
      friendIds,
      limit,
      cursorCreatedAt,
      cursorId,
    });

    const hasMore = posts.length > limit;
    const itemsToReturn = hasMore ? posts.slice(0, limit) : posts;

    // Kiểm tra trạng thái isLiked của các bài viết với viewer
    const postIds = itemsToReturn.map((p) => p.id);
    const likedSet = await this.postLikeRepository.getLikedPostIds(postIds, userId);

    const mappedItems = itemsToReturn.map((post) =>
      this.mapToPostResponseDto(post, likedSet.has(post.id)),
    );

    let nextCursor: string | null = null;
    if (hasMore && itemsToReturn.length > 0) {
      const lastPost = itemsToReturn[itemsToReturn.length - 1];
      nextCursor = this.encodeCursor(lastPost.createdAt, lastPost.id);
    }

    return {
      items: mappedItems,
      pagination: {
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * 4. Xem chi tiết bài viết (áp dụng kiểm tra phân quyền riêng tư)
   */
  async getPostById(postId: string, viewerId: string): Promise<PostResponseDto> {
    const post = await this.repository.findPostByIdWithDetails(postId);
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    // Kiểm tra quyền xem bài viết
    await this.validateViewerAccess(post, viewerId);

    const isLiked = !!(await this.postLikeRepository.findByPostAndUser(postId, viewerId));
    return this.mapToPostResponseDto(post, isLiked);
  }

  /**
   * 5. Chỉnh sửa bài viết (chỉ chủ bài viết mới được sửa)
   */
  async updatePost(
    postId: string,
    userId: string,
    dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.repository.findPostByIdWithDetails(postId);
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    if (post.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bài viết này');
    }

    if (dto.content !== undefined) {
      post.content = dto.content.trim() || null;
    }
    if (dto.privacy) {
      post.privacy = dto.privacy;
    }

    await this.repository.getRepository().save(post);
    const isLiked = !!(await this.postLikeRepository.findByPostAndUser(postId, userId));
    return this.mapToPostResponseDto(post, isLiked);
  }

  /**
   * 6. Xóa bài viết (Soft Delete)
   */
  async deletePost(postId: string, userId: string): Promise<{ message: string }> {
    const post = await this.repository.findById(postId);
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }

    if (post.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa bài viết này');
    }

    await this.repository.softDelete(postId);
    return { message: 'Đã xóa bài viết thành công' };
  }

  // ===================== Helpers =====================

  private async validateViewerAccess(post: Post, viewerId: string): Promise<void> {
    if (post.userId === viewerId) return; // Chính chủ luôn có quyền xem

    if (post.privacy === PostPrivacy.PUBLIC) return;

    if (post.privacy === PostPrivacy.PRIVATE) {
      throw new ForbiddenException('Bài viết này đang ở chế độ riêng tư');
    }

    if (post.privacy === PostPrivacy.FRIENDS) {
      const isFriend = await this.checkIsFriend(viewerId, post.userId);
      if (!isFriend) {
        throw new ForbiddenException('Bài viết này chỉ hiển thị với bạn bè của tác giả');
      }
    }
  }

  /**
   * Lấy danh sách ID bạn bè từ cơ sở dữ liệu quan hệ kết bạn
   */
  private async getFriendUserIds(userId: string): Promise<string[]> {
    // Có thể inject FriendService hoặc truy vấn trực tiếp bảng friendships khi cần
    // Mặc định trả về mảng rỗng nếu module Friend chưa khởi tạo
    return [];
  }

  private async checkIsFriend(userId1: string, userId2: string): Promise<boolean> {
    // Tích hợp kiểm tra quan hệ bạn bè status = 'ACCEPTED'
    return false;
  }

  private encodeCursor(createdAt: Date, id: string): string {
    const payload = JSON.stringify({ createdAt: createdAt.toISOString(), id });
    return Buffer.from(payload).toString('base64');
  }

  private decodeCursor(cursor?: string): { cursorCreatedAt?: Date; cursorId?: string } {
    if (!cursor) return {};
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const obj = JSON.parse(decoded);
      return {
        cursorCreatedAt: new Date(obj.createdAt),
        cursorId: obj.id,
      };
    } catch {
      return {};
    }
  }

  private mapToPostResponseDto(post: Post, isLiked: boolean): PostResponseDto {
    return {
      id: post.id,
      author: {
        id: post.user?.id || post.userId,
        username: post.user?.username || '',
        fullName: post.user?.fullName || '',
        avatarUrl: post.user?.avatarUrl || null,
      },
      content: post.content,
      privacy: post.privacy,
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      sharesCount: post.sharesCount || 0,
      isLiked,
      media: (post.media || []).map((m) => ({
        id: m.id,
        mediaType: m.mediaType,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        width: m.width,
        height: m.height,
        orderIndex: m.orderIndex,
      })),
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }
}
```

### 5.2. `PostLikeService`: `src/modules/post/services/post-like.service.ts`
Chịu trách nhiệm thực hiện hành động Thích / Bỏ thích với đảm bảo tính nguyên tử (Atomicity), chống race condition khi cập nhật `likes_count`.

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Post, PostStatus } from '../../../database/entities/post.entity';
import { PostLike } from '../../../database/entities/post-like.entity';
import { PostLikeRepository } from '../repositories/post-like.repository';
import { ToggleLikeResponseDto } from '../dto/toggle-like-response.dto';

@Injectable()
export class PostLikeService {
  private readonly logger = new Logger(PostLikeService.name);

  constructor(
    private readonly postLikeRepository: PostLikeRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Chuyển đổi trạng thái Thích / Bỏ thích của một bài viết trong một Transaction
   */
  async toggleLike(postId: string, userId: string): Promise<ToggleLikeResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Kiểm tra bài viết có tồn tại và đang hoạt động không
      const post = await queryRunner.manager.findOne(Post, {
        where: { id: postId, status: PostStatus.ACTIVE },
      });

      if (!post) {
        throw new NotFoundException('Không tìm thấy bài viết hoặc bài viết đã bị ẩn/xóa');
      }

      // 2. Tìm bản ghi like hiện tại
      const existingLike = await queryRunner.manager.findOne(PostLike, {
        where: { postId, userId },
      });

      let liked: boolean;
      let newLikesCount: number;

      if (!existingLike) {
        // Chưa thích -> Tiến hành LIKE
        const newLike = queryRunner.manager.create(PostLike, { postId, userId });
        await queryRunner.manager.save(newLike);

        // Tăng atomic likes_count
        await queryRunner.manager
          .createQueryBuilder()
          .update(Post)
          .set({ likesCount: () => 'likes_count + 1' })
          .where('id = :postId', { postId })
          .execute();

        liked = true;
        newLikesCount = (post.likesCount || 0) + 1;

        // Nếu người thích khác tác giả bài viết, đẩy sự kiện thông báo (Notification Event)
        if (post.userId !== userId) {
          this.sendLikeNotification(post.userId, userId, postId);
        }
      } else {
        // Đã thích -> Tiến hành UNLIKE
        await queryRunner.manager.delete(PostLike, { id: existingLike.id });

        // Giảm atomic likes_count, dùng GREATEST(0, likes_count - 1) để tránh số âm
        await queryRunner.manager
          .createQueryBuilder()
          .update(Post)
          .set({ likesCount: () => 'GREATEST(0, likes_count - 1)' })
          .where('id = :postId', { postId })
          .execute();

        liked = false;
        newLikesCount = Math.max(0, (post.likesCount || 0) - 1);
      }

      await queryRunner.commitTransaction();

      return {
        liked,
        likesCount: newLikesCount,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error toggling like for post ${postId} by user ${userId}: ${(error as Error).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private sendLikeNotification(authorId: string, likerId: string, postId: string) {
    // Có thể publish event lên RabbitMQ, Redis Pub/Sub hoặc gọi NotificationService
    this.logger.log(`Dispatch notification LIKE_POST: user ${likerId} liked post ${postId} of author ${authorId}`);
  }
}
```

---

## 6. Controller & Định tuyến API

### File: `src/modules/post/post.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostService } from './services/post.service';
import { PostLikeService } from './services/post-like.service';
import { GetPostUploadUrlDto } from './dto/get-post-upload-url.dto';
import { UploadPostMediaResponseDto } from './dto/upload-post-media-response.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { GetFeedQueryDto } from './dto/get-feed-query.dto';
import {
  FeedResponseDto,
  PostResponseDto,
} from './dto/post-response.dto';
import { ToggleLikeResponseDto } from './dto/toggle-like-response.dto';

@ApiTags('Posts')
@ApiBearerAuth()
@Controller('posts')
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly postLikeService: PostLikeService,
  ) {}

  @Post('media/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '1. Xin Presigned S3 URL để tải hình ảnh/video đính kèm cho bài viết',
  })
  @ApiResponse({ status: 200, type: UploadPostMediaResponseDto })
  async getUploadUrl(
    @CurrentUser('userId') userId: string,
    @Body() dto: GetPostUploadUrlDto,
  ): Promise<UploadPostMediaResponseDto> {
    return this.postService.generateUploadUrl(userId, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '2. Tạo bài viết mới' })
  @ApiResponse({ status: 201, type: PostResponseDto })
  async createPost(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    return this.postService.createPost(userId, dto);
  }

  @Get('feed')
  @ApiOperation({ summary: '3. Lấy News Feed bài viết theo Cursor Pagination' })
  @ApiResponse({ status: 200, type: FeedResponseDto })
  async getFeed(
    @CurrentUser('userId') userId: string,
    @Query() query: GetFeedQueryDto,
  ): Promise<FeedResponseDto> {
    return this.postService.getNewsFeed(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '4. Xem chi tiết bài viết' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({ status: 200, type: PostResponseDto })
  async getPostById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') viewerId: string,
  ): Promise<PostResponseDto> {
    return this.postService.getPostById(id, viewerId);
  }

  @Patch(':id')
  @ApiOperation({ summary: '5. Chỉnh sửa nội dung & quyền riêng tư bài viết' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({ status: 200, type: PostResponseDto })
  async updatePost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    return this.postService.updatePost(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '6. Xóa bài viết (Soft Delete)' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({ status: 200, description: 'Xóa bài viết thành công' })
  async deletePost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<{ message: string }> {
    return this.postService.deletePost(id, userId);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '7. Bật / Tắt thích bài viết (Toggle Like)' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({ status: 200, type: ToggleLikeResponseDto })
  async toggleLike(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<ToggleLikeResponseDto> {
    return this.postLikeService.toggleLike(id, userId);
  }
}
```

---

## 7. Khai báo Module (`src/modules/post/post.module.ts`)

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../../database/entities/post.entity';
import { PostMedia } from '../../database/entities/post-media.entity';
import { PostLike } from '../../database/entities/post-like.entity';
import { StorageModule } from '../../integrations/storage/storage.module';
import { PostController } from './post.controller';
import { PostService } from './services/post.service';
import { PostLikeService } from './services/post-like.service';
import { PostRepository } from './repositories/post.repository';
import { PostMediaRepository } from './repositories/post-media.repository';
import { PostLikeRepository } from './repositories/post-like.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PostMedia, PostLike]),
    StorageModule,
  ],
  controllers: [PostController],
  providers: [
    PostRepository,
    PostMediaRepository,
    PostLikeRepository,
    PostService,
    PostLikeService,
  ],
  exports: [PostService, PostRepository],
})
export class PostModule {}
```

---

## 8. Quy chuẩn & Kỹ thuật chi tiết

### 8.1. AWS S3 Presigned URL Lifecycle
1. **Request URL**: Client gọi `POST /api/v1/posts/media/upload-url` với metadata (`fileName`, `contentType`, `fileSize`).
2. **Kiểm tra MIME**: Server xác thực định dạng file thuộc danh sách cho phép (JPEG, PNG, WebP, GIF, MP4, MOV).
3. **Phân lập đường dẫn S3 Key**:
   - `posts/{userId}/{timestamp}-{randomId}-{cleanName}.ext`
   - Đảm bảo một người dùng không bao giờ can thiệp hoặc ghi đè tệp của người khác.
4. **Direct Upload**:
   - Client thực hiện `PUT` payload trực tiếp lên endpoint S3 từ trình duyệt hoặc thiết bị di động.
   - Tránh việc luân chuyển video nặng hàng chục MB qua server API, tiết kiệm tối đa CPU & Network bandwidth của backend.
5. **Gắn kết**: Client lấy `s3Key` và `fileUrl` từ bước 1 gửi vào request `POST /api/v1/posts` để lưu quan hệ dữ liệu trong cơ sở dữ liệu.

### 8.2. Giải thuật Phân trang Cursor (Cursor-based Pagination)
- **Cấu trúc Cursor**: Chuỗi JSON Base64 chứa `createdAt` và `id` của bài viết cuối cùng trong trang hiện tại:
  ```json
  {"createdAt":"2026-10-02T17:00:00.000Z","id":"e4b3e811-9a42-4f36-8a71-6c1cf6ec32b9"}
  ```
- **Mệnh đề WHERE Query**:
  ```sql
  WHERE (post.created_at < :cursorCreatedAt OR (post.created_at = :cursorCreatedAt AND post.id < :cursorId))
  ORDER BY post.created_at DESC, post.id DESC
  LIMIT :limit + 1;
  ```
- **Ưu điểm**:
  - Không bị suy giảm hiệu năng khi duyệt bảng hàng triệu bản ghi (so với `OFFSET` lớn).
  - Không gặp hiện tượng trùng lặp hoặc sót bài viết khi người dùng khác tạo bài viết mới trong lúc duyệt trang.

### 8.3. Ma trận Quyền riêng tư (Privacy Matrix)

| Quyền bài viết | Người xem là Tác giả | Người xem là Bạn bè | Người dùng vãng lai | Người dùng bị chặn (Blocked) |
| :--- | :---: | :---: | :---: | :---: |
| `PUBLIC` | Cho phép xem | Cho phép xem | Cho phép xem | Từ chối |
| `FRIENDS` | Cho phép xem | Cho phép xem | Từ chối (403) | Từ chối |
| `PRIVATE` | Cho phép xem | Từ chối (403) | Từ chối (403) | Từ chối |

---

## 9. Ma trận Kiểm thử (Test Cases Matrix)

| STT | Endpoint / Nghiệp vụ | Kịch bản kiểm thử | Dữ liệu đầu vào | Kết quả mong đợi |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `POST /posts/media/upload-url` | Xin upload URL thành công | Tên file hợp lệ, `image/jpeg` | HTTP 200, trả về `uploadUrl` có chữ ký S3 và `s3Key` |
| 2 | `POST /posts/media/upload-url` | File định dạng không hợp lệ | `contentType: "application/x-msdownload"` | HTTP 400 Validation Error |
| 3 | `POST /posts` | Tạo bài viết đầy đủ văn bản và media | `content: "Hello"`, mảng media 2 items | HTTP 201, trả về Post entity đầy đủ `author` và `media` |
| 4 | `POST /posts` | Tạo bài viết không nội dung và không media | `content: ""`, `media: []` | HTTP 400 Bad Request |
| 5 | `POST /posts` | Đính kèm vượt quá 10 media | Mảng media 11 items | HTTP 400 Bad Request |
| 6 | `GET /posts/feed` | Lấy bảng tin lượt đầu (chưa truyền cursor) | `limit: 10` | HTTP 200, danh sách 10 bài viết, có `nextCursor` |
| 7 | `GET /posts/feed` | Lấy trang tiếp theo với cursor | `limit: 10`, `cursor: "eyJjcmVhdG..."` | HTTP 200, trang tiếp theo không trùng lặp bài viết trước |
| 8 | `GET /posts/:id` | Xem chi tiết bài viết công khai | Post ID hợp lệ, `privacy = PUBLIC` | HTTP 200, chi tiết post, `isLiked` đúng trạng thái |
| 9 | `GET /posts/:id` | Xem chi tiết bài viết PRIVATE của người khác | Post ID của user khác có `privacy = PRIVATE` | HTTP 403 Forbidden |
| 10 | `PATCH /posts/:id` | Tác giả chỉnh sửa bài viết | User ID trùng `userId` của post | HTTP 200, nội dung và privacy được cập nhật |
| 11 | `PATCH /posts/:id` | Người khác cố tình sửa bài viết | User ID khác `userId` của post | HTTP 403 Forbidden |
| 12 | `DELETE /posts/:id` | Tác giả xóa bài viết | User ID trùng `userId` của post | HTTP 200, `deleted_at` được gán giá trị thời gian |
| 13 | `DELETE /posts/:id` | Người khác cố tình xóa bài viết | User ID khác `userId` của post | HTTP 403 Forbidden |
| 14 | `POST /posts/:id/like` | Like bài viết lần đầu | Post ID hợp lệ | HTTP 200, `liked: true`, `likesCount` tăng 1 |
| 15 | `POST /posts/:id/like` | Bỏ like (Unlike) bài viết đã like trước đó | Post ID hợp lệ, user đã like | HTTP 200, `liked: false`, `likesCount` giảm 1 |
| 16 | `POST /posts/:id/like` | Thao tác đồng thời nhiều like (Race condition) | 5 requests cùng lúc từ các user khác nhau | `likesCount` tăng đúng 5, không mất mát dữ liệu |
