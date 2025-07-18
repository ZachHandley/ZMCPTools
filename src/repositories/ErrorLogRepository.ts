import { eq, and, or, like, gt, gte, lt, lte, desc, asc, isNull, isNotNull } from 'drizzle-orm';
import { BaseRepository, createRepositoryConfig } from './index.js';
import { DatabaseManager } from '../database/index.js';
import {
  errorLogs,
  insertErrorLogSchema,
  selectErrorLogSchema,
  updateErrorLogSchema,
  type ErrorLog,
  type NewErrorLog,
  type ErrorLogUpdate,
  type ErrorType,
  type ErrorCategory,
  type ResolutionStatus,
  type Severity,
} from '../schemas/index.js';

/**
 * Repository for managing error logs
 * 
 * Provides type-safe CRUD operations and error analysis methods
 */
export class ErrorLogRepository extends BaseRepository<
  typeof errorLogs,
  ErrorLog,
  NewErrorLog,
  ErrorLogUpdate
> {
  constructor(drizzleManager: DatabaseManager) {
    super(drizzleManager, createRepositoryConfig(
      errorLogs,
      errorLogs.id,
      insertErrorLogSchema,
      selectErrorLogSchema,
      updateErrorLogSchema,
      'error-log-repository'
    ));
  }

  /**
   * Find error logs by repository path
   */
  async findByRepositoryPath(repositoryPath: string): Promise<ErrorLog[]> {
    return this.query()
      .where(eq(errorLogs.repositoryPath, repositoryPath))
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find error logs by agent ID
   */
  async findByAgentId(agentId: string): Promise<ErrorLog[]> {
    return this.query()
      .where(eq(errorLogs.agentId, agentId))
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find error logs by task ID
   */
  async findByObjectiveId(objectiveId: string): Promise<ErrorLog[]> {
    return this.query()
      .where(eq(errorLogs.objectiveId, objectiveId))
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find error logs by error type
   */
  async findByErrorType(errorType: ErrorType, repositoryPath?: string): Promise<ErrorLog[]> {
    const conditions = [eq(errorLogs.errorType, errorType)];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find error logs by error category
   */
  async findByErrorCategory(errorCategory: ErrorCategory, repositoryPath?: string): Promise<ErrorLog[]> {
    const conditions = [eq(errorLogs.errorCategory, errorCategory)];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find error logs by resolution status
   */
  async findByResolutionStatus(
    resolutionStatus: ResolutionStatus, 
    repositoryPath?: string
  ): Promise<ErrorLog[]> {
    const conditions = [eq(errorLogs.resolutionStatus, resolutionStatus)];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find error logs by severity
   */
  async findBySeverity(severity: Severity, repositoryPath?: string): Promise<ErrorLog[]> {
    const conditions = [eq(errorLogs.severity, severity)];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find unresolved errors
   */
  async findUnresolved(repositoryPath?: string, severity?: Severity): Promise<ErrorLog[]> {
    const conditions = [eq(errorLogs.resolutionStatus, 'unresolved')];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    if (severity) {
      conditions.push(eq(errorLogs.severity, severity));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find critical unresolved errors
   */
  async findCriticalUnresolved(repositoryPath?: string): Promise<ErrorLog[]> {
    return this.findUnresolved(repositoryPath, 'critical');
  }

  /**
   * Search error logs by message content
   */
  async searchByMessage(
    searchTerm: string, 
    repositoryPath?: string,
    errorCategory?: ErrorCategory
  ): Promise<ErrorLog[]> {
    const searchPattern = `%${searchTerm}%`;
    const conditions = [
      or(
        like(errorLogs.errorMessage, searchPattern),
        like(errorLogs.errorDetails, searchPattern)
      )
    ];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    if (errorCategory) {
      conditions.push(eq(errorLogs.errorCategory, errorCategory));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find recent errors (last N hours)
   */
  async findRecent(
    hours = 24, 
    repositoryPath?: string,
    severity?: Severity
  ): Promise<ErrorLog[]> {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const conditions = [gt(errorLogs.createdAt, cutoffDate)];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    if (severity) {
      conditions.push(eq(errorLogs.severity, severity));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find errors by pattern ID (grouped errors)
   */
  async findByPatternId(patternId: string): Promise<ErrorLog[]> {
    return this.query()
      .where(eq(errorLogs.patternId, patternId))
      .orderBy(errorLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find errors that need attention (unresolved, high/critical severity)
   */
  async findNeedingAttention(repositoryPath?: string): Promise<ErrorLog[]> {
    const conditions = [
      eq(errorLogs.resolutionStatus, 'unresolved'),
      or(
        eq(errorLogs.severity, 'high'),
        eq(errorLogs.severity, 'critical')
      )
    ];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = and(...conditions);

    return this.query()
      .where(whereClause)
      .orderBy(errorLogs.severity, 'desc')
      .execute();
  }

  /**
   * Update error resolution status
   */
  async updateResolution(
    id: string, 
    resolutionStatus: ResolutionStatus,
    resolutionDetails?: string
  ): Promise<ErrorLog | null> {
    const updateData: Partial<ErrorLogUpdate> = {
      resolutionStatus,
    };

    if (resolutionDetails) {
      updateData.resolutionDetails = resolutionDetails;
    }

    if (resolutionStatus === 'resolved') {
      updateData.resolvedAt = new Date().toISOString();
    }

    return this.update(id, updateData as ErrorLogUpdate);
  }

  /**
   * Mark error as resolved
   */
  async markResolved(id: string, resolutionDetails?: string): Promise<ErrorLog | null> {
    return this.updateResolution(id, 'resolved', resolutionDetails);
  }

  /**
   * Mark error as in progress
   */
  async markInProgress(id: string, resolutionDetails?: string): Promise<ErrorLog | null> {
    return this.updateResolution(id, 'in_progress', resolutionDetails);
  }

  /**
   * Mark error as workaround applied
   */
  async markWorkaround(id: string, resolutionDetails: string): Promise<ErrorLog | null> {
    return this.updateResolution(id, 'workaround', resolutionDetails);
  }

  /**
   * Update error pattern ID (for grouping similar errors)
   */
  async updatePatternId(id: string, patternId: string): Promise<ErrorLog | null> {
    return this.update(id, { patternId } as ErrorLogUpdate);
  }

  /**
   * Get error statistics
   */
  async getErrorStats(repositoryPath?: string): Promise<{
    total: number;
    unresolved: number;
    resolved: number;
    byType: Record<ErrorType, number>;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<Severity, number>;
    byStatus: Record<ResolutionStatus, number>;
    recentCount: number;
  }> {
    const conditions = [];
    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 0 ? conditions[0] : undefined;
    const result = await this.list({ where: whereClause });
    const logs = result.data;

    const stats = {
      total: logs.length,
      unresolved: 0,
      resolved: 0,
      byType: {} as Record<ErrorType, number>,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<Severity, number>,
      byStatus: {} as Record<ResolutionStatus, number>,
      recentCount: 0,
    };

    // Initialize counters
    const errorTypes: ErrorType[] = ['runtime', 'compilation', 'network', 'filesystem', 'authentication', 'permission', 'validation', 'configuration', 'dependency', 'timeout', 'memory', 'system'];
    const errorCategories: ErrorCategory[] = ['mcp_tool', 'agent_spawn', 'objective_execution', 'web_scraping', 'database', 'communication', 'file_operation', 'external_service', 'user_input', 'system_resource'];
    const severities: Severity[] = ['low', 'medium', 'high', 'critical'];
    const statuses: ResolutionStatus[] = ['unresolved', 'in_progress', 'resolved', 'workaround', 'ignored', 'duplicate'];

    errorTypes.forEach(type => stats.byType[type] = 0);
    errorCategories.forEach(category => stats.byCategory[category] = 0);
    severities.forEach(severity => stats.bySeverity[severity] = 0);
    statuses.forEach(status => stats.byStatus[status] = 0);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    logs.forEach(log => {
      // Count by type
      stats.byType[log.errorType] = (stats.byType[log.errorType] || 0) + 1;

      // Count by category
      stats.byCategory[log.errorCategory] = (stats.byCategory[log.errorCategory] || 0) + 1;

      // Count by severity
      stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;

      // Count by status
      stats.byStatus[log.resolutionStatus] = (stats.byStatus[log.resolutionStatus] || 0) + 1;

      // Count resolved vs unresolved
      if (log.resolutionStatus === 'resolved') {
        stats.resolved++;
      } else {
        stats.unresolved++;
      }

      // Count recent errors
      if (new Date(log.createdAt) > twentyFourHoursAgo) {
        stats.recentCount++;
      }
    });

    return stats;
  }

  /**
   * Find error patterns (similar errors that can be grouped)
   */
  async findErrorPatterns(repositoryPath?: string): Promise<{
    pattern: string;
    count: number;
    errorType: ErrorType;
    errorCategory: ErrorCategory;
    severity: Severity;
    firstOccurrence: string;
    lastOccurrence: string;
    sampleErrorId: string;
  }[]> {
    const conditions = [];
    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 0 ? conditions[0] : undefined;
    const result = await this.list({ where: whereClause });
    const logs = result.data;

    const patterns: Record<string, any> = {};

    logs.forEach(log => {
      // Create a pattern key based on error message (simplified pattern matching)
      // In a real implementation, you might want more sophisticated pattern detection
      const patternKey = log.errorMessage.substring(0, 100); // First 100 chars as pattern
      const key = `${log.errorType}:${log.errorCategory}:${patternKey}`;

      if (!patterns[key]) {
        patterns[key] = {
          pattern: patternKey,
          count: 0,
          errorType: log.errorType,
          errorCategory: log.errorCategory,
          severity: log.severity,
          firstOccurrence: log.createdAt,
          lastOccurrence: log.createdAt,
          sampleErrorId: log.id,
        };
      }

      patterns[key].count++;

      // Update first and last occurrence
      if (new Date(log.createdAt) < new Date(patterns[key].firstOccurrence)) {
        patterns[key].firstOccurrence = log.createdAt;
      }
      if (new Date(log.createdAt) > new Date(patterns[key].lastOccurrence)) {
        patterns[key].lastOccurrence = log.createdAt;
        patterns[key].sampleErrorId = log.id; // Keep the most recent as sample
      }

      // Update severity to the highest seen
      const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      if (severityOrder[log.severity] > severityOrder[patterns[key].severity]) {
        patterns[key].severity = log.severity;
      }
    });

    return Object.values(patterns)
      .filter((p: any) => p.count > 1) // Only return patterns with multiple occurrences
      .sort((a: any, b: any) => b.count - a.count);
  }

  /**
   * Get error resolution trends
   */
  async getResolutionTrends(repositoryPath?: string, days = 30): Promise<{
    date: string;
    created: number;
    resolved: number;
    backlog: number;
  }[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const conditions = [gt(errorLogs.createdAt, cutoffDate)];

    if (repositoryPath) {
      conditions.push(eq(errorLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const logs = await this.query()
      .where(whereClause)
      .orderBy(errorLogs.createdAt, 'asc')
      .execute();

    const dailyStats: Record<string, any> = {};
    let runningBacklog = 0;

    logs.forEach(log => {
      const createdDate = new Date(log.createdAt).toISOString().split('T')[0];
      const resolvedDate = log.resolvedAt ? new Date(log.resolvedAt).toISOString().split('T')[0] : null;

      // Initialize date if not exists
      if (!dailyStats[createdDate]) {
        dailyStats[createdDate] = { date: createdDate, created: 0, resolved: 0, backlog: 0 };
      }

      // Count created errors
      dailyStats[createdDate].created++;
      runningBacklog++;

      // Count resolved errors
      if (resolvedDate && dailyStats[resolvedDate]) {
        dailyStats[resolvedDate].resolved++;
        runningBacklog--;
      } else if (resolvedDate) {
        dailyStats[resolvedDate] = { date: resolvedDate, created: 0, resolved: 1, backlog: 0 };
        runningBacklog--;
      }
    });

    // Set running backlog for each day
    let currentBacklog = 0;
    return Object.values(dailyStats)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((daily: any) => {
        currentBacklog += daily.created - daily.resolved;
        return {
          date: daily.date,
          created: daily.created,
          resolved: daily.resolved,
          backlog: currentBacklog,
        };
      });
  }

  /**
   * Cleanup old resolved errors
   */
  async cleanupOldResolved(days = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const oldResolvedErrors = await this.query()
      .where(and(
        eq(errorLogs.resolutionStatus, 'resolved'),
        isNotNull(errorLogs.resolvedAt),
        lt(errorLogs.resolvedAt, cutoffDate)
      ))
      .execute();

    let deletedCount = 0;
    
    // Delete each error individually to ensure proper logging
    for (const error of oldResolvedErrors) {
      const deleted = await this.delete(error.id);
      if (deleted) {
        deletedCount++;
      }
    }

    this.logger.info('Cleaned up old resolved errors', { 
      deletedCount, 
      cutoffDate,
      daysOld: days 
    });
    
    return deletedCount;
  }
}