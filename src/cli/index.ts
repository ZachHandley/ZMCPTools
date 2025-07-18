import { Command } from "commander";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { McpToolsServer } from "../server/McpServer.js";
import { DatabaseManager } from "../database/index.js";
import {
  AgentService,
  ObjectiveService,
  CommunicationService,
  MemoryService,
} from "../services/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// Default data directory
const DEFAULT_DATA_DIR = path.join(os.homedir(), ".mcptools", "data");

// Colors for console output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

program
  .name("claude-mcp-tools")
  .description("TypeScript MCP Tools for Claude Agent Orchestration")
  .version("1.0.0");

// MCP Server command
program
  .command("server")
  .description("Start the MCP server for agent orchestration")
  .option(
    "-d, --data-dir <path>",
    "Data directory for SQLite database",
    DEFAULT_DATA_DIR
  )
  .option("-p, --port <number>", "HTTP port for the MCP server", "4269")
  .option("-h, --host <address>", "HTTP host for the MCP server", "127.0.0.1")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (options) => {
    try {
      const databasePath = path.join(options.dataDir, "claude_mcp_tools.db");

      if (options.verbose) {
        console.log(`📂 Using data directory: ${options.dataDir}`);
        console.log(`🗄️  Database path: ${databasePath}`);
      }

      const server = new McpToolsServer({
        name: "claude-mcp-tools-ts",
        version: "1.0.0",
        databasePath,
        repositoryPath: process.cwd(),
        httpPort: parseInt(options.port),
        httpHost: options.host,
      });

      // Handle graceful shutdown
      process.on("SIGINT", async () => {
        console.log("\n🛑 Received SIGINT, shutting down gracefully...");
        await server.stop();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
        await server.stop();
        process.exit(0);
      });

      await server.start();
    } catch (error) {
      console.error("❌ Failed to start MCP server:", error);
      process.exit(1);
    }
  });

// Agent management commands
const agentCmd = program
  .command("agent")
  .description("Agent management commands");

agentCmd
  .command("list")
  .description("List all agents")
  .option("-r, --repository <path>", "Repository path filter", process.cwd())
  .option(
    "-s, --status <status>",
    "Status filter (active, idle, completed, terminated, failed)"
  )
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const agentService = new AgentService(db);
      const agents = await agentService.listAgents(
        options.repository,
        options.status
      );

      console.log(`\n📋 Found ${agents.length} agents:\n`);

      if (agents.length === 0) {
        console.log("   No agents found matching criteria");
        return;
      }

      for (const agent of agents) {
        console.log(`🤖 ${agent.agentName} (${agent.id})`);
        console.log(`   Status: ${agent.status}`);
        console.log(`   Repository: ${agent.repositoryPath}`);
        console.log(`   Last Heartbeat: ${agent.lastHeartbeat}`);
        console.log(
          `   Capabilities: ${(agent.capabilities || []).join(", ")}`
        );
        console.log("");
      }
    } catch (error) {
      console.error("❌ Failed to list agents:", error);
      process.exit(1);
    }
  });

agentCmd
  .command("spawn")
  .description("Spawn a new agent")
  .requiredOption(
    "-t, --type <type>",
    "Agent type (backend, frontend, testing, documentation, etc.)"
  )
  .requiredOption("-r, --repository <path>", "Repository path")
  .requiredOption("-d, --description <desc>", "Task description")
  .option("--data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .option("-c, --capabilities <caps...>", "Agent capabilities")
  .option("--depends-on <ids...>", "Agent IDs this agent depends on")
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const agentService = new AgentService(db);
      const agent = await agentService.createAgent({
        agentName: options.type,
        repositoryPath: options.repository,
        objectiveDescription: options.description,
        capabilities: options.capabilities || ["ALL_TOOLS"],
        dependsOn: options.dependsOn || [],
      });

      console.log(`✅ Agent spawned successfully:`);
      console.log(`   🆔 ID: ${agent.id}`);
      console.log(`   🤖 Type: ${agent.agentName}`);
      console.log(`   📊 Status: ${agent.status}`);
      console.log(`   🔢 PID: ${agent.claudePid || "Not started"}`);
      console.log(`   📁 Repository: ${agent.repositoryPath}`);
      console.log(
        `   ⚡ Capabilities: ${(agent.capabilities || []).join(", ")}`
      );
    } catch (error) {
      console.error("❌ Failed to spawn agent:", error);
      process.exit(1);
    }
  });

