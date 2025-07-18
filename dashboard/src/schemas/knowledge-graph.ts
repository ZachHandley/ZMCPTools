import { z } from 'zod';
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

// Entity types in the knowledge graph
export const entityTypeSchema = z.enum([
  'agent',
  'task',
  'file',
  'function',
  'class',
  'concept',
  'error',
  'solution',
  'pattern',
  'insight',
  'decision',
  'tool',
  'repository',
  'dependency',
  'configuration',
  'test',
  'documentation',
  'feature',
  'bug',
  'requirement',
  'progress'
]);

// Relationship types between entities
export const relationshipTypeSchema = z.enum([
  // Agent relationships
  'agent_created',
  'agent_discovered',
  'agent_used',
  'agent_solved',
  'agent_worked_on',
  'agent_collaborated_with',
  
  // Task relationships
  'task_depends_on',
  'task_contains',
  'task_implements',
  'task_tests',
  'task_documents',
  'task_fixes',
  
  // Code relationships
  'imports',
  'extends',
  'implements',
  'calls',
  'references',
  'defines',
  'exports',
  'inherits_from',
  'overrides',
  
  // Error and solution relationships
  'error_caused_by',
  'error_resolved_by',
  'solution_applies_to',
  'pattern_found_in',
  'pattern_similar_to',
  
  // Knowledge relationships
  'relates_to',
  'similar_to',
  'depends_on',
  'conflicts_with',
  'enhances',
  'replaces',
  'derived_from',
  'validates',
  
  // Discovery relationships
  'discovered_during',
  'learned_from',
  'applied_to',
  'generalized_from',
  'specialized_to'
]);

// Confidence levels for relationships and entities
export const confidenceSchema = z.enum([
  'very_low',    // 0.0-0.2
  'low',         // 0.2-0.4
  'medium',      // 0.4-0.6
  'high',        // 0.6-0.8
  'very_high'    // 0.8-1.0
]);

// Entity properties schema
export const entityPropertiesSchema = z.record(z.string(), z.unknown()).optional();
export const relationshipPropertiesSchema = z.record(z.string(), z.unknown()).optional();

// Drizzle table definitions
export const knowledgeEntities = sqliteTable('knowledge_entities', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  entityType: text('entityType', { enum: ['agent', 'task', 'file', 'function', 'class', 'concept', 'error', 'solution', 'pattern', 'insight', 'decision', 'tool', 'repository', 'dependency', 'configuration', 'test', 'documentation', 'feature', 'bug', 'requirement', 'progress'] }).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  
  // Vector embedding stored in LanceDB (not SQLite)
  // embedding: text('embedding', { mode: 'json' }).$type<number[]>(),
  
  // Entity properties and metadata
  properties: text('properties', { mode: 'json' }).$type<Record<string, unknown>>(),
  
  // Importance and relevance scoring
  importanceScore: real('importanceScore').notNull().default(0.5),
  relevanceScore: real('relevanceScore').notNull().default(0.5),
  confidenceScore: real('confidenceScore').notNull().default(0.5),
  
  // Usage tracking
  accessCount: integer('accessCount').notNull().default(0),
  lastAccessed: text('lastAccessed'),
  
  // Lifecycle tracking
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updatedAt').notNull().default(sql`(current_timestamp)`),
  
  // Discovery context
  discoveredBy: text('discoveredBy'), // Agent ID
  discoveredDuring: text('discoveredDuring'), // Task ID or context
  
  // Validation and quality
  validated: integer('validated', { mode: 'boolean' }).notNull().default(false),
  validatedBy: text('validatedBy'), // Agent ID
  validatedAt: text('validatedAt'),
});

