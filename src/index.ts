/**
 * Claude MCP Tools - TypeScript Implementation
 * 
 * Main entry point for the MCP server that provides agent orchestration
 * capabilities for Claude Code environments.
 */

import { McpToolsServer } from './server/McpServer.js';
import { CrashHandler, wrapMainServer } from './utils/crashHandler.js';
import path from 'path';
import os from 'os';

// Export key components for testing and external use
export { ClaudeProcess, ClaudeSpawner, ProcessReaper } from './process/index.js';
export type { ClaudeSpawnConfig } from './process/index.js';

// Default configuration
const DEFAULT_DATA_DIR = path.join(os.homedir(), '.mcptools', 'data');

async function mainServer() {
  // Parse command line arguments for transport options
  const args = process.argv.slice(2);
  const transportIndex = args.indexOf('--transport');
  const portIndex = args.indexOf('--port');
  const hostIndex = args.indexOf('--host');
  
  const transport = (transportIndex !== -1 && args[transportIndex + 1]) ? args[transportIndex + 1] : 'stdio';
  const httpPort = (portIndex !== -1 && args[portIndex + 1]) ? parseInt(args[portIndex + 1]) : 4269;
  const httpHost = (hostIndex !== -1 && args[hostIndex + 1]) ? args[hostIndex + 1] : '127.0.0.1';

  // Get data directory from environment or use default
  const dataDir = process.env.MCPTOOLS_DATA_DIR || DEFAULT_DATA_DIR;
  const databasePath = path.join(dataDir, 'claude_mcp_tools.db');

  // MCP servers must not output to stdout - using stderr for startup messages
  process.stderr.write('🚀 Starting Claude MCP Tools TypeScript Server...\n');
  process.stderr.write(`📁 Data directory: ${dataDir}\n`);
  process.stderr.write(`🗃️ Database path: ${databasePath}\n`);
  process.stderr.write(`🌐 Transport: ${transport.toUpperCase()}\n`);
  if (transport === 'http') {
    process.stderr.write(`🌐 HTTP Host: ${httpHost}:${httpPort}\n`);
  }

  // Create the MCP server
  const server = new McpToolsServer({
    name: 'claude-mcp-tools',
    version: '1.0.0',
    databasePath,
    transport: transport as 'http' | 'stdio',
    httpPort,
    httpHost
  });

  // Set up crash handler with database manager for handling active jobs
  const crashHandler = CrashHandler.getInstance();
  crashHandler.setDatabaseManager(server.getDatabaseManager());

  // Handle graceful shutdown
  const shutdown = async () => {
    process.stderr.write('\n🛑 Shutting down gracefully...\n');
    try {
      await server.stop();
      process.stderr.write('✅ Server stopped successfully\n');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      const crashHandler = CrashHandler.getInstance();
      crashHandler.logError(error instanceof Error ? error : new Error(String(error)), {
        phase: 'shutdown',
        serverName: 'claude-mcp-tools-ts'
      });
      process.exit(1);
    }
  };

  // Set up shutdown handlers (these will be overridden by CrashHandler but good for redundancy)
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the server
  process.stderr.write('🔌 Connecting to MCP transport...\n');
  await server.start();
  process.stderr.write('✅ Claude MCP Tools server started successfully\n');
  process.stderr.write('📡 Ready to receive MCP requests\n');
}

async function main() {
  try {
    // Initialize crash handler FIRST
    const crashHandler = CrashHandler.getInstance();
    crashHandler.setupGlobalHandlers();
    
    process.stderr.write(`💾 Crash logs will be stored in: ${crashHandler.getCrashLogDir()}\n`);

    // Wrap the main server function with crash handling
    const wrappedMainServer = wrapMainServer(mainServer, 'claude-mcp-tools');
    
    // Start the server with crash handling
    await wrappedMainServer();

  } catch (error) {
    process.stderr.write(`❌ Failed to start Claude MCP Tools server: ${error}\n`);
    
    // Log the startup error
    const crashHandler = CrashHandler.getInstance();
    crashHandler.logError(error instanceof Error ? error : new Error(String(error)), {
      phase: 'startup',
      serverName: 'claude-mcp-tools-ts'
    });
    
    process.exit(1);
  }
}

// Only run main if this file is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}