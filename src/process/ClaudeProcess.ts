import { EventEmitter } from "events";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import path, { join } from "path";
import { tmpdir, homedir } from "os";
import { execSync, execFile } from "child_process";
import { spawn } from "child_process";
import { type SDKMessage } from "@anthropic-ai/claude-code";
import { AgentPermissionManager } from "../utils/agentPermissions.js";
import type { AgentType } from "../schemas/agents.js";

export interface ClaudeSpawnConfig {
  workingDirectory: string;
  prompt: string;
  sessionId?: string;
  model?: string;
  capabilities?: string[];
  environmentVars?: Record<string, string>;
  allowedTools?: string[];
  disallowedTools?: string[];
  timeout?: number;
  systemPrompt?: string; // Agent-specific system prompt
  appendSystemPrompt?: string; // Additional post-task instructions
  agentType?: string; // For auto-generating append instructions
  agentId?: string; // For process naming and identification
  roomId?: string; // For coordination-based append instructions
  additionalInstructions?: string; // High-priority instructions from orchestrator
  onSessionIdExtracted?: (sessionId: string) => Promise<void>; // Callback for session ID extraction
}

export class ClaudeProcess extends EventEmitter {
  public readonly pid: number;
  public readonly config: ClaudeSpawnConfig;
  private childProcess: any = null;
  private _exitCode: number | null = null;
  private _hasExited = false;
  private stdoutPath: string;
  private stderrPath: string;
  private runPromise: Promise<void> | null = null;
  private extractedSessionId: string | null = null;
  private sessionIdExtracted = false;
  private stdoutBuffer = '';

