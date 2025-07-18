<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-medium text-gray-900">Real-time Events</h2>
      <div class="flex items-center space-x-4">
        <select 
          v-model="eventTypeFilter" 
          class="text-sm border border-gray-300 rounded-md px-3 py-1"
        >
          <option value="">All Events</option>
          <option value="agent">Agent Events</option>
          <option value="task">Task Events</option>
          <option value="room">Room Events</option>
          <option value="orchestration">Orchestration Events</option>
        </select>
        <button
          @click="clearEvents"
          class="text-sm text-red-600 hover:text-red-800 font-medium"
        >
          Clear All
        </button>
        <div class="text-sm text-gray-500">
          {{ filteredEvents.length }} event{{ filteredEvents.length !== 1 ? 's' : '' }}
        </div>
      </div>
    </div>

    <div v-if="filteredEvents.length === 0" class="text-center py-12">
      <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No events yet</h3>
      <p class="mt-1 text-sm text-gray-500">
        {{ eventTypeFilter ? `No ${eventTypeFilter} events` : 'Real-time events will appear here as they happen.' }}
      </p>
    </div>

    <div v-else class="space-y-3">
      <!-- Event Stream -->
      <div 
        v-for="event in filteredEvents"
        :key="event.id"
        class="bg-white shadow rounded-lg p-4 hover:shadow-md transition-shadow"
      >
        <div class="flex items-start space-x-3">
          <!-- Event Type Indicator -->
          <div class="flex-shrink-0 mt-1">
            <div 
              :class="{
                'bg-green-500': isSuccessEvent(event.type),
                'bg-blue-500': isStatusEvent(event.type),
                'bg-yellow-500': isUpdateEvent(event.type),
                'bg-red-500': isErrorEvent(event.type),
                'bg-purple-500': isCreateEvent(event.type),
                'bg-gray-500': isOtherEvent(event.type)
              }"
              class="w-3 h-3 rounded-full"
            ></div>
          </div>

          <!-- Event Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-gray-900">{{ event.title }}</h3>
              <div class="flex items-center space-x-2">
                <span 
                  :class="{
                    'bg-green-100 text-green-800': isSuccessEvent(event.type),
                    'bg-blue-100 text-blue-800': isStatusEvent(event.type),
                    'bg-yellow-100 text-yellow-800': isUpdateEvent(event.type),
                    'bg-red-100 text-red-800': isErrorEvent(event.type),
                    'bg-purple-100 text-purple-800': isCreateEvent(event.type),
                    'bg-gray-100 text-gray-800': isOtherEvent(event.type)
                  }"
                  class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                >
                  {{ formatEventType(event.type) }}
                </span>
                <span class="text-xs text-gray-500">{{ formatRelativeTime(event.timestamp) }}</span>
              </div>
            </div>
            
            <p class="mt-1 text-sm text-gray-600">{{ event.description }}</p>
            
            <!-- Event Details -->
            <div v-if="event.data" class="mt-2">
              <button
                @click="event.showDetails = !event.showDetails"
                class="text-xs text-primary-600 hover:text-primary-800 font-medium"
              >
                {{ event.showDetails ? 'Hide' : 'Show' }} Details
              </button>
              
              <div v-if="event.showDetails" class="mt-2 p-3 bg-gray-50 rounded text-xs">
                <div class="space-y-2">
                  <!-- Repository Path -->
                  <div v-if="event.data.repositoryPath" class="flex">
                    <span class="font-medium text-gray-700 w-20">Repository:</span>
                    <span class="text-gray-600 font-mono">{{ event.data.repositoryPath }}</span>
                  </div>
                  
                  <!-- Agent ID -->
                  <div v-if="event.data.agentId" class="flex">
                    <span class="font-medium text-gray-700 w-20">Agent:</span>
                    <span class="text-gray-600 font-mono">{{ event.data.agentId }}</span>
                  </div>
                  
                  <!-- Task ID -->
                  <div v-if="event.data.taskId" class="flex">
                    <span class="font-medium text-gray-700 w-20">Task:</span>
                    <span class="text-gray-600 font-mono">{{ event.data.taskId }}</span>
                  </div>
                  
                  <!-- Room Name -->
                  <div v-if="event.data.roomName" class="flex">
                    <span class="font-medium text-gray-700 w-20">Room:</span>
                    <span class="text-gray-600">{{ event.data.roomName }}</span>
                  </div>
                  
                  <!-- Progress -->
                  <div v-if="event.data.progressPercentage !== undefined" class="flex">
                    <span class="font-medium text-gray-700 w-20">Progress:</span>
                    <span class="text-gray-600">{{ event.data.progressPercentage }}%</span>
                  </div>
                  
                  <!-- Status Changes -->
                  <div v-if="event.data.previousStatus && event.data.newStatus" class="flex">
                    <span class="font-medium text-gray-700 w-20">Status:</span>
                    <span class="text-gray-600">{{ event.data.previousStatus }} → {{ event.data.newStatus }}</span>
                  </div>
                  
                  <!-- Raw Data (collapsible) -->
                  <details class="mt-3">
                    <summary class="cursor-pointer text-gray-500 hover:text-gray-700">Raw Event Data</summary>
                    <pre class="mt-2 text-xs text-gray-600 whitespace-pre-wrap bg-white p-2 rounded border overflow-auto max-h-40">{{ JSON.stringify(event.data, null, 2) }}</pre>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Load More Button -->
      <div v-if="hasMoreEvents" class="text-center pt-4">
        <button
          @click="loadMoreEvents"
          class="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Load More Events
        </button>
      </div>
    </div>

    <!-- Event Statistics -->
    <div class="mt-8 pt-6 border-t border-gray-200">
      <h3 class="text-sm font-medium text-gray-900 mb-4">Event Statistics</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="text-center">
          <div class="text-lg font-semibold text-green-600">{{ getEventCount('success') }}</div>
          <div class="text-xs text-gray-500">Success</div>
        </div>
        <div class="text-center">
          <div class="text-lg font-semibold text-blue-600">{{ getEventCount('status') }}</div>
          <div class="text-xs text-gray-500">Status</div>
        </div>
        <div class="text-center">
          <div class="text-lg font-semibold text-yellow-600">{{ getEventCount('update') }}</div>
          <div class="text-xs text-gray-500">Updates</div>
        </div>
        <div class="text-center">
          <div class="text-lg font-semibold text-red-600">{{ getEventCount('error') }}</div>
          <div class="text-xs text-gray-500">Errors</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

