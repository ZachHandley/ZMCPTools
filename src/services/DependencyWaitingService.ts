import { DatabaseManager } from '../database/index.js';
import { AgentService, ObjectiveService } from './index.js';
import { eventBus } from './EventBus.js';
import { Logger } from '../utils/logger.js';
import type { AgentStatus } from '../schemas/index.js';

export interface DependencyWaitResult {
  success: boolean;
  completedAgents: string[];
  failedAgents: string[];
  timeoutAgents: string[];
  message: string;
  waitDuration: number;
}

export interface ObjectiveDependencyWaitResult {
  success: boolean;
  completedObjectives: string[];
  failedObjectives: string[];
  timeoutObjectives: string[];
  message: string;
  waitDuration: number;
}

export interface CompletionEvent {
  id: string;
  status: 'completed' | 'failed' | 'terminated' | 'timeout';
  source: 'process_exit' | 'progress_report' | 'timeout' | 'status_change';
  metadata?: Record<string, any>;
}

/**
 * Service for handling agent and objective dependency waiting using EventBus
 */
export class DependencyWaitingService {
  private agentService: AgentService;
  private objectiveService: ObjectiveService;
  private logger: Logger;

  constructor(private db: DatabaseManager) {
    this.agentService = new AgentService(db);
    this.objectiveService = new ObjectiveService(db);
    this.logger = new Logger('DependencyWaitingService');
  }

  /**
   * Wait for agent dependencies to complete before proceeding
   */
  async waitForAgentDependencies(
    dependsOn: string[],
    repositoryPath: string,
    options: {
      timeout?: number;
      checkInterval?: number;
      waitForAnyFailure?: boolean;
    } = {}
  ): Promise<DependencyWaitResult> {
    const {
      timeout = 600000, // 10 minutes default
      checkInterval = 5000, // 5 seconds
      waitForAnyFailure = true
    } = options;

    const startTime = Date.now();
    this.logger.info('Starting dependency wait', {
      dependsOn,
      repositoryPath,
      timeout,
      waitForAnyFailure
    });

    try {
      // 1. Check current status of dependencies
      const currentStatus = await this.checkCurrentDependencyStatus(dependsOn);
      const pending = currentStatus.filter(dep => !['completed', 'failed', 'terminated'].includes(dep.status));
      
      if (pending.length === 0) {
        const completed = currentStatus.filter(dep => dep.status === 'completed').map(dep => dep.agentId);
        const failed = currentStatus.filter(dep => ['failed', 'terminated'].includes(dep.status)).map(dep => dep.agentId);
        
        return {
          success: failed.length === 0,
          completedAgents: completed,
          failedAgents: failed,
          timeoutAgents: [],
          message: failed.length === 0 ? 'All dependencies already completed' : `Some dependencies failed: ${failed.join(', ')}`,
          waitDuration: 0
        };
      }

      this.logger.info('Waiting for pending dependencies', {
        pendingCount: pending.length,
        pendingAgents: pending.map(p => p.agentId)
      });

      // 2. Set up event listeners for each pending dependency
      const completionPromises = pending.map(dep =>
        this.waitForAgentCompletion(dep.agentId, repositoryPath, timeout)
      );

      // 3. Wait for all dependencies to complete or timeout
      const results = await Promise.allSettled(completionPromises);
      
      // 4. Analyze results and return completion status
      return this.analyzeAgentCompletionResults(results, dependsOn, Date.now() - startTime);

    } catch (error) {
      this.logger.error('Error in dependency waiting', { error, dependsOn });
      return {
        success: false,
        completedAgents: [],
        failedAgents: [],
        timeoutAgents: dependsOn,
        message: `Dependency waiting error: ${error}`,
        waitDuration: Date.now() - startTime
      };
    }
  }

