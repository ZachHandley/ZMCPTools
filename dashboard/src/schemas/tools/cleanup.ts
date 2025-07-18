import { z } from 'zod';

// =================== Cleanup Tool Schemas ===================

export const CleanupStaleAgentsSchema = z.object({
  staleMinutes: z.number().int().min(1).max(1440).default(30).describe('Minutes after which agents are considered stale (1-1440)'),
  dryRun: z.boolean().default(true).describe('Perform a dry run without actually cleaning up'),
  includeRoomCleanup: z.boolean().default(true).describe('Include room cleanup when cleaning up agents'),
  notifyParticipants: z.boolean().default(true).describe('Notify room participants before cleanup')
});

export const CleanupStaleRoomsSchema = z.object({
  inactiveMinutes: z.number().int().min(1).max(2880).default(60).describe('Minutes after which rooms are considered inactive (1-2880)'),
  dryRun: z.boolean().default(true).describe('Perform a dry run without actually cleaning up'),
  notifyParticipants: z.boolean().default(true).describe('Notify participants before room deletion'),
  deleteEmptyRooms: z.boolean().default(true).describe('Delete completely empty rooms (no messages, no participants)'),
  deleteNoActiveParticipants: z.boolean().default(true).describe('Delete rooms with no active participants'),
  deleteNoRecentMessages: z.boolean().default(true).describe('Delete rooms with no recent messages')
});

export const ComprehensiveCleanupSchema = z.object({
  dryRun: z.boolean().default(true).describe('Perform a dry run without actually cleaning up'),
  agentStaleMinutes: z.number().int().min(1).max(1440).default(30).describe('Minutes after which agents are considered stale'),
  roomInactiveMinutes: z.number().int().min(1).max(2880).default(60).describe('Minutes after which rooms are considered inactive'),
  notifyParticipants: z.boolean().default(true).describe('Notify participants before cleanup')
});

export const GetCleanupConfigurationSchema = z.object({
  // No input parameters - just returns current configuration
});

// =================== Response Schemas ===================

export const StaleAgentDetailSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  agentType: z.string(),
  repositoryPath: z.string(),
  roomId: z.string().optional(),
  lastHeartbeat: z.string().nullable(),
  staleDuration: z.string()
});

export const StaleRoomDetailSchema = z.object({
  roomId: z.string(),
  roomName: z.string(),
  repositoryPath: z.string(),
  lastActivity: z.string().nullable(),
  activeParticipants: z.number(),
  totalParticipants: z.number(),
  messageCount: z.number(),
  staleness: z.object({
    noActiveParticipants: z.boolean(),
    noRecentMessages: z.boolean(),
    isEmpty: z.boolean(),
    isInactive: z.boolean()
  })
});

export const CleanupErrorSchema = z.object({
  agentId: z.string().optional(),
  roomId: z.string().optional(),
  roomName: z.string().optional(),
  error: z.string()
});

export const AgentCleanupResultSchema = z.object({
  totalStaleAgents: z.number(),
  terminatedAgents: z.number(),
  failedTerminations: z.number(),
  roomsProcessed: z.number(),
  roomsCleaned: z.number(),
  dryRun: z.boolean(),
  errorCount: z.number(),
  staleAgentDetails: z.array(StaleAgentDetailSchema),
  errors: z.array(CleanupErrorSchema)
});

export const RoomCleanupResultSchema = z.object({
  totalStaleRooms: z.number(),
  deletedRooms: z.number(),
  failedDeletions: z.number(),
  notifiedParticipants: z.number(),
  dryRun: z.boolean(),
  errorCount: z.number(),
  staleRoomDetails: z.array(StaleRoomDetailSchema),
  errors: z.array(CleanupErrorSchema)
});

export const ComprehensiveCleanupSummarySchema = z.object({
  totalAgentsProcessed: z.number(),
  totalRoomsProcessed: z.number(),
  totalAgentsTerminated: z.number(),
  totalRoomsDeleted: z.number(),
  totalErrors: z.number()
});

export const ComprehensiveCleanupResultSchema = z.object({
  agentCleanup: AgentCleanupResultSchema,
  roomCleanup: RoomCleanupResultSchema,
  summary: ComprehensiveCleanupSummarySchema,
  dryRun: z.boolean()
});

export const CleanupConfigurationSchema = z.object({
  agents: z.object({
    staleMinutes: z.number(),
    includeRoomCleanup: z.boolean(),
    notifyParticipants: z.boolean(),
    maxBatchSize: z.number(),
    gracePeriodMinutes: z.number()
  }),
  rooms: z.object({
    inactiveMinutes: z.number(),
    deleteNoActiveParticipants: z.boolean(),
    deleteNoRecentMessages: z.boolean(),
    deleteEmptyRooms: z.boolean(),
    notifyParticipants: z.boolean(),
    maxBatchSize: z.number(),
    gracePeriodMinutes: z.number(),
    preserveGeneralRooms: z.boolean()
  }),
  general: z.object({
    defaultDryRun: z.boolean(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
    enableDetailedLogging: z.boolean(),
    timeoutMs: z.number()
  })
});

export const GetCleanupConfigurationResultSchema = z.object({
  configuration: CleanupConfigurationSchema,
  environment: z.string()
});

// =================== Response Type Exports ===================

export type CleanupStaleAgentsInput = z.infer<typeof CleanupStaleAgentsSchema>;
export type CleanupStaleRoomsInput = z.infer<typeof CleanupStaleRoomsSchema>;
export type ComprehensiveCleanupInput = z.infer<typeof ComprehensiveCleanupSchema>;
export type GetCleanupConfigurationInput = z.infer<typeof GetCleanupConfigurationSchema>;

export type StaleAgentDetail = z.infer<typeof StaleAgentDetailSchema>;
export type StaleRoomDetail = z.infer<typeof StaleRoomDetailSchema>;
export type CleanupError = z.infer<typeof CleanupErrorSchema>;
export type AgentCleanupResult = z.infer<typeof AgentCleanupResultSchema>;
export type RoomCleanupResult = z.infer<typeof RoomCleanupResultSchema>;
export type ComprehensiveCleanupResult = z.infer<typeof ComprehensiveCleanupResultSchema>;
export type CleanupConfiguration = z.infer<typeof CleanupConfigurationSchema>;
export type GetCleanupConfigurationResult = z.infer<typeof GetCleanupConfigurationResultSchema>;

// Cleanup tool response schemas (following the pattern)
export const CleanupStaleAgentsResponseSchema = AgentCleanupResultSchema;
export const CleanupStaleRoomsResponseSchema = RoomCleanupResultSchema;
export const ComprehensiveCleanupResponseSchema = ComprehensiveCleanupResultSchema;
export const GetCleanupConfigurationResponseSchema = GetCleanupConfigurationResultSchema;

export type CleanupStaleAgentsResponse = z.infer<typeof CleanupStaleAgentsResponseSchema>;
export type CleanupStaleRoomsResponse = z.infer<typeof CleanupStaleRoomsResponseSchema>;
export type ComprehensiveCleanupResponse = z.infer<typeof ComprehensiveCleanupResponseSchema>;
export type GetCleanupConfigurationResponse = z.infer<typeof GetCleanupConfigurationResponseSchema>;