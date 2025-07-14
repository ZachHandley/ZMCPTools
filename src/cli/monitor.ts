import { Command } from "commander";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { DatabaseManager } from "../database/index.js";
import {
  AgentRepository,
  TaskRepository,
  CommunicationRepository,
  KnowledgeEntityRepository,
  MemoryRepository,
} from "../repositories/index.js";
import {
  AgentService,
  TaskService,
  CommunicationService,
  MemoryService,
} from "../services/index.js";
import { eventBus } from "../services/EventBus.js";
import { Logger } from "../utils/logger.js";
import type {
  AgentSession,
  Task,
  ChatRoom,
  ChatMessage,
  KnowledgeEntity,
  Memory,
  AgentStatus,
  TaskStatus,
} from "../schemas/index.js";
import { writeFileSync } from "fs";
import * as http from "http";

const execAsync = promisify(exec);

// Default data directory
const DEFAULT_DATA_DIR = path.join(os.homedir(), ".mcptools", "data");

// Terminal colors
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
  underline: "\x1b[4m",
};

// Status color mapping
const statusColors: Record<string, string> = {
  active: colors.green,
  idle: colors.yellow,
  completed: colors.blue,
  terminated: colors.dim,
  failed: colors.red,
  initializing: colors.cyan,
  pending: colors.yellow,
  in_progress: colors.green,
};

// Process info interface
interface ProcessInfo {
  pid: number;
  ppid: number;
  command: string;
  args: string;
  startTime: string;
  cpuTime: string;
  memoryKB: number;
}

// Monitor options
interface MonitorOptions {
  dataDir: string;
  output: "cli" | "html" | "json";
  refresh?: number;
  repository?: string;
  status?: string;
  room?: string;
  limit?: number;
  showKnowledge?: boolean;
  showMemory?: boolean;
  showProcesses?: boolean;
  watch?: boolean;
  port?: number;
}

// Monitoring data interface
interface MonitoringData {
  timestamp: Date;
  orchestrations: OrchestrationInfo[];
  agents: AgentInfo[];
  tasks: TaskInfo[];
  rooms: RoomInfo[];
  knowledge: KnowledgeEntity[];
  memories: Memory[];
  processes: ProcessInfo[];
  stats: SystemStats;
}

interface OrchestrationInfo {
  id: string;
  title: string;
  status: string;
  progress: number;
  currentPhase: string;
  startTime: Date;
  agentCount: number;
  taskCount: number;
  roomName?: string;
}

interface AgentInfo extends AgentSession {
  process?: ProcessInfo;
  currentTask?: Task;
  recentMessages?: ChatMessage[];
  actuallyAlive?: boolean;
}

interface TaskInfo extends Task {
  dependencies: Task[];
  dependents: Task[];
}

interface RoomInfo extends ChatRoom {
  participantCount: number;
  recentMessages: ChatMessage[];
  activeAgents: string[];
}

interface SystemStats {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  pendingTasks: number;
  activeTasks: number;
  totalRooms: number;
  activeRooms: number;
  totalKnowledgeEntities: number;
  totalMemories: number;
  runningProcesses: number;
}

class ClaudeMonitor {
  private logger: Logger;
  private db: DatabaseManager;
  private agentRepo: AgentRepository;
  private taskRepo: TaskRepository;
  private commRepo: CommunicationRepository;
  private knowledgeRepo: KnowledgeEntityRepository;
  private memoryRepo: MemoryRepository;

