export const TABLE_NAMES = {
  USERS: 'users',
  ROLES: 'roles',
  USER_ROLES: 'user_roles',
  POSTS: 'posts',
  POST_MEDIA: 'post_media',
  POST_LIKES: 'post_likes',
  COMMENTS: 'comments',
  LIKES: 'likes',
  FOLLOWS: 'follows',
  FRIENDSHIPS: 'friendships',
  NOTIFICATIONS: 'notifications',
  SCHEDULED_NOTIFICATIONS: 'scheduled_notifications',
} as const;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const DYNAMODB_TABLES = {
  CHAT_CONVERSATIONS: 'social-chat-conversations',
  CHAT_MESSAGES: 'social-chat-messages',
  AUDIT_LOGS: 'social-audit-logs',
} as const;

export const CHAT_MEDIA_LIMITS = {
  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  VIDEO_MAX_SIZE: 50 * 1024 * 1024, // 50MB
  AUDIO_MAX_SIZE: 15 * 1024 * 1024, // 15MB
  FILE_MAX_SIZE: 25 * 1024 * 1024,  // 25MB
} as const;

export const CHAT_WS_ACTIONS = {
  SEND_MESSAGE: 'sendMessage',
  TYPING: 'typing',
  MARK_AS_READ: 'markAsRead',
} as const;

export const CHAT_WS_EVENTS = {
  MESSAGE_NEW: 'message:new',
  USER_TYPING: 'user:typing',
  CONVERSATION_READ: 'conversation:read',
} as const;
