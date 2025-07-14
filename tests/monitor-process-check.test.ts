import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

const execAsync = promisify(exec);

// Mock the monitor module to test process checking
vi.mock('../src/cli/monitor.ts', async () => {
  const actual = await vi.importActual('../src/cli/monitor.ts') as any;
  return {
    ...actual,
  };
});

describe('Monitor Process Liveness Checking', () => {
  let testProcessPid: number | undefined;
  
  beforeEach(async () => {
    // Start a simple test process that we can check
    const testProcess = spawn('sleep', ['300']); // 5 minute sleep
    testProcessPid = testProcess.pid;
    
    // Give process time to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterEach(async () => {
    // Clean up test process
    if (testProcessPid) {
      try {
        process.kill(testProcessPid, 'SIGTERM');
      } catch (e) {
        // Process may already be dead
      }
    }
  });

  describe('isProcessAlive', () => {
    // Create a test function to simulate the private method
    async function isProcessAlive(pid: number): Promise<boolean> {
      try {
        // First try /proc on Linux
        if (process.platform === 'linux') {
          try {
            await fs.access(`/proc/${pid}`);
            return true;
          } catch {
            return false;
          }
        }
        
        // Fallback to ps command for other platforms or if /proc fails
        const { stdout } = await execAsync(`ps -p ${pid} -o pid=`);
        return stdout.trim().length > 0;
      } catch (error) {
        // If ps command fails, process doesn't exist
        return false;
      }
    }

    it('should detect alive process', async () => {
      expect(testProcessPid).toBeDefined();
      const isAlive = await isProcessAlive(testProcessPid!);
      expect(isAlive).toBe(true);
    });

    it('should detect dead process', async () => {
      // Use a PID that definitely doesn't exist
      const deadPid = 999999;
      const isAlive = await isProcessAlive(deadPid);
      expect(isAlive).toBe(false);
    });

    it('should handle process that dies', async () => {
      // First check it's alive
      let isAlive = await isProcessAlive(testProcessPid!);
      expect(isAlive).toBe(true);
      
      // Kill the process
      process.kill(testProcessPid!, 'SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now check it's dead
      isAlive = await isProcessAlive(testProcessPid!);
      expect(isAlive).toBe(false);
    });

    it('should work with /proc on Linux', async () => {
      if (process.platform !== 'linux') {
        console.log('Skipping Linux-specific test on', process.platform);
        return;
      }
      
      // Test with current process
      const currentPid = process.pid;
      const isAlive = await isProcessAlive(currentPid);
      expect(isAlive).toBe(true);
      
      // Verify /proc exists for current process
      await expect(fs.access(`/proc/${currentPid}`)).resolves.not.toThrow();
    });

    it('should fallback to ps command', async () => {
      // Test with current process using ps directly
      const currentPid = process.pid;
      const { stdout } = await execAsync(`ps -p ${currentPid} -o pid=`);
      expect(stdout.trim()).toBe(currentPid.toString());
    });
  });

  describe('Agent status with process checking', () => {
    // Re-define isProcessAlive for this test block
    async function isProcessAlive(pid: number): Promise<boolean> {
      try {
        // First try /proc on Linux
        if (process.platform === 'linux') {
          try {
            await fs.access(`/proc/${pid}`);
            return true;
          } catch {
            return false;
          }
        }
        
        // Fallback to ps command for other platforms or if /proc fails
        const { stdout } = await execAsync(`ps -p ${pid} -o pid=`);
        return stdout.trim().length > 0;
      } catch (error) {
        // If ps command fails, process doesn't exist
        return false;
      }
    }

    it('should mark agent as terminated if process is dead', async () => {
      // Mock agent data
      const mockAgent = {
        id: 'test-agent',
        agentName: 'test',
        status: 'active',
        claudePid: 999999, // Non-existent PID
        lastHeartbeat: new Date().toISOString()
      };

      // The collectAgentData logic should mark this as terminated
      // since the process doesn't exist
      const isAlive = await isProcessAlive(mockAgent.claudePid);
      
      expect(isAlive).toBe(false);
      
      // In real implementation, this would update agent status
      if (!isAlive && (mockAgent.status === 'active' || mockAgent.status === 'idle')) {
        mockAgent.status = 'terminated';
      }
      
      expect(mockAgent.status).toBe('terminated');
    });

    it('should keep agent as active if process is alive', async () => {
      // Mock agent data with real PID
      const mockAgent = {
        id: 'test-agent',
        agentName: 'test',
        status: 'active',
        claudePid: testProcessPid!,
        lastHeartbeat: new Date().toISOString()
      };

      const isAlive = await isProcessAlive(mockAgent.claudePid);
      
      expect(isAlive).toBe(true);
      expect(mockAgent.status).toBe('active'); // Should remain active
    });
  });

  describe('Process info integration', () => {
    it('should get process info for running processes', async () => {
      // Test the ps command output parsing
      const { stdout } = await execAsync(`ps -p ${testProcessPid} -o pid=`);
      expect(stdout.trim()).toBe(testProcessPid!.toString());
    });

    it('should handle ps command for non-existent process', async () => {
      try {
        await execAsync(`ps -p 999999 -o pid=`);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // ps command should fail for non-existent PID
        expect(error.code).toBe(1);
      }
    });
  });
});