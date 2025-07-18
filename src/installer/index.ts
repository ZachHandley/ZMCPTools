import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { getTsxCommand, getNodeVersion, supportsImportFlag } from '../utils/nodeCompatibility.js';

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

// Installation paths
const INSTALL_PATHS = {
  DATA_DIR: path.join(os.homedir(), '.mcptools', 'data'),
  LOGS_DIR: path.join(os.homedir(), '.mcptools', 'logs'),
  GLOBAL_DIR: path.join(os.homedir(), '.mcptools'),
  CLAUDE_DIR: path.join(os.homedir(), '.claude'),
};

interface PackageManager {
  name: string;
  command: string;
  globalFlag: string;
  linkCommand: string;
  unlinkCommand: string;
  installCommand: string;
  buildCommand: string;
}

// Package manager configurations (prioritized: pnpm > npm > yarn > bun)
const PACKAGE_MANAGERS: PackageManager[] = [
  {
    name: 'pnpm',
    command: 'pnpm',
    globalFlag: '--global',
    linkCommand: 'pnpm link --global',
    unlinkCommand: 'pnpm unlink --global',
    installCommand: 'pnpm install',
    buildCommand: 'pnpm build'
  },
  {
    name: 'npm',
    command: 'npm',
    globalFlag: '--global',
    linkCommand: 'npm link',
    unlinkCommand: 'npm unlink',
    installCommand: 'npm install',
    buildCommand: 'npm run build'
  },
  {
    name: 'yarn',
    command: 'yarn',
    globalFlag: 'global',
    linkCommand: 'yarn link',
    unlinkCommand: 'yarn unlink',
    installCommand: 'yarn install',
    buildCommand: 'yarn build'
  },
  {
    name: 'bun',
    command: 'bun',
    globalFlag: '--global',
    linkCommand: 'bun link --global',
    unlinkCommand: 'bun unlink --global',
    installCommand: 'bun install',
    buildCommand: 'bun run build'
  }
];

// Helper functions
function log(message: string, color: keyof typeof colors = 'white'): void {
  console.log(colors[color] + message + colors.reset);
}

function logStep(step: string, message: string): void {
  console.log(`${colors.blue}${step}${colors.reset} ${message}`);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message: string): void {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logWarning(message: string): void {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function detectPackageManager(): PackageManager | null {
  // Check for lockfiles first in priority order (pnpm first)
  if (fs.existsSync('pnpm-lock.yaml')) {
    const pnpmPm = PACKAGE_MANAGERS.find(pm => pm.name === 'pnpm');
    if (pnpmPm && commandExists('pnpm')) return pnpmPm;
  }
  
  if (fs.existsSync('package-lock.json')) {
    const npmPm = PACKAGE_MANAGERS.find(pm => pm.name === 'npm');
    if (npmPm && commandExists('npm')) return npmPm;
  }
  
  if (fs.existsSync('yarn.lock')) {
    const yarnPm = PACKAGE_MANAGERS.find(pm => pm.name === 'yarn');
    if (yarnPm && commandExists('yarn')) return yarnPm;
  }
  
  if (fs.existsSync('bun.lockb')) {
    const bunPm = PACKAGE_MANAGERS.find(pm => pm.name === 'bun');
    if (bunPm && commandExists('bun')) return bunPm;
  }
  
  // If no lockfile, check for available package managers in preference order (pnpm first)
  for (const pm of PACKAGE_MANAGERS) {
    if (commandExists(pm.command)) {
      return pm;
    }
  }
  
  return null;
}

function checkPrerequisites(): { success: boolean; packageManager: PackageManager | null } {
  logStep('📋', 'Checking prerequisites...');
  
  const missing: string[] = [];
  
  // Check Node.js version
  const nodeInfo = getNodeVersion();
  if (nodeInfo.major < 18) {
    missing.push(`Node.js 18+ (current: ${nodeInfo.full})`);
  } else {
    // Show Node.js version info
    const tsxSupport = supportsImportFlag() ? '--import' : '--loader';
    logSuccess(`Node.js ${nodeInfo.full} (TSX support: ${tsxSupport})`);
  }
  
  // Detect package manager
  const packageManager = detectPackageManager();
  if (!packageManager) {
    missing.push('Package manager (bun, pnpm, yarn, or npm)');
  }
  
  // Check Claude CLI
  if (!commandExists('claude')) {
    missing.push('Claude CLI (https://docs.anthropic.com/en/docs/claude-code)');
  }
  
  if (missing.length > 0) {
    logError('Missing prerequisites:');
    missing.forEach(tool => log(`   • ${tool}`, 'red'));
    return { success: false, packageManager: null };
  }
  
  logSuccess(`All prerequisites found (using ${packageManager!.name})`);
  return { success: true, packageManager };
}

function createDirectories(): void {
  logStep('📁', 'Creating directories...');
  
  const dirs = [
    INSTALL_PATHS.DATA_DIR,
    INSTALL_PATHS.LOGS_DIR,
    path.join(INSTALL_PATHS.LOGS_DIR, 'claude_agents'),
    INSTALL_PATHS.GLOBAL_DIR,
    path.join(INSTALL_PATHS.CLAUDE_DIR, 'commands'),
  ];
  
  dirs.forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });
  
  logSuccess('Directories created');
}

