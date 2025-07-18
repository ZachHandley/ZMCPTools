import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import express from "express";
import http from "http";
import net from "net";
import path from "path";
import { z } from "zod";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
  isInitializeRequest,
  CreateMessageRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Generic result schema for all MCP tools
const GenericToolResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  data: z.any().optional(),
});

type GenericToolResult = z.infer<typeof GenericToolResultSchema>;
import type {
  Tool,
  CallToolResult,
  TextContent,
  ImageContent,
  Resource,
  TextResourceContents,
  Prompt,
  GetPromptResult,
  CreateMessageRequest,
  CreateMessageResult,
} from "@modelcontextprotocol/sdk/types.js";

import { DatabaseManager } from "../database/index.js";
import {
  AgentOrchestrationTools,
  OrchestrationResultSchema,
  SpawnAgentOptionsSchema,
  type OrchestrationResult,
} from "../tools/AgentOrchestrationTools.js";
import { CommunicationTools } from "../tools/CommunicationTools.js";
import { PlanTools } from "../tools/PlanTools.js";
import { WebScrapingMcpTools } from "../tools/WebScrapingMcpTools.js";
import { AnalysisMcpTools } from "../tools/AnalysisMcpTools.js";
import {
  ProjectStructureInfoSchema,
  ProjectSummarySchema,
  FileSymbolsSchema,
} from "../schemas/toolResponses.js";
import { TreeSummaryTools } from "../tools/TreeSummaryTools.js";
import { ReportProgressTool } from "../tools/ReportProgressTool.js";
// CacheMcpTools removed - foundation caching now automatic
import {
  BrowserTools,
  SessionConfigSchema,
  SessionMetadataSchema,
} from "../tools/BrowserTools.js";
import { BrowserAIDOMTools } from "../tools/BrowserAIDOMTools.js";
import { WebScrapingService } from "../services/WebScrapingService.js";
import {
  AgentService,
  KnowledgeGraphService,
  VectorSearchService,
  FileOperationsService,
  TreeSummaryService,
  ProjectService,
  DashboardConnectionService,
  fileOperationsService,
  eventBus,
} from "../services/index.js";
import { ResourceManager } from "../managers/ResourceManager.js";
import { PromptManager } from "../managers/PromptManager.js";
import { PathUtils } from "../utils/pathUtils.js";
import { LanceDBService } from "../services/LanceDBService.js";
import {
  KnowledgeGraphMcpTools,
  StoreKnowledgeMemorySchema,
  CreateRelationshipSchema,
  SearchKnowledgeGraphSchema,
  FindRelatedEntitiesSchema,
} from "../tools/knowledgeGraphTools.js";
import type { McpTool, McpProgressContext } from "../schemas/tools/index.js";

export interface McpServerOptions {
  name: string;
  version: string;
  databasePath?: string;
  repositoryPath?: string;
  transport?: "stdio" | "http";
  httpPort?: number;
  httpHost?: string;
}

