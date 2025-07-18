import { z } from 'zod';
import { type TaskType, type AgentStatus, type EntityType, taskTypeSchema, entityTypeSchema, agentStatusSchema } from '../index.js';

// ===============================================
// Agent Orchestration Tool Request Schemas
// ===============================================

export const OrchestrationObjectiveSchema = z.object({
  title: z.string().describe('Title for the orchestration objective - should be descriptive and concise'),
  objective: z.string().describe('Detailed description of the objective to be orchestrated by the architect agent. This should be a clear, comprehensive statement of what needs to be accomplished across multiple specialized agents.'),
  repositoryPath: z.string().describe('Absolute path to the repository where the orchestration will take place. This is the working directory for all spawned agents.'),
  foundationSessionId: z.string().optional().describe('Optional session ID for cost optimization. When provided, all spawned agents will share this session context, reducing token costs by 85-90% through shared conversation history.')
});

export const SpawnAgentSchema = z.object({
  agentType: z.string().describe('Type of specialized agent to spawn (e.g., "backend", "frontend", "testing", "documentation", "devops", "researcher"). This determines the agent\'s role-specific instructions and capabilities.'),
  repositoryPath: z.string().describe('Absolute path to the repository where the agent will operate. This is the working directory for all agent operations.'),
  taskDescription: z.string().describe('Detailed description of the specific task or responsibility this agent should handle. Should be clear, actionable, and include any important context or requirements.'),
  capabilities: z.array(z.string()).optional().default(['ALL_TOOLS']).describe('Array of capabilities or tools the agent should have access to. Defaults to "ALL_TOOLS" which grants full access to all available tools including file operations, code analysis, web browsing, and coordination tools.'),
  dependsOn: z.array(z.string()).optional().default([]).describe('Array of agent IDs that this agent depends on. The agent will only be spawned after all dependencies are satisfied (agents exist and are active/completed).'),
  metadata: z.record(z.string(), z.any()).optional().default({}).describe('Optional metadata object for storing additional agent configuration, context, or coordination information.'),
  autoCreateRoom: z.boolean().optional().describe('Whether to automatically create a coordination room for this agent. If not specified, uses the default behavior for the agent type (most agent types auto-create rooms by default).'),
  roomId: z.string().optional().describe('Optional existing room ID to assign the agent to. If provided, the agent will join this room instead of creating a new one.')
});

export const CreateTaskSchema = z.object({
  repositoryPath: z.string().describe('Absolute path to the repository where the task will be created. This determines the context and scope of the task.'),
  taskType: taskTypeSchema.describe('Type of task being created (e.g., "feature", "bug", "enhancement", "documentation", "testing"). This helps categorize and prioritize the task.'),
  title: z.string().describe('Short, descriptive title for the task that summarizes what needs to be done.'),
  description: z.string().describe('Detailed description of the task including requirements, context, and expected outcomes. Should be comprehensive enough for an agent to understand and execute.'),
  requirements: z.record(z.string(), z.any()).optional().describe('Optional object containing specific requirements, configuration, or parameters for the task. Can include priority, estimated duration, assigned agent ID, and other task-specific data.'),
  dependencies: z.array(z.string()).optional().describe('Optional array of task IDs that this task depends on. The task will only be eligible for assignment after all dependencies are completed.')
});



export const ListAgentsSchema = z.object({
  repositoryPath: z.string().describe('Absolute path to the repository where agents will be listed. This determines the scope of the agent search.'),
  status: agentStatusSchema.optional().describe('Optional status filter to only show agents with specific status (e.g., "active", "completed", "failed", "idle"). If not provided, will return agents of all statuses.'),
  limit: z.number().default(5).describe('Maximum number of agents to return. Defaults to 5. Use for pagination.'),
  offset: z.number().default(0).describe('Number of agents to skip before returning results. Defaults to 0. Use for pagination.')
});

