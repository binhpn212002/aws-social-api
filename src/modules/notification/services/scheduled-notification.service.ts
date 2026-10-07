import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  FlexibleTimeWindowMode,
} from '@aws-sdk/client-scheduler';
import {
  ScheduledNotification,
  ScheduleNotificationStatus,
} from '../../../database/entities/scheduled-notification.entity';
import { ScheduledNotificationRepository } from '../repositories/scheduled-notification.repository';
import { CreateScheduledNotificationDto } from '../dto/create-scheduled-notification.dto';
import { PaginationQueryDto } from '../../../common/utils/pagination.dto';
import { NotifyCompletedDto } from '../dto/notify-completed.dto';

@Injectable()
export class ScheduledNotificationService {
  private readonly logger = new Logger(ScheduledNotificationService.name);
  private readonly schedulerClient: SchedulerClient;
  private readonly sqsQueueArn: string;
  private readonly schedulerRoleArn: string;

  constructor(
    private readonly scheduledRepo: ScheduledNotificationRepository,
    private readonly configService: ConfigService,
  ) {
    this.schedulerClient = new SchedulerClient({
      region: this.configService.get<string>('AWS_REGION', 'ap-southeast-1'),
    });
    this.sqsQueueArn = this.configService.get<string>(
      'NOTIFICATION_QUEUE_ARN',
      'arn:aws:sqs:ap-southeast-1:123456789012:social-notification-queue',
    );
    this.schedulerRoleArn = this.configService.get<string>(
      'EVENTBRIDGE_SCHEDULER_ROLE_ARN',
      'arn:aws:iam::123456789012:role/social-scheduler-role',
    );
  }

  async createSchedule(
    userId: string,
    dto: CreateScheduledNotificationDto,
  ): Promise<ScheduledNotification> {
    const scheduledDate = new Date(dto.scheduledAt);
    const now = new Date();
    const minLeadTimeMs = 5 * 60 * 1000; // Tối thiểu 5 phút trong tương lai

    if (scheduledDate.getTime() - now.getTime() < minLeadTimeMs) {
      throw new BadRequestException('Thời gian đặt lịch phải sau thời điểm hiện tại ít nhất 5 phút');
    }

    // 1. Tạo bản ghi PENDING trong database
    const schedule = await this.scheduledRepo.create({
      userId,
      title: dto.title,
      content: dto.content,
      scheduledAt: scheduledDate,
      targetType: dto.targetType,
      targetUserIds: dto.targetUserIds || [],
      status: ScheduleNotificationStatus.PENDING,
    });

    // 2. Tạo AWS EventBridge One-time Schedule bắn vào SQS
    const scheduleName = `scheduled-noti-${schedule.id}`;
    const scheduleExpression = `at(${scheduledDate.toISOString().replace('.000', '')})`;

    try {
      const command = new CreateScheduleCommand({
        Name: scheduleName,
        ScheduleExpression: scheduleExpression,
        FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
        Target: {
          Arn: this.sqsQueueArn,
          RoleArn: this.schedulerRoleArn,
          Input: JSON.stringify({
            eventId: `sched_evt_${schedule.id}`,
            eventType: 'SCHEDULED_NOTIFICATION_DISPATCH',
            scheduleId: schedule.id,
            userId,
            title: schedule.title,
            content: schedule.content,
            targetType: schedule.targetType,
            targetUserIds: schedule.targetUserIds,
            createdAt: schedule.createdAt.toISOString(),
          }),
        },
      });

      const response = await this.schedulerClient.send(command);
      schedule.schedulerArn = response.ScheduleArn;
      await this.scheduledRepo.update(schedule.id, { schedulerArn: response.ScheduleArn });

      this.logger.log(`EventBridge schedule created: ${response.ScheduleArn}`);
      return schedule;
    } catch (error) {
      this.logger.error(`Failed to register EventBridge schedule for ${schedule.id}`, error);
      await this.scheduledRepo.update(schedule.id, { status: ScheduleNotificationStatus.FAILED });
      throw new BadRequestException('Không thể đăng ký lịch gửi thông báo trên AWS');
    }
  }

  async listSchedules(userId: string, query: PaginationQueryDto) {
    const { items, total } = await this.scheduledRepo.findUserSchedules(userId, query);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 10));

    return {
      items,
      meta: {
        totalItems: total,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async cancelSchedule(userId: string, scheduleId: string): Promise<boolean> {
    const schedule = await this.scheduledRepo.findById(scheduleId);
    if (!schedule) {
      throw new NotFoundException('Không tìm thấy lịch hẹn thông báo');
    }

    if (schedule.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền hủy lịch hẹn này');
    }

    if (schedule.status !== ScheduleNotificationStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy lịch hẹn đang ở trạng thái PENDING');
    }

    // Xóa schedule trên EventBridge
    try {
      const scheduleName = `scheduled-noti-${schedule.id}`;
      await this.schedulerClient.send(new DeleteScheduleCommand({ Name: scheduleName }));
    } catch (err) {
      this.logger.warn(`Could not delete schedule ${schedule.id} from EventBridge (might have fired or not found)`, err);
    }

    await this.scheduledRepo.update(schedule.id, { status: ScheduleNotificationStatus.CANCELLED });
    return true;
  }

  async completeSchedule(dto: NotifyCompletedDto): Promise<boolean> {
    if (!dto.scheduleId) {
      throw new BadRequestException('scheduleId is required');
    }

    return this.scheduledRepo.updateScheduleStatus(
      dto.scheduleId,
      dto.status === 'COMPLETED' ? ScheduleNotificationStatus.COMPLETED : ScheduleNotificationStatus.FAILED,
      new Date(dto.sentAt),
      dto.totalRecipients,
    );
  }
}
