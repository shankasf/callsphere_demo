/**
 * WebSocket service for real-time updates
 * 
 * Connects to NestJS WebSocket gateway for:
 * - Dashboard updates
 * - Call events
 * - Ticket notifications
 */

import { io, Socket } from 'socket.io-client';

type EventHandler = (data: unknown) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    
    this.socket = io(`${wsUrl}/events`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket?.id);
      this.connected = true;
      this.reconnectAttempts = 0;
      
      // Auto-subscribe to dashboard updates
      this.subscribe('dashboard');
      this.subscribe('calls');
      this.subscribe('tickets');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
    });

    // Handle events
    this.socket.on('dashboard:update', (data) => {
      this.emit('dashboard:update', data);
    });

    this.socket.on('call:update', (data) => {
      this.emit('call:update', data);
    });

    this.socket.on('call:end', (data) => {
      this.emit('call:end', data);
    });

    this.socket.on('livecalls:update', (data) => {
      this.emit('livecalls:update', data);
    });

    this.socket.on('ticket:update', (data) => {
      this.emit('ticket:update', data);
    });

    this.socket.on('ai:response', (data) => {
      this.emit('ai:response', data);
    });

    this.socket.on('org:update', (data) => {
      this.emit('org:update', data);
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Subscribe to a room
   */
  subscribe(room: string, data?: Record<string, unknown>): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot subscribe to:', room);
      return;
    }

    this.socket.emit(`subscribe:${room}`, data);
  }

  /**
   * Subscribe to organization-specific updates
   */
  subscribeToOrganization(organizationId: string): void {
    this.subscribe('organization', { organizationId });
  }

  /**
   * Add event listener
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Remove event listener
   */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Emit event to handlers
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && !!this.socket?.connected;
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

// Singleton instance
export const wsService = new WebSocketService();

// Auto-connect when module is imported
if (typeof window !== 'undefined') {
  wsService.connect();
}
