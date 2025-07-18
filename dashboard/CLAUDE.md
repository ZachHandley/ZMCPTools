<!-- zzZMCPToolsTypescriptzz START -->
# ZMCPTools Agent Operations Guide

This guide provides actionable workflows for Claude agents using the ZMCPTools MCP toolset for autonomous development.

## 🧠 Agent Decision Framework

### When to Use Multi-Agent Orchestration
**ALWAYS use `orchestrate_objective()` for:**
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
```typescript
// Use shared foundation sessions for 85-90% cost reduction
orchestrate_objective(
  "your complex objective",
  ".",
  { foundation_session_id: "project-feature-name-2024" }
)
```

## 🎯 Multi-Agent Coordination Patterns

### 1. Full-Stack Development Pattern
```typescript
// Architect coordinates: Backend → Frontend → Testing → Documentation
orchestrate_objective(
  "Implement user authentication with JWT tokens, React login UI, comprehensive tests, and API documentation",
  "."
)
```

### 2. Documentation-First Pattern
```typescript
// Phase 1: Research and documentation scraping
scrape_documentation("https://docs.framework.com", { max_pages: 50 })
search_knowledge_graph(".", "authentication best practices")

// Phase 2: Implementation following documentation patterns
orchestrate_objective(
  "Build authentication system following scraped framework documentation patterns",
  "."
)
```

### 3. Analysis → Implementation Pattern
```typescript
// Phase 1: Project analysis
analyze_project_structure(".")
generate_project_summary(".")

// Phase 2: Coordinated implementation
orchestrate_objective(
  "Refactor codebase based on analysis findings and implement missing features",
  "."
)
```

## 🔄 Sequential Task Management

### Complex Task Breakdown
1. **Start with `create_task()`** - Define the high-level goal
2. **Use `orchestrate_objective()`** - Let architect break down subtasks
3. **Monitor with `list_agents()`** - Track progress
4. **Coordinate via `join_room()`** - Real-time communication
5. **Store insights with `store_knowledge_memory()`** - Cross-agent learning

### Agent Specialization Types
- **`backend`** - API development, database design, server logic
- **`frontend`** - UI components, state management, user experience
- **`testing`** - Unit tests, integration tests, E2E testing
- **`documentation`** - Technical writing, API docs, README files
- **`devops`** - CI/CD, deployment, infrastructure
- **`analysis`** - Code review, performance analysis, architecture

## 💾 Knowledge Management Workflows

### Before Implementation - Always Research
```typescript
// 1. Search existing knowledge
const insights = await search_knowledge_graph(".", "similar feature implementation")

// 2. Scrape relevant documentation if needed
await scrape_documentation("https://relevant-docs.com")

// 3. Analyze current project structure
await analyze_project_structure(".")
```

### During Implementation - Store Learnings
```typescript
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
```

### After Implementation - Document Outcomes
```typescript
// Store implementation patterns for future use
await store_knowledge_memory(".", agent_id, "implementation_pattern",
  "JWT Authentication Flow",
  "Successful pattern: JWT in httpOnly cookies + CSRF tokens for security"
)
```

## 🚨 Error Recovery Patterns

### When Tasks Fail
1. **Check agent status**: `list_agents(".", "failed")`
2. **Review error logs**: Check shared memory for error patterns
3. **Restart with lessons learned**: Use previous insights in new objective
4. **Isolate problems**: Use single-agent tools for debugging

### Common Recovery Actions
```typescript
// If orchestration fails, break down manually
const task1 = await create_task(".", "research", "Investigate failed component")
const agent1 = await spawn_agent("analysis", ".", "Debug the failing authentication flow")

// Use room coordination for complex debugging
await join_room("debug-session-" + Date.now())
await send_message("debug-session", "Agent investigating auth flow failure", ["analysis-agent"])
```

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
1. `analyze_project_structure(".")` - Understand codebase
2. `search_knowledge_graph(".", "relevant query")` - Check existing knowledge
3. `scrape_documentation()` - Get external context if needed

### Phase 2: Planning
1. `create_task()` - Define objectives
2. `orchestrate_objective()` - Break down complex work
3. `join_room()` - Set up coordination

### Phase 3: Implementation
1. Agent-specific tools (`spawn_agent()`, specialized workflows)
2. `store_knowledge_memory()` - Continuous learning
3. `send_message()` - Cross-agent coordination

### Phase 4: Validation
1. `list_agents()` - Check completion status
2. Review stored insights and learnings
3. Run tests and validate implementation

## 💡 Best Practices

### Always Do This
- Start complex tasks with `orchestrate_objective()`
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
1. ✅ `analyze_project_structure(".")` - Understand the codebase
2. ✅ `search_knowledge_graph(".", "task-related-query")` - Check existing work
3. ✅ `orchestrate_objective("clear objective", ".", {foundation_session_id: "descriptive-name"})` - Coordinate implementation
4. ✅ `join_room("task-coordination")` - Monitor progress
5. ✅ `store_knowledge_memory()` - Document learnings throughout

**Data Location**: `~/.mcptools/data/` (SQLite databases with agent coordination, shared memory, and knowledge graphs)

🎯 **Core Principle**: Always use multi-agent orchestration for complex tasks. Single agents are for investigation and simple operations only.
<!-- zzZMCPToolsTypescriptzz END -->
