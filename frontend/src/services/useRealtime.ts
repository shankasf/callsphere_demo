/**
 * React hooks for WebSocket real-time updates
 */

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { wsService } from './websocket';

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

/**
 * Hook to subscribe to real-time dashboard updates
 */
export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(wsService.isConnected());
  const [lastUpdate, setLastUpdate] = useState<DashboardUpdate | null>(null);

  useEffect(() => {
    // Connect if not already connected
    wsService.connect();

    // Handle connection status changes
    const checkConnection = setInterval(() => {
      setIsConnected(wsService.isConnected());
    }, 1000);

    // Subscribe to dashboard updates
    const unsubDashboard = wsService.on('dashboard:update', (data) => {
      const update = data as DashboardUpdate;
      setLastUpdate(update);

      // Invalidate relevant queries based on update type
      switch (update.type) {
        case 'call':
          queryClient.invalidateQueries({ queryKey: ['dashboard-calls'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
          break;
        case 'ticket':
          queryClient.invalidateQueries({ queryKey: ['dashboard-tickets'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
          break;
        case 'device':
          queryClient.invalidateQueries({ queryKey: ['dashboard-devices'] });
          break;
        case 'system':
          queryClient.invalidateQueries({ queryKey: ['dashboard-system'] });
          break;
      }
    });

    return () => {
      clearInterval(checkConnection);
      unsubDashboard();
    };
  }, [queryClient]);

  return { isConnected, lastUpdate };
}

/**
 * Hook to subscribe to call events
 */
export function useCallEvents(onCallEvent?: (event: CallEvent) => void) {
  const [activeCalls, setActiveCalls] = useState<CallEvent[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub = wsService.on('call:update', (data) => {
      const event = data as CallEvent;
      
      // Update active calls list
      setActiveCalls((prev) => {
        const existing = prev.findIndex((c) => c.callSid === event.callSid);
        
        if (event.status === 'completed' || event.status === 'failed') {
          // Remove completed calls
          return prev.filter((c) => c.callSid !== event.callSid);
        }
        
        if (existing >= 0) {
          // Update existing call
          const updated = [...prev];
          updated[existing] = event;
          return updated;
        }
        
        // Add new call
        return [...prev, event];
      });

      // Invalidate calls query
      queryClient.invalidateQueries({ queryKey: ['dashboard-calls'] });

      // Call custom handler
      onCallEvent?.(event);
    });

    return () => unsub();
  }, [queryClient, onCallEvent]);

  return activeCalls;
}

/**
 * Hook to subscribe to ticket events
 */
export function useTicketEvents(onTicketEvent?: (event: TicketEvent) => void) {
  const [recentTickets, setRecentTickets] = useState<TicketEvent[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsub = wsService.on('ticket:update', (data) => {
      const event = data as TicketEvent;
      
      // Add to recent tickets (keep last 10)
      setRecentTickets((prev) => [event, ...prev].slice(0, 10));

      // Invalidate tickets query
      queryClient.invalidateQueries({ queryKey: ['dashboard-tickets'] });

      // Call custom handler
      onTicketEvent?.(event);
    });

    return () => unsub();
  }, [queryClient, onTicketEvent]);

  return recentTickets;
}

/**
 * Hook to subscribe to organization-specific updates
 */
export function useOrganizationEvents(organizationId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;

    // Subscribe to organization room
    wsService.subscribeToOrganization(organizationId);

    const unsub = wsService.on('org:update', () => {
      // Invalidate organization-related queries on any org update
      queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
    });

    return () => unsub();
  }, [organizationId, queryClient]);
}

/**
 * Hook to get WebSocket connection status
 */
export function useWebSocketStatus() {
  const [status, setStatus] = useState({
    connected: wsService.isConnected(),
    socketId: wsService.getSocketId(),
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus({
        connected: wsService.isConnected(),
        socketId: wsService.getSocketId(),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const reconnect = useCallback(() => {
    wsService.disconnect();
    wsService.connect();
  }, []);

  return { ...status, reconnect };
}

/**
 * Hook to subscribe to live call updates for real-time monitoring
 */
export function useLiveCallUpdates(onUpdate?: (event: CallEvent) => void) {
  const [liveCalls, setLiveCalls] = useState<Map<string, CallEvent>>(new Map());
  const queryClient = useQueryClient();

  useEffect(() => {
    // Connect if not already connected
    wsService.connect();

    const unsub = wsService.on('call:update', (data) => {
      const event = data as CallEvent;

      setLiveCalls((prev) => {
        const updated = new Map(prev);
        
        if (event.status === 'completed' || event.status === 'failed') {
          // Remove completed/failed calls
          updated.delete(event.callSid);
        } else {
          // Add or update call
          updated.set(event.callSid, event);
        }
        
        return updated;
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['dashboard-live'] });

      // Call custom handler
      onUpdate?.(event);
    });

    return () => unsub();
  }, [queryClient, onUpdate]);

  return Array.from(liveCalls.values());
}
