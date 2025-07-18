import { z } from 'zod';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { agentSessions } from './agents';

// Zod v4 schemas for validation
export const objectiveTypeSchema = z.enum([
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

export const objectiveStatusSchema = z.enum([
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

export const objectiveRequirementsSchema = z.record(z.string(), z.unknown()).optional();
export const objectiveResultsSchema = z.record(z.string(), z.unknown()).optional();

// Drizzle table definitions
export const objectives = sqliteTable('objectives', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  objectiveType: text('objectiveType', { enum: ['feature', 'bug_fix', 'refactor', 'documentation', 'testing', 'deployment', 'analysis', 'optimization', 'setup', 'maintenance'] }).notNull(),
  status: text('status', { enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked', 'on_hold'] }).notNull().default('pending'),
  assignedAgentId: text('assignedAgentId'),
  parentObjectiveId: text('parentObjectiveId'),
  priority: integer('priority').notNull().default(0),
  description: text('description').notNull(),
  requirements: text('requirements', { mode: 'json' }).$type<Record<string, unknown>>(),
  results: text('results', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updatedAt').notNull().default(sql`(current_timestamp)`),
});

export const objectiveDependencies = sqliteTable('objective_dependencies', {
  objectiveId: text('objectiveId').notNull(),
  dependsOnObjectiveId: text('dependsOnObjectiveId').notNull(),
  dependencyType: text('dependencyType', { enum: ['completion', 'parallel', 'resource', 'data'] }).notNull().default('completion'),
});

// Drizzle relations
export const objectivesRelations = relations(objectives, ({ one, many }) => ({
  assignedAgent: one(agentSessions, {
    fields: [objectives.assignedAgentId],
    references: [agentSessions.id],
  }),
  parentObjective: one(objectives, {
    fields: [objectives.parentObjectiveId],
    references: [objectives.id],
  }),
  subobjectives: many(objectives),
  dependencies: many(objectiveDependencies, { relationName: 'objectiveDependencies' }),
  dependents: many(objectiveDependencies, { relationName: 'dependentObjectives' }),
}));

export const objectiveDependenciesRelations = relations(objectiveDependencies, ({ one }) => ({
  objective: one(objectives, {
    fields: [objectiveDependencies.objectiveId],
    references: [objectives.id],
    relationName: 'objectiveDependencies',
  }),
  dependsOnObjective: one(objectives, {
    fields: [objectiveDependencies.dependsOnObjectiveId],
    references: [objectives.id],
    relationName: 'dependentObjectives',
  }),
}));

// Auto-generated schemas using drizzle-zod
export const insertObjectiveSchema = createInsertSchema(objectives, {
  repositoryPath: (schema) => schema.min(1),
  description: (schema) => schema.min(1).max(16384),
  priority: (schema) => schema.int().min(-100).max(100),
});

export const selectObjectiveSchema = createSelectSchema(objectives);
export const updateObjectiveSchema = createUpdateSchema(objectives);

export const insertObjectiveDependencySchema = createInsertSchema(objectiveDependencies);
export const selectObjectiveDependencySchema = createSelectSchema(objectiveDependencies);

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type Objective = {
  id: string;
  repositoryPath: string;
  objectiveType: 'feature' | 'bug_fix' | 'refactor' | 'documentation' | 'testing' | 'deployment' | 'analysis' | 'optimization' | 'setup' | 'maintenance';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'on_hold';
  assignedAgentId?: string;
  parentObjectiveId?: string;
  priority: number;
  description: string;
  requirements?: Record<string, unknown>;
  results?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NewObjective = Omit<Objective, 'createdAt' | 'updatedAt'> & {
  createdAt?: string;
  updatedAt?: string;
};

export type ObjectiveUpdate = Partial<Omit<Objective, 'id'>>;

export type ObjectiveDependency = {
  objectiveId: string;
  dependsOnObjectiveId: string;
  dependencyType: 'completion' | 'parallel' | 'resource' | 'data';
};

export type NewObjectiveDependency = ObjectiveDependency;

export type ObjectiveType = z.infer<typeof objectiveTypeSchema>;
export type ObjectiveStatus = z.infer<typeof objectiveStatusSchema>;
export type DependencyType = z.infer<typeof dependencyTypeSchema>;

// Objective filtering and search schemas
export const objectiveFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  status: objectiveStatusSchema.optional(),
  objectiveType: objectiveTypeSchema.optional(),
  assignedAgentId: z.string().optional(),
  parentObjectiveId: z.string().optional(),
  minPriority: z.number().int().optional(),
  maxPriority: z.number().int().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  unassignedOnly: z.boolean().optional(),
  rootObjectivesOnly: z.boolean().optional(),
});

export const objectiveCreateRequestSchema = z.object({
  repositoryPath: z.string().min(1),
  objectiveType: objectiveTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(16384),
  priority: z.number().int().min(-100).max(100).default(0),
  requirements: objectiveRequirementsSchema,
  parentObjectiveId: z.string().min(1).optional(),
  dependencies: z.array(z.string().min(1)).optional(),
});

export type ObjectiveFilter = z.infer<typeof objectiveFilterSchema>;
export type ObjectiveCreateRequest = z.infer<typeof objectiveCreateRequestSchema>;