import type { McpTool } from '../schemas/tools/index.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DatabaseManager } from '../database/index.js';
import { PlanRepository, ObjectiveRepository } from '../repositories/index.js';
import { SequentialPlanningService } from '../services/SequentialPlanningService.js';
import type { ObjectiveComplexityAnalysis } from '../services/ObjectiveComplexityAnalyzer.js';
import { ulid } from 'ulidx';

// Import centralized request schemas (simplified)
import {
  GetPlanSchema,
  ListPlansSchema,
  GeneratePlanFromObjectiveSchema,
  DeletePlanSchema,
  UpdatePlanSchema
} from '../schemas/tools/plans.js';

// Import centralized response schemas
import {
  createSuccessResponse,
  createErrorResponse
} from '../schemas/toolResponses.js';

// Import response types (simplified)
import {
  GetPlanResponseSchema,
  ListPlansResponseSchema,
  GeneratePlanFromObjectiveResponseSchema,
  CreatePlanResponseSchema,
  DeletePlanResponseSchema,
  UpdatePlanResponseSchema,
  type GetPlanRequest,
  type ListPlansRequest,
  type GeneratePlanFromObjectiveRequest,
  type DeletePlanRequest,
  type UpdatePlanRequest,
  type GetPlanResponse,
  type ListPlansResponse,
  type GeneratePlanFromObjectiveResponse,
  type CreatePlanResponse,
  type DeletePlanResponse,
  type UpdatePlanResponse
} from '../schemas/tools/plans.js';

import type { NewPlan, ObjectiveType, SectionType } from '../schemas/index.js';

/**
 * STREAMLINED Plan Tools - 4 essential tools only
 * Plans are high-level orchestration templates that create Objectives for execution
 */
export class PlanTools {
  private planRepository: PlanRepository;
  private objectiveRepository: ObjectiveRepository;
  private sequentialPlanningService: SequentialPlanningService;

  constructor(private db: DatabaseManager, private repositoryPath: string) {
    this.planRepository = new PlanRepository(db);
    this.objectiveRepository = new ObjectiveRepository(db);
    this.sequentialPlanningService = new SequentialPlanningService(db);
  }

  /**
   * Get MCP tools for plan functionality - STREAMLINED to 6 essential tools
   * Plans are high-level orchestration templates that create Objectives for execution
   */
  getTools(): McpTool[] {
    return [
      {
        name: 'create_execution_plan',
        description: 'Create a high-level execution plan that generates coordinated Objectives for implementation',
        inputSchema: zodToJsonSchema(GeneratePlanFromObjectiveSchema),
        outputSchema: zodToJsonSchema(GeneratePlanFromObjectiveResponseSchema),
        handler: this.generatePlanFromObjective.bind(this)
      },
      {
        name: 'get_execution_plan',
        description: 'Get an execution plan with progress derived from linked Objectives',
        inputSchema: zodToJsonSchema(GetPlanSchema),
        outputSchema: zodToJsonSchema(GetPlanResponseSchema),
        handler: this.getPlan.bind(this)
      },
      {
        name: 'execute_with_plan',
        description: 'Execute a plan by creating Objectives and spawning coordinated agents',
        inputSchema: zodToJsonSchema(GetPlanSchema),
        outputSchema: zodToJsonSchema(CreatePlanResponseSchema),
        handler: this.executeWithPlan.bind(this)
      },
      {
        name: 'list_execution_plans',
        description: 'List execution plans for discovery and monitoring',
        inputSchema: zodToJsonSchema(ListPlansSchema),
        outputSchema: zodToJsonSchema(ListPlansResponseSchema),
        handler: this.listPlans.bind(this)
      },
      {
        name: 'delete_execution_plan',
        description: 'Delete an execution plan by ID',
        inputSchema: zodToJsonSchema(DeletePlanSchema),
        outputSchema: zodToJsonSchema(DeletePlanResponseSchema),
        handler: this.deletePlan.bind(this)
      },
      {
        name: 'update_execution_plan',
        description: 'Update an execution plan\'s status, priority, title, description, objectives, acceptanceCriteria, constraints, sections array, or metadata',
        inputSchema: zodToJsonSchema(UpdatePlanSchema),
        outputSchema: zodToJsonSchema(UpdatePlanResponseSchema),
        handler: this.updatePlan.bind(this)
      }
    ];
  }

