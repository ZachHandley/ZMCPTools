import { EventEmitter } from "events";
import { DatabaseManager } from "../database/index.js";
import {
  AgentService,
  ObjectiveService,
  CommunicationService,
  KnowledgeGraphService,
} from "./index.js";
import {
  ObjectiveComplexityAnalyzer,
  type ObjectiveComplexityAnalysis,
  type ModelType,
} from "./ObjectiveComplexityAnalyzer.js";
import { ClaudeSpawner } from "../process/ClaudeSpawner.js";
import { eventBus } from "./EventBus.js";
import { Logger } from "../utils/logger.js";
import { AgentPermissionManager } from "../utils/agentPermissions.js";
import type {
  ObjectiveType,
  AgentStatus,
  MessageType,
} from "../schemas/index.js";

export type OrchestrationPhase =
  | "research"
  | "plan"
  | "execute"
  | "monitor"
  | "cleanup";
export type StructuredOrchestrationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export interface StructuredOrchestrationRequest {
  title: string;
  objective: string;
  repositoryPath: string;
  foundationSessionId?: string;
  maxDuration?: number; // in minutes
  enableProgressTracking?: boolean;
  customPhaseConfig?: Partial<Record<OrchestrationPhase, boolean>>;
}

export interface OrchestrationProgress {
  orchestrationId: string;
  currentPhase: OrchestrationPhase;
  status: StructuredOrchestrationStatus;
  progress: number; // 0-100
  startTime: Date;
  phases: Record<OrchestrationPhase, PhaseStatus>;
  spawnedAgents: string[];
  createdObjectives: string[];
  roomName?: string;
  roomId?: string;
  masterObjectiveId?: string;
}

export interface PhaseStatus {
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  startTime?: Date;
  endTime?: Date;
  duration?: number; // in minutes
  assignedAgentId?: string;
  outputs?: Record<string, any>;
  errors?: string[];
}

export interface StructuredOrchestrationResult {
  success: boolean;
  orchestrationId: string;
  message: string;
  progress: OrchestrationProgress;
  finalResults?: Record<string, any>;
  error?: string;
}

/**
 * Enhanced orchestrator that implements structured phased workflow with intelligent model selection
 */
export class StructuredOrchestrator extends EventEmitter {
  private agentService: AgentService;
  private objectiveService: ObjectiveService;
  private communicationService: CommunicationService;
  private knowledgeGraphService: KnowledgeGraphService;
  private complexityAnalyzer: ObjectiveComplexityAnalyzer;
  private claudeSpawner: ClaudeSpawner;
  private logger: Logger;

  // Active orchestrations tracking
  private activeOrchestrations = new Map<string, OrchestrationProgress>();

  constructor(private db: DatabaseManager, repositoryPath: string) {
    super();

    this.agentService = new AgentService(db);
    this.objectiveService = new ObjectiveService(db);
    this.communicationService = new CommunicationService(db);
    this.complexityAnalyzer = new ObjectiveComplexityAnalyzer();
    this.claudeSpawner = ClaudeSpawner.getInstance();
    this.logger = new Logger("StructuredOrchestrator");

    // Initialize KnowledgeGraphService
    this.initializeKnowledgeGraphService(db);

    // Set up event listeners
    this.setupEventListeners();
  }

  private async initializeKnowledgeGraphService(
    db: DatabaseManager
  ): Promise<void> {
    try {
      const { VectorSearchService } = await import("./VectorSearchService.js");
      const vectorService = new VectorSearchService(db);
      this.knowledgeGraphService = new KnowledgeGraphService(db, vectorService);
    } catch (error) {
      this.logger.warn("Failed to initialize KnowledgeGraphService:", error);
      // Fallback implementation
      this.knowledgeGraphService = {
        createEntity: async () => ({ id: "fallback", name: "fallback" }),
        findEntitiesBySemanticSearch: async () => [],
      } as any;
    }
  }

  private setupEventListeners(): void {
    // Listen for agent status changes to update orchestration progress
    eventBus.subscribe("agent_status_change", async (data) => {
      await this.handleAgentStatusChange(data);
    });

    // Listen for objective completion events
    eventBus.subscribe("objective_completed", async (data) => {
      await this.handleObjectiveCompletion(data);
    });

    // Listen for orchestration phase changes
    eventBus.subscribe("orchestration_phase_change", async (data) => {
      await this.handlePhaseChange(data);
    });
  }

