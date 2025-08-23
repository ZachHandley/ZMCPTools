import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/node';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { serve } from '@hono/node-server';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  credentials: true
}));

// WebSocket connection tracking
interface WebSocketConnection {
  id: string;
  type: 'dashboard' | 'mcp';
  projectId?: string;
  lastPing: Date;
  ws: WebSocket;
}

const connections = new Map<string, WebSocketConnection>();
const eventSubscriptions = new Map<string, Set<string>>(); // connectionId -> Set<eventType>

// WebSocket event handlers
const handleWebSocketConnection = (ws: WebSocket, req: any) => {
  const connectionId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const connection: WebSocketConnection = {
    id: connectionId,
    type: 'dashboard', // Default to dashboard, can be changed via message
    lastPing: new Date(),
    ws
  };
  
  connections.set(connectionId, connection);
  console.log(`🔌 New WebSocket connection: ${connectionId}`);
  
  // Send welcome message with connection stats
  const stats = getConnectionStats();
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId: connectionId,
    connectionStats: stats,
    timestamp: new Date().toISOString()
  }));
  
  // Broadcast connection stats update
  broadcastConnectionStats();
  
  ws.on('message', (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString());
      handleWebSocketMessage(connectionId, data);
    } catch (error) {
      console.error('❌ Invalid WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`🔌 WebSocket connection closed: ${connectionId}`);
    connections.delete(connectionId);
    eventSubscriptions.delete(connectionId);
    broadcastConnectionStats();
  });
  
  ws.on('error', (error: any) => {
    console.error(`❌ WebSocket error for ${connectionId}:`, error);
  });
  
  // Heartbeat
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      connection.lastPing = new Date();
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);
  
  ws.on('pong', () => {
    connection.lastPing = new Date();
  });
};

const handleWebSocketMessage = (connectionId: string, data: any) => {
  const connection = connections.get(connectionId);
  if (!connection) return;
  
  switch (data.type) {
    case 'subscribe':
      if (data.eventTypes && Array.isArray(data.eventTypes)) {
        const subscriptions = eventSubscriptions.get(connectionId) || new Set();
        data.eventTypes.forEach((eventType: string) => {
          subscriptions.add(eventType);
        });
        eventSubscriptions.set(connectionId, subscriptions);
        console.log(`📡 Client ${connectionId} subscribed to:`, data.eventTypes);
      }
      break;
      
    case 'identify':
      if (data.clientType) {
        connection.type = data.clientType;
        connection.projectId = data.projectId;
        console.log(`🏷️  Client ${connectionId} identified as:`, data.clientType);
        broadcastConnectionStats();
      }
      break;
      
    case 'ping':
      connection.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;
  }
};

const getConnectionStats = () => {
  const stats = {
    dashboardClients: 0,
    mcpClients: 0,
    totalConnections: connections.size
  };
  
  connections.forEach(conn => {
    if (conn.type === 'dashboard') {
      stats.dashboardClients++;
    } else if (conn.type === 'mcp') {
      stats.mcpClients++;
    }
  });
  
  return stats;
};

const broadcastConnectionStats = () => {
  const stats = getConnectionStats();
  const message = JSON.stringify({
    type: 'connection-stats-update',
    payload: stats,
    timestamp: new Date().toISOString()
  });
  
  connections.forEach(conn => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(message);
    }
  });
};

const broadcastEvent = (event: any) => {
  const message = JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date().toISOString()
  });
  
  connections.forEach((conn, connectionId) => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      const subscriptions = eventSubscriptions.get(connectionId);
      if (subscriptions && (subscriptions.has('*') || subscriptions.has(event.type))) {
        conn.ws.send(message);
      }
    }
  });
};

// API Routes
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: getConnectionStats()
  });
});

app.get('/api/stats', (c) => {
  const stats = getConnectionStats();
  return c.json({
    projects: { active: stats.mcpClients, total: stats.mcpClients },
    agents: { active: 0, idle: 0, completed: 0, failed: 0 },
    objectives: { running: 0, pending: 0, completed: 0 },
    rooms: { active: 0, total: 0 },
    plans: { active: 0, total: 0, completed: 0 }
  });
});

app.get('/api/projects', (c) => {
  return c.json([]);
});

app.get('/api/agents', (c) => {
  return c.json([]);
});

app.get('/api/orchestrations', (c) => {
  return c.json([]);
});

app.get('/api/plans', (c) => {
  return c.json([]);
});

app.get('/api/objectives', (c) => {
  return c.json([]);
});

app.get('/api/rooms', (c) => {
  return c.json([]);
});

// Serve static files (Vue SPA build output)
app.use('/assets/*', serveStatic({ root: './dist/' }));
app.use('/favicon.svg', serveStatic({ path: './public/favicon.svg' }));

// Serve Vue SPA for all other routes
app.get('*', (c) => {
  try {
    const indexPath = join(process.cwd(), 'dist', 'index.html');
    const html = readFileSync(indexPath, 'utf-8');
    return c.html(html);
  } catch (error) {
    console.error('Error serving index.html:', error);
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ZMCPTools Dashboard</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .container { max-width: 800px; margin: 50px auto; padding: 20px; text-align: center; }
            .status { background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 ZMCPTools Dashboard</h1>
            <div class="status">
              <h2>Server is running!</h2>
              <p>Build the Vue app first with: <code>npm run build:client</code></p>
              <p>Or run in development mode with: <code>npm run dev</code></p>
            </div>
            <p>WebSocket Server: ✅ Ready</p>
            <p>API Server: ✅ Ready</p>
          </div>
        </body>
      </html>
    `);
  }
});

// Create HTTP server and WebSocket server
const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  handleWebSocketConnection(ws, req);
});

// Mount Hono app to HTTP server  
server.on('request', app.fetch as any);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 ZMCPTools Dashboard server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready for connections`);
  console.log(`📁 Serving static files from ./dist/`);
  
  // Test broadcast every 10 seconds for demo
  setInterval(() => {
    broadcastEvent({
      type: 'test_event',
      message: 'Test broadcast from server',
      timestamp: new Date().toISOString()
    });
  }, 10000);
});

// Export for testing
export default app;