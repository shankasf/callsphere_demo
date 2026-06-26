import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [VoiceController],
})
export class VoiceModule {}
