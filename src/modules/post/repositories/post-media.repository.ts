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
