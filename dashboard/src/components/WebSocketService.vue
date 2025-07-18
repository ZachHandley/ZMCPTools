<template>
  <div style="display: none;">
    <!-- This component is invisible but persists across navigation -->
    WebSocket Service Running
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { WebSocketClient } from '../services/WebSocketClient';
import type { ConnectionStatus } from '../services/WebSocketClient';

// Global state that persists across navigation
const wsClient = ref<WebSocketClient | null>(null);
const connectionStatus = ref<ConnectionStatus>('disconnected');
const events = reactive<any[]>([]);
const activeConnections = reactive({
  dashboardClients: 0,
  mcpClients: 0,
  totalConnections: 0
});

// Event broadcasting
const eventBus = reactive<{ [key: string]: any }>({});

// Initialize WebSocket connection
const initializeWebSocket = () => {
  if (!wsClient.value) {
    wsClient.value = new WebSocketClient();
    
    // Connection status handler
    wsClient.value.onConnectionChange = (status: ConnectionStatus) => {
      connectionStatus.value = status;
      console.log('WebSocket connection status:', status);
    };
    
    // Event handler
    wsClient.value.onEvent = (event: any) => {
      // Add to events array (keep last 100 events)
      events.unshift({
        ...event,
        timestamp: new Date(),
        id: Date.now() + Math.random()
      });
      if (events.length > 100) {
        events.splice(100);
      }
      
      // Broadcast to event bus
      eventBus[event.type] = event;
      
      // Handle specific event types
      handleSpecificEvent(event);
    };
    
    // Connect
    wsClient.value.connect();
  }
};

// Handle specific event types
const handleSpecificEvent = (event: any) => {
  switch (event.type) {
    case 'mcp-project-connected':
      activeConnections.mcpClients++;
      activeConnections.totalConnections++;
      console.log('MCP Project Connected:', event);
      break;
      
    case 'mcp-project-disconnected':
      activeConnections.mcpClients = Math.max(0, activeConnections.mcpClients - 1);
      activeConnections.totalConnections = Math.max(0, activeConnections.totalConnections - 1);
      console.log('MCP Project Disconnected:', event);
      break;
      
    case 'agent-status-changed':
      console.log('Agent Status Changed:', event);
      break;
      
    case 'task-progress':
      console.log('Task Progress:', event);
      break;
      
    case 'room-message':
      console.log('Room Message:', event);
      break;
      
    default:
      console.log('Generic Event:', event);
  }
};

// Cleanup WebSocket connection
const cleanup = () => {
  if (wsClient.value) {
    wsClient.value.disconnect();
    wsClient.value = null;
  }
};

// API for external components
const subscribeToEvents = (eventTypes: string[]) => {
  wsClient.value?.subscribeToEvents(eventTypes);
};

const subscribeToRepository = (repositoryPath: string) => {
  wsClient.value?.subscribeToRepository(repositoryPath);
};

const subscribeToAgent = (agentId: string) => {
  wsClient.value?.subscribeToAgent(agentId);
};

const subscribeToRoom = (roomName: string) => {
  wsClient.value?.subscribeToRoom(roomName);
};

const getConnectionStatus = () => connectionStatus.value;
const getEvents = () => events;
const getActiveConnections = () => activeConnections;
const getEventBus = () => eventBus;

// Make available globally
if (typeof window !== 'undefined') {
  (window as any).webSocketService = {
    subscribeToEvents,
    subscribeToRepository,
    subscribeToAgent,
    subscribeToRoom,
    getConnectionStatus,
    getEvents,
    getActiveConnections,
    getEventBus,
    connectionStatus,
    events,
    activeConnections,
    eventBus
  };
}

onMounted(() => {
  initializeWebSocket();
});

onUnmounted(() => {
  // Don't cleanup on unmount due to transition:persist
  // cleanup();
});
</script>

<style scoped>
/* This component is invisible */
</style>