agentCmd
  .command("terminate")
  .description("Terminate an agent")
  .requiredOption("-i, --id <agentId>", "Agent ID to terminate")
  .option("--data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const agentService = new AgentService(db);
      try {
        agentService.terminateAgent(options.id);
        console.log(`✅ Agent ${options.id} terminated successfully`);
      } catch (error) {
        console.log(
          `⚠️  Agent ${options.id} not found or already terminated: ${error}`
        );
      }
    } catch (error) {
      console.error("❌ Failed to terminate agent:", error);
      process.exit(1);
    }
  });

// Objective management commands
const objectiveCmd = program.command("objective").description("Objective management commands");

objectiveCmd
  .command("list")
  .description("List objectives")
  .option("-r, --repository <path>", "Repository path", process.cwd())
  .option("-s, --status <status>", "Status filter")
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const objectiveService = new ObjectiveService(db);
      const objectives = await objectiveService.listObjectives(options.repository, {
        status: options.status,
      });

      console.log(`\n📋 Found ${objectives.length} objectives:\n`);

      if (objectives.length === 0) {
        console.log("   No objectives found matching criteria");
        return;
      }

      for (const objective of objectives) {
        console.log(`📝 ${objective.description.slice(0, 60)}... (${objective.id})`);
        console.log(`   📊 Status: ${objective.status}`);
        console.log(`   🏷️  Type: ${objective.objectiveType}`);
        console.log(`   ⭐ Priority: ${objective.priority}`);
        console.log(
          `   👤 Assigned to: ${objective.assignedAgentId || "Unassigned"}`
        );
        console.log(`   📅 Created: ${objective.createdAt}`);
        console.log("");
      }
    } catch (error) {
      console.error("❌ Failed to list objectives:", error);
      process.exit(1);
    }
  });

objectiveCmd
  .command("create")
  .description("Create a new objective")
  .requiredOption("-t, --title <title>", "Objective title")
  .requiredOption("-d, --description <desc>", "Objective description")
  .option("-r, --repository <path>", "Repository path", process.cwd())
  .option("--type <type>", "Objective type", "feature")
  .option("--priority <priority>", "Priority (low, medium, high)", "medium")
  .option("--data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const objectiveService = new ObjectiveService(db);
      const objective = await objectiveService.createObjective({
        description: options.description,
        repositoryPath: options.repository,
        objectiveType: options.type,
        priority: options.priority,
      });

      console.log(`✅ Objective created successfully:`);
      console.log(`   🆔 ID: ${objective.id}`);
      console.log(`   📝 Description: ${objective.description}`);
      console.log(`   🏷️  Type: ${objective.objectiveType}`);
      console.log(`   ⭐ Priority: ${objective.priority}`);
      console.log(`   📊 Status: ${objective.status}`);
    } catch (error) {
      console.error("❌ Failed to create objective:", error);
      process.exit(1);
    }
  });

// Memory management commands
const memoryCmd = program
  .command("memory")
  .description("Shared memory management commands");

memoryCmd
  .command("search")
  .description("Search shared memory")
  .requiredOption("-q, --query <text>", "Search query")
  .option("-r, --repository <path>", "Repository path", process.cwd())
  .option("-a, --agent <name>", "Agent name filter")
  .option("-l, --limit <number>", "Results limit", "10")
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const memoryService = new MemoryService(db);
      const insights = await memoryService.getRelevantMemories(
        options.query,
        options.repository,
        options.agent,
        parseInt(options.limit)
      );

      console.log(`\n🧠 Found ${insights.length} relevant memories:\n`);

      if (insights.length === 0) {
        console.log("   No memories found matching query");
        return;
      }

      for (const insight of insights) {
        console.log(`💡 ${insight.title} (Score: ${insight.relevanceScore})`);
        console.log(`   🤖 Agent: ${insight.agentId}`);
        console.log(`   📅 Created: ${insight.createdAt}`);
        console.log(`   🏷️  Tags: ${insight.tags.join(", ")}`);
        console.log(`   📄 Snippet: ${insight.snippet}`);
        console.log("");
      }
    } catch (error) {
      console.error("❌ Failed to search memory:", error);
      process.exit(1);
    }
  });

