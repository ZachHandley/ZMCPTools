<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <h1 class="text-xl font-bold text-gray-900">ZMCPTools Dashboard</h1>
            </div>
            <div class="ml-6 flex items-center space-x-4">
              <div class="text-sm text-gray-500">
                <span class="inline-flex items-center">
                  <div 
                    :class="{
                      'bg-green-400': wsConnectionStatus === 'connected',
                      'bg-yellow-400': wsConnectionStatus === 'connecting',
                      'bg-red-400': wsConnectionStatus === 'disconnected'
                    }"
                    class="w-2 h-2 rounded-full mr-2"
                  ></div>
                  {{ getConnectionStatusText() }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <button
              @click="refreshData"
              :disabled="isRefreshing"
              class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              <svg 
                :class="{ 'animate-spin': isRefreshing }"
                class="w-4 h-4 mr-2" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <div class="text-sm text-gray-500">
              Last update: {{ lastUpdate }}
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <!-- Overview Stats -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="w-8 h-8 bg-primary-500 rounded-md flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 truncate">Active Projects</dt>
                    <dd class="text-lg font-medium text-gray-900">
                      {{ wsActiveConnections.mcpClients }}
                      <span class="text-xs text-gray-500 ml-1">({{ projects.length }} total)</span>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="w-8 h-8 bg-success-500 rounded-md flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 truncate">Active Agents</dt>
                    <dd class="text-lg font-medium text-gray-900">{{ activeAgents.length }}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="w-8 h-8 bg-warning-500 rounded-md flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 truncate">Running Tasks</dt>
                    <dd class="text-lg font-medium text-gray-900">{{ stats.tasks.running }}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="w-8 h-8 bg-error-500 rounded-md flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 truncate">Active Rooms</dt>
                    <dd class="text-lg font-medium text-gray-900">{{ activeRooms.length }}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <!-- WebSocket Connections Card -->
          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="p-5">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div 
                    :class="{
                      'bg-green-500': wsConnectionStatus === 'connected',
                      'bg-yellow-500': wsConnectionStatus === 'connecting',
                      'bg-red-500': wsConnectionStatus === 'disconnected'
                    }"
                    class="w-8 h-8 rounded-md flex items-center justify-center"
                  >
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                </div>
                <div class="ml-5 w-0 flex-1">
                  <dl>
                    <dt class="text-sm font-medium text-gray-500 truncate">WebSocket Connections</dt>
                    <dd class="text-lg font-medium text-gray-900">{{ wsActiveConnections.totalConnections }}</dd>
                    <dd class="text-xs text-gray-500">{{ wsActiveConnections.dashboardClients }} dashboard, {{ wsActiveConnections.mcpClients }} MCP</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="border-b border-gray-200 mb-6">
          <nav class="-mb-px flex space-x-8">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="{
                'border-primary-500 text-primary-600': activeTab === tab.id,
                'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300': activeTab !== tab.id
              }"
              class="whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm"
            >
              {{ tab.name }}
            </button>
          </nav>
        </div>

        <!-- Tab Content -->
        <div class="tab-content">
          <ProjectsView v-if="activeTab === 'projects'" :projects="projects" />
          <AgentsView v-if="activeTab === 'agents'" :agents="agents" />
          <OrchestrationView v-if="activeTab === 'orchestration'" :orchestrations="orchestrations" />
          <PlansView v-if="activeTab === 'plans'" :plans="plans" />
          <RoomsView v-if="activeTab === 'rooms'" :rooms="rooms" />
          <WebSocketView v-if="activeTab === 'websocket'" :ws-status="wsConnectionStatus" :connections="wsActiveConnections" :events="wsEvents" />
          <RealTimeView v-if="activeTab === 'realtime'" :events="realtimeEvents" />
        </div>
      </div>
    </main>

    <!-- Real-time Events Sidebar (when connected) -->
    <div 
      v-if="connectionStatus === 'connected' && showEventsSidebar"
      class="fixed right-0 top-16 bottom-0 w-80 bg-white shadow-lg border-l border-gray-200 z-40"
    >
      <div class="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 class="text-lg font-medium">Live Events</h3>
        <button
          @click="showEventsSidebar = false"
          class="text-gray-400 hover:text-gray-600"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="overflow-y-auto h-full p-4">
        <div v-for="event in wsRecentEvents.slice(0, 20)" :key="event.id" class="mb-3 text-sm">
          <div class="flex items-start space-x-2">
            <div 
              :class="{
                'bg-green-400': event.type.includes('completed'),
                'bg-blue-400': event.type.includes('status'),
                'bg-yellow-400': event.type.includes('update'),
                'bg-red-400': event.type.includes('error') || event.type.includes('failed'),
                'bg-purple-400': event.type.includes('spawned') || event.type.includes('created')
              }"
              class="w-2 h-2 rounded-full mt-1 flex-shrink-0"
            ></div>
            <div class="flex-1 min-w-0">
              <p class="text-gray-900 font-medium">{{ event.title }}</p>
              <p class="text-gray-500 text-xs mt-1">{{ event.description }}</p>
              <p class="text-gray-400 text-xs mt-1">{{ formatTime(event.timestamp) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Events Toggle Button -->
    <button
      v-if="connectionStatus === 'connected'"
      @click="showEventsSidebar = !showEventsSidebar"
      class="fixed right-4 bottom-4 bg-primary-600 hover:bg-primary-700 text-white rounded-full p-3 shadow-lg z-50"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5V12" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import ProjectsView from './ProjectsView.vue';
import AgentsView from './AgentsView.vue';
import OrchestrationView from './OrchestrationView.vue';
import PlansView from './PlansView.vue';
import RoomsView from './RoomsView.vue';
import WebSocketView from './WebSocketView.vue';
import RealTimeView from './RealTimeView.vue';
import { WebSocketClient } from '../services/WebSocketClient';
import { ApiClient } from '../services/ApiClient';
import { useWebSocketSingleton } from '../composables/useWebSocketSingleton';

// WebSocket singleton composable
const { 
  connectionStatus: wsConnectionStatus, 
  events: wsEvents, 
  activeConnections: wsActiveConnections, 
  isConnected, 
  recentEvents: wsRecentEvents,
  activeProjects,
  activeAgents,
  activeRooms,
  getConnectionStatusText,
  getConnectionStatusColor,
  subscribeToEvents,
  refreshConnectionStatus,
  getDebugInfo
} = useWebSocketSingleton();

// Reactive state
const connectionStatus = ref<'connected' | 'connecting' | 'disconnected'>('disconnected');
const isRefreshing = ref(false);
const lastUpdate = ref('Never');
const activeTab = ref('projects');
const showEventsSidebar = ref(false);

// Data
const stats = ref({
  projects: { active: 0, total: 0 },
  agents: { active: 0, idle: 0, completed: 0, failed: 0 },
  tasks: { running: 0, pending: 0, completed: 0 },
  rooms: { active: 0, total: 0 },
  plans: { active: 0, total: 0, completed: 0 }
});

const projects = ref([]);
const agents = ref([]);
const orchestrations = ref([]);
const plans = ref([]);
const rooms = ref([]);
const realtimeEvents = ref([]);

// Tabs configuration
const tabs = [
  { id: 'projects', name: 'Projects' },
  { id: 'agents', name: 'Agents' },
  { id: 'orchestration', name: 'Orchestration' },
  { id: 'plans', name: 'Plans' },
  { id: 'rooms', name: 'Rooms' },
  { id: 'websocket', name: 'WebSocket' },
  { id: 'realtime', name: 'Real-time' }
];

// Services
let apiClient: ApiClient | null = null;

// Methods
const initializeServices = () => {
  // Initialize API client
  apiClient = new ApiClient();
  
  // WebSocket is handled by singleton composable
  // Subscribe to all events
  subscribeToEvents(['*']);
};

const handleRealtimeEvent = (event: any) => {
  try {
    if (!event || !event.type) {
      console.warn('Received invalid event:', event);
      return;
    }

    realtimeEvents.value.unshift({
      id: Date.now() + Math.random(),
      type: event.type,
      title: formatEventTitle(event),
      description: formatEventDescription(event),
      timestamp: event.timestamp || new Date().toISOString(),
      data: event
    });
    
    // Keep only last 100 events
    if (realtimeEvents.value.length > 100) {
      realtimeEvents.value = realtimeEvents.value.slice(0, 100);
    }
    
    // Update relevant data based on event type
    if (event.type.includes('agent')) {
      refreshAgents();
    } else if (event.type.includes('task')) {
      refreshAgents(); // Tasks affect agent view
    } else if (event.type.includes('room')) {
      refreshRooms();
    } else if (event.type.includes('project') || event.type.includes('mcp-project')) {
      // Handle project connection/disconnection events
      refreshProjects();
      refreshStats(); // Update stats when projects change
    }
  } catch (error) {
    console.error('Error handling realtime event:', error, event);
  }
};

const formatEventTitle = (event: any): string => {
  switch (event.type) {
    case 'agent_spawned':
      return `Agent spawned: ${event.agent?.agentName || 'Unknown'}`;
    case 'agent_status_change':
      return `Agent status: ${event.agentId} → ${event.newStatus}`;
    case 'task_update':
      return `Task updated: ${event.taskId}`;
    case 'room_message':
      return `Message in ${event.roomName}`;
    case 'mcp-project-connected':
      return `MCP Project Connected: ${event.payload?.serverInfo?.name || 'Unknown'}`;
    case 'mcp-project-disconnected':
      return `MCP Project Disconnected: ${event.payload?.projectId || 'Unknown'}`;
    case 'project_status_change':
      return `Project status: ${event.projectName || event.projectId} → ${event.newStatus}`;
    case 'project_registered':
      return `Project registered: ${event.projectName || 'Unknown'}`;
    case 'project_disconnected':
      return `Project disconnected: ${event.projectName || 'Unknown'}`;
    case 'project_heartbeat':
      return `Project heartbeat: ${event.projectName || 'Unknown'}`;
    default:
      return event.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
};

const formatEventDescription = (event: any): string => {
  switch (event.type) {
    case 'agent_spawned':
      return `New ${event.agent?.agentName} agent in ${event.repositoryPath}`;
    case 'agent_status_change':
      return `${event.previousStatus} → ${event.newStatus}`;
    case 'task_update':
      return `Status: ${event.newStatus}${event.progressPercentage ? ` (${event.progressPercentage}%)` : ''}`;
    case 'room_message':
      const messageContent = event.message?.message || event.message?.content || 'No content';
      return `${event.message?.agentName || 'Unknown'}: ${messageContent.slice(0, 50)}...`;
    case 'mcp-project-connected':
      return `Project connected from ${event.payload?.serverInfo?.repositoryPath || 'unknown path'}`;
    case 'mcp-project-disconnected':
      return `Project disconnected (Client: ${event.payload?.clientId || 'unknown'})`;
    case 'project_status_change':
      return `${event.previousStatus} → ${event.newStatus} in ${event.repositoryPath}`;
    case 'project_registered':
      return `New ${event.mcpServerType} project in ${event.repositoryPath}`;
    case 'project_disconnected':
      return `Project from ${event.repositoryPath} (${event.reason || 'Unknown reason'})`;
    case 'project_heartbeat':
      return `Status: ${event.status} in ${event.repositoryPath}`;
    default:
      return 'Event details';
  }
};

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
};

const refreshData = async () => {
  if (!apiClient || isRefreshing.value) return;
  
  console.log('🔄 Starting data refresh...');
  isRefreshing.value = true;
  
  try {
    const results = await Promise.allSettled([
      refreshProjects(),
      refreshAgents(),
      refreshOrchestrations(),
      refreshPlans(),
      refreshRooms(),
      refreshStats()
    ]);
    
    // Log which requests failed
    results.forEach((result, index) => {
      const names = ['projects', 'agents', 'orchestrations', 'plans', 'rooms', 'stats'];
      if (result.status === 'rejected') {
        console.error(`❌ Failed to refresh ${names[index]}:`, result.reason);
      } else {
        console.log(`✅ Successfully refreshed ${names[index]}`);
      }
    });
    
    lastUpdate.value = new Date().toLocaleTimeString();
    console.log('🔄 Data refresh completed');
  } catch (error) {
    console.error('❌ Critical error during data refresh:', error);
  } finally {
    isRefreshing.value = false;
  }
};

const refreshProjects = async () => {
  if (!apiClient) return;
  try {
    console.log('🔄 Fetching projects...');
    projects.value = await apiClient.getProjects();
    console.log('✅ Projects fetched:', projects.value.length);
  } catch (error) {
    console.error('❌ Failed to fetch projects:', error);
    throw error; // Re-throw for Promise.allSettled
  }
};

const refreshAgents = async () => {
  if (!apiClient) return;
  try {
    agents.value = await apiClient.getAgents();
  } catch (error) {
    console.error('Failed to fetch agents:', error);
  }
};

const refreshOrchestrations = async () => {
  if (!apiClient) return;
  try {
    orchestrations.value = await apiClient.getOrchestrations();
  } catch (error) {
    console.error('Failed to fetch orchestrations:', error);
  }
};

const refreshPlans = async () => {
  if (!apiClient) return;
  try {
    plans.value = await apiClient.getPlans();
  } catch (error) {
    console.error('Failed to fetch plans:', error);
  }
};

const refreshRooms = async () => {
  if (!apiClient) return;
  try {
    rooms.value = await apiClient.getRooms();
  } catch (error) {
    console.error('Failed to fetch rooms:', error);
  }
};

const refreshStats = async () => {
  if (!apiClient) return;
  try {
    console.log('🔄 Fetching stats...');
    const newStats = await apiClient.getStats();
    stats.value = newStats;
    console.log('✅ Stats fetched:', newStats);
  } catch (error) {
    console.error('❌ Failed to fetch stats:', error);
    throw error; // Re-throw for Promise.allSettled
  }
};

// Lifecycle
onMounted(() => {
  initializeServices();
  refreshData();
  
  // Set up periodic refresh
  const refreshInterval = setInterval(refreshData, 30000); // 30 seconds
  
  // Debug WebSocket connection status
  setTimeout(() => {
    console.log('=== WebSocket Debug Info ===');
    console.log(getDebugInfo());
    refreshConnectionStatus();
  }, 2000);
  
  onUnmounted(() => {
    clearInterval(refreshInterval);
    // WebSocket cleanup is handled by singleton
  });
});
</script>