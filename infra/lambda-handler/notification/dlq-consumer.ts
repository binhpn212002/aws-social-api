import { SQSEvent } from 'aws-lambda';
import axios from 'axios';

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL || 'http://localhost:3000/api/v1';
const INTERNAL_API_SECRET =
  process.env.INTERNAL_API_SECRET || 'internal-secret-token';

export const handler = async (event: SQSEvent): Promise<void> => {
  console.error(
    `[DLQ Alert] Received ${event.Records.length} poison pill messages from Dead Letter Queue!`,
  );

  for (const record of event.Records) {
    try {
      const payload = JSON.parse(record.body);
      const { notificationId, scheduleId, eventId } = payload;
      const receiveCount =
        record.attributes?.ApproximateReceiveCount || 'unknown';

      console.error(
        `[DLQ Record] EventId: ${eventId}, NotificationId: ${notificationId}, ScheduleId: ${scheduleId}, Retries: ${receiveCount}`,
      );

      // Gọi API đánh dấu thất bại chính thức cho bản ghi trong DB
      await axios.post(
        `${API_INTERNAL_URL}/notifications/notify-completed`,
        {
          notificationId,
          scheduleId,
          status: 'FAILED',
          deliveredVia: 'NONE',
          sentAt: new Date().toISOString(),
          errorMessage: `Message moved to DLQ after ${receiveCount} failed retries. MessageId: ${record.messageId}`,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': INTERNAL_API_SECRET,
          },
          timeout: 5000,
        },
      );

      console.log(
        `[DLQ Mark Failed] Successfully marked ID ${notificationId || scheduleId} as FAILED in database`,
      );
    } catch (err: any) {
      console.error(
        `[DLQ Processing Error] Failed to handle DLQ message: ${record.messageId}`,
        err,
      );
    }
  }
};