  /**
   * Main orchestration entry point - implements structured phased workflow
   */
  public async orchestrateObjectiveStructured(
    request: StructuredOrchestrationRequest
  ): Promise<StructuredOrchestrationResult> {
    const orchestrationId = `struct_orch_${Date.now()}`;
    this.logger.info("Starting structured orchestration", {
      orchestrationId,
      objective: request.objective,
    });

    try {
      // Step 1: Analyze objective complexity
      this.logger.debug("Analyzing objective complexity");
      const complexityAnalysis = await this.complexityAnalyzer.analyzeObjective(
        request.objective,
        "feature", // Default objective type for orchestration
        request.repositoryPath,
        {
          includeArchitectural: true,
          considerDependencies: true,
          evaluateRisks: true,
          estimateDuration: true,
        }
      );

      this.logger.info("Objective complexity analysis completed", {
        complexityLevel: complexityAnalysis.complexityLevel,
        recommendedModel: complexityAnalysis.recommendedModel,
        estimatedDuration: complexityAnalysis.estimatedDuration,
      });

      // Step 2: Initialize orchestration progress tracking
      const progress = this.initializeOrchestrationProgress(
        orchestrationId,
        request,
        complexityAnalysis
      );
      this.activeOrchestrations.set(orchestrationId, progress);

      // Step 3: Create coordination room
      const roomName = AgentPermissionManager.generateOrchestrationRoomName(
        request.objective,
        "orch"
      );
      const room = await this.communicationService.createRoom({
        name: roomName,
        description: `Structured orchestration: ${request.objective}`,
        repositoryPath: request.repositoryPath,
        metadata: {
          orchestrationId,
          objective: request.objective,
          foundationSessionId: request.foundationSessionId,
          structuredMode: true,
          complexityLevel: complexityAnalysis.complexityLevel,
        },
      });

      progress.roomName = roomName;
      progress.roomId = room.id;

      // Step 4: Create master objective
      const masterObjective = await this.objectiveService.createObjective({
        repositoryPath: request.repositoryPath,
        objectiveType: "feature" as ObjectiveType,
        description: `${request.title}: ${request.objective}`,
        requirements: {
          objective: request.objective,
          orchestrationId,
          roomId: room.id,
          roomName,
          foundationSessionId: request.foundationSessionId,
          isOrchestrationObjective: true,
          structuredMode: true,
          complexityAnalysis,
          estimatedDuration: complexityAnalysis.estimatedDuration,
        },
        priority: 10, // High priority for orchestration objectives
      });

      progress.masterObjectiveId = masterObjective.id;
      progress.createdObjectives.push(masterObjective.id);

      // Step 5: Execute phased workflow
      const result = await this.executePhaseWorkflow(
        orchestrationId,
        request,
        complexityAnalysis
      );

      // Step 6: Finalize and return results
      const finalProgress = this.activeOrchestrations.get(orchestrationId)!;
      finalProgress.status = result.success ? "completed" : "failed";
      finalProgress.progress = 100;

      // Emit completion event
      eventBus.emit("orchestration_completed", {
        orchestrationId,
        repositoryPath: request.repositoryPath,
        success: result.success,
        duration: Date.now() - finalProgress.startTime.getTime(),
        finalResults: result.finalResults,
        timestamp: new Date(),
      });

      this.logger.info("Structured orchestration completed", {
        orchestrationId,
        success: result.success,
        duration: Date.now() - finalProgress.startTime.getTime(),
      });

      return {
        success: result.success,
        orchestrationId,
        message: result.success
          ? "Structured orchestration completed successfully"
          : `Structured orchestration failed: ${result.error}`,
        progress: finalProgress,
        finalResults: result.finalResults,
        error: result.error,
      };
    } catch (error) {
      this.logger.error("Structured orchestration failed", {
        orchestrationId,
        error,
      });

      // Update progress to failed state
      const progress = this.activeOrchestrations.get(orchestrationId);
      if (progress) {
        progress.status = "failed";
        progress.progress = 0;
      }

      return {
        success: false,
        orchestrationId,
        message: `Structured orchestration failed: ${error}`,
        progress: progress!,
        error: String(error),
      };
    } finally {
      // Cleanup
      setTimeout(() => {
        this.activeOrchestrations.delete(orchestrationId);
      }, 300000); // Keep for 5 minutes for monitoring
    }
  }

