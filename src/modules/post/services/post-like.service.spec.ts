import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: unknown) => entity,
}));

import { PostLikeService } from './post-like.service';
import { PostLikeRepository } from '../repositories/post-like.repository';
import {
  Post,
  PostPrivacy,
  PostStatus,
} from '../../../database/entities/post.entity';
import { PostNotFoundException } from '../../../common/exceptions/post.exception';

describe('PostLikeService', () => {
  let postLikeService: PostLikeService;
  let postLikeRepository: jest.Mocked<Partial<PostLikeRepository>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let mockQueryRunner: any;

  const mockPost: Post = {
    id: 'post-uuid-1',
    userId: 'author-uuid-1',
    user: null as any,
    content: 'Post to like',
    privacy: PostPrivacy.PUBLIC,
    status: PostStatus.ACTIVE,
    likesCount: 10,
    commentsCount: 0,
    sharesCount: 0,
    media: [],
    likes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    postLikeRepository = {
      findByPostAndUser: jest.fn(),
    };

    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        create: jest.fn().mockImplementation((cls, data) => data),
        save: jest.fn().mockResolvedValue({ id: 'like-1' }),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostLikeService,
        { provide: PostLikeRepository, useValue: postLikeRepository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    postLikeService = module.get<PostLikeService>(PostLikeService);
  });

  it('ném lỗi PostNotFoundException nếu bài viết không tồn tại', async () => {
    mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);

    await expect(
      postLikeService.toggleLike('non-existent-id', 'user-1'),
    ).rejects.toThrow(PostNotFoundException);
  });

  it('thực hiện Like khi bài viết chưa được thích trước đó', async () => {
    // 1st findOne: Post
    mockQueryRunner.manager.findOne.mockResolvedValueOnce({ ...mockPost });
    // 2nd findOne: PostLike (null)
    mockQueryRunner.manager.findOne.mockResolvedValueOnce(null);

    const result = await postLikeService.toggleLike(
      'post-uuid-1',
      'user-uuid-2',
    );

    expect(result.liked).toBe(true);
    expect(result.likesCount).toBe(11);
    expect(mockQueryRunner.manager.save).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('thực hiện Unlike khi bài viết đã được thích trước đó', async () => {
    // 1st findOne: Post
    mockQueryRunner.manager.findOne.mockResolvedValueOnce({ ...mockPost });
    // 2nd findOne: PostLike (exists)
    mockQueryRunner.manager.findOne.mockResolvedValueOnce({
      id: 'existing-like-id',
      postId: 'post-uuid-1',
      userId: 'user-uuid-2',
    });

    const result = await postLikeService.toggleLike(
      'post-uuid-1',
      'user-uuid-2',
    );

    expect(result.liked).toBe(false);
    expect(result.likesCount).toBe(9);
    expect(mockQueryRunner.manager.delete).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });
});
