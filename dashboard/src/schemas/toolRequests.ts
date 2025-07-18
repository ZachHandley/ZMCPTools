/**
 * Tool Request Schemas
 * Centralized input schema definitions for all MCP tools
 * These schemas are used for validation and type inference across the codebase
 */

import { z } from 'zod';
import type { TaskType, AgentStatus, MessageType, EntityType, RelationshipType } from './index.js';

// ===============================================
// Progress Report Tool Request Schemas
// ===============================================

export const ReportProgressSchema = z.object({
  agentId: z.string().describe("ID of the agent reporting progress. Must be a valid agent ID that exists in the system."),
  repositoryPath: z.string().describe("Path to the repository or project directory. Can be relative (e.g., '.') or absolute path."),
  progressType: z.enum(['status', 'task', 'milestone', 'error', 'completion']).describe("Type of progress being reported: 'status' for general agent status updates, 'task' for task-specific progress, 'milestone' for significant achievements, 'error' for reporting errors/failures, 'completion' for task completion."),
  message: z.string().describe("Human-readable progress message describing what the agent is doing or has accomplished. This message will be displayed in logs and can be broadcast to rooms."),
  taskId: z.string().optional().describe("Optional ID of the specific task being reported on. Required when progressType is 'task', 'error', or 'completion'. Used to update task status and progress."),
  progressPercentage: z.number().optional().describe("Optional progress percentage (0-100) for task completion. Used with progressType 'task' to track completion progress. Will be validated and capped to 0-100 range."),
  results: z.record(z.string(), z.string()).optional().describe("Optional key-value pairs of task results or metadata. Used with progressType 'completion' to store task outcomes and artifacts."),
  error: z.string().optional().describe("Optional error message when progressType is 'error'. Provides detailed error information for debugging and failure analysis."),
  roomId: z.string().optional().describe("Optional room ID to broadcast progress to. If not provided, will use the agent's assigned room from metadata."),
  broadcastToRoom: z.boolean().optional().describe("Whether to broadcast this progress update to the agent's assigned room. Defaults to true. Set to false for internal progress tracking only.")
});

// ===============================================
// TreeSummary Tool Request Schemas
// ===============================================

export const UpdateFileAnalysisSchema = z.object({
  filePath: z.string(),
  analysisData: z.object({
    filePath: z.string(),
    hash: z.string(),
    lastModified: z.string(),
    symbols: z.array(z.object({
      name: z.string(),
      type: z.enum(['function', 'class', 'variable', 'interface', 'type', 'enum']),
      line: z.number(),
      column: z.number(),
      accessibility: z.enum(['public', 'private', 'protected']).optional(),
      isExported: z.boolean()
    })),
    imports: z.array(z.string()),
    exports: z.array(z.string()),
    size: z.number(),
    language: z.string()
  })
});

export const RemoveFileAnalysisSchema = z.object({
  filePath: z.string()
});

export const UpdateProjectMetadataSchema = z.object({
  projectPath: z.string().optional()
});

export const GetProjectOverviewSchema = z.object({
  projectPath: z.string().optional()
});

export const CleanupStaleAnalysesSchema = z.object({
  projectPath: z.string().optional(),
  maxAgeDays: z.number().min(1).max(365).optional().default(30)
});

// ===============================================
// Analysis Tool Request Schemas
// ===============================================

export const AnalyzeProjectStructureSchema = z.object({
  project_path: z.string().default('.'),
  include_patterns: z.array(z.string()).default(['**/*']),
  exclude_patterns: z.array(z.string()).default(['node_modules/**', '.git/**', 'dist/**', 'build/**']),
  max_depth: z.number().default(10),
  generate_summary: z.boolean().default(true)
});

export const GenerateProjectSummarySchema = z.object({
  project_path: z.string().default('.'),
  include_readme: z.boolean().default(true),
  include_package_info: z.boolean().default(true),
  include_git_info: z.boolean().default(true),
  output_path: z.string().optional()
});

export const AnalyzeFileSymbolsSchema = z.object({
  file_path: z.string(),
  symbol_types: z.array(z.enum(['functions', 'classes', 'interfaces', 'types', 'variables', 'imports'])).default(['functions', 'classes'])
});

export const ListFilesSchema = z.object({
  directory: z.string().default('.'),
  recursive: z.boolean().default(false),
  include_patterns: z.array(z.string()).default(['*']),
  exclude_patterns: z.array(z.string()).default([])
});

export const FindFilesSchema = z.object({
  pattern: z.string(),
  directory: z.string().default('.'),
  case_sensitive: z.boolean().default(false),
  include_content: z.boolean().default(false)
});

export const EasyReplaceSchema = z.object({
  file_path: z.string(),
  old_text: z.string(),
  new_text: z.string(),
  fuzzy_match: z.boolean().default(true),
  backup: z.boolean().default(true)
});

export const CleanupOrphanedProjectsSchema = z.object({
  base_path: z.string().default(process.env.HOME || '.'),
  days_threshold: z.number().default(30),
  dry_run: z.boolean().default(true)
});

// ===============================================
// Export all schemas with types
// ===============================================

// Progress Types
export type ReportProgressInput = z.infer<typeof ReportProgressSchema>;

// TreeSummary Types
export type UpdateFileAnalysisInput = z.infer<typeof UpdateFileAnalysisSchema>;
export type RemoveFileAnalysisInput = z.infer<typeof RemoveFileAnalysisSchema>;
export type UpdateProjectMetadataInput = z.infer<typeof UpdateProjectMetadataSchema>;
export type GetProjectOverviewInput = z.infer<typeof GetProjectOverviewSchema>;
export type CleanupStaleAnalysesInput = z.infer<typeof CleanupStaleAnalysesSchema>;

