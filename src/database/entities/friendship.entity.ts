import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Check,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { TABLE_NAMES } from '../../common/constants/module.constant';
import { User } from './user.entity';

export enum FriendshipStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  BLOCKED = 'BLOCKED',
}

export enum FriendRequestType {
  RECEIVED = 'received',
  SENT = 'sent',
}

@Entity({ name: TABLE_NAMES.FRIENDSHIPS || 'friendships' })
@Unique('uq_friendships_requester_addressee', ['requesterId', 'addresseeId'])
@Check('chk_friendships_no_self_friend', '"requester_id" <> "addressee_id"')
@Index('idx_friendships_requester_status', ['requesterId', 'status'])
@Index('idx_friendships_addressee_status', ['addresseeId', 'status'])
@Index('idx_friendships_status_created', ['status', 'createdAt'])
export class Friendship extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'requester_id' })
  requesterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @Index()
  @Column({ type: 'uuid', name: 'addressee_id' })
  addresseeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addressee_id' })
  addressee: User;

  @Column({
    type: 'varchar',
    length: 20,
    enum: FriendshipStatus,
    default: FriendshipStatus.PENDING,
  })
  status: FriendshipStatus;
}
