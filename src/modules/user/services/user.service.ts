import { Injectable } from '@nestjs/common';
import { BaseService } from '../../../shared/base.service';
import { User } from '../../../database/entities/user.entity';
import { UserRepository } from '../repositories/user.repository';
import { UserNotFoundException } from '../../../common/exceptions/user.exception';

@Injectable()
export class UserService extends BaseService<User, UserRepository> {
  constructor(userRepository: UserRepository) {
    super(userRepository);
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.repository.findByEmailOrUsername(identifier);
  }

  async findByIdentifierWithPassword(identifier: string): Promise<User | null> {
    return this.repository.findByIdentifierWithPassword(identifier);
  }

  async checkExisting(email: string, username: string) {
    return this.repository.checkExisting(email, username);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.repository.update(id, { lastLoginAt: new Date() });
  }

  async getById(id: string): Promise<User> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new UserNotFoundException();
    }
    return user;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    return this.repository.getRepository().createQueryBuilder('user')
      .where('user.id IN (:...ids)', { ids })
      .getMany();
  }

  async findByEmailOrUsernameOrThrow(identifier: string): Promise<User> {
    const user = await this.repository.findByEmailOrUsername(identifier);
    if (!user) {
      throw new UserNotFoundException();
    }
    return user;
  }

  async getProfileWithStats(id: string) {
    const user = await this.getById(id);
    const manager = this.repository.getRepository().manager;

    let postsCount = 0;
    let friendsCount = 0;
    let likesCount = 0;
    let mediaCount = 0;

    try {
      const postsRes = await manager.query(
        `SELECT COUNT(*)::int as count, COALESCE(SUM(likes_count), 0)::int as likes FROM posts WHERE user_id = $1 AND status = 'ACTIVE' AND deleted_at IS NULL`,
        [id],
      );
      if (postsRes && postsRes[0]) {
        postsCount = Number(postsRes[0].count) || 0;
        likesCount = Number(postsRes[0].likes) || 0;
      }
    } catch {
      // ignore
    }

    try {
      const friendsRes = await manager.query(
        `SELECT COUNT(*)::int as count FROM friendships WHERE (requester_id = $1 OR addressee_id = $1) AND status = 'ACCEPTED' AND deleted_at IS NULL`,
        [id],
      );
      if (friendsRes && friendsRes[0]) {
        friendsCount = Number(friendsRes[0].count) || 0;
      }
    } catch {
      // ignore
    }

    try {
      const mediaRes = await manager.query(
        `SELECT COUNT(*)::int as count FROM post_media pm JOIN posts p ON pm.post_id = p.id WHERE p.user_id = $1 AND p.deleted_at IS NULL`,
        [id],
      );
      if (mediaRes && mediaRes[0]) {
        mediaCount = Number(mediaRes[0].count) || 0;
      }
    } catch {
      // ignore
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      stats: {
        posts: postsCount,
        friends: friendsCount,
        likes: likesCount,
        media: mediaCount,
      },
    };
  }

  async updateProfile(
    id: string,
    data: { fullName?: string; bio?: string; avatarUrl?: string },
  ) {
    const updateData: Partial<User> = {};
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;

    await this.repository.update(id, updateData);
    return this.getProfileWithStats(id);
  }
}

