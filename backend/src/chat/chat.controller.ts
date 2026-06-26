import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

interface ChatDto {
  message: string;
  session_id?: string;
  industry?: string;
  context?: Record<string, any>;
}

interface ChatStartDto {
  industry?: string;
}

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private configService: ConfigService) {}

  // Public: the dashboard runs without login (see frontend services/api.ts), so the
  // chat widget cannot send a JWT. Mirrors the open-dashboard pattern used by VoiceController.
  @Post('start')
  @ApiOperation({ summary: 'Start a new text chat session with the AI agent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        industry: { type: 'string', description: 'Industry slug selecting the agent persona' },
      },
    },
  })
  async startChat(@Body() body: ChatStartDto): Promise<any> {
    return this.proxy('/api/chat/start', { industry: body?.industry });
  }

  @Post()
  @ApiOperation({ summary: 'Send a text message to the AI agent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'User message' },
        session_id: { type: 'string', description: 'Session ID for conversation continuity' },
        industry: { type: 'string', description: 'Industry slug selecting the agent persona' },
        context: { type: 'object', description: 'Additional context (organization_id, contact_id, etc.)' },
      },
      required: ['message'],
    },
  })
  async chat(@Body() body: ChatDto): Promise<any> {
    return this.proxy('/api/chat', {
      message: body.message,
      session_id: body.session_id,
      industry: body.industry,
      context: body.context,
    });
  }

  // Transparently forwards the JSON body to the AI service and returns its JSON
  // response. Upstream failures surface as a clean 502 with a JSON error body.
  private async proxy(path: string, payload: Record<string, any>): Promise<any> {
    const aiServiceUrl =
      this.configService.get('AI_SERVICE_URL') || 'http://localhost:8081';

    try {
      const response = await fetch(`${aiServiceUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new HttpException(
          { error: 'AI service error', detail: errorText },
          HttpStatus.BAD_GATEWAY,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Chat proxy error:', error);
      throw new HttpException(
        { error: 'Failed to connect to chat service' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
