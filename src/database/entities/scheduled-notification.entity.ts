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

export enum ScheduleTargetType {
  ALL_FRIENDS = 'ALL_FRIENDS',
  SELECTED_FRIENDS = 'SELECTED_FRIENDS',
}

export enum ScheduleNotificationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

@Entity({ name: TABLE_NAMES.SCHEDULED_NOTIFICATIONS || 'scheduled_notifications' })
@Index('idx_scheduled_notifications_user_scheduled', ['userId', 'scheduledAt'])
@Index('idx_scheduled_notifications_status', ['status'])
export class ScheduledNotification extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'timestamptz', name: 'scheduled_at' })
  scheduledAt: Date;

  @Column({
    type: 'varchar',
    length: 20,
    enum: ScheduleTargetType,
    name: 'target_type',
  })
  targetType: ScheduleTargetType;

  @Column({ type: 'jsonb', name: 'target_user_ids', nullable: true })
  targetUserIds?: string[] | null;

  @Column({
    type: 'varchar',
    length: 20,
    enum: ScheduleNotificationStatus,
    default: ScheduleNotificationStatus.PENDING,
  })
  status: ScheduleNotificationStatus;

  @Column({ type: 'varchar', length: 500, name: 'scheduler_arn', nullable: true })
  schedulerArn?: string | null;

  @Column({ type: 'int', name: 'total_recipients', nullable: true })
  totalRecipients?: number | null;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt?: Date | null;
}