export const knowledgeRelationships = sqliteTable('knowledge_relationships', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  
  // Relationship definition
  fromEntityId: text('fromEntityId').notNull(),
  toEntityId: text('toEntityId').notNull(),
  relationshipType: text('relationshipType', { enum: ['agent_created', 'agent_discovered', 'agent_used', 'agent_solved', 'agent_worked_on', 'agent_collaborated_with', 'task_depends_on', 'task_contains', 'task_implements', 'task_tests', 'task_documents', 'task_fixes', 'imports', 'extends', 'implements', 'calls', 'references', 'defines', 'exports', 'inherits_from', 'overrides', 'error_caused_by', 'error_resolved_by', 'solution_applies_to', 'pattern_found_in', 'pattern_similar_to', 'relates_to', 'similar_to', 'depends_on', 'conflicts_with', 'enhances', 'replaces', 'derived_from', 'validates', 'discovered_during', 'learned_from', 'applied_to', 'generalized_from', 'specialized_to'] }).notNull(),
  
  // Relationship properties
  properties: text('properties', { mode: 'json' }).$type<Record<string, unknown>>(),
  
  // Relationship strength and confidence
  strength: real('strength').notNull().default(0.5), // 0.0 to 1.0
  confidence: real('confidence').notNull().default(0.5), // 0.0 to 1.0
  
  // Context information
  context: text('context'),
  evidenceCount: integer('evidenceCount').notNull().default(1),
  
  // Lifecycle tracking
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updatedAt').notNull().default(sql`(current_timestamp)`),
  
  // Discovery context
  discoveredBy: text('discoveredBy'), // Agent ID
  discoveredDuring: text('discoveredDuring'), // Task ID or context
  
  // Validation
  validated: integer('validated', { mode: 'boolean' }).notNull().default(false),
  validatedBy: text('validatedBy'), // Agent ID
  validatedAt: text('validatedAt'),
});

// Knowledge graph insights - derived knowledge and patterns
export const knowledgeInsights = sqliteTable('knowledge_insights', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  
  // Insight definition
  title: text('title').notNull(),
  description: text('description').notNull(),
  insightType: text('insightType', { enum: ['pattern', 'correlation', 'anomaly', 'trend', 'optimization', 'risk', 'opportunity'] }).notNull(),
  
  // Related entities and relationships
  relatedEntities: text('relatedEntities', { mode: 'json' }).$type<string[]>().default([]),
  relatedRelationships: text('relatedRelationships', { mode: 'json' }).$type<string[]>().default([]),
  
  // Evidence and supporting data
  evidence: text('evidence', { mode: 'json' }).$type<Record<string, unknown>>(),
  supportingData: text('supportingData', { mode: 'json' }).$type<Record<string, unknown>>(),
  
  // Insight quality metrics
  confidence: real('confidence').notNull().default(0.5),
  impact: real('impact').notNull().default(0.5),
  actionability: real('actionability').notNull().default(0.5),
  
  // Lifecycle tracking
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updatedAt').notNull().default(sql`(current_timestamp)`),
  
  // Discovery context
  discoveredBy: text('discoveredBy'), // Agent ID
  discoveredDuring: text('discoveredDuring'), // Task ID or context
  
  // Validation and application
  validated: integer('validated', { mode: 'boolean' }).notNull().default(false),
  validatedBy: text('validatedBy'), // Agent ID
  validatedAt: text('validatedAt'),
  applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
  appliedBy: text('appliedBy'), // Agent ID
  appliedAt: text('appliedAt'),
});

// Drizzle relations
export const knowledgeEntitiesRelations = relations(knowledgeEntities, ({ many }) => ({
  outgoingRelationships: many(knowledgeRelationships, { relationName: 'fromEntity' }),
  incomingRelationships: many(knowledgeRelationships, { relationName: 'toEntity' }),
}));

export const knowledgeRelationshipsRelations = relations(knowledgeRelationships, ({ one }) => ({
  fromEntity: one(knowledgeEntities, {
    fields: [knowledgeRelationships.fromEntityId],
    references: [knowledgeEntities.id],
    relationName: 'fromEntity'
  }),
  toEntity: one(knowledgeEntities, {
    fields: [knowledgeRelationships.toEntityId],
    references: [knowledgeEntities.id],
    relationName: 'toEntity'
  }),
}));

// Drizzle-zod schemas
export const insertKnowledgeEntitySchema = createInsertSchema(knowledgeEntities, {
  repositoryPath: (schema) => schema.min(1),
  name: (schema) => schema.min(1).max(255),
  description: (schema) => schema.max(8192).optional(),
  importanceScore: (schema) => schema.min(0).max(1),
  relevanceScore: (schema) => schema.min(0).max(1),
  confidenceScore: (schema) => schema.min(0).max(1),
});