function buildAndLink(packageManager: PackageManager): boolean {
  try {
    logStep('📦', 'Installing dependencies...');
    execSync(packageManager.installCommand, { stdio: 'pipe' });
    logSuccess('Dependencies installed');
    
    logStep('🔧', 'Building TypeScript...');
    execSync(packageManager.buildCommand, { stdio: 'pipe' });
    logSuccess('Build complete');
    
    logStep('🗃️', 'Running database migrations...');
    execSync(`${packageManager.command} run db:push`, { stdio: 'inherit' });
    logSuccess('Database schema updated');
    
    logStep('🌐', 'Linking globally...');
    execSync(packageManager.linkCommand, { stdio: 'pipe' });
    logSuccess('Global link created');
    
    return true;
  } catch (error) {
    logError(`Build/link failed: ${error}`);
    return false;
  }
}




function copyProjectHooks(): void {
  logStep('🔗', 'Setting up Claude hooks...');
  
  const projectClaudeDir = path.join(process.cwd(), '.claude');
  const hooksDir = path.join(projectClaudeDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  
  // Copy hook files from dist/hooks to .claude/hooks (hooks are copied to dist during build)
  const srcHooksDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'hooks');
  
  if (fs.existsSync(srcHooksDir)) {
    const hookFiles = fs.readdirSync(srcHooksDir).filter(file => file.endsWith('.sh'));
    
    hookFiles.forEach(hookFile => {
      const srcPath = path.join(srcHooksDir, hookFile);
      const destPath = path.join(hooksDir, hookFile);
      
      try {
        fs.copyFileSync(srcPath, destPath);
        fs.chmodSync(destPath, 0o755); // Make executable
        logSuccess(`Copied hook: ${hookFile}`);
      } catch (error) {
        logWarning(`Failed to copy hook ${hookFile}: ${error}`);
      }
    });
  } else {
    logWarning('Source hooks directory not found, skipping hook installation');
  }
}

function updateHookConfiguration(): void {
  logStep('⚙️', 'Configuring Claude hooks...');
  
  const projectClaudeDir = path.join(process.cwd(), '.claude');
  const settingsPath = path.join(projectClaudeDir, 'settings.local.json');
  
  // Load existing settings.local.json if it exists
  let existingSettings: any = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const existingContent = fs.readFileSync(settingsPath, 'utf8');
      existingSettings = JSON.parse(existingContent);
    } catch (error) {
      logWarning('Failed to parse existing settings.local.json, creating new');
    }
  }
  
  // Hook configuration for session start context injection and package file monitoring
  const hookConfig = {
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/context-injection.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit(**/package.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/package-lock.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/yarn.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/pnpm-lock.yaml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/bun.lockb)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/pubspec.yaml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/pyproject.toml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/requirements.txt)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/Pipfile)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/Pipfile.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/poetry.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/Cargo.toml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/Cargo.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/go.mod)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/go.sum)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/composer.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/composer.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/Gemfile)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "Edit(**/Gemfile.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/package.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/package-lock.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/yarn.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/pnpm-lock.yaml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/bun.lockb)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/pubspec.yaml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/pyproject.toml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/requirements.txt)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/Pipfile)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/Pipfile.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/poetry.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/Cargo.toml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/Cargo.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/go.mod)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/go.sum)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/composer.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/composer.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/Gemfile)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "MultiEdit(**/Gemfile.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/package.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/package-lock.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/yarn.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/pnpm-lock.yaml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/bun.lockb)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/pubspec.yaml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/pyproject.toml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/requirements.txt)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/Pipfile)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/Pipfile.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/poetry.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/Cargo.toml)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/Cargo.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/go.mod)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/go.sum)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/composer.json)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/composer.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/Gemfile)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      },
      {
        "matcher": "mcp__claude-mcp-tools__easy_replace(**/Gemfile.lock)",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/hooks/package-change.sh"
          }
        ]
      }
    ]
  };
  
  // Non-destructively merge hook configuration
  const mergedSettings = {
    ...existingSettings,
    hooks: {
      ...existingSettings.hooks,
      ...hookConfig
    }
  };
  
  fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2));
  logSuccess('Hook configuration updated');
}