memoryCmd
  .command("store")
  .description("Store a memory entry")
  .requiredOption("-t, --title <title>", "Memory title")
  .requiredOption("-c, --content <content>", "Memory content")
  .option("-r, --repository <path>", "Repository path", process.cwd())
  .option("-a, --agent <agent>", "Agent name", "cli-user")
  .option("--type <type>", "Entry type", "insight")
  .option("--tags <tags...>", "Tags for the memory")
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const memoryService = new MemoryService(db);
      const memory = await memoryService.storeMemory(
        options.repository,
        options.agent,
        options.type,
        options.title,
        options.content,
        options.tags || []
      );

      console.log(`✅ Memory stored successfully:`);
      console.log(`   🆔 ID: ${memory.id}`);
      console.log(`   💡 Title: ${memory.title}`);
      console.log(`   🤖 Agent: ${memory.agentId}`);
      console.log(`   🏷️  Type: ${memory.memoryType}`);
      console.log(`   📝 Tags: ${(memory.tags || []).join(", ")}`);
    } catch (error) {
      console.error("❌ Failed to store memory:", error);
      process.exit(1);
    }
  });

// Communication commands
const roomCmd = program
  .command("room")
  .description("Communication room management");

roomCmd
  .command("list")
  .description("List communication rooms")
  .option("-r, --repository <path>", "Repository path", process.cwd())
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const commService = new CommunicationService(db);
      const rooms = await commService.listRooms(options.repository);

      console.log(`\n💬 Found ${rooms.length} rooms:\n`);

      if (rooms.length === 0) {
        console.log("   No communication rooms found");
        console.log("   Create a room using the join_room() MCP tool");
        return;
      }

      for (const room of rooms) {
        const stats = await commService.getRoomStats(room.name);
        console.log(`🏠 ${room.name}`);
        console.log(`   📝 Description: ${room.description}`);
        console.log(`   👥 Participants: ${stats.participantCount}`);
        console.log(`   💬 Messages: ${stats.messageCount}`);
        console.log(`   ⏰ Last Activity: ${stats.lastActivity || "Never"}`);
        console.log("");
      }
    } catch (error) {
      console.error("❌ Failed to list rooms:", error);
      process.exit(1);
    }
  });

roomCmd
  .command("join")
  .description("Join a communication room")
  .requiredOption("-n, --name <name>", "Room name")
  .option("-a, --agent <agent>", "Agent name", "cli-user")
  .option("-r, --repository <path>", "Repository path", process.cwd())
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      const commService = new CommunicationService(db);
      try {
        await commService.joinRoom(options.name, options.agent);
        console.log(`✅ Joined room '${options.name}' as ${options.agent}`);
        console.log(`💡 Use 'zmcp-tools room send' to send messages`);
      } catch (error) {
        console.log(`⚠️  Failed to join room '${options.name}': ${error}`);
      }
    } catch (error) {
      console.error("❌ Failed to join room:", error);
      process.exit(1);
    }
  });

// Installation commands
program
  .command("install")
  .description("Install ZMCPTools globally and configure MCP server")
  .option("--global-only", "Global installation only, skip project setup")
  .option("--project-only", "Project setup only, skip global installation")
  .option("-y, --yes", "Accept all defaults, skip prompts")
  .action(async (options) => {
    try {
      console.log("🚀 Starting ZMCPTools installation...\n");

      // Import and run the installer
      const { install } = await import("../installer/index.js");

      await install({
        globalOnly: options.globalOnly,
        projectOnly: options.projectOnly,
      });
    } catch (error) {
      console.error("❌ Failed to run installation:", error);
      process.exit(1);
    }
  });