export const selectKnowledgeEntitySchema = createSelectSchema(knowledgeEntities);
export const updateKnowledgeEntitySchema = createUpdateSchema(knowledgeEntities);

export const insertKnowledgeRelationshipSchema = createInsertSchema(knowledgeRelationships, {
  repositoryPath: (schema) => schema.min(1),
  fromEntityId: (schema) => schema.min(1),
  toEntityId: (schema) => schema.min(1),
  strength: (schema) => schema.min(0).max(1),
  confidence: (schema) => schema.min(0).max(1),
  evidenceCount: (schema) => schema.min(1),
});

export const selectKnowledgeRelationshipSchema = createSelectSchema(knowledgeRelationships);
export const updateKnowledgeRelationshipSchema = createUpdateSchema(knowledgeRelationships);

export const insertKnowledgeInsightSchema = createInsertSchema(knowledgeInsights, {
  repositoryPath: (schema) => schema.min(1),
  title: (schema) => schema.min(1).max(255),
  description: (schema) => schema.min(1).max(8192),
  confidence: (schema) => schema.min(0).max(1),
  impact: (schema) => schema.min(0).max(1),
  actionability: (schema) => schema.min(0).max(1),
});

export const selectKnowledgeInsightSchema = createSelectSchema(knowledgeInsights);
export const updateKnowledgeInsightSchema = createUpdateSchema(knowledgeInsights);

// TypeScript type exports
export type KnowledgeEntity = {
  id: string;
  repositoryPath: string;
  entityType: 'agent' | 'task' | 'file' | 'function' | 'class' | 'concept' | 'error' | 'solution' | 'pattern' | 'insight' | 'decision' | 'tool' | 'repository' | 'dependency' | 'configuration' | 'test' | 'documentation' | 'feature' | 'bug' | 'requirement' | 'progress';
  name: string;
  description?: string;
  embedding?: number[];
  properties?: Record<string, unknown>;
  importanceScore: number;
  relevanceScore: number;
  confidenceScore: number;
  accessCount: number;
  lastAccessed?: string;
  createdAt: string;
  updatedAt: string;
  discoveredBy?: string;
  discoveredDuring?: string;
  validated: boolean;
  validatedBy?: string;
  validatedAt?: string;
};

export type NewKnowledgeEntity = Omit<KnowledgeEntity, 'accessCount' | 'createdAt' | 'updatedAt' | 'validated'> & {
  accessCount?: number;
  createdAt?: string;
  updatedAt?: string;
  validated?: boolean;
};

export type KnowledgeEntityUpdate = Partial<Omit<KnowledgeEntity, 'id' | 'createdAt'>>;

export type KnowledgeRelationship = {
  id: string;
  repositoryPath: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: 'agent_created' | 'agent_discovered' | 'agent_used' | 'agent_solved' | 'agent_worked_on' | 'agent_collaborated_with' | 'task_depends_on' | 'task_contains' | 'task_implements' | 'task_tests' | 'task_documents' | 'task_fixes' | 'imports' | 'extends' | 'implements' | 'calls' | 'references' | 'defines' | 'exports' | 'inherits_from' | 'overrides' | 'error_caused_by' | 'error_resolved_by' | 'solution_applies_to' | 'pattern_found_in' | 'pattern_similar_to' | 'relates_to' | 'similar_to' | 'depends_on' | 'conflicts_with' | 'enhances' | 'replaces' | 'derived_from' | 'validates' | 'discovered_during' | 'learned_from' | 'applied_to' | 'generalized_from' | 'specialized_to';
  properties?: Record<string, unknown>;
  strength: number;
  confidence: number;
  context?: string;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
  discoveredBy?: string;
  discoveredDuring?: string;
  validated: boolean;
  validatedBy?: string;
  validatedAt?: string;
};

export type NewKnowledgeRelationship = Omit<KnowledgeRelationship, 'evidenceCount' | 'createdAt' | 'updatedAt' | 'validated'> & {
  evidenceCount?: number;
  createdAt?: string;
  updatedAt?: string;
  validated?: boolean;
};

