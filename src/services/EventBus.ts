import { Logger } from '../utils/logger.js';
import type { 
  AgentStatus, 
  ObjectiveStatus, 
  MessageType,
  AgentSession,
  Objective,
  ChatMessage,
  ChatRoom 
} from '../schemas/index.js';

/**
 * Event types for real-time monitoring
 */
export interface EventTypes {
  // Agent events
  agent_status_change: {
    agentId: string;
    previousStatus: AgentStatus;
    newStatus: AgentStatus;
    timestamp: Date;
    metadata?: Record<string, any>;
    repositoryPath: string;
  };
  
  agent_spawned: {
    agent: AgentSession;
    timestamp: Date;
    repositoryPath: string;
  };
  
  agent_terminated: {
    agentId: string;
    finalStatus: AgentStatus;
    timestamp: Date;
    reason?: string;
    repositoryPath: string;
  };

  agent_resumed: {
    agentId: string;
    previousStatus: AgentStatus;
    newStatus: AgentStatus;
    timestamp: Date;
    repositoryPath: string;
    sessionId?: string;
  };
  
  // Objective events  
  objective_update: {
    objectiveId: string;
    previousStatus?: ObjectiveStatus;
    newStatus: ObjectiveStatus;
    assignedAgentId?: string;
    progressPercentage?: number;
    timestamp: Date;
    repositoryPath: string;
    metadata?: Record<string, any>;
  };
  
  objective_created: {
    objective: Objective;
    timestamp: Date;
    repositoryPath: string;
  };
  
  objective_completed: {
    objectiveId: string;
    completedBy?: string;
    results?: Record<string, any>;
    timestamp: Date;
    repositoryPath: string;
  };
  
  // Communication events
  room_message: {
    roomId: string;
    roomName: string;
    message: ChatMessage;
    timestamp: Date;
    repositoryPath: string;
  };
  
  room_created: {
    room: ChatRoom;
    timestamp: Date;
    repositoryPath: string;
  };
  
  room_closed: {
    roomId: string;
    roomName: string;
    timestamp: Date;
    repositoryPath: string;
  };
  
  room_cleaned_up: {
    roomId: string;
    roomName: string;
    repositoryPath: string;
    timestamp: Date;
    cleanupReason: string;
    wasActive: boolean;
  };
  
  // Orchestration events
  orchestration_update: {
    orchestrationId: string;
    phase: 'planning' | 'execution' | 'monitoring' | 'completion';
    status: 'started' | 'in_progress' | 'completed' | 'failed';
    agentCount: number;
    completedObjectives: number;
    totalObjectives: number;
    timestamp: Date;
    repositoryPath: string;
    metadata?: Record<string, any>;
  };

  orchestration_phase_change: {
    orchestrationId: string;
    fromPhase: string;
    toPhase: string;
    timestamp: Date;
    repositoryPath: string;
  };

  orchestration_completed: {
    orchestrationId: string;
    repositoryPath: string;
    success: boolean;
    duration: number;
    finalResults?: Record<string, any>;
    timestamp: Date;
  };

  orchestration_phase_completed: {
    orchestrationId: string;
    phase: string;
    repositoryPath: string;
    outputs?: Record<string, any>;
    timestamp: Date;
  };

  orchestration_cancelled: {
    orchestrationId: string;
    reason: string;
    timestamp: Date;
    repositoryPath?: string;
  };
  
  // Progress events
  progress_update: {
    contextId: string;
    contextType: 'agent' | 'orchestration' | 'objective' | 'monitoring';
    agentId?: string;
    actualProgress: number;
    reportedProgress: number;
    message?: string;
    timestamp: Date;
    repositoryPath: string;
    metadata?: Record<string, any>;
  };
  
  // System events
  system_error: {
    error: Error;
    context: string;
    timestamp: Date;
    repositoryPath?: string;
  };
  
  system_warning: {
    message: string;
    context: string;
    timestamp: Date;
    repositoryPath?: string;
  };

  // MCP Tool events
  tool_call_started: {
    toolName: string;
    arguments: Record<string, any>;
    sessionId?: string;
    timestamp: Date;
    repositoryPath: string;
  };

  tool_call_completed: {
    toolName: string;
    arguments: Record<string, any>;
    result: any;
    duration: number;
    sessionId?: string;
    timestamp: Date;
    repositoryPath: string;
  };

  tool_call_failed: {
    toolName: string;
    arguments: Record<string, any>;
    error: Error;
    sessionId?: string;
    timestamp: Date;
    repositoryPath: string;
  };

  // Server events
  server_status_change: {
    status: 'starting' | 'active' | 'connected' | 'disconnected' | 'error';
    previousStatus?: string;
    timestamp: Date;
    repositoryPath: string;
    metadata?: Record<string, any>;
  };

  server_heartbeat: {
    status: string;
    uptime: number;
    memoryUsage: any;
    activeTransports: number;
    timestamp: Date;
    repositoryPath: string;
  };

  // Project events
  project_status_change: {
    projectId: string;
    projectName: string;
    previousStatus: string;
    newStatus: string;
    timestamp: Date;
    repositoryPath: string;
    metadata?: Record<string, any>;
  };

  project_registered: {
    projectId: string;
    projectName: string;
    repositoryPath: string;
    mcpServerType: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  };