export const TerminateAgentSchema = z.object({
  agentIds: z.array(z.string()).describe('Array of agent IDs to terminate. Each ID should correspond to an active agent. The termination process will gracefully shut down each agent and clean up their resources.')
});


export const MonitorAgentsSchema = z.object({
  agentId: z.string().optional().describe('Optional specific agent ID to monitor. If provided, will focus monitoring on this single agent. If not provided, will monitor all agents in the scope.'),
  orchestrationId: z.string().optional().describe('Optional orchestration ID to monitor. If provided, will monitor all agents and tasks within this orchestration context.'),
  roomName: z.string().optional().describe('Optional room name to monitor. If provided, will monitor communication and activity within this specific room.'),
  repositoryPath: z.string().optional().describe('Optional repository path to monitor. If provided, will monitor all agents and activities within this repository context. If not provided, uses current working directory.'),
  monitoringMode: z.enum(['status', 'activity', 'communication', 'full']).default('status').describe('Type of monitoring to perform. "status" monitors agent status changes, "activity" monitors task and work activity, "communication" monitors room messages and coordination, "full" monitors all aspects.'),
  updateInterval: z.number().default(2000).describe('Interval in milliseconds between monitoring updates. Defaults to 2000ms (2 seconds). Lower values provide more frequent updates but use more resources.'),
  maxDuration: z.number().default(50000).describe('Maximum duration in milliseconds to monitor. Defaults to 50000ms (50 seconds). After this time, monitoring will automatically stop.'),
  detailLevel: z.enum(['summary', 'detailed', 'verbose']).default('summary').describe('Level of detail in monitoring output. "summary" provides basic updates, "detailed" includes more context and metadata, "verbose" provides comprehensive information about all events.')
});

export const StructuredOrchestrationSchema = z.object({
  title: z.string().describe('Title for the structured orchestration - should be descriptive and concise'),
  objective: z.string().describe('Detailed description of the objective to be orchestrated using structured phased workflow. This should be a clear, comprehensive statement of what needs to be accomplished.'),
  repositoryPath: z.string().describe('Absolute path to the repository where the orchestration will take place. This is the working directory for all spawned agents.'),
  foundationSessionId: z.string().optional().describe('Optional session ID for cost optimization. When provided, all spawned agents will share this session context, reducing token costs by 85-90% through shared conversation history.'),
  maxDuration: z.number().optional().describe('Maximum duration in minutes for the orchestration. Defaults to 60 minutes. The orchestration will be cancelled if it exceeds this duration.'),
  enableProgressTracking: z.boolean().optional().default(true).describe('Whether to enable detailed progress tracking and real-time updates. Defaults to true.'),
  customPhaseConfig: z.record(z.string(), z.boolean()).optional().describe('Optional configuration to enable/disable specific phases. Keys can be "research", "plan", "execute", "monitor", "cleanup". All phases are enabled by default.')
});

export const ContinueAgentSessionSchema = z.object({
  agentId: z.string().describe('ID of the agent whose session should be continued. This agent must exist and have a stored conversation session ID.'),
  additionalInstructions: z.string().optional().describe('Optional additional instructions to provide to the agent when resuming the session. These will be appended to the agent\'s original task and context.'),
  newTaskDescription: z.string().optional().describe('Optional new task description to replace the agent\'s current task. If provided, this will become the agent\'s new primary objective.'),
  preserveContext: z.boolean().default(true).describe('Whether to preserve the agent\'s conversation context when continuing the session. If true, the agent will resume with all previous conversation history. If false, starts a fresh conversation with the stored session ID.'),
  updateMetadata: z.record(z.string(), z.any()).optional().describe('Optional metadata updates to apply to the agent when continuing the session. This can include new configuration, status updates, or coordination information.')
});

export type OrchestrationObjectiveInput = z.infer<typeof OrchestrationObjectiveSchema>;
export type SpawnAgentInput = z.infer<typeof SpawnAgentSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type ListAgentsInput = z.infer<typeof ListAgentsSchema>;
export type TerminateAgentInput = z.infer<typeof TerminateAgentSchema>;
export type MonitorAgentsInput = z.infer<typeof MonitorAgentsSchema>;
export type StructuredOrchestrationInput = z.infer<typeof StructuredOrchestrationSchema>;
export type ContinueAgentSessionInput = z.infer<typeof ContinueAgentSessionSchema>;

