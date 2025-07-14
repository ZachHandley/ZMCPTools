import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wrapperPath = join(__dirname, '..', 'zmcp-agent-wrapper-lib.cjs');

describe('zmcp-agent-wrapper signal handling', () => {
  it('should forward signals to child process', (done) => {
    // Start wrapper with a long-running child
    const wrapper = spawn('node', [
      wrapperPath,
      'backend',
      'signal-test',
      'sig123',
      '--',
      'node',
      '-e',
      'setInterval(() => console.log("alive"), 1000); process.on("SIGTERM", () => { console.log("SIGTERM received"); process.exit(0); })'
    ]);

    let output = '';
    wrapper.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Wait for process to start
    setTimeout(() => {
      // Send SIGTERM to wrapper
      wrapper.kill('SIGTERM');
    }, 500);

    wrapper.on('exit', (code, signal) => {
      expect(output).toContain('[ZMCP Wrapper] Setting process title');
      expect(output).toContain('SIGTERM received');
      done();
    });
  }, 10000);

  it('should handle SIGINT signal', (done) => {
    const wrapper = spawn('node', [
      wrapperPath,
      'frontend',
      'sigint-test',
      'int123',
      '--',
      'node',
      '-e',
      'setInterval(() => {}, 1000); process.on("SIGINT", () => { console.log("SIGINT received"); process.exit(0); })'
    ]);

    let output = '';
    wrapper.stdout.on('data', (data) => {
      output += data.toString();
    });

    setTimeout(() => {
      wrapper.kill('SIGINT');
    }, 500);

    wrapper.on('exit', () => {
      expect(output).toContain('SIGINT received');
      done();
    });
  }, 10000);

  it('should handle child process killed by signal', (done) => {
    const wrapper = spawn('node', [
      wrapperPath,
      'testing',
      'kill-test',
      'kill123',
      '--',
      'node',
      '-e',
      'setTimeout(() => process.kill(process.pid, "SIGUSR1"), 100)'
    ]);

    wrapper.on('exit', (code, signal) => {
      // The wrapper should exit with a signal when child is killed by signal
      expect(signal || code).toBeTruthy();
      done();
    });
  }, 10000);
});