  /**
   * Generate a plan from an objective using intelligent sequential planning
   */
  async generatePlanFromObjective(request: GeneratePlanFromObjectiveRequest): Promise<GeneratePlanFromObjectiveResponse> {
    try {
      // Use provided repositoryPath or fall back to the stored one
      const repoPath = request.repositoryPath || this.repositoryPath;
      
      // Use SequentialPlanningService for intelligent plan generation
      const planningResult = await this.sequentialPlanningService.createExecutionPlan({
        objective: request.objective,
        repositoryPath: repoPath,
        foundationSessionId: undefined, // Not needed for plan generation
        planningDepth: 'detailed',
        includeRiskAnalysis: true,
        includeResourceEstimation: true,
        constraints: request.constraints ? [request.constraints] : []
      });

      if (!planningResult.success || !planningResult.executionPlan) {
        return createErrorResponse('Failed to generate intelligent plan', planningResult.error || 'Unknown error');
      }

      // Convert SequentialPlanningService output to our Plan format
      const sections = planningResult.executionPlan.objectives.map((objective, index) => ({
        id: ulid(),
        type: this.mapObjectiveTypeToSectionType(objective.objectiveType) as SectionType,
        title: objective.title,
        description: objective.description,
        agentResponsibility: objective.assignedAgentType || 'general',
        estimatedHours: objective.estimatedDuration ? this.parseHours(objective.estimatedDuration) : 2,
        priority: objective.priority || (index + 1),
        prerequisites: objective.dependencies || [],
        objectiveTemplates: [{
          description: objective.description,
          objectiveType: objective.objectiveType,
          estimatedHours: objective.estimatedDuration ? this.parseHours(objective.estimatedDuration) : 2,
          dependencies: objective.dependencies || []
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
      
      const planData: Omit<NewPlan, 'id' | 'createdAt' | 'updatedAt'> = {
        repositoryPath: repoPath,
        title: request.title,
        description: planningResult.executionPlan.planningApproach || `Intelligent plan for: ${request.objective}`,
        objectives: request.objective,
        constraints: request.constraints,
        priority: request.priority,
        createdByAgent: request.createdByAgent,
        sections,
        metadata: {
          estimatedTotalHours: sections.reduce((sum, s) => sum + (s.estimatedHours || 0), 0),
          riskLevel: this.calculateRiskLevel(planningResult.executionPlan.complexityAnalysis),
          technologies: []
        },
        status: 'draft'
      };

      const plan = await this.planRepository.createPlan(planData);
      
      const totalObjectiveTemplates = plan.sections.reduce((sum, section) => sum + (section.objectiveTemplates?.length || 0), 0);
      const estimatedHours = plan.metadata.estimatedTotalHours;

      return createSuccessResponse('Intelligent plan generated successfully from objective', {
        planId: plan.id,
        title: plan.title,
        sectionsGenerated: plan.sections.length,
        totalTodos: totalObjectiveTemplates,
        estimatedHours,
        complexityLevel: planningResult.executionPlan.complexityAnalysis?.complexityLevel,
        riskLevel: plan.metadata.riskLevel,
        planningInsights: planningResult.planningInsights?.slice(0, 3) // Top 3 insights
      });
    } catch (error: any) {
      return createErrorResponse(`Failed to generate plan from objective`, error.message);
    }
  }

  /**
   * Get a specific plan - progress derived from linked Tasks
   */
  async getPlan(request: GetPlanRequest): Promise<GetPlanResponse> {
    try {
      const plan = await this.planRepository.findById(request.planId);
      if (!plan) {
        return createErrorResponse(`Plan not found`, `Plan with ID ${request.planId} not found`);
      }

      // Get progress from linked Tasks instead of plan todos
      const linkedTasks = await this.objectiveRepository.findByRepositoryPath(plan.repositoryPath, {
        // Filter tasks that belong to this plan
      });
      
      const planTasks = linkedTasks.filter(task => 
        task.requirements && typeof task.requirements === 'object' && 
        'planId' in task.requirements && task.requirements.planId === plan.id
      );

      const totalTasks = planTasks.length;
      const completedTasks = planTasks.filter(task => task.status === 'completed').length;
      const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const progress = {
        totalSections: plan.sections.length,
        completedSections: 0, // Calculate from task completion
        totalTodos: totalTasks,
        completedTodos: completedTasks,
        progressPercentage
      };

      return createSuccessResponse('Plan retrieved successfully', {
        plan,
        progress
      });
    } catch (error: any) {
      return createErrorResponse(`Failed to get plan`, error.message);
    }
  }

  /**
   * Execute a plan by creating Tasks from the plan sections
   */
  async executeWithPlan(request: GetPlanRequest): Promise<CreatePlanResponse> {
    try {
      const plan = await this.planRepository.findById(request.planId);
      if (!plan) {
        return createErrorResponse(`Plan not found`, `Plan with ID ${request.planId} not found`);
      }

      // Create Tasks from plan sections (this is where the magic happens)
      const createdTasks = [];
      for (const section of plan.sections) {
        for (const taskTemplate of section.objectiveTemplates || []) {
          const task = await this.objectiveRepository.create({
            id: ulid(),
            repositoryPath: plan.repositoryPath,
            objectiveType: (taskTemplate.objectiveType || 'feature') as ObjectiveType,
            status: 'pending',
            description: `${section.title}: ${taskTemplate.description}`,
            requirements: {
              planId: plan.id,
              sectionId: section.id,
              sectionType: section.type,
              agentResponsibility: section.agentResponsibility,
              estimatedHours: taskTemplate.estimatedHours
            },
            priority: section.priority || 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          createdTasks.push(task);
        }
      }

      // Update plan status to in progress
      await this.planRepository.updateStatus(plan.id, 'in_progress');

      return createSuccessResponse('Plan executed successfully - Tasks created', {
        planId: plan.id,
        title: plan.title,
        status: 'executing',
        sectionsCount: plan.sections.length,
        totalTodos: createdTasks.length, // Using existing field name
        createdTaskIds: createdTasks.map(t => t.id)
      });
    } catch (error: any) {
      return createErrorResponse(`Failed to execute plan`, error.message);
    }
  }

  /**
   * List plans with filtering
   */
  async listPlans(request: ListPlansRequest): Promise<ListPlansResponse> {
    try {
      const result = await this.planRepository.findFiltered(request);

      return createSuccessResponse('Plans retrieved successfully', {
        plans: result.plans,
        total: result.total,
        hasMore: result.hasMore
      });
    } catch (error: any) {
      return createErrorResponse(`Failed to list plans`, error.message);
    }
  }

  /**
   * Delete a specific plan
   */
  async deletePlan(request: DeletePlanRequest): Promise<DeletePlanResponse> {
    try {
      const deleted = await this.planRepository.delete(request.planId);
      
      if (!deleted) {
        return createErrorResponse(`Plan not found`, `Plan with ID ${request.planId} not found`);
      }

      return createSuccessResponse('Plan deleted successfully', {
        planId: request.planId,
        deleted: true
      });
    } catch (error: any) {
      return createErrorResponse(`Failed to delete plan`, error.message);
    }
  }

  /**
   * Update a specific plan
   */
  async updatePlan(request: UpdatePlanRequest): Promise<UpdatePlanResponse> {
    try {
      const plan = await this.planRepository.findById(request.planId);
      if (!plan) {
        return createErrorResponse(`Plan not found`, `Plan with ID ${request.planId} not found`);
      }

      // Build update data with updatedAt timestamp
      const updateData = {
        ...request.updates,
        updatedAt: new Date().toISOString()
      };

      // Track which fields are being updated
      const updatedFields = Object.keys(request.updates);

      // Handle status-specific updates
      if (request.updates.status) {
        if (request.updates.status === 'in_progress' && !plan.startedAt) {
          (updateData as any).startedAt = new Date().toISOString();
          updatedFields.push('startedAt');
        } else if (request.updates.status === 'completed') {
          (updateData as any).completedAt = new Date().toISOString();
          updatedFields.push('completedAt');
        }
      }

      const updatedPlan = await this.planRepository.update(request.planId, updateData);
      
      if (!updatedPlan) {
        return createErrorResponse(`Failed to update plan`, `Plan with ID ${request.planId} could not be updated`);
      }

      return createSuccessResponse('Plan updated successfully', {
        planId: updatedPlan.id,
        title: updatedPlan.title,
        status: updatedPlan.status,
        updated: true,
        updatedFields
      });
    } catch (error: any) {
      return createErrorResponse(`Failed to update plan`, error.message);
    }
  }

  /**
   * Calculate risk level based on complexity analysis
   */
  private calculateRiskLevel(complexityAnalysis: ObjectiveComplexityAnalysis): 'low' | 'medium' | 'high' {
    if (complexityAnalysis.complexityLevel === 'complex' || complexityAnalysis.riskFactors.length > 3) {
      return 'high';
    } else if (complexityAnalysis.complexityLevel === 'moderate' || complexityAnalysis.riskFactors.length > 1) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Map task type to section type
   */
  private mapObjectiveTypeToSectionType(taskType: string): string {
    const typeMap: Record<string, string> = {
      'analysis': 'analysis',
      'setup': 'setup',
      'feature': 'backend',
      'bug_fix': 'maintenance',
      'refactor': 'maintenance',
      'documentation': 'documentation',
      'testing': 'testing',
      'deployment': 'devops',
      'optimization': 'performance',
      'maintenance': 'maintenance'
    };
    return typeMap[taskType] || 'other';
  }

  /**
   * Parse duration string to hours
   */
  private parseHours(duration: string | number): number {
    if (typeof duration === 'number') return duration;
    if (typeof duration !== 'string') return 2; // Default 2 hours
    const match = duration.match(/(\d+(?:\.\d+)?)\s*(hour|hr|h|day|d|week|w|minute|min|m)/i);
    if (!match) return 2; // Default 2 hours
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'minute': case 'min': case 'm': return Math.max(0.1, value / 60);
      case 'hour': case 'hr': case 'h': return value;
      case 'day': case 'd': return value * 8;
      case 'week': case 'w': return value * 40;
      default: return value;
    }
  }

  /**
   * Generate basic plan sections from objective - simplified to create task templates (FALLBACK)
   */
  private generateBasicPlanSections(objective: string): any[] {
    const now = new Date().toISOString();
    
    return [
      {
        id: ulid(),
        type: 'analysis',
        title: 'Analysis & Requirements',
        description: 'Analyze requirements and define specifications',
        agentResponsibility: 'analysis',
        estimatedHours: 4,
        priority: 1,
        prerequisites: [],
        objectiveTemplates: [
          {
            description: 'Analyze current system and requirements',
            objectiveType: 'analysis' as ObjectiveType,
            estimatedHours: 2
          },
          {
            description: 'Define technical specifications',
            objectiveType: 'analysis' as ObjectiveType,
            estimatedHours: 2
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      {
        id: ulid(),
        type: 'backend',
        title: 'Backend Implementation',
        description: 'Implement server-side functionality',
        agentResponsibility: 'backend',
        estimatedHours: 8,
        priority: 2,
        prerequisites: [],
        objectiveTemplates: [
          {
            description: 'Set up database schema',
            objectiveType: 'setup' as ObjectiveType,
            estimatedHours: 2
          },
          {
            description: 'Implement API endpoints',
            objectiveType: 'feature' as ObjectiveType,
            estimatedHours: 4
          },
          {
            description: 'Add business logic',
            objectiveType: 'feature' as ObjectiveType,
            estimatedHours: 2
          }
        ],
        createdAt: now,
        updatedAt: now
      },
      {
        id: ulid(),
        type: 'testing',
        title: 'Testing & Quality Assurance',
        description: 'Implement comprehensive testing',
        agentResponsibility: 'testing',
        estimatedHours: 6,
        priority: 3,
        prerequisites: [],
        objectiveTemplates: [
          {
            description: 'Write unit tests',
            objectiveType: 'testing' as ObjectiveType,
            estimatedHours: 3
          },
          {
            description: 'Create integration tests',
            objectiveType: 'testing' as ObjectiveType,
            estimatedHours: 2
          },
          {
            description: 'Perform end-to-end testing',
            objectiveType: 'testing' as ObjectiveType,
            estimatedHours: 1
          }
        ],
        createdAt: now,
        updatedAt: now
      }
    ];
  }
}