interface EventData {
  repositoryPath?: string;
  agentId?: string;
  taskId?: string;
  roomName?: string;
  progressPercentage?: number;
  previousStatus?: string;
  newStatus?: string;
  [key: string]: any;
}

interface RealtimeEvent {
  id: string | number;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  data?: EventData;
  showDetails?: boolean;
}

interface Props {
  events: RealtimeEvent[];
}

const props = defineProps<Props>();

const eventTypeFilter = ref('');
const hasMoreEvents = ref(false);

const filteredEvents = computed(() => {
  if (!eventTypeFilter.value) return props.events;
  
  return props.events.filter(event => {
    const type = event.type.toLowerCase();
    const filter = eventTypeFilter.value.toLowerCase();
    
    switch (filter) {
      case 'agent':
        return type.includes('agent');
      case 'task':
        return type.includes('task');
      case 'room':
        return type.includes('room');
      case 'orchestration':
        return type.includes('orchestration') || type.includes('plan');
      default:
        return true;
    }
  });
});

const formatEventType = (type: string): string => {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 1000) return 'Just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
};

const isSuccessEvent = (type: string): boolean => {
  return type.includes('completed') || type.includes('success') || type.includes('finished');
};

const isStatusEvent = (type: string): boolean => {
  return type.includes('status') || type.includes('change') || type.includes('spawned') || type.includes('resumed');
};

const isUpdateEvent = (type: string): boolean => {
  return type.includes('update') || type.includes('progress') || type.includes('heartbeat');
};

const isErrorEvent = (type: string): boolean => {
  return type.includes('error') || type.includes('failed') || type.includes('terminated');
};

const isCreateEvent = (type: string): boolean => {
  return type.includes('created') || type.includes('spawned') || type.includes('started');
};

const isOtherEvent = (type: string): boolean => {
  return !isSuccessEvent(type) && !isStatusEvent(type) && !isUpdateEvent(type) && !isErrorEvent(type) && !isCreateEvent(type);
};

const getEventCount = (category: string): number => {
  return props.events.filter(event => {
    switch (category) {
      case 'success':
        return isSuccessEvent(event.type);
      case 'status':
        return isStatusEvent(event.type);
      case 'update':
        return isUpdateEvent(event.type);
      case 'error':
        return isErrorEvent(event.type);
      default:
        return false;
    }
  }).length;
};

const clearEvents = () => {
  // This would need to emit an event to parent to clear events
  console.log('Clearing events...');
};

const loadMoreEvents = () => {
  // This would need to emit an event to parent to load more events
  console.log('Loading more events...');
};
</script>