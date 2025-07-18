import { eq, and, or, isNull, isNotNull, desc } from 'drizzle-orm';
import { BaseRepository, createRepositoryConfig } from './index.js';
import { DatabaseManager } from '../database/index.js';
import {
  objectives,
  objectiveDependencies,
  insertObjectiveSchema,
  selectObjectiveSchema,
  updateObjectiveSchema,
  insertObjectiveDependencySchema,
  selectObjectiveDependencySchema,
  type Objective,
  type NewObjective,
  type ObjectiveUpdate,
  type ObjectiveDependency,
  type NewObjectiveDependency,
  type ObjectiveStatus,
  type ObjectiveType,
  type ObjectiveFilter,
} from '../schemas/index.js';

/**
 * Repository for managing objectives with dependency tracking
 */
export class ObjectiveRepository extends BaseRepository<
  typeof objectives,
  Objective,
  NewObjective,
  ObjectiveUpdate
> {
  constructor(drizzleManager: DatabaseManager) {
    super(drizzleManager, createRepositoryConfig(
      objectives,
      objectives.id,
      insertObjectiveSchema,
      selectObjectiveSchema,
      updateObjectiveSchema,
      'objective-repository'
    ));
  }

  /**
   * Find objectives by repository path and optional filters
   */
  async findByRepositoryPath(
    repositoryPath: string, 
    options: {
      status?: ObjectiveStatus;
      objectiveType?: ObjectiveType;
      assignedAgentId?: string;
      includeSubobjectives?: boolean;
    } = {}
  ): Promise<Objective[]> {
    const conditions = [eq(objectives.repositoryPath, repositoryPath)];
    
    if (options.status) {
      conditions.push(eq(objectives.status, options.status));
    }
    
    if (options.objectiveType) {
      conditions.push(eq(objectives.objectiveType, options.objectiveType));
    }
    
    if (options.assignedAgentId) {
      conditions.push(eq(objectives.assignedAgentId, options.assignedAgentId));
    }
    
    if (!options.includeSubobjectives) {
      conditions.push(isNull(objectives.parentObjectiveId));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    return this.query()
      .where(whereClause)
      .orderBy(objectives.priority, 'desc')
      .execute();
  }

  /**
   * Find subobjectives for a parent objective
   */
  async findSubobjectives(parentObjectiveId: string): Promise<Objective[]> {
    return this.query()
      .where(eq(objectives.parentObjectiveId, parentObjectiveId))
      .orderBy(objectives.priority, 'desc')
      .execute();
  }

  /**
   * Find root objectives (objectives without parent)
   */
  async findRootObjectives(repositoryPath: string, status?: ObjectiveStatus): Promise<Objective[]> {
    const conditions = [
      eq(objectives.repositoryPath, repositoryPath),
      isNull(objectives.parentObjectiveId)
    ];
    
    if (status) {
      conditions.push(eq(objectives.status, status));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    return this.query()
      .where(whereClause)
      .orderBy(objectives.priority, 'desc')
      .execute();
  }

  /**
   * Find objectives assigned to an agent
   */
  async findByAssignedAgent(agentId: string, status?: ObjectiveStatus): Promise<Objective[]> {
    const conditions = [eq(objectives.assignedAgentId, agentId)];
    
    if (status) {
      conditions.push(eq(objectives.status, status));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    return this.query()
      .where(whereClause)
      .orderBy(objectives.priority, 'desc')
      .execute();
  }

  /**
   * Find unassigned objectives that are ready to be executed
   */
  async findAvailableObjectives(repositoryPath: string): Promise<Objective[]> {
    // Objectives that are pending, unassigned, and have no unfulfilled dependencies
    const pendingObjectives = await this.query()
      .where(and(
        eq(objectives.repositoryPath, repositoryPath),
        eq(objectives.status, 'pending'),
        isNull(objectives.assignedAgentId)
      ))
      .execute();

    // Filter out objectives that have unresolved dependencies
    const availableObjectives: Objective[] = [];
    
    for (const objective of pendingObjectives) {
      const hasUnresolvedDeps = await this.hasUnresolvedDependencies(objective.id);
      if (!hasUnresolvedDeps) {
        availableObjectives.push(objective);
      }
    }

    return availableObjectives.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if an objective has unresolved dependencies
   */
  async hasUnresolvedDependencies(objectiveId: string): Promise<boolean> {
    const dependencies = await this.drizzle
      .select({
        dependsOnObjectiveId: objectiveDependencies.dependsOnObjectiveId,
        status: objectives.status,
      })
      .from(objectiveDependencies)
      .innerJoin(objectives, eq(objectiveDependencies.dependsOnObjectiveId, objectives.id))
      .where(eq(objectiveDependencies.objectiveId, objectiveId));

    return dependencies.some(dep => dep.status !== 'completed');
  }

  /**
   * Add dependency between objectives
   */
  async addDependency(dependency: NewObjectiveDependency): Promise<ObjectiveDependency> {
    try {
      // Validate input
      const validatedDependency = insertObjectiveDependencySchema.parse(dependency);
      
      // Check for circular dependencies
      const wouldCreateCycle = await this.wouldCreateCircularDependency(
        validatedDependency.objectiveId, 
        validatedDependency.dependsOnObjectiveId
      );
      
      if (wouldCreateCycle) {
        throw new Error('Adding this dependency would create a circular dependency');
      }

      this.logger.debug('Adding objective dependency', dependency);
      
      return await this.drizzleManager.transaction((tx) => {
        const result = tx
          .insert(objectiveDependencies)
          .values(validatedDependency as any)
          .returning()
          .all();
        
        if (!result || result.length === 0) {
          throw new Error('Failed to create objective dependency');
        }

        this.logger.info('Objective dependency added successfully', dependency);
        return result[0] as ObjectiveDependency;
      });
    } catch (error) {
      this.logger.error('Failed to add objective dependency', { dependency, error });
      throw error;
    }
  }

  /**
   * Remove dependency between objectives
   */
  async removeDependency(objectiveId: string, dependsOnObjectiveId: string): Promise<boolean> {
    try {
      const result = await this.drizzle
        .delete(objectiveDependencies)
        .where(and(
          eq(objectiveDependencies.objectiveId, objectiveId),
          eq(objectiveDependencies.dependsOnObjectiveId, dependsOnObjectiveId)
        ));

      const removed = result.changes > 0;
      
      if (removed) {
        this.logger.info('Objective dependency removed successfully', { objectiveId, dependsOnObjectiveId });
      }
      
      return removed;
    } catch (error) {
      this.logger.error('Failed to remove objective dependency', { objectiveId, dependsOnObjectiveId, error });
      throw error;
    }
  }

  /**
   * Get all dependencies for an objective
   */
  async getDependencies(objectiveId: string): Promise<Objective[]> {
    const dependencyObjectives = await this.drizzle
      .select()
      .from(objectives)
      .innerJoin(objectiveDependencies, eq(objectives.id, objectiveDependencies.dependsOnObjectiveId))
      .where(eq(objectiveDependencies.objectiveId, objectiveId));

    return dependencyObjectives.map(row => row.objectives) as Objective[];
  }

  /**
   * Get all objectives that depend on this objective
   */
  async getDependents(objectiveId: string): Promise<Objective[]> {
    const dependentObjectives = await this.drizzle
      .select()
      .from(objectives)
      .innerJoin(objectiveDependencies, eq(objectives.id, objectiveDependencies.objectiveId))
      .where(eq(objectiveDependencies.dependsOnObjectiveId, objectiveId));

    return dependentObjectives.map(row => row.objectives) as Objective[];
  }

  /**
   * Check if adding a dependency would create a circular reference
   */
  private async wouldCreateCircularDependency(objectiveId: string, dependsOnObjectiveId: string): Promise<boolean> {
    // If the objective depends on itself, that's obviously circular
    if (objectiveId === dependsOnObjectiveId) {
      return true;
    }

    // Check if dependsOnObjectiveId (transitively) depends on objectiveId
    const visited = new Set<string>();
    const stack = [dependsOnObjectiveId];

    while (stack.length > 0) {
      const currentObjectiveId = stack.pop()!;
      
      if (visited.has(currentObjectiveId)) {
        continue;
      }
      
      visited.add(currentObjectiveId);
      
      // If we reach the original objectiveId, we have a cycle
      if (currentObjectiveId === objectiveId) {
        return true;
      }

      // Get all objectives that currentObjectiveId depends on
      const dependencies = await this.drizzle
        .select({ dependsOnObjectiveId: objectiveDependencies.dependsOnObjectiveId })
        .from(objectiveDependencies)
        .where(eq(objectiveDependencies.objectiveId, currentObjectiveId));

      // Add them to the stack for further exploration
      for (const dep of dependencies) {
        if (!visited.has(dep.dependsOnObjectiveId)) {
          stack.push(dep.dependsOnObjectiveId);
        }
      }
    }

    return false;
  }

  /**
   * Update objective status and handle dependent objectives
   */
  async updateStatus(objectiveId: string, status: ObjectiveStatus, results?: Record<string, unknown> | string): Promise<Objective | null> {
    return await this.drizzleManager.transaction((tx) => {
      // Update the objective status using the transaction
      const updateData: ObjectiveUpdate = {
        status,
        updatedAt: new Date().toISOString(),
      };
      
      if (results) {
        updateData.results = typeof results === 'string' ? { message: results } : results;
      }

      // Perform update within transaction
      const result = tx
        .update(objectives)
        .set(updateData as any)
        .where(eq(objectives.id, objectiveId))
        .returning()
        .all();

      if (!result || result.length === 0) {
        throw new Error(`Objective with id ${objectiveId} not found for status update`);
      }

      const updatedObjective = result[0] as Objective;

      // If objective is completed, check dependent objectives within the same transaction
      if (status === 'completed') {
        // Note: We don't call async methods within the sync transaction
        // This will be handled by a separate process or event
        this.logger.info('Objective completed, dependent objectives will be checked', { objectiveId });
      }

      return updatedObjective;
    });
  }

  /**
   * Check if dependent objectives can be started after an objective completion
   */
  private async checkAndStartDependentObjectives(completedObjectiveId: string): Promise<void> {
    const dependentObjectives = await this.getDependents(completedObjectiveId);
    
    for (const dependentObjective of dependentObjectives) {
      if (dependentObjective.status === 'pending') {
        const hasUnresolvedDeps = await this.hasUnresolvedDependencies(dependentObjective.id);
        
        if (!hasUnresolvedDeps) {
          this.logger.info('Objective dependencies resolved, objective ready for assignment', {
            objectiveId: dependentObjective.id,
            completedDependency: completedObjectiveId
          });
          
          // Optionally auto-assign to available agents or notify orchestrator
          // This depends on your specific workflow requirements
        }
      }
    }
  }

  /**
   * Get objective hierarchy (objective with all its subobjectives)
   */
  async getObjectiveHierarchy(objectiveId: string): Promise<{
    objective: Objective;
    subobjectives: Objective[];
    dependencies: Objective[];
    dependents: Objective[];
  } | null> {
    const objective = await this.findById(objectiveId);
    if (!objective) {
      return null;
    }

    const [subobjectives, dependencies, dependents] = await Promise.all([
      this.findSubobjectives(objectiveId),
      this.getDependencies(objectiveId),
      this.getDependents(objectiveId)
    ]);

    return {
      objective,
      subobjectives,
      dependencies,
      dependents,
    };
  }

  /**
   * Advanced filtering with complex conditions
   */
  async findFiltered(filter: ObjectiveFilter): Promise<{
    objectives: Objective[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions = [];

    if (filter.repositoryPath) {
      conditions.push(eq(objectives.repositoryPath, filter.repositoryPath));
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        conditions.push(or(...filter.status.map(s => eq(objectives.status, s))));
      } else {
        conditions.push(eq(objectives.status, filter.status));
      }
    }

    if (filter.objectiveType) {
      conditions.push(eq(objectives.objectiveType, filter.objectiveType));
    }

    if (filter.assignedAgentId) {
      conditions.push(eq(objectives.assignedAgentId, filter.assignedAgentId));
    }

    if (filter.unassignedOnly) {
      conditions.push(isNull(objectives.assignedAgentId));
    }

    if (filter.rootObjectivesOnly) {
      conditions.push(isNull(objectives.parentObjectiveId));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions.length === 1 ? conditions[0] : undefined;

    const result = await this.list({
      where: whereClause,
      orderBy: [desc(objectives.priority), objectives.createdAt],
      limit: filter.limit,
      offset: filter.offset,
    });

    return {
      objectives: result.data,
      total: result.total,
      hasMore: result.hasMore,
    };
  }
}