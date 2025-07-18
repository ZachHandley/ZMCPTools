<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-medium text-gray-900">Communication Rooms</h2>
      <div class="text-sm text-gray-500">
        {{ rooms.length }} room{{ rooms.length !== 1 ? 's' : '' }}
      </div>
    </div>

    <div v-if="rooms.length === 0" class="text-center py-12">
      <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900">No active rooms</h3>
      <p class="mt-1 text-sm text-gray-500">Communication rooms will appear here when agents start coordinating.</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div
        v-for="room in rooms"
        :key="room.roomId"
        class="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow"
      >
        <!-- Header -->
        <div class="px-4 py-4 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div 
                :class="{
                  'bg-green-500': room.coordinationStatus === 'active',
                  'bg-yellow-500': room.coordinationStatus === 'blocked',
                  'bg-gray-500': room.coordinationStatus === 'idle'
                }"
                class="w-3 h-3 rounded-full mr-3"
              ></div>
              <h3 class="text-lg font-medium text-gray-900">{{ room.roomName }}</h3>
            </div>
            <span 
              :class="{
                'bg-green-100 text-green-800': room.coordinationStatus === 'active',
                'bg-yellow-100 text-yellow-800': room.coordinationStatus === 'blocked',
                'bg-gray-100 text-gray-800': room.coordinationStatus === 'idle'
              }"
              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
            >
              {{ room.coordinationStatus }}
            </span>
          </div>
          <p v-if="room.topicSummary" class="mt-1 text-sm text-gray-600">{{ room.topicSummary }}</p>
        </div>

        <!-- Stats -->
        <div class="px-4 py-3 bg-gray-50">
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-lg font-semibold text-gray-900">{{ room.memberCount }}</div>
              <div class="text-xs text-gray-500">Members</div>
            </div>
            <div>
              <div class="text-lg font-semibold text-gray-900">{{ room.messageCount }}</div>
              <div class="text-xs text-gray-500">Messages</div>
            </div>
            <div>
              <div class="text-lg font-semibold text-gray-900">{{ room.activeMembers.length }}</div>
              <div class="text-xs text-gray-500">Active</div>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="px-4 py-4">
          <!-- Active Members -->
          <div v-if="room.activeMembers.length > 0" class="mb-4">
            <h4 class="text-sm font-medium text-gray-900 mb-2">Active Members</h4>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="member in room.activeMembers"
                :key="member"
                class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
              >
                {{ member }}
              </span>
            </div>
          </div>

          <!-- Recent Messages -->
          <div v-if="room.recentMessages && room.recentMessages.length > 0" class="mb-4">
            <h4 class="text-sm font-medium text-gray-900 mb-2">Recent Messages</h4>
            <div class="space-y-2 max-h-40 overflow-y-auto">
              <div 
                v-for="message in room.recentMessages.slice(0, 5)"
                :key="message.id"
                class="text-xs bg-gray-50 rounded p-2"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="font-medium text-gray-700">{{ message.agentName }}</span>
                  <span class="text-gray-500">{{ formatRelativeTime(message.timestamp) }}</span>
                </div>
                <div 
                  class="text-gray-600 message-content"
                  v-html="truncateMessage(renderMessageContent(message.message || message.content || 'No content'))"
                ></div>
              </div>
            </div>
          </div>

          <!-- Last Activity -->
          <div class="text-xs text-gray-500">
            <span class="font-medium">Last activity:</span>
            <span class="ml-1">{{ formatRelativeTime(room.lastActivity) }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div class="flex justify-between items-center">
            <button
              @click="viewRoomDetails(room)"
              class="text-primary-600 hover:text-primary-800 text-sm font-medium"
            >
              View Details
            </button>
            <div class="flex space-x-2">
              <button
                @click="joinRoom(room.roomName)"
                class="text-green-600 hover:text-green-800 text-sm font-medium"
              >
                Join
              </button>
              <button
                v-if="room.coordinationStatus === 'blocked'"
                @click="unblockRoom(room.roomId)"
                class="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
              >
                Unblock
              </button>
              <button
                @click="closeRoom(room.roomId)"
                class="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Room Details Modal -->
    <div v-if="selectedRoom" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50" @click="selectedRoom = null">
      <div class="relative top-10 mx-auto p-5 border w-11/12 md:w-4/5 lg:w-3/4 shadow-lg rounded-md bg-white" @click.stop>
        <div class="mt-3">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-medium text-gray-900">{{ selectedRoom.roomName }}</h3>
            <button @click="selectedRoom = null" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Room Info -->
            <div class="lg:col-span-1">
              <h4 class="font-medium text-gray-900 mb-3">Room Information</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600">Status:</span>
                  <span class="capitalize">{{ selectedRoom.coordinationStatus }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Members:</span>
                  <span>{{ selectedRoom.memberCount }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Messages:</span>
                  <span>{{ selectedRoom.messageCount }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Last Activity:</span>
                  <span>{{ formatRelativeTime(selectedRoom.lastActivity) }}</span>
                </div>
              </div>

              <div v-if="selectedRoom.activeMembers.length > 0" class="mt-4">
                <h5 class="font-medium text-gray-900 mb-2">Active Members</h5>
                <div class="space-y-1">
                  <div 
                    v-for="member in selectedRoom.activeMembers"
                    :key="member"
                    class="text-sm text-gray-600"
                  >
                    {{ member }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Messages -->
            <div class="lg:col-span-2">
              <h4 class="font-medium text-gray-900 mb-3">Message History</h4>
              <div class="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <div v-if="selectedRoom.recentMessages.length === 0" class="text-center text-gray-500 py-8">
                  No messages in this room yet.
                </div>
                <div v-else class="space-y-3">
                  <div 
                    v-for="message in selectedRoom.recentMessages"
                    :key="message.id"
                    class="bg-white rounded p-3"
                  >
                    <div class="flex items-center justify-between mb-2">
                      <span class="font-medium text-gray-900">{{ message.agentName }}</span>
                      <span class="text-xs text-gray-500">{{ formatDate(message.timestamp) }}</span>
                    </div>
                    <div 
                      class="text-sm text-gray-700 message-content"
                      v-html="renderMessageContent(message.message || message.content || 'No content')"
                    ></div>
                    <div v-if="message.mentions && message.mentions.length > 0" class="mt-2">
                      <span class="text-xs text-gray-500">Mentions: {{ message.mentions.join(', ') }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useNotification } from '../utils/useNotifications';
import { useMarkdown } from '../utils/useMarkdown';

interface Message {
  id: string;
  agentName: string;
  content: string;
  timestamp: string;
  mentions?: string[];
}

interface Room {
  roomId: string;
  roomName: string;
  memberCount: number;
  activeMembers: string[];
  recentMessages: Message[];
  messageCount: number;
  lastActivity: string;
  topicSummary?: string;
  coordinationStatus: 'active' | 'idle' | 'blocked';
}

interface Props {
  rooms: Room[];
}

defineProps<Props>();

const selectedRoom = ref<Room | null>(null);
const notifications = useNotification();
const { renderMarkdown, isMarkdown } = useMarkdown();

const formatDate = (dateString: string): string => {
  if (!dateString) return 'Unknown date';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Invalid date';
  }
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
};

const formatRelativeTime = (dateString: string): string => {
  if (!dateString) return 'Unknown time';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Invalid time';
  }
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
};

const truncateMessage = (content: string | null | undefined, maxLength: number = 100): string => {
  if (!content || typeof content !== 'string') return 'No content';
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
};

const renderMessageContent = (content: string | null | undefined): string => {
  if (!content || typeof content !== 'string') return 'No content';
  
  if (isMarkdown(content)) {
    return renderMarkdown(content);
  }
  
  return content;
};

const viewRoomDetails = (room: Room) => {
  selectedRoom.value = room;
};

const joinRoom = async (roomName: string) => {
  try {
    console.log('Joining room:', roomName);
    // TODO: Implement API call
  } catch (error) {
    console.error('Failed to join room:', error);
  }
};

const unblockRoom = async (roomId: string) => {
  try {
    console.log('Unblocking room:', roomId);
    // TODO: Implement API call
  } catch (error) {
    console.error('Failed to unblock room:', error);
  }
};

const closeRoom = async (roomId: string) => {
  const result = await notifications.confirm({
    title: 'Close Room',
    text: 'Are you sure you want to close this room?',
    icon: 'warning'
  });
  
  if (result.isConfirmed) {
    try {
      console.log('Closing room:', roomId);
      // TODO: Implement API call
      notifications.success('Room closed successfully');
    } catch (error) {
      console.error('Failed to close room:', error);
      notifications.error('Failed to close room');
    }
  }
};
</script>