  constructor(private options: MonitorOptions) {
    this.logger = new Logger("ClaudeMonitor");
    this.db = new DatabaseManager({
      path: path.join(options.dataDir, "claude_mcp_tools.db"),
    });
    
    this.agentRepo = new AgentRepository(this.db);
    this.taskRepo = new TaskRepository(this.db);
    this.commRepo = new CommunicationRepository(this.db);
    this.knowledgeRepo = new KnowledgeEntityRepository(this.db);
    this.memoryRepo = new MemoryRepository(this.db);
  }

  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  /**
   * Get system processes matching Claude agents
   */
  private async getProcessInfo(): Promise<ProcessInfo[]> {
    try {
      // Use ps command to get process info
      const { stdout } = await execAsync(
        `ps aux | grep -E "(claude|mcp|agent)" | grep -v grep`
      );

      const processes: ProcessInfo[] = [];
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 11) {
          const pid = parseInt(parts[1]);
          const cpuTime = parts[9];
          const memoryKB = parseInt(parts[5]);
          const startTime = parts[8];
          const command = parts[10];
          const args = parts.slice(11).join(" ");

          // Check if this is a Claude agent process
          if (
            command.includes("claude") ||
            args.includes("agent") ||
            args.includes("mcp-tools")
          ) {
            processes.push({
              pid,
              ppid: parseInt(parts[2]),
              command,
              args,
              startTime,
              cpuTime,
              memoryKB,
            });
          }
        }
      }

