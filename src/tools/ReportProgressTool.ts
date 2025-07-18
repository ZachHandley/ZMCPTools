/**
 * ReportProgressTool
 *
 * A simple tool for agents to self-report progress updates that integrates with
 * the EventBus system for real-time monitoring. This tool provides a unified
 * way for agents to communicate their status regardless of whether they're
 * working independently or in a coordinated multi-agent environment.
 */

import { z } from "zod";
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpTool } from '../schemas/tools/index.js';
import { eventBus } from "../services/EventBus.js";
import { AgentService } from "../services/AgentService.js";
import { ObjectiveService } from "../services/ObjectiveService.js";
import { CommunicationService } from "../services/CommunicationService.js";
import { DatabaseManager } from "../database/index.js";
import { Logger } from "../utils/logger.js";
import { PathUtils } from "../utils/pathUtils.js";
import { ProgressTracker } from "../services/ProgressTracker.js";
import {
  ProgressReportResponseSchema,
  createSuccessResponse,
  createErrorResponse,
  type ProgressReportResponse,
} from "../schemas/toolResponses.js";
import type { ObjectiveStatus, AgentStatus } from "../schemas/index.js";
import {
  ReportProgressSchema,
  type ReportProgressInput,
} from "../schemas/toolRequests.js";
import {
  ProgressReportInternalSchema,
  type ProgressReportInternal,
} from "../schemas/tools/reportProgress.js";

const logger = new Logger("ReportProgressTool");

// Local type alias for backward compatibility
export type ReportProgressOptions = ReportProgressInput;
export type ProgressReport = ProgressReportInternal;

export class ReportProgressTool {
  private agentService: AgentService;
  private objectiveService: ObjectiveService;
  private communicationService: CommunicationService;
  private progressTracker: ProgressTracker;

  constructor(private db: DatabaseManager) {
    this.agentService = new AgentService(db);
    this.objectiveService = new ObjectiveService(db);
    this.communicationService = new CommunicationService(db);
    this.progressTracker = new ProgressTracker(db);
  }

  /**
   * Get all progress reporting MCP tools
   */
  getTools(): McpTool[] {
    return [
      {
        name: "report_progress",
        description:
          "Report progress updates for agent objectives and status changes",
        inputSchema: zodToJsonSchema(ReportProgressSchema),
        outputSchema: zodToJsonSchema(ProgressReportResponseSchema),
        handler: this.reportProgress.bind(this),
      },
    ];
  }


