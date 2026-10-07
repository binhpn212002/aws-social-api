import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Post, PostStatus } from '../../../database/entities/post.entity';
import { PostLike } from '../../../database/entities/post-like.entity';
import { PostLikeRepository } from '../repositories/post-like.repository';
import { ToggleLikeResponseDto } from '../dto/toggle-like-response.dto';
import { PostNotFoundException } from '../../../common/exceptions/post.exception';

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
  async toggleLike(
    postId: string,
    userId: string,
  ): Promise<ToggleLikeResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Kiểm tra bài viết có tồn tại và đang hoạt động không
      const post = await queryRunner.manager.findOne(Post, {
        where: { id: postId, status: PostStatus.ACTIVE },
      });

      if (!post) {
        throw new PostNotFoundException(
          'Không tìm thấy bài viết hoặc bài viết đã bị ẩn/xóa',
        );
      }

      // 2. Tìm bản ghi like hiện tại
      const existingLike = await queryRunner.manager.findOne(PostLike, {
        where: { postId, userId },
      });

      let liked: boolean;
      let newLikesCount: number;

      if (!existingLike) {
        // Chưa thích -> Tiến hành LIKE
        const newLike = queryRunner.manager.create(PostLike, {
          postId,
          userId,
        });
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

        // Nếu người thích khác tác giả bài viết, ghi log/phát event thông báo
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
      this.logger.error(
        `Error toggling like for post ${postId} by user ${userId}: ${(error as Error).message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private sendLikeNotification(
    authorId: string,
    likerId: string,
    postId: string,
  ) {
    this.logger.log(
      `Dispatch notification LIKE_POST: user ${likerId} liked post ${postId} of author ${authorId}`,
    );
  }
}
