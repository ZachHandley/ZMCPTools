#!/usr/bin/env node

/**
 * ZMCP Agent Wrapper Library - Extracted logic for testing
 */

const { spawn } = require('child_process');

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

function getProcessTitle(agentType, projectContext, agentId) {
  // Get abbreviation or use first 2 chars
  const typeAbbr = typeAbbreviations[agentType.toLowerCase()] || agentType.substring(0, 2).toLowerCase();
  
  // Truncate project context if needed
  const projectShort = projectContext.length > 20 ? projectContext.substring(0, 20) : projectContext;
  
  return `zmcp-${typeAbbr}-${projectShort}-${agentId}`;
}

function spawnChild(command, env) {
  return spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseArgs,
    getProcessTitle,
    spawnChild,
    typeAbbreviations
  };
}

// CLI execution
if (require.main === module) {
  const parsed = parseArgs(process.argv);
  
  if (parsed.error === 'usage') {
    console.error('Usage: zmcp-agent-wrapper.js <agent-type> <project-context> <agent-id> -- <command...>');
    console.error('Example: zmcp-agent-wrapper.js backend oauth-implementation a3f2e1 -- claude --profile zmcp-backend');
    process.exit(1);
  }
  
  if (parsed.error === 'missing') {
    console.error('Missing required arguments');
    process.exit(1);
  }
  
  const { agentType, projectContext, agentId, command } = parsed;
  const processTitle = getProcessTitle(agentType, projectContext, agentId);
  
  // Set process title
  process.title = processTitle;
  
  console.log(`[ZMCP Wrapper] Setting process title: ${processTitle}`);
  console.log(`[ZMCP Wrapper] Executing: ${command.join(' ')}`);
  
  // Spawn child
  const child = spawnChild(command, {
    ZMCP_AGENT_TYPE: agentType,
    ZMCP_PROJECT_CONTEXT: projectContext,
    ZMCP_AGENT_ID: agentId,
    ZMCP_PROCESS_TITLE: processTitle
  });
  
  // Forward signals
  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
      child.kill(signal);
    });
  });
  
  // Handle exit
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code);
    }
  });
  
  // Handle errors
  child.on('error', (err) => {
    console.error(`[ZMCP Wrapper] Failed to start process: ${err.message}`);
    process.exit(1);
  });
}