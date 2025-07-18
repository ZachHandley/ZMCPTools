#!/bin/bash

# Claude Hooks: Package File Change Detection
# Automatically runs installer when package files are modified

# List of package configuration files that should trigger installation
PACKAGE_FILES=(
    "package.json"
    "package-lock.json"
    "yarn.lock"
    "pnpm-lock.yaml"
    "bun.lockb"
    "pubspec.yaml"
    "pyproject.toml"
    "requirements.txt"
    "Pipfile"
    "Pipfile.lock"
    "poetry.lock"
    "Cargo.toml"
    "Cargo.lock"
    "go.mod"
    "go.sum"
    "composer.json"
    "composer.lock"
    "Gemfile"
    "Gemfile.lock"
)

# Check if any package files were modified in the current tool call
MODIFIED_FILES=""
for file in "${PACKAGE_FILES[@]}"; do
    if [[ -f "$file" && "$file" -nt "/tmp/claude_last_package_check" ]]; then
        MODIFIED_FILES="$MODIFIED_FILES $file"
    fi
done

# Update timestamp
touch /tmp/claude_last_package_check

# If package files were modified, run the installer
if [[ -n "$MODIFIED_FILES" ]]; then
    echo "📦 Package files modified:$MODIFIED_FILES"
    echo "🔄 Running ZMCPTools installer to ensure dependencies are up to date..."
    
    # Check if zmcp-tools command is available
    if command -v zmcp-tools >/dev/null 2>&1; then
        echo "⚡ Running: zmcp-tools install --project-only"
        zmcp-tools install --project-only
    elif command -v claude-mcp-server >/dev/null 2>&1; then
        echo "⚡ Running: claude-mcp-server install --project-only"
        claude-mcp-server install --project-only
    else
        echo "⚠️  ZMCPTools installer not found globally. Consider running: npm install -g ."
        echo "   Or running installation manually from the project directory."
    fi
    
    echo "✅ Package update processing complete"
fi

exit 0