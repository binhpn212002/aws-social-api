import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TABLE_NAMES } from '../../common/constants/module.constant';
import { Post } from './post.entity';

export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

@Entity({ name: TABLE_NAMES.POST_MEDIA || 'post_media' })
export class PostMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'post_id' })
  postId: string;

  @ManyToOne(() => Post, (post) => post.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({
    type: 'varchar',
    length: 20,
    enum: MediaType,
    name: 'media_type',
    default: MediaType.IMAGE,
  })
  mediaType: MediaType;

  @Column({ type: 'varchar', length: 500, name: 's3_key' })
  s3Key: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true, name: 'thumbnail_url' })
  thumbnailUrl?: string | null;

  @Column({ type: 'int', nullable: true })
  width?: number | null;

  @Column({ type: 'int', nullable: true })
  height?: number | null;

  @Column({ type: 'bigint', nullable: true, name: 'size_bytes' })
  sizeBytes?: number | null;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;
}
