import { EventEmitter } from 'events';
import { DatabaseManager } from '../database/index.js';
import { AgentService, ObjectiveService, CommunicationService, KnowledgeGraphService } from './index.js';
import { ObjectiveComplexityAnalyzer, type ObjectiveComplexityAnalysis, type ModelType } from './ObjectiveComplexityAnalyzer.js';
import { ClaudeSpawner } from '../process/ClaudeSpawner.js';
import { eventBus } from './EventBus.js';
import { Logger } from '../utils/logger.js';
import type { ObjectiveType, AgentStatus, MessageType } from '../schemas/index.js';

export interface PlanningRequest {
  objective: string;
  repositoryPath: string;
  foundationSessionId?: string;
  planningDepth?: 'surface' | 'detailed' | 'comprehensive';
  includeRiskAnalysis?: boolean;
  includeResourceEstimation?: boolean;
  preferredAgentTypes?: string[];
  constraints?: string[];
}

export interface ObjectiveBreakdown {
  id: string;
  title: string;
  description: string;
  objectiveType: ObjectiveType;
  priority: number;
  estimatedDuration: number; // in minutes
  dependencies: string[]; // IDs of other objectives
  requiredCapabilities: string[];
  assignedAgentType?: string;
  complexity: 'simple' | 'moderate' | 'complex';
  riskLevel: 'low' | 'medium' | 'high';
  deliverables: string[];
  acceptanceCriteria: string[];
}

export interface AgentSpecification {
  agentType: string;
  role: string;
  responsibilities: string[];
  requiredCapabilities: string[];
  objectiveAssignments: string[]; // Objective IDs
  coordinationRequirements: string[];
  dependsOn: string[]; // Other agent IDs
  priority: number;
  estimatedWorkload: number; // in minutes
}

export interface ExecutionPlan {
  planningId: string;
  objective: string;
  planningApproach: string;
  complexityAnalysis: ObjectiveComplexityAnalysis;
  
  // Objective Structure
  objectives: ObjectiveBreakdown[];
  objectiveDependencyGraph: Record<string, string[]>;
  criticalPath: string[];
  
  // Agent Coordination
  agents: AgentSpecification[];
  agentCoordination: {
    communicationStrategy: string;
    coordinationRooms: string[];
    progressReporting: string;
    conflictResolution: string;
  };
  
  // Risk Management
  riskAssessment: {
    identifiedRisks: Array<{
      type: string;
      description: string;
      probability: 'low' | 'medium' | 'high';
      impact: 'low' | 'medium' | 'high';
      mitigationStrategy: string;
    }>;
    contingencyPlans: string[];
  };
  
  // Resource Planning
  resourceEstimation: {
    totalEstimatedDuration: number;
    parallelExecutionTime: number;
    requiredCapabilities: string[];
    modelRecommendations: Record<string, ModelType>;
    foundationSessionOptimization: string;
  };
  
  // Execution Strategy
  executionStrategy: {
    phases: Array<{
      name: string;
      description: string;
      objectives: string[];
      agents: string[];
      duration: number;
    }>;
    qualityGates: string[];
    completionCriteria: string[];
    rollbackStrategy: string;
  };
  
  // Monitoring Plan
  monitoringPlan: {
    progressMetrics: string[];
    checkpoints: Array<{
      name: string;
      timing: string;
      criteria: string[];
    }>;
    escalationProcedures: string[];
  };
  
  // Created metadata
  createdAt: Date;
  createdBy: 'sequential-planner';
  planningDuration: number; // how long planning took
  confidenceScore: number; // 0-1, how confident we are in this plan
}

export interface PlanningResult {
  success: boolean;
  planningId: string;
  message: string;
  executionPlan?: ExecutionPlan;
  planningInsights?: string[];
  error?: string;
  planningDuration: number;
}

/**
 * Sequential Planning Service - Uses sequential thinking for deep objective analysis and planning
 * before spawning any agents. Creates detailed execution plans that agents can follow.
 */
export class SequentialPlanningService extends EventEmitter {
  private agentService: AgentService;
  private objectiveService: ObjectiveService;
  private communicationService: CommunicationService;
  private knowledgeGraphService: KnowledgeGraphService;
  private complexityAnalyzer: ObjectiveComplexityAnalyzer;
  private claudeSpawner: ClaudeSpawner;
  private logger: Logger;
  
