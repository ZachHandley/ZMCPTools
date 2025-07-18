import { ref, computed, reactive, readonly } from 'vue';
import { WebSocketClient } from '../services/WebSocketClient';
import type { ConnectionStatus } from '../services/WebSocketClient';

export interface WebSocketEvent {
  id: string;
  type: string;
  timestamp: Date;
  data?: any;
  clientId?: string;
  projectId?: string;
  agentId?: string;
  roomName?: string;
}

export interface ConnectionStats {
  dashboardClients: number;
  mcpClients: number;
  totalConnections: number;
}

// Global singleton state
let wsClientInstance: WebSocketClient | null = null;
const connectionStatus = ref<ConnectionStatus>('disconnected');
const events = reactive<WebSocketEvent[]>([]);
const activeConnections = reactive<ConnectionStats>({
  dashboardClients: 0,
  mcpClients: 0,
  totalConnections: 0
});

// Initialize WebSocket client once
const initWebSocketClient = () => {
  if (!wsClientInstance && typeof window !== 'undefined') {
    console.log('🔌 Initializing singleton WebSocket client');
    
    // Force correct WebSocket URL for Astro dev server
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const port = window.location.port || '4321'; // Default Astro port
    const wsUrl = `${protocol}//${hostname}:${port}/api/ws`;
    
    console.log('🔗 WebSocket URL:', wsUrl);
    wsClientInstance = new WebSocketClient(wsUrl);
    
    // Connection status handler
    wsClientInstance.onConnectionChange = (status: ConnectionStatus) => {
      console.log('🔌 WebSocket status change:', status);
      connectionStatus.value = status;
    };
    
    // Event handler
    wsClientInstance.onEvent = (event: any) => {
      console.log('📨 WebSocket event received:', event);
      
      // Add to events array (keep last 100 events)
      const formattedEvent: WebSocketEvent = {
        id: Date.now() + Math.random().toString(),
        type: event.type || 'unknown',
        timestamp: new Date(),
        data: event,
        clientId: event.clientId,
        projectId: event.projectId,
        agentId: event.agentId,
        roomName: event.roomName
      };
      
      events.unshift(formattedEvent);
      if (events.length > 100) {
        events.splice(100);
      }
      
      // Handle specific event types to update connection counts
      handleConnectionEvent(event);
    };
    
    // Connect
    wsClientInstance.connect();
    
    // Periodic status check
    setInterval(() => {
      if (wsClientInstance) {
        const currentStatus = wsClientInstance.getConnectionStatus();
        if (currentStatus !== connectionStatus.value) {
          console.log('🔌 Status sync update:', currentStatus);
          connectionStatus.value = currentStatus;
        }
      }
    }, 5000);
  }
  
  return wsClientInstance;
};

// Handle connection-related events
const handleConnectionEvent = (event: any) => {
  switch (event.type) {
    case 'mcp-project-connected':
      activeConnections.mcpClients++;
      activeConnections.totalConnections++;
      console.log('📈 MCP client connected. Total MCP:', activeConnections.mcpClients);
      break;
      
    case 'mcp-project-disconnected':
      activeConnections.mcpClients = Math.max(0, activeConnections.mcpClients - 1);
      activeConnections.totalConnections = Math.max(0, activeConnections.totalConnections - 1);
      console.log('📉 MCP client disconnected. Total MCP:', activeConnections.mcpClients);
      break;
      
    case 'welcome':
      if (event.clientId) {
        console.log('👋 Welcome received for client:', event.clientId);
      }
      // Update connection stats from server
      if (event.connectionStats) {
        activeConnections.dashboardClients = event.connectionStats.dashboardClients;
        activeConnections.mcpClients = event.connectionStats.mcpClients;
        activeConnections.totalConnections = event.connectionStats.totalConnections;
        console.log('📊 Connection stats updated:', event.connectionStats);
      }
      break;
      
    case 'connection-stats-update':
      if (event.payload) {
        activeConnections.dashboardClients = event.payload.dashboardClients;
        activeConnections.mcpClients = event.payload.mcpClients;
        activeConnections.totalConnections = event.payload.totalConnections;
        console.log('📊 Connection stats updated from server:', event.payload);
      }
      break;
  }
};

// Export the singleton composable
export function useWebSocketSingleton() {
  // Initialize client if not already done
  const client = initWebSocketClient();
  
  // Computed properties
  const isConnected = computed(() => connectionStatus.value === 'connected');
  const recentEvents = computed(() => events.slice(0, 10));
  const eventsByType = computed(() => {
    const grouped: { [key: string]: WebSocketEvent[] } = {};
    events.forEach(event => {
      if (!grouped[event.type]) {
        grouped[event.type] = [];
      }
      grouped[event.type].push(event);
    });
    return grouped;
  });

  // Active projects and agents derived from events
  const activeProjects = computed(() => {
    const projects = new Set<string>();
    events.forEach(event => {
      if (event.projectId) {
        projects.add(event.projectId);
      }
    });
    return Array.from(projects);
  });

  const activeAgents = computed(() => {
    const agents = new Set<string>();
    events.forEach(event => {
      if (event.agentId) {
        agents.add(event.agentId);
      }
    });
    return Array.from(agents);
  });

  const activeRooms = computed(() => {
    const rooms = new Set<string>();
    events.forEach(event => {
      if (event.roomName) {
        rooms.add(event.roomName);
      }
    });
    return Array.from(rooms);
  });

  // Filter events
  const getEventsByType = (type: string) => {
    return events.filter(event => event.type === type);
  };

  const getEventsByProject = (projectId: string) => {
    return events.filter(event => event.projectId === projectId);
  };

  const getEventsByAgent = (agentId: string) => {
    return events.filter(event => event.agentId === agentId);
  };

  const getEventsByRoom = (roomName: string) => {
    return events.filter(event => event.roomName === roomName);
  };

  // Subscription methods
  const subscribeToEvents = (eventTypes: string[]) => {
    client?.subscribeToEvents(eventTypes);
  };

  const subscribeToRepository = (repositoryPath: string) => {
    client?.subscribeToRepository(repositoryPath);
  };

  const subscribeToAgent = (agentId: string) => {
    client?.subscribeToAgent(agentId);
  };

  const subscribeToRoom = (roomName: string) => {
    client?.subscribeToRoom(roomName);
  };

  // Connection status helpers
  const getConnectionStatusText = () => {
    switch (connectionStatus.value) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus.value) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-yellow-600';
      case 'disconnected':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  // Force refresh connection status
  const refreshConnectionStatus = () => {
    if (client) {
      client.forceStatusUpdate();
    }
  };

  // Debug method
  const getDebugInfo = () => {
    return {
      hasClient: !!client,
      clientStatus: client?.getConnectionStatus(),
      connectionStatus: connectionStatus.value,
      eventCount: events.length,
      activeConnections: { ...activeConnections },
      recentEventTypes: events.slice(0, 5).map(e => e.type)
    };
  };

  return {
    // State
    connectionStatus: readonly(connectionStatus),
    events: readonly(events),
    activeConnections: readonly(activeConnections),
    
    // Computed
    isConnected,
    recentEvents,
    eventsByType,
    activeProjects,
    activeAgents,
    activeRooms,
    
    // Methods
    subscribeToEvents,
    subscribeToRepository,
    subscribeToAgent,
    subscribeToRoom,
    getEventsByType,
    getEventsByProject,
    getEventsByAgent,
    getEventsByRoom,
    getConnectionStatusText,
    getConnectionStatusColor,
    refreshConnectionStatus,
    getDebugInfo
  };
}

// Export readonly computed for direct access
export { connectionStatus, events, activeConnections };