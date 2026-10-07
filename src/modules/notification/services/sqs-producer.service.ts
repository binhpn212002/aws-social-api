import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export interface NotificationQueuePayload {
  eventId: string;
  eventType: 'NOTIFICATION_DISPATCH' | 'SCHEDULED_NOTIFICATION_DISPATCH';
  notificationId?: string;
  scheduleId?: string;
  recipientId?: string;
  senderId?: string | null;
  type?: string;
  title?: string;
  message?: string;
  referenceId?: string | null;
  referenceType?: string | null;
  createdAt: string;
}

@Injectable()
export class SqsProducerService {
  private readonly logger = new Logger(SqsProducerService.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.sqsClient = new SQSClient({
      region: this.configService.get<string>('AWS_REGION', 'ap-southeast-1'),
    });
    this.queueUrl =
      this.configService.get<string>('AWS_SQS_NOTIFICATION_QUEUE_URL') ||
      this.configService.get<string>('NOTIFICATION_QUEUE_URL') ||
      'https://sqs.ap-southeast-1.amazonaws.com/123456789012/social-notification-queue';
  }

  async pushToQueue(payload: NotificationQueuePayload): Promise<string | undefined> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
        MessageAttributes: {
          EventType: {
            DataType: 'String',
            StringValue: payload.eventType,
          },
        },
      });

      const response = await this.sqsClient.send(command);
      this.logger.log(
        `Job enqueued successfully: EventId=${payload.eventId}, MessageId=${response.MessageId}`,
      );
      return response.MessageId;
    } catch (error) {
      this.logger.error(
        `Failed to enqueue notification job: EventId=${payload.eventId}`,
        error,
      );
      throw error;
    }
  }
}
