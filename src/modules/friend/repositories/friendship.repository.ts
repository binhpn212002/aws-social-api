import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  Friendship,
  FriendshipStatus,
  FriendRequestType,
} from '../../../database/entities/friendship.entity';
import { GetFriendsQueryDto } from '../dto/get-friends-query.dto';
import { GetFriendRequestsQueryDto } from '../dto/get-friend-requests-query.dto';
import { GetBlockedUsersQueryDto } from '../dto/get-blocked-users-query.dto';
import {
  FriendUserItemDto,
  PaginationMetaDto,
} from '../dto/friend-user-response.dto';

interface RawFriendUserRow {
  id: string;
  username: string;
  fullName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  friendshipId: string;
  friendshipSince: string | Date;
}

@Injectable()
export class FriendshipRepository extends BaseRepository<Friendship> {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
  ) {
    super(friendshipRepo);
  }

  /**
   * Tìm mối quan hệ bất kỳ giữa 2 người dùng (bất kể chiều requester/addressee)
   */
  async findRelationshipBetween(
    user1Id: string,
    user2Id: string,
  ): Promise<Friendship | null> {
    return this.friendshipRepo.findOne({
      where: [
        { requesterId: user1Id, addresseeId: user2Id },
        { requesterId: user2Id, addresseeId: user1Id },
      ],
      relations: { requester: true, addressee: true },
    });
  }

  /**
   * Tìm lời mời kết bạn PENDING gửi từ requester tới addressee
   */
  async findPendingRequest(
    requesterId: string,
    addresseeId: string,
  ): Promise<Friendship | null> {
    return this.friendshipRepo.findOne({
      where: {
        requesterId,
        addresseeId,
        status: FriendshipStatus.PENDING,
      },
    });
  }

  /**
   * Kiểm tra 2 người dùng có phải là bạn bè hay không
   */
  async areFriends(user1Id: string, user2Id: string): Promise<boolean> {
    const count = await this.friendshipRepo.count({
      where: [
        {
          requesterId: user1Id,
          addresseeId: user2Id,
          status: FriendshipStatus.ACCEPTED,
        },
        {
          requesterId: user2Id,
          addresseeId: user1Id,
          status: FriendshipStatus.ACCEPTED,
        },
      ],
    });
    return count > 0;
  }

  /**
   * Kiểm tra xem có bất kỳ ai trong 2 người chặn người còn lại hay không
   */
  async isBlockedBetween(user1Id: string, user2Id: string): Promise<boolean> {
    const count = await this.friendshipRepo.count({
      where: [
        {
          requesterId: user1Id,
          addresseeId: user2Id,
          status: FriendshipStatus.BLOCKED,
        },
        {
          requesterId: user2Id,
          addresseeId: user1Id,
          status: FriendshipStatus.BLOCKED,
        },
      ],
    });
    return count > 0;
  }

  /**
   * Lấy danh sách ID tất cả bạn bè của một người dùng (hỗ trợ Newsfeed và Scheduled Notification)
   */
  async getAllFriendUserIds(userId: string): Promise<string[]> {
    const friendships = await this.friendshipRepo
      .createQueryBuilder('f')
      .select(['f.requesterId', 'f.addresseeId'])
      .where('(f.requesterId = :userId OR f.addresseeId = :userId)', { userId })
      .andWhere('f.status = :status', { status: FriendshipStatus.ACCEPTED })
      .getMany();

    return friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId,
    );
  }

  /**
   * Lấy danh sách bạn bè có phân trang & tìm kiếm theo họ tên hoặc username
   */
  async getFriendsPaginated(
    userId: string,
    query: GetFriendsQueryDto,
  ): Promise<{ items: FriendUserItemDto[]; meta: PaginationMetaDto }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.friendshipRepo
      .createQueryBuilder('f')
      .innerJoin(
        'users',
        'u',
        'u.id = CASE WHEN f.requester_id = :userId THEN f.addressee_id ELSE f.requester_id END',
        { userId },
      )
      .where('(f.requester_id = :userId OR f.addressee_id = :userId)', {
        userId,
      })
      .andWhere('f.status = :status', { status: FriendshipStatus.ACCEPTED })
      .andWhere('u.deleted_at IS NULL');

    if (query.search && query.search.trim() !== '') {
      const keyword = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(u.full_name) LIKE :keyword OR LOWER(u.username) LIKE :keyword)',
        {
          keyword,
        },
      );
    }

    const totalItems = await qb.getCount();

    // Sắp xếp
    if (query.sortBy === 'fullName') {
      qb.orderBy(
        'u.full_name',
        query.sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      );
    } else if (query.sortBy === 'username') {
      qb.orderBy(
        'u.username',
        query.sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      );
    } else {
      qb.orderBy(
        'f.updated_at',
        query.sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      );
    }

    qb.select([
      'u.id AS id',
      'u.username AS username',
      'u.full_name AS "fullName"',
      'u.avatar_url AS "avatarUrl"',
      'u.bio AS bio',
      'f.id AS "friendshipId"',
      'f.updated_at AS "friendshipSince"',
    ]);

    const rawItems: RawFriendUserRow[] = await qb
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const items: FriendUserItemDto[] = rawItems.map((row) => ({
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl || null,
      bio: row.bio || null,
      friendshipId: row.friendshipId,
      friendshipSince: new Date(row.friendshipSince),
    }));

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      meta: {
        totalItems,
        currentPage: page,
        pageSize: limit,
        totalPages,
      },
    };
  }

  /**
   * Lấy danh sách lời mời kết bạn (được nhận hoặc đã gửi)
   */
  async getFriendRequestsPaginated(
    userId: string,
    query: GetFriendRequestsQueryDto,
  ): Promise<{ items: Friendship[]; meta: PaginationMetaDto }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.friendshipRepo.createQueryBuilder('f');

    if (query.type === FriendRequestType.SENT) {
      qb.where('f.requester_id = :userId', { userId })
        .andWhere('f.status = :status', { status: FriendshipStatus.PENDING })
        .leftJoinAndSelect('f.addressee', 'addressee');
    } else {
      qb.where('f.addressee_id = :userId', { userId })
        .andWhere('f.status = :status', { status: FriendshipStatus.PENDING })
        .leftJoinAndSelect('f.requester', 'requester');
    }

    qb.orderBy('f.created_at', 'DESC');

    const [items, totalItems] = await qb
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      meta: {
        totalItems,
        currentPage: page,
        pageSize: limit,
        totalPages,
      },
    };
  }

  /**
   * Lấy danh sách người dùng bị chặn bởi người dùng hiện tại
   */
  async getBlockedUsersPaginated(
    userId: string,
    query: GetBlockedUsersQueryDto,
  ): Promise<{ items: Friendship[]; meta: PaginationMetaDto }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [items, totalItems] = await this.friendshipRepo.findAndCount({
      where: {
        requesterId: userId,
        status: FriendshipStatus.BLOCKED,
      },
      relations: { addressee: true },
      order: { updatedAt: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items,
      meta: {
        totalItems,
        currentPage: page,
        pageSize: limit,
        totalPages,
      },
    };
  }
}
