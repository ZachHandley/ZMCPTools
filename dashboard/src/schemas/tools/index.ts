/**
 * Comprehensive McpTool typedef based on analysis of all MCP tool files
 * 
 * This interface standardizes tool definitions across the ZMCPTools project
 * and provides type safety for MCP tool registration and handling.
 */

import type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { JsonSchema7Type as JsonSchema } from "zod-to-json-schema";

/**
 * Progress context for MCP-compliant progress notifications
 */
export interface McpProgressContext {
  progressToken: string;
  sendNotification: (notification: {
    method: "notifications/progress";
    params: {
      progress: number;
      total: number;
      progressToken: string;
    };
  }) => Promise<void>;
}

/**
 * Enhanced input type that includes optional progress context
 */
export type McpToolInput<T = any> = T & {
  progressContext?: McpProgressContext;
};

/**
 * Handler function signature for MCP tools
 * Based on patterns found in all tool implementations
 * Now supports optional progress context for MCP-compliant progress reporting
 */
export type McpToolHandler<TInput = any, TOutput = any> = (
  args: McpToolInput<TInput>
) => Promise<TOutput>;

/**
 * Core McpTool interface combining all patterns found in the codebase
 * 
 * Analyzed patterns from:
 * - AgentOrchestrationTools: Complex multi-agent coordination with various response types
 * - AnalysisMcpTools: File and project analysis with structured responses  
 * - BrowserTools: Browser automation with session management
 * - ReportProgressTool: Progress reporting with EventBus integration
 * - TreeSummaryTools: Project metadata and file analysis caching
 * - WebScrapingMcpTools: Documentation scraping with job management
 * - KnowledgeGraphTools: Entity and relationship management
 */
export interface McpTool<TInput = any, TOutput = any> {
  /**
   * Tool name - must be unique across all registered tools
   * Used for programmatic identification and routing
   */
  name: string;

  /**
   * Human-readable description of what the tool does
   * Should be clear and comprehensive for users
   */
  description: string;

  /**
   * JSON Schema for input validation
   * Generated from Zod schemas using zodToJsonSchema
   */
  inputSchema: JsonSchema;

  /**
   * JSON Schema for output structure
   * Generated from Zod schemas using zodToJsonSchema
   * Optional but recommended for type safety
   */
  outputSchema?: JsonSchema;

  /**
   * Tool handler function
   * Async function that processes input and returns output
   */
  handler: McpToolHandler<TInput, TOutput>;

  /**
   * Optional tool annotations (hints)
   * Provides metadata about tool behavior
   */
  annotations?: ToolAnnotations;
}

/**
 * Extended McpTool interface for tools that need additional metadata
 * Some tools in the codebase have custom properties for routing
 */
export interface ExtendedMcpTool<TInput = any, TOutput = any> extends McpTool<TInput, TOutput> {
  /** 
   * Optional category for grouping related tools
   * Used for organization and routing in complex tool suites
   */
  category?: string;
  
  /** 
   * Optional version for tool evolution
   * Allows for backwards compatibility and migration
   */
  version?: string;
  
  /** 
   * Optional dependencies
   * Other tools or services this tool requires
   */
  dependencies?: string[];
  
  /** 
   * Optional metadata for tool-specific configuration
   * Flexible object for tool-specific properties
   */
  metadata?: Record<string, any>;
}

/**
 * Tool collection interface for tool management classes
 * Based on the pattern used across all tool classes
 */
export interface McpToolCollection {
  /**
   * Get all tools provided by this collection
   * Returns array of tool definitions for registration
   */
  getTools(): McpTool[];
  
  /**
   * Handle tool calls with routing to specific implementations
   * Standard interface across all tool classes
   */
  handleToolCall(name: string, args: any): Promise<any>;
}

/**
 * Tool registration helper for MCP server
 * Simplifies tool registration with proper type safety
 */
export interface McpToolRegistration {
  /** Tool definition */
  tool: McpTool;
  
  /** Optional override for MCP Tool interface fields */
  mcpOverrides?: Partial<Tool>;
}

/**
 * Common response patterns found across all tools
 * Most tools follow these response structures
 */
export interface StandardToolResponse {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Human-readable message about the result */
  message: string;
  
  /** ISO timestamp of when the operation completed */
  timestamp?: string;
  
  /** Execution time in milliseconds */
  execution_time_ms?: number;
  
  /** Tool-specific data payload */
  data?: any;
  
  /** Error information if success is false */
  error?: string;
  
  /** Error code for programmatic handling */
  error_code?: string;
}

/**
 * Progress reporting interface
 * Used by tools that support progress notifications
 */
export interface ProgressCapableResponse extends StandardToolResponse {
  /** Progress percentage (0-100) */
  progress?: number;
  
  /** Progress token for continued monitoring */
  progress_token?: string | number;
}

/**
 * Tool error types for standardized error handling
 */
export type ToolErrorCode = 
  | 'VALIDATION_ERROR'
  | 'EXECUTION_ERROR' 
  | 'TIMEOUT_ERROR'
  | 'PERMISSION_ERROR'
  | 'RESOURCE_ERROR'
  | 'DEPENDENCY_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Tool execution context for enhanced functionality
 * Provides access to common services and utilities
 */
export interface ToolExecutionContext {
  /** Repository path for file operations */
  repositoryPath: string;
  
  /** Agent ID for tracking and attribution */
  agentId?: string;
  
  /** Database connection for persistence */
  db?: any;
  
  /** Progress reporting callback */
  reportProgress?: (progress: number, message?: string) => Promise<void>;
  
  /** Service dependencies */
  services?: Record<string, any>;
}

/**
 * Tool builder helper for creating properly typed tools
 */
export class McpToolBuilder<TInput = any, TOutput = any> {
  private tool: Partial<McpTool<TInput, TOutput>> = {};
  
  name(name: string): this {
    this.tool.name = name;
    return this;
  }
  
  description(description: string): this {
    this.tool.description = description;
    return this;
  }
  
  inputSchema(schema: JsonSchema): this {
    this.tool.inputSchema = schema;
    return this;
  }
  
  outputSchema(schema: JsonSchema): this {
    this.tool.outputSchema = schema;
    return this;
  }
  
  handler(handler: McpToolHandler<TInput, TOutput>): this {
    this.tool.handler = handler;
    return this;
  }
  
  annotations(annotations: ToolAnnotations): this {
    this.tool.annotations = annotations;
    return this;
  }
  
  build(): McpTool<TInput, TOutput> {
    if (!this.tool.name || !this.tool.description || !this.tool.inputSchema || !this.tool.handler) {
      throw new Error('Missing required tool properties: name, description, inputSchema, and handler are required');
    }
    
    return this.tool as McpTool<TInput, TOutput>;
  }
}

/**
 * Utility function to create a tool with proper typing
 */
export function createMcpTool<TInput = any, TOutput = any>(
  definition: McpTool<TInput, TOutput>
): McpTool<TInput, TOutput> {
  return definition;
}

/**
 * Type guards for tool validation
 */
export function isValidMcpTool(obj: any): obj is McpTool {
  return (
    obj &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.inputSchema === 'object' &&
    typeof obj.handler === 'function'
  );
}

export function isExtendedMcpTool(obj: any): obj is ExtendedMcpTool {
  return isValidMcpTool(obj);
}

/**
 * Re-export commonly used types for convenience
 */
export type { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
export type { JsonSchema };

/**
 * Tool-specific schema exports
 * This file exports schemas that are specific to individual tools
 */

export * from './reportProgress.js';
export * from './agentOrchestration.js';
export * from './knowledgeGraph.js';
export * from './treeSummary.js';