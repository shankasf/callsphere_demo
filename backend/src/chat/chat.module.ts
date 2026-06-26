import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [ChatController],
})
export class ChatModule {}
