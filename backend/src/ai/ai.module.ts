import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiServiceClient } from './ai-service.client';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AiServiceClient],
  exports: [AiServiceClient],
})
export class AiModule {}
