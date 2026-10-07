import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../user/user.module';
import { ChatController } from './chat.controller';
import { ChatService } from './services/chat.service';
import { ChatWsService } from './services/chat-ws.service';
import { ChatMediaService } from './services/chat-media.service';
import { ChatConversationRepository } from './repositories/chat-conversation.repository';
import { ChatMessageRepository } from './repositories/chat-message.repository';

@Module({
  imports: [ConfigModule, UserModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatWsService,
    ChatMediaService,
    ChatConversationRepository,
    ChatMessageRepository,
  ],
  exports: [ChatService, ChatWsService, ChatConversationRepository, ChatMessageRepository],
})
export class ChatModule {}
