import { DatabaseManager } from '../database/index.js';
import { ObjectiveRepository } from '../repositories/ObjectiveRepository.js';
import { AgentRepository } from '../repositories/AgentRepository.js';
import { MemoryRepository } from '../repositories/MemoryRepository.js';
import { PathUtils } from '../utils/pathUtils.js';
import { Logger } from '../utils/logger.js';
import { eventBus } from './EventBus.js';
import type { Objective, NewObjective, ObjectiveUpdate, ObjectiveStatus, ObjectiveType, AgentStatus } from '../schemas/index.js';
import { randomUUID } from 'crypto';

export interface CreateObjectiveRequest {
  repositoryPath: string;
  objectiveType: ObjectiveType;
  description: string;
  requirements?: Record<string, any>;
  parentObjectiveId?: string;
  priority?: number;
  assignedAgentId?: string;
  estimatedDuration?: number;
  tags?: string[];
}

export interface ObjectiveServiceUpdate {
  status?: ObjectiveStatus;
  results?: Record<string, any>;
  requirements?: Record<string, any>;
  progressPercentage?: number;
  notes?: string;
}

export interface ObjectiveExecutionPlan {
  objectives: Objective[];
  executionOrder: string[];
  dependencies: Map<string, string[]>;
  criticalPath: string[];
  estimatedDuration: number;
  riskAssessment: ObjectiveRiskAssessment;
}

export interface ObjectiveRiskAssessment {
  highRiskObjectives: string[];
  potentialBottlenecks: string[];
  mitigationStrategies: string[];
  confidenceLevel: number;
}

/**
 * Simplified ObjectiveService
 * Provides essential objective management functionality without over-engineering
 */
export class ObjectiveService {
  private logger: Logger;
  private objectiveRepo: ObjectiveRepository;
  private agentRepo: AgentRepository;
  private memoryRepo: MemoryRepository;

  constructor(private db: DatabaseManager) {
    this.logger = new Logger('objective-service');
    this.objectiveRepo = new ObjectiveRepository(db);
    this.agentRepo = new AgentRepository(db);
    this.memoryRepo = new MemoryRepository(db);
  }

  /**
   * Create a new objective
   */
  async createObjective(request: CreateObjectiveRequest): Promise<Objective> {
    try {
      const normalizedPath = request.repositoryPath;
      
      const objectiveData: NewObjective = {
        id: randomUUID(),
        repositoryPath: normalizedPath,
        objectiveType: request.objectiveType,
        description: request.description,
        requirements: request.requirements || {},
        parentObjectiveId: request.parentObjectiveId,
        priority: request.priority || 1,
        assignedAgentId: request.assignedAgentId,
        status: 'pending'
      };

      const objective = await this.objectiveRepo.create(objectiveData);
      
      // Create memory entry
      await this.memoryRepo.create({
        id: randomUUID(),
        repositoryPath: objective.repositoryPath,
        agentId: 'system',
        memoryType: 'progress',
        title: `Objective Created: ${objective.description.substring(0, 50)}...`,
        content: `Objective created: ${objective.description}`,
        tags: ['objective-creation', objective.objectiveType, 'system'],
        confidence: 0.9,
        relevanceScore: 1.0,
        miscData: {
          objectiveId: objective.id,
          objectiveType: objective.objectiveType,
          priority: objective.priority,
          action: 'created'
        }
      });

      // Emit objective created event
      await eventBus.emit('objective_created', {
        objective,
        timestamp: new Date(),
        repositoryPath: objective.repositoryPath
      });

      this.logger.info('Objective created successfully', { objectiveId: objective.id, objectiveType: objective.objectiveType });
      return objective;
    } catch (error) {
      this.logger.error('Failed to create objective', { error, request });
      throw error;
    }
  }

  /**
   * Update objective status and progress
   */
  async updateObjective(objectiveId: string, update: ObjectiveServiceUpdate): Promise<Objective> {
    try {
      const objective = await this.objectiveRepo.findById(objectiveId);
      if (!objective) {
        throw new Error(`Objective not found: ${objectiveId}`);
      }

      const updatedObjective = await this.objectiveRepo.update(objectiveId, update);
      
      // Emit objective update event
      await eventBus.emit('objective_update', {
        objectiveId: objective.id,
        previousStatus: objective.status,
        newStatus: updatedObjective.status,
        assignedAgentId: objective.assignedAgentId || undefined,
        progressPercentage: update.progressPercentage,
        timestamp: new Date(),
        repositoryPath: objective.repositoryPath,
        metadata: {
          update,
          source: 'objective_service'
        }
      });
      
      // Create memory entry for update
      await this.memoryRepo.create({
        id: randomUUID(),
        repositoryPath: objective.repositoryPath,
        agentId: objective.assignedAgentId || 'system',
        memoryType: 'progress',
        title: `Objective Updated: ${objective.description.substring(0, 50)}...`,
        content: `Objective updated: ${JSON.stringify(update)}`,
        tags: ['objective-update', objective.objectiveType, objective.status],
        confidence: 0.8,
        relevanceScore: 1.0,
        miscData: {
          objectiveId: objective.id,
          statusChange: `${objective.status} -> ${update.status || objective.status}`,
          progressPercentage: update.progressPercentage || 0,
          action: 'updated'
        }
      });

      this.logger.info('Objective updated successfully', { objectiveId, update });
      return updatedObjective;
    } catch (error) {
      this.logger.error('Failed to update objective', { error, objectiveId, update });
      throw error;
    }
  }

