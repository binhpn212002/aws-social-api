import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  Post,
  PostPrivacy,
  PostStatus,
} from '../../../database/entities/post.entity';

export interface FeedQueryOptions {
  viewerId?: string;
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
    // 1. Khi chưa đăng nhập (viewerId không có): Chỉ lấy bài viết công khai (PUBLIC)
    // 2. Khi đã đăng nhập:
    //    - Bài của chính mình (viewerId)
    //    - Hoặc bài viết công khai (PUBLIC)
    //    - Hoặc bài viết dành cho bạn bè (FRIENDS) mà author nằm trong danh sách bạn bè
    if (viewerId) {
      if (friendIds && friendIds.length > 0) {
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
    } else {
      qb.andWhere('post.privacy = :publicPrivacy', {
        publicPrivacy: PostPrivacy.PUBLIC,
      });
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
      .take(limit + 1);

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
    const qb = this.createPostBaseQuery().andWhere(
      'post.userId = :targetUserId',
      {
        targetUserId,
      },
    );

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