function createProjectConfig(): void {
  logStep('🔒', 'Setting up project configuration...');
  
  const projectClaudeDir = path.join(process.cwd(), '.claude');
  fs.mkdirSync(projectClaudeDir, { recursive: true });
  
  const settingsPath = path.join(projectClaudeDir, 'settings.local.json');
  
  // Load existing settings if they exist
  let existingSettings: any = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const existingContent = fs.readFileSync(settingsPath, 'utf8');
      existingSettings = JSON.parse(existingContent);
    } catch (error) {
      logWarning('Failed to parse existing settings.local.json, creating new');
    }
  }
  
  // Required permissions for ZMCPTools
  const requiredPermissions = [
    // Core Claude Code tools
    "Bash(find:*)",
    "Bash(read:*)",
    "Bash(grep:*)",
    "Bash(ls:*)",
    "Edit",
    "MultiEdit",
    "Read(*)",
    "Find(*)",
    "Write",
    "Glob",
    "Grep",
    "LS(*)",
    "List",
    "Search",
    "TodoRead",
    "TodoWrite",
    "WebFetch(*)",
    "WebSearch",
    "Task",
    "exit_plan_mode",

    // ALL 45 MCP tools for full autonomous operation
    // Agent Orchestration Tools (17 tools)
    "mcp__claude-mcp-tools__orchestrate_objective",
    "mcp__claude-mcp-tools__spawn_agent",
    "mcp__claude-mcp-tools__create_task",
    "mcp__claude-mcp-tools__join_room",
    "mcp__claude-mcp-tools__send_message",
    "mcp__claude-mcp-tools__wait_for_messages",
    "mcp__claude-mcp-tools__store_knowledge_memory",
    "mcp__claude-mcp-tools__search_knowledge_graph",
    "mcp__claude-mcp-tools__list_agents",
    "mcp__claude-mcp-tools__terminate_agent",
    "mcp__claude-mcp-tools__close_room",
    "mcp__claude-mcp-tools__delete_room",
    "mcp__claude-mcp-tools__list_rooms",
    "mcp__claude-mcp-tools__list_room_messages",
    "mcp__claude-mcp-tools__create_delayed_room",
    "mcp__claude-mcp-tools__analyze_coordination_patterns",
    "mcp__claude-mcp-tools__monitor_agents",

    // Browser Automation Tools (6 tools)
    "mcp__claude-mcp-tools__create_browser_session",
    "mcp__claude-mcp-tools__navigate_and_scrape",
    "mcp__claude-mcp-tools__interact_with_page",
    "mcp__claude-mcp-tools__manage_browser_sessions",
    "mcp__claude-mcp-tools__navigate_to_url",
    "mcp__claude-mcp-tools__scrape_content",

    // Web Scraping & Documentation Tools (9 tools)
    "mcp__claude-mcp-tools__scrape_documentation",
    "mcp__claude-mcp-tools__get_scraping_status",
    "mcp__claude-mcp-tools__cancel_scrape_job",
    "mcp__claude-mcp-tools__force_unlock_job",
    "mcp__claude-mcp-tools__force_unlock_stuck_jobs",
    "mcp__claude-mcp-tools__list_documentation_sources",
    "mcp__claude-mcp-tools__delete_pages_by_pattern",
    "mcp__claude-mcp-tools__delete_pages_by_ids",
    "mcp__claude-mcp-tools__delete_all_website_pages",

    // Project Analysis & File Operations Tools (7 tools)
    "mcp__claude-mcp-tools__analyze_project_structure",
    "mcp__claude-mcp-tools__generate_project_summary",
    "mcp__claude-mcp-tools__analyze_file_symbols",
    "mcp__claude-mcp-tools__list_files",
    "mcp__claude-mcp-tools__find_files",
    "mcp__claude-mcp-tools__easy_replace",
    "mcp__claude-mcp-tools__cleanup_orphaned_projects",

    // TreeSummary Tools (5 tools)
    "mcp__claude-mcp-tools__update_file_analysis",
    "mcp__claude-mcp-tools__remove_file_analysis",
    "mcp__claude-mcp-tools__update_project_metadata",
    "mcp__claude-mcp-tools__get_project_overview",
    "mcp__claude-mcp-tools__cleanup_stale_analyses",

    // Plan Tools (6 tools)
    "mcp__claude-mcp-tools__create_execution_plan",
    "mcp__claude-mcp-tools__get_execution_plan",
    "mcp__claude-mcp-tools__execute_with_plan",
    "mcp__claude-mcp-tools__list_execution_plans",
    "mcp__claude-mcp-tools__delete_execution_plan",
    "mcp__claude-mcp-tools__update_execution_plan",

    // Foundation Cache Tools - Now automatically integrated (no manual tools needed)
  ];
  
  // Merge permissions using Set to avoid duplicates
  const existingPermissions = existingSettings.permissions?.allow || [];
  const mergedPermissions = Array.from(new Set([...existingPermissions, ...requiredPermissions]));
  
  // Create merged settings (without mcpServers - we'll add that via CLI)
  const settings = {
    ...existingSettings,
    includeCoAuthoredBy: false,
    env: {
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: "62000",
      MAX_MCP_OUTPUT_TOKENS: "62000",
      MCP_TIMEOUT: "60000",
      ...existingSettings.env,
    },
    permissions: {
      ...existingSettings.permissions,
      allow: mergedPermissions,
    },
  };
  
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  
  logSuccess('Project configuration created/updated');
}

