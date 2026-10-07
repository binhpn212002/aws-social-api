import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { TABLE_NAMES } from '../../common/constants/module.constant';
import { User } from './user.entity';
import { PostMedia } from './post-media.entity';
import { PostLike } from './post-like.entity';

export enum PostPrivacy {
  PUBLIC = 'PUBLIC',
  FRIENDS = 'FRIENDS',
  PRIVATE = 'PRIVATE',
}

export enum PostStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN = 'HIDDEN',
  DELETED = 'DELETED',
}

@Entity({ name: TABLE_NAMES.POSTS || 'posts' })
@Index('idx_posts_user_created', ['userId', 'createdAt'])
@Index('idx_posts_privacy_created', ['privacy', 'createdAt'])
@Index('idx_posts_feed', ['status', 'privacy', 'createdAt'])
export class Post extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    enum: PostPrivacy,
    default: PostPrivacy.PUBLIC,
  })
  privacy: PostPrivacy;

  @Column({
    type: 'varchar',
    length: 20,
    enum: PostStatus,
    default: PostStatus.ACTIVE,
  })
  status: PostStatus;

  @Column({ type: 'int', default: 0, name: 'likes_count' })
  likesCount: number;

  @Column({ type: 'int', default: 0, name: 'comments_count' })
  commentsCount: number;

  @Column({ type: 'int', default: 0, name: 'shares_count' })
  sharesCount: number;

  @OneToMany(() => PostMedia, (media) => media.post, {
    cascade: true,
  })
  media: PostMedia[];

  @OneToMany(() => PostLike, (like) => like.post)
  likes: PostLike[];
}