  constructor(config: ClaudeSpawnConfig) {
    super();
    this.config = config;
    this.pid = Math.floor(Math.random() * 90000) + 10000; // Generate simple 5-digit PID

    // Set up log files in the dedicated claude_agents directory
    const logDir = join(homedir(), ".mcptools", "logs", "claude_agents");

    try {
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      this.stdoutPath = join(logDir, `claude-${this.pid}-stdout.log`);
      this.stderrPath = join(logDir, `claude-${this.pid}-stderr.log`);
    } catch (error) {
      process.stderr.write(
        `Failed to create log directory ${logDir}, using temp directory: ${error}\n`
      );
      const tempDir = join(tmpdir(), ".claude-logs");
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }
      this.stdoutPath = join(tempDir, `claude-${this.pid}-stdout.log`);
      this.stderrPath = join(tempDir, `claude-${this.pid}-stderr.log`);
    }
  }

  async start(): Promise<void> {
    if (this.runPromise || this._hasExited) {
      return;
    }

    // Set standardized process title for monitoring visibility
    this.setProcessTitle();

    this.runPromise = this.executeQuery();
    return this.runPromise;
  }

  /**
   * Set standardized process title: zmcp-<agenttype>-<goal>-<id>
   */
  private setProcessTitle(): void {
    if (this.config.agentType && this.config.agentId) {
      try {
        const processTitle = AgentPermissionManager.generateProcessTitle(
          this.config.agentType as AgentType,
          this.config.agentId,
          this.config.prompt
        );
        process.title = processTitle;
        process.stderr.write(`Set process title: ${processTitle}\n`);
      } catch (error) {
        process.stderr.write(`Failed to set process title: ${error}\n`);
        // Don't fail the process if title setting fails
      }
    }
  }

  private async executeQuery(): Promise<void> {
    try {
      // Write prompt to temporary file to avoid shell argument issues
      const tempPromptFile = join(tmpdir(), `claude-prompt-${this.pid}.txt`);
      const finalPrompt = this.buildFinalPrompt();
      writeFileSync(tempPromptFile, finalPrompt);
      
      // Build CLI command without the prompt (we'll pipe it via stdin)
      const cliArgs = this.buildCliCommandWithStdin();
      
      // Use spawn for streaming output
      this.childProcess = spawn('claude', cliArgs, {
        cwd: this.config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.environmentVars }
      });
      
      // Check if process started successfully
      if (!this.childProcess.pid) {
        throw new Error('Failed to start child process - no PID assigned');
      }
      
      // Send the prompt via stdin
      this.childProcess.stdin.write(finalPrompt);
      this.childProcess.stdin.end();

      // Handle stdout data (streaming JSON)
      this.childProcess.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        this.stdoutBuffer += chunk;
        
        // Try to parse complete JSON messages from buffer
        this.processStreamOutput();
        
        // Write raw output to log
        try {
          writeFileSync(this.stdoutPath, chunk, { flag: "a" });
        } catch (logError) {
          process.stderr.write(`Failed to write stdout log: ${logError}\n`);
        }
      });

      // Handle stderr data
      this.childProcess.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        
        try {
          writeFileSync(this.stderrPath, chunk, { flag: "a" });
        } catch (logError) {
          process.stderr.write(`Failed to write stderr log: ${logError}\n`);
        }
        
        // Emit stderr events
        this.emit("stderr", {
          data: chunk,
          pid: this.pid,
          messageType: "error",
        });
      });

      // Handle process exit
      this.childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        // Process any remaining buffer content
        if (this.stdoutBuffer.trim()) {
          try {
            const message = JSON.parse(this.stdoutBuffer.trim()) as SDKMessage;
            this.handleCLIMessage(message);
          } catch (parseError) {
            // Emit as raw text if not JSON
            this.emit("stdout", {
              data: this.stdoutBuffer,
              pid: this.pid,
              isJson: false,
              messageType: "text",
            });
          }
        }
        
        this._exitCode = code !== null ? code : (signal ? 1 : 0);
        this._hasExited = true;
        
        if (code === 0) {
          this.emit("exit", { code: 0, signal, pid: this.pid });
        } else {
          this.emit("exit", { code: this._exitCode, signal, pid: this.pid });
        }
      });

      // Handle process errors
      this.childProcess.on('error', (error: Error) => {
        const errorMessage = `Failed to spawn claude CLI: ${error.message}`;
        
        // More detailed error logging
        process.stderr.write(`Claude Process ${this.pid} Error: ${errorMessage}\n`);
        if (error.stack) {
          process.stderr.write(`Stack trace: ${error.stack}\n`);
        }
        
        try {
          writeFileSync(this.stderrPath, errorMessage + '\n', { flag: "a" });
        } catch (logError) {
          process.stderr.write(`Failed to write error log: ${logError}\n`);
        }
        
        this._exitCode = 1;
        this._hasExited = true;
        this.emit("error", { error, pid: this.pid });
        this.emit("exit", { code: 1, signal: null, pid: this.pid });
      });

    } catch (error) {
      // Handle setup errors
      let errorMessage = "Unknown error";
      let errorDetails = "";
      
      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = `Stack: ${error.stack}\n`;
        
        // If there are additional properties on the error object, log them
        const errorProps = Object.getOwnPropertyNames(error);
        for (const prop of errorProps) {
          if (prop !== 'name' && prop !== 'message' && prop !== 'stack') {
            errorDetails += `${prop}: ${(error as any)[prop]}\n`;
          }
        }
      } else {
        errorDetails = `Non-Error object thrown: ${JSON.stringify(error)}\n`;
      }

      const fullErrorLog = `Error: ${errorMessage}\n${errorDetails}`;
      
      try {
        writeFileSync(this.stderrPath, fullErrorLog, {
          flag: "a",
        });
        // Also log to console for immediate debugging
        process.stderr.write(`Claude Process ${this.pid} Error Details:\n${fullErrorLog}`);
      } catch (logError) {
        process.stderr.write(
          `Failed to write error log for process ${this.pid}: ${logError}\n`
        );
        process.stderr.write(`Original error was: ${errorMessage}\n`);
      }

      this._exitCode = 1;
      this._hasExited = true;
      this.emit("error", { error, pid: this.pid });
      this.emit("exit", { code: 1, signal: null, pid: this.pid });
    }
  }

  /**
   * Validate if a string is a valid UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Build the CLI command arguments array
   */
  private buildCliCommand(): string[] {
    const args: string[] = [];
    
    // Always use print mode for non-interactive execution
    args.push('-p');
    
    // Use stream-json output format for line-by-line JSON parsing
    args.push('--output-format', 'stream-json');
    
    // Add model if specified
    if (this.config.model) {
      args.push('--model', this.config.model);
    }
    
    // Add allowed tools - format as space-separated list after flag
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      args.push('--allowedTools', this.config.allowedTools.join(' '));
    }
    
    // Add disallowed tools - format as space-separated list after flag  
    if (this.config.disallowedTools && this.config.disallowedTools.length > 0) {
      args.push('--disallowedTools', this.config.disallowedTools.join(' '));
    }
    
    // Add session ID for resuming - only if it's a valid UUID
    if (this.config.sessionId && this.isValidUUID(this.config.sessionId)) {
      args.push('--resume', this.config.sessionId);
    } else if (this.config.sessionId && !this.isValidUUID(this.config.sessionId)) {
      // Log when we skip using --resume due to invalid UUID format
      process.stderr.write(
        `Skipping --resume flag for session ID "${this.config.sessionId}" - Claude CLI requires UUID format\n`
      );
    }
    
    // Add verbose logging
    args.push('--verbose');
    
    // Skip permission prompts
    args.push('--dangerously-skip-permissions');
    
    // Add append system prompt if available
    const appendSystemPrompt = this.buildAppendSystemPrompt();
    if (appendSystemPrompt) {
      args.push('--append-system-prompt', appendSystemPrompt);
    }
    
    // Build the user prompt (no longer embedding system prompts)
    args.push(this.config.prompt);
    
    return args;
  }

  /**
   * Build the CLI command arguments array for stdin input (no prompt argument)
   */
  private buildCliCommandWithStdin(): string[] {
    const args: string[] = [];
    
    // Always use print mode for non-interactive execution
    args.push('-p');
    
    // Use stream-json output format for line-by-line JSON parsing
    args.push('--output-format', 'stream-json');
    
    // Add model if specified
    if (this.config.model) {
      args.push('--model', this.config.model);
    }
    
    // Add allowed tools - format as space-separated list after flag
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      args.push('--allowedTools', this.config.allowedTools.join(' '));
    }
    
    // Add disallowed tools - format as space-separated list after flag
    if (this.config.disallowedTools && this.config.disallowedTools.length > 0) {
      args.push('--disallowedTools', this.config.disallowedTools.join(' '));
    }
    
    // Add session ID for resuming - only if it's a valid UUID
    if (this.config.sessionId && this.isValidUUID(this.config.sessionId)) {
      args.push('--resume', this.config.sessionId);
    } else if (this.config.sessionId && !this.isValidUUID(this.config.sessionId)) {
      // Log when we skip using --resume due to invalid UUID format
      process.stderr.write(
        `Skipping --resume flag for session ID "${this.config.sessionId}" - Claude CLI requires UUID format\n`
      );
    }
    
    // Add verbose logging
    args.push('--verbose');
    
    // Skip permission prompts
    args.push('--dangerously-skip-permissions');
    
    // Add append system prompt if available
    const appendSystemPrompt = this.buildAppendSystemPrompt();
    if (appendSystemPrompt) {
      args.push('--append-system-prompt', appendSystemPrompt);
    }
    
    // Note: No prompt argument - we'll send it via stdin
    
    return args;
  }

  /**
   * Build the final prompt by combining system prompts with user prompt
   */
  private buildFinalPrompt(): string {
    const systemPrompt = this.buildSystemPrompt();
    
    // If we have system prompts, format them properly
    // Note: appendSystemPrompt is now handled via --append-system-prompt CLI flag
    if (systemPrompt) {
      return this.formatPromptWithSystemPrompt(systemPrompt, this.config.prompt);
    }
    
    // Otherwise just return the user prompt
    return this.config.prompt;
  }

  /**
   * Process streaming output from CLI and emit appropriate events
   */
  private processStreamOutput(): void {
    // Handle json-stream format which outputs one JSON object per line
    const lines = this.stdoutBuffer.split('\n');
    
    // Keep the last line in buffer if it might be incomplete
    if (lines.length > 0 && !this.stdoutBuffer.endsWith('\n')) {
      this.stdoutBuffer = lines.pop() || '';
    } else {
      this.stdoutBuffer = '';
    }
    
    // Process each complete line
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      try {
        // Try to parse as JSON
        const message = JSON.parse(trimmedLine) as SDKMessage;

        // Always attempt to extract session ID from any JSON message
        this.extractSessionIdFromCLIMessage(message);
        
        this.handleCLIMessage(message);
      } catch (parseError) {
        // If we can't parse as JSON, treat as plain text output
        // But also check if it contains session_id as plain text
        if (!this.sessionIdExtracted && trimmedLine.includes('session_id')) {
          const sessionIdMatch = trimmedLine.match(/session_id["\s]*:\s*["']?([a-f0-9-]{36})["']?/i);
          if (sessionIdMatch && sessionIdMatch[1] && this.isValidUUID(sessionIdMatch[1])) {
            this.handleSessionIdExtraction(sessionIdMatch[1]);
          }
        }
        
        this.emit("stdout", {
          data: trimmedLine,
          pid: this.pid,
          isJson: false,
          messageType: "text",
        });
      }
    }
  }

  /**
   * Handle CLI message similar to SDK message handling
   */
  private handleCLIMessage(message: SDKMessage): void {
    try {
      const messageStr = JSON.stringify(message);
      
      // Extract session_id from CLI message if not already extracted
      this.extractSessionIdFromCLIMessage(message);

      // Emit structured message based on type
      switch (message.type) {
        case "assistant":
        case "user":
          this.emit("stdout", {
            data: messageStr,
            pid: this.pid,
            isJson: true,
            messageType: message.type,
          });
          break;

        case "system":
          if (message.session_id) {
            this.handleSessionIdExtraction(message.session_id);
          }
          this.emit("stdout", {
            data: messageStr,
            pid: this.pid,
            isJson: true,
            messageType: "system",
          });
          break;

        case "result":
          if (message.subtype === "success") {
            this.emit("stdout", {
              data: messageStr,
              pid: this.pid,
              isJson: true,
              messageType: "result",
              result: message.result,
            });
          } else {
            this.emit("stderr", {
              data: messageStr,
              pid: this.pid,
              messageType: "error",
            });
          }
          break;
      }
    } catch (error) {
      process.stderr.write(
        `Failed to handle CLI message for process ${this.pid}: ${error}\n`
      );
    }
  }

  /**
   * Extract session_id from CLI message and call callback if configured
   */
  private async extractSessionIdFromCLIMessage(message: SDKMessage): Promise<void> {
    // Skip if already extracted
    if (this.sessionIdExtracted) {
      return;
    }

    try {
      let sessionId: string | undefined;

      // Check for session_id in the message
      if (message.session_id) {
        sessionId = message.session_id;
      } else if (message.type === 'system' && (message as any).session_id) {
        // Handle system init messages that contain session_id at top level
        sessionId = (message as any).session_id;
      }

      // Validate session ID is UUID format before storing
      if (sessionId && this.isValidUUID(sessionId)) {
        this.handleSessionIdExtraction(sessionId);
      } else if (sessionId) {
        process.stderr.write(
          `Ignoring invalid session ID format "${sessionId}" for process ${this.pid} - Claude CLI requires UUID format\n`
        );
      }
    } catch (error) {
      // Log error but don't fail the message handling
      process.stderr.write(
        `Error extracting session ID from CLI message for process ${this.pid}: ${error}\n`
      );
    }
  }

  /**
   * Handle session ID extraction
   */
  private async handleSessionIdExtraction(sessionId: string): Promise<void> {
    this.extractedSessionId = sessionId;
    this.sessionIdExtracted = true;

    // Emit a specific gotSessionId event first
    this.emit('gotSessionId', { sessionId, pid: this.pid });

    // Call the callback if provided
    if (this.config.onSessionIdExtracted) {
      try {
        await this.config.onSessionIdExtracted(sessionId);
      } catch (error) {
        process.stderr.write(
          `Error in session ID callback for process ${this.pid}: ${error}\n`
        );
      }
    }

    // Emit an event for session ID extraction
    this.emit('sessionIdExtracted', { sessionId, pid: this.pid });
  }

  private formatPromptWithSystemPrompt(systemPrompt: string, userPrompt: string): string {
    const parts: string[] = [];
    
    // Add system prompt first
    if (systemPrompt.trim()) {
      parts.push(`<system>\n${systemPrompt.trim()}\n</system>`);
    }
    
    // Add user prompt
    parts.push(userPrompt);
    
    return parts.join('\n\n');
  }

  private buildSystemPrompt(): string {
    // Base ZMCPTools system prompt
    const baseSystemPrompt = `
  You are a specialized Claude agent with access to the ZMCPTools system. You have access to enhanced MCP tools for development, coordination, and knowledge management.
  
  ## 🎯 Best Practices
  
  1. **Use sequential_thinking** for complex multi-step tasks to break down your approach
  2. **Store insights** using \`store_memory()\` for other agents to learn from
  3. **Search memory** before starting work to avoid duplicating efforts
  4. **Join communication rooms** to coordinate with other agents
  5. **Report progress** regularly using \`report_progress()\`
  6. **Analyze project structure** before making changes to understand codebase
  7. **Use knowledge graph** to maintain relationships between code components
  
  ## 🤝 Coordination Patterns
  
  - **Before starting**: Search memory and check for related work
  - **During work**: Store key insights and progress updates
  - **When blocked**: Send messages to relevant agents or rooms
  - **After completion**: Store final insights and lessons learned
  
  ## 📊 Data Storage
  
  All data is stored locally at \`~/.mcptools/data/\` with intelligent caching and cross-agent memory sharing.
  
  Work autonomously and coordinate effectively with other agents to complete your assigned tasks.`;

    // Generate tool-specific guidance based on allowedTools
    const toolPrompt = this.generateToolPrompt();

    // Build the complete system prompt
    let fullSystemPrompt = baseSystemPrompt;

    if (toolPrompt) {
      fullSystemPrompt += `\n\n${toolPrompt}`;
    }

    // Add agent-specific system prompt if provided
    if (this.config.systemPrompt) {
      fullSystemPrompt += `\n\n## Agent-Specific Instructions\n\n${this.config.systemPrompt}`;
    }

    return fullSystemPrompt;
  }

  private buildAppendSystemPrompt(): string {
    const parts: string[] = [];

    // High-priority orchestrator instructions come first
    if (this.config.additionalInstructions) {
      parts.push(`🚨 IMPORTANT: THE FOLLOWING INSTRUCTIONS HAVE BEEN ADDED BY YOUR ORCHESTRATOR:\n\n${this.config.additionalInstructions}`);
    }

    // Base coordination instructions for all agents
    const baseInstructions = this.buildBaseAppendInstructions();
    if (baseInstructions) {
      parts.push(baseInstructions);
    }

    // Agent-type-specific completion instructions
    const agentTypeInstructions = this.buildAgentTypeAppendInstructions();
    if (agentTypeInstructions) {
      parts.push(agentTypeInstructions);
    }

    // Any custom append instructions passed in config
    if (this.config.appendSystemPrompt) {
      parts.push(this.config.appendSystemPrompt);
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }

  private buildBaseAppendInstructions(): string {
    const instructions: string[] = [];

    // Multi-agent coordination instructions
    if (this.config.roomId) {
      instructions.push("📢 Report completion status to your coordination room before terminating.");
      instructions.push("💾 Store key insights in knowledge graph for other agents.");
    } else {
      instructions.push("💾 Store important discoveries in knowledge graph for future reference.");
    }

    return instructions.length > 0 ? `## Completion Protocol\n\n${instructions.map(i => `- ${i}`).join('\n')}` : '';
  }

  private buildAgentTypeAppendInstructions(): string {
    if (!this.config.agentType) return '';

    const agentType = this.config.agentType;
    
    switch (agentType) {
      case 'research':
      case 'research_agent':
        return `## Research Agent Completion\n\n- Report all significant findings to coordination room if assigned\n- Store research patterns and methodologies in knowledge graph\n- Document any dead ends or failed approaches for other agents`;

      case 'backend':
      case 'backend_agent':
        return `## Backend Agent Completion\n\n- Run tests and ensure all pass before completion\n- Store API patterns and architecture decisions in knowledge graph\n- Document database schema changes for frontend agents`;

      case 'frontend':
      case 'frontend_agent':
        return `## Frontend Agent Completion\n\n- Test UI components in development environment\n- Store component patterns and design decisions in knowledge graph\n- Document API integration patterns for other frontend agents`;

      case 'testing':
      case 'testing_agent':
        return `## Testing Agent Completion\n\n- Ensure all tests pass before marking complete\n- Store test patterns and coverage insights in knowledge graph\n- Report any test failures or flaky tests to coordination room`;

      case 'documentation':
      case 'documentation_agent':
        return `## Documentation Agent Completion\n\n- Verify all documentation is accurate and up-to-date\n- Store documentation patterns and templates in knowledge graph\n- Ensure examples and code snippets are tested and working`;

      case 'architect':
      case 'architect_agent':
        return `## Architect Agent Completion\n\n- Verify all spawned agents completed their tasks successfully\n- Store orchestration patterns and coordination strategies in knowledge graph\n- Document lessons learned about agent coordination for future orchestration`;

      case 'devops':
      case 'devops_agent':
        return `## DevOps Agent Completion\n\n- Verify deployment pipeline is working correctly\n- Store infrastructure patterns and deployment strategies in knowledge graph\n- Document any configuration changes for future deployments`;

      default:
        return `## Agent Completion\n\n- Store task-specific insights in knowledge graph\n- Report completion status if in coordination room`;
    }
  }

  private generateToolPrompt(): string {
    if (!this.config.allowedTools || this.config.allowedTools.length === 0) {
      return "";
    }

    const sections: string[] = [];

    // Group tools by category
    const toolCategories = this.categorizeTools(this.config.allowedTools);

    if (Object.keys(toolCategories).length === 0) {
      return "";
    }

    sections.push("## 🛠️ Available MCP Tools");

    // Add category-specific prompts
    if (toolCategories.communication?.length > 0) {
      sections.push(
        this.generateCommunicationToolsPrompt(toolCategories.communication)
      );
    }

    if (toolCategories.knowledge?.length > 0) {
      sections.push(
        this.generateKnowledgeToolsPrompt(toolCategories.knowledge)
      );
    }

    if (toolCategories.fileOps?.length > 0) {
      sections.push(this.generateFileOpsToolsPrompt(toolCategories.fileOps));
    }

    if (toolCategories.projectAnalysis?.length > 0) {
      sections.push(
        this.generateProjectAnalysisToolsPrompt(toolCategories.projectAnalysis)
      );
    }

    if (toolCategories.documentation?.length > 0) {
      sections.push(
        this.generateDocumentationToolsPrompt(toolCategories.documentation)
      );
    }

    if (toolCategories.browser?.length > 0) {
      sections.push(this.generateBrowserToolsPrompt(toolCategories.browser));
    }

    if (toolCategories.tasks?.length > 0) {
      sections.push(this.generateTaskToolsPrompt(toolCategories.tasks));
    }

    if (toolCategories.other?.length > 0) {
      sections.push(this.generateOtherToolsPrompt(toolCategories.other));
    }

    return sections.join("\n\n");
  }

  private categorizeTools(allowedTools: string[]): Record<string, string[]> {
    const categories: Record<string, string[]> = {};

    const toolMapping = {
      communication: [
        "join_room",
        "send_message",
        "wait_for_messages",
        "list_rooms",
        "list_room_messages",
        "close_room",
        "delete_room",
      ],
      knowledge: [
        "store_memory",
        "search_memory",
        "store_knowledge_memory",
        "search_knowledge_graph",
        "find_related_entities",
        "create_knowledge_relationship",
      ],
      fileOps: [
        "list_files",
        "find_files",
        "easy_replace",
        "analyze_file_symbols",
      ],
      projectAnalysis: [
        "analyze_project_structure",
        "generate_project_summary",
        "get_project_overview",
        "update_project_metadata",
        "cleanup_stale_analyses",
      ],
      documentation: [
        "scrape_documentation",
        "get_scraping_status",
        "cancel_scrape_job",
        "force_unlock_job",
        "force_unlock_stuck_jobs",
        "list_documentation_sources",
        "delete_pages_by_pattern",
        "delete_pages_by_ids",
        "delete_all_website_pages",
      ],
      browser: [
        "create_browser_session",
        "navigate_and_scrape",
        "interact_with_page",
        "manage_browser_sessions",
        "navigate_to_url",
      ],
      tasks: [
        "create_task",
        "report_progress",
        "monitor_agents",
        "list_agents",
        "terminate_agent",
        "spawn_agent",
        "orchestrate_objective",
      ],
      other: [], // Will catch any unmatched tools
    };

    // Categorize each allowed tool
    for (const tool of allowedTools) {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      let categorized = false;

      for (const [category, tools] of Object.entries(toolMapping)) {
        if (tools.includes(toolName)) {
          if (!categories[category]) categories[category] = [];
          categories[category].push(tool);
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        if (!categories.other) categories.other = [];
        categories.other.push(tool);
      }
    }

    return categories;
  }

  private generateCommunicationToolsPrompt(tools: string[]): string {
    return `### Agent Coordination & Communication
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      switch (toolName) {
        case "join_room":
          return "- `join_room(room_name, agent_name)` - Join real-time communication room for coordination";
        case "send_message":
          return "- `send_message(room_name, message, mentions)` - Send messages to coordinate with other agents";
        case "wait_for_messages":
          return "- `wait_for_messages(room_name, timeout)` - Wait for messages from other agents";
        case "list_rooms":
          return "- `list_rooms(repository_path, status, limit, offset)` - View available communication rooms";
        case "list_room_messages":
          return "- `list_room_messages(room_name, limit, offset)` - View room chat history";
        case "close_room":
          return "- `close_room(room_name, terminate_agents)` - Close room and cleanup agents";
        case "delete_room":
          return "- `delete_room(room_name, force_delete)` - Permanently delete room";
        default:
          return `- \`${toolName}()\` - Communication tool`;
      }
    })
    .join("\n")}
  
  **Communication Best Practices:**
  - Join rooms early to coordinate with other agents
  - Use mentions (@agent_name) to get specific agent attention
  - Send status updates when starting/completing major tasks
  - Wait for responses when coordination is critical`;
  }

  private generateKnowledgeToolsPrompt(tools: string[]): string {
    return `### Knowledge Graph & Memory
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      switch (toolName) {
        case "store_memory":
          return "- `store_memory(repository_path, agent_id, entry_type, title, content)` - Store insights for other agents";
        case "search_memory":
          return "- `search_memory(repository_path, query_text)` - Search previous agent work and insights";
        case "store_knowledge_memory":
          return "- `store_knowledge_memory(entity_name, entity_type, properties, content)` - Store in knowledge graph";
        case "search_knowledge_graph":
          return "- `search_knowledge_graph(query, search_type)` - Semantic search of knowledge graph";
        case "find_related_entities":
          return "- `find_related_entities(entity_name, relationship_type)` - Find related entities";
        case "create_knowledge_relationship":
          return "- `create_knowledge_relationship(from_entity, to_entity, relationship_type)` - Create entity relationships";
        default:
          return `- \`${toolName}()\` - Knowledge management tool`;
      }
    })
    .join("\n")}
  
  **Knowledge Management Best Practices:**
  - Search memory before starting work to avoid duplication
  - Store key insights and discoveries for other agents
  - Use knowledge graph to track code component relationships
  - Create relationships between related entities (files, functions, concepts)`;
  }

  private generateFileOpsToolsPrompt(tools: string[]): string {
    return `### Enhanced File Operations
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      switch (toolName) {
        case "list_files":
          return "- `list_files(directory, show_hidden, max_depth)` - Smart file listing with ignore patterns";
        case "find_files":
          return "- `find_files(pattern, directory)` - Pattern-based file search with content matching";
        case "easy_replace":
          return "- `easy_replace(file_path, old_text, new_text)` - Fuzzy string replacement with smart matching";
        case "analyze_file_symbols":
          return "- `analyze_file_symbols(file_path)` - Extract functions, classes, and symbols from code";
        default:
          return `- \`${toolName}()\` - File operation tool`;
      }
    })
    .join("\n")}
  
  **File Operations Best Practices:**
  - Use smart ignore patterns to avoid listing irrelevant files
  - Leverage fuzzy matching for safer text replacements
  - Analyze symbols before making structural changes`;
  }

  private generateProjectAnalysisToolsPrompt(tools: string[]): string {
    return `### Project Analysis
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      switch (toolName) {
        case "analyze_project_structure":
          return "- `analyze_project_structure(project_path, output_format)` - Generate comprehensive project analysis";
        case "generate_project_summary":
          return "- `generate_project_summary(project_path)` - AI-optimized project overview";
        case "get_project_overview":
          return "- `get_project_overview(project_path)` - Get cached project overview";
        case "update_project_metadata":
          return "- `update_project_metadata(project_path, metadata)` - Update project metadata";
        case "cleanup_stale_analyses":
          return "- `cleanup_stale_analyses(days_old)` - Clean up old analysis files";
        default:
          return `- \`${toolName}()\` - Project analysis tool`;
      }
    })
    .join("\n")}
  
  **Project Analysis Best Practices:**
  - Run project analysis before making significant changes
  - Use cached overviews for faster subsequent operations
  - Update metadata when project structure changes significantly`;
  }

  private generateDocumentationToolsPrompt(tools: string[]): string {
    return `### Documentation Intelligence
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      switch (toolName) {
        case "scrape_documentation":
          return "- `scrape_documentation(url, max_pages, selectors)` - Scrape and index documentation";
        case "get_scraping_status":
          return "- `get_scraping_status()` - Check status of documentation scraping jobs";
        case "cancel_scrape_job":
          return "- `cancel_scrape_job(job_id)` - Cancel active scraping job";
        case "force_unlock_job":
          return "- `force_unlock_job(job_id)` - Force unlock stuck scraping job";
        case "force_unlock_stuck_jobs":
          return "- `force_unlock_stuck_jobs()` - Force unlock all stuck jobs";
        case "list_documentation_sources":
          return "- `list_documentation_sources()` - List configured documentation sources";
        case "delete_pages_by_pattern":
          return "- `delete_pages_by_pattern(url_patterns)` - Delete pages matching URL patterns";
        case "delete_pages_by_ids":
          return "- `delete_pages_by_ids(page_ids)` - Delete specific pages by IDs";
        case "delete_all_website_pages":
          return "- `delete_all_website_pages(website_url)` - Delete all pages for a website";
        default:
          return `- \`${toolName}()\` - Documentation tool`;
      }
    })
    .join("\n")}
  
  **Documentation Best Practices:**
  - Scrape relevant documentation before implementation
  - Use semantic search to find specific implementation patterns
  - Monitor scraping status for long-running jobs`;
  }

  private generateBrowserToolsPrompt(tools: string[]): string {
    return `### Browser Automation
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      switch (toolName) {
        case "create_browser_session":
          return "- `create_browser_session()` - Create new browser session with auto-close";
        case "navigate_and_scrape":
          return "- `navigate_and_scrape(url, scrape_options)` - Navigate and scrape in one operation";
        case "interact_with_page":
          return "- `interact_with_page(actions)` - Click, type, hover, select, screenshot, scroll";
        case "manage_browser_sessions":
          return "- `manage_browser_sessions(action)` - List, close, cleanup browser sessions";
        case "navigate_to_url":
          return "- `navigate_to_url(session_id, url)` - Navigate to URL in existing session";
        default:
          return `- \`${toolName}()\` - Browser automation tool`;
      }
    })
    .join("\n")}
  
  **Browser Automation Best Practices:**
  - Sessions auto-close when idle to save resources
  - Use navigate_and_scrape for simple content extraction
  - Interact with page for complex user interactions`;
  }

  private generateTaskToolsPrompt(tools: string[]): string {
    return `### Task Management & Agent Coordination
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      switch (toolName) {
        case "create_task":
          return "- `create_task(repository_path, task_type, title, description)` - Create development tasks";
        case "report_progress":
          return "- `report_progress(agent_id, status, progress_percentage, message)` - Report task progress";
        case "monitor_agents":
          return "- `monitor_agents(repository_path)` - Monitor agents with real-time updates";
        case "list_agents":
          return "- `list_agents(repository_path, status_filter)` - List active agents";
        case "terminate_agent":
          return "- `terminate_agent(agent_id)` - Terminate specific agents";
        case "spawn_agent":
          return "- `spawn_agent(type, repository_path, task_description)` - Create specialized agents";
        case "orchestrate_objective":
          return "- `orchestrate_objective(objective, repository_path)` - Coordinate multi-agent workflows";
        default:
          return `- \`${toolName}()\` - Task management tool`;
      }
    })
    .join("\n")}
  
  **Task Management Best Practices:**
  - Report progress regularly to keep team informed
  - Use orchestrate_objective for complex multi-agent workflows
  - Monitor other agents to avoid conflicts and coordinate work`;
  }

  private generateOtherToolsPrompt(tools: string[]): string {
    if (tools.length === 0) return "";

    return `### Additional Tools
  
  ${tools
    .map((tool) => {
      const toolName = tool.replace(/^mcp__claude-mcp-tools__/, "");
      return `- \`${toolName}()\` - Additional MCP tool`;
    })
    .join("\n")}`;
  }


  /**
   * Get the extracted session ID
   */
  public getExtractedSessionId(): string | null {
    return this.extractedSessionId;
  }

  hasExited(): boolean {
    return this._hasExited;
  }

  get exitCode(): number | null {
    return this._exitCode;
  }

  terminate(signal: NodeJS.Signals = "SIGTERM"): void {
    if (!this._hasExited && this.childProcess) {
      try {
        this.childProcess.kill(signal);
        // For compatibility, we'll set exit code based on signal
        this._exitCode = signal === "SIGKILL" ? 137 : 143;
        this._hasExited = true;
        this.emit("exit", { code: this._exitCode, signal, pid: this.pid });
      } catch (error) {
        process.stderr.write(`Failed to terminate child process ${this.pid}: ${error}\n`);
      }
    }
  }

  cleanup(): void {
    this.removeAllListeners();
    if (!this._hasExited) {
      this.terminate("SIGKILL");
    }
  }
}
