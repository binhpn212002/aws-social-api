/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "social-api",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const bucket = new sst.aws.Bucket("SocialBucket", {
      access: "public",
      cors: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "HEAD"],
        allowHeaders: ["*"],
      },
      policy: [
        {
          actions: ["s3:*"],
          principals: "*",
        },
      ],
      transform: {
        bucket: {
          bucket: "social-bucket-366518187546",
        },
      },
    });

    const chatConversationsTable = new sst.aws.Dynamo("ChatConversationsTable", {
      fields: {
        id: "string",
      },
      primaryIndex: { hashKey: "id" },
      transform: {
        table: {
          name: "social-chat-conversations",
        },
      },
    });

    const chatMessagesTable = new sst.aws.Dynamo("ChatMessagesTable", {
      fields: {
        conversationId: "string",
        sk: "string",
      },
      primaryIndex: { hashKey: "conversationId", rangeKey: "sk" },
      ttl: "ttl",
      transform: {
        table: {
          name: "social-chat-messages",
        },
      },
    });

    const auditLogTable = new sst.aws.Dynamo("AuditLogTable", {
      fields: {
        PK: "string",
        SK: "string",
      },
      primaryIndex: { hashKey: "PK", rangeKey: "SK" },
      ttl: "ttl",
      transform: {
        table: {
          name: "social-audit-logs",
        },
      },
    });

    const notificationWs = new sst.aws.ApiGatewayWebSocket("NotificationWebSocket", {
      transform: {
        api: {
          name: "social-notification-ws",
        },
      },
    });

    notificationWs.route("$connect", {
      handler: "infra/lambda-handler/websocket/connect.handler",
      environment: {
        REDIS_HOST: process.env.REDIS_HOST || "116.118.3.84",
        REDIS_PORT: process.env.REDIS_PORT || "6379",
        REDIS_PASSWORD: process.env.REDIS_PASSWORD || "",
        JWT_SECRET: process.env.JWT_SECRET || "super-secret-key-change-in-production",
        JWT_ACCESS_SECRET:
          process.env.JWT_SECRET ||
          process.env.JWT_ACCESS_SECRET ||
          "super-secret-key-change-in-production",
      },
    });

    notificationWs.route("$disconnect", {
      handler: "infra/lambda-handler/websocket/disconnect.handler",
      environment: {
        REDIS_HOST: process.env.REDIS_HOST || "116.118.3.84",
        REDIS_PORT: process.env.REDIS_PORT || "6379",
        REDIS_PASSWORD: process.env.REDIS_PASSWORD || "",
      },
    });

    const wsRoutePermissions = [
      {
        actions: ["execute-api:ManageConnections"],
        resources: ["*"],
      },
      {
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem",
        ],
        resources: [
          chatConversationsTable.arn,
          chatMessagesTable.arn,
        ],
      },
    ];

    const wsRouteEnvironment = {
      WEBSOCKET_ENDPOINT: notificationWs.managementEndpoint,
      REDIS_HOST: process.env.REDIS_HOST || "116.118.3.84",
      REDIS_PORT: process.env.REDIS_PORT || "6379",
      REDIS_PASSWORD: process.env.REDIS_PASSWORD || "",
      CHAT_CONVERSATIONS_TABLE: chatConversationsTable.name,
      CHAT_MESSAGES_TABLE: chatMessagesTable.name,
    };

    notificationWs.route("$default", {
      handler: "infra/lambda-handler/websocket/default.handler",
      environment: wsRouteEnvironment,
      permissions: wsRoutePermissions,
    });

    notificationWs.route("joinRoom", {
      handler: "infra/lambda-handler/websocket/default.handler",
      environment: wsRouteEnvironment,
      permissions: wsRoutePermissions,
    });

    notificationWs.route("sendMessage", {
      handler: "infra/lambda-handler/websocket/default.handler",
      environment: wsRouteEnvironment,
      permissions: wsRoutePermissions,
    });

    const notificationDlq = new sst.aws.Queue("NotificationDLQ", {
      transform: {
        queue: {
          queueName: "social-notification-dlq",
        },
      },
    });

    notificationDlq.subscribe({
      handler: "infra/lambda-handler/notification/dlq-consumer.handler",
      environment: {
        API_INTERNAL_URL: process.env.API_INTERNAL_URL || "http://localhost:3000/api/v1",
        INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || "internal-secret-token",
      },
    });

    const notificationQueue = new sst.aws.Queue("NotificationQueue", {
      dlq: {
        queue: notificationDlq.arn,
        retry: 3,
      },
      transform: {
        queue: {
          queueName: "social-notification-queue",
          visibilityTimeout: 30,
        },
      },
    });

    notificationQueue.subscribe({
      handler: "infra/lambda-handler/notification/consumer.handler",
      batch: {
        size: 10,
        window: "2 seconds",
        response: "reportBatchItemFailures",
      },
      environment: {
        WEBSOCKET_ENDPOINT: notificationWs.managementEndpoint,
        API_INTERNAL_URL: process.env.API_INTERNAL_URL || "http://localhost:3000/api/v1",
        INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || "internal-secret-token",
        REDIS_HOST: process.env.REDIS_HOST || "116.118.3.84",
        REDIS_PORT: process.env.REDIS_PORT || "6379",
        REDIS_PASSWORD: process.env.REDIS_PASSWORD || "",
      },
      permissions: [
        {
          actions: ["execute-api:ManageConnections"],
          resources: ["*"],
        },
      ],
    });

    return {
      bucketName: bucket.name,
      bucketArn: bucket.arn,
      chatConversationsTableName: chatConversationsTable.name,
      chatConversationsTableArn: chatConversationsTable.arn,
      chatMessagesTableName: chatMessagesTable.name,
      chatMessagesTableArn: chatMessagesTable.arn,
      auditLogTableName: auditLogTable.name,
      auditLogTableArn: auditLogTable.arn,
      websocketUrl: notificationWs.url,
      websocketManagementEndpoint: notificationWs.managementEndpoint,
      notificationQueueUrl: notificationQueue.url,
      notificationQueueArn: notificationQueue.arn,
      notificationDlqUrl: notificationDlq.url,
      notificationDlqArn: notificationDlq.arn,
    };
  },
});
