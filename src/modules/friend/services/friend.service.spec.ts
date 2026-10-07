jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: unknown) => entity,
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FriendService } from './friend.service';
import { FriendshipRepository } from '../repositories/friendship.repository';
import {
  Friendship,
  FriendshipStatus,
} from '../../../database/entities/friendship.entity';
import { User, UserStatus } from '../../../database/entities/user.entity';

describe('FriendService', () => {
  let friendService: FriendService;
  let friendshipRepository: jest.Mocked<Partial<FriendshipRepository>>;
  let userRepository: any;

  const userAId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const userBId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

  const mockUserB: User = {
    id: userBId,
    username: 'user_b',
    fullName: 'User B',
    email: 'userb@example.com',
    status: UserStatus.ACTIVE,
  } as any;

  beforeEach(() => {
    friendshipRepository = {
      findRelationshipBetween: jest.fn(),
      findPendingRequest: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      getFriendsPaginated: jest.fn(),
      getFriendRequestsPaginated: jest.fn(),
      getBlockedUsersPaginated: jest.fn(),
      getAllFriendUserIds: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
        remove: jest.fn().mockResolvedValue(true),
        create: jest.fn().mockImplementation((val) => val),
      }),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    friendService = new FriendService(
      friendshipRepository as any,
      userRepository,
    );
  });

  describe('sendFriendRequest', () => {
    it('phải ném BadRequestException nếu gửi cho chính mình', async () => {
      await expect(
        friendService.sendFriendRequest(userAId, { addresseeId: userAId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('phải ném NotFoundException nếu người nhận không tồn tại', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        friendService.sendFriendRequest(userAId, { addresseeId: userBId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('phải ném ConflictException nếu hai người đã là bạn bè', async () => {
      userRepository.findOne.mockResolvedValue(mockUserB);
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue({
        id: 'f-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.ACCEPTED,
      });

      await expect(
        friendService.sendFriendRequest(userAId, { addresseeId: userBId }),
      ).rejects.toThrow(ConflictException);
    });

    it('phải ném ForbiddenException nếu người nhận đã chặn người gửi', async () => {
      userRepository.findOne.mockResolvedValue(mockUserB);
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue({
        id: 'f-1',
        requesterId: userBId,
        addresseeId: userAId,
        status: FriendshipStatus.BLOCKED,
      });

      await expect(
        friendService.sendFriendRequest(userAId, { addresseeId: userBId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('phải tự động ACCEPTED nếu đối phương đã gửi lời mời trước đó', async () => {
      userRepository.findOne.mockResolvedValue(mockUserB);
      const existingReq: Friendship = {
        id: 'f-1',
        requesterId: userBId,
        addresseeId: userAId,
        status: FriendshipStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue(existingReq);

      const result = await friendService.sendFriendRequest(userAId, {
        addresseeId: userBId,
      });

      expect(result.status).toBe(FriendshipStatus.ACCEPTED);
    });

    it('phải tạo lời mời PENDING mới thành công nếu chưa có quan hệ', async () => {
      userRepository.findOne.mockResolvedValue(mockUserB);
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue(null);
      (friendshipRepository.create as jest.Mock).mockResolvedValue({
        id: 'f-new',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await friendService.sendFriendRequest(userAId, {
        addresseeId: userBId,
      });

      expect(result.status).toBe(FriendshipStatus.PENDING);
      expect(result.requesterId).toBe(userAId);
      expect(result.addresseeId).toBe(userBId);
    });
  });

  describe('acceptFriendRequest', () => {
    it('phải ném NotFoundException nếu không tìm thấy requestId', async () => {
      (friendshipRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        friendService.acceptFriendRequest(userBId, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('phải ném ForbiddenException nếu không phải addressee', async () => {
      (friendshipRepository.findById as jest.Mock).mockResolvedValue({
        id: 'req-1',
        requesterId: userAId,
        addresseeId: 'other-user',
        status: FriendshipStatus.PENDING,
      });

      await expect(
        friendService.acceptFriendRequest(userBId, 'req-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('phải chấp nhận lời mời thành công và chuyển trạng thái sang ACCEPTED', async () => {
      const mockReq: Friendship = {
        id: 'req-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      (friendshipRepository.findById as jest.Mock).mockResolvedValue(mockReq);

      const result = await friendService.acceptFriendRequest(userBId, 'req-1');

      expect(result.status).toBe(FriendshipStatus.ACCEPTED);
    });
  });

  describe('declineFriendRequest', () => {
    it('phải từ chối lời mời và chuyển sang DECLINED', async () => {
      const mockReq: Friendship = {
        id: 'req-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      (friendshipRepository.findById as jest.Mock).mockResolvedValue(mockReq);

      const result = await friendService.declineFriendRequest(userBId, 'req-1');

      expect(result.status).toBe(FriendshipStatus.DECLINED);
    });
  });

  describe('cancelFriendRequest', () => {
    it('phải hủy lời mời nếu là chính người gửi', async () => {
      const mockReq: Friendship = {
        id: 'req-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.PENDING,
      } as any;

      (friendshipRepository.findById as jest.Mock).mockResolvedValue(mockReq);

      const result = await friendService.cancelFriendRequest(userAId, 'req-1');

      expect(result.message).toContain('thành công');
    });
  });

  describe('unfriend', () => {
    it('phải ném NotFoundException nếu hai người không phải bạn bè', async () => {
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue(null);

      await expect(friendService.unfriend(userAId, userBId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('phải hủy kết bạn thành công nếu quan hệ đang là ACCEPTED', async () => {
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue({
        id: 'f-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.ACCEPTED,
      });

      const result = await friendService.unfriend(userAId, userBId);

      expect(result.message).toContain('thành công');
    });
  });

  describe('blockUser and unblockUser', () => {
    it('không cho phép tự chặn chính mình', async () => {
      await expect(friendService.blockUser(userAId, userAId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('chặn người dùng thành công và cập nhật status sang BLOCKED', async () => {
      userRepository.findOne.mockResolvedValue(mockUserB);
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue(null);

      const result = await friendService.blockUser(userAId, userBId);

      expect(result.status).toBe(FriendshipStatus.BLOCKED);
      expect(result.requesterId).toBe(userAId);
      expect(result.addresseeId).toBe(userBId);
    });

    it('bỏ chặn người dùng thành công', async () => {
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue({
        id: 'b-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.BLOCKED,
      });

      const result = await friendService.unblockUser(userAId, userBId);

      expect(result.message).toContain('thành công');
    });
  });

  describe('getFriendshipStatus', () => {
    it('trả về NONE nếu người dùng tự kiểm tra chính mình', async () => {
      const result = await friendService.getFriendshipStatus(userAId, userAId);
      expect(result.status).toBe('NONE');
      expect(result.isFriend).toBe(false);
    });

    it('trả về outgoing nếu A gửi lời mời cho B đang PENDING', async () => {
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue({
        id: 'req-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.PENDING,
      });

      const result = await friendService.getFriendshipStatus(userAId, userBId);

      expect(result.status).toBe(FriendshipStatus.PENDING);
      expect(result.direction).toBe('outgoing');
      expect(result.isFriend).toBe(false);
    });

    it('trả về isFriend: true nếu status là ACCEPTED', async () => {
      (
        friendshipRepository.findRelationshipBetween as jest.Mock
      ).mockResolvedValue({
        id: 'req-1',
        requesterId: userAId,
        addresseeId: userBId,
        status: FriendshipStatus.ACCEPTED,
      });

      const result = await friendService.getFriendshipStatus(userAId, userBId);

      expect(result.isFriend).toBe(true);
      expect(result.status).toBe(FriendshipStatus.ACCEPTED);
    });
  });
});