      return processes;
    } catch (error) {
      this.logger.debug("Failed to get process info:", error);
      return [];
    }
  }

  /**
   * Check if a process is alive by PID
   */
  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      // First try /proc on Linux
      if (process.platform === 'linux') {
        const fs = await import('fs');
        try {
          await fs.promises.access(`/proc/${pid}`);
          return true;
        } catch {
          return false;
        }
      }
      
      // Fallback to ps command for other platforms or if /proc fails
      const { stdout } = await execAsync(`ps -p ${pid} -o pid=`);
      return stdout.trim().length > 0;
    } catch (error) {
      // If ps command fails, process doesn't exist
      return false;
    }
  }

  /**
   * Get orchestration info from active orchestrations
   */
  private async getOrchestrations(): Promise<OrchestrationInfo[]> {
    // Since orchestrations are tracked in memory by StructuredOrchestrator,
    // we'll infer them from agents and tasks with orchestration metadata
    const agents = await this.agentRepo.findActiveAgents(this.options.repository);
    const orchestrationMap = new Map<string, OrchestrationInfo>();

    for (const agent of agents) {
      const orchestrationId = agent.agentMetadata?.orchestrationId as string;
      if (orchestrationId) {
        if (!orchestrationMap.has(orchestrationId)) {
          orchestrationMap.set(orchestrationId, {
            id: orchestrationId,
            title: agent.agentMetadata?.orchestrationTitle as string || "Unknown",
            status: "in_progress",
            progress: 0,
            currentPhase: agent.agentMetadata?.phase as string || "unknown",
            startTime: new Date(agent.createdAt),
            agentCount: 0,
            taskCount: 0,
            roomName: agent.roomId,
          });
        }
        
        const orch = orchestrationMap.get(orchestrationId)!;
        orch.agentCount++;
      }
    }

    // Get task counts
    for (const orch of orchestrationMap.values()) {
      const tasks = await this.taskRepo.findByRepositoryPath(
        this.options.repository || process.cwd()
      );
      
      const orchTasks = tasks.filter(
        t => {
          const metadata = t.results as Record<string, any>;
          return metadata?.orchestrationId === orch.id;
        }
      );
      orch.taskCount = orchTasks.length;
      
      // Calculate progress based on completed tasks
      const completedTasks = orchTasks.filter(t => t.status === "completed").length;
      orch.progress = orchTasks.length > 0 
        ? Math.round((completedTasks / orchTasks.length) * 100)
        : 0;
    }

    const result: OrchestrationInfo[] = [];
    orchestrationMap.forEach(value => result.push(value));
    return result;
  }

  /**
   * Collect all monitoring data
   */
  async collectData(): Promise<MonitoringData> {
    const [
      agents,
      tasks,
      rooms,
      knowledge,
      memories,
      processes,
      orchestrations,
    ] = await Promise.all([
      this.collectAgentData(),
      this.collectTaskData(),
      this.collectRoomData(),
      this.options.showKnowledge ? this.collectKnowledgeData() : [],
      this.options.showMemory ? this.collectMemoryData() : [],
      this.options.showProcesses ? this.getProcessInfo() : [],
      this.getOrchestrations(),
    ]);

    // Calculate stats
    const stats: SystemStats = {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === "active" && a.actuallyAlive !== false).length,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === "pending").length,
      activeTasks: tasks.filter(t => t.status === "in_progress").length,
      totalRooms: rooms.length,
      activeRooms: rooms.filter(r => r.activeAgents.length > 0).length,
      totalKnowledgeEntities: knowledge.length,
      totalMemories: memories.length,
      runningProcesses: processes.length,
    };

    return {
      timestamp: new Date(),
      orchestrations,
      agents,
      tasks,
      rooms,
      knowledge,
      memories,
      processes,
      stats,
    };
  }

  /**
   * Collect agent data with process matching
   */
  private async collectAgentData(): Promise<AgentInfo[]> {
    const filter: any = {};
    if (this.options.repository) {
      filter.repositoryPath = this.options.repository;
    }
    if (this.options.status) {
      filter.status = this.options.status as AgentStatus;
    }

    const result = await this.agentRepo.findFiltered({
      ...filter,
      limit: this.options.limit || 100,
    });

    const processes = this.options.showProcesses ? await this.getProcessInfo() : [];
    const agentInfos: AgentInfo[] = [];

    for (const agent of result.agents) {
      const agentInfo: AgentInfo = { ...agent };

      // Check if the process is actually alive
      if (agent.claudePid) {
        const isAlive = await this.isProcessAlive(agent.claudePid);
        
        // If process is dead but agent status shows as active, update the display status
        if (!isAlive && (agent.status === "active" || agent.status === "idle")) {
          agentInfo.status = "terminated";
          agentInfo.actuallyAlive = false;
        } else {
          agentInfo.actuallyAlive = isAlive;
        }

        // Match process by PID if it's alive
        if (isAlive && processes.length > 0) {
          agentInfo.process = processes.find(p => p.pid === agent.claudePid);
        }
      }

      // Get current task
      const tasks = await this.taskRepo.findByAssignedAgent(agent.id);
      agentInfo.currentTask = tasks.find(t => t.status === "in_progress");

      // Get recent messages if in a room
      if (agent.roomId) {
        const messages = await this.commRepo.getMessages({
          roomId: agent.roomId,
          limit: 5,
        });
        agentInfo.recentMessages = messages;
      }

      agentInfos.push(agentInfo);
    }

    return agentInfos;
  }

  /**
   * Collect task data with dependencies
   */
  private async collectTaskData(): Promise<TaskInfo[]> {
    const filter: any = {};
    if (this.options.repository) {
      filter.repositoryPath = this.options.repository;
    }
    if (this.options.status) {
      filter.status = this.options.status as TaskStatus;
    }

    const result = await this.taskRepo.findFiltered({
      ...filter,
      limit: this.options.limit || 100,
    });

    const taskInfos: TaskInfo[] = [];

    for (const task of result.tasks) {
      const [dependencies, dependents] = await Promise.all([
        this.taskRepo.getDependencies(task.id),
        this.taskRepo.getDependents(task.id),
      ]);

      taskInfos.push({
        ...task,
        dependencies,
        dependents,
      });
    }

    return taskInfos;
  }

  /**
   * Collect room data with participants and messages
   */
  private async collectRoomData(): Promise<RoomInfo[]> {
    const rooms = await this.commRepo.listRooms(
      this.options.repository || process.cwd()
    );

    const roomInfos: RoomInfo[] = [];

    for (const room of rooms) {
      if (this.options.room && room.name !== this.options.room) {
        continue;
      }

      const [participants, messages] = await Promise.all([
        this.commRepo.getParticipants({ roomId: room.id }),
        this.commRepo.getMessages({ roomId: room.id, limit: 10 }),
      ]);

      const activeAgents = participants
        .filter(p => p.status === "active")
        .map(p => p.agentId);

      roomInfos.push({
        ...room,
        participantCount: participants.length,
        recentMessages: messages,
        activeAgents,
      });
    }

    return roomInfos;
  }

  /**
   * Collect knowledge graph data
   */
  private async collectKnowledgeData(): Promise<KnowledgeEntity[]> {
    const entities = await this.knowledgeRepo.findByRepositoryPath(
      this.options.repository || process.cwd()
    );
    
    return entities
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, this.options.limit || 20);
  }

  /**
   * Collect memory data
   */
  private async collectMemoryData(): Promise<Memory[]> {
    const memories = await this.memoryRepo.findByRepositoryPath(
      this.options.repository || process.cwd()
    );
    
    return memories
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, this.options.limit || 20);
  }

  /**
   * Render data as CLI output
   */
  private renderCLI(data: MonitoringData): void {
    console.clear();
    
    // Header
    console.log(`${colors.bold}${colors.cyan}🔍 Claude MCP Tools Monitor${colors.reset}`);
    console.log(`${colors.dim}${data.timestamp.toLocaleString()}${colors.reset}`);
    console.log(`${colors.dim}${"─".repeat(80)}${colors.reset}\n`);

    // System Stats
    this.renderStats(data.stats);

    // Orchestrations
    if (data.orchestrations.length > 0) {
      this.renderOrchestrations(data.orchestrations);
    }

    // Active Agents
    if (data.agents.length > 0) {
      this.renderAgents(data.agents);
    }

    // Tasks
    if (data.tasks.length > 0) {
      this.renderTasks(data.tasks);
    }

    // Communication Rooms
    if (data.rooms.length > 0) {
      this.renderRooms(data.rooms);
    }

    // Knowledge Graph
    if (this.options.showKnowledge && data.knowledge.length > 0) {
      this.renderKnowledge(data.knowledge);
    }

    // Memories
    if (this.options.showMemory && data.memories.length > 0) {
      this.renderMemories(data.memories);
    }

    // Processes
    if (this.options.showProcesses && data.processes.length > 0) {
      this.renderProcesses(data.processes);
    }

    // Footer
    console.log(`\n${colors.dim}${"─".repeat(80)}${colors.reset}`);
    console.log(`${colors.dim}Press Ctrl+C to exit${colors.reset}`);
  }

  private renderStats(stats: SystemStats): void {
    console.log(`${colors.bold}📊 System Overview${colors.reset}`);
    console.log(`   Agents: ${colors.green}${stats.activeAgents}${colors.reset}/${stats.totalAgents} active`);
    console.log(`   Tasks: ${colors.green}${stats.activeTasks}${colors.reset}/${stats.totalTasks} active, ${colors.yellow}${stats.pendingTasks}${colors.reset} pending`);
    console.log(`   Rooms: ${colors.green}${stats.activeRooms}${colors.reset}/${stats.totalRooms} active`);
    
    if (this.options.showKnowledge) {
      console.log(`   Knowledge: ${colors.blue}${stats.totalKnowledgeEntities}${colors.reset} entities`);
    }
    
    if (this.options.showMemory) {
      console.log(`   Memories: ${colors.blue}${stats.totalMemories}${colors.reset} entries`);
    }
    
    if (this.options.showProcesses) {
      console.log(`   Processes: ${colors.green}${stats.runningProcesses}${colors.reset} running`);
    }
    
    console.log("");
  }

  private renderOrchestrations(orchestrations: OrchestrationInfo[]): void {
    console.log(`${colors.bold}🎭 Active Orchestrations${colors.reset}`);
    
    for (const orch of orchestrations) {
      const statusColor = statusColors[orch.status] || colors.white;
      console.log(`\n   ${colors.bold}${orch.title}${colors.reset} (${orch.id.slice(0, 8)})`);
      console.log(`   Status: ${statusColor}${orch.status}${colors.reset} | Phase: ${colors.cyan}${orch.currentPhase}${colors.reset}`);
      console.log(`   Progress: ${this.renderProgressBar(orch.progress)} ${orch.progress}%`);
      console.log(`   Agents: ${orch.agentCount} | Tasks: ${orch.taskCount}`);
      
      if (orch.roomName) {
        console.log(`   Room: ${colors.magenta}${orch.roomName}${colors.reset}`);
      }
    }
    
    console.log("");
  }

  private renderAgents(agents: AgentInfo[]): void {
    console.log(`${colors.bold}🤖 Agents${colors.reset}`);
    
    for (const agent of agents) {
      const statusColor = statusColors[agent.status] || colors.white;
      console.log(`\n   ${colors.bold}${agent.agentName}${colors.reset} (${agent.id.slice(0, 8)})`);
      
      // Show actual process status
      if (agent.actuallyAlive === false) {
        console.log(`   Status: ${statusColor}${agent.status}${colors.reset} ${colors.red}(process dead)${colors.reset}`);
      } else {
        console.log(`   Status: ${statusColor}${agent.status}${colors.reset}`);
      }
      
      if (agent.claudePid) {
        const pidStatus = agent.actuallyAlive ? '' : ` ${colors.red}(dead)${colors.reset}`;
        console.log(`   PID: ${agent.claudePid}${pidStatus}`);
        
        if (agent.process) {
          console.log(`   CPU: ${agent.process.cpuTime} | Memory: ${(agent.process.memoryKB / 1024).toFixed(1)}MB`);
        }
      }
      
      if (agent.currentTask) {
        console.log(`   Task: ${colors.yellow}${agent.currentTask.description.slice(0, 50)}...${colors.reset}`);
      }
      
      if (agent.roomId) {
        console.log(`   Room: ${colors.magenta}${agent.roomId}${colors.reset}`);
      }
      
      if (agent.recentMessages && agent.recentMessages.length > 0) {
        const lastMsg = agent.recentMessages[0];
        console.log(`   Last: "${colors.dim}${lastMsg.message.slice(0, 60)}...${colors.reset}"`);
      }
      
      console.log(`   Heartbeat: ${colors.dim}${this.formatTimeDiff(new Date(agent.lastHeartbeat))}${colors.reset}`);
    }
    
    console.log("");
  }

  private renderTasks(tasks: TaskInfo[]): void {
    console.log(`${colors.bold}📋 Tasks${colors.reset}`);
    
    // Group by status
    const grouped = tasks.reduce((acc, task) => {
      if (!acc[task.status]) acc[task.status] = [];
      acc[task.status].push(task);
      return acc;
    }, {} as Record<string, TaskInfo[]>);
    
    for (const [status, statusTasks] of Object.entries(grouped)) {
      const statusColor = statusColors[status] || colors.white;
      console.log(`\n   ${statusColor}${status.toUpperCase()}${colors.reset} (${statusTasks.length})`);
      
      for (const task of statusTasks.slice(0, 5)) {
        console.log(`   • ${task.description.slice(0, 60)}...`);
        
        if (task.assignedAgentId) {
          console.log(`     Agent: ${colors.cyan}${task.assignedAgentId.slice(0, 8)}${colors.reset}`);
        }
        
        if (task.dependencies.length > 0) {
          console.log(`     Depends on: ${task.dependencies.length} tasks`);
        }
        
        if (task.dependents.length > 0) {
          console.log(`     Blocks: ${task.dependents.length} tasks`);
        }
      }
    }
    
    console.log("");
  }

  private renderRooms(rooms: RoomInfo[]): void {
    console.log(`${colors.bold}💬 Communication Rooms${colors.reset}`);
    
    for (const room of rooms) {
      const isActive = room.activeAgents.length > 0;
      const statusIcon = isActive ? "🟢" : "⚪";
      
      console.log(`\n   ${statusIcon} ${colors.bold}${room.name}${colors.reset}`);
      console.log(`   Participants: ${room.participantCount} (${room.activeAgents.length} active)`);
      
      if (room.recentMessages.length > 0) {
        console.log(`   Recent activity:`);
        
        for (const msg of room.recentMessages.slice(0, 3)) {
          const time = this.formatTimeDiff(new Date(msg.timestamp));
          console.log(`     ${colors.dim}[${time}]${colors.reset} ${colors.cyan}${msg.agentName}:${colors.reset} ${msg.message.slice(0, 50)}...`);
        }
      }
    }
    
    console.log("");
  }

  private renderKnowledge(entities: KnowledgeEntity[]): void {
    console.log(`${colors.bold}🧠 Knowledge Graph${colors.reset}`);
    
    // Group by type
    const grouped = entities.reduce((acc, entity) => {
      if (!acc[entity.entityType]) acc[entity.entityType] = [];
      acc[entity.entityType].push(entity);
      return acc;
    }, {} as Record<string, KnowledgeEntity[]>);
    
    for (const [type, typeEntities] of Object.entries(grouped)) {
      console.log(`\n   ${colors.cyan}${type}${colors.reset} (${typeEntities.length})`);
      
      for (const entity of typeEntities.slice(0, 3)) {
        const importance = "⭐".repeat(Math.ceil(entity.importanceScore * 5));
        console.log(`   • ${entity.name} ${importance}`);
        
        if (entity.description) {
          console.log(`     ${colors.dim}${entity.description.slice(0, 60)}...${colors.reset}`);
        }
      }
    }
    
    console.log("");
  }

  private renderMemories(memories: Memory[]): void {
    console.log(`${colors.bold}💭 Recent Memories${colors.reset}`);
    
    for (const memory of memories.slice(0, 5)) {
      const time = this.formatTimeDiff(new Date(memory.createdAt));
      console.log(`\n   ${colors.bold}${memory.title}${colors.reset} ${colors.dim}(${time})${colors.reset}`);
      console.log(`   Agent: ${colors.cyan}${memory.agentId}${colors.reset} | Type: ${memory.memoryType}`);
      console.log(`   ${colors.dim}${memory.content.slice(0, 80)}...${colors.reset}`);
      
      if (memory.tags && memory.tags.length > 0) {
        console.log(`   Tags: ${memory.tags.map(t => `${colors.blue}#${t}${colors.reset}`).join(" ")}`);
      }
    }
    
    console.log("");
  }

  private renderProcesses(processes: ProcessInfo[]): void {
    console.log(`${colors.bold}⚙️  System Processes${colors.reset}`);
    
    for (const proc of processes) {
      console.log(`\n   PID ${proc.pid} (PPID: ${proc.ppid})`);
      console.log(`   ${proc.command} ${proc.args.slice(0, 60)}...`);
      console.log(`   CPU: ${proc.cpuTime} | Memory: ${(proc.memoryKB / 1024).toFixed(1)}MB`);
      console.log(`   Started: ${proc.startTime}`);
    }
    
    console.log("");
  }

  /**
   * Render data as HTML
   */
  private renderHTML(data: MonitoringData): string {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude MCP Tools Monitor</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: #e0e0e0;
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        h1, h2 {
            color: #00d4ff;
            margin-top: 30px;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: #2a2a2a;
            border-radius: 8px;
            padding: 20px;
            border: 1px solid #333;
        }
        
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #00ff88;
        }
        
        .stat-label {
            color: #888;
            font-size: 0.9em;
        }
        
        .card {
            background: #2a2a2a;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid #333;
        }
        
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .status-active { background: #00ff88; color: #000; }
        .status-idle { background: #ffaa00; color: #000; }
        .status-completed { background: #0088ff; color: #fff; }
        .status-failed { background: #ff4444; color: #fff; }
        .status-pending { background: #888; color: #fff; }
        
        .progress-bar {
            background: #333;
            height: 20px;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            background: linear-gradient(90deg, #00ff88, #00d4ff);
            height: 100%;
            transition: width 0.3s;
        }
        
        .message {
            background: #1a1a1a;
            padding: 10px;
            border-radius: 4px;
            margin: 5px 0;
            border-left: 3px solid #00d4ff;
        }
        
        .timestamp {
            color: #666;
            font-size: 0.85em;
        }
        
        .refresh-info {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #2a2a2a;
            padding: 10px 20px;
            border-radius: 8px;
            border: 1px solid #333;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #333;
        }
        
        th {
            background: #1a1a1a;
            color: #00d4ff;
            font-weight: 600;
        }
        
        .auto-refresh {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
        }
    </style>
    ${this.options.refresh ? `<meta http-equiv="refresh" content="${this.options.refresh}">` : ''}
</head>
<body>
    <div class="container">
        <h1>🔍 Claude MCP Tools Monitor</h1>
        <p class="timestamp">Last updated: ${data.timestamp.toLocaleString()}</p>
        
        ${this.options.refresh ? `
        <div class="refresh-info auto-refresh">
            Auto-refresh: ${this.options.refresh}s
        </div>
        ` : ''}
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${data.stats.activeAgents}</div>
                <div class="stat-label">Active Agents</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${data.stats.activeTasks}</div>
                <div class="stat-label">Active Tasks</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${data.stats.activeRooms}</div>
                <div class="stat-label">Active Rooms</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${data.stats.runningProcesses}</div>
                <div class="stat-label">Processes</div>
            </div>
        </div>
        
        ${data.orchestrations.length > 0 ? `
        <h2>🎭 Active Orchestrations</h2>
        ${data.orchestrations.map(orch => `
        <div class="card">
            <h3>${orch.title}</h3>
            <p>ID: ${orch.id} | Phase: ${orch.currentPhase}</p>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${orch.progress}%"></div>
            </div>
            <p>${orch.progress}% complete | ${orch.agentCount} agents | ${orch.taskCount} tasks</p>
        </div>
        `).join('')}
        ` : ''}
        
        ${data.agents.length > 0 ? `
        <h2>🤖 Agents</h2>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Current Task</th>
                    <th>Room</th>
                    <th>Last Heartbeat</th>
                </tr>
            </thead>
            <tbody>
                ${data.agents.map(agent => `
                <tr>
                    <td>${agent.agentName}</td>
                    <td><span class="status status-${agent.status}">${agent.status}</span></td>
                    <td>${agent.currentTask ? agent.currentTask.description.slice(0, 50) + '...' : '-'}</td>
                    <td>${agent.roomId || '-'}</td>
                    <td class="timestamp">${this.formatTimeDiff(new Date(agent.lastHeartbeat))}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : ''}
        
        ${data.rooms.length > 0 ? `
        <h2>💬 Communication Rooms</h2>
        ${data.rooms.map(room => `
        <div class="card">
            <h3>${room.name}</h3>
            <p>${room.participantCount} participants (${room.activeAgents.length} active)</p>
            ${room.recentMessages.length > 0 ? `
            <div class="messages">
                ${room.recentMessages.slice(0, 5).map(msg => `
                <div class="message">
                    <strong>${msg.agentName}:</strong> ${msg.message}
                    <span class="timestamp">${this.formatTimeDiff(new Date(msg.timestamp))}</span>
                </div>
                `).join('')}
            </div>
            ` : '<p>No recent messages</p>'}
        </div>
        `).join('')}
        ` : ''}
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Render data as JSON
   */
  private renderJSON(data: MonitoringData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Helper: Render progress bar
   */
  private renderProgressBar(progress: number): string {
    const width = 20;
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return `[${colors.green}${"█".repeat(filled)}${colors.dim}${"░".repeat(empty)}${colors.reset}]`;
  }

  /**
   * Helper: Format time difference
   */
  private formatTimeDiff(date: Date): string {
    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    await this.initialize();

    if (this.options.watch) {
      // Watch mode with live updates
      const interval = (this.options.refresh || 2) * 1000;
      
      const update = async () => {
        try {
          const data = await this.collectData();
          
          switch (this.options.output) {
            case "cli":
              this.renderCLI(data);
              break;
            case "html":
              if (this.options.port) {
                // Serve HTML via HTTP
                this.startHTMLServer(this.options.port);
              } else {
                // Write to file
                writeFileSync("monitor.html", this.renderHTML(data));
                console.log("Monitor output written to monitor.html");
              }
              break;
            case "json":
              console.log(this.renderJSON(data));
              break;
          }
        } catch (error) {
          console.error("Error updating monitor:", error);
        }
      };

      // Initial update
      await update();

      // Set up interval
      setInterval(update, interval);

      // Handle graceful shutdown
      process.on("SIGINT", async () => {
        console.log("\n\nShutting down monitor...");
        await this.close();
        process.exit(0);
      });
    } else {
      // Single run
      const data = await this.collectData();
      
      switch (this.options.output) {
        case "cli":
          this.renderCLI(data);
          break;
        case "html":
          writeFileSync("monitor.html", this.renderHTML(data));
          console.log("Monitor output written to monitor.html");
          break;
        case "json":
          console.log(this.renderJSON(data));
          break;
      }
      
      await this.close();
    }
  }

  /**
   * Start HTML server for live monitoring
   */
  private startHTMLServer(port: number): void {
    const server = http.createServer(async (req: any, res: any) => {
      if (req.url === "/") {
        const data = await this.collectData();
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(this.renderHTML(data));
      } else if (req.url === "/api/data") {
        const data = await this.collectData();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(this.renderJSON(data));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(port, () => {
      console.log(`\n${colors.green}✅ Monitor server running at http://localhost:${port}${colors.reset}`);
      console.log(`${colors.dim}Press Ctrl+C to stop${colors.reset}\n`);
    });
  }
}

// Export the command setup
export function setupMonitorCommand(program: Command): void {
  program
    .command("monitor")
    .description("Monitor Claude agents, tasks, and system activity")
    .option("-d, --data-dir <path>", "Data directory", DEFAULT_DATA_DIR)
    .option("-o, --output <type>", "Output format (cli, html, json)", "cli")
    .option("-r, --repository <path>", "Filter by repository path")
    .option("-s, --status <status>", "Filter by status")
    .option("--room <name>", "Filter by room name")
    .option("-l, --limit <number>", "Limit results per category", "50")
    .option("-w, --watch", "Watch mode with live updates")
    .option("--refresh <seconds>", "Refresh interval in seconds", "2")
    .option("-k, --knowledge", "Show knowledge graph entities")
    .option("-m, --memory", "Show memory entries")
    .option("-p, --processes", "Show system processes")
    .option("--port <number>", "Port for HTML server (watch mode)")
    .action(async (options) => {
      const monitorOptions: MonitorOptions = {
        dataDir: options.dataDir,
        output: options.output,
        repository: options.repository,
        status: options.status,
        room: options.room,
        limit: parseInt(options.limit),
        showKnowledge: options.knowledge,
        showMemory: options.memory,
        showProcesses: options.processes,
        watch: options.watch,
        refresh: options.refresh ? parseInt(options.refresh) : undefined,
        port: options.port ? parseInt(options.port) : undefined,
      };

      const monitor = new ClaudeMonitor(monitorOptions);
      
      try {
        await monitor.start();
      } catch (error) {
        console.error(`${colors.red}❌ Monitor error:${colors.reset}`, error);
        process.exit(1);
      }
    });
}