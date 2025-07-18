import { z } from 'zod';

/**
 * Base response schema for all MCP tools
 * Provides consistent structure across all tool responses
 */
export const BaseToolResponseSchema = z.object({
  success: z.boolean().describe("Whether the tool execution was successful"),
  message: z.string().describe("Human-readable message describing the result"),
  timestamp: z.string().datetime().describe("ISO timestamp of when the tool completed"),
  execution_time_ms: z.number().optional().describe("Time taken to execute the tool in milliseconds"),
  error: z.string().optional().describe("Error message if success is false"),
  data: z.any().optional().describe("Tool-specific result data")
});

export type BaseToolResponse = z.infer<typeof BaseToolResponseSchema>;

/**
 * Agent orchestration tool response schemas
 */
export const AgentOrchestrationResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    agent_id: z.string().optional().describe("ID of the spawned or affected agent"),
    task_id: z.string().optional().describe("ID of the created or affected task"),
    room_name: z.string().optional().describe("Name of the communication room"),
    orchestration_id: z.string().optional().describe("ID of the orchestration session"),
    agents: z.array(z.any()).optional().describe("List of agents (for list operations)"),
    messages: z.array(z.any()).optional().describe("List of messages (for message operations)"),
    rooms: z.array(z.any()).optional().describe("List of rooms (for room list operations)"),
    memory_entries: z.array(z.any()).optional().describe("Memory search results"),
    patterns: z.any().optional().describe("Coordination patterns analysis"),
    monitoring_data: z.any().optional().describe("Agent monitoring data")
  }).optional()
});

export type AgentOrchestrationResponse = z.infer<typeof AgentOrchestrationResponseSchema>;

/**
 * Browser operation tool response schemas
 */
export const BrowserOperationResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    session_id: z.string().optional().describe("Browser session ID"),
    url: z.string().optional().describe("Current or navigated URL"),
    screenshot_path: z.string().optional().describe("Path to captured screenshot"),
    content: z.string().optional().describe("Scraped page content"),
    html: z.string().optional().describe("Raw HTML content"),
    metadata: z.any().optional().describe("Page metadata"),
    interactions: z.array(z.any()).optional().describe("Interaction results"),
    sessions: z.array(z.any()).optional().describe("Browser session list"),
    script_result: z.any().optional().describe("JavaScript execution result")
  }).optional()
});

export type BrowserOperationResponse = z.infer<typeof BrowserOperationResponseSchema>;

/**
 * Web scraping tool response schemas
 */
export const WebScrapingResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    job_id: z.string().optional().describe("Scraping job ID"),
    source_id: z.string().optional().describe("Documentation source ID"),
    pages_scraped: z.number().optional().describe("Number of pages scraped"),
    pages_total: z.number().optional().describe("Total pages to scrape"),
    status: z.string().optional().describe("Job status"),
    jobs: z.array(z.any()).optional().describe("List of scraping jobs"),
    sources: z.array(z.any()).optional().describe("List of documentation sources"),
    search_results: z.array(z.any()).optional().describe("Documentation search results"),
    deleted_count: z.number().optional().describe("Number of deleted items"),
    websites: z.array(z.any()).optional().describe("List of websites"),
    pages: z.array(z.any()).optional().describe("List of pages")
  }).optional()
});

export type WebScrapingResponse = z.infer<typeof WebScrapingResponseSchema>;

/**
 * Analysis tool response schemas
 */
export const AnalysisResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    project_info: z.any().optional().describe("Project structure information"),
    summary: z.any().optional().describe("Project summary"),
    symbols: z.array(z.any()).optional().describe("File symbols analysis"),
    files: z.array(z.string()).optional().describe("List of files"),
    replaced_count: z.number().optional().describe("Number of replacements made"),
    cleanup_results: z.any().optional().describe("Cleanup operation results"),
    analysis_data: z.any().optional().describe("Analysis results")
  }).optional()
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

/**
 * Tree summary tool response schemas
 */
export const TreeSummaryResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    file_path: z.string().optional().describe("File path that was analyzed"),
    project_path: z.string().optional().describe("Project path"),
    analysis_updated: z.boolean().optional().describe("Whether analysis was updated"),
    metadata_updated: z.boolean().optional().describe("Whether metadata was updated"),
    overview: z.any().optional().describe("Project overview"),
    cleanup_count: z.number().optional().describe("Number of cleaned up analyses")
  }).optional()
});

export type TreeSummaryResponse = z.infer<typeof TreeSummaryResponseSchema>;

/**
 * Progress reporting tool response schemas
 */
