/**
 * WebSocket Gateway for real-time events
 * 
 * Handles:
 * - Dashboard real-time updates
 * - Call status changes
 * - Ticket notifications
 * - AI agent responses
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

interface DashboardUpdate {
  type: 'call' | 'ticket' | 'device' | 'system' | 'ai';
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  data: unknown;
  timestamp: string;
}

interface CallEvent {
  callSid: string;
  sessionId: string;
  status: 'ringing' | 'in-progress' | 'completed' | 'failed';
  from: string;
  agentType?: string;
  transcript?: string;
}

interface TicketEvent {
  ticketId: string;
  action: 'created' | 'updated' | 'assigned' | 'escalated' | 'closed';
  priority?: string;
  assignee?: string;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3003',
      'https://webhook.callsphere.tech',
      'https://urackit.callsphere.tech',
    ],
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');
  private connectedClients: Map<string, { socket: Socket; rooms: Set<string> }> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.connectedClients.set(client.id, { socket: client, rooms: new Set() });
    
    // Send initial connection confirmation
    client.emit('connected', {
      clientId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  // ============== Dashboard Subscriptions ==============

  @SubscribeMessage('subscribe:dashboard')
  handleSubscribeDashboard(@ConnectedSocket() client: Socket) {
    client.join('dashboard');
    this.connectedClients.get(client.id)?.rooms.add('dashboard');
    this.logger.log(`Client ${client.id} subscribed to dashboard`);
    return { success: true, room: 'dashboard' };
  }

  @SubscribeMessage('subscribe:calls')
  handleSubscribeCalls(@ConnectedSocket() client: Socket) {
    client.join('calls');
    this.connectedClients.get(client.id)?.rooms.add('calls');
    this.logger.log(`Client ${client.id} subscribed to calls`);
    return { success: true, room: 'calls' };
  }

  @SubscribeMessage('subscribe:tickets')
  handleSubscribeTickets(@ConnectedSocket() client: Socket) {
    client.join('tickets');
    this.connectedClients.get(client.id)?.rooms.add('tickets');
    this.logger.log(`Client ${client.id} subscribed to tickets`);
    return { success: true, room: 'tickets' };
  }

  @SubscribeMessage('subscribe:organization')
  handleSubscribeOrg(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { organizationId: string },
  ) {
    const room = `org:${data.organizationId}`;
    client.join(room);
    this.connectedClients.get(client.id)?.rooms.add(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);
    return { success: true, room };
  }

  // ============== Event Emitters (called by services) ==============

  /**
   * Emit dashboard update to all subscribed clients
   */
  emitDashboardUpdate(update: DashboardUpdate) {
    this.server.to('dashboard').emit('dashboard:update', update);
    this.logger.debug(`Dashboard update emitted: ${update.type}:${update.action}`);
  }

  /**
   * Emit call status update
   */
  emitCallEvent(event: CallEvent) {
    this.server.to('calls').emit('call:update', event);
    this.logger.log(`Call event emitted: ${event.callSid} - ${event.status}`);
  }

  /**
   * Emit call end event
   */
  emitCallEnd(callSid: string) {
    this.server.to('calls').emit('call:end', { callSid });
    this.logger.log(`Call end emitted: ${callSid}`);
  }

  /**
   * Emit live calls update (full list refresh)
   */
  emitLiveCallsUpdate(calls: unknown[], metrics: unknown) {
    this.server.to('calls').emit('livecalls:update', { calls, metrics });
    this.logger.debug(`Live calls update emitted: ${Array.isArray(calls) ? calls.length : 0} calls`);
  }

  /**
   * Emit ticket update
   */
  emitTicketEvent(event: TicketEvent) {
    this.server.to('tickets').emit('ticket:update', event);
    this.logger.log(`Ticket event emitted: ${event.ticketId} - ${event.action}`);
  }

  /**
   * Emit AI response for live call monitoring
   */
  emitAIResponse(sessionId: string, data: { role: string; content: string }) {
    this.server.to(`session:${sessionId}`).emit('ai:response', {
      sessionId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit organization-specific update
   */
  emitOrgUpdate(organizationId: string, update: DashboardUpdate) {
    this.server.to(`org:${organizationId}`).emit('org:update', update);
  }

  /**
   * Get connected client count
   */
  getConnectedCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get room subscriber count
   */
  getRoomCount(room: string): number {
    return this.server.sockets.adapter.rooms.get(room)?.size || 0;
  }
}
