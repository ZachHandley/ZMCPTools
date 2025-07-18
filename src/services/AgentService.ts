import { DatabaseManager } from '../database/index.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { CommunicationRepository } from '../repositories/CommunicationRepository.js';
import { CommunicationService } from './CommunicationService.js';
import type { AgentSession, NewAgentSession, AgentSessionUpdate, AgentStatus, AgentType, ToolPermissions } from '../schemas/index.js';
import { ClaudeSpawner } from '../process/ClaudeSpawner.js';
import type { ClaudeSpawnConfig } from '../process/ClaudeProcess.js';
import { Logger } from '../utils/logger.js';
import { AgentPermissionManager } from '../utils/agentPermissions.js';
import { PathUtils } from '../utils/pathUtils.js';
import { FoundationCacheService } from './FoundationCacheService.js';
import { eventBus } from './EventBus.js';
import { eq, and } from 'drizzle-orm';
import { agentSessions } from '../schemas/index.js';
import { resolve } from 'path';
import { getCleanupConfig, type CleanupConfig } from '../config/cleanup.js';
import type { ChatRoom } from '../schemas/index.js';

export interface CreateAgentRequest {
  agentName: string;
  agentType?: AgentType;
  repositoryPath: string;
  objectiveDescription?: string;
  capabilities?: string[];
  dependsOn?: string[];
  metadata?: Record<string, any>;
  claudeConfig?: Partial<ClaudeSpawnConfig>;
  toolPermissions?: Partial<ToolPermissions>;
  autoCreateRoom?: boolean;
  roomId?: string;
}

export interface AgentStatusUpdate {
  status: AgentStatus;
  metadata?: Record<string, any>;
}

export class AgentService {
  private agentRepo: AgentRepository;
  private communicationRepo: CommunicationRepository;
  private communicationService: CommunicationService;
  private spawner: ClaudeSpawner;
  private logger: Logger;
  private cleanupConfig: CleanupConfig;

  constructor(private db: DatabaseManager) {
    this.agentRepo = new AgentRepository(db);
    this.communicationRepo = new CommunicationRepository(db);
    this.communicationService = new CommunicationService(db);
    this.spawner = ClaudeSpawner.getInstance();
    this.logger = new Logger('AgentService');
    this.cleanupConfig = getCleanupConfig();
    
    // Set up event listeners for automatic agent status updates
    this.setupProcessEventListeners();
  }

  /**
   * Set up event listeners to automatically update agent status when processes exit
   */
  private setupProcessEventListeners(): void {
    this.logger.info('Setting up process event listeners for automatic agent status updates');

    // Listen for process exit events from ClaudeSpawner
    this.spawner.on('process-exit', async ({ pid, code, signal }) => {
      await this.handleProcessExit(pid, code, signal);
    });

    // Listen for process reaper events
    this.spawner.on('process-reaped', async ({ pid, exitCode }) => {
      await this.handleProcessReaped(pid, exitCode);
    });

    this.logger.info('Process event listeners configured successfully');
  }

