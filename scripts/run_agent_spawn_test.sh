#!/bin/bash

# Run Agent Spawn Process Title Smoke Test
# This script runs the smoke test to verify process title integration

echo "🚀 Agent Process Title Smoke Test Runner"
echo "======================================"
echo ""

# Check which test to run
if [ "$1" == "mcp" ]; then
    echo "Running MCP integration test..."
    node ./smoke_test_agent_spawn_mcp.js
elif [ "$1" == "simple" ]; then
    echo "Running simple smoke test..."
    node ./smoke_test_agent_spawn.js
else
    echo "Usage: $0 [simple|mcp]"
    echo ""
    echo "Options:"
    echo "  simple - Run the basic smoke test with simulated responses"
    echo "  mcp    - Run the full MCP integration test (requires manual interaction)"
    echo ""
    echo "Running simple test by default..."
    echo ""
    node ./smoke_test_agent_spawn.js
fi

echo ""
echo "Test completed!"