import { z } from 'zod';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

// Zod v4 schemas for validation
export const agentStatusSchema = z.enum([
  'active',
  'idle', 
  'completed',
  'terminated',
  'failed',
  'initializing'
]);

export const agentCapabilitiesSchema = z.array(z.string()).default([]);
export const agentMetadataSchema = z.record(z.string(), z.unknown()).optional();

// Enhanced agent type system with tool permissions
export const agentTypeSchema = z.enum([
  'architect',
  'backend_agent', 
  'frontend_agent',
  'testing_agent',
  'documentation_agent',
  'bugfix_agent',
  'planner_agent',
  'security_agent',
  'devops_agent',
  'data_agent',
  'general_agent'
]);

// Tool categories for granular permissions
export const toolCategorySchema = z.enum([
  'core_tools',           // Basic tools like Read, Write, Edit, LS, Glob, Grep
  'execution_tools',      // Bash, command execution
  'communication_tools',  // join_room, send_message, wait_for_messages
  'knowledge_graph_tools', // store_knowledge_memory, search_knowledge_graph
  'agent_tools',          // spawn_agent, list_agents, terminate_agent
  'orchestration_tools',  // orchestrate_objective, create_task
  'file_tools',           // list_files, find_files, easy_replace
  'analysis_tools',       // analyze_project_structure, analyze_file_symbols
  'browser_tools',        // browser automation and navigation
  'web_tools',            // web scraping and documentation
  'cache_tools',          // foundation caching and optimization
  'tree_tools',           // tree summary and project analysis
  'thinking_tools'        // sequential thinking and complex reasoning
]);

// Comprehensive tool permissions schema
export const toolPermissionsSchema = z.object({
  allowedTools: z.array(z.string()).optional().describe('Specific tools allowed for this agent'),
  disallowedTools: z.array(z.string()).optional().describe('Specific tools blocked for this agent'),
  allowedCategories: z.array(toolCategorySchema).optional().describe('Tool categories allowed'),
  disallowedCategories: z.array(toolCategorySchema).optional().describe('Tool categories blocked'),
  customPermissions: z.record(z.string(), z.boolean()).optional().describe('Custom tool-specific permissions')
});

// Agent type definitions with default tool permissions
export const agentTypeDefinitionsSchema = z.record(agentTypeSchema, z.object({
  description: z.string(),
  defaultCapabilities: z.array(z.string()),
  defaultAllowedCategories: z.array(toolCategorySchema),
  defaultDisallowedCategories: z.array(toolCategorySchema).optional(),
  autoCreateRoom: z.boolean().default(true),
  roomNamingPattern: z.string().default('{agentType}_{timestamp}'),
  maxConcurrentAgents: z.number().optional(),
  requiredEnvironmentVars: z.array(z.string()).optional()
}));

// Drizzle table definition
export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  agentName: text('agentName').notNull(),
  agentType: text('agentType').notNull().default('general_agent'),
  repositoryPath: text('repositoryPath').notNull(),
  status: text('status', { enum: ['active', 'idle', 'completed', 'terminated', 'failed', 'initializing'] }).notNull().default('active'),
  claudePid: integer('claudePid'),
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>().default([]),
  toolPermissions: text('toolPermissions', { mode: 'json' }).$type<Record<string, any>>(),
  roomId: text('roomId'),
  convoSessionId: text('convoSessionId'),
  additionalInstructions: text('additionalInstructions'),
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  lastHeartbeat: text('lastHeartbeat').notNull().default(sql`(current_timestamp)`),
  agentMetadata: text('agentMetadata', { mode: 'json' }).$type<Record<string, unknown>>(),
});

// Generated table validation schemas using drizzle-zod
export const insertAgentSessionSchema = createInsertSchema(agentSessions, {
  agentName: (schema) => schema.min(1).max(200),
  repositoryPath: (schema) => schema.min(1),
});

