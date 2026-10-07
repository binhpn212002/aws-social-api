import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { getRedisClient } from '../utils/redis.util';

const apiGwClient = new ApiGatewayManagementApiClient({
  endpoint: process.env.WEBSOCKET_ENDPOINT,
});

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const CHAT_CONVERSATIONS_TABLE =
  process.env.CHAT_CONVERSATIONS_TABLE || 'social-chat-conversations';
const CHAT_MESSAGES_TABLE =
  process.env.CHAT_MESSAGES_TABLE || 'social-chat-messages';

export const handler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  let body: any = {};

  try {
    if (event.body) {
      body = JSON.parse(event.body);
    }
  } catch {
    body = { action: 'unknown' };
  }

  const action = body.action || event.requestContext.routeKey || 'unknown';
  console.log(`[WebSocket Action] ConnectionId: ${connectionId}, Action: ${action}`);

  // 1. Heartbeat ping -> pong
  if (action === 'ping') {
    try {
      await apiGwClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId!,
          Data: Buffer.from(
            JSON.stringify({ action: 'pong', timestamp: Date.now() }),
          ),
        }),
      );
    } catch (err) {
      console.warn('[WebSocket ping pong error]:', err);
    }
    return { statusCode: 200, body: 'PONG' };
  }

  // 2. Join conversation room
  if (action === 'joinRoom') {
    const conversationId = body.conversationId;
    if (!conversationId) {
      return { statusCode: 400, body: 'Missing conversationId' };
    }

    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();
      pipeline.sadd(`ws:room:${conversationId}:connections`, connectionId!);
      pipeline.sadd(`ws:conn:${connectionId}:rooms`, conversationId);
      await pipeline.exec();

      console.log(
        `[WebSocket Room Joined] Connection ${connectionId} joined room ${conversationId}`,
      );

      // Phản hồi xác nhận cho client
      await apiGwClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId!,
          Data: Buffer.from(
            JSON.stringify({
              event: 'room:joined',
              conversationId,
              timestamp: Date.now(),
            }),
          ),
        }),
      );
    } catch (roomErr) {
      console.warn('[WebSocket joinRoom error]:', roomErr);
    }

    return { statusCode: 200, body: 'Joined room successfully' };
  }

  // 3. Gửi tin nhắn qua WebSocket
  if (action === 'sendMessage') {
    const { conversationId, content, type = 'TEXT' } = body;
    if (!conversationId || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing conversationId or content' }),
      };
    }

    const redis = getRedisClient();

    // 3.1. Xác thực người gửi từ Redis session
    const senderId = await redis.get(`ws:conn:${connectionId}:user`);
    if (!senderId) {
      console.warn(`[WebSocket sendMessage] Unauthorized connectionId: ${connectionId}`);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Session not found' }),
      };
    }

    // 3.2. Truy vấn thông tin cuộc hội thoại từ DynamoDB
    let conversation: any = null;
    try {
      const convRes = await docClient.send(
        new GetCommand({
          TableName: CHAT_CONVERSATIONS_TABLE,
          Key: { id: conversationId },
        }),
      );
      conversation = convRes.Item;
    } catch (getErr) {
      console.error('[WebSocket sendMessage] DynamoDB get conversation error:', getErr);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Database read failed' }),
      };
    }

    if (!conversation) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Conversation not found' }),
      };
    }

    if (
      !Array.isArray(conversation.memberIds) ||
      !conversation.memberIds.includes(senderId)
    ) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Forbidden: You are not a member' }),
      };
    }

    // 3.3. Tạo tin nhắn và lưu vào DynamoDB
    const messageId = randomUUID();
    const now = new Date().toISOString();
    const sk = `${now}#${messageId}`;

    const messageItem = {
      conversationId,
      sk,
      id: messageId,
      userId: senderId,
      type: type || 'TEXT',
      content: String(content).trim(),
      isRecalled: false,
      createdAt: now,
    };

    const recipientIds: string[] = conversation.memberIds.filter(
      (id: string) => id !== senderId,
    );

    let updateExpression =
      'SET lastMessage = :lm, lastMessageAt = :now, updatedAt = :now';
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, any> = {
      ':lm': {
        id: messageId,
        userId: senderId,
        content: messageItem.content,
        type: messageItem.type,
        createdAt: now,
      },
      ':now': now,
      ':one': 1,
    };

    if (conversation.unreadCounts) {
      recipientIds.forEach((uid, idx) => {
        const alias = `#u_${idx}`;
        exprNames[alias] = uid;
        updateExpression += `, unreadCounts.${alias} = if_not_exists(unreadCounts.${alias}, :zero) + :one`;
      });
      if (recipientIds.length > 0) {
        exprValues[':zero'] = 0;
      }
    } else {
      const initMap: Record<string, number> = {};
      recipientIds.forEach((uid) => {
        initMap[uid] = 1;
      });
      updateExpression += ', unreadCounts = :initMap';
      exprValues[':initMap'] = initMap;
    }

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: CHAT_MESSAGES_TABLE,
                Item: messageItem,
              },
            },
            {
              Update: {
                TableName: CHAT_CONVERSATIONS_TABLE,
                Key: { id: conversationId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames:
                  Object.keys(exprNames).length > 0 ? exprNames : undefined,
                ExpressionAttributeValues: exprValues,
              },
            },
          ],
        }),
      );
      console.log(
        `[WebSocket sendMessage] Successfully saved message ${messageId} to DynamoDB`,
      );
    } catch (txErr) {
      console.error('[WebSocket sendMessage] TransactWrite failed:', txErr);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to save message' }),
      };
    }

    // 3.4. Lấy sender profile từ Redis
    let senderProfile = {
      id: senderId,
      username: 'user',
      fullName: 'Người dùng',
      avatarUrl: null as string | null,
      status: 'ACTIVE',
    };
    try {
      const cachedProfile = await redis.get(`user:profile:${senderId}`);
      if (cachedProfile) {
        senderProfile = { ...senderProfile, ...JSON.parse(cachedProfile) };
      }
    } catch (cacheErr) {
      console.warn('[WebSocket sendMessage] Profile cache read warning:', cacheErr);
    }

    // 3.5. Đẩy tin nhắn thời gian thực qua WebSocket (event: 'message:new')
    const chatMessagePayload = {
      event: 'message:new',
      data: {
        ...messageItem,
        sender: senderProfile,
      },
    };
    const chatBuffer = Buffer.from(JSON.stringify(chatMessagePayload));

    // Lấy tất cả kết nối trong phòng chat và các kết nối cá nhân của các thành viên
    const roomConns = await redis.smembers(
      `ws:room:${conversationId}:connections`,
    );
    const memberConnPromises = (conversation.memberIds || []).map((mId: string) =>
      redis.smembers(`ws:user:${mId}:connections`),
    );
    const memberConnResults = await Promise.all(memberConnPromises);
    const allTargetConnections = Array.from(
      new Set([...roomConns, ...memberConnResults.flat()]),
    );

    await Promise.allSettled(
      allTargetConnections.map(async (connId) => {
        try {
          await apiGwClient.send(
            new PostToConnectionCommand({
              ConnectionId: connId,
              Data: chatBuffer,
            }),
          );
        } catch (postErr: any) {
          if (
            postErr?.name === 'GoneException' ||
            postErr?.$metadata?.httpStatusCode === 410
          ) {
            console.log(`[WebSocket sendMessage] Stale connection ${connId}`);
            await redis.srem(`ws:room:${conversationId}:connections`, connId);
          }
        }
      }),
    );

    // 3.6. Tạo và gửi thông báo (event: 'NOTIFICATION_RECEIVED') cho người nhận tin nhắn
    const notificationPayload = {
      event: 'NOTIFICATION_RECEIVED',
      data: {
        id: `msg-notif-${messageId}`,
        type: 'MESSAGE',
        title: `Tin nhắn mới từ ${senderProfile.fullName || 'Người dùng'}`,
        message: messageItem.content,
        referenceId: conversationId,
        referenceType: 'CONVERSATION',
        sender: senderProfile,
        createdAt: now,
      },
    };
    const notifBuffer = Buffer.from(JSON.stringify(notificationPayload));

    for (const rId of recipientIds) {
      const recipientConns = await redis.smembers(`ws:user:${rId}:connections`);
      if (recipientConns && recipientConns.length > 0) {
        await Promise.allSettled(
          recipientConns.map(async (cId) => {
            try {
              await apiGwClient.send(
                new PostToConnectionCommand({
                  ConnectionId: cId,
                  Data: notifBuffer,
                }),
              );
            } catch (err: any) {
              if (
                err?.name === 'GoneException' ||
                err?.$metadata?.httpStatusCode === 410
              ) {
                await redis.srem(`ws:user:${rId}:connections`, cId);
              }
            }
          }),
        );
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        messageId,
        conversationId,
        createdAt: now,
      }),
    };
  }

  return { statusCode: 200, body: 'Received' };
};

