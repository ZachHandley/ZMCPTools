import { z } from 'zod';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { tasks } from './tasks';

// Zod v4 schemas for validation
export const planStatusSchema = z.enum([
  'draft',
  'approved',
  'in_progress',
  'completed',
  'cancelled',
  'on_hold'
]);

export const planPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical'
]);

export const sectionTypeSchema = z.enum([
  'backend',
  'frontend',
  'testing',
  'documentation',
  'devops',
  'analysis',
  'research',
  'setup',
  'maintenance',
  'security',
  'performance',
  'other'
]);

// Simplified plan section schema - templates for Task creation, no individual todos
export const planSectionSchema = z.object({
  id: z.string(),
  type: sectionTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2048),
  agentResponsibility: z.string().optional(), // Agent type responsible for this section
  estimatedHours: z.number().min(0).optional(),
  priority: z.number().int().min(1).max(10).default(5),
  prerequisites: z.array(z.string()).default([]), // Section IDs that must be completed first
  
  // Task templates instead of individual todos - these become Tasks when plan is executed
  taskTemplates: z.array(z.object({
    description: z.string().min(1).max(500),
    taskType: z.enum(['feature', 'bug_fix', 'refactor', 'documentation', 'testing', 'deployment', 'analysis', 'optimization', 'setup', 'maintenance']).optional(),
    estimatedHours: z.number().min(0).optional(),
    dependencies: z.array(z.string()).default([]) // Other section IDs this template depends on
  })).default([]),
  
  notes: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

// Simplified plan metadata - focus on high-level orchestration info
export const planMetadataSchema = z.object({
  estimatedTotalHours: z.number().min(0).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  dependencies: z.array(z.string()).default([]), // External dependencies
  technologies: z.array(z.string()).default([])
});

// Drizzle table definitions
export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('draft'),
  priority: text('priority').notNull().default('medium'),
  createdByAgent: text('createdByAgent'),
  assignedOrchestrationId: text('assignedOrchestrationId'),
  sections: text('sections', { mode: 'json' }).$type<z.infer<typeof planSectionSchema>[]>().notNull().default('[]'),
  metadata: text('metadata', { mode: 'json' }).$type<z.infer<typeof planMetadataSchema>>().default('{}'),
  objectives: text('objectives').notNull(), // Original objective that prompted the plan
  acceptanceCriteria: text('acceptanceCriteria'), // What defines success
  constraints: text('constraints'), // Limitations and constraints
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updatedAt').notNull().default(sql`(current_timestamp)`),
  startedAt: text('startedAt'),
  completedAt: text('completedAt')
});

// Removed planTasks table - Tasks will reference Plans directly in their requirements field

// Simplified relations - Plans don't need direct task relations since Tasks reference Plans
export const plansRelations = relations(plans, ({ }) => ({}));

// Auto-generated schemas using drizzle-zod
export const insertPlanSchema = createInsertSchema(plans, {
  repositoryPath: (schema) => schema.min(1),
  title: (schema) => schema.min(1).max(200),
  description: (schema) => schema.min(1).max(4096),
  objectives: (schema) => schema.min(1).max(4096),
});

export const selectPlanSchema = createSelectSchema(plans);
export const updatePlanSchema = createUpdateSchema(plans);

// Removed plan-task schemas since we no longer have a planTasks table

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type Plan = {
  id: string;
  repositoryPath: string;
  title: string;
  description: string;
  status: 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdByAgent?: string;
  assignedOrchestrationId?: string;
  sections: PlanSection[];
  metadata: PlanMetadata;
  objectives: string;
  acceptanceCriteria?: string;
  constraints?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type PlanSection = z.infer<typeof planSectionSchema>;
export type PlanMetadata = z.infer<typeof planMetadataSchema>;

export type NewPlan = Omit<Plan, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type PlanUpdate = Partial<Omit<Plan, 'id'>>;

// Removed PlanTask types - Plans generate Tasks directly without intermediate linking

export type PlanStatus = z.infer<typeof planStatusSchema>;
export type PlanPriority = z.infer<typeof planPrioritySchema>;
export type SectionType = z.infer<typeof sectionTypeSchema>;

// Plan filtering and search schemas
export const planFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  status: planStatusSchema.optional(),
  priority: planPrioritySchema.optional(),
  createdByAgent: z.string().optional(),
  assignedOrchestrationId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const planCreateRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4096),
  objectives: z.string().min(1).max(4096),
  acceptanceCriteria: z.string().optional(),
  constraints: z.string().optional(),
  priority: planPrioritySchema.default('medium'),
  createdByAgent: z.string().optional(),
  sections: z.array(planSectionSchema).optional().default([]),
  metadata: planMetadataSchema.optional().default({}),
});

export const planSectionUpdateSchema = z.object({
  planId: z.string().min(1),
  sectionId: z.string().min(1),
  updates: planSectionSchema.partial(),
});

export const planTodoUpdateSchema = z.object({
  planId: z.string().min(1),
  sectionId: z.string().min(1),
  todoId: z.string().min(1),
  completed: z.boolean().optional(),
  assignedTo: z.string().optional(),
  relatedTaskId: z.string().optional(),
  notes: z.string().optional(),
});

export type PlanFilter = z.infer<typeof planFilterSchema>;
export type PlanCreateRequest = z.infer<typeof planCreateRequestSchema>;
export type PlanSectionUpdate = z.infer<typeof planSectionUpdateSchema>;
export type PlanTodoUpdate = z.infer<typeof planTodoUpdateSchema>;