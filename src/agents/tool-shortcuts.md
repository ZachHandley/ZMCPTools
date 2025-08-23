# ZMCPTools Command Shortcuts and Patterns

## Quick Analysis Commands

### Project Understanding
```
"Analyze this codebase" → project-analyzer subagent
"What's the architecture here?" → project-analyzer subagent  
"Show me the project structure" → project-analyzer subagent
"Understand this code" → project-analyzer subagent
```

### Research and Documentation
```
"Research [framework/library]" → web-researcher subagent
"Find examples of [pattern]" → web-researcher subagent
"Study the [technology] docs" → web-researcher subagent
"Learn about [concept]" → web-researcher subagent
```

### Knowledge Discovery
```
"Find similar patterns" → knowledge-searcher subagent
"Have we done this before?" → knowledge-searcher subagent
"What did we learn about [topic]?" → knowledge-searcher subagent
"Show previous implementations" → knowledge-searcher subagent
```

### File Operations
```
"Refactor these components" → file-manager subagent
"Batch rename files" → file-manager subagent
"Smart find and replace" → file-manager subagent
"Clean up the codebase" → file-manager subagent
```

### Web Automation
```
"Test the login flow" → browser-automator subagent
"Scrape that website" → browser-automator subagent
"Automate this workflow" → browser-automator subagent
"Take screenshots of the app" → browser-automator subagent
```

## Dashboard Integration Patterns

### Progress Monitoring
```
// Dashboard automatically shows:
- Subagent status and progress
- Knowledge graph updates
- Vector search results
- Real-time coordination between subagents
```

### Knowledge Accumulation
```
// Dashboard displays:
- New insights discovered by subagents
- Implementation patterns found
- Error patterns and solutions
- Cross-project learning progress
```

## Complex Workflow Patterns

### Full-Stack Feature Implementation
```
"Use project-analyzer to understand the auth system, web-researcher to find JWT best practices, then implement secure authentication with tests"

// This automatically:
// 1. Spawns project-analyzer for codebase analysis
// 2. Spawns web-researcher for JWT patterns research
// 3. Coordinates implementation across multiple subagents
// 4. Reports progress via dashboard
// 5. Stores learnings in knowledge graph
```

### Research-Driven Development
```  
"Research Next.js 14 app router patterns, find our previous routing implementations, then modernize our routing system"

// This automatically:
// 1. web-researcher scrapes Next.js docs
// 2. knowledge-searcher finds previous routing patterns  
// 3. project-analyzer understands current routing
// 4. Coordinates modernization with file-manager
```

### Performance Optimization
```
"Analyze performance bottlenecks, research optimization patterns, then implement improvements"

// This automatically:
// 1. project-analyzer identifies performance issues
// 2. web-researcher finds optimization techniques
// 3. knowledge-searcher checks previous optimizations
// 4. file-manager implements improvements safely
```

## Subagent Communication Patterns

### Parallel Execution
```
// Multiple subagents work simultaneously:
> "While project-analyzer maps the component structure, have web-researcher find React 19 patterns, then coordinate the upgrade"
```

### Sequential Coordination  
```
// Subagents build on each other's work:
> "First use knowledge-searcher to understand our auth patterns, then web-researcher to find OAuth improvements, finally implement the changes"
```

### Cross-Subagent Learning
```
// Subagents share discoveries automatically:
- project-analyzer finds architectural patterns
- knowledge-searcher stores them for future reference
- web-researcher validates against external best practices
- All insights appear in dashboard real-time
```

## Efficiency Patterns

### Context Gathering
```
// Use Task tool for parallel context:
> "Use project-analyzer and knowledge-searcher in parallel to understand both current code and previous decisions before implementing"
```

### Batch Operations
```
// Coordinate multiple operations:
> "Use file-manager to refactor components while browser-automator tests the changes and web-researcher validates against best practices"
```

### Learning and Documentation
```
// Continuous knowledge building:
> "As you implement, store insights about what works and what doesn't for future reference"
```

## Dashboard Commands and Views

### Real-time Monitoring
```
// Dashboard automatically shows:
- Which subagents are active
- Current task progress
- Knowledge being discovered
- Vector search results
- Inter-agent coordination messages
```

### Knowledge Graph Views
```  
// Dashboard displays:
- New knowledge entries created
- Relationships between concepts discovered
- Pattern recognition across projects
- Error resolution tracking
```

### Performance Insights
```
// Dashboard tracks:
- Subagent execution efficiency
- Knowledge reuse across tasks
- Time savings from previous learnings
- Success rates of different patterns
```

These patterns enable powerful, coordinated development workflows while maintaining the dashboard visibility and knowledge persistence that makes ZMCPTools effective for complex software development tasks.