  project_disconnected: {
    projectId: string;
    projectName: string;
    repositoryPath: string;
    timestamp: Date;
    reason?: string;
  };

  project_heartbeat: {
    projectId: string;
    projectName: string;
    status: string;
    repositoryPath: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  };
}

/**
 * Event listener type
 */
export type EventListener<T extends keyof EventTypes> = (data: EventTypes[T]) => Promise<void> | void;

/**
 * Event subscription interface
 */
export interface EventSubscription {
  id: string;
  eventType: keyof EventTypes;
  listener: EventListener<any>;
  repositoryPath?: string; // For filtering events by repository
  once?: boolean; // Whether to auto-unsubscribe after first emission
}

/**
 * EventBus for real-time agent monitoring and coordination
 * Implements singleton pattern for global event coordination
 */
export class EventBus {
  private static instance: EventBus | null = null;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private logger: Logger;
  
  private constructor() {
    this.logger = new Logger('EventBus');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  /**
   * Subscribe to an event type
   */
  public subscribe<T extends keyof EventTypes>(
    eventType: T,
    listener: EventListener<T>,
    options: {
      repositoryPath?: string;
      once?: boolean;
    } = {}
  ): string {
    const subscriptionId = `${eventType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      listener,
      repositoryPath: options.repositoryPath,
      once: options.once
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    
    this.logger.debug(`Subscribed to ${eventType} with ID: ${subscriptionId}`);
    
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from an event
   */
  public unsubscribe(subscriptionId: string): boolean {
    const success = this.subscriptions.delete(subscriptionId);
    
    if (success) {
      this.logger.debug(`Unsubscribed from event with ID: ${subscriptionId}`);
    }
    
    return success;
  }
  
  /**
   * Emit an event to all matching subscribers
   */
  public async emit<T extends keyof EventTypes>(
    eventType: T,
    data: EventTypes[T]
  ): Promise<void> {
    const matchingSubscriptions = Array.from(this.subscriptions.values()).filter(
      sub => sub.eventType === eventType
    );
    
    // Filter by repository path if specified
    const filteredSubscriptions = matchingSubscriptions.filter(sub => {
      if (!sub.repositoryPath) return true;
      
      // Check if the event data has repositoryPath and matches
      const eventData = data as any;
      if (eventData.repositoryPath) {
        return sub.repositoryPath === eventData.repositoryPath;
      }
      
      return true;
    });
    
    this.logger.debug(`Emitting ${eventType} to ${filteredSubscriptions.length} subscribers`);
    
    // Execute listeners asynchronously
    const promises = filteredSubscriptions.map(async (sub) => {
      try {
        await sub.listener(data);
        
        // Auto-unsubscribe for 'once' listeners
        if (sub.once) {
          this.unsubscribe(sub.id);
        }
      } catch (error) {
        this.logger.error(`Error in event listener for ${eventType}:`, error);
        
        // Emit system error event
        this.emit('system_error', {
          error: error instanceof Error ? error : new Error(String(error)),
          context: `Event listener for ${eventType}`,
          timestamp: new Date()
        });
      }
    });
    
    await Promise.all(promises);
  }
  
  /**
   * Get all active subscriptions (for debugging)
   */
  public getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }
  
  /**
   * Clear all subscriptions
   */
  public clearAllSubscriptions(): void {
    this.subscriptions.clear();
    this.logger.debug('Cleared all event subscriptions');
  }
  
  /**
   * Get subscription count by event type
   */
  public getSubscriptionCount(eventType?: keyof EventTypes): number {
    if (!eventType) {
      return this.subscriptions.size;
    }
    
    return Array.from(this.subscriptions.values()).filter(
      sub => sub.eventType === eventType
    ).length;
  }
  
  /**
   * Check if there are any subscribers for an event type
   */
  public hasSubscribers(eventType: keyof EventTypes, repositoryPath?: string): boolean {
    const matchingSubscriptions = Array.from(this.subscriptions.values()).filter(
      sub => sub.eventType === eventType
    );
    
    if (!repositoryPath) {
      return matchingSubscriptions.length > 0;
    }
    
    return matchingSubscriptions.some(sub => 
      !sub.repositoryPath || sub.repositoryPath === repositoryPath
    );
  }
  
  /**
   * Create a one-time event listener that returns a promise
   */
  public once<T extends keyof EventTypes>(
    eventType: T,
    repositoryPath?: string
  ): Promise<EventTypes[T]> {
    return new Promise((resolve) => {
      this.subscribe(eventType, resolve, { 
        repositoryPath,
        once: true 
      });
    });
  }
  
  /**
   * Wait for multiple events to occur
   */
  public async waitForEvents<T extends keyof EventTypes>(
    eventTypes: T[],
    repositoryPath?: string,
    timeout?: number
  ): Promise<{ [K in T]: EventTypes[K] }> {
    const promises = eventTypes.map(eventType => 
      this.once(eventType, repositoryPath)
    );
    
    const results = await (timeout 
      ? Promise.race([
          Promise.all(promises),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Event timeout')), timeout)
          )
        ])
      : Promise.all(promises)
    );
    
    const resultMap = {} as { [K in T]: EventTypes[K] };
    eventTypes.forEach((eventType, index) => {
      resultMap[eventType] = results[index];
    });
    
    return resultMap;
  }
}

// Export singleton instance for convenience
export const eventBus = EventBus.getInstance();