import { z } from 'zod';
import { 
  planCreateRequestSchema,
  planFilterSchema,
  planSectionUpdateSchema,
  planTodoUpdateSchema,
  planStatusSchema,
  sectionTypeSchema,
  planSectionSchema
} from '../plans.js';

// Request schemas for plan operations
export const CreatePlanSchema = planCreateRequestSchema;

export const GetPlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required')
});

export const ListPlansSchema = planFilterSchema;

export const UpdatePlanStatusSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  status: planStatusSchema
});

// Simplified schemas - removed all todo-related operations

export const GeneratePlanFromObjectiveSchema = z.object({
  repositoryPath: z.string().min(1, 'Repository path is required'),
  objective: z.string().min(1).max(4096, 'Objective description is required'),
  title: z.string().min(1).max(200, 'Plan title is required'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  constraints: z.string().optional(),
  createdByAgent: z.string().optional()
});

export const ExecuteWithPlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  executeImmediately: z.boolean().default(true)
});

export const DeletePlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required')
});

export const UpdatePlanSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  updates: z.object({
    status: planStatusSchema.optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(4096).optional(),
    objectives: z.string().min(1).max(4096).optional(),
    acceptanceCriteria: z.string().optional(),
    constraints: z.string().optional(),
    sections: z.array(planSectionSchema).optional(),
    metadata: z.object({
      estimatedTotalHours: z.number().min(0).optional(),
      riskLevel: z.enum(['low', 'medium', 'high']).optional(),
      dependencies: z.array(z.string()).optional(),
      technologies: z.array(z.string()).optional()
    }).optional()
  })
});

// Simplified response schemas - only 5 needed (added delete)
export const CreatePlanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    planId: z.string(),
    title: z.string(),
    status: planStatusSchema,
    sectionsCount: z.number(),
    totalTodos: z.number(),
    createdTaskIds: z.array(z.string()).optional()
  }).optional(),
  error: z.string().optional()
});

export const GetPlanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    plan: z.any(), // Full plan object
    progress: z.object({
      totalSections: z.number(),
      completedSections: z.number(),
      totalTodos: z.number(),
      completedTodos: z.number(),
      progressPercentage: z.number()
    })
  }).optional(),
  error: z.string().optional()
});

export const ListPlansResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    plans: z.array(z.any()),
    total: z.number(),
    hasMore: z.boolean()
  }).optional(),
  error: z.string().optional()
});

export const GeneratePlanFromObjectiveResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    planId: z.string(),
    title: z.string(),
    sectionsGenerated: z.number(),
    totalTodos: z.number(),
    estimatedHours: z.number().optional()
  }).optional(),
  error: z.string().optional()
});

export const ExecuteWithPlanResponseSchema = CreatePlanResponseSchema;

export const DeletePlanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    planId: z.string(),
    deleted: z.boolean()
  }).optional(),
  error: z.string().optional()
});

export const UpdatePlanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    planId: z.string(),
    title: z.string(),
    status: planStatusSchema,
    updated: z.boolean(),
    updatedFields: z.array(z.string())
  }).optional(),
  error: z.string().optional()
});

// Simplified type exports - only 5 needed (added delete)
export type GetPlanRequest = z.infer<typeof GetPlanSchema>;
export type ListPlansRequest = z.infer<typeof ListPlansSchema>;
export type GeneratePlanFromObjectiveRequest = z.infer<typeof GeneratePlanFromObjectiveSchema>;
export type ExecuteWithPlanRequest = z.infer<typeof ExecuteWithPlanSchema>;
export type DeletePlanRequest = z.infer<typeof DeletePlanSchema>;
export type UpdatePlanRequest = z.infer<typeof UpdatePlanSchema>;

export type CreatePlanResponse = z.infer<typeof CreatePlanResponseSchema>;
export type GetPlanResponse = z.infer<typeof GetPlanResponseSchema>;
export type ListPlansResponse = z.infer<typeof ListPlansResponseSchema>;
export type GeneratePlanFromObjectiveResponse = z.infer<typeof GeneratePlanFromObjectiveResponseSchema>;
export type ExecuteWithPlanResponse = z.infer<typeof ExecuteWithPlanResponseSchema>;
export type DeletePlanResponse = z.infer<typeof DeletePlanResponseSchema>;
export type UpdatePlanResponse = z.infer<typeof UpdatePlanResponseSchema>;