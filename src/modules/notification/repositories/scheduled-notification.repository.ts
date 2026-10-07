import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  ScheduledNotification,
  ScheduleNotificationStatus,
} from '../../../database/entities/scheduled-notification.entity';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';

@Injectable()
export class ScheduledNotificationRepository extends BaseRepository<ScheduledNotification> {
  constructor(
    @InjectRepository(ScheduledNotification)
    private readonly schedRepo: Repository<ScheduledNotification>,
  ) {
    super(schedRepo);
  }

  async findUserSchedules(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<{ items: ScheduledNotification[]; total: number }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 10));
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.schedRepo.findAndCount({
      where: { userId },
      order: { scheduledAt: 'DESC' },
      skip,
      take: pageSize,
    });

    return { items, total };
  }

  async updateScheduleStatus(
    id: string,
    status: ScheduleNotificationStatus,
    sentAt?: Date,
    totalRecipients?: number,
  ): Promise<boolean> {
    const result = await this.schedRepo.update(
      { id },
      {
        status,
        sentAt: sentAt || new Date(),
        totalRecipients: totalRecipients !== undefined ? totalRecipients : undefined,
      },
    );
    return (result.affected ?? 0) > 0;
  }
}
