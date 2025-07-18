<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-medium text-gray-900">Agent Status</h2>
      <div class="flex items-center space-x-4">
        <select 
          v-model="statusFilter" 
          class="text-sm border border-gray-300 rounded-md px-3 py-1"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="terminated">Terminated</option>
        </select>
        <div class="text-sm text-gray-500">
          {{ filteredAgents.length }} agent{{ filteredAgents.length !== 1 ? 's' : '' }}
        </div>
      </div>
    </div>

    <div v-if="filteredAgents.length === 0" class="text-center py-12">
      <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No agents found</h3>
      <p class="mt-1 text-sm text-gray-500">
        {{ statusFilter ? `No agents with status "${statusFilter}"` : 'No agents have been spawned yet.' }}
      </p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="agent in filteredAgents"
        :key="agent.id"
        class="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-start space-x-4 flex-1">
            <!-- Status Indicator -->
            <div class="flex-shrink-0 mt-1">
              <div 
                :class="{
                  'bg-green-500': agent.status === 'active',
                  'bg-blue-500': agent.status === 'idle',
                  'bg-gray-500': agent.status === 'completed',
                  'bg-red-500': agent.status === 'failed' || agent.status === 'terminated',
                  'bg-yellow-500': agent.status === 'initializing'
                }"
                class="w-3 h-3 rounded-full"
              ></div>
            </div>

            <!-- Agent Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-3">
                <h3 class="text-lg font-medium text-gray-900">{{ agent.agentName }}</h3>
                <span 
                  :class="{
                    'bg-green-100 text-green-800': agent.status === 'active',
                    'bg-blue-100 text-blue-800': agent.status === 'idle',
                    'bg-gray-100 text-gray-800': agent.status === 'completed',
                    'bg-red-100 text-red-800': agent.status === 'failed' || agent.status === 'terminated',
                    'bg-yellow-100 text-yellow-800': agent.status === 'initializing'
                  }"
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
                >
                  {{ agent.status }}
                </span>
              </div>
              
              <p class="mt-1 text-sm text-gray-600">{{ agent.taskDescription }}</p>
              
              <div class="mt-2 flex items-center text-sm text-gray-500 space-x-4">
                <span class="flex items-center">
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a2 2 0 012-2z" />
                  </svg>
                  {{ agent.id.slice(0, 8) }}...
                </span>
                
                <span v-if="agent.claudePid" class="flex items-center">
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  PID: {{ agent.claudePid }}
                </span>
                
                <span class="flex items-center">
                  <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ formatRelativeTime(agent.lastHeartbeat) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center space-x-2">
            <button
              v-if="agent.status === 'active' || agent.status === 'idle'"
              @click="terminateAgent(agent.id)"
              class="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              Terminate
            </button>
            <button
              @click="viewAgentDetails(agent)"
              class="text-primary-600 hover:text-primary-800 text-sm font-medium"
            >
              Details
            </button>
          </div>
        </div>

        <!-- Repository Path -->
        <div class="mt-3 flex items-center text-sm text-gray-600">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2v0a2 2 0 012-2h6l2 2h6a2 2 0 012 2z" />
          </svg>
          <span class="truncate">{{ agent.repositoryPath }}</span>
        </div>

        <!-- Capabilities -->
        <div v-if="agent.capabilities && agent.capabilities.length > 0" class="mt-3">
          <div class="flex flex-wrap gap-1">
            <span
              v-for="capability in agent.capabilities"
              :key="capability"
              class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
            >
              {{ capability }}
            </span>
          </div>
        </div>

        <!-- Dependencies -->
        <div v-if="agent.dependsOn && agent.dependsOn.length > 0" class="mt-3">
          <div class="text-xs text-gray-500">
            <span class="font-medium">Depends on:</span>
            <span class="ml-2">{{ agent.dependsOn.join(', ') }}</span>
          </div>
        </div>

        <!-- Room Assignment -->
        <div v-if="agent.roomId" class="mt-3">
          <div class="flex items-center text-xs text-gray-600">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            <span>Room: {{ agent.roomId }}</span>
          </div>
        </div>

        <!-- Metadata -->
        <div v-if="agent.metadata && Object.keys(agent.metadata).length > 0" class="mt-3">
          <details class="text-xs">
            <summary class="text-gray-500 cursor-pointer hover:text-gray-700">Agent Metadata</summary>
            <div class="mt-2 bg-gray-50 rounded p-2 max-h-32 overflow-auto">
              <pre class="text-xs text-gray-600 whitespace-pre-wrap">{{ JSON.stringify(agent.metadata, null, 2) }}</pre>
            </div>
          </details>
        </div>

        <!-- Timestamps -->
        <div class="mt-4 pt-3 border-t border-gray-200 flex justify-between text-xs text-gray-500">
          <span>Created: {{ formatDate(agent.createdAt) }}</span>
          <span v-if="agent.endTime">Ended: {{ formatDate(agent.endTime) }}</span>
        </div>
      </div>
    </div>

    <!-- Agent Details Modal (placeholder) -->
    <div v-if="selectedAgent" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" @click="selectedAgent = null">
      <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white" @click.stop>
        <div class="mt-3">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900">Agent Details</h3>
            <button @click="selectedAgent = null" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="space-y-4">
            <div>
              <h4 class="font-medium text-gray-900">{{ selectedAgent.agentName }}</h4>
              <p class="text-sm text-gray-600 mt-1">{{ selectedAgent.taskDescription }}</p>
            </div>
            
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="font-medium text-gray-700">Status:</span>
                <span class="ml-2 capitalize">{{ selectedAgent.status }}</span>
              </div>
              <div>
                <span class="font-medium text-gray-700">PID:</span>
                <span class="ml-2">{{ selectedAgent.claudePid || 'N/A' }}</span>
              </div>
              <div>
                <span class="font-medium text-gray-700">Created:</span>
                <span class="ml-2">{{ formatDate(selectedAgent.createdAt) }}</span>
              </div>
              <div>
                <span class="font-medium text-gray-700">Last Heartbeat:</span>
                <span class="ml-2">{{ formatRelativeTime(selectedAgent.lastHeartbeat) }}</span>
              </div>
            </div>
            
            <div v-if="selectedAgent.capabilities">
              <span class="font-medium text-gray-700">Capabilities:</span>
              <div class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="capability in selectedAgent.capabilities"
                  :key="capability"
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
                >
                  {{ capability }}
                </span>
              </div>
            </div>
            
            <div class="border-t pt-4">
              <span class="font-medium text-gray-700">Repository:</span>
              <p class="text-sm text-gray-600 mt-1 font-mono">{{ selectedAgent.repositoryPath }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useNotification } from '../utils/useNotifications';