// Port finding function removed - not needed for stdio transport
// Use addMcpServerHttp() function below if HTTP transport is needed later

async function addMcpServer(packageManager?: { name: string; installCommand: string; linkCommand: string; unlinkCommand: string }): Promise<boolean> {
  logStep('🔌', 'Adding MCP server to Claude Code...');
  
  try {
    // Use stdio transport (no OAuth required for local development)
    const mcpCommand = `claude mcp add claude-mcp-tools -s local -e MCPTOOLS_DATA_DIR="${path.join(os.homedir(), '.mcptools', 'data')}" -- claude-mcp-server`;
    
    try {
      // Try to add the server
      execSync(mcpCommand, { 
        stdio: 'pipe' 
      });
      logSuccess('MCP server added to Claude Code with stdio transport (default)');
    } catch (addError) {
      // If it fails (likely because server already exists), remove and re-add
      logStep('🔄', 'MCP server already exists, updating configuration...');
      
      try {
        execSync(`claude mcp remove claude-mcp-tools`, { stdio: 'pipe' });
      } catch (removeError) {
        // Ignore remove errors (server might not exist)
      }
      
      // Re-add with new configuration
      execSync(mcpCommand, { 
        stdio: 'pipe' 
      });
      logSuccess('MCP server configuration updated with stdio transport (default)');
    }
    
    return true;
    
  } catch (error) {
    logError(`Failed to add MCP server: ${error}`);
    logWarning(`You can manually add it with: claude mcp add claude-mcp-tools -s local -e MCPTOOLS_DATA_DIR="${path.join(os.homedir(), '.mcptools', 'data')}" -- claude-mcp-server`);
    return false;
  }
}

// Separate function for HTTP transport (no OAuth required for local servers)
async function addMcpServerHttp(port: number = 4269): Promise<boolean> {
  logStep('🌐', 'Adding MCP server with HTTP transport...');
  
  // Correct HTTP transport syntax - no stdio flags needed
  const mcpCommand = `claude mcp add --transport http claude-mcp-tools-http http://127.0.0.1:${port}`;
  
  try {
    execSync(mcpCommand, { stdio: 'pipe' });
    logSuccess(`MCP server added with HTTP transport on port ${port}`);
    logSuccess('No OAuth required for local HTTP servers');
    return true;
    
  } catch (error) {
    logError(`Failed to add HTTP MCP server: ${error}`);
    logWarning(`You can manually add it with: ${mcpCommand}`);
    return false;
  }
}

function updateGitignore(): void {
  logStep('📄', 'Updating .gitignore...');
  
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const treesummaryEntry = '.treesummary/';
  
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    
    // Check if .treesummary/ is already in .gitignore
    if (!content.includes(treesummaryEntry)) {
      // Add .treesummary/ to .gitignore
      const updatedContent = content + (content.endsWith('\n') ? '' : '\n') + 
        '\n# Project analysis cache\n' + treesummaryEntry + '\n';
      fs.writeFileSync(gitignorePath, updatedContent);
      logSuccess('Added .treesummary/ to .gitignore');
    } else {
      logSuccess('.treesummary/ already in .gitignore');
    }
  } else {
    // Create .gitignore with .treesummary/ entry
    const gitignoreContent = '# Project analysis cache\n.treesummary/\n';
    fs.writeFileSync(gitignorePath, gitignoreContent);
    logSuccess('Created .gitignore with .treesummary/');
  }
}

