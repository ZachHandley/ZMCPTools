# Standardized Naming Conventions Implementation

This document outlines the standardized naming conventions implemented to improve monitoring visibility and coordination in the ZMCPTools system.

## 🎯 Overview

The implementation introduces consistent naming patterns for:
1. **Process Titles** - For better monitoring with `ps aux | grep zmcp-`
2. **Room Names** - For improved coordination visibility
3. **Tool Descriptions** - Simplified for better AI comprehension

## 📋 Process Title Naming

### Pattern: `zmcp-<agenttype>-<goal>-<id>`

**Agent Type Abbreviations:**
- `be` - backend_agent
- `fe` - frontend_agent  
- `ts` - testing_agent
- `dc` - documentation_agent
- `ar` - architect
- `do` - devops_agent
- `sc` - security_agent
- `bg` - bugfix_agent
- `pl` - planner_agent
- `da` - data_agent
- `ga` - general_agent

**Goal Extraction:**
- Extracted from task description (max 8 chars, kebab-case)
- Common patterns: implement, create, build, add, setup, fix, test, deploy
- Falls back to first meaningful word from task description
- Ultimate fallback to agent type abbreviation

**ID:**
- Last 6 characters of the agent ID

### Examples:
```bash
zmcp-be-auth-a3f2e1      # Backend agent implementing auth
zmcp-fe-dashboar-b4c5d2  # Frontend agent creating dashboard
zmcp-ts-oauth-c6d7e3     # Testing agent testing OAuth
zmcp-dc-api-d8e9f4       # Documentation agent documenting API
zmcp-ar-orchestr-e1f2g5  # Architect orchestrating workflow
```

### Monitoring Usage:
```bash
ps aux | grep "zmcp-"           # List all ZMCPTools agent processes
ps aux | grep "zmcp-be-"        # List only backend agents
ps aux | grep "zmcp-.*-auth-"   # List agents working on auth
```

## 🏠 Room Naming

### Pattern: `<goal>-<context>` (max 15 chars)

**Context Suffixes:**
- `impl` - backend_agent (implementation)
- `ui` - frontend_agent
- `test` - testing_agent
- `docs` - documentation_agent
- `ops` - devops_agent
- `arch` - architect
- `sec` - security_agent
- `fix` - bugfix_agent
- `plan` - planner_agent
- `data` - data_agent
- `dev` - general_agent (default)

**Goal Extraction:**
- Same logic as process titles but limited to 8 characters
- Ensures room name doesn't exceed 15 characters total

### Examples:
```
auth-impl        # Backend auth implementation room
dashboar-ui      # Frontend dashboard UI room
oauth-test       # OAuth testing room
api-docs         # API documentation room
workflow-arch    # Workflow architecture room
```

## 🛠️ Tool Description Simplification

Tool descriptions have been simplified for better AI comprehension:

### Before:
```typescript
'Execute structured phased orchestration with intelligent model selection (Research → Plan → Execute → Monitor → Cleanup)'
```

### After:
```typescript
'Execute structured orchestration with research, planning, and execution phases'
```

### Key Improvements:
- Shorter sentences
- Clearer action verbs
- Focus on primary use case
- Removed technical jargon where possible

## 📁 Files Modified

### Core Implementation:
- `src/utils/agentPermissions.ts` - Added naming helper functions
- `src/process/ClaudeProcess.ts` - Added process title setting
- `src/services/AgentService.ts` - Updated to pass agentId and task description

### Tool Descriptions:
- `src/tools/AgentOrchestrationTools.ts` - Simplified descriptions
- `src/tools/CommunicationTools.ts` - Simplified descriptions

## 🔧 Implementation Details

### AgentPermissionManager New Methods:
```typescript
// Generate standardized process title
static generateProcessTitle(agentType: AgentType, agentId: string, taskDescription?: string): string

// Improved room naming with task description
static generateRoomName(agentType: AgentType, agentId: string, taskDescription?: string, timestamp?: number): string

// Extract goal from task description
private static extractGoalFromTask(taskDescription: string, maxLength: number = 8): string

// Get context suffix for room naming
private static getContextSuffix(agentType: AgentType): string

// Get agent type abbreviation
static getAgentTypeAbbreviation(agentType: AgentType): string
```

### ClaudeSpawnConfig Interface:
```typescript
export interface ClaudeSpawnConfig {
  // ... existing fields
  agentId?: string; // Added for process naming and identification
}
```

### Process Title Setting:
- Added `setProcessTitle()` method in `ClaudeProcess`
- Called during agent startup in `start()` method
- Safely handles errors without failing process spawn

## 📊 Benefits

1. **Improved Monitoring:**
   - Easy to identify agent processes with `ps aux | grep zmcp-`
   - Process names indicate agent type, goal, and unique identifier

2. **Better Coordination:**
   - Room names clearly indicate purpose and context
   - Consistent naming helps agents find relevant coordination channels

3. **Enhanced AI Comprehension:**
   - Simplified tool descriptions improve Claude's tool selection
   - Clearer action verbs and focused descriptions

4. **Operational Visibility:**
   - Administrators can quickly identify what agents are doing
   - Process management becomes more intuitive

## 🚀 Usage Examples

### Process Monitoring:
```bash
# List all ZMCPTools processes
ps aux | grep zmcp-

# Monitor specific agent types
watch "ps aux | grep zmcp-be-"

# Kill all auth-related agents
pkill -f "zmcp-.*-auth-"
```

### Room Coordination:
```bash
# Agents can easily identify relevant rooms
# auth-impl, dashboard-ui, oauth-test, etc.
```

### Development Workflow:
```bash
# Clear process naming helps with:
# - Debugging stuck agents
# - Understanding system load
# - Coordinating multi-agent workflows
# - Monitoring resource usage
```

## 🔮 Future Enhancements

1. **Metrics Integration:**
   - Use process names for metrics collection
   - Track agent performance by type and goal

2. **Auto-scaling:**
   - Use naming patterns for intelligent resource allocation
   - Scale agents based on workload patterns

3. **Enhanced Monitoring:**
   - Build dashboards using standardized naming
   - Create alerts based on process name patterns

4. **Coordination Intelligence:**
   - Use room naming patterns for smart agent assignment
   - Optimize collaboration based on naming conventions