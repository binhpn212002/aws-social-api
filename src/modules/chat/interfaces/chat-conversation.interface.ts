export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

export interface DynamoChatConversation {
  id: string;                            // PK: UUID v4
  type: ConversationType;                // DIRECT hoặc GROUP
  name?: string;                         // Tên nhóm (GROUP)
  avatarUrl?: string;                    // Avatar nhóm (GROUP)
  memberIds: string[];                   // Mảng danh sách userId thành viên
  lastMessage?: {
    id: string;
    userId: string;                      // id người gửi tin cuối
    content: string;
    type: string;
    createdAt: string;
  };
  lastMessageAt?: string;                // ISO8601 timestamp để sort
  unreadCounts?: Record<string, number>; // { [userId]: number }
  createdBy: string;                     // userId người tạo
  createdAt: string;
  updatedAt: string;
}
