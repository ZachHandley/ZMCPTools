#!/usr/bin/env node

/**
 * ZMCP Agent Wrapper - Supervisor process for Claude agents
 * 
 * Features:
 * - Stays alive as parent process with custom process title
 * - Monitors child process and handles crashes
 * - Configurable rate limit handling with exponential backoff
 * - Database integration for clean vs crash detection
 * - Automatic restart on failures
 * - Signal proxying and proper cleanup
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('better-sqlite3');

// Default configuration
const DEFAULT_CONFIG = {
  // Rate limiting (for Claude Pro/Max users with 5-hour window)
  enableRateLimitHandling: true,
  rateLimitWindow: 5 * 60 * 60 * 1000, // 5 hours in ms
  rateLimitCooldown: 30 * 1000, // 30 seconds initial cooldown
  
  // Restart behavior
  maxRestarts: 5,
  restartDelay: 1000, // 1 second initial delay
  restartBackoffMultiplier: 2,
  maxRestartDelay: 60 * 1000, // 1 minute max delay
  
  // Database path
  dbPath: path.join(process.env.HOME || '', '.mcptools', 'data', 'orchestrator.db'),
  
  // Logging
  verbose: process.env.ZMCP_VERBOSE === 'true'
};

// Agent type abbreviations
const typeAbbreviations = {
  'backend': 'be',
  'frontend': 'fe',
  'testing': 'ts',
  'documentation': 'dc',
  'architect': 'ar',
  'devops': 'dv',
  'analysis': 'an',
  'researcher': 'rs',
  'implementer': 'im',
  'reviewer': 'rv'
};

// Rate limit detection patterns
const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /quota exceeded/i,
  /please wait/i,
  /try again later/i,
  /429/,
  /throttled/i
];

class AgentWrapper {
  constructor(agentType, projectContext, agentId, command, config = {}) {
    this.agentType = agentType;
    this.projectContext = projectContext;
    this.agentId = agentId;
    this.command = command;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.processTitle = this.getProcessTitle();
    this.child = null;
    this.restartCount = 0;
    this.currentRestartDelay = this.config.restartDelay;
    this.isShuttingDown = false;
    this.lastRateLimit = null;
    this.outputBuffer = '';
    this.db = null;
  }

  getProcessTitle() {
    const typeAbbr = typeAbbreviations[this.agentType.toLowerCase()] || 
                     this.agentType.substring(0, 2).toLowerCase();
    const projectShort = this.projectContext.length > 20 ? 
                        this.projectContext.substring(0, 20) : 
                        this.projectContext;
    return `zmcp-${typeAbbr}-${projectShort}-${this.agentId}`;
  }

  log(...args) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${this.processTitle}]`, ...args);
  }

  verbose(...args) {
    if (this.config.verbose) {
      this.log('[VERBOSE]', ...args);
    }
  }

  async initDatabase() {
    try {
      if (fs.existsSync(this.config.dbPath)) {
        this.db = new sqlite3(this.config.dbPath);
        this.verbose('Connected to database');
      } else {
        this.log('Warning: Database not found at', this.config.dbPath);
      }
    } catch (err) {
      this.log('Warning: Failed to connect to database:', err.message);
    }
  }

  async checkAgentStatus() {
    if (!this.db) return null;
    
    try {
      const agent = this.db.prepare(
        'SELECT status, exit_code FROM agents WHERE agent_id = ?'
      ).get(this.agentId);
      
      return agent;
    } catch (err) {
      this.verbose('Failed to check agent status:', err.message);
      return null;
    }
  }

  async updateAgentStatus(status, exitCode = null) {
    if (!this.db) return;
    
    try {
      this.db.prepare(
        'UPDATE agents SET status = ?, exit_code = ?, last_heartbeat = CURRENT_TIMESTAMP WHERE agent_id = ?'
      ).run(status, exitCode, this.agentId);
    } catch (err) {
      this.verbose('Failed to update agent status:', err.message);
    }
  }

  detectRateLimit(data) {
    const text = data.toString();
    this.outputBuffer += text;
    
    // Keep only last 1KB of output to check
    if (this.outputBuffer.length > 1024) {
      this.outputBuffer = this.outputBuffer.slice(-1024);
    }
    
    // Check for rate limit patterns
    for (const pattern of RATE_LIMIT_PATTERNS) {
      if (pattern.test(this.outputBuffer)) {
        return true;
      }
    }
    
    return false;
  }

  shouldWaitForRateLimit() {
    if (!this.config.enableRateLimitHandling || !this.lastRateLimit) {
      return false;
    }
    
    const timeSinceLimit = Date.now() - this.lastRateLimit;
    return timeSinceLimit < this.config.rateLimitWindow;
  }

  getRateLimitWaitTime() {
    if (!this.lastRateLimit) {
      return this.config.rateLimitCooldown;
    }
    
    const timeSinceLimit = Date.now() - this.lastRateLimit;
    const remainingWindow = this.config.rateLimitWindow - timeSinceLimit;
    
    // Add some buffer time
    return Math.max(this.config.rateLimitCooldown, remainingWindow + 5000);
  }

  async start() {
    // Set process title
    process.title = this.processTitle;
    
    // Initialize database
    await this.initDatabase();
    
    // Set up signal handlers
    this.setupSignalHandlers();
    
    // Start the child process
    this.log('Starting agent process');
    await this.spawnChild();
  }

  async spawnChild() {
    if (this.isShuttingDown) {
      this.verbose('Shutdown in progress, not spawning child');
      return;
    }

    // Check if we should wait for rate limit
    if (this.shouldWaitForRateLimit()) {
      const waitTime = this.getRateLimitWaitTime();
      this.log(`Rate limit detected, waiting ${Math.round(waitTime / 1000)}s before retry`);
      await this.updateAgentStatus('rate_limited');
      
      setTimeout(() => {
        this.lastRateLimit = null;
        this.spawnChild();
      }, waitTime);
      return;
    }

    this.verbose('Spawning child process:', this.command.join(' '));
    
    // Clear output buffer for new process
    this.outputBuffer = '';
    
    this.child = spawn(this.command[0], this.command.slice(1), {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ZMCP_AGENT_TYPE: this.agentType,
        ZMCP_PROJECT_CONTEXT: this.projectContext,
        ZMCP_AGENT_ID: this.agentId,
        ZMCP_PROCESS_TITLE: this.processTitle,
        ZMCP_WRAPPER_PID: process.pid.toString()
      }
    });

    // Update status to active
    await this.updateAgentStatus('active');

    // Handle stdout - check for rate limits
    this.child.stdout.on('data', (data) => {
      process.stdout.write(data);
      
      if (this.config.enableRateLimitHandling && this.detectRateLimit(data)) {
        this.log('Rate limit detected in output');
        this.lastRateLimit = Date.now();
        // Kill the child process to trigger restart with delay
        this.child.kill('SIGTERM');
      }
    });

    // Handle stderr - check for rate limits
    this.child.stderr.on('data', (data) => {
      process.stderr.write(data);
      
      if (this.config.enableRateLimitHandling && this.detectRateLimit(data)) {
        this.log('Rate limit detected in error output');
        this.lastRateLimit = Date.now();
        // Kill the child process to trigger restart with delay
        this.child.kill('SIGTERM');
      }
    });

    // Handle child exit
    this.child.on('exit', async (code, signal) => {
      this.verbose(`Child process exited with code ${code}, signal ${signal}`);
      
      if (this.isShuttingDown) {
        this.verbose('Shutdown requested, not restarting');
        await this.updateAgentStatus('terminated', code);
        process.exit(code || 0);
        return;
      }

      // Check if this was a clean exit
      const agentStatus = await this.checkAgentStatus();
      const isCleanExit = code === 0 || 
                         (agentStatus && agentStatus.status === 'completed');

      if (isCleanExit) {
        this.log('Agent completed successfully');
        await this.updateAgentStatus('completed', code);
        process.exit(0);
        return;
      }

      // Handle crash/error
      await this.updateAgentStatus('failed', code);

      // Check if we should restart
      if (this.restartCount >= this.config.maxRestarts) {
        this.log(`Max restarts (${this.config.maxRestarts}) reached, exiting`);
        process.exit(code || 1);
        return;
      }

      // Restart with backoff
      this.restartCount++;
      this.log(`Restarting (attempt ${this.restartCount}/${this.config.maxRestarts}) in ${this.currentRestartDelay}ms`);
      
      setTimeout(() => {
        this.spawnChild();
      }, this.currentRestartDelay);

      // Increase delay for next restart
      this.currentRestartDelay = Math.min(
        this.currentRestartDelay * this.config.restartBackoffMultiplier,
        this.config.maxRestartDelay
      );
    });

    // Handle child errors
    this.child.on('error', (err) => {
      this.log('Failed to start child process:', err.message);
      process.exit(1);
    });
  }

  setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        this.verbose(`Received ${signal}`);
        this.isShuttingDown = true;
        
        if (this.child && !this.child.killed) {
          this.verbose(`Forwarding ${signal} to child`);
          this.child.kill(signal);
        } else {
          await this.updateAgentStatus('terminated');
          process.exit(0);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      this.log('Uncaught exception:', err);
      this.isShuttingDown = true;
      if (this.child && !this.child.killed) {
        this.child.kill('SIGTERM');
      }
      process.exit(1);
    });
  }

  // Load config from environment or file
  static loadConfig() {
    const config = { ...DEFAULT_CONFIG };
    
    // Check for config file
    const configPath = process.env.ZMCP_WRAPPER_CONFIG || 
                      path.join(process.env.HOME || '', '.zmcp-wrapper.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        Object.assign(config, fileConfig);
      } catch (err) {
        console.error('Failed to load config file:', err.message);
      }
    }
    
    // Environment variable overrides
    if (process.env.ZMCP_ENABLE_RATE_LIMIT !== undefined) {
      config.enableRateLimitHandling = process.env.ZMCP_ENABLE_RATE_LIMIT === 'true';
    }
    if (process.env.ZMCP_RATE_LIMIT_WINDOW) {
      config.rateLimitWindow = parseInt(process.env.ZMCP_RATE_LIMIT_WINDOW);
    }
    if (process.env.ZMCP_MAX_RESTARTS) {
      config.maxRestarts = parseInt(process.env.ZMCP_MAX_RESTARTS);
    }
    
    return config;
  }
}

// Parse command line arguments
function parseArgs(argv) {
  const args = argv.slice(2);
  const dashIndex = args.indexOf('--');
  
  if (dashIndex === -1 || dashIndex < 3) {
    return { error: 'usage' };
  }
  
  const [agentType, projectContext, agentId] = args.slice(0, dashIndex);
  const command = args.slice(dashIndex + 1);
  
  if (!agentType || !projectContext || !agentId || command.length === 0) {
    return { error: 'missing' };
  }
  
  return { agentType, projectContext, agentId, command };
}

// Main execution
async function main() {
  const parsed = parseArgs(process.argv);
  
  if (parsed.error === 'usage') {
    console.error('Usage: zmcp-agent-wrapper.cjs <agent-type> <project-context> <agent-id> -- <command...>');
    console.error('Example: zmcp-agent-wrapper.cjs backend oauth-impl a3f2e1 -- claude --verbose');
    console.error('\nConfiguration:');
    console.error('  Set ZMCP_WRAPPER_CONFIG=/path/to/config.json for custom config');
    console.error('  Set ZMCP_ENABLE_RATE_LIMIT=false to disable rate limit handling');
    console.error('  Set ZMCP_RATE_LIMIT_WINDOW=18000000 for custom window (ms)');
    console.error('  Set ZMCP_MAX_RESTARTS=10 for custom restart limit');
    process.exit(1);
  }
  
  if (parsed.error === 'missing') {
    console.error('Missing required arguments');
    process.exit(1);
  }
  
  const { agentType, projectContext, agentId, command } = parsed;
  const config = AgentWrapper.loadConfig();
  
  const wrapper = new AgentWrapper(agentType, projectContext, agentId, command, config);
  await wrapper.start();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AgentWrapper,
    parseArgs,
    typeAbbreviations,
    DEFAULT_CONFIG,
    RATE_LIMIT_PATTERNS
  };
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}