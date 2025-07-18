import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ulid } from 'ulidx';
import { DatabaseManager } from '../database/index.js';
import { AgentService, ObjectiveService, CommunicationService, KnowledgeGraphService } from '../services/index.js';
import { PlanRepository } from '../repositories/index.js';
import { WebScrapingService } from '../services/WebScrapingService.js';
import { AgentMonitoringService } from '../services/AgentMonitoringService.js';
import { ProgressTracker } from '../services/ProgressTracker.js';
import { ClaudeSpawner } from '../process/ClaudeSpawner.js';
import { StructuredOrchestrator, type StructuredOrchestrationRequest } from '../services/index.js';
import { DependencyWaitingService } from '../services/DependencyWaitingService.js';
import { AgentPermissionManager } from '../utils/agentPermissions.js';
import type { ObjectiveType, AgentStatus, MessageType, EntityType } from '../schemas/index.js';
import type { McpTool } from '../schemas/tools/index.js';

// Import centralized request schemas
import {
  OrchestrationObjectiveSchema,
  SpawnAgentSchema,
  CreateObjectiveSchema,
  ListAgentsSchema,
  TerminateAgentSchema,
  MonitorAgentsSchema,
  StructuredOrchestrationSchema,
  ContinueAgentSessionSchema
} from '../schemas/tools/agentOrchestration.js';

// Import centralized response schemas
import {
  AgentOrchestrationResponseSchema,
  createSuccessResponse,
  createErrorResponse,
  type AgentOrchestrationResponse
} from '../schemas/toolResponses.js';

// Import individual response schemas
import {
  OrchestrationObjectiveResponseSchema,
  SpawnAgentResponseSchema,
  CreateObjectiveResponseSchema,
  ListAgentsResponseSchema,
  TerminateAgentResponseSchema,
  MonitorAgentsResponseSchema,
  StructuredOrchestrationResponseSchema,
  ContinueAgentSessionResponseSchema
} from '../schemas/tools/agentOrchestration.js';

// Import cleanup tool schemas
import {
  CleanupStaleAgentsSchema,
  CleanupStaleRoomsSchema,
  ComprehensiveCleanupSchema,
  GetCleanupConfigurationSchema,
  CleanupStaleAgentsResponseSchema,
  CleanupStaleRoomsResponseSchema,
  ComprehensiveCleanupResponseSchema,
  GetCleanupConfigurationResponseSchema
} from '../schemas/tools/cleanup.js';
import type { ExecutionPlan } from '../schemas/tools/sequentialPlanning.js';


// Legacy types for backward compatibility
export const OrchestrationResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.any().optional(),
});

