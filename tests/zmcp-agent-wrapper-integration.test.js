import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('zmcp-agent-wrapper integration', () => {
  let originalTitle;
  
  beforeEach(() => {
    originalTitle = process.title;
  });
  
  afterEach(() => {
    process.title = originalTitle;
  });

  it('should execute wrapper script with proper process title', (done) => {
    const wrapperPath = join(__dirname, '..', 'zmcp-agent-wrapper.cjs');
    
    // Test that the wrapper sets process title correctly
    const child = spawn('node', [
      wrapperPath,
      'backend',
      'test-project',
      'test123',
      '--',
      'node',
      '-e',
      'console.log(process.title); setTimeout(() => {}, 100)'
    ]);
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('exit', () => {
      expect(output).toContain('[ZMCP Wrapper] Setting process title: zmcp-be-test-project-test123');
      expect(output).toContain('zmcp-be-test-project-test123');
      done();
    });
  });

  it('should forward environment variables', (done) => {
    const wrapperPath = join(__dirname, '..', 'zmcp-agent-wrapper.cjs');
    
    const child = spawn('node', [
      wrapperPath,
      'frontend',
      'env-test',
      'env123',
      '--',
      'node',
      '-e',
      'console.log(JSON.stringify({type: process.env.ZMCP_AGENT_TYPE, project: process.env.ZMCP_PROJECT_CONTEXT, id: process.env.ZMCP_AGENT_ID, title: process.env.ZMCP_PROCESS_TITLE}))'
    ]);
    
    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('exit', () => {
      const envMatch = output.match(/\{.*\}/);
      if (envMatch) {
        const env = JSON.parse(envMatch[0]);
        expect(env.type).toBe('frontend');
        expect(env.project).toBe('env-test');
        expect(env.id).toBe('env123');
        expect(env.title).toBe('zmcp-fe-env-test-env123');
      }
      done();
    });
  });

  it('should handle errors gracefully', (done) => {
    const wrapperPath = join(__dirname, '..', 'zmcp-agent-wrapper.cjs');
    
    const child = spawn('node', [
      wrapperPath,
      'backend',
      'error-test',
      'err123',
      '--',
      'nonexistent-command-that-should-fail'
    ]);
    
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('exit', (code) => {
      expect(code).toBe(1);
      expect(stderr).toContain('[ZMCP Wrapper] Failed to start process');
      done();
    });
  });

  it('should show usage when called incorrectly', (done) => {
    const wrapperPath = join(__dirname, '..', 'zmcp-agent-wrapper.cjs');
    
    const child = spawn('node', [wrapperPath, 'backend']);
    
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('exit', (code) => {
      expect(code).toBe(1);
      expect(stderr).toContain('Usage: zmcp-agent-wrapper.js');
      done();
    });
  });
});