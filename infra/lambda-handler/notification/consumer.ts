import { SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import axios from 'axios';
import { getRedisClient } from '../utils/redis.util';

const apiGwClient = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT,
});

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL || 'http://localhost:3000/api/v1';
const INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET || 'internal-secret-token';

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  console.log(
    `[Notification Consumer] Processing batch of ${event.Records.length} records`,
  );

  for (const record of event.Records) {
    try {
      await processSingleRecord(record);
    } catch (err: any) {
      console.error(
        `[Record Error] Failed processing record ${record.messageId}:`,
        err,
      );
      // Ghi nhận message lỗi để SQS chỉ retry duy nhất message này
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

async function processSingleRecord(record: SQSRecord): Promise<void> {
  const payload = JSON.parse(record.body);
  const {
    eventType,
    notificationId,
    recipientId,
    scheduleId,
    targetUserIds,
    targetType,
  } = payload;
  const redis = getRedisClient();

  let deliveredVia = 'NONE';
  let isSuccess = false;
  let errorMessage: string | null = null;
  let totalRecipients = 0;

  try {
    if (eventType === 'NOTIFICATION_DISPATCH') {
      // -------------------------------------------------------------
      // 1. XỬ LÝ THÔNG BÁO TƯƠNG TÁC ĐƠN LẺ
      // -------------------------------------------------------------
      const redisKey = `ws:user:${recipientId}:connections`;
      const connectionIds = await redis.smembers(redisKey);

      if (connectionIds && connectionIds.length > 0) {
        const frameData = Buffer.from(
          JSON.stringify({
            event: 'NOTIFICATION_RECEIVED',
            data: {
              id: notificationId,
              type: payload.type,
              title: payload.title,
              message: payload.message,
              referenceId: payload.referenceId,
              referenceType: payload.referenceType,
              createdAt: payload.createdAt,
            },
          }),
        );

        // Gửi tới tất cả thiết bị trực tuyến của người nhận
        const pushPromises = connectionIds.map(async (connId) => {
          try {
            await apiGwClient.send(
              new PostToConnectionCommand({
                ConnectionId: connId,
                Data: frameData,
              }),
            );
            deliveredVia = 'WEBSOCKET';
          } catch (postErr: any) {
            if (
              postErr instanceof GoneException ||
              postErr?.$metadata?.httpStatusCode === 410
            ) {
              console.warn(
                `[Stale Connection] Cleaning up ${connId} for user ${recipientId}`,
              );
              await redis.srem(redisKey, connId);
            } else {
              console.error(
                `[Push Error] Failed posting to connection ${connId}:`,
                postErr,
              );
            }
          }
        });

        await Promise.allSettled(pushPromises);
      } else {
        console.log(
          `[User Offline] Recipient ${recipientId} has no active WebSocket connections.`,
        );
        // Tùy chọn: Gửi FCM Push Notification tại đây
      }

      isSuccess = true;
    } else if (eventType === 'SCHEDULED_NOTIFICATION_DISPATCH') {
      // -------------------------------------------------------------
      // 2. XỬ LÝ PHÁT TÁN THÔNG BÁO LẬP LỊCH CHO BẠN BÈ (FAN-OUT)
      // -------------------------------------------------------------
      console.log(`[Scheduled Dispatch] Executing schedule ${scheduleId}`);
      let friendIds: string[] = [];

      if (targetType === 'SELECTED_FRIENDS' && Array.isArray(targetUserIds)) {
        friendIds = targetUserIds;
      } else {
        // Truy vấn danh sách bạn bè qua Internal API
        try {
          const friendRes = await axios.get(
            `${API_INTERNAL_URL}/friends/accepted-ids?userId=${payload.userId}`,
            {
              headers: { 'x-internal-api-key': INTERNAL_API_SECRET },
              timeout: 5000,
            },
          );
          friendIds = friendRes.data?.data || [];
        } catch (apiErr) {
          console.warn('[Fetch Friends Fallback] Using empty list', apiErr);
        }
      }

      totalRecipients = friendIds.length;
      const frameData = Buffer.from(
        JSON.stringify({
          event: 'NOTIFICATION_RECEIVED',
          data: {
            scheduleId,
            type: 'SCHEDULED_REMINDER',
            title: payload.title,
            message: payload.content,
            createdAt: new Date().toISOString(),
          },
        }),
      );

      // Fan-out theo từng mẻ (batch 50 bạn bè) để không làm ngộp WebSocket API
      const BATCH_SIZE = 50;
      for (let i = 0; i < friendIds.length; i += BATCH_SIZE) {
        const batch = friendIds.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (fId) => {
            const fConnIds = await redis.smembers(`ws:user:${fId}:connections`);
            if (fConnIds && fConnIds.length > 0) {
              for (const cId of fConnIds) {
                try {
                  await apiGwClient.send(
                    new PostToConnectionCommand({
                      ConnectionId: cId,
                      Data: frameData,
                    }),
                  );
                } catch (err: any) {
                  if (err instanceof GoneException) {
                    await redis.srem(`ws:user:${fId}:connections`, cId);
                  }
                }
              }
            }
          }),
        );
      }

      deliveredVia = 'WEBSOCKET';
      isSuccess = true;
    }
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error?.message || 'Unexpected worker error occurred';
    throw error; // Ném lỗi để ghi nhận batchItemFailures
  } finally {
    // -------------------------------------------------------------
    // 3. GỌI API CALLBACK NOTIFY-COMPLETED ĐỂ CẬP NHẬT TRẠNG THÁI APP
    // -------------------------------------------------------------
    await sendNotifyCompletedCallback({
      notificationId,
      scheduleId,
      status: isSuccess ? 'COMPLETED' : 'FAILED',
      deliveredVia,
      totalRecipients,
      sentAt: new Date().toISOString(),
      errorMessage,
    });
  }
}

async function sendNotifyCompletedCallback(body: {
  notificationId?: string;
  scheduleId?: string;
  status: string;
  deliveredVia?: string;
  totalRecipients?: number;
  sentAt: string;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const endpoint = `${API_INTERNAL_URL}/notifications/notify-completed`;
    await axios.post(endpoint, body, {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_SECRET,
      },
      timeout: 5000,
    });
    console.log(
      `[Callback Success] Updated status ${body.status} for ID: ${body.notificationId || body.scheduleId}`,
    );
  } catch (error: any) {
    console.error(`[Callback Failed]:`, error?.response?.data || error.message);
  }
}
