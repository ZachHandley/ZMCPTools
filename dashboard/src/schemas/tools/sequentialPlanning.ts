import { z } from 'zod';

// Sequential Planning Tool Schemas

export const SequentialPlanningSchema = z.object({
  objective: z.string().min(1).describe('The objective to create an execution plan for'),
  repositoryPath: z.string().min(1).describe('Repository path where the work will be done'),
  foundationSessionId: z.string().optional().describe('Optional foundation session ID for cost optimization'),
  planningDepth: z.enum(['surface', 'detailed', 'comprehensive']).default('detailed').describe('Depth of planning analysis'),
  includeRiskAnalysis: z.boolean().default(true).describe('Whether to include risk analysis in planning'),
  includeResourceEstimation: z.boolean().default(true).describe('Whether to include resource estimation'),
  preferredAgentTypes: z.array(z.string()).optional().describe('Preferred agent types for execution'),
  constraints: z.array(z.string()).optional().describe('Constraints or limitations to consider')
});

export const GetExecutionPlanSchema = z.object({
  planningId: z.string().min(1).describe('ID of the planning session to retrieve')
});

export const ExecuteWithPlanSchema = z.object({
  planningId: z.string().min(1).describe('ID of the execution plan to use'),
  repositoryPath: z.string().min(1).describe('Repository path where execution will occur'),
  foundationSessionId: z.string().optional().describe('Optional foundation session ID for cost optimization'),
  executeImmediately: z.boolean().default(true).describe('Whether to start execution immediately'),
  monitoring: z.boolean().default(true).describe('Whether to enable progress monitoring')
});

// Response Schemas

export const TaskBreakdownSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  taskType: z.string(),
  priority: z.number(),
  estimatedDuration: z.number(),
  dependencies: z.array(z.string()),
  requiredCapabilities: z.array(z.string()),
  assignedAgentType: z.string().optional(),
  complexity: z.enum(['simple', 'moderate', 'complex']),
  riskLevel: z.enum(['low', 'medium', 'high']),
  deliverables: z.array(z.string()),
  acceptanceCriteria: z.array(z.string())
});

export const AgentSpecificationSchema = z.object({
  agentType: z.string(),
  role: z.string(),
  responsibilities: z.array(z.string()),
  requiredCapabilities: z.array(z.string()),
  taskAssignments: z.array(z.string()),
  coordinationRequirements: z.array(z.string()),
  dependsOn: z.array(z.string()),
  priority: z.number(),
  estimatedWorkload: z.number()
});

export const ExecutionPlanSchema = z.object({
  planningId: z.string(),
  objective: z.string(),
  planningApproach: z.string(),
  complexityAnalysis: z.object({
    complexityLevel: z.enum(['simple', 'moderate', 'complex']),
    recommendedModel: z.string(),
    requiredSpecializations: z.array(z.string()),
    estimatedDuration: z.number(),
    riskFactors: z.array(z.string())
  }),
  tasks: z.array(TaskBreakdownSchema),
  taskDependencyGraph: z.record(z.array(z.string())),
  criticalPath: z.array(z.string()),
  agents: z.array(AgentSpecificationSchema),
  agentCoordination: z.object({
    communicationStrategy: z.string(),
    coordinationRooms: z.array(z.string()),
    progressReporting: z.string(),
    conflictResolution: z.string()
  }),
  riskAssessment: z.object({
    identifiedRisks: z.array(z.object({
      type: z.string(),
      description: z.string(),
      probability: z.enum(['low', 'medium', 'high']),
      impact: z.enum(['low', 'medium', 'high']),
      mitigationStrategy: z.string()
    })),
    contingencyPlans: z.array(z.string())
  }),
  resourceEstimation: z.object({
    totalEstimatedDuration: z.number(),
    parallelExecutionTime: z.number(),
    requiredCapabilities: z.array(z.string()),
    modelRecommendations: z.record(z.string()),
    foundationSessionOptimization: z.string()
  }),
  executionStrategy: z.object({
    phases: z.array(z.object({
      name: z.string(),
      description: z.string(),
      tasks: z.array(z.string()),
      agents: z.array(z.string()),
      duration: z.number()
    })),
    qualityGates: z.array(z.string()),
    completionCriteria: z.array(z.string()),
    rollbackStrategy: z.string()
  }),
  monitoringPlan: z.object({
    progressMetrics: z.array(z.string()),
    checkpoints: z.array(z.object({
      name: z.string(),
      timing: z.string(),
      criteria: z.array(z.string())
    })),
    escalationProcedures: z.array(z.string())
  }),
  createdAt: z.string(),
  createdBy: z.string(),
  planningDuration: z.number(),
  confidenceScore: z.number()
});

export const SequentialPlanningResponseSchema = z.object({
  success: z.boolean(),
  planningId: z.string(),
  message: z.string(),
  executionPlan: ExecutionPlanSchema.optional(),
  planningInsights: z.array(z.string()).optional(),
  error: z.string().optional(),
  planningDuration: z.number()
});

export const GetExecutionPlanResponseSchema = z.object({
  success: z.boolean(),
  planningId: z.string(),
  message: z.string(),
  executionPlan: ExecutionPlanSchema.optional(),
  error: z.string().optional()
});

export const ExecuteWithPlanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  planningId: z.string(),
  executionId: z.string().optional(),
  spawnedAgents: z.array(z.string()).optional(),
  createdTasks: z.array(z.string()).optional(),
  coordinationRoom: z.string().optional(),
  monitoringSetup: z.boolean().optional(),
  error: z.string().optional()
});

// Type exports
export type SequentialPlanningRequest = z.infer<typeof SequentialPlanningSchema>;
export type GetExecutionPlanRequest = z.infer<typeof GetExecutionPlanSchema>;
export type ExecuteWithPlanRequest = z.infer<typeof ExecuteWithPlanSchema>;
export type TaskBreakdown = z.infer<typeof TaskBreakdownSchema>;
export type AgentSpecification = z.infer<typeof AgentSpecificationSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type SequentialPlanningResponse = z.infer<typeof SequentialPlanningResponseSchema>;
export type GetExecutionPlanResponse = z.infer<typeof GetExecutionPlanResponseSchema>;
export type ExecuteWithPlanResponse = z.infer<typeof ExecuteWithPlanResponseSchema>;