  /**
   * Report progress and emit appropriate events
   */
  async reportProgress(
    args: any
  ): Promise<ProgressReportResponse> {
    const startTime = Date.now();
    try {
      // Map snake_case to camelCase for compatibility
      const normalizedArgs = {
        agentId: args.agentId || args.agent_id,
        repositoryPath: args.repositoryPath || args.repository_path,
        progressType: args.progressType || args.progress_type,
        message: args.message,
        objectiveId: args.objectiveId || args.objective_id,
        progressPercentage: args.progressPercentage || args.progress_percentage,
        results: args.results,
        error: args.error,
        roomId: args.roomId || args.room_id,
        broadcastToRoom: args.broadcastToRoom !== undefined ? args.broadcastToRoom : (args.broadcast_to_room !== undefined ? args.broadcast_to_room : true),
      };

      const {
        agentId,
        repositoryPath,
        progressType,
        message,
        objectiveId,
        progressPercentage,
        results,
        error,
        roomId,
        broadcastToRoom,
      } = ReportProgressSchema.parse(normalizedArgs);

      const resolvedPath = PathUtils.resolveRepositoryPath(
        repositoryPath,
        "ReportProgressTool"
      );
      const timestamp = new Date();

      // Validate agent exists
      const agent = await this.agentService.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Create progress report from flattened input
      const progressReport: ProgressReport = {
        agentId,
        repositoryPath: resolvedPath,
        progressType,
        message,
        metadata: {
          objectiveId,
          progressPercentage,
          results,
          error,
          timestamp: timestamp.toISOString(),
          roomId,
        },
      };

      // Handle different progress types
      switch (progressType) {
        case "status":
          await this.handleStatusProgress(progressReport);
          break;
        case "objective":
          await this.handleObjectiveProgress(progressReport);
          break;
        case "milestone":
          await this.handleMilestoneProgress(progressReport);
          break;
        case "error":
          await this.handleErrorProgress(progressReport);
          break;
        case "completion":
          await this.handleCompletionProgress(progressReport);
          break;
        default:
          logger.warn(`Unknown progress type: ${progressType}`);
      }

      // Broadcast to room if requested and agent has room assignment
      if (broadcastToRoom) {
        await this.broadcastProgressToRoom(progressReport, agent);
      }

      logger.info(
        `Progress reported for agent ${agentId}: ${progressType} - ${message}`
      );

      return createSuccessResponse(
        "Progress reported successfully",
        {
          progress_id: `${agentId}-${timestamp.getTime()}`,
          agent_id: agentId,
          progress_type: progressType,
          progress_percentage: progressPercentage,
          room_broadcast: broadcastToRoom,
          objective_id: objectiveId,
        },
        Date.now() - startTime
      );
    } catch (error) {
      logger.error("Failed to report progress:", error);
      return createErrorResponse(
        `Failed to report progress: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.message : String(error),
        "PROGRESS_REPORT_ERROR"
      );
    }
  }

  /**
   * Handle status progress updates
   */
  private async handleStatusProgress(report: ProgressReport): Promise<void> {
    const { agentId, repositoryPath } = report;

    // Get current agent status
    const agent = await this.agentService.getAgent(agentId);
    if (!agent) return;

    // Extract status information from metadata or infer from message
    const newStatus =
      (report.metadata?.newStatus as AgentStatus) || agent.status;
    const previousStatus =
      (report.metadata?.previousStatus as AgentStatus) || agent.status;

    // Update agent heartbeat
    await this.agentService.updateHeartbeat(agentId);

    // Emit agent status change event
    await eventBus.emit("agent_status_change", {
      agentId,
      previousStatus,
      newStatus,
      timestamp: new Date(),
      metadata: {
        progressMessage: report.message,
        ...report.metadata,
      },
      repositoryPath,
    });
  }

  /**
   * Handle task progress updates
   */
  private async handleObjectiveProgress(report: ProgressReport): Promise<void> {
    const { agentId, repositoryPath } = report;
    const { objectiveId, progressPercentage, newStatus, previousStatus } =
      report.metadata || {};

    if (!objectiveId) {
      logger.warn("Objective progress report missing objectiveId");
      return;
    }

    // Use ProgressTracker for MCP-compliant progress reporting
    let validatedProgress = progressPercentage;
    if (progressPercentage !== undefined) {
      try {
        const progressContext = {
          contextId: objectiveId,
          contextType: "objective" as const,
          repositoryPath,
          metadata: { objectiveId, agentId },
        };

        const progressReport = await this.progressTracker.reportAgentProgress(
          progressContext,
          agentId,
          progressPercentage,
          report.message
        );

        validatedProgress = progressReport.reportedProgress;

        logger.debug(
          `Objective progress validated: ${progressPercentage}% -> ${validatedProgress}%`,
          {
            objectiveId,
            agentId,
            actualProgress: progressPercentage,
            reportedProgress: validatedProgress,
          }
        );
      } catch (error) {
        logger.warn(
          "Failed to validate task progress with ProgressTracker:",
          error
        );
        // Fall back to capped progress
        validatedProgress = Math.min(Math.max(progressPercentage, 0), 100);
      }
    }

    // Update task progress if provided
    if (validatedProgress !== undefined) {
      await this.objectiveService.updateObjective(objectiveId, {
        progressPercentage: validatedProgress,
        notes: report.message,
      });
    }

    // Update task status if provided
    if (newStatus) {
      await this.objectiveService.updateObjective(objectiveId, {
        status: newStatus as ObjectiveStatus,
        notes: report.message,
      });
    }

    // Emit task update event
    await eventBus.emit("objective_update", {
      objectiveId,
      previousStatus: previousStatus as ObjectiveStatus,
      newStatus: newStatus as ObjectiveStatus,
      assignedAgentId: agentId,
      progressPercentage: validatedProgress,
      timestamp: new Date(),
      repositoryPath,
      metadata: {
        progressMessage: report.message,
        originalProgress: progressPercentage,
        validatedProgress,
        ...report.metadata,
      },
    });
  }

  /**
   * Handle milestone progress updates
   */
  private async handleMilestoneProgress(report: ProgressReport): Promise<void> {
    const { agentId, repositoryPath } = report;

    // Milestone progress is primarily for communication and logging
    // Store as system insight in knowledge graph if available
    try {
      // This would integrate with knowledge graph service if needed
      logger.info(`Milestone achieved by agent ${agentId}: ${report.message}`);

      // Emit as system warning for visibility
      await eventBus.emit("system_warning", {
        message: `Milestone: ${report.message}`,
        context: `Agent ${agentId}`,
        timestamp: new Date(),
        repositoryPath,
      });
    } catch (error) {
      logger.warn("Failed to store milestone progress:", error);
    }
  }

  /**
   * Handle error progress updates
   */
  private async handleErrorProgress(report: ProgressReport): Promise<void> {
    const { agentId, repositoryPath } = report;
    const { error, objectiveId } = report.metadata || {};

    // Create error object
    const errorObj = new Error(error || report.message);

    // Update task if provided
    if (objectiveId) {
      await this.objectiveService.updateObjective(objectiveId, {
        status: "failed",
        notes: `Error: ${report.message}`,
      });

      // Emit task update event
      await eventBus.emit("objective_update", {
        objectiveId,
        newStatus: "failed",
        assignedAgentId: agentId,
        timestamp: new Date(),
        repositoryPath,
        metadata: {
          error: report.message,
          ...report.metadata,
        },
      });
    }

    // Emit system error event
    await eventBus.emit("system_error", {
      error: errorObj,
      context: `Agent ${agentId}${objectiveId ? ` (Objective: ${objectiveId})` : ""}`,
      timestamp: new Date(),
      repositoryPath,
    });
  }

  /**
   * Handle completion progress updates
   */
  private async handleCompletionProgress(
    report: ProgressReport
  ): Promise<void> {
    const { agentId, repositoryPath } = report;
    const { objectiveId, results } = report.metadata || {};

    // Update task if provided
    if (objectiveId) {
      await this.objectiveService.updateObjective(objectiveId, {
        status: "completed",
        notes: report.message,
        results,
      });

      // Emit task completion event
      await eventBus.emit("objective_completed", {
        objectiveId,
        completedBy: agentId,
        results,
        timestamp: new Date(),
        repositoryPath,
      });
    }

    // Update agent status (could be completed or back to active)
    await this.agentService.updateAgentStatus(agentId, {
      status: "active", // Agent is available for new tasks
      metadata: {
        lastCompletedObjective: objectiveId,
        completionMessage: report.message,
        completionResults: results,
      },
    });
  }

  /**
   * Broadcast progress to agent's room if assigned
   */
  private async broadcastProgressToRoom(
    report: ProgressReport,
    agent: any
  ): Promise<void> {
    try {
      // Check if agent has a room assignment
      const roomId = report.metadata?.roomId || agent.agentMetadata?.roomId;
      const roomName = agent.agentMetadata?.roomName;

      if (!roomId && !roomName) {
        // No room assignment, skip broadcasting
        return;
      }

      // Get room information
      let room;
      if (roomId) {
        room = await this.communicationService.getRoomById(roomId);
      } else if (roomName) {
        room = await this.communicationService.getRoom(roomName);
      }

      if (!room) {
        logger.warn(`Agent ${agent.id} has room assignment but room not found`);
        return;
      }

      // Format progress message for room
      const progressMessage = this.formatProgressForRoom(report);

      // Send message to room
      await this.communicationService.sendMessage({
        roomName: room.name,
        agentName: agent.agentName,
        message: progressMessage,
        messageType: "status_update",
      });

      logger.debug(
        `Progress broadcasted to room ${room.name} for agent ${agent.id}`
      );
    } catch (error) {
      logger.warn("Failed to broadcast progress to room:", error);
    }
  }

  /**
   * Format progress report for room display
   */
  private formatProgressForRoom(report: ProgressReport): string {
    const { progressType, message } = report;
    const { objectiveId, progressPercentage, error } = report.metadata || {};

    const timestamp = new Date().toLocaleTimeString();
    const progressIcon = this.getProgressIcon(progressType);

    let formattedMessage = `${progressIcon} [${timestamp}] ${message}`;

    if (objectiveId) {
      formattedMessage += ` (Objective: ${objectiveId})`;
    }

    if (progressPercentage !== undefined) {
      formattedMessage += ` - ${progressPercentage}%`;
    }

    if (error) {
      formattedMessage += ` - Error: ${error}`;
    }

    return formattedMessage;
  }

  /**
   * Get icon for progress type
   */
  private getProgressIcon(progressType: string): string {
    switch (progressType) {
      case "status":
        return "🔄";
      case "task":
        return "📋";
      case "milestone":
        return "🎯";
      case "error":
        return "❌";
      case "completion":
        return "✅";
      default:
        return "📢";
    }
  }
}
