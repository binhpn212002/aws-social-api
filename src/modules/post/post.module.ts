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
  exports: [PostService, PostRepository, PostLikeRepository],
})
export class PostModule {}