  /**
   * Wait for objective dependencies to complete
   */
  async waitForObjectiveDependencies(
    objectiveId: string,
    repositoryPath: string,
    options: {
      timeout?: number;
      waitForAnyFailure?: boolean;
    } = {}
  ): Promise<ObjectiveDependencyWaitResult> {
    const { timeout = 600000, waitForAnyFailure = true } = options;
    const startTime = Date.now();

    try {
      // Get objective dependencies
      const objective = await this.objectiveService.getObjective(objectiveId);
      if (!objective) {
        throw new Error(`Objective ${objectiveId} not found`);
      }

      const dependencies = (objective.requirements?.dependencies as string[]) || [];
      if (dependencies.length === 0) {
        return {
          success: true,
          completedObjectives: [],
          failedObjectives: [],
          timeoutObjectives: [],
          message: 'No objective dependencies to wait for',
          waitDuration: 0
        };
      }

      this.logger.info('Waiting for objective dependencies', {
        objectiveId,
        dependencies,
        repositoryPath
      });

      // Wait for objective completion events
      const completionPromises = dependencies.map(depObjectiveId =>
        this.waitForObjectiveCompletion(depObjectiveId, repositoryPath, timeout)
      );

      const results = await Promise.allSettled(completionPromises);
      return this.analyzeObjectiveCompletionResults(results, dependencies, Date.now() - startTime);

    } catch (error) {
      this.logger.error('Error in objective dependency waiting', { error, objectiveId });
      return {
        success: false,
        completedObjectives: [],
        failedObjectives: [],
        timeoutObjectives: [],
        message: `Objective dependency waiting error: ${error}`,
        waitDuration: Date.now() - startTime
      };
    }
  }