// ===============================================
// Agent Orchestration Tool Response Schemas
// ===============================================

// Orchestrate Objective Response
export const OrchestrationObjectiveResponseSchema = z.object({
  success: z.boolean().describe('Whether the orchestration was successfully initiated. True if architect agent was spawned and coordination room was created.'),
  message: z.string().describe('Human-readable message describing the orchestration result, including success confirmation or error details.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the orchestration was initiated.'),
  execution_time_ms: z.number().optional().describe('Time taken to complete the orchestration setup in milliseconds, including agent spawning and room creation.'),
  data: z.object({
    architect_agent_id: z.string().describe('Unique identifier of the spawned architect agent responsible for coordinating the multi-agent objective.'),
    room_name: z.string().describe('Name of the created coordination room where all agents will communicate and coordinate their work.'),
    objective: z.string().describe('The original objective description that was passed to the architect agent for orchestration.'),
    master_task_id: z.string().describe('ID of the master task created for this orchestration, which serves as the root task for all sub-tasks.')
  }).optional().describe('Orchestration details returned when successful, containing architect agent info, coordination room, and master task details.')
});

// Spawn Agent Response
export const SpawnAgentResponseSchema = z.object({
  success: z.boolean().describe('Whether the agent was successfully spawned and is ready to begin work. True if agent process started and is responding.'),
  message: z.string().describe('Human-readable message describing the spawn result, including agent type and success confirmation or error details.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the agent spawn operation was completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to spawn the agent in milliseconds, including process creation and initialization.'),
  data: z.object({
    agent_id: z.string().describe('Unique identifier of the newly spawned agent, used for all subsequent operations and coordination.'),
    agent_type: z.string().describe('Type of specialized agent that was spawned (e.g., "backend", "frontend", "testing", "documentation").'),
    pid: z.string().optional().describe('Process ID of the spawned Claude agent process, if available. Used for process management and monitoring.'),
    capabilities: z.array(z.string()).describe('List of capabilities and tools the agent has access to, such as ["ALL_TOOLS", "file_operations", "web_browsing"].')
  }).optional().describe('Agent spawn details returned when successful, containing agent identifier, type, process info, and capabilities.')
});

// Create Task Response
export const CreateTaskResponseSchema = z.object({
  success: z.boolean().describe('Whether the task was successfully created in the system. True if task was stored and is ready for assignment.'),
  message: z.string().describe('Human-readable message describing the task creation result, including task ID and confirmation or error details.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the task was created.'),
  execution_time_ms: z.number().optional().describe('Time taken to create the task in milliseconds, including database operations and dependency setup.'),
  data: z.object({
    task_id: z.string().describe('Unique identifier of the created task, used for assignment, tracking, and updates.'),
    task_type: z.string().describe('Type of task that was created (e.g., "feature", "bug", "enhancement", "documentation", "testing").'),
    status: z.string().describe('Current status of the task (typically "pending" for newly created tasks).'),
    priority: z.number().describe('Priority level of the task (1-10 scale, where 10 is highest priority).'),
    estimated_duration: z.number().optional().describe('Estimated time to complete the task in minutes, if provided during creation.'),
    dependencies: z.array(z.string()).describe('List of task IDs that this task depends on. Task will only be eligible for assignment after dependencies are completed.')
  }).optional().describe('Task creation details returned when successful, containing task metadata, priority, and dependency information.')
});



