/**
 * DashboardConnectionService
 * 
 * Manages WebSocket connection to the dashboard and broadcasts MCP server events
 * Integrates with EventBus for real-time communication of tool calls, progress, errors
 */

import { EventBus, eventBus, type EventTypes } from './EventBus.js';
import { DatabaseManager } from '../database/index.js';
import { ProjectService } from './ProjectService.js';
import { Logger } from '../utils/logger.js';
import type WebSocket from 'ws';

const logger = new Logger('dashboard-connection-service');

export interface DashboardConnectionConfig {
  /** Enable automatic reconnection on connection loss */
  autoReconnect?: boolean;
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number;
  /** Base reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Maximum reconnection delay in milliseconds */
  maxReconnectDelay?: number;
  /** Connection check interval in milliseconds */
  connectionCheckInterval?: number;
}

export interface DashboardConnectionStatus {
  connected: boolean;
  url?: string;
  lastConnectedAt?: Date;
  lastAttemptAt?: Date;
  reconnectAttempts: number;
  error?: string;
}

export interface ToolCallEvent {
  toolName: string;
  arguments: Record<string, any>;
  timestamp: Date;
  projectId?: string;
  sessionId?: string;
}

export interface ProgressEvent {
  contextId: string;
  contextType: 'agent' | 'orchestration' | 'objective' | 'monitoring';
  agentId?: string;
  progress: number;
  message?: string;
  timestamp: Date;
  projectId?: string;
}

export interface ErrorEvent {
  error: Error | string;
  context: string;
  toolName?: string;
  timestamp: Date;
  projectId?: string;
}

/**
 * Service for managing dashboard WebSocket connections and broadcasting MCP events
 */
export class DashboardConnectionService {
  private wsClient: WebSocket | null = null;
  private config: DashboardConnectionConfig;
  private status: DashboardConnectionStatus;
  private projectService: ProjectService;
  private projectId?: string;
  private eventSubscriptions: string[] = [];
  private reconnectTimeout?: NodeJS.Timeout;
  private connectionCheckTimeout?: NodeJS.Timeout;

  constructor(
    private db: DatabaseManager,
    private repositoryPath: string,
    config: DashboardConnectionConfig = {}
  ) {
    this.config = {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      connectionCheckInterval: 5000,
      ...config
    };

    this.status = {
      connected: false,
      reconnectAttempts: 0
    };

    this.projectService = new ProjectService(this.db, eventBus);
  }

  /**
   * Initialize the service and start monitoring for dashboard connections
   */
  async initialize(projectId?: string): Promise<void> {
    logger.info('Initializing DashboardConnectionService', { projectId });
    this.projectId = projectId;
    
    // Subscribe to relevant EventBus events
    this.subscribeToEventBus();
    
    // Start checking for dashboard availability
    this.startConnectionCheck();
    logger.info('DashboardConnectionService initialized successfully');
    
    logger.info('DashboardConnectionService initialized');
  }

