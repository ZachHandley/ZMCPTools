<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-medium text-gray-900">Orchestration Status</h2>
      <div class="text-sm text-gray-500">
        {{ orchestrations.length }} orchestration{{ orchestrations.length !== 1 ? 's' : '' }}
      </div>
    </div>

    <div v-if="orchestrations.length === 0" class="text-center py-12">
      <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No orchestrations running</h3>
      <p class="mt-1 text-sm text-gray-500">Start an orchestration to see progress here.</p>
    </div>

    <div v-else class="space-y-6">
      <div
        v-for="orchestration in orchestrations"
        :key="orchestration.orchestrationId"
        class="bg-white shadow rounded-lg overflow-hidden"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-medium text-gray-900">{{ orchestration.title }}</h3>
              <p class="text-sm text-gray-600 mt-1">{{ orchestration.orchestrationId }}</p>
            </div>
            <div class="flex items-center space-x-3">
              <span 
                :class="{
                  'bg-green-100 text-green-800': orchestration.status === 'active',
                  'bg-blue-100 text-blue-800': orchestration.status === 'completed',
                  'bg-red-100 text-red-800': orchestration.status === 'failed',
                  'bg-yellow-100 text-yellow-800': orchestration.status === 'paused'
                }"
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
              >
                {{ orchestration.status }}
              </span>
              <div class="text-sm text-gray-500">
                {{ Math.round(orchestration.progress) }}% complete
              </div>
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="px-6 py-3 bg-gray-50">
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div 
              :style="{ width: orchestration.progress + '%' }"
              :class="{
                'bg-green-500': orchestration.status === 'completed',
                'bg-primary-500': orchestration.status === 'active',
                'bg-red-500': orchestration.status === 'failed',
                'bg-yellow-500': orchestration.status === 'paused'
              }"
              class="h-2 rounded-full transition-all duration-300"
            ></div>
          </div>
        </div>

        <!-- Content -->
        <div class="px-6 py-4">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Overview -->
            <div class="lg:col-span-2 space-y-4">
              <div>
                <h4 class="font-medium text-gray-900 mb-2">Timeline</h4>
                <div class="text-sm text-gray-600 space-y-1">
                  <div class="flex justify-between">
                    <span>Started:</span>
                    <span>{{ formatDate(orchestration.startTime) }}</span>
                  </div>
                  <div v-if="orchestration.endTime" class="flex justify-between">
                    <span>Ended:</span>
                    <span>{{ formatDate(orchestration.endTime) }}</span>
                  </div>
                  <div v-if="orchestration.duration" class="flex justify-between">
                    <span>Duration:</span>
                    <span>{{ formatDuration(orchestration.duration) }}</span>
                  </div>
                </div>
              </div>

              <!-- Task Summary -->
              <div>
                <h4 class="font-medium text-gray-900 mb-2">Task Summary</h4>
                <div class="grid grid-cols-3 gap-4 text-sm">
                  <div class="text-center">
                    <div class="text-lg font-semibold text-green-600">{{ orchestration.completedTasks.length }}</div>
                    <div class="text-gray-500">Completed</div>
                  </div>
                  <div class="text-center">
                    <div class="text-lg font-semibold text-red-600">{{ orchestration.failedTasks.length }}</div>
                    <div class="text-gray-500">Failed</div>
                  </div>
                  <div class="text-center">
                    <div class="text-lg font-semibold text-gray-600">{{ orchestration.totalTasks }}</div>
                    <div class="text-gray-500">Total</div>
                  </div>
                </div>
              </div>

              <!-- Session Info -->
              <div v-if="orchestration.foundationSessionId">
                <h4 class="font-medium text-gray-900 mb-2">Session Information</h4>
                <div class="text-sm text-gray-600">
                  <span class="font-medium">Foundation Session:</span>
                  <code class="ml-2 bg-gray-100 px-1 rounded">{{ orchestration.foundationSessionId }}</code>
                </div>
              </div>

              <!-- Room Information -->
              <div v-if="orchestration.roomName">
                <h4 class="font-medium text-gray-900 mb-2">Communication</h4>
                <div class="text-sm text-gray-600">
                  <span class="font-medium">Room:</span>
                  <span class="ml-2">{{ orchestration.roomName }}</span>
                </div>
              </div>
            </div>

            <!-- Agents Status -->
            <div>
              <h4 class="font-medium text-gray-900 mb-3">Active Agents</h4>
              <div class="space-y-2">
                <div 
                  v-for="agent in orchestration.activeAgents"
                  :key="agent.agentId"
                  class="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div class="flex items-center space-x-2">
                    <div 
                      :class="{
                        'bg-green-500': agent.status === 'active',
                        'bg-blue-500': agent.status === 'idle',
                        'bg-gray-500': agent.status === 'completed',
                        'bg-red-500': agent.status === 'failed'
                      }"
                      class="w-2 h-2 rounded-full"
                    ></div>
                    <span class="text-sm font-medium">{{ agent.agentId.slice(0, 8) }}...</span>
                  </div>
                  <span class="text-xs text-gray-500 capitalize">{{ agent.status }}</span>
                </div>
              </div>

              <!-- Spawned Agents Summary -->
              <div v-if="orchestration.spawnedAgents.length > orchestration.activeAgents.length" class="mt-3">
                <div class="text-xs text-gray-500">
                  <span class="font-medium">Total spawned:</span>
                  <span class="ml-1">{{ orchestration.spawnedAgents.length }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Next Steps -->
          <div v-if="orchestration.nextSteps && orchestration.nextSteps.length > 0" class="mt-6 pt-4 border-t border-gray-200">
            <h4 class="font-medium text-gray-900 mb-2">Next Steps</h4>
            <ul class="text-sm text-gray-600 space-y-1">
              <li 
                v-for="(step, index) in orchestration.nextSteps"
                :key="index"
                class="flex items-start"
              >
                <span class="text-primary-500 mr-2">•</span>
                <span 
                  class="message-content"
                  v-html="renderStepContent(step)"
                ></span>
              </li>
            </ul>
          </div>

          <!-- Insights -->
          <div v-if="orchestration.insights && orchestration.insights.length > 0" class="mt-6 pt-4 border-t border-gray-200">
            <h4 class="font-medium text-gray-900 mb-2">Insights</h4>
            <div class="space-y-2">
              <div 
                v-for="insight in orchestration.insights"
                :key="insight.id"
                class="p-3 bg-blue-50 rounded-lg"
              >
                <div class="text-sm font-medium text-blue-900">{{ insight.entityName }}</div>
                <div 
                  class="text-sm text-blue-700 mt-1 message-content"
                  v-html="renderInsightContent(insight.entityDescription)"
                ></div>
              </div>
            </div>
          </div>

          <!-- Errors -->
          <div v-if="orchestration.errors && orchestration.errors.length > 0" class="mt-6 pt-4 border-t border-gray-200">
            <h4 class="font-medium text-gray-900 mb-2">Errors</h4>
            <div class="space-y-2">
              <div 
                v-for="(error, index) in orchestration.errors"
                :key="index"
                class="p-3 bg-red-50 rounded-lg"
              >
                <div class="text-sm text-red-700">{{ error }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div class="flex justify-between items-center">
            <div class="text-xs text-gray-500">
              Last updated: {{ formatRelativeTime(orchestration.startTime) }}
            </div>
            <div class="flex space-x-2">
              <button
                v-if="orchestration.status === 'active'"
                @click="pauseOrchestration(orchestration.orchestrationId)"
                class="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
              >
                Pause
              </button>
              <button
                v-if="orchestration.status === 'paused'"
                @click="resumeOrchestration(orchestration.orchestrationId)"
                class="text-green-600 hover:text-green-800 text-sm font-medium"
              >
                Resume
              </button>
              <button
                v-if="orchestration.roomName"
                @click="viewRoom(orchestration.roomName)"
                class="text-primary-600 hover:text-primary-800 text-sm font-medium"
              >
                View Room
              </button>
              <button
                @click="viewDetails(orchestration)"
                class="text-primary-600 hover:text-primary-800 text-sm font-medium"
              >
                Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMarkdown } from '../utils/useMarkdown';

interface Agent {
  agentId: string;
  status: string;
}

interface Task {
  id: string;
  status: string;
  description: string;
}

interface KnowledgeEntity {
  id: string;
  entityName: string;
  entityDescription: string;
}

interface Orchestration {
  orchestrationId: string;
  title: string;
  status: 'active' | 'completed' | 'failed' | 'paused';
  startTime: string;
  endTime?: string;
  duration?: number;
  progress: number;
  totalTasks: number;
  completedTasks: Task[];
  failedTasks: Task[];
  activeAgents: Agent[];
  spawnedAgents: Agent[];
  roomName?: string;
  foundationSessionId?: string;
  nextSteps: string[];
  insights: KnowledgeEntity[];
  errors: string[];
}

interface Props {
  orchestrations: Orchestration[];
}

defineProps<Props>();

const { renderMarkdown, isMarkdown } = useMarkdown();

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

const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

const pauseOrchestration = async (orchestrationId: string) => {
  try {
    console.log('Pausing orchestration:', orchestrationId);
    // TODO: Implement API call
  } catch (error) {
    console.error('Failed to pause orchestration:', error);
  }
};

const resumeOrchestration = async (orchestrationId: string) => {
  try {
    console.log('Resuming orchestration:', orchestrationId);
    // TODO: Implement API call
  } catch (error) {
    console.error('Failed to resume orchestration:', error);
  }
};

const viewRoom = (roomName: string) => {
  // TODO: Switch to rooms tab and filter by room name
  console.log('Viewing room:', roomName);
};

const viewDetails = (orchestration: Orchestration) => {
  // TODO: Show detailed modal or navigate to details page
  console.log('Viewing orchestration details:', orchestration.orchestrationId);
};

const renderStepContent = (step: string): string => {
  if (!step || typeof step !== 'string') return '';
  
  if (isMarkdown(step)) {
    return renderMarkdown(step);
  }
  
  return step;
};

const renderInsightContent = (description: string): string => {
  if (!description || typeof description !== 'string') return '';
  
  if (isMarkdown(description)) {
    return renderMarkdown(description);
  }
  
  return description;
};
</script>