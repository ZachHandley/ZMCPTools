import { z } from 'zod';
import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { agentSessions } from './agents';
import { tasks } from './tasks';

// Zod v4 schemas for validation
export const errorTypeSchema = z.enum([
  'runtime',
  'compilation',
  'network',
  'filesystem',
  'authentication',
  'permission',
  'validation',
  'configuration',
  'dependency',
  'timeout',
  'memory',
  'system'
]);

export const errorCategorySchema = z.enum([
  'mcp_tool',
  'agent_spawn',
  'task_execution',
  'web_scraping',
  'database',
  'communication',
  'file_operation',
  'external_service',
  'user_input',
  'system_resource'
]);

export const resolutionStatusSchema = z.enum([
  'unresolved',
  'in_progress',
  'resolved',
  'workaround',
  'ignored',
  'duplicate'
]);

export const severitySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical'
]);

export const toolCallStatusSchema = z.enum([
  'success',
  'error',
  'timeout',
  'cancelled',
  'retried'
]);

// Schema validation helpers
export const errorContextSchema = z.record(z.string(), z.unknown()).optional();
export const errorEnvironmentSchema = z.record(z.string(), z.unknown()).optional();
export const toolParametersSchema = z.record(z.string(), z.unknown()).optional();
export const toolResultSchema = z.record(z.string(), z.unknown()).optional();

// Drizzle table definitions
export const errorLogs = sqliteTable('error_logs', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  agentId: text('agentId'),
  taskId: text('taskId'),
  errorType: text('errorType', { enum: ['runtime', 'compilation', 'network', 'filesystem', 'authentication', 'permission', 'validation', 'configuration', 'dependency', 'timeout', 'memory', 'system'] }).notNull(),
  errorCategory: text('errorCategory', { enum: ['mcp_tool', 'agent_spawn', 'task_execution', 'web_scraping', 'database', 'communication', 'file_operation', 'external_service', 'user_input', 'system_resource'] }).notNull(),
  errorMessage: text('errorMessage').notNull(),
  errorDetails: text('errorDetails'),
  context: text('context', { mode: 'json' }).$type<Record<string, unknown>>(),
  environment: text('environment', { mode: 'json' }).$type<Record<string, unknown>>(),
  attemptedSolution: text('attemptedSolution'),
  resolutionStatus: text('resolutionStatus', { enum: ['unresolved', 'in_progress', 'resolved', 'workaround', 'ignored', 'duplicate'] }).notNull().default('unresolved'),
  resolutionDetails: text('resolutionDetails'),
  patternId: text('patternId'),
  severity: text('severity', { enum: ['low', 'medium', 'high', 'critical'] }).notNull().default('medium'),
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  resolvedAt: text('resolvedAt'), // ISO datetime string
});

export const toolCallLogs = sqliteTable('tool_call_logs', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  agentId: text('agentId').notNull(),
  taskId: text('taskId'),
  toolName: text('toolName').notNull(),
  parameters: text('parameters', { mode: 'json' }).$type<Record<string, unknown>>(),
  result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
  status: text('status', { enum: ['success', 'error', 'timeout', 'cancelled', 'retried'] }).notNull(),
  executionTime: real('executionTime'), // seconds
  errorMessage: text('errorMessage'),
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
});

// Drizzle relations
export const errorLogsRelations = relations(errorLogs, ({ one }) => ({
  agent: one(agentSessions, {
    fields: [errorLogs.agentId],
    references: [agentSessions.id],
  }),
  task: one(tasks, {
    fields: [errorLogs.taskId],
    references: [tasks.id],
  }),
}));

export const toolCallLogsRelations = relations(toolCallLogs, ({ one }) => ({
  agent: one(agentSessions, {
    fields: [toolCallLogs.agentId],
    references: [agentSessions.id],
  }),
  task: one(tasks, {
    fields: [toolCallLogs.taskId],
    references: [tasks.id],
  }),
}));

// drizzle-zod generated schemas for database operations
export const insertErrorLogSchema = createInsertSchema(errorLogs, {
  repositoryPath: (schema) => schema.min(1),
  errorMessage: (schema) => schema.min(1).max(8192),
});

