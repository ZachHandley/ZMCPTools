#!/usr/bin/env node

/**
 * Real Agent Spawn Test - Test actual MCP tool agent spawning with process titles
 */

const { spawn } = require('child_process');
const { resolve } = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkProcesses(pattern) {
  return new Promise((resolve) => {
    const child = spawn('ps', ['aux']);
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('exit', () => {
      const lines = output.split('\n')
        .filter(line => line.includes(pattern) && !line.includes('grep'));
      resolve(lines);
    });
  });
}

async function testRealAgentSpawn() {
  console.log('🚀 Testing Real Agent Spawning with Process Title Integration');
  console.log('=' .repeat(60));
  
  // Start Claude with a test prompt that will spawn an agent
  const testPrompt = `I need you to test the agent spawning system. Please use the spawn_agent MCP tool to create a simple testing agent with these parameters:

agentType: "testing" 
repositoryPath: "."
taskDescription: "Test agent for process title verification - just echo some test output and exit"

The agent should appear in the process list with a title following the format: zmcp-ts-<project>-<id>

After spawning, please also use list_agents to show the current agents and their PIDs.`;

  console.log('Starting Claude with agent spawn test prompt...');
  
  const claude = spawn('claude', ['-p', '--output-format', 'stream-json', testPrompt], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: resolve(__dirname, '..')
  });
  
  let outputBuffer = '';
  
  claude.stdout.on('data', (data) => {
    const chunk = data.toString();
    outputBuffer += chunk;
    
    // Print real-time output for monitoring
    console.log('Claude output:', chunk.trim());
  });
  
  claude.stderr.on('data', (data) => {
    console.error('Claude stderr:', data.toString().trim());
  });
  
  // Monitor for spawned processes
  let monitoringActive = true;
  const monitorInterval = setInterval(async () => {
    if (!monitoringActive) return;
    
    const zmcpProcesses = await checkProcesses('zmcp-');
    if (zmcpProcesses.length > 0) {
      console.log('\n🔍 Found ZMCP processes:');
      zmcpProcesses.forEach((line, i) => {
        console.log(`  [${i+1}] ${line}`);
      });
      console.log();
    }
  }, 2000);
  
  claude.on('exit', (code) => {
    monitoringActive = false;
    clearInterval(monitorInterval);
    
    console.log(`\nClaude process exited with code: ${code}`);
    console.log('\nFinal output buffer length:', outputBuffer.length);
    
    // Check for any remaining processes
    setTimeout(async () => {
      const finalProcesses = await checkProcesses('zmcp-');
      if (finalProcesses.length > 0) {
        console.log('\n📋 Final ZMCP processes found:');
        finalProcesses.forEach((line, i) => {
          console.log(`  [${i+1}] ${line}`);
        });
      } else {
        console.log('\n✅ No ZMCP processes found after test completion');
      }
      
      process.exit(code || 0);
    }, 1000);
  });
  
  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('\n⏰ Test timeout reached, terminating Claude...');
    monitoringActive = false;
    clearInterval(monitorInterval);
    claude.kill('SIGTERM');
    
    setTimeout(() => {
      if (!claude.killed) {
        claude.kill('SIGKILL');
      }
    }, 2000);
  }, 30000);
}

// Run the test
testRealAgentSpawn().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});