export type KnowledgeRelationshipUpdate = Partial<Omit<KnowledgeRelationship, 'id' | 'createdAt'>>;

export type KnowledgeInsight = {
  id: string;
  repositoryPath: string;
  title: string;
  description: string;
  insightType: 'pattern' | 'correlation' | 'anomaly' | 'trend' | 'optimization' | 'risk' | 'opportunity';
  relatedEntities: string[];
  relatedRelationships: string[];
  evidence?: Record<string, unknown>;
  supportingData?: Record<string, unknown>;
  confidence: number;
  impact: number;
  actionability: number;
  createdAt: string;
  updatedAt: string;
  discoveredBy?: string;
  discoveredDuring?: string;
  validated: boolean;
  validatedBy?: string;
  validatedAt?: string;
  applied: boolean;
  appliedBy?: string;
  appliedAt?: string;
};

export type NewKnowledgeInsight = Omit<KnowledgeInsight, 'createdAt' | 'updatedAt' | 'validated' | 'applied'> & {
  createdAt?: string;
  updatedAt?: string;
  validated?: boolean;
  applied?: boolean;
};

export type KnowledgeInsightUpdate = Partial<Omit<KnowledgeInsight, 'id' | 'createdAt'>>;

export type EntityType = z.infer<typeof entityTypeSchema>;
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;

// Search and filtering schemas
export const knowledgeSearchSchema = z.object({
  repositoryPath: z.string(),
  query: z.string().min(1),
  entityTypes: z.array(entityTypeSchema).optional(),
  relationshipTypes: z.array(relationshipTypeSchema).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  minImportance: z.number().min(0).max(1).optional(),
  includeRelationships: z.boolean().default(true),
  includeInsights: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const entityFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  entityType: entityTypeSchema.optional(),
  discoveredBy: z.string().optional(),
  discoveredDuring: z.string().optional(),
  validated: z.boolean().optional(),
  minImportance: z.number().min(0).max(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const relationshipFilterSchema = z.object({
  repositoryPath: z.string().optional(),
  fromEntityId: z.string().optional(),
  toEntityId: z.string().optional(),
  relationshipType: relationshipTypeSchema.optional(),
  minStrength: z.number().min(0).max(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  validated: z.boolean().optional(),
  discoveredBy: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type KnowledgeSearch = z.infer<typeof knowledgeSearchSchema>;
export type EntityFilter = z.infer<typeof entityFilterSchema>;
export type RelationshipFilter = z.infer<typeof relationshipFilterSchema>;

// Insight detection patterns
export const insightDetectionRules = {
  // Pattern detection rules
  patterns: {
    errorPattern: {
      description: "Recurring error patterns across agents and tasks",
      entityTypes: ['error', 'agent', 'task'],
      relationshipTypes: ['error_caused_by', 'agent_solved'],
      minOccurrences: 3,
      confidenceThreshold: 0.7
    },
    collaborationPattern: {
      description: "Effective agent collaboration patterns",
      entityTypes: ['agent', 'task'],
      relationshipTypes: ['agent_collaborated_with', 'agent_worked_on'],
      minOccurrences: 2,
      confidenceThreshold: 0.6
    },
    solutionPattern: {
      description: "Reusable solution patterns",
      entityTypes: ['solution', 'problem', 'pattern'],
      relationshipTypes: ['solution_applies_to', 'pattern_similar_to'],
      minOccurrences: 2,
      confidenceThreshold: 0.8
    }
  },
  
  // Correlation detection
  correlations: {
    toolUsageCorrelation: {
      description: "Tools that are commonly used together",
      entityTypes: ['tool', 'agent', 'task'],
      relationshipTypes: ['agent_used', 'task_depends_on'],
      minCorrelation: 0.5
    },
    errorSolutionCorrelation: {
      description: "Errors and their effective solutions",
      entityTypes: ['error', 'solution'],
      relationshipTypes: ['error_resolved_by', 'solution_applies_to'],
      minCorrelation: 0.7
    }
  }
};

export type InsightDetectionRules = typeof insightDetectionRules;