export const selectErrorLogSchema = createSelectSchema(errorLogs);
export const updateErrorLogSchema = createUpdateSchema(errorLogs);

export const insertToolCallLogSchema = createInsertSchema(toolCallLogs, {
  repositoryPath: (schema) => schema.min(1),
  agentId: (schema) => schema.min(1),
  toolName: (schema) => schema.min(1).max(200),
});

export const selectToolCallLogSchema = createSelectSchema(toolCallLogs);
export const updateToolCallLogSchema = createUpdateSchema(toolCallLogs);

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type ErrorLog = {
  id: string;
  repositoryPath: string;
  agentId?: string;
  taskId?: string;
  errorType: 'runtime' | 'compilation' | 'network' | 'filesystem' | 'authentication' | 'permission' | 'validation' | 'configuration' | 'dependency' | 'timeout' | 'memory' | 'system';
  errorCategory: 'mcp_tool' | 'agent_spawn' | 'task_execution' | 'web_scraping' | 'database' | 'communication' | 'file_operation' | 'external_service' | 'user_input' | 'system_resource';
  errorMessage: string;
  errorDetails?: string;
  context?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  attemptedSolution?: string;
  resolutionStatus: 'unresolved' | 'in_progress' | 'resolved' | 'workaround' | 'ignored' | 'duplicate';
  resolutionDetails?: string;
  patternId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  resolvedAt?: string;
};

export type NewErrorLog = Omit<ErrorLog, 'createdAt'> & {
  createdAt?: string;
};

export type ErrorLogUpdate = Partial<Omit<ErrorLog, 'id'>>;

export type ToolCallLog = {
  id: string;
  repositoryPath: string;
  agentId: string;
  taskId?: string;
  toolName: string;
  parameters?: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: 'success' | 'error' | 'timeout' | 'cancelled' | 'retried';
  executionTime?: number;
  errorMessage?: string;
  createdAt: string;
};

export type NewToolCallLog = Omit<ToolCallLog, 'createdAt'> & {
  createdAt?: string;
};

export type ToolCallLogUpdate = Partial<Omit<ToolCallLog, 'id'>>;

export type ErrorType = z.infer<typeof errorTypeSchema>;
export type ErrorCategory = z.infer<typeof errorCategorySchema>;
export type ResolutionStatus = z.infer<typeof resolutionStatusSchema>;
export type Severity = z.infer<typeof severitySchema>;
export type ToolCallStatus = z.infer<typeof toolCallStatusSchema>;

// Filtering and search schemas
export const errorLogFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  errorType: errorTypeSchema.optional(),
  errorCategory: errorCategorySchema.optional(),
  resolutionStatus: resolutionStatusSchema.optional(),
  severity: severitySchema.optional(),
  patternId: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  resolvedAfter: z.string().datetime().optional(),
  resolvedBefore: z.string().datetime().optional(),
  searchText: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export const toolCallLogFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  toolName: z.string().optional(),
  status: toolCallStatusSchema.optional(),
  minExecutionTime: z.number().min(0).optional(),
  maxExecutionTime: z.number().min(0).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export const logErrorRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  errorType: errorTypeSchema,
  errorCategory: errorCategorySchema,
  errorMessage: z.string().min(1).max(8192),
  errorDetails: z.string().max(10000).optional(),
  context: errorContextSchema,
  environment: errorEnvironmentSchema,
  attemptedSolution: z.string().max(8192).optional(),
  severity: severitySchema.default('medium'),
});

export const logToolCallRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  agentId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  toolName: z.string().min(1).max(200),
  parameters: toolParametersSchema,
  result: toolResultSchema,
  status: toolCallStatusSchema,
  executionTime: z.number().min(0).optional(),
  errorMessage: z.string().max(8192).optional(),
});

export type ErrorLogFilter = z.infer<typeof errorLogFilterSchema>;
export type ToolCallLogFilter = z.infer<typeof toolCallLogFilterSchema>;
export type LogErrorRequest = z.infer<typeof logErrorRequestSchema>;
export type LogToolCallRequest = z.infer<typeof logToolCallRequestSchema>;