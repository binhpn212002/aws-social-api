import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  Notification,
  NotificationStatus,
} from '../../../database/entities/notification.entity';
import { GetNotificationsQueryDto } from '../dto/get-notifications-query.dto';

@Injectable()
export class NotificationRepository extends BaseRepository<Notification> {
  constructor(
    @InjectRepository(Notification)
    private readonly notiRepo: Repository<Notification>,
  ) {
    super(notiRepo);
  }

  async findNotificationsWithPagination(
    recipientId: string,
    query: GetNotificationsQueryDto,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 10));
    const skip = (page - 1) * pageSize;

    const qb = this.notiRepo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.sender', 'sender')
      .where('n.recipientId = :recipientId', { recipientId })
      .andWhere('n.deletedAt IS NULL');

    if (query.status) {
      qb.andWhere('n.status = :status', { status: query.status });
    }

    if (query.unreadOnly) {
      qb.andWhere('n.isRead = :isRead', { isRead: false });
    }

    qb.orderBy('n.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    const unreadCount = await this.notiRepo.count({
      where: {
        recipientId,
        isRead: false,
        status: NotificationStatus.COMPLETED,
      },
    });

    return { items, total, unreadCount };
  }

  async markAsRead(id: string, recipientId: string): Promise<boolean> {
    const result = await this.notiRepo.update(
      { id, recipientId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  async markAllAsRead(recipientId: string): Promise<number> {
    const result = await this.notiRepo.update(
      { recipientId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return result.affected ?? 0;
  }

  async updateDeliveryStatus(
    id: string,
    status: NotificationStatus,
    sentAt?: Date,
    errorMessage?: string,
  ): Promise<UpdateResult> {
    return this.notiRepo.update(
      { id },
      {
        status,
        sentAt: sentAt || new Date(),
        errorMessage: errorMessage || null,
      },
    );
  }
}
