#!/usr/bin/env node

/**
 * Example: How to spawn agents with custom process titles
 * This shows how to modify the spawn_agent function to use our wrapper
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Example function that would be integrated into zmcp-tools
async function spawnAgentWithProcessTitle(agentType, repositoryPath, taskDescription, options = {}) {
  // Generate agent ID (would come from actual spawn_agent response)
  const agentId = Math.random().toString(36).substring(2, 8);
  
  // Extract project context from task description or repository path
  const projectContext = options.projectContext || 
    taskDescription.split(' ').slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
  
  // Path to wrapper script
  const wrapperPath = path.join(__dirname, '..', 'zmcp-agent-wrapper.cjs');
  
  // Build the command
  const command = [
    wrapperPath,
    agentType,
    projectContext,
    agentId,
    '--',
    'claude',  // or whatever command launches the agent
    '--profile', `zmcp-${agentType}`,
    // ... other claude arguments
  ].join(' ');
  
  console.log(`Spawning agent with process title: zmcp-${getTypeAbbr(agentType)}-${projectContext}-${agentId}`);
  console.log(`Command: ${command}`);
  
  // In real implementation, this would be integrated with the actual spawn_agent tool
  // For now, just show what the command would look like
  return {
    agentId,
    processTitle: `zmcp-${getTypeAbbr(agentType)}-${projectContext}-${agentId}`,
    command
  };
}

function getTypeAbbr(agentType) {
  const abbrs = {
    'backend': 'be',
    'frontend': 'fe',
    'testing': 'ts',
    'documentation': 'dc',
    'architect': 'ar',
    'devops': 'dv'
  };
  return abbrs[agentType.toLowerCase()] || agentType.substring(0, 2).toLowerCase();
}

// Example usage
console.log('Example 1: Backend agent for OAuth implementation');
spawnAgentWithProcessTitle('backend', '.', 'Implement OAuth2 authentication flow');

console.log('\nExample 2: Frontend agent for React UI');
spawnAgentWithProcessTitle('frontend', '.', 'Create React login components', {
  projectContext: 'react-auth-ui'
});

console.log('\nExample 3: Testing agent');
spawnAgentWithProcessTitle('testing', '.', 'Write comprehensive test suite for authentication');

console.log('\n\nTo see running agents:');
console.log('ps aux | grep "zmcp-"');
console.log('\nTo kill a specific agent type:');
console.log('pkill -f "zmcp-be-"  # Kill all backend agents');
console.log('\nTo kill a specific project:');
console.log('pkill -f "zmcp-.*-oauth-"  # Kill all agents working on oauth');