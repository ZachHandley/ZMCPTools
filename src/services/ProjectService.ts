/**
 * ProjectService
 * 
 * Manages project registration and tracking for MCP server instances
 */

import { and, eq, desc, or } from 'drizzle-orm';
import { type DatabaseManager } from '../database/index.js';
import { projects } from '../schemas/projects.js';
import { type ProjectRegistration, type ProjectFilter } from '../schemas/projects.js';
import { Logger } from '../utils/logger.js';
import { ulid } from 'ulidx';
import { EventBus } from './EventBus.js';

const logger = new Logger('project-service');

export class ProjectService {
  constructor(private db: DatabaseManager, private eventBus?: EventBus) {}

  async listProjects(filter?: ProjectFilter) {
    try {
      const queryBuilder = this.db.drizzle
        .select()
        .from(projects);

      const conditions = [];

      if (filter?.status) {
        conditions.push(eq(projects.status, filter.status));
      }

      if (filter?.mcpServerType) {
        conditions.push(eq(projects.mcpServerType, filter.mcpServerType));
      }

      if (filter?.webUiEnabled !== undefined) {
        conditions.push(eq(projects.webUiEnabled, filter.webUiEnabled));
      }

      if (conditions.length > 0) {
        queryBuilder.where(and(...conditions));
      }

      const result = await queryBuilder
        .orderBy(desc(projects.createdAt))
        .limit(filter?.limit || 50)
        .offset(filter?.offset || 0);

      logger.debug(`Retrieved ${result.length} projects with filter:`, filter);
      return result;
    } catch (error) {
      logger.error('Failed to list projects:', error);
      throw error;
    }
  }

  async getProject(projectId: string) {
    try {
      const result = await this.db.drizzle
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      const project = result[0];
      if (!project) {
        logger.warn(`Project not found: ${projectId}`);
        return null;
      }

      logger.debug(`Retrieved project: ${projectId}`);
      return project;
    } catch (error) {
      logger.error(`Failed to get project ${projectId}:`, error);
      throw error;
    }
  }

  async getProjectByPath(repositoryPath: string) {
    try {
      const result = await this.db.drizzle
        .select()
        .from(projects)
        .where(eq(projects.repositoryPath, repositoryPath))
        .orderBy(desc(projects.createdAt))
        .limit(1);

      const project = result[0];
      if (!project) {
        logger.debug(`No project found for path: ${repositoryPath}`);
        return null;
      }

      logger.debug(`Retrieved project by path: ${repositoryPath} -> ${project.id}`);
      return project;
    } catch (error) {
      logger.error(`Failed to get project by path ${repositoryPath}:`, error);
      throw error;
    }
  }

  async registerProject(registration: ProjectRegistration) {
    try {
      const projectId = ulid();
      const now = new Date().toISOString();

      // Check if project with same repository path already exists
      const existing = await this.getProjectByPath(registration.repositoryPath);
      if (existing && existing.status === 'active') {
        logger.warn(`Active project already exists for path: ${registration.repositoryPath}`);
        return existing;
      }

      const projectData = {
        id: projectId,
        name: registration.name,
        repositoryPath: registration.repositoryPath,
        mcpServerType: registration.mcpServerType || 'claude-mcp-tools',
        mcpServerPid: registration.mcpServerPid,
        mcpServerPort: registration.mcpServerPort,
        mcpServerHost: registration.mcpServerHost || 'localhost',
        claudeSessionId: registration.claudeSessionId,
        foundationSessionId: registration.foundationSessionId,
        status: 'active' as const,
        startTime: now,
        lastHeartbeat: now,
        projectMetadata: JSON.stringify(registration.projectMetadata || {}),
        webUiEnabled: registration.webUiEnabled || false,
        webUiPort: registration.webUiPort,
        webUiHost: registration.webUiHost || 'localhost',
        createdAt: now,
        updatedAt: now
      };

      await this.db.drizzle.insert(projects).values(projectData);

      // Emit project registration event
      if (this.eventBus) {
        await this.eventBus.emit('project_registered', {
          projectId,
          projectName: registration.name,
          repositoryPath: registration.repositoryPath,
          mcpServerType: registration.mcpServerType || 'claude-mcp-tools',
          timestamp: new Date(),
          metadata: registration.projectMetadata
        });
      }

      logger.info(`Registered new project: ${projectId} (${registration.name})`);
      return projectData;
    } catch (error) {
      logger.error('Failed to register project:', error);
      throw error;
    }
  }

  async updateProject(projectId: string, updates: Partial<ProjectRegistration>) {
    try {
      const now = new Date().toISOString();
      
      const updateData: any = {
        ...updates,
        updatedAt: now
      };

      // Serialize projectMetadata if it exists
      if (updateData.projectMetadata && typeof updateData.projectMetadata === 'object') {
        updateData.projectMetadata = JSON.stringify(updateData.projectMetadata);
      }

      await this.db.drizzle
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, projectId));