  /**
   * Subscribe to EventBus events that should be broadcast to dashboard
   */
  private subscribeToEventBus(): void {
    // Subscribe to all relevant events for dashboard broadcasting
    this.eventSubscriptions.push(
      // Progress and status events
      eventBus.subscribe('progress_update', this.handleProgressUpdate.bind(this)),
      eventBus.subscribe('system_error', this.handleSystemError.bind(this)),
      eventBus.subscribe('system_warning', this.handleSystemWarning.bind(this)),
      
      // Agent events
      eventBus.subscribe('agent_status_change', this.handleAgentStatusChange.bind(this)),
      eventBus.subscribe('agent_spawned', this.handleAgentSpawned.bind(this)),
      eventBus.subscribe('agent_terminated', this.handleAgentTerminated.bind(this)),
      eventBus.subscribe('agent_resumed', this.handleAgentResumed.bind(this)),
      
      // Task events
      eventBus.subscribe('objective_update', this.handleObjectiveUpdate.bind(this)),
      eventBus.subscribe('objective_created', this.handleObjectiveCreated.bind(this)),
      eventBus.subscribe('objective_completed', this.handleObjectiveCompleted.bind(this)),
      
      // Communication events
      eventBus.subscribe('room_message', this.handleRoomMessage.bind(this)),
      eventBus.subscribe('room_created', this.handleRoomCreated.bind(this)),
      eventBus.subscribe('room_closed', this.handleRoomClosed.bind(this)),
      
      // Orchestration events
      eventBus.subscribe('orchestration_update', this.handleOrchestrationUpdate.bind(this)),
      eventBus.subscribe('orchestration_completed', this.handleOrchestrationCompleted.bind(this)),
      
      // MCP Tool events
      eventBus.subscribe('tool_call_started', this.handleToolCallStarted.bind(this)),
      eventBus.subscribe('tool_call_completed', this.handleToolCallCompleted.bind(this)),
      eventBus.subscribe('tool_call_failed', this.handleToolCallFailed.bind(this)),
      
      // Server events
      eventBus.subscribe('server_status_change', this.handleServerStatusChange.bind(this)),
      eventBus.subscribe('server_heartbeat', this.handleServerHeartbeat.bind(this)),
      
      // Project events
      eventBus.subscribe('project_status_change', this.handleProjectStatusChange.bind(this)),
      eventBus.subscribe('project_registered', this.handleProjectRegistered.bind(this)),
      eventBus.subscribe('project_disconnected', this.handleProjectDisconnected.bind(this)),
      eventBus.subscribe('project_heartbeat', this.handleProjectHeartbeat.bind(this))
    );

    logger.debug('Subscribed to EventBus events');
  }

  /**
   * Start periodic connection checks for dashboard availability
   */
  private startConnectionCheck(): void {
    logger.info('Starting dashboard connection check', { interval: this.config.connectionCheckInterval });
    
    const checkConnection = async () => {
      if (!this.status.connected) {
        logger.debug('Checking for dashboard connection...');
        await this.checkAndConnect();
      }
      
      this.connectionCheckTimeout = setTimeout(
        checkConnection, 
        this.config.connectionCheckInterval
      );
    };

    checkConnection();
  }