  /**
   * Initialize orchestration progress tracking
   */
  private initializeOrchestrationProgress(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): OrchestrationProgress {
    const enabledPhases: OrchestrationPhase[] = [
      "research",
      "plan",
      "execute",
      "monitor",
      "cleanup",
    ];

    // Apply custom phase configuration
    const finalPhases = enabledPhases.filter((phase) => {
      if (
        request.customPhaseConfig &&
        request.customPhaseConfig[phase] === false
      ) {
        return false;
      }
      return true;
    });

    const phases: Record<OrchestrationPhase, PhaseStatus> = {
      research: { status: "pending" },
      plan: { status: "pending" },
      execute: { status: "pending" },
      monitor: { status: "pending" },
      cleanup: { status: "pending" },
    };

    // Skip disabled phases
    for (const phase of [
      "research",
      "plan",
      "execute",
      "monitor",
      "cleanup",
    ] as OrchestrationPhase[]) {
      if (!finalPhases.includes(phase)) {
        phases[phase].status = "skipped";
      }
    }

    return {
      orchestrationId,
      currentPhase: finalPhases[0] || "execute",
      status: "pending",
      progress: 0,
      startTime: new Date(),
      phases,
      spawnedAgents: [],
      createdObjectives: [],
    };
  }

  /**
   * Execute the structured phased workflow
   */
  private async executePhaseWorkflow(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): Promise<{
    success: boolean;
    finalResults?: Record<string, any>;
    error?: string;
  }> {
    const progress = this.activeOrchestrations.get(orchestrationId)!;
    const enabledPhases = Object.entries(progress.phases)
      .filter(([_, status]) => status.status !== "skipped")
      .map(([phase, _]) => phase as OrchestrationPhase);

    let phaseResults: Record<string, any> = {};

    try {
      for (let i = 0; i < enabledPhases.length; i++) {
        const phase = enabledPhases[i];
        progress.currentPhase = phase;
        progress.progress = (i / enabledPhases.length) * 90; // Leave 10% for final completion

        this.logger.info(`Starting phase: ${phase}`, { orchestrationId });

        // Execute phase
        const phaseResult = await this.executePhase(
          orchestrationId,
          phase,
          request,
          complexityAnalysis,
          phaseResults
        );

        if (!phaseResult.success) {
          throw new Error(`Phase ${phase} failed: ${phaseResult.error}`);
        }

        phaseResults[phase] = phaseResult.outputs;
        progress.phases[phase].status = "completed";
        progress.phases[phase].endTime = new Date();
        progress.phases[phase].outputs = phaseResult.outputs;

        // Emit phase completion event
        eventBus.emit("orchestration_phase_completed", {
          orchestrationId,
          phase,
          repositoryPath: request.repositoryPath,
          outputs: phaseResult.outputs,
          timestamp: new Date(),
        });
      }

      return { success: true, finalResults: phaseResults };
    } catch (error) {
      this.logger.error(`Phase execution failed`, {
        orchestrationId,
        phase: progress.currentPhase,
        error,
      });

      // Mark current phase as failed
      progress.phases[progress.currentPhase].status = "failed";
      progress.phases[progress.currentPhase].errors = [String(error)];

      return { success: false, error: String(error) };
    }
  }