// List Agents Response
export const ListAgentsResponseSchema = z.object({
  success: z.boolean().describe('Whether the agent listing operation completed successfully. True if agent information was retrieved from the system.'),
  message: z.string().describe('Human-readable description of the listing result, including number of agents found or any filtering applied.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the agent listing was completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to retrieve and format the agent list in milliseconds.'),
  data: z.object({
    agents: z.array(z.object({
      id: z.string().describe('Unique identifier of the agent.'),
      name: z.string().describe('Human-readable name or type of the agent.'),
      status: z.string().describe('Current operational status of the agent (e.g., "active", "idle", "completed", "failed").'),
      capabilities: z.array(z.string()).describe('List of capabilities and tools the agent has access to.'),
      last_heartbeat: z.string().optional().describe('ISO timestamp of the agent\'s last heartbeat/health check, if available.'),
      metadata: z.any().optional().describe('Additional agent metadata including room assignments, task info, and configuration.')
    })).describe('Array of agent objects with their current status, capabilities, and metadata.'),
    count: z.number().describe('Total number of agents returned in the list.')
  }).optional().describe('Agent listing details returned when successful, containing agent status information, capabilities, and metadata.')
});

// Terminate Agent Response
export const TerminateAgentResponseSchema = z.object({
  success: z.boolean().describe('Whether all requested agent terminations completed successfully. True only if all agents were terminated without errors.'),
  message: z.string().describe('Human-readable summary of termination results, including success/failure counts and overall outcome.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the termination operation completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to terminate all requested agents in milliseconds.'),
  data: z.object({
    results: z.array(z.object({
      agent_id: z.string().describe('ID of the agent that was targeted for termination.'),
      success: z.boolean().describe('Whether this specific agent was successfully terminated.'),
      error: z.string().optional().describe('Error message if termination failed for this agent.')
    })).describe('Array of termination results for each individual agent, showing success/failure status.'),
    success_count: z.number().describe('Number of agents that were successfully terminated.'),
    failure_count: z.number().describe('Number of agents that failed to terminate properly.'),
    total_count: z.number().describe('Total number of agents that were targeted for termination.')
  }).optional().describe('Agent termination details returned when operation completes, containing individual results and summary counts.')
});


// Monitor Agents Response
export const MonitorAgentsResponseSchema = z.object({
  success: z.boolean().describe('Whether the monitoring operation completed successfully. True if monitoring was set up and ran for the specified duration.'),
  message: z.string().describe('Human-readable description of the monitoring result, including duration and events captured.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the monitoring operation completed.'),
  execution_time_ms: z.number().optional().describe('Actual time spent monitoring in milliseconds, may be less than requested if terminated early.'),
  data: z.object({
    monitoring_mode: z.string().describe('Type of monitoring that was performed ("status", "activity", "communication", or "full").'),
    detail_level: z.string().describe('Level of detail in monitoring output ("summary", "detailed", or "verbose").'),
    duration: z.number().describe('Actual duration of monitoring in milliseconds.'),
    event_subscriptions: z.number().describe('Number of event types that were subscribed to during monitoring (e.g., agent status changes, task updates).'),
    errors: z.string().optional().describe('Summary of any errors that occurred during monitoring, if any.'),
    monitoring_type: z.string().describe('Technical type of monitoring implementation used (e.g., "real-time-eventbus").'),
    final_status: z.string().describe('Summary of the final monitoring outcome (e.g., "Agent monitored", "Orchestration monitored", "Repository monitored").')
  }).optional().describe('Monitoring operation details returned when successful, containing monitoring configuration, duration, and event capture summary.')
});

