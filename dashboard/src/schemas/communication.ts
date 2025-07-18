import { z } from 'zod';
import { int, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

// Zod v4 schemas for validation
export const messageTypeSchema = z.enum([
  'standard',
  'system',
  'notification',
  'alert',
  'status_update',
  'coordination',
  'error',
  'debug'
]);

export const roomMetadataSchema = z.record(z.string(), z.unknown()).optional();
export const messageMentionsSchema = z.array(z.string()).default([]);

export const participantStatusSchema = z.enum(['active', 'inactive', 'left']);
export const participantMetadataSchema = z.record(z.string(), z.unknown()).optional();

// Drizzle table definitions
export const chatRooms = sqliteTable('chat_rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  repositoryPath: text('repositoryPath').notNull(),
  isGeneral: int('isGeneral', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  roomMetadata: text('roomMetadata', { mode: 'json' }).$type<Record<string, unknown>>(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  roomId: text('roomId').notNull(),
  agentName: text('agentName').notNull(),
  message: text('message').notNull(),
  timestamp: text('timestamp').notNull().default(sql`(current_timestamp)`),
  mentions: text('mentions', { mode: 'json' }).$type<string[]>(),
  messageType: text('messageType', { enum: ['standard', 'system', 'notification', 'alert', 'status_update', 'coordination', 'error', 'debug'] }).notNull().default('standard'),
});

export const roomParticipants = sqliteTable('room_participants', {
  id: text('id').primaryKey(),
  roomId: text('roomId').notNull(),
  agentId: text('agentId').notNull(),
  agentName: text('agentName').notNull(),
  joinedAt: text('joinedAt').notNull().default(sql`(current_timestamp)`),
  lastActive: text('lastActive').notNull().default(sql`(current_timestamp)`),
  status: text('status', { enum: ['active', 'inactive', 'left'] }).notNull().default('active'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
}, (table) => ({
  roomIdIdx: index('room_participants_room_id_idx').on(table.roomId),
  agentIdIdx: index('room_participants_agent_id_idx').on(table.agentId),
  statusIdx: index('room_participants_status_idx').on(table.status),
  roomAgentUnique: uniqueIndex('room_participants_room_agent_unique').on(table.roomId, table.agentId),
}));

// Drizzle relations
export const chatRoomsRelations = relations(chatRooms, ({ many }) => ({
  messages: many(chatMessages),
  participants: many(roomParticipants),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  room: one(chatRooms, {
    fields: [chatMessages.roomId],
    references: [chatRooms.id],
  }),
}));

export const roomParticipantsRelations = relations(roomParticipants, ({ one }) => ({
  room: one(chatRooms, {
    fields: [roomParticipants.roomId],
    references: [chatRooms.id],
  }),
}));

// drizzle-zod generated schemas
export const insertChatRoomSchema = createInsertSchema(chatRooms, {
  name: (schema) => schema.min(1).max(100),
});

export const selectChatRoomSchema = createSelectSchema(chatRooms);
export const updateChatRoomSchema = createUpdateSchema(chatRooms);

export const insertChatMessageSchema = createInsertSchema(chatMessages, {
  roomId: (schema) => schema.min(1),
  agentName: (schema) => schema.min(1).max(200),
  message: (schema) => schema.min(1).max(4000),
});

export const selectChatMessageSchema = createSelectSchema(chatMessages);

export const insertRoomParticipantSchema = createInsertSchema(roomParticipants, {
  roomId: (schema) => schema.min(1),
  agentId: (schema) => schema.min(1).max(200),
  agentName: (schema) => schema.min(1).max(200),
});

export const selectRoomParticipantSchema = createSelectSchema(roomParticipants);
export const updateRoomParticipantSchema = createUpdateSchema(roomParticipants);

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type ChatRoom = {
  id: string;
  name: string;
  description?: string;
  repositoryPath: string;
  isGeneral: boolean;
  createdAt: string;
  roomMetadata?: Record<string, unknown>;
};

export type NewChatRoom = Omit<ChatRoom, 'createdAt'> & {
  createdAt?: string;
};

export type ChatRoomUpdate = Partial<Omit<ChatRoom, 'id'>>;

export type ChatMessage = {
  id: string;
  roomId: string;
  agentName: string;
  message: string;
  timestamp: string;
  mentions?: string[];
  messageType: 'standard' | 'system' | 'notification' | 'alert' | 'status_update' | 'coordination' | 'error' | 'debug';
};

export type NewChatMessage = Omit<ChatMessage, 'timestamp'> & {
  timestamp?: string;
};

export type RoomParticipant = {
  id: string;
  roomId: string;
  agentId: string;
  agentName: string;
  joinedAt: string;
  lastActive: string;
  status: 'active' | 'inactive' | 'left';
  metadata?: Record<string, unknown>;
};

export type NewRoomParticipant = Omit<RoomParticipant, 'joinedAt' | 'lastActive'> & {
  joinedAt?: string;
  lastActive?: string;
};

export type RoomParticipantUpdate = Partial<Omit<RoomParticipant, 'id' | 'roomId' | 'agentId'>>;

export type MessageType = z.infer<typeof messageTypeSchema>;
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;

// Communication filtering and search schemas
export const messageFilterSchema = z.object({
  roomId: z.string().optional(),
  roomName: z.string().optional(), // Keep for backwards compatibility
  agentName: z.string().optional(),
  messageType: messageTypeSchema.optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  containsText: z.string().optional(),
  mentions: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export const roomJoinRequestSchema = z.object({
  roomName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  agentName: z.string().min(1).max(200),
});

export const sendMessageRequestSchema = z.object({
  roomId: z.string().min(1).optional(),
  roomName: z.string().min(1).optional(), // Keep for backwards compatibility
  agentName: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  messageType: messageTypeSchema.default('standard'),
  mentions: messageMentionsSchema,
});

export const waitForMessagesRequestSchema = z.object({
  roomId: z.string().min(1).optional(),
  roomName: z.string().min(1).optional(), // Keep for backwards compatibility
  sinceTimestamp: z.string().datetime().optional(),
  timeout: z.number().int().min(1000).max(300000).default(30000), // 30 seconds default
  agentName: z.string().optional(), // For filtering messages
});

export const participantFilterSchema = z.object({
  roomId: z.string().optional(),
  roomName: z.string().optional(), // Keep for backwards compatibility
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  status: participantStatusSchema.optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export const addParticipantRequestSchema = z.object({
  roomId: z.string().min(1).optional(),
  roomName: z.string().min(1).optional(), // Keep for backwards compatibility
  agentId: z.string().min(1).max(200),
  agentName: z.string().min(1).max(200),
  metadata: participantMetadataSchema,
});

export const updateParticipantRequestSchema = z.object({
  roomId: z.string().min(1).optional(),
  roomName: z.string().min(1).optional(), // Keep for backwards compatibility
  agentId: z.string().min(1).max(200),
  status: participantStatusSchema.optional(),
  metadata: participantMetadataSchema,
});

export type MessageFilter = z.infer<typeof messageFilterSchema>;
export type RoomJoinRequest = z.infer<typeof roomJoinRequestSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type WaitForMessagesRequest = z.infer<typeof waitForMessagesRequestSchema>;
export type ParticipantFilter = z.infer<typeof participantFilterSchema>;
export type AddParticipantRequest = z.infer<typeof addParticipantRequestSchema>;
export type UpdateParticipantRequest = z.infer<typeof updateParticipantRequestSchema>;

// =================== Cleanup and Maintenance Types ===================

export type StaleRoomInfo = {
  room: ChatRoom;
  lastActivity: string | null;
  activeParticipantCount: number;
  totalParticipantCount: number;
  messageCount: number;
  staleness: {
    noActiveParticipants: boolean;
    noRecentMessages: boolean;
    isEmpty: boolean;
    isInactive: boolean;
  };
};

export type RoomActivityStats = {
  room: ChatRoom | null;
  activeParticipants: number;
  totalParticipants: number;
  messageCount: number;
  lastMessageTime: string | null;
  lastParticipantActivity: string | null;
  lastActivity: string | null;
};

export type CleanupConfiguration = {
  agent: {
    staleMinutes: number;
    includeRoomCleanup: boolean;
    notifyParticipants: boolean;
  };
  room: {
    inactiveMinutes: number;
    deleteEmptyRooms: boolean;
    deleteNoActiveParticipants: boolean;
    deleteNoRecentMessages: boolean;
    notifyParticipants: boolean;
  };
};

export type CleanupError = {
  agentId?: string;
  roomId?: string;
  roomName?: string;
  error: string;
};

export type AgentCleanupResult = {
  totalStaleAgents: number;
  terminatedAgents: number;
  failedTerminations: number;
  roomsProcessed: number;
  roomsCleaned: number;
  errors: Array<{ agentId: string; error: string }>;
  dryRun: boolean;
  staleAgentDetails: Array<{
    agentId: string;
    agentName: string;
    agentType: string;
    repositoryPath: string;
    roomId?: string;
    lastHeartbeat: string | null;
    staleDuration: string;
  }>;
};

export type RoomCleanupResult = {
  totalStaleRooms: number;
  deletedRooms: number;
  failedDeletions: number;
  notifiedParticipants: number;
  errors: Array<{ roomId: string; roomName: string; error: string }>;
  dryRun: boolean;
  staleRoomDetails: Array<{
    roomId: string;
    roomName: string;
    repositoryPath: string;
    lastActivity: string | null;
    activeParticipants: number;
    totalParticipants: number;
    messageCount: number;
    staleness: {
      noActiveParticipants: boolean;
      noRecentMessages: boolean;
      isEmpty: boolean;
      isInactive: boolean;
    };
  }>;
};

export type ComprehensiveCleanupResult = {
  agentCleanup: AgentCleanupResult;
  roomCleanup: RoomCleanupResult;
  summary: {
    totalAgentsProcessed: number;
    totalRoomsProcessed: number;
    totalAgentsTerminated: number;
    totalRoomsDeleted: number;
    totalErrors: number;
  };
};