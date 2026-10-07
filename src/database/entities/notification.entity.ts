import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { TABLE_NAMES } from '../../common/constants/module.constant';
import { User } from './user.entity';

export enum NotificationType {
  COMMENT_POST = 'COMMENT_POST',
  REPLY_COMMENT = 'REPLY_COMMENT',
  LIKE_POST = 'LIKE_POST',
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  FRIEND_ACCEPTED = 'FRIEND_ACCEPTED',
  SCHEDULED_REMINDER = 'SCHEDULED_REMINDER',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum NotificationDeliveryChannel {
  WEBSOCKET = 'WEBSOCKET',
  PUSH_NOTIFICATION = 'PUSH_NOTIFICATION',
  NONE = 'NONE',
}

@Entity({ name: TABLE_NAMES.NOTIFICATIONS || 'notifications' })
@Index('idx_notifications_recipient_created', ['recipientId', 'createdAt'])
@Index('idx_notifications_recipient_is_read', ['recipientId', 'isRead'])
@Index('idx_notifications_recipient_status', ['recipientId', 'status'])
export class Notification extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'recipient_id' })
  recipientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Index()
  @Column({ type: 'uuid', name: 'sender_id', nullable: true })
  senderId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sender_id' })
  sender?: User | null;

  @Column({
    type: 'varchar',
    length: 30,
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Index()
  @Column({ type: 'uuid', name: 'reference_id', nullable: true })
  referenceId?: string | null;

  @Column({ type: 'varchar', length: 50, name: 'reference_type', nullable: true })
  referenceType?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({ type: 'boolean', name: 'is_read', default: false })
  isRead: boolean;

  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage?: string | null;
}