export const selectAgentSessionSchema = createSelectSchema(agentSessions);
export const updateAgentSessionSchema = createUpdateSchema(agentSessions);

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type AgentSession = {
  id: string;
  agentName: string;
  agentType: string;
  repositoryPath: string;
  status: 'active' | 'idle' | 'completed' | 'terminated' | 'failed' | 'initializing';
  claudePid?: number;
  capabilities: string[];
  toolPermissions?: Record<string, any>;
  roomId?: string;
  convoSessionId?: string;
  additionalInstructions?: string;
  createdAt: string;
  lastHeartbeat: string;
  agentMetadata?: Record<string, unknown>;
};

export type NewAgentSession = Omit<AgentSession, 'createdAt' | 'lastHeartbeat'> & {
  createdAt?: string;
  lastHeartbeat?: string;
};

export type AgentSessionUpdate = Partial<Omit<AgentSession, 'id'>>;

export type AgentStatus = z.infer<typeof agentStatusSchema>;

// Agent filtering and search schemas
export const agentFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  status: agentStatusSchema.optional(),
  agentId: z.string().optional(),
  capability: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const agentHeartbeatSchema = z.object({
  agentId: z.string().min(1),
  status: agentStatusSchema.optional(),
  metadata: agentMetadataSchema,
});

export type AgentFilter = z.infer<typeof agentFilterSchema>;
export type AgentHeartbeat = z.infer<typeof agentHeartbeatSchema>;
export type AgentType = z.infer<typeof agentTypeSchema>;
export type ToolCategory = z.infer<typeof toolCategorySchema>;
export type ToolPermissions = z.infer<typeof toolPermissionsSchema>;
export type AgentTypeDefinitions = z.infer<typeof agentTypeDefinitionsSchema>;

