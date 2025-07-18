import { z } from 'zod';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { agentSessions } from './agents';

// Zod v4 schemas for validation
export const taskTypeSchema = z.enum([
  'feature',
  'bug_fix',
  'refactor',
  'documentation',
  'testing',
  'deployment',
  'analysis',
  'optimization',
  'setup',
  'maintenance'
]);

export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'blocked',
  'on_hold'
]);

export const dependencyTypeSchema = z.enum([
  'completion',
  'parallel',
  'resource',
  'data'
]);

export const taskRequirementsSchema = z.record(z.string(), z.unknown()).optional();
export const taskResultsSchema = z.record(z.string(), z.unknown()).optional();

// Drizzle table definitions
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  taskType: text('taskType', { enum: ['feature', 'bug_fix', 'refactor', 'documentation', 'testing', 'deployment', 'analysis', 'optimization', 'setup', 'maintenance'] }).notNull(),
  status: text('status', { enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked', 'on_hold'] }).notNull().default('pending'),
  assignedAgentId: text('assignedAgentId'),
  parentTaskId: text('parentTaskId'),
  priority: integer('priority').notNull().default(0),
  description: text('description').notNull(),
  requirements: text('requirements', { mode: 'json' }).$type<Record<string, unknown>>(),
  results: text('results', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updatedAt').notNull().default(sql`(current_timestamp)`),
});

export const taskDependencies = sqliteTable('task_dependencies', {
  taskId: text('taskId').notNull(),
  dependsOnTaskId: text('dependsOnTaskId').notNull(),
  dependencyType: text('dependencyType', { enum: ['completion', 'parallel', 'resource', 'data'] }).notNull().default('completion'),
});

// Drizzle relations
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  assignedAgent: one(agentSessions, {
    fields: [tasks.assignedAgentId],
    references: [agentSessions.id],
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
  }),
  subtasks: many(tasks),
  dependencies: many(taskDependencies, { relationName: 'taskDependencies' }),
  dependents: many(taskDependencies, { relationName: 'dependentTasks' }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: 'taskDependencies',
  }),
  dependsOnTask: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: 'dependentTasks',
  }),
}));

// Auto-generated schemas using drizzle-zod
export const insertTaskSchema = createInsertSchema(tasks, {
  repositoryPath: (schema) => schema.min(1),
  description: (schema) => schema.min(1).max(16384),
  priority: (schema) => schema.int().min(-100).max(100),
});

export const selectTaskSchema = createSelectSchema(tasks);
export const updateTaskSchema = createUpdateSchema(tasks);

export const insertTaskDependencySchema = createInsertSchema(taskDependencies);
export const selectTaskDependencySchema = createSelectSchema(taskDependencies);

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type Task = {
  id: string;
  repositoryPath: string;
  taskType: 'feature' | 'bug_fix' | 'refactor' | 'documentation' | 'testing' | 'deployment' | 'analysis' | 'optimization' | 'setup' | 'maintenance';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'on_hold';
  assignedAgentId?: string;
  parentTaskId?: string;
  priority: number;
  description: string;
  requirements?: Record<string, unknown>;
  results?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NewTask = Omit<Task, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type TaskUpdate = Partial<Omit<Task, 'id'>>;

export type TaskDependency = {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: 'completion' | 'parallel' | 'resource' | 'data';
};

export type NewTaskDependency = TaskDependency;

export type TaskType = z.infer<typeof taskTypeSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type DependencyType = z.infer<typeof dependencyTypeSchema>;

// Task filtering and search schemas
export const taskFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  status: taskStatusSchema.optional(),
  taskType: taskTypeSchema.optional(),
  assignedAgentId: z.string().optional(),
  parentTaskId: z.string().optional(),
  minPriority: z.number().int().optional(),
  maxPriority: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  unassignedOnly: z.boolean().optional(),
  rootTasksOnly: z.boolean().optional(),
});

export const taskCreateRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  taskType: taskTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(16384),
  priority: z.number().int().min(-100).max(100).default(0),
  requirements: taskRequirementsSchema,
  parentTaskId: z.string().min(1).optional(),
  dependencies: z.array(z.string().min(1)).optional(),
});

export type TaskFilter = z.infer<typeof taskFilterSchema>;
export type TaskCreateRequest = z.infer<typeof taskCreateRequestSchema>;