export const ProgressReportResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    progress_id: z.string().optional().describe("Progress report ID"),
    agent_id: z.string().describe("Agent ID that reported progress"),
    progress_type: z.string().describe("Type of progress reported"),
    progress_percentage: z.number().optional().describe("Progress percentage"),
    room_broadcast: z.boolean().optional().describe("Whether progress was broadcast to room"),
    task_id: z.string().optional().describe("Associated task ID")
  }).optional()
});

export type ProgressReportResponse = z.infer<typeof ProgressReportResponseSchema>;


// Generic Knowledge Graph Response (for backward compatibility)
export const KnowledgeGraphResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    entity_id: z.string().optional().describe("Created or affected entity ID"),
    relationship_id: z.string().optional().describe("Created relationship ID"),
    search_results: z.array(z.any()).optional().describe("Knowledge graph search results"),
    related_entities: z.array(z.any()).optional().describe("Related entities"),
    memory_stored: z.boolean().optional().describe("Whether memory was stored successfully"),
    knowledge_count: z.number().optional().describe("Number of knowledge entries")
  }).optional()
});

export type KnowledgeGraphResponse = z.infer<typeof KnowledgeGraphResponseSchema>;

/**
 * Vector search tool response schemas
 */
export const VectorSearchResponseSchema = BaseToolResponseSchema.extend({
  data: z.object({
    collection_name: z.string().optional().describe("Vector collection name"),
    query: z.string().optional().describe("Search query"),
    results: z.array(z.any()).optional().describe("Vector search results"),
    similarity_scores: z.array(z.number()).optional().describe("Similarity scores"),
    collections: z.array(z.any()).optional().describe("List of collections"),
    embeddings_created: z.number().optional().describe("Number of embeddings created"),
    vector_status: z.any().optional().describe("Vector database status")
  }).optional()
});

export type VectorSearchResponse = z.infer<typeof VectorSearchResponseSchema>;

/**
 * Analysis-specific response schemas
 */

// ProjectStructureInfo schema - simplified without z.lazy to avoid recursion issues
export const ProjectStructureInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  extension: z.string().optional(),
  lastModified: z.date().optional()
});

// Define the recursive type using type intersection
export type ProjectStructureInfo = z.infer<typeof ProjectStructureInfoSchema> & {
  children?: ProjectStructureInfo[];
};

// ProjectSummary schema
export const ProjectSummarySchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
  framework: z.string().optional(),
  language: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  structure: ProjectStructureInfoSchema,
  gitInfo: z.object({
    branch: z.string().optional(),
    lastCommit: z.string().optional(),
    remotes: z.array(z.string()).optional()
  }).optional(),
  stats: z.object({
    totalFiles: z.number(),
    totalDirectories: z.number(),
    totalSize: z.number(),
    fileTypes: z.record(z.string(), z.number())
  })
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

// FileSymbols schema
export const FileSymbolsSchema = z.object({
  file_path: z.string(),
  symbols: z.object({
    functions: z.array(z.object({
      name: z.string(),
      line: z.number(),
      signature: z.string().optional()
    })),
    classes: z.array(z.object({
      name: z.string(),
      line: z.number(),
      methods: z.array(z.string()).optional()
    })),
    interfaces: z.array(z.object({
      name: z.string(),
      line: z.number(),
      properties: z.array(z.string()).optional()
    })),
    types: z.array(z.object({
      name: z.string(),
      line: z.number(),
      definition: z.string().optional()
    })),
    variables: z.array(z.object({
      name: z.string(),
      line: z.number(),
      type: z.string().optional()
    })),
    imports: z.array(z.object({
      name: z.string(),
      from: z.string(),
      line: z.number()
    }))
  })
});

export type FileSymbols = z.infer<typeof FileSymbolsSchema>;

/**
 * Generic error response schema for failed tool executions
 */
export const ToolErrorResponseSchema = BaseToolResponseSchema.extend({
  success: z.literal(false),
  error: z.string().describe("Detailed error message"),
  error_code: z.string().optional().describe("Error code for programmatic handling"),
  stack_trace: z.string().optional().describe("Stack trace for debugging (dev mode only)")
});

export type ToolErrorResponse = z.infer<typeof ToolErrorResponseSchema>;

/**
 * Utility function to create a success response
 */
export function createSuccessResponse<T>(
  message: string,
  data?: T,
  executionTimeMs?: number
): BaseToolResponse {
  return {
    success: true,
    message,
    timestamp: new Date().toISOString(),
    execution_time_ms: executionTimeMs,
    data
  };
}

/**
 * Utility function to create an error response
 */
export function createErrorResponse(
  message: string,
  error: string,
  errorCode?: string
): ToolErrorResponse {
  return {
    success: false,
    message,
    timestamp: new Date().toISOString(),
    error,
    error_code: errorCode
  };
}