// Predefined agent type configurations
export const AGENT_TYPE_DEFINITIONS: AgentTypeDefinitions = {
  architect: {
    description: 'High-level coordinator that orchestrates multiple specialized agents',
    defaultCapabilities: ['ALL_TOOLS'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'agent_tools', 'orchestration_tools', 'file_tools', 'analysis_tools', 'thinking_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'architect_{timestamp}',
    maxConcurrentAgents: 1
  },
  backend_agent: {
    description: 'Specialized in backend development, APIs, databases, and server-side logic',
    defaultCapabilities: ['backend_development', 'api_design', 'database_operations'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'analysis_tools'],
    defaultDisallowedCategories: ['browser_tools', 'web_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'backend_{timestamp}'
  },
  frontend_agent: {
    description: 'Specialized in frontend development, UI/UX, and client-side applications',
    defaultCapabilities: ['frontend_development', 'ui_design', 'client_side_logic'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'analysis_tools', 'browser_tools'],
    defaultDisallowedCategories: ['web_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'frontend_{timestamp}'
  },
  testing_agent: {
    description: 'Focused on testing, quality assurance, and test automation',
    defaultCapabilities: ['test_automation', 'quality_assurance', 'test_design'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'browser_tools'],
    defaultDisallowedCategories: ['agent_tools', 'orchestration_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'testing_{timestamp}'
  },
  documentation_agent: {
    description: 'Specialized in creating, updating, and maintaining documentation',
    defaultCapabilities: ['documentation_writing', 'content_creation', 'research'],
    defaultAllowedCategories: ['core_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'analysis_tools', 'web_tools'],
    defaultDisallowedCategories: ['execution_tools', 'agent_tools', 'orchestration_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'docs_{timestamp}'
  },
  bugfix_agent: {
    description: 'Focused on identifying, analyzing, and fixing bugs and issues',
    defaultCapabilities: ['debugging', 'error_analysis', 'issue_resolution'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'analysis_tools'],
    defaultDisallowedCategories: ['agent_tools', 'orchestration_tools', 'browser_tools', 'web_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'bugfix_{timestamp}'
  },
  planner_agent: {
    description: 'Strategic planning, task breakdown, and project coordination',
    defaultCapabilities: ['project_planning', 'task_management', 'coordination'],
    defaultAllowedCategories: ['core_tools', 'communication_tools', 'knowledge_graph_tools', 'orchestration_tools', 'analysis_tools', 'thinking_tools', 'file_tools'],
    defaultDisallowedCategories: ['execution_tools', 'browser_tools', 'web_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'planner_{timestamp}'
  },
  security_agent: {
    description: 'Security analysis, vulnerability assessment, and security implementation',
    defaultCapabilities: ['security_analysis', 'vulnerability_assessment', 'security_implementation'],
    defaultAllowedCategories: ['core_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'analysis_tools'],
    defaultDisallowedCategories: ['execution_tools', 'agent_tools', 'orchestration_tools', 'browser_tools', 'web_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'security_{timestamp}'
  },
  devops_agent: {
    description: 'DevOps, infrastructure, deployment, and system administration',
    defaultCapabilities: ['infrastructure_management', 'deployment', 'system_administration'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools'],
    defaultDisallowedCategories: ['agent_tools', 'orchestration_tools', 'browser_tools', 'web_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'devops_{timestamp}'
  },
  data_agent: {
    description: 'Data analysis, processing, and data science tasks',
    defaultCapabilities: ['data_analysis', 'data_processing', 'data_science'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'analysis_tools'],
    defaultDisallowedCategories: ['agent_tools', 'orchestration_tools', 'browser_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'data_{timestamp}'
  },
  general_agent: {
    description: 'General purpose agent with balanced capabilities',
    defaultCapabilities: ['general_development', 'problem_solving'],
    defaultAllowedCategories: ['core_tools', 'execution_tools', 'communication_tools', 'knowledge_graph_tools', 'file_tools', 'analysis_tools', 'thinking_tools'],
    defaultDisallowedCategories: ['agent_tools', 'orchestration_tools'],
    autoCreateRoom: true,
    roomNamingPattern: 'general_{timestamp}'
  }
};

// Tool category mappings for permission enforcement
export const TOOL_CATEGORY_MAPPINGS: Record<ToolCategory, string[]> = {
  core_tools: ['Read', 'Write', 'Edit', 'MultiEdit', 'LS', 'Glob', 'Grep'],
  execution_tools: ['Bash', 'Task'],
  communication_tools: ['mcp__claude-mcp-tools__join_room', 'mcp__claude-mcp-tools__send_message', 'mcp__claude-mcp-tools__wait_for_messages'],
  knowledge_graph_tools: ['mcp__claude-mcp-tools__store_knowledge_memory', 'mcp__claude-mcp-tools__search_knowledge_graph'],
  agent_tools: ['mcp__claude-mcp-tools__spawn_agent', 'mcp__claude-mcp-tools__list_agents', 'mcp__claude-mcp-tools__terminate_agent'],
  orchestration_tools: ['mcp__claude-mcp-tools__orchestrate_objective', 'mcp__claude-mcp-tools__create_task'],
  file_tools: ['mcp__claude-mcp-tools__list_files', 'mcp__claude-mcp-tools__find_files', 'mcp__claude-mcp-tools__easy_replace'],
  analysis_tools: ['mcp__claude-mcp-tools__analyze_project_structure', 'mcp__claude-mcp-tools__generate_project_summary', 'mcp__claude-mcp-tools__analyze_file_symbols'],
  browser_tools: ['mcp__claude-mcp-tools__create_browser_session', 'mcp__claude-mcp-tools__navigate_and_scrape', 'mcp__claude-mcp-tools__interact_with_page', 'mcp__claude-mcp-tools__manage_browser_sessions'],
  web_tools: ['mcp__claude-mcp-tools__scrape_documentation', 'mcp__claude-mcp-tools__get_scraping_status', 'mcp__claude-mcp-tools__start_scraping_worker', 'mcp__claude-mcp-tools__stop_scraping_worker'],
  cache_tools: ['mcp__claude-mcp-tools__create_foundation_session', 'mcp__claude-mcp-tools__derive_session_from_foundation', 'mcp__claude-mcp-tools__get_cached_analysis', 'mcp__claude-mcp-tools__cache_analysis_result'],
  tree_tools: ['mcp__claude-mcp-tools__update_file_analysis', 'mcp__claude-mcp-tools__get_project_overview', 'mcp__claude-mcp-tools__cleanup_stale_analyses'],
  thinking_tools: ['mcp__sequential-thinking__sequential_thinking']
};