  // Active planning sessions
  private activePlanningSessions = new Map<string, { startTime: Date; request: PlanningRequest }>();

  constructor(private db: DatabaseManager) {
    super();
    
    this.agentService = new AgentService(db);
    this.objectiveService = new ObjectiveService(db);
    this.communicationService = new CommunicationService(db);
    this.complexityAnalyzer = new ObjectiveComplexityAnalyzer();
    this.claudeSpawner = ClaudeSpawner.getInstance();
    this.logger = new Logger('SequentialPlanningService');
    
    // Initialize KnowledgeGraphService
    this.initializeKnowledgeGraphService(db);
  }

  private async initializeKnowledgeGraphService(db: DatabaseManager): Promise<void> {
    try {
      const { VectorSearchService } = await import('./VectorSearchService.js');
      const vectorService = new VectorSearchService(db);
      this.knowledgeGraphService = new KnowledgeGraphService(db, vectorService);
    } catch (error) {
      this.logger.warn('Failed to initialize KnowledgeGraphService:', error);
      // Fallback implementation
      this.knowledgeGraphService = {
        createEntity: async () => ({ id: 'fallback', name: 'fallback' }),
        findEntitiesBySemanticSearch: async () => []
      } as any;
    }
  }

  /**
   * Create a comprehensive execution plan using sequential thinking
   */
  async createExecutionPlan(request: PlanningRequest): Promise<PlanningResult> {
    const planningId = `seq_plan_${Date.now()}`;
    const startTime = Date.now();
    
    this.logger.info('Starting sequential planning', { planningId, objective: request.objective });
    
    try {
      // Step 1: Register planning session
      this.activePlanningSessions.set(planningId, {
        startTime: new Date(),
        request
      });

      // Step 2: Analyze objective complexity first
      this.logger.debug('Analyzing objective complexity for planning');
      const complexityAnalysis = await this.complexityAnalyzer.analyzeObjective(
        request.objective,
        'feature', // Default objective type for orchestration
        request.repositoryPath,
        {
          includeArchitectural: true,
          considerDependencies: true,
          evaluateRisks: true,
          estimateDuration: true
        }
      );

      // Step 3: Create planning room for coordination
      const planningRoomName = `planning_${planningId}`;
      const planningRoom = await this.communicationService.createRoom({
        name: planningRoomName,
        description: `Sequential planning session for: ${request.objective}`,
        repositoryPath: request.repositoryPath,
        metadata: {
          planningId,
          objective: request.objective,
          planningDepth: request.planningDepth || 'detailed',
          isSequentialPlanning: true
        }
      });

      // Step 4: Spawn specialized planning agent with sequential thinking
      const planningAgent = await this.spawnPlanningAgent(
        planningId,
        request,
        complexityAnalysis,
        planningRoomName
      );

      // Step 5: Wait for planning to complete and extract results
      const executionPlan = await this.waitForPlanningCompletion(
        planningId,
        planningAgent.id,
        planningRoomName,
        request,
        complexityAnalysis
      );

      const planningDuration = Date.now() - startTime;

      // Step 6: Store planning results in knowledge graph
      await this.storePlanningResults(planningId, request, executionPlan, planningDuration);

      this.logger.info('Sequential planning completed successfully', {
        planningId,
        duration: planningDuration,
        objectiveCount: executionPlan.objectives.length,
        agentCount: executionPlan.agents.length
      });

      return {
        success: true,
        planningId,
        message: `Sequential planning completed successfully. Created plan with ${executionPlan.objectives.length} objectives and ${executionPlan.agents.length} agents.`,
        executionPlan,
        planningInsights: this.extractPlanningInsights(executionPlan),
        planningDuration
      };

    } catch (error) {
      const planningDuration = Date.now() - startTime;
      this.logger.error('Sequential planning failed', { planningId, error, duration: planningDuration });
      
      return {
        success: false,
        planningId,
        message: `Sequential planning failed: ${error}`,
        error: String(error),
        planningDuration
      };
    } finally {
      // Cleanup
      setTimeout(() => {
        this.activePlanningSessions.delete(planningId);
      }, 300000); // Keep for 5 minutes for monitoring
    }
  }