export class McpToolsServer {
  private mcpServer: Server;
  private db: DatabaseManager;
  private orchestrationTools: AgentOrchestrationTools;
  private communicationTools: CommunicationTools;
  private planTools: PlanTools;
  private browserTools: BrowserTools;
  private browserAIDOMTools: BrowserAIDOMTools;
  private webScrapingMcpTools: WebScrapingMcpTools;
  private webScrapingService: WebScrapingService;
  private analysisMcpTools: AnalysisMcpTools;
  private knowledgeGraphMcpTools: KnowledgeGraphMcpTools;
  private treeSummaryTools: TreeSummaryTools;
  private reportProgressTool: ReportProgressTool;
  // cacheMcpTools removed - foundation caching now automatic
  private fileOperationsService: FileOperationsService;
  private treeSummaryService: TreeSummaryService;
  private resourceManager: ResourceManager;
  private promptManager: PromptManager;
  private lanceDBManager: LanceDBService;
  private repositoryPath: string;
  private httpServer?: http.Server;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } =
    {};
  private lastClientActivity: number = Date.now();
  private inactivityTimer?: NodeJS.Timeout;
  private projectService?: ProjectService;
  private dashboardConnectionService?: DashboardConnectionService;
  private projectId?: string;

  /**
   * Start the inactivity timer that will shutdown the server if no client activity for 10 minutes
   */
  private startInactivityTimer(): void {
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    this.inactivityTimer = setInterval(() => {
      const timeSinceLastActivity = Date.now() - this.lastClientActivity;
      const hasActiveSessions = Object.keys(this.transports).length > 0;
      
      if (timeSinceLastActivity >= INACTIVITY_TIMEOUT && !hasActiveSessions) {
        process.stderr.write(`💀 Server has been inactive for 10 minutes with no active sessions. Shutting down...\n`);
        process.exit(0);
      }
    }, 60000); // Check every minute
  }

  /**
   * Update the last client activity timestamp
   */
  private updateClientActivity(): void {
    this.lastClientActivity = Date.now();
  }

  /**
   * Check if result contains AI image format
   */
  private hasAIImageInResult(result: any): boolean {
    if (!result || typeof result !== 'object') return false;
    
    // Check for AI image in nested data structures
    const checkForAIImage = (obj: any): boolean => {
      if (!obj || typeof obj !== 'object') return false;
      
      // Check if this object is an AI image
      if (obj.type === 'image' && obj.data && obj.mimeType) {
        return true;
      }
      
      // Check ai_image field specifically
      if (obj.ai_image && obj.ai_image.type === 'image' && obj.ai_image.data && obj.ai_image.mimeType) {
        return true;
      }
      
      // Recursively check nested objects and arrays
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              if (checkForAIImage(item)) return true;
            }
          } else if (typeof value === 'object') {
            if (checkForAIImage(value)) return true;
          }
        }
      }
      
      return false;
    };
    
    return checkForAIImage(result);
  }

  /**
   * Extract AI image from result
   */
  private extractAIImageFromResult(result: any): { type: 'image'; data: string; mimeType: string } {
    const extractImage = (obj: any): { type: 'image'; data: string; mimeType: string } | null => {
      if (!obj || typeof obj !== 'object') return null;
      
      // Check if this object is an AI image
      if (obj.type === 'image' && obj.data && obj.mimeType) {
        return { type: 'image', data: obj.data, mimeType: obj.mimeType };
      }
      
      // Check ai_image field specifically
      if (obj.ai_image && obj.ai_image.type === 'image' && obj.ai_image.data && obj.ai_image.mimeType) {
        return { type: 'image', data: obj.ai_image.data, mimeType: obj.ai_image.mimeType };
      }
      
      // Recursively check nested objects and arrays
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              const found = extractImage(item);
              if (found) return found;
            }
          } else if (typeof value === 'object') {
            const found = extractImage(value);
            if (found) return found;
          }
        }
      }
      
      return null;
    };
    
    const found = extractImage(result);
    if (!found) {
      throw new Error('AI image not found in result');
    }
    
    return found;
  }

  /**
   * Remove AI image from result to avoid duplication in text content
   */
  private removeAIImageFromResult(result: any): any {
    if (!result || typeof result !== 'object') return result;
    
    const removeImage = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj;
      
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => removeImage(item));
      }
      
      // Handle objects
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          
          // Skip ai_image fields
          if (key === 'ai_image') {
            continue;
          }
          
          // Skip objects that are AI images
          if (typeof value === 'object' && value.type === 'image' && value.data && value.mimeType) {
            continue;
          }
          
          // Recursively clean nested objects
          if (typeof value === 'object') {
            cleaned[key] = removeImage(value);
          } else {
            cleaned[key] = value;
          }
        }
      }
      
      return cleaned;
    };
    
    return removeImage(result);
  }

  /**
   * Stop the inactivity timer
   */
  private stopInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
      this.inactivityTimer = undefined;
    }
  }

  /**
   * Register this MCP server instance with the dashboard for monitoring
   */
  private async registerWithDashboard(): Promise<void> {
    if (!this.projectService) {
      process.stderr.write("⚠️ ProjectService not initialized, skipping dashboard registration\n");
      return;
    }

    try {
      process.stderr.write("📊 Registering with dashboard...\n");
      
      const transportType = this.options.transport || process.env.MCP_TRANSPORT || "stdio";
      const projectName = path.basename(this.repositoryPath);
      
      const registration = {
        name: projectName,
        repositoryPath: this.repositoryPath,
        mcpServerType: 'claude-mcp-tools' as const,
        mcpServerPid: process.pid,
        mcpServerPort: transportType === "http" ? (this.options.httpPort || 4269) : undefined,
        mcpServerHost: transportType === "http" ? (this.options.httpHost || "127.0.0.1") : undefined,
        claudeSessionId: undefined, // Set by Claude when connected
        foundationSessionId: undefined, // Set when foundation caching is used
        projectMetadata: {
          serverVersion: this.options.version,
          transportType,
          startupTime: new Date().toISOString(),
          toolsCount: this.getAvailableTools().length
        },
        webUiEnabled: false, // Dashboard is separate from MCP server
      };

      const project = await this.projectService.registerProject(registration);
      this.projectId = project.id;
      
      process.stderr.write(`✅ Registered with dashboard as project: ${project.id}\n`);
      
      // Start heartbeat for real-time monitoring
      this.startHeartbeat();
      
      // Initialize dashboard connection service for real-time communication
      process.stderr.write("🔌 About to initialize dashboard connection...\n");
      await this.initializeDashboardConnection();
      process.stderr.write("✅ Dashboard connection initialized\n");
      
    } catch (error) {
      process.stderr.write(`⚠️ Failed to register with dashboard: ${error}\n`);
      // Don't fail startup if dashboard registration fails
    }
  }

  /**
   * Start heartbeat for dashboard monitoring
   */
  private startHeartbeat(): void {
    if (!this.projectService || !this.projectId) {
      return;
    }

    const heartbeatInterval = 30000; // 30 seconds
    const dashboardCheckInterval = 5000; // 5 seconds for dashboard check
    
    // Main heartbeat - update project status
    setInterval(async () => {
      try {
        const activeTransports = Object.keys(this.transports).length;
        const status = activeTransports > 0 ? 'connected' : 'active';
        
        const metadata = {
          activeTransports,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          lastActivity: this.lastClientActivity,
          toolsCount: this.getAvailableTools().length
        };

        await this.projectService!.updateHeartbeat(this.projectId!, status, metadata);
        
        // Emit server heartbeat event
        eventBus.emit('server_heartbeat', {
          status,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          activeTransports,
          timestamp: new Date(),
          repositoryPath: this.repositoryPath
        });
      } catch (error) {
        process.stderr.write(`⚠️ Heartbeat update failed: ${error}\n`);
      }
    }, heartbeatInterval);

    // Dashboard connection is now handled by DashboardConnectionService
  }

  /**
   * Initialize dashboard connection service for real-time communication
   */
  private async initializeDashboardConnection(): Promise<void> {
    process.stderr.write("🔍 Starting initializeDashboardConnection method\n");
    if (!this.projectId) {
      process.stderr.write("⚠️ Project ID not available, skipping dashboard connection\n");
      return;
    }
    process.stderr.write(`📋 Project ID available: ${this.projectId}\n`);

    try {
      process.stderr.write("🔌 Initializing dashboard connection service...\n");
      
      this.dashboardConnectionService = new DashboardConnectionService(
        this.db,
        this.repositoryPath,
        {
          autoReconnect: true,
          maxReconnectAttempts: 10,
          reconnectDelay: 1000,
          maxReconnectDelay: 30000,
          connectionCheckInterval: 5000
        }
      );

      await this.dashboardConnectionService.initialize(this.projectId);
      
      process.stderr.write("✅ Dashboard connection service initialized\n");
      
    } catch (error) {
      process.stderr.write(`⚠️ Failed to initialize dashboard connection: ${error}\n`);
      // Don't fail startup if dashboard connection fails
    }
  }

  constructor(private options: McpServerOptions) {
    this.repositoryPath = PathUtils.resolveRepositoryPath(
      options.repositoryPath || process.cwd(),
      "McpServer"
    );

    // Mark this as the main MCP process for database initialization
    process.env.MCP_MAIN_PROCESS = "true";

    this.mcpServer = new Server(
      {
        name: options.name,
        version: options.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          sampling: {},
          notifications: {
            progress: true,
          },
        },
      }
    );

    // Initialize database with optimized settings for main process
    this.db = new DatabaseManager({
      path: options.databasePath,
      wal: true,
      busyTimeoutMs: 30000,
      checkpointIntervalMs: 60000,
      verbose: process.env.NODE_ENV === "development",
    });

    // Initialize services
    const agentService = new AgentService(this.db);
    const vectorService = new VectorSearchService(this.db);
    const knowledgeGraphService = new KnowledgeGraphService(
      this.db,
      vectorService
    );
    this.webScrapingService = new WebScrapingService(
      this.db,
      this.repositoryPath
    );
    
    // Initialize project service for dashboard integration
    this.projectService = new ProjectService(this.db, eventBus);

    // Initialize file operations and tree summary services
    this.fileOperationsService = fileOperationsService; // Use singleton instance
    this.treeSummaryService = new TreeSummaryService();

    // Initialize tools
    this.orchestrationTools = new AgentOrchestrationTools(
      this.db,
      this.repositoryPath
    );
    
    this.communicationTools = new CommunicationTools(
      this.db,
      this.repositoryPath
    );
    
    this.planTools = new PlanTools(
      this.db,
      this.repositoryPath
    );

    this.browserTools = new BrowserTools(
      knowledgeGraphService,
      this.repositoryPath,
      this.db
    );
    this.browserAIDOMTools = new BrowserAIDOMTools(this.db);
    this.webScrapingMcpTools = new WebScrapingMcpTools(
      this.webScrapingService,
      knowledgeGraphService,
      this.repositoryPath,
      this.db
    );
    this.analysisMcpTools = new AnalysisMcpTools(
      knowledgeGraphService,
      this.repositoryPath
    );
    this.knowledgeGraphMcpTools = new KnowledgeGraphMcpTools(this.db);
    this.treeSummaryTools = new TreeSummaryTools();
    this.reportProgressTool = new ReportProgressTool(this.db);
    // Foundation caching is now automatic - no manual tools needed

    // Initialize managers
    this.resourceManager = new ResourceManager(this.db, this.repositoryPath);
    this.promptManager = new PromptManager();
    this.lanceDBManager = new LanceDBService(this.db, {
      // LanceDB is embedded - no server configuration needed
    });

    this.setupMcpHandlers();

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();

    // Make server instance available for sampling requests
    (globalThis as any).mcpServer = this;
  }

  private setupShutdownHandlers(): void {
    // Handle process termination signals
    const shutdown = async () => {
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("SIGQUIT", shutdown);
  }

  private setupMcpHandlers(): void {
    // Register all tools using setRequestHandler
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
  }

  private setupToolHandlers(): void {
    // List tools handler
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.getAvailableTools();
      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Call tool handler
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const typedArgs: Record<string, any> = args || {};
      
      // Debug logging to see what the MCP client is sending
      process.stderr.write(`🔍 MCP CallTool request: name="${name}", args=${JSON.stringify(typedArgs, null, 2)}\n`);
      
      // Emit tool call started event
      const startTime = Date.now();
      eventBus.emit('tool_call_started', {
        toolName: name,
        arguments: typedArgs,
        timestamp: new Date(),
        repositoryPath: this.repositoryPath
      });
      
      const tools = this.getAvailableTools();
      const tool = tools.find((t) => t.name === name);

      if (!tool) {
        const error = new McpError(ErrorCode.MethodNotFound, `Tool "${name}" not found`);
        
        // Emit tool call failed event
        eventBus.emit('tool_call_failed', {
          toolName: name,
          arguments: typedArgs,
          error,
          timestamp: new Date(),
          repositoryPath: this.repositoryPath
        });
        
        throw error;
      }

      try {
        // Extract progress token from request metadata for MCP compliance
        const progressToken = typedArgs?._meta?.progressToken;
        let progressContext: McpProgressContext | undefined = undefined;
        
        if (progressToken) {
          progressContext = {
            progressToken,
            sendNotification: async (notification: any) => {
              try {
                // Use the server's notification method through the connection
                if (this.mcpServer) {
                  await this.mcpServer.notification(notification);
                } else {
                  process.stderr.write(`⚠️ MCP server not connected, cannot send progress notification\n`);
                }
              } catch (notificationError) {
                process.stderr.write(`⚠️ Failed to send progress notification: ${notificationError}\n`);
              }
            }
          };
        }

        // Remove _meta from args before passing to handler to avoid confusion
        const { _meta, ...cleanArgs } = args || {};
        const handlerArgs = progressContext 
          ? { ...cleanArgs, progressContext }
          : cleanArgs;

        const result = await tool.handler(handlerArgs);
        
        // Emit tool call completed event
        const duration = Date.now() - startTime;
        eventBus.emit('tool_call_completed', {
          toolName: name,
          arguments: typedArgs,
          result,
          duration,
          timestamp: new Date(),
          repositoryPath: this.repositoryPath
        });

        // Check if result contains AI image format
        const hasAIImage = this.hasAIImageInResult(result);
        
        if (hasAIImage) {
          // Extract AI image and return mixed content
          const aiImage = this.extractAIImageFromResult(result);
          const textResult = this.removeAIImageFromResult(result);
          
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(textResult, null, 2),
              },
              {
                type: "image" as const,
                data: aiImage.data,
                mimeType: aiImage.mimeType,
              },
            ],
            isError: false,
          };
        }

        // Return proper CallToolResult format for non-image results
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: false,
        };
      } catch (error) {
        // Emit tool call failed event
        eventBus.emit('tool_call_failed', {
          toolName: name,
          arguments: typedArgs,
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
          repositoryPath: this.repositoryPath
        });
        
        // Return error as CallToolResult instead of throwing
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupResourceHandlers(): void {
    // List resources handler
    this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = this.resourceManager.listResources();
      return {
        resources: resources.map((resource) => ({
          uri: resource.uriTemplate,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        })),
      };
    });

    // Read resource handler
    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      try {
        process.stderr.write(`🔍 Reading resource with uri: ${uri}\n`);
        const result = await this.resourceManager.readResource(uri);
        
        // Return the result directly as it already has the correct structure
        // with uri, mimeType, and text fields
        return {
          contents: [result],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
          contents: [
            {
              uri: uri,
              mimeType: "text/plain",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private setupPromptHandlers(): void {
    // List prompts handler
    this.mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
      const prompts = this.promptManager.listPrompts();
      return {
        prompts: prompts.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments || [],
        })),
      };
    });

    // Get prompt handler
    this.mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await this.promptManager.getPrompt(name, args);
        return result;
      } catch (error) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    });
  }

  public getAvailableTools(): McpTool[] {
    return [
      // Browser automation tools
      ...this.browserTools.getTools(),
      // Browser AI DOM navigation tools
      ...this.browserAIDOMTools.getTools(),
      // Web scraping tools
      ...this.webScrapingMcpTools.getTools(),
      // Analysis and file operation tools
      ...this.analysisMcpTools.getTools(),
      // Knowledge graph tools
      ...this.knowledgeGraphMcpTools.getTools(),
      // TreeSummary tools
      ...this.treeSummaryTools.getTools(),
      // Communication tools
      ...this.communicationTools.getTools(),
      // Plan management tools
      ...this.planTools.getTools(),
      // Agent orchestration tools
      ...this.orchestrationTools.getTools(),
      // Progress reporting tool
      ...this.reportProgressTool.getTools(),
    ];
  }

  async start(): Promise<void> {
    // MCP servers must not output to stdout - using stderr for startup messages
    process.stderr.write("🚀 Starting Claude MCP Tools Server...\n");
    
    // Emit server status change event
    eventBus.emit('server_status_change', {
      status: 'starting',
      timestamp: new Date(),
      repositoryPath: this.repositoryPath
    });

    // Initialize database
    await this.db.initialize();
    process.stderr.write("✅ Database initialized\n");

    // Initialize LanceDB connection
    process.stderr.write("🔍 Connecting to LanceDB...\n");
    const lanceResult = await this.lanceDBManager.initialize();
    if (lanceResult.success) {
      process.stderr.write("✅ LanceDB connected successfully\n");
    } else {
      process.stderr.write(
        `⚠️ LanceDB failed to connect: ${lanceResult.error}\n`
      );
      process.stderr.write("📝 Vector search features will be unavailable\n");
    }

    // Start the MCP server with appropriate transport
    // Default to stdio for MCP standard compliance, but allow HTTP override
    const transportType = this.options.transport || 
      process.env.MCP_TRANSPORT || 
      "stdio";
    if (transportType === "http") {
      await this.startHttpTransport();
    } else {
      await this.startStdioTransport();
    }

    // Start background scraping worker (non-blocking)
    process.stderr.write("🤖 Starting background scraping worker...\n");
    this.webScrapingService.startScrapingWorker()
      .then(() => {
        process.stderr.write("✅ Background scraping worker started\n");
      })
      .catch((error) => {
        process.stderr.write(`⚠️ Failed to start scraping worker: ${error}\n`);
      });

    // Register this MCP server instance with the dashboard
    await this.registerWithDashboard();

    process.stderr.write("✅ MCP Server started successfully\n");
    
    // Emit server status change event
    eventBus.emit('server_status_change', {
      status: 'active',
      previousStatus: 'starting',
      timestamp: new Date(),
      repositoryPath: this.repositoryPath,
      metadata: {
        transport: this.options.transport || 'stdio',
        toolsCount: this.getAvailableTools().length
      }
    });
    const transportMsg =
      transportType === "http"
        ? `📡 Listening for MCP requests on HTTP port ${
            this.options.httpPort || 4269
          }...\n`
        : "📡 Listening for MCP requests on stdio (MCP standard)...\n";
    process.stderr.write(transportMsg);
    
    // Inform about transport override options
    if (transportType === "stdio" && !this.options.transport) {
      process.stderr.write("💡 Use MCP_TRANSPORT=http environment variable or transport option to enable HTTP mode\n");
    }

    // Start inactivity timer for HTTP transport
    if (transportType === "http") {
      this.startInactivityTimer();
      process.stderr.write("⏰ Inactivity timer started (10 minute timeout)\n");
    }
  }

  /**
   * Start MCP server with stdio transport
   */
  private async startStdioTransport(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }

  /**
   * Check if MCP server is already running on the specified port
   */
  private async isServerRunning(host: string, port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://${host}:${port}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });

      if (response.ok) {
        const health = await response.json();
        return (
          health.status === "ok" &&
          (health.protocol === "mcp" || health.transport === "http")
        );
      }
      return false;
    } catch (error) {
      return false; // Server not running or not reachable
    }
  }

  /**
   * Common ports to avoid when finding available ports
   */
  private readonly COMMON_PORTS = new Set([
    21,
    22,
    23,
    25,
    53,
    80,
    110,
    143,
    443,
    993,
    995, // Standard protocols
    3000,
    3001,
    8000,
    8080,
    8443,
    8888,
    9000, // Common dev ports
    5432,
    3306,
    1433,
    5984,
    6379,
    27017, // Database ports
    25565,
    19132, // Minecraft
    5000,
    5001, // Flask default
    4200, // Angular CLI
    3030, // Express common
    8081,
    8082,
    8083,
    8084,
    8085, // Common alt HTTP ports
  ]);

  /**
   * Check if a port is available (cross-platform)
   */
  private async isPortAvailable(port: number, host: string): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once("error", () => {
        resolve(false);
      });

      server.once("listening", () => {
        server.close(() => {
          resolve(true);
        });
      });

      server.listen(port, host);
    });
  }

  /**
   * Find an available port avoiding common ports
   */
  private async findAvailablePort(
    preferredPort: number,
    host: string
  ): Promise<number> {
    // Try the preferred port first if it's not a common port
    if (
      !this.COMMON_PORTS.has(preferredPort) &&
      (await this.isPortAvailable(preferredPort, host))
    ) {
      return preferredPort;
    }

    if (this.COMMON_PORTS.has(preferredPort)) {
      process.stderr.write(
        `⚠️  Port ${preferredPort} is a common port, finding alternative...\n`
      );
    } else {
      process.stderr.write(
        `⚠️  Port ${preferredPort} is busy, finding alternative...\n`
      );
    }

    // Try a range of uncommon ports starting from 49152 (dynamic/private port range)
    const startPort = Math.max(49152, preferredPort);
    for (let i = 0; i < 100; i++) {
      const port = startPort + i;
      if (
        !this.COMMON_PORTS.has(port) &&
        (await this.isPortAvailable(port, host))
      ) {
        process.stderr.write(`ℹ️  Using port ${port} instead\n`);
        return port;
      }
    }

    // Fallback: get a random available port from the OS
    return new Promise((resolve, reject) => {
      const server = net.createServer();

      server.once("error", (err) => {
        reject(err);
      });

      server.once("listening", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          const randomPort = address.port;
          server.close(() => {
            process.stderr.write(`ℹ️  Using OS-assigned port ${randomPort}\n`);
            resolve(randomPort);
          });
        } else {
          server.close(() => {
            reject(new Error("Failed to get random port"));
          });
        }
      });

      server.listen(0, host);
    });
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const handleShutdown = async (signal: string) => {
      process.stderr.write(
        `\n🚨 Received ${signal}, shutting down gracefully...\n`
      );
      await this.shutdown();
      process.exit(0);
    };

    // Handle various termination signals
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT"));
    process.on("SIGHUP", () => handleShutdown("SIGHUP"));

    // Handle uncaught exceptions gracefully
    process.on("uncaughtException", async (error) => {
      process.stderr.write(`❌ Uncaught exception: ${error.message}\n`);
      await this.shutdown();
      process.exit(1);
    });

    process.on("unhandledRejection", async (reason, promise) => {
      process.stderr.write(
        `❌ Unhandled rejection at: ${promise}, reason: ${reason}\n`
      );
      await this.shutdown();
      process.exit(1);
    });
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    process.stderr.write("🔄 Shutting down MCP server...\n");

    try {
      // Stop inactivity timer
      this.stopInactivityTimer();
      
      // Close HTTP server if running
      if (this.httpServer) {
        await new Promise<void>((resolve, reject) => {
          this.httpServer!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        process.stderr.write("✅ HTTP server closed\n");
      }

      // Close database connections
      if (this.db) {
        this.db.close();
        process.stderr.write("✅ Database connections closed\n");
      }

      // Stop background services
      if (
        this.webScrapingService &&
        typeof this.webScrapingService.stopScrapingWorker === "function"
      ) {
        await this.webScrapingService.stopScrapingWorker();
        process.stderr.write("✅ Background services stopped\n");
      }
    } catch (error) {
      process.stderr.write(`⚠️  Error during shutdown: ${error}\n`);
    }
  }

  /**
   * Start MCP server with HTTP transport using StreamableHTTPServerTransport
   */
  private async startHttpTransport(): Promise<void> {
    const preferredPort = this.options.httpPort || 4269;
    const host = this.options.httpHost || "127.0.0.1";

    // Find an available port
    const port = await this.findAvailablePort(preferredPort, host);

    // Set up signal handlers for graceful shutdown
    this.setupSignalHandlers();

    // Create raw HTTP server
    this.httpServer = http.createServer(async (req, res) => {
      const requestId = randomUUID().slice(0, 8);
      const timestamp = new Date().toISOString();
      
      // Update client activity timestamp
      this.updateClientActivity();
      
      // Log incoming request
      process.stderr.write(`[${timestamp}] [${requestId}] --> ${req.method} ${req.url}\n`);
      process.stderr.write(`[${timestamp}] [${requestId}] Headers: ${JSON.stringify(req.headers)}\n`);
      
      try {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
        res.setHeader('Vary', 'Origin');

        // Handle OPTIONS requests
        if (req.method === 'OPTIONS') {
          process.stderr.write(`[${timestamp}] [${requestId}] <-- 200 OPTIONS response\n`);
          res.writeHead(200);
          res.end();
          return;
        }

        // Parse URL and method
        const url = new URL(req.url!, `http://${req.headers.host}`);
        
        if (url.pathname === '/health') {
          const healthResponse = { status: "ok", transport: "http", protocol: "mcp" };
          process.stderr.write(`[${timestamp}] [${requestId}] <-- 200 Health check: ${JSON.stringify(healthResponse)}\n`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(healthResponse));
          return;
        }

        // Handle OAuth discovery endpoints (Claude Code expects these)
        if (url.pathname === '/.well-known/oauth-protected-resource') {
          const oauthResponse = {
            resource_registration_endpoint: `http://${req.headers.host}/register`,
            introspection_endpoint: `http://${req.headers.host}/introspect`,
            revocation_endpoint: `http://${req.headers.host}/revoke`
          };
          process.stderr.write(`[${timestamp}] [${requestId}] <-- 200 OAuth protected resource discovery: ${JSON.stringify(oauthResponse)}\n`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(oauthResponse));
          return;
        }

        if (url.pathname === '/.well-known/oauth-authorization-server') {
          const authServerResponse = {
            issuer: `http://${req.headers.host}`,
            authorization_endpoint: `http://${req.headers.host}/authorize`,
            token_endpoint: `http://${req.headers.host}/token`,
            userinfo_endpoint: `http://${req.headers.host}/userinfo`,
            registration_endpoint: `http://${req.headers.host}/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
            scopes_supported: ["mcp"]
          };
          process.stderr.write(`[${timestamp}] [${requestId}] <-- 200 OAuth authorization server discovery: ${JSON.stringify(authServerResponse)}\n`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(authServerResponse));
          return;
        }

        // Handle OAuth registration endpoint
        if (url.pathname === '/register') {
          if (req.method === 'POST') {
            // Claude Code OAuth client registration
            const registrationResponse = {
              client_id: "claude-code-" + randomUUID().slice(0, 8),
              client_secret: randomUUID(),
              registration_access_token: randomUUID(),
              registration_client_uri: `http://${req.headers.host}/register`,
              client_id_issued_at: Math.floor(Date.now() / 1000),
              token_endpoint_auth_method: "none",
              grant_types: ["authorization_code"],
              response_types: ["code"],
              redirect_uris: [`http://${req.headers.host}/callback`],
              scope: "mcp"
            };
            process.stderr.write(`[${timestamp}] [${requestId}] <-- 200 OAuth client registration: ${JSON.stringify(registrationResponse)}\n`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(registrationResponse));
            return;
          } else if (req.method === 'GET') {
            // Return client info or registration form
            const clientInfoResponse = {
              message: "OAuth client registration endpoint",
              supported_methods: ["POST"],
              registration_endpoint: `http://${req.headers.host}/register`
            };
            process.stderr.write(`[${timestamp}] [${requestId}] <-- 200 Registration info: ${JSON.stringify(clientInfoResponse)}\n`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(clientInfoResponse));
            return;
          }
        }

      if (url.pathname === '/mcp' || url.pathname === '/') {
        if (req.method === 'POST') {
          // Parse request body
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              process.stderr.write(`[${timestamp}] [${requestId}] Body: ${body}\n`);
              const requestData = JSON.parse(body);
              process.stderr.write(`[${timestamp}] [${requestId}] Parsed request: ${JSON.stringify(requestData)}\n`);
              const sessionId = (req.headers["mcp-session-id"] || requestData.id) as string | undefined;
              process.stderr.write(`[${timestamp}] [${requestId}] Session ID: ${sessionId || 'none'}\n`);
              let transport: StreamableHTTPServerTransport;

              if (sessionId && this.transports[sessionId]) {
                // Reuse existing transport
                transport = this.transports[sessionId];
              } else if (!sessionId && isInitializeRequest(requestData)) {
                // New initialization request - create transport with session management
                transport = new StreamableHTTPServerTransport({
                  sessionIdGenerator: () => randomUUID(),
                  onsessioninitialized: (sessionId) => {
                    // Store the transport by session ID/compac
                    this.transports[sessionId] = transport;
                  },
                  enableDnsRebindingProtection: false,
                  allowedHosts: ["127.0.0.1", "localhost", "127.0.0.1:4269", "localhost:4269"],
                });

                // Clean up transport when closed
                transport.onclose = () => {
                  if (transport.sessionId) {
                    delete this.transports[transport.sessionId];
                  }
                };

                // Connect the MCP server to this transport
                await this.mcpServer.connect(transport);
              } else {
                // Invalid request
                const errorResponse = {
                  jsonrpc: "2.0",
                  error: {
                    code: -32000,
                    message: "Bad Request: No valid session ID provided",
                  },
                  id: requestData.id || null,
                };
                process.stderr.write(`[${timestamp}] [${requestId}] <-- 400 Invalid request: ${JSON.stringify(errorResponse)}\n`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(errorResponse));
                return;
              }

              // Handle the request using StreamableHTTPServerTransport
              process.stderr.write(`[${timestamp}] [${requestId}] Calling transport.handleRequest...\n`);
              await transport.handleRequest(req, res, requestData);
              process.stderr.write(`[${timestamp}] [${requestId}] <-- Transport handled request successfully\n`);
            } catch (error) {
              process.stderr.write(`[${timestamp}] [${requestId}] ERROR: ${error}\n`);
              const errorResponse = {
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message: "Internal server error",
                  data: String(error)
                },
                id: null
              };
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(errorResponse));
            }
          });
          return;
        } else if (req.method === 'GET' || req.method === 'DELETE') {
          // Handle GET/DELETE requests for session management
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          process.stderr.write(`[${timestamp}] [${requestId}] ${req.method} request with session: ${sessionId || 'none'}\n`);
          
          if (!sessionId || !this.transports[sessionId]) {
            const errorResponse = {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Invalid or missing session ID"
              },
              id: null
            };
            process.stderr.write(`[${timestamp}] [${requestId}] <-- 400 Invalid session: ${JSON.stringify(errorResponse)}\n`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(errorResponse));
            return;
          }

          const transport = this.transports[sessionId];
          process.stderr.write(`[${timestamp}] [${requestId}] Calling transport.handleRequest for ${req.method}...\n`);
          await transport.handleRequest(req, res);
          process.stderr.write(`[${timestamp}] [${requestId}] <-- ${req.method} handled successfully\n`);
          return;
        }
      }

      // 404 for all other requests
      const notFoundResponse = {
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: "Method not found"
        },
        id: null
      };
      process.stderr.write(`[${timestamp}] [${requestId}] <-- 404 Not found: ${JSON.stringify(notFoundResponse)}\n`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(notFoundResponse));
      
      } catch (outerError) {
        // Catch any errors in the outer request handling
        process.stderr.write(`[${timestamp}] [${requestId}] OUTER ERROR: ${outerError}\n`);
        const fatalErrorResponse = {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Fatal server error",
            data: String(outerError)
          },
          id: null
        };
        try {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(fatalErrorResponse));
        } catch (writeError) {
          process.stderr.write(`[${timestamp}] [${requestId}] WRITE ERROR: ${writeError}\n`);
        }
      }
    });

    try {
      // Start the HTTP server
      this.httpServer.listen(port, host, () => {
        process.stderr.write(`🌐 HTTP MCP Server started on ${host}:${port}\n`);
      });
    } catch (error) {
      process.stderr.write(`❌ Failed to start HTTP server: ${error}\n`);
      throw error;
    }
  }

  /**
   * Get database manager for crash handler and other internal use
   */
  getDatabaseManager(): DatabaseManager {
    return this.db;
  }

  async stop(): Promise<void> {
    process.stderr.write("🛑 Stopping MCP Server...\n");
    
    // Emit server status change event
    eventBus.emit('server_status_change', {
      status: 'disconnected',
      previousStatus: 'active',
      timestamp: new Date(),
      repositoryPath: this.repositoryPath
    });

    // End project registration with dashboard
    if (this.projectService && this.projectId) {
      try {
        await this.projectService.endProject(this.projectId, "Server shutdown");
        process.stderr.write("📊 Unregistered from dashboard\n");
      } catch (error) {
        process.stderr.write(`⚠️ Failed to unregister from dashboard: ${error}\n`);
      }
    }

    // Stop inactivity timer
    this.stopInactivityTimer();
    process.stderr.write("⏰ Inactivity timer stopped\n");

    // Shutdown dashboard connection service
    if (this.dashboardConnectionService) {
      process.stderr.write("🔌 Shutting down dashboard connection service...\n");
      await this.dashboardConnectionService.shutdown();
      process.stderr.write("✅ Dashboard connection service shutdown\n");
    }

    // Stop background scraping worker
    process.stderr.write("🤖 Stopping background scraping worker...\n");
    try {
      await this.webScrapingService.stopScrapingWorker();
      process.stderr.write("✅ Background scraping worker stopped\n");
    } catch (error) {
      process.stderr.write(`⚠️ Error stopping scraping worker: ${error}\n`);
    }

    // Close Express server if running
    if (this.httpServer) {
      process.stderr.write("🌐 Closing HTTP server...\n");
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      process.stderr.write("✅ HTTP server closed\n");
    }

    // Close LanceDB connection
    process.stderr.write("🔍 Closing LanceDB connection...\n");
    await this.lanceDBManager.shutdown();
    process.stderr.write("✅ LanceDB connection closed\n");

    await this.mcpServer.close();
    process.stderr.write("✅ MCP Server stopped\n");
  }

  /**
   * Request sampling from the MCP client
   */
  async requestSampling(samplingRequest: any): Promise<CreateMessageResult> {
    try {
      // Make a sampling request to the client
      const response = await this.mcpServer.request(
        {
          method: "sampling/createMessage",
          params: samplingRequest.params,
        },
        CreateMessageRequestSchema
      );

      return response as CreateMessageResult;
    } catch (error) {
      throw new Error(
        `MCP sampling request failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Health check method
  getStatus(): {
    status: string;
    database: string;
    tools: number;
    uptime: number;
    vectorDB: string;
  } {
    return {
      status: "running",
      database: this.db.isInitialized() ? "connected" : "disconnected",
      tools: this.getAvailableTools().length,
      uptime: process.uptime(),
      vectorDB: this.lanceDBManager.isConnected()
        ? "connected"
        : "disconnected",
    };
  }
}
