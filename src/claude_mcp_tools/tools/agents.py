"""Agent orchestration tools as standalone functions."""

import asyncio
from datetime import datetime, timezone
from typing import Annotated, Any

import structlog
from fastmcp import Context
from pydantic import Field

from ..models import AgentStatus
from ..services.agent_service import AgentService
from ..services.communication_service import CommunicationService
from .json_utils import parse_json_list, check_parsing_error
from .app import app

logger = structlog.get_logger("tools.agents")

# Import these from orchestration_server.py to avoid duplication
try:
    from ..orchestration_server import (
        ProcessPoolManager,
        parse_ai_json,
        setup_dependency_monitoring,
    )
except ImportError:
    # Fallback implementations if imports fail
    parse_ai_json = lambda x: x
    ProcessPoolManager = None
    setup_dependency_monitoring = lambda _x, _y: {"success": True}

# Import spawn function from separate module to avoid circular imports
_spawn_claude_sync = None

def get_agent_tool_profile(agent_type: str) -> dict[str, Any]:
    """Get agent tool profile with safe fallback."""
    try:
        from ..claude_spawner import get_agent_tool_profile as _profile_func
        return _profile_func(agent_type)
    except (ImportError, AttributeError):
        return {"allowed_tools": None, "description": "Unknown agent type"}

try:
    from ..claude_spawner import spawn_claude_sync as _spawn_claude_sync
except ImportError:
    pass


@app.tool(tags={"spawning", "agent-creation", "coordination", "task-execution"})
async def spawn_agent(
    ctx: Context,
    agent_type: Annotated[str, Field(
        description="Type of agent to spawn",
        pattern=r"^(general-agent|research-agent|bug-fixing-agent|implementation-agent|testing-agent|coordination-agent|documentation-agent|analysis-agent|implementer|reviewer|tester|documentation|analyzer|coordinator|backend|frontend|fullstack|devops|architect|master)$",
    )],
    repository_path: Annotated[str, Field(
        description="Path to the repository for agent work",
    )],
    task_description: Annotated[str, Field(
        description="Detailed description of the task for the agent",
        min_length=1,
        max_length=2000,
    )],
    capabilities: Annotated[str | list[str] | None, Field(
        description="List of specific capabilities the agent should have. Can be JSON array: ['backend', 'frontend']",
    )] = None,
    configuration: Annotated[str | dict[str, Any] | None, Field(
        description="Agent-specific configuration (JSON object or string)",
        default=None,
    )] = None,
    depends_on: Annotated[str | list[str] | None, Field(
        description="List of agent IDs this agent depends on. Can be JSON array: ['agent1', 'agent2']",
    )] = None,
    foundation_session_id: Annotated[str | None, Field(
        description="Foundation session ID for shared context (cost optimization)",
        default=None,
    )] = None,
) -> dict[str, Any]:
        """Create and spawn a specialized agent with specific capabilities for executing development tasks with coordination room integration."""
        # Parse list parameters if provided as JSON strings
        parsed_capabilities = parse_json_list(capabilities, "capabilities")
        if check_parsing_error(parsed_capabilities):
            return parsed_capabilities
        
        parsed_depends_on = parse_json_list(depends_on, "depends_on")
        if check_parsing_error(parsed_depends_on):
            return parsed_depends_on
            
        return await _spawn_single_agent(
            ctx=ctx,
            agent_type=agent_type,
            repository_path=repository_path,
            task_description=task_description,
            capabilities=parsed_capabilities,
            initial_context="",  # Not in schema, using default
            configuration=configuration,
            depends_on=parsed_depends_on,
            foundation_session_id=foundation_session_id or "",
            auto_execute=True,  # Not in schema, using default
            coordination_room="",  # Not in schema, using default
        )