program
  .command("uninstall")
  .description("Remove ZMCPTools global installation and MCP server")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (options) => {
    try {
      if (!options.yes) {
        console.log(
          "🗑️  This will remove ZMCPTools global installation and MCP server configuration."
        );
        console.log("❓ Are you sure? (y/N)");

        const answer = await new Promise((resolve) => {
          process.stdin.once("data", (data) => {
            resolve(data.toString().trim().toLowerCase());
          });
        });

        if (answer !== "y" && answer !== "yes") {
          console.log("❌ Uninstall cancelled");
          return;
        }
      }

      // Import and run the uninstaller
      const { uninstall } = await import("../installer/index.js");
      uninstall();
    } catch (error) {
      console.error("❌ Failed to run uninstallation:", error);
      process.exit(1);
    }
  });

// Status and health commands
program
  .command("status")
  .description("Show system status")
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .action(async (options) => {
    try {
      const db = new DatabaseManager({
        path: path.join(options.dataDir, "claude_mcp_tools.db"),
      });
      await db.initialize();

      // Get counts from services
      const agentService = new AgentService(db);
      const objectiveService = new ObjectiveService(db);
      const memoryService = new MemoryService(db);

      console.log(`\n📊 ZMCPTools TypeScript Status:\n`);
      console.log(`   🔗 Database: Connected`);
      console.log(`   📁 Data Directory: ${options.dataDir}`);
      console.log(`   📦 Version: 1.0.0 (TypeScript)`);
      console.log(`   🛠️  Build: ${path.join(process.cwd(), "dist")}`);
      console.log("");

      // Check MCP server configuration
      try {
        const { execSync } = await import("child_process");
        const mcpList = execSync("claude mcp list", { encoding: "utf8" });
        if (mcpList.includes("claude-mcp-tools")) {
          console.log(`   ✅ MCP Server: Configured`);
        } else {
          console.log(
            `   ⚠️  MCP Server: Not configured (run: zmcp-tools install)`
          );
        }
      } catch {
        console.log(`   ❓ MCP Server: Unknown (Claude CLI not available)`);
      }

      console.log("");
      console.log(
        `   For detailed statistics, use specific commands with --repository flag`
      );
    } catch (error) {
      console.error("❌ Failed to get status:", error);
      process.exit(1);
    }
  });

