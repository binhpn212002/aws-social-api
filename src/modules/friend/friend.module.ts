import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '../../database/entities/friendship.entity';
import { User } from '../../database/entities/user.entity';
import { FriendController } from './friend.controller';
import { FriendService } from './services/friend.service';
import { FriendshipRepository } from './repositories/friendship.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Friendship, User])],
  controllers: [FriendController],
  providers: [FriendService, FriendshipRepository],
  exports: [FriendService, FriendshipRepository],
})
export class FriendModule {}
