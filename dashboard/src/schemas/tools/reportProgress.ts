/**
 * Report Progress Tool Schemas
 * Centralized schema definitions for the progress reporting tool
 */

import { z } from 'zod';
import { type TaskStatus, type AgentStatus, agentStatusSchema } from '../index.js';

// ===============================================
// Progress Report Internal Schema with Metadata
// ===============================================

/**
 * Progress report metadata schema
 * Contains additional context and status information for internal processing
 */
export const ProgressReportMetadataSchema = z.object({
  taskId: z.string().optional().describe("Associated task ID for linking progress to specific tasks"),
  previousStatus: z.union([
    z.string(), 
    agentStatusSchema,
  ]).optional().describe("Previous status before update, used for tracking agent state transitions"),
  newStatus: z.union([
    z.string(), 
    agentStatusSchema
  ]).optional().describe("New status after update, used for tracking agent state transitions"),
  progressPercentage: z.number().min(0).max(100).optional().describe("Progress percentage (0-100) for task completion tracking"),
  results: z.record(z.string(), z.any()).optional().describe("Task results or metadata as key-value pairs containing task outcomes"),
  error: z.string().optional().describe("Error message if reporting an error, used for debugging and failure analysis"),
  timestamp: z.string().optional().describe("ISO timestamp of when the progress report was created"),
  roomId: z.string().optional().describe("Room ID for broadcasting progress updates to coordinated agent rooms")
});

/**
 * Internal progress report schema with nested metadata
 * Used internally for structured progress tracking and processing
 * This schema is created by transforming the flattened input schema
 */
export const ProgressReportInternalSchema = z.object({
  agentId: z.string().describe("ID of the agent reporting progress, must be a valid agent ID in the system"),
  repositoryPath: z.string().describe("Path to the repository or project directory, resolved to absolute path during processing"),
  progressType: z.enum(['status', 'task', 'milestone', 'error', 'completion']).describe("Type of progress being reported: 'status' for agent status updates, 'task' for task progress, 'milestone' for achievements, 'error' for failures, 'completion' for task completion"),
  message: z.string().describe("Human-readable progress message describing what the agent is doing or has accomplished"),
  metadata: ProgressReportMetadataSchema.optional().describe("Additional progress metadata containing task details, status changes, results, and context")
});

// ===============================================
// Response Schema Extensions
// ===============================================

/**
 * Progress report response data schema
 * Extends the base response with progress-specific fields
 */
export const ProgressReportResponseDataSchema = z.object({
  progress_id: z.string().optional().describe("Unique progress report ID generated from agent ID and timestamp"),
  agent_id: z.string().describe("Agent ID that reported progress, confirms which agent submitted the report"),
  progress_type: z.string().describe("Type of progress reported (status, task, milestone, error, completion)"),
  progress_percentage: z.number().optional().describe("Progress percentage (0-100) if applicable, validated and capped"),
  room_broadcast: z.boolean().optional().describe("Whether progress was broadcast to the agent's assigned room"),
  task_id: z.string().optional().describe("Associated task ID if the progress was related to a specific task")
});

// ===============================================
// Type Exports
// ===============================================

export type ProgressReportMetadata = z.infer<typeof ProgressReportMetadataSchema>;
export type ProgressReportInternal = z.infer<typeof ProgressReportInternalSchema>;
export type ProgressReportResponseData = z.infer<typeof ProgressReportResponseDataSchema>;