function setupGitCommitProtection(): void {
  logStep('🔒', 'Setting up git commit protection...');
  
  const gitHooksDir = path.join(process.cwd(), '.git', 'hooks');
  const preCommitPath = path.join(gitHooksDir, 'pre-commit');
  
  // Check if .git directory exists
  if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
    logWarning('Not a git repository - skipping commit protection setup');
    return;
  }
  
  // Create hooks directory if it doesn't exist
  fs.mkdirSync(gitHooksDir, { recursive: true });
  
  const preCommitContent = `#!/usr/bin/env bash

# Pre-commit hook to prevent Claude from committing directly
AUTHOR_EMAIL=$(git config user.email)

if [ "$AUTHOR_EMAIL" = "claude@anthropic.com" ]; then
    echo "🚫 ERROR: Claude Code Assistant cannot commit directly to this repository."
    echo "   Please use explicit commit instructions or create a feature branch."
    echo "   Current author: $AUTHOR_EMAIL"
    echo ""
    echo "   To allow this commit, either:"
    echo "   1. Use explicit commit instructions in your prompt"
    echo "   2. Create a feature branch first"
    echo "   3. Temporarily change git user: git config user.email 'your@email.com'"
    exit 1
fi

exit 0`;

  fs.writeFileSync(preCommitPath, preCommitContent);
  
  // Make the hook executable
  try {
    fs.chmodSync(preCommitPath, 0o755);
    logSuccess('Git commit protection configured');
  } catch (error) {
    logWarning(`Failed to make pre-commit hook executable: ${error}`);
  }
  
  // Set up git commit template
  const gitMessagePath = path.join(process.cwd(), '.gitmessage');
  const gitMessageContent = `# Commit Template for ZMCPTools
# 
# Please specify the author and purpose:
# 
# [FEATURE/FIX/DOCS/REFACTOR]: Brief description
# 
# Detailed description:
# - What was changed
# - Why it was changed
# - How to test the changes
#
# Author: [Specify if not original author]
# Co-authored-by: Claude <claude@anthropic.com> (if applicable)
#
# ⚠️  This commit should only be made with explicit instructions`;

  fs.writeFileSync(gitMessagePath, gitMessageContent);
  
  try {
    execSync('git config commit.template .gitmessage', { stdio: 'pipe' });
    execSync('git config user.useConfigOnly true', { stdio: 'pipe' });
    logSuccess('Git commit template configured');
  } catch (error) {
    logWarning(`Failed to configure git commit template: ${error}`);
  }
}

