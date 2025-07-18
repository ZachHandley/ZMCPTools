<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-medium text-gray-900">Active MCP Projects</h2>
      <div class="text-sm text-gray-500">
        {{ projects.length }} project{{ projects.length !== 1 ? 's' : '' }}
      </div>
    </div>

    <div v-if="projects.length === 0" class="text-center py-12">
      <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No active projects</h3>
      <p class="mt-1 text-sm text-gray-500">Start an MCP server to see projects here.</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div
        v-for="project in projects"
        :key="project.id"
        class="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
      >
        <div class="px-4 py-5 sm:p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center">
              <div 
                :class="{
                  'bg-green-500': project.status === 'active' || project.status === 'connected',
                  'bg-yellow-500': project.status === 'inactive' || project.status === 'stale',
                  'bg-red-500': project.status === 'error' || project.status === 'disconnected'
                }"
                class="w-3 h-3 rounded-full mr-3"
              ></div>
              <h3 class="text-lg font-medium text-gray-900">{{ project.name }}</h3>
            </div>
            <span 
              :class="{
                'bg-green-100 text-green-800': project.status === 'active' || project.status === 'connected',
                'bg-yellow-100 text-yellow-800': project.status === 'inactive' || project.status === 'stale',
                'bg-red-100 text-red-800': project.status === 'error' || project.status === 'disconnected'
              }"
              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
            >
              {{ project.status === 'stale' ? 'stale (no heartbeat)' : project.status }}
            </span>
          </div>

          <div class="space-y-3">
            <div class="flex items-center text-sm text-gray-600">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2v0a2 2 0 012-2h6l2 2h6a2 2 0 012 2z" />
              </svg>
              <span class="truncate">{{ project.repositoryPath }}</span>
            </div>

            <div class="flex items-center text-sm text-gray-600">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
              </svg>
              <span>{{ project.mcpServerType }}</span>
            </div>

            <div v-if="project.mcpServerPort" class="flex items-center text-sm text-gray-600">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2" />
              </svg>
              <span>{{ project.mcpServerHost }}:{{ project.mcpServerPort }}</span>
            </div>

            <div v-if="project.mcpServerPid" class="flex items-center text-sm text-gray-600">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>PID: {{ project.mcpServerPid }}</span>
            </div>

            <div v-if="project.webUiEnabled" class="flex items-center text-sm text-green-600">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span>Web UI: {{ project.webUiHost }}:{{ project.webUiPort }}</span>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="flex justify-between items-center">
              <div class="text-xs text-gray-500 space-y-1">
                <div>Started: {{ formatDate(project.startTime) }}</div>
                <div v-if="project.lastHeartbeat">
                  Last seen: {{ formatRelativeTime(project.lastHeartbeat) }}
                </div>
              </div>
              <a 
                :href="`/projects/${encodeURIComponent(project.id)}`" 
                class="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                View Details
                <svg class="ml-1 -mr-0.5 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>

          <!-- Session Information -->
          <div v-if="project.claudeSessionId || project.foundationSessionId" class="mt-3 pt-3 border-t border-gray-100">
            <div class="text-xs text-gray-500 space-y-1">
              <div v-if="project.claudeSessionId" class="flex items-center">
                <span class="font-medium mr-2">Claude Session:</span>
                <code class="bg-gray-100 px-1 rounded text-xs">{{ project.claudeSessionId.slice(0, 8) }}...</code>
              </div>
              <div v-if="project.foundationSessionId" class="flex items-center">
                <span class="font-medium mr-2">Foundation Cache:</span>
                <code class="bg-gray-100 px-1 rounded text-xs">{{ project.foundationSessionId }}</code>
              </div>
            </div>
          </div>

          <!-- Project Metadata -->
          <div v-if="project.projectMetadata && Object.keys(project.projectMetadata).length > 0" class="mt-3">
            <details class="text-xs">
              <summary class="text-gray-500 cursor-pointer hover:text-gray-700">Project Metadata</summary>
              <div class="mt-2 bg-gray-50 rounded p-2">
                <pre class="text-xs text-gray-600 whitespace-pre-wrap">{{ JSON.stringify(project.projectMetadata, null, 2) }}</pre>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Project {
  id: string;
  name: string;
  repositoryPath: string;
  mcpServerType: string;
  mcpServerPid?: number;
  mcpServerPort?: number;
  mcpServerHost?: string;
  claudeSessionId?: string;
  foundationSessionId?: string;
  status: string;
  startTime: string;
  lastHeartbeat?: string;
  endTime?: string;
  projectMetadata?: Record<string, any>;
  webUiEnabled?: boolean;
  webUiPort?: number;
  webUiHost?: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  projects: Project[];
}

defineProps<Props>();

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
</script>