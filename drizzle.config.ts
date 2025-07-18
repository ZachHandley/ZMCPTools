import { defineConfig } from 'drizzle-kit';
import { join } from 'path';
import { homedir } from 'os';

// Use absolute paths to avoid path resolution issues
const migrationsDir = join(homedir(), '.mcptools', 'data', 'migrations');
const dbPath = join(homedir(), '.mcptools', 'data', 'claude_mcp_tools.db');

const config = defineConfig({
  schema: './src/schemas/*.ts',
  out: migrationsDir,
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
  verbose: true,
  strict: true,
});

export default config;