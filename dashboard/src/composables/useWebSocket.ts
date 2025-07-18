import { ref, computed, onMounted, onUnmounted } from 'vue';
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

export interface ActiveConnection {
  id: string;
  type: 'dashboard' | 'mcp-server';
  connectedAt: Date;
  lastActivity: Date;
  projectId?: string;
  subscriptions?: string[];
}

export interface ConnectionStats {
  dashboardClients: number;
  mcpClients: number;
  totalConnections: number;
}

export function useWebSocket() {
  // Access the global WebSocket service
  const getWebSocketService = () => {
    if (typeof window !== 'undefined') {
      return (window as any).webSocketService;
    }
    return null;
  };

  // Reactive state
  const connectionStatus = ref<ConnectionStatus>('disconnected');
  const events = ref<WebSocketEvent[]>([]);
  const activeConnections = ref<ConnectionStats>({
    dashboardClients: 0,
    mcpClients: 0,
    totalConnections: 0
  });
  const eventBus = ref<{ [key: string]: any }>({});

  // Update reactive state from global service
  const updateState = () => {
    const service = getWebSocketService();
    if (service) {
      connectionStatus.value = service.connectionStatus;
      events.value = service.events;
      activeConnections.value = service.activeConnections;
      eventBus.value = service.eventBus;
    }
  };

  // Computed properties
  const isConnected = computed(() => connectionStatus.value === 'connected');
  const recentEvents = computed(() => events.value.slice(0, 10));
  const eventsByType = computed(() => {
    const grouped: { [key: string]: WebSocketEvent[] } = {};
    events.value.forEach(event => {
      if (!grouped[event.type]) {
        grouped[event.type] = [];
      }
      grouped[event.type].push(event);
    });
    return grouped;
  });

  // Filter events
  const getEventsByType = (type: string) => {
    return events.value.filter(event => event.type === type);
  };

  const getEventsByProject = (projectId: string) => {
    return events.value.filter(event => event.projectId === projectId);
  };

  const getEventsByAgent = (agentId: string) => {
    return events.value.filter(event => event.agentId === agentId);
  };

  const getEventsByRoom = (roomName: string) => {
    return events.value.filter(event => event.roomName === roomName);
  };

  // Subscription methods
  const subscribeToEvents = (eventTypes: string[]) => {
    const service = getWebSocketService();
    service?.subscribeToEvents(eventTypes);
  };

  const subscribeToRepository = (repositoryPath: string) => {
    const service = getWebSocketService();
    service?.subscribeToRepository(repositoryPath);
  };

  const subscribeToAgent = (agentId: string) => {
    const service = getWebSocketService();
    service?.subscribeToAgent(agentId);
  };

  const subscribeToRoom = (roomName: string) => {
    const service = getWebSocketService();
    service?.subscribeToRoom(roomName);
  };

  // Event listening
  const onEvent = (callback: (event: WebSocketEvent) => void) => {
    // This is a simplified event listener
    // In practice, you might want to use a proper event system
    const checkForNewEvents = () => {
      const service = getWebSocketService();
      if (service && service.events.length > 0) {
        const latestEvent = service.events[0];
        callback(latestEvent);
      }
    };
    
    const interval = setInterval(checkForNewEvents, 100);
    
    onUnmounted(() => {
      clearInterval(interval);
    });
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

  // Active projects and agents
  const activeProjects = computed(() => {
    const projects = new Set<string>();
    events.value.forEach(event => {
      if (event.projectId) {
        projects.add(event.projectId);
      }
    });
    return Array.from(projects);
  });

  const activeAgents = computed(() => {
    const agents = new Set<string>();
    events.value.forEach(event => {
      if (event.agentId) {
        agents.add(event.agentId);
      }
    });
    return Array.from(agents);
  });

  const activeRooms = computed(() => {
    const rooms = new Set<string>();
    events.value.forEach(event => {
      if (event.roomName) {
        rooms.add(event.roomName);
      }
    });
    return Array.from(rooms);
  });

  // Initialize and update state
  onMounted(() => {
    updateState();
    
    // Set up periodic updates
    const interval = setInterval(updateState, 1000);
    
    onUnmounted(() => {
      clearInterval(interval);
    });
  });

  return {
    // State
    connectionStatus,
    events,
    activeConnections,
    eventBus,
    
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
    onEvent,
    updateState
  };
}