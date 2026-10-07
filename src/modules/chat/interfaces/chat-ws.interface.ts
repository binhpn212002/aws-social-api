export interface WsActionFrame<T = any> {
  action: string;
  conversationId?: string;
  data?: T;
  [key: string]: any;
}

export interface WsEventBroadcast<T = any> {
  event: string;
  data: T;
}
