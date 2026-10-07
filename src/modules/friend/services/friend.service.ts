import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FriendshipRepository } from '../repositories/friendship.repository';
import {
  Friendship,
  FriendshipStatus,
} from '../../../database/entities/friendship.entity';
import { User, UserStatus } from '../../../database/entities/user.entity';
import { SendFriendRequestDto } from '../dto/send-friend-request.dto';
import { GetFriendsQueryDto } from '../dto/get-friends-query.dto';
import { GetFriendRequestsQueryDto } from '../dto/get-friend-requests-query.dto';
import { GetBlockedUsersQueryDto } from '../dto/get-blocked-users-query.dto';
import {
  FriendshipResponseDto,
  FriendRequestListResponseDto,
} from '../dto/friendship-response.dto';
import { FriendListResponseDto } from '../dto/friend-user-response.dto';
import { FriendshipStatusResponseDto } from '../dto/friendship-status-response.dto';

@Injectable()
export class FriendService {
  private readonly logger = new Logger(FriendService.name);

  constructor(
    private readonly friendshipRepository: FriendshipRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 1. Gửi lời mời kết bạn (Send Friend Request)
   */
  async sendFriendRequest(
    requesterId: string,
    dto: SendFriendRequestDto,
  ): Promise<FriendshipResponseDto> {
    const { addresseeId } = dto;

    if (requesterId === addresseeId) {
      throw new BadRequestException(
        'Bạn không thể gửi lời mời kết bạn cho chính mình',
      );
    }

    const addressee = await this.userRepository.findOne({
      where: { id: addresseeId, status: UserStatus.ACTIVE },
    });
    if (!addressee) {
      throw new NotFoundException(
        'Người dùng nhận lời mời không tồn tại hoặc đã bị khóa',
      );
    }

    // Kiểm tra xem đã có mối quan hệ trước đó chưa
    const existing = await this.friendshipRepository.findRelationshipBetween(
      requesterId,
      addresseeId,
    );

    if (existing) {
      if (existing.status === FriendshipStatus.ACCEPTED) {
        throw new ConflictException('Hai người đã là bạn bè của nhau');
      }

      if (existing.status === FriendshipStatus.BLOCKED) {
        if (existing.requesterId === requesterId) {
          throw new BadRequestException(
            'Bạn đang chặn người dùng này. Hãy bỏ chặn trước khi gửi lời mời.',
          );
        } else {
          throw new ForbiddenException(
            'Không thể gửi lời mời tới người dùng này',
          );
        }
      }

      if (existing.status === FriendshipStatus.PENDING) {
        if (existing.requesterId === requesterId) {
          throw new BadRequestException(
            'Bạn đã gửi lời mời kết bạn trước đó, vui lòng chờ đối phương phản hồi',
          );
        } else {
          // Đối phương đã gửi lời mời cho mình trước đó -> Tự động chuyển thành ACCEPTED
          existing.status = FriendshipStatus.ACCEPTED;
          const saved = await this.friendshipRepository
            .getRepository()
            .save(existing);
          this.dispatchNotification(
            'FRIEND_ACCEPTED',
            requesterId,
            addresseeId,
            'Đã tự động chấp nhận lời mời kết bạn từ đối phương',
          );
          return this.mapToResponse(saved);
        }
      }

      if (existing.status === FriendshipStatus.DECLINED) {
        // Tái tạo lại request: cập nhật requester thành người gửi mới và status = PENDING
        existing.requesterId = requesterId;
        existing.addresseeId = addresseeId;
        existing.status = FriendshipStatus.PENDING;
        const saved = await this.friendshipRepository
          .getRepository()
          .save(existing);
        this.dispatchNotification(
          'FRIEND_REQUEST',
          requesterId,
          addresseeId,
          'Gửi lời mời kết bạn mới',
        );
        return this.mapToResponse(saved);
      }
    }

    // Tạo mới quan hệ PENDING
    const newFriendship = await this.friendshipRepository.create({
      requesterId,
      addresseeId,
      status: FriendshipStatus.PENDING,
    });

    this.dispatchNotification(
      'FRIEND_REQUEST',
      requesterId,
      addresseeId,
      'Gửi lời mời kết bạn',
    );

    return this.mapToResponse(newFriendship);
  }

  /**
   * 2. Chấp nhận lời mời kết bạn (Accept Request)
   */
  async acceptFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<FriendshipResponseDto> {
    const friendship = await this.friendshipRepository.findById(requestId, {
      relations: { requester: true, addressee: true },
    });

    if (!friendship) {
      throw new NotFoundException('Không tìm thấy lời mời kết bạn');
    }

    if (friendship.addresseeId !== userId) {
      throw new ForbiddenException('Bạn không có quyền chấp nhận lời mời này');
    }

    if (friendship.status === FriendshipStatus.ACCEPTED) {
      throw new BadRequestException('Lời mời đã được chấp nhận trước đó');
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException(
        'Lời mời kết bạn không ở trạng thái chờ chấp nhận',
      );
    }

    friendship.status = FriendshipStatus.ACCEPTED;
    const updated = await this.friendshipRepository
      .getRepository()
      .save(friendship);

    this.dispatchNotification(
      'FRIEND_ACCEPTED',
      userId,
      friendship.requesterId,
      'Đã chấp nhận lời mời kết bạn',
    );

    return this.mapToResponse(updated);
  }

  /**
   * 3. Từ chối lời mời kết bạn (Decline Request)
   */
  async declineFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<FriendshipResponseDto> {
    const friendship = await this.friendshipRepository.findById(requestId);

    if (!friendship) {
      throw new NotFoundException('Không tìm thấy lời mời kết bạn');
    }

    if (friendship.addresseeId !== userId) {
      throw new ForbiddenException('Bạn không có quyền từ chối lời mời này');
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException(
        'Lời mời kết bạn không ở trạng thái chờ xử lý',
      );
    }

    friendship.status = FriendshipStatus.DECLINED;
    const updated = await this.friendshipRepository
      .getRepository()
      .save(friendship);

    return this.mapToResponse(updated);
  }

  /**
   * 4. Hủy lời mời kết bạn đã gửi (Cancel Request)
   */
  async cancelFriendRequest(
    userId: string,
    requestId: string,
  ): Promise<{ message: string }> {
    const friendship = await this.friendshipRepository.findById(requestId);

    if (!friendship) {
      throw new NotFoundException('Không tìm thấy lời mời kết bạn');
    }

    if (friendship.requesterId !== userId) {
      throw new ForbiddenException(
        'Bạn chỉ có thể hủy lời mời do chính mình gửi',
      );
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException(
        'Chỉ có thể hủy lời mời đang ở trạng thái chờ phản hồi',
      );
    }

    await this.friendshipRepository.getRepository().remove(friendship);

    return { message: 'Đã hủy lời mời kết bạn thành công' };
  }

  /**
   * 5. Hủy kết bạn (Unfriend)
   */
  async unfriend(
    userId: string,
    friendUserId: string,
  ): Promise<{ message: string }> {
    const friendship = await this.friendshipRepository.findRelationshipBetween(
      userId,
      friendUserId,
    );

    if (!friendship || friendship.status !== FriendshipStatus.ACCEPTED) {
      throw new NotFoundException('Hai người hiện không phải là bạn bè');
    }

    await this.friendshipRepository.getRepository().remove(friendship);

    return { message: 'Đã hủy kết bạn thành công' };
  }

  /**
   * 6. Lấy danh sách bạn bè hiện tại (phục vụ Newsfeed, Chat, và Scheduled Notification)
   */
  async getFriends(
    userId: string,
    query: GetFriendsQueryDto,
  ): Promise<FriendListResponseDto> {
    return this.friendshipRepository.getFriendsPaginated(userId, query);
  }

  /**
   * 7. Lấy danh sách lời mời kết bạn (received hoặc sent)
   */
  async getFriendRequests(
    userId: string,
    query: GetFriendRequestsQueryDto,
  ): Promise<FriendRequestListResponseDto> {
    const { items, meta } =
      await this.friendshipRepository.getFriendRequestsPaginated(userId, query);

    return {
      items: items.map((f) => this.mapToResponse(f)),
      meta,
    };
  }

  /**
   * 8. Chặn một người dùng (Block User)
   */
  async blockUser(
    userId: string,
    targetUserId: string,
  ): Promise<FriendshipResponseDto> {
    if (userId === targetUserId) {
      throw new BadRequestException('Bạn không thể tự chặn chính mình');
    }

    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new NotFoundException('Người dùng mục tiêu không tồn tại');
    }

    let relation = await this.friendshipRepository.findRelationshipBetween(
      userId,
      targetUserId,
    );

    if (relation) {
      if (
        relation.status === FriendshipStatus.BLOCKED &&
        relation.requesterId === userId
      ) {
        throw new BadRequestException('Bạn đã chặn người dùng này trước đó');
      }

      // Đưa về trạng thái BLOCKED với requesterId = userId (người thực hiện chặn)
      relation.requesterId = userId;
      relation.addresseeId = targetUserId;
      relation.status = FriendshipStatus.BLOCKED;
    } else {
      relation = this.friendshipRepository.getRepository().create({
        requesterId: userId,
        addresseeId: targetUserId,
        status: FriendshipStatus.BLOCKED,
      });
    }

    const saved = await this.friendshipRepository
      .getRepository()
      .save(relation);
    return this.mapToResponse(saved);
  }

