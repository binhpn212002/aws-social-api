import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from '../../../database/entities/notification.entity';
import { NotificationRepository } from '../repositories/notification.repository';
import { SqsProducerService } from './sqs-producer.service';
import { GetNotificationsQueryDto } from '../dto/get-notifications-query.dto';
import { NotifyCompletedDto } from '../dto/notify-completed.dto';

export interface TriggerNotificationInput {
  recipientId: string;
  senderId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  referenceId?: string | null;
  referenceType?: string | null;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepo: NotificationRepository,
    private readonly sqsProducer: SqsProducerService,
  ) {}

  /**
   * Kích hoạt thông báo khi người dùng thực hiện thao tác (comment, like, kết bạn, ...)
   * Lưu DB trạng thái PENDING -> Đẩy SQS Job -> Trả kết quả ngay (Decoupled, Async)
   */
  async triggerNotification(input: TriggerNotificationInput): Promise<Notification> {
    // 1. Tạo bản ghi trạng thái PENDING
    const notification = await this.notificationRepo.create({
      recipientId: input.recipientId,
      senderId: input.senderId,
      type: input.type,
      title: input.title,
      message: input.message,
      referenceId: input.referenceId,
      referenceType: input.referenceType,
      status: NotificationStatus.PENDING,
      isRead: false,
    });

    // 2. Đẩy job vào SQS Queue
    const eventId = `evt_${randomUUID()}`;
    await this.sqsProducer.pushToQueue({
      eventId,
      eventType: 'NOTIFICATION_DISPATCH',
      notificationId: notification.id,
      recipientId: notification.recipientId,
      senderId: notification.senderId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      referenceId: notification.referenceId,
      referenceType: notification.referenceType,
      createdAt: notification.createdAt.toISOString(),
    });

    return notification;
  }

  /**
   * Callback API được gọi bởi AWS Lambda Worker sau khi hoàn tất gửi thông báo
   */
  async markNotificationCompleted(dto: NotifyCompletedDto): Promise<{ success: boolean; id?: string }> {
    if (!dto.notificationId) {
      throw new BadRequestException('notificationId is required for single notification completion');
    }

    const notification = await this.notificationRepo.findById(dto.notificationId);
    if (!notification) {
      throw new NotFoundException(`Notification with ID ${dto.notificationId} not found`);
    }

    // Idempotency: Nếu đã COMPLETED từ trước thì bỏ qua để tránh ghi đè dữ liệu cũ
    if (notification.status === NotificationStatus.COMPLETED && dto.status === NotificationStatus.COMPLETED) {
      this.logger.warn(`Notification ${dto.notificationId} was already COMPLETED. Skipping update.`);
      return { success: true, id: notification.id };
    }

    await this.notificationRepo.updateDeliveryStatus(
      dto.notificationId,
      dto.status,
      new Date(dto.sentAt),
      dto.errorMessage,
    );

    this.logger.log(`Notification ${dto.notificationId} status updated to ${dto.status}`);
    return { success: true, id: dto.notificationId };
  }

  async getNotifications(recipientId: string, query: GetNotificationsQueryDto) {
    const { items, total, unreadCount } = await this.notificationRepo.findNotificationsWithPagination(
      recipientId,
      query,
    );

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 10));

    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        status: item.status,
        sender: item.sender
          ? {
              id: item.sender.id,
              username: item.sender.username,
              fullName: item.sender.fullName,
              avatarUrl: item.sender.avatarUrl,
            }
          : null,
        referenceId: item.referenceId,
        referenceType: item.referenceType,
        isRead: item.isRead,
        readAt: item.readAt,
        sentAt: item.sentAt,
        createdAt: item.createdAt,
      })),
      meta: {
        totalItems: total,
        unreadCount,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async markAsRead(id: string, recipientId: string): Promise<boolean> {
    const updated = await this.notificationRepo.markAsRead(id, recipientId);
    if (!updated) {
      throw new NotFoundException('Thông báo không tồn tại hoặc đã được đánh dấu đọc');
    }
    return true;
  }

  async markAllAsRead(recipientId: string): Promise<number> {
    return this.notificationRepo.markAllAsRead(recipientId);
  }
}
