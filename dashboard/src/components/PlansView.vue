<template>
  <div class="space-y-6">
    <!-- Plans Header -->
    <div class="flex justify-between items-center">
      <h2 class="text-2xl font-bold text-gray-900">Execution Plans</h2>
      <div class="flex items-center space-x-4">
        <div class="text-sm text-gray-500">
          {{ plans.length }} plan{{ plans.length !== 1 ? 's' : '' }}
        </div>
      </div>
    </div>

    <!-- Plans List -->
    <div class="grid grid-cols-1 gap-6">
      <div v-if="plans.length === 0" class="text-center py-12">
        <div class="text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900">No execution plans</h3>
          <p class="mt-2 text-sm text-gray-500">
            Create execution plans to coordinate multi-agent tasks
          </p>
        </div>
      </div>

      <!-- Plan Cards -->
      <div v-for="plan in plans" :key="plan.id" class="bg-white shadow rounded-lg border border-gray-200">
        <div class="px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div 
                :class="{
                  'bg-blue-100 text-blue-800': plan.status === 'draft',
                  'bg-green-100 text-green-800': plan.status === 'approved',
                  'bg-yellow-100 text-yellow-800': plan.status === 'in_progress',
                  'bg-emerald-100 text-emerald-800': plan.status === 'completed',
                  'bg-red-100 text-red-800': plan.status === 'cancelled',
                  'bg-gray-100 text-gray-800': plan.status === 'on_hold'
                }"
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
              >
                {{ formatStatus(plan.status) }}
              </div>
              <div 
                :class="{
                  'bg-red-100 text-red-800': plan.priority === 'critical',
                  'bg-orange-100 text-orange-800': plan.priority === 'high',
                  'bg-yellow-100 text-yellow-800': plan.priority === 'medium',
                  'bg-gray-100 text-gray-800': plan.priority === 'low'
                }"
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
              >
                {{ plan.priority }}
              </div>
            </div>
            <div class="text-sm text-gray-500">
              {{ formatDate(plan.createdAt) }}
            </div>
          </div>
          
          <div class="mt-4">
            <h3 class="text-lg font-medium text-gray-900">{{ plan.title }}</h3>
            <p class="mt-1 text-sm text-gray-600 line-clamp-2">{{ plan.objectives }}</p>
          </div>

          <div class="mt-4 flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <div class="text-sm text-gray-500">
                <span class="font-medium">Sections:</span> {{ plan.sections?.length || 0 }}
              </div>
              <div class="text-sm text-gray-500">
                <span class="font-medium">Created by:</span> {{ plan.createdByAgent || 'Unknown' }}
              </div>
            </div>
            <div class="text-sm text-gray-500">
              ID: {{ plan.id }}
            </div>
          </div>

          <!-- Progress Bar -->
          <div v-if="plan.status === 'in_progress'" class="mt-4">
            <div class="flex justify-between text-sm">
              <span class="text-gray-600">Progress</span>
              <span class="text-gray-900">{{ Math.round(plan.progress || 0) }}%</span>
            </div>
            <div class="mt-1 w-full bg-gray-200 rounded-full h-2">
              <div 
                class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                :style="{ width: `${plan.progress || 0}%` }"
              ></div>
            </div>
          </div>

          <!-- Plan Sections -->
          <div v-if="plan.sections && plan.sections.length > 0" class="mt-4">
            <h4 class="text-sm font-medium text-gray-900 mb-2">Sections</h4>
            <div class="space-y-2">
              <div v-for="section in plan.sections.slice(0, 3)" :key="section.id" class="flex items-center space-x-2">
                <div class="w-2 h-2 rounded-full bg-gray-300"></div>
                <span class="text-sm text-gray-600">{{ section.title }}</span>
                <span class="text-xs text-gray-500">({{ section.type }})</span>
              </div>
              <div v-if="plan.sections.length > 3" class="text-xs text-gray-500 ml-4">
                +{{ plan.sections.length - 3 }} more sections...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';
import type { Plan } from '../../../src/schemas/plans';

interface PlanWithProgress extends Plan {
  progress?: number;
}

defineProps<{
  plans: PlanWithProgress[];
}>();

const formatStatus = (status: string): string => {
  switch (status) {
    case 'in_progress':
      return 'In Progress';
    case 'on_hold':
      return 'On Hold';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

const formatDate = (dateString: string): string => {
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