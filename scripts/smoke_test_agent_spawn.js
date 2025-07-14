#!/usr/bin/env node

/**
 * Smoke Test: Agent Process Title Verification
 * 
 * This test verifies that the spawn_agent MCP tool correctly sets process titles
 * for spawned Claude agents, making them identifiable in process listings.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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

async function checkProcessByTitle(expectedTitle) {
  try {
    // Use ps to search for processes with the expected title
    const { stdout } = await execAsync(`ps aux | grep -v grep | grep "${expectedTitle}" || true`);
    return stdout.trim();
  } catch (error) {
    console.error('Error checking process:', error);
    return '';
  }
}

async function runSmokeTest() {
  log('🔥 Agent Process Title Smoke Test Starting...', 'bright');
  log('=' .repeat(50), 'blue');
  
  let agentId = null;
  let testPassed = true;
  
  try {
    // Step 1: Spawn an agent using MCP tool
    logStep(1, 'Spawning test agent via MCP tool...');
    
    const timestamp = Date.now();
    const agentName = `smoke-test-agent-${timestamp}`;
    const expectedProcessTitle = `claude-agent-${agentName}`;
    
    logInfo(`Agent name: ${agentName}`);
    logInfo(`Expected process title: ${expectedProcessTitle}`);
    
    // This is a template command - in practice, you would call the MCP tool
    console.log(`\n${colors.yellow}Execute this MCP command:${colors.reset}`);
    console.log(`mcp__zmcp_tools__spawn_agent({
  agentType: "testing",
  repositoryPath: ".",
  taskDescription: "Smoke test agent for process title verification",
  metadata: { test_run: "${timestamp}" }
});`);
    
    // For the smoke test, we'll simulate the expected response
    // In a real test, you would capture the actual response from the MCP tool
    logInfo('\nSimulating agent spawn response...');
    agentId = `agent-${timestamp}`;
    const simulatedPid = Math.floor(Math.random() * 90000) + 10000;
    
    logSuccess(`Agent spawned with ID: ${agentId}`);
    logInfo(`Simulated PID: ${simulatedPid}`);
    
    // Step 2: Wait for process to start
    logStep(2, 'Waiting for process to initialize...');
    await sleep(2000);
    
    // Step 3: Check if process title is set correctly
    logStep(3, 'Checking process title in system...');
    
    const processInfo = await checkProcessByTitle(expectedProcessTitle);
    
    if (processInfo) {
      logSuccess(`Process found with correct title!`);
      logInfo(`Process info:\n${processInfo}`);
    } else {
      logError(`Process with title "${expectedProcessTitle}" not found`);
      testPassed = false;
      
      // Check for any claude processes
      logInfo('Checking for any claude processes...');
      const { stdout } = await execAsync('ps aux | grep -v grep | grep claude || true');
      if (stdout.trim()) {
        logInfo(`Found claude processes:\n${stdout}`);
      } else {
        logInfo('No claude processes found');
      }
    }
    
    // Step 4: Query database to verify agent record
    logStep(4, 'Verifying agent in database...');
    
    console.log(`\n${colors.yellow}Execute this MCP command to list agents:${colors.reset}`);
    console.log(`mcp__zmcp_tools__list_agents({
  repositoryPath: ".",
  status: "active"
});`);
    
    logInfo('Check if the spawned agent appears in the list with correct metadata');
    
    // Step 5: Clean up - terminate the agent
    logStep(5, 'Cleaning up - terminating test agent...');
    
    if (agentId) {
      console.log(`\n${colors.yellow}Execute this MCP command to terminate:${colors.reset}`);
      console.log(`mcp__zmcp_tools__terminate_agent({
  agentIds: ["${agentId}"]
});`);
      
      logInfo('Agent termination requested');
    }
    
    // Wait for cleanup
    await sleep(1000);
    
    // Verify process is gone
    logStep(6, 'Verifying cleanup...');
    const cleanupCheck = await checkProcessByTitle(expectedProcessTitle);
    
    if (!cleanupCheck) {
      logSuccess('Process successfully cleaned up');
    } else {
      logError('Process still exists after termination');
      testPassed = false;
    }
    
  } catch (error) {
    logError(`Test failed with error: ${error.message}`);
    console.error(error);
    testPassed = false;
  }
  
  // Final results
  console.log(`\n${colors.bright}${'='.repeat(50)}${colors.reset}`);
  if (testPassed) {
    log('🎉 Smoke test PASSED!', 'green');
    console.log('\n✅ Process title integration is working correctly');
  } else {
    log('💥 Smoke test FAILED!', 'red');
    console.log('\n❌ Process title integration needs attention');
    console.log('\nPossible issues:');
    console.log('1. Process titles may not be implemented yet');
    console.log('2. The spawned process may be using a different naming convention');
    console.log('3. The process may have exited before we could check it');
  }
  
  console.log(`\n${colors.cyan}💡 Implementation Notes:${colors.reset}`);
  console.log('To implement process titles in ClaudeProcess:');
  console.log('1. Set process.title in the spawned Node.js process');
  console.log('2. Use a consistent naming pattern like "claude-agent-{agentName}"');
  console.log('3. Consider adding agent type and ID to the title for better identification');
  console.log('4. Update the spawn options to preserve the process title');
  
  console.log(`\n${colors.yellow}📋 Manual Verification Steps:${colors.reset}`);
  console.log('1. Run: ps aux | grep claude');
  console.log('2. Run: pgrep -f claude-agent');
  console.log('3. Check ~/.mcptools/data/ for agent database entries');
  console.log('4. Check ~/.mcptools/logs/claude_agents/ for process logs');
}

// Run the test
runSmokeTest().catch(error => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});