  /**
   * Spawn specialized planning agent with sequential thinking capabilities
   */
  private async spawnPlanningAgent(
    planningId: string,
    request: PlanningRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis,
    roomName: string
  ): Promise<{ id: string; agentName: string }> {
    const planningPrompt = this.generateSequentialPlanningPrompt(
      request,
      complexityAnalysis,
      planningId,
      roomName
    );

    // Use the most capable model for planning as it's critical
    const planningModel: ModelType = complexityAnalysis.emergencyMode ? 
      'claude-opus-4-0' : 
      complexityAnalysis.recommendedModel;

    const agent = await this.agentService.createAgent({
      agentName: 'sequential-planner',
      agentType: 'planner_agent',
      repositoryPath: request.repositoryPath,
      objectiveDescription: `Create comprehensive execution plan using sequential thinking for: ${request.objective}`,
      capabilities: ['ALL_TOOLS'],
      roomId: roomName,
      metadata: {
        planningId,
        role: 'sequential-planner',
        planningDepth: request.planningDepth || 'detailed',
        isSequentialPlanning: true,
        objective: request.objective,
        spawnedAt: new Date().toISOString()
      },
      claudeConfig: {
        model: planningModel,
        prompt: planningPrompt,
        sessionId: undefined
      }
    });

    return agent;
  }

  /**
   * Generate specialized prompt for sequential planning agent
   */
  private generateSequentialPlanningPrompt(
    request: PlanningRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis,
    planningId: string,
    roomName: string
  ): string {
    const constraintsText = request.constraints ? 
      `\nCONSTRAINTS: ${request.constraints}` : '';
    
    const preferredAgentsText = request.preferredAgentTypes?.length ?
      `\nPREFERRED AGENT TYPES: ${request.preferredAgentTypes.join(', ')}` : '';

    return `🧠 SEQUENTIAL PLANNING AGENT - Deep Objective Analysis & Execution Planning

PLANNING SESSION: ${planningId}
OBJECTIVE: ${request.objective}
REPOSITORY: ${request.repositoryPath}
PLANNING DEPTH: ${request.planningDepth || 'detailed'}
COORDINATION ROOM: ${roomName}
COMPLEXITY LEVEL: ${complexityAnalysis.complexityLevel}${constraintsText}${preferredAgentsText}

You are a specialized planning agent with COMPLETE CLAUDE CODE CAPABILITIES and advanced sequential thinking.
Your primary role is to create comprehensive execution plans BEFORE any implementation agents are spawned.

🎯 CRITICAL MISSION:
Use sequential thinking to create a detailed execution plan that will be provided to implementation agents.
This eliminates the current problem where agents don't know what they're doing because there's no real planning.

🧠 SEQUENTIAL THINKING METHODOLOGY FOR PLANNING:
You MUST use the sequential_thinking tool systematically throughout this planning process:

1. **Initial Objective Analysis**:
   - Use sequential_thinking() to deeply understand the objective scope and requirements
   - Break down the objective into core components and sub-objectives
   - Identify hidden complexities and dependencies

2. **Knowledge Graph Research**:
   - Search knowledge graph for similar objectives and successful patterns
   - Learn from previous planning approaches and implementation strategies
   - Identify reusable components and proven solutions

3. **Objective Decomposition**:
   - Use sequential_thinking() to systematically break down work into specific objectives
   - Create hierarchical objective structure with clear dependencies
   - Define deliverables and acceptance criteria for each objective

4. **Agent Specialization Planning**:
   - Use sequential_thinking() to determine optimal agent types and responsibilities
   - Plan agent coordination strategy and communication requirements
   - Design dependency management and conflict resolution approaches

5. **Risk Analysis & Mitigation**:
   - Use sequential_thinking() to identify potential risks and failure points
   - Develop mitigation strategies and contingency plans
   - Plan quality gates and validation checkpoints

6. **Resource & Timeline Planning**:
   - Use sequential_thinking() to estimate effort and resource requirements
   - Plan parallel execution opportunities and critical path optimization
   - Design progress monitoring and reporting strategy

7. **Execution Strategy Design**:
   - Use sequential_thinking() to create phased execution approach
   - Plan coordination mechanisms and progress tracking
   - Design completion validation and success criteria

🛠️ AVAILABLE PLANNING TOOLS:
- sequential_thinking() - CRITICAL: Use for all complex planning analysis
- search_knowledge_graph() - Learn from previous similar objectives
- store_knowledge_memory() - Document planning insights and decisions
- send_message() - Coordinate planning in room ${roomName}
- create_objective() - Create structured planning objectives if needed
- join_room() - You're already connected to planning room

📋 REQUIRED PLANNING OUTPUTS:
After completing your sequential thinking analysis, create comprehensive plan including:

1. **Objective Breakdown Structure**:
   - Specific, actionable objectives with clear deliverables
   - Objective dependencies and sequencing requirements
   - Effort estimates and complexity ratings
   - Acceptance criteria for each objective

2. **Agent Specification Plan**:
   - Required agent types and their specific responsibilities
   - Agent coordination and communication strategy
   - Dependency management between agents
   - Workload distribution and parallel execution opportunities

3. **Risk Management Plan**:
   - Identified risks with probability and impact assessment
   - Mitigation strategies and contingency plans
   - Quality gates and validation checkpoints
   - Escalation procedures for issues

4. **Execution Strategy**:
   - Phased execution approach with clear milestones
   - Progress monitoring and reporting mechanisms
   - Completion criteria and validation approach
   - Resource optimization and efficiency measures

🎯 PLANNING WORKFLOW:
1. **Start with sequential_thinking()** to analyze the objective comprehensively
2. **Search knowledge graph** for relevant patterns and successful approaches
3. **Use sequential_thinking()** for objective decomposition and dependency analysis
4. **Use sequential_thinking()** for agent coordination and resource planning
5. **Use sequential_thinking()** for risk analysis and mitigation strategies
6. **Store planning insights** in knowledge graph for future use
7. **Report final plan** in coordination room with complete details

⚠️ CRITICAL PLANNING REQUIREMENTS:
- ALWAYS start with sequential_thinking() for initial objective analysis
- Use sequential_thinking() for every major planning decision
- Create specific, actionable objectives (not vague descriptions)
- Design clear agent responsibilities and coordination mechanisms
- Include realistic effort estimates and dependency management
- Plan for monitoring, validation, and success measurement
- Document reasoning and assumptions for future reference

🎯 SUCCESS CRITERIA:
- Implementation agents receive clear, specific instructions
- All dependencies and coordination requirements are planned
- Risk mitigation and quality assurance strategies are defined
- Resource allocation and timeline estimates are realistic
- Progress monitoring and completion validation approaches are specified

CRITICAL: You are creating the blueprint that implementation agents will follow.
The quality of your planning directly determines the success of the entire orchestration.
Start immediately with sequential_thinking() to analyze the objective and begin systematic planning.`;
  }

