import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallQueryDto } from './dto/call.dto';

@Injectable()
export class CallsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: CallQueryDto) {
    const { page = 1, limit = 20, status, organizationId, aiResolved, escalated, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (organizationId) where.organization_id = organizationId;
    if (aiResolved !== undefined) where.ai_resolution = aiResolved;
    if (escalated !== undefined) where.was_escalated = escalated;
    if (startDate || endDate) {
      where.started_at = {};
      if (startDate) where.started_at.gte = new Date(startDate);
      if (endDate) where.started_at.lte = new Date(endDate);
    }

    const [calls, total] = await Promise.all([
      this.prisma.call_logs.findMany({
        where,
        skip,
        take: limit,
        orderBy: { started_at: 'desc' },
        include: {
          organizations: { select: { name: true, u_e_code: true } },
          contacts: { select: { full_name: true, phone: true, email: true } },
          support_tickets: { select: { ticket_id: true, subject: true } },
        },
      }),
      this.prisma.call_logs.count({ where }),
    ]);

    return {
      data: calls,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(callId: string) {
    const call = await this.prisma.call_logs.findUnique({
      where: { call_id: callId },
      include: {
        organizations: true,
        contacts: true,
        support_tickets: {
          include: {
            ticket_statuses: true,
            ticket_priorities: true,
          },
        },
        agent_interactions: {
          orderBy: { started_at: 'asc' },
        },
        ai_usage_logs: true,
        twilio_usage_logs: true,
        conversation_analysis: true,
      },
    });

    if (!call) throw new NotFoundException(`Call ${callId} not found`);
    return call;
  }

  async getStats(range: string = '7d') {
    const days = range === 'today' ? 0 : range === '30d' ? 30 : range === '90d' ? 90 : 7;
    const startDate = new Date();
    if (days > 0) {
      startDate.setDate(startDate.getDate() - days);
    } else {
      startDate.setHours(0, 0, 0, 0);
    }

    const where = { started_at: { gte: startDate } };

    const [total, completed, aiResolved, escalated, abandoned] = await Promise.all([
      this.prisma.call_logs.count({ where }),
      this.prisma.call_logs.count({ where: { ...where, status: 'completed' } }),
      this.prisma.call_logs.count({ where: { ...where, ai_resolution: true } }),
      this.prisma.call_logs.count({ where: { ...where, was_escalated: true } }),
      this.prisma.call_logs.count({ where: { ...where, was_abandoned: true } }),
    ]);

    const avgDuration = await this.prisma.call_logs.aggregate({
      where,
      _avg: { duration_seconds: true },
    });

    return {
      totalCalls: total,
      completedCalls: completed,
      aiResolvedCalls: aiResolved,
      escalatedCalls: escalated,
      abandonedCalls: abandoned,
      avgDurationSeconds: Math.round(avgDuration._avg.duration_seconds || 0),
      aiResolutionRate: total > 0 ? Math.round((aiResolved / total) * 100) : 0,
    };
  }

  async getAgentDistribution(range: string = '7d') {
    const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await this.prisma.agent_interactions.groupBy({
      by: ['agent_type'],
      where: { started_at: { gte: startDate } },
      _count: { interaction_id: true },
      _avg: { duration_ms: true },
      _sum: { tool_call_count: true },
    });

    const total = result.reduce((sum: number, r: typeof result[0]) => sum + r._count.interaction_id, 0);

    return result.map((r: typeof result[0]) => ({
      agentType: r.agent_type,
      count: r._count.interaction_id,
      percentage: total > 0 ? Math.round((r._count.interaction_id / total) * 100) : 0,
      avgDurationMs: Math.round(r._avg.duration_ms || 0),
      toolCalls: r._sum.tool_call_count || 0,
    }));
  }

  async getHourlyDistribution(date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const calls = await this.prisma.call_logs.findMany({
      where: { started_at: { gte: startOfDay, lte: endOfDay } },
      select: { started_at: true, duration_seconds: true },
    });

    // Group by hour
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      callCount: 0,
      avgDuration: 0,
    }));

    calls.forEach((call: typeof calls[0]) => {
      const hour = new Date(call.started_at!).getHours();
      hourly[hour].callCount++;
    });

    return hourly;
  }
}
