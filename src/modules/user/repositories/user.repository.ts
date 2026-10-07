import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { User } from '../../../database/entities/user.entity';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository);
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.repository.findOne({
      where: [{ email: identifier }, { username: identifier }],
    });
  }

  async findByIdentifierWithPassword(identifier: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :identifier OR user.username = :identifier', {
        identifier,
      })
      .getOne();
  }

  async checkExisting(
    email: string,
    username: string,
  ): Promise<{ emailExists: boolean; usernameExists: boolean }> {
    const existing = await this.repository.find({
      where: [{ email }, { username }],
      select: { id: true, email: true, username: true },
    });

    return {
      emailExists: existing.some(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
      ),
      usernameExists: existing.some(
        (u) => u.username.toLowerCase() === username.toLowerCase(),
      ),
    };
  }
}
