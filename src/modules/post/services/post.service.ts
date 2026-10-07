import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseService } from '../../../shared/base.service';
import {
  Post,
  PostPrivacy,
  PostStatus,
} from '../../../database/entities/post.entity';
import { PostMedia } from '../../../database/entities/post-media.entity';
import { PostRepository } from '../repositories/post.repository';
import { PostLikeRepository } from '../repositories/post-like.repository';
import { S3Service } from '../../../integrations/storage/s3.service';
import { GetPostUploadUrlDto } from '../dto/get-post-upload-url.dto';
import { UploadPostMediaResponseDto } from '../dto/upload-post-media-response.dto';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { GetFeedQueryDto } from '../dto/get-feed-query.dto';
import { FeedResponseDto, PostResponseDto } from '../dto/post-response.dto';
import {
  PostForbiddenException,
  PostNotFoundException,
} from '../../../common/exceptions/post.exception';
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
  async createPost(
    userId: string,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    if (!dto.content && (!dto.media || dto.media.length === 0)) {
      throw new BadRequestException(
        'Bài viết phải có ít nhất nội dung văn bản hoặc hình ảnh/video',
      );
    }

    if (dto.media && dto.media.length > 10) {
      throw new BadRequestException(
        'Mỗi bài viết tối đa đính kèm 10 tệp hình ảnh hoặc video',
      );
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
        await queryRunner.manager.save(mediaEntities);
      }

      await queryRunner.commitTransaction();

      // Nạp lại đầy đủ quan hệ User để trả về response chuẩn
      const fullPost = await this.repository.findPostByIdWithDetails(
        savedPost.id,
      );
      return this.mapToPostResponseDto(fullPost!, false);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error creating post for user ${userId}: ${(error as Error).message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 3. Lấy News Feed theo Cursor Pagination & Quyền riêng tư (hỗ trợ cả khách vãng lai chưa đăng nhập)
   */
  async getNewsFeed(
    userId: string | null | undefined,
    query: GetFeedQueryDto,
  ): Promise<FeedResponseDto> {
    const limit = query.limit || 10;
    const { cursorCreatedAt, cursorId } = this.decodeCursor(query.cursor);

    // Lấy danh sách ID bạn bè nếu đã đăng nhập
    const friendIds = userId ? await this.getFriendUserIds(userId) : [];

    const posts = await this.repository.findNewsFeed({
      viewerId: userId || undefined,
      friendIds,
      limit,
      cursorCreatedAt,
      cursorId,
    });

    const hasMore = posts.length > limit;
    const itemsToReturn = hasMore ? posts.slice(0, limit) : posts;

    // Kiểm tra trạng thái isLiked của các bài viết với viewer (nếu có userId)
    const postIds = itemsToReturn.map((p) => p.id);
    const likedSet = userId
      ? await this.postLikeRepository.getLikedPostIds(postIds, userId)
      : new Set<string>();

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
  async getPostById(
    postId: string,
    viewerId: string | null | undefined,
  ): Promise<PostResponseDto> {
    const post = await this.repository.findPostByIdWithDetails(postId);
    if (!post) {
      throw new PostNotFoundException();
    }

    // Kiểm tra quyền xem bài viết
    await this.validateViewerAccess(post, viewerId);

    const isLiked = viewerId
      ? !!(await this.postLikeRepository.findByPostAndUser(postId, viewerId))
      : false;
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
      throw new PostNotFoundException();
    }

    if (post.userId !== userId) {
      throw new PostForbiddenException(
        'Bạn không có quyền chỉnh sửa bài viết này',
      );
    }

    if (dto.content !== undefined) {
      post.content = dto.content.trim() || null;
    }
    if (dto.privacy) {
      post.privacy = dto.privacy;
    }

    await this.repository.getRepository().save(post);
    const isLiked = !!(await this.postLikeRepository.findByPostAndUser(
      postId,
      userId,
    ));
    return this.mapToPostResponseDto(post, isLiked);
  }

  /**
   * 6. Xóa bài viết (Soft Delete)
   */
  async deletePost(
    postId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const post = await this.repository.findById(postId);
    if (!post) {
      throw new PostNotFoundException();
    }

    if (post.userId !== userId) {
      throw new PostForbiddenException('Bạn không có quyền xóa bài viết này');
    }

    await this.repository.softDelete(postId);
    return { message: 'Đã xóa bài viết thành công' };
  }

  /**
   * 7. Lấy bài viết trên trang cá nhân của một người dùng
   */
  async getUserTimeline(
    targetUserId: string,
    viewerId: string,
    query: GetFeedQueryDto,
  ): Promise<FeedResponseDto> {
    const limit = query.limit || 10;
    const { cursorCreatedAt, cursorId } = this.decodeCursor(query.cursor);
    const isFriend = await this.checkIsFriend(viewerId, targetUserId);

    const posts = await this.repository.findUserTimeline(
      targetUserId,
      viewerId,
      isFriend,
      limit,
      cursorCreatedAt,
      cursorId,
    );

    const hasMore = posts.length > limit;
    const itemsToReturn = hasMore ? posts.slice(0, limit) : posts;

    const postIds = itemsToReturn.map((p) => p.id);
    const likedSet = await this.postLikeRepository.getLikedPostIds(
      postIds,
      viewerId,
    );

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

  // ===================== Helpers =====================

  private async validateViewerAccess(
    post: Post,
    viewerId?: string | null,
  ): Promise<void> {
    if (viewerId && post.userId === viewerId) return; // Chính chủ luôn có quyền xem

    if (post.privacy === PostPrivacy.PUBLIC) return;

    if (!viewerId) {
      throw new PostForbiddenException('Vui lòng đăng nhập để xem bài viết này');
    }

    if (post.privacy === PostPrivacy.PRIVATE) {
      throw new PostForbiddenException('Bài viết này đang ở chế độ riêng tư');
    }

    if (post.privacy === PostPrivacy.FRIENDS) {
      const isFriend = await this.checkIsFriend(viewerId, post.userId);
      if (!isFriend) {
        throw new PostForbiddenException(
          'Bài viết này chỉ hiển thị với bạn bè của tác giả',
        );
      }
    }
  }

  /**
   * Lấy danh sách ID bạn bè
   */
  private async getFriendUserIds(userId: string): Promise<string[]> {
    try {
      // Truy vấn an toàn bảng friendships nếu tồn tại
      const friendships: Array<{ friend_id: string }> =
        await this.dataSource.query(
          `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END as friend_id
         FROM friendships
         WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'ACCEPTED'`,
          [userId],
        );
      return friendships.map((r) => r.friend_id);
    } catch {
      // Nếu bảng friendships chưa được migrate, fallback trả về mảng rỗng
      return [];
    }
  }

  private async checkIsFriend(
    userId1?: string | null,
    userId2?: string | null,
  ): Promise<boolean> {
    if (!userId1 || !userId2) return false;
    if (userId1 === userId2) return true;
    try {
      const result: unknown[] = await this.dataSource.query(
        `SELECT 1 FROM friendships
         WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))
           AND status = 'ACCEPTED' LIMIT 1`,
        [userId1, userId2],
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }

  private encodeCursor(createdAt: Date, id: string): string {
    const payload = JSON.stringify({ createdAt: createdAt.toISOString(), id });
    return Buffer.from(payload).toString('base64');
  }

  private decodeCursor(cursor?: string): {
    cursorCreatedAt?: Date;
    cursorId?: string;
  } {
    if (!cursor) return {};
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const obj = JSON.parse(decoded) as Record<string, unknown>;
      if (
        obj &&
        typeof obj.createdAt === 'string' &&
        typeof obj.id === 'string'
      ) {
        return {
          cursorCreatedAt: new Date(obj.createdAt),
          cursorId: obj.id,
        };
      }
      return {};
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
        thumbnailUrl: m.thumbnailUrl || null,
        width: m.width || null,
        height: m.height || null,
        orderIndex: m.orderIndex,
      })),
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }
}