      logger.debug(`Updated project: ${projectId}`);
      return await this.getProject(projectId);
    } catch (error) {
      logger.error(`Failed to update project ${projectId}:`, error);
      throw error;
    }
  }

  async updateHeartbeat(projectId: string, status?: string, metadata?: Record<string, any>) {
    try {
      const now = new Date().toISOString();
      
      // Get current project info for event emission
      const currentProject = await this.getProject(projectId);
      if (!currentProject) {
        logger.warn(`Cannot update heartbeat for non-existent project: ${projectId}`);
        return;
      }

      const updateData: any = {
        lastHeartbeat: now,
        updatedAt: now
      };

      if (status) {
        updateData.status = status;
      }

      if (metadata) {
        updateData.projectMetadata = JSON.stringify(metadata);
      }

      await this.db.drizzle
        .update(projects)
        .set(updateData)
        .where(eq(projects.id, projectId));

      // Emit events if status changed or always emit heartbeat
      if (this.eventBus) {
        if (status && status !== currentProject.status) {
          await this.eventBus.emit('project_status_change', {
            projectId,
            projectName: currentProject.name,
            previousStatus: currentProject.status,
            newStatus: status,
            timestamp: new Date(),
            repositoryPath: currentProject.repositoryPath,
            metadata
          });
        }

        await this.eventBus.emit('project_heartbeat', {
          projectId,
          projectName: currentProject.name,
          status: status || currentProject.status,
          repositoryPath: currentProject.repositoryPath,
          timestamp: new Date(),
          metadata
        });
      }

      logger.debug(`Updated heartbeat for project: ${projectId}`);
    } catch (error) {
      logger.error(`Failed to update heartbeat for project ${projectId}:`, error);
      throw error;
    }
  }

  async endProject(projectId: string, reason?: string) {
    try {
      const now = new Date().toISOString();
      
      // Get current project info for event emission
      const currentProject = await this.getProject(projectId);
      if (!currentProject) {
        logger.warn(`Cannot end non-existent project: ${projectId}`);
        return;
      }
      
      await this.db.drizzle
        .update(projects)
        .set({
          status: 'disconnected',
          endTime: now,
          updatedAt: now,
          projectMetadata: JSON.stringify({
            endReason: reason || 'Manual termination'
          })
        })
        .where(eq(projects.id, projectId));

      // Emit project disconnection events
      if (this.eventBus) {
        await this.eventBus.emit('project_status_change', {
          projectId,
          projectName: currentProject.name,
          previousStatus: currentProject.status,
          newStatus: 'disconnected',
          timestamp: new Date(),
          repositoryPath: currentProject.repositoryPath,
          metadata: { endReason: reason || 'Manual termination' }
        });

        await this.eventBus.emit('project_disconnected', {
          projectId,
          projectName: currentProject.name,
          repositoryPath: currentProject.repositoryPath,
          timestamp: new Date(),
          reason: reason || 'Manual termination'
        });
      }

      logger.info(`Ended project: ${projectId} (${reason || 'Manual termination'})`);
    } catch (error) {
      logger.error(`Failed to end project ${projectId}:`, error);
      throw error;
    }
  }

  async getActiveProjects() {
    return this.listProjects({ status: 'active' });
  }

  async getProjectStats() {
    try {
      const allProjects = await this.listProjects();
      
      const stats = {
        total: allProjects.length,
        active: allProjects.filter(p => p.status === 'active').length,
        connected: allProjects.filter(p => p.status === 'connected').length,
        inactive: allProjects.filter(p => p.status === 'inactive').length,
        disconnected: allProjects.filter(p => p.status === 'disconnected').length,
        error: allProjects.filter(p => p.status === 'error').length,
        byType: {} as Record<string, number>
      };

      // Count by server type
      for (const project of allProjects) {
        const type = project.mcpServerType;
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get project stats:', error);
      throw error;
    }
  }

  async cleanupStaleProjects(staleMinutes: number = 60) {
    try {
      const staleTime = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
      
      // Find projects that haven't sent heartbeat recently
      const staleProjects = await this.db.drizzle
        .select()
        .from(projects)
        .where(
          and(
            or(eq(projects.status, 'active'), eq(projects.status, 'connected')),
            eq(projects.lastHeartbeat, staleTime) // This is a simplified check
          )
        );

      let cleanedUp = 0;
      for (const project of staleProjects) {
        await this.endProject(project.id, 'Stale heartbeat');
        cleanedUp++;
      }

      if (cleanedUp > 0) {
        logger.info(`Cleaned up ${cleanedUp} stale projects`);
      }

      return cleanedUp;
    } catch (error) {
      logger.error('Failed to cleanup stale projects:', error);
      throw error;
    }
  }
}