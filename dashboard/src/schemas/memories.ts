import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

// Zod v4 schemas for validation
export const memoryTypeSchema = z.enum([
  'insight',
  'error',
  'decision', 
  'progress',
  'learning',
  'pattern',
  'solution'
]);

export const memoryCategorySchema = z.enum([
  'architecture',
  'implementation',
  'debugging',
  'optimization',
  'testing',
  'documentation',
  'deployment',
  'security',
  'performance',
  'workflow'
]).optional();

export const memoryTagsSchema = z.array(z.string()).default([]);
export const memoryContextSchema = z.record(z.string(), z.unknown()).optional();
export const memoryMiscDataSchema = z.record(z.string(), z.unknown()).optional();

// Drizzle table definition
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  repositoryPath: text('repositoryPath').notNull(),
  agentId: text('agentId').notNull(),
  memoryType: text('memoryType', { enum: ['insight', 'error', 'decision', 'progress', 'learning', 'pattern', 'solution'] }).notNull(),
  category: text('category', { enum: ['architecture', 'implementation', 'debugging', 'optimization', 'testing', 'documentation', 'deployment', 'security', 'performance', 'workflow'] }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  miscData: text('miscData', { mode: 'json' }).$type<Record<string, unknown>>(),
  context: text('context', { mode: 'json' }).$type<Record<string, unknown>>(),
  confidence: real('confidence').notNull().default(0.8),
  relevanceScore: real('relevanceScore').notNull().default(1.0),
  usefulnessScore: real('usefulnessScore').notNull().default(0.0),
  accessedCount: integer('accessedCount').notNull().default(0),
  referencedCount: integer('referencedCount').notNull().default(0),
  lastAccessed: text('lastAccessed'), // ISO datetime string
  createdAt: text('createdAt').notNull().default(sql`(current_timestamp)`),
});

// Drizzle-zod schemas with proper validation
export const insertMemorySchema = createInsertSchema(memories, {
  repositoryPath: (schema) => schema.min(1),
  agentId: (schema) => schema.min(1),
  title: (schema) => schema.min(1).max(200),
  content: (schema) => schema.min(1),
  confidence: (schema) => schema.min(0).max(1),
  relevanceScore: (schema) => schema.min(0),
  usefulnessScore: (schema) => schema.min(0),
  accessedCount: (schema) => schema.min(0),
  referencedCount: (schema) => schema.min(0),
});
export const selectMemorySchema = createSelectSchema(memories);
export const updateMemorySchema = createUpdateSchema(memories);

// Type exports - Simple TypeScript interfaces matching camelCase table fields
export type Memory = {
  id: string;
  repositoryPath: string;
  agentId: string;
  memoryType: 'insight' | 'error' | 'decision' | 'progress' | 'learning' | 'pattern' | 'solution';
  category?: 'architecture' | 'implementation' | 'debugging' | 'optimization' | 'testing' | 'documentation' | 'deployment' | 'security' | 'performance' | 'workflow';
  title: string;
  content: string;
  tags: string[];
  miscData?: Record<string, unknown>;
  context?: Record<string, unknown>;
  confidence: number;
  relevanceScore: number;
  usefulnessScore: number;
  accessedCount: number;
  referencedCount: number;
  lastAccessed?: string;
  createdAt: string;
};

export type NewMemory = Omit<Memory, 'accessedCount' | 'referencedCount' | 'usefulnessScore' | 'lastAccessed' | 'createdAt'> & {
  accessedCount?: number;
  referencedCount?: number;
  usefulnessScore?: number;
  lastAccessed?: string;
  createdAt?: string;
};

export type MemoryUpdate = Partial<Omit<Memory, 'id'>>;

export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

// Memory search and filtering schemas
export const memorySearchSchema = z.object({
  repositoryPath: z.string(),
  queryText: z.string().min(1),
  agentId: z.string().optional(),
  memoryType: memoryTypeSchema.optional(),
  category: memoryCategorySchema.optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
  minConfidence: z.number().min(0).max(1).optional(),
  minRelevanceScore: z.number().min(0).optional(),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).optional(),
  sortBy: z.enum(['relevance', 'usefulness', 'confidence', 'created', 'accessed']).optional().default('relevance'),
});

export type MemorySearch = z.infer<typeof memorySearchSchema>;