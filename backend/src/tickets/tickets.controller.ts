import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import {
  CreateTicketDto, UpdateTicketDto, AssignTicketDto, EscalateTicketDto, AddMessageDto, TicketQueryDto,
} from './dto/ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('tickets')
@Controller('tickets')
/* open-dashboard: auth guard removed */
@ApiBearerAuth()
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List tickets with pagination and filters' })
  async findAll(@Query() query: TicketQueryDto) {
    return this.ticketsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get ticket statistics' })
  async getStats() {
    return this.ticketsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket details with messages' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ticketsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new ticket (from AI voice agent or manually)' })
  async create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update ticket status/priority' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTicketDto) {
    return this.ticketsService.update(id, dto);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign agent to ticket' })
  async assign(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignTicketDto) {
    return this.ticketsService.assign(id, dto);
  }

  @Post(':id/escalate')
  @ApiOperation({ summary: 'Escalate ticket to human agent' })
  async escalate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscalateTicketDto,
    @Request() req: any,
  ) {
    // fromAgentId could come from current user if they are a bot agent
    return this.ticketsService.escalate(id, dto);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add message/note to ticket' })
  async addMessage(@Param('id', ParseIntPipe) id: number, @Body() dto: AddMessageDto) {
    return this.ticketsService.addMessage(id, dto);
  }
}
