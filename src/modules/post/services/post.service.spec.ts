import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: unknown) => entity,
}));

import { PostService } from './post.service';
import { PostRepository } from '../repositories/post.repository';
import { PostLikeRepository } from '../repositories/post-like.repository';
import { S3Service } from '../../../integrations/storage/s3.service';
import {
  Post,
  PostPrivacy,
  PostStatus,
} from '../../../database/entities/post.entity';
import { MediaType } from '../../../database/entities/post-media.entity';
import {
  PostForbiddenException,
  PostNotFoundException,
} from '../../../common/exceptions/post.exception';

describe('PostService', () => {
  let postService: PostService;
  let postRepository: jest.Mocked<Partial<PostRepository>>;
  let postLikeRepository: jest.Mocked<Partial<PostLikeRepository>>;
  let s3Service: jest.Mocked<Partial<S3Service>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;

  const mockAuthor = {
    id: 'user-uuid-1',
    username: 'john_doe',
    fullName: 'John Doe',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  const mockPost: Post = {
    id: 'post-uuid-1',
    userId: 'user-uuid-1',
    user: mockAuthor as any,
    content: 'Hello world post',
    privacy: PostPrivacy.PUBLIC,
    status: PostStatus.ACTIVE,
    likesCount: 5,
    commentsCount: 2,
    sharesCount: 0,
    media: [
      {
        id: 'media-uuid-1',
        postId: 'post-uuid-1',
        post: null as any,
        mediaType: MediaType.IMAGE,
        s3Key: 'posts/user-uuid-1/test.jpg',
        url: 'https://example.com/test.jpg',
        thumbnailUrl: null,
        width: 1920,
        height: 1080,
        sizeBytes: 1024,
        orderIndex: 0,
        createdAt: new Date(),
      },
    ],
    likes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    postRepository = {
      findNewsFeed: jest.fn(),
      findPostByIdWithDetails: jest.fn(),
      findUserTimeline: jest.fn(),
      findById: jest.fn(),
      softDelete: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        save: jest.fn().mockResolvedValue(mockPost),
      }),
    };

    postLikeRepository = {
      findByPostAndUser: jest.fn(),
      getLikedPostIds: jest.fn(),
    };

    s3Service = {
      getPresignedPutUrl: jest
        .fn()
        .mockResolvedValue('https://s3.amazonaws.com/upload-presigned-url'),
      getFileUrl: jest
        .fn()
        .mockReturnValue('https://s3.amazonaws.com/posts/file.jpg'),
    };

    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        create: jest.fn().mockImplementation((entityClass, data) => data),
        save: jest.fn().mockImplementation((data) => {
          if (Array.isArray(data)) return Promise.resolve(data);
          return Promise.resolve({ ...data, id: 'post-uuid-1' });
        }),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      query: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        { provide: PostRepository, useValue: postRepository },
        { provide: PostLikeRepository, useValue: postLikeRepository },
        { provide: S3Service, useValue: s3Service },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    postService = module.get<PostService>(PostService);
  });

  describe('generateUploadUrl', () => {
    it('sinh Presigned PUT URL và S3 key đúng định dạng phân lập user', async () => {
      const result = await postService.generateUploadUrl('user-123', {
        fileName: 'vacation.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.uploadUrl).toBe(
        'https://s3.amazonaws.com/upload-presigned-url',
      );
      expect(result.s3Key).toMatch(
        /^posts\/user-123\/\d+-[a-f0-9]+-vacation\.jpg$/,
      );
      expect(result.expiresIn).toBe(900);
      expect(s3Service.getPresignedPutUrl).toHaveBeenCalled();
    });
  });

  describe('createPost', () => {
    it('báo lỗi BadRequestException khi cả nội dung và media đều trống', async () => {
      await expect(
        postService.createPost('user-123', { content: '', media: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('báo lỗi BadRequestException khi số lượng media vượt quá 10', async () => {
      const mediaList = Array(11).fill({
        s3Key: 'key',
        mediaType: MediaType.IMAGE,
        url: 'https://example.com/1.jpg',
      });

      await expect(
        postService.createPost('user-123', {
          content: 'test',
          media: mediaList,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('tạo bài viết thành công kèm media trong transaction', async () => {
      postRepository.findPostByIdWithDetails = jest
        .fn()
        .mockResolvedValue(mockPost);

      const result = await postService.createPost('user-uuid-1', {
        content: 'Hello world post',
        privacy: PostPrivacy.PUBLIC,
        media: [
          {
            s3Key: 'posts/user-uuid-1/test.jpg',
            mediaType: MediaType.IMAGE,
            url: 'https://example.com/test.jpg',
          },
        ],
      });

      expect(result.id).toBe('post-uuid-1');
      expect(result.content).toBe('Hello world post');
      expect(result.media).toHaveLength(1);
    });
  });

  describe('getNewsFeed', () => {
    it('trả về danh sách bài viết kèm nextCursor và trạng thái isLiked', async () => {
      postRepository.findNewsFeed = jest.fn().mockResolvedValue([mockPost]);
      postLikeRepository.getLikedPostIds = jest
        .fn()
        .mockResolvedValue(new Set(['post-uuid-1']));

      const result = await postService.getNewsFeed('user-uuid-1', {
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].isLiked).toBe(true);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('getPostById', () => {
    it('ném lỗi PostNotFoundException khi bài viết không tồn tại', async () => {
      postRepository.findPostByIdWithDetails = jest
        .fn()
        .mockResolvedValue(null);

      await expect(
        postService.getPostById('non-existent-id', 'user-uuid-1'),
      ).rejects.toThrow(PostNotFoundException);
    });

    it('cho phép xem bài viết PUBLIC', async () => {
      postRepository.findPostByIdWithDetails = jest
        .fn()
        .mockResolvedValue(mockPost);
      postLikeRepository.findByPostAndUser = jest.fn().mockResolvedValue(null);

      const result = await postService.getPostById(
        'post-uuid-1',
        'viewer-uuid-2',
      );

      expect(result.id).toBe('post-uuid-1');
      expect(result.isLiked).toBe(false);
    });

    it('từ chối xem bài viết PRIVATE nếu không phải chính chủ', async () => {
      const privatePost = { ...mockPost, privacy: PostPrivacy.PRIVATE };
      postRepository.findPostByIdWithDetails = jest
        .fn()
        .mockResolvedValue(privatePost);

      await expect(
        postService.getPostById('post-uuid-1', 'viewer-uuid-2'),
      ).rejects.toThrow(PostForbiddenException);
    });
  });

  describe('updatePost', () => {
    it('từ chối người dùng khác sửa bài viết', async () => {
      postRepository.findPostByIdWithDetails = jest
        .fn()
        .mockResolvedValue(mockPost);

      await expect(
        postService.updatePost('post-uuid-1', 'other-user', {
          content: 'Hacked',
        }),
      ).rejects.toThrow(PostForbiddenException);
    });

    it('cho phép tác giả cập nhật nội dung bài viết', async () => {
      postRepository.findPostByIdWithDetails = jest
        .fn()
        .mockResolvedValue({ ...mockPost });
      postLikeRepository.findByPostAndUser = jest.fn().mockResolvedValue(null);

      const result = await postService.updatePost(
        'post-uuid-1',
        'user-uuid-1',
        {
          content: 'Updated content',
          privacy: PostPrivacy.FRIENDS,
        },
      );

      expect(result.content).toBe('Updated content');
      expect(result.privacy).toBe(PostPrivacy.FRIENDS);
    });
  });

  describe('deletePost', () => {
    it('cho phép tác giả xóa mềm bài viết', async () => {
      postRepository.findById = jest.fn().mockResolvedValue(mockPost);
      postRepository.softDelete = jest.fn().mockResolvedValue(true);

      const result = await postService.deletePost('post-uuid-1', 'user-uuid-1');

      expect(result.message).toBe('Đã xóa bài viết thành công');
      expect(postRepository.softDelete).toHaveBeenCalledWith('post-uuid-1');
    });

    it('từ chối nếu không phải tác giả xóa bài viết', async () => {
      postRepository.findById = jest.fn().mockResolvedValue(mockPost);

      await expect(
        postService.deletePost('post-uuid-1', 'attacker-user'),
      ).rejects.toThrow(PostForbiddenException);
    });
  });
});
