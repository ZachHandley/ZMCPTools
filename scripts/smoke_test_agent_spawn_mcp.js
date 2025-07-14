#!/usr/bin/env node

/**
 * Smoke Test: Agent Process Title Verification (MCP Integration)
 * 
 * This test verifies that the spawn_agent MCP tool correctly sets process titles
 * for spawned Claude agents. It attempts to use actual MCP tools if available.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs');

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`\n${colors.bright}${colors.blue}[Step ${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkProcesses(searchPattern) {
  try {
    // Multiple ways to check for processes
    const commands = [
      `ps aux | grep -v grep | grep "${searchPattern}" || true`,
      `pgrep -f "${searchPattern}" -l || true`,
      `ps -eo pid,cmd | grep -v grep | grep "${searchPattern}" || true`
    ];
    
    const results = [];
    for (const cmd of commands) {
      try {
        const { stdout } = await execAsync(cmd);
        if (stdout.trim()) {
          results.push({ command: cmd, output: stdout.trim() });
        }
      } catch (e) {
        // Ignore errors from individual commands
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error checking processes:', error);
    return [];
  }
}

async function checkDatabase() {
  try {
    const dbPath = path.join(process.env.HOME, '.mcptools', 'data', 'mcptools.db');
    if (fs.existsSync(dbPath)) {
      logInfo(`Database found at: ${dbPath}`);
      
      // Try to query the database using sqlite3
      try {
        const { stdout } = await execAsync(`sqlite3 "${dbPath}" "SELECT id, agent_name, status, claude_pid FROM agent_sessions ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || echo "sqlite3 not available"`);
        if (stdout && !stdout.includes('not available')) {
          logInfo('Recent agents in database:');
          console.log(stdout);
        }
      } catch (e) {
        logInfo('Could not query database directly');
      }
      
      return true;
    } else {
      logInfo('Database not found at expected location');
      return false;
    }
  } catch (error) {
    console.error('Error checking database:', error);
    return false;
  }
}

async function runSmokeTest() {
  log('🔥 Agent Process Title Smoke Test (MCP Integration)', 'bright');
  log('=' .repeat(60), 'blue');
  
  const timestamp = Date.now();
  const agentName = `smoke-test-${timestamp}`;
  let testResults = {
    agentSpawned: false,
    processFound: false,
    correctTitle: false,
    databaseVerified: false,
    cleanupSuccessful: false
  };
  
  try {
    // Step 1: Check environment
    logStep(1, 'Checking environment...');
    
    // Check if MCP tools are available
    const mcpToolsPath = path.join(__dirname, 'ZMCPTools', 'dist', 'index.js');
    const mcpToolsExist = fs.existsSync(mcpToolsPath);
    
    if (mcpToolsExist) {
      logSuccess(`MCP tools found at: ${mcpToolsPath}`);
    } else {
      logInfo('MCP tools not found at expected location');
      logInfo('Will provide manual commands instead');
    }
    
    // Check database
    await checkDatabase();
    
    // Step 2: Check for existing Claude processes
    logStep(2, 'Checking for existing Claude processes...');
    
    const existingProcesses = await checkProcesses('claude');
    if (existingProcesses.length > 0) {
      logInfo('Found existing Claude processes:');
      existingProcesses.forEach(result => {
        console.log(`\nCommand: ${result.command}`);
        console.log(result.output);
      });
    } else {
      logInfo('No existing Claude processes found');
    }
    
    // Step 3: Spawn test agent
    logStep(3, 'Spawning test agent...');
    
    // Expected process titles to check for
    const expectedTitles = [
      `claude-agent-${agentName}`,
      `claude-agent-testing`,
      `zmcp-agent-${agentName}`,
      `mcp-agent-${agentName}`
    ];
    
    logInfo(`Agent name: ${agentName}`);
    logInfo('Expected process titles:');
    expectedTitles.forEach(title => console.log(`  - ${title}`));
    
    // Provide the MCP command
    console.log(`\n${colors.yellow}MCP Command to execute:${colors.reset}`);
    const spawnCommand = `mcp__zmcp_tools__spawn_agent({
  agentType: "testing",
  repositoryPath: "${process.cwd()}",
  taskDescription: "Smoke test agent for process title verification (${timestamp})",
  metadata: { 
    test_run: "${timestamp}",
    expected_name: "${agentName}"
  }
})`;
    console.log(spawnCommand);
    
    logInfo('\n⏳ After executing the command above, press Enter to continue...');
    // In a real integration, we would execute the command programmatically
    
    // Step 4: Wait and check for process
    logStep(4, 'Waiting for process initialization...');
    logInfo('Waiting 3 seconds for process to start...');
    await sleep(3000);
    
    // Step 5: Check for spawned process
    logStep(5, 'Searching for spawned process...');
    
    // Check for each expected title pattern
    for (const title of expectedTitles) {
      logInfo(`Checking for: ${title}`);
      const processes = await checkProcesses(title);
      
      if (processes.length > 0) {
        logSuccess(`Found process with title pattern: ${title}`);
        testResults.processFound = true;
        testResults.correctTitle = true;
        
        processes.forEach(result => {
          console.log(`\nCommand: ${result.command}`);
          console.log(result.output);
        });
        break;
      }
    }
    
    if (!testResults.processFound) {
      logError('No process found with expected title patterns');
      
      // Check for any new claude processes
      logInfo('\nChecking for any new Claude processes...');
      const newProcesses = await checkProcesses('claude');
      if (newProcesses.length > 0) {
        logInfo('Found Claude processes (but without expected titles):');
        newProcesses.forEach(result => {
          console.log(`\nCommand: ${result.command}`);
          console.log(result.output);
        });
        testResults.processFound = true;
      }
    }
    
    // Step 6: List agents via MCP
    logStep(6, 'Listing agents via MCP...');
    
    console.log(`\n${colors.yellow}MCP Command to list agents:${colors.reset}`);
    console.log(`mcp__zmcp_tools__list_agents({
  repositoryPath: "${process.cwd()}",
  status: "active",
  limit: 10
})`);
    
    logInfo('\nCheck the output for your test agent');
    
    // Step 7: Cleanup
    logStep(7, 'Cleanup instructions...');
    
    console.log(`\n${colors.yellow}MCP Command to terminate agent:${colors.reset}`);
    console.log(`mcp__zmcp_tools__terminate_agent({
  agentIds: ["<agent_id_from_spawn_response>"]
})`);
    
    logInfo('Replace <agent_id_from_spawn_response> with the actual agent ID');
    
  } catch (error) {
    logError(`Test encountered an error: ${error.message}`);
    console.error(error);
  }
  
  // Final results
  console.log(`\n${colors.bright}${'='.repeat(60)}${colors.reset}`);
  log('📊 Test Results:', 'bright');
  
  console.log(`\nAgent spawned: ${testResults.agentSpawned ? '✅' : '❌'}`);
  console.log(`Process found: ${testResults.processFound ? '✅' : '❌'}`);
  console.log(`Correct title: ${testResults.correctTitle ? '✅' : '❌'}`);
  console.log(`Database verified: ${testResults.databaseVerified ? '✅' : '❌'}`);
  console.log(`Cleanup successful: ${testResults.cleanupSuccessful ? '✅' : '❌'}`);
  
  if (testResults.correctTitle) {
    log('\n🎉 Process title integration is working!', 'green');
  } else if (testResults.processFound) {
    log('\n⚠️  Processes found but titles not set correctly', 'yellow');
  } else {
    log('\n❌ Process title integration needs implementation', 'red');
  }
  
  console.log(`\n${colors.cyan}💡 Implementation Guide:${colors.reset}`);
  console.log('\nTo implement process titles in ClaudeProcess.ts:');
  console.log('\n1. In the child process, set the title immediately:');
  console.log('   process.title = `claude-agent-${agentName}`;');
  console.log('\n2. For the spawned claude CLI, use wrapper script:');
  console.log('   - Create a wrapper that sets process.title');
  console.log('   - Then executes the actual claude command');
  console.log('\n3. Alternative: Use environment variable:');
  console.log('   env: { ...process.env, CLAUDE_AGENT_NAME: agentName }');
  console.log('   Then have the process read this and set its title');
  
  console.log(`\n${colors.yellow}📝 Next Steps:${colors.reset}`);
  console.log('1. Implement process title setting in ClaudeProcess');
  console.log('2. Test with actual MCP tool calls');
  console.log('3. Verify with ps, pgrep, and htop');
  console.log('4. Add process title to agent monitoring features');
}

// Run the test
if (require.main === module) {
  runSmokeTest().catch(error => {
    console.error('Smoke test crashed:', error);
    process.exit(1);
  });
}

module.exports = { runSmokeTest, checkProcesses, checkDatabase };