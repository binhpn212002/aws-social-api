import { registerAs } from '@nestjs/config';

export default registerAs('aws', () => ({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  s3: {
    bucketName: process.env.AWS_S3_BUCKET_NAME || 'social-bucket-366518187546',
    region:
      process.env.AWS_S3_REGION || process.env.AWS_REGION || 'ap-southeast-1',
  },
  dynamodb: {
    chatTableName:
      process.env.AWS_DYNAMODB_CHAT_TABLE_NAME || 'social-chat-table',
    chatConversationsTableName:
      process.env.AWS_DYNAMODB_CHAT_CONVERSATIONS_TABLE_NAME ||
      'social-chat-conversations',
    chatMessagesTableName:
      process.env.AWS_DYNAMODB_CHAT_MESSAGES_TABLE_NAME ||
      'social-chat-messages',
    auditLogTableName:
      process.env.AWS_DYNAMODB_AUDIT_LOG_TABLE_NAME || 'social-audit-logs',
    tableName: process.env.AWS_DYNAMODB_TABLE_NAME || 'social-chat-table',
    region:
      process.env.AWS_DYNAMODB_REGION ||
      process.env.AWS_REGION ||
      'ap-southeast-1',
  },
  websocket: {
    endpoint: process.env.AWS_WEBSOCKET_ENDPOINT,
    managementEndpoint: process.env.AWS_WEBSOCKET_MANAGEMENT_ENDPOINT,
  },
}));