  /**
   * Check for dashboard availability and connect if found
   */
  private async checkAndConnect(): Promise<void> {
    try {
      logger.info('Checking for dashboard availability...');
      const path = await import('path');
      const fs = await import('fs');
      const os = await import('os');
      
      const dashboardInfoPath = path.join(os.homedir(), '.mcptools', 'data', 'dashboard.port');
      logger.debug(`Looking for dashboard info at: ${dashboardInfoPath}`);
      
      if (!fs.existsSync(dashboardInfoPath)) {
        logger.debug('No dashboard.port file found - dashboard not running');
        return; // No dashboard running
      }
      
      const dashboardInfo = JSON.parse(fs.readFileSync(dashboardInfoPath, 'utf8'));
      logger.info(`Found dashboard info: ${JSON.stringify(dashboardInfo)}`);
      
      // Check if we're already connected to this dashboard
      if (this.wsClient && this.status.url === dashboardInfo.wsUrl && this.status.connected) {
        logger.info(`Already connected to dashboard at ${dashboardInfo.wsUrl}`);
        return; // Already connected
      }
      
      // Try to connect to dashboard WebSocket
      logger.info(`Attempting to connect to dashboard WebSocket at ${dashboardInfo.wsUrl}`);
      await this.connectToDashboard(dashboardInfo.wsUrl);
      
    } catch (error) {
      logger.error(`Dashboard connection check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Connect to dashboard WebSocket server
   */
  private async connectToDashboard(wsUrl: string): Promise<void> {
    try {
      logger.info(`Attempting to connect to dashboard at ${wsUrl}...`);
      
      const WebSocket = await import('ws');
      logger.debug('WebSocket module imported successfully');
      
      this.wsClient = new WebSocket.default(wsUrl, {
        headers: {
          'x-client-type': 'mcp-server',
          'user-agent': 'claude-mcp-tools-server'
        }
      });
      
      logger.info('WebSocket client created, setting up event handlers...');

      this.wsClient.on('open', () => {
        this.status = {
          connected: true,
          url: wsUrl,
          lastConnectedAt: new Date(),
          reconnectAttempts: 0
        };
        
        logger.info(`Connected to dashboard at ${wsUrl}`);
        
        // Register this MCP server
        this.sendMessage({
          type: 'register',
          projectId: this.projectId,
          serverInfo: {
            repositoryPath: this.repositoryPath,
            startTime: new Date().toISOString()
          }
        });
      });
      
      this.wsClient.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.warn('Failed to parse dashboard message', error);
        }
      });
      
      this.wsClient.on('error', (error: any) => {
        logger.error(`Dashboard connection error: ${error.message || error}`);
        this.handleConnectionError(error);
      });
      
      this.wsClient.on('close', (code: number, reason: Buffer) => {
        logger.warn(`Dashboard connection closed: code=${code}, reason=${reason.toString()}`);
        this.handleConnectionClose();
      });
      
    } catch (error) {
      logger.error(`Failed to connect to dashboard: ${error instanceof Error ? error.message : String(error)}`);
      logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      this.handleConnectionError(error);
    }
  }

  /**
   * Handle incoming messages from dashboard
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'ping':
        this.sendMessage({ type: 'pong' });
        break;
      
      case 'request_status':
        this.broadcastStatus();
        break;
        
      default:
        logger.debug('Unknown dashboard message type:', message.type);
    }
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: any): void {
    this.status.connected = false;
    this.status.error = error instanceof Error ? error.message : String(error);
    this.status.lastAttemptAt = new Date();
    this.wsClient = null;

    if (this.config.autoReconnect && this.status.reconnectAttempts < this.config.maxReconnectAttempts!) {
      this.scheduleReconnection();
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(): void {
    this.status.connected = false;
    this.wsClient = null;

    if (this.config.autoReconnect && this.status.reconnectAttempts < this.config.maxReconnectAttempts!) {
      this.scheduleReconnection();
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnection(): void {
    this.status.reconnectAttempts++;
    
    const delay = Math.min(
      this.config.reconnectDelay! * Math.pow(2, this.status.reconnectAttempts - 1),
      this.config.maxReconnectDelay!
    );

    logger.debug(`Scheduling reconnection attempt ${this.status.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.checkAndConnect();
    }, delay);
  }

  /**
   * Send message to dashboard if connected
   */
  private sendMessage(message: any): void {
    if (this.wsClient && this.status.connected) {
      try {
        this.wsClient.send(JSON.stringify(message));
      } catch (error) {
        logger.warn('Failed to send message to dashboard', error);
      }
    }
  }

  /**
   * Broadcast tool call event to dashboard
   */
  public broadcastToolCall(toolCall: ToolCallEvent): void {
    this.sendMessage({
      type: 'event',
      eventType: 'tool_call',
      payload: {
        ...toolCall,
        projectId: this.projectId,
        repositoryPath: this.repositoryPath
      }
    });
  }

  /**
   * Broadcast progress update to dashboard
   */
  public broadcastProgress(progress: ProgressEvent): void {
    this.sendMessage({
      type: 'event',
      eventType: 'progress_update',
      payload: {
        ...progress,
        projectId: this.projectId,
        repositoryPath: this.repositoryPath
      }
    });
  }

  /**
   * Broadcast error to dashboard
   */
  public broadcastError(error: ErrorEvent): void {
    this.sendMessage({
      type: 'event',
      eventType: 'error',
      payload: {
        ...error,
        error: error.error instanceof Error ? {
          message: error.error.message,
          stack: error.error.stack,
          name: error.error.name
        } : error.error,
        projectId: this.projectId,
        repositoryPath: this.repositoryPath
      }
    });
  }

  /**
   * Broadcast current server status to dashboard
   */
  public broadcastStatus(): void {
    this.sendMessage({
      type: 'event',
      eventType: 'server_status',
      payload: {
        projectId: this.projectId,
        repositoryPath: this.repositoryPath,
        status: 'active',
        timestamp: new Date(),
        connectionStatus: this.status
      }
    });
  }

  /**
   * Handle EventBus progress updates
   */
  private handleProgressUpdate(data: EventTypes['progress_update']): void {
    this.broadcastProgress({
      contextId: data.contextId,
      contextType: data.contextType,
      agentId: data.agentId,
      progress: data.reportedProgress,
      message: data.message,
      timestamp: data.timestamp
    });
  }

  /**
   * Handle EventBus system errors
   */
  private handleSystemError(data: EventTypes['system_error']): void {
    this.broadcastError({
      error: data.error,
      context: data.context,
      timestamp: data.timestamp
    });
  }

  /**
   * Handle EventBus agent status changes
   */
  private handleAgentStatusChange(data: EventTypes['agent_status_change']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'agent_status_change',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus task updates
   */
  private handleObjectiveUpdate(data: EventTypes['objective_update']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'objective_update',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus orchestration updates
   */
  private handleOrchestrationUpdate(data: EventTypes['orchestration_update']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'orchestration_update',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus system warnings
   */
  private handleSystemWarning(data: EventTypes['system_warning']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'system_warning',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus agent spawned events
   */
  private handleAgentSpawned(data: EventTypes['agent_spawned']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'agent_spawned',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus agent terminated events
   */
  private handleAgentTerminated(data: EventTypes['agent_terminated']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'agent_terminated',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus agent resumed events
   */
  private handleAgentResumed(data: EventTypes['agent_resumed']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'agent_resumed',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus task created events
   */
  private handleObjectiveCreated(data: EventTypes['objective_created']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'objective_created',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus task completed events
   */
  private handleObjectiveCompleted(data: EventTypes['objective_completed']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'objective_completed',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus room message events
   */
  private handleRoomMessage(data: EventTypes['room_message']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'room_message',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus room created events
   */
  private handleRoomCreated(data: EventTypes['room_created']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'room_created',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus room closed events
   */
  private handleRoomClosed(data: EventTypes['room_closed']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'room_closed',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus orchestration completed events
   */
  private handleOrchestrationCompleted(data: EventTypes['orchestration_completed']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'orchestration_completed',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus tool call started events
   */
  private handleToolCallStarted(data: EventTypes['tool_call_started']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'tool_call_started',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus tool call completed events
   */
  private handleToolCallCompleted(data: EventTypes['tool_call_completed']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'tool_call_completed',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus tool call failed events
   */
  private handleToolCallFailed(data: EventTypes['tool_call_failed']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'tool_call_failed',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus server status change events
   */
  private handleServerStatusChange(data: EventTypes['server_status_change']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'server_status_change',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus server heartbeat events
   */
  private handleServerHeartbeat(data: EventTypes['server_heartbeat']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'server_heartbeat',
      payload: {
        ...data,
        projectId: this.projectId
      }
    });
  }

  /**
   * Handle EventBus project status change events
   */
  private handleProjectStatusChange(data: EventTypes['project_status_change']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'project_status_change',
      payload: data
    });
  }

  /**
   * Handle EventBus project registration events
   */
  private handleProjectRegistered(data: EventTypes['project_registered']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'project_registered',
      payload: data
    });
  }

  /**
   * Handle EventBus project disconnection events
   */
  private handleProjectDisconnected(data: EventTypes['project_disconnected']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'project_disconnected',
      payload: data
    });
  }

  /**
   * Handle EventBus project heartbeat events
   */
  private handleProjectHeartbeat(data: EventTypes['project_heartbeat']): void {
    this.sendMessage({
      type: 'event',
      eventType: 'project_heartbeat',
      payload: data
    });
  }

  /**
   * Get current connection status
   */
  public getStatus(): DashboardConnectionStatus {
    return { ...this.status };
  }

  /**
   * Check if connected to dashboard
   */
  public isConnected(): boolean {
    return this.status.connected;
  }

  /**
   * Manually trigger connection attempt
   */
  public async connect(): Promise<void> {
    await this.checkAndConnect();
  }

  /**
   * Disconnect from dashboard
   */
  public disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }

    this.status.connected = false;
  }

  /**
   * Shutdown the service
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down DashboardConnectionService...');

    // Stop connection checks
    if (this.connectionCheckTimeout) {
      clearTimeout(this.connectionCheckTimeout);
      this.connectionCheckTimeout = undefined;
    }

    // Disconnect from dashboard
    this.disconnect();

    // Unsubscribe from EventBus
    for (const subscriptionId of this.eventSubscriptions) {
      eventBus.unsubscribe(subscriptionId);
    }
    this.eventSubscriptions = [];

    logger.info('DashboardConnectionService shutdown complete');
  }
}