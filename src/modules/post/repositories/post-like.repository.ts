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

  async findByPostAndUser(
    postId: string,
    userId: string,
  ): Promise<PostLike | null> {
    return this.repository.findOne({
      where: { postId, userId },
    });
  }

  /**
   * Lấy danh sách postIds mà userId đã like trong tập hợp cho trước
   */
  async getLikedPostIds(
    postIds: string[],
    userId: string,
  ): Promise<Set<string>> {
    if (!postIds || postIds.length === 0) return new Set();

    const likes: Array<{ postId: string }> = await this.repository
      .createQueryBuilder('like')
      .select('like.postId', 'postId')
      .where('like.userId = :userId', { userId })
      .andWhere('like.postId IN (:...postIds)', { postIds })
      .getRawMany();

    return new Set(likes.map((l) => l.postId));
  }
}
