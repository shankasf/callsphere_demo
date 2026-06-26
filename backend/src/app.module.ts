import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CallsModule } from './calls/calls.module';
import { TicketsModule } from './tickets/tickets.module';
import { DevicesModule } from './devices/devices.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ContactsModule } from './contacts/contacts.module';
import { EventsModule } from './events/events.module';
import { AiModule } from './ai/ai.module';
import { VoiceModule } from './voice/voice.module';
import { ChatModule } from './chat/chat.module';
import { IndustriesModule } from './industries/industries.module';
import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    CallsModule,
    TicketsModule,
    DevicesModule,
    DashboardModule,
    OrganizationsModule,
    ContactsModule,
    EventsModule,
    AiModule,
    VoiceModule,
    ChatModule,
    IndustriesModule,
    DemoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