// Structured Orchestration Response
export const StructuredOrchestrationResponseSchema = z.object({
  success: z.boolean().describe('Whether the structured orchestration completed successfully. True if all phases executed and the objective was accomplished.'),
  message: z.string().describe('Human-readable description of the orchestration result, including completion status and any important outcomes.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the orchestration operation completed.'),
  execution_time_ms: z.number().optional().describe('Total time taken to complete the structured orchestration in milliseconds.'),
  data: z.object({
    orchestration_id: z.string().describe('Unique identifier of the structured orchestration instance.'),
    complexity_level: z.string().describe('Analyzed complexity level of the objective ("simple", "moderate", or "complex").'),
    recommended_model: z.string().describe('AI model recommended and used for complex phases ("claude-3-7-sonnet-latest", "claude-sonnet-4-0", or "claude-opus-4-0").'),
    phases_completed: z.array(z.string()).describe('List of workflow phases that were completed successfully (e.g., ["research", "plan", "execute"]).'),
    spawned_agents: z.array(z.string()).describe('List of agent IDs that were spawned during the orchestration.'),
    created_tasks: z.array(z.string()).describe('List of task IDs that were created during the orchestration.'),
    room_name: z.string().optional().describe('Name of the coordination room created for agent communication.'),
    master_task_id: z.string().optional().describe('ID of the master task created for this orchestration.'),
    final_results: z.any().optional().describe('Final results and outputs from each completed phase.'),
    total_duration: z.number().describe('Total duration of the orchestration in milliseconds.'),
    progress: z.number().describe('Final progress percentage (0-100).')
  }).optional().describe('Structured orchestration details returned when completed, containing phase results, spawned agents, and final outcomes.')
});

// Continue Agent Session Response
export const ContinueAgentSessionResponseSchema = z.object({
  success: z.boolean().describe('Whether the agent session continuation was successful. True if agent was resumed with stored session ID and is actively running.'),
  message: z.string().describe('Human-readable description of the session continuation result, including agent status and any context preservation details.'),
  timestamp: z.string().describe('ISO timestamp string indicating when the session continuation completed.'),
  execution_time_ms: z.number().optional().describe('Time taken to continue the agent session in milliseconds, including process startup and context restoration.'),
  data: z.object({
    agent_id: z.string().describe('ID of the agent whose session was continued.'),
    agent_name: z.string().describe('Name of the agent that was resumed.'),
    agent_type: z.string().describe('Type of the agent that was resumed (e.g., "backend", "frontend", "testing").'),
    session_id: z.string().describe('The stored conversation session ID that was used to resume the agent.'),
    previous_status: z.string().describe('The agent\'s status before session continuation (e.g., "completed", "terminated", "failed").'),
    new_status: z.string().describe('The agent\'s status after session continuation (typically "active").'),
    context_preserved: z.boolean().describe('Whether the agent\'s conversation context was preserved during resumption.'),
    task_updated: z.boolean().describe('Whether the agent was given a new task description during resumption.'),
    instructions_added: z.boolean().describe('Whether additional instructions were provided to the agent during resumption.'),
    claude_pid: z.number().optional().describe('Process ID of the resumed Claude agent process, if available.'),
    room_id: z.string().optional().describe('ID of the coordination room the agent is assigned to, if any.'),
    resumption_details: z.object({
      original_task: z.string().optional().describe('The agent\'s original task description.'),
      new_task: z.string().optional().describe('The new task description, if updated.'),
      additional_instructions: z.string().optional().describe('Additional instructions provided during resumption.'),
      metadata_updates: z.record(z.string(), z.any()).optional().describe('Metadata updates applied during resumption.')
    }).describe('Details about what was changed or preserved during the session continuation.')
  }).optional().describe('Agent session continuation details returned when successful, containing agent info, session details, and resumption context.')
});

// Export response types
export type OrchestrationObjectiveResponse = z.infer<typeof OrchestrationObjectiveResponseSchema>;
export type SpawnAgentResponse = z.infer<typeof SpawnAgentResponseSchema>;
export type CreateTaskResponse = z.infer<typeof CreateTaskResponseSchema>;
export type ListAgentsResponse = z.infer<typeof ListAgentsResponseSchema>;
export type TerminateAgentResponse = z.infer<typeof TerminateAgentResponseSchema>;
export type MonitorAgentsResponse = z.infer<typeof MonitorAgentsResponseSchema>;
export type StructuredOrchestrationResponse = z.infer<typeof StructuredOrchestrationResponseSchema>;
export type ContinueAgentSessionResponse = z.infer<typeof ContinueAgentSessionResponseSchema>;