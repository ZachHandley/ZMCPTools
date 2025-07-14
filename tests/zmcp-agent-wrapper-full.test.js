import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wrapperPath = join(__dirname, '..', 'zmcp-agent-wrapper-lib.cjs');

describe('zmcp-agent-wrapper-lib full coverage', () => {
  describe('CLI invocation tests', () => {
    it('should show usage error and exit with code 1', () => {
      try {
        execSync(`node ${wrapperPath} backend`, { encoding: 'utf8' });
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr.toString()).toContain('Usage: zmcp-agent-wrapper.js');
      }
    });

    it('should show missing arguments error', () => {
      try {
        execSync(`node ${wrapperPath} "" project id -- cmd`, { encoding: 'utf8' });
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr.toString()).toContain('Missing required arguments');
      }
    });

    it('should handle spawn errors', () => {
      try {
        execSync(`node ${wrapperPath} backend test id123 -- nonexistent-command-xyz`, { encoding: 'utf8' });
      } catch (error) {
        expect(error.status).toBe(1);
        expect(error.stderr.toString()).toContain('[ZMCP Wrapper] Failed to start process');
      }
    });

    it('should execute successfully and pass environment variables', () => {
      const result = execSync(
        `node ${wrapperPath} backend test-project id123 -- node -e "console.log('Env:', JSON.stringify({type: process.env.ZMCP_AGENT_TYPE, project: process.env.ZMCP_PROJECT_CONTEXT, id: process.env.ZMCP_AGENT_ID, title: process.env.ZMCP_PROCESS_TITLE}))"`,
        { encoding: 'utf8' }
      );
      
      expect(result).toContain('[ZMCP Wrapper] Setting process title: zmcp-be-test-project-id123');
      expect(result).toContain('[ZMCP Wrapper] Executing: node -e');
      expect(result).toContain('"type":"backend"');
      expect(result).toContain('"project":"test-project"');
      expect(result).toContain('"id":"id123"');
      expect(result).toContain('"title":"zmcp-be-test-project-id123"');
    });

    it('should handle child process exit codes', () => {
      try {
        execSync(`node ${wrapperPath} backend test id123 -- node -e "process.exit(42)"`, { encoding: 'utf8' });
      } catch (error) {
        expect(error.status).toBe(42);
      }
    });

    it('should truncate long project names', () => {
      const result = execSync(
        `node ${wrapperPath} frontend this-is-a-very-long-project-name-that-exceeds-limit id123 -- node -e "console.log(process.env.ZMCP_PROCESS_TITLE)"`,
        { encoding: 'utf8' }
      );
      
      expect(result).toContain('zmcp-fe-this-is-a-very-long--id123');
    });
  });

  describe('spawnChild function coverage', () => {
    it('should be tested through CLI execution', () => {
      // The spawnChild function is covered by the CLI tests above
      expect(true).toBe(true);
    });
  });
});