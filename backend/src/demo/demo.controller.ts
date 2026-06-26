import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { DemoService } from './demo.service';

interface DemoLeadDto {
  email: string;
  name?: string;
  industry?: string;
  industrySlug?: string;
  industryName?: string;
}

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  // Public (no auth): the demo dashboard runs without login, mirroring the
  // open ChatController / VoiceController pattern. Captures the visitor's email
  // and sends a confirmation email via SES.
  @Post('lead')
  @ApiOperation({
    summary: 'Capture a demo visitor email and send a confirmation',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        name: { type: 'string' },
        industry: { type: 'string', description: 'Industry slug' },
        industryName: { type: 'string', description: 'Industry display name' },
      },
      required: ['email'],
    },
  })
  async captureLead(@Body() body: DemoLeadDto): Promise<any> {
    return this.demoService.captureLead({
      email: body?.email,
      name: body?.name,
      industrySlug: body?.industrySlug || body?.industry,
      industryName: body?.industryName,
    });
  }

  @Get('chatbot-metrics')
  @ApiOperation({ summary: 'Aggregated chatbot metrics for the dashboard' })
  async chatbotMetrics(
    @Query('industry') industry?: string,
    @Query('range') range?: string,
  ): Promise<any> {
    return this.demoService.getChatbotMetrics(industry || 'all', range || '7d');
  }
}
