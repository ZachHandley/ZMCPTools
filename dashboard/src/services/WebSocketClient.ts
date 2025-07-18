/**
 * WebSocket Client for ZMCPTools Dashboard
 * 
 * Handles real-time communication with the EventBus for live updates
 */

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface EventCallback {
  (event: any): void;
}

export interface ConnectionCallback {
  (status: ConnectionStatus): void;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private url: string;

  public onEvent: EventCallback | null = null;
  public onConnectionChange: ConnectionCallback | null = null;

  constructor(url?: string) {
    // Connect to the WebSocket server on the same port at /api/ws
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const port = window.location.port;
    this.url = url || `${protocol}//${hostname}:${port}/api/ws`;
    console.log('WebSocket URL constructed:', this.url);
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateConnectionStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      this.handleError();
    }
  }

  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.updateConnectionStatus('disconnected');
  }

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.updateConnectionStatus('connected');

    // Start heartbeat to keep connection alive
    this.startHeartbeat();

    // Subscribe to all events
    this.send({
      type: 'subscribe',
      events: ['*'] // Subscribe to all events
    });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      // Handle different message types
      switch (data.type) {
        case 'event':
          if (this.onEvent) {
            this.onEvent(data.payload);
          }
          break;
        case 'welcome':
          // Welcome message from server - connection established
          console.log('WebSocket welcome message received:', data.clientId || 'Connected');
          break;
        case 'mcp-project-connected':
          console.log('MCP project connected:', data.payload);
          if (this.onEvent) {
            this.onEvent({ type: 'mcp-project-connected', ...data.payload });
          }
          break;
        case 'mcp-project-disconnected':
          console.log('MCP project disconnected:', data.payload);
          if (this.onEvent) {
            this.onEvent({ type: 'mcp-project-disconnected', ...data.payload });
          }
          break;
        case 'mcp-event':
          console.log('MCP event received:', data.payload);
          if (this.onEvent) {
            this.onEvent(data.payload);
          }
          break;
        case 'pong':
          // Heartbeat response - connection is alive
          break;
        case 'error':
          console.error('WebSocket server error:', data.message);
          break;
        default:
          console.log('Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, event.data);
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket disconnected:', event.code, event.reason);
    this.updateConnectionStatus('disconnected');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Attempt to reconnect if not manually closed
    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private handleError(): void {
    console.error('WebSocket error occurred');
    this.updateConnectionStatus('disconnected');
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff with jitter
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2 + Math.random() * 1000,
      this.maxReconnectDelay
    );
  }

  private startHeartbeat(): void {
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private updateConnectionStatus(status: ConnectionStatus): void {
    if (this.onConnectionChange) {
      this.onConnectionChange(status);
    }
  }

  // Public methods for subscription management
  subscribeToEvents(eventTypes: string[]): void {
    this.send({
      type: 'subscribe',
      events: eventTypes
    });
  }

  unsubscribeFromEvents(eventTypes: string[]): void {
    this.send({
      type: 'unsubscribe',
      events: eventTypes
    });
  }

  subscribeToRepository(repositoryPath: string): void {
    this.send({
      type: 'subscribe_repository',
      repository: repositoryPath
    });
  }

  subscribeToAgent(agentId: string): void {
    this.send({
      type: 'subscribe_agent',
      agentId: agentId
    });
  }

  subscribeToRoom(roomName: string): void {
    this.send({
      type: 'subscribe_room',
      roomName: roomName
    });
  }

  // Get current connection status
  getConnectionStatus(): ConnectionStatus {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      default:
        return 'disconnected';
    }
  }

  // Force connection status update for debugging
  forceStatusUpdate(): void {
    const currentStatus = this.getConnectionStatus();
    console.log('Current WebSocket status:', currentStatus, 'ReadyState:', this.ws?.readyState);
    if (this.onConnectionChange) {
      this.onConnectionChange(currentStatus);
    }
  }

  // Check if connected and ready
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}