  /**
   * 9. Bỏ chặn người dùng (Unblock User)
   */
  async unblockUser(
    userId: string,
    targetUserId: string,
  ): Promise<{ message: string }> {
    const relation = await this.friendshipRepository.findRelationshipBetween(
      userId,
      targetUserId,
    );

    if (
      !relation ||
      relation.status !== FriendshipStatus.BLOCKED ||
      relation.requesterId !== userId
    ) {
      throw new NotFoundException(
        'Người dùng này không nằm trong danh sách bị bạn chặn',
      );
    }

    await this.friendshipRepository.getRepository().remove(relation);

    return { message: 'Đã bỏ chặn người dùng thành công' };
  }

  /**
   * 10. Lấy danh sách người dùng đang bị chặn
   */
  async getBlockedUsers(
    userId: string,
    query: GetBlockedUsersQueryDto,
  ): Promise<FriendRequestListResponseDto> {
    const { items, meta } =
      await this.friendshipRepository.getBlockedUsersPaginated(userId, query);

    return {
      items: items.map((f) => this.mapToResponse(f)),
      meta,
    };
  }

  /**
   * 11. Kiểm tra trạng thái mối quan hệ giữa người dùng hiện tại và một người dùng khác
   */
  async getFriendshipStatus(
    currentUserId: string,
    targetUserId: string,
  ): Promise<FriendshipStatusResponseDto> {
    if (currentUserId === targetUserId) {
      return {
        targetUserId,
        isFriend: false,
        status: 'NONE',
        direction: 'none',
        isBlockedByMe: false,
        isBlockedByThem: false,
      };
    }

    const relation = await this.friendshipRepository.findRelationshipBetween(
      currentUserId,
      targetUserId,
    );

    if (!relation) {
      return {
        targetUserId,
        isFriend: false,
        status: 'NONE',
        direction: 'none',
        isBlockedByMe: false,
        isBlockedByThem: false,
      };
    }

    const isFriend = relation.status === FriendshipStatus.ACCEPTED;
    const isRequester = relation.requesterId === currentUserId;
    const direction =
      relation.status === FriendshipStatus.PENDING
        ? isRequester
          ? 'outgoing'
          : 'incoming'
        : 'none';

    const isBlockedByMe =
      relation.status === FriendshipStatus.BLOCKED && isRequester;
    const isBlockedByThem =
      relation.status === FriendshipStatus.BLOCKED && !isRequester;

    return {
      targetUserId,
      isFriend,
      status: relation.status,
      direction,
      isBlockedByMe,
      isBlockedByThem,
      requestId:
        relation.status === FriendshipStatus.PENDING ? relation.id : undefined,
    };
  }

