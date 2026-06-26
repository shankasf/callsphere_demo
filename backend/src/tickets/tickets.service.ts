import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AssignTicketDto,
  EscalateTicketDto,
  AddMessageDto,
  TicketQueryDto,
} from './dto/ticket.dto';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: TicketQueryDto) {
    const { page = 1, limit = 20, status, priority, organizationId } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (organizationId) where.organization_id = organizationId;
    if (status) where.ticket_statuses = { name: status };
    if (priority) where.ticket_priorities = { name: priority };

    const [tickets, total] = await Promise.all([
      this.prisma.support_tickets.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organizations: { select: { name: true } },
          contacts: { select: { full_name: true, phone: true } },
          devices: { select: { asset_name: true, status: true } },
          ticket_statuses: true,
          ticket_priorities: true,
          ticket_assignments: {
            where: { assignment_end: null },
            include: { support_agents: { select: { full_name: true, agent_type: true } } },
          },
        },
      }),
      this.prisma.support_tickets.count({ where }),
    ]);

    return {
      data: tickets,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const ticket = await this.prisma.support_tickets.findUnique({
      where: { ticket_id: id },
      include: {
        organizations: true,
        contacts: true,
        devices: true,
        locations: true,
        ticket_statuses: true,
        ticket_priorities: true,
        ticket_assignments: {
          include: { support_agents: true },
          orderBy: { assignment_start: 'desc' },
        },
        ticket_messages: {
          orderBy: { message_time: 'asc' },
          include: { support_agents: true, contacts: true },
        },
        ticket_escalations: {
          orderBy: { escalation_time: 'desc' },
        },
        call_logs: {
          select: { call_id: true, started_at: true, duration_seconds: true, transcript: true },
        },
      },
    });

    if (!ticket) throw new NotFoundException(`Ticket #${id} not found`);
    return ticket;
  }

  async create(dto: CreateTicketDto) {
    // Get default "Open" status
    const openStatus = await this.prisma.ticket_statuses.findFirst({
      where: { name: 'Open' },
    });

    const ticket = await this.prisma.support_tickets.create({
      data: {
        organization_id: dto.organizationId,
        contact_id: dto.contactId,
        device_id: dto.deviceId,
        subject: dto.subject,
        description: dto.description,
        priority_id: dto.priorityId,
        status_id: openStatus?.status_id,
        requires_human_agent: dto.requiresHumanAgent || false,
      },
      include: {
        organizations: true,
        contacts: true,
        ticket_statuses: true,
        ticket_priorities: true,
      },
    });

    // Link to call if provided
    if (dto.callId) {
      await this.prisma.call_logs.update({
        where: { call_id: dto.callId },
        data: { ticket_id: ticket.ticket_id, ticket_created: true },
      });
    }

    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto) {
    await this.findOne(id);

    const data: any = { updated_at: new Date() };
    if (dto.subject) data.subject = dto.subject;
    if (dto.description) data.description = dto.description;
    if (dto.statusId) data.status_id = dto.statusId;
    if (dto.priorityId) data.priority_id = dto.priorityId;

    // Check if closing
    if (dto.statusId) {
      const status = await this.prisma.ticket_statuses.findUnique({
        where: { status_id: dto.statusId },
      });
      if (status?.name === 'Closed' || status?.name === 'Resolved') {
        data.closed_at = new Date();
      }
    }

    return this.prisma.support_tickets.update({
      where: { ticket_id: id },
      data,
      include: { ticket_statuses: true, ticket_priorities: true },
    });
  }

  async assign(id: number, dto: AssignTicketDto) {
    await this.findOne(id);

    return this.prisma.ticket_assignments.create({
      data: {
        ticket_id: id,
        support_agent_id: dto.agentId,
        is_primary: dto.isPrimary ?? true,
      },
      include: { support_agents: true },
    });
  }

  async escalate(id: number, dto: EscalateTicketDto, fromAgentId?: number) {
    await this.findOne(id);

    return this.prisma.ticket_escalations.create({
      data: {
        ticket_id: id,
        from_agent_id: fromAgentId,
        to_agent_id: dto.toAgentId,
        reason: dto.reason,
      },
    });
  }

  async addMessage(id: number, dto: AddMessageDto) {
    await this.findOne(id);

    return this.prisma.ticket_messages.create({
      data: {
        ticket_id: id,
        content: dto.content,
        sender_agent_id: dto.senderAgentId,
        sender_contact_id: dto.senderContactId,
      },
      include: { support_agents: true, contacts: true },
    });
  }

  async getStats() {
    const [total, open, pending, resolved, escalated] = await Promise.all([
      this.prisma.support_tickets.count(),
      this.prisma.support_tickets.count({ where: { ticket_statuses: { name: 'Open' } } }),
      this.prisma.support_tickets.count({ where: { ticket_statuses: { name: 'Pending' } } }),
      this.prisma.support_tickets.count({ where: { ticket_statuses: { name: 'Resolved' } } }),
      this.prisma.ticket_escalations.count(),
    ]);

    // Calculate avg resolution time
    const resolvedTickets = await this.prisma.support_tickets.findMany({
      where: { closed_at: { not: null } },
      select: { created_at: true, closed_at: true },
      take: 100,
      orderBy: { closed_at: 'desc' },
    });

    let avgResolutionHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum: number, t: typeof resolvedTickets[0]) => {
        const hours = (t.closed_at!.getTime() - t.created_at.getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0);
      avgResolutionHours = Math.round(totalHours / resolvedTickets.length);
    }

    return { total, open, pending, resolved, escalated, avgResolutionHours };
  }
}
