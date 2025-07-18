import type { APIRoute } from 'astro';

// Enhanced client tracking with subscriptions and activity
interface DashboardClient {
  id: string;
  socket: WebSocket;
  subscriptions: string[];
  connectedAt: Date;
  lastActivity: Date;
}

interface McpServerClient {
  id: string;
  socket: WebSocket;
  projectId?: string;
  connectedAt: Date;
  lastActivity: Date;
}

// Track connected clients
const dashboardClients = new Map<string, DashboardClient>();
const mcpClients = new Map<string, McpServerClient>();
let clientIdCounter = 0;

export const GET: APIRoute = (ctx) => {
  console.log('WebSocket endpoint hit, isUpgradeRequest:', ctx.locals.isUpgradeRequest);
  console.log('Headers:', Object.fromEntries(ctx.request.headers.entries()));
  
  // Check if this is a WebSocket upgrade request
  if (!ctx.locals.isUpgradeRequest) {
    return new Response('Upgrade Required', { status: 426 });
  }

  console.log('Attempting WebSocket upgrade...');
  const { response, socket } = ctx.locals.upgradeWebSocket();
  console.log('WebSocket upgrade successful');
  
  // Generate client ID
  const clientId = `client_${++clientIdCounter}`;
  
  // Detect client type from headers
  const userAgent = ctx.request.headers.get('user-agent') || '';
  const clientType = ctx.request.headers.get('x-client-type') || 
                    (userAgent.includes('node') ? 'mcp-server' : 'dashboard');
  
  console.log(`WebSocket client connected: ${clientId} (${clientType})`);
  
  // Store client based on type
  if (clientType === 'mcp-server') {
    mcpClients.set(clientId, { 
      id: clientId, 
      socket, 
      connectedAt: new Date(),
      lastActivity: new Date()
    });
  } else {
    dashboardClients.set(clientId, { 
      id: clientId, 
      socket, 
      subscriptions: [],
      connectedAt: new Date(),
      lastActivity: new Date()
    });
  }
  
  // Handle incoming messages
  socket.onmessage = (event) => {
    console.log(`Raw message received from ${clientId}:`, event.data);
    try {
      const message = JSON.parse(event.data);
      console.log(`Parsed message from ${clientId}:`, message);
      
      if (clientType === 'mcp-server') {
        handleMcpServerMessage(clientId, message);
      } else {
        handleDashboardMessage(clientId, message);
      }
    } catch (error) {
      console.error(`WebSocket message parse error from ${clientId}:`, event.data, error);
    }
  };
  
  // Handle connection close
  socket.onclose = () => {
    console.log(`WebSocket client disconnected: ${clientId}`);
    
    const mcpClient = mcpClients.get(clientId);
    if (mcpClient) {
      // Notify dashboard clients that MCP project disconnected
      broadcastToDashboardClients({
        type: 'mcp-project-disconnected',
        payload: {
          clientId,
          projectId: mcpClient.projectId
        }
      });
      mcpClients.delete(clientId);
    }
    
    dashboardClients.delete(clientId);
  };
  
  // Handle errors
  socket.onerror = (error) => {
    console.error(`WebSocket client error (${clientId}):`, error);
  };
  
  // Send welcome message after connection is established
  socket.onopen = () => {
    socket.send(JSON.stringify({ 
      type: 'welcome', 
      clientId,
      serverTime: new Date().toISOString(),
      connectionStats: {
        dashboardClients: dashboardClients.size,
        mcpClients: mcpClients.size,
        totalConnections: dashboardClients.size + mcpClients.size
      }
    }));
    
    // Broadcast current connection stats to all dashboard clients
    broadcastToDashboardClients({
      type: 'connection-stats-update',
      payload: {
        dashboardClients: dashboardClients.size,
        mcpClients: mcpClients.size,
        totalConnections: dashboardClients.size + mcpClients.size
      }
    });
  };
  
  return response;
};

