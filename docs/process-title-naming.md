# ZMCP Agent Process Title Naming Convention

## Format
```
zmcp-<type>-<project>-<id>
```

## Examples
- `zmcp-be-oauth-implementation-a3f2e1` - Backend agent working on OAuth
- `zmcp-fe-react-login-ui-b7d9c2` - Frontend agent building React login
- `zmcp-ts-auth-testing-suite-c1e4d3` - Testing agent writing auth tests
- `zmcp-ar-full-stack-feature-d2a1e4` - Architect coordinating full-stack work

## Agent Type Abbreviations
| Full Type      | Abbreviation | Purpose                           |
|----------------|--------------|-----------------------------------|
| backend        | be           | API, database, server logic       |
| frontend       | fe           | UI, components, client-side       |
| testing        | ts           | Unit, integration, E2E tests      |
| documentation  | dc           | Technical docs, API docs, README  |
| architect      | ar           | Multi-agent coordination          |
| devops         | dv           | CI/CD, deployment, infrastructure |
| analysis       | an           | Code review, performance analysis |
| researcher     | rs           | Documentation research, learning  |
| implementer    | im           | General implementation tasks      |
| reviewer       | rv           | Code review, quality assurance    |

## Benefits

1. **Process Identification**
   ```bash
   # See all ZMCP agents
   ps aux | grep "zmcp-"
   
   # See only backend agents
   ps aux | grep "zmcp-be-"
   
   # See agents for specific project
   ps aux | grep "zmcp-.*-oauth-"
   ```

2. **Process Management**
   ```bash
   # Kill all testing agents
   pkill -f "zmcp-ts-"
   
   # Kill specific agent
   pkill -f "zmcp-be-oauth-implementation-a3f2e1"
   
   # Kill all agents for a project
   pkill -f "zmcp-.*-react-login-"
   ```

3. **Monitoring**
   ```bash
   # Watch agent activity
   watch 'ps aux | grep "zmcp-" | grep -v grep'
   
   # Count agents by type
   ps aux | grep "zmcp-" | awk -F- '{print $2}' | sort | uniq -c
   ```

## Integration with MCP Tools

The wrapper script (`zmcp-agent-wrapper.js`) should be called by the `spawn_agent` tool to automatically set process titles. This provides:

- Instant visibility into running agents
- Easy process management
- Clear project context
- Unique identification for each agent

## Project Context Guidelines

- Keep under 20 characters for readability
- Use hyphens instead of spaces
- Lowercase for consistency
- Descriptive but concise

Good examples:
- `oauth-implementation`
- `react-auth-ui`
- `api-refactor`
- `test-coverage`
- `docs-update`

## Implementation Notes

1. The wrapper script sets `process.title` before spawning the actual claude process
2. Environment variables are passed to preserve agent context:
   - `ZMCP_AGENT_TYPE`
   - `ZMCP_PROJECT_CONTEXT`
   - `ZMCP_AGENT_ID`
   - `ZMCP_PROCESS_TITLE`
3. Signals are properly forwarded to the child process
4. Exit codes are preserved from the child process