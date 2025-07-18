import { eq, and, or, isNull, desc, asc } from 'drizzle-orm';
import { BaseRepository, createRepositoryConfig } from './index.js';
import { DatabaseManager } from '../database/index.js';
import {
  plans,
  insertPlanSchema,
  selectPlanSchema,
  updatePlanSchema,
  type Plan,
  type NewPlan,
  type PlanUpdate,
  type PlanStatus,
  type PlanPriority,
  type PlanFilter,
  type PlanSection,
  type PlanSectionUpdate,
} from '../schemas/index.js';
import { ulid } from 'ulidx';

/**
 * Repository for managing plans with sections, todos, and task relationships
 */
export class PlanRepository extends BaseRepository<
  typeof plans,
  Plan,
  NewPlan,
  PlanUpdate
> {
  constructor(drizzleManager: DatabaseManager) {
    super(drizzleManager, createRepositoryConfig(
      plans,
      plans.id,
      insertPlanSchema,
      selectPlanSchema,
      updatePlanSchema,
      'plan-repository'
    ));
  }

  /**
   * Create a new plan with structured sections
   */
  async createPlan(planData: Omit<NewPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan> {
    try {
      const now = new Date().toISOString();
      const planId = ulid();
      
      const newPlan: NewPlan = {
        ...planData,
        id: planId,
        createdAt: now,
        updatedAt: now,
      };

      // Validate sections and assign IDs if needed
      const sectionsWithIds = newPlan.sections.map(section => ({
        ...section,
        id: section.id || ulid(),
        createdAt: section.createdAt || now,
        updatedAt: section.updatedAt || now,
        // Note: taskTemplates don't need IDs assigned - they're templates for creating Tasks
      }));

      newPlan.sections = sectionsWithIds;

      const validatedPlan = this.insertSchema.parse(newPlan);
      
      this.logger.debug('Creating new plan', { planId, title: planData.title });
      
      return await this.drizzleManager.transaction((tx) => {
        const result = tx
          .insert(this.table)
          .values(validatedPlan as any)
          .returning()
          .all();
        
        if (!result || result.length === 0) {
          throw new Error('Failed to create plan');
        }

        this.logger.info('Plan created successfully', { planId, title: planData.title });
        return result[0] as Plan;
      });
    } catch (error) {
      this.logger.error('Failed to create plan', { planData, error });
      throw error;
    }
  }

  /**
   * Find plans by repository path and optional filters
   */
  async findByRepositoryPath(
    repositoryPath: string, 
    options: {
      status?: PlanStatus;
      priority?: PlanPriority;
      createdByAgent?: string;
      assignedOrchestrationId?: string;
    } = {}
  ): Promise<Plan[]> {
    const conditions = [eq(plans.repositoryPath, repositoryPath)];
    
    if (options.status) {
      conditions.push(eq(plans.status, options.status));
    }
    
    if (options.priority) {
      conditions.push(eq(plans.priority, options.priority));
    }
    
    if (options.createdByAgent) {
      conditions.push(eq(plans.createdByAgent, options.createdByAgent));
    }
    
    if (options.assignedOrchestrationId) {
      conditions.push(eq(plans.assignedOrchestrationId, options.assignedOrchestrationId));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    return this.query()
      .where(whereClause)
      .orderBy([desc(plans.createdAt)])
      .execute();
  }

  /**
   * Update plan status
   */
  async updateStatus(planId: string, status: PlanStatus): Promise<Plan | null> {
    const updateData: PlanUpdate = {
      status,
      updatedAt: new Date().toISOString(),
    };

    // Set timestamps based on status
    if (status === 'in_progress' && !await this.hasStarted(planId)) {
      updateData.startedAt = new Date().toISOString();
    } else if (status === 'completed') {
      updateData.completedAt = new Date().toISOString();
    }

    return await this.update(planId, updateData);
  }

  /**
   * Check if plan has been started
   */
  private async hasStarted(planId: string): Promise<boolean> {
    const plan = await this.findById(planId);
    return plan?.startedAt !== undefined;
  }

  /**
   * Update a specific section in a plan
   */
  async updateSection(update: PlanSectionUpdate): Promise<Plan | null> {
    try {
      const plan = await this.findById(update.planId);
      if (!plan) {
        throw new Error(`Plan with id ${update.planId} not found`);
      }

      const sectionIndex = plan.sections.findIndex(s => s.id === update.sectionId);
      if (sectionIndex === -1) {
        throw new Error(`Section with id ${update.sectionId} not found in plan ${update.planId}`);
      }

      // Update the section
      const updatedSections = [...plan.sections];
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        ...update.updates,
        updatedAt: new Date().toISOString(),
      };

      return await this.update(update.planId, {
        sections: updatedSections,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to update plan section', { update, error });
      throw error;
    }
  }


  /**
   * Add a new section to a plan
   */
  async addSection(planId: string, section: Omit<PlanSection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan | null> {
    try {
      const plan = await this.findById(planId);
      if (!plan) {
        throw new Error(`Plan with id ${planId} not found`);
      }

      const now = new Date().toISOString();
      const newSection: PlanSection = {
        ...section,
        id: ulid(),
        createdAt: now,
        updatedAt: now,
        // Note: taskTemplates don't need ID assignment - they're templates for creating Tasks
      };

      const updatedSections = [...plan.sections, newSection];

      return await this.update(planId, {
        sections: updatedSections,
        updatedAt: now,
      });
    } catch (error) {
      this.logger.error('Failed to add section to plan', { planId, section, error });
      throw error;
    }
  }






  /**
   * Advanced filtering with complex conditions
   */
  async findFiltered(filter: PlanFilter): Promise<{
    plans: Plan[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions = [];

    if (filter.repositoryPath) {
      conditions.push(eq(plans.repositoryPath, filter.repositoryPath));
    }

    if (filter.status) {
      conditions.push(eq(plans.status, filter.status));
    }

    if (filter.priority) {
      conditions.push(eq(plans.priority, filter.priority));
    }

    if (filter.createdByAgent) {
      conditions.push(eq(plans.createdByAgent, filter.createdByAgent));
    }

    if (filter.assignedOrchestrationId) {
      conditions.push(eq(plans.assignedOrchestrationId, filter.assignedOrchestrationId));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions.length === 1 ? conditions[0] : undefined;

    const result = await this.list({
      where: whereClause,
      orderBy: [desc(plans.createdAt)],
      limit: filter.limit,
      offset: filter.offset,
    });

    return {
      plans: result.data,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get plans that should be automatically started (approved plans)
   */
  async getPlansReadyForExecution(repositoryPath: string): Promise<Plan[]> {
    return this.query()
      .where(and(
        eq(plans.repositoryPath, repositoryPath),
        eq(plans.status, 'approved')
      ))
      .orderBy([desc(plans.priority), asc(plans.createdAt)])
      .execute();
  }
}