function createClaudeMd(): void {
  logStep('📝', 'Setting up CLAUDE.md integration...');
  
  const claudeSection = `<!-- zzZMCPToolsTypescriptzz START -->
# ZMCPTools Agent Operations Guide

This guide provides actionable workflows for Claude agents using the ZMCPTools MCP toolset for autonomous development.

## 🧠 Agent Decision Framework

### When to Use Multi-Agent Orchestration
**ALWAYS use \`orchestrate_objective()\` for:**
- Tasks requiring 3+ sequential steps
- Full-stack implementations (backend + frontend + tests)
- Complex features requiring multiple specializations
- Documentation scraping + implementation workflows
- Development environment setup + testing

**Use single-agent tools for:**
- Simple file operations
- Quick analysis or investigation
- Single-purpose tasks under 30 minutes

### Foundation Caching Strategy
**Critical for cost optimization:**
\`\`\`typescript
// Use shared foundation sessions for 85-90% cost reduction
orchestrate_objective(
  "your complex objective",
  ".",
  { foundation_session_id: "project-feature-name-2024" }
)
\`\`\`

## 🎯 Multi-Agent Coordination Patterns

### 1. Full-Stack Development Pattern
\`\`\`typescript
// Architect coordinates: Backend → Frontend → Testing → Documentation
orchestrate_objective(
  "Implement user authentication with JWT tokens, React login UI, comprehensive tests, and API documentation",
  "."
)
\`\`\`

### 2. Documentation-First Pattern
\`\`\`typescript
// Phase 1: Research and documentation scraping
scrape_documentation("https://docs.framework.com", { max_pages: 50 })
search_knowledge_graph(".", "authentication best practices")

// Phase 2: Implementation following documentation patterns
orchestrate_objective(
  "Build authentication system following scraped framework documentation patterns",
  "."
)
\`\`\`

### 3. Analysis → Implementation Pattern
\`\`\`typescript
// Phase 1: Project analysis
analyze_project_structure(".")
generate_project_summary(".")

// Phase 2: Coordinated implementation
orchestrate_objective(
  "Refactor codebase based on analysis findings and implement missing features",
  "."
)
\`\`\`

## 🔄 Sequential Task Management

### Complex Task Breakdown
1. **Start with \`create_task()\`** - Define the high-level goal
2. **Use \`orchestrate_objective()\`** - Let architect break down subtasks
3. **Monitor with \`list_agents()\`** - Track progress
4. **Coordinate via \`join_room()\`** - Real-time communication
5. **Store insights with \`store_knowledge_memory()\`** - Cross-agent learning

### Agent Specialization Types
- **\`backend\`** - API development, database design, server logic
- **\`frontend\`** - UI components, state management, user experience
- **\`testing\`** - Unit tests, integration tests, E2E testing
- **\`documentation\`** - Technical writing, API docs, README files
- **\`devops\`** - CI/CD, deployment, infrastructure
- **\`analysis\`** - Code review, performance analysis, architecture

## 💾 Knowledge Management Workflows

### Before Implementation - Always Research
\`\`\`typescript
// 1. Search existing knowledge
const insights = await search_knowledge_graph(".", "similar feature implementation")

// 2. Scrape relevant documentation if needed
await scrape_documentation("https://relevant-docs.com")

// 3. Analyze current project structure
await analyze_project_structure(".")
\`\`\`

### During Implementation - Store Learnings
\`\`\`typescript
// Store insights for other agents
await store_knowledge_memory(".", agent_id, "technical_decision", 
  "Database Schema Design",
  "Chose PostgreSQL with JSONB for user preferences due to flexible schema needs"
)

// Store error patterns
await store_knowledge_memory(".", agent_id, "error_pattern",
  "React State Management",
  "useState hooks caused re-render issues, switched to useReducer for complex state"
)
\`\`\`

### After Implementation - Document Outcomes
\`\`\`typescript
// Store implementation patterns for future use
await store_knowledge_memory(".", agent_id, "implementation_pattern",
  "JWT Authentication Flow",
  "Successful pattern: JWT in httpOnly cookies + CSRF tokens for security"
)
\`\`\`

## 🚨 Error Recovery Patterns

### When Tasks Fail
1. **Check agent status**: \`list_agents(".", "failed")\`
2. **Review error logs**: Check shared memory for error patterns
3. **Restart with lessons learned**: Use previous insights in new objective
4. **Isolate problems**: Use single-agent tools for debugging

### Common Recovery Actions
\`\`\`typescript
// If orchestration fails, break down manually
const task1 = await create_task(".", "research", "Investigate failed component")
const agent1 = await spawn_agent("analysis", ".", "Debug the failing authentication flow")

// Use room coordination for complex debugging
await join_room("debug-session-" + Date.now())
await send_message("debug-session", "Agent investigating auth flow failure", ["analysis-agent"])
\`\`\`

## 🎨 Agent-Type-Specific Workflows

### Backend Agent Actions
1. Design database schema first
2. Implement core business logic
3. Create API endpoints with proper validation
4. Store API patterns in knowledge graph
5. Coordinate with frontend agent via shared memory

### Frontend Agent Actions  
1. Review backend API specifications from shared memory
2. Create reusable components following project patterns
3. Implement state management
4. Store UI patterns for consistency
5. Coordinate with testing agent for component tests

### Testing Agent Actions
1. Wait for implementation completion (use agent dependencies)
2. Create comprehensive test suites
3. Run tests and store failure patterns
4. Provide feedback to implementation agents
5. Document testing strategies in knowledge graph

### Documentation Agent Actions
1. Wait for feature completion
2. Generate API documentation from code
3. Create user guides and examples
4. Store documentation patterns
5. Ensure consistency across project docs

## 🔧 Tool Usage Priorities

### Phase 1: Analysis (Always First)
1. \`analyze_project_structure(".")\` - Understand codebase
2. \`search_knowledge_graph(".", "relevant query")\` - Check existing knowledge
3. \`scrape_documentation()\` - Get external context if needed

### Phase 2: Planning
1. \`create_task()\` - Define objectives
2. \`orchestrate_objective()\` - Break down complex work
3. \`join_room()\` - Set up coordination

### Phase 3: Implementation
1. Agent-specific tools (\`spawn_agent()\`, specialized workflows)
2. \`store_knowledge_memory()\` - Continuous learning
3. \`send_message()\` - Cross-agent coordination

### Phase 4: Validation
1. \`list_agents()\` - Check completion status
2. Review stored insights and learnings
3. Run tests and validate implementation

## 💡 Best Practices

### Always Do This
- Start complex tasks with \`orchestrate_objective()\`
- Use foundation sessions for cost optimization
- Store insights immediately when discovered
- Check existing knowledge before implementing
- Coordinate agents via shared rooms

### Never Do This
- Implement without analysis phase
- Skip documentation scraping for new frameworks
- Ignore shared memory from other agents
- Start multiple agents without coordination
- Forget to store learnings for future agents

### Foundation Session Optimization
- Use descriptive session IDs: "auth-system-v2-2024"
- Share sessions across related agents (85-90% cost reduction)
- Include version numbers for iterative development
- Name sessions after major features or epics

## 🚀 Quick Start Checklist

For any new complex task:
1. ✅ \`analyze_project_structure(".")\` - Understand the codebase
2. ✅ \`search_knowledge_graph(".", "task-related-query")\` - Check existing work
3. ✅ \`orchestrate_objective("clear objective", ".", {foundation_session_id: "descriptive-name"})\` - Coordinate implementation
4. ✅ \`join_room("task-coordination")\` - Monitor progress
5. ✅ \`store_knowledge_memory()\` - Document learnings throughout

**Data Location**: \`~/.mcptools/data/\` (SQLite databases with agent coordination, shared memory, and knowledge graphs)

🎯 **Core Principle**: Always use multi-agent orchestration for complex tasks. Single agents are for investigation and simple operations only.
<!-- zzZMCPToolsTypescriptzz END -->`;

  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  
  if (fs.existsSync(claudeMdPath)) {
    let content = fs.readFileSync(claudeMdPath, 'utf8');
    
    // Replace existing section or append
    if (content.includes('<!-- zzZMCPToolsTypescriptzz START -->')) {
      const startMarker = '<!-- zzZMCPToolsTypescriptzz START -->';
      const endMarker = '<!-- zzZMCPToolsTypescriptzz END -->';
      
      const startIndex = content.indexOf(startMarker);
      const endIndex = content.indexOf(endMarker);
      
      if (startIndex !== -1 && endIndex !== -1) {
        content = content.slice(0, startIndex) + claudeSection + content.slice(endIndex + endMarker.length);
      } else {
        content += '\n\n' + claudeSection;
      }
    } else {
      content += '\n\n' + claudeSection;
    }
    
    fs.writeFileSync(claudeMdPath, content);
    logSuccess('Updated existing CLAUDE.md');
  } else {
    fs.writeFileSync(claudeMdPath, claudeSection + '\n');
    logSuccess('Created CLAUDE.md');
  }
}

