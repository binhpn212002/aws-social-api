import { APIGatewayProxyEvent } from 'aws-lambda';
import { getRedisClient } from '../utils/redis.util';
import { verifyWebSocketToken } from '../utils/jwt-verifier.util';

export const handler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  console.log(`[WebSocket Connect Attempt] ConnectionId: ${connectionId}`);

  // 1. Trích xuất token từ Query String hoặc Sec-WebSocket-Protocol Header
  const token =
    event.queryStringParameters?.token ||
    event.headers?.['Sec-WebSocket-Protocol'] ||
    event.headers?.['sec-websocket-protocol'];

  if (!token) {
    console.warn(`[WebSocket Reject] Missing token for ConnectionId: ${connectionId}`);
    return { statusCode: 401, body: 'Unauthorized: Missing auth token' };
  }

  // 2. Xác thực JWT
  const user = verifyWebSocketToken(token);
  if (!user || !user.sub) {
    console.warn(`[WebSocket Reject] Invalid token for ConnectionId: ${connectionId}`);
    return { statusCode: 401, body: 'Unauthorized: Invalid auth token' };
  }

  const userId = user.sub;

  try {
    const redis = getRedisClient();
    // 3. Ghi nhận connection vào Redis
    const pipeline = redis.pipeline();
    pipeline.sadd(`ws:user:${userId}:connections`, connectionId!);
    pipeline.set(`ws:conn:${connectionId}:user`, userId, 'EX', 86400); // 24h TTL
    await pipeline.exec();

    console.log(`[WebSocket Connected] UserId: ${userId}, ConnectionId: ${connectionId}`);
  } catch (error) {
    console.warn(`[WebSocket Redis Warning] ConnectionId: ${connectionId}`, error);
  }

  return {
    statusCode: 200,
    body: 'Connected successfully',
    headers: event.headers?.['sec-websocket-protocol']
      ? { 'Sec-WebSocket-Protocol': event.headers['sec-websocket-protocol'] }
      : {},
  };
};
