/**
 * ProgressTracker Service
 * 
 * Handles MCP-compliant progress reporting with strict requirements:
 * - Progress never exceeds 100%
 * - Progress always increases (monotonic)
 * - Multiple agents are averaged properly
 * - Tracks last reported progress to ensure compliance
 */

import { DatabaseManager } from '../database/index.js';
import { Logger } from '../utils/logger.js';
import { eventBus } from './EventBus.js';

const logger = new Logger('ProgressTracker');

export interface ProgressContext {
  contextId: string;
  contextType: 'agent' | 'orchestration' | 'objective' | 'monitoring';
  repositoryPath: string;
  metadata?: Record<string, any>;
}

export interface ProgressReport {
  contextId: string;
  agentId?: string;
  actualProgress: number;
  reportedProgress: number;
  timestamp: string;
  message?: string;
  metadata?: Record<string, any>;
}

export interface AggregatedProgress {
  totalProgress: number;
  agentCount: number;
  agentProgresses: Record<string, number>;
  lastReportedProgress: number;
  isMonotonic: boolean;
}

export class ProgressTracker {
  private progressCache = new Map<string, number>(); // contextId -> lastReportedProgress
  private agentProgressCache = new Map<string, Record<string, number>>(); // contextId -> agentId -> progress

  constructor(private db: DatabaseManager) {}

  /**
   * Report progress for a single agent in a context
   * Ensures progress never exceeds 100% and always increases
   */
  async reportAgentProgress(
    context: ProgressContext,
    agentId: string,
    actualProgress: number,
    message?: string
  ): Promise<ProgressReport> {
    try {
      const contextKey = this.getContextKey(context);
      
      // Validate and cap progress
      const cappedProgress = Math.min(Math.max(actualProgress, 0), 100);
      
      // Get current agent progresses for this context
      const agentProgresses = this.agentProgressCache.get(contextKey) || {};
      
      // Get last reported progress for this agent
      const lastAgentProgress = agentProgresses[agentId] || 0;
      
      // Ensure monotonic progress for this agent
      const monotonicProgress = Math.max(cappedProgress, lastAgentProgress);
      
      // Update agent progress cache
      agentProgresses[agentId] = monotonicProgress;
      this.agentProgressCache.set(contextKey, agentProgresses);
      
      // Calculate aggregated progress
      const aggregated = this.calculateAggregatedProgress(contextKey, agentProgresses);
      
      // Ensure overall progress is monotonic
      const lastReportedProgress = this.progressCache.get(contextKey) || 0;
      const reportedProgress = Math.max(aggregated.totalProgress, lastReportedProgress);
      
      // Update progress cache
      this.progressCache.set(contextKey, reportedProgress);
      
      const report: ProgressReport = {
        contextId: context.contextId,
        agentId,
        actualProgress: cappedProgress,
        reportedProgress,
        timestamp: new Date().toISOString(),
        message,
        metadata: {
          ...context.metadata,
          agentCount: aggregated.agentCount,
          agentProgresses: aggregated.agentProgresses,
          wasAdjustedForMonotonic: monotonicProgress !== cappedProgress,
          aggregatedProgress: aggregated.totalProgress,
          lastReportedProgress
        }
      };
      
      logger.debug(`Progress reported for agent ${agentId} in context ${contextKey}`, {
        actualProgress: cappedProgress,
        reportedProgress,
        agentCount: aggregated.agentCount,
        aggregatedProgress: aggregated.totalProgress
      });
      
      // Emit EventBus event for internal monitoring
      try {
        await eventBus.emit('progress_update', {
          contextId: context.contextId,
          contextType: context.contextType,
          agentId,
          actualProgress: cappedProgress,
          reportedProgress,
          message,
          timestamp: new Date(report.timestamp),
          repositoryPath: context.repositoryPath,
          metadata: report.metadata
        });
      } catch (eventError) {
        logger.error('Failed to emit progress event:', eventError);
      }
      
      return report;
      
    } catch (error) {
      logger.error('Failed to report agent progress:', error);
      throw error;
    }
  }