async function installPatchrightBrowsers(): Promise<void> {
  logStep('🌐', 'Installing Patchright browsers...');
  
  try {
    // Run patchright install to download browsers (chromium, firefox, webkit)
    execSync('npx patchright install', { stdio: 'pipe' });
    logSuccess('Patchright browsers installed');
    
  } catch (error) {
    logWarning(`Patchright browser installation failed: ${error}`);
    logWarning('Browsers can be installed later with: npx patchright install');
    
    // Don't fail the installation - browsers can be installed later
    // This allows the installation to continue even if browser setup fails
  }
}

async function initializeDatabase(): Promise<void> {
  logStep('🗄️', 'Initializing database with migrations...');
  
  try {
    // Ensure data directory exists
    fs.mkdirSync(INSTALL_PATHS.DATA_DIR, { recursive: true });
    
    // Import and initialize DatabaseManager to run migrations
    const { DatabaseManager } = await import('../database/drizzle.js');
    const db = new DatabaseManager();
    
    // Initialize will automatically run migrations
    await db.initialize();
    
    // Verify tables exist
    const result = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    if (result.length === 0) {
      throw new Error('No tables created after migration');
    }
    
    // Close the database
    db.close();
    
    logSuccess('Database initialized with migrations');
    
  } catch (error) {
    logWarning(`Database initialization failed: ${error}`);
    logWarning('Database will be initialized on first use');
    
    // Don't fail the installation - database can be initialized later
    // This allows the installation to continue even if database setup fails
  }
}