  /**
   * Wait for a single agent to complete
   */
  private async waitForAgentCompletion(
    agentId: string,
    repositoryPath: string,
    timeout: number
  ): Promise<CompletionEvent> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        eventBus.unsubscribe(statusSubscriptionId);
        eventBus.unsubscribe(terminationSubscriptionId);
        eventBus.unsubscribe(progressSubscriptionId);
        resolve({
          id: agentId,
          status: 'timeout',
          source: 'timeout',
          metadata: { timeoutDuration: timeout }
        });
      }, timeout);

      // Listen for agent status changes (primary completion signal)
      const statusSubscriptionId = eventBus.subscribe('agent_status_change', (data) => {
        if (data.agentId === agentId && data.repositoryPath === repositoryPath) {
          if (['completed', 'failed', 'terminated'].includes(data.newStatus)) {
            clearTimeout(timeoutId);
            eventBus.unsubscribe(statusSubscriptionId);
            eventBus.unsubscribe(terminationSubscriptionId);
            eventBus.unsubscribe(progressSubscriptionId);
            
            resolve({
              id: agentId,
              status: data.newStatus as any,
              source: 'status_change',
              metadata: { 
                previousStatus: data.previousStatus,
                timestamp: data.timestamp 
              }
            });
          }
        }
      }, { repositoryPath });

      // Listen for explicit termination events (backup signal)
      const terminationSubscriptionId = eventBus.subscribe('agent_terminated', (data) => {
        if (data.agentId === agentId && data.repositoryPath === repositoryPath) {
          clearTimeout(timeoutId);
          eventBus.unsubscribe(statusSubscriptionId);
          eventBus.unsubscribe(terminationSubscriptionId);
          eventBus.unsubscribe(progressSubscriptionId);
          
          resolve({
            id: agentId,
            status: 'terminated',
            source: 'process_exit',
            metadata: {
              finalStatus: data.finalStatus,
              reason: data.reason
            }
          });
        }
      }, { repositoryPath });

      // Listen for objective completion reports (secondary signal)
      const progressSubscriptionId = eventBus.subscribe('objective_completed', (data: any) => {
        if (data.completedBy === agentId && data.repositoryPath === repositoryPath) {
          clearTimeout(timeoutId);
          eventBus.unsubscribe(statusSubscriptionId);
          eventBus.unsubscribe(terminationSubscriptionId);
          eventBus.unsubscribe(progressSubscriptionId);
          
          resolve({
            id: agentId,
            status: 'completed',
            source: 'progress_report',
            metadata: {
              results: data.results,
              objectiveId: data.objectiveId
            }
          });
        }
      }, { repositoryPath });
    });
  }

  /**
   * Wait for a single objective to complete
   */
  private async waitForObjectiveCompletion(
    objectiveId: string,
    repositoryPath: string,
    timeout: number
  ): Promise<CompletionEvent> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        eventBus.unsubscribe(objectiveSubscriptionId);
        resolve({
          id: objectiveId,
          status: 'timeout',
          source: 'timeout',
          metadata: { timeoutDuration: timeout }
        });
      }, timeout);

      const objectiveSubscriptionId = eventBus.subscribe('objective_completed', (data: any) => {
        if (data.objectiveId === objectiveId && data.repositoryPath === repositoryPath) {
          clearTimeout(timeoutId);
          eventBus.unsubscribe(objectiveSubscriptionId);
          
          resolve({
            id: objectiveId,
            status: 'completed',
            source: 'progress_report',
            metadata: {
              completedBy: data.completedBy,
              results: data.results
            }
          });
        }
      }, { repositoryPath });
    });
  }

  /**
   * Check current status of agent dependencies
   */
  private async checkCurrentDependencyStatus(dependsOn: string[]): Promise<Array<{ agentId: string; status: AgentStatus }>> {
    const results: Array<{ agentId: string; status: AgentStatus }> = [];

    for (const agentId of dependsOn) {
      try {
        const agent = await this.agentService.getAgent(agentId);
        if (!agent) {
          this.logger.warn('Dependency agent not found', { agentId });
          results.push({ agentId, status: 'failed' as AgentStatus });
        } else {
          results.push({ agentId, status: agent.status });
        }
      } catch (error) {
        this.logger.warn('Error checking agent status', { agentId, error });
        results.push({ agentId, status: 'failed' as AgentStatus });
      }
    }

    return results;
  }

  /**
   * Analyze agent completion results from Promise.allSettled
   */
  private analyzeAgentCompletionResults(
    results: PromiseSettledResult<CompletionEvent>[],
    originalAgentIds: string[],
    waitDuration: number
  ): DependencyWaitResult {
    const completed: string[] = [];
    const failed: string[] = [];
    const timeout: string[] = [];

    results.forEach((result, index) => {
      const agentId = originalAgentIds[index];
      
      if (result.status === 'fulfilled') {
        const event = result.value;
        if (event.status === 'completed') {
          completed.push(event.id);
        } else if (event.status === 'timeout') {
          timeout.push(event.id);
        } else {
          failed.push(event.id);
        }
      } else {
        // Promise rejected
        failed.push(agentId);
      }
    });

    const success = failed.length === 0 && timeout.length === 0;
    let message = '';
    
    if (success) {
      message = `All ${completed.length} dependencies completed successfully`;
    } else {
      const issues: string[] = [];
      if (failed.length > 0) issues.push(`${failed.length} failed`);
      if (timeout.length > 0) issues.push(`${timeout.length} timed out`);
      message = `Dependency issues: ${issues.join(', ')}`;
    }

    this.logger.info('Dependency wait completed', {
      success,
      completed: completed.length,
      failed: failed.length,
      timeout: timeout.length,
      waitDuration
    });

    return {
      success,
      completedAgents: completed,
      failedAgents: failed,
      timeoutAgents: timeout,
      message,
      waitDuration
    };
  }

  /**
   * Analyze objective completion results from Promise.allSettled
   */
  private analyzeObjectiveCompletionResults(
    results: PromiseSettledResult<CompletionEvent>[],
    originalObjectiveIds: string[],
    waitDuration: number
  ): ObjectiveDependencyWaitResult {
    const completed: string[] = [];
    const failed: string[] = [];
    const timeout: string[] = [];

    results.forEach((result, index) => {
      const objectiveId = originalObjectiveIds[index];
      
      if (result.status === 'fulfilled') {
        const event = result.value;
        if (event.status === 'completed') {
          completed.push(event.id);
        } else if (event.status === 'timeout') {
          timeout.push(event.id);
        } else {
          failed.push(event.id);
        }
      } else {
        failed.push(objectiveId);
      }
    });

    const success = failed.length === 0 && timeout.length === 0;
    let message = '';
    
    if (success) {
      message = `All ${completed.length} objective dependencies completed successfully`;
    } else {
      const issues: string[] = [];
      if (failed.length > 0) issues.push(`${failed.length} failed`);
      if (timeout.length > 0) issues.push(`${timeout.length} timed out`);
      message = `Objective dependency issues: ${issues.join(', ')}`;
    }

    return {
      success,
      completedObjectives: completed,
      failedObjectives: failed,
      timeoutObjectives: timeout,
      message,
      waitDuration
    };
  }

  /**
   * Get detailed status of pending dependencies for monitoring
   */
  async getDependencyStatus(
    dependsOn: string[],
    repositoryPath: string
  ): Promise<Array<{
    agentId: string;
    status: AgentStatus;
    lastHeartbeat?: Date;
    currentTask?: string;
    progress?: number;
  }>> {
    const statusDetails = [];

    for (const agentId of dependsOn) {
      try {
        const agent = await this.agentService.getAgent(agentId);
        if (agent) {
          statusDetails.push({
            agentId,
            status: agent.status,
            lastHeartbeat: agent.lastHeartbeat,
            currentObjective: (agent.agentMetadata as any)?.currentObjective?.description,
            progress: (agent.agentMetadata as any)?.progress
          });
        } else {
          statusDetails.push({
            agentId,
            status: 'failed' as AgentStatus
          });
        }
      } catch (error) {
        statusDetails.push({
          agentId,
          status: 'failed' as AgentStatus
        });
      }
    }

    return statusDetails;
  }
}