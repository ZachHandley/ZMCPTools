import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';

// Mock modules
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock console
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process
const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => {});

describe('zmcp-agent-wrapper CLI execution', () => {
  let mockChild;
  let originalArgv;
  let originalTitle;
  let processListeners;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Save originals
    originalArgv = process.argv;
    originalTitle = process.title;
    processListeners = {};
    
    // Mock child process
    mockChild = {
      kill: vi.fn(),
      on: vi.fn((event, handler) => {
        mockChild[`_${event}Handler`] = handler;
      }),
      emit: function(event, ...args) {
        if (this[`_${event}Handler`]) {
          this[`_${event}Handler`](...args);
        }
      }
    };
    
    spawn.mockReturnValue(mockChild);
    
    // Capture process event listeners
    const originalOn = process.on;
    process.on = vi.fn((event, handler) => {
      processListeners[event] = handler;
      return originalOn.call(process, event, handler);
    });
    
    // Clear require cache
    delete require.cache[require.resolve('../zmcp-agent-wrapper-lib.cjs')];
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.title = originalTitle;
    
    // Remove added listeners
    Object.keys(processListeners).forEach(event => {
      process.removeListener(event, processListeners[event]);
    });
  });

  it('should handle valid CLI execution', () => {
    process.argv = ['node', 'wrapper', 'backend', 'oauth', 'id123', '--', 'sleep', '60'];
    
    // Execute the wrapper
    require('../zmcp-agent-wrapper-lib.cjs');
    
    expect(process.title).toBe('zmcp-be-oauth-id123');
    expect(consoleLogSpy).toHaveBeenCalledWith('[ZMCP Wrapper] Setting process title: zmcp-be-oauth-id123');
    expect(consoleLogSpy).toHaveBeenCalledWith('[ZMCP Wrapper] Executing: sleep 60');
    expect(spawn).toHaveBeenCalledWith('sleep', ['60'], expect.any(Object));
  });

  it('should exit with usage error for invalid args', () => {
    process.argv = ['node', 'wrapper', 'backend'];
    
    require('../zmcp-agent-wrapper-lib.cjs');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('Usage: zmcp-agent-wrapper.js <agent-type> <project-context> <agent-id> -- <command...>');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should exit with missing arguments error', () => {
    process.argv = ['node', 'wrapper', '', 'project', 'id', '--', 'cmd'];
    
    require('../zmcp-agent-wrapper-lib.cjs');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('Missing required arguments');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should set up signal forwarding', () => {
    process.argv = ['node', 'wrapper', 'backend', 'api', 'id1', '--', 'sleep'];
    
    require('../zmcp-agent-wrapper-lib.cjs');
    
    // Check that signal handlers were registered
    expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(process.on).toHaveBeenCalledWith('SIGQUIT', expect.any(Function));
    
    // Test signal forwarding
    processListeners.SIGINT();
    expect(mockChild.kill).toHaveBeenCalledWith('SIGINT');
  });

  it('should handle child process exit with code', () => {
    process.argv = ['node', 'wrapper', 'backend', 'api', 'id1', '--', 'sleep'];
    
    require('../zmcp-agent-wrapper-lib.cjs');
    
    // Simulate child exit
    mockChild.emit('exit', 42, null);
    
    expect(processExitSpy).toHaveBeenCalledWith(42);
  });

  it('should handle child process exit with signal', () => {
    process.argv = ['node', 'wrapper', 'backend', 'api', 'id1', '--', 'sleep'];
    
    require('../zmcp-agent-wrapper-lib.cjs');
    
    // Simulate child killed by signal
    mockChild.emit('exit', null, 'SIGTERM');
    
    expect(processKillSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('should handle child process spawn error', () => {
    process.argv = ['node', 'wrapper', 'backend', 'api', 'id1', '--', 'bad-cmd'];
    
    require('../zmcp-agent-wrapper-lib.cjs');
    
    // Simulate spawn error
    const error = new Error('spawn error');
    mockChild.emit('error', error);
    
    expect(consoleErrorSpy).toHaveBeenCalledWith('[ZMCP Wrapper] Failed to start process: spawn error');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should pass environment variables to child', () => {
    process.argv = ['node', 'wrapper', 'testing', 'unit-tests', 'test1', '--', 'npm', 'test'];
    
    require('../zmcp-agent-wrapper-lib.cjs');
    
    expect(spawn).toHaveBeenCalledWith('npm', ['test'], {
      stdio: 'inherit',
      env: expect.objectContaining({
        ZMCP_AGENT_TYPE: 'testing',
        ZMCP_PROJECT_CONTEXT: 'unit-tests',
        ZMCP_AGENT_ID: 'test1',
        ZMCP_PROCESS_TITLE: 'zmcp-ts-unit-tests-test1'
      })
    });
  });
});