  /**
   * Report progress for a context without specific agent
   * Used for monitoring and orchestration progress
   */
  async reportContextProgress(
    context: ProgressContext,
    actualProgress: number,
    message?: string
  ): Promise<ProgressReport> {
    try {
      const contextKey = this.getContextKey(context);
      
      // Validate and cap progress
      const cappedProgress = Math.min(Math.max(actualProgress, 0), 100);
      
      // Get last reported progress
      const lastReportedProgress = this.progressCache.get(contextKey) || 0;
      
      // Ensure monotonic progress
      const reportedProgress = Math.max(cappedProgress, lastReportedProgress);
      
      // Update progress cache
      this.progressCache.set(contextKey, reportedProgress);
      
      const report: ProgressReport = {
        contextId: context.contextId,
        actualProgress: cappedProgress,
        reportedProgress,
        timestamp: new Date().toISOString(),
        message,
        metadata: {
          ...context.metadata,
          wasAdjustedForMonotonic: reportedProgress !== cappedProgress,
          lastReportedProgress
        }
      };
      
      logger.debug(`Context progress reported for ${contextKey}`, {
        actualProgress: cappedProgress,
        reportedProgress,
        lastReportedProgress
      });
      
      // Emit EventBus event for internal monitoring
      try {
        await eventBus.emit('progress_update', {
          contextId: context.contextId,
          contextType: context.contextType,
          actualProgress: cappedProgress,
          reportedProgress,
          message,
          timestamp: new Date(report.timestamp),
          repositoryPath: context.repositoryPath,
          metadata: report.metadata
        });
      } catch (eventError) {
        logger.error('Failed to emit progress event:', eventError);
      }
      
      return report;
      
    } catch (error) {
      logger.error('Failed to report context progress:', error);
      throw error;
    }
  }

  /**
   * Get current aggregated progress for a context
   */
  async getContextProgress(context: ProgressContext): Promise<AggregatedProgress> {
    const contextKey = this.getContextKey(context);
    const agentProgresses = this.agentProgressCache.get(contextKey) || {};
    const lastReportedProgress = this.progressCache.get(contextKey) || 0;
    
    const aggregated = this.calculateAggregatedProgress(contextKey, agentProgresses);
    
    return {
      ...aggregated,
      lastReportedProgress,
      isMonotonic: aggregated.totalProgress >= lastReportedProgress
    };
  }

  /**
   * Reset progress for a context (use with caution)
   */
  async resetProgress(context: ProgressContext): Promise<void> {
    const contextKey = this.getContextKey(context);
    this.progressCache.delete(contextKey);
    this.agentProgressCache.delete(contextKey);
    
    logger.info(`Progress reset for context ${contextKey}`);
  }

  /**
   * Get all active progress contexts
   */
  async getActiveContexts(): Promise<string[]> {
    return Array.from(this.progressCache.keys());
  }

  /**
   * Clean up old progress data
   */
  async cleanupOldProgress(maxAgeMinutes: number = 60): Promise<void> {
    // For now, we'll keep all progress in memory
    // In a production system, this would clean up old database records
    logger.debug(`Cleanup requested for progress older than ${maxAgeMinutes} minutes`);
  }

  /**
   * Private helper methods
   */

  private getContextKey(context: ProgressContext): string {
    return `${context.contextType}:${context.contextId}:${context.repositoryPath}`;
  }

  private calculateAggregatedProgress(contextKey: string, agentProgresses: Record<string, number>): AggregatedProgress {
    const progressValues = Object.values(agentProgresses);
    const agentCount = progressValues.length;
    
    if (agentCount === 0) {
      return {
        totalProgress: 0,
        agentCount: 0,
        agentProgresses: {},
        lastReportedProgress: 0,
        isMonotonic: true
      };
    }
    
    // Calculate average progress
    const totalProgress = progressValues.reduce((sum, progress) => sum + progress, 0) / agentCount;
    const cappedTotalProgress = Math.min(totalProgress, 100);
    
    return {
      totalProgress: cappedTotalProgress,
      agentCount,
      agentProgresses: { ...agentProgresses },
      lastReportedProgress: this.progressCache.get(contextKey) || 0,
      isMonotonic: cappedTotalProgress >= (this.progressCache.get(contextKey) || 0)
    };
  }

  /**
   * Create an MCP-compliant progress notification
   * Converts percentage-based progress to MCP integer format
   */
  createMcpProgressNotification(
    progressToken: string | number,
    report: ProgressReport,
    total: number = 100
  ): any {
    // Convert percentage (0-100) to current steps out of total
    const currentStep = Math.round((report.reportedProgress / 100) * total);
    
    return {
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: currentStep,
        total,
        message: report.message || `Progress: ${report.reportedProgress.toFixed(1)}%`
      }
    };
  }

  /**
   * Create a progress update function for MCP contexts
   */
  createMcpProgressUpdater(
    context: ProgressContext,
    progressToken: string | number,
    sendNotification: (notification: any) => Promise<void>,
    agentId?: string
  ): (actualProgress: number, message?: string) => Promise<void> {
    return async (actualProgress: number, message?: string) => {
      try {
        const report = agentId 
          ? await this.reportAgentProgress(context, agentId, actualProgress, message)
          : await this.reportContextProgress(context, actualProgress, message);
        
        const notification = this.createMcpProgressNotification(progressToken, report);
        await sendNotification(notification);
      } catch (error) {
        logger.error('Failed to send MCP progress update:', error);
      }
    };
  }
}