  /**
   * Wait for planning completion and extract execution plan
   */
  private async waitForPlanningCompletion(
    planningId: string,
    agentId: string,
    roomName: string,
    request: PlanningRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): Promise<ExecutionPlan> {
    // For now, we'll simulate planning completion and create a structured plan
    // In a real implementation, this would monitor the planning agent's progress
    // and extract the actual plan from the agent's outputs
    
    this.logger.info('Waiting for planning completion', { planningId, agentId });
    
    // Wait for planning to complete (simplified - would monitor agent status in real implementation)
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second planning window
    
    // Create a structured execution plan based on the objective and complexity analysis
    // This would normally be extracted from the planning agent's sequential thinking outputs
    const executionPlan = await this.createStructuredExecutionPlan(
      planningId,
      request,
      complexityAnalysis
    );
    
    return executionPlan;
  }

  /**
   * Create structured execution plan based on analysis
   */
  private async createStructuredExecutionPlan(
    planningId: string,
    request: PlanningRequest,
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): Promise<ExecutionPlan> {
    // This is a template that would be populated by the planning agent's sequential thinking output
    // For now, we create a reasonable plan based on the complexity analysis
    
    const objectives: ObjectiveBreakdown[] = [];
    const agents: AgentSpecification[] = [];
    
    // Create objectives based on required specializations
    let objectiveId = 1;
    for (const specialization of complexityAnalysis.requiredSpecializations) {
      const objective: ObjectiveBreakdown = {
        id: `objective_${objectiveId}`,
        title: `${specialization} Implementation`,
        description: `Implement ${specialization} components for: ${request.objective}`,
        objectiveType: this.mapSpecializationToObjectiveType(specialization),
        priority: specialization === 'architect' ? 10 : 5,
        estimatedDuration: Math.round(complexityAnalysis.estimatedDuration / complexityAnalysis.requiredSpecializations.length),
        dependencies: specialization === 'architect' ? [] : ['objective_1'], // Most objectives depend on architecture
        requiredCapabilities: this.getCapabilitiesForSpecialization(specialization),
        assignedAgentType: specialization,
        complexity: complexityAnalysis.complexityLevel,
        riskLevel: this.getRiskLevelForSpecialization(specialization),
        deliverables: this.getDeliverablesForSpecialization(specialization),
        acceptanceCriteria: this.getAcceptanceCriteriaForSpecialization(specialization)
      };
      objectives.push(objective);
      
      // Create corresponding agent specification
      const agent: AgentSpecification = {
        agentType: specialization,
        role: this.getRoleForSpecialization(specialization),
        responsibilities: this.getResponsibilitiesForSpecialization(specialization),
        requiredCapabilities: this.getCapabilitiesForSpecialization(specialization),
        objectiveAssignments: [`objective_${objectiveId}`],
        coordinationRequirements: this.getCoordinationRequirementsForSpecialization(specialization),
        dependsOn: specialization === 'architect' ? [] : ['architect'],
        priority: specialization === 'architect' ? 10 : 5,
        estimatedWorkload: Math.round(complexityAnalysis.estimatedDuration / complexityAnalysis.requiredSpecializations.length)
      };
      agents.push(agent);
      
      objectiveId++;
    }

    const executionPlan: ExecutionPlan = {
      planningId,
      objective: request.objective,
      planningApproach: 'sequential-thinking-based',
      complexityAnalysis,
      
      objectives,
      objectiveDependencyGraph: this.buildDependencyGraph(objectives),
      criticalPath: this.calculateCriticalPath(objectives),
      
      agents,
      agentCoordination: {
        communicationStrategy: 'room-based coordination with progress reporting',
        coordinationRooms: [`execution_${planningId}`],
        progressReporting: 'regular status updates in coordination room',
        conflictResolution: 'escalation to architect agent'
      },
      
      riskAssessment: {
        identifiedRisks: complexityAnalysis.riskFactors.map(risk => ({
          type: 'implementation',
          description: risk,
          probability: 'medium' as const,
          impact: 'medium' as const,
          mitigationStrategy: 'careful planning and monitoring'
        })),
        contingencyPlans: ['fallback to simpler implementation', 'additional agent spawning if needed']
      },
      
      resourceEstimation: {
        totalEstimatedDuration: complexityAnalysis.estimatedDuration,
        parallelExecutionTime: Math.round(complexityAnalysis.estimatedDuration * 0.6), // Assuming 40% efficiency from parallelization
        requiredCapabilities: this.getAllRequiredCapabilities(complexityAnalysis.requiredSpecializations),
        modelRecommendations: this.getModelRecommendations(complexityAnalysis.requiredSpecializations, complexityAnalysis),
        foundationSessionOptimization: request.foundationSessionId ? 
          'use shared foundation session for 85-90% cost reduction' : 
          'recommend creating foundation session for cost optimization'
      },
      
      executionStrategy: {
        phases: this.createExecutionPhases(objectives, agents),
        qualityGates: ['objective completion validation', 'integration testing', 'final review'],
        completionCriteria: ['all objectives completed', 'all acceptance criteria met', 'quality gates passed'],
        rollbackStrategy: 'git-based rollback with incremental restore'
      },
      
      monitoringPlan: {
        progressMetrics: ['objective completion percentage', 'agent status', 'quality gate status'],
        checkpoints: [
          { name: 'Architecture Review', timing: '25% completion', criteria: ['architecture approved', 'dependencies clear'] },
          { name: 'Implementation Review', timing: '75% completion', criteria: ['core functionality complete', 'testing started'] },
          { name: 'Final Review', timing: '95% completion', criteria: ['all features implemented', 'testing complete'] }
        ],
        escalationProcedures: ['architect consultation', 'additional agent spawning', 'objective refinement']
      },
      
      createdAt: new Date(),
      createdBy: 'sequential-planner',
      planningDuration: 0, // Will be set by caller
      confidenceScore: this.calculateConfidenceScore(complexityAnalysis)
    };

    return executionPlan;
  }

