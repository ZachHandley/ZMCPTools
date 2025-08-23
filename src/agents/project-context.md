# ZMCPTools Project Context

## Architecture Overview
ZMCPTools uses Claude Code's native subagent system with preserved dashboard integration and knowledge management capabilities.

### Core Components
- **Native Subagents**: Replace custom orchestration with Claude Code's built-in system
- **Dashboard Connection**: Real-time progress tracking via DashboardConnectionService  
- **Knowledge Persistence**: Structured storage in ~/.mcptools/data/
- **Vector Storage**: Semantic search with LanceDB at ~/.mcptools/lancedb/

### Key Services Preserved
- `DashboardConnectionService` - WebSocket-based progress tracking
- `KnowledgeGraphService` - Structured knowledge with relationships
- `LanceDBService` - Vector similarity search and embeddings
- `WebScrapingService` - Intelligent documentation indexing
- `BrowserService` - Cross-platform browser automation

## Subagent Architecture

### Available Subagents
1. **project-analyzer** - Codebase analysis and structure understanding
2. **web-researcher** - Documentation scraping and web intelligence
3. **knowledge-searcher** - Knowledge graph and vector search
4. **file-manager** - Advanced file operations and code transformations
5. **browser-automator** - Browser automation and web interaction

### Subagent Coordination Patterns
- Use **Task tool** for parallel context gathering
- Report progress to dashboard for real-time visibility  
- Store insights in knowledge graph for cross-subagent learning
- Coordinate via dashboard messaging when needed

### Dashboard Integration
All subagents automatically integrate with the dashboard:
- Progress updates appear in real-time
- Knowledge graph updates are visible
- Vector search results are displayed
- Agent coordination is tracked and visualized

## Development Workflows

### Before Implementation
```typescript
// Always start with analysis
> Use project-analyzer to understand the current codebase structure

// Research relevant patterns
> Use knowledge-searcher to find similar implementations we've done before

// Gather external context if needed  
> Use web-researcher to find best practices for [technology]
```

### During Implementation
```typescript
// Let subagents work in parallel
> Use project-analyzer to understand dependencies while web-researcher finds examples, then implement the feature

// Store learnings automatically
// Subagents will store insights in knowledge graph as they discover them
```

### After Implementation
```typescript
// Validate and document
> Use project-analyzer to verify the implementation follows project patterns

// Update knowledge for future use
// All insights are automatically stored in knowledge graph
```

## Common Patterns

### Full-Stack Feature Development
```typescript
// Multiple subagents coordinate automatically
> Use project-analyzer to understand current auth system, web-researcher to find modern patterns, then implement JWT authentication with comprehensive tests and documentation
```

### Research-Driven Development  
```typescript
// Research first, then implement
> Use web-researcher to study React 19 server components, then use knowledge-searcher to see how we've handled similar patterns, then implement the feature
```

### Complex Refactoring
```typescript  
// Analysis-driven refactoring
> Use project-analyzer to map current component structure, then use file-manager to safely refactor to new patterns
```

## Tool Integration

### MCP Tools Available to Subagents
- All subagents have access to relevant MCP tools
- Task tool enables parallel context gathering
- Dashboard tools for progress reporting
- Knowledge graph tools for insight storage

### Performance Optimization
- Subagents use Claude Code's native session management
- Parallel execution via Task tool
- Dashboard provides real-time coordination
- No custom orchestration overhead

## Data Storage

### Locations
- **Project Analysis**: ~/.mcptools/data/ (SQLite)
- **Vector Search**: ~/.mcptools/lancedb/ (LanceDB) 
- **Dashboard State**: In-memory with WebSocket sync
- **Knowledge Graph**: ~/.mcptools/data/ (SQLite with relationships)

### Persistence Strategy
- All subagent insights stored automatically
- Cross-project knowledge sharing enabled
- Vector embeddings for semantic search
- Dashboard state synchronized in real-time

This architecture provides the same powerful capabilities as the previous custom orchestration system while leveraging Claude Code's native features for better performance and simpler maintenance.