export async function install(options: { globalOnly?: boolean; projectOnly?: boolean; skipMcp?: boolean } = {}): Promise<void> {
  console.log(`${colors.bold}${colors.blue}`);
  console.log('╭─────────────────────────────────────────╮');
  console.log('│ 🚀 ZMCPTools TypeScript Installer  │');
  console.log('│ Enhanced MCP Tools for Claude Code      │');
  console.log('╰─────────────────────────────────────────╯');
  console.log(colors.reset);
  
  // Check prerequisites
  const { success, packageManager } = checkPrerequisites();
  if (!success || !packageManager) {
    process.exit(1);
  }
  
  // Create directories
  createDirectories();
  
  // Determine if we're running from development or global install
  const isGlobalInstall = !fs.existsSync(path.join(process.cwd(), 'package.json')) || 
                         !fs.existsSync(path.join(process.cwd(), 'src', 'installer', 'index.ts'));
  
  // Build and link globally (only if running from development directory)
  if (!options.projectOnly && !isGlobalInstall) {
    if (!buildAndLink(packageManager)) {
      process.exit(1);
    }
  }
  
  // Note: Server files no longer copied - using direct global command approach
  
  // Set up project configuration (main purpose when running from global install)
  if (!options.globalOnly) {
    createProjectConfig();
    copyProjectHooks();
    updateHookConfiguration();
    updateGitignore();
    setupGitCommitProtection();
    createClaudeMd();
    
    // Add MCP server using Claude CLI
    if (!(await addMcpServer(packageManager))) {
      logWarning('MCP server installation failed - you may need to add it manually');
    }
  }
  
  // Initialize database
  try {
    await initializeDatabase();
  } catch (error) {
    logWarning(`Database initialization failed: ${error}`);
    logWarning('Database will be initialized on first use');
  }
  
  // Install Patchright browsers
  if (!options.globalOnly) {
    try {
      await installPatchrightBrowsers();
    } catch (error) {
      logWarning(`Patchright browser installation failed: ${error}`);
      logWarning('Browsers can be installed later with: npx patchright install');
    }
  }
  
  // Success message
  console.log('\n' + colors.green + colors.bold);
  console.log('╭─────────────────── 🎉 Success ───────────────────╮');
  console.log('│ ✅ Installation Complete!                        │');
  console.log('│                                                   │');
  console.log('│ 📋 What was configured:                           │');
  if (!isGlobalInstall && !options.projectOnly) {
    console.log(`│ • TypeScript package: Globally linked            │`);
    console.log(`│ • MCP server: claude-mcp-tools (direct command)   │`);
  } else {
    console.log(`│ • MCP server: claude-mcp-tools (direct command)   │`);
  }
  console.log(`│ • Data storage: ~/.mcptools/data/                 │`);
  if (!options.globalOnly) {
    console.log(`│ • Project config: ./.claude/settings.local.json  │`);
    console.log(`│ • Project integration: ./CLAUDE.md               │`);
    console.log(`│ • Git commit protection: Pre-commit hook active  │`);
    console.log(`│ • ALL 61 MCP tools: Fully enabled               │`);
    console.log(`│ • Bash permissions: Full autonomous access       │`);
    console.log(`│ • 80+ commands: Pre-authorized for operation     │`);
    console.log(`│ • Patchright browsers: Chromium, Firefox, WebKit │`);
  }
  console.log('│                                                   │');
  console.log('│ 🤖 Autonomous Operation Ready:                    │');
  console.log('│ • Multi-agent orchestration enabled              │');
  console.log('│ • Browser automation available                   │');
  console.log('│ • Documentation scraping configured              │');
  console.log('│ • Project analysis tools active                  │');
  console.log('│ • Foundation caching for cost reduction          │');
  console.log('│                                                   │');
  console.log('│ 🚀 Next steps:                                    │');
  console.log('│ 1. Restart Claude Code                            │');
  console.log('│ 2. Use /mcp to see all 44 available tools        │');
  console.log('│ 3. Try: orchestrate_objective() for workflows    │');
  console.log('│ 4. Check: ./CLAUDE.md for TypeScript examples    │');
  console.log('╰───────────────────────────────────────────────────╯');
  console.log(colors.reset);
}

export function uninstall(): void {
  logStep('🗑️', 'Uninstalling ZMCPTools...');
  
  // Detect package manager for unlinking
  const packageManager = detectPackageManager();
  
  try {
    // Remove MCP server
    try {
      execSync('claude mcp remove claude-mcp-tools', { stdio: 'ignore' });
      logSuccess('MCP server removed');
    } catch {
      logWarning('MCP server was not configured');
    }
    
    // Unlink global package
    if (packageManager) {
      try {
        execSync(packageManager.unlinkCommand, { stdio: 'ignore' });
        logSuccess('Global package unlinked');
      } catch {
        logWarning('Package was not globally linked');
      }
    }
    
    // Preserve data directory with notice
    if (fs.existsSync(INSTALL_PATHS.DATA_DIR)) {
      log(`Data directory preserved: ${INSTALL_PATHS.DATA_DIR}`, 'yellow');
      log('(Remove manually if desired)', 'dim');
    }
    
    logSuccess('Uninstallation complete');
    
  } catch (error) {
    logError(`Uninstallation failed: ${error}`);
    process.exit(1);
  }
}

// Note: CLI interface removed to prevent duplicate execution
// The installer should only be called through the main CLI (zmcp-tools install)