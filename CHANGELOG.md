# Changelog

All notable changes to ClaudeMcpTools will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-02

### Added
- 🚀 **Complete multi-agent orchestration system** with 65+ enhanced MCP tools
- 🎯 **Architect-led coordination** for intelligent task breakdown and agent spawning
- 🎨 **Modern CLI interface** built with Typer + Rich for beautiful terminal experience
- 🎛️ **Web dashboard** with real-time monitoring and agent management
- 📂 **Enhanced file operations** with smart ignore patterns and fuzzy string replacement
- 🌳 **Project analysis tools** with AI-optimized structure analysis and dead code detection
- 📚 **Documentation intelligence** with automated scraping and semantic search
- 🤖 **Multi-agent spawning** with dependencies, real-time communication, and shared memory
- 🔧 **One-command installation** via `uv tool install claude-mcp-tools`
- 📝 **Automatic CLAUDE.md integration** with architect guidance and examples

### Fixed
- 🔍 **Claude Code MCP tool discovery** - Now correctly shows all 59 orchestration tools instead of 37
- 🚀 **Installer launcher script generation** - Fixed to use proper `exec` format instead of `uv run python -m`
- 💾 **UV tool caching issue** - Resolved problem where CLI updates weren't reflected due to bytecode caching
- 🏷️ **FastMCP compatibility** - Added explicit tool names for Claude Code tool name validation
- 🧹 **Installer cleanup** - Removed redundant installer directory and consolidated installation logic

### Technical Details
- **Python Support**: 3.10, 3.11, 3.12, 3.13
- **Dependencies**: FastMCP 2.9.0+, FastAPI, ChromaDB, Playwright, SQLAlchemy
- **Storage**: Local data at `~/.claude/zmcptools/` with intelligent caching
- **Installation**: Global via UV tools with automatic Claude Code MCP server configuration

### Breaking Changes
- First stable release - no breaking changes from previous versions
