import { Controller, Get, Post, Param, Query, Body, UseGuards, Headers, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { CallsService } from './calls.service';
import { CallQueryDto } from './dto/call.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EventsGateway } from '../events/events.gateway';

// Fail-closed internal-key check: require the env var to be configured, and use
// a constant-time comparison to avoid leaking the secret via timing.
function assertInternalKey(provided: string | undefined): void {
  const expectedKey = process.env.INTERNAL_API_KEY;
  if (!expectedKey) {
    throw new InternalServerErrorException('INTERNAL_API_KEY not configured');
  }
  const a = Buffer.from(provided || '');
  const b = Buffer.from(expectedKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnauthorizedException('invalid internal key');
  }
}

@ApiTags('calls')
@Controller('calls')
export class CallsController {
  constructor(
    private callsService: CallsService,
    private eventsGateway: EventsGateway,
  ) {}

  @Get()
  /* open-dashboard: auth guard removed */
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List call logs with pagination and filters' })
  async findAll(@Query() query: CallQueryDto) {
    return this.callsService.findAll(query);
  }

  @Get('stats')
  /* open-dashboard: auth guard removed */
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get call statistics' })
  @ApiQuery({ name: 'range', required: false, enum: ['today', '7d', '30d', '90d'] })
  async getStats(@Query('range') range?: string) {
    return this.callsService.getStats(range);
  }

  @Get('agents')
  /* open-dashboard: auth guard removed */
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI agent usage distribution' })
  @ApiQuery({ name: 'range', required: false, enum: ['7d', '30d', '90d'] })
  async getAgentDistribution(@Query('range') range?: string) {
    return this.callsService.getAgentDistribution(range);
  }

  @Get('hourly')
  /* open-dashboard: auth guard removed */
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get hourly call distribution' })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD format' })
  async getHourlyDistribution(@Query('date') date?: string) {
    return this.callsService.getHourlyDistribution(date);
  }

  @Get(':id')
  /* open-dashboard: auth guard removed */
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get call details with transcript and interactions' })
  async findOne(@Param('id') id: string) {
    return this.callsService.findOne(id);
  }

  // ============== Internal endpoints for AI service ==============

  @Post('live/update')
  @ApiExcludeEndpoint()
  async pushLiveCallUpdate(
    @Body() body: { calls: any[]; metrics: any },
    @Headers('x-internal-key') internalKey: string,
  ) {
    assertInternalKey(internalKey);

    // Emit to WebSocket clients
    this.eventsGateway.emitLiveCallsUpdate(body.calls, body.metrics);
    return { success: true };
  }

  @Post('live/event')
  @ApiExcludeEndpoint()
  async pushCallEvent(
    @Body() body: { type: 'start' | 'update' | 'end' | 'transcript'; data: any },
    @Headers('x-internal-key') internalKey: string,
  ) {
    const expectedKey = process.env.INTERNAL_API_KEY || 'internal-secret';
    if (internalKey !== expectedKey) {
      throw new UnauthorizedException('invalid internal key');
    }
    
    switch (body.type) {
      case 'start':
      case 'update':
        this.eventsGateway.emitCallEvent(body.data);
        // Also emit dashboard update for call analytics page
        this.eventsGateway.emitDashboardUpdate({
          type: 'call',
          action: body.type === 'start' ? 'created' : 'updated',
          data: body.data,
          timestamp: new Date().toISOString(),
        });
        break;
      case 'end':
        this.eventsGateway.emitCallEnd(body.data.callSid);
        // Also emit dashboard update for call analytics page
        this.eventsGateway.emitDashboardUpdate({
          type: 'call',
          action: 'status_changed',
          data: { callSid: body.data.callSid, status: 'completed' },
          timestamp: new Date().toISOString(),
        });
        break;
      case 'transcript':
        this.eventsGateway.emitAIResponse(body.data.sessionId, {
          role: body.data.role,
          content: body.data.content,
        });
        break;
    }
    
    return { success: true };
  }
}