  /**
   * Get objective by ID
   */
  async getObjective(objectiveId: string): Promise<Objective | null> {
    return await this.objectiveRepo.findById(objectiveId);
  }

  /**
   * Get objectives by repository
   */
  async getObjectivesByRepository(repositoryPath: string, options: {
    status?: ObjectiveStatus;
    objectiveType?: ObjectiveType;
    assignedAgentId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Objective[]> {
    return await this.objectiveRepo.findByRepositoryPath(repositoryPath, options);
  }

  /**
   * Get objectives by agent
   */
  async getObjectivesByAgent(agentId: string, options: {
    status?: ObjectiveStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<Objective[]> {
    return await this.objectiveRepo.findByField('assignedAgentId', agentId);
  }

  /**
   * Create a basic execution plan
   */
  async createExecutionPlan(objectiveIds: string[]): Promise<ObjectiveExecutionPlan> {
    try {
      const objectives = await Promise.all(objectiveIds.map(id => this.objectiveRepo.findById(id)));
      const validObjectives = objectives.filter(t => t !== null) as Objective[];
      
      // Simple execution order (by priority, then creation date)
      const executionOrder = validObjectives
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(t => t.id);

      // Basic dependencies map
      const dependencies = new Map<string, string[]>();
      validObjectives.forEach(objective => {
        if (objective.parentObjectiveId) {
          dependencies.set(objective.id, [objective.parentObjectiveId]);
        }
      });

      return {
        objectives: validObjectives,
        executionOrder,
        dependencies,
        criticalPath: executionOrder, // Simplified
        estimatedDuration: validObjectives.length * 30, // Simple estimate: 30 minutes per objective
        riskAssessment: {
          highRiskObjectives: [],
          potentialBottlenecks: [],
          mitigationStrategies: [],
          confidenceLevel: 0.8
        }
      };
    } catch (error) {
      this.logger.error('Failed to create execution plan', { error, objectiveIds });
      throw error;
    }
  }

  /**
   * Assign objective to agent
   */
  async assignObjective(objectiveId: string, agentId: string): Promise<Objective> {
    try {
      const objective = await this.objectiveRepo.findById(objectiveId);
      if (!objective) {
        throw new Error(`Objective not found: ${objectiveId}`);
      }

      const agent = await this.agentRepo.findById(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const updatedObjective = await this.objectiveRepo.update(objectiveId, {
        assignedAgentId: agentId,
        status: 'in_progress'
      });

      this.logger.info('Objective assigned successfully', { objectiveId, agentId });
      return updatedObjective;
    } catch (error) {
      this.logger.error('Failed to assign objective', { error, objectiveId, agentId });
      throw error;
    }
  }

  /**
   * Mark objective as completed
   */
  async completeObjective(objectiveId: string, results?: Record<string, any>): Promise<Objective> {
    try {
      const objective = await this.objectiveRepo.findById(objectiveId);
      if (!objective) {
        throw new Error(`Objective not found: ${objectiveId}`);
      }

      const updatedObjective = await this.objectiveRepo.update(objectiveId, {
        status: 'completed',
        results: results || {}
      });

      // Emit objective completed event
      await eventBus.emit('objective_completed', {
        objectiveId: objective.id,
        completedBy: objective.assignedAgentId || undefined,
        results: results || {},
        timestamp: new Date(),
        repositoryPath: objective.repositoryPath
      });

      // Create completion memory
      await this.memoryRepo.create({
        id: randomUUID(),
        repositoryPath: objective.repositoryPath,
        agentId: objective.assignedAgentId || 'system',
        memoryType: 'insight',
        title: `Objective Completed: ${objective.description.substring(0, 50)}...`,
        content: `Objective completed successfully. Results: ${JSON.stringify(results || {})}`,
        tags: ['objective-completion', objective.objectiveType, 'success'],
        confidence: 0.9,
        relevanceScore: 1.0,
        miscData: {
          objectiveId: objective.id,
          completionInsights: results || {},
          action: 'completed'
        }
      });

      this.logger.info('Objective completed successfully', { objectiveId });
      return updatedObjective;
    } catch (error) {
      this.logger.error('Failed to complete objective', { error, objectiveId });
      throw error;
    }
  }

  /**
   * Get objective statistics
   */
  async getObjectiveStats(repositoryPath: string): Promise<{
    total: number;
    byStatus: Record<ObjectiveStatus, number>;
    byType: Record<ObjectiveType, number>;
    completionRate: number;
  }> {
    try {
      const objectives = await this.objectiveRepo.findByRepositoryPath(repositoryPath);

      const byStatus = objectives.reduce((acc, objective) => {
        acc[objective.status] = (acc[objective.status] || 0) + 1;
        return acc;
      }, {} as Record<ObjectiveStatus, number>);

      const byType = objectives.reduce((acc, objective) => {
        acc[objective.objectiveType] = (acc[objective.objectiveType] || 0) + 1;
        return acc;
      }, {} as Record<ObjectiveType, number>);

      const completedObjectives = objectives.filter(t => t.status === 'completed').length;
      const completionRate = objectives.length > 0 ? (completedObjectives / objectives.length) * 100 : 0;

      return {
        total: objectives.length,
        byStatus,
        byType,
        completionRate
      };
    } catch (error) {
      this.logger.error('Failed to get objective stats', { error, repositoryPath });
      throw error;
    }
  }

  /**
   * Delete objective
   */
  async deleteObjective(objectiveId: string): Promise<void> {
    try {
      const objective = await this.objectiveRepo.findById(objectiveId);
      if (!objective) {
        throw new Error(`Objective not found: ${objectiveId}`);
      }

      await this.objectiveRepo.delete(objectiveId);
      this.logger.info('Objective deleted successfully', { objectiveId });
    } catch (error) {
      this.logger.error('Failed to delete objective', { error, objectiveId });
      throw error;
    }
  }

  /**
   * List objectives (alias for CLI compatibility)
   */
  async listObjectives(repositoryPath: string, options: {
    status?: ObjectiveStatus;
    objectiveType?: ObjectiveType;
    assignedAgentId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Objective[]> {
    return await this.getObjectivesByRepository(repositoryPath, options);
  }

  /**
   * Add objective dependency
   */
  async addObjectiveDependency(objectiveId: string, dependsOnObjectiveId: string): Promise<void> {
    try {
      const objective = await this.objectiveRepo.findById(objectiveId);
      if (!objective) {
        throw new Error(`Objective not found: ${objectiveId}`);
      }

      const dependsOnObjective = await this.objectiveRepo.findById(dependsOnObjectiveId);
      if (!dependsOnObjective) {
        throw new Error(`Dependency objective not found: ${dependsOnObjectiveId}`);
      }

      // For now, store dependencies in the requirements field
      const requirements = objective.requirements || {};
      const dependencies = (requirements.dependencies as string[]) || [];
      if (!dependencies.includes(dependsOnObjectiveId)) {
        dependencies.push(dependsOnObjectiveId);
        requirements.dependencies = dependencies;
        
        await this.objectiveRepo.update(objectiveId, { requirements });
      }

      this.logger.info('Objective dependency added successfully', { objectiveId, dependsOnObjectiveId });
    } catch (error) {
      this.logger.error('Failed to add objective dependency', { error, objectiveId, dependsOnObjectiveId });
      throw error;
    }
  }

  /**
   * Get objective analytics
   */
  async getObjectiveAnalytics(repositoryPath: string): Promise<{
    totalObjectives: number;
    completedObjectives: number;
    pendingObjectives: number;
    inProgressObjectives: number;
    completionRate: number;
    averageCompletionTime: number;
    objectivesByType: Record<ObjectiveType, number>;
    objectivesByPriority: Record<number, number>;
  }> {
    try {
      const objectives = await this.objectiveRepo.findByRepositoryPath(repositoryPath);
      
      const totalObjectives = objectives.length;
      const completedObjectives = objectives.filter(t => t.status === 'completed').length;
      const pendingObjectives = objectives.filter(t => t.status === 'pending').length;
      const inProgressObjectives = objectives.filter(t => t.status === 'in_progress').length;
      const completionRate = totalObjectives > 0 ? (completedObjectives / totalObjectives) * 100 : 0;

      const objectivesByType = objectives.reduce((acc, objective) => {
        acc[objective.objectiveType] = (acc[objective.objectiveType] || 0) + 1;
        return acc;
      }, {} as Record<ObjectiveType, number>);

      const objectivesByPriority = objectives.reduce((acc, objective) => {
        const priority = objective.priority || 1;
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      // Simple average completion time calculation (mock for now)
      const averageCompletionTime = 45; // minutes

      return {
        totalObjectives,
        completedObjectives,
        pendingObjectives,
        inProgressObjectives,
        completionRate,
        averageCompletionTime,
        objectivesByType,
        objectivesByPriority
      };
    } catch (error) {
      this.logger.error('Failed to get objective analytics', { error, repositoryPath });
      throw error;
    }
  }

  /**
   * Get objective hierarchy
   */
  async getObjectiveHierarchy(repositoryPath: string): Promise<{
    rootObjectives: Objective[];
    objectiveTree: Record<string, Objective[]>;
    orphanObjectives: Objective[];
  }> {
    try {
      const objectives = await this.objectiveRepo.findByRepositoryPath(repositoryPath);
      
      const rootObjectives = objectives.filter(t => !t.parentObjectiveId);
      const objectiveTree: Record<string, Objective[]> = {};
      
      // Build objective tree
      objectives.forEach(objective => {
        if (objective.parentObjectiveId) {
          if (!objectiveTree[objective.parentObjectiveId]) {
            objectiveTree[objective.parentObjectiveId] = [];
          }
          objectiveTree[objective.parentObjectiveId].push(objective);
        }
      });

      // Find orphan objectives (objectives with parent that doesn't exist)
      const orphanObjectives = objectives.filter(objective => {
        if (!objective.parentObjectiveId) return false;
        return !objectives.some(t => t.id === objective.parentObjectiveId);
      });

      return {
        rootObjectives,
        objectiveTree,
        orphanObjectives
      };
    } catch (error) {
      this.logger.error('Failed to get objective hierarchy', { error, repositoryPath });
      throw error;
    }
  }

  /**
   * Break down objective into subobjectives
   */
  async breakdownObjective(objectiveId: string, subobjectives: Array<{
    description: string;
    objectiveType: ObjectiveType;
    priority?: number;
    estimatedDuration?: number;
  }>): Promise<Objective[]> {
    try {
      const parentObjective = await this.objectiveRepo.findById(objectiveId);
      if (!parentObjective) {
        throw new Error(`Objective not found: ${objectiveId}`);
      }

      const createdSubobjectives: Objective[] = [];
      for (const subobjective of subobjectives) {
        const newObjective = await this.createObjective({
          repositoryPath: parentObjective.repositoryPath,
          objectiveType: subobjective.objectiveType,
          description: subobjective.description,
          parentObjectiveId: objectiveId,
          priority: subobjective.priority || parentObjective.priority,
          estimatedDuration: subobjective.estimatedDuration
        });
        createdSubobjectives.push(newObjective);
      }

      this.logger.info('Objective broken down successfully', { objectiveId, subobjectiveCount: subobjectives.length });
      return createdSubobjectives;
    } catch (error) {
      this.logger.error('Failed to break down objective', { error, objectiveId });
      throw error;
    }
  }

  /**
   * Auto-assign objectives to agents
   */
  async autoAssignObjectives(repositoryPath: string, agentId: string, objectiveTypes?: ObjectiveType[]): Promise<Objective[]> {
    try {
      const filters: any = { status: 'pending' };
      if (objectiveTypes && objectiveTypes.length > 0) {
        // For now, just use the first objective type
        filters.objectiveType = objectiveTypes[0];
      }

      const availableObjectives = await this.objectiveRepo.findByRepositoryPath(repositoryPath, filters);
      
      // Simple auto-assignment: assign up to 3 objectives
      const objectivesToAssign = availableObjectives.slice(0, 3);
      const assignedObjectives: Objective[] = [];

      for (const objective of objectivesToAssign) {
        const assignedObjective = await this.assignObjective(objective.id, agentId);
        assignedObjectives.push(assignedObjective);
      }

      this.logger.info('Objectives auto-assigned successfully', { 
        agentId, 
        assignedCount: assignedObjectives.length,
        objectiveTypes 
      });
      return assignedObjectives;
    } catch (error) {
      this.logger.error('Failed to auto-assign objectives', { error, repositoryPath, agentId });
      throw error;
    }
  }

  /**
   * Get pending objectives
   */
  async getPendingObjectives(repositoryPath: string, options: {
    objectiveType?: ObjectiveType;
    priority?: number;
    limit?: number;
  } = {}): Promise<Objective[]> {
    const filters: any = {
      status: 'pending' as ObjectiveStatus,
      objectiveType: options.objectiveType
    };
    
    const objectives = await this.objectiveRepo.findByRepositoryPath(repositoryPath, filters);
    
    // Apply limit manually since the repository doesn't support it
    if (options.limit) {
      return objectives.slice(0, options.limit);
    }
    
    return objectives;
  }
}