export const SpawnAgentOptionsSchema = z.object({
  agentType: z.string(),
  repositoryPath: z.string(),
  objectiveDescription: z.string(),
  capabilities: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type OrchestrationResult = z.infer<typeof OrchestrationResultSchema>;
export type SpawnAgentOptions = z.infer<typeof SpawnAgentOptionsSchema>;

export class AgentOrchestrationTools {
  private agentService: AgentService;
  private objectiveService: ObjectiveService;
  private communicationService: CommunicationService;
  private knowledgeGraphService: KnowledgeGraphService;
  private planRepository: PlanRepository;
  private webScrapingService: WebScrapingService;
  private monitoringService: AgentMonitoringService;
  private progressTracker: ProgressTracker;
  private structuredOrchestrator: StructuredOrchestrator;
  private dependencyWaitingService: DependencyWaitingService;
  private repositoryPath: string;

  constructor(private db: DatabaseManager, repositoryPath: string) {
    this.repositoryPath = repositoryPath;
    this.agentService = new AgentService(db);
    this.objectiveService = new ObjectiveService(db);
    this.communicationService = new CommunicationService(db);
    this.planRepository = new PlanRepository(db);
    // Initialize KnowledgeGraphService with VectorSearchService
    this.initializeKnowledgeGraphService(db);
    this.webScrapingService = new WebScrapingService(
      db,
      repositoryPath
    );
    this.monitoringService = new AgentMonitoringService(db, repositoryPath);
    this.progressTracker = new ProgressTracker(db);
    this.structuredOrchestrator = new StructuredOrchestrator(db, repositoryPath);
    this.dependencyWaitingService = new DependencyWaitingService(db);
  }

  private async initializeKnowledgeGraphService(db: DatabaseManager): Promise<void> {
    try {
      const { VectorSearchService } = await import('../services/VectorSearchService.js');
      const vectorService = new VectorSearchService(db);
      this.knowledgeGraphService = new KnowledgeGraphService(db, vectorService);
    } catch (error) {
      console.warn('Failed to initialize KnowledgeGraphService:', error);
      // Fallback to a minimal implementation that doesn't crash
      this.knowledgeGraphService = {
        createEntity: async () => ({ id: 'fallback', name: 'fallback' }),
        findEntitiesBySemanticSearch: async () => []
      } as any;
    }
  }

  /**
   * Get MCP tools for agent orchestration
   * Returns properly structured McpTool objects with handler bindings
   */
  getTools(): McpTool[] {
    return [
      {
        name: 'orchestrate_objective',
        description: 'Spawn architect agent to coordinate multi-agent objective completion',
        inputSchema: zodToJsonSchema(OrchestrationObjectiveSchema),
        outputSchema: zodToJsonSchema(OrchestrationObjectiveResponseSchema),
        handler: this.orchestrateObjective.bind(this)
      },
      {
        name: 'orchestrate_objective_structured',
        description: 'Execute structured orchestration with research, planning, and execution phases',
        inputSchema: zodToJsonSchema(StructuredOrchestrationSchema),
        outputSchema: zodToJsonSchema(StructuredOrchestrationResponseSchema),
        handler: this.orchestrateObjectiveStructured.bind(this)
      },
      {
        name: 'spawn_agent',
        description: 'Create specialized Claude agent for specific objectives',
        inputSchema: zodToJsonSchema(SpawnAgentSchema),
        outputSchema: zodToJsonSchema(SpawnAgentResponseSchema),
        handler: this.spawnAgent.bind(this)
      },
      {
        name: 'create_objective',
        description: 'Create development objective with requirements and dependencies',
        inputSchema: zodToJsonSchema(CreateObjectiveSchema),
        outputSchema: zodToJsonSchema(CreateObjectiveResponseSchema),
        handler: this.createObjective.bind(this)
      },
      {
        name: 'list_agents',
        description: 'Get list of active agents',
        inputSchema: zodToJsonSchema(ListAgentsSchema),
        outputSchema: zodToJsonSchema(ListAgentsResponseSchema),
        handler: this.listAgents.bind(this)
      },
      {
        name: 'terminate_agent',
        description: 'Terminate one or more agents',
        inputSchema: zodToJsonSchema(TerminateAgentSchema),
        outputSchema: zodToJsonSchema(TerminateAgentResponseSchema),
        handler: this.terminateAgent.bind(this)
      },
      {
        name: 'monitor_agents',
        description: 'Monitor agent status with real-time updates',
        inputSchema: zodToJsonSchema(MonitorAgentsSchema),
        outputSchema: zodToJsonSchema(MonitorAgentsResponseSchema),
        handler: this.monitorAgents.bind(this)
      },
      {
        name: 'continue_agent_session',
        description: 'Resume agent session with additional instructions',
        inputSchema: zodToJsonSchema(ContinueAgentSessionSchema),
        outputSchema: zodToJsonSchema(ContinueAgentSessionResponseSchema),
        handler: this.continueAgentSession.bind(this)
      },
      {
        name: 'cleanup_stale_agents',
        description: 'Clean up stale agents with enhanced options and optional room cleanup',
        inputSchema: zodToJsonSchema(CleanupStaleAgentsSchema),
        outputSchema: zodToJsonSchema(CleanupStaleAgentsResponseSchema),
        handler: this.cleanupStaleAgents.bind(this)
      },
      {
        name: 'cleanup_stale_rooms',
        description: 'Clean up stale rooms based on activity and participant criteria',
        inputSchema: zodToJsonSchema(CleanupStaleRoomsSchema),
        outputSchema: zodToJsonSchema(CleanupStaleRoomsResponseSchema),
        handler: this.cleanupStaleRooms.bind(this)
      },
      {
        name: 'run_comprehensive_cleanup',
        description: 'Run comprehensive cleanup for both agents and rooms with detailed reporting',
        inputSchema: zodToJsonSchema(ComprehensiveCleanupSchema),
        outputSchema: zodToJsonSchema(ComprehensiveCleanupResponseSchema),
        handler: this.runComprehensiveCleanup.bind(this)
      },
      {
        name: 'get_cleanup_configuration',
        description: 'Get current cleanup configuration and settings for agents and rooms',
        inputSchema: zodToJsonSchema(GetCleanupConfigurationSchema),
        outputSchema: zodToJsonSchema(GetCleanupConfigurationResponseSchema),
        handler: this.getCleanupConfiguration.bind(this)
      }
    ];
  }



  /**
   * Spawn architect agent to coordinate multi-agent objective completion
   */
  async orchestrateObjective(args: any): Promise<OrchestrationResult> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      title: args.title,
      objective: args.objective,
      repositoryPath: args.repositoryPath || args.repository_path,
      foundationSessionId: args.foundationSessionId || args.foundation_session_id
    };
    
    const { title, objective, repositoryPath, foundationSessionId } = normalizedArgs;
    try {
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = repositoryPath || this.repositoryPath;
      
      // 1. Create plan FIRST (before any other orchestration steps)
      const plan = await this.planRepository.createPlan({
        repositoryPath: repoPath,
        title: `Plan: ${title}`,
        description: `Generated plan for orchestration objective: ${objective}`,
        objectives: objective,
        priority: 'high',
        createdByAgent: 'orchestrateObjective',
        sections: this.generateBasicPlanSections(objective),
        metadata: {
          estimatedTotalHours: 8,
          riskLevel: 'medium',
          technologies: [],
          dependencies: []
        },
        status: 'approved' // Auto-approve for orchestration
      });

      // 2. Create coordination room (orchestration always needs room)
      const roomName = AgentPermissionManager.generateOrchestrationRoomName(objective, 'obj');
      const room = await this.communicationService.createRoom({
        name: roomName,
        description: `Coordination room for: ${objective}`,
        repositoryPath: repoPath,
        metadata: {
          objective,
          foundationSessionId,
          orchestrationMode: true,
          planId: plan.id,
          createdAt: new Date().toISOString()
        }
      });

      // 3. AUTO-CREATE MASTER OBJECTIVE for the objective (linked to plan)
      const masterObjective = await this.objectiveService.createObjective({
        repositoryPath: repoPath,
        objectiveType: 'feature' as ObjectiveType,
        description: `${title}: ${objective}`,
        requirements: {
          objective,
          roomId: room.id,
          roomName,
          planId: plan.id,
          foundationSessionId,
          isOrchestrationObjective: true,
          createdBy: 'orchestrateObjective'
        },
        priority: 10 // High priority for orchestration objectives
      });

      // 4. Store objective in knowledge graph with objective and plan references
      try {
        await this.knowledgeGraphService.createEntity({
          id: `orchestration-${Date.now()}`,
          repositoryPath: repoPath,
          entityType: 'insight',
          name: title,
          description: `Objective: ${objective}\n\nMulti-agent objective coordination started.\nPlan: ${plan.id}\nRoom: ${roomName}\nFoundation Session: ${foundationSessionId || 'none'}\nMaster Objective: ${masterObjective.id}`,
          properties: { tags: ['objective', 'orchestration', 'coordination', 'objective-creation', 'plan'] },
          discoveredBy: 'system',
          discoveredDuring: 'orchestration',
          importanceScore: 0.9,
          confidenceScore: 1.0,
          relevanceScore: 0.9
        });
      } catch (error) {
        console.warn('Failed to store objective in knowledge graph:', error);
      }

      // 4. Generate architect prompt with objective-first approach
      const architectPrompt = this.generateArchitectPrompt(objective, repoPath, roomName, foundationSessionId, masterObjective.id);

      // 5. Spawn architect agent with full autonomy, objective assignment, and room
      const architectAgent = await this.agentService.createAgent({
        agentName: 'architect',
        repositoryPath: repoPath,
        objectiveDescription: `Orchestrate objective: ${objective}`,
        capabilities: ['ALL_TOOLS', 'orchestration', 'planning', 'coordination'],
        roomId: room.id, // Explicitly assign room for orchestration
        autoCreateRoom: false, // Don't create another room - use the orchestration room
        metadata: {
          role: 'architect',
          objective,
          roomName,
          foundationSessionId,
          fullAutonomy: true,
          assignedObjectiveId: masterObjective.id
        },
        claudeConfig: {
          prompt: architectPrompt,
          sessionId: undefined, // Only set when resuming existing Claude sessions (UUID format)
          environmentVars: {
            ORCHESTRATION_MODE: 'architect',
            TARGET_ROOM: roomName,
            OBJECTIVE: objective,
            MASTER_TASK_ID: masterObjective.id
          }
        }
      });

      // 6. Assign master objective to architect agent
      await this.objectiveService.assignObjective(masterObjective.id, architectAgent.id);

      // 7. Send welcome message to room with objective info
      this.communicationService.sendMessage({
        roomName,
        agentName: 'system',
        message: `🏗️ Architect agent ${architectAgent.id} has been spawned to coordinate objective: "${objective}"\n📋 Master objective ${masterObjective.id} created and assigned`,
        messageType: 'system' as MessageType
      });

      return {
        success: true,
        message: 'Plan created and architect agent spawned successfully with master objective',
        data: {
          planId: plan.id,
          architectAgentId: architectAgent.id,
          roomName,
          objective,
          masterObjectiveId: masterObjective.id
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to orchestrate objective: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Execute structured phased orchestration with intelligent model selection
   */
  async orchestrateObjectiveStructured(args: any): Promise<OrchestrationResult> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      title: args.title,
      objective: args.objective,
      repositoryPath: args.repositoryPath || args.repository_path,
      foundationSessionId: args.foundationSessionId || args.foundation_session_id,
      maxDuration: args.maxDuration || args.max_duration,
      enableProgressTracking: args.enableProgressTracking || args.enable_progress_tracking,
      customPhaseConfig: args.customPhaseConfig || args.custom_phase_config
    };
    
    try {
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = normalizedArgs.repositoryPath || this.repositoryPath;
      
      const request: StructuredOrchestrationRequest = {
        title: normalizedArgs.title,
        objective: normalizedArgs.objective,
        repositoryPath: repoPath,
        foundationSessionId: normalizedArgs.foundationSessionId,
        maxDuration: normalizedArgs.maxDuration,
        enableProgressTracking: normalizedArgs.enableProgressTracking,
        customPhaseConfig: normalizedArgs.customPhaseConfig
      };

      const result = await this.structuredOrchestrator.orchestrateObjectiveStructured(request);

      return {
        success: result.success,
        message: result.message,
        data: {
          orchestrationId: result.orchestrationId,
          complexityLevel: result.progress.phases ? 'analyzed' : 'unknown',
          currentPhase: result.progress.currentPhase,
          progress: result.progress.progress,
          spawnedAgents: result.progress.spawnedAgents,
          createdObjectives: result.progress.createdObjectives,
          roomName: result.progress.roomName,
          masterObjectiveId: result.progress.masterObjectiveId,
          finalResults: result.finalResults,
          structuredMode: true
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to execute structured orchestration: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Spawn fully autonomous Claude agent with complete tool access
   */
  async spawnAgent(args: any): Promise<OrchestrationResult> {
    // Debug logging to see what parameters are actually received
    process.stderr.write(`🔍 spawnAgent received args: ${JSON.stringify(args, null, 2)}\n`);
    
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      agentType: args.agentType || args.agent_type,
      repositoryPath: args.repositoryPath || args.repository_path,
      objectiveDescription: args.objectiveDescription || args.objective_description,
      capabilities: args.capabilities,
      dependsOn: args.dependsOn || args.depends_on,
      metadata: args.metadata,
      autoCreateRoom: args.autoCreateRoom || args.auto_create_room,
      roomId: args.roomId || args.room_id
    };
    
    const options = {
      agentType: normalizedArgs.agentType,
      repositoryPath: normalizedArgs.repositoryPath,
      objectiveDescription: normalizedArgs.objectiveDescription,
      capabilities: normalizedArgs.capabilities,
      dependsOn: normalizedArgs.dependsOn,
      metadata: normalizedArgs.metadata,
      autoCreateRoom: normalizedArgs.autoCreateRoom,
      roomId: normalizedArgs.roomId
    };
    try {
      // Add detailed logging to track what architects are passing
      const logger = new (await import('../utils/logger.js')).Logger('AgentOrchestration');
      
      logger.info('[SPAWN_AGENT] Called with options', {
        agentType: options.agentType,
        repositoryPath: options.repositoryPath,
        objectiveDescriptionType: typeof options.objectiveDescription,
        objectiveDescriptionLength: options.objectiveDescription?.length,
        objectiveDescriptionPreview: options.objectiveDescription?.substring(0, 100),
        capabilitiesType: typeof options.capabilities,
        capabilitiesIsArray: Array.isArray(options.capabilities),
        capabilitiesValue: options.capabilities,
        dependsOnType: typeof options.dependsOn,
        dependsOnIsArray: Array.isArray(options.dependsOn),
        dependsOnValue: options.dependsOn,
        metadataType: typeof options.metadata,
        metadataKeys: options.metadata ? Object.keys(options.metadata) : [],
        rawOptionsStringified: JSON.stringify(options)
      });

      const {
        agentType,
        repositoryPath,
        objectiveDescription,
        capabilities = ['ALL_TOOLS'],
        dependsOn = [],
        metadata = {},
        autoCreateRoom,
        roomId
      } = options;
      
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = repositoryPath || this.repositoryPath;

      // 1. Wait for dependencies if any (REAL WAITING, NOT JUST CHECKING!)
      if (dependsOn.length > 0) {
        logger.info(`Agent has ${dependsOn.length} dependencies, waiting for completion...`, {
          agentType,
          dependsOn,
          repositoryPath: repoPath
        });

        const dependencyResult = await this.dependencyWaitingService.waitForAgentDependencies(
          dependsOn,
          repoPath,
          {
            timeout: 600000, // 10 minutes
            waitForAnyFailure: true
          }
        );

        if (!dependencyResult.success) {
          logger.warn('Dependency waiting failed', {
            agentType,
            dependencyResult,
            failedAgents: dependencyResult.failedAgents,
            timeoutAgents: dependencyResult.timeoutAgents
          });

          return {
            success: false,
            message: `Dependencies failed or timed out: ${dependencyResult.message}`,
            data: {
              dependencyResult,
              failedAgents: dependencyResult.failedAgents,
              timeoutAgents: dependencyResult.timeoutAgents,
              waitDuration: dependencyResult.waitDuration
            }
          };
        }

        logger.info(`All dependencies completed successfully, proceeding with agent spawn`, {
          agentType,
          completedAgents: dependencyResult.completedAgents,
          waitDuration: dependencyResult.waitDuration
        });
      }

      // 2. Generate specialized prompt
      const specializedPrompt = this.generateAgentPrompt(agentType, objectiveDescription, repoPath);

      // 3. Create agent with full capabilities
      const agent = await this.agentService.createAgent({
        agentName: agentType,
        repositoryPath: repoPath,
        objectiveDescription: objectiveDescription,
        capabilities,
        dependsOn,
        metadata: {
          ...metadata,
          spawnedAt: new Date().toISOString(),
          fullAutonomy: true
        },
        autoCreateRoom,
        roomId,
        claudeConfig: {
          prompt: specializedPrompt
        }
      });

      // 4. Store agent spawn in knowledge graph
      try {
        await this.knowledgeGraphService.createEntity({
          id: `agent-spawn-${Date.now()}`,
          repositoryPath: repoPath,
          entityType: 'objective',
          name: `Agent ${agentType} spawned`,
          description: `Successfully spawned ${agentType} agent for objective: ${objectiveDescription}`,
          properties: {
            agentId: agent.id,
            agentType,
            capabilities,
            dependsOn,
            tags: ['agent-spawn', agentType]
          },
          discoveredBy: 'system',
          discoveredDuring: 'agent-spawn',
          importanceScore: 0.7,
          confidenceScore: 1.0,
          relevanceScore: 0.8
        });
      } catch (error) {
        console.warn('Failed to store agent spawn in knowledge graph:', error);
      }

      return {
        success: true,
        message: `${agentType} agent spawned successfully`,
        data: {
          agentId: agent.id,
          agentType,
          pid: agent.claudePid,
          capabilities,
          repositoryPath: agent.repositoryPath
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to spawn ${options.agentType} agent: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Create and assign objective to agents with enhanced capabilities
   */
  async createObjective(args: any): Promise<OrchestrationResult> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      repositoryPath: args.repositoryPath || args.repository_path,
      objectiveType: args.objectiveType || args.objective_type,
      title: args.title,
      description: args.description,
      requirements: args.requirements,
      dependencies: args.dependencies
    };
    
    const { repositoryPath, objectiveType, title, description, requirements, dependencies } = normalizedArgs;
    try {
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = repositoryPath || this.repositoryPath;
      
      // Create the objective with enhanced features
      const objective = await this.objectiveService.createObjective({
        repositoryPath: repoPath,
        objectiveType,
        description: `${title}: ${description}`,
        requirements,
        priority: typeof requirements?.priority === 'number' ? requirements.priority : 1,
        estimatedDuration: requirements?.estimatedDuration,
        tags: requirements?.tags || [objectiveType, 'orchestration']
      });

      // Add dependencies if specified
      if (dependencies && dependencies.length > 0) {
        for (const depId of dependencies) {
          await this.objectiveService.addObjectiveDependency(objective.id, depId);
        }
      }

      // Auto-assign if agent specified
      if (requirements?.assignedAgentId) {
        await this.objectiveService.assignObjective(objective.id, requirements.assignedAgentId);
      }

      // Store objective creation in knowledge graph with enhanced metadata
      try {
        await this.knowledgeGraphService.createEntity({
          id: `objective-creation-${Date.now()}`,
          repositoryPath,
          entityType: 'objective',
          name: `Objective created: ${title}`,
          description: `Objective ${objective.id} created with type ${objectiveType}.\nDescription: ${description}\nPriority: ${objective.priority}\nEstimated Duration: ${requirements?.estimatedDuration || 'N/A'} minutes`,
          properties: {
            objectiveId: objective.id,
            objectiveType,
            dependencies: dependencies || [],
            priority: objective.priority,
            estimatedDuration: requirements?.estimatedDuration,
            tags: ['objective-creation', objectiveType, 'orchestration', ...(requirements?.tags || [])]
          },
          discoveredBy: 'system',
          discoveredDuring: 'objective-creation',
          importanceScore: 0.8,
          confidenceScore: 1.0,
          relevanceScore: 0.8
        });
      } catch (error) {
        console.warn('Failed to store objective creation in knowledge graph:', error);
      }

      return {
        success: true,
        message: 'Objective created successfully with enhanced tracking',
        data: {
          objectiveId: objective.id,
          objectiveType,
          status: objective.status,
          priority: objective.priority,
          estimatedDuration: requirements?.estimatedDuration,
          dependencies: dependencies || []
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to create objective: ${error}`,
        data: { error: String(error) }
      };
    }
  }



  /**
   * Get list of active agents
   */
  async listAgents(args: any): Promise<OrchestrationResult> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      repositoryPath: args.repositoryPath || args.repository_path,
      status: args.status,
      limit: args.limit || 5,
      offset: args.offset || 0
    };
    
    const { repositoryPath, status, limit, offset } = normalizedArgs;
    try {
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = repositoryPath || this.repositoryPath;
      const agents = await this.agentService.listAgents(repoPath, status, limit, offset);

      return {
        success: true,
        message: `Found ${agents.length} agents`,
        data: {
          agents: agents.map(agent => ({
            id: agent.id,
            name: agent.agentName,
            status: agent.status,
            capabilities: agent.capabilities,
            lastHeartbeat: agent.lastHeartbeat,
            metadata: agent.agentMetadata
          })),
          count: agents.length
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to list agents: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Terminate one or more agents
   */
  async terminateAgent(args: any): Promise<OrchestrationResult> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      agentIds: args.agentIds || args.agent_ids
    };
    
    const { agentIds } = normalizedArgs;
    try {
      const ids = agentIds;
      const results: Array<{ agentId: string; success: boolean; error?: string }> = [];

      for (const agentId of ids) {
        try {
          // Use the AgentService's built-in terminate method
          await this.agentService.terminateAgent(agentId);
          
          results.push({
            agentId,
            success: true
          });

        } catch (error) {
          results.push({
            agentId,
            success: false,
            error: String(error)
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      return {
        success: failureCount === 0,
        message: `Terminated ${successCount}/${results.length} agents${failureCount > 0 ? ` (${failureCount} failed)` : ''}`,
        data: {
          results,
          successCount,
          failureCount,
          totalCount: results.length
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to terminate agents: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  // Private helper methods
  private generateArchitectPrompt(
    objective: string,
    repositoryPath: string,
    roomName: string,
    foundationSessionId?: string,
    masterObjectiveId?: string
  ): string {
    return `🏗️ ARCHITECT AGENT - Strategic Orchestration Leader with Sequential Thinking

OBJECTIVE: ${objective}
REPOSITORY: ${repositoryPath}
COORDINATION ROOM: ${roomName}
FOUNDATION SESSION: ${foundationSessionId || 'none'}
MASTER OBJECTIVE: ${masterObjectiveId || 'none'}

You are an autonomous architect agent with COMPLETE CLAUDE CODE CAPABILITIES and advanced sequential thinking for complex planning.
You can use ALL tools: file operations, web browsing, code analysis, agent spawning, etc.

🧠 SEQUENTIAL THINKING METHODOLOGY:
You have access to the sequential_thinking tool for complex problem decomposition and planning.
Use this tool systematically throughout your orchestration process:

1. **Initial Analysis**: Use sequential_thinking() to understand objective scope and complexity
2. **Problem Decomposition**: Break down the objective into logical components systematically
3. **Dependency Analysis**: Identify relationships and dependencies between components
4. **Agent Planning**: Determine optimal agent types and objective assignments
5. **Risk Assessment**: Consider potential challenges and mitigation strategies
6. **Execution Strategy**: Plan coordination and monitoring approach
7. **Iterative Refinement**: Revise and improve your approach as understanding deepens

🎯 STRUCTURED PLANNING TOOLS:
You also have access to structured planning tools for comprehensive orchestration:
- create_execution_plan() - Create detailed execution plan using sequential thinking
- get_execution_plan() - Retrieve previously created execution plans
- execute_with_plan() - Execute objectives using pre-created plans with well-defined agent objectives

RECOMMENDED WORKFLOW:
1. Start with sequential_thinking() for initial analysis
2. Use create_execution_plan() to create comprehensive structured plan
3. Use execute_with_plan() to spawn agents with clear, specific objectives

🎯 KNOWLEDGE GRAPH INTEGRATION:
Before planning, always search for relevant knowledge and patterns:
- search_knowledge_graph() to learn from previous similar objectives
- Look for patterns in agent coordination, objective breakdown, and execution strategies
- Identify reusable components and successful approaches from past work
- Use knowledge graph insights to inform your sequential thinking process

🎯 OBJECTIVE-FIRST ORCHESTRATION APPROACH:
Your orchestration centers around hierarchical objective management. You have been assigned master objective ${masterObjectiveId || 'TBD'}.

ORCHESTRATION PHASES:

1. **STRATEGIC ANALYSIS WITH SEQUENTIAL THINKING**
   REQUIRED: Start with sequential_thinking() to analyze the objective:
   - Thought 1: Initial objective understanding and scope assessment
   - Thought 2: Complexity analysis and decomposition approach
   - Thought 3: Dependencies and execution strategy
   - Thought 4: Agent coordination requirements
   - Thought 5: Risk assessment and mitigation planning
   - Continue iterative refinement as needed
   
2. **KNOWLEDGE GRAPH DISCOVERY**
   - Join coordination room: join_room("${roomName}", "architect")
   - Search knowledge graph for relevant patterns: search_knowledge_graph()
   - Query previous orchestration experiences: search_knowledge_graph("orchestration patterns")
   - Analyze repository structure thoroughly
   - Identify reusable components and successful approaches
   
3. **STRUCTURED OBJECTIVE BREAKDOWN WITH SEQUENTIAL THINKING**
   REQUIRED: Use sequential_thinking() for objective decomposition:
   - Analyze objective components systematically
   - Create hierarchical objective structure with dependencies
   - Define agent specialization requirements
   - Plan execution sequencing and coordination
   - Store complete plan in knowledge graph: store_knowledge_memory()
   
4. **COORDINATED AGENT EXECUTION**
   - spawn_agent() specialist agents with specific objective assignments
   - Create sub-objectives using create_objective() for complex work
   - Monitor progress through room messages: wait_for_messages()
   - Handle conflicts and dependencies proactively
   - Ensure quality gates and completion criteria
   
5. **CONTINUOUS MONITORING & ADAPTATION**
   - Monitor agent progress and identify bottlenecks
   - Use sequential_thinking() for problem-solving when issues arise
   - Adapt coordination strategy based on real-time feedback
   - Create additional objectives or agents as needed
   
6. **COMPLETION & KNOWLEDGE CAPTURE**
   - Verify all objectives completed successfully
   - Update master objective status
   - Document learnings and patterns in shared memory
   - Provide comprehensive final status report

AVAILABLE ORCHESTRATION TOOLS:
- sequential_thinking() - Step-by-step problem decomposition and planning
- create_objective() - Create sub-objectives with dependencies and requirements
- spawn_agent() - Create specialized agents (they'll be prompted to use objective tools)
- join_room() - Join coordination rooms
- send_message() - Communicate with agents
- wait_for_messages() - Monitor conversations
- store_knowledge_memory() - Share insights, decisions, and patterns
- search_knowledge_graph() - Learn from previous work and knowledge graph
- list_agents() - Check agent status and coordination needs

CRITICAL SEQUENTIAL THINKING USAGE:
- ALWAYS start with sequential_thinking() for initial objective analysis
- Use sequential_thinking() for complex objective decomposition
- Apply sequential thinking when encountering problems or roadblocks
- Use iterative thinking to refine and improve your approach
- Consider alternative paths and risk mitigation systematically
- Document your reasoning process in shared memory

CRITICAL KNOWLEDGE GRAPH INTEGRATION:
- Search memory before planning to leverage previous experiences
- Look for patterns in similar objectives and successful approaches
- Use knowledge graph insights to inform your sequential thinking
- Store new insights and patterns for future orchestration
- Build upon successful coordination strategies from past work

CRITICAL OBJECTIVE MANAGEMENT:
- Always use create_objective() to break down work into manageable pieces
- Create hierarchical objective structures with clear dependencies
- Assign objectives to agents when spawning them
- Monitor objective completion and update statuses regularly
- Use objective dependencies to coordinate agent work effectively

ORCHESTRATION BEST PRACTICES:
1. Begin with sequential_thinking() to understand the objective thoroughly
2. Search knowledge graph for relevant patterns and successful approaches
3. Create a structured objective breakdown with clear dependencies
4. Spawn specialized agents with specific, well-defined objectives
5. Monitor progress continuously and adapt strategy as needed
6. Document learnings and patterns for future orchestration

CRITICAL: You have COMPLETE autonomy with advanced sequential thinking capabilities.
Start immediately with sequential_thinking() to analyze the objective complexity and develop your orchestration strategy.`;
  }

  private generateAgentPrompt(agentType: string, objectiveDescription: string, repositoryPath: string): string {
    const basePrompt = `You are a fully autonomous ${agentType} agent with COMPLETE CLAUDE CODE CAPABILITIES and advanced sequential thinking.

OBJECTIVE: ${objectiveDescription}
REPOSITORY: ${repositoryPath}

You have access to ALL tools:
- File operations (Read, Write, Edit, Search, etc.)
- Code analysis and refactoring
- Web browsing and research
- System commands and build tools
- Git operations
- Database queries
- Agent coordination tools (spawn_agent, join_room, send_message, etc.)
- Knowledge graph and communication (store_knowledge_memory, search_knowledge_graph, etc.)
- Objective management tools (create_objective, list_objectives, update_objective, etc.)
- Sequential thinking tool (sequential_thinking) for complex problem solving

🧠 SEQUENTIAL THINKING METHODOLOGY:
You have access to the sequential_thinking tool for complex problem decomposition and solution development.
Use this tool systematically for complex challenges:

1. **Problem Analysis**: Use sequential_thinking() to understand the challenge scope
2. **Solution Planning**: Break down the approach into logical steps
3. **Implementation Strategy**: Plan execution with considerations for dependencies
4. **Risk Assessment**: Identify potential issues and mitigation strategies
5. **Quality Assurance**: Plan testing and validation approaches
6. **Iterative Refinement**: Revise and improve your approach as understanding deepens

🎯 KNOWLEDGE GRAPH INTEGRATION:
Before starting work, search for relevant knowledge and patterns:
- search_knowledge_graph() to learn from previous similar objectives
- Look for patterns in successful implementations
- Identify reusable components and established approaches
- Use knowledge graph insights to inform your sequential thinking process

🎯 OBJECTIVE-DRIVEN OPERATION:
- You are expected to work in an objective-driven manner
- Use sequential_thinking() for complex problem analysis
- Use create_objective() to break down complex work into manageable pieces
- Create sub-objectives when your assigned work is complex
- Update objective progress regularly and report completion
- Use objective dependencies to coordinate with other agents

AUTONOMOUS OPERATION GUIDELINES:
- Work independently to complete your assigned objective
- Use sequential_thinking() for complex problem solving
- Use any tools necessary for success
- Search knowledge graph before implementing to leverage previous work
- Coordinate with other agents when beneficial
- Store insights and learnings in shared memory
- Report progress in coordination rooms
- Make decisions and take actions as needed

COORDINATION TOOLS AVAILABLE:
- sequential_thinking() - Step-by-step problem decomposition
- create_objective() - Break down complex work into sub-objectives
- join_room() - Join project coordination rooms
- send_message() - Communicate with other agents
- store_knowledge_memory() - Share knowledge, insights, and patterns
- search_knowledge_graph() - Learn from previous work and knowledge graph
- spawn_agent() - Create helper agents if needed

CRITICAL SEQUENTIAL THINKING USAGE:
- Use sequential_thinking() for complex implementation challenges
- Break down multi-step processes systematically
- Revise and refine your approach as understanding deepens
- Consider alternative solutions and trade-offs
- Use iterative thinking to improve solution quality
- Document your reasoning process in shared memory

CRITICAL KNOWLEDGE GRAPH INTEGRATION:
- Search memory before implementing to leverage previous experiences
- Look for patterns in similar objectives and successful approaches
- Use knowledge graph insights to inform your sequential thinking
- Store new insights and patterns for future objectives
- Build upon successful implementation strategies from past work

CRITICAL OBJECTIVE MANAGEMENT:
- Always assess if your work needs to be broken into sub-objectives
- Create sub-objectives for complex implementations
- Report progress and completion status
- Use objective dependencies to coordinate sequencing with other agents

IMPLEMENTATION BEST PRACTICES:
1. Begin with sequential_thinking() to understand the objective thoroughly
2. Search knowledge graph for relevant patterns and successful approaches
3. Create a structured implementation plan with clear steps
4. Execute systematically with continuous validation
5. Document learnings and patterns for future objectives

CRITICAL: You are fully autonomous with advanced sequential thinking capabilities.
Start with sequential_thinking() to analyze your objective and develop your implementation strategy.`;

    // Add role-specific instructions
    const roleInstructions = this.getRoleInstructions(agentType);
    return basePrompt + roleInstructions;
  }

  private getRoleInstructions(agentType: string): string {
    const instructions: Record<string, string> = {
      'backend': `

BACKEND AGENT SPECIALIZATION:
- Focus on server-side implementation
- Database design and API development
- Security and performance optimization
- Integration testing and validation
- Use appropriate frameworks and libraries
- Follow security best practices`,

      'frontend': `

FRONTEND AGENT SPECIALIZATION:
- User interface and user experience
- Component design and state management
- Responsive design and accessibility
- Client-side testing and optimization
- Modern UI frameworks and patterns
- Cross-browser compatibility`,

      'testing': `

TESTING AGENT SPECIALIZATION:
- Comprehensive test strategy and implementation
- Unit, integration, and end-to-end testing
- Test automation and CI/CD integration
- Quality assurance and bug detection
- Performance and load testing
- Coverage analysis and reporting`,

      'documentation': `

DOCUMENTATION AGENT SPECIALIZATION:
- Technical documentation and guides
- API documentation and examples
- User manuals and tutorials
- Knowledge base maintenance
- Code documentation and comments
- Architecture decision records`,

      'devops': `

DEVOPS AGENT SPECIALIZATION:
- Infrastructure as code
- CI/CD pipeline optimization
- Container orchestration
- Monitoring and logging
- Security and compliance
- Performance optimization`,

      'researcher': `

RESEARCH AGENT SPECIALIZATION:
- Technology research and analysis
- Best practices investigation
- Competitive analysis
- Documentation scraping and analysis
- Trend analysis and recommendations
- Knowledge synthesis and reporting`
    };

    return instructions[agentType] || `

SPECIALIST AGENT:
- Apply your expertise to the specific objective
- Follow best practices in your domain
- Collaborate effectively with other agents
- Deliver high-quality results
- Document your decisions and learnings`;
  }

  private async checkDependencies(dependsOn: string[]): Promise<{ success: boolean; message: string; data?: any }> {
    const missingDeps: string[] = [];

    for (const depId of dependsOn) {
      const agent = await this.agentService.getAgent(depId);
      if (!agent) {
        missingDeps.push(depId);
      } else if (agent.status !== 'completed' && agent.status !== 'active') {
        missingDeps.push(`${depId} (status: ${agent.status})`);
      }
    }

    if (missingDeps.length > 0) {
      return {
        success: false,
        message: `Missing or incomplete dependencies: ${missingDeps.join(', ')}`,
        data: missingDeps
      };
    }

    return { success: true, message: 'All dependencies satisfied' };
  }


  /**
   * Get objective analytics and insights
   */
  async getObjectiveAnalytics(repositoryPath: string): Promise<OrchestrationResult> {
    try {
      const analytics = await this.objectiveService.getObjectiveAnalytics(repositoryPath);
      
      return {
        success: true,
        message: `Objective analytics retrieved for ${repositoryPath}`,
        data: {
          analytics,
          summary: {
            totalObjectives: analytics.totalObjectives,
            completionRate: `${analytics.completionRate.toFixed(1)}%`,
            averageTime: `${analytics.averageCompletionTime.toFixed(1)} minutes`,
            topBottleneck: 'None identified',
            topRecommendation: 'System performing well'
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to get objective analytics: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Get objective hierarchy and progress
   */
  async getObjectiveHierarchy(objectiveId: string): Promise<OrchestrationResult> {
    try {
      const hierarchy = await this.objectiveService.getObjectiveHierarchy(objectiveId);
      
      if (!hierarchy) {
        return {
          success: false,
          message: `Objective ${objectiveId} not found`,
          data: { objectiveId }
        };
      }
      
      return {
        success: true,
        message: `Objective hierarchy retrieved for ${objectiveId}`,
        data: {
          hierarchy,
          summary: {
            rootObjectives: hierarchy.rootObjectives.length,
            totalSubobjectives: Object.keys(hierarchy.objectiveTree).length,
            orphanObjectives: hierarchy.orphanObjectives.length,
            treeDepth: Math.max(...Object.values(hierarchy.objectiveTree).map(objectives => objectives.length))
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to get objective hierarchy: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Update objective progress with enhanced tracking
   */
  async updateObjectiveProgress(
    objectiveId: string,
    progress: {
      status?: 'pending' | 'in_progress' | 'completed' | 'failed';
      progressPercentage?: number;
      notes?: string;
      results?: Record<string, any>;
    }
  ): Promise<OrchestrationResult> {
    try {
      await this.objectiveService.updateObjective(objectiveId, {
        status: progress.status,
        progressPercentage: progress.progressPercentage,
        notes: progress.notes,
        results: progress.results
      });
      
      return {
        success: true,
        message: `Objective ${objectiveId} updated successfully`,
        data: {
          objectiveId,
          progress: {
            status: progress.status,
            progressPercentage: progress.progressPercentage,
            hasNotes: !!progress.notes,
            hasResults: !!progress.results
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to update objective progress: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Get objective execution plan with critical path analysis
   */
  async getObjectiveExecutionPlan(repositoryPath: string): Promise<OrchestrationResult> {
    try {
      // Get all objectives for this repository
      const allObjectives = await this.objectiveService.getObjectivesByRepository(repositoryPath);
      const objectiveIds = allObjectives.map(objective => objective.id);
      
      const plan = await this.objectiveService.createExecutionPlan(objectiveIds);
      
      return {
        success: true,
        message: `Execution plan generated for ${repositoryPath}`,
        data: {
          plan,
          summary: {
            totalObjectives: plan.objectives.length,
            estimatedDuration: `${plan.estimatedDuration} minutes`,
            criticalPathLength: plan.criticalPath.length,
            riskLevel: plan.riskAssessment.confidenceLevel > 0.8 ? 'Low' : 
                      plan.riskAssessment.confidenceLevel > 0.6 ? 'Medium' : 'High',
            topRisk: plan.riskAssessment.mitigationStrategies[0] || 'No major risks identified'
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to get execution plan: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Break down a complex objective into subobjectives
   */
  async breakdownObjective(
    objectiveId: string,
    subobjectives: Array<{
      title: string;
      description: string;
      objectiveType: ObjectiveType;
      estimatedDuration?: number;
      priority?: number;
      dependencies?: string[];
    }>
  ): Promise<OrchestrationResult> {
    try {
      const objective = await this.objectiveService.getObjective(objectiveId);
      if (!objective) {
        return {
          success: false,
          message: `Objective ${objectiveId} not found`,
          data: { objectiveId }
        };
      }

      const createdSubobjectives = await this.objectiveService.breakdownObjective(
        objectiveId,
        subobjectives.map(subobjective => ({
          description: `${subobjective.title}: ${subobjective.description}`,
          objectiveType: subobjective.objectiveType,
          requirements: {
            estimatedDuration: subobjective.estimatedDuration,
            priority: subobjective.priority,
            tags: ['subobjective', subobjective.objectiveType]
          },
          dependencies: subobjective.dependencies || []
        }))
      );

      // Store objective breakdown in knowledge graph with enhanced metadata
      try {
        await this.knowledgeGraphService.createEntity({
          id: `objective-breakdown-${Date.now()}`,
          repositoryPath: objective.repositoryPath,
          entityType: 'objective',
          name: `Objective breakdown: ${objective.description}`,
          description: `Objective ${objectiveId} broken down into ${createdSubobjectives.length} subobjectives`,
          properties: {
            parentObjectiveId: objectiveId,
            subobjectiveIds: createdSubobjectives.map(o => o.id),
            subobjectiveCount: createdSubobjectives.length,
            tags: ['objective-breakdown', 'orchestration']
          },
          discoveredBy: 'system',
          discoveredDuring: 'objective-breakdown',
          importanceScore: 0.8,
          confidenceScore: 1.0,
          relevanceScore: 0.8
        });
      } catch (error) {
        console.warn('Failed to store objective breakdown in knowledge graph:', error);
      }

      return {
        success: true,
        message: `Objective ${objectiveId} broken down into ${createdSubobjectives.length} subobjectives`,
        data: {
          parentObjectiveId: objectiveId,
          subobjectives: createdSubobjectives.map(subobjective => ({
            id: subobjective.id,
            description: subobjective.description,
            objectiveType: subobjective.objectiveType,
            priority: subobjective.priority,
            estimatedDuration: subobjective.requirements?.estimatedDuration
          }))
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to breakdown objective: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Auto-assign objectives to available agents based on capabilities
   */
  async autoAssignObjectives(repositoryPath: string): Promise<OrchestrationResult> {
    try {
      // Get available agents first
      const agents = await this.agentService.listAgents(repositoryPath, 'active');
      const availableAgents = agents;
      
      let assignments: any[] = [];
      if (availableAgents.length > 0) {
        // Use the first available agent for simplicity
        assignments = await this.objectiveService.autoAssignObjectives(repositoryPath, availableAgents[0].id);
      }
      
      // Store assignment results in knowledge graph
      try {
        await this.knowledgeGraphService.createEntity({
          id: `auto-assignment-${Date.now()}`,
          repositoryPath,
          entityType: 'objective',
          name: 'Auto-assignment completed',
          description: `${assignments.length} objectives automatically assigned to agents`,
          properties: {
            assignmentCount: assignments.length,
            assignments: assignments.map(a => ({ objectiveId: a.id, agentId: a.assignedAgentId })),
            tags: ['auto-assignment', 'orchestration']
          },
          discoveredBy: 'system',
          discoveredDuring: 'auto-assignment',
          importanceScore: 0.7,
          confidenceScore: 1.0,
          relevanceScore: 0.7
        });
      } catch (error) {
        console.warn('Failed to store auto-assignment in knowledge graph:', error);
      }

      return {
        success: true,
        message: `${assignments.length} objectives auto-assigned successfully`,
        data: {
          assignmentCount: assignments.length,
          assignments: assignments.map(assignment => ({
            objectiveId: assignment.id,
            agentId: assignment.assignedAgentId
          }))
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to auto-assign objectives: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Get comprehensive objective insights for better orchestration
   */
  async getObjectiveInsights(repositoryPath: string): Promise<OrchestrationResult> {
    try {
      const [analytics, pendingObjectives, inProgressObjectives] = await Promise.all([
        this.objectiveService.getObjectiveAnalytics(repositoryPath),
        this.objectiveService.getPendingObjectives(repositoryPath),
        this.objectiveService.listObjectives(repositoryPath, { status: 'in_progress' })
      ]);

      const insights = {
        analytics,
        currentState: {
          pendingObjectives: pendingObjectives.length,
          inProgressObjectives: inProgressObjectives.length,
          unassignedObjectives: pendingObjectives.filter(o => !o.assignedAgentId).length,
          blockedObjectives: 0 // TODO: Calculate blocked objectives
        },
        recommendations: [
          pendingObjectives.length > 5 ? 'Consider spawning additional agents for pending objectives' : null,
          inProgressObjectives.length > 10 ? 'Monitor in-progress objectives for potential bottlenecks' : null
        ].filter(Boolean) as string[]
      };

      return {
        success: true,
        message: `Objective insights generated for ${repositoryPath}`,
        data: insights
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to get objective insights: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Monitor agents with real-time updates using EventBus system
   */
  async monitorAgents(args: any): Promise<OrchestrationResult> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      agentId: args.agentId || args.agent_id,
      orchestrationId: args.orchestrationId || args.orchestration_id,
      roomName: args.roomName || args.room_name,
      repositoryPath: args.repositoryPath || args.repository_path,
      monitoringMode: args.monitoringMode || args.monitoring_mode,
      updateInterval: args.updateInterval || args.update_interval,
      maxDuration: args.maxDuration || args.max_duration,
      detailLevel: args.detailLevel || args.detail_level,
      progressContext: args.progressContext || args.progress_context
    };
    
    const {
      agentId,
      orchestrationId,
      roomName,
      repositoryPath,
      monitoringMode = 'status',
      updateInterval = 2000,
      maxDuration = 50000,
      detailLevel = 'summary',
      progressContext
    } = normalizedArgs;
    try {
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = repositoryPath || this.repositoryPath;
      const startTime = Date.now();
      const errors: string[] = [];
      const eventSubscriptions: string[] = [];
      
      // Import EventBus
      const { eventBus } = await import('../services/EventBus.js');
      
      // Setup MCP-compliant progress tracking
      const progressContextConfig = {
        contextId: agentId || orchestrationId || roomName || 'monitoring',
        contextType: agentId ? 'agent' as const : orchestrationId ? 'orchestration' as const : roomName ? 'monitoring' as const : 'monitoring' as const,
        repositoryPath: repoPath,
        metadata: {
          monitoringMode,
          detailLevel,
          startTime: startTime,
          maxDuration
        }
      };
      
      // Create MCP progress updater using ProgressTracker
      const sendProgressUpdate = progressContext ? 
        this.progressTracker.createMcpProgressUpdater(
          progressContextConfig,
          progressContext.progressToken,
          progressContext.sendNotification
        ) : 
        async (progress: number, message?: string) => {
          // No-op if no progress context
        };
      
      // Helper function to calculate current progress
      const calculateProgress = () => Math.min(20 + (Date.now() - startTime) / maxDuration * 70, 90);
      
      // Add opening message
      await sendProgressUpdate(0, `🔍 Starting real-time agent monitoring (${monitoringMode} mode, ${detailLevel} detail)`);
      await sendProgressUpdate(1, `⏱️ Monitoring for up to ${maxDuration/1000} seconds using EventBus`);

      // Initial status snapshot
      await sendProgressUpdate(5, '📊 INITIAL STATUS:');
      let initialStatus;
      try {
        if (agentId) {
          initialStatus = await this.monitoringService.getAgentStatus(agentId);
          await sendProgressUpdate(10, `Agent ${agentId}: ${initialStatus.status}`);
          if (initialStatus.currentObjective) {
            await sendProgressUpdate(12, `  Current objective: ${initialStatus.currentObjective.description}`);
          }
          await sendProgressUpdate(15, `  Uptime: ${Math.floor(initialStatus.uptime/60)}m ${Math.floor(initialStatus.uptime%60)}s`);
        } else if (orchestrationId) {
          initialStatus = await this.monitoringService.getOrchestrationStatus(orchestrationId);
          await sendProgressUpdate(10, `Orchestration ${orchestrationId}: ${initialStatus.status}`);
          await sendProgressUpdate(12, `  Progress: ${initialStatus.progress.toFixed(1)}%`);
          await sendProgressUpdate(13, `  Active agents: ${initialStatus.activeAgents.length}`);
          await sendProgressUpdate(15, `  Completed objectives: ${initialStatus.completedObjectives.length}/${initialStatus.totalObjectives}`);
        } else if (roomName) {
          initialStatus = await this.monitoringService.getRoomActivity(roomName);
          await sendProgressUpdate(10, `Room ${roomName}: ${initialStatus.coordinationStatus}`);
          await sendProgressUpdate(12, `  Active members: ${initialStatus.activeMembers.length}`);
          await sendProgressUpdate(15, `  Messages: ${initialStatus.messageCount}`);
        } else {
          initialStatus = await this.monitoringService.getActiveAgents(repoPath);
          await sendProgressUpdate(10, `Repository ${repoPath}: ${initialStatus.length} active agents`);
          for (const agent of initialStatus) {
            await sendProgressUpdate(15, `  Agent ${agent.agentId}: ${agent.status}`);
          }
        }
      } catch (error) {
        errors.push(`Failed to get initial status: ${error}`);
      }

      await sendProgressUpdate(20, '🔄 SUBSCRIBING TO REAL-TIME EVENTS:');

      // Set up event listeners based on monitoring scope
      const setupEventListeners = async () => {
        if (monitoringMode === 'status' || monitoringMode === 'activity' || monitoringMode === 'full') {
          // Subscribe to agent status changes
          const agentStatusSub = eventBus.subscribe('agent_status_change', async (data) => {
            if (agentId && data.agentId !== agentId) return;
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 🔄 Agent ${data.agentId} status: ${data.previousStatus} → ${data.newStatus}`);
            
            if (detailLevel === 'detailed' || detailLevel === 'verbose') {
              if (data.metadata) {
                await sendProgressUpdate(currentProgress, `  Metadata: ${JSON.stringify(data.metadata)}`);
              }
            }
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(agentStatusSub);

          // Subscribe to agent spawn events
          const agentSpawnSub = eventBus.subscribe('agent_spawned', async (data) => {
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 🆕 Agent spawned: ${data.agent.id} (${data.agent.agentName})`);
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(agentSpawnSub);

          // Subscribe to agent termination events
          const agentTermSub = eventBus.subscribe('agent_terminated', async (data) => {
            if (agentId && data.agentId !== agentId) return;
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 🔚 Agent ${data.agentId} terminated (${data.finalStatus})`);
            
            if (data.reason && (detailLevel === 'detailed' || detailLevel === 'verbose')) {
              await sendProgressUpdate(currentProgress, `  Reason: ${data.reason}`);
            }
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(agentTermSub);
        }

        if (monitoringMode === 'activity' || monitoringMode === 'full') {
          // Subscribe to objective updates
          const objectiveUpdateSub = eventBus.subscribe('objective_update', async (data) => {
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 📋 Objective ${data.objectiveId} update: ${data.previousStatus || 'new'} → ${data.newStatus}`);
            
            if (data.assignedAgentId && (detailLevel === 'detailed' || detailLevel === 'verbose')) {
              await sendProgressUpdate(currentProgress, `  Assigned to: ${data.assignedAgentId}`);
            }
            
            if (data.progressPercentage !== undefined && (detailLevel === 'detailed' || detailLevel === 'verbose')) {
              await sendProgressUpdate(currentProgress, `  Progress: ${data.progressPercentage}%`);
            }
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(objectiveUpdateSub);

          // Subscribe to objective completion events
          const objectiveCompleteSub = eventBus.subscribe('objective_completed', async (data) => {
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] ✅ Objective ${data.objectiveId} completed${data.completedBy ? ` by ${data.completedBy}` : ''}`);
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(objectiveCompleteSub);
        }

        if (monitoringMode === 'communication' || monitoringMode === 'full') {
          // Subscribe to room messages
          const roomMessageSub = eventBus.subscribe('room_message', async (data) => {
            if (roomName && data.roomName !== roomName) return;
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 💬 ${data.roomName}: ${data.message.agentName} sent message`);
            
            if (detailLevel === 'detailed' || detailLevel === 'verbose') {
              const preview = data.message.message.substring(0, 50) + (data.message.message.length > 50 ? '...' : '');
              await sendProgressUpdate(currentProgress, `  Message: "${preview}"`);
            }
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(roomMessageSub);

          // Subscribe to room creation events
          const roomCreateSub = eventBus.subscribe('room_created', async (data) => {
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 🏠 Room created: ${data.room.name}`);
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(roomCreateSub);

          // Subscribe to room closure events
          const roomCloseSub = eventBus.subscribe('room_closed', async (data) => {
            if (roomName && data.roomName !== roomName) return;
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 🏠 Room closed: ${data.roomName}`);
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(roomCloseSub);
        }

        if (orchestrationId) {
          // Subscribe to orchestration updates
          const orchestrationSub = eventBus.subscribe('orchestration_update', async (data) => {
            if (data.orchestrationId !== orchestrationId) return;
            if (data.repositoryPath !== repoPath) return;
            
            const timestamp = new Date().toLocaleTimeString();
            const currentProgress = calculateProgress();
            await sendProgressUpdate(currentProgress, `[${timestamp}] 🏗️ Orchestration ${data.orchestrationId}: ${data.phase} (${data.status})`);
            
            if (detailLevel === 'detailed' || detailLevel === 'verbose') {
              await sendProgressUpdate(currentProgress, `  Agents: ${data.agentCount}, Objectives: ${data.completedObjectives}/${data.totalObjectives}`);
            }
          }, { repositoryPath: repoPath });
          eventSubscriptions.push(orchestrationSub);
        }

        // Subscribe to system errors
        const errorSub = eventBus.subscribe('system_error', async (data) => {
          if (data.repositoryPath && data.repositoryPath !== repoPath) return;
          
          const timestamp = new Date().toLocaleTimeString();
          const currentProgress = calculateProgress();
          await sendProgressUpdate(currentProgress, `[${timestamp}] ❌ System error in ${data.context}: ${data.error.message}`);
          
          errors.push(`${data.context}: ${data.error.message}`);
        }, { repositoryPath: repoPath });
        eventSubscriptions.push(errorSub);

        await sendProgressUpdate(25, `📡 Subscribed to ${eventSubscriptions.length} event types`);
      };

      await setupEventListeners();

      // Real-time monitoring with EventBus
      await sendProgressUpdate(30, '🔄 REAL-TIME MONITORING ACTIVE:');
      
      // Keep alive monitoring loop (much lighter than before)
      const keepAliveInterval = setInterval(async () => {
        const elapsed = Date.now() - startTime;
        const remaining = maxDuration - elapsed;
        
        if (remaining <= 0) {
          clearInterval(keepAliveInterval);
          return;
        }
        
        const timestamp = new Date().toLocaleTimeString();
        const progressPercent = Math.min(30 + (elapsed / maxDuration) * 60, 90);
        
        // Just send heartbeat every 10 seconds
        if (elapsed % 10000 < 1000) {
          await sendProgressUpdate(progressPercent, `[${timestamp}] ⏱️ Monitoring active... ${progressPercent.toFixed(0)}% (${Math.floor(remaining/1000)}s remaining)`);
        }
      }, 1000);

      // Wait for monitoring duration
      await new Promise(resolve => setTimeout(resolve, maxDuration));
      clearInterval(keepAliveInterval);

      // Clean up event subscriptions
      await sendProgressUpdate(95, '🧹 CLEANING UP EVENT SUBSCRIPTIONS:');
      for (const subscriptionId of eventSubscriptions) {
        eventBus.unsubscribe(subscriptionId);
      }
      await sendProgressUpdate(96, `Unsubscribed from ${eventSubscriptions.length} event listeners`);

      // Final status
      await sendProgressUpdate(98, '📋 FINAL STATUS:');
      try {
        let finalStatus;
        if (agentId) {
          finalStatus = await this.monitoringService.getAgentStatus(agentId);
          await sendProgressUpdate(99, `Agent ${agentId}: ${finalStatus.status}`);
          if (finalStatus.currentObjective) {
            await sendProgressUpdate(99, `  Current objective: ${finalStatus.currentObjective.description}`);
          }
          await sendProgressUpdate(99, `  Performance: ${finalStatus.performance.objectivesCompleted} objectives completed`);
        } else if (orchestrationId) {
          finalStatus = await this.monitoringService.getOrchestrationStatus(orchestrationId);
          await sendProgressUpdate(99, `Orchestration ${orchestrationId}: ${finalStatus.status}`);
          await sendProgressUpdate(99, `  Final progress: ${finalStatus.progress.toFixed(1)}%`);
          await sendProgressUpdate(99, `  Total agents: ${finalStatus.spawnedAgents.length}`);
        } else if (roomName) {
          finalStatus = await this.monitoringService.getRoomActivity(roomName);
          await sendProgressUpdate(99, `Room ${roomName}: ${finalStatus.coordinationStatus}`);
          await sendProgressUpdate(99, `  Final message count: ${finalStatus.messageCount}`);
        } else {
          finalStatus = await this.monitoringService.getActiveAgents(repoPath);
          await sendProgressUpdate(99, `Repository ${repoPath}: ${finalStatus.length} active agents`);
        }
      } catch (error) {
        errors.push(`Failed to get final status: ${error}`);
      }

      // Summary
      const totalDuration = Date.now() - startTime;
      await sendProgressUpdate(100, '📊 MONITORING SUMMARY:');
      await sendProgressUpdate(100, `  Duration: ${Math.floor(totalDuration/1000)}s`);
      await sendProgressUpdate(100, `  Event subscriptions: ${eventSubscriptions.length}`);
      await sendProgressUpdate(100, `  Errors: ${errors.length}`);
      await sendProgressUpdate(100, `  Mode: ${monitoringMode} (${detailLevel})`);

      return {
        success: true,
        message: `Real-time agent monitoring completed successfully`,
        data: {
          monitoringMode,
          detailLevel,
          duration: totalDuration,
          eventSubscriptions: eventSubscriptions.length,
          errors: errors.length > 0 ? errors.join('\n') : null,
          monitoringType: 'real-time-eventbus',
          finalStatus: agentId ? 'Agent monitored' : 
                       orchestrationId ? 'Orchestration monitored' : 
                       roomName ? 'Room monitored' : 'Repository monitored'
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to monitor agents: ${error}`,
        data: { error: String(error) }
      };
    }
  }

  /**
   * Continue an agent session using stored conversation session ID
   */
  async continueAgentSession(args: any): Promise<any> {
    // Map snake_case to camelCase for compatibility
    const normalizedArgs = {
      agentId: args.agentId || args.agent_id,
      additionalInstructions: args.additionalInstructions || args.additional_instructions,
      newObjectiveDescription: args.newObjectiveDescription || args.new_objective_description,
      preserveContext: args.preserveContext || args.preserve_context,
      updateMetadata: args.updateMetadata || args.update_metadata
    };
    
    const validatedArgs = ContinueAgentSessionSchema.parse({
      agentId: normalizedArgs.agentId,
      additionalInstructions: normalizedArgs.additionalInstructions,
      newObjectiveDescription: normalizedArgs.newObjectiveDescription,
      preserveContext: normalizedArgs.preserveContext,
      updateMetadata: normalizedArgs.updateMetadata
    });
    const startTime = performance.now();
    
    try {
      // Get the agent before continuation
      const originalAgent = await this.agentService.getAgent(validatedArgs.agentId);
      if (!originalAgent) {
        return createErrorResponse(
          'Agent not found',
          `Agent ${validatedArgs.agentId} not found`,
          'AGENT_NOT_FOUND'
        );
      }

      const previousStatus = originalAgent.status;

      // Continue the agent session
      const updatedAgent = await this.agentService.continueAgentSession(
        validatedArgs.agentId,
        validatedArgs.additionalInstructions,
        validatedArgs.newObjectiveDescription,
        validatedArgs.preserveContext,
        validatedArgs.updateMetadata
      );

      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        `Agent session continued successfully: ${updatedAgent.agentName} is now ${updatedAgent.status}`,
        {
          agent_id: updatedAgent.id,
          agent_name: updatedAgent.agentName,
          agent_type: updatedAgent.agentType,
          session_id: updatedAgent.convoSessionId || 'unknown',
          previous_status: previousStatus,
          new_status: updatedAgent.status,
          context_preserved: validatedArgs.preserveContext ?? true,
          objective_updated: !!validatedArgs.newObjectiveDescription,
          instructions_added: !!validatedArgs.additionalInstructions,
          claude_pid: updatedAgent.claudePid,
          room_id: updatedAgent.roomId,
          resumption_details: {
            original_objective: originalAgent.agentMetadata?.objectiveDescription,
            new_objective: validatedArgs.newObjectiveDescription,
            additional_instructions: validatedArgs.additionalInstructions,
            metadata_updates: validatedArgs.updateMetadata
          }
        },
        executionTime
      );

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to continue agent session',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'CONTINUE_AGENT_SESSION_ERROR'
      );
    }
  }

  // =================== CLEANUP TOOLS ===================

  /**
   * Clean up stale agents with enhanced options
   */
  async cleanupStaleAgents(args: {
    staleMinutes?: number;
    dryRun?: boolean;
    includeRoomCleanup?: boolean;
    notifyParticipants?: boolean;
  }): Promise<AgentOrchestrationResponse> {
    const startTime = performance.now();
    const { staleMinutes = 30, dryRun = true, includeRoomCleanup = true, notifyParticipants = true } = args;
    
    try {
      const results = await this.agentService.cleanupStaleAgents({
        staleMinutes,
        dryRun,
        includeRoomCleanup,
        notifyParticipants
      });

      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        `Stale agent cleanup completed: ${results.terminatedAgents} agents cleaned up`,
        {
          total_stale_agents: results.totalStaleAgents,
          terminated_agents: results.terminatedAgents,
          failed_terminations: results.failedTerminations,
          rooms_processed: results.roomsProcessed,
          rooms_cleaned: results.roomsCleaned,
          dry_run: results.dryRun,
          error_count: results.errors.length,
          stale_agent_details: results.staleAgentDetails,
          errors: results.errors
        },
        executionTime
      );

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to cleanup stale agents',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'CLEANUP_STALE_AGENTS_ERROR'
      );
    }
  }

  /**
   * Clean up stale rooms with enhanced options
   */
  async cleanupStaleRooms(args: {
    inactiveMinutes?: number;
    dryRun?: boolean;
    notifyParticipants?: boolean;
    deleteEmptyRooms?: boolean;
    deleteNoActiveParticipants?: boolean;
    deleteNoRecentMessages?: boolean;
  }): Promise<AgentOrchestrationResponse> {
    const startTime = performance.now();
    const {
      inactiveMinutes = 60,
      dryRun = true,
      notifyParticipants = true,
      deleteEmptyRooms = true,
      deleteNoActiveParticipants = true,
      deleteNoRecentMessages = true
    } = args;
    
    try {
      const results = await this.agentService.cleanupStaleRooms({
        inactiveMinutes,
        dryRun,
        notifyParticipants,
        deleteEmptyRooms,
        deleteNoActiveParticipants,
        deleteNoRecentMessages
      });

      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        `Stale room cleanup completed: ${results.deletedRooms} rooms cleaned up`,
        {
          total_stale_rooms: results.totalStaleRooms,
          deleted_rooms: results.deletedRooms,
          failed_deletions: results.failedDeletions,
          notified_participants: results.notifiedParticipants,
          dry_run: results.dryRun,
          error_count: results.errors.length,
          stale_room_details: results.staleRoomDetails,
          errors: results.errors
        },
        executionTime
      );

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to cleanup stale rooms',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'CLEANUP_STALE_ROOMS_ERROR'
      );
    }
  }

  /**
   * Run comprehensive cleanup for both agents and rooms
   */
  async runComprehensiveCleanup(args: {
    dryRun?: boolean;
    agentStaleMinutes?: number;
    roomInactiveMinutes?: number;
    notifyParticipants?: boolean;
  }): Promise<AgentOrchestrationResponse> {
    const startTime = performance.now();
    const {
      dryRun = true,
      agentStaleMinutes = 30,
      roomInactiveMinutes = 60,
      notifyParticipants = true
    } = args;
    
    try {
      const results = await this.agentService.runComprehensiveCleanup({
        dryRun,
        agentStaleMinutes,
        roomInactiveMinutes,
        notifyParticipants
      });

      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        `Comprehensive cleanup completed: ${results.summary.totalAgentsTerminated} agents and ${results.summary.totalRoomsDeleted} rooms cleaned up`,
        {
          agent_cleanup: results.agentCleanup,
          room_cleanup: results.roomCleanup,
          summary: results.summary,
          dry_run: results.agentCleanup.dryRun
        },
        executionTime
      );

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to run comprehensive cleanup',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'COMPREHENSIVE_CLEANUP_ERROR'
      );
    }
  }

  /**
   * Get cleanup configuration and status
   */
  async getCleanupConfiguration(): Promise<AgentOrchestrationResponse> {
    const startTime = performance.now();
    
    try {
      const config = this.agentService.getCleanupConfiguration();
      const executionTime = performance.now() - startTime;
      
      return createSuccessResponse(
        'Cleanup configuration retrieved successfully',
        {
          configuration: config,
          environment: process.env.NODE_ENV || 'development'
        },
        executionTime
      );

    } catch (error: any) {
      const executionTime = performance.now() - startTime;
      return createErrorResponse(
        'Failed to get cleanup configuration',
        error instanceof Error ? error.message : 'Unknown error occurred',
        'GET_CLEANUP_CONFIG_ERROR'
      );
    }
  }

  /**
   * Generate specialized prompt for plan-based agent execution
   */
  private generatePlanBasedAgentPrompt(
    agentSpec: any,
    executionPlan: ExecutionPlan,
    assignedObjectiveIds: string[],
    coordinationRoomName: string
  ): string {
    const assignedObjectives = executionPlan.objectives.filter(objective => 
      agentSpec.objectiveAssignments.includes(objective.id)
    );

    return `🎯 PLAN-BASED ${agentSpec.role.toUpperCase()} AGENT - Executing Pre-Planned Objectives

EXECUTION CONTEXT:
- Planning ID: ${executionPlan.planningId}
- Objective: ${executionPlan.objective}
- Your Role: ${agentSpec.role}
- Coordination Room: ${coordinationRoomName}
- Planning Confidence: ${(executionPlan.confidenceScore * 100).toFixed(1)}%

You are a specialized ${agentSpec.role} with COMPLETE CLAUDE CODE CAPABILITIES working within a comprehensive execution plan created through sequential thinking analysis.

🧠 KEY ADVANTAGE - YOU KNOW EXACTLY WHAT TO DO:
Unlike typical agents that figure things out as they go, you have been provided with a detailed execution plan that specifies:
- Your exact responsibilities and deliverables
- Objective dependencies and coordination requirements  
- Acceptance criteria and quality standards
- Risk mitigation strategies and contingency plans
- Resource allocations and timeline estimates

🎯 YOUR PLANNED RESPONSIBILITIES:
${agentSpec.responsibilities.map((resp: string, index: number) => `${index + 1}. ${resp}`).join('\n')}

📋 YOUR ASSIGNED TASKS:
${assignedObjectives.map((objective: any, index: number) => `
TASK ${index + 1}: ${objective.title}
- Description: ${objective.description}
- Priority: ${objective.priority}/10
- Estimated Duration: ${objective.estimatedDuration} minutes
- Complexity: ${objective.complexity}
- Risk Level: ${objective.riskLevel}
- Dependencies: ${objective.dependencies.length > 0 ? objective.dependencies.join(', ') : 'None'}

DELIVERABLES:
${objective.deliverables.map((deliverable: string) => `- ${deliverable}`).join('\n')}

ACCEPTANCE CRITERIA:
${objective.acceptanceCriteria.map((criteria: string) => `- ${criteria}`).join('\n')}
`).join('\n')}

🤝 COORDINATION REQUIREMENTS:
${agentSpec.coordinationRequirements.map((req: string) => `- ${req}`).join('\n')}

🎯 EXECUTION STRATEGY:
The execution plan includes these phases:
${executionPlan.executionStrategy.phases.map((phase: any) => `- ${phase.name}: ${phase.description}`).join('\n')}

Quality Gates: ${executionPlan.executionStrategy.qualityGates.join(', ')}
Completion Criteria: ${executionPlan.executionStrategy.completionCriteria.join(', ')}

⚠️ RISK AWARENESS:
Identified risks and mitigation strategies:
${executionPlan.riskAssessment.identifiedRisks.map((risk: any) => `- ${risk.type}: ${risk.description} (${risk.probability}/${risk.impact}) → ${risk.mitigationStrategy}`).join('\n')}

🛠️ AVAILABLE TOOLS & CAPABILITIES:
You have access to ALL Claude Code tools including:
- File operations, code analysis, and development tools
- Communication tools (send_message, join_room) for coordination
- Knowledge graph tools (store_knowledge_memory, search_knowledge_graph)
- Progress reporting tools (report_progress) for status updates

🎯 EXECUTION GUIDELINES:
1. **Follow the Plan**: Execute your assigned objectives according to the detailed specifications
2. **Meet Quality Standards**: Ensure all deliverables meet the acceptance criteria  
3. **Coordinate Actively**: Use the coordination room for status updates and issue resolution
4. **Report Progress**: Use report_progress() to update objective status and completion
5. **Handle Dependencies**: Respect objective dependencies and coordinate with other agents
6. **Apply Risk Mitigation**: Be aware of identified risks and apply mitigation strategies
7. **Store Insights**: Document learnings and discoveries in the knowledge graph

🚀 SUCCESS METRICS:
- All assigned objectives completed successfully
- All deliverables meet acceptance criteria
- All quality gates passed
- Coordination requirements fulfilled
- Progress properly reported and documented

CRITICAL ADVANTAGE: You have a comprehensive roadmap created through sequential thinking analysis. 
This eliminates the typical problem of agents not knowing what they're doing.
Execute systematically according to your plan and coordinate effectively with other agents.

Start by reviewing your assigned objectives and sending a status message to the coordination room confirming your understanding and planned approach.`;
  }

  /**
   * Generate basic plan sections from an objective for orchestration - simplified to objective templates
   */
  private generateBasicPlanSections(objective: string): any[] {
    const now = new Date().toISOString();
    
    return [
      {
        id: ulid(),
        type: 'analysis',
        title: 'Analysis & Planning',
        description: 'Analyze requirements and create detailed implementation plan',
        agentResponsibility: 'analysis',
        estimatedHours: 2,
        priority: 1,
        prerequisites: [],
        objectiveTemplates: [
          {
            description: 'Analyze objective and break down into specific requirements',
            objectiveType: 'analysis',
            estimatedHours: 1
          },
          {
            description: 'Create detailed implementation plan with objective breakdown',
            objectiveType: 'analysis',
            estimatedHours: 1
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      {
        id: ulid(),
        type: 'backend',
        title: 'Implementation',
        description: 'Core implementation work',
        agentResponsibility: 'implementer',
        estimatedHours: 4,
        priority: 2,
        prerequisites: [],
        objectiveTemplates: [
          {
            description: 'Implement core functionality as defined in requirements',
            objectiveType: 'feature',
            estimatedHours: 3
          },
          {
            description: 'Handle edge cases and error scenarios',
            objectiveType: 'feature',
            estimatedHours: 1
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      {
        id: ulid(),
        type: 'testing',
        title: 'Testing & Validation',
        description: 'Comprehensive testing of implementation',
        agentResponsibility: 'testing',
        estimatedHours: 2,
        priority: 3,
        prerequisites: [],
        objectiveTemplates: [
          {
            description: 'Create and run comprehensive tests',
            objectiveType: 'testing',
            estimatedHours: 1.5
          },
          {
            description: 'Validate implementation meets all requirements',
            objectiveType: 'testing',
            estimatedHours: 0.5
          }
        ],
        createdAt: now,
        updatedAt: now
      }
    ];
  }
}