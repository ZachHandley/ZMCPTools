<template>
  <div class="space-y-6">
    <!-- Connection Status -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Connection Status</h3>
      <div class="flex items-center space-x-4">
        <div class="flex items-center">
          <div 
            :class="{
              'bg-green-400': wsStatus === 'connected',
              'bg-yellow-400': wsStatus === 'connecting',
              'bg-red-400': wsStatus === 'disconnected'
            }"
            class="w-4 h-4 rounded-full mr-3"
          ></div>
          <span class="text-sm font-medium">{{ getStatusText(wsStatus) }}</span>
        </div>
        <div class="text-sm text-gray-500">
          {{ connections.totalConnections }} total connections
        </div>
      </div>
    </div>

    <!-- Connection Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white shadow rounded-lg p-6">
        <h4 class="text-sm font-medium text-gray-500 mb-2">Dashboard Clients</h4>
        <div class="text-2xl font-bold text-gray-900">{{ connections.dashboardClients }}</div>
        <p class="text-xs text-gray-500 mt-1">Active browser connections</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h4 class="text-sm font-medium text-gray-500 mb-2">MCP Servers</h4>
        <div class="text-2xl font-bold text-gray-900">{{ connections.mcpClients }}</div>
        <p class="text-xs text-gray-500 mt-1">Connected MCP server instances</p>
      </div>
      
      <div class="bg-white shadow rounded-lg p-6">
        <h4 class="text-sm font-medium text-gray-500 mb-2">Total Events</h4>
        <div class="text-2xl font-bold text-gray-900">{{ events.length }}</div>
        <p class="text-xs text-gray-500 mt-1">Events received this session</p>
      </div>
    </div>

    <!-- Recent Events -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">Recent WebSocket Events</h3>
      </div>
      <div class="divide-y divide-gray-200">
        <div v-if="events.length === 0" class="px-6 py-4 text-center text-gray-500">
          No events received yet
        </div>
        <div 
          v-for="event in events.slice(0, 20)" 
          :key="event.id" 
          class="px-6 py-4 hover:bg-gray-50"
        >
          <div class="flex items-start space-x-3">
            <div 
              :class="{
                'bg-green-400': event.type.includes('connected') || event.type.includes('success'),
                'bg-blue-400': event.type.includes('event') || event.type.includes('message'),
                'bg-yellow-400': event.type.includes('update') || event.type.includes('status'),
                'bg-red-400': event.type.includes('error') || event.type.includes('disconnected'),
                'bg-purple-400': event.type.includes('register') || event.type.includes('spawn'),
                'bg-gray-400': true
              }"
              class="w-2 h-2 rounded-full mt-2 flex-shrink-0"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-gray-900">
                  {{ formatEventType(event.type) }}
                </p>
                <time class="text-xs text-gray-500">
                  {{ formatTime(event.timestamp) }}
                </time>
              </div>
              <div class="mt-1">
                <p class="text-sm text-gray-700">{{ getEventDescription(event) }}</p>
                <div v-if="event.projectId" class="mt-1">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    Project: {{ event.projectId }}
                  </span>
                </div>
                <div v-if="event.agentId" class="mt-1">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Agent: {{ event.agentId }}
                  </span>
                </div>
                <div v-if="event.roomName" class="mt-1">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    Room: {{ event.roomName }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Event Types Distribution -->
    <div class="bg-white shadow rounded-lg">
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">Event Types</h3>
      </div>
      <div class="p-6">
        <div class="space-y-4">
          <div v-for="(count, type) in eventTypeCounts" :key="type" class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <div 
                :class="{
                  'bg-green-400': type.includes('connected'),
                  'bg-blue-400': type.includes('event'),
                  'bg-yellow-400': type.includes('update'),
                  'bg-red-400': type.includes('error'),
                  'bg-purple-400': type.includes('register'),
                  'bg-gray-400': true
                }"
                class="w-3 h-3 rounded-full"
              ></div>
              <span class="text-sm font-medium text-gray-900">{{ formatEventType(type) }}</span>
            </div>
            <span class="text-sm text-gray-500">{{ count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ConnectionStatus } from '../services/WebSocketClient';

// Props
interface Props {
  wsStatus: ConnectionStatus;
  connections: {
    dashboardClients: number;
    mcpClients: number;
    totalConnections: number;
  };
  events: Array<{
    id: string;
    type: string;
    timestamp: Date;
    data?: any;
    projectId?: string;
    agentId?: string;
    roomName?: string;
  }>;
}

const props = defineProps<Props>();

// Computed properties
const eventTypeCounts = computed(() => {
  const counts: { [key: string]: number } = {};
  props.events.forEach(event => {
    counts[event.type] = (counts[event.type] || 0) + 1;
  });
  return counts;
});

// Methods
const getStatusText = (status: ConnectionStatus) => {
  switch (status) {
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

const formatEventType = (type: string) => {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const getEventDescription = (event: any) => {
  const data = event.data || event;
  
  switch (event.type) {
    case 'mcp-project-connected':
      return `MCP project connected: ${data.serverInfo?.name || 'Unknown'}`;
    case 'mcp-project-disconnected':
      return `MCP project disconnected: ${data.projectId || 'Unknown'}`;
    case 'mcp-event':
      return `MCP event: ${data.eventType || 'Unknown event'}`;
    case 'agent-status-changed':
      return `Agent status changed: ${data.agentId} → ${data.newStatus}`;
    case 'task-progress':
      return `Task progress: ${data.taskId} (${data.progressPercentage || 0}%)`;
    case 'room-message':
      return `Room message from ${data.agentName || 'Unknown'}`;
    default:
      return data.message || data.description || 'Event occurred';
  }
};

const formatTime = (timestamp: Date) => {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return timestamp.toLocaleString();
};
</script>