  // Helper methods for plan creation
  private mapSpecializationToObjectiveType(specialization: string): ObjectiveType {
    const mapping: Record<string, ObjectiveType> = {
      'frontend': 'feature',
      'backend': 'feature',
      'testing': 'testing',
      'documentation': 'documentation',
      'devops': 'deployment',
      'researcher': 'analysis',
      'architect': 'feature',
      'generalist': 'feature'
    };
    return mapping[specialization] || 'feature';
  }

  private getCapabilitiesForSpecialization(specialization: string): string[] {
    const capabilities: Record<string, string[]> = {
      'frontend': ['ui_development', 'component_design', 'responsive_design'],
      'backend': ['api_development', 'database_design', 'server_logic'],
      'testing': ['test_automation', 'quality_assurance', 'test_design'],
      'documentation': ['technical_writing', 'api_documentation', 'user_guides'],
      'devops': ['deployment', 'infrastructure', 'ci_cd'],
      'researcher': ['research', 'analysis', 'investigation'],
      'architect': ['system_design', 'coordination', 'planning'],
      'generalist': ['general_development', 'problem_solving']
    };
    return capabilities[specialization] || ['general_development'];
  }

  private getRiskLevelForSpecialization(specialization: string): 'low' | 'medium' | 'high' {
    const riskLevels: Record<string, 'low' | 'medium' | 'high'> = {
      'frontend': 'low',
      'backend': 'medium',
      'testing': 'low',
      'documentation': 'low',
      'devops': 'high',
      'researcher': 'low',
      'architect': 'medium',
      'generalist': 'medium'
    };
    return riskLevels[specialization] || 'medium';
  }