// Enhanced message handlers
function handleDashboardMessage(clientId: string, message: any) {
  const client = dashboardClients.get(clientId);
  if (!client) return;
  
  client.lastActivity = new Date();

  switch (message.type) {
    case 'subscribe':
      if (Array.isArray(message.events)) {
        client.subscriptions = [...new Set([...client.subscriptions, ...message.events])];
        console.log(`Dashboard client ${clientId} subscribed to:`, message.events);
      }
      break;

    case 'unsubscribe':
      if (Array.isArray(message.events)) {
        client.subscriptions = client.subscriptions.filter(
          sub => !message.events.includes(sub)
        );
        console.log(`Dashboard client ${clientId} unsubscribed from:`, message.events);
      }
      break;

    case 'subscribe_repository':
      if (message.repository) {
        client.subscriptions.push(`repo:${message.repository}`);
        console.log(`Dashboard client ${clientId} subscribed to repository: ${message.repository}`);
      }
      break;

    case 'subscribe_agent':
      if (message.agentId) {
        client.subscriptions.push(`agent:${message.agentId}`);
        console.log(`Dashboard client ${clientId} subscribed to agent: ${message.agentId}`);
      }
      break;

    case 'subscribe_room':
      if (message.roomName) {
        client.subscriptions.push(`room:${message.roomName}`);
        console.log(`Dashboard client ${clientId} subscribed to room: ${message.roomName}`);
      }
      break;

    case 'ping':
      sendToDashboardClient(client, { type: 'pong' });
      break;

    default:
      console.log('Unknown dashboard message type:', message.type);
  }
}

function handleMcpServerMessage(clientId: string, message: any) {
  const client = mcpClients.get(clientId);
  if (!client) return;
  
  client.lastActivity = new Date();

  switch (message.type) {
    case 'register':
      client.projectId = message.projectId;
      console.log(`📊 MCP server registered: ${clientId} for project ${message.projectId}`);
      
      // Broadcast to dashboard clients that a new MCP project is active
      const projectInfo = {
        id: message.projectId,
        clientId,
        serverInfo: message.serverInfo,
        connectedAt: client.connectedAt
      };
      
      broadcastToDashboardClients({
        type: 'mcp-project-connected',
        payload: projectInfo
      });
      break;

    case 'event':
      // Broadcast events from MCP servers to dashboard clients
      broadcastToSubscribedClients(message.eventType || 'general', {
        type: 'mcp-event',
        payload: {
          clientId,
          projectId: client.projectId,
          eventType: message.eventType,
          data: message.data
        }
      });
      break;

    case 'ping':
      sendToMcpClient(client, { type: 'pong' });
      break;

    default:
      console.log('Unknown MCP server message type:', message.type);
  }
}

// Helper functions
function sendToDashboardClient(client: DashboardClient, message: any) {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
}

function sendToMcpClient(client: McpServerClient, message: any) {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
}

function broadcastToDashboardClients(message: any) {
  for (const client of dashboardClients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }
}

function broadcastToSubscribedClients(eventType: string, data: any) {
  for (const client of dashboardClients.values()) {
    if (client.subscriptions.includes('*') || client.subscriptions.includes(eventType)) {
      sendToDashboardClient(client, {
        type: 'event',
        eventType,
        payload: data
      });
    }
  }
}

// Cleanup inactive connections periodically
setInterval(() => {
  const now = new Date();
  const timeout = 5 * 60 * 1000; // 5 minutes

  // Cleanup dashboard clients
  for (const [clientId, client] of dashboardClients.entries()) {
    if (now.getTime() - client.lastActivity.getTime() > timeout) {
      console.log(`Cleaning up inactive dashboard client: ${clientId}`);
      try {
        client.socket.close();
      } catch (error) {
        console.error(`Error closing dashboard client ${clientId}:`, error);
      }
      dashboardClients.delete(clientId);
    }
  }

  // Cleanup MCP clients
  for (const [clientId, client] of mcpClients.entries()) {
    if (now.getTime() - client.lastActivity.getTime() > timeout) {
      console.log(`Cleaning up inactive MCP client: ${clientId}`);
      try {
        client.socket.close();
      } catch (error) {
        console.error(`Error closing MCP client ${clientId}:`, error);
      }
      mcpClients.delete(clientId);
    }
  }
}, 30000); // Run every 30 seconds

// Export stats function for monitoring
export function getWebSocketStats() {
  return {
    dashboardClients: dashboardClients.size,
    mcpClients: mcpClients.size,
    totalConnections: dashboardClients.size + mcpClients.size,
    clients: {
      dashboard: Array.from(dashboardClients.values()).map(c => ({
        id: c.id,
        subscriptions: c.subscriptions,
        connectedAt: c.connectedAt,
        lastActivity: c.lastActivity
      })),
      mcp: Array.from(mcpClients.values()).map(c => ({
        id: c.id,
        projectId: c.projectId,
        connectedAt: c.connectedAt,
        lastActivity: c.lastActivity
      }))
    }
  };
}

// Export broadcast function for external use
export function broadcastEvent(eventType: string, data: any) {
  broadcastToSubscribedClients(eventType, data);
}