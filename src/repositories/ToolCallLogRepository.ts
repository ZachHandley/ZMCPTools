import { eq, and, or, like, gt, gte, lt, lte, desc, asc } from 'drizzle-orm';
import { BaseRepository, createRepositoryConfig } from './index.js';
import { DatabaseManager } from '../database/index.js';
import {
  toolCallLogs,
  insertToolCallLogSchema,
  selectToolCallLogSchema,
  type ToolCallLog,
  type NewToolCallLog,
  type ToolCallStatus,
} from '../schemas/index.js';

// Since there's no update schema defined, we'll create a partial type
type ToolCallLogUpdate = Partial<Omit<NewToolCallLog, 'id'>>;

/**
 * Repository for managing tool call logs
 * 
 * Provides type-safe CRUD operations and tool usage analytics
 */
export class ToolCallLogRepository extends BaseRepository<
  typeof toolCallLogs,
  ToolCallLog,
  NewToolCallLog,
  ToolCallLogUpdate
> {
  constructor(drizzleManager: DatabaseManager) {
    super(drizzleManager, createRepositoryConfig(
      toolCallLogs,
      toolCallLogs.id,
      insertToolCallLogSchema,
      selectToolCallLogSchema,
      // Use partial schema for updates since no update schema is defined
      insertToolCallLogSchema.partial().omit({ id: true }),
      'tool-call-log-repository'
    ));
  }

  /**
   * Find tool calls by repository path
   */
  async findByRepositoryPath(repositoryPath: string): Promise<ToolCallLog[]> {
    return this.query()
      .where(eq(toolCallLogs.repositoryPath, repositoryPath))
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find tool calls by agent ID
   */
  async findByAgentId(agentId: string): Promise<ToolCallLog[]> {
    return this.query()
      .where(eq(toolCallLogs.agentId, agentId))
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find tool calls by objective ID
   */
  async findByObjectiveId(objectiveId: string): Promise<ToolCallLog[]> {
    return this.query()
      .where(eq(toolCallLogs.objectiveId, objectiveId))
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find tool calls by tool name
   */
  async findByToolName(toolName: string, repositoryPath?: string): Promise<ToolCallLog[]> {
    const conditions = [eq(toolCallLogs.toolName, toolName)];

    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find tool calls by status
   */
  async findByStatus(status: ToolCallStatus, repositoryPath?: string): Promise<ToolCallLog[]> {
    const conditions = [eq(toolCallLogs.status, status)];

    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find failed tool calls
   */
  async findFailed(repositoryPath?: string, toolName?: string): Promise<ToolCallLog[]> {
    const conditions = [eq(toolCallLogs.status, 'error')];

    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    if (toolName) {
      conditions.push(eq(toolCallLogs.toolName, toolName));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Find slow tool calls (execution time above threshold)
   */
  async findSlow(
    minExecutionTimeSeconds: number, 
    repositoryPath?: string,
    toolName?: string
  ): Promise<ToolCallLog[]> {
    const conditions = [gte(toolCallLogs.executionTime, minExecutionTimeSeconds)];

    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    if (toolName) {
      conditions.push(eq(toolCallLogs.toolName, toolName));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.executionTime, 'desc')
      .execute();
  }

  /**
   * Find recent tool calls (last N hours)
   */
  async findRecent(
    hours = 24, 
    repositoryPath?: string,
    agentId?: string
  ): Promise<ToolCallLog[]> {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const conditions = [gt(toolCallLogs.createdAt, cutoffDate)];

    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    if (agentId) {
      conditions.push(eq(toolCallLogs.agentId, agentId));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    return this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Search tool calls by error message
   */
  async searchByError(
    errorPattern: string, 
    repositoryPath?: string
  ): Promise<ToolCallLog[]> {
    const searchPattern = `%${errorPattern}%`;
    const conditions = [
      eq(toolCallLogs.status, 'error'),
      like(toolCallLogs.errorMessage, searchPattern)
    ];

    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    const whereClause = and(...conditions);

    return this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();
  }

  /**
   * Get tool usage statistics
   */
  async getToolUsageStats(repositoryPath?: string): Promise<{
    totalCalls: number;
    uniqueTools: number;
    successRate: number;
    avgExecutionTime: number;
    toolCounts: Record<string, number>;
    statusCounts: Record<ToolCallStatus, number>;
    dailyUsage: Record<string, number>;
  }> {
    const conditions = [];
    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 0 ? conditions[0] : undefined;
    const result = await this.list({ where: whereClause });
    const logs = result.data;

    const stats = {
      totalCalls: logs.length,
      uniqueTools: 0,
      successRate: 0,
      avgExecutionTime: 0,
      toolCounts: {} as Record<string, number>,
      statusCounts: {} as Record<ToolCallStatus, number>,
      dailyUsage: {} as Record<string, number>,
    };

    if (logs.length === 0) {
      return stats;
    }

    const uniqueTools = new Set<string>();
    let successfulCalls = 0;
    let totalExecutionTime = 0;
    let callsWithExecutionTime = 0;

    const statusValues: ToolCallStatus[] = ['success', 'error', 'timeout', 'cancelled', 'retried'];
    
    // Initialize status counts
    statusValues.forEach(status => {
      stats.statusCounts[status] = 0;
    });

    logs.forEach(log => {
      // Count unique tools
      uniqueTools.add(log.toolName);

      // Count tool usage
      stats.toolCounts[log.toolName] = (stats.toolCounts[log.toolName] || 0) + 1;

      // Count statuses
      stats.statusCounts[log.status] = (stats.statusCounts[log.status] || 0) + 1;

      // Count successful calls
      if (log.status === 'success') {
        successfulCalls++;
      }

      // Sum execution times
      if (log.executionTime !== null && log.executionTime !== undefined) {
        totalExecutionTime += log.executionTime;
        callsWithExecutionTime++;
      }

      // Count daily usage
      const date = new Date(log.createdAt).toISOString().split('T')[0];
      stats.dailyUsage[date] = (stats.dailyUsage[date] || 0) + 1;
    });

    stats.uniqueTools = uniqueTools.size;
    stats.successRate = successfulCalls / logs.length;
    stats.avgExecutionTime = callsWithExecutionTime > 0 ? totalExecutionTime / callsWithExecutionTime : 0;

    return stats;
  }

  /**
   * Get agent performance statistics
   */
  async getAgentPerformanceStats(repositoryPath: string): Promise<{
    agentId: string;
    totalCalls: number;
    successRate: number;
    avgExecutionTime: number;
    mostUsedTool: string;
  }[]> {
    const logs = await this.findByRepositoryPath(repositoryPath);
    const agentStats: Record<string, any> = {};

    logs.forEach(log => {
      if (!agentStats[log.agentId]) {
        agentStats[log.agentId] = {
          agentId: log.agentId,
          totalCalls: 0,
          successfulCalls: 0,
          totalExecutionTime: 0,
          callsWithExecutionTime: 0,
          toolCounts: {} as Record<string, number>,
        };
      }

      const agent = agentStats[log.agentId];
      agent.totalCalls++;

      if (log.status === 'success') {
        agent.successfulCalls++;
      }

      if (log.executionTime !== null && log.executionTime !== undefined) {
        agent.totalExecutionTime += log.executionTime;
        agent.callsWithExecutionTime++;
      }

      agent.toolCounts[log.toolName] = (agent.toolCounts[log.toolName] || 0) + 1;
    });

    return Object.values(agentStats).map((agent: any) => ({
      agentId: agent.agentId,
      totalCalls: agent.totalCalls,
      successRate: agent.successfulCalls / agent.totalCalls,
      avgExecutionTime: agent.callsWithExecutionTime > 0 
        ? agent.totalExecutionTime / agent.callsWithExecutionTime 
        : 0,
      mostUsedTool: Object.entries(agent.toolCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || '',
    }));
  }

  /**
   * Find error patterns in tool calls
   */
  async findErrorPatterns(repositoryPath?: string): Promise<{
    errorMessage: string;
    toolName: string;
    count: number;
    lastOccurrence: string;
  }[]> {
    const conditions = [eq(toolCallLogs.status, 'error')];
    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const errorLogs = await this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.createdAt, 'desc')
      .execute();

    const patterns: Record<string, any> = {};

    errorLogs.forEach(log => {
      if (!log.errorMessage) return;

      const key = `${log.toolName}:${log.errorMessage}`;
      if (!patterns[key]) {
        patterns[key] = {
          errorMessage: log.errorMessage,
          toolName: log.toolName,
          count: 0,
          lastOccurrence: log.createdAt,
        };
      }

      patterns[key].count++;
      
      // Keep the most recent occurrence
      if (new Date(log.createdAt) > new Date(patterns[key].lastOccurrence)) {
        patterns[key].lastOccurrence = log.createdAt;
      }
    });

    return Object.values(patterns)
      .sort((a: any, b: any) => b.count - a.count);
  }

  /**
   * Cleanup old tool call logs
   */
  async cleanupOldLogs(days = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const oldLogs = await this.query()
      .where(lt(toolCallLogs.createdAt, cutoffDate))
      .execute();

    let deletedCount = 0;
    
    // Delete each log individually to ensure proper logging
    for (const log of oldLogs) {
      const deleted = await this.delete(log.id);
      if (deleted) {
        deletedCount++;
      }
    }

    this.logger.info('Cleaned up old tool call logs', { 
      deletedCount, 
      cutoffDate,
      daysOld: days 
    });
    
    return deletedCount;
  }

  /**
   * Get performance trends over time
   */
  async getPerformanceTrends(
    repositoryPath?: string,
    toolName?: string,
    days = 30
  ): Promise<{
    date: string;
    totalCalls: number;
    successRate: number;
    avgExecutionTime: number;
  }[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const conditions = [gt(toolCallLogs.createdAt, cutoffDate)];

    if (repositoryPath) {
      conditions.push(eq(toolCallLogs.repositoryPath, repositoryPath));
    }

    if (toolName) {
      conditions.push(eq(toolCallLogs.toolName, toolName));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const logs = await this.query()
      .where(whereClause)
      .orderBy(toolCallLogs.createdAt, 'asc')
      .execute();

    const dailyStats: Record<string, any> = {};

    logs.forEach(log => {
      const date = new Date(log.createdAt).toISOString().split('T')[0];
      
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          totalCalls: 0,
          successfulCalls: 0,
          totalExecutionTime: 0,
          callsWithExecutionTime: 0,
        };
      }

      const daily = dailyStats[date];
      daily.totalCalls++;

      if (log.status === 'success') {
        daily.successfulCalls++;
      }

      if (log.executionTime !== null && log.executionTime !== undefined) {
        daily.totalExecutionTime += log.executionTime;
        daily.callsWithExecutionTime++;
      }
    });

    return Object.values(dailyStats).map((daily: any) => ({
      date: daily.date,
      totalCalls: daily.totalCalls,
      successRate: daily.successfulCalls / daily.totalCalls,
      avgExecutionTime: daily.callsWithExecutionTime > 0 
        ? daily.totalExecutionTime / daily.callsWithExecutionTime 
        : 0,
    }));
  }
}