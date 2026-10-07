jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: unknown) => entity,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationRepository } from '../repositories/notification.repository';
import { SqsProducerService } from './sqs-producer.service';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from '../../../database/entities/notification.entity';

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationRepo: jest.Mocked<Partial<NotificationRepository>>;
  let sqsProducer: jest.Mocked<Partial<SqsProducerService>>;

  const mockNotification: Notification = {
    id: 'f516a8d0-990a-44c1-84de-c82098b67151',
    recipientId: 'user-a-uuid',
    senderId: 'user-b-uuid',
    type: NotificationType.COMMENT_POST,
    title: 'Bình luận mới',
    message: 'User B đã bình luận vào bài viết của bạn.',
    status: NotificationStatus.PENDING,
    isRead: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null as any,
    recipient: null as any,
    sender: null as any,
  };

  beforeEach(async () => {
    notificationRepo = {
      create: jest.fn().mockResolvedValue({ ...mockNotification }),
      findById: jest.fn().mockResolvedValue({ ...mockNotification }),
      updateDeliveryStatus: jest.fn().mockResolvedValue({ affected: 1 } as any),
      findNotificationsWithPagination: jest.fn().mockResolvedValue({
        items: [{ ...mockNotification }],
        total: 1,
        unreadCount: 1,
      }),
      markAsRead: jest.fn().mockResolvedValue(true),
      markAllAsRead: jest.fn().mockResolvedValue(3),
    };

    sqsProducer = {
      pushToQueue: jest.fn().mockResolvedValue('msg-uuid-12345'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: NotificationRepository,
          useValue: notificationRepo,
        },
        {
          provide: SqsProducerService,
          useValue: sqsProducer,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('triggerNotification', () => {
    it('nên tạo notification PENDING và đẩy message vào SQS Queue', async () => {
      const result = await service.triggerNotification({
        recipientId: 'user-a-uuid',
        senderId: 'user-b-uuid',
        type: NotificationType.COMMENT_POST,
        title: 'Bình luận mới',
        message: 'User B đã bình luận vào bài viết của bạn.',
      });

      expect(notificationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'user-a-uuid',
          senderId: 'user-b-uuid',
          type: NotificationType.COMMENT_POST,
          status: NotificationStatus.PENDING,
          isRead: false,
        }),
      );
      expect(sqsProducer.pushToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'NOTIFICATION_DISPATCH',
          notificationId: mockNotification.id,
          recipientId: 'user-a-uuid',
        }),
      );
      expect(result.id).toBe(mockNotification.id);
    });
  });

  describe('markNotificationCompleted', () => {
    it('nên cập nhật trạng thái COMPLETED và sentAt khi callback từ Lambda Worker', async () => {
      const result = await service.markNotificationCompleted({
        notificationId: mockNotification.id,
        status: NotificationStatus.COMPLETED,
        sentAt: new Date().toISOString(),
      });

      expect(notificationRepo.findById).toHaveBeenCalledWith(mockNotification.id);
      expect(notificationRepo.updateDeliveryStatus).toHaveBeenCalledWith(
        mockNotification.id,
        NotificationStatus.COMPLETED,
        expect.any(Date),
        undefined,
      );
      expect(result.success).toBe(true);
    });

    it('nên xử lý Idempotency và bỏ qua ghi đè nếu bản ghi đã COMPLETED', async () => {
      notificationRepo.findById = jest.fn().mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.COMPLETED,
      });

      const result = await service.markNotificationCompleted({
        notificationId: mockNotification.id,
        status: NotificationStatus.COMPLETED,
        sentAt: new Date().toISOString(),
      });

      expect(notificationRepo.updateDeliveryStatus).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('nên ném NotFoundException nếu notificationId không tồn tại', async () => {
      notificationRepo.findById = jest.fn().mockResolvedValue(null);

      await expect(
        service.markNotificationCompleted({
          notificationId: 'non-existent-id',
          status: NotificationStatus.COMPLETED,
          sentAt: new Date().toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getNotifications', () => {
    it('nên trả về danh sách phân trang kèm unreadCount', async () => {
      const result = await service.getNotifications('user-a-uuid', {
        page: 1,
        pageSize: 10,
      });

      expect(result.items.length).toBe(1);
      expect(result.meta.unreadCount).toBe(1);
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe('markAsRead & markAllAsRead', () => {
    it('markAsRead nên trả về true khi thành công', async () => {
      const result = await service.markAsRead(mockNotification.id, 'user-a-uuid');
      expect(result).toBe(true);
    });

    it('markAllAsRead nên trả về số lượng bản ghi đã được đánh dấu đọc', async () => {
      const result = await service.markAllAsRead('user-a-uuid');
      expect(result).toBe(3);
    });
  });
});