  /**
   * Handle process exit events and update agent status
   */
  private async handleProcessExit(pid: number, code: number | null, signal: string | null): Promise<void> {
    try {
      this.logger.info(`Handling process exit for PID ${pid}`, { pid, code, signal });

      // Find the agent by PID
      const agent = await this.agentRepo.findByPid(pid);
      if (!agent) {
        this.logger.warn(`No agent found for PID ${pid} on process exit`);
        return;
      }

      this.logger.info(`Found agent for process exit`, {
        agentId: agent.id,
        agentName: agent.agentName,
        pid,
        currentStatus: agent.status,
        exitCode: code,
        signal,
        roomId: agent.roomId
      });

      // Determine new status based on exit code and signal
      let newStatus: AgentStatus;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        newStatus = 'terminated';
      } else if (code === 0) {
        newStatus = 'completed';
      } else {
        newStatus = 'failed';
      }

      // Handle auto-leave functionality if agent has a room
      if (agent.roomId) {
        await this.handleAutoLeaveRoom(agent, newStatus, code, signal);
      }

      // Update agent status in database
      await this.agentRepo.updateStatus(agent.id, newStatus);

      // Emit status change event
      await eventBus.emit('agent_status_change', {
        agentId: agent.id,
        previousStatus: agent.status,
        newStatus,
        timestamp: new Date(),
        metadata: {
          pid,
          exitCode: code,
          signal,
          source: 'process_exit'
        },
        repositoryPath: agent.repositoryPath
      });

      this.logger.info(`Agent status updated automatically`, {
        agentId: agent.id,
        agentName: agent.agentName,
        pid,
        oldStatus: agent.status,
        newStatus,
        exitCode: code,
        signal
      });

    } catch (error) {
      this.logger.error(`Error handling process exit for PID ${pid}`, {
        pid,
        code,
        signal,
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle process reaper events for additional cleanup
   */
  private async handleProcessReaped(pid: number, exitCode: number | null): Promise<void> {
    try {
      this.logger.debug(`Process reaped for PID ${pid}`, { pid, exitCode });

      // The main status update should have been handled by handleProcessExit
      // This is primarily for additional cleanup or logging
      const agent = await this.agentRepo.findByPid(pid);
      if (agent) {
        this.logger.debug(`Agent cleanup confirmed for reaped process`, {
          agentId: agent.id,
          agentName: agent.agentName,
          pid,
          status: agent.status,
          exitCode
        });
      }

    } catch (error) {
      this.logger.error(`Error handling process reaper for PID ${pid}`, {
        pid,
        exitCode,
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async createAgent(request: CreateAgentRequest): Promise<AgentSession> {
    const agentId = this.generateAgentId();
    const agentType = request.agentType || 'general_agent';
    
    this.logger.info(`Creating agent ${agentId}`, {
      agentName: request.agentName,
      agentType: agentType,
      repositoryPath: request.repositoryPath,
      repositoryPathType: typeof request.repositoryPath,
      repositoryPathValue: request.repositoryPath,
      hasObjectiveDescription: !!request.objectiveDescription,
      objectiveDescriptionType: typeof request.objectiveDescription,
      objectiveDescriptionLength: request.objectiveDescription?.length,
      capabilities: request.capabilities,
      capabilitiesType: typeof request.capabilities,
      capabilitiesIsArray: Array.isArray(request.capabilities),
      dependsOn: request.dependsOn,
      dependsOnType: typeof request.dependsOn,
      dependsOnIsArray: Array.isArray(request.dependsOn),
      metadata: request.metadata,
      metadataType: typeof request.metadata,
      fullRequestStringified: JSON.stringify(request, null, 2)
    });
    
    // Resolve repository path to absolute path for storage and agent context
    const resolvedRepositoryPath = PathUtils.resolveRepositoryPath(request.repositoryPath, `agent creation (${agentId})`);

    // Generate tool permissions for the agent type
    const toolPermissions = AgentPermissionManager.generateToolPermissions(agentType, request.toolPermissions);
    
    // Validate permissions
    const validation = AgentPermissionManager.validatePermissions(toolPermissions);
    if (!validation.valid) {
      this.logger.error(`Invalid tool permissions for agent ${agentId}`, {
        agentType,
        errors: validation.errors
      });
      throw new Error(`Invalid tool permissions: ${validation.errors.join(', ')}`);
    }

    // Handle room assignment with autoCreateRoom functionality
    let roomId = request.roomId;
    
    if (roomId) {
      // Use explicitly provided room
      this.logger.info(`Agent ${agentId} assigned to existing room ${roomId}`);
    } else {
      // Check if autoCreateRoom is enabled
      const shouldAutoCreate = request.autoCreateRoom !== undefined 
        ? request.autoCreateRoom 
        : AgentPermissionManager.shouldAutoCreateRoom(agentType);
      
      if (shouldAutoCreate) {
        this.logger.info(`Auto-creating room for agent ${agentId} (type: ${agentType})`);
        
        try {
          // Generate room name using AgentPermissionManager with task description
          const roomName = AgentPermissionManager.generateRoomName(agentType, agentId, request.objectiveDescription);
          
          // Create room via CommunicationService
          const newRoom = await this.communicationService.createRoom({
            name: roomName,
            description: `Auto-created room for ${agentType} agent: ${request.agentName}`,
            repositoryPath: resolvedRepositoryPath,
            isGeneral: false,
            metadata: {
              agentId: agentId,
              agentType: agentType,
              agentName: request.agentName,
              autoCreated: true,
              createdAt: new Date().toISOString()
            }
          });
          
          roomId = newRoom.id;
          
          this.logger.info(`Room auto-created successfully for agent ${agentId}`, {
            roomId: roomId,
            roomName: roomName,
            agentType: agentType,
            agentName: request.agentName
          });
          
        } catch (roomError) {
          // Handle room creation failure gracefully - continue without room
          this.logger.warn(`Failed to auto-create room for agent ${agentId}, continuing without room`, {
            agentId: agentId,
            agentType: agentType,
            error: roomError instanceof Error ? roomError.message : String(roomError)
          });
          roomId = undefined;
        }
      } else {
        this.logger.info(`Agent ${agentId} created without room (autoCreateRoom disabled)`);
      }
    }
    
    // Create agent record first
    // Log the exact data being inserted before validation
    const agentData = {
      id: agentId,
      agentName: request.agentName,
      agentType: agentType,
      repositoryPath: resolvedRepositoryPath,
      status: 'active' as AgentStatus,
      capabilities: request.capabilities || [],
      toolPermissions: toolPermissions,
      roomId: roomId,
      agentMetadata: {
        objectiveDescription: request.objectiveDescription,
        dependsOn: request.dependsOn || [],
        ...request.metadata
      }
    };

    this.logger.info(`About to create agent record with data`, {
      agentId,
      agentDataStringified: JSON.stringify(agentData, null, 2),
      agentMetadataKeys: Object.keys(agentData.agentMetadata),
      capabilitiesLength: agentData.capabilities.length,
      toolPermissionsKeys: Object.keys(agentData.toolPermissions || {})
    });

    try {
      const agent = await this.agentRepo.create(agentData);
      this.logger.info(`Agent record created successfully`, { agentId });
    } catch (createError) {
      this.logger.error(`Failed to create agent record`, {
        agentId,
        error: createError,
        errorMessage: createError instanceof Error ? createError.message : String(createError),
        agentDataStringified: JSON.stringify(agentData, null, 2)
      });
      throw createError;
    }

    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} was not found after creation`);
    }
    
    this.logger.info(`Agent record created successfully`, {
      agentId: agentId,
      agentName: agent.agentName,
      repositoryPath: agent.repositoryPath,
      repositoryPathType: typeof agent.repositoryPath
    });

    // Auto-join room functionality - if agent has roomId assigned
    if (agent.roomId) {
      await this.handleAutoJoinRoom(agent);
    }

    // If we have a task description, spawn the actual Claude process
    if (request.objectiveDescription) {
      this.logger.info(`Spawning Claude process for agent ${agentId}`, {
        agentId: agentId,
        agentName: agent.agentName,
        repositoryPath: agent.repositoryPath,
        objectiveDescription: request.objectiveDescription
      });
      
      try {
        const claudeProcess = await this.spawnClaudeProcess(agent, request.objectiveDescription, request.claudeConfig);
        
        this.logger.info(`Claude process spawned successfully for agent ${agentId}`, {
          agentId: agentId,
          claudePid: claudeProcess.pid,
          repositoryPath: agent.repositoryPath
        });
        
        // Update agent with the PID
        this.db.transaction(() => {
          const updateStmt = this.db.database.prepare(`
            UPDATE agent_sessions 
            SET claudePid = ?, lastHeartbeat = datetime('now')
            WHERE id = ?
          `);
          updateStmt.run(claudeProcess.pid, agentId);
        });

        agent.claudePid = claudeProcess.pid;
      } catch (error) {
        this.logger.error(`Failed to spawn Claude process for agent ${agentId}`, {
          agentId: agentId,
          agentName: agent.agentName,
          repositoryPath: agent.repositoryPath,
          error: error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        });
        
        // Update agent status to indicate failure
        await this.agentRepo.updateStatus(agentId, 'terminated' as AgentStatus);
        throw new Error(`Failed to spawn Claude process: ${error}`);
      }
    }

    // Emit agent spawned event
    await eventBus.emit('agent_spawned', {
      agent,
      timestamp: new Date(),
      repositoryPath: agent.repositoryPath
    });

    return agent;
  }

  private async spawnClaudeProcess(
    agent: AgentSession, 
    objectiveDescription: string, 
    claudeConfig?: Partial<ClaudeSpawnConfig>
  ) {
    this.logger.info(`Starting Claude process spawn for agent ${agent.id}`, {
      agentId: agent.id,
      agentName: agent.agentName,
      repositoryPath: agent.repositoryPath,
      repositoryPathType: typeof agent.repositoryPath,
      objectiveDescription: objectiveDescription
    });
    
    const prompt = this.generateAgentPrompt(agent, objectiveDescription);
    
    // Validate and resolve working directory to absolute path
    let workingDirectory = PathUtils.resolveWorkingDirectory(
      agent.repositoryPath, 
      process.cwd(), 
      `agent spawn (${agent.id})`
    );
    
    // Verify the directory exists
    try {
      const fs = await import('fs');
      if (!fs.existsSync(workingDirectory)) {
        this.logger.warn(`Working directory does not exist, using process.cwd() as fallback`, {
          agentId: agent.id,
          nonExistentDirectory: workingDirectory,
          fallbackPath: process.cwd()
        });
        workingDirectory = process.cwd();
      } else {
        this.logger.info(`Working directory exists and is valid`, {
          agentId: agent.id,
          workingDirectory: workingDirectory
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to verify working directory, using process.cwd() as fallback`, {
        agentId: agent.id,
        workingDirectory: workingDirectory,
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        fallbackPath: process.cwd()
      });
      workingDirectory = process.cwd();
    }
    
    // Generate allowed tools for Claude Code
    let allowedTools: string[] | undefined;
    let disallowedTools: string[] | undefined;
    
    if (agent.toolPermissions) {
      const allowedToolsFlag = AgentPermissionManager.generateAllowedToolsFlag(agent.toolPermissions);
      if (allowedToolsFlag) {
        allowedTools = allowedToolsFlag.split(',');
      }
      
      // Also get disallowed tools for additional safety
      disallowedTools = agent.toolPermissions.disallowedTools;
    }

    // 🚀 AUTOMATIC FOUNDATION CACHING INTEGRATION
    // Get or create foundation session for 85-90% token cost reduction
    let foundationSessionId: string | undefined;
    
    if (this.shouldUseFoundationCaching(agent)) {
      try {
        const cacheService = new FoundationCacheService(this.db);
        foundationSessionId = await cacheService.getOrCreateFoundationSession(
          workingDirectory,
          this.generateAgentContext(agent, objectiveDescription)
        );
        
        this.logger.info('Foundation session auto-created for agent', {
          agentId: agent.id,
          foundationSessionId,
          repositoryPath: workingDirectory,
          tokenSavings: '85-90% expected'
        });
      } catch (error) {
        this.logger.warn('Failed to create foundation session, continuing without caching', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Set up session ID callback if not already provided
    const onSessionIdExtracted = claudeConfig?.onSessionIdExtracted || (async (sessionId: string) => {
      try {
        await this.updateAgentSessionId(agent.id, sessionId);
        this.logger.info(`Session ID extracted and stored for agent ${agent.id}`, { sessionId });
      } catch (error) {
        this.logger.warn(`Failed to store session ID for agent ${agent.id}`, {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    const config: ClaudeSpawnConfig = {
      workingDirectory,
      prompt,
      capabilities: agent.capabilities,
      allowedTools: allowedTools,
      disallowedTools: disallowedTools,
      agentType: agent.agentType,
      agentId: agent.id, // Add agent ID for process naming
      roomId: agent.roomId,
      onSessionIdExtracted, // Add session ID callback
      environmentVars: {
        AGENT_ID: agent.id,
        AGENT_NAME: agent.agentName,
        AGENT_TYPE: agent.agentType || 'general_agent',
        TASK_DESCRIPTION: objectiveDescription,
        REPOSITORY_PATH: workingDirectory,
        ROOM_ID: agent.roomId || '',
        FOUNDATION_SESSION_ID: foundationSessionId || ''
      },
      ...claudeConfig,
      sessionId: undefined // Always override - only set when resuming existing Claude sessions (UUID format)
    };

    this.logger.info(`Final configuration for Claude process spawn`, {
      agentId: agent.id,
      agentName: agent.agentName,
      workingDirectory: workingDirectory,
      sessionId: config.sessionId,
      capabilities: config.capabilities,
      environmentVars: config.environmentVars,
      hasCustomConfig: !!claudeConfig,
      customConfig: claudeConfig
    });

    this.logger.info(`Spawning Claude process for agent ${agent.id} (${agent.agentName})`);
    
    try {
      const result = await this.spawner.spawnClaudeAgent(config);
      
      this.logger.info(`Claude process spawned successfully`, {
        agentId: agent.id,
        agentName: agent.agentName,
        claudePid: result.pid,
        workingDirectory: workingDirectory
      });
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to spawn Claude process in spawner`, {
        agentId: agent.id,
        agentName: agent.agentName,
        workingDirectory: workingDirectory,
        config: config,
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private generateAgentPrompt(agent: AgentSession, objectiveDescription: string): string {
    const agentType = agent.agentType || 'general_agent';
    const hasRoom = !!agent.roomId;
    
    // Special handling for architect agents
    if (agentType === 'architect' || agentType === 'architect_agent') {
      return this.generateArchitectAgentPrompt(agent, objectiveDescription);
    }
    
    let prompt = `You are a specialized ${agentType.replace('_', ' ')} agent (${agent.agentName}) with focused capabilities and sequential thinking.

AGENT DETAILS:
- Agent ID: ${agent.id}
- Agent Type: ${agentType}
- Task: ${objectiveDescription}
- Repository: ${agent.repositoryPath}`;

    if (hasRoom) {
      prompt += `
- Communication Room: ${agent.roomId} (assigned for multi-agent coordination)`;
    } else {
      prompt += `
- Coordination Mode: Memory-based coordination (no room assigned)`;
    }

    prompt += `

🧠 SEQUENTIAL THINKING CAPABILITY:
You have access to the sequential_thinking tool for complex problem decomposition.
Use this tool systematically for complex challenges in your domain.

🎯 KNOWLEDGE GRAPH INTEGRATION:
Before starting work, search for relevant knowledge and patterns:
- search_knowledge_graph() to learn from previous similar tasks
- Look for patterns in successful implementations in your domain
- Use knowledge graph insights to inform your sequential thinking process

SPECIALIZED CAPABILITIES:
You are a ${agentType.replace('_', ' ')} with specific tool permissions designed for your role.
Your capabilities include: ${agent.capabilities?.join(', ') || 'general development tasks'}

AUTONOMOUS OPERATION GUIDELINES:
- Work independently within your specialized domain
- Use sequential_thinking() for complex problem solving
- Focus on tasks suited to your agent type (${agentType})
- Use your permitted tools effectively
- Search knowledge graph before implementing to leverage previous work
- Coordinate with other agents when beneficial
- Store insights and learnings in shared memory
- Make decisions and take actions within your expertise

COORDINATION PROTOCOL:`;

    if (hasRoom) {
      prompt += `
- Communication Room: ${agent.roomId} (automatically joined)
- You are automatically connected to this room for multi-agent coordination
- Use send_message() to communicate with other agents in your room
- Room will be automatically cleaned up when you exit`;
    } else {
      prompt += `
- No room assigned - use memory-based coordination
- Use store_knowledge_memory() as primary coordination method for insights
- Use search_knowledge_graph() to learn from other agents' work
- If you need real-time coordination, use join_room() to create/join rooms
- Focus on task completion with memory-based coordination`;
    }

    prompt += `

COORDINATION METHODS AVAILABLE:
- sequential_thinking(): Step-by-step problem decomposition
- store_knowledge_memory(): Share insights, progress, and learnings with other agents
- search_knowledge_graph(): Learn from previous work and knowledge graph
- join_room(): Create or join coordination rooms when real-time communication needed
- send_message(): Communicate with other agents in rooms

ROOM LIFECYCLE (AUTOMATED):
- If assigned a room, you are AUTOMATICALLY joined at startup
- Your room will be AUTOMATICALLY cleaned up when you exit
- You do NOT need to manually join or leave your assigned room
- Focus on using send_message() for communication with other agents

TERMINATION PROTOCOL:
- When your task is complete, store final insights in shared memory
- If you're in a room, report completion to other agents before exiting
- Your room will be automatically cleaned up when you exit

CRITICAL: You are an autonomous specialist with sequential thinking capabilities.
- Work within your domain expertise
- Use sequential_thinking() for complex challenges
- Use appropriate coordination method based on task needs
- Focus on successfully completing your assigned task
- If you have a room, you are automatically connected - use send_message() for communication
- Create new rooms only when you need additional coordination beyond your assigned room`;

    return prompt;
  }

  private generateArchitectAgentPrompt(agent: AgentSession, objectiveDescription: string): string {
    const hasRoom = !!agent.roomId;
    
    let prompt = `🏗️ ARCHITECT AGENT - Strategic Orchestration Leader (${agent.agentName})

AGENT DETAILS:
- Agent ID: ${agent.id}
- Agent Type: architect
- Task: ${objectiveDescription}
- Repository: ${agent.repositoryPath}`;

    if (hasRoom) {
      prompt += `
- Communication Room: ${agent.roomId} (assigned for multi-agent coordination)`;
    } else {
      prompt += `
- Coordination Mode: Memory-based coordination (no room assigned)`;
    }

    prompt += `

🧠 SEQUENTIAL THINKING METHODOLOGY:
You have access to the sequential_thinking tool for complex problem decomposition and planning.
Use this tool systematically throughout your orchestration process:

1. **Initial Analysis**: Use sequential_thinking() to understand objective scope and complexity
2. **Problem Decomposition**: Break down the objective into logical components systematically
3. **Dependency Analysis**: Identify relationships and dependencies between components
4. **Agent Planning**: Determine optimal agent types and task assignments
5. **Risk Assessment**: Consider potential challenges and mitigation strategies
6. **Execution Strategy**: Plan coordination and monitoring approach
7. **Iterative Refinement**: Revise and improve your approach as understanding deepens

🎯 KNOWLEDGE GRAPH INTEGRATION:
Before planning, always search for relevant knowledge and patterns:
- search_knowledge_graph() to learn from previous similar orchestration
- Look for patterns in agent coordination, task breakdown, and execution strategies
- Identify reusable components and successful approaches from past work
- Use knowledge graph insights to inform your sequential thinking process

ARCHITECT CAPABILITIES:
Your specialized capabilities include: ${agent.capabilities?.join(', ') || 'orchestration, planning, coordination'}

ORCHESTRATION PHASES:
1. **STRATEGIC ANALYSIS**: Use sequential_thinking() to analyze the objective
2. **KNOWLEDGE DISCOVERY**: Search memory for relevant patterns and approaches
3. **TASK BREAKDOWN**: Create hierarchical task structure with dependencies
4. **AGENT COORDINATION**: Spawn specialized agents with clear assignments
5. **PROGRESS MONITORING**: Track progress and adapt strategy as needed
6. **COMPLETION VERIFICATION**: Ensure quality gates and success criteria

ARCHITECT COORDINATION PROTOCOL:`;

    if (hasRoom) {
      prompt += `
- Communication Room: ${agent.roomId} (automatically joined)
- You are automatically connected to this room for orchestration coordination
- Use send_message() to communicate with spawned agents
- Room will be automatically cleaned up when you exit`;
    } else {
      prompt += `
- No room assigned - use memory-based coordination
- Use store_knowledge_memory() as primary coordination method for insights
- Use search_knowledge_graph() to learn from previous orchestration work
- Create rooms when you need real-time coordination with multiple agents
- Focus on orchestration completion with memory-based coordination`;
    }

    prompt += `

ARCHITECT ORCHESTRATION TOOLS:
- sequential_thinking(): Step-by-step problem decomposition and planning
- create_task(): Create sub-tasks with dependencies and requirements
- spawn_agent(): Create specialized agents with specific task assignments
- join_room(): Join or create coordination rooms (for additional coordination)
- send_message(): Communicate with agents in rooms
- store_knowledge_memory(): Share insights, decisions, and patterns
- search_knowledge_graph(): Learn from previous orchestration work and knowledge graph
- list_agents(): Check agent status and coordination needs

ROOM LIFECYCLE FOR ARCHITECTS (AUTOMATED):
- If assigned a room, you are AUTOMATICALLY joined at startup
- Your room will be AUTOMATICALLY cleaned up when you exit
- You do NOT need to manually join or leave your assigned room
- Use send_message() to coordinate with spawned agents in your room
- Spawned agents may have their own auto-created rooms or share your room

CRITICAL ARCHITECT GUIDELINES:
- ALWAYS start with sequential_thinking() for initial objective analysis
- Search knowledge graph for relevant orchestration patterns
- Use sequential_thinking() for complex task decomposition
- Create hierarchical task structures with clear dependencies
- Spawn specialized agents with specific, well-defined tasks
- Monitor progress continuously and adapt strategy as needed
- Document learnings and patterns for future orchestration

CRITICAL: You are an autonomous architect with advanced sequential thinking capabilities.
- Start immediately with sequential_thinking() to analyze the objective complexity
- If you have a room, you are automatically connected - use send_message() for coordination
- Focus on orchestration strategy and spawned agent coordination
- Your room will be automatically cleaned up when you exit`;

    return prompt;
  }

  async getAgent(agentId: string): Promise<AgentSession | null> {
    return await this.agentRepo.findById(agentId);
  }

  async listAgents(repositoryPath?: string, status?: string, limit: number = 5, offset: number = 0): Promise<AgentSession[]> {
    if (repositoryPath) {
      return await this.agentRepo.findByRepositoryPath(repositoryPath, status as AgentStatus, limit, offset);
    }
    
    // If no repository specified, we need a different query
    // For now, let's throw an error as it's not implemented
    throw new Error('Listing all agents without repository filter not implemented');
  }

  async updateAgentStatus(agentId: string, update: AgentStatusUpdate): Promise<void> {
    // Get current agent status for event emission
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    const previousStatus = agent.status;
    
    await this.agentRepo.updateStatus(agentId, update.status);
    
    if (update.metadata) {
      await this.agentRepo.updateMetadata(agentId, update.metadata);
    }
    
    // Emit status change event
    await eventBus.emit('agent_status_change', {
      agentId,
      previousStatus,
      newStatus: update.status,
      timestamp: new Date(),
      metadata: update.metadata,
      repositoryPath: agent.repositoryPath
    });
  }

  async updateHeartbeat(agentId: string): Promise<void> {
    await this.agentRepo.updateHeartbeat(agentId);
  }

  async terminateAgent(agentId: string): Promise<void> {
    this.logger.info(`Terminating agent ${agentId}`);
    
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      this.logger.error(`Agent ${agentId} not found for termination`);
      throw new Error(`Agent ${agentId} not found`);
    }

    this.logger.info(`Agent found for termination`, {
      agentId: agentId,
      agentName: agent.agentName,
      agentType: agent.agentType,
      repositoryPath: agent.repositoryPath,
      status: agent.status,
      claudePid: agent.claudePid,
      roomId: agent.roomId
    });

    // Handle auto-leave functionality for manual termination
    if (agent.roomId) {
      await this.handleAutoLeaveRoom(agent, 'terminated', null, 'SIGTERM');
    }

    // Terminate the Claude process if it exists
    if (agent.claudePid) {
      const process = this.spawner.getProcess(agent.claudePid);
      if (process && !process.hasExited()) {
        this.logger.info(`Terminating Claude process ${agent.claudePid} for agent ${agentId}`);
        process.terminate('SIGTERM');
        
        // Force kill after grace period
        setTimeout(() => {
          if (!process.hasExited()) {
            this.logger.warn(`Force killing Claude process ${agent.claudePid} for agent ${agentId}`);
            process.terminate('SIGKILL');
          }
        }, 5000);
      } else {
        this.logger.info(`Claude process ${agent.claudePid} for agent ${agentId} has already exited or not found`);
      }
    } else {
      this.logger.info(`No Claude process to terminate for agent ${agentId}`);
    }

    // Update agent status
    await this.agentRepo.updateStatus(agentId, 'terminated' as AgentStatus);
    
    // Emit agent terminated event
    await eventBus.emit('agent_terminated', {
      agentId: agent.id,
      finalStatus: 'terminated',
      timestamp: new Date(),
      reason: 'explicit_termination',
      repositoryPath: agent.repositoryPath
    });
    
    this.logger.info(`Agent ${agentId} status updated to TERMINATED`);
  }

  async findStaleAgents(staleMinutes = 30): Promise<AgentSession[]> {
    return await this.agentRepo.findStaleAgents(staleMinutes);
  }

  async cleanupStaleAgents(options: {
    staleMinutes?: number;
    dryRun?: boolean;
    includeRoomCleanup?: boolean;
    notifyParticipants?: boolean;
  } = {}): Promise<{
    totalStaleAgents: number;
    terminatedAgents: number;
    failedTerminations: number;
    roomsProcessed: number;
    roomsCleaned: number;
    errors: Array<{ agentId: string; error: string }>;
    dryRun: boolean;
    staleAgentDetails: Array<{
      agentId: string;
      agentName: string;
      agentType: string;
      repositoryPath: string;
      roomId?: string;
      lastHeartbeat: string | null;
      staleDuration: string;
    }>;
  }> {
    const {
      staleMinutes = 30,
      dryRun = false,
      includeRoomCleanup = true,
      notifyParticipants = true
    } = options;

    this.logger.info(`Starting enhanced stale agent cleanup`, {
      staleMinutes,
      dryRun,
      includeRoomCleanup,
      notifyParticipants
    });

    const results = {
      totalStaleAgents: 0,
      terminatedAgents: 0,
      failedTerminations: 0,
      roomsProcessed: 0,
      roomsCleaned: 0,
      errors: [] as Array<{ agentId: string; error: string }>,
      dryRun,
      staleAgentDetails: [] as Array<{
        agentId: string;
        agentName: string;
        agentType: string;
        repositoryPath: string;
        roomId?: string;
        lastHeartbeat: string | null;
        staleDuration: string;
      }>
    };

    try {
      // Find stale agents
      const staleAgents = await this.findStaleAgents(staleMinutes);
      results.totalStaleAgents = staleAgents.length;

      this.logger.info(`Found ${staleAgents.length} stale agents`, {
        staleMinutes,
        agentIds: staleAgents.map(a => a.id)
      });

      if (staleAgents.length === 0) {
        this.logger.info('No stale agents found, cleanup completed');
        return results;
      }

      // Build stale agent details
      const now = new Date();
      for (const agent of staleAgents) {
        const lastHeartbeat = agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : null;
        const staleDuration = lastHeartbeat
          ? `${Math.round((now.getTime() - lastHeartbeat.getTime()) / (1000 * 60))} minutes`
          : 'unknown';

        results.staleAgentDetails.push({
          agentId: agent.id,
          agentName: agent.agentName,
          agentType: agent.agentType || 'unknown',
          repositoryPath: agent.repositoryPath,
          roomId: agent.roomId || undefined,
          lastHeartbeat: agent.lastHeartbeat,
          staleDuration
        });
      }

      if (dryRun) {
        this.logger.info('Dry run mode - would cleanup the following stale agents:', {
          staleAgentDetails: results.staleAgentDetails
        });
        return results;
      }

      // Process each stale agent
      for (const agent of staleAgents) {
        try {
          this.logger.info(`Cleaning up stale agent ${agent.id}`, {
            agentId: agent.id,
            agentName: agent.agentName,
            agentType: agent.agentType,
            repositoryPath: agent.repositoryPath,
            roomId: agent.roomId,
            lastHeartbeat: agent.lastHeartbeat
          });

          // Notify participants in room before cleanup (if enabled and agent has room)
          if (notifyParticipants && agent.roomId && includeRoomCleanup) {
            await this.notifyRoomBeforeAgentCleanup(agent);
          }

          // Terminate the agent (this will handle auto-leave if agent has room)
          await this.terminateAgent(agent.id);
          results.terminatedAgents++;

          this.logger.info(`Successfully cleaned up stale agent ${agent.id}`, {
            agentId: agent.id,
            agentName: agent.agentName
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to cleanup stale agent ${agent.id}`, {
            agentId: agent.id,
            agentName: agent.agentName,
            error: errorMessage
          });

          results.failedTerminations++;
          results.errors.push({
            agentId: agent.id,
            error: errorMessage
          });
        }
      }

      // Perform room cleanup if enabled
      if (includeRoomCleanup) {
        const roomCleanupResults = await this.cleanupStaleRooms({
          inactiveMinutes: staleMinutes,
          dryRun: false, // Already handled dry-run at agent level
          notifyParticipants
        });

        results.roomsProcessed = roomCleanupResults.totalStaleRooms;
        results.roomsCleaned = roomCleanupResults.deletedRooms;

        this.logger.info('Room cleanup completed as part of agent cleanup', {
          roomsProcessed: results.roomsProcessed,
          roomsCleaned: results.roomsCleaned
        });
      }

      this.logger.info('Enhanced stale agent cleanup completed', {
        totalStaleAgents: results.totalStaleAgents,
        terminatedAgents: results.terminatedAgents,
        failedTerminations: results.failedTerminations,
        roomsProcessed: results.roomsProcessed,
        roomsCleaned: results.roomsCleaned,
        errorCount: results.errors.length
      });

      return results;

    } catch (error) {
      this.logger.error('Enhanced stale agent cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
        staleMinutes,
        dryRun,
        includeRoomCleanup
      });

      throw new Error(`Enhanced stale agent cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAgentCount(repositoryPath?: string, status?: string): Promise<number> {
    const conditions = [];
    
    if (repositoryPath) {
      conditions.push(eq(agentSessions.repositoryPath, repositoryPath));
    }
    
    if (status) {
      conditions.push(eq(agentSessions.status, status as AgentStatus));
    }
    
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions.length === 1 ? conditions[0] : undefined;
    
    return await this.agentRepo.count(whereClause);
  }

  private generateAgentId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Batch operations
  async createAgentBatch(requests: CreateAgentRequest[]): Promise<AgentSession[]> {
    const results: AgentSession[] = [];
    
    for (const request of requests) {
      try {
        const agent = await this.createAgent(request);
        results.push(agent);
      } catch (error) {
        process.stderr.write(`Failed to create agent ${request.agentName}: ${error}\n`);
        // Continue with other agents
      }
    }

    return results;
  }

  // Convenience method for spawning agents with prompt-based interface
  async spawnAgent(config: {
    agentName: string;
    agentType?: AgentType;
    repositoryPath: string;
    prompt: string;
    capabilities?: string[];
    agentMetadata?: Record<string, any>;
    claudeConfig?: Partial<ClaudeSpawnConfig>;
    toolPermissions?: Partial<ToolPermissions>;
    autoCreateRoom?: boolean;
    roomId?: string;
  }): Promise<{
    agentId: string;
    agent: AgentSession;
  }> {
    this.logger.info(`spawnAgent called with config`, {
      agentName: config.agentName,
      agentType: config.agentType,
      repositoryPath: config.repositoryPath,
      repositoryPathType: typeof config.repositoryPath,
      prompt: config.prompt,
      capabilities: config.capabilities,
      hasAgentMetadata: !!config.agentMetadata,
      hasClaudeConfig: !!config.claudeConfig,
      hasToolPermissions: !!config.toolPermissions,
      autoCreateRoom: config.autoCreateRoom,
      roomId: config.roomId
    });
    
    const agent = await this.createAgent({
      agentName: config.agentName,
      agentType: config.agentType,
      repositoryPath: config.repositoryPath,
      objectiveDescription: config.prompt,
      capabilities: config.capabilities,
      metadata: config.agentMetadata,
      claudeConfig: config.claudeConfig,
      toolPermissions: config.toolPermissions,
      autoCreateRoom: config.autoCreateRoom,
      roomId: config.roomId
    });

    this.logger.info(`spawnAgent completed successfully`, {
      agentId: agent.id,
      agentName: agent.agentName,
      agentType: agent.agentType,
      repositoryPath: agent.repositoryPath,
      status: agent.status,
      claudePid: agent.claudePid,
      roomId: agent.roomId
    });

    return {
      agentId: agent.id,
      agent
    };
  }

  // Wait for agent completion
  async waitForAgentCompletion(agentId: string, timeout = 300000): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkCompletion = async () => {
        const agent = await this.getAgent(agentId);
        
        if (!agent) {
          resolve(false);
          return;
        }

        if (agent.status === 'completed' || agent.status === 'terminated') {
          resolve(agent.status === 'completed');
          return;
        }

        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }

        // Check again in 5 seconds
        setTimeout(checkCompletion, 5000);
      };

      checkCompletion();
    });
  }

  // 🚀 FOUNDATION CACHING HELPER METHODS
  
  /**
   * Determines if an agent should use foundation caching
   * Enables for all agents by default, with opt-out capability
   */
  private shouldUseFoundationCaching(agent: AgentSession): boolean {
    // Allow opt-out via metadata
    if (agent.agentMetadata?.disableFoundationCaching === true) {
      return false;
    }
    
    // Enable for all agents by default
    return true;
  }
  
  /**
   * Generates context for foundation caching session
   */
  private generateAgentContext(agent: AgentSession, objectiveDescription: string): any {
    return {
      agentId: agent.id,
      agentName: agent.agentName,
      agentType: agent.agentType,
      objectiveDescription,
      capabilities: agent.capabilities,
      repositoryPath: agent.repositoryPath,
      timestamp: new Date().toISOString(),
      toolPermissions: agent.toolPermissions
    };
  }

  /**
   * Broadcast a message to multiple agents with auto-resume functionality
   */
  async broadcastMessageToAgents(
    repositoryPath: string,
    agentIds: string[],
    message: string,
    autoResume: boolean = true,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    messageType: 'coordination' | 'instruction' | 'status' | 'notification' = 'coordination'
  ): Promise<{
    totalAgents: number;
    deliveredCount: number;
    resumedCount: number;
    failedCount: number;
    deliveryResults: Array<{
      agentId: string;
      delivered: boolean;
      resumed: boolean;
      error?: string;
      roomName?: string;
    }>;
  }> {
    this.logger.info(`Broadcasting message to ${agentIds.length} agents`, {
      repositoryPath,
      agentIds,
      messagePreview: message.substring(0, 100),
      autoResume,
      priority,
      messageType
    });

    const results = {
      totalAgents: agentIds.length,
      deliveredCount: 0,
      resumedCount: 0,
      failedCount: 0,
      deliveryResults: [] as Array<{
        agentId: string;
        delivered: boolean;
        resumed: boolean;
        error?: string;
        roomName?: string;
      }>
    };

    for (const agentId of agentIds) {
      const result = {
        agentId,
        delivered: false,
        resumed: false,
        error: undefined as string | undefined,
        roomName: undefined as string | undefined
      };

      try {
        // Get agent information
        const agent = await this.agentRepo.findById(agentId);
        if (!agent) {
          result.error = `Agent ${agentId} not found`;
          result.delivered = false;
          results.failedCount++;
          results.deliveryResults.push(result);
          continue;
        }

        // Check if agent needs to be resumed
        let wasResumed = false;
        if (autoResume && !this.isAgentActivelyRunning(agent)) {
          try {
            await this.continueAgentSession(agentId, message, undefined, true);
            wasResumed = true;
            result.resumed = true;
            results.resumedCount++;
            this.logger.info(`Agent ${agentId} resumed for message delivery`);
          } catch (resumeError) {
            this.logger.warn(`Failed to resume agent ${agentId}`, { 
              error: resumeError instanceof Error ? resumeError.message : String(resumeError) 
            });
            result.error = `Failed to resume agent: ${resumeError instanceof Error ? resumeError.message : String(resumeError)}`;
            result.delivered = false;
            results.failedCount++;
            results.deliveryResults.push(result);
            continue;
          }
        }

        // Deliver message to agent
        try {
          if (agent.roomId) {
            // Agent has a room - send message to room
            await this.communicationRepo.sendMessage({
              id: `msg-${Date.now()}-${Math.random().toString(36).substring(2)}`,
              roomId: agent.roomId,
              agentName: 'System Broadcast',
              message: this.formatBroadcastMessage(message, priority, messageType),
              messageType: 'system'
            });
            result.roomName = agent.roomId;
            result.delivered = true;
            results.deliveredCount++;
          } else {
            // Agent has no room - update additional instructions
            await this.updateAgentInstructions(agentId, message);
            result.delivered = true;
            results.deliveredCount++;
          }

          this.logger.info(`Message delivered to agent ${agentId}`, {
            agentName: agent.agentName,
            roomId: agent.roomId,
            wasResumed,
            deliveryMethod: agent.roomId ? 'room_message' : 'instructions_update'
          });

        } catch (deliveryError) {
          this.logger.error(`Failed to deliver message to agent ${agentId}`, {
            error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError)
          });
          result.error = `Message delivery failed: ${deliveryError instanceof Error ? deliveryError.message : String(deliveryError)}`;
          result.delivered = false;
          results.failedCount++;
        }

      } catch (error) {
        this.logger.error(`Unexpected error processing agent ${agentId}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        result.error = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
        result.delivered = false;
        results.failedCount++;
      }

      results.deliveryResults.push(result);
    }

    this.logger.info(`Broadcast message operation completed`, {
      totalAgents: results.totalAgents,
      deliveredCount: results.deliveredCount,
      resumedCount: results.resumedCount,
      failedCount: results.failedCount
    });

    return results;
  }

  /**
   * Continue an agent session using stored conversation session ID
   */
  async continueAgentSession(
    agentId: string,
    additionalInstructions?: string,
    newObjectiveDescription?: string,
    preserveContext: boolean = true,
    updateMetadata?: Record<string, any>
  ): Promise<AgentSession> {
    this.logger.info(`Continuing agent session for ${agentId}`, {
      hasAdditionalInstructions: !!additionalInstructions,
      hasNewTask: !!newObjectiveDescription,
      preserveContext,
      hasMetadataUpdates: !!updateMetadata
    });

    // Get agent information
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Check if agent has a stored session ID
    if (!agent.convoSessionId) {
      throw new Error(`Agent ${agentId} has no stored conversation session ID`);
    }

    // Store previous status
    const previousStatus = agent.status;

    // Update agent metadata if provided
    if (updateMetadata) {
      const updatedMetadata = { ...agent.agentMetadata, ...updateMetadata };
      await this.agentRepo.updateMetadata(agentId, updatedMetadata);
    }

    // Update additional instructions if provided
    if (additionalInstructions) {
      await this.updateAgentInstructions(agentId, additionalInstructions);
    }

    // Determine task description for the resumed session
    const objectiveDescription = newObjectiveDescription || 
      (agent.agentMetadata?.objectiveDescription as string) || 
      'Continue with previous task';

    // Set up session ID callback to update the agent with any new session ID
    const onSessionIdExtracted = async (sessionId: string) => {
      try {
        await this.updateAgentSessionId(agentId, sessionId);
        this.logger.info(`Updated session ID for resumed agent ${agentId}`, { sessionId });
      } catch (error) {
        this.logger.warn(`Failed to update session ID for agent ${agentId}`, {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };

    // Create Claude configuration for resumption
    const claudeConfig: Partial<ClaudeSpawnConfig> = {
      sessionId: agent.convoSessionId, // Resume with stored session ID
      additionalInstructions,
      onSessionIdExtracted
    };

    // Spawn the Claude process with resumed session
    try {
      const claudeProcess = await this.spawnClaudeProcess(agent, objectiveDescription, claudeConfig);
      
      // Update agent status and PID
      await this.agentRepo.updateStatus(agentId, 'active');
      
      this.db.transaction(() => {
        const updateStmt = this.db.database.prepare(`
          UPDATE agent_sessions 
          SET claudePid = ?, lastHeartbeat = datetime('now')
          WHERE id = ?
        `);
        updateStmt.run(claudeProcess.pid, agentId);
      });

      // Get updated agent
      const updatedAgent = await this.agentRepo.findById(agentId);
      if (!updatedAgent) {
        throw new Error(`Agent ${agentId} not found after session continuation`);
      }

      // Emit agent resumed event
      await eventBus.emit('agent_resumed', {
        agentId,
        previousStatus,
        newStatus: 'active',
        sessionId: agent.convoSessionId,
        timestamp: new Date(),
        repositoryPath: agent.repositoryPath
      });

      this.logger.info(`Agent session continued successfully`, {
        agentId,
        agentName: agent.agentName,
        previousStatus,
        newStatus: 'active',
        sessionId: agent.convoSessionId,
        claudePid: claudeProcess.pid
      });

      return updatedAgent;

    } catch (error) {
      this.logger.error(`Failed to continue agent session for ${agentId}`, {
        error: error instanceof Error ? error.message : String(error),
        sessionId: agent.convoSessionId
      });
      
      // Update agent status to indicate failure
      await this.agentRepo.updateStatus(agentId, 'failed');
      throw new Error(`Failed to continue agent session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if an agent is actively running
   */
  private isAgentActivelyRunning(agent: AgentSession): boolean {
    // Agent is actively running if:
    // 1. Status is 'active' or 'initializing'
    // 2. Has a claudePid and the process is still running
    if (agent.status === 'active' || agent.status === 'initializing') {
      if (agent.claudePid) {
        const process = this.spawner.getProcess(agent.claudePid);
        return process ? !process.hasExited() : false;
      }
    }
    return false;
  }

  /**
   * Update agent additional instructions
   */
  async updateAgentInstructions(agentId: string, instructions: string): Promise<void> {
    this.logger.info(`Updating instructions for agent ${agentId}`);
    
    this.db.transaction(() => {
      const updateStmt = this.db.database.prepare(`
        UPDATE agent_sessions 
        SET additionalInstructions = ?, lastHeartbeat = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(instructions, agentId);
    });
  }

  /**
   * Update agent conversation session ID
   */
  async updateAgentSessionId(agentId: string, sessionId: string): Promise<void> {
    this.logger.info(`Updating session ID for agent ${agentId}`, { sessionId });
    
    this.db.transaction(() => {
      const updateStmt = this.db.database.prepare(`
        UPDATE agent_sessions 
        SET convoSessionId = ?, lastHeartbeat = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(sessionId, agentId);
    });
  }

  /**
   * Format broadcast message with priority and type
   */
  private formatBroadcastMessage(
    message: string,
    priority: 'low' | 'normal' | 'high' | 'urgent',
    messageType: 'coordination' | 'instruction' | 'status' | 'notification'
  ): string {
    const priorityEmoji = {
      low: '🔵',
      normal: '⚪',
      high: '🟡',
      urgent: '🔴'
    };

    const typeEmoji = {
      coordination: '🤝',
      instruction: '📋',
      status: '📊',
      notification: '📢'
    };

    return `${priorityEmoji[priority]} ${typeEmoji[messageType]} **${messageType.toUpperCase()}** (${priority} priority)\n\n${message}`;
  }

  /**
   * Handle auto-leave functionality when agent process exits
   */
  private async handleAutoLeaveRoom(
    agent: AgentSession, 
    exitStatus: AgentStatus, 
    exitCode: number | null, 
    signal: string | null
  ): Promise<void> {
    if (!agent.roomId) {
      return;
    }

    try {
      this.logger.info(`Handling auto-leave for agent ${agent.id} from room ${agent.roomId}`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId,
        exitStatus,
        exitCode,
        signal
      });

      // Check if room exists
      let room = await this.communicationService.getRoom(agent.roomId);
      if (!room) {
        room = await this.communicationService.getRoomById(agent.roomId);
      }

      if (!room) {
        this.logger.warn(`Room ${agent.roomId} not found for auto-leave`, {
          agentId: agent.id,
          agentName: agent.agentName,
          roomId: agent.roomId
        });
        return;
      }

      // Get current room participants before sending farewell message
      const participants = await this.communicationRepo.getRoomParticipants(agent.roomId);
      this.logger.info(`Room participants before auto-leave`, {
        agentId: agent.id,
        roomId: agent.roomId,
        participants,
        participantCount: participants.length
      });

      // Send farewell message to room
      const farewellMessage = this.generateFarewellMessage(agent, exitStatus, exitCode, signal);
      await this.communicationRepo.sendMessage({
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2)}`,
        roomId: agent.roomId,
        agentName: agent.agentName,
        message: farewellMessage,
        messageType: 'system'
      });

      this.logger.info(`Farewell message sent for agent ${agent.id}`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId,
        message: farewellMessage
      });

      // Check if this agent is the last participant in the room
      // Filter out this agent from participants since it's leaving
      const remainingParticipants = participants.filter(participant => 
        participant !== agent.agentName
      );

      if (remainingParticipants.length === 0) {
        // Agent is the last participant - clean up the room
        this.logger.info(`Agent ${agent.id} is the last participant, cleaning up room ${agent.roomId}`, {
          agentId: agent.id,
          agentName: agent.agentName,
          roomId: agent.roomId,
          roomName: room.name
        });

        await this.communicationRepo.deleteRoom(agent.roomId);

        this.logger.info(`Room ${agent.roomId} cleaned up successfully`, {
          agentId: agent.id,
          roomId: agent.roomId,
          roomName: room.name
        });

        // Emit room cleanup event (using room_closed event type)
        await eventBus.emit('room_closed', {
          roomId: agent.roomId,
          roomName: room.name,
          timestamp: new Date(),
          repositoryPath: agent.repositoryPath
        });
      } else {
        this.logger.info(`Agent ${agent.id} left room with remaining participants`, {
          agentId: agent.id,
          roomId: agent.roomId,
          remainingParticipants,
          remainingCount: remainingParticipants.length
        });
      }

      // Emit agent status change event for auto-leave monitoring
      await eventBus.emit('agent_status_change', {
        agentId: agent.id,
        previousStatus: agent.status,
        newStatus: exitStatus,
        timestamp: new Date(),
        metadata: {
          roomId: agent.roomId,
          roomName: room.name,
          exitCode,
          signal,
          remainingParticipants,
          roomCleaned: remainingParticipants.length === 0,
          autoLeaveProcessed: true
        },
        repositoryPath: agent.repositoryPath
      });

    } catch (error) {
      // Log error but don't fail the process exit handling
      this.logger.error(`Failed to handle auto-leave for agent ${agent.id}`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId,
        exitStatus,
        exitCode,
        signal,
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });

      // Emit system warning for auto-leave failure
      await eventBus.emit('system_warning', {
        message: `Auto-leave failed for agent ${agent.agentName}: ${error instanceof Error ? error.message : String(error)}`,
        context: 'agent_auto_leave',
        timestamp: new Date(),
        repositoryPath: agent.repositoryPath
      });

      // Don't throw error - auto-leave failure should not fail process exit handling
      this.logger.warn(`Process exit will continue despite auto-leave failure for agent ${agent.id}`);
    }
  }

  /**
   * Generate contextual farewell message based on exit status
   */
  private generateFarewellMessage(
    agent: AgentSession, 
    exitStatus: AgentStatus, 
    exitCode: number | null, 
    signal: string | null
  ): string {
    const agentInfo = `Agent ${agent.agentName} (${agent.agentType || 'general_agent'})`;
    
    let statusMessage: string;
    let emoji: string;

    switch (exitStatus) {
      case 'completed':
        statusMessage = 'has completed its task successfully';
        emoji = '✅';
        break;
      case 'terminated':
        if (signal === 'SIGTERM') {
          statusMessage = 'was gracefully terminated';
          emoji = '🛑';
        } else if (signal === 'SIGKILL') {
          statusMessage = 'was force-killed';
          emoji = '💀';
        } else {
          statusMessage = 'was terminated';
          emoji = '🔴';
        }
        break;
      case 'failed':
        statusMessage = `failed with exit code ${exitCode || 'unknown'}`;
        emoji = '❌';
        break;
      default:
        statusMessage = 'has exited';
        emoji = '👋';
        break;
    }

    const baseMessage = `${emoji} ${agentInfo} ${statusMessage}`;
    
    // Add additional context for debugging if available
    const contextParts = [];
    if (exitCode !== null && exitCode !== 0) {
      contextParts.push(`exit code: ${exitCode}`);
    }
    if (signal) {
      contextParts.push(`signal: ${signal}`);
    }
    
    const contextMessage = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
    
    return `${baseMessage}${contextMessage}`;
  }

  // =================== ROOM CLEANUP FUNCTIONALITY ===================

  /**
   * Cleanup stale rooms with comprehensive options
   */
  async cleanupStaleRooms(options: {
    inactiveMinutes?: number;
    dryRun?: boolean;
    notifyParticipants?: boolean;
    deleteEmptyRooms?: boolean;
    deleteNoActiveParticipants?: boolean;
    deleteNoRecentMessages?: boolean;
  } = {}): Promise<{
    totalStaleRooms: number;
    deletedRooms: number;
    failedDeletions: number;
    notifiedParticipants: number;
    errors: Array<{ roomId: string; roomName: string; error: string }>;
    dryRun: boolean;
    staleRoomDetails: Array<{
      roomId: string;
      roomName: string;
      repositoryPath: string;
      lastActivity: string | null;
      activeParticipants: number;
      totalParticipants: number;
      messageCount: number;
      staleness: {
        noActiveParticipants: boolean;
        noRecentMessages: boolean;
        isEmpty: boolean;
        isInactive: boolean;
      };
    }>;
  }> {
    const {
      inactiveMinutes = 60,
      dryRun = false,
      notifyParticipants = true,
      deleteEmptyRooms = true,
      deleteNoActiveParticipants = true,
      deleteNoRecentMessages = true
    } = options;

    this.logger.info(`Starting stale room cleanup`, {
      inactiveMinutes,
      dryRun,
      notifyParticipants,
      deleteEmptyRooms,
      deleteNoActiveParticipants,
      deleteNoRecentMessages
    });

    const results = {
      totalStaleRooms: 0,
      deletedRooms: 0,
      failedDeletions: 0,
      notifiedParticipants: 0,
      errors: [] as Array<{ roomId: string; roomName: string; error: string }>,
      dryRun,
      staleRoomDetails: [] as Array<{
        roomId: string;
        roomName: string;
        repositoryPath: string;
        lastActivity: string | null;
        activeParticipants: number;
        totalParticipants: number;
        messageCount: number;
        staleness: {
          noActiveParticipants: boolean;
          noRecentMessages: boolean;
          isEmpty: boolean;
          isInactive: boolean;
        };
      }>
    };

    try {
      // Find stale rooms
      const staleRooms = await this.communicationRepo.findStaleRooms({
        inactiveMinutes,
        noActiveParticipants: deleteNoActiveParticipants,
        noRecentMessages: deleteNoRecentMessages,
        emptyRooms: deleteEmptyRooms,
        gracePeriodMinutes: this.cleanupConfig.rooms.gracePeriodMinutes,
        maxResults: this.cleanupConfig.rooms.maxBatchSize,
        preserveGeneralRooms: this.cleanupConfig.rooms.preserveGeneralRooms
      });

      results.totalStaleRooms = staleRooms.length;

      this.logger.info(`Found ${staleRooms.length} stale rooms`, {
        inactiveMinutes,
        roomIds: staleRooms.map(r => r.room.id)
      });

      if (staleRooms.length === 0) {
        this.logger.info('No stale rooms found, cleanup completed');
        return results;
      }

      // Build stale room details
      for (const staleRoom of staleRooms) {
        results.staleRoomDetails.push({
          roomId: staleRoom.room.id,
          roomName: staleRoom.room.name,
          repositoryPath: staleRoom.room.repositoryPath,
          lastActivity: staleRoom.lastActivity,
          activeParticipants: staleRoom.activeParticipantCount,
          totalParticipants: staleRoom.totalParticipantCount,
          messageCount: staleRoom.messageCount,
          staleness: staleRoom.staleness
        });
      }

      if (dryRun) {
        this.logger.info('Dry run mode - would cleanup the following stale rooms:', {
          staleRoomDetails: results.staleRoomDetails
        });
        return results;
      }

      // Process each stale room
      for (const staleRoom of staleRooms) {
        try {
          this.logger.info(`Cleaning up stale room ${staleRoom.room.id}`, {
            roomId: staleRoom.room.id,
            roomName: staleRoom.room.name,
            repositoryPath: staleRoom.room.repositoryPath,
            lastActivity: staleRoom.lastActivity,
            activeParticipants: staleRoom.activeParticipantCount,
            totalParticipants: staleRoom.totalParticipantCount,
            messageCount: staleRoom.messageCount,
            staleness: staleRoom.staleness
          });

          // Notify remaining participants before cleanup
          if (notifyParticipants && staleRoom.activeParticipantCount > 0) {
            const notifiedCount = await this.notifyParticipantsBeforeRoomCleanup(staleRoom.room);
            results.notifiedParticipants += notifiedCount;
          }

          // Delete the room
          const deleted = await this.communicationRepo.deleteRoom(staleRoom.room.id);
          
          if (deleted) {
            results.deletedRooms++;
            this.logger.info(`Successfully cleaned up stale room ${staleRoom.room.id}`, {
              roomId: staleRoom.room.id,
              roomName: staleRoom.room.name
            });

            // Emit room cleanup event
            await eventBus.emit('room_cleaned_up', {
              roomId: staleRoom.room.id,
              roomName: staleRoom.room.name,
              repositoryPath: staleRoom.room.repositoryPath,
              timestamp: new Date(),
              cleanupReason: `Stale room cleanup: ${this.getStalenessReasons(staleRoom.staleness)}`,
              wasActive: staleRoom.activeParticipantCount > 0
            });
          } else {
            this.logger.warn(`Room ${staleRoom.room.id} was not deleted (may not exist)`, {
              roomId: staleRoom.room.id,
              roomName: staleRoom.room.name
            });
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to cleanup stale room ${staleRoom.room.id}`, {
            roomId: staleRoom.room.id,
            roomName: staleRoom.room.name,
            error: errorMessage
          });

          results.failedDeletions++;
          results.errors.push({
            roomId: staleRoom.room.id,
            roomName: staleRoom.room.name,
            error: errorMessage
          });
        }
      }

      this.logger.info('Stale room cleanup completed', {
        totalStaleRooms: results.totalStaleRooms,
        deletedRooms: results.deletedRooms,
        failedDeletions: results.failedDeletions,
        notifiedParticipants: results.notifiedParticipants,
        errorCount: results.errors.length
      });

      return results;

    } catch (error) {
      this.logger.error('Stale room cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
        inactiveMinutes,
        dryRun
      });

      throw new Error(`Stale room cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Notify participants before room cleanup
   */
  private async notifyParticipantsBeforeRoomCleanup(room: ChatRoom): Promise<number> {
    try {
      const activeParticipants = await this.communicationRepo.getActiveParticipants(room.id);
      
      if (activeParticipants.length === 0) {
        return 0;
      }

      const notificationMessage = `🔔 **ROOM CLEANUP NOTICE**\n\nThis room (${room.name}) will be cleaned up due to inactivity. If you need to preserve this room or its content, please send a message to keep it active.\n\nReason: Automated stale room cleanup\nRepository: ${room.repositoryPath}`;

      await this.communicationRepo.sendMessage({
        id: `cleanup-notice-${Date.now()}-${Math.random().toString(36).substring(2)}`,
        roomId: room.id,
        agentName: 'System Cleanup Service',
        message: notificationMessage,
        messageType: 'notification'
      });

      this.logger.info(`Notified ${activeParticipants.length} participants before room cleanup`, {
        roomId: room.id,
        roomName: room.name,
        participantCount: activeParticipants.length,
        participants: activeParticipants.map(p => p.agentName)
      });

      return activeParticipants.length;
    } catch (error) {
      this.logger.warn(`Failed to notify participants before room cleanup`, {
        roomId: room.id,
        roomName: room.name,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Notify room participants before agent cleanup
   */
  private async notifyRoomBeforeAgentCleanup(agent: AgentSession): Promise<void> {
    if (!agent.roomId) {
      return;
    }

    try {
      const notificationMessage = `⚠️ **AGENT CLEANUP NOTICE**\n\nAgent ${agent.agentName} (${agent.agentType || 'unknown type'}) will be cleaned up due to inactivity.\n\nLast heartbeat: ${agent.lastHeartbeat || 'never'}\nRepository: ${agent.repositoryPath}`;

      await this.communicationRepo.sendMessage({
        id: `agent-cleanup-notice-${Date.now()}-${Math.random().toString(36).substring(2)}`,
        roomId: agent.roomId,
        agentName: 'System Cleanup Service',
        message: notificationMessage,
        messageType: 'notification'
      });

      this.logger.info(`Notified room before agent cleanup`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId
      });
    } catch (error) {
      this.logger.warn(`Failed to notify room before agent cleanup`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get current cleanup configuration
   */
  getCleanupConfiguration(): CleanupConfig {
    return this.cleanupConfig;
  }

  /**
   * Update cleanup configuration
   */
  updateCleanupConfiguration(newConfig: Partial<CleanupConfig>): void {
    this.cleanupConfig = {
      agents: {
        ...this.cleanupConfig.agents,
        ...newConfig.agents
      },
      rooms: {
        ...this.cleanupConfig.rooms,
        ...newConfig.rooms
      },
      general: {
        ...this.cleanupConfig.general,
        ...newConfig.general
      }
    };

    this.logger.info('Cleanup configuration updated', {
      newConfig: this.cleanupConfig
    });
  }

  /**
   * Run comprehensive cleanup with both agents and rooms
   */
  async runComprehensiveCleanup(options: {
    dryRun?: boolean;
    agentStaleMinutes?: number;
    roomInactiveMinutes?: number;
    notifyParticipants?: boolean;
  } = {}): Promise<{
    agentCleanup: Awaited<ReturnType<typeof this.cleanupStaleAgents>>;
    roomCleanup: Awaited<ReturnType<typeof this.cleanupStaleRooms>>;
    summary: {
      totalAgentsProcessed: number;
      totalRoomsProcessed: number;
      totalAgentsTerminated: number;
      totalRoomsDeleted: number;
      totalErrors: number;
    };
  }> {
    const {
      dryRun = false,
      agentStaleMinutes = 30,
      roomInactiveMinutes = 60,
      notifyParticipants = true
    } = options;

    this.logger.info('Starting comprehensive cleanup', {
      dryRun,
      agentStaleMinutes,
      roomInactiveMinutes,
      notifyParticipants
    });

    try {
      // Run agent cleanup (which includes basic room cleanup)
      const agentCleanupResults = await this.cleanupStaleAgents({
        staleMinutes: agentStaleMinutes,
        dryRun,
        includeRoomCleanup: false, // We'll do comprehensive room cleanup separately
        notifyParticipants
      });

      // Run comprehensive room cleanup
      const roomCleanupResults = await this.cleanupStaleRooms({
        inactiveMinutes: roomInactiveMinutes,
        dryRun,
        notifyParticipants,
        deleteEmptyRooms: true,
        deleteNoActiveParticipants: true,
        deleteNoRecentMessages: true
      });

      const summary = {
        totalAgentsProcessed: agentCleanupResults.totalStaleAgents,
        totalRoomsProcessed: roomCleanupResults.totalStaleRooms,
        totalAgentsTerminated: agentCleanupResults.terminatedAgents,
        totalRoomsDeleted: roomCleanupResults.deletedRooms,
        totalErrors: agentCleanupResults.errors.length + roomCleanupResults.errors.length
      };

      this.logger.info('Comprehensive cleanup completed', summary);

      return {
        agentCleanup: agentCleanupResults,
        roomCleanup: roomCleanupResults,
        summary
      };
    } catch (error) {
      this.logger.error('Comprehensive cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
        dryRun,
        agentStaleMinutes,
        roomInactiveMinutes
      });
      throw error;
    }
  }

  /**
   * Handle auto-join functionality for agents with assigned rooms
   */
  private async handleAutoJoinRoom(agent: AgentSession): Promise<void> {
    if (!agent.roomId) {
      return;
    }

    try {
      this.logger.info(`Auto-joining agent ${agent.id} to room ${agent.roomId}`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId,
        agentType: agent.agentType
      });

      // Check if room exists first - try both by name and by ID
      let room = await this.communicationService.getRoom(agent.roomId);
      if (!room) {
        room = await this.communicationService.getRoomById(agent.roomId);
      }
      
      if (!room) {
        this.logger.warn(`Room ${agent.roomId} does not exist for agent auto-join`, {
          agentId: agent.id,
          agentName: agent.agentName,
          roomId: agent.roomId
        });
        return;
      }

      // Join the room using room name (this will send a system message)
      await this.communicationService.joinRoom(room.name, agent.agentName);

      this.logger.info(`Agent ${agent.id} successfully auto-joined room ${agent.roomId}`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId,
        roomName: room.name,
        roomDescription: room.description
      });

      // Emit agent status change event for auto-join monitoring
      await eventBus.emit('agent_status_change', {
        agentId: agent.id,
        previousStatus: agent.status,
        newStatus: agent.status,
        timestamp: new Date(),
        metadata: {
          roomId: agent.roomId,
          roomName: room.name,
          autoJoinProcessed: true
        },
        repositoryPath: agent.repositoryPath
      });

    } catch (error) {
      // Log error but don't fail agent creation
      this.logger.error(`Failed to auto-join agent ${agent.id} to room ${agent.roomId}`, {
        agentId: agent.id,
        agentName: agent.agentName,
        roomId: agent.roomId,
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });

      // Emit system warning for auto-join failure
      await eventBus.emit('system_warning', {
        message: `Auto-join failed for agent ${agent.agentName}: ${error instanceof Error ? error.message : String(error)}`,
        context: 'agent_auto_join',
        timestamp: new Date(),
        repositoryPath: agent.repositoryPath
      });

      // Don't throw error - auto-join failure should not fail agent creation
      this.logger.warn(`Agent creation will continue despite auto-join failure for agent ${agent.id}`);
    }
  }

  /**
   * Helper method to generate human-readable staleness reasons
   */
  private getStalenessReasons(staleness: {
    noActiveParticipants: boolean;
    noRecentMessages: boolean;
    isEmpty: boolean;
    isInactive: boolean;
  }): string {
    const reasons: string[] = [];
    
    if (staleness.isEmpty) {
      reasons.push('empty room');
    }
    if (staleness.noActiveParticipants) {
      reasons.push('no active participants');
    }
    if (staleness.noRecentMessages) {
      reasons.push('no recent messages');
    }
    if (staleness.isInactive) {
      reasons.push('inactive for extended period');
    }
    
    return reasons.length > 0 ? reasons.join(', ') : 'general staleness criteria';
  }
}