  /**
   * 12. Lấy toàn bộ danh sách ID bạn bè (cung cấp nội bộ cho Module Post Feed & Scheduled Notification)
   */
  async getAllFriendIds(userId: string): Promise<string[]> {
    return this.friendshipRepository.getAllFriendUserIds(userId);
  }

  /**
   * Helper chuyển đổi Entity sang DTO chuẩn
   */
  private mapToResponse(f: Friendship): FriendshipResponseDto {
    return {
      id: f.id,
      requesterId: f.requesterId,
      addresseeId: f.addresseeId,
      status: f.status,
      requester: f.requester
        ? {
            id: f.requester.id,
            username: f.requester.username,
            fullName: f.requester.fullName,
            avatarUrl: f.requester.avatarUrl,
          }
        : undefined,
      addressee: f.addressee
        ? {
            id: f.addressee.id,
            username: f.addressee.username,
            fullName: f.addressee.fullName,
            avatarUrl: f.addressee.avatarUrl,
          }
        : undefined,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    };
  }

  /**
   * Helper phát sinh thông báo sự kiện (Notification Dispatcher)
   */
  private dispatchNotification(
    eventType: 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED',
    actorId: string,
    recipientId: string,
    message: string,
  ): void {
    this.logger.log(
      `[Event: ${eventType}] Actor: ${actorId} -> Recipient: ${recipientId} - Msg: ${message}`,
    );
  }
}