interface Agent {
  id: string;
  agentName: string;
  repositoryPath: string;
  taskDescription: string;
  status: string;
  claudePid?: number;
  lastHeartbeat: string;
  createdAt: string;
  endTime?: string;
  capabilities?: string[];
  dependsOn?: string[];
  roomId?: string;
  metadata?: Record<string, any>;
}

interface Props {
  agents: Agent[];
}

const props = defineProps<Props>();

const statusFilter = ref('');
const selectedAgent = ref<Agent | null>(null);
const notifications = useNotification();

const filteredAgents = computed(() => {
  if (!statusFilter.value) return props.agents;
  return props.agents.filter(agent => agent.status === statusFilter.value);
});

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
};

const terminateAgent = async (agentId: string) => {
  const result = await notifications.confirm({
    title: 'Terminate Agent',
    text: 'Are you sure you want to terminate this agent?',
    icon: 'warning'
  });
  
  if (result.isConfirmed) {
    try {
      // Call API to terminate agent
      console.log('Terminating agent:', agentId);
      // TODO: Implement API call
      notifications.success('Agent terminated successfully');
    } catch (error) {
      console.error('Failed to terminate agent:', error);
      notifications.error('Failed to terminate agent');
    }
  }
};

const viewAgentDetails = (agent: Agent) => {
  selectedAgent.value = agent;
};
</script>