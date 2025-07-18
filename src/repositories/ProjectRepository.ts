import { eq, and, or, desc, asc, like, gt, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BaseRepository, createRepositoryConfig, type ListOptions, type PaginatedResult } from './index.js';
import { DatabaseManager } from '../database/index.js';
import {
  projects,
  insertProjectSchema,
  selectProjectSchema,
  updateProjectSchema,
  projectFilterSchema,
  type ProjectFilter,
  type ProjectRegistration,
  type Project,
  type NewProject,
  type ProjectUpdate,
  projectStatusSchema,
  mcpServerTypeSchema,
} from '../schemas/projects.js';
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type McpServerType = z.infer<typeof mcpServerTypeSchema>;

/**
 * Repository for managing project registration and lifecycle
 * Handles CRUD operations for MCP server projects with filtering and search capabilities
 */
export class ProjectRepository extends BaseRepository<
  typeof projects,
  Project,
  NewProject,
  ProjectUpdate
> {
  constructor(databaseManager: DatabaseManager) {
    super(databaseManager, createRepositoryConfig(
      projects,
      projects.id,
      insertProjectSchema as any,
      selectProjectSchema as any,
      updateProjectSchema as any,
      'project-repository'
    ));
  }

  /**
   * Find projects by repository path
   */
  async findByRepositoryPath(repositoryPath: string): Promise<Project[]> {
    try {
      return this.drizzleManager.transaction((tx) => {
        const results = tx
          .select()
          .from(projects)
          .where(eq(projects.repositoryPath, repositoryPath))
          .orderBy(desc(projects.lastHeartbeat))
          .all();

        return results.map(result => this.selectSchema.parse(result));
      });
    } catch (error) {
      this.logger.error('Error finding projects by repository path', {
        repositoryPath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Find active projects with optional filtering
   */
  async findActiveProjects(filter?: ProjectFilter): Promise<Project[]> {
    try {
      const db = this.drizzle;
      
      // Build where conditions
      const conditions = [
        or(
          eq(projects.status, 'active'),
          eq(projects.status, 'connected')
        )
      ];

      // Apply filters
      if (filter?.mcpServerType) {
        conditions.push(eq(projects.mcpServerType, filter.mcpServerType));
      }

      if (filter?.webUiEnabled !== undefined) {
        conditions.push(eq(projects.webUiEnabled, filter.webUiEnabled));
      }

      // Apply pagination
      const limit = filter?.limit || 50;
      const offset = filter?.offset || 0;
      
      const results = await db
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(desc(projects.lastHeartbeat))
        .limit(limit)
        .offset(offset);

      return results.map(result => this.selectSchema.parse(result));
    } catch (error) {
      this.logger.error('Error finding active projects', {
        filter,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Find projects by status
   */
  async findByStatus(status: ProjectStatus, options?: ListOptions): Promise<PaginatedResult<Project>> {
    const whereClause = eq(projects.status, status);
    return this.list({
      ...options,
      where: whereClause,
      orderBy: options?.orderBy || desc(projects.lastHeartbeat)
    });
  }

  /**
   * Find projects by MCP server PID
   */
  async findByPid(pid: number): Promise<Project | null> {
    try {
      const db = this.drizzle;
      const results = await db
        .select()
        .from(projects)
        .where(eq(projects.mcpServerPid, pid))
        .limit(1);

      if (results.length === 0) {
        return null;
      }

      return this.selectSchema.parse(results[0]);
    } catch (error) {
      this.logger.error('Error finding project by PID', {
        pid,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Find projects by port
   */
  async findByPort(port: number): Promise<Project | null> {
    try {
      const db = this.drizzle;
      const results = await db
        .select()
        .from(projects)
        .where(eq(projects.mcpServerPort, port))
        .limit(1);

      if (results.length === 0) {
        return null;
      }

      return this.selectSchema.parse(results[0]);
    } catch (error) {
      this.logger.error('Error finding project by port', {
        port,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Update heartbeat timestamp for a project
   */
  async updateHeartbeat(projectId: string, status?: ProjectStatus): Promise<Project | null> {
    try {
      const now = new Date().toISOString();
      const updateData: any = {
        lastHeartbeat: now,
        updatedAt: now,
      };

      if (status) {
        updateData.status = status;
      }

      return this.update(projectId, updateData);
    } catch (error) {
      this.logger.error('Error updating project heartbeat', {
        projectId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Find stale projects that haven't sent heartbeat recently
   */
  async findStaleProjects(staleMinutes: number = 30): Promise<Project[]> {
    try {
      const db = this.drizzle;
      const staleTime = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
      
      const results = await db
        .select()
        .from(projects)
        .where(
          and(
            or(
              eq(projects.status, 'active'),
              eq(projects.status, 'connected')
            ),
            lt(projects.lastHeartbeat, staleTime)
          )
        )
        .orderBy(asc(projects.lastHeartbeat));

      return results.map(result => this.selectSchema.parse(result));
    } catch (error) {
      this.logger.error('Error finding stale projects', {
        staleMinutes,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Mark project as disconnected
   */
  async markAsDisconnected(projectId: string): Promise<Project | null> {
    try {
      const now = new Date().toISOString();
      return this.update(projectId, {
        status: 'disconnected',
        endTime: now,
        updatedAt: now,
      } as any);
    } catch (error) {
      this.logger.error('Error marking project as disconnected', {
        projectId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get project statistics
   */
  async getProjectStats(): Promise<{
    total: number;
    active: number;
    connected: number;
    disconnected: number;
    inactive: number;
    error: number;
    byServerType: Record<string, number>;
  }> {
    try {
      const db = this.drizzle;
      
      // Get total count
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(projects);
      const total = totalResult[0].count;

      // Get counts by status
      const statusResults = await db
        .select({
          status: projects.status,
          count: sql<number>`count(*)`
        })
        .from(projects)
        .groupBy(projects.status);

      const statusCounts = statusResults.reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {} as Record<string, number>);

      // Get counts by server type
      const serverTypeResults = await db
        .select({
          serverType: projects.mcpServerType,
          count: sql<number>`count(*)`
        })
        .from(projects)
        .groupBy(projects.mcpServerType);

      const byServerType = serverTypeResults.reduce((acc, row) => {
        acc[row.serverType] = row.count;
        return acc;
      }, {} as Record<string, number>);

      return {
        total,
        active: statusCounts['active'] || 0,
        connected: statusCounts['connected'] || 0,
        disconnected: statusCounts['disconnected'] || 0,
        inactive: statusCounts['inactive'] || 0,
        error: statusCounts['error'] || 0,
        byServerType,
      };
    } catch (error) {
      this.logger.error('Error getting project statistics', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Search projects by name or repository path
   */
  async searchProjects(searchTerm: string, options?: ListOptions): Promise<PaginatedResult<Project>> {
    const whereClause = or(
      like(projects.name, `%${searchTerm}%`),
      like(projects.repositoryPath, `%${searchTerm}%`)
    );

    return this.list({
      ...options,
      where: whereClause,
      orderBy: options?.orderBy || desc(projects.lastHeartbeat)
    });
  }

  /**
   * Cleanup projects that are marked for deletion
   */
  async cleanupDeletedProjects(): Promise<number> {
    try {
      const db = this.drizzle;
      
      // Delete projects that have been marked as disconnected for more than 24 hours
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const result = await db
        .delete(projects)
        .where(
          and(
            eq(projects.status, 'disconnected'),
            lt(projects.endTime, cutoffTime)
          )
        )
        .returning({ id: projects.id });

      const deletedCount = result.length;
      
      if (deletedCount > 0) {
        this.logger.info('Cleaned up deleted projects', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Error cleaning up deleted projects', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}