  /**
   * Execute a specific orchestration phase
   */
  private async executePhase(
    orchestrationId: string,
    phase: OrchestrationPhase,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis,
    previousResults: Record<string, any>
  ): Promise<{
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
  }> {
    const progress = this.activeOrchestrations.get(orchestrationId)!;
    progress.phases[phase].status = "in_progress";
    progress.phases[phase].startTime = new Date();

    try {
      switch (phase) {
        case "research":
          return await this.executeResearchPhase(
            orchestrationId,
            request,
            complexityAnalysis
          );

        case "plan":
          return await this.executePlanningPhase(
            orchestrationId,
            request,
            complexityAnalysis,
            previousResults
          );

        case "execute":
          return await this.executeExecutionPhase(
            orchestrationId,
            request,
            complexityAnalysis,
            previousResults
          );

        case "monitor":
          return await this.executeMonitoringPhase(
            orchestrationId,
            request,
            complexityAnalysis,
            previousResults
          );

        case "cleanup":
          return await this.executeCleanupPhase(
            orchestrationId,
            request,
            complexityAnalysis,
            previousResults
          );

        default:
          throw new Error(`Unknown phase: ${phase}`);
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Research Phase: Gather information and analyze requirements
   */
  private async executeResearchPhase(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): Promise<{
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
  }> {
    this.logger.info("Executing research phase", { orchestrationId });

    try {
      // Get orchestration progress to access roomId
      const progress = this.activeOrchestrations.get(orchestrationId)!;

      // Use simple model for research coordination objectives
      const researcherAgent = await this.spawnSpecializedAgent(
        "researcher",
        request.repositoryPath,
        `Research and analyze requirements for: ${request.objective}`,
        "claude-3-7-sonnet-latest", // Simple objectives use efficient model
        orchestrationId,
        request.foundationSessionId,
        progress.roomId
      );

      // Create research objective
      const researchObjective = await this.objectiveService.createObjective({
        repositoryPath: request.repositoryPath,
        objectiveType: "analysis" as ObjectiveType,
        description: `Research phase: Analyze requirements and gather information for ${request.objective}`,
        requirements: {
          orchestrationId,
          phase: "research",
          complexityAnalysis,
          objective: request.objective,
        },
      });

      await this.objectiveService.assignObjective(
        researchObjective.id,
        researcherAgent.id
      );

      // Store research findings in knowledge graph
      await this.knowledgeGraphService.createEntity({
        id: `research-${orchestrationId}`,
        repositoryPath: request.repositoryPath,
        entityType: "insight",
        name: `Research phase for: ${request.title}`,
        description: `Research phase initiated for objective: ${request.objective}`,
        properties: {
          orchestrationId,
          phase: "research",
          complexityLevel: complexityAnalysis.complexityLevel,
          estimatedDuration: complexityAnalysis.estimatedDuration,
          tags: ["research", "orchestration", "analysis"],
        },
        discoveredBy: "structured-orchestrator",
        discoveredDuring: "research-phase",
        importanceScore: 0.8,
        confidenceScore: 1.0,
        relevanceScore: 0.9,
      });

      // Wait for research agent to actually complete
      const dependencyWaitingService = new (
        await import("./DependencyWaitingService.js")
      ).DependencyWaitingService(this.db);
      const researchCompletion =
        await dependencyWaitingService.waitForAgentDependencies(
          [researcherAgent.id],
          request.repositoryPath,
          { timeout: 600000 } // 10 minutes for research
        );

      if (!researchCompletion.success) {
        throw new Error(`Research phase failed: ${researchCompletion.message}`);
      }

      return {
        success: true,
        outputs: {
          researchAgentId: researcherAgent.id,
          researchObjectiveId: researchObjective.id,
          complexityAnalysis,
          researchFindings: "Research completed successfully",
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Planning Phase: Create detailed execution plan
   */
  private async executePlanningPhase(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis,
    previousResults: Record<string, any>
  ): Promise<{
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
  }> {
    this.logger.info("Executing planning phase", { orchestrationId });

    try {
      // Get orchestration progress to access roomId
      const progress = this.activeOrchestrations.get(orchestrationId)!;

      // Use complex model for planning as it requires strategic thinking
      const plannerAgent = await this.spawnSpecializedAgent(
        "architect",
        request.repositoryPath,
        `Create detailed execution plan for: ${request.objective}`,
        complexityAnalysis.recommendedModel, // Use recommended model for planning
        orchestrationId,
        request.foundationSessionId,
        progress.roomId
      );

      // Create planning objective
      const planningObjective = await this.objectiveService.createObjective({
        repositoryPath: request.repositoryPath,
        objectiveType: "feature" as ObjectiveType,
        description: `Planning phase: Create structured execution plan for ${request.objective}`,
        requirements: {
          orchestrationId,
          phase: "planning",
          complexityAnalysis,
          previousResults,
          objective: request.objective,
        },
      });

      await this.objectiveService.assignObjective(
        planningObjective.id,
        plannerAgent.id
      );

      // Create sub-objectives based on complexity analysis
      const subobjectives = await this.createSubobjectivesFromAnalysis(
        orchestrationId,
        request,
        complexityAnalysis
      );

      return {
        success: true,
        outputs: {
          plannerAgentId: plannerAgent.id,
          planningObjectiveId: planningObjective.id,
          subobjectives,
          executionPlan: "Detailed execution plan created",
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Execution Phase: Implement the planned solution
   */
  private async executeExecutionPhase(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis,
    previousResults: Record<string, any>
  ): Promise<{
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
  }> {
    this.logger.info("Executing execution phase", { orchestrationId });

    try {
      // Get orchestration progress to access roomId
      const progress = this.activeOrchestrations.get(orchestrationId)!;

      const executionAgents: string[] = [];

      // Spawn specialized agents based on complexity analysis
      for (const specialization of complexityAnalysis.requiredSpecializations) {
        if (specialization !== "architect") {
          // Architect already spawned in planning
          const agent = await this.spawnSpecializedAgent(
            specialization,
            request.repositoryPath,
            `Implement ${specialization} components for: ${request.objective}`,
            this.selectModelForSpecialization(
              specialization,
              complexityAnalysis
            ),
            orchestrationId,
            request.foundationSessionId,
            progress.roomId
          );
          executionAgents.push(agent.id);
        }
      }

      // Create execution coordination objective
      const executionObjective = await this.objectiveService.createObjective({
        repositoryPath: request.repositoryPath,
        objectiveType: "feature" as ObjectiveType,
        description: `Execution phase: Implement solution for ${request.objective}`,
        requirements: {
          orchestrationId,
          phase: "execution",
          complexityAnalysis,
          previousResults,
          executionAgents,
        },
      });

      return {
        success: true,
        outputs: {
          executionAgents,
          executionObjectiveId: executionObjective.id,
          implementationStatus: "Implementation in progress",
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Monitoring Phase: Track progress and handle issues
   */
  private async executeMonitoringPhase(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis,
    previousResults: Record<string, any>
  ): Promise<{
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
  }> {
    this.logger.info("Executing monitoring phase", { orchestrationId });

    try {
      // Get orchestration progress to access roomId
      const progress = this.activeOrchestrations.get(orchestrationId)!;

      // Use simple model for monitoring objectives
      const monitorAgent = await this.spawnSpecializedAgent(
        "generalist",
        request.repositoryPath,
        `Monitor progress and coordinate agents for: ${request.objective}`,
        "claude-3-7-sonnet-latest", // Simple monitoring objectives
        orchestrationId,
        request.foundationSessionId,
        progress.roomId
      );

      // Create monitoring objective
      const monitoringObjective = await this.objectiveService.createObjective({
        repositoryPath: request.repositoryPath,
        objectiveType: "maintenance" as ObjectiveType,
        description: `Monitoring phase: Track progress for ${request.objective}`,
        requirements: {
          orchestrationId,
          phase: "monitoring",
          previousResults,
        },
      });

      await this.objectiveService.assignObjective(
        monitoringObjective.id,
        monitorAgent.id
      );

      return {
        success: true,
        outputs: {
          monitorAgentId: monitorAgent.id,
          monitoringObjectiveId: monitoringObjective.id,
          monitoringStatus: "Active monitoring established",
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Cleanup Phase: Finalize and clean up resources
   */
  private async executeCleanupPhase(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis,
    previousResults: Record<string, any>
  ): Promise<{
    success: boolean;
    outputs?: Record<string, any>;
    error?: string;
  }> {
    this.logger.info("Executing cleanup phase", { orchestrationId });

    try {
      // Create final summary in knowledge graph
      await this.knowledgeGraphService.createEntity({
        id: `orchestration-summary-${orchestrationId}`,
        repositoryPath: request.repositoryPath,
        entityType: "insight",
        name: `Orchestration completed: ${request.title}`,
        description: `Structured orchestration completed for: ${request.objective}`,
        properties: {
          orchestrationId,
          objective: request.objective,
          complexityLevel: complexityAnalysis.complexityLevel,
          totalDuration:
            Date.now() -
            this.activeOrchestrations.get(orchestrationId)!.startTime.getTime(),
          phases: Object.keys(previousResults),
          spawnedAgents:
            this.activeOrchestrations.get(orchestrationId)!.spawnedAgents
              .length,
          tags: ["orchestration-summary", "completion", "structured"],
        },
        discoveredBy: "structured-orchestrator",
        discoveredDuring: "cleanup-phase",
        importanceScore: 0.9,
        confidenceScore: 1.0,
        relevanceScore: 0.9,
      });

      return {
        success: true,
        outputs: {
          cleanupStatus: "Cleanup completed successfully",
          finalSummary: `Orchestration ${orchestrationId} completed with all phases`,
          totalDuration:
            Date.now() -
            this.activeOrchestrations.get(orchestrationId)!.startTime.getTime(),
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Spawn specialized agent with intelligent model selection
   */
  private async spawnSpecializedAgent(
    specialization: string,
    repositoryPath: string,
    objectiveDescription: string,
    model: ModelType,
    orchestrationId: string,
    foundationSessionId?: string,
    roomId?: string
  ): Promise<{ id: string; agentName: string }> {
    const agent = await this.agentService.createAgent({
      agentName: specialization,
      repositoryPath,
      objectiveDescription,
      capabilities: ["ALL_TOOLS"],
      roomId: roomId, // Use the provided orchestration room
      autoCreateRoom: false, // Don't create a separate room - use the orchestration room
      metadata: {
        orchestrationId,
        specialization,
        structuredMode: true,
        spawnedAt: new Date().toISOString(),
      },
      claudeConfig: {
        model,
        prompt: this.generateSpecializedPrompt(
          specialization,
          objectiveDescription,
          orchestrationId
        ),
        sessionId: undefined, // Only set when resuming existing Claude sessions (UUID format)
      },
    });

    // Track spawned agent
    const progress = this.activeOrchestrations.get(orchestrationId)!;
    progress.spawnedAgents.push(agent.id);

    return agent;
  }

  /**
   * Select model based on agent specialization and complexity
   */
  private selectModelForSpecialization(
    specialization: string,
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): ModelType {
    // Simple specializations can use efficient model
    const simpleSpecializations = ["documentation", "testing"];
    if (
      simpleSpecializations.includes(specialization) &&
      complexityAnalysis.complexityLevel !== "complex"
    ) {
      return "claude-3-7-sonnet-latest";
    }

    // Complex specializations or complex objectives use recommended model
    return complexityAnalysis.recommendedModel;
  }

  /**
   * Create subobjectives based on complexity analysis
   */
  private async createSubobjectivesFromAnalysis(
    orchestrationId: string,
    request: StructuredOrchestrationRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): Promise<string[]> {
    const subobjectiveIds: string[] = [];
    const progress = this.activeOrchestrations.get(orchestrationId)!;

    // Create subobjectives for each required specialization
    for (const specialization of complexityAnalysis.requiredSpecializations) {
      const subobjective = await this.objectiveService.createObjective({
        repositoryPath: request.repositoryPath,
        objectiveType: this.mapSpecializationToObjectiveType(specialization),
        description: `${specialization} implementation for: ${request.objective}`,
        requirements: {
          orchestrationId,
          specialization,
          complexityLevel: complexityAnalysis.complexityLevel,
          estimatedDuration: Math.round(
            complexityAnalysis.estimatedDuration /
              complexityAnalysis.requiredSpecializations.length
          ),
        },
      });

      subobjectiveIds.push(subobjective.id);
      progress.createdObjectives.push(subobjective.id);
    }

    return subobjectiveIds;
  }

  /**
   * Map specialization to objective type
   */
  private mapSpecializationToObjectiveType(
    specialization: string
  ): ObjectiveType {
    const mapping: Record<string, ObjectiveType> = {
      frontend: "feature",
      backend: "feature",
      testing: "testing",
      documentation: "documentation",
      devops: "deployment",
      researcher: "analysis",
      architect: "feature",
      generalist: "feature",
    };
    return mapping[specialization] || "feature";
  }

  /**
   * Generate specialized prompt for agent
   */
  private generateSpecializedPrompt(
    specialization: string,
    objectiveDescription: string,
    orchestrationId: string
  ): string {
    return `You are a specialized ${specialization} agent in a structured orchestration (${orchestrationId}).

TASK: ${objectiveDescription}

You are operating within a structured phased workflow with intelligent model selection. Work autonomously using your specialization expertise.

AVAILABLE TOOLS: You have access to ALL Claude Code tools including file operations, code analysis, web browsing, etc.

COORDINATION: Use objective management tools and communication rooms for coordination with other agents.

Complete your assigned objective efficiently and report progress through the objective system.`;
  }

  /**
   * Get current orchestration status
   */
  public getOrchestrationStatus(
    orchestrationId: string
  ): OrchestrationProgress | null {
    return this.activeOrchestrations.get(orchestrationId) || null;
  }

  /**
   * List all active orchestrations
   */
  public getActiveOrchestrations(): OrchestrationProgress[] {
    return Array.from(this.activeOrchestrations.values());
  }

  /**
   * Cancel an active orchestration
   */
  public async cancelOrchestration(orchestrationId: string): Promise<boolean> {
    const progress = this.activeOrchestrations.get(orchestrationId);
    if (!progress) {
      return false;
    }

    try {
      // Terminate spawned agents
      for (const agentId of progress.spawnedAgents) {
        await this.agentService.terminateAgent(agentId);
      }

      // Update status
      progress.status = "cancelled";
      progress.phases[progress.currentPhase].status = "failed";

      // Emit cancellation event
      eventBus.emit("orchestration_cancelled", {
        orchestrationId,
        reason: "User requested cancellation",
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      this.logger.error("Failed to cancel orchestration", {
        orchestrationId,
        error,
      });
      return false;
    }
  }

  // Event handlers
  private async handleAgentStatusChange(data: any): Promise<void> {
    // Update orchestration progress based on agent status changes
    for (const [orchestrationId, progress] of this.activeOrchestrations) {
      if (progress.spawnedAgents.includes(data.agentId)) {
        // Map OrchestrationPhase to expected event phase values
        const mappedPhase = this.mapPhaseForEvent(progress.currentPhase);
        // Map StructuredOrchestrationStatus to expected event status values
        const mappedStatus = this.mapStatusForEvent(progress.status);

        eventBus.emit("orchestration_update", {
          orchestrationId,
          phase: mappedPhase,
          status: mappedStatus,
          agentCount: progress.spawnedAgents.length,
          completedObjectives: progress.createdObjectives.length, // Use created objectives as proxy
          totalObjectives: Object.keys(progress.phases).length, // Use phases as proxy for total objectives
          timestamp: new Date(),
          repositoryPath: data.repositoryPath, // Use from agent event data
          metadata: {
            agentStatusChange: {
              agentId: data.agentId,
              previousStatus: data.previousStatus,
              newStatus: data.newStatus,
            },
          },
        });
      }
    }
  }

  private async handleObjectiveCompletion(data: any): Promise<void> {
    // Update orchestration progress based on objective completion
    for (const [orchestrationId, progress] of this.activeOrchestrations) {
      if (progress.createdObjectives.includes(data.objectiveId)) {
        // Check if this completes a phase
        const currentPhase = progress.currentPhase;
        // Logic to determine if phase is complete would go here
      }
    }
  }

  private async handlePhaseChange(data: any): Promise<void> {
    const { orchestrationId, fromPhase, toPhase } = data;
    const progress = this.activeOrchestrations.get(orchestrationId);
    if (progress) {
      progress.currentPhase = toPhase;
      this.logger.info(`Orchestration phase changed`, {
        orchestrationId,
        fromPhase,
        toPhase,
      });
    }
  }

  private mapPhaseForEvent(
    phase: OrchestrationPhase
  ): "planning" | "execution" | "monitoring" | "completion" {
    switch (phase) {
      case "research":
      case "plan":
        return "planning";
      case "execute":
        return "execution";
      case "monitor":
        return "monitoring";
      case "cleanup":
        return "completion";
      default:
        return "planning";
    }
  }

  private mapStatusForEvent(
    status: StructuredOrchestrationStatus
  ): "started" | "in_progress" | "completed" | "failed" {
    switch (status) {
      case "pending":
        return "started";
      case "in_progress":
        return "in_progress";
      case "completed":
        return "completed";
      case "failed":
      case "cancelled":
        return "failed";
      default:
        return "started";
    }
  }
}