@app.tool(tags={"spawning", "batch-operations", "parallel-processing", "agent-creation", "coordination"})
async def spawn_agents_batch(
    ctx: Context,
    repository_path: Annotated[str, Field(
        description="Path to the repository for agent work",
    )],
    agents: Annotated[str | list[dict[str, Any]], Field(
        description="List of agent configurations to spawn (JSON array or string)",
    )],
    foundation_session_id: Annotated[str | None, Field(
        description="Foundation session ID for shared context across all agents",
        default=None,
    )] = None,
    coordination_mode: Annotated[str, Field(
        description="How agents should coordinate",
        pattern=r"^(parallel|sequential|dependency_based)$",
    )] = "dependency_based",
    max_concurrent: Annotated[int, Field(
        description="Maximum number of agents to spawn concurrently",
        ge=1,
        le=10,
    )] = 5,
    coordination_room: Annotated[str | None, Field(
        description="Name of coordination room for agent communication",
        default=None,
    )] = None,
) -> dict[str, Any]:
    """Spawn multiple specialized agents in parallel for improved performance when creating teams of agents for complex projects."""
    try:
        # Parse agents configuration using json_utils
        parsed_agents = parse_json_list(agents, "agents")
        if check_parsing_error(parsed_agents):
            return parsed_agents
            
        agents_config = parsed_agents
        
        if not isinstance(agents_config, list):
            return {"error": {"code": "INVALID_AGENTS_CONFIG", "message": "Agents configuration must be a list"}}

        if not agents_config:
            return {"error": {"code": "EMPTY_AGENTS_LIST", "message": "No agents specified"}}

        # Validate agent configurations
        for i, agent_config in enumerate(agents_config):
            if not isinstance(agent_config, dict):
                return {"error": {"code": "INVALID_AGENT_CONFIG", "message": f"Agent {i} must be a dictionary"}}

            required_fields = ["agent_type", "task_description"]
            for field in required_fields:
                if field not in agent_config:
                    return {"error": {"code": "MISSING_REQUIRED_FIELD", "message": f"Agent {i} missing required field: {field}"}}

        # Spawn agents based on coordination mode
        results: list[dict[str, Any] | BaseException] = []
        
        if coordination_mode == "sequential":
            # Spawn agents one by one
            for agent_config in agents_config:
                try:
                    result = await _spawn_single_agent(ctx, 
                        agent_type=agent_config["agent_type"],
                        repository_path=repository_path,
                        task_description=agent_config["task_description"],
                        capabilities=agent_config.get("capabilities", []),
                        initial_context=agent_config.get("initial_context", ""),
                        configuration=agent_config.get("configuration"),
                        depends_on=agent_config.get("depends_on", []),
                        foundation_session_id=foundation_session_id or "",
                        coordination_room=coordination_room or "",
                    )
                    results.append(result)
                except Exception as e:
                    results.append(e)
        
        elif coordination_mode == "dependency_based":
            # Sort agents by dependencies and spawn in waves
            dependency_waves = _organize_by_dependencies(agents_config)
            
            for wave in dependency_waves:
                # Respect max_concurrent within each wave
                semaphore = asyncio.Semaphore(min(max_concurrent, len(wave)))
                
                async def spawn_with_limit(agent_config, sem=semaphore):
                    async with sem:
                        return await _spawn_single_agent(ctx, 
                            agent_type=agent_config["agent_type"],
                            repository_path=repository_path,
                            task_description=agent_config["task_description"],
                            capabilities=agent_config.get("capabilities", []),
                            initial_context=agent_config.get("initial_context", ""),
                            configuration=agent_config.get("configuration"),
                            depends_on=agent_config.get("depends_on", []),
                            foundation_session_id=foundation_session_id or "",
                            coordination_room=coordination_room or "",
                        )
                
                wave_tasks = [spawn_with_limit(config) for config in wave]
                wave_results = await asyncio.gather(*wave_tasks, return_exceptions=True)
                results.extend(wave_results)
        
        else:  # parallel mode
            # Spawn agents in parallel with max_concurrent limit
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def spawn_with_parallel_limit(agent_config):
                async with semaphore:
                    return await _spawn_single_agent(ctx, 
                        agent_type=agent_config["agent_type"],
                        repository_path=repository_path,
                        task_description=agent_config["task_description"],
                        capabilities=agent_config.get("capabilities", []),
                        initial_context=agent_config.get("initial_context", ""),
                        configuration=agent_config.get("configuration"),
                        depends_on=agent_config.get("depends_on", []),
                        foundation_session_id=foundation_session_id or "",
                        coordination_room=coordination_room or "",
                    )
            
            tasks = [spawn_with_parallel_limit(config) for config in agents_config]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        successful_agents = []
        failed_agents = []

        for i, result in enumerate(results):
            if isinstance(result, Exception) or not isinstance(result, dict):
                failed_agents.append({
                    "index": i,
                    "agent_config": agents_config[i],
                    "error": str(result),
                })
            elif result.get("success"):
                successful_agents.append(result)
            else:
                failed_agents.append({
                    "index": i,
                    "agent_config": agents_config[i],
                    "error": result.get("error", "Unknown error"),
                })

        logger.info("Batch agent spawning completed",
                    total_requested=len(agents_config),
                    successful=len(successful_agents),
                    failed=len(failed_agents))

        return {
            "success": True,
            "batch_stats": {
                "total_requested": len(agents_config),
                "successful": len(successful_agents),
                "failed": len(failed_agents),
            },
            "successful_agents": successful_agents,
            "failed_agents": failed_agents,
            "foundation_session_id": foundation_session_id,
            "coordination_room": coordination_room,
        }

    except Exception as e:
        logger.error("Batch agent spawning failed", error=str(e))
        return {"error": {"code": "BATCH_SPAWN_FAILED", "message": str(e)}}