  private getDeliverablesForSpecialization(specialization: string): string[] {
    const deliverables: Record<string, string[]> = {
      'frontend': ['UI components', 'responsive layouts', 'user interfaces'],
      'backend': ['API endpoints', 'database schema', 'business logic'],
      'testing': ['test suites', 'test reports', 'quality metrics'],
      'documentation': ['technical docs', 'user guides', 'API documentation'],
      'devops': ['deployment scripts', 'infrastructure config', 'CI/CD pipeline'],
      'researcher': ['research findings', 'analysis reports', 'recommendations'],
      'architect': ['system design', 'architecture documentation', 'coordination plan'],
      'generalist': ['implemented features', 'code solutions', 'integration work']
    };
    return deliverables[specialization] || ['implementation work'];
  }

  private getAcceptanceCriteriaForSpecialization(specialization: string): string[] {
    const criteria: Record<string, string[]> = {
      'frontend': ['UI functions correctly', 'responsive design works', 'accessibility standards met'],
      'backend': ['APIs return correct data', 'database operations work', 'error handling implemented'],
      'testing': ['all tests pass', 'coverage targets met', 'quality gates satisfied'],
      'documentation': ['documentation is accurate', 'examples work', 'content is clear'],
      'devops': ['deployment succeeds', 'infrastructure is stable', 'monitoring works'],
      'researcher': ['research is thorough', 'findings are actionable', 'recommendations are clear'],
      'architect': ['design is sound', 'dependencies are clear', 'plan is actionable'],
      'generalist': ['functionality works', 'code quality is good', 'integration is successful']
    };
    return criteria[specialization] || ['work is complete and functional'];
  }

  private getRoleForSpecialization(specialization: string): string {
    const roles: Record<string, string> = {
      'frontend': 'Frontend Developer',
      'backend': 'Backend Developer',
      'testing': 'QA Engineer',
      'documentation': 'Technical Writer',
      'devops': 'DevOps Engineer',
      'researcher': 'Research Analyst',
      'architect': 'Solution Architect',
      'generalist': 'Full-Stack Developer'
    };
    return roles[specialization] || 'Developer';
  }

