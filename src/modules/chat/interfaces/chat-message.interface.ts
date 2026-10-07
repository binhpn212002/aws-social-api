export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  FILE = 'FILE',
}

export interface DynamoChatMessage {
  conversationId: string;           // PK: UUID
  sk: string;                       // SK: createdAt#id
  id: string;                       // UUID
  userId: string;                   // id người gửi tin nhắn
  type: MessageType;
  content: string;
  mediaUrl?: string;
  s3Key?: string;
  fileName?: string;
  fileSize?: number;
  replyToId?: string;
  isRecalled?: boolean;
  createdAt: string;
  ttl?: number;
}