// Dashboard command
program
  .command("dashboard")
  .description("Start the web dashboard interface")
  .option("-p, --port <number>", "Dashboard port", "4270")
  .option("-h, --host <address>", "Dashboard host", "127.0.0.1")
  .option("-s, --site <url>", "Site URL override (e.g., http://127.0.0.1:4270)")
  .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
  .option("--no-browser", "Don't open browser automatically")
  .action(async (options) => {
    try {
      console.log("🌐 Starting ZMCPTools Dashboard...\n");

      // Set environment variables for Astro
      const siteUrl = options.site || `http://${options.host}:${options.port}`;
      process.env.PORT = options.port;
      process.env.HOST = options.host;
      process.env.SITE_URL = siteUrl;
      process.env.DATA_DIR = options.dataDir;

      // Run Astro in production mode
      const dashboardDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dashboard');
      
      const { spawn } = await import('child_process');
      
      console.log(`📂 Dashboard directory: ${dashboardDir}`);
      console.log(`🌍 Starting server at ${siteUrl}`);
      
      // WebSocket is now handled by the Astro server via astro-node-websocket
      console.log(`🔌 WebSocket available at ${siteUrl}/api/ws`);

      // Write dashboard info for MCP server discovery
      const dashboardInfoPath = path.join(options.dataDir, 'dashboard.port');
      const dashboardInfo = {
        url: siteUrl,
        wsUrl: `ws://${options.host}:${options.port}/api/ws`,
        wsPort: options.port,
        port: options.port,
        host: options.host,
        pid: process.pid,
        startTime: new Date().toISOString()
      };
      
      try {
        const fs = await import('fs');
        fs.writeFileSync(dashboardInfoPath, JSON.stringify(dashboardInfo, null, 2));
        console.log(`📝 Dashboard info written to ${dashboardInfoPath}`);
      } catch (error) {
        console.warn(`⚠️  Could not write dashboard info: ${error}`);
      }
      
      const astroProcess = spawn('node', ['dist/server/entry.mjs'], {
        cwd: dashboardDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: options.port,
          HOST: options.host,
          SITE_URL: siteUrl,
          DATA_DIR: options.dataDir
        }
      });

      // Set process title for monitoring
      process.title = 'zmcp-dashboard';

      // Handle graceful shutdown
      const cleanup = async () => {
        try {
          const fs = await import('fs');
          if (fs.existsSync(dashboardInfoPath)) {
            fs.unlinkSync(dashboardInfoPath);
            console.log(`🗑️  Removed dashboard info file`);
          }
        } catch (error) {
          console.warn(`⚠️  Could not remove dashboard info: ${error}`);
        }
      };

      process.on("SIGINT", async () => {
        console.log("\n🛑 Shutting down dashboard...");
        await cleanup();
        astroProcess.kill('SIGTERM');
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        console.log("\n🛑 Shutting down dashboard...");
        await cleanup();
        astroProcess.kill('SIGTERM');
        process.exit(0);
      });

      astroProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ Dashboard process exited with code ${code}`);
          process.exit(code || 1);
        }
      });

    } catch (error) {
      console.error("❌ Failed to start dashboard:", error);
      process.exit(1);
    }
  });

// Add help command that shows enhanced usage
program
  .command("help")
  .description("Show detailed help and usage examples")
  .action(() => {
    console.log(`
🚀 ${colors.bold}ZMCPTools TypeScript${colors.reset} - Enhanced MCP Tools for Claude Code\n`);

    console.log(`${colors.cyan}📦 Installation:${colors.reset}`);
    console.log(
      `   zmcp-tools install              # Full setup (global + project)`
    );
    console.log(
      `   zmcp-tools install --global-only # Global installation only`
    );
    console.log(
      `   zmcp-tools uninstall            # Remove installation\n`
    );

    console.log(`${colors.cyan}🤖 Agent Management:${colors.reset}`);
    console.log(`   zmcp-tools agent list`);
    console.log(
      `   zmcp-tools agent spawn -t backend -r . -d "API development"`
    );
    console.log(`   zmcp-tools agent terminate -i <agent-id>\n`);

    console.log(`${colors.cyan}📋 Objective Management:${colors.reset}`);
    console.log(`   zmcp-tools objective list`);
    console.log(
      `   zmcp-tools objective create -t "User Auth" -d "Implement authentication"\n`
    );

    console.log(`${colors.cyan}🧠 Memory Operations:${colors.reset}`);
    console.log(`   zmcp-tools memory search -q "authentication"`);
    console.log(
      `   zmcp-tools memory store -t "API Design" -c "REST endpoints implemented"\n`
    );

    console.log(`${colors.cyan}💬 Communication:${colors.reset}`);
    console.log(`   zmcp-tools room list`);
    console.log(`   zmcp-tools room join -n "dev-team"\n`);

    console.log(`${colors.cyan}📊 System:${colors.reset}`);
    console.log(`   zmcp-tools status               # System status`);
    console.log(`   zmcp-tools server               # Start MCP server`);
    console.log(`   zmcp-tools dashboard            # Start web dashboard`);
    console.log(
      `   zmcp-tools migrate              # Migrate to Drizzle ORM`
    );
    console.log(
      `   zmcp-tools migrate status       # Check migration status\n`
    );

    console.log(
      `${colors.yellow}💡 For more details: zmcp-tools <command> --help${colors.reset}`
    );
    console.log(
      `${colors.yellow}📖 Check CLAUDE.md for TypeScript usage examples${colors.reset}\n`
    );
  });

// Parse command line arguments
program.parse();

// If no command specified, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
  console.log(
    `\n💡 ${colors.yellow}Run 'zmcp-tools help' for detailed usage examples${colors.reset}`
  );
  console.log(
    `🚀 ${colors.yellow}Quick start: zmcp-tools install${colors.reset}`
  );
}
