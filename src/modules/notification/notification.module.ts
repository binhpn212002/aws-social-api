import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Notification } from '../../database/entities/notification.entity';
import { ScheduledNotification } from '../../database/entities/scheduled-notification.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './services/notification.service';
import { ScheduledNotificationService } from './services/scheduled-notification.service';
import { SqsProducerService } from './services/sqs-producer.service';
import { NotificationRepository } from './repositories/notification.repository';
import { ScheduledNotificationRepository } from './repositories/scheduled-notification.repository';
import { InternalApiGuard } from '../../common/guards/internal-api.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, ScheduledNotification]),
    ConfigModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    ScheduledNotificationService,
    SqsProducerService,
    NotificationRepository,
    ScheduledNotificationRepository,
    InternalApiGuard,
  ],
  exports: [NotificationService, ScheduledNotificationService],
})
export class NotificationModule {}