@app.tool(tags={"agent-management", "monitoring", "filtering", "status-checking"})
async def list_agents(
    repository_path: Annotated[str, Field(
        description="Path to the repository to filter agents by",
    )],
    status_filter: Annotated[str | list[str] | None, Field(
        description="Filter agents by status. Can be JSON array: ['pending', 'running', 'completed', 'failed']",
        default=None,
    )] = None,
    agent_type_filter: Annotated[str | None, Field(
        description="Filter by agent type",
        default=None,
    )] = None,
    include_completed: Annotated[bool, Field(
        description="Include completed agents in results",
    )] = True,
    limit: Annotated[int, Field(
        description="Maximum number of agents to return",
        ge=1,
        le=100,
    )] = 50,
) -> dict[str, Any]:
    """List and filter active agents by repository, status, or type to monitor current agent workforce and availability."""
    try:
        # Parse status_filter using json_utils
        parsed_status_filter = parse_json_list(status_filter, "status_filter")
        if check_parsing_error(parsed_status_filter):
            return parsed_status_filter
        
        # Convert status_filter to AgentStatus enums if provided
        status_enum_filter = None
        if parsed_status_filter:
            try:
                status_enum_filter = [AgentStatus(status) for status in parsed_status_filter]
            except ValueError as e:
                return {"error": {"code": "INVALID_STATUS_FILTER", "message": f"Invalid status: {e}"}}

        # Get all agents for the repository using static method
        all_agents = await AgentService.list_agents(
            repository_path=repository_path,
            status_filter=status_enum_filter,
            agent_type=agent_type_filter,
        )
        if not all_agents:
            return {"error": {"code": "AGENT_LIST_FAILED", "message": "Failed to retrieve agents"}}
        
        # Apply client-side filtering for include_completed and limit
        agents_list = all_agents.get("agents", [])
        
        # Filter out completed agents if not requested
        if not include_completed:
            agents_list = [agent for agent in agents_list if agent.get("status") != "completed"]
        
        # Apply limit
        if limit:
            agents_list = agents_list[:limit]
        
        # Generate statistics
        status_counts = {}
        type_counts = {}
        for agent in agents_list:
            status = agent.get("status", "unknown")
            agent_type = agent.get("agent_type", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            type_counts[agent_type] = type_counts.get(agent_type, 0) + 1
        
        return {
            "success": True,
            "repository_path": repository_path,
            "agents": agents_list,
            "statistics": {
                "total_agents": all_agents.get("count", 0),
                "filtered_agents": len(agents_list),
                "by_status": status_counts,
                "by_type": type_counts,
            },
            "filters_applied": {
                "status_filter": parsed_status_filter,
                "agent_type_filter": agent_type_filter,
                "include_completed": include_completed,
                "limit": limit,
            },
        }

    except Exception as e:
        logger.error("Failed to list agents", repository=repository_path, error=str(e))
        return {"error": {"code": "LIST_AGENTS_FAILED", "message": str(e)}}

@app.tool(tags={"agent-management", "monitoring", "status-checking", "debugging"})
async def get_agent_status(agent_id: str) -> dict[str, Any]:
    """Get detailed status information for a specific agent including execution details and task progress."""
    try:
        result = await AgentService.get_agent_by_id(agent_id=agent_id)

        if not result:
            return {"error": {"code": "AGENT_NOT_FOUND", "message": "Agent not found"}}

        # Check if Claude CLI process is still running
        import psutil
        
        claude_pid = result.get("claude_pid")
        
        if claude_pid:
            try:
                # Check if process is still running
                process = psutil.Process(claude_pid)
                if process.is_running():
                    # Process is still active
                    result["status"] = "active"
                    result["process_status"] = "running"
                else:
                    # Process completed - update status
                    result["status"] = "completed" 
                    result["process_status"] = "completed"
                    await AgentService.complete_agent(agent_id=agent_id)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                # Process no longer exists - mark as completed
                result["status"] = "completed"
                result["process_status"] = "completed"
                await AgentService.complete_agent(agent_id=agent_id)

        return {"success": True, "agent": result}

    except Exception as e:
        logger.error("Failed to get agent status", agent_id=agent_id, error=str(e))
        return {"error": {"code": "GET_STATUS_FAILED", "message": str(e)}}

@app.tool(tags={"agent-management", "termination", "cleanup", "resource-management"})
async def terminate_agent(agent_id: str, reason: str = "Manual termination") -> dict[str, Any]:
    """Gracefully terminate a specific agent and clean up its resources."""
    try:
        success = await AgentService.terminate_agent(agent_id=agent_id)

        if success:
            return {"success": True, "agent_id": agent_id, "reason": reason, "status": "terminated"}
        else:
            return {"error": {"code": "AGENT_NOT_FOUND", "message": "Agent not found or already terminated"}}

    except Exception as e:
        logger.error("Failed to terminate agent", agent_id=agent_id, error=str(e))
        return {"error": {"code": "TERMINATE_FAILED", "message": str(e)}}


async def _spawn_single_agent(
    ctx: Context,
    agent_type: str,
    repository_path: str,
    task_description: str = "",
    capabilities: list[str] | None = None,
    initial_context: str = "",
    configuration: str | dict[str, Any] | None = None,
    depends_on: list[str] | None = None,
    foundation_session_id: str = "",
    auto_execute: bool = True,
    coordination_room: str = "",
) -> dict[str, Any]:
    """Internal function to spawn a single agent - extracted for parallel execution."""
    # Initialize mutable defaults
    if capabilities is None:
        capabilities = []
    if depends_on is None:
        depends_on = []
        
    try:
        # Parse configuration using AI-tolerant parser
        try:
            parsed_configuration = parse_ai_json(configuration)
        except ValueError as e:
            return {"error": {"code": "INVALID_CONFIGURATION", "message": str(e)}}

        # 1. Create database record first
        agent_result = await AgentService.create_agent(
            agent_type=agent_type,
            repository_path=repository_path,
            capabilities=capabilities,
            initial_context=initial_context,
            configuration=parsed_configuration,
        )

        if not agent_result.get("success"):
            return {"error": {"code": "AGENT_DB_CREATION_FAILED", "message": agent_result.get("error", "Unknown error")}}

        agent_id = agent_result["agent_id"]
        agent_name = f"{agent_type}-agent"

        # 2. Set up dependency monitoring if needed
        dependency_info = {}
        if depends_on:
            dependency_info = setup_dependency_monitoring(agent_id, depends_on)
            if not dependency_info.get("success"):
                logger.warning("Dependency setup failed", agent_id=agent_id, depends_on=depends_on)

        # 3. Spawn actual Claude instance if auto_execute is True
        claude_pid = None
        execution_info = {}

        if auto_execute:
            # Check if spawn function is available
            if _spawn_claude_sync is None:
                logger.error("_spawn_claude_sync is None - import failed")
                return {"error": {"code": "SPAWN_FUNCTION_UNAVAILABLE", "message": "spawn_claude_sync function not available due to import failure"}}
            # Use provided coordination room or create agent-specific one
            room_name = coordination_room or f"{agent_type}-{agent_id[:8]}"

            # Ensure coordination room exists
            if coordination_room:
                # Join existing room (assumed to exist)
                try:
                    await CommunicationService.join_room(
                        room_name=room_name,
                        agent_name=agent_name,
                        agent_id=agent_id,
                    )
                except Exception:
                    # Room might already exist or join might fail - that's okay
                    pass
            else:
                # Create new room for this agent
                await CommunicationService.create_room(
                    name=room_name,
                    description=f"Coordination room for {agent_type} agent {agent_id}",
                    repository_path=repository_path,
                )

            # Get agent's available MCP tools for the prompt
            profile = get_agent_tool_profile(agent_type)
            if profile["allowed_tools"]:
                mcp_tools = [tool for tool in profile["allowed_tools"] if tool.startswith("mcp__")]
                mcp_tools_list = "\n".join([f"- {tool}" for tool in mcp_tools])
            else:
                mcp_tools_list = "- ALL MCP tools available (full access)"

            # Construct Claude prompt for the agent
            claude_prompt = f"""You are a {agent_type.upper()} AGENT in the ClaudeMcpTools multi-agent orchestration system.

🤖 AGENT INFO:
- Agent ID: {agent_id}
- Agent Type: {agent_type}
- Repository: {repository_path}
- Coordination Room: {room_name}

🧠 SHARED TEAM MEMORY:
CRITICAL: Use the team's shared memory system to learn from other agents and share your discoveries!

🔍 BEFORE YOU START - Search Memory:
1. **Always search first**: Use search_memory() to find relevant knowledge from other agents
2. **Learn from others**: Look for patterns, solutions, known issues, best practices
3. **Avoid duplicating work**: Check if similar tasks have been completed before

Example searches:
- search_memory(repository_path=".", query_text="authentication problems")
- search_memory(repository_path=".", query_text="performance optimization") 
- search_memory(repository_path=".", query_text="database connection issues")

💾 DURING WORK - Store Memory:
1. **Share discoveries**: Use store_memory() to save important insights for other agents
2. **Document solutions**: Store how you solved problems so others can learn
3. **Save patterns**: Record useful code patterns, configurations, or approaches

Example storage:
- store_memory(repository_path=".", agent_id="{agent_id}", entry_type="solution", title="Fixed auth timeout", content="Updated session timeout to 30min, prevents login issues")

🛠️ TOOLS AVAILABLE:
- **Memory Tools**: search_memory, store_memory (USE THESE FREQUENTLY!)
- **Native Claude**: Task, Bash, Edit, Write, Read, Glob, Grep, LS, MultiEdit, WebFetch, WebSearch
- **MCP Tools**: {len(profile["allowed_tools"]) if profile["allowed_tools"] else "ALL"} specialized tools available

🎯 YOUR TASK:
{task_description}

IMPORTANT: You MUST use tools to complete this task. Don't just think about it - actually use Write, Edit, Bash, or other tools to get things done!

📋 CONTEXT:
{initial_context}

🔗 DEPENDENCIES:
{f"⏳ Waiting for agents: {', '.join(depends_on)}" if depends_on else "✅ No dependencies - ready to start"}

🏗️ COORDINATION WORKFLOW:
1. **JOIN ROOM**: Use join_room() to join "{room_name}"
2. **SEARCH MEMORY**: Look for relevant knowledge: search_memory(repository_path=".", query_text="[your task topic]")
3. **ANNOUNCE**: Send message announcing your presence and task
4. **EXECUTE**: Work on your specific task, storing discoveries as you go
5. **STORE KNOWLEDGE**: Save important findings: store_memory() for patterns, solutions, insights
6. **REPORT**: Send progress updates and announce completion
7. **COLLABORATE**: Help other agents and respond to coordination requests

💬 CHAT COMMANDS FOR COORDINATION:
- join_room(room_name="{room_name}", agent_name="{agent_name}", agent_id="{agent_id}")
- send_message(room_name="{room_name}", agent_name="{agent_name}", message="your message")
- get_messages(room_name="{room_name}", agent_id="{agent_id}")
- wait_for_messages(room_name="{room_name}", agent_id="{agent_id}")

🔧 MCP TOOL COMMANDS:
You have access to the following MCP tools (use the full mcp__ prefix when calling them):
{mcp_tools_list}

🚀 START BY:
1. Joining the coordination room
2. **SEARCHING MEMORY for relevant knowledge** about your task
3. Announcing: "🤖 {agent_type.upper()} AGENT online! Task: {task_description[:100]}..."
4. {f"Waiting for dependencies to complete: {', '.join(depends_on)}" if depends_on else "Beginning task execution immediately"}

📝 MANDATORY REQUIREMENTS:
- **ALWAYS join the room first** using: mcp__claude-mcp-orchestration__join_room
- **ALWAYS search memory before starting work** using: mcp__claude-mcp-orchestration__search_memory
- **ALWAYS store important discoveries** using: mcp__claude-mcp-orchestration__store_memory
- **Log all major steps** to the room with descriptive messages
- **Report progress updates** every few actions: "🔄 Progress: [current step]"
- **MUST report final results** with: "✅ COMPLETED: [summary of what was accomplished]"
- **Include any files created/modified** in final report
- **Tag other agents** if coordination needed: @agent-id or @agent-type

🔄 ENHANCED WORKFLOW PATTERN:
1. JOIN ROOM → 2. SEARCH MEMORY → 3. ANNOUNCE START → 4. EXECUTE & STORE DISCOVERIES → 5. REPORT RESULTS

Remember: You're part of a TEAM. Use the shared memory to learn from others and help them learn from you!

Begin coordination and task execution now!""".format(mcp_tools_list=mcp_tools_list)

            try:
                # Use server logging for debugging, Context for client communication only
                logger.info("Starting agent spawn",
                           agent_id=agent_id,
                           agent_type=agent_type,
                           repository_path=repository_path,
                           foundation_session_id=foundation_session_id)
                
                # Get tool profile
                from ..claude_spawner import spawn_claude_with_profile
                profile = get_agent_tool_profile(agent_type)
                tool_count = len(profile["allowed_tools"]) if profile["allowed_tools"] else "ALL"
                
                logger.info("Using agent tool profile",
                           agent_id=agent_id,
                           agent_type=agent_type,
                           profile_description=profile["description"],
                           tool_count=tool_count)
                
                # Send client notification only - no debugging info
                try:
                    await ctx.info(f"🚀 Spawning {agent_type} agent")
                except Exception as ctx_error:
                    # Context logging failure shouldn't crash the server
                    logger.warning("Context logging failed", error=str(ctx_error))
                
                # Wrap synchronous spawn call with proper error isolation
                try:
                    claude_result = spawn_claude_with_profile(
                        workFolder=repository_path,
                        prompt=claude_prompt,
                        agent_type=agent_type,
                        session_id=foundation_session_id if foundation_session_id else None,
                        model="sonnet",
                    )
                    
                    # Log spawn result to server logs only
                    logger.debug("Claude spawn completed", 
                               agent_id=agent_id,
                               success=claude_result.get("success"),
                               pid=claude_result.get("pid"))
                    
                    # Validate spawn result
                    if not claude_result.get("success", False):
                        error_msg = claude_result.get("error", "Unknown spawn error")
                        logger.error("Claude CLI spawn failed", 
                                   agent_id=agent_id,
                                   error=error_msg)
                        raise RuntimeError(f"Claude CLI spawn failed: {error_msg}")
                    
                    # Validate process before using
                    process = claude_result.get("process")
                    if not process:
                        logger.error("No process object returned from spawn", 
                                   agent_id=agent_id,
                                   claude_result=claude_result)
                        raise RuntimeError("No process object returned from spawn")
                    
                    # Check if process is still running (not immediately dead)
                    if process.poll() is not None:
                        logger.error("Process died immediately after spawn", 
                                   agent_id=agent_id,
                                   returncode=process.returncode)
                        raise RuntimeError(f"Process died immediately with code {process.returncode}")

                    claude_pid = claude_result.get("pid")
                    if not claude_pid:
                        logger.error("Claude CLI spawn succeeded but no PID returned", 
                                   agent_id=agent_id,
                                   claude_result=claude_result)
                        raise RuntimeError("Claude CLI spawn succeeded but no PID returned")
                        
                except Exception as spawn_error:
                    # Handle spawn errors without crashing async context
                    error_msg = f"Spawn operation failed: {type(spawn_error).__name__}: {str(spawn_error)}"
                    logger.error("Synchronous spawn call failed", 
                               agent_id=agent_id,
                               agent_type=agent_type,
                               error=error_msg,
                               error_type=type(spawn_error).__name__)
                    
                    # Re-raise as a controlled exception
                    raise RuntimeError(error_msg) from spawn_error

                logger.info("Claude CLI spawned successfully for agent",
                          agent_id=agent_id,
                          claude_pid=claude_pid,
                          agent_type=agent_type)

                execution_info = {
                    "claude_pid": claude_pid,
                    "foundation_session_id": foundation_session_id,
                    "coordination_room": room_name,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "spawn_success": True,
                }

                # Update agent metadata with execution info
                updated_config = parsed_configuration or {}
                updated_config.update({
                    "claude_pid": claude_pid,
                    "coordination_room": room_name,
                    "foundation_session_id": foundation_session_id,
                    "dependencies": depends_on,
                    "task_description": task_description,
                    "spawn_success": True,
                })

                # Update agent status with error isolation
                try:
                    await AgentService.update_agent_status(
                        agent_id=agent_id,
                        status=AgentStatus.ACTIVE if not depends_on else AgentStatus.IDLE,
                        agent_data=updated_config,
                    )
                    logger.debug("Agent status updated successfully", agent_id=agent_id)
                except Exception as status_error:
                    logger.error("Failed to update agent status", 
                               agent_id=agent_id,
                               error=str(status_error),
                               error_type=type(status_error).__name__)
                    # Don't fail the entire spawn for database issues
                    pass
                
                # Store the Claude CLI PID for monitoring with validation
                try:
                    await AgentService.update_agent_pid(agent_id=agent_id, claude_pid=claude_pid)
                    logger.debug("PID stored successfully for agent", agent_id=agent_id, claude_pid=claude_pid)
                except Exception as pid_error:
                    logger.error("Failed to store PID for agent", 
                               agent_id=agent_id, 
                               claude_pid=claude_pid,
                               error=str(pid_error))
                    # Don't fail the entire spawn for PID storage issues
                    pass

                logger.info("Spawned specialized agent",
                           agent_id=agent_id,
                           agent_type=agent_type,
                           claude_pid=claude_pid,
                           room=room_name,
                           task=task_description[:100])

            except Exception as e:
                # Use server logging for debugging, Context for client error notification only
                logger.error("Failed to spawn Claude instance",
                           agent_id=agent_id,
                           agent_type=agent_type,
                           error=str(e),
                           error_type=type(e).__name__,
                           repository_path=repository_path,
                           exc_info=True)
                
                # Send simple error to client
                try:
                    await ctx.error(f"💥 Failed to spawn {agent_type} agent")
                except Exception as ctx_error:
                    # Context error logging failure shouldn't crash the server
                    logger.warning("Context error logging failed", error=str(ctx_error))
                
                # Update agent status to indicate spawn failure
                execution_info = {
                    "error": f"Claude spawn failed: {e!s}",
                    "spawn_success": False,
                    "error_type": type(e).__name__,
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                }
                
                # Mark agent as failed due to spawn error
                try:
                    failed_config = parsed_configuration or {}
                    failed_config.update({
                        "spawn_error": str(e),
                        "coordination_room": room_name,
                        "foundation_session_id": foundation_session_id,
                        "dependencies": depends_on,
                        "task_description": task_description,
                        "spawn_success": False,
                    })
                    
                    await AgentService.update_agent_status(
                        agent_id=agent_id,
                        status=AgentStatus.TERMINATED,  # Mark as terminated due to spawn failure
                        agent_data=failed_config,
                    )
                except Exception as status_error:
                    logger.error("Failed to update agent status after spawn failure",
                               agent_id=agent_id,
                               original_error=str(e),
                               status_error=str(status_error))

        return {
            "success": True,
            "agent_id": agent_id,
            "agent_type": agent_type,
            "agent_name": agent_name,
            "repository_path": repository_path,
            "task_description": task_description,
            "auto_execute": auto_execute,
            "claude_pid": claude_pid,
            "execution_info": execution_info,
            "dependency_info": dependency_info,
            "coordination_room": coordination_room or f"{agent_type}-{agent_id[:8]}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.error("Error spawning agent", error=str(e))
        return {"error": {"code": "SPAWN_AGENT_FAILED", "message": str(e)}}


def _organize_by_dependencies(agents_config: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Organize agents into dependency waves for sequential spawning."""
    # Track which agents have been placed in waves
    placed_agents = set()
    waves = []
    
    while len(placed_agents) < len(agents_config):
        current_wave = []
        
        for i, agent_config in enumerate(agents_config):
            if i in placed_agents:
                continue
                
            # Check if all dependencies for this agent are already placed
            depends_on = agent_config.get("depends_on", [])
            dependencies_satisfied = True
            
            for dep in depends_on:
                # Look for dependency by agent ID or index
                dep_found = False
                for j, other_config in enumerate(agents_config):
                    if j in placed_agents and (
                        other_config.get("agent_id") == dep or 
                        str(j) == str(dep) or
                        other_config.get("agent_type") == dep
                    ):
                        dep_found = True
                        break
                
                if not dep_found:
                    dependencies_satisfied = False
                    break
            
            # If no dependencies or all dependencies satisfied, add to current wave
            if not depends_on or dependencies_satisfied:
                current_wave.append(agent_config)
                placed_agents.add(i)
        
        # If we found agents for this wave, add them
        if current_wave:
            waves.append(current_wave)
        else:
            # Break infinite loop - add remaining agents to avoid deadlock
            remaining_agents = [config for i, config in enumerate(agents_config) if i not in placed_agents]
            if remaining_agents:
                waves.append(remaining_agents)
            break
    
    return waves