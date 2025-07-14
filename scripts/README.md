# ZMCPTools Scripts

This directory contains utility scripts for monitoring and testing ZMCPTools functionality.

## Process Monitoring

### `zmcp-ps.sh`
A simple bash script that shows running ZMCP agent processes using their process titles.

```bash
./scripts/zmcp-ps.sh
```

This provides a quick process-only view. For full monitoring with database integration, use:
```bash
zmcp-tools monitor
```

## Testing Scripts

### Agent Spawn Testing
Scripts to verify that the agent spawning system correctly sets process titles:

- `smoke_test_agent_spawn.js` - Basic smoke test
- `smoke_test_agent_spawn_mcp.js` - MCP integration test
- `run_agent_spawn_test.sh` - Test runner script

Run tests:
```bash
./scripts/run_agent_spawn_test.sh simple  # Run basic test
./scripts/run_agent_spawn_test.sh mcp     # Run MCP integration test
```

## Note
These scripts are development utilities and are not part of the main ZMCPTools package distribution.