  private getResponsibilitiesForSpecialization(specialization: string): string[] {
    const responsibilities: Record<string, string[]> = {
      'frontend': ['Implement user interfaces', 'Ensure responsive design', 'Handle user interactions'],
      'backend': ['Develop APIs', 'Design database schema', 'Implement business logic'],
      'testing': ['Create test suites', 'Validate functionality', 'Ensure quality standards'],
      'documentation': ['Write technical documentation', 'Create user guides', 'Document APIs'],
      'devops': ['Setup deployment pipeline', 'Configure infrastructure', 'Monitor systems'],
      'researcher': ['Conduct research', 'Analyze requirements', 'Provide recommendations'],
      'architect': ['Design system architecture', 'Coordinate team efforts', 'Make technical decisions'],
      'generalist': ['Implement features', 'Solve problems', 'Support team efforts']
    };
    return responsibilities[specialization] || ['Implement assigned functionality'];
  }

  private getCoordinationRequirementsForSpecialization(specialization: string): string[] {
    const coordination: Record<string, string[]> = {
      'frontend': ['coordinate with backend for API integration', 'align with designer for UI specs'],
      'backend': ['coordinate with frontend for API contracts', 'align with devops for deployment'],
      'testing': ['coordinate with all teams for test requirements', 'report issues to development teams'],
      'documentation': ['coordinate with all teams for documentation needs', 'align with product for user guides'],
      'devops': ['coordinate with development teams for deployment needs', 'align with operations for infrastructure'],
      'researcher': ['coordinate with stakeholders for requirements', 'share findings with implementation teams'],
      'architect': ['coordinate all team efforts', 'resolve technical conflicts', 'guide technical decisions'],
      'generalist': ['coordinate with relevant teams for assigned work', 'support cross-functional needs']
    };
    return coordination[specialization] || ['coordinate with team as needed'];
  }

