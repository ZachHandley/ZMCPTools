import { z } from 'zod';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

// Zod v4 schemas for validation
export const projectStatusSchema = z.enum([
  'active',
  'inactive',
  'connected',
  'disconnected',
  'error'
]);

export const mcpServerTypeSchema = z.enum([
  'claude-mcp-tools',
  'builtin',
  'custom',
  'external'
]);

export const projectMetadataSchema = z.record(z.string(), z.unknown()).optional();

// Project table for tracking active MCP servers and Claude sessions
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repositoryPath: text('repository_path').notNull(),
  
  // MCP Server information
  mcpServerType: text('mcp_server_type').$type<z.infer<typeof mcpServerTypeSchema>>().notNull().default('claude-mcp-tools'),
  mcpServerPid: integer('mcp_server_pid'),
  mcpServerPort: integer('mcp_server_port'),
  mcpServerHost: text('mcp_server_host').default('localhost'),
  
  // Session information
  claudeSessionId: text('claude_session_id'), // UUID for Claude Code session
  foundationSessionId: text('foundation_session_id'), // Foundation caching session
  
  // Status and lifecycle
  status: text('status').$type<z.infer<typeof projectStatusSchema>>().notNull().default('active'),
  startTime: text('start_time').notNull().default(sql`(current_timestamp)`),
  lastHeartbeat: text('last_heartbeat').default(sql`(current_timestamp)`),
  endTime: text('end_time'),
  
  // Metadata and configuration
  projectMetadata: text('project_metadata').default('{}'),
  
  // Web UI configuration
  webUiEnabled: integer('web_ui_enabled', { mode: 'boolean' }).default(false),
  webUiPort: integer('web_ui_port'),
  webUiHost: text('web_ui_host').default('localhost'),
  
  // Tracking
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`)
});

// Auto-generated schemas using drizzle-zod
export const insertProjectSchema = createInsertSchema(projects, {
  name: (schema) => schema.min(1).max(200),
  repositoryPath: (schema) => schema.min(1).max(1000),
});

export const selectProjectSchema = createSelectSchema(projects);
export const updateProjectSchema = createUpdateSchema(projects);

// Request/response schemas for API
export const projectRegistrationSchema = z.object({
  name: z.string().min(1).max(200),
  repositoryPath: z.string().min(1).max(1000),
  mcpServerType: mcpServerTypeSchema.optional().default('claude-mcp-tools'),
  mcpServerPid: z.number().int().positive().optional(),
  mcpServerPort: z.number().int().min(1000).max(65535).optional(),
  mcpServerHost: z.string().min(1).max(255).optional().default('localhost'),
  claudeSessionId: z.string().uuid().optional(),
  foundationSessionId: z.string().optional(),
  webUiEnabled: z.boolean().optional().default(false),
  webUiPort: z.number().int().min(1000).max(65535).optional(),
  webUiHost: z.string().min(1).max(255).optional().default('localhost'),
  projectMetadata: projectMetadataSchema
});

export const projectHeartbeatSchema = z.object({
  projectId: z.string().min(1),
  status: projectStatusSchema.optional(),
  metadata: projectMetadataSchema
});

export const projectFilterSchema = z.object({
  status: projectStatusSchema.optional(),
  mcpServerType: mcpServerTypeSchema.optional(),
  webUiEnabled: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(50),
  offset: z.number().int().min(0).optional().default(0)
});

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type Project = {
  id: string;
  name: string;
  repositoryPath: string;
  mcpServerType: 'claude-mcp-tools' | 'builtin' | 'custom' | 'external';
  mcpServerPid?: number;
  mcpServerPort?: number;
  mcpServerHost?: string;
  claudeSessionId?: string;
  foundationSessionId?: string;
  status: 'active' | 'inactive' | 'connected' | 'disconnected' | 'error';
  startTime: string;
  lastHeartbeat?: string;
  endTime?: string;
  projectMetadata?: Record<string, unknown>;
  webUiEnabled?: boolean;
  webUiPort?: number;
  webUiHost?: string;
  createdAt: string;
  updatedAt: string;
};

export type NewProject = Omit<Project, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectUpdate = Partial<Omit<Project, 'id'>>;

export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type McpServerType = z.infer<typeof mcpServerTypeSchema>;

// Filter and search types
export type ProjectRegistration = z.infer<typeof projectRegistrationSchema>;
export type ProjectHeartbeat = z.infer<typeof projectHeartbeatSchema>;
export type ProjectFilter = z.infer<typeof projectFilterSchema>;