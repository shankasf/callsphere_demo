import { Controller, Post, Body, Req, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

interface WebRTCConnectDto {
  sdp: string;
  role: 'admin' | 'agent' | 'requester';
  maxDuration?: number;
}

interface WebRTCConnectResponse {
  sdp: string;
  sessionId: string;
}

@ApiTags('voice')
@Controller('voice')
export class VoiceController {
  constructor(private configService: ConfigService) {}

  // Public: the dashboard runs without login (see frontend services/api.ts), so the
  // voice widget cannot send a JWT. Auth was removed here to fix the 401 it caused.
  @Post('webrtc/connect')
  @ApiOperation({ summary: 'Initiate WebRTC voice connection to AI agent' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sdp: { type: 'string', description: 'WebRTC SDP offer' },
        role: { type: 'string', enum: ['admin', 'agent', 'requester'] },
        maxDuration: { type: 'number', description: 'Max call duration in minutes' },
      },
      required: ['sdp', 'role'],
    },
  })
  async connectWebRTC(
    @Body() body: WebRTCConnectDto,
    @Req() req: any,
  ): Promise<WebRTCConnectResponse> {
    const aiServiceUrl = this.configService.get('AI_SERVICE_URL') || 'http://localhost:8081';
    
    try {
      // Unified Interface: Proxy SDP to AI service which forwards to OpenAI
      const response = await fetch(`${aiServiceUrl}/webrtc/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sdp: body.sdp,
          role: body.role,
          maxDuration: body.maxDuration,
          userId: req.user?.sub,
          userEmail: req.user?.email,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new HttpException(
          `AI service error: ${errorText}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = await response.json();
      return {
        sdp: data.sdp,
        sessionId: data.sessionId,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('WebRTC connect error:', error);
      throw new HttpException(
        'Failed to connect to voice service',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // Browser relays realtime function calls (book_appointment / search_knowledge)
  // here; we proxy to the AI service which runs them server-side.
  @Post('webrtc/tool')
  @ApiOperation({ summary: 'Execute a realtime voice tool for the browser agent' })
  async executeVoiceTool(@Body() body: any): Promise<any> {
    const aiServiceUrl = this.configService.get('AI_SERVICE_URL') || 'http://localhost:8081';
    try {
      const response = await fetch(`${aiServiceUrl}/webrtc/tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: body?.name,
          arguments: body?.arguments ?? {},
          industry: body?.industry,
          session_id: body?.sessionId ?? body?.session_id,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new HttpException(`AI service error: ${errorText}`, HttpStatus.BAD_GATEWAY);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('Voice tool exec error:', error);
      return { output: 'The tool failed; offer to have the team follow up.' };
    }
  }

  @Post('webrtc/disconnect')
  @ApiOperation({ summary: 'Disconnect WebRTC voice session' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to disconnect' },
      },
      required: ['sessionId'],
    },
  })
  async disconnectWebRTC(
    @Body() body: { sessionId: string },
    @Req() req: any,
  ) {
    const aiServiceUrl = this.configService.get('AI_SERVICE_URL') || 'http://localhost:8081';
    
    try {
      const response = await fetch(`${aiServiceUrl}/webrtc/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: body.sessionId,
          userId: req.user?.sub,
        }),
      });

      if (!response.ok) {
        throw new HttpException(
          'Failed to disconnect session',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('WebRTC disconnect error:', error);
      throw new HttpException(
        'Failed to disconnect voice session',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