  private buildDependencyGraph(objectives: ObjectiveBreakdown[]): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    for (const objective of objectives) {
      graph[objective.id] = objective.dependencies;
    }
    return graph;
  }

  private calculateCriticalPath(objectives: ObjectiveBreakdown[]): string[] {
    // Simplified critical path calculation - in reality would use proper algorithms
    return objectives
      .sort((a, b) => b.estimatedDuration - a.estimatedDuration)
      .slice(0, Math.ceil(objectives.length / 2))
      .map(objective => objective.id);
  }

  private getAllRequiredCapabilities(specializations: string[]): string[] {
    const allCapabilities = new Set<string>();
    for (const spec of specializations) {
      for (const capability of this.getCapabilitiesForSpecialization(spec)) {
        allCapabilities.add(capability);
      }
    }
    return Array.from(allCapabilities);
  }

  private getModelRecommendations(
    specializations: string[],
    complexityAnalysis: ObjectiveComplexityAnalysis
  ): Record<string, ModelType> {
    const recommendations: Record<string, ModelType> = {};
    for (const spec of specializations) {
      if (['architect', 'researcher'].includes(spec) || complexityAnalysis.complexityLevel === 'complex') {
        recommendations[spec] = complexityAnalysis.recommendedModel;
      } else {
        recommendations[spec] = 'claude-3-7-sonnet-latest'; // Efficient model for simpler objectives
      }
    }
    return recommendations;
  }

  private createExecutionPhases(objectives: ObjectiveBreakdown[], agents: AgentSpecification[]): Array<{
    name: string;
    description: string;
    objectives: string[];
    agents: string[];
    duration: number;
  }> {
    // Simplified phase creation - would be more sophisticated in real implementation
    const architectObjectives = objectives.filter(o => o.assignedAgentType === 'architect');
    const implementationObjectives = objectives.filter(o => o.assignedAgentType !== 'architect' && !['testing', 'documentation'].includes(o.assignedAgentType || ''));
    const validationObjectives = objectives.filter(o => ['testing', 'documentation'].includes(o.assignedAgentType || ''));
    
    return [
      {
        name: 'Planning & Architecture',
        description: 'Establish architecture and detailed planning',
        objectives: architectObjectives.map(o => o.id),
        agents: agents.filter(a => a.agentType === 'architect').map(a => a.agentType),
        duration: architectObjectives.reduce((sum, objective) => sum + objective.estimatedDuration, 0)
      },
      {
        name: 'Implementation',
        description: 'Core feature implementation',
        objectives: implementationObjectives.map(o => o.id),
        agents: agents.filter(a => !['architect', 'testing', 'documentation'].includes(a.agentType)).map(a => a.agentType),
        duration: Math.max(...implementationObjectives.map(o => o.estimatedDuration)) // Parallel execution
      },
      {
        name: 'Validation & Documentation',
        description: 'Testing and documentation completion',
        objectives: validationObjectives.map(o => o.id),
        agents: agents.filter(a => ['testing', 'documentation'].includes(a.agentType)).map(a => a.agentType),
        duration: Math.max(...validationObjectives.map(o => o.estimatedDuration)) // Parallel execution
      }
    ];
  }

  private calculateConfidenceScore(complexityAnalysis: ObjectiveComplexityAnalysis): number {
    // Simple confidence calculation based on complexity and risk factors
    let score = 0.8; // Base confidence
    
    if (complexityAnalysis.complexityLevel === 'simple') score += 0.1;
    if (complexityAnalysis.complexityLevel === 'complex') score -= 0.2;
    
    // Reduce confidence based on risk factors
    score -= (complexityAnalysis.riskFactors.length * 0.05);
    
    return Math.max(0.1, Math.min(1.0, score));
  }

  /**
   * Store planning results in knowledge graph
   */
  private async storePlanningResults(
    planningId: string,
    request: PlanningRequest,
    executionPlan: ExecutionPlan,
    planningDuration: number
  ): Promise<void> {
    try {
      await this.knowledgeGraphService.createEntity({
        id: `sequential-planning-${planningId}`,
        repositoryPath: request.repositoryPath,
        entityType: 'insight',
        name: `Sequential Planning: ${request.objective}`,
        description: `Comprehensive execution plan created using sequential thinking for: ${request.objective}`,
        properties: {
          planningId,
          objective: request.objective,
          planningApproach: 'sequential-thinking',
          planningDuration,
          objectiveCount: executionPlan.objectives.length,
          agentCount: executionPlan.agents.length,
          complexityLevel: executionPlan.complexityAnalysis.complexityLevel,
          confidenceScore: executionPlan.confidenceScore,
          totalEstimatedDuration: executionPlan.resourceEstimation.totalEstimatedDuration,
          tags: ['sequential-planning', 'execution-plan', 'orchestration', executionPlan.complexityAnalysis.complexityLevel]
        },
        discoveredBy: 'sequential-planning-service',
        discoveredDuring: 'planning-phase',
        importanceScore: 0.9,
        confidenceScore: executionPlan.confidenceScore,
        relevanceScore: 0.9
      });
    } catch (error) {
      this.logger.warn('Failed to store planning results in knowledge graph:', error);
    }
  }

  /**
   * Extract planning insights for summary
   */
  private extractPlanningInsights(executionPlan: ExecutionPlan): string[] {
    const insights: string[] = [];
    
    insights.push(`Planning approach: ${executionPlan.planningApproach}`);
    insights.push(`Complexity level: ${executionPlan.complexityAnalysis.complexityLevel}`);
    insights.push(`Total objectives created: ${executionPlan.objectives.length}`);
    insights.push(`Agent specializations required: ${executionPlan.agents.map(a => a.agentType).join(', ')}`);
    insights.push(`Estimated total duration: ${executionPlan.resourceEstimation.totalEstimatedDuration} minutes`);
    insights.push(`Parallel execution time: ${executionPlan.resourceEstimation.parallelExecutionTime} minutes`);
    insights.push(`Confidence score: ${(executionPlan.confidenceScore * 100).toFixed(1)}%`);
    
    if (executionPlan.riskAssessment.identifiedRisks.length > 0) {
      insights.push(`Identified ${executionPlan.riskAssessment.identifiedRisks.length} potential risks with mitigation strategies`);
    }
    
    insights.push(`Execution phases: ${executionPlan.executionStrategy.phases.map(p => p.name).join(' → ')}`);
    
    return insights;
  }

  /**
   * Get a stored execution plan
   */
  async getExecutionPlan(planningId: string): Promise<ExecutionPlan | null> {
    // In a real implementation, this would retrieve the plan from storage
    // For now, we'll return null as plans are created on-demand
    return null;
  }

  /**
   * Get active planning sessions
   */
  getActivePlanningSessions(): Array<{ planningId: string; request: PlanningRequest; startTime: Date }> {
    return Array.from(this.activePlanningSessions.entries()).map(([planningId, session]) => ({
      planningId,
      request: session